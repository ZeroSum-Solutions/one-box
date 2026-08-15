import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getStylesBatch } from "./refero";
import { getStyleCached, getStylesCached } from "./referoStyleCache";

const roots: string[] = [];

async function cacheDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-refero-style-cache-"));
  roots.push(root);
  return path.join(root, "cache");
}

function batchFor(styles: Record<string, unknown>) {
  return vi.fn(async (styleIds: string[]): Promise<Map<string, unknown>> =>
    new Map(styleIds.map((styleId) => [styleId, styles[styleId]]))
  );
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

describe("Refero style disk cache", () => {
  it("serves a fresh cached style without calling Refero", async () => {
    const directory = await cacheDir();
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, "style-a.json"),
      JSON.stringify({ fetchedAt: "2026-08-15T12:00:00.000Z", style: { name: "Cached" } }),
      "utf8"
    );
    const fetchBatch = batchFor({ "style-a": { name: "Fetched" } });

    const styles = await getStylesCached(["style-a"], {
      cacheDir: directory,
      now: () => new Date("2026-08-16T12:00:00.000Z"),
      fetchBatch,
    });

    expect(styles).toEqual(new Map([["style-a", { name: "Cached" }]]));
    expect(fetchBatch).not.toHaveBeenCalled();
  });

  it("fetches only cache misses and combines them with fresh entries", async () => {
    const directory = await cacheDir();
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, "style-a.json"),
      JSON.stringify({ fetchedAt: "2026-08-15T12:00:00.000Z", style: { name: "Cached" } }),
      "utf8"
    );
    const fetchBatch = batchFor({ "style-b": { name: "Fetched" } });

    const styles = await getStylesCached(["style-a", "style-b"], {
      cacheDir: directory,
      now: () => new Date("2026-08-16T12:00:00.000Z"),
      fetchBatch,
    });

    expect(styles).toEqual(
      new Map([
        ["style-a", { name: "Cached" }],
        ["style-b", { name: "Fetched" }],
      ])
    );
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(fetchBatch).toHaveBeenCalledWith(["style-b"]);
  });

  it("refetches a cache entry past its TTL", async () => {
    const directory = await cacheDir();
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, "style-a.json"),
      JSON.stringify({ fetchedAt: "2026-06-15T12:00:00.000Z", style: { name: "Stale" } }),
      "utf8"
    );
    const fetchBatch = batchFor({ "style-a": { name: "Fresh" } });

    const styles = await getStylesCached(["style-a"], {
      cacheDir: directory,
      ttlMs: 60 * 24 * 60 * 60 * 1000,
      now: () => new Date("2026-08-15T12:00:00.000Z"),
      fetchBatch,
    });

    expect(styles).toEqual(new Map([["style-a", { name: "Fresh" }]]));
    expect(fetchBatch).toHaveBeenCalledWith(["style-a"]);
  });

  it("treats a corrupt cache file as a miss", async () => {
    const directory = await cacheDir();
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "style-a.json"), "{not json", "utf8");
    const fetchBatch = batchFor({ "style-a": { name: "Recovered" } });

    await expect(
      getStyleCached("style-a", {
        cacheDir: directory,
        now: () => new Date("2026-08-15T12:00:00.000Z"),
        fetchBatch,
      })
    ).resolves.toEqual({ name: "Recovered" });
    expect(fetchBatch).toHaveBeenCalledWith(["style-a"]);
  });

  it("writes fetched styles atomically without leaving temporary files", async () => {
    const directory = await cacheDir();
    const fetchBatch = batchFor({ "style-a": { name: "Fetched" } });

    await getStylesCached(["style-a"], {
      cacheDir: directory,
      now: () => new Date("2026-08-15T12:00:00.000Z"),
      fetchBatch,
    });

    expect(await fs.readdir(directory)).toEqual(["style-a.json"]);
    await expect(fs.readFile(path.join(directory, "style-a.json"), "utf8")).resolves.toContain(
      '"Fetched"'
    );
  });
});

describe("getStylesBatch validation", () => {
  it("rejects an empty id list before making a Refero call", async () => {
    await expect(getStylesBatch([])).rejects.toThrow(/between 1 and 10/i);
  });

  it("rejects more than ten ids before making a Refero call", async () => {
    await expect(getStylesBatch(Array.from({ length: 11 }, (_, index) => `style-${index}`))).rejects.toThrow(
      /between 1 and 10/i
    );
  });

  it("rejects duplicate ids before making a Refero call", async () => {
    await expect(getStylesBatch(["style-a", "style-a"])).rejects.toThrow(/unique/i);
  });
});
