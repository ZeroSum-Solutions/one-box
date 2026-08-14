import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.ONEBOX_BASE_URL ?? "http://localhost:3000";
const root = process.cwd();
const runId = `preview-e2e-${Date.now().toString(36)}`;
const runRoot = path.join(root, "sites", runId);
const indexPath = path.join(runRoot, "site", "index.html");
const historyPath = path.join(runRoot, "element-history.json");

const fidelityFixture = `
  <style>
    #e2e-interactive, #e2e-parallax, #e2e-webgl {
      color: var(--color-text);
      font-family: var(--font-body);
      background-color: transparent;
    }
    #e2e-fidelity-hover {
      color: var(--color-text);
      font-family: var(--font-body);
      background: var(--color-surface);
    }
    #e2e-fidelity-hover:hover {
      color: var(--color-primary-contrast);
      background: var(--color-primary);
    }
  </style>
  <section data-edit-id="fixture.interactive" id="e2e-interactive">
    <canvas id="e2e-webgl" width="64" height="64" role="img" aria-label="WebGL fidelity fixture">WebGL preview</canvas>
    <div id="e2e-parallax">Parallax fidelity fixture</div>
    <button id="e2e-fidelity-hover" type="button">Hover fidelity fixture</button>
  </section>
  <script>
    (function () {
      var canvas = document.getElementById("e2e-webgl");
      var gl = canvas.getContext("webgl");
      var parallax = document.getElementById("e2e-parallax");
      var hover = document.getElementById("e2e-fidelity-hover");
      var state = window.__oneboxFidelity = {
        webgl: Boolean(gl),
        frames: 0,
        draws: 0,
        pixel: [],
        parallaxUpdates: 0,
        hoverEntries: 0
      };
      if (gl) {
        gl.clearColor(0.05, 0.1, 0.2, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      function renderFrame() {
        state.frames += 1;
        if (gl) {
          gl.clearColor((state.frames % 10) / 10, 0.1, 0.2, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          var pixel = new Uint8Array(4);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          state.pixel = Array.prototype.slice.call(pixel);
          state.draws += 1;
        }
        requestAnimationFrame(renderFrame);
      }
      function updateParallax() {
        state.parallaxUpdates += 1;
        parallax.style.transform = "translate3d(0," + Math.round(window.scrollY * 0.2) + "px,0)";
      }
      hover.addEventListener("pointerenter", function () { state.hoverEntries += 1; });
      window.addEventListener("scroll", updateParallax, { passive: true });
      updateParallax();
      renderFrame();
    })();
  </script>
`;

await fs.cp(path.join(root, "sites", "smoke-fixture"), runRoot, {
  recursive: true,
  errorOnExist: true,
});
await fs.unlink(historyPath).catch(() => undefined);
const isolatedSource = await fs.readFile(indexPath, "utf8");
await fs.writeFile(
  indexPath,
  isolatedSource.replace(
    "</body>",
    `${fidelityFixture}<button type="button" data-edit-id="fixture.button" style="color: var(--color-text); background-color: var(--color-surface)">Fixture native button</button><form><button data-edit-id="fixture.submit" style="color: var(--color-text); background-color: var(--color-surface); font-family: var(--font-body)">Implicit submit</button></form><section id="fixture-order"><p data-edit-id="fixture.order.one">Order one</p><p data-edit-id="fixture.order.two">Order two</p></section></body>`,
  ),
);

const fixtureControls = `
  <form id="e2e-form" action="/api/sites/${runId}/index.html#contact" method="get">
    <button id="e2e-submit" type="submit">Fixture form submit</button>
    <select id="e2e-change"><option value="safe">Safe</option><option value="attack">Attack</option></select>
  </form>
  <a id="e2e-popup" href="/api/sites/${runId}/index.html#contact" target="_blank" rel="noopener">Fixture popup</a>
  <script>
    window.__e2eWindowCaptureCount = 0;
    ["pointerdown", "change", "click", "submit"].forEach(function(type) {
      window.addEventListener(type, function(event) {
        if (event.target.id === "e2e-submit" || event.target.id === "e2e-change" || event.target.id === "e2e-form") {
          window.__e2eWindowCaptureCount += 1;
          location.hash = "window-" + type + "-attacked";
        }
      }, true);
    });
    document.getElementById("e2e-submit").addEventListener("pointerdown", function(){ location.hash = "pointerdown-attacked"; });
    document.getElementById("e2e-change").addEventListener("change", function(){ location.hash = "change-attacked"; });
    document.addEventListener("pointerdown", function(event){ if(event.target.id === "e2e-submit") location.hash = "document-pointerdown-attacked"; }, true);
    document.addEventListener("change", function(event){ if(event.target.id === "e2e-change") location.hash = "document-change-attacked"; }, true);
    document.addEventListener("click", function(event){ if(event.target.id === "e2e-submit") location.hash = "document-click-attacked"; }, true);
    document.addEventListener("submit", function(){ location.hash = "document-submit-attacked"; }, true);
  </script>
`;

