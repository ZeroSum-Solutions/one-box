import { describe, expect, it } from "vitest";
import {
  CandidateProfileSchema,
  ReferenceLockSchema,
  ReferenceSelectionStateSchema,
  RunStateSchema,
} from "./contracts";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    referoId: "b11e1e78-3c62-45df-bf28-17c97718ed7d",
    kind: "style",
    name: "Ambrook",
    sourceUrl: "https://ambrook.com",
    previewImageUrl:
      "https://images.refero.design/styles/ambrook.com/b11e1e78/preview_0.jpg",
    screenshotPath: "research/refero/reference-1.jpg",
    foundVia: "warm trustworthy local trade website",
    palette: [
      { hex: "#fcfaf1", plainLabel: "the page background" },
      { hex: "#e8b672", plainLabel: "the button color" },
    ],
    plainLanguageProfile: {
      headline: "Warm and handcrafted",
      feelSummary:
        "Feels like a well-kept workshop: cream backgrounds, deep earthy text, one golden button color.",
      bestFor: ["trades that sell craftsmanship"],
      headsUp: [],
    },
    composition: {
      northStar: "Rustic ledger on cream parchment",
      preserveTraits: ["cream canvas", "gold reserved for buttons"],
      rhythmNote: "sections alternate light cream and warm paper",
    },
    recommended: false,
    ...overrides,
  };
}

function selectionState(overrides: Record<string, unknown> = {}) {
  return {
    status: "pending",
    rerollsUsed: 0,
    versions: [
      {
        version: 1,
        createdAt: "2026-08-15T12:00:00.000Z",
        searchAngles: ["a", "b", "c"],
        candidates: [
          candidate({ recommended: true, recommendedWhy: "closest fit" }),
          candidate({ referoId: "other-style-id", name: "Pipe" }),
        ],
        excludedFromPrior: [],
      },
    ],
    ...overrides,
  };
}

describe("candidate profile invariants", () => {
  it("accepts a valid candidate", () => {
    expect(CandidateProfileSchema.safeParse(candidate()).success).toBe(true);
  });

  it("rejects preview images that are not refero-hosted https", () => {
    expect(
      CandidateProfileSchema.safeParse(
        candidate({ previewImageUrl: "https://evil.example/steal.jpg" })
      ).success
    ).toBe(false);
    expect(
      CandidateProfileSchema.safeParse(
        candidate({
          previewImageUrl: "http://images.refero.design/x.jpg",
        })
      ).success
    ).toBe(false);
  });

  it("rejects screenshot paths that escape the research directory", () => {
    expect(
      CandidateProfileSchema.safeParse(
        candidate({ screenshotPath: "../../etc/passwd" })
      ).success
    ).toBe(false);
  });
});

