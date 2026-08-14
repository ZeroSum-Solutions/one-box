/**
 * crawlSite(url, outDir): the canonical crawl4ai wrapper script first (free,
 * local), Firecrawl scrape as the fallback (v2, v1 on 404) per house
 * scrape-tiering. Never throws on one bad site — returns {error} so the
 * pipeline skips that competitor instead of failing the whole scan.
 */
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { addCost, CostCapExceeded } from "../runstate";
import { CrawlProvenanceSchema, type CrawlProvenance } from "../contracts";

const execFileAsync = promisify(execFile);

const CRAWL4AI_SCRIPT_RELATIVE_PATH =
  "projects/tools/zs-skills/skills/research/deep-dive/scripts/crawl4ai-scrape.sh";
const CRAWL4AI_TIMEOUT_MS = 100_000;
const FIRECRAWL_BASE = "https://api.firecrawl.dev";
/** Firecrawl credit cost per fallback scrape, billed to the run (audit P1:
 * fallback spend must count against the cap). */
const FIRECRAWL_SCRAPE_COST_USD = 0.01;

export interface CrawlResult {
  markdownPath?: string;
  error?: string;
  crawl: CrawlProvenance;
  crawlAttempts: CrawlProvenance[];
}

interface Crawl4aiAttempt {
  result?: Pick<CrawlResult, "markdownPath">;
  fallbackReason?: string;
}

export function resolveCrawl4aiScriptPath(): string {
  const override = process.env.CRAWL4AI_SCRIPT_PATH?.trim();
  return override
    ? path.resolve(override)
    : path.join(os.homedir(), CRAWL4AI_SCRIPT_RELATIVE_PATH);
}

export async function crawlSite(
  url: string,
  outDir: string,
  runId?: string,
  allowPaidFirecrawlFallback = false,
  onPaidFallback?: (reason: string) => void
): Promise<CrawlResult> {
  const capturedAt = new Date().toISOString();
  let fallbackReason: string;
  try {
    const attempt = await runCrawl4aiScript(url, outDir);
    if (attempt.result) {
      const crawl = CrawlProvenanceSchema.parse({
        provider: "crawl4ai",
        sourceUrl: url,
        extractedAt: capturedAt,
        confidence: 0.95,
        outcome: "succeeded",
      });
      return {
        ...attempt.result,
        crawl,
        crawlAttempts: [crawl],
      };
    }
    fallbackReason = attempt.fallbackReason!;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const crawl = CrawlProvenanceSchema.parse({
      provider: "crawl4ai",
      sourceUrl: url,
      extractedAt: capturedAt,
      confidence: 0,
      outcome: "failed",
      failureReason: error,
    });
    return {
      error,
      crawl,
      crawlAttempts: [crawl],
    };
  }
  const localAttempt = CrawlProvenanceSchema.parse({
    provider: "crawl4ai",
    sourceUrl: url,
    extractedAt: capturedAt,
    confidence: 0,
    outcome: "failed",
    failureReason: fallbackReason,
  });
  if (!allowPaidFirecrawlFallback) {
    return {
      error: `crawl4ai requested a paid Firecrawl fallback (${fallbackReason}), but this run did not authorize metered fallback`,
      crawl: localAttempt,
      crawlAttempts: [localAttempt],
    };
  }
  onPaidFallback?.(fallbackReason);
  try {
    const result = await firecrawlScrapeFallback(url, outDir, fallbackReason);
    if (result.crawl.provider === "firecrawl" && result.crawl.outcome === "succeeded" && runId) {
      await addCost(runId, FIRECRAWL_SCRAPE_COST_USD);
    }
    return { ...result, crawlAttempts: [localAttempt, result.crawl] };
  } catch (err) {
    // a cost-cap trip is a hard stop, never a soft per-site failure
    if (err instanceof CostCapExceeded) throw err;
    const error = err instanceof Error ? err.message : String(err);
    const crawl = CrawlProvenanceSchema.parse({
      provider: "firecrawl",
      sourceUrl: url,
      extractedAt: capturedAt,
      confidence: 0,
      outcome: "failed",
      failureReason: error,
      fallbackReason: classifyFallbackReason(fallbackReason),
      paidFallbackApproved: true,
    });
    return {
      error,
      crawl,
      crawlAttempts: [localAttempt, crawl],
    };
  }
}

