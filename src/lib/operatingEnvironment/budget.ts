import { canonicalSha256, computeSelfHash } from "./canonical";
import {
  arrayOf, booleanValue, closedEnum, closedRecord, literalValue, nonEmptyString,
  refine, safeInteger, withSelfHash, type InferValidator, type Validator,
} from "./contracts";
import { failure, success, type ContractPath, type Result } from "./reasonCodes";

const nn = refine(safeInteger(), (value) => value >= 0);
const hash = refine(nonEmptyString(), (value) => /^[a-f0-9]{64}$/.test(value));
const nullable = <T>(validator: Validator<T>): Validator<T | null> =>
  (input: unknown, path: ContractPath = []) => input === null ? success(null) : validator(input, path);
const uniqueStrings = refine(arrayOf(nonEmptyString()), (values) => values.length === new Set(values).size);
const uniqueHashes = refine(arrayOf(hash), (values) => values.length === new Set(values).size);
const scopeType = closedEnum([
  "agency", "project", "assignment", "compare", "segment", "retry", "evaluator", "reviewer",
] as const);
const SCOPE_TYPES = ["agency", "project", "assignment", "compare", "segment", "retry", "evaluator", "reviewer"] as const;
const componentInput = closedRecord({ componentId: nonEmptyString(), unitAmount: nn, maximumOccurrences: nn });
const forecastInput = closedRecord({ schemaVersion: literalValue("worst-case-forecast-input-v1"), components: arrayOf(componentInput) });
const forecastComponent = closedRecord({ componentId: nonEmptyString(), maximumUnits: nn });
const forecast = closedRecord({ schemaVersion: literalValue("cost-forecast-v1"), components: arrayOf(forecastComponent), totalUnits: nn });
const scopeCeiling = closedRecord({ scopeType, scopeId: nonEmptyString(), limit: nn });
const finalEvidence = withSelfHash(closedRecord({
  schemaVersion: literalValue("budget-finalization-evidence-v1"), evidenceId: nonEmptyString(),
  reservationId: nonEmptyString(), evidenceKind: closedEnum(["terminal-usage", "no-dispatch", "owner-reconciliation"] as const),
  terminalReceiptHash: nullable(hash), noDispatchEvidenceHash: nullable(hash),
  ownerAssignmentRef: nullable(nonEmptyString()), ownerEvidenceHash: nullable(hash),
  knownUsageUnits: nn, issuedBy: closedEnum(["one-box-control-plane", "budget-owner"] as const), evidenceHash: hash,
}), "evidenceHash");
const policy = withSelfHash(closedRecord({
  schemaVersion: literalValue("budget-policy-v1"), budgetPolicyId: nonEmptyString(),
  reservationId: nonEmptyString(), fundingClass: literalValue("synthetic"), compareId: nonEmptyString(),
  routeIntentHashes: uniqueHashes, forecastHash: hash, forecastUnits: nn,
  scopeCeilings: arrayOf(scopeCeiling), ownerAssignmentRefs: uniqueStrings,
  acceptedOwnerAssignmentRefs: uniqueStrings, capacityPolicyHash: hash,
  effectiveAtMs: nn, expiresAtMs: nn, killSwitchRef: nonEmptyString(),
  finalizationEvidenceHashes: uniqueHashes, revision: nn, policyHash: hash,
}), "policyHash");
const balance = closedRecord({
  scopeType, scopeId: nonEmptyString(), policyHash: hash, limit: nn, remaining: nn,
  held: nn, settled: nn, released: nn, revision: nn,
});
const portfolio = closedRecord({
  schemaVersion: literalValue("budget-portfolio-v1"), observedAtMs: nn,
  currentOwnerAssignmentRefs: uniqueStrings, killedRefs: uniqueStrings, policy,
  forecast: forecastInput, finalizationEvidence: arrayOf(finalEvidence), balances: arrayOf(balance),
});
const reservation = withSelfHash(closedRecord({
  schemaVersion: literalValue("budget-reservation-v1"), reservationId: nonEmptyString(),
  compareId: nonEmptyString(), policyHash: hash, routeIntentHashes: uniqueHashes,
  forecastUnits: nn, forecastHash: hash, scopeSetHash: hash,
  state: closedEnum(["held", "settled", "released", "reconciliation-hold"] as const),
  revision: nn, settledUnits: nn, releasedUnits: nn, unresolvedUnits: nn,
  finalEvidenceHash: nullable(hash), reservationHash: hash,
}), "reservationHash");
const observation = closedRecord({
  observationId: nonEmptyString(), attemptId: nonEmptyString(),
  source: closedEnum(["fixture", "driver", "provider", "owner"] as const),
  reportedUnits: nn, billingState: closedEnum(["none", "known", "ambiguous"] as const), observedAtMs: nn,
});
const budgetState = closedRecord({
  schemaVersion: literalValue("budget-state-v1"), policy,
  currentOwnerAssignmentRefs: uniqueStrings, killedRefs: uniqueStrings, observedAtMs: nn,
  reservation, balances: arrayOf(balance), finalizationEvidence: arrayOf(finalEvidence),
  observations: arrayOf(observation), dispatchState: closedEnum(["allowed", "killed"] as const),
  breachObservationId: nullable(nonEmptyString()), lastCommandId: nonEmptyString(), lastCommandHash: hash,
});
const scopeRevision = closedRecord({ scopeId: nonEmptyString(), revision: nn });
const reserveCommand = closedRecord({
  schemaVersion: literalValue("budget-reserve-command-v1"), kind: literalValue("reserve"),
  commandId: nonEmptyString(), reservationId: nonEmptyString(), expectedPolicyHash: hash,
  expectedPolicyRevision: nn, expectedScopeRevisions: arrayOf(scopeRevision),
});
const usageCommand = closedRecord({
  schemaVersion: literalValue("budget-usage-command-v1"), kind: literalValue("attach-usage"),
  expectedReservationHash: hash, expectedReservationRevision: nn, observation,
});
const holdCommand = closedRecord({
  schemaVersion: literalValue("budget-hold-command-v1"), kind: literalValue("hold-ambiguous"),
  commandId: nonEmptyString(), observedAtMs: nn, expectedReservationHash: hash,
  expectedReservationRevision: nn, expectedScopeRevisions: arrayOf(scopeRevision),
  reason: closedEnum(["dispatch", "billing", "stop"] as const),
});
const finalizeCommand = closedRecord({
  schemaVersion: literalValue("budget-finalize-command-v1"), kind: literalValue("finalize"),
  commandId: nonEmptyString(), observedAtMs: nn, expectedReservationHash: hash,
  expectedReservationRevision: nn, expectedScopeRevisions: arrayOf(scopeRevision), evidenceHash: hash,
});
const retryGate = closedRecord({
  schemaVersion: literalValue("budget-retry-gate-v1"),
  failureClass: closedEnum(["transient-transport", "transient-rate-limit", "other"] as const),
  billingState: closedEnum(["none", "known", "ambiguous"] as const),
  effectState: closedEnum(["none", "possible", "confirmed"] as const),
  hasUsableOutput: booleanValue(), attemptIndex: nn,
  maxAttempts: refine(nn, (value) => value === 1 || value === 2),
  reservationId: nonEmptyString(), reservationHash: hash, reservationRevision: nn,
  policyHash: hash, observedAtMs: nn, deadlineAtMs: nn,
});

