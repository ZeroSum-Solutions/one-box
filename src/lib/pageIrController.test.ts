import { describe, expect, it, vi } from "vitest";
import type { PipelineEvent } from "./contracts";
import { executePageIrBuildController } from "./pageIrController";

const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);

function candidate(state: "ready-for-gates" | "failed" | "promotable" | "promoted") {
  return {
    status: "present",
    manifest: { buildSha256: HASH },
    provenance: {
      state,
      pageIrSha256: OTHER_HASH,
      buildSha256: HASH,
      candidateManifestSha256: "c".repeat(64),
      gateReportSha256: state === "ready-for-gates" ? undefined : "d".repeat(64),
      promotedBuildSha256: state === "promoted" ? HASH : undefined,
    },
  } as const;
}

function dependenciesFor(
  state: "ready-for-gates" | "failed" | "promotable" | "promoted",
) {
  return {
    ensurePageIrSourceBundle: vi.fn().mockResolvedValue({
      reviewState: "approved",
      bundle: { payloadSha256: "e".repeat(64) },
      sources: {},
    }),
    deriveAndPersistInitialPageIr: vi.fn().mockResolvedValue({
      pageIrSha256: OTHER_HASH,
      bindingSetSha256: "f".repeat(64),
    }),
    loadPersistedPageIr: vi.fn().mockResolvedValue({
      pageIrSha256: OTHER_HASH,
      bindingSetSha256: "f".repeat(64),
    }),
    materializePageIrCandidate: vi.fn().mockResolvedValue({ status: "reused" }),
    inspectCandidate: vi.fn().mockResolvedValue(candidate(state)),
    gateBuiltCandidate: vi.fn().mockResolvedValue({
      state: "promotable",
      gateReportSha256: "d".repeat(64),
      receipt: {
        reports: [
          { name: "page-ir-integrity", pass: true, blocking: true, details: "ok" },
          { name: "deterministic-build", pass: true, blocking: true, details: "ok" },
        ],
      },
    }),
    promoteCandidate: vi.fn().mockResolvedValue({
      buildSha256: HASH,
      candidateManifestSha256: "c".repeat(64),
      gateReportSha256: "d".repeat(64),
    }),
    inspectPromotedLiveBundle: vi.fn().mockResolvedValue({
      status: "present",
      manifest: { buildSha256: HASH },
      provenance: {
        state: "promoted",
        pageIrSha256: OTHER_HASH,
        buildSha256: HASH,
        candidateManifestSha256: "c".repeat(64),
        gateReportSha256: "d".repeat(64),
        promotedBuildSha256: HASH,
      },
      receipt: {},
    }),
    materializePromotedPageIrVisualQa: vi.fn().mockResolvedValue({
      artifactType: "visual-qa",
      version: 2,
      artifact: { buildSha256: HASH },
      approvalTransitions: [{ state: "draft" }],
    }),
    loadRun: vi.fn().mockResolvedValue({
      stages: { built: { status: "running" } },
    }),
    finishStage: vi.fn().mockResolvedValue(undefined),
    failStage: vi.fn().mockResolvedValue(undefined),
    startStage: vi.fn().mockResolvedValue(undefined),
    assertVisualQaApprovedForBuild: vi.fn().mockReturnValue(undefined),
  };
}

