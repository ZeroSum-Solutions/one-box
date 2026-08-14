#!/usr/bin/env node
/**
 * Explicitly-authorized producer for the frozen Path A / Path B baseline.
 *
 * This process never discovers credentials. Path A adapts an already completed
 * current-pipeline run plus its externally captured call trace. Path B imports a
 * handoff produced across the authenticated Refero boundary. Provider adapters
 * are injectable so policy, atomicity, and neutralization are testable offline.
 */
import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASELINE_ROOT = "docs/eval/baseline";
const CONTRACT_PATH = `${BASELINE_ROOT}/evaluation-contract-v2.json`;
const LOCK_PATH = `${BASELINE_ROOT}/evaluation-contract-v2.lock.json`;
const BRIEF_PATH = `${BASELINE_ROOT}/brief-v2.json`;
const RUNS_PATH = `${BASELINE_ROOT}/runs`;
const AUTHORIZATION_SCOPE = "one-box-frozen-baseline-live-runner";
const PATH_IDS = new Set(["path-a", "path-b"]);
const PRESENTATION_FILES = [
  "business-intelligence.json",
  "design-research-ledger.json",
  "DESIGN.md",
  "token-inventory.json",
  "tailwind-plan.json",
  "css-architecture.json",
  "site-manifest.json",
  "visual-qa.json",
  "site/index.html",
  "site/styles.css",
  "screenshots/desktop.png",
  "screenshots/tablet.png",
  "screenshots/mobile.png",
];
const REQUIRED_FILES = [...PRESENTATION_FILES, "provenance.json"];
const REQUIRED_APPROVED_TYPES = [
  "ledger",
  "design-contract",
  "token-inventory",
  "tailwind-plan",
  "css-architecture",
  "visual-qa",
];
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const execFileAsync = promisify(execFile);
const BLOCKED_METADATA_KEYS = new Set([
  "providerid",
  "modelid",
  "modelslug",
  "models",
  "toolcalls",
  "createdat",
  "capturedat",
  "startedat",
  "finishedat",
  "latencyms",
  "durationms",
  "costusd",
  "inputtokens",
  "outputtokens",
  "meteredcalls",
  "builtat",
  "extractedat",
  "runid",
  "sourcerunid",
  "pathid",
  "producer",
  "sourcecommit",
  "gitcommit",
  "executionmode",
  "generatedby",
]);
const NEUTRAL_KEY_NAMES = new Map([
  ["referoDesignEvidence", "designReferenceEvidence"],
  ["referoId", "sourceId"],
]);
const IDENTITY_REPLACEMENTS = [
  [/direct\s+refero/giu, "direct design research"],
  [/refero/giu, "design source"],
  [/openrouter/giu, "model service"],
  [/openai/giu, "model service"],
  [/anthropic/giu, "model service"],
  [/x-ai/giu, "model service"],
  [/grok/giu, "model"],
  [/gemini/giu, "model"],
  [/moonshot/giu, "model service"],
  [/kimi/giu, "model"],
  [/deepseek/giu, "model"],
  [/crawl4ai/giu, "research service"],
  [/firecrawl/giu, "research service"],
  [/google\s+(?:maps platform|maps|places)/giu, "discovery service"],
  [/higgsfield/giu, "media service"],
  [/gpt-/giu, "model-"],
  [/claude-/giu, "model-"],
  [/path[\s_-]+a/giu, "workflow one"],
  [/path[\s_-]+b/giu, "workflow two"],
  [/current\s+one-box\s+pipeline/giu, "current workflow"],
  [/one-box\s+pipeline/giu, "current workflow"],
];
const NORMALIZED_BLOCKED_TERMS = [
  "path a", "path b", "path-a", "path-b", "path_a", "path_b",
  "current one-box pipeline", "one-box pipeline", "direct refero", "refero",
  "openrouter", "openai", "anthropic", "x-ai", "grok", "gemini", "moonshot",
  "kimi", "deepseek", "gpt-", "claude-", "providerId", "modelId",
  "modelSlug", "models", "toolCalls", "createdAt", "capturedAt", "startedAt",
  "finishedAt", "latencyMs", "durationMs", "costUsd", "inputTokens",
  "outputTokens", "meteredCalls", "builtAt", "extractedAt", "runId",
  "sourceRunId", "pathId", "sourceCommit", "gitCommit", "executionMode",
  "generatedBy",
  "crawl4ai", "firecrawl", "google maps", "google places", "higgsfield",
].map(normalizeForLeakScan);

function fail(message) {
  throw new Error(message);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function rootPath(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) fail(`path escapes root: ${relativePath}`);
  return resolved;
}

async function readRegularFile(file, label = file, maximumBytes = MAX_ARTIFACT_BYTES) {
  let linkStat;
  try {
    linkStat = await fs.lstat(file);
  } catch (error) {
    fail(`${label} is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (linkStat.isSymbolicLink() || !linkStat.isFile()) fail(`${label} must be a regular non-symlink file`);
  if (linkStat.size > maximumBytes) fail(`${label} exceeds the ${maximumBytes}-byte limit`);
  let handle;
  try {
    handle = await fs.open(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = await handle.stat();
    if (before.size > maximumBytes) fail(`${label} exceeds the ${maximumBytes}-byte limit`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!before.isFile() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      fail(`${label} changed while it was being read`);
    }
    return bytes;
  } finally {
    await handle?.close();
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(decodeUtf8(bytes, label));
  } catch (error) {
    fail(`invalid JSON at ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} is not valid UTF-8 text`);
  }
}

async function readJson(file, label = file, maximumBytes = MAX_JSON_BYTES) {
  return parseJson(await readRegularFile(file, label, maximumBytes), label);
}

async function assertRealPathContained(root, file, label, rootLabel = "handoff root") {
  const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(file)]);
  if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${path.sep}`)) fail(`${label} escapes ${rootLabel}`);
}

