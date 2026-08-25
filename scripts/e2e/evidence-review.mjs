import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { registerHooks } from "node:module";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

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
const output = path.join(process.cwd(), "docs", "screenshots", "2026-08-25-evidence-review");
const runId = `review-e2e-${Date.now().toString(36)}`;
const widths = [1440, 768, 390];

const {
  advanceEvidenceWorkflow,
  createRun,
  removeRun,
  saveEvidenceArtifactVersion,
  sitePaths,
  transitionEvidenceArtifactApproval,
} = await import("../../src/lib/runstate.ts");
const { buildTokenInventory } = await import("../../src/lib/evidence.ts");

const designTokens = {
  colors: [
    { name: "Paper", value: "#f5f5ef", cssVar: "--color-paper", role: "primary text", forbiddenContexts: [] },
    { name: "Lime", value: "#d7ff3f", cssVar: "--color-primary", role: "one primary action", forbiddenContexts: ["large-surface"] },
  ],
  fonts: [
    { family: "Inter", cssVar: "--font-body", weights: [400, 500], role: "interface and body", substitutes: ["system-ui"] },
  ],
  typeScale: [
    { role: "body", sizePx: 16, lineHeight: 1.5, cssVar: "--text-body" },
    { role: "heading", sizePx: 32, lineHeight: 1.15, trackingEm: -0.02, cssVar: "--text-heading" },
  ],
  radii: { control: "6px", card: "10px" },
  spacing: { sm: "8px", md: "16px", lg: "24px" },
  borders: { subtle: "1px solid #323232" },
  shadows: { raised: "0 8px 28px rgb(0 0 0 / 0.24)" },
  layers: { base: "0", sticky: "20" },
  layout: { maxWidthPx: 1180, sectionGapPx: 72, cardPaddingPx: 20 },
  motion: { easing: "ease", durationMs: { micro: 140, reveal: 300 }, revealClasses: [] },
  componentStates: [{ component: "button", states: { default: "quiet border", hover: "raised surface", focus: "visible ring", selected: "paper text", disabled: "muted", error: "coral edge" } }],
  imageryBrief: { subject: "work in context", lighting: "natural", grade: "neutral", framing: "editorial", avoid: ["generic stock poses"] },
};

async function approve(artifact) {
  await transitionEvidenceArtifactApproval(runId, artifact.artifactType, artifact.version, "in-review");
  await transitionEvidenceArtifactApproval(runId, artifact.artifactType, artifact.version, "approved");
}

async function buildFixture() {
  await createRun({ id: runId, referenceMode: "none" });
  const ledger = await saveEvidenceArtifactVersion(runId, {
    artifactType: "ledger",
    artifact: {
      projectTarget: "website",
      businessIntelligence: { kind: "business-intelligence" },
      referoDesignEvidence: { kind: "refero-design-evidence" },
      clientEvidence: {},
    },
  });
  await approve(ledger);
  await advanceEvidenceWorkflow(runId, "contract");

  const contract = await saveEvidenceArtifactVersion(runId, {
    artifactType: "design-contract",
    artifact: {
      title: "Midnight Instrument",
      contractPath: "evidence/versions/design-contract/v1.DESIGN.md",
      sourceLedgerVersion: 1,
      contractSha256: "a".repeat(64),
      exportSha256: "b".repeat(64),
      designTokens,
    },
  });
  await approve(contract);
  await advanceEvidenceWorkflow(runId, "tokens");

  const tokens = await saveEvidenceArtifactVersion(runId, {
    artifactType: "token-inventory",
    artifact: buildTokenInventory(designTokens, 1, []),
  });
  await transitionEvidenceArtifactApproval(runId, tokens.artifactType, tokens.version, "in-review");
}

function collectBrowserErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${String(error)}`));
  return errors;
}

async function assertReviewSurface(page, width) {
  await page.goto(`${base}/evidence/${runId}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("heading", { name: "Review before build" }).waitFor();

  const questions = await page.locator(".review-overview__answers dt").allTextContents();
  assert.deepEqual(questions, [
    "What are we deciding?",
    "What did OneBox learn?",
    "What does the proposed choice look like?",
    "What do you need to do next?",
  ]);
  assert.equal(await page.locator(".review-technical").getAttribute("open"), null);
  assert.equal(await page.locator(".token-specimen-gallery").count(), 1, "token specimens must appear once before disclosure");
  assert.equal(await page.locator(".review-feedback-composer").count(), 1);
  await page.getByText("Drop files here", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Approve to Continue", exact: true }).waitFor();
  await page.getByRole("button", { name: "Request Changes", exact: true }).waitFor();

  const order = await page.evaluate(() => {
    const summary = document.querySelector(".review-overview");
    const technical = document.querySelector(".review-technical");
    const composer = document.querySelector(".review-feedback-composer");
    return [summary, technical, composer].map((node) => node ? [...document.querySelectorAll("*")].indexOf(node) : -1);
  });
  assert.ok(order[0] < order[1] && order[1] < order[2], `summary/disclosure/composer DOM order is wrong: ${order}`);

  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  assert.ok(overflow.scroll <= overflow.client + 1, `horizontal overflow at ${width}px: ${JSON.stringify(overflow)}`);

  if (width <= 768) {
    for (const name of ["Attach files", "Send feedback", "Approve to Continue", "Request Changes"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      assert.ok(box && box.height >= 44, `${name} is below 44px at ${width}px`);
    }
  }

  const details = page.locator(".review-technical");
  const summary = details.locator("summary");
  await summary.focus();
  assert.notEqual(await summary.evaluate((node) => getComputedStyle(node).outlineStyle), "none");
  await page.keyboard.press("Enter");
  assert.ok(await details.getAttribute("open") !== null, "technical disclosure must work by keyboard");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("heading", { name: "Review before build" }).count(), 1, "Escape must leave the non-modal review stable");
  await page.keyboard.press("Enter");
  assert.equal(await details.getAttribute("open"), null, "technical disclosure must close by keyboard");

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const severe = axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  assert.deepEqual(severe.map(({ id, impact }) => ({ id, impact })), []);

  await page.screenshot({ path: path.join(output, `token-review-${width}.png`), fullPage: true });
}

await fs.mkdir(output, { recursive: true });
await buildFixture();
const browser = await chromium.launch();

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = collectBrowserErrors(page);
    await assertReviewSurface(page, width);

    if (width === 1440) {
      const fileInput = page.locator(".intake-upload--review input[type=file]");
      await fileInput.setInputFiles({ name: "brand-guide.md", mimeType: "text/markdown", buffer: Buffer.from("# Approved brand guide") });
      await page.getByText("brand-guide.md", { exact: true }).waitFor();
      await page.getByRole("textbox", { name: "Feedback" }).fill("Use the approved brand guide as evidence for this review.");
      await page.getByRole("button", { name: "Send feedback", exact: true }).click();
      await page.getByText("Feedback and attachments were saved with this review.", { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, "token-review-feedback-saved-1440.png"), fullPage: true });
    }

    assert.deepEqual(errors, [], `browser errors at ${width}px`);
    await context.close();
  }

  const noScript = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const noScriptPage = await noScript.newPage();
  await noScriptPage.goto(`${base}/evidence/${runId}`, { waitUntil: "domcontentloaded" });
  assert.equal(await noScriptPage.locator(".review-overview__answers dt").count(), 4);
  assert.equal(await noScriptPage.locator(".review-feedback-composer").count(), 1);
  await noScriptPage.screenshot({ path: path.join(output, "token-review-script-blocked-390.png"), fullPage: true });
  await noScript.close();

  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${base}/evidence/${runId}`, { waitUntil: "networkidle" });
  assert.equal(await reducedPage.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
  assert.equal(await reducedPage.locator(".review-feedback-composer").count(), 1);
  await reducedPage.screenshot({ path: path.join(output, "token-review-reduced-motion-390.png"), fullPage: true });
  await reduced.close();

  const receipts = await fs.readdir(path.join(sitePaths(runId).root, "evidence", "review-feedback"));
  assert.ok(receipts.some((entry) => entry.endsWith(".json")), "feedback receipt was not persisted");
  console.log(`[evidence-review] PASS: ${widths.join("/")} + script-blocked + reduced-motion; screenshots in ${output}`);
} finally {
  await browser.close();
  await removeRun(runId);
}
