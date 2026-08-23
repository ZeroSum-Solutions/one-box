import { createHash, randomBytes } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CandidateManifestV1Schema,
  CandidateProvenanceV1Schema,
  CandidateStateSchema,
  CandidateGateReceiptV1Schema,
  MAX_CANDIDATE_BYTES as CONTRACT_MAX_CANDIDATE_BYTES,
  type CandidateFileRecord,
  type CandidateManifestV1,
  type CandidateProvenanceV1,
  type CandidateState,
  type CandidateGateReceiptV1,
} from "./contracts";
import {
  candidatePaths,
  preparePromotedVisualQaUnderSiteAuthority,
  sitePaths,
  type CandidatePaths,
} from "./runstate";
import { assertWebsiteProductionRun } from "./productionTarget";
import { withSiteAuthorityLock } from "./siteAuthority";
import {
  candidateBuildSha256,
  LIVE_BUNDLE_GATES_FILE,
  LIVE_BUNDLE_MANIFEST_FILE,
  LIVE_BUNDLE_METADATA_DIR,
  LIVE_BUNDLE_PROVENANCE_FILE,
} from "./liveBundle";

export {
  candidateBuildSha256,
  LIVE_BUNDLE_GATES_FILE,
  LIVE_BUNDLE_MANIFEST_FILE,
  LIVE_BUNDLE_METADATA_DIR,
  LIVE_BUNDLE_PROVENANCE_FILE,
} from "./liveBundle";

export const MAX_CANDIDATE_BYTES = CONTRACT_MAX_CANDIDATE_BYTES;
export const CANDIDATE_DIAGNOSTIC_RETENTION_MS = 24 * 60 * 60 * 1000;

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const NONBLOCK = constants.O_NONBLOCK ?? 0;
const READ_FLAGS = constants.O_RDONLY | NOFOLLOW | NONBLOCK;

const CandidateBindingPatchSchema = z
  .object({
    candidateManifestSha256: z.string().regex(HASH_PATTERN).optional(),
    buildSha256: z.string().regex(HASH_PATTERN).optional(),
    gateReportSha256: z.string().regex(HASH_PATTERN).optional(),
    promotedBuildSha256: z.string().regex(HASH_PATTERN).optional(),
  })
  .strict();
export type CandidateBindingPatch = z.infer<
  typeof CandidateBindingPatchSchema
>;

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function candidateManifestSha256(
  manifest: CandidateManifestV1,
): string {
  const parsed = CandidateManifestV1Schema.parse(manifest);
  return sha256(JSON.stringify(canonicalize(parsed)));
}

function assertDirectory(stat: BigIntStats, label: string): void {
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!stat.isDirectory()) throw new Error(`${label} must be a directory`);
}