describe("PageIR build controller", () => {
  it.each(["draft", "in-review"] as const)(
    "emits only the hash-bound %s source-review terminal",
    async (reviewState) => {
      const dependencies = dependenciesFor("ready-for-gates");
      dependencies.ensurePageIrSourceBundle.mockResolvedValue({
        reviewState,
        bundle: { payloadSha256: "e".repeat(64) },
        sources: {},
      });
      const events: PipelineEvent[] = [];

      await expect(
        executePageIrBuildController(
          "run-page-ir",
          (event) => events.push(event),
          dependencies,
        ),
      ).resolves.toEqual({ status: "source-review" });

      expect(events).toEqual([
        expect.objectContaining({
          type: "page-ir-source-paused",
          stage: "built",
          reviewState,
          payloadSha256: "e".repeat(64),
        }),
      ]);
      expect(dependencies.loadPersistedPageIr).not.toHaveBeenCalled();
      expect(dependencies.deriveAndPersistInitialPageIr).not.toHaveBeenCalled();
    },
  );

  it.each(["rejected", "superseded"] as const)(
    "fails closed for a %s Source Bundle",
    async (reviewState) => {
      const dependencies = dependenciesFor("ready-for-gates");
      dependencies.ensurePageIrSourceBundle.mockResolvedValue({
        reviewState,
        bundle: { payloadSha256: "e".repeat(64) },
        sources: {},
      });

      await expect(
        executePageIrBuildController(
          "run-page-ir",
          vi.fn(),
          dependencies,
        ),
      ).rejects.toThrow(new RegExp(reviewState));
      expect(dependencies.loadPersistedPageIr).not.toHaveBeenCalled();
      expect(dependencies.materializePageIrCandidate).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["ready-for-gates", "visual-review", 1, 1, 1],
    ["failed", "parked-failed", 0, 0, 0],
    ["promotable", "visual-review", 0, 1, 1],
    ["promoted", "visual-review", 0, 0, 1],
  ] as const)(
    "resumes a %s candidate at only the next durable operation",
    async (state, status, gateCalls, promotionCalls, qaCalls) => {
      const dependencies = dependenciesFor(state);
      const events: PipelineEvent[] = [];

      const result = await executePageIrBuildController(
        "run-page-ir",
        (event) => events.push(event),
        dependencies,
      );

      expect(result).toEqual({ status });
      expect(dependencies.gateBuiltCandidate).toHaveBeenCalledTimes(gateCalls);
      expect(dependencies.promoteCandidate).toHaveBeenCalledTimes(
        promotionCalls,
      );
      expect(dependencies.materializePromotedPageIrVisualQa).toHaveBeenCalledTimes(
        qaCalls,
      );
      expect(dependencies.materializePageIrCandidate).not.toHaveBeenCalled();
      if (state === "failed") {
        expect(dependencies.failStage).toHaveBeenCalledTimes(1);
        expect(events.at(-1)).toMatchObject({ type: "error" });
      } else {
        expect(dependencies.finishStage).toHaveBeenCalledTimes(1);
        expect(events.at(-1)).toMatchObject({
          type: "paused",
          workflowStage: "build",
        });
        expect(events).not.toContainEqual(
          expect.objectContaining({ type: "complete" }),
        );
      }
    },
  );

  it("parks blocking PageIR gates without consuming a repair attempt or touching promotion", async () => {
    const dependencies = dependenciesFor("ready-for-gates");
    const built = { status: "running", gateRepairAttempts: 0 };
    dependencies.loadRun.mockResolvedValue({ stages: { built } });
    dependencies.gateBuiltCandidate.mockResolvedValue({
      state: "failed",
      gateReportSha256: "d".repeat(64),
      receipt: {
        reports: [
          { name: "page-ir-integrity", pass: false, blocking: true, details: "bad" },
        ],
      },
    });
    const events: PipelineEvent[] = [];

    await expect(
      executePageIrBuildController(
        "run-page-ir",
        (event) => events.push(event),
        dependencies,
      ),
    ).resolves.toEqual({ status: "parked-failed" });

    expect(dependencies.promoteCandidate).not.toHaveBeenCalled();
    expect(dependencies.materializePromotedPageIrVisualQa).not.toHaveBeenCalled();
    expect(built.gateRepairAttempts).toBe(0);
    expect(events.at(-1)).toMatchObject({ type: "error" });
  });

  it("emits ordered hash-bearing checkpoints before the human visual pause", async () => {
    const dependencies = dependenciesFor("ready-for-gates");
    dependencies.loadPersistedPageIr.mockRejectedValue({ code: "ENOENT" });
    dependencies.inspectCandidate
      .mockResolvedValueOnce({ status: "absent" })
      .mockResolvedValueOnce(candidate("ready-for-gates"));
    const events: PipelineEvent[] = [];

    await executePageIrBuildController(
      "run-page-ir",
      (event) => events.push(event),
      dependencies,
    );

    expect(dependencies.deriveAndPersistInitialPageIr).toHaveBeenCalledOnce();
    expect(dependencies.materializePageIrCandidate).toHaveBeenCalledOnce();
    expect(dependencies.materializePageIrCandidate).toHaveBeenCalledWith(
      "run-page-ir",
      {
        pageIrSha256: OTHER_HASH,
        bindingSetSha256: "f".repeat(64),
      },
    );
    expect(
      events
        .filter((event) => event.type === "card")
        .map((event) => event.title),
    ).toEqual([
      "PageIR persisted",
      "PageIR candidate materialized",
      "PageIR candidate gates passed",
      "PageIR candidate promoted",
      "Promoted PageIR visual QA ready",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "paused",
      workflowStage: "build",
    });
  });

  it("completes only after exact-build named-human all-pass visual approval", async () => {
    const dependencies = dependenciesFor("promoted");
    dependencies.loadRun.mockResolvedValue({
      costUsd: 1.25,
      stages: { built: { status: "done" } },
    });
    dependencies.materializePromotedPageIrVisualQa.mockResolvedValue({
      artifactType: "visual-qa",
      version: 2,
      artifact: { buildSha256: HASH },
      approvalTransitions: [
        { state: "draft" },
        { state: "in-review" },
        {
          state: "approved",
          humanVisualReview: {
            reviewerName: "Devin",
            reviewerKind: "human",
            humanAttestation: true,
            buildSha256: HASH,
            criteria: {
              briefFidelity: { status: "pass" },
              visualHierarchy: { status: "pass" },
              spacingAndComposition: { status: "pass" },
              businessSpecificity: { status: "pass" },
              designAndReferenceAlignment: { status: "pass" },
            },
          },
        },
      ],
    });
    const events: PipelineEvent[] = [];

    await expect(
      executePageIrBuildController(
        "run-page-ir",
        (event) => events.push(event),
        dependencies,
      ),
    ).resolves.toEqual({ status: "complete" });

    expect(dependencies.assertVisualQaApprovedForBuild).toHaveBeenCalledWith(
      expect.anything(),
      HASH,
    );
    expect(events.slice(-2)).toEqual([
      { type: "cost", usd: 1.25 },
      {
        type: "complete",
        runId: "run-page-ir",
        previewUrl: "/preview/run-page-ir",
      },
    ]);
  });
});
