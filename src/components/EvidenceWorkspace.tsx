"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  EVIDENCE_STAGE_ARTIFACT,
  EVIDENCE_WORKFLOW_STAGES,
  ARTIFACTS,
  workflowArtifactApprovalState,
  type RunState,
  type HumanVisualReviewCriteria,
  type WorkflowArtifactVersion,
} from "../lib/contracts";
import type { RequiredReferenceContext } from "../lib/referenceContext";

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

function latestCurrentArtifact(run: RunState): WorkflowArtifactVersion | undefined {
  const expected = EVIDENCE_STAGE_ARTIFACT[run.evidenceWorkflow.currentStage];
  return run.evidenceWorkflow.artifacts
    .filter((artifact) => artifact.artifactType === expected)
    .sort((left, right) => right.version - left.version)[0];
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

function ArtifactTextPreview({ runId, artifactPath, label }: { runId: string; artifactPath: string; label: string }) {
  const href = artifactUrl(runId, artifactPath);
  const [result, setResult] = useState<{
    href: string;
    text: string | null;
    failed: boolean;
  }>({ href: "", text: null, failed: false });
  useEffect(() => {
    let active = true;
    fetch(href)
      .then((response) => {
        if (!response.ok) throw new Error(`artifact returned ${response.status}`);
        return response.text();
      })
      .then((value) => { if (active) setResult({ href, text: value, failed: false }); })
      .catch(() => { if (active) setResult({ href, text: null, failed: true }); });
    return () => { active = false; };
  }, [href]);
  return (
    <section aria-label={`${label} preview`}>
      <h4>{label}</h4>
      <p><a href={href}>Open {label}</a></p>
      {result.href !== href ? <p role="status">Loading preview…</p> : result.failed ? <p role="alert">Preview unavailable; open the versioned artifact directly.</p> : <pre tabIndex={0}>{result.text}</pre>}
    </section>
  );
}

export function ArtifactPreview({ artifact, runId }: { artifact: WorkflowArtifactVersion; runId: string }) {
  const jsonHref = versionJsonUrl(runId, artifact);
  switch (artifact.artifactType) {
    case "ledger": {
      const groups = [
        ["Business intelligence", artifact.artifact.businessIntelligence] as const,
        ["Refero design evidence", artifact.artifact.referoDesignEvidence] as const,
      ];
      return (
        <div className="evidence-readable">
          <p><a href={jsonHref}>Open versioned ledger JSON</a></p>
          {groups.map(([title, group]) => (
            <section key={title}>
              <h3>{title}</h3>
              {group.sources.length === 0 &&
                group.claims.length === 0 &&
                (!("references" in group) || group.references.length === 0) &&
                (!("competitors" in group) ||
                  (group.competitors.length === 0 &&
                    group.marketExpectations.length === 0 &&
                    group.differentiationOpportunities.length === 0)) && (
                <p>
                  {title === "Business intelligence"
                    ? "No competitors or other business intelligence evidence were recorded for this run."
                    : "No Refero design evidence was recorded for this run."}
                </p>
              )}
              <ul>{group.claims.map((claim) => <li key={claim.id}><strong>{claim.classification}</strong> · {Math.round(claim.confidence * 100)}% — {claim.statement}</li>)}</ul>
              {group.sources.map((source) => { const href = safeExternalHref(source.sourceUrl); return <div key={source.id}><p>{href ? <a href={href} target="_blank" rel="noreferrer">{source.title ?? source.sourceUrl}</a> : <>{source.title ?? source.sourceUrl} · {source.sourceUrl}</>} · {Math.round(source.confidence * 100)}% · {source.capturedAt}</p>{source.screenshotPaths.map((screenshot) => <figure key={screenshot}><EvidenceImage src={artifactUrl(runId, screenshot)} alt={`${source.title ?? source.id} evidence`} /><figcaption>{screenshot}</figcaption></figure>)}{source.extractedArtifactPaths.map((extracted) => <p key={extracted}><a href={artifactUrl(runId, extracted)}>Extracted artifact: {extracted}</a></p>)}{source.crawlAttempts.map((attempt, index) => <p key={`${attempt.provider}-${index}`}>Crawl {index + 1}: {attempt.provider} · {attempt.outcome} · {attempt.confidence} · {attempt.failureReason ?? "succeeded"}</p>)}</div>; })}
              {"competitors" in group && group.competitors.length > 0 && <><h4>Selected competitors</h4><ul>{group.competitors.map((competitor) => { const href = safeExternalHref(competitor.url); return <li key={competitor.url}>{href ? <a href={href} target="_blank" rel="noreferrer">{competitor.name}</a> : <>{competitor.name} · {competitor.url}</>} — {competitor.selectionRationale}{competitor.strengths.length > 0 ? ` · Strengths: ${competitor.strengths.join("; ")}` : ""}{competitor.gaps.length > 0 ? ` · Gaps: ${competitor.gaps.join("; ")}` : ""}</li>; })}</ul></>}
              {"marketExpectations" in group && group.marketExpectations.length > 0 && <><h4>Market expectations</h4><ul>{group.marketExpectations.map((expectation) => <li key={expectation}>{expectation}</li>)}</ul></>}
              {"differentiationOpportunities" in group && group.differentiationOpportunities.length > 0 && <><h4>Differentiation opportunities</h4><ul>{group.differentiationOpportunities.map((opportunity) => <li key={opportunity}>{opportunity}</li>)}</ul></>}
              {"references" in group && group.references.map((reference) => <p key={reference.referoId}><strong>{reference.name}</strong> — {reference.learningRationale}<br />Reusable: {reference.reusablePatterns.join("; ")}</p>)}
            </section>
          ))}
          <section>
            <h3>Client-provided evidence</h3>
            {artifact.artifact.clientEvidence.sources.length === 0 &&
              artifact.artifact.clientEvidence.claims.length === 0 &&
              artifact.artifact.clientEvidence.unsupportedUploadIds.length === 0 &&
              artifact.artifact.clientEvidence.artifactRelationships.length === 0 && (
                <p>No client-provided evidence was attached to this run.</p>
              )}
            <ul>
              {artifact.artifact.clientEvidence.claims.map((claim) => (
                <li key={claim.id}><strong>{claim.classification}</strong> · {Math.round(claim.confidence * 100)}% — {claim.statement}</li>
              ))}
            </ul>
            {artifact.artifact.clientEvidence.sources.map((source) => (
              <p key={source.id}>{source.title ?? source.id} · {Math.round(source.confidence * 100)}% · {source.capturedAt}</p>
            ))}
            {artifact.artifact.clientEvidence.unsupportedUploadIds.length > 0 && (
              <p>Unsupported uploads (recorded, not silently parsed): {artifact.artifact.clientEvidence.unsupportedUploadIds.join(", ")}</p>
            )}
            {artifact.artifact.clientEvidence.artifactRelationships.map((relationship) => (
              <p key={relationship.uploadId}>Client artifact {relationship.uploadId}: {relationship.status} · consumer {relationship.consumer ?? "none"} · SHA-256 {relationship.sha256 ?? "not supplied"} · source {relationship.sourceId ?? "unsupported"}</p>
            ))}
          </section>
        </div>
      );
    }
    case "design-contract":
      return <div className="evidence-readable"><h3>{artifact.artifact.title}</h3><p><a href={jsonHref}>Open versioned contract metadata JSON</a></p><p>Approved evidence: {artifact.artifact.approvedEvidenceIds.join(", ") || "none"}</p><ArtifactTextPreview runId={runId} artifactPath={artifact.artifact.contractPath} label="DESIGN.md" />{artifact.artifact.exportPaths.map((exportPath) => <ArtifactTextPreview key={exportPath} runId={runId} artifactPath={exportPath} label="Tailwind export" />)}</div>;
    case "token-inventory":
      return <div className="evidence-readable"><h3>Semantic token inventory</h3><p><a href={jsonHref}>Open versioned token inventory JSON</a></p><table><thead><tr><th>Token</th><th>Value</th><th>Use</th><th>Evidence</th></tr></thead><tbody>{artifact.artifact.tokens.map((token) => <tr key={token.semanticName}><td><code>{token.semanticName}</code></td><td>{token.value}</td><td>{token.usage}</td><td>{token.sourceEvidenceIds.join(", ") || "contract"}</td></tr>)}</tbody></table><pre tabIndex={0}>{JSON.stringify(artifact.artifact, null, 2)}</pre></div>;
    case "tailwind-plan":
      return <div className="evidence-readable"><h3>Tailwind v4 mapping</h3><p><a href={jsonHref}>Open versioned Tailwind plan JSON</a></p><ul>{artifact.artifact.themeMappings.map((mapping) => <li key={mapping.tailwindName}><code>{mapping.tailwindName}</code> → <code>{mapping.cssVariable}</code><br />{mapping.rationale}</li>)}</ul><pre tabIndex={0}>{JSON.stringify(artifact.artifact, null, 2)}</pre></div>;
    case "css-architecture":
      return <div className="evidence-readable"><h3>CSS architecture</h3><p><a href={jsonHref}>Open versioned CSS architecture JSON</a></p><ol>{artifact.artifact.cssVariableHierarchy.map((layer) => <li key={layer}>{layer}</li>)}</ol><h4>Token to component usage</h4><ul>{Object.entries(artifact.artifact.tokenToComponentUsage).map(([token, uses]) => <li key={token}><code>{token}</code> — {uses.join("; ")}</li>)}</ul><ArtifactTextPreview runId={runId} artifactPath={ARTIFACTS.tailwindTheme} label="Generated Tailwind theme source (@theme mapping)" />{artifact.artifact.generatedCssPath ? <ArtifactTextPreview runId={runId} artifactPath={artifact.artifact.generatedCssPath} label="Compiled Tailwind utility output" /> : <p>Compiled utility output: pending until build.</p>}<p>Exceptions: {artifact.artifact.justifiedExceptions.join(", ") || "none"}</p><pre tabIndex={0}>{JSON.stringify(artifact.artifact, null, 2)}</pre></div>;
    case "visual-qa":
      return <div className="evidence-readable"><h3>Automated visual evidence</h3><p>These machine-generated checks and screenshots are separate from the human visual decision.</p><p><a href={jsonHref}>Open versioned visual QA JSON</a></p><ul>{artifact.artifact.checks.map((check) => <li key={check.area}><strong>{check.area}: {check.status}</strong> — {check.notes}{check.evidencePath && <figure><a href={artifactUrl(runId, check.evidencePath)}><EvidenceImage src={artifactUrl(runId, check.evidencePath)} alt={`${check.area} QA evidence`} /></a><figcaption>{check.evidencePath}</figcaption></figure>}</li>)}</ul>{artifact.approvalTransitions.filter((transition) => transition.humanVisualReview).map((transition) => { const review = transition.humanVisualReview!; return <section key={review.reviewedAt} aria-label={`Human visual review by ${review.reviewerName}`}><h4>Reviewed by {review.reviewerName}</h4><p>{review.reviewedAt} · build <code>{review.buildSha256.slice(0, 12)}</code></p><ul>{HUMAN_REVIEW_CRITERIA.map(({ key, label }) => { const criterion = review.criteria[key]; return <li key={key}><strong>{label}: {criterion.status}</strong>{criterion.findings ? ` — ${criterion.findings}` : ""}{key === "designAndReferenceAlignment" && "referenceContext" in criterion ? ` · ${criterion.referenceContext}` : ""}</li>; })}</ul></section>; })}<pre tabIndex={0}>{JSON.stringify(artifact.artifact, null, 2)}</pre></div>;
  }
}

export function EvidenceWorkspace({
  initialRun,
  requiredReferenceContext = initialRun.referenceMode === "none"
    ? "explicit-no-reference"
    : "design-and-references",
}: {
  initialRun: RunState;
  requiredReferenceContext?: RequiredReferenceContext;
}) {
  const [run, setRun] = useState(initialRun);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const currentIndex = EVIDENCE_WORKFLOW_STAGES.indexOf(
    run.evidenceWorkflow.currentStage
  );
  const nextStage = EVIDENCE_WORKFLOW_STAGES[currentIndex + 1];
  const humanReviewReady =
    reviewerName.trim().length > 0 &&
    humanAttestation &&
    Boolean(referenceContext) &&
    Object.values(humanCriteria).every(
      (criterion) =>
        criterion.status !== "" &&
        (criterion.status !== "fail" || criterion.findings.trim().length > 0)
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
      const result = (await response.json()) as { error?: string; workflow?: RunState["evidenceWorkflow"] };
      if (!response.ok || !result.workflow) throw new Error(result.error ?? "Evidence action failed");
      const updated = { ...run, evidenceWorkflow: result.workflow };
      setRun(updated);
      const updatedCurrent = latestCurrentArtifact(updated);
      setDraftText(updatedCurrent ? JSON.stringify(updatedCurrent.artifact, null, 2) : "");
      setNote("");
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
      await action({
        action: "save-version",
        draft: { artifactType: current.artifactType, artifact },
      });
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

  function submitHumanReview() {
    if (!humanReviewReady) return;
    const criterion = (key: HumanReviewCriterionKey) => ({
      status: humanCriteria[key].status as "pass" | "fail",
      ...(humanCriteria[key].findings.trim()
        ? { findings: humanCriteria[key].findings.trim() }
        : {}),
    });
    void action({
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
    });
  }

  return (
    <main className="evidence-workspace">
      <header className="evidence-workspace__header">
        <div>
          <p className="eyebrow">{"{ evidence workspace }"}</p>
          <h1>Review before build</h1>
          <p>Run {run.id}. Every stage is versioned and must be approved in order.</p>
        </div>
        <a className="pill-button" href={`/api/evidence/${run.id}/export`}>
          Export ledger
        </a>
      </header>

      <ol className="evidence-steps" aria-label="Evidence workflow stages">
        {EVIDENCE_WORKFLOW_STAGES.map((stage, index) => (
          <li
            key={stage}
            aria-current={stage === run.evidenceWorkflow.currentStage ? "step" : undefined}
            data-state={index < currentIndex ? "complete" : index === currentIndex ? "current" : "future"}
          >
            <span>{index + 1}</span>
            {stage}
          </li>
        ))}
      </ol>

      <section className="evidence-review" aria-live="polite">
        <div className="evidence-review__title">
          <div>
            <p className="eyebrow">{run.evidenceWorkflow.currentStage}</p>
            <h2>{current?.artifactType ?? "Draft not generated"}</h2>
          </div>
          {current && <span className="evidence-status">v{current.version} · {approval}</span>}
        </div>

        {current ? (
          <>
            <ArtifactPreview artifact={current} runId={run.id} />
            {approval === "revision-requested" && current.artifactType !== "visual-qa" && (
              <textarea
                aria-label="Edit current artifact JSON"
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                spellCheck={false}
              />
            )}
          </>
        ) : (
          <p>Advance or resume the run to generate this stage’s deterministic draft.</p>
        )}

        {!(approval === "in-review" && current?.artifactType === "visual-qa") && <label className="evidence-note">
          Review note
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </label>}
        {approval === "in-review" && current?.artifactType === "visual-qa" && (
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
        {error && <p className="chat-error">{error}</p>}

        <div className="evidence-actions">
          {current?.artifactType === "visual-qa" && approval !== "approved" && (
            <Link className="pill-button" href={`/preview/${run.id}`}>
              Open build preview
            </Link>
          )}
          {!current && (
            <Link className="pill-button" href={`/?run=${run.id}`}>
              Resume generation
            </Link>
          )}
          {approval === "draft" && (
            <>
              <button disabled={busy} onClick={() => void action({ action: "submit", note })}>Submit for review</button>
              <button disabled={busy || !note.trim()} onClick={() => void action({ action: "request-revision", note })}>Request revision</button>
            </>
          )}
          {approval === "in-review" && (
            current?.artifactType === "visual-qa" ? (
              <button disabled={busy || !humanReviewReady} onClick={submitHumanReview}>Submit human visual review</button>
            ) : <>
                <button disabled={busy} onClick={() => void action({ action: "approve", note })}>Approve</button>
                <button disabled={busy || !note.trim()} onClick={() => void action({ action: "request-revision", note })}>Request revision</button>
              </>
          )}
          {approval === "revision-requested" && current?.artifactType !== "visual-qa" && (
            <button disabled={busy} onClick={() => void saveVersion()}>Save new version</button>
          )}
          {approval === "revision-requested" && current?.artifactType === "visual-qa" && (
            <button disabled={busy} onClick={() => void action({ action: "regenerate-visual-qa" })}>
              Regenerate visual QA from current build
            </button>
          )}
          {approval === "approved" && nextStage && (
            <button disabled={busy} onClick={() => void action({ action: "advance", nextStage })}>Advance to {nextStage}</button>
          )}
          {approval === "approved" && !nextStage && (
            <Link className="pill-button" href={`/preview/${run.id}`}>Open approved build</Link>
          )}
        </div>
      </section>
    </main>
  );
}
