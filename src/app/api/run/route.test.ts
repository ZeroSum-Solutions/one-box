import { afterEach, describe, expect, it, vi } from "vitest";

const { runPipeline } = vi.hoisted(() => ({
  runPipeline: vi.fn(async (_runId: string, emit: (event: unknown) => void) => {
    emit({ type: "paused", runId: "run-test", workflowStage: "evidence", workspaceUrl: "/evidence/run-test", note: "review" });
  }),
}));

vi.mock("../../../lib/pipeline", () => ({ runPipeline }));

import { POST } from "./route";

function request(body = '{"runId":"run-test"}', origin?: string) {
  return new Request("http://localhost:3000/api/run", {
    method: "POST",
    headers: {
      Host: "localhost:3000",
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin, "Sec-Fetch-Site": "same-origin" } : {}),
    },
    body,
  });
}

afterEach(() => {
  runPipeline.mockClear();
  vi.unstubAllEnvs();
});

describe("POST /api/run", () => {
  it("rejects missing/cross-origin mutation authorization before parsing or spend", async () => {
    expect((await POST(request("not-json"))).status).toBe(403);
    expect((await POST(request('{"runId":"run-test"}', "https://evil.example"))).status).toBe(403);
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("accepts same-origin JSON and emits the pipeline stream", async () => {
    const response = await POST(request('{"runId":"run-test"}', "http://localhost:3000"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"type":"paused"');
    expect(runPipeline).toHaveBeenCalledWith("run-test", expect.any(Function));
  });

  it("allows an exact bearer capability for a no-Origin automation client", async () => {
    vi.stubEnv("ONE_BOX_API_TOKEN", "secret-test-token");
    const bearerRequest = request();
    bearerRequest.headers.set("Authorization", "Bearer secret-test-token");
    expect((await POST(bearerRequest)).status).toBe(200);
    expect(runPipeline).toHaveBeenCalledOnce();
  });
});
