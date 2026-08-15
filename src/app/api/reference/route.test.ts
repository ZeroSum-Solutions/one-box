import fs from "node:fs/promises";
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
      error: expect.stringMatching(/latest version/i),
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
