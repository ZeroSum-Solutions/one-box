import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { z } from "zod";
import { applyElementHtmlEdit, ElementEditError } from "./elementEditor";
import {
  finishImageGeneration,
  readImageGenerationLedger,
  reserveImageGeneration,
} from "./imageGenerationBudget";
import {
  invalidateApprovedVisualQaUnderSiteAuthority,
  RunNotFoundError,
  sitePaths,
} from "./runstate";
import {
  assertSafeRunId,
  atomicWrite,
  withSiteAuthorityLock,
  type GateRunner,
} from "./siteMutation";
import {
  estimateImageCredits,
  generateImage,
  type GenerateImageOptions,
  type GenerateImageResult,
} from "./tools/higgsfield";

export const IMAGE_MODELS = [
  {
    id: "higgsfield:gpt_image_2",
    label: "GPT Image 2",
    provider: "higgsfield",
    jobType: "gpt_image_2",
    descriptor:
      "High-quality prompt-to-image generation. Usually slower and may queue for several minutes. Supports prompt-based regeneration, not source-image editing. Metered Higgsfield credits; the exact estimate is reserved before generation.",
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
    qualities: ["low", "medium", "high"],
  },
] as const;

export type ImageModelId = (typeof IMAGE_MODELS)[number]["id"];
export type ImageQuality = (typeof IMAGE_MODELS)[number]["qualities"][number];

export const IMAGE_GENERATION_STALE_MS = 15 * 60 * 1_000;
export const IMAGE_LIBRARY_CAPACITY = 500;
const INTERRUPTED_GENERATION_ERROR =
  "Generation was interrupted before completion. Retry to create a new image.";
const ORPHANED_RESERVATION_ERROR =
  "Generation was interrupted before its catalog record was saved.";
const GENERATION_REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UsageSchema = z.object({
  editId: z.string().nullable(),
  src: z.string(),
});

export const ImageLibraryItemSchema = z.object({
  id: z.string().min(8).max(80),
  status: z.enum(["pending", "completed", "failed"]),
  prompt: z.string().max(4000).nullable(),
  model: z.string(),
  provider: z.string(),
  aspectRatio: z.string().nullable(),
  quality: z.enum(["low", "medium", "high"]).nullable(),
  dimensions: z
    .object({ width: z.number().int().positive(), height: z.number().int().positive() })
    .nullable(),
  mimeType: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  credits: z.number().int().positive().nullable(),
  error: z.string().max(500).nullable(),
  outputPath: z.string().nullable(),
  approvalInvalidatedAt: z.string().nullable().default(null),
  source: z.object({
    kind: z.enum(["generated", "legacy"]),
    parentAssetId: z.string().nullable(),
    targetEditId: z.string().nullable(),
    originalPath: z.string().nullable(),
  }),
  usage: z.array(UsageSchema),
});

const ImageLibrarySchema = z.object({
  version: z.literal(1),
  items: z.array(ImageLibraryItemSchema).max(IMAGE_LIBRARY_CAPACITY),
});

export type ImageLibraryItem = z.infer<typeof ImageLibraryItemSchema>;
export type ImageLibrary = z.infer<typeof ImageLibrarySchema>;

export const GenerateImageRequestSchema = z
  .object({
    action: z.literal("generate"),
    requestId: z.string().uuid(),
    prompt: z.string().trim().min(3).max(4000),
    model: z.literal(IMAGE_MODELS[0].id),
    aspectRatio: z.enum(IMAGE_MODELS[0].aspectRatios),
    quality: z.enum(IMAGE_MODELS[0].qualities),
    meteredConsent: z.literal(true),
    sourceAssetId: z.string().min(8).max(80).optional(),
    targetEditId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]{1,79}$/i)
      .optional(),
  })
  .strict();

export const PlaceImageRequestSchema = z
  .object({
    action: z.literal("place"),
    assetId: z.string().min(8).max(80),
    editId: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/i),
  })
  .strict();

export const RegenerateImageRequestSchema = z
  .object({
    action: z.literal("regenerate"),
    requestId: z.string().uuid(),
    assetId: z.string().min(8).max(80),
    prompt: z.string().trim().min(3).max(4000).optional(),
    model: z.literal(IMAGE_MODELS[0].id).optional(),
    aspectRatio: z.enum(IMAGE_MODELS[0].aspectRatios).optional(),
    quality: z.enum(IMAGE_MODELS[0].qualities).optional(),
    meteredConsent: z.literal(true),
  })
  .strict();

