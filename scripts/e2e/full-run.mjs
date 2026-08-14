#!/usr/bin/env node
/**
 * Live end-to-end proof: real dev server, real chat intake, real pipeline
 * (Firecrawl + crawl4ai + Refero + OpenRouter + Higgsfield), real preview,
 * real edit. Spends real (small) money — run deliberately, not in CI loops.
 *
 * Usage: node scripts/e2e/full-run.mjs --allow-metered
 *        node scripts/e2e/full-run.mjs --allow-metered --resume <runId>
 *        node scripts/e2e/full-run.mjs --allow-metered --reuse <runId>
 *        node scripts/e2e/full-run.mjs --allow-metered --finalize <runId>
 *   New and resumed pipelines exit 2 at each evidence approval boundary. Review
 *   the reported workspace, approve or request revision there, then rerun with
 *   --resume. --reuse skips intake+pipeline and re-tests a completed run.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  classifyPipelineEvents,
  computeSiteBuildSha256,
  localJsonMutationHeaders,
  parseFullRunArguments,
  shouldPreserveFinalizeCheckpoint,
  validateFinalizeCheckpoint,
} from "./full-run-state.mjs";

const ROOT = process.cwd();
const BASE = "http://127.0.0.1:3123";
const JSON_MUTATION_HEADERS = localJsonMutationHeaders(BASE);
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
    headers: JSON_MUTATION_HEADERS,
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
  const res = await fetch(`${BASE}/api/run`, {
    method: "POST",
    headers: JSON_MUTATION_HEADERS,
    body: JSON.stringify({ runId }),
  });
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
const runArguments = parseFullRunArguments(process.argv.slice(2));
let runId = runArguments.runId;
let postEditProof = null;
let validatedFinalizeCheckpoint = null;

async function assertReviewedSiteUnchanged() {
  if (!postEditProof) return;
  const currentSiteSha256 = await computeSiteBuildSha256(
    path.join(ROOT, "sites", runId, "site"),
  );
  if (currentSiteSha256 !== postEditProof.siteSha256) {
    throw new Error(
      "--finalize refused because the edited site changed after review was requested.",
    );
  }
}

if (runArguments.mode === "finalize") {
  const previous = JSON.parse(
    await fs.readFile(path.join(ROOT, "docs", "eval", "e2e-latest.json"), "utf8"),
  );
  postEditProof = validateFinalizeCheckpoint(previous, runId);
  validatedFinalizeCheckpoint = previous;
  await assertReviewedSiteUnchanged();
  results.push(...previous.results);
}

await startServer();
try {
  if (runArguments.mode !== "reuse") {
    if (!runId) {
      runId = await runIntake();
      ok("chat intake produces runId via start_pipeline", !!runId, runId ?? "no runId after 2 turns");
      if (!runId) await finish(1, "FAILED");
    }

    const events = await runPipeline(runId);
    const terminal = classifyPipelineEvents(events);
    const stagesDone = ["scanned", "locked", "synthesized", "built"].filter((s) =>
      events.some((e) => e.type === "stage" && e.stage === s && e.status === "done")
    );
    if (terminal.status === "APPROVAL_REQUIRED") {
      const paused = terminal.event;
      ok(
        "pipeline stops at required approval",
        true,
        `${paused.workflowStage}: ${paused.workspaceUrl}`,
      );
      console.log(`\nApproval required at ${BASE}${paused.workspaceUrl}`);
      const nextMode =
        runArguments.mode === "finalize" ? "--finalize" : "--resume";
      console.log(
        `After review, resume with: node scripts/e2e/full-run.mjs --allow-metered ${nextMode} ${runId}`,
      );
      await finish(2, "APPROVAL_REQUIRED", paused);
    }
    if (terminal.status === "FAILED") {
      ok("pipeline completes without an error event", false, terminal.event.message);
      await finish(1, "FAILED", terminal.event);
    }
    if (terminal.status === "INCOMPLETE") {
      ok("pipeline reaches a terminal event", false, `done: ${stagesDone.join(",")}`);
      await finish(1, "INCOMPLETE");
    }
    ok("pipeline completes all stages", true, `done: ${stagesDone.join(",")}`);

    // reconnect: a second stream replays the checkpointed run without
    // re-executing paid stages (should settle in seconds, not minutes)
    const t0 = Date.now();
    const replay = await runPipeline(runId);
    const replayComplete = classifyPipelineEvents(replay).status === "COMPLETE";
    ok("reconnect replays checkpointed run", replayComplete && Date.now() - t0 < 60_000, `${Math.round((Date.now() - t0) / 1000)}s`);
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

  if (runArguments.mode !== "finalize") {
    // deterministic text edit through the real API — headline is unique per
    // invocation so a --reuse re-run never no-ops into a false failure
    const stamp = `v${Date.now().toString(36).slice(-4)}`;
    const targetHeadline = `Fiber that just works ${stamp}`;
    const beforeHtml = await fs.readFile(path.join(runDir, "site/index.html"), "utf8");
    const editRes = await fetch(`${BASE}/api/edit`, {
      method: "POST",
      headers: JSON_MUTATION_HEADERS,
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

    // image edit: the same chat box drives a Higgsfield regeneration constrained
    // by the run's locked imagery brief (real spend: one image credit)
    const heroSrc = (html) =>
      /data-edit-id="hero\.image"[\s\S]{0,400}?src="([^"]+)"/.exec(html)?.[1];
    const imgBefore = heroSrc(afterHtml);
    const imgRes = await fetch(`${BASE}/api/edit`, {
      method: "POST",
      headers: JSON_MUTATION_HEADERS,
      body: JSON.stringify({
        runId,
        editId: "hero.image",
        instruction:
          "A close-up of gloved hands splicing a glowing fiber optic cable at dusk",
        imageIntent: true,
        requestId: randomUUID(),
      }),
    }).then((r) => r.json());
    const afterImgHtml = await fs.readFile(path.join(runDir, "site/index.html"), "utf8");
    const imgAfter = heroSrc(afterImgHtml);
    ok("image edit swaps hero via Higgsfield", imgRes.ok === true && !!imgAfter && imgAfter !== imgBefore, imgRes.error ?? `${imgBefore} → ${imgAfter}`);
    const imgSwapOk = imgRes.ok === true && !!imgAfter && imgAfter !== imgBefore;
    const assetOnDisk = imgSwapOk
      ? await fs.access(path.join(runDir, "site", imgAfter)).then(() => true).catch(() => false)
      : false;
    ok("generated image asset exists on disk", assetOnDisk, imgAfter ?? "no src");

    // reload iframe shows the change
    await page.reload({ waitUntil: "domcontentloaded" });
    const newHeadline = await page.frameLocator("iframe").locator('[data-edit-id="hero.headline"]').innerText({ timeout: 20000 });
    ok("preview reflects the edit", newHeadline.includes(targetHeadline), newHeadline.slice(0, 60));
  }

  ok("no page errors in preview shell", consoleErrors.length === 0, consoleErrors.join("; ").slice(0, 100));

  // screenshots for the record
  const shotsDir = path.join(ROOT, "docs", "eval", "e2e-shots");
  await fs.mkdir(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, `preview-${runId}.png`), fullPage: false });
  await browser.close();

  if (runArguments.mode !== "finalize") {
    if (results.some((result) => !result.pass)) {
      await finish(1, "FAILED");
    }
    const postMutation = classifyPipelineEvents(await runPipeline(runId));
    if (postMutation.status !== "APPROVAL_REQUIRED") {
      ok(
        "committed edits require renewed visual approval",
        false,
        postMutation.status,
      );
      await finish(1, "FAILED", postMutation.event);
    }
    ok(
      "committed edits require renewed visual approval",
      true,
      `${postMutation.event.workflowStage}: ${postMutation.event.workspaceUrl}`,
    );
    console.log(
      `\nReview the edited site at ${BASE}${postMutation.event.workspaceUrl}`,
    );
    console.log(
      `After final visual approval, finish with: node scripts/e2e/full-run.mjs --allow-metered --finalize ${runId}`,
    );
    const siteSha256 = await computeSiteBuildSha256(
      path.join(runDir, "site"),
    );
    await finish(2, "APPROVAL_REQUIRED", postMutation.event, {
      phase: "post-edit-review",
      postEditProof: { siteSha256 },
    });
  }

  await assertReviewedSiteUnchanged();
  await finish(results.some((r) => !r.pass) ? 1 : 0, undefined, null, {
    phase: "complete",
    ...(postEditProof ? { postEditProof } : {}),
  });
} catch (e) {
  console.error("E2E crashed:", e);
  await finish(1, "FAILED");
}

async function finish(
  code,
  status = code === 0 ? "COMPLETE" : "FAILED",
  terminal = null,
  metadata = {},
) {
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${pass}/${results.length} checks passed`);
  if (
    shouldPreserveFinalizeCheckpoint(
      runArguments.mode,
      status,
      validatedFinalizeCheckpoint !== null,
    )
  ) {
    console.log("Preserved the post-edit checkpoint for another --finalize attempt.");
  } else {
    await fs.mkdir(path.join(ROOT, "docs", "eval"), { recursive: true });
    await fs.writeFile(
      path.join(ROOT, "docs", "eval", "e2e-latest.json"),
      JSON.stringify(
        { at: new Date().toISOString(), runId, status, terminal, results, ...metadata },
        null,
        2,
      )
    );
  }
  server?.kill("SIGTERM");
  process.exit(code);
}
