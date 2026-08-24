import assert from "node:assert/strict";
import test from "node:test";
import { startTrustedRenderedServer } from "./page-ir-harness-rendered-server-runtime.mjs";

test("binds and publishes trusted authority before evaluated app loading and gates readiness", async () => {
  const events = [];
  let authority;
  let publish;
  const published = new Promise((resolve) => { publish = resolve; });
  let releasePrepare;
  const prepareBarrier = new Promise((resolve) => { releasePrepare = resolve; });
  const started = startTrustedRenderedServer({
    nonce: "a".repeat(64),
    publishAuthority(value) {
      authority = value;
      events.push("published");
      publish();
    },
    createApp(authorityInput) {
      assert.deepEqual(authorityInput, {
        hostname: "127.0.0.1",
        port: authority.port,
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
