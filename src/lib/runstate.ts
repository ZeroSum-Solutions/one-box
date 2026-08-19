/**
 * Durable run state: sites/<id>/run.json is the resumable state machine for
 * the pipeline (audit amendment #23). Every write is atomic (tmp+rename) so
 * a crash mid-write never corrupts the file a browser refresh reads next.
 *
 * File-layout helpers (sitePaths/artifactPath) and the create/load/save +
 * stage + cost helpers below are the shared contract every pipeline stage,
 * API route, and tool module builds on — see contracts.ts for the shapes.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ARTIFACT_APPROVAL_TRANSITIONS,
  ArtifactApprovalStateSchema,
  EVIDENCE_STAGE_ARTIFACT,
  EVIDENCE_WORKFLOW_STAGES,
  EVENTS_FILE,
  MODELS,
  RESEARCH_DIR,
  RunStateSchema,
  SITE_DIR,
  STAGES,
  UPLOADS_DIR,
  WorkflowArtifactDraftSchema,
  WorkflowArtifactVersionSchema,
  V2DesignContractMetadataSchema,
  type ArtifactApprovalState,
  type EvidenceWorkflowStage,
  type HumanVisualReview,
  type PipelineEvent,
  type RunState,
  type Stage,
  type WorkflowArtifactDraft,
  type WorkflowArtifactType,
  type WorkflowArtifactVersion,
  workflowArtifactApprovalState,
} from "./contracts";
import {
  assertCanonicalTokenInventory,
  assertTailwindPlanMatchesInventory,
} from "./evidence";
import { withFileLock } from "./fileLock";

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
  await fs.writeFile(tmpPath, content);
  await fs.rename(tmpPath, filePath);
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
  /** defaults to the pinned MODELS from contracts.ts (audit #3: record the
   * exact slugs a run used in its own manifest). */
  modelSlugs?: Record<string, string>;
  /** Picker pilot flag, captured once at creation so a mid-run env change can
   * never alter resume semantics (plan rev 2 §A). */
  referencePickerEnabled?: boolean;
}

/** Create a new run directory + run.json. Returns the new run's id. */
export async function createRun(opts: CreateRunOptions = {}): Promise<string> {
  const id = opts.id ?? makeRunId();
  if (!/^[a-z0-9_-]{4,40}$/i.test(id)) throw new Error("bad runId");
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
    referencePickerEnabled: opts.referencePickerEnabled,
  });

  await saveRun(state);
  return id;
}

/** Create a pre-reserved run exactly once, or resume its existing state.
 * Options apply only on first creation — an existing run's persisted flags
 * are authoritative and never rewritten here. */
export async function ensureRun(
  runId: string,
  opts: Omit<CreateRunOptions, "id"> = {}
): Promise<string> {
  try {
    await loadRun(runId);
    return runId;
  } catch (error) {
    if (!(error instanceof RunNotFoundError)) throw error;
  }
  return createRun({ ...opts, id: runId });
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
  return RunStateSchema.parse(JSON.parse(raw));
}

export async function saveRun(state: RunState): Promise<void> {
  const validated = RunStateSchema.parse(state);
  await atomicWrite(runFilePath(validated.id), JSON.stringify(validated, null, 2));
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
      await saveRun(state);
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
    return true;
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
    await saveRun(state);
    return state;
  });
}

// ---------- stage transitions ----------

export function startStage(runId: string, stage: Stage): Promise<RunState> {
  return withRunLock(runId, async () => {
    const state = await loadRun(runId);
    const prior = state.stages[stage];
    state.stages[stage] = {
      status: "running",
      startedAt: new Date().toISOString(),
      retries: prior?.retries ?? 0,
      gateRepairAttempts: prior?.gateRepairAttempts ?? 0,
    };
    await saveRun(state);
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
    await saveRun(state);
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
    await saveRun(state);
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
    await saveRun(state);
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
    await saveRun(state);
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
    await saveRun(s);
    return s;
  });
  if (state.costUsd > state.costCapUsd) {
    throw new CostCapExceeded(runId, state.costUsd, state.costCapUsd);
  }
  return state;
}
