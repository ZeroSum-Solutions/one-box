import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readReferoUsage,
  recordReferoCall,
  ReferoBudgetExceededError,
  reserveReferoCall,
} from "./referoBudget";

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

  it("loses no increments under concurrent in-process calls", async () => {
    const storePath = await tempStore();
    const august = () => new Date("2026-08-15T12:00:00Z");
    await Promise.all(
      Array.from({ length: 10 }, () =>
        recordReferoCall("refero_search_styles", { storePath, now: august })
      )
    );
    expect(await readReferoUsage({ storePath })).toEqual({ "2026-08": 10 });
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

  it("rejects the call beyond the cap without incrementing the ledger", async () => {
    const storePath = await tempStore();
    const august = () => new Date("2026-08-15T12:00:00Z");
    const options = { storePath, now: august, cap: 2 };

    await expect(reserveReferoCall("refero_search_styles", options)).resolves.toEqual({
      month: "2026-08",
      count: 1,
      cap: 2,
    });
    await expect(reserveReferoCall("refero_get_style", options)).resolves.toEqual({
      month: "2026-08",
      count: 2,
      cap: 2,
    });
    await expect(reserveReferoCall("refero_get_style", options)).rejects.toMatchObject({
      month: "2026-08",
      used: 2,
      cap: 2,
    } satisfies Partial<ReferoBudgetExceededError>);
    expect(await readReferoUsage({ storePath })).toEqual({ "2026-08": 2 });
  });

  it("uses a positive integer monthly cap from the environment", async () => {
    const storePath = await tempStore();
    const august = () => new Date("2026-08-15T12:00:00Z");
    const cap = process.env.ONE_BOX_REFERO_MONTHLY_CAP;
    process.env.ONE_BOX_REFERO_MONTHLY_CAP = "2";
    try {
      await reserveReferoCall("refero_search_styles", { storePath, now: august });
      const second = await reserveReferoCall("refero_get_style", { storePath, now: august });
      expect(second.cap).toBe(2);
      await expect(
        reserveReferoCall("refero_get_style", { storePath, now: august })
      ).rejects.toBeInstanceOf(ReferoBudgetExceededError);
    } finally {
      if (cap === undefined) delete process.env.ONE_BOX_REFERO_MONTHLY_CAP;
      else process.env.ONE_BOX_REFERO_MONTHLY_CAP = cap;
    }
  });

  it("prefers an explicit cap over the environment cap", async () => {
    const storePath = await tempStore();
    const august = () => new Date("2026-08-15T12:00:00Z");
    const cap = process.env.ONE_BOX_REFERO_MONTHLY_CAP;
    process.env.ONE_BOX_REFERO_MONTHLY_CAP = "1";
    try {
      await reserveReferoCall("refero_search_styles", { storePath, now: august, cap: 2 });
      const second = await reserveReferoCall("refero_get_style", {
        storePath,
        now: august,
        cap: 2,
      });
      expect(second).toMatchObject({ count: 2, cap: 2 });
    } finally {
      if (cap === undefined) delete process.env.ONE_BOX_REFERO_MONTHLY_CAP;
      else process.env.ONE_BOX_REFERO_MONTHLY_CAP = cap;
    }
  });

  it("atomically limits concurrent reservations at the cap", async () => {
    const storePath = await tempStore();
    const august = () => new Date("2026-08-15T12:00:00Z");
    for (let count = 0; count < 6; count += 1) {
      await recordReferoCall("refero_search_styles", { storePath, now: august });
    }

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        reserveReferoCall("refero_get_style", { storePath, now: august, cap: 10 })
      )
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(4);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(6);
    expect(
      results
        .filter((result) => result.status === "rejected")
        .every((result) => result.reason instanceof ReferoBudgetExceededError)
    ).toBe(true);
    expect(await readReferoUsage({ storePath })).toEqual({ "2026-08": 10 });
  });

  it("warns when a reservation reaches ninety percent of the monthly cap", async () => {
    const storePath = await tempStore();
    const august = () => new Date("2026-08-15T12:00:00Z");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      for (let count = 0; count < 8; count += 1) {
        await reserveReferoCall("refero_search_styles", { storePath, now: august, cap: 10 });
      }
      expect(warn).not.toHaveBeenCalled();

      await reserveReferoCall("refero_search_styles", { storePath, now: august, cap: 10 });
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        "[refero] monthly budget headroom: 1 call remaining (2026-08, cap 10)"
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("loses no increments when recorded calls interleave with reservations", async () => {
    const storePath = await tempStore();
    const august = () => new Date("2026-08-15T12:00:00Z");
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        index % 2 === 0
          ? recordReferoCall("refero_search_styles", { storePath, now: august })
          : reserveReferoCall("refero_get_style", { storePath, now: august, cap: 20 })
      )
    );
    expect(await readReferoUsage({ storePath })).toEqual({ "2026-08": 10 });
  });
});
