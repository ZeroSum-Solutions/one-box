import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const FROZEN_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "desktop", width: 1440, height: 900 }),
  Object.freeze({ id: "tablet", width: 768, height: 1024 }),
  Object.freeze({ id: "mobile", width: 390, height: 844 }),
]);
const MAX_STATIC_FILE_BYTES = 100 * 1024 * 1024;
const MAX_STATIC_TOTAL_BYTES = 100 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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

function validateBrowserAuthorityContract(value) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).sort().join(",") !==
      "bundleSha256,executableRelativePath,fileCount,revision,symlinkCount,totalBytes" ||
    !/^[0-9]+$/.test(value.revision ?? "") ||
    typeof value.executableRelativePath !== "string" ||
    value.executableRelativePath.length === 0 || path.isAbsolute(value.executableRelativePath) ||
    value.executableRelativePath.split(/[\\/]/).includes("..") ||
    !/^[a-f0-9]{64}$/.test(value.bundleSha256 ?? "") ||
    !Number.isSafeInteger(value.fileCount) || value.fileCount <= 0 ||
    !Number.isSafeInteger(value.symlinkCount) || value.symlinkCount < 0 ||
    !Number.isSafeInteger(value.totalBytes) || value.totalBytes <= 0
  ) throw new Error("Browser evidence browser authority contract is invalid");
  return structuredClone(value);
}

function playwrightChromiumBundleRoot(executablePath) {
  let current = path.dirname(executablePath);
  while (
    path.dirname(current) !== current &&
    !/^chromium(?:_headless_shell)?-[0-9]+$/.test(path.basename(current))
  ) {
    current = path.dirname(current);
  }
  if (!/^chromium(?:_headless_shell)?-[0-9]+$/.test(path.basename(current))) {
    throw new Error("Browser evidence Chromium bundle authority is invalid");
  }
  return current;
}

async function playwrightHeadlessShellExecutable() {
  const chromiumExecutable = await fs.realpath(chromium.executablePath());
  const chromiumRoot = playwrightChromiumBundleRoot(chromiumExecutable);
  const revision = path.basename(chromiumRoot).slice("chromium-".length);
  if (!/^[0-9]+$/.test(revision)) {
    throw new Error("Browser evidence Chromium revision is invalid");
  }
  return fs.realpath(path.join(
    path.dirname(chromiumRoot),
    `chromium_headless_shell-${revision}`,
    "chrome-headless-shell-mac-arm64",
    "chrome-headless-shell",
  ));
}

async function hashClosedChromiumBundle(bundleRoot) {
  const physicalRoot = await fs.realpath(bundleRoot);
  const rootStat = await fs.lstat(physicalRoot, { bigint: true });
  assertDirectory(rootStat, "Browser evidence Chromium bundle");
  const records = [];
  let fileCount = 0;
  let symlinkCount = 0;
  let totalBytes = 0;
  async function visit(directory, relativeDirectory) {
    const entries = (await fs.readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const stat = await fs.lstat(absolute, { bigint: true });
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        await visit(absolute, relative);
        continue;
      }
      if (stat.isSymbolicLink()) {
        const target = await fs.readlink(absolute);
        const resolvedTarget = path.resolve(path.dirname(absolute), target);
        if (resolvedTarget !== physicalRoot && !resolvedTarget.startsWith(`${physicalRoot}${path.sep}`)) {
          throw new Error(`Chromium bundle symlink escapes authority: ${relative}`);
        }
        const after = await fs.lstat(absolute, { bigint: true });
        if (!after.isSymbolicLink() || stat.dev !== after.dev || stat.ino !== after.ino || target !== await fs.readlink(absolute)) {
          throw new Error(`Chromium bundle symlink changed during hashing: ${relative}`);
        }
        records.push(`L\0${relative}\0${target}\0`);
        symlinkCount += 1;
        continue;
      }
      assertRegularFile(stat, `Chromium bundle file ${relative}`, 512 * 1024 * 1024);
      const bytes = await readStableRegularFile(absolute, physicalRoot, {
        ...statSnapshot(relative, stat, "file"),
        absolute,
      }, 512 * 1024 * 1024);
      records.push(`F\0${relative}\0${bytes.length}\0${sha256(bytes)}\0`);
      fileCount += 1;
      totalBytes += bytes.length;
    }
  }
  await visit(physicalRoot, "");
  return {
    bundleSha256: sha256(Buffer.from(records.join(""), "utf8")),
    fileCount,
    symlinkCount,
    totalBytes,
  };
}