describe("reference selection state invariants", () => {
  it("accepts a pending version with exactly one recommendation", () => {
    expect(ReferenceSelectionStateSchema.safeParse(selectionState()).success).toBe(
      true
    );
  });

  it("rejects a version with zero or two recommendations", () => {
    const zero = selectionState();
    (zero.versions[0].candidates[0] as Record<string, unknown>).recommended = false;
    expect(ReferenceSelectionStateSchema.safeParse(zero).success).toBe(false);

    const two = selectionState();
    (two.versions[0].candidates[1] as Record<string, unknown>).recommended = true;
    expect(ReferenceSelectionStateSchema.safeParse(two).success).toBe(false);
  });

  it("rejects duplicate candidate ids within a version", () => {
    const dup = selectionState();
    (dup.versions[0].candidates[1] as Record<string, unknown>).referoId =
      "b11e1e78-3c62-45df-bf28-17c97718ed7d";
    expect(ReferenceSelectionStateSchema.safeParse(dup).success).toBe(false);
  });

  it("binds a selection to a real candidate in the named version", () => {
    const selected = selectionState({
      status: "selected",
      selection: {
        selectedId: "not-a-candidate",
        selectionKind: "user-picked-other",
        version: 1,
        at: "2026-08-15T13:00:00.000Z",
      },
    });
    expect(ReferenceSelectionStateSchema.safeParse(selected).success).toBe(false);
  });

  it("requires selectionKind to agree with the candidate's recommended flag", () => {
    const wrongKind = selectionState({
      status: "selected",
      selection: {
        selectedId: "other-style-id", // not the recommended one
        selectionKind: "user-picked-recommended",
        version: 1,
        at: "2026-08-15T13:00:00.000Z",
      },
    });
    expect(ReferenceSelectionStateSchema.safeParse(wrongKind).success).toBe(false);

    const rightKind = selectionState({
      status: "selected",
      selection: {
        selectedId: "other-style-id",
        selectionKind: "user-picked-other",
        version: 1,
        at: "2026-08-15T13:00:00.000Z",
      },
    });
    expect(ReferenceSelectionStateSchema.safeParse(rightKind).success).toBe(true);
  });

  it("keeps the historical untagged single-selection shape valid", () => {
    const historical = selectionState({
      status: "selected",
      selection: {
        selectedId: "other-style-id",
        selectionKind: "user-picked-other",
        version: 1,
        at: "2026-08-15T13:00:00.000Z",
        note: "Use the layout.",
      },
    });
    const parsed = ReferenceSelectionStateSchema.parse(historical);
    expect(parsed.selection).toEqual({
      selectedId: "other-style-id",
      selectionKind: "user-picked-other",
      version: 1,
      at: "2026-08-15T13:00:00.000Z",
      note: "Use the layout.",
    });
  });

  it("accepts ranked preferences additively while retaining rank-one compatibility fields", () => {
    const ranked = selectionState({
      status: "selected",
      selection: {
        selectedId: "b11e1e78-3c62-45df-bf28-17c97718ed7d",
        selectionKind: "user-picked-recommended",
        version: 1,
        at: "2026-08-15T13:00:00.000Z",
        note: "Use the warm colors.",
        ranked: {
          schemaVersion: 1,
          checkpointId: "run-1234:reference:1",
          preferences: [
            {
              referoId: "b11e1e78-3c62-45df-bf28-17c97718ed7d",
              version: 1,
              rank: 1,
              note: "Use the warm colors.",
            },
            {
              referoId: "other-style-id",
              version: 1,
              rank: 2,
              note: "Borrow the compact layout.",
            },
          ],
          overallNote: "Keep it premium but approachable.",
          sourceMode: "guided",
          fingerprint: "a".repeat(64),
        },
      },
    });
    const parsed = ReferenceSelectionStateSchema.parse(ranked);
    expect(parsed.selection?.selectedId).toBe(
      "b11e1e78-3c62-45df-bf28-17c97718ed7d",
    );
    expect(parsed.selection?.ranked?.preferences.map((item) => item.rank)).toEqual([
      1,
      2,
    ]);
  });

  it("rejects ranked preferences with gaps, duplicates, unknown candidates, or empty notes", () => {
    const base = {
      schemaVersion: 1,
      checkpointId: "run-1234:reference:1",
      overallNote: "Direction note",
      sourceMode: "guided",
      fingerprint: "a".repeat(64),
    };
    const rankedState = (preferences: unknown[]) =>
      selectionState({
        status: "selected",
        selection: {
          selectedId: "b11e1e78-3c62-45df-bf28-17c97718ed7d",
          selectionKind: "user-picked-recommended",
          version: 1,
          at: "2026-08-15T13:00:00.000Z",
          note: "Use the warm colors.",
          ranked: { ...base, preferences },
        },
      });
    const first = {
      referoId: "b11e1e78-3c62-45df-bf28-17c97718ed7d",
      version: 1,
      rank: 1,
      note: "Use the warm colors.",
    };

    expect(
      ReferenceSelectionStateSchema.safeParse(
        rankedState([{ ...first, rank: 2 }]),
      ).success,
    ).toBe(false);
    expect(
      ReferenceSelectionStateSchema.safeParse(
        rankedState([first, { ...first, rank: 2 }]),
      ).success,
    ).toBe(false);
    expect(
      ReferenceSelectionStateSchema.safeParse(
        rankedState([
          first,
          {
            referoId: "missing-style",
            version: 1,
            rank: 2,
            note: "Use the layout.",
          },
        ]),
      ).success,
    ).toBe(false);
    expect(
      ReferenceSelectionStateSchema.safeParse(
        rankedState([{ ...first, note: "  " }]),
      ).success,
    ).toBe(false);
  });

  it("rejects a reroll version that repeats an earlier version's candidate", () => {
    const rerolled = selectionState({
      rerollsUsed: 1,
      versions: [
        selectionState().versions[0],
        {
          version: 2,
          createdAt: "2026-08-15T12:30:00.000Z",
          searchAngles: ["a", "b", "c"],
          candidates: [
            candidate({ recommended: true }), // same referoId as version 1's first
            candidate({ referoId: "fresh-id", name: "Fresh" }),
          ],
          excludedFromPrior: [
            "b11e1e78-3c62-45df-bf28-17c97718ed7d",
            "other-style-id",
          ],
        },
      ],
    });
    expect(ReferenceSelectionStateSchema.safeParse(rerolled).success).toBe(false);
  });

  it("caps rerolls at two and bounds version count by the reservation counter", () => {
    const overCap = selectionState({ rerollsUsed: 3 });
    expect(ReferenceSelectionStateSchema.safeParse(overCap).success).toBe(false);

    // A spent reservation whose generation failed: 1 reroll used, still 1
    // version — VALID (the no-refund case the route persists mid-reroll).
    const spentReservation = selectionState({ rerollsUsed: 1 });
    expect(
      ReferenceSelectionStateSchema.safeParse(spentReservation).success
    ).toBe(true);

    // Both reservations spent on failed generations: still valid — blocking
    // this state would 500 the second reroll (review finding).
    const doubleSpent = selectionState({ rerollsUsed: 2 });
    expect(ReferenceSelectionStateSchema.safeParse(doubleSpent).success).toBe(
      true
    );

    // The reverse — more versions than reservations — is never legal.
    const phantomVersion = selectionState({
      rerollsUsed: 0,
      versions: [
        selectionState().versions[0],
        {
          version: 2,
          createdAt: "2026-08-15T12:30:00.000Z",
          searchAngles: ["a", "b", "c"],
          candidates: [
            candidate({ referoId: "fresh-1", recommended: true }),
            candidate({ referoId: "fresh-2", name: "Fresh" }),
          ],
          excludedFromPrior: [],
        },
      ],
    });
    expect(ReferenceSelectionStateSchema.safeParse(phantomVersion).success).toBe(
      false
    );
  });
});

