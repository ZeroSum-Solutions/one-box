import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTRACT_ROOT = "docs/eval/page-ir-safe-pipeline";
const DEFAULT_REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const REGISTRY_PATH = `${CONTRACT_ROOT}/harness-registry.json`;
const REGISTRY_LOCK_PATH = `${CONTRACT_ROOT}/harness-registry.lock.json`;
const MAX_CONTRACT_BYTES = 2 * 1024 * 1024;
const MAX_REGISTERED_TEST_BYTES = 16 * 1024 * 1024;
const RESULT_STATES = ["PASS", "FAIL", "BLOCKED", "NOT_RUN"];
const TEST_REGISTRATION_KINDS = new Set([
  "credential-free-tests",
  "browser-corpus-tests",
]);
const COORDINATOR_EVALUATORS = new Set([
  "rendered-evidence",
  "qualification-human-review",
  "qualification-contract",
]);
const REQUIRED_QUALIFICATION_ARTIFACTS = [
  "run-manifest.json",
  "inputs/",
  "page-ir.json",
  "candidate-manifest.json",
  "gate-reports.json",
  "provenance.json",
  "site/",
  "screenshots/desktop.png",
  "screenshots/tablet.png",
  "screenshots/mobile.png",
  "human-visual-review.json",
];
const REQUIRED_BROWSER_ARTIFACTS = [
  "browser-evidence.json",
  "screenshots/desktop.png",
  "screenshots/tablet.png",
  "screenshots/mobile.png",
];

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
}

function assertClosedKeys(value, keys, label) {
  assertObject(value, label);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(`${label} has unexpected key ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${label} is missing key ${key}`);
  }
}

function assertString(value, label, pattern) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  if (pattern && !pattern.test(value)) fail(`${label} is invalid`);
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`${label} must be a positive safe integer`);
  }
}

function assertNonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a nonnegative safe integer`);
  }
}

function assertUniqueStrings(value, label, pattern) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array`);
  }
  for (const [index, entry] of value.entries()) {
    assertString(entry, `${label}[${index}]`, pattern);
  }
  if (new Set(value).size !== value.length) fail(`${label} must be unique`);
}

function sameStrings(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function assertExactStrings(actual, expected, label) {
  const actualValues = [...actual];
  const expectedValues = [...expected];
  if (
    !sameStrings(actualValues, expectedValues) ||
    actualValues.length !== expectedValues.length
  ) {
    fail(`${label} does not match the frozen contract`);
  }
}

function safeRelativePath(value, label, { directory = false } = {}) {
  assertString(value, label);
  if (value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) {
    fail(`${label} must be a safe repository-relative path`);
  }
  const comparable = directory && value.endsWith("/") ? value.slice(0, -1) : value;
  if (
    comparable.length === 0 ||
    path.posix.normalize(comparable) !== comparable ||
    comparable === ".." ||
    comparable.startsWith("../")
  ) {
    fail(`${label} must be a normalized repository-relative path`);
  }
  if (directory !== value.endsWith("/")) {
    fail(`${label} has the wrong file/directory form`);
  }
  return value;
}

function repositoryPath(repositoryRoot, relativePath, label) {
  safeRelativePath(relativePath, label);
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, ...relativePath.split("/"));
  if (!resolved.startsWith(`${root}${path.sep}`)) fail(`${label} escapes repository root`);
  return resolved;
}

async function snapshotNoSymlinkComponents(repositoryRoot, relativePath, label) {
  const root = path.resolve(repositoryRoot);
  const rootStat = await fs.lstat(root, { bigint: true });
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    fail(`${label} repository root must be a regular directory`);
  }
  const snapshots = [{ file: root, dev: rootStat.dev, ino: rootStat.ino }];
  let current = root;
  for (const component of relativePath.split("/")) {
    current = path.join(current, component);
    const stat = await fs.lstat(current, { bigint: true }).catch((error) => {
      if (error?.code === "ENOENT") fail(`${label} is unreadable: missing ${relativePath}`);
      throw error;
    });
    if (stat.isSymbolicLink()) fail(`${label} contains a symlink component`);
    snapshots.push({ file: current, dev: stat.dev, ino: stat.ino });
  }
  return snapshots;
}

async function assertSnapshotsUnchanged(snapshots, label) {
  for (const snapshot of snapshots) {
    const stat = await fs.lstat(snapshot.file, { bigint: true }).catch((error) => {
      fail(`${label} parent component changed: ${error instanceof Error ? error.message : String(error)}`);
    });
    if (
      stat.isSymbolicLink() ||
      stat.dev !== snapshot.dev ||
      stat.ino !== snapshot.ino
    ) {
      fail(`${label} parent component changed while it was being used`);
    }
  }
}

