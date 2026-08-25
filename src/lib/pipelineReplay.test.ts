import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Intake, PipelineEvent, RunState } from "./contracts";
import {
  appendEvent,
  createRun,
  loadRun,
  readEvents,
  saveArtifact,
  sitePaths,
} from "./runstate";

const modelMocks = vi.hoisted(() => ({
  generateJson: vi.fn(async () => {
    throw new Error("credential-free replay test attempted a model call");
  }),
}));

vi.mock("./openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./openrouter")>();
  return { ...actual, generateJson: modelMocks.generateJson };
});
import {
  assertBuiltCandidateParked,
  assertPromotableBuildDisposition,
  projectPipelineReplayEvents,
  replayedConfigurationErrorIsCurrent,
  replayedPauseIsCurrent,
  runPipeline,
  stageBuild,
} from "./pipeline";
import * as pipelineModule from "./pipeline";
import { CandidateRepairError } from "./builder";

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

function visualQaChecks(status: "pending" | "pass") {
  return ([
    "desktop",
    "tablet",
    "mobile",
    "hover",
    "focus",
    "color-scheme",
    "reduced-motion",
  ] as const).map((area) => ({
    area,
    status,
    ...(["desktop", "tablet", "mobile"].includes(area)
      ? { evidencePath: `evidence/qa/v1/${area}.png` }
      : {}),
  }));
}

describe("template build lifecycle producer", () => {
  it("classifies a real repair-boundary exception as repair-failure", async () => {
    const events: PipelineEvent[] = [];
    const repairError = new CandidateRepairError("repair response was invalid");

    await expect(stageBuild(
      "repair-failure-run",
      {} as Intake,
      { tokens: {}, skeleton: {}, copy: {} } as never,
      (event) => events.push(event),
      undefined,
      undefined,
      {
        buildSite: vi.fn().mockResolvedValue(undefined),
        gateAndRepairBuiltCandidate: vi.fn().mockRejectedValue(repairError),
      },
    )).rejects.toBe(repairError);

    expect(events).toContainEqual(expect.objectContaining({
      type: "lifecycle",
      outcomeClass: "repair-failure",
      status: "failed",
      message: "repair response was invalid",
    }));
  });

  it("classifies a resolved blocking gate disposition as gate-failure", async () => {
    const events: PipelineEvent[] = [];

    await expect(stageBuild(
      "gate-failure-run",
      {} as Intake,
      { tokens: {}, skeleton: {}, copy: {} } as never,
      (event) => events.push(event),
      undefined,
      undefined,
      {
        buildSite: vi.fn().mockResolvedValue(undefined),
        gateAndRepairBuiltCandidate: vi.fn().mockResolvedValue({
          repairCompleted: true,
          disposition: {
            state: "failed",
            receipt: {
              reports: [{
                gate: "axe",
                pass: false,
                blocking: true,
                details: ["critical accessibility violation"],
                ranAt: "2026-08-24T12:00:00.000Z",
              }],
            },
          },
        }),
      },
    )).rejects.toThrow(/blocking candidate gates failed: axe/);

    expect(events).toContainEqual(expect.objectContaining({
      type: "lifecycle",
      outcomeClass: "gate-failure",
      status: "failed",
      message: expect.stringContaining("axe"),
    }));
  });
});

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

