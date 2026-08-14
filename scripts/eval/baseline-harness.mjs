#!/usr/bin/env node
/**
 * Offline-only coordinator for the frozen Path A vs direct-Refero comparison.
 * It validates bytes and evidence, but never reads credentials or calls a provider.
 */
import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT_PATH = "docs/eval/baseline/evaluation-contract-v2.json";
const LOCK_PATH = "docs/eval/baseline/evaluation-contract-v2.lock.json";
const RUNS_PATH = "docs/eval/baseline/runs";
const PROVENANCE_FILE = "provenance.json";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const REQUIRED_PROVENANCE_FIELDS = [
  "pathId",
  "status",
  "runManifestSha256",
  "prompts",
  "models",
  "toolCalls",
  "sources",
  "outputHashes",
  "meteredCalls",
];

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function seededOrder(seed, values) {
  let state = 2166136261;
  for (const char of seed) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619) >>> 0;
  }
  const next = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const ordered = [...values];
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
  }
  return ordered;
}

function fail(message) {
  throw new Error(message);
}

function rootPath(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) fail(`path escapes root: ${relativePath}`);
  return resolved;
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readRegularFile(file, label = file) {
  let linkStat;
  try {
    linkStat = await fs.lstat(file);
  } catch (error) {
    fail(`${label} is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (linkStat.isSymbolicLink() || !linkStat.isFile()) fail(`${label} must be a regular non-symlink file`);
  let handle;
  try {
    handle = await fs.open(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = await handle.stat();
    if (!before.isFile()) fail(`${label} must be a regular file`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      fail(`${label} changed while it was being read`);
    }
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) throw error;
    fail(`${label} is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await handle?.close();
  }
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`invalid JSON at ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readJson(file, label = file) {
  return parseJsonBytes(await readRegularFile(file, label), label);
}

async function readFileHash(file) {
  return sha256(await readRegularFile(file));
}

async function writeFileExclusive(file, bytes) {
  const handle = await fs.open(file, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeJsonExclusive(file, value) {
  await writeFileExclusive(file, jsonBytes(value));
}

async function atomicWriteImmutable(file, bytes, description) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try {
    await writeFileExclusive(temporary, bytes);
    try {
      await fs.link(temporary, file);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "EEXIST") fail(`${description} already exists and is immutable`);
      throw error;
    }
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function sameStrings(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function isScreenshot(name) {
  return /^screenshots\/(desktop|tablet|mobile)\.png$/.test(name);
}

function validateScreenshot(name, bytes, responsiveEvidence) {
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return `${name} must be a PNG screenshot`;
  let offset = PNG_SIGNATURE.length;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return `${name} has a truncated PNG chunk`;
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const end = offset + length + 12;
    if (end > bytes.length) return `${name} has an invalid PNG chunk length`;
    if (type === "IHDR") {
      const area = name.match(/^screenshots\/(desktop|tablet|mobile)\.png$/)?.[1];
      const policy = area && responsiveEvidence?.[area];
      if (length !== 13 || !policy || bytes.readUInt32BE(offset + 8) !== policy.width || bytes.readUInt32BE(offset + 12) < policy.minimumHeight) return `${name} does not match the frozen responsive viewport`;
    }
    if (["tEXt", "zTXt", "iTXt", "eXIf"].includes(type)) return `${name} contains prohibited screenshot metadata`;
    if (type === "IEND") return length === 0 && end === bytes.length ? undefined : `${name} has trailing bytes after IEND`;
    offset = end;
  }
  return `${name} is missing PNG IEND`;
}

async function listFilesRecursively(directory, relative = "") {
  const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const next = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) fail(`${next} must not be a symlink`);
    if (entry.isDirectory()) result.push(...await listFilesRecursively(directory, next));
    else if (entry.isFile()) result.push(next.replaceAll(path.sep, "/"));
    else fail(`${next} must be a regular file`);
  }
  return result.sort();
}

export function validateRubric(rubric, requiredAreas, minimumEvaluators) {
  const errors = [];
  if (!rubric.includes("Status: frozen before the controlled comparison run.")) {
    errors.push("rubric is not marked frozen before the controlled comparison");
  }
  for (const area of requiredAreas) {
    if (!rubric.includes(`| ${area} |`)) errors.push(`rubric is missing area: ${area}`);
  }
  if (!rubric.includes("Automatic rejection:")) errors.push("rubric is missing automatic rejection rules");
  if (!rubric.includes("randomized A/B labels")) errors.push("rubric is missing blinded evaluator instructions");
  if (!rubric.includes(`${minimumEvaluators} distinct human evaluators`)) errors.push("rubric is missing the distinct human-evaluator gate");
  return errors;
}

export async function verifyContract(root = SCRIPT_ROOT) {
  const contractFile = rootPath(root, CONTRACT_PATH);
  const lockFile = rootPath(root, LOCK_PATH);
  const [contractBytes, contract, lock] = await Promise.all([
    readRegularFile(contractFile, CONTRACT_PATH),
    readJson(contractFile, CONTRACT_PATH),
    readJson(lockFile, LOCK_PATH),
  ]);
  const errors = [];
  if (contract.status !== "frozen") errors.push("contract status must be frozen");
  if (contract.hashAlgorithm !== "sha256") errors.push("contract must use sha256");
  if (lock.contractPath !== CONTRACT_PATH || lock.sha256 !== sha256(contractBytes)) errors.push("contract SHA-256 does not match its lock");
  if (!Array.isArray(contract.inputs) || contract.inputs.length < 2) errors.push("contract must declare frozen inputs");
  for (const input of contract.inputs ?? []) {
    if (!input.path || !/^[a-f0-9]{64}$/.test(input.sha256 ?? "")) {
      errors.push(`invalid input declaration: ${input.path ?? "unknown"}`);
      continue;
    }
    const actual = await readFileHash(rootPath(root, input.path));
    if (actual !== input.sha256) errors.push(`input hash mismatch: ${input.path}`);
  }
  const rubricInput = (contract.inputs ?? []).find((input) => input.path.endsWith("rubric-v2.md"));
  if (!rubricInput) {
    errors.push("contract must include a rubric input");
  } else {
    const rubric = (await readRegularFile(rootPath(root, rubricInput.path), rubricInput.path)).toString("utf8");
    errors.push(...validateRubric(rubric, contract.requiredRubricAreas ?? [], contract.humanGate?.minimumEvaluators));
  }
  const briefInput = (contract.inputs ?? []).find((input) => input.path.endsWith("brief-v2.json"));
  if (!briefInput) {
    errors.push("contract must include a brief input");
  } else {
    const brief = await readJson(rootPath(root, briefInput.path), briefInput.path);
    if (!sameStrings(brief.requiredArtifacts, contract.requiredArtifacts)) errors.push("brief and contract requiredArtifacts must match exactly");
  }
  const expectedPresentation = (contract.requiredArtifacts ?? []).filter((name) => name !== PROVENANCE_FILE);
  if (!sameStrings(expectedPresentation, contract.requiredPresentationArtifacts)) errors.push("requiredPresentationArtifacts must equal requiredArtifacts excluding provenance.json");
  if (!Array.isArray(contract.blinding?.blockedTerms) || contract.blinding.blockedTerms.length < 12) errors.push("blinding contract needs a complete blocked-term list");
  if (contract.liveExecution?.permittedByThisHarness !== false) errors.push("harness must remain offline-only");
  if (contract.humanGate?.required !== true || contract.humanGate?.minimumEvaluators !== 2) errors.push("contract must require two human evaluators");
  return { contract, contractSha256: sha256(contractBytes), errors };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) fail(`missing value for ${key}`);
    if (key.slice(2) in options) fail(`duplicate option: ${key}`);
    options[key.slice(2)] = value;
    index += 1;
  }
  if (!command || !["verify", "prepare", "assemble-blind", "score-template", "unblind"].includes(command)) {
    fail("usage: baseline-harness.mjs verify|prepare|assemble-blind|score-template|unblind [options]");
  }
  return { command, options };
}

function validateRunId(runId) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(runId ?? "")) fail("--run-id must be lowercase letters, numbers, and hyphens");
  return runId;
}

function runDirectory(root, runId) {
  return rootPath(root, path.join(RUNS_PATH, validateRunId(runId)));
}

async function publishDirectory(parent, name, populate, description) {
  await fs.mkdir(parent, { recursive: true });
  const destination = path.join(parent, name);
  try {
    await fs.lstat(destination);
    fail(`${description} already exists and is immutable`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(description)) throw error;
    if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
  }
  const temporary = path.join(parent, `.${name}.${crypto.randomUUID()}.tmp`);
  await fs.mkdir(temporary, { recursive: false, mode: 0o700 });
  try {
    await populate(temporary);
    try {
      await fs.rename(temporary, destination);
    } catch (error) {
      if (error && typeof error === "object" && ["EEXIST", "ENOTEMPTY"].includes(error.code)) {
        fail(`${description} already exists and is immutable`);
      }
      throw error;
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
  return destination;
}

export async function prepareRun({ root = SCRIPT_ROOT, runId, seed, createdAt = new Date().toISOString() }) {
  if (!seed) fail("--seed is required to reproduce blind presentation order");
  const verification = await verifyContract(root);
  if (verification.errors.length) fail(`frozen contract invalid:\n- ${verification.errors.join("\n- ")}`);
  const orderedPathIds = seededOrder(seed, verification.contract.paths.map((entry) => entry.id));
  const blindArtifacts = orderedPathIds.map((pathId, index) => ({
    blindId: `artifact-${String(index + 1).padStart(2, "0")}`,
    presentationOrder: index + 1,
    pathId,
  }));
  const manifest = {
    schemaVersion: 1,
    runId,
    status: "BLOCKED",
    createdAt,
    executionMode: "offline-plan-only",
    contract: { path: CONTRACT_PATH, sha256: verification.contractSha256, inputHashes: verification.contract.inputs },
    blinding: {
      seedSha256: sha256(seed),
      algorithm: "fnv1a-mulberry32-fisher-yates-v1",
      presentationOrder: blindArtifacts.map(({ blindId, presentationOrder }) => ({ blindId, presentationOrder })),
    },
    paths: verification.contract.paths.map((entry) => ({
      id: entry.id,
      status: "BLOCKED",
      blocker: "Live Refero/OpenRouter execution is outside this offline harness; OAuth and ZS Vault authorization have not been attested.",
    })),
    provenance: {
      coordinator: "scripts/eval/baseline-harness.mjs",
      providerCalls: 0,
      credentialsRead: false,
      result: "No live artifacts or scores were created.",
    },
  };
  const manifestBytes = jsonBytes(manifest);
  const manifestHash = sha256(manifestBytes);
  const parent = rootPath(root, RUNS_PATH);
  const directory = await publishDirectory(parent, validateRunId(runId), async (temporary) => {
    await writeFileExclusive(path.join(temporary, "run-manifest.json"), manifestBytes);
    await writeJsonExclusive(path.join(temporary, "unblinding.json"), {
      schemaVersion: 1,
      runId,
      runManifestSha256: manifestHash,
      visibility: "coordinator-only; never provide this file to blinded evaluators",
      seed,
      mapping: blindArtifacts,
    });
  }, `run ${runId}`);
  return { directory, manifest, manifestHash };
}

async function readRun(root, runId) {
  const directory = runDirectory(root, runId);
  const manifestFile = path.join(directory, "run-manifest.json");
  const manifestBytes = await readRegularFile(manifestFile, "run-manifest.json");
  const manifest = parseJsonBytes(manifestBytes, "run-manifest.json");
  const unblinding = await readJson(path.join(directory, "unblinding.json"), "unblinding.json");
  const manifestHash = sha256(manifestBytes);
  if (unblinding.runManifestSha256 !== manifestHash) fail("unblinding key is not bound to this run manifest");
  if (sha256(unblinding.seed ?? "") !== manifest.blinding?.seedSha256) fail("coordinator seed does not match the run manifest seed hash");
  return { directory, manifest, manifestHash, unblinding };
}

async function readArtifactSet(directory, contract, pathId) {
  const artifactDirectory = path.join(directory, "artifacts", pathId);
  const files = new Map();
  const errors = [];
  for (const name of contract.requiredArtifacts) {
    try {
      files.set(name, await readRegularFile(path.join(artifactDirectory, name), `${pathId} ${name}`));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length || !files.has(PROVENANCE_FILE)) return { files, errors };
  let provenance;
  try {
    provenance = parseJsonBytes(files.get(PROVENANCE_FILE), `${pathId} ${PROVENANCE_FILE}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { files, errors };
  }
  for (const field of REQUIRED_PROVENANCE_FIELDS) {
    if (!(field in provenance)) errors.push(`${pathId} provenance missing: ${field}`);
  }
  if (provenance.pathId !== pathId) errors.push(`${pathId} provenance pathId mismatch`);
  if (provenance.status !== "completed") errors.push(`${pathId} provenance is not completed`);
  for (const listField of ["prompts", "models", "toolCalls", "sources", "outputHashes", "meteredCalls"]) {
    if (!Array.isArray(provenance[listField])) errors.push(`${pathId} provenance ${listField} must be an array`);
  }
  const hasContent = (entry) => (typeof entry === "string" ? entry.trim().length > 0 : entry && typeof entry === "object" && Object.keys(entry).length > 0);
  if (!Array.isArray(provenance.prompts) || provenance.prompts.length === 0 || !provenance.prompts.every(hasContent)) errors.push(`${pathId} provenance prompts must contain nonempty records`);
  if (!Array.isArray(provenance.models) || provenance.models.length === 0 || !provenance.models.every(hasContent)) errors.push(`${pathId} provenance models must contain nonempty records`);
  if (Array.isArray(provenance.outputHashes)) {
    const hashes = new Map();
    for (const entry of provenance.outputHashes) {
      if (!entry || typeof entry.path !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) {
        errors.push(`${pathId} provenance contains an invalid output hash`);
        continue;
      }
      if (hashes.has(entry.path)) errors.push(`${pathId} provenance contains duplicate output hash: ${entry.path}`);
      hashes.set(entry.path, entry.sha256);
    }
    for (const name of contract.requiredPresentationArtifacts) {
      if (!hashes.has(name)) errors.push(`${pathId} provenance outputHashes missing: ${name}`);
      else if (files.has(name) && hashes.get(name) !== sha256(files.get(name))) errors.push(`${pathId} provenance output hash mismatch: ${name}`);
    }
    for (const name of hashes.keys()) {
      if (!contract.requiredPresentationArtifacts.includes(name)) errors.push(`${pathId} provenance outputHashes contains unexpected artifact: ${name}`);
    }
  }
  return { files, provenance, errors };
}

