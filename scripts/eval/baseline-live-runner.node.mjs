import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createDirectHandoffRequest,
  createPathAAdapter,
  createPathBHandoffAdapter,
  produceBaselinePath,
  sha256,
  verifyFrozenContract,
} from "./baseline-live-runner.mjs";
import { prepareRun, validateCompletedArtifacts } from "./baseline-harness.mjs";

const REPOSITORY = path.resolve(import.meta.dirname, "../..");
const BASELINE_FILES = [
  "docs/eval/baseline/evaluation-contract-v2.json",
  "docs/eval/baseline/evaluation-contract-v2.lock.json",
  "docs/eval/baseline/brief-v2.json",
  "docs/eval/baseline/rubric-v2.md",
  "src/lib/builder.ts",
  "src/lib/evidence.ts",
  "src/lib/gates.ts",
  "templates/local-service/index.html.tpl",
  "templates/local-service/motion-runtime.js",
  "templates/local-service/reveal.js",
  "templates/local-service/site.css",
  "templates/local-service/tokens.css.tpl",
];

async function temporaryRepository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-live-eval-"));
  await Promise.all(BASELINE_FILES.map(async (relativePath) => {
    const target = path.join(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(REPOSITORY, relativePath), target);
  }));
  return root;
}

async function listedFiles(directory, relative = "") {
  const result = [];
  for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await listedFiles(directory, next));
    else result.push(next.replaceAll(path.sep, "/"));
  }
  return result.sort();
}

function authorization({ runId, maxCostUsd = 1, allowPaidFallback = false }) {
  return {
    schemaVersion: 1,
    scope: "one-box-frozen-baseline-live-runner",
    runId,
    pathIds: ["path-a", "path-b"],
    liveExecutionApproved: true,
    approvedBy: "human-fixture",
    approvedAt: "2026-08-13T00:00:00.000Z",
    maxCostUsd,
    allowPaidFallback,
  };
}

function trace(pathId, overrides = {}) {
  return {
    schemaVersion: 1,
    pathId,
    status: "completed",
    recordedRunId: pathId === "path-a" ? "pipeline-fixture" : "direct-fixture",
    startedAt: "2026-08-13T00:01:00.000Z",
    finishedAt: "2026-08-13T00:02:00.000Z",
    sourceCommit: "0123456789abcdef0123456789abcdef01234567",
    prompts: [{ id: "frozen-brief", text: "Use the frozen brief without modification." }],
    models: [{ stage: "builder", providerId: "provider-fixture", modelId: "model-fixture" }],
    toolCalls: [{
      id: "call-1",
      toolName: pathId === "path-b" ? "refero_search_styles" : "current_pipeline",
      providerId: pathId === "path-b" ? "refero" : "one-box",
      outcome: "succeeded",
      metered: false,
      startedAt: "2026-08-13T00:01:00.000Z",
      finishedAt: "2026-08-13T00:01:01.000Z",
      inputSha256: "a".repeat(64),
      outputSha256: "b".repeat(64),
    }],
    sources: [{
      id: "source-1",
      url: "https://example.test/source",
      providerId: pathId === "path-b" ? "refero" : "crawl4ai",
      capturedAt: "2026-08-13T00:01:30.000Z",
      freshnessClass: "live",
      confidence: 0.9,
    }],
    meteredCalls: [],
    repairRounds: 0,
    ...overrides,
  };
}

