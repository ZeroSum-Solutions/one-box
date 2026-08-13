#!/usr/bin/env node
/**
 * Phase 0 tool smoke tests — proves each external tool works standalone
 * before the pipeline depends on it (plan §Phase 0). Covers:
 *   (a) refero  — connect + tools/list + one searchStyles() call
 *   (b) maps    — one findCompetitors() search (Firecrawl-backed)
 *   (c) capture — Playwright screenshots of example.com to /tmp
 *   (d) higgsfield — CLI --help / model params only, NO generation (no spend)
 *
 * Total external spend budget for this script: well under $0.05
 * (Firecrawl: 2 queries * $0.01 = $0.02 tracked into a throwaway run;
 * refero: free against the 8k/mo call budget; capture: local Playwright;
 * higgsfield: read-only CLI introspection, zero credits).
 *
 * Run:
 *   source ~/.config/zs-api-keys.env
 *   export REFERO_MCP_TOKEN=$(zsvault get refero_mcp_token)
 *   node scripts/smoke/tools-smoke.mjs
 *
 * --- Why the loader hook below exists ---
 * This project's own .ts files under src/lib use plain extensionless
 * relative imports (`from "./runstate"`), matching the rest of the
 * codebase (see src/lib/pipeline.ts). Node's native TypeScript support
 * (this repo targets Node 22+) strips types but does NOT add missing
 * extensions — its ESM resolver still requires them, same as for .js.
 * Rather than force every src/lib file to spell out `.ts` extensions
 * (which `tsc` also rejects by default without an `allowImportingTsExtensions`
 * project-wide config change — out of scope for this smoke script), this
 * registers a tiny fallback resolver hook, pure Node builtins, no new
 * dependency: it only activates when the default resolver fails on a
 * relative specifier, and then just tries the real extensions in turn.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
      throw err;
    }
  },
});

const { searchStyles, listReferoTools, referoCallCount, closeReferoClient } = await import(
  "../../src/lib/tools/refero.ts"
);
const { findCompetitors } = await import("../../src/lib/tools/maps.ts");
const { capture } = await import("../../src/lib/tools/capture.ts");
const { createRun, loadRun } = await import("../../src/lib/runstate.ts");

const results = { refero: null, maps: null, capture: null, higgsfield: null };

function heading(title) {
  console.log(`\n=== ${title} ===`);
}

// ---------- (a) refero ----------

heading("(a) refero — connect + tools/list + searchStyles");
try {
  const tools = await listReferoTools();
  console.log(`connected. tools/list -> ${tools.length} tools: ${tools.join(", ")}`);

  const styles = await searchStyles("dark saas landing", 5);
  console.log(`searchStyles('dark saas landing') -> ${styles.length} results`);
  for (const s of styles) console.log(`  - [${s.id}] ${s.name}`);

  console.log(`refero call count so far: ${referoCallCount()}`);
  results.refero = { ok: true, toolCount: tools.length, styleCount: styles.length };
} catch (err) {
  console.error("refero smoke FAILED:", err instanceof Error ? err.stack : err);
  results.refero = { ok: false, error: String(err) };
}

// ---------- (b) maps ----------

heading("(b) maps — findCompetitors (Firecrawl-backed)");
let smokeRunId;
try {
  smokeRunId = await createRun({ costCapUsd: 0.05 });
  console.log(`created smoke run ${smokeRunId} (costCapUsd $0.05)`);

  const leads = await findCompetitors(smokeRunId, {
    category: "fiber optic installer",
    location: "Chattanooga TN",
  });
  console.log(`findCompetitors -> ${leads.length} results`);
  for (const l of leads) console.log(`  - ${l.name} — ${l.url} (via "${l.source}")`);

  const run = await loadRun(smokeRunId);
  console.log(`run costUsd after maps search: $${run.costUsd.toFixed(4)}`);
  results.maps = { ok: true, count: leads.length, costUsd: run.costUsd };
} catch (err) {
  console.error("maps smoke FAILED:", err instanceof Error ? err.stack : err);
  results.maps = { ok: false, error: String(err) };
}

// ---------- (c) capture ----------

heading("(c) capture — Playwright screenshots to /tmp");
try {
  const outDir = "/tmp/one-box-smoke/capture";
  const shots = await capture("https://example.com", outDir);
  console.log(`capture('https://example.com') -> ${shots.length} screenshots`);
  for (const p of shots) console.log(`  - ${p}`);
  results.capture = { ok: true, paths: shots };
} catch (err) {
  console.error("capture smoke FAILED:", err instanceof Error ? err.stack : err);
  results.capture = { ok: false, error: String(err) };
}

// ---------- (d) higgsfield (no generation — zero spend) ----------

heading("(d) higgsfield — CLI introspection only, NO generation");
try {
  const help = await execFileAsync("higgsfield", ["generate", "create", "--help"]);
  console.log("higgsfield generate create --help:\n" + help.stdout.trim());

  const model = await execFileAsync("higgsfield", ["model", "get", "gpt_image_2"]);
  console.log("\nhiggsfield model get gpt_image_2:\n" + model.stdout.trim());

  results.higgsfield = { ok: true };
} catch (err) {
  const e = err;
  const detail = e && typeof e === "object" ? e.stderr || e.stdout || e.message : String(e);
  console.error("higgsfield smoke FAILED (CLI missing/auth?):", detail);
  results.higgsfield = { ok: false, error: String(detail) };
}

// ---------- summary ----------

heading("summary");
let finalCostUsd = 0;
if (smokeRunId) {
  try {
    finalCostUsd = (await loadRun(smokeRunId)).costUsd;
  } catch {
    /* run may not exist if createRun itself failed */
  }
}
console.log(JSON.stringify(results, null, 2));
console.log(`\nsmoke run costUsd (Firecrawl spend only): $${finalCostUsd.toFixed(4)}`);
console.log("higgsfield spend: $0.0000 (no generation call made)");
console.log("refero spend: $0 (subscription budget, not costUsd-tracked)");

await closeReferoClient();

const allOk = Object.values(results).every((r) => r && r.ok);
process.exit(allOk ? 0 : 1);
