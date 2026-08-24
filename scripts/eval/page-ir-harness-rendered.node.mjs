import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  inspectPageIrBrowserAuthority,
  launchPageIrCredentialFreeBrowserServer,
} from "./page-ir-harness-browser.mjs";
import {
  freezeRenderedServer,
  killFrozenRenderedServer,
  runCaptured,
  renderedBrowserEnvironment,
  renderedEvidenceFailure,
  renderedEditorIdentityArgv,
  renderedProductionBuildArgv,
  renderedSandboxProfile,
  releaseFrozenRenderedAuthorities,
  reserveRenderedAppPort,
} from "./page-ir-harness-rendered.mjs";

test("rendered captured commands reject and reap background descendants", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-rendered-captured-orphan-"));
  const pidFile = path.join(root, "descendant.pid");
  let descendantPid;
  context.after(async () => {
    if (descendantPid) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  const source = [
    "const { spawn } = require('node:child_process');",
    "const fs = require('node:fs');",
    "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
    "fs.writeFileSync(process.argv[1], String(child.pid));",
    "child.unref();",
    "process.exit(0);",
  ].join("");

  await assert.rejects(runCaptured(
    "orphan-probe",
    [process.execPath, "-e", source, pidFile],
    { cwd: root, env: process.env, timeoutMs: 5_000 },
  ), /background descendants/i);
  descendantPid = Number(await fs.readFile(pidFile, "utf8"));
  assert.throws(() => process.kill(descendantPid, 0), (error) => error?.code === "ESRCH");
});

test("rendered production evidence uses the canonical build path", () => {
  assert.deepEqual(renderedProductionBuildArgv({
    nodeExecutable: "/runtime/node",
    npmBundleRoot: "/runtime/npm",
    npmCliRelativePath: "bin/npm-cli.js",
  }), [
    "/runtime/node",
    "/runtime/npm/bin/npm-cli.js",
    "run",
    "build",
    "--",
    "--webpack",
  ]);
});

test("EVAL-COMP-002 runs the responsive six-purpose editor-identity oracle", () => {
  assert.deepEqual(renderedEditorIdentityArgv({
    nodeExecutable: "/runtime/node",
    snapshotRoot: "/snapshot",
  }), [
    "/runtime/node",
    "--test",
    "/snapshot/scripts/e2e/page-ir-editor-identity.node.mjs",
  ]);
});

test("rendered build denies all network", () => {
  const profile = renderedSandboxProfile({
    snapshotRoot: "/snapshot",
    temporaryRoot: "/temporary",
    browserBundleRoot: "/browser",
    writeRoots: ["/snapshot/.next"],
    networkMode: "build",
  });

  assert.match(profile, /\(deny network\*\)/);
  assert.doesNotMatch(profile, /allow network/);
});

test("rendered browser journeys receive only the delegated loopback endpoint", () => {
  assert.deepEqual(renderedBrowserEnvironment(
    { CI: "1" },
    "ws://127.0.0.1:43124/verified-token",
  ), {
    CI: "1",
    ONEBOX_EVAL_BROWSER_WS_ENDPOINT: "ws://127.0.0.1:43124/verified-token",
    ONEBOX_EVAL_LOOPBACK_HOST: "127.0.0.1",
    ONEBOX_EVAL_LOOPBACK_PORT: "43124",
    ONEBOX_EVAL_OS_SANDBOX: "darwin-sandbox-exec-network-and-user-storage-denied",
  });
  assert.throws(
    () => renderedBrowserEnvironment({}, "wss://example.com/browser"),
    /endpoint is invalid/,
  );
});

test("rendered server receives only exact app and browser ports", () => {
  const profile = renderedSandboxProfile({
    snapshotRoot: "/snapshot",
    temporaryRoot: "/temporary",
    browserBundleRoot: "/browser",
    writeRoots: ["/snapshot/.next"],
    networkMode: "server",
    listenPort: 43123,
    connectPort: 43124,
  });

  assert.match(profile, /network-inbound \(local tcp "localhost:43123"\)/);
  assert.match(profile, /network-outbound \(remote tcp "localhost:43124"\)/);
  assert.doesNotMatch(profile, /localhost:\*/);
  assert.doesNotMatch(profile, /localhost:43125/);
  assert.match(profile, /\(deny process-fork\)/);
});

test("rendered server and journey sandboxes reject detached descendants", {
  skip: process.platform !== "darwin",
}, async () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-rendered-no-fork-"));
  try {
    for (const options of [
      { networkMode: "server", listenPort: 43123, connectPort: 43124 },
      { networkMode: "journey", port: 43124 },
    ]) {
      const profile = renderedSandboxProfile({
        snapshotRoot: root,
        temporaryRoot: await fs.realpath(temporaryRoot),
        browserBundleRoot: root,
        writeRoots: [],
        ...options,
      });
      const child = spawn("/usr/bin/sandbox-exec", [
        "-p", profile,
        process.execPath,
        "--input-type=module",
        "--eval",
        `import { spawn } from "node:child_process"; let denied = false; try { const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], { detached: true }); denied = await new Promise((resolve) => { child.once("error", (error) => resolve(error.code === "EPERM")); child.once("spawn", () => resolve(false)); }); } catch (error) { denied = error.code === "EPERM"; } if (!denied) process.exit(9);`,
      ], { stdio: ["ignore", "pipe", "pipe"] });
      const stderr = [];
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      const exitCode = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      assert.equal(exitCode, 0, Buffer.concat(stderr).toString("utf8"));
    }
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("rendered teardown freezes evaluated code before a control port can be captured", async () => {
  const trustedServer = http.createServer((_request, response) => response.end("trusted"));
  let trustedRequests = 0;
  trustedServer.on("request", () => { trustedRequests += 1; });
  await new Promise((resolve, reject) => {
    trustedServer.once("error", reject);
    trustedServer.listen(0, "127.0.0.1", resolve);
  });
  const port = trustedServer.address().port;
  const worker = spawn(process.execPath, [
    "--input-type=module",
    "--eval",
    `import http from "node:http"; setInterval(() => { const request = http.get("http://127.0.0.1:${port}", (response) => response.resume()); request.on("error", () => {}); }, 5);`,
  ], { detached: true, stdio: "ignore" });
  let hostileServer;
  try {
    const deadline = Date.now() + 2_000;
    while (trustedRequests === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(trustedRequests > 0, "evaluated worker did not reach the trusted endpoint");
    assert.equal(await freezeRenderedServer(worker), true);
    await new Promise((resolve) => trustedServer.close(resolve));
    let hostileRequests = 0;
    hostileServer = http.createServer((_request, response) => {
      hostileRequests += 1;
      response.end("hostile");
    });
    await new Promise((resolve, reject) => {
      hostileServer.once("error", reject);
      hostileServer.listen(port, "127.0.0.1", resolve);
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(hostileRequests, 0);
    await killFrozenRenderedServer(worker);
  } finally {
    if (worker.exitCode === null && worker.signalCode === null) {
      try { process.kill(-worker.pid, "SIGKILL"); } catch {}
    }
    if (trustedServer.listening) await new Promise((resolve) => trustedServer.close(resolve));
    if (hostileServer?.listening) await new Promise((resolve) => hostileServer.close(resolve));
  }
});

test("rendered cleanup failures preserve the primary evaluation error", () => {
  const primary = new Error("primary evaluation failure");
  const cleanup = new Error("cleanup failure");
  const failure = renderedEvidenceFailure(primary, [cleanup]);
  assert.ok(failure instanceof AggregateError);
  assert.deepEqual(failure.errors, [primary, cleanup]);
});

test("rendered teardown retains app authority when browser termination is uncertain", async () => {
  let killedServer = false;
  let releasedApp = false;
  let removedTemporary = false;
  const result = await releaseFrozenRenderedAuthorities({
    delegatedBrowser: {
      async close() { throw new Error("browser termination uncertain"); },
    },
    async killServer() { killedServer = true; },
    async closeAppAuthority() { releasedApp = true; },
    async removeTemporary() { removedTemporary = true; },
  });

  assert.equal(result.browserTerminationConfirmed, false);
  assert.equal(result.errors.length, 1);
  assert.equal(killedServer, true);
  assert.equal(releasedApp, false);
  assert.equal(removedTemporary, false);
});

test("rendered teardown reaps descendants after the group leader exits", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-rendered-leader-exit-"));
  const pidFile = path.join(root, "descendant.pid");
  let descendantPid;
  context.after(async () => {
    if (descendantPid) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  const source = [
    "const { spawn } = require('node:child_process');",
    "const fs = require('node:fs');",
    "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
    "fs.writeFileSync(process.argv[1], String(child.pid));",
    "child.unref();",
    "process.exit(0);",
  ].join("");
  const leader = spawn(process.execPath, ["-e", source, pidFile], {
    detached: true,
    stdio: "ignore",
  });
  await new Promise((resolve, reject) => {
    leader.once("error", reject);
    leader.once("close", resolve);
  });
  descendantPid = Number(await fs.readFile(pidFile, "utf8"));

  await killFrozenRenderedServer(leader);

  assert.throws(() => process.kill(descendantPid, 0), (error) => error?.code === "ESRCH");
});

test("rendered journey connects to the real delegated browser through its exact port", {
  skip: process.platform !== "darwin",
}, async () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-rendered-browser-test-"));
  const appServer = http.createServer((_request, response) => response.end("allowed-rendered-app"));
  const hostileIpv6Server = http.createServer((_request, response) => response.end("unrelated-loopback"));
  let server;
  let appAuthority;
  try {
    const authority = await inspectPageIrBrowserAuthority();
    appAuthority = await reserveRenderedAppPort();
    await new Promise((resolve, reject) => {
      appServer.once("error", reject);
      appServer.listen(appAuthority.port, "127.0.0.1", resolve);
    });
    const appPort = appServer.address().port;
    await assert.rejects(new Promise((resolve, reject) => {
      hostileIpv6Server.once("error", reject);
      hostileIpv6Server.listen(appPort, "::1", resolve);
    }), { code: "EADDRINUSE" });
    server = await launchPageIrCredentialFreeBrowserServer(
      authority.binding,
      root,
      { allowedLoopbackPort: appPort },
    );
    assert.equal(new URL(server.wsEndpoint).hostname, "127.0.0.1");
    const profile = renderedSandboxProfile({
      snapshotRoot: root,
      temporaryRoot: await fs.realpath(temporaryRoot),
      browserBundleRoot: authority.bundleRoot,
      writeRoots: [],
      networkMode: "journey",
      port: server.port,
    });
    assert.match(profile, new RegExp(`localhost:${server.port}`));
    assert.doesNotMatch(profile, /localhost:\*/);
    const playwright = pathToFileURL(path.join(root, "node_modules/playwright/index.mjs")).href;
    const child = spawn("/usr/bin/sandbox-exec", [
      "-p", profile,
      process.execPath,
      "--input-type=module",
      "--eval",
      `import { chromium } from ${JSON.stringify(playwright)}; const browser = await chromium.connect(process.env.ONEBOX_EVAL_BROWSER_WS_ENDPOINT); const page = await browser.newPage(); const response = await page.goto(process.env.ONEBOX_TEST_APP_URL); if (await response.text() !== "allowed-rendered-app") throw new Error("rendered app response mismatch"); let denied = false; try { await page.goto(process.env.ONEBOX_TEST_UNRELATED_URL); } catch { denied = true; } if (!denied) throw new Error("unrelated loopback was reachable"); await browser.close();`,
    ], {
      cwd: root,
      env: renderedBrowserEnvironment({
        ...process.env,
        NODE_OPTIONS: `--import=${path.join(root, "scripts/eval/page-ir-offline-guard.mjs")}`,
        ONEBOX_EVAL_ALLOW_LOOPBACK: "1",
        ONEBOX_TEST_APP_URL: `http://127.0.0.1:${appPort}/`,
        ONEBOX_TEST_UNRELATED_URL: `http://[::1]:${appPort}/`,
      }, server.wsEndpoint),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(exitCode, 0, Buffer.concat(stderr).toString("utf8"));
  } finally {
    await server?.close();
    await Promise.all([appServer, hostileIpv6Server].map((httpServer) =>
      httpServer.listening
        ? new Promise((resolve) => httpServer.close(resolve))
        : Promise.resolve()
    ));
    await appAuthority?.close();
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("rendered workers may signal only descendants in the same sandbox", () => {
  const profile = renderedSandboxProfile({
    snapshotRoot: "/snapshot",
    temporaryRoot: "/temporary",
    browserBundleRoot: "/browser",
    writeRoots: ["/snapshot/.next"],
  });

  assert.match(profile, /\(allow signal \(target same-sandbox\)\)/);
});

test("rendered build may refresh only the exact generated Next type file", () => {
  const profile = renderedSandboxProfile({
    snapshotRoot: "/snapshot",
    temporaryRoot: "/temporary",
    browserBundleRoot: "/browser",
    writeRoots: ["/snapshot/.next"],
    writeFiles: ["/snapshot/next-env.d.ts"],
  });

  assert.match(profile, /\(allow file-write\* \(literal "\/snapshot\/next-env\.d\.ts"\)\)/);
  assert.doesNotMatch(profile, /\(allow file-write\* \(subpath "\/snapshot\/next-env\.d\.ts"\)\)/);
});
