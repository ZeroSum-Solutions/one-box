import { describe, expect, it } from "vitest";
import { ReferenceSelectionStateSchema, type ReferenceSelectionState } from "./contracts";
import {
  ReferenceSelectionConflict,
  commitRankedReferenceSelection,
  normalizeReferencePreferences,
} from "./referenceSelection";

function candidate(referoId: string, recommended = false) {
  return {
    referoId,
    kind: "style" as const,
    name: referoId,
    foundVia: "test",
    palette: [
      { hex: "#08090a", plainLabel: "background" },
      { hex: "#d8ff3e", plainLabel: "action" },
    ],
    plainLanguageProfile: {
      headline: `${referoId} direction`,
      feelSummary: "A specific visual direction.",
      bestFor: ["testing"],
      headsUp: [],
    },
    composition: {
      northStar: "Instrument panel",
      preserveTraits: ["strong hierarchy", "clear action"],
      rhythmNote: "Steady rhythm",
    },
    recommended,
    ...(recommended ? { recommendedWhy: "best fit" } : {}),
  };
}

function pendingState(): ReferenceSelectionState {
  return ReferenceSelectionStateSchema.parse({
    status: "pending",
    rerollsUsed: 1,
    versions: [
      {
        version: 1,
        createdAt: "2026-08-25T10:00:00.000Z",
        searchAngles: ["a", "b", "c"],
        candidates: [candidate("primary", true), candidate("secondary")],
      },
      {
        version: 2,
        createdAt: "2026-08-25T10:05:00.000Z",
        searchAngles: ["d", "e", "f"],
        candidates: [candidate("third", true), candidate("fourth")],
        excludedFromPrior: ["primary", "secondary"],
      },
    ],
  });
}

describe("ranked reference selection", () => {
  it("derives compatibility fields, versions, ranks, and server metadata", () => {
    const committed = commitRankedReferenceSelection({
      state: pendingState(),
      runId: "run-1234",
      input: {
        preferences: [
          { referoId: "primary", note: " Use the colors. " },
          { referoId: "third", note: "Borrow the editorial layout." },
        ],
        overallNote: " Keep it restrained. ",
      },
      now: new Date("2026-08-25T11:00:00.000Z"),
    });

    expect(committed.kind).toBe("created");
    expect(committed.state.selection).toMatchObject({
      selectedId: "primary",
      selectionKind: "user-picked-recommended",
      version: 1,
      at: "2026-08-25T11:00:00.000Z",
      note: "Use the colors.",
      ranked: {
        schemaVersion: 1,
        checkpointId: "run-1234:reference:1-2",
        sourceMode: "guided",
        overallNote: "Keep it restrained.",
        preferences: [
          { referoId: "primary", version: 1, rank: 1, note: "Use the colors." },
          { referoId: "third", version: 2, rank: 2, note: "Borrow the editorial layout." },
        ],
      },
    });
    expect(committed.state.selection?.ranked?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("treats a semantically identical retry as idempotent", () => {
    const first = commitRankedReferenceSelection({
      state: pendingState(),
      runId: "run-1234",
      input: { preferences: [{ referoId: "primary", note: "Use the colors." }] },
      now: new Date("2026-08-25T11:00:00.000Z"),
    });
    const retry = commitRankedReferenceSelection({
      state: first.state,
      runId: "run-1234",
      input: { preferences: [{ referoId: "primary", note: " Use the colors. " }] },
      now: new Date("2026-08-25T12:00:00.000Z"),
    });

    expect(retry.kind).toBe("idempotent");
    expect(retry.state).toEqual(first.state);
  });

  it("rejects a conflicting ranked or legacy checkpoint", () => {
    const first = commitRankedReferenceSelection({
      state: pendingState(),
      runId: "run-1234",
      input: { preferences: [{ referoId: "primary", note: "Use the colors." }] },
      now: new Date("2026-08-25T11:00:00.000Z"),
    });
    expect(() =>
      commitRankedReferenceSelection({
        state: first.state,
        runId: "run-1234",
        input: { preferences: [{ referoId: "secondary", note: "Use the layout." }] },
        now: new Date("2026-08-25T12:00:00.000Z"),
      }),
    ).toThrow(ReferenceSelectionConflict);

    const legacy = ReferenceSelectionStateSchema.parse({
      ...pendingState(),
      status: "selected",
      selection: {
        selectedId: "primary",
        selectionKind: "user-picked-recommended",
        version: 1,
        at: "2026-08-25T11:00:00.000Z",
      },
    });
    expect(() =>
      commitRankedReferenceSelection({
        state: legacy,
        runId: "run-1234",
        input: { preferences: [{ referoId: "primary", note: "Use the colors." }] },
        now: new Date("2026-08-25T12:00:00.000Z"),
      }),
    ).toThrow(ReferenceSelectionConflict);
  });

  it("rejects duplicates, missing candidates, and empty notes", () => {
    for (const preferences of [
      [
        { referoId: "primary", note: "Use the colors." },
        { referoId: "primary", note: "Use the layout." },
      ],
      [{ referoId: "missing", note: "Use the layout." }],
      [{ referoId: "primary", note: " " }],
    ]) {
      expect(() =>
        commitRankedReferenceSelection({
          state: pendingState(),
          runId: "run-1234",
          input: { preferences },
          now: new Date("2026-08-25T12:00:00.000Z"),
        }),
      ).toThrow();
    }
  });

  it("normalizes a historical single selection in memory", () => {
    const legacy = ReferenceSelectionStateSchema.parse({
      ...pendingState(),
      status: "selected",
      selection: {
        selectedId: "secondary",
        selectionKind: "user-picked-other",
        version: 1,
        at: "2026-08-25T11:00:00.000Z",
        note: "Use the layout.",
      },
    });
    expect(normalizeReferencePreferences(legacy)).toEqual({
      preferences: [
        { referoId: "secondary", version: 1, rank: 1, note: "Use the layout." },
      ],
      overallNote: undefined,
    });
    expect(legacy.selection).not.toHaveProperty("ranked");
  });
});
