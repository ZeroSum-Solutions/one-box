import { describe, expect, it } from "vitest";
import {
  CrawlProvenanceSchema,
  ScanResultSchema,
  YelpMarketSchema,
  DesignResearchLedgerSchema,
  EVIDENCE_STAGE_ARTIFACT,
  EVIDENCE_WORKFLOW_STAGES,
  HumanVisualReviewSchema,
  IntakeSchema,
  RunStateSchema,
  STAGES,
} from "./contracts";

describe("additive project contracts", () => {
  it("defaults legacy intake to the existing website research behavior", () => {
    const intake = IntakeSchema.parse({
      businessName: "Acme Fiber",
      category: "fiber installer",
      location: "Portland, OR",
      services: ["Installation"],
      primaryAction: "quote",
    });

    expect(intake.projectTarget).toBe("website");
    expect(intake.research).toEqual({
      enabled: true,
      businessIntelligence: true,
      referoDesignEvidence: true,
      allowPaidFirecrawlFallback: true,
    });
    expect(intake.uploads).toEqual([]);
  });

  it("parses legacy run state without changing the legacy stage list", () => {
    const stages = Object.fromEntries(
      STAGES.map((stage) => [stage, { status: "pending", retries: 0 }])
    );
    const run = RunStateSchema.parse({
      id: "legacy-run",
      createdAt: "2026-08-13T00:00:00.000Z",
      stages,
      modelSlugs: {},
    });

    expect(STAGES).toEqual([
      "intake",
      "scanned",
      "locked",
      "synthesized",
      "built",
      "edited",
    ]);
    expect(run.evidenceWorkflow).toEqual({
      currentStage: "evidence",
      artifacts: [],
    });
  });
});

describe("evidence contracts", () => {
  it("requires a named, attested human review with findings for every failed visual criterion", () => {
    const valid = {
      reviewerName: "Devin",
      reviewerKind: "human" as const,
      humanAttestation: true as const,
      reviewedAt: "2026-08-13T12:00:00.000Z",
      buildSha256: "a".repeat(64),
      criteria: {
        briefFidelity: { status: "pass" as const },
        visualHierarchy: { status: "pass" as const },
        spacingAndComposition: { status: "pass" as const },
        businessSpecificity: { status: "fail" as const, findings: "The service proof is generic." },
        designAndReferenceAlignment: {
          status: "pass" as const,
          referenceContext: "explicit-no-reference" as const,
        },
      },
    };

    expect(HumanVisualReviewSchema.parse(valid).reviewerName).toBe("Devin");
    expect(
      HumanVisualReviewSchema.safeParse({
        ...valid,
        reviewerKind: "model",
      }).success
    ).toBe(false);
    expect(
      HumanVisualReviewSchema.safeParse({
        ...valid,
        criteria: {
          ...valid.criteria,
          businessSpecificity: { status: "fail" },
        },
      }).success
    ).toBe(false);
  });

  it("keeps business intelligence and Refero design evidence separated", () => {
    const ledger = DesignResearchLedgerSchema.parse({
      projectTarget: "web-app",
      businessIntelligence: {
        kind: "business-intelligence",
        competitors: [
          {
            name: "Market competitor",
            url: "https://competitor.example",
            selectionRationale: "Same category and buyer",
          },
        ],
      },
      referoDesignEvidence: {
        kind: "refero-design-evidence",
        references: [
          {
            referoId: "ref-1",
            name: "Dashboard pattern",
            learningRationale: "Clear information hierarchy",
            reusablePatterns: ["dense-but-readable data grid"],
          },
        ],
      },
    });

    expect(ledger.businessIntelligence.kind).toBe("business-intelligence");
    expect(ledger.referoDesignEvidence.kind).toBe(
      "refero-design-evidence"
    );
    expect(
      DesignResearchLedgerSchema.safeParse({
        ...ledger,
        businessIntelligence: ledger.referoDesignEvidence,
      }).success
    ).toBe(false);
  });

  it("requires crawl failures and paid fallback to be observable", () => {
    expect(
      CrawlProvenanceSchema.safeParse({
        provider: "crawl4ai",
        sourceUrl: "https://example.com",
        extractedAt: "2026-08-13T00:00:00.000Z",
        confidence: 0,
        outcome: "failed",
      }).success
    ).toBe(false);
    expect(
      CrawlProvenanceSchema.safeParse({
        provider: "firecrawl",
        sourceUrl: "https://example.com",
        extractedAt: "2026-08-13T00:00:00.000Z",
        confidence: 0.8,
        outcome: "succeeded",
        fallbackReason: "user-approved-paid-fallback",
        paidFallbackApproved: true,
      }).success
    ).toBe(true);
  });

  it("declares the required gate order without overloading legacy stages", () => {
    expect(EVIDENCE_WORKFLOW_STAGES).toEqual([
      "evidence",
      "contract",
      "tokens",
      "tailwind",
      "css",
      "build",
    ]);
    expect(EVIDENCE_STAGE_ARTIFACT).toEqual({
      evidence: "ledger",
      contract: "design-contract",
      tokens: "token-inventory",
      tailwind: "tailwind-plan",
      css: "css-architecture",
      build: "visual-qa",
    });
  });
});

describe("YelpMarketSchema", () => {
  const market = {
    searchUrl: "https://www.yelp.com/search?find_desc=bakery&find_loc=Portland%2C+OR",
    fetchedAt: "2026-08-16T00:00:00.000Z",
    listings: [
      { rank: 1, name: "Ken's Artisan Bakery", rating: 4.4, reviewCount: 1100 },
    ],
    summary: { rosterSize: 1, ratingMedian: 4.4, reviewCountMedian: 1100 },
  };

  it("keeps the derived market bar separate from the named roster", () => {
    const parsed = YelpMarketSchema.parse(market);

    expect(parsed.summary).toEqual({
      rosterSize: 1,
      ratingMedian: 4.4,
      reviewCountMedian: 1100,
    });
    expect(parsed.listings[0].categories).toEqual([]);
  });

  it("records why a roster is empty without failing the parse", () => {
    const parsed = YelpMarketSchema.parse({
      searchUrl: market.searchUrl,
      fetchedAt: market.fetchedAt,
      summary: { rosterSize: 0 },
      unavailable: "Yelp returned a page with no listings",
    });

    expect(parsed.listings).toEqual([]);
    expect(parsed.unavailable).toContain("no listings");
  });
});

describe("ScanResultSchema yelp lane", () => {
  const baseScan = { competitors: [], commonSections: [], gaps: [] };

  it("still parses a scan saved before the Yelp lane existed", () => {
    const parsed = ScanResultSchema.parse(baseScan);

    expect(parsed.yelp).toBeUndefined();
  });

  it("carries the Yelp market when the lane ran", () => {
    const parsed = ScanResultSchema.parse({
      ...baseScan,
      yelp: {
        searchUrl: "https://www.yelp.com/search?find_desc=bakery&find_loc=Portland%2C+OR",
        fetchedAt: "2026-08-16T00:00:00.000Z",
        listings: [{ rank: 1, name: "Ken's Artisan Bakery", rating: 4.4 }],
        summary: { rosterSize: 1, ratingMedian: 4.4 },
      },
    });

    expect(parsed.yelp?.summary.ratingMedian).toBe(4.4);
    expect(parsed.yelp?.listings[0].name).toBe("Ken's Artisan Bakery");
  });
});