export async function readBoundedRegularFile(
  file,
  label,
  maximumBytes,
  expectedIdentity,
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    fail(`${label} byte bound is invalid`);
  }
  const initial = await fs.lstat(file).catch((error) => {
    fail(`${label} is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (initial.isSymbolicLink() || !initial.isFile()) {
    fail(`${label} must be a regular non-symlink file`);
  }
  if (initial.nlink !== 1) fail(`${label} must not have a hard link`);
  if (initial.size > maximumBytes) fail(`${label} exceeds its byte bound`);
  let handle;
  try {
    handle = await fs.open(
      file,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n) {
      fail(`${label} must remain one regular file without hard links`);
    }
    if (
      expectedIdentity &&
      (before.dev !== expectedIdentity.dev || before.ino !== expectedIdentity.ino)
    ) {
      fail(`${label} changed after its parent components were inspected`);
    }
    if (before.size > BigInt(maximumBytes)) fail(`${label} exceeds its byte bound`);
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      BigInt(bytes.byteLength) !== after.size
    ) {
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

export async function readBoundedRepositoryFile(
  root,
  relativePath,
  label,
  maximumBytes = MAX_CONTRACT_BYTES,
) {
  const file = repositoryPath(root, relativePath, label);
  const snapshots = await snapshotNoSymlinkComponents(root, relativePath, label);
  const bytes = await readBoundedRegularFile(
    file,
    label,
    maximumBytes,
    snapshots.at(-1),
  );
  await assertSnapshotsUnchanged(snapshots, label);
  return bytes;
}

const readRepositoryFile = readBoundedRepositoryFile;

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readRepositoryJson(root, relativePath, label) {
  return parseJson(await readRepositoryFile(root, relativePath, label), label);
}

function validateLock(lock, label, versionKey, pathKey) {
  assertClosedKeys(lock, ["schemaVersion", versionKey, pathKey, "sha256"], label);
  if (lock.schemaVersion !== 1) fail(`${label} schemaVersion must be 1`);
  assertString(lock[versionKey], `${label}.${versionKey}`, /^\d+\.\d+\.\d+$/);
  safeRelativePath(lock[pathKey], `${label}.${pathKey}`);
  assertString(lock.sha256, `${label}.sha256`, /^[a-f0-9]{64}$/);
}

function validateThresholds(thresholds) {
  assertClosedKeys(
    thresholds,
    ["composer", "failedCandidateRetention", "accessibility", "performanceQualification"],
    "evaluation manifest thresholds",
  );
  assertClosedKeys(
    thresholds.composer,
    ["minimumPx", "maximumPx", "maximumViewportHeightRatio"],
    "composer threshold",
  );
  assertPositiveInteger(thresholds.composer.minimumPx, "composer minimumPx");
  assertPositiveInteger(thresholds.composer.maximumPx, "composer maximumPx");
  if (
    typeof thresholds.composer.maximumViewportHeightRatio !== "number" ||
    thresholds.composer.maximumViewportHeightRatio <= 0 ||
    thresholds.composer.maximumViewportHeightRatio > 1
  ) {
    fail("composer maximumViewportHeightRatio is invalid");
  }
  assertClosedKeys(
    thresholds.failedCandidateRetention,
    ["maximumPerRun", "maximumBytes", "maximumHours"],
    "retention threshold",
  );
  for (const key of ["maximumPerRun", "maximumBytes", "maximumHours"]) {
    assertPositiveInteger(thresholds.failedCandidateRetention[key], `retention ${key}`);
  }
  assertClosedKeys(
    thresholds.accessibility,
    ["axeDependency", "maximumSerious", "maximumCritical", "contrast"],
    "accessibility threshold",
  );
  assertString(thresholds.accessibility.axeDependency, "accessibility axeDependency");
  assertNonnegativeInteger(thresholds.accessibility.maximumSerious, "accessibility maximumSerious");
  assertNonnegativeInteger(thresholds.accessibility.maximumCritical, "accessibility maximumCritical");
  assertString(thresholds.accessibility.contrast, "accessibility contrast");
  assertClosedKeys(
    thresholds.performanceQualification,
    ["totalBytesLessThan", "imageBytesLessThan", "domContentLoadedMsLessThan", "cpuThrottleRate"],
    "performance threshold",
  );
  for (const key of ["totalBytesLessThan", "imageBytesLessThan", "domContentLoadedMsLessThan", "cpuThrottleRate"]) {
    assertPositiveInteger(thresholds.performanceQualification[key], `performance ${key}`);
  }
}

function validateEvaluationManifest(manifest) {
  assertClosedKeys(
    manifest,
    [
      "schemaVersion",
      "contractVersion",
      "status",
      "sourceCommit",
      "productTarget",
      "viewports",
      "corpus",
      "resultStates",
      "thresholds",
      "evaluationOwners",
      "evaluations",
    ],
    "evaluation manifest",
  );
  if (manifest.schemaVersion !== 1) fail("evaluation manifest schemaVersion must be 1");
  assertString(manifest.contractVersion, "evaluation manifest contractVersion", /^\d+\.\d+\.\d+$/);
  if (manifest.status !== "frozen") fail("evaluation manifest must be frozen");
  assertString(manifest.sourceCommit, "evaluation manifest sourceCommit", /^[a-f0-9]{40}$/);
  if (manifest.productTarget !== "website") fail("evaluation manifest productTarget must be website");
  if (!Array.isArray(manifest.viewports) || manifest.viewports.length !== 3) {
    fail("evaluation manifest must contain three viewports");
  }
  const viewportIds = [];
  for (const [index, viewport] of manifest.viewports.entries()) {
    assertClosedKeys(viewport, ["id", "width", "height"], `viewport ${index}`);
    assertString(viewport.id, `viewport ${index} id`, /^[a-z][a-z0-9-]*$/);
    assertPositiveInteger(viewport.width, `viewport ${index} width`);
    assertPositiveInteger(viewport.height, `viewport ${index} height`);
    viewportIds.push(viewport.id);
  }
  if (new Set(viewportIds).size !== viewportIds.length) fail("viewport ids must be unique");
  assertUniqueStrings(manifest.corpus, "evaluation manifest corpus", /^[a-z][a-z0-9-]*$/);
  if (!Array.isArray(manifest.resultStates) || !sameStrings(manifest.resultStates, RESULT_STATES) || manifest.resultStates.length !== 4) {
    fail("evaluation manifest result states must be PASS, FAIL, BLOCKED, and NOT_RUN");
  }
  validateThresholds(manifest.thresholds);
  assertObject(manifest.evaluationOwners, "evaluation owners");
  if (!Array.isArray(manifest.evaluations) || manifest.evaluations.length !== 44) {
    fail("evaluation manifest must contain all 44 evaluations");
  }
  const ids = [];
  for (const [index, evaluation] of manifest.evaluations.entries()) {
    const label = `evaluation ${index}`;
    assertClosedKeys(
      evaluation,
      ["id", "title", "tier", "method", "blocking", "requirements", "tickets", "pass"],
      label,
    );
    assertString(evaluation.id, `${label} id`, /^EVAL-[A-Z]+-\d{3}$/);
    assertString(evaluation.title, `${label} title`);
    if (!new Set(["merge-blocker", "page-ir-promotion"]).has(evaluation.tier)) {
      fail(`${label} tier is invalid`);
    }
    if (!new Set(["contract", "mechanical", "rendered", "human"]).has(evaluation.method)) {
      fail(`${label} method is invalid`);
    }
    if (evaluation.blocking !== true) fail(`${label} must remain blocking`);
    assertUniqueStrings(evaluation.requirements, `${label} requirements`, /^REQ-[A-Z]+-\d{3}$/);
    assertUniqueStrings(evaluation.tickets, `${label} tickets`, /^OBX-\d{3}$/);
    assertString(evaluation.pass, `${label} pass`);
    ids.push(evaluation.id);
  }
  if (new Set(ids).size !== ids.length) fail("evaluation ids must be unique");
  assertExactStrings(Object.keys(manifest.evaluationOwners), ids, "evaluation owner ids");
  for (const [id, owner] of Object.entries(manifest.evaluationOwners)) {
    assertString(owner, `evaluation owner ${id}`, /^OBX-\d{3}$/);
  }
  return new Map(manifest.evaluations.map((evaluation) => [evaluation.id, evaluation]));
}

function validateTicketManifest(manifest) {
  assertClosedKeys(
    manifest,
    ["schemaVersion", "backlogVersion", "status", "prd", "evalManifest", "tickets"],
    "ticket manifest",
  );
  if (manifest.schemaVersion !== 1) fail("ticket manifest schemaVersion must be 1");
  assertString(manifest.backlogVersion, "ticket manifest backlogVersion", /^\d+\.\d+\.\d+$/);
  assertString(manifest.status, "ticket manifest status");
  safeRelativePath(manifest.prd, "ticket manifest prd");
  safeRelativePath(manifest.evalManifest, "ticket manifest evalManifest");
  if (!Array.isArray(manifest.tickets) || manifest.tickets.length === 0) {
    fail("ticket manifest tickets must be non-empty");
  }
  const ids = [];
  for (const [index, ticket] of manifest.tickets.entries()) {
    const label = `ticket manifest entry ${index}`;
    assertClosedKeys(ticket, ["id", "title", "priority", "epic", "dependsOn", "file"], label);
    assertString(ticket.id, `${label} id`, /^OBX-\d{3}$/);
    assertString(ticket.title, `${label} title`);
    assertString(ticket.priority, `${label} priority`, /^P[0-2]$/);
    assertString(ticket.epic, `${label} epic`);
    if (!Array.isArray(ticket.dependsOn)) fail(`${label} dependsOn must be an array`);
    if (ticket.dependsOn.length > 0) {
      assertUniqueStrings(ticket.dependsOn, `${label} dependsOn`, /^OBX-\d{3}$/);
    }
    safeRelativePath(ticket.file, `${label} file`);
    if (ticket.file.includes("/")) fail(`${label} file must be inside the ticket directory`);
    ids.push(ticket.id);
  }
  if (new Set(ids).size !== ids.length) fail("ticket ids must be unique");
  const byId = new Map(manifest.tickets.map((ticket) => [ticket.id, ticket]));
  for (const ticket of manifest.tickets) {
    for (const dependency of ticket.dependsOn) {
      if (!byId.has(dependency)) fail(`${ticket.id} references missing dependency ${dependency}`);
      if (dependency === ticket.id) fail(`${ticket.id} cannot depend on itself`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (ticketId) => {
    if (visiting.has(ticketId)) fail(`ticket dependency cycle includes ${ticketId}`);
    if (visited.has(ticketId)) return;
    visiting.add(ticketId);
    for (const dependency of byId.get(ticketId).dependsOn) visit(dependency);
    visiting.delete(ticketId);
    visited.add(ticketId);
  };
  for (const ticketId of byId.keys()) visit(ticketId);
  return byId;
}

function frontMatterArray(frontMatter, key, label) {
  const match = frontMatter.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]\\s*$`, "m"));
  if (!match) fail(`${label} is missing ${key}`);
  const values = match[1].split(",").map((entry) => entry.trim()).filter(Boolean);
  if (values.length > 0 && new Set(values).size !== values.length) {
    fail(`${label} ${key} must be unique`);
  }
  return values;
}

