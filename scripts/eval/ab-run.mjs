#!/usr/bin/env node
/**
 * Phase 4 three-arm A/B (docs/eval/rubric.md — frozen BEFORE any run).
 *
 * Per prompt: arm R (Refero lock) runs first and owns the scan; arms L
 * (local catalog-index lock) and N (no-reference control) receive R's scan
 * artifacts verbatim, so all three arms share identical frozen fixtures
 * (same competitors, same crawls, same intake facts, same hero policy).
 *
 * Outputs: sites/ab-* runs, docs/eval/ab/ shots + blind manifest +
 * scoresheets. Advisory model critique happens OUTSIDE this script (agy,
 * blind labels) — Devin is the judge of record.
 *
 * Real spend: ~9 pipeline runs (~$0.30 each) + up to 9 Higgsfield images.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const BASE = "http://127.0.0.1:3123";
const OUT = path.join(ROOT, "docs", "eval", "ab");

const MODEL_SLUGS = {
  orchestrator: "google/gemini-3.1-pro-preview",
  builder: "moonshotai/kimi-k3",
  bulk: "deepseek/deepseek-v4-flash",
};

const PROMPTS = [
  {
    slug: "fiber",
    intake: {
      businessName: "TrueLine Fiber",
      category: "Fiber Optic Installation",
      location: "Chattanooga, TN",
      services: ["residential fiber installation", "business network cabling", "fiber repair"],
      phone: "(423) 555-0148",
      serviceArea: "Greater Chattanooga within 40 miles",
      yearsInBusiness: "12",
      certifications: ["BICSI certified"],
      claims: ["Wired over 3,000 homes"],
      primaryAction: "quote",
      vibeWords: ["dependable", "modern", "straight-talking"],
    },
  },
  {
    slug: "medspa",
    intake: {
      businessName: "Solace & Sage Med Spa",
      category: "Med Spa",
      location: "Franklin, TN",
      services: ["injectables and fillers", "laser skin treatments", "hydrafacials"],
      phone: "(615) 555-0173",
      serviceArea: "Franklin and Williamson County",
      yearsInBusiness: "6",
      certifications: ["Nurse-practitioner led"],
      claims: ["Over 5,000 treatments performed"],
      primaryAction: "book",
      vibeWords: ["calm", "upscale", "trustworthy"],
    },
  },
  {
    slug: "roofing",
    intake: {
      businessName: "Ridgeline Roofing Co",
      category: "Roofing Contractor",
      location: "Chattanooga, TN",
      services: ["roof replacement", "storm damage repair", "gutter installation"],
      phone: "(423) 555-0192",
      serviceArea: "Chattanooga and North Georgia",
      yearsInBusiness: "15",
      certifications: ["GAF certified"],
      claims: ["Over 2,000 roofs replaced"],
      primaryAction: "quote",
      vibeWords: ["solid", "honest", "local"],
    },
  },
];
const ARMS = ["r", "l", "n"];
const ARM_MODE = { r: "refero", l: "local", n: "none" };

// ---------- run scaffolding ----------

const STAGES = ["intake", "scanned", "locked", "synthesized", "built", "edited"];

function freshRunState(id, referenceMode) {
  const stages = Object.fromEntries(STAGES.map((s) => [s, { status: "pending", retries: 0 }]));
  stages.intake = { status: "done", finishedAt: new Date().toISOString(), retries: 0 };
  return {
    id,
    createdAt: new Date().toISOString(),
    stages,
    costUsd: 0,
    costCapUsd: 3,
    modelSlugs: MODEL_SLUGS,
    referenceMode,
  };
}

async function createRun(id, intake, referenceMode) {
  const dir = path.join(ROOT, "sites", id);
  // Idempotent: a crash-interrupted harness relaunch must resume existing
  // runs from their checkpoints, never wipe paid work.
  const exists = await fs
    .access(path.join(dir, "run.json"))
    .then(() => true)
    .catch(() => false);
  if (exists) return dir;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "run.json"), JSON.stringify(freshRunState(id, referenceMode), null, 2));
  await fs.writeFile(path.join(dir, "intake.json"), JSON.stringify(intake, null, 2));
  return dir;
}

/** Copy R's scan fixtures into another arm and mark its scan stage done. */
async function inheritScan(fromId, toId) {
  const from = path.join(ROOT, "sites", fromId);
  const to = path.join(ROOT, "sites", toId);
  await fs.copyFile(path.join(from, "scan.json"), path.join(to, "scan.json"));
  await fs.cp(path.join(from, "research"), path.join(to, "research"), { recursive: true, force: true }).catch(() => {});
  const runPath = path.join(to, "run.json");
  const run = JSON.parse(await fs.readFile(runPath, "utf8"));
  run.stages.scanned = { status: "done", finishedAt: new Date().toISOString(), retries: 0 };
  await fs.writeFile(runPath, JSON.stringify(run, null, 2));
}

