/**
 * scripts/e2e/canvas-contract.mjs
 *
 * Visual/accessibility contract sweep for the ONE BOX app shell (DESIGN.md)
 * -- G7 (axe: no serious/critical violations) and G9 (visual contract: lime
 * cap, control-height cap, weight cap, media bounds) from
 * docs/specs/2026-08-16-canvas-upgrade.md.
 *
 * Landed from a prior session's throwaway harness and extended to drive the
 * canvas-upgrade chrome that harness predates: SelectionBreadcrumb (select a
 * section), PersistentComposer (with and without a selection), UndoRedoRail,
 * and the Layers tool's ARIA tree. Each workbench state gets its own labeled
 * surface (see WORKBENCH_STATE_SETUPS below) so a failure names WHICH
 * chrome state broke, not just "workbench".
 *
 * Two corrections a prior pass already found are preserved here rather than
 * re-discovered:
 *   - Lime is capped at ONE action per view; it is not REQUIRED. Zero is
 *     correct wherever a view's primary action is unavailable (a disabled
 *     composer, a gate with no approve path). Only >1 is a violation.
 *   - An anchor/button whose entire content is one large <img> (an
 *     image-only proxy: the <img> fills more than ~60% of the box) is a
 *     bounded thumbnail (DESIGN.md "Long-run disclosure"), not an oversize
 *     control the 34px cap governs.
 *
 * Run from the repo root:
 *   node scripts/e2e/canvas-contract.mjs          # full sweep: contract audit AND axe (G9 + G7)
 *   node scripts/e2e/canvas-contract.mjs --axe    # axe only (G7)
 *
 * ONEBOX_BASE_URL overrides the base (defaults to http://localhost:3000, the
 * same idiom as scripts/e2e/canvas-coverage.mjs and preview-workbench.mjs).
 * WIDTHS overrides the viewport sweep (defaults to 1440,768,390).
 */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { registerHooks } from "node:module";

const base = process.env.ONEBOX_BASE_URL ?? "http://localhost:3000";
const OUT = "docs/screenshots/canvas-contract";
mkdirSync(OUT, { recursive: true });

const AXE_ONLY = process.argv.includes("--axe");

// RUN_BUILT is a fully built run (used for the evidence workspace and the
// editor workbench); RUN_SCAN carries live scan/market data (used for the
// pipeline timeline view). Both are pre-existing ignored sites/ fixtures,
// not created by this script.
const RUN_BUILT = "pKrNnpmPGX6y";
const RUN_SCAN = "mPHVbkER-Qu8";

const WIDTHS = process.env.WIDTHS
  ? process.env.WIDTHS.split(",").map(Number)
  : [1440, 768, 390];

// ---------------------------------------------------------------------------
// RUN_BUILT (pKrNnpmPGX6y) was built 2026-08-15, BEFORE canvas-upgrade Wave 1
// stamped data-edit-id on every <section> (confirmed by reading its frozen
// sites/pKrNnpmPGX6y/site/index.html: 31 leaf data-edit-id attributes, ZERO
// on any <section> tag). overlay.js's nearestEditable() walk only selects an
// element that itself carries data-edit-id, so no click anywhere in that
// site can ever select a section as a container -- the fixture predates the
// exact chrome (SelectionBreadcrumb, composer scoped to a container) this
// sweep is required to audit "with that chrome live". Rather than silently
// skip the section-selected state (as the first sweep did -- see the
// canvas-contract-run1.log finding), this builds one small fixture through
// the REAL current builder (same idiom as canvas-coverage.mjs's own fixture,
// proven by that harness's passing "sections 7/7" assertion), so section
// selection is exercised against code that actually stamps section ids
// today. workbench-no-selection and workbench-layers stay on RUN_BUILT per
// the run-id guidance above -- neither needs a section-level id, and Layers
// against RUN_BUILT's real 41-node tree is the more honest density sample.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});
process.env.ONEBOX_TEST_FIXTURE_PUBLISH = "1";
const { buildAndPublishSiteFixture } = await import("../../test-support/buildSiteFixture.ts");

const fixtureRunId = `canvas-contract-${Date.now().toString(36)}`;
const fixtureRoot = path.join(process.cwd(), "sites", fixtureRunId);

