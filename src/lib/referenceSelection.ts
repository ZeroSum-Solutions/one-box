import { createHash } from "node:crypto";
import {
  RankedReferencePreferenceSchema,
  ReferenceSelectionStateSchema,
  type RankedReferencePreference,
  type ReferenceSelectionState,
} from "./contracts";

export class ReferenceSelectionConflict extends Error {}
export class ReferenceSelectionInputError extends Error {}

export interface RankedSelectionInput {
  preferences: Array<{ referoId: string; note: string }>;
  overallNote?: string;
}

function canonicalRankedPayload(
  checkpointId: string,
  preferences: RankedReferencePreference[],
  overallNote: string | undefined,
): string {
  return JSON.stringify({
    checkpointId,
    preferences: preferences.map(({ referoId, version, rank, note }) => ({
      referoId,
      version,
      rank,
      note,
    })),
    ...(overallNote === undefined ? {} : { overallNote }),
  });
}

function fingerprintFor(
  checkpointId: string,
  preferences: RankedReferencePreference[],
  overallNote: string | undefined,
): string {
  return createHash("sha256")
    .update(canonicalRankedPayload(checkpointId, preferences, overallNote))
    .digest("hex");
}

function rankedPreferences(
  state: ReferenceSelectionState,
  input: RankedSelectionInput,
): RankedReferencePreference[] {
  if (input.preferences.length < 1 || input.preferences.length > 3) {
    throw new ReferenceSelectionInputError(
      "choose between one and three reference candidates",
    );
  }
  const seen = new Set<string>();
  return input.preferences.map((preference, index) => {
    if (seen.has(preference.referoId)) {
      throw new ReferenceSelectionInputError(
        "ranked reference candidates must be unique",
      );
    }
    seen.add(preference.referoId);
    const version = state.versions.find((entry) =>
      entry.candidates.some(
        (candidate) => candidate.referoId === preference.referoId,
      ),
    );
    if (!version) {
      throw new ReferenceSelectionInputError(
        "ranked reference candidate was not shown",
      );
    }
    const parsed = RankedReferencePreferenceSchema.safeParse({
      referoId: preference.referoId,
      version: version.version,
      rank: index + 1,
      note: preference.note,
    });
    if (!parsed.success) {
      throw new ReferenceSelectionInputError(
        parsed.error.issues[0]?.message ?? "invalid ranked reference preference",
      );
    }
    return parsed.data;
  });
}

export function commitRankedReferenceSelection(options: {
  state: ReferenceSelectionState;
  runId: string;
  input: RankedSelectionInput;
  now: Date;
}): { kind: "created" | "idempotent"; state: ReferenceSelectionState } {
  const { state, runId, input, now } = options;
  if (!/^[a-z0-9_-]{4,40}$/i.test(runId)) {
    throw new ReferenceSelectionInputError("bad run id");
  }
  const preferences = rankedPreferences(state, input);
  const overallNote = input.overallNote?.trim() || undefined;
  if (overallNote && overallNote.length > 2_000) {
    throw new ReferenceSelectionInputError("overall reference note is too long");
  }
  const checkpointId = `${runId}:reference:${state.versions
    .map((version) => version.version)
    .join("-")}`;
  const fingerprint = fingerprintFor(checkpointId, preferences, overallNote);

  if (state.status === "selected") {
    if (state.selection?.ranked?.fingerprint === fingerprint) {
      return { kind: "idempotent", state };
    }
    throw new ReferenceSelectionConflict(
      "a different reference selection has already been recorded",
    );
  }

  const primary = preferences[0];
  const version = state.versions.find(
    (entry) => entry.version === primary.version,
  );
  const candidate = version?.candidates.find(
    (entry) => entry.referoId === primary.referoId,
  );
  if (!candidate) {
    throw new ReferenceSelectionInputError(
      "primary reference candidate was not shown",
    );
  }

  const next = ReferenceSelectionStateSchema.parse({
    ...state,
    status: "selected",
    selection: {
      selectedId: primary.referoId,
      selectionKind: candidate.recommended
        ? "user-picked-recommended"
        : "user-picked-other",
      version: primary.version,
      at: now.toISOString(),
      note: primary.note,
      ranked: {
        schemaVersion: 1,
        checkpointId,
        preferences,
        overallNote,
        sourceMode: "guided",
        fingerprint,
      },
    },
  });
  return { kind: "created", state: next };
}

export function normalizeReferencePreferences(state: ReferenceSelectionState): {
  preferences: RankedReferencePreference[];
  overallNote?: string;
} {
  if (state.status !== "selected" || !state.selection) {
    throw new Error("reference selection is not complete");
  }
  if (state.selection.ranked) {
    return {
      preferences: state.selection.ranked.preferences,
      overallNote: state.selection.ranked.overallNote,
    };
  }
  return {
    preferences: [
      RankedReferencePreferenceSchema.parse({
        referoId: state.selection.selectedId,
        version: state.selection.version,
        rank: 1,
        note: state.selection.note?.trim() || "Owner selected this direction.",
      }),
    ],
    overallNote: undefined,
  };
}