function frontMatterScalar(frontMatter, key, label) {
  const match = frontMatter.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  if (!match) fail(`${label} is missing ${key}`);
  return match[1];
}

function parseTicketFrontMatter(bytes, label) {
  const text = bytes.toString("utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) fail(`${label} has invalid front matter`);
  const front = match[1];
  return {
    id: frontMatterScalar(front, "id", label),
    title: frontMatterScalar(front, "title", label),
    priority: frontMatterScalar(front, "priority", label),
    epic: frontMatterScalar(front, "epic", label),
    dependsOn: frontMatterArray(front, "depends_on", label),
    requirements: frontMatterArray(front, "requirements", label),
    evals: frontMatterArray(front, "evals", label),
  };
}

function addEdge(map, key, value) {
  const values = map.get(key) ?? new Set();
  values.add(value);
  map.set(key, values);
}

function parseTraceability(bytes) {
  const rows = new Map();
  for (const line of bytes.toString("utf8").split("\n")) {
    const match = line.match(/^\| (REQ-[A-Z]+-\d{3}) \| (.+) \| (.+) \|$/);
    if (!match) continue;
    if (rows.has(match[1])) fail(`traceability has duplicate row ${match[1]}`);
    const split = (value) => value.split(",").map((entry) => entry.trim()).filter(Boolean);
    rows.set(match[1], { evaluations: split(match[2]), tickets: split(match[3]) });
  }
  if (rows.size === 0) fail("traceability contains no requirement rows");
  return rows;
}

function parseProductRequirements(bytes) {
  const ids = [...bytes.toString("utf8").matchAll(/^- \*\*(REQ-[A-Z]+-\d{3}):\*\*/gm)]
    .map((match) => match[1]);
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    fail("product requirements must contain unique normative requirement IDs");
  }
  return new Set(ids);
}

