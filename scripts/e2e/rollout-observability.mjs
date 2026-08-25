import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.ONEBOX_BASE_URL ?? "http://127.0.0.1:3000";
const runId = "ops-rendered-run";
const hash = (character) => character.repeat(64);
const outcomes = [
  ["candidate-failure", "Candidate creation failed", "Retry candidate creation. If it fails again, request an explicit template fallback."],
  ["repair-failure", "Candidate repair failed", "Inspect repair diagnostics, then retry the same run without changing its authority."],
  ["gate-failure", "Quality gates blocked promotion", "Review the blocking gate details, then correct the candidate or request an explicit template fallback."],
  ["promotion-failure", "Atomic promotion failed", "Inspect promotion and recovery state, then retry only from the reported durable boundary."],
  ["recovery-action", "Recovery restored a candidate", "Review the recorded recovery result, then resume from the reported durable boundary."],
];
const events = [
  ...outcomes.map(([outcomeClass, message, nextAction]) => ({
    type: "lifecycle",
    stage: "built",
    outcomeClass,
    status: outcomeClass === "recovery-action" ? "action" : "failed",
    message,
    nextAction,
    at: "2026-08-24T12:00:00.000Z",
  })),
  {
    type: "provenance",
    stage: "built",
    provenance: {
      schemaVersion: 1,
      runId,
      layoutAuthority: "page-ir-v1",
      inputArtifactHashes: [{ path: "page-ir.json", sha256: hash("a") }],
      pageIrSha256: hash("a"),
      compilerVersion: "page-ir-static@3",
      candidateManifestSha256: hash("b"),
      candidateBuildSha256: hash("c"),
      gateReportSha256: hash("d"),
      promotedBuildSha256: hash("c"),
      reviewSha256: hash("e"),
      reviewBuildSha256: hash("c"),
    },
  },
  {
    type: "fallback-created",
    stage: "built",
    sourceRunId: runId,
    fallbackRunId: "ops-template-child",
    reason: "operator-requested-after-failure",
    failedStage: "built",
    at: "2026-08-24T12:01:00.000Z",
  },
  {
    type: "error",
    message: "The rendered observability fixture stopped before publication.",
  },
];

const browser = process.env.ONEBOX_EVAL_BROWSER_WS_ENDPOINT
  ? await chromium.connect(process.env.ONEBOX_EVAL_BROWSER_WS_ENDPOINT)
  : await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.setDefaultTimeout(8_000);
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  await page.route("**/api/run", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`,
    });
  });

  await page.goto(`${base}/?run=${runId}`, { waitUntil: "networkidle" });
  const buildGroup = page.locator(".stage-group").filter({ hasText: "Build" });
  await buildGroup.locator("summary").click();
  for (const [outcomeClass, message, nextAction] of outcomes) {
    const card = buildGroup.locator(".stage-card").filter({ hasText: message });
    await card.waitFor();
    const text = await card.innerText();
    assert.match(text, new RegExp(outcomeClass));
    assert.equal(text.includes(`Next action: ${nextAction}`), true);
  }
  const provenance = buildGroup.locator(".stage-card").filter({
    hasText: "Build provenance",
  });
  await provenance.waitFor();
  assert.match(await provenance.innerText(), /page-ir-static@3/);
  assert.match(await provenance.innerText(), /aaaaaaaaaaaa/);
  assert.match(await provenance.innerText(), /eeeeeeeeeeee/);
  const fallback = buildGroup.locator(".stage-card").filter({
    hasText: "Template fallback created",
  });
  await fallback.waitFor();
  assert.match(await fallback.innerText(), /operator-requested-after-failure/);
  assert.equal(
    await fallback.getByRole("link", { name: "Open template fallback run" })
      .getAttribute("href"),
    "/?run=ops-template-child",
  );
  assert.equal(await page.getByRole("link", { name: "Open preview" }).count(), 0);
  assert.match(await page.locator(".run-meta__status").innerText(), /error/i);
  assert.deepEqual(browserErrors, []);
  console.log("rollout observability rendered regression passed");
} finally {
  await browser.close();
}
