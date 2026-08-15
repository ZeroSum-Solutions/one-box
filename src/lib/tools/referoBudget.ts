import fs from "node:fs/promises";
import path from "node:path";

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

function defaultStorePath(): string {
  return path.join(process.cwd(), ".one-box", "refero-usage.json");
}

function monthKey(now: () => Date): string {
  return now().toISOString().slice(0, 7);
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

export async function recordReferoCall(
  _tool: string,
  opts: ReferoBudgetOptions = {}
): Promise<{ month: string; count: number }> {
  const storePath = opts.storePath ?? defaultStorePath();
  const month = monthKey(opts.now ?? (() => new Date()));
  const ledger = await readLedger(storePath);
  const count = (ledger[month] ?? 0) + 1;
  ledger[month] = count;
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  const tmpPath = `${storePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(ledger, null, 2), "utf8");
  await fs.rename(tmpPath, storePath);
  return { month, count };
}
