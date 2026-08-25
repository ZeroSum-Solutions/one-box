"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ReferenceSelectionPanel } from "./ReferenceSelectionPanel";
import { consumePipelineRunStream } from "./resumeRun";
import {
  EVIDENCE_STAGE_ARTIFACT,
  EVIDENCE_WORKFLOW_STAGES,
  ARTIFACTS,
  workflowArtifactApprovalState,
  type ArtifactApprovalState,
  type RunState,
  type EvidenceWorkflowStage,
  type HumanVisualReviewCriteria,
  type UploadMetadata,
  type WorkflowArtifactType,
  type WorkflowArtifactVersion,
} from "../lib/contracts";
import type { RequiredReferenceContext } from "../lib/referenceContext";
import type { PersistedIntakeCompatibility } from "../lib/productionTarget";
import {
  ArtifactSource,
  CheckTable,
  ConfidenceTrack,
  ContractDocument,
  PaletteGrid,
  ThemeMappingTable,
  TokenSpecList,
  TokenSpecimenGallery,
  UsageMap,
  VariableHierarchy,
} from "./evidence/ArtifactViewers";
import { UploadPanel } from "./UploadPanel";
import type {
  PageIrSourceReviewCriterion,
  PageIrSourceReviewView,
} from "./pageIrSourceReview";
export type { PageIrSourceReviewView } from "./pageIrSourceReview";

const GATE_LABELS: Record<EvidenceWorkflowStage, string> = {
  evidence: "Evidence",
  contract: "Contract",
  tokens: "Tokens",
  tailwind: "Tailwind",
  css: "CSS",
  build: "Build",
};

const ARTIFACT_TITLES: Record<WorkflowArtifactType, string> = {
  ledger: "Evidence ledger",
  "design-contract": "Design contract",
  "token-inventory": "Semantic token inventory",
  "tailwind-plan": "Tailwind v4 mapping",
  "css-architecture": "CSS architecture",
  "visual-qa": "Visual QA",
};

/** Highest version recorded for a gate's artifact type, or null before any
 * draft exists — used by the gate rail's mono metadata and the pre-build
 * recap line. */
function stageVersion(run: RunState, stage: EvidenceWorkflowStage): number | null {
  const artifactType = EVIDENCE_STAGE_ARTIFACT[stage];
  const latest = run.evidenceWorkflow.artifacts
    .filter((artifact) => artifact.artifactType === artifactType)
    .sort((left, right) => right.version - left.version)[0];
  return latest ? latest.version : null;
}

/** Compact "Evidence v3 · Contract v3 · …" line for the five gates that must
 * already be approved by the time the build gate is in view. */
function priorApprovalsRecap(run: RunState): string {
  return EVIDENCE_WORKFLOW_STAGES.filter((stage) => stage !== "build")
    .map((stage) => {
      const version = stageVersion(run, stage);
      return `${GATE_LABELS[stage]} ${version !== null ? `v${version}` : "—"}`;
    })
    .join(" · ");
}

type HumanReviewCriterionKey = Exclude<
  keyof HumanVisualReviewCriteria,
  "designAndReferenceAlignment"
> | "designAndReferenceAlignment";
type HumanReviewDraftCriterion = { status: "" | "pass" | "fail"; findings: string };
type HumanReviewReferenceContext = "" | "design-and-references" | "explicit-no-reference";

interface HumanVisualReviewDraft {
  identity: string | null;
  reviewerName: string;
  humanAttestation: boolean;
  criteria: Record<HumanReviewCriterionKey, HumanReviewDraftCriterion>;
  referenceContext: HumanReviewReferenceContext;
}

const HUMAN_REVIEW_CRITERIA: Array<{
  key: HumanReviewCriterionKey;
  label: string;
  description: string;
}> = [
  { key: "briefFidelity", label: "Brief fidelity", description: "The result follows the approved brief and intended outcome." },
  { key: "visualHierarchy", label: "Visual hierarchy", description: "The page makes priority, reading order, and calls to action clear." },
  { key: "spacingAndComposition", label: "Intentional spacing and composition", description: "Space, rhythm, and composition feel deliberate rather than accidental." },
  { key: "businessSpecificity", label: "Business specificity (not a generic template)", description: "The result looks and reads as specific to this business." },
  { key: "designAndReferenceAlignment", label: "DESIGN.md and reference alignment", description: "The rendered result aligns with the approved design contract and selected references." },
];

const PAGE_IR_SOURCE_REVIEW_CRITERIA = [
  ["layoutDecision", "Layout decision"],
  ["content", "Content"],
  ["assets", "Assets"],
  ["upstreamBindings", "Upstream bindings"],
  ["sourceChain", "Source chain"],
] as const;

export interface PageIrSourceReviewDraft {
  payloadSha256: string | null;
  reviewerName: string;
  confirmations: Record<PageIrSourceReviewCriterion, boolean>;
  humanAttestation: boolean;
  rejectionNote: string;
}

export function syncPageIrSourceReviewDraft(
  current: PageIrSourceReviewDraft | undefined,
  payloadSha256: string | null,
): PageIrSourceReviewDraft {
  if (current?.payloadSha256 === payloadSha256) return current;
  return {
    payloadSha256,
    reviewerName: "",
    confirmations: {
      layoutDecision: false,
      content: false,
      assets: false,
      upstreamBindings: false,
      sourceChain: false,
    },
    humanAttestation: false,
    rejectionNote: "",
  };
}

export function pageIrSourceApprovalReady(
  draft: PageIrSourceReviewDraft,
): boolean {
  return draft.humanAttestation && Object.values(draft.confirmations).every(Boolean);
}

function isRealVisualQaArtifact(
  artifact: WorkflowArtifactVersion | undefined,
): boolean {
  return (
    artifact?.artifactType === "visual-qa" &&
    artifact.artifact.checks.every((check) => check.status !== "pending")
  );
}

export function isPageIrSourceReviewActive(
  run: RunState,
  review: PageIrSourceReviewView | null,
  browsing: boolean,
): boolean {
  const current = latestCurrentArtifact(run);
  const approvedReviewHasYieldedToVisualQa =
    review?.state === "approved" && isRealVisualQaArtifact(current);
  return (
    !browsing &&
    run.layoutAuthority === "page-ir-v1" &&
    run.evidenceWorkflow.currentStage === "build" &&
    !approvedReviewHasYieldedToVisualQa
  );
}

export function mergeEvidenceWorkspaceResponse(
  run: RunState,
  currentReview: PageIrSourceReviewView | null,
  response: {
    workflow?: RunState["evidenceWorkflow"];
    pageIrSourceReview?: PageIrSourceReviewView | null;
  },
): { run: RunState; pageIrSourceReview: PageIrSourceReviewView | null } | null {
  if (!response.workflow) return null;
  return {
    run: { ...run, evidenceWorkflow: response.workflow },
    pageIrSourceReview:
      response.pageIrSourceReview === undefined
        ? currentReview
        : response.pageIrSourceReview,
  };
}

function emptyHumanReviewCriteria(): Record<HumanReviewCriterionKey, HumanReviewDraftCriterion> {
  return Object.fromEntries(
    HUMAN_REVIEW_CRITERIA.map(({ key }) => [key, { status: "", findings: "" }])
  ) as Record<HumanReviewCriterionKey, HumanReviewDraftCriterion>;
}

/** Keep edits only while they belong to the exact visual-QA artifact bytes
 * being reviewed. A new version or build hash must receive a fresh reviewer
 * name, criterion decisions, reference basis, and human attestation. */
export function syncHumanVisualReviewDraft(
  current: HumanVisualReviewDraft | undefined,
  identity: string | null
): HumanVisualReviewDraft {
  if (current?.identity === identity) return current;
  return {
    identity,
    reviewerName: "",
    humanAttestation: false,
    criteria: emptyHumanReviewCriteria(),
    referenceContext: "",
  };
}

/** Rail meta text for the current gate mirrors the same approval state the
 * artifact panel already computes, so the two never disagree — the coral
 * "in review" label only earns its colour when the gate really is in review
 * (see the matching `data-approval` selector in evidence.css). */
function gateRailMeta(
  isCurrentGate: boolean,
  approval: ArtifactApprovalState | null,
  version: number | null
): string | null {
  if (isCurrentGate) {
    if (approval === "in-review") return "in review";
    if (approval === "revision-requested") return "changes requested";
    if (approval === "draft") return "draft";
  }
  return version !== null ? `v${version}` : null;
}

function latestArtifactForStage(
  run: RunState,
  stage: EvidenceWorkflowStage
): WorkflowArtifactVersion | undefined {
  const expected = EVIDENCE_STAGE_ARTIFACT[stage];
  return run.evidenceWorkflow.artifacts
    .filter((artifact) => artifact.artifactType === expected)
    .sort((left, right) => right.version - left.version)[0];
}