async function buildSectionFixture() {
  const intake = {
    businessName: "FiberLink Pro",
    category: "fiber optic installer",
    location: "Austin, TX",
    services: ["Residential fiber installation", "Business fiber installation"],
    phone: "(512) 555-0142",
    serviceArea: "Austin, Round Rock, Cedar Park, Georgetown",
    yearsInBusiness: "12",
    certifications: ["BICSI certified"],
    claims: ["Same-week installation"],
    primaryAction: "call",
    projectTarget: "website",
    vibeWords: ["reliable", "fast", "no-nonsense"],
  };
  const tokens = {
    colors: [
      { name: "Charcoal", value: "#14181c", cssVar: "--color-bg", role: "page background" },
      { name: "Panel", value: "#1c2126", cssVar: "--color-surface", role: "card/section background" },
      { name: "Panel Alt", value: "#20262c", cssVar: "--color-surface-alt", role: "footer / hero-placeholder background" },
      { name: "Ink", value: "#f4f6f8", cssVar: "--color-text", role: "primary text" },
      { name: "Ink Muted", value: "#9aa4ad", cssVar: "--color-text-muted", role: "secondary text" },
      { name: "Fiber Blue", value: "#3aa0ff", cssVar: "--color-primary", role: "buttons, links, accents" },
      { name: "Blue Contrast", value: "#04121f", cssVar: "--color-primary-contrast", role: "text on primary-filled buttons" },
      { name: "Hairline", value: "#2b3238", cssVar: "--color-border", role: "borders / dividers" },
      { name: "Signal Green", value: "#39d98a", cssVar: "--color-accent", role: "decorative accent only" },
    ],
    fonts: [
      { family: "Space Grotesk", cssVar: "--font-display", weights: [500, 600], role: "headings", substitutes: ["Inter Tight"] },
      { family: "Inter", cssVar: "--font-body", weights: [400, 500], role: "body copy", substitutes: ["system-ui"] },
    ],
    typeScale: [
      { role: "caption", sizePx: 13, lineHeight: 1.4, cssVar: "--text-caption" },
      { role: "body-sm", sizePx: 15, lineHeight: 1.5, cssVar: "--text-body-sm" },
      { role: "body", sizePx: 17, lineHeight: 1.6, cssVar: "--text-body" },
      { role: "body-lg", sizePx: 20, lineHeight: 1.5, cssVar: "--text-body-lg" },
      { role: "subheading", sizePx: 24, lineHeight: 1.3, cssVar: "--text-subheading" },
      { role: "heading-sm", sizePx: 30, lineHeight: 1.2, cssVar: "--text-heading-sm" },
      { role: "heading", sizePx: 42, lineHeight: 1.15, cssVar: "--text-heading" },
      { role: "heading-lg", sizePx: 60, lineHeight: 1.05, cssVar: "--text-heading-lg" },
      { role: "display", sizePx: 88, lineHeight: 1.0, trackingEm: -0.02, cssVar: "--text-display" },
    ],
    radii: { sm: "6px", md: "12px", lg: "20px", pill: "999px" },
    spacing: { xs: "8px", sm: "12px", md: "20px", lg: "32px", xl: "56px", "2xl": "88px", "3xl": "128px" },
    borders: { subtle: "1px solid #2b3238", strong: "2px solid #3aa0ff" },
    shadows: { raised: "0 8px 30px rgb(0 0 0 / 0.2)", overlay: "0 18px 50px rgb(0 0 0 / 0.3)" },
    layers: { base: "0", sticky: "20", overlay: "40" },
    layout: { maxWidthPx: 1180, sectionGapPx: 96, cardPaddingPx: 28 },
    motion: {
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      durationMs: { micro: 160, reveal: 600 },
      revealClasses: ["hero", "card", "stat", "point"],
    },
    componentStates: [
      { component: "button", states: { default: "solid fill", hover: "darken 8%", focus: "2px outline", disabled: "40% opacity" } },
    ],
    imageryBrief: {
      subject: "a technician splicing fiber optic cable",
      lighting: "soft directional work-light",
      grade: "cool neutral, slightly desaturated",
      framing: "medium shot, shallow depth of field",
      avoid: ["stock-photo smiles", "text overlays", "logos"],
    },
  };
  const skeleton = {
    sections: [
      { id: "nav", name: "Navigation", purpose: "wayfinding + quick call", contentNeeds: ["logo", "phone"] },
      { id: "hero", name: "Hero", purpose: "primary conversion", contentNeeds: ["headline", "sub", "cta"] },
      { id: "trust-bar", name: "Trust bar", purpose: "quick credibility", contentNeeds: ["stats"] },
      { id: "services", name: "Services", purpose: "service inventory", contentNeeds: ["service cards"] },
      { id: "why-us", name: "Why us", purpose: "differentiation", contentNeeds: ["differentiators"] },
      { id: "reviews", name: "Reviews", purpose: "social proof", contentNeeds: ["testimonials"] },
      { id: "service-area", name: "Service area", purpose: "geo relevance", contentNeeds: ["area list"] },
      { id: "contact", name: "Contact", purpose: "secondary conversion", contentNeeds: ["cta", "phone"] },
      { id: "footer", name: "Footer", purpose: "chrome", contentNeeds: ["business name"] },
    ],
  };
  const copy = {
    sections: {
      nav: { logo: "FiberLink Pro", phone: "(512) 555-0142" },
      hero: {
        headline: "Fiber internet installed right, the first time.",
        sub: "Licensed low-voltage crews serving Austin and Central Texas.",
        cta: "Call for same-week service",
        "image-alt": "FiberLink Pro technician splicing fiber optic cable",
      },
      "trust-bar": {
        "stat-1-value": "12",
        "stat-1-label": "Years in Central Texas",
        "stat-2-value": "1400",
        "stat-2-label": "Installs completed",
      },
      services: {
        intro: "What we install",
        "card-1-title": "Residential fiber",
        "card-1-body": "Whole-home fiber runs, ONT placement, and Wi-Fi handoff.",
        "card-2-title": "Business fiber",
        "card-2-body": "Office and warehouse fiber backbone and rack termination.",
      },
      "why-us": {
        intro: "Why Central Texas calls us first",
        "point-1-title": "BICSI certified crews",
        "point-1-body": "Every installer carries current BICSI certification.",
      },
      reviews: {
        "card-1-quote": "They ran fiber to our detached garage office in an afternoon.",
        "card-1-author": "Austin homeowner",
      },
      "service-area": {
        intro: "Where we work",
        "area-1": "Austin",
        "area-2": "Round Rock",
      },
      contact: {
        headline: "Ready to get wired up right?",
        sub: "Call now for same-week scheduling across Central Texas.",
        cta: "Call FiberLink Pro",
      },
      footer: { tagline: "Licensed fiber optic installation for Central Texas." },
    },
    stopSlopScore: 41,
  };

  await fs.rm(fixtureRoot, { recursive: true, force: true });
  await fs.mkdir(fixtureRoot, { recursive: true });
  const runState = {
    id: fixtureRunId,
    createdAt: new Date().toISOString(),
    pipelineVersion: "legacy-v1",
    stages: Object.fromEntries(
      ["intake", "scanned", "locked", "synthesized", "built", "edited"].map((stage) => [
        stage,
        { status: "done", retries: 0, gateRepairAttempts: 0 },
      ]),
    ),
    costUsd: 0,
    costCapUsd: 3,
    modelSlugs: {},
    referenceMode: "none",
  };
  await fs.writeFile(path.join(fixtureRoot, "run.json"), JSON.stringify(runState, null, 2));
  await buildAndPublishSiteFixture({ runId: fixtureRunId, intake, tokens, skeleton, copy, assets: {} });
}

await buildSectionFixture();

async function waitForMode(page, mode) {
  await page.waitForFunction(
    (expected) =>
      [...document.querySelectorAll("button[aria-pressed='true']")].some(
        (button) => button.textContent?.trim() === expected,
      ),
    mode,
  );
}

// Below ~880px the workbench opens COLLAPSED by default (previewState.ts
// applyCompactDefault) so the generated-site preview keeps the full
// viewport -- the panel body (breadcrumb, composer, undo rail, layers tree)
// never renders until reopened. Auditing the canvas chrome at 768/390
// requires reopening it first; otherwise those widths would only ever see
// the collapsed icon rail and every chrome-specific state below would be
// silently untested exactly where the 34px cap is most likely to bite
// (touch targets grow to 44px under 768px by contract).
async function ensureWorkbenchOpen(page, { strict = false, label = "workbench" } = {}) {
  const panelBody = page.locator(".workbench-panel__body");
  if (await panelBody.isVisible().catch(() => false)) return;

  const reopen = page.locator('button[aria-label="Reopen workbench"]');
  if ((await reopen.count().catch(() => 0)) === 0) {
    if (strict) throw new Error(`${label}: workbench is closed and its reopen control is missing`);
    return;
  }
  try {
    await reopen.click({ timeout: 3000 });
  } catch (error) {
    if (strict) throw new Error(`${label}: workbench reopen failed: ${String(error)}`);
    return;
  }
  const opened = await panelBody
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (strict && !opened) {
    throw new Error(`${label}: workbench panel did not open`);
  }
  await page.waitForTimeout(300);
}

async function enterEditModeStrict(page, label) {
  const editButton = page.getByRole("button", { name: "Edit", exact: true });
  await editButton.waitFor({ state: "visible", timeout: 8000 }).catch(() => {
    throw new Error(`${label}: Edit control is missing`);
  });
  assert.equal(await editButton.count(), 1, `${label}: expected exactly one Edit control`);
  assert.equal(await editButton.isDisabled(), false, `${label}: Edit control is disabled`);
  if ((await editButton.getAttribute("aria-pressed")) !== "true") {
    await editButton.click();
  }
  await waitForMode(page, "Edit").catch(() => {
    throw new Error(`${label}: workbench did not reach Edit mode`);
  });
  assert.equal(
    await editButton.getAttribute("aria-pressed"),
    "true",
    `${label}: Edit control did not become pressed`,
  );
}

