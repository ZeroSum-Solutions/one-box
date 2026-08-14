#!/usr/bin/env node
/**
 * Offline-only coordinator for the frozen Path A vs direct-Refero comparison.
 * It validates bytes and evidence, but never reads credentials or calls a provider.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT_PATH = "docs/eval/baseline/evaluation-contract-v1.json";
const LOCK_PATH = "docs/eval/baseline/evaluation-contract-v1.lock.json";
const RUNS_PATH = "docs/eval/baseline/runs";

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

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    fail(`invalid JSON at ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readFileHash(file) {
  return sha256(await fs.readFile(file));
}

export function validateRubric(rubric, requiredAreas) {
  const errors = [];
  if (!rubric.includes("Status: frozen before the controlled comparison run.")) {
    errors.push("rubric is not marked frozen before the controlled comparison");
  }
  for (const area of requiredAreas) {
    if (!rubric.includes(`| ${area} |`)) errors.push(`rubric is missing area: ${area}`);
  }
  if (!rubric.includes("Automatic rejection:")) errors.push("rubric is missing automatic rejection rules");
  if (!rubric.includes("randomized A/B labels")) errors.push("rubric is missing blinded evaluator instructions");
  return errors;
}

export async function verifyContract(root = SCRIPT_ROOT) {
  const contractFile = rootPath(root, CONTRACT_PATH);
  const lockFile = rootPath(root, LOCK_PATH);
  const [contractBytes, contract, lock] = await Promise.all([
    fs.readFile(contractFile),
    readJson(contractFile),
    readJson(lockFile),
  ]);
  const errors = [];
  if (contract.status !== "frozen") errors.push("contract status must be frozen");
  if (contract.hashAlgorithm !== "sha256") errors.push("contract must use sha256");
  if (lock.contractPath !== CONTRACT_PATH || lock.sha256 !== sha256(contractBytes)) {
    errors.push("contract SHA-256 does not match its lock");
  }
  if (!Array.isArray(contract.inputs) || contract.inputs.length < 2) errors.push("contract must declare frozen inputs");
  for (const input of contract.inputs ?? []) {
    if (!input.path || !/^[a-f0-9]{64}$/.test(input.sha256 ?? "")) {
      errors.push(`invalid input declaration: ${input.path ?? "unknown"}`);
      continue;
    }
    const actual = await readFileHash(rootPath(root, input.path));
    if (actual !== input.sha256) errors.push(`input hash mismatch: ${input.path}`);
  }
  const rubricInput = (contract.inputs ?? []).find((input) => input.path.endsWith("rubric-v1.md"));
  if (!rubricInput) {
    errors.push("contract must include a rubric input");
  } else {
    const rubric = await fs.readFile(rootPath(root, rubricInput.path), "utf8");
    errors.push(...validateRubric(rubric, contract.requiredRubricAreas ?? []));
  }
  if (contract.liveExecution?.permittedByThisHarness !== false) errors.push("harness must remain offline-only");
  if (contract.humanGate?.required !== true) errors.push("contract must require a human score gate");
  return { contract, contractSha256: sha256(contractBytes), errors };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) fail(`missing value for ${key}`);
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

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function prepareRun({ root = SCRIPT_ROOT, runId, seed, createdAt = new Date().toISOString() }) {
  if (!seed) fail("--seed is required to reproduce blind presentation order");
  const verification = await verifyContract(root);
  if (verification.errors.length) fail(`frozen contract invalid:\n- ${verification.errors.join("\n- ")}`);
  const directory = runDirectory(root, runId);
  try {
    await fs.access(directory);
    fail(`run already exists and is immutable: ${runId}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("run already exists")) throw error;
  }
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
    contract: {
      path: CONTRACT_PATH,
      sha256: verification.contractSha256,
      inputHashes: verification.contract.inputs,
    },
    blinding: {
      seed,
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
  const manifestHash = sha256(`${JSON.stringify(manifest, null, 2)}\n`);
  await fs.mkdir(directory, { recursive: true });
  await writeJson(path.join(directory, "run-manifest.json"), manifest);
  await writeJson(path.join(directory, "unblinding.json"), {
    schemaVersion: 1,
    runId,
    runManifestSha256: manifestHash,
    visibility: "coordinator-only; never provide this file to blinded evaluators",
    mapping: blindArtifacts,
  });
  return { directory, manifest, manifestHash };
}

async function readRun(root, runId) {
  const directory = runDirectory(root, runId);
  const manifestFile = path.join(directory, "run-manifest.json");
  const manifestBytes = await fs.readFile(manifestFile);
  const unblinding = await readJson(path.join(directory, "unblinding.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const manifestHash = sha256(manifestBytes);
  if (unblinding.runManifestSha256 !== manifestHash) fail("unblinding key is not bound to this run manifest");
  return { directory, manifest, manifestHash, unblinding };
}

export async function validateCompletedArtifacts({ root = SCRIPT_ROOT, runId }) {
  const verification = await verifyContract(root);
  const { directory, manifest, manifestHash } = await readRun(root, runId);
  const errors = [...verification.errors];
  for (const entry of verification.contract.paths) {
    const artifactDirectory = path.join(directory, "artifacts", entry.id);
    for (const name of verification.contract.requiredArtifacts) {
      try {
        await fs.access(path.join(artifactDirectory, name));
      } catch {
        errors.push(`${entry.id} missing required artifact: ${name}`);
      }
    }
    try {
      const provenance = await readJson(path.join(artifactDirectory, "provenance.json"));
      for (const field of REQUIRED_PROVENANCE_FIELDS) {
        if (!(field in provenance)) errors.push(`${entry.id} provenance missing: ${field}`);
      }
      if (provenance.pathId !== entry.id) errors.push(`${entry.id} provenance pathId mismatch`);
      if (provenance.status !== "completed") errors.push(`${entry.id} provenance is not completed`);
      if (provenance.runManifestSha256 !== manifestHash) errors.push(`${entry.id} provenance is not bound to the frozen run`);
      for (const listField of ["prompts", "models", "toolCalls", "sources", "outputHashes", "meteredCalls"]) {
        if (!Array.isArray(provenance[listField])) errors.push(`${entry.id} provenance ${listField} must be an array`);
      }
    } catch (error) {
      errors.push(`${entry.id} provenance unreadable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (manifest.executionMode !== "offline-plan-only") errors.push("unexpected run execution mode");
  return { errors, directory, manifest, manifestHash, contract: verification.contract };
}

export async function assembleBlindPacket({ root = SCRIPT_ROOT, runId }) {
  const checked = await validateCompletedArtifacts({ root, runId });
  if (checked.errors.length) fail(`cannot assemble blind packet:\n- ${checked.errors.join("\n- ")}`);
  const { unblinding } = await readRun(root, runId);
  const presentation = path.join(checked.directory, "presentation");
  await fs.mkdir(presentation, { recursive: true });
  const artifacts = [];
  for (const entry of unblinding.mapping) {
    const destination = path.join(presentation, entry.blindId);
    const source = path.join(checked.directory, "artifacts", entry.pathId);
    for (const artifact of checked.contract.requiredArtifacts.filter((name) => name !== "provenance.json")) {
      const text = (await fs.readFile(path.join(source, artifact), "utf8")).toLowerCase();
      const blocked = (checked.contract.blinding?.blockedTerms ?? []).find((term) => text.includes(term));
      if (blocked) fail(`${entry.pathId} ${artifact} leaks blinded producer identity: ${blocked}`);
    }
    await fs.cp(source, destination, {
      recursive: true,
      force: false,
      filter: (candidate) => path.basename(candidate) !== "provenance.json",
    });
    artifacts.push({ blindId: entry.blindId, presentationOrder: entry.presentationOrder, artifactDirectory: entry.blindId });
  }
  const packet = {
    schemaVersion: 1,
    runId,
    status: "READY_FOR_HUMAN_BLIND_SCORING",
    rubricPath: "docs/eval/baseline/rubric-v1.md",
    artifacts,
    instructions: "Do not inspect run-manifest.json, unblinding.json, or artifacts/path-*. Score every area and cite artifact or rendered screenshot evidence.",
  };
  await writeJson(path.join(presentation, "packet.json"), packet);
  return packet;
}

export function scoreTemplate({ runId, blindIds, rubricAreas, runManifestSha256 }) {
  return {
    schemaVersion: 1,
    runId,
    runManifestSha256,
    evaluator: { name: "", scoredAt: "", attestation: "I scored these blinded artifacts before seeing the producer mapping." },
    scores: blindIds.map((blindId) => ({
      blindId,
      areas: Object.fromEntries(rubricAreas.map((area) => [area, { score: null, evidence: "" }])),
      findings: [],
    })),
  };
}

export function validateHumanScores(scores, { runId, blindIds, rubricAreas, runManifestSha256 }) {
  const errors = [];
  if (scores.runId !== runId) errors.push("scores are for another run");
  if (scores.runManifestSha256 !== runManifestSha256) errors.push("scores are not bound to this run manifest");
  if (!scores.evaluator?.name?.trim()) errors.push("human evaluator name is required");
  if (!scores.evaluator?.scoredAt?.trim()) errors.push("human evaluator timestamp is required");
  if (!scores.evaluator?.attestation?.trim()) errors.push("human blind-scoring attestation is required");
  if (!Array.isArray(scores.scores) || scores.scores.length !== blindIds.length) {
    errors.push("one complete score entry is required for every blind artifact");
    return errors;
  }
  const byBlindId = new Map(scores.scores.map((entry) => [entry.blindId, entry]));
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

export async function unblind({ root = SCRIPT_ROOT, runId, scoresFile }) {
  const checked = await validateCompletedArtifacts({ root, runId });
  if (checked.errors.length) fail(`cannot unblind without real completed artifacts:\n- ${checked.errors.join("\n- ")}`);
  const { unblinding } = await readRun(root, runId);
  const scores = await readJson(path.resolve(scoresFile));
  const blindIds = unblinding.mapping.map((entry) => entry.blindId);
  const errors = validateHumanScores(scores, {
    runId,
    blindIds,
    rubricAreas: checked.contract.requiredRubricAreas,
    runManifestSha256: checked.manifestHash,
  });
  if (errors.length) fail(`human score gate failed:\n- ${errors.join("\n- ")}`);
  const results = scores.scores.map((entry) => ({
    pathId: unblinding.mapping.find((mapping) => mapping.blindId === entry.blindId).pathId,
    blindId: entry.blindId,
    total: Object.values(entry.areas).reduce((total, area) => total + area.score, 0),
    areas: entry.areas,
    findings: entry.findings ?? [],
  }));
  const record = {
    schemaVersion: 1,
    status: "UNBLINDED_HUMAN_SCORES_RECORDED",
    runId,
    runManifestSha256: checked.manifestHash,
    scoreSha256: await readFileHash(path.resolve(scoresFile)),
    evaluator: scores.evaluator,
    results,
    decision: "No routing or root-cause decision is implied. Complete the independent quality audit and decision log separately.",
  };
  await writeJson(path.join(checked.directory, "unblinded-results.json"), record);
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
    console.log(JSON.stringify({ status: packet.status, runId }));
    return;
  }
  if (command === "score-template") {
    const run = await readRun(SCRIPT_ROOT, runId);
    const contract = (await verifyContract()).contract;
    const template = scoreTemplate({
      runId,
      blindIds: run.unblinding.mapping.map((entry) => entry.blindId),
      rubricAreas: contract.requiredRubricAreas,
      runManifestSha256: run.manifestHash,
    });
    await writeJson(path.join(run.directory, "scores.template.json"), template);
    console.log(JSON.stringify({ status: "TEMPLATE_CREATED", runId }));
    return;
  }
  if (!options.scores) fail("--scores is required for unblind");
  const record = await unblind({ runId, scoresFile: options.scores });
  console.log(JSON.stringify({ status: record.status, runId }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