function assertRegularFile(stat: BigIntStats, relativePath: string): void {
  if (stat.isSymbolicLink()) {
    throw new Error(`candidate file is a symlink: ${relativePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`candidate path is not a regular file: ${relativePath}`);
  }
  if (stat.nlink > BigInt(1)) {
    throw new Error(`candidate file is a hardlink alias: ${relativePath}`);
  }
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function hashOpenedRegularFile(
  absolutePath: string,
  relativePath: string,
  initial: BigIntStats,
  remainingBytes: number,
): Promise<CandidateFileRecord> {
  const handle = await fs.open(absolutePath, READ_FLAGS);
  try {
    const opened = await handle.stat({ bigint: true });
    assertRegularFile(opened, relativePath);
    if (!sameFile(initial, opened)) {
      throw new Error(`candidate file changed before hashing: ${relativePath}`);
    }
    if (opened.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`candidate file is too large to inventory: ${relativePath}`);
    }
    if (opened.size > BigInt(remainingBytes)) {
      throw new Error("candidate inventory exceeds 100 MiB");
    }

    const sizeBytes = Number(opened.size);
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < sizeBytes) {
      const length = Math.min(buffer.length, sizeBytes - position);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      if (bytesRead === 0) {
        throw new Error(`candidate file changed while hashing: ${relativePath}`);
      }
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }

    const after = await handle.stat({ bigint: true });
    if (!sameFile(opened, after) || opened.size !== after.size) {
      throw new Error(`candidate file changed while hashing: ${relativePath}`);
    }
    return {
      path: relativePath,
      sizeBytes,
      sha256: hash.digest("hex"),
    };
  } finally {
    await handle.close();
  }
}

async function inventoryRegularFiles(
  siteRoot: string,
  ignoredTopLevel = new Set<string>(),
): Promise<CandidateFileRecord[]> {
  const rootStat = await fs.lstat(siteRoot, { bigint: true });
  assertDirectory(rootStat, "candidate site root");
  const files: CandidateFileRecord[] = [];
  const identities = new Set<string>();
  let totalBytes = 0;

  async function visit(directory: string): Promise<void> {
    const entries = (await fs.readdir(directory)).sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    for (const entry of entries) {
      if (directory === siteRoot && ignoredTopLevel.has(entry)) continue;
      const absolute = path.join(directory, entry);
      const relative = path.relative(siteRoot, absolute).split(path.sep).join("/");
      const stat = await fs.lstat(absolute, { bigint: true });
      if (stat.isSymbolicLink()) {
        throw new Error(`candidate path is a symlink: ${relative}`);
      }
      if (stat.isDirectory()) {
        await visit(absolute);
        continue;
      }
      assertRegularFile(stat, relative);
      const identity = `${stat.dev}:${stat.ino}`;
      if (identities.has(identity)) {
        throw new Error(`candidate file is a hardlink alias: ${relative}`);
      }
      identities.add(identity);
      if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`candidate file is too large to inventory: ${relative}`);
      }
      const file = await hashOpenedRegularFile(
        absolute,
        relative,
        stat,
        MAX_CANDIDATE_BYTES - totalBytes,
      );
      totalBytes += file.sizeBytes;
      files.push(file);
    }
  }

  await visit(siteRoot);
  files.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  return files;
}

export async function createCandidateManifest(
  siteRoot: string,
): Promise<CandidateManifestV1> {
  const files = await inventoryRegularFiles(siteRoot);
  if (!files.some((file) => file.path === "index.html")) {
    throw new Error("candidate must contain index.html");
  }
  return CandidateManifestV1Schema.parse({
    schemaVersion: 1,
    entry: "index.html",
    files,
    totalBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
    buildSha256: candidateBuildSha256(files),
  });
}

async function assertManifestPathsAreRegular(
  siteRoot: string,
  manifest: CandidateManifestV1,
): Promise<void> {
  for (const file of manifest.files) {
    const absolute = path.join(siteRoot, ...file.path.split("/"));
    let stat: BigIntStats;
    try {
      stat = await fs.lstat(absolute, { bigint: true });
    } catch (error) {
      if (isEnoent(error)) {
        throw new Error(`missing candidate file: ${file.path}`);
      }
      throw error;
    }
    assertRegularFile(stat, file.path);
  }
}

export async function validateCandidateInventory(
  siteRoot: string,
  manifest: CandidateManifestV1,
): Promise<void> {
  return validateInventory(siteRoot, manifest);
}

async function validateInventory(
  siteRoot: string,
  manifest: CandidateManifestV1,
  ignoredTopLevel = new Set<string>(),
): Promise<void> {
  const expected = CandidateManifestV1Schema.parse(manifest);
  await assertManifestPathsAreRegular(siteRoot, expected);
  const actual = await inventoryRegularFiles(siteRoot, ignoredTopLevel);
  const actualByPath = new Map(actual.map((file) => [file.path, file]));
  const expectedPaths = new Set(expected.files.map((file) => file.path));

  for (const file of expected.files) {
    const observed = actualByPath.get(file.path);
    if (!observed) throw new Error(`missing candidate file: ${file.path}`);
    if (observed.sizeBytes !== file.sizeBytes) {
      throw new Error(`candidate file size mismatch: ${file.path}`);
    }
    if (observed.sha256 !== file.sha256) {
      throw new Error(`candidate file SHA-256 mismatch: ${file.path}`);
    }
  }
  for (const file of actual) {
    if (!expectedPaths.has(file.path)) {
      throw new Error(`unexpected candidate file: ${file.path}`);
    }
  }
  if (actual.reduce((total, file) => total + file.sizeBytes, 0) !== expected.totalBytes) {
    throw new Error("candidate total size mismatch");
  }
  if (candidateBuildSha256(actual) !== expected.buildSha256) {
    throw new Error("candidate build SHA-256 mismatch");
  }
}

export function transitionCandidateProvenance(
  current: CandidateProvenanceV1,
  nextState: CandidateState,
  at: string,
  bindings: CandidateBindingPatch = {},
): CandidateProvenanceV1 {
  const parsed = CandidateProvenanceV1Schema.parse(current);
  const state = CandidateStateSchema.parse(nextState);
  const patch = CandidateBindingPatchSchema.parse(bindings);
  return CandidateProvenanceV1Schema.parse({
    ...parsed,
    ...patch,
    state,
    history: [...parsed.history, { state, at }],
  });
}

async function lstatMaybe(filePath: string): Promise<BigIntStats | undefined> {
  try {
    return await fs.lstat(filePath, { bigint: true });
  } catch (error) {
    if (isEnoent(error)) return undefined;
    throw error;
  }
}

async function readRegularFile(
  filePath: string,
  label: string,
): Promise<Buffer> {
  const initial = await fs.lstat(filePath, { bigint: true });
  if (initial.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!initial.isFile()) throw new Error(`${label} must be a regular file`);
  if (initial.nlink > BigInt(1)) throw new Error(`${label} must not be a hardlink`);
  if (initial.size > BigInt(MAX_CANDIDATE_BYTES)) {
    throw new Error(`${label} exceeds the candidate diagnostic size limit`);
  }
  const handle = await fs.open(filePath, READ_FLAGS);
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.size > BigInt(MAX_CANDIDATE_BYTES)) {
      throw new Error(`${label} exceeds the candidate diagnostic size limit`);
    }
    if (
      !opened.isFile() ||
      opened.nlink > BigInt(1) ||
      !sameFile(initial, opened) ||
      opened.size !== initial.size
    ) {
      throw new Error(`${label} changed before read`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (!sameFile(opened, after) || opened.size !== after.size) {
      throw new Error(`${label} changed while read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

type CandidateProvenanceSnapshot = {
  provenance: CandidateProvenanceV1;
  bytesSha256: string;
};

async function readProvenanceSnapshot(
  paths: Readonly<CandidatePaths>,
  runId: string,
): Promise<CandidateProvenanceSnapshot> {
  const bytes = await readRegularFile(paths.provenance, "candidate provenance");
  const provenance = CandidateProvenanceV1Schema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  if (provenance.runId !== runId) {
    throw new Error("candidate provenance runId does not match its root");
  }
  return { provenance, bytesSha256: sha256(bytes) };
}

async function assertClosedCandidateRoot(
  paths: Readonly<CandidatePaths>,
): Promise<void> {
  const allowed = new Set(["site", "manifest.json", "provenance.json", "gates.json"]);
  for (const entry of await fs.readdir(paths.root)) {
    if (!allowed.has(entry)) {
      throw new Error(`unexpected candidate root entry: ${entry}`);
    }
  }
}

async function diagnosticBytes(root: string): Promise<number> {
  let total = 0;
  const identities = new Set<string>();
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory)) {
      const absolute = path.join(directory, entry);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const stat = await fs.lstat(absolute, { bigint: true });
      if (stat.isSymbolicLink()) {
        throw new Error(`candidate diagnostic path is a symlink: ${relative}`);
      }
      if (stat.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`candidate diagnostic path is not a regular file: ${relative}`);
      }
      if (stat.nlink > BigInt(1)) {
        throw new Error(`candidate diagnostic path is a hardlink alias: ${relative}`);
      }
      const identity = `${stat.dev}:${stat.ino}`;
      if (identities.has(identity)) {
        throw new Error(`candidate diagnostic path is a hardlink alias: ${relative}`);
      }
      identities.add(identity);
      if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`candidate diagnostic file is too large: ${relative}`);
      }
      total += Number(stat.size);
      if (!Number.isSafeInteger(total)) {
        throw new Error("candidate diagnostic size is not safely representable");
      }
    }
  }
  await visit(root);
  return total;
}