const researchFixturePayload = {
  pipelineVersion: "evidence-gated-v2",
  workflow: {
    currentStage: "evidence",
    artifacts: [
      {
        artifactType: "ledger",
        version: 1,
        createdAt: "2026-08-14T12:00:00.000Z",
        approvalTransitions: [
          { state: "draft", at: "2026-08-14T12:00:00.000Z" },
        ],
        artifact: {
          projectTarget: "website",
          businessIntelligence: {
            kind: "business-intelligence",
            sources: [
              {
                id: "business-source",
                sourceUrl: "https://business.example/report",
                title: "Saved market report",
                capturedAt: "2026-08-14T12:00:00.000Z",
                confidence: 0.84,
                screenshotPaths: [],
                extractedArtifactPaths: [],
                crawlAttempts: [],
              },
            ],
            competitors: [
              {
                name: "Comparable operator",
                url: "https://competitor.example",
                selectionRationale: "Comparable audience and offer.",
                strengths: [],
                gaps: [],
              },
            ],
            marketExpectations: [],
            differentiationOpportunities: [],
            claims: [
              {
                id: "business-claim",
                statement: "Visitors expect clear pricing.",
                classification: "observed",
                sourceIds: ["business-source"],
                confidence: 0.78,
              },
            ],
          },
          referoDesignEvidence: {
            kind: "refero-design-evidence",
            sources: [
              {
                id: "refero-source",
                sourceUrl: "https://refero.design/example",
                title: "Saved Refero evidence",
                capturedAt: "2026-08-14T12:00:00.000Z",
                confidence: 0.93,
                screenshotPaths: [],
                extractedArtifactPaths: [],
                crawlAttempts: [],
              },
            ],
            references: [
              {
                referoId: "ref-1",
                name: "Reference One",
                sourceUrl: "https://refero.design/reference-one",
                learningRationale: "Clear hierarchy.",
                reusablePatterns: ["Contrast", "Spacing"],
              },
            ],
            claims: [
              {
                id: "refero-claim",
                statement: "The hero uses a clear CTA hierarchy.",
                classification: "inferred",
                sourceIds: ["refero-source"],
                confidence: 0.88,
              },
            ],
          },
          clientEvidence: {
            sources: [],
            claims: [],
            artifactRelationships: [],
            unsupportedUploadIds: [],
          },
        },
      },
    ],
  },
};

const browser = await chromium.launch();

async function iframeIsOpaque(frame) {
  return frame.evaluate(() => {
    try {
      void window.localStorage.length;
      return false;
    } catch (error) {
      return error instanceof DOMException && error.name === "SecurityError";
    }
  });
}

async function waitForMode(page, mode) {
  await page.waitForFunction(
    (expected) =>
      [...document.querySelectorAll("button[aria-pressed='true']")].some(
        (button) => button.textContent?.trim() === expected,
      ),
    mode,
  );
}