/** Only an explicit ERR status enters the paid fallback. Configuration errors,
 * malformed output, and unexpected process failures remain local errors. */
async function runCrawl4aiScript(url: string, outDir: string): Promise<Crawl4aiAttempt> {
  const scriptPath = resolveCrawl4aiScriptPath();
  try {
    await fs.access(scriptPath, fsConstants.X_OK);
  } catch {
    throw new Error(
      `crawl4ai wrapper was not found or is not executable at "${scriptPath}". ` +
        "Set CRAWL4AI_SCRIPT_PATH to the executable crawl4ai-scrape.sh path."
    );
  }

  const { code, stdout } = await execFileCapture(
    scriptPath,
    [url, outDir],
    CRAWL4AI_TIMEOUT_MS
  );
  const lastLine = stdout.trim().split("\n").pop() ?? "";
  const [status, detail] = lastLine.split("\t");
  if (status === "ERR") {
    return { fallbackReason: detail?.trim() || "crawl4ai returned ERR" };
  }
  const markdownPath = detail;
  if (code === 0 && status === "OK" && markdownPath) {
    return { result: { markdownPath } };
  }
  throw new Error(
    `crawl4ai wrapper at "${scriptPath}" did not return the documented OK or ERR status ` +
      `(exit ${code}). Check the wrapper installation or set CRAWL4AI_SCRIPT_PATH correctly.`
  );
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

async function firecrawlScrapeFallback(
  url: string,
  outDir: string,
  fallbackReason: string
): Promise<CrawlResult> {
  const provenanceBase = {
    provider: "firecrawl" as const,
    sourceUrl: url,
    extractedAt: new Date().toISOString(),
    fallbackReason: classifyFallbackReason(fallbackReason),
    paidFallbackApproved: true,
  };
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return {
      error:
        `crawl4ai requested Firecrawl fallback (${fallbackReason}), but ` +
        "FIRECRAWL_API_KEY is not set",
      crawl: CrawlProvenanceSchema.parse({
        ...provenanceBase,
        confidence: 0,
        outcome: "failed",
        failureReason: `FIRECRAWL_API_KEY is not set after ${fallbackReason}`,
      }),
      crawlAttempts: [],
    };
  }

  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const body = JSON.stringify({ url, formats: ["markdown"] });

  let res = await fetch(`${FIRECRAWL_BASE}/v2/scrape`, { method: "POST", headers, body });
  if (res.status === 404) {
    res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, { method: "POST", headers, body });
  }
  if (!res.ok) {
    const error = `firecrawl scrape failed (${res.status}) for ${url}`;
    const crawl = CrawlProvenanceSchema.parse({ ...provenanceBase, confidence: 0, outcome: "failed", failureReason: error });
    return { error, crawl, crawlAttempts: [] };
  }

  const json = (await res.json()) as { data?: { markdown?: string } };
  const markdown = json.data?.markdown;
  if (!markdown) {
    const error = `firecrawl scrape returned no markdown for ${url}`;
    const crawl = CrawlProvenanceSchema.parse({ ...provenanceBase, confidence: 0, outcome: "failed", failureReason: error });
    return { error, crawl, crawlAttempts: [] };
  }

  await fs.mkdir(outDir, { recursive: true });
  const markdownPath = path.join(outDir, `${slugFromUrl(url)}.md`);
  await fs.writeFile(markdownPath, markdown, "utf8");
  const crawl = CrawlProvenanceSchema.parse({
    ...provenanceBase,
    confidence: 0.85,
    outcome: "succeeded",
  });
  return {
    markdownPath,
    crawl,
    crawlAttempts: [],
  };
}

function classifyFallbackReason(
  reason: string
): CrawlProvenance["fallbackReason"] {
  return /bot|challenge|cloudflare|captcha/i.test(reason)
    ? "bot-challenge"
    : "local-failure";
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