async function selectFirstSection(page, label) {
  await page
    .frameLocator("iframe")
    .locator("[data-edit-id]")
    .first()
    .waitFor({ timeout: 8000 })
    .catch(() => {});
  const child = page.frames()[1];
  if (!child) {
    console.log(`[canvas-contract]   ! ${label}: no iframe child frame found`);
    return null;
  }
  const clickedId = await child
    .evaluate(() => {
      const section = document.querySelector("section[data-edit-id]");
      if (!section) return null;
      section.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
      );
      return section.getAttribute("data-edit-id");
    })
    .catch(() => null);
  if (!clickedId) {
    console.log(`[canvas-contract]   ! ${label}: no <section data-edit-id> found in the iframe -- selection setup skipped`);
    return null;
  }
  const gotBreadcrumb = await page
    .locator(".workbench-breadcrumb")
    .waitFor({ timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (!gotBreadcrumb) {
    console.log(`[canvas-contract]   ! ${label}: selected ${clickedId} but .workbench-breadcrumb never appeared`);
  }
  await page.waitForTimeout(400);
  return clickedId;
}

async function openLayersTool(page, label) {
  const layersButton = page.getByRole("button", { name: "Layers", exact: true });
  await layersButton.waitFor({ timeout: 5000 }).catch(() => {});
  await layersButton.click({ timeout: 5000 }).catch(() => {});
  const gotTree = await page
    .locator(".layers-tree")
    .first()
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!gotTree) {
    console.log(`[canvas-contract]   ! ${label}: .layers-tree did not render after clicking Layers`);
    return;
  }
  await page.waitForTimeout(500);
  const rowCount = await page.locator(".layers-tree__row").count();
  console.log(`[canvas-contract]   layers tree rendered ${rowCount} row(s)`);
}

const AGENT_STUDIO_ROLES = [
  "Researcher",
  "PRD Planner",
  "Architecture Analyst",
  "Canvas Designer",
  "Implementation Producer",
  "QA Challenger",
  "Security Challenger",
  "SEO Qualifier",
];

async function assertMinimumTouchTarget(locator, label, useRadioLabel = false) {
  const controls = await locator.all();
  assert.ok(controls.length > 0, `${label}: expected at least one visible control`);
  for (const control of controls) {
    const metrics = await control.evaluate((element, useLabel) => {
      const target = useLabel ? element.closest("label") : element;
      if (!(target instanceof HTMLElement)) return null;
      const box = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      return {
        width: box.width,
        height: box.height,
        visible:
          box.width > 0 &&
          box.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden",
      };
    }, useRadioLabel);
    assert.ok(metrics?.visible, `${label}: control is not visible`);
    assert.ok(
      metrics.width >= 44 && metrics.height >= 44,
      `${label}: ${metrics.width}x${metrics.height} is below 44x44`,
    );
  }
}

async function assertAgentStudioTouchTargets({
  agentStudio,
  teammatePane,
  radios,
  createProposal,
  width,
  label,
}) {
  if (width > 768) return;
  assert.equal(await radios.count(), 8, `${label}: expected eight radio touch targets`);
  await assertMinimumTouchTarget(radios, `${label}: teammate radio label`, true);
  await assertMinimumTouchTarget(
    teammatePane.getByRole("textbox", { name: "Assignment", exact: true }),
    `${label}: Assignment textarea`,
  );
  await assertMinimumTouchTarget(
    teammatePane.getByRole("combobox", { name: "Data class", exact: true }),
    `${label}: Data class select`,
  );
  await assertMinimumTouchTarget(createProposal, `${label}: Create proposal`);
  await assertMinimumTouchTarget(
    agentStudio.getByRole("button", { name: "Teammates", exact: true }),
    `${label}: Teammates mode`,
  );
  await assertMinimumTouchTarget(
    agentStudio.getByRole("button", { name: "Site advice", exact: true }),
    `${label}: Site advice mode`,
  );

  const visibleInteractives = teammatePane.locator(
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="radio"], [tabindex]:not([tabindex="-1"])',
  );
  const touchTargets = await visibleInteractives.evaluateAll((elements) =>
    elements.flatMap((element) => {
      const target =
        element instanceof HTMLInputElement && element.type === "radio"
          ? element.closest("label")
          : element;
      if (!(target instanceof HTMLElement)) return [];
      const box = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      if (
        box.width === 0 ||
        box.height === 0 ||
        style.display === "none" ||
        style.visibility === "hidden"
      ) {
        return [];
      }
      const name =
        element.getAttribute("aria-label") ??
        element.getAttribute("value") ??
        element.textContent?.trim() ??
        element.tagName.toLowerCase();
      return [{ name, width: box.width, height: box.height }];
    }),
  );
  assert.ok(
    touchTargets.length >= 11,
    `${label}: expected every visible Teammates interactive to be measured`,
  );
  for (const target of touchTargets) {
    assert.ok(
      target.width >= 44 && target.height >= 44,
      `${label}: ${target.name || "unnamed control"} is ${target.width}x${target.height}, below 44x44`,
    );
  }
}

async function assertNoVisibleApplyLikeControls(teammatePane, label) {
  const visibleApplyLikeControls = await teammatePane
    .locator('button, [role="button"], a, input[type="button"], input[type="submit"]')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (
          box.width === 0 ||
          box.height === 0 ||
          style.display === "none" ||
          style.visibility === "hidden"
        ) return [];
        const name =
          element.getAttribute("aria-label") ??
          element.getAttribute("value") ??
          element.textContent ??
          "";
        return /\bapply\b/i.test(name.trim()) ? [name.trim()] : [];
      }),
    );
  assert.deepEqual(
    visibleApplyLikeControls,
    [],
    `${label}: visible apply-like control is forbidden in the Teammates pane`,
  );
}

