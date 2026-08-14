import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  UploadMetadataSchema,
  UPLOADS_DIR,
  type UploadMetadata,
} from "./contracts";
import { sitePaths } from "./runstate";
import { withFileLock } from "./fileLock";
import {
  ACCEPTED_UPLOADS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  uploadExtension,
  type AcceptedUploadExtension,
} from "../components/uploadPolicy";

export const UPLOAD_SESSION_TTL_MS = 30 * 60 * 1000;
export const MAX_SESSION_UPLOAD_BYTES = MAX_UPLOAD_FILES * MAX_UPLOAD_BYTES;
export const MAX_STAGING_BYTES = 200 * 1024 * 1024;
export const MAX_MULTIPART_BODY_BYTES =
  MAX_SESSION_UPLOAD_BYTES + 1024 * 1024;

const MAX_ZIP_ENTRIES = 1_000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{4,40}$/;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEFAULT_STAGING_ROOT = path.join(
  os.tmpdir(),
  `one-box-intake-${createHash("sha256")
    .update(process.cwd())
    .digest("hex")
    .slice(0, 16)}`
);

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "UploadError";
  }
}

const AcceptedExtensionSchema = z.enum([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".pdf",
  ".txt",
  ".md",
  ".doc",
  ".docx",
  ".zip",
]);

const StagedFileSchema = UploadMetadataSchema.omit({ storagePath: true }).extend({
  sha256: z.string().regex(HASH_PATTERN),
  extension: AcceptedExtensionSchema,
  storedName: z.string().regex(/^[a-f0-9-]{36}\.[a-z0-9]+$/),
});

const UploadRequestRecordSchema = z
  .object({
    requestIdHash: z.string().regex(HASH_PATTERN),
    fingerprint: z.string().regex(HASH_PATTERN),
    uploadIds: z.array(z.string().uuid()).min(1).max(MAX_UPLOAD_FILES),
  })
  .strict();

const UploadSessionManifestSchema = z
  .object({
    version: z.literal(1),
    sessionId: z.string().uuid(),
    handleHash: z.string().regex(HASH_PATTERN),
    state: z.literal("open"),
    createdAt: z.string(),
    updatedAt: z.string(),
    expiresAt: z.string(),
    totalBytes: z.number().int().nonnegative(),
    files: z.array(StagedFileSchema).max(MAX_UPLOAD_FILES),
    requests: z.array(UploadRequestRecordSchema).max(MAX_UPLOAD_FILES).default([]),
  })
  .strict();

const RunUploadManifestSchema = z
  .object({
    version: z.literal(1),
    sessionId: z.string().uuid(),
    state: z.literal("claimed"),
    claimedAt: z.string(),
    handleHash: z.string().regex(HASH_PATTERN).optional(),
    files: z.array(
      UploadMetadataSchema.extend({
        sha256: z.string().regex(HASH_PATTERN),
        storagePath: z.string(),
      })
    ),
  })
  .strict();

export type UploadSessionManifest = z.infer<
  typeof UploadSessionManifestSchema
>;
export type RunUploadManifest = z.infer<typeof RunUploadManifestSchema>;

interface InspectedUpload {
  bytes: Uint8Array;
  extension: AcceptedUploadExtension;
  staged: z.infer<typeof StagedFileSchema>;
}

export interface StageUploadOptions {
  handle?: string;
  requestId?: string;
  stagingRoot?: string;
  nowMs?: number;
  ttlMs?: number;
  /** Test seam; production always uses the exported 200 MiB global cap. */
  maxStagingBytes?: number;
  /** Test seam; post-commit transaction cleanup is production fs.rm. */
  cleanupTransactionDirectory?: (directory: string) => Promise<unknown>;
}

export interface StageUploadResult {
  uploadSession: string;
  expiresAt: string;
  uploads: UploadMetadata[];
}

