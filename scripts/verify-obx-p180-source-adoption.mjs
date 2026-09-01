#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const failures = [];
const fail = (message) => failures.push(message);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readText = (path) => {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    fail(`missing ${path}`);
    return "";
  }
  return readFileSync(absolute, "utf8");
};
const readJson = (path) => {
  try { return JSON.parse(readText(path)); } catch (error) { fail(`${path}: invalid JSON (${error.message})`); return {}; }
};

const ledger = readJson("docs/research/source-catalog/adoption-ledger.json");
const fixture = readJson("docs/eval/one-box-program/fixtures/obx-p180-source-adoption-fixture-v1.json");
const receipt = readText("docs/research/source-catalog/obx-p180-source-adoption-closure-2026-08-31.md");
const prototype = readText("docs/plans/2026-08-12-one-box-prototype.md");
const historicalRepinPath = "docs/audits/evidence/security/2026-08-31-obx-p180-source-adoption-authority-repin.json";
const correctionRepinPath = "docs/audits/evidence/security/2026-09-01-obx-p180-phase1-audit-correction-authority-repin.json";
const historicalRepin = readJson(historicalRepinPath);
const correctionRepin = readJson(correctionRepinPath);
const entries = new Map((ledger.entries ?? []).map((entry) => [entry.id, entry]));

for (const id of ["SC-SVC-001", "SC-SVC-003", "SC-GH-010", "SC-INT-001"]) {
  const entry = entries.get(id);
  if (!entry) { fail(`ledger missing ${id}`); continue; }
  if (entry.recordCompleteness !== "complete" || !Array.isArray(entry.missingControls) || entry.missingControls.length !== 0) fail(`${id}: completeness drift`);
  for (const field of ["publisherAndAcquisition", "exactIdentityAndIntegrity", "maintenanceVulnerabilitySupport", "sandboxOrIsolation", "distributionModes", "namedOwner", "decisionDate", "reviewExpiry", "qualificationOracle", "killOrRemoval"]) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === "") fail(`${id}: missing ${field}`);
  }
  if (entry.namedOwner !== "Devin Wiggins") fail(`${id}: named owner drift`);
  if (!Number.isFinite(Date.parse(entry.reviewExpiry ?? ""))) fail(`${id}: invalid review expiry`);
}

const t3 = entries.get("SC-GH-010");
if (t3?.identity?.commit !== "41adccc83e819c286dcdf32cd8b5f55af8bb0b49" || t3?.identity?.tree !== "5ef26ef582a9d15682db0b335b415dd5b2a3bd06" || t3?.identity?.licenseBlob !== "55ee675bb1de9e580b69f3dd68684df2a4dffba7" || t3?.license?.spdx !== "MIT" || t3?.decision !== "adapt" || t3?.codeUseAllowed !== false || t3?.serviceUseAllowed !== false) fail("SC-GH-010: exact pattern-only T3 receipt drift");
if (Object.keys(t3?.identity?.sourceBlobs ?? {}).length !== 7 || t3?.evaluationBindingRef !== "SC-SVC-003.evaluationBinding" || !Array.isArray(t3?.cannotOwn) || !t3.cannotOwn.includes("Page IR") || !t3.cannotOwn.includes("release")) fail("SC-GH-010: source blobs, evaluation binding, or forbidden authority incomplete");

const mishMash = entries.get("SC-INT-001");
if (mishMash?.identity?.commit !== "334e4ba4e01071825686a6793c56c6bc482fa951" || Object.keys(mishMash?.identity?.sourceBlobs ?? {}).length !== 6 || mishMash?.license?.status !== "internal-owned-source" || mishMash?.evaluationBindingRef !== "SC-SVC-003.evaluationBinding" || mishMash?.decision !== "adapt" || mishMash?.codeUseAllowed !== false || mishMash?.serviceUseAllowed !== false) fail("SC-INT-001: exact MishMash no-copy receipt drift");
if (!Array.isArray(mishMash?.cannotOwn) || !mishMash.cannotOwn.includes("database or persistence") || !mishMash.cannotOwn.includes("Page IR")) fail("SC-INT-001: no-copy authority boundary incomplete");

