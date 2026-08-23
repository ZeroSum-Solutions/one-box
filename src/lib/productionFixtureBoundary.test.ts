import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FIXTURE_IMPORT = /(?:from\s*|import\s*\()\s*["'][^"']*test-support\/buildSiteFixture(?:\.ts)?["']/;

describe("production fixture import boundary", () => {
  it("keeps the live-publishing fixture helper out of app and pipeline modules", async () => {
    const appRoot = path.join(process.cwd(), "src", "app");
    const appSources = (await fs.readdir(appRoot, { recursive: true }))
      .filter((relativePath) => /\.(?:ts|tsx)$/.test(relativePath))
      .map((relativePath) => path.join(appRoot, relativePath));
    const productionSources = [
      path.join(process.cwd(), "src", "lib", "pipeline.ts"),
      ...appSources,
    ];
    const offenders: string[] = [];

    for (const sourcePath of productionSources) {
      if (FIXTURE_IMPORT.test(await fs.readFile(sourcePath, "utf8"))) {
        offenders.push(path.relative(process.cwd(), sourcePath));
      }
    }

    expect(offenders).toEqual([]);
  });
});
