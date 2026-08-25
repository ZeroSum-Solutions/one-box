import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FIXTURE_IMPORT = /(?:from\s*|import\s*(?:\(\s*)?)["'][^"']*test-support\/buildSiteFixture(?:\.ts)?["']/;

describe("production fixture import boundary", () => {
  it("keeps the live-publishing fixture helper out of all production source", async () => {
    const srcRoot = path.join(process.cwd(), "src");
    const productionSources = (await fs.readdir(srcRoot, { recursive: true }))
      .filter(
        (relativePath) =>
          /\.(?:ts|tsx)$/.test(relativePath) &&
          !/\.(?:test|spec)\.(?:ts|tsx)$/.test(relativePath),
      )
      .map((relativePath) => path.join(srcRoot, relativePath));
    const offenders: string[] = [];

    for (const sourcePath of productionSources) {
      if (FIXTURE_IMPORT.test(await fs.readFile(sourcePath, "utf8"))) {
        offenders.push(path.relative(process.cwd(), sourcePath));
      }
    }

    expect(offenders).toEqual([]);
  });
});
