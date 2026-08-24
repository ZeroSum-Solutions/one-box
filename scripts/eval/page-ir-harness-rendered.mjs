import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  inspectPageIrBrowserAuthority,
  launchPageIrCredentialFreeBrowserServer,
} from "./page-ir-harness-browser.mjs";

const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const RENDERED_GROUPS = Object.freeze([
  Object.freeze({
    id: "intake-browser",
    script: "scripts/e2e/intake-upload.mjs",
    evaluationIds: Object.freeze([
      "EVAL-SCOPE-001", "EVAL-UX-001", "EVAL-UX-002", "EVAL-UX-003", "EVAL-UX-006",
    ]),
  }),
  Object.freeze({
    id: "preview-browser",
    script: "scripts/e2e/preview-workbench.mjs",
    evaluationIds: Object.freeze(["EVAL-COMP-002", "EVAL-UX-004", "EVAL-UX-005"]),
  }),
  Object.freeze({
    id: "rollout-browser",
    script: "scripts/e2e/rollout-observability.mjs",
    evaluationIds: Object.freeze(["EVAL-OPS-002"]),
  }),
]);

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function capturedCommand(id, argv, result) {
  return { id, argv, ...result };
}

function runCaptured(id, argv, { cwd, env, timeoutMs, sandboxProfile }) {
  return new Promise((resolve, reject) => {
    const isolatedArgv = sandboxProfile
      ? ["/usr/bin/sandbox-exec", "-p", sandboxProfile, ...argv]
      : argv;
    const child = spawn(isolatedArgv[0], isolatedArgv.slice(1), {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    const collect = (chunks, which) => (chunk) => {
      const current = which === "stdout" ? stdoutBytes : stderrBytes;
      const remaining = Math.max(0, MAX_OUTPUT_BYTES - current);
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      if (which === "stdout") stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (current + chunk.length > MAX_OUTPUT_BYTES) {
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }
    };
    child.stdout.on("data", collect(stdout, "stdout"));
    child.stderr.on("data", collect(stderr, "stderr"));
    child.once("error", reject);
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
    }, timeoutMs);
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr);
      resolve(capturedCommand(id, argv, {
        exitCode: exitCode ?? -1,
        signal,
        timedOut,
        outputTruncated: stdoutBytes > MAX_OUTPUT_BYTES || stderrBytes > MAX_OUTPUT_BYTES,
        stdout: out.toString("utf8"),
        stderr: err.toString("utf8"),
        stdoutSha256: sha256(out),
        stderrSha256: sha256(err),
      }));
    });
  });
}

async function waitForServer(url, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("production server exited before becoming ready");
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(1_000) });
      if (response.status > 0) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("production server did not become ready");
}

function evidenceFor(commands) {
  return commands.flatMap((command) => [
    { path: `artifacts/${command.id}.stderr`, sha256: command.stderrSha256 },
    { path: `artifacts/${command.id}.stdout`, sha256: command.stdoutSha256 },
  ]).sort((left, right) => left.path.localeCompare(right.path));
}

function resultFor(evaluationId, commands) {
  const state = commands.every((command) => command.exitCode === 0 && !command.timedOut && !command.outputTruncated)
    ? "PASS"
    : "FAIL";
  return {
    schemaVersion: 1,
    evaluationId,
    state,
    commands,
    evidence: evidenceFor(commands),
    meteredCalls: 0,
    providerCredentialKeysPresent: [],
  };
}