export async function validateCompletedArtifacts({ root = SCRIPT_ROOT, runId }) {
  const verification = await verifyContract(root);
  const run = await readRun(root, runId);
  const errors = [...verification.errors];
  const snapshots = new Map();
  for (const entry of verification.contract.paths) {
    const snapshot = await readArtifactSet(run.directory, verification.contract, entry.id);
    if (snapshot.provenance?.runManifestSha256 !== run.manifestHash) errors.push(`${entry.id} provenance is not bound to the frozen run`);
    errors.push(...snapshot.errors);
    snapshots.set(entry.id, snapshot.files);
  }
  if (run.manifest.executionMode !== "offline-plan-only") errors.push("unexpected run execution mode");
  return { errors, ...run, contract: verification.contract, contractSha256: verification.contractSha256, snapshots };
}

function normalizedLeakText(value) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function scanForIdentityLeaks(files, blockedTerms, responsiveEvidence) {
  const errors = [];
  for (const [name, bytes] of files) {
    if (isScreenshot(name)) {
      const error = validateScreenshot(name, bytes, responsiveEvidence);
      if (error) errors.push(error);
      continue;
    }
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      errors.push(`${name} is not valid UTF-8 and cannot enter the blind packet`);
      continue;
    }
    const normalized = normalizedLeakText(text);
    for (const term of blockedTerms) {
      if (normalized.includes(normalizedLeakText(term))) {
        errors.push(`${name} leaks blinded identity or run metadata: ${term}`);
        break;
      }
    }
  }
  return errors;
}