function artifactFixture() {
  const businessIntelligence = {
    kind: "business-intelligence",
    sources: [{ id: "source-1", sourceUrl: "https://example.test/business", capturedAt: "2026-08-13T00:01:00Z", confidence: 0.8 }],
    claims: [],
  };
  return {
    "business-intelligence.json": businessIntelligence,
    "design-research-ledger.json": {
      projectTarget: "website",
      businessIntelligence,
      referoDesignEvidence: {
        kind: "refero-design-evidence",
        providerId: "refero",
        sources: [{ id: "ref-123", sourceUrl: "https://refero.design/example", capturedAt: "2026-08-13T00:01:00Z", confidence: 0.9 }],
        references: [{ referoId: "ref-123", name: "Reference", learningRationale: "Clear local-service hierarchy", reusablePatterns: ["Trust before service detail"] }],
        claims: [],
      },
    },
    "DESIGN.md": "# Design contract\n\nPath A used evidence from Refero source ref-123 to inform the hierarchy.\n",
    "token-inventory.json": { sourceContractVersion: 1, tokens: [{ semanticName: "surface", value: "#fff", usage: "page", category: "color", sourceEvidenceIds: ["ref-123"], editable: true }] },
    "tailwind-plan.json": { sourceTokenInventoryVersion: 1, themeMappings: [{ cssVariable: "--surface", tailwindName: "surface", rationale: "Shared surface" }], runtimeOnlyVariables: [], componentVariants: [], responsiveRules: [] },
    "css-architecture.json": { sourceTailwindPlanVersion: 1, cssVariableHierarchy: ["--surface"], tokenToComponentUsage: { surface: ["body"] }, styleScopes: { global: ["tokens"], page: [], component: [] }, justifiedExceptions: [] },
    "site-manifest.json": { entry: "index.html", files: ["index.html"], assets: [], builtAt: "2026-08-13T00:02:00Z", complete: true },
    "visual-qa.json": { sourceCssArchitectureVersion: 1, buildSha256: "c".repeat(64), checks: [
      { area: "desktop", status: "pass", evidencePath: "sites/direct-fixture/desktop.png" },
      { area: "tablet", status: "pass", evidencePath: "sites/direct-fixture/tablet.png" },
      { area: "mobile", status: "pass", evidencePath: "sites/direct-fixture/mobile.png" },
      { area: "hover", status: "pass" },
      { area: "focus", status: "pass" },
      { area: "color-scheme", status: "not-applicable" },
      { area: "reduced-motion", status: "pass" },
    ] },
    "site/index.html": "<!doctype html><html><body><main>Fiber service</main></body></html>",
    "site/styles.css": "body { color: #222; }",
    "screenshots/desktop.png": pngFixture(1440, 900),
    "screenshots/tablet.png": pngFixture(768, 1024),
    "screenshots/mobile.png": pngFixture(390, 844),
  };
}

function pngFixture(width, height) {
  const ihdr = Buffer.alloc(17);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0, 0, 0, 13]), Buffer.from("IHDR"), ihdr, Buffer.from([0, 0, 0, 0]), Buffer.from("IEND"), Buffer.alloc(4)]);
}

async function prepared(root, runId = "live-v1") {
  return prepareRun({ root, runId, seed: "fixture-seed", createdAt: "2026-08-13T00:00:00.000Z" });
}

test("verifies the frozen lock and every frozen input hash", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const verified = await verifyFrozenContract(root);
  assert.equal(verified.contract.status, "frozen");
  await fs.appendFile(path.join(root, "docs/eval/baseline/brief-v2.json"), " ");
  await assert.rejects(verifyFrozenContract(root), /input hash mismatch/);
});

test("authorization is checked before an injected adapter can make calls", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await prepared(root);
  let called = false;
  const adapter = { produce: async () => { called = true; return { artifacts: artifactFixture(), trace: trace("path-b") }; } };
  await assert.rejects(produceBaselinePath({ root, runId: "live-v1", pathId: "path-b", authorization: {}, adapter }), /authorization/);
  assert.equal(called, false);
});

test("publishes the complete v2 artifact packet atomically and immutably", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const run = await prepared(root);
  const result = await produceBaselinePath({
    root,
    runId: "live-v1",
    pathId: "path-b",
    authorization: authorization({ runId: "live-v1", pathId: "path-b" }),
    adapter: { produce: async () => ({ artifacts: artifactFixture(), trace: trace("path-b") }) },
  });
  assert.equal(result.runManifestSha256, run.manifestHash);
  const entries = await listedFiles(result.directory);
  assert.equal(entries.length, 14);
  assert.ok(entries.includes("site/index.html") && entries.includes("screenshots/mobile.png"));
  const presentation = await Promise.all(entries.filter((name) => !name.endsWith(".png") && name !== "provenance.json").map((name) => fs.readFile(path.join(result.directory, name), "utf8")));
  assert.doesNotMatch(presentation.join("\n"), /refero|providerId|createdAt|capturedAt|builtAt|costUsd/i);
  assert.doesNotMatch(presentation.join("\n"), /https?:\/\/|sites\/direct-fixture/);
  const provenance = JSON.parse(await fs.readFile(path.join(result.directory, "provenance.json"), "utf8"));
  assert.equal(provenance.pathId, "path-b");
  assert.equal(provenance.runManifestSha256, run.manifestHash);
  assert.equal(provenance.outputHashes.length, 13);
  assert.equal(provenance.toolCalls[0].providerId, "refero");
  await produceBaselinePath({
    root,
    runId: "live-v1",
    pathId: "path-a",
    authorization: authorization({ runId: "live-v1", pathId: "path-a" }),
    adapter: { produce: async () => ({ artifacts: artifactFixture(), trace: trace("path-a") }) },
  });
  const checked = await validateCompletedArtifacts({ root, runId: "live-v1" });
  assert.deepEqual(checked.errors, []);
  await assert.rejects(produceBaselinePath({
    root,
    runId: "live-v1",
    pathId: "path-b",
    authorization: authorization({ runId: "live-v1", pathId: "path-b" }),
    adapter: { produce: async () => ({ artifacts: artifactFixture(), trace: trace("path-b") }) },
  }), /immutable/);
});

