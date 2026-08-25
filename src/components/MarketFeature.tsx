import {
  CardMapView,
  ScanRosterPanel,
  parseLegacyScanRows,
} from "@/components/StageCard";
import type { CardLink, CardMap, ScanMarketSummary, ScanRosterItem } from "@/lib/contracts";
import type { TimelineItem } from "@/components/RunTimeline";

/** The competitive scan's payload, lifted out of the stage log.
 *
 * The scan emits its market intel as ordinary timeline cards, which means it
 * collapses with everything else under DESIGN.md §Long-run disclosure — and a
 * run's single most useful screen ends up one click behind a summary row. This
 * hoists it: the map, the ranked operators and the market bar render as a
 * featured panel above the log, and the cards they came from are suppressed
 * (or have their map stripped) so nothing renders twice. */
export interface MarketIntel {
  roster: ScanRosterItem[];
  market?: ScanMarketSummary;
  map?: CardMap;
  /** The market-bar sentence — "Market bar: 4.7★ median across 12 operators". */
  lede?: string;
  /** Timeline keys whose card is fully represented here and must not re-render. */
  consumedKeys: Set<string>;
  /** Timeline keys whose card keeps rendering but must drop its map. */
  strippedMapKeys: Set<string>;
}

function mapForDisplay(map: CardMap): CardMap {
  return {
    ...(map.embedQuery ? { embedQuery: map.embedQuery } : {}),
    fallbackUrl: map.fallbackUrl,
    pins: map.pins,
    ...(map.note !== undefined ? { note: map.note } : {}),
  };
}

/** Historic runs (recorded before `roster`/`market` existed) carry the same
 * ranked operators as numbered body text and their site URLs as sibling links.
 * Normalising them into ScanRosterItem lets one component render both eras
 * instead of the feature panel having a second, degraded layout. `verified`
 * is false rather than unknown-shaped: those runs predate the Google Places
 * cross-check, so no operator in them was ever corroborated twice. */
function legacyRosterFromBody(body: string, links?: CardLink[]): ScanRosterItem[] | undefined {
  const entries = parseLegacyScanRows(body);
  if (!entries) return undefined;
  const rows = entries.flatMap((entry) => (entry.kind === "row" ? [entry.row] : []));
  if (rows.length === 0) return undefined;
  return rows.map((row) => ({
    rank: row.rank,
    name: row.name,
    rating: row.rating,
    reviewCount: row.reviewCount,
    url: links?.find((link) => link.label.trim().toLowerCase() === row.name.trim().toLowerCase())
      ?.href,
    verified: false,
  }));
}

export function collectMarketIntel(timeline: TimelineItem[]): MarketIntel | null {
  const intel: MarketIntel = {
    roster: [],
    consumedKeys: new Set(),
    strippedMapKeys: new Set(),
  };

  for (const { key, event } of timeline) {
    if (event.type !== "card" || event.stage !== "scanned") continue;

    if (event.roster && event.roster.length > 0 && intel.roster.length === 0) {
      intel.roster = event.roster;
      intel.market = event.market;
      intel.lede = event.body?.split("\n")[0];
      if (event.map) intel.map = mapForDisplay(event.map);
      // The whole card is represented by the panel: its body is the lede, its
      // only link is the Yelp search the panel already offers.
      intel.consumedKeys.add(key);
      continue;
    }

    if (intel.roster.length === 0 && event.body) {
      const legacy = legacyRosterFromBody(event.body, event.links);
      if (legacy) {
        intel.roster = legacy;
        if (event.map) intel.map = mapForDisplay(event.map);
        intel.consumedKeys.add(key);
        continue;
      }
    }

    // A map that arrived on some other scan card (historic runs split the
    // roster and the map across two). Take the map, leave the card — it still
    // carries screenshots and links of its own.
    if (event.map && !intel.map) {
      intel.map = mapForDisplay(event.map);
      intel.strippedMapKeys.add(key);
    }
  }

  return intel.roster.length > 0 || intel.map ? intel : null;
}