export type CandidateInspection =
  | { status: "absent"; paths: Readonly<CandidatePaths> }
  | {
      status: "present";
      paths: Readonly<CandidatePaths>;
      provenance: CandidateProvenanceV1;
      manifest?: CandidateManifestV1;
      diagnosticBytes: number;
    };

/** Read-only candidate inspection for later recovery code. It validates the
 * current closed layout and bindings but never resumes, abandons, or writes. */
export async function inspectCandidate(
  runId: string,
): Promise<CandidateInspection> {
  const paths = candidatePaths(runId);
  const rootStat = await lstatMaybe(paths.root);
  if (!rootStat) return { status: "absent", paths };
  assertDirectory(rootStat, "candidate root");
  await assertClosedCandidateRoot(paths);
  const { provenance } = await readProvenanceSnapshot(paths, runId);

  let manifest: CandidateManifestV1 | undefined;
  const manifestStat = await lstatMaybe(paths.manifest);
  if (manifestStat) {
    manifest = CandidateManifestV1Schema.parse(
      JSON.parse((await readRegularFile(paths.manifest, "candidate manifest")).toString("utf8")),
    );
    if (provenance.candidateManifestSha256) {
      if (candidateManifestSha256(manifest) !== provenance.candidateManifestSha256) {
        throw new Error("candidate manifest SHA-256 does not match provenance");
      }
      if (manifest.buildSha256 !== provenance.buildSha256) {
        throw new Error("candidate build SHA-256 does not match provenance");
      }
    }
    await validateCandidateInventory(paths.site, manifest);
  } else if (provenance.candidateManifestSha256 || provenance.buildSha256) {
    throw new Error("candidate provenance binds a missing manifest");
  }

  const gatesStat = await lstatMaybe(paths.gates);
  if (gatesStat) {
    if (!provenance.gateReportSha256) {
      throw new Error("candidate gate report is not bound by provenance");
    }
    const gates = await readRegularFile(paths.gates, "candidate gate report");
    if (sha256(gates) !== provenance.gateReportSha256) {
      throw new Error("candidate gate report SHA-256 does not match provenance");
    }
  } else if (provenance.gateReportSha256) {
    throw new Error("candidate provenance binds a missing gate report");
  }

  return {
    status: "present",
    paths,
    provenance,
    ...(manifest ? { manifest } : {}),
    diagnosticBytes: await diagnosticBytes(paths.root),
  };
}

