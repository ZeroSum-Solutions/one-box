#!/usr/bin/env node
/**
 * Live end-to-end proof: real dev server, real chat intake, real pipeline
 * (Firecrawl + crawl4ai + Refero + OpenRouter + Higgsfield), real preview,
 * real edit. Spends real (small) money — run deliberately, not in CI loops.
 *
 * Usage: node scripts/e2e/full-run.mjs [--reuse <runId>]
 *   --reuse skips intake+pipeline and re-tests preview/editor on an existing run.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const BASE = "http://127.0.0.1:3123";
const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---------- dev server ----------
let server;
async function startServer() {
  server = spawn("npm", ["run", "dev", "--", "--port", "3123"], {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(log.slice(-2000));
  throw new Error("dev server did not come up");
}

// ---------- chat intake (drives the real model conversation) ----------
const uiMsg = (role, text) => ({
  id: Math.random().toString(36).slice(2, 10),
  role,
  parts: [{ type: "text", text }],
});

async function chatTurn(messages) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  const text = await res.text();
  // Parse UI-message SSE frames; collect assistant text + start_pipeline output.
  let assistantText = "";
  let runId = null;
  const toolNames = new Map();
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
    let chunk;
    try {
      chunk = JSON.parse(line.slice(6));
    } catch {
      continue;
    }
    if (chunk.type === "text-delta") assistantText += chunk.delta ?? "";
    if (chunk.type === "tool-input-start") toolNames.set(chunk.toolCallId, chunk.toolName);
    if (chunk.type === "tool-output-available") {
      if (toolNames.get(chunk.toolCallId) === "start_pipeline") {
        runId = chunk.output?.runId ?? null;
      }
    }
  }
  return { assistantText, runId };
}

const INTAKE_BLAST = `Hi! Business: TrueLine Fiber. We're a fiber optic installation company in Chattanooga, TN. Services: residential fiber installation, business network cabling, fiber repair. Phone (423) 555-0148. Service area: greater Chattanooga within 40 miles. 12 years in business, BICSI certified, we've wired over 3,000 homes. Primary action: get a quote. No current website. Vibe: dependable, modern, straight-talking. Please build it.`;

async function runIntake() {
  const messages = [uiMsg("user", INTAKE_BLAST)];
  let turn = await chatTurn(messages);
  if (turn.runId) return turn.runId;
  // one confirmation turn allowed
  messages.push(uiMsg("assistant", turn.assistantText || "(confirm)"));
  messages.push(uiMsg("user", "Yes, that's all correct — go ahead and build it."));
  turn = await chatTurn(messages);
  return turn.runId;
}

// ---------- pipeline stream ----------
async function runPipeline(runId) {
  const res = await fetch(`${BASE}/api/run?runId=${runId}`);
  if (!res.ok) throw new Error(`run ${res.status}`);
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + 15 * 60_000;
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
        events.push(ev);
        if (ev.type === "stage") console.log(`   [${ev.stage}] ${ev.status} ${ev.note ?? ""}`);
        if (ev.type === "error") console.log(`   [pipeline error] ${ev.message}`);
      } catch {}
    }
  }
  return events;
}

// ---------- main ----------
const reuseIdx = process.argv.indexOf("--reuse");
let runId = reuseIdx > -1 ? process.argv[reuseIdx + 1] : null;

await startServer();
try {
  if (!runId) {
    runId = await runIntake();
    ok("chat intake produces runId via start_pipeline", !!runId, runId ?? "no runId after 2 turns");
    if (!runId) process.exit(await finish(1));

    const events = await runPipeline(runId);
    const complete = events.find((e) => e.type === "complete");
    const stagesDone = ["scanned", "locked", "synthesized", "built"].filter((s) =>
      events.some((e) => e.type === "stage" && e.stage === s && e.status === "done")
    );
    ok("pipeline completes all stages", !!complete, `done: ${stagesDone.join(",")}`);
  }

  const runDir = path.join(ROOT, "sites", runId);

  // artifacts
  for (const f of ["intake.json", "scan.json", "reference-lock.json", "tokens.json", "copy.json", "DESIGN.md", "gates.json", "site/manifest.json", "site/index.html"]) {
    const exists = await fs
      .access(path.join(runDir, f))
      .then(() => true)
      .catch(() => false);
    ok(`artifact ${f}`, exists);
  }

  // reference lock discipline
  try {
    const lock = JSON.parse(await fs.readFile(path.join(runDir, "reference-lock.json"), "utf8"));
    ok("reference lock: one primary + ≤2 borrowed + ledger", !!lock.primary?.referoId && (lock.borrowedDetails?.length ?? 9) <= 2 && (lock.decisionLedger?.length ?? 0) > 0);
  } catch (e) {
    ok("reference lock: one primary + ≤2 borrowed + ledger", false, String(e).slice(0, 80));
  }

  // gates
  try {
    const gates = JSON.parse(await fs.readFile(path.join(runDir, "gates.json"), "utf8"));
    const blockingFail = gates.filter((g) => g.blocking && !g.pass);
    ok("all blocking gates pass", blockingFail.length === 0, blockingFail.map((g) => g.gate).join(",") || "clean");
  } catch (e) {
    ok("all blocking gates pass", false, String(e).slice(0, 80));
  }

  // copy score
  try {
    const copy = JSON.parse(await fs.readFile(path.join(runDir, "copy.json"), "utf8"));
    ok("copy stop-slop score ≥ 35/50", (copy.stopSlopScore ?? 0) >= 35, `${copy.stopSlopScore}/50`);
  } catch {
    ok("copy stop-slop score ≥ 35/50", false);
  }

  // ---------- preview + editor via real browser ----------
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(`${BASE}/preview/${runId}`, { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator("iframe");
  await frame.locator("[data-edit-id]").first().waitFor({ timeout: 20000 });
  ok("preview iframe renders built site", true);

  // select the hero headline through the overlay
  const heroSel = frame.locator('[data-edit-id="hero.headline"]');
  await heroSel.click();
  await page.waitForTimeout(500);
  const chipVisible = await page.getByText(/hero\.headline/).first().isVisible().catch(() => false);
  ok("overlay click → selection chip in parent", chipVisible);

  // deterministic text edit through the real API — headline is unique per
  // invocation so a --reuse re-run never no-ops into a false failure
  const stamp = `v${Date.now().toString(36).slice(-4)}`;
  const targetHeadline = `Fiber that just works ${stamp}`;
  const beforeHtml = await fs.readFile(path.join(runDir, "site/index.html"), "utf8");
  const editRes = await fetch(`${BASE}/api/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId, editId: "hero.headline", instruction: `Change the headline text to exactly: ${targetHeadline}`, imageIntent: false }),
  }).then((r) => r.json());
  const afterHtml = await fs.readFile(path.join(runDir, "site/index.html"), "utf8");
  ok("edit_site applies NL edit", editRes.ok === true && afterHtml !== beforeHtml, editRes.error ?? "");
  ok("edited headline present in source", afterHtml.includes(targetHeadline));
  ok("gates re-ran after edit", Array.isArray(editRes.gates) && editRes.gates.length > 0, `clean=${editRes.gatesClean}`);

  // other data-edit-ids intact
  const idsBefore = [...beforeHtml.matchAll(/data-edit-id="([^"]+)"/g)].map((m) => m[1]);
  const idsAfter = [...afterHtml.matchAll(/data-edit-id="([^"]+)"/g)].map((m) => m[1]);
  ok("edit preserves all other data-edit-ids", idsBefore.every((id) => idsAfter.includes(id)));

  // reload iframe shows the change
  await page.reload({ waitUntil: "domcontentloaded" });
  const newHeadline = await page.frameLocator("iframe").locator('[data-edit-id="hero.headline"]').innerText({ timeout: 20000 });
  ok("preview reflects the edit", newHeadline.includes(targetHeadline), newHeadline.slice(0, 60));

  ok("no page errors in preview shell", consoleErrors.length === 0, consoleErrors.join("; ").slice(0, 100));

  // screenshots for the record
  const shotsDir = path.join(ROOT, "docs", "eval", "e2e-shots");
  await fs.mkdir(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, `preview-${runId}.png`), fullPage: false });
  await browser.close();

  await finish(results.some((r) => !r.pass) ? 1 : 0);
} catch (e) {
  console.error("E2E crashed:", e);
  await finish(1);
}

async function finish(code) {
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${pass}/${results.length} checks passed`);
  await fs.mkdir(path.join(ROOT, "docs", "eval"), { recursive: true });
  await fs.writeFile(
    path.join(ROOT, "docs", "eval", "e2e-latest.json"),
    JSON.stringify({ at: new Date().toISOString(), runId, results }, null, 2)
  );
  server?.kill("SIGTERM");
  process.exit(code);
}
