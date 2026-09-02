import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ARTIFACTS, IntakeSchema, ScanResultSchema, type PipelineEvent } from "./contracts";
import { createRun, loadArtifact, sitePaths } from "./runstate";

vi.mock("./tools/crawl", () => ({
  crawlSite: vi.fn(async (url: string, outDir: string) => {
    const localFs = await import("node:fs/promises");
    const localPath = await import("node:path");
    await localFs.mkdir(outDir, { recursive: true });
    const markdownPath = localPath.join(outDir, "page.md");
    await localFs.writeFile(markdownPath, "# Alpha Pool Care\nWeekly cleaning and repair.");
    const crawl = {
      provider: "crawl4ai",
      sourceUrl: url,
      extractedAt: "2026-08-25T12:00:00.000Z",
      confidence: 1,
      outcome: "succeeded",
    };
    return { markdownPath, crawl, crawlAttempts: [crawl] };
  }),
}));

vi.mock("./tools/capture", () => ({ capture: vi.fn(async () => []) }));

import { stageScan } from "./pipeline";
import { capture } from "./tools/capture";

const runIds: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  await Promise.all(runIds.splice(0).map((runId) =>
    fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
  ));
});

describe("progressive scan persistence", () => {
  it("persists discovered competitor links before crawl and analysis finish", async () => {
    const runId = await createRun();
    runIds.push(runId);
    vi.stubEnv("FIRECRAWL_API_KEY", "test-firecrawl");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { web: Array.from({ length: 5 }, (_, index) => ({
        title: index === 0 ? "Alpha Pool Care" : `Pool Care ${index + 1}`,
        url: index === 0 ? "https://alpha.example" : `https://pool-${index + 1}.example`,
      })) },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const intake = IntakeSchema.parse({
      businessName: "Blue Haven Pool Care",
      category: "pool service",
      location: "Austin, TX",
      services: ["Weekly pool cleaning"],
      primaryAction: "quote",
      projectTarget: "web-app",
      research: {
        enabled: true,
        businessIntelligence: true,
        referoDesignEvidence: false,
        allowPaidFirecrawlFallback: true,
      },
    });

    let progressiveSnapshot: Promise<unknown> | undefined;
    let capturedSnapshot: Promise<unknown> | undefined;
    const emit = (event: PipelineEvent) => {
      if (event.type === "card" && event.title.startsWith("Found ")) {
        progressiveSnapshot = loadArtifact(runId, ARTIFACTS.scan);
      }
      if (event.type === "card" && event.title.startsWith("Captured ")) {
        capturedSnapshot = loadArtifact(runId, ARTIFACTS.scan);
      }
    };
    const completed = stageScan(runId, intake, emit);
    while (!progressiveSnapshot) await new Promise((resolve) => setTimeout(resolve, 0));

    const snapshot = await progressiveSnapshot;
    await completed;
    const progressive = ScanResultSchema.parse(snapshot);
    expect(progressive.competitors).toHaveLength(4);
    expect(progressive.competitors[0]).toMatchObject({ url: "https://alpha.example" });
    const final = ScanResultSchema.parse(await loadArtifact(runId, ARTIFACTS.scan));
    expect(final.competitors).toHaveLength(4);
    expect(final.competitors[0]).toMatchObject({ url: "https://alpha.example" });
    const captured = ScanResultSchema.parse(await capturedSnapshot);
    expect(captured.competitors).toHaveLength(4);
    expect(captured.competitors[0]).toMatchObject({
      url: "https://alpha.example",
      markdownPath: expect.stringMatching(/page\.md$/),
      crawl: { outcome: "succeeded" },
    });
    expect(vi.mocked(capture)).toHaveBeenCalledTimes(4);
  });
});
