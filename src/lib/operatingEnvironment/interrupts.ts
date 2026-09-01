import { computeSelfHash } from "./canonical";
import {
  booleanValue,
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
const revision = refine(safeInteger(), (value) => value >= 0);
const utcTimestamp = refine(nonEmptyString(), (value) => {
  if (!UTC_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    && new Date(milliseconds).toISOString() === value.replace("Z", ".000Z");
});
const nullable = <T>(validator: Validator<T>): Validator<T | null> =>
  (input: unknown, path: ContractPath = []) => input === null ? success(null) : validator(input, path);

const interruptValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("human-interrupt-v1"),
  interruptId: nonEmptyString(),
  jobId: nonEmptyString(),
  segmentId: nonEmptyString(),
  invocationId: nullable(nonEmptyString()),
  intentHash: hashValue,
  segmentManifestHash: hashValue,
  completedAttemptHash: hashValue,
  proposalEnvelopeHash: hashValue,
  expectedProjectStateHash: hashValue,
  expectedCandidateHash: hashValue,
  issuer: literalValue("one-box-control-plane"),
  issuerPolicyHash: hashValue,
  reasonCode: literalValue("proposal-review-required"),
  requestedDecisionSchemaHash: hashValue,
  safeSummary: nonEmptyString(),
  createdAt: utcTimestamp,
  expiresAt: utcTimestamp,
  interruptHash: hashValue,
}), "interruptHash");

const decisionValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("human-decision-v1"),
  decisionId: nonEmptyString(),
  interruptHash: hashValue,
  actorId: refine(nonEmptyString(), (value) => value.startsWith("person:")),
  projectId: nonEmptyString(),
  decisionSchemaHash: hashValue,
  decisionValue: closedEnum(["accept-proposal", "reject", "cancel"] as const),
  rationaleHash: hashValue,
  policyHash: hashValue,
  createdAt: utcTimestamp,
  expiresAt: utcTimestamp,
  decisionHash: hashValue,
}), "decisionHash");

const slotValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("interrupt-decision-slot-v1"),
  interruptHash: hashValue,
  state: closedEnum(["undecided", "decided"] as const),
  decisionHash: nullable(hashValue),
  stateRevision: revision,
  previousSlotHash: nullable(hashValue),
  updatedAt: utcTimestamp,
  slotHash: hashValue,
}), "slotHash");

const directiveValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("proposal-terminal-directive-v1"),
  segmentId: nonEmptyString(),
  intentHash: hashValue,
  segmentManifestHash: hashValue,
  interruptHash: hashValue,
  decisionHash: hashValue,
  terminalState: closedEnum(["completed", "cancelled"] as const),
  reason: closedEnum([
    "proposal-accepted", "proposal-rejected", "proposal-cancelled", "live-gate-failed",
  ] as const),
  workDirective: literalValue("none"),
  effectDirective: literalValue("none"),
  createdAt: utcTimestamp,
  directiveHash: hashValue,
}), "directiveHash");

const controlValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("proposal-interrupt-control-v1"),
  projectId: nonEmptyString(),
  interrupt: interruptValidator,
  slot: slotValidator,
  terminalDirective: nullable(directiveValidator),
  stateRevision: revision,
  attachmentEventHash: hashValue,
  decisionEventHash: nullable(hashValue),
  controlHash: hashValue,
}), "controlHash");

const attachmentEventValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("interrupt-attachment-event-v1"),
  projectId: nonEmptyString(),
  interrupt: interruptValidator,
  genesisSlot: slotValidator,
  attemptState: literalValue("completed"),
  proposalState: literalValue("validated-unapplied"),
  hasLiveWork: literalValue(false),
  eventHash: hashValue,
}), "eventHash");

const liveGateValidator = closedRecord({
  actorAuthorized: booleanValue(),
  authorizationCurrent: booleanValue(),
  ownershipCurrent: booleanValue(),
  contextCurrent: booleanValue(),
  routeCurrent: booleanValue(),
  skillCurrent: booleanValue(),
  toolGrantCurrent: booleanValue(),
  budgetCurrent: booleanValue(),
  deadlineCurrent: booleanValue(),
  reservationHeld: booleanValue(),
  killSwitchesOff: booleanValue(),
});

const decisionEventValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("interrupt-decision-event-v1"),
  expectedRevision: revision,
  decision: decisionValidator,
  observedAt: utcTimestamp,
  projectStateHash: hashValue,
  candidateHash: hashValue,
  completedAttemptHash: hashValue,
  proposalEnvelopeHash: hashValue,
  live: liveGateValidator,
  eventHash: hashValue,
}), "eventHash");