function formatReviews(count: number): string {
  return `${count.toLocaleString()} review${count === 1 ? "" : "s"}`;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Runs recorded before ScanMarketSummary existed carry no medians, which
 * leaves the strip showing a single lonely count. The roster rows on screen
 * hold the same numbers the pipeline would have used, so derive from those
 * rather than blanking the strip — the figure describes exactly the operators
 * the reader can see. */
function marketSummaryFrom(roster: ScanRosterItem[]): ScanMarketSummary {
  return {
    rosterSize: roster.length,
    ratingMedian: median(roster.flatMap((item) => (item.rating === undefined ? [] : [item.rating]))),
    reviewCountMedian: median(
      roster.flatMap((item) => (item.reviewCount === undefined ? [] : [item.reviewCount]))
    ),
    directoriesFiltered: 0,
  };
}

/** DESIGN.md §KPI strip, plus the one chromatic mark the strip earns: the
 * filtered-directories count takes a coral dot, coral's "dropped/flagged
 * count" role. Every other value stays on the paper→ash ramp. */
function MarketStats({ market, roster }: { market?: ScanMarketSummary; roster: ScanRosterItem[] }) {
  const summary = market ?? marketSummaryFrom(roster);
  const verified = roster.filter((item) => item.verified).length;
  const cells: Array<{ value: string; label: string; flagged?: boolean }> = [];

  cells.push({ value: String(summary.rosterSize), label: "operators ranked" });
  if (summary.ratingMedian !== undefined) {
    cells.push({ value: summary.ratingMedian.toFixed(1), label: "median rating" });
  }
  if (summary.reviewCountMedian !== undefined) {
    cells.push({
      value: Math.round(summary.reviewCountMedian).toLocaleString(),
      label: "median reviews",
    });
  }
  if (verified > 0) cells.push({ value: String(verified), label: "corroborated twice" });
  if (summary.directoriesFiltered > 0) {
    cells.push({
      value: String(summary.directoriesFiltered),
      label: "directories filtered",
      flagged: true,
    });
  }

  return (
    <div className="kpi-strip market-feature__kpis">
      {cells.map((cell) => (
        <div className="kpi-strip__stat" key={cell.label}>
          <b>{cell.value}</b>
          <span>
            {cell.flagged && <i className="market-feature__flag-dot" aria-hidden="true" />}
            {cell.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One of the three featured operators. The rank numeral is deliberately the
 * loudest glyph on the card: it is the same number the map pin carries, so the
 * card and the pin read as one object without needing colour to bind them. */
function CompetitorCard({ item }: { item: ScanRosterItem }) {
  return (
    <article className="competitor-card">
      <div className="competitor-card__head">
        <span className="competitor-card__rank" aria-label={`Rank ${item.rank}`}>
          {String(item.rank).padStart(2, "0")}
        </span>
        <h4 className="competitor-card__name">{item.name}</h4>
      </div>
      <p className="competitor-card__rating">
        {item.rating !== undefined ? (
          <>
            <b>{item.rating.toFixed(1)}</b>
            {/* Ash, not gold: a yellow star would be a sixth accent with no
                role in the contract, and the rating already reads as a rating. */}
            <span className="competitor-card__star" aria-hidden="true">
              ★
            </span>
          </>
        ) : (
          <b className="competitor-card__rating--none">no rating</b>
        )}
        {item.reviewCount !== undefined && <span>{formatReviews(item.reviewCount)}</span>}
      </p>
      <div className="competitor-card__foot">
        {item.verified ? (
          <span className="competitor-card__verified">
            <span className="badge__dot" aria-hidden="true" />
            two sources
          </span>
        ) : (
          <span className="competitor-card__unverified">
            <span className="competitor-card__hollow" aria-hidden="true" />
            one source
          </span>
        )}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="competitor-card__link"
          >
            Listing ↗
          </a>
        )}
      </div>
    </article>
  );
}

export function MarketFeature({ intel }: { intel: MarketIntel }) {
  const top = intel.roster.slice(0, 3);
  const rest = intel.roster.slice(3);

  return (
    <section className="market-feature" aria-label="Local market">
      <header className="market-feature__head">
        <p className="eyebrow">{"{ local market }"}</p>
        {intel.lede && <p className="market-feature__lede">{intel.lede}</p>}
      </header>

      <MarketStats market={intel.market} roster={intel.roster} />

      <div className="market-feature__split">
        {intel.map ? (
          <CardMapView map={intel.map} />
        ) : (
          <div className="state-card market-feature__no-map">
            <p className="state-card__label">map</p>
            <p className="state-card__title">No locations plotted</p>
            <p className="state-card__body">
              This run resolved no competitor coordinates, so there is nothing to place.
            </p>
          </div>
        )}

        {top.length > 0 && (
          <div className="market-feature__podium">
            <p className="eyebrow">{"{ top operators }"}</p>
            {top.map((item) => (
              <CompetitorCard key={`${item.rank}-${item.name}`} item={item} />
            ))}
          </div>
        )}
      </div>

      {rest.length > 0 && (
        <details className="market-feature__more">
          <summary>
            <span>
              Ranks {rest[0].rank}–{rest[rest.length - 1].rank}
            </span>
            <span className="badge">{rest.length} more</span>
          </summary>
          <ScanRosterPanel roster={rest} />
        </details>
      )}
    </section>
  );
}
