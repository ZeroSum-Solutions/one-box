import { computeSelfHash } from "./canonical";
import {
  arrayOf,
  closedEnum,
  closedRecord,
  literalValue,
  nonEmptyString,
  refine,
  safeInteger,
  withSelfHash,
  type InferValidator,
  type Validator,
} from "./contracts";
import { failure, success, type ContractPath, type Result } from "./reasonCodes";
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const hashValue = refine(nonEmptyString(), (value) => HASH_PATTERN.test(value));
const utcTimestamp = refine(nonEmptyString(), (value) => {
  if (!UTC_PATTERN.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value.replace("Z", ".000Z");
});
const maxAttempts = refine(safeInteger(), (value) => value === 1 || value === 2);
const attemptIndex = refine(safeInteger(), (value) => value === 0 || value === 1);
const revision = refine(safeInteger(), (value) => value >= 0);
const nullable = <T>(validator: Validator<T>): Validator<T | null> =>
  (input: unknown, path: ContractPath = []) => input === null ? success(null) : validator(input, path);
const intentValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("route-segment-intent-v1"), segmentId: nonEmptyString(),
  inputHash: hashValue, routePolicyHash: hashValue, budgetReservationHash: hashValue,
  deadlineAt: utcTimestamp, maxAttempts,
  selfHash: hashValue,
}), "selfHash");
const manifestValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("route-segment-manifest-v1"), segmentId: nonEmptyString(),
  intentHash: hashValue, routePolicyHash: hashValue, providerHash: hashValue,
  modelHash: hashValue, inputHash: hashValue, maxAttempts,
  selfHash: hashValue,
}), "selfHash");
const failureClass = closedEnum([
  "transient-transport", "transient-rate-limit", "authentication", "authorization",
  "policy", "identity", "region", "data", "price", "budget", "schema", "cancelled",
  "ambiguous-billing", "content", "transient-retry-consumed",
] as const);
const attemptValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("route-attempt-v1"), attemptId: nonEmptyString(),
  segmentId: nonEmptyString(), index: attemptIndex,
  state: closedEnum(["active", "succeeded", "retryable-failure", "failed", "cancelled"] as const),
  routePolicyHash: hashValue, inputHash: hashValue, maxAttempts, revision,
  outputHash: nullable(hashValue), failureClass: nullable(failureClass),
  billingState: closedEnum(["none", "known", "ambiguous"] as const),
  receiptHash: nullable(hashValue), lastEventHash: nullable(hashValue), selfHash: hashValue,
}), "selfHash");
const interruptValidator = closedRecord({
  proposalHash: hashValue, expectedStateHash: hashValue, decisionHash: hashValue,
  reservationEvidenceHash: hashValue,
});
const segmentStateValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("route-segment-state-v1"), segmentId: nonEmptyString(),
  state: closedEnum([
    "draft", "validated", "reserved", "active", "interrupted", "succeeded", "failed", "cancelled",
  ] as const),
  revision, intent: intentValidator, manifest: nullable(manifestValidator),
  reservationEvidenceHash: nullable(hashValue),
  attempts: arrayOf(attemptValidator), interrupt: nullable(interruptValidator),
  receiptHash: nullable(hashValue), lastEventHash: nullable(hashValue), selfHash: hashValue,
}), "selfHash");
const fixtureValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("route-state-fixture-v1"),
  states: closedRecord({
    draft: segmentStateValidator, validated: segmentStateValidator,
    reserved: segmentStateValidator, active: segmentStateValidator,
    proposalReady: segmentStateValidator, interrupted: segmentStateValidator,
    terminal: segmentStateValidator,
  }),
  attempts: closedRecord({
    active: attemptValidator, succeeded: attemptValidator, retryable: attemptValidator,
    retry: attemptValidator, cancelled: attemptValidator, consumed: attemptValidator,
    retryClaimed: attemptValidator,
  }),
  selfHash: hashValue,
}), "selfHash");
export type RouteSegmentIntentV1 = InferValidator<typeof intentValidator>;
export type RouteSegmentManifestV1 = InferValidator<typeof manifestValidator>;
export type RouteAttemptV1 = InferValidator<typeof attemptValidator>;
export type RouteSegmentStateV1 = InferValidator<typeof segmentStateValidator>;
export type RouteStateFixtureV1 = InferValidator<typeof fixtureValidator>;
export type SegmentReductionV1 = Readonly<{
  disposition: "applied" | "attached" | "quarantined";
  state: RouteSegmentStateV1;
}>;
export type AttemptReductionV1 = Readonly<{
  disposition: "applied" | "attached";
  attempt: RouteAttemptV1;
  retryAttempt: RouteAttemptV1;
}>;
const validateEvent = withSelfHash(closedRecord({
  kind: literalValue("validate"), expectedRevision: revision, eventHash: hashValue,
  manifest: manifestValidator,
}), "eventHash");
const reserveEvent = withSelfHash(closedRecord({
  kind: literalValue("reserve"), expectedRevision: revision, eventHash: hashValue,
  reservationEvidenceHash: hashValue,
}), "eventHash");
const activateEvent = withSelfHash(closedRecord({
  kind: literalValue("activate"), expectedRevision: revision, eventHash: hashValue,
  attempt: attemptValidator,
}), "eventHash");
const cancelEvent = withSelfHash(closedRecord({
  kind: literalValue("cancel"), expectedRevision: revision, eventHash: hashValue,
  reason: closedEnum(["route-switch", "operator-cancel"] as const), receiptHash: hashValue,
}), "eventHash");
const observeOutputEvent = withSelfHash(closedRecord({
  kind: literalValue("observe-output"), expectedRevision: revision, eventHash: hashValue,
  attemptId: nonEmptyString(), outputHash: hashValue,
}), "eventHash");
const proposalInterruptEvent = withSelfHash(closedRecord({
  kind: literalValue("proposal-interrupt"), expectedRevision: revision, eventHash: hashValue,
  proposalHash: hashValue, expectedStateHash: hashValue, decisionHash: hashValue,
  reservationEvidenceHash: hashValue, proposalStatus: literalValue("validated-unapplied"),
  decision: closedEnum(["accepted", "rejected", "expired", "revoked"] as const),
  hasLiveWork: literalValue(false),
}), "eventHash");
const claimRetryEvent = withSelfHash(closedRecord({
  kind: literalValue("claim-retry"), expectedRevision: revision, eventHash: hashValue,
  retryAttempt: attemptValidator, deadlineEvidenceHash: hashValue, policyEvidenceHash: hashValue,
  hasUsableOutput: literalValue(false),
}), "eventHash");
type SegmentEventV1 = InferValidator<typeof validateEvent>
  | InferValidator<typeof reserveEvent>
  | InferValidator<typeof activateEvent>
  | InferValidator<typeof cancelEvent>
  | InferValidator<typeof observeOutputEvent>
  | InferValidator<typeof proposalInterruptEvent>;
