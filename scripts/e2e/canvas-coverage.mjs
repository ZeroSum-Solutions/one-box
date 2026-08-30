/**
 * scripts/e2e/canvas-coverage.mjs
 *
 * Verification harness for the canvas-upgrade contract
 * (docs/specs/2026-08-16-canvas-upgrade.md), criteria A1/A2/A3/B1. Builds a
 * throwaway full-section fixture site through the real
 * templates/local-service/ + src/lib/builder.ts pipeline (same fixture
 * fields as scripts/smoke/gates-smoke.mjs, so every gated section is
 * present), then drives the edit iframe at ONEBOX_BASE_URL with Playwright —
 * the same idiom as scripts/e2e/preview-workbench.mjs.
 *
 * Run from the repo root: node scripts/e2e/canvas-coverage.mjs [--assert
 * sections] [--assert coverage] [--assert tree-walk] [--assert
 * composer-reach] [--assert layers-sync]
 *
 * With no --assert flags, all five run. composer-reach (B1, canvas-upgrade
 * Wave 3 "Persistent Any-Selection Chat Composer") now passes: it drives the
 * real .workbench-composer mount, present in workbench chrome outside every
 * tool's own panelContent() switch, across all eight tools (the Layers tool,
 * canvas-upgrade Wave 5 Play 6, added to the WORKBENCH_TOOLS list below)
 * crossed with {selection, no selection}. It does not stop at "present and
 * enabled" — for a selection state it fills a real instruction, intercepts
 * the network (no live model call, so this stays deterministic and
 * credential-free like every other assertion here), and asserts the
 * captured POST /api/edit body names the selected element's own editId; for
 * a no-selection state it asserts the opposite — the composer stays typable
 * but its submit control is refused and the panel says so, so a scopeless
 * instruction can never reach the network silently (canvas-upgrade B1 item
 * d).
 *
 * layers-sync (canvas-upgrade Wave 5, Play 6) proves the Webflow-Navigator
 * bar this play is built against: "the tree and the canvas are the same
 * selection state," in BOTH directions -- clicking a Layers row selects
 * that element on canvas, and selecting an element on canvas marks the
 * matching Layers row.
 */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

// --- extension-resolution shim (matches scripts/smoke/gates-smoke.mjs) -----
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

const base = process.env.ONEBOX_BASE_URL ?? "http://localhost:3000";
const root = process.cwd();
const runId = `canvas-coverage-${Date.now().toString(36)}`;
const runRoot = path.join(root, "sites", runId);

const ALL_ASSERTIONS = ["sections", "coverage", "tree-walk", "composer-reach", "layers-sync"];
const WORKBENCH_TOOLS = [
  { id: "selection", label: "Selection and layout" },
  { id: "text", label: "Text and button" },
  { id: "assets", label: "Assets" },
  { id: "layers", label: "Layers" },
  { id: "research", label: "Research" },
  { id: "assistant", label: "Agent Studio" },
  { id: "tokens", label: "Tokens" },
  { id: "motion", label: "Motion" },
];

function parseRequestedAssertions(argv) {
  const requested = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--assert") continue;
    const name = argv[i + 1];
    if (!ALL_ASSERTIONS.includes(name)) {
      throw new Error(`unknown --assert target "${name}" (expected one of ${ALL_ASSERTIONS.join(", ")})`);
    }
    requested.push(name);
    i += 1;
  }
  return requested.length ? requested : ALL_ASSERTIONS;
}

const requestedAssertions = parseRequestedAssertions(process.argv.slice(2));

// ---------- fixture (full-section, same field conventions as gates-smoke) --

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

// ---------- Playwright helpers (idiom mirrors preview-workbench.mjs) -------

async function waitForMode(page, mode) {
  await page.waitForFunction(
    (expected) =>
      [...document.querySelectorAll("button[aria-pressed='true']")].some(
        (button) => button.textContent?.trim() === expected,
      ),
    mode,
  );
}

async function openEditPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/preview/${runId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit", exact: true }).waitFor();
  await waitForMode(page, "Edit");
  await page.frameLocator("iframe").locator("[data-edit-id]").first().waitFor();
  const child = page.frames()[1];
  return { context, page, child };
}