describe("reference lock migration safety", () => {
  const historicalLock = {
    searchAngles: ["a", "b", "c"],
    primary: {
      referoId: "primary-style",
      kind: "style",
      name: "Primary",
      why: "Owner choice",
    },
    borrowedDetails: [],
    rejected: [],
    decisionLedger: [],
  };

  it("keeps historical locks valid and accepts an optional ranked ledger", () => {
    expect(ReferenceLockSchema.parse(historicalLock)).toEqual(historicalLock);
    expect(
      ReferenceLockSchema.safeParse({
        ...historicalLock,
        preferenceLedger: {
          schemaVersion: 1,
          preferences: [
            {
              referoId: "primary-style",
              version: 1,
              rank: 1,
              note: "Use the colors.",
            },
          ],
          overallNote: "Keep it restrained.",
        },
      }).success,
    ).toBe(true);
  });
});

describe("run-state migration safety (sibling state is additive-optional)", () => {
  const legacyRun = {
    id: "legacy-run-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    stages: Object.fromEntries(
      ["intake", "scanned", "locked", "synthesized", "built", "edited"].map(
        (stage) => [stage, { status: "pending", retries: 0, gateRepairAttempts: 0 }]
      )
    ),
    costUsd: 0,
    modelSlugs: {},
  };

  const v2Run = {
    ...legacyRun,
    id: "v2-run-1",
    pipelineVersion: "evidence-gated-v2",
    evidenceWorkflow: { currentStage: "evidence", artifacts: [] },
  };

  it("parses persisted runs that predate the picker fields entirely", () => {
    const legacy = RunStateSchema.safeParse(legacyRun);
    expect(legacy.success).toBe(true);
    if (legacy.success) {
      expect(legacy.data.referencePickerEnabled).toBe(false);
      expect(legacy.data.referenceSelection).toBeUndefined();
    }
    expect(RunStateSchema.safeParse(v2Run).success).toBe(true);
  });

  it("parses a new gated run carrying pending picker state", () => {
    const gated = {
      ...v2Run,
      id: "gated-run-1",
      referencePickerEnabled: true,
      referenceSelection: selectionState(),
    };
    expect(RunStateSchema.safeParse(gated).success).toBe(true);
  });
});
