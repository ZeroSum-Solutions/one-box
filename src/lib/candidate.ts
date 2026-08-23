import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CandidateManifestV1Schema,
  CandidateProvenanceV1Schema,
  CandidateStateSchema,
  MAX_CANDIDATE_BYTES as CONTRACT_MAX_CANDIDATE_BYTES,
  type CandidateFileRecord,
  type CandidateManifestV1,
  type CandidateProvenanceV1,
  type CandidateState,
} from "./contracts";
import { candidatePaths, type CandidatePaths } from "./runstate";

export const MAX_CANDIDATE_BYTES = CONTRACT_MAX_CANDIDATE_BYTES;
export const CANDIDATE_DIAGNOSTIC_RETENTION_MS = 24 * 60 * 60 * 1000;

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const READ_FLAGS = constants.O_RDONLY | NOFOLLOW;

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

function buildSha256(files: CandidateFileRecord[]): string {
  const hash = createHash("sha256");
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
      totalBytes += Number(stat.size);
      if (totalBytes > MAX_CANDIDATE_BYTES) {
        throw new Error("candidate inventory exceeds 100 MiB");
      }
      files.push(
        await hashOpenedRegularFile(absolute, relative, stat),
      );
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
    buildSha256: buildSha256(files),
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
  const expected = CandidateManifestV1Schema.parse(manifest);
  await assertManifestPathsAreRegular(siteRoot, expected);
  const actual = await inventoryRegularFiles(siteRoot);
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
  if (buildSha256(actual) !== expected.buildSha256) {
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
    if (!opened.isFile() || !sameFile(initial, opened)) {
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

async function readProvenance(
  paths: Readonly<CandidatePaths>,
  runId: string,
): Promise<CandidateProvenanceV1> {
  const provenance = CandidateProvenanceV1Schema.parse(
    JSON.parse((await readRegularFile(paths.provenance, "candidate provenance")).toString("utf8")),
  );
  if (provenance.runId !== runId) {
    throw new Error("candidate provenance runId does not match its root");
  }
  return provenance;
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
  const provenance = await readProvenance(paths, runId);

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
  const provenance = await readProvenance(paths, runId);
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
  await fs.rm(paths.root, { recursive: true, force: false });
  return { removed: true, reason };
}
