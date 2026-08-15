#!/usr/bin/env node
// Outside-model grade — a cross-vendor audit of a built site against the
// presentation rubric (docs/eval/presentation-rubric.md).
//
// Standing rule (2026-08-15): every build gets an outside-model audit before
// it reaches Devin, and Devin is the judge of record. This report is advisory
// input to his verdict, never a substitute for it. The grader lane is the
// Codex CLI (subscription OAuth) — never a metered API.
//
// Usage:
//   node scripts/audit/outside-grade.mjs \
//     --url http://127.0.0.1:8090/ \
//     --src spikes/refero-baseline/site \
//     --brief spikes/refero-baseline/BRIEF.md \
//     --out spikes/refero-baseline/audit \
//     [--label wits-baseline] [--rubric docs/eval/presentation-rubric.md]
//
// Output: <out>/outside-grade.md (+ screenshots and the raw codex log).

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && process.argv[at + 1]) return process.argv[at + 1];
  if (fallback !== undefined) return fallback;
  console.error(`outside-grade: missing required --${name}`);
  process.exit(1);
}

const url = arg("url");
const srcDir = path.resolve(arg("src"));
const briefPath = path.resolve(arg("brief"));
const outDir = path.resolve(arg("out"));
const label = arg("label", path.basename(path.dirname(srcDir)));
const rubricPath = path.resolve(arg("rubric", "docs/eval/presentation-rubric.md"));

await mkdir(outDir, { recursive: true });

// -- Screenshots ------------------------------------------------------------
// reducedMotion keeps transitions from smearing the frames, and the scroll
// pass below triggers any once-only scroll reveals BEFORE the full-page
// capture — otherwise below-fold sections photograph in their pre-reveal
// (opacity 0) state and the grader sees a blank page that never renders.
async function capture(browser, viewport, file) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await page.evaluate(async () => {
    for (const d of document.querySelectorAll("details")) d.open = true;
    const step = window.innerHeight / 2;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
  });
  await page.screenshot({ path: file, fullPage: true });
  await context.close();
}

const desktopShot = path.join(outDir, "grade-desktop.png");
const mobileShot = path.join(outDir, "grade-mobile.png");
const browser = await chromium.launch();
try {
  await capture(browser, { width: 1440, height: 900 }, desktopShot);
  await capture(browser, { width: 390, height: 844 }, mobileShot);
} finally {
  await browser.close();
}
console.log(`outside-grade: captured ${desktopShot} and ${mobileShot}`);

// -- Prompt -----------------------------------------------------------------
const rubric = await readFile(rubricPath, "utf8");
const brief = await readFile(briefPath, "utf8");

const prompt = `You are an outside auditor grading a generated marketing website. You did not build it; the builder's own checks all pass, and your job is to find where the site is nonetheless mediocre. Be adversarial: the recurring failure mode you exist to catch is a builder over-grading its own work. Do not grade on a curve and do not award credit for intent — grade only behavior that actually ships and renders.

Your working directory contains the site's full source (HTML/CSS/JS). Read it — motion design especially must be audited from the code, because the attached screenshots cannot show animation. The two attached images are full-page captures at 1440px (desktop) and 390px (mobile).

THE CLIENT BRIEF the site was generated from:

<brief>
${brief}
</brief>

THE RUBRIC (the human judge of record wrote the criticisms it encodes; his grades anchor the scale — a site matching the baseline failures it describes is a D):

<rubric>
${rubric}
</rubric>

Respond with EXACTLY this structure and nothing else:

# Outside grade

## Per-dimension grades

| # | Dimension | Grade | Evidence (one sentence, cite a selector, file, or screenshot region) |
|---|-----------|-------|----------------------------------------------------------------------|
(one row per rubric dimension, 1-9)

## Overall grade

A single letter (A-F, +/- allowed) on its own line, then one short paragraph of justification.

## Ranked fixes

The 5-10 highest-leverage changes, most impactful first. Each: one line naming the change, one line saying which dimension(s) it lifts and roughly how far. Concrete, not aspirational — "add a scroll-reveal system with staggered entrances per section (Motion: F to C+)" not "improve animations".

## Trust check

Anything in the site that is dishonest, invented, or inconsistent with the brief (claims, policies, numbers, imagery implying things the brief does not support). Say "none found" if clean.`;

const promptFile = path.join(outDir, "outside-grade-prompt.txt");
await writeFile(promptFile, prompt);

// -- Invoke the grader ------------------------------------------------------
const rawFile = path.join(outDir, "outside-grade-raw.md");
const logFile = path.join(outDir, "outside-grade-log.txt");
console.log("outside-grade: invoking codex (this takes a few minutes)…");
let log = "";
try {
  const { stdout, stderr } = await execFileAsync(
    "codex",
    [
      "exec",
      "--sandbox", "read-only",
      "--skip-git-repo-check",
      "-C", srcDir,
      "-i", desktopShot,
      "-i", mobileShot,
      "-o", rawFile,
      "--color", "never",
      prompt,
    ],
    { timeout: 20 * 60_000, maxBuffer: 64 * 1024 * 1024 }
  );
  log = `${stdout}\n${stderr}`;
} catch (error) {
  log = `${error.stdout ?? ""}\n${error.stderr ?? ""}\n${error.message}`;
  await writeFile(logFile, log);
  console.error(`outside-grade: codex failed — transcript at ${logFile}`);
  process.exit(1);
} finally {
  if (log) await writeFile(logFile, log);
}

// -- Assemble the report ----------------------------------------------------
const raw = await readFile(rawFile, "utf8");
const modelLine = log.match(/^model:\s*(.+)$/m)?.[1]?.trim() ?? "codex config default";
const header = `<!-- outside-grade | label: ${label} | model: ${modelLine} | date: ${new Date().toISOString().slice(0, 10)} | url: ${url} -->\n\n`;
const reportFile = path.join(outDir, "outside-grade.md");
await writeFile(reportFile, header + raw);

const overall = raw.match(/## Overall grade\s*\n+\s*([A-F][+-]?)\b/)?.[1];
console.log(`outside-grade: report written to ${reportFile}`);
console.log(`outside-grade: overall ${overall ?? "(no letter parsed — read the report)"}`);
