import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntakeSchema, type PipelineEvent } from "./contracts";
import {
  researchCriteriaForTarget,
  decodeReferoBase64Image,
  readBoundedReferoImageResponse,
  ReferoImageBudget,
  referoPlatformForTarget,
  stageLock,
  stageScan,
  shouldLoadReferenceDetails,
} from "./pipeline";
import { createRun, sitePaths } from "./runstate";
import { decorateTargetMarkup } from "./builder";
import { preflight } from "./preflight";
import { findCompetitors } from "./tools/maps";

const runIds: string[] = [];
const emit: (event: PipelineEvent) => void = () => undefined;

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true })
    )
  );
});

describe("evidence pipeline research controls", () => {
  it("rejects oversized chunked, forged MIME, malformed base64, and aggregate Refero media", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const declaredOversized = new Response(png, { headers: { "Content-Type": "image/png", "Content-Length": "20" } });
    await expect(readBoundedReferoImageResponse(declaredOversized, 12)).rejects.toThrow(/byte limit/);
    const chunked = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(png);
        controller.enqueue(new Uint8Array(8));
        controller.close();
      },
    }), { headers: { "Content-Type": "image/png" } });
    await expect(readBoundedReferoImageResponse(chunked, 12)).rejects.toThrow(/byte limit/);
    expect(() => decodeReferoBase64Image(Buffer.from(png).toString("base64"), "image/jpeg")).toThrow(/signature/);
    expect(() => decodeReferoBase64Image("%%%%", "image/png")).toThrow(/canonical base64/);
    expect(() => decodeReferoBase64Image(Buffer.from(png).toString("base64"), "image/png", 4)).toThrow(/byte limit/);
    const budget = new ReferoImageBudget(12);
    budget.consume(png);
    expect(() => budget.consume(png)).toThrow(/aggregate quota/);
  });
  it("makes no provider call and emits explicit empty artifacts when research is disabled", async () => {
    const runId = await createRun();
    runIds.push(runId);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const intake = IntakeSchema.parse({
      businessName: "Disabled Research",
      category: "consulting",
      location: "Portland, OR",
      services: ["Advisory"],
      primaryAction: "quote",
      projectTarget: "web-app",
      research: {
        enabled: false,
        businessIntelligence: true,
        referoDesignEvidence: true,
      },
    });

    const scan = await stageScan(runId, intake, emit);
    const lock = await stageLock(runId, intake, scan, emit, "refero");
    expect(scan).toMatchObject({ competitors: [], commonSections: [], gaps: [] });
    expect(lock.primary.referoId).toBe("research-disabled");
    expect(shouldLoadReferenceDetails("refero", lock)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not spend or require Firecrawl when paid discovery consent is false", async () => {
    const runId = await createRun();
    runIds.push(runId);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter");
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    const intake = IntakeSchema.parse({
      businessName: "Consent First",
      category: "consulting",
      location: "Portland, OR",
      services: ["Advisory"],
      primaryAction: "quote",
      research: {
        enabled: true,
        businessIntelligence: true,
        referoDesignEvidence: false,
        allowPaidFirecrawlFallback: false,
      },
    });
    expect(preflight("none", {
      businessResearch: true,
      referenceResearch: false,
      allowPaidFirecrawlFallback: false,
    }).blocking.map((issue) => issue.key)).not.toContain("FIRECRAWL_API_KEY");
    const scan = await stageScan(runId, intake, emit);
    expect(scan.competitors).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Firecrawl discovery only after the exact paid-consent flag is true", async () => {
    const runId = await createRun();
    runIds.push(runId);
    vi.stubEnv("FIRECRAWL_API_KEY", "test-firecrawl");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { web: [{ title: "Local Operator", url: "https://operator.example" }] },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await findCompetitors(runId, {
      category: "consulting",
      location: "Portland, OR",
      allowPaidFirecrawlFallback: true,
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(result.competitors[0]?.url).toBe("https://operator.example");
  });

  it("uses materially different research criteria for each project target", () => {
    const website = researchCriteriaForTarget("website");
    const webApp = researchCriteriaForTarget("web-app");
    const ios = researchCriteriaForTarget("ios-app");
    expect(new Set([website.outputLabel, webApp.outputLabel, ios.outputLabel]).size).toBe(3);
    expect(webApp.researchLens).toContain("loading/error states");
    expect(ios.researchLens).toContain("safe areas");
    expect(website.researchLens).toContain("discoverability");
    expect(referoPlatformForTarget("ios-app")).toBe("ios");
    expect(referoPlatformForTarget("web-app")).toBe("web");
  });

  it("renders structurally distinct website, web-app, and iOS prototype shells", () => {
    const source = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><main id="main"></main></body></html>';
    expect(decorateTargetMarkup("website", source)).toBe(source);
    expect(decorateTargetMarkup("web-app", source)).toContain('class="app-sidebar"');
    const ios = decorateTargetMarkup("ios-app", source);
    expect(ios).toContain('class="ios-navigation"');
    expect(ios).toContain('class="ios-tab-bar"');
    expect(ios).toContain("viewport-fit=cover");
  });
});
