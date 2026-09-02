import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const referenceStageMocks = vi.hoisted(() => ({ stageLockCandidates: vi.fn() }));

vi.mock("../../../lib/referenceStage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/referenceStage")>();
  return { ...actual, stageLockCandidates: referenceStageMocks.stageLockCandidates };
});

import { GET, POST } from "./[id]/route";
import {
  createRun,
  loadRun,
  saveArtifact,
  sitePaths,
  withRunTransaction,
} from "../../../lib/runstate";
import {
  ARTIFACTS,
  IntakeSchema,
  ReferenceSelectionStateSchema,
  ReferenceSelectionVersionSchema,
} from "../../../lib/contracts";

const runIds: string[] = [];

function candidate(referoId: string, recommended: boolean) {
  return {
    referoId,
    kind: "style" as const,
    name: `${referoId} direction`,
    sourceUrl: `https://refero.design/${referoId}`,
    previewImageUrl: `https://images.refero.design/${referoId}.jpg`,
    foundVia: "a test search angle",
    palette: [
      { hex: "#112233", plainLabel: "the dark anchor" },
      { hex: "#ddeeff", plainLabel: "the light backdrop" },
    ],
    plainLanguageProfile: {
      headline: `${referoId} feel`,
      feelSummary: "Clear and welcoming.",
      bestFor: ["A local business"],
    },
    composition: {
      northStar: "Keep the opening clear.",
      preserveTraits: ["Clear calls to action", "Comfortable breathing room"],
      rhythmNote: "Alternate detail and pause.",
    },
    recommended,
    ...(recommended ? { recommendedWhy: "Best fit for the brief." } : {}),
  };
}

function initialVersion() {
  return ReferenceSelectionVersionSchema.parse({
    version: 1,
    createdAt: "2026-08-15T12:00:00.000Z",
    searchAngles: ["first angle", "second angle", "third angle"],
    candidates: [candidate("recommended", true), candidate("other", false)],
  });
}

function rerollVersion() {
  return ReferenceSelectionVersionSchema.parse({
    version: 2,
    createdAt: "2026-08-15T12:05:00.000Z",
    searchAngles: ["new first angle", "new second angle", "new third angle"],
    candidates: [candidate("fresh-recommended", true), candidate("fresh-other", false)],
    excludedFromPrior: ["recommended", "other"],
  });
}

async function fixtureRun() {
  const runId = await createRun({ referencePickerEnabled: true });
  runIds.push(runId);
  await withRunTransaction(runId, async (transaction) => {
    transaction.state.referenceSelection = ReferenceSelectionStateSchema.parse({
      status: "pending",
      rerollsUsed: 0,
      versions: [initialVersion()],
    });
  });
  return runId;
}

async function savePickerIntake(runId: string) {
  const intake = IntakeSchema.parse({
    businessName: "Picker Co",
    category: "service",
    location: "Austin, TX",
    services: ["Help"],
    primaryAction: "quote",
  });
  await saveArtifact(runId, ARTIFACTS.intake, intake);
  return intake;
}

function context(runId: string) {
  return { params: Promise.resolve({ id: runId }) };
}

