/**
 * Yelp market intelligence for the competitive scan.
 *
 * Yelp stays on maps.ts DIRECTORY_DOMAINS — it is never a competitor SITE, a
 * crawl target, or a design reference. This lane reads the Yelp search page
 * for category+location purely as MARKET STRUCTURE: who is on the board, how
 * the market is rated, and how deep its review moat runs.
 *
 * Only the ORGANIC ranked results count. Yelp's sponsored blocks are paid
 * placement, so folding them into the roster would put an advertiser's rating
 * into a "market bar" that is supposed to describe the market.
 */

import { addCost } from "../runstate";
import { FIRECRAWL_CALL_COST_USD, scrapeMarkdown } from "./firecrawl";
import type { YelpListing, YelpMarket, YelpMarketSummary } from "../contracts";

export type { YelpListing, YelpMarket, YelpMarketSummary };

/**
 * Organic result heading. Yelp ships two layouts and both must parse:
 *   food     "### 3. [Ken's Artisan Bakery](https://www.yelp.com/biz/…)"
 *   service  "### [Blue Dragon Plumbing](https://www.yelp.com/biz/…)"
 * so the rank prefix is optional. The /biz/ path is the real discriminator —
 * sponsored blocks always link through /adredir — and it is what keeps paid
 * placements out of the roster.
 */
const ORGANIC_HEADING_RE =
  /^###\s+(?:(\d+)\.\s+)?\[([^\]]+)\]\((https:\/\/www\.yelp\.com\/biz\/[^)?\s]+)/;

const RATING_RE = /^\s*(\d(?:\.\d)?)\s*\(([\d,.]+k?)\s*reviews?\)/i;
const PRICE_RE = /(\$+)(?=Open|Closed|$)/m;
const CATEGORY_RE = /^\[([^\]]+)\]\((https:\/\/www\.yelp\.com\/search\?find_desc=[^)]*)\)/;

/** The pagination strip sits inside the last result's block and its links wear
 * the same /search?find_desc= shape as category chips. Page links carry a
 * `start=` offset and are labelled with a page number or a direction. */
function isPaginationLink(label: string, href: string): boolean {
  return /[?&]start=/.test(href) || /^(\d+|Next|Previous)$/i.test(label.trim());
}

/** Yelp abbreviates past a thousand ("1.1k reviews"). */
function parseReviewCount(raw: string): number | undefined {
  const cleaned = raw.replace(/,/g, "");
  const isThousands = /k$/i.test(cleaned);
  const value = Number.parseFloat(isThousands ? cleaned.slice(0, -1) : cleaned);
  if (!Number.isFinite(value)) return undefined;
  return Math.round(isThousands ? value * 1000 : value);
}

export function yelpSearchUrl(category: string, location: string): string {
  const query = new URLSearchParams({ find_desc: category, find_loc: location });
  return `https://www.yelp.com/search?${query.toString()}`;
}

export function parseYelpListings(markdown: string): YelpListing[] {
  const lines = markdown.split("\n");
  const listings: YelpListing[] = [];

  let current: YelpListing | undefined;
  for (const line of lines) {
    const heading = ORGANIC_HEADING_RE.exec(line);
    if (heading) {
      if (current) listings.push(current);
      // Prefer Yelp's own number when the layout prints one; otherwise fall
      // back to position among the organic results we kept.
      current = {
        rank: heading[1] ? Number.parseInt(heading[1], 10) : listings.length + 1,
        name: heading[2],
        categories: [],
        yelpUrl: heading[3],
      };
      continue;
    }
    // A non-organic heading closes the block it follows — otherwise a
    // trailing sponsored slot would donate its rating to the last listing.
    if (/^###?\s/.test(line)) {
      if (current) listings.push(current);
      current = undefined;
      continue;
    }
    if (!current) continue;

    const rating = RATING_RE.exec(line);
    if (rating && current.rating === undefined) {
      current.rating = Number.parseFloat(rating[1]);
      current.reviewCount = parseReviewCount(rating[2]);
      const price = PRICE_RE.exec(line);
      if (price) current.priceRange = price[1];
      continue;
    }
    if (current.priceRange === undefined) {
      const price = PRICE_RE.exec(line);
      if (price) current.priceRange = price[1];
    }
    const category = CATEGORY_RE.exec(line);
    if (category && !isPaginationLink(category[1], category[2])) {
      current.categories.push(category[1]);
    }
  }
  if (current) listings.push(current);

  return listings;
}

export interface FetchYelpMarketOptions {
  category: string;
  location: string;
  /** Explicit intake consent. Mirrors findCompetitors — a metered call must
   * never fire merely because business research is enabled. */
  allowPaidFirecrawlFallback?: boolean;
}

/**
 * Read the Yelp search page for this market. Yelp is bot-walled, so this goes
 * straight to Firecrawl rather than trying the free local scraper first.
 *
 * Never throws except CostCapExceeded — a cap trip is a hard stop for the whole
 * run, not a soft per-source failure.
 */
export async function fetchYelpMarket(
  runId: string,
  opts: FetchYelpMarketOptions
): Promise<YelpMarket> {
  const searchUrl = yelpSearchUrl(opts.category, opts.location);
  const base = {
    searchUrl,
    fetchedAt: new Date().toISOString(),
    listings: [] as YelpListing[],
    summary: { rosterSize: 0 },
  };

  if (opts.allowPaidFirecrawlFallback !== true) {
    return {
      ...base,
      unavailable:
        "Yelp market intel was not run because paid Firecrawl discovery was not approved.",
    };
  }

  let markdown: string;
  try {
    const scrape = await scrapeMarkdown(searchUrl);
    if (scrape.error || !scrape.markdown) {
      return { ...base, unavailable: scrape.error ?? "Yelp returned no content" };
    }
    markdown = scrape.markdown;
  } catch (err) {
    return {
      ...base,
      unavailable: err instanceof Error ? err.message : String(err),
    };
  }

  // The credit is spent the moment the page comes back, so bill it before
  // parsing — a parse miss must not hide real spend from the cap.
  await addCost(runId, FIRECRAWL_CALL_COST_USD);

  const listings = parseYelpListings(markdown);
  if (listings.length === 0) {
    return {
      ...base,
      unavailable:
        "Yelp returned a page with no listings — bot challenge or a changed page shape.",
    };
  }

  return {
    searchUrl,
    fetchedAt: base.fetchedAt,
    listings,
    summary: summarizeMarket(listings),
  };
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The derived market bar. Listings missing a rating are counted in the roster
 * but left out of the medians — a business with no reviews yet is not a zero.
 */
export function summarizeMarket(listings: YelpListing[]): YelpMarketSummary {
  const ratings = listings
    .map((l) => l.rating)
    .filter((r): r is number => typeof r === "number");
  const counts = listings
    .map((l) => l.reviewCount)
    .filter((c): c is number => typeof c === "number");

  const ratingMedian = median(ratings);
  const reviewCountMedian = median(counts);

  return {
    rosterSize: listings.length,
    ...(ratingMedian === undefined
      ? {}
      : { ratingMedian: Math.round(ratingMedian * 100) / 100 }),
    ...(reviewCountMedian === undefined
      ? {}
      : { reviewCountMedian: Math.round(reviewCountMedian) }),
  };
}
