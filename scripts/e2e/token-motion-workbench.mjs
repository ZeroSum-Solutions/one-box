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
  await page.getByRole("button", { name: "Motion" }).click();
  await page.getByLabel("Kind").waitFor();
  await page.getByLabel("Kind").selectOption("scroll");
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

  await page.getByRole("button", { name: "View" }).click();
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
  console.log("token and motion workbench matrix passed");
} finally {
  await browser.close();
  await fs.rm(runRoot, { recursive: true, force: true });
}