// ---------- pipeline driving ----------

async function streamRun(runId) {
  let complete = false;
  let lastError = null;
  try {
    const res = await fetch(`${BASE}/api/run?runId=${runId}`);
    if (!res.ok) throw new Error(`run ${runId}: HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const deadline = Date.now() + 20 * 60_000;
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!frame.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(frame.slice(6));
          if (ev.type === "stage") console.log(`   [${runId}] ${ev.stage} ${ev.status}`);
          if (ev.type === "error") lastError = ev.message;
          if (ev.type === "complete") complete = true;
        } catch {}
      }
    }
  } catch (err) {
    // A dropped stream is an incomplete attempt, never a harness crash —
    // checkpoints make the retry cheap.
    lastError = err instanceof Error ? err.message : String(err);
  }
  return { complete, lastError };
}

/** Resumable: retry a run stream up to `tries` times until complete. */
async function runToCompletion(runId, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const { complete, lastError } = await streamRun(runId);
    if (complete) return true;
    console.log(`   [${runId}] attempt ${i + 1} incomplete${lastError ? `: ${lastError.slice(0, 100)}` : ""} — resuming`);
  }
  return false;
}

// ---------- main ----------

const server = spawn("npm", ["run", "dev", "--", "--port", "3123"], {
  cwd: ROOT,
  env: process.env,
  stdio: ["ignore", "ignore", "ignore"],
});
{
  const deadline = Date.now() + 90_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try {
      up = (await fetch(BASE)).ok;
    } catch {}
    if (!up) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!up) {
    server.kill("SIGTERM");
    throw new Error("dev server did not come up");
  }
}

await fs.mkdir(OUT, { recursive: true });
const results = [];

try {
  for (const prompt of PROMPTS) {
    console.log(`\n=== prompt: ${prompt.slug} ===`);
    const ids = Object.fromEntries(ARMS.map((a) => [a, `ab-${prompt.slug}-${a}`]));
    for (const arm of ARMS) await createRun(ids[arm], prompt.intake, ARM_MODE[arm]);

    // R first — it owns the scan fixtures
    const rOk = await runToCompletion(ids.r);
    if (!rOk) {
      console.log(`   [${prompt.slug}] arm R failed after retries — skipping prompt (reported, not hidden)`);
      results.push({ prompt: prompt.slug, ok: false, reason: "arm R incomplete" });
      continue;
    }
    await inheritScan(ids.r, ids.l);
    await inheritScan(ids.r, ids.n);

    const [lOk, nOk] = await Promise.all([runToCompletion(ids.l), runToCompletion(ids.n)]);
    results.push({ prompt: prompt.slug, ok: rOk && lOk && nOk, arms: { r: rOk, l: lOk, n: nOk } });
  }
} finally {
  server.kill("SIGTERM");
}

// ---------- blind manifest ----------
// Random arm→label assignment per prompt; the mapping file is the unblinding
// key and is NOT shown to the advisory model.
// Label assignment is generated ONCE and reused on every later run — a
// reshuffle would silently invalidate scores already recorded against the
// old labels.
const priorManifest = await fs
  .readFile(path.join(OUT, "manifest.json"), "utf8")
  .then((raw) => JSON.parse(raw))
  .catch(() => null);
const manifest = {
  generatedAt: priorManifest?.generatedAt ?? new Date().toISOString(),
  prompts: {},
};
for (const prompt of PROMPTS) {
  const existing = priorManifest?.prompts?.[prompt.slug];
  if (existing && Object.keys(existing).length === ARMS.length) {
    manifest.prompts[prompt.slug] = existing;
    continue;
  }
  const labels = ["A", "B", "C"];
  // Fisher–Yates on a copy, crypto-seeded
  for (let i = labels.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  manifest.prompts[prompt.slug] = Object.fromEntries(
    ARMS.map((arm, i) => [labels[i], `ab-${prompt.slug}-${arm}`])
  );
}
await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify({ results, ...manifest }, null, 2));
console.log("\nresults:", JSON.stringify(results));
console.log("blind manifest written to docs/eval/ab/manifest.json");
process.exit(results.every((r) => r.ok) ? 0 : 1);