/** Captures every `onebox-editor-state` envelope the overlay posts to the
 * parent window, so an assertion can read the exact PreviewSelection
 * (including `behavior`) rather than inferring it from rendered UI text. */
async function installCapture(page) {
  await page.evaluate(() => {
    window.__oneboxCaptured = [];
    window.addEventListener("message", (event) => {
      if (event?.data?.type === "onebox-editor-state") {
        window.__oneboxCaptured.push(event.data);
      }
    });
  });
}

async function resetCapture(page) {
  await page.evaluate(() => {
    window.__oneboxCaptured = [];
  });
}

/** Wraps the raw wait in a labeled failure. Playwright's own timeout error
 * ("page.waitForFunction: Timeout 3000ms exceeded") names neither the node
 * nor the action under test, so a probe click that produces NO
 * `onebox-editor-state` message at all previously surfaced as an opaque
 * stall instead of a diagnosable assertion (wave-1 critic finding). `label`
 * identifies exactly what was expected to respond. */
async function waitForCaptured(page, label, timeout = 3000) {
  try {
    await page.waitForFunction(() => window.__oneboxCaptured?.length > 0, undefined, { timeout });
  } catch {
    throw new Error(
      `no selection message produced for ${label ?? "(unlabeled probe)"} within ${timeout}ms`,
    );
  }
}

async function lastCaptured(page) {
  return page.evaluate(() => window.__oneboxCaptured.at(-1) ?? null);
}

/** Dispatches a real click AT the element itself (event.target === the
 * element), rather than clicking screen coordinates that a covering child
 * might intercept — the overlay's nearestEditable() walk starts from
 * event.target, so this exercises exactly the same code path a mouse click
 * on that element's own exposed chrome would. */
async function clickEditable(child, editId) {
  const found = await child.evaluate((id) => {
    const el = document.querySelector(`[data-edit-id="${CSS.escape(id)}"]`);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }, editId);
  assert.ok(found, `no element with data-edit-id="${editId}" in the rendered site`);
}

async function selectViaClick(page, child, editId) {
  await resetCapture(page);
  await clickEditable(child, editId);
  await waitForCaptured(page, `a click on [data-edit-id="${editId}"]`);
  return lastCaptured(page);
}

// ---------- --assert sections (A1) -----------------------------------------

async function assertSections(browser) {
  const { context, page, child } = await openEditPage(browser);
  try {
    await installCapture(page);
    const sectionIds = await child.evaluate(() =>
      Array.from(document.querySelectorAll("section")).map((el) => el.getAttribute("data-edit-id")),
    );
    const unmarked = sectionIds.filter((id) => !id);
    assert.equal(
      unmarked.length,
      0,
      `sections: ${unmarked.length} <section> element(s) render with no data-edit-id at all`,
    );

    const failures = [];
    for (const editId of sectionIds) {
      const message = await selectViaClick(page, child, editId);
      const gotId = message?.selection?.editId;
      const gotBehavior = message?.selection?.behavior;
      // "role is section-level" (A1) is reported through SelectionBehavior:
      // a section only ever reports "container" once it holds other
      // editable nodes — see public/overlay.js behaviorFor().
      if (gotId !== editId || gotBehavior !== "container") {
        failures.push(`${editId}: selection.editId=${gotId ?? "none"} selection.behavior=${gotBehavior ?? "none"}`);
      }
    }
    assert.equal(
      failures.length,
      0,
      `sections: ${failures.length}/${sectionIds.length} section(s) not selectable as their own container — ${failures.join("; ")}`,
    );
    console.log(`[canvas-coverage] sections: ${sectionIds.length}/${sectionIds.length} sections selectable, all reporting behavior "container"`);
  } finally {
    await context.close();
  }
}

