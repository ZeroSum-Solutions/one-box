#!/usr/bin/env node
import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT_ROOT = path.resolve(import.meta.dirname, "../..");
const PLAN_PATH = "docs/eval/model-routing/benchmark-plan.md";
const RUNS_PATH = "docs/eval/model-routing/runs";
const FIXTURES_PATH = "docs/eval/model-routing/fixtures";
const APPROVED_ADAPTER_PATH = "scripts/eval/model-provider-adapter.mjs";
const MAX_FIXTURE_BYTES = 1_000_000;
const TEXT_ARTIFACT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".jsx", ".md", ".svg", ".ts", ".tsx", ".txt"]);
const DIMENSIONS = [
  "requirementCoverage",
  "correctness",
  "designFidelity",
  "responsivenessAccessibility",
  "maintainability",
  "evidenceDiscipline",
  "toolCompatibility",
];
const TERMINAL_STATUSES = new Set(["completed", "failed", "timed_out", "skipped", "unauthenticated"]);

export const REGISTERED_THRESHOLDS = Object.freeze({
  mechanical: Object.freeze({ requiredTests: "all", automaticRejections: 0 }),
  codeReview: Object.freeze({
    seededHighAndMediumDefectRecall: 0.9,
    inventedBlockers: 0,
    securitySensitiveFalseFixes: 0,
    automaticRejections: 0,
  }),
  visual: Object.freeze({
    minimumAveragePerDimension: 3,
    minimumIndividualDimension: 2,
    automaticRejections: 0,
  }),
  defaultLane: Object.freeze({ minimumPassingFixtures: 3, minimumRounds: 2, firstPassAcceptance: 0.8 }),
  fastPath: Object.freeze({ maximumRelativeScoreGap: 0.05, minimumLatencyOrCostImprovement: 0.25 }),
  policyChange: Object.freeze({ newBlindedRound: true, independentReviewerSignOff: true }),
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function jsonLine(value) {
  return Buffer.from(`${JSON.stringify(value)}\n`);
}

function resolveInside(root, relativePath, label = "path") {
  invariant(typeof relativePath === "string" && relativePath.length > 0, `${label} is required`);
  const resolved = path.resolve(root, relativePath);
  invariant(resolved === root || resolved.startsWith(`${root}${path.sep}`), `${label} escapes repository root: ${relativePath}`);
  return resolved;
}

function validId(value, label) {
  invariant(typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(value), `${label} must be a safe identifier`);
  return value;
}

function roundDirectory(root, roundId) {
  return path.join(resolveInside(root, RUNS_PATH), validId(roundId, "roundId"));
}

async function readJson(file, label = path.basename(file)) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} is not valid JSON`);
    throw error;
  }
}

async function regularFile(file, label) {
  const stat = await fs.lstat(file);
  invariant(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  return stat;
}

async function readStableFileInside(root, relativePath, allowedRootPath, label, maximumBytes = MAX_FIXTURE_BYTES) {
  const allowedRoot = resolveInside(root, allowedRootPath, `${label} root`);
  const lexical = resolveInside(root, relativePath, label);
  invariant(lexical === allowedRoot || lexical.startsWith(`${allowedRoot}${path.sep}`), `${label} must be inside ${allowedRootPath}`);
  const [allowedReal, fileReal] = await Promise.all([fs.realpath(allowedRoot), fs.realpath(lexical)]);
  invariant(fileReal.startsWith(`${allowedReal}${path.sep}`), `${label} resolves outside ${allowedRootPath}`);
  const handle = await fs.open(fileReal, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    invariant(before.isFile(), `${label} must be a regular file`);
    invariant(before.size > 0n && before.size <= BigInt(maximumBytes), `${label} exceeds the ${maximumBytes}-byte limit`);
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    invariant(
      before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeNs === after.mtimeNs,
      `${label} changed while it was read`,
    );
    invariant(BigInt(bytes.length) === after.size, `${label} size changed while it was read`);
    return { bytes, stat: after, realpath: fileReal };
  } finally {
    await handle.close();
  }
}

async function writeExclusive(file, bytes, mode = 0o644) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  let handle;
  try {
    handle = await fs.open(file, "wx", mode);
    await handle.writeFile(bytes);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`${path.basename(file)} already exists and is immutable`);
    throw error;
  } finally {
    await handle?.close();
  }
}

async function withRoundLock(directory, operation, callback) {
  const lockDirectory = path.join(directory, ".coordinator/round.lock");
  try {
    await fs.mkdir(lockDirectory);
    await fs.writeFile(path.join(lockDirectory, "owner.json"), jsonBytes({ operation, pid: process.pid, startedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`round is busy with another coordinator operation`);
    throw error;
  }
  try {
    return await callback();
  } finally {
    await fs.rm(lockDirectory, { recursive: true, force: true });
  }
}

function uniqueBy(items, key, label) {
  const values = items.map((item) => item[key]);
  invariant(new Set(values).size === values.length, `${label} must be unique`);
}

function validateCandidate(candidate) {
  validId(candidate?.id, "candidate.id");
  for (const field of ["displayName", "modelSlug", "provider", "modelFamily", "effort", "pricingSnapshot", "accessLane"]) {
    invariant(typeof candidate[field] === "string" && candidate[field].trim(), `candidate ${candidate.id}.${field} is required`);
  }
  invariant(Number.isInteger(candidate.contextLimit) && candidate.contextLimit > 0, `candidate ${candidate.id}.contextLimit must be positive`);
  invariant(Array.isArray(candidate.toolSupport), `candidate ${candidate.id}.toolSupport must be an array`);
  invariant(Array.isArray(candidate.blindAliases) && candidate.blindAliases.length > 0 && candidate.blindAliases.every((alias) => typeof alias === "string" && alias.trim()), `candidate ${candidate.id}.blindAliases must be a nonempty string array`);
  invariant(["subscription", "metered"].includes(candidate.accessLane), `candidate ${candidate.id}.accessLane must be subscription or metered`);
  if (candidate.accessLane === "subscription") {
    invariant(!/(?:\$\s*0(?:\.0+)?\b|\bfree\b|\bzero(?:[- ]cost)?\b)/i.test(candidate.pricingSnapshot), "subscription lanes cannot be represented as zero cost");
  }
}

function validateConfig(config) {
  invariant(config && typeof config === "object", "config is required");
  invariant(Array.isArray(config.fixtures) && config.fixtures.length > 0, "at least one fixture is required");
  invariant(Array.isArray(config.candidates) && config.candidates.length > 0, "at least one candidate is required");
  uniqueBy(config.fixtures, "id", "fixture ids");
  uniqueBy(config.candidates, "id", "candidate ids");
  for (const fixture of config.fixtures) {
    validId(fixture?.id, "fixture.id");
    for (const field of ["version", "path", "taskClass", "evaluationKind"]) {
      invariant(typeof fixture[field] === "string" && fixture[field].trim(), `fixture ${fixture.id}.${field} is required`);
    }
    invariant(["mechanical", "code-review", "visual", "strategic"].includes(fixture.evaluationKind), `fixture ${fixture.id}.evaluationKind is invalid`);
  }
  for (const candidate of config.candidates) validateCandidate(candidate);
  const protocol = config.protocol;
  invariant(protocol && typeof protocol === "object", "protocol is required");
  invariant(Number.isInteger(protocol.timeLimitMs) && protocol.timeLimitMs > 0, "protocol.timeLimitMs must be positive");
  invariant(protocol.toolPolicy && typeof protocol.toolPolicy === "object" && !Array.isArray(protocol.toolPolicy), "protocol.toolPolicy is required");
  invariant(Number.isFinite(protocol.perTaskCapUsd) && protocol.perTaskCapUsd > 0, "protocol.perTaskCapUsd must be positive");
  invariant(Number.isInteger(protocol.maxRepairRounds) && protocol.maxRepairRounds >= 0 && protocol.maxRepairRounds <= 2, "protocol.maxRepairRounds must allow at most 2 repair rounds");
  const metered = config.candidates.filter((candidate) => candidate.accessLane === "metered");
  if (metered.length > 0) {
    const authorization = protocol.meteredAuthorization;
    invariant(authorization && typeof authorization === "object", "protocol.meteredAuthorization is required for metered candidates");
    invariant(typeof authorization.approvedBy === "string" && authorization.approvedBy.trim(), "meteredAuthorization.approvedBy is required");
    invariant(Number.isFinite(Date.parse(authorization.approvedAt)), "meteredAuthorization.approvedAt must be an ISO timestamp");
    invariant(authorization.provider === "OpenRouter", "meteredAuthorization.provider must be OpenRouter");
    invariant(Array.isArray(authorization.candidateIds) && metered.every((candidate) => authorization.candidateIds.includes(candidate.id)), "meteredAuthorization must cover every metered candidate");
    invariant(Array.isArray(authorization.fixtureIds) && config.fixtures.every((fixture) => authorization.fixtureIds.includes(fixture.id)), "meteredAuthorization must cover every fixture");
    invariant(Number.isInteger(authorization.maxRepairRound) && authorization.maxRepairRound >= 0 && authorization.maxRepairRound <= protocol.maxRepairRounds, "meteredAuthorization.maxRepairRound is invalid");
    invariant(Number.isFinite(authorization.aggregateCapUsd) && authorization.aggregateCapUsd > 0, "meteredAuthorization.aggregateCapUsd must be positive");
  }
}

async function loadRound(root, roundId) {
  const directory = roundDirectory(root, roundId);
  const manifestFile = path.join(directory, "manifest.json");
  const manifestBytes = await fs.readFile(manifestFile);
  const manifest = JSON.parse(manifestBytes);
  invariant(manifest.roundId === roundId, "manifest roundId mismatch");
  return { directory, manifest, manifestBytes, manifestSha256: sha256(manifestBytes) };
}

async function loadSealed(round) {
  const file = path.join(round.directory, ".coordinator/sealed-mapping.json");
  await regularFile(file, "sealed mapping");
  const sealed = await readJson(file, "sealed mapping");
  invariant(sealed.roundId === round.manifest.roundId, "sealed mapping roundId mismatch");
  invariant(sealed.manifestSha256 === round.manifestSha256, "sealed mapping manifest hash mismatch");
  invariant(Array.isArray(sealed.mapping), "sealed mapping entries are required");
  return sealed;
}

export async function prepareRound({ root = SCRIPT_ROOT, roundId, config, createdAt = new Date().toISOString(), randomUUID = crypto.randomUUID }) {
  validateConfig(config);
  const directory = roundDirectory(root, roundId);
  try {
    await fs.lstat(directory);
    throw new Error(`round ${roundId} already exists and is immutable`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const planFile = resolveInside(root, PLAN_PATH, "benchmark plan");
  await regularFile(planFile, "benchmark plan");
  const planBytes = await fs.readFile(planFile);
  const fixtures = [];
  for (const definition of config.fixtures) {
    const { bytes, stat } = await readStableFileInside(root, definition.path, FIXTURES_PATH, `fixture ${definition.id}`);
    fixtures.push({
      id: definition.id,
      version: definition.version,
      path: definition.path,
      taskClass: definition.taskClass,
      evaluationKind: definition.evaluationKind,
      validator: definition.validator ?? null,
      sha256: sha256(bytes),
      bytes: Number(stat.size),
    });
  }
  const candidates = config.candidates.map((candidate) => ({
    id: candidate.id,
    displayName: candidate.displayName,
    modelSlug: candidate.modelSlug,
    provider: candidate.provider,
    modelFamily: candidate.modelFamily,
    effort: candidate.effort,
    pricingSnapshot: candidate.pricingSnapshot,
    contextLimit: candidate.contextLimit,
    toolSupport: candidate.toolSupport,
    blindAliases: candidate.blindAliases,
    accessLane: candidate.accessLane,
  }));
  const mapping = [];
  for (const fixture of fixtures) {
    for (const candidate of candidates) {
      mapping.push({
        artifactId: `artifact-${randomUUID()}`,
        fixtureId: fixture.id,
        candidateId: candidate.id,
      });
    }
  }
  uniqueBy(mapping, "artifactId", "artifact ids");
  const manifest = {
    schemaVersion: 1,
    roundId,
    createdAt,
    status: "prepared",
    benchmarkPlan: { path: PLAN_PATH, sha256: sha256(planBytes) },
    fixtures,
    candidates,
    protocol: config.protocol,
    thresholds: REGISTERED_THRESHOLDS,
    evaluatorPolicy: {
      requiredEvaluators: 2,
      requireDistinctIdentities: true,
      requireDistinctFamilies: true,
      producersMayNotEvaluateOwnArtifacts: true,
      judgeOfRecord: "required when artifact rubric totals differ by more than 15% or fixture preference differs",
      isolatedBlindPacketOnly: true,
      filesystemAndCoordinatorToolsForbidden: true,
    },
    blinding: { algorithm: "random-uuid-v4", artifactCount: mapping.length, sealedMapping: ".coordinator/sealed-mapping.json" },
  };
  const manifestBytes = jsonBytes(manifest);
  const parent = path.dirname(directory);
  await fs.mkdir(parent, { recursive: true });
  const temporary = path.join(parent, `.${roundId}.prepare-${crypto.randomUUID()}`);
  await fs.mkdir(path.join(temporary, ".coordinator/attempts"), { recursive: true });
  await fs.mkdir(path.join(temporary, "producer-artifacts"), { recursive: true });
  try {
    await fs.writeFile(path.join(temporary, "manifest.json"), manifestBytes, { mode: 0o444 });
    await fs.writeFile(path.join(temporary, "producer-events.jsonl"), "", { mode: 0o644 });
    await fs.writeFile(path.join(temporary, ".coordinator/sealed-mapping.json"), jsonBytes({
      schemaVersion: 1,
      roundId,
      manifestSha256: sha256(manifestBytes),
      mapping,
    }), { mode: 0o600 });
    await fs.rename(temporary, directory);
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    if (error?.code === "EEXIST" || error?.code === "ENOTEMPTY") throw new Error(`round ${roundId} already exists and is immutable`);
    throw error;
  }
  return { directory, manifest, manifestHash: sha256(manifestBytes) };
}

function normalizeArtifactPath(relativePath) {
  invariant(typeof relativePath === "string" && relativePath.length > 0, "artifact path is required");
  invariant(!path.isAbsolute(relativePath), `artifact path must be relative: ${relativePath}`);
  const normalized = path.normalize(relativePath);
  invariant(normalized !== ".." && !normalized.startsWith(`..${path.sep}`), `artifact path escapes output directory: ${relativePath}`);
  invariant(normalized !== "evaluation-context.json", "artifact path evaluation-context.json is reserved");
  return normalized;
}

function artifactBytes(artifact) {
  invariant(TEXT_ARTIFACT_EXTENSIONS.has(path.extname(artifact.path ?? "").toLowerCase()), `artifact ${artifact.path ?? "(unknown)"} must be a supported UTF-8 text artifact`);
  let bytes;
  if (typeof artifact.content === "string") bytes = Buffer.from(artifact.content);
  else if (typeof artifact.base64 === "string") bytes = Buffer.from(artifact.base64, "base64");
  else if (Buffer.isBuffer(artifact.bytes) || artifact.bytes instanceof Uint8Array) bytes = Buffer.from(artifact.bytes);
  else throw new Error(`artifact ${artifact.path ?? "(unknown)"} must provide content, base64, or bytes`);
  invariant(bytes.length <= MAX_FIXTURE_BYTES, `artifact ${artifact.path} exceeds the ${MAX_FIXTURE_BYTES}-byte limit`);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`artifact ${artifact.path} must be a supported UTF-8 text artifact`);
  }
  invariant(!bytes.includes(0), `artifact ${artifact.path} must be a supported UTF-8 text artifact`);
  return bytes;
}

function normalizeCost(candidate, cost, status, cap) {
  invariant(cost && typeof cost === "object", "producer result cost is required");
  invariant(cost.lane === candidate.accessLane, `producer cost lane must match candidate ${candidate.id} access lane`);
  invariant(Number.isFinite(cost.reviewerTimeMinutes) && cost.reviewerTimeMinutes >= 0, "reviewerTimeMinutes must be non-negative");
  if (candidate.accessLane === "subscription") {
    invariant(cost.marginalApiCostUsd === null, "subscription marginalApiCostUsd must be null, never zero");
    invariant(cost.providerCostUsd === undefined, "subscription providerCostUsd must be omitted");
  } else {
    invariant(cost.providerCostUsd === null || (Number.isFinite(cost.providerCostUsd) && cost.providerCostUsd >= 0), "metered providerCostUsd must be non-negative or null");
    if (status === "completed") invariant(cost.providerCostUsd !== null, "completed metered runs must record provider cost");
    if (status === "completed" && cost.providerCostUsd !== null) invariant(cost.providerCostUsd <= cap, `provider cost exceeds remaining authorized cap of ${cap}`);
  }
  return cost;
}

function safeError(error) {
  return {
    code: typeof error?.code === "string" ? error.code : "PRODUCER_ERROR",
    message: typeof error?.message === "string" ? error.message : String(error),
  };
}

async function readEvents(round) {
  const file = path.join(round.directory, "producer-events.jsonl");
  const stat = await regularFile(file, "producer events");
  invariant(stat.size <= 5_000_000, "producer-events.jsonl exceeds the 5000000-byte limit");
  const text = await fs.readFile(file, "utf8");
  const events = text.split("\n").filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`producer-events.jsonl line ${index + 1} is invalid JSON`);
    }
  });
  for (const event of events) {
    validId(event?.eventId, "event.eventId");
    validId(event?.candidateId, "event.candidateId");
    validId(event?.fixtureId, "event.fixtureId");
    invariant(event.roundId === round.manifest.roundId && event.manifestSha256 === round.manifestSha256, `event ${event.eventId} is not bound to this round`);
    invariant(round.manifest.candidates.some((candidate) => candidate.id === event.candidateId), `event ${event.eventId} has an unknown candidate`);
    invariant(round.manifest.fixtures.some((fixture) => fixture.id === event.fixtureId), `event ${event.eventId} has an unknown fixture`);
    invariant(TERMINAL_STATUSES.has(event.status), `event ${event.eventId} has an invalid status`);
    invariant(Number.isInteger(event.repairRound) && event.repairRound >= 0 && event.repairRound <= round.manifest.protocol.maxRepairRounds, `event ${event.eventId} has an invalid repair round`);
    invariant(Array.isArray(event.artifacts) && event.artifacts.length <= 20, `event ${event.eventId} artifacts are invalid`);
    for (const artifact of event.artifacts) {
      invariant(normalizeArtifactPath(artifact.path) === artifact.path, `event ${event.eventId} has a non-canonical artifact path`);
      invariant(Number.isInteger(artifact.bytes) && artifact.bytes >= 0 && artifact.bytes <= MAX_FIXTURE_BYTES, `event ${event.eventId} artifact size is invalid`);
      invariant(typeof artifact.sha256 === "string" && /^[a-f0-9]{64}$/.test(artifact.sha256), `event ${event.eventId} artifact hash is invalid`);
    }
    const attempt = path.join(round.directory, ".coordinator/attempts", event.candidateId, event.fixtureId, `${event.repairRound}.json`);
    const recorded = await fs.readFile(attempt);
    invariant(sha256(recorded) === sha256(jsonLine(event)), `event ${event.eventId} does not match its immutable attempt record`);
  }
  return events;
}

async function runProducerUnlocked({
  root = SCRIPT_ROOT,
  roundId,
  candidateId,
  fixtureId,
  repairRound = 0,
  adapter,
  meteredApproved = false,
  startedAt,
  completedAt,
}) {
  invariant(typeof adapter === "function", "an injected producer adapter is required");
  const round = await loadRound(root, roundId);
  try {
    await fs.lstat(path.join(round.directory, "blind-packet"));
    throw new Error("producer intake is closed because the blind packet is already assembled");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const sealed = await loadSealed(round);
  const candidate = round.manifest.candidates.find((entry) => entry.id === candidateId);
  const fixture = round.manifest.fixtures.find((entry) => entry.id === fixtureId);
  invariant(candidate, `unknown candidate: ${candidateId}`);
  invariant(fixture, `unknown fixture: ${fixtureId}`);
  invariant(Number.isInteger(repairRound) && repairRound >= 0 && repairRound <= round.manifest.protocol.maxRepairRounds, `repair round must be between 0 and ${round.manifest.protocol.maxRepairRounds}`);
  const mapping = sealed.mapping.find((entry) => entry.candidateId === candidateId && entry.fixtureId === fixtureId);
  invariant(mapping, "sealed mapping is missing candidate/fixture pair");
  const attemptsDirectory = path.join(round.directory, ".coordinator/attempts", candidateId, fixtureId);
  await fs.mkdir(attemptsDirectory, { recursive: true });
  const attemptFile = path.join(attemptsDirectory, `${repairRound}.json`);
  let reservation;
  let outputDirectory;
  try {
    reservation = await fs.open(attemptFile, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`attempt already recorded for ${candidateId}/${fixtureId} repair ${repairRound}`);
    throw error;
  }
  try {
    const existing = await readEvents(round);
    const prior = existing.filter((event) => event.candidateId === candidateId && event.fixtureId === fixtureId);
    let remainingAuthorizedCap = round.manifest.protocol.perTaskCapUsd;
    if (candidate.accessLane === "metered") {
      const authorization = round.manifest.protocol.meteredAuthorization;
      invariant(meteredApproved === true, "metered execution requires the explicit --allow-metered gate");
      invariant(authorization.provider === candidate.provider, `metered authorization does not cover provider ${candidate.provider}`);
      invariant(authorization.candidateIds.includes(candidateId), `metered authorization does not cover candidate ${candidateId}`);
      invariant(authorization.fixtureIds.includes(fixtureId), `metered authorization does not cover fixture ${fixtureId}`);
      invariant(repairRound <= authorization.maxRepairRound, `metered authorization does not cover repair round ${repairRound}`);
      const allKnownCosts = existing.filter((event) => event.cost?.lane === "metered").map((event) => event.cost.providerCostUsd);
      invariant(allKnownCosts.every(Number.isFinite), "cannot spend again while a prior metered attempt has unknown cost");
      const pairSpent = prior.reduce((sum, event) => sum + (event.cost.providerCostUsd ?? 0), 0);
      const aggregateSpent = allKnownCosts.reduce((sum, value) => sum + value, 0);
      remainingAuthorizedCap = Math.min(
        round.manifest.protocol.perTaskCapUsd - pairSpent,
        authorization.aggregateCapUsd - aggregateSpent,
      );
      invariant(remainingAuthorizedCap > 0, "metered authorization budget is exhausted");
    }
    if (repairRound > 0) {
      invariant(prior.some((event) => event.repairRound === repairRound - 1), `repair ${repairRound - 1} must be recorded first`);
      const last = prior.find((event) => event.repairRound === repairRound - 1);
      invariant(!["unauthenticated", "skipped"].includes(last.status), `${last.status} calls cannot be repaired without resolving the gate in a new round`);
    }
    const { bytes } = await readStableFileInside(root, fixture.path, FIXTURES_PATH, `fixture ${fixture.id}`);
    invariant(sha256(bytes) === fixture.sha256, `fixture hash changed after prepare: ${fixture.path}`);
    const started = startedAt ?? new Date().toISOString();
    const abortController = new AbortController();
    let result;
    let timeout;
    try {
      result = await Promise.race([
        Promise.resolve(adapter({
          roundId,
          candidate: structuredClone(candidate),
          fixture: { ...structuredClone(fixture), bytes },
          repairRound,
          policy: { ...structuredClone(round.manifest.protocol), perTaskCapUsd: remainingAuthorizedCap },
          signal: abortController.signal,
        })),
        new Promise((resolve) => {
          timeout = setTimeout(() => {
            abortController.abort();
            resolve({
              status: "timed_out",
              prompts: [], toolCalls: [], artifacts: [], usage: { inputTokens: null, outputTokens: null, cachedTokens: null },
              cost: candidate.accessLane === "subscription"
                ? { lane: "subscription", marginalApiCostUsd: null, reviewerTimeMinutes: 0 }
                : { lane: "metered", providerCostUsd: null, reviewerTimeMinutes: 0 },
              errors: [{ code: "TIME_LIMIT", message: `producer exceeded ${round.manifest.protocol.timeLimitMs}ms` }],
              acceptance: { deterministicTests: "not_run", automaticRejections: [], firstPassAccepted: false },
              context: { failures: ["time_limit"] }, reliability: { completed: false },
            });
          }, round.manifest.protocol.timeLimitMs);
        }),
      ]);
    } catch (error) {
      result = {
        status: "failed", prompts: [], toolCalls: [], artifacts: [],
        usage: { inputTokens: null, outputTokens: null, cachedTokens: null },
        cost: candidate.accessLane === "subscription"
          ? { lane: "subscription", marginalApiCostUsd: null, reviewerTimeMinutes: 0 }
          : { lane: "metered", providerCostUsd: null, reviewerTimeMinutes: 0 },
        errors: [safeError(error)],
        acceptance: { deterministicTests: "not_run", automaticRejections: [], firstPassAccepted: false },
        context: { failures: ["adapter_error"] }, reliability: { completed: false },
      };
    } finally {
      clearTimeout(timeout);
    }
    invariant(result && typeof result === "object", "producer adapter must return an object");
    invariant(TERMINAL_STATUSES.has(result.status), `invalid producer status: ${result.status}`);
    invariant(Array.isArray(result.prompts), "producer result prompts must be an array");
    invariant(Array.isArray(result.toolCalls), "producer result toolCalls must be an array");
    invariant(Array.isArray(result.errors), "producer result errors must be an array");
    invariant(result.usage && typeof result.usage === "object", "producer result usage is required");
    invariant(result.acceptance && typeof result.acceptance === "object", "producer result acceptance is required");
    invariant(result.context && typeof result.context === "object", "producer result context is required");
    invariant(result.reliability && typeof result.reliability === "object", "producer result reliability is required");
    const cost = normalizeCost(candidate, result.cost, result.status, remainingAuthorizedCap);
    const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
    if (result.status === "completed") invariant(artifacts.length > 0, "completed producer result must include an artifact");
    const paths = artifacts.map((artifact) => normalizeArtifactPath(artifact.path));
    invariant(new Set(paths).size === paths.length, "producer artifact paths must be unique");
    outputDirectory = path.join(round.directory, "producer-artifacts", mapping.artifactId, `repair-${repairRound}`);
    await fs.mkdir(path.dirname(outputDirectory), { recursive: true });
    await fs.mkdir(outputDirectory, { recursive: false });
    const artifactRecords = [];
    for (let index = 0; index < artifacts.length; index += 1) {
      const content = artifactBytes(artifacts[index]);
      const destination = path.join(outputDirectory, paths[index]);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, content, { flag: "wx" });
      artifactRecords.push({ path: paths[index], bytes: content.length, sha256: sha256(content) });
    }
    const completed = completedAt ?? new Date().toISOString();
    const startedMs = Date.parse(started);
    const completedMs = Date.parse(completed);
    invariant(Number.isFinite(startedMs) && Number.isFinite(completedMs) && completedMs >= startedMs, "producer timestamps are invalid");
    const firstUsableMs = result.firstUsableAt === null || result.firstUsableAt === undefined ? null : Date.parse(result.firstUsableAt);
    invariant(firstUsableMs === null || (Number.isFinite(firstUsableMs) && firstUsableMs >= startedMs && firstUsableMs <= completedMs), "firstUsableAt must fall inside the recorded attempt interval");
    const event = {
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      roundId,
      manifestSha256: round.manifestSha256,
      artifactId: mapping.artifactId,
      candidateId,
      fixtureId,
      fixtureSha256: fixture.sha256,
      repairRound,
      status: result.status,
      outcome: result.status === "completed" ? "completed" : "failure",
      startedAt: started,
      completedAt: completed,
      latencyMs: completedMs - startedMs,
      firstUsableAt: result.firstUsableAt ?? null,
      firstUsableLatencyMs: firstUsableMs === null ? null : firstUsableMs - startedMs,
      prompts: result.prompts,
      toolCalls: result.toolCalls,
      errors: result.errors,
      usage: result.usage,
      cost,
      acceptance: {
        deterministicTests: "not_run",
        automaticRejections: Array.isArray(result.acceptance.automaticRejections) ? result.acceptance.automaticRejections : [],
        firstPassAccepted: false,
        seededDefectsFound: null,
        seededDefectsTotal: null,
        inventedBlocker: null,
        securitySensitiveFalseFix: null,
      },
      producerAcceptanceClaims: result.acceptance,
      context: result.context,
      reliability: result.reliability,
      artifacts: artifactRecords,
    };
    await reservation.writeFile(jsonLine(event));
    await reservation.close();
    reservation = undefined;
    await fs.appendFile(path.join(round.directory, "producer-events.jsonl"), jsonLine(event));
    return event;
  } catch (error) {
    await reservation?.close();
    if (outputDirectory) await fs.rm(outputDirectory, { recursive: true, force: true });
    await fs.rm(attemptFile, { force: true });
    throw error;
  }
}

export async function runProducer(options) {
  const root = options.root ?? SCRIPT_ROOT;
  const directory = roundDirectory(root, options.roundId);
  return withRoundLock(directory, "run-producer", () => runProducerUnlocked(options));
}

function latestEvents(events) {
  const latest = new Map();
  for (const event of events) {
    const key = `${event.candidateId}\0${event.fixtureId}`;
    const previous = latest.get(key);
    if (!previous || event.repairRound > previous.repairRound) latest.set(key, event);
  }
  return latest;
}

function normalizedIdentityParts(value) {
  const tokens = String(value).normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
  return { compact: tokens.join(""), tokens };
}

function identityTerms(candidates) {
  return candidates.flatMap((candidate) => [candidate.id, candidate.displayName, candidate.modelSlug, candidate.provider, ...(candidate.blindAliases ?? [])])
    .map(normalizedIdentityParts)
    .filter((term) => term.compact.length >= 3);
}

function assertNoIdentityLeak(bytes, candidates, artifactPath) {
  const text = normalizedIdentityParts(bytes.toString("utf8"));
  const leak = identityTerms(candidates).find((term) => term.compact.length >= 4
    ? text.compact.includes(term.compact)
    : text.tokens.includes(term.compact));
  invariant(!leak, `artifact ${artifactPath} leaks blinded producer identity`);
  invariant(!/(?:ignore|override|disregard)\s+(?:the\s+)?(?:rubric|evaluator|scoring|instructions)|(?:inspect|read|open)\s+(?:the\s+)?\.coordinator|(?:give|assign|award|score)\s+(?:this\s+)?(?:artifact\s+)?(?:a\s+)?(?:4|four|maximum|perfect)/iu.test(bytes.toString("utf8")), `artifact ${artifactPath} contains evaluator-control instructions`);
}

async function copyVerifiedArtifact(round, sourceRelative, destination, expected, candidates) {
  const { bytes } = await readStableFileInside(round.directory, sourceRelative, "producer-artifacts", `producer artifact ${expected.path}`);
  invariant(sha256(bytes) === expected.sha256, `producer artifact hash mismatch: ${expected.path}`);
  assertNoIdentityLeak(bytes, candidates, expected.path);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes, { flag: "wx" });
  return { path: expected.path, bytes: bytes.length, sha256: expected.sha256 };
}

async function assembleArtifactsUnlocked({ root = SCRIPT_ROOT, roundId }) {
  const round = await loadRound(root, roundId);
  const sealed = await loadSealed(round);
  const events = await readEvents(round);
  const latest = latestEvents(events);
  const finalDirectory = path.join(round.directory, "blind-packet");
  try {
    await fs.lstat(finalDirectory);
    throw new Error("anonymized artifacts already exist and are immutable");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporary = path.join(round.directory, `.blind-packet-${crypto.randomUUID()}`);
  const temporaryArtifacts = path.join(temporary, "artifacts");
  await fs.mkdir(temporaryArtifacts, { recursive: true });
  const index = { schemaVersion: 1, roundId, manifestSha256: round.manifestSha256, artifacts: [] };
  try {
    const presentation = sealed.mapping.slice().sort((left, right) => sha256(`${round.manifestSha256}\0${left.artifactId}`).localeCompare(sha256(`${round.manifestSha256}\0${right.artifactId}`)));
    for (const mapping of presentation) {
      const fixture = round.manifest.fixtures.find((entry) => entry.id === mapping.fixtureId);
      const event = latest.get(`${mapping.candidateId}\0${mapping.fixtureId}`);
      const independentAcceptance = await loadIndependentAcceptance(round, event);
      const artifactDirectory = path.join(temporaryArtifacts, mapping.artifactId);
      await fs.mkdir(artifactDirectory);
      const fixtureBytes = await fs.readFile(resolveInside(root, fixture.path));
      invariant(sha256(fixtureBytes) === fixture.sha256, `fixture hash changed after prepare: ${fixture.path}`);
      const extension = path.extname(fixture.path) || ".txt";
      const fixtureName = `fixture${extension}`;
      await fs.writeFile(path.join(artifactDirectory, fixtureName), fixtureBytes, { flag: "wx" });
      const presentedFiles = [{ path: fixtureName, bytes: fixtureBytes.length, sha256: fixture.sha256 }];
      if (event?.status === "completed") {
        for (const artifact of event.artifacts) {
          const safeArtifactPath = normalizeArtifactPath(artifact.path);
          const source = path.join("producer-artifacts", mapping.artifactId, `repair-${event.repairRound}`, safeArtifactPath);
          const destination = path.join(artifactDirectory, safeArtifactPath);
          presentedFiles.push(await copyVerifiedArtifact(round, source, destination, { ...artifact, path: safeArtifactPath }, round.manifest.candidates));
        }
      }
      const context = {
        schemaVersion: 1,
        artifactId: mapping.artifactId,
        fixture: {
          id: fixture.id,
          version: fixture.version,
          taskClass: fixture.taskClass,
          evaluationKind: fixture.evaluationKind,
          sha256: fixture.sha256,
          presentedAs: fixtureName,
        },
        producerOutcome: event?.status ?? "missing",
        deterministicAcceptance: independentAcceptance?.acceptance.deterministicTests ?? "not_run",
        instructions: "Score only this anonymized artifact and fixture. Do not inspect coordinator files or infer producer identity.",
      };
      const contextBytes = jsonBytes(context);
      await fs.writeFile(path.join(artifactDirectory, "evaluation-context.json"), contextBytes, { flag: "wx" });
      presentedFiles.push({ path: "evaluation-context.json", bytes: contextBytes.length, sha256: sha256(contextBytes) });
      index.artifacts.push({
        artifactId: mapping.artifactId,
        fixtureId: fixture.id,
        taskClass: fixture.taskClass,
        evaluationKind: fixture.evaluationKind,
        producerOutcome: event?.status ?? "missing",
        eventId: event?.eventId ?? null,
        eventSha256: event ? sha256(jsonLine(event)) : null,
        repairRound: event?.repairRound ?? null,
        acceptanceSha256: independentAcceptance?.sha256 ?? null,
        files: presentedFiles,
      });
    }
    const indexBytes = jsonBytes(index);
    await fs.writeFile(path.join(temporary, "artifacts-index.json"), indexBytes, { flag: "wx" });
    await fs.rename(temporary, finalDirectory);
    return { ...index, artifactsIndexSha256: sha256(indexBytes) };
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function assembleArtifacts(options) {
  const root = options.root ?? SCRIPT_ROOT;
  const directory = roundDirectory(root, options.roundId);
  return withRoundLock(directory, "assemble-artifacts", () => assembleArtifactsUnlocked(options));
}

async function loadArtifactIndex(round) {
  const file = path.join(round.directory, "blind-packet/artifacts-index.json");
  const bytes = await fs.readFile(file);
  const index = JSON.parse(bytes);
  invariant(index.manifestSha256 === round.manifestSha256, "artifact index manifest hash mismatch");
  invariant(Array.isArray(index.artifacts), "artifact index entries are required");
  return { index, bytes, sha256: sha256(bytes) };
}

function acceptanceFile(round, event) {
  return path.join(round.directory, ".coordinator/acceptance", event.candidateId, event.fixtureId, `${event.repairRound}.json`);
}

function artifactSetSha256(event) {
  return sha256(jsonBytes(event.artifacts));
}

async function loadIndependentAcceptance(round, event, expectedSha256 = null) {
  if (!event) return null;
  const file = acceptanceFile(round, event);
  let bytes;
  try {
    bytes = await fs.readFile(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (expectedSha256 !== null) invariant(sha256(bytes) === expectedSha256, `independent acceptance hash mismatch: ${event.eventId}`);
  const acceptance = JSON.parse(bytes);
  invariant(acceptance.roundId === round.manifest.roundId && acceptance.manifestSha256 === round.manifestSha256, "independent acceptance round binding mismatch");
  invariant(acceptance.eventId === event.eventId && acceptance.eventSha256 === sha256(jsonLine(event)), "independent acceptance event binding mismatch");
  invariant(acceptance.artifactSetSha256 === artifactSetSha256(event), "independent acceptance artifact binding mismatch");
  return { acceptance, bytes, sha256: sha256(bytes) };
}

async function recordAcceptanceUnlocked({ root = SCRIPT_ROOT, roundId, candidateId, fixtureId, repairRound = 0, record }) {
  const round = await loadRound(root, roundId);
  try {
    await fs.lstat(path.join(round.directory, "blind-packet"));
    throw new Error("independent acceptance is closed because the blind packet is already assembled");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const events = await readEvents(round);
  const event = events.find((entry) => entry.candidateId === candidateId && entry.fixtureId === fixtureId && entry.repairRound === repairRound);
  invariant(event, "independent acceptance requires an existing immutable producer attempt");
  invariant(record && typeof record === "object", "independent acceptance record is required");
  for (const field of ["id", "family", "evaluatedAt", "attestation"]) {
    invariant(typeof record.evaluator?.[field] === "string" && record.evaluator[field].trim(), `acceptance evaluator.${field} is required`);
  }
  invariant(Number.isFinite(Date.parse(record.evaluator.evaluatedAt)), "acceptance evaluator.evaluatedAt must be an ISO timestamp");
  const candidate = round.manifest.candidates.find((entry) => entry.id === candidateId);
  invariant(normalizedIdentity(record.evaluator.family) !== normalizedIdentity(candidate.modelFamily), "acceptance evaluator family must be independent of the producer model family");
  invariant(record.artifactSetSha256 === artifactSetSha256(event), "acceptance artifactSetSha256 does not match the immutable producer artifact set");
  invariant(Array.isArray(record.automaticRejections), "acceptance automaticRejections must be an array");
  invariant(Number.isFinite(record.reviewerTimeMinutes) && record.reviewerTimeMinutes >= 0, "acceptance reviewerTimeMinutes must be non-negative");
  const fixture = round.manifest.fixtures.find((entry) => entry.id === fixtureId);
  invariant(!fixture.validator?.sha256, "registered validators must be executed by a coordinator-owned validator adapter; external pass/count records are not accepted");
  if (fixture.evaluationKind === "mechanical") {
    invariant(["passed", "failed"].includes(record.deterministicTests), "mechanical acceptance requires deterministicTests passed or failed");
  }
  if (fixture.evaluationKind === "code-review") {
    invariant(Number.isInteger(record.seededDefectsFound) && Number.isInteger(record.seededDefectsTotal) && record.seededDefectsTotal > 0 && record.seededDefectsFound >= 0 && record.seededDefectsFound <= record.seededDefectsTotal, "code-review acceptance requires bounded seeded defect counts");
    invariant(typeof record.inventedBlocker === "boolean" && typeof record.securitySensitiveFalseFix === "boolean", "code-review acceptance requires independent false-positive determinations");
  }
  const acceptance = {
    schemaVersion: 1,
    roundId,
    manifestSha256: round.manifestSha256,
    eventId: event.eventId,
    eventSha256: sha256(jsonLine(event)),
    artifactSetSha256: record.artifactSetSha256,
    evaluator: record.evaluator,
    deterministicTests: fixture.evaluationKind === "mechanical" ? record.deterministicTests : "not_applicable",
    seededDefectsFound: fixture.evaluationKind === "code-review" ? record.seededDefectsFound : null,
    seededDefectsTotal: fixture.evaluationKind === "code-review" ? record.seededDefectsTotal : null,
    inventedBlocker: fixture.evaluationKind === "code-review" ? record.inventedBlocker : null,
    securitySensitiveFalseFix: fixture.evaluationKind === "code-review" ? record.securitySensitiveFalseFix : null,
    automaticRejections: record.automaticRejections,
    reviewerTimeMinutes: record.reviewerTimeMinutes,
    validatorSha256: null,
  };
  await writeExclusive(acceptanceFile(round, event), jsonBytes(acceptance), 0o600);
  return acceptance;
}

export async function recordAcceptance(options) {
  const root = options.root ?? SCRIPT_ROOT;
  const directory = roundDirectory(root, options.roundId);
  return withRoundLock(directory, "record-acceptance", () => recordAcceptanceUnlocked(options));
}

function blankDimensions() {
  return Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, { score: null, evidence: "" }]));
}

export async function createScoreTemplate({ root = SCRIPT_ROOT, roundId, evaluatorSlot }) {
  invariant(Number.isInteger(evaluatorSlot) && evaluatorSlot >= 1 && evaluatorSlot <= 3, "evaluatorSlot must be 1, 2, or 3");
  const round = await loadRound(root, roundId);
  const artifactIndex = await loadArtifactIndex(round);
  return {
    schemaVersion: 1,
    roundId,
    manifestSha256: round.manifestSha256,
    artifactsIndexSha256: artifactIndex.sha256,
    evaluatorSlot,
    evaluator: { id: "", family: "", scoredAt: "", attestation: "" },
    isolation: {
      artifactsIndexSha256: artifactIndex.sha256,
      toolAccess: false,
      attestation: "",
    },
    instructions: "Complete every score and evidence field while blind. Evaluator identity and family must be independent of the producer and the other evaluator.",
    artifacts: artifactIndex.index.artifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      dimensions: blankDimensions(),
      automaticRejections: [],
      independentReviewDefects: [],
      visualFidelity: null,
      reviewerTimeMinutes: null,
    })),
  };
}

function normalizedIdentity(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function validateScores(score, { round, artifactIndex, slot }) {
  invariant(score?.roundId === round.manifest.roundId, `score ${slot} roundId mismatch`);
  invariant(score.manifestSha256 === round.manifestSha256, `score ${slot} manifest hash mismatch`);
  invariant(score.artifactsIndexSha256 === artifactIndex.sha256, `score ${slot} artifact index hash mismatch`);
  invariant(score.evaluatorSlot === slot, `score ${slot} evaluator slot mismatch`);
  for (const field of ["id", "family", "scoredAt", "attestation"]) {
    invariant(typeof score.evaluator?.[field] === "string" && score.evaluator[field].trim(), `score ${slot} evaluator.${field} is required`);
  }
  invariant(score.isolation?.artifactsIndexSha256 === artifactIndex.sha256, `score ${slot} isolation packet hash mismatch`);
  invariant(score.isolation?.toolAccess === false, `score ${slot} must attest that coordinator/filesystem tools were unavailable`);
  invariant(typeof score.isolation?.attestation === "string" && score.isolation.attestation.trim(), `score ${slot} isolation attestation is required`);
  invariant(Array.isArray(score.artifacts) && score.artifacts.length === artifactIndex.index.artifacts.length, `score ${slot} must cover every artifact`);
  const expected = new Set(artifactIndex.index.artifacts.map((artifact) => artifact.artifactId));
  invariant(new Set(score.artifacts.map((artifact) => artifact.artifactId)).size === score.artifacts.length, `score ${slot} contains duplicate artifacts`);
  for (const artifact of score.artifacts) {
    invariant(expected.has(artifact.artifactId), `score ${slot} contains unknown artifact ${artifact.artifactId}`);
    invariant(artifact.dimensions && typeof artifact.dimensions === "object", `score ${slot} dimensions are required`);
    invariant(Object.keys(artifact.dimensions).sort().join() === [...DIMENSIONS].sort().join(), `score ${slot} dimensions do not match the registered rubric`);
    for (const dimension of DIMENSIONS) {
      const entry = artifact.dimensions[dimension];
      invariant(Number.isInteger(entry?.score) && entry.score >= 0 && entry.score <= 4 && typeof entry.evidence === "string" && entry.evidence.trim(), `score ${slot} ${artifact.artifactId}.${dimension} requires a complete score and evidence`);
    }
    invariant(Array.isArray(artifact.automaticRejections), `score ${slot} automaticRejections must be an array`);
    invariant(Array.isArray(artifact.independentReviewDefects), `score ${slot} independentReviewDefects must be an array`);
    invariant(artifact.visualFidelity === null || (Number.isFinite(artifact.visualFidelity) && artifact.visualFidelity >= 0 && artifact.visualFidelity <= 4), `score ${slot} visualFidelity must be null or 0-4`);
    invariant(Number.isFinite(artifact.reviewerTimeMinutes) && artifact.reviewerTimeMinutes >= 0, `score ${slot} reviewerTimeMinutes is required`);
  }
}

function scoreTotal(artifact) {
  return DIMENSIONS.reduce((sum, dimension) => sum + artifact.dimensions[dimension].score, 0);
}

function judgeReasons(scores, artifactIndex) {
  const reasons = [];
  for (const artifact of artifactIndex.index.artifacts) {
    const left = scores[0].artifacts.find((entry) => entry.artifactId === artifact.artifactId);
    const right = scores[1].artifacts.find((entry) => entry.artifactId === artifact.artifactId);
    if (Math.abs(scoreTotal(left) - scoreTotal(right)) / (DIMENSIONS.length * 4) > 0.15) reasons.push(`score gap for ${artifact.artifactId}`);
  }
  const fixtureIds = [...new Set(artifactIndex.index.artifacts.map((artifact) => artifact.fixtureId))];
  for (const fixtureId of fixtureIds) {
    const artifactIds = artifactIndex.index.artifacts.filter((artifact) => artifact.fixtureId === fixtureId).map((artifact) => artifact.artifactId);
    const preferred = scores.map((score) => artifactIds.slice().sort((left, right) => {
      const delta = scoreTotal(score.artifacts.find((entry) => entry.artifactId === right)) - scoreTotal(score.artifacts.find((entry) => entry.artifactId === left));
      return delta || left.localeCompare(right);
    })[0]);
    if (preferred[0] !== preferred[1]) reasons.push(`preferred artifact differs for ${fixtureId}`);
  }
  return reasons;
}

function scoreAverages(scoreEntries) {
  return Object.fromEntries(DIMENSIONS.map((dimension) => [
    dimension,
    scoreEntries.reduce((sum, entry) => sum + entry.dimensions[dimension].score, 0) / scoreEntries.length,
  ]));
}

function applyThreshold(fixture, event, scoreEntries, independentAcceptance) {
  const automaticRejections = [
    ...(event?.acceptance?.automaticRejections ?? []),
    ...(independentAcceptance?.automaticRejections ?? []),
    ...scoreEntries.flatMap((entry) => entry.automaticRejections),
  ];
  if (!event || event.status !== "completed") return { passed: false, reason: `producer outcome: ${event?.status ?? "missing"}` };
  if (automaticRejections.length > 0) return { passed: false, reason: "automatic rejection" };
  if (fixture.evaluationKind === "mechanical") {
    if (!fixture.validator?.sha256) return { passed: false, reason: "authoritative deterministic validator is not registered" };
    if (independentAcceptance?.validatorSha256 !== fixture.validator.sha256) return { passed: false, reason: "independent acceptance is not bound to the registered validator" };
    return independentAcceptance?.deterministicTests === "passed"
      ? { passed: true, reason: "all deterministic tests passed" }
      : { passed: false, reason: "deterministic tests did not all pass" };
  }
  if (fixture.evaluationKind === "code-review") {
    if (!fixture.validator?.sha256) return { passed: false, reason: "seeded-defect oracle is not registered" };
    if (independentAcceptance?.validatorSha256 !== fixture.validator.sha256) return { passed: false, reason: "independent acceptance is not bound to the registered oracle" };
    const found = independentAcceptance?.seededDefectsFound;
    const total = independentAcceptance?.seededDefectsTotal;
    const recall = Number.isFinite(found) && Number.isFinite(total) && total > 0 ? found / total : 0;
    const passed = recall >= REGISTERED_THRESHOLDS.codeReview.seededHighAndMediumDefectRecall
      && independentAcceptance?.inventedBlocker === false
      && independentAcceptance?.securitySensitiveFalseFix === false;
    return { passed, reason: passed ? `seeded-defect recall ${(recall * 100).toFixed(1)}%` : "code-review threshold not met" };
  }
  const averages = scoreAverages(scoreEntries);
  const individual = scoreEntries.flatMap((entry) => DIMENSIONS.map((dimension) => entry.dimensions[dimension].score));
  const passed = Object.values(averages).every((score) => score >= REGISTERED_THRESHOLDS.visual.minimumAveragePerDimension)
    && individual.every((score) => score >= REGISTERED_THRESHOLDS.visual.minimumIndividualDimension);
  return { passed, reason: passed ? "registered visual/strategic threshold met" : "visual/strategic score threshold not met" };
}

function aggregateUsage(events) {
  const fields = ["inputTokens", "outputTokens", "cachedTokens"];
  return Object.fromEntries(fields.map((field) => {
    const values = events.map((event) => event.usage?.[field]);
    return [field, values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : null];
  }));
}

function effectiveCost(events, scoreEntries, independentAcceptance) {
  const reviewerTimeMinutes = events.reduce((sum, event) => sum + (event.cost?.reviewerTimeMinutes ?? 0), 0)
    + scoreEntries.reduce((sum, entry) => sum + entry.reviewerTimeMinutes, 0)
    + (independentAcceptance?.reviewerTimeMinutes ?? 0);
  if (events.length === 0) return { lane: "unrecorded", providerCostUsd: null, reviewerTimeMinutes, label: `Unrecorded failure cost; evaluator review ${reviewerTimeMinutes}m` };
  if (events[0].cost.lane === "subscription") {
    return {
      lane: "subscription",
      marginalApiCostUsd: null,
      reviewerTimeMinutes,
      label: `Subscription; marginal API cost N/A; review ${reviewerTimeMinutes}m`,
    };
  }
  const costs = events.map((event) => event.cost.providerCostUsd);
  const providerCostUsd = costs.filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
  const complete = costs.every(Number.isFinite);
  return {
    lane: "metered",
    providerCostUsd: complete ? providerCostUsd : null,
    knownProviderCostUsd: providerCostUsd,
    reviewerTimeMinutes,
    label: complete
      ? `Metered $${providerCostUsd.toFixed(4)}; review ${reviewerTimeMinutes}m`
      : `Metered; at least $${providerCostUsd.toFixed(4)} with unavailable attempt cost; review ${reviewerTimeMinutes}m`,
  };
}

function resultsMarkdown(round, results) {
  const lines = [
    `# Model benchmark results: ${round.manifest.roundId}`,
    "",
    "These are fixture-level blinded results for the exact registered model configurations. They do not by themselves authorize a routing-policy change.",
    "",
    "| Artifact | Fixture | Candidate | Producer status | First pass | Repairs | Rubric mean | Latency | Effective cost | Registered threshold |",
    "|---|---|---|---|---:|---:|---:|---:|---|---|",
  ];
  for (const result of results) {
    const mean = Object.values(result.dimensionAverages).reduce((sum, value) => sum + value, 0) / DIMENSIONS.length;
    lines.push(`| ${result.artifactId} | ${result.fixtureId} | ${result.candidate.displayName} (${result.candidate.modelSlug}) | ${result.producerStatus} | ${result.firstPassAccepted ? "yes" : "no"} | ${result.repairRounds} | ${mean.toFixed(2)} | ${result.latencyToUsableMs ?? "N/A"} ms | ${result.effectiveCost.label} | ${result.threshold.passed ? "PASS" : `FAIL: ${result.threshold.reason}`} |`);
  }
  lines.push(
    "",
    "## Change-control conclusion",
    "",
    `No lane is promoted from this round alone. The registered default-lane gate still requires at least ${REGISTERED_THRESHOLDS.defaultLane.minimumPassingFixtures} passing fixtures in a task class across ${REGISTERED_THRESHOLDS.defaultLane.minimumRounds} rounds, at least ${(REGISTERED_THRESHOLDS.defaultLane.firstPassAcceptance * 100).toFixed(0)}% first-pass acceptance, and independent reviewer sign-off on a new blinded round.`,
    "",
  );
  return lines.join("\n");
}

