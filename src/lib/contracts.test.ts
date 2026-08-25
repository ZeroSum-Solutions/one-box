import { describe, expect, it } from "vitest";
import {
  CandidateManifestV1Schema,
  CandidateProvenanceV1Schema,
  CandidateGateReceiptV1Schema,
  CANDIDATE_STATE_TRANSITIONS,
  CrawlProvenanceSchema,
  ScanResultSchema,
  YelpMarketSchema,
  DesignResearchLedgerSchema,
  EVIDENCE_STAGE_ARTIFACT,
  EVIDENCE_WORKFLOW_STAGES,
  HumanVisualReviewSchema,
  PAGE_IR_PURPOSES,
  PageIrOwnerRolloutDecisionV1Schema,
  PageIrPromotionFindingV1Schema,
  PageIrQualificationPacketV1Schema,
  PageIrQualificationHumanReviewV1Schema,
  verifyPageIrOwnerRolloutEligibilityV1,
  verifyPageIrPromotionFindingV1,
  verifyPageIrQualificationPacketV1,
  verifyPageIrQualificationHumanReviewV1,
  IntakeSchema,
  RunStateSchema,
  STAGES,
} from "./contracts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);

function qualificationReview(overrides: Record<string, unknown> = {}) {
  const targetHashes = {
    buildSha256: HASH_A,
    pageIrSha256: HASH_B,
    candidateManifestSha256: HASH_C,
    mechanicalChecksSha256: HASH_D,
    browserEvidenceSha256: "e".repeat(64),
  };
  return {
    schemaVersion: 1,
    reviewerName: "Named Human",
    reviewerKind: "human",
    humanAttestation: true,
    reviewedAt: "2026-08-24T12:00:00.000Z",
    fixtureId: "portfolio-showcase",
    reviewedHashes: targetHashes,
    mechanicalGatesPassed: true,
    automaticRejections: [],
    dimensions: {
      briefFidelity: { score: 4, evidence: "The named audience and action are visible." },
      purposeTopology: { score: 4, evidence: "Projects and case studies lead the page." },
      hierarchy: { score: 3, evidence: "Offer, proof, and contact read in order." },
      compositionAndSpacing: { score: 3, evidence: "All three viewports retain clear grouping." },
      typographyAndColor: { score: 3, evidence: "Rendered contrast and hierarchy are coherent." },
      businessSpecificity: { score: 4, evidence: "Synthetic fixture facts remain purpose-specific." },
      referenceAlignment: { score: 3, evidence: "Recorded lessons are synthesized without copying." },
      responsiveBehavior: { score: 3, evidence: "Tablet and mobile change flow intentionally." },
      interactionAndMotion: { score: 3, evidence: "Keyboard and reduced-motion evidence passes." },
      craftAndCompleteness: { score: 3, evidence: "Focus and conversion states are review-ready." },
    },
    findings: [],
    decision: "pass",
    ...overrides,
  };
}

function candidateProvenance(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    candidateId: "candidate-v1",
    runId: "run-1234",
    createdAt: "2026-08-22T00:00:00.000Z",
    state: "preparing",
    history: [
      { state: "preparing", at: "2026-08-22T00:00:00.000Z" },
    ],
    inputArtifactHashes: [
      { path: "evidence/design-contract.json", sha256: HASH_A },
    ],
    layoutAuthority: "template-v1",
    compilerVersion: "template-compiler@1",
    ...overrides,
  };
}

