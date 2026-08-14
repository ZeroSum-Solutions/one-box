import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IntakeAttemptConflict,
  canonicalRequestFingerprint,
  inspectIntakeAttempt,
  reserveIntakeAttempt,
  runIntakeAttempt,
} from "./intakeAttempts";

const roots: string[] = [];
const ATTEMPT_ID = "018f3f39-d1e2-7c3a-9b4d-5e6f708192a3";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function attemptRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "one-box-intake-attempt-"));
  roots.push(root);
  return root;
}

describe("intake attempt state machine", () => {
  it("canonically fingerprints equivalent objects", () => {
    expect(canonicalRequestFingerprint({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalRequestFingerprint({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it("rejects an attempt id reused for a different request", async () => {
    const root = await attemptRoot();
    await reserveIntakeAttempt(ATTEMPT_ID, "a".repeat(64), root);
    await expect(
      reserveIntakeAttempt(ATTEMPT_ID, "b".repeat(64), root)
    ).rejects.toBeInstanceOf(IntakeAttemptConflict);
  });

  it("inspects without creating an orphan reservation", async () => {
    const root = await attemptRoot();
    const fingerprint = "a".repeat(64);
    await expect(
      inspectIntakeAttempt(ATTEMPT_ID, fingerprint, root)
    ).resolves.toBeUndefined();
    await expect(
      reserveIntakeAttempt(ATTEMPT_ID, fingerprint, root)
    ).resolves.toMatchObject({ state: "reserved" });
  });

  it("persists the run id before work and resumes it after an interrupted attempt", async () => {
    const root = await attemptRoot();
    const fingerprint = "a".repeat(64);
    const allocateRunId = vi.fn().mockReturnValue("reserved-run");
    await reserveIntakeAttempt(ATTEMPT_ID, fingerprint, root);
    await expect(
      runIntakeAttempt(
        ATTEMPT_ID,
        fingerprint,
        async (runId) => {
          expect(runId).toBe("reserved-run");
          throw new Error("crash after side effects");
        },
        root,
        allocateRunId
      )
    ).rejects.toThrow("crash after side effects");

    await expect(
      runIntakeAttempt(
        ATTEMPT_ID,
        fingerprint,
        async (runId) => ({ runId, started: true }),
        root,
        allocateRunId
      )
    ).resolves.toEqual({ runId: "reserved-run", started: true });
    expect(allocateRunId).toHaveBeenCalledOnce();
  });

  it("serializes concurrent repeats and replays the completed result", async () => {
    const root = await attemptRoot();
    const fingerprint = "a".repeat(64);
    const operation = vi.fn(async (runId: string) => ({ runId, started: true as const }));
    await reserveIntakeAttempt(ATTEMPT_ID, fingerprint, root);

    const results = await Promise.all([
      runIntakeAttempt(ATTEMPT_ID, fingerprint, operation, root, () => "only-run"),
      runIntakeAttempt(ATTEMPT_ID, fingerprint, operation, root, () => "duplicate-run"),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toMatchObject({ started: true });
    expect(operation).toHaveBeenCalledOnce();
  });
});
