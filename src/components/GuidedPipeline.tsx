"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketAnalysisCompetitor } from "../lib/contracts";
import type { GuidedPipelineProjection, GuidedSurface } from "../lib/guidedPipeline";
import { GuidedCompetitorDialog } from "./GuidedCompetitorDialog";
import { GuidedReferencePicker } from "./GuidedReferencePicker";

const STEPS = [
  "Understanding your business",
  "Finding market leaders",
  "Choosing your direction",
  "Designing the system",
  "Building your website",
] as const;

function currentStep(surface: GuidedSurface): number {
  switch (surface.kind) {
    case "intake-running": return 0;
    case "research-running":
    case "research-disabled":
    case "market-leaders": return 1;
    case "reference-pending":
    case "applying-preferences": return 2;
    case "workflow-running":
    case "approval-pending":
    case "synthesis-running": return 3;
    case "build-running":
    case "candidate-parked":
    case "complete":
    case "fallback": return 4;
    default: return 0;
  }
}

function statusCopy(surface: GuidedSurface): { title: string; body: string } {
  switch (surface.kind) {
    case "intake-running": return { title: "Understanding your business", body: "Organizing the facts you shared into a clear brief." };
    case "research-running": return { title: "Finding the sites that lead your market", body: "Checking real business websites, their structure, proof, and conversion choices." };
    case "research-disabled": return { title: "Market research is off", body: "Continuing from the business details you supplied." };
    case "applying-preferences": return { title: "Applying your direction", body: "Your ranked choices are locked and now shaping the design." };
    case "workflow-running": return { title: "Designing the system", body: `Preparing ${surface.artifactType.replaceAll("-", " ")}.` };
    case "synthesis-running": return { title: "Bringing the design together", body: "Combining the approved evidence, typography, color, layout, and content." };
    case "build-running": return { title: "Building your website", body: "Producing the site and checking it across quality gates." };
    case "candidate-parked": return { title: "Your build is ready for its final gate", body: "The candidate is preserved safely while final review completes." };
    default: return { title: "OneBox is working", body: "The durable pipeline will continue from its latest checkpoint." };
  }
}