function request(runId: string, body: unknown) {
  return new Request(`http://localhost:3000/api/reference/${runId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
      Host: "localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  referenceStageMocks.stageLockCandidates.mockReset();
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true })
    )
  );
});

describe("reference picker route", () => {
  it("records feedback against the current reference-selection version without selecting it", async () => {
    const runId = await fixtureRun();
    const feedbackId = "11111111-1111-4111-8111-111111111111";

    const response = await POST(
      request(runId, {
        action: "record-feedback",
        feedbackId,
        text: "Use the quieter color direction.",
        uploadSession: null,
        uploadIds: [],
      }),
      context(runId),
    );

    expect(response.status).toBe(200);
    expect((await loadRun(runId)).referenceSelection?.status).toBe("pending");
    await expect(
      fs.readFile(
        path.join(sitePaths(runId).root, "evidence", "review-feedback", `${feedbackId}.json`),
        "utf8",
      ).then(JSON.parse),
    ).resolves.toMatchObject({
      id: feedbackId,
      stage: "evidence",
      artifactType: "reference-selection",
      artifactVersion: 1,
      text: "Use the quieter color direction.",
    });
  });

  it("returns the persisted picker state for workspace polling", async () => {
    const runId = await fixtureRun();

    const response = await GET(
      new Request(`http://localhost:3000/api/reference/${runId}`, {
        headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
      }),
      context(runId)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      runId,
      referenceSelection: { status: "pending", rerollsUsed: 0 },
    });
  });

  it("selects the recommended candidate and records the resume hint", async () => {
    const runId = await fixtureRun();

    const response = await POST(
      request(runId, { action: "select", selectedId: "recommended", note: "Use this." }),
      context(runId)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      resumeUrl: "/api/run",
      resumeMethod: "POST",
      referenceSelection: {
        status: "selected",
        selection: {
          selectedId: "recommended",
          selectionKind: "user-picked-recommended",
          version: 1,
          note: "Use this.",
        },
      },
    });
    expect((await loadRun(runId)).referenceSelection).toMatchObject({
      status: "selected",
      selection: {
        selectedId: "recommended",
        selectionKind: "user-picked-recommended",
      },
    });
  });

  it("persists an ordered ranked selection with rank-one compatibility fields", async () => {
    const runId = await fixtureRun();
    const response = await POST(
      request(runId, {
        action: "select-ranked",
        preferences: [
          { referoId: "other", note: "Use the layout." },
          { referoId: "recommended", note: "Borrow the color discipline." },
        ],
        overallNote: "Keep the page simple.",
      }),
      context(runId),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      resumeUrl: "/api/run",
      resumeMethod: "POST",
      referenceSelection: {
        status: "selected",
        selection: {
          selectedId: "other",
          selectionKind: "user-picked-other",
          version: 1,
          note: "Use the layout.",
          ranked: {
            schemaVersion: 1,
            sourceMode: "guided",
            overallNote: "Keep the page simple.",
            preferences: [
              { referoId: "other", version: 1, rank: 1, note: "Use the layout." },
              {
                referoId: "recommended",
                version: 1,
                rank: 2,
                note: "Borrow the color discipline.",
              },
            ],
          },
        },
      },
    });
  });

  it("returns an identical ranked retry without changing the selection timestamp", async () => {
    const runId = await fixtureRun();
    const body = {
      action: "select-ranked",
      preferences: [{ referoId: "recommended", note: "Use the colors." }],
    };
    const first = await POST(request(runId, body), context(runId));
    expect(first.status).toBe(200);
    const firstAt = (await loadRun(runId)).referenceSelection?.selection?.at;

    const retry = await POST(request(runId, body), context(runId));
    expect(retry.status).toBe(200);
    expect((await loadRun(runId)).referenceSelection?.selection?.at).toBe(firstAt);
  });

  it("rejects cross-mode selection conflicts without changing the first checkpoint", async () => {
    const rankedRun = await fixtureRun();
    await POST(
      request(rankedRun, {
        action: "select-ranked",
        preferences: [{ referoId: "recommended", note: "Use the colors." }],
      }),
      context(rankedRun),
    );
    const legacyAfterRanked = await POST(
      request(rankedRun, { action: "select", selectedId: "recommended" }),
      context(rankedRun),
    );
    expect(legacyAfterRanked.status).toBe(409);

    const legacyRun = await fixtureRun();
    await POST(
      request(legacyRun, { action: "select", selectedId: "recommended" }),
      context(legacyRun),
    );
    const rankedAfterLegacy = await POST(
      request(legacyRun, {
        action: "select-ranked",
        preferences: [{ referoId: "recommended", note: "Use the colors." }],
      }),
      context(legacyRun),
    );
    expect(rankedAfterLegacy.status).toBe(409);
  });

  it("rejects malformed ranked selection input", async () => {
    const runId = await fixtureRun();
    const response = await POST(
      request(runId, {
        action: "select-ranked",
        preferences: [
          { referoId: "recommended", note: "Use the colors." },
          { referoId: "recommended", note: "Use the layout." },
        ],
      }),
      context(runId),
    );
    expect(response.status).toBe(400);
    expect((await loadRun(runId)).referenceSelection?.status).toBe("pending");
  });

  it("derives user-picked-other for a non-recommended candidate", async () => {
    const runId = await fixtureRun();

    const response = await POST(
      request(runId, { action: "select", selectedId: "other" }),
      context(runId)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      referenceSelection: {
        selection: {
          selectedId: "other",
          selectionKind: "user-picked-other",
          version: 1,
        },
      },
    });
  });

  it("rejects a candidate missing from the latest version", async () => {
    const runId = await fixtureRun();

    const response = await POST(
      request(runId, { action: "select", selectedId: "missing" }),
      context(runId)
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/among the shown options/i),
    });
  });

  it("rejects a second selection of a different candidate", async () => {
    const runId = await fixtureRun();
    await POST(request(runId, { action: "select", selectedId: "recommended" }), context(runId));

    const response = await POST(
      request(runId, { action: "select", selectedId: "other" }),
      context(runId)
    );

    expect(response.status).toBe(409);
  });

  it("accepts a second selection of the already selected candidate", async () => {
    const runId = await fixtureRun();
    await POST(request(runId, { action: "select", selectedId: "recommended" }), context(runId));

    const response = await POST(
      request(runId, { action: "select", selectedId: "recommended" }),
      context(runId)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      referenceSelection: {
        selection: { selectedId: "recommended", selectionKind: "user-picked-recommended" },
      },
    });
  });

  it("rejects a cross-origin request", async () => {
    const runId = await fixtureRun();
    const response = await POST(
      new Request(`http://localhost:3000/api/reference/${runId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
          "Sec-Fetch-Site": "cross-site",
          Host: "localhost:3000",
        },
        body: JSON.stringify({ action: "select", selectedId: "recommended" }),
      }),
      context(runId)
    );

    expect(response.status).toBe(403);
  });

  it("rejects a non-Website selection before changing picker state", async () => {
    const runId = await fixtureRun();
    await saveArtifact(
      runId,
      ARTIFACTS.intake,
      IntakeSchema.parse({
        businessName: "Legacy App",
        category: "service",
        location: "Austin, TX",
        services: ["Help"],
        primaryAction: "quote",
        projectTarget: "web-app",
      })
    );

    const response = await POST(
      request(runId, { action: "select", selectedId: "recommended" }),
      context(runId)
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "unsupported-project-target",
      projectTarget: "web-app",
    });
    expect((await loadRun(runId)).referenceSelection?.status).toBe("pending");
    expect(referenceStageMocks.stageLockCandidates).not.toHaveBeenCalled();
  });

  it("reserves a reroll before a generation failure and does not refund it", async () => {
    const runId = await fixtureRun();
    await savePickerIntake(runId);
    referenceStageMocks.stageLockCandidates.mockRejectedValueOnce(
      new Error("Refero temporarily unavailable")
    );

    await expect(
      POST(request(runId, { action: "reroll" }), context(runId))
    ).rejects.toThrow("Refero temporarily unavailable");

    expect((await loadRun(runId)).referenceSelection).toMatchObject({
      status: "pending",
      rerollsUsed: 1,
      versions: [expect.anything()],
    });
  });

  it("lets the owner go back and pick a direction from an earlier version", async () => {
    // Soak feedback 2026-08-15: after a reroll, earlier looks must stay
    // choosable — the selection binds to the version that contains the pick.
    const runId = await fixtureRun();
    await withRunTransaction(runId, async (transaction) => {
      transaction.state.referenceSelection = ReferenceSelectionStateSchema.parse({
        status: "pending",
        rerollsUsed: 1,
        versions: [initialVersion(), rerollVersion()],
      });
    });

    const response = await POST(
      request(runId, { action: "select", selectedId: "other" }),
      context(runId)
    );

    expect(response.status).toBe(200);
    expect((await loadRun(runId)).referenceSelection).toMatchObject({
      status: "selected",
      selection: { selectedId: "other", version: 1, selectionKind: "user-picked-other" },
    });
  });

  it("allows the second reservation after a failed first reroll and keeps versions linear", async () => {
    // Regression (review finding): a spent-but-failed reroll used to make the
    // NEXT reservation unpersistable (versions.length < rerollsUsed rejected)
    // and would have numbered the next version rerollsUsed+1, breaking
    // linearity.
    const runId = await fixtureRun();
    await savePickerIntake(runId);
    referenceStageMocks.stageLockCandidates.mockResolvedValueOnce(null);
    const failed = await POST(request(runId, { action: "reroll" }), context(runId));
    expect(await failed.json()).toMatchObject({ ok: false, reason: "no-fresh-directions" });

    const nextVersion = rerollVersion();
    referenceStageMocks.stageLockCandidates.mockResolvedValueOnce(nextVersion);
    const response = await POST(request(runId, { action: "reroll" }), context(runId));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    const lastCall = referenceStageMocks.stageLockCandidates.mock.calls.at(-1);
    expect(lastCall?.[3]).toMatchObject({ version: 2 });
    expect((await loadRun(runId)).referenceSelection).toMatchObject({
      status: "pending",
      rerollsUsed: 2,
      versions: [expect.anything(), expect.objectContaining({ version: 2 })],
    });
  });

  it("rejects a reroll when both reservations are already spent", async () => {
    const runId = await fixtureRun();
    await withRunTransaction(runId, async (transaction) => {
      transaction.state.referenceSelection = ReferenceSelectionStateSchema.parse({
        status: "pending",
        rerollsUsed: 2,
        versions: [initialVersion(), rerollVersion()],
      });
    });

    const response = await POST(request(runId, { action: "reroll" }), context(runId));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "no rerolls remaining" });
  });

  it("appends a fresh reroll version after reserving it", async () => {
    const runId = await fixtureRun();
    const intake = await savePickerIntake(runId);
    const nextVersion = rerollVersion();
    referenceStageMocks.stageLockCandidates.mockResolvedValueOnce(nextVersion);

    const response = await POST(
      request(runId, { action: "reroll", revisionNote: "Show a different direction." }),
      context(runId)
    );

    expect(response.status).toBe(200);
    expect(referenceStageMocks.stageLockCandidates).toHaveBeenCalledWith(
      runId,
      intake,
      expect.any(Function),
      {
        version: 2,
        revisionNote: "Show a different direction.",
        excludedIds: ["recommended", "other"],
      }
    );
    expect(await response.json()).toMatchObject({ ok: true, version: nextVersion });
    expect((await loadRun(runId)).referenceSelection).toMatchObject({
      rerollsUsed: 1,
      versions: [expect.anything(), nextVersion],
    });
  });

  it("keeps a spent reservation when no fresh directions are available", async () => {
    const runId = await fixtureRun();
    await savePickerIntake(runId);
    referenceStageMocks.stageLockCandidates.mockResolvedValueOnce(null);

    const response = await POST(request(runId, { action: "reroll" }), context(runId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "no-fresh-directions",
    });
    expect((await loadRun(runId)).referenceSelection).toMatchObject({
      status: "pending",
      rerollsUsed: 1,
      versions: [expect.anything()],
    });
  });
});
