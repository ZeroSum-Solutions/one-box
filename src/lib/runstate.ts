/**
 * Durable run state: sites/<id>/run.json is the resumable state machine for
 * the pipeline (audit amendment #23). Every write is atomic (tmp+rename) so
 * a crash mid-write never corrupts the file a browser refresh reads next.
 *
 * File-layout helpers (sitePaths/artifactPath) and the create/load/save +
 * stage + cost helpers below are the shared contract every pipeline stage,
 * API route, and tool module builds on — see contracts.ts for the shapes.
 */
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ARTIFACTS,
  ARTIFACT_APPROVAL_TRANSITIONS,
  ArtifactApprovalStateSchema,
  CANDIDATE_DIR,
  EVIDENCE_STAGE_ARTIFACT,
  EVIDENCE_WORKFLOW_STAGES,
  EVENTS_FILE,
  FallbackOriginSchema,
  IntakeSchema,
  MODELS,
  normalizeFallbackFailureMessage,
  RESEARCH_DIR,
  RunIdSchema,
  RunStateSchema,
  SITE_DIR,
  STAGES,
  UPLOADS_DIR,
  WorkflowArtifactDraftSchema,
  WorkflowArtifactVersionSchema,
  V2DesignContractMetadataSchema,
  type ArtifactApprovalState,
  type EvidenceWorkflowStage,
  type FallbackFailureSnapshot,
  type FallbackOrigin,
  type HumanVisualReview,
  type LayoutAuthority,
  type PipelineEvent,
  type PageIrRolloutDecisionV1,
  type RunState,
  type Stage,
  type TemplateFallbackReason,
  type WorkflowArtifactDraft,
  type WorkflowArtifactType,
  type WorkflowArtifactVersion,
  workflowArtifactApprovalState,
} from "./contracts";
import {
  assertCanonicalTokenInventory,
  assertTailwindPlanMatchesInventory,
  buildVisualQa,
} from "./evidence";
import { withFileLock } from "./fileLock";
import { fallbackCreatedEvent } from "./rolloutObservability";

// Statically scoped subfolder (Turbopack fs-tracing requirement).
const SITES_ROOT = path.join(process.cwd(), "sites");

// ---------- Errors ----------

/** Thrown once a run's costUsd passes its costCapUsd. The spend that tipped
 * it over is recorded first — never lost — then this throws so the caller
 * stops instead of silently retrying (contracts.ts costCapUsd contract). */
export class CostCapExceeded extends Error {
  readonly runId: string;
  readonly costUsd: number;
  readonly costCapUsd: number;

  constructor(runId: string, costUsd: number, costCapUsd: number) {
    super(
      `run ${runId}: cost $${costUsd.toFixed(4)} exceeded cap $${costCapUsd.toFixed(2)}`
    );
    this.name = "CostCapExceeded";
    this.runId = runId;
    this.costUsd = costUsd;
    this.costCapUsd = costCapUsd;
  }
}

export class RunNotFoundError extends Error {
  readonly runId: string;

  constructor(runId: string) {
    super(`run not found: ${runId}`);
    this.name = "RunNotFoundError";
    this.runId = runId;
  }
}

// ---------- Paths ----------

export interface SitePaths {
  /** sites/<id>/ */
  root: string;
  /** sites/<id>/research/ — competitor crawl/screenshot artifacts */
  research: string;
  /** sites/<id>/site/ — the built static site */
  site: string;
  /** sites/<id>/uploads/ — server-claimed intake blobs, never publicly served */
  uploads: string;
}

export function sitePaths(runId: string): SitePaths {
  const root = path.join(SITES_ROOT, runId);
  return {
    root,
    research: path.join(root, RESEARCH_DIR),
    site: path.join(root, SITE_DIR),
    uploads: path.join(root, UPLOADS_DIR),
  };
}

export interface CandidatePaths {
  /** sites/<id>/candidate/ — the only candidate root for this run */
  root: string;
  /** Deterministic static output, never served by the site route. */
  site: string;
  manifest: string;
  provenance: string;
  gates: string;
}

/** Derive only the closed one-candidate-per-run layout. Unlike the legacy
 * artifactPath helper, this API accepts no caller-provided suffix. */
export function candidatePaths(runId: string): Readonly<CandidatePaths> {
  const parsed = RunIdSchema.safeParse(runId);
  if (!parsed.success) throw new Error("bad runId");
  const root = path.join(SITES_ROOT, parsed.data, CANDIDATE_DIR);
  return Object.freeze({
    root,
    site: path.join(root, SITE_DIR),
    manifest: path.join(root, "manifest.json"),
    provenance: path.join(root, "provenance.json"),
    gates: path.join(root, "gates.json"),
  });
}

export interface PageIrPaths {
  /** sites/<id>/page-ir.json — the authoritative initial Page IR checkpoint. */
  pageIr: string;
  /** Closed numeric-v1 source bundle root; no latest alias is permitted. */
  sourceRoot: string;
  sourceBundle: string;
  layoutDecision: string;
  content: string;
  assets: string;
}

/** Derive only the fixed Page IR checkpoint and numeric-v1 source paths. */
export function pageIrPaths(runId: string): Readonly<PageIrPaths> {
  const parsed = RunIdSchema.safeParse(runId);
  if (!parsed.success) throw new Error("bad runId");
  const root = sitePaths(parsed.data).root;
  const sourceRoot = path.join(root, "page-ir-sources", "v1");
  return Object.freeze({
    pageIr: path.join(root, ARTIFACTS.pageIr),
    sourceRoot,
    sourceBundle: path.join(sourceRoot, "bundle.json"),
    layoutDecision: path.join(sourceRoot, "layout-decision.json"),
    content: path.join(sourceRoot, "content.json"),
    assets: path.join(sourceRoot, "assets.json"),
  });
}

/** Resolve any ARTIFACTS.* relative path (or a hand-built one) under the run root. */
export function artifactPath(runId: string, artifactRelPath: string): string {
  return path.join(sitePaths(runId).root, artifactRelPath);
}

function runFilePath(runId: string): string {
  return path.join(sitePaths(runId).root, "run.json");
}

// ---------- makeRunId ----------

/** Short, url-safe, collision-resistant run id. Timestamp-free by design —
 * crypto randomness is enough entropy for a single-user local prototype. */
export function makeRunId(): string {
  return randomBytes(9).toString("base64url");
}

// ---------- atomic write ----------