function isAncestor(ticketById, possibleAncestor, ticketId, seen = new Set()) {
  if (possibleAncestor === ticketId) return true;
  if (seen.has(ticketId)) return false;
  seen.add(ticketId);
  return ticketById.get(ticketId)?.dependsOn.some((dependency) =>
    isAncestor(ticketById, possibleAncestor, dependency, seen),
  ) ?? false;
}

function validateOwnerOrder(manifest, evaluationById, ticketById) {
  for (const [evaluationId, owner] of Object.entries(manifest.evaluationOwners)) {
    const evaluation = evaluationById.get(evaluationId);
    if (!evaluation.tickets.includes(owner)) {
      fail(`${evaluationId} owner ${owner} is not included in its tickets`);
    }
    for (const ticket of evaluation.tickets) {
      if (!isAncestor(ticketById, ticket, owner)) {
        fail(`${evaluationId} owner ${owner} is not dependency-last after ${ticket}`);
      }
    }
  }
}

function pointerValue(document, pointer, label) {
  if (pointer === "") return document;
  if (!/^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])*)*$/.test(pointer)) {
    fail(`${label} is not a valid JSON pointer`);
  }
  let value = document;
  for (const raw of pointer.slice(1).split("/")) {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isObject(value) && !Array.isArray(value)) fail(`${label} does not resolve`);
    if (!(key in value)) fail(`${label} does not resolve`);
    value = value[key];
  }
  return value;
}

function validatePointer(pointer, label) {
  assertClosedKeys(pointer, ["path", "jsonPointer"], label);
  safeRelativePath(pointer.path, `${label}.path`);
  assertString(pointer.jsonPointer, `${label}.jsonPointer`);
}

