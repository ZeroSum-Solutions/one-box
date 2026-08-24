import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const RESULT_STATES = new Set(["PASS", "FAIL", "BLOCKED", "NOT_RUN"]);
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 5 * 1024 * 1024;
const SAFE_COMMAND_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RUNTIME_ENV_KEYS = new Set([
  "PATH", "TMPDIR", "TMP", "TEMP", "SHELL", "USER", "LOGNAME",
  "LANG", "LC_ALL", "TERM", "CI", "PLAYWRIGHT_BROWSERS_PATH",
]);
const CREDENTIAL_KEY = /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i;
const OFFLINE_GUARD = path.resolve(import.meta.dirname, "page-ir-offline-guard.mjs");
const DARWIN_SANDBOX_PROFILE_PREFIX = [
  "(version 1)",
  "(allow default)",
  "(deny network*)",
  "(allow network-inbound (local tcp \"localhost:*\"))",
  "(allow network-outbound (remote tcp \"localhost:*\"))",
];

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function validateRunId(runId) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(runId ?? "")) fail("run ID must use lowercase letters, numbers, and hyphens");
  return runId;
}

export function validateCommandId(commandId) {
  if (!SAFE_COMMAND_ID.test(commandId ?? "")) fail("command ID must use lowercase letters, numbers, and hyphens");
  return commandId;
}

function validateEvaluationId(evaluationId) {
  if (!/^EVAL-[A-Z]+-[0-9]{3}(?:-[A-Z]+)?$/.test(evaluationId ?? "")) fail(`invalid evaluation ID: ${evaluationId}`);
  return evaluationId;
}

function playwrightBrowserStore(executable) {
  let current = path.dirname(executable);
  while (path.dirname(current) !== current && !/^chromium-[0-9]+$/.test(path.basename(current))) {
    current = path.dirname(current);
  }
  if (!/^chromium-[0-9]+$/.test(path.basename(current))) fail("Playwright browser store authority is invalid");
  return path.dirname(current);
}

function darwinSandboxProfile(environment) {
  const temporary = environment.TMPDIR;
  if (typeof temporary !== "string" || !path.isAbsolute(temporary) || temporary.includes('"')) {
    fail("evaluation temporary-directory authority is invalid");
  }
  return [
    ...DARWIN_SANDBOX_PROFILE_PREFIX,
    `(allow network-bind (local unix-socket (path-prefix "${temporary.endsWith(path.sep) ? temporary : `${temporary}${path.sep}`}")))`,
  ].join(" ");
}

function resolveWithin(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) fail(`path escapes root: ${relativePath}`);
  return target;
}

async function readStableRegularFile(file, maxBytes = MAX_FILE_BYTES) {
  const initial = await fs.lstat(file, { bigint: true });
  if (initial.isSymbolicLink() || !initial.isFile() || initial.nlink !== BigInt(1) || initial.size > BigInt(maxBytes)) {
    fail(`${file} must be one bounded regular file`);
  }
  const handle = await fs.open(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.dev !== initial.dev || opened.ino !== initial.ino || opened.size !== initial.size || opened.nlink !== BigInt(1)) {
      fail(`${file} changed before read`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size) fail(`${file} changed while read`);
    return bytes;
  } finally {
    await handle.close();
  }
}