export type HumanInterruptV1 = InferValidator<typeof interruptValidator>;
export type HumanDecisionV1 = InferValidator<typeof decisionValidator>;
export type InterruptDecisionSlotV1 = InferValidator<typeof slotValidator>;
export type ProposalTerminalDirectiveV1 = InferValidator<typeof directiveValidator>;
export type ProposalInterruptControlV1 = InferValidator<typeof controlValidator>;
export type InterruptAttachmentEventV1 = InferValidator<typeof attachmentEventValidator>;
export type InterruptDecisionEventV1 = InferValidator<typeof decisionEventValidator>;
export type InterruptAttachmentV1 = Readonly<{
  disposition: "applied" | "attached";
  state: ProposalInterruptControlV1;
}>;
export type InterruptDecisionReductionV1 = Readonly<{
  disposition: "applied" | "attached";
  state: ProposalInterruptControlV1;
  directive: ProposalTerminalDirectiveV1;
}>;

function interruptInvariant(interrupt: HumanInterruptV1): boolean {
  return Date.parse(interrupt.createdAt) < Date.parse(interrupt.expiresAt);
}

export function validateHumanInterrupt(input: unknown): Result<HumanInterruptV1> {
  const parsed = interruptValidator(input);
  if (!parsed.ok) return parsed;
  return interruptInvariant(parsed.value)
    ? parsed
    : failure("INVARIANT_VIOLATION", ["expiresAt"]);
}

function genesisInvariant(slot: InterruptDecisionSlotV1, interrupt: HumanInterruptV1): boolean {
  return slot.interruptHash === interrupt.interruptHash
    && slot.state === "undecided"
    && slot.decisionHash === null
    && slot.stateRevision === 0
    && slot.previousSlotHash === null
    && slot.updatedAt === interrupt.createdAt;
}

function decidedInvariant(
  slot: InterruptDecisionSlotV1,
  interrupt: HumanInterruptV1,
  directive: ProposalTerminalDirectiveV1,
): boolean {
  return slot.interruptHash === interrupt.interruptHash
    && slot.state === "decided"
    && slot.decisionHash !== null
    && slot.stateRevision === 1
    && slot.previousSlotHash !== null
    && directive.interruptHash === interrupt.interruptHash
    && directive.decisionHash === slot.decisionHash
    && directive.segmentId === interrupt.segmentId
    && directive.intentHash === interrupt.intentHash
    && directive.segmentManifestHash === interrupt.segmentManifestHash;
}

function controlInvariant(control: ProposalInterruptControlV1): boolean {
  if (!interruptInvariant(control.interrupt)) return false;
  if (control.stateRevision === 0) {
    return genesisInvariant(control.slot, control.interrupt)
      && control.terminalDirective === null
      && control.decisionEventHash === null;
  }
  return control.stateRevision === 1
    && control.terminalDirective !== null
    && control.decisionEventHash !== null
    && decidedInvariant(control.slot, control.interrupt, control.terminalDirective);
}

function sealControl(value: Record<string, unknown>): Result<ProposalInterruptControlV1> {
  const candidate = { ...value, controlHash: "0".repeat(64) };
  const hash = computeSelfHash(candidate, "controlHash");
  if (!hash.ok) return hash;
  const parsed = controlValidator({ ...candidate, controlHash: hash.value });
  if (!parsed.ok) return parsed;
  return controlInvariant(parsed.value)
    ? parsed
    : failure("INVARIANT_VIOLATION", ["state"]);
}

export function attachHumanInterrupt(
  currentInput: unknown | null,
  eventInput: unknown,
): Result<InterruptAttachmentV1> {
  const event = attachmentEventValidator(eventInput);
  if (!event.ok) return event;
  if (!interruptInvariant(event.value.interrupt)
    || !genesisInvariant(event.value.genesisSlot, event.value.interrupt)) {
    return failure("INVARIANT_VIOLATION", ["genesisSlot"]);
  }
  if (currentInput !== null) {
    const current = controlValidator(currentInput);
    if (!current.ok) return current;
    if (!controlInvariant(current.value)
      || current.value.attachmentEventHash !== event.value.eventHash
      || current.value.interrupt.interruptHash !== event.value.interrupt.interruptHash) {
      return failure("INVARIANT_VIOLATION", ["interrupt"]);
    }
    return success(Object.freeze({ disposition: "attached", state: current.value }));
  }
  const state = sealControl({
    schemaVersion: "proposal-interrupt-control-v1",
    projectId: event.value.projectId,
    interrupt: event.value.interrupt,
    slot: event.value.genesisSlot,
    terminalDirective: null,
    stateRevision: 0,
    attachmentEventHash: event.value.eventHash,
    decisionEventHash: null,
  });
  return state.ok
    ? success(Object.freeze({ disposition: "applied", state: state.value }))
    : state;
}

