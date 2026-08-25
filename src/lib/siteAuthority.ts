import fs from "node:fs/promises";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { withFileLock } from "./fileLock";
import { sitePaths } from "./runstate";

const siteAuthorityQueues = new Map<string, Promise<unknown>>();

interface SiteAuthorityToken {
  readonly runId: string;
  readonly requestedRunRoot: string;
  readonly runRoot: string;
  readonly canonical: boolean;
}

const activeSiteAuthority = new AsyncLocalStorage<SiteAuthorityToken>();
const liveSiteAuthorities = new WeakSet<SiteAuthorityToken>();

export interface SiteAuthorityOptions {
  runRoot?: string;
}

export interface SiteAuthorityContext {
  readonly runRoot: string;
  readonly canonical: boolean;
}

export function assertSafeRunId(runId: string): string {
  if (!/^[a-z0-9_-]{4,40}$/i.test(runId)) throw new Error("bad runId");
  return runId;
}

export function assertSiteAuthorityHeld(
  runId: string,
  options: SiteAuthorityOptions = {},
): void {
  const safeRunId = assertSafeRunId(runId);
  const authority = activeSiteAuthority.getStore();
  const expectedRoot = options.runRoot
    ? path.resolve(options.runRoot)
    : undefined;
  const rootMatches = expectedRoot
    ? authority?.requestedRunRoot === expectedRoot ||
      authority?.runRoot === expectedRoot
    : authority?.canonical;
  if (
    !authority ||
    !liveSiteAuthorities.has(authority) ||
    authority.runId !== safeRunId ||
    !rootMatches
  ) {
    throw new Error("site authority lock is not held for run");
  }
}

function relativePathWithin(root: string, target: string): string | undefined {
  const relativeTarget = path.relative(root, target);
  if (
    relativeTarget === "" ||
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTarget)
  ) {
    return undefined;
  }
  return relativeTarget;
}

/** Require canonical generated-state writes to match a live authority root. */
export async function resolveSiteAuthorityWriteTarget(
  filePath: string,
): Promise<string> {
  const requestedTarget = path.resolve(filePath);
  const authority = activeSiteAuthority.getStore();
  if (!authority) {
    const [canonicalSitesRoot, physicalTarget] = await Promise.all([
      resolveRunRoot(
        path.dirname(path.resolve(sitePaths("site-authority-root-probe").root)),
      ),
      resolveRunRoot(requestedTarget),
    ]);
    if (relativePathWithin(canonicalSitesRoot, physicalTarget)) {
      throw new Error("site authority lock does not cover write target");
    }
    return requestedTarget;
  }

  const relativeTarget =
    relativePathWithin(authority.requestedRunRoot, requestedTarget) ??
    relativePathWithin(authority.runRoot, requestedTarget);
  if (!liveSiteAuthorities.has(authority) || !relativeTarget) {
    throw new Error("site authority lock does not cover write target");
  }
  await assertSiteAuthorityWriteParents(authority.runRoot, relativeTarget);
  return path.join(authority.runRoot, relativeTarget);
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === code;
}

async function assertSiteAuthorityWriteParents(
  runRoot: string,
  relativeTarget: string,
): Promise<void> {
  let parent = runRoot;
  for (const segment of relativeTarget.split(path.sep).slice(0, -1)) {
    parent = path.join(parent, segment);
    const stat = await fs.lstat(parent).catch((error: unknown) => {
      if (isCode(error, "ENOENT")) return undefined;
      throw error;
    });
    if (!stat) return;
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error("site authority lock does not cover write target");
    }
  }
}

/** Resolve existing symlinks while retaining a not-yet-created path suffix. */
async function resolveRunRoot(runRoot: string): Promise<string> {
  let existingAncestor = path.resolve(runRoot);
  const missingSuffix: string[] = [];
  while (true) {
    try {
      const resolvedAncestor = await fs.realpath(existingAncestor);
      return path.join(resolvedAncestor, ...missingSuffix);
    } catch (error) {
      if (!isCode(error, "ENOENT")) throw error;
      const existingEntry = await fs.lstat(existingAncestor).catch(
        (lstatError: unknown) => {
          if (isCode(lstatError, "ENOENT")) return undefined;
          throw lstatError;
        },
      );
      if (existingEntry) {
        throw new Error("site authority run root contains a dangling symbolic link");
      }
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) throw error;
      missingSuffix.unshift(path.basename(existingAncestor));
      existingAncestor = parent;
    }
  }
}

/** One same-process queue plus the existing filesystem authority lock. */
export async function withSiteAuthorityLock<T>(
  runId: string,
  operation: (authority: SiteAuthorityContext) => Promise<T>,
  options: SiteAuthorityOptions = {},
): Promise<T> {
  const safeRunId = assertSafeRunId(runId);
  const requestedRunRoot = path.resolve(
    options.runRoot ?? sitePaths(safeRunId).root,
  );
  const canonicalRunRoot = path.resolve(sitePaths(safeRunId).root);
  // Enroll synchronously by the requested root so two back-to-back callers
  // cannot be reordered by racing realpath operations before they reach the
  // filesystem lock. Physical aliases still converge on the same file lock.
  const lockKey = `${safeRunId}:${requestedRunRoot}`;
  const previous = siteAuthorityQueues.get(lockKey) ?? Promise.resolve();
  const crossProcessOperation = async () => {
    const [runRoot, resolvedCanonicalRunRoot] = await Promise.all([
      resolveRunRoot(requestedRunRoot),
      resolveRunRoot(canonicalRunRoot),
    ]);
    const canonical = runRoot === resolvedCanonicalRunRoot;
    const coordinationDirectory = path.join(runRoot, ".site-authority-lock");
    const authority = Object.freeze({
      runId: safeRunId,
      requestedRunRoot,
      runRoot,
      canonical,
    });
    try {
      return await withFileLock(coordinationDirectory, () =>
        activeSiteAuthority.run(authority, async () => {
          liveSiteAuthorities.add(authority);
          try {
            return await operation(authority);
          } finally {
            liveSiteAuthorities.delete(authority);
          }
        }),
      );
    } finally {
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