function validateRegistry(registry) {
  assertClosedKeys(
    registry,
    [
      "schemaVersion",
      "registryVersion",
      "status",
      "evaluationManifest",
      "ticketContract",
      "evaluations",
      "providerCredentialDenylist",
      "renderedProviderPolicy",
      "requiredArtifacts",
      "viewportsPointer",
      "thresholdPointers",
      "browserContract",
      "runtimeContract",
      "fixtureContract",
    ],
    "harness registry",
  );
  if (registry.schemaVersion !== 1) fail("harness registry schemaVersion must be 1");
  assertString(registry.registryVersion, "harness registry registryVersion", /^\d+\.\d+\.\d+$/);
  if (registry.status !== "frozen") fail("harness registry must be frozen");
  assertClosedKeys(
    registry.evaluationManifest,
    ["path", "lockPath", "contractVersion", "sha256"],
    "registry evaluationManifest",
  );
  safeRelativePath(registry.evaluationManifest.path, "registry evaluation manifest path");
  safeRelativePath(registry.evaluationManifest.lockPath, "registry evaluation manifest lockPath");
  assertString(registry.evaluationManifest.contractVersion, "registry evaluation manifest contractVersion", /^\d+\.\d+\.\d+$/);
  assertString(registry.evaluationManifest.sha256, "registry evaluation manifest sha256", /^[a-f0-9]{64}$/);
  assertClosedKeys(
    registry.ticketContract,
    ["manifestPath", "ticketDirectory", "traceabilityPath"],
    "registry ticketContract",
  );
  for (const key of ["manifestPath", "ticketDirectory", "traceabilityPath"]) {
    safeRelativePath(registry.ticketContract[key], `registry ticketContract.${key}`);
  }
  assertObject(registry.evaluations, "registry evaluations");
  for (const [evaluationId, registration] of Object.entries(registry.evaluations)) {
    assertString(evaluationId, "registry evaluation id", /^EVAL-[A-Z]+-\d{3}$/);
    assertObject(registration, `registry ${evaluationId}`);
    if (TEST_REGISTRATION_KINDS.has(registration.kind)) {
      const registrationKeys = [
        "kind", "testFiles", "credentialPolicy", "networkPolicy",
        ...(registration.browserPolicy === undefined ? [] : ["browserPolicy"]),
      ];
      assertClosedKeys(
        registration,
        registrationKeys,
        `registry ${evaluationId}`,
      );
      assertUniqueStrings(registration.testFiles, `registry ${evaluationId} testFiles`);
      for (const [index, testFile] of registration.testFiles.entries()) {
        safeRelativePath(testFile, `registered test ${evaluationId}[${index}]`);
        if (!testFile.endsWith(".test.ts") && !testFile.endsWith(".test.tsx")) {
          fail(`registered test ${testFile} must be a TypeScript test file`);
        }
      }
      if (registration.credentialPolicy !== "absent") {
        fail(`registry ${evaluationId} credentialPolicy must be absent`);
      }
      if (registration.networkPolicy !== "deny-all") {
        fail(`registry ${evaluationId} networkPolicy must deny all traffic`);
      }
      if (
        registration.browserPolicy !== undefined &&
        registration.browserPolicy !== "frozen-chromium"
      ) fail(`registry ${evaluationId} browserPolicy is invalid`);
      continue;
    }
    if (registration.kind === "coordinator-evidence") {
      assertClosedKeys(
        registration,
        ["kind", "evaluator"],
        `registry ${evaluationId}`,
      );
      if (!COORDINATOR_EVALUATORS.has(registration.evaluator)) {
        fail(`registry ${evaluationId} coordinator evaluator is invalid`);
      }
      continue;
    }
    fail(`registry ${evaluationId} registration kind is invalid`);
  }
  assertUniqueStrings(
    registry.providerCredentialDenylist,
    "registry providerCredentialDenylist",
    /^[A-Z][A-Z0-9_]*$/,
  );
  assertClosedKeys(
    registry.renderedProviderPolicy,
    ["responses", "maximumMeteredCalls", "network"],
    "registry renderedProviderPolicy",
  );
  if (registry.renderedProviderPolicy.responses !== "recorded-or-stubbed") {
    fail("rendered provider responses must be recorded or stubbed");
  }
  if (registry.renderedProviderPolicy.maximumMeteredCalls !== 0) {
    fail("rendered provider policy must permit zero metered calls");
  }
  if (registry.renderedProviderPolicy.network !== "loopback-only") {
    fail("rendered provider network must be loopback-only");
  }
  assertClosedKeys(registry.requiredArtifacts, ["qualification", "browser"], "registry requiredArtifacts");
  assertUniqueStrings(registry.requiredArtifacts.qualification, "qualification artifacts");
  assertUniqueStrings(registry.requiredArtifacts.browser, "browser artifacts");
  for (const [index, artifact] of registry.requiredArtifacts.qualification.entries()) {
    safeRelativePath(artifact, `qualification artifact ${index}`, { directory: artifact.endsWith("/") });
  }
  for (const [index, artifact] of registry.requiredArtifacts.browser.entries()) {
    safeRelativePath(artifact, `browser artifact ${index}`, { directory: artifact.endsWith("/") });
  }
  assertExactStrings(registry.requiredArtifacts.qualification, REQUIRED_QUALIFICATION_ARTIFACTS, "qualification artifacts");
  assertExactStrings(registry.requiredArtifacts.browser, REQUIRED_BROWSER_ARTIFACTS, "browser artifacts");
  validatePointer(registry.viewportsPointer, "registry viewportsPointer");
  assertClosedKeys(
    registry.thresholdPointers,
    ["composer", "failedCandidateRetention", "accessibility", "performanceQualification"],
    "registry thresholdPointers",
  );
  for (const [key, pointer] of Object.entries(registry.thresholdPointers)) {
    validatePointer(pointer, `registry thresholdPointers.${key}`);
  }
  assertClosedKeys(
    registry.browserContract,
    ["revision", "executableRelativePath", "bundleSha256", "fileCount", "symlinkCount", "totalBytes"],
    "registry browserContract",
  );
  assertString(registry.browserContract.revision, "browser revision", /^[0-9]+$/);
  safeRelativePath(registry.browserContract.executableRelativePath, "browser executableRelativePath");
  assertString(registry.browserContract.bundleSha256, "browser bundleSha256", /^[a-f0-9]{64}$/);
  assertPositiveInteger(registry.browserContract.fileCount, "browser fileCount");
  if (!Number.isSafeInteger(registry.browserContract.symlinkCount) || registry.browserContract.symlinkCount < 0) {
    fail("browser symlinkCount must be a nonnegative safe integer");
  }
  assertPositiveInteger(registry.browserContract.totalBytes, "browser totalBytes");
  assertClosedKeys(
    registry.runtimeContract,
    [
      "platform", "arch", "nodeVersion", "nodeExecutable", "nodeExecutableSha256",
      "gitExecutable", "gitExecutableSha256", "npmBundleRoot", "npmCliRelativePath",
      "npmBundleSha256", "npmFileCount", "npmSymlinkCount", "npmTotalBytes",
    ],
    "registry runtimeContract",
  );
  if (registry.runtimeContract.platform !== "darwin" || registry.runtimeContract.arch !== "arm64") {
    fail("runtime contract must bind the supported darwin arm64 coordinator");
  }
  assertString(registry.runtimeContract.nodeVersion, "runtime nodeVersion", /^\d+\.\d+\.\d+$/);
  for (const key of ["nodeExecutable", "gitExecutable", "npmBundleRoot"]) {
    assertString(registry.runtimeContract[key], `runtime ${key}`);
    if (!path.isAbsolute(registry.runtimeContract[key]) || /[\0\r\n]/.test(registry.runtimeContract[key])) {
      fail(`runtime ${key} must be an absolute path`);
    }
  }
  safeRelativePath(registry.runtimeContract.npmCliRelativePath, "runtime npmCliRelativePath");
  for (const key of ["nodeExecutableSha256", "gitExecutableSha256", "npmBundleSha256"]) {
    assertString(registry.runtimeContract[key], `runtime ${key}`, /^[a-f0-9]{64}$/);
  }
  assertPositiveInteger(registry.runtimeContract.npmFileCount, "runtime npmFileCount");
  if (!Number.isSafeInteger(registry.runtimeContract.npmSymlinkCount) || registry.runtimeContract.npmSymlinkCount < 0) {
    fail("runtime npmSymlinkCount must be a nonnegative safe integer");
  }
  assertPositiveInteger(registry.runtimeContract.npmTotalBytes, "runtime npmTotalBytes");
  assertClosedKeys(
    registry.fixtureContract,
    ["schemaVersion", "fixtureVersion", "requiredFields", "purposes", "manifestSha256ByPurpose", "buildSha256ByPurpose"],
    "registry fixtureContract",
  );
  if (registry.fixtureContract.schemaVersion !== 1) fail("fixture schemaVersion must be 1");
  assertString(registry.fixtureContract.fixtureVersion, "fixture version", /^\d+\.\d+\.\d+$/);
  assertUniqueStrings(registry.fixtureContract.requiredFields, "fixture requiredFields", /^[a-z][A-Za-z0-9]*$/);
  assertUniqueStrings(registry.fixtureContract.purposes, "fixture purposes", /^[a-z][a-z0-9-]*$/);
  assertClosedKeys(
    registry.fixtureContract.manifestSha256ByPurpose,
    registry.fixtureContract.purposes,
    "fixture manifest hashes",
  );
  for (const [purpose, hash] of Object.entries(registry.fixtureContract.manifestSha256ByPurpose)) {
    assertString(hash, `fixture manifest hash ${purpose}`, /^[a-f0-9]{64}$/);
  }
  assertClosedKeys(
    registry.fixtureContract.buildSha256ByPurpose,
    registry.fixtureContract.purposes,
    "fixture build hashes",
  );
  for (const [purpose, hash] of Object.entries(registry.fixtureContract.buildSha256ByPurpose)) {
    assertString(hash, `fixture build hash ${purpose}`, /^[a-f0-9]{64}$/);
  }
  return registry;
}