const route = entries.get("SC-SVC-003");
const policy = route?.routePolicy;
if (route?.identity?.model !== "z-ai/glm-5.3-flash" || route?.identity?.upstreamProvider !== "Z.AI" || route?.identity?.endpointTag !== "z-ai/fp8" || policy?.registry !== "external-review-only" || JSON.stringify(policy?.providerOrder) !== '["z-ai/fp8"]' || JSON.stringify(policy?.providerOnly) !== '["z-ai/fp8"]' || policy?.allowFallbacks !== false || policy?.requireParameters !== true || policy?.dataCollection !== "deny" || policy?.zdr !== true || JSON.stringify(policy?.tools) !== "[]" || JSON.stringify(policy?.plugins) !== "[]" || policy?.openRouterLoggingAssumption !== "potentially-enabled-and-accepted-for-sanitized-packet" || policy?.reasoningEffort !== "low" || policy?.maxInputTokens !== 200000 || policy?.maxOutputTokens !== 8000 || policy?.maxAttempts !== 1 || policy?.maxCostUsd !== "0.05" || policy?.productDataTransferAllowed !== false || route?.serviceUseAllowed !== true || route?.codeUseAllowed !== false || route?.releaseUseAllowed !== false || route?.expansionAllowed !== false) fail("SC-SVC-003: exact audit route or fail-closed controls drift");

if (fixture.fixtureId !== "obx-p180-source-adoption-fixture-v1" || fixture.laneId !== "source-adoption-conformance" || fixture.mode !== "provider-offline" || fixture.dataClass !== "synthetic-internal" || fixture.providerCallsPermitted !== false) fail("source-adoption fixture root drift");
const cases = Array.isArray(fixture.cases) ? fixture.cases : [];
const sourceRefs = new Set(cases.flatMap((item) => item.sourceRefs ?? []));
const ticketIds = new Set(cases.flatMap((item) => item.ticketIds ?? []));
const evaluatorIds = new Set(cases.map((item) => item.evaluator));
for (const id of ["SC-GH-010", "SC-INT-001", "SC-SVC-001", "SC-SVC-003"]) if (!sourceRefs.has(id)) fail(`fixture missing source ${id}`);
for (const id of ["OBX-P180-T03", "OBX-P180-T04", "OBX-P180-T05"]) if (!ticketIds.has(id)) fail(`fixture missing ticket ${id}`);
for (const id of ["command-replay", "event-projection", "source-authority", "provider-lifecycle", "retry-side-effect", "audit-route-policy", "source-removal"]) if (!evaluatorIds.has(id)) fail(`fixture missing evaluator ${id}`);

const acceptedRouteCase = cases.find((item) => item.id === "openrouter-glm-exact-audit-route-admitted");
const acceptedRouteInput = acceptedRouteCase?.input;
if (
  acceptedRouteCase?.expect?.accepted !== true || acceptedRouteCase?.expect?.reasonCode !== "ACCEPTED" ||
  acceptedRouteInput?.routeId !== route?.identity?.routeId || acceptedRouteInput?.registry !== policy?.registry ||
  acceptedRouteInput?.model !== route?.identity?.model || acceptedRouteInput?.upstreamProvider !== route?.identity?.upstreamProvider ||
  JSON.stringify(acceptedRouteInput?.providerOrder) !== JSON.stringify(policy?.providerOrder) || JSON.stringify(acceptedRouteInput?.providerOnly) !== JSON.stringify(policy?.providerOnly) ||
  acceptedRouteInput?.allowFallbacks !== policy?.allowFallbacks || acceptedRouteInput?.requireParameters !== policy?.requireParameters ||
  acceptedRouteInput?.dataCollection !== policy?.dataCollection || acceptedRouteInput?.zdr !== policy?.zdr ||
  JSON.stringify(acceptedRouteInput?.tools) !== JSON.stringify(policy?.tools) || JSON.stringify(acceptedRouteInput?.plugins) !== JSON.stringify(policy?.plugins) ||
  acceptedRouteInput?.openRouterLoggingAssumption !== policy?.openRouterLoggingAssumption ||
  acceptedRouteInput?.reasoningEffort !== policy?.reasoningEffort ||
  acceptedRouteInput?.productDataTransferAllowed !== policy?.productDataTransferAllowed || acceptedRouteInput?.maxAttempts !== policy?.maxAttempts ||
  acceptedRouteInput?.maxInputTokens !== policy?.maxInputTokens || acceptedRouteInput?.maxOutputTokens !== policy?.maxOutputTokens ||
  acceptedRouteInput?.maxCostUsd !== Number(policy?.maxCostUsd)
) fail("fixture accepted route is not cross-bound to SC-SVC-003 policy");

