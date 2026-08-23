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
  LayoutAuthorityMismatchError: class LayoutAuthorityMismatchError extends Error {},
  loadRun: async () => ({ layoutAuthority: "template-v1" }),
  assertRunLayoutAuthority: (
    state: { layoutAuthority: string },
    expected: string,
  ) => {
    if (state.layoutAuthority !== expected) throw new Error("authority mismatch");
  },
  sitePaths: (runId: string) => ({
    root: `/tmp/onebox-site-mutation-locks/${runId}`,
    site: `/tmp/onebox-site-mutation-locks/${runId}/site`,
  }),
  candidatePaths: (runId: string) => ({
    root: `/tmp/onebox-site-mutation-locks/${runId}/candidate`,
    site: `/tmp/onebox-site-mutation-locks/${runId}/candidate/site`,
    manifest: `/tmp/onebox-site-mutation-locks/${runId}/candidate/manifest.json`,
    provenance: `/tmp/onebox-site-mutation-locks/${runId}/candidate/provenance.json`,
    gates: `/tmp/onebox-site-mutation-locks/${runId}/candidate/gates.json`,
  }),
}));

import {
  atomicWriteGeneratedSiteFile,
  BlockingMutationError,
  runGuardedMutation,
  withSiteAuthorityLock,
} from "./siteMutation";
import {
  candidateManifestSha256,
  createCandidateManifest,
} from "./candidate";
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

