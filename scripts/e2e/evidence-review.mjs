import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
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
const referenceRunId = `reference-review-e2e-${Date.now().toString(36)}`;
const widths = [1440, 768, 390];

const {
  advanceEvidenceWorkflow,
  createRun,
  removeRun,
  saveEvidenceArtifactVersion,
  sitePaths,
  transitionEvidenceArtifactApproval,
  withRunTransaction,
} = await import("../../src/lib/runstate.ts");
const { buildTokenInventory } = await import("../../src/lib/evidence.ts");
const { ReferenceSelectionStateSchema } = await import("../../src/lib/contracts.ts");

const designTokens = {
  colors: [
    { name: "Paper", value: "#f5f5ef", cssVar: "--color-paper", role: "primary text", forbiddenContexts: [] },
    { name: "Lime", value: "#d7ff3f", cssVar: "--color-primary", role: "one primary action", forbiddenContexts: ["large-surface"] },
  ],
  fonts: [
    { family: "Switzer", cssVar: "--font-body", weights: [400, 590], role: "interface and body", substitutes: ["system-ui"] },
    { family: "JetBrains Mono", cssVar: "--font-display", weights: [400, 700], role: "display headings", substitutes: ["monospace"] },
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

function referenceCandidate(referoId, recommended) {
  return {
    referoId,
    kind: "style",
    name: `${referoId} direction`,
    sourceUrl: `https://refero.design/${referoId}`,
    foundVia: "a deterministic browser-test angle",
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

async function buildReferenceFixture() {
  await createRun({ id: referenceRunId, referencePickerEnabled: true });
  await withRunTransaction(referenceRunId, async (transaction) => {
    transaction.state.referenceSelection = ReferenceSelectionStateSchema.parse({
      status: "pending",
      rerollsUsed: 0,
      versions: [{
        version: 1,
        createdAt: "2026-08-25T12:00:00.000Z",
        searchAngles: ["first angle", "second angle", "third angle"],
        candidates: [
          referenceCandidate("recommended", true),
          referenceCandidate("alternative", false),
        ],
      }],
    });
  });
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
  assert.equal(await page.locator(".token-font-family").count(), 2, "every canonical font family must have a specimen");
  const specimenType = await page.evaluate(() => {
    const heading = getComputedStyle(document.querySelector(".token-specimen__heading"));
    const body = getComputedStyle(document.querySelector(".token-specimen__body"));
    return {
      heading: {
        family: heading.fontFamily,
        weight: heading.fontWeight,
        size: Number.parseFloat(heading.fontSize),
        lineHeight: Number.parseFloat(heading.lineHeight),
        tracking: heading.letterSpacing,
      },
      body: {
        family: body.fontFamily,
        weight: body.fontWeight,
        size: Number.parseFloat(body.fontSize),
        lineHeight: Number.parseFloat(body.lineHeight),
      },
    };
  });
  assert.match(specimenType.heading.family, /jetbrains/i);
  assert.match(specimenType.body.family, /switzer/i);
  assert.equal(specimenType.heading.weight, "700");
  assert.equal(specimenType.body.weight, "400");
  assert.ok(Math.abs(specimenType.heading.lineHeight / specimenType.heading.size - 1.15) < 0.02);
  assert.ok(Math.abs(specimenType.body.lineHeight / specimenType.body.size - 1.5) < 0.02);
  assert.equal(specimenType.heading.tracking, "-0.64px");
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
    const undersized = await page.locator(".evidence-workspace").evaluate((root) =>
      [...root.querySelectorAll("button, a, summary, input, textarea, select")]
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return node.getAttribute("aria-hidden") !== "true" &&
            node.getAttribute("tabindex") !== "-1" &&
            rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
        })
        .map((node) => ({
          label: node.getAttribute("aria-label") || node.textContent?.trim() || node.tagName,
          height: node.getBoundingClientRect().height,
        }))
        .filter((item) => item.height < 44),
    );
    assert.deepEqual(undersized, [], `interactive targets below 44px at ${width}px`);

    const mobileFileInput = page.locator(".intake-upload--review input[type=file]");
    const mobileUploadResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/uploads") && response.request().method() === "POST"
    );
    await mobileFileInput.setInputFiles({
      name: `mobile-proof-${width}.md`,
      mimeType: "text/markdown",
      buffer: Buffer.from("# Mobile attachment target proof"),
    });
    const mobileUpload = await (await mobileUploadResponse).json();
    const attachmentSummary = page.locator(".intake-upload__disclosure summary");
    await attachmentSummary.waitFor();
    const summaryBox = await attachmentSummary.boundingBox();
    assert.ok(summaryBox && summaryBox.height >= 44, `attachment summary is below 44px at ${width}px`);
    await attachmentSummary.click();
    const removeButton = page.locator(`button[aria-label="Remove mobile-proof-${width}.md"]`);
    const removeBox = await removeButton.boundingBox();
    assert.ok(
      removeBox && removeBox.height >= 44 && removeBox.width >= 44,
      `attachment remove target is below 44px at ${width}px`,
    );
    await removeButton.click();
    const mobileStagingRoot = path.join(
      os.tmpdir(),
      `one-box-intake-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 16)}`,
    );
    await fs.rm(
      path.join(mobileStagingRoot, createHash("sha256").update(mobileUpload.uploadSession).digest("hex")),
      { recursive: true, force: true },
    );
  }

  const details = page.locator(".review-technical");
  const summary = details.locator("summary");
  await page.keyboard.press("Tab");
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
  assert.deepEqual(
    severe.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target),
    })),
    [],
  );

  await page.screenshot({ path: path.join(output, `token-review-${width}.png`), fullPage: true });
}

