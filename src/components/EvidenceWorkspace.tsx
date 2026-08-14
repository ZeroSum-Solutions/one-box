"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  EVIDENCE_STAGE_ARTIFACT,
  EVIDENCE_WORKFLOW_STAGES,
  workflowArtifactApprovalState,
  type RunState,
  type WorkflowArtifactVersion,
} from "@/lib/contracts";

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

function artifactUrl(runId: string, artifactPath: string): string {
  const servedPath = artifactPath.startsWith("site/")
    ? artifactPath.slice("site/".length)
    : artifactPath;
  return `/api/sites/${runId}/${servedPath}`;
}

function versionJsonUrl(runId: string, artifact: WorkflowArtifactVersion): string {
  return artifactUrl(
    runId,
    `evidence/versions/${artifact.artifactType}/v${artifact.version}.json`
  );
}

function ArtifactTextPreview({ runId, artifactPath, label }: { runId: string; artifactPath: string; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const href = artifactUrl(runId, artifactPath);
  useEffect(() => {
    let active = true;
    setText(null);
    setFailed(false);
    fetch(href)
      .then((response) => {
        if (!response.ok) throw new Error(`artifact returned ${response.status}`);
        return response.text();
      })
      .then((value) => { if (active) setText(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [href]);
  return (
    <section aria-label={`${label} preview`}>
      <h4>{label}</h4>
      <p><a href={href}>Open {label}</a></p>
      {failed ? <p role="alert">Preview unavailable; open the versioned artifact directly.</p> : text === null ? <p role="status">Loading preview…</p> : <pre tabIndex={0}>{text}</pre>}
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
              <ul>{group.claims.map((claim) => <li key={claim.id}><strong>{claim.classification}</strong> · {Math.round(claim.confidence * 100)}% — {claim.statement}</li>)}</ul>
              {group.sources.map((source) => <div key={source.id}><p><a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.title ?? source.sourceUrl}</a> · {Math.round(source.confidence * 100)}% · {source.capturedAt}</p>{source.screenshotPaths.map((screenshot) => <figure key={screenshot}><EvidenceImage src={`/api/sites/${runId}/${screenshot}`} alt={`${source.title ?? source.id} evidence`} /><figcaption>{screenshot}</figcaption></figure>)}{source.extractedArtifactPaths.map((extracted) => <p key={extracted}><a href={`/api/sites/${runId}/${extracted}`}>Extracted artifact: {extracted}</a></p>)}{source.crawlAttempts.map((attempt, index) => <p key={`${attempt.provider}-${index}`}>Crawl {index + 1}: {attempt.provider} · {attempt.outcome} · {attempt.confidence} · {attempt.failureReason ?? "succeeded"}</p>)}</div>)}
              {"references" in group && group.references.map((reference) => <p key={reference.referoId}><strong>{reference.name}</strong> — {reference.learningRationale}<br />Reusable: {reference.reusablePatterns.join("; ")}</p>)}
            </section>
          ))}
          <section>
            <h3>Client-provided evidence</h3>
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
      return <div className="evidence-readable"><h3>CSS architecture</h3><p><a href={jsonHref}>Open versioned CSS architecture JSON</a></p><ol>{artifact.artifact.cssVariableHierarchy.map((layer) => <li key={layer}>{layer}</li>)}</ol><h4>Token to component usage</h4><ul>{Object.entries(artifact.artifact.tokenToComponentUsage).map(([token, uses]) => <li key={token}><code>{token}</code> — {uses.join("; ")}</li>)}</ul>{artifact.artifact.generatedCssPath ? <ArtifactTextPreview runId={runId} artifactPath={artifact.artifact.generatedCssPath} label="Generated Tailwind theme CSS" /> : <p>Generated CSS: pending</p>}<p>Exceptions: {artifact.artifact.justifiedExceptions.join(", ") || "none"}</p><pre tabIndex={0}>{JSON.stringify(artifact.artifact, null, 2)}</pre></div>;
    case "visual-qa":
      return <div className="evidence-readable"><h3>Visual QA</h3><p><a href={jsonHref}>Open versioned visual QA JSON</a></p><ul>{artifact.artifact.checks.map((check) => <li key={check.area}><strong>{check.area}: {check.status}</strong> — {check.notes}{check.evidencePath && <figure><a href={artifactUrl(runId, check.evidencePath)}><EvidenceImage src={artifactUrl(runId, check.evidencePath)} alt={`${check.area} QA evidence`} /></a><figcaption>{check.evidencePath}</figcaption></figure>}</li>)}</ul><pre tabIndex={0}>{JSON.stringify(artifact.artifact, null, 2)}</pre></div>;
  }
}

export function EvidenceWorkspace({ initialRun }: { initialRun: RunState }) {
  const [run, setRun] = useState(initialRun);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useMemo(() => latestCurrentArtifact(run), [run]);
  const approval = current ? workflowArtifactApprovalState(current) : null;
  const [draftText, setDraftText] = useState(
    current ? JSON.stringify(current.artifact, null, 2) : ""
  );
  const currentIndex = EVIDENCE_WORKFLOW_STAGES.indexOf(
    run.evidenceWorkflow.currentStage
  );
  const nextStage = EVIDENCE_WORKFLOW_STAGES[currentIndex + 1];

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
            {approval === "revision-requested" && (
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

        <label className="evidence-note">
          Review note
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {error && <p className="chat-error">{error}</p>}

        <div className="evidence-actions">
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
            <>
              <button disabled={busy} onClick={() => void action({ action: "approve", note })}>Approve</button>
              <button disabled={busy || !note.trim()} onClick={() => void action({ action: "request-revision", note })}>Request revision</button>
            </>
          )}
          {approval === "revision-requested" && (
            <button disabled={busy} onClick={() => void saveVersion()}>Save new version</button>
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
