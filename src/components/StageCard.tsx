import type { ReactNode } from "react";
import type { CardLink, CardMap, GateReport, ScanMarketSummary, ScanRosterItem, Stage } from "../lib/contracts";

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
  /** Present only on the Yelp market card — see ScanRosterItem. */
  roster?: ScanRosterItem[];
  market?: ScanMarketSummary;
  /** Present only on the build stage's gate-repair card. */
  gates?: GateReport[];
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

/** Stage identity is a dot-badge, never a colored title (DESIGN.md App
 * components §Roster row / Do). Exported so the timeline's collapsed
 * stage-group summary row (RunTimeline) reuses the same colour, instead of
 * re-declaring the stage→colour map a second time. */
export const STAGE_DOT: Record<Stage, string> = {
  intake: "var(--stage-intake)",
  scanned: "var(--stage-scanned)",
  locked: "var(--stage-locked)",
  synthesized: "var(--stage-synthesized)",
  built: "var(--stage-built)",
  edited: "var(--stage-edited)",
};

const FILTERED_OUT_TITLE = /^Filtered out/;

export function StageCard({
  stage,
  title,
  body,
  status,
  images,
  links,
  map,
  roster,
  market,
  gates,
  tone = "default",
}: StageCardProps) {
  const flagged = FILTERED_OUT_TITLE.test(title);
  // The roster's structured rows replace the numbered listing in `body`;
  // the bar summary (body's first line) still belongs above them as the
  // card's lede.
  const rosterLede = roster && body ? body.split("\n")[0] : undefined;
  // Runs recorded before the roster/market fields existed (e.g. mPHVbkER-Qu8)
  // still carry the same numbered listing, only as plain body text — degrade
  // it into the same row grammar instead of a paragraph blob.
  const legacyRoster =
    !roster && stage === "scanned" && body ? parseLegacyScanRows(body) : undefined;

  return (
    <article className={`stage-card card-surface${tone === "error" ? " stage-card--error" : ""}`}>
      <div className="stage-card__eyebrow">
        {stage && (
          <span className="badge stage-card__label">
            <span className="badge__dot" style={{ background: STAGE_DOT[stage] }} aria-hidden="true" />
            {STAGE_LABEL[stage]}
          </span>
        )}
        {status && <StatusDot status={status} />}
        {tone === "error" && (
          <span className="badge stage-card__error-chip">
            <span className="stage-card__error-glyph" aria-hidden="true">!</span>
            Failed
          </span>
        )}
      </div>
      <h3 className={`stage-card__title${flagged ? " stage-card__title--flagged" : ""}`}>{title}</h3>
      {roster ? (
        <>
          {rosterLede && <p className="stage-card__lede">{rosterLede}</p>}
          {market && <ScanKpiStrip market={market} />}
          <ScanRosterPanel roster={roster} />
        </>
      ) : gates ? (
        <GateRowList gates={gates} />
      ) : legacyRoster ? (
        <LegacyScanRows rows={legacyRoster} links={links} />
      ) : (
        body && <MarkdownLite text={body} />
      )}
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

/** Flat KPI-strip readout of the Yelp market bar — DESIGN.md §KPI strip:
 * paper value over ash label, no card chrome of its own (it already lives
 * inside the stage card). */
function ScanKpiStrip({ market }: { market: ScanMarketSummary }) {
  const stats: Array<{ value: string; label: string }> = [];
  if (market.ratingMedian !== undefined) {
    stats.push({ value: String(market.ratingMedian), label: "median rating" });
  }
  if (market.reviewCountMedian !== undefined) {
    stats.push({ value: String(market.reviewCountMedian), label: "median reviews" });
  }
  stats.push({ value: String(market.rosterSize), label: "operators ranked" });
  if (market.directoriesFiltered > 0) {
    stats.push({ value: String(market.directoriesFiltered), label: "directories filtered" });
  }
  return (
    <div className="kpi-strip">
      {stats.map((stat) => (
        <div className="kpi-strip__stat" key={stat.label}>
          <b>{stat.value}</b>
          <span>{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Ranked Yelp roster — DESIGN.md §Roster row. */
export function ScanRosterPanel({ roster }: { roster: ScanRosterItem[] }) {
  return (
    <div className="scan-roster">
      {roster.map((item) => (
        <div className="scan-roster__row" key={item.rank}>
          <span className="scan-roster__rank">{item.rank}</span>
          <span className="scan-roster__name">
            {item.name}
            {item.verified && (
              <span className="badge scan-roster__verified">
                <span className="badge__dot" style={{ background: "var(--accent-pulse)" }} aria-hidden="true" />
                verified
              </span>
            )}
          </span>
          <span className="scan-roster__rating">
            {item.rating !== undefined && <strong>{item.rating}</strong>}
            {item.rating !== undefined && item.reviewCount !== undefined && " · "}
            {item.reviewCount !== undefined ? item.reviewCount : item.rating === undefined ? "—" : null}
          </span>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="btn-ghost btn-mini scan-roster__site"
            >
              Site
            </a>
          ) : (
            <span />
          )}
        </div>
      ))}
    </div>
  );
}

/** Bespoke pass/fail row list for the build stage's gate-repair card —
 * DESIGN.md's `.gate-dot` vocabulary (pulse-green pass, outline fail),
 * reused rather than letting MarkdownLite flatten "✓ gate-name" into
 * uncoloured text. */
function GateRowList({ gates }: { gates: GateReport[] }) {
  return (
    <ul className="gate-row-list">
      {gates.map((report) => (
        <li className="gate-row" key={report.gate}>
          <span
            className={`gate-dot ${report.pass ? "gate-dot--pass" : "gate-dot--fail"}`}
            aria-hidden="true"
          />
          <span className="gate-row__name">{report.gate}</span>
          {!report.blocking && <span className="gate-row__advisory">advisory</span>}
          {!report.pass && report.details.length > 0 && (
            <ul className="gate-row__details">
              {report.details.map((detail, index) => (
                <li key={`${report.gate}-${index}`}>{detail}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One row parsed from a pre-roster scan card's numbered body text — see
 * parseLegacyScanRows. Only the fields the historic `${rank}. ${name} —
 * ${rating}★ (${reviewCount} reviews) ${priceRange}` format can carry. */
export interface LegacyScanRow {
  rank: number;
  name: string;
  rating?: number;
  reviewCount?: number;
}

const LEGACY_LINE = /^(\d{1,3})\.\s+(.+)$/;
const LEGACY_PRICE_SUFFIX = /\s+(\${1,4})$/;
const LEGACY_REVIEWS_SUFFIX = /\s+\((\d+)\s+reviews?\)$/;
const LEGACY_RATING_SUFFIX = /\s+—\s+([\d.]+)★$/;

/** Peels the historic `emitYelpCard` line format from the right — price,
 * then review count, then rating — so a name that itself contains a dash or
 * a dollar sign still leaves the rest intact. Never throws: a line that
 * doesn't fit just isn't a row (see parseLegacyScanRows's per-line fallback). */
function parseLegacyScanLine(line: string): LegacyScanRow | undefined {
  const head = LEGACY_LINE.exec(line);
  if (!head) return undefined;
  const rank = Number(head[1]);
  if (!Number.isFinite(rank)) return undefined;

  let rest = head[2].trim();
  const price = LEGACY_PRICE_SUFFIX.exec(rest);
  if (price) rest = rest.slice(0, price.index).trim();

  let reviewCount: number | undefined;
  const reviews = LEGACY_REVIEWS_SUFFIX.exec(rest);
  if (reviews) {
    reviewCount = Number(reviews[1]);
    rest = rest.slice(0, reviews.index).trim();
  }

  let rating: number | undefined;
  const ratingMatch = LEGACY_RATING_SUFFIX.exec(rest);
  if (ratingMatch) {
    rating = Number(ratingMatch[1]);
    rest = rest.slice(0, ratingMatch.index).trim();
  }

  if (!rest) return undefined;
  return { rank, name: rest, rating, reviewCount };
}

export type LegacyScanEntry = { kind: "row"; row: LegacyScanRow } | { kind: "text"; line: string };

/** A run recorded before the roster/market card fields existed still has the
 * same per-operator facts, just flattened into numbered body text. Requires
 * at least two parsed rows before treating the body as a roster at all — a
 * body that merely starts with "1 result(s) dropped…" must fall through to
 * plain text, not be mistaken for a listing. */
export function parseLegacyScanRows(body: string): LegacyScanEntry[] | undefined {
  const lines = body.split("\n").filter((line) => line.length > 0);
  const entries: LegacyScanEntry[] = lines.map((line) => {
    const row = parseLegacyScanLine(line);
    return row ? { kind: "row", row } : { kind: "text", line };
  });
  const rowCount = entries.filter((entry) => entry.kind === "row").length;
  if (rowCount < 2) return undefined;
  return entries;
}

/** Renders parseLegacyScanRows' output in the same `.scan-roster__row`
 * grammar the live roster uses, recovering a "Site" link from the card's
 * existing `links` (matched by exact name) where one is available. */
function LegacyScanRows({ rows, links }: { rows: LegacyScanEntry[]; links?: CardLink[] }) {
  return (
    <div className="scan-roster">
      {rows.map((entry, index) =>
        entry.kind === "text" ? (
          <p className="scan-roster__fallback-line" key={index}>
            {renderBold(entry.line)}
          </p>
        ) : (
          <div className="scan-roster__row" key={index}>
            <span className="scan-roster__rank">{entry.row.rank}</span>
            <span className="scan-roster__name">{entry.row.name}</span>
            <span className="scan-roster__rating">
              {entry.row.rating !== undefined && <strong>{entry.row.rating}</strong>}
              {entry.row.rating !== undefined && entry.row.reviewCount !== undefined && " · "}
              {entry.row.reviewCount !== undefined ? entry.row.reviewCount : entry.row.rating === undefined ? "—" : null}
            </span>
            {(() => {
              const site = links?.find(
                (link) => link.label.trim().toLowerCase() === entry.row.name.trim().toLowerCase()
              );
              return site ? (
                <a href={site.href} target="_blank" rel="noreferrer noopener" className="btn-ghost btn-mini scan-roster__site">
                  Site
                </a>
              ) : (
                <span />
              );
            })()}
          </div>
        )
      )}
    </div>
  );
}

export function mapFrameSrc(map: CardMap): string | undefined {
  if (!map.embedQuery) return undefined;
  return `/api/maps/embed?q=${encodeURIComponent(map.embedQuery)}`;
}

/** The embed only renders when the pipeline emitted a key-free embed query.
 * Without one the card says so plainly and still offers a working map link —
 * a missing map must never read as "these businesses have no location". */
export function CardMapView({ map }: { map: CardMap }) {
  const frameSrc = mapFrameSrc(map);
  return (
    <div className="stage-card__map">
      <div className="stage-card__map-head">
        <span className="stage-card__map-heading">Market map</span>
        <span className="badge">
          <span className="badge__dot" style={{ background: "var(--accent-teal)" }} aria-hidden="true" />
          {map.pins.length} located
        </span>
      </div>
      <div className="stage-card__map-body">
        {frameSrc ? (
          <iframe
            className="stage-card__map-frame"
            src={frameSrc}
            title="Competitor locations"
            loading="lazy"
            referrerPolicy="origin"
            allowFullScreen
          />
        ) : (
          <p className="stage-card__map-note">{map.note ?? "Map unavailable."}</p>
        )}
      </div>
      <p className="stage-card__map-meta mono-meta">
        {map.pins.length > 0
          ? `${map.pins.length} competitor${map.pins.length === 1 ? "" : "s"} located`
          : "No competitor locations resolved"}
        {" · "}
        <a href={map.fallbackUrl} target="_blank" rel="noreferrer noopener">
          open in Google Maps ↗
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