describe("candidate contracts", () => {
  const manifest = {
    schemaVersion: 1,
    entry: "index.html",
    files: [
      { path: "assets/site.css", sizeBytes: 3, sha256: HASH_A },
      { path: "index.html", sizeBytes: 4, sha256: HASH_B },
    ],
    totalBytes: 7,
    buildSha256: HASH_C,
  };

  it("accepts only a sorted, unique, bounded deterministic manifest", () => {
    expect(CandidateManifestV1Schema.parse(manifest)).toEqual(manifest);
    expect(
      CandidateManifestV1Schema.safeParse({
        ...manifest,
        files: [...manifest.files].reverse(),
      }).success,
    ).toBe(false);
    expect(
      CandidateManifestV1Schema.safeParse({
        ...manifest,
        files: [manifest.files[0], manifest.files[0]],
        totalBytes: 6,
      }).success,
    ).toBe(false);
    expect(
      CandidateManifestV1Schema.safeParse({ ...manifest, totalBytes: 8 })
        .success,
    ).toBe(false);
  });

  it.each([
    "",
    ".",
    "..",
    "../index.html",
    "assets/../index.html",
    "/index.html",
    "C:\\index.html",
    "\\\\server\\share\\index.html",
    "assets\\site.css",
    "./index.html",
    "assets//site.css",
    "index.html\0ignored",
  ])("rejects hostile candidate file path %j", (filePath) => {
    expect(
      CandidateManifestV1Schema.safeParse({
        ...manifest,
        files: [{ ...manifest.files[0], path: filePath }],
        totalBytes: 3,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown manifest and provenance keys", () => {
    expect(
      CandidateManifestV1Schema.safeParse({ ...manifest, builtAt: "now" })
        .success,
    ).toBe(false);
    expect(
      CandidateProvenanceV1Schema.safeParse({
        ...candidateProvenance(),
        operatorNote: "publish it",
      }).success,
    ).toBe(false);
    expect(
      CandidateProvenanceV1Schema.safeParse({
        ...candidateProvenance(),
        history: [
          {
            state: "preparing",
            at: "2026-08-22T00:00:00.000Z",
            extra: true,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("enforces the complete transition matrix", () => {
    expect(CANDIDATE_STATE_TRANSITIONS).toEqual({
      preparing: ["ready-for-gates", "failed", "abandoned"],
      "ready-for-gates": ["promotable", "failed", "abandoned"],
      failed: ["preparing", "abandoned"],
      promotable: ["promoted", "failed", "abandoned"],
      promoted: [],
      abandoned: [],
    });

    const prefixes = {
      preparing: ["preparing"],
      "ready-for-gates": ["preparing", "ready-for-gates"],
      failed: ["preparing", "failed"],
      promotable: ["preparing", "ready-for-gates", "promotable"],
      promoted: [
        "preparing",
        "ready-for-gates",
        "promotable",
        "promoted",
      ],
      abandoned: ["preparing", "abandoned"],
    } as const;
    const states = Object.keys(prefixes) as Array<keyof typeof prefixes>;

    for (const from of states) {
      for (const to of states) {
        const sequence = [...prefixes[from], to];
        const history = sequence.map((state, index) => ({
          state,
          at: new Date(Date.UTC(2026, 7, 22, 0, 0, index)).toISOString(),
        }));
        const result = CandidateProvenanceV1Schema.safeParse(
          candidateProvenance({
            createdAt: history[0].at,
            state: to,
            history,
            candidateManifestSha256: HASH_A,
            buildSha256: HASH_B,
            gateReportSha256: HASH_C,
            ...(to === "promoted" ? { promotedBuildSha256: HASH_B } : {}),
          }),
        );
        const allowed = CANDIDATE_STATE_TRANSITIONS[
          from
        ] as readonly string[];
        expect(result.success, `${from} -> ${to}`).toBe(
          allowed.includes(to),
        );
      }
    }
  });

  it("requires creation into preparing, contiguous history, matching state, and monotonic timestamps", () => {
    const cases = [
      candidateProvenance({ history: [] }),
      candidateProvenance({
        state: "failed",
        history: [{ state: "failed", at: "2026-08-22T00:00:00.000Z" }],
      }),
      candidateProvenance({
        createdAt: "2026-08-21T23:59:59.000Z",
      }),
      candidateProvenance({
        state: "ready-for-gates",
        history: [
          { state: "preparing", at: "2026-08-22T00:00:01.000Z" },
          { state: "ready-for-gates", at: "2026-08-22T00:00:00.000Z" },
        ],
        candidateManifestSha256: HASH_A,
        buildSha256: HASH_B,
      }),
      candidateProvenance({
        state: "failed",
        history: [
          { state: "preparing", at: "2026-08-22T00:00:00.000Z" },
          { state: "promotable", at: "2026-08-22T00:00:01.000Z" },
          { state: "failed", at: "2026-08-22T00:00:02.000Z" },
        ],
      }),
      candidateProvenance({
        state: "preparing",
        history: [
          { state: "preparing", at: "2026-08-22T00:00:00.000Z" },
          { state: "failed", at: "2026-08-22T00:00:01.000Z" },
        ],
      }),
    ];

    for (const item of cases) {
      expect(CandidateProvenanceV1Schema.safeParse(item).success).toBe(false);
    }
  });

  it("requires state-specific hash bindings and Page IR provenance", () => {
    expect(
      CandidateProvenanceV1Schema.safeParse(
        candidateProvenance({ layoutAuthority: "page-ir-v1" }),
      ).success,
    ).toBe(false);
    expect(
      CandidateProvenanceV1Schema.safeParse(
        candidateProvenance({
          state: "ready-for-gates",
          history: [
            { state: "preparing", at: "2026-08-22T00:00:00.000Z" },
            {
              state: "ready-for-gates",
              at: "2026-08-22T00:00:01.000Z",
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      CandidateProvenanceV1Schema.safeParse(
        candidateProvenance({
          state: "promotable",
          history: [
            { state: "preparing", at: "2026-08-22T00:00:00.000Z" },
            {
              state: "ready-for-gates",
              at: "2026-08-22T00:00:01.000Z",
            },
            { state: "promotable", at: "2026-08-22T00:00:02.000Z" },
          ],
          candidateManifestSha256: HASH_A,
          buildSha256: HASH_B,
        }),
      ).success,
    ).toBe(false);
    expect(
      CandidateProvenanceV1Schema.safeParse(
        candidateProvenance({
          state: "promoted",
          history: [
            { state: "preparing", at: "2026-08-22T00:00:00.000Z" },
            {
              state: "ready-for-gates",
              at: "2026-08-22T00:00:01.000Z",
            },
            { state: "promotable", at: "2026-08-22T00:00:02.000Z" },
            { state: "promoted", at: "2026-08-22T00:00:03.000Z" },
          ],
          candidateManifestSha256: HASH_A,
          buildSha256: HASH_B,
          gateReportSha256: HASH_C,
          promotedBuildSha256: HASH_D,
        }),
      ).success,
    ).toBe(false);
  });

  it("preserves history-implied bindings through failure and repair", () => {
    const repairedAfterReady = {
      state: "preparing",
      history: [
        { state: "preparing", at: "2026-08-22T00:00:00.000Z" },
        { state: "ready-for-gates", at: "2026-08-22T00:00:01.000Z" },
        { state: "failed", at: "2026-08-22T00:00:02.000Z" },
        { state: "preparing", at: "2026-08-22T00:00:03.000Z" },
      ],
    };
    expect(
      CandidateProvenanceV1Schema.safeParse(
        candidateProvenance(repairedAfterReady),
      ).success,
    ).toBe(false);
    expect(
      CandidateProvenanceV1Schema.safeParse(
        candidateProvenance({
          ...repairedAfterReady,
          candidateManifestSha256: HASH_A,
          buildSha256: HASH_B,
        }),
      ).success,
    ).toBe(true);

    const repairedAfterPromotable = {
      state: "preparing",
      history: [
        { state: "preparing", at: "2026-08-22T00:00:00.000Z" },
        { state: "ready-for-gates", at: "2026-08-22T00:00:01.000Z" },
        { state: "promotable", at: "2026-08-22T00:00:02.000Z" },
        { state: "failed", at: "2026-08-22T00:00:03.000Z" },
        { state: "preparing", at: "2026-08-22T00:00:04.000Z" },
      ],
      candidateManifestSha256: HASH_A,
      buildSha256: HASH_B,
    };
    expect(
      CandidateProvenanceV1Schema.safeParse(
        candidateProvenance(repairedAfterPromotable),
      ).success,
    ).toBe(false);
    expect(
      CandidateProvenanceV1Schema.safeParse(
        candidateProvenance({
          ...repairedAfterPromotable,
          gateReportSha256: HASH_C,
        }),
      ).success,
    ).toBe(true);
  });

  it("allows promoted build bindings only in the promoted state", () => {
    expect(
      CandidateProvenanceV1Schema.safeParse(
        candidateProvenance({
          state: "failed",
          history: [
            { state: "preparing", at: "2026-08-22T00:00:00.000Z" },
            { state: "failed", at: "2026-08-22T00:00:01.000Z" },
          ],
          candidateManifestSha256: HASH_A,
          buildSha256: HASH_B,
          promotedBuildSha256: HASH_B,
        }),
      ).success,
    ).toBe(false);
  });

  it("accepts only a strict receipt for the complete ordered candidate gate suite", () => {
    const gateNames = [
      "token-drift",
      "color-role-compliance",
      "axe",
      "contrast",
      "console-errors",
      "assets",
      "no-js",
      "mobile-layout",
      "perf-budget",
    ];
    const receipt = {
      schemaVersion: 1,
      runId: "run-1234",
      candidateManifestSha256: HASH_A,
      buildSha256: HASH_B,
      reports: gateNames.map((gate) => ({
        gate,
        pass: true,
        blocking: gate !== "perf-budget",
        details: [],
        ranAt: "2026-08-22T00:00:00.000Z",
      })),
    };

    expect(CandidateGateReceiptV1Schema.parse(receipt)).toEqual(receipt);
    expect(
      CandidateGateReceiptV1Schema.safeParse({ ...receipt, afterEdit: true })
        .success,
    ).toBe(false);
    expect(
      CandidateGateReceiptV1Schema.safeParse({
        ...receipt,
        reports: receipt.reports.slice(0, -1),
      }).success,
    ).toBe(false);
    expect(
      CandidateGateReceiptV1Schema.safeParse({
        ...receipt,
        reports: [...receipt.reports].reverse(),
      }).success,
    ).toBe(false);
    expect(
      CandidateGateReceiptV1Schema.safeParse({
        ...receipt,
        reports: receipt.reports.map((report, index) =>
          index === 0 ? { ...report, unexpected: "accepted" } : report,
        ),
      }).success,
    ).toBe(false);
    expect(
      CandidateGateReceiptV1Schema.safeParse({
        ...receipt,
        reports: receipt.reports.map((report, index) =>
          index === 0 ? { ...report, blocking: false } : report,
        ),
      }).success,
    ).toBe(false);
  });
});

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

describe("PageIrQualificationHumanReviewV1Schema", () => {
  it("accepts a named human pass bound to the exact build and prerequisites", () => {
    const review = qualificationReview();
    expect(verifyPageIrQualificationHumanReviewV1(review, {
      reviewerName: "Named Human",
      currentHashes: review.reviewedHashes,
    }).decision).toBe("pass");
  });

  it.each([
    ["model reviewer", { reviewerKind: "model" }],
    ["missing attestation", { humanAttestation: false }],
  ])("rejects %s", (_name, overrides) => {
    expect(PageIrQualificationHumanReviewV1Schema.safeParse(qualificationReview(overrides)).success).toBe(false);
  });

  it("accepts a human fail record for low scores, failed prerequisites, or a closed automatic rejection", () => {
    const base = qualificationReview();
    const dimensions = base.dimensions as Record<string, { score: number; evidence: string }>;
    expect(PageIrQualificationHumanReviewV1Schema.safeParse({
      ...base,
      decision: "fail",
      mechanicalGatesPassed: false,
      automaticRejections: ["invented-business-fact"],
      dimensions: {
        ...dimensions,
        hierarchy: { ...dimensions.hierarchy, score: 1 },
      },
    }).success).toBe(true);
  });

  it("rejects a pass when mechanical gates failed or an automatic rejection exists", () => {
    expect(PageIrQualificationHumanReviewV1Schema.safeParse(
      qualificationReview({ mechanicalGatesPassed: false }),
    ).success).toBe(false);
    expect(PageIrQualificationHumanReviewV1Schema.safeParse(
      qualificationReview({ automaticRejections: ["invented-business-fact"] }),
    ).success).toBe(false);
  });

  it("rejects a stale or mismatched build and prerequisite binding", () => {
    const base = qualificationReview();
    const currentHashes = base.reviewedHashes;
    expect(() => verifyPageIrQualificationHumanReviewV1({
      ...base,
      reviewedHashes: { ...currentHashes, buildSha256: "f".repeat(64) },
    }, { reviewerName: "Named Human", currentHashes })).toThrow(/stale/i);
    expect(() => verifyPageIrQualificationHumanReviewV1(base, {
      reviewerName: "Different Human",
      currentHashes,
    })).toThrow(/trusted human authority/i);
  });

  it("rejects any dimension below three or a mean below 3.2", () => {
    const base = qualificationReview();
    const dimensions = base.dimensions as Record<string, { score: number; evidence: string }>;
    expect(PageIrQualificationHumanReviewV1Schema.safeParse({
      ...base,
      dimensions: {
        ...dimensions,
        hierarchy: { ...dimensions.hierarchy, score: 2 },
      },
    }).success).toBe(false);
    expect(PageIrQualificationHumanReviewV1Schema.safeParse({
      ...base,
      dimensions: Object.fromEntries(
        Object.entries(dimensions).map(([key, value]) => [key, { ...value, score: 3 }]),
      ),
    }).success).toBe(false);
  });
});

const QUALIFICATION_HASHES = {
  fixtureSha256: "1".repeat(64),
  evaluatedGitSha: "2".repeat(40),
  manifestSha256: "3".repeat(64),
  registrySha256: "4".repeat(64),
  buildSha256: "5".repeat(64),
  pageIrSha256: "6".repeat(64),
  candidateManifestSha256: "7".repeat(64),
  mechanicalChecksSha256: "8".repeat(64),
  browserEvidenceSha256: "9".repeat(64),
};

function qualificationPacket(
  purpose: (typeof PAGE_IR_PURPOSES)[number],
  overrides: Record<string, unknown> = {},
) {
  const reviewedHashes = {
    buildSha256: QUALIFICATION_HASHES.buildSha256,
    pageIrSha256: QUALIFICATION_HASHES.pageIrSha256,
    candidateManifestSha256: QUALIFICATION_HASHES.candidateManifestSha256,
    mechanicalChecksSha256: QUALIFICATION_HASHES.mechanicalChecksSha256,
    browserEvidenceSha256: QUALIFICATION_HASHES.browserEvidenceSha256,
  };
  return {
    schemaVersion: 1,
    purpose,
    hashes: QUALIFICATION_HASHES,
    humanReview: qualificationReview({ fixtureId: purpose, reviewedHashes }),
    ...overrides,
  };
}

function promotionFinding(
  disposition: "open" | "fixed" | "accepted",
  overrides: Record<string, unknown> = {},
) {
  const common = {
    schemaVersion: 1,
    findingId: "P0-001",
    severity: "P0",
    summary: "The valid start path is blocked.",
    recordedAt: "2026-08-24T12:00:00.000Z",
  };
  if (disposition === "open") return { ...common, disposition, ...overrides };
  return {
    ...common,
    disposition,
    resolution: "The same-origin request now succeeds and hostile variants fail.",
    authorityName: "Named Owner",
    authorityKind: "owner",
    authorityAttestation: true,
    disposedAt: "2026-08-24T13:00:00.000Z",
    ...overrides,
  };
}

const CURRENT_ROLLOUT_HASHES = {
  evaluatedGitSha: QUALIFICATION_HASHES.evaluatedGitSha,
  manifestSha256: QUALIFICATION_HASHES.manifestSha256,
  registrySha256: QUALIFICATION_HASHES.registrySha256,
  aggregateSha256: "a".repeat(64),
  findingsInventorySha256: "b".repeat(64),
};

function rolloutDecision(
  decision: "default-on" | "opt-in" | "reject",
  qualificationPacketHashes: Array<{ purpose: (typeof PAGE_IR_PURPOSES)[number]; sha256: string }>,
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    sequence: 1,
    previousDecisionSha256: null,
    decision,
    ...CURRENT_ROLLOUT_HASHES,
    qualificationPacketHashes,
    ownerName: "Named Owner",
    ownerKind: "owner",
    ownerAttestation: true,
    decidedAt: "2026-08-24T14:00:00.000Z",
    rationale: "The recorded evidence supports this rollout state.",
    ...overrides,
  };
}

describe("Page IR production qualification contracts", () => {
  it("accepts only a closed qualification packet bound to current hashes and named human review", () => {
    const packet = qualificationPacket("portfolio-showcase");
    expect(PageIrQualificationPacketV1Schema.parse(packet)).toEqual(packet);
    expect(
      verifyPageIrQualificationPacketV1(packet, {
        reviewerName: "Named Human",
        currentHashes: QUALIFICATION_HASHES,
      }).purpose,
    ).toBe("portfolio-showcase");
    expect(PageIrQualificationPacketV1Schema.safeParse({ ...packet, extra: true }).success).toBe(false);
    expect(() => verifyPageIrQualificationPacketV1(packet, {
      reviewerName: "Named Human",
      currentHashes: { ...QUALIFICATION_HASHES, buildSha256: "c".repeat(64) },
    })).toThrow(/stale/i);
  });

  it("requires trusted named authority for fixed and accepted findings", () => {
    const fixed = promotionFinding("fixed");
    const accepted = promotionFinding("accepted");
    expect(PageIrPromotionFindingV1Schema.parse(promotionFinding("open")).disposition).toBe("open");
    expect(verifyPageIrPromotionFindingV1(fixed, {
      authorityName: "Named Owner",
      authorityKind: "owner",
    }).disposition).toBe("fixed");
    expect(verifyPageIrPromotionFindingV1(accepted, {
      authorityName: "Named Owner",
      authorityKind: "owner",
    }).disposition).toBe("accepted");
    expect(() => verifyPageIrPromotionFindingV1(fixed, {
      authorityName: "Different Human",
      authorityKind: "human",
    })).toThrow(/authority/i);
    expect(PageIrPromotionFindingV1Schema.safeParse({
      ...accepted,
      authorityKind: "human",
    }).success).toBe(false);
    expect(PageIrPromotionFindingV1Schema.safeParse({
      ...promotionFinding("open"),
      authorityName: "Untrusted",
    }).success).toBe(false);
  });

  it("records opt-in or reject against current authority and append-only lineage without claiming eligibility", () => {
    for (const decision of ["opt-in", "reject"] as const) {
      const record = rolloutDecision(decision, []);
      expect(PageIrOwnerRolloutDecisionV1Schema.parse(record)).toEqual(record);
      expect(PageIrOwnerRolloutDecisionV1Schema.safeParse({
        ...record,
        mutableNote: "not part of the closed record",
      }).success).toBe(false);
      const result = verifyPageIrOwnerRolloutEligibilityV1({
        decision: record,
        authority: {
          ownerName: "Named Owner",
          currentHashes: CURRENT_ROLLOUT_HASHES,
          previousDecision: null,
          qualificationPackets: [],
          blockingEvaluationIds: ["EVAL-OPS-004"],
          aggregateResults: [{ evaluationId: "EVAL-OPS-004", state: "NOT_RUN" }],
          findings: [{ record: promotionFinding("open") }],
        },
      });
      expect(result.defaultOnEligible).toBe(false);
      expect(result.record.decision).toBe(decision);
    }

    const next = rolloutDecision("opt-in", [], {
      sequence: 2,
      previousDecisionSha256: "c".repeat(64),
    });
    expect(() => verifyPageIrOwnerRolloutEligibilityV1({
      decision: next,
      authority: {
        ownerName: "Named Owner",
        currentHashes: CURRENT_ROLLOUT_HASHES,
        previousDecision: { sequence: 1, sha256: "d".repeat(64) },
        qualificationPackets: [],
        blockingEvaluationIds: ["EVAL-OPS-004"],
        aggregateResults: [{ evaluationId: "EVAL-OPS-004", state: "NOT_RUN" }],
        findings: [],
      },
    })).toThrow(/previous decision/i);
  });

  it("qualifies default-on only with all six passing current packets, blocking passes, and resolved findings", () => {
    const qualificationPackets = PAGE_IR_PURPOSES.map((purpose, index) => ({
      sha256: `${index + 1}`.repeat(64),
      packet: qualificationPacket(purpose),
      reviewerName: "Named Human",
      currentHashes: QUALIFICATION_HASHES,
    }));
    const record = rolloutDecision(
      "default-on",
      qualificationPackets.map(({ packet, sha256 }) => ({ purpose: packet.purpose, sha256 })),
    );
    const result = verifyPageIrOwnerRolloutEligibilityV1({
      decision: record,
      authority: {
        ownerName: "Named Owner",
        currentHashes: CURRENT_ROLLOUT_HASHES,
        previousDecision: null,
        qualificationPackets,
        blockingEvaluationIds: ["EVAL-OPS-004", "EVAL-QUAL-001"],
        aggregateResults: [
          { evaluationId: "EVAL-OPS-004", state: "PASS" },
          { evaluationId: "EVAL-QUAL-001", state: "PASS" },
        ],
        findings: [
          {
            record: promotionFinding("fixed"),
            authority: { authorityName: "Named Owner", authorityKind: "owner" },
          },
          {
            record: promotionFinding("accepted", { findingId: "SEC-001", severity: "high" }),
            authority: { authorityName: "Named Owner", authorityKind: "owner" },
          },
        ],
      },
    });
    expect(result.defaultOnEligible).toBe(true);
    expect(result.record.decision).toBe("default-on");
  });

  it("fails default-on closed for missing packets, non-pass blocking states, stale hashes, or open findings", () => {
    const qualificationPackets = PAGE_IR_PURPOSES.map((purpose, index) => ({
      sha256: `${index + 1}`.repeat(64),
      packet: qualificationPacket(purpose),
      reviewerName: "Named Human",
      currentHashes: QUALIFICATION_HASHES,
    }));
    const record = rolloutDecision(
      "default-on",
      qualificationPackets.map(({ packet, sha256 }) => ({ purpose: packet.purpose, sha256 })),
    );
    const base = {
      decision: record,
      authority: {
        ownerName: "Named Owner",
        currentHashes: CURRENT_ROLLOUT_HASHES,
        previousDecision: null,
        qualificationPackets,
        blockingEvaluationIds: ["EVAL-OPS-004"],
        aggregateResults: [{ evaluationId: "EVAL-OPS-004", state: "PASS" as const }],
        findings: [] as Array<{ record: unknown; authority?: { authorityName: string; authorityKind: "human" | "owner" } }>,
      },
    };
    expect(() => verifyPageIrOwnerRolloutEligibilityV1({
      ...base,
      authority: { ...base.authority, qualificationPackets: qualificationPackets.slice(0, 5) },
    })).toThrow(/six qualification/i);
    for (const state of ["FAIL", "BLOCKED", "NOT_RUN"] as const) {
      expect(() => verifyPageIrOwnerRolloutEligibilityV1({
        ...base,
        authority: { ...base.authority, aggregateResults: [{ evaluationId: "EVAL-OPS-004", state }] },
      })).toThrow(/blocking evaluation.*pass/i);
    }
    expect(() => verifyPageIrOwnerRolloutEligibilityV1({
      ...base,
      authority: {
        ...base.authority,
        qualificationPackets: qualificationPackets.map((binding, index) => index === 0 ? {
          ...binding,
          packet: qualificationPacket(binding.packet.purpose, {
            hashes: { ...QUALIFICATION_HASHES, registrySha256: "f".repeat(64) },
          }),
        } : binding),
      },
    })).toThrow(/stale/i);
    for (const severity of ["P0", "critical", "high"] as const) {
      expect(() => verifyPageIrOwnerRolloutEligibilityV1({
        ...base,
        authority: { ...base.authority, findings: [{ record: promotionFinding("open", { severity }) }] },
      })).toThrow(/unresolved/i);
    }
  });
});