// ---------- --assert coverage (A2) ------------------------------------------
//
// REWRITTEN (canvas-upgrade fix round). The previous version decided
// "reachable" with `!el.closest("[data-edit-id]")` — but wave 1 stamped
// data-edit-id on every <section>/<header>/<footer>, so after that change
// EVERY element in the body has such an ancestor and that check could
// essentially never fail. It reported 100% while proving nothing: a node
// selecting its enclosing section's edit id "closest()"-matched exactly the
// same as a node selecting its own. This version fixes both halves of that:
//
//   1. The EXPECTED set of content nodes is derived from the rendered
//      document's own structure — direct (non-descendant) text, <img>,
//      role="img" placeholders, and native interactive controls — and
//      NEVER from the data-edit-id attribute the feature itself applies.
//      (The old version's `el.hasAttribute("data-edit-id")` branch is gone
//      for the same reason `closest()` is: an attribute the feature
//      controls cannot also decide what the feature is required to cover.)
//   2. Coverage is proven, not inferred: every expected node is actually
//      clicked in the live iframe, and the assertion checks that the
//      PreviewSelection which comes back names THAT NODE's own edit id —
//      not merely SOME ancestor's.
//
// A very small number of nodes can legitimately have no separate identity:
// where an element's entire rendered content is one nested child and that
// child's parent already carries the id (today: the hero <img> when a real
// hero photo is present — the wrapping div and the photo are one and the
// same editable "hero image", not a container over a distinct child). Those
// are counted separately as "exempt" and named in the log, never silently
// folded into either pass or fail.
async function assertCoverage(browser) {
  const { context, page, child } = await openEditPage(browser);
  try {
    await installCapture(page);

    const expected = await child.evaluate(() => {
      function isPassThroughChild(el) {
        const parent = el.parentElement;
        if (!parent || !parent.hasAttribute("data-edit-id")) return false;
        if (parent.children.length !== 1) return false;
        for (const node of parent.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) return false;
        }
        return true;
      }
      function isContentNode(el) {
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return false;
        if (el.tagName === "IMG") return true;
        if (el.getAttribute("role") === "img") return true;
        if (el.matches("a,button,input,select,textarea,[role='button'],[role='link']")) return true;
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) return true;
        }
        return false;
      }
      const nodes = Array.from(document.querySelectorAll("body *")).filter(isContentNode);
      return nodes.map((el, i) => {
        // Marks each node with a throwaway probe attribute so the harness
        // can click this EXACT element next, independent of whether it
        // carries its own data-edit-id (most do; that's what's under test).
        el.setAttribute("data-onebox-coverage-probe", String(i));
        return {
          probeIndex: i,
          ownEditId: el.getAttribute("data-edit-id") || null,
          tag: el.tagName.toLowerCase(),
          cls: el.getAttribute("class") || "",
          text: (el.textContent || "").trim().slice(0, 60),
          passThrough: isPassThroughChild(el),
        };
      });
    });

    const covered = [];
    const uncovered = [];
    const exempt = [];
    for (const node of expected) {
      const label = `<${node.tag}${node.cls ? ` class="${node.cls}"` : ""}> "${node.text}"`;
      await resetCapture(page);
      const found = await child.evaluate((i) => {
        const el = document.querySelector(`[data-onebox-coverage-probe="${i}"]`);
        if (!el) return false;
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
      }, node.probeIndex);
      assert.ok(found, `coverage: probe ${node.probeIndex} disappeared from the DOM mid-run`);
      await waitForCaptured(page, `a click on probe ${node.probeIndex} ${label}`);
      const message = await lastCaptured(page);
      const gotId = message?.selection?.editId ?? null;
      if (node.ownEditId && gotId === node.ownEditId) {
        covered.push(node);
      } else if (!node.ownEditId && node.passThrough) {
        exempt.push({ ...node, label, resolvedTo: gotId ?? "none" });
      } else {
        uncovered.push({ ...node, label, resolvedTo: gotId ?? "none" });
      }
    }

    // Nodes with no separate identity by design (exempt) are excluded from
    // the denominator — they were never supposed to carry their own id, so
    // counting them as either a hit or a miss would misstate the number.
    const addressable = covered.length + uncovered.length;
    const percent = addressable === 0 ? 100 : Math.round((covered.length / addressable) * 1000) / 10;
    console.log(
      `[canvas-coverage] coverage: ${covered.length}/${addressable} content nodes select THEMSELVES on click (${percent}%)`,
    );
    if (exempt.length) {
      console.log(
        `[canvas-coverage] coverage: ${exempt.length} node(s) exempt — sole content of an already-identified parent, no separate identity needed:`,
      );
      for (const node of exempt) console.log(`  ${node.label} (click selects ${node.resolvedTo})`);
    }
    if (uncovered.length) {
      console.log("[canvas-coverage] coverage: uncovered nodes — click selects an ancestor, not the node itself:");
      for (const node of uncovered) console.log(`  ${node.label} (click selects ${node.resolvedTo} instead of itself)`);
    }
    assert.equal(
      uncovered.length,
      0,
      `coverage: ${percent}% (${covered.length}/${addressable}) — expected 100%, ${uncovered.length} node(s) select an ancestor instead of themselves (see log above)`,
    );
  } finally {
    await context.close();
  }
}

