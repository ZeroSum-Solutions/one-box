import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const FROZEN_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "desktop", width: 1440, height: 900 }),
  Object.freeze({ id: "tablet", width: 768, height: 1024 }),
  Object.freeze({ id: "mobile", width: 390, height: 844 }),
]);
const MAX_STATIC_FILE_BYTES = 100 * 1024 * 1024;
const MAX_STATIC_TOTAL_BYTES = 100 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DARWIN_BROWSER_SANDBOX_PROFILE_PREFIX = [
  "(version 1)",
  "(allow default)",
  "(deny network*)",
  "(allow network-inbound (local tcp \"localhost:*\"))",
  "(allow network-outbound (remote tcp \"localhost:*\"))",
];
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function darwinBrowserSandboxProfile(temporaryDirectories) {
  if (
    !Array.isArray(temporaryDirectories) ||
    temporaryDirectories.length === 0 ||
    temporaryDirectories.some((directory) =>
      !path.isAbsolute(directory) || directory.includes('"')
    )
  ) {
    throw new Error("Browser sandbox temporary directories must be absolute quote-free paths");
  }
  return [
    ...DARWIN_BROWSER_SANDBOX_PROFILE_PREFIX,
    ...temporaryDirectories.map(
      (directory) => `(allow network-bind (local unix-socket (path-prefix "${directory}/")))`,
    ),
  ].join(" ");
}

function browserEnvironment(homeDirectory, temporaryDirectory) {
  const environment = {
    HOME: homeDirectory,
    TMPDIR: `${temporaryDirectory}/`,
  };
  for (const name of ["LANG", "LC_ALL", "LC_CTYPE", "PATH"]) {
    if (typeof process.env[name] === "string") environment[name] = process.env[name];
  }
  return environment;
}

async function launchCredentialFreeChromium() {
  if (process.platform !== "darwin") {
    throw new Error("Browser evidence requires an OS network sandbox on this platform");
  }
  const launcherRoot = await fs.mkdtemp(
    "/tmp/one-box-page-ir-browser-launcher-",
  );
  const homeDirectory = path.join(launcherRoot, "home");
  const temporaryDirectory = path.join(launcherRoot, "tmp");
  await fs.mkdir(homeDirectory, { mode: 0o700 });
  await fs.mkdir(temporaryDirectory, { mode: 0o700 });
  const physicalTemporaryDirectory = await fs.realpath(temporaryDirectory);
  const physicalSystemTemporaryDirectory = await fs.realpath(os.tmpdir());
  const launcherPath = path.join(launcherRoot, "chromium-sandboxed");
  const sandboxProfile = darwinBrowserSandboxProfile([
    physicalTemporaryDirectory,
    physicalSystemTemporaryDirectory,
  ]);
  const script = [
    "#!/bin/sh",
    `exec /usr/bin/sandbox-exec -p ${shellQuote(sandboxProfile)} ${shellQuote(chromium.executablePath())} "$@"`,
    "",
  ].join("\n");
  try {
    await fs.writeFile(launcherPath, script, { flag: "wx", mode: 0o500 });
    const browser = await chromium.launch({
      executablePath: launcherPath,
      env: browserEnvironment(homeDirectory, physicalTemporaryDirectory),
    });
    return { browser, launcherRoot };
  } catch (error) {
    await fs.rm(launcherRoot, { recursive: true, force: true });
    throw error;
  }
}

function isCode(error, code) {
  return error && typeof error === "object" && error.code === code;
}

