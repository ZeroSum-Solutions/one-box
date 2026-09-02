import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => vi.unstubAllEnvs());

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

  it("exposes a market map immediately after intake while discovery is running", () => {
    expect(deriveGuidedPipeline({ run: run(), intake })).toMatchObject({
      surface: { kind: "research-running" },
      marketContext: {
        source: "discovery",
        analysisStatus: "discovering",
        mapQuery: "plumber in Portland, OR",
      },
    });
  });

  it("falls back to the external map when the derived embed query is invalid", () => {
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "test-embed-key");
    expect(deriveGuidedPipeline({
      run: run(),
      intake: { ...intake, category: "x".repeat(201) },
    }).mapEmbedConfigured).toBe(false);
  });

  it("exposes progressively persisted competitor links while scanning", () => {
    const partialScan = ScanResultSchema.parse({
      competitors: [{
        name: "Alpha Plumbing",
        url: "https://alpha.example",
        source: "plumber Portland",
        kind: "unknown",
        kindReason: "no editorial signal — treated as a business",
        mapsSearchUrl: "https://www.google.com/maps/search/?api=1&query=Alpha",
      }],
      commonSections: [],
      gaps: [],
      excluded: [],
    });
    expect(deriveGuidedPipeline({ run: run(), intake, scan: partialScan })).toMatchObject({
      surface: { kind: "research-running" },
      marketContext: {
        source: "legacy-scan",
        scan: { competitors: [{ url: "https://alpha.example" }] },
        mapQuery: "plumber in Portland, OR",
      },
    });
  });

  it("keeps persisted market evidence visible when intake metadata is temporarily unavailable", () => {
    const partialScan = ScanResultSchema.parse({
      competitors: [{
        name: "Alpha Plumbing",
        url: "https://alpha.example",
        source: "plumber Portland",
        kind: "unknown",
        kindReason: "no editorial signal — treated as a business",
      }],
      commonSections: [],
      gaps: [],
      excluded: [],
    });

    expect(deriveGuidedPipeline({ run: run(), scan: partialScan })).toMatchObject({
      marketContext: {
        source: "legacy-scan",
        scan: { competitors: [{ url: "https://alpha.example" }] },
      },
    });
  });

  it("keeps completed market research visible through reference and build stages", () => {
    const pending = run();
    pending.stages.scanned = stage("done");
    pending.referenceSelection = ReferenceSelectionStateSchema.parse({
      status: "pending",
      rerollsUsed: 0,
      versions: [referenceVersion()],
    });
    const marketAnalysis = MarketAnalysisSchema.parse({
      schemaVersion: 1,
      status: "ready",
      generatedAt: now,
      displayCutoff: 4,
      competitors: [],
      commonPatterns: ["clear service paths"],
      gaps: [],
    });
    expect(deriveGuidedPipeline({ run: pending, intake, marketAnalysis })).toMatchObject({
      surface: { kind: "reference-pending" },
      marketContext: {
        source: "market-analysis",
        analysisStatus: "ready",
        marketAnalysis: { commonPatterns: ["clear service paths"] },
      },
    });

    const building = run();
    building.stages.scanned = stage("done");
    building.stages.locked = stage("done");
    building.evidenceWorkflow.currentStage = "contract";
    expect(deriveGuidedPipeline({ run: building, intake, marketAnalysis })).toMatchObject({
      marketContext: {
        source: "market-analysis",
        marketAnalysis: { commonPatterns: ["clear service paths"] },
      },
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

  it("does not report an evidence-gated build complete before visual QA approval", () => {
    const complete = run();
    for (const stage of ["scanned", "locked", "synthesized", "built"] as const) {
      complete.stages[stage] = StageStatusSchema.parse({ status: "done" });
    }
    complete.evidenceWorkflow.currentStage = "build";
    expect(deriveGuidedPipeline({ run: complete, intake }).surface).toEqual({
      kind: "workflow-running",
      stage: "build",
      artifactType: "visual-qa",
    });
  });

  it("does not report an evidence-gated build complete without a promoted candidate", () => {
    const complete = run();
    for (const stage of ["scanned", "locked", "synthesized", "built"] as const) {
      complete.stages[stage] = StageStatusSchema.parse({ status: "done" });
    }
    complete.evidenceWorkflow.currentStage = "build";
    complete.evidenceWorkflow.artifacts = [{
      artifactType: "visual-qa",
      version: 1,
      createdAt: now,
      approvalTransitions: [
        { state: "draft", at: now },
        {
          state: "approved",
          at: now,
          humanVisualReview: {
            reviewerName: "Owner",
            reviewerKind: "human",
            humanAttestation: true,
            reviewedAt: now,
            buildSha256: "a".repeat(64),
            criteria: {
              briefFidelity: { status: "pass" },
              visualHierarchy: { status: "pass" },
              spacingAndComposition: { status: "pass" },
              businessSpecificity: { status: "pass" },
              designAndReferenceAlignment: { status: "pass", referenceContext: "explicit-no-reference" },
            },
          },
        },
      ],
      artifact: { sourceCssArchitectureVersion: 1, buildSha256: "a".repeat(64), checks: [] },
    }];
    expect(deriveGuidedPipeline({ run: complete, intake, candidateState: "absent" }).surface).toEqual({
      kind: "state-unavailable",
      message: "The verified live website is missing or invalid.",
    });
    expect(deriveGuidedPipeline({ run: complete, intake, candidateState: "promoted" }).surface).toEqual({
      kind: "complete",
      previewUrl: "/preview/run-1234",
    });
  });

  it("projects a completed legacy run with its preview route", () => {
    const complete = run();
    complete.pipelineVersion = "legacy-v1";
    for (const stage of ["scanned", "locked", "synthesized", "built"] as const) {
      complete.stages[stage] = StageStatusSchema.parse({ status: "done" });
    }
    expect(deriveGuidedPipeline({ run: complete, intake }).surface).toEqual({
      kind: "complete",
      previewUrl: "/preview/run-1234",
    });
  });
});