function pageIrCompletionHarness() {
  const run = pendingRun("page-ir-complete-run");
  run.layoutAuthority = "page-ir-v1";
  run.evidenceWorkflow.currentStage = "build";
  run.stages.built.status = "done";
  const buildSha256 = "a".repeat(64);
  const pageIrSha256 = "e".repeat(64);
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
        checks: visualQaChecks("pass"),
      },
    },
  ];
  const complete: PipelineEvent = {
    type: "complete",
    runId: run.id,
    previewUrl: `/preview/${run.id}`,
  };
  const exactCandidate = {
    status: "present",
    provenance: {
      state: "promoted",
      pageIrSha256,
      candidateManifestSha256: "c".repeat(64),
      gateReportSha256: "d".repeat(64),
      buildSha256,
      promotedBuildSha256: buildSha256,
    },
  };
  const exactLive = {
    status: "present",
    manifest: { buildSha256 },
    provenance: structuredClone(exactCandidate.provenance),
    receipt: {
      candidateManifestSha256: "c".repeat(64),
      buildSha256,
    },
  };
  const executePipeline = vi.fn().mockResolvedValue(undefined);
  const dependencies = {
    readEvents: vi.fn().mockResolvedValue([complete]),
    loadRun: vi.fn().mockResolvedValue(run),
    loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
    appendEvent: vi.fn().mockResolvedValue(undefined),
    recoverCandidateState: vi.fn().mockResolvedValue({ action: "promoted" }),
    inspectCandidate: vi.fn().mockResolvedValue(exactCandidate),
    inspectPromotedLiveBundle: vi.fn().mockResolvedValue(exactLive),
    loadPageIrSourceBundleForReview: vi.fn().mockResolvedValue({
      reviewState: "approved",
      bundle: { payloadSha256: "b".repeat(64) },
      sources: {},
    }),
    loadPersistedPageIr: vi.fn().mockResolvedValue({ pageIrSha256 }),
    executePipeline,
  };
  return {
    run,
    complete,
    exactCandidate,
    exactLive,
    executePipeline,
    dependencies,
  };
}

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

  it("promotes a parked template candidate and pauses on real visual QA", async () => {
    const continueTemplate = (
      pipelineModule as unknown as {
        executeTemplateEvidenceBuildContinuation?: (
          authority: "page-ir-v1" | "template-v1",
          runId: string,
          emit: (event: PipelineEvent) => void,
          dependencies: Record<string, unknown>,
        ) => Promise<boolean>;
      }
    ).executeTemplateEvidenceBuildContinuation;
    const buildSha256 = "a".repeat(64);
    const visualQa = {
      artifactType: "visual-qa",
      version: 2,
      createdAt: "2026-08-25T23:00:00.000Z",
      approvalTransitions: [
        { state: "draft", at: "2026-08-25T23:00:00.000Z" },
      ],
      artifact: {
        sourceCssArchitectureVersion: 1,
        buildSha256,
        checks: visualQaChecks("pass"),
      },
    };
    const promoted = {
      status: "present",
      provenance: {
        state: "promoted",
        layoutAuthority: "template-v1",
        buildSha256,
        promotedBuildSha256: buildSha256,
      },
    };
    const emit = vi.fn();
    const dependencies = {
      inspectCandidate: vi.fn().mockResolvedValue({
        status: "present",
        provenance: { state: "promotable", layoutAuthority: "template-v1" },
      }),
      promoteCandidate: vi.fn().mockResolvedValue({ buildSha256 }),
      materializePromotedTemplateVisualQa: vi.fn().mockResolvedValue(visualQa),
      inspectPromotedLiveBundle: vi.fn().mockResolvedValue({
        status: "present",
        manifest: { buildSha256 },
        provenance: promoted.provenance,
      }),
      loadRun: vi.fn().mockResolvedValue({
        ...pendingRun("template-promotable-run"),
        costUsd: 0.55,
      }),
      buildRunProvenance: vi.fn().mockReturnValue({
        schemaVersion: 1,
        runId: "template-promotable-run",
      }),
      assertVisualQaApprovedForBuild: vi.fn(),
    };

    await expect(
      continueTemplate?.(
        "template-v1",
        "template-promotable-run",
        emit,
        dependencies,
      ),
    ).resolves.toBe(true);
    expect(dependencies.promoteCandidate).toHaveBeenCalledOnce();
    expect(dependencies.materializePromotedTemplateVisualQa).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "paused",
      workflowStage: "build",
    }));
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  it("completes a promoted template build only after exact-build human approval", async () => {
    const continueTemplate = pipelineModule.executeTemplateEvidenceBuildContinuation;
    const runId = "template-approved-run";
    const buildSha256 = "b".repeat(64);
    const run = pendingRun(runId);
    run.evidenceWorkflow.currentStage = "build";
    run.stages.built.status = "done";
    const visualQa = {
      artifactType: "visual-qa" as const,
      version: 2,
      createdAt: "2026-08-25T23:00:00.000Z",
      approvalTransitions: [
        { state: "draft" as const, at: "2026-08-25T23:00:00.000Z" },
        {
          state: "approved" as const,
          at: "2026-08-25T23:01:00.000Z",
          humanVisualReview: {
            reviewerName: "Devin",
            reviewerKind: "human" as const,
            humanAttestation: true as const,
            reviewedAt: "2026-08-25T23:01:00.000Z",
            buildSha256,
            criteria: {
              briefFidelity: { status: "pass" as const },
              visualHierarchy: { status: "pass" as const },
              spacingAndComposition: { status: "pass" as const },
              businessSpecificity: { status: "pass" as const },
              designAndReferenceAlignment: {
                status: "pass" as const,
                referenceContext: "explicit-no-reference" as const,
              },
            },
          },
        },
      ],
      artifact: {
        sourceCssArchitectureVersion: 1,
        buildSha256,
        checks: visualQaChecks("pass"),
      },
    };
    const provenance = {
      state: "promoted",
      layoutAuthority: "template-v1",
      buildSha256,
      promotedBuildSha256: buildSha256,
    };
    const emit = vi.fn();
    const assertApproved = vi.fn();

    await expect(continueTemplate("template-v1", runId, emit, {
      inspectCandidate: vi.fn().mockResolvedValue({ status: "present", provenance }),
      promoteCandidate: vi.fn(),
      materializePromotedTemplateVisualQa: vi.fn().mockResolvedValue(visualQa),
      inspectPromotedLiveBundle: vi.fn().mockResolvedValue({
        status: "present",
        manifest: { buildSha256 },
        provenance,
      }),
      loadRun: vi.fn().mockResolvedValue(run),
      buildRunProvenance: vi.fn().mockReturnValue({ schemaVersion: 1, runId }),
      assertVisualQaApprovedForBuild: assertApproved,
    } as never)).resolves.toBe(true);

    expect(assertApproved).toHaveBeenCalledWith(run, buildSha256);
    expect(emit).toHaveBeenCalledWith({
      type: "complete",
      runId,
      previewUrl: `/preview/${runId}`,
    });
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "paused" }),
    );
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

  it("persists and renders a meaningful recovery action once", async () => {
    const run = pendingRun("recovered-run");
    const recovery = {
      action: "resume-gates" as const,
      state: "ready-for-gates" as const,
      performedActions: ["candidate-reconciled" as const],
    };
    const appendEvent = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();
    const executePipeline = vi.fn().mockResolvedValue(undefined);
    await runPipeline("recovered-run", emit, {
      readEvents: vi.fn().mockResolvedValue([]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent,
      recoverCandidateState: vi.fn().mockResolvedValue(recovery),
      inspectCandidate: vi.fn().mockResolvedValue({ status: "absent" }),
      executePipeline,
    } as never);

    expect(appendEvent).toHaveBeenCalledWith(
      "recovered-run",
      expect.objectContaining({
        type: "lifecycle",
        outcomeClass: "recovery-action",
        status: "action",
        message: expect.stringContaining("candidate-reconciled"),
      }),
    );
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "lifecycle",
      outcomeClass: "recovery-action",
    }));
  });

  it("reprojects a durable recovery record when its event append was lost", async () => {
    const run = pendingRun("durable-recovery-run");
    const appendEvent = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();

    await runPipeline(run.id, emit, {
      readEvents: vi.fn().mockResolvedValue([]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent,
      loadCandidateRecoveryRecord: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        action: "resume-gates",
        state: "ready-for-gates",
        performedActions: ["candidate-reconciled"],
        at: "2026-08-24T12:00:00.000Z",
      }),
      recoverCandidateState: vi.fn().mockResolvedValue({
        action: "resume-gates",
        state: "ready-for-gates",
      }),
      inspectCandidate: vi.fn().mockResolvedValue({ status: "absent" }),
      executePipeline: vi.fn().mockResolvedValue(undefined),
    } as never);

    expect(appendEvent).toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({
        type: "lifecycle",
        outcomeClass: "recovery-action",
        message: expect.stringContaining("candidate-reconciled"),
      }),
    );
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "lifecycle",
      outcomeClass: "recovery-action",
    }));
  });

  it("does not let a stale durable block stop a now-healthy recovery", async () => {
    const run = pendingRun("resolved-recovery-run");
    const executePipeline = vi.fn().mockResolvedValue(undefined);
    const inspectCandidate = vi.fn().mockResolvedValue({ status: "absent" });
    const appendEvent = vi.fn().mockResolvedValue(undefined);

    await runPipeline(run.id, vi.fn(), {
      readEvents: vi.fn().mockResolvedValue([]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent,
      loadCandidateRecoveryRecord: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        action: "blocked",
        reason: "previous recovery block",
        performedActions: ["recovery-blocked"],
        at: "2026-08-24T12:00:00.000Z",
      }),
      recoverCandidateState: vi.fn().mockResolvedValue({ action: "absent" }),
      inspectCandidate,
      executePipeline,
    } as never);

    expect(appendEvent).not.toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({
        type: "lifecycle",
        outcomeClass: "recovery-action",
        status: "failed",
      }),
    );
    expect(inspectCandidate).toHaveBeenCalledOnce();
    expect(executePipeline).toHaveBeenCalledOnce();
  });

  it("renders a blocked recovery as a failure with no resume instruction", async () => {
    const run = pendingRun("blocked-recovery-run");
    const appendEvent = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();
    const inspectCandidate = vi.fn().mockRejectedValue(
      new Error("blocked recovery must not re-enter candidate inspection"),
    );
    const executePipeline = vi.fn();
    const staleComplete: PipelineEvent = {
      type: "complete",
      runId: run.id,
      previewUrl: `/preview/${run.id}`,
    };
    const earlierSameBlock: PipelineEvent = {
      type: "error",
      message: "Candidate recovery is blocked: promotion recovery is ambiguous",
    };

    await runPipeline(run.id, emit, {
      readEvents: vi.fn().mockResolvedValue([earlierSameBlock, staleComplete]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent,
      recoverCandidateState: vi.fn().mockResolvedValue({
        action: "blocked",
        reason: "promotion recovery is ambiguous",
        performedActions: ["recovery-blocked"],
      }),
      inspectCandidate,
      executePipeline,
    } as never);

    expect(appendEvent).toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({
        type: "lifecycle",
        outcomeClass: "recovery-action",
        status: "failed",
        nextAction: "Inspect the blocked recovery evidence before any retry or promotion.",
      }),
    );
    expect(appendEvent).toHaveBeenCalledWith(run.id, {
      type: "error",
      message: "Candidate recovery is blocked: promotion recovery is ambiguous",
    });
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "lifecycle",
      outcomeClass: "recovery-action",
      status: "failed",
    }));
    expect(emit).toHaveBeenCalledWith({
      type: "error",
      message: "Candidate recovery is blocked: promotion recovery is ambiguous",
    });
    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "complete",
    }));
    expect(emit).toHaveBeenCalledWith({ type: "cost", usd: run.costUsd });
    expect(inspectCandidate).not.toHaveBeenCalled();
    expect(executePipeline).not.toHaveBeenCalled();
  });

  it("reconstructs a durable fallback link before blocked recovery returns", async () => {
    const run = pendingRun("blocked-linked-fallback-run");
    run.layoutAuthority = "page-ir-v1";
    run.stages.built.status = "failed";
    run.stages.built.error = "candidate gates failed";
    run.templateFallback = {
      childRunId: "template-child",
      reason: "operator-requested-after-failure",
      failure: {
        stage: "built",
        message: "candidate gates failed",
      },
    };
    const appendEvent = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();
    const inspectCandidate = vi.fn();
    const executePipeline = vi.fn();

    await runPipeline(run.id, emit, {
      readEvents: vi.fn().mockResolvedValue([]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent,
      loadCandidateRecoveryRecord: vi.fn().mockResolvedValue(undefined),
      recoverCandidateState: vi.fn().mockResolvedValue({
        action: "blocked",
        reason: "promotion recovery is ambiguous",
        performedActions: ["recovery-blocked"],
      }),
      inspectCandidate,
      executePipeline,
    } as never);

    expect(appendEvent).toHaveBeenCalledWith(run.id, expect.objectContaining({
      type: "fallback-created",
      sourceRunId: run.id,
      fallbackRunId: "template-child",
    }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "fallback-created",
      fallbackRunId: "template-child",
    }));
    expect(inspectCandidate).not.toHaveBeenCalled();
    expect(executePipeline).not.toHaveBeenCalled();
  });

  it("reconnects a PageIR approval pause from real disk without model cost or durable writes", async () => {
    const runId = `replay-disk-${process.pid}-${Date.now().toString(36)}`;
    const roots = sitePaths(runId);
    try {
      await createRun({
        id: runId,
        layoutAuthority: "page-ir-v1",
        pageIrRolloutPermitted: true,
      });
      await saveArtifact(runId, "intake.json", disabledResearchIntake);
      const pause: PipelineEvent = {
        type: "paused",
        runId,
        workflowStage: "evidence",
        workspaceUrl: `/evidence/${runId}`,
        note: "ledger is ready for review",
      };
      await appendEvent(runId, pause);
      const runBytesBefore = await fs.readFile(path.join(roots.root, "run.json"));
      const eventsBefore = await readEvents(runId);
      modelMocks.generateJson.mockClear();
      const emit = vi.fn();

      await runPipeline(runId, emit);

      expect(emit).toHaveBeenCalledWith(pause);
      expect(emit).toHaveBeenCalledWith({ type: "cost", usd: 0 });
      expect(modelMocks.generateJson).not.toHaveBeenCalled();
      expect((await loadRun(runId)).costUsd).toBe(0);
      expect(await fs.readFile(path.join(roots.root, "run.json"))).toEqual(
        runBytesBefore,
      );
      expect(await readEvents(runId)).toEqual(eventsBefore);
    } finally {
      await fs.rm(roots.root, { recursive: true, force: true });
    }
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

  it("drops a legacy embedUrl while preserving the key-free fallback on replay", () => {
    const legacyCard = {
      type: "card",
      stage: "scanned",
      title: "Market structure",
      body: "Historic map card",
      map: {
        embedUrl: "https://www.google.com/maps/embed/v1/search?key=legacy-key&q=plumber",
        fallbackUrl:
          "https://www.google.com/maps/search/?api=1&query=plumber%20in%20Austin%2C%20TX",
        pins: [{ name: "Acme Plumbing", lat: 30.2672, lng: -97.7431 }],
      },
    } as unknown as PipelineEvent;

    expect(projectPipelineReplayEvents([legacyCard])).toEqual([
      {
        type: "card",
        stage: "scanned",
        title: "Market structure",
        body: "Historic map card",
        map: {
          fallbackUrl:
            "https://www.google.com/maps/search/?api=1&query=plumber%20in%20Austin%2C%20TX",
          pins: [{ name: "Acme Plumbing", lat: 30.2672, lng: -97.7431 }],
        },
      },
    ]);
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
    const {
      run,
      complete,
      exactLive,
      executePipeline,
      dependencies,
    } = pageIrCompletionHarness();
    const emit = vi.fn();

    await runPipeline(run.id, emit, dependencies as never);

    expect(emit).toHaveBeenCalledWith(complete);
    expect(executePipeline).not.toHaveBeenCalled();

    for (const mismatch of [
      "gateReportSha256",
      "pageIrSha256",
      "promotedBuildSha256",
      "receiptBuildSha256",
    ] as const) {
      const mismatchLive = structuredClone(exactLive);
      if (mismatch === "gateReportSha256") {
        mismatchLive.provenance.gateReportSha256 = "f".repeat(64);
      } else if (mismatch === "pageIrSha256") {
        mismatchLive.provenance.pageIrSha256 = "f".repeat(64);
      } else if (mismatch === "promotedBuildSha256") {
        mismatchLive.provenance.promotedBuildSha256 = "f".repeat(64);
      } else {
        mismatchLive.receipt.buildSha256 = "f".repeat(64);
      }
      dependencies.inspectPromotedLiveBundle.mockResolvedValueOnce(mismatchLive);
      executePipeline.mockClear();
      const mismatchEmit = vi.fn();

      await runPipeline(run.id, mismatchEmit, dependencies as never);

      expect(executePipeline, mismatch).toHaveBeenCalledOnce();
      expect(mismatchEmit, mismatch).not.toHaveBeenCalledWith(complete);
    }
  });

  it.each([
    {
      name: "the current Source Bundle is missing",
      mutate: (harness: ReturnType<typeof pageIrCompletionHarness>) => {
        harness.dependencies.loadPageIrSourceBundleForReview.mockRejectedValue({
          code: "ENOENT",
        });
      },
    },
    {
      name: "the current Source Bundle is not approved",
      mutate: (harness: ReturnType<typeof pageIrCompletionHarness>) => {
        harness.dependencies.loadPageIrSourceBundleForReview.mockResolvedValue({
          reviewState: "draft",
          bundle: { payloadSha256: "b".repeat(64) },
          sources: {},
        });
      },
    },
    {
      name: "a PageIR candidate is absent even on a legacy-shaped run",
      mutate: (harness: ReturnType<typeof pageIrCompletionHarness>) => {
        harness.run.pipelineVersion = "legacy-v1";
        for (const stage of Object.values(harness.run.stages)) {
          stage.status = "done";
        }
        harness.dependencies.inspectCandidate.mockResolvedValue({
          status: "absent",
        });
      },
    },
    {
      name: "a legacy-shaped PageIR run lacks current visual approval",
      mutate: (harness: ReturnType<typeof pageIrCompletionHarness>) => {
        harness.run.pipelineVersion = "legacy-v1";
        for (const stage of Object.values(harness.run.stages)) {
          stage.status = "done";
        }
        const visualQa = harness.run.evidenceWorkflow.artifacts[0];
        if (!visualQa || visualQa.artifactType !== "visual-qa") {
          throw new Error("visual QA fixture missing");
        }
        visualQa.approvalTransitions = [
          { state: "draft", at: "2026-08-23T12:00:00.000Z" },
        ];
      },
    },
    {
      name: "persisted PageIR differs from candidate and live provenance",
      mutate: (harness: ReturnType<typeof pageIrCompletionHarness>) => {
        harness.dependencies.loadPersistedPageIr.mockResolvedValue({
          pageIrSha256: "f".repeat(64),
        });
      },
    },
    {
      name: "visual approval has no named-human attestation",
      mutate: (harness: ReturnType<typeof pageIrCompletionHarness>) => {
        const visualQa = harness.run.evidenceWorkflow.artifacts[0];
        if (!visualQa || visualQa.artifactType !== "visual-qa") {
          throw new Error("visual QA fixture missing");
        }
        delete visualQa.approvalTransitions.at(-1)!.humanVisualReview;
      },
    },
    {
      name: "approved visual QA still contains pending checks",
      mutate: (harness: ReturnType<typeof pageIrCompletionHarness>) => {
        const visualQa = harness.run.evidenceWorkflow.artifacts[0];
        if (!visualQa || visualQa.artifactType !== "visual-qa") {
          throw new Error("visual QA fixture missing");
        }
        visualQa.artifact.checks = visualQaChecks("pending");
      },
    },
  ])("does not replay recorded PageIR completion when $name", async ({ mutate }) => {
    const harness = pageIrCompletionHarness();
    mutate(harness);
    const emit = vi.fn();

    await runPipeline(
      harness.run.id,
      emit,
      harness.dependencies as never,
    );

    expect(harness.executePipeline).toHaveBeenCalledOnce();
    expect(emit).not.toHaveBeenCalledWith(harness.complete);
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

  it("does not treat an older build pause as current after a PageIR source pause", () => {
    const buildPause: PipelineEvent = {
      type: "paused",
      runId: "run-test",
      workflowStage: "build",
      workspaceUrl: "/evidence/run-test",
      note: "build approval ready",
    };
    const sourcePause: PipelineEvent = {
      type: "page-ir-source-paused",
      runId: "run-test",
      stage: "built",
      reviewState: "draft",
      payloadSha256: "a".repeat(64),
      workspaceUrl: "/evidence/run-test",
      note: "source review ready",
    };

    expect(
      replayedPauseIsCurrent([buildPause, sourcePause], {
        id: "run-test",
        pipelineVersion: "evidence-gated-v2",
        currentStage: "build",
        referencePending: false,
      }),
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

  it("keeps the current terminal when later records only supplement observability", () => {
    const error: PipelineEvent = { type: "error", message: "candidate gates failed" };
    const fallback: PipelineEvent = {
      type: "fallback-created",
      stage: "built",
      sourceRunId: "source-run",
      fallbackRunId: "template-child",
      reason: "operator-requested-after-failure",
      failedStage: "built",
      at: "2026-08-24T12:00:00.000Z",
    };
    const recovery: PipelineEvent = {
      type: "lifecycle",
      stage: "built",
      outcomeClass: "recovery-action",
      status: "action",
      message: "Recovery reconciled a failed candidate.",
      nextAction: "Review the recorded recovery result.",
      at: "2026-08-24T12:01:00.000Z",
    };

    expect(projectPipelineReplayEvents([error, fallback, recovery]))
      .toEqual([error, fallback, recovery]);
  });

  it("reconnects a linked failed Page IR source without duplicating its terminal", async () => {
    const run = pendingRun("linked-failed-source");
    run.layoutAuthority = "page-ir-v1";
    run.stages.built.status = "failed";
    run.templateFallback = {
      childRunId: "template-child",
      reason: "operator-requested-after-failure",
      failure: {
        stage: "built",
        message: "candidate gates failed",
        messageSha256: "a".repeat(64),
      },
    };
    const error: PipelineEvent = { type: "error", message: "candidate gates failed" };
    const fallback: PipelineEvent = {
      type: "fallback-created",
      stage: "built",
      sourceRunId: run.id,
      fallbackRunId: "template-child",
      reason: "operator-requested-after-failure",
      failedStage: "built",
      at: "2026-08-24T12:00:00.000Z",
    };
    const appendEvent = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();
    const executePipeline = vi.fn().mockResolvedValue(undefined);

    await runPipeline(run.id, emit, {
      readEvents: vi.fn().mockResolvedValue([error, fallback]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent,
      inspectCandidate: vi.fn().mockResolvedValue({
        status: "present",
        provenance: {
          runId: run.id,
          layoutAuthority: "page-ir-v1",
          state: "failed",
          inputArtifactHashes: [{ path: "page-ir.json", sha256: "b".repeat(64) }],
          pageIrSha256: "b".repeat(64),
          compilerVersion: "page-ir-static@3",
          candidateManifestSha256: "c".repeat(64),
          buildSha256: "d".repeat(64),
          gateReportSha256: "e".repeat(64),
        },
      }),
      executePipeline,
    } as never);

    expect(appendEvent).not.toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({ type: "error" }),
    );
    expect(emit).toHaveBeenCalledWith(error);
    expect(emit).toHaveBeenCalledWith(fallback);
    expect(executePipeline).not.toHaveBeenCalled();
  });

  it("parks a linked Page IR source whose failed candidate is absent", async () => {
    const run = pendingRun("linked-absent-candidate-source");
    run.layoutAuthority = "page-ir-v1";
    run.stages.built.status = "failed";
    run.stages.built.error = "candidate creation failed";
    run.templateFallback = {
      childRunId: "template-child",
      reason: "operator-requested-after-failure",
      failure: {
        stage: "built",
        message: "candidate creation failed",
      },
    };
    const error: PipelineEvent = {
      type: "error",
      message: "candidate creation failed",
    };
    const appendEvent = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();
    const executePipeline = vi.fn().mockResolvedValue(undefined);

    await runPipeline(run.id, emit, {
      readEvents: vi.fn().mockResolvedValue([error]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent,
      recoverCandidateState: vi.fn().mockResolvedValue({ action: "absent" }),
      inspectCandidate: vi.fn().mockResolvedValue({ status: "absent" }),
      executePipeline,
    } as never);

    expect(appendEvent).toHaveBeenCalledWith(run.id, expect.objectContaining({
      type: "fallback-created",
      fallbackRunId: "template-child",
    }));
    expect(emit).toHaveBeenCalledWith(error);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "fallback-created",
      fallbackRunId: "template-child",
    }));
    expect(executePipeline).not.toHaveBeenCalled();
  });

  it("reconstructs missing fallback and linked provenance events from durable state", async () => {
    const run = pendingRun("linked-provenance-source");
    run.layoutAuthority = "page-ir-v1";
    run.stages.built.status = "failed";
    run.templateFallback = {
      childRunId: "template-child",
      reason: "operator-requested-after-failure",
      failure: {
        stage: "built",
        message: "candidate gates failed",
        messageSha256: "a".repeat(64),
      },
    };
    const error: PipelineEvent = { type: "error", message: "candidate gates failed" };
    const appendEvent = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();

    await runPipeline(run.id, emit, {
      readEvents: vi.fn().mockResolvedValue([error]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
      appendEvent,
      inspectCandidate: vi.fn().mockResolvedValue({
        status: "present",
        provenance: {
          runId: run.id,
          layoutAuthority: "page-ir-v1",
          state: "failed",
          inputArtifactHashes: [{ path: "page-ir.json", sha256: "b".repeat(64) }],
          pageIrSha256: "b".repeat(64),
          compilerVersion: "page-ir-static@3",
          candidateManifestSha256: "c".repeat(64),
          buildSha256: "d".repeat(64),
          gateReportSha256: "e".repeat(64),
        },
      }),
      executePipeline: vi.fn().mockResolvedValue(undefined),
    } as never);

    expect(appendEvent).toHaveBeenCalledWith(run.id, expect.objectContaining({
      type: "fallback-created",
      fallbackRunId: "template-child",
    }));
    expect(appendEvent).toHaveBeenCalledWith(run.id, expect.objectContaining({
      type: "provenance",
      provenance: expect.objectContaining({
        fallback: expect.objectContaining({
          relationship: "source",
          linkedRunId: "template-child",
        }),
      }),
    }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "fallback-created",
    }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "provenance",
    }));
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

  it("replays a recorded template completion when its promoted live bundle is exact", async () => {
    const harness = pageIrCompletionHarness();
    harness.run.id = "template-promoted-run";
    harness.run.layoutAuthority = "template-v1";
    const complete: PipelineEvent = {
      type: "complete",
      runId: harness.run.id,
      previewUrl: `/preview/${harness.run.id}`,
    };
    harness.dependencies.readEvents.mockResolvedValue([complete]);
    const emit = vi.fn();

    await runPipeline(harness.run.id, emit, harness.dependencies as never);

    expect(emit).toHaveBeenCalledWith(complete);
    expect(emit).toHaveBeenCalledWith({ type: "cost", usd: 0 });
    expect(harness.dependencies.inspectPromotedLiveBundle).toHaveBeenCalledOnce();
    expect(harness.dependencies.appendEvent).not.toHaveBeenCalledWith(
      harness.run.id,
      expect.objectContaining({ type: "error" }),
    );
    expect(harness.executePipeline).not.toHaveBeenCalled();
  });

  it("resumes a promotable template candidate so local promotion can finish", async () => {
    const run = pendingRun("promotable-run");
    for (const stage of Object.values(run.stages)) stage.status = "done";
    run.evidenceWorkflow.currentStage = "build";
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
    expect(executePipeline).toHaveBeenCalledOnce();
    expect(order).toEqual(["recover", "inspect"]);
  });

  it.each(["promotable", "promoted"] as const)(
    "resumes an over-cap %s template candidate because continuation adds no spend",
    async (candidateState) => {
    const run = pendingRun("promotable-over-cap-run");
    run.costUsd = 4;
    run.costCapUsd = 3;
    run.stages.built.status = "done";
    run.evidenceWorkflow.currentStage = "build";
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
        provenance: { state: candidateState },
      }),
      executePipeline,
    } as never);

    expect(emit).toHaveBeenCalledWith(progress);
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "complete" }),
    );
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
    expect(appendEvent).not.toHaveBeenCalled();
    expect(executePipeline).toHaveBeenCalledOnce();
    },
  );

  it("resumes a promoted template after the recorded build pause is human-approved", async () => {
    const harness = pageIrCompletionHarness();
    harness.run.id = "template-approved-after-pause";
    harness.run.layoutAuthority = "template-v1";
    const pause: PipelineEvent = {
      type: "paused",
      runId: harness.run.id,
      workflowStage: "build",
      workspaceUrl: `/evidence/${harness.run.id}`,
      note: "Visual QA is ready for review.",
    };
    harness.dependencies.readEvents.mockResolvedValue([pause]);
    const emit = vi.fn();

    await runPipeline(harness.run.id, emit, harness.dependencies as never);

    expect(harness.executePipeline).toHaveBeenCalledOnce();
    expect(emit).not.toHaveBeenCalledWith(pause);
  });

  it.each([
    {
      name: "built stage is not durably done",
      mutate: (run: RunState) => {
        run.evidenceWorkflow.currentStage = "build";
        run.stages.built.status = "running";
      },
    },
    {
      name: "workflow has not reached build",
      mutate: (run: RunState) => {
        run.evidenceWorkflow.currentStage = "evidence";
        run.stages.built.status = "done";
      },
    },
  ])(
    "keeps the spend cap active when a promotable candidate exists but $name",
    async ({ mutate }) => {
      const run = pendingRun("unsafe-over-cap-candidate");
      run.costUsd = 4;
      run.costCapUsd = 3;
      mutate(run);
      const emit = vi.fn();
      const appendEvent = vi.fn().mockResolvedValue(undefined);
      const executePipeline = vi.fn().mockResolvedValue(undefined);

      await runPipeline(run.id, emit, {
        readEvents: vi.fn().mockResolvedValue([]),
        loadRun: vi.fn().mockResolvedValue(run),
        loadArtifact: vi.fn().mockResolvedValue(disabledResearchIntake),
        appendEvent,
        inspectCandidate: vi.fn().mockResolvedValue({
          status: "present",
          provenance: { state: "promotable" },
        }),
        executePipeline,
      } as never);

      expect(executePipeline).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" }),
      );
      expect(appendEvent).toHaveBeenCalledWith(
        run.id,
        expect.objectContaining({ type: "error" }),
      );
    },
  );

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
      expect(executePipeline).toHaveBeenCalledOnce();
    },
  );

});