function decisionLogMarkdown(round, results) {
  const passed = results.filter((result) => result.threshold.passed);
  const failed = results.filter((result) => !result.threshold.passed);
  return [
    `# Model benchmark decision log: ${round.manifest.roundId}`,
    "",
    "## Confirmed results",
    "",
    `- ${passed.length} of ${results.length} candidate/fixture artifacts met their registered fixture-level threshold.`,
    `- ${failed.length} artifacts failed, were unavailable, timed out, skipped, unauthenticated, or did not meet the registered threshold; none are treated as zero-cost wins.`,
    "",
    "## Operating hypotheses",
    "",
    "- Candidate role hypotheses remain unchanged until cross-round and first-pass gates are met.",
    "",
    "## Assumptions requiring more data",
    "",
    "- Task-class defaults require the registered fixture count, two blinded rounds, and independent reviewer sign-off.",
    "- Fast-path claims require the same acceptance threshold plus the registered relative score and latency/effective-cost improvement.",
    "",
    "## Decisions",
    "",
    "- No routing-policy threshold was changed.",
    "- No candidate is promoted solely from this round.",
    "",
  ].join("\n");
}

export async function unblindRound({ root = SCRIPT_ROOT, roundId, scoreFiles, judgeScoreFile = null }) {
  invariant(Array.isArray(scoreFiles) && scoreFiles.length === 2, "exactly two evaluator score files are required");
  const resolvedScoreFiles = scoreFiles.map((file) => path.resolve(file));
  invariant(new Set(resolvedScoreFiles).size === 2, "distinct evaluator score files are required");
  const round = await loadRound(root, roundId);
  const sealed = await loadSealed(round);
  const artifactIndex = await loadArtifactIndex(round);
  const primaryScoreBytes = await Promise.all(resolvedScoreFiles.map((file) => fs.readFile(file)));
  const scores = primaryScoreBytes.map((bytes) => JSON.parse(bytes));
  validateScores(scores[0], { round, artifactIndex, slot: 1 });
  validateScores(scores[1], { round, artifactIndex, slot: 2 });
  const disagreements = judgeReasons(scores, artifactIndex);
  const scoreBytes = [...primaryScoreBytes];
  if (disagreements.length > 0) {
    invariant(judgeScoreFile, `judge-of-record required before unblinding: ${disagreements.join("; ")}`);
    const judgePath = path.resolve(judgeScoreFile);
    invariant(!resolvedScoreFiles.includes(judgePath), "judge score file must be distinct from both evaluator score files");
    const judgeBytes = await fs.readFile(judgePath);
    const judge = JSON.parse(judgeBytes);
    validateScores(judge, { round, artifactIndex, slot: 3 });
    scores.push(judge);
    scoreBytes.push(judgeBytes);
  }
  const evaluatorIds = scores.map((score) => normalizedIdentity(score.evaluator.id));
  const evaluatorFamilies = scores.map((score) => normalizedIdentity(score.evaluator.family));
  invariant(new Set(evaluatorIds).size === evaluatorIds.length, "unblinding requires distinct evaluator identities");
  invariant(new Set(evaluatorFamilies).size === evaluatorFamilies.length, "unblinding requires distinct evaluator families");
  const producerFamilies = new Set(round.manifest.candidates.map((candidate) => normalizedIdentity(candidate.modelFamily)));
  invariant(evaluatorFamilies.every((family) => family && !producerFamilies.has(family)), "evaluator family must be independent of every producer model family");
  const producerIdentities = [...new Set(round.manifest.candidates
    .flatMap((candidate) => [candidate.id, candidate.displayName, candidate.modelSlug, candidate.provider])
    .map(normalizedIdentity))];
  for (const identity of [...evaluatorIds, ...evaluatorFamilies]) {
    const overlapsProducer = producerIdentities.some((producer) => identity === producer
      || (producer.length >= 4 && identity.includes(producer))
      || (identity.length >= 4 && producer.includes(identity)));
    invariant(identity && !overlapsProducer, "evaluator identity/family must be independent of every producer identity");
  }
  const events = await readEvents(round);
  const acceptanceByArtifact = new Map();
  for (const packetArtifact of artifactIndex.index.artifacts) {
    const event = packetArtifact.eventId === null ? null : events.find((entry) => entry.eventId === packetArtifact.eventId) ?? null;
    invariant(event !== null || packetArtifact.eventId === null, `blind packet references a missing event: ${packetArtifact.artifactId}`);
    const loaded = await loadIndependentAcceptance(round, event, packetArtifact.acceptanceSha256);
    invariant((loaded?.sha256 ?? null) === packetArtifact.acceptanceSha256, `blind packet acceptance binding mismatch: ${packetArtifact.artifactId}`);
    acceptanceByArtifact.set(packetArtifact.artifactId, loaded?.acceptance ?? null);
  }
  const results = sealed.mapping.map((mapping) => {
    const fixture = round.manifest.fixtures.find((entry) => entry.id === mapping.fixtureId);
    const candidate = round.manifest.candidates.find((entry) => entry.id === mapping.candidateId);
    const pairEvents = events
      .filter((event) => event.candidateId === mapping.candidateId && event.fixtureId === mapping.fixtureId)
      .sort((left, right) => left.repairRound - right.repairRound);
    const packetArtifact = artifactIndex.index.artifacts.find((artifact) => artifact.artifactId === mapping.artifactId);
    invariant(packetArtifact, `blind packet is missing ${mapping.artifactId}`);
    const event = packetArtifact.eventId === null ? null : pairEvents.find((entry) => entry.eventId === packetArtifact.eventId) ?? null;
    invariant(event === null || sha256(jsonLine(event)) === packetArtifact.eventSha256, `blind packet event binding mismatch: ${mapping.artifactId}`);
    const entries = scores.map((score) => score.artifacts.find((entry) => entry.artifactId === mapping.artifactId));
    const independentAcceptance = acceptanceByArtifact.get(mapping.artifactId);
    const dimensionAverages = scoreAverages(entries);
    const threshold = applyThreshold(fixture, event, entries, independentAcceptance);
    return {
      artifactId: mapping.artifactId,
      fixtureId: mapping.fixtureId,
      taskClass: fixture.taskClass,
      evaluationKind: fixture.evaluationKind,
      candidate,
      producerStatus: event?.status ?? "missing",
      firstPassAccepted: event?.repairRound === 0 && threshold.passed,
      repairRounds: event?.repairRound ?? 0,
      latencyToUsableMs: event?.firstUsableAt
        ? pairEvents.filter((entry) => entry.repairRound < event.repairRound).reduce((sum, entry) => sum + entry.latencyMs, 0) + event.firstUsableLatencyMs
        : null,
      totalAttemptLatencyMs: pairEvents.reduce((sum, entry) => sum + entry.latencyMs, 0),
      usage: aggregateUsage(pairEvents),
      effectiveCost: effectiveCost(pairEvents, entries, independentAcceptance),
      errors: pairEvents.length > 0 ? pairEvents.flatMap((entry) => entry.errors) : [{ code: "MISSING", message: "no producer attempt recorded" }],
      contextFailures: pairEvents.flatMap((entry) => entry.context?.failures ?? []),
      toolCalls: pairEvents.flatMap((entry) => entry.toolCalls ?? []),
      reliability: event?.reliability ?? { completed: false },
      independentReviewDefects: entries.flatMap((entry) => entry.independentReviewDefects),
      visualFidelity: entries.map((entry) => entry.visualFidelity),
      dimensionAverages,
      threshold,
    };
  });
  const resultsBytes = Buffer.from(resultsMarkdown(round, results));
  const decisionLogBytes = Buffer.from(decisionLogMarkdown(round, results));
  const unblinding = {
    schemaVersion: 1,
    roundId,
    manifestSha256: round.manifestSha256,
    artifactsIndexSha256: artifactIndex.sha256,
    completedAt: new Date().toISOString(),
    scoreSha256: scoreBytes.map(sha256),
    evaluators: scores.map((score) => score.evaluator),
    independenceGate: { complete: true, distinctIdentities: true, distinctFamilies: true, producerIndependent: true },
    mapping: sealed.mapping,
    results,
    outputSha256: {
      results: sha256(resultsBytes),
      decisionLog: sha256(decisionLogBytes),
    },
  };
  const destination = path.join(round.directory, "unblind");
  try {
    await fs.lstat(destination);
    throw new Error("unblinding already exists and is immutable");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const stage = path.join(round.directory, `.unblind-${crypto.randomUUID()}`);
  try {
    await fs.mkdir(path.join(stage, "scores"), { recursive: true });
    await Promise.all(scoreBytes.map((bytes, index) => fs.writeFile(path.join(stage, "scores", `evaluator-${String(index + 1).padStart(2, "0")}.json`), bytes)));
    await fs.writeFile(path.join(stage, "results.md"), resultsBytes);
    await fs.writeFile(path.join(stage, "decision-log.md"), decisionLogBytes);
    await fs.writeFile(path.join(stage, "unblinding.json"), jsonBytes(unblinding));
    await fs.rename(stage, destination);
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true });
    if (["EEXIST", "ENOTEMPTY"].includes(error?.code)) throw new Error("unblinding already exists and is immutable");
    throw error;
  }
  return unblinding;
}

