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
  renderedBrowserEnvironment,
  renderedProductionBuildArgv,
  renderedSandboxProfile,
} from "./page-ir-harness-rendered.mjs";

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
    ONEBOX_EVAL_LOOPBACK_PORT: "43124",
  });
  assert.throws(
    () => renderedBrowserEnvironment({}, "wss://example.com/browser"),
    /endpoint is invalid/,
  );
});

test("rendered journey connects to the real delegated browser through its exact port", {
  skip: process.platform !== "darwin",
}, async () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-rendered-browser-test-"));
  const appServer = http.createServer((_request, response) => response.end("allowed-rendered-app"));
  const unrelatedServer = http.createServer((_request, response) => response.end("unrelated-loopback"));
  let server;
  try {
    const authority = await inspectPageIrBrowserAuthority();
    await Promise.all([appServer, unrelatedServer].map((httpServer) => new Promise((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", resolve);
    })));
    const appPort = appServer.address().port;
    const unrelatedPort = unrelatedServer.address().port;
    server = await launchPageIrCredentialFreeBrowserServer(
      authority.binding,
      root,
      { allowedLoopbackPort: appPort },
    );
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
        ONEBOX_TEST_UNRELATED_URL: `http://127.0.0.1:${unrelatedPort}/`,
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
    await Promise.all([appServer, unrelatedServer].map((httpServer) =>
      httpServer.listening
        ? new Promise((resolve) => httpServer.close(resolve))
        : Promise.resolve()
    ));
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