async function withStagingLock<T>(
  stagingRoot: string,
  fn: () => Promise<T>
): Promise<T> {
  return withFileLock(`${stagingRoot}.lock`, fn);
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function inferKind(
  fileName: string,
  extension: AcceptedUploadExtension
): UploadMetadata["kind"] {
  const lower = fileName.toLowerCase();
  if (lower.includes("logo")) return "logo";
  if (lower.includes("brand") || lower.includes("guideline")) {
    return "brand-guidelines";
  }
  if (/do[-_ ]?n[o']?t|dos[-_ ]?and[-_ ]?donts/.test(lower)) {
    return "do-dont-list";
  }
  if (lower.includes("wish")) return "wish-list";
  if (extension === ".zip") return "archive";
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    return "screenshot";
  }
  return "copy-document";
}

function assertSafeFileName(fileName: string): void {
  if (
    fileName.length === 0 ||
    fileName.length > 180 ||
    fileName === "." ||
    fileName === ".." ||
    path.basename(fileName) !== fileName ||
    /[\\/\0\r\n]/.test(fileName)
  ) {
    throw new UploadError("The file name is not safe to store.");
  }
}

function assertMediaSignature(
  bytes: Uint8Array,
  extension: AcceptedUploadExtension
): void {
  const valid = (() => {
    switch (extension) {
      case ".png":
        return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      case ".jpg":
      case ".jpeg":
        return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
      case ".webp":
        return (
          hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
          String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
        );
      case ".pdf":
        return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
      case ".doc":
        return hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      case ".txt":
      case ".md": {
        if (bytes.includes(0)) return false;
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          return true;
        } catch {
          return false;
        }
      }
      case ".docx":
      case ".zip":
        return hasPrefix(bytes, [0x50, 0x4b]);
    }
  })();
  if (!valid) {
    throw new UploadError(
      "The file contents do not match the selected file type."
    );
  }
}

function safeZipEntryName(name: string): boolean {
  const normalized = name.replace(/\\/g, "/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[a-z]:/i.test(normalized) ||
    normalized.includes("\0")
  ) {
    return false;
  }
  return normalized
    .split("/")
    .filter((segment, index, segments) => {
      const trailingDirectory = segment === "" && index === segments.length - 1;
      return !trailingDirectory;
    })
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

/** Inspect ZIP metadata only. Archives remain intact and are never extracted. */
export function inspectZip(bytes: Uint8Array): string[] {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEndOfCentralDirectory(view);
    if (eocd < 0) throw new Error("missing central directory");

    const disk = view.getUint16(eocd + 4, true);
    const centralDisk = view.getUint16(eocd + 6, true);
    const diskEntries = view.getUint16(eocd + 8, true);
    const totalEntries = view.getUint16(eocd + 10, true);
    const centralSize = view.getUint32(eocd + 12, true);
    const centralOffset = view.getUint32(eocd + 16, true);
    const commentLength = view.getUint16(eocd + 20, true);
    if (
      disk !== 0 ||
      centralDisk !== 0 ||
      diskEntries !== totalEntries ||
      totalEntries === 0 ||
      totalEntries === 0xffff ||
      centralSize === 0xffffffff ||
      centralOffset === 0xffffffff ||
      totalEntries > MAX_ZIP_ENTRIES ||
      eocd + 22 + commentLength !== view.byteLength ||
      centralOffset + centralSize > eocd
    ) {
      throw new Error("unsupported ZIP structure");
    }

    const names: string[] = [];
    let offset = centralOffset;
    let uncompressedTotal = 0;
    for (let index = 0; index < totalEntries; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) {
        throw new Error("invalid central entry");
      }
      const versionMadeBy = view.getUint16(offset + 4, true);
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const entryCommentLength = view.getUint16(offset + 32, true);
      const externalAttributes = view.getUint32(offset + 38, true);
      const localOffset = view.getUint32(offset + 42, true);
      const nameStart = offset + 46;
      const nextOffset = nameStart + nameLength + extraLength + entryCommentLength;
      if (nextOffset > centralOffset + centralSize || (flags & 0x1) !== 0) {
        throw new Error("encrypted or malformed entry");
      }
      if (method !== 0 && method !== 8) {
        throw new Error("unsupported compression method");
      }

      const name = new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.slice(nameStart, nameStart + nameLength)
      );
      if (!safeZipEntryName(name)) throw new Error("unsafe archive path");

      const unixMode = externalAttributes >>> 16;
      const isUnix = versionMadeBy >>> 8 === 3;
      if (isUnix && (unixMode & 0xf000) === 0xa000) {
        throw new Error("symbolic links are not accepted");
      }

      if (!name.endsWith("/")) {
        uncompressedTotal += uncompressedSize;
        if (
          uncompressedTotal > MAX_ZIP_UNCOMPRESSED_BYTES ||
          (uncompressedSize > 0 && compressedSize === 0) ||
          (compressedSize > 0 && uncompressedSize / compressedSize > 200)
        ) {
          throw new Error("archive expands beyond the safe inspection limit");
        }
      }

      if (
        localOffset + 30 > centralOffset ||
        view.getUint32(localOffset, true) !== 0x04034b50
      ) {
        throw new Error("missing local entry");
      }
      const localFlags = view.getUint16(localOffset + 6, true);
      const localMethod = view.getUint16(localOffset + 8, true);
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const localNameStart = localOffset + 30;
      const localDataStart = localNameStart + localNameLength + localExtraLength;
      const localName = new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.slice(localNameStart, localNameStart + localNameLength)
      );
      if (
        localName !== name ||
        localFlags !== flags ||
        localMethod !== method ||
        localDataStart + compressedSize > centralOffset
      ) {
        throw new Error("central and local entries do not match");
      }
      names.push(name);
      offset = nextOffset;
    }
    if (offset !== centralOffset + centralSize) {
      throw new Error("central directory length mismatch");
    }
    return names;
  } catch {
    throw new UploadError(
      "The ZIP archive is malformed, encrypted, unsafe, or exceeds inspection limits."
    );
  }
}

