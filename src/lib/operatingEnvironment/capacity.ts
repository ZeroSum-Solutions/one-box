import { canonicalize, canonicalSha256, computeSelfHash, parseCanonicalJson } from "./canonical";
import { arrayOf, closedEnum, closedRecord, literalValue, nonEmptyString, refine, safeInteger, withSelfHash, type InferValidator, type Validator } from "./contracts";
import { failure, success, type ContractPath, type Result } from "./reasonCodes";
const nn = refine(safeInteger(), (value) => value >= 0);
const positive = refine(safeInteger(), (value) => value > 0);
const hash = refine(nonEmptyString(), (value) => /^[a-f0-9]{64}$/.test(value));
const nullable = <T>(validator: Validator<T>): Validator<T | null> => (input: unknown, path: ContractPath = []) => input === null ? success(null) : validator(input, path);
const uniqueStrings = refine(arrayOf(nonEmptyString()), (values) => values.length === new Set(values).size);
const priorityClass = closedEnum(["urgent", "standard", "background"] as const);
const leaseState = closedEnum(["queued", "claimed", "released", "cancelled", "expired", "reconciliation-hold"] as const);
const cancelReason = closedEnum(["deadline", "operator", "kill-switch"] as const);
const scopeRevision = closedRecord({ scopeId: nonEmptyString(), revision: nn });
const budgetGuard = withSelfHash(closedRecord({ schemaVersion: literalValue("held-budget-guard-v1"), guardId: nonEmptyString(), segmentId: nonEmptyString(), manifestHash: hash, state: literalValue("held"), reservationId: nonEmptyString(), reservationHash: hash, reservationRevision: nn, hierarchyHash: hash, scopeRevisions: arrayOf(scopeRevision), budgetPolicyHash: hash, ownerAssignmentRefs: uniqueStrings, killSwitchRef: nonEmptyString(), effectiveAtMs: nn, expiresAtMs: nn, guardHash: hash }), "guardHash");
const priorityAssignment = withSelfHash(closedRecord({ schemaVersion: literalValue("capacity-priority-assignment-v1"), assignmentId: nonEmptyString(), policyHash: hash, projectId: nonEmptyString(), segmentId: nonEmptyString(), priorityClass, issuedBy: literalValue("one-box-control-plane"), effectiveAtMs: nn, expiresAtMs: nn, assignmentHash: hash }), "assignmentHash");
const rateUnits = closedRecord({ windowId: nonEmptyString(), units: nn });
const fairWeight = closedRecord({ projectId: nonEmptyString(), weight: positive });
const projectCounter = closedRecord({ projectId: nonEmptyString(), sequence: nn });
const observationWindow = closedRecord({ windowId: nonEmptyString(), remaining: nn });
const rateWindow = closedRecord({ windowId: nonEmptyString(), limit: nn, claimed: nn, remaining: nn, startsAtMs: nn, endsAtMs: nn, revision: nn });
const policy = withSelfHash(closedRecord({ schemaVersion: literalValue("capacity-policy-v1"), policyId: nonEmptyString(), routePolicyHash: hash, providerEntryHash: hash, exactModelIdentity: nonEmptyString(), region: nonEmptyString(), fundingClasses: arrayOf(literalValue("synthetic")), maximumConcurrentSegments: nn, maximumQueueDepth: nn, maximumQueueWaitMs: nn, priorityClasses: arrayOf(priorityClass), fairShareWeights: arrayOf(fairWeight), ownerAssignmentRefs: uniqueStrings, acceptedOwnerAssignmentRefs: uniqueStrings, killSwitchRef: nonEmptyString(), effectiveAtMs: nn, expiresAtMs: nn, revision: nn, policyHash: hash }), "policyHash");
const observation = withSelfHash(closedRecord({ schemaVersion: literalValue("capacity-observation-v1"), policyHash: hash, routePolicyHash: hash, region: nonEmptyString(), availableConcurrentSegments: nn, rateWindowRemaining: arrayOf(observationWindow), queueDepth: nn, source: closedEnum(["fixture", "provider"] as const), observedAtMs: nn, expiresAtMs: nn, observationHash: hash }), "observationHash");
const balance = withSelfHash(closedRecord({ schemaVersion: literalValue("capacity-balance-v1"), policyHash: hash, routePolicyHash: hash, region: nonEmptyString(), slotLimit: nn, claimedSlots: nn, remainingSlots: nn, revision: nn, rateWindows: arrayOf(rateWindow), balanceHash: hash }), "balanceHash");
const ticket = closedRecord({ ticketId: nonEmptyString(), leaseId: nonEmptyString(), segmentId: nonEmptyString(), manifestHash: hash, projectId: nonEmptyString(), priorityClass, projectSequence: positive, reservationAtMs: nn, budgetGuardHash: hash, priorityAssignmentHash: hash, deadlineAtMs: nn, maximumWaitUntilMs: nn });
const queue = withSelfHash(closedRecord({ schemaVersion: literalValue("queue-state-v1"), policyHash: hash, routePolicyHash: hash, maximumDepth: nn, currentDepth: nn, tickets: arrayOf(ticket), projectCounters: arrayOf(projectCounter), revision: nn, previousQueueHash: nullable(hash), queueHash: hash }), "queueHash");
const terminalEvidence = withSelfHash(closedRecord({ schemaVersion: literalValue("capacity-terminal-evidence-v1"), evidenceId: nonEmptyString(), evidenceKind: closedEnum(["terminal-segment", "owner-reconciliation"] as const), leaseId: nonEmptyString(), segmentId: nonEmptyString(), manifestHash: hash, reservationHash: hash, terminalStatus: closedEnum(["completed", "failed", "cancelled", "rejected", "budget-exhausted"] as const), terminalReceiptHash: hash, ownerAssignmentRef: nullable(nonEmptyString()), ownerEvidenceHash: nullable(hash), issuedBy: closedEnum(["one-box-control-plane", "capacity-owner"] as const), evidenceHash: hash }), "evidenceHash");
const noDispatchEvidence = withSelfHash(closedRecord({ schemaVersion: literalValue("capacity-no-dispatch-evidence-v1"), evidenceId: nonEmptyString(), leaseId: nonEmptyString(), segmentId: nonEmptyString(), manifestHash: hash, expectedLeaseHash: hash, expectedLeaseRevision: nn, expectedQueueHash: hash, expectedQueueRevision: nn, reason: cancelReason, authorityRef: nullable(nonEmptyString()), noDispatchAtMs: nn, issuedBy: literalValue("one-box-control-plane"), evidenceHash: hash }), "evidenceHash");
const request = closedRecord({ schemaVersion: literalValue("capacity-lease-request-v1"), leaseId: nonEmptyString(), segmentId: nonEmptyString(), manifestHash: hash, budgetGuardHash: hash, priorityAssignmentHash: hash, routePolicyHash: hash, policyHash: hash, region: nonEmptyString(), projectId: nonEmptyString(), reservationAtMs: nn, deadlineAtMs: nn, rateUnits: arrayOf(rateUnits) });
const lease = withSelfHash(closedRecord({ schemaVersion: literalValue("capacity-lease-v1"), leaseId: nonEmptyString(), segmentId: nonEmptyString(), manifestHash: hash, budgetGuardHash: hash, priorityAssignmentHash: hash, routePolicyHash: hash, policyHash: hash, region: nonEmptyString(), projectId: nonEmptyString(), priorityClass, reservationAtMs: nn, deadlineAtMs: nn, rateUnits: arrayOf(rateUnits), state: leaseState, revision: nn, ticketId: nullable(nonEmptyString()), offeredAtMs: nullable(nn), maximumWaitUntilMs: nullable(nn), projectSequence: nullable(positive), lastCommandId: nonEmptyString(), lastCommandHash: hash, previousLeaseHash: nullable(hash), leaseHash: hash }), "leaseHash");
const snapshotShape = { schemaVersion: literalValue("capacity-state-v1"), observedAtMs: nn, currentOwnerAssignmentRefs: uniqueStrings, killedRefs: uniqueStrings, policy, observation, balance, queue, budgetGuards: arrayOf(budgetGuard), priorityAssignments: arrayOf(priorityAssignment), terminalEvidence: arrayOf(terminalEvidence), noDispatchEvidence: arrayOf(noDispatchEvidence), leases: arrayOf(lease) } as const;
const snapshot = closedRecord(snapshotShape);
const commandReceipt = withSelfHash(closedRecord({ sequence: positive, commandId: nonEmptyString(), commandHash: hash, commandJson: nonEmptyString(), beforeState: snapshot, afterState: snapshot, previousReceiptHash: nullable(hash), receiptHash: hash }), "receiptHash");
const state = closedRecord({ ...snapshotShape, commandRevision: nn, receiptHeadHash: nullable(hash), commandReceipts: arrayOf(commandReceipt) });
const offerCommand = closedRecord({ schemaVersion: literalValue("capacity-offer-command-v1"), kind: literalValue("offer"), commandId: nonEmptyString(), nowMs: nn, expectedPolicyHash: hash, expectedPolicyRevision: nn, expectedBalanceHash: hash, expectedBalanceRevision: nn, expectedQueueHash: hash, expectedQueueRevision: nn, observationHash: hash, ticketId: nonEmptyString(), lease: request });
const claimCommand = closedRecord({ schemaVersion: literalValue("capacity-claim-command-v1"), kind: literalValue("claim"), commandId: nonEmptyString(), nowMs: nn, leaseId: nonEmptyString(), expectedLeaseHash: hash, expectedLeaseRevision: nn, expectedBalanceHash: hash, expectedBalanceRevision: nn, expectedQueueHash: hash, expectedQueueRevision: nn, observationHash: hash, budgetGuardHash: hash, priorityAssignmentHash: hash });
const cancelCommand = closedRecord({ schemaVersion: literalValue("capacity-cancel-command-v1"), kind: literalValue("cancel"), commandId: nonEmptyString(), nowMs: nn, leaseId: nonEmptyString(), expectedLeaseHash: hash, expectedLeaseRevision: nn, expectedQueueHash: hash, expectedQueueRevision: nn, reason: cancelReason, evidenceHash: hash });
const segmentStatus = closedEnum(["active", "interrupted", "retryable-failure", "ambiguous", "completed", "failed", "cancelled", "rejected", "budget-exhausted"] as const);
const segmentCommand = closedRecord({ schemaVersion: literalValue("capacity-segment-command-v1"), kind: literalValue("observe-segment"), commandId: nonEmptyString(), nowMs: nn, leaseId: nonEmptyString(), expectedLeaseHash: hash, expectedLeaseRevision: nn, expectedBalanceHash: hash, expectedBalanceRevision: nn, segmentState: segmentStatus, evidenceHash: nullable(hash) });
const reconcileCommand = closedRecord({ schemaVersion: literalValue("capacity-reconcile-command-v1"), kind: literalValue("owner-reconcile"), commandId: nonEmptyString(), nowMs: nn, leaseId: nonEmptyString(), expectedLeaseHash: hash, expectedLeaseRevision: nn, expectedBalanceHash: hash, expectedBalanceRevision: nn, evidenceHash: hash });
export type HeldBudgetGuardV1 = InferValidator<typeof budgetGuard>; export type CapacityPolicyV1 = InferValidator<typeof policy>;
export type CapacityObservationV1 = InferValidator<typeof observation>; export type CapacityBalanceStateV1 = InferValidator<typeof balance>;
export type QueueTicketV1 = InferValidator<typeof ticket>; export type QueueStateV1 = InferValidator<typeof queue>;
export type CapacityLeaseV1 = InferValidator<typeof lease>; export type CapacityStateV1 = InferValidator<typeof state>;
export type CapacityReductionV1 = Readonly<{ disposition: "applied" | "attached" | "protected"; state: CapacityStateV1 }>;
type CapacitySnapshot = InferValidator<typeof snapshot>;
const add = (left: number, right: number): number | undefined => { const value = left + right; return Number.isSafeInteger(value) && value >= 0 ? value : undefined; };
const unique = (values: readonly string[]): boolean => values.length === new Set(values).size;
const textOrder = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
function currentAuthority(value: CapacityStateV1, now: number): boolean {
  return value.policy.effectiveAtMs <= now && now < value.policy.expiresAtMs && !value.killedRefs.includes(value.policy.killSwitchRef) && value.policy.acceptedOwnerAssignmentRefs.some((owner) => value.currentOwnerAssignmentRefs.includes(owner));
}
function policyInvariant(value: CapacityPolicyV1): boolean {
  return value.effectiveAtMs < value.expiresAtMs && value.fundingClasses.length === 1 && value.priorityClasses.length > 0
    && unique(value.priorityClasses) && value.fairShareWeights.length > 0 && unique(value.fairShareWeights.map((item) => item.projectId)) && value.ownerAssignmentRefs.length > 0 && value.acceptedOwnerAssignmentRefs.length > 0
    && value.acceptedOwnerAssignmentRefs.every((owner) => value.ownerAssignmentRefs.includes(owner));
}
function guardCurrent(value: HeldBudgetGuardV1, stateValue: CapacityStateV1, now: number): boolean {
  return value.scopeRevisions.length === 8 && unique(value.scopeRevisions.map((item) => item.scopeId)) && value.effectiveAtMs <= now && now < value.expiresAtMs
    && !stateValue.killedRefs.includes(value.killSwitchRef) && value.ownerAssignmentRefs.some((owner) => stateValue.currentOwnerAssignmentRefs.includes(owner));
}
function assignmentCurrent(value: InferValidator<typeof priorityAssignment>, stateValue: CapacityStateV1, now: number): boolean {
  return value.policyHash === stateValue.policy.policyHash && value.effectiveAtMs <= now && now < value.expiresAtMs && stateValue.policy.priorityClasses.includes(value.priorityClass) && stateValue.policy.fairShareWeights.some((item) => item.projectId === value.projectId);
}
function balanceInvariant(value: CapacityBalanceStateV1): boolean {
  return add(value.claimedSlots, value.remainingSlots) === value.slotLimit && unique(value.rateWindows.map((item) => item.windowId)) && value.rateWindows.every((item) => add(item.claimed, item.remaining) === item.limit && item.startsAtMs < item.endsAtMs);
}
function ticketOrder(policyValue: CapacityPolicyV1, left: QueueTicketV1, right: QueueTicketV1): number | undefined {
  const priority = policyValue.priorityClasses.indexOf(left.priorityClass) - policyValue.priorityClasses.indexOf(right.priorityClass);
  if (priority) return priority; const lw = policyValue.fairShareWeights.find((item) => item.projectId === left.projectId)?.weight;
  const rw = policyValue.fairShareWeights.find((item) => item.projectId === right.projectId)?.weight;
  if (!lw || !rw) return undefined; const l = left.projectSequence * rw; const r = right.projectSequence * lw;
  if (!Number.isSafeInteger(l) || !Number.isSafeInteger(r)) return undefined;
  return l !== r ? l - r : left.reservationAtMs !== right.reservationAtMs ? left.reservationAtMs - right.reservationAtMs : textOrder(left.segmentId, right.segmentId) || textOrder(left.ticketId, right.ticketId);
}
const sortableTickets = (policyValue: CapacityPolicyV1, values: readonly QueueTicketV1[]): boolean => values.every((item) => { const weight = policyValue.fairShareWeights.find((entry) => entry.projectId === item.projectId)?.weight; return weight !== undefined && Number.isSafeInteger(item.projectSequence * weight); });
function leaseBindings(value: CapacityLeaseV1, stateValue: CapacityStateV1): boolean {
  const guard = stateValue.budgetGuards.find((item) => item.guardHash === value.budgetGuardHash);
  const assignment = stateValue.priorityAssignments.find((item) => item.assignmentHash === value.priorityAssignmentHash);
  const timing = value.offeredAtMs === null
    ? value.maximumWaitUntilMs === null && value.projectSequence === null
    : value.maximumWaitUntilMs !== null && value.projectSequence !== null && value.offeredAtMs <= value.maximumWaitUntilMs;
  return !!guard && !!assignment && guard.segmentId === value.segmentId && guard.manifestHash === value.manifestHash
    && assignment.segmentId === value.segmentId && assignment.projectId === value.projectId
    && assignment.priorityClass === value.priorityClass && value.policyHash === stateValue.policy.policyHash
    && value.routePolicyHash === stateValue.policy.routePolicyHash && value.region === stateValue.policy.region
    && value.reservationAtMs < value.deadlineAtMs && value.rateUnits.length > 0
    && unique(value.rateUnits.map((item) => item.windowId)) && timing
    && (value.state === "queued" ? value.ticketId !== null : value.ticketId === null);
}
function ticketMatches(ticketValue: QueueTicketV1, leaseValue: CapacityLeaseV1): boolean {
  return leaseValue.state === "queued" && leaseValue.ticketId === ticketValue.ticketId
    && ticketValue.leaseId === leaseValue.leaseId && ticketValue.segmentId === leaseValue.segmentId && ticketValue.manifestHash === leaseValue.manifestHash
    && ticketValue.projectId === leaseValue.projectId && ticketValue.priorityClass === leaseValue.priorityClass && ticketValue.projectSequence === leaseValue.projectSequence
    && ticketValue.reservationAtMs === leaseValue.reservationAtMs && ticketValue.budgetGuardHash === leaseValue.budgetGuardHash
    && ticketValue.priorityAssignmentHash === leaseValue.priorityAssignmentHash && ticketValue.deadlineAtMs === leaseValue.deadlineAtMs && ticketValue.maximumWaitUntilMs === leaseValue.maximumWaitUntilMs;
}
function evidenceInvariant(value: InferValidator<typeof terminalEvidence>, stateValue: CapacityStateV1): boolean {
  const leaseValue = stateValue.leases.find((item) => item.leaseId === value.leaseId); const guard = leaseValue && stateValue.budgetGuards.find((item) => item.guardHash === leaseValue.budgetGuardHash);
  return !!leaseValue && !!guard && value.segmentId === leaseValue.segmentId && value.manifestHash === leaseValue.manifestHash
    && value.reservationHash === guard.reservationHash && (value.evidenceKind === "terminal-segment"
    ? value.ownerAssignmentRef === null && value.ownerEvidenceHash === null && value.issuedBy === "one-box-control-plane"
    : value.ownerAssignmentRef !== null && value.ownerEvidenceHash !== null && value.issuedBy === "capacity-owner"
      && stateValue.policy.acceptedOwnerAssignmentRefs.includes(value.ownerAssignmentRef));
}
type RecordedCommand = InferValidator<typeof offerCommand> | InferValidator<typeof claimCommand> | InferValidator<typeof cancelCommand> | InferValidator<typeof segmentCommand> | InferValidator<typeof reconcileCommand>;
function recordedCommand(text: string): Result<RecordedCommand> {
  const parsed = parseCanonicalJson(text); if (!parsed.ok) return parsed; const raw = parsed.value as { kind?: unknown };
  const validator = raw.kind === "offer" ? offerCommand : raw.kind === "claim" ? claimCommand : raw.kind === "cancel" ? cancelCommand : raw.kind === "observe-segment" ? segmentCommand : raw.kind === "owner-reconcile" ? reconcileCommand : undefined;
  return validator ? validator(parsed.value) : failure("UNSUPPORTED_VALUE", ["kind"]);
}
const snapshotOf = (value: CapacityStateV1): Result<CapacitySnapshot> => snapshot({ schemaVersion: value.schemaVersion, observedAtMs: value.observedAtMs, currentOwnerAssignmentRefs: value.currentOwnerAssignmentRefs, killedRefs: value.killedRefs, policy: value.policy, observation: value.observation, balance: value.balance, queue: value.queue, budgetGuards: value.budgetGuards, priorityAssignments: value.priorityAssignments, terminalEvidence: value.terminalEvidence, noDispatchEvidence: value.noDispatchEvidence, leases: value.leases });
const coreHash = (value: CapacityStateV1 | CapacitySnapshot) => canonicalSha256({ balance: value.balance, queue: value.queue, leases: value.leases });
function replayRecorded(value: CapacityStateV1, command: RecordedCommand, commandHash: string): Result<CapacityReductionV1> {
  return command.kind === "offer" ? applyOffer(value, command, commandHash) : command.kind === "claim" ? applyClaim(value, command, commandHash) : command.kind === "cancel" ? applyCancel(value, command, commandHash) : command.kind === "observe-segment" ? applySegment(value, command, commandHash) : applyReconcile(value, command, commandHash);
}
function historyInvariant(value: CapacityStateV1): boolean {
  const receipts = value.commandReceipts; const head = receipts.at(-1); if (receipts.length !== value.commandRevision || value.receiptHeadHash !== (head?.receiptHash ?? null) || !unique(receipts.map((item) => item.commandId)) || !unique(receipts.map((item) => item.commandHash))) return false;
  if (!receipts.length) return value.leases.length === 0 && value.queue.currentDepth === 0 && value.balance.claimedSlots === 0;
  const initial = receipts[0].beforeState; if (initial.leases.length || initial.queue.currentDepth || initial.balance.claimedSlots || initial.balance.rateWindows.some((item) => item.claimed) || initial.queue.projectCounters.some((item) => item.sequence)) return false;
  for (const [index, receipt] of receipts.entries()) { const command = recordedCommand(receipt.commandJson); const fingerprint = command.ok ? canonicalSha256(command.value) : command; if (!command.ok || !fingerprint.ok) return false;
    const priorCore = index ? coreHash(receipts[index - 1].afterState) : coreHash(receipt.beforeState); const beforeCore = coreHash(receipt.beforeState);
    const before = state({ ...receipt.beforeState, commandRevision: index, receiptHeadHash: receipts[index - 1]?.receiptHash ?? null, commandReceipts: receipts.slice(0, index) }); if (!before.ok) return false;
    const next = replayRecorded(before.value, command.value, fingerprint.value); if (!next.ok) return false; const after = snapshotOf(next.value.state); if (!after.ok) return false;
    const recordedHash = canonicalSha256(receipt.afterState); const actualHash = canonicalSha256(after.value);
    if (!priorCore.ok || !beforeCore.ok || !recordedHash.ok || !actualHash.ok || priorCore.value !== beforeCore.value || receipt.sequence !== index + 1 || receipt.commandId !== command.value.commandId || receipt.commandHash !== fingerprint.value || receipt.previousReceiptHash !== (receipts[index - 1]?.receiptHash ?? null) || recordedHash.value !== actualHash.value) return false; }
  const current = coreHash(value); const final = coreHash(receipts.at(-1)!.afterState); return current.ok && final.ok && current.value === final.value;
}
function noDispatchInvariant(value: InferValidator<typeof noDispatchEvidence>, stateValue: CapacityStateV1): boolean {
  const leaseValue = stateValue.leases.find((item) => item.leaseId === value.leaseId);
  const nextLeaseRevision = add(value.expectedLeaseRevision, 1); const queued = leaseValue?.state === "queued" && leaseValue.leaseHash === value.expectedLeaseHash
    && leaseValue.revision === value.expectedLeaseRevision && stateValue.queue.queueHash === value.expectedQueueHash
    && stateValue.queue.revision === value.expectedQueueRevision;
  const consumed = !!leaseValue && nextLeaseRevision !== undefined
    && leaseValue.previousLeaseHash === value.expectedLeaseHash && leaseValue.revision === nextLeaseRevision
    && leaseValue.state === (value.reason === "deadline" ? "expired" : "cancelled")
    && !stateValue.queue.tickets.some((item) => item.leaseId === leaseValue.leaseId);
  const authority = value.reason === "deadline" ? value.authorityRef === null
    : value.reason === "operator" ? value.authorityRef !== null && stateValue.currentOwnerAssignmentRefs.includes(value.authorityRef)
      && stateValue.policy.acceptedOwnerAssignmentRefs.includes(value.authorityRef)
    : value.authorityRef === stateValue.policy.killSwitchRef;
  return !!leaseValue && value.segmentId === leaseValue.segmentId && value.manifestHash === leaseValue.manifestHash
    && (queued || consumed) && authority && value.noDispatchAtMs < stateValue.policy.expiresAtMs;
}
function stateInvariant(value: CapacityStateV1): boolean {
  const bound = value.observation.policyHash === value.policy.policyHash
    && value.observation.routePolicyHash === value.policy.routePolicyHash && value.observation.region === value.policy.region
    && value.balance.policyHash === value.policy.policyHash && value.balance.routePolicyHash === value.policy.routePolicyHash
    && value.balance.region === value.policy.region && value.balance.slotLimit === value.policy.maximumConcurrentSegments
    && value.queue.policyHash === value.policy.policyHash && value.queue.routePolicyHash === value.policy.routePolicyHash
    && value.queue.maximumDepth === value.policy.maximumQueueDepth;
  const queueValid = value.queue.currentDepth === value.queue.tickets.length && value.queue.currentDepth <= value.queue.maximumDepth
    && unique(value.queue.tickets.map((item) => item.ticketId)) && unique(value.queue.tickets.map((item) => item.leaseId))
    && sortableTickets(value.policy, value.queue.tickets)
    && value.queue.tickets.every((item, index) => !index || ticketOrder(value.policy, value.queue.tickets[index - 1], item)! <= 0)
    && value.queue.tickets.every((item) => { const found = value.leases.find((leaseValue) => leaseValue.leaseId === item.leaseId);
      return !!found && ticketMatches(item, found); });
  const counters = value.queue.projectCounters.length === value.policy.fairShareWeights.length
    && value.queue.projectCounters.every((item, index) => item.projectId === value.policy.fairShareWeights[index]?.projectId)
    && value.queue.projectCounters.every((counter) => { const sequences = value.leases
      .filter((item) => item.projectId === counter.projectId && item.projectSequence !== null)
      .map((item) => item.projectSequence as number).sort((a, b) => a - b);
      return sequences.length === counter.sequence && sequences.every((item, index) => item === index + 1); });
  return policyInvariant(value.policy) && currentAuthority(value, value.observedAtMs) && bound
    && value.observation.observedAtMs < value.observation.expiresAtMs && balanceInvariant(value.balance)
    && queueValid && counters && unique(value.budgetGuards.map((item) => item.guardHash))
    && unique(value.priorityAssignments.map((item) => item.assignmentHash))
    && value.budgetGuards.every((item) => guardCurrent(item, value, value.observedAtMs))
    && value.priorityAssignments.every((item) => assignmentCurrent(item, value, value.observedAtMs))
    && historyInvariant(value) && unique(value.leases.map((item) => item.lastCommandId))
    && unique(value.leases.map((item) => item.leaseId)) && unique(value.leases.map((item) => item.segmentId))
    && value.leases.every((item) => leaseBindings(item, value)
      && item.rateUnits.every((unit) => value.balance.rateWindows.some((window) => window.windowId === unit.windowId)))
    && value.terminalEvidence.every((item) => evidenceInvariant(item, value))
    && unique(value.noDispatchEvidence.map((item) => item.evidenceHash)) && unique(value.noDispatchEvidence.map((item) => item.evidenceId))
    && unique(value.noDispatchEvidence.map((item) => item.leaseId))
    && value.noDispatchEvidence.every((item) => noDispatchInvariant(item, value))
    && value.leases.filter((item) => item.state === "claimed" || item.state === "reconciliation-hold").length === value.balance.claimedSlots;
}
export function validateCapacityState(input: unknown): Result<CapacityStateV1> { const parsed = state(input);
  return parsed.ok && stateInvariant(parsed.value) ? parsed : parsed.ok ? failure("INVARIANT_VIOLATION", []) : parsed; }