describe("generated-site mutation write authority", () => {
  it("fails closed before a live write attempted outside runGuardedMutation", async () => {
    const siteRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onebox-live-write-authority-"),
    );
    tempDirectories.push(siteRoot);
    const target = path.join(siteRoot, "index.html");
    await expect(
      async () => atomicWriteGeneratedSiteFile("test-run", target, "blocked"),
    ).rejects.toThrow(
      "generated-site live writes require an active guarded mutation",
    );
    await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not grant mutation context to a plain compiler/promotion/recovery site lock", async () => {
    const runId = "authority-plain-lock";
    const siteRoot = `/tmp/onebox-site-mutation-locks/${runId}/site`;
    tempDirectories.push(path.dirname(siteRoot));
    const target = path.join(siteRoot, "index.html");

    await expect(
      withSiteAuthorityLock(runId, () =>
        atomicWriteGeneratedSiteFile(runId, target, "blocked"),
      ),
    ).rejects.toThrow(
      "generated-site live writes require an active guarded mutation",
    );
    await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("writes atomically inside runGuardedMutation under the existing site lock", async () => {
    const runId = "authority-guarded-write";
    const siteRoot = `/tmp/onebox-site-mutation-locks/${runId}/site`;
    tempDirectories.push(path.dirname(siteRoot));
    const target = path.join(siteRoot, "index.html");

    await runGuardedMutation({
      runId,
      snapshotPaths: [target],
      mutate: () =>
        atomicWriteGeneratedSiteFile(runId, target, "committed"),
      gateRunner: async () => [],
    });

    expect(await fs.readFile(target, "utf8")).toBe("committed");
  });

  it("restores a guarded live write and preserves invalidation ordering on gate rejection", async () => {
    const runId = "authority-rollback";
    const siteRoot = `/tmp/onebox-site-mutation-locks/${runId}/site`;
    tempDirectories.push(path.dirname(siteRoot));
    await fs.mkdir(siteRoot, { recursive: true });
    const target = path.join(siteRoot, "index.html");
    await fs.writeFile(target, "before");

    await expect(
      runGuardedMutation({
        runId,
        snapshotPaths: [target],
        mutate: () =>
          atomicWriteGeneratedSiteFile(runId, target, "rejected"),
        gateRunner: async () => [
          {
            gate: "axe",
            pass: false,
            blocking: true,
            details: ["blocked"],
            ranAt: "2026-08-23T00:00:00.000Z",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BlockingMutationError);

    expect(await fs.readFile(target, "utf8")).toBe("before");
    expect(
      mocks.invalidateApprovedVisualQaUnderSiteAuthority,
    ).not.toHaveBeenCalled();
  });

  it("binds mutation authority to the current run and generated-site root", async () => {
    const runId = "authority-binding";
    const runRoot = `/tmp/onebox-site-mutation-locks/${runId}`;
    const siteRoot = path.join(runRoot, "site");
    const outsideTarget = path.join(runRoot, "outside.html");
    const otherRunTarget = path.join(siteRoot, "other-run.html");
    tempDirectories.push(runRoot);

    await runGuardedMutation({
      runId,
      snapshotPaths: [],
      mutate: async () => {
        await expect(
          atomicWriteGeneratedSiteFile(
            "authority-other-run",
            otherRunTarget,
            "blocked",
          ),
        ).rejects.toThrow(
          "generated-site live writes require an active guarded mutation",
        );
        await expect(
          atomicWriteGeneratedSiteFile(runId, outsideTarget, "blocked"),
        ).rejects.toThrow(
          "generated-site live write target is outside the guarded site root",
        );
      },
      gateRunner: async () => [],
    });

    await expect(fs.stat(otherRunTarget)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(outsideTarget)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("binds an injected run root to the site lock and guarded write root", async () => {
    const container = await fs.mkdtemp(
      path.join(os.tmpdir(), "onebox-injected-mutation-root-"),
    );
    tempDirectories.push(container);
    const runId = "authority-injected-root";
    const runRoot = path.join(container, runId);
    const siteRoot = path.join(runRoot, "site");
    const target = path.join(siteRoot, "index.html");

    await runGuardedMutation({
      runId,
      runRoot,
      snapshotPaths: [target],
      mutate: async () => {
        await expect(
          fs.stat(path.join(runRoot, ".site-authority-lock", "owner.lock")),
        ).resolves.toBeDefined();
        await atomicWriteGeneratedSiteFile(runId, target, "committed");
      },
      gateRunner: async () => [],
    });

    expect(await fs.readFile(target, "utf8")).toBe("committed");
    expect(
      mocks.invalidateApprovedVisualQaUnderSiteAuthority,
    ).not.toHaveBeenCalled();
  });

  it("rejects a sibling of the injected site root and reads its preexisting gates", async () => {
    const container = await fs.mkdtemp(
      path.join(os.tmpdir(), "onebox-injected-mutation-root-"),
    );
    tempDirectories.push(container);
    const runId = "authority-injected-gates";
    const runRoot = path.join(container, runId);
    const siteRoot = path.join(runRoot, "site");
    const target = path.join(siteRoot, "index.html");
    const sibling = path.join(runRoot, "outside.html");
    await fs.mkdir(siteRoot, { recursive: true });
    await fs.writeFile(
      path.join(runRoot, "gates.json"),
      JSON.stringify([
        {
          gate: "axe",
          pass: false,
          blocking: true,
          details: ["preexisting"],
          ranAt: "2026-08-23T00:00:00.000Z",
        },
      ]),
    );

    let rejection: BlockingMutationError | undefined;
    try {
      await runGuardedMutation({
        runId,
        runRoot,
        snapshotPaths: [target],
        mutate: async () => {
          await expect(
            atomicWriteGeneratedSiteFile(runId, sibling, "blocked"),
          ).rejects.toThrow(
            "generated-site live write target is outside the guarded site root",
          );
          await atomicWriteGeneratedSiteFile(runId, target, "rejected");
        },
        gateRunner: async () => [
          {
            gate: "axe",
            pass: false,
            blocking: true,
            details: ["still failing"],
            ranAt: "2026-08-23T00:00:01.000Z",
          },
        ],
      });
    } catch (error) {
      rejection = error as BlockingMutationError;
    }

    expect(rejection).toBeInstanceOf(BlockingMutationError);
    expect(rejection?.regressions).toEqual([]);
    expect(rejection?.preexisting).toEqual(["axe"]);
    await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(sibling)).rejects.toMatchObject({ code: "ENOENT" });
  });
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
    const site = path.join(runRoot, "site");
    await fs.mkdir(site, { recursive: true });
    await fs.writeFile(path.join(site, "index.html"), "promoted-live");
    const manifest = await createCandidateManifest(site);
    const manifestHash = candidateManifestSha256(manifest);
    const buildHash = manifest.buildSha256;
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
      fs.writeFile(
        path.join(metadata, "candidate-manifest.json"),
        JSON.stringify(manifest, null, 2),
      ),
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