function parseSegmentEvent(input: unknown): Result<SegmentEventV1> {
  if (input === null || typeof input !== "object") return failure("INVALID_TYPE", []);
  switch ((input as { kind?: unknown }).kind) {
    case "validate": return validateEvent(input);
    case "reserve": return reserveEvent(input);
    case "activate": return activateEvent(input);
    case "cancel": return cancelEvent(input);
    case "observe-output": return observeOutputEvent(input);
    case "proposal-interrupt": return proposalInterruptEvent(input);
    default: return failure("UNSUPPORTED_VALUE", ["kind"]);
  }
}
function attemptInvariant(attempt: RouteAttemptV1): boolean {
  if (attempt.index >= attempt.maxAttempts) return false;
  if (attempt.state === "active") {
    return attempt.outputHash === null && attempt.failureClass === null && attempt.billingState === "none"
      && attempt.receiptHash === null;
  }
  if (attempt.state === "succeeded") {
    return attempt.outputHash !== null && attempt.failureClass === null && attempt.billingState === "known"
      && attempt.receiptHash !== null;
  }
  if (attempt.state === "retryable-failure") {
    return attempt.outputHash === null && ["transient-transport", "transient-rate-limit"].includes(attempt.failureClass ?? "")
      && attempt.billingState === "known" && attempt.receiptHash !== null;
  }
  return attempt.outputHash === null && attempt.failureClass !== null && attempt.receiptHash !== null;
}
function manifestBindsIntent(state: RouteSegmentStateV1): boolean {
  const { intent, manifest } = state;
  if (intent.segmentId !== state.segmentId) return false;
  if (!manifest) return state.state === "draft";
  return manifest.segmentId === state.segmentId && manifest.intentHash === intent.selfHash
    && manifest.routePolicyHash === intent.routePolicyHash && manifest.inputHash === intent.inputHash
    && manifest.maxAttempts === intent.maxAttempts;
}
function attemptsBindManifest(state: RouteSegmentStateV1): boolean {
  return state.attempts.every((attempt) => attemptInvariant(attempt)
    && attempt.segmentId === state.segmentId && attempt.routePolicyHash === state.manifest?.routePolicyHash
    && attempt.inputHash === state.intent.inputHash && attempt.maxAttempts === state.intent.maxAttempts);
}
function segmentInvariant(state: RouteSegmentStateV1): boolean {
  if (!manifestBindsIntent(state) || !attemptsBindManifest(state)) return false;
  const hasManifest = state.manifest !== null;
  const hasReservation = state.reservationEvidenceHash !== null;
  const isTerminal = ["succeeded", "failed", "cancelled"].includes(state.state);
  if (state.state === "draft") {
    return state.revision === 0 && !hasManifest && !hasReservation
      && state.attempts.length === 0 && state.interrupt === null
      && state.receiptHash === null && state.lastEventHash === null;
  }
  if (state.state === "validated") {
    return hasManifest && !hasReservation && state.attempts.length === 0 && state.interrupt === null
      && state.receiptHash === null && state.lastEventHash !== null;
  }
  if (state.state === "reserved") {
    return hasManifest && hasReservation && state.attempts.length === 0 && state.interrupt === null
      && state.receiptHash === null;
  }
  if (state.state === "active") {
    return hasManifest && hasReservation && state.attempts.length > 0
      && state.interrupt === null && state.receiptHash === null;
  }
  if (state.state === "interrupted") {
    return hasManifest && hasReservation && state.interrupt !== null && state.receiptHash !== null
      && state.interrupt.reservationEvidenceHash === state.reservationEvidenceHash
      && state.interrupt.decisionHash === state.receiptHash
      && state.attempts.some((attempt) => attempt.state === "succeeded")
      && state.attempts.every((attempt) => ["succeeded", "failed", "cancelled"].includes(attempt.state));
  }
  return isTerminal && hasManifest && hasReservation && state.interrupt === null && state.receiptHash !== null
    && state.attempts.every((attempt) => ["succeeded", "failed", "cancelled"].includes(attempt.state));
}
function stateFailure(state: RouteSegmentStateV1): ReturnType<typeof failure> | undefined {
  return segmentInvariant(state) ? undefined : failure("INVARIANT_VIOLATION", ["state"]);
}
export function validateRouteStateFixture(input: unknown): Result<RouteStateFixtureV1> {
  const parsed = fixtureValidator(input);
  if (!parsed.ok) return parsed;
  if (Object.values(parsed.value.states).some((state) => !segmentInvariant(state))
    || Object.values(parsed.value.attempts).some((item) => !attemptInvariant(item))) {
    return failure("INVARIANT_VIOLATION", []);
  }
  return success(parsed.value);
}
function sealAttempt(candidate: RouteAttemptV1): Result<RouteAttemptV1> {
  const hash = computeSelfHash(candidate, "selfHash");
  return hash.ok ? attemptValidator({ ...candidate, selfHash: hash.value }) : hash;
}
function sealState(candidate: RouteSegmentStateV1): Result<RouteSegmentStateV1> {
  const hash = computeSelfHash(candidate, "selfHash");
  if (!hash.ok) return hash;
  const parsed = segmentStateValidator({ ...candidate, selfHash: hash.value });
  if (!parsed.ok) return parsed;
  return stateFailure(parsed.value) ?? success(parsed.value);
}
function applied(candidate: RouteSegmentStateV1): Result<SegmentReductionV1> {
  const state = sealState(candidate);
  return state.ok ? success(Object.freeze({ disposition: "applied", state: state.value })) : state;
}
function applyCancel(
  state: RouteSegmentStateV1,
  event: InferValidator<typeof cancelEvent>,
): Result<SegmentReductionV1> {
  if (state.state !== "active") return failure("UNSUPPORTED_VALUE", ["state"]);
  const attempts: RouteAttemptV1[] = [];
  for (const attempt of state.attempts) {
    if (["succeeded", "failed", "cancelled"].includes(attempt.state)) {
      attempts.push(attempt);
      continue;
    }
    const cancelled = sealAttempt({
      ...attempt,
      state: "cancelled",
      revision: attempt.revision + 1,
      failureClass: "cancelled",
      receiptHash: event.receiptHash,
      lastEventHash: event.eventHash,
    });
    if (!cancelled.ok) return cancelled;
    attempts.push(cancelled.value);
  }
  return applied({
    ...state,
    state: "cancelled",
    revision: state.revision + 1,
    attempts,
    receiptHash: event.receiptHash,
    lastEventHash: event.eventHash,
  });
}
function applyProposalInterrupt(
  state: RouteSegmentStateV1,
  event: InferValidator<typeof proposalInterruptEvent>,
): Result<SegmentReductionV1> {
  if (state.state !== "active" || !state.reservationEvidenceHash) {
    return failure("UNSUPPORTED_VALUE", ["state"]);
  }
  const isSettled = state.attempts.some((attempt) => attempt.state === "succeeded")
    && state.attempts.every((attempt) => ["succeeded", "failed", "cancelled"].includes(attempt.state));
  if (!isSettled) return failure("INVARIANT_VIOLATION", ["attempts"]);
  const isAccepted = event.decision === "accepted"
    && event.expectedStateHash === state.selfHash
    && event.reservationEvidenceHash === state.reservationEvidenceHash;
  if (!isAccepted) {
    return applied({ ...state, state: "cancelled", revision: state.revision + 1,
      receiptHash: event.decisionHash, lastEventHash: event.eventHash });
  }
  return applied({
    ...state,
    state: "interrupted",
    revision: state.revision + 1,
    interrupt: {
      proposalHash: event.proposalHash,
      expectedStateHash: event.expectedStateHash,
      decisionHash: event.decisionHash,
      reservationEvidenceHash: event.reservationEvidenceHash,
    },
    receiptHash: event.decisionHash,
    lastEventHash: event.eventHash,
  });
}
function applySegmentEvent(
  state: RouteSegmentStateV1,
  event: SegmentEventV1,
): Result<SegmentReductionV1> {
  if (event.kind === "observe-output") {
    const attempt = state.attempts.find((item) => item.attemptId === event.attemptId);
    const isExact = state.state === "active" && attempt?.state === "succeeded"
      && attempt.outputHash === event.outputHash;
    return success(Object.freeze({
      disposition: isExact ? "attached" : "quarantined",
      state,
    }));
  }
  if (event.kind === "proposal-interrupt") return applyProposalInterrupt(state, event);
  if (["interrupted", "succeeded", "failed", "cancelled"].includes(state.state)) {
    return failure("UNSUPPORTED_VALUE", ["state"]);
  }
  if (event.kind === "validate" && state.state === "draft") {
    return applied({ ...state, state: "validated", revision: state.revision + 1,
      manifest: event.manifest,
      lastEventHash: event.eventHash });
  }
  if (event.kind === "reserve" && state.state === "validated") {
    return applied({ ...state, state: "reserved", revision: state.revision + 1,
      reservationEvidenceHash: event.reservationEvidenceHash, lastEventHash: event.eventHash });
  }
  if (event.kind === "activate" && state.state === "reserved") {
    return applied({ ...state, state: "active", revision: state.revision + 1,
      attempts: [event.attempt], lastEventHash: event.eventHash });
  }
  if (event.kind === "cancel") return applyCancel(state, event);
  return failure("UNSUPPORTED_VALUE", ["kind"]);
}
export function reduceSegment(stateInput: unknown, eventInput: unknown): Result<SegmentReductionV1> {
  const state = segmentStateValidator(stateInput);
  if (!state.ok) return state;
  const invariantFailure = stateFailure(state.value);
  if (invariantFailure) return invariantFailure;
  const event = parseSegmentEvent(eventInput);
  if (!event.ok) return event;
  if (event.value.expectedRevision === state.value.revision - 1
    && event.value.eventHash === state.value.lastEventHash) {
    return success(Object.freeze({ disposition: "attached", state: state.value }));
  }
  if (event.value.expectedRevision !== state.value.revision) {
    return failure("INVARIANT_VIOLATION", ["expectedRevision"]);
  }
  return applySegmentEvent(state.value, event.value);
}
function claimedRetry(
  event: InferValidator<typeof claimRetryEvent>,
): Result<RouteAttemptV1> {
  return sealAttempt({ ...event.retryAttempt, lastEventHash: event.eventHash });
}
function retryBindingsMatch(
  attempt: RouteAttemptV1,
  event: InferValidator<typeof claimRetryEvent>,
): boolean {
  const retry = event.retryAttempt;
  return attempt.state === "retryable-failure" && attempt.index === 0
    && attempt.maxAttempts === 2 && attempt.billingState === "known"
    && attempt.outputHash === null
    && ["transient-transport", "transient-rate-limit"].includes(attempt.failureClass ?? "")
    && retry.index === 1 && retry.state === "active" && retry.revision === 0
    && retry.lastEventHash === null && retry.segmentId === attempt.segmentId
    && retry.routePolicyHash === attempt.routePolicyHash && retry.inputHash === attempt.inputHash
    && retry.maxAttempts === attempt.maxAttempts;
}
function retryReduction(
  disposition: AttemptReductionV1["disposition"],
  attempt: RouteAttemptV1,
  event: InferValidator<typeof claimRetryEvent>,
): Result<AttemptReductionV1> {
  const retry = claimedRetry(event);
  return retry.ok
    ? success(Object.freeze({ disposition, attempt, retryAttempt: retry.value }))
    : retry;
}
export function reduceAttempt(attemptInput: unknown, eventInput: unknown): Result<AttemptReductionV1> {
  const attempt = attemptValidator(attemptInput);
  if (!attempt.ok || !attemptInvariant(attempt.value)) {
    return attempt.ok ? failure("INVARIANT_VIOLATION", ["attempt"]) : attempt;
  }
  const event = claimRetryEvent(eventInput);
  if (!event.ok) return event;
  if (event.value.expectedRevision === attempt.value.revision - 1
    && event.value.eventHash === attempt.value.lastEventHash
    && attempt.value.failureClass === "transient-retry-consumed") {
    return retryReduction("attached", attempt.value, event.value);
  }
  if (event.value.expectedRevision !== attempt.value.revision
    || !retryBindingsMatch(attempt.value, event.value)) {
    return failure("INVARIANT_VIOLATION", ["expectedRevision"]);
  }
  const consumed = sealAttempt({
    ...attempt.value,
    state: "failed",
    revision: attempt.value.revision + 1,
    failureClass: "transient-retry-consumed",
    lastEventHash: event.value.eventHash,
  });
  return consumed.ok ? retryReduction("applied", consumed.value, event.value) : consumed;
}