async function assertRetainedAgentStudioInactive(page, retained, label) {
  await retained.waitFor({ state: "attached", timeout: 5000 });
  assert.equal(await retained.count(), 1, `${label}: expected exactly one retained Agent Studio`);
  assert.equal(await retained.getAttribute("hidden"), "", `${label}: retained Agent Studio is not native-hidden`);
  assert.equal(await retained.getAttribute("aria-hidden"), "true", `${label}: retained Agent Studio is exposed to accessibility APIs`);
  assert.notEqual(await retained.getAttribute("inert"), null, `${label}: retained Agent Studio remains interactive`);
  const box = await retained.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  assert.deepEqual(box, { width: 0, height: 0 }, `${label}: hidden Agent Studio still occupies layout`);
  assert.equal(await retained.locator(":focus").count(), 0, `${label}: retained Agent Studio owns focus`);
  const tabAnchor = "data-agent-studio-tab-cycle-anchor";
  const hasAnchor = await page.evaluate((attribute) => {
    if (!(document.activeElement instanceof HTMLElement)) return false;
    document.activeElement.setAttribute(attribute, "true");
    return true;
  }, tabAnchor);
  assert.equal(hasAnchor, true, `${label}: no outside focus anchor for tab-cycle proof`);
  let wrapped = false;
  let leftAnchor = false;
  try {
    for (let step = 0; step < 256; step += 1) {
      await page.keyboard.press("Tab");
      const state = await retained.evaluate((element, attribute) => ({
        inside: element.contains(document.activeElement),
        wrapped: document.activeElement?.getAttribute(attribute) === "true",
      }), tabAnchor);
      assert.equal(state.inside, false, `${label}: Tab entered the hidden/inert Agent Studio subtree`);
      if (!state.wrapped) leftAnchor = true;
      if (state.wrapped && leftAnchor) {
        wrapped = true;
        break;
      }
    }
  } finally {
    await page.locator(`[${tabAnchor}]`).evaluateAll((elements, attribute) => {
      for (const element of elements) element.removeAttribute(attribute);
    }, tabAnchor);
  }
  assert.equal(wrapped, true, `${label}: Tab did not complete a full page focus cycle`);
}

