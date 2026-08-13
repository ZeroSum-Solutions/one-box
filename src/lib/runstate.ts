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
  ARTIFACTS,
  MODELS,
  RESEARCH_DIR,
  RunStateSchema,
  SITE_DIR,
  SITES_DIR,
  STAGES,
  type RunState,
  type Stage,
} from "./contracts";

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
}

export function sitePaths(runId: string): SitePaths {
  const root = path.join(SITES_ROOT, runId);
  return {
    root,
    research: path.join(root, RESEARCH_DIR),
    site: path.join(root, SITE_DIR),
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

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`
  );
  await fs.writeFile(tmpPath, content, "utf8");
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
  costCapUsd?: number;
  /** defaults to the pinned MODELS from contracts.ts (audit #3: record the
   * exact slugs a run used in its own manifest). */
  modelSlugs?: Record<string, string>;
}

/** Create a new run directory + run.json. Returns the new run's id. */
export async function createRun(opts: CreateRunOptions = {}): Promise<string> {
  const id = makeRunId();
  const stages = Object.fromEntries(
    STAGES.map((s) => [s, { status: "pending" as const, retries: 0 }])
  ) as RunState["stages"];

  const state = RunStateSchema.parse({
    id,
    createdAt: new Date().toISOString(),
    stages,
    costCapUsd: opts.costCapUsd,
    modelSlugs: opts.modelSlugs ?? { ...MODELS },
  });

  await saveRun(state);
  return id;
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

// ---------- stage transitions ----------

export async function startStage(runId: string, stage: Stage): Promise<RunState> {
  const state = await loadRun(runId);
  const prior = state.stages[stage];
  state.stages[stage] = {
    status: "running",
    startedAt: new Date().toISOString(),
    retries: prior?.retries ?? 0,
  };
  await saveRun(state);
  return state;
}

export async function finishStage(runId: string, stage: Stage): Promise<RunState> {
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
}

/** Marks the stage failed and bumps its persisted retry counter — the
 * caller (pipeline.ts) decides whether/when to re-run the stage; this just
 * keeps an honest, durable record of how many times it has failed. */
export async function failStage(
  runId: string,
  stage: Stage,
  error: string
): Promise<RunState> {
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
  const state = await loadRun(runId);
  // round to a hundredth of a cent — avoids float grime accumulating across calls
  state.costUsd = Math.round((state.costUsd + usd) * 1e6) / 1e6;
  await saveRun(state);
  if (state.costUsd > state.costCapUsd) {
    throw new CostCapExceeded(runId, state.costUsd, state.costCapUsd);
  }
  return state;
}
