import type { ReactNode } from "react";
import type { Stage } from "@/lib/contracts";

export type StageCardStatus = "running" | "done" | "failed";

export interface StageCardImage {
  src: string;
  alt: string;
}

export interface StageCardProps {
  stage?: Stage;
  title: string;
  body?: string;
  status?: StageCardStatus;
  images?: StageCardImage[];
  tone?: "default" | "error";
}

export const STAGE_LABEL: Record<Stage, string> = {
  intake: "Intake",
  scanned: "Competitive scan",
  locked: "Refero research",
  synthesized: "Synthesis",
  built: "Build",
  edited: "Edit",
};

const STAGE_COLOR: Record<Stage, string> = {
  intake: "var(--stage-intake)",
  scanned: "var(--stage-scanned)",
  locked: "var(--stage-locked)",
  synthesized: "var(--stage-synthesized)",
  built: "var(--stage-built)",
  edited: "var(--stage-edited)",
};

export function StageCard({ stage, title, body, status, images, tone = "default" }: StageCardProps) {
  return (
    <article className={`stage-card${tone === "error" ? " stage-card--error" : ""}`}>
      <div className="stage-card__eyebrow">
        {stage && (
          <span className="stage-card__label" style={{ color: STAGE_COLOR[stage] }}>
            {STAGE_LABEL[stage]}
          </span>
        )}
        {status && <StatusDot status={status} />}
      </div>
      <h3 className="stage-card__title">{title}</h3>
      {body && <MarkdownLite text={body} />}
      {images && images.length > 0 && (
        <div className="stage-card__images">
          {images.map((img) => (
            // next/image needs known dimensions or a configured remote loader;
            // these are small runtime thumbnails from an arbitrary, variable-
            // count set of local generated files, never the page's LCP element.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={img.src} src={img.src} alt={img.alt} loading="lazy" />
          ))}
        </div>
      )}
    </article>
  );
}

function StatusDot({ status }: { status: StageCardStatus }) {
  if (status === "running") {
    return <span className="status-dot status-dot--running" aria-label="running" role="status" />;
  }
  if (status === "failed") {
    return (
      <span className="status-dot status-dot--failed" aria-label="failed">
        ×
      </span>
    );
  }
  return (
    <span className="status-dot status-dot--done" aria-label="done">
      ✓
    </span>
  );
}

/** Tiny renderer for the plain-text bodies the pipeline emits: line breaks,
 * "- "/"→ " bullet lines, and **bold** spans. No markdown dependency. */
function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n").filter((line) => line.length > 0);
  return (
    <div className="stage-card__body">
      {lines.map((line, i) => (
        <p key={i} className={/^[-→]/.test(line) ? "stage-card__bullet" : undefined}>
          {renderBold(line)}
        </p>
      ))}
    </div>
  );
}

function renderBold(line: string): ReactNode {
  const parts = line.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>));
}