// ---------- --assert tree-walk (A3) -----------------------------------------
//
// Written against the real UI (a labeled "…parent…" / "…back…" control
// reachable from an active selection) rather than stubbed. Exercises the
// canvas-upgrade Select-Parent Escalation control end to end: select a
// leaf, climb to its enclosing section via the workbench's "Select parent"
// button (overlay.js's climbToParent, reached through the select-parent
// command channel -- the pointer route that must agree with the ArrowUp
// keyboard shortcut), then step back down via "Back" (stepBackFromClimb).

async function assertTreeWalk(browser) {
  const { context, page, child } = await openEditPage(browser);
  try {
    await installCapture(page);
    const leaf = await selectViaClick(page, child, "hero.headline");
    assert.equal(
      leaf?.selection?.editId,
      "hero.headline",
      "tree-walk: could not even establish the starting leaf selection",
    );

    const parentControl = page.getByRole("button", { name: /parent/i });
    await parentControl.waitFor({ timeout: 3000 });
    await resetCapture(page);
    await parentControl.click();
    await waitForCaptured(page, "the workbench's Select parent control (climb from hero.headline)");
    const parent = await lastCaptured(page);
    assert.equal(parent?.selection?.editId, "hero", "tree-walk: the parent hop did not select the leaf's section");
    assert.equal(parent?.selection?.behavior, "container", "tree-walk: the parent hop selection was not reported as a container");

    const childControl = page.getByRole("button", { name: /child|back/i });
    await childControl.waitFor({ timeout: 3000 });
    await resetCapture(page);
    await childControl.click();
    await waitForCaptured(page, "the workbench's Back control (step back from hero)");
    const back = await lastCaptured(page);
    assert.equal(back?.selection?.editId, "hero.headline", "tree-walk: the child step did not return to the original leaf");
    console.log("[canvas-coverage] tree-walk: leaf -> parent section -> leaf round-trip confirmed");
  } finally {
    await context.close();
  }
}

// ---------- --assert composer-reach (B1) ------------------------------------
//
// Targets .workbench-composer specifically (canvas-upgrade Wave 3), not just
// "any .composer" — the assistant tool renders its OWN separate ChatComposer
// too (a different feature: conversational Q&A over /api/assistant, not a
// scoped edit instruction over /api/edit), and a generic "some composer
// exists somewhere in this panel" check would let that stand in for the
// persistent one this criterion is actually about.

