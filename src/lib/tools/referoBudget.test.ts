import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readReferoUsage, recordReferoCall } from "./referoBudget";

const roots: string[] = [];

async function tempStore(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-refero-budget-"));
  roots.push(root);
  return path.join(root, "refero-usage.json");
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

describe("refero durable budget ledger", () => {
  it("counts calls durably within a month across separate invocations", async () => {
    const storePath = await tempStore();
    const august = () => new Date("2026-08-15T12:00:00Z");
    await recordReferoCall("refero_search_styles", { storePath, now: august });
    const second = await recordReferoCall("refero_get_style", { storePath, now: august });
    expect(second).toEqual({ month: "2026-08", count: 2 });
    expect(await readReferoUsage({ storePath })).toEqual({ "2026-08": 2 });
  });

  it("rolls over to a fresh bucket at the month boundary and keeps history", async () => {
    const storePath = await tempStore();
    await recordReferoCall("refero_search_styles", {
      storePath,
      now: () => new Date("2026-08-31T23:59:59Z"),
    });
    const rolled = await recordReferoCall("refero_search_styles", {
      storePath,
      now: () => new Date("2026-09-01T00:00:01Z"),
    });
    expect(rolled).toEqual({ month: "2026-09", count: 1 });
    expect(await readReferoUsage({ storePath })).toEqual({
      "2026-08": 1,
      "2026-09": 1,
    });
  });

  it("survives a corrupt ledger file by starting a fresh ledger instead of throwing", async () => {
    const storePath = await tempStore();
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, "{not json", "utf8");
    const result = await recordReferoCall("refero_get_style", {
      storePath,
      now: () => new Date("2026-08-15T12:00:00Z"),
    });
    expect(result).toEqual({ month: "2026-08", count: 1 });
  });
});
