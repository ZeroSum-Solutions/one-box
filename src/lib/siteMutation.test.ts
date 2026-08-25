import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidateApprovedVisualQaUnderSiteAuthority: vi.fn(),
  layoutAuthority: "template-v1" as "template-v1" | "page-ir-v1",
  runMissing: false,
  mutationRoot: `${process.cwd()}/sites/.tmp-onebox-site-mutation-locks`,
}));

vi.mock("./runstate", () => {
  class RunNotFoundError extends Error {}
  return {
  invalidateApprovedVisualQaUnderSiteAuthority:
    mocks.invalidateApprovedVisualQaUnderSiteAuthority,
  RunNotFoundError,
  LayoutAuthorityMismatchError: class LayoutAuthorityMismatchError extends Error {},
  loadRun: async () => {
    if (mocks.runMissing) throw new RunNotFoundError();
    return { layoutAuthority: mocks.layoutAuthority };
  },
  assertRunLayoutAuthority: (
    state: { layoutAuthority: string },
    expected: string,
  ) => {
    if (state.layoutAuthority !== expected) throw new Error("authority mismatch");
  },
  sitePaths: (runId: string) => ({
    root: `${mocks.mutationRoot}/${runId}`,
    site: `${mocks.mutationRoot}/${runId}/site`,
  }),
  candidatePaths: (runId: string) => ({
    root: `${mocks.mutationRoot}/${runId}/candidate`,
    site: `${mocks.mutationRoot}/${runId}/candidate/site`,
    manifest: `${mocks.mutationRoot}/${runId}/candidate/manifest.json`,
    provenance: `${mocks.mutationRoot}/${runId}/candidate/provenance.json`,
    gates: `${mocks.mutationRoot}/${runId}/candidate/gates.json`,
  }),
  };
});