async function readFrontMatters(root, registry, ticketById) {
  const fronts = new Map();
  for (const ticket of ticketById.values()) {
    const relativePath = `${registry.ticketContract.ticketDirectory}/${ticket.file}`;
    const bytes = await readRepositoryFile(root, relativePath, `ticket ${ticket.id}`);
    const front = parseTicketFrontMatter(bytes, `ticket ${ticket.id}`);
    if (
      front.id !== ticket.id ||
      front.title !== ticket.title ||
      front.priority !== ticket.priority ||
      front.epic !== ticket.epic ||
      !sameStrings(front.dependsOn, ticket.dependsOn) ||
      front.dependsOn.length !== ticket.dependsOn.length
    ) {
      fail(`ticket ${ticket.id} front matter does not match the ticket manifest`);
    }
    assertUniqueStrings(front.requirements, `ticket ${ticket.id} requirements`, /^REQ-[A-Z]+-\d{3}$/);
    assertUniqueStrings(front.evals, `ticket ${ticket.id} evals`, /^EVAL-[A-Z]+-\d{3}$/);
    fronts.set(ticket.id, front);
  }
  return fronts;
}

function validateBidirectionalEdges(manifest, evaluationById, ticketById, fronts, traceRows) {
  const ticketEvaluations = new Map([...ticketById.keys()].map((id) => [id, new Set()]));
  const requirementEvaluations = new Map();
  const requirementTickets = new Map();
  for (const evaluation of manifest.evaluations) {
    for (const ticket of evaluation.tickets) {
      if (!ticketById.has(ticket)) fail(`${evaluation.id} references missing ticket ${ticket}`);
      ticketEvaluations.get(ticket).add(evaluation.id);
    }
    for (const requirement of evaluation.requirements) {
      addEdge(requirementEvaluations, requirement, evaluation.id);
    }
  }
  for (const [ticketId, front] of fronts) {
    assertExactStrings(front.evals, ticketEvaluations.get(ticketId), `ticket ${ticketId} eval links`);
    for (const requirement of front.requirements) addEdge(requirementTickets, requirement, ticketId);
    for (const evaluationId of front.evals) {
      if (!evaluationById.has(evaluationId)) fail(`ticket ${ticketId} references missing eval ${evaluationId}`);
    }
  }
  const requirements = new Set([...requirementEvaluations.keys(), ...requirementTickets.keys()]);
  assertExactStrings(traceRows.keys(), requirements, "traceability requirement rows");
  for (const requirement of requirements) {
    const row = traceRows.get(requirement);
    assertExactStrings(
      row.evaluations,
      requirementEvaluations.get(requirement) ?? new Set(),
      `traceability ${requirement} evaluation edges`,
    );
    assertExactStrings(
      row.tickets,
      requirementTickets.get(requirement) ?? new Set(),
      `traceability ${requirement} ticket edges`,
    );
  }
}

async function validatePointers(root, registry, manifest) {
  const documents = new Map([[registry.evaluationManifest.path, manifest]]);
  const resolve = async (pointer, label) => {
    if (!documents.has(pointer.path)) {
      documents.set(pointer.path, await readRepositoryJson(root, pointer.path, `${label} source`));
    }
    return pointerValue(documents.get(pointer.path), pointer.jsonPointer, label);
  };
  const viewports = await resolve(registry.viewportsPointer, "viewports pointer");
  if (JSON.stringify(viewports) !== JSON.stringify(manifest.viewports)) {
    fail("viewports pointer does not resolve the frozen manifest viewports");
  }
  for (const [key, pointer] of Object.entries(registry.thresholdPointers)) {
    const threshold = await resolve(pointer, `${key} threshold pointer`);
    if (JSON.stringify(threshold) !== JSON.stringify(manifest.thresholds[key])) {
      fail(`${key} threshold pointer does not resolve the frozen manifest threshold`);
    }
  }
}