async function composerIsUsable(page) {
  // Panels remount on every tool switch (panelContent() only renders the
  // active tool) — give the persistent composer's own mount a beat to
  // settle so a genuinely-missing composer and a still-mounting one are
  // never conflated.
  const textarea = page.locator(".workbench-composer .composer textarea");
  const settled = await textarea
    .waitFor({ state: "attached", timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (!settled) return false;
  return (await textarea.isVisible()) && !(await textarea.isDisabled());
}

/** With no selection, B1 requires the composer to stay honest rather than
 * silently guessing a target: typable, but its submit control refused and
 * the panel visibly says why. Proves the negative — a scopeless instruction
 * has no way to reach the network. */
async function composerHonestlyBlocksWithNoTarget(page) {
  const submit = page.locator(".workbench-composer .composer button[type='submit']");
  const disabled = await submit.isDisabled();
  const explained = await page
    .locator(".workbench-composer")
    .getByText("No element selected", { exact: false })
    .isVisible()
    .catch(() => false);
  return disabled && explained;
}

/** With a selection, B1 requires the composer to genuinely reach
 * POST /api/edit naming that selection's own editId — not merely render.
 * The request is intercepted and fulfilled with a synthetic rejection
 * (never forwarded), so this stays deterministic and free of any live model
 * call, matching the rest of this harness. */
async function composerSubmitsWithEditId(page, tool, expectedEditId) {
  const probeText = `composer-reach probe: ${tool.id}`;
  const captured = [];
  await page.route("**/api/edit", async (route) => {
    captured.push(route.request().postDataJSON());
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "composer-reach harness intercept — no mutation performed" }),
    });
  });
  try {
    const textarea = page.locator(".workbench-composer .composer textarea");
    await textarea.fill(probeText);
    const submit = page.locator(".workbench-composer .composer button[type='submit']");
    if (await submit.isDisabled()) return { ok: false, reason: "submit control stayed disabled with a selection present" };
    await submit.click();
    // `captured` fills in on the Node side (Playwright routes run there, not
    // in the page), so this polls Node state directly rather than
    // page.waitForFunction, which can only see state inside the browser.
    const deadline = Date.now() + 3000;
    while (captured.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (captured.length === 0) return { ok: false, reason: "no POST /api/edit was ever sent" };
    const body = captured.at(-1);
    if (body?.editId !== expectedEditId) {
      return { ok: false, reason: `POST /api/edit carried editId=${body?.editId ?? "none"}, expected ${expectedEditId}` };
    }
    if (typeof body?.instruction !== "string" || !body.instruction.includes(probeText)) {
      return { ok: false, reason: "POST /api/edit did not carry the typed instruction" };
    }
    return { ok: true };
  } finally {
    await page.unroute("**/api/edit");
  }
}

async function assertComposerReach(browser) {
  const { context, page, child } = await openEditPage(browser);
  try {
    const failures = [];

    async function switchTo(tool) {
      await page.getByRole("button", { name: tool.label, exact: true }).click();
      await page
        .locator("#workbench-title")
        .filter({ hasText: tool.label })
        .waitFor({ timeout: 2000 })
        .catch(() => {});
    }

    for (const tool of WORKBENCH_TOOLS) {
      await switchTo(tool);
      if (!(await composerIsUsable(page))) {
        failures.push(`${tool.id} (no selection): composer not present/visible/enabled`);
        continue;
      }
      if (!(await composerHonestlyBlocksWithNoTarget(page))) {
        failures.push(`${tool.id} (no selection): did not honestly refuse a scopeless submission`);
      }
    }

    await clickEditable(child, "hero.headline");
    await page.getByText("hero.headline", { exact: false }).first().waitFor({ timeout: 3000 }).catch(() => {});

    for (const tool of WORKBENCH_TOOLS) {
      await switchTo(tool);
      if (!(await composerIsUsable(page))) {
        failures.push(`${tool.id} (selection): composer not present/visible/enabled`);
        continue;
      }
      const result = await composerSubmitsWithEditId(page, tool, "hero.headline");
      if (!result.ok) failures.push(`${tool.id} (selection): ${result.reason}`);
    }

    const total = WORKBENCH_TOOLS.length * 2;
    console.log(
      `[canvas-coverage] composer-reach: ${total - failures.length}/${total} tool x selection states have a usable, genuinely-wired composer`,
    );
    assert.equal(
      failures.length,
      0,
      `composer-reach: ${failures.length}/${total} state(s) failed — ${failures.join("; ")}`,
    );
  } finally {
    await context.close();
  }
}

