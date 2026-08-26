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
  MARKET_RUBRIC_CRITERIA,
  MarketAnalysisSchema,
  ReferenceSelectionStateSchema,
  ScanResultSchema,
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
await saveArtifact(runId, ARTIFACTS.scan, ScanResultSchema.parse({
  competitors: [],
  commonSections: [],
  gaps: [],
  excluded: [],
}));
await saveArtifact(runId, ARTIFACTS.marketAnalysis, MarketAnalysisSchema.parse({
  schemaVersion: 1,
  status: "ready",
  generatedAt: "2026-08-25T12:00:00.000Z",
  displayCutoff: 4,
  competitors: [{
    id: "alpha.example",
    name: "Alpha Plumbing",
    url: "https://alpha.example",
    rank: 1,
    totalScore: 0,
    confidence: "medium",
    screenshots: {},
    selectedBecause: [{ text: "Clear service structure", basis: "observed", evidence: [{ kind: "first-party-crawl", path: "research/alpha/page.md", summary: "Services are listed" }] }],
    strengths: [{ text: "Direct conversion path", basis: "observed", evidence: [{ kind: "first-party-crawl", path: "research/alpha/page.md", summary: "Quote action is visible" }] }],
    gaps: [],
    rubric: MARKET_RUBRIC_CRITERIA.map((criterion) => ({ criterion, score: 0, evidence: [] })),
  }],
  commonPatterns: [],
  gaps: [],
}));
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
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: width <= 390 ? 844 : 900 } });
    const draftKey = `onebox:reference-draft:${runId}:1`;
    if (width === 1440) {
      await page.addInitScript(({ key, value }) => {
        window.localStorage.setItem(key, JSON.stringify(value));
        const originalRemoveItem = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function removeItem(candidateKey) {
          if (candidateKey === key) throw new DOMException("blocked", "SecurityError");
          return originalRemoveItem.call(this, candidateKey);
        };
      }, {
        key: draftKey,
        value: {
          choices: [{ referoId: "alpha", note: "Calm colors" }],
          overallNote: "Keep the tone restrained",
        },
      });
      await page.route(`**/api/reference/${runId}`, async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
          return;
        }
        await route.continue();
      });
    }
    let activeGuidedRequests = 0;
    let maxActiveGuidedRequests = 0;
    if (width === 1440) {
      await page.route(`**/api/guided/${runId}`, async (route) => {
        activeGuidedRequests += 1;
        maxActiveGuidedRequests = Math.max(maxActiveGuidedRequests, activeGuidedRequests);
        try {
          await new Promise((resolve) => setTimeout(resolve, 2_200));
          const response = await route.fetch();
          await route.fulfill({ response });
        } finally {
          activeGuidedRequests -= 1;
        }
      });
    }
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${base}/?run=${runId}&view=guided`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Choose up to three" }).waitFor();
    if (width === 1440) {
      await page.locator(".guided-reference__note textarea").waitFor();
      assert.equal(await page.locator(".guided-reference__note textarea").inputValue(), "Calm colors");
      assert.equal(await page.locator(".guided-picker__overall textarea").inputValue(), "Keep the tone restrained");
      assert.ok(await page.evaluate((key) => window.localStorage.getItem(key), draftKey));
      await page.getByRole("button", { name: "Confirm direction" }).click();
      await page.getByText("Direction saved. Continuing the build…").waitFor();
      assert.equal(await page.getByText("Could not save yet. Your draft is still here.").count(), 0);
      await page.evaluate(() => window.localStorage.clear());
      const settleDeadline = Date.now() + 10_000;
      while (activeGuidedRequests > 0 && Date.now() < settleDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(activeGuidedRequests, 0, "guided mount requests must settle before polling verification");
      maxActiveGuidedRequests = 0;
      await new Promise((resolve) => setTimeout(resolve, 4_500));
      assert.ok(maxActiveGuidedRequests <= 1, "steady-state guided polling requests must be serialized");
    }
    assert.equal(await page.getByRole("switch", { name: "Developer view" }).getAttribute("aria-checked"), "false");
    assert.equal(await page.getByText("What do you like about it?").count() > 0, true);
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    assert.ok(overflow.scroll <= overflow.client + 1, `horizontal overflow at ${width}px`);
    const marketDisclosure = page.locator(".guided-market-disclosure");
    assert.equal(await marketDisclosure.getAttribute("open"), null, "completed research must start collapsed");
    const chooser = await page.getByRole("heading", { name: "Choose up to three" }).boundingBox();
    assert.ok(chooser && chooser.y < (width <= 390 ? 844 : 900), "current decision must appear in the first viewport");
    await marketDisclosure.locator("summary").click();
    if (width <= 390) {
      const map = await page.locator(".guided-market__map").boundingBox();
      const mapLink = await page.getByRole("link", { name: "Open market map" }).boundingBox();
      assert.ok(
        map && mapLink && mapLink.x >= map.x - 1 && mapLink.x + mapLink.width <= map.x + map.width + 1,
        `map fallback link must remain inside the map at ${width}px`,
      );
      assert.ok(mapLink.height >= 44, `map link must meet the mobile touch target at ${width}px`);
    }
    const mapFrame = page.getByTitle("Competitor market map");
    if (await mapFrame.count() > 0) {
      assert.equal(await mapFrame.getAttribute("loading"), "eager");
    } else {
      assert.equal(await page.locator(".guided-market__map iframe").count(), 0);
      assert.ok(await page.getByRole("link", { name: "Open market map" }).isVisible());
    }
    if (width === 1440) {
      const competitor = page.getByRole("button", { name: /Alpha Plumbing/i });
      await competitor.click();
      await page.getByRole("dialog", { name: "Alpha Plumbing" }).waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Close");
      await page.keyboard.press("Shift+Tab");
      assert.match(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""), /Open live website/);
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.waitForFunction(() => document.activeElement?.classList.contains("guided-competitor"));
      const focusState = await page.evaluate(() => ({
        className: document.activeElement?.className,
        text: document.activeElement?.textContent?.trim(),
      }));
      assert.equal(focusState.className, "guided-competitor", `focus should return to the competitor card: ${JSON.stringify(focusState)}`);
    }
    await marketDisclosure.locator("summary").click();
    if (width === 390) {
      const box = await page.getByRole("switch", { name: "Developer view" }).boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44);
      await page.getByRole("button", { name: /alpha direction/i }).click();
      const reorder = await page.getByRole("button", { name: "Move down" }).boundingBox();
      assert.ok(reorder && reorder.width >= 44 && reorder.height >= 44, "rank controls must meet the mobile touch target");
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
