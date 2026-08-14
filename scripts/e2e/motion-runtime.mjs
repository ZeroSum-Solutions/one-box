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
const manualEntrance = {
  ...entry,
  id: "00000000-0000-4000-8000-000000000002",
  kind: "entrance",
  trigger: "manual",
};
const manualTimeline = {
  ...entry,
  id: "00000000-0000-4000-8000-000000000003",
  kind: "timeline",
  trigger: "manual",
  timelineId: "hero-sequence",
  order: 3,
};
const hoverEntry = {
  ...entry,
  id: "00000000-0000-4000-8000-000000000004",
  kind: "hover",
  trigger: "hover",
  durationMs: 80,
  properties: { x: 100 },
};

async function boot(page, manifest) {
  await page.setContent('<main style="min-height:200vh"><h1 data-edit-id="hero.headline">Headline</h1><p data-edit-id="hero.sub">Subhead</p><div data-edit-id="hero.webgl"><canvas></canvas></div></main>');
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
  assert.equal(await page.evaluate(() => window.ScrollTrigger.getAll()[0].vars.toggleActions), "play none none none");

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
  assert.equal(await reduced.evaluate((value) => window.__ONEBOX_MOTION_RUNTIME__.preview(value), hoverEntry), true);
  await reduced.waitForTimeout(100);
  assert.equal(await reduced.locator('[data-edit-id="hero.headline"]').evaluate((element) => getComputedStyle(element).transform), "none");
  await reduced.close();

  const authoredHover = await browser.newPage();
  await boot(authoredHover, { version: 1, entries: [] });
  await authoredHover.locator('[data-edit-id="hero.headline"]').evaluate((element, value) => {
    element.style.transform = "translateX(40px)";
    window.__ONEBOX_MOTION_MANIFEST__ = { version: 1, entries: [value] };
    window.__ONEBOX_MOTION_RUNTIME__.rehydrate();
  }, hoverEntry);
  const authoredX = () => authoredHover.locator('[data-edit-id="hero.headline"]').evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
  assert.equal(Math.round(await authoredX()), 40);
  await authoredHover.locator('[data-edit-id="hero.headline"]').dispatchEvent("pointerenter");
  await authoredHover.waitForTimeout(120);
  assert.equal(Math.round(await authoredX()), 100);
  await authoredHover.locator('[data-edit-id="hero.headline"]').dispatchEvent("pointerleave");
  await authoredHover.waitForTimeout(120);
  assert.equal(Math.round(await authoredX()), 40);
  await authoredHover.close();

  const viewportTimeline = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await boot(viewportTimeline, { version: 1, entries: [{ ...manualTimeline, trigger: "viewport", replay: "repeat" }] });
  assert.equal(await viewportTimeline.evaluate(() => window.ScrollTrigger.getAll().filter((trigger) => String(trigger.vars.id || "").startsWith("onebox:")).length), 1);
  assert.equal(await viewportTimeline.evaluate(() => window.ScrollTrigger.getAll()[0].vars.toggleActions), "play reverse play reverse");
  assert.equal(await viewportTimeline.evaluate(() => Boolean(window.ScrollTrigger.getAll()[0].animation)), true);
  await viewportTimeline.close();

  const manual = await browser.newPage();
  await boot(manual, { version: 1, entries: [] });
  assert.equal(await manual.evaluate((value) => {
    const original = window.gsap.from;
    let calls = 0;
    window.gsap.from = function (...args) { calls += 1; return original.apply(this, args); };
    const result = window.__ONEBOX_MOTION_RUNTIME__.preview(value);
    window.gsap.from = original;
    return result && calls;
  }, manualEntrance), 1);
  assert.equal(await manual.evaluate((value) => {
    const original = window.gsap.timeline;
    let restarts = 0;
    window.gsap.timeline = function (...args) {
      const timeline = original.apply(this, args);
      const restart = timeline.restart;
      timeline.restart = function (...restartArgs) { restarts += 1; return restart.apply(this, restartArgs); };
      return timeline;
    };
    const result = window.__ONEBOX_MOTION_RUNTIME__.preview(value);
    window.gsap.timeline = original;
    return result && restarts;
  }, manualTimeline), 1);
  await manual.close();

  const manualVisual = await browser.newPage();
  await boot(manualVisual, { version: 1, entries: [manualTimeline] });
  assert.equal(await manualVisual.locator('[data-edit-id="hero.headline"]').evaluate((element) => getComputedStyle(element).transform), "none");
  await manualVisual.locator('[data-edit-id="hero.headline"]').evaluate((element) => element.dispatchEvent(new Event("onebox-motion-preview")));
  await manualVisual.waitForTimeout(30);
  assert.notEqual(await manualVisual.locator('[data-edit-id="hero.headline"]').evaluate((element) => getComputedStyle(element).transform), "none");
  await manualVisual.close();

  const groupedOnce = await browser.newPage();
  await boot(groupedOnce, { version: 1, entries: [] });
  assert.deepEqual(await groupedOnce.evaluate((first) => {
    const second = {
      ...first,
      id: "00000000-0000-4000-8000-000000000005",
      editId: "hero.sub",
      order: first.order + 1,
    };
    const original = window.gsap.timeline;
    let restarts = 0;
    window.gsap.timeline = function (...args) {
      const timeline = original.apply(this, args);
      const restart = timeline.restart;
      timeline.restart = function (...restartArgs) {
        restarts += 1;
        return restart.apply(this, restartArgs);
      };
      return timeline;
    };
    window.__ONEBOX_MOTION_MANIFEST__ = { version: 1, entries: [first, second] };
    window.__ONEBOX_MOTION_RUNTIME__.rehydrate();
    document.querySelector('[data-edit-id="hero.headline"]').dispatchEvent(new Event("onebox-motion-preview"));
    document.querySelector('[data-edit-id="hero.sub"]').dispatchEvent(new Event("onebox-motion-preview"));
    window.gsap.timeline = original;
    return { restarts, active: document.querySelectorAll('[data-onebox-motion-active="timeline"]').length };
  }, manualTimeline), { restarts: 1, active: 2 });
  await groupedOnce.close();

  const replay = await browser.newPage();
  await boot(replay, { version: 1, entries: [manualEntrance] });
  assert.deepEqual(await replay.evaluate((repeat) => {
    const original = window.gsap.from;
    let calls = 0;
    window.gsap.from = function (...args) { calls += 1; return original.apply(this, args); };
    const target = document.querySelector('[data-edit-id="hero.headline"]');
    target.dispatchEvent(new Event("onebox-motion-preview"));
    target.dispatchEvent(new Event("onebox-motion-preview"));
    const onceCalls = calls;
    window.__ONEBOX_MOTION_MANIFEST__ = { version: 1, entries: [{ ...repeat, replay: "repeat" }] };
    window.__ONEBOX_MOTION_RUNTIME__.rehydrate();
    target.dispatchEvent(new Event("onebox-motion-preview"));
    target.dispatchEvent(new Event("onebox-motion-preview"));
    window.gsap.from = original;
    return { once: onceCalls, repeat: calls - onceCalls };
  }, manualEntrance), { once: 1, repeat: 2 });
  await replay.close();

  const malformed = await browser.newPage();
  await boot(malformed, { version: 1, entries: [entry] });
  const invalidManifests = [
    { version: 1, entries: [entry], selector: "body" },
    { version: 1, entries: [{ ...entry, onComplete: "alert(1)" }] },
    { version: 1, entries: [{ ...entry, id: "not-a-uuid" }] },
    { version: 1, entries: [{ ...entry, id: "00000000-0000-0000-0000-000000000000" }] },
    { version: 1, entries: [{ ...entry, breakpoint: "toString" }] },
    { version: 1, entries: [{ ...entry, kind: "entrance", trigger: "hover" }] },
    { version: 1, entries: [{ ...manualTimeline, trigger: "hover" }] },
    { version: 1, entries: [{ ...entry, scrub: "true" }] },
    { version: 1, entries: [{ ...entry, durationMs: 5001 }] },
    { version: 1, entries: [{ ...manualTimeline, timelineId: "bad group!" }] },
    { version: 1, entries: [{ ...manualTimeline, order: 51 }] },
    { version: 1, entries: [entry, { ...entry, properties: { filter: 1 } }] },
    { version: 1, entries: Array.from({ length: 101 }, () => entry) },
  ];
  for (const manifest of invalidManifests) {
    assert.deepEqual(await malformed.evaluate((value) => {
      window.__ONEBOX_MOTION_MANIFEST__ = value;
      window.__ONEBOX_MOTION_RUNTIME__.rehydrate();
      return {
        active: document.querySelectorAll("[data-onebox-motion-active]").length,
        triggers: window.ScrollTrigger.getAll().filter((trigger) => String(trigger.vars.id || "").startsWith("onebox:")).length,
      };
    }, manifest), { active: 0, triggers: 0 });
  }
  await malformed.close();

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
