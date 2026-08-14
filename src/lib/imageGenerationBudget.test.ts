import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  IMAGE_GENERATION_CREDIT_CAP,
  finishImageGeneration,
  readImageGenerationLedger,
  reserveImageGeneration,
} from "./imageGenerationBudget";

const roots: string[] = [];

async function ledgerPath() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-image-budget-"));
  roots.push(root);
  return path.join(root, "image-generation-ledger.json");
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("image generation budget", () => {
  it("reserves before spend, hashes prompts, and records completion", async () => {
    const file = await ledgerPath();
    const requestId = "00000000-0000-4000-8000-000000000001";
    const reservation = await reserveImageGeneration(file, {
      requestId,
      editId: "hero.image",
      instruction: "private prompt text",
      credits: 7,
    });
    expect(reservation).toMatchObject({ usedCredits: 7, capCredits: 14 });
    await finishImageGeneration(file, requestId, "completed");
    const ledger = await readImageGenerationLedger(file);
    expect(ledger.entries[0]).toMatchObject({ status: "completed", credits: 7 });
    expect(JSON.stringify(ledger)).not.toContain("private prompt text");
  });

  it("rejects duplicate request IDs and caps all reserved credits", async () => {
    const file = await ledgerPath();
    const first = "00000000-0000-4000-8000-000000000001";
    await reserveImageGeneration(file, {
      requestId: first,
      editId: "hero.image",
      instruction: "first",
      credits: IMAGE_GENERATION_CREDIT_CAP,
    });
    await expect(
      reserveImageGeneration(file, {
        requestId: first,
        editId: "hero.image",
        instruction: "duplicate",
        credits: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      reserveImageGeneration(file, {
        requestId: "00000000-0000-4000-8000-000000000002",
        editId: "hero.image",
        instruction: "over cap",
        credits: 1,
      }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("retains failed reservations conservatively for audit", async () => {
    const file = await ledgerPath();
    const requestId = "00000000-0000-4000-8000-000000000001";
    await reserveImageGeneration(file, {
      requestId,
      editId: "hero.image",
      instruction: "attempt",
      credits: 7,
    });
    await finishImageGeneration(file, requestId, "failed", "provider timeout");
    expect((await readImageGenerationLedger(file)).entries[0]).toMatchObject({
      status: "failed",
      error: "provider timeout",
    });
  });
});
