import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

interface FileLockOptions {
  pollMs?: number;
  maxWaitMs?: number;
  orphanAgeMs?: number;
}

interface LockOwner {
  pid: number;
  token: string;
  createdAt: number;
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === code;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isCode(error, "EPERM");
  }
}

function sameInode(left: Awaited<ReturnType<typeof fs.stat>>, right: Awaited<ReturnType<typeof fs.stat>>): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function reclaimDeadOwner(
  ownerPath: string,
  coordinationDirectory: string,
  orphanAgeMs: number
): Promise<void> {
  let owner: LockOwner | undefined;
  try {
    owner = JSON.parse(await fs.readFile(ownerPath, "utf8")) as LockOwner;
  } catch {
    const stat = await fs.stat(ownerPath).catch(() => undefined);
    if (!stat || Date.now() - stat.mtimeMs < orphanAgeMs) return;
  }
  if (owner && typeof owner.pid === "number" && processIsAlive(owner.pid)) return;

  // Link the exact observed inode before removing the fixed owner name. If a
  // different process already replaced it, the inode comparison fails and the
  // live successor remains untouched (ABA-safe across concurrent reclaimers).
  const quarantine = path.join(
    coordinationDirectory,
    `reclaim-${randomBytes(16).toString("hex")}.json`
  );
  try {
    await fs.link(ownerPath, quarantine);
  } catch (error) {
    if (isCode(error, "ENOENT")) return;
    throw error;
  }
  try {
    const [observed, current] = await Promise.all([
      fs.stat(quarantine),
      fs.stat(ownerPath).catch(() => undefined),
    ]);
    if (current && sameInode(observed, current)) {
      await fs.unlink(ownerPath).catch((error) => {
        if (!isCode(error, "ENOENT")) throw error;
      });
      if (owner?.token && /^[a-f0-9]{32}$/.test(owner.token)) {
        const deadClaimPath = path.join(
          coordinationDirectory,
          `claim-${owner.token}.json`
        );
        const deadClaim = await fs.stat(deadClaimPath).catch(() => undefined);
        if (deadClaim && sameInode(observed, deadClaim)) {
          await fs.rm(deadClaimPath, { force: true });
        }
      }
    }
  } finally {
    await fs.rm(quarantine, { force: true });
  }
}

/** Cross-process hard-link lock for this single-host local service. */
export async function withFileLock<T>(
  coordinationDirectory: string,
  operation: () => Promise<T>,
  options: FileLockOptions = {}
): Promise<T> {
  const pollMs = options.pollMs ?? 20;
  const maxWaitMs = options.maxWaitMs ?? 120_000;
  const orphanAgeMs = options.orphanAgeMs ?? 120_000;
  const startedAt = Date.now();
  const token = randomBytes(16).toString("hex");
  const claimPath = path.join(coordinationDirectory, `claim-${token}.json`);
  const ownerPath = path.join(coordinationDirectory, "owner.lock");
  while (true) {
    await fs.mkdir(coordinationDirectory, { recursive: true, mode: 0o700 });
    try {
      await fs.writeFile(
        claimPath,
        JSON.stringify({ pid: process.pid, token, createdAt: startedAt }),
        { encoding: "utf8", mode: 0o600, flag: "wx" }
      );
      break;
    } catch (error) {
      // A completed owner may remove the now-empty coordination directory
      // after this waiter created it but before its claim file is opened.
      // Recreate and retry the same collision-resistant claim; no authority
      // existed yet, so this cannot duplicate an acquired operation.
      if (isCode(error, "ENOENT")) {
        if (Date.now() - startedAt >= maxWaitMs) {
          throw new Error(`Timed out waiting for local file lock: ${coordinationDirectory}`);
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        continue;
      }
      throw error;
    }
  }

  let acquired = false;
  try {
    while (true) {
      try {
        await fs.link(claimPath, ownerPath);
        acquired = true;
        break;
      } catch (error) {
        if (!isCode(error, "EEXIST")) throw error;
      }
      await reclaimDeadOwner(ownerPath, coordinationDirectory, orphanAgeMs);
      if (Date.now() - startedAt >= maxWaitMs) {
        throw new Error(`Timed out waiting for local file lock: ${coordinationDirectory}`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    return await operation();
  } finally {
    if (acquired) {
      const [claim, owner] = await Promise.all([
        fs.stat(claimPath).catch(() => undefined),
        fs.stat(ownerPath).catch(() => undefined),
      ]);
      if (claim && owner && sameInode(claim, owner)) {
        await fs.rm(ownerPath, { force: true });
      }
    }
    await fs.rm(claimPath, { force: true });
  }
}
