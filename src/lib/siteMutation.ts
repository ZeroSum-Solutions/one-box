import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { runGates } from "./gates";
import {
  invalidateApprovedVisualQaUnderSiteAuthority,
  RunNotFoundError,
  sitePaths,
} from "./runstate";
import {
  assertSafeRunId,
  assertSiteAuthorityHeld,
  resolveSiteAuthorityWriteTarget,
  withSiteAuthorityLock,
} from "./siteAuthority";
import {
  type GateReport,
} from "./contracts";
import { inspectPromotedLiveBundle } from "./candidate";

export {
  assertSafeRunId,
  withSiteAuthorityLock,
} from "./siteAuthority";
export type { SiteAuthorityOptions } from "./siteAuthority";

export type GateRunner = (
  runId: string,
  options: { afterEdit: true; runRoot?: string }
) => Promise<GateReport[]>;

export class GeneratedSiteMutationAuthorityError extends Error {
  constructor(message = "generated-site live writes require an active guarded mutation") {
    super(message);
    this.name = "GeneratedSiteMutationAuthorityError";
  }
}

interface GeneratedSiteMutationToken {
  readonly runId: string;
  readonly runRoot: string;
  readonly requestedSiteRoot: string;
  readonly siteRoot: string;
}

const activeGeneratedSiteMutation =
  new AsyncLocalStorage<GeneratedSiteMutationToken>();
const liveGeneratedSiteMutations = new WeakSet<GeneratedSiteMutationToken>();

function isCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === code;
}

function containedRelativePath(root: string, target: string): string | undefined {
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

async function assertDirectoryWithoutSymlink(directory: string): Promise<void> {
  let stat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stat = await fs.lstat(directory);
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
    try {
      await fs.mkdir(directory);
    } catch (mkdirError) {
      if (!isCode(mkdirError, "EEXIST")) throw mkdirError;
    }
    stat = await fs.lstat(directory);
  }
  if (stat.isSymbolicLink()) {
    throw new GeneratedSiteMutationAuthorityError(
      "generated-site live write target uses a symbolic link",
    );
  }
  if (!stat.isDirectory()) {
    throw new GeneratedSiteMutationAuthorityError(
      "generated-site live write target has a non-directory parent",
    );
  }
}

async function resolveGeneratedSiteWriteTarget(
  authority: GeneratedSiteMutationToken,
  filePath: string,
): Promise<string> {
  const requestedTarget = path.resolve(filePath);
  const relativeTarget =
    containedRelativePath(authority.requestedSiteRoot, requestedTarget) ??
    containedRelativePath(authority.siteRoot, requestedTarget);
  if (!relativeTarget) {
    throw new GeneratedSiteMutationAuthorityError(
      "generated-site live write target is outside the guarded site root",
    );
  }

  const segments = relativeTarget.split(path.sep);
  let parent = authority.siteRoot;
  for (const segment of segments.slice(0, -1)) {
    parent = path.join(parent, segment);
    await assertDirectoryWithoutSymlink(parent);
  }
  const target = path.join(authority.siteRoot, ...segments);
  const targetStat = await fs.lstat(target).catch((error: unknown) => {
    if (isCode(error, "ENOENT")) return undefined;
    throw error;
  });
  if (targetStat?.isSymbolicLink()) {
    throw new GeneratedSiteMutationAuthorityError(
      "generated-site live write target uses a symbolic link",
    );
  }
  return target;
}

async function resolveGuardedMutationPath(
  requestedRunRoot: string,
  runRoot: string,
  filePath: string,
  label: "snapshot" | "rollback",
): Promise<string> {
  const requestedTarget = path.resolve(filePath);
  const relativeTarget =
    containedRelativePath(requestedRunRoot, requestedTarget) ??
    containedRelativePath(runRoot, requestedTarget);
  if (!relativeTarget) {
    throw new GeneratedSiteMutationAuthorityError(
      `guarded mutation ${label} path is outside the guarded run root`,
    );
  }

  const segments = relativeTarget.split(path.sep);
  let current = runRoot;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch((error: unknown) => {
      if (isCode(error, "ENOENT")) return undefined;
      throw error;
    });
    if (!stat) return path.join(runRoot, ...segments);
    if (stat.isSymbolicLink()) {
      throw new GeneratedSiteMutationAuthorityError(
        `guarded mutation ${label} path uses a symbolic link`,
      );
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new GeneratedSiteMutationAuthorityError(
        `guarded mutation ${label} path has a non-directory parent`,
      );
    }
  }
  return path.join(runRoot, ...segments);
}

