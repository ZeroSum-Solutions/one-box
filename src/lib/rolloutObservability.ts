import { createHash } from "node:crypto";
import {
  BuildProvenanceV1Schema,
  HumanVisualReviewSchema,
  PageIrRolloutDecisionV1Schema,
  type BuildProvenanceV1,
  type CandidateProvenanceV1,
  type HumanVisualReview,
  type LayoutAuthority,
  type PageIrRolloutDecisionV1,
  type PipelineEvent,
  type RunState,
} from "./contracts";

type RolloutEnvironment = Readonly<
  Record<string, string | undefined>
>;

/** Read once for a new production run. Persisted run authority, never this
 * mutable process environment, governs every later resume and replay. */
export function selectPageIrRolloutDecision(
  environment: RolloutEnvironment,
): PageIrRolloutDecisionV1 {
  const rolloutEnabled = environment.ONE_BOX_PAGE_IR_ROLLOUT === "1";
  const killSwitchEngaged = environment.ONE_BOX_PAGE_IR_KILL_SWITCH === "1";
  return PageIrRolloutDecisionV1Schema.parse({
    schemaVersion: 1,
    rolloutEnabled,
    killSwitchEngaged,
    layoutAuthority:
      rolloutEnabled && !killSwitchEngaged ? "page-ir-v1" : "template-v1",
    reason: killSwitchEngaged
      ? "kill-switch"
      : rolloutEnabled
        ? "rollout-enabled"
        : "default-off",
  });
}

type RunProvenanceSource = Pick<RunState, "id" | "layoutAuthority"> &
  Partial<
    Pick<
      RunState,
      "rolloutDecision" | "templateFallback" | "fallbackOrigin"
    >
  >;

type CandidateProvenanceSource = Pick<
  CandidateProvenanceV1,
  | "runId"
  | "layoutAuthority"
  | "inputArtifactHashes"
  | "compilerVersion"
  | "pageIrSha256"
  | "candidateManifestSha256"
  | "buildSha256"
  | "gateReportSha256"
  | "promotedBuildSha256"
>;

function reviewSha256(review: HumanVisualReview): string {
  return createHash("sha256")
    .update(JSON.stringify(HumanVisualReviewSchema.parse(review)))
    .digest("hex");
}

/** Merge the distributed authorities into one validated read projection.
 * This does not authorize promotion or review; it only makes their exact
 * existing bindings visible to operators and the append-only event stream. */
export function buildRunProvenance(
  run: RunProvenanceSource,
  candidate: CandidateProvenanceSource,
  visualReview?: HumanVisualReview,
): BuildProvenanceV1 {
  if (candidate.runId !== run.id) {
    throw new Error("candidate provenance belongs to a different run");
  }
  if (candidate.layoutAuthority !== run.layoutAuthority) {
    throw new Error("candidate provenance authority does not match the run");
  }
  if (
    candidate.promotedBuildSha256 &&
    candidate.promotedBuildSha256 !== candidate.buildSha256
  ) {
    throw new Error("promoted build does not match the candidate build");
  }
  const parsedReview = visualReview
    ? HumanVisualReviewSchema.parse(visualReview)
    : undefined;
  if (
    parsedReview &&
    parsedReview.buildSha256 !== candidate.promotedBuildSha256
  ) {
    throw new Error("visual review does not match the promoted build");
  }

  const fallback = run.templateFallback
    ? {
        relationship: "source" as const,
        linkedRunId: run.templateFallback.childRunId,
        reason: run.templateFallback.reason,
        failedStage: run.templateFallback.failure.stage,
      }
    : run.fallbackOrigin
      ? {
          relationship: "child" as const,
          linkedRunId: run.fallbackOrigin.sourceRunId,
          reason: run.fallbackOrigin.reason,
          failedStage: run.fallbackOrigin.failure.stage,
        }
      : undefined;

  return BuildProvenanceV1Schema.parse({
    schemaVersion: 1,
    runId: run.id,
    layoutAuthority: run.layoutAuthority,
    rolloutDecision: run.rolloutDecision,
    inputArtifactHashes: candidate.inputArtifactHashes,
    pageIrSha256: candidate.pageIrSha256,
    compilerVersion: candidate.compilerVersion,
    candidateManifestSha256: candidate.candidateManifestSha256,
    candidateBuildSha256: candidate.buildSha256,
    gateReportSha256: candidate.gateReportSha256,
    promotedBuildSha256: candidate.promotedBuildSha256,
    reviewSha256: parsedReview ? reviewSha256(parsedReview) : undefined,
    reviewBuildSha256: parsedReview?.buildSha256,
    fallback,
  });
}

interface LifecycleEventContext {
  layoutAuthority?: LayoutAuthority;
  status?: "failed" | "action";
}

function nextAction(
  outcomeClass: Extract<
    PipelineEvent,
    { type: "lifecycle" }
  >["outcomeClass"],
  context: LifecycleEventContext,
): string {
  switch (outcomeClass) {
    case "candidate-failure":
      return context.layoutAuthority === "page-ir-v1"
        ? "Retry candidate creation. If it fails again, request an explicit template fallback."
        : "Inspect the candidate failure, then retry the same template run.";
    case "repair-failure":
      return "Inspect repair diagnostics, then retry the same run without changing its authority.";
    case "gate-failure":
      return context.layoutAuthority === "page-ir-v1"
        ? "Review the blocking gate details, then correct the candidate or request an explicit template fallback."
        : "Review the blocking gate details, then correct and retry the same template run.";
    case "promotion-failure":
      return "Inspect promotion and recovery state, then retry only from the reported durable boundary.";
    case "recovery-action":
      return context.status === "failed"
        ? "Inspect the blocked recovery evidence before any retry or promotion."
        : "Review the recorded recovery result, then resume from the reported durable boundary.";
  }
}

export function lifecycleEvent(
  outcomeClass: Extract<
    PipelineEvent,
    { type: "lifecycle" }
  >["outcomeClass"],
  message: string,
  context: LifecycleEventContext = {},
): Extract<PipelineEvent, { type: "lifecycle" }> {
  const status = context.status ??
    (outcomeClass === "recovery-action" ? "action" : "failed");
  return {
    type: "lifecycle",
    stage: "built",
    outcomeClass,
    status,
    message: message.replace(/\s+/g, " ").trim().slice(0, 500),
    nextAction: nextAction(outcomeClass, { ...context, status }),
    at: new Date().toISOString(),
  };
}

export function fallbackCreatedEvent(
  source: Pick<RunState, "id" | "templateFallback">,
): Extract<PipelineEvent, { type: "fallback-created" }> {
  const link = source.templateFallback;
  if (!link) throw new Error("fallback event requires a durable source link");
  return {
    type: "fallback-created",
    stage: "built",
    sourceRunId: source.id,
    fallbackRunId: link.childRunId,
    reason: link.reason,
    failedStage: link.failure.stage,
    at: new Date().toISOString(),
  };
}
