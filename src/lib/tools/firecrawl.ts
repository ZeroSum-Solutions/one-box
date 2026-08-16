/**
 * Shared Firecrawl transport: base URL, key lookup, and the JSON POST both
 * Firecrawl callers need. Extracted from maps.ts when yelp.ts became the
 * second caller of the same auth + POST shape.
 *
 * Scope note: crawl.ts keeps its own scrape path on purpose. That one writes
 * markdown to disk and builds CrawlProvenance for the competitor crawl; this
 * one returns markdown in memory for a single page read. Merging them would
 * drag provenance and filesystem concerns into callers that have neither.
 */

export const FIRECRAWL_BASE = "https://api.firecrawl.dev";

/** Firecrawl credit cost per call, billed to the run so metered spend always
 * counts against the per-run cap. */
export const FIRECRAWL_CALL_COST_USD = 0.01;

export function requireFirecrawlKey(): string {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");
  return apiKey;
}

export async function postJson(
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

/**
 * Scrape one page to markdown, in memory. v2 first, v1 on a 404 (the same
 * version dance the search path does — see docs.firecrawl.dev). Returns an
 * `error` string rather than throwing, so a caller can degrade; a missing key
 * still throws, because that is a configuration fault, not a page fault.
 */
export async function scrapeMarkdown(
  url: string
): Promise<{ markdown?: string; error?: string }> {
  const apiKey = requireFirecrawlKey();
  const payload = { url, formats: ["markdown"], onlyMainContent: true };

  let res = await postJson(`${FIRECRAWL_BASE}/v2/scrape`, apiKey, payload);
  if (res.status === 404) {
    res = await postJson(`${FIRECRAWL_BASE}/v1/scrape`, apiKey, payload);
  }
  if (!res.ok) {
    return { error: `firecrawl scrape failed (${res.status}) for ${url}` };
  }
  const markdown = (res.body as { data?: { markdown?: string } })?.data?.markdown;
  if (!markdown) {
    return { error: `firecrawl scrape returned no markdown for ${url}` };
  }
  return { markdown };
}
