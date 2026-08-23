import fs from "node:fs/promises";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { withFileLock } from "./fileLock";
import { sitePaths } from "./runstate";

const siteAuthorityQueues = new Map<string, Promise<unknown>>();
const activeSiteAuthority = new AsyncLocalStorage<{
  active: boolean;
  runId: string;
}>();

export interface SiteAuthorityOptions {
  runRoot?: string;
}

export function assertSafeRunId(runId: string): string {
  if (!/^[a-z0-9_-]{4,40}$/i.test(runId)) throw new Error("bad runId");
  return runId;
}

export function assertSiteAuthorityHeld(runId: string): void {
  const safeRunId = assertSafeRunId(runId);
  const authority = activeSiteAuthority.getStore();
  if (!authority?.active || authority.runId !== safeRunId) {
    throw new Error("site authority lock is not held for run");
  }
}

/** One same-process queue plus the existing filesystem authority lock. */
export function withSiteAuthorityLock<T>(
  runId: string,
  operation: () => Promise<T>,
  options: SiteAuthorityOptions = {},
): Promise<T> {
  assertSafeRunId(runId);
  const runRoot = options.runRoot ?? sitePaths(runId).root;
  const coordinationDirectory = path.join(runRoot, ".site-authority-lock");
  const lockKey = `${runId}:${coordinationDirectory}`;
  const previous = siteAuthorityQueues.get(lockKey) ?? Promise.resolve();
  const crossProcessOperation = async () => {
    const authority = { active: true, runId };
    try {
      return await withFileLock(coordinationDirectory, () =>
        activeSiteAuthority.run(authority, operation),
      );
    } finally {
      authority.active = false;
      // Empty lock directories are compatibility noise, not authority. A
      // concurrent claimant makes this fail harmlessly with ENOTEMPTY, and a
      // cleanup error must never turn a completed operation into a failure.
      await fs.rmdir(coordinationDirectory).catch(() => {});
    }
  };
  const next = previous.then(crossProcessOperation, crossProcessOperation);
  const guarded = next.catch(() => undefined);
  siteAuthorityQueues.set(lockKey, guarded);
  return next.finally(() => {
    if (siteAuthorityQueues.get(lockKey) === guarded) {
      siteAuthorityQueues.delete(lockKey);
    }
  });
}
