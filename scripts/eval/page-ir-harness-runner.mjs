import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";

const RESULT_STATES = new Set(["PASS", "FAIL", "BLOCKED", "NOT_RUN"]);
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SAFE_COMMAND_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RUNTIME_ENV_KEYS = new Set([
  "PATH", "TMPDIR", "TMP", "TEMP", "SHELL", "USER", "LOGNAME",
  "LANG", "LC_ALL", "TERM", "CI",
]);
const CREDENTIAL_KEY = /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i;
const DARWIN_SANDBOX_PROFILE_PREFIX = [
  "(version 1)",
  "(deny default)",
  "(allow process*)",
  "(allow sysctl-read)",
  "(allow mach-lookup)",
  "(allow file-read*)",
  "(deny file-read* (subpath \"/Users\"))",
  "(deny file-read* (subpath \"/Volumes\"))",
  "(deny file-read* (subpath \"/private/tmp\"))",
  "(deny file-read* (subpath \"/private/var/folders\"))",
  "(deny network*)",
];
const BROWSER_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "desktop", width: 1440, height: 900 }),
  Object.freeze({ id: "tablet", width: 768, height: 1024 }),
  Object.freeze({ id: "mobile", width: 390, height: 844 }),
]);
const BROWSER_CAPTURE_IDS = Object.freeze([
  "desktop", "tablet", "mobile", "no-js", "reduced-motion",
]);

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function strings(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function sortedUniqueStrings(value) {
  return strings(value) && new Set(value).size === value.length &&
    JSON.stringify([...value].sort()) === JSON.stringify(value);
}

function validBrowserAuthority(value) {
  return exactKeys(value, [
    "revision", "executableRelativePath", "bundleSha256", "fileCount", "symlinkCount", "totalBytes",
  ]) && /^[0-9]+$/.test(value.revision ?? "") &&
    typeof value.executableRelativePath === "string" && value.executableRelativePath.length > 0 &&
    !path.isAbsolute(value.executableRelativePath) &&
    !value.executableRelativePath.split(/[\\/]/).includes("..") &&
    /^[a-f0-9]{64}$/.test(value.bundleSha256 ?? "") &&
    Number.isSafeInteger(value.fileCount) && value.fileCount > 0 &&
    Number.isSafeInteger(value.symlinkCount) && value.symlinkCount >= 0 &&
    Number.isSafeInteger(value.totalBytes) && value.totalBytes > 0;
}

function validRuntimeAuthority(value) {
  return exactKeys(value, [
    "platform", "arch", "nodeVersion", "nodeExecutable", "nodeExecutableSha256",
    "gitExecutable", "gitExecutableSha256", "npmBundleRoot", "npmCliRelativePath",
    "npmBundleSha256", "npmFileCount", "npmSymlinkCount", "npmTotalBytes",
  ]) && value.platform === "darwin" && value.arch === "arm64" &&
    /^\d+\.\d+\.\d+$/.test(value.nodeVersion ?? "") &&
    [value.nodeExecutable, value.gitExecutable, value.npmBundleRoot].every((entry) =>
      typeof entry === "string" && path.isAbsolute(entry) && !/[\0\r\n]/.test(entry)
    ) && typeof value.npmCliRelativePath === "string" && value.npmCliRelativePath.length > 0 &&
    !path.isAbsolute(value.npmCliRelativePath) &&
    !value.npmCliRelativePath.split(/[\\/]/).includes("..") &&
    [value.nodeExecutableSha256, value.gitExecutableSha256, value.npmBundleSha256]
      .every((entry) => /^[a-f0-9]{64}$/.test(entry ?? "")) &&
    Number.isSafeInteger(value.npmFileCount) && value.npmFileCount > 0 &&
    Number.isSafeInteger(value.npmSymlinkCount) && value.npmSymlinkCount >= 0 &&
    Number.isSafeInteger(value.npmTotalBytes) && value.npmTotalBytes > 0;
}

function candidateBuildSha256(files) {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(String(file.sizeBytes));
    hash.update("\0");
    hash.update(file.sha256);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function parseCandidateManifest(bytes, expectedBuildSha256, expectedSiteInventory, fixtureId) {
  let manifest;
  try {
    manifest = JSON.parse(bytes?.toString("utf8") ?? "");
  } catch {
    fail(`browser evidence candidate manifest is invalid: ${fixtureId}`);
  }
  if (
    !exactKeys(manifest, ["schemaVersion", "entry", "files", "totalBytes", "buildSha256"]) ||
    manifest.schemaVersion !== 1 || manifest.entry !== "index.html" ||
    !Array.isArray(manifest.files) || manifest.files.length === 0 ||
    !Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes < 0 ||
    manifest.buildSha256 !== expectedBuildSha256
  ) fail(`browser evidence candidate manifest is invalid: ${fixtureId}`);
  let previous;
  let totalBytes = 0;
  for (const file of manifest.files) {
    if (
      !exactKeys(file, ["path", "sizeBytes", "sha256"]) ||
      typeof file.path !== "string" || file.path.length === 0 ||
      path.isAbsolute(file.path) || file.path.split(/[\\/]/).includes("..") ||
      (previous !== undefined && file.path <= previous) ||
      !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256 ?? "")
    ) fail(`browser evidence candidate manifest is invalid: ${fixtureId}`);
    previous = file.path;
    totalBytes += file.sizeBytes;
  }
  const expectedInventory = [
    ...manifest.files,
    {
      path: "candidate-manifest.json",
      sizeBytes: bytes.length,
      sha256: sha256(bytes),
    },
  ].sort((left, right) => left.path.localeCompare(right.path));
  if (
    totalBytes !== manifest.totalBytes ||
    !manifest.files.some((file) => file.path === "index.html") ||
    candidateBuildSha256(manifest.files) !== manifest.buildSha256 ||
    JSON.stringify(expectedSiteInventory) !== JSON.stringify(expectedInventory)
  ) fail(`browser evidence site inventory is not bound to the frozen build: ${fixtureId}`);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function validateBrowserEvidencePng(bytes, expectedWidth, expectedHeight, label) {
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) fail(`${label} is not a PNG`);
  let offset = PNG_SIGNATURE.length;
  let ihdr;
  const idat = [];
  let ended = false;
  while (offset + 12 <= bytes.length && !ended) {
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) fail(`${label} has a truncated PNG chunk`);
    const type = bytes.subarray(offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc32(Buffer.concat([type, data])) !== bytes.readUInt32BE(offset + 8 + length)) {
      fail(`${label} has an invalid PNG checksum`);
    }
    const name = type.toString("ascii");
    if (!ihdr && name !== "IHDR") fail(`${label} PNG does not begin with IHDR`);
    if (name === "IHDR") {
      if (ihdr || length !== 13) fail(`${label} has an invalid PNG IHDR`);
      ihdr = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        bitDepth: data[8], colorType: data[9], compression: data[10],
        filter: data[11], interlace: data[12],
      };
    } else if (name === "IDAT") idat.push(data);
    else if (name === "IEND") {
      if (length !== 0) fail(`${label} has an invalid PNG IEND`);
      ended = true;
    }
    offset = chunkEnd;
  }
  if (
    !ended || offset !== bytes.length || !ihdr || idat.length === 0 ||
    ihdr.width !== expectedWidth || ihdr.height !== expectedHeight ||
    ihdr.compression !== 0 || ihdr.filter !== 0 || ihdr.interlace !== 0
  ) fail(`${label} PNG dimensions or encoding are invalid`);
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(ihdr.colorType);
  if (!channels || ![1, 2, 4, 8, 16].includes(ihdr.bitDepth)) fail(`${label} PNG color encoding is invalid`);
  const rowBytes = Math.ceil((ihdr.width * channels * ihdr.bitDepth) / 8);
  const expectedDecodedBytes = ihdr.height * (rowBytes + 1);
  let decoded;
  try {
    decoded = inflateSync(Buffer.concat(idat), { maxOutputLength: expectedDecodedBytes });
  } catch {
    fail(`${label} PNG image data cannot be decoded`);
  }
  if (decoded.length !== expectedDecodedBytes) fail(`${label} PNG decoded size is invalid`);
  for (let row = 0; row < ihdr.height; row += 1) {
    if (decoded[row * (rowBytes + 1)] > 4) fail(`${label} PNG row filter is invalid`);
  }
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