test("partial output and overspend fail closed without a destination", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await prepared(root);
  const partial = artifactFixture();
  delete partial["visual-qa.json"];
  await assert.rejects(produceBaselinePath({
    root,
    runId: "live-v1",
    pathId: "path-a",
    authorization: authorization({ runId: "live-v1", pathId: "path-a" }),
    adapter: { produce: async () => ({ artifacts: partial, trace: trace("path-a") }) },
  }), /artifact allowlist/);
  await assert.rejects(fs.access(path.join(root, "docs/eval/baseline/runs/live-v1/artifacts/path-a")));

  await assert.rejects(produceBaselinePath({
    root,
    runId: "live-v1",
    pathId: "path-a",
    authorization: authorization({ runId: "live-v1", pathId: "path-a", maxCostUsd: 1 }),
    adapter: { produce: async () => ({
      artifacts: artifactFixture(),
      trace: trace("path-a", {
        toolCalls: [{ id: "call-1", toolName: "current_pipeline", providerId: "paid", outcome: "succeeded", metered: true, startedAt: "2026-08-13T00:01:00.000Z", finishedAt: "2026-08-13T00:01:01.000Z", inputSha256: "a".repeat(64), outputSha256: "b".repeat(64) }],
        meteredCalls: [{ toolCallId: "call-1", providerId: "paid", costUsd: 1.5, currency: "USD", billingLane: "metered" }],
      }),
    }) },
  }), /authorized maximum/);
  await assert.rejects(fs.access(path.join(root, "docs/eval/baseline/runs/live-v1/artifacts/path-a")));

  const paidFallbackTrace = trace("path-a", {
    toolCalls: [{ id: "call-1", toolName: "firecrawl_scrape", providerId: "firecrawl", outcome: "succeeded", metered: true, paidFallback: true, startedAt: "2026-08-13T00:01:00.000Z", finishedAt: "2026-08-13T00:01:01.000Z", inputSha256: "a".repeat(64), outputSha256: "b".repeat(64) }],
    meteredCalls: [{ toolCallId: "call-1", providerId: "firecrawl", costUsd: 0.1, currency: "USD", billingLane: "metered" }],
  });
  await assert.rejects(produceBaselinePath({
    root,
    runId: "live-v1",
    pathId: "path-a",
    authorization: authorization({ runId: "live-v1", pathId: "path-a", maxCostUsd: 1, allowPaidFallback: false }),
    adapter: { produce: async () => ({ artifacts: artifactFixture(), trace: paidFallbackTrace }) },
  }), /paid fallback was not explicitly authorized/);
  await assert.rejects(fs.access(path.join(root, "docs/eval/baseline/runs/live-v1/artifacts/path-a")));
});

test("serializes producers so both paths cannot bypass sibling checks in a race", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await prepared(root);
  let release;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  const first = produceBaselinePath({
    root,
    runId: "live-v1",
    pathId: "path-a",
    authorization: authorization({ runId: "live-v1", pathId: "path-a" }),
    adapter: { produce: async () => {
      markStarted();
      await held;
      return { artifacts: artifactFixture(), trace: trace("path-a") };
    } },
  });
  await started;
  let secondCalled = false;
  await assert.rejects(produceBaselinePath({
    root,
    runId: "live-v1",
    pathId: "path-b",
    authorization: authorization({ runId: "live-v1", pathId: "path-b" }),
    adapter: { produce: async () => { secondCalled = true; return { artifacts: artifactFixture(), trace: trace("path-b") }; } },
  }), /another baseline producer/);
  assert.equal(secondCalled, false);
  release();
  await first;
});

