import { describe, expect, it, vi } from "vitest";
import type { Intake, PipelineEvent, RunState } from "./contracts";
import {
  assertBuiltCandidateParked,
  assertPromotableBuildDisposition,
  projectPipelineReplayEvents,
  replayedConfigurationErrorIsCurrent,
  replayedPauseIsCurrent,
  runPipeline,
} from "./pipeline";
import * as pipelineModule from "./pipeline";

function pendingRun(id: string): RunState {
  return {
    id,
    createdAt: "2026-08-14T12:00:00.000Z",
    pipelineVersion: "evidence-gated-v2",
    stages: Object.fromEntries(
      ["intake", "scanned", "locked", "synthesized", "built", "edited"].map(
        (stage) => [
          stage,
          { status: "pending", retries: 0, gateRepairAttempts: 0 },
        ]
      )
    ) as RunState["stages"],
    costUsd: 0,
    costCapUsd: 3,
    modelSlugs: {},
    referenceMode: "refero",
    evidenceWorkflow: { currentStage: "evidence", artifacts: [] },
    referencePickerEnabled: false,
    layoutAuthority: "template-v1",
  };
}

const disabledResearchIntake = {
  businessName: "Acme",
  category: "service",
  location: "Reno, NV",
  services: ["Installation"],
  primaryAction: "quote",
  projectTarget: "website",
  certifications: [],
  claims: [],
  vibeWords: [],
  research: {
    enabled: false,
    businessIntelligence: false,
    referoDesignEvidence: false,
    allowPaidFirecrawlFallback: false,
  },
  uploads: [],
} satisfies Intake;

