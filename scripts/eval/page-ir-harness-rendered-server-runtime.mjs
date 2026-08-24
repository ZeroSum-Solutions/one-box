import http from "node:http";

export async function startTrustedRenderedServer({ nonce, publishAuthority, createApp }) {
  if (!/^[a-f0-9]{64}$/.test(nonce ?? "")) throw new Error("rendered server nonce is invalid");
  if (typeof publishAuthority !== "function" || typeof createApp !== "function") {
    throw new Error("rendered server lifecycle dependencies are invalid");
  }
  let requestHandler;
  let preparationError;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const server = http.createServer(async (request, response) => {
    await ready;
    if (preparationError) {
      response.statusCode = 500;
      response.end("rendered server preparation failed");
      return;
    }
    try {
      await requestHandler(request, response);
    } catch {
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("rendered server did not bind TCP loopback");
  publishAuthority({ nonce, port: address.port });

  let app;
  try {
    app = createApp({ hostname: "127.0.0.1", port: address.port });
    await app.prepare();
    requestHandler = app.getRequestHandler();
    if (typeof requestHandler !== "function") throw new Error("rendered server request handler is invalid");
    resolveReady();
  } catch (error) {
    preparationError = error;
    resolveReady();
    await new Promise((resolve) => server.close(resolve));
    if (app && typeof app.close === "function") await app.close();
    throw error;
  }

  let closed = false;
  return {
    port: address.port,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve) => server.close(resolve));
      await app.close();
    },
  };
}
