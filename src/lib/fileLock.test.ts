import fs, { link, mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withFileLock } from "./fileLock";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("cross-process file lock", () => {
  it("recreates the coordination directory when a releaser removes it before claim creation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "one-box-lock-rmdir-"));
    roots.push(root);
    const lockPath = path.join(root, "resource.lock");
    const actualMkdir = fs.mkdir.bind(fs);
    let removed = false;
    vi.spyOn(fs, "mkdir").mockImplementation(async (...args) => {
      const result = await actualMkdir(...args);
      if (!removed && String(args[0]) === lockPath) {
        removed = true;
        await fs.rmdir(lockPath);
      }
      return result;
    });

    await expect(withFileLock(lockPath, async () => "held", { pollMs: 1 }))
      .resolves.toBe("held");
    expect(removed).toBe(true);
  });

  it("bounds repeated coordination-directory removal by maxWaitMs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "one-box-lock-rmdir-loop-"));
    roots.push(root);
    const lockPath = path.join(root, "resource.lock");
    const actualMkdir = fs.mkdir.bind(fs);
    vi.spyOn(fs, "mkdir").mockImplementation(async (...args) => {
      const result = await actualMkdir(...args);
      if (String(args[0]) === lockPath) {
        await fs.rm(lockPath, { recursive: true, force: true });
      }
      return result;
    });

    await expect(withFileLock(lockPath, async () => "never", {
      pollMs: 1,
      maxWaitMs: 20,
    })).rejects.toThrow(/Timed out/i);
  });

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
