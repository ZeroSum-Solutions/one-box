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

const DEFAULT_MONTHLY_CAP = 8_000;

function defaultStorePath(): string {
  return path.join(process.cwd(), ".one-box", "refero-usage.json");
}

function monthKey(now: () => Date): string {
  return now().toISOString().slice(0, 7);
}

function monthlyCap(explicitCap: number | undefined): number {
  if (explicitCap !== undefined) return explicitCap;
  const environmentCap = Number(process.env.ONE_BOX_REFERO_MONTHLY_CAP);
  return Number.isInteger(environmentCap) && environmentCap > 0
    ? environmentCap
    : DEFAULT_MONTHLY_CAP;
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
  return serialized(() =>
    withFileLock(`${storePath}.lock`, async () => {
      const ledger = await readLedger(storePath);
      return operation(ledger, monthKey(now), storePath);
    })
  );
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
    if (count / cap >= 0.9) {
      const remaining = cap - count;
      console.warn(
        `[refero] monthly budget headroom: ${remaining} call${remaining === 1 ? "" : "s"} remaining (${month}, cap ${cap})`
      );
    }
    return { month, count, cap };
  });
}