await fs.mkdir(output, { recursive: true });
await buildFixture();
await buildReferenceFixture();
const browser = await chromium.launch();

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = collectBrowserErrors(page);
    await assertReviewSurface(page, width);

    if (width === 1440) {
      const fileInput = page.locator(".intake-upload--review input[type=file]");
      const uploadResponse = page.waitForResponse((response) =>
        response.url().endsWith("/api/uploads") && response.request().method() === "POST"
      );
      await fileInput.setInputFiles({ name: "brand-guide.md", mimeType: "text/markdown", buffer: Buffer.from("# Approved brand guide") });
      const firstUpload = await (await uploadResponse).json();
      await page.getByText("brand-guide.md", { exact: true }).waitFor();
      await page.getByRole("textbox", { name: "Feedback" }).fill("Use the approved brand guide as evidence for this review.");
      const stagingRoot = path.join(
        os.tmpdir(),
        `one-box-intake-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 16)}`,
      );
      await fs.rm(
        path.join(stagingRoot, createHash("sha256").update(firstUpload.uploadSession).digest("hex")),
        { recursive: true, force: true },
      );
      await page.getByRole("button", { name: "Send feedback", exact: true }).click();
      await page.getByRole("button", { name: "Choose files again", exact: true }).waitFor();
      assert.ok(
        errors.some((entry) => entry.includes("401 (Unauthorized)")),
        "the forced expired-session request must fail closed with 401",
      );
      assert.equal(
        await page.getByRole("textbox", { name: "Feedback" }).inputValue(),
        "Use the approved brand guide as evidence for this review.",
      );

      const recoveryUploadResponse = page.waitForResponse((response) =>
        response.url().endsWith("/api/uploads") && response.request().method() === "POST"
      );
      const recoveryChooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Choose files again", exact: true }).click();
      await (await recoveryChooser).setFiles({ name: "brand-guide.md", mimeType: "text/markdown", buffer: Buffer.from("# Approved brand guide") });
      const recoveryResponse = await recoveryUploadResponse;
      const recoveryBody = await recoveryResponse.json();
      assert.equal(recoveryResponse.status(), 200);
      assert.equal(recoveryBody.uploads?.[0]?.fileName, "brand-guide.md");
      await page.waitForTimeout(500);
      const recoveryUi = await page.locator(".intake-upload--review").textContent();
      assert.equal(
        await page.locator('button[aria-label="Remove brand-guide.md"]').count(),
        1,
        `recovered upload did not appear in the review UI: ${recoveryUi}`,
      );
      await page.locator(".intake-upload__disclosure summary").click();
      await page.locator('button[aria-label="Remove brand-guide.md"]').click();
      await page.getByText("brand-guide.md", { exact: true }).waitFor({ state: "detached" });
      await fileInput.setInputFiles({ name: "brand-guide.md", mimeType: "text/markdown", buffer: Buffer.from("# Approved brand guide") });
      await page.getByText("brand-guide.md", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Send feedback", exact: true }).click();
      await page.getByText("Feedback and attachments were saved with this review.", { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, "token-review-feedback-saved-1440.png"), fullPage: true });
    }

    const unexpectedErrors = errors.filter((entry) =>
      !(width === 1440 && entry.includes("401 (Unauthorized)"))
    );
    assert.deepEqual(unexpectedErrors, [], `browser errors at ${width}px`);
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

  const referenceContext = await browser.newContext({ viewport: { width: 768, height: 900 } });
  const referencePage = await referenceContext.newPage();
  const referenceErrors = collectBrowserErrors(referencePage);
  await referencePage.route(`**/api/reference/${referenceRunId}`, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body?.action === "reroll") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, reason: "no-fresh-directions" }),
        });
        return;
      }
    }
    await route.continue();
  });
  await referencePage.goto(`${base}/evidence/${referenceRunId}`, { waitUntil: "networkidle" });
  await referencePage.getByRole("heading", { name: "Choose a look for your site" }).waitFor();
  assert.equal(await referencePage.locator(".reference-selection .btn-primary").count(), 1);
  const referenceFeedback = referencePage.getByRole("textbox", { name: "Feedback" });
  await referenceFeedback.fill("Show a calmer set of directions.");
  await referencePage.getByRole("button", { name: "Request Changes", exact: true }).click();
  await referencePage.getByText("Your feedback was saved, but no new directions were available.", { exact: true }).waitFor();
  assert.equal(await referenceFeedback.inputValue(), "", "saved exhaustion feedback must clear its id-bound draft");
  await referenceFeedback.fill("Keep the original options and note the calmer preference.");
  await referencePage.getByRole("button", { name: "Send feedback", exact: true }).click();
  await referencePage.getByText("Feedback and attachments were saved with this review.", { exact: true }).waitFor();
  assert.deepEqual(referenceErrors, [], "reference selection browser errors");
  await referencePage.screenshot({ path: path.join(output, "reference-review-feedback-recovery-768.png"), fullPage: true });
  await referenceContext.close();

  const receipts = await fs.readdir(path.join(sitePaths(runId).root, "evidence", "review-feedback"));
  assert.ok(receipts.some((entry) => entry.endsWith(".json")), "feedback receipt was not persisted");
  console.log(`[evidence-review] PASS: ${widths.join("/")} + script-blocked + reduced-motion; screenshots in ${output}`);
} finally {
  await browser.close();
  await removeRun(runId);
  await removeRun(referenceRunId);
}