function latestCurrentArtifact(run: RunState): WorkflowArtifactVersion | undefined {
  return latestArtifactForStage(run, run.evidenceWorkflow.currentStage);
}

/** Theme/CSS variable → the client colour behind it, read off the approved
 * token inventory. The Tailwind and CSS gates are separate artifacts that
 * carry names but no values, so without this their viewers can only show
 * identifiers; with it a mapping row shows the colour it actually produces. */
function buildPaletteLookup(run: RunState): (name: string) => string | undefined {
  const inventory = latestArtifactForStage(run, "tokens");
  if (inventory?.artifactType !== "token-inventory") return () => undefined;
  const byName = new Map<string, string>();
  for (const token of inventory.artifact.tokens) {
    if (token.category !== "color") continue;
    byName.set(token.semanticName, token.value);
    // Tailwind names drop the pipeline's `--ds-` source prefix, and CSS
    // architecture rows quote the bare variable; index every form so a lookup
    // from any of the three viewers hits.
    byName.set(token.semanticName.replace(/^--(ds-)?/, "--"), token.value);
    byName.set(token.semanticName.replace(/^--/, ""), token.value);
  }
  return (name) =>
    byName.get(name) ?? byName.get(`--${name}`) ?? byName.get(name.replace(/^--ds-/, "--"));
}

function EvidenceImage({ src, alt }: { src: string; alt: string }) {
  // Evidence paths are dynamic run artifacts, not build-time image assets.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" />;
}

/**
 * Turns a recorded artifact path into a URL the site route can serve.
 *
 * Not every recorded path is run-relative: `crawlSite` builds its markdown path
 * from an absolute output directory, so the scan artifact stores an absolute
 * filesystem path. Concatenating one produced `/api/sites/<id>//Users/…` and a
 * 404 (ENG-009). Runs already on disk still hold those values, so this
 * normalises the path rather than assuming every writer has been corrected.
 */
export function artifactUrl(runId: string, artifactPath: string): string {
  const marker = `/sites/${runId}/`;
  const markerAt = artifactPath.indexOf(marker);
  const runRelative =
    markerAt >= 0 ? artifactPath.slice(markerAt + marker.length) : artifactPath;
  const servedPath = runRelative.startsWith("site/")
    ? runRelative.slice("site/".length)
    : runRelative;
  return `/api/sites/${runId}/${servedPath}`;
}

export function reviewComposerDecisionBlocked(
  attachmentCount: number,
  feedbackText: string,
): boolean {
  return attachmentCount > 0 && feedbackText.trim().length === 0;
}

