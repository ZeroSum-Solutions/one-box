import { canonicalize, canonicalSha256, computeSelfHash, parseCanonicalJson } from "./canonical";
import { arrayOf, closedEnum, closedRecord, literalValue, nonEmptyString, refine, safeInteger, withSelfHash, type InferValidator, type Validator } from "./contracts";
import { failure, success, type ContractPath, type Result } from "./reasonCodes";
const nn = refine(safeInteger(), (value) => value >= 0);
const positive = refine(safeInteger(), (value) => value > 0);
const hash = refine(nonEmptyString(), (value) => /^[a-f0-9]{64}$/.test(value));
const nullable = <T>(validator: Validator<T>): Validator<T | null> => (input: unknown, path: ContractPath = []) => input === null ? success(null) : validator(input, path);
const maxAttempts = refine(nn, (value) => value === 1 || value === 2);
const componentType = closedEnum(["arm", "retry", "evaluator", "reviewer"] as const);
const unusedType = closedEnum(["retry", "evaluator", "reviewer"] as const);
const scopeType = closedEnum(["agency", "project", "assignment", "compare", "segment", "retry", "evaluator", "reviewer"] as const);
const shared = { actorId: nonEmptyString(), projectId: nonEmptyString(), jobId: nonEmptyString(), taskHash: hash, contextBundleHash: hash, skillSetHash: hash, toolGrantHash: hash, outputContractHash: hash,
  evaluationFixtureHash: hash, expectedTargetStateHash: hash, deadlineAtMs: nn };
const arm = closedRecord({ armId: nonEmptyString(), label: hash, routeIntentHash: hash, routePolicyHash: hash, capacityPolicyHash: hash, region: nonEmptyString(), maxAttempts, perAttemptUnits: positive, ...shared });
const declaredRun = closedRecord({ componentId: nonEmptyString(), reservedUnits: positive });
const intent = closedRecord({ schemaVersion: literalValue("compare-intent-v1"), compareId: nonEmptyString(), ...shared, createdAtMs: nn, arms: arrayOf(arm), evaluatorRuns: arrayOf(declaredRun), reviewerRuns: arrayOf(declaredRun) });
const component = closedRecord({ componentType, componentId: nonEmptyString(), reservedUnits: positive });
const balance = withSelfHash(closedRecord({ schemaVersion: literalValue("compare-budget-balance-v1"), scopeType, scopeId: nonEmptyString(), limit: nn, remaining: nn, held: nn, settled: nn, released: nn, revision: nn, previousBalanceHash: nullable(hash), balanceHash: hash }), "balanceHash");
const reservationState = closedEnum(["held", "settled", "released", "reconciliation-hold"] as const);
const reservation = withSelfHash(closedRecord({ schemaVersion: literalValue("compare-reservation-v1"), reservationId: nonEmptyString(), compareId: nonEmptyString(), state: reservationState, revision: nn,
  totalUnits: positive, components: arrayOf(component), balances: arrayOf(balance), previousReservationHash: nullable(hash), reservationHash: hash }), "reservationHash");
const manifest = withSelfHash(closedRecord({ schemaVersion: literalValue("compare-manifest-v1"), compareIntentHash: hash, intent, reservation, components: arrayOf(component), effectAuthority: literalValue("compare-evidence-only"), compareManifestHash: hash }), "compareManifestHash");
const currentReservation = withSelfHash(closedRecord({ schemaVersion: literalValue("compare-current-reservation-v1"), reservationId: nonEmptyString(), compareId: nonEmptyString(), state: reservationState, revision: nn, totalUnits: positive, previousReservationHash: nullable(hash), reservationHash: hash }), "reservationHash");
const noDispatch = withSelfHash(closedRecord({ schemaVersion: literalValue("compare-no-dispatch-evidence-v1"),
  componentType: unusedType, componentId: nonEmptyString(), expectedComponentStateHash: hash,
  expectedComponentRevision: nn, reason: closedEnum(["not-dispatched", "ineligible", "parent-cancelled"] as const),
  leaseState: literalValue("none"), leaseHash: literalValue(null), leaseRevision: literalValue(null),
  issuedBy: literalValue("one-box-control-plane"), issuedAtMs: nn, evidenceHash: hash }), "evidenceHash");
const terminalEvidence = withSelfHash(closedRecord({ schemaVersion: literalValue("compare-terminal-component-evidence-v1"),
  componentType, componentId: nonEmptyString(), expectedComponentStateHash: hash, expectedComponentRevision: nn,
  terminalReceiptHash: hash, usageUnits: nn, billingState: closedEnum(["known", "ambiguous"] as const),
  effectAuthority: literalValue("compare-evidence-only"), issuedBy: literalValue("one-box-control-plane"),
  issuedAtMs: nn, evidenceHash: hash }), "evidenceHash");
const unusedProof = withSelfHash(closedRecord({ schemaVersion: literalValue("unused-compare-component-proof-v1"),
  compareIntentHash: hash, compareManifestHash: hash, budgetReservationId: nonEmptyString(), componentType: unusedType,
  componentId: nonEmptyString(), reason: closedEnum(["not-dispatched", "ineligible", "parent-cancelled"] as const),
  noDispatchEvidenceHash: hash, priorComponentStateRevision: nn, terminalComponentStateHash: hash,
  issuedBy: literalValue("one-box-control-plane"), issuedAtMs: nn, proofHash: hash }), "proofHash");
