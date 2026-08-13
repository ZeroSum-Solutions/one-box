import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { localLibraryCandidates, resolveLocalLibraryCatalogPath } from "./locallib";

const originalCatalogPath = process.env.MISHMASH_CATALOG_PATH;
const tempDirs: string[] = [];

afterEach(async () => {
  if (originalCatalogPath === undefined) {
    delete process.env.MISHMASH_CATALOG_PATH;
  } else {
    process.env.MISHMASH_CATALOG_PATH = originalCatalogPath;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("resolveLocalLibraryCatalogPath", () => {
  it("uses the portable home-relative default", () => {
    delete process.env.MISHMASH_CATALOG_PATH;

    expect(resolveLocalLibraryCatalogPath()).toBe(
      path.join(os.homedir(), "projects/mishmash-assets/catalog.json")
    );
  });
});

describe("localLibraryCandidates", () => {
  it("honors a catalog override while preserving text-only filtering", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-catalog-"));
    tempDirs.push(tempDir);
    const catalogPath = path.join(tempDir, "catalog.json");
    await fs.writeFile(
      catalogPath,
      JSON.stringify({
        groups: [
          {
            folder: "03 Site Screenshots",
            title: "Sites",
            items: [
              {
                id: "site-1",
                label: "Editorial service",
                rel: "ignored.png",
                description: "Strong editorial hierarchy",
                domains: ["home-services"],
              },
              {
                id: "blocked",
                label: "Blocked",
                rel: "blocked.png",
                allowed_use: "blocked-pending-license",
              },
            ],
          },
          {
            folder: "01 App UI",
            title: "Apps",
            items: [{ id: "app-1", label: "App", rel: "app.png" }],
          },
        ],
      }),
      "utf8"
    );
    process.env.MISHMASH_CATALOG_PATH = catalogPath;

    await expect(localLibraryCandidates()).resolves.toEqual([
      {
        id: "site-1",
        name: "Editorial service",
        summary: "Strong editorial hierarchy [home-services]",
      },
    ]);
  });

  it("reports how to fix a missing configured catalog", async () => {
    process.env.MISHMASH_CATALOG_PATH = "/missing/catalog.json";

    await expect(localLibraryCandidates()).rejects.toThrow(
      'Local design catalog was not found at "/missing/catalog.json". Set MISHMASH_CATALOG_PATH'
    );
  });

  it("reports the expected shape for structurally invalid catalog JSON", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-catalog-invalid-"));
    tempDirs.push(tempDir);
    const catalogPath = path.join(tempDir, "catalog.json");
    await fs.writeFile(
      catalogPath,
      JSON.stringify({
        groups: [{ folder: "03 Site Screenshots", title: "Sites", items: {} }],
      }),
      "utf8"
    );
    process.env.MISHMASH_CATALOG_PATH = catalogPath;

    await expect(localLibraryCandidates()).rejects.toThrow(
      `Local design catalog at "${catalogPath}" has an invalid structure: ` +
        'expected groups[0].items to be an array for selected group "03 Site Screenshots".'
    );
  });
});