import {
  atomicWrite,
  atomicWriteGeneratedSiteFile,
  BlockingMutationError,
  runGuardedMutation,
  type GateRunner,
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
import {
  knownMutationGateRequest,
  unknownMutationGateRequest,
  type MutationGateRequest,
} from "./mutationGateMatrix";

const tempDirectories: string[] = [];
const contentGateRequest = knownMutationGateRequest("content");

async function workspaceTempDirectory(prefix: string): Promise<string> {
  const workspaceRoot = path.join(process.cwd(), "sites");
  await fs.mkdir(workspaceRoot, { recursive: true });
  return fs.mkdtemp(path.join(workspaceRoot, `.tmp-${prefix}`));
}

afterEach(async () => {
  mocks.invalidateApprovedVisualQaUnderSiteAuthority.mockReset();
  mocks.layoutAuthority = "template-v1";
  mocks.runMissing = false;
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
  await fs.rm(mocks.mutationRoot, { recursive: true, force: true });
});

describe("generated-site mutation write authority", () => {
  it("rejects direct compiled-file mutation for Page IR runs before mutation", async () => {
    const runId = "authority-page-ir-direct";
    const runRoot = path.join(mocks.mutationRoot, runId);
    const target = path.join(runRoot, "site", "index.html");
    tempDirectories.push(runRoot);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "before");
    mocks.layoutAuthority = "page-ir-v1";
    const mutate = vi.fn(async () => atomicWrite(target, "after"));

    await expect(
      runGuardedMutation({
        runId,
        snapshotPaths: [target],
        gateRequest: contentGateRequest,
        mutate,
        gateRunner: async () => [],
      }),
    ).rejects.toThrow(/Page IR.*typed IR mutation/i);

    expect(mutate).not.toHaveBeenCalled();
    expect(await fs.readFile(target, "utf8")).toBe("before");
  });

  it("rejects mutation when canonical run authority metadata is missing", async () => {
    const runId = "authority-missing-run-state";
    const runRoot = path.join(mocks.mutationRoot, runId);
    const target = path.join(runRoot, "site", "index.html");
    tempDirectories.push(runRoot);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "before");
    mocks.runMissing = true;
    const mutate = vi.fn(async () => atomicWrite(target, "after"));

    await expect(
      runGuardedMutation({
        runId,
        snapshotPaths: [target],
        gateRequest: contentGateRequest,
        mutate,
        gateRunner: async () => [],
      }),
    ).rejects.toThrow();

    expect(mutate).not.toHaveBeenCalled();
    expect(await fs.readFile(target, "utf8")).toBe("before");
  });

  it("rejects a direct canonical live atomic write without authority", async () => {
    const runId = "authority-atomic-no-context";
    const runRoot = path.join(mocks.mutationRoot, runId);
    const liveTarget = path.join(runRoot, "site", "index.html");
    tempDirectories.push(runRoot);

    await expect(
      atomicWrite(liveTarget, "blocked"),
    ).rejects.toThrow("site authority lock does not cover write target");
    await expect(fs.stat(liveTarget)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a no-context live atomic write through an outside canonical-root alias", async () => {
    const runId = "authority-atomic-alias-no-context";
    const canonicalSitesRoot = mocks.mutationRoot;
    const runRoot = path.join(canonicalSitesRoot, runId);
    const canonicalTarget = path.join(runRoot, "site", "index.html");
    const aliasParent = await workspaceTempDirectory("onebox-sites-alias-");
    const aliasRoot = path.join(aliasParent, "sites-alias");
    const aliasTarget = path.join(aliasRoot, runId, "site", "index.html");
    tempDirectories.push(aliasParent, runRoot);
    await fs.mkdir(canonicalSitesRoot, { recursive: true });
    await fs.symlink(canonicalSitesRoot, aliasRoot, "dir");

    await expect(
      atomicWrite(aliasTarget, "blocked"),
    ).rejects.toThrow("site authority lock does not cover write target");
    await expect(fs.stat(canonicalTarget)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("binds generic atomic writes to the held run root", async () => {
    const lockedRunId = "authority-atomic-root-a";
    const otherRunId = "authority-atomic-root-b";
    const lockedRunRoot = path.join(mocks.mutationRoot, lockedRunId);
    const otherRunRoot = path.join(mocks.mutationRoot, otherRunId);
    const allowedTarget = path.join(lockedRunRoot, "metadata.json");
    const crossRunTarget = path.join(otherRunRoot, "site", "index.html");
    tempDirectories.push(lockedRunRoot, otherRunRoot);

    await withSiteAuthorityLock(lockedRunId, async () => {
      await expect(
        atomicWrite(crossRunTarget, "blocked"),
      ).rejects.toThrow("site authority lock does not cover write target");
      await atomicWrite(allowedTarget, "allowed");
    });

    await expect(fs.stat(crossRunTarget)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(allowedTarget, "utf8")).toBe("allowed");
  });

  it("rejects a held-authority atomic write through a symlinked parent", async () => {
    const runId = "authority-atomic-symlink-parent";
    const runRoot = path.join(mocks.mutationRoot, runId);
    const outsideRoot = await workspaceTempDirectory(
      "onebox-authority-atomic-escape-",
    );
    const target = path.join(runRoot, "site", "index.html");
    const escapedTarget = path.join(outsideRoot, "index.html");
    tempDirectories.push(runRoot, outsideRoot);
    await fs.mkdir(runRoot, { recursive: true });
    await fs.symlink(outsideRoot, path.join(runRoot, "site"), "dir");

    await expect(
      withSiteAuthorityLock(runId, () => atomicWrite(target, "blocked")),
    ).rejects.toThrow("site authority lock does not cover write target");
    await expect(fs.stat(escapedTarget)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("fails closed before a live write attempted outside runGuardedMutation", async () => {
    const siteRoot = await workspaceTempDirectory(
      "onebox-live-write-authority-",
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
    const siteRoot = path.join(mocks.mutationRoot, runId, "site");
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
    const siteRoot = path.join(mocks.mutationRoot, runId, "site");
    tempDirectories.push(path.dirname(siteRoot));
    const target = path.join(siteRoot, "index.html");

    await runGuardedMutation({
      runId,
      gateRequest: contentGateRequest,
      snapshotPaths: [target],
      mutate: () =>
        atomicWriteGeneratedSiteFile(runId, target, "committed"),
      gateRunner: async () => [],
    });

    expect(await fs.readFile(target, "utf8")).toBe("committed");
  });

  it("restores a guarded live write and preserves invalidation ordering on gate rejection", async () => {
    const runId = "authority-rollback";
    const siteRoot = path.join(mocks.mutationRoot, runId, "site");
    tempDirectories.push(path.dirname(siteRoot));
    await fs.mkdir(siteRoot, { recursive: true });
    const target = path.join(siteRoot, "index.html");
    await fs.writeFile(target, "before");

    await expect(
      runGuardedMutation({
        runId,
        gateRequest: contentGateRequest,
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
    const runRoot = path.join(mocks.mutationRoot, runId);
    const siteRoot = path.join(runRoot, "site");
    const outsideTarget = path.join(runRoot, "outside.html");
    const otherRunTarget = path.join(siteRoot, "other-run.html");
    tempDirectories.push(runRoot);

    await runGuardedMutation({
      runId,
      gateRequest: contentGateRequest,
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
    const container = await workspaceTempDirectory(
      "onebox-injected-mutation-root-",
    );
    tempDirectories.push(container);
    const runId = "authority-injected-root";
    const runRoot = path.join(container, runId);
    const siteRoot = path.join(runRoot, "site");
    const target = path.join(siteRoot, "index.html");

    await runGuardedMutation({
      runId,
      gateRequest: contentGateRequest,
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

  it("passes the guarded custom root to every gate run", async () => {
    const container = await workspaceTempDirectory("onebox-root-aware-gates-");
    tempDirectories.push(container);
    const runId = "authority-root-aware-gates";
    const runRoot = path.join(container, runId);
    const target = path.join(runRoot, "site", "index.html");
    const observedRoots: Array<string | undefined> = [];

    await runGuardedMutation({
      runId,
      gateRequest: contentGateRequest,
      runRoot,
      snapshotPaths: [target],
      mutate: () => atomicWriteGeneratedSiteFile(runId, target, "committed"),
      gateRunner: async (_gateRunId, gateOptions) => {
        observedRoots.push(
          (gateOptions as { runRoot?: string }).runRoot,
        );
        return [];
      },
    });

    expect(observedRoots).toEqual([await fs.realpath(runRoot)]);
  });

  it("refuses a custom root before mutation without a root-aware gate runner", async () => {
    const container = await workspaceTempDirectory(
      "onebox-custom-root-default-gates-",
    );
    tempDirectories.push(container);
    const runId = "authority-custom-default-gates";
    const runRoot = path.join(container, runId);
    let mutated = false;

    await expect(
      runGuardedMutation({
        runId,
        gateRequest: contentGateRequest,
        runRoot,
        snapshotPaths: [],
        mutate: async () => {
          mutated = true;
        },
      }),
    ).rejects.toThrow("custom run roots require a root-aware gate runner");
    expect(mutated).toBe(false);
  });

  it("retires mutation authority before a detached continuation reaches gates", async () => {
    const container = await workspaceTempDirectory(
      "onebox-mutation-authority-lifetime-",
    );
    tempDirectories.push(container);
    const runId = "authority-mutation-lifetime";
    const runRoot = path.join(container, runId);
    const committedTarget = path.join(runRoot, "site", "index.html");
    const detachedTarget = path.join(runRoot, "site", "detached.html");
    let releaseDetached: () => void = () => undefined;
    const detachedSignal = new Promise<void>((resolve) => {
      releaseDetached = resolve;
    });
    let detachedWrite: Promise<void> | undefined;

    await runGuardedMutation({
      runId,
      gateRequest: contentGateRequest,
      runRoot,
      snapshotPaths: [committedTarget, detachedTarget],
      mutate: async () => {
        await atomicWriteGeneratedSiteFile(runId, committedTarget, "committed");
        detachedWrite = detachedSignal.then(() =>
          atomicWriteGeneratedSiteFile(runId, detachedTarget, "blocked"),
        );
      },
      gateRunner: async () => {
        releaseDetached();
        await expect(detachedWrite).rejects.toThrow(
          "generated-site live writes require an active guarded mutation",
        );
        return [];
      },
    });

    expect(await fs.readFile(committedTarget, "utf8")).toBe("committed");
    await expect(fs.stat(detachedTarget)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("treats a custom path alias of the canonical root as canonical", async () => {
    const container = await workspaceTempDirectory(
      "onebox-canonical-root-alias-",
    );
    tempDirectories.push(container);
    const runId = "authority-canonical-alias";
    const canonicalRunRoot = path.join(mocks.mutationRoot, runId);
    tempDirectories.push(canonicalRunRoot);
    await fs.mkdir(path.join(canonicalRunRoot, "site"), { recursive: true });
    const aliasRunRoot = path.join(container, "run-root-alias");
    await fs.symlink(canonicalRunRoot, aliasRunRoot);
    const targetThroughAlias = path.join(aliasRunRoot, "site", "index.html");

    await runGuardedMutation({
      runId,
      gateRequest: contentGateRequest,
      runRoot: aliasRunRoot,
      snapshotPaths: [targetThroughAlias],
      mutate: () =>
        atomicWriteGeneratedSiteFile(runId, targetThroughAlias, "committed"),
      gateRunner: async () => [],
    });

    expect(await fs.readFile(
      path.join(canonicalRunRoot, "site", "index.html"),
      "utf8",
    )).toBe("committed");
    expect(
      mocks.invalidateApprovedVisualQaUnderSiteAuthority,
    ).toHaveBeenCalledWith(runId);
  });

  it("rejects a generated-site write through a symlink that escapes the guarded root", async () => {
    const container = await workspaceTempDirectory(
      "onebox-mutation-symlink-escape-",
    );
    tempDirectories.push(container);
    const runId = "authority-symlink-escape";
    const runRoot = path.join(container, runId);
    const siteRoot = path.join(runRoot, "site");
    const outsideRoot = path.join(container, "outside");
    await Promise.all([
      fs.mkdir(siteRoot, { recursive: true }),
      fs.mkdir(outsideRoot, { recursive: true }),
    ]);
    await fs.symlink(outsideRoot, path.join(siteRoot, "escape"));
    const escapedTarget = path.join(siteRoot, "escape", "escaped.txt");

    await expect(
      runGuardedMutation({
        runId,
        gateRequest: contentGateRequest,
        runRoot,
        snapshotPaths: [],
        mutate: () =>
          atomicWriteGeneratedSiteFile(runId, escapedTarget, "blocked"),
        gateRunner: async () => [],
      }),
    ).rejects.toThrow(
      "generated-site live write target uses a symbolic link",
    );
    await expect(
      fs.stat(path.join(outsideRoot, "escaped.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a symlinked snapshot path before mutation or outside rollback writes", async () => {
    const container = await workspaceTempDirectory(
      "onebox-snapshot-symlink-escape-",
    );
    tempDirectories.push(container);
    const runId = "authority-snapshot-symlink";
    const runRoot = path.join(container, runId);
    const siteRoot = path.join(runRoot, "site");
    const outsideRoot = path.join(container, "outside");
    const outsideTarget = path.join(outsideRoot, "preserved.txt");
    await Promise.all([
      fs.mkdir(siteRoot, { recursive: true }),
      fs.mkdir(outsideRoot, { recursive: true }),
    ]);
    await fs.writeFile(outsideTarget, "preserved");
    const originalOutsideInode = (await fs.stat(outsideTarget)).ino;
    await fs.symlink(outsideRoot, path.join(siteRoot, "escape"));
    const targetThroughSymlink = path.join(siteRoot, "escape", "preserved.txt");
    let mutated = false;

    await expect(
      runGuardedMutation({
        runId,
        gateRequest: contentGateRequest,
        runRoot,
        snapshotPaths: [targetThroughSymlink],
        mutate: async () => {
          mutated = true;
          await atomicWriteGeneratedSiteFile(
            runId,
            targetThroughSymlink,
            "blocked",
          );
        },
        gateRunner: async () => [],
      }),
    ).rejects.toThrow("guarded mutation snapshot path uses a symbolic link");

    expect(mutated).toBe(false);
    expect(await fs.readFile(outsideTarget, "utf8")).toBe("preserved");
    expect((await fs.stat(outsideTarget)).ino).toBe(originalOutsideInode);
  });

  it("rejects a sibling of the injected site root and reads its preexisting gates", async () => {
    const container = await workspaceTempDirectory(
      "onebox-injected-mutation-root-",
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
        gateRequest: contentGateRequest,
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

describe("guarded mutation gate request forwarding", () => {
  it("uses the identical explicit request for candidate and restorative gate runs", async () => {
    const runId = "gate-request-identical";
    const runRoot = path.join(mocks.mutationRoot, runId);
    const target = path.join(runRoot, "site", "index.html");
    const request = knownMutationGateRequest("token-style");
    const received: unknown[] = [];
    tempDirectories.push(runRoot);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "before");

    await expect(
      runGuardedMutation({
        runId,
        gateRequest: request,
        snapshotPaths: [target],
        mutate: () => atomicWriteGeneratedSiteFile(runId, target, "candidate"),
        gateRunner: async (_gateRunId, options) => {
          received.push(options.afterEdit);
          return received.length === 1
            ? [{
                gate: "token-drift",
                pass: false,
                blocking: true,
                details: ["seeded defect"],
                ranAt: "2026-08-23T00:00:00.000Z",
              }]
            : [];
        },
      }),
    ).rejects.toBeInstanceOf(BlockingMutationError);

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual(request);
    expect(received[1]).toBe(received[0]);
    expect(await fs.readFile(target, "utf8")).toBe("before");
  });

  it("resolves a value-derived request after mutate returns under the mutation lock", async () => {
    const runId = "gate-request-resolver";
    const runRoot = path.join(mocks.mutationRoot, runId);
    const target = path.join(runRoot, "site", "index.html");
    const received: MutationGateRequest[] = [];
    tempDirectories.push(runRoot);

    const result = await runGuardedMutation({
      runId,
      snapshotPaths: [target],
      mutate: async () => {
        await atomicWriteGeneratedSiteFile(runId, target, "candidate");
        return { capability: "asset" as const };
      },
      gateRequest: (value) => knownMutationGateRequest(value.capability),
      gateRunner: async (
        _gateRunId: string,
        options: Parameters<GateRunner>[1],
      ) => {
        received.push(options.afterEdit);
        return [];
      },
    });

    expect(result.value).toEqual({ capability: "asset" });
    expect(received).toEqual([knownMutationGateRequest("asset")]);
  });

  it("fails closed to unknown for restoration when request resolution throws", async () => {
    const runId = "gate-request-resolver-error";
    const runRoot = path.join(mocks.mutationRoot, runId);
    const target = path.join(runRoot, "site", "index.html");
    const received: MutationGateRequest[] = [];
    tempDirectories.push(runRoot);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "before");

    await expect(
      runGuardedMutation({
        runId,
        snapshotPaths: [target],
        mutate: async () => {
          await atomicWriteGeneratedSiteFile(runId, target, "candidate");
          return "changed";
        },
        gateRequest: () => {
          throw new Error("resolver failed");
        },
        gateRunner: async (_gateRunId, options) => {
          received.push(options.afterEdit);
          return [];
        },
      }),
    ).rejects.toThrow("resolver failed");

    expect(received).toEqual([unknownMutationGateRequest()]);
    expect(await fs.readFile(target, "utf8")).toBe("before");
  });

  it("fails closed to unknown when mutate throws before a request can resolve", async () => {
    const runId = "gate-request-mutate-error";
    const runRoot = path.join(mocks.mutationRoot, runId);
    const target = path.join(runRoot, "site", "index.html");
    const received: MutationGateRequest[] = [];
    tempDirectories.push(runRoot);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "before");

    await expect(
      runGuardedMutation({
        runId,
        snapshotPaths: [target],
        mutate: async () => {
          await atomicWriteGeneratedSiteFile(runId, target, "candidate");
          throw new Error("mutation failed");
        },
        gateRequest: () => knownMutationGateRequest("motion"),
        gateRunner: async (_gateRunId, options) => {
          received.push(options.afterEdit);
          return [];
        },
      }),
    ).rejects.toThrow("mutation failed");

    expect(received).toEqual([unknownMutationGateRequest()]);
    expect(await fs.readFile(target, "utf8")).toBe("before");
  });

  it("normalizes a missing runtime request to unknown instead of skipping gates", async () => {
    const runId = "gate-request-runtime-missing";
    const runRoot = path.join(mocks.mutationRoot, runId);
    const target = path.join(runRoot, "site", "index.html");
    const received: MutationGateRequest[] = [];
    tempDirectories.push(runRoot);

    await runGuardedMutation({
      runId,
      snapshotPaths: [target],
      mutate: () => atomicWriteGeneratedSiteFile(runId, target, "candidate"),
      gateRunner: async (
        _gateRunId: string,
        options: Parameters<GateRunner>[1],
      ) => {
        received.push(options.afterEdit);
        return [];
      },
    } as unknown as Parameters<typeof runGuardedMutation<void>>[0]);

    expect(received).toEqual([unknownMutationGateRequest()]);
  });
});

describe("committed site mutation visual-QA invalidation", () => {
  it("invalidates only after the candidate passes mechanical gates and commits", async () => {
    const runRoot = path.join(mocks.mutationRoot, "test-run");
    tempDirectories.push(runRoot);
    const target = path.join(runRoot, "site", "index.html");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "before");
    const order: string[] = [];
    mocks.invalidateApprovedVisualQaUnderSiteAuthority.mockImplementation(async () => {
      order.push("invalidate");
      return true;
    });

    await runGuardedMutation({
      runId: "test-run",
      gateRequest: contentGateRequest,
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
    const runRoot = path.join(mocks.mutationRoot, "test-run");
    tempDirectories.push(runRoot);
    const target = path.join(runRoot, "site", "index.html");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "before");

    await expect(
      runGuardedMutation({
        runId: "test-run",
        gateRequest: contentGateRequest,
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
  const runRoot = path.join(mocks.mutationRoot, runId);

  async function attempt(failingGate: string): Promise<BlockingMutationError> {
    const target = path.join(runRoot, "mutation-fixture.json");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "before");
    try {
      await runGuardedMutation({
        runId,
        gateRequest: contentGateRequest,
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
