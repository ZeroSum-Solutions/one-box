#!/usr/bin/env node
/**
 * Blind-labeled screenshots for Phase 4 judging. Reads the label→runId map
 * from docs/eval/ab/manifest.json and writes docs/eval/ab/shots/<prompt>-<LABEL>-<viewport>.png.
 * Filenames carry the LABEL only — never the arm — so the judge (and the
 * advisory model) can't infer which pipeline produced which site.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs", "eval", "ab", "shots");
const manifest = JSON.parse(
  await fs.readFile(path.join(ROOT, "docs", "eval", "ab", "manifest.json"), "utf8")
);

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const [prompt, labels] of Object.entries(manifest.prompts)) {
  for (const [label, runId] of Object.entries(labels)) {
    const index = path.join(ROOT, "sites", runId, "site", "index.html");
    for (const [vp, viewport] of [
      ["desktop", { width: 1440, height: 900 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.goto(`file://${index}`, { waitUntil: "load" });
      await page.waitForTimeout(500);
      const out = path.join(OUT, `${prompt}-${label}-${vp}.png`);
      await page.screenshot({ path: out, fullPage: true });
      console.log(path.relative(ROOT, out));
      await context.close();
    }
  }
}
await browser.close();
