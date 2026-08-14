#!/usr/bin/env node
/**
 * scripts/smoke/gates-smoke.mjs
 *
 * Builds a hardcoded fiber-optic-installer fixture (Intake/DesignTokens/
 * SkeletonSpec/CopyDoc, all inline below) through templates/local-service/
 * via src/lib/builder.ts, serves the output over a throwaway local HTTP
 * server, and runs every gate in src/lib/gates.ts against it. Proves
 * template + builder + gates work together end-to-end.
 *
 * Run from the repo root: node scripts/smoke/gates-smoke.mjs
 */
import { registerHooks } from "node:module";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";

// --- extension-resolution shim ---------------------------------------------
// builder.ts and gates.ts import sibling src/lib/*.ts files WITHOUT a file
// extension, matching this project's tsconfig (moduleResolution: "bundler",
// which forbids ".ts" extensions — see WAVE-NOTES-buildgate.md, "Node vs
// tsc extension conflict"). Node's native ESM resolver never guesses
// extensions on its own, so this hook retries a failed relative,
// extensionless specifier with ".ts" appended. Scoped narrowly: it only
// fires after normal resolution has already failed, and only for relative
// specifiers that carry no extension of their own.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const { buildSite } = await import("../../src/lib/builder.ts");
const { runGates } = await import("../../src/lib/gates.ts");

const ROOT = process.cwd();
const RUN_ID = "smoke-fixture";

// ---------- fixtures (hardcoded — see WAVE-NOTES-buildgate.md for the field
// conventions these follow: CSS var names tokens.css.tpl/site.css expect,
// and the CopyDoc numbered-item key convention) ----------

const intake = {
  businessName: "FiberLink Pro",
  category: "fiber optic installer",
  location: "Austin, TX",
  services: [
    "Residential fiber installation",
    "Business fiber installation",
    "Network troubleshooting",
    "Fiber splicing",
  ],
  phone: "(512) 555-0142",
  serviceArea: "Austin, Round Rock, Cedar Park, Georgetown",
  yearsInBusiness: "12",
  certifications: ["BICSI certified", "Licensed low-voltage contractor"],
  claims: ["Same-week installation", "12 years serving Central Texas"],
  primaryAction: "call",
  projectTarget: "website",
  vibeWords: ["reliable", "fast", "no-nonsense"],
};

const tokens = {
  colors: [
    { name: "Charcoal", value: "#14181c", cssVar: "--color-bg", role: "page background" },
    { name: "Panel", value: "#1c2126", cssVar: "--color-surface", role: "card/section background" },
    { name: "Panel Alt", value: "#20262c", cssVar: "--color-surface-alt", role: "footer / hero-placeholder background" },
    { name: "Ink", value: "#f4f6f8", cssVar: "--color-text", role: "primary text" },
    { name: "Ink Muted", value: "#9aa4ad", cssVar: "--color-text-muted", role: "secondary text" },
    { name: "Fiber Blue", value: "#3aa0ff", cssVar: "--color-primary", role: "buttons, links, accents", forbidden: "never as a body-text color" },
    { name: "Blue Contrast", value: "#04121f", cssVar: "--color-primary-contrast", role: "text on primary-filled buttons" },
    { name: "Hairline", value: "#2b3238", cssVar: "--color-border", role: "borders / dividers" },
    { name: "Signal Green", value: "#39d98a", cssVar: "--color-accent", role: "decorative accent only", forbidden: "never on CTAs" },
  ],
  fonts: [
    { family: "Space Grotesk", cssVar: "--font-display", weights: [500, 600], role: "headings", substitutes: ["Inter Tight"] },
    { family: "Inter", cssVar: "--font-body", weights: [400, 500], role: "body copy", substitutes: ["system-ui"] },
  ],
  typeScale: [
    { role: "caption", sizePx: 13, lineHeight: 1.4, cssVar: "--text-caption" },
    { role: "body-sm", sizePx: 15, lineHeight: 1.5, cssVar: "--text-body-sm" },
    { role: "body", sizePx: 17, lineHeight: 1.6, cssVar: "--text-body" },
    { role: "body-lg", sizePx: 20, lineHeight: 1.5, cssVar: "--text-body-lg" },
    { role: "subheading", sizePx: 24, lineHeight: 1.3, cssVar: "--text-subheading" },
    { role: "heading-sm", sizePx: 30, lineHeight: 1.2, cssVar: "--text-heading-sm" },
    { role: "heading", sizePx: 42, lineHeight: 1.15, cssVar: "--text-heading" },
    { role: "heading-lg", sizePx: 60, lineHeight: 1.05, cssVar: "--text-heading-lg" },
    { role: "display", sizePx: 88, lineHeight: 1.0, trackingEm: -0.02, cssVar: "--text-display" },
  ],
  radii: { sm: "6px", md: "12px", lg: "20px", pill: "999px" },
  spacing: { xs: "8px", sm: "12px", md: "20px", lg: "32px", xl: "56px", "2xl": "88px", "3xl": "128px" },
  borders: { subtle: "1px solid #2b3238", strong: "2px solid #3aa0ff" },
  shadows: { raised: "0 8px 30px rgb(0 0 0 / 0.2)", overlay: "0 18px 50px rgb(0 0 0 / 0.3)" },
  layers: { base: "0", sticky: "20", overlay: "40" },
  layout: { maxWidthPx: 1180, sectionGapPx: 96, cardPaddingPx: 28 },
  motion: {
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    durationMs: { micro: 160, reveal: 600 },
    revealClasses: ["hero", "card", "stat", "point"],
  },
  componentStates: [
    { component: "button", states: { default: "solid fill", hover: "darken 8%", focus: "2px outline", disabled: "40% opacity" } },
  ],
  imageryBrief: {
    subject: "a technician splicing fiber optic cable in a utility closet",
    lighting: "soft directional work-light",
    grade: "cool neutral, slightly desaturated",
    framing: "medium shot, shallow depth of field",
    avoid: ["stock-photo smiles", "text overlays", "logos"],
  },
};