export async function inspectUpload(file: File): Promise<InspectedUpload> {
  assertSafeFileName(file.name);
  if (file.size === 0) throw new UploadError("Empty files are not accepted.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(`${file.name} is larger than 10 MiB.`, 413);
  }

  const extension = uploadExtension(file.name) as AcceptedUploadExtension;
  const allowedMediaTypes = ACCEPTED_UPLOADS[extension];
  if (!allowedMediaTypes || !allowedMediaTypes.includes(file.type as never)) {
    throw new UploadError(
      `${file.name} is not an accepted file type or has a mismatched media type.`
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  assertMediaSignature(bytes, extension);
  if (extension === ".zip" || extension === ".docx") {
    const entries = inspectZip(bytes);
    if (
      extension === ".docx" &&
      (!entries.includes("[Content_Types].xml") ||
        !entries.some((entry) => entry.startsWith("word/")))
    ) {
      throw new UploadError("The DOCX structure is not valid.");
    }
  }

  const id = randomUUID();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    extension,
    staged: {
      id,
      fileName: file.name,
      kind: inferKind(file.name, extension),
      mediaType: file.type,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
      sha256,
      extension,
      storedName: `${id}${extension}`,
    },
  };
}

function newUploadHandle(): string {
  return randomBytes(32).toString("base64url");
}

function requestIdHash(requestId: string): string {
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new UploadError("The upload request id is invalid.");
  }
  return createHash("sha256").update(requestId).digest("hex");
}

function initialHandleForRequest(requestId: string): string {
  return createHash("sha256")
    .update(`one-box-upload:${requestId}`)
    .digest("base64url");
}

function batchFingerprint(inspected: InspectedUpload[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        inspected.map(({ staged }) => ({
          fileName: staged.fileName,
          mediaType: staged.mediaType,
          sizeBytes: staged.sizeBytes,
          sha256: staged.sha256,
        }))
      )
    )
    .digest("hex");
}

function handleHash(handle: string): string {
  if (!HANDLE_PATTERN.test(handle)) {
    throw new UploadError("The upload session is invalid or expired.", 401);
  }
  return createHash("sha256").update(handle).digest("hex");
}

function sessionPath(stagingRoot: string, handle: string): string {
  return path.join(stagingRoot, handleHash(handle));
}

