import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { makeRunId } from "./runstate";
import { withFileLock } from "./fileLock";

const ATTEMPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

const IntakeAttemptRecordSchema = z
  .object({
    version: z.literal(2),
    attemptId: z.string().regex(ATTEMPT_ID_PATTERN),
    requestFingerprint: z.string().regex(HASH_PATTERN),
    state: z.enum(["reserved", "completed"]),
    runId: z.string().regex(/^[A-Za-z0-9_-]{4,40}$/).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (record.state === "completed" && !record.runId) {
      ctx.addIssue({ code: "custom", path: ["runId"], message: "completed attempt requires runId" });
    }
  });

export const DEFAULT_INTAKE_ATTEMPT_ROOT = path.join(process.cwd(), "sites", ".intake-attempts");

export interface SuccessfulIntakeAttempt { runId: string; started: true }
export interface FailedIntakeAttempt {
  started: false;
  code: "upload-session-expired";
  message: string;
}
export type IntakeAttemptResult = SuccessfulIntakeAttempt | FailedIntakeAttempt;
export type IntakeAttemptRecord = z.infer<typeof IntakeAttemptRecordSchema>;

export class IntakeAttemptConflict extends Error {
  constructor() {
    super("This intake attempt id was already used for a different request.");
    this.name = "IntakeAttemptConflict";
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

export function canonicalRequestFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function paths(root: string, attemptId: string) {
  return {
    record: path.join(root, `${attemptId}.json`),
    lock: path.join(root, ".locks", `${attemptId}.lock`),
  };
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === "ENOENT";
}

async function readRecord(filePath: string): Promise<IntakeAttemptRecord | undefined> {
  try {
    return IntakeAttemptRecordSchema.parse(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if (isEnoent(error)) return undefined;
    throw error;
  }
}

async function writeRecord(filePath: string, record: IntakeAttemptRecord): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(IntakeAttemptRecordSchema.parse(record), null, 2), {
    encoding: "utf8", mode: 0o600, flag: "wx",
  });
  await fs.rename(temporary, filePath);
}

function assertFingerprint(record: IntakeAttemptRecord, fingerprint: string): void {
  if (record.requestFingerprint !== fingerprint) throw new IntakeAttemptConflict();
}

export async function reserveIntakeAttempt(
  attemptId: string,
  requestFingerprint: string,
  root = DEFAULT_INTAKE_ATTEMPT_ROOT
): Promise<IntakeAttemptRecord> {
  if (!ATTEMPT_ID_PATTERN.test(attemptId) || !HASH_PATTERN.test(requestFingerprint)) {
    throw new Error("Invalid intake attempt reservation.");
  }
  const attemptPaths = paths(root, attemptId);
  return withFileLock(attemptPaths.lock, async () => {
    const existing = await readRecord(attemptPaths.record);
    if (existing) {
      assertFingerprint(existing, requestFingerprint);
      return existing;
    }
    const timestamp = new Date().toISOString();
    const record = IntakeAttemptRecordSchema.parse({
      version: 2,
      attemptId,
      requestFingerprint,
      state: "reserved",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await writeRecord(attemptPaths.record, record);
    return record;
  });
}

/** Reserve runId before any run/upload side effect, then complete atomically. */
export async function runIntakeAttempt(
  attemptId: string,
  requestFingerprint: string,
  operation: (runId: string) => Promise<IntakeAttemptResult>,
  root = DEFAULT_INTAKE_ATTEMPT_ROOT,
  allocateRunId: () => string = makeRunId
): Promise<IntakeAttemptResult> {
  const attemptPaths = paths(root, attemptId);
  return withFileLock(attemptPaths.lock, async () => {
    let record = await readRecord(attemptPaths.record);
    if (!record) throw new Error("Intake attempt was not reserved.");
    assertFingerprint(record, requestFingerprint);
    if (record.state === "completed") return { runId: record.runId!, started: true };

    if (!record.runId) {
      record = IntakeAttemptRecordSchema.parse({
        ...record,
        runId: allocateRunId(),
        updatedAt: new Date().toISOString(),
      });
      await writeRecord(attemptPaths.record, record);
    }
    const result = await operation(record.runId!);
    if (!result.started) return result;
    record = IntakeAttemptRecordSchema.parse({
      ...record,
      state: "completed",
      updatedAt: new Date().toISOString(),
    });
    await writeRecord(attemptPaths.record, record);
    return { runId: record.runId!, started: true };
  });
}