function safeExternalHref(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function versionJsonUrl(runId: string, artifact: WorkflowArtifactVersion): string {
  return artifactUrl(
    runId,
    `evidence/versions/${artifact.artifactType}/v${artifact.version}.json`
  );
}

/** Header line every viewer shares: what this artifact derives from, and the
 * escape hatch to the bytes underneath. */
function ViewerHead({
  title,
  meta,
  jsonHref,
  jsonLabel,
}: {
  /** Omitted when the panel head above already names this artifact — only
   * the design contract carries a different title (the client's own). */
  title?: string;
  meta?: ReactNode;
  jsonHref: string;
  /** Names the bytes behind the link — "Raw JSON" alone is six identical
   * links across six gates to a screen reader. */
  jsonLabel: string;
}) {
  return (
    <div className="viewer-head">
      <div>
        {title && <h3>{title}</h3>}
        {meta && <p className="viewer-head__meta mono-meta">{meta}</p>}
      </div>
      <a
        className="btn-ghost btn-mini"
        href={jsonHref}
        aria-label={`Open versioned ${jsonLabel} JSON`}
      >
        Raw JSON
      </a>
    </div>
  );
}

/** Maps a theme/CSS variable name to the client colour behind it, so the
 * Tailwind and CSS viewers can show the colour a mapping actually produces
 * rather than a bare identifier. Built by the workspace from the approved
 * token inventory — those two artifacts are separate gates, so neither can
 * derive it alone. */
export type PaletteLookup = (name: string) => string | undefined;

const NO_PALETTE: PaletteLookup = () => undefined;

export function ArtifactPreview({
  artifact,
  runId,
  palette = NO_PALETTE,
}: {
  artifact: WorkflowArtifactVersion;
  runId: string;
  palette?: PaletteLookup;
}) {
  const jsonHref = versionJsonUrl(runId, artifact);
  switch (artifact.artifactType) {
    case "ledger": {
      const groups = [
        ["Business intelligence", artifact.artifact.businessIntelligence] as const,
        ["Refero design evidence", artifact.artifact.referoDesignEvidence] as const,
      ];
      return (
        <div className="evidence-readable">
          <ViewerHead
            jsonLabel="ledger"
            meta={`target ${artifact.artifact.projectTarget}`}
            jsonHref={jsonHref}
          />
          {groups.map(([title, group]) => (
            <section key={title}>
              <p className="eyebrow">{`{ ${title.toLowerCase()} }`}</p>
              {group.sources.length === 0 &&
                group.claims.length === 0 &&
                (!("references" in group) || group.references.length === 0) &&
                (!("competitors" in group) ||
                  (group.competitors.length === 0 &&
                    group.marketExpectations.length === 0 &&
                    group.differentiationOpportunities.length === 0)) && (
                  <div className="state-card">
                    <p className="state-card__label">empty</p>
                    <p className="state-card__title">Nothing recorded</p>
                    <p className="state-card__body">
                      {title === "Business intelligence"
                        ? "No competitors or other business intelligence evidence were recorded for this run."
                        : "No Refero design evidence was recorded for this run."}
                    </p>
                  </div>
                )}
              {group.claims.length > 0 && (
                <ul className="claim-list">
                  {group.claims.map((claim) => (
                    <li key={claim.id}>
                      <span className="badge">{claim.classification}</span>
                      <span className="claim-list__text">{claim.statement}</span>
                      <ConfidenceTrack value={claim.confidence} />
                      <span className="claim-list__id mono-meta">{claim.id}</span>
                    </li>
                  ))}
                </ul>
              )}
              {group.sources.length > 0 && (
                <div className="source-grid">
                  {group.sources.map((source) => {
                    const href = safeExternalHref(source.sourceUrl);
                    return (
                      <article className="source-card" key={source.id}>
                        <h4 className="source-card__title">
                          {href ? (
                            <a href={href} target="_blank" rel="noreferrer">
                              {source.title ?? source.sourceUrl} ↗
                            </a>
                          ) : (
                            (source.title ?? source.sourceUrl)
                          )}
                        </h4>
                        {source.screenshotPaths[0] && (
                          <a
                            className="source-card__shot"
                            href={artifactUrl(runId, source.screenshotPaths[0])}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <EvidenceImage
                              src={artifactUrl(runId, source.screenshotPaths[0])}
                              alt={`${source.title ?? source.id} capture`}
                            />
                          </a>
                        )}
                        <p className="source-card__prov mono-meta">
                          <span>{source.id}</span>
                          <span>{source.capturedAt.slice(0, 10)}</span>
                          {source.crawl && (
                            <span>
                              {source.crawl.provider} · {source.crawl.outcome}
                            </span>
                          )}
                        </p>
                        <ConfidenceTrack value={source.confidence} />
                        {source.extractedArtifactPaths.length > 0 && (
                          <p className="source-card__links mono-meta">
                            {source.extractedArtifactPaths.map((extracted, index) => (
                              <a key={extracted} href={artifactUrl(runId, extracted)}>
                                extract {index + 1}
                              </a>
                            ))}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
              {"competitors" in group && group.competitors.length > 0 && (
                <>
                  <p className="eyebrow">{"{ selected competitors }"}</p>
                  <ul className="finding-list">
                    {group.competitors.map((competitor) => {
                      const href = safeExternalHref(competitor.url);
                      return (
                        <li key={competitor.url}>
                          <strong>
                            {href ? (
                              <a href={href} target="_blank" rel="noreferrer">
                                {competitor.name} ↗
                              </a>
                            ) : (
                              competitor.name
                            )}
                          </strong>
                          <span>{competitor.selectionRationale}</span>
                          {competitor.strengths.length > 0 && (
                            <span className="finding-list__aside">
                              Strengths: {competitor.strengths.join("; ")}
                            </span>
                          )}
                          {competitor.gaps.length > 0 && (
                            <span className="finding-list__aside">
                              Gaps: {competitor.gaps.join("; ")}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {"marketExpectations" in group && group.marketExpectations.length > 0 && (
                <>
                  <p className="eyebrow">{"{ market expectations }"}</p>
                  <ul className="finding-list">
                    {group.marketExpectations.map((expectation) => (
                      <li key={expectation}>
                        <span>{expectation}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {"differentiationOpportunities" in group &&
                group.differentiationOpportunities.length > 0 && (
                  <>
                    <p className="eyebrow">{"{ differentiation }"}</p>
                    <ul className="finding-list">
                      {group.differentiationOpportunities.map((opportunity) => (
                        <li key={opportunity}>
                          <span>{opportunity}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              {"references" in group && group.references.length > 0 && (
                <>
                  <p className="eyebrow">{"{ references }"}</p>
                  <ul className="finding-list">
                    {group.references.map((reference) => (
                      <li key={reference.referoId}>
                        <strong>{reference.name}</strong>
                        <span>{reference.learningRationale}</span>
                        <span className="finding-list__aside">
                          Reusable: {reference.reusablePatterns.join("; ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ))}
          <section>
            <p className="eyebrow">{"{ client-provided evidence }"}</p>
            {artifact.artifact.clientEvidence.sources.length === 0 &&
              artifact.artifact.clientEvidence.claims.length === 0 &&
              artifact.artifact.clientEvidence.unsupportedUploadIds.length === 0 &&
              artifact.artifact.clientEvidence.artifactRelationships.length === 0 && (
                <div className="state-card">
                  <p className="state-card__label">empty</p>
                  <p className="state-card__title">Nothing attached</p>
                  <p className="state-card__body">
                    No client-provided evidence was attached to this run.
                  </p>
                </div>
              )}
            {artifact.artifact.clientEvidence.claims.length > 0 && (
              <ul className="claim-list">
                {artifact.artifact.clientEvidence.claims.map((claim) => (
                  <li key={claim.id}>
                    <span className="badge">{claim.classification}</span>
                    <span className="claim-list__text">{claim.statement}</span>
                    <ConfidenceTrack value={claim.confidence} />
                  </li>
                ))}
              </ul>
            )}
            {artifact.artifact.clientEvidence.unsupportedUploadIds.length > 0 && (
              <p className="mono-meta">
                Unsupported uploads (recorded, not silently parsed):{" "}
                {artifact.artifact.clientEvidence.unsupportedUploadIds.join(", ")}
              </p>
            )}
            {artifact.artifact.clientEvidence.artifactRelationships.map((relationship) => (
              <p key={relationship.uploadId} className="mono-meta">
                Client artifact {relationship.uploadId} · {relationship.status} · consumer{" "}
                {relationship.consumer ?? "none"} · sha {relationship.sha256?.slice(0, 12) ?? "none"}
              </p>
            ))}
          </section>
        </div>
      );
    }

    case "design-contract": {
      const colors = artifact.artifact.designTokens?.colors ?? [];
      return (
        <div className="evidence-readable">
          <ViewerHead
            title={artifact.artifact.title}
            jsonLabel="contract metadata"
            meta={
              <>
                <span>sha {artifact.artifact.contractSha256?.slice(0, 12) ?? "unrecorded"}</span>
                {" · "}
                <span>from ledger v{artifact.artifact.sourceLedgerVersion}</span>
                {" · "}
                <span>{(artifact.artifact.approvedEvidenceIds?.length ?? 0)} evidence ids</span>
              </>
            }
            jsonHref={jsonHref}
          />
          {colors.length > 0 && (
            <section>
              <p className="eyebrow">{"{ palette }"}</p>
              <PaletteGrid
                entries={colors.map((color) => ({
                  name: color.name,
                  value: color.value,
                  cssVar: color.cssVar,
                  role: color.role,
                  forbidden: color.forbidden,
                }))}
              />
            </section>
          )}
          <ContractDocument
            href={artifactUrl(runId, artifact.artifact.contractPath)}
            label="DESIGN.md"
          />
          {artifact.artifact.exportPaths?.map((exportPath) => (
            <section key={exportPath}>
              <p className="eyebrow">{"{ tailwind export }"}</p>
              <p className="mono-meta">
                <a href={artifactUrl(runId, exportPath)}>{exportPath}</a> · sha{" "}
                {artifact.artifact.exportSha256?.slice(0, 12) ?? "unrecorded"}
              </p>
              <ArtifactSource href={artifactUrl(runId, exportPath)} label="Tailwind export" />
            </section>
          ))}
        </div>
      );
    }

    case "token-inventory": {
      const tokens = artifact.artifact.tokens;
      const colors = tokens.filter((token) => token.category === "color");
      const others = tokens.filter((token) => token.category !== "color");
      const categories = [...new Set(others.map((token) => token.category))];
      return (
        <div className="evidence-readable">
          <ViewerHead
            jsonLabel="token inventory"
            meta={`${tokens.length} tokens · ${colors.length} colours · from contract v${artifact.artifact.sourceContractVersion}`}
            jsonHref={jsonHref}
          />
          {colors.length > 0 && (
            <section>
              <p className="eyebrow">{"{ palette }"}</p>
              <PaletteGrid
                entries={colors.map((token) => ({
                  name: token.semanticName.replace(/^--(color-)?/, "").replace(/-/g, " "),
                  value: token.value,
                  cssVar: token.semanticName,
                  role: token.usage.split("Never:")[0].trim(),
                  forbidden: token.usage.split("Never:")[1]?.trim(),
                  evidenceIds: token.sourceEvidenceIds,
                }))}
              />
            </section>
          )}
          {categories.length > 0 && (
            <TokenSpecList
              showSpecimens={false}
              groups={categories.map((category) => ({
                category,
                tokens: others
                  .filter((token) => token.category === category)
                  .map((token) => ({
                    semanticName: token.semanticName,
                    value: token.value,
                    usage: token.usage,
                    evidenceIds: token.sourceEvidenceIds,
                  })),
              }))}
            />
          )}
        </div>
      );
    }

    case "tailwind-plan":
      return (
        <div className="evidence-readable">
          <ViewerHead
            jsonLabel="Tailwind plan"
            meta={`${artifact.artifact.themeMappings.length} mappings · from tokens v${artifact.artifact.sourceTokenInventoryVersion}`}
            jsonHref={jsonHref}
          />
          <p className="eyebrow">{"{ @theme inline }"}</p>
          <ThemeMappingTable
            mappings={artifact.artifact.themeMappings}
            swatchFor={palette}
          />
          {(artifact.artifact.runtimeOnlyVariables?.length ?? 0) > 0 && (
            <section>
              <p className="eyebrow">{"{ runtime only }"}</p>
              <ul className="finding-list">
                {artifact.artifact.runtimeOnlyVariables!.map((variable) => (
                  <li key={variable.cssVariable}>
                    <strong>
                      <code>{variable.cssVariable}</code>
                    </strong>
                    <span>{variable.rationale}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(artifact.artifact.componentVariants?.length ?? 0) > 0 && (
            <section>
              <p className="eyebrow">{"{ component variants }"}</p>
              <p className="badge-row">
                {artifact.artifact.componentVariants!.map((variant) => (
                  <span className="badge" key={variant}>
                    {variant}
                  </span>
                ))}
              </p>
            </section>
          )}
          {(artifact.artifact.responsiveRules?.length ?? 0) > 0 && (
            <section>
              <p className="eyebrow">{"{ responsive rules }"}</p>
              <ul className="finding-list">
                {artifact.artifact.responsiveRules!.map((rule) => (
                  <li key={rule}>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      );

    case "css-architecture":
      return (
        <div className="evidence-readable">
          <ViewerHead
            jsonLabel="CSS architecture"
            meta={`${Object.keys(artifact.artifact.tokenToComponentUsage).length} tokens mapped · from tailwind v${artifact.artifact.sourceTailwindPlanVersion}`}
            jsonHref={jsonHref}
          />
          <section>
            <p className="eyebrow">{"{ cascade order }"}</p>
            <VariableHierarchy layers={artifact.artifact.cssVariableHierarchy} />
          </section>
          <section>
            <p className="eyebrow">{"{ token → component }"}</p>
            <UsageMap usage={artifact.artifact.tokenToComponentUsage} swatchFor={palette} />
          </section>
          <section>
            <p className="eyebrow">{"{ theme source }"}</p>
            <ArtifactSource
              href={artifactUrl(runId, ARTIFACTS.tailwindTheme)}
              label="Generated Tailwind theme source (@theme mapping)"
            />
          </section>
          <section>
            <p className="eyebrow">{"{ compiled utilities }"}</p>
            {artifact.artifact.generatedCssPath ? (
              <ArtifactSource
                href={artifactUrl(runId, artifact.artifact.generatedCssPath)}
                label="Compiled Tailwind utility output"
              />
            ) : (
              <div className="state-card">
                <p className="state-card__label">pending</p>
                <p className="state-card__title">Not compiled yet</p>
                <p className="state-card__body">
                  Compiled utility output is written by the build stage, after this gate.
                </p>
              </div>
            )}
          </section>
          {(artifact.artifact.justifiedExceptions?.length ?? 0) > 0 && (
            <section>
              <p className="eyebrow">{"{ justified exceptions }"}</p>
              <ul className="finding-list">
                {artifact.artifact.justifiedExceptions!.map((exception) => (
                  <li key={exception}>
                    <span>{exception}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      );

    case "visual-qa":
      return (
        <div className="evidence-readable">
          <ViewerHead
            jsonLabel="visual QA"
            meta={`build ${artifact.artifact.buildSha256.slice(0, 12)} · from css v${artifact.artifact.sourceCssArchitectureVersion}`}
            jsonHref={jsonHref}
          />
          <p className="viewer-note">
            These machine-generated checks are separate from the human visual decision below.
          </p>
          <CheckTable
            checks={artifact.artifact.checks.map((check) => ({
              area: check.area,
              status: check.status,
              notes: check.notes ?? "",
              evidencePath: check.evidencePath,
            }))}
            renderEvidence={(path, area) => (
              <a
                className="qa-thumb"
                href={artifactUrl(runId, path)}
                target="_blank"
                rel="noreferrer noopener"
              >
                <EvidenceImage src={artifactUrl(runId, path)} alt={`${area} QA evidence`} />
                <span className="qa-thumb__open">Open full size ↗</span>
              </a>
            )}
          />
          {artifact.approvalTransitions
            .filter((transition) => transition.humanVisualReview)
            .map((transition) => {
              const review = transition.humanVisualReview!;
              return (
                <section key={review.reviewedAt} aria-label={`Human visual review by ${review.reviewerName}`}>
                  <p className="eyebrow">{"{ human review }"}</p>
                  <h4 className="review-byline">Reviewed by {review.reviewerName}</h4>
                  <p className="mono-meta">
                    {review.reviewedAt.slice(0, 16).replace("T", " ")} · build{" "}
                    {review.buildSha256.slice(0, 12)}
                  </p>
                  <CheckTable
                    checks={HUMAN_REVIEW_CRITERIA.map(({ key, label }) => {
                      const criterion = review.criteria[key];
                      return {
                        area: label,
                        status: criterion.status,
                        notes:
                          criterion.findings ||
                          (key === "designAndReferenceAlignment" && "referenceContext" in criterion
                            ? criterion.referenceContext
                            : ""),
                      };
                    })}
                    renderEvidence={() => null}
                  />
                </section>
              );
            })}
        </div>
      );
  }
}

function PageIrSourceSnapshot({ review }: { review: PageIrSourceReviewView }) {
  const sources = [
    ["Layout decision", review.sources.layoutDecision],
    ["Content source", review.sources.content],
    ["Assets source", review.sources.assets],
  ] as const;
  return (
    <div className="evidence-readable">
      <p className="mono-meta">
        Bundle v{review.bundleVersion} · payload {review.payloadSha256}
      </p>
      <section>
        <p className="eyebrow">{"{ upstream bindings }"}</p>
        <ul className="finding-list">
          {review.upstreamBindings.map((binding) => (
            <li key={binding.kind}>
              <strong>{binding.kind} v{binding.version}</strong>
              <code>{binding.sha256}</code>
            </li>
          ))}
        </ul>
      </section>
      {sources.map(([title, source]) => (
        <section key={title}>
          <p className="eyebrow">{`{ ${title} }`}</p>
          <p className="mono-meta">v{source.version} · {source.sha256}</p>
          <pre>{JSON.stringify(source.value, null, 2)}</pre>
        </section>
      ))}
    </div>
  );
}

function PageIrSourceReviewPanel({
  runId,
  review,
  draft,
  busy,
  setDraft,
  submit,
}: {
  runId: string;
  review: PageIrSourceReviewView;
  draft: PageIrSourceReviewDraft;
  busy: boolean;
  setDraft: (next: PageIrSourceReviewDraft) => void;
  submit: (body: Record<string, unknown>) => void;
}) {
  const reviewerName = review.state === "draft"
    ? draft.reviewerName
    : review.latestTransition.actorName;
  const canReject = reviewerName.trim().length > 0 && draft.rejectionNote.trim().length > 0;
  const sourceCriteria = Object.fromEntries(
    PAGE_IR_SOURCE_REVIEW_CRITERIA.map(([key]) => [key, "pass"]),
  );

  if (review.state === "approved" && review.humanReview) {
    return (
      <div className="evidence-readable">
        <PageIrSourceSnapshot review={review} />
        <section aria-label={`PageIR Source Bundle review by ${review.humanReview.reviewerName}`}>
          <p className="eyebrow">{"{ named human source review }"}</p>
          <h3>Reviewed by {review.humanReview.reviewerName}</h3>
          <p className="mono-meta">
            {review.humanReview.reviewedAt.slice(0, 10)} · payload {review.humanReview.payloadSha256.slice(0, 12)}
          </p>
          <ul className="finding-list">
            {PAGE_IR_SOURCE_REVIEW_CRITERIA.map(([key, label]) => (
              <li key={key}><strong>{label}</strong><span>{review.humanReview!.criteria[key]}</span></li>
            ))}
          </ul>
          <Link className="btn-primary" href={`/?run=${runId}`}>
            Resume generation
          </Link>
        </section>
      </div>
    );
  }

  if (review.state === "rejected" || review.state === "superseded") {
    return (
      <div className="evidence-readable">
        <PageIrSourceSnapshot review={review} />
        <div className="state-card" role="status">
          <span className="state-card__label">blocked</span>
          <p className="state-card__title">Source Bundle {review.state}</p>
          <p className="state-card__body">
            {review.latestTransition.note ?? "This immutable Source Bundle cannot continue."} Start a new run.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="evidence-readable">
      <PageIrSourceSnapshot review={review} />
      <section aria-labelledby="page-ir-source-review-title">
        <h3 id="page-ir-source-review-title">Named human Source Bundle review</h3>
        {review.state === "draft" ? (
          <>
            <label className="evidence-note">
              Reviewer name
              <input
                value={draft.reviewerName}
                onChange={(event) => setDraft({ ...draft, reviewerName: event.target.value })}
                autoComplete="name"
              />
            </label>
            <button
              className="btn-primary"
              disabled={busy || !draft.reviewerName.trim()}
              onClick={() => submit({
                action: "begin-page-ir-source-bundle-review",
                payloadSha256: review.payloadSha256,
                reviewerName: draft.reviewerName.trim(),
              })}
            >
              Begin named human review
            </button>
          </>
        ) : (
          <>
            <p>Reviewer: {reviewerName}</p>
            {PAGE_IR_SOURCE_REVIEW_CRITERIA.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={draft.confirmations[key]}
                  onChange={(event) => setDraft({
                    ...draft,
                    confirmations: {
                      ...draft.confirmations,
                      [key]: event.target.checked,
                    },
                  })}
                /> {label}
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={draft.humanAttestation}
                onChange={(event) => setDraft({ ...draft, humanAttestation: event.target.checked })}
              /> I attest that I am the named human reviewer
            </label>
            <button
              className="btn-primary"
              disabled={busy || !pageIrSourceApprovalReady(draft)}
              onClick={() => submit({
                action: "approve-page-ir-source-bundle",
                payloadSha256: review.payloadSha256,
                reviewerName,
                humanAttestation: true,
                criteria: sourceCriteria,
              })}
            >
              Approve PageIR Source Bundle
            </button>
          </>
        )}
        <label className="evidence-note">
          Rejection note
          <textarea
            value={draft.rejectionNote}
            onChange={(event) => setDraft({ ...draft, rejectionNote: event.target.value })}
          />
        </label>
        <button
          className="btn-coral"
          disabled={busy || !canReject}
          onClick={() => submit({
            action: "reject-page-ir-source-bundle",
            payloadSha256: review.payloadSha256,
            reviewerName: reviewerName.trim(),
            note: draft.rejectionNote.trim(),
          })}
        >
          Reject Source Bundle
        </button>
      </section>
    </div>
  );
}

function tokenSpecimenGroups(
  artifact: Extract<WorkflowArtifactVersion, { artifactType: "token-inventory" }>,
) {
  const tokens = artifact.artifact.tokens;
  return [...new Set(tokens.map((token) => token.category))].map((category) => ({
    category,
    tokens: tokens
      .filter((token) => token.category === category)
      .map((token) => ({
        semanticName: token.semanticName,
        value: token.value,
        usage: token.usage,
        evidenceIds: token.sourceEvidenceIds,
      })),
  }));
}

export function reviewStageAnswers(
  artifact: WorkflowArtifactVersion,
  approval: ArtifactApprovalState | null,
): { deciding: string; learned: string; proposed: string; next: string } {
  const next = approval === "revision-requested"
    ? "Explain what needs to change, attach any useful files, then save or regenerate the next version."
    : approval === "approved"
      ? "Move to the next stage when you are ready."
      : "Check the proposal, add feedback or files if needed, then approve it or request changes.";

  switch (artifact.artifactType) {
    case "ledger": {
      const expectations = artifact.artifact.businessIntelligence.marketExpectations;
      const sourceCount =
        artifact.artifact.businessIntelligence.sources.length +
        artifact.artifact.referoDesignEvidence.sources.length +
        artifact.artifact.clientEvidence.sources.length;
      return {
        deciding: "Which research and client evidence should guide this project?",
        learned: expectations[0] ?? `OneBox saved ${sourceCount} source${sourceCount === 1 ? "" : "s"} for this decision.`,
        proposed: "Use the strongest recorded evidence as the basis for the design work that follows.",
        next,
      };
    }
    case "design-contract":
      return {
        deciding: "Which visual rules should guide the site?",
        learned: `The proposal connects ${artifact.artifact.approvedEvidenceIds.length} approved evidence item${artifact.artifact.approvedEvidenceIds.length === 1 ? "" : "s"} to one design rulebook.`,
        proposed: "The palette and design rulebook below show the look OneBox will carry into the build.",
        next,
      };
    case "token-inventory":
      return {
        deciding: "How should the approved look behave in real interface parts?",
        learned: `OneBox turned the rulebook into ${artifact.artifact.tokens.length} reusable style choice${artifact.artifact.tokens.length === 1 ? "" : "s"}.`,
        proposed: "The specimens below show type, spacing, surfaces, and interaction states at their real values.",
        next,
      };
    case "tailwind-plan":
      return {
        deciding: "How should the saved style choices connect to the site builder?",
        learned: `OneBox prepared ${artifact.artifact.themeMappings.length} checked connection${artifact.artifact.themeMappings.length === 1 ? "" : "s"}.`,
        proposed: "Each approved choice has one named place in the generated site.",
        next,
      };
    case "css-architecture":
      return {
        deciding: "Where should each approved style be used?",
        learned: `OneBox mapped ${Object.keys(artifact.artifact.tokenToComponentUsage).length} style choice${Object.keys(artifact.artifact.tokenToComponentUsage).length === 1 ? "" : "s"} to real parts of the site.`,
        proposed: "The plan keeps global rules, page rules, and component rules in a clear order.",
        next,
      };
    case "visual-qa": {
      const passed = artifact.artifact.checks.filter((check) => check.status === "pass").length;
      return {
        deciding: "Is the current build ready to accept?",
        learned: `The saved review checks currently show ${passed} of ${artifact.artifact.checks.length} passing.`,
        proposed: "The desktop, tablet, and phone evidence below show the build that will be accepted or revised.",
        next,
      };
    }
  }
}

function ReviewStageOverview({
  artifact,
  approval,
}: {
  artifact: WorkflowArtifactVersion;
  approval: ArtifactApprovalState | null;
}) {
  const answers = reviewStageAnswers(artifact, approval);
  const contractColors = artifact.artifactType === "design-contract"
    ? artifact.artifact.designTokens?.colors ?? []
    : [];
  const inventoryColors = artifact.artifactType === "token-inventory"
    ? artifact.artifact.tokens.filter((token) => token.category === "color")
    : [];

  return (
    <section className="review-overview" aria-labelledby="review-overview-title">
      <h3 id="review-overview-title">Review summary</h3>
      <dl className="review-overview__answers">
        <div><dt>What are we deciding?</dt><dd>{answers.deciding}</dd></div>
        <div><dt>What did OneBox learn?</dt><dd>{answers.learned}</dd></div>
        <div><dt>What does the proposed choice look like?</dt><dd>{answers.proposed}</dd></div>
        <div><dt>What do you need to do next?</dt><dd>{answers.next}</dd></div>
      </dl>
      {contractColors.length > 0 && (
        <PaletteGrid
          entries={contractColors.map((color) => ({
            name: color.name,
            value: color.value,
            cssVar: color.cssVar,
            role: color.role,
            forbidden: color.forbidden,
          }))}
        />
      )}
      {artifact.artifactType === "token-inventory" && (
        <>
          {inventoryColors.length > 0 && (
            <PaletteGrid
              entries={inventoryColors.map((token) => ({
                name: token.semanticName.replace(/^--(color-)?/, "").replace(/-/g, " "),
                value: token.value,
                cssVar: token.semanticName,
                role: token.usage.split("Never:")[0].trim(),
                forbidden: token.usage.split("Never:")[1]?.trim(),
                evidenceIds: token.sourceEvidenceIds,
              }))}
            />
          )}
          <TokenSpecimenGallery groups={tokenSpecimenGroups(artifact)} />
        </>
      )}
    </section>
  );
}

export function EvidenceWorkspace({
  initialRun,
  compatibility,
  initialPageIrSourceReview = null,
  requiredReferenceContext = initialRun.referenceMode === "none"
    ? "explicit-no-reference"
    : "design-and-references",
}: {
  initialRun: RunState;
  compatibility?: PersistedIntakeCompatibility;
  initialPageIrSourceReview?: PageIrSourceReviewView | null;
  requiredReferenceContext?: RequiredReferenceContext;
}) {
  const legacyReadOnly = compatibility?.readOnly === true;
  const [run, setRun] = useState(initialRun);
  const [note, setNote] = useState("");
  const [feedbackUploads, setFeedbackUploads] = useState<UploadMetadata[]>([]);
  const [feedbackUploadSession, setFeedbackUploadSession] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [feedbackSessionError, setFeedbackSessionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageIrSourceReview, setPageIrSourceReview] = useState(initialPageIrSourceReview);
  const sourceReviewIdentity = pageIrSourceReview?.payloadSha256 ?? null;
  const [storedPageIrSourceDraft, setStoredPageIrSourceDraft] = useState<PageIrSourceReviewDraft>(
    () => syncPageIrSourceReviewDraft(undefined, sourceReviewIdentity),
  );
  const pageIrSourceDraft = syncPageIrSourceReviewDraft(
    storedPageIrSourceDraft,
    sourceReviewIdentity,
  );
  const current = useMemo(() => latestCurrentArtifact(run), [run]);
  const approval = current ? workflowArtifactApprovalState(current) : null;
  const humanReviewIdentity = current?.artifactType === "visual-qa"
    ? `${current.version}:${current.artifact.buildSha256}`
    : null;
  const [storedHumanReviewDraft, setStoredHumanReviewDraft] = useState<HumanVisualReviewDraft>(
    () => syncHumanVisualReviewDraft(undefined, humanReviewIdentity)
  );
  const humanReviewDraft = syncHumanVisualReviewDraft(
    storedHumanReviewDraft,
    humanReviewIdentity
  );
  const {
    reviewerName,
    humanAttestation,
    criteria: humanCriteria,
    referenceContext,
  } = humanReviewDraft;
  const [draftText, setDraftText] = useState(
    current ? JSON.stringify(current.artifact, null, 2) : ""
  );

  // router.refresh() re-runs the server page and hands down fresh run state,
  // but useState keeps its first value forever. That is how a resumed run's
  // newly written draft stayed invisible behind "Draft not generated". Adopt
  // each new server snapshot; local approvals keep updating run in between.
  const [serverRun, setServerRun] = useState(initialRun);
  if (serverRun !== initialRun) {
    const refreshed = latestCurrentArtifact(initialRun);
    setServerRun(initialRun);
    setRun(initialRun);
    setDraftText(refreshed ? JSON.stringify(refreshed.artifact, null, 2) : "");
  }
  const [serverPageIrSourceReview, setServerPageIrSourceReview] = useState(
    initialPageIrSourceReview,
  );
  if (serverPageIrSourceReview !== initialPageIrSourceReview) {
    setServerPageIrSourceReview(initialPageIrSourceReview);
    setPageIrSourceReview(initialPageIrSourceReview);
  }

  const currentIndex = EVIDENCE_WORKFLOW_STAGES.indexOf(
    run.evidenceWorkflow.currentStage
  );
  const nextStage = EVIDENCE_WORKFLOW_STAGES[currentIndex + 1];

  // Which gate the panel is READING. Null means "follow the run", which is the
  // reviewing case; picking an earlier gate off the rail opens that artifact
  // read-only. Approving is never possible from here — the actions stay bound
  // to the run's own current gate, so browsing the palette cannot advance the
  // workflow by accident.
  const [viewStage, setViewStage] = useState<EvidenceWorkflowStage | null>(null);
  const shownStage = viewStage ?? run.evidenceWorkflow.currentStage;
  const browsing = shownStage !== run.evidenceWorkflow.currentStage;
  const shown = useMemo(() => latestArtifactForStage(run, shownStage), [run, shownStage]);
  const shownApproval = shown ? workflowArtifactApprovalState(shown) : null;
  const palette = useMemo(() => buildPaletteLookup(run), [run]);
  const sourceReviewActive = isPageIrSourceReviewActive(
    run,
    pageIrSourceReview,
    browsing,
  );
  const approvedSourceProofAlongsideVisualQa = Boolean(
    !browsing &&
      pageIrSourceReview?.state === "approved" &&
      pageIrSourceReview.humanReview &&
      isRealVisualQaArtifact(current),
  );
  const canApproveAndContinue = Boolean(
    !legacyReadOnly &&
      !sourceReviewActive &&
      current &&
      current.artifactType !== "visual-qa" &&
      (approval === "draft" || approval === "in-review" || (approval === "approved" && nextStage))
  );
  // Visual QA drafts have no "approve" path — a human review decides that —
  // but they still start life in draft and need a way into in-review, or the
  // gate can be entered and never left (BLOCKER: draft has no exit control).
  const canSubmitVisualQaDraft = Boolean(
    !legacyReadOnly &&
      !sourceReviewActive &&
      current &&
      current.artifactType === "visual-qa" &&
      approval === "draft"
  );
  // A revision-requested artifact's only forward move is a new version; give
  // it the same pinned header spot the other gates get instead of leaving the
  // header actionless while the save control waits at the panel's bottom.
  const canSaveRevisionFromHeader = Boolean(
    !legacyReadOnly &&
      !sourceReviewActive &&
      current &&
      current.artifactType !== "visual-qa" &&
      approval === "revision-requested"
  );
  const humanReviewReady =
    reviewerName.trim().length > 0 &&
    humanAttestation &&
    Boolean(referenceContext) &&
    Object.values(humanCriteria).every(
      (criterion) =>
        criterion.status !== "" &&
        (criterion.status !== "fail" || criterion.findings.trim().length > 0)
    );
  const humanReviewAllPass =
    humanReviewReady &&
    Object.values(humanCriteria).every((criterion) => criterion.status === "pass");
  const humanReviewHasRevision =
    humanReviewReady &&
    Object.values(humanCriteria).some((criterion) => criterion.status === "fail");
  const feedbackDecisionBlocked = reviewComposerDecisionBlocked(
    feedbackUploads.length,
    note,
  );

  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/evidence/${run.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        error?: string;
        workflow?: RunState["evidenceWorkflow"];
        pageIrSourceReview?: PageIrSourceReviewView | null;
      };
      const updated = mergeEvidenceWorkspaceResponse(run, pageIrSourceReview, result);
      if (!response.ok || !updated) throw new Error(result.error ?? "Evidence action failed");
      setRun(updated.run);
      const updatedCurrent = latestCurrentArtifact(updated.run);
      setDraftText(updatedCurrent ? JSON.stringify(updatedCurrent.artifact, null, 2) : "");
      setPageIrSourceReview(updated.pageIrSourceReview);
      setNote("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence action failed");
    } finally {
      setBusy(false);
    }
  }

  function clearFeedbackDraft() {
    setNote("");
    setFeedbackUploads([]);
    setFeedbackUploadSession(null);
    setFeedbackId(null);
    setFeedbackSessionError(null);
  }

  function recoverFeedbackAttachments(status: number, message: string | undefined) {
    if (
      feedbackUploads.length > 0 &&
      (status === 401 || /upload session|uploaded file|staged file/i.test(message ?? ""))
    ) {
      setFeedbackUploadSession(null);
      setFeedbackUploads([]);
      setFeedbackSessionError(
        "Those attachments expired or were already used. Choose the files again; your feedback text is still here.",
      );
    }
  }

  function currentFeedbackBody() {
    const id = feedbackId ?? crypto.randomUUID();
    if (!feedbackId) setFeedbackId(id);
    return {
      action: "record-feedback",
      feedbackId: id,
      text: note.trim(),
      uploadSession: feedbackUploadSession,
      uploadIds: feedbackUploads.map((upload) => upload.id),
    };
  }

  async function actionAfterFeedback(
    body: Record<string, unknown>,
    successMessage: string,
  ) {
    setBusy(true);
    setError(null);
    setFeedbackStatus(null);
    try {
      let responseRun = run;
      let responseReview = pageIrSourceReview;
      const step = async (stepBody: Record<string, unknown>) => {
        const response = await fetch(`/api/evidence/${run.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stepBody),
        });
        const result = (await response.json()) as {
          error?: string;
          workflow?: RunState["evidenceWorkflow"];
          pageIrSourceReview?: PageIrSourceReviewView | null;
        };
        const updated = mergeEvidenceWorkspaceResponse(responseRun, responseReview, result);
        if (!response.ok && stepBody.action === "record-feedback") {
          recoverFeedbackAttachments(response.status, result.error);
        }
        if (!response.ok || !updated) throw new Error(result.error ?? "Evidence action failed");
        responseRun = updated.run;
        responseReview = updated.pageIrSourceReview;
        setRun(updated.run);
        setPageIrSourceReview(updated.pageIrSourceReview);
      };

      if (note.trim()) await step(currentFeedbackBody());
      await step(body);
      clearFeedbackDraft();
      setFeedbackStatus(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence action failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendFeedback() {
    if (!note.trim()) {
      setError("Write feedback before sending it.");
      return;
    }
    setBusy(true);
    setError(null);
    setFeedbackStatus(null);
    try {
      const response = await fetch(`/api/evidence/${run.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentFeedbackBody()),
      });
      const result = (await response.json()) as {
        error?: string;
        workflow?: RunState["evidenceWorkflow"];
        pageIrSourceReview?: PageIrSourceReviewView | null;
      };
      const updated = mergeEvidenceWorkspaceResponse(run, pageIrSourceReview, result);
      if (!response.ok) recoverFeedbackAttachments(response.status, result.error);
      if (!response.ok || !updated) throw new Error(result.error ?? "Feedback could not be saved");
      setRun(updated.run);
      setPageIrSourceReview(updated.pageIrSourceReview);
      clearFeedbackDraft();
      setFeedbackStatus("Feedback and attachments were saved with this review.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Feedback could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function requestChanges() {
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    setFeedbackStatus(null);
    try {
      let responseRun = run;
      let responseReview = pageIrSourceReview;
      const step = async (body: Record<string, unknown>) => {
        const response = await fetch(`/api/evidence/${run.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = (await response.json()) as {
          error?: string;
          workflow?: RunState["evidenceWorkflow"];
          pageIrSourceReview?: PageIrSourceReviewView | null;
        };
        const updated = mergeEvidenceWorkspaceResponse(responseRun, responseReview, result);
        if (!response.ok && body.action === "record-feedback") {
          recoverFeedbackAttachments(response.status, result.error);
        }
        if (!response.ok || !updated) throw new Error(result.error ?? "Evidence action failed");
        responseRun = updated.run;
        responseReview = updated.pageIrSourceReview;
        setRun(updated.run);
        setPageIrSourceReview(updated.pageIrSourceReview);
      };
      await step(currentFeedbackBody());
      await step({ action: "request-revision", note: note.trim() });
      setRun(responseRun);
      setPageIrSourceReview(responseReview);
      clearFeedbackDraft();
      setFeedbackStatus("Changes were requested and your feedback was saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence action failed");
    } finally {
      setBusy(false);
    }
  }

  /** The workspace's one action per gate: chains the existing submit → approve
   * → advance API calls client-side, then kicks the pipeline so the next
   * gate's draft materializes without the reviewer leaving the workspace. */
  async function approveAndContinue() {
    if (!current || current.artifactType === "visual-qa") return;
    setBusy(true);
    setError(null);
    try {
      let workflow = run.evidenceWorkflow;
      let responseRun = run;
      let responseReview = pageIrSourceReview;
      const step = async (body: Record<string, unknown>) => {
        const response = await fetch(`/api/evidence/${run.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = (await response.json()) as {
          error?: string;
          workflow?: RunState["evidenceWorkflow"];
          pageIrSourceReview?: PageIrSourceReviewView | null;
        };
        const updated = mergeEvidenceWorkspaceResponse(
          responseRun,
          responseReview,
          result,
        );
        if (!response.ok && body.action === "record-feedback") {
          recoverFeedbackAttachments(response.status, result.error);
        }
        if (!response.ok || !updated) throw new Error(result.error ?? "Evidence action failed");
        responseRun = updated.run;
        responseReview = updated.pageIrSourceReview;
        workflow = updated.run.evidenceWorkflow;
        setRun(updated.run);
        setPageIrSourceReview(updated.pageIrSourceReview);
      };

      if (note.trim()) await step(currentFeedbackBody());

      if (approval === "draft") await step({ action: "submit", note });
      if (approval === "draft" || approval === "in-review") await step({ action: "approve", note });

      const stageIndex = EVIDENCE_WORKFLOW_STAGES.indexOf(workflow.currentStage);
      const next = EVIDENCE_WORKFLOW_STAGES[stageIndex + 1];
      if (next) await step({ action: "advance", nextStage: next });

      setRun(responseRun);
      clearFeedbackDraft();

      // Materialize the newly-advanced gate's draft without leaving the
      // workspace: kick the pipeline, read its stream to the terminal event
      // (mirrors ReferenceSelectionPanel's resume flow), then re-fetch the
      // workflow so the fresh artifact appears without a page navigation.
      const resumeResponse = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
      });
      if (resumeResponse.ok) {
        await consumePipelineRunStream(resumeResponse, () => {});
      }
      const refreshed = await fetch(`/api/evidence/${run.id}`, { cache: "no-store" });
      const refreshedResult = (await refreshed.json()) as {
        workflow?: RunState["evidenceWorkflow"];
        pageIrSourceReview?: PageIrSourceReviewView | null;
      };
      const refreshedState = mergeEvidenceWorkspaceResponse(
        responseRun,
        responseReview,
        refreshedResult,
      );
      if (refreshed.ok && refreshedState) {
        setRun(refreshedState.run);
        setPageIrSourceReview(refreshedState.pageIrSourceReview);
        const updatedCurrent = latestCurrentArtifact(refreshedState.run);
        setDraftText(updatedCurrent ? JSON.stringify(updatedCurrent.artifact, null, 2) : "");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence action failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveVersion() {
    if (!current) return;
    try {
      const artifact = JSON.parse(draftText) as unknown;
      await actionAfterFeedback({
        action: "save-version",
        draft: { artifactType: current.artifactType, artifact },
      }, "The new version and its supporting feedback were saved.");
    } catch {
      setError("The edited artifact is not valid JSON.");
    }
  }

  function updateHumanCriterion(
    key: HumanReviewCriterionKey,
    patch: Partial<HumanReviewDraftCriterion>
  ) {
    setStoredHumanReviewDraft((draft) => {
      const currentDraft = syncHumanVisualReviewDraft(draft, humanReviewIdentity);
      return {
        ...currentDraft,
        criteria: {
          ...currentDraft.criteria,
          [key]: { ...currentDraft.criteria[key], ...patch },
        },
      };
    });
  }

  async function submitHumanReview() {
    if (!humanReviewReady) return;
    const criterion = (key: HumanReviewCriterionKey) => ({
      status: humanCriteria[key].status as "pass" | "fail",
      ...(humanCriteria[key].findings.trim()
        ? { findings: humanCriteria[key].findings.trim() }
        : {}),
    });
    const body = {
      action: "record-human-visual-review",
      reviewerName: reviewerName.trim(),
      reviewerKind: "human",
      humanAttestation: true,
      criteria: {
        briefFidelity: criterion("briefFidelity"),
        visualHierarchy: criterion("visualHierarchy"),
        spacingAndComposition: criterion("spacingAndComposition"),
        businessSpecificity: criterion("businessSpecificity"),
        designAndReferenceAlignment: {
          ...criterion("designAndReferenceAlignment"),
          referenceContext,
        },
      },
    };
    setBusy(true);
    setError(null);
    setFeedbackStatus(null);
    try {
      let responseRun = run;
      let responseReview = pageIrSourceReview;
      const step = async (stepBody: Record<string, unknown>) => {
        const response = await fetch(`/api/evidence/${run.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stepBody),
        });
        const result = (await response.json()) as {
          error?: string;
          workflow?: RunState["evidenceWorkflow"];
          pageIrSourceReview?: PageIrSourceReviewView | null;
        };
        const updated = mergeEvidenceWorkspaceResponse(responseRun, responseReview, result);
        if (!response.ok && stepBody.action === "record-feedback") {
          recoverFeedbackAttachments(response.status, result.error);
        }
        if (!response.ok || !updated) throw new Error(result.error ?? "Evidence action failed");
        responseRun = updated.run;
        responseReview = updated.pageIrSourceReview;
        setRun(updated.run);
        setPageIrSourceReview(updated.pageIrSourceReview);
      };
      if (note.trim()) await step(currentFeedbackBody());
      await step(body);
      clearFeedbackDraft();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="evidence-workspace">
      <div className="evidence-workspace__marker mono-meta">
        <span>ONE-BOX · {run.id} · gate {currentIndex + 1}/{EVIDENCE_WORKFLOW_STAGES.length}</span>
        <a className="btn-ghost btn-mini" href={`/api/evidence/${run.id}/export`}>
          Export ledger
        </a>
      </div>

      <header className="evidence-workspace__header">
        <p className="eyebrow">{"{ evidence workspace }"}</p>
        <h1>Review before build</h1>
        <p className="evidence-workspace__sub">Start with the useful summary. Open sources and technical details only when you need them.</p>
      </header>

      {legacyReadOnly && compatibility && (
        <div className="preview-alert" role="status">
          <strong className="preview-alert__title">{compatibility.label}</strong>
          <span className="preview-alert__detail">{compatibility.message}</span>
          <Link className="btn-ghost btn-mini" href={`/preview/${run.id}`}>
            Open preview
          </Link>
        </div>
      )}

      {!legacyReadOnly && run.referenceSelection?.status === "pending" && (
        <ReferenceSelectionPanel runId={run.id} initial={run.referenceSelection} />
      )}

      <div className="evidence-grid">
        <nav className="gate-rail card-surface" aria-label="Evidence workflow stages">
          <ol>
            {EVIDENCE_WORKFLOW_STAGES.map((stage, index) => {
              const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "future";
              const version = stageVersion(run, stage);
              // A gate with a recorded artifact is readable, whether or not it
              // is the run's current one — this is how the palette, the
              // Tailwind theme and the CSS architecture get opened at all.
              const readable = Boolean(latestArtifactForStage(run, stage));
              const label = (
                <>
                  <span className="gate-rail__dot" aria-hidden="true">
                    {state === "complete" ? "✓" : null}
                  </span>
                  <span className="gate-rail__label">{GATE_LABELS[stage]}</span>
                  <span
                    className="gate-rail__meta mono-meta"
                    data-approval={state === "current" ? approval ?? undefined : undefined}
                  >
                    {gateRailMeta(state === "current", approval, version)}
                  </span>
                </>
              );
              return (
                <li
                  key={stage}
                  className="gate-rail__item"
                  data-state={state}
                  data-viewing={stage === shownStage ? "" : undefined}
                  aria-current={stage === run.evidenceWorkflow.currentStage ? "step" : undefined}
                >
                  {readable ? (
                    <button
                      type="button"
                      className="gate-rail__open"
                      aria-pressed={stage === shownStage}
                      onClick={() =>
                        setViewStage(stage === run.evidenceWorkflow.currentStage ? null : stage)
                      }
                    >
                      {label}
                    </button>
                  ) : (
                    <span className="gate-rail__open gate-rail__open--static">{label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="artifact-panel card-surface" aria-live="polite">
          <div className="artifact-panel__head">
            <div>
              <h2>
                {sourceReviewActive
                  ? "PageIR Source Bundle"
                  : shown
                    ? ARTIFACT_TITLES[shown.artifactType]
                    : "Draft not generated"}
              </h2>
              {!sourceReviewActive && shown && (
                <p className="artifact-panel__prov mono-meta">
                  {shownStage} · v{shown.version} · {shownApproval}
                </p>
              )}
            </div>
            {/* Approving is bound to the run's own gate, never to whatever the
                reader happens to be looking at. */}
            {browsing && (
              <div className="artifact-panel__actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setViewStage(null)}
                >
                  Back to {GATE_LABELS[run.evidenceWorkflow.currentStage]}
                </button>
              </div>
            )}
            {!browsing && current && !sourceReviewActive && (
              <div className="artifact-panel__actions">
                <a className="btn-ghost" href="#review-decision">Review decision</a>
              </div>
            )}
          </div>

          {browsing && (
            <p className="artifact-panel__browsing mono-meta" role="status">
              Reading an approved gate. The run is waiting at{" "}
              {GATE_LABELS[run.evidenceWorkflow.currentStage]}.
            </p>
          )}

          {!browsing && run.evidenceWorkflow.currentStage === "build" && (
            <p className="artifact-panel__recap mono-meta">Prior approvals: {priorApprovalsRecap(run)}</p>
          )}

          {approvedSourceProofAlongsideVisualQa && pageIrSourceReview?.humanReview && (
            <details className="state-card">
              <summary>
                Source Bundle approved by {pageIrSourceReview.humanReview.reviewerName}
              </summary>
              <p className="mono-meta">
                {pageIrSourceReview.humanReview.reviewedAt.slice(0, 10)} · payload{" "}
                {pageIrSourceReview.humanReview.payloadSha256.slice(0, 12)}
              </p>
            </details>
          )}

          {sourceReviewActive && pageIrSourceReview ? (
            <PageIrSourceReviewPanel
              runId={run.id}
              review={pageIrSourceReview}
              draft={pageIrSourceDraft}
              busy={busy}
              setDraft={setStoredPageIrSourceDraft}
              submit={(body) => void action(body)}
            />
          ) : shown ? (
            <>
              <ReviewStageOverview artifact={shown} approval={shownApproval} />
              <details className="review-technical">
                <summary>View sources and technical details</summary>
                <ArtifactPreview artifact={shown} runId={run.id} palette={palette} />
              </details>
              {!browsing && approval === "revision-requested" && current?.artifactType !== "visual-qa" && (
                <textarea
                  className="evidence-draft-editor"
                  aria-label="Edit current artifact JSON"
                  value={draftText}
                  onChange={(event) => setDraftText(event.target.value)}
                  spellCheck={false}
                />
              )}
            </>
          ) : (
            <div className="artifact-panel__empty">
              <div className="state-card" role="status">
                <span className="state-card__label">pending</span>
                <p className="state-card__title">Draft not generated</p>
                <p className="state-card__body">
                  This panel fills with the {ARTIFACT_TITLES[EVIDENCE_STAGE_ARTIFACT[run.evidenceWorkflow.currentStage]]} once its
                  draft is ready. Every run moves through six gates in order:{" "}
                  {EVIDENCE_WORKFLOW_STAGES.map((stage) => GATE_LABELS[stage]).join(", ")}.
                </p>
              </div>
            </div>
          )}

          {!legacyReadOnly && !sourceReviewActive && approval === "in-review" && current?.artifactType === "visual-qa" && (
            <section className="evidence-readable" aria-labelledby="human-visual-review-title">
              <h3 id="human-visual-review-title">Human visual review</h3>
              <p>Only a person can submit this decision. Gemini and other model audits stay advisory and cannot fill this review.</p>
              <label className="evidence-note">
                Reviewer name
                <input value={reviewerName} onChange={(event) => setStoredHumanReviewDraft({ ...humanReviewDraft, reviewerName: event.target.value })} autoComplete="name" />
              </label>
              {HUMAN_REVIEW_CRITERIA.map(({ key, label, description }) => (
                <fieldset key={key}>
                  <legend>{label}</legend>
                  <p>{description}</p>
                  <label><input type="radio" name={`human-review-${key}`} checked={humanCriteria[key].status === "pass"} onChange={() => updateHumanCriterion(key, { status: "pass" })} /> Pass</label>
                  <label><input type="radio" name={`human-review-${key}`} checked={humanCriteria[key].status === "fail"} onChange={() => updateHumanCriterion(key, { status: "fail" })} /> Needs revision</label>
                  {key === "designAndReferenceAlignment" && (
                    <label>Reference basis
                      <select value={referenceContext} onChange={(event) => setStoredHumanReviewDraft({ ...humanReviewDraft, referenceContext: event.target.value as HumanReviewReferenceContext })}>
                        <option value="">Choose reference basis…</option>
                        {requiredReferenceContext === "design-and-references" ? (
                          <option value="design-and-references">DESIGN.md and selected references</option>
                        ) : (
                          <option value="explicit-no-reference">No external reference was selected</option>
                        )}
                      </select>
                    </label>
                  )}
                  <label>Findings {humanCriteria[key].status === "fail" ? "(required)" : "(optional)"}
                    <textarea value={humanCriteria[key].findings} onChange={(event) => updateHumanCriterion(key, { findings: event.target.value })} />
                  </label>
                </fieldset>
              ))}
              <label><input type="checkbox" checked={humanAttestation} onChange={(event) => setStoredHumanReviewDraft({ ...humanReviewDraft, humanAttestation: event.target.checked })} /> I attest that I am the human reviewer</label>
            </section>
          )}
          {error && <p className="chat-error" role="alert">{error}</p>}

          {!legacyReadOnly && !sourceReviewActive && !browsing && current && run.referenceSelection?.status !== "pending" && (
            <section
              className="review-feedback-composer"
              id="review-decision"
              aria-labelledby="review-feedback-title"
            >
              <div className="review-feedback-composer__head">
                <div>
                  <p className="eyebrow">{"{ your decision }"}</p>
                  <h3 id="review-feedback-title">Add feedback or evidence</h3>
                </div>
                <p id="review-feedback-help">Attach a brand kit, logo, screenshot, reference image, or document. Files stay private and do not change the site by themselves.</p>
              </div>
              <label className="review-feedback-composer__field">
                Feedback
                <textarea
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setFeedbackStatus(null);
                  }}
                  maxLength={2_000}
                  aria-required="true"
                  aria-invalid={Boolean(error && !note.trim())}
                  aria-describedby="review-feedback-help"
                  placeholder="Tell OneBox what works or what needs to change…"
                />
              </label>
              <UploadPanel
                uploads={feedbackUploads}
                onChange={setFeedbackUploads}
                uploadSession={feedbackUploadSession}
                onUploadSessionChange={setFeedbackUploadSession}
                externalSessionError={feedbackSessionError}
                onExternalSessionErrorClear={() => setFeedbackSessionError(null)}
                disabled={busy}
                review
              />
              <div className="review-feedback-composer__status" aria-live="polite">
                {feedbackDecisionBlocked
                  ? "Add feedback text before saving attached evidence with a decision."
                  : feedbackStatus}
              </div>
              <div className="review-feedback-composer__actions">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy || !note.trim()}
                  onClick={() => void sendFeedback()}
                >
                  {busy ? "Sending…" : "Send feedback"}
                </button>
                {canApproveAndContinue && (
                  <button className="btn-primary" disabled={busy || feedbackDecisionBlocked} onClick={() => void approveAndContinue()}>
                    Approve to Continue
                  </button>
                )}
                {canSubmitVisualQaDraft && (
                  <button
                    className="btn-primary"
                    disabled={busy || feedbackDecisionBlocked}
                    onClick={() => void actionAfterFeedback(
                      { action: "submit", note },
                      "The visual QA artifact and its supporting feedback were submitted for review.",
                    )}
                  >
                    Submit for Review
                  </button>
                )}
                {canSaveRevisionFromHeader && (
                  <button className="btn-primary" disabled={busy || feedbackDecisionBlocked} onClick={() => void saveVersion()}>
                    Save New Version
                  </button>
                )}
                {current.artifactType !== "visual-qa" && approval !== "revision-requested" && (
                  <button className="btn-coral" disabled={busy || !note.trim()} onClick={() => void requestChanges()}>
                    Request Changes
                  </button>
                )}
                {current.artifactType === "visual-qa" && approval === "in-review" && (
                  <>
                    <button className="btn-primary" disabled={busy || feedbackDecisionBlocked || !humanReviewAllPass} onClick={() => void submitHumanReview()}>
                      Approve to Continue
                    </button>
                    <button className="btn-coral" disabled={busy || feedbackDecisionBlocked || !humanReviewHasRevision} onClick={() => void submitHumanReview()}>
                      Request Changes
                    </button>
                  </>
                )}
              </div>
            </section>
          )}

          <div className="evidence-actions">
            {!sourceReviewActive && current?.artifactType === "visual-qa" && approval !== "approved" && (
              <Link className="btn-ghost" href={`/preview/${run.id}`}>
                Open build preview
              </Link>
            )}
            {!legacyReadOnly && !sourceReviewActive && !current && (
              <Link className="btn-ghost" href={`/?run=${run.id}`}>
                Resume generation
              </Link>
            )}
            {!legacyReadOnly && !sourceReviewActive && approval === "revision-requested" && current?.artifactType === "visual-qa" && (
              <button className="btn-ghost" disabled={busy} onClick={() => void action({ action: "regenerate-visual-qa" })}>
                Regenerate visual QA from current build
              </button>
            )}
            {!sourceReviewActive && approval === "approved" && !nextStage && (
              <Link className="btn-primary" href={`/preview/${run.id}`}>Open approved build</Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
