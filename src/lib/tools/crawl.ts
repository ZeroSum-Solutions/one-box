/**
 * crawlSite(url, outDir): the canonical crawl4ai wrapper script first (free,
 * local), Firecrawl scrape as the fallback (v2, v1 on 404) per house
 * scrape-tiering. Never throws on one bad site — returns {error} so the
 * pipeline skips that competitor instead of failing the whole scan.
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { addCost, CostCapExceeded } from "../runstate";

const execFileAsync = promisify(execFile);

const CRAWL4AI_SCRIPT =
  "/Users/zero-suminc./projects/tools/zs-skills/skills/research/deep-dive/scripts/crawl4ai-scrape.sh";
const CRAWL4AI_TIMEOUT_MS = 100_000;
const FIRECRAWL_BASE = "https://api.firecrawl.dev";
/** Firecrawl credit cost per fallback scrape, billed to the run (audit P1:
 * fallback spend must count against the cap). */
const FIRECRAWL_SCRAPE_COST_USD = 0.01;

export interface CrawlResult {
  markdownPath?: string;
  provenance?: "crawl4ai" | "firecrawl";
  error?: string;
}

export async function crawlSite(
  url: string,
  outDir: string,
  runId?: string
): Promise<CrawlResult> {
  try {
    const viaScript = await runCrawl4aiScript(url, outDir);
    if (viaScript) return viaScript;
  } catch {
    // fall through to Firecrawl
  }
  try {
    const result = await firecrawlScrapeFallback(url, outDir);
    if (result.provenance === "firecrawl" && runId) {
      await addCost(runId, FIRECRAWL_SCRAPE_COST_USD);
    }
    return result;
  } catch (err) {
    // a cost-cap trip is a hard stop, never a soft per-site failure
    if (err instanceof CostCapExceeded) throw err;
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Returns null (not an error) when the script signals ERR / a nonzero exit
 * — that's the documented "fall back to Firecrawl" contract, not a failure
 * of this function. */
async function runCrawl4aiScript(url: string, outDir: string): Promise<CrawlResult | null> {
  const { code, stdout } = await execFileCapture(
    CRAWL4AI_SCRIPT,
    [url, outDir],
    CRAWL4AI_TIMEOUT_MS
  );
  const lastLine = stdout.trim().split("\n").pop() ?? "";
  const [status, markdownPath] = lastLine.split("\t");
  if (code === 0 && status === "OK" && markdownPath) {
    return { markdownPath, provenance: "crawl4ai" };
  }
  return null;
}

async function execFileCapture(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

async function firecrawlScrapeFallback(url: string, outDir: string): Promise<CrawlResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return { error: "crawl4ai failed and FIRECRAWL_API_KEY is not set" };

  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const body = JSON.stringify({ url, formats: ["markdown"] });

  let res = await fetch(`${FIRECRAWL_BASE}/v2/scrape`, { method: "POST", headers, body });
  if (res.status === 404) {
    res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, { method: "POST", headers, body });
  }
  if (!res.ok) {
    return { error: `firecrawl scrape failed (${res.status}) for ${url}` };
  }

  const json = (await res.json()) as { data?: { markdown?: string } };
  const markdown = json.data?.markdown;
  if (!markdown) return { error: `firecrawl scrape returned no markdown for ${url}` };

  await fs.mkdir(outDir, { recursive: true });
  const markdownPath = path.join(outDir, `${slugFromUrl(url)}.md`);
  await fs.writeFile(markdownPath, markdown, "utf8");
  return { markdownPath, provenance: "firecrawl" };
}

function slugFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return `${host}-${Math.abs(hashCode(url))}`.replace(/[^a-z0-9.-]/gi, "_");
  } catch {
    return `page-${Date.now()}`;
  }
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