async function writeExclusive(file, bytes) {
  const handle = await fs.open(file, "wx", 0o400);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function openStableDirectoryAuthority(directory, label) {
  const requested = path.resolve(directory);
  const requestedStat = await fs.lstat(requested, { bigint: true });
  if (requestedStat.isSymbolicLink() || !requestedStat.isDirectory()) {
    fail(`${label} must be a physical directory`);
  }
  const physical = await fs.realpath(directory);
  const physicalStat = await fs.lstat(physical, { bigint: true });
  if (
    physicalStat.isSymbolicLink() ||
    !physicalStat.isDirectory() ||
    physicalStat.dev !== requestedStat.dev ||
    physicalStat.ino !== requestedStat.ino
  ) fail(`${label} changed during canonicalization`);
  const parsed = path.parse(physical);
  const snapshots = [];
  let current = parsed.root;
  for (const component of physical.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stat = await fs.lstat(current, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${label} contains an unsafe parent component`);
    snapshots.push({ path: current, dev: stat.dev, ino: stat.ino });
  }
  const handle = await fs.open(physical, fsConstants.O_RDONLY);
  const opened = await handle.stat({ bigint: true });
  const expected = snapshots.at(-1);
  if (!opened.isDirectory() || !expected || opened.dev !== expected.dev || opened.ino !== expected.ino) {
    await handle.close();
    fail(`${label} changed before publication`);
  }
  return { physical, snapshots, handle };
}

async function assertDirectoryAuthority(authority, label) {
  const opened = await authority.handle.stat({ bigint: true });
  const expected = authority.snapshots.at(-1);
  if (!opened.isDirectory() || opened.dev !== expected.dev || opened.ino !== expected.ino) {
    fail(`${label} changed during publication`);
  }
  for (const snapshot of authority.snapshots) {
    const stat = await fs.lstat(snapshot.path, { bigint: true }).catch(() => undefined);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory() || stat.dev !== snapshot.dev || stat.ino !== snapshot.ino) {
      fail(`${label} changed during publication`);
    }
  }
}

async function sealDirectoryTree(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail(`${child} must not be a symlink`);
    if (entry.isDirectory()) await sealDirectoryTree(child);
    else if (entry.isFile()) await fs.chmod(child, 0o400);
    else fail(`${child} must be a regular file`);
  }
}

async function publishDirectory(parent, name, populate, description) {
  await fs.mkdir(parent, { recursive: true });
  const authority = await openStableDirectoryAuthority(parent, `${description} parent`);
  const destination = path.join(authority.physical, name);
  const temporary = path.join(authority.physical, `.${name}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.mkdir(temporary, { mode: 0o700 });
    await assertDirectoryAuthority(authority, `${description} parent`);
    await populate(temporary);
    await assertDirectoryAuthority(authority, `${description} parent`);
    try {
      await fs.rename(temporary, destination);
    } catch (error) {
      if (error && typeof error === "object" && ["EEXIST", "ENOTEMPTY"].includes(error.code)) {
        fail(`${description} already exists and is immutable`);
      }
      throw error;
    }
    await authority.handle.sync();
    await assertDirectoryAuthority(authority, `${description} parent`);
  } finally {
    try {
      await fs.rm(temporary, { recursive: true, force: true });
    } finally {
      await authority.handle.close();
    }
  }
  return destination;
}

async function listRegularFiles(root, relative = "") {
  const directory = resolveWithin(root, relative);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) fail(`${child} must not be a symlink`);
    if (entry.isDirectory()) files.push(...await listRegularFiles(root, child));
    else if (entry.isFile()) files.push(child.split(path.sep).join("/"));
    else fail(`${child} must be a regular file`);
  }
  return files.sort();
}

async function hashClosedInventory(root) {
  const files = await listRegularFiles(root);
  const inventory = [];
  for (const relativePath of files) {
    const bytes = await readStableRegularFile(resolveWithin(root, relativePath));
    inventory.push({ path: relativePath, sha256: sha256(bytes), sizeBytes: bytes.length });
  }
  return inventory;
}

async function verifyClosedInventory(root, expected, label, { lockName } = {}) {
  if (!Array.isArray(expected)) fail(`${label} inventory is invalid`);
  const actualFiles = (await listRegularFiles(root)).filter((entry) => entry !== lockName);
  const expectedPaths = expected.map((entry) => entry.path);
  if (new Set(expectedPaths).size !== expectedPaths.length || JSON.stringify(actualFiles) !== JSON.stringify([...expectedPaths].sort())) {
    fail(`${label} inventory is not closed`);
  }
  const verifiedBytes = new Map();
  for (const entry of expected) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Object.keys(entry).sort().join(",") !== "path,sha256,sizeBytes" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,299}$/.test(entry.path) ||
      entry.path.includes("..") ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.sizeBytes) ||
      entry.sizeBytes < 0
    ) fail(`${label} inventory entry is invalid`);
    const bytes = await readStableRegularFile(resolveWithin(root, entry.path));
    if (bytes.length !== entry.sizeBytes || sha256(bytes) !== entry.sha256) fail(`${label} hash mismatch: ${entry.path}`);
    verifiedBytes.set(entry.path, bytes);
  }
  return verifiedBytes;
}

