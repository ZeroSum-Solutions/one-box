import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { runGates } from "./gates";
import {
  invalidateApprovedVisualQaUnderSiteAuthority,
  RunNotFoundError,
  sitePaths,
} from "./runstate";
import {
  assertSafeRunId,
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
  options: { afterEdit: true }
) => Promise<GateReport[]>;

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
async function failingBlockingGates(runId: string): Promise<Set<string>> {
  const promoted = await promotedGateReports(runId);
  if (promoted) {
    return new Set(
      promoted
        .filter((report) => report.blocking && !report.pass)
        .map((report) => report.gate),
    );
  }
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(path.join(sitePaths(runId).root, "gates.json"), "utf8"),
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
    const preexistingFailures = await failingBlockingGates(runId);
    let value: T;
    try {
      value = await options.mutate();
      const reports = await gateRunner(runId, { afterEdit: true });
      if (reports.some((report) => report.blocking && !report.pass)) {
        throw new BlockingMutationError(reports, preexistingFailures);
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