export type CandidateCleanupResult = {
  removed: boolean;
  reason: "absent" | "active" | "within-retention" | "expired" | "oversized";
};

/** Remove only failed/abandoned diagnostics outside their byte/time bounds.
 * Provenance is the lifecycle authority; mtimes are intentionally ignored. */
export async function cleanupCandidateDiagnostics(
  runId: string,
  now = new Date(),
): Promise<CandidateCleanupResult> {
  if (!Number.isFinite(now.getTime())) throw new Error("invalid cleanup time");
  const paths = candidatePaths(runId);
  const rootStat = await lstatMaybe(paths.root);
  if (!rootStat) return { removed: false, reason: "absent" };
  assertDirectory(rootStat, "candidate root");
  const provenanceSnapshot = await readProvenanceSnapshot(paths, runId);
  const { provenance } = provenanceSnapshot;
  if (provenance.state !== "failed" && provenance.state !== "abandoned") {
    return { removed: false, reason: "active" };
  }

  const bytes = await diagnosticBytes(paths.root);
  const transitionedAt = Date.parse(
    provenance.history[provenance.history.length - 1].at,
  );
  const reason =
    bytes > MAX_CANDIDATE_BYTES
      ? "oversized"
      : now.getTime() - transitionedAt > CANDIDATE_DIAGNOSTIC_RETENTION_MS
        ? "expired"
        : undefined;
  if (!reason) return { removed: false, reason: "within-retention" };

  const beforeRemove = await fs.lstat(paths.root, { bigint: true });
  assertDirectory(beforeRemove, "candidate root");
  if (!sameFile(rootStat, beforeRemove)) {
    throw new Error("candidate root changed before cleanup");
  }
  const beforeRemoveProvenance = await readProvenanceSnapshot(paths, runId);
  if (
    beforeRemoveProvenance.bytesSha256 !== provenanceSnapshot.bytesSha256
  ) {
    throw new Error("candidate provenance changed during cleanup");
  }
  await fs.rm(paths.root, { recursive: true, force: false });
  return { removed: true, reason };
}