async function verifyImmutableEvidencePackets(browserRoot) {
  const entries = await fs.readdir(browserRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isDirectory() || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(entry.name)) {
      fail(`browser evidence contains an unsafe packet: ${entry.name}`);
    }
    const packetRoot = path.join(browserRoot, entry.name);
    const lockBytes = await readStableRegularFile(path.join(packetRoot, "packet.lock.json"), 1024 * 1024);
    let lock;
    try {
      lock = JSON.parse(lockBytes.toString("utf8"));
    } catch {
      fail(`browser evidence packet lock is invalid: ${entry.name}`);
    }
    if (
      !lock ||
      Object.keys(lock).sort().join(",") !== "files,name,schemaVersion" ||
      lock.schemaVersion !== 1 ||
      lock.name !== entry.name
    ) fail(`browser evidence packet lock is invalid: ${entry.name}`);
    await verifyClosedInventory(packetRoot, lock.files, `browser evidence packet ${entry.name}`, { lockName: "packet.lock.json" });
  }
}

function parseFixture(bytes, expectedId) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${expectedId} fixture.json must be valid JSON`);
  }
  const allowed = ["schemaVersion", "id", "purpose", "providerMode", "inputs"];
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
    fail(`${expectedId} fixture.json must be one closed V1 record`);
  }
  if (value.schemaVersion !== 1 || value.id !== expectedId || value.purpose !== expectedId || value.providerMode !== "recorded-or-stubbed") {
    fail(`${expectedId} fixture authority is invalid`);
  }
  if (!Array.isArray(value.inputs) || value.inputs.length === 0) fail(`${expectedId} fixture must declare inputs`);
  const seen = new Set();
  for (const input of value.inputs) {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).sort().join(",") !== "path,sha256") fail(`${expectedId} fixture input is invalid`);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/.test(input.path) || input.path.includes("..") || path.isAbsolute(input.path)) fail(`${expectedId} fixture input path is unsafe`);
    if (!/^[a-f0-9]{64}$/.test(input.sha256) || seen.has(input.path)) fail(`${expectedId} fixture input binding is invalid`);
    seen.add(input.path);
  }
  return value;
}

async function copyFixture(fixtureRoot, destination, fixtureId) {
  const fixtureFile = path.join(fixtureRoot, "fixture.json");
  const fixtureBytes = await readStableRegularFile(fixtureFile, 64 * 1024);
  const fixture = parseFixture(fixtureBytes, fixtureId);
  const actualFiles = await listRegularFiles(fixtureRoot);
  const expectedFiles = ["fixture.json", ...fixture.inputs.map((input) => input.path)].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) fail(`${fixtureId} fixture inventory is not closed`);
  await fs.mkdir(destination, { recursive: true });
  await writeExclusive(path.join(destination, "fixture.json"), fixtureBytes);
  for (const input of fixture.inputs) {
    const bytes = await readStableRegularFile(resolveWithin(fixtureRoot, input.path));
    if (sha256(bytes) !== input.sha256) fail(`${fixtureId} fixture hash mismatch: ${input.path}`);
    const target = resolveWithin(destination, input.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await writeExclusive(target, bytes);
  }
}

export function sanitizeEvaluationEnvironment(environment = process.env) {
  const sanitized = {};
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined || !RUNTIME_ENV_KEYS.has(key) || CREDENTIAL_KEY.test(key)) continue;
    sanitized[key] = value;
  }
  sanitized.ONEBOX_EVAL_OFFLINE = "1";
  return sanitized;
}

export async function prepareEvaluationRun({
  runsRoot,
  runId,
  contract,
  fixturesRoot,
  evaluatedGitSha,
  createdAt = new Date().toISOString(),
}) {
  validateRunId(runId);
  if (!contract || !/^\d+\.\d+\.\d+$/.test(contract.contractVersion ?? "")) fail("validated contract is required");
  if (![contract.contractSha256, contract.registrySha256].every((value) => /^[a-f0-9]{64}$/.test(value ?? ""))) fail("contract hashes are invalid");
  if (!/^[a-f0-9]{40}$/.test(contract.sourceCommit ?? "") || !/^[a-f0-9]{40}$/.test(evaluatedGitSha ?? "")) fail("Git authority is invalid");
  const corpus = [...contract.corpus];
  const evaluationIds = contract.evaluations.map((entry) => validateEvaluationId(entry.id));
  const blockers = [];
  if (!fixturesRoot) {
    for (const fixtureId of corpus) {
      blockers.push({
        evaluationIds: ["EVAL-WEB-001", "EVAL-WEB-002", "EVAL-WEB-003"],
        code: "CORPUS_FIXTURES_MISSING",
        detail: fixtureId,
      });
    }
  }
  let manifest;
  const directory = await publishDirectory(path.resolve(runsRoot), runId, async (temporary) => {
    const inputsDirectory = path.join(temporary, "inputs");
    if (fixturesRoot) {
      for (const fixtureId of corpus) {
        await copyFixture(resolveWithin(fixturesRoot, fixtureId), path.join(inputsDirectory, fixtureId), fixtureId);
      }
    } else {
      await fs.mkdir(inputsDirectory);
    }
    const inputInventory = await hashClosedInventory(inputsDirectory);
    manifest = {
      schemaVersion: 1,
      runId,
      status: "prepared",
      createdAt,
      contractVersion: contract.contractVersion,
      contractSha256: contract.contractSha256,
      registrySha256: contract.registrySha256,
      sourceCommit: contract.sourceCommit,
      evaluatedGitSha,
      corpus,
      inputInventory,
      prerequisiteBlockers: blockers,
      initialResults: evaluationIds.map((evaluationId) => ({ evaluationId, state: "NOT_RUN" })),
    };
    const manifestBytes = jsonBytes(manifest);
    await writeExclusive(path.join(temporary, "run-manifest.json"), manifestBytes);
    await writeExclusive(path.join(temporary, "run-manifest.lock.json"), jsonBytes({
      schemaVersion: 1,
      runId,
      sha256: sha256(manifestBytes),
    }));
    await fs.mkdir(path.join(temporary, "results"));
    await sealDirectoryTree(inputsDirectory);
  }, "evaluation run");
  return { directory, manifest };
}

function validateResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) fail("evaluation result must be an object");
  const allowed = new Set([
    "schemaVersion", "evaluationId", "state", "evidence", "blockers", "commands",
    "networkAttempts", "meteredCalls", "providerCredentialKeysPresent", "capturedAt",
    "fixtureId", "reason", "browserEvidence",
  ]);
  if (Object.keys(result).some((key) => !allowed.has(key))) fail("evaluation result must be one closed record");
  validateEvaluationId(result.evaluationId);
  if (result.schemaVersion !== 1 || !RESULT_STATES.has(result.state)) fail("evaluation result state is invalid");
  if (!Array.isArray(result.evidence)) fail("evaluation result evidence must be an array");
  if (new Set(result.evidence.map((entry) => entry?.path)).size !== result.evidence.length) {
    fail("evaluation result evidence paths must be unique");
  }
  for (const evidence of result.evidence) {
    if (
      !evidence ||
      typeof evidence !== "object" ||
      Array.isArray(evidence) ||
      Object.keys(evidence).sort().join(",") !== "path,sha256" ||
      typeof evidence.path !== "string" ||
      path.isAbsolute(evidence.path) ||
      evidence.path.split(/[\\/]/).includes("..") ||
      !/^[a-f0-9]{64}$/.test(evidence.sha256)
    ) fail("evaluation result evidence binding is invalid");
  }
  if (result.commands !== undefined) {
    if (!Array.isArray(result.commands)) fail("evaluation result commands must be an array");
    const commandIds = new Set();
    for (const command of result.commands) {
      if (!command || typeof command !== "object" || Array.isArray(command)) fail("evaluation result command is invalid");
      validateCommandId(command.id);
      if (commandIds.has(command.id)) fail("evaluation result command IDs must be unique");
      commandIds.add(command.id);
    }
  }
  if (result.state === "PASS") {
    if (result.evidence.length === 0) fail("PASS evaluation result requires evidence");
    if (result.meteredCalls !== 0) fail("PASS evaluation result requires zero metered calls");
    if (Array.isArray(result.networkAttempts) && result.networkAttempts.length > 0) fail("PASS evaluation result cannot contain network attempts");
    if (Array.isArray(result.providerCredentialKeysPresent) && result.providerCredentialKeysPresent.length > 0) fail("PASS evaluation result cannot contain provider credentials");
  }
  if (result.state === "BLOCKED" && (!Array.isArray(result.blockers) || result.blockers.length === 0)) {
    fail("BLOCKED evaluation result requires a blocker");
  }
  if (["BLOCKED", "NOT_RUN"].includes(result.state) && result.evidence.length > 0) {
    fail(`${result.state} evaluation result cannot contain evidence`);
  }
  if (["BLOCKED", "NOT_RUN"].includes(result.state) && Array.isArray(result.commands) && result.commands.length > 0) {
    fail(`${result.state} evaluation result cannot contain commands`);
  }
  return result;
}

async function writeResultLock(temporary, result, files) {
  await writeExclusive(path.join(temporary, "result.lock.json"), jsonBytes({
    schemaVersion: 1,
    evaluationId: result.evaluationId,
    files,
  }));
  await sealDirectoryTree(temporary);
}

async function readImmutableEvaluationResult(resultsRoot, evaluationId) {
  const directory = resolveWithin(path.resolve(resultsRoot), evaluationId);
  const lockBytes = await readStableRegularFile(path.join(directory, "result.lock.json"), 1024 * 1024);
  let lock;
  try {
    lock = JSON.parse(lockBytes.toString("utf8"));
  } catch {
    fail(`result inventory lock is invalid: ${evaluationId}`);
  }
  if (
    !lock ||
    Object.keys(lock).sort().join(",") !== "evaluationId,files,schemaVersion" ||
    lock.schemaVersion !== 1 ||
    lock.evaluationId !== evaluationId
  ) fail(`result inventory lock is invalid: ${evaluationId}`);
  const verifiedBytes = await verifyClosedInventory(directory, lock.files, `result inventory ${evaluationId}`, { lockName: "result.lock.json" });
  const resultEntry = lock.files.find((entry) => entry.path === "result.json");
  if (!resultEntry) fail(`result inventory ${evaluationId} is missing result.json`);
  const result = validateResult(JSON.parse(verifiedBytes.get("result.json").toString("utf8")));
  if (result.evaluationId !== evaluationId) fail(`result identity mismatch: ${evaluationId}`);
  return result;
}

export async function writeImmutableEvaluationResult(resultsRoot, rawResult) {
  const result = validateResult(structuredClone(rawResult));
  if (!["BLOCKED", "NOT_RUN"].includes(result.state)) {
    fail(`${result.state} evaluation result requires an evidence packet`);
  }
  return publishDirectory(path.resolve(resultsRoot), result.evaluationId, async (temporary) => {
    const resultBytes = jsonBytes(result);
    await writeExclusive(path.join(temporary, "result.json"), resultBytes);
    await writeResultLock(temporary, result, [{ path: "result.json", sha256: sha256(resultBytes), sizeBytes: resultBytes.length }]);
  }, `evaluation result ${result.evaluationId}`);
}

export async function writeImmutableEvaluationPacket(resultsRoot, packetRoot, rawResult) {
  const result = validateResult(structuredClone(rawResult));
  const root = path.resolve(packetRoot);
  const files = await listRegularFiles(root);
  if (files.length === 0) fail("evaluation evidence packet is empty");
  const prepared = [];
  for (const relativePath of files) {
    const bytes = await readStableRegularFile(resolveWithin(root, relativePath));
    prepared.push({ relativePath, bytes, sha256: sha256(bytes) });
  }
  const actualEvidence = prepared.map((entry) => ({
    path: `artifacts/${entry.relativePath}`,
    sha256: entry.sha256,
  })).sort((left, right) => left.path.localeCompare(right.path));
  const declaredEvidence = [...result.evidence].sort((left, right) => left.path.localeCompare(right.path));
  if (JSON.stringify(actualEvidence) !== JSON.stringify(declaredEvidence)) {
    fail("evaluation evidence packet does not match the closed result inventory");
  }
  return publishDirectory(path.resolve(resultsRoot), result.evaluationId, async (temporary) => {
    for (const entry of prepared) {
      const target = resolveWithin(path.join(temporary, "artifacts"), entry.relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await writeExclusive(target, entry.bytes);
    }
    const resultBytes = jsonBytes(result);
    await writeExclusive(path.join(temporary, "result.json"), resultBytes);
    await writeResultLock(temporary, result, [
      ...prepared.map((entry) => ({ path: `artifacts/${entry.relativePath}`, sha256: entry.sha256, sizeBytes: entry.bytes.length })),
      { path: "result.json", sha256: sha256(resultBytes), sizeBytes: resultBytes.length },
    ].sort((left, right) => left.path.localeCompare(right.path)));
  }, `evaluation result ${result.evaluationId}`);
}

export async function publishImmutableEvidencePacket(parent, name, packetRoot) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(name ?? "")) fail("evidence packet name is invalid");
  const root = path.resolve(packetRoot);
  const files = await listRegularFiles(root);
  if (files.length === 0) fail("evaluation evidence packet is empty");
  const prepared = [];
  for (const relativePath of files) {
    const bytes = await readStableRegularFile(resolveWithin(root, relativePath));
    prepared.push({ relativePath, bytes, sha256: sha256(bytes) });
  }
  const directory = await publishDirectory(path.resolve(parent), name, async (temporary) => {
    for (const entry of prepared) {
      const target = resolveWithin(temporary, entry.relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await writeExclusive(target, entry.bytes);
    }
    await writeExclusive(path.join(temporary, "packet.lock.json"), jsonBytes({
      schemaVersion: 1,
      name,
      files: prepared.map((entry) => ({ path: entry.relativePath, sha256: entry.sha256, sizeBytes: entry.bytes.length })),
    }));
    await sealDirectoryTree(temporary);
  }, `evidence packet ${name}`);
  return {
    directory,
    inventory: prepared.map((entry) => ({ path: entry.relativePath, sha256: entry.sha256 })),
  };
}

export async function aggregateEvaluationResults({ resultsRoot, evaluationIds }) {
  const results = [];
  for (const rawId of evaluationIds) {
    const evaluationId = validateEvaluationId(rawId);
    try {
      results.push(await readImmutableEvaluationResult(resultsRoot, evaluationId));
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        results.push({ schemaVersion: 1, evaluationId, state: "NOT_RUN", evidence: [] });
      } else {
        throw error;
      }
    }
  }
  const states = new Set(results.map((result) => result.state));
  const exitCode = states.has("FAIL") ? 1 : states.has("BLOCKED") ? 3 : states.has("NOT_RUN") ? 4 : 0;
  return { schemaVersion: 1, results, exitCode };
}

function validateAggregate(aggregate) {
  if (
    !aggregate ||
    aggregate.schemaVersion !== 1 ||
    !Array.isArray(aggregate.results) ||
    ![0, 1, 3, 4].includes(aggregate.exitCode)
  ) fail("aggregate result is invalid");
  const seen = new Set();
  for (const result of aggregate.results) {
    validateResult(result);
    if (seen.has(result.evaluationId)) fail("aggregate result IDs must be unique");
    seen.add(result.evaluationId);
  }
  const states = new Set(aggregate.results.map((result) => result.state));
  const expectedExitCode = states.has("FAIL") ? 1 : states.has("BLOCKED") ? 3 : states.has("NOT_RUN") ? 4 : 0;
  if (aggregate.exitCode !== expectedExitCode) fail("aggregate exit code contradicts its result states");
  return aggregate;
}

export async function writeImmutableAggregate(runDirectory, rawAggregate) {
  const aggregate = validateAggregate(structuredClone(rawAggregate));
  const aggregateBytes = jsonBytes(aggregate);
  const directory = await publishDirectory(path.resolve(runDirectory), "aggregate", async (temporary) => {
    await writeExclusive(path.join(temporary, "aggregate.json"), aggregateBytes);
    await writeExclusive(path.join(temporary, "aggregate.lock.json"), jsonBytes({
      schemaVersion: 1,
      sha256: sha256(aggregateBytes),
      sizeBytes: aggregateBytes.length,
    }));
    await sealDirectoryTree(temporary);
  }, "aggregate");
  return path.join(directory, "aggregate.json");
}

export async function loadPreparedEvaluationRun(runDirectory) {
  const directory = path.resolve(runDirectory);
  const runDirectoryStat = await fs.lstat(directory);
  if (runDirectoryStat.isSymbolicLink() || !runDirectoryStat.isDirectory()) fail("evaluation run must be a physical directory");
  const required = new Set(["inputs", "results", "run-manifest.json", "run-manifest.lock.json"]);
  const optional = new Set(["aggregate", "browser"]);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const entryNames = entries.map((entry) => {
    if (entry.isSymbolicLink()) fail(`evaluation run entry must not be a symlink: ${entry.name}`);
    return entry.name;
  });
  if ([...required].some((name) => !entryNames.includes(name)) || entryNames.some((name) => !required.has(name) && !optional.has(name))) {
    fail("evaluation run inventory is not closed");
  }
  const [manifestBytes, lockBytes] = await Promise.all([
    readStableRegularFile(path.join(directory, "run-manifest.json"), 1024 * 1024),
    readStableRegularFile(path.join(directory, "run-manifest.lock.json"), 64 * 1024),
  ]);
  let manifest;
  let lock;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
    lock = JSON.parse(lockBytes.toString("utf8"));
  } catch {
    fail("evaluation run manifest and lock must be valid JSON");
  }
  if (
    !lock ||
    Object.keys(lock).sort().join(",") !== "runId,schemaVersion,sha256" ||
    lock.schemaVersion !== 1 ||
    lock.runId !== manifest.runId ||
    lock.sha256 !== sha256(manifestBytes)
  ) fail("evaluation run manifest lock hash is invalid");
  if (manifest.schemaVersion !== 1 || manifest.status !== "prepared" || manifest.runId !== path.basename(directory)) fail("evaluation run manifest authority is invalid");
  await verifyClosedInventory(path.join(directory, "inputs"), manifest.inputInventory, "run input inventory");
  for (const child of ["inputs", "results"]) {
    const stat = await fs.lstat(path.join(directory, child));
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`evaluation run ${child} must be a directory`);
  }
  if (!Array.isArray(manifest.initialResults)) fail("evaluation run initial result authority is invalid");
  const evaluationIds = new Set(manifest.initialResults.map((entry) => entry?.evaluationId));
  if (
    evaluationIds.size !== manifest.initialResults.length ||
    manifest.initialResults.some((entry) => entry?.state !== "NOT_RUN" || !/^EVAL-[A-Z]+-[0-9]{3}(?:-[A-Z]+)?$/.test(entry.evaluationId ?? ""))
  ) fail("evaluation run initial result authority is invalid");
  const resultEntries = await fs.readdir(path.join(directory, "results"), { withFileTypes: true });
  for (const entry of resultEntries) {
    if (entry.isSymbolicLink() || !entry.isDirectory() || !evaluationIds.has(entry.name)) {
      fail(`evaluation run contains an unsafe result: ${entry.name}`);
    }
    await readImmutableEvaluationResult(path.join(directory, "results"), entry.name);
  }
  if (entryNames.includes("browser")) {
    const stat = await fs.lstat(path.join(directory, "browser"));
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("evaluation run browser must be a directory");
    await verifyImmutableEvidencePackets(path.join(directory, "browser"));
  }
  if (entryNames.includes("aggregate")) {
    const aggregateRoot = path.join(directory, "aggregate");
    const stat = await fs.lstat(aggregateRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("evaluation aggregate must be one immutable directory");
    const lockBytes = await readStableRegularFile(path.join(aggregateRoot, "aggregate.lock.json"), 64 * 1024);
    let aggregateLock;
    try {
      aggregateLock = JSON.parse(lockBytes.toString("utf8"));
    } catch {
      fail("evaluation aggregate lock is invalid");
    }
    if (
      !aggregateLock ||
      Object.keys(aggregateLock).sort().join(",") !== "schemaVersion,sha256,sizeBytes" ||
      aggregateLock.schemaVersion !== 1
    ) fail("evaluation aggregate lock is invalid");
    const verified = await verifyClosedInventory(aggregateRoot, [{
      path: "aggregate.json",
      sha256: aggregateLock.sha256,
      sizeBytes: aggregateLock.sizeBytes,
    }], "evaluation aggregate", { lockName: "aggregate.lock.json" });
    let aggregate;
    try {
      aggregate = JSON.parse(verified.get("aggregate.json").toString("utf8"));
    } catch {
      fail("evaluation aggregate is invalid JSON");
    }
    validateAggregate(aggregate);
  }
  return { directory, manifest, lock };
}

function spawnCommand(argv, { cwd, env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    if (process.platform !== "darwin") {
      reject(new Error("credential-free evaluation requires an OS network sandbox on this platform"));
      return;
    }
    const isolatedArgv = ["/usr/bin/sandbox-exec", "-p", darwinSandboxProfile(env), ...argv];
    const child = spawn(isolatedArgv[0], isolatedArgv.slice(1), {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    const capture = (chunks, which) => (chunk) => {
      const current = which === "stdout" ? stdoutBytes : stderrBytes;
      const remaining = Math.max(0, MAX_COMMAND_OUTPUT_BYTES - current);
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      if (which === "stdout") stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (current + chunk.length > MAX_COMMAND_OUTPUT_BYTES) {
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }
    };
    child.stdout.on("data", capture(stdout, "stdout"));
    child.stderr.on("data", capture(stderr, "stderr"));
    child.once("error", reject);
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
    }, timeoutMs);
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr);
      resolve({
        exitCode: exitCode ?? -1,
        signal,
        timedOut,
        stdoutSha256: sha256(out),
        stderrSha256: sha256(err),
        stdout: out.toString("utf8"),
        stderr: err.toString("utf8"),
        outputTruncated: stdoutBytes > MAX_COMMAND_OUTPUT_BYTES || stderrBytes > MAX_COMMAND_OUTPUT_BYTES,
      });
    });
  });
}

export async function executeEvaluation({
  root,
  evaluationId,
  commands,
  blockers = [],
  environment = process.env,
  timeoutMs = 120_000,
}) {
  validateEvaluationId(evaluationId);
  if (blockers.length > 0) {
    return { schemaVersion: 1, evaluationId, state: "BLOCKED", blockers: structuredClone(blockers), commands: [], evidence: [] };
  }
  if (!Array.isArray(commands) || commands.length === 0) fail("evaluation must register at least one command");
  const temporaryBase = process.platform === "darwin" ? "/tmp" : os.tmpdir();
  const temporary = await fs.mkdtemp(path.join(temporaryBase, "one-box-eval-"));
  const attemptLog = path.join(temporary, "attempts.log");
  try {
    const childEnv = sanitizeEvaluationEnvironment(environment);
    const isolatedHome = path.join(temporary, "home");
    await fs.mkdir(isolatedHome, { mode: 0o700 });
    childEnv.HOME = isolatedHome;
    childEnv.TMPDIR = path.join(temporary, "tmp");
    childEnv.XDG_CONFIG_HOME = path.join(isolatedHome, ".config");
    childEnv.NPM_CONFIG_USERCONFIG = path.join(isolatedHome, ".npmrc");
    childEnv.GIT_CONFIG_GLOBAL = path.join(isolatedHome, ".gitconfig");
    const browserExecutable = await fs.realpath(chromium.executablePath());
    childEnv.PLAYWRIGHT_BROWSERS_PATH = playwrightBrowserStore(browserExecutable);
    await fs.mkdir(childEnv.TMPDIR, { mode: 0o700 });
    childEnv.TMPDIR = await fs.realpath(childEnv.TMPDIR);
    childEnv.NODE_OPTIONS = `--import=${OFFLINE_GUARD}`;
    childEnv.ONEBOX_EVAL_NETWORK_ATTEMPT_LOG = attemptLog;
    const records = [];
    for (const command of commands) {
      if (!command || !Array.isArray(command.argv) || command.argv.length === 0 || command.argv.some((part) => typeof part !== "string")) {
        fail("evaluation command registration is invalid");
      }
      validateCommandId(command.id);
      const result = await spawnCommand(command.argv, { cwd: path.resolve(root), env: childEnv, timeoutMs });
      records.push({ id: command.id, argv: command.argv, ...result });
      if (result.exitCode !== 0 || result.timedOut || result.outputTruncated) break;
    }
    const networkAttempts = await fs.readFile(attemptLog, "utf8").then((text) => text.split("\n").filter(Boolean)).catch((error) => {
      if (error && typeof error === "object" && error.code === "ENOENT") return [];
      throw error;
    });
    const providerCredentialKeysPresent = Object.keys(childEnv).filter((key) => CREDENTIAL_KEY.test(key));
    const passed = records.length === commands.length && records.every((record) => record.exitCode === 0 && !record.timedOut && !record.outputTruncated) && networkAttempts.length === 0 && providerCredentialKeysPresent.length === 0;
    return {
      schemaVersion: 1,
      evaluationId,
      state: passed ? "PASS" : "FAIL",
      commands: records,
      networkAttempts,
      meteredCalls: networkAttempts.length,
      providerCredentialKeysPresent,
      evidence: records.flatMap((record) => [
        { path: `artifacts/${record.id}.stdout`, sha256: record.stdoutSha256 },
        { path: `artifacts/${record.id}.stderr`, sha256: record.stderrSha256 },
      ]),
    };
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
