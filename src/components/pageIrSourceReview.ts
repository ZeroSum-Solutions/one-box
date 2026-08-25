import type {
  PageIrAssetsV1,
  PageIrContentV1,
  PageIrLayoutDecisionV1,
  PageIrSourceBundleReviewStateV1,
} from "../lib/contracts";
import type { PageIrSourceBundleReviewProjection } from "../lib/pageIrPipeline";

export type PageIrSourceReviewCriterion =
  | "layoutDecision"
  | "content"
  | "assets"
  | "upstreamBindings"
  | "sourceChain";

export interface PageIrSourceReviewView {
  schemaVersion: 1;
  bundleVersion: number;
  payloadSha256: string;
  state: PageIrSourceBundleReviewStateV1;
  latestTransition: {
    at: string;
    actorKind: "human" | "system" | "model";
    actorName: string;
    note?: string;
  };
  upstreamBindings: Array<{
    kind: "evidence" | "design-contract" | "token-inventory" | "tailwind-plan" | "css-architecture";
    version: number;
    sha256: string;
  }>;
  sources: {
    layoutDecision: { version: number; sha256: string; value: PageIrLayoutDecisionV1 };
    content: { version: number; sha256: string; value: PageIrContentV1 };
    assets: { version: number; sha256: string; value: PageIrAssetsV1 };
  };
  humanReview?: {
    reviewerName: string;
    reviewedAt: string;
    payloadSha256: string;
    criteria: Record<PageIrSourceReviewCriterion, "pass">;
  };
}

export function toPageIrSourceReviewView(
  projection: PageIrSourceBundleReviewProjection,
): PageIrSourceReviewView {
  const latestTransition = projection.bundle.reviewTransitions.at(-1)!;
  const source = (kind: "layout-decision" | "content" | "assets") =>
    projection.bundle.sourceArtifacts.find((artifact) => artifact.kind === kind)!;
  return {
    schemaVersion: projection.bundle.schemaVersion,
    bundleVersion: projection.bundle.bundleVersion,
    payloadSha256: projection.bundle.payloadSha256,
    state: projection.reviewState,
    latestTransition: {
      at: latestTransition.at,
      actorKind: latestTransition.actorKind,
      actorName: latestTransition.actorName,
      ...(latestTransition.note ? { note: latestTransition.note } : {}),
    },
    upstreamBindings: projection.bundle.upstreamBindings,
    sources: {
      layoutDecision: {
        version: source("layout-decision").version,
        sha256: source("layout-decision").sha256,
        value: projection.sources.layoutDecision,
      },
      content: {
        version: source("content").version,
        sha256: source("content").sha256,
        value: projection.sources.content,
      },
      assets: {
        version: source("assets").version,
        sha256: source("assets").sha256,
        value: projection.sources.assets,
      },
    },
    ...(latestTransition.humanReview
      ? {
          humanReview: {
            reviewerName: latestTransition.humanReview.reviewerName,
            reviewedAt: latestTransition.humanReview.reviewedAt,
            payloadSha256: latestTransition.humanReview.payloadSha256,
            criteria: latestTransition.humanReview.criteria,
          },
        }
      : {}),
  };
}