export type PromotionFaultStep =
  | "after-revalidation"
  | "before-staging-sync"
  | "after-staging"
  | "after-live-retired"
  | "before-retired-directory-sync"
  | "after-live-replaced"
  | "before-live-directory-sync"
  | "before-provenance-sync"
  | "after-provenance-renamed"
  | "after-provenance-committed"
  | "before-visual-approval-invalidation"
  | "after-visual-approval-invalidation"
  | "before-retired-cleanup"
  | "before-rollback";

export interface PromotionOptions {
  /** Deterministic same-process fault seam used only by transaction tests. */
  injectFault?: (step: PromotionFaultStep) => void | Promise<void>;
}

export interface PromotionResult {
  buildSha256: string;
  candidateManifestSha256: string;
  gateReportSha256: string;
  visualApprovalInvalidated: boolean;
  compatibilityCopyUpdated: boolean;
  retiredCleanupPending: boolean;
}

export type PromotedLiveBundleInspection =
  | { status: "absent" }
  | {
      status: "present";
      manifest: CandidateManifestV1;
      provenance: CandidateProvenanceV1;
      receipt: CandidateGateReceiptV1;
    };

type PromotableCandidateSnapshot = {
  manifest: CandidateManifestV1;
  provenance: CandidateProvenanceV1;
  receipt: CandidateGateReceiptV1;
  manifestBytes: Buffer;
  provenanceBytes: Buffer;
  receiptBytes: Buffer;
};

function liveMetadataPath(liveSite: string, fileName: string): string {
  return path.join(liveSite, LIVE_BUNDLE_METADATA_DIR, fileName);
}

/** Canonical live authority. The run-root gates.json compatibility copy is
 * deliberately never read here. */
