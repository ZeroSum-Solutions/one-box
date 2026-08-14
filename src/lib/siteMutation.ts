import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { runGates } from "./gates";
import { withFileLock } from "./fileLock";
import {
  invalidateApprovedVisualQaUnderSiteAuthority,
  RunNotFoundError,
  sitePaths,
} from "./runstate";
import type { GateReport } from "./contracts";

export type GateRunner = (
  runId: string,
  options: { afterEdit: true }
) => Promise<GateReport[]>;

export class BlockingMutationError extends Error {
  readonly reports: GateReport[];

  constructor(reports: GateReport[]) {
    const names = reports
      .filter((report) => report.blocking && !report.pass)
      .map((report) => report.gate)
      .join(", ");
    super(`blocking gates rejected the change: ${names}`);
    this.name = "BlockingMutationError";
    this.reports = reports;
  }
}

const mutationLocks = new Map<string, Promise<unknown>>();

export interface SiteAuthorityOptions {
  runRoot?: string;
}

export function assertSafeRunId(runId: string): string {
  if (!/^[a-z0-9_-]{4,40}$/i.test(runId)) throw new Error("bad runId");
  return runId;
}

export async function atomicWrite(filePath: string, content: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`
  );
  await fs.writeFile(temporary, content);
  await fs.rename(temporary, filePath);
}

async function snapshotFiles(filePaths: string[]): Promise<Map<string, Buffer | null>> {
  const snapshots = new Map<string, Buffer | null>();
  for (const filePath of filePaths) {
    try {
      snapshots.set(filePath, await fs.readFile(filePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      snapshots.set(filePath, null);
    }
  }
  return snapshots;
}

async function restoreFiles(snapshots: Map<string, Buffer | null>): Promise<void> {
  for (const [filePath, content] of snapshots) {
    if (content === null) {
      await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    } else {
      await atomicWrite(filePath, content);
    }
  }
}

export function withSiteAuthorityLock<T>(
  runId: string,
  operation: () => Promise<T>,
  options: SiteAuthorityOptions = {},
): Promise<T> {
  assertSafeRunId(runId);
  const runRoot = options.runRoot ?? sitePaths(runId).root;
  const coordinationDirectory = path.join(runRoot, ".site-authority-lock");
  const lockKey = `${runId}:${coordinationDirectory}`;
  const previous = mutationLocks.get(lockKey) ?? Promise.resolve();
  const crossProcessOperation = () =>
    withFileLock(coordinationDirectory, operation);
  const next = previous.then(crossProcessOperation, crossProcessOperation);
  const guarded = next.catch(() => undefined);
  mutationLocks.set(lockKey, guarded);
  return next.finally(() => {
    if (mutationLocks.get(lockKey) === guarded) mutationLocks.delete(lockKey);
  });
}

export interface GuardedMutationOptions<T> {
  runId: string;
  snapshotPaths: string[] | (() => string[]);
  mutate: () => Promise<T>;
  commit?: (value: T) => Promise<void>;
  gateRunner?: GateRunner;
}

/** Tentatively mutates generated-site files, preserving them only after all blocking gates pass. */
export function runGuardedMutation<T>(options: GuardedMutationOptions<T>): Promise<{
  value: T;
  reports: GateReport[];
}> {
  const runId = assertSafeRunId(options.runId);
  const gateRunner = options.gateRunner ?? runGates;
  return withSiteAuthorityLock(runId, async () => {
    const snapshotPaths =
      typeof options.snapshotPaths === "function" ? options.snapshotPaths() : options.snapshotPaths;
    const snapshots = await snapshotFiles([...new Set(snapshotPaths)]);
    let value: T;
    try {
      value = await options.mutate();
      const reports = await gateRunner(runId, { afterEdit: true });
      if (reports.some((report) => report.blocking && !report.pass)) {
        throw new BlockingMutationError(reports);
      }
      await options.commit?.(value);
      try {
        // Lock order is site filesystem authority -> run-state transaction.
        // This internal invalidator must never reacquire site authority.
        await invalidateApprovedVisualQaUnderSiteAuthority(runId);
      } catch (error) {
        // Unit-level mutation fixtures may intentionally omit durable run
        // state. Real committed runs must successfully invalidate approval.
        if (!(error instanceof RunNotFoundError)) throw error;
      }
      return { value, reports };
    } catch (error) {
      await restoreFiles(snapshots);
      // Restore the gate report too; a rejected candidate must not leave the
      // now-healthy site wearing the candidate's stale failure status.
      try {
        await gateRunner(runId, { afterEdit: true });
      } catch {
        // A failed restorative run may have partially replaced gates.json.
        // Reapply the complete pre-mutation snapshot byte-for-byte.
        await restoreFiles(snapshots);
      }
      throw error;
    }
  });
}