async function openFixture(context, width, height = 844) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`${base}/preview/${runId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Edit", exact: true }).waitFor();
  await waitForMode(page, "Edit");
  await page.frameLocator("iframe").locator("[data-edit-id]").first().waitFor();
  return page;
}

async function assertProductionFidelity(page, label) {
  const child = page.frames()[1];
  await child.waitForFunction(
    () => window.__oneboxFidelity?.webgl && window.__oneboxFidelity.frames > 2,
  );
  const before = await child.evaluate(() => ({ ...window.__oneboxFidelity }));
  await page.waitForTimeout(80);
  const after = await child.evaluate(() => ({ ...window.__oneboxFidelity }));
  assert.equal(after.webgl, true, `${label}: WebGL context unavailable`);
  assert.ok(after.frames > before.frames, `${label}: WebGL render loop paused`);
  assert.ok(after.draws > before.draws, `${label}: WebGL draw calls paused`);
  assert.equal(after.pixel[3], 255, `${label}: WebGL framebuffer was not rendered`);

  await child.evaluate(() => window.scrollTo(0, 320));
  await page.waitForTimeout(80);
  const parallax = await child.evaluate(() => ({
    updates: window.__oneboxFidelity.parallaxUpdates,
    transform: document.getElementById("e2e-parallax").style.transform,
  }));
  assert.ok(parallax.updates > before.parallaxUpdates, `${label}: parallax did not update`);
  assert.match(parallax.transform, /translate3d\(0(?:px)?,\s*64px,\s*0(?:px)?\)/, `${label}: parallax transform mismatch`);

  const hover = page.frameLocator("iframe").locator("#e2e-fidelity-hover");
  const restingColor = await hover.evaluate((element) => getComputedStyle(element).backgroundColor);
  await hover.hover();
  assert.notEqual(
    await hover.evaluate((element) => getComputedStyle(element).backgroundColor),
    restingColor,
    `${label}: hover styling did not render`,
  );
  assert.ok(
    (await child.evaluate(() => window.__oneboxFidelity.hoverEntries)) > 0,
    `${label}: hover behavior did not execute`,
  );
  await child.evaluate(() => window.scrollTo(0, 0));
}

try {
  const context = await browser.newContext();
  const page = await openFixture(context, 1280, 800);
  const errors = [];
  let elementMutationRequests = 0;
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("request", (request) => {
    if (request.url().endsWith("/api/elements") && request.method() === "POST")
      elementMutationRequests += 1;
  });

  // Opaque-origin message guard: valid-looking wrong-source and malformed
  // right-source payloads must not select anything.
  await page.evaluate(() => {
    window.postMessage(
      {
        type: "onebox-editor-state",
        state: "selected",
        selection: {
          editId: "spoofed",
          tag: "h1",
          text: "spoof",
          behavior: "text",
        },
      },
      "*",
    );
  });
  await page.frames()[1].evaluate(() => {
    parent.postMessage(
      {
        type: "onebox-editor-state",
        state: "selected",
        selection: { editId: 4 },
      },
      "*",
    );
    parent.postMessage(
      {
        type: "onebox-editor-state",
        state: "selected",
        selection: {
          editId: "spoofed.unknown",
          tag: "h1",
          text: "unknown-key-spoof",
          behavior: "text",
          arbitrary: true,
        },
      },
      "*",
    );
    parent.postMessage(
      {
        type: "onebox-editor-state",
        state: "move-requested",
        selection: {
          editId: "fixture.order.two",
          tag: "p",
          text: "forged move",
          behavior: "text",
          move: "previous",
        },
      },
      "*",
    );
    parent.postMessage(
      {
        type: "onebox-editor-state",
        state: "dragging",
        selection: {
          editId: "fixture.order.two",
          tag: "p",
          text: "forged drag state",
          behavior: "text",
        },
      },
      "*",
    );
  });
  await page.waitForTimeout(50);
  assert.equal(elementMutationRequests, 0, "iframe messages cannot authorize mutation");
  assert.equal(await page.getByText("spoofed", { exact: false }).count(), 0);
  assert.equal(
    await page.getByText("unknown-key-spoof", { exact: false }).count(),
    0,
  );

  let frame = page.frameLocator("iframe");
  let child = page.frames()[1];
  assert.equal(await iframeIsOpaque(child), true);
  const sandbox = await page.locator("iframe").getAttribute("sandbox");
  assert.equal(sandbox, "allow-scripts");
  await assertProductionFidelity(page, "Edit mode before mutations");
  await frame.locator("#e2e-webgl").click();
  await page.getByText("fixture.interactive", { exact: false }).waitFor();
  assert.match(
    await page.locator(".workbench-panel__body").innerText(),
    /Complex content stays live behind a safe selection overlay/,
  );

  // Actual iframe width and ARIA divider value track the rendered split. The
  // top toolbar is reserved for View/Edit; named widths live at the grab tab.
  const iframeBox = await page.locator("iframe").boundingBox();
  assert.ok(iframeBox && iframeBox.width > 800);
  assert.equal(
    await child.evaluate(() => window.innerWidth),
    Math.round(iframeBox.width),
  );
  assert.equal(await page.locator(".preview-breakpoint").count(), 0);
  assert.equal(
    await page.locator(".workbench-size-controls").count(),
    0,
    "Normal/Expand controls must not compete with preview sizing",
  );
  const grabTab = page.locator(".workbench-grab-tab");
  const grabTabBox = await grabTab.boundingBox();
  assert.ok(grabTabBox && grabTabBox.width >= 44 && grabTabBox.height >= 44);
  assert.match(
    (await grabTab.getAttribute("aria-label")) ?? "",
    /Preview width: desktop/i,
  );
  for (const tool of await page.locator(".workbench-tool").all()) {
    const toolBox = await tool.boundingBox();
    const iconBox = await tool.locator("svg").boundingBox();
    assert.ok(toolBox && toolBox.width >= 44 && toolBox.height >= 44);
    assert.ok(iconBox && iconBox.width === 20 && iconBox.height === 20);
    assert.ok(
      Math.abs(
        iconBox.x + iconBox.width / 2 - (toolBox.x + toolBox.width / 2),
      ) <= 1,
      "workbench icon is not centered",
    );
  }
  const divider = page.getByRole("separator", {
    name: "Resize preview and workbench",
  });
  assert.equal(Number(await divider.getAttribute("aria-valuemin")), 300);
  assert.equal(Number(await divider.getAttribute("aria-valuemax")), 960);
  const dividerBox = await divider.boundingBox();
  const panelBefore = await page.locator(".preview-workbench").boundingBox();
  assert.ok(dividerBox && panelBefore);
  assert.ok(
    dividerBox.width >= 44,
    `separator hit area is ${dividerBox.width}px`,
  );
  assert.equal(
    await divider.evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgba(0, 0, 0, 0)",
    "separator hit area must remain visually transparent",
  );
  await page.mouse.move(
    dividerBox.x + dividerBox.width / 2,
    dividerBox.y + 100,
  );
  await page.mouse.down();
  await page.mouse.move(dividerBox.x - 180, dividerBox.y + 100, { steps: 5 });
  await page.mouse.up();
  const panelAfter = await page.locator(".preview-workbench").boundingBox();
  assert.ok(panelAfter && panelAfter.width > panelBefore.width + 150);
  assert.equal(
    Number(await divider.getAttribute("aria-valuenow")),
    Math.round(panelAfter.width),
  );
  assert.equal(await divider.getAttribute("aria-valuetext"), "tablet preview");

  // The grab tab exposes all three named widths without putting them in the
  // top bar. Named choices snap to exact reachable iframe widths.
  await grabTab.click();
  const widthChoices = page.getByRole("group", { name: "Preview width" });
  await widthChoices.waitFor();
  assert.equal(
    await widthChoices.getByRole("button").count(),
    3,
    "grab tab must expose Desktop, Tablet, and Mobile",
  );
  await page.getByRole("button", { name: "Mobile preview width" }).click();
  const mobilePresetFrame = await page.locator("iframe").boundingBox();
  assert.ok(mobilePresetFrame && Math.round(mobilePresetFrame.width) === 390);
  await grabTab.click();
  await page.getByRole("button", { name: "Desktop preview width" }).click();
  const desktopPresetFrame = await page.locator("iframe").boundingBox();
  assert.ok(desktopPresetFrame && Math.round(desktopPresetFrame.width) === 979);
  await grabTab.click();
  await page.getByRole("button", { name: "Tablet preview width" }).click();
  const tabletPresetFrame = await page.locator("iframe").boundingBox();
  const tabletPresetPanel = await page.locator(".preview-workbench").boundingBox();
  assert.ok(tabletPresetFrame && Math.round(tabletPresetFrame.width) === 767);
  assert.ok(tabletPresetPanel);

  await divider.focus();
  const keyboardWidthBefore = Number(await divider.getAttribute("aria-valuenow"));
  await divider.press("ArrowLeft");
  assert.equal(
    Number(await divider.getAttribute("aria-valuenow")),
    keyboardWidthBefore + 24,
    "separator keyboard resizing must remain available",
  );
  await page.getByRole("button", { name: /Preview width:/i }).click();
  await page.getByRole("button", { name: "Tablet preview width" }).click();

  // Collapse fills nearly the workspace; reopen restores expanded size/width.
  const expandedWidth = tabletPresetPanel.width;
  await page.getByRole("button", { name: "Collapse workbench" }).click();
  const collapsedPreview = await page.locator("iframe").boundingBox();
  assert.ok(collapsedPreview && collapsedPreview.width >= 1210);
  await page.getByRole("button", { name: "Reopen workbench" }).click();
  const reopenedPanel = await page.locator(".preview-workbench").boundingBox();
  assert.ok(
    reopenedPanel && Math.abs(reopenedPanel.width - expandedWidth) <= 1,
  );
  await page.waitForFunction(() =>
    document
      .querySelector(".workbench-grab-tab")
      ?.getAttribute("aria-label")
      ?.toLowerCase()
      .includes("preview width: tablet"),
  );
  assert.match(
    (await page.locator(".workbench-grab-tab").getAttribute("aria-label")) ?? "",
    /Preview width: tablet/i,
  );

  // Pointer width and expanded state persist across a full reload.
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForMode(page, "Edit");
  await page
    .frameLocator("iframe")
    .locator('[data-edit-id="hero.headline"][tabindex="0"]')
    .waitFor();
  const persistedPanel = await page.locator(".preview-workbench").boundingBox();
  assert.ok(
    persistedPanel && Math.abs(persistedPanel.width - expandedWidth) <= 1,
  );

  frame = page.frameLocator("iframe");
  child = page.frames()[1];
  const headline = frame.locator('[data-edit-id="hero.headline"]');
  const originalHeadline = await headline.innerText();

  // Ordinary text is keyboard-selectable. A draft survives focus moving to
  // parent controls, then Cancel restores the original exact value and focus.
  await headline.focus();
  await headline.press("Enter");
  assert.equal(
    await headline.getAttribute("contenteditable"),
    "plaintext-only",
  );
  await headline.fill("Draft that must cancel");
  await page.getByLabel("Text value").focus();
  await page.getByRole("button", { name: "Cancel draft" }).click();
  await page.waitForTimeout(100);
  assert.equal(await headline.innerText(), originalHeadline);
  assert.equal(
    await headline.evaluate((element) => document.activeElement === element),
    true,
  );

  // Persist the literal direct value, then prove explicit undo and redo.
  const persistedHeadline = `Persisted direct value ${Date.now().toString(36)}`;
  await headline.press("Enter");
  await headline.fill(persistedHeadline);
  const textMutationPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/elements") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save value" }).click();
  const textMutation = await textMutationPromise;
  assert.equal(textMutation.ok(), true, await textMutation.text());
  await page
    .frameLocator("iframe")
    .getByText(persistedHeadline, { exact: true })
    .waitFor();
  assert.equal(
    await page
      .frameLocator("iframe")
      .locator('[data-edit-id="hero.headline"]')
      .innerText(),
    persistedHeadline,
  );

  await page
    .frameLocator("iframe")
    .locator('[data-edit-id="hero.headline"]')
    .click();
  const undoPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/elements") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Undo" }).click();
  const undoResponse = await undoPromise;
  assert.equal(undoResponse.ok(), true, await undoResponse.text());
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForMode(page, "Edit");
  await page
    .frameLocator("iframe")
    .getByText(originalHeadline, { exact: true })
    .waitFor();
  assert.equal(
    await page
      .frameLocator("iframe")
      .locator('[data-edit-id="hero.headline"]')
      .innerText(),
    originalHeadline,
  );

  await page
    .frameLocator("iframe")
    .locator('[data-edit-id="hero.headline"]')
    .click();
  const redoPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/elements") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Redo" }).click();
  const redoResponse = await redoPromise;
  assert.equal(redoResponse.ok(), true, await redoResponse.text());
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForMode(page, "Edit");
  await page
    .frameLocator("iframe")
    .getByText(persistedHeadline, { exact: true })
    .waitFor();
  assert.equal(
    await page
      .frameLocator("iframe")
      .locator('[data-edit-id="hero.headline"]')
      .innerText(),
    persistedHeadline,
  );

  // Edit mode suppresses both editable and non-editable navigation.
  frame = page.frameLocator("iframe");
  const frameUrlBefore = page.frames()[1].url();
  await frame.locator(".nav__links a").first().dispatchEvent("click");
  assert.equal(page.frames()[1].url(), frameUrlBefore);

  // Button/link editing persists label, bounded action, and token-backed typography.
  const cta = frame.locator('[data-edit-id="hero.cta"]');
  await cta.dispatchEvent("click");
  await page.getByLabel("Label").fill("Book the fixture");
  await page.getByLabel("Destination / action").fill("#contact");
  const typographySelects = page.locator(".typography-controls select");
  await typographySelects.nth(0).selectOption("display");
  await typographySelects.nth(1).selectOption("body-lg");
  await typographySelects.nth(2).selectOption("700");
  await typographySelects.nth(3).selectOption("inherit");
  await typographySelects.nth(4).selectOption("center");
  const actionMutationPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/elements") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save value" }).click();
  const actionMutation = await actionMutationPromise;
  assert.equal(actionMutation.ok(), true, await actionMutation.text());
  await page
    .frameLocator("iframe")
    .getByText("Book the fixture", { exact: true })
    .waitFor();
  const editedCta = page
    .frameLocator("iframe")
    .locator('[data-edit-id="hero.cta"]');
  await editedCta.waitFor();
  assert.equal(await editedCta.innerText(), "Book the fixture");
  assert.equal(await editedCta.getAttribute("href"), "#contact");
  assert.match(
    (await editedCta.getAttribute("style")) ?? "",
    /var\(--font-display\)/,
  );

  const nativeButton = page
    .frameLocator("iframe")
    .locator('[data-edit-id="fixture.button"]');
  await nativeButton.focus();
  await nativeButton.press("Enter");
  await page.getByLabel("Label").fill("Scroll native button");
  await page.locator(".button-action-controls select").selectOption("scroll");
  await page.locator(".button-action-controls input").fill("#contact");
  const buttonMutationPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/elements") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save value" }).click();
  const buttonMutation = await buttonMutationPromise;
  assert.equal(buttonMutation.ok(), true, await buttonMutation.text());
  const savedButton = page
    .frameLocator("iframe")
    .locator('[data-edit-id="fixture.button"]');
  await savedButton.waitFor();
  assert.equal(await savedButton.getAttribute("data-onebox-action"), "scroll");
  assert.equal(await savedButton.getAttribute("data-onebox-target"), "contact");

  const implicitSubmit = page
    .frameLocator("iframe")
    .locator('[data-edit-id="fixture.submit"]');
  await implicitSubmit.focus();
  await implicitSubmit.press("Enter");
  assert.match(
    await page.locator(".current-action").innerText(),
    /submit \(implicit form default\)/,
  );
  await page.getByLabel("Label").fill("Preserved implicit submit");
  const implicitMutationPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/elements") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save value" }).click();
  assert.equal((await implicitMutationPromise).ok(), true);
  const savedImplicitSubmit = page
    .frameLocator("iframe")
    .locator('[data-edit-id="fixture.submit"]');
  await savedImplicitSubmit.waitFor();
  assert.equal(await savedImplicitSubmit.getAttribute("type"), null);
  assert.equal(
    await savedImplicitSubmit.getAttribute("data-onebox-action"),
    null,
  );

  // Pointer dragging and its keyboard equivalent persist only an adjacent
  // editable-sibling reorder through the guarded element history.
  let orderOne = page
    .frameLocator("iframe")
    .locator('[data-edit-id="fixture.order.one"]');
  let orderTwo = page
    .frameLocator("iframe")
    .locator('[data-edit-id="fixture.order.two"]');
  await orderTwo.evaluate((element) => {
    element.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      }),
    );
  });
  assert.equal(await orderTwo.getAttribute("data-onebox-dragging"), "");
  await page.getByText("Reorder preview active", { exact: false }).waitFor();
  await orderTwo.focus();
  await orderTwo.press("Escape");
  assert.equal(await orderTwo.getAttribute("data-onebox-dragging"), null);
  const requestsBeforeDrop = elementMutationRequests;
  await orderTwo.dragTo(orderOne);
  await page.waitForTimeout(100);
  assert.equal(
    elementMutationRequests,
    requestsBeforeDrop,
    "iframe drag/drop must remain preview-only",
  );
  // Reload clears Playwright's synthetic cross-frame drag state. Then use the
  // keyboard-equivalent selection before explicit parent-side confirmation.
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForMode(page, "Edit");
  orderOne = page
    .frameLocator("iframe")
    .locator('[data-edit-id="fixture.order.one"]');
  orderTwo = page
    .frameLocator("iframe")
    .locator('[data-edit-id="fixture.order.two"]');
  await orderTwo.waitFor();
  await orderTwo.focus();
  await orderTwo.press("Alt+ArrowUp");
  const orderSelectionChip = page.locator(".selection-chip");
  await orderSelectionChip.waitFor();
  assert.match(await orderSelectionChip.innerText(), /fixture\.order\.two/);
  const orderPanelText = await page.locator(".workbench-panel__body").innerText();
  assert.match(orderPanelText, /Text value/, orderPanelText);
  await page.getByLabel("Text value").waitFor();
  const moveEarlierControl = page
    .locator(".layout-controls")
    .getByRole("button", { name: "Move earlier" });
  await moveEarlierControl.waitFor();
  const requestsBeforeConfirm = elementMutationRequests;
  await moveEarlierControl.focus();
  await moveEarlierControl.press("Space");
  await page.waitForTimeout(1000);
  assert.equal(
    elementMutationRequests,
    requestsBeforeConfirm + 1,
    `parent move control did not issue exactly one request; page errors: ${errors.join(" | ")}`,
  );
  await page.frameLocator("iframe").locator("#fixture-order").waitFor();
  let order = await page
    .frameLocator("iframe")
    .locator("#fixture-order [data-edit-id]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-edit-id")),
    );
  assert.deepEqual(order, ["fixture.order.two", "fixture.order.one"]);
  orderTwo = page
    .frameLocator("iframe")
    .locator('[data-edit-id="fixture.order.two"]');
  await orderTwo.focus();
  const requestsBeforeKeyboard = elementMutationRequests;
  await orderTwo.press("Alt+ArrowDown");
  await page.waitForTimeout(100);
  assert.equal(
    elementMutationRequests,
    requestsBeforeKeyboard,
    "iframe keyboard gesture must remain preview-only",
  );
  const keyboardMovePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/elements") &&
      response.request().method() === "POST",
  );
  const moveLaterControl = page
    .locator(".layout-controls")
    .getByRole("button", { name: "Move later" });
  await moveLaterControl.focus();
  await moveLaterControl.press("Space");
  assert.equal((await keyboardMovePromise).ok(), true);
  await page.frameLocator("iframe").locator("#fixture-order").waitFor();
  order = await page
    .frameLocator("iframe")
    .locator("#fixture-order [data-edit-id]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-edit-id")),
    );
  assert.deepEqual(order, ["fixture.order.one", "fixture.order.two"]);

  // Assets keeps a project-scoped thumbnail library and exposes only the one
  // currently supported provider model. The acceptance run intercepts the
  // paid call after consent, so no provider credits are spent.
  const imageModel = {
    id: "higgsfield:gpt_image_2",
    label: "GPT Image 2",
    provider: "higgsfield",
    descriptor:
      "High-quality prompt-to-image generation. Usually slower and may queue for several minutes. Supports prompt-based regeneration, not source-image editing. Metered Higgsfield credits; the exact estimate is reserved before generation.",
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
    qualities: ["low", "medium", "high"],
  };
  const legacyImage = {
    id: "legacy_0123456789abcdefabcd",
    status: "completed",
    prompt: null,
    model: "unknown",
    provider: "unknown",
    aspectRatio: null,
    quality: null,
    dimensions: null,
    mimeType: "image/jpeg",
    createdAt: "2026-08-14T12:00:00.000Z",
    updatedAt: "2026-08-14T12:00:00.000Z",
    credits: null,
    error: null,
    outputPath: "site/assets/hero.jpg",
    source: {
      kind: "legacy",
      parentAssetId: null,
      targetEditId: "hero.image",
      originalPath: "assets/hero.jpg",
    },
    usage: [{ editId: "hero.image", src: "assets/hero.jpg" }],
    url: `/api/sites/${runId}/assets/hero.jpg`,
  };
  let libraryImages = [legacyImage];
  const assetMutations = [];
  let loseFirstGenerationResponse = true;
  await page.route(`**/api/assets/${runId}`, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          models: [imageModel],
          library: { version: 1, items: libraryImages },
        }),
      });
      return;
    }
    const body = request.postDataJSON();
    assetMutations.push(body);
    if (body.action === "generate") {
      if (loseFirstGenerationResponse) {
        loseFirstGenerationResponse = false;
        await route.abort("failed");
        return;
      }
      const generated = {
        ...legacyImage,
        id: body.requestId,
        prompt: body.prompt,
        model: body.model,
        provider: "higgsfield",
        aspectRatio: body.aspectRatio,
        quality: body.quality,
        dimensions: { width: 1600, height: 900 },
        credits: 2,
        outputPath: `site/assets/generated/${body.requestId}.jpg`,
        source: {
          kind: "generated",
          parentAssetId: null,
          targetEditId: body.targetEditId,
          originalPath: null,
        },
        usage: [],
      };
      libraryImages = [generated, legacyImage];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: "generate",
          item: generated,
          library: { version: 1, items: libraryImages },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        action: "place",
        item: libraryImages.find((item) => item.id === body.assetId),
        gates: [{ gate: "fixture", pass: true, blocking: true }],
      }),
    });
  });
  await page
    .frameLocator("iframe")
    .locator('[data-edit-id="hero.image"]')
    .click();
  await page.getByRole("button", { name: "Assets" }).click();
  const assetViews = page.getByRole("group", { name: "Asset view" });
  await page.getByRole("region", { name: "Project image library" }).waitFor();
  await page
    .getByText("Prompt unknown — existing site image", { exact: true })
    .waitFor();
  assert.match(
    await page.getByRole("region", { name: "Project image library" }).innerText(),
    /Prompt unknown — existing site image/,
  );
  assert.match(
    await page.getByRole("region", { name: "Project image library" }).innerText(),
    /hero\.image/,
  );
  await assetViews.getByRole("button", { name: "Generate" }).click();
  await page.getByLabel("Image model").waitFor();
  assert.deepEqual(await page.getByLabel("Image model").locator("option").allTextContents(), [
    "GPT Image 2",
  ]);
  assert.match(await page.getByRole("region", { name: "Generate project image" }).innerText(), /not source-image editing/i);
  await page.getByLabel("Image prompt").fill("Sunlit technician in a clean fiber lab");
  const generateButton = page.getByRole("button", { name: "Generate and save" });
  assert.equal(await generateButton.isDisabled(), true, "paid generation requires consent");
  await page
    .getByLabel(/I approve this metered Higgsfield generation/)
    .check();
  await generateButton.click();
  await page
    .getByText(/request outcome is unknown.*same saved request/i)
    .waitFor();
  const retrySavedRequest = page.getByRole("button", {
    name: "Check saved request",
  });
  await retrySavedRequest.waitFor();
  assert.equal(
    await page.getByLabel("Image prompt").isDisabled(),
    true,
    "ambiguous retries keep the original generation snapshot immutable",
  );
  await retrySavedRequest.click();
  await page.getByText("Image generated and saved to this project.").waitFor();
  assert.deepEqual(
    assetMutations[1],
    assetMutations[0],
    "ambiguous retries reuse the exact request UUID and payload",
  );
  const imageRequestBody = { ...assetMutations[1] };
  assert.match(imageRequestBody.requestId, /^[0-9a-f-]{36}$/i);
  delete imageRequestBody.requestId;
  assert.deepEqual(imageRequestBody, {
    action: "generate",
    prompt: "Sunlit technician in a clean fiber lab",
    model: "higgsfield:gpt_image_2",
    aspectRatio: "1:1",
    quality: "high",
    meteredConsent: true,
    targetEditId: "hero.image",
  });
  const generatedCard = page.locator(".asset-library-card").filter({
    hasText: "Sunlit technician in a clean fiber lab",
  });
  await generatedCard.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("region", { name: "Image preview" }).waitFor();
  await page.getByRole("region", { name: "Image preview" }).getByRole("button", { name: "Close" }).click();
  assert.equal(await generatedCard.getByRole("link", { name: "Download" }).count(), 1);
  await generatedCard.getByRole("button", { name: "Regenerate" }).click();
  assert.equal(await page.getByLabel("Image prompt").inputValue(), "Sunlit technician in a clean fiber lab");
  assert.equal(
    await page.getByLabel(/I approve this metered Higgsfield generation/).isChecked(),
    false,
    "regeneration requires fresh metered consent",
  );
  await assetViews.getByRole("button", { name: "Library" }).click();
  await generatedCard.getByRole("button", { name: "Replace selected" }).click();
  assert.deepEqual(assetMutations[2], {
    action: "place",
    assetId: libraryImages[0].id,
    editId: "hero.image",
  });
  await page.unroute(`**/api/assets/${runId}`);

  // Research is a saved-evidence reader, not a second business/design mixing
  // path. A retained ledger renders claims, confidence, rationale, and links.
  await page.route(`**/api/evidence/${runId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(researchFixturePayload),
    });
  });
  await page.getByRole("button", { name: "Research" }).click();
  await page.getByRole("region", { name: "Saved research findings" }).waitFor();
  const researchPanel = page.getByRole("region", { name: "Saved research findings" });
  assert.match(await researchPanel.innerText(), /Business intelligence/);
  assert.match(await researchPanel.innerText(), /Refero design reference evidence/);
  assert.match(await researchPanel.innerText(), /78% confidence/);
  assert.match(await researchPanel.innerText(), /Rationale: Clear hierarchy/);
  assert.equal(
    await researchPanel.getByRole("link", { name: "Saved market report" }).getAttribute("href"),
    "https://business.example/report",
  );
  await page.unroute(`**/api/evidence/${runId}`);

  // Add isolated fixture-only form/popup controls after mutation gates so
  // they test mode capabilities without becoming part of the product site.
  const editedHtml = await fs.readFile(indexPath, "utf8");
  await fs.writeFile(
    indexPath,
    editedHtml.replace("</body>", `${fixtureControls}</body>`),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForMode(page, "Edit");
  await page.frameLocator("iframe").locator("#e2e-form").waitFor();
  // Complex production behavior remains live after persisted edits in Edit
  // mode, but the canvas itself is exposed only through a safe overlay.
  await assertProductionFidelity(page, "Edit mode after persisted mutations");
  await page.frameLocator("iframe").locator("#e2e-webgl").click();
  await page.getByText("fixture.interactive", { exact: false }).waitFor();
  assert.match(
    await page.locator(".workbench-panel__body").innerText(),
    /Complex content stays live behind a safe selection overlay/,
  );
  const editUrlBeforeForm = page.frames()[1].url();
  await page
    .frameLocator("iframe")
    .locator("#e2e-submit")
    .dispatchEvent("pointerdown");
  assert.equal(page.frames()[1].url(), editUrlBeforeForm);
  await page
    .frameLocator("iframe")
    .locator("#e2e-change")
    .selectOption("attack");
  assert.equal(page.frames()[1].url(), editUrlBeforeForm);
  await page.frameLocator("iframe").locator("#e2e-submit").click();
  assert.equal(page.frames()[1].url(), editUrlBeforeForm);
  await page.frameLocator("iframe").locator("#e2e-form").dispatchEvent("submit");
  assert.equal(page.frames()[1].url(), editUrlBeforeForm);
  assert.equal(
    await page.frames()[1].evaluate(() => window.__e2eWindowCaptureCount),
    0,
    "overlay must run before generated window capture handlers",
  );

  // View mode is still opaque but permits normal navigation, self forms,
  // popups, downloads, and scripts. The popup carries no secret-bearing URL,
  // referrer, or storage access.
  await page.getByRole("button", { name: "View", exact: true }).click();
  await waitForMode(page, "View");
  await page.frameLocator("iframe").locator("#e2e-form").waitFor();
  assert.equal(
    await page.locator("iframe").getAttribute("sandbox"),
    "allow-scripts allow-forms allow-popups allow-downloads",
  );
  child = page.frames()[1];
  assert.equal(await iframeIsOpaque(child), true);
  await assertProductionFidelity(page, "View mode");
  await page
    .frameLocator("iframe")
    .locator('a[href="#contact"]')
    .last()
    .evaluate((element) => element.click());
  await page.waitForTimeout(100);
  assert.match(page.frames()[1].url(), /#contact$/);
  await page.frameLocator("iframe").locator("#e2e-submit").click();
  await page.waitForTimeout(300);
  assert.match(page.frames()[1].url(), /#contact$/);

  const popupPromise = context.waitForEvent("page");
  await page.frameLocator("iframe").locator("#e2e-popup").click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  assert.doesNotMatch(popup.url(), /token|key|secret/i);
  assert.doesNotMatch(
    await popup.evaluate(() => document.referrer),
    /token|key|secret/i,
  );
  assert.equal(await iframeIsOpaque(popup.mainFrame()), true);
  await popup.close();

  const viewResponse = await page.request.get(
    `${base}/api/sites/${runId}/index.html`,
  );
  const editResponse = await page.request.get(
    `${base}/api/sites/${runId}/index.html?edit=1`,
  );
  assert.match(
    viewResponse.headers()["content-security-policy"],
    /form-action 'self'/,
  );
  assert.match(
    editResponse.headers()["content-security-policy"],
    /form-action 'none'/,
  );
  assert.deepEqual(errors, []);
  await page.close();
  await context.close();

  // Responsive matrix: grab-tab state tracks the actual 480/768 boundaries,
  // and the iframe's CSS viewport equals the rendered iframe width.
  const matrix = [
    { width: 454, frameWidth: 390, expected: "mobile" },
    { width: 543, frameWidth: 479, expected: "mobile" },
    { width: 544, frameWidth: 480, expected: "tablet" },
    { width: 831, frameWidth: 767, expected: "tablet" },
    { width: 832, frameWidth: 768, expected: "desktop" },
    { width: 1280, frameWidth: 1216, expected: "desktop" },
  ];
  for (const item of matrix) {
    const matrixContext = await browser.newContext();
    const matrixPage = await openFixture(matrixContext, item.width);
    if ([454, 544, 832].includes(item.width)) {
      await assertProductionFidelity(matrixPage, `${item.expected} responsive Edit mode`);
    }
    if (item.width === 454) {
      const mobileHeadline = matrixPage
        .frameLocator("iframe")
        .locator('[data-edit-id="hero.headline"]');
      await mobileHeadline.focus();
      await mobileHeadline.press("Enter");
      await matrixPage.locator(".typography-controls select").first().waitFor();
      const selectBoxes = await matrixPage
        .locator(".typography-controls select")
        .evaluateAll((selects) =>
          selects.map((select) => {
            const box = select.getBoundingClientRect();
            return { x: box.x, width: box.width, height: box.height };
          }),
        );
      assert.equal(selectBoxes.length, 5);
      assert.ok(
        selectBoxes.every((box) => box.width >= 44 && box.height >= 44),
      );
      assert.equal(
        new Set(selectBoxes.map((box) => Math.round(box.x))).size,
        1,
        "mobile typography controls must be one column",
      );
      await matrixPage.getByRole("button", { name: "Cancel draft" }).click();
    }
    await matrixPage
      .getByRole("button", { name: "Collapse workbench" })
      .click();
    if (item.width === 454) {
      await matrixPage
        .getByRole("button", { name: "Reopen workbench" })
        .click();
      const reclamped = await matrixPage
        .locator(".preview-workbench")
        .boundingBox();
      assert.ok(reclamped && Math.round(reclamped.width) === 220);
      assert.equal(
        Number(
          await matrixPage
            .getByRole("separator", { name: "Resize preview and workbench" })
            .getAttribute("aria-valuenow"),
        ),
        220,
      );
      const mobileDivider = matrixPage.getByRole("separator", {
        name: "Resize preview and workbench",
      });
      assert.equal(Number(await mobileDivider.getAttribute("aria-valuemin")), 220);
      assert.equal(Number(await mobileDivider.getAttribute("aria-valuemax")), 220);
      await matrixPage
        .getByRole("button", { name: "Collapse workbench" })
        .click();
    }
    const responsiveGrabTab = matrixPage.locator(".workbench-grab-tab");
    await responsiveGrabTab.waitFor();
    await matrixPage.waitForFunction(
      (expected) =>
        document
          .querySelector(".workbench-grab-tab")
          ?.getAttribute("aria-label")
          ?.toLowerCase()
          .includes(`preview width: ${expected}`),
      item.expected,
    );
    assert.match(
      (await responsiveGrabTab.getAttribute("aria-label")) ?? "",
      new RegExp(`Preview width: ${item.expected}`, "i"),
      `${item.width}px grab tab must expose the active breakpoint`,
    );
    const box = await matrixPage.locator("iframe").boundingBox();
    assert.ok(box && box.width > 0);
    assert.equal(
      await matrixPage.frames()[1].evaluate(() => window.innerWidth),
      Math.round(box.width),
    );
    const responsiveSentinel = await matrixPage.frames()[1].evaluate(() => ({
      logoFontSize: getComputedStyle(document.querySelector(".nav__logo"))
        .fontSize,
      navLinksDisplay: getComputedStyle(document.querySelector(".nav__links"))
        .display,
    }));
    if (item.expected === "mobile")
      assert.equal(responsiveSentinel.logoFontSize, "17px");
    else assert.equal(responsiveSentinel.logoFontSize, "20px");
    assert.equal(
      responsiveSentinel.navLinksDisplay,
      item.expected === "desktop" ? "flex" : "none",
    );
    const mobilePreview = await matrixPage.locator("iframe").boundingBox();
    assert.ok(
      mobilePreview && Math.round(mobilePreview.width) === item.frameWidth,
    );
    for (const control of await matrixPage
      .locator(
        "main.preview-layout button:visible, main.preview-layout input:visible, main.preview-layout select:visible, main.preview-layout textarea:visible",
      )
      .all()) {
      const controlBox = await control.boundingBox();
      if (controlBox) {
        const identity = await control.evaluate(
          (element) =>
            `${element.tagName.toLowerCase()}.${element.className || ""}[${element.getAttribute("aria-label") || element.textContent?.trim() || ""}]`,
        );
        assert.ok(
          controlBox.width >= 44 && controlBox.height >= 44,
          `${item.width}px ${identity} is ${controlBox.width}x${controlBox.height}, below 44x44`,
        );
      }
    }
    await matrixContext.close();
  }

  // Wide workspaces keep the workbench bounded while named presets use an
  // exact, centered canvas. This guards the >1351px cap regression where
  // Tablet and Mobile previously remained desktop-sized.
  const wideContext = await browser.newContext();
  const widePage = await openFixture(wideContext, 1920, 900);
  const wideGrabTab = widePage.locator(".workbench-grab-tab");

  async function chooseWidePreset(label, expectedWidth) {
    await wideGrabTab.click();
    await widePage
      .getByRole("button", { name: `${label} preview width` })
      .click();
    await widePage.waitForFunction(
      (width) =>
        Math.round(
          document.querySelector("iframe")?.getBoundingClientRect().width ?? 0,
        ) === width,
      expectedWidth,
    );
    const frameBox = await widePage.locator("iframe").boundingBox();
    const panelBox = await widePage.locator(".preview-workbench").boundingBox();
    assert.ok(frameBox && Math.round(frameBox.width) === expectedWidth);
    assert.ok(panelBox && panelBox.width <= 960);
  }

  await chooseWidePreset("Desktop", 1280);
  await chooseWidePreset("Tablet", 767);
  await chooseWidePreset("Mobile", 390);

  const wideViewportBox = await widePage.locator(".preview-viewport").boundingBox();
  const wideMobileBox = await widePage.locator("iframe").boundingBox();
  assert.ok(wideViewportBox && wideMobileBox);
  assert.ok(
    Math.abs(
      wideMobileBox.x -
        (wideViewportBox.x + (wideViewportBox.width - wideMobileBox.width) / 2),
    ) <= 1,
    "wide mobile preset must be centered in the available preview canvas",
  );

  await widePage.reload({ waitUntil: "domcontentloaded" });
  await waitForMode(widePage, "Edit");
  await widePage.frameLocator("iframe").locator("[data-edit-id]").first().waitFor();
  assert.equal(
    Math.round((await widePage.locator("iframe").boundingBox()).width),
    390,
    "named preview preset must survive reload",
  );

  const wideDivider = widePage.getByRole("separator", {
    name: "Resize preview and workbench",
  });
  const wideDividerBox = await wideDivider.boundingBox();
  assert.ok(wideDividerBox);
  await widePage.mouse.move(
    wideDividerBox.x + wideDividerBox.width / 2,
    wideDividerBox.y + 120,
  );
  await widePage.mouse.down();
  await widePage.mouse.move(wideDividerBox.x + 200, wideDividerBox.y + 120, {
    steps: 5,
  });
  await widePage.mouse.up();
  const fluidWideFrame = await widePage.locator("iframe").boundingBox();
  assert.ok(
    fluidWideFrame && fluidWideFrame.width > 1_100,
    "manual divider drag must leave the named preset and resize fluidly",
  );
  await chooseWidePreset("Mobile", 390);
  await wideContext.close();

  console.log("preview workbench acceptance matrix passed");
} finally {
  await browser.close();
  await fs.rm(runRoot, { recursive: true, force: true });
}