export type WorstCaseComponentV1 = InferValidator<typeof componentInput>;
export type CostForecastV1 = InferValidator<typeof forecast>;
export type BudgetScopeTypeV1 = InferValidator<typeof scopeType>;
export type BudgetPolicyV1 = InferValidator<typeof policy>;
export type BudgetBalanceStateV1 = InferValidator<typeof balance>;
export type BudgetPortfolioV1 = InferValidator<typeof portfolio>;
export type BudgetFinalizationEvidenceV1 = InferValidator<typeof finalEvidence>;
export type BudgetReservationV1 = InferValidator<typeof reservation>;
export type UsageObservationV1 = InferValidator<typeof observation>;
export type BudgetStateV1 = InferValidator<typeof budgetState>;
export type BudgetRetryGateV1 = InferValidator<typeof retryGate>;
export type BudgetReductionV1 = Readonly<{ disposition: "applied" | "attached"; state: BudgetStateV1 }>;

const add = (left: number, right: number): number | undefined => {
  const value = left + right; return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};
const multiply = (left: number, right: number): number | undefined => {
  const value = left * right; return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};
const digest = (value: unknown): string | undefined => {
  const result = canonicalSha256(value); return result.ok ? result.value : undefined;
};
const exact = <T>(left: readonly T[], right: readonly T[]): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);
function authorityCurrent(value: BudgetPolicyV1, owners: readonly string[], killed: readonly string[], now: number): boolean {
  return value.effectiveAtMs <= now && now < value.expiresAtMs && !killed.includes(value.killSwitchRef)
    && value.acceptedOwnerAssignmentRefs.some((owner) => owners.includes(owner));
}
function policyInvariant(value: BudgetPolicyV1): boolean {
  return value.effectiveAtMs < value.expiresAtMs && value.routeIntentHashes.length === 2
    && value.scopeCeilings.length === SCOPE_TYPES.length
    && value.scopeCeilings.every((item, index) => item.scopeType === SCOPE_TYPES[index])
    && value.scopeCeilings.every((item) => item.limit >= value.forecastUnits)
    && new Set(value.scopeCeilings.map((item) => item.scopeId)).size === SCOPE_TYPES.length
    && value.ownerAssignmentRefs.length > 0 && value.acceptedOwnerAssignmentRefs.length > 0
    && value.acceptedOwnerAssignmentRefs.every((owner) => value.ownerAssignmentRefs.includes(owner))
    && value.finalizationEvidenceHashes.length > 0;
}
function balanceInvariant(value: BudgetBalanceStateV1): boolean {
  const used = add(value.held, value.settled);
  return used !== undefined && add(value.remaining, used) === value.limit;
}
function evidenceInvariant(value: BudgetFinalizationEvidenceV1, policyValue: BudgetPolicyV1): boolean {
  if (value.reservationId !== policyValue.reservationId || value.knownUsageUnits > policyValue.forecastUnits) return false;
  if (value.evidenceKind === "terminal-usage") return value.terminalReceiptHash !== null
    && value.noDispatchEvidenceHash === null && value.ownerAssignmentRef === null
    && value.ownerEvidenceHash === null && value.issuedBy === "one-box-control-plane";
  if (value.evidenceKind === "no-dispatch") return value.terminalReceiptHash === null
    && value.noDispatchEvidenceHash !== null && value.ownerAssignmentRef === null
    && value.ownerEvidenceHash === null && value.knownUsageUnits === 0
    && value.issuedBy === "one-box-control-plane";
  return value.terminalReceiptHash !== null && value.noDispatchEvidenceHash === null
    && value.ownerAssignmentRef !== null && value.ownerEvidenceHash !== null
    && value.issuedBy === "budget-owner"
    && policyValue.acceptedOwnerAssignmentRefs.includes(value.ownerAssignmentRef);
}
function balancesMatchPolicy(values: readonly BudgetBalanceStateV1[], policyValue: BudgetPolicyV1): boolean {
  return values.length === policyValue.scopeCeilings.length && values.every((item, index) => {
    const expected = policyValue.scopeCeilings[index];
    return item.scopeType === expected.scopeType && item.scopeId === expected.scopeId
      && item.limit === expected.limit && item.policyHash === policyValue.policyHash && balanceInvariant(item);
  });
}
function evidenceSetMatches(values: readonly BudgetFinalizationEvidenceV1[], policyValue: BudgetPolicyV1): boolean {
  return exact(values.map((item) => item.evidenceHash), policyValue.finalizationEvidenceHashes)
    && values.every((item) => evidenceInvariant(item, policyValue));
}
function portfolioInvariant(value: BudgetPortfolioV1): boolean {
  const computed = computeWorstCaseForecast(value.forecast);
  return policyInvariant(value.policy)
    && authorityCurrent(value.policy, value.currentOwnerAssignmentRefs, value.killedRefs, value.observedAtMs)
    && computed.ok && computed.value.totalUnits === value.policy.forecastUnits
    && digest(value.forecast) === value.policy.forecastHash
    && balancesMatchPolicy(value.balances, value.policy)
    && value.balances.every((item) => item.remaining === item.limit && item.held === 0
      && item.settled === 0 && item.released === 0 && item.revision === 0)
    && evidenceSetMatches(value.finalizationEvidence, value.policy);
}
function reservationInvariant(value: BudgetReservationV1): boolean {
  const accounted = add(value.settledUnits, value.releasedUnits);
  if (accounted === undefined || add(accounted, value.unresolvedUnits) !== value.forecastUnits) return false;
  if (value.state === "held" || value.state === "reconciliation-hold") return value.settledUnits === 0
    && value.releasedUnits === 0 && value.unresolvedUnits === value.forecastUnits && value.finalEvidenceHash === null;
  if (value.state === "released") return value.settledUnits === 0 && value.releasedUnits === value.forecastUnits
    && value.unresolvedUnits === 0 && value.finalEvidenceHash !== null;
  return value.settledUnits > 0 && value.unresolvedUnits === 0 && value.finalEvidenceHash !== null;
}
function reachableBalances(values: readonly BudgetBalanceStateV1[], reservationValue: BudgetReservationV1,
  evidence: BudgetFinalizationEvidenceV1 | undefined): boolean {
  const revision = add(reservationValue.revision, 1); const held = reservationValue.state === "held" || reservationValue.state === "reconciliation-hold";
  const reachableRevision = reservationValue.state === "held" ? reservationValue.revision === 0
    : reservationValue.state === "reconciliation-hold" ? reservationValue.revision === 1
      : reservationValue.revision === 1 || (reservationValue.revision === 2 && evidence?.evidenceKind === "owner-reconciliation");
  return revision !== undefined && reachableRevision && values.every((item) => item.revision === revision
    && (held ? item.remaining === item.limit - reservationValue.forecastUnits && item.held === reservationValue.forecastUnits
      && item.settled === 0 && item.released === 0 : item.remaining === item.limit - reservationValue.settledUnits
      && item.held === 0 && item.settled === reservationValue.settledUnits && item.released === reservationValue.releasedUnits));
}
function totalUsage(values: readonly UsageObservationV1[]): number | undefined {
  let total = 0; for (const item of values) { const next = add(total, item.reportedUnits);
    if (next === undefined) return undefined; total = next; } return total;
}
function commandInvariant(value: BudgetStateV1): boolean {
  if (value.balances.some((item) => !item.revision)) return false; const guards = value.balances.map((item) => ({ scopeId: item.scopeId, revision: item.revision - 1 }));
  if (value.reservation.state === "held") return digest({ schemaVersion: "budget-reserve-command-v1", kind: "reserve", commandId: value.lastCommandId,
    reservationId: value.reservation.reservationId, expectedPolicyHash: value.policy.policyHash, expectedPolicyRevision: value.policy.revision, expectedScopeRevisions: guards }) === value.lastCommandHash;
  const previous = sealReservation({ ...value.reservation, state: value.reservation.revision === 1 ? "held" : "reconciliation-hold",
    revision: value.reservation.revision - 1, settledUnits: 0, releasedUnits: 0, unresolvedUnits: value.reservation.forecastUnits, finalEvidenceHash: null }); if (!previous.ok) return false;
  if (value.reservation.state === "reconciliation-hold") return (["dispatch", "billing", "stop"] as const).some((reason) => digest({ schemaVersion: "budget-hold-command-v1", kind: "hold-ambiguous",
    commandId: value.lastCommandId, observedAtMs: value.observedAtMs, expectedReservationHash: previous.value.reservationHash, expectedReservationRevision: previous.value.revision, expectedScopeRevisions: guards, reason }) === value.lastCommandHash);
  return value.reservation.finalEvidenceHash !== null && digest({ schemaVersion: "budget-finalize-command-v1", kind: "finalize", commandId: value.lastCommandId,
    observedAtMs: value.observedAtMs, expectedReservationHash: previous.value.reservationHash, expectedReservationRevision: previous.value.revision, expectedScopeRevisions: guards, evidenceHash: value.reservation.finalEvidenceHash }) === value.lastCommandHash;
}
function stateInvariant(value: BudgetStateV1): boolean {
  const scopeHash = digest(value.policy.scopeCeilings); const reported = totalUsage(value.observations);
  const breach = value.breachObservationId === null
    ? value.dispatchState === "allowed" && reported !== undefined && reported <= value.reservation.forecastUnits
    : value.dispatchState === "killed" && value.observations.some((item) => item.observationId === value.breachObservationId)
      && (reported === undefined || reported > value.reservation.forecastUnits);
  const evidence = value.finalizationEvidence.find((item) => item.evidenceHash === value.reservation.finalEvidenceHash);
  const terminalEvidence = value.reservation.finalEvidenceHash === null || !!evidence
    && value.reservation.settledUnits === evidence.knownUsageUnits
    && value.reservation.releasedUnits === value.reservation.forecastUnits - evidence.knownUsageUnits
    && (value.dispatchState !== "killed" || evidence.evidenceKind === "owner-reconciliation");
  const held = value.reservation.state === "held" || value.reservation.state === "reconciliation-hold";
  return policyInvariant(value.policy)
    && authorityCurrent(value.policy, value.currentOwnerAssignmentRefs, value.killedRefs, value.observedAtMs)
    && balancesMatchPolicy(value.balances, value.policy) && reachableBalances(value.balances, value.reservation, evidence)
    && evidenceSetMatches(value.finalizationEvidence, value.policy)
    && reservationInvariant(value.reservation) && value.reservation.reservationId === value.policy.reservationId
    && value.reservation.compareId === value.policy.compareId && value.reservation.policyHash === value.policy.policyHash
    && value.reservation.forecastHash === value.policy.forecastHash && value.reservation.forecastUnits === value.policy.forecastUnits
    && exact(value.reservation.routeIntentHashes, value.policy.routeIntentHashes)
    && value.reservation.scopeSetHash === scopeHash && terminalEvidence
    && commandInvariant(value)
    && new Set(value.observations.map((item) => item.observationId)).size === value.observations.length
    && breach && (!held || value.balances.every((item) => item.held >= value.reservation.forecastUnits));
}

