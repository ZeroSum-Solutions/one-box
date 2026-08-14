#!/usr/bin/env node
/**
 * Offline proof for the competitor classifier and the credential preflight.
 * Zero spend, zero network — pure functions only.
 *
 * The fixtures are the REAL discovery results from run 2KJ9KwYM4SeA
 * (2026-08-13), the Portland bakery scan whose "competitors" were three
 * listicles and one coffee shop. That run is the reason maps.ts classifies at
 * all, so it is the regression this script defends.
 *
 * Run: node scripts/smoke/scan-filter-smoke.mjs
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RESOLVABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
      if (!isRelative || !context.parentURL) throw err;
      const base = new URL(specifier, context.parentURL);
      for (const ext of RESOLVABLE_EXTENSIONS) {
        const candidate = new URL(base.pathname + ext, base);
        if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
      }
      throw err;
    }
  },
});

const { classifyResult } = await import("../../src/lib/tools/maps.ts");
const { preflight } = await import("../../src/lib/preflight.ts");

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — got "${actual}", expected "${expected}"`}`);
}

// ---------- 1. the live failure ----------
console.log("\n[1] run 2KJ9KwYM4SeA — the four results that reached the crawl");
const LIVE = [
  {
    title: "Portland's Best Bakeries: From Donuts to Pâtisseries",
    url: "https://feastio.com/bakeries-portland-oregon/",
    domain: "feastio.com",
    expect: "editorial",
  },
  {
    title: "The Best Bakeries in Portland, Oregon",
    url: "https://pdx.eater.com/maps/best-portland-bakeries",
    domain: "pdx.eater.com",
    expect: "editorial",
  },
  {
    title: "Guide to Portland's Best Bakeries & Patisseries",
    url: "https://portlandfoodanddrink.com/guide-portland-best-bakeries/",
    domain: "portlandfoodanddrink.com",
    expect: "editorial",
  },
  {
    title: "Portland Coffee Shop | coffee shop in northeast portland | 530 ...",
    url: "https://www.theportlandcoffeeshop.com/",
    domain: "theportlandcoffeeshop.com",
    expect: "unknown", // a real operator — survives to the crawl
  },
];
for (const c of LIVE) {
  const { kind, why } = classifyResult(c.title, c.url, c.domain);
  check(`${c.domain} → ${c.expect}`, kind, c.expect);
  if (kind === "editorial") console.log(`      reason: ${why}`);
}

// ---------- 2. real businesses must survive ----------
console.log("\n[2] real local operators must NOT be filtered");
const BUSINESSES = [
  ["Grand Central Bakery", "https://grandcentralbakery.com/", "grandcentralbakery.com"],
  ["Ken's Artisan Bakery", "https://kensartisan.com/bakery", "kensartisan.com"],
  // a business whose NAME contains "best" — the title regex must not eat it
  ["Best Bagels PDX", "https://bestbagelspdx.com/", "bestbagelspdx.com"],
  ["Reno Fiber Optic Installers", "https://renofiberoptic.com/services", "renofiberoptic.com"],
  ["Acme Roofing — Free Estimates", "https://acmeroofingtx.com/", "acmeroofingtx.com"],
];
for (const [title, url, domain] of BUSINESSES) {
  check(`${domain} survives`, classifyResult(title, url, domain).kind, "unknown");
}

// ---------- 3. other listicle shapes ----------
console.log("\n[3] other roundup shapes must be caught");
const ROUNDUPS = [
  ["The 12 Best Roofers in Austin", "https://example.com/roofers", "example.com"],
  ["10 Best Plumbers in Phoenix", "https://citysite.com/plumbers", "citysite.com"],
  ["Top Med Spas Near Me", "https://blog.example.org/top-med-spas", "blog.example.org"],
  ["Anything at all", "https://somesite.com/blog/2026/01/roofing-tips", "somesite.com"],
  ["A Guide to Portland Coffee", "https://someguide.com/coffee", "someguide.com"],
];
for (const [title, url, domain] of ROUNDUPS) {
  check(`"${title.slice(0, 34)}" → editorial`, classifyResult(title, url, domain).kind, "editorial");
}

// ---------- 4. preflight ----------
console.log("\n[4] preflight blocks before spend");
const saved = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
  REFERO_MCP_TOKEN: process.env.REFERO_MCP_TOKEN,
  ONE_BOX_REFERO_OAUTH_STORE: process.env.ONE_BOX_REFERO_OAUTH_STORE,
};
process.env.OPENROUTER_API_KEY = "x";
process.env.FIRECRAWL_API_KEY = "x";
delete process.env.REFERO_MCP_TOKEN;
process.env.ONE_BOX_REFERO_OAUTH_STORE = `/tmp/one-box-no-refero-oauth-${process.pid}.json`;

const refero = preflight("refero");
check("refero arm without OAuth → blocked", refero.ok, false);
check("blocking issue names OAuth", refero.blocking[0]?.key, "REFERO_OAUTH");
// The A/B control arms must still run on a machine that never had a token.
check("none arm without token → ok", preflight("none").ok, true);
check("local arm without token → ok", preflight("local").ok, true);

process.env.REFERO_MCP_TOKEN = "x";
check("refero arm with token → ok", preflight("refero").ok, true);
delete process.env.OPENROUTER_API_KEY;
check("no model key → blocked", preflight("none").ok, false);

for (const [k, v] of Object.entries(saved)) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

// ---------- 5. run.json concurrency ----------
// The scan runs its four structure calls in parallel, so four addCost calls
// can be in flight at once. Unserialized, they each read the same costUsd and
// the last write erases the rest — an undercount in the exact number the spend
// cap is enforced against. Observed live in run HOmEC9VCJ9Ri.
console.log("\n[5] concurrent run.json writes must not lose updates");
const { createRun, addCost, loadRun, failStage, finishStage } = await import(
  "../../src/lib/runstate.ts"
);
const { rm } = await import("node:fs/promises");
const { join } = await import("node:path");

const tmpRun = await createRun({ costCapUsd: 999 });
try {
  const N = 25;
  const STEP = 0.01;
  await Promise.all(Array.from({ length: N }, () => addCost(tmpRun, STEP)));
  const after = await loadRun(tmpRun);
  const expected = Math.round(N * STEP * 1e6) / 1e6;
  check(`${N} concurrent addCost → $${expected}`, after.costUsd, expected);

  // A stage transition racing a cost write must survive it.
  await Promise.all([
    failStage(tmpRun, "synthesized", "boom"),
    ...Array.from({ length: 10 }, () => addCost(tmpRun, STEP)),
  ]);
  const raced = await loadRun(tmpRun);
  check("failed status survives concurrent cost writes", raced.stages.synthesized.status, "failed");
  check(
    "cost still exact after the race",
    raced.costUsd,
    Math.round((N + 10) * STEP * 1e6) / 1e6
  );

  await finishStage(tmpRun, "scanned");
  check("finishStage still works", (await loadRun(tmpRun)).stages.scanned.status, "done");
} finally {
  await rm(join(process.cwd(), "sites", tmpRun), { recursive: true, force: true });
}

console.log(
  failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