function verifyManifestHandle(
  manifest: UploadSessionManifest,
  handle: string
): void {
  const expected = Buffer.from(manifest.handleHash, "hex");
  const actual = Buffer.from(handleHash(handle), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new UploadError("The upload session is invalid or expired.", 401);
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  await fs.rename(tempPath, filePath);
}

async function readSessionManifest(
  directory: string,
  handle: string,
  nowMs: number
): Promise<UploadSessionManifest> {
  try {
    const manifest = UploadSessionManifestSchema.parse(
      JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"))
    );
    verifyManifestHandle(manifest, handle);
    if (Date.parse(manifest.expiresAt) <= nowMs) {
      throw new UploadError("The upload session is invalid or expired.", 401);
    }
    return manifest;
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError("The upload session is invalid or expired.", 401);
  }
}

async function directoryBytes(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(entryPath);
    else if (entry.isFile()) total += (await fs.stat(entryPath)).size;
  }
  return total;
}

/** Remove abandoned sessions and return bytes still occupying staging. */
async function cleanupUploadSessionsUnlocked(
  stagingRoot = DEFAULT_STAGING_ROOT,
  nowMs = Date.now()
): Promise<number> {
  await fs.mkdir(stagingRoot, { recursive: true, mode: 0o700 });
  let activeBytes = 0;
  for (const entry of await fs.readdir(stagingRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(stagingRoot, entry.name);
    if (entry.name.startsWith(".upload-txn-")) {
      await fs.rm(directory, { recursive: true, force: true });
      continue;
    }
    let remove = entry.name.startsWith(".claiming-");
    try {
      const stat = await fs.stat(directory);
      if (remove && stat.mtimeMs > nowMs - UPLOAD_SESSION_TTL_MS) {
        activeBytes += await directoryBytes(directory);
        continue;
      }
      const manifest = UploadSessionManifestSchema.parse(
        JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"))
      );
      const referenced = new Set([
        "manifest.json",
        ...manifest.files.map((file) => file.storedName),
      ]);
      for (const child of await fs.readdir(directory, { withFileTypes: true })) {
        if (child.isFile() && !referenced.has(child.name)) {
          await fs.rm(path.join(directory, child.name), { force: true });
        }
      }
      remove = remove || Date.parse(manifest.expiresAt) <= nowMs;
    } catch {
      // A canonical session is committed only when its manifest exists.
      // Manifest-less directories are interrupted pre-commit transactions.
      remove = !entry.name.startsWith(".claiming-");
    }
    if (remove) await fs.rm(directory, { recursive: true, force: true });
    else activeBytes += await directoryBytes(directory);
  }
  return activeBytes;
}

export async function cleanupUploadSessions(
  stagingRoot = DEFAULT_STAGING_ROOT,
  nowMs = Date.now()
): Promise<number> {
  return withStagingLock(stagingRoot, () =>
    cleanupUploadSessionsUnlocked(stagingRoot, nowMs)
  );
}

export async function stageUploads(
  files: File[],
  options: StageUploadOptions = {}
): Promise<StageUploadResult> {
  const inspected = await Promise.all(files.map((file) => inspectUpload(file)));
  const incomingBytes = inspected.reduce(
    (total, upload) => total + upload.staged.sizeBytes,
    0
  );
  const stagingRoot = options.stagingRoot ?? DEFAULT_STAGING_ROOT;
  const nowMs = options.nowMs ?? Date.now();
  const ttlMs = options.ttlMs ?? UPLOAD_SESSION_TTL_MS;

  return withStagingLock(stagingRoot, async () => {
    const activeBytes = await cleanupUploadSessionsUnlocked(stagingRoot, nowMs);
    const handle =
      options.handle ??
      (options.requestId
        ? initialHandleForRequest(options.requestId)
        : newUploadHandle());
    const directory = sessionPath(stagingRoot, handle);
    const directoryExists = await fs
      .stat(directory)
      .then((stat) => stat.isDirectory())
      .catch(() => false);
    const existing =
      options.handle || directoryExists
        ? await readSessionManifest(directory, handle, nowMs)
        : undefined;
    const currentRequestHash = options.requestId
      ? requestIdHash(options.requestId)
      : undefined;
    const fingerprint = options.requestId
      ? batchFingerprint(inspected)
      : undefined;
    const replay = currentRequestHash
      ? existing?.requests.find(
          (request) => request.requestIdHash === currentRequestHash
        )
      : undefined;
    if (replay) {
      if (replay.fingerprint !== fingerprint) {
        throw new UploadError(
          "The upload request id was already used for different files.",
          409
        );
      }
      const byId = new Map(existing!.files.map((file) => [file.id, file]));
      return {
        uploadSession: handle,
        expiresAt: existing!.expiresAt,
        uploads: replay.uploadIds.map((id) =>
          UploadMetadataSchema.parse(byId.get(id))
        ),
      };
    }
    if (
      activeBytes + incomingBytes >
      (options.maxStagingBytes ?? MAX_STAGING_BYTES)
    ) {
      throw new UploadError(
        "Private upload staging is full. Wait for an earlier session to expire.",
        507
      );
    }

    const currentFiles = existing?.files ?? [];
    const totalBytes = (existing?.totalBytes ?? 0) + incomingBytes;
    if (
      currentFiles.length + inspected.length > MAX_UPLOAD_FILES ||
      totalBytes > MAX_SESSION_UPLOAD_BYTES
    ) {
      throw new UploadError(
        `An upload session accepts at most ${MAX_UPLOAD_FILES} files and 50 MiB total.`,
        413
      );
    }

    const transactionDirectory = path.join(
      stagingRoot,
      `.upload-txn-${handleHash(handle)}-${randomBytes(4).toString("hex")}`
    );
    await fs.mkdir(transactionDirectory, { recursive: false, mode: 0o700 });
    const committedBlobs: string[] = [];
    let committed = false;
    try {
      for (const upload of inspected) {
        const blobPath = path.join(transactionDirectory, upload.staged.storedName);
        await fs.writeFile(blobPath, upload.bytes, { mode: 0o600, flag: "wx" });
      }
      const timestamp = new Date(nowMs).toISOString();
      const expiresAt = new Date(nowMs + ttlMs).toISOString();
      const manifest = UploadSessionManifestSchema.parse({
        version: 1,
        sessionId: existing?.sessionId ?? randomUUID(),
        handleHash: handleHash(handle),
        state: "open",
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        expiresAt,
        totalBytes,
        files: [...currentFiles, ...inspected.map((upload) => upload.staged)],
        requests: [
          ...(existing?.requests ?? []),
          ...(currentRequestHash && fingerprint
            ? [
                {
                  requestIdHash: currentRequestHash,
                  fingerprint,
                  uploadIds: inspected.map(({ staged }) => staged.id),
                },
              ]
            : []),
        ],
      });
      await writeJsonAtomic(path.join(transactionDirectory, "manifest.json"), manifest);
      if (!existing) {
        await fs.rename(transactionDirectory, directory);
        committed = true;
      } else {
        for (const upload of inspected) {
          const destination = path.join(directory, upload.staged.storedName);
          await fs.rename(
            path.join(transactionDirectory, upload.staged.storedName),
            destination
          );
          committedBlobs.push(destination);
        }
        await fs.rename(
          path.join(transactionDirectory, "manifest.json"),
          path.join(directory, "manifest.json")
        );
        committed = true;
        await (
          options.cleanupTransactionDirectory ??
          ((target: string) => fs.rm(target, { recursive: true, force: true }))
        )(transactionDirectory).catch(() => undefined);
      }
      return {
        uploadSession: handle,
        expiresAt,
        uploads: inspected.map(({ staged }) =>
          UploadMetadataSchema.parse(staged)
        ),
      };
    } catch (error) {
      if (!committed) {
        await Promise.all(
          committedBlobs.map((filePath) => fs.rm(filePath, { force: true }))
        );
        await fs.rm(transactionDirectory, { recursive: true, force: true });
      }
      throw error;
    }
  });
}

async function verifiedBlob(
  directory: string,
  file: z.infer<typeof StagedFileSchema>
): Promise<Uint8Array> {
  const filePath = path.join(directory, file.storedName);
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size !== file.sizeBytes) {
    throw new UploadError("A staged file no longer matches its manifest.", 409);
  }
  const bytes = new Uint8Array(await fs.readFile(filePath));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== file.sha256) {
    throw new UploadError("A staged file no longer matches its manifest.", 409);
  }
  return bytes;
}

