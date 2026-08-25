import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

const { runPipeline } = vi.hoisted(() => ({
  runPipeline: vi.fn(async (_runId: string, emit: (event: unknown) => void) => {
    emit({ type: "paused", runId: "run-test", workflowStage: "evidence", workspaceUrl: "/evidence/run-test", note: "review" });
  }),
}));

vi.mock("../../../lib/pipeline", () => ({ runPipeline }));

import { POST } from "./route";
import { ARTIFACTS, IntakeSchema } from "../../../lib/contracts";
import { createRun, saveArtifact, sitePaths } from "../../../lib/runstate";

const runIds: string[] = [];

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

afterEach(async () => {
  runPipeline.mockClear();
  vi.unstubAllEnvs();
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true })
    )
  );
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

  it.each(["web-app", "ios-app"] as const)(
    "rejects a persisted %s run before opening a stream or calling the pipeline",
    async (projectTarget) => {
      const runId = await createRun();
      runIds.push(runId);
      await saveArtifact(
        runId,
        ARTIFACTS.intake,
        IntakeSchema.parse({
          businessName: "Legacy Co",
          category: "service",
          location: "Reno, NV",
          services: ["Help"],
          primaryAction: "quote",
          projectTarget,
        })
      );

      const response = await POST(
        request(JSON.stringify({ runId }), "http://localhost:3000")
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: "unsupported-project-target",
        projectTarget,
      });
      expect(runPipeline).not.toHaveBeenCalled();
    }
  );

  it("emits one safe terminal event when the pipeline fails before reporting progress", async () => {
    runPipeline.mockRejectedValueOnce(new Error("private internal path"));
    const response = await POST(
      request('{"runId":"run-test"}', "http://localhost:3000")
    );
    const body = await response.text();
    expect(body.match(/"type":"error"/g)).toHaveLength(1);
    expect(body).toContain("before progress could be recorded");
    expect(body).not.toContain("private internal path");
  });
});