async function openAgentStudio(page, label, width, selectedEditId) {
  const agentStudioButton = page.getByRole("button", {
    name: "Agent Studio",
    exact: true,
  });
  await agentStudioButton.waitFor({ timeout: 5000 });
  const teammateRoutePattern = "**/api/ai-teammates/*";
  let rosterGetCount = 0;
  let rosterRetryActivated = false;
  let rosterRetryAttempt = 0;
  const retryHolds = Array.from({ length: 2 }, () => {
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    return { promise, release, released: false };
  });
  const releaseRetryHold = (attempt) => {
    const hold = retryHolds[attempt];
    if (!hold || hold.released) return;
    hold.released = true;
    hold.release();
  };
  await page.route(teammateRoutePattern, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    rosterGetCount += 1;
    if (!rosterRetryActivated) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary local roster failure." }),
      });
      return;
    }
    const attempt = rosterRetryAttempt;
    rosterRetryAttempt += 1;
    const hold = retryHolds[attempt];
    if (!hold) {
      await route.abort("failed");
      return;
    }
    await hold.promise;
    if (attempt === 0) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Retry still unavailable." }),
      });
      return;
    }
    await route.continue();
  });

  const agentStudio = page.locator(".agent-studio");
  const teammatePane = agentStudio.locator(
    '[data-agent-studio-pane="teammates"]:visible',
  );
  let firstRetryResponse;
  let secondRetryResponse;
  try {
    await agentStudioButton.click();
    await teammatePane.waitFor({ state: "visible", timeout: 8000 });
    await teammatePane.getByText("Local foundation", { exact: true }).waitFor({
      timeout: 8000,
    });
    await teammatePane.getByText("Temporary local roster failure.", { exact: true }).waitFor();
    assert.ok(rosterGetCount >= 1, `${label}: initial Local roster GET escaped the retry fixture`);
    assert.match(
      (await teammatePane.textContent()) ?? "",
      /Temporary local roster failure\./,
      `${label}: intercepted roster failure was not rendered`,
    );
    const retryRoster = teammatePane.getByRole("button", {
      name: "Try again",
      exact: true,
    });
    await retryRoster.waitFor({ timeout: 8000 });
    await retryRoster.focus();
    const initialRosterGetCount = rosterGetCount;
    rosterRetryActivated = true;
    firstRetryResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/api/ai-teammates/") &&
        response.status() === 503,
      { timeout: 8000 },
    );
    await retryRoster.click();
    await page.waitForTimeout(100);
    assert.equal(await retryRoster.count(), 1, `${label}: roster retry control unmounted while loading`);
    assert.equal(await retryRoster.getAttribute("aria-disabled"), "true", `${label}: roster retry did not expose its busy state`);
    assert.equal(await retryRoster.getAttribute("disabled"), null, `${label}: roster retry used native disabled and made the duplicate guard untestable`);
    assert.equal(await retryRoster.evaluate((element) => document.activeElement === element), true, `${label}: roster retry dropped focus while loading`);
    await teammatePane.getByText("Trying the local roster again…", { exact: true }).waitFor();
    const duplicateRosterRequest = page
      .waitForRequest(
        (request) =>
          request.method() === "GET" &&
          request.url().includes("/api/ai-teammates/"),
        { timeout: 750 },
      )
      .then(
        () => true,
        (error) => {
          if (error?.name === "TimeoutError") return false;
          throw error;
        },
      );
    await retryRoster.evaluate((button) => button.click());
    assert.equal(
      await duplicateRosterRequest,
      false,
      `${label}: aria-disabled roster retry allowed a duplicate GET`,
    );
    assert.equal(rosterGetCount, initialRosterGetCount + 1, `${label}: roster retry allowed a duplicate GET`);
    releaseRetryHold(0);
    await firstRetryResponse;
    await teammatePane.getByText("Retry still unavailable.", { exact: true }).waitFor({ timeout: 8000 });
    assert.equal(
      await retryRoster.evaluate((element) => document.activeElement === element),
      true,
      `${label}: failed roster retry did not restore focus to Try again`,
    );
    assert.equal(
      await retryRoster.getAttribute("aria-disabled"),
      null,
      `${label}: failed roster retry left Try again aria-disabled`,
    );

    const secondRosterGetCount = rosterGetCount;
    secondRetryResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/api/ai-teammates/") &&
        response.status() === 200,
      { timeout: 8000 },
    );
    await retryRoster.click();
    await teammatePane.getByText("Trying the local roster again…", { exact: true }).waitFor();
    assert.equal(await retryRoster.count(), 1, `${label}: second roster retry control unmounted while loading`);
    assert.equal(await retryRoster.getAttribute("aria-disabled"), "true", `${label}: second roster retry did not expose its busy state`);
    assert.equal(await retryRoster.getAttribute("disabled"), null, `${label}: second roster retry used native disabled`);
    assert.equal(rosterGetCount, secondRosterGetCount + 1, `${label}: second roster retry did not issue exactly one GET`);
    releaseRetryHold(1);
    await secondRetryResponse;
    const firstReadyRadio = teammatePane.getByRole("radio").first();
    await firstReadyRadio.waitFor({ timeout: 8000 });
    assert.equal(await firstReadyRadio.evaluate((element) => document.activeElement === element), true, `${label}: successful roster retry did not move focus to the restored roster`);
  } finally {
    releaseRetryHold(0);
    releaseRetryHold(1);
    await firstRetryResponse?.catch(() => undefined);
    await secondRetryResponse?.catch(() => undefined);
    await page.unroute(teammateRoutePattern);
  }
  await teammatePane.locator(".ai-teammate-roster").waitFor({ timeout: 8000 });
  await teammatePane
    .locator(".agent-studio__boundary", { hasText: selectedEditId })
    .getByText("No selection data is sent.", { exact: false })
    .waitFor({ timeout: 5000 });

  const radios = teammatePane.getByRole("radio");
  await radios.first().waitFor({ timeout: 8000 });
  const renderedRoles = await radios.evaluateAll((inputs) =>
    inputs.map(
      (input) =>
        input.closest("label")?.querySelector("strong")?.textContent?.trim() ??
        "",
    ),
  );
  assert.deepEqual(
    renderedRoles,
    AGENT_STUDIO_ROLES,
    `${label}: Agent Studio must expose the exact eight-role local roster`,
  );
  const visibleIdleRows = await teammatePane
    .getByText("Idle · Read + propose", { exact: true })
    .evaluateAll((elements) =>
      elements.filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      }).length,
    );
  assert.equal(
    visibleIdleRows,
    8,
    `${label}: Local foundation roster stopped reporting eight static Idle rows`,
  );

  const requiredControls = [
    ["mode controls", agentStudio.getByRole("group", { name: "Agent Studio mode" })],
    ["Teammates mode", agentStudio.getByRole("button", { name: "Teammates", exact: true })],
    ["Site advice mode", agentStudio.getByRole("button", { name: "Site advice", exact: true })],
    ["Assignment", teammatePane.getByRole("textbox", { name: "Assignment", exact: true })],
    ["Data class", teammatePane.getByRole("combobox", { name: "Data class", exact: true })],
  ];
  for (const [controlName, control] of requiredControls) {
    await control.waitFor({
      timeout: 5000,
      state: "visible",
    }).catch(() => {
      throw new Error(`${label}: Agent Studio ${controlName} control is missing`);
    });
  }
  const dataClassControl = teammatePane.getByRole("combobox", {
    name: "Data class",
    exact: true,
  });
  const dataClassDescription = await dataClassControl.getAttribute("aria-describedby");
  assert.ok(
    dataClassDescription?.split(/\s+/).includes("ai-teammate-data-class-help"),
    `${label}: Data class is not linked to its caller-asserted safety help`,
  );
  const exactDataClassHelp =
    "This is your label for the assignment text; nothing is scanned or read from the project. Enter only public or project-internal content. Do not paste credentials, cookies, client-sensitive information, release data, or appointment details.";
  const linkedDataClassHelp = await dataClassControl.evaluate(
    (element, expectedText) => {
      const normalize = (value) => value?.replace(/\s+/g, " ").trim() ?? "";
      const ids = element.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
      const help = ids
        .map((id) => document.getElementById(id))
        .find((candidate) => candidate?.id === "ai-teammate-data-class-help");
      return {
        found: Boolean(help),
        text: normalize(help?.textContent),
        matches: normalize(help?.textContent) === expectedText,
      };
    },
    exactDataClassHelp,
  );
  assert.deepEqual(
    linkedDataClassHelp,
    { found: true, text: exactDataClassHelp, matches: true },
    `${label}: Data class describedby does not resolve to the exact safety help`,
  );

  for (const boundary of [
    "Proposal only — nothing is applied automatically.",
    "No AI model or provider is connected in this Local foundation; it returns a fixed deterministic placeholder to prove the read/propose and receipt boundaries.",
    "Read + propose only",
    "No mutation, external effect, or authority",
  ]) {
    const visible = await page
      .locator('[data-agent-studio-pane="teammates"]:visible')
      .getByText(boundary, { exact: true })
      .isVisible()
      .catch(() => false);
    assert.equal(
      visible,
      true,
      `${label}: Agent Studio boundary is missing: ${boundary}`,
    );
  }

  const createProposal = teammatePane.locator('button[type="submit"]');
  await teammatePane
    .getByRole("button", {
      name: "Create placeholder proposal",
      exact: true,
    })
    .waitFor({ timeout: 5000 });
  assert.equal(
    await createProposal.isDisabled(),
    true,
    `${label}: Create placeholder proposal must remain disabled without an assignment`,
  );
  // Before any mode switch, prove every visible Teammates control meets the
  // compact-layout 44x44 hit-target contract at mobile and tablet widths.
  await assertAgentStudioTouchTargets({
    agentStudio,
    teammatePane,
    radios,
    createProposal,
    width,
    label,
  });

  await assertNoVisibleApplyLikeControls(teammatePane, label);

  const selectedTeammate = "QA Challenger";
  const assignment =
    "Review the current homepage proposal for bounded launch risks.";

  const firstRadio = radios.first();
  assert.equal(await firstRadio.isChecked(), true, `${label}: roster did not start on Researcher`);
  assert.equal(
    await teammatePane.getByRole("radio", { name: new RegExp(selectedTeammate) }).isChecked(),
    false,
    `${label}: QA Challenger was already selected before keyboard navigation`,
  );
  await firstRadio.focus();
  for (let step = 0; step < 5; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  const selectedRadio = teammatePane.getByRole("radio", {
    name: new RegExp(selectedTeammate),
  });
  assert.equal(
    await selectedRadio.isChecked(),
    true,
    `${label}: keyboard arrow navigation did not select ${selectedTeammate}`,
  );

  await page.keyboard.press("Tab");
  const assignmentControl = teammatePane.getByRole("textbox", {
    name: "Assignment",
    exact: true,
  });
  assert.equal(
    await assignmentControl.evaluate((element) => document.activeElement === element),
    true,
    `${label}: Tab from the roster did not reach Assignment`,
  );
  await page.keyboard.type(assignment);
  await page.keyboard.press("Tab");
  assert.equal(
    await dataClassControl.evaluate((element) => document.activeElement === element),
    true,
    `${label}: Tab from Assignment did not reach Data class`,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await createProposal.evaluate((element) => document.activeElement === element),
    true,
    `${label}: Tab from Data class did not reach Create placeholder proposal`,
  );
  const focusOutline = await createProposal.evaluate((element) => {
    const style = getComputedStyle(element);
    const parseColor = (value) => {
      const values = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return {
        red: values[0] ?? 0,
        green: values[1] ?? 0,
        blue: values[2] ?? 0,
        alpha: values[3] ?? 1,
      };
    };
    return {
      style: style.outlineStyle,
      width: style.outlineWidth,
      outline: parseColor(style.outlineColor),
      background: parseColor(style.backgroundColor),
    };
  });
  assert.notEqual(
    focusOutline.style,
    "none",
    `${label}: keyboard-focused Create placeholder proposal has no visible outline`,
  );
  assert.notEqual(
    focusOutline.width,
    "0px",
    `${label}: keyboard-focused Create placeholder proposal outline has zero width`,
  );
  assert.ok(focusOutline.outline.alpha >= 0.5, `${label}: keyboard-focused Create placeholder proposal outline is effectively transparent`);
  assert.notDeepEqual(
    [focusOutline.outline.red, focusOutline.outline.green, focusOutline.outline.blue],
    [focusOutline.background.red, focusOutline.background.green, focusOutline.background.blue],
    `${label}: focus outline blends into the submit background`,
  );
  assert.equal(
    await createProposal.isEnabled(),
    true,
    `${label}: a bounded assignment must enable Create placeholder proposal`,
  );

  let postCount = 0;
  let releasePost;
  const heldPost = new Promise((resolve) => {
    releasePost = resolve;
  });
  await page.route(teammateRoutePattern, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    postCount += 1;
    await heldPost;
    await route.continue();
  });

  const result = teammatePane.locator(".ai-teammate-result");
  let postReleased = false;
  let postResponse;
  const releaseHeldPost = () => {
    if (postReleased) return;
    postReleased = true;
    releasePost();
  };
  try {
    const radioSubmitRequest = page
      .waitForRequest(
        (request) =>
          request.method() === "POST" &&
          request.url().includes("/api/ai-teammates/"),
        { timeout: 500 },
      )
      .then(
        () => true,
        (error) => {
          if (error?.name === "TimeoutError") return false;
          throw error;
        },
      );
    await selectedRadio.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await radioSubmitRequest,
      false,
      `${label}: Enter on a roster radio implicitly submitted the assignment`,
    );
    assert.equal(postCount, 0, `${label}: roster keyboard use reached the POST handler`);
    assert.equal(
      await selectedRadio.evaluate((element) => document.activeElement === element),
      true,
      `${label}: roster keyboard use dropped focus`,
    );
    await createProposal.focus();
    const firstPostRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/api/ai-teammates/"),
      { timeout: 5000 },
    );
    await page.keyboard.press("Enter");
    const postRequest = await firstPostRequest;
    postResponse = page.waitForResponse(
      (response) => response.request() === postRequest,
      { timeout: 10000 },
    );
    const postBody = postRequest.postDataJSON();
    assert.deepEqual(
      Object.keys(postBody).sort(),
      [
        "childToolGrants",
        "dataClass",
        "effectClasses",
        "schemaVersion",
        "task",
        "teammateId",
        "toolGrants",
      ],
      `${label}: teammate POST gained selection or another unauthorized field`,
    );
    assert.equal(
      JSON.stringify(postBody).includes(selectedEditId),
      false,
      `${label}: teammate POST leaked the selected edit ID`,
    );
    const postUrl = new URL(postRequest.url());
    assert.equal(postUrl.search, "", `${label}: teammate POST gained an unauthorized query payload`);
    assert.equal(
      decodeURIComponent(postUrl.pathname).includes(selectedEditId),
      false,
      `${label}: teammate POST leaked the selected edit ID in its path`,
    );
    assert.equal(
      JSON.stringify(postRequest.headers()).includes(selectedEditId),
      false,
      `${label}: teammate POST leaked the selected edit ID in headers`,
    );
    await teammatePane.getByText("Creating a fixed deterministic placeholder…", { exact: true }).waitFor();
    assert.equal(
      await createProposal.getAttribute("disabled"),
      null,
      `${label}: working submit must not use native disabled`,
    );
    assert.equal(await createProposal.getAttribute("aria-disabled"), "true", `${label}: working submit must expose aria-disabled`);
    assert.equal(
      await createProposal.evaluate((element) => document.activeElement === element),
      true,
      `${label}: focus left the submit control while the local request was held`,
    );
    assert.equal(await radios.count(), 8, `${label}: roster disappeared during a held request`);
    assert.equal(
      await radios.evaluateAll(
        (inputs) =>
          inputs.length === 8 && inputs.every((input) => input.disabled),
      ),
      true,
      `${label}: at least one roster option remained enabled during a held request`,
    );
    assert.equal(
      await assignmentControl.getAttribute("disabled"),
      "",
      `${label}: assignment is not natively disabled during a held request`,
    );
    assert.equal(
      await dataClassControl.getAttribute("disabled"),
      "",
      `${label}: data class is not natively disabled during a held request`,
    );
    for (const modeName of ["Teammates", "Site advice"]) {
      const modeButton = agentStudio.getByRole("button", {
        name: modeName,
        exact: true,
      });
      assert.equal(
        await modeButton.getAttribute("disabled"),
        "",
        `${label}: ${modeName} mode is not natively disabled during a held request`,
      );
      await modeButton.evaluate((button) => button.click());
    }
    assert.equal(
      await agentStudio.getByRole("button", { name: "Teammates", exact: true }).getAttribute("aria-pressed"),
      "true",
      `${label}: forced mode activation left Teammates during a held request`,
    );
    assert.equal(
      await agentStudio.getByRole("button", { name: "Site advice", exact: true }).getAttribute("aria-pressed"),
      "false",
      `${label}: forced mode activation opened Site advice during a held request`,
    );
    assert.equal(postCount, 1, `${label}: mode activation changed the held request count`);
    const duplicateRequest = page
      .waitForRequest(
        (request) =>
          request.method() === "POST" &&
          request.url().includes("/api/ai-teammates/"),
        { timeout: 750 },
      )
      .then(
        () => true,
        (error) => {
          if (error?.name === "TimeoutError") return false;
          throw error;
        },
      );
    await page.keyboard.press("Enter");
    assert.equal(
      await duplicateRequest,
      false,
      `${label}: aria-disabled submit allowed a duplicate request`,
    );
    assert.equal(postCount, 1, `${label}: duplicate request reached the route handler`);
    releaseHeldPost();
    await result.waitFor({ state: "visible", timeout: 10000 });
    await postResponse;
    assert.equal(postCount, 1, `${label}: duplicate request appeared during result commit`);
  } finally {
    releaseHeldPost();
    await postResponse?.catch(() => undefined);
    await page.unroute(teammateRoutePattern);
  }
  await result.getByRole("heading", { name: "Placeholder proposal", exact: true }).waitFor();
  await result.getByText(`Role template: ${selectedTeammate}`, { exact: true }).waitFor();
  await result.getByText(`Assigned task: ${assignment}`, { exact: true }).waitFor();
  assert.equal(
    await createProposal.evaluate((element) => document.activeElement === element),
    true,
    `${label}: focus did not remain on submit after the result committed`,
  );

  const receipt = result.locator(".ai-teammate-receipt");
  await receipt.getByRole("heading", { name: "Run receipt", exact: true }).waitFor();
  for (const receiptValue of [
    "Proposal only — no project or site changes were applied.",
    "complete",
    "proposal-complete",
    selectedTeammate,
    "Read, propose",
    "deterministic-local",
    "one-box.proposal.local-foundation.v1",
    "None",
  ]) {
    await receipt.getByText(receiptValue, { exact: true }).first().waitFor();
  }

  for (const boundary of [
    "Proposal only — nothing is applied automatically.",
    "No AI model or provider is connected in this Local foundation; it returns a fixed deterministic placeholder to prove the read/propose and receipt boundaries.",
    "Read + propose only",
    "No mutation, external effect, or authority",
  ]) {
    await teammatePane.getByText(boundary, { exact: true }).waitFor();
  }
  await assertNoVisibleApplyLikeControls(teammatePane, `${label}: completed receipt`);

  await page.getByRole("button", { name: "Selection and layout", exact: true }).click();
  const retainedAgentStudio = page.locator('[data-retained-agent-studio="true"]');
  await assertRetainedAgentStudioInactive(page, retainedAgentStudio, `${label}: tool switch`);

  await agentStudioButton.click();
  const restoredPane = page.locator('[data-agent-studio-pane="teammates"]:visible');
  await restoredPane.waitFor({ state: "visible", timeout: 5000 });
  assert.equal(
    await restoredPane.getByRole("textbox", { name: "Assignment", exact: true }).inputValue(),
    assignment,
    `${label}: assignment was lost after leaving and returning to Agent Studio`,
  );
  await restoredPane.getByRole("heading", { name: "Placeholder proposal", exact: true }).waitFor();
  assert.equal(await selectedRadio.isChecked(), true, `${label}: selected teammate was lost after the tool switch`);
  await restoredPane.getByText(`Role template: ${selectedTeammate}`, { exact: true }).waitFor();
  await restoredPane.getByText(`Assigned task: ${assignment}`, { exact: true }).waitFor();
  await restoredPane.getByRole("heading", { name: "Run receipt", exact: true }).waitFor();

  await page.getByRole("button", { name: "View", exact: true }).click();
  await waitForMode(page, "View");
  await assertRetainedAgentStudioInactive(page, retainedAgentStudio, `${label}: View mode`);
  await enterEditModeStrict(page, `${label}: restore Edit mode`);
  await restoredPane.waitFor({ state: "visible", timeout: 5000 });
  assert.equal(
    await restoredPane.getByRole("textbox", { name: "Assignment", exact: true }).inputValue(),
    assignment,
    `${label}: assignment was lost across View/Edit`,
  );
  await restoredPane.getByRole("heading", { name: "Placeholder proposal", exact: true }).waitFor();
  assert.equal(await selectedRadio.isChecked(), true, `${label}: selected teammate was lost across View/Edit`);
  await restoredPane.getByText(`Role template: ${selectedTeammate}`, { exact: true }).waitFor();
  await restoredPane.getByText(`Assigned task: ${assignment}`, { exact: true }).waitFor();
  await restoredPane.getByRole("heading", { name: "Run receipt", exact: true }).waitFor();

  const collapseWorkbench = page.getByRole("button", {
    name: "Collapse workbench",
    exact: true,
  });
  await collapseWorkbench.click();
  const reopenWorkbench = page.getByRole("button", {
    name: "Reopen workbench",
    exact: true,
  });
  await reopenWorkbench.waitFor({ state: "visible", timeout: 5000 });
  const collapsedPanelState = await page.locator(".workbench-panel").evaluate(
    (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        hidden: element.hasAttribute("hidden"),
        ariaHidden: element.getAttribute("aria-hidden"),
        inert: element.hasAttribute("inert"),
        display: style.display,
        width: rect.width,
        height: rect.height,
      };
    },
  );
  assert.deepEqual(
    collapsedPanelState,
    {
      hidden: true,
      ariaHidden: "true",
      inert: true,
      display: "none",
      width: 0,
      height: 0,
    },
    `${label}: collapsed workbench panel remained in layout or accessibility`,
  );
  const collapsedNonRetainedContent = page.locator(
    ".workbench-panel__header, .workbench-breadcrumb, .workbench-composer, .workbench-panel__body > :not([data-retained-agent-studio])",
  );
  assert.equal(
    await collapsedNonRetainedContent.count(),
    0,
    `${label}: non-retained workbench content remained mounted after collapse`,
  );
  await assertRetainedAgentStudioInactive(
    page,
    retainedAgentStudio,
    `${label}: collapsed workbench`,
  );
  await reopenWorkbench.click();
  await restoredPane.waitFor({ state: "visible", timeout: 5000 });
  assert.equal(
    await restoredPane
      .getByRole("textbox", { name: "Assignment", exact: true })
      .inputValue(),
    assignment,
    `${label}: assignment was lost across collapse/reopen`,
  );
  await restoredPane
    .getByRole("heading", { name: "Placeholder proposal", exact: true })
    .waitFor();
  assert.equal(
    await selectedRadio.isChecked(),
    true,
    `${label}: selected teammate was lost across collapse/reopen`,
  );
  await restoredPane
    .getByText(`Role template: ${selectedTeammate}`, { exact: true })
    .waitFor();
  await restoredPane
    .getByText(`Assigned task: ${assignment}`, { exact: true })
    .waitFor();
  await restoredPane
    .getByRole("heading", { name: "Run receipt", exact: true })
    .waitFor();
}

