import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.ONEBOX_BASE_URL ?? "http://localhost:3000";
const root = process.cwd();
const runId = `token-motion-e2e-${Date.now().toString(36)}`;
const runRoot = path.join(root, "sites", runId);
await fs.cp(path.join(root, "sites", "smoke-fixture"), runRoot, { recursive: true, errorOnExist: true });
await Promise.all([
  fs.unlink(path.join(runRoot, "element-history.json")).catch(() => undefined),
  fs.unlink(path.join(runRoot, "token-history.json")).catch(() => undefined),
  fs.unlink(path.join(runRoot, "motion-history.json")).catch(() => undefined),
]);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${base}/preview/${runId}`, { waitUntil: "domcontentloaded" });
  const frame = () => page.frameLocator("iframe");
  await frame().locator('[data-edit-id="hero.headline"]').waitFor();

  await page.getByRole("button", { name: "Motion" }).click();
  await page.getByText("No motion target", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Tokens" }).click();
  const tokenSelect = page.getByLabel("Semantic token");
  await tokenSelect.waitFor();
  await tokenSelect.selectOption("--color-primary");
  assert.match(await page.locator(".token-scope").innerText(), /Usage scope:/);
  assert.match(await page.locator(".token-scope").innerText(), /Affected elements:/);
  const tokenInput = page.getByLabel("Validated value");
  const original = await tokenInput.inputValue();
  await tokenInput.fill("#3aa0fe");
  await page.getByRole("button", { name: "Preview change" }).click();
  await page.getByText("Preview ready", { exact: true }).waitFor();
  assert.equal(await frame().locator("html").evaluate((element) => getComputedStyle(element).getPropertyValue("--color-primary").trim()), "#3aa0fe");
  const applyToken = page.waitForResponse((response) => response.url().endsWith("/api/tokens") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Apply token" }).click();
  const applyTokenResponse = await applyToken;
  assert.equal(applyTokenResponse.ok(), true, await applyTokenResponse.text());
  await frame().locator('[data-edit-id="hero.headline"]').waitFor();
  assert.match(await fs.readFile(path.join(runRoot, "site", "tokens.css"), "utf8"), /--color-primary:\s*#3aa0fe/);
  const revertToken = page.waitForResponse((response) => response.url().endsWith("/api/tokens") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Revert last token" }).click();
  assert.equal((await revertToken).ok(), true);
  assert.match(await fs.readFile(path.join(runRoot, "site", "tokens.css"), "utf8"), new RegExp(`--color-primary:\\s*${original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

  await frame().locator('[data-edit-id="hero.headline"]').click();
  await page.route("**/api/motion?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  }, { times: 1 });
  await page.getByRole("button", { name: "Motion" }).click();
  await page.getByText("Loading motion", { exact: true }).waitFor();
  await page.getByLabel("Kind").waitFor();
  await page.getByLabel("Kind").selectOption("timeline");
  const triggerSelect = page.getByRole("combobox", { name: /^Trigger/ });
  assert.deepEqual(await triggerSelect.locator("option").evaluateAll((options) => options.map((option) => option.value)), ["load", "viewport", "manual"]);
  await triggerSelect.selectOption("viewport");
  await page.getByLabel("Replay").selectOption("repeat");
  await page.getByLabel("Breakpoint").selectOption("desktop");
  await page.getByLabel("Timeline group").fill("hero-sequence");
  await page.getByLabel("Timeline order").fill("3");
  assert.equal(await page.getByLabel("Timeline group").getAttribute("pattern"), "[A-Za-z0-9][A-Za-z0-9_-]{1,39}");
  assert.equal(await page.getByLabel("Timeline order").getAttribute("max"), "50");
  const timelineRequest = page.waitForRequest((request) => request.url().endsWith("/api/motion") && request.method() === "POST");
  const timelineResponse = page.waitForResponse((response) => response.url().endsWith("/api/motion") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Preview motion" }).click();
  assert.equal((await timelineResponse).ok(), true);
  const timelineBody = (await timelineRequest).postDataJSON();
  assert.equal(timelineBody.draft.trigger, "viewport");
  assert.equal(timelineBody.draft.replay, "repeat");
  assert.equal(timelineBody.draft.breakpoint, "desktop");
  assert.equal(timelineBody.draft.timelineId, "hero-sequence");
  assert.equal(timelineBody.draft.order, 3);
  assert.equal("selector" in timelineBody.draft, false);
  assert.equal("onComplete" in timelineBody.draft, false);
  await page.getByRole("button", { name: "Reset preview" }).click();

  await page.getByLabel("Kind").selectOption("scroll");
  assert.equal(await triggerSelect.inputValue(), "viewport");
  assert.deepEqual(await triggerSelect.locator("option").evaluateAll((options) => options.map((option) => option.value)), ["viewport"]);
  await page.getByLabel("Scroll scrub").selectOption("true");
  await page.getByLabel("Breakpoint").selectOption("all");
  const previewMotion = page.waitForResponse((response) => response.url().endsWith("/api/motion") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Preview motion" }).click();
  assert.equal((await previewMotion).ok(), true);
  await frame().locator('[data-edit-id="hero.headline"][data-onebox-motion-active="scroll"]').waitFor();
  await page.getByRole("button", { name: "Reset preview" }).click();

  const applyMotion = page.waitForResponse((response) => response.url().endsWith("/api/motion") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Apply motion" }).click();
  assert.equal((await applyMotion).ok(), true);
  const manifest = JSON.parse(await fs.readFile(path.join(runRoot, "site", "motion.json"), "utf8"));
  assert.equal(manifest.entries[0].kind, "scroll");
  assert.equal(manifest.entries[0].trigger, "viewport");
  assert.equal(manifest.entries[0].replay, "repeat");
  assert.equal(manifest.entries[0].scrub, true);

  await frame().locator('[data-edit-id="hero.sub"]').click({ force: true });
  await page.getByRole("button", { name: "Motion" }).click();
  await page.getByLabel("Kind").waitFor();
  await page.getByLabel("Kind").selectOption("timeline");
  await page.getByRole("combobox", { name: /^Trigger/ }).selectOption("manual");
  await page.getByLabel("Replay").selectOption("repeat");
  await page.getByLabel("Breakpoint").selectOption("tablet");
  await page.getByLabel("Duration ms").fill("875");
  await page.getByLabel("Delay ms").fill("125");
  await page.getByLabel("Horizontal offset").fill("55");
  await page.getByLabel("Opacity").fill("0.4");
  await page.getByLabel("Timeline group").fill("hero-sequence");
  await page.getByLabel("Timeline order").fill("3");
  const applyTimeline = page.waitForResponse((response) => response.url().endsWith("/api/motion") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Apply motion" }).click();
  assert.equal((await applyTimeline).ok(), true);

  await frame().locator('[data-edit-id="hero.sub"]').click({ force: true });
  await page.getByRole("button", { name: "Motion" }).click();
  await page.getByLabel("Kind").waitFor();
  assert.equal(await page.getByLabel("Kind").inputValue(), "timeline");
  assert.equal(await page.getByRole("combobox", { name: /^Trigger/ }).inputValue(), "manual");
  assert.equal(await page.getByLabel("Replay").inputValue(), "repeat");
  assert.equal(await page.getByLabel("Breakpoint").inputValue(), "tablet");
  assert.equal(await page.getByLabel("Duration ms").inputValue(), "875");
  assert.equal(await page.getByLabel("Delay ms").inputValue(), "125");
  assert.equal(await page.getByLabel("Horizontal offset").inputValue(), "55");
  assert.equal(await page.getByLabel("Opacity").inputValue(), "0.4");
  assert.equal(await page.getByLabel("Timeline group").inputValue(), "hero-sequence");
  assert.equal(await page.getByLabel("Timeline order").inputValue(), "3");
  const reapplyTimeline = page.waitForResponse((response) => response.url().endsWith("/api/motion") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Apply motion" }).click();
  assert.equal((await reapplyTimeline).ok(), true);
  const savedTimeline = JSON.parse(await fs.readFile(path.join(runRoot, "site", "motion.json"), "utf8")).entries.find((saved) => saved.editId === "hero.sub");
  assert.deepEqual({
    trigger: savedTimeline.trigger,
    replay: savedTimeline.replay,
    breakpoint: savedTimeline.breakpoint,
    durationMs: savedTimeline.durationMs,
    delayMs: savedTimeline.delayMs,
    x: savedTimeline.properties.x,
    opacity: savedTimeline.properties.opacity,
    timelineId: savedTimeline.timelineId,
    order: savedTimeline.order,
  }, { trigger: "manual", replay: "repeat", breakpoint: "tablet", durationMs: 875, delayMs: 125, x: 55, opacity: 0.4, timelineId: "hero-sequence", order: 3 });

  await page.getByRole("button", { name: "View", exact: true }).click();
  await frame().locator('[data-edit-id="hero.headline"][data-onebox-motion-active="scroll"]').waitFor();
  const triggerCount = () => page.frames()[1].evaluate(() => window.ScrollTrigger.getAll().filter((trigger) => String(trigger.vars.id || "").startsWith("onebox:")).length);
  assert.equal(await triggerCount(), 1);
  await page.setViewportSize({ width: 900, height: 800 });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  assert.equal(await triggerCount(), 1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.frameLocator("iframe").locator('[data-edit-id="hero.headline"][data-onebox-motion-active="scroll"]').waitFor();
  assert.equal(await page.frames()[1].evaluate(() => window.ScrollTrigger.getAll().filter((trigger) => String(trigger.vars.id || "").startsWith("onebox:")).length), 1);

  await page.getByRole("button", { name: "Edit" }).click();
  await frame().locator('[data-edit-id="hero.headline"]').click();
  await page.getByRole("button", { name: "Motion" }).click();
  await page.getByLabel("Kind").waitFor();
  assert.equal(await page.getByLabel("Kind").inputValue(), "scroll");
  assert.equal(await page.getByRole("combobox", { name: /^Trigger/ }).inputValue(), "viewport");
  assert.equal(await page.getByLabel("Replay").inputValue(), "repeat");
  assert.equal(await page.getByLabel("Scroll scrub").inputValue(), "true");
  const reapplyScroll = page.waitForResponse((response) => response.url().endsWith("/api/motion") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Apply motion" }).click();
  assert.equal((await reapplyScroll).ok(), true);
  const savedScroll = JSON.parse(await fs.readFile(path.join(runRoot, "site", "motion.json"), "utf8")).entries.find((saved) => saved.editId === "hero.headline");
  assert.equal(savedScroll.scrub, true);
  assert.equal(savedScroll.replay, "repeat");

  await frame().locator('[data-edit-id="hero.headline"]').click();
  await page.getByRole("button", { name: "Motion" }).click();
  await page.getByLabel("Kind").waitFor();
  const removeMotion = page.waitForResponse((response) => response.url().endsWith("/api/motion") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Remove kind" }).click();
  assert.equal((await removeMotion).ok(), true);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(runRoot, "site", "motion.json"), "utf8")).entries.map((saved) => saved.editId), ["hero.sub"]);

  await frame().locator('[data-edit-id="hero.headline"]').click();
  await page.getByRole("button", { name: "Motion" }).click();
  await page.getByRole("button", { name: "Revert last motion" }).waitFor();
  const revertMotion = page.waitForResponse((response) => response.url().endsWith("/api/motion") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Revert last motion" }).click();
  assert.equal((await revertMotion).ok(), true);
  assert.equal(JSON.parse(await fs.readFile(path.join(runRoot, "site", "motion.json"), "utf8")).entries.find((saved) => saved.editId === "hero.headline").kind, "scroll");

  await frame().locator("body").evaluate((body) => {
    const unsupported = document.createElement("fixture-widget");
    unsupported.dataset.editId = "fixture.custom";
    unsupported.textContent = "Unsupported fixture";
    body.append(unsupported);
  });
  await frame().locator('[data-edit-id="fixture.custom"]').click();
  await page.getByRole("button", { name: "Motion" }).click();
  await page.getByText("Unsupported motion target", { exact: true }).waitFor();

  const errorPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await errorPage.route("**/api/motion?*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "fixture motion failure" }) }));
  await errorPage.goto(`${base}/preview/${runId}`, { waitUntil: "domcontentloaded" });
  await errorPage.frameLocator("iframe").locator('[data-edit-id="hero.headline"]').click();
  await errorPage.getByRole("button", { name: "Motion" }).click();
  await errorPage.getByRole("alert").getByText("fixture motion failure", { exact: true }).waitFor();
  await errorPage.close();

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto(`${base}/preview/${runId}`, { waitUntil: "domcontentloaded" });
  await mobilePage.frameLocator("iframe").locator('[data-edit-id="hero.headline"]').click();
  await mobilePage.getByRole("button", { name: "Motion" }).click();
  await mobilePage.getByLabel("Kind").waitFor();
  await mobilePage.getByLabel("Kind").selectOption("timeline");
  const mobileGrid = mobilePage.locator(".motion-grid");
  assert.equal(await mobileGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length), 1);
  const undersized = await mobilePage.locator(".motion-grid input, .motion-grid select, .motion-actions button").evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { label: element.closest("label")?.textContent || element.textContent, width: rect.width, height: rect.height };
  }).filter((entry) => entry.width < 44 || entry.height < 44));
  assert.deepEqual(undersized, []);
  await mobilePage.close();
  console.log("token and motion workbench matrix passed");
} finally {
  await browser.close();
  await fs.rm(runRoot, { recursive: true, force: true });
}
