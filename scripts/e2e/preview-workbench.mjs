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
    '<button type="button" data-edit-id="fixture.button" style="color: var(--color-text); background-color: var(--color-surface)">Fixture native button</button><form><button data-edit-id="fixture.submit" style="color: var(--color-text); background-color: var(--color-surface); font-family: var(--font-body)">Implicit submit</button></form><section id="fixture-order"><p data-edit-id="fixture.order.one">Order one</p><p data-edit-id="fixture.order.two">Order two</p></section></body>',
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
  await page.getByRole("button", { name: "Edit" }).waitFor();
  await waitForMode(page, "Edit");
  await page.frameLocator("iframe").locator("[data-edit-id]").first().waitFor();
  return page;
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

  // Actual iframe width and ARIA divider value track the rendered split.
  const iframeBox = await page.locator("iframe").boundingBox();
  assert.ok(iframeBox && iframeBox.width > 800);
  assert.equal(
    await child.evaluate(() => window.innerWidth),
    Math.round(iframeBox.width),
  );
  assert.equal(
    (await page.getByText("desktop", { exact: true }).count()) > 0,
    true,
  );
  const divider = page.getByRole("separator", {
    name: "Resize preview and workbench",
  });
  assert.equal(Number(await divider.getAttribute("aria-valuemin")), 300);
  assert.equal(Number(await divider.getAttribute("aria-valuemax")), 720);
  const dividerBox = await divider.boundingBox();
  const panelBefore = await page.locator(".preview-workbench").boundingBox();
  assert.ok(dividerBox && panelBefore);
  assert.ok(
    dividerBox.width >= 44,
    `separator hit area is ${dividerBox.width}px`,
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

  // Collapse fills nearly the workspace; reopen restores expanded size/width.
  const expandedWidth = panelAfter.width;
  await page.getByRole("button", { name: "Collapse workbench" }).click();
  const collapsedPreview = await page.locator("iframe").boundingBox();
  assert.ok(collapsedPreview && collapsedPreview.width >= 1210);
  await page.getByRole("button", { name: "Reopen workbench" }).click();
  const reopenedPanel = await page.locator(".preview-workbench").boundingBox();
  assert.ok(
    reopenedPanel && Math.abs(reopenedPanel.width - expandedWidth) <= 1,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Expand" })
      .getAttribute("aria-pressed"),
    "true",
  );

  // Pointer width and expanded state persist across a full reload.
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForMode(page, "Edit");
  await page.frameLocator("iframe").locator("[data-edit-id]").first().waitFor();
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
  await page.getByRole("button", { name: "View" }).click();
  await waitForMode(page, "View");
  await page.frameLocator("iframe").locator("#e2e-form").waitFor();
  assert.equal(
    await page.locator("iframe").getAttribute("sandbox"),
    "allow-scripts allow-forms allow-popups allow-downloads",
  );
  child = page.frames()[1];
  assert.equal(await iframeIsOpaque(child), true);
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

  // Responsive matrix: labels stay visible, 480/768 boundaries are exact,
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
    const label = matrixPage.getByText(item.expected, { exact: true });
    await label.waitFor();
    assert.equal(
      await label.isVisible(),
      true,
      `${item.width}px breakpoint label must be visible`,
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

  console.log("preview workbench acceptance matrix passed");
} finally {
  await browser.close();
  await fs.rm(runRoot, { recursive: true, force: true });
}
