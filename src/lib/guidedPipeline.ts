import {
  EVIDENCE_STAGE_ARTIFACT,
  workflowArtifactApprovalState,
  type EvidenceWorkflowStage,
  type Intake,
  type MarketAnalysis,
  type ReferenceSelectionState,
  type RunState,
  type ScanResult,
  type Stage,
  type WorkflowArtifactType,
} from "./contracts";
import { MapEmbedQuerySchema, mapsEmbedConfigured } from "./tools/mapEmbed";

export interface GuidedMarketContext {
  source: "market-analysis" | "legacy-scan" | "discovery";
  analysisStatus: "discovering" | "ready";
  marketAnalysis?: MarketAnalysis;
  scan?: ScanResult;
  mapQuery: string;
}

export type GuidedSurface =
  | { kind: "intake-running" }
  | { kind: "research-running" }
  | { kind: "research-disabled" }
  | {
      kind: "market-leaders";
      source: "market-analysis" | "legacy-scan";
      marketAnalysis?: MarketAnalysis;
      scan?: ScanResult;
      mapQuery: string;
    }
  | { kind: "reference-pending"; selection: ReferenceSelectionState }
  | { kind: "applying-preferences"; selection: ReferenceSelectionState }
  | {
      kind: "workflow-running";
      stage: EvidenceWorkflowStage;
      artifactType: WorkflowArtifactType;
    }
  | {
      kind: "approval-pending";
      stage: EvidenceWorkflowStage;
      artifactType: WorkflowArtifactType;
      version: number;
      state: "draft" | "revision-requested";
      workspaceUrl: string;
    }
  | { kind: "synthesis-running" }
  | { kind: "build-running" }
  | { kind: "candidate-parked"; previewUrl?: string }
  | {
      kind: "stage-failed";
      stage: Stage;
      message: string;
    }
  | { kind: "cost-cap-error"; stage: Stage; message: string }
  | { kind: "configuration-error"; stage: Stage; message: string }
  | { kind: "fallback"; childRunId: string; previewUrl: string }
  | { kind: "complete"; previewUrl: string }
  | { kind: "state-unavailable"; message: string };

export interface GuidedPipelineProjection {
  runId: string;
  businessName?: string;
  costUsd: number;
  mapEmbedConfigured: boolean;
  marketContext?: GuidedMarketContext;
  surface: GuidedSurface;
}

function failureSurface(run: RunState): GuidedSurface | undefined {
  for (const stage of [
    "intake",
    "scanned",
    "locked",
    "synthesized",
    "built",
  ] as const) {
    const state = run.stages[stage];
    if (state.status !== "failed") continue;
    const message = state.error?.trim() || `${stage} failed`;
    if (/cost\b.*(?:exceeded|cap)|exceeded\s+cap/i.test(message)) {
      return { kind: "cost-cap-error", stage, message };
    }
    if (/(?:api[_ -]?key|credential|configuration|config\b|not set|missing key)/i.test(message)) {
      return { kind: "configuration-error", stage, message };
    }
    return { kind: "stage-failed", stage, message };
  }
  return undefined;
}

function currentWorkflowSurface(run: RunState): GuidedSurface | undefined {
  if (run.pipelineVersion !== "evidence-gated-v2") return undefined;
  const stage = run.evidenceWorkflow.currentStage;
  const artifactType = EVIDENCE_STAGE_ARTIFACT[stage];
  const latest = run.evidenceWorkflow.artifacts
    .filter((artifact) => artifact.artifactType === artifactType)
    .sort((left, right) => right.version - left.version)[0];
  if (!latest) {
    if (run.stages.synthesized.status === "done" && stage !== "build") {
      return {
        kind: "state-unavailable",
        message: "The durable workflow checkpoint does not match the completed pipeline stage.",
      };
    }
    return { kind: "workflow-running", stage, artifactType };
  }
  const approval = workflowArtifactApprovalState(latest);
  if (approval === "draft" || approval === "revision-requested") {
    return {
      kind: "approval-pending",
      stage,
      artifactType,
      version: latest.version,
      state: approval,
      workspaceUrl: `/evidence/${run.id}`,
    };
  }
  return undefined;
}