export async function inspectPromotedLiveBundle(
  runId: string,
): Promise<PromotedLiveBundleInspection> {
  const candidate = candidatePaths(runId);
  const liveSite = sitePaths(runId).site;
  const metadata = path.join(liveSite, LIVE_BUNDLE_METADATA_DIR);
  const metadataStat = await lstatMaybe(metadata);
  if (!metadataStat) {
    const candidateProvenanceStat = await lstatMaybe(candidate.provenance);
    if (!candidateProvenanceStat) return { status: "absent" };
    const { provenance } = await readProvenanceSnapshot(candidate, runId);
    if (provenance.state === "promoted") {
      throw new Error("promoted live bundle metadata is missing");
    }
    return { status: "absent" };
  }
  assertDirectory(metadataStat, "live bundle metadata");
  const entries = (await fs.readdir(metadata)).sort();
  const expectedEntries = [
    LIVE_BUNDLE_GATES_FILE,
    LIVE_BUNDLE_MANIFEST_FILE,
    LIVE_BUNDLE_PROVENANCE_FILE,
  ].sort();
  if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
    throw new Error("live bundle metadata inventory is not closed");
  }
  const [manifestBytes, provenanceBytes, receiptBytes] = await Promise.all([
    readRegularFile(
      liveMetadataPath(liveSite, LIVE_BUNDLE_MANIFEST_FILE),
      "live candidate manifest",
    ),
    readRegularFile(
      liveMetadataPath(liveSite, LIVE_BUNDLE_PROVENANCE_FILE),
      "live promotion provenance",
    ),
    readRegularFile(
      liveMetadataPath(liveSite, LIVE_BUNDLE_GATES_FILE),
      "live canonical gate receipt",
    ),
  ]);
  const manifest = CandidateManifestV1Schema.parse(
    JSON.parse(manifestBytes.toString("utf8")),
  );
  const provenance = CandidateProvenanceV1Schema.parse(
    JSON.parse(provenanceBytes.toString("utf8")),
  );
  const receipt = CandidateGateReceiptV1Schema.parse(
    JSON.parse(receiptBytes.toString("utf8")),
  );
  if (
    provenance.runId !== runId ||
    provenance.state !== "promoted" ||
    provenance.promotedBuildSha256 !== manifest.buildSha256 ||
    provenance.candidateManifestSha256 !== candidateManifestSha256(manifest) ||
    provenance.gateReportSha256 !== sha256(receiptBytes) ||
    receipt.runId !== runId ||
    receipt.candidateManifestSha256 !== provenance.candidateManifestSha256 ||
    receipt.buildSha256 !== provenance.promotedBuildSha256 ||
    receipt.reports.some((report) => report.blocking && !report.pass)
  ) {
    throw new Error("live promotion metadata bindings do not match");
  }
  if (
    manifest.files.some(
      (file) => file.path.split("/")[0] === LIVE_BUNDLE_METADATA_DIR,
    )
  ) {
    throw new Error("live manifest inventories reserved promotion metadata");
  }
  await validateInventory(
    liveSite,
    manifest,
    new Set([LIVE_BUNDLE_METADATA_DIR]),
  );
  return { status: "present", manifest, provenance, receipt };
}

async function syncFile(filePath: string): Promise<void> {
  const handle = await fs.open(filePath, constants.O_RDONLY | NOFOLLOW);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncTree(root: string): Promise<void> {
  const directories: string[] = [];
  async function visit(directory: string): Promise<void> {
    directories.push(directory);
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error(`promotion staging path is a symlink: ${entry.name}`);
      }
      if (stat.isDirectory()) await visit(absolute);
      else if (stat.isFile()) await syncFile(absolute);
      else throw new Error(`promotion staging path is not regular: ${entry.name}`);
    }
  }
  await visit(root);
  for (const directory of directories.reverse()) await syncDirectory(directory);
}

async function durableAtomicWrite(
  filePath: string,
  content: string | Uint8Array,
  afterRename?: () => void | Promise<void>,
): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    const handle = await fs.open(temporary, "wx");
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, filePath);
    await afterRename?.();
    await syncDirectory(directory);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function nextPromotionTimestamp(provenance: CandidateProvenanceV1): string {
  const last = Date.parse(provenance.history.at(-1)!.at);
  return new Date(Math.max(Date.now(), last)).toISOString();
}