test("shared authorization enforces aggregate cost and producing source commit parity", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await prepared(root, "aggregate-v2");
  const shared = authorization({ runId: "aggregate-v2", maxCostUsd: 1 });
  const paidTrace = (pathId, sourceCommit = trace(pathId).sourceCommit) => trace(pathId, {
    sourceCommit,
    toolCalls: [{ id: "call-1", toolName: "metered", providerId: "paid", outcome: "succeeded", metered: true, startedAt: "2026-08-13T00:01:00.000Z", finishedAt: "2026-08-13T00:01:01.000Z", inputSha256: "a".repeat(64), outputSha256: "b".repeat(64) }],
    meteredCalls: [{ toolCallId: "call-1", providerId: "paid", costUsd: 0.6, currency: "USD", billingLane: "metered" }],
  });
  await produceBaselinePath({ root, runId: "aggregate-v2", pathId: "path-a", authorization: shared, adapter: { produce: async () => ({ artifacts: artifactFixture(), trace: paidTrace("path-a") }) } });
  await assert.rejects(produceBaselinePath({ root, runId: "aggregate-v2", pathId: "path-b", authorization: shared, adapter: { produce: async () => ({ artifacts: artifactFixture(), trace: paidTrace("path-b") }) } }), /aggregate recorded metered cost/);
  await prepared(root, "commit-v2");
  const commitAuth = authorization({ runId: "commit-v2", maxCostUsd: 2 });
  await produceBaselinePath({ root, runId: "commit-v2", pathId: "path-a", authorization: commitAuth, adapter: { produce: async () => ({ artifacts: artifactFixture(), trace: trace("path-a") }) } });
  await assert.rejects(produceBaselinePath({ root, runId: "commit-v2", pathId: "path-b", authorization: commitAuth, adapter: { produce: async () => ({ artifacts: artifactFixture(), trace: trace("path-b", { sourceCommit: "f".repeat(40) }) }) } }), /producer source commit differs/);
});

test("creates a credential-free direct handoff request bound to the prepared run", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const run = await prepared(root);
  const output = path.join(root, "handoff-request.json");
  const request = await createDirectHandoffRequest({ root, runId: "live-v1", output, sourceCommit: trace("path-b").sourceCommit });
  assert.equal(request.runManifestSha256, run.manifestHash);
  assert.equal(request.pathId, "path-b");
  assert.equal(request.credentialsRequested, false);
  assert.equal(request.briefSha256, sha256(await fs.readFile(path.join(root, "docs/eval/baseline/brief-v2.json"))));
});

test("Path B handoff adapter reads only regular allowlisted files", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await prepared(root);
  const handoffDir = path.join(root, "handoff");
  await fs.mkdir(handoffDir);
  const request = await createDirectHandoffRequest({ root, runId: "live-v1", output: path.join(root, "path-b-request.json"), sourceCommit: trace("path-b").sourceCommit });
  const artifacts = artifactFixture();
  const artifactPaths = {};
  for (const [name, value] of Object.entries(artifacts)) {
    const relative = path.join("artifacts", name);
    const target = path.join(handoffDir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.isBuffer(value) ? value : typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
    artifactPaths[name] = relative;
  }
  const handoffFile = path.join(handoffDir, "handoff.json");
  const handoff = {
    schemaVersion: 2,
    pathId: "path-b",
    runManifestSha256: request.runManifestSha256,
    contractSha256: request.contractSha256,
    briefSha256: request.briefSha256,
    downstreamConstants: request.downstreamConstants,
    artifacts: artifactPaths,
    trace: trace("path-b"),
  };
  await fs.writeFile(handoffFile, JSON.stringify(handoff));
  const external = path.join(root, "external");
  await fs.mkdir(external);
  await fs.writeFile(path.join(external, "DESIGN.md"), artifacts["DESIGN.md"]);
  await fs.symlink(external, path.join(handoffDir, "linked"));
  const originalDesignPath = handoff.artifacts["DESIGN.md"];
  handoff.artifacts["DESIGN.md"] = "linked/DESIGN.md";
  await fs.writeFile(handoffFile, JSON.stringify(handoff));
  await assert.rejects(produceBaselinePath({
    root,
    runId: "live-v1",
    pathId: "path-b",
    authorization: authorization({ runId: "live-v1", pathId: "path-b" }),
    adapter: createPathBHandoffAdapter(handoffFile),
  }), /escapes handoff root/);
  handoff.artifacts["DESIGN.md"] = originalDesignPath;
  await fs.writeFile(handoffFile, JSON.stringify(handoff));
  const result = await produceBaselinePath({
    root,
    runId: "live-v1",
    pathId: "path-b",
    authorization: authorization({ runId: "live-v1", pathId: "path-b" }),
    adapter: createPathBHandoffAdapter(handoffFile),
  });
  assert.equal((await listedFiles(result.directory)).length, 14);
});