function sameStrings(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function verifyFrozenContract(root = SCRIPT_ROOT) {
  const contractBytes = await readRegularFile(rootPath(root, CONTRACT_PATH), CONTRACT_PATH);
  const contract = parseJson(contractBytes, CONTRACT_PATH);
  const lock = await readJson(rootPath(root, LOCK_PATH), LOCK_PATH);
  if (contract.status !== "frozen" || contract.hashAlgorithm !== "sha256") fail("evaluation contract is not frozen with sha256");
  if (lock.contractPath !== CONTRACT_PATH || lock.sha256 !== sha256(contractBytes)) fail("contract SHA-256 does not match its lock");
  for (const input of contract.inputs ?? []) {
    if (typeof input.path !== "string" || !/^[a-f0-9]{64}$/.test(input.sha256 ?? "")) fail("invalid frozen input declaration");
    const actual = sha256(await readRegularFile(rootPath(root, input.path), input.path));
    if (actual !== input.sha256) fail(`input hash mismatch: ${input.path}`);
  }
  if (!sameStrings(contract.requiredArtifacts, REQUIRED_FILES)) fail("runner artifact allowlist differs from frozen contract");
  if (!sameStrings(contract.requiredPresentationArtifacts, PRESENTATION_FILES)) fail("runner presentation allowlist differs from frozen contract");
  const briefBytes = await readRegularFile(rootPath(root, BRIEF_PATH), BRIEF_PATH);
  const brief = parseJson(briefBytes, BRIEF_PATH);
  if (!sameStrings(brief.requiredArtifacts, REQUIRED_FILES)) fail("frozen brief artifact allowlist differs from contract");
  return { contract, contractSha256: sha256(contractBytes), brief, briefSha256: sha256(briefBytes) };
}

function validateRunId(runId) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(runId ?? "")) fail("runId must use lowercase letters, numbers, and hyphens");
  return runId;
}

function validatePathId(pathId) {
  if (!PATH_IDS.has(pathId)) fail("pathId must be path-a or path-b");
  return pathId;
}

async function loadPreparedRun(root, runId, contractSha256) {
  const directory = rootPath(root, path.join(RUNS_PATH, validateRunId(runId)));
  const manifestBytes = await readRegularFile(path.join(directory, "run-manifest.json"), "prepared run manifest");
  const manifest = parseJson(manifestBytes, "prepared run manifest");
  if (manifest.runId !== runId || manifest.status !== "BLOCKED" || manifest.executionMode !== "offline-plan-only") fail("run was not prepared by the frozen offline harness");
  if (manifest.contract?.path !== CONTRACT_PATH || manifest.contract?.sha256 !== contractSha256) fail("prepared run is not bound to the current frozen contract");
  return { directory, manifest, manifestHash: sha256(manifestBytes) };
}

function validateAuthorization(authorization, { runId, pathId }) {
  if (!authorization || typeof authorization !== "object") fail("explicit live authorization is required");
  if (authorization.schemaVersion !== 1 || authorization.scope !== AUTHORIZATION_SCOPE || authorization.liveExecutionApproved !== true) fail("explicit live authorization is invalid");
  if (authorization.runId !== runId || !Array.isArray(authorization.pathIds) || !authorization.pathIds.includes(pathId) || authorization.pathIds.length !== PATH_IDS.size || new Set(authorization.pathIds).size !== authorization.pathIds.length || !authorization.pathIds.every((entry) => PATH_IDS.has(entry))) fail("one shared live authorization must cover exactly both paths for this run");
  if (typeof authorization.approvedBy !== "string" || !authorization.approvedBy.trim()) fail("live authorization must name the human approver");
  if (typeof authorization.approvedAt !== "string" || !Number.isFinite(Date.parse(authorization.approvedAt))) fail("live authorization approvedAt is invalid");
  if (!Number.isFinite(authorization.maxCostUsd) || authorization.maxCostUsd < 0) fail("live authorization requires a finite nonnegative maxCostUsd");
  if (authorization.allowPaidFallback !== true && authorization.allowPaidFallback !== false) fail("live authorization must explicitly set allowPaidFallback");
}

