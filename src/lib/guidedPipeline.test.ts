import { describe, expect, it } from "vitest";
import {
  IntakeSchema,
  MarketAnalysisSchema,
  ReferenceSelectionStateSchema,
  RunStateSchema,
  ScanResultSchema,
  StageStatusSchema,
} from "./contracts";
import { deriveGuidedPipeline } from "./guidedPipeline";

const now = "2026-08-25T12:00:00.000Z";

function stage(status: "pending" | "running" | "done" | "failed", error?: string) {
  return StageStatusSchema.parse({ status, error });
}

function referenceVersion() {
  return {
    version: 1,
    createdAt: now,
    searchAngles: ["a", "b", "c"],
    candidates: ["alpha", "beta"].map((referoId, index) => ({
      referoId,
      kind: "style" as const,
      name: referoId === "alpha" ? "Alpha" : "Beta",
      foundVia: index === 0 ? "a" : "b",
      palette: [{ hex: "#112233", plainLabel: "dark" }, { hex: "#ddeeff", plainLabel: "light" }],
      plainLanguageProfile: { headline: "Calm", feelSummary: "Clear", bestFor: ["service firms"], headsUp: [] },
      composition: { northStar: "Clear", preserveTraits: ["space", "clear actions"], rhythmNote: "steady" },
      recommended: index === 0,
      ...(index === 0 ? { recommendedWhy: "Fit" } : {}),
    })),
  };
}

function run() {
  return RunStateSchema.parse({
    id: "run-1234",
    createdAt: now,
    pipelineVersion: "evidence-gated-v2",
    stages: {
      intake: { status: "done" },
      scanned: { status: "running" },
      locked: { status: "pending" },
      synthesized: { status: "pending" },
      built: { status: "pending" },
      edited: { status: "pending" },
    },
    modelSlugs: {},
    referencePickerEnabled: true,
  });
}

const intake = IntakeSchema.parse({
  businessName: "Northstar Plumbing",
  category: "plumber",
  location: "Portland, OR",
  services: ["Emergency repairs"],
  primaryAction: "quote",
});

describe("guided pipeline projection", () => {
  it("derives honest research running, disabled, and failed surfaces", () => {
    expect(deriveGuidedPipeline({ run: run(), intake }).surface).toMatchObject({
      kind: "research-running",
    });
    expect(
      deriveGuidedPipeline({
        run: run(),
        intake: { ...intake, research: { ...intake.research, enabled: false } },
      }).surface,
    ).toMatchObject({ kind: "research-disabled" });
    const failed = run();
    failed.stages.scanned = stage("failed", "crawl failed");
    expect(deriveGuidedPipeline({ run: failed, intake }).surface).toMatchObject({
      kind: "stage-failed",
      stage: "scanned",
    });
  });

  it("shows deep market leaders and falls back to a legacy scan", () => {
    const state = run();
    state.stages.scanned = stage("done");
    const marketAnalysis = MarketAnalysisSchema.parse({
      schemaVersion: 1,
      status: "ready",
      generatedAt: now,
      displayCutoff: 4,
      competitors: [],
      commonPatterns: ["clear services"],
      gaps: [],
    });
    expect(
      deriveGuidedPipeline({ run: state, intake, marketAnalysis }).surface,
    ).toMatchObject({ kind: "market-leaders", source: "market-analysis" });

    const scan = ScanResultSchema.parse({
      competitors: [],
      commonSections: ["hero", "services"],
      gaps: ["weak proof"],
      excluded: [],
    });
    expect(deriveGuidedPipeline({ run: state, intake, scan }).surface).toMatchObject({
      kind: "market-leaders",
      source: "legacy-scan",
    });
  });

  it("distinguishes reference choice from applying committed preferences", () => {
    const pending = run();
    pending.stages.scanned = stage("done");
    pending.referenceSelection = ReferenceSelectionStateSchema.parse({
      status: "pending",
      rerollsUsed: 0,
      versions: [referenceVersion()],
    });
    expect(deriveGuidedPipeline({ run: pending, intake }).surface).toMatchObject({
      kind: "reference-pending",
    });

    const applying = run();
    applying.stages.scanned = stage("done");
    applying.stages.locked = stage("running");
    applying.referenceSelection = ReferenceSelectionStateSchema.parse({
      status: "selected",
      rerollsUsed: 0,
      versions: [referenceVersion()],
      selection: {
        selectedId: "alpha",
        selectionKind: "user-picked-recommended",
        version: 1,
        at: now,
      },
    });
    expect(deriveGuidedPipeline({ run: applying, intake }).surface).toMatchObject({
      kind: "applying-preferences",
    });
  });

  it("classifies cost/config failures and fails closed for impossible state", () => {
    const cost = run();
    cost.stages.scanned = stage("failed", "cost $3.10 exceeded cap $3.00");
    expect(deriveGuidedPipeline({ run: cost, intake }).surface).toMatchObject({
      kind: "cost-cap-error",
    });
    const config = run();
    config.stages.scanned = stage("failed", "OPENROUTER_API_KEY not set");
    expect(deriveGuidedPipeline({ run: config, intake }).surface).toMatchObject({
      kind: "configuration-error",
    });
    const impossible = run();
    impossible.stages.scanned = stage("done");
    impossible.stages.locked = stage("done");
    impossible.stages.synthesized = stage("done");
    impossible.stages.built = stage("pending");
    impossible.evidenceWorkflow.currentStage = "evidence";
    expect(deriveGuidedPipeline({ run: impossible, intake }).surface).toMatchObject({
      kind: "state-unavailable",
    });
  });

  it("projects a completed run with its preview route", () => {
    const complete = run();
    for (const stage of ["scanned", "locked", "synthesized", "built"] as const) {
      complete.stages[stage] = StageStatusSchema.parse({ status: "done" });
    }
    expect(deriveGuidedPipeline({ run: complete, intake }).surface).toEqual({
      kind: "complete",
      previewUrl: "/preview/run-1234",
    });
  });
});
