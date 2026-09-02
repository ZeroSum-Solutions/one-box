import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import test from "node:test";

const SCRIPT = "scripts/smoke/google-maps-live.mjs";
const SYNTHETIC_KEY = "places-smoke-synthetic-key";

async function withFakeProvider(handler, run) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const { port } = server.address();
    return await run(`http://127.0.0.1:${port}/places:searchText`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function runSmoke(endpoint, { timeoutMs, maximumWaitMs = 1_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        GOOGLE_PLACES_API_KEY: SYNTHETIC_KEY,
        ONEBOX_PLACES_SMOKE_ENDPOINT: endpoint,
        ...(timeoutMs === undefined
          ? {}
          : { ONEBOX_PLACES_SMOKE_TIMEOUT_MS: String(timeoutMs) }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const watchdog = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, maximumWaitMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(watchdog);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

test("sends one bounded Places request and emits a redacted success status", async () => {
  const requests = [];
  const result = await withFakeProvider((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push({ method: request.method, body });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ places: [{ id: "synthetic-place" }] }));
    });
  }, runSmoke);

  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), "status=ok places=1");
  assert.equal(result.stderr, "");
  assert.equal(`${result.stdout}${result.stderr}`.includes(SYNTHETIC_KEY), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.deepEqual(JSON.parse(requests[0].body), {
    textQuery: "plumber in Austin, TX",
    pageSize: 1,
  });
});

test("redacts a rejected provider response", async () => {
  const result = await withFakeProvider((_request, response) => {
    response.writeHead(403, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "provider-body-must-not-print" }));
  }, runSmoke);

  assert.notEqual(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "status=provider-unavailable code=403");
  assert.equal(`${result.stdout}${result.stderr}`.includes("provider-body-must-not-print"), false);
  assert.equal(`${result.stdout}${result.stderr}`.includes(SYNTHETIC_KEY), false);
});

test("rejects a non-literal loopback test endpoint before it receives the Places key", async () => {
  const receivedKeys = [];
  const result = await withFakeProvider((request, response) => {
    receivedKeys.push(request.headers["x-goog-api-key"]);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ places: [{ id: "synthetic-place" }] }));
  }, (_endpoint, port) => runSmoke(`http://localhost:${port}/places:searchText`));

  assert.notEqual(result.code, 0);
  assert.equal(result.stderr.trim(), "status=invalid-test-endpoint");
  assert.equal(receivedKeys.length, 0);
  assert.equal(`${result.stdout}${result.stderr}`.includes(SYNTHETIC_KEY), false);
});

test("times out a stalled loopback response with a fixed redacted status", { timeout: 2_000 }, async () => {
  const result = await withFakeProvider((request, response) => {
    request.on("close", () => response.end());
  }, (endpoint) => runSmoke(endpoint, { timeoutMs: 25 }));

  assert.equal(result.timedOut, false);
  assert.notEqual(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "status=provider-unavailable code=network");
  assert.equal(`${result.stdout}${result.stderr}`.includes(SYNTHETIC_KEY), false);
});

test("rejects an oversized streamed response before JSON parsing", async () => {
  const result = await withFakeProvider((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      places: [{ id: "synthetic-place" }],
      padding: "x".repeat(70 * 1024),
    }));
  }, runSmoke);

  assert.notEqual(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "status=provider-unavailable code=response-too-large");
  assert.equal(`${result.stdout}${result.stderr}`.includes(SYNTHETIC_KEY), false);
});