test("Path A adapter validates a completed approved current-pipeline run", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await prepared(root);
  const sourceRunId = "pipeline-fixture";
  const sourceRoot = path.join(root, "sites", sourceRunId);
  await fs.mkdir(path.join(sourceRoot, "evidence/versions/design-contract"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "site"), { recursive: true });
  const brief = JSON.parse(await fs.readFile(path.join(root, "docs/eval/baseline/brief-v2.json"), "utf8"));
  await fs.writeFile(path.join(sourceRoot, "intake.json"), JSON.stringify({
    businessName: brief.client.businessName,
    category: brief.client.category,
    location: brief.client.location,
    services: brief.services,
    phone: brief.facts.phone,
    serviceArea: brief.facts.serviceArea,
    yearsInBusiness: brief.facts.yearsInBusiness,
    certifications: brief.facts.certifications,
    claims: brief.facts.claims,
    primaryAction: "quote",
    vibeWords: brief.brand.attributes,
    projectTarget: brief.projectTarget,
    research: { enabled: true, businessIntelligence: true, referoDesignEvidence: true, allowPaidFirecrawlFallback: false },
    uploads: [],
  }));
  const ledger = artifactFixture()["design-research-ledger.json"];
  const design = artifactFixture()["DESIGN.md"];
  await fs.writeFile(path.join(sourceRoot, "evidence/versions/design-contract/v1.DESIGN.md"), design);
  await fs.writeFile(path.join(sourceRoot, "site/manifest.json"), JSON.stringify({ ...artifactFixture()["site-manifest.json"], sourceCommit: trace("path-a").sourceCommit }));
  await fs.writeFile(path.join(sourceRoot, "site/index.html"), artifactFixture()["site/index.html"]);
  await fs.writeFile(path.join(sourceRoot, "site/site.css"), artifactFixture()["site/styles.css"]);
  await fs.mkdir(path.join(sourceRoot, "evidence/qa"), { recursive: true });
  await fs.writeFile(path.join(sourceRoot, "evidence/qa/desktop.png"), artifactFixture()["screenshots/desktop.png"]);
  await fs.writeFile(path.join(sourceRoot, "evidence/qa/tablet.png"), artifactFixture()["screenshots/tablet.png"]);
  await fs.writeFile(path.join(sourceRoot, "evidence/qa/mobile.png"), artifactFixture()["screenshots/mobile.png"]);
  const approved = (artifactType, artifact) => ({ artifactType, version: 1, createdAt: "2026-08-13T00:00:00Z", approvalTransitions: [{ state: "draft", at: "2026-08-13T00:00:00Z" }, { state: "in-review", at: "2026-08-13T00:00:01Z" }, { state: "approved", at: "2026-08-13T00:00:02Z" }], artifact });
  const fixture = artifactFixture();
  fixture["visual-qa.json"] = { ...fixture["visual-qa.json"], checks: fixture["visual-qa.json"].checks.map((check) => ["desktop", "tablet", "mobile"].includes(check.area) ? { ...check, evidencePath: `evidence/qa/${check.area}.png` } : check) };
  await fs.writeFile(path.join(sourceRoot, "run.json"), JSON.stringify({
    id: sourceRunId,
    sourceCommit: trace("path-a").sourceCommit,
    pipelineVersion: "evidence-gated-v2",
    stages: { built: { status: "done" } },
    costUsd: 0,
    modelSlugs: { builder: "model-fixture" },
    evidenceWorkflow: { currentStage: "build", artifacts: [
      approved("ledger", ledger),
      approved("design-contract", { contractPath: "evidence/versions/design-contract/v1.DESIGN.md", contractSha256: sha256(design), sourceLedgerVersion: 1 }),
      approved("token-inventory", fixture["token-inventory.json"]),
      approved("tailwind-plan", fixture["tailwind-plan.json"]),
      approved("css-architecture", fixture["css-architecture.json"]),
      approved("visual-qa", fixture["visual-qa.json"]),
    ] },
  }));
  const produced = await createPathAAdapter({ root, sourceRunId, trace: trace("path-a") }).produce({ pathId: "path-a", brief });
  assert.deepEqual(produced.artifacts["business-intelligence.json"], ledger.businessIntelligence);
  assert.equal(produced.trace.recordedRunId, sourceRunId);
});
