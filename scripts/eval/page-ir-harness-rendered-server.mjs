import next from "next";
import { startTrustedRenderedServer } from "./page-ir-harness-rendered-server-runtime.mjs";

const nonce = process.env.ONEBOX_RENDERED_SERVER_NONCE;
if (!/^[a-f0-9]{64}$/.test(nonce ?? "")) throw new Error("rendered server nonce is invalid");

const running = await startTrustedRenderedServer({
  nonce,
  publishAuthority: (authority) => process.stdout.write(`${JSON.stringify(authority)}\n`),
  createApp: () => next({ dev: false, dir: process.cwd() }),
});

async function shutdown() {
  await running.close();
  process.exit(0);
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
