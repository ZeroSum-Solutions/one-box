import { describe, expect, it } from "vitest";
import {
  consumePipelineRunStream,
  pipelineStatusLabel,
  resumedRunId,
} from "./resumeRun";

describe("resumedRunId", () => {
  it("labels a paused pipeline as waiting for evidence review", () => {
    expect(
      pipelineStatusLabel({
        type: "paused",
        runId: "abcd",
        workflowStage: "evidence",
        workspaceUrl: "/evidence/abcd",
        note: "review",
      })
    ).toBe("{ review required }");
  });

  it("labels completed and failed pipelines as terminal", () => {
    expect(
      pipelineStatusLabel({
        type: "complete",
        runId: "abcd",
        previewUrl: "/preview/abcd",
      })
    ).toBe("{ complete }");
    expect(
      pipelineStatusLabel({ type: "error", message: "failed" })
    ).toBe("{ blocked }");
  });

  it("restores a valid evidence workspace continuation link", () => {
    expect(resumedRunId("?run=abcd_1234")).toBe("abcd_1234");
  });

  it("rejects path and query injection", () => {
    expect(resumedRunId("?run=../../etc/passwd")).toBeNull();
    expect(resumedRunId("?run=abc&next=https://evil.example")).toBeNull();
  });

  it("distinguishes a terminal frame from an unexpected clean EOF", async () => {
    const empty = new Response("");
    expect(await consumePipelineRunStream(empty, () => undefined)).toBe(false);
    const paused = new Response('data: {"type":"paused","runId":"abcd","workflowStage":"evidence","workspaceUrl":"/evidence/abcd","note":"review"}\n\n');
    expect(await consumePipelineRunStream(paused, () => undefined)).toBe(true);
  });
});