export async function claimUploadSession(
  handle: string | null | undefined,
  selectedIds: string[],
  runId: string,
  stagingRoot = DEFAULT_STAGING_ROOT,
  nowMs = Date.now(),
  cleanupClaimDirectory: (directory: string) => Promise<unknown> = (directory) =>
    fs.rm(directory, { recursive: true, force: true })
): Promise<UploadMetadata[]> {
  if (!handle) {
    if (selectedIds.length > 0) {
      throw new UploadError("Uploaded files require a valid upload session.", 401);
    }
    return [];
  }
  if (!RUN_ID_PATTERN.test(runId)) throw new UploadError("Invalid run id.");
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new UploadError("Duplicate uploaded files are not accepted.");
  }

  return withStagingLock(stagingRoot, async () => {
    const runManifestPath = path.join(sitePaths(runId).uploads, "manifest.json");
    try {
      const committed = RunUploadManifestSchema.parse(
        JSON.parse(await fs.readFile(runManifestPath, "utf8"))
      );
      if (
        committed.handleHash !== handleHash(handle) ||
        committed.files.map((file) => file.id).join("\0") !== selectedIds.join("\0")
      ) {
        throw new UploadError("The upload session was claimed by a different run request.", 409);
      }
      return committed.files.map((file) => UploadMetadataSchema.parse(file));
    } catch (error) {
      if (error instanceof UploadError) throw error;
      if (!(typeof error === "object" && error !== null && "code" in error &&
        (error as { code?: unknown }).code === "ENOENT")) throw error;
    }

    await cleanupUploadSessionsUnlocked(stagingRoot, nowMs);
    const originalDirectory = sessionPath(stagingRoot, handle);
    const originalExists = await fs.stat(originalDirectory).then(() => true).catch(() => false);
    if (!originalExists) {
      const prefix = `.claiming-${handleHash(handle)}-`;
      const interrupted = (await fs.readdir(stagingRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix));
      if (interrupted.length === 1) {
        await fs.rename(path.join(stagingRoot, interrupted[0].name), originalDirectory);
      }
    }
    const manifest = await readSessionManifest(originalDirectory, handle, nowMs);
    const byId = new Map(manifest.files.map((file) => [file.id, file]));
    const selected = selectedIds.map((id) => {
      const file = byId.get(id);
      if (!file) throw new UploadError("An uploaded file is not in this session.", 409);
      return file;
    });

    const claimDirectory = path.join(
      stagingRoot,
      `.claiming-${handleHash(handle)}-${randomBytes(4).toString("hex")}`
    );
    try {
      await fs.rename(originalDirectory, claimDirectory);
    } catch {
      throw new UploadError("The upload session was already claimed or expired.", 409);
    }

    const runRoot = sitePaths(runId).root;
    const destination = sitePaths(runId).uploads;
    const temporaryDestination = path.join(
      runRoot,
      `.${UPLOADS_DIR}.${randomBytes(4).toString("hex")}.tmp`
    );
    const authoritative: UploadMetadata[] = [];
    try {
      await fs.mkdir(temporaryDestination, { recursive: false, mode: 0o700 });
      for (const file of selected) {
        const bytes = await verifiedBlob(claimDirectory, file);
        const outputPath = path.join(temporaryDestination, file.storedName);
        await fs.writeFile(outputPath, bytes, { mode: 0o600, flag: "wx" });
        const outputHash = createHash("sha256").update(bytes).digest("hex");
        if (outputHash !== file.sha256) {
          throw new UploadError("A claimed file failed its integrity check.", 409);
        }
        authoritative.push(
          UploadMetadataSchema.parse({
            id: file.id,
            fileName: file.fileName,
            kind: file.kind,
            mediaType: file.mediaType,
            sizeBytes: file.sizeBytes,
            uploadedAt: file.uploadedAt,
            sha256: file.sha256,
            storagePath: path.posix.join(UPLOADS_DIR, file.storedName),
          })
        );
      }
      const runManifest = RunUploadManifestSchema.parse({
        version: 1,
        sessionId: manifest.sessionId,
        state: "claimed",
        claimedAt: new Date(nowMs).toISOString(),
        handleHash: handleHash(handle),
        files: authoritative,
      });
      await writeJsonAtomic(
        path.join(temporaryDestination, "manifest.json"),
        runManifest
      );
      await fs.rename(temporaryDestination, destination);
    } catch (error) {
      await fs.rm(temporaryDestination, { recursive: true, force: true });
      await fs.rename(claimDirectory, originalDirectory).catch(() => undefined);
      throw error;
    }
    // The destination rename is the atomic commit point. Cleanup is lifecycle
    // hygiene only: a failure here must not report a retryable claim failure or
    // restore a session whose bytes are already bound to the run.
    await cleanupClaimDirectory(claimDirectory).catch(() => undefined);
    return authoritative;
  });
}

