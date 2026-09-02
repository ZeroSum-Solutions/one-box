import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  EVIDENCE_WORKFLOW_STAGES,
  UploadMetadataSchema,
  type EvidenceWorkflowStage,
  type WorkflowArtifactType,
} from "./contracts";
import { withFileLock } from "./fileLock";
import { sitePaths } from "./runstate";
import { claimEvidenceUploadSession, UploadError } from "./uploads";

const WORKFLOW_ARTIFACT_TYPES = [
  "reference-selection",
  "ledger",
  "design-contract",
  "token-inventory",
  "tailwind-plan",
  "css-architecture",
  "visual-qa",
] as const;

export const ReviewFeedbackActionSchema = z
  .object({
    action: z.literal("record-feedback"),
    feedbackId: z.string().uuid(),
    text: z.string().trim().min(1).max(2_000),
    uploadSession: z.string().min(1).nullable(),
    uploadIds: z.array(z.string().uuid()).max(5),
  })
  .strict();

export const ReviewFeedbackReceiptSchema = z
  .object({
    id: z.string().uuid(),
    stage: z.enum(EVIDENCE_WORKFLOW_STAGES),
    artifactType: z.enum(WORKFLOW_ARTIFACT_TYPES),
    artifactVersion: z.number().int().positive(),
    text: z.string().min(1).max(2_000),
    recordedAt: z.string(),
    requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    attachments: z.array(UploadMetadataSchema).max(5),
  })
  .strict();

export type ReviewFeedbackReceipt = z.infer<typeof ReviewFeedbackReceiptSchema>;

export class ReviewFeedbackError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "ReviewFeedbackError";
  }
}

interface RecordReviewFeedbackInput {
  runId: string;
  feedbackId: string;
  text: string;
  uploadSession: string | null;
  uploadIds: string[];
  stage: EvidenceWorkflowStage;
  artifactType: WorkflowArtifactType | "reference-selection";
  artifactVersion: number;
}

function feedbackPath(runId: string, feedbackId: string): string {
  return path.join(
    sitePaths(runId).root,
    "evidence",
    "review-feedback",
    `${feedbackId}.json`,
  );
}

function requestSha256(input: RecordReviewFeedbackInput): string {
  return createHash("sha256")
    .update(JSON.stringify({
      id: input.feedbackId,
      stage: input.stage,
      artifactType: input.artifactType,
      artifactVersion: input.artifactVersion,
      text: input.text,
      uploadSession: input.uploadSession,
      uploadIds: input.uploadIds,
    }))
    .digest("hex");
}

async function readReceipt(filePath: string): Promise<ReviewFeedbackReceipt | null> {
  try {
    return ReviewFeedbackReceiptSchema.parse(
      JSON.parse(await fs.readFile(filePath, "utf8")),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

export async function recordReviewFeedback(
  input: RecordReviewFeedbackInput,
): Promise<ReviewFeedbackReceipt> {
  const parsedAction = ReviewFeedbackActionSchema.parse({
    action: "record-feedback",
    feedbackId: input.feedbackId,
    text: input.text,
    uploadSession: input.uploadSession,
    uploadIds: input.uploadIds,
  });
  if (parsedAction.uploadIds.length > 0 && !parsedAction.uploadSession) {
    throw new ReviewFeedbackError(
      "Feedback attachments require a valid upload session.",
      400,
    );
  }
  if (parsedAction.uploadIds.length === 0 && parsedAction.uploadSession) {
    throw new ReviewFeedbackError(
      "An upload session without selected feedback attachments is invalid.",
      400,
    );
  }

  const filePath = feedbackPath(input.runId, parsedAction.feedbackId);
  const digest = requestSha256({ ...input, ...parsedAction });
  return withFileLock(`${filePath}.lock`, async () => {
    const existing = await readReceipt(filePath);
    if (existing) {
      if (existing.requestSha256 !== digest) {
        throw new ReviewFeedbackError(
          "The feedback id was already used for a different review request.",
        );
      }
      return existing;
    }

    let attachments;
    try {
      attachments = await claimEvidenceUploadSession(
        parsedAction.uploadSession,
        parsedAction.uploadIds,
        input.runId,
        parsedAction.feedbackId,
      );
    } catch (error) {
      if (error instanceof UploadError) {
        throw new ReviewFeedbackError(error.message, error.status);
      }
      throw error;
    }
    const receipt = ReviewFeedbackReceiptSchema.parse({
      id: parsedAction.feedbackId,
      stage: input.stage,
      artifactType: input.artifactType,
      artifactVersion: input.artifactVersion,
      text: parsedAction.text,
      recordedAt: new Date().toISOString(),
      requestSha256: digest,
      attachments,
    });
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const temporary = path.join(
      path.dirname(filePath),
      `.${parsedAction.feedbackId}-${randomBytes(4).toString("hex")}.tmp`,
    );
    await fs.writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await fs.rename(temporary, filePath);
    return receipt;
  });
}
