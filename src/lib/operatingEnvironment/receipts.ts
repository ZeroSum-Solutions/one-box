import { computeSelfHash } from "./canonical";
import { arrayOf, closedEnum, closedRecord, literalValue, nonEmptyString, refine, withSelfHash, type InferValidator, type Validator } from "./contracts";
import { failure, success, type ContractPath, type Result } from "./reasonCodes";
import { validateHumanInterrupt, type HumanInterruptV1 } from "./interrupts";
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const hashValue = refine(nonEmptyString(), (value) => HASH_PATTERN.test(value));
const utcTimestamp = refine(nonEmptyString(), (value) => {
  if (!UTC_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    && new Date(milliseconds).toISOString() === value.replace("Z", ".000Z");
});
const nullable = <T>(validator: Validator<T>): Validator<T | null> =>
  (input: unknown, path: ContractPath = []) => input === null ? success(null) : validator(input, path);
const uniqueHashes = refine(arrayOf(hashValue), (values) => values.length === new Set(values).size);
const foundationValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("synthetic-foundation-job-receipt-v1"),
  jobId: nonEmptyString(),
  receiptOwner: literalValue("foundation-job-contract"),
  terminalState: closedEnum(["completed", "failed", "cancelled"] as const),
  outputArtifactHash: nullable(hashValue),
  endedAt: utcTimestamp,
  receiptHash: hashValue,
}), "receiptHash");
const attemptValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("receipt-attempt-evidence-v1"),
  attemptId: nonEmptyString(),
  state: closedEnum(["completed", "failed", "cancelled"] as const),
  outputArtifactHash: nullable(hashValue),
  attemptHash: hashValue,
}), "attemptHash");
const decisionValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("proposal-decision-evidence-v1"),
  interruptHash: hashValue,
  actorId: refine(nonEmptyString(), (value) => value.startsWith("person:")),
  decisionValue: closedEnum(["accept-proposal", "reject", "cancel"] as const),
  decisionHash: hashValue,
}), "decisionHash");
const proposalValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("proposal-envelope-v1"),
  proposalId: nonEmptyString(),
  jobId: nonEmptyString(),
  segmentIntentHash: hashValue,
  segmentManifestHash: hashValue,
  skillInvocationReceiptHash: literalValue(null),
  proposalSchemaHash: hashValue,
  targetProjectId: nonEmptyString(),
  expectedSourceIdentity: nonEmptyString(),
  expectedSourceHash: hashValue,
  effectClass: literalValue("propose"),
  proposalArtifactHash: hashValue,
  createdAt: utcTimestamp,
  expiresAt: utcTimestamp,
  proposalHash: hashValue,
}), "proposalHash");
const routeReceiptValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("route-segment-receipt-v1"),
  jobId: nonEmptyString(),
  segmentId: nonEmptyString(),
  segmentIntentHash: hashValue,
  segmentManifestHash: hashValue,
  finalSegmentStateHash: hashValue,
  routePolicyHash: hashValue,
  contextBundleHash: hashValue,
  skillSetHash: hashValue,
  toolGrantHash: hashValue,
  attemptHashes: uniqueHashes,
  terminalState: closedEnum([
    "completed", "rejected", "failed", "cancelled", "budget-exhausted",
  ] as const),
  outputArtifactHash: nullable(hashValue),
  proposalEnvelopeHash: nullable(hashValue),
  interruptHash: nullable(hashValue),
  decisionHash: nullable(hashValue),
  startedAt: nullable(utcTimestamp),
  endedAt: utcTimestamp,
  receiptHash: hashValue,
}), "receiptHash");
const bundleValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("receipt-bundle-manifest-v1"),
  jobId: nonEmptyString(),
  foundationJobReceiptHash: hashValue,
  routeSegmentReceiptHashes: uniqueHashes,
  skillInvocationReceiptHashes: uniqueHashes,
  contextReceiptHashes: uniqueHashes,
  interruptHashes: uniqueHashes,
  decisionHashes: uniqueHashes,
  proposalEnvelopeHashes: uniqueHashes,
  createdAt: utcTimestamp,
  bundleHash: hashValue,
}), "bundleHash");
const nodeValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("supplemental-receipt-node-v1"),
  kind: closedEnum([
    "route-segment", "skill-invocation", "context", "interrupt", "decision", "proposal",
  ] as const),
  receiptHash: hashValue,
  references: uniqueHashes,
  nodeHash: hashValue,
}), "nodeHash");
const fixtureValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("receipt-security-fixture-v1"),
  foundationReceipt: foundationValidator,
  routeReceipts: arrayOf(routeReceiptValidator),
  attempts: arrayOf(attemptValidator),
  proposalEnvelopes: arrayOf(proposalValidator),
  decisions: arrayOf(decisionValidator),
  bundle: bundleValidator,
  nodes: arrayOf(nodeValidator),
  fixtureHash: hashValue,
}), "fixtureHash");
const terminalInputValidator = closedRecord({
  schemaVersion: literalValue("route-terminal-receipt-input-v1"),
  jobId: nonEmptyString(),
  segmentId: nonEmptyString(),
  segmentIntentHash: hashValue,
  segmentManifestHash: hashValue,
  finalSegmentStateHash: hashValue,
  routePolicyHash: hashValue,
  contextBundleHash: hashValue,
  skillSetHash: hashValue,
  toolGrantHash: hashValue,
  attemptHashes: uniqueHashes,
  routeState: closedEnum(["succeeded", "cancelled"] as const),
  outputArtifactHash: nullable(hashValue),
  proposalEnvelopeHash: nullable(hashValue),
  interruptHash: nullable(hashValue),
  decisionHash: nullable(hashValue),
  startedAt: nullable(utcTimestamp),
  endedAt: utcTimestamp,
});
const reviewRequestValidator = closedRecord({
  schemaVersion: literalValue("proposal-review-request-v1"),
  routeReceiptHash: hashValue,
  proposalHash: hashValue,
  targetProjectId: nonEmptyString(),
  currentSourceIdentity: nonEmptyString(),
  currentSourceHash: hashValue,
  reviewMode: closedEnum(["single", "compare"] as const),
  observedAt: utcTimestamp,
});
const interruptEvidenceValidator: Validator<HumanInterruptV1> = (input, path = []) => {
  const parsed = validateHumanInterrupt(input); return parsed.ok ? parsed
    : failure(parsed.reason, [...path, ...parsed.path]); };