async function sourceFileAtCommit(root, sourceCommit, relativePath) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, "show", `${sourceCommit}:${relativePath}`], { encoding: "buffer", maxBuffer: MAX_ARTIFACT_BYTES });
    return Buffer.from(stdout);
  } catch (error) {
    // Test fixtures intentionally have no Git repository. Production roots do.
    try {
      await fs.access(path.join(root, ".git"));
    } catch {
      return readRegularFile(rootPath(root, relativePath), relativePath);
    }
    fail(`producing source commit cannot provide ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function downstreamConstants(root, verified, sourceCommit) {
  const builderFiles = [
    "src/lib/builder.ts",
    ...[
      "index.html.tpl", "motion-runtime.js", "reveal.js", "site.css", "tokens.css.tpl",
    ].map((name) => `templates/local-service/${name}`),
  ];
  const hashes = {};
  for (const file of builderFiles) hashes[file] = sha256(await sourceFileAtCommit(root, sourceCommit, file));
  return {
    builderConfigurationSha256: sha256(stableJson(hashes)),
    copyFactsSha256: sha256(stableJson({ client: verified.brief.client, services: verified.brief.services, facts: verified.brief.facts, functionality: verified.brief.functionality })),
    imageryPolicySha256: sha256(stableJson({ attributes: verified.brief.brand.attributes, mustAvoid: verified.brief.brand.mustAvoid })),
    viewportChecksSha256: sha256(stableJson(["desktop", "tablet", "mobile", "hover", "focus", "color-scheme", "reduced-motion"])),
    qualityGatesSha256: sha256(await sourceFileAtCommit(root, sourceCommit, "src/lib/gates.ts")),
    evidenceDerivationSha256: sha256(await sourceFileAtCommit(root, sourceCommit, "src/lib/evidence.ts")),
    outputFormatSha256: sha256(stableJson(PRESENTATION_FILES)),
  };
}

function validateTrace(trace, { pathId, authorization }) {
  if (!trace || typeof trace !== "object" || trace.schemaVersion !== 1 || trace.pathId !== pathId || trace.status !== "completed") fail("provider trace is missing, partial, or bound to the wrong path");
  if (typeof trace.recordedRunId !== "string" || !trace.recordedRunId.trim()) fail("provider trace recordedRunId is required");
  if (typeof trace.startedAt !== "string" || typeof trace.finishedAt !== "string" || !Number.isFinite(Date.parse(trace.startedAt)) || !Number.isFinite(Date.parse(trace.finishedAt)) || Date.parse(trace.finishedAt) < Date.parse(trace.startedAt)) fail("provider trace timestamps are invalid");
  if (Date.parse(authorization.approvedAt) > Date.parse(trace.startedAt)) fail("live authorization was recorded after execution began");
  if (!/^[a-f0-9]{40}$/.test(trace.sourceCommit ?? "")) fail("provider trace must record the producing git commit");
  for (const field of ["prompts", "models", "toolCalls", "sources", "meteredCalls"]) {
    if (!Array.isArray(trace[field])) fail(`provider trace ${field} must be an array`);
  }
  if (!trace.prompts.length || !trace.models.length || !trace.toolCalls.length || !trace.sources.length) fail("provider trace must record nonempty prompts, models, tool calls, and sources");
  if (!trace.prompts.every((entry) => entry && typeof entry.id === "string" && entry.id.trim() && typeof entry.text === "string" && entry.text.trim()) || new Set(trace.prompts.map((entry) => entry.id)).size !== trace.prompts.length) fail("provider trace contains an incomplete or duplicate prompt");
  if (!trace.models.every((entry) => entry && typeof entry.stage === "string" && entry.stage.trim() && typeof entry.providerId === "string" && entry.providerId.trim() && typeof entry.modelId === "string" && entry.modelId.trim())) fail("provider trace contains an incomplete model record");
  if (!trace.models.some((entry) => entry.stage === "builder")) fail("provider trace must identify the downstream builder model");
  builderModel(trace);
  if (!Number.isInteger(trace.repairRounds ?? 0) || (trace.repairRounds ?? 0) < 0) fail("provider trace repairRounds must be a nonnegative integer");
  const callIds = new Set();
  for (const call of trace.toolCalls) {
    if (!call || typeof call.id !== "string" || !call.id.trim() || callIds.has(call.id) || typeof call.toolName !== "string" || !call.toolName.trim() || typeof call.providerId !== "string" || !call.providerId.trim() || !["succeeded", "failed"].includes(call.outcome) || typeof call.metered !== "boolean" || typeof call.startedAt !== "string" || typeof call.finishedAt !== "string" || !Number.isFinite(Date.parse(call.startedAt)) || !Number.isFinite(Date.parse(call.finishedAt)) || Date.parse(call.finishedAt) < Date.parse(call.startedAt) || Date.parse(call.startedAt) < Date.parse(trace.startedAt) || Date.parse(call.finishedAt) > Date.parse(trace.finishedAt) || !/^[a-f0-9]{64}$/.test(call.inputSha256 ?? "") || !/^[a-f0-9]{64}$/.test(call.outputSha256 ?? "")) fail("provider trace contains an incomplete or duplicate tool call");
    if (call.outcome === "failed" && (typeof call.error !== "string" || !call.error.trim())) fail(`failed tool call must retain its provider error: ${call.id}`);
    callIds.add(call.id);
  }
  const meteredIds = new Set();
  let totalCostUsd = 0;
  for (const call of trace.meteredCalls) {
    const recordedCall = trace.toolCalls.find((entry) => entry.id === call?.toolCallId);
    if (!call || !recordedCall || meteredIds.has(call.toolCallId) || call.providerId !== recordedCall.providerId || !Number.isFinite(call.costUsd) || call.costUsd < 0 || call.currency !== "USD" || typeof call.billingLane !== "string" || !call.billingLane.trim()) fail("provider trace contains an invalid metered call");
    meteredIds.add(call.toolCallId);
    totalCostUsd += call.costUsd;
  }
  for (const call of trace.toolCalls) {
    if (call.metered !== meteredIds.has(call.id)) fail(`tool call metering record mismatch: ${call.id}`);
    if (/firecrawl/i.test(`${call.providerId} ${call.toolName}`) && call.paidFallback !== true) fail("Firecrawl calls must be explicitly recorded as paid fallback");
    if (call.paidFallback === true && authorization.allowPaidFallback !== true) fail("paid fallback was not explicitly authorized");
  }
  if (totalCostUsd > authorization.maxCostUsd + Number.EPSILON) fail(`recorded metered cost $${totalCostUsd.toFixed(4)} exceeds authorized maximum $${authorization.maxCostUsd.toFixed(4)}`);
  const sourceIds = new Set();
  for (const source of trace.sources) {
    if (!source || typeof source.id !== "string" || !source.id.trim() || sourceIds.has(source.id) || typeof source.url !== "string" || !source.url.trim() || typeof source.providerId !== "string" || !source.providerId.trim() || typeof source.capturedAt !== "string" || !Number.isFinite(Date.parse(source.capturedAt)) || Date.parse(source.capturedAt) < Date.parse(trace.startedAt) || Date.parse(source.capturedAt) > Date.parse(trace.finishedAt) || typeof source.freshnessClass !== "string" || !source.freshnessClass.trim() || !Number.isFinite(source.confidence) || source.confidence < 0 || source.confidence > 1) fail("provider trace contains an incomplete or duplicate source record");
    let parsedUrl;
    try { parsedUrl = new URL(source.url); } catch { fail(`provider trace source URL is invalid: ${source.id}`); }
    if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password || [...parsedUrl.searchParams.keys()].some((key) => /(?:token|key|auth|signature|credential|password)/i.test(key))) fail(`provider trace source URL may expose credentials: ${source.id}`);
    sourceIds.add(source.id);
  }
  return totalCostUsd;
}

function normalizeForLeakScan(value) {
  return String(value).normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "");
}

function neutralizeString(value) {
  let neutral = value;
  for (const [pattern, replacement] of IDENTITY_REPLACEMENTS) neutral = neutral.replace(pattern, replacement);
  neutral = neutral
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s)<>'"]+/giu, "source-link")
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/gu, "freshness-date")
    .replace(/\$\d+(?:\.\d+)?\b/gu, "cost-redacted")
    .replace(/\b\d+(?:\.\d+)?\s*(?:ms|milliseconds?|seconds?)\b/giu, "duration-redacted")
    .replace(/\/Users\/[^\s)<>'"]+/gu, "evidence-path")
    .replace(/\bsites\/[A-Za-z0-9_-]+\//gu, "evidence/");
  return neutral;
}

function neutralizeValue(value, contextKey = "") {
  if (typeof value === "string") {
    if (["evidencePath", "screenshotPaths", "extractedArtifactPaths", "contractPath", "generatedCssPath"].includes(contextKey)) {
      return `evidence://${path.posix.basename(value.replaceAll("\\", "/"))}`;
    }
    return neutralizeString(value);
  }
  if (Array.isArray(value)) return value.map((entry) => neutralizeValue(entry, contextKey));
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
    if (BLOCKED_METADATA_KEYS.has(normalizedKey)) continue;
    if (["sourceurl", "url", "previewimageurl"].includes(normalizedKey)) continue;
    const neutralKey = NEUTRAL_KEY_NAMES.get(key) ?? key;
    output[neutralKey] = neutralizeValue(nested, neutralKey);
  }
  if (contextKey === "sources" || ("id" in output && "confidence" in output)) {
    output.freshnessClass ??= "captured-for-run";
  }
  return output;
}