describe("pipeline replay", () => {
  it("dispatches only PageIR evidence builds to the PageIR controller", async () => {
    const dispatch = (
      pipelineModule as unknown as {
        executePageIrEvidenceBuildIfSelected?: (
          authority: "page-ir-v1" | "template-v1",
          runId: string,
          emit: (event: PipelineEvent) => void,
          execute: (runId: string, emit: (event: PipelineEvent) => void) => Promise<unknown>,
        ) => Promise<boolean>;
      }
    ).executePageIrEvidenceBuildIfSelected;
    const execute = vi.fn().mockResolvedValue({ status: "source-review" });
    const emit = vi.fn();

    await expect(
      dispatch?.("page-ir-v1", "page-ir-run", emit, execute),
    ).resolves.toBe(true);
    await expect(
      dispatch?.("template-v1", "template-run", emit, execute),
    ).resolves.toBe(false);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith("page-ir-run", emit);
  });

  it("routes PageIR authority through candidate recovery and controller execution", async () => {
    const run = pendingRun("page-ir-run");
    run.layoutAuthority = "page-ir-v1";
    const recoverCandidateState = vi.fn().mockResolvedValue({ action: "absent" });
    const executePipeline = vi.fn().mockResolvedValue(undefined);
    const dependencies = {
      readEvents: vi.fn().mockResolvedValue([]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent: vi.fn(),
      recoverCandidateState,
      inspectCandidate: vi.fn().mockResolvedValue({ status: "absent" }),
      executePipeline,
    };

    await runPipeline("page-ir-run", vi.fn(), dependencies);

    expect(recoverCandidateState).toHaveBeenCalledOnce();
    expect(executePipeline).toHaveBeenCalledOnce();
    expect(dependencies.readEvents).toHaveBeenCalledOnce();
    expect(dependencies.appendEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", { status: "absent" }],
    [
      "failed",
      { status: "present", provenance: { state: "failed" } },
    ],
    [
      "ready-for-gates",
      { status: "present", provenance: { state: "ready-for-gates" } },
    ],
  ])(
    "fails closed before legacy completion or visual QA when the post-build candidate is %s",
    (_label, candidate) => {
      const emitComplete = vi.fn();
      const runVisualQa = vi.fn();

      expect(() => {
        if (!assertBuiltCandidateParked(candidate as never)) {
          emitComplete();
          runVisualQa();
        }
      }).toThrow("built stage requires a promotable candidate");
      expect(emitComplete).not.toHaveBeenCalled();
      expect(runVisualQa).not.toHaveBeenCalled();
    },
  );

  it("rejects a nominally clean gate result whose durable disposition is not promotable", () => {
    expect(() =>
      assertPromotableBuildDisposition({
        state: "failed",
        receipt: {
          reports: [{ gate: "fixture", pass: true, blocking: true }],
        },
      } as never),
    ).toThrow("candidate gate disposition is not promotable");
  });

  it.each([
    ["missing", { status: "absent" }],
    [
      "failed",
      { status: "present", provenance: { state: "failed" } },
    ],
    [
      "ready-for-gates",
      { status: "present", provenance: { state: "ready-for-gates" } },
    ],
  ])(
    "does not synthesize legacy completion when the built candidate is %s",
    async (_label, candidate) => {
      const run = pendingRun("closed-built-run");
      run.pipelineVersion = "legacy-v1";
      for (const stage of Object.values(run.stages)) stage.status = "done";
      const emit = vi.fn();
      const appendEvent = vi.fn().mockResolvedValue(undefined);
      const executePipeline = vi.fn().mockResolvedValue(undefined);

      await runPipeline("closed-built-run", emit, {
        readEvents: vi.fn().mockResolvedValue([]),
        loadRun: vi.fn().mockResolvedValue(run),
        loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
        appendEvent,
        inspectCandidate: vi.fn().mockResolvedValue(candidate),
        executePipeline,
      } as never);

      expect(emit).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "complete" }),
      );
      expect(appendEvent).not.toHaveBeenCalledWith(
        "closed-built-run",
        expect.objectContaining({ type: "complete" }),
      );
      expect(executePipeline).toHaveBeenCalledOnce();
    },
  );

  it.each(["web-app", "ios-app"] as const)(
    "rejects %s before history, events, or pipeline execution",
    async (projectTarget) => {
      const dependencies = {
        readEvents: vi.fn().mockResolvedValue([]),
        loadRun: vi.fn().mockResolvedValue(pendingRun("legacy-target-run")),
        loadArtifact: vi.fn().mockResolvedValue({
          ...disabledResearchIntake,
          projectTarget,
        }),
        appendEvent: vi.fn(),
        executePipeline: vi.fn().mockResolvedValue(undefined),
      };

      await expect(
        runPipeline("legacy-target-run", vi.fn(), dependencies as never)
      ).rejects.toMatchObject({
        code: "unsupported-project-target",
        projectTarget,
      });
      expect(dependencies.readEvents).not.toHaveBeenCalled();
      expect(dependencies.loadRun).not.toHaveBeenCalled();
      expect(dependencies.appendEvent).not.toHaveBeenCalled();
      expect(dependencies.executePipeline).not.toHaveBeenCalled();
    }
  );

  it("projects historical audit events into one current journey", () => {
    const error: PipelineEvent = {
      type: "error",
      message: "missing configuration — nothing was spent",
    };
    const card: PipelineEvent = {
      type: "card",
      stage: "intake",
      title: "Context",
      body: "Useful once",
    };

    expect(
      projectPipelineReplayEvents([error, error, card, card, error])
    ).toEqual([card, error]);
  });

  it("replays one current hash-bound PageIR source-review terminal", () => {
    const sourcePause = {
      type: "page-ir-source-paused",
      runId: "run-test",
      stage: "built",
      reviewState: "draft",
      payloadSha256: "a".repeat(64),
      workspaceUrl: "/evidence/run-test",
      note: "source bundle ready",
      at: "2026-08-23T17:00:00.000Z",
    } as unknown as PipelineEvent;
    const staleError: PipelineEvent = { type: "error", message: "old failure" };
    expect(projectPipelineReplayEvents([staleError, sourcePause, sourcePause]))
      .toEqual([sourcePause]);

    const isCurrent = (
      pipelineModule as unknown as {
        replayedPageIrSourcePauseIsCurrent?: (
          history: PipelineEvent[],
          checkpoint: {
            runId: string;
            payloadSha256: string;
            reviewState: string;
          },
        ) => boolean;
      }
    ).replayedPageIrSourcePauseIsCurrent;
    expect(isCurrent?.([sourcePause], {
      runId: "run-test",
      payloadSha256: "a".repeat(64),
      reviewState: "draft",
    })).toBe(true);
    expect(isCurrent?.([sourcePause], {
      runId: "run-test",
      payloadSha256: "a".repeat(64),
      reviewState: "approved",
    })).toBe(false);
  });

  it.each([
    ["draft", 0],
    ["approved", 1],
  ] as const)(
    "%s Source Bundle state makes the hash-bound PageIR pause current only while review is pending",
    async (reviewState, executionCalls) => {
      const run = pendingRun("page-ir-source-run");
      run.layoutAuthority = "page-ir-v1";
      run.evidenceWorkflow.currentStage = "build";
      const pause: PipelineEvent = {
        type: "page-ir-source-paused",
        runId: run.id,
        stage: "built",
        reviewState: "draft",
        payloadSha256: "a".repeat(64),
        workspaceUrl: `/evidence/${run.id}`,
        note: "source review",
      };
      const executePipeline = vi.fn().mockResolvedValue(undefined);
      const emit = vi.fn();

      await runPipeline(run.id, emit, {
        readEvents: vi.fn().mockResolvedValue([pause]),
        loadRun: vi.fn().mockResolvedValue(run),
        loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
        appendEvent: vi.fn().mockResolvedValue(undefined),
        recoverCandidateState: vi.fn().mockResolvedValue({ action: "absent" }),
        inspectCandidate: vi.fn().mockResolvedValue({ status: "absent" }),
        loadPageIrSourceBundleForReview: vi.fn().mockResolvedValue({
          reviewState,
          bundle: { payloadSha256: "a".repeat(64) },
          sources: {},
        }),
        executePipeline,
      } as never);

      expect(executePipeline).toHaveBeenCalledTimes(executionCalls);
      if (reviewState === "draft") expect(emit).toHaveBeenCalledWith(pause);
    },
  );

  it("parks a failed PageIR candidate at zero repair attempts", async () => {
    const run = pendingRun("page-ir-failed-run");
    run.layoutAuthority = "page-ir-v1";
    run.evidenceWorkflow.currentStage = "build";
    const executePipeline = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();
    const appendEvent = vi.fn().mockResolvedValue(undefined);

    await runPipeline(run.id, emit, {
      readEvents: vi.fn().mockResolvedValue([]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent,
      recoverCandidateState: vi.fn().mockResolvedValue({ action: "retain-failed" }),
      inspectCandidate: vi.fn().mockResolvedValue({
        status: "present",
        provenance: { state: "failed" },
      }),
      loadPageIrSourceBundleForReview: vi.fn().mockResolvedValue({
        reviewState: "approved",
        bundle: { payloadSha256: "a".repeat(64) },
        sources: {},
      }),
      executePipeline,
    } as never);

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", message: expect.stringMatching(/parked/i) }),
    );
    expect(appendEvent).toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({ type: "error", message: expect.stringMatching(/parked/i) }),
    );
    expect(emit).toHaveBeenCalledWith({ type: "cost", usd: 0 });
    expect(executePipeline).not.toHaveBeenCalled();
    expect(run.stages.built.gateRepairAttempts).toBe(0);
  });

  it.each(["rejected", "superseded"] as const)(
    "parks a durably %s PageIR Source Bundle without re-entering execution",
    async (reviewState) => {
      const run = pendingRun(`page-ir-${reviewState}-run`);
      run.layoutAuthority = "page-ir-v1";
      run.evidenceWorkflow.currentStage = "build";
      const emit = vi.fn();
      const appendEvent = vi.fn().mockResolvedValue(undefined);
      const executePipeline = vi.fn().mockResolvedValue(undefined);

      await runPipeline(run.id, emit, {
        readEvents: vi.fn().mockResolvedValue([]),
        loadRun: vi.fn().mockResolvedValue(run),
        loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
        appendEvent,
        recoverCandidateState: vi.fn().mockResolvedValue({ action: "absent" }),
        inspectCandidate: vi.fn().mockResolvedValue({ status: "absent" }),
        loadPageIrSourceBundleForReview: vi.fn().mockResolvedValue({
          reviewState,
          bundle: { payloadSha256: "a".repeat(64) },
          sources: {},
        }),
        executePipeline,
      } as never);

      expect(executePipeline).not.toHaveBeenCalled();
      expect(appendEvent).toHaveBeenCalledWith(
        run.id,
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining(reviewState),
        }),
      );
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining(reviewState),
        }),
      );
    },
  );

  it("replays PageIR completion from an exact promoted candidate and live bundle", async () => {
    const run = pendingRun("page-ir-complete-run");
    run.layoutAuthority = "page-ir-v1";
    run.evidenceWorkflow.currentStage = "build";
    run.stages.built.status = "done";
    const buildSha256 = "a".repeat(64);
    run.evidenceWorkflow.artifacts = [
      {
        artifactType: "visual-qa",
        version: 1,
        createdAt: "2026-08-23T12:00:00.000Z",
        approvalTransitions: [
          { state: "draft", at: "2026-08-23T12:00:00.000Z" },
          { state: "in-review", at: "2026-08-23T12:01:00.000Z" },
          {
            state: "approved",
            at: "2026-08-23T12:02:00.000Z",
            humanVisualReview: {
              reviewerName: "Devin",
              reviewerKind: "human",
              humanAttestation: true,
              reviewedAt: "2026-08-23T12:02:00.000Z",
              buildSha256,
              criteria: {
                briefFidelity: { status: "pass" },
                visualHierarchy: { status: "pass" },
                spacingAndComposition: { status: "pass" },
                businessSpecificity: { status: "pass" },
                designAndReferenceAlignment: {
                  status: "pass",
                  referenceContext: "explicit-no-reference",
                },
              },
            },
          },
        ],
        artifact: {
          sourceCssArchitectureVersion: 1,
          buildSha256,
          checks: [],
        },
      },
    ];
    const complete: PipelineEvent = {
      type: "complete",
      runId: run.id,
      previewUrl: `/preview/${run.id}`,
    };
    const executePipeline = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();
    const inspectPromotedLiveBundle = vi.fn().mockResolvedValue({
      status: "present",
      manifest: { buildSha256 },
      provenance: {
        state: "promoted",
        pageIrSha256: "e".repeat(64),
        candidateManifestSha256: "c".repeat(64),
        gateReportSha256: "d".repeat(64),
        buildSha256,
        promotedBuildSha256: buildSha256,
      },
      receipt: {
        candidateManifestSha256: "c".repeat(64),
        buildSha256,
      },
    });
    const commonDependencies = {
      readEvents: vi.fn().mockResolvedValue([complete]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent: vi.fn().mockResolvedValue(undefined),
      recoverCandidateState: vi.fn().mockResolvedValue({ action: "promoted" }),
      inspectCandidate: vi.fn().mockResolvedValue({
        status: "present",
        provenance: {
          state: "promoted",
          pageIrSha256: "e".repeat(64),
          candidateManifestSha256: "c".repeat(64),
          gateReportSha256: "d".repeat(64),
          buildSha256,
          promotedBuildSha256: buildSha256,
        },
      }),
      inspectPromotedLiveBundle,
      loadPageIrSourceBundleForReview: vi.fn().mockResolvedValue({
        reviewState: "approved",
        bundle: { payloadSha256: "b".repeat(64) },
        sources: {},
      }),
      executePipeline,
    };

    await runPipeline(run.id, emit, commonDependencies as never);

    expect(emit).toHaveBeenCalledWith(complete);
    expect(executePipeline).not.toHaveBeenCalled();

    inspectPromotedLiveBundle.mockResolvedValueOnce({
      ...(await inspectPromotedLiveBundle.mock.results[0].value),
      status: "present",
      manifest: { buildSha256 },
      provenance: {
        state: "promoted",
        pageIrSha256: "e".repeat(64),
        candidateManifestSha256: "c".repeat(64),
        gateReportSha256: "f".repeat(64),
        buildSha256,
        promotedBuildSha256: buildSha256,
      },
      receipt: {
        candidateManifestSha256: "c".repeat(64),
        buildSha256,
      },
    });
    executePipeline.mockClear();
    const mismatchEmit = vi.fn();
    await runPipeline(run.id, mismatchEmit, commonDependencies as never);
    expect(executePipeline).toHaveBeenCalledOnce();
    expect(mismatchEmit).not.toHaveBeenCalledWith(complete);
  });

  it("stops a reconnect at the already-recorded current approval boundary", () => {
    const pause: PipelineEvent = {
      type: "paused",
      runId: "run-test",
      workflowStage: "contract",
      workspaceUrl: "/evidence/run-test",
      note: "ready",
    };

    expect(
      replayedPauseIsCurrent([pause], {
        id: "run-test",
        pipelineVersion: "evidence-gated-v2",
        currentStage: "contract",
        referencePending: false,
      })
    ).toBe(true);
    expect(
      replayedPauseIsCurrent([pause], {
        id: "run-test",
        pipelineVersion: "evidence-gated-v2",
        currentStage: "tokens",
        referencePending: false,
      })
    ).toBe(false);
  });

  it("stops a reconnect at a still-pending reference pick and resumes after it", () => {
    const pause: PipelineEvent = {
      type: "reference-paused",
      runId: "run-test",
      workspaceUrl: "/evidence/run-test",
      note: "pick a look",
      at: "2026-08-15T12:00:00.000Z",
    };

    // Still pending: the pause is current — replay, don't re-execute.
    expect(
      replayedPauseIsCurrent([pause], {
        id: "run-test",
        pipelineVersion: "evidence-gated-v2",
        currentStage: "evidence",
        referencePending: true,
      })
    ).toBe(true);

    // Pick recorded: the stale pause must NOT block re-execution (the
    // rev-1 verifier blocker — currentStage alone never changes here).
    expect(
      replayedPauseIsCurrent([pause], {
        id: "run-test",
        pipelineVersion: "evidence-gated-v2",
        currentStage: "evidence",
        referencePending: false,
      })
    ).toBe(false);
  });

  it("keeps evidence-stage pauses current regardless of picker state", () => {
    const pause: PipelineEvent = {
      type: "paused",
      runId: "run-test",
      workflowStage: "contract",
      workspaceUrl: "/evidence/run-test",
      note: "ready",
    };
    expect(
      replayedPauseIsCurrent([pause], {
        id: "run-test",
        pipelineVersion: "evidence-gated-v2",
        currentStage: "contract",
        referencePending: false,
      })
    ).toBe(true);
  });

  it("stops only while the same configuration error is still current", () => {
    const error: PipelineEvent = {
      type: "error",
      message: "missing configuration — nothing was spent",
    };

    expect(
      replayedConfigurationErrorIsCurrent(
        [error],
        "missing configuration — nothing was spent"
      )
    ).toBe(true);
    expect(
      replayedConfigurationErrorIsCurrent(
        [error],
        "a different configuration issue"
      )
    ).toBe(false);
    expect(replayedConfigurationErrorIsCurrent([error], null)).toBe(false);
  });

  it("drops a stale terminal when newer progress has no terminal outcome", () => {
    const error: PipelineEvent = { type: "error", message: "old failure" };
    const progress: PipelineEvent = {
      type: "card",
      stage: "built",
      title: "Retrying",
      body: "New progress",
    };

    expect(projectPipelineReplayEvents([error, progress])).toEqual([progress]);
  });

  it("attaches simultaneous callers to one pipeline execution", async () => {
    const run = pendingRun("concurrent-run");
    const staleError: PipelineEvent = {
      type: "error",
      message: "old configuration failure",
    };
    let releaseExecution!: () => void;
    const executionBlocked = new Promise<void>((resolve) => {
      releaseExecution = resolve;
    });
    let markExecutionStarted!: () => void;
    const executionStarted = new Promise<void>((resolve) => {
      markExecutionStarted = resolve;
    });
    const executePipeline = vi.fn(async () => {
      markExecutionStarted();
      await executionBlocked;
    });
    const dependencies = {
      readEvents: vi.fn().mockResolvedValue([staleError]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent: vi.fn().mockResolvedValue(undefined),
      executePipeline,
    };

    const firstEmit = vi.fn();
    const secondEmit = vi.fn();
    const first = runPipeline("concurrent-run", firstEmit, dependencies);
    await executionStarted;
    const second = runPipeline("concurrent-run", secondEmit, dependencies);
    await vi.waitFor(() => expect(dependencies.loadRun).toHaveBeenCalledTimes(2));

    expect(executePipeline).toHaveBeenCalledOnce();
    releaseExecution();
    await Promise.all([first, second]);
    expect(executePipeline).toHaveBeenCalledOnce();
    expect(firstEmit).not.toHaveBeenCalledWith(staleError);
    expect(secondEmit).not.toHaveBeenCalledWith(staleError);
  });

  it("does not synthesize gated completion without a recorded live transition", async () => {
    const run = pendingRun("complete-run");
    run.stages.built.status = "done";
    run.evidenceWorkflow.currentStage = "build";
    run.evidenceWorkflow.artifacts = [
      {
        artifactType: "visual-qa",
        version: 1,
        createdAt: "2026-08-14T12:00:00.000Z",
        approvalTransitions: [
          { state: "draft", at: "2026-08-14T12:00:00.000Z" },
          {
            state: "approved",
            at: "2026-08-14T12:01:00.000Z",
            humanVisualReview: {
              reviewerName: "Test reviewer",
              reviewerKind: "human",
              humanAttestation: true,
              reviewedAt: "2026-08-14T12:01:00.000Z",
              buildSha256: "a".repeat(64),
              criteria: {
                briefFidelity: { status: "pass" },
                visualHierarchy: { status: "pass" },
                spacingAndComposition: { status: "pass" },
                businessSpecificity: { status: "pass" },
                designAndReferenceAlignment: {
                  status: "pass",
                  referenceContext: "explicit-no-reference",
                },
              },
            },
          },
        ],
        artifact: {
          sourceCssArchitectureVersion: 1,
          buildSha256: "a".repeat(64),
          checks: [],
        },
      },
    ];
    const appendEvent = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();
    const executePipeline = vi.fn().mockResolvedValue(undefined);
    await runPipeline("complete-run", emit, {
      readEvents: vi.fn().mockResolvedValue([]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn(),
      appendEvent,
      executePipeline,
    });

    expect(appendEvent).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "complete" })
    );
    expect(executePipeline).toHaveBeenCalledOnce();
  });

  it("still replays a recorded legacy live completion when no candidate exists", async () => {
    const run = pendingRun("recorded-live-run");
    run.pipelineVersion = "legacy-v1";
    for (const stage of Object.values(run.stages)) stage.status = "done";
    const complete: PipelineEvent = {
      type: "complete",
      runId: "recorded-live-run",
      previewUrl: "/preview/recorded-live-run",
    };
    const emit = vi.fn();
    const executePipeline = vi.fn().mockResolvedValue(undefined);

    await runPipeline("recorded-live-run", emit, {
      readEvents: vi.fn().mockResolvedValue([complete]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent: vi.fn().mockResolvedValue(undefined),
      inspectCandidate: vi.fn().mockResolvedValue({ status: "absent" }),
      executePipeline,
    } as never);

    expect(emit).toHaveBeenCalledWith(complete);
    expect(emit).toHaveBeenCalledWith({ type: "cost", usd: 0 });
    expect(executePipeline).not.toHaveBeenCalled();
  });

  it("does not report a promotable candidate as a completed live build", async () => {
    const run = pendingRun("promotable-run");
    run.pipelineVersion = "legacy-v1";
    for (const stage of Object.values(run.stages)) stage.status = "done";
    const emit = vi.fn();
    const executePipeline = vi.fn().mockResolvedValue(undefined);
    const order: string[] = [];
    const recoverCandidateState = vi.fn(async () => {
      order.push("recover");
      return { action: "retain-promotable", state: "promotable" } as const;
    });
    const inspectCandidate = vi.fn(async () => {
      order.push("inspect");
      return {
        status: "present",
        provenance: { state: "promotable" },
      };
    });

    await runPipeline("promotable-run", emit, {
      readEvents: vi.fn().mockResolvedValue([]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent: vi.fn().mockResolvedValue(undefined),
      recoverCandidateState,
      inspectCandidate,
      executePipeline,
    } as never);

    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "complete" }),
    );
    expect(emit).toHaveBeenCalledWith({ type: "cost", usd: 0 });
    expect(executePipeline).not.toHaveBeenCalled();
    expect(order).toEqual(["recover", "inspect"]);
  });

  it("parks an over-cap promotable run without appending a new terminal error", async () => {
    const run = pendingRun("promotable-over-cap-run");
    run.costUsd = 4;
    run.costCapUsd = 3;
    const progress: PipelineEvent = {
      type: "card",
      stage: "built",
      title: "Candidate ready for promotion",
      body: "The verified candidate is not live.",
    };
    const emit = vi.fn();
    const appendEvent = vi.fn().mockResolvedValue(undefined);
    const executePipeline = vi.fn().mockResolvedValue(undefined);

    await runPipeline("promotable-over-cap-run", emit, {
      readEvents: vi.fn().mockResolvedValue([
        {
          type: "complete",
          runId: "promotable-over-cap-run",
          previewUrl: "/preview/promotable-over-cap-run",
        },
        progress,
      ] satisfies PipelineEvent[]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent,
      inspectCandidate: vi.fn().mockResolvedValue({
        status: "present",
        provenance: { state: "promotable" },
      }),
      executePipeline,
    } as never);

    expect(emit).toHaveBeenCalledWith(progress);
    expect(emit).toHaveBeenCalledWith({ type: "cost", usd: 4 });
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "complete" }),
    );
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
    expect(appendEvent).not.toHaveBeenCalled();
    expect(executePipeline).not.toHaveBeenCalled();
  });

  it.each([
    ["synthesize", []],
    [
      "replay",
      [
        {
          type: "complete",
          runId: "promotable-gated-run",
          previewUrl: "/preview/promotable-gated-run",
        } satisfies PipelineEvent,
      ],
    ],
  ])(
    "does not %s gated completion from stale visual QA while a candidate awaits promotion",
    async (_mode, history) => {
      const run = pendingRun("promotable-gated-run");
      run.stages.built.status = "done";
      run.evidenceWorkflow.currentStage = "build";
      run.evidenceWorkflow.artifacts = [
        {
          artifactType: "visual-qa",
          version: 1,
          createdAt: "2026-08-14T12:00:00.000Z",
          approvalTransitions: [
            { state: "draft", at: "2026-08-14T12:00:00.000Z" },
            {
              state: "approved",
              at: "2026-08-14T12:01:00.000Z",
              humanVisualReview: {
                reviewerName: "Prior live reviewer",
                reviewerKind: "human",
                humanAttestation: true,
                reviewedAt: "2026-08-14T12:01:00.000Z",
                buildSha256: "a".repeat(64),
                criteria: {
                  briefFidelity: { status: "pass" },
                  visualHierarchy: { status: "pass" },
                  spacingAndComposition: { status: "pass" },
                  businessSpecificity: { status: "pass" },
                  designAndReferenceAlignment: {
                    status: "pass",
                    referenceContext: "explicit-no-reference",
                  },
                },
              },
            },
          ],
          artifact: {
            sourceCssArchitectureVersion: 1,
            buildSha256: "a".repeat(64),
            checks: [],
          },
        },
      ];
      const emit = vi.fn();
      const appendEvent = vi.fn().mockResolvedValue(undefined);
      const executePipeline = vi.fn().mockResolvedValue(undefined);

      await runPipeline("promotable-gated-run", emit, {
        readEvents: vi.fn().mockResolvedValue(history),
        loadRun: vi.fn().mockResolvedValue(run),
        loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
        appendEvent,
        inspectCandidate: vi.fn().mockResolvedValue({
          status: "present",
          provenance: { state: "promotable" },
        }),
        executePipeline,
      } as never);

      expect(emit).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "complete" }),
      );
      expect(appendEvent).not.toHaveBeenCalledWith(
        "promotable-gated-run",
        expect.objectContaining({ type: "complete" }),
      );
      expect(emit).toHaveBeenCalledWith({ type: "cost", usd: 0 });
      expect(executePipeline).not.toHaveBeenCalled();
    },
  );

});