async function atomicWrite(filePath: string, content: string | Uint8Array): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`
  );
  try {
    const handle = await fs.open(tmpPath, "wx");
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmpPath, filePath);
    const directory = await fs.open(dir, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await fs.rm(tmpPath, { force: true });
  }
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

// ---------- run.json create/load/save ----------

export interface CreateRunOptions {
  /** Pre-reserved id used by the crash-resumable intake attempt state machine. */
  id?: string;
  costCapUsd?: number;
  pipelineVersion?: RunState["pipelineVersion"];
  referenceMode?: RunState["referenceMode"];
  layoutAuthority?: LayoutAuthority;
  /** Required only when creating a new page-ir-v1 run. Existing runs resume
   * from persisted authority without consulting a future rollout decision. */
  pageIrRolloutPermitted?: boolean;
  /** Optional creation-time rollout evidence. Production intake supplies it
   * through ensureRun.newRunRolloutDecision; direct fixtures may omit it. */
  rolloutDecision?: PageIrRolloutDecisionV1;
  /** defaults to the pinned MODELS from contracts.ts (audit #3: record the
   * exact slugs a run used in its own manifest). */
  modelSlugs?: Record<string, string>;
  /** Picker pilot flag, captured once at creation so a mid-run env change can
   * never alter resume semantics (plan rev 2 §A). */
  referencePickerEnabled?: boolean;
}

function assertPublicCreateRunOptions(opts: object): void {
  if (Object.prototype.hasOwnProperty.call(opts, "fallbackOrigin")) {
    throw new Error("fallbackOrigin is not a public run option");
  }
}

/** Create a new run directory + run.json. Returns the new run's id. */
export async function createRun(opts: CreateRunOptions = {}): Promise<string> {
  assertPublicCreateRunOptions(opts);
  const id = opts.id ?? makeRunId();
  if (!/^[a-z0-9_-]{4,40}$/i.test(id)) throw new Error("bad runId");
  const layoutAuthority = opts.layoutAuthority ?? "template-v1";
  if (
    layoutAuthority === "page-ir-v1" &&
    opts.pageIrRolloutPermitted !== true
  ) {
    throw new Error("page-ir-v1 run creation requires explicit rollout permission");
  }
  const stages = Object.fromEntries(
    STAGES.map((s) => [
      s,
      { status: "pending" as const, retries: 0, gateRepairAttempts: 0 },
    ])
  ) as RunState["stages"];

  const state = RunStateSchema.parse({
    id,
    createdAt: new Date().toISOString(),
    pipelineVersion: opts.pipelineVersion ?? "evidence-gated-v2",
    stages,
    costCapUsd: opts.costCapUsd,
    modelSlugs: opts.modelSlugs ?? { ...MODELS },
    referenceMode: opts.referenceMode,
    referencePickerEnabled: opts.referencePickerEnabled,
    layoutAuthority,
    rolloutDecision: opts.rolloutDecision,
  });

  await persistNewRun(state);
  return id;
}

/** Create a pre-reserved run exactly once, or resume its existing state.
 * Options apply only on first creation — an existing run's persisted flags
 * are authoritative and never rewritten here. */
export interface EnsureRunOptions extends Omit<CreateRunOptions, "id"> {
  /** Consulted only if this call creates the run. If the run already exists,
   * its persisted authority and decision win even when process flags changed. */
  newRunRolloutDecision?: PageIrRolloutDecisionV1;
}

export async function ensureRun(
  runId: string,
  opts: EnsureRunOptions = {}
): Promise<string> {
  assertPublicCreateRunOptions(opts);
  try {
    const existing = await loadRun(runId);
    if (
      opts.layoutAuthority !== undefined &&
      opts.layoutAuthority !== existing.layoutAuthority
    ) {
      throw new Error("existing run layout authority does not match request");
    }
    return runId;
  } catch (error) {
    if (!(error instanceof RunNotFoundError)) throw error;
  }
  try {
    const { newRunRolloutDecision, ...createOptions } = opts;
    return await createRun({
      ...createOptions,
      id: runId,
      ...(newRunRolloutDecision
        ? {
            layoutAuthority: newRunRolloutDecision.layoutAuthority,
            pageIrRolloutPermitted:
              newRunRolloutDecision.layoutAuthority === "page-ir-v1",
            rolloutDecision: newRunRolloutDecision,
          }
        : {}),
    });
  } catch (error) {
    if (!(error instanceof RunAlreadyExistsError)) throw error;
    return ensureRun(runId, opts);
  }
}

/** Remove only a validated run root. Used when setup fails before a run can be
 * exposed or resumed. */
export async function removeRun(runId: string): Promise<void> {
  if (!/^[a-z0-9_-]{4,40}$/i.test(runId)) throw new Error("bad runId");
  await fs.rm(sitePaths(runId).root, { recursive: true, force: true });
}

export async function loadRun(runId: string): Promise<RunState> {
  let raw: string;
  try {
    raw = await fs.readFile(runFilePath(runId), "utf8");
  } catch (err) {
    if (isEnoent(err)) throw new RunNotFoundError(runId);
    throw err;
  }
  const parsed = RunStateSchema.parse(JSON.parse(raw));
  if (parsed.templateFallback) {
    assertFailureSnapshotMatchesState(parsed, parsed.templateFallback.failure);
  }
  return parsed;
}

function equalPersistedValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

class RunAlreadyExistsError extends Error {}

async function persistNewRun(state: RunState): Promise<void> {
  const validated = RunStateSchema.parse(state);
  await withRunLock(validated.id, async () => {
    try {
      await loadRun(validated.id);
      throw new RunAlreadyExistsError(`run already exists: ${validated.id}`);
    } catch (error) {
      if (!(error instanceof RunNotFoundError)) throw error;
    }
    await atomicWrite(
      runFilePath(validated.id),
      JSON.stringify(validated, null, 2),
    );
  });
}

function assertFailureSnapshotMatchesState(
  state: RunState,
  snapshot: FallbackFailureSnapshot,
): void {
  const stage = state.stages[snapshot.stage];
  const normalized = normalizeFallbackFailureMessage(stage?.error ?? "");
  const expectedHash = createHash("sha256").update(normalized).digest("hex");
  if (
    stage?.status !== "failed" ||
    normalized.length === 0 ||
    snapshot.message !== normalized.slice(0, 500) ||
    (normalized.length > 500
      ? snapshot.messageSha256 !== expectedHash
      : snapshot.messageSha256 !== undefined)
  ) {
    throw new Error("template fallback failure snapshot does not match source run");
  }
}

function assertStoredRunMutation(existing: RunState, next: RunState): void {
  if (existing.id !== next.id) throw new Error("run ID is immutable");
  if (existing.layoutAuthority !== next.layoutAuthority) {
    throw new Error("run layout authority is immutable");
  }
  if (!equalPersistedValue(existing.rolloutDecision, next.rolloutDecision)) {
    throw new Error("run rollout decision is immutable");
  }
  if (!equalPersistedValue(existing.fallbackOrigin, next.fallbackOrigin)) {
    throw new Error("run fallback origin is immutable");
  }
  if (existing.templateFallback) {
    if (!equalPersistedValue(existing, next)) {
      throw new Error("a run linked to a template fallback is terminal and immutable");
    }
    return;
  }
  if (next.templateFallback) {
    const withoutLink = { ...next, templateFallback: undefined };
    if (!equalPersistedValue(existing, withoutLink)) {
      throw new Error("template fallback link is append-only");
    }
  }
}

async function saveRunUnlocked(state: RunState): Promise<void> {
  const validated = RunStateSchema.parse(state);
  if (validated.templateFallback) {
    assertFailureSnapshotMatchesState(
      validated,
      validated.templateFallback.failure,
    );
  }
  const existing = await loadRun(validated.id);
  assertStoredRunMutation(existing, validated);
  await atomicWrite(runFilePath(validated.id), JSON.stringify(validated, null, 2));
}

export function saveRun(state: RunState): Promise<void> {
  return withRunLock(state.id, () => saveRunUnlocked(state));
}

export function assertRunLayoutAuthority(
  state: RunState,
  expected: LayoutAuthority,
  operation: string,
): void {
  if (state.layoutAuthority !== expected) {
    throw new LayoutAuthorityMismatchError(
      `${operation} requires ${expected} authority; persisted run uses ${state.layoutAuthority}`,
    );
  }
}

export class LayoutAuthorityMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutAuthorityMismatchError";
  }
}

export interface TemplateFallbackHooks {
  beforeClaim?: () => void | Promise<void>;
  afterClaim?: () => void | Promise<void>;
  afterChildCreate?: () => void | Promise<void>;
  afterUploadClone?: () => void | Promise<void>;
  afterIntakeSave?: () => void | Promise<void>;
  afterIntakeFinish?: () => void | Promise<void>;
  afterSourceLink?: () => void | Promise<void>;
}

const TEMPLATE_FALLBACK_CLAIM_FILE = ".template-fallback-claim.json";
const MAX_TEMPLATE_FALLBACK_CLAIM_BYTES = 4_096;
const TemplateFallbackClaimSchema = z
  .object({
    schemaVersion: z.literal(1),
    childRunId: RunIdSchema,
    origin: FallbackOriginSchema,
    intakeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
type TemplateFallbackClaim = z.infer<typeof TemplateFallbackClaimSchema>;

function fallbackClaimPath(sourceRunId: string): string {
  return path.join(sitePaths(sourceRunId).root, TEMPLATE_FALLBACK_CLAIM_FILE);
}

async function syncDirectory(directoryPath: string): Promise<void> {
  const directory = await fs.open(directoryPath, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function readFallbackClaim(
  sourceRunId: string,
): Promise<TemplateFallbackClaim | undefined> {
  const claimPath = fallbackClaimPath(sourceRunId);
  let before;
  try {
    before = await fs.lstat(claimPath);
  } catch (error) {
    if (isEnoent(error)) return undefined;
    throw error;
  }
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size > MAX_TEMPLATE_FALLBACK_CLAIM_BYTES
  ) {
    throw new Error("template fallback claim is not a safe regular file");
  }
  const handle = await fs.open(
    claimPath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size > MAX_TEMPLATE_FALLBACK_CLAIM_BYTES
    ) {
      throw new Error("template fallback claim changed during validation");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== bytes.byteLength
    ) {
      throw new Error("template fallback claim changed during validation");
    }
    try {
      return TemplateFallbackClaimSchema.parse(
        JSON.parse(bytes.toString("utf8")),
      );
    } catch {
      throw new Error("template fallback claim is invalid");
    }
  } finally {
    await handle.close();
  }
}

async function writeFallbackClaim(
  sourceRunId: string,
  claim: TemplateFallbackClaim,
): Promise<void> {
  const validated = TemplateFallbackClaimSchema.parse(claim);
  const claimPath = fallbackClaimPath(sourceRunId);
  const bytes = Buffer.from(JSON.stringify(validated, null, 2));
  if (bytes.byteLength > MAX_TEMPLATE_FALLBACK_CLAIM_BYTES) {
    throw new Error("template fallback claim exceeds its closed bound");
  }
  let handle;
  try {
    handle = await fs.open(claimPath, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    if (handle) await fs.rm(claimPath, { force: true });
    throw error;
  } finally {
    await handle?.close();
  }
  await syncDirectory(path.dirname(claimPath));
}

async function removeFallbackClaim(sourceRunId: string): Promise<void> {
  const claimPath = fallbackClaimPath(sourceRunId);
  await fs.rm(claimPath, { force: true });
  await syncDirectory(path.dirname(claimPath));
}

function fallbackFailureSnapshot(state: RunState): FallbackFailureSnapshot {
  const stage = [...STAGES]
    .reverse()
    .find((candidate) => state.stages[candidate]?.status === "failed");
  if (!stage) throw new Error("template fallback requires a currently failed stage");
  const normalized = normalizeFallbackFailureMessage(
    state.stages[stage].error ?? "",
  );
  if (!normalized) {
    throw new Error("template fallback requires a visible source failure");
  }
  return {
    stage,
    message: normalized.slice(0, 500),
    ...(normalized.length > 500
      ? {
          messageSha256: createHash("sha256")
            .update(normalized)
            .digest("hex"),
        }
      : {}),
  };
}

async function loadFallbackSourceIntake(sourceRunId: string) {
  const rawIntake = await loadArtifact<unknown>(sourceRunId, ARTIFACTS.intake);
  if (rawIntake === undefined) {
    throw new Error("template fallback source intake is missing");
  }
  try {
    return IntakeSchema.parse(rawIntake);
  } catch {
    throw new Error("template fallback source intake is invalid");
  }
}

function fallbackIntakeSha256(intake: z.infer<typeof IntakeSchema>): string {
  return createHash("sha256").update(JSON.stringify(intake)).digest("hex");
}

function buildFallbackChildState(
  childRunId: string,
  source: RunState,
  origin: FallbackOrigin,
): RunState {
  const stages = Object.fromEntries(
    STAGES.map((stage) => [
      stage,
      { status: "pending" as const, retries: 0, gateRepairAttempts: 0 },
    ]),
  ) as RunState["stages"];
  return RunStateSchema.parse({
    id: childRunId,
    createdAt: new Date().toISOString(),
    pipelineVersion: source.pipelineVersion,
    stages,
    costUsd: 0,
    costCapUsd: source.costCapUsd,
    modelSlugs: { ...source.modelSlugs },
    referenceMode: source.referenceMode,
    referencePickerEnabled: source.referencePickerEnabled,
    layoutAuthority: "template-v1",
    fallbackOrigin: origin,
  });
}

function assertFallbackChildIdentity(
  child: RunState,
  source: RunState,
  origin: FallbackOrigin,
): void {
  assertFallbackChildOrigin(child, origin);
  if (
    child.pipelineVersion !== source.pipelineVersion ||
    child.referenceMode !== source.referenceMode ||
    child.referencePickerEnabled !== source.referencePickerEnabled ||
    child.costCapUsd !== source.costCapUsd ||
    child.costUsd !== 0 ||
    !equalPersistedValue(child.modelSlugs, source.modelSlugs)
  ) {
    throw new Error("existing fallback child does not match the durable claim");
  }
}

function assertFallbackChildOrigin(
  child: RunState,
  origin: FallbackOrigin,
): void {
  if (
    child.layoutAuthority !== "template-v1" ||
    !equalPersistedValue(child.fallbackOrigin, origin)
  ) {
    throw new Error("existing fallback child does not match the durable claim");
  }
}

function assertFallbackChildStages(child: RunState): void {
  if (child.stages.intake.status !== "done") {
    throw new Error("fallback child intake is incomplete");
  }
  for (const stage of STAGES) {
    if (stage === "intake") continue;
    const status = child.stages[stage];
    if (
      status.status !== "pending" ||
      status.retries !== 0 ||
      status.gateRepairAttempts !== 0 ||
      status.startedAt !== undefined ||
      status.finishedAt !== undefined ||
      status.error !== undefined
    ) {
      throw new Error("fallback child contains non-intake pipeline state");
    }
  }
}

async function assertFallbackChildRootClosed(childRunId: string): Promise<void> {
  const allowed = new Set([
    ".run-state-lock",
    "run.json",
    ARTIFACTS.intake,
    UPLOADS_DIR,
  ]);
  const entries = await fs.readdir(
    /* turbopackIgnore: true */ sitePaths(childRunId).root,
  );
  if (entries.some((entry) => !allowed.has(entry))) {
    throw new Error("fallback child contains prohibited artifacts");
  }
}

async function materializeFallbackChild(
  claim: TemplateFallbackClaim,
  source: RunState,
  sourceIntake: z.infer<typeof IntakeSchema>,
  hooks: TemplateFallbackHooks,
): Promise<void> {
  const { cloneClaimedUploadsForFallback, validateClaimedUploadsForFallback } =
    await import("./uploads");
  await withRunLock(claim.childRunId, async () => {
    let child: RunState;
    try {
      child = await loadRun(claim.childRunId);
      assertFallbackChildIdentity(child, source, claim.origin);
    } catch (error) {
      if (!(error instanceof RunNotFoundError)) throw error;
      child = buildFallbackChildState(claim.childRunId, source, claim.origin);
      await atomicWrite(
        runFilePath(claim.childRunId),
        JSON.stringify(child, null, 2),
      );
    }
    await hooks.afterChildCreate?.();

    const uploads = await cloneClaimedUploadsForFallback(
      source.id,
      claim.childRunId,
      sourceIntake.uploads,
    );
    await hooks.afterUploadClone?.();
    const childIntake = IntakeSchema.parse({ ...sourceIntake, uploads });
    const existingIntake = await loadArtifact<unknown>(
      claim.childRunId,
      ARTIFACTS.intake,
    );
    if (existingIntake === undefined) {
      await saveArtifact(claim.childRunId, ARTIFACTS.intake, childIntake);
      await hooks.afterIntakeSave?.();
    } else {
      let parsedExisting;
      try {
        parsedExisting = IntakeSchema.parse(existingIntake);
      } catch {
        throw new Error("existing fallback child intake is invalid");
      }
      if (!equalPersistedValue(parsedExisting, childIntake)) {
        throw new Error("existing fallback child intake does not match source");
      }
    }

    child = await loadRun(claim.childRunId);
    assertFallbackChildIdentity(child, source, claim.origin);
    if (child.stages.intake.status !== "done") {
      const prior = child.stages.intake;
      child.stages.intake = {
        ...prior,
        status: "done",
        finishedAt: new Date().toISOString(),
        error: undefined,
      };
      await saveRunUnlocked(child);
      await hooks.afterIntakeFinish?.();
    }

    child = await loadRun(claim.childRunId);
    assertFallbackChildIdentity(child, source, claim.origin);
    assertFallbackChildStages(child);
    const verifiedIntake = IntakeSchema.parse(
      await loadArtifact<unknown>(claim.childRunId, ARTIFACTS.intake),
    );
    if (!equalPersistedValue(verifiedIntake, childIntake)) {
      throw new Error("fallback child intake verification failed");
    }
    await validateClaimedUploadsForFallback(
      claim.childRunId,
      childIntake.uploads,
    );
    await assertFallbackChildRootClosed(claim.childRunId);
  });
}

/** Create or resume the one server-owned template fallback for a failed
 * PageIR run. A private durable claim makes pre-link retries converge; the
 * terminal source link is committed only after the child is complete. */
export async function createTemplateFallbackRun(
  sourceRunId: string,
  reason: TemplateFallbackReason,
  hooks: TemplateFallbackHooks = {},
): Promise<string> {
  return withRunLock(sourceRunId, async () => {
    const source = await loadRun(sourceRunId);
    assertRunLayoutAuthority(source, "page-ir-v1", "template fallback source");
    const failure = fallbackFailureSnapshot(source);
    if (source.templateFallback) {
      if (source.templateFallback.reason !== reason) {
        throw new Error("template fallback reason conflicts with the claimed child");
      }
      assertFailureSnapshotMatchesState(source, source.templateFallback.failure);
      const origin: FallbackOrigin = {
        sourceRunId,
        reason,
        failure: source.templateFallback.failure,
      };
      const child = await loadRun(source.templateFallback.childRunId);
      assertFallbackChildOrigin(child, origin);
      await ensureTemplateFallbackEvent(source);
      await removeFallbackClaim(sourceRunId);
      return source.templateFallback.childRunId;
    }

    const sourceIntake = await loadFallbackSourceIntake(sourceRunId);
    const { validateClaimedUploadsForFallback } = await import("./uploads");
    await validateClaimedUploadsForFallback(sourceRunId, sourceIntake.uploads);
    const origin: FallbackOrigin = {
      sourceRunId,
      reason,
      failure,
    };
    const intakeSha256 = fallbackIntakeSha256(sourceIntake);
    await hooks.beforeClaim?.();
    let claim = await readFallbackClaim(sourceRunId);
    if (claim === undefined) {
      claim = TemplateFallbackClaimSchema.parse({
        schemaVersion: 1,
        childRunId: makeRunId(),
        origin,
        intakeSha256,
      });
      await writeFallbackClaim(sourceRunId, claim);
    } else if (
      !equalPersistedValue(claim.origin, origin) ||
      claim.intakeSha256 !== intakeSha256
    ) {
      throw new Error("template fallback claim conflicts with the failed source");
    }
    await hooks.afterClaim?.();
    await materializeFallbackChild(claim, source, sourceIntake, hooks);

    const reloadedIntake = await loadFallbackSourceIntake(sourceRunId);
    if (
      fallbackIntakeSha256(reloadedIntake) !== claim.intakeSha256 ||
      !equalPersistedValue(reloadedIntake, sourceIntake)
    ) {
      throw new Error("template fallback source intake changed during transaction");
    }
    await validateClaimedUploadsForFallback(sourceRunId, sourceIntake.uploads);
    source.templateFallback = {
      childRunId: claim.childRunId,
      reason,
      failure,
    };
    await saveRunUnlocked(source);
    await hooks.afterSourceLink?.();
    await ensureTemplateFallbackEvent(source);
    await removeFallbackClaim(sourceRunId);
    return claim.childRunId;
  });
}

async function ensureTemplateFallbackEvent(source: RunState): Promise<void> {
  const link = source.templateFallback;
  if (!link) throw new Error("template fallback event requires a source link");
  const events = await readEvents(source.id);
  const alreadyRecorded = events.some(
    (event) =>
      event.type === "fallback-created" &&
      event.sourceRunId === source.id &&
      event.fallbackRunId === link.childRunId &&
      event.reason === link.reason &&
      event.failedStage === link.failure.stage,
  );
  if (alreadyRecorded) return;
  await appendEvent(source.id, fallbackCreatedEvent(source));
}

// ---------- artifacts ----------

/**
 * Save an artifact under sites/<id>/. Data is JSON.stringify'd unless
 * raw=true (used for DESIGN.md, which is deterministic markdown, not JSON).
 */
export async function saveArtifact(
  runId: string,
  artifactRelPath: string,
  data: unknown,
  raw = false
): Promise<void> {
  const content = raw ? String(data) : JSON.stringify(data, null, 2);
  await atomicWrite(artifactPath(runId, artifactRelPath), content);
}

/** Load + JSON.parse an artifact. Returns undefined if it hasn't been
 * produced yet (a normal pipeline state, not an error) — resume checks and
 * "has this stage run" callers rely on this instead of a try/catch. */
export async function loadArtifact<T = unknown>(
  runId: string,
  artifactRelPath: string
): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(artifactPath(runId, artifactRelPath), "utf8");
  } catch (err) {
    if (isEnoent(err)) return undefined;
    throw err;
  }
  return JSON.parse(raw) as T;
}

// ---------- event log ----------

function eventsFilePath(runId: string): string {
  return path.join(sitePaths(runId).root, EVENTS_FILE);
}

/**
 * Append one emitted event to the run's log. Best-effort by design: a run
 * must never fail because its own progress log could not be written, so this
 * swallows write errors after warning. Line-delimited JSON with appendFile —
 * single-writer, small lines, so no tmp+rename dance is needed here.
 */
export async function appendEvent(runId: string, event: PipelineEvent): Promise<void> {
  try {
    await fs.mkdir(sitePaths(runId).root, { recursive: true });
    await fs.appendFile(eventsFilePath(runId), `${JSON.stringify(event)}\n`, "utf8");
  } catch (err) {
    console.warn(`[runstate] run ${runId}: could not append event —`, err);
  }
}

/**
 * Every event the run has emitted, oldest first. A malformed trailing line
 * (crash mid-append) is skipped rather than failing the whole replay.
 * Returns [] when the run predates the log.
 */
export async function readEvents(runId: string): Promise<PipelineEvent[]> {
  let raw: string;
  try {
    raw = await fs.readFile(eventsFilePath(runId), "utf8");
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
  const events: PipelineEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as PipelineEvent);
    } catch {
      // truncated final line — everything before it is still good history
    }
  }
  return events;
}

// ---------- per-run write serialization ----------

/**
 * Every mutator below is a read-modify-write over the SAME run.json. Two of
 * them interleaving loses an update: both load the file, both mutate their own
 * copy, the later write clobbers the earlier one.
 *
 * That stopped being theoretical when the scan's four structure calls were
 * parallelized — four concurrent generateJson calls means four concurrent
 * addCost calls, and costUsd is what the spend cap is enforced against.
 * Observed live in run HOmEC9VCJ9Ri: a stage recorded "failed" by failStage
 * came back as "running" because a slower writer saved a stale snapshot on
 * top of it.
 *
 * Writers can run in separate Next/pipeline processes, so the in-process
 * promise chain is only the first layer. Every queued operation also takes a
 * hard-link filesystem lock rooted beside run.json. Combined site/run
 * mutations must acquire the site authority first, then this run-state lock;
 * a run transaction must never acquire site authority from inside its callback.
 * Reads (loadRun/loadArtifact) stay unlocked — they never write, and a slightly
 * stale read is harmless.
 */
const runLocks = new Map<string, Promise<unknown>>();

async function withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  const prev = runLocks.get(runId) ?? Promise.resolve();
  const coordinationDirectory = path.join(
    sitePaths(runId).root,
    ".run-state-lock",
  );
  const crossProcessOperation = () => withFileLock(coordinationDirectory, fn);
  // run regardless of whether the previous holder resolved or threw
  const next = prev.then(crossProcessOperation, crossProcessOperation);
  const guarded = next.catch(() => undefined);
  runLocks.set(runId, guarded);
  try {
    return await next;
  } finally {
    // drop the entry once this is the tail, so the map does not grow forever
    if (runLocks.get(runId) === guarded) runLocks.delete(runId);
  }
}

export interface RunTransaction {
  state: RunState;
  writeArtifact(artifactRelPath: string, content: string | Uint8Array): Promise<void>;
  saveEvidenceArtifactVersion(
    draft: WorkflowArtifactDraft,
    options?: SaveEvidenceArtifactOptions
  ): Promise<WorkflowArtifactVersion>;
  transitionEvidenceArtifactApproval(
    artifactType: WorkflowArtifactType,
    version: number,
    nextState: ArtifactApprovalState,
    options?: EvidenceApprovalOptions
  ): Promise<WorkflowArtifactVersion>;
}

/** Serialize one multi-file evidence mutation under the same per-run lock as
 * every run.json mutator. Files are individually atomically replaced and
 * restored on any callback/run-save failure, so no orphan version or promoted
 * alias can survive a failed workflow transaction. */
export function withRunTransaction<T>(
  runId: string,
  callback: (transaction: RunTransaction) => Promise<T>
): Promise<T> {
  return withRunLock(runId, async () => {
    const state = await loadRun(runId);
    const backups = new Map<string, Uint8Array | undefined>();
    const writeArtifact = async (relativePath: string, content: string | Uint8Array) => {
      const target = artifactPath(runId, relativePath);
      if (!backups.has(target)) {
        backups.set(target, await fs.readFile(target).catch((error: unknown) => {
          if (isEnoent(error)) return undefined;
          throw error;
        }));
      }
      await atomicWrite(target, content);
    };
    const transaction: RunTransaction = {
      state,
      writeArtifact,
      saveEvidenceArtifactVersion: async (draft, options = {}) => {
        const artifact = appendEvidenceArtifactVersion(state, WorkflowArtifactDraftSchema.parse(draft), options);
        await writeArtifact(
          workflowArtifactVersionPath(artifact.artifactType, artifact.version),
          JSON.stringify(artifact.artifact, null, 2)
        );
        return artifact;
      },
      transitionEvidenceArtifactApproval: async (artifactType, version, nextState, options = {}) => {
        const artifact = appendEvidenceApprovalTransition(
          state,
          artifactType,
          version,
          ArtifactApprovalStateSchema.parse(nextState),
          options
        );
        if (nextState === "approved") {
          await writeArtifact(
            workflowArtifactAliasPath(artifact.artifactType),
            JSON.stringify(artifact, null, 2)
          );
        }
        return artifact;
      },
    };
    try {
      const result = await callback(transaction);
      await saveRunUnlocked(state);
      return result;
    } catch (error) {
      for (const [target, previous] of [...backups].reverse()) {
        if (previous === undefined) await fs.rm(target, { force: true });
        else await atomicWrite(target, previous);
      }
      throw error;
    }
  });
}

// ---------- evidence workflow ----------

export class EvidenceWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceWorkflowError";
  }
}

export function artifactApprovalState(
  artifact: WorkflowArtifactVersion
): ArtifactApprovalState {
  return workflowArtifactApprovalState(artifact);
}

/** Shared release/export/client-handoff decision. Preview and editing do not
 * call this guard. */
export function assertVisualQaApprovedForBuild(
  state: RunState,
  buildSha256: string,
): WorkflowArtifactVersion {
  const visualQa = latestArtifact(state, "visual-qa");
  const transition = visualQa?.approvalTransitions.at(-1);
  const review = transition?.humanVisualReview;
  if (
    !visualQa ||
    visualQa.artifactType !== "visual-qa" ||
    artifactApprovalState(visualQa) !== "approved" ||
    visualQa.artifact.buildSha256 !== buildSha256 ||
    review?.reviewerKind !== "human" ||
    review.humanAttestation !== true ||
    review.buildSha256 !== buildSha256 ||
    Object.values(review.criteria).some(
      (criterion) => criterion.status !== "pass",
    )
  ) {
    throw new EvidenceWorkflowError(
      "current promoted build requires a current promoted-build visual approval before release, export, or client handoff",
    );
  }
  return visualQa;
}

export function workflowArtifactVersionPath(
  artifactType: WorkflowArtifactType,
  version: number
): string {
  return path.posix.join("evidence", "versions", artifactType, `v${version}.json`);
}

export function workflowArtifactAliasPath(
  artifactType: WorkflowArtifactType
): string {
  return path.posix.join("evidence", "approved", `${artifactType}.json`);
}

function latestArtifact(
  state: RunState,
  artifactType: WorkflowArtifactType
): WorkflowArtifactVersion | undefined {
  return state.evidenceWorkflow.artifacts
    .filter((artifact) => artifact.artifactType === artifactType)
    .sort((left, right) => right.version - left.version)[0];
}

function assertArtifactMatchesCurrentStage(
  state: RunState,
  artifactType: WorkflowArtifactType
): void {
  const expected = EVIDENCE_STAGE_ARTIFACT[state.evidenceWorkflow.currentStage];
  if (artifactType !== expected) {
    throw new EvidenceWorkflowError(
      `stage ${state.evidenceWorkflow.currentStage} requires ${expected}, not ${artifactType}`
    );
  }
}

function draftSource(
  draft: WorkflowArtifactDraft
): { artifactType: WorkflowArtifactType; version: number } | undefined {
  switch (draft.artifactType) {
    case "ledger":
      return undefined;
    case "design-contract":
      return {
        artifactType: "ledger",
        version: draft.artifact.sourceLedgerVersion,
      };
    case "token-inventory":
      return {
        artifactType: "design-contract",
        version: draft.artifact.sourceContractVersion,
      };
    case "tailwind-plan":
      return {
        artifactType: "token-inventory",
        version: draft.artifact.sourceTokenInventoryVersion,
      };
    case "css-architecture":
      return {
        artifactType: "tailwind-plan",
        version: draft.artifact.sourceTailwindPlanVersion,
      };
    case "visual-qa":
      return {
        artifactType: "css-architecture",
        version: draft.artifact.sourceCssArchitectureVersion,
      };
  }
}

function assertLatestApprovedSource(
  state: RunState,
  draft: WorkflowArtifactDraft
): void {
  const source = draftSource(draft);
  if (!source) return;
  const latest = latestArtifact(state, source.artifactType);
  if (!latest || artifactApprovalState(latest) !== "approved") {
    throw new EvidenceWorkflowError(
      `${draft.artifactType} requires an approved ${source.artifactType}`
    );
  }
  if (source.version !== latest.version) {
    throw new EvidenceWorkflowError(
      `${draft.artifactType} source version ${source.version} does not match latest approved ${source.artifactType} v${latest.version}`
    );
  }
}

export async function loadEvidenceWorkflow(runId: string) {
  return (await loadRun(runId)).evidenceWorkflow;
}

export interface SaveEvidenceArtifactOptions {
  actor?: string;
  note?: string;
}

function appendEvidenceArtifactVersion(
  state: RunState,
  validatedDraft: WorkflowArtifactDraft,
  options: SaveEvidenceArtifactOptions
): WorkflowArtifactVersion {
  assertArtifactMatchesCurrentStage(state, validatedDraft.artifactType);
  if (
    state.pipelineVersion === "evidence-gated-v2" &&
    validatedDraft.artifactType === "design-contract"
  ) {
    V2DesignContractMetadataSchema.parse(validatedDraft.artifact);
  }
  assertLatestApprovedSource(state, validatedDraft);
  const previous = latestArtifact(state, validatedDraft.artifactType);
  const now = new Date().toISOString();
  if (previous) {
    if (artifactApprovalState(previous) !== "revision-requested") {
      throw new EvidenceWorkflowError(
        `${validatedDraft.artifactType} v${previous.version} must be revision-requested before replacement`
      );
    }
    previous.approvalTransitions.push({ state: "superseded", at: now, actor: options.actor, note: options.note });
  }
  const artifact = WorkflowArtifactVersionSchema.parse({
    ...validatedDraft,
    version: (previous?.version ?? 0) + 1,
    createdAt: now,
    revisionOf: previous?.version,
    approvalTransitions: [{ state: "draft", at: now, actor: options.actor, note: options.note }],
  });
  state.evidenceWorkflow.artifacts.push(artifact);
  return artifact;
}

/**
 * Persist a new immutable artifact payload. Revisions create a new numbered
 * record and retain the previous version; only its append-only approval log is
 * marked superseded. saveRun supplies the existing tmp+rename atomic write.
 */
export function saveEvidenceArtifactVersion(
  runId: string,
  draft: WorkflowArtifactDraft,
  options: SaveEvidenceArtifactOptions = {}
): Promise<WorkflowArtifactVersion> {
  const validatedDraft = WorkflowArtifactDraftSchema.parse(draft);
  return withRunTransaction(runId, (transaction) =>
    transaction.saveEvidenceArtifactVersion(validatedDraft, options)
  );
}

export interface EvidenceApprovalOptions {
  actor?: string;
  note?: string;
  humanVisualReview?: HumanVisualReview;
}

function appendEvidenceApprovalTransition(
  state: RunState,
  artifactType: WorkflowArtifactType,
  version: number,
  validatedState: ArtifactApprovalState,
  options: EvidenceApprovalOptions
): WorkflowArtifactVersion {
  assertArtifactMatchesCurrentStage(state, artifactType);
  const artifact = latestArtifact(state, artifactType);
  if (!artifact || artifact.version !== version) {
    throw new EvidenceWorkflowError(`${artifactType} version ${version} is not the current artifact`);
  }
  const currentState = artifactApprovalState(artifact);
  if (!ARTIFACT_APPROVAL_TRANSITIONS[currentState].includes(validatedState)) {
    throw new EvidenceWorkflowError(`invalid ${artifactType} approval transition: ${currentState} -> ${validatedState}`);
  }
  if (validatedState === "approved" && artifact.artifactType === "visual-qa") {
    const review = options.humanVisualReview;
    const reviewPassed =
      review?.reviewerKind === "human" &&
      review.humanAttestation === true &&
      review.buildSha256 === artifact.artifact.buildSha256 &&
      Object.values(review.criteria).every(
        (criterion) => criterion.status === "pass"
      );
    if (!reviewPassed) {
      throw new EvidenceWorkflowError(
        "visual QA approval requires an attested all-pass human review for the current build"
      );
    }
  }
  if (validatedState === "approved" && artifact.artifactType === "token-inventory") {
    const contract = state.evidenceWorkflow.artifacts.find(
      (candidate) => candidate.artifactType === "design-contract" && candidate.version === artifact.artifact.sourceContractVersion
    );
    if (!contract || contract.artifactType !== "design-contract" || !contract.artifact.designTokens) {
      throw new EvidenceWorkflowError("token inventory requires the approved contract token proposal");
    }
    assertCanonicalTokenInventory(
      contract.artifact.designTokens,
      artifact.artifact,
      contract.artifact.approvedEvidenceIds
    );
  }
  if (validatedState === "approved" && artifact.artifactType === "tailwind-plan") {
    const inventory = state.evidenceWorkflow.artifacts.find(
      (candidate) => candidate.artifactType === "token-inventory" && candidate.version === artifact.artifact.sourceTokenInventoryVersion
    );
    if (!inventory || inventory.artifactType !== "token-inventory") {
      throw new EvidenceWorkflowError("Tailwind plan requires its approved token inventory");
    }
    assertTailwindPlanMatchesInventory(inventory.artifact, artifact.artifact);
  }
  artifact.approvalTransitions.push({
    state: validatedState,
    at: new Date().toISOString(),
    actor: options.actor,
    note: options.note,
    humanVisualReview: options.humanVisualReview,
  });
  return artifact;
}

/** Append a validated approval transition without changing artifact content. */
export function transitionEvidenceArtifactApproval(
  runId: string,
  artifactType: WorkflowArtifactType,
  version: number,
  nextState: ArtifactApprovalState,
  options: EvidenceApprovalOptions = {}
): Promise<WorkflowArtifactVersion> {
  const validatedState = ArtifactApprovalStateSchema.parse(nextState);
  const transition = () => withRunTransaction(runId, (transaction) =>
    transaction.transitionEvidenceArtifactApproval(
      artifactType,
      version,
      validatedState,
      options
    )
  );
  if (artifactType !== "visual-qa") return transition();
  return withFileLock(
    path.join(sitePaths(runId).root, ".site-authority-lock"),
    transition,
  );
}

/** Mark the current visual decision stale after site bytes are committed.
 * Draft, in-review, and approved QA all describe the previous build hash, so
 * each must become regenerable before a reviewer can continue. */
/** Caller must already hold the per-run site filesystem authority. Combined
 * site/run mutations always acquire locks in this order: site authority,
 * then the run-state transaction. Never acquire site authority from inside a
 * run transaction. */
export function invalidateApprovedVisualQaUnderSiteAuthority(
  runId: string,
  options: { afterInvalidation?: () => void | Promise<void> } = {},
): Promise<boolean> {
  return withRunTransaction(runId, async (transaction) => {
    const artifact = latestArtifact(transaction.state, "visual-qa");
    const approval = artifact ? artifactApprovalState(artifact) : null;
    if (
      !artifact ||
      !approval ||
      !["draft", "in-review", "approved"].includes(approval)
    ) {
      return false;
    }
    const invalidated = await transaction.transitionEvidenceArtifactApproval(
      "visual-qa",
      artifact.version,
      "revision-requested",
      {
        actor: "site-mutation",
        note: "Approved visual QA invalidated because the committed site changed.",
      }
    );
    await transaction.writeArtifact(
      workflowArtifactAliasPath("visual-qa"),
      JSON.stringify(invalidated, null, 2)
    );
    await options.afterInvalidation?.();
    return true;
  });
}

/** Invalidate the prior visual decision and create the exact promoted-build
 * review placeholder in one run-state transaction. The caller already owns
 * site authority, so this helper must never reacquire it. */
export function preparePromotedVisualQaUnderSiteAuthority(
  runId: string,
  buildSha256: string,
  options: { afterPreparation?: () => void | Promise<void> } = {},
): Promise<{
  visualApprovalInvalidated: boolean;
  artifact: WorkflowArtifactVersion;
}> {
  return withRunTransaction(runId, async (transaction) => {
    const previous = latestArtifact(transaction.state, "visual-qa");
    if (
      previous?.artifactType === "visual-qa" &&
      previous.artifact.buildSha256 === buildSha256 &&
      artifactApprovalState(previous) !== "superseded"
    ) {
      await options.afterPreparation?.();
      return { visualApprovalInvalidated: false, artifact: previous };
    }
    const sourceCssArchitectureVersion = previous?.artifactType === "visual-qa"
      ? previous.artifact.sourceCssArchitectureVersion
      : latestArtifact(transaction.state, "css-architecture")?.version;
    if (!sourceCssArchitectureVersion) {
      throw new EvidenceWorkflowError(
        "promoted visual QA requires a current CSS architecture",
      );
    }

    let visualApprovalInvalidated = false;
    let invalidatedAlias: string | undefined;
    if (previous) {
      const approval = artifactApprovalState(previous);
      if (["draft", "in-review", "approved"].includes(approval)) {
        const invalidated = await transaction.transitionEvidenceArtifactApproval(
          "visual-qa",
          previous.version,
          "revision-requested",
          {
            actor: "candidate-promotion",
            note: "Prior visual QA invalidated by an atomically promoted build.",
          },
        );
        invalidatedAlias = JSON.stringify(invalidated, null, 2);
        visualApprovalInvalidated = true;
      }
    }

    const pending = buildVisualQa(sourceCssArchitectureVersion, buildSha256);
    const artifact = await transaction.saveEvidenceArtifactVersion(
      { artifactType: "visual-qa", artifact: pending },
      {
        actor: "candidate-promotion",
        note: "Review placeholder bound to the atomically promoted build hash.",
      },
    );
    await transaction.writeArtifact(
      ARTIFACTS.visualQa,
      `${JSON.stringify(pending, null, 2)}\n`,
    );
    if (invalidatedAlias) {
      await transaction.writeArtifact(
        workflowArtifactAliasPath("visual-qa"),
        invalidatedAlias,
      );
    }
    await options.afterPreparation?.();
    return { visualApprovalInvalidated, artifact };
  });
}

export function invalidateApprovedVisualQa(runId: string): Promise<boolean> {
  const coordinationDirectory = path.join(
    sitePaths(runId).root,
    ".site-authority-lock",
  );
  return withFileLock(coordinationDirectory, () =>
    invalidateApprovedVisualQaUnderSiteAuthority(runId),
  );
}

/**
 * Move exactly one gate forward after the current gate's latest artifact is
 * approved. The fixed order prevents research-to-code and other skipped gates.
 */
export function advanceEvidenceWorkflow(
  runId: string,
  nextStage: EvidenceWorkflowStage
): Promise<RunState> {
  return withRunLock(runId, async () => {
    const state = await loadRun(runId);
    const currentStage = state.evidenceWorkflow.currentStage;
    const currentIndex = EVIDENCE_WORKFLOW_STAGES.indexOf(currentStage);
    const expectedNext = EVIDENCE_WORKFLOW_STAGES[currentIndex + 1];
    if (!expectedNext || nextStage !== expectedNext) {
      throw new EvidenceWorkflowError(
        `invalid evidence workflow transition: ${currentStage} -> ${nextStage}`
      );
    }

    const requiredType = EVIDENCE_STAGE_ARTIFACT[currentStage];
    const requiredArtifact = latestArtifact(state, requiredType);
    if (
      !requiredArtifact ||
      artifactApprovalState(requiredArtifact) !== "approved"
    ) {
      throw new EvidenceWorkflowError(
        `${requiredType} must be approved before entering ${nextStage}`
      );
    }

    state.evidenceWorkflow.currentStage = nextStage;
    await saveRunUnlocked(state);
    return state;
  });
}

// ---------- stage transitions ----------

export function startStage(runId: string, stage: Stage): Promise<RunState> {
  return withRunLock(runId, async () => {
    const state = await loadRun(runId);
    if (state.templateFallback) {
      throw new Error("a run linked to a template fallback is terminal and immutable");
    }
    const prior = state.stages[stage];
    state.stages[stage] = {
      status: "running",
      startedAt: new Date().toISOString(),
      retries: prior?.retries ?? 0,
      gateRepairAttempts: prior?.gateRepairAttempts ?? 0,
    };
    await saveRunUnlocked(state);
    return state;
  });
}

export function finishStage(runId: string, stage: Stage): Promise<RunState> {
  return withRunLock(runId, async () => {
    const state = await loadRun(runId);
    const prior = state.stages[stage];
    state.stages[stage] = {
      ...prior,
      status: "done",
      finishedAt: new Date().toISOString(),
      error: undefined,
    };
    await saveRunUnlocked(state);
    return state;
  });
}

/** Marks the stage failed and bumps its persisted retry counter — the
 * caller (pipeline.ts) decides whether/when to re-run the stage; this just
 * keeps an honest, durable record of how many times it has failed. */
export function failStage(
  runId: string,
  stage: Stage,
  error: string
): Promise<RunState> {
  return withRunLock(runId, async () => {
    const state = await loadRun(runId);
    const prior = state.stages[stage];
    state.stages[stage] = {
      ...prior,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error,
      retries: (prior?.retries ?? 0) + 1,
    };
    await saveRunUnlocked(state);
    return state;
  });
}

/** Claim the single paid gate-repair allowance only after gates actually fail. */
export function claimBuildGateRepair(runId: string): Promise<boolean> {
  return withRunLock(runId, async () => {
    const state = await loadRun(runId);
    const built = state.stages.built;
    if ((built.gateRepairAttempts ?? 0) > 0) return false;
    built.gateRepairAttempts = 1;
    await saveRunUnlocked(state);
    return true;
  });
}

/**
 * Hand the allowance back when the repair call itself failed and bought no
 * fix. The allowance exists to cap paid repair attempts per build, so only a
 * repair that actually ran may spend it. A crashed or timed-out call that kept
 * the claim left the run unfinishable: each resume re-ran the gates, hit the
 * same failures, could not claim a repair, and failed the build again.
 */
export function releaseBuildGateRepair(runId: string): Promise<void> {
  return withRunLock(runId, async () => {
    const state = await loadRun(runId);
    state.stages.built.gateRepairAttempts = 0;
    await saveRunUnlocked(state);
  });
}

export async function stageDone(runId: string, stage: Stage): Promise<boolean> {
  const state = await loadRun(runId);
  return state.stages[stage]?.status === "done";
}

// ---------- cost tracking ----------

/**
 * Add real spend (USD) to a run's costUsd. The amount is persisted BEFORE
 * any cap check, so spend is never lost even when the cap trips — then
 * throws CostCapExceeded, which callers must NOT swallow-and-retry.
 */
export async function addCost(runId: string, usd: number): Promise<RunState> {
  if (!Number.isFinite(usd) || usd < 0) {
    throw new Error(`addCost: invalid amount ${usd} for run ${runId}`);
  }
  // Serialized: concurrent callers would otherwise each read the same costUsd
  // and the last write would erase the others' spend — an undercount in the
  // one number the cap is enforced against.
  const state = await withRunLock(runId, async () => {
    const s = await loadRun(runId);
    // round to a hundredth of a cent — avoids float grime accumulating across calls
    s.costUsd = Math.round((s.costUsd + usd) * 1e6) / 1e6;
    await saveRunUnlocked(s);
    return s;
  });
  if (state.costUsd > state.costCapUsd) {
    throw new CostCapExceeded(runId, state.costUsd, state.costCapUsd);
  }
  return state;
}