export function renderedSandboxProfile({
  snapshotRoot,
  temporaryRoot,
  browserBundleRoot,
  writeRoots,
  writeFiles = [],
  networkMode = "deny",
  port,
  listenPort,
  connectPort,
}) {
  for (const target of [snapshotRoot, temporaryRoot, browserBundleRoot, ...writeRoots, ...writeFiles]) {
    if (!path.isAbsolute(target) || /["\0\r\n]/.test(target)) {
      throw new Error("rendered sandbox authority is invalid");
    }
  }
  if (
    networkMode === "journey" &&
    (!Number.isInteger(port) || port < 1 || port > 65535)
  ) {
    throw new Error("rendered sandbox loopback authority is invalid");
  }
  if (
    networkMode === "server" &&
    (![listenPort, connectPort].every((value) =>
      Number.isInteger(value) && value >= 1 && value <= 65535
    ))
  ) throw new Error("rendered sandbox server authority is invalid");
  const readRoots = [snapshotRoot, temporaryRoot, browserBundleRoot];
  const ancestors = new Set();
  for (const root of readRoots) {
    let current = path.dirname(root);
    while (current !== path.dirname(current)) {
      ancestors.add(current);
      current = path.dirname(current);
    }
  }
  return [
    "(version 1)", "(deny default)", "(allow process*)",
    ...(["server", "journey"].includes(networkMode) ? ["(deny process-fork)"] : []),
    "(allow signal (target same-sandbox))", "(allow sysctl-read)",
    "(allow mach-lookup)", "(allow file-read*)",
    "(deny file-read* (subpath \"/Users\"))", "(deny file-read* (subpath \"/Volumes\"))",
    "(deny file-read* (subpath \"/private/tmp\"))", "(deny file-read* (subpath \"/private/var/folders\"))",
    "(deny network*)",
    ...(networkMode === "server" ? [
      `(allow network-inbound (local tcp "localhost:${listenPort}"))`,
      `(allow network-outbound (remote tcp "localhost:${connectPort}"))`,
    ] : []),
    ...(networkMode === "journey" ? [`(allow network-outbound (remote tcp \"localhost:${port}\"))`] : []),
    ...[...ancestors].map((directory) => `(allow file-read-metadata (literal "${directory}"))`),
    ...readRoots.flatMap((directory) => [
      `(allow file-read* (literal "${directory}"))`, `(allow file-read* (subpath "${directory}"))`,
    ]),
    `(allow file-write* (literal "${temporaryRoot}"))`, `(allow file-write* (subpath "${temporaryRoot}"))`,
    ...writeRoots.flatMap((directory) => [
      `(allow file-write* (literal "${directory}"))`, `(allow file-write* (subpath "${directory}"))`,
    ]),
    ...writeFiles.map((file) => `(allow file-write* (literal "${file}"))`),
    "(allow file-write* (literal \"/dev/null\"))",
  ].join(" ");
}

function launchBoundServer(argv, { cwd, env, sandboxProfile, nonce, expectedPort, timeoutMs = 90_000 }) {
  return new Promise((resolve, reject) => {
    const isolatedArgv = ["/usr/bin/sandbox-exec", "-p", sandboxProfile, ...argv];
    const child = spawn(isolatedArgv[0], isolatedArgv.slice(1), {
      cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
      reject(new Error("production server did not publish its bound authority"));
    }, timeoutMs);
    const fail = (error) => {
      clearTimeout(timer);
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
      reject(error);
    };
    child.once("error", fail);
    child.once("close", (code) => fail(new Error(`production server exited before readiness (${code}): ${stderr.slice(0, 1_000)}`)));
    child.stderr.on("data", (chunk) => { if (stderr.length < 64 * 1024) stderr += chunk.toString("utf8"); });
    child.stdout.on("data", (chunk) => {
      if (stdout.length >= 64 * 1024) return;
      stdout += chunk.toString("utf8");
      for (const line of stdout.split("\n").slice(0, -1)) {
        let authority;
        try { authority = JSON.parse(line); } catch { continue; }
        if (
          authority.nonce !== nonce ||
          authority.port !== expectedPort ||
          !Number.isInteger(authority.port) || authority.port < 1 || authority.port > 65535
        ) {
          fail(new Error("production server authority is invalid"));
          return;
        }
        clearTimeout(timer);
        child.removeAllListeners("close");
        child.removeAllListeners("error");
        child.on("error", () => {});
        resolve({ child, port: authority.port });
        return;
      }
    });
  });
}

async function renderedProcessGroupStates(processGroupId) {
  const ps = spawn("/bin/ps", ["-axo", "pid=,pgid=,state="], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  ps.stdout.on("data", (chunk) => stdout.push(chunk));
  ps.stderr.on("data", (chunk) => stderr.push(chunk));
  const exitCode = await new Promise((resolve, reject) => {
    ps.once("error", reject);
    ps.once("close", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`unable to inspect rendered process group: ${Buffer.concat(stderr).toString("utf8").slice(0, 500)}`);
  }
  return Buffer.concat(stdout).toString("utf8").split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)$/);
    return match && Number(match[2]) === processGroupId ? [match[3]] : [];
  });
}