// Each surface is captured under its own label so a G9/G7 failure names
// exactly which state broke. The four "workbench-*" states drive the
// canvas-upgrade chrome the original harness predates (SelectionBreadcrumb,
// PersistentComposer in both its with/without-selection shapes,
// UndoRedoRail -- always mounted regardless of selection -- and the Layers
// tool's ARIA tree).
const SURFACES = [
  { name: "intake", url: `${base}/`, wait: 3500 },
  { name: "pipeline", url: `${base}/?run=${RUN_SCAN}`, wait: 7000 },
  { name: "evidence", url: `${base}/evidence/${RUN_BUILT}`, wait: 5500 },
  {
    name: "workbench-no-selection",
    url: `${base}/preview/${RUN_BUILT}`,
    wait: 7000,
    async setup(page, label) {
      await ensureWorkbenchOpen(page);
      // No further action: previewState.ts defaults to mode "edit" with no
      // selection, which is itself the distinct state the persistent
      // composer must handle honestly (typable, submit refused, reason
      // shown) -- canvas-coverage.mjs's composer-reach assertion already
      // proves the honesty; this proves the rendered chrome stays inside
      // the visual contract in that exact state.
      void label;
    },
  },
  {
    name: "workbench-section-selected",
    // Uses fixtureRunId, not RUN_BUILT -- see the comment above
    // buildSectionFixture() for why RUN_BUILT cannot exercise this state.
    url: `${base}/preview/${fixtureRunId}`,
    wait: 7000,
    async setup(page, label) {
      await ensureWorkbenchOpen(page);
      await selectFirstSection(page, label);
    },
  },
  {
    name: "workbench-layers",
    url: `${base}/preview/${RUN_BUILT}`,
    wait: 7000,
    async setup(page, label) {
      await ensureWorkbenchOpen(page);
      await openLayersTool(page, label);
    },
  },
  {
    name: "workbench-agent-studio",
    // Like the section-selected surface, Agent Studio needs an editable run;
    // RUN_BUILT is frozen and exposes a disabled Edit control.
    url: `${base}/preview/${fixtureRunId}`,
    wait: 7000,
    async setup(page, label, width) {
      await ensureWorkbenchOpen(page, { strict: true, label });
      const selectedEditId = await selectFirstSection(page, label);
      assert.ok(selectedEditId, `${label}: Agent Studio proof requires a live Canvas selection`);
      await openAgentStudio(page, label, width, selectedEditId);
    },
  },
];