const completionEvidenceValidator = closedRecord({
  schemaVersion: literalValue("route-completion-evidence-v1"), proposal: proposalValidator,
  interrupt: interruptEvidenceValidator, decision: decisionValidator,
});
export type SyntheticFoundationReceiptV1 = InferValidator<typeof foundationValidator>;
export type ReceiptAttemptEvidenceV1 = InferValidator<typeof attemptValidator>;
export type ProposalDecisionEvidenceV1 = InferValidator<typeof decisionValidator>;
export type ProposalEnvelopeV1 = InferValidator<typeof proposalValidator>;
export type RouteSegmentReceiptV1 = InferValidator<typeof routeReceiptValidator>;
export type ReceiptBundleManifestV1 = InferValidator<typeof bundleValidator>;
export type SupplementalReceiptNodeV1 = InferValidator<typeof nodeValidator>;
export type ReceiptSecurityFixtureV1 = InferValidator<typeof fixtureValidator>;
export type RouteTerminalReceiptInputV1 = InferValidator<typeof terminalInputValidator>;
export type ProposalReviewV1 = Readonly<{
  reviewable: boolean;
  reason: "stale-target" | "route-not-completed" | "route-proposal-mismatch" | "compare-not-reviewable" | null;
  routeReceiptHash: string;
  proposalHash: string;
  effectDirective: "none";
}>;
function attemptInvariant(attempt: ReceiptAttemptEvidenceV1): boolean {
  return attempt.state === "completed" ? attempt.outputArtifactHash !== null
    : attempt.outputArtifactHash === null;
}
function proposalInvariant(proposal: ProposalEnvelopeV1): boolean {
  return Date.parse(proposal.createdAt) < Date.parse(proposal.expiresAt);
}
function routeShapeInvariant(receipt: RouteSegmentReceiptV1): boolean {
  const isCompleted = receipt.terminalState === "completed";
  const hasCompletedFields = receipt.attemptHashes.length > 0
    && receipt.outputArtifactHash !== null
    && receipt.proposalEnvelopeHash !== null
    && receipt.interruptHash !== null
    && receipt.decisionHash !== null
    && receipt.startedAt !== null;
  const hasForbiddenFields = receipt.outputArtifactHash !== null
    || receipt.proposalEnvelopeHash !== null
    || receipt.interruptHash !== null
    || receipt.decisionHash !== null;
  if (receipt.startedAt !== null && Date.parse(receipt.startedAt) > Date.parse(receipt.endedAt)) {
    return false;
  }
  return isCompleted ? hasCompletedFields : !hasForbiddenFields;
}
function unique(values: readonly string[]): boolean {
  return values.length === new Set(values).size;
}
function exact(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
const ALLOWED_EDGES: Readonly<Record<SupplementalReceiptNodeV1["kind"], ReadonlySet<SupplementalReceiptNodeV1["kind"]>>> = {
  "route-segment": new Set(["skill-invocation", "context", "interrupt", "decision", "proposal"]),
  "skill-invocation": new Set(["skill-invocation"]),
  context: new Set(),
  interrupt: new Set(["proposal"]),
  decision: new Set(["interrupt"]),
  proposal: new Set(["skill-invocation"]),
};
function graphIsAcyclic(nodes: readonly SupplementalReceiptNodeV1[]): boolean {
  const byHash = new Map(nodes.map((node) => [node.receiptHash, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (hash: string): boolean => {
    if (visiting.has(hash)) return false;
    if (visited.has(hash)) return true;
    const node = byHash.get(hash);
    if (!node) return false;
    visiting.add(hash);
    for (const reference of node.references) {
      const target = byHash.get(reference);
      if (!target || !ALLOWED_EDGES[node.kind].has(target.kind) || !visit(reference)) return false;
    }
    visiting.delete(hash);
    visited.add(hash);
    return true;
  };
  return nodes.every((node) => visit(node.receiptHash));
}
function routeEvidenceIsValid(
  fixture: ReceiptSecurityFixtureV1,
  receipt: RouteSegmentReceiptV1,
): boolean {
  if (!routeShapeInvariant(receipt) || receipt.jobId !== fixture.foundationReceipt.jobId) return false;
  const attempts = receipt.attemptHashes.map(
    (hash) => fixture.attempts.find((attempt) => attempt.attemptHash === hash),
  );
  if (attempts.some((attempt) => !attempt || !attemptInvariant(attempt))) return false;
  if (receipt.terminalState !== "completed") return true;
  const completed = attempts.findLast((attempt) => attempt?.state === "completed");
  const proposal = fixture.proposalEnvelopes.find(
    (item) => item.proposalHash === receipt.proposalEnvelopeHash,
  );
  const decision = fixture.decisions.find((item) => item.decisionHash === receipt.decisionHash);
  return completed?.outputArtifactHash === receipt.outputArtifactHash
    && proposal !== undefined && proposalInvariant(proposal)
    && proposal.jobId === receipt.jobId
    && proposal.segmentIntentHash === receipt.segmentIntentHash
    && proposal.segmentManifestHash === receipt.segmentManifestHash
    && proposal.proposalArtifactHash === receipt.outputArtifactHash
    && decision?.interruptHash === receipt.interruptHash
    && decision.decisionValue === "accept-proposal";
}
function bundleNodesAreExact(fixture: ReceiptSecurityFixtureV1): boolean {
  const hashes = (kind: SupplementalReceiptNodeV1["kind"]) => fixture.nodes
    .filter((node) => node.kind === kind).map((node) => node.receiptHash);
  return exact(fixture.bundle.routeSegmentReceiptHashes, hashes("route-segment"))
    && exact(fixture.bundle.skillInvocationReceiptHashes, hashes("skill-invocation"))
    && exact(fixture.bundle.contextReceiptHashes, hashes("context"))
    && exact(fixture.bundle.interruptHashes, hashes("interrupt"))
    && exact(fixture.bundle.decisionHashes, hashes("decision"))
    && exact(fixture.bundle.proposalEnvelopeHashes, hashes("proposal"));
}
function fixtureInvariant(fixture: ReceiptSecurityFixtureV1): boolean {
  const recordHashes = fixture.nodes.map((node) => node.receiptHash);
  if (fixture.bundle.jobId !== fixture.foundationReceipt.jobId
    || fixture.bundle.foundationJobReceiptHash !== fixture.foundationReceipt.receiptHash
    || recordHashes.includes(fixture.foundationReceipt.receiptHash)
    || !unique(recordHashes)
    || !unique(fixture.nodes.map((node) => node.nodeHash))
    || !unique(fixture.routeReceipts.map((receipt) => receipt.receiptHash))
    || !unique(fixture.attempts.map((attempt) => attempt.attemptHash))
    || !unique(fixture.proposalEnvelopes.map((proposal) => proposal.proposalHash))
    || !unique(fixture.decisions.map((decision) => decision.decisionHash))) return false;
  if (!fixture.attempts.every(attemptInvariant)
    || !fixture.proposalEnvelopes.every(proposalInvariant)
    || !fixture.routeReceipts.every((receipt) => routeEvidenceIsValid(fixture, receipt))) return false;
  if (!exact(fixture.bundle.routeSegmentReceiptHashes,
    fixture.routeReceipts.map((receipt) => receipt.receiptHash))
    || !exact(fixture.bundle.proposalEnvelopeHashes,
      fixture.proposalEnvelopes.map((proposal) => proposal.proposalHash))
    || !exact(fixture.bundle.decisionHashes,
      fixture.decisions.map((decision) => decision.decisionHash))) return false;
  return bundleNodesAreExact(fixture) && graphIsAcyclic(fixture.nodes);
}
export function validateReceiptSecurityFixture(input: unknown): Result<ReceiptSecurityFixtureV1> {
  const parsed = fixtureValidator(input);
  if (!parsed.ok) return parsed;
  return fixtureInvariant(parsed.value)
    ? parsed
    : failure("INVARIANT_VIOLATION", ["fixture"]);
}
export function projectRouteTerminalState(input: unknown): Result<"completed" | "cancelled"> {
  if (input === "succeeded") return success("completed");
  if (input === "cancelled") return success("cancelled");
  return failure("UNSUPPORTED_VALUE", ["routeState"]);
}
function sealRouteReceipt(value: Record<string, unknown>): Result<RouteSegmentReceiptV1> {
  const candidate = { ...value, receiptHash: "0".repeat(64) };
  const hash = computeSelfHash(candidate, "receiptHash");
  if (!hash.ok) return hash;
  const parsed = routeReceiptValidator({ ...candidate, receiptHash: hash.value });
  if (!parsed.ok) return parsed;
  return routeShapeInvariant(parsed.value)
    ? parsed
    : failure("INVARIANT_VIOLATION", ["terminalState"]);
}
function completionEvidenceMatches(
  input: RouteTerminalReceiptInputV1,
  attempt: ReceiptAttemptEvidenceV1 | undefined,
  evidence: InferValidator<typeof completionEvidenceValidator>,
): boolean {
  const { proposal, interrupt, decision } = evidence;
  return attempt !== undefined && proposalInvariant(proposal)
    && proposal.proposalHash === input.proposalEnvelopeHash && proposal.jobId === input.jobId
    && proposal.segmentIntentHash === input.segmentIntentHash
    && proposal.segmentManifestHash === input.segmentManifestHash
    && proposal.proposalArtifactHash === input.outputArtifactHash
    && interrupt.interruptHash === input.interruptHash && interrupt.jobId === input.jobId
    && interrupt.segmentId === input.segmentId && interrupt.intentHash === input.segmentIntentHash
    && interrupt.segmentManifestHash === input.segmentManifestHash
    && interrupt.completedAttemptHash === attempt.attemptHash
    && interrupt.proposalEnvelopeHash === proposal.proposalHash
    && decision.decisionHash === input.decisionHash
    && decision.interruptHash === interrupt.interruptHash
    && decision.decisionValue === "accept-proposal"
    && Date.parse(proposal.createdAt) <= Date.parse(interrupt.createdAt);
}
export function createTerminalRouteReceipt(
  input: unknown,
  attemptsInput: unknown,
  completionEvidenceInput: unknown | null = null,
): Result<RouteSegmentReceiptV1> {
  const parsed = terminalInputValidator(input);
  if (!parsed.ok) return parsed;
  const attempts = arrayOf(attemptValidator)(attemptsInput);
  if (!attempts.ok) return attempts;
  if (!attempts.value.every(attemptInvariant)
    || !exact(parsed.value.attemptHashes, attempts.value.map((attempt) => attempt.attemptHash))) {
    return failure("INVARIANT_VIOLATION", ["attemptHashes"]);
  }
  const projected = projectRouteTerminalState(parsed.value.routeState);
  if (!projected.ok) return projected;
  const completedAttempt = attempts.value.findLast((attempt) => attempt.state === "completed");
  if (projected.value === "completed") {
    if (completedAttempt?.outputArtifactHash !== parsed.value.outputArtifactHash) {
      return failure("INVARIANT_VIOLATION", ["attemptHashes"]);
    }
    const evidence = completionEvidenceValidator(completionEvidenceInput);
    if (!evidence.ok) return evidence;
    if (!completionEvidenceMatches(parsed.value, completedAttempt, evidence.value)) {
      return failure("INVARIANT_VIOLATION", ["completionEvidence"]);
    }
  } else if (completionEvidenceInput !== null) {
    return failure("INVARIANT_VIOLATION", ["completionEvidence"]);
  }
  const receipt = Object.fromEntries(Object.entries(parsed.value)
    .filter(([key]) => key !== "routeState" && key !== "schemaVersion"));
  return sealRouteReceipt({
    ...receipt, schemaVersion: "route-segment-receipt-v1", terminalState: projected.value,
  });
}
function reviewResult(
  reviewable: boolean,
  reason: ProposalReviewV1["reason"],
  routeReceiptHash: string,
  proposalHash: string,
): Result<ProposalReviewV1> {
  return success(Object.freeze({
    reviewable, reason, routeReceiptHash, proposalHash, effectDirective: "none",
  }));
}
export function reviewProposal(
  fixtureInput: unknown,
  requestInput: unknown,
): Result<ProposalReviewV1> {
  const fixture = validateReceiptSecurityFixture(fixtureInput);
  if (!fixture.ok) return fixture;
  const request = reviewRequestValidator(requestInput);
  if (!request.ok) return request;
  const route = fixture.value.routeReceipts.find(
    (receipt) => receipt.receiptHash === request.value.routeReceiptHash,
  );
  const proposal = fixture.value.proposalEnvelopes.find(
    (item) => item.proposalHash === request.value.proposalHash,
  );
  if (!route || !proposal) return failure("INVARIANT_VIOLATION", ["receipt"]);
  if (request.value.reviewMode === "compare") {
    return reviewResult(false, "compare-not-reviewable", route.receiptHash, proposal.proposalHash);
  }
  if (route.terminalState !== "completed") {
    return reviewResult(false, "route-not-completed", route.receiptHash, proposal.proposalHash);
  }
  if (route.proposalEnvelopeHash !== proposal.proposalHash) {
    return reviewResult(false, "route-proposal-mismatch", route.receiptHash, proposal.proposalHash);
  }
  const isStale = proposal.targetProjectId !== request.value.targetProjectId
    || proposal.expectedSourceIdentity !== request.value.currentSourceIdentity
    || proposal.expectedSourceHash !== request.value.currentSourceHash
    || Date.parse(request.value.observedAt) < Date.parse(proposal.createdAt)
    || Date.parse(request.value.observedAt) >= Date.parse(proposal.expiresAt);
  return isStale
    ? reviewResult(false, "stale-target", route.receiptHash, proposal.proposalHash)
    : reviewResult(true, null, route.receiptHash, proposal.proposalHash);
}
