import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  classifyPipelineEvents,
  computeSiteBuildSha256,
  localJsonMutationHeaders,
  parseFullRunArguments,
  REQUIRED_POST_EDIT_CHECKS,
  shouldPreserveFinalizeCheckpoint,
  validateFinalizeCheckpoint,
} from "./full-run-state.mjs";

test("hashes the complete generated site tree", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "one-box-full-run-"));
  try {
    await mkdir(path.join(directory, "assets"));
    await writeFile(path.join(directory, "index.html"), "<main>Hello</main>");
    await writeFile(path.join(directory, "assets", "site.css"), "main { color: red; }");
    const first = await computeSiteBuildSha256(directory);

    await writeFile(path.join(directory, "assets", "site.css"), "main { color: blue; }");
    const second = await computeSiteBuildSha256(directory);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.notEqual(second, first);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("classifies a completed pipeline", () => {
  assert.deepEqual(
    classifyPipelineEvents([
      { type: "stage", stage: "built", status: "done" },
      { type: "complete", runId: "run-test", previewUrl: "/preview/run-test" },
    ]),
    {
      status: "COMPLETE",
      event: {
        type: "complete",
        runId: "run-test",
        previewUrl: "/preview/run-test",
      },
    },
  );
});

test("classifies the latest approval pause without treating it as completion", () => {
  assert.deepEqual(
    classifyPipelineEvents([
      { type: "paused", workflowStage: "evidence" },
      {
        type: "paused",
        workflowStage: "contract",
        workspaceUrl: "/evidence/run-test",
      },
    ]),
    {
      status: "APPROVAL_REQUIRED",
      event: {
        type: "paused",
        workflowStage: "contract",
        workspaceUrl: "/evidence/run-test",
      },
    },
  );
});

test("fails closed on a pipeline error", () => {
  assert.equal(
    classifyPipelineEvents([
      { type: "paused", workflowStage: "evidence" },
      { type: "error", message: "provider failed" },
    ]).status,
    "FAILED",
  );
});

test("uses the latest terminal event from replayed history", () => {
  assert.equal(
    classifyPipelineEvents([
      { type: "error", message: "old failure" },
      { type: "complete", runId: "run-test" },
    ]).status,
    "COMPLETE",
  );
  assert.equal(
    classifyPipelineEvents([
      { type: "complete", runId: "run-test" },
      { type: "paused", workflowStage: "build" },
    ]).status,
    "APPROVAL_REQUIRED",
  );
});

test("classifies a stream without a terminal event as incomplete", () => {
  assert.deepEqual(
    classifyPipelineEvents([
      { type: "stage", stage: "scanned", status: "done" },
    ]),
    { status: "INCOMPLETE", event: null },
  );
});

test("builds the same-origin headers required by local mutation routes", () => {
  assert.deepEqual(localJsonMutationHeaders("http://127.0.0.1:3123/path"), {
    "Content-Type": "application/json",
    Origin: "http://127.0.0.1:3123",
    "Sec-Fetch-Site": "same-origin",
  });
});

test("parses one validated run mode and explicit metered authority", () => {
  assert.deepEqual(
    parseFullRunArguments([
      "--allow-metered",
      "--finalize",
      "run_test-123",
    ]),
    {
      allowMetered: true,
      mode: "finalize",
      runId: "run_test-123",
    },
  );
});

test("rejects missing authority, unsafe run IDs, and ambiguous modes", () => {
  assert.throws(
    () => parseFullRunArguments(["--resume", "run-test"]),
    /allow-metered/,
  );
  assert.throws(
    () =>
      parseFullRunArguments([
        "--allow-metered",
        "--reuse",
        "../outside",
      ]),
    /Invalid runId/,
  );
  assert.throws(
    () =>
      parseFullRunArguments([
        "--allow-metered",
        "--resume",
        "run-test",
        "--reuse",
        "run-other",
      ]),
    /only one run mode/,
  );
  assert.throws(
    () => parseFullRunArguments(["--allow-metered", "--unknown"]),
    /Unknown argument/,
  );
});

test("accepts only a complete post-edit checkpoint for finalization", () => {
  const checkpoint = {
    runId: "run-test",
    status: "APPROVAL_REQUIRED",
    phase: "post-edit-review",
    terminal: { workflowStage: "build" },
    postEditProof: { siteSha256: "a".repeat(64) },
    results: REQUIRED_POST_EDIT_CHECKS.map((name) => ({ name, pass: true })),
  };

  assert.deepEqual(validateFinalizeCheckpoint(checkpoint, "run-test"), {
    siteSha256: "a".repeat(64),
  });
});

test("rejects a generic build pause and incomplete edit proof", () => {
  const genericBuildPause = {
    runId: "run-test",
    status: "APPROVAL_REQUIRED",
    terminal: { workflowStage: "build" },
    results: [],
  };
  assert.throws(
    () => validateFinalizeCheckpoint(genericBuildPause, "run-test"),
    /post-edit checks/,
  );

  const missingImageProof = {
    ...genericBuildPause,
    phase: "post-edit-review",
    postEditProof: { siteSha256: "b".repeat(64) },
    results: REQUIRED_POST_EDIT_CHECKS.filter(
      (name) => name !== "image edit swaps hero via Higgsfield",
    ).map((name) => ({ name, pass: true })),
  };
  assert.throws(
    () => validateFinalizeCheckpoint(missingImageProof, "run-test"),
    /post-edit checks/,
  );
});

test("preserves a validated post-edit checkpoint across finalize retries", () => {
  assert.equal(
    shouldPreserveFinalizeCheckpoint("finalize", "APPROVAL_REQUIRED", true),
    true,
  );
  assert.equal(
    shouldPreserveFinalizeCheckpoint("finalize", "FAILED", true),
    true,
  );
  assert.equal(
    shouldPreserveFinalizeCheckpoint("finalize", "COMPLETE", true),
    false,
  );
  assert.equal(
    shouldPreserveFinalizeCheckpoint("resume", "FAILED", true),
    false,
  );
});