function validateNoIdentityLeak(name, bytes) {
  const text = decodeUtf8(bytes, name);
  const normalized = normalizeForLeakScan(text);
  for (const term of NORMALIZED_BLOCKED_TERMS) {
    if (term && normalized.includes(term)) fail(`${name} leaks blinded identity or coordinator metadata`);
  }
}

function validatePngWithoutMetadata(name, bytes, responsiveEvidence) {
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) fail(`${name} must be a PNG screenshot`);
  let offset = PNG_SIGNATURE.length;
  let sawEnd = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail(`${name} has a truncated PNG chunk`);
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const end = offset + 12 + length;
    if (end > bytes.length) fail(`${name} has an invalid PNG chunk length`);
    if (type === "IHDR") {
      if (length !== 13) fail(`${name} has an invalid PNG IHDR`);
      const area = name.match(/^screenshots\/(desktop|tablet|mobile)\.png$/)?.[1];
      const policy = area && responsiveEvidence?.[area];
      if (!policy || bytes.readUInt32BE(offset + 8) !== policy.width || bytes.readUInt32BE(offset + 12) < policy.minimumHeight) fail(`${name} does not match the frozen responsive viewport`);
    }
    if (["tEXt", "zTXt", "iTXt", "eXIf"].includes(type)) fail(`${name} contains prohibited screenshot metadata`);
    if (type === "IEND") {
      if (length !== 0 || end !== bytes.length) fail(`${name} has trailing bytes after IEND`);
      sawEnd = true;
      break;
    }
    offset = end;
  }
  if (!sawEnd) fail(`${name} is missing PNG IEND`);
}

