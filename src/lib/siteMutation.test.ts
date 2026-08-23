import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidateApprovedVisualQaUnderSiteAuthority: vi.fn(),
}));

vi.mock("./runstate", () => ({
  invalidateApprovedVisualQaUnderSiteAuthority:
    mocks.invalidateApprovedVisualQaUnderSiteAuthority,
  RunNotFoundError: class RunNotFoundError extends Error {},
  sitePaths: (runId: string) => ({
    root: `/tmp/onebox-site-mutation-locks/${runId}`,
    site: `/tmp/onebox-site-mutation-locks/${runId}/site`,
  }),
}));

import { BlockingMutationError, runGuardedMutation } from "./siteMutation";
import {
  CANDIDATE_GATE_EXPECTATIONS,
  CandidateGateReceiptV1Schema,
  CandidateProvenanceV1Schema,
} from "./contracts";

const tempDirectories: string[] = [];

afterEach(async () => {
  mocks.invalidateApprovedVisualQaUnderSiteAuthority.mockReset();
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("committed site mutation visual-QA invalidation", () => {
  it("invalidates only after the candidate passes mechanical gates and commits", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-mutation-"));
    tempDirectories.push(directory);
    const target = path.join(directory, "index.html");
    await fs.writeFile(target, "before");
    const order: string[] = [];
    mocks.invalidateApprovedVisualQaUnderSiteAuthority.mockImplementation(async () => {
      order.push("invalidate");
      return true;
    });

    await runGuardedMutation({
      runId: "test-run",
      snapshotPaths: [target],
      mutate: async () => {
        await fs.writeFile(target, "after");
        return "candidate";
      },
      gateRunner: async () => [],
      commit: async () => {
        order.push("commit");
      },
    });

    expect(order).toEqual(["commit", "invalidate"]);
    expect(
      mocks.invalidateApprovedVisualQaUnderSiteAuthority,
    ).toHaveBeenCalledWith("test-run");
  });

  it("does not invalidate a rejected candidate", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-mutation-"));
    tempDirectories.push(directory);
    const target = path.join(directory, "index.html");
    await fs.writeFile(target, "before");

    await expect(
      runGuardedMutation({
        runId: "test-run",
        snapshotPaths: [target],
        mutate: async () => {
          await fs.writeFile(target, "rejected");
        },
        gateRunner: async () => [{
          gate: "axe",
          pass: false,
          blocking: true,
          details: ["blocked"],
          ranAt: "2026-08-13T12:00:00.000Z",
        }],
      })
    ).rejects.toBeInstanceOf(BlockingMutationError);

    expect(
      mocks.invalidateApprovedVisualQaUnderSiteAuthority,
    ).not.toHaveBeenCalled();
    expect(await fs.readFile(target, "utf8")).toBe("before");
  });
});

// A build that fails a blocking gate is still served and still offers a full
// editor, and every edit then refuses on the gate the site arrived with. Both
// cases used to read identically, which sent the owner looking for a fault in
// an edit that was never the cause. Refusal is unchanged — blocking gates stay
// invariants (audit P1); only the account of what failed is now accurate.
describe("blocking-gate refusal distinguishes inherited failures", () => {
  const runId = "gate-baseline-run";
  const runRoot = `/tmp/onebox-site-mutation-locks/${runId}`;

  async function attempt(failingGate: string): Promise<BlockingMutationError> {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-mutation-"));
    tempDirectories.push(directory);
    const target = path.join(directory, "index.html");
    await fs.writeFile(target, "before");
    try {
      await runGuardedMutation({
        runId,
        snapshotPaths: [target],
        mutate: async () => fs.writeFile(target, "candidate"),
        gateRunner: async () => [
          {
            gate: failingGate,
            pass: false,
            blocking: true,
            details: ["blocked"],
            ranAt: "2026-08-17T12:00:00.000Z",
          },
        ],
      });
    } catch (error) {
      return error as BlockingMutationError;
    }
    throw new Error("expected the mutation to be refused");
  }

  async function writeBaseline(reports: Array<{ gate: string; pass: boolean }>) {
    await fs.mkdir(runRoot, { recursive: true });
    await fs.writeFile(
      path.join(runRoot, "gates.json"),
      JSON.stringify(
        reports.map((report) => ({ ...report, blocking: true, details: [], ranAt: "x" }))
      )
    );
  }

  async function writePromotedCanonicalBaseline(): Promise<void> {
    const manifestHash = "a".repeat(64);
    const buildHash = "b".repeat(64);
    const receipt = CandidateGateReceiptV1Schema.parse({
      schemaVersion: 1,
      runId,
      candidateManifestSha256: manifestHash,
      buildSha256: buildHash,
      reports: CANDIDATE_GATE_EXPECTATIONS.map(({ gate, blocking }) => ({
        gate,
        blocking,
        pass: true,
        details: [],
        ranAt: "2026-08-22T00:00:01.000Z",
      })),
    });
    const receiptBytes = Buffer.from(JSON.stringify(receipt, null, 2));
    const provenance = CandidateProvenanceV1Schema.parse({
      schemaVersion: 1,
      candidateId: `${runId}-candidate`,
      runId,
      createdAt: "2026-08-22T00:00:00.000Z",
      state: "promoted",
      history: [
        { state: "preparing", at: "2026-08-22T00:00:00.000Z" },
        { state: "ready-for-gates", at: "2026-08-22T00:00:01.000Z" },
        { state: "promotable", at: "2026-08-22T00:00:02.000Z" },
        { state: "promoted", at: "2026-08-22T00:00:03.000Z" },
      ],
      inputArtifactHashes: [{ path: "intake.json", sha256: "c".repeat(64) }],
      layoutAuthority: "template-v1",
      compilerVersion: "fixture-v1",
      candidateManifestSha256: manifestHash,
      buildSha256: buildHash,
      gateReportSha256: createHash("sha256").update(receiptBytes).digest("hex"),
      promotedBuildSha256: buildHash,
    });
    const metadata = path.join(runRoot, "site", ".one-box");
    await fs.mkdir(metadata, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(metadata, "gates.json"), receiptBytes),
      fs.writeFile(path.join(metadata, "provenance.json"), JSON.stringify(provenance, null, 2)),
    ]);
  }

  afterEach(async () => {
    await fs.rm(runRoot, { recursive: true, force: true });
  });

  it("names the change when the failure is new", async () => {
    await writeBaseline([{ gate: "token-drift", pass: true }]);
    const error = await attempt("token-drift");
    expect(error.message).toBe("blocking gates rejected the change: token-drift");
    expect(error.regressions).toEqual(["token-drift"]);
    expect(error.preexisting).toEqual([]);
  });

  it("says the site was already failing when the edit did not cause it", async () => {
    await writeBaseline([{ gate: "token-drift", pass: false }]);
    const error = await attempt("token-drift");
    expect(error.message).toContain("already failing token-drift");
    expect(error.message).not.toContain("rejected the change");
    expect(error.preexisting).toEqual(["token-drift"]);
    expect(error.regressions).toEqual([]);
  });

  it("ignores an opposite root compatibility copy for a promoted edit baseline", async () => {
    await writeBaseline([{ gate: "token-drift", pass: false }]);
    await writePromotedCanonicalBaseline();

    const error = await attempt("token-drift");

    expect(error.message).toBe("blocking gates rejected the change: token-drift");
    expect(error.regressions).toEqual(["token-drift"]);
    expect(error.preexisting).toEqual([]);
  });
});
