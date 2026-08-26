"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketAnalysisCompetitor } from "../lib/contracts";

export function GuidedCompetitorDialog(props: {
  runId: string;
  competitor: MarketAnalysisCompetitor;
  onClose: () => void;
}) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const closeRef = useRef<HTMLButtonElement>(null);
  const screenshot = props.competitor.screenshots[viewport];

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props]);

  return (
    <div className="guided-dialog__backdrop" role="presentation" onMouseDown={props.onClose}>
      <section
        className="guided-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="guided-dialog__head">
          <div>
            <span className="guided-rank">{String(props.competitor.rank).padStart(2, "0")}</span>
            <h2 id="guided-dialog-title">{props.competitor.name}</h2>
          </div>
          <button ref={closeRef} type="button" className="btn-ghost" onClick={props.onClose}>
            Close
          </button>
        </header>
        <div className="guided-dialog__tabs" role="tablist" aria-label="Screenshot size">
          {(["desktop", "mobile"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={viewport === tab}
              onClick={() => setViewport(tab)}
            >
              {tab === "desktop" ? "Desktop" : "Mobile"}
            </button>
          ))}
        </div>
        <div className={`guided-dialog__preview guided-dialog__preview--${viewport}`}>
          {screenshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/sites/${props.runId}/${screenshot}`}
              alt={`${props.competitor.name} ${viewport} homepage capture`}
            />
          ) : (
            <p>No {viewport} capture was available.</p>
          )}
        </div>
        <div className="guided-dialog__analysis">
          <div>
            <h3>Why this site leads</h3>
            <ul>{props.competitor.selectedBecause.map((claim) => <li key={claim.text}>{claim.text}</li>)}</ul>
          </div>
          <div>
            <h3>What it does well</h3>
            <ul>{props.competitor.strengths.map((claim) => <li key={claim.text}>{claim.text}</li>)}</ul>
          </div>
        </div>
        <a
          className="guided-dialog__external"
          href={props.competitor.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open live website ↗
        </a>
      </section>
    </div>
  );
}