const componentState = withSelfHash(closedRecord({ schemaVersion: literalValue("compare-component-state-v1"),
  componentType, componentId: nonEmptyString(), reservedUnits: positive,
  lifecycle: closedEnum(["unclaimed", "claimed", "terminal", "unused"] as const), revision: nn,
  previousComponentStateHash: nullable(hash), terminalEvidenceHash: nullable(hash), unusedProof: nullable(unusedProof),
  lastCommandId: nullable(nonEmptyString()), lastCommandHash: nullable(hash), componentStateHash: hash }), "componentStateHash");
const commandReceipt = withSelfHash(closedRecord({ sequence: positive, commandId: nonEmptyString(), commandHash: hash, commandJson: nonEmptyString(), subjectId: nonEmptyString(), beforeStateHash: hash, afterStateHash: hash, previousReceiptHash: nullable(hash), receiptHash: hash }), "receiptHash");
const settlement = closedRecord({ reservedUnits: nn, settledUnits: nn, releasedUnits: nn, heldUnits: nn,
  fromReservationHash: hash, toReservationHash: hash, fromBalanceHashes: arrayOf(hash), toBalanceHashes: arrayOf(hash) });
const compareState = closedRecord({ schemaVersion: literalValue("compare-state-v1"), manifest,
  currentReservation, currentBalances: arrayOf(balance), componentStates: arrayOf(componentState),
  terminalEvidence: arrayOf(terminalEvidence), noDispatchEvidence: arrayOf(noDispatch), state: reservationState,
  revision: nn, settlement: nullable(settlement), effectAuthority: literalValue("compare-evidence-only"),
  lastCommandId: nullable(nonEmptyString()), lastCommandHash: nullable(hash), receiptHeadHash: nullable(hash), commandReceipts: arrayOf(commandReceipt) });
const claimCommand = closedRecord({ schemaVersion: literalValue("compare-claim-command-v1"),
  kind: literalValue("claim-component"), commandId: nonEmptyString(), nowMs: nn, expectedRevision: nn,
  actorId: nonEmptyString(), projectId: nonEmptyString(), componentId: nonEmptyString(),
  expectedComponentStateHash: hash, expectedComponentRevision: nn });
const terminalCommand = closedRecord({ schemaVersion: literalValue("compare-terminal-command-v1"),
  kind: literalValue("record-terminal"), commandId: nonEmptyString(), nowMs: nn, expectedRevision: nn,
  actorId: nonEmptyString(), projectId: nonEmptyString(), componentId: nonEmptyString(),
  expectedComponentStateHash: hash, expectedComponentRevision: nn, terminalEvidenceHash: hash });
const unusedCommand = closedRecord({ schemaVersion: literalValue("compare-unused-command-v1"),
  kind: literalValue("mark-unused"), commandId: nonEmptyString(), nowMs: nn, expectedRevision: nn,
  actorId: nonEmptyString(), projectId: nonEmptyString(), componentId: nonEmptyString(),
  expectedComponentStateHash: hash, expectedComponentRevision: nn, noDispatchEvidenceHash: hash });
const balanceGuard = closedRecord({ scopeType, scopeId: nonEmptyString(), balanceHash: hash, revision: nn });
const settleCommand = closedRecord({ schemaVersion: literalValue("compare-settle-command-v1"), kind: literalValue("settle"),
  commandId: nonEmptyString(), expectedRevision: nn, actorId: nonEmptyString(), projectId: nonEmptyString(),
  reservationId: nonEmptyString(), expectedReservationHash: hash, expectedReservationRevision: nn,
  balanceGuards: arrayOf(balanceGuard) });
