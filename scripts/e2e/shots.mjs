#!/usr/bin/env node
/** Full-page screenshots of a built site (desktop 1440 + mobile 390) for
 * visual QA. Serves nothing — loads the static site over file://. */
import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const runId = process.argv[2];
if (!runId) {
  console.error("usage: node scripts/e2e/shots.mjs <runId>");
  process.exit(1);
}
const indexPath = path.join(process.cwd(), "sites", runId, "site", "index.html");
const outDir = path.join(process.cwd(), "docs", "eval", "e2e-shots");
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
for (const [label, viewport] of [
  ["desktop-1440", { width: 1440, height: 900 }],
  ["mobile-390", { width: 390, height: 844 }],
]) {
  // reducedMotion matches the gate context: reveal.js shows every
  // [data-reveal] node at its settled state, so fullPage never captures a
  // mid-animation opacity:0 frame.
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  await page.goto(`file://${indexPath}`, { waitUntil: "load" });
  await page.waitForTimeout(600);
  const out = path.join(outDir, `${runId}-${label}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(out);
  await page.close();
}
await browser.close();
