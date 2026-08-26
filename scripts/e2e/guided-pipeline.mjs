import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { chromium } from "playwright";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const base = process.env.ONEBOX_BASE_URL ?? "http://127.0.0.1:3000";
const runId = `guided-e2e-${randomUUID().slice(0, 8)}`;
const {
  createRun,
  finishStage,
  removeRun,
  saveArtifact,
  startStage,
  withRunTransaction,
} = await import("../../src/lib/runstate.ts");
const {
  ARTIFACTS,
  IntakeSchema,
  ReferenceSelectionStateSchema,
} = await import("../../src/lib/contracts.ts");

function candidate(referoId, recommended) {
  return {
    referoId,
    kind: "style",
    name: `${referoId} direction`,
    sourceUrl: `https://refero.design/${referoId}`,
    foundVia: "guided browser test",
    palette: [
      { hex: "#112233", plainLabel: "dark anchor" },
      { hex: "#ddeeff", plainLabel: "light backdrop" },
    ],
    plainLanguageProfile: {
      headline: `${referoId} feel`,
      feelSummary: "Clear and welcoming.",
      bestFor: ["A local business"],
      headsUp: [],
    },
    composition: {
      northStar: "Keep the opening clear.",
      preserveTraits: ["Clear calls to action", "Comfortable breathing room"],
      rhythmNote: "Alternate detail and pause.",
    },
    recommended,
    ...(recommended ? { recommendedWhy: "Best fit for the brief." } : {}),
  };
}

await createRun({ id: runId, referencePickerEnabled: true });
await startStage(runId, "intake");
await saveArtifact(runId, ARTIFACTS.intake, IntakeSchema.parse({
  businessName: "Guided E2E",
  category: "plumber",
  location: "Portland, OR",
  services: ["Repairs"],
  primaryAction: "quote",
}));
await finishStage(runId, "intake");
await startStage(runId, "scanned");
await finishStage(runId, "scanned");
await withRunTransaction(runId, async (transaction) => {
  transaction.state.referenceSelection = ReferenceSelectionStateSchema.parse({
    status: "pending",
    rerollsUsed: 0,
    versions: [{
      version: 1,
      createdAt: "2026-08-25T12:00:00.000Z",
      searchAngles: ["warm", "clear", "local"],
      candidates: [candidate("alpha", true), candidate("beta", false)],
    }],
  });
});

const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${base}/?run=${runId}&view=guided`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Choose up to three" }).waitFor();
    assert.equal(await page.getByRole("switch", { name: "Developer view" }).getAttribute("aria-checked"), "false");
    assert.equal(await page.getByText("What do you like about it?").count() > 0, true);
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    assert.ok(overflow.scroll <= overflow.client + 1, `horizontal overflow at ${width}px`);
    if (width === 390) {
      const box = await page.getByRole("switch", { name: "Developer view" }).boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44);
    }
    await page.getByRole("switch", { name: "Developer view" }).click();
    await page.getByRole("region", { name: "Build progress" }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
  await removeRun(runId);
}

console.log("guided pipeline e2e passed");