async function readPromotableCandidateSnapshot(
  runId: string,
): Promise<PromotableCandidateSnapshot> {
  const inspection = await inspectCandidate(runId);
  if (
    inspection.status !== "present" ||
    !inspection.manifest ||
    inspection.provenance.state !== "promotable"
  ) {
    throw new Error("candidate must be exactly promotable before promotion");
  }
  if (
    inspection.manifest.files.some(
      (file) => file.path.split("/")[0] === LIVE_BUNDLE_METADATA_DIR,
    )
  ) {
    throw new Error("candidate inventory contains reserved live metadata");
  }
  const paths = candidatePaths(runId);
  const [manifestBytes, provenanceBytes, receiptBytes] = await Promise.all([
    readRegularFile(paths.manifest, "candidate manifest"),
    readRegularFile(paths.provenance, "candidate provenance"),
    readRegularFile(paths.gates, "candidate gate receipt"),
  ]);
  const manifest = CandidateManifestV1Schema.parse(
    JSON.parse(manifestBytes.toString("utf8")),
  );
  const provenance = CandidateProvenanceV1Schema.parse(
    JSON.parse(provenanceBytes.toString("utf8")),
  );
  const receipt = CandidateGateReceiptV1Schema.parse(
    JSON.parse(receiptBytes.toString("utf8")),
  );
  if (
    provenance.runId !== runId ||
    provenance.state !== "promotable" ||
    provenance.candidateManifestSha256 !== candidateManifestSha256(manifest) ||
    provenance.buildSha256 !== manifest.buildSha256 ||
    provenance.gateReportSha256 !== sha256(receiptBytes) ||
    receipt.runId !== runId ||
    receipt.candidateManifestSha256 !== provenance.candidateManifestSha256 ||
    receipt.buildSha256 !== provenance.buildSha256
  ) {
    throw new Error("candidate gate receipt does not match the promotable candidate");
  }
  if (receipt.reports.some((report) => report.blocking && !report.pass)) {
    throw new Error("blocking candidate gate prevents promotion");
  }
  await validateCandidateInventory(paths.site, manifest);
  return {
    manifest,
    provenance,
    receipt,
    manifestBytes,
    provenanceBytes,
    receiptBytes,
  };
}

async function assertCandidateSnapshotUnchanged(
  runId: string,
  expected: PromotableCandidateSnapshot,
): Promise<void> {
  const current = await readPromotableCandidateSnapshot(runId);
  if (
    !current.manifestBytes.equals(expected.manifestBytes) ||
    !current.provenanceBytes.equals(expected.provenanceBytes) ||
    !current.receiptBytes.equals(expected.receiptBytes)
  ) {
    throw new Error("candidate promotion inputs changed before commit");
  }
}

async function stageLiveBundle(
  stagingSite: string,
  snapshot: PromotableCandidateSnapshot,
  promotedProvenanceBytes: Buffer,
): Promise<void> {
  const paths = candidatePaths(snapshot.provenance.runId);
  await fs.mkdir(stagingSite, { recursive: false });
  for (const file of snapshot.manifest.files) {
    const source = path.join(paths.site, ...file.path.split("/"));
    const bytes = await readRegularFile(source, `candidate file ${file.path}`);
    if (bytes.byteLength !== file.sizeBytes || sha256(bytes) !== file.sha256) {
      throw new Error(`candidate file changed while staging: ${file.path}`);
    }
    const target = path.join(stagingSite, ...file.path.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: "wx" });
  }
  await validateCandidateInventory(stagingSite, snapshot.manifest);
  const metadata = path.join(stagingSite, LIVE_BUNDLE_METADATA_DIR);
  await fs.mkdir(metadata);
  await Promise.all([
    fs.writeFile(
      path.join(metadata, LIVE_BUNDLE_MANIFEST_FILE),
      snapshot.manifestBytes,
      { flag: "wx" },
    ),
    fs.writeFile(
      path.join(metadata, LIVE_BUNDLE_PROVENANCE_FILE),
      promotedProvenanceBytes,
      { flag: "wx" },
    ),
    fs.writeFile(
      path.join(metadata, LIVE_BUNDLE_GATES_FILE),
      snapshot.receiptBytes,
      { flag: "wx" },
    ),
  ]);
}

/**
 * Atomically publish one exact promotable candidate. OBX-024 owns pipeline
 * sequencing; callers here receive only the closed site-authority operation.
 */
