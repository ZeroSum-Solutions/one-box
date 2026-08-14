import { link, mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withFileLock } from "./fileLock";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("cross-process file lock", () => {
  it("serializes concurrent waiters reclaiming the same dead owner", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "one-box-lock-"));
    roots.push(root);
    const lockPath = path.join(root, "resource.lock");
    await mkdir(lockPath);
    const deadToken = "d".repeat(32);
    const deadClaim = path.join(lockPath, `claim-${deadToken}.json`);
    await writeFile(
      deadClaim,
      JSON.stringify({ pid: 2_147_483_647, token: deadToken, createdAt: 0 })
    );
    await link(deadClaim, path.join(lockPath, "owner.lock"));
    let active = 0;
    let maximumActive = 0;
    const operation = async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
    };

    await Promise.all([
      withFileLock(lockPath, operation, { pollMs: 1 }),
      withFileLock(lockPath, operation, { pollMs: 1 }),
    ]);
    expect(maximumActive).toBe(1);
    expect(await readdir(lockPath)).toEqual([]);
  });
});