function sealRecord<T>(seed: Record<string, unknown>, field: string, validator: Validator<T>): Result<T> {
  const candidate = { ...seed, [field]: "0".repeat(64) }; const result = computeSelfHash(candidate, field);
  return result.ok ? validator({ ...candidate, [field]: result.value }) : result;
}
const sealBalance = (seed: Record<string, unknown>) => sealRecord(seed, "balanceHash", balance);
const sealQueue = (seed: Record<string, unknown>) => sealRecord(seed, "queueHash", queue);
const sealLease = (seed: Record<string, unknown>) => sealRecord(seed, "leaseHash", lease);
function currentObservation(value: CapacityStateV1, now: number, observationHash: string): boolean {
  const observed = value.observation; const windows = value.balance.rateWindows;
  return currentAuthority(value, now) && observationHash === observed.observationHash
    && observed.observedAtMs <= now && now < observed.expiresAtMs
    && observed.queueDepth === value.queue.currentDepth
    && observed.availableConcurrentSegments <= value.balance.remainingSlots
    && observed.rateWindowRemaining.length === windows.length
    && observed.rateWindowRemaining.every((item, index) => item.windowId === windows[index]?.windowId && item.remaining === windows[index]?.remaining)
    && windows.every((item) => item.startsAtMs <= now && now < item.endsAtMs);
}
function resources(value: CapacityStateV1, units: readonly InferValidator<typeof rateUnits>[]): boolean {
  return value.balance.remainingSlots > 0 && value.observation.availableConcurrentSegments > 0 && units.every((item) => { const window = value.balance.rateWindows.find((entry) => entry.windowId === item.windowId); return window !== undefined && window.remaining >= item.units; });
}
function claimBalance(value: CapacityBalanceStateV1, units: readonly InferValidator<typeof rateUnits>[]): Result<CapacityBalanceStateV1> {
  const claimedSlots = add(value.claimedSlots, 1); const revision = add(value.revision, 1);
  if (!value.remainingSlots || claimedSlots === undefined || revision === undefined) return failure("INVARIANT_VIOLATION", ["balance"]);
  const windows = value.rateWindows.map((window) => { const used = units.find((item) => item.windowId === window.windowId)?.units ?? 0;
    const claimed = add(window.claimed, used); const nextRevision = used ? add(window.revision, 1) : window.revision;
    return window.remaining < used || claimed === undefined || nextRevision === undefined ? undefined
      : Object.freeze({ ...window, claimed, remaining: window.remaining - used, revision: nextRevision }); });
  return windows.some((item) => item === undefined) ? failure("INVARIANT_VIOLATION", ["rateWindows"])
    : sealBalance({ ...value, claimedSlots, remainingSlots: value.remainingSlots - 1, revision, rateWindows: windows });
}
function releaseBalance(value: CapacityBalanceStateV1): Result<CapacityBalanceStateV1> {
  const remainingSlots = add(value.remainingSlots, 1); const revision = add(value.revision, 1);
  return !value.claimedSlots || remainingSlots === undefined || revision === undefined ? failure("INVARIANT_VIOLATION", ["balance"])
    : sealBalance({ ...value, claimedSlots: value.claimedSlots - 1, remainingSlots, revision });
}
const output = (disposition: CapacityReductionV1["disposition"], candidate: unknown): Result<CapacityReductionV1> => { const parsed = state(candidate); return parsed.ok ? success(Object.freeze({ disposition, state: parsed.value })) : parsed; };
const finish = (disposition: CapacityReductionV1["disposition"], candidate: unknown): Result<CapacityReductionV1> => { const parsed = validateCapacityState(candidate); return parsed.ok ? success(Object.freeze({ disposition, state: parsed.value })) : parsed; };
type LeaseCommand = { commandId: string; leaseId: string } | { commandId: string; lease: { leaseId: string } };
function execute<T extends LeaseCommand>(current: CapacityStateV1, command: T, reducer: (value: CapacityStateV1, input: T, commandHash: string) => Result<CapacityReductionV1>): Result<CapacityReductionV1> {
  const commandHash = canonicalSha256(command); const commandJson = canonicalize(command); if (!commandHash.ok) return commandHash; if (!commandJson.ok) return commandJson; const prior = current.commandReceipts.find((item) => item.commandId === command.commandId);
  if (prior) return prior.commandHash === commandHash.value ? finish("attached", current) : failure("INVARIANT_VIOLATION", ["commandId"]);
  const reduced = reducer(current, command, commandHash.value); const sequence = add(current.commandRevision, 1);
  if (!reduced.ok || sequence === undefined) return reduced.ok ? failure("INVALID_SAFE_INTEGER", ["commandRevision"]) : reduced;
  const beforeState = snapshotOf(current); const afterState = snapshotOf(reduced.value.state); if (!beforeState.ok) return beforeState; if (!afterState.ok) return afterState;
  const receipt = sealRecord({ sequence, commandId: command.commandId, commandHash: commandHash.value, commandJson: commandJson.value, beforeState: beforeState.value,
    afterState: afterState.value, previousReceiptHash: current.receiptHeadHash }, "receiptHash", commandReceipt); return receipt.ok
    ? finish(reduced.value.disposition, { ...reduced.value.state, commandRevision: sequence, receiptHeadHash: receipt.value.receiptHash, commandReceipts: [...current.commandReceipts, receipt.value] }) : receipt;
}
function requestBound(value: InferValidator<typeof request>, guard: HeldBudgetGuardV1, assignment: InferValidator<typeof priorityAssignment>, stateValue: CapacityStateV1, now: number): boolean {
  const waitUntil = add(now, stateValue.policy.maximumQueueWaitMs);
  return value.budgetGuardHash === guard.guardHash && value.priorityAssignmentHash === assignment.assignmentHash
    && value.segmentId === guard.segmentId && value.manifestHash === guard.manifestHash
    && value.segmentId === assignment.segmentId && value.projectId === assignment.projectId
    && value.policyHash === stateValue.policy.policyHash && value.routePolicyHash === stateValue.policy.routePolicyHash
    && value.region === stateValue.policy.region && value.reservationAtMs <= now
    && waitUntil !== undefined && waitUntil < value.deadlineAtMs && value.rateUnits.length > 0
    && unique(value.rateUnits.map((item) => item.windowId)) && guardCurrent(guard, stateValue, now)
    && assignmentCurrent(assignment, stateValue, now);
}
function applyOffer(current: CapacityStateV1, command: InferValidator<typeof offerCommand>, commandHash: string): Result<CapacityReductionV1> {
  const prior = current.leases.find((item) => item.leaseId === command.lease.leaseId);
  if (prior) return failure("INVARIANT_VIOLATION", ["leaseId"]);
  const guard = current.budgetGuards.find((item) => item.guardHash === command.lease.budgetGuardHash);
  const assignment = current.priorityAssignments.find((item) => item.assignmentHash === command.lease.priorityAssignmentHash);
  if (!guard || !assignment || command.expectedPolicyHash !== current.policy.policyHash
    || command.expectedPolicyRevision !== current.policy.revision || command.expectedBalanceHash !== current.balance.balanceHash
    || command.expectedBalanceRevision !== current.balance.revision || command.expectedQueueHash !== current.queue.queueHash
    || command.expectedQueueRevision !== current.queue.revision || !currentObservation(current, command.nowMs, command.observationHash)
    || !requestBound(command.lease, guard, assignment, current, command.nowMs)) return failure("INVARIANT_VIOLATION", ["admission"]);
  const common = { ...command.lease, schemaVersion: "capacity-lease-v1", priorityClass: assignment.priorityClass, revision: 0,
    lastCommandId: command.commandId, lastCommandHash: commandHash, previousLeaseHash: null };
  if (resources(current, command.lease.rateUnits)) {
    const nextBalance = claimBalance(current.balance, command.lease.rateUnits);
    const nextLease = sealLease({ ...common, state: "claimed", ticketId: null,
      offeredAtMs: null, maximumWaitUntilMs: null, projectSequence: null });
    if (!nextBalance.ok) return nextBalance; if (!nextLease.ok) return nextLease;
    return output("applied", { ...current, observedAtMs: command.nowMs,
      balance: nextBalance.value, leases: [...current.leases, nextLease.value] });
  }
  if (current.queue.currentDepth >= current.queue.maximumDepth) return failure("INVARIANT_VIOLATION", ["queue"]);
  const counterIndex = current.queue.projectCounters.findIndex((item) => item.projectId === assignment.projectId);
  const sequence = counterIndex < 0 ? undefined : add(current.queue.projectCounters[counterIndex].sequence, 1);
  const maximumWaitUntilMs = add(command.nowMs, current.policy.maximumQueueWaitMs);
  if (sequence === undefined || maximumWaitUntilMs === undefined) return failure("INVALID_SAFE_INTEGER", ["queue"]);
  const nextLease = sealLease({ ...common, state: "queued", ticketId: command.ticketId,
    offeredAtMs: command.nowMs, maximumWaitUntilMs, projectSequence: sequence });
  if (!nextLease.ok) return nextLease;
  const nextTicket = Object.freeze({ ticketId: command.ticketId, leaseId: command.lease.leaseId,
    segmentId: command.lease.segmentId, manifestHash: command.lease.manifestHash,
    projectId: assignment.projectId, priorityClass: assignment.priorityClass, projectSequence: sequence,
    reservationAtMs: command.lease.reservationAtMs, budgetGuardHash: guard.guardHash,
    priorityAssignmentHash: assignment.assignmentHash, deadlineAtMs: command.lease.deadlineAtMs, maximumWaitUntilMs });
  const tickets = [...current.queue.tickets, nextTicket]; if (!sortableTickets(current.policy, tickets)) return failure("INVALID_SAFE_INTEGER", ["queue"]);
  tickets.sort((a, b) => ticketOrder(current.policy, a, b)!);
  const counters = current.queue.projectCounters.map((item, index) => index === counterIndex ? { ...item, sequence } : item);
  const revision = add(current.queue.revision, 1); if (revision === undefined) return failure("INVALID_SAFE_INTEGER", ["queue"]);
  const nextQueue = sealQueue({ ...current.queue, currentDepth: current.queue.currentDepth + 1,
    tickets, projectCounters: counters, revision, previousQueueHash: current.queue.queueHash });
  return nextQueue.ok ? output("applied", { ...current, observedAtMs: command.nowMs,
    queue: nextQueue.value, leases: [...current.leases, nextLease.value] }) : nextQueue;
}
function applyClaim(current: CapacityStateV1, command: InferValidator<typeof claimCommand>, commandHash: string): Result<CapacityReductionV1> {
  const value = current.leases.find((item) => item.leaseId === command.leaseId);
  if (!value) return failure("INVARIANT_VIOLATION", ["leaseId"]);
  const guard = current.budgetGuards.find((item) => item.guardHash === value.budgetGuardHash);
  const assignment = current.priorityAssignments.find((item) => item.assignmentHash === value.priorityAssignmentHash);
  if (value.state !== "queued" || current.queue.tickets[0]?.leaseId !== value.leaseId || !guard || !assignment
    || command.expectedLeaseHash !== value.leaseHash || command.expectedLeaseRevision !== value.revision
    || command.expectedBalanceHash !== current.balance.balanceHash || command.expectedBalanceRevision !== current.balance.revision
    || command.expectedQueueHash !== current.queue.queueHash || command.expectedQueueRevision !== current.queue.revision
    || command.budgetGuardHash !== guard.guardHash || command.priorityAssignmentHash !== assignment.assignmentHash
    || !currentObservation(current, command.nowMs, command.observationHash)
    || value.maximumWaitUntilMs === null || command.nowMs > value.maximumWaitUntilMs
    || command.nowMs >= value.deadlineAtMs || !guardCurrent(guard, current, command.nowMs)
    || !assignmentCurrent(assignment, current, command.nowMs) || !resources(current, value.rateUnits))
    return failure("INVARIANT_VIOLATION", ["claim"]);
  const nextBalance = claimBalance(current.balance, value.rateUnits); const queueRevision = add(current.queue.revision, 1);
  const leaseRevision = add(value.revision, 1);
  if (!nextBalance.ok || queueRevision === undefined || leaseRevision === undefined) return nextBalance.ok
    ? failure("INVALID_SAFE_INTEGER", ["revision"]) : nextBalance;
  const nextQueue = sealQueue({ ...current.queue, currentDepth: current.queue.currentDepth - 1,
    tickets: current.queue.tickets.slice(1), revision: queueRevision, previousQueueHash: current.queue.queueHash });
  const nextLease = sealLease({ ...value, state: "claimed", ticketId: null, revision: leaseRevision,
    lastCommandId: command.commandId, lastCommandHash: commandHash, previousLeaseHash: value.leaseHash });
  if (!nextQueue.ok) return nextQueue; if (!nextLease.ok) return nextLease;
  return output("applied", { ...current, observedAtMs: command.nowMs, balance: nextBalance.value, queue: nextQueue.value,
    leases: current.leases.map((item) => item.leaseId === value.leaseId ? nextLease.value : item) });
}
function removeQueued(current: CapacityStateV1, value: CapacityLeaseV1, commandId: string, commandHash: string,
  stateValue: "cancelled" | "expired", now: number): Result<CapacityReductionV1> {
  const revision = add(value.revision, 1); const queueRevision = add(current.queue.revision, 1);
  const index = current.queue.tickets.findIndex((item) => item.leaseId === value.leaseId);
  if (index < 0 || revision === undefined || queueRevision === undefined) return failure("INVARIANT_VIOLATION", ["queue"]);
  const nextLease = sealLease({ ...value, state: stateValue, ticketId: null, revision,
    lastCommandId: commandId, lastCommandHash: commandHash, previousLeaseHash: value.leaseHash });
  const nextQueue = sealQueue({ ...current.queue, currentDepth: current.queue.currentDepth - 1,
    tickets: current.queue.tickets.filter((_, itemIndex) => itemIndex !== index),
    revision: queueRevision, previousQueueHash: current.queue.queueHash });
  if (!nextLease.ok) return nextLease; if (!nextQueue.ok) return nextQueue;
  return output("applied", { ...current, observedAtMs: now, queue: nextQueue.value,
    leases: current.leases.map((item) => item.leaseId === value.leaseId ? nextLease.value : item) });
}
function applyCancel(current: CapacityStateV1, command: InferValidator<typeof cancelCommand>, commandHash: string): Result<CapacityReductionV1> {
  const value = current.leases.find((item) => item.leaseId === command.leaseId);
  if (!value) return failure("INVARIANT_VIOLATION", ["leaseId"]);
  if (value.state !== "queued" || command.expectedLeaseHash !== value.leaseHash
    || command.expectedLeaseRevision !== value.revision || command.expectedQueueHash !== current.queue.queueHash
    || command.expectedQueueRevision !== current.queue.revision) return failure("INVARIANT_VIOLATION", ["cancel"]);
  const evidence = current.noDispatchEvidence.find((item) => item.evidenceHash === command.evidenceHash);
  const deadline = evidence && value.maximumWaitUntilMs !== null && command.nowMs >= value.maximumWaitUntilMs
    && evidence.noDispatchAtMs >= value.maximumWaitUntilMs;
  const authority = command.reason === "deadline" ? deadline : currentAuthority(current, command.nowMs)
    && (command.reason === "operator" ? evidence?.authorityRef !== null
      && current.currentOwnerAssignmentRefs.includes(evidence?.authorityRef ?? "")
      : evidence?.authorityRef === current.policy.killSwitchRef);
  if (!evidence || evidence.leaseId !== value.leaseId || evidence.expectedLeaseHash !== value.leaseHash
    || evidence.expectedLeaseRevision !== value.revision || evidence.expectedQueueHash !== current.queue.queueHash
    || evidence.expectedQueueRevision !== current.queue.revision || evidence.reason !== command.reason
    || evidence.noDispatchAtMs > command.nowMs || !authority) return failure("INVARIANT_VIOLATION", ["evidenceHash"]);
  return removeQueued(current, value, command.commandId, commandHash, command.reason === "deadline" ? "expired" : "cancelled", command.nowMs);
}
function releaseClaimed(current: CapacityStateV1, value: CapacityLeaseV1, commandId: string, commandHash: string, now: number): Result<CapacityReductionV1> {
  const nextBalance = releaseBalance(current.balance); const revision = add(value.revision, 1);
  if (!nextBalance.ok || revision === undefined) return nextBalance.ok ? failure("INVALID_SAFE_INTEGER", ["revision"]) : nextBalance;
  const nextLease = sealLease({ ...value, state: "released", revision,
    lastCommandId: commandId, lastCommandHash: commandHash, previousLeaseHash: value.leaseHash });
  return nextLease.ok ? output("applied", { ...current, observedAtMs: now, balance: nextBalance.value,
    leases: current.leases.map((item) => item.leaseId === value.leaseId ? nextLease.value : item) }) : nextLease;
}
function applySegment(current: CapacityStateV1, command: InferValidator<typeof segmentCommand>, commandHash: string): Result<CapacityReductionV1> {
  const value = current.leases.find((item) => item.leaseId === command.leaseId);
  if (!value) return failure("INVARIANT_VIOLATION", ["leaseId"]);
  if (command.expectedLeaseHash !== value.leaseHash || command.expectedLeaseRevision !== value.revision
    || command.expectedBalanceHash !== current.balance.balanceHash || command.expectedBalanceRevision !== current.balance.revision)
    return failure("INVARIANT_VIOLATION", ["segment"]);
  if (["active", "interrupted", "retryable-failure"].includes(command.segmentState))
    return value.state === "claimed" && command.evidenceHash === null
      ? success(Object.freeze({ disposition: "protected", state: current })) : failure("INVARIANT_VIOLATION", ["segment"]);
  if (command.segmentState === "ambiguous") {
    if (value.state !== "claimed" || command.evidenceHash !== null) return failure("INVARIANT_VIOLATION", ["segment"]);
    const revision = add(value.revision, 1); if (revision === undefined) return failure("INVALID_SAFE_INTEGER", ["revision"]);
    const nextLease = sealLease({ ...value, state: "reconciliation-hold", revision,
      lastCommandId: command.commandId, lastCommandHash: commandHash, previousLeaseHash: value.leaseHash });
    return nextLease.ok ? output("applied", { ...current, observedAtMs: command.nowMs,
      leases: current.leases.map((item) => item.leaseId === value.leaseId ? nextLease.value : item) }) : nextLease;
  }
  const evidence = current.terminalEvidence.find((item) => item.evidenceHash === command.evidenceHash);
  return value.state === "claimed" && evidence?.evidenceKind === "terminal-segment"
    && evidence.leaseId === value.leaseId && evidence.terminalStatus === command.segmentState
    ? releaseClaimed(current, value, command.commandId, commandHash, command.nowMs)
    : failure("INVARIANT_VIOLATION", ["evidenceHash"]);
}
function applyReconcile(current: CapacityStateV1, command: InferValidator<typeof reconcileCommand>, commandHash: string): Result<CapacityReductionV1> {
  const value = current.leases.find((item) => item.leaseId === command.leaseId);
  if (!value) return failure("INVARIANT_VIOLATION", ["leaseId"]);
  const evidence = current.terminalEvidence.find((item) => item.evidenceHash === command.evidenceHash);
  if (value.state !== "reconciliation-hold" || !evidence || evidence.evidenceKind !== "owner-reconciliation"
    || evidence.leaseId !== value.leaseId || evidence.ownerAssignmentRef === null
    || !current.currentOwnerAssignmentRefs.includes(evidence.ownerAssignmentRef)
    || command.expectedLeaseHash !== value.leaseHash || command.expectedLeaseRevision !== value.revision
    || command.expectedBalanceHash !== current.balance.balanceHash || command.expectedBalanceRevision !== current.balance.revision
    || !currentAuthority(current, command.nowMs)) return failure("INVARIANT_VIOLATION", ["owner-reconcile"]);
  return releaseClaimed(current, value, command.commandId, commandHash, command.nowMs);
}
export function reduceCapacity(stateInput: unknown, commandInput: unknown): Result<CapacityReductionV1> {
  const current = validateCapacityState(stateInput); if (!current.ok) return current;
  let kind: unknown;
  try { const descriptor = commandInput !== null && typeof commandInput === "object"
      ? Object.getOwnPropertyDescriptor(commandInput, "kind") : undefined;
    kind = descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch { return failure("UNSUPPORTED_VALUE", []); }
  if (kind === "offer") { const command = offerCommand(commandInput); return command.ok ? execute(current.value, command.value, applyOffer) : command; }
  if (kind === "claim") { const command = claimCommand(commandInput); return command.ok ? execute(current.value, command.value, applyClaim) : command; }
  if (kind === "cancel") { const command = cancelCommand(commandInput); return command.ok ? execute(current.value, command.value, applyCancel) : command; }
  if (kind === "observe-segment") { const command = segmentCommand(commandInput); return command.ok ? execute(current.value, command.value, applySegment) : command; }
  if (kind === "owner-reconcile") { const command = reconcileCommand(commandInput); return command.ok ? execute(current.value, command.value, applyReconcile) : command; }
  return failure("UNSUPPORTED_VALUE", ["kind"]);
}