export async function validatePageIrHarnessContract(repositoryRoot) {
  const root = path.resolve(repositoryRoot);
  const [registryBytes, registryLock] = await Promise.all([
    readRepositoryFile(root, REGISTRY_PATH, "harness registry"),
    readRepositoryJson(root, REGISTRY_LOCK_PATH, "harness registry lock"),
  ]);
  validateLock(registryLock, "harness registry lock", "registryVersion", "registryPath");
  if (registryLock.registryPath !== REGISTRY_PATH) fail("harness registry lock path is incorrect");
  if (sha256(registryBytes) !== registryLock.sha256) fail("harness registry SHA-256 mismatch");
  const registry = validateRegistry(parseJson(registryBytes, "harness registry"));
  if (registry.registryVersion !== registryLock.registryVersion) {
    fail("harness registry version does not match its lock");
  }

  const manifestBytes = await readRepositoryFile(
    root,
    registry.evaluationManifest.path,
    "evaluation manifest",
  );
  const manifest = parseJson(manifestBytes, "evaluation manifest");
  const evaluationById = validateEvaluationManifest(manifest);
  const manifestLock = await readRepositoryJson(
    root,
    registry.evaluationManifest.lockPath,
    "evaluation manifest lock",
  );
  validateLock(manifestLock, "evaluation manifest lock", "contractVersion", "manifestPath");
  if (manifestLock.manifestPath !== registry.evaluationManifest.path) {
    fail("evaluation manifest lock path does not match the registry");
  }
  if (manifestLock.contractVersion !== manifest.contractVersion) {
    fail("evaluation manifest version does not match its lock");
  }
  if (sha256(manifestBytes) !== manifestLock.sha256) {
    fail("evaluation manifest SHA-256 mismatch");
  }

  const ticketManifest = await readRepositoryJson(
    root,
    registry.ticketContract.manifestPath,
    "ticket manifest",
  );
  const ticketById = validateTicketManifest(ticketManifest);
  if (ticketManifest.evalManifest !== registry.evaluationManifest.path) {
    fail("ticket manifest does not reference the frozen evaluation manifest");
  }
  const productRequirements = parseProductRequirements(
    await readRepositoryFile(root, ticketManifest.prd, "product requirements"),
  );
  const fronts = await readFrontMatters(root, registry, ticketById);
  validateOwnerOrder(manifest, evaluationById, ticketById);
  const traceRows = parseTraceability(
    await readRepositoryFile(
      root,
      registry.ticketContract.traceabilityPath,
      "traceability",
    ),
  );
  validateBidirectionalEdges(manifest, evaluationById, ticketById, fronts, traceRows);
  const referencedRequirements = new Set([
    ...manifest.evaluations.flatMap((evaluation) => evaluation.requirements),
    ...[...fronts.values()].flatMap((front) => front.requirements),
  ]);
  assertExactStrings(
    referencedRequirements,
    productRequirements,
    "product requirement references",
  );

  const credentialEvaluation = evaluationById.get("EVAL-SEC-003");
  if (
    !credentialEvaluation ||
    manifest.evaluationOwners["EVAL-SEC-003"] !== "OBX-040" ||
    !credentialEvaluation.requirements.includes("REQ-SEC-005")
  ) {
    fail("EVAL-SEC-003 ownership or requirement binding is invalid");
  }
  assertExactStrings(
    Object.keys(registry.evaluations),
    [...evaluationById.keys()],
    "registry evaluations",
  );
  for (const [evaluationId, evaluation] of evaluationById) {
    const registration = registry.evaluations[evaluationId];
    if (evaluation.method === "human") {
      if (
        registration.kind !== "coordinator-evidence" ||
        registration.evaluator !== "qualification-human-review"
      ) {
        fail(`human evaluation ${evaluationId} requires the qualification human coordinator`);
      }
    } else if (evaluationId === "EVAL-OPS-004") {
      if (
        registration.kind !== "coordinator-evidence" ||
        registration.evaluator !== "qualification-contract"
      ) {
        fail("EVAL-OPS-004 requires the coordinator qualification contract");
      }
    } else if (evaluation.method === "rendered" && evaluationId.startsWith("EVAL-WEB-")) {
      if (registration.kind !== "browser-corpus-tests") {
        fail(`rendered browser corpus evaluation ${evaluationId} requires browser-corpus-tests`);
      }
    } else if (evaluation.method === "rendered") {
      if (
        registration.kind !== "coordinator-evidence" ||
        registration.evaluator !== "rendered-evidence"
      ) {
        fail(`rendered evaluation ${evaluationId} requires coordinator rendered evidence`);
      }
    } else if (registration.kind !== "credential-free-tests") {
      fail(`${evaluation.method} evaluation ${evaluationId} requires credential-free tests`);
    }
    if (TEST_REGISTRATION_KINDS.has(registration.kind)) {
      for (const testFile of registration.testFiles) {
        await readRepositoryFile(root, testFile, `registered test ${testFile}`, MAX_REGISTERED_TEST_BYTES);
      }
    }
  }
  await validatePointers(root, registry, manifest);
  assertExactStrings(registry.fixtureContract.purposes, manifest.corpus, "fixture purposes");
  for (const purpose of manifest.corpus) {
    const fixtureManifestBytes = await readRepositoryFile(
      root,
      `${CONTRACT_ROOT}/fixtures/${purpose}/fixture.json`,
      `frozen fixture manifest ${purpose}`,
    );
    if (
      sha256(fixtureManifestBytes) !==
      registry.fixtureContract.manifestSha256ByPurpose[purpose]
    ) {
      fail(`frozen fixture manifest hash mismatch: ${purpose}`);
    }
  }
  if (
    registry.evaluationManifest.contractVersion !== manifest.contractVersion ||
    registry.evaluationManifest.sha256 !== sha256(manifestBytes)
  ) {
    fail("harness registry pins a different evaluation manifest version or SHA-256");
  }
  return {
    status: "PASS",
    contractVersion: manifest.contractVersion,
    registryVersion: registry.registryVersion,
    evaluationCount: evaluationById.size,
    ticketCount: ticketById.size,
    credentialFreeTestCount: registry.evaluations["EVAL-SEC-003"].testFiles.length,
    resultStates: [...manifest.resultStates],
    manifestSha256: sha256(manifestBytes),
    registrySha256: sha256(registryBytes),
    manifest,
    registry,
  };
}

/** CLI-facing non-throwing contract check. Contract errors remain structured data;
 * programmer and filesystem errors are normalized to one bounded message. */
export async function validateEvaluationContract({
  root = DEFAULT_REPOSITORY_ROOT,
} = {}) {
  try {
    const summary = await validatePageIrHarnessContract(root);
    return {
      errors: [],
      manifest: summary.manifest,
      registry: summary.registry,
      manifestSha256: summary.manifestSha256,
      registrySha256: summary.registrySha256,
    };
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : String(error)],
      manifest: undefined,
      registry: undefined,
      manifestSha256: undefined,
      registrySha256: undefined,
    };
  }
}