function presentationFiles(snapshot, contract) {
  return new Map(contract.requiredPresentationArtifacts.map((name) => [name, snapshot.get(name)]));
}

async function validateCurrentPacket(checked) {
  const presentation = path.join(checked.directory, "presentation");
  const packetBytes = await readRegularFile(path.join(presentation, "packet.json"), "presentation packet.json");
  const binding = await readJson(path.join(presentation, "packet-binding.json"), "presentation packet-binding.json");
  const packetHash = sha256(packetBytes);
  const packet = parseJsonBytes(packetBytes, "presentation packet.json");
  const errors = [];
  if (binding.packetSha256 !== packetHash) errors.push("presentation packet hash does not match its binding");
  if (binding.runManifestSha256 !== checked.manifestHash || packet.runManifestSha256 !== checked.manifestHash) errors.push("presentation packet is not bound to the current run manifest");
  if (packet.contractSha256 !== checked.contractSha256) errors.push("presentation packet is not bound to the frozen contract");
  const expectedBlindIds = checked.unblinding.mapping.map((entry) => entry.blindId);
  if (!sameStrings(packet.artifacts?.map((entry) => entry.blindId), expectedBlindIds)) errors.push("presentation packet artifact order does not match the frozen mapping");
  for (const artifact of packet.artifacts ?? []) {
    const mapping = checked.unblinding.mapping.find((entry) => entry.blindId === artifact.blindId);
    const directory = path.join(presentation, artifact.blindId);
    let entries = [];
    try {
      const directoryStat = await fs.lstat(directory);
      if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) errors.push(`${artifact.blindId} must be a regular directory`);
      entries = await listFilesRecursively(directory);
    } catch (error) {
      errors.push(`${artifact.blindId} is unreadable: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const expectedNames = [...checked.contract.requiredPresentationArtifacts].sort();
    if (!sameStrings(entries, expectedNames)) errors.push(`${artifact.blindId} contains files outside the frozen presentation allowlist`);
    const files = new Map();
    for (const record of artifact.files ?? []) {
      try {
        const bytes = await readRegularFile(path.join(directory, record.path), `${artifact.blindId} ${record.path}`);
        files.set(record.path, bytes);
        if (sha256(bytes) !== record.sha256) errors.push(`${artifact.blindId} packet hash mismatch: ${record.path}`);
        const sourceBytes = checked.snapshots.get(mapping?.pathId)?.get(record.path);
        if (!sourceBytes || sha256(sourceBytes) !== record.sha256) errors.push(`${artifact.blindId} no longer matches completed source artifact: ${record.path}`);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (!sameStrings((artifact.files ?? []).map((entry) => entry.path).sort(), expectedNames)) errors.push(`${artifact.blindId} packet file list is incomplete`);
    errors.push(...scanForIdentityLeaks(files, checked.contract.blinding.blockedTerms, checked.contract.responsiveEvidence).map((error) => `${artifact.blindId} ${error}`));
  }
  return { errors, packet, packetHash, presentation };
}

export async function assembleBlindPacket({ root = SCRIPT_ROOT, runId }) {
  const checked = await validateCompletedArtifacts({ root, runId });
  if (checked.errors.length) fail(`cannot assemble blind packet:\n- ${checked.errors.join("\n- ")}`);
  const artifactRecords = [];
  const snapshots = new Map();
  for (const entry of checked.unblinding.mapping) {
    const files = presentationFiles(checked.snapshots.get(entry.pathId), checked.contract);
    const leakErrors = scanForIdentityLeaks(files, checked.contract.blinding.blockedTerms, checked.contract.responsiveEvidence);
    if (leakErrors.length) fail(`cannot assemble blind packet:\n- ${entry.pathId} ${leakErrors.join(`\n- ${entry.pathId} `)}`);
    snapshots.set(entry.blindId, files);
    artifactRecords.push({
      blindId: entry.blindId,
      presentationOrder: entry.presentationOrder,
      files: [...files].map(([name, bytes]) => ({ path: name, sha256: sha256(bytes) })),
    });
  }
  const packet = {
    schemaVersion: 1,
    runId,
    status: "READY_FOR_TWO_HUMAN_BLIND_EVALUATORS",
    runManifestSha256: checked.manifestHash,
    contractSha256: checked.contractSha256,
    rubricPath: "docs/eval/baseline/rubric-v1.md",
    artifacts: artifactRecords,
    instructions: "Score every area before inspecting coordinator-only run, provenance, or unblinding files.",
  };
  const packetBytes = jsonBytes(packet);
  await publishDirectory(checked.directory, "presentation", async (temporary) => {
    for (const artifact of artifactRecords) {
      const directory = path.join(temporary, artifact.blindId);
      await fs.mkdir(directory, { mode: 0o700 });
      for (const record of artifact.files) {
        const target = path.join(directory, record.path);
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await writeFileExclusive(target, snapshots.get(artifact.blindId).get(record.path));
      }
    }
    await writeFileExclusive(path.join(temporary, "packet.json"), packetBytes);
    await writeJsonExclusive(path.join(temporary, "packet-binding.json"), {
      schemaVersion: 1,
      runManifestSha256: checked.manifestHash,
      packetSha256: sha256(packetBytes),
    });
  }, "presentation packet");
  return { ...packet, packetSha256: sha256(packetBytes) };
}

export function scoreTemplate({ runId, blindIds, rubricAreas, runManifestSha256, presentationPacketSha256, evaluatorSlot }) {
  return {
    schemaVersion: 1,
    runId,
    runManifestSha256,
    presentationPacketSha256,
    evaluatorSlot,
    evaluator: { id: "", name: "", scoredAt: "", attestation: "I scored these blinded artifacts independently before seeing the producer mapping." },
    scores: blindIds.map((blindId) => ({
      blindId,
      areas: Object.fromEntries(rubricAreas.map((area) => [area, { score: null, evidence: "" }])),
      findings: [],
    })),
  };
}

export function validateHumanScores(scores, { runId, blindIds, rubricAreas, runManifestSha256, presentationPacketSha256 }) {
  const errors = [];
  if (scores.runId !== runId) errors.push("scores are for another run");
  if (scores.runManifestSha256 !== runManifestSha256) errors.push("scores are not bound to this run manifest");
  if (scores.presentationPacketSha256 !== presentationPacketSha256) errors.push("scores are not bound to the current presentation packet");
  if (!scores.evaluator?.id?.trim()) errors.push("human evaluator ID is required");
  if (!scores.evaluator?.name?.trim()) errors.push("human evaluator name is required");
  if (!scores.evaluator?.scoredAt?.trim()) errors.push("human evaluator timestamp is required");
  if (!scores.evaluator?.attestation?.trim()) errors.push("human blind-scoring attestation is required");
  if (!Array.isArray(scores.scores) || scores.scores.length !== blindIds.length) {
    errors.push("one complete score entry is required for every blind artifact");
    return errors;
  }
  const byBlindId = new Map(scores.scores.map((entry) => [entry.blindId, entry]));
  if (byBlindId.size !== scores.scores.length) errors.push("duplicate blind artifact score entry");
  for (const blindId of blindIds) {
    const entry = byBlindId.get(blindId);
    if (!entry) {
      errors.push(`missing scores for ${blindId}`);
      continue;
    }
    for (const area of rubricAreas) {
      const score = entry.areas?.[area];
      if (!Number.isInteger(score?.score) || score.score < 0 || score.score > 4) errors.push(`${blindId} has invalid score for ${area}`);
      if (!score?.evidence?.trim()) errors.push(`${blindId} has no evidence for ${area}`);
    }
  }
  return errors;
}

export async function unblind({ root = SCRIPT_ROOT, runId, scoresFiles }) {
  if (!Array.isArray(scoresFiles) || scoresFiles.length !== 2) fail("exactly two evaluator score files are required");
  const resolvedScores = scoresFiles.map((file) => path.resolve(file));
  if (new Set(resolvedScores).size !== 2) fail("two distinct evaluator score files are required");
  const checked = await validateCompletedArtifacts({ root, runId });
  if (checked.errors.length) fail(`cannot unblind without real completed artifacts:\n- ${checked.errors.join("\n- ")}`);
  const currentPacket = await validateCurrentPacket(checked);
  if (currentPacket.errors.length) fail(`current presentation packet is invalid:\n- ${currentPacket.errors.join("\n- ")}`);
  const scoreRecords = [];
  const blindIds = checked.unblinding.mapping.map((entry) => entry.blindId);
  for (const file of resolvedScores) {
    const bytes = await readRegularFile(file, "evaluator score file");
    const scores = parseJsonBytes(bytes, "evaluator score file");
    const errors = validateHumanScores(scores, {
      runId,
      blindIds,
      rubricAreas: checked.contract.requiredRubricAreas,
      runManifestSha256: checked.manifestHash,
      presentationPacketSha256: currentPacket.packetHash,
    });
    if (errors.length) fail(`human score gate failed:\n- ${errors.join("\n- ")}`);
    scoreRecords.push({ scores, sha256: sha256(bytes) });
  }
  if (scoreRecords[0].scores.evaluator.id === scoreRecords[1].scores.evaluator.id || scoreRecords[0].scores.evaluator.name === scoreRecords[1].scores.evaluator.name) {
    fail("two distinct human evaluators are required");
  }
  const results = checked.unblinding.mapping.map((mapping) => {
    const evaluations = scoreRecords.map(({ scores, sha256: scoreSha256 }) => {
      const entry = scores.scores.find((score) => score.blindId === mapping.blindId);
      return {
        evaluatorId: scores.evaluator.id,
        scoreSha256,
        total: Object.values(entry.areas).reduce((total, area) => total + area.score, 0),
        areas: entry.areas,
        findings: entry.findings ?? [],
      };
    });
    return {
      pathId: mapping.pathId,
      blindId: mapping.blindId,
      evaluatorTotals: evaluations.map((entry) => entry.total),
      averageTotal: evaluations.reduce((sum, entry) => sum + entry.total, 0) / evaluations.length,
      evaluations,
    };
  });
  const record = {
    schemaVersion: 1,
    status: "UNBLINDED_TWO_HUMAN_SCORES_RECORDED",
    runId,
    runManifestSha256: checked.manifestHash,
    presentationPacketSha256: currentPacket.packetHash,
    evaluators: scoreRecords.map(({ scores, sha256: scoreSha256 }) => ({ ...scores.evaluator, scoreSha256 })),
    results,
    decision: "No routing or root-cause decision is implied. Complete the independent quality audit and decision log separately.",
  };
  await atomicWriteImmutable(path.join(checked.directory, "unblinded-results.json"), jsonBytes(record), "unblinded result");
  return record;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "verify") {
    const result = await verifyContract();
    if (result.errors.length) fail(`frozen contract invalid:\n- ${result.errors.join("\n- ")}`);
    console.log(JSON.stringify({ status: "VALID", contractSha256: result.contractSha256 }));
    return;
  }
  const runId = validateRunId(options["run-id"]);
  if (command === "prepare") {
    const result = await prepareRun({ runId, seed: options.seed });
    console.log(JSON.stringify({ status: "BLOCKED", run: path.relative(SCRIPT_ROOT, result.directory), runManifestSha256: result.manifestHash }));
    return;
  }
  if (command === "assemble-blind") {
    const packet = await assembleBlindPacket({ runId });
    console.log(JSON.stringify({ status: packet.status, runId, packetSha256: packet.packetSha256 }));
    return;
  }
  if (command === "score-template") {
    const slot = Number(options["evaluator-slot"]);
    if (![1, 2].includes(slot)) fail("--evaluator-slot must be 1 or 2");
    const checked = await validateCompletedArtifacts({ runId });
    if (checked.errors.length) fail(`cannot create score template:\n- ${checked.errors.join("\n- ")}`);
    const packet = await validateCurrentPacket(checked);
    if (packet.errors.length) fail(`current presentation packet is invalid:\n- ${packet.errors.join("\n- ")}`);
    const template = scoreTemplate({
      runId,
      blindIds: checked.unblinding.mapping.map((entry) => entry.blindId),
      rubricAreas: checked.contract.requiredRubricAreas,
      runManifestSha256: checked.manifestHash,
      presentationPacketSha256: packet.packetHash,
      evaluatorSlot: slot,
    });
    await atomicWriteImmutable(path.join(checked.directory, `scores.evaluator-${slot}.template.json`), jsonBytes(template), `evaluator ${slot} score template`);
    console.log(JSON.stringify({ status: "TEMPLATE_CREATED", runId, evaluatorSlot: slot }));
    return;
  }
  if (!options["scores-a"] || !options["scores-b"]) fail("--scores-a and --scores-b are required for unblind");
  const record = await unblind({ runId, scoresFiles: [options["scores-a"], options["scores-b"]] });
  console.log(JSON.stringify({ status: record.status, runId }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