const routeCaseIds = new Set(cases.filter((item) => item.evaluator === "audit-route-policy").map((item) => item.id));
for (const id of [
  "openrouter-glm-hidden-fallback-rejected", "openrouter-glm-privacy-drift-rejected", "openrouter-glm-product-data-rejected",
  "openrouter-glm-product-transfer-rejected", "openrouter-glm-budget-excess-rejected", "openrouter-glm-alternate-provider-rejected",
  "openrouter-glm-tool-use-rejected", "openrouter-glm-plugin-use-rejected", "openrouter-glm-retry-rejected",
  "openrouter-glm-expired-route-rejected", "openrouter-glm-input-token-limit-rejected", "openrouter-glm-output-token-limit-rejected",
]) if (!routeCaseIds.has(id)) fail(`fixture missing route-policy case ${id}`);

const expectedEvaluationBindings = {
  fixture: "docs/eval/one-box-program/fixtures/obx-p180-source-adoption-fixture-v1.json",
  evaluator: "scripts/eval/obx-p180-source-adoption-fixtures.mjs",
  test: "scripts/eval/obx-p180-source-adoption-fixtures.node.mjs",
  verifier: "scripts/verify-obx-p180-source-adoption.mjs",
};
const evaluationBinding = route?.evaluationBinding;
if (evaluationBinding?.algorithm !== "sha256") fail("SC-SVC-003: evaluation binding algorithm drift");
for (const [key, path] of Object.entries(expectedEvaluationBindings)) {
  const record = evaluationBinding?.artifacts?.[key];
  if (record?.path !== path || !/^[a-f0-9]{64}$/.test(record?.digest ?? "")) {
    fail(`SC-SVC-003: invalid ${key} evaluation binding`);
    continue;
  }
  const absolute = resolve(root, path);
  if (!existsSync(absolute) || sha256(readFileSync(absolute)) !== record.digest) fail(`SC-SVC-003: ${key} evaluation binding digest mismatch`);
}

const evaluatorPath = resolve(root, expectedEvaluationBindings.evaluator);
const fixturePath = resolve(root, expectedEvaluationBindings.fixture);
const lane = spawnSync(process.execPath, [
  "--experimental-permission",
  `--allow-fs-read=${root}`,
  `--allow-fs-read=${dirname(fixturePath)}`,
  evaluatorPath,
  "--fixture",
  fixturePath,
], { cwd: root, encoding: "utf8" });
if (lane.status !== 0) {
  fail(`source-adoption fixture lane failed: ${(lane.stderr || lane.stdout || `exit ${lane.status}`).trim()}`);
} else {
  try {
    const laneReceipt = JSON.parse(lane.stdout);
    if (laneReceipt.verdict !== "PASS" || laneReceipt.total !== cases.length || laneReceipt.passed !== cases.length || laneReceipt.failed !== 0 || laneReceipt.networkPermission !== "denied" || laneReceipt.providerCallsMade !== 0) fail("source-adoption fixture lane receipt drift");
  } catch (error) {
    fail(`source-adoption fixture lane emitted invalid JSON: ${error.message}`);
  }
}

