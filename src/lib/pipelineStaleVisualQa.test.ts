import { describe, expect, it, vi } from "vitest";
import type { Intake, PipelineEvent, RunState } from "./contracts";

const harness = vi.hoisted(() => ({
  run: undefined as RunState | undefined,
  intake: undefined as Intake | undefined,
}));

vi.mock("./runstate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./runstate")>();
  return {
    ...actual,
    loadRun: vi.fn(async () => harness.run!),
    loadArtifact: vi.fn(async (_runId: string, artifactPath: string) =>
      artifactPath === "intake.json" ? harness.intake : {},
    ),
    readEvents: vi.fn(async () => []),
    appendEvent: vi.fn(async () => undefined),
    stageDone: vi.fn(async (_runId: string, stage: string) =>
      stage === "scanned" || stage === "locked",
    ),
  };
});

vi.mock("./candidate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./candidate")>();
  return {
    ...actual,
    inspectCandidate: vi.fn(async () => ({
      status: "present",
      provenance: { state: "failed" },
    })),
  };
});

import { runPipeline } from "./pipeline";

const intake = {
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

function staleQaRun(): RunState {
  return {
    id: "stale-qa-run",
    createdAt: "2026-08-14T12:00:00.000Z",
    pipelineVersion: "evidence-gated-v2",
    stages: Object.fromEntries(
      ["intake", "scanned", "locked", "synthesized", "built", "edited"].map(
        (stage) => [stage, { status: "pending", retries: 0, gateRepairAttempts: 0 }],
      ),
    ) as RunState["stages"],
    costUsd: 0,
    costCapUsd: 3,
    modelSlugs: {},
    referenceMode: "refero",
    evidenceWorkflow: {
      currentStage: "build",
      artifacts: [
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
      ],
    },
    referencePickerEnabled: false,
    layoutAuthority: "template-v1",
  };
}

describe("evidence-gated stale visual QA", () => {
  it("does not complete or pause before rebuilding a non-built candidate", async () => {
    harness.run = staleQaRun();
    harness.intake = intake;
    const events: PipelineEvent[] = [];

    await expect(
      runPipeline("stale-qa-run", (event) => events.push(event)),
    ).rejects.toThrow("approved design contract missing");

    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "complete" }),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({ previewUrl: "/preview/stale-qa-run" }),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "paused" }),
    );
  });
});
