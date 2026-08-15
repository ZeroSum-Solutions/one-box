/**
 * Pre-registered verification for the layout-IR spike.
 *
 * The criterion that matters is Sol's, not Grok's: same-brief reference pairs
 * must differ in RENDERED BOUNDING-BOX TOPOLOGY at 1440 and 390 — "not merely
 * different CSS hashes". A different hash proves byte variation, not design
 * variation.
 *
 * Also checks, per the frozen criteria:
 *   - data-edit-id uniqueness and preservation
 *   - no horizontal overflow at either viewport (mobile-layout gate)
 *   - no console errors (console-errors gate)
 *   - essential content present (no-js proxy: content is in static HTML)
 */
import { readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
const SHOTS = path.join(HERE, "shots");

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

/** Quantized topology signature: which grid band each slot occupies. */
function signatureFrom(boxes, viewportWidth) {
  return boxes
    .map((box) => {
      const startBand = Math.round((box.x / viewportWidth) * 12);
      const endBand = Math.round(((box.x + box.width) / viewportWidth) * 12);
      return `${box.editId}@${startBand}-${endBand}`;
    })
    .sort()
    .join("|");
}

async function measure(page, url, viewport) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(url, { waitUntil: "load" });

  const data = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("[data-edit-id]")];
    const boxes = nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        editId: node.getAttribute("data-edit-id"),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
    const ids = boxes.map((b) => b.editId);
    return {
      boxes,
      duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      sections: [...document.querySelectorAll("[data-section]")].map((s) => ({
        id: s.getAttribute("data-section"),
        role: s.getAttribute("data-role"),
        top: Math.round(s.getBoundingClientRect().top + window.scrollY),
      })),
      h1Count: document.querySelectorAll("h1").length,
      ctaCount: document.querySelectorAll("a.cta").length,
    };
  });

  return { ...data, errors, signature: signatureFrom(data.boxes, viewport.width) };
}

const browser = await chromium.launch();
const results = {};
await mkdir(SHOTS, { recursive: true });

const dirs = (await readdir(OUT, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const id of dirs) {
  results[id] = {};
  const url = `file://${path.join(OUT, id, "index.html")}`;
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    const result = await measure(page, url, viewport);
    await page.screenshot({
      path: path.join(SHOTS, `${id}-${viewport.name}.png`),
      fullPage: true,
    });
    await page.close();
    results[id][viewport.name] = result;
  }
}
await browser.close();

// ------------------------------------------------------------------- report
const PAIRS = [
  ["gutter-trade-split", "gutter-editorial"],
  ["medspa-gallery", "medspa-typographic"],
];

let failures = 0;
const line = (ok, text) => {
  if (!ok) failures += 1;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${text}`);
};

console.log("\n=== per-output checks ===");
for (const id of dirs) {
  console.log(`\n${id}`);
  for (const viewport of VIEWPORTS) {
    const r = results[id][viewport.name];
    line(!r.overflow, `${viewport.name}: no horizontal overflow (scrollWidth ${r.scrollWidth})`);
    line(r.errors.length === 0, `${viewport.name}: no console errors${r.errors.length ? ` — ${r.errors[0]}` : ""}`);
    line(r.duplicateIds.length === 0, `${viewport.name}: data-edit-id unique (${r.boxes.length} ids)`);
  }
  const desktop = results[id].desktop;
  line(desktop.h1Count === 1, `exactly one h1 (found ${desktop.h1Count})`);
  line(desktop.ctaCount >= 1, `primary action present in static HTML (${desktop.ctaCount} CTA)`);
}

console.log("\n=== same-brief structural divergence ===");
for (const [a, b] of PAIRS) {
  const rolesA = results[a].desktop.sections.map((s) => s.role).join(">");
  const rolesB = results[b].desktop.sections.map((s) => s.role).join(">");
  line(rolesA !== rolesB, `${a} vs ${b}: role graph differs\n        ${rolesA}\n        ${rolesB}`);

  for (const viewport of VIEWPORTS) {
    const sigA = results[a][viewport.name].signature;
    const sigB = results[b][viewport.name].signature;
    line(sigA !== sigB, `${a} vs ${b}: bounding-box topology differs @${viewport.width}`);
  }

  // Same-brief pairs must also differ in where the media actually sits.
  const mediaA = results[a].desktop.boxes.find((box) => box.editId.endsWith(".media"));
  const mediaB = results[b].desktop.boxes.find((box) => box.editId.endsWith(".media"));
  const describe = (m) => (m ? `${m.editId} x=${m.x} w=${m.width}` : "no media slot");
  line(
    JSON.stringify(mediaA) !== JSON.stringify(mediaB),
    `${a} vs ${b}: media geometry differs\n        ${describe(mediaA)}\n        ${describe(mediaB)}`
  );
}

await writeFile(
  path.join(HERE, "verify-report.json"),
  JSON.stringify(results, null, 2),
  "utf8"
);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
console.log(`screenshots: ${SHOTS}`);
process.exit(failures === 0 ? 0 : 1);
