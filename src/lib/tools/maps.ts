/**
 * Local competitor discovery via the Firecrawl v2 search API (v1 fallback
 * on a 404 — see docs.firecrawl.dev), then CLASSIFIED so only real local
 * operators reach the crawl.
 *
 * Why the classifier exists (live failure, run 2KJ9KwYM4SeA, 2026-08-13): a
 * Portland bakery scan returned feastio.com, pdx.eater.com and
 * portlandfoodanddrink.com — three listicles — plus one coffee shop. The old
 * DIRECTORY_DOMAINS list blocked Yelp and Angi but nothing editorial, so the
 * "table stakes" fed to the skeleton spec were BLOG sections (newsletter
 * signup, listings grid, image gallery), not local-business sections. Wrong
 * structure signal in, wrong site out.
 *
 * Three tiers, cheapest first: known editorial domains → roundup-shaped URLs
 * and titles → Google Places verification (only when the Maps lane is wired).
 * Everything rejected is recorded in ScanResult.excluded, because a filter
 * that silently eats a real competitor is worse than no filter.
 */
import { addCost, CostCapExceeded } from "../runstate";
import { findPlace, mapsConfigured, mapsSearchUrl } from "./places";
import type { CrawlProvenance, Place } from "../contracts";

const FIRECRAWL_BASE = "https://api.firecrawl.dev";
const RESULTS_PER_QUERY = 10;
const MAX_COMPETITORS = 4;
/** Firecrawl credit cost per search call, tracked into the run's costUsd. */
const FIRECRAWL_SEARCH_COST_USD = 0.01;

// Directories/aggregators are structure noise, not real competitors — never
// count as a market signal, never worth crawling for design reference.
const DIRECTORY_DOMAINS = [
  "yelp.com",
  "angi.com",
  "homeadvisor.com",
  "thumbtack.com",
  "facebook.com",
  "instagram.com",
  "bbb.org",
  "mapquest.com",
  "reddit.com",
  "wikipedia.org",
  "yellowpages.com",
  "nextdoor.com",
  "tripadvisor.com",
  "opentable.com",
  "doordash.com",
  "ubereats.com",
  "grubhub.com",
  "google.com",
  "youtube.com",
  "pinterest.com",
  "tiktok.com",
  // job boards rank high for "<trade> <city>" queries but are never competitors
  "indeed.com",
  "ziprecruiter.com",
  "glassdoor.com",
  "linkedin.com",
  "monster.com",
  "simplyhired.com",
  "careerbuilder.com",
  "craigslist.org",
];

// Media/editorial publishers. They rank at the top for "best <trade> <city>"
// and are never the competitor — they're writing ABOUT the competitors.
const EDITORIAL_DOMAINS = [
  "eater.com",
  "timeout.com",
  "thrillist.com",
  "infatuation.com",
  "zagat.com",
  "foodandwine.com",
  "bonappetit.com",
  "seriouseats.com",
  "tastingtable.com",
  "delish.com",
  "buzzfeed.com",
  "usatoday.com",
  "nytimes.com",
  "forbes.com",
  "yahoo.com",
  "msn.com",
  "medium.com",
  "substack.com",
  "wordpress.com",
  "blogspot.com",
  "houzz.com",
  "architecturaldigest.com",
  "expedia.com",
  "booking.com",
];

/** URL paths that mark a roundup/guide rather than a business's own site. */
const EDITORIAL_PATH_RE =
  /(^|\/)(best|top|guide|guides|blog|blogs|article|articles|news|maps|list|lists|roundup|review|reviews|things-to-do|where-to)(\/|-|$)|\/\d{4}\/\d{2}\/|-guide|best-\d+|top-\d+|\d+-best/i;

/** Titles shaped like a listicle. Deliberately conservative — it must match
 * the ROUNDUP form ("The 12 Best X in Y", "Guide to X"), not merely contain
 * the word "best", so a business actually named "Best Bakery" survives. */
const EDITORIAL_TITLE_RE =
  /^\s*(the\s+)?(\d+\s+)?(best|top|greatest|ultimate)\b.*\b(in|of|near|around)\b|^\s*(a\s+)?guide\s+to\b|\bguide\s+to\s+\w+'?s?\b|^\s*\d+\s+(best|top|great|amazing)\b|\bbest\s+\w+\s+(in|near)\s+\w+|'s\s+best\b|\bbest\s+\d+\b/i;

export type CompetitorKind = "business" | "editorial" | "unknown";