export function promoteCandidate(
  runId: string,
  options: PromotionOptions = {},
): Promise<PromotionResult> {
  return withSiteAuthorityLock(runId, async () => {
    await assertWebsiteProductionRun(runId);
    const roots = sitePaths(runId);
    const snapshot = await readPromotableCandidateSnapshot(runId);
    await options.injectFault?.("after-revalidation");

    const promotedProvenance = transitionCandidateProvenance(
      snapshot.provenance,
      "promoted",
      nextPromotionTimestamp(snapshot.provenance),
      { promotedBuildSha256: snapshot.manifest.buildSha256 },
    );
    const promotedProvenanceBytes = Buffer.from(
      JSON.stringify(promotedProvenance, null, 2),
    );
    const token = `${process.pid}-${randomBytes(6).toString("hex")}`;
    const stagingSite = path.join(roots.root, `.site-promotion-stage-${token}`);
    const retiredSite = path.join(roots.root, `.site-promotion-retired-${token}`);
    const candidateProvenancePath = candidatePaths(runId).provenance;
    let hadPrevious = false;
    let liveRetired = false;
    let liveReplaced = false;
    let provenanceCommitted = false;
    let committed = false;

    try {
      await stageLiveBundle(stagingSite, snapshot, promotedProvenanceBytes);
      await options.injectFault?.("before-staging-sync");
      await syncTree(stagingSite);
      await options.injectFault?.("after-staging");
      await assertCandidateSnapshotUnchanged(runId, snapshot);

      hadPrevious = await lstatMaybe(roots.site).then(Boolean);
      if (hadPrevious) {
        await fs.rename(roots.site, retiredSite);
        liveRetired = true;
        await options.injectFault?.("before-retired-directory-sync");
        await syncDirectory(roots.root);
      }
      await options.injectFault?.("after-live-retired");
      await fs.rename(stagingSite, roots.site);
      liveReplaced = true;
      await options.injectFault?.("before-live-directory-sync");
      await syncDirectory(roots.root);
      await options.injectFault?.("after-live-replaced");

      await options.injectFault?.("before-provenance-sync");
      await durableAtomicWrite(
        candidateProvenancePath,
        promotedProvenanceBytes,
        async () => {
          provenanceCommitted = true;
          await options.injectFault?.("after-provenance-renamed");
        },
      );
      await options.injectFault?.("after-provenance-committed");
      await options.injectFault?.("before-visual-approval-invalidation");
      const { visualApprovalInvalidated } =
        await preparePromotedVisualQaUnderSiteAuthority(
          runId,
          snapshot.manifest.buildSha256,
          {
            afterPreparation: () =>
              options.injectFault?.("after-visual-approval-invalidation"),
          },
        );
      committed = true;

      let compatibilityCopyUpdated = true;
      try {
        await durableAtomicWrite(
          path.join(roots.root, "gates.json"),
          JSON.stringify(snapshot.receipt.reports, null, 2),
        );
      } catch {
        compatibilityCopyUpdated = false;
      }

      let retiredCleanupPending = false;
      if (liveRetired) {
        try {
          await options.injectFault?.("before-retired-cleanup");
          await fs.rm(retiredSite, { recursive: true, force: false });
          await syncDirectory(roots.root);
        } catch {
          retiredCleanupPending = true;
        }
      }
      return {
        buildSha256: snapshot.manifest.buildSha256,
        candidateManifestSha256:
          snapshot.provenance.candidateManifestSha256!,
        gateReportSha256: snapshot.provenance.gateReportSha256!,
        visualApprovalInvalidated,
        compatibilityCopyUpdated,
        retiredCleanupPending,
      };
    } catch (error) {
      if (committed) throw error;
      const rollbackErrors: unknown[] = [];
      try {
        await options.injectFault?.("before-rollback");
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      if (provenanceCommitted) {
        try {
          await durableAtomicWrite(
            candidateProvenancePath,
            snapshot.provenanceBytes,
          );
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (liveReplaced) {
        try {
          await fs.rename(roots.site, stagingSite);
          liveReplaced = false;
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (liveRetired) {
        try {
          await fs.rename(retiredSite, roots.site);
          liveRetired = false;
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      try {
        await syncDirectory(roots.root);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "candidate promotion failed and rollback was incomplete",
        );
      }
      throw error;
    } finally {
      if (!committed) {
        await fs.rm(stagingSite, { recursive: true, force: true }).catch(() => {});
      }
    }
  });
}