export function computeWorstCaseForecast(input: unknown): Result<CostForecastV1> {
  const parsed = forecastInput(input); if (!parsed.ok) return parsed;
  if (!parsed.value.components.length || new Set(parsed.value.components.map((item) => item.componentId)).size !== parsed.value.components.length)
    return failure("INVARIANT_VIOLATION", ["components"]);
  let totalUnits = 0; const components: Array<InferValidator<typeof forecastComponent>> = [];
  const ordered = [...parsed.value.components].sort((a, b) => a.componentId < b.componentId ? -1 : a.componentId > b.componentId ? 1 : 0);
  for (const item of ordered) {
    const maximumUnits = multiply(item.unitAmount, item.maximumOccurrences);
    const next = maximumUnits === undefined ? undefined : add(totalUnits, maximumUnits);
    if (maximumUnits === undefined || next === undefined) return failure("INVALID_SAFE_INTEGER", ["components"]);
    totalUnits = next; components.push(Object.freeze({ componentId: item.componentId, maximumUnits }));
  }
  return forecast({ schemaVersion: "cost-forecast-v1", components: Object.freeze(components), totalUnits });
}
export function validateBudgetPortfolio(input: unknown): Result<BudgetPortfolioV1> {
  const parsed = portfolio(input); return parsed.ok && portfolioInvariant(parsed.value)
    ? parsed : parsed.ok ? failure("INVARIANT_VIOLATION", []) : parsed;
}
export function validateBudgetState(input: unknown): Result<BudgetStateV1> {
  const parsed = budgetState(input); return parsed.ok && stateInvariant(parsed.value)
    ? parsed : parsed.ok ? failure("INVARIANT_VIOLATION", []) : parsed;
}
function revisionsMatch(values: readonly BudgetBalanceStateV1[], guards: readonly InferValidator<typeof scopeRevision>[]): boolean {
  return values.length === guards.length && values.every((item, index) =>
    item.scopeId === guards[index]?.scopeId && item.revision === guards[index]?.revision);
}
function sealReservation(seed: Record<string, unknown>): Result<BudgetReservationV1> {
  const candidate = { ...seed, reservationHash: "0".repeat(64) };
  const result = computeSelfHash(candidate, "reservationHash");
  return result.ok ? reservation({ ...candidate, reservationHash: result.value }) : result;
}
function output(disposition: BudgetReductionV1["disposition"], candidate: unknown): Result<BudgetReductionV1> {
  const parsed = validateBudgetState(candidate);
  return parsed.ok ? success(Object.freeze({ disposition, state: parsed.value })) : parsed;
}
export function reserveBudget(portfolioInput: unknown, commandInput: unknown): Result<BudgetReductionV1> {
  const current = validateBudgetPortfolio(portfolioInput); if (!current.ok) return current;
  const command = reserveCommand(commandInput); if (!command.ok) return command; const commandHash = digest(command.value);
  if (!commandHash) return failure("INVARIANT_VIOLATION", ["commandId"]);
  const policyValue = current.value.policy;
  if (command.value.reservationId !== policyValue.reservationId
    || command.value.expectedPolicyHash !== policyValue.policyHash
    || command.value.expectedPolicyRevision !== policyValue.revision
    || !revisionsMatch(current.value.balances, command.value.expectedScopeRevisions))
    return failure("INVARIANT_VIOLATION", ["policy"]);
  const balances: BudgetBalanceStateV1[] = [];
  for (const item of current.value.balances) {
    const held = add(item.held, policyValue.forecastUnits); const revision = add(item.revision, 1);
    if (item.remaining < policyValue.forecastUnits || held === undefined || revision === undefined)
      return failure("INVARIANT_VIOLATION", ["balances", item.scopeId]);
    balances.push(Object.freeze({ ...item, remaining: item.remaining - policyValue.forecastUnits, held, revision }));
  }
  const reservationValue = sealReservation({ schemaVersion: "budget-reservation-v1",
    reservationId: policyValue.reservationId, compareId: policyValue.compareId, policyHash: policyValue.policyHash,
    routeIntentHashes: policyValue.routeIntentHashes, forecastUnits: policyValue.forecastUnits,
    forecastHash: policyValue.forecastHash, scopeSetHash: digest(policyValue.scopeCeilings), state: "held",
    revision: 0, settledUnits: 0, releasedUnits: 0, unresolvedUnits: policyValue.forecastUnits, finalEvidenceHash: null });
  return reservationValue.ok ? output("applied", { schemaVersion: "budget-state-v1", policy: policyValue,
    currentOwnerAssignmentRefs: current.value.currentOwnerAssignmentRefs, killedRefs: current.value.killedRefs,
    observedAtMs: current.value.observedAtMs, reservation: reservationValue.value, balances,
    finalizationEvidence: current.value.finalizationEvidence, observations: [], dispatchState: "allowed",
    breachObservationId: null, lastCommandId: command.value.commandId, lastCommandHash: commandHash }) : reservationValue;
}