function assertDirectory(stat, label) {
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a regular non-symlink directory`);
  }
}

function assertRegularFile(stat, label) {
  const one = typeof stat.nlink === "bigint" ? 1n : 1;
  const maximumBytes = typeof stat.size === "bigint"
    ? BigInt(MAX_STATIC_FILE_BYTES)
    : MAX_STATIC_FILE_BYTES;
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== one) {
    throw new Error(`${label} must be one regular non-symlink non-hardlink file`);
  }
  if (stat.size > maximumBytes) {
    throw new Error(`${label} exceeds the static evidence byte bound`);
  }
}

function statSnapshot(relativePath, stat, type) {
  return {
    relativePath,
    type,
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  };
}

function sameSnapshot(left, right) {
  return left.relativePath === right.relativePath &&
    left.type === right.type &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

async function collectClosedStaticRoot(siteRoot) {
  if (typeof siteRoot !== "string" || !path.isAbsolute(siteRoot)) {
    throw new Error("Browser evidence siteRoot must be an absolute path");
  }
  const suppliedRoot = path.resolve(siteRoot);
  const suppliedStat = await fs.lstat(suppliedRoot, { bigint: true });
  assertDirectory(suppliedStat, "Browser evidence site root");
  const root = await fs.realpath(suppliedRoot);
  const rootStat = await fs.lstat(root, { bigint: true });
  assertDirectory(rootStat, "Browser evidence site root");
  if (rootStat.dev !== suppliedStat.dev || rootStat.ino !== suppliedStat.ino) {
    throw new Error("Browser evidence site root changed during canonicalization");
  }
  let totalBytes = 0n;
  let foundIndex = false;
  const directories = [];
  const files = [];
  async function visit(directory, directoryRelativePath) {
    const directoryStat = await fs.lstat(directory, { bigint: true });
    assertDirectory(directoryStat, `Static site directory ${directoryRelativePath || "."}`);
    directories.push(statSnapshot(directoryRelativePath, directoryStat, "directory"));
    const entries = (await fs.readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const stat = await fs.lstat(absolute, { bigint: true });
      const relative = directoryRelativePath
        ? `${directoryRelativePath}/${entry.name}`
        : entry.name;
      if (stat.isSymbolicLink()) throw new Error(`Static site contains a symlink: ${relative}`);
      if (stat.isDirectory()) {
        await visit(absolute, relative);
        continue;
      }
      assertRegularFile(stat, `Static site file ${relative}`);
      files.push({ ...statSnapshot(relative, stat, "file"), absolute });
      totalBytes += stat.size;
      if (totalBytes > BigInt(MAX_STATIC_TOTAL_BYTES)) {
        throw new Error("Static site exceeds the evidence byte bound");
      }
      if (relative === "index.html") foundIndex = true;
    }
  }
  await visit(root, "");
  if (!foundIndex) throw new Error("Static site requires index.html");
  return { root, directories, files };
}

function assertSameStaticGeneration(before, after) {
  if (
    before.directories.length !== after.directories.length ||
    before.files.length !== after.files.length ||
    before.directories.some((entry, index) => !sameSnapshot(entry, after.directories[index])) ||
    before.files.some((entry, index) => !sameSnapshot(entry, after.files[index]))
  ) {
    throw new Error("Static site generation changed while the browser snapshot was created");
  }
}

async function snapshotClosedStaticRoot(siteRoot) {
  const source = await collectClosedStaticRoot(siteRoot);
  const snapshotRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "one-box-page-ir-browser-site-snapshot-"),
  );
  try {
    for (const directory of source.directories.slice(1)) {
      await fs.mkdir(path.join(snapshotRoot, ...directory.relativePath.split("/")), {
        mode: 0o700,
      });
    }
    const inventory = [];
    for (const file of source.files) {
      const bytes = await readStableRegularFile(file.absolute, source.root, file);
      const target = path.join(snapshotRoot, ...file.relativePath.split("/"));
      await writeExclusiveReadOnly(target, bytes);
      inventory.push({
        path: file.relativePath,
        sizeBytes: bytes.byteLength,
        sha256: sha256(bytes),
      });
    }
    assertSameStaticGeneration(source, await collectClosedStaticRoot(source.root));
    const snapshot = await collectClosedStaticRoot(snapshotRoot);
    if (
      snapshot.files.length !== inventory.length ||
      snapshot.files.some((file, index) => file.relativePath !== inventory[index].path)
    ) {
      throw new Error("Browser static snapshot inventory is not closed");
    }
    for (const [index, file] of snapshot.files.entries()) {
      const bytes = await readStableRegularFile(file.absolute, snapshot.root, file);
      if (
        bytes.byteLength !== inventory[index].sizeBytes ||
        sha256(bytes) !== inventory[index].sha256
      ) {
        throw new Error(`Browser static snapshot hash mismatch: ${file.relativePath}`);
      }
    }
    return { root: snapshotRoot, inventory };
  } catch (error) {
    await fs.rm(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
}

async function readStableRegularFile(filePath, root, expectedIdentity) {
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Static request escapes the supplied site root");
  }
  const initial = await fs.lstat(filePath, { bigint: true });
  assertRegularFile(initial, `Static request ${relative}`);
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await fs.open(filePath, flags);
  try {
    const before = await handle.stat({ bigint: true });
    assertRegularFile(before, `Static request ${relative}`);
    if (before.dev !== initial.dev || before.ino !== initial.ino) {
      throw new Error("Static request changed before open");
    }
    if (
      expectedIdentity &&
      (before.dev !== expectedIdentity.dev || before.ino !== expectedIdentity.ino)
    ) {
      throw new Error("Static site generation changed before snapshot read");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      BigInt(bytes.byteLength) !== after.size
    ) {
      throw new Error("Static request changed while being read");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function requestFilePath(root, rawUrl) {
  const parsed = new URL(rawUrl ?? "/", "http://127.0.0.1");
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    throw new Error("Static request path is not valid URL encoding");
  }
  if (pathname.includes("\0") || pathname.includes("\\")) {
    throw new Error("Static request path is unsafe");
  }
  if (pathname === "/") pathname = "/index.html";
  const relative = pathname.replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Static request escapes the supplied site root");
  }
  return resolved;
}

async function startStaticServer(root, rejectedStaticRequests) {
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405).end();
        return;
      }
      const filePath = requestFilePath(root, request.url);
      const bytes = await readStableRegularFile(filePath, root);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-length": bytes.byteLength,
        "content-type": MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      const status = isCode(error, "ENOENT") ? 404 : 400;
      if (status === 400) rejectedStaticRequests.add(request.url ?? "/");
      response.writeHead(status, {
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("Static evidence request rejected");
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
  } catch (error) {
    server.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Static evidence server did not bind TCP");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function validateSelectors(value, label) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 32 ||
    new Set(value).size !== value.length ||
    value.some((selector) => typeof selector !== "string" || selector.length === 0 || selector.length > 200)
  ) {
    throw new Error(`${label} must be a bounded nonempty unique selector list`);
  }
  return [...value];
}

async function writeExclusiveReadOnly(filePath, bytes) {
  const handle = await fs.open(filePath, "wx", 0o400);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function selectorObservations(page, selectors, kind) {
  const observations = [];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count();
    const present = count > 0;
    const visible = present ? await locator.isVisible() : false;
    const text = present
      ? (await locator.innerText()).replace(/\s+/g, " ").trim()
      : "";
    observations.push({
      selector,
      present,
      visible,
      ...(kind === "action" ? { href: present ? await locator.getAttribute("href") : null } : {}),
      text,
    });
  }
  return observations;
}

async function navigationLinks(page) {
  return page.locator("nav a[href], a[href]").evaluateAll((elements) =>
    elements.map((element) => ({
      href: element.getAttribute("href"),
      text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
    })),
  );
}

async function captureScenario({ browser, origin, packetRoot, scenario, selectors, attemptedExternalUrls }) {
  const context = await browser.newContext({
    viewport: { width: scenario.viewport.width, height: scenario.viewport.height },
    javaScriptEnabled: scenario.javascriptEnabled,
    reducedMotion: scenario.reducedMotion,
    serviceWorkers: "block",
  });
  const blockedRequests = [];
  await context.route("**/*", async (route) => {
    const requested = new URL(route.request().url());
    if (requested.origin !== origin) {
      blockedRequests.push(requested.href);
      attemptedExternalUrls.add(requested.href);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await context.routeWebSocket("**/*", async (webSocket) => {
    const requested = new URL(webSocket.url());
    if (requested.origin !== origin) {
      blockedRequests.push(requested.href);
      attemptedExternalUrls.add(requested.href);
    }
    await webSocket.close({ code: 1008, reason: "Browser evidence blocks WebSocket transport" });
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const metricTasks = [];
  let totalTransferBytes = 0;
  let imageTransferBytes = 0;
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (!response.url().startsWith(origin)) return;
    metricTasks.push(response.request().sizes().then((sizes) => {
      const bytes = Math.max(0, sizes.responseBodySize) + Math.max(0, sizes.responseHeadersSize);
      totalTransferBytes += bytes;
      if ((response.headers()["content-type"] ?? "").startsWith("image/")) imageTransferBytes += bytes;
    }));
  });
  try {
    const response = await page.goto(`${origin}/index.html`, { waitUntil: "load", timeout: 15_000 });
    await page.waitForTimeout(25);
    await Promise.all(metricTasks);
    const [domContentLoadedMs, javascriptMarker, reducedMotionMatches, motionObservations, serviceWorkerRegistrations] = await page.evaluate(async () => {
      const navigation = performance.getEntriesByType("navigation")[0];
      return [
        navigation ? Math.round(navigation.domContentLoadedEventEnd) : -1,
        document.documentElement.dataset.js ?? null,
        matchMedia("(prefers-reduced-motion: reduce)").matches,
        [...document.querySelectorAll("[id]")].slice(0, 256).map((element) => {
          const style = getComputedStyle(element);
          return {
            id: element.id,
            animationDuration: style.animationDuration,
            transitionDuration: style.transitionDuration,
          };
        }),
        "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
      ];
    });
    const screenshotRelativePath = `screenshots/${scenario.id}.png`;
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    if (!screenshot.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new Error("Playwright did not produce a PNG screenshot");
    }
    await writeExclusiveReadOnly(path.join(packetRoot, screenshotRelativePath), screenshot);
    return {
      id: scenario.id,
      viewport: { ...scenario.viewport },
      javascriptEnabled: scenario.javascriptEnabled,
      reducedMotion: scenario.reducedMotion,
      navigation: {
        path: new URL(page.url()).pathname,
        status: response?.status() ?? null,
        links: await navigationLinks(page),
      },
      coreContent: await selectorObservations(page, selectors.core, "core"),
      primaryActions: await selectorObservations(page, selectors.actions, "action"),
      javascriptMarker,
      reducedMotionMatches,
      motionObservations,
      serviceWorkerRegistrations,
      consoleErrors,
      pageErrors,
      blockedRequests: [...new Set(blockedRequests)].sort(),
      metrics: { domContentLoadedMs, totalTransferBytes, imageTransferBytes },
      screenshot: {
        path: screenshotRelativePath,
        sizeBytes: screenshot.byteLength,
        sha256: sha256(screenshot),
      },
    };
  } finally {
    await context.close();
  }
}

export function validateBrowserEvidenceViewports(viewports) {
  const received = Array.isArray(viewports)
    ? new Map(viewports.map((entry) => [entry?.id, entry]))
    : new Map();
  const valid = Array.isArray(viewports) &&
    viewports.length === FROZEN_VIEWPORTS.length &&
    received.size === FROZEN_VIEWPORTS.length &&
    FROZEN_VIEWPORTS.every((expected) => {
      const actual = received.get(expected.id);
      return actual &&
        Object.keys(actual).sort().join(",") === "height,id,width" &&
        actual.width === expected.width &&
        actual.height === expected.height;
    });
  if (!valid) throw new Error("Browser evidence requires the exact frozen browser evidence viewports");
  return FROZEN_VIEWPORTS.map((viewport) => ({ ...viewport }));
}

export async function capturePageIrBrowserEvidence(input) {
  const viewports = validateBrowserEvidenceViewports(input?.viewports);
  const selectors = {
    core: validateSelectors(input?.coreContentSelectors, "coreContentSelectors"),
    actions: validateSelectors(input?.primaryActionSelectors, "primaryActionSelectors"),
  };
  const siteSnapshot = await snapshotClosedStaticRoot(input?.siteRoot);
  let packetRoot;
  let server;
  let browser;
  let browserLauncherRoot;
  let complete = false;
  try {
    packetRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-page-ir-browser-evidence-"));
    await fs.mkdir(path.join(packetRoot, "screenshots"), { mode: 0o700 });
    const rejectedStaticRequests = new Set();
    server = await startStaticServer(siteSnapshot.root, rejectedStaticRequests);
    ({ browser, launcherRoot: browserLauncherRoot } = await launchCredentialFreeChromium());
    const attemptedExternalUrls = new Set();
    const scenarios = [
      ...viewports.map((viewport) => ({
        id: viewport.id,
        viewport,
        javascriptEnabled: true,
        reducedMotion: "no-preference",
      })),
      {
        id: "no-js",
        viewport: viewports[0],
        javascriptEnabled: false,
        reducedMotion: "no-preference",
      },
      {
        id: "reduced-motion",
        viewport: viewports[0],
        javascriptEnabled: true,
        reducedMotion: "reduce",
      },
    ];
    const captures = [];
    for (const scenario of scenarios) {
      captures.push(await captureScenario({
        browser,
        origin: server.origin,
        packetRoot,
        scenario,
        selectors,
        attemptedExternalUrls,
      }));
    }
    const inventory = captures
      .map((capture) => ({ ...capture.screenshot }))
      .sort((left, right) => left.path.localeCompare(right.path));
    const evidence = {
      schemaVersion: 1,
      providerCalls: 0,
      networkIsolation: "darwin-sandbox-exec-loopback-only",
      viewports,
      attemptedExternalUrls: [...attemptedExternalUrls].sort(),
      rejectedStaticRequests: [...rejectedStaticRequests].sort(),
      siteInventory: siteSnapshot.inventory,
      captures,
      inventory,
    };
    const evidencePath = path.join(packetRoot, "browser-evidence.json");
    await writeExclusiveReadOnly(
      evidencePath,
      Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8"),
    );
    complete = true;
    return { packetRoot, evidencePath, evidence };
  } finally {
    try {
      await browser?.close();
    } finally {
      try {
        if (browserLauncherRoot) {
          await fs.rm(browserLauncherRoot, { recursive: true, force: true });
        }
      } finally {
        try {
          await server?.close();
        } finally {
          try {
            await fs.rm(siteSnapshot.root, { recursive: true, force: true });
          } finally {
            if (!complete && packetRoot) {
              await fs.rm(packetRoot, { recursive: true, force: true });
            }
          }
        }
      }
    }
  }
}