export interface Classification {
  kind: CompetitorKind;
  why: string;
}

/** Free, offline classification — domain list, then URL path, then title. */
export function classifyResult(
  title: string,
  url: string,
  domain: string
): Classification {
  if (EDITORIAL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { kind: "editorial", why: `${domain} is a media/publisher domain` };
  }
  let pathname = "";
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = "";
  }
  if (pathname && pathname !== "/" && EDITORIAL_PATH_RE.test(pathname)) {
    return { kind: "editorial", why: `URL path "${pathname}" is roundup-shaped` };
  }
  if (EDITORIAL_TITLE_RE.test(title)) {
    return { kind: "editorial", why: `title "${title.slice(0, 60)}" reads as a listicle` };
  }
  return { kind: "unknown", why: "no editorial signal — treated as a business" };
}

export interface FindCompetitorsOptions {
  category: string;
  location: string;
  /** the prospect's own site, if any — excluded from results */
  excludeUrl?: string;
  /** Explicit intake consent. Firecrawl search is metered and must never run
   * merely because business research is enabled. */
  allowPaidFirecrawlFallback?: boolean;
}

// Mirrors contracts.ts CompetitorSchema (name/url/source required, the rest
// filled in by later stages) so downstream spreads/assigns type-check
// against the same shape the pipeline ultimately validates against.
export interface CompetitorLead {
  name: string;
  url: string;
  /** the query that surfaced this result */
  source: string;
  kind: CompetitorKind;
  kindReason: string;
  place?: Place;
  mapsSearchUrl: string;
  markdownPath?: string;
  screenshotPaths?: string[];
  structure?: string[];
  notes?: string;
  crawl?: CrawlProvenance;
  crawlAttempts?: CrawlProvenance[];
}

export interface ExcludedLead {
  url: string;
  title: string;
  why: string;
}

export interface FindCompetitorsResult {
  competitors: CompetitorLead[];
  /** everything discovery found and the filter dropped, with the reason */
  excluded: ExcludedLead[];
  /** set when the Maps lane could not verify — surfaced on the scan card so a
   * missing map reads as "not wired", not "no competitors have locations" */
  mapsNote?: string;
}

interface FirecrawlSearchHit {
  title: string;
  url: string;
  description?: string;
}

function requireFirecrawlKey(): string {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");
  return apiKey;
}

async function postJson(
  url: string,
  apiKey: string,
  body: unknown
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

function toHit(raw: unknown): FirecrawlSearchHit {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    title: typeof o.title === "string" ? o.title : "",
    url: typeof o.url === "string" ? o.url : "",
    description: typeof o.description === "string" ? o.description : undefined,
  };
}

/** v2 response: { data: { web: [...] } } */
function parseV2(body: unknown): FirecrawlSearchHit[] {
  const web = (body as { data?: { web?: unknown[] } })?.data?.web;
  return Array.isArray(web) ? web.map(toHit) : [];
}

/** v1 response: { data: [...] } (flat, no `web` nesting) */
function parseV1(body: unknown): FirecrawlSearchHit[] {
  const data = (body as { data?: unknown[] })?.data;
  return Array.isArray(data) ? data.map(toHit) : [];
}

async function firecrawlSearch(query: string): Promise<FirecrawlSearchHit[]> {
  const apiKey = requireFirecrawlKey();
  const v2 = await postJson(`${FIRECRAWL_BASE}/v2/search`, apiKey, {
    query,
    limit: RESULTS_PER_QUERY,
  });
  if (v2.status === 404) {
    const v1 = await postJson(`${FIRECRAWL_BASE}/v1/search`, apiKey, {
      query,
      limit: RESULTS_PER_QUERY,
    });
    if (!v1.ok) {
      throw new Error(`firecrawl v1 search failed (${v1.status}) for "${query}"`);
    }
    return parseV1(v1.body);
  }
  if (!v2.ok) {
    throw new Error(`firecrawl v2 search failed (${v2.status}) for "${query}"`);
  }
  return parseV2(v2.body);
}

/** Approximate registrable domain (last two dot-labels) — good enough for
 * deduping US local-service competitor URLs without a public-suffix-list
 * dependency. See WAVE-NOTES for the simplification. */
function registrableDomain(rawUrl: string): string | undefined {
  try {
    const u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const labels = host.split(".").filter(Boolean);
    return labels.length <= 2 ? host : labels.slice(-2).join(".");
  } catch {
    return undefined;
  }
}