export async function readRunUpload(
  runId: string,
  uploadId: string
): Promise<Uint8Array> {
  const directory = sitePaths(runId).uploads;
  const manifest = RunUploadManifestSchema.parse(
    JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"))
  );
  const metadata = manifest.files.find((file) => file.id === uploadId);
  if (!metadata?.storagePath || !metadata.sha256) {
    throw new UploadError("Run upload not found.", 404);
  }
  const resolved = path.resolve(sitePaths(runId).root, metadata.storagePath);
  if (!resolved.startsWith(path.resolve(directory) + path.sep)) {
    throw new UploadError("Run upload path is invalid.", 409);
  }
  const bytes = new Uint8Array(await fs.readFile(resolved));
  if (
    bytes.byteLength !== metadata.sizeBytes ||
    createHash("sha256").update(bytes).digest("hex") !== metadata.sha256
  ) {
    throw new UploadError("Run upload failed its integrity check.", 409);
  }
  return bytes;
}

export interface UploadEvidenceEntry {
  id: string;
  kind: UploadMetadata["kind"];
  sha256?: string;
  status: "text-consumed" | "asset-referenced" | "unsupported";
  consumer?: "design" | "copy";
  content?: string;
}

export interface RunUploadContext {
  entries: UploadEvidenceEntry[];
  /** Redacted, bounded model context. Never includes client file names,
   * storage paths, session handles, or unbounded binary bytes. */
  designPromptText: string;
  copyPromptText: string;
}