const skeleton = {
  sections: [
    { id: "nav", name: "Navigation", purpose: "wayfinding + quick call", contentNeeds: ["logo", "phone"] },
    { id: "hero", name: "Hero", purpose: "primary conversion", contentNeeds: ["headline", "sub", "cta"] },
    { id: "trust-bar", name: "Trust bar", purpose: "quick credibility", contentNeeds: ["stats"] },
    { id: "services", name: "Services", purpose: "service inventory", contentNeeds: ["service cards"] },
    { id: "why-us", name: "Why us", purpose: "differentiation", contentNeeds: ["differentiators"] },
    { id: "reviews", name: "Reviews", purpose: "social proof", contentNeeds: ["testimonials"] },
    { id: "service-area", name: "Service area", purpose: "geo relevance", contentNeeds: ["area list"] },
    { id: "contact", name: "Contact", purpose: "secondary conversion", contentNeeds: ["cta", "phone"] },
    { id: "footer", name: "Footer", purpose: "chrome", contentNeeds: ["business name"] },
  ],
};

const copy = {
  sections: {
    nav: { logo: "FiberLink Pro", phone: "(512) 555-0142" },
    hero: {
      headline: "Fiber internet installed right, the first time.",
      sub: "Licensed low-voltage crews serving Austin and Central Texas since 2014. Residential and business fiber installation, splicing, and troubleshooting.",
      cta: "Call for same-week service",
      "image-alt": "FiberLink Pro technician splicing fiber optic cable",
    },
    "trust-bar": {
      "stat-1-value": "12",
      "stat-1-label": "Years in Central Texas",
      "stat-2-value": "1400",
      "stat-2-label": "Installs completed",
      "stat-3-value": "7",
      "stat-3-label": "Day average turnaround",
    },
    services: {
      intro: "What we install",
      "card-1-title": "Residential fiber",
      "card-1-body": "Whole-home fiber runs, ONT placement, and Wi-Fi handoff, done clean and fast.",
      "card-2-title": "Business fiber",
      "card-2-body": "Office and warehouse fiber backbone, patch panels, and rack termination.",
      "card-3-title": "Troubleshooting",
      "card-3-body": "Signal loss, splice failures, and drop repairs diagnosed on-site.",
      "card-4-title": "Splicing",
      "card-4-body": "Fusion splicing for new runs and repairs, tested and documented.",
    },
    "why-us": {
      intro: "Why Central Texas calls us first",
      "point-1-title": "BICSI certified crews",
      "point-1-body": "Every installer carries current BICSI certification.",
      "point-2-title": "Same-week scheduling",
      "point-2-body": "Most jobs booked within seven days of the call.",
      "point-3-title": "Licensed low-voltage contractor",
      "point-3-body": "Fully licensed and insured for residential and commercial work.",
    },
    reviews: {
      "card-1-quote": "They ran fiber to our detached garage office in an afternoon. Clean work, no drywall mess.",
      "card-1-author": "Austin homeowner",
      "card-2-quote": "Our old installer left splice loss all over the building. FiberLink re-terminated everything in a day.",
      "card-2-author": "Round Rock property manager",
      "card-3-quote": "Booked on a Tuesday, installed by Friday. Exactly what they said on the phone.",
      "card-3-author": "Cedar Park homeowner",
    },
    "service-area": {
      intro: "Where we work",
      "area-1": "Austin",
      "area-2": "Round Rock",
      "area-3": "Cedar Park",
      "area-4": "Georgetown",
    },
    contact: {
      headline: "Ready to get wired up right?",
      sub: "Call now for same-week scheduling across Central Texas.",
      cta: "Call FiberLink Pro",
    },
    footer: { tagline: "Licensed fiber optic installation for Central Texas." },
  },
  stopSlopScore: 41,
};

