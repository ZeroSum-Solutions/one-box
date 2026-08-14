"use client";

import { useEffect, useState } from "react";
import {
  EvidenceWorkflowStateSchema,
  type DesignResearchLedger,
  type EvidenceClaim,
  type EvidenceSource,
  type EvidenceWorkflowState,
  type ReferoDesignEvidence,
} from "../../lib/contracts";

type ResearchState =
  | { kind: "loading" }
  | { kind: "ready"; ledger: DesignResearchLedger }
  | { kind: "empty" }
  | { kind: "unsupported"; message: string }
  | { kind: "error"; message: string };

interface EvidenceResponse {
  pipelineVersion?: unknown;
  workflow?: unknown;
  error?: unknown;
}

export function latestResearchLedger(
  workflow: EvidenceWorkflowState,
): DesignResearchLedger | undefined {
  return workflow.artifacts
    .filter((artifact) => artifact.artifactType === "ledger")
    .sort((left, right) => right.version - left.version)[0]?.artifact;
}

export function researchStateFromResponse(payload: EvidenceResponse): ResearchState {
  if (payload.pipelineVersion !== "evidence-gated-v2") {
    return {
      kind: "unsupported",
      message: "This run uses the legacy pipeline, which does not retain a separated research ledger.",
    };
  }

  const parsed = EvidenceWorkflowStateSchema.safeParse(payload.workflow);
  if (!parsed.success) {
    return {
      kind: "unsupported",
      message: "The saved evidence workflow could not be read safely.",
    };
  }

  const ledger = latestResearchLedger(parsed.data);
  return ledger ? { kind: "ready", ledger } : { kind: "empty" };
}

function safeExternalHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function SourceLink({ source }: { source: EvidenceSource }) {
  const href = safeExternalHref(source.sourceUrl);
  const label = source.title ?? source.sourceUrl;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    <span>{label}</span>
  );
}

function ClaimList({ claims }: { claims: EvidenceClaim[] }) {
  if (claims.length === 0) return <p>No saved claims yet.</p>;
  return (
    <ul>
      {claims.map((claim) => (
        <li key={claim.id}>
          <strong>{claim.classification}</strong> ·{" "}
          {Math.round(claim.confidence * 100)}% confidence — {claim.statement}
          {claim.sourceIds.length > 0 && (
            <span> (sources: {claim.sourceIds.join(", ")})</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function SourceList({ sources }: { sources: EvidenceSource[] }) {
  if (sources.length === 0) return <p>No saved sources yet.</p>;
  return (
    <ul>
      {sources.map((source) => (
        <li key={source.id}>
          <SourceLink source={source} /> · {Math.round(source.confidence * 100)}%
          confidence · captured {source.capturedAt}
        </li>
      ))}
    </ul>
  );
}

function ReferoReferences({ evidence }: { evidence: ReferoDesignEvidence }) {
  if (evidence.references.length === 0) return null;
  return (
    <ul aria-label="Refero design references">
      {evidence.references.map((reference) => {
        const href = safeExternalHref(reference.sourceUrl);
        return (
          <li key={reference.referoId}>
            <strong>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer">
                  {reference.name}
                </a>
              ) : (
                reference.name
              )}
            </strong>
            <p>Rationale: {reference.learningRationale}</p>
            <p>Reusable patterns: {reference.reusablePatterns.join("; ")}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function stateForRun(
  requestedRunId: string,
  response: { runId: string; state: ResearchState },
): ResearchState {
  return response.runId === requestedRunId ? response.state : { kind: "loading" };
}

export function ResearchFindingsContent({ state }: { state: ResearchState }) {
  if (state.kind === "loading") {
    return (
      <div className="workbench-state workbench-state--loading" role="status">
        <span className="workbench-state__label">loading</span>
        <strong>Loading saved evidence</strong>
        <p>Retrieving the project’s retained research ledger.</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="workbench-state workbench-state--error" role="alert">
        <span className="workbench-state__label">error</span>
        <strong>Research findings are unavailable</strong>
        <p>{state.message}</p>
      </div>
    );
  }

  if (state.kind === "unsupported") {
    return (
      <div className="workbench-state workbench-state--unsupported" role="status">
        <span className="workbench-state__label">unsupported</span>
        <strong>Saved research is unavailable</strong>
        <p>{state.message}</p>
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="workbench-state" role="status">
        <span className="workbench-state__label">empty</span>
        <strong>No saved research findings</strong>
        <p>Run the evidence-gated pipeline to retain business and design-reference findings.</p>
      </div>
    );
  }

  const { ledger } = state;
  return (
    <section className="evidence-readable" aria-label="Saved research findings">
      <p className="eyebrow">{"{ Saved Research }"}</p>
      <p>
        Business intelligence and Refero design references are retained as
        separate evidence groups. Neither group is a substitute for the other.
      </p>

      <section aria-labelledby="business-findings-heading">
        <h3 id="business-findings-heading">Business intelligence</h3>
        <p>Market and competitor findings; these are not design references.</p>
        <h4>Claims</h4>
        <ClaimList claims={ledger.businessIntelligence.claims} />
        <h4>Sources</h4>
        <SourceList sources={ledger.businessIntelligence.sources} />
        {ledger.businessIntelligence.competitors.length > 0 && (
          <>
            <h4>Competitor rationale</h4>
            <ul>
              {ledger.businessIntelligence.competitors.map((competitor) => (
                <li key={`${competitor.name}-${competitor.url}`}>
                  {safeExternalHref(competitor.url) ? (
                    <a
                      href={safeExternalHref(competitor.url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {competitor.name}
                    </a>
                  ) : (
                    <span>{competitor.name}</span>
                  )}
                  <p>Rationale: {competitor.selectionRationale}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="refero-findings-heading">
        <h3 id="refero-findings-heading">Refero design reference evidence</h3>
        <p>Visual and structural learning only; this is not competitor research.</p>
        <h4>Claims</h4>
        <ClaimList claims={ledger.referoDesignEvidence.claims} />
        <h4>Sources</h4>
        <SourceList sources={ledger.referoDesignEvidence.sources} />
        <ReferoReferences evidence={ledger.referoDesignEvidence} />
      </section>
    </section>
  );
}

export function ResearchFindings({ runId }: { runId: string }) {
  const [response, setResponse] = useState<{
    runId: string;
    state: ResearchState;
  }>({ runId, state: { kind: "loading" } });

  useEffect(() => {
    let active = true;
    void fetch(`/api/evidence/${encodeURIComponent(runId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as EvidenceResponse | null;
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : `Evidence request failed (${response.status}).`,
          );
        }
        return researchStateFromResponse(payload ?? {});
      })
      .then((nextState) => {
        if (active) setResponse({ runId, state: nextState });
      })
      .catch((cause: unknown) => {
        if (active) {
          setResponse({
            runId,
            state: {
              kind: "error",
              message:
                cause instanceof Error
                  ? cause.message
                  : "The saved evidence request failed.",
            },
          });
        }
      });

    return () => {
      active = false;
    };
  }, [runId]);

  return <ResearchFindingsContent state={stateForRun(runId, response)} />;
}
