import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startTrustedRenderedServer } from "./page-ir-harness-rendered-server-runtime.mjs";

test("binds and publishes trusted authority before evaluated app loading and gates readiness", async () => {
  const portProbe = await new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
  const events = [];
  let authority;
  let publish;
  const published = new Promise((resolve) => { publish = resolve; });
  let releasePrepare;
  const prepareBarrier = new Promise((resolve) => { releasePrepare = resolve; });
  const started = startTrustedRenderedServer({
    nonce: "a".repeat(64),
    port: portProbe,
    publishAuthority(value) {
      authority = value;
      events.push("published");
      publish();
    },
    async loadApp(authorityInput) {
      assert.deepEqual(authorityInput, {
        hostname: "127.0.0.1",
        port: portProbe,
      });
      events.push("created-app");
      return {
        async prepare() {
          events.push("prepare-started");
          await prepareBarrier;
        },
        getRequestHandler() {
          return (_request, response) => {
            response.statusCode = 204;
            response.end();
          };
        },
        async close() {},
      };
    },
  });
  started.catch(() => {});
  await Promise.race([
    published,
    new Promise((resolve) => setTimeout(resolve, 100)),
  ]);
  assert.ok(authority, "trusted authority was not published before app loading");
  assert.equal(authority.port, portProbe);
  assert.deepEqual(events, ["published", "created-app", "prepare-started"]);

  const response = fetch(`http://127.0.0.1:${authority.port}`);
  const premature = await Promise.race([
    response.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 30)),
  ]);
  assert.equal(premature, false);

  releasePrepare();
  const running = await started;
  assert.equal((await response).status, 204);
  await running.close();
});

test("rendered entrypoint binds trusted authority before importing evaluated Next", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-rendered-entrypoint-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "node_modules/next"), { recursive: true });
  await fs.copyFile(
    path.resolve(import.meta.dirname, "page-ir-harness-rendered-server.mjs"),
    path.join(root, "page-ir-harness-rendered-server.mjs"),
  );
  await fs.copyFile(
    path.resolve(import.meta.dirname, "page-ir-harness-rendered-server-runtime.mjs"),
    path.join(root, "page-ir-harness-rendered-server-runtime.mjs"),
  );
  await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}\n');
  await fs.writeFile(
    path.join(root, "node_modules/next/package.json"),
    '{"name":"next","type":"module","exports":"./index.mjs"}\n',
  );
  await fs.writeFile(path.join(root, "node_modules/next/index.mjs"), `
import net from "node:net";
const port = Number(process.env.ONEBOX_RENDERED_SERVER_PORT);
const probe = net.createServer();
const trustedListenerExists = await new Promise((resolve, reject) => {
  probe.once("error", (error) => error.code === "EADDRINUSE" ? resolve(true) : reject(error));
  probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(false)));
});
if (!trustedListenerExists) throw new Error("Next loaded before trusted listen");
export default function next() {
  return {
    async prepare() {},
    getRequestHandler() { return (_request, response) => { response.statusCode = 204; response.end(); }; },
    async close() {},
  };
}
`);
  const port = await new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
  const nonce = "d".repeat(64);
  const child = spawn(process.execPath, [path.join(root, "page-ir-harness-rendered-server.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      ONEBOX_RENDERED_SERVER_NONCE: nonce,
      ONEBOX_RENDERED_SERVER_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const authority = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("rendered entrypoint authority timeout")), 5_000);
    child.once("close", (code) => {
      clearTimeout(timer);
      reject(new Error(`rendered entrypoint exited ${code}: ${Buffer.concat(stderr).toString("utf8")}`));
    });
    child.stdout.once("data", (chunk) => {
      clearTimeout(timer);
      resolve(JSON.parse(chunk.toString("utf8").trim()));
    });
  });
  assert.deepEqual(authority, { nonce, port });
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 204);
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("close", resolve));
});