function darwinSandboxProfile(environment, executionRoot) {
  const temporary = environment.TMPDIR;
  if (
    typeof temporary !== "string" ||
    !path.isAbsolute(temporary) ||
    /["\\]/.test(temporary) ||
    typeof executionRoot !== "string" ||
    !path.isAbsolute(executionRoot) ||
    /["\\]/.test(executionRoot)
  ) {
    fail("evaluation filesystem sandbox authority is invalid");
  }
  const sealedInputsRoot = environment.ONEBOX_EVAL_INPUTS_ROOT;
  const sealedBrowserRoot = environment.ONEBOX_EVAL_BROWSER_ROOT;
  for (const [label, authority] of [
    ["sealed input", sealedInputsRoot],
    ["sealed browser", sealedBrowserRoot],
  ]) {
    if (
      authority !== undefined &&
      (typeof authority !== "string" ||
        !path.isAbsolute(authority) ||
        /["\\\0\r\n]/.test(authority))
    ) fail(`${label} sandbox authority is invalid`);
  }
  const readRoots = new Set([
    executionRoot,
    temporary,
    ...(sealedInputsRoot ? [sealedInputsRoot] : []),
    ...(sealedBrowserRoot ? [sealedBrowserRoot] : []),
  ]);
  const readAncestors = new Set();
  for (const root of readRoots) {
    let ancestor = path.dirname(root);
    while (ancestor !== path.dirname(ancestor)) {
      readAncestors.add(ancestor);
      ancestor = path.dirname(ancestor);
    }
  }
  return [
    ...DARWIN_SANDBOX_PROFILE_PREFIX,
    ...[...readAncestors].map((directory) =>
      `(allow file-read-metadata (literal "${directory}"))`
    ),
    ...[...readRoots].flatMap((directory) => [
      `(allow file-read* (literal "${directory}"))`,
      `(allow file-read* (subpath "${directory}"))`,
    ]),
    `(allow file-write* (literal "${temporary}"))`,
    `(allow file-write* (subpath "${temporary}"))`,
    "(allow file-write* (literal \"/dev/null\"))",
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

async function assertSealedInputTree(root, relative = "") {
  const directory = resolveWithin(root, relative);
  const directoryStat = await fs.lstat(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    fail("sealed input authority must contain physical directories");
  }
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const childRelative = path.join(relative, entry.name);
    const child = resolveWithin(root, childRelative);
    if (entry.isSymbolicLink()) fail("sealed input authority must not contain symlinks");
    if (entry.isDirectory()) {
      await assertSealedInputTree(root, childRelative);
      continue;
    }
    if (!entry.isFile()) fail("sealed input authority must contain regular files only");
    const stat = await fs.lstat(child);
    if (stat.nlink !== 1 || (stat.mode & 0o222) !== 0) {
      fail("sealed input authority must contain read-only files without hard links");
    }
  }
}

async function validateSealedInputsRoot(inputsRoot) {
  if (typeof inputsRoot !== "string" || !path.isAbsolute(inputsRoot)) {
    fail("WEB evaluation requires an absolute sealed input root");
  }
  const authority = await openStableDirectoryAuthority(inputsRoot, "sealed input authority");
  try {
    await assertSealedInputTree(authority.physical);
    await assertDirectoryAuthority(authority, "sealed input authority");
    if (path.basename(authority.physical) !== "inputs") {
      fail("sealed input authority must be the prepared run inputs directory");
    }
    return authority.physical;
  } finally {
    await authority.handle.close();
  }
}

async function validateSealedBrowserRoot(browserRoot) {
  if (typeof browserRoot !== "string" || !path.isAbsolute(browserRoot)) {
    fail("WEB evaluation requires an absolute sealed browser evidence root");
  }
  const authority = await openStableDirectoryAuthority(browserRoot, "sealed browser evidence authority");
  try {
    await assertSealedInputTree(authority.physical);
    await assertDirectoryAuthority(authority, "sealed browser evidence authority");
    if (path.basename(authority.physical) !== "browser") {
      fail("sealed browser evidence authority must be the prepared run browser directory");
    }
    return authority.physical;
  } finally {
    await authority.handle.close();
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

function validFileInventory(value) {
  return Array.isArray(value) && value.every((entry) =>
    exactKeys(entry, ["path", "sizeBytes", "sha256"]) &&
    typeof entry.path === "string" && entry.path.length > 0 &&
    !path.isAbsolute(entry.path) && !entry.path.split(/[\\/]/).includes("..") &&
    Number.isSafeInteger(entry.sizeBytes) && entry.sizeBytes >= 0 &&
    /^[a-f0-9]{64}$/.test(entry.sha256 ?? "")
  );
}

function validSelectorObservations(value, selectors, action) {
  return Array.isArray(selectors) && Array.isArray(value) && value.length === selectors.length &&
    value.every((entry, index) =>
      exactKeys(entry, action
        ? ["selector", "present", "visible", "href", "text"]
        : ["selector", "present", "visible", "text"]) &&
      entry.selector === selectors[index] &&
      typeof entry.present === "boolean" && typeof entry.visible === "boolean" &&
      typeof entry.text === "string" &&
      (!action || entry.href === null || typeof entry.href === "string")
    );
}

function validQualification(value, captureId, actionSelectors) {
  if (captureId === "no-js") return value === undefined;
  if (captureId === "reduced-motion") {
    return exactKeys(value, ["reducedMotion"]) &&
      exactKeys(value.reducedMotion, ["matches", "allMotionDisabled", "activeMotion"]) &&
      typeof value.reducedMotion.matches === "boolean" &&
      typeof value.reducedMotion.allMotionDisabled === "boolean" &&
      Array.isArray(value.reducedMotion.activeMotion) &&
      value.reducedMotion.activeMotion.every((entry) =>
        exactKeys(entry, ["index", "tag", "id", "animationDuration", "transitionDuration"]) &&
        Number.isSafeInteger(entry.index) && entry.index >= 0 && typeof entry.tag === "string" &&
        (entry.id === null || typeof entry.id === "string") &&
        typeof entry.animationDuration === "string" && typeof entry.transitionDuration === "string"
      );
  }
  return exactKeys(value, ["horizontalOverflow", "overflowingElements", "keyboard", "accessibility"]) &&
    typeof value.horizontalOverflow === "boolean" &&
    Array.isArray(value.overflowingElements) && value.overflowingElements.every((entry) =>
      exactKeys(entry, ["tag", "id", "right", "left"]) && typeof entry.tag === "string" &&
      (entry.id === null || typeof entry.id === "string") &&
      Number.isFinite(entry.right) && Number.isFinite(entry.left)
    ) &&
    exactKeys(value.keyboard, ["reachedSelectors", "unreachedSelectors", "focusSequence"]) &&
    sortedUniqueStrings(value.keyboard.reachedSelectors) &&
    strings(value.keyboard.unreachedSelectors) &&
    value.keyboard.reachedSelectors.every((selector) => actionSelectors.includes(selector)) &&
    value.keyboard.unreachedSelectors.every((selector) => actionSelectors.includes(selector)) &&
    Array.isArray(value.keyboard.focusSequence) && value.keyboard.focusSequence.every((entry) =>
      exactKeys(entry, ["tag", "id", "matched"]) &&
      (entry.tag === null || typeof entry.tag === "string") &&
      (entry.id === null || typeof entry.id === "string") &&
      strings(entry.matched) && entry.matched.every((selector) => actionSelectors.includes(selector))
    ) &&
    exactKeys(value.accessibility, ["seriousOrCritical", "colorContrast"]) &&
    [value.accessibility.seriousOrCritical, value.accessibility.colorContrast].every((violations) =>
      Array.isArray(violations) && violations.every((entry) =>
        exactKeys(entry, ["id", "impact", "nodes"]) && typeof entry.id === "string" &&
        (entry.impact === null || typeof entry.impact === "string") &&
        Number.isSafeInteger(entry.nodes) && entry.nodes >= 0
      )
    );
}

function validateBrowserEvidenceContract({ evidence, verified, fixtureId, selectors }) {
  if (
    !exactKeys(evidence, [
      "schemaVersion", "fixtureBinding", "browserBinding", "qualificationChecks", "providerCalls",
      "networkIsolation", "viewports", "attemptedExternalUrls", "rejectedStaticRequests",
      "siteInventory", "captures", "inventory",
    ]) ||
    evidence.schemaVersion !== 1 || evidence.qualificationChecks !== true ||
    evidence.providerCalls !== 0 ||
    evidence.networkIsolation !== "darwin-sandbox-exec-loopback-only" ||
    JSON.stringify(evidence.viewports) !== JSON.stringify(BROWSER_VIEWPORTS) ||
    !sortedUniqueStrings(evidence.attemptedExternalUrls) ||
    !sortedUniqueStrings(evidence.rejectedStaticRequests) ||
    !validFileInventory(evidence.siteInventory) ||
    JSON.stringify([...evidence.siteInventory].sort((left, right) => left.path.localeCompare(right.path))) !==
      JSON.stringify(evidence.siteInventory) ||
    !Array.isArray(evidence.captures) ||
    evidence.captures.map((capture) => capture?.id).join(",") !== BROWSER_CAPTURE_IDS.join(",") ||
    !validFileInventory(evidence.inventory)
  ) fail(`browser evidence packet contract is invalid: ${fixtureId}`);
  const viewportByCapture = new Map([
    ...BROWSER_VIEWPORTS.map((viewport) => [viewport.id, viewport]),
    ["no-js", BROWSER_VIEWPORTS[0]],
    ["reduced-motion", BROWSER_VIEWPORTS[0]],
  ]);
  for (const capture of evidence.captures) {
    const expectedViewport = viewportByCapture.get(capture.id);
    const expectedKeys = [
      "id", "viewport", "javascriptEnabled", "reducedMotion", "navigation",
      "coreContent", "primaryActions", "javascriptMarker", "reducedMotionMatches",
      "motionObservations", "serviceWorkerRegistrations", "consoleErrors", "pageErrors",
      "localResourceFailures", "blockedRequests", "metrics", "qualification", "screenshot",
    ];
    if (capture.id === "no-js") expectedKeys.splice(expectedKeys.indexOf("qualification"), 1);
    if (
      !expectedViewport || !exactKeys(capture, expectedKeys) ||
      JSON.stringify(capture.viewport) !== JSON.stringify(expectedViewport) ||
      capture.javascriptEnabled !== (capture.id !== "no-js") ||
      capture.reducedMotion !== (capture.id === "reduced-motion" ? "reduce" : "no-preference") ||
      !exactKeys(capture.navigation, ["path", "status", "links"]) ||
      typeof capture.navigation.path !== "string" ||
      !(capture.navigation.status === null || Number.isSafeInteger(capture.navigation.status)) ||
      !Array.isArray(capture.navigation.links) || capture.navigation.links.some((entry) =>
        !exactKeys(entry, ["href", "text"]) ||
        !(entry.href === null || typeof entry.href === "string") ||
        typeof entry.text !== "string"
      ) ||
      !validSelectorObservations(capture.coreContent, selectors?.core, false) ||
      !validSelectorObservations(capture.primaryActions, selectors?.actions, true) ||
      !(capture.javascriptMarker === null || typeof capture.javascriptMarker === "string") ||
      typeof capture.reducedMotionMatches !== "boolean" ||
      !Array.isArray(capture.motionObservations) || capture.motionObservations.some((entry) =>
        !exactKeys(entry, ["id", "animationDuration", "transitionDuration"]) ||
        typeof entry.id !== "string" || typeof entry.animationDuration !== "string" ||
        typeof entry.transitionDuration !== "string"
      ) ||
      !Number.isSafeInteger(capture.serviceWorkerRegistrations) || capture.serviceWorkerRegistrations < 0 ||
      !strings(capture.consoleErrors) || !strings(capture.pageErrors) ||
      !strings(capture.localResourceFailures) || !strings(capture.blockedRequests) ||
      !exactKeys(capture.metrics, ["domContentLoadedMs", "totalTransferBytes", "imageTransferBytes", "cpuThrottleRate"]) ||
      ![capture.metrics.domContentLoadedMs, capture.metrics.totalTransferBytes, capture.metrics.imageTransferBytes, capture.metrics.cpuThrottleRate]
        .every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0) ||
      !validQualification(capture.qualification, capture.id, selectors?.actions ?? []) ||
      !exactKeys(capture.screenshot, ["path", "sizeBytes", "sha256"])
    ) fail(`browser evidence capture contract is invalid: ${fixtureId}/${capture.id}`);
    const screenshotPath = `screenshots/${capture.id}.png`;
    const screenshotBytes = verified.get(screenshotPath);
    if (
      capture.screenshot.path !== screenshotPath || !screenshotBytes ||
      screenshotBytes.length !== capture.screenshot.sizeBytes ||
      sha256(screenshotBytes) !== capture.screenshot.sha256
    ) fail(`browser evidence screenshot binding is invalid: ${fixtureId}/${capture.id}`);
    validateBrowserEvidencePng(
      screenshotBytes,
      expectedViewport.width,
      expectedViewport.height,
      `${fixtureId}/${capture.id}`,
    );
  }
  const expectedScreenshotInventory = evidence.captures
    .map((capture) => ({ ...capture.screenshot }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (JSON.stringify(evidence.inventory) !== JSON.stringify(expectedScreenshotInventory)) {
    fail(`browser evidence screenshot inventory is invalid: ${fixtureId}`);
  }
}

async function verifyImmutableEvidencePackets(
  browserRoot,
  expectedFixtureBindings,
  expectedBuildBindings,
  expectedSelectors,
  expectedBrowserAuthority,
) {
  const entries = await fs.readdir(browserRoot, { withFileTypes: true });
  const verifiedFixtureIds = [];
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
    const verified = await verifyClosedInventory(
      packetRoot,
      lock.files,
      `browser evidence packet ${entry.name}`,
      { lockName: "packet.lock.json" },
    );
    const evidenceBytes = verified.get("browser-evidence.json");
    let evidence;
    try {
      evidence = JSON.parse(evidenceBytes?.toString("utf8") ?? "");
    } catch {
      fail(`browser evidence packet is missing valid evidence: ${entry.name}`);
    }
    if (
      !expectedFixtureBindings ||
      !expectedBuildBindings ||
      !Object.hasOwn(expectedFixtureBindings, entry.name) ||
      !Object.hasOwn(expectedBuildBindings, entry.name) ||
      !exactKeys(evidence?.fixtureBinding, ["fixtureId", "fixtureManifestSha256", "buildSha256"]) ||
      !validBrowserAuthority(evidence?.browserBinding) ||
      JSON.stringify(evidence.browserBinding) !== JSON.stringify(expectedBrowserAuthority) ||
      evidence?.qualificationChecks !== true ||
      evidence?.fixtureBinding?.fixtureId !== entry.name ||
      evidence?.fixtureBinding?.fixtureManifestSha256 !== expectedFixtureBindings[entry.name] ||
      evidence?.fixtureBinding?.buildSha256 !== expectedBuildBindings[entry.name]
    ) fail(`browser evidence fixture binding is invalid: ${entry.name}`);
    validateBrowserEvidenceContract({
      evidence,
      verified,
      fixtureId: entry.name,
      selectors: expectedSelectors?.[entry.name],
    });
    parseCandidateManifest(
      verified.get("candidate-manifest.json"),
      expectedBuildBindings[entry.name],
      evidence.siteInventory,
      entry.name,
    );
    verifiedFixtureIds.push(entry.name);
  }
  return verifiedFixtureIds.sort();
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

function parseFixtureSelectors(bytes, fixtureId) {
  let brief;
  try {
    brief = JSON.parse(bytes?.toString("utf8") ?? "");
  } catch {
    fail(`${fixtureId} brief selector authority is invalid`);
  }
  const core = brief?.expectedCoreSelectors;
  const actions = brief?.expectedActionSelectors;
  if (
    !Array.isArray(core) || core.length === 0 || new Set(core).size !== core.length ||
    !Array.isArray(actions) || actions.length === 0 || new Set(actions).size !== actions.length ||
    [...core, ...actions].some((selector) =>
      typeof selector !== "string" || selector.length === 0 || selector.length > 200
    )
  ) fail(`${fixtureId} brief selector authority is invalid`);
  return { core: [...core], actions: [...actions] };
}

async function copyFixture(fixtureRoot, destination, fixtureId, expectedManifestSha256) {
  const fixtureFile = path.join(fixtureRoot, "fixture.json");
  const fixtureBytes = await readStableRegularFile(fixtureFile, 64 * 1024);
  if (sha256(fixtureBytes) !== expectedManifestSha256) {
    fail(`${fixtureId} fixture manifest does not match the frozen corpus`);
  }
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
  if (
    !contract.fixtureManifestSha256 ||
    Object.keys(contract.fixtureManifestSha256).sort().join(",") !==
      [...corpus].sort().join(",") ||
    Object.values(contract.fixtureManifestSha256).some(
      (value) => !/^[a-f0-9]{64}$/.test(value),
    )
  ) fail("frozen fixture manifest bindings are invalid");
  if (
    !contract.fixtureBuildSha256 ||
    Object.keys(contract.fixtureBuildSha256).sort().join(",") !==
      [...corpus].sort().join(",") ||
    Object.values(contract.fixtureBuildSha256).some(
      (value) => !/^[a-f0-9]{64}$/.test(value),
    )
  ) fail("frozen fixture build bindings are invalid");
  if (!validBrowserAuthority(contract.browserAuthority)) {
    fail("frozen browser authority is invalid");
  }
  if (!validRuntimeAuthority(contract.runtimeAuthority)) {
    fail("frozen coordinator runtime authority is invalid");
  }
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
        await copyFixture(
          resolveWithin(fixturesRoot, fixtureId),
          path.join(inputsDirectory, fixtureId),
          fixtureId,
          contract.fixtureManifestSha256[fixtureId],
        );
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
      fixtureManifestSha256: structuredClone(contract.fixtureManifestSha256),
      fixtureBuildSha256: structuredClone(contract.fixtureBuildSha256),
      browserAuthority: structuredClone(contract.browserAuthority),
      runtimeAuthority: structuredClone(contract.runtimeAuthority),
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
  const inputBytes = await verifyClosedInventory(
    path.join(directory, "inputs"),
    manifest.inputInventory,
    "run input inventory",
  );
  if (
    !manifest.fixtureManifestSha256 ||
    Object.keys(manifest.fixtureManifestSha256).sort().join(",") !==
      [...manifest.corpus].sort().join(",")
  ) fail("run fixture manifest bindings are invalid");
  if (
    !manifest.fixtureBuildSha256 ||
    Object.keys(manifest.fixtureBuildSha256).sort().join(",") !==
      [...manifest.corpus].sort().join(",") ||
    Object.values(manifest.fixtureBuildSha256).some(
      (value) => !/^[a-f0-9]{64}$/.test(value),
    )
  ) fail("run fixture build bindings are invalid");
  if (!validBrowserAuthority(manifest.browserAuthority)) {
    fail("run browser authority is invalid");
  }
  if (!validRuntimeAuthority(manifest.runtimeAuthority)) {
    fail("run coordinator runtime authority is invalid");
  }
  for (const fixtureId of manifest.corpus) {
    const bytes = inputBytes.get(`${fixtureId}/fixture.json`);
    const declaredMissing = manifest.prerequisiteBlockers?.some(
      (blocker) =>
        blocker?.code === "CORPUS_FIXTURES_MISSING" && blocker.detail === fixtureId,
    );
    if (!bytes && declaredMissing) continue;
    if (
      !bytes ||
      sha256(bytes) !== manifest.fixtureManifestSha256[fixtureId]
    ) fail(`run fixture manifest binding mismatch: ${fixtureId}`);
  }
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
  const publishedResults = [];
  for (const entry of resultEntries) {
    if (entry.isSymbolicLink() || !entry.isDirectory() || !evaluationIds.has(entry.name)) {
      fail(`evaluation run contains an unsafe result: ${entry.name}`);
    }
    publishedResults.push(
      await readImmutableEvaluationResult(path.join(directory, "results"), entry.name),
    );
  }
  let browserFixtureIds = [];
  if (entryNames.includes("browser")) {
    const stat = await fs.lstat(path.join(directory, "browser"));
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("evaluation run browser must be a directory");
    const expectedSelectors = Object.fromEntries(manifest.corpus.flatMap((fixtureId) => {
      const bytes = inputBytes.get(`${fixtureId}/brief.json`);
      return bytes ? [[fixtureId, parseFixtureSelectors(bytes, fixtureId)]] : [];
    }));
    browserFixtureIds = await verifyImmutableEvidencePackets(
      path.join(directory, "browser"),
      manifest.fixtureManifestSha256,
      manifest.fixtureBuildSha256,
      expectedSelectors,
      manifest.browserAuthority,
    );
  }
  if (
    publishedResults.some(
      (result) => result.state === "PASS" && result.evaluationId.startsWith("EVAL-WEB-"),
    ) &&
    browserFixtureIds.length !== manifest.corpus.length
  ) fail("PASS WEB evaluation requires every immutable browser evidence packet");
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
  return { directory, manifest, lock, browserFixtureIds };
}

function spawnCommand(argv, { cwd, env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    if (process.platform !== "darwin") {
      reject(new Error("credential-free evaluation requires an OS network sandbox on this platform"));
      return;
    }
    const isolatedArgv = ["/usr/bin/sandbox-exec", "-p", darwinSandboxProfile(env, cwd), ...argv];
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
  inputsRoot,
  browserRoot,
  timeoutMs = 120_000,
}) {
  validateEvaluationId(evaluationId);
  if (blockers.length > 0) {
    return { schemaVersion: 1, evaluationId, state: "BLOCKED", blockers: structuredClone(blockers), commands: [], evidence: [] };
  }
  if (!Array.isArray(commands) || commands.length === 0) fail("evaluation must register at least one command");
  const sealedInputsRoot = evaluationId.startsWith("EVAL-WEB-")
    ? await validateSealedInputsRoot(inputsRoot)
    : undefined;
  const sealedBrowserRoot = evaluationId.startsWith("EVAL-WEB-")
    ? await validateSealedBrowserRoot(browserRoot)
    : undefined;
  if (
    sealedInputsRoot && sealedBrowserRoot &&
    path.dirname(sealedInputsRoot) !== path.dirname(sealedBrowserRoot)
  ) fail("sealed input and browser evidence must belong to the same prepared run");
  const temporaryBase = process.platform === "darwin" ? "/tmp" : os.tmpdir();
  const temporary = await fs.mkdtemp(path.join(temporaryBase, "one-box-eval-"));
  const physicalTemporary = await fs.realpath(temporary);
  const attemptLog = path.join(physicalTemporary, "tmp", "attempts.log");
  try {
    const executionRoot = await fs.realpath(path.resolve(root));
    const offlineGuard = path.join(
      executionRoot,
      "scripts/eval/page-ir-offline-guard.mjs",
    );
    await readStableRegularFile(offlineGuard, 64 * 1024);
    const childEnv = sanitizeEvaluationEnvironment(environment);
    const isolatedHome = path.join(physicalTemporary, "home");
    await fs.mkdir(isolatedHome, { mode: 0o700 });
    childEnv.HOME = isolatedHome;
    childEnv.TMPDIR = path.join(physicalTemporary, "tmp");
    childEnv.XDG_CONFIG_HOME = path.join(isolatedHome, ".config");
    childEnv.NPM_CONFIG_USERCONFIG = path.join(isolatedHome, ".npmrc");
    childEnv.GIT_CONFIG_GLOBAL = path.join(isolatedHome, ".gitconfig");
    await fs.mkdir(childEnv.TMPDIR, { mode: 0o700 });
    childEnv.TMPDIR = await fs.realpath(childEnv.TMPDIR);
    childEnv.NODE_OPTIONS = `--import=${offlineGuard}`;
    childEnv.ONEBOX_EVAL_NETWORK_ATTEMPT_LOG = attemptLog;
    childEnv.ONEBOX_EVAL_OS_SANDBOX = "darwin-sandbox-exec-network-and-user-storage-denied";
    if (sealedInputsRoot) childEnv.ONEBOX_EVAL_INPUTS_ROOT = sealedInputsRoot;
    if (sealedBrowserRoot) childEnv.ONEBOX_EVAL_BROWSER_ROOT = sealedBrowserRoot;
    const records = [];
    for (const command of commands) {
      if (!command || !Array.isArray(command.argv) || command.argv.length === 0 || command.argv.some((part) => typeof part !== "string")) {
        fail("evaluation command registration is invalid");
      }
      validateCommandId(command.id);
      const result = await spawnCommand(command.argv, { cwd: executionRoot, env: childEnv, timeoutMs });
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
