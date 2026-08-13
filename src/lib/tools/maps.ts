/**
 * Local competitor discovery via the Firecrawl v2 search API (v1 fallback
 * on a 404 — see docs.firecrawl.dev). Two queries per run ("<category>
 * <location>" and "best <category> <location>"), directory/aggregator
 * domains and the prospect's own domain filtered out, deduped by
 * registrable domain, top 4 returned as {name, url, source}.
 */
import { addCost, CostCapExceeded } from "../runstate";

const FIRECRAWL_BASE = "https://api.firecrawl.dev";
const RESULTS_PER_QUERY = 8;
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
  "bbb.org",
  "mapquest.com",
  "reddit.com",
  "wikipedia.org",
];

export interface FindCompetitorsOptions {
  category: string;
  location: string;
  /** the prospect's own site, if any — excluded from results */
  excludeUrl?: string;
}

// Mirrors contracts.ts CompetitorSchema (name/url/source required, the rest
// filled in by later stages) so downstream spreads/assigns type-check
// against the same shape the pipeline ultimately validates against.
export interface CompetitorLead {
  name: string;
  url: string;
  /** the query that surfaced this result */
  source: string;
  markdownPath?: string;
  screenshotPaths?: string[];
  structure?: string[];
  notes?: string;
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

export async function findCompetitors(
  runId: string,
  opts: FindCompetitorsOptions
): Promise<CompetitorLead[]> {
  const queries = [
    `${opts.category} ${opts.location}`,
    `best ${opts.category} ${opts.location}`,
  ];
  const excludeDomain = opts.excludeUrl ? registrableDomain(opts.excludeUrl) : undefined;

  const seen = new Map<string, CompetitorLead>();
  const errors: string[] = [];

  for (const query of queries) {
    if (seen.size >= MAX_COMPETITORS) break;
    try {
      const results = await firecrawlSearch(query);
      await addCost(runId, FIRECRAWL_SEARCH_COST_USD);
      for (const r of results) {
        if (seen.size >= MAX_COMPETITORS) break;
        if (!r.url) continue;
        const domain = registrableDomain(r.url);
        if (!domain || isDirectoryDomain(domain)) continue;
        if (excludeDomain && domain === excludeDomain) continue;
        if (seen.has(domain)) continue;
        seen.set(domain, { name: r.title || domain, url: r.url, source: query });
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
  return [...seen.values()].slice(0, MAX_COMPETITORS);
}