export type CompareArmV1 = InferValidator<typeof arm>; export type CompareIntentV1 = InferValidator<typeof intent>;
export type CompareComponentV1 = InferValidator<typeof component>; export type CompareReservationV1 = InferValidator<typeof reservation>;
export type CompareManifestV1 = InferValidator<typeof manifest>; export type UnusedCompareComponentProofV1 = InferValidator<typeof unusedProof>;
export type CompareEvidenceV1 = InferValidator<typeof terminalEvidence>; export type CompareComponentStateV1 = InferValidator<typeof componentState>;
export type CompareSettlementV1 = InferValidator<typeof settlement>; export type CompareStateV1 = InferValidator<typeof compareState>;
export type CompareReductionV1 = Readonly<{ disposition: "applied" | "attached"; state: CompareStateV1 }>;
const add = (left: number, right: number): number | undefined => { const value = left + right; return Number.isSafeInteger(value) && value >= 0 ? value : undefined; };
const unique = (values: readonly string[]): boolean => values.length === new Set(values).size;
const digest = (value: unknown): string | undefined => { const result = canonicalSha256(value); return result.ok ? result.value : undefined; };
function seal<T>(seed: Record<string, unknown>, field: string, validator: Validator<T>): Result<T> {
  const candidate = { ...seed, [field]: "0".repeat(64) }; const result = computeSelfHash(candidate, field); return result.ok ? validator({ ...candidate, [field]: result.value }) : result;
}
const sealBalance = (seed: Record<string, unknown>) => seal(seed, "balanceHash", balance);
const sealReservation = (seed: Record<string, unknown>) => seal(seed, "reservationHash", currentReservation);
const sealComponent = (seed: Record<string, unknown>) => seal(seed, "componentStateHash", componentState);
const sealProof = (seed: Record<string, unknown>) => seal(seed, "proofHash", unusedProof);
function armBound(value: CompareArmV1, parent: CompareIntentV1): boolean {
  return value.actorId === parent.actorId && value.projectId === parent.projectId && value.jobId === parent.jobId
    && value.taskHash === parent.taskHash && value.contextBundleHash === parent.contextBundleHash
    && value.skillSetHash === parent.skillSetHash && value.toolGrantHash === parent.toolGrantHash
    && value.outputContractHash === parent.outputContractHash && value.evaluationFixtureHash === parent.evaluationFixtureHash
    && value.expectedTargetStateHash === parent.expectedTargetStateHash && value.deadlineAtMs === parent.deadlineAtMs;
}
function intentInvariant(value: CompareIntentV1): boolean {
  const runs = [...value.evaluatorRuns, ...value.reviewerRuns];
  return value.createdAtMs < value.deadlineAtMs && value.arms.length === 2 && value.evaluatorRuns.length === 1
    && value.reviewerRuns.length === 1 && unique(value.arms.map((item) => item.armId))
    && unique(value.arms.map((item) => item.label)) && unique(value.arms.map((item) => item.routeIntentHash))
    && unique(runs.map((item) => item.componentId)) && value.arms.every((item) => armBound(item, value));
}
function deriveComponents(value: CompareIntentV1): Result<readonly CompareComponentV1[]> {
  const items: CompareComponentV1[] = [];
  for (const candidate of value.arms) { items.push({ componentType: "arm", componentId: `arm:${candidate.armId}`, reservedUnits: candidate.perAttemptUnits });
    if (candidate.maxAttempts === 2) items.push({ componentType: "retry", componentId: `retry:${candidate.armId}`, reservedUnits: candidate.perAttemptUnits }); }
  for (const item of value.evaluatorRuns) items.push({ componentType: "evaluator", ...item });
  for (const item of value.reviewerRuns) items.push({ componentType: "reviewer", ...item });
  return unique(items.map((item) => item.componentId)) ? success(Object.freeze(items)) : failure("INVARIANT_VIOLATION", ["components"]);
}
function sameComponents(left: readonly CompareComponentV1[], right: readonly CompareComponentV1[]): boolean {
  return left.length === right.length && left.every((item, index) => item.componentType === right[index]?.componentType
    && item.componentId === right[index]?.componentId && item.reservedUnits === right[index]?.reservedUnits);
}
function total(components: readonly CompareComponentV1[]): number | undefined {
  let value = 0; for (const item of components) { const next = add(value, item.reservedUnits); if (next === undefined) return undefined; value = next; }
  return value;
}
function stock(value: InferValidator<typeof balance>): boolean {
  const used = add(value.remaining, value.held); return used !== undefined && add(used, value.settled) === value.limit;
}
const SCOPE_ORDER = ["agency", "project", "assignment", "compare", "segment", "retry", "evaluator", "reviewer"] as const;
function reservationInvariant(value: CompareReservationV1, parent: CompareIntentV1, components: readonly CompareComponentV1[]): boolean {
  const units = total(components);
  return value.state === "held" && value.revision === 0 && value.previousReservationHash === null
    && value.compareId === parent.compareId && units !== undefined && value.totalUnits === units
    && sameComponents(value.components, components) && value.balances.length === SCOPE_ORDER.length
    && unique(value.balances.map((item) => item.scopeId)) && value.balances.every((item, index) =>
      item.scopeType === SCOPE_ORDER[index] && item.revision === 0 && item.previousBalanceHash === null
      && item.held >= value.totalUnits && stock(item)) && value.balances[1]?.scopeId === parent.projectId
    && value.balances[3]?.scopeId === parent.compareId;
}
function initialParent(value: CompareManifestV1): Result<InferValidator<typeof currentReservation>> {
  const item = value.reservation; return sealReservation({ schemaVersion: "compare-current-reservation-v1",
    reservationId: item.reservationId, compareId: item.compareId, state: "held", revision: 0,
    totalUnits: item.totalUnits, previousReservationHash: null });
}
function terminalHash(parent: CompareManifestV1, current: CompareComponentStateV1,
  evidenceHash: string, revision: number): string | undefined {
  return digest({ schemaVersion: "compare-terminal-component-state-hash-v1", compareIntentHash: parent.compareIntentHash,
    compareManifestHash: parent.compareManifestHash, componentType: current.componentType,
    componentId: current.componentId, priorComponentStateHash: current.componentStateHash,
    priorRevision: current.revision, nextRevision: revision, noDispatchEvidenceHash: evidenceHash, lifecycle: "unused" });
}
function proofBinds(value: UnusedCompareComponentProofV1, current: CompareComponentStateV1,
  evidenceValue: InferValidator<typeof noDispatch>, parent: CompareManifestV1): boolean {
  const hashValue = terminalHash(parent, { ...current, componentStateHash: current.previousComponentStateHash ?? current.componentStateHash,
    revision: value.priorComponentStateRevision }, evidenceValue.evidenceHash, current.revision);
  return value.compareIntentHash === parent.compareIntentHash && value.compareManifestHash === parent.compareManifestHash
    && value.budgetReservationId === parent.reservation.reservationId && value.componentType === current.componentType
    && value.componentId === current.componentId && value.reason === evidenceValue.reason
    && value.noDispatchEvidenceHash === evidenceValue.evidenceHash && value.priorComponentStateRevision === current.revision - 1
    && value.terminalComponentStateHash === hashValue && value.issuedAtMs === evidenceValue.issuedAtMs;
}
function authorityBinds<T extends InferValidator<typeof terminalEvidence> | InferValidator<typeof noDispatch>>(
  item: T, current: CompareComponentStateV1, parent: CompareManifestV1): boolean {
  const prior = current.previousComponentStateHash === item.expectedComponentStateHash
    && current.revision === item.expectedComponentRevision + 1;
  return item.componentType === current.componentType && item.componentId === current.componentId
    && item.issuedAtMs >= parent.intent.createdAtMs && item.issuedAtMs < parent.intent.deadlineAtMs
    && ((current.componentStateHash === item.expectedComponentStateHash && current.revision === item.expectedComponentRevision) || prior);
}
function componentInvariant(value: CompareComponentStateV1, stateValue: CompareStateV1): boolean {
  if (value.lifecycle === "unclaimed") return value.revision === 0 && value.previousComponentStateHash === null
    && value.terminalEvidenceHash === null && value.unusedProof === null && value.lastCommandId === null && value.lastCommandHash === null;
  if (value.lifecycle === "claimed") return value.revision === 1 && value.previousComponentStateHash !== null
    && value.terminalEvidenceHash === null && value.unusedProof === null && value.lastCommandId !== null && value.lastCommandHash !== null;
  if (value.previousComponentStateHash === null || value.lastCommandId === null || value.lastCommandHash === null) return false;
  if (value.lifecycle === "terminal") { const evidenceValue = stateValue.terminalEvidence.find((item) => item.evidenceHash === value.terminalEvidenceHash);
    return (value.revision === 1 || value.revision === 2) && value.unusedProof === null && !!evidenceValue && authorityBinds(evidenceValue, value, stateValue.manifest)
      && evidenceValue.usageUnits <= value.reservedUnits; }
  const evidenceValue = stateValue.noDispatchEvidence.find((item) => item.evidenceHash === value.unusedProof?.noDispatchEvidenceHash);
  return value.revision === 1 && value.componentType !== "arm" && value.terminalEvidenceHash === null
    && !!value.unusedProof && !!evidenceValue && authorityBinds(evidenceValue, value, stateValue.manifest)
    && proofBinds(value.unusedProof, value, evidenceValue, stateValue.manifest);
}
type Totals = Readonly<{ reservedUnits: number; settledUnits: number; releasedUnits: number; heldUnits: number }>;
function totals(value: CompareStateV1): Result<Totals> {
  let settledUnits = 0; let releasedUnits = 0; let heldUnits = 0;
  for (const item of value.componentStates) {
    if (item.lifecycle === "unused") { const next = add(releasedUnits, item.reservedUnits); if (next === undefined) return failure("INVALID_SAFE_INTEGER", ["releasedUnits"]); releasedUnits = next; continue; }
    if (item.lifecycle !== "terminal") return failure("INVARIANT_VIOLATION", ["componentStates"]);
    const evidenceValue = value.terminalEvidence.find((entry) => entry.evidenceHash === item.terminalEvidenceHash);
    if (!evidenceValue) return failure("INVARIANT_VIOLATION", ["terminalEvidence"]);
    const held = evidenceValue.billingState === "ambiguous" ? item.reservedUnits : 0;
    const settled = held ? 0 : evidenceValue.usageUnits; const released = held ? 0 : item.reservedUnits - settled;
    const ns = add(settledUnits, settled); const nr = add(releasedUnits, released); const nh = add(heldUnits, held);
    if (ns === undefined || nr === undefined || nh === undefined) return failure("INVALID_SAFE_INTEGER", ["settlement"]);
    settledUnits = ns; releasedUnits = nr; heldUnits = nh;
  }
  return success({ reservedUnits: value.manifest.reservation.totalUnits, settledUnits, releasedUnits, heldUnits });
}
function deriveOutcome(value: CompareStateV1): Result<Readonly<{ parent: InferValidator<typeof currentReservation>;
  balances: readonly InferValidator<typeof balance>[]; settlement: CompareSettlementV1 }>> {
  const amounts = totals(value); if (!amounts.ok) return amounts;
  const prior = initialParent(value.manifest); if (!prior.ok) return prior;
  const outcome = amounts.value.heldUnits ? "reconciliation-hold" : amounts.value.settledUnits ? "settled" : "released";
  const parent = sealReservation({ ...prior.value, state: outcome, revision: 1,
    previousReservationHash: prior.value.reservationHash }); if (!parent.ok) return parent;
  const balances: InferValidator<typeof balance>[] = [];
  for (const item of value.manifest.reservation.balances) {
    const remaining = add(item.remaining, amounts.value.releasedUnits); const settled = add(item.settled, amounts.value.settledUnits);
    const released = add(item.released, amounts.value.releasedUnits); const baseHeld = item.held - amounts.value.reservedUnits;
    const held = baseHeld < 0 ? undefined : add(baseHeld, amounts.value.heldUnits);
    if (remaining === undefined || settled === undefined || released === undefined || held === undefined)
      return failure("INVALID_SAFE_INTEGER", ["currentBalances", item.scopeId]);
    const next = sealBalance({ ...item, remaining, held, settled, released, revision: 1,
      previousBalanceHash: item.balanceHash }); if (!next.ok || !stock(next.value)) return next.ok
        ? failure("INVARIANT_VIOLATION", ["currentBalances", item.scopeId]) : next; balances.push(next.value);
  }
  const receipt = { ...amounts.value, fromReservationHash: prior.value.reservationHash,
    toReservationHash: parent.value.reservationHash, fromBalanceHashes: value.manifest.reservation.balances.map((item) => item.balanceHash),
    toBalanceHashes: balances.map((item) => item.balanceHash) };
  const parsed = settlement(receipt); return parsed.ok ? success({ parent: parent.value, balances, settlement: parsed.value }) : parsed;
}
type RecordedCommand = InferValidator<typeof claimCommand> | InferValidator<typeof terminalCommand> | InferValidator<typeof unusedCommand> | InferValidator<typeof settleCommand>;
function recordedCommand(text: string): Result<RecordedCommand> {
  const parsed = parseCanonicalJson(text); if (!parsed.ok) return parsed; const raw = parsed.value as { kind?: unknown };
  const validator = raw.kind === "claim-component" ? claimCommand : raw.kind === "record-terminal" ? terminalCommand : raw.kind === "mark-unused" ? unusedCommand : raw.kind === "settle" ? settleCommand : undefined;
  return validator ? validator(parsed.value) : failure("UNSUPPORTED_VALUE", ["kind"]);
}
function initialComponents(value: CompareManifestV1): Result<readonly CompareComponentStateV1[]> {
  const items: CompareComponentStateV1[] = []; for (const item of value.components) { const next = sealComponent({ schemaVersion: "compare-component-state-v1", ...item, lifecycle: "unclaimed", revision: 0, previousComponentStateHash: null, terminalEvidenceHash: null, unusedProof: null, lastCommandId: null, lastCommandHash: null }); if (!next.ok) return next; items.push(next.value); } return success(items);
}
const summary = (value: CompareStateV1) => digest({ currentReservation: value.currentReservation, currentBalances: value.currentBalances, componentStates: value.componentStates, state: value.state, revision: value.revision, settlement: value.settlement, lastCommandId: value.lastCommandId, lastCommandHash: value.lastCommandHash });
function replayRecorded(value: CompareStateV1, command: RecordedCommand): Result<CompareReductionV1> {
  return command.kind === "claim-component" ? applyClaim(value, command) : command.kind === "record-terminal" ? applyTerminal(value, command) : command.kind === "mark-unused" ? applyUnused(value, command) : applySettlement(value, command);
}
function historyInvariant(value: CompareStateV1): boolean {
  const receipts = value.commandReceipts; const tip = receipts.at(-1); const parent = initialParent(value.manifest); const components = initialComponents(value.manifest);
  if (!parent.ok || !components.ok || receipts.length !== value.revision || value.receiptHeadHash !== (tip?.receiptHash ?? null)
    || value.lastCommandId !== (tip?.commandId ?? null) || value.lastCommandHash !== (tip?.commandHash ?? null) || !unique(receipts.map((item) => item.commandId)) || !unique(receipts.map((item) => item.commandHash))) return false;
  const shadowResult = compareState({ ...value, currentReservation: parent.value, currentBalances: value.manifest.reservation.balances, componentStates: components.value, state: "held", revision: 0, settlement: null, lastCommandId: null, lastCommandHash: null, receiptHeadHash: null, commandReceipts: [] }); if (!shadowResult.ok) return false;
  let shadow = shadowResult.value; for (const [index, receipt] of receipts.entries()) { const command = recordedCommand(receipt.commandJson); if (!command.ok) return false;
    const fingerprint = digest(command.value); const componentCommand = "componentId" in command.value; const subjectId = componentCommand ? command.value.componentId : command.value.reservationId;
    const before = componentCommand ? shadow.componentStates.find((item) => item.componentId === subjectId)?.componentStateHash : shadow.currentReservation.reservationHash;
    const next = replayRecorded(shadow, command.value); if (!next.ok) return false; const after = componentCommand ? next.value.state.componentStates.find((item) => item.componentId === subjectId)?.componentStateHash : next.value.state.currentReservation.reservationHash;
    if (!fingerprint || receipt.sequence !== index + 1 || receipt.commandId !== command.value.commandId || receipt.commandHash !== fingerprint || receipt.subjectId !== subjectId || receipt.beforeStateHash !== before || receipt.afterStateHash !== after || receipt.previousReceiptHash !== (receipts[index - 1]?.receiptHash ?? null)) return false; shadow = next.value.state; }
  return summary(shadow) === summary(value);
}
function stateInvariant(value: CompareStateV1): boolean {
  if (!intentInvariant(value.manifest.intent)) return false;
  const components = deriveComponents(value.manifest.intent); const intentHash = digest(value.manifest.intent);
  if (!components.ok || !intentHash || value.manifest.compareIntentHash !== intentHash
    || !sameComponents(value.manifest.components, components.value)
    || !reservationInvariant(value.manifest.reservation, value.manifest.intent, components.value)
    || value.componentStates.length !== components.value.length
    || !value.componentStates.every((item, index) => item.componentType === components.value[index]?.componentType
      && item.componentId === components.value[index]?.componentId && item.reservedUnits === components.value[index]?.reservedUnits)
    || !unique(value.componentStates.map((item) => item.componentId))
    || !unique(value.terminalEvidence.map((item) => item.evidenceHash)) || !unique(value.terminalEvidence.map((item) => item.componentId))
    || !unique(value.noDispatchEvidence.map((item) => item.evidenceHash)) || !unique(value.noDispatchEvidence.map((item) => item.componentId))
    || !historyInvariant(value) || !unique(value.componentStates.flatMap((item) => item.lastCommandId === null ? [] : [item.lastCommandId]))) return false;
  if (!value.terminalEvidence.every((item) => { const current = value.componentStates.find((entry) => entry.componentId === item.componentId);
      return !!current && authorityBinds(item, current, value.manifest) && item.usageUnits <= current.reservedUnits; })
    || !value.noDispatchEvidence.every((item) => { const current = value.componentStates.find((entry) => entry.componentId === item.componentId);
      return !!current && current.componentType !== "arm" && authorityBinds(item, current, value.manifest); })
    || !value.componentStates.every((item) => componentInvariant(item, value))) return false;
  let componentRevisions = 0; for (const item of value.componentStates) { const next = add(componentRevisions, item.revision);
    if (next === undefined) return false; componentRevisions = next; }
  const initial = initialParent(value.manifest); if (!initial.ok) return false;
  if ((value.revision === 0) !== (value.lastCommandId === null && value.lastCommandHash === null)) return false;
  if (value.state === "held") return value.revision === componentRevisions && value.settlement === null
    && digest(value.currentReservation) === digest(initial.value)
    && digest(value.currentBalances) === digest(value.manifest.reservation.balances);
  const derived = deriveOutcome(value); return derived.ok && value.revision === componentRevisions + 1
    && digest(value.currentReservation) === digest(derived.value.parent)
    && digest(value.currentBalances) === digest(derived.value.balances)
    && digest(value.settlement) === digest(derived.value.settlement) && value.state === derived.value.parent.state;
}
export function validateCompareIntent(input: unknown): Result<CompareIntentV1> {
  const parsed = intent(input); return parsed.ok && intentInvariant(parsed.value) ? parsed
    : parsed.ok ? failure("INVARIANT_VIOLATION", ["arms"]) : parsed;
}
export function validateCompareState(input: unknown): Result<CompareStateV1> {
  const parsed = compareState(input); return parsed.ok && stateInvariant(parsed.value) ? parsed
    : parsed.ok ? failure("INVARIANT_VIOLATION", []) : parsed;
}
export function createCompareState(intentInput: unknown, reservationInput: unknown): Result<CompareStateV1> {
  const intentValue = validateCompareIntent(intentInput); if (!intentValue.ok) return intentValue;
  const reservationValue = reservation(reservationInput); if (!reservationValue.ok) return reservationValue;
  const components = deriveComponents(intentValue.value); if (!components.ok) return components;
  if (!reservationInvariant(reservationValue.value, intentValue.value, components.value)) return failure("INVARIANT_VIOLATION", ["reservation"]);
  const compareIntentHash = digest(intentValue.value); if (!compareIntentHash) return failure("INVARIANT_VIOLATION", ["intent"]);
  const manifestValue = seal({ schemaVersion: "compare-manifest-v1", compareIntentHash, intent: intentValue.value,
    reservation: reservationValue.value, components: components.value, effectAuthority: "compare-evidence-only" },
  "compareManifestHash", manifest); if (!manifestValue.ok) return manifestValue;
  const parent = initialParent(manifestValue.value); if (!parent.ok) return parent;
  const states = initialComponents(manifestValue.value); if (!states.ok) return states;
  return validateCompareState({ schemaVersion: "compare-state-v1", manifest: manifestValue.value,
    currentReservation: parent.value, currentBalances: reservationValue.value.balances,
    componentStates: states.value, terminalEvidence: [], noDispatchEvidence: [], state: "held", revision: 0,
    settlement: null, effectAuthority: "compare-evidence-only", lastCommandId: null, lastCommandHash: null, receiptHeadHash: null, commandReceipts: [] });
}
const result = (disposition: CompareReductionV1["disposition"], candidate: unknown): Result<CompareReductionV1> => { const parsed = compareState(candidate); return parsed.ok ? success({ disposition, state: parsed.value }) : parsed; };
const finish = (disposition: CompareReductionV1["disposition"], candidate: unknown): Result<CompareReductionV1> => { const parsed = validateCompareState(candidate); return parsed.ok ? success({ disposition, state: parsed.value }) : parsed; };
type CompareCommand = { commandId: string; componentId: string } | { commandId: string; reservationId: string };
function execute<T extends CompareCommand>(value: CompareStateV1, command: T,
  reducer: (stateValue: CompareStateV1, commandValue: T) => Result<CompareReductionV1>): Result<CompareReductionV1> {
  const commandHash = digest(command); if (!commandHash) return failure("INVARIANT_VIOLATION", ["command"]);
  const commandJson = canonicalize(command); if (!commandJson.ok) return commandJson;
  const prior = value.commandReceipts.find((item) => item.commandId === command.commandId);
  if (prior) return prior.commandHash === commandHash ? finish("attached", value) : failure("INVARIANT_VIOLATION", ["commandId"]);
  const reduced = reducer(value, command); const sequence = add(value.revision, 1); if (!reduced.ok || sequence === undefined || reduced.value.state.revision !== sequence)
    return reduced.ok ? failure("INVALID_SAFE_INTEGER", ["revision"]) : reduced;
  const componentCommand = "componentId" in command; const subjectId = componentCommand ? command.componentId : command.reservationId;
  const beforeStateHash = componentCommand ? value.componentStates.find((item) => item.componentId === subjectId)?.componentStateHash : value.currentReservation.reservationHash;
  const afterStateHash = componentCommand ? reduced.value.state.componentStates.find((item) => item.componentId === subjectId)?.componentStateHash : reduced.value.state.currentReservation.reservationHash;
  if (!beforeStateHash || !afterStateHash) return failure("INVARIANT_VIOLATION", ["subjectId"]);
  const receipt = seal({ sequence, commandId: command.commandId, commandHash, commandJson: commandJson.value, subjectId, beforeStateHash,
    afterStateHash, previousReceiptHash: value.receiptHeadHash }, "receiptHash", commandReceipt); return receipt.ok
    ? finish(reduced.value.disposition, { ...reduced.value.state, receiptHeadHash: receipt.value.receiptHash, commandReceipts: [...value.commandReceipts, receipt.value] }) : receipt;
}
function commandBound(value: CompareStateV1, command: { actorId: string; projectId: string; nowMs: number }): boolean {
  const parent = value.manifest.intent; return command.actorId === parent.actorId && command.projectId === parent.projectId
    && command.nowMs >= parent.createdAtMs && command.nowMs < parent.deadlineAtMs;
}
function updateComponent(value: CompareStateV1, index: number, next: CompareComponentStateV1, commandId: string): Result<CompareReductionV1> {
  const revision = add(value.revision, 1); if (revision === undefined) return failure("INVALID_SAFE_INTEGER", ["revision"]);
  return result("applied", { ...value, revision, componentStates: value.componentStates.map((item, itemIndex) => itemIndex === index ? next : item), lastCommandId: commandId, lastCommandHash: next.lastCommandHash });
}
function applyClaim(value: CompareStateV1, command: InferValidator<typeof claimCommand>): Result<CompareReductionV1> {
  const index = value.componentStates.findIndex((item) => item.componentId === command.componentId); const current = value.componentStates[index];
  const fingerprint = digest(command); if (!fingerprint) return failure("INVARIANT_VIOLATION", ["command"]);
  if (!current) return failure("INVARIANT_VIOLATION", ["componentId"]);
  if (value.state !== "held" || current.lifecycle !== "unclaimed" || command.expectedRevision !== value.revision
    || !commandBound(value, command) || command.expectedComponentStateHash !== current.componentStateHash
    || command.expectedComponentRevision !== current.revision) return failure("INVARIANT_VIOLATION", ["claim"]);
  const next = sealComponent({ ...current, lifecycle: "claimed", revision: current.revision + 1,
    previousComponentStateHash: current.componentStateHash, lastCommandId: command.commandId, lastCommandHash: fingerprint });
  return next.ok ? updateComponent(value, index, next.value, command.commandId) : next;
}
function applyTerminal(value: CompareStateV1, command: InferValidator<typeof terminalCommand>): Result<CompareReductionV1> {
  const index = value.componentStates.findIndex((item) => item.componentId === command.componentId); const current = value.componentStates[index];
  const fingerprint = digest(command); if (!fingerprint) return failure("INVARIANT_VIOLATION", ["command"]);
  if (!current) return failure("INVARIANT_VIOLATION", ["componentId"]);
  const evidenceValue = value.terminalEvidence.find((item) => item.evidenceHash === command.terminalEvidenceHash);
  if (value.state !== "held" || !["unclaimed", "claimed"].includes(current.lifecycle) || !evidenceValue
    || command.expectedRevision !== value.revision || !commandBound(value, command)
    || command.expectedComponentStateHash !== current.componentStateHash || command.expectedComponentRevision !== current.revision
    || evidenceValue.expectedComponentStateHash !== current.componentStateHash || evidenceValue.expectedComponentRevision !== current.revision
    || evidenceValue.componentId !== current.componentId || evidenceValue.componentType !== current.componentType
    || evidenceValue.usageUnits > current.reservedUnits || evidenceValue.issuedAtMs > command.nowMs)
    return failure("INVARIANT_VIOLATION", ["terminalEvidenceHash"]);
  const next = sealComponent({ ...current, lifecycle: "terminal", revision: current.revision + 1,
    previousComponentStateHash: current.componentStateHash, terminalEvidenceHash: evidenceValue.evidenceHash,
    unusedProof: null, lastCommandId: command.commandId, lastCommandHash: fingerprint });
  return next.ok ? updateComponent(value, index, next.value, command.commandId) : next;
}
function applyUnused(value: CompareStateV1, command: InferValidator<typeof unusedCommand>): Result<CompareReductionV1> {
  const index = value.componentStates.findIndex((item) => item.componentId === command.componentId); const current = value.componentStates[index];
  const fingerprint = digest(command); if (!fingerprint) return failure("INVARIANT_VIOLATION", ["command"]);
  if (!current) return failure("INVARIANT_VIOLATION", ["componentId"]);
  const evidenceValue = value.noDispatchEvidence.find((item) => item.evidenceHash === command.noDispatchEvidenceHash);
  if (value.state !== "held" || current.lifecycle !== "unclaimed" || current.componentType === "arm" || !evidenceValue
    || command.expectedRevision !== value.revision || !commandBound(value, command)
    || command.expectedComponentStateHash !== current.componentStateHash || command.expectedComponentRevision !== current.revision
    || evidenceValue.expectedComponentStateHash !== current.componentStateHash || evidenceValue.expectedComponentRevision !== current.revision
    || evidenceValue.componentId !== current.componentId || evidenceValue.componentType !== current.componentType
    || evidenceValue.issuedAtMs > command.nowMs) return failure("INVARIANT_VIOLATION", ["noDispatchEvidenceHash"]);
  const revision = current.revision + 1; const terminalComponentStateHash = terminalHash(value.manifest, current, evidenceValue.evidenceHash, revision);
  if (!terminalComponentStateHash) return failure("INVARIANT_VIOLATION", ["componentStateHash"]);
  const proof = sealProof({ schemaVersion: "unused-compare-component-proof-v1", compareIntentHash: value.manifest.compareIntentHash,
    compareManifestHash: value.manifest.compareManifestHash, budgetReservationId: value.manifest.reservation.reservationId,
    componentType: evidenceValue.componentType, componentId: current.componentId, reason: evidenceValue.reason,
    noDispatchEvidenceHash: evidenceValue.evidenceHash, priorComponentStateRevision: current.revision,
    terminalComponentStateHash, issuedBy: "one-box-control-plane", issuedAtMs: evidenceValue.issuedAtMs });
  if (!proof.ok) return proof;
  const next = sealComponent({ ...current, lifecycle: "unused", revision,
    previousComponentStateHash: current.componentStateHash, terminalEvidenceHash: null,
    unusedProof: proof.value, lastCommandId: command.commandId, lastCommandHash: fingerprint });
  return next.ok ? updateComponent(value, index, next.value, command.commandId) : next;
}
function settlementBound(value: CompareStateV1, command: InferValidator<typeof settleCommand>): boolean {
  return command.actorId === value.manifest.intent.actorId && command.projectId === value.manifest.intent.projectId
    && command.reservationId === value.currentReservation.reservationId && command.expectedReservationHash === value.currentReservation.reservationHash
    && command.expectedReservationRevision === value.currentReservation.revision && command.balanceGuards.length === value.currentBalances.length
    && command.balanceGuards.every((item, index) => item.scopeType === value.currentBalances[index]?.scopeType
      && item.scopeId === value.currentBalances[index]?.scopeId && item.balanceHash === value.currentBalances[index]?.balanceHash
      && item.revision === value.currentBalances[index]?.revision);
}
function applySettlement(value: CompareStateV1, command: InferValidator<typeof settleCommand>): Result<CompareReductionV1> {
  const fingerprint = digest(command); if (!fingerprint) return failure("INVARIANT_VIOLATION", ["command"]);
  if (value.state !== "held") return failure("INVARIANT_VIOLATION", ["state"]);
  if (!settlementBound(value, command) || command.expectedRevision !== value.revision)
    return failure("INVARIANT_VIOLATION", ["settlement"]);
  const derived = deriveOutcome(value); const revision = add(value.revision, 1);
  if (!derived.ok || revision === undefined) return derived.ok ? failure("INVALID_SAFE_INTEGER", ["revision"]) : derived;
  return result("applied", { ...value, currentReservation: derived.value.parent,
    currentBalances: derived.value.balances, state: derived.value.parent.state, revision,
    settlement: derived.value.settlement, lastCommandId: command.commandId, lastCommandHash: fingerprint });
}
export function reduceCompare(stateInput: unknown, commandInput: unknown): Result<CompareReductionV1> {
  const current = validateCompareState(stateInput); if (!current.ok) return current;
  let kind: unknown; try { const descriptor = commandInput !== null && typeof commandInput === "object"
      ? Object.getOwnPropertyDescriptor(commandInput, "kind") : undefined;
    kind = descriptor && "value" in descriptor ? descriptor.value : undefined; } catch { return failure("UNSUPPORTED_VALUE", []); }
  if (kind === "claim-component") { const command = claimCommand(commandInput); return command.ok ? execute(current.value, command.value, applyClaim) : command; }
  if (kind === "record-terminal") { const command = terminalCommand(commandInput); return command.ok ? execute(current.value, command.value, applyTerminal) : command; }
  if (kind === "mark-unused") { const command = unusedCommand(commandInput); return command.ok ? execute(current.value, command.value, applyUnused) : command; }
  if (kind === "settle") { const command = settleCommand(commandInput); return command.ok ? execute(current.value, command.value, applySettlement) : command; }
  return failure("UNSUPPORTED_VALUE", ["kind"]);
}