export async function atomicWriteGeneratedSiteFile(
  runId: string,
  filePath: string,
  content: string | Buffer,
): Promise<void> {
  const safeRunId = assertSafeRunId(runId);
  const authority = activeGeneratedSiteMutation.getStore();
  if (
    !authority ||
    !liveGeneratedSiteMutations.has(authority) ||
    authority.runId !== safeRunId
  ) {
    throw new GeneratedSiteMutationAuthorityError();
  }
  assertSiteAuthorityHeld(safeRunId, { runRoot: authority.runRoot });
  const target = await resolveGeneratedSiteWriteTarget(authority, filePath);
  await atomicWrite(target, content);
}

export class BlockingMutationError extends Error {
  readonly reports: GateReport[];
  /** Blocking gates this change broke — failures the site did not arrive with. */
  readonly regressions: string[];
  /** Blocking gates already failing before this change was attempted. */
  readonly preexisting: string[];

  constructor(reports: GateReport[], preexistingFailures: Set<string> = new Set()) {
    const failing = reports
      .filter((report) => report.blocking && !report.pass)
      .map((report) => report.gate);
    const regressions = failing.filter((gate) => !preexistingFailures.has(gate));
    const preexisting = failing.filter((gate) => preexistingFailures.has(gate));
    // A site that arrives failing a blocking gate refuses every edit, including
    // the edit that would fix it. Naming the two cases the same way made an
    // inherited failure read as "your change was bad", which is the wrong thing
    // to go fix — so the refusal says which failures this change actually
    // caused, and which it merely inherited.
    super(
      regressions.length
        ? `blocking gates rejected the change: ${regressions.join(", ")}${
            preexisting.length
              ? ` (this site was already failing ${preexisting.join(", ")})`
              : ""
          }`
        : `this site was already failing ${preexisting.join(
            ", "
          )} before the change, so no edit can be saved until that is repaired`
    );
    this.name = "BlockingMutationError";
    this.reports = reports;
    this.regressions = regressions;
    this.preexisting = preexisting;
  }
}

async function promotedGateReports(
  runId: string,
): Promise<GateReport[] | undefined> {
  const liveBundle = await inspectPromotedLiveBundle(runId);
  return liveBundle.status === "present"
    ? liveBundle.receipt.reports
    : undefined;
}

/** Promoted bundles read the canonical receipt. Historical bundles retain the
 * run-root gates.json fallback, which is only a compatibility authority. */
async function failingBlockingGates(
  runId: string,
  runRoot: string,
  canonical: boolean,
): Promise<Set<string>> {
  if (canonical) {
    const promoted = await promotedGateReports(runId);
    if (promoted) {
      return new Set(
        promoted
          .filter((report) => report.blocking && !report.pass)
          .map((report) => report.gate),
      );
    }
  }
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(path.join(runRoot, "gates.json"), "utf8"),
    );
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      (parsed as GateReport[])
        .filter((report) => report && report.blocking && !report.pass)
        .map((report) => report.gate)
    );
  } catch {
    return new Set();
  }
}

