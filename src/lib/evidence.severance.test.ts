import { describe, expect, it } from "vitest";
import {
  IntakeSchema,
  ReferenceLockSchema,
  ScanResultSchema,
} from "./contracts";
import { buildDesignResearchLedger } from "./evidence";

/**
 * Severance guard. The competitive scan is report-only: it must not become a
 * design or copy input (pipeline.ts:1969 records the same rule for
 * commonSections/gaps). The Yelp lane adds named rivals and their ratings to
 * ScanResult, so this pins the one builder that turns a scan into
 * model-facing evidence — if someone later spreads `...scan` into the ledger,
 * a competitor's name and rating would ride along into prompts.
 */

const intake = IntakeSchema.parse({
  businessName: "Acme Bakery",
  category: "bakery",
  location: "Portland, OR",
  services: ["Custom cakes"],
  primaryAction: "quote",
});

const lock = ReferenceLockSchema.parse({
  searchAngles: ["a", "b", "c"],
  primary: {
    referoId: "ref-1",
    kind: "style",
    name: "Reference",
    why: "Chosen for its type hierarchy.",
  },
  borrowedDetails: [],
  rejected: [],
  decisionLedger: [{ decision: "Locked the primary.", source: "test" }],
});

const YELP_ONLY_NAME = "Kokikoki Bakehouse";

const scan = ScanResultSchema.parse({
  competitors: [],
  commonSections: ["hero", "services"],
  gaps: ["no online ordering"],
  yelp: {
    searchUrl: "https://www.yelp.com/search?find_desc=bakery&find_loc=Portland%2C+OR",
    fetchedAt: "2026-08-16T00:00:00.000Z",
    listings: [
      { rank: 1, name: YELP_ONLY_NAME, rating: 4.6, reviewCount: 29 },
    ],
    summary: { rosterSize: 1, ratingMedian: 4.6, reviewCountMedian: 29 },
  },
});

describe("design research ledger severance", () => {
  it("never carries Yelp rivals or their ratings into model-facing evidence", () => {
    const ledger = buildDesignResearchLedger({
      intake,
      scan,
      lock,
      capturedAt: "2026-08-16T00:00:00.000Z",
    });

    const serialized = JSON.stringify(ledger);

    // Non-vacuous: the scan DID reach the ledger, so the absences below are
    // the builder being selective, not the ledger being empty.
    expect(ledger.businessIntelligence.marketExpectations).toEqual([
      "hero",
      "services",
    ]);
    expect(ledger.businessIntelligence.differentiationOpportunities).toEqual([
      "no online ordering",
    ]);

    expect(serialized).not.toContain(YELP_ONLY_NAME);
    expect(serialized).not.toContain("yelp.com");
    expect(ledger.businessIntelligence.competitors).toEqual([]);
  });
});