function isDirectoryDomain(domain: string): boolean {
  return DIRECTORY_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Google Places verification for one candidate. A match means Google knows a
 * local business at this exact domain — the strongest "real operator" signal
 * available. A miss is NOT proof of the opposite (plenty of real businesses
 * have no website listed on their Google profile), so it never downgrades a
 * candidate; it only fails to promote it.
 */
async function verifyWithPlaces(
  lead: CompetitorLead,
  location: string,
  runId: string
): Promise<{ place?: Place; note?: string }> {
  const domain = registrableDomain(lead.url);
  const { places, unavailable } = await findPlace(`${lead.name} ${location}`, runId);
  if (unavailable) return { note: unavailable };
  const match = places.find(
    (p) => p.websiteUri && registrableDomain(p.websiteUri) === domain
  );
  return { place: match };
}

export async function findCompetitors(
  runId: string,
  opts: FindCompetitorsOptions
): Promise<FindCompetitorsResult> {
  if (opts.allowPaidFirecrawlFallback !== true) {
    return {
      competitors: [],
      excluded: [],
      mapsNote:
        "Competitor web search was not run because paid Firecrawl discovery was not approved.",
    };
  }
  // Three angles. "best <category>" pulls the roundups the classifier then
  // drops, but those pages still rank the real operators, so the query earns
  // its place; the third angle targets operator sites directly.
  const queries = [
    `${opts.category} ${opts.location}`,
    `best ${opts.category} ${opts.location}`,
    `${opts.category} ${opts.location} services contact`,
  ];
  const excludeDomain = opts.excludeUrl ? registrableDomain(opts.excludeUrl) : undefined;

  const seen = new Map<string, CompetitorLead>();
  const excluded: ExcludedLead[] = [];
  const errors: string[] = [];
  const seenExcluded = new Set<string>();

  const drop = (url: string, title: string, why: string) => {
    if (seenExcluded.has(url)) return;
    seenExcluded.add(url);
    excluded.push({ url, title, why });
  };

  for (const query of queries) {
    if (seen.size >= MAX_COMPETITORS) break;
    try {
      const results = await firecrawlSearch(query);
      await addCost(runId, FIRECRAWL_SEARCH_COST_USD);
      for (const r of results) {
        if (seen.size >= MAX_COMPETITORS) break;
        if (!r.url) continue;
        const domain = registrableDomain(r.url);
        if (!domain) continue;
        if (isDirectoryDomain(domain)) {
          drop(r.url, r.title, `${domain} is a directory/aggregator`);
          continue;
        }
        if (excludeDomain && domain === excludeDomain) {
          drop(r.url, r.title, "the prospect's own site");
          continue;
        }
        if (seen.has(domain)) continue;

        const verdict = classifyResult(r.title, r.url, domain);
        if (verdict.kind === "editorial") {
          drop(r.url, r.title, verdict.why);
          continue;
        }
        seen.set(domain, {
          name: r.title || domain,
          url: r.url,
          source: query,
          kind: verdict.kind,
          kindReason: verdict.why,
          mapsSearchUrl: mapsSearchUrl(`${r.title || domain} ${opts.location}`),
        });
      }
    } catch (err) {
      // A cost-cap trip is a hard stop, never a soft per-query failure.
      if (err instanceof CostCapExceeded) throw err;
      errors.push(`${query}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (seen.size === 0 && errors.length === queries.length) {
    throw new Error(`findCompetitors: all searches failed — ${errors.join(" | ")}`);
  }

  const competitors = [...seen.values()].slice(0, MAX_COMPETITORS);

  // Places verification runs only when the Maps lane is wired. Concurrent —
  // these are independent lookups and each is a network round-trip.
  let mapsNote: string | undefined;
  if (mapsConfigured() && competitors.length > 0) {
    const verdicts = await Promise.all(
      competitors.map((c) => verifyWithPlaces(c, opts.location, runId))
    );
    verdicts.forEach((v, i) => {
      if (v.note) mapsNote ??= v.note;
      if (!v.place) return;
      competitors[i].place = v.place;
      competitors[i].kind = "business";
      competitors[i].kindReason = `Google Places confirms a local business at this domain (${v.place.address})`;
    });
  } else if (!mapsConfigured()) {
    mapsNote = "GOOGLE_MAPS_API_KEY is not set — map embed and Places verification skipped";
  }

  return { competitors, excluded, mapsNote };
}