export async function atomicWrite(filePath: string, content: string | Buffer): Promise<void> {
  const target = await resolveSiteAuthorityWriteTarget(filePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`
  );
  await fs.writeFile(temporary, content);
  await fs.rename(temporary, target);
}

async function snapshotFiles(
  filePaths: string[],
  requestedRunRoot: string,
  runRoot: string,
): Promise<Map<string, Buffer | null>> {
  const snapshots = new Map<string, Buffer | null>();
  const guardedPaths = await Promise.all(
    filePaths.map((filePath) =>
      resolveGuardedMutationPath(
        requestedRunRoot,
        runRoot,
        filePath,
        "snapshot",
      ),
    ),
  );
  for (const filePath of new Set(guardedPaths)) {
    try {
      snapshots.set(filePath, await fs.readFile(filePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      snapshots.set(filePath, null);
    }
  }
  return snapshots;
}

async function restoreFiles(
  snapshots: Map<string, Buffer | null>,
  runRoot: string,
): Promise<void> {
  for (const [snapshotPath, content] of snapshots) {
    const filePath = await resolveGuardedMutationPath(
      runRoot,
      runRoot,
      snapshotPath,
      "rollback",
    );
    if (content === null) {
      await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    } else {
      await atomicWrite(filePath, content);
    }
  }
}

export interface GuardedMutationOptions<T> {
  runId: string;
  runRoot?: string;
  snapshotPaths: string[] | (() => string[]);
  mutate: () => Promise<T>;
  commit?: (value: T) => Promise<void>;
  gateRunner?: GateRunner;
}

async function withGeneratedSiteMutationAuthority<T>(
  runId: string,
  runRoot: string,
  requestedSiteRoot: string,
  siteRoot: string,
  operation: () => Promise<T>,
): Promise<T> {
  await assertDirectoryWithoutSymlink(siteRoot);
  const authority = Object.freeze({
    runId,
    runRoot,
    requestedSiteRoot: path.resolve(requestedSiteRoot),
    siteRoot: path.resolve(siteRoot),
  });
  return activeGeneratedSiteMutation.run(authority, async () => {
    liveGeneratedSiteMutations.add(authority);
    try {
      return await operation();
    } finally {
      liveGeneratedSiteMutations.delete(authority);
    }
  });
}

/** Tentatively mutates generated-site files, preserving them only after all blocking gates pass. */
export function runGuardedMutation<T>(options: GuardedMutationOptions<T>): Promise<{
  value: T;
  reports: GateReport[];
}> {
  const runId = assertSafeRunId(options.runId);
  const defaultRunRoot = sitePaths(runId).root;
  const requestedRunRoot = path.resolve(options.runRoot ?? defaultRunRoot);
  return withSiteAuthorityLock(runId, async (siteAuthority) => {
    const runRoot = siteAuthority.runRoot;
    const requestedSiteRoot = path.join(requestedRunRoot, "site");
    const siteRoot = path.join(runRoot, "site");
    if (!siteAuthority.canonical && !options.gateRunner) {
      throw new GeneratedSiteMutationAuthorityError(
        "custom run roots require a root-aware gate runner",
      );
    }
    const gateRunner: GateRunner = options.gateRunner ??
      ((gateRunId, gateOptions) =>
        runGates(gateRunId, { afterEdit: gateOptions.afterEdit }));
    const gateOptions = { afterEdit: true, runRoot } as const;
    const snapshotPaths =
      typeof options.snapshotPaths === "function" ? options.snapshotPaths() : options.snapshotPaths;
    const snapshots = await snapshotFiles(
      [...new Set(snapshotPaths)],
      requestedRunRoot,
      runRoot,
    );
    const preexistingFailures = await failingBlockingGates(
      runId,
      runRoot,
      siteAuthority.canonical,
    );
    let value: T;
    try {
      value = await withGeneratedSiteMutationAuthority(
        runId,
        runRoot,
        requestedSiteRoot,
        siteRoot,
        options.mutate,
      );
      const reports = await gateRunner(runId, gateOptions);
      if (reports.some((report) => report.blocking && !report.pass)) {
        throw new BlockingMutationError(reports, preexistingFailures);
      }
      await options.commit?.(value);
      if (siteAuthority.canonical) {
        try {
          // Lock order is site filesystem authority -> run-state transaction.
          // This internal invalidator must never reacquire site authority.
          await invalidateApprovedVisualQaUnderSiteAuthority(runId);
        } catch (error) {
          // Unit-level mutation fixtures may intentionally omit durable run
          // state. Real committed runs must successfully invalidate approval.
          if (!(error instanceof RunNotFoundError)) throw error;
        }
      }
      return { value, reports };
    } catch (error) {
      await restoreFiles(snapshots, runRoot);
      // Restore the gate report too; a rejected candidate must not leave the
      // now-healthy site wearing the candidate's stale failure status.
      try {
        await gateRunner(runId, gateOptions);
      } catch {
        // A failed restorative run may have partially replaced gates.json.
        // Reapply the complete pre-mutation snapshot byte-for-byte.
        await restoreFiles(snapshots, runRoot);
      }
      throw error;
    }
  }, { runRoot: requestedRunRoot });
}