export async function inspectPageIrBrowserAuthority() {
  if (Object.hasOwn(process.env, "PLAYWRIGHT_BROWSERS_PATH")) {
    throw new Error("Browser evidence rejects PLAYWRIGHT_BROWSERS_PATH overrides");
  }
  const executablePath = await playwrightHeadlessShellExecutable();
  const bundleRoot = playwrightChromiumBundleRoot(executablePath);
  const revision = path.basename(bundleRoot).slice("chromium_headless_shell-".length);
  const executableRelativePath = path.relative(bundleRoot, executablePath).split(path.sep).join("/");
  if (executableRelativePath.startsWith("../") || path.isAbsolute(executableRelativePath)) {
    throw new Error("Browser evidence Chromium executable escapes its bundle");
  }
  return {
    executablePath,
    bundleRoot,
    binding: {
      revision,
      executableRelativePath,
      ...await hashClosedChromiumBundle(bundleRoot),
    },
  };
}

function assertBrowserAuthorityMatches(actual, expected) {
  if (JSON.stringify(actual.binding) !== JSON.stringify(expected)) {
    throw new Error("Browser evidence Chromium bundle does not match the frozen authority");
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function darwinDelegatedBrowserSandboxProfile({
  browserBundleRoot,
  readableRoot,
  temporaryDirectory,
  allowedLoopbackPort,
}) {
  for (const [label, directory] of [
    ["browser bundle", browserBundleRoot],
    ["readable root", readableRoot],
    ["temporary directory", temporaryDirectory],
  ]) {
    if (!path.isAbsolute(directory) || /["\\\0\r\n]/.test(directory)) {
      throw new Error(`Delegated browser ${label} is invalid`);
    }
  }
  if (
    allowedLoopbackPort !== undefined &&
    (!Number.isInteger(allowedLoopbackPort) || allowedLoopbackPort < 1 || allowedLoopbackPort > 65535)
  ) throw new Error("Delegated browser loopback authority is invalid");
  const readRoots = [browserBundleRoot, readableRoot, temporaryDirectory];
  const readAncestors = new Set();
  for (const root of readRoots) {
    let ancestor = path.dirname(root);
    while (ancestor !== path.dirname(ancestor)) {
      readAncestors.add(ancestor);
      ancestor = path.dirname(ancestor);
    }
  }
  return [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    ...(allowedLoopbackPort === undefined ? [] : [
      `(allow network-outbound (remote tcp "localhost:${allowedLoopbackPort}"))`,
    ]),
    ...[
      "/Applications",
      "/Library",
      "/Users",
      "/Volumes",
      "/opt",
      "/private/etc",
      "/private/opt",
      "/private/tmp",
      "/private/var",
      "/usr/local",
    ].flatMap((directory) => [
      `(deny file-read* (subpath "${directory}"))`,
      `(deny file-write* (subpath "${directory}"))`,
    ]),
    ...[...readAncestors].map((directory) =>
      `(allow file-read-metadata (literal "${directory}"))`
    ),
    ...readRoots.flatMap((directory) => [
      `(allow file-read* (literal "${directory}"))`,
      `(allow file-read* (subpath "${directory}"))`,
    ]),
    `(allow file-write* (literal "${temporaryDirectory}"))`,
    `(allow file-write* (subpath "${temporaryDirectory}"))`,
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

async function launchCredentialFreeChromium(
  executablePath,
  { browserBundleRoot, delegatedReadableRoot, allowedLoopbackPort, server = false } = {},
) {
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
  try {
    const environment = browserEnvironment(homeDirectory, physicalTemporaryDirectory);
    const launcherPath = path.join(launcherRoot, "chromium-sandboxed");
    const delegatedProfile = path.join(launcherRoot, "delegated-profile");
    if (!browserBundleRoot || !delegatedReadableRoot) {
      throw new Error("Browser launch requires delegated filesystem authority");
    }
    const sandboxProfile = darwinDelegatedBrowserSandboxProfile({
      browserBundleRoot,
      readableRoot: delegatedReadableRoot,
      temporaryDirectory: await fs.realpath(launcherRoot),
      allowedLoopbackPort,
    });
    const script = [
      "#!/bin/sh",
      `exec /usr/bin/sandbox-exec -p ${shellQuote(sandboxProfile)} ${shellQuote(executablePath)} "$@"${
        ` --user-data-dir=${shellQuote(delegatedProfile)}`
      }`,
      "",
    ].join("\n");
    await fs.writeFile(launcherPath, script, { flag: "wx", mode: 0o500 });
    executablePath = launcherPath;
    const browser = await (server ? chromium.launchServer : chromium.launch).call(chromium, {
      executablePath,
      env: environment,
      ...(server ? { host: "127.0.0.1" } : {}),
    });
    return { browser, launcherRoot };
  } catch (error) {
    await fs.rm(launcherRoot, { recursive: true, force: true });
    throw error;
  }
}

async function stopBrowserServer(browserServer) {
  try {
    await browserServer.close();
  } catch (closeError) {
    try {
      await browserServer.kill();
    } catch (killError) {
      const error = new AggregateError(
        [closeError, killError],
        "Unable to terminate the delegated browser server",
      );
      error.browserTerminationConfirmed = false;
      throw error;
    }
  }
}

async function closeLoopbackGuard(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function holdOppositeLoopbackFamily(port) {
  const server = net.createServer((socket) => socket.destroy());
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "::1", resolve);
    });
    return server;
  } catch (error) {
    await closeLoopbackGuard(server).catch(() => {});
    throw error;
  }
}

async function stopBrowserServerAndRemoveLauncher(browserServer, launcherRoot, loopbackGuard) {
  const errors = [];
  let browserTerminationConfirmed = true;
  try {
    await stopBrowserServer(browserServer);
  } catch (error) {
    browserTerminationConfirmed = false;
    errors.push(error);
  }
  try {
    await closeLoopbackGuard(loopbackGuard);
  } catch (error) {
    errors.push(error);
  }
  try {
    await fs.rm(launcherRoot, { recursive: true, force: true });
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) {
    const error = new AggregateError(errors, "Delegated browser cleanup failed");
    error.browserTerminationConfirmed = browserTerminationConfirmed;
    throw error;
  }
}

export async function launchPageIrCredentialFreeBrowserServer(
  expectedAuthority,
  readableRoot,
  { allowedLoopbackPort } = {},
) {
  const browserAuthority = await inspectPageIrBrowserAuthority();
  assertBrowserAuthorityMatches(browserAuthority, expectedAuthority);
  if (typeof readableRoot !== "string" || !path.isAbsolute(readableRoot)) {
    throw new Error("Delegated browser readable root must be one physical directory");
  }
  const requestedReadable = path.resolve(readableRoot);
  const requestedStat = await fs.lstat(requestedReadable, { bigint: true });
  const readable = await fs.realpath(requestedReadable);
  const readableStat = await fs.lstat(readable, { bigint: true });
  if (
    requestedStat.isSymbolicLink() ||
    !requestedStat.isDirectory() ||
    readableStat.isSymbolicLink() ||
    !readableStat.isDirectory() ||
    requestedStat.dev !== readableStat.dev ||
    requestedStat.ino !== readableStat.ino
  ) {
    throw new Error("Delegated browser readable root must be one physical directory");
  }
  const { browser: browserServer, launcherRoot } =
    await launchCredentialFreeChromium(browserAuthority.executablePath, {
      browserBundleRoot: browserAuthority.bundleRoot,
      delegatedReadableRoot: readable,
      allowedLoopbackPort,
      server: true,
    });
  let closed = false;
  let loopbackGuard;
  try {
    const wsEndpoint = browserServer.wsEndpoint();
    const endpoint = new URL(wsEndpoint);
    const port = Number(endpoint.port);
    if (
      endpoint.protocol !== "ws:" ||
      endpoint.hostname !== "127.0.0.1" ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) throw new Error("Browser server did not bind one loopback endpoint");
    loopbackGuard = await holdOppositeLoopbackFamily(port);
    return {
      wsEndpoint,
      port,
      async close() {
        if (closed) return;
        await stopBrowserServerAndRemoveLauncher(browserServer, launcherRoot, loopbackGuard);
        closed = true;
      },
    };
  } catch (error) {
    try {
      await stopBrowserServerAndRemoveLauncher(browserServer, launcherRoot, loopbackGuard);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Delegated browser validation and cleanup failed",
      );
    }
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

function assertRegularFile(stat, label, maximumFileBytes = MAX_STATIC_FILE_BYTES) {
  const one = typeof stat.nlink === "bigint" ? 1n : 1;
  const maximumBytes = typeof stat.size === "bigint"
    ? BigInt(maximumFileBytes)
    : maximumFileBytes;
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

async function readStableRegularFile(
  filePath,
  root,
  expectedIdentity,
  maximumFileBytes = MAX_STATIC_FILE_BYTES,
) {
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Static request escapes the supplied site root");
  }
  const initial = await fs.lstat(filePath, { bigint: true });
  assertRegularFile(initial, `Static request ${relative}`, maximumFileBytes);
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await fs.open(filePath, flags);
  try {
    const before = await handle.stat({ bigint: true });
    assertRegularFile(before, `Static request ${relative}`, maximumFileBytes);
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

function validateFixtureBinding(value) {
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "buildSha256,fixtureId,fixtureManifestSha256" ||
    !/^[a-z][a-z0-9-]{0,79}$/.test(value.fixtureId ?? "") ||
    !/^[a-f0-9]{64}$/.test(value.fixtureManifestSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(value.buildSha256 ?? "")
  ) {
    throw new Error("Browser evidence fixture binding is invalid");
  }
  return { ...value };
}

function candidateBuildSha256(files) {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(String(file.sizeBytes));
    hash.update("\0");
    hash.update(file.sha256);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function validateCandidateBuild(snapshot, fixtureBinding) {
  if (!fixtureBinding) return undefined;
  const manifestPath = path.join(snapshot.root, "candidate-manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    throw new Error("Browser evidence requires a valid candidate-manifest.json");
  }
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    Object.keys(manifest).sort().join(",") !== "buildSha256,entry,files,schemaVersion,totalBytes" ||
    manifest.schemaVersion !== 1 ||
    manifest.entry !== "index.html" ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    !Number.isSafeInteger(manifest.totalBytes) ||
    manifest.totalBytes < 0 ||
    !/^[a-f0-9]{64}$/.test(manifest.buildSha256 ?? "")
  ) throw new Error("Browser evidence candidate manifest is invalid");
  let previousPath;
  let totalBytes = 0;
  for (const file of manifest.files) {
    if (
      !file ||
      typeof file !== "object" ||
      Array.isArray(file) ||
      Object.keys(file).sort().join(",") !== "path,sha256,sizeBytes" ||
      typeof file.path !== "string" ||
      file.path.length === 0 ||
      path.isAbsolute(file.path) ||
      file.path.split(/[\\/]/).includes("..") ||
      (previousPath !== undefined && file.path <= previousPath) ||
      !Number.isSafeInteger(file.sizeBytes) ||
      file.sizeBytes < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256 ?? "")
    ) throw new Error("Browser evidence candidate manifest file inventory is invalid");
    previousPath = file.path;
    totalBytes += file.sizeBytes;
  }
  const actualFiles = snapshot.inventory
    .filter((file) => file.path !== "candidate-manifest.json")
    .sort((left, right) => left.path.localeCompare(right.path));
  if (
    totalBytes !== manifest.totalBytes ||
    !manifest.files.some((file) => file.path === manifest.entry) ||
    JSON.stringify(actualFiles) !== JSON.stringify(manifest.files) ||
    candidateBuildSha256(manifest.files) !== manifest.buildSha256 ||
    manifest.buildSha256 !== fixtureBinding.buildSha256
  ) throw new Error("Browser evidence site does not match the frozen candidate build");
  return manifest.buildSha256;
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

function durationIsZero(value) {
  return value.split(",").every((part) => {
    const normalized = part.trim();
    return normalized === "0s" || normalized === "0ms";
  });
}

async function collectQualificationMeasurements(
  page,
  scenario,
  selectors,
  motionObservations,
  reducedMotionMatches,
) {
  if (scenario.id === "reduced-motion") {
    const activeMotion = await page.evaluate(() => {
      const isZero = (value) => value.split(",").every((part) => {
        const normalized = part.trim();
        return normalized === "0s" || normalized === "0ms";
      });
      const active = [];
      for (const [index, element] of [...document.querySelectorAll("*")].entries()) {
        const style = getComputedStyle(element);
        if (
          !isZero(style.animationDuration) ||
          !isZero(style.transitionDuration)
        ) {
          active.push({
            index,
            tag: element.tagName.toLowerCase(),
            id: element.id || null,
            animationDuration: style.animationDuration,
            transitionDuration: style.transitionDuration,
          });
        }
        if (active.length >= 20) break;
      }
      return active;
    });
    return {
      reducedMotion: {
        matches: reducedMotionMatches,
        allMotionDisabled:
          activeMotion.length === 0 &&
          motionObservations.every((entry) =>
            durationIsZero(entry.animationDuration) && durationIsZero(entry.transitionDuration)
          ),
        activeMotion,
      },
    };
  }
  if (!FROZEN_VIEWPORTS.some(({ id }) => id === scenario.id)) return undefined;

  const layout = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const overflowingElements = [];
    for (const element of document.querySelectorAll("body *")) {
      const rect = element.getBoundingClientRect();
      if (rect.right > viewportWidth + 1 || rect.left < -1) {
        overflowingElements.push({
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          right: Math.round(rect.right),
          left: Math.round(rect.left),
        });
      }
      if (overflowingElements.length >= 20) break;
    }
    return {
      horizontalOverflow: document.documentElement.scrollWidth > viewportWidth + 1,
      overflowingElements,
    };
  });

  const reachedSelectors = new Set();
  const focusSequence = [];
  for (let index = 0; index < 128 && reachedSelectors.size < selectors.actions.length; index += 1) {
    await page.keyboard.press("Tab");
    const observation = await page.evaluate((expectedSelectors) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return { tag: null, id: null, matched: [] };
      return {
        tag: active.tagName.toLowerCase(),
        id: active.id || null,
        matched: expectedSelectors.filter((selector) => {
          try {
            return active.matches(selector);
          } catch {
            return false;
          }
        }),
      };
    }, selectors.actions);
    for (const selector of observation.matched) reachedSelectors.add(selector);
    focusSequence.push(observation);
  }

  const axe = await new AxeBuilder({ page }).analyze();
  const serializeViolation = (violation) => ({
    id: violation.id,
    impact: violation.impact ?? null,
    nodes: violation.nodes.length,
  });
  return {
    ...layout,
    keyboard: {
      reachedSelectors: [...reachedSelectors].sort(),
      unreachedSelectors: selectors.actions.filter((selector) => !reachedSelectors.has(selector)),
      focusSequence: focusSequence.slice(0, 128),
    },
    accessibility: {
      seriousOrCritical: axe.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .map(serializeViolation),
      colorContrast: axe.violations
        .filter((violation) => violation.id === "color-contrast")
        .map(serializeViolation),
    },
  };
}

async function captureScenario({ browser, origin, packetRoot, scenario, selectors, attemptedExternalUrls, qualificationChecks }) {
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
  const cpuThrottleRate = qualificationChecks && FROZEN_VIEWPORTS.some(({ id }) => id === scenario.id)
    ? 4
    : 1;
  if (cpuThrottleRate > 1) {
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottleRate });
  }
  const consoleErrors = [];
  const pageErrors = [];
  const localResourceFailures = [];
  const metricTasks = [];
  let totalTransferBytes = 0;
  let imageTransferBytes = 0;
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (!response.url().startsWith(origin)) return;
    if (!response.ok()) {
      localResourceFailures.push(`${response.status()} ${response.url()}`);
    }
    metricTasks.push(response.request().sizes().then((sizes) => {
      const bytes = Math.max(0, sizes.responseBodySize) + Math.max(0, sizes.responseHeadersSize);
      totalTransferBytes += bytes;
      if ((response.headers()["content-type"] ?? "").startsWith("image/")) imageTransferBytes += bytes;
    }));
  });
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(origin)) {
      localResourceFailures.push(
        `FAILED ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
      );
    }
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
    const qualification = qualificationChecks
      ? await collectQualificationMeasurements(
          page,
          scenario,
          selectors,
          motionObservations,
          reducedMotionMatches,
        )
      : undefined;
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
      localResourceFailures: [...new Set(localResourceFailures)].sort(),
      blockedRequests: [...new Set(blockedRequests)].sort(),
      metrics: { domContentLoadedMs, totalTransferBytes, imageTransferBytes, cpuThrottleRate },
      ...(qualification ? { qualification } : {}),
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
  const fixtureBinding = validateFixtureBinding(input?.fixtureBinding);
  const expectedBrowserAuthority = input?.browserAuthority === undefined
    ? undefined
    : validateBrowserAuthorityContract(input.browserAuthority);
  if (fixtureBinding && !expectedBrowserAuthority) {
    throw new Error("Fixture-bound browser evidence requires frozen browser authority");
  }
  if (input?.qualificationChecks !== undefined && input.qualificationChecks !== true) {
    throw new Error("qualificationChecks must be true when provided");
  }
  const qualificationChecks = input?.qualificationChecks === true;
  if (Object.hasOwn(input ?? {}, "outerSandboxed")) {
    throw new Error("outerSandboxed is unsupported; browser capture always launches its own OS sandbox");
  }
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
    const browserAuthority = await inspectPageIrBrowserAuthority();
    if (expectedBrowserAuthority) {
      assertBrowserAuthorityMatches(browserAuthority, expectedBrowserAuthority);
    }
    await validateCandidateBuild(siteSnapshot, fixtureBinding);
    packetRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-page-ir-browser-evidence-"));
    await fs.mkdir(path.join(packetRoot, "screenshots"), { mode: 0o700 });
    if (fixtureBinding) {
      await writeExclusiveReadOnly(
        path.join(packetRoot, "candidate-manifest.json"),
        await fs.readFile(path.join(siteSnapshot.root, "candidate-manifest.json")),
      );
    }
    const rejectedStaticRequests = new Set();
    server = await startStaticServer(siteSnapshot.root, rejectedStaticRequests);
    const capturePort = Number(new URL(server.origin).port);
    ({ browser, launcherRoot: browserLauncherRoot } = await launchCredentialFreeChromium(
      browserAuthority.executablePath,
      {
        browserBundleRoot: browserAuthority.bundleRoot,
        delegatedReadableRoot: siteSnapshot.root,
        allowedLoopbackPort: capturePort,
      },
    ));
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
        qualificationChecks,
      }));
    }
    await browser.close();
    browser = undefined;
    const finalBrowserAuthority = await inspectPageIrBrowserAuthority();
    assertBrowserAuthorityMatches(finalBrowserAuthority, browserAuthority.binding);
    const inventory = captures
      .map((capture) => ({ ...capture.screenshot }))
      .sort((left, right) => left.path.localeCompare(right.path));
    const evidence = {
      schemaVersion: 1,
      ...(fixtureBinding ? { fixtureBinding } : {}),
      ...(expectedBrowserAuthority ? { browserBinding: browserAuthority.binding } : {}),
      qualificationChecks,
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
