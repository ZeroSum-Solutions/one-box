import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.ONEBOX_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(8000);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(base).origin,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(base, { waitUntil: "domcontentloaded" });

  // These calls are deliberately unmocked. Invalid chat input and an empty
  // multipart upload must pass the real local authorization boundary, then
  // stop at validation before any model spend or file staging can occur.
  const localAuthorizationRegression = await page.evaluate(async () => {
    const chat = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const upload = await fetch("/api/uploads", {
      method: "POST",
      body: new FormData(),
    });
    return { chat: chat.status, upload: upload.status };
  });
  assert.deepEqual(localAuthorizationRegression, { chat: 400, upload: 400 });

  const intakeComposer = page.locator(".intake-composer");
  await intakeComposer.waitFor();
  assert.equal(await page.locator(".hero-display, .intake-control").count(), 0);
  assert.equal(
    await intakeComposer.locator("button:visible, summary:visible").count(),
    3
  );
  const persistentActionBoxes = await Promise.all([
    page.getByRole("button", { name: "Add files" }).boundingBox(),
    page.locator(".intake-target__summary").boundingBox(),
    page.locator(".intake-composer__send").boundingBox(),
  ]);
  assert.ok(
    persistentActionBoxes.every(
      (box) => box && box.width >= 44 && box.height >= 44
    )
  );
  const composer = page.getByRole("textbox", { name: "Describe your project" });
  assert.equal(await composer.getAttribute("rows"), "6");
  assert.equal(await composer.evaluate((element) => getComputedStyle(element).resize), "none");
  assert.ok((await composer.boundingBox()).height >= 140);

  const targetSelector = page.locator(".intake-target__summary");
  assert.match(await targetSelector.innerText(), /Website/);
  await targetSelector.click();
  const targetGroup = page.getByRole("radiogroup", { name: "Project target" });
  await targetGroup.waitFor();
  assert.match(
    await targetGroup.innerText(),
    /responsive public-facing site.*Next\.js and Tailwind CSS.*interactive browser product.*touch-first iPhone experience/is
  );

  const website = page.getByRole("radio", { name: /Website/i });
  await website.focus();
  assert.equal(await website.evaluate((element) => element === document.activeElement), true);
  await page.getByRole("radio", { name: /Web app/i }).check();
  assert.equal(await targetGroup.isHidden(), true);
  assert.match(
    await page.locator(".intake-target__context").innerText(),
    /Web app selected.*users, core workflow, important screens/i
  );

  await targetSelector.click();
  await website.check();
  assert.equal(await targetGroup.isHidden(), true);
  assert.match(
    await page.locator(".intake-target__context").innerText(),
    /Website selected.*company, audience, pages, and action/i
  );

  await targetSelector.click();
  await page.locator(".intake-research > summary").click();
  const researchGroup = page.getByRole("group", { name: "Design Research" });
  await researchGroup.waitFor();

  const researchToggle = page.getByRole("checkbox", {
    name: "Use research before generation",
  });
  const businessResearch = page.getByRole("checkbox", {
    name: "Business and competitor context",
  });
  const paidFallback = page.getByRole("checkbox", {
    name: /Allow paid Firecrawl discovery and fallback/,
  });
  const referoEvidence = page.locator('input[name="refero-design-evidence"]');
  assert.equal(await referoEvidence.isChecked(), false);
  assert.equal(await referoEvidence.isDisabled(), true);
  assert.match(
    await page.getByText(/Not connected in this project/).innerText(),
    /Connect Refero once.*refreshable OAuth session locally and outside Git/i
  );
  assert.equal(
    await page.getByRole("link", { name: "Connect Refero" }).getAttribute("href"),
    "/api/refero/connect"
  );
  assert.equal(await paidFallback.isChecked(), false);
  assert.match(
    await page.getByText(/May incur metered cost/).innerText(),
    /competitor web search.*local crawler fails.*bot wall.*required format/i
  );
  await researchToggle.uncheck();
  assert.equal(await businessResearch.isDisabled(), true);
  assert.equal(await paidFallback.isDisabled(), true);
  await researchToggle.check();
  assert.equal(await businessResearch.isEnabled(), true);
  assert.equal(await paidFallback.isEnabled(), true);
  await paidFallback.check();
  assert.equal(
    await page.locator(".intake-research__options input").nth(2).isChecked(),
    true
  );
  await page.getByRole("button", { name: "Done" }).click();
  assert.equal(await targetGroup.isHidden(), true);

  let releaseUpload;
  const releasePromise = new Promise((resolve) => {
    releaseUpload = resolve;
  });
  await page.route("**/api/uploads", async (route) => {
    await releasePromise;
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "The test upload was rejected." }),
    });
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "brand.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("brand"),
  });
  const uploadingButton = page.getByRole("button", { name: "Add files" });
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="Add files"]')?.hasAttribute("disabled")
  );
  assert.equal(await uploadingButton.isDisabled(), true);
  releaseUpload();
  const alert = page.locator(".intake-upload__error");
  await alert.waitFor();
  assert.match(await alert.innerText(), /test upload was rejected/i);
  assert.match(await alert.innerText(), /adjust the selection/i);

  // Authorization failures retain the browser File object and expose an
  // in-place retry. The recovery must not blame a valid file selection.
  await page.unroute("**/api/uploads");
  let authUploadCall = 0;
  await page.route("**/api/uploads", async (route) => {
    authUploadCall += 1;
    if (authUploadCall === 1) {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "Cross-origin uploads are not allowed." }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadSession: "z".repeat(43),
        expiresAt: "2026-08-13T23:59:59.000Z",
        uploads: [{
          id: "recovered-upload",
          fileName: "authorization-retry.txt",
          kind: "copy-document",
          mediaType: "text/plain",
          sizeBytes: 5,
          uploadedAt: "2026-08-13T00:00:00.000Z",
        }],
      }),
    });
  });
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "authorization-retry.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("retry"),
  });
  await page.getByText(/authorization-retry\.txt.*Not uploaded/i).waitFor();
  const authorizationAlert = page.locator(".intake-upload__error");
  assert.match(await authorizationAlert.innerText(), /local request was blocked/i);
  assert.doesNotMatch(await authorizationAlert.innerText(), /adjust the selection/i);
  await page.getByRole("button", { name: "Retry upload" }).click();
  await page.locator(".intake-upload__disclosure > summary").getByText("authorization-retry.txt", { exact: true }).waitFor();
  assert.equal(authUploadCall, 2);
  assert.equal(await page.getByText(/authorization-retry\.txt.*Not uploaded/i).count(), 0);

  // A failed Send stays attached to one submitted message. Retry reuses the
  // exact prompt and intake-context snapshot; Edit restores that snapshot to
  // the controls instead of asking the user to reconstruct it.
  const chatBodies = [];
  let resolveSecondChat;
  const secondChat = new Promise((resolve) => {
    resolveSecondChat = resolve;
  });
  await page.route("**/api/chat", async (route) => {
    chatBodies.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized local API request" }),
    });
    if (chatBodies.length === 2) resolveSecondChat();
  });
  const preservedPrompt = "Build the retained-context regression site";
  await composer.fill(preservedPrompt);
  await composer.press("Enter");
  const attemptError = page.locator(".transcript .chat-error");
  await attemptError.getByText(/local request was blocked/i).waitFor();
  assert.equal(
    await page.locator(".transcript__line").filter({ hasText: preservedPrompt }).count(),
    1
  );
  assert.equal(await composer.inputValue(), "");
  await attemptError.getByText("Technical details").click();
  assert.match(await attemptError.innerText(), /403/);
  await attemptError.getByRole("button", { name: "Retry" }).click();
  await secondChat;
  assert.deepEqual(chatBodies[1], chatBodies[0]);
  assert.equal(
    await page.locator(".transcript__line").filter({ hasText: preservedPrompt }).count(),
    1
  );
  await attemptError.getByRole("button", { name: "Edit prompt" }).waitFor();
  await attemptError.getByRole("button", { name: "Edit prompt" }).click();
  assert.equal(await composer.inputValue(), preservedPrompt);
  assert.equal(await referoEvidence.isChecked(), false);
  assert.equal(
    await page.locator(".intake-research__options input").nth(2).isChecked(),
    true
  );
  assert.equal(await page.locator(".intake-upload__disclosure > summary").getByText("authorization-retry.txt", { exact: true }).count(), 1);
  await page.waitForFunction(
    () => document.querySelector(".composer__input") === document.activeElement
  );
  assert.equal(await composer.evaluate((element) => element === document.activeElement), true);
  await composer.fill("");
  await page.unroute("**/api/chat");

  // An expired bearer clears stale client metadata and offers a focusable,
  // recoverable re-selection action instead of repeatedly sending a dead handle.
  let uploadCall = 0;
  await page.unroute("**/api/uploads");
  await page.route("**/api/uploads", async (route) => {
    uploadCall += 1;
    if (uploadCall === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          uploadSession: "z".repeat(43),
          expiresAt: "2026-08-13T23:59:59.000Z",
          uploads: [{
            id: "stale-upload",
            fileName: "copy.txt",
            kind: "copy-document",
            mediaType: "text/plain",
            sizeBytes: 4,
            uploadedAt: "2026-08-13T00:00:00.000Z",
          }],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: "text/plain",
      body: "expired without JSON",
    });
  });
  await fileInput.setInputFiles({
    name: "copy.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("copy"),
  });
  await page.getByText("2 files attached", { exact: true }).waitFor();
  await fileInput.setInputFiles({
    name: "second.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("more"),
  });
  const expiredAlert = page.getByRole("alert");
  await expiredAlert.getByText(/previous file selections were cleared/i).waitFor();
  assert.equal(await page.getByText(/copy\.txt/).count(), 0);
  const reselect = page.getByRole("button", { name: "Choose files again" });
  await reselect.focus();
  assert.equal(await reselect.evaluate((element) => element === document.activeElement), true);
  assert.match(await page.locator(".intake-upload__policy").innerText(), /PDF, DOC, DOCX, and ZIP.*not used automatically/i);

  // Expiry can also occur later, when start_pipeline atomically claims the
  // staging session. The typed tool result must clear stale metadata and expose
  // the same recovery UI without entering pipeline mode.
  await page.unroute("**/api/uploads");
  await page.route("**/api/uploads", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadSession: "b".repeat(43),
        expiresAt: "2026-08-13T23:59:59.000Z",
        uploads: [{
          id: "claim-expiry-upload",
          fileName: "claim-copy.txt",
          kind: "copy-document",
          mediaType: "text/plain",
          sizeBytes: 5,
          uploadedAt: "2026-08-13T00:00:00.000Z",
        }],
      }),
    });
  });
  await fileInput.setInputFiles({
    name: "claim-copy.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("claim"),
  });
  await page.locator(".intake-upload__disclosure > summary").getByText("claim-copy.txt", { exact: true }).waitFor();
  await page.route("**/api/chat", async (route) => {
    const frames = [
      { type: "tool-input-start", toolCallId: "claim-expired", toolName: "start_pipeline" },
      {
        type: "tool-output-available",
        toolCallId: "claim-expired",
        output: {
          started: false,
          code: "upload-session-expired",
          message: "Your private upload session expired. Choose the files again.",
        },
      },
    ];
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n`,
    });
  });
  await composer.fill("Start the project");
  await composer.press("Enter");
  const claimAlert = page.locator(".transcript .chat-error");
  await claimAlert.getByText(/private upload session expired/i).waitFor();
  assert.equal(await page.getByText(/claim-copy\.txt/).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Choose files again" }).isVisible(), true);
  assert.equal(await page.locator(".timeline-view").count(), 0);

  // Starting a fresh selection clears the external claim-expiry state. A
  // successful response must leave no stale recovery CTA, and both upload
  // controls share the same file-limit disabled predicate.
  await page.unroute("**/api/uploads");
  await page.route("**/api/uploads", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadSession: "c".repeat(43),
        expiresAt: "2026-08-13T23:59:59.000Z",
        uploads: Array.from({ length: 5 }, (_, index) => ({
          id: `fresh-upload-${index + 1}`,
          fileName: `fresh-${index + 1}.txt`,
          kind: "copy-document",
          mediaType: "text/plain",
          sizeBytes: 5,
          uploadedAt: "2026-08-13T00:00:00.000Z",
        })),
      }),
    });
  });
  await fileInput.setInputFiles({
    name: "fresh.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("fresh"),
  });
  await page.getByText("5 files attached", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Choose files again" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Add files" }).isDisabled(), true);
  assert.equal(await fileInput.isDisabled(), true);
  assert.equal(await fileInput.getAttribute("tabindex"), "-1");

  // A pipeline-stage failure must not strand the user on the build timeline.
  // The original prompt and settings return to intake, while an unavailable
  // Refero integration remains safely disabled before the next submission.
  const recoveryPage = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const recoveryChatBodies = [];
  await recoveryPage.route("**/api/chat", async (route) => {
    recoveryChatBodies.push(JSON.parse(route.request().postData() ?? "{}"));
    if (recoveryChatBodies.length === 1) {
      const clarificationFrames = [
        { type: "text-start", id: "clarification" },
        {
          type: "text-delta",
          id: "clarification",
          delta: "Which city should this project serve?",
        },
        { type: "text-end", id: "clarification" },
      ];
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `${clarificationFrames
          .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
          .join("")}data: [DONE]\n\n`,
      });
      return;
    }
    const frames = [
      { type: "tool-input-start", toolCallId: "recovery", toolName: "start_pipeline" },
      {
        type: "tool-output-available",
        toolCallId: "recovery",
        output: { runId: "recovery-run", started: true },
      },
    ];
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n`,
    });
  });
  await recoveryPage.route("**/api/run", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({
        type: "error",
        message: "The build stopped at a recoverable configuration boundary.",
      })}\n\ndata: [DONE]\n\n`,
    });
  });
  await recoveryPage.goto(base, { waitUntil: "networkidle" });
  const recoveryComposer = recoveryPage.getByRole("textbox", {
    name: "Describe your project",
  });
  const recoveryRefero = recoveryPage.locator(
    'input[name="refero-design-evidence"]'
  );
  assert.equal(await recoveryRefero.isDisabled(), true);
  assert.equal(await recoveryRefero.isChecked(), false);
  const earlierPrompt = "I need a local service website";
  await recoveryComposer.fill(earlierPrompt);
  await recoveryComposer.press("Enter");
  const clarificationLine = recoveryPage
    .locator(".transcript__line")
    .filter({ hasText: "Which city should this project serve?" });
  await clarificationLine.waitFor();
  const recoveryPrompt = "Build a recoverable pipeline regression site";
  await recoveryComposer.fill(recoveryPrompt);
  await recoveryComposer.press("Enter");
  await recoveryPage
    .getByText("The build stopped at a recoverable configuration boundary.")
    .waitFor();
  assert.equal(
    recoveryChatBodies[0].intakeContext.research.referoDesignEvidence,
    false
  );
  assert.match(recoveryPage.url(), /[?&]run=recovery-run(?:&|$)/);
  await recoveryPage
    .getByRole("button", { name: "Edit prompt and settings" })
    .click();
  assert.equal(await recoveryComposer.inputValue(), recoveryPrompt);
  assert.equal(
    await recoveryPage
      .locator(".transcript__line")
      .filter({ hasText: earlierPrompt })
      .count(),
    1
  );
  assert.equal(
    await clarificationLine.count(),
    1
  );
  assert.equal(new URL(recoveryPage.url()).searchParams.has("run"), false);
  assert.equal(await recoveryRefero.isChecked(), false);
  assert.equal(await recoveryRefero.isDisabled(), true);
  await recoveryPage.close();

  // Long pasted prompts consume available writing space, cap at half the
  // viewport, and scroll internally without moving the action row off-screen.
  const longPrompt = Array.from(
    { length: 80 },
    (_, index) => `Line ${index + 1}: detailed company, audience, and page guidance.`
  ).join("\n");
  await page.evaluate((text) => navigator.clipboard.writeText(text), longPrompt);
  await composer.focus();
  await page.keyboard.press("ControlOrMeta+V");
  assert.equal(await composer.inputValue(), longPrompt);
  const tallBox = await composer.boundingBox();
  assert.ok(tallBox.height <= 422);
  assert.equal(
    await composer.evaluate((element) => element.scrollHeight > element.clientHeight),
    true
  );
  assert.equal(await page.locator(".intake-composer__footer").isVisible(), true);

  await page.setViewportSize({ width: 390, height: 360 });
  await page.waitForFunction(
    () => document.querySelector(".composer__input")?.clientHeight <= 180
  );
  const shortComposerBox = await composer.boundingBox();
  const shortFooterBox = await page.locator(".intake-composer__footer").boundingBox();
  const shortPageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  assert.ok(shortComposerBox.y >= 0);
  assert.ok(shortFooterBox.y + shortFooterBox.height <= 360 || shortPageHeight > 360);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true
  );

  const focusGuidancePage = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await focusGuidancePage.goto(base, { waitUntil: "networkidle" });
  const focusGuidanceInput = focusGuidancePage.getByRole("textbox", {
    name: "Describe your project",
  });
  await focusGuidanceInput.focus();
  // Let React commit the focus-driven interval cleanup before sampling the
  // value that must remain stable. This avoids racing the 4.8 s tick itself.
  await focusGuidancePage.waitForTimeout(100);
  const focusedPlaceholder = await focusGuidanceInput.getAttribute("placeholder");
  await focusGuidancePage.waitForTimeout(5000);
  assert.equal(await focusGuidanceInput.getAttribute("placeholder"), focusedPlaceholder);
  await focusGuidancePage.close();

  const reducedMotionPage = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await reducedMotionPage.emulateMedia({ reducedMotion: "reduce" });
  await reducedMotionPage.goto(base, { waitUntil: "domcontentloaded" });
  const reducedMotionInput = reducedMotionPage.getByRole("textbox", {
    name: "Describe your project",
  });
  const reducedPlaceholder = await reducedMotionInput.getAttribute("placeholder");
  await reducedMotionPage.waitForTimeout(5000);
  assert.equal(await reducedMotionInput.getAttribute("placeholder"), reducedPlaceholder);
  await reducedMotionPage.close();

  const cyclingGuidancePage = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await cyclingGuidancePage.goto(base, { waitUntil: "domcontentloaded" });
  const cyclingGuidanceInput = cyclingGuidancePage.getByRole("textbox", {
    name: "Describe your project",
  });
  const initialCyclingPlaceholder = await cyclingGuidanceInput.getAttribute("placeholder");
  await cyclingGuidancePage.waitForTimeout(5000);
  assert.notEqual(
    await cyclingGuidanceInput.getAttribute("placeholder"),
    initialCyclingPlaceholder
  );
  await cyclingGuidancePage.close();

  assert.deepEqual(errors, []);
  console.log("intake upload browser checks passed");
} finally {
  await browser.close();
}