export function deriveGuidedPipeline(input: {
  run: RunState;
  intake?: Intake;
  marketAnalysis?: MarketAnalysis;
  scan?: ScanResult;
  candidateState?: "absent" | "preparing" | "ready-for-gates" | "promotable" | "promoted" | "failed" | "abandoned";
}): GuidedPipelineProjection {
  const { run, intake, marketAnalysis, scan } = input;
  const mapQuery = `${intake?.category ?? "business"} in ${intake?.location ?? "the selected market"}`;
  const marketContext: GuidedMarketContext | undefined =
    marketAnalysis || scan || (run.stages.intake.status === "done" && intake?.research.enabled)
      ? {
          source: marketAnalysis
            ? "market-analysis"
            : scan
              ? "legacy-scan"
              : "discovery",
          analysisStatus: run.stages.scanned.status === "done" ? "ready" : "discovering",
          ...(marketAnalysis ? { marketAnalysis } : {}),
          ...(scan ? { scan } : {}),
          mapQuery,
        }
      : undefined;
  let surface: GuidedSurface;

  if (run.templateFallback) {
    surface = {
      kind: "fallback",
      childRunId: run.templateFallback.childRunId,
      previewUrl: `/preview/${run.templateFallback.childRunId}`,
    };
  } else if (run.stages.built.status === "done") {
    const workflow = currentWorkflowSurface(run);
    if (workflow) {
      surface = workflow;
    } else if (
      run.pipelineVersion === "evidence-gated-v2" &&
      input.candidateState &&
      ["preparing", "ready-for-gates", "promotable"].includes(input.candidateState)
    ) {
      surface = { kind: "candidate-parked" };
    } else if (
      run.pipelineVersion === "evidence-gated-v2" &&
      input.candidateState !== "promoted"
    ) {
      surface = {
        kind: "state-unavailable",
        message: "The verified live website is missing or invalid.",
      };
    } else {
      surface = { kind: "complete", previewUrl: `/preview/${run.id}` };
    }
  } else {
    const failure = failureSurface(run);
    if (failure) {
      surface = failure;
    } else if (run.stages.intake.status !== "done") {
      surface = { kind: "intake-running" };
    } else if (run.stages.scanned.status !== "done") {
      surface = intake && !intake.research.enabled
        ? { kind: "research-disabled" }
        : { kind: "research-running" };
    } else if (run.stages.locked.status !== "done") {
      if (run.referencePickerEnabled && run.referenceSelection?.status === "pending") {
        surface = {
          kind: "reference-pending",
          selection: run.referenceSelection,
        };
      } else if (
        run.referencePickerEnabled &&
        run.referenceSelection?.status === "selected"
      ) {
        surface = {
          kind: "applying-preferences",
          selection: run.referenceSelection,
        };
      } else {
        surface = {
          kind: "market-leaders",
          source: marketAnalysis ? "market-analysis" : "legacy-scan",
          ...(marketAnalysis ? { marketAnalysis } : {}),
          ...(scan ? { scan } : {}),
          mapQuery,
        };
      }
    } else {
      const workflow = currentWorkflowSurface(run);
      if (workflow) {
        surface = workflow;
      } else if (run.stages.synthesized.status !== "done") {
        surface = { kind: "synthesis-running" };
      } else {
        surface = { kind: "build-running" };
      }
    }
  }

  return {
    runId: run.id,
    businessName: intake?.businessName,
    costUsd: run.costUsd,
    mapEmbedConfigured: mapsEmbedConfigured() && MapEmbedQuerySchema.safeParse(mapQuery).success,
    ...(marketContext ? { marketContext } : {}),
    surface,
  };
}