// ---------- --assert layers-sync (Wave 5, Play 6) ---------------------------
//
// Proves BOTH directions of "the tree and the canvas are one selection
// state" (the Webflow Navigator bar): a click in the iframe on the canvas
// must mark the matching Layers row, and a click on a Layers row must
// select that element on the canvas. Each direction is asserted through a
// route no other assertion here exercises -- .layers-tree__row's own
// aria-selected attribute for canvas->tree, and a real click dispatched on
// that row (not a synthetic overlay.js message) for tree->canvas -- so
// either one breaking independently is caught, not just "some selection
// changed somewhere."

async function openLayersTool(page) {
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .locator("#workbench-title")
    .filter({ hasText: "Layers" })
    .waitFor({ timeout: 2000 });
}

function layersRow(page, editId) {
  return page.locator(`.layers-tree__row[title="${editId}"]`);
}

async function assertLayersSync(browser) {
  const { context, page, child } = await openEditPage(browser);
  try {
    await installCapture(page);
    await openLayersTool(page);
    await layersRow(page, "hero.headline").waitFor({ timeout: 3000 });

    // Direction 1: selecting on canvas marks the matching Layers row.
    await clickEditable(child, "hero.headline");
    await waitForCaptured(page, 'a canvas click on [data-edit-id="hero.headline"]');
    const markedRow = layersRow(page, "hero.headline");
    await markedRow.waitFor({ timeout: 2000 });
    assert.equal(
      await markedRow.getAttribute("aria-selected"),
      "true",
      "layers-sync (canvas -> tree): selecting hero.headline on canvas did not mark its Layers row",
    );
    const otherRowStaysUnmarked = await layersRow(page, "services.intro").getAttribute("aria-selected");
    assert.notEqual(
      otherRowStaysUnmarked,
      "true",
      "layers-sync (canvas -> tree): an unrelated row (services.intro) was marked selected too",
    );

    // Direction 2: clicking a Layers row selects that element on canvas --
    // through a REAL click on the row DOM node, the same path a user takes.
    await resetCapture(page);
    await layersRow(page, "services.intro").click();
    await waitForCaptured(page, "a click on the Layers row for services.intro");
    const fromRowClick = await lastCaptured(page);
    assert.equal(
      fromRowClick?.selection?.editId,
      "services.intro",
      "layers-sync (tree -> canvas): clicking the Layers row for services.intro did not select it on canvas",
    );

    console.log("[canvas-coverage] layers-sync: canvas -> tree mark and tree -> canvas select both confirmed");
  } finally {
    await context.close();
  }
}

// ---------- run --------------------------------------------------------------

const ASSERTIONS = {
  sections: assertSections,
  coverage: assertCoverage,
  "tree-walk": assertTreeWalk,
  "composer-reach": assertComposerReach,
  "layers-sync": assertLayersSync,
};

async function main() {
  await fs.rm(runRoot, { recursive: true, force: true });
  await fs.mkdir(runRoot, { recursive: true });
  // A minimal legacy-v1 run.json keeps the fixture aligned with the
  // composer-reach assertion, which drives Agent Studio's real Site advice
  // pane, whose GET /api/assistant/<id> route 404s without one. Writing it keeps
  // that assertion honest about the Site advice composer's real state
  // instead of an artifact of an incomplete fixture.
  const runState = {
    id: runId,
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
  await fs.writeFile(path.join(runRoot, "run.json"), JSON.stringify(runState, null, 2));
  await buildAndPublishSiteFixture({ runId, intake, tokens, skeleton, copy, assets: {} });

  const browser = await chromium.launch();
  const results = [];
  try {
    for (const name of requestedAssertions) {
      try {
        await ASSERTIONS[name](browser);
        results.push({ name, pass: true });
      } catch (error) {
        results.push({ name, pass: false, error });
      }
    }
  } finally {
    await browser.close();
    await fs.rm(runRoot, { recursive: true, force: true });
  }

  let anyFail = false;
  for (const result of results) {
    if (result.pass) {
      console.log(`[canvas-coverage] PASS ${result.name}`);
    } else {
      anyFail = true;
      console.error(`[canvas-coverage] FAIL ${result.name}: ${result.error.message}`);
    }
  }
  process.exitCode = anyFail ? 1 : 0;
}

await main();
