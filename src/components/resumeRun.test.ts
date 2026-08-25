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

  it("treats a reference choice as a terminal pause", async () => {
    const referencePause = {
      type: "reference-paused" as const,
      runId: "abcd",
      workspaceUrl: "/evidence/abcd",
      note: "pick a look",
    };
    expect(pipelineStatusLabel(referencePause)).toBe("{ review required }");
    const response = new Response("data: " + JSON.stringify(referencePause) + "\n\n");
    expect(await consumePipelineRunStream(response, () => undefined)).toBe(true);
  });

  it("treats a PageIR Source Bundle review as a terminal pause without losing its binding", async () => {
    const sourcePause = {
      type: "page-ir-source-paused" as const,
      runId: "abcd",
      stage: "built" as const,
      reviewState: "in-review" as const,
      payloadSha256: "a".repeat(64),
      workspaceUrl: "/evidence/abcd",
      note: "Named human review required",
      at: "2026-08-23T12:00:00.000Z",
    };
    const seen: unknown[] = [];

    expect(pipelineStatusLabel(sourcePause)).toBe("{ review required }");
    const response = new Response(`data: ${JSON.stringify(sourcePause)}\n\n`);
    expect(await consumePipelineRunStream(response, (event) => seen.push(event))).toBe(true);
    expect(seen).toEqual([sourcePause]);
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