function GuidedSteps({ surface }: { surface: GuidedSurface }) {
  const current = currentStep(surface);
  return (
    <ol className="guided-steps" aria-label="Website progress">
      {STEPS.map((label, index) => (
        <li
          key={label}
          className={index < current ? "is-complete" : index === current ? "is-current" : "is-future"}
          aria-current={index === current ? "step" : undefined}
        >
          <span>{index < current ? "✓" : String(index + 1).padStart(2, "0")}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function MarketLeaders(props: {
  runId: string;
  surface: Extract<GuidedSurface, { kind: "market-leaders" }>;
}) {
  const [selected, setSelected] = useState<MarketAnalysisCompetitor | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const competitors = props.surface.marketAnalysis?.competitors.slice(0, 4) ?? [];
  return (
    <section className="guided-market" aria-labelledby="guided-market-title">
      <header>
        <p className="guided-kicker">Competitive analysis</p>
        <h2 id="guided-market-title">The sites setting the pace</h2>
        <p>Selected from first-party site evidence—not review counts or directory popularity.</p>
      </header>
      <div className="guided-market__map">
        <iframe
          title="Competitor market map"
          src={`/api/maps/embed?q=${encodeURIComponent(props.surface.mapQuery)}`}
          loading="lazy"
          referrerPolicy="origin"
        />
      </div>
      {competitors.length === 0 ? (
        <p className="guided-empty">No verified competitor sites yet. The build will continue without inventing a ranking.</p>
      ) : (
        <div className="guided-market__cards">
          {competitors.map((competitor) => (
            <button
              key={competitor.id}
              type="button"
              className="guided-competitor"
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                setSelected(competitor);
              }}
            >
              <span className="guided-rank">{String(competitor.rank).padStart(2, "0")}</span>
              <span className="guided-competitor__score">{competitor.totalScore}/15 evidence score</span>
              <strong>{competitor.name}</strong>
              <span>{competitor.selectedBecause[0]?.text}</span>
              <span className="guided-competitor__open">View site and analysis →</span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <GuidedCompetitorDialog
          runId={props.runId}
          competitor={selected}
          onClose={() => {
            setSelected(null);
            window.requestAnimationFrame(() => triggerRef.current?.focus());
          }}
        />
      )}
    </section>
  );
}

export function GuidedPipelineView(props: {
  projection: GuidedPipelineProjection;
  onResume: () => void;
  onRecover?: () => void;
}) {
  const { surface } = props.projection;
  let content;
  if (surface.kind === "market-leaders") {
    content = <MarketLeaders runId={props.projection.runId} surface={surface} />;
  } else if (surface.kind === "reference-pending") {
    content = (
      <GuidedReferencePicker
        runId={props.projection.runId}
        selection={surface.selection}
        onConfirmed={props.onResume}
      />
    );
  } else if (surface.kind === "approval-pending") {
    content = (
      <section className="guided-status">
        <p className="guided-kicker">Quick review</p>
        <h2>Your {surface.artifactType.replaceAll("-", " ")} is ready</h2>
        <p>Review the visual checkpoint, then approve or request a revision.</p>
        <a className="btn-primary" href={surface.workspaceUrl}>Open review</a>
      </section>
    );
  } else if (surface.kind === "complete") {
    content = (
      <section className="guided-status guided-status--complete">
        <p className="guided-kicker">Website ready</p>
        <h2>Your site is built and verified</h2>
        <p>Open the finished website and check it on any screen size.</p>
        <a className="btn-primary" href={surface.previewUrl}>View website</a>
      </section>
    );
  } else if (surface.kind === "fallback") {
    content = (
      <section className="guided-status">
        <h2>The reliable build path is continuing</h2>
        <p>A preserved fallback run is completing the site.</p>
        <a className="btn-primary" href={`/?run=${surface.childRunId}`}>Open fallback run</a>
      </section>
    );
  } else if (["stage-failed", "cost-cap-error", "configuration-error", "state-unavailable"].includes(surface.kind)) {
    const message = "message" in surface ? surface.message : "The pipeline needs attention.";
    content = (
      <section className="guided-status guided-status--error" role="alert">
        <p className="guided-kicker">Build paused</p>
        <h2>OneBox needs attention</h2>
        <p>{message}</p>
        {props.onRecover && <button type="button" className="btn-coral" onClick={props.onRecover}>Start a clean retry</button>}
      </section>
    );
  } else {
    const copy = statusCopy(surface);
    content = <section className="guided-status"><span className="guided-loader" aria-hidden="true" /><h2>{copy.title}</h2><p>{copy.body}</p></section>;
  }

  return (
    <div className="guided-pipeline">
      <header className="guided-pipeline__header">
        <div>
          <p className="guided-kicker">{props.projection.businessName ?? "Your website"}</p>
          <h1>From idea to website</h1>
        </div>
        <span className="guided-pipeline__cost">${props.projection.costUsd.toFixed(2)} used</span>
      </header>
      <GuidedSteps surface={surface} />
      <div className="guided-pipeline__stage">{content}</div>
    </div>
  );
}

export function GuidedPipeline(props: {
  runId: string;
  refreshKey: number;
  onResume: () => void;
  onRecover: () => void;
}) {
  const [projection, setProjection] = useState<GuidedPipelineProjection | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/guided/${props.runId}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        setProjection(await response.json() as GuidedPipelineProjection);
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    };
    void load();
    const interval = window.setInterval(load, 2_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [props.runId, props.refreshKey]);

  if (failed && !projection) return <p className="guided-empty" role="alert">Reconnecting to the saved build…</p>;
  if (!projection) return <div className="guided-loading"><span className="guided-loader" aria-hidden="true" />Loading the saved build…</div>;
  return <GuidedPipelineView projection={projection} onResume={props.onResume} onRecover={props.onRecover} />;
}