const authorityManifestPath = "docs/plans/one-box-master/00-authority/authority-manifest.json";
const t02SecurityReceiptPath = "docs/audits/evidence/security/2026-08-31-obx-p180-t02-solo-authorization-security-review.json";
const authorityManifest = readJson(authorityManifestPath);
if (
  sha256(readFileSync(resolve(root, historicalRepinPath))) !== "79f9a17aabd90cc023a7a7db8be19388b84ad22212ee9e569236c7bf98fd939d" ||
  historicalRepin?.schemaVersion !== "obx-p180-authority-repin-review-v1" || historicalRepin?.namedOwner !== "Devin Wiggins" ||
  historicalRepin?.verdict !== "PASS" || historicalRepin?.findingCount !== 0 ||
  historicalRepin?.currentAuthorityManifest?.packetDigest !== "0ed6de191fabb1193560365134b8aa898e9d02254f08a5d23a80b527e3fc43ec" ||
  historicalRepin?.currentAuthorityManifest?.sha256 !== "3d044f23db0fc0a39ebe036a23f9e24779accfe716ef57c6a4ce3999b8912ac6" ||
  historicalRepin?.refreshedT02SecurityReceipt?.path !== t02SecurityReceiptPath || historicalRepin?.refreshedT02SecurityReceipt?.sha256 !== sha256(readFileSync(resolve(root, t02SecurityReceiptPath)))
) fail("historical authority-manifest re-pin drift or reuse");

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const correctionRepinCopy = structuredClone(correctionRepin);
const correctionRepinDigest = correctionRepinCopy?.selfHash?.digest;
if (correctionRepinCopy?.selfHash) delete correctionRepinCopy.selfHash.digest;
const correctionReviewedAt = Date.parse(correctionRepin?.recordedAt ?? "");
const correctionSecurityReviewedAt = Date.parse(readJson("docs/audits/evidence/security/2026-09-01-obx-p180-phase1-audit-correction-security-review.json")?.reviewedAt ?? "");
if (
  correctionRepin?.schemaVersion !== 1 || correctionRepin?.reviewId !== "OBX-P180-PHASE1-AUDIT-CORRECTION-AUTHORITY-REPIN-001" ||
  correctionRepin?.recordKind !== "owner-directed-phase1-correction-authority-repin-v1" ||
  correctionRepin?.owner?.actorId !== "person:devin-wiggins" || correctionRepin?.owner?.role !== "repository-owner" ||
  correctionRepin?.historicalRepinBinding?.digest !== "79f9a17aabd90cc023a7a7db8be19388b84ad22212ee9e569236c7bf98fd939d" ||
  correctionRepin?.historicalRepinBinding?.singleUse !== true || correctionRepin?.historicalRepinBinding?.consumed !== true || correctionRepin?.historicalRepinBinding?.reused !== false ||
  correctionRepin?.currentAuthorityManifest?.path !== authorityManifestPath || correctionRepin?.currentAuthorityManifest?.packetDigest !== authorityManifest?.packetDigest ||
  correctionRepin?.currentAuthorityManifest?.sha256 !== sha256(readFileSync(resolve(root, authorityManifestPath))) ||
  correctionRepin?.completionProtocol?.singleUse !== true || correctionRepin?.completionProtocol?.useLimit !== 1 || correctionRepin?.completionProtocol?.renewable !== false ||
  correctionRepin?.invariants?.historicalReceiptRewritten !== false || correctionRepin?.invariants?.historicalSingleUseGrantReused !== false ||
  correctionRepin?.invariants?.implementationAuthorized !== false || correctionRepin?.invariants?.authorityExpansion !== false ||
  correctionRepin?.invariants?.runtimeOrDependencyChange !== false || correctionRepin?.invariants?.providerBackedProductRoute !== false ||
  correctionRepin?.invariants?.pageIrMutation !== false ||
  !Number.isFinite(correctionReviewedAt) || !Number.isFinite(correctionSecurityReviewedAt) || correctionSecurityReviewedAt <= correctionReviewedAt ||
  correctionRepin?.selfHash?.algorithm !== "sha256" || correctionRepin?.selfHash?.canonicalization !== "canonical-json-v1" ||
  JSON.stringify(correctionRepin?.selfHash?.excludedJsonPointers) !== '["/selfHash/digest"]' ||
  correctionRepinDigest !== sha256(canonical(correctionRepinCopy))
) fail("fresh owner-directed authority-manifest correction re-pin drift");

for (const token of ["direct Moonshot lane is the fallback", "is also approved if cheaper"]) if (prototype.includes(token)) fail(`active implicit fallback remains: ${token}`);
for (const token of ["41adccc83e819c286dcdf32cd8b5f55af8bb0b49", "334e4ba4e01071825686a6793c56c6bc482fa951", "audit-openrouter-glm-5.3-flash-zai-v2", "OBX-P180-T03", "OBX-P180-T04", "OBX-P180-T05"]) if (!receipt.includes(token)) fail(`source receipt missing ${token}`);
for (const path of ["scripts/eval/obx-p180-source-adoption-fixtures.mjs", "scripts/eval/obx-p180-source-adoption-fixtures.node.mjs"]) if (!existsSync(resolve(root, path))) fail(`missing ${path}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`OBX-P180 source-adoption verification failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`PASS OBX-P180 source-adoption closure: ${cases.length} provider-offline cases across T03-T05`);