export async function freezeRenderedServer(child, timeoutMs = 2_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return false;
  process.kill(-child.pid, "SIGSTOP");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const states = await renderedProcessGroupStates(child.pid);
    if (states.length === 0) {
      if (child.exitCode !== null || child.signalCode !== null) return false;
    } else if (states.every((state) => /^[TZ]/.test(state))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("rendered server process group did not reach a stopped state");
}

export async function killFrozenRenderedServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const onClose = () => resolveClosed();
  child.once("close", onClose);
  if (child.exitCode !== null || child.signalCode !== null) {
    child.off("close", onClose);
    return;
  }
  process.kill(-child.pid, "SIGKILL");
  const terminated = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!terminated) {
    child.off("close", onClose);
    throw new Error("frozen rendered server did not terminate");
  }
}

export function renderedEvidenceFailure(primaryError, cleanupErrors) {
  if (primaryError && cleanupErrors.length > 0) {
    return new AggregateError(
      [primaryError, ...cleanupErrors],
      "Rendered evidence failed and cleanup also failed",
    );
  }
  if (primaryError) return primaryError;
  if (cleanupErrors.length > 0) {
    return new AggregateError(cleanupErrors, "Rendered evidence cleanup failed");
  }
}

export async function releaseFrozenRenderedAuthorities({
  delegatedBrowser,
  killServer,
  closeAppAuthority,
  removeTemporary,
}) {
  const errors = [];
  let browserTerminationConfirmed = delegatedBrowser === undefined;
  if (delegatedBrowser !== undefined) {
    try {
      await delegatedBrowser.close();
      browserTerminationConfirmed = true;
    } catch (error) {
      browserTerminationConfirmed = error?.browserTerminationConfirmed === true;
      errors.push(error);
    }
  }
  if (browserTerminationConfirmed) {
    for (const cleanup of [killServer, closeAppAuthority, removeTemporary]) {
      try { await cleanup(); } catch (error) { errors.push(error); }
    }
  }
  return { errors, browserTerminationConfirmed };
}

export function renderedEvaluationIds() {
  return RENDERED_GROUPS.flatMap((group) => [...group.evaluationIds]);
}

export function renderedProductionBuildArgv(runtimeContract) {
  const npmCli = path.join(
    runtimeContract.npmBundleRoot,
    ...runtimeContract.npmCliRelativePath.split("/"),
  );
  return [
    runtimeContract.nodeExecutable,
    npmCli,
    "run",
    "build",
    "--",
    "--webpack",
  ];
}

export function renderedBrowserEnvironment(environment, wsEndpoint) {
  let endpoint;
  try { endpoint = new URL(wsEndpoint); } catch {}
  const port = Number(endpoint?.port);
  if (
    endpoint?.protocol !== "ws:" ||
    endpoint.hostname !== "127.0.0.1" ||
    endpoint.username || endpoint.password ||
    !Number.isInteger(port) || port < 1 || port > 65535
  ) throw new Error("rendered browser endpoint is invalid");
  return {
    ...environment,
    ONEBOX_EVAL_BROWSER_WS_ENDPOINT: endpoint.href,
    ONEBOX_EVAL_LOOPBACK_HOST: endpoint.hostname,
    ONEBOX_EVAL_LOOPBACK_PORT: String(port),
    ONEBOX_EVAL_OS_SANDBOX: "darwin-sandbox-exec-network-and-user-storage-denied",
  };
}