function validateArtifactShapes(artifacts, responsiveEvidence) {
  if (!artifacts || typeof artifacts !== "object" || Array.isArray(artifacts)) fail("adapter artifacts must be an object");
  const names = Object.keys(artifacts).sort();
  if (!sameStrings(names, [...PRESENTATION_FILES].sort())) fail("adapter artifact allowlist is missing, partial, or unexpected");
  const requireObject = (name) => {
    const value = artifacts[name];
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be a JSON object`);
    return value;
  };
  const business = requireObject("business-intelligence.json");
  if (business.kind !== "business-intelligence") fail("business-intelligence.json has the wrong kind");
  const ledger = requireObject("design-research-ledger.json");
  if (!ledger.businessIntelligence || !ledger.referoDesignEvidence) fail("design-research-ledger.json must retain separated business and design-reference evidence");
  if (typeof artifacts["DESIGN.md"] !== "string" || !artifacts["DESIGN.md"].trim()) fail("DESIGN.md must be nonempty text");
  if (!Array.isArray(requireObject("token-inventory.json").tokens) || artifacts["token-inventory.json"].tokens.length === 0) fail("token-inventory.json is incomplete");
  if (!Array.isArray(requireObject("tailwind-plan.json").themeMappings) || artifacts["tailwind-plan.json"].themeMappings.length === 0) fail("tailwind-plan.json is incomplete");
  if (!requireObject("css-architecture.json").styleScopes) fail("css-architecture.json is incomplete");
  const manifest = requireObject("site-manifest.json");
  if (manifest.complete !== true) fail("site-manifest.json is not complete");
  if (typeof artifacts["site/index.html"] !== "string" || !artifacts["site/index.html"].trim()) fail("site/index.html must be nonempty text");
  if (typeof artifacts["site/styles.css"] !== "string" || !artifacts["site/styles.css"].trim()) fail("site/styles.css must be nonempty text");
  for (const name of ["screenshots/desktop.png", "screenshots/tablet.png", "screenshots/mobile.png"]) {
    if (!Buffer.isBuffer(artifacts[name])) fail(`${name} must be binary PNG bytes`);
    validatePngWithoutMetadata(name, artifacts[name], responsiveEvidence);
  }
  const checks = requireObject("visual-qa.json").checks;
  if (!Array.isArray(checks) || ["desktop", "tablet", "mobile"].some((area) => !checks.some((check) => check?.area === area && check.status === "pass" && check.evidencePath))) fail("visual-qa.json lacks passing three-width evidence");
}

function artifactBytes(artifacts, responsiveEvidence) {
  validateArtifactShapes(artifacts, responsiveEvidence);
  const output = new Map();
  for (const name of PRESENTATION_FILES) {
    if (name.endsWith(".png")) {
      validatePngWithoutMetadata(name, artifacts[name], responsiveEvidence);
      output.set(name, Buffer.from(artifacts[name]));
      continue;
    }
    const neutralized = ["DESIGN.md", "site/index.html", "site/styles.css"].includes(name) ? neutralizeString(artifacts[name]) : neutralizeValue(artifacts[name]);
    const bytes = typeof neutralized === "string" ? Buffer.from(neutralized.endsWith("\n") ? neutralized : `${neutralized}\n`, "utf8") : jsonBytes(neutralized);
    validateNoIdentityLeak(name, bytes);
    output.set(name, bytes);
  }
  return output;
}

async function siblingProvenance(directory, pathId) {
  const sibling = pathId === "path-a" ? "path-b" : "path-a";
  try {
    return await readJson(path.join(directory, "artifacts", sibling, "provenance.json"), `${sibling} provenance`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("is unreadable") && error.message.includes("ENOENT")) return undefined;
    throw error;
  }
}

async function loadOrRecordSharedAuthorization(directory, authorization) {
  const file = path.join(directory, "live-authorization.json");
  const expectedHash = sha256(stableJson(authorization));
  try {
    const existing = await readJson(file, "shared live authorization");
    if (existing.recordSha256 !== expectedHash || stableJson(existing.authorization) !== stableJson(authorization)) fail("sibling path used a different shared live authorization");
    return expectedHash;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("is unreadable")) throw error;
  }
  const record = { schemaVersion: 1, authorization, recordSha256: expectedHash };
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await writeExclusiveAtomic(temporary, jsonBytes(record));
  try {
    await fs.link(temporary, file);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      const existing = await readJson(file, "shared live authorization");
      if (existing.recordSha256 !== expectedHash || stableJson(existing.authorization) !== stableJson(authorization)) fail("sibling path used a different shared live authorization");
    } else throw error;
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return expectedHash;
}

function builderModel(trace) {
  const models = trace.models.filter((entry) => entry?.stage === "builder");
  if (models.length !== 1) fail("provider trace must contain exactly one downstream builder model record");
  return { providerId: models[0].providerId ?? "", modelId: models[0].modelId };
}

async function publishDirectory(parent, name, files) {
  await fs.mkdir(parent, { recursive: true });
  const destination = path.join(parent, name);
  try {
    await fs.lstat(destination);
    fail(`${name} artifact set already exists and is immutable`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("immutable")) throw error;
    if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
  }
  const temporary = path.join(parent, `.${name}.${crypto.randomUUID()}.tmp`);
  await fs.mkdir(temporary, { mode: 0o700 });
  try {
    for (const [file, bytes] of files) {
      const target = path.join(temporary, file);
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const handle = await fs.open(target, "wx", 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    }
    const written = [];
    async function collect(directory, relative = "") {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const next = path.join(relative, entry.name);
        if (entry.isDirectory()) await collect(path.join(directory, entry.name), next);
        else if (entry.isFile()) written.push(next.replaceAll(path.sep, "/"));
        else fail("atomic publication staging contains a non-regular artifact");
      }
    }
    await collect(temporary);
    written.sort();
    if (!sameStrings(written, [...REQUIRED_FILES].sort())) fail("atomic publication staging does not contain exactly the frozen v2 artifacts");
    try {
      await fs.rename(temporary, destination);
    } catch (error) {
      if (error && typeof error === "object" && ["EEXIST", "ENOTEMPTY"].includes(error.code)) fail(`${name} artifact set already exists and is immutable`);
      throw error;
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
  return destination;
}

async function withProducerLock(runDirectory, callback) {
  const lock = path.join(runDirectory, ".baseline-live-producer.lock");
  try {
    await fs.mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("another baseline producer is active, or its stale lock requires coordinator review");
    }
    throw error;
  }
  try {
    return await callback();
  } finally {
    await fs.rm(lock, { recursive: true, force: true });
  }
}

function provenanceFromTrace({ trace, pathId, manifestHash, verified, constants, outputHashes, authorization, authorizationSha256, totalCostUsd, aggregateCostUsd }) {
  return {
    schemaVersion: 1,
    pathId,
    status: "completed",
    runManifestSha256: manifestHash,
    frozenContract: { path: CONTRACT_PATH, sha256: verified.contractSha256 },
    frozenInputs: verified.contract.inputs,
    briefSha256: verified.briefSha256,
    sourceCommit: trace.sourceCommit,
    sourceRunId: trace.recordedRunId,
    authorization: {
      scope: authorization.scope,
      approvedBy: authorization.approvedBy,
      approvedAt: authorization.approvedAt,
      maxCostUsd: authorization.maxCostUsd,
      allowPaidFallback: authorization.allowPaidFallback,
      recordSha256: authorizationSha256,
    },
    traceSha256: sha256(stableJson(trace)),
    startedAt: trace.startedAt,
    finishedAt: trace.finishedAt,
    prompts: trace.prompts,
    models: trace.models,
    toolCalls: trace.toolCalls,
    sources: trace.sources,
    outputHashes,
    meteredCalls: trace.meteredCalls,
    totalMeteredCostUsd: totalCostUsd,
    aggregateRunMeteredCostUsd: aggregateCostUsd,
    repairRounds: trace.repairRounds ?? 0,
    downstreamConstants: constants,
  };
}

export async function produceBaselinePath({ root = SCRIPT_ROOT, runId, pathId, authorization, adapter }) {
  validatePathId(pathId);
  validateAuthorization(authorization, { runId, pathId });
  if (!adapter || typeof adapter.produce !== "function") fail("an injectable provider adapter is required");
  const verified = await verifyFrozenContract(root);
  const prepared = await loadPreparedRun(root, runId, verified.contractSha256);
  return withProducerLock(prepared.directory, async () => {
    const authorizationSha256 = await loadOrRecordSharedAuthorization(prepared.directory, authorization);
    const request = {
      schemaVersion: 2,
      runId,
      pathId,
      runManifestSha256: prepared.manifestHash,
      contractSha256: verified.contractSha256,
      briefSha256: verified.briefSha256,
      brief: verified.brief,
      credentialsRequested: false,
    };
    const produced = await adapter.produce(request);
    const totalCostUsd = validateTrace(produced?.trace, { pathId, authorization });
    const constants = await downstreamConstants(root, verified, produced.trace.sourceCommit);
    request.downstreamConstants = constants;
    if (produced.downstreamConstants && stableJson(produced.downstreamConstants) !== stableJson(constants)) fail("adapter used downstream constants that do not match the producing source commit");
    const bytes = artifactBytes(produced?.artifacts, verified.contract.responsiveEvidence);
    const outputHashes = PRESENTATION_FILES.map((name) => ({ path: name, sha256: sha256(bytes.get(name)) }));
    const sibling = await siblingProvenance(prepared.directory, pathId);
    const aggregateCostUsd = totalCostUsd + (sibling?.totalMeteredCostUsd ?? 0);
    if (aggregateCostUsd > authorization.maxCostUsd + Number.EPSILON) fail(`aggregate recorded metered cost $${aggregateCostUsd.toFixed(4)} exceeds authorized run maximum $${authorization.maxCostUsd.toFixed(4)}`);
    if (sibling) {
      if (stableJson(sibling.downstreamConstants) !== stableJson(constants)) fail("downstream constants differ between paths");
      if (stableJson(builderModel(sibling)) !== stableJson(builderModel(produced.trace))) fail("downstream builder model differs between paths");
      if (sibling.sourceCommit !== produced.trace.sourceCommit) fail("producer source commit differs between paths");
      if (sibling.authorization?.recordSha256 !== authorizationSha256) fail("sibling provenance has a different authorization record");
    }
    const provenance = provenanceFromTrace({ trace: produced.trace, pathId, manifestHash: prepared.manifestHash, verified, constants, outputHashes, authorization, authorizationSha256, totalCostUsd, aggregateCostUsd });
    bytes.set("provenance.json", jsonBytes(provenance));
    const directory = await publishDirectory(path.join(prepared.directory, "artifacts"), pathId, bytes);
    return { directory, runManifestSha256: prepared.manifestHash, provenance };
  });
}

function assertObjectEqual(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) fail(`current-pipeline intake differs from frozen brief: ${label}`);
}

function validatePathAIntake(intake, brief) {
  const expected = {
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
  };
  for (const [key, value] of Object.entries(expected)) assertObjectEqual(intake[key], value, key);
  assertObjectEqual(intake.research, { enabled: true, businessIntelligence: true, referoDesignEvidence: true, allowPaidFirecrawlFallback: false }, "research");
  assertObjectEqual(intake.uploads ?? [], [], "uploads");
}

function approvedArtifact(run, artifactType) {
  const matches = (run.evidenceWorkflow?.artifacts ?? []).filter((entry) => entry.artifactType === artifactType);
  const latest = matches.sort((left, right) => right.version - left.version)[0];
  if (!latest || latest.approvalTransitions?.at(-1)?.state !== "approved") fail(`current-pipeline ${artifactType} is not approved`);
  return latest;
}

export function createPathAAdapter({ root = SCRIPT_ROOT, sourceRunId, trace }) {
  return {
    async produce(request) {
      if (request.pathId !== "path-a") fail("Path A adapter can only produce path-a");
      if (!/^[A-Za-z0-9_-]{4,40}$/.test(sourceRunId ?? "")) fail("invalid current-pipeline source run id");
      const sourceRoot = rootPath(root, path.join("sites", sourceRunId));
      await assertRealPathContained(rootPath(root, "sites"), sourceRoot, "current-pipeline source run", "sites root");
      const [run, intake] = await Promise.all([
        readJson(path.join(sourceRoot, "run.json"), "current-pipeline run.json"),
        readJson(path.join(sourceRoot, "intake.json"), "current-pipeline intake.json"),
      ]);
      if (run.id !== sourceRunId || run.pipelineVersion !== "evidence-gated-v2" || run.stages?.built?.status !== "done" || run.evidenceWorkflow?.currentStage !== "build") fail("current-pipeline source run is not a completed evidence-gated-v2 build");
      validatePathAIntake(intake, request.brief);
      const approved = Object.fromEntries(REQUIRED_APPROVED_TYPES.map((type) => [type, approvedArtifact(run, type)]));
      const contractPath = approved["design-contract"].artifact?.contractPath;
      if (typeof contractPath !== "string") fail("approved design contract path is missing");
      const designFile = rootPath(sourceRoot, contractPath);
      await assertRealPathContained(sourceRoot, designFile, "approved DESIGN.md", "current-pipeline source run");
      const designBytes = await readRegularFile(designFile, "approved DESIGN.md");
      const declaredContractHash = approved["design-contract"].artifact?.contractSha256;
      if (!/^[a-f0-9]{64}$/.test(declaredContractHash ?? "") || sha256(designBytes) !== declaredContractHash) fail("approved DESIGN.md hash mismatch");
      const sourceLinks = [
        [approved["design-contract"].artifact?.sourceLedgerVersion, approved.ledger.version, "design contract to ledger"],
        [approved["token-inventory"].artifact?.sourceContractVersion, approved["design-contract"].version, "token inventory to design contract"],
        [approved["tailwind-plan"].artifact?.sourceTokenInventoryVersion, approved["token-inventory"].version, "Tailwind plan to token inventory"],
        [approved["css-architecture"].artifact?.sourceTailwindPlanVersion, approved["tailwind-plan"].version, "CSS architecture to Tailwind plan"],
        [approved["visual-qa"].artifact?.sourceCssArchitectureVersion, approved["css-architecture"].version, "visual QA to CSS architecture"],
      ];
      for (const [actual, expected, label] of sourceLinks) {
        if (actual !== expected) fail(`current-pipeline artifact lineage mismatch: ${label}`);
      }
      const siteManifest = await readJson(path.join(sourceRoot, "site/manifest.json"), "current-pipeline site manifest");
      if (!/^[a-f0-9]{40}$/.test(run.sourceCommit ?? "") || run.sourceCommit !== trace?.sourceCommit) fail("current-pipeline run is not bound to the trace producing source commit");
      if (!/^[a-f0-9]{40}$/.test(siteManifest.sourceCommit ?? "") || siteManifest.sourceCommit !== trace?.sourceCommit) fail("current-pipeline site manifest is not bound to the trace producing source commit");
      const siteHtml = await readRegularFile(path.join(sourceRoot, "site/index.html"), "current-pipeline site/index.html", MAX_ARTIFACT_BYTES);
      const siteCss = await readRegularFile(path.join(sourceRoot, "site/site.css"), "current-pipeline site/site.css", MAX_ARTIFACT_BYTES);
      const screenshotPaths = Object.fromEntries(["desktop", "tablet", "mobile"].map((area) => {
        const check = approved["visual-qa"].artifact?.checks?.find((entry) => entry?.area === area && entry.status === "pass");
        if (!check?.evidencePath || typeof check.evidencePath !== "string") fail(`current-pipeline ${area} screenshot evidence is missing`);
        return [area, rootPath(sourceRoot, check.evidencePath)];
      }));
      for (const [area, screenshot] of Object.entries(screenshotPaths)) {
        await assertRealPathContained(sourceRoot, screenshot, `current-pipeline ${area} screenshot`, "current-pipeline source run");
      }
      if (!trace || typeof trace !== "object") fail("Path A requires a separately captured provider trace");
      if (trace.recordedRunId !== sourceRunId) fail("Path A trace is bound to a different current-pipeline run");
      const modelIds = new Set((trace.models ?? []).map((entry) => entry?.modelId));
      for (const model of Object.values(run.modelSlugs ?? {})) {
        if (!modelIds.has(model)) fail(`Path A trace is missing current-pipeline model: ${model}`);
      }
      return {
        artifacts: {
          "business-intelligence.json": approved.ledger.artifact.businessIntelligence,
          "design-research-ledger.json": approved.ledger.artifact,
          "DESIGN.md": decodeUtf8(designBytes, "approved DESIGN.md"),
          "token-inventory.json": approved["token-inventory"].artifact,
          "tailwind-plan.json": approved["tailwind-plan"].artifact,
          "css-architecture.json": approved["css-architecture"].artifact,
          "site-manifest.json": siteManifest,
          "visual-qa.json": approved["visual-qa"].artifact,
          "site/index.html": decodeUtf8(siteHtml, "current-pipeline site/index.html"),
          "site/styles.css": decodeUtf8(siteCss, "current-pipeline site/site.css"),
          "screenshots/desktop.png": await readRegularFile(screenshotPaths.desktop, "current-pipeline desktop screenshot"),
          "screenshots/tablet.png": await readRegularFile(screenshotPaths.tablet, "current-pipeline tablet screenshot"),
          "screenshots/mobile.png": await readRegularFile(screenshotPaths.mobile, "current-pipeline mobile screenshot"),
        },
        trace: { ...trace, pathId: "path-a" },
      };
    },
  };
}

async function readHandoffArtifact(handoffRoot, relativePath, name) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) fail(`invalid handoff artifact path: ${name}`);
  const file = rootPath(handoffRoot, relativePath);
  await assertRealPathContained(handoffRoot, file, `handoff ${name}`);
  const bytes = await readRegularFile(file, `handoff ${name}`, name === "DESIGN.md" ? MAX_JSON_BYTES : MAX_ARTIFACT_BYTES);
  if (name.endsWith(".png")) return bytes;
  if (["DESIGN.md", "site/index.html", "site/styles.css"].includes(name)) return decodeUtf8(bytes, `handoff ${name}`);
  return parseJson(bytes, `handoff ${name}`);
}

export function createPathBHandoffAdapter(handoffFile) {
  return {
    async produce(request) {
      if (request.pathId !== "path-b") fail("Path B handoff adapter can only produce path-b");
      const absolute = path.resolve(handoffFile);
      const handoff = await readJson(absolute, "Path B handoff");
      if (handoff.schemaVersion !== 2 || handoff.pathId !== "path-b" || !handoff.artifacts || typeof handoff.artifacts !== "object") fail("Path B handoff is invalid");
      const names = Object.keys(handoff.artifacts).sort();
      if (!sameStrings(names, [...PRESENTATION_FILES].sort())) fail("Path B handoff artifact allowlist is missing, partial, or unexpected");
      if (handoff.runManifestSha256 !== request.runManifestSha256) fail("Path B handoff is not bound to this prepared run");
      if (handoff.contractSha256 !== request.contractSha256) fail("Path B handoff is not bound to this frozen contract");
      if (handoff.briefSha256 !== request.briefSha256) fail("Path B handoff is not bound to this frozen brief");
      if (!handoff.downstreamConstants || typeof handoff.downstreamConstants !== "object") fail("Path B handoff must retain producing-commit downstream constants");
      const handoffRoot = path.dirname(absolute);
      const entries = await Promise.all(PRESENTATION_FILES.map(async (name) => [name, await readHandoffArtifact(handoffRoot, handoff.artifacts[name], name)]));
      return { artifacts: Object.fromEntries(entries), trace: handoff.trace, downstreamConstants: handoff.downstreamConstants };
    },
  };
}

async function writeExclusiveAtomic(file, bytes) {
  const directory = path.dirname(file);
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.lstat(file);
    fail(`handoff request already exists and is immutable: ${file}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("immutable")) throw error;
    if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
  }
  const temporary = path.join(directory, `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  const handle = await fs.open(temporary, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try {
    try {
      await fs.link(temporary, file);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "EEXIST") fail(`handoff request already exists and is immutable: ${file}`);
      throw error;
    }
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function createDirectHandoffRequest({ root = SCRIPT_ROOT, runId, output, sourceCommit }) {
  if (!output) fail("an explicit --out path is required");
  const verified = await verifyFrozenContract(root);
  const prepared = await loadPreparedRun(root, runId, verified.contractSha256);
  if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? "")) fail("Path B request requires the 40-hex producing source commit");
  const constants = await downstreamConstants(root, verified, sourceCommit);
  const request = {
    schemaVersion: 2,
    pathId: "path-b",
    runId,
    runManifestSha256: prepared.manifestHash,
    contractSha256: verified.contractSha256,
    briefPath: BRIEF_PATH,
    briefSha256: verified.briefSha256,
    brief: verified.brief,
    downstreamConstants: constants,
    requiredArtifacts: PRESENTATION_FILES,
    requiredTraceFields: ["schemaVersion", "pathId", "status", "recordedRunId", "startedAt", "finishedAt", "sourceCommit", "prompts", "models", "toolCalls", "sources", "meteredCalls", "repairRounds"],
    handoffTemplate: {
      schemaVersion: 2,
      pathId: "path-b",
      runManifestSha256: prepared.manifestHash,
      contractSha256: verified.contractSha256,
      briefSha256: verified.briefSha256,
      downstreamConstants: constants,
      artifacts: Object.fromEntries(PRESENTATION_FILES.map((name) => [name, `artifacts/${name}`])),
      trace: {
        schemaVersion: 1,
        pathId: "path-b",
        status: "completed",
        recordedRunId: "REPLACE_WITH_DIRECT_WORKFLOW_RUN_ID",
        startedAt: "REPLACE_WITH_ISO_TIMESTAMP",
        finishedAt: "REPLACE_WITH_ISO_TIMESTAMP",
        sourceCommit,
        prompts: [],
        models: [],
        toolCalls: [],
        sources: [],
        meteredCalls: [],
        repairRounds: 0,
      },
    },
    instructions: "Use the authenticated Refero MCP in the user-controlled session. Do not export or embed OAuth credentials. Return a path-b handoff JSON plus the thirteen regular artifact files. Record each provider/tool call and failure honestly. Use the frozen brief and the exact downstream constants; do not silently use a paid fallback.",
    credentialsRequested: false,
  };
  await writeExclusiveAtomic(path.resolve(output), jsonBytes(request));
  return request;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) fail(`missing value for ${key ?? "option"}`);
    if (key.slice(2) in options) fail(`duplicate option: ${key}`);
    options[key.slice(2)] = value;
  }
  if (!["verify", "request-path-b", "publish-path-a", "publish-path-b"].includes(command)) fail("usage: baseline-live-runner.mjs verify|request-path-b|publish-path-a|publish-path-b [options]");
  return { command, options };
}

async function loadAuthorization(file) {
  if (!file) fail("--authorization-file is required");
  return readJson(path.resolve(file), "live authorization file", MAX_JSON_BYTES);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "verify") {
    const verified = await verifyFrozenContract();
    console.log(JSON.stringify({ status: "VALID", contractSha256: verified.contractSha256, briefSha256: verified.briefSha256 }));
    return;
  }
  const runId = validateRunId(options["run-id"]);
  if (command === "request-path-b") {
    const request = await createDirectHandoffRequest({ runId, output: options.out, sourceCommit: options["source-commit"] });
    console.log(JSON.stringify({ status: "HANDOFF_REQUEST_CREATED", runId, pathId: request.pathId, output: path.resolve(options.out) }));
    return;
  }
  const authorization = await loadAuthorization(options["authorization-file"]);
  let pathId;
  let adapter;
  if (command === "publish-path-a") {
    pathId = "path-a";
    const trace = await readJson(path.resolve(options.trace ?? ""), "Path A provider trace");
    adapter = createPathAAdapter({ sourceRunId: options["source-run-id"], trace });
  } else {
    pathId = "path-b";
    if (!options.handoff) fail("--handoff is required");
    adapter = createPathBHandoffAdapter(options.handoff);
  }
  const result = await produceBaselinePath({ runId, pathId, authorization, adapter });
  console.log(JSON.stringify({ status: "PUBLISHED", runId, pathId, directory: path.relative(SCRIPT_ROOT, result.directory), runManifestSha256: result.runManifestSha256 }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