const MAX_UPLOAD_CONTEXT_CHARS = 24_000;
const MAX_UPLOAD_FILE_CHARS = 8_000;

function redactLikelySecrets(value: string): string {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})\b/gi, "[REDACTED_CREDENTIAL]")
    .replace(
      /\b(api[_ -]?key|token|password|secret)(\s*[:=]\s*)\S+/gi,
      (_match, label: string, separator: string) =>
        `${label}${separator}[REDACTED]`
    );
}

export async function buildRunUploadContext(
  runId: string,
  uploads: UploadMetadata[]
): Promise<RunUploadContext> {
  const entries: UploadEvidenceEntry[] = [];
  let remaining = MAX_UPLOAD_CONTEXT_CHARS;
  for (const upload of uploads) {
    const isText = ["text/plain", "text/markdown"].includes(upload.mediaType);
    const consumer = upload.kind === "copy-document"
      ? "copy"
      : ["brand-guidelines", "do-dont-list", "wish-list"].includes(upload.kind)
        ? "design"
        : undefined;
    if (isText && consumer && remaining > 0) {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
        await readRunUpload(runId, upload.id)
      );
      const content = redactLikelySecrets(decoded)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .slice(0, Math.min(MAX_UPLOAD_FILE_CHARS, remaining));
      remaining -= content.length;
      entries.push({
        id: upload.id,
        kind: upload.kind,
        sha256: upload.sha256,
        status: "text-consumed",
        consumer,
        content,
      });
    } else {
      // Binary uploads are retained as private run evidence, but no generation
      // stage currently reads their bytes. Do not overstate them as assets.
      entries.push({ id: upload.id, kind: upload.kind, sha256: upload.sha256, status: "unsupported" });
    }
  }
  const promptFor = (consumer: "design" | "copy") => entries
    .filter((entry) => entry.status === "text-consumed" && entry.consumer === consumer)
    .map((entry) => entry.content ?? "")
    .join("\n\n");
  return {
    entries,
    designPromptText: promptFor("design"),
    copyPromptText: promptFor("copy"),
  };
}
