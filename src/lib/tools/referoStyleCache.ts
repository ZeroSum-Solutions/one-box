import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getStylesBatch } from "./refero";

const DEFAULT_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export interface ReferoStyleCacheOptions {
  cacheDir?: string;
  ttlMs?: number;
  now?: () => Date;
  fetchBatch?: typeof getStylesBatch;
}

interface CacheEntry {
  /** The id this entry was written for — verified on every read so a
   * filename collision or copied file can never serve the wrong style
   * (review finding, 2026-08-15). */
  styleId: string;
  fetchedAt: string;
  style: unknown;
}

function defaultCacheDir(): string {
  return path.join(process.cwd(), ".one-box", "refero-style-cache");
}

/** Bijective, traversal-safe filename: distinct ids can never collide the
 * way character-stripping sanitization could ("style/a" vs "stylea"). */
function cacheFileName(styleId: string): string {
  return `${createHash("sha256").update(styleId).digest("hex")}.json`;
}

function cachePath(cacheDir: string, styleId: string): string {
  return path.join(cacheDir, cacheFileName(styleId));
}

function isFresh(entry: CacheEntry, now: Date, ttlMs: number): boolean {
  const fetchedAt = Date.parse(entry.fetchedAt);
  return Number.isFinite(fetchedAt) && now.getTime() - fetchedAt < ttlMs;
}

function isCacheEntry(value: unknown): value is CacheEntry {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    typeof (value as { styleId?: unknown }).styleId === "string" &&
    typeof (value as { fetchedAt?: unknown }).fetchedAt === "string" &&
    Object.hasOwn(value, "style");
}

async function readCacheEntry(
  filePath: string,
  expectedStyleId: string
): Promise<CacheEntry | undefined> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!isCacheEntry(parsed) || parsed.styleId !== expectedStyleId) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

async function writeCacheEntry(filePath: string, entry: CacheEntry): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(entry, null, 2), "utf8");
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

function validateStyleIds(styleIds: string[]): void {
  for (const styleId of styleIds) {
    if (typeof styleId !== "string" || !styleId) {
      throw new Error("refero style ids must be non-empty strings");
    }
  }
}

export async function getStylesCached(
  styleIds: string[],
  opts: ReferoStyleCacheOptions = {}
): Promise<Map<string, unknown>> {
  validateStyleIds(styleIds);
  const cacheDir = opts.cacheDir ?? defaultCacheDir();
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = opts.now ?? (() => new Date());
  const currentTime = now();
  const styles = new Map<string, unknown>();
  const misses: string[] = [];

  for (const styleId of styleIds) {
    const entry = await readCacheEntry(cachePath(cacheDir, styleId), styleId);
    if (entry && isFresh(entry, currentTime, ttlMs)) {
      styles.set(styleId, entry.style);
    } else {
      misses.push(styleId);
    }
  }

  if (misses.length === 0) return styles;

  const fetchedStyles = await (opts.fetchBatch ?? getStylesBatch)(misses);
  await Promise.all(
    misses.map(async (styleId) => {
      if (!fetchedStyles.has(styleId)) {
        throw new Error(`refero batch did not return requested style ${styleId}`);
      }
      const style = fetchedStyles.get(styleId);
      await writeCacheEntry(cachePath(cacheDir, styleId), {
        styleId,
        fetchedAt: currentTime.toISOString(),
        style,
      });
      styles.set(styleId, style);
    })
  );
  return styles;
}

export async function getStyleCached(
  styleId: string,
  opts: ReferoStyleCacheOptions = {}
): Promise<unknown> {
  return (await getStylesCached([styleId], opts)).get(styleId);
}
