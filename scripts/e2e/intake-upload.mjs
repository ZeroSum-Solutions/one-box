import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.ONEBOX_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(base, { waitUntil: "domcontentloaded" });

  const targetGroup = page.getByRole("group", { name: "Project target" });
  const researchGroup = page.getByRole("group", { name: "Design Research" });
  await targetGroup.waitFor();
  await researchGroup.waitFor();

  const website = page.getByRole("radio", { name: "Website", exact: true });
  await website.focus();
  assert.equal(await website.evaluate((element) => element === document.activeElement), true);

  const researchToggle = page.getByRole("checkbox", {
    name: "Use research before generation",
  });
  const businessResearch = page.getByRole("checkbox", {
    name: "Business and competitor context",
  });
  const paidFallback = page.getByRole("checkbox", {
    name: /Allow paid Firecrawl discovery and fallback/,
  });
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
  assert.equal(await paidFallback.isChecked(), true);

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
  const uploadingButton = page.getByRole("button", { name: "Uploading…" });
  await uploadingButton.waitFor();
  assert.equal(await uploadingButton.isDisabled(), true);
  releaseUpload();
  const alert = page.locator(".intake-upload__error");
  await alert.waitFor();
  assert.match(await alert.innerText(), /test upload was rejected/i);

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
          uploadSession: "a".repeat(43),
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
      contentType: "application/json",
      body: JSON.stringify({ error: "The upload session is invalid or expired." }),
    });
  });
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "copy.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("copy"),
  });
  await page.getByText(/copy\.txt/).waitFor();
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
  await page.getByText(/claim-copy\.txt/).waitFor();
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
  const composer = page.locator(".composer__input");
  await composer.fill("Start the project");
  await composer.press("Enter");
  const claimAlert = page.getByRole("alert");
  await claimAlert.getByText(/private upload session expired/i).waitFor();
  assert.equal(await page.getByText(/claim-copy\.txt/).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Choose files again" }).isVisible(), true);
  assert.equal(await page.locator(".timeline-view").count(), 0);

  const targetBoxes = await Promise.all(
    ["Website", "Web app", "iOS app"].map((name) =>
      page.getByText(name, { exact: true }).boundingBox()
    )
  );
  assert.ok(targetBoxes.every(Boolean));
  assert.ok(targetBoxes[0].y < targetBoxes[1].y);
  assert.ok(targetBoxes[1].y < targetBoxes[2].y);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true
  );
  assert.deepEqual(errors, []);
  console.log("intake upload browser checks passed");
} finally {
  await browser.close();
}
