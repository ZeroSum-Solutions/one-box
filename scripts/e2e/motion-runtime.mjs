import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const gsapPath = path.join(root, "node_modules/gsap/dist/gsap.min.js");
const scrollTriggerPath = path.join(root, "node_modules/gsap/dist/ScrollTrigger.min.js");
const runtimePath = path.join(root, "templates/local-service/motion-runtime.js");
const entry = {
  id: "00000000-0000-4000-8000-000000000001",
  editId: "hero.headline",
  kind: "scroll",
  durationMs: 300,
  delayMs: 0,
  ease: "power2.out",
  properties: { y: 24, opacity: 0 },
  trigger: "viewport",
  replay: "once",
  breakpoint: "all",
  scrub: false,
};

async function boot(page, manifest) {
  await page.setContent('<main style="min-height:200vh"><h1 data-edit-id="hero.headline">Headline</h1><div data-edit-id="hero.webgl"><canvas></canvas></div></main>');
  await page.evaluate((value) => { window.__ONEBOX_MOTION_MANIFEST__ = value; }, manifest);
  await page.addScriptTag({ path: gsapPath });
  await page.addScriptTag({ path: scrollTriggerPath });
  await page.addScriptTag({ path: runtimePath });
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await boot(page, { version: 1, entries: [entry] });
  const counts = () => page.evaluate(() => ({
    triggers: window.ScrollTrigger.getAll().filter((trigger) => String(trigger.vars.id || "").startsWith("onebox:")).length,
    active: document.querySelectorAll("[data-onebox-motion-active]").length,
  }));
  assert.deepEqual(await counts(), { triggers: 1, active: 1 });

  await page.evaluate(() => {
    window.__ONEBOX_MOTION_RUNTIME__.rehydrate();
    window.__ONEBOX_MOTION_RUNTIME__.rehydrate();
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(250);
  assert.deepEqual(await counts(), { triggers: 1, active: 1 });

  await page.addScriptTag({ path: runtimePath });
  assert.deepEqual(await counts(), { triggers: 1, active: 1 });
  await page.evaluate(() => window.__ONEBOX_MOTION_RUNTIME__.destroy());
  assert.deepEqual(await counts(), { triggers: 0, active: 0 });

  const reduced = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await reduced.emulateMedia({ reducedMotion: "reduce" });
  await boot(reduced, { version: 1, entries: [{ ...entry, kind: "entrance", trigger: "load" }] });
  assert.equal(await reduced.locator("[data-onebox-motion-active]").count(), 0);
  assert.equal(await reduced.evaluate(() => document.documentElement.classList.contains("no-motion")), true);
  assert.equal(await reduced.locator('[data-edit-id="hero.headline"]').evaluate((element) => getComputedStyle(element).transform), "none");
  await reduced.close();

  const fallback = await browser.newPage();
  await boot(fallback, { version: 1, entries: [] });
  assert.equal(await fallback.evaluate(() => document.documentElement.classList.contains("no-motion")), false);
  await fallback.evaluate((unsafe) => {
    window.__ONEBOX_MOTION_MANIFEST__ = { version: 1, entries: [unsafe] };
    window.__ONEBOX_MOTION_RUNTIME__.rehydrate();
  }, { ...entry, editId: "hero.webgl" });
  assert.equal(await fallback.locator('[data-edit-id="hero.webgl"]').getAttribute("data-onebox-motion-active"), null);
  await fallback.close();
  await page.close();
  console.log("motion runtime lifecycle matrix passed");
} finally {
  await browser.close();
}
