import type { ReactNode } from "react";
import type { CardLink, CardMap, Stage } from "@/lib/contracts";

export type StageCardStatus = "running" | "done" | "failed";

export interface StageCardImage {
  src: string;
  alt: string;
  href?: string;
}

export interface StageCardProps {
  stage?: Stage;
  title: string;
  body?: string;
  status?: StageCardStatus;
  images?: StageCardImage[];
  links?: CardLink[];
  map?: CardMap;
  tone?: "default" | "error";
}

const LINK_ICON: Record<CardLink["kind"], string> = {
  site: "↗",
  maps: "◎",
  artifact: "⁝",
  reference: "◆",
};

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

export function StageCard({
  stage,
  title,
  body,
  status,
  images,
  links,
  map,
  tone = "default",
}: StageCardProps) {
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
          {images.map((img) => {
            // next/image needs known dimensions or a configured remote loader;
            // these are small runtime thumbnails from an arbitrary, variable-
            // count set of local generated files, never the page's LCP element.
            // eslint-disable-next-line @next/next/no-img-element
            const thumb = <img src={img.src} alt={img.alt} title={img.alt} loading="lazy" />;
            return img.href ? (
              <a
                key={img.src}
                href={img.href}
                target="_blank"
                rel="noreferrer noopener"
                className="stage-card__thumb-link"
                aria-label={`Open full size: ${img.alt}`}
              >
                {thumb}
              </a>
            ) : (
              <span key={img.src}>{thumb}</span>
            );
          })}
        </div>
      )}
      {map && <CardMapView map={map} />}
      {links && links.length > 0 && (
        <ul className="stage-card__links">
          {links.map((link) => (
            <li key={`${link.kind}-${link.href}-${link.label}`}>
              <a
                href={link.href}
                className={`card-link card-link--${link.kind}`}
                {...(link.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
              >
                <span className="card-link__icon" aria-hidden="true">
                  {LINK_ICON[link.kind]}
                </span>
                <span className="card-link__text">
                  <span className="card-link__label">{link.label}</span>
                  {link.sub && <span className="card-link__sub">{link.sub}</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** The embed only renders when a Maps Platform key produced an embedUrl.
 * Without one the card says so plainly and still offers a working map link —
 * a missing map must never read as "these businesses have no location". */
function CardMapView({ map }: { map: CardMap }) {
  return (
    <div className="stage-card__map">
      {map.embedUrl ? (
        <iframe
          className="stage-card__map-frame"
          src={map.embedUrl}
          title="Competitor locations"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <p className="stage-card__map-note">{map.note ?? "Map unavailable."}</p>
      )}
      <p className="stage-card__map-meta">
        {map.pins.length > 0
          ? `${map.pins.length} competitor${map.pins.length === 1 ? "" : "s"} located`
          : "No competitor locations resolved"}
        {" · "}
        <a href={map.fallbackUrl} target="_blank" rel="noreferrer noopener">
          open in Google Maps
        </a>
      </p>
    </div>
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