// 1x1 red PNG — exercises the real heroImagePath copy path in builder.ts
// (not just the no-image CSS-placeholder fallback).
const HERO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// ---------- run ----------

async function main() {
  const runRoot = path.join(ROOT, "sites", RUN_ID);
  await mkdir(runRoot, { recursive: true });

  const heroImagePath = path.join(runRoot, "_fixture-hero.png");
  await writeFile(heroImagePath, Buffer.from(HERO_PNG_BASE64, "base64"));

  console.log(`[gates-smoke] building ${RUN_ID}...`);
  const manifest = await buildSite({
    runId: RUN_ID,
    intake,
    tokens,
    skeleton,
    copy,
    assets: { heroImagePath },
    tailwindThemeCss: ":root { --ds-smoke: 1; }\n@theme inline { --spacing-smoke: var(--ds-smoke); }\n",
  });
  console.log(
    `[gates-smoke] built ${manifest.files.length} file(s), complete=${manifest.complete}: ${manifest.files.join(", ")}`
  );

  // intake.json alongside the build — exercises gates.ts's tel: cross-check
  // against a real intake artifact, matching ARTIFACTS.intake's run-root path.
  await writeFile(path.join(runRoot, "intake.json"), JSON.stringify(intake, null, 2));

  const siteDir = path.join(runRoot, "site");
  const builtHtml = await readFile(path.join(siteDir, "index.html"), "utf8");
  if (!builtHtml.includes('data-project-target="website"')) {
    throw new Error("built output did not preserve the project target");
  }
  if (!builtHtml.includes('href="tailwind-theme.css"')) {
    throw new Error("built output did not link the approved Tailwind mapping");
  }
  const { server, baseUrl } = await serveStatic(siteDir);

  try {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}index.html`, { waitUntil: "load" });
      const computedPrimary = await page.locator("html").evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--color-primary").trim()
      );
      if (computedPrimary.toLowerCase() !== "#3aa0ff") {
        throw new Error(`approved runtime token did not reach computed style: ${computedPrimary}`);
      }
    } finally {
      await browser.close();
    }
    console.log(`[gates-smoke] running gates against ${baseUrl}...`);
    const reports = await runGates(RUN_ID, { baseUrl: `${baseUrl}index.html` });
    printReports(reports);

    const failingBlocking = reports.filter((r) => r.blocking && !r.pass);
    if (failingBlocking.length) {
      console.error(`\n[gates-smoke] FAIL — ${failingBlocking.length} blocking gate(s) failed.`);
      process.exitCode = 1;
    } else {
      console.log(`\n[gates-smoke] PASS — all blocking gates green.`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// ---------- tiny static file server ----------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function serveStatic(siteDir) {
  const root = path.resolve(siteDir);
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
        if (rel === "") rel = "index.html";
        const resolved = path.resolve(root, rel);
        if (resolved !== root && !resolved.startsWith(root + path.sep)) {
          res.writeHead(403);
          res.end("forbidden");
          return;
        }
        const data = await readFile(resolved);
        const ext = path.extname(resolved).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}/` });
    });
  });
}

function printReports(reports) {
  console.log("\n[gates-smoke] gate reports:");
  for (const r of reports) {
    const badge = r.pass ? "PASS" : "FAIL";
    const kind = r.blocking ? "blocking" : "advisory";
    console.log(`  [${badge}] ${r.gate} (${kind})`);
    for (const d of r.details.slice(0, 6)) console.log(`      - ${d}`);
    if (r.details.length > 6) console.log(`      ... +${r.details.length - 6} more`);
  }
}

main().catch((err) => {
  console.error("[gates-smoke] crashed:", err);
  process.exitCode = 1;
});