function decisionBindingsMatch(
  control: ProposalInterruptControlV1,
  event: InterruptDecisionEventV1,
): boolean {
  const interrupt = control.interrupt;
  const decision = event.decision;
  return decision.interruptHash === interrupt.interruptHash
    && decision.projectId === control.projectId
    && decision.decisionSchemaHash === interrupt.requestedDecisionSchemaHash
    && event.completedAttemptHash === interrupt.completedAttemptHash
    && event.proposalEnvelopeHash === interrupt.proposalEnvelopeHash
    && Date.parse(decision.createdAt) >= Date.parse(interrupt.createdAt)
    && Date.parse(decision.createdAt) <= Date.parse(event.observedAt)
    && Date.parse(decision.createdAt) < Date.parse(decision.expiresAt);
}

function completionIsLive(
  control: ProposalInterruptControlV1,
  event: InterruptDecisionEventV1,
): boolean {
  const observed = Date.parse(event.observedAt);
  return Object.values(event.live).every((value) => value)
    && event.projectStateHash === control.interrupt.expectedProjectStateHash
    && event.candidateHash === control.interrupt.expectedCandidateHash
    && Date.parse(control.interrupt.createdAt) <= observed
    && observed < Date.parse(control.interrupt.expiresAt)
    && observed < Date.parse(event.decision.expiresAt);
}

function sealDirective(value: Record<string, unknown>): Result<ProposalTerminalDirectiveV1> {
  const candidate = { ...value, directiveHash: "0".repeat(64) };
  const hash = computeSelfHash(candidate, "directiveHash");
  return hash.ok
    ? directiveValidator({ ...candidate, directiveHash: hash.value })
    : hash;
}

function sealDecidedSlot(
  control: ProposalInterruptControlV1,
  event: InterruptDecisionEventV1,
): Result<InterruptDecisionSlotV1> {
  const candidate = {
    schemaVersion: "interrupt-decision-slot-v1",
    interruptHash: control.interrupt.interruptHash,
    state: "decided",
    decisionHash: event.decision.decisionHash,
    stateRevision: 1,
    previousSlotHash: control.slot.slotHash,
    updatedAt: event.observedAt,
    slotHash: "0".repeat(64),
  };
  const hash = computeSelfHash(candidate, "slotHash");
  return hash.ok ? slotValidator({ ...candidate, slotHash: hash.value }) : hash;
}

export function reduceInterruptDecision(
  controlInput: unknown,
  eventInput: unknown,
): Result<InterruptDecisionReductionV1> {
  const control = controlValidator(controlInput);
  if (!control.ok) return control;
  if (!controlInvariant(control.value)) return failure("INVARIANT_VIOLATION", ["state"]);
  const event = decisionEventValidator(eventInput);
  if (!event.ok) return event;
  if (control.value.stateRevision === 1) {
    if (control.value.decisionEventHash === event.value.eventHash
      && control.value.slot.decisionHash === event.value.decision.decisionHash
      && control.value.terminalDirective !== null) {
      return success(Object.freeze({
        disposition: "attached",
        state: control.value,
        directive: control.value.terminalDirective,
      }));
    }
    return failure("INVARIANT_VIOLATION", ["decision"]);
  }
  if (event.value.expectedRevision !== control.value.stateRevision
    || !decisionBindingsMatch(control.value, event.value)) {
    return failure("INVARIANT_VIOLATION", ["expectedRevision"]);
  }
  const isAccepted = event.value.decision.decisionValue === "accept-proposal";
  const isLive = completionIsLive(control.value, event.value);
  const terminalState = isAccepted && isLive ? "completed" : "cancelled";
  const reason = !isAccepted
    ? event.value.decision.decisionValue === "reject"
      ? "proposal-rejected" : "proposal-cancelled"
    : isLive ? "proposal-accepted" : "live-gate-failed";
  const directive = sealDirective({
    schemaVersion: "proposal-terminal-directive-v1",
    segmentId: control.value.interrupt.segmentId,
    intentHash: control.value.interrupt.intentHash,
    segmentManifestHash: control.value.interrupt.segmentManifestHash,
    interruptHash: control.value.interrupt.interruptHash,
    decisionHash: event.value.decision.decisionHash,
    terminalState,
    reason,
    workDirective: "none",
    effectDirective: "none",
    createdAt: event.value.observedAt,
  });
  if (!directive.ok) return directive;
  const slot = sealDecidedSlot(control.value, event.value);
  if (!slot.ok) return slot;
  const state = sealControl({
    ...control.value,
    slot: slot.value,
    terminalDirective: directive.value,
    stateRevision: 1,
    decisionEventHash: event.value.eventHash,
  });
  return state.ok
    ? success(Object.freeze({
      disposition: "applied", state: state.value, directive: directive.value,
    }))
    : state;
}
