import { describe, expect, it, vi } from "vitest";
import type { Intake, PipelineEvent, RunState } from "./contracts";
import {
  projectPipelineReplayEvents,
  replayedConfigurationErrorIsCurrent,
  replayedPauseIsCurrent,
  runPipeline,
} from "./pipeline";

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

  it("durably appends synthesized gated completion before emitting it", async () => {
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
    let finishAppend!: () => void;
    const appendBlocked = new Promise<void>((resolve) => {
      finishAppend = resolve;
    });
    const appendEvent = vi.fn(async () => appendBlocked);
    const emit = vi.fn();
    const execution = runPipeline("complete-run", emit, {
      readEvents: vi.fn().mockResolvedValue([]),
      loadRun: vi.fn().mockResolvedValue(run),
      loadArtifact: vi.fn(),
      appendEvent,
      executePipeline: vi.fn(),
    });

    await vi.waitFor(() => expect(appendEvent).toHaveBeenCalledOnce());
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "complete" })
    );
    finishAppend();
    await execution;
    expect(emit).toHaveBeenCalledWith({
      type: "complete",
      runId: "complete-run",
      previewUrl: "/preview/complete-run",
    });
  });

});