async function navigateToSurface(page, surface, label) {
  if (surface.name !== "workbench-agent-studio") {
    await page
      .goto(surface.url, { waitUntil: "networkidle", timeout: 60000 })
      .catch(() => {});
    return;
  }
  const response = await page.goto(surface.url, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  assert.ok(response, `${label}: navigation returned no response`);
  assert.equal(
    response.ok(),
    true,
    `${label}: navigation failed with HTTP ${response.status()}`,
  );
}

const AUDIT = () => {
  const els = Array.from(document.querySelectorAll("body *"));
  const isLime = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const [r, g, b, a] = m[1].split(",").map(Number);
    if (a !== undefined && a < 0.5) return false;
    return r > 180 && g > 200 && b < 120;
  };
  const out = { limeFills: [], tallControls: [], heavy: [], pills: [], noTransition: [], bigMedia: [], focusless: [] };
  for (const el of els) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const tag = el.tagName.toLowerCase();
    const cls = (typeof el.className === "string" ? el.className : "").slice(0, 48);
    const txt = (el.textContent || "").trim().slice(0, 26);
    const interactive = tag === "button" || tag === "a" || el.getAttribute("role") === "button";
    if (isLime(s.backgroundColor) && interactive) out.limeFills.push(`${tag}.${cls} "${txt}"`);
    // An anchor/button wrapping only an image is a bounded thumbnail, which
    // DESIGN.md's "Long-run disclosure" explicitly sanctions at a fixed
    // size -- it is not a "control" the 34px cap governs. Proxy: an <img>
    // filling most of the box means the box IS the thumbnail, not a control
    // that happens to carry an icon.
    const img = el.querySelector(":scope > img, :scope > figure > img");
    const imageOnly = Boolean(img) && img.getBoundingClientRect().height > r.height * 0.6;
    if (interactive && !imageOnly && r.height > 34.5 && r.height < 300) out.tallControls.push(`${tag}.${cls} h=${r.height.toFixed(0)} "${txt}"`);
    if (interactive && parseFloat(s.borderTopLeftRadius) > 100) out.pills.push(`${tag}.${cls} "${txt}"`);
    if (parseInt(s.fontWeight, 10) >= 700 && txt) out.heavy.push(`${tag}.${cls} w=${s.fontWeight} "${txt}"`);
    if (interactive && s.transitionDuration === "0s") out.noTransition.push(`${tag}.${cls} "${txt}"`);
    if (/^(img|iframe|canvas|video)$/.test(tag) && r.height > 900) out.bigMedia.push(`${tag} h=${r.height.toFixed(0)} ${(el.getAttribute("src") || "").slice(-38)}`);
  }
  return {
    height: document.body.scrollHeight,
    nodes: els.length,
    ...Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...new Set(v)].slice(0, 12)])),
  };
};

