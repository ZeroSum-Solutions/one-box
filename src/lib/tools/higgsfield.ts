/**
 * Higgsfield image generation via the `higgsfield` CLI, GPT Image 2
 * (job type `gpt_image_2`) as the default model per house billing rules.
 * CLI shape confirmed live 2026-08-12 (`higgsfield model get gpt_image_2`,
 * `higgsfield generate cost gpt_image_2 ...` — see WAVE-NOTES); the actual
 * `--wait`-driven `generate create` call and its result-URL shape were NOT
 * live-tested (no credits spent per the smoke-test brief), so URL parsing
 * here is defensive/best-effort — see WAVE-NOTES.
 *
 * Never throws: CLI absence, auth failure, or a bad result all come back
 * as {error}, so a hero-image failure never takes down the pipeline.
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const JOB_TYPE = "gpt_image_2";
const WAIT_TIMEOUT = "10m"; // observed live: healthy jobs can queue >5m under load
const EXEC_TIMEOUT_MS = 11 * 60_000;
// higgsfield model get gpt_image_2 → aspect_ratio: 1:1,4:3,3:4,16:9,9:16,3:2,2:3
const VALID_ASPECT_RATIOS = new Set(["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"]);

export interface GenerateImageOptions {
  prompt: string;
  /** one of gpt_image_2's accepted ratios; falls back to "1:1" if unknown */
  aspectRatio?: string;
  outPath: string;
  quality?: "low" | "medium" | "high";
}

export interface GenerateImageResult {
  path: string;
  url: string;
}
export interface GenerateImageError {
  error: string;
}

function generationArgs(opts: GenerateImageOptions) {
  const aspectRatio = VALID_ASPECT_RATIOS.has(opts.aspectRatio ?? "")
    ? (opts.aspectRatio as string)
    : "1:1";
  return [
    JOB_TYPE,
    "--prompt",
    opts.prompt,
    "--aspect-ratio",
    aspectRatio,
    "--quality",
    opts.quality ?? "high",
  ];
}

/** Free provider preflight used to reserve the exact current credit estimate
 * before a paid image job is created. */
export async function estimateImageCredits(
  opts: GenerateImageOptions,
): Promise<number | GenerateImageError> {
  try {
    const result = await execFileAsync(
      "higgsfield",
      ["generate", "cost", ...generationArgs(opts), "--json"],
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
    );
    const parsed = JSON.parse(result.stdout) as { credits?: unknown };
    if (
      typeof parsed.credits !== "number" ||
      !Number.isInteger(parsed.credits) ||
      parsed.credits <= 0
    ) {
      return { error: "higgsfield returned an invalid credit estimate" };
    }
    return parsed.credits;
  } catch (error) {
    return {
      error: `higgsfield cost estimate failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function generateImage(
  opts: GenerateImageOptions
): Promise<GenerateImageResult | GenerateImageError> {
  const args = [
    "generate",
    "create",
    ...generationArgs(opts),
    "--wait",
    "--wait-timeout",
    WAIT_TIMEOUT,
    "--json",
  ];

  let stdout: string;
  try {
    const res = await execFileAsync("higgsfield", args, {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    stdout = res.stdout;
  } catch (err) {
    const e = err as { code?: string | number; stdout?: string; stderr?: string; message?: string };
    if (e.code === "ENOENT") {
      return { error: "higgsfield CLI not found on PATH" };
    }
    const detail = String(e.stderr || e.stdout || e.message || "unknown error").trim().slice(0, 500);
    if (/auth|unauthoriz|401|not.?logged.?in/i.test(detail)) {
      return { error: `higgsfield auth failed: ${detail}` };
    }
    return { error: `higgsfield generate create failed: ${detail}` };
  }

  const url = extractResultUrl(stdout);
  if (!url) {
    return { error: `could not find a result URL in higgsfield output: ${stdout.slice(0, 300)}` };
  }

  try {
    const imgRes = await fetch(url);
    if (!imgRes.ok) return { error: `failed to download generated image (${imgRes.status})` };
    const buf = Buffer.from(await imgRes.arrayBuffer());
    await fs.mkdir(path.dirname(opts.outPath), { recursive: true });
    await fs.writeFile(opts.outPath, buf);
    return { path: opts.outPath, url };
  } catch (err) {
    return {
      error: `failed to download generated image: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Best-effort URL extraction: prefer common URL-ish JSON keys, then any
 * string URL anywhere in the parsed JSON, then a raw regex scan of stdout. */
function extractResultUrl(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout);
    const fromJson = findFirstUrl(parsed);
    if (fromJson) return fromJson;
  } catch {
    // stdout wasn't pure JSON — fall through to the regex scan below
  }
  const match = stdout.match(/https?:\/\/\S+\.(?:png|jpe?g|webp)(?:\?\S*)?/i);
  return match?.[0];
}

const URL_KEYS = ["url", "result_url", "output_url", "image_url", "asset_url"];

function findFirstUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of URL_KEYS) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    for (const v of Object.values(obj)) {
      const found = findFirstUrl(v);
      if (found) return found;
    }
  }
  return undefined;
}
