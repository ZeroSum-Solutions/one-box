import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  CandidateManifestV1,
  PersistedPageIrV1,
} from "./contracts";
import { PAGE_IR_BOUNDS } from "./contracts";
import {
  materializePageIrCandidateUnderSiteAuthority,
} from "./pageIrPipeline";
import { sitePaths } from "./runstate";
import {
  assertSiteAuthorityHeld,
  resolveSiteAuthorityWriteTarget,
} from "./siteAuthority";

const EXTENSION_BY_MEDIA_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
} as const;
const FALLBACK_RELATIVE_PATH_PATTERN = /^uploads\/page-ir-edit-assets\/[A-Za-z0-9_-]{1,80}-[a-f0-9]{12}\.(?:jpg|png|webp|avif|gif)$/;

export interface PageIrAssetAuthority {
  inputArtifactHashes: Array<{ path: string; sha256: string }>;
  manifest: CandidateManifestV1;
}

export interface PageIrAssetSource {
  assetId: string;
  artifactPath: string;
  mediaType: keyof typeof EXTENSION_BY_MEDIA_TYPE;
  sha256: string;
}

export interface PageIrFallbackAssetWrite {
  path: string;
  bytes: Buffer;
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === code;
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readVerifiedRegularFile(
  filePath: string,
  expectedSha256: string,
  expectedSize: number,
): Promise<Buffer> {
  const target = await resolveSiteAuthorityWriteTarget(filePath);
  const stat = await fs.lstat(target).catch((error: unknown) => {
    if (isCode(error, "ENOENT")) return undefined;
    throw error;
  });
  if (
    !stat ||
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.nlink > 1 ||
    stat.size !== expectedSize ||
    stat.size > PAGE_IR_BOUNDS.maxAssetBytes
  ) {
    throw new Error(`Page IR compiler asset is not one bounded regular file: ${path.basename(target)}`);
  }
  const bytes = await fs.readFile(target);
  if (sha256(bytes) !== expectedSha256) {
    throw new Error(`Page IR compiler asset does not match its authoritative binding: ${path.basename(target)}`);
  }
  return bytes;
}

/** Resolve the exact compiler inputs for persisted Page IR under held site authority. */
export async function derivePageIrAssetSourcesUnderSiteAuthority(
  runId: string,
  envelope: PersistedPageIrV1,
  authority: PageIrAssetAuthority,
): Promise<{
  assets: PageIrAssetSource[];
  fallbackWrites: PageIrFallbackAssetWrite[];
}> {
  assertSiteAuthorityHeld(runId);
  const runRoot = sitePaths(runId).root;
  const referencedIds = new Set(
    envelope.pageIr.slotBindings
      .filter((binding) => binding.kind === "media")
      .map((binding) => binding.assetId),
  );
  const assets: PageIrAssetSource[] = [];
  const fallbackWrites: PageIrFallbackAssetWrite[] = [];
  for (const asset of envelope.pageIr.assets.filter((entry) => referencedIds.has(entry.id))) {
    const boundInputs = authority.inputArtifactHashes.filter(
      (input) => input.sha256 === asset.sha256 && input.path.startsWith("uploads/"),
    );
    if (boundInputs.length > 1) {
      throw new Error(`Page IR asset ${asset.id} has ambiguous promoted input bindings`);
    }
    let artifactPath: string;
    if (boundInputs.length === 1) {
      artifactPath = boundInputs[0].path;
      const absolute = path.join(runRoot, ...artifactPath.split("/"));
      await readVerifiedRegularFile(absolute, asset.sha256, asset.sizeBytes);
    } else {
      const extension = EXTENSION_BY_MEDIA_TYPE[asset.mediaType];
      const compiledPath = `assets/${asset.id}.${extension}`;
      const compiledMatches = authority.manifest.files.filter(
        (file) => file.path === compiledPath && file.sha256 === asset.sha256,
      );
      if (compiledMatches.length !== 1 || compiledMatches[0].sizeBytes !== asset.sizeBytes) {
        throw new Error(`Page IR asset ${asset.id} has no unique validated compiler input or live projection`);
      }
      const bytes = await readVerifiedRegularFile(
        path.join(runRoot, "site", ...compiledPath.split("/")),
        asset.sha256,
        asset.sizeBytes,
      );
      artifactPath = `uploads/page-ir-edit-assets/${asset.id}-${asset.sha256.slice(0, 12)}.${extension}`;
      fallbackWrites.push({
        path: path.join(runRoot, ...artifactPath.split("/")),
        bytes,
      });
    }
    assets.push({
      assetId: asset.id,
      artifactPath,
      mediaType: asset.mediaType,
      sha256: asset.sha256,
    });
  }
  return { assets, fallbackWrites };
}

async function atomicWriteFallbackUnderSiteAuthority(
  runId: string,
  filePath: string,
  bytes: Buffer,
): Promise<void> {
  assertSiteAuthorityHeld(runId);
  const target = await resolveSiteAuthorityWriteTarget(filePath);
  const parent = path.dirname(target);
  await fs.mkdir(parent, { recursive: true });
  const temporary = path.join(
    parent,
    `.${path.basename(target)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    const handle = await fs.open(temporary, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, target);
    await syncDirectory(parent);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

/** Materialize deterministic fallback assets without replacing conflicting bytes. */
export async function writePageIrFallbackAssetsUnderSiteAuthority(
  runId: string,
  fallbackWrites: readonly PageIrFallbackAssetWrite[],
): Promise<void> {
  assertSiteAuthorityHeld(runId);
  const runRoot = sitePaths(runId).root;
  const targets = new Set<string>();
  const validated: Array<{ fallback: PageIrFallbackAssetWrite; target: string }> = [];
  for (const fallback of fallbackWrites) {
    const relativePath = path.relative(runRoot, fallback.path).split(path.sep).join("/");
    if (!FALLBACK_RELATIVE_PATH_PATTERN.test(relativePath)) {
      throw new Error("Page IR fallback asset path is outside the closed deterministic namespace");
    }
    const target = await resolveSiteAuthorityWriteTarget(fallback.path);
    if (targets.has(target)) {
      throw new Error("Page IR fallback asset targets must be unique");
    }
    targets.add(target);
    validated.push({ fallback, target });
  }
  for (const { fallback, target } of validated) {
    const current = await fs.lstat(target).catch((error: unknown) => {
      if (isCode(error, "ENOENT")) return undefined;
      throw error;
    });
    if (current) {
      if (current.isSymbolicLink() || !current.isFile() || current.nlink > 1) {
        throw new Error("Page IR fallback asset must be one regular file");
      }
      const bytes = await fs.readFile(target);
      if (!bytes.equals(fallback.bytes)) {
        throw new Error("Page IR fallback asset conflicts with its validated projection");
      }
      continue;
    }
    await atomicWriteFallbackUnderSiteAuthority(runId, target, fallback.bytes);
  }
}

/** Rebuild persisted Page IR using the exact promoted asset authority. */
export async function materializePersistedPageIrCandidateFromAuthorityUnderSiteAuthority(
  input: {
    schemaVersion: 1;
    runId: string;
    envelope: PersistedPageIrV1;
    authority: PageIrAssetAuthority;
  },
) {
  assertSiteAuthorityHeld(input.runId);
  const plan = await derivePageIrAssetSourcesUnderSiteAuthority(
    input.runId,
    input.envelope,
    input.authority,
  );
  await writePageIrFallbackAssetsUnderSiteAuthority(
    input.runId,
    plan.fallbackWrites,
  );
  return materializePageIrCandidateUnderSiteAuthority({
    schemaVersion: input.schemaVersion,
    runId: input.runId,
    assets: plan.assets,
  });
}