const browser = await chromium.launch();
const problems = [];

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + String(e).slice(0, 160)));

  for (const s of SURFACES) {
    const label = `${s.name}@${w}`;
    await navigateToSurface(page, s, label);
    if (s.name.startsWith("workbench")) {
      if (s.name === "workbench-agent-studio") {
        await enterEditModeStrict(page, label);
      } else {
      const editButton = page.getByRole("button", { name: "Edit", exact: true });
      await editButton.waitFor({ timeout: 8000 }).catch(() => {});
      if ((await editButton.count()) > 0 && !(await editButton.isDisabled())) {
        if ((await editButton.getAttribute("aria-pressed")) !== "true") {
          await editButton.click();
        }
        await waitForMode(page, "Edit");
      }
      }
    }
    await page.waitForTimeout(s.wait);
    if (s.setup) await s.setup(page, label, w);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});

    console.log(`\n### ${label} — height=${await page.evaluate(() => document.body.scrollHeight)}px`);

    if (!AXE_ONLY) {
      const a = await page.evaluate(AUDIT);
      await page.screenshot({ path: `${OUT}/${s.name}-${w}.png`, fullPage: w === 1440 });

      const say = (labelName, arr, bad) => {
        if (arr.length) {
          console.log(`  ${bad ? "✗" : "·"} ${labelName} [${arr.length}]`);
          arr.forEach((x) => console.log(`      ${x}`));
          if (bad) problems.push(`${label}: ${labelName} — ${arr.length}`);
        }
      };
      // DESIGN.md caps lime at ONE action per view; it does not require
      // one. Zero is correct wherever the view's primary action is
      // unavailable. Two is always a violation.
      if (a.limeFills.length > 1) {
        console.log(`  ✗ lime actions: ${a.limeFills.length} (contract: at most 1)`);
        a.limeFills.forEach((x) => console.log(`      ${x}`));
        problems.push(`${label}: ${a.limeFills.length} lime actions`);
      } else if (a.limeFills.length === 1) {
        console.log(`  ✓ lime actions: 1 — ${a.limeFills[0]}`);
      } else {
        console.log(`  · lime actions: 0 (no primary action available in this state)`);
      }
      if (w > 768) say("controls over 34px", a.tallControls, true);
      say("pill-radius interactives", a.pills, false);
      say("weight >= 700", a.heavy, true);
      say("media taller than 900px", a.bigMedia, true);
      say("interactives with no transition", a.noTransition, false);
      if (a.height > 6000) { console.log(`  ✗ page height ${a.height}px`); problems.push(`${label}: ${a.height}px tall`); }
    }

    // axe runs at EVERY width (G7: "1440 / 768 / 390"), not only 1440 --
    // the prior harness only checked 1440, which left G7 unproven at the
    // two narrower widths.
    try {
      const res = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .exclude("iframe")
        .analyze();
      const v = res.violations.filter((x) => x.impact === "critical" || x.impact === "serious");
      if (v.length) {
        console.log(`  ✗ axe serious/critical [${v.length}]`);
        v.forEach((x) => console.log(`      ${x.impact} ${x.id}: ${x.nodes.length}× — ${x.help}`));
        problems.push(`${label}: axe ${v.length} serious/critical`);
      } else {
        console.log(`  ✓ axe: no serious/critical violations`);
      }
    } catch (e) {
      const detail = String(e).replace(/\s+/g, " ").slice(0, 160);
      console.log(`  ✗ axe analysis failed: ${detail}`);
      problems.push(`${label}: axe analysis failed — ${detail}`);
    }
  }
  if (consoleErrors.length) {
    console.log(`\n### console errors @${w}px:`);
    [...new Set(consoleErrors)].slice(0, 8).forEach((e) => console.log("   " + e));
  }
  await ctx.close();
}

console.log("\n================ [canvas-contract] SUMMARY ================");
if (problems.length === 0) {
  console.log("No contract or accessibility problems detected.");
} else {
  problems.forEach((p) => console.log("PROBLEM: " + p));
}
await browser.close();
await fs.rm(fixtureRoot, { recursive: true, force: true });
process.exitCode = problems.length === 0 ? 0 : 1;