export const AssetMutationRequestSchema = z.discriminatedUnion("action", [
  GenerateImageRequestSchema,
  PlaceImageRequestSchema,
  RegenerateImageRequestSchema,
]);

export class ImageLibraryError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ImageLibraryError";
  }
}

interface LibraryPaths {
  root: string;
  site: string;
  catalog: string;
  ledger: string;
  staging: string;
  claims: string;
}

function libraryPaths(runId: string, sitesRoot?: string): LibraryPaths {
  assertSafeRunId(runId);
  const roots = sitesRoot
    ? {
        root: path.join(sitesRoot, runId),
        site: path.join(sitesRoot, runId, "site"),
      }
    : sitePaths(runId);
  return {
    root: roots.root,
    site: roots.site,
    catalog: path.join(roots.root, "image-library.json"),
    ledger: path.join(roots.root, "image-generation-ledger.json"),
    staging: path.join(roots.root, "image-staging"),
    claims: path.join(roots.root, "image-generation-claims"),
  };
}

function withImageAuthority<T>(
  runId: string,
  files: LibraryPaths,
  operation: () => Promise<T>,
) {
  return withSiteAuthorityLock(runId, operation, { runRoot: files.root });
}

async function readCatalog(filePath: string): Promise<ImageLibrary> {
  try {
    return ImageLibrarySchema.parse(
      JSON.parse(await fs.readFile(filePath, "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, items: [] };
    }
    throw error;
  }
}

async function writeCatalog(filePath: string, catalog: ImageLibrary) {
  const safe = ImageLibrarySchema.parse(catalog);
  await atomicWrite(filePath, `${JSON.stringify(safe, null, 2)}\n`);
  return safe;
}

function mimeForPath(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return null;
}

function safeSiteImagePath(raw: string): string | null {
  if (!raw || /^(?:data:|blob:|https?:|\/\/)/i.test(raw)) return null;
  const withoutSuffix = raw.split(/[?#]/, 1)[0].replace(/^\.\//, "");
  const normalized = path.posix.normalize(withoutSuffix).replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized.startsWith("../"))
    return null;
  return mimeForPath(normalized) ? normalized : null;
}

function legacyId(relativePath: string) {
  return `legacy_${createHash("sha256").update(relativePath).digest("hex").slice(0, 20)}`;
}

function matchingReplay(
  library: ImageLibrary,
  input: GenerateProjectImageInput,
): { item: ImageLibraryItem; library: ImageLibrary } | null {
  const item = library.items.find((candidate) => candidate.id === input.requestId);
  if (!item) return null;
  const matches =
    item.source.kind === "generated" &&
    item.prompt === input.prompt &&
    item.model === input.model &&
    item.aspectRatio === input.aspectRatio &&
    item.quality === input.quality &&
    item.source.parentAssetId === (input.sourceAssetId ?? null) &&
    item.source.targetEditId === (input.targetEditId ?? null);
  if (!matches) {
    throw new ImageLibraryError(
      "this image request id was already used with a different payload",
      409,
    );
  }
  return { item, library };
}

function generationRequestSnapshot(input: GenerateProjectImageInput) {
  return {
    prompt: input.prompt,
    model: input.model,
    aspectRatio: input.aspectRatio,
    quality: input.quality,
    sourceAssetId: input.sourceAssetId ?? null,
    targetEditId: input.targetEditId ?? null,
  };
}

function sameGenerationSnapshot(
  left: ReturnType<typeof generationRequestSnapshot>,
  right: ReturnType<typeof generationRequestSnapshot>,
) {
  return (
    left.prompt === right.prompt &&
    left.model === right.model &&
    left.aspectRatio === right.aspectRatio &&
    left.quality === right.quality &&
    left.sourceAssetId === right.sourceAssetId &&
    left.targetEditId === right.targetEditId
  );
}

interface GenerationClaim {
  lockPath: string;
  ownerClaimPath: string;
  token: string;
}

async function releaseGenerationClaim(claim: GenerationClaim) {
  const releaseOwnerPath = `${claim.ownerClaimPath}.release-${claim.token}`;
  try {
    await fs.rename(claim.ownerClaimPath, releaseOwnerPath);
    const releasedPath = `${claim.lockPath}.released-${claim.token}`;
    await fs.rename(claim.lockPath, releasedPath);
    await fs.rm(releasedPath, { recursive: true, force: true });
    await fs.rm(releaseOwnerPath, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function reclaimObservedGenerationClaim(
  lockPath: string,
  observedOwnerToken: string,
  contenderToken: string,
  hooks: { beforeAuthorize?: () => Promise<void> } = {},
): Promise<boolean> {
  const ownerClaimPath = path.join(
    `${lockPath}.owners`,
    `${observedOwnerToken}.owner`,
  );
  const authorizedPath = `${ownerClaimPath}.reclaim-${contenderToken}`;
  await hooks.beforeAuthorize?.();
  try {
    // The immutable, token-specific owner claim is the CAS generation. Only
    // the waiter that moves this exact file may touch the canonical lock path.
    await fs.rename(ownerClaimPath, authorizedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }

  const abandonedPath = `${lockPath}.abandoned-${contenderToken}`;
  try {
    // The canonical path remains present until the authorized waiter moves it,
    // so a replacement owner cannot appear between authorization and rename.
    await fs.rename(lockPath, abandonedPath);
    await fs.rm(abandonedPath, { recursive: true, force: true });
    return true;
  } finally {
    await fs.rm(authorizedPath, { force: true });
  }
}

async function claimGenerationRequest(
  files: LibraryPaths,
  input: GenerateProjectImageInput,
): Promise<GenerationClaim | { replay: { item: ImageLibraryItem; library: ImageLibrary } }> {
  await fs.mkdir(files.claims, { recursive: true });
  const lockPath = path.join(files.claims, `${input.requestId}.lock`);
  const ownerDirectory = `${lockPath}.owners`;
  await fs.mkdir(ownerDirectory, { recursive: true });
  const token = randomBytes(12).toString("hex");
  const ownerClaimPath = path.join(ownerDirectory, `${token}.owner`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await fs.writeFile(ownerClaimPath, token, { flag: "wx" });
      await fs.mkdir(lockPath);
      try {
        await fs.writeFile(
          path.join(lockPath, "owner.json"),
          JSON.stringify({
            token,
            createdAt: new Date().toISOString(),
            request: generationRequestSnapshot(input),
          }),
          { flag: "wx" },
        );
      } catch (error) {
        await fs.rm(lockPath, { recursive: true, force: true });
        await fs.rm(ownerClaimPath, { force: true });
        throw error;
      }
      return { lockPath, ownerClaimPath, token };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        await fs.rm(ownerClaimPath, { force: true });
        throw error;
      }
      await fs.rm(ownerClaimPath, { force: true });
    }

    const replay = matchingReplay(await readCatalog(files.catalog), input);
    if (
      replay &&
      (replay.item.status !== "completed" ||
        replay.item.approvalInvalidatedAt)
    ) {
      return { replay };
    }

    let observedOwnerToken: string | null = null;
    try {
      const owner = JSON.parse(
        await fs.readFile(path.join(lockPath, "owner.json"), "utf8"),
      ) as {
        token?: unknown;
        request?: ReturnType<typeof generationRequestSnapshot>;
      };
      observedOwnerToken =
        typeof owner.token === "string" ? owner.token : null;
      if (
        owner.request &&
        !sameGenerationSnapshot(owner.request, generationRequestSnapshot(input))
      ) {
        throw new ImageLibraryError(
          "this image request id is already claimed with a different payload",
          409,
        );
      }
    } catch (error) {
      if (
        error instanceof ImageLibraryError ||
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      ) {
        throw error;
      }
    }

    try {
      const stat = await fs.stat(lockPath);
      if (
        observedOwnerToken &&
        Date.now() - stat.mtimeMs >= IMAGE_GENERATION_STALE_MS &&
        (await reclaimObservedGenerationClaim(
          lockPath,
          observedOwnerToken,
          token,
        ))
      ) {
        continue;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new ImageLibraryError(
    "image request is being claimed; retry the same request id",
    409,
  );
}

type ApprovalInvalidator = (runId: string) => Promise<boolean>;

async function findRecoverableOutput(
  files: LibraryPaths,
  requestId: string,
  includeStaging: boolean,
) {
  if (!GENERATION_REQUEST_ID.test(requestId)) return null;
  for (const extension of ["png", "jpg", "webp"] as const) {
    const relativePath = `assets/generated/${requestId}.${extension}`;
    try {
      const buffer = await fs.readFile(path.join(files.site, relativePath));
      const metadata = detectGeneratedImage(buffer);
      if (metadata) return { relativePath, metadata };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!includeStaging) return null;
  const stagingPath = path.join(files.staging, `${requestId}.download`);
  try {
    const buffer = await fs.readFile(stagingPath);
    const metadata = detectGeneratedImage(buffer);
    if (!metadata) return null;
    const relativePath = `assets/generated/${requestId}.${metadata.extension}`;
    const finalPath = path.join(files.site, relativePath);
    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    await fs.rename(stagingPath, finalPath);
    return { relativePath, metadata };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function markApprovalInvalidated(
  runId: string,
  item: ImageLibraryItem,
  invalidator: ApprovalInvalidator,
  timestamp: string,
) {
  if (
    item.status !== "completed" ||
    item.source.kind !== "generated" ||
    item.approvalInvalidatedAt
  ) {
    return item;
  }
  try {
    await invalidator(runId);
  } catch (error) {
    if (error instanceof RunNotFoundError) return item;
    throw error;
  }
  return ImageLibraryItemSchema.parse({
    ...item,
    approvalInvalidatedAt: timestamp,
  });
}

async function synchronizeUnlocked(
  runId: string,
  sitesRoot?: string,
  invalidator: ApprovalInvalidator =
    invalidateApprovedVisualQaUnderSiteAuthority,
  now: () => Date = () => new Date(),
): Promise<ImageLibrary> {
  const files = libraryPaths(runId, sitesRoot);
  const htmlPath = path.join(files.site, "index.html");
  let html: string;
  try {
    html = await fs.readFile(htmlPath, "utf8");
  } catch {
    throw new ImageLibraryError("site not built", 404);
  }

  const catalog = await readCatalog(files.catalog);
  const ledger = await readImageGenerationLedger(files.ledger);
  const ledgerById = new Map(
    ledger.entries.map((entry) => [entry.requestId, entry]),
  );
  const currentTime = now().getTime();
  const reconciledAt = new Date(currentTime).toISOString();
  const reconciledItems: ImageLibraryItem[] = [];
  for (const item of catalog.items) {
    let next = item;
    const ledgerEntry = ledgerById.get(item.id);
    const updatedAt = Date.parse(item.updatedAt);
    const stale =
      item.status === "pending" &&
      (!Number.isFinite(updatedAt) ||
        currentTime - updatedAt >= IMAGE_GENERATION_STALE_MS);

    if (item.status === "pending") {
      const recovered = await findRecoverableOutput(files, item.id, stale);
      if (recovered) {
        next = ImageLibraryItemSchema.parse({
          ...item,
          status: "completed",
          dimensions: recovered.metadata.dimensions,
          mimeType: recovered.metadata.mimeType,
          outputPath: `site/${recovered.relativePath}`,
          error: null,
          updatedAt: reconciledAt,
        });
        if (ledgerEntry?.status === "reserved") {
          await finishImageGeneration(files.ledger, item.id, "completed");
        }
      } else if (stale) {
        next = ImageLibraryItemSchema.parse({
          ...item,
          status: "failed",
          error: INTERRUPTED_GENERATION_ERROR,
          updatedAt: reconciledAt,
        });
        if (ledgerEntry?.status === "reserved") {
          await finishImageGeneration(
            files.ledger,
            item.id,
            "failed",
            INTERRUPTED_GENERATION_ERROR,
          );
        }
      }
    } else if (ledgerEntry?.status === "reserved") {
      await finishImageGeneration(
        files.ledger,
        item.id,
        item.status,
        item.error ?? undefined,
      );
    }

    next = await markApprovalInvalidated(
      runId,
      next,
      invalidator,
      reconciledAt,
    );
    reconciledItems.push(next);
  }

  const catalogIds = new Set(catalog.items.map((item) => item.id));
  for (const entry of ledger.entries) {
    if (entry.status !== "reserved" || catalogIds.has(entry.requestId)) continue;
    await finishImageGeneration(
      files.ledger,
      entry.requestId,
      "failed",
      ORPHANED_RESERVATION_ERROR,
    );
  }
  const byOutputPath = new Map(
    reconciledItems
      .filter((item) => item.outputPath)
      .map((item) => [item.outputPath as string, item]),
  );
  const usageByPath = new Map<string, Array<z.infer<typeof UsageSchema>>>();
  const $ = cheerio.load(html);
  $("img[src]").each((_, element) => {
    const relativePath = safeSiteImagePath($(element).attr("src") ?? "");
    if (!relativePath) return;
    const usage = usageByPath.get(relativePath) ?? [];
    usage.push({
      editId:
        $(element).attr("data-edit-id") ??
        $(element).closest("[data-edit-id]").attr("data-edit-id") ??
        null,
      src: $(element).attr("src") ?? relativePath,
    });
    usageByPath.set(relativePath, usage);
  });

  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(files.site, "manifest.json"), "utf8"),
    ) as { assets?: Array<{ path?: unknown; kind?: unknown }> };
    for (const asset of manifest.assets ?? []) {
      if (asset.kind !== "image" || typeof asset.path !== "string") continue;
      const relativePath = safeSiteImagePath(asset.path);
      if (relativePath && !usageByPath.has(relativePath)) {
        usageByPath.set(relativePath, []);
      }
    }
  } catch {
    // The HTML remains authoritative for older builds without a manifest.
  }

  const nextItems = reconciledItems.map((item) => {
    if (!item.outputPath?.startsWith("site/")) return item;
    const relativePath = item.outputPath.slice("site/".length);
    return { ...item, usage: usageByPath.get(relativePath) ?? [] };
  });

  for (const [relativePath, usage] of usageByPath) {
    const outputPath = `site/${relativePath}`;
    if (byOutputPath.has(outputPath)) continue;
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(path.join(files.site, relativePath));
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    const timestamp = (stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime).toISOString();
    nextItems.push(
      ImageLibraryItemSchema.parse({
        id: legacyId(relativePath),
        status: "completed",
        prompt: null,
        model: "unknown",
        provider: "unknown",
        aspectRatio: null,
        quality: null,
        dimensions: null,
        mimeType: mimeForPath(relativePath),
        createdAt: timestamp,
        updatedAt: timestamp,
        credits: null,
        error: null,
        outputPath,
        source: {
          kind: "legacy",
          parentAssetId: null,
          targetEditId: usage[0]?.editId ?? null,
          originalPath: relativePath,
        },
        usage,
      }),
    );
  }

  nextItems.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return writeCatalog(files.catalog, { version: 1, items: nextItems });
}

export function listProjectImages(runId: string, sitesRoot?: string) {
  const files = libraryPaths(runId, sitesRoot);
  return withImageAuthority(runId, files, () =>
    synchronizeUnlocked(runId, sitesRoot),
  );
}

export function assetPublicUrl(runId: string, item: ImageLibraryItem) {
  if (!item.outputPath?.startsWith("site/")) return null;
  const relative = item.outputPath.slice("site/".length);
  return `/api/sites/${encodeURIComponent(runId)}/${relative
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function detectGeneratedImage(buffer: Buffer): {
  mimeType: string;
  extension: string;
  dimensions: { width: number; height: number } | null;
} | null {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return {
      mimeType: "image/png",
      extension: "png",
      dimensions: {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      },
    };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          mimeType: "image/jpeg",
          extension: "jpg",
          dimensions: {
            width: buffer.readUInt16BE(offset + 7),
            height: buffer.readUInt16BE(offset + 5),
          },
        };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
    return { mimeType: "image/jpeg", extension: "jpg", dimensions: null };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: "webp", dimensions: null };
  }
  return null;
}

export interface GenerateProjectImageInput {
  runId: string;
  requestId: string;
  prompt: string;
  model: ImageModelId;
  aspectRatio: (typeof IMAGE_MODELS)[number]["aspectRatios"][number];
  quality: ImageQuality;
  meteredConsent: true;
  sourceAssetId?: string;
  targetEditId?: string;
}

export interface ImageLibraryDependencies {
  sitesRoot?: string;
  now?: () => Date;
  invalidateApproval?: ApprovalInvalidator;
  estimate?: (options: GenerateImageOptions) => Promise<number | { error: string }>;
  generate?: (
    options: GenerateImageOptions,
  ) => Promise<GenerateImageResult | { error: string }>;
}

async function recoverClaimedOrphan(
  input: GenerateProjectImageInput,
  files: LibraryPaths,
  now: () => Date,
  invalidator: ApprovalInvalidator,
) {
  return withImageAuthority(input.runId, files, async () => {
    const catalog = await readCatalog(files.catalog);
    if (catalog.items.some((item) => item.id === input.requestId)) return null;
    const ledger = await readImageGenerationLedger(files.ledger);
    const entry = ledger.entries.find(
      (candidate) => candidate.requestId === input.requestId,
    );
    if (!entry) return null;
    if (catalog.items.length >= IMAGE_LIBRARY_CAPACITY) {
      throw new ImageLibraryError(
        `image catalog capacity reached (${IMAGE_LIBRARY_CAPACITY})`,
        409,
      );
    }

    const recoveredOutput = await findRecoverableOutput(
      files,
      input.requestId,
      true,
    );
    const timestamp = now().toISOString();
    let item = ImageLibraryItemSchema.parse({
      id: input.requestId,
      status: recoveredOutput ? "completed" : "failed",
      prompt: input.prompt,
      model: input.model,
      provider: IMAGE_MODELS[0].provider,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      dimensions: recoveredOutput?.metadata.dimensions ?? null,
      mimeType: recoveredOutput?.metadata.mimeType ?? null,
      createdAt: entry.reservedAt,
      updatedAt: timestamp,
      credits: entry.credits,
      error: recoveredOutput ? null : entry.error ?? ORPHANED_RESERVATION_ERROR,
      outputPath: recoveredOutput
        ? `site/${recoveredOutput.relativePath}`
        : null,
      source: {
        kind: "generated",
        parentAssetId: input.sourceAssetId ?? null,
        targetEditId: input.targetEditId ?? null,
        originalPath: null,
      },
      usage: [],
    });
    let library = await writeCatalog(files.catalog, {
      version: 1,
      items: [item, ...catalog.items],
    });
    const terminalStatus = recoveredOutput ? "completed" : "failed";
    if (entry.status !== terminalStatus) {
      await finishImageGeneration(
        files.ledger,
        input.requestId,
        terminalStatus,
        item.error ?? undefined,
      );
    }
    item = await markApprovalInvalidated(
      input.runId,
      item,
      invalidator,
      now().toISOString(),
    );
    if (
      item.approvalInvalidatedAt !== library.items[0].approvalInvalidatedAt
    ) {
      library = await writeCatalog(files.catalog, {
        version: 1,
        items: [item, ...library.items.slice(1)],
      });
    }
    return { item, library };
  });
}

export async function generateProjectImage(
  input: GenerateProjectImageInput,
  dependencies: ImageLibraryDependencies = {},
): Promise<{ item: ImageLibraryItem; library: ImageLibrary }> {
  assertSafeRunId(input.runId);
  if (!GENERATION_REQUEST_ID.test(input.requestId)) {
    throw new ImageLibraryError("invalid image request id");
  }
  if (input.meteredConsent !== true) {
    throw new ImageLibraryError("explicit metered consent is required");
  }
  if (input.model !== IMAGE_MODELS[0].id) {
    throw new ImageLibraryError("unsupported image model");
  }
  const files = libraryPaths(input.runId, dependencies.sitesRoot);
  const claim = await claimGenerationRequest(files, input);
  if ("replay" in claim) return claim.replay;
  try {
    return await executeClaimedGeneration(input, dependencies);
  } finally {
    await releaseGenerationClaim(claim).catch(() => undefined);
  }
}

async function executeClaimedGeneration(
  input: GenerateProjectImageInput,
  dependencies: ImageLibraryDependencies = {},
): Promise<{ item: ImageLibraryItem; library: ImageLibrary }> {
  assertSafeRunId(input.runId);
  if (input.meteredConsent !== true) {
    throw new ImageLibraryError("explicit metered consent is required");
  }
  if (input.model !== IMAGE_MODELS[0].id) {
    throw new ImageLibraryError("unsupported image model");
  }
  const files = libraryPaths(input.runId, dependencies.sitesRoot);
  const now = dependencies.now ?? (() => new Date());
  const estimate = dependencies.estimate ?? estimateImageCredits;
  const providerGenerate = dependencies.generate ?? generateImage;
  const invalidateApproval =
    dependencies.invalidateApproval ??
    invalidateApprovedVisualQaUnderSiteAuthority;
  const stagingPath = path.join(files.staging, `${input.requestId}.download`);
  const generationOptions: GenerateImageOptions = {
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    quality: input.quality,
    outPath: stagingPath,
  };

  const orphanReplay = await recoverClaimedOrphan(
    input,
    files,
    now,
    invalidateApproval,
  );
  if (orphanReplay) return orphanReplay;

  const preflightLibrary = await withImageAuthority(input.runId, files, () =>
    synchronizeUnlocked(
      input.runId,
      dependencies.sitesRoot,
      invalidateApproval,
      now,
    ),
  );
  const replay = matchingReplay(preflightLibrary, input);
  if (replay) return replay;
  if (preflightLibrary.items.length >= IMAGE_LIBRARY_CAPACITY) {
    throw new ImageLibraryError(
      `image catalog capacity reached (${IMAGE_LIBRARY_CAPACITY})`,
      409,
    );
  }
  if (
    input.sourceAssetId &&
    !preflightLibrary.items.some((item) => item.id === input.sourceAssetId)
  ) {
    throw new ImageLibraryError("source image not found", 404);
  }

  // Provider preflight runs outside site authority. Only the short durable
  // reservation/catalog transaction below takes the site lock.
  const estimatedCredits = await estimate(generationOptions);
  if (typeof estimatedCredits !== "number") {
    throw new ImageLibraryError(estimatedCredits.error, 502);
  }

  let pendingItem!: ImageLibraryItem;
  await withImageAuthority(input.runId, files, async () => {
    const catalog = await synchronizeUnlocked(
      input.runId,
      dependencies.sitesRoot,
      invalidateApproval,
      now,
    );
    if (catalog.items.some((item) => item.id === input.requestId)) {
      throw new ImageLibraryError("this image request already exists", 409);
    }
    if (catalog.items.length >= IMAGE_LIBRARY_CAPACITY) {
      throw new ImageLibraryError(
        `image catalog capacity reached (${IMAGE_LIBRARY_CAPACITY})`,
        409,
      );
    }
    if (
      input.sourceAssetId &&
      !catalog.items.some((item) => item.id === input.sourceAssetId)
    ) {
      throw new ImageLibraryError("source image not found", 404);
    }
    const reservation = await reserveImageGeneration(files.ledger, {
      requestId: input.requestId,
      editId: input.targetEditId ?? input.sourceAssetId ?? "image-library",
      instruction: input.prompt,
      credits: estimatedCredits,
    });
    const timestamp = now().toISOString();
    pendingItem = ImageLibraryItemSchema.parse({
      id: input.requestId,
      status: "pending",
      prompt: input.prompt,
      model: input.model,
      provider: IMAGE_MODELS[0].provider,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      dimensions: null,
      mimeType: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      credits: reservation.entry.credits,
      error: null,
      outputPath: null,
      source: {
        kind: "generated",
        parentAssetId: input.sourceAssetId ?? null,
        targetEditId: input.targetEditId ?? null,
        originalPath: null,
      },
      usage: [],
    });
    await writeCatalog(files.catalog, {
      version: 1,
      items: [pendingItem, ...catalog.items],
    });
  });

  // The paid, potentially multi-minute provider call is deliberately outside
  // the site lock. A refresh can read the durable pending catalog entry.
  const generated = await providerGenerate(generationOptions);
  if ("error" in generated) {
    const library = await failGeneration(
      input.runId,
      input.requestId,
      generated.error,
      files,
      now,
    );
    return {
      item: library.items.find((item) => item.id === input.requestId)!,
      library,
    };
  }

  try {
    const buffer = await fs.readFile(stagingPath);
    const metadata = detectGeneratedImage(buffer);
    if (!metadata) throw new ImageLibraryError("provider returned an unsupported image format", 502);
    const relativeOutput = `assets/generated/${input.requestId}.${metadata.extension}`;
    const finalPath = path.join(files.site, relativeOutput);
    let library!: ImageLibrary;
    await withImageAuthority(input.runId, files, async () => {
      const catalog = await readCatalog(files.catalog);
      await fs.mkdir(path.dirname(finalPath), { recursive: true });
      await fs.rename(stagingPath, finalPath);
      const updatedAt = now().toISOString();
      const items = catalog.items.map((item) =>
        item.id === input.requestId
          ? ImageLibraryItemSchema.parse({
              ...item,
              status: "completed",
              dimensions: metadata.dimensions,
              mimeType: metadata.mimeType,
              outputPath: `site/${relativeOutput}`,
              updatedAt,
            })
          : item,
      );
      library = await writeCatalog(files.catalog, { version: 1, items });
      await finishImageGeneration(files.ledger, input.requestId, "completed");
      const completedItem = library.items.find(
        (item) => item.id === input.requestId,
      )!;
      const approvalSafeItem = await markApprovalInvalidated(
        input.runId,
        completedItem,
        invalidateApproval,
        now().toISOString(),
      );
      if (approvalSafeItem !== completedItem) {
        library = await writeCatalog(files.catalog, {
          version: 1,
          items: library.items.map((item) =>
            item.id === input.requestId ? approvalSafeItem : item,
          ),
        });
      }
    });
    return {
      item: library.items.find((item) => item.id === input.requestId)!,
      library,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "image finalization failed";
    const completedOutput = await findRecoverableOutput(
      files,
      input.requestId,
      false,
    );
    if (completedOutput) {
      const recovered = await withImageAuthority(input.runId, files, () =>
        synchronizeUnlocked(
          input.runId,
          dependencies.sitesRoot,
          invalidateApproval,
          now,
        ),
      );
      const recoveredItem = recovered.items.find(
        (item) => item.id === input.requestId,
      );
      if (recoveredItem?.status === "completed") {
        return { item: recoveredItem, library: recovered };
      }
      throw error;
    }
    const library = await failGeneration(
      input.runId,
      input.requestId,
      message,
      files,
      now,
    );
    return {
      item: library.items.find((item) => item.id === input.requestId)!,
      library,
    };
  } finally {
    await fs.unlink(stagingPath).catch(() => undefined);
  }
}

async function failGeneration(
  runId: string,
  requestId: string,
  error: string,
  files: LibraryPaths,
  now: () => Date,
) {
  return withImageAuthority(runId, files, async () => {
    const catalog = await readCatalog(files.catalog);
    const items = catalog.items.map((item) =>
      item.id === requestId
        ? ImageLibraryItemSchema.parse({
            ...item,
            status: "failed",
            error: error.slice(0, 500),
            updatedAt: now().toISOString(),
          })
        : item,
    );
    const library = await writeCatalog(files.catalog, { version: 1, items });
    await finishImageGeneration(files.ledger, requestId, "failed", error);
    return library;
  });
}

export interface PlaceImageOptions {
  sitesRoot?: string;
  gateRunner?: GateRunner;
}

export async function placeLibraryImage(
  runId: string,
  assetId: string,
  editId: string,
  options: PlaceImageOptions = {},
) {
  const library = await listProjectImages(runId, options.sitesRoot);
  const item = library.items.find((candidate) => candidate.id === assetId);
  if (!item || item.status !== "completed" || !item.outputPath) {
    throw new ImageLibraryError("completed image not found", 404);
  }
  if (!item.outputPath.startsWith("site/")) {
    throw new ImageLibraryError("image output path is invalid", 409);
  }
  const src = item.outputPath.slice("site/".length);
  if (!safeSiteImagePath(src)) {
    throw new ImageLibraryError("image output path is invalid", 409);
  }
  const result = await applyElementHtmlEdit(
    runId,
    editId,
    (html) => {
      const $ = cheerio.load(html);
      const selected = $("[data-edit-id]").filter(
        (_, element) => $(element).attr("data-edit-id") === editId,
      );
      if (selected.length !== 1) {
        throw new ElementEditError(`edit id not found or ambiguous: ${editId}`, 404);
      }
      const image = selected.is("img") ? selected : selected.find("img").first();
      if (!image.length) {
        throw new ElementEditError("selected element does not contain an image", 409);
      }
      image.attr("src", src);
      if (!image.attr("alt") && item.prompt) image.attr("alt", item.prompt.slice(0, 100));
      return $.html();
    },
    { sitesRoot: options.sitesRoot, gateRunner: options.gateRunner },
  );
  const refreshed = await listProjectImages(runId, options.sitesRoot);
  return { item: refreshed.items.find((candidate) => candidate.id === assetId)!, ...result };
}
