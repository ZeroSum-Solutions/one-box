import { afterEach, describe, expect, it, vi } from "vitest";

const browserHarness = vi.hoisted(() => {
  const browser = { close: vi.fn(async () => undefined) };
  return {
    browser,
    launch: vi.fn(async () => browser),
    connect: vi.fn(async () => browser),
  };
});

vi.mock("playwright", () => ({
  chromium: {
    launch: browserHarness.launch,
    connect: browserHarness.connect,
  },
}));

import { launchEvaluationAwareBrowser } from "./evaluationBrowser";

const SANDBOX_MARKER =
  "darwin-sandbox-exec-network-and-user-storage-denied";

function stubCapability({
  endpoint,
  host,
  port,
  marker,
}: {
  endpoint?: string;
  host?: string;
  port?: string;
  marker?: string;
}): void {
  vi.stubEnv("ONEBOX_EVAL_BROWSER_WS_ENDPOINT", endpoint);
  vi.stubEnv("ONEBOX_EVAL_LOOPBACK_HOST", host);
  vi.stubEnv("ONEBOX_EVAL_LOOPBACK_PORT", port);
  vi.stubEnv("ONEBOX_EVAL_OS_SANDBOX", marker);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("evaluation-aware browser capability", () => {
  it("launches locally only when every evaluator variable is absent", async () => {
    stubCapability({});

    await expect(launchEvaluationAwareBrowser()).resolves.toBe(
      browserHarness.browser,
    );

    expect(browserHarness.launch).toHaveBeenCalledOnce();
    expect(browserHarness.connect).not.toHaveBeenCalled();
  });

  it("connects only through the exact trusted evaluator capability", async () => {
    const endpoint = "ws://127.0.0.1:43210/evaluator-browser";
    stubCapability({ endpoint, host: "127.0.0.1", port: "43210", marker: SANDBOX_MARKER });

    await expect(launchEvaluationAwareBrowser()).resolves.toBe(
      browserHarness.browser,
    );

    expect(browserHarness.connect).toHaveBeenCalledWith(endpoint);
    expect(browserHarness.launch).not.toHaveBeenCalled();
  });

  it("propagates trusted connection failure without local fallback", async () => {
    const endpoint = "ws://127.0.0.1:43210/evaluator-browser";
    stubCapability({ endpoint, host: "127.0.0.1", port: "43210", marker: SANDBOX_MARKER });
    browserHarness.connect.mockRejectedValueOnce(
      new Error("trusted browser unavailable"),
    );

    await expect(launchEvaluationAwareBrowser()).rejects.toThrow(
      "trusted browser unavailable",
    );

    expect(browserHarness.launch).not.toHaveBeenCalled();
  });

  it.each([
    ["endpoint only", { endpoint: "ws://127.0.0.1:43210/evaluator-browser" }],
    ["host only", { host: "127.0.0.1" }],
    ["port only", { port: "43210" }],
    ["marker only", { marker: SANDBOX_MARKER }],
    [
      "malformed endpoint",
      { endpoint: "not-a-url", host: "127.0.0.1", port: "43210", marker: SANDBOX_MARKER },
    ],
    [
      "wrong sandbox marker",
      {
        endpoint: "ws://127.0.0.1:43210/evaluator-browser",
        host: "127.0.0.1",
        port: "43210",
        marker: "wrong-marker",
      },
    ],
    [
      "non-loopback host",
      {
        endpoint: "ws://example.com:43210/evaluator-browser",
        host: "127.0.0.1",
        port: "43210",
        marker: SANDBOX_MARKER,
      },
    ],
    [
      "opposite-family host",
      {
        endpoint: "ws://[::1]:43210/evaluator-browser",
        host: "::1",
        port: "43210",
        marker: SANDBOX_MARKER,
      },
    ],
    [
      "non-WebSocket protocol",
      {
        endpoint: "https://127.0.0.1:43210/evaluator-browser",
        host: "127.0.0.1",
        port: "43210",
        marker: SANDBOX_MARKER,
      },
    ],
    [
      "mismatched port",
      {
        endpoint: "ws://127.0.0.1:43210/evaluator-browser",
        host: "127.0.0.1",
        port: "43211",
        marker: SANDBOX_MARKER,
      },
    ],
    [
      "invalid port",
      {
        endpoint: "ws://127.0.0.1:43210/evaluator-browser",
        host: "127.0.0.1",
        port: "0",
        marker: SANDBOX_MARKER,
      },
    ],
  ] as const)("rejects %s before browser access", async (_label, capability) => {
    stubCapability(capability);

    await expect(launchEvaluationAwareBrowser()).rejects.toThrow(
      "invalid credential-free evaluation browser capability",
    );

    expect(browserHarness.connect).not.toHaveBeenCalled();
    expect(browserHarness.launch).not.toHaveBeenCalled();
  });
});