function sameObservation(left: UsageObservationV1, right: UsageObservationV1): boolean {
  return left.observationId === right.observationId && left.attemptId === right.attemptId
    && left.source === right.source && left.reportedUnits === right.reportedUnits
    && left.billingState === right.billingState && left.observedAtMs === right.observedAtMs;
}
function attachUsage(stateValue: BudgetStateV1, command: InferValidator<typeof usageCommand>): Result<BudgetReductionV1> {
  if (command.expectedReservationHash !== stateValue.reservation.reservationHash || command.expectedReservationRevision !== stateValue.reservation.revision) return failure("INVARIANT_VIOLATION", ["reservation"]);
  const prior = stateValue.observations.find((item) => item.observationId === command.observation.observationId);
  if (prior) return sameObservation(prior, command.observation) ? output("attached", stateValue)
    : failure("INVARIANT_VIOLATION", ["observationId"]);
  if (!(["held", "reconciliation-hold"] as const).includes(stateValue.reservation.state as "held"))
    return failure("INVARIANT_VIOLATION", ["reservation"]);
  const observations = Object.freeze([...stateValue.observations, command.observation]);
  const reported = totalUsage(observations); const breached = reported === undefined || reported > stateValue.reservation.forecastUnits;
  return output("attached", { ...stateValue, observations,
    dispatchState: breached || stateValue.dispatchState === "killed" ? "killed" : "allowed",
    breachObservationId: stateValue.breachObservationId ?? (breached ? command.observation.observationId : null) });
}
function holdAmbiguous(stateValue: BudgetStateV1, command: InferValidator<typeof holdCommand>): Result<BudgetReductionV1> {
  const commandHash = digest(command); if (!commandHash) return failure("INVARIANT_VIOLATION", ["commandId"]);
  if (stateValue.reservation.state === "reconciliation-hold") return stateValue.lastCommandId === command.commandId && stateValue.lastCommandHash === commandHash ? output("attached", stateValue) : failure("INVARIANT_VIOLATION", ["commandId"]);
  if (stateValue.reservation.state !== "held" || command.expectedReservationHash !== stateValue.reservation.reservationHash
    || command.expectedReservationRevision !== stateValue.reservation.revision
    || !revisionsMatch(stateValue.balances, command.expectedScopeRevisions)
    || !authorityCurrent(stateValue.policy, stateValue.currentOwnerAssignmentRefs, stateValue.killedRefs, command.observedAtMs))
    return failure("INVARIANT_VIOLATION", ["reservation"]);
  const revision = add(stateValue.reservation.revision, 1);
  const balances = stateValue.balances.map((item) => { const next = add(item.revision, 1);
    return next === undefined ? undefined : Object.freeze({ ...item, revision: next }); });
  if (revision === undefined || balances.some((item) => item === undefined)) return failure("INVALID_SAFE_INTEGER", ["revision"]);
  const nextReservation = sealReservation({ ...stateValue.reservation, state: "reconciliation-hold", revision });
  return nextReservation.ok ? output("applied", { ...stateValue, reservation: nextReservation.value,
    balances, observedAtMs: command.observedAtMs, lastCommandId: command.commandId, lastCommandHash: commandHash }) : nextReservation;
}
function finalize(stateValue: BudgetStateV1, command: InferValidator<typeof finalizeCommand>): Result<BudgetReductionV1> {
  const commandHash = digest(command); if (!commandHash) return failure("INVARIANT_VIOLATION", ["commandId"]);
  const evidence = stateValue.finalizationEvidence.find((item) => item.evidenceHash === command.evidenceHash);
  if (!["held", "reconciliation-hold"].includes(stateValue.reservation.state))
    return stateValue.lastCommandId === command.commandId && stateValue.lastCommandHash === commandHash && stateValue.reservation.finalEvidenceHash === command.evidenceHash
      ? output("attached", stateValue) : failure("INVARIANT_VIOLATION", ["state"]);
  const ownerRequired = stateValue.reservation.state === "reconciliation-hold" || stateValue.dispatchState === "killed";
  if (!evidence || evidence.reservationId !== stateValue.reservation.reservationId
    || (ownerRequired && evidence.evidenceKind !== "owner-reconciliation")
    || command.expectedReservationHash !== stateValue.reservation.reservationHash
    || command.expectedReservationRevision !== stateValue.reservation.revision
    || !revisionsMatch(stateValue.balances, command.expectedScopeRevisions)
    || !authorityCurrent(stateValue.policy, stateValue.currentOwnerAssignmentRefs, stateValue.killedRefs, command.observedAtMs)
    || (evidence.ownerAssignmentRef !== null && !stateValue.currentOwnerAssignmentRefs.includes(evidence.ownerAssignmentRef)))
    return failure("INVARIANT_VIOLATION", ["evidenceHash"]);
  const settledUnits = evidence.knownUsageUnits; const releasedUnits = stateValue.reservation.forecastUnits - settledUnits;
  const balances: BudgetBalanceStateV1[] = [];
  for (const item of stateValue.balances) {
    const remaining = add(item.remaining, releasedUnits); const settled = add(item.settled, settledUnits);
    const released = add(item.released, releasedUnits); const revision = add(item.revision, 1);
    if (item.held < stateValue.reservation.forecastUnits || remaining === undefined || settled === undefined
      || released === undefined || revision === undefined) return failure("INVARIANT_VIOLATION", ["balances", item.scopeId]);
    balances.push(Object.freeze({ ...item, remaining, settled, released,
      held: item.held - stateValue.reservation.forecastUnits, revision }));
  }
  const revision = add(stateValue.reservation.revision, 1); if (revision === undefined) return failure("INVALID_SAFE_INTEGER", ["revision"]);
  const nextReservation = sealReservation({ ...stateValue.reservation,
    state: settledUnits ? "settled" : "released", revision, settledUnits, releasedUnits,
    unresolvedUnits: 0, finalEvidenceHash: evidence.evidenceHash });
  return nextReservation.ok ? output("applied", { ...stateValue, reservation: nextReservation.value,
    balances, observedAtMs: command.observedAtMs, lastCommandId: command.commandId, lastCommandHash: commandHash }) : nextReservation;
}
export function reduceBudget(stateInput: unknown, commandInput: unknown): Result<BudgetReductionV1> {
  const current = validateBudgetState(stateInput); if (!current.ok) return current;
  let kind: unknown;
  try { const descriptor = commandInput !== null && typeof commandInput === "object"
      ? Object.getOwnPropertyDescriptor(commandInput, "kind") : undefined;
    kind = descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch { return failure("UNSUPPORTED_VALUE", []); }
  if (kind === "attach-usage") { const command = usageCommand(commandInput); return command.ok ? attachUsage(current.value, command.value) : command; }
  if (kind === "hold-ambiguous") { const command = holdCommand(commandInput); return command.ok ? holdAmbiguous(current.value, command.value) : command; }
  if (kind === "finalize") { const command = finalizeCommand(commandInput); return command.ok ? finalize(current.value, command.value) : command; }
  return failure("UNSUPPORTED_VALUE", ["kind"]);
}
export function evaluateBudgetRetry(stateInput: unknown, gateInput: unknown): Result<boolean> {
  const current = validateBudgetState(stateInput); if (!current.ok) return current;
  const gate = retryGate(gateInput); if (!gate.ok) return gate;
  const stateValue = current.value; const value = gate.value;
  const retryScope = stateValue.balances.find((item) => item.scopeType === "retry");
  return success(value.reservationId === stateValue.reservation.reservationId
    && value.reservationHash === stateValue.reservation.reservationHash
    && value.reservationRevision === stateValue.reservation.revision && value.policyHash === stateValue.policy.policyHash
    && stateValue.reservation.state === "held" && stateValue.dispatchState === "allowed"
    && stateValue.breachObservationId === null && !stateValue.observations.some((item) => item.billingState === "ambiguous")
    && authorityCurrent(stateValue.policy, stateValue.currentOwnerAssignmentRefs, stateValue.killedRefs, value.observedAtMs)
    && value.observedAtMs < value.deadlineAtMs && retryScope !== undefined
    && retryScope.held >= stateValue.reservation.forecastUnits
    && ["transient-transport", "transient-rate-limit"].includes(value.failureClass)
    && value.billingState === "known" && value.effectState === "none" && !value.hasUsableOutput
    && value.attemptIndex === 0 && value.maxAttempts === 2);
}
