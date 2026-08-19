import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getStylesBatch, mapBatchStylePayload } from "./refero";
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

// Mirrors the cache's bijective filename contract (sha256 of the id).
function fileFor(directory: string, styleId: string): string {
  return path.join(
    directory,
    `${createHash("sha256").update(styleId).digest("hex")}.json`
  );
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

describe("Refero style disk cache", () => {
  it("serves a fresh cached style without calling Refero again", async () => {
    const directory = await cacheDir();
    const seed = batchFor({ "style-a": { name: "Cached" } });
    await getStylesCached(["style-a"], {
      cacheDir: directory,
      now: () => new Date("2026-08-15T12:00:00.000Z"),
      fetchBatch: seed,
    });

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
    await getStylesCached(["style-a"], {
      cacheDir: directory,
      now: () => new Date("2026-08-15T12:00:00.000Z"),
      fetchBatch: batchFor({ "style-a": { name: "Cached" } }),
    });

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
    await getStylesCached(["style-a"], {
      cacheDir: directory,
      now: () => new Date("2026-06-15T12:00:00.000Z"),
      fetchBatch: batchFor({ "style-a": { name: "Stale" } }),
    });

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
    await fs.writeFile(fileFor(directory, "style-a"), "{not json", "utf8");
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

  it("treats an entry whose embedded styleId mismatches as a miss", async () => {
    const directory = await cacheDir();
    await fs.mkdir(directory, { recursive: true });
    // A copied/poisoned file at style-a's path carrying style-b's entry.
    await fs.writeFile(
      fileFor(directory, "style-a"),
      JSON.stringify({
        styleId: "style-b",
        fetchedAt: "2026-08-15T12:00:00.000Z",
        style: { name: "Wrong" },
      }),
      "utf8"
    );
    const fetchBatch = batchFor({ "style-a": { name: "Right" } });

    await expect(
      getStyleCached("style-a", {
        cacheDir: directory,
        now: () => new Date("2026-08-15T13:00:00.000Z"),
        fetchBatch,
      })
    ).resolves.toEqual({ name: "Right" });
    expect(fetchBatch).toHaveBeenCalledWith(["style-a"]);
  });

  it("keeps colliding-looking ids in distinct entries", async () => {
    const directory = await cacheDir();
    // Under stripped-character sanitization these two collapse to one file.
    const seed = batchFor({
      "style/a": { name: "Slash" },
      stylea: { name: "Plain" },
    });
    await getStylesCached(["style/a", "stylea"], {
      cacheDir: directory,
      now: () => new Date("2026-08-15T12:00:00.000Z"),
      fetchBatch: seed,
    });

    const fetchBatch = batchFor({});
    const styles = await getStylesCached(["style/a", "stylea"], {
      cacheDir: directory,
      now: () => new Date("2026-08-15T13:00:00.000Z"),
      fetchBatch,
    });

    expect(styles).toEqual(
      new Map([
        ["style/a", { name: "Slash" }],
        ["stylea", { name: "Plain" }],
      ])
    );
    expect(fetchBatch).not.toHaveBeenCalled();
  });

  it("writes fetched styles atomically without leaving temporary files", async () => {
    const directory = await cacheDir();
    const fetchBatch = batchFor({ "style-a": { name: "Fetched" } });

    await getStylesCached(["style-a"], {
      cacheDir: directory,
      now: () => new Date("2026-08-15T12:00:00.000Z"),
      fetchBatch,
    });

    const files = await fs.readdir(directory);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{64}\.json$/);
    await expect(fs.readFile(path.join(directory, files[0]), "utf8")).resolves.toContain(
      '"Fetched"'
    );
  });
});

describe("getStylesBatch validation", () => {
  it("rejects an empty id list before making a Refero call", async () => {
    await expect(getStylesBatch([])).rejects.toThrow(/between 1 and 10/i);
  });

  it("rejects more than ten ids before making a Refero call", async () => {
    await expect(
      getStylesBatch(Array.from({ length: 11 }, (_, index) => `style-${index}`))
    ).rejects.toThrow(/between 1 and 10/i);
  });

  it("rejects duplicate ids before making a Refero call", async () => {
    await expect(getStylesBatch(["style-a", "style-a"])).rejects.toThrow(/unique/i);
  });
});

describe("mapBatchStylePayload", () => {
  it("maps an object payload keyed by id", () => {
    expect(
      mapBatchStylePayload({ a: { name: "A" }, b: { name: "B" } }, ["a", "b"])
    ).toEqual(
      new Map([
        ["a", { name: "A" }],
        ["b", { name: "B" }],
      ])
    );
  });

  it("maps a multi-element array only via embedded ids, regardless of order", () => {
    expect(
      mapBatchStylePayload(
        [
          { uuid: "b", name: "B" },
          { uuid: "a", name: "A" },
        ],
        ["a", "b"]
      )
    ).toEqual(
      new Map([
        ["b", { uuid: "b", name: "B" }],
        ["a", { uuid: "a", name: "A" }],
      ])
    );
  });

  it("refuses to zip a multi-element array without embedded ids", () => {
    // Index-zipping a permuted response would silently swap styles.
    expect(
      mapBatchStylePayload([{ name: "First" }, { name: "Second" }], ["a", "b"])
    ).toBeUndefined();
  });

  it("refuses arrays whose embedded ids do not cover every requested id", () => {
    expect(
      mapBatchStylePayload(
        [{ uuid: "a", name: "A" }, { name: "mystery" }],
        ["a", "b"]
      )
    ).toBeUndefined();
  });

  it("accepts a single-element array for a single-id request without an embedded id", () => {
    expect(mapBatchStylePayload([{ name: "Only" }], ["a"])).toEqual(
      new Map([["a", { name: "Only" }]])
    );
  });
});
