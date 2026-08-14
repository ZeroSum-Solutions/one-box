import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { z } from "zod";
import { atomicWrite } from "./siteMutation";

export const IMAGE_GENERATION_CREDIT_CAP = 14;

const ImageGenerationEntrySchema = z.object({
  requestId: z.string().uuid(),
  editId: z.string().min(2).max(80),
  instructionSha256: z.string().regex(/^[0-9a-f]{64}$/),
  model: z.literal("gpt_image_2"),
  credits: z.number().int().positive(),
  status: z.enum(["reserved", "completed", "failed"]),
  reservedAt: z.string(),
  finishedAt: z.string().optional(),
  error: z.string().max(500).optional(),
});

const ImageGenerationLedgerSchema = z.object({
  version: z.literal(1),
  capCredits: z.literal(IMAGE_GENERATION_CREDIT_CAP),
  entries: z.array(ImageGenerationEntrySchema).max(100),
});

export type ImageGenerationLedger = z.infer<typeof ImageGenerationLedgerSchema>;

export class ImageGenerationBudgetError extends Error {
  constructor(
    message: string,
    readonly status: 409 | 429,
  ) {
    super(message);
    this.name = "ImageGenerationBudgetError";
  }
}

async function readLedger(filePath: string): Promise<ImageGenerationLedger> {
  try {
    return ImageGenerationLedgerSchema.parse(
      JSON.parse(await fs.readFile(filePath, "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, capCredits: IMAGE_GENERATION_CREDIT_CAP, entries: [] };
    }
    throw error;
  }
}

async function writeLedger(filePath: string, ledger: ImageGenerationLedger) {
  await atomicWrite(filePath, `${JSON.stringify(ledger, null, 2)}\n`);
}

/** Caller must hold the per-run site mutation lock. A reservation is durable
 * before provider execution and counts even if generation later fails because
 * the upstream job may already have consumed credits. */
export async function reserveImageGeneration(
  filePath: string,
  input: {
    requestId: string;
    editId: string;
    instruction: string;
    credits: number;
  },
) {
  const ledger = await readLedger(filePath);
  if (ledger.entries.some((entry) => entry.requestId === input.requestId)) {
    throw new ImageGenerationBudgetError(
      "this image-generation request was already processed",
      409,
    );
  }
  const usedCredits = ledger.entries.reduce(
    (total, entry) => total + entry.credits,
    0,
  );
  if (usedCredits + input.credits > ledger.capCredits) {
    throw new ImageGenerationBudgetError(
      `image-generation credit cap reached (${usedCredits}/${ledger.capCredits})`,
      429,
    );
  }
  const entry = ImageGenerationEntrySchema.parse({
    requestId: input.requestId,
    editId: input.editId,
    instructionSha256: createHash("sha256").update(input.instruction).digest("hex"),
    model: "gpt_image_2",
    credits: input.credits,
    status: "reserved",
    reservedAt: new Date().toISOString(),
  });
  const next = ImageGenerationLedgerSchema.parse({
    ...ledger,
    entries: [...ledger.entries, entry],
  });
  await writeLedger(filePath, next);
  return {
    entry,
    usedCredits: usedCredits + input.credits,
    capCredits: next.capCredits,
  };
}

export async function finishImageGeneration(
  filePath: string,
  requestId: string,
  status: "completed" | "failed",
  error?: string,
) {
  const ledger = await readLedger(filePath);
  let matched = false;
  const entries = ledger.entries.map((entry) => {
    if (entry.requestId !== requestId) return entry;
    matched = true;
    return ImageGenerationEntrySchema.parse({
      ...entry,
      status,
      finishedAt: new Date().toISOString(),
      error: error?.slice(0, 500),
    });
  });
  if (!matched) throw new Error("image-generation reservation not found");
  const next = ImageGenerationLedgerSchema.parse({ ...ledger, entries });
  await writeLedger(filePath, next);
  return next;
}

export async function readImageGenerationLedger(filePath: string) {
  return readLedger(filePath);
}
