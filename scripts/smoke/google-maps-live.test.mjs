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

function runSmoke(endpoint) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: {
        ...process.env,
        GOOGLE_PLACES_API_KEY: SYNTHETIC_KEY,
        ONEBOX_PLACES_SMOKE_ENDPOINT: endpoint,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
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
