import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { withFileLock } from "../fileLock";

/**
 * Durable month-bucketed ledger for Refero MCP calls. The in-memory
 * `referoCallCount()` lives on a globalThis singleton and resets on every
 * restart, so nothing actually enforced the documented 8k-calls/month budget
 * before this ledger existed. Written atomically (temp file + rename) next to
 * the other run-local state in `.one-box/`.
 */

export interface ReferoBudgetOptions {
  storePath?: string;
  now?: () => Date;
}

export class ReferoBudgetExceededError extends Error {
  constructor(
    public readonly month: string,
    public readonly used: number,
    public readonly cap: number
  ) {
    super(`Refero monthly budget exceeded for ${month}: ${used}/${cap} calls used`);
    this.name = "ReferoBudgetExceededError";
  }
}

/** Ledger storage failed (lock, disk). Callers may proceed without a durable
 * reservation; every OTHER error class from the budget layer is a bug and
 * must propagate — silently treating it as "ledger unavailable" would turn
 * cap enforcement off (review finding, 2026-08-15). */
export class ReferoLedgerUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      `refero usage ledger unavailable: ${cause instanceof Error ? cause.message : String(cause)}`
    );
    this.name = "ReferoLedgerUnavailableError";
    this.cause = cause;
  }
}

const DEFAULT_MONTHLY_CAP = 8_000;

function defaultStorePath(): string {
  return path.join(process.cwd(), ".one-box", "refero-usage.json");
}

function monthKey(now: () => Date): string {
  return now().toISOString().slice(0, 7);
}

function isUsableCap(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function monthlyCap(explicitCap: number | undefined): number {
  // One validator for both lanes: a NaN/Infinity/zero explicit cap must never
  // silently disable enforcement (used + 1 > NaN is always false).
  if (explicitCap !== undefined && isUsableCap(explicitCap)) return explicitCap;
  const environmentCap = Number(process.env.ONE_BOX_REFERO_MONTHLY_CAP);
  return isUsableCap(environmentCap) ? environmentCap : DEFAULT_MONTHLY_CAP;
}

async function readLedger(storePath: string): Promise<Record<string, number>> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(storePath, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number"
      )
    );
  } catch {
    // Missing or corrupt ledger: counting must never block a Refero call.
    return {};
  }
}

export async function readReferoUsage(
  opts: ReferoBudgetOptions = {}
): Promise<Record<string, number>> {
  return readLedger(opts.storePath ?? defaultStorePath());
}

// Concurrent Refero calls are normal (stageLock fans searches out via
// Promise.all), so read-modify-write must be serialized in-process. The
// lockfile also protects the ledger when multiple local server processes use
// the same `.one-box/` state directory.
let writeChain: Promise<unknown> = Promise.resolve();

function serialized<T>(job: () => Promise<T>): Promise<T> {
  const next = writeChain.then(job, job);
  writeChain = next.catch(() => undefined);
  return next;
}

async function writeLedger(storePath: string, ledger: Record<string, number>): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  const tmpPath = `${storePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(ledger, null, 2), "utf8");
  await fs.rename(tmpPath, storePath);
}

async function withLockedLedger<T>(
  opts: ReferoBudgetOptions,
  operation: (
    ledger: Record<string, number>,
    month: string,
    storePath: string
  ) => Promise<T>
): Promise<T> {
  const storePath = opts.storePath ?? defaultStorePath();
  const now = opts.now ?? (() => new Date());
  try {
    return await serialized(() =>
      withFileLock(`${storePath}.lock`, async () => {
        const ledger = await readLedger(storePath);
        return operation(ledger, monthKey(now), storePath);
      })
    );
  } catch (error) {
    // Budget decisions are the operation's own signal; everything else that
    // escapes here is lock/disk storage failing.
    if (error instanceof ReferoBudgetExceededError) throw error;
    throw new ReferoLedgerUnavailableError(error);
  }
}

export async function recordReferoCall(
  _tool: string,
  opts: ReferoBudgetOptions = {}
): Promise<{ month: string; count: number }> {
  return withLockedLedger(opts, async (ledger, month, storePath) => {
    const count = (ledger[month] ?? 0) + 1;
    ledger[month] = count;
    await writeLedger(storePath, ledger);
    return { month, count };
  });
}

export async function reserveReferoCall(
  _tool: string,
  opts: ReferoBudgetOptions & { cap?: number } = {}
): Promise<{ month: string; count: number; cap: number }> {
  const cap = monthlyCap(opts.cap);
  return withLockedLedger(opts, async (ledger, month, storePath) => {
    const used = ledger[month] ?? 0;
    if (used + 1 > cap) {
      throw new ReferoBudgetExceededError(month, used, cap);
    }

    const count = used + 1;
    ledger[month] = count;
    await writeLedger(storePath, ledger);
    // Warn once, when the reservation CROSSES the 90% line — not on every
    // call above it (review finding: spam drowns the signal).
    if (count / cap >= 0.9 && used / cap < 0.9) {
      const remaining = cap - count;
      console.warn(
        `[refero] monthly budget headroom: ${remaining} call${remaining === 1 ? "" : "s"} remaining (${month}, cap ${cap})`
      );
    }
    return { month, count, cap };
  });
}