async function closeNetServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export async function reserveRenderedAppPort() {
  const ipv4Probe = net.createServer();
  let ipv6Guard;
  try {
    await new Promise((resolve, reject) => {
      ipv4Probe.once("error", reject);
      ipv4Probe.listen(0, "127.0.0.1", resolve);
    });
    const address = ipv4Probe.address();
    if (!address || typeof address === "string") {
      throw new Error("rendered coordinator did not select a TCP loopback port");
    }
    ipv6Guard = net.createServer((socket) => socket.destroy());
    await new Promise((resolve, reject) => {
      ipv6Guard.once("error", reject);
      ipv6Guard.listen(address.port, "::1", resolve);
    });
    await closeNetServer(ipv4Probe);
    let closed = false;
    return {
      port: address.port,
      async close() {
        if (closed) return;
        await closeNetServer(ipv6Guard);
        closed = true;
      },
    };
  } catch (error) {
    await Promise.allSettled([
      closeNetServer(ipv4Probe),
      closeNetServer(ipv6Guard),
    ]);
    throw error;
  }
}

export async function executeProductionRenderedEvidence({
  snapshotRoot,
  runtimeContract,
  browserAuthority,
  evaluationIds = renderedEvaluationIds(),
  environment = process.env,
}) {
  const requested = new Set(evaluationIds);
  const expected = renderedEvaluationIds();
  if (requested.size !== expected.length || expected.some((id) => !requested.has(id))) {
    throw new Error("rendered evidence request does not match the frozen coordinator routes");
  }
  if (process.platform !== "darwin") throw new Error("rendered evidence requires the macOS sandbox boundary");
  snapshotRoot = await fs.realpath(snapshotRoot);
  const browser = await inspectPageIrBrowserAuthority();
  if (JSON.stringify(browser.binding) !== JSON.stringify(browserAuthority)) {
    throw new Error("rendered Chromium bundle does not match the frozen authority");
  }
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-rendered-"));
  const temporaryHome = path.join(temporaryRoot, "home");
  const temporaryDirectory = path.join(temporaryRoot, "tmp");
  await fs.mkdir(temporaryHome, { mode: 0o700 });
  await fs.mkdir(temporaryDirectory, { mode: 0o700 });
  const nextOutputRoot = path.join(snapshotRoot, ".next");
  const sitesRoot = path.join(snapshotRoot, "sites");
  await fs.mkdir(nextOutputRoot);
  await fs.mkdir(sitesRoot).catch((error) => { if (error?.code !== "EEXIST") throw error; });
  const buildSandboxProfile = renderedSandboxProfile({
    snapshotRoot,
    temporaryRoot: await fs.realpath(temporaryRoot),
    browserBundleRoot: browser.bundleRoot,
    writeRoots: [nextOutputRoot],
    writeFiles: [path.join(snapshotRoot, "next-env.d.ts")],
    networkMode: "build",
  });
  const env = Object.fromEntries([
    "PATH", "TMPDIR", "TMP", "TEMP", "SHELL", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM", "CI",
  ].flatMap((key) => typeof environment[key] === "string" ? [[key, environment[key]]] : []));
  env.HOME = temporaryHome;
  env.TMPDIR = `${temporaryDirectory}/`;
  env.CI = "1";
  env.NEXT_TELEMETRY_DISABLED = "1";
  env.NODE_OPTIONS = `--import=${path.join(snapshotRoot, "scripts/eval/page-ir-offline-guard.mjs")}`;
  const build = await runCaptured("production-build", renderedProductionBuildArgv(runtimeContract), {
    cwd: snapshotRoot,
    env,
    timeoutMs: 300_000,
    sandboxProfile: buildSandboxProfile,
  });
  if (build.exitCode !== 0 || build.timedOut || build.outputTruncated) {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
    return expected.map((evaluationId) => resultFor(evaluationId, [build]));
  }

  const nonce = crypto.randomBytes(32).toString("hex");
  let appAuthority;
  let delegatedBrowser;
  let server;
  let renderedResults;
  let primaryError;
  try {
    appAuthority = await reserveRenderedAppPort();
    const appPort = appAuthority.port;
    delegatedBrowser = await launchPageIrCredentialFreeBrowserServer(
      browser.binding,
      snapshotRoot,
      { allowedLoopbackPort: appPort },
    );
    const serverEnvironment = renderedBrowserEnvironment({
      ...env,
      ONEBOX_RENDERED_SERVER_NONCE: nonce,
      ONEBOX_RENDERED_SERVER_PORT: String(appPort),
      ONEBOX_EVAL_ALLOW_LOOPBACK: "1",
      ONEBOX_EVAL_ALLOW_LOOPBACK_LISTEN: "1",
    }, delegatedBrowser.wsEndpoint);
    const serverSandboxProfile = renderedSandboxProfile({
      snapshotRoot, temporaryRoot: await fs.realpath(temporaryRoot), browserBundleRoot: browser.bundleRoot,
      writeRoots: [nextOutputRoot, sitesRoot], networkMode: "server",
      listenPort: appPort, connectPort: delegatedBrowser.port,
    });
    const launched = await launchBoundServer([
      runtimeContract.nodeExecutable,
      path.join(snapshotRoot, "scripts/eval/page-ir-harness-rendered-server.mjs"),
    ], {
      cwd: snapshotRoot,
      env: serverEnvironment,
      sandboxProfile: serverSandboxProfile,
      nonce,
      expectedPort: appPort,
    });
    server = launched.child;
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const journeySandboxProfile = renderedSandboxProfile({
      snapshotRoot, temporaryRoot: await fs.realpath(temporaryRoot), browserBundleRoot: browser.bundleRoot,
      writeRoots: [sitesRoot], networkMode: "journey", port: delegatedBrowser.port,
    });
    const journeyEnvironment = renderedBrowserEnvironment({
      ...env,
      ONEBOX_BASE_URL: baseUrl,
      ONEBOX_EVAL_ALLOW_LOOPBACK: "1",
    }, delegatedBrowser.wsEndpoint);
    await waitForServer(baseUrl, server);
    const groupCommands = new Map();
    for (const group of RENDERED_GROUPS) {
      const command = await runCaptured(group.id, [
        runtimeContract.nodeExecutable,
        path.join(snapshotRoot, group.script),
      ], {
        cwd: snapshotRoot,
        env: journeyEnvironment,
        timeoutMs: 240_000,
        sandboxProfile: journeySandboxProfile,
      });
      groupCommands.set(group.id, command);
    }
    const identity = await runCaptured("page-ir-editor-identity", [
      runtimeContract.nodeExecutable,
      path.join(snapshotRoot, "node_modules/vitest/vitest.mjs"),
      "run", "src/lib/pageIrCompiler.test.ts", "src/lib/pageIrQualityCorpus.test.ts",
      "--maxWorkers=1", "--reporter=default",
    ], {
      cwd: snapshotRoot,
      env,
      timeoutMs: 180_000,
      sandboxProfile: renderedSandboxProfile({
        snapshotRoot, temporaryRoot: await fs.realpath(temporaryRoot), browserBundleRoot: browser.bundleRoot,
        writeRoots: [], networkMode: "deny",
      }),
    });
    if (server.exitCode !== null || server.signalCode !== null) throw new Error("production server exited during rendered evidence collection");
    renderedResults = RENDERED_GROUPS.flatMap((group) => group.evaluationIds.map((evaluationId) =>
      resultFor(
        evaluationId,
        evaluationId === "EVAL-COMP-002"
          ? [build, groupCommands.get(group.id), identity]
          : [build, groupCommands.get(group.id)],
      ),
    ));
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = [];
  let serverFrozen = false;
  try { serverFrozen = await freezeRenderedServer(server); } catch (error) { cleanupErrors.push(error); }
  if (!server || serverFrozen || server.exitCode !== null || server.signalCode !== null) {
    const released = await releaseFrozenRenderedAuthorities({
      delegatedBrowser,
      killServer: () => serverFrozen ? killFrozenRenderedServer(server) : undefined,
      closeAppAuthority: () => appAuthority?.close(),
      removeTemporary: () => fs.rm(temporaryRoot, { recursive: true, force: true }),
    });
    cleanupErrors.push(...released.errors);
  }
  const failure = renderedEvidenceFailure(primaryError, cleanupErrors);
  if (failure) throw failure;
  return renderedResults;
}
