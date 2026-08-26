import { describe, expect, it, vi } from "vitest";
import { MARKET_RUBRIC_CRITERIA, MarketAnalysisSchema, type Competitor } from "./contracts";
import {
  analyzeMarketCompetitor,
  eligibleMarketCompetitors,
  marketAnalysisInput,
  projectLegacyMarketCompetitors,
  rankMarketCompetitors,
} from "./marketAnalysis";

function competitor(overrides: Partial<Competitor> = {}): Competitor {
  return {
    name: "Alpha Plumbing",
    url: "https://alpha.example/services",
    source: "plumber Portland",
    kind: "business",
    kindReason: "Google Places confirmed this operator",
    markdownPath: "research/alpha.example/page.md",
    screenshotPaths: [
      "research/alpha.example/desktop.png",
      "research/alpha.example/mobile.png",
    ],
    structure: ["hero", "services", "proof"],
    crawlAttempts: [],
    place: {
      placeId: "place-alpha",
      name: "Alpha Plumbing",
      address: "1 Main St",
      lat: 45,
      lng: -122,
      mapsUri: "https://maps.google.com/?cid=alpha",
      rating: 5,
      userRatingCount: 999,
    },
    ...overrides,
  };
}

describe("market analysis", () => {
  it("excludes directory, social, unknown, editorial, and uncrawled candidates before analysis", () => {
    const eligible = eligibleMarketCompetitors([
      competitor(),
      competitor({ url: "https://yelp.com/biz/alpha" }),
      competitor({ url: "https://instagram.com/alpha" }),
      competitor({ kind: "unknown" }),
      competitor({ kind: "editorial" }),
      competitor({ markdownPath: undefined }),
    ]);

    expect(eligible.map((entry) => entry.url)).toEqual([
      "https://alpha.example/services",
    ]);
  });

  it("builds a stable first-party-only rubric input independent of directory popularity", () => {
    const first = marketAnalysisInput(
      competitor(),
      "# Alpha Plumbing\nLicensed repairs and 24-hour response.",
      { category: "plumber", location: "Portland, OR" },
    );
    const second = marketAnalysisInput(
      competitor({
        place: {
          placeId: "changed",
          name: "Alpha Plumbing",
          address: "1 Main St",
          lat: 45,
          lng: -122,
          mapsUri: "https://maps.google.com/?cid=changed",
          rating: 1,
          userRatingCount: 2,
        },
        source: "ranked first on Yelp",
      }),
      "# Alpha Plumbing\nLicensed repairs and 24-hour response.",
      { category: "plumber", location: "Portland, OR" },
    );

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toMatch(/rating|review|yelp|directoryRank/i);
    expect(first.evidence.kind).toBe("first-party-crawl");
  });

  it("zeros uncited rubric criteria and cites only the known crawl artifact", async () => {
    const generate = vi.fn().mockResolvedValue({
      sections: ["hero", "services", "proof"],
      notes: "Clear offer and proof structure.",
      selectedBecause: [{ text: "Clear service fit", basis: "observed", evidenceSummary: "Services are explicit" }],
      strengths: [{ text: "Strong proof", basis: "observed", evidenceSummary: "License is stated" }],
      gaps: [],
      rubric: MARKET_RUBRIC_CRITERIA.map((criterion, index) => ({
        criterion,
        score: 3,
        evidenceSummary: index === 0 ? "The service page names repair work" : "",
      })),
      confidence: "high",
    });

    const result = await analyzeMarketCompetitor({
      runId: "run-1234",
      competitor: competitor(),
      markdown: "Licensed repairs and 24-hour response.",
      market: { category: "plumber", location: "Portland, OR" },
      generate,
    });

    expect(result.analysis.rubric.map((entry) => entry.score)).toEqual([3, 0, 0, 0, 0]);
    expect(result.analysis.totalScore).toBe(3);
    expect(result.analysis.selectedBecause[0].evidence[0]).toMatchObject({
      kind: "first-party-crawl",
      path: "research/alpha.example/page.md",
    });
    expect(MarketAnalysisSchema.safeParse({
      schemaVersion: 1,
      status: "ready",
      generatedAt: "2026-08-25T12:00:00.000Z",
      displayCutoff: 4,
      competitors: [{ ...result.analysis, rank: 1 }],
      commonPatterns: [],
      gaps: [],
    }).success).toBe(true);
  });

  it("ranks once by score, cited observations, then canonical URL and caps the legacy projection", () => {
    const base = {
      rank: 1,
      totalScore: 6,
      confidence: "medium" as const,
      screenshots: {},
      selectedBecause: [{
        text: "Relevant offer",
        basis: "observed" as const,
        evidence: [{ kind: "first-party-crawl" as const, path: "research/a/page.md", summary: "Offer" }],
      }],
      strengths: [{
        text: "Clear service path",
        basis: "observed" as const,
        evidence: [{ kind: "first-party-crawl" as const, path: "research/a/page.md", summary: "Services" }],
      }],
      gaps: [],
      rubric: MARKET_RUBRIC_CRITERIA.map((criterion) => ({
        criterion,
        score: criterion === MARKET_RUBRIC_CRITERIA[0] ? 3 : criterion === MARKET_RUBRIC_CRITERIA[1] ? 3 : 0,
        evidence: criterion === MARKET_RUBRIC_CRITERIA[0] || criterion === MARKET_RUBRIC_CRITERIA[1]
          ? [{ kind: "first-party-crawl" as const, path: "research/a/page.md", summary: "Evidence" }]
          : [],
      })),
    };
    const ranked = rankMarketCompetitors([
      { ...base, id: "z", name: "Zed", url: "https://z.example" },
      {
        ...base,
        id: "b",
        name: "Beta",
        url: "https://b.example",
        strengths: [{
          text: "Extra observed proof",
          basis: "observed" as const,
          evidence: [{ kind: "first-party-crawl" as const, path: "research/b/page.md", summary: "Proof" }],
        }, ...base.strengths],
      },
      { ...base, id: "a", name: "Alpha", url: "https://a.example" },
      ...Array.from({ length: 6 }, (_, index) => ({
        ...base,
        id: `extra-${index}`,
        name: `Extra ${index}`,
        url: `https://extra-${index}.example`,
        totalScore: Math.max(0, 3 - index),
        rubric: MARKET_RUBRIC_CRITERIA.map((criterion, criterionIndex) => ({
          criterion,
          score: criterionIndex === 0 ? Math.max(0, 3 - index) : 0,
          evidence: criterionIndex === 0 && 3 - index > 0
            ? [{ kind: "first-party-crawl" as const, path: "research/extra/page.md", summary: "Evidence" }]
            : [],
        })),
      })),
    ]);

    expect(ranked).toHaveLength(8);
    expect(ranked.slice(0, 3).map((entry) => entry.id)).toEqual(["b", "a", "z"]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ranked.slice(0, 4)).toHaveLength(4);
  });

  it("rejects non-http competitor URLs before they reach owner-facing links", () => {
    const analysis = {
      schemaVersion: 1,
      status: "ready",
      generatedAt: "2026-08-25T12:00:00.000Z",
      displayCutoff: 4,
      competitors: [{
        id: "unsafe",
        name: "Unsafe",
        url: "javascript:alert(1)",
        rank: 1,
        totalScore: 0,
        confidence: "low",
        screenshots: {},
        selectedBecause: [{
          text: "Test",
          basis: "observed",
          evidence: [{ kind: "first-party-crawl", path: "research/unsafe/page.md", summary: "Test" }],
        }],
        strengths: [{
          text: "Test",
          basis: "observed",
          evidence: [{ kind: "first-party-crawl", path: "research/unsafe/page.md", summary: "Test" }],
        }],
        gaps: [],
        rubric: MARKET_RUBRIC_CRITERIA.map((criterion) => ({ criterion, score: 0, evidence: [] })),
      }],
      commonPatterns: [],
      gaps: [],
    };
    expect(MarketAnalysisSchema.safeParse(analysis).success).toBe(false);
  });

  it("projects canonical ranked URLs back onto the original legacy competitor records", () => {
    const original = competitor({
      url: "https://alpha.example/?utm_source=directory",
    });
    const ranked = [{
      id: "alpha.example",
      name: "Alpha Plumbing",
      url: "https://alpha.example/",
      rank: 1,
      totalScore: 0,
      confidence: "low" as const,
      screenshots: {},
      selectedBecause: [{
        text: "Relevant operator",
        basis: "observed" as const,
        evidence: [{ kind: "first-party-crawl" as const, path: "research/alpha.example/page.md", summary: "Services" }],
      }],
      strengths: [{
        text: "Clear service page",
        basis: "observed" as const,
        evidence: [{ kind: "first-party-crawl" as const, path: "research/alpha.example/page.md", summary: "Services" }],
      }],
      gaps: [],
      rubric: MARKET_RUBRIC_CRITERIA.map((criterion) => ({ criterion, score: 0, evidence: [] })),
    }];

    expect(projectLegacyMarketCompetitors(ranked, [original])).toEqual([original]);
  });
});