async function writeExclusiveDurable(
  repositoryRoot,
  lockDirectory,
  lockPath,
  bytes,
) {
  const directory = repositoryPath(
    repositoryRoot,
    `${lockDirectory}/placeholder`,
    "future lock directory placeholder",
  );
  const directoryPath = path.dirname(directory);
  const directorySnapshots = await snapshotNoSymlinkComponents(
    repositoryRoot,
    lockDirectory,
    "future lock directory",
  );
  const expectedDirectory = directorySnapshots.at(-1);
  const directoryHandle = await fs.open(directoryPath, "r");
  const finalPath = repositoryPath(repositoryRoot, lockPath, "future manifest lock");
  const temporaryPath = path.join(
    directoryPath,
    `.${path.basename(finalPath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let temporaryHandle;
  let temporaryExists = false;
  try {
    const openedDirectory = await directoryHandle.stat({ bigint: true });
    if (
      !openedDirectory.isDirectory() ||
      openedDirectory.dev !== expectedDirectory.dev ||
      openedDirectory.ino !== expectedDirectory.ino
    ) {
      fail("future lock directory changed before publication");
    }
    temporaryHandle = await fs.open(temporaryPath, "wx", 0o600);
    temporaryExists = true;
    await temporaryHandle.writeFile(bytes);
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;
    await assertSnapshotsUnchanged(directorySnapshots, "future lock directory");
    try {
      await fs.link(temporaryPath, finalPath);
    } catch (error) {
      if (error?.code === "EEXIST") {
        fail(`manifest version already has a lock at ${finalPath}`);
      }
      throw error;
    }
    await fs.unlink(temporaryPath);
    temporaryExists = false;
    await directoryHandle.sync();
    await assertSnapshotsUnchanged(directorySnapshots, "future lock directory");
    const publishedBytes = await readBoundedRegularFile(
      finalPath,
      "future manifest lock",
      bytes.length,
    );
    if (!publishedBytes.equals(bytes)) fail("future manifest lock changed during publication");
  } finally {
    await temporaryHandle?.close().catch(() => {});
    if (temporaryExists) await fs.unlink(temporaryPath).catch(() => {});
    await directoryHandle.close();
  }
}

async function recoverInterruptedLockPublications(
  directory,
  entries,
  directorySnapshots,
) {
  const temporaryPattern = /^\.(manifest-(\d+\.\d+\.\d+)\.lock\.json)\.\d+\.[a-f0-9]{16}\.tmp$/;
  for (const entry of entries) {
    const match = temporaryPattern.exec(entry.name);
    if (!match || !entry.isFile()) continue;
    const temporaryPath = path.join(directory, entry.name);
    const finalPath = path.join(directory, match[1]);
    const [temporaryStat, finalStat] = await Promise.all([
      fs.lstat(temporaryPath, { bigint: true }),
      fs.lstat(finalPath, { bigint: true }).catch((error) => {
        if (error?.code === "ENOENT") return undefined;
        throw error;
      }),
    ]);
    if (!finalStat) continue;
    if (
      temporaryStat.isSymbolicLink() ||
      finalStat.isSymbolicLink() ||
      !temporaryStat.isFile() ||
      !finalStat.isFile() ||
      temporaryStat.dev !== finalStat.dev ||
      temporaryStat.ino !== finalStat.ino ||
      temporaryStat.nlink !== 2n ||
      finalStat.nlink !== 2n
    ) {
      fail(`future lock directory contains an unsafe interrupted publication: ${entry.name}`);
    }
    await assertSnapshotsUnchanged(directorySnapshots, "future lock directory");
    const directoryHandle = await fs.open(directory, "r");
    try {
      const openedDirectory = await directoryHandle.stat({ bigint: true });
      const expectedDirectory = directorySnapshots.at(-1);
      if (
        !openedDirectory.isDirectory() ||
        openedDirectory.dev !== expectedDirectory.dev ||
        openedDirectory.ino !== expectedDirectory.ino
      ) {
        fail("future lock directory changed during interrupted publication recovery");
      }
      await fs.unlink(temporaryPath);
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
    await assertSnapshotsUnchanged(directorySnapshots, "future lock directory");
  }
}

export async function createFutureManifestLock({
  repositoryRoot,
  manifestPath,
  lockDirectory,
}) {
  const root = path.resolve(repositoryRoot);
  safeRelativePath(manifestPath, "future manifest path");
  safeRelativePath(lockDirectory, "future lock directory");
  const manifestBytes = await readRepositoryFile(root, manifestPath, "future evaluation manifest");
  const manifest = parseJson(manifestBytes, "future evaluation manifest");
  validateEvaluationManifest(manifest);
  const directoryPath = repositoryPath(root, `${lockDirectory}/placeholder`, "future lock directory placeholder");
  const directory = path.dirname(directoryPath);
  const directorySnapshots = await snapshotNoSymlinkComponents(
    root,
    lockDirectory,
    "future lock directory",
  );
  const directoryStat = await fs.lstat(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    fail("future lock directory must be a regular directory");
  }
  const entries = await fs.readdir(directory, { withFileTypes: true });
  await assertSnapshotsUnchanged(directorySnapshots, "future lock directory");
  await recoverInterruptedLockPublications(directory, entries, directorySnapshots);
  for (const entry of entries) {
    if (entry.isSymbolicLink() || (!entry.isFile() && entry.name.endsWith(".lock.json"))) {
      fail(`future lock directory contains an unsafe entry: ${entry.name}`);
    }
    if (!entry.isFile() || !entry.name.endsWith(".lock.json")) continue;
    const relative = `${lockDirectory}/${entry.name}`;
    const existing = parseJson(
      await readRepositoryFile(root, relative, `existing manifest lock ${entry.name}`),
      `existing manifest lock ${entry.name}`,
    );
    validateLock(existing, `existing manifest lock ${entry.name}`, "contractVersion", "manifestPath");
    if (existing.contractVersion === manifest.contractVersion) {
      fail(`manifest version ${manifest.contractVersion} already has a lock`);
    }
  }
  const lockPath = `${lockDirectory}/manifest-${manifest.contractVersion}.lock.json`;
  const lock = {
    schemaVersion: 1,
    contractVersion: manifest.contractVersion,
    manifestPath,
    sha256: sha256(manifestBytes),
  };
  try {
    await writeExclusiveDurable(
      root,
      lockDirectory,
      lockPath,
      Buffer.from(`${JSON.stringify(lock, null, 2)}\n`),
    );
  } catch (error) {
    if (error instanceof Error && /already has a lock/.test(error.message)) {
      fail(`manifest version ${manifest.contractVersion} already has a lock`);
    }
    throw error;
  }
  return { lockPath, lock };
}

export const createVersionedManifestLock = createFutureManifestLock;