export async function verifyRound({ root = SCRIPT_ROOT, roundId, requireComplete = false }) {
  const errors = [];
  let round;
  try {
    round = await loadRound(root, roundId);
    if (JSON.stringify(round.manifest.thresholds) !== JSON.stringify(REGISTERED_THRESHOLDS)) errors.push("registered thresholds changed");
    const planBytes = await fs.readFile(resolveInside(root, round.manifest.benchmarkPlan.path));
    if (sha256(planBytes) !== round.manifest.benchmarkPlan.sha256) errors.push("benchmark plan hash mismatch");
    for (const fixture of round.manifest.fixtures) {
      const bytes = await fs.readFile(resolveInside(root, fixture.path));
      if (sha256(bytes) !== fixture.sha256) errors.push(`fixture hash mismatch: ${fixture.path}`);
    }
    const sealed = await loadSealed(round);
    if (sealed.mapping.length !== round.manifest.blinding.artifactCount) errors.push("sealed mapping count mismatch");
    const events = await readEvents(round);
    for (const event of events) {
      if (event.manifestSha256 !== round.manifestSha256) errors.push(`event manifest hash mismatch: ${event.eventId}`);
      if (!Number.isInteger(event.repairRound) || event.repairRound < 0 || event.repairRound > round.manifest.protocol.maxRepairRounds) errors.push(`event repair ceiling violated: ${event.eventId}`);
      const attempt = path.join(round.directory, ".coordinator/attempts", event.candidateId, event.fixtureId, `${event.repairRound}.json`);
      try {
        const recorded = await fs.readFile(attempt);
        if (sha256(recorded) !== sha256(jsonLine(event))) errors.push(`attempt/event mismatch: ${event.eventId}`);
      } catch {
        errors.push(`missing attempt record: ${event.eventId}`);
      }
    }
    try {
      const artifactIndex = await loadArtifactIndex(round);
      for (const artifact of artifactIndex.index.artifacts) {
        const boundEvent = events.find((event) => event.eventId === artifact.eventId);
        if (artifact.eventId !== null && (!boundEvent || sha256(jsonLine(boundEvent)) !== artifact.eventSha256)) {
          errors.push(`artifact event binding mismatch: ${artifact.artifactId}`);
        }
        try {
          const loadedAcceptance = await loadIndependentAcceptance(round, boundEvent, artifact.acceptanceSha256);
          if ((loadedAcceptance?.sha256 ?? null) !== artifact.acceptanceSha256) errors.push(`artifact acceptance binding mismatch: ${artifact.artifactId}`);
        } catch (error) {
          errors.push(error.message);
        }
        for (const file of artifact.files) {
          const bytes = await fs.readFile(path.join(round.directory, "blind-packet/artifacts", artifact.artifactId, file.path));
          if (sha256(bytes) !== file.sha256) errors.push(`artifact hash mismatch: ${artifact.artifactId}/${file.path}`);
        }
      }
      const unblindingPath = path.join(round.directory, "unblind/unblinding.json");
      try {
        const unblinding = await readJson(unblindingPath);
        if (unblinding.artifactsIndexSha256 !== artifactIndex.sha256) errors.push("unblinding artifact index hash mismatch");
        if (JSON.stringify(unblinding.mapping) !== JSON.stringify(sealed.mapping)) errors.push("unblinding mapping does not match sealed mapping");
        if (unblinding.independenceGate?.complete !== true
          || unblinding.independenceGate?.distinctIdentities !== true
          || unblinding.independenceGate?.distinctFamilies !== true
          || unblinding.independenceGate?.producerIndependent !== true) errors.push("unblinding independence gate is incomplete");
        for (let index = 0; index < unblinding.scoreSha256.length; index += 1) {
          const score = await fs.readFile(path.join(round.directory, "unblind/scores", `evaluator-${String(index + 1).padStart(2, "0")}.json`));
          if (sha256(score) !== unblinding.scoreSha256[index]) errors.push(`score hash mismatch: evaluator ${index + 1}`);
        }
        const resultsBytes = await fs.readFile(path.join(round.directory, "unblind/results.md"));
        const decisionLogBytes = await fs.readFile(path.join(round.directory, "unblind/decision-log.md"));
        if (sha256(resultsBytes) !== unblinding.outputSha256?.results) errors.push("results hash mismatch");
        if (sha256(decisionLogBytes) !== unblinding.outputSha256?.decisionLog) errors.push("decision log hash mismatch");
      } catch (error) {
        if (error?.code !== "ENOENT") errors.push(error.message);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") errors.push(error.message);
    }
    if (requireComplete) {
      for (const relative of ["manifest.json", "producer-events.jsonl", "blind-packet/artifacts-index.json", "unblind/scores/evaluator-01.json", "unblind/scores/evaluator-02.json", "unblind/unblinding.json", "unblind/results.md", "unblind/decision-log.md"]) {
        try {
          await regularFile(path.join(round.directory, relative), relative);
        } catch {
          errors.push(`missing required round output: ${relative}`);
        }
      }
    }
  } catch (error) {
    errors.push(error.message);
  }
  return { roundId, valid: errors.length === 0, complete: requireComplete && errors.length === 0, errors };
}

function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const options = { score: [] };
  for (let index = 0; index < tokens.length; index += 1) {
    const key = tokens[index];
    if (key === "--complete") { options.complete = true; continue; }
    if (key === "--allow-metered") { options.allowMetered = true; continue; }
    const value = tokens[index + 1];
    invariant(key.startsWith("--") && value && !value.startsWith("--"), `missing value for ${key}`);
    index += 1;
    const name = key.slice(2);
    if (name === "score") options.score.push(value);
    else options[name] = value;
  }
  return { command, options };
}

async function cli() {
  const { command, options } = parseArgs(process.argv.slice(2));
  invariant(["prepare", "run", "accept", "assemble", "score-template", "unblind", "verify"].includes(command), "usage: model-benchmark.mjs prepare|run|accept|assemble|score-template|unblind|verify [options]");
  invariant(options["round-id"], "--round-id is required");
  if (command === "prepare") {
    invariant(options.config, "--config is required");
    const config = await readJson(resolveInside(SCRIPT_ROOT, options.config), "benchmark config");
    const prepared = await prepareRound({ roundId: options["round-id"], config });
    console.log(JSON.stringify({ round: prepared.manifest.roundId, manifestSha256: prepared.manifestHash }));
    return;
  }
  if (command === "run") {
    for (const name of ["candidate", "fixture", "adapter"]) invariant(options[name], `--${name} is required`);
    invariant(options.adapter === APPROVED_ADAPTER_PATH, `--adapter must be ${APPROVED_ADAPTER_PATH}`);
    const [requestedAdapter, approvedAdapter] = await Promise.all([
      fs.realpath(resolveInside(SCRIPT_ROOT, options.adapter)),
      fs.realpath(resolveInside(SCRIPT_ROOT, APPROVED_ADAPTER_PATH)),
    ]);
    invariant(requestedAdapter === approvedAdapter, "adapter realpath does not match the approved provider adapter");
    const adapterModule = await import(pathToFileURL(approvedAdapter).href);
    const adapter = adapterModule.default ?? adapterModule.produce;
    const event = await runProducer({
      roundId: options["round-id"], candidateId: options.candidate, fixtureId: options.fixture,
      repairRound: Number(options["repair-round"] ?? 0), adapter, meteredApproved: options.allowMetered === true,
    });
    console.log(JSON.stringify({ eventId: event.eventId, status: event.status, outcome: event.outcome }));
    return;
  }
  if (command === "assemble") {
    const assembled = await assembleArtifacts({ roundId: options["round-id"] });
    console.log(JSON.stringify({ artifacts: assembled.artifacts.length, artifactsIndexSha256: assembled.artifactsIndexSha256 }));
    return;
  }
  if (command === "accept") {
    for (const name of ["candidate", "fixture", "record"]) invariant(options[name], `--${name} is required`);
    const recordFile = path.resolve(options.record);
    await regularFile(recordFile, "acceptance record");
    const record = await readJson(recordFile, "acceptance record");
    const acceptance = await recordAcceptance({
      roundId: options["round-id"],
      candidateId: options.candidate,
      fixtureId: options.fixture,
      repairRound: Number(options["repair-round"] ?? 0),
      record,
    });
    console.log(JSON.stringify({ eventId: acceptance.eventId, artifactSetSha256: acceptance.artifactSetSha256 }));
    return;
  }
  if (command === "score-template") {
    const slot = Number(options["evaluator-slot"]);
    const template = await createScoreTemplate({ roundId: options["round-id"], evaluatorSlot: slot });
    const output = options.out ?? path.join(RUNS_PATH, options["round-id"], `score-template-${slot}.json`);
    await writeExclusive(resolveInside(SCRIPT_ROOT, output), jsonBytes(template));
    console.log(JSON.stringify({ output }));
    return;
  }
  if (command === "unblind") {
    const result = await unblindRound({
      roundId: options["round-id"],
      scoreFiles: options.score.map((file) => resolveInside(SCRIPT_ROOT, file)),
      judgeScoreFile: options.judge ? resolveInside(SCRIPT_ROOT, options.judge) : null,
    });
    console.log(JSON.stringify({ results: result.results.length, evaluators: result.evaluators.length }));
    return;
  }
  const verification = await verifyRound({ roundId: options["round-id"], requireComplete: options.complete });
  console.log(JSON.stringify(verification, null, 2));
  if (!verification.valid) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  cli().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
