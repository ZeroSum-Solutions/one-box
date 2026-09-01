import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalize, canonicalSha256, computeSelfHash } from "./canonical"; import fixture from "./fixtures/budget-capacity-v1.json";
import { reduceCapacity, validateCapacityState, type CapacityLeaseV1, type CapacityStateV1 } from "./capacity";
const H = (char: string) => char.repeat(64); const SCOPE_IDS = ["agency-1", "project-1", "assignment-1", "compare-1", "segment-1", "retry-1", "evaluator-1", "reviewer-1"];
function seal<T extends Record<string, unknown>>(record: T, field: string): T {
  const candidate = { ...record, [field]: H("0") }; const result = computeSelfHash(candidate, field);
  if (!result.ok) throw new Error(result.reason); return { ...candidate, [field]: result.value } as T;
}
function baseState(): CapacityStateV1 {
  const policy = seal({ schemaVersion: "capacity-policy-v1", policyId: "capacity-policy-1",
    routePolicyHash: H("a"), providerEntryHash: H("b"), exactModelIdentity: "synthetic-offline-v1", region: "offline",
    fundingClasses: ["synthetic"], maximumConcurrentSegments: 1, maximumQueueDepth: 4, maximumQueueWaitMs: 100,
    priorityClasses: ["urgent", "standard", "background"], fairShareWeights: [{ projectId: "project-a", weight: 2 }, { projectId: "project-b", weight: 1 }],
    ownerAssignmentRefs: ["owner:capacity"], acceptedOwnerAssignmentRefs: ["owner:capacity"], killSwitchRef: "kill:capacity", effectiveAtMs: 1000, expiresAtMs: 5000,
    revision: 0, policyHash: H("0") } as const, "policyHash");
  const observation = seal({ schemaVersion: "capacity-observation-v1", policyHash: policy.policyHash,
    routePolicyHash: policy.routePolicyHash, region: "offline", availableConcurrentSegments: 1,
    rateWindowRemaining: [{ windowId: "requests-1m", remaining: 3 }], queueDepth: 0,
    source: "fixture", observedAtMs: 1100, expiresAtMs: 1500, observationHash: H("0") } as const, "observationHash");
  const balance = seal({ schemaVersion: "capacity-balance-v1", policyHash: policy.policyHash,
    routePolicyHash: policy.routePolicyHash, region: "offline", slotLimit: 1,
    claimedSlots: 0, remainingSlots: 1, revision: 0,
    rateWindows: [{ windowId: "requests-1m", limit: 3, claimed: 0, remaining: 3,
      startsAtMs: 1000, endsAtMs: 2000, revision: 0 }], balanceHash: H("0") } as const, "balanceHash");
  const queue = seal({ schemaVersion: "queue-state-v1", policyHash: policy.policyHash,
    routePolicyHash: policy.routePolicyHash, maximumDepth: 4, currentDepth: 0, tickets: [],
    projectCounters: [{ projectId: "project-a", sequence: 0 }, { projectId: "project-b", sequence: 0 }],
    revision: 0, previousQueueHash: null, queueHash: H("0") } as const, "queueHash");
  return { schemaVersion: "capacity-state-v1", observedAtMs: 1100, commandRevision: 0, receiptHeadHash: null,
    currentOwnerAssignmentRefs: ["owner:capacity"], killedRefs: [], policy, observation,
    balance, queue, budgetGuards: [], priorityAssignments: [], terminalEvidence: [], noDispatchEvidence: [], commandReceipts: [], leases: [] };
}
function admit(state: CapacityStateV1, suffix: string, projectId = "project-a", priorityClass = "standard") {
  const segmentId = `segment-${suffix}`; const manifestHash = H("c");
  const guard = seal({ schemaVersion: "held-budget-guard-v1", guardId: `guard-${suffix}`,
    segmentId, manifestHash, state: "held", reservationId: `reservation-${suffix}`,
    reservationHash: H("1"), reservationRevision: 0, hierarchyHash: H("2"),
    scopeRevisions: SCOPE_IDS.map((scopeId) => ({ scopeId, revision: 1 })),
    budgetPolicyHash: H("8"), ownerAssignmentRefs: ["owner:capacity"],
    killSwitchRef: "kill:budget", effectiveAtMs: 1000, expiresAtMs: 5000,
    guardHash: H("0") }, "guardHash");
  const priority = seal({ schemaVersion: "capacity-priority-assignment-v1",
    assignmentId: `priority-${suffix}`, policyHash: state.policy.policyHash, projectId,
    segmentId, priorityClass, issuedBy: "one-box-control-plane", effectiveAtMs: 1000,
    expiresAtMs: 5000, assignmentHash: H("0") }, "assignmentHash");
  return { guard, priority, state: { ...state,
    budgetGuards: [...state.budgetGuards, guard],
    priorityAssignments: [...state.priorityAssignments, priority] } };
}
function refresh(state: CapacityStateV1, nowMs: number, expiresAtMs = nowMs + 300) {
  const observation = seal({ ...state.observation,
    availableConcurrentSegments: state.balance.remainingSlots,
    rateWindowRemaining: state.balance.rateWindows.map(({ windowId, remaining }) => ({ windowId, remaining })),
    queueDepth: state.queue.currentDepth, observedAtMs: nowMs, expiresAtMs,
  }, "observationHash");
  return { ...state, observedAtMs: nowMs, observation };
}
function offer(admission: ReturnType<typeof admit>, nowMs = 1100, suffix?: string) {
  const id = suffix ?? admission.guard.guardId.slice(6);
  const state = admission.state;
  return { schemaVersion: "capacity-offer-command-v1", kind: "offer", commandId: `offer-${id}`,
    nowMs, expectedPolicyHash: state.policy.policyHash, expectedPolicyRevision: state.policy.revision,
    expectedBalanceHash: state.balance.balanceHash, expectedBalanceRevision: state.balance.revision,
    expectedQueueHash: state.queue.queueHash, expectedQueueRevision: state.queue.revision,
    observationHash: state.observation.observationHash, ticketId: `ticket-${id}`,
    lease: { schemaVersion: "capacity-lease-request-v1", leaseId: `lease-${id}`,
      segmentId: admission.guard.segmentId, manifestHash: admission.guard.manifestHash,
      budgetGuardHash: admission.guard.guardHash,
      priorityAssignmentHash: admission.priority.assignmentHash,
      routePolicyHash: state.policy.routePolicyHash, policyHash: state.policy.policyHash,
      region: state.policy.region, projectId: admission.priority.projectId,
      reservationAtMs: nowMs, deadlineAtMs: 4000,
      rateUnits: [{ windowId: "requests-1m", units: 1 }] } };
}
function claim(state: CapacityStateV1, lease: CapacityLeaseV1, nowMs = 1250) {
  return { schemaVersion: "capacity-claim-command-v1", kind: "claim", commandId: `claim-${lease.leaseId}`,
    nowMs, leaseId: lease.leaseId, expectedLeaseHash: lease.leaseHash,
    expectedLeaseRevision: lease.revision, expectedBalanceHash: state.balance.balanceHash,
    expectedBalanceRevision: state.balance.revision, expectedQueueHash: state.queue.queueHash,
    expectedQueueRevision: state.queue.revision, observationHash: state.observation.observationHash,
    budgetGuardHash: lease.budgetGuardHash, priorityAssignmentHash: lease.priorityAssignmentHash };
}
function terminalEvidence(state: CapacityStateV1, lease: CapacityLeaseV1, kind: "terminal-segment" | "owner-reconciliation") {
  const owner = kind === "owner-reconciliation";
  const evidence = seal({ schemaVersion: "capacity-terminal-evidence-v1",
    evidenceId: `${kind}-${lease.leaseId}`, evidenceKind: kind, leaseId: lease.leaseId,
    segmentId: lease.segmentId, manifestHash: lease.manifestHash,
    reservationHash: state.budgetGuards.find((item) => item.guardHash === lease.budgetGuardHash)?.reservationHash ?? H("f"),
    terminalStatus: "failed", terminalReceiptHash: H("d"),
    ownerAssignmentRef: owner ? "owner:capacity" : null,
    ownerEvidenceHash: owner ? H("e") : null,
    issuedBy: owner ? "capacity-owner" : "one-box-control-plane", evidenceHash: H("0") }, "evidenceHash");
  return { evidence, state: { ...state, terminalEvidence: [...state.terminalEvidence, evidence] } };
}
function noDispatch(state: CapacityStateV1, lease: CapacityLeaseV1, reason: "deadline" | "operator" | "kill-switch", atMs: number) {
  const authorityRef = reason === "operator" ? "owner:capacity" : reason === "kill-switch" ? "kill:capacity" : null;
  const evidence = seal({ schemaVersion: "capacity-no-dispatch-evidence-v1", evidenceId: `no-dispatch-${reason}`,
    leaseId: lease.leaseId, segmentId: lease.segmentId, manifestHash: lease.manifestHash,
    expectedLeaseHash: lease.leaseHash, expectedLeaseRevision: lease.revision,
    expectedQueueHash: state.queue.queueHash, expectedQueueRevision: state.queue.revision,
    reason, authorityRef, noDispatchAtMs: atMs, issuedBy: "one-box-control-plane",
    evidenceHash: H("0") }, "evidenceHash");
  return { evidence, state: { ...state, noDispatchEvidence: [evidence] } };
}
describe("capacity module architecture", () => {
  it("stays pure, provider-offline, and below 400 lines", () => {
    const source = readFileSync(new URL("./capacity.ts", import.meta.url), "utf8");
    expect(source.split("\n").length - 1).toBeLessThan(400);
    expect(source).not.toMatch(/node:|fetch\s*\(|process\.|\.env\b|WebSocket|child_process|\bfs\b|PageIR|Canvas/);
  });
});
describe("authoritative capacity admission", () => {
  it("keeps the shared synthetic fixture admitted", () => {
    expect(validateCapacityState(fixture.capacity.state).ok).toBe(true);
    expect(reduceCapacity(fixture.capacity.state, fixture.capacity.offerCommand).ok).toBe(true);
  });
  it("accepts closed owner-bound policy, held guard, and policy priority state", () => {
    const admission = admit(baseState(), "one");
    expect(validateCapacityState(admission.state).ok).toBe(true);
    const result = reduceCapacity(admission.state, offer(admission));
    expect(result.ok, JSON.stringify(result)).toBe(true); if (!result.ok) return;
    expect(result.value.state.leases[0]).toMatchObject({ state: "claimed",
      budgetGuardHash: admission.guard.guardHash,
      priorityAssignmentHash: admission.priority.assignmentHash, priorityClass: "standard" });
    expect(result.value.state.balance).toMatchObject({ claimedSlots: 1, remainingSlots: 0 });
  });
  it("rejects a fabricated held guard and caller-selected priority even when self-consistent", () => {
    const old = baseState();
    const guard = { schemaVersion: "held-budget-guard-v1", state: "held",
      reservationId: "fabricated", reservationHash: H("1"), reservationRevision: 999,
      hierarchyHash: H("2"), scopeRevisions: [{ scopeId: "fabricated", revision: 999 }] };
    const binding = { schemaVersion: "capacity-priority-binding-v1", policyId: old.policy.policyId,
      projectId: "project-b", segmentId: "segment-fabricated", priorityClass: "urgent",
      issuedBy: "one-box-control-plane", evidenceHash: H("3") };
    const command = { schemaVersion: "capacity-offer-command-v1", kind: "offer",
      commandId: "offer-fabricated", nowMs: 1100, expectedPolicyRevision: 0,
      expectedBalanceRevision: 0, expectedQueueRevision: 0, ticketId: "ticket-fabricated",
      observation: { ...old.observation, observedAtMs: 1100 }, lease: {
        schemaVersion: "capacity-lease-request-v1", leaseId: "lease-fabricated",
        segmentId: "segment-fabricated", manifestHash: H("c"), budgetGuard: guard,
        priorityBinding: binding, routePolicyHash: old.policy.routePolicyHash,
        policyId: old.policy.policyId, region: old.policy.region, projectId: "project-b",
        priorityClass: "urgent", reservationAtMs: 1100, deadlineAtMs: 1400,
        rateUnits: [{ windowId: "requests-1m", units: 1 }] } };
    expect(reduceCapacity(old, command).ok).toBe(false);
  });
  it("rejects owner, kill, policy, observation, guard, and priority drift", () => {
    const admission = admit(baseState(), "drift");
    const command = offer(admission);
    for (const drift of [{ expectedPolicyHash: H("f") }, { observationHash: H("f") },
      { lease: { ...command.lease, budgetGuardHash: H("f") } },
      { lease: { ...command.lease, priorityAssignmentHash: H("f") } }, { nowMs: 5000 }])
      expect(reduceCapacity(admission.state, { ...command, ...drift }).ok).toBe(false);
    expect(validateCapacityState({ ...admission.state, currentOwnerAssignmentRefs: [] }).ok).toBe(false);
    expect(validateCapacityState({ ...admission.state, killedRefs: ["kill:capacity"] }).ok).toBe(false);
  });
  it("enforces exact live queue depth, rate windows, deadline, and maximum wait", () => {
    const admission = admit(baseState(), "fresh"); const command = offer(admission);
    for (const changed of [
      { ...admission.state.observation, queueDepth: 1 },
      { ...admission.state.observation, rateWindowRemaining: [] },
      { ...admission.state.observation, observedAtMs: 1200, expiresAtMs: 1199 },
    ]) expect(reduceCapacity({ ...admission.state, observation: seal(changed, "observationHash") }, command).ok).toBe(false);
    expect(reduceCapacity(admission.state, { ...command,
      lease: { ...command.lease, deadlineAtMs: 1199 } }).ok).toBe(false);
  });
});
describe("bounded fair queue and replay", () => {
  it("derives trusted priority, monotonic fair share, and removes one exact ticket", () => {
    const firstAdmission = admit(baseState(), "active", "project-a", "standard");
    const first = reduceCapacity(firstAdmission.state, offer(firstAdmission));
    expect(first.ok).toBe(true); if (!first.ok) return;
    const secondAdmission = admit(refresh(first.value.state, 1150), "queued", "project-b", "urgent");
    const queued = reduceCapacity(secondAdmission.state, offer(secondAdmission, 1150));
    expect(queued.ok).toBe(true); if (!queued.ok) return;
    const ticket = queued.value.state.queue.tickets[0];
    expect(ticket).toMatchObject({ priorityClass: "urgent", projectSequence: 1,
      budgetGuardHash: secondAdmission.guard.guardHash,
      priorityAssignmentHash: secondAdmission.priority.assignmentHash });
    const active = queued.value.state.leases.find((item) => item.leaseId === "lease-active");
    const waiting = queued.value.state.leases.find((item) => item.leaseId === "lease-queued");
    if (!active || !waiting) throw new Error("missing leases");
    const admittedTerminal = terminalEvidence(queued.value.state, active, "terminal-segment");
    const released = reduceCapacity(admittedTerminal.state, { schemaVersion: "capacity-segment-command-v1",
      kind: "observe-segment", commandId: "terminal-active", nowMs: 1200,
      leaseId: active.leaseId, expectedLeaseHash: active.leaseHash,
      expectedLeaseRevision: active.revision, expectedBalanceHash: admittedTerminal.state.balance.balanceHash,
      expectedBalanceRevision: admittedTerminal.state.balance.revision,
      segmentState: "failed", evidenceHash: admittedTerminal.evidence.evidenceHash });
    expect(released.ok).toBe(true); if (!released.ok) return;
    const current = refresh(released.value.state, 1250);
    const claimed = reduceCapacity(current, claim(current, waiting));
    expect(claimed.ok).toBe(true); if (!claimed.ok) return;
    expect(claimed.value.state.queue).toMatchObject({ currentDepth: 0, tickets: [] });
    expect(reduceCapacity(claimed.value.state, claim(current, waiting))).toMatchObject({
      ok: true, value: { disposition: "attached" },
    });
  });
  it("rejects stale claim CAS and non-head claim without changing state", () => {
    const firstAdmission = admit(baseState(), "active");
    const first = reduceCapacity(firstAdmission.state, offer(firstAdmission));
    expect(first.ok).toBe(true); if (!first.ok) return;
    const admission = admit(refresh(first.value.state, 1150), "wait", "project-b");
    const queued = reduceCapacity(admission.state, offer(admission, 1150));
    expect(queued.ok).toBe(true); if (!queued.ok) return;
    const lease = queued.value.state.leases.find((item) => item.leaseId === "lease-wait");
    if (!lease) return;
    expect(reduceCapacity(refresh(queued.value.state, 1200), {
      ...claim(refresh(queued.value.state, 1200), lease), expectedLeaseRevision: 99,
    }).ok).toBe(false);
  });
});
describe("claimed resource terminal authority", () => {
  it("rejects arbitrary terminal receipt hashes supplied by a command", () => {
    const admission = admit(baseState(), "old-terminal");
    const result = reduceCapacity(admission.state, offer(admission));
    expect(result.ok).toBe(true); if (!result.ok) return;
    const old = result.value.state; const active = old.leases[0];
    expect(reduceCapacity(old, { schemaVersion: "capacity-segment-command-v1",
      kind: "observe-segment", commandId: "forged-terminal", nowMs: 1200,
      leaseId: active.leaseId, expectedLeaseRevision: active.revision,
      expectedBalanceRevision: old.balance.revision, segmentId: active.segmentId,
      manifestHash: active.manifestHash, segmentState: "completed",
      terminalReceiptHash: H("d") }).ok).toBe(false);
  });
  it.each(["active", "interrupted", "retryable-failure"])("protects claimed capacity through %s", (segmentState) => {
    const admission = admit(baseState(), "protected");
    const claimed = reduceCapacity(admission.state, offer(admission));
    expect(claimed.ok).toBe(true); if (!claimed.ok) return;
    const lease = claimed.value.state.leases[0];
    const result = reduceCapacity(claimed.value.state, { schemaVersion: "capacity-segment-command-v1",
      kind: "observe-segment", commandId: `protect-${segmentState}`, nowMs: 1200,
      leaseId: lease.leaseId, expectedLeaseHash: lease.leaseHash,
      expectedLeaseRevision: lease.revision, expectedBalanceHash: claimed.value.state.balance.balanceHash,
      expectedBalanceRevision: claimed.value.state.balance.revision,
      segmentState, evidenceHash: null });
    expect(result).toMatchObject({ ok: true, value: { disposition: "protected" } });
    if (result.ok) expect(result.value.state.leases[0]).toEqual(lease);
  });
  it("releases only against admitted terminal and owner reconciliation evidence", () => {
    const admission = admit(baseState(), "release");
    const claimed = reduceCapacity(admission.state, offer(admission));
    expect(claimed.ok).toBe(true); if (!claimed.ok) return;
    const lease = claimed.value.state.leases[0];
    const terminal = terminalEvidence(claimed.value.state, lease, "terminal-segment");
    const command = { schemaVersion: "capacity-segment-command-v1", kind: "observe-segment",
      commandId: "release-terminal", nowMs: 1200, leaseId: lease.leaseId,
      expectedLeaseHash: lease.leaseHash, expectedLeaseRevision: lease.revision,
      expectedBalanceHash: terminal.state.balance.balanceHash,
      expectedBalanceRevision: terminal.state.balance.revision,
      segmentState: "failed", evidenceHash: terminal.evidence.evidenceHash };
    expect(reduceCapacity(terminal.state, { ...command, evidenceHash: H("f") }).ok).toBe(false);
    const released = reduceCapacity(terminal.state, command);
    expect(released.ok).toBe(true); if (!released.ok) return;
    expect(released.value.state.balance).toMatchObject({ claimedSlots: 0, remainingSlots: 1 });
    expect(released.value.state.balance.rateWindows[0]).toMatchObject({ claimed: 1, remaining: 2 });
    expect(validateCapacityState({ ...released.value.state, commandReceipts: released.value.state.commandReceipts.slice(1) }).ok).toBe(false);
  });
  it("holds ambiguity until state-bound accepted-owner reconciliation", () => {
    const admission = admit(baseState(), "hold"); const claimed = reduceCapacity(admission.state, offer(admission));
    expect(claimed.ok).toBe(true); if (!claimed.ok) return; const lease = claimed.value.state.leases[0];
    const held = reduceCapacity(claimed.value.state, { schemaVersion: "capacity-segment-command-v1",
      kind: "observe-segment", commandId: "hold-ambiguous", nowMs: 1200,
      leaseId: lease.leaseId, expectedLeaseHash: lease.leaseHash,
      expectedLeaseRevision: lease.revision, expectedBalanceHash: claimed.value.state.balance.balanceHash,
      expectedBalanceRevision: claimed.value.state.balance.revision,
      segmentState: "ambiguous", evidenceHash: null });
    expect(held.ok).toBe(true); if (!held.ok) return;
    const currentLease = held.value.state.leases[0];
    const owner = terminalEvidence(held.value.state, currentLease, "owner-reconciliation");
    const reconciled = reduceCapacity(owner.state, { schemaVersion: "capacity-reconcile-command-v1",
      kind: "owner-reconcile", commandId: "owner-release", nowMs: 1300,
      leaseId: currentLease.leaseId, expectedLeaseHash: currentLease.leaseHash,
      expectedLeaseRevision: currentLease.revision, expectedBalanceHash: owner.state.balance.balanceHash,
      expectedBalanceRevision: owner.state.balance.revision, evidenceHash: owner.evidence.evidenceHash });
    expect(reconciled.ok).toBe(true);
    if (reconciled.ok) expect(reconciled.value.state.leases[0].state).toBe("released");
  });
});
describe("exact capacity command replay", () => {
  it("attaches offer replay only for the identical canonical request", () => {
    const admission = admit(baseState(), "offer-replay"); const command = offer(admission);
    const first = reduceCapacity(admission.state, command); expect(first.ok).toBe(true); if (!first.ok) return;
    expect(reduceCapacity(first.value.state, command)).toMatchObject({ ok: true, value: { disposition: "attached" } });
    for (const drift of [{ nowMs: 1101 }, { expectedPolicyRevision: 1 },
      { lease: { ...command.lease, deadlineAtMs: 3999 } }])
      expect(reduceCapacity(first.value.state, { ...command, ...drift }).ok).toBe(false);
  });
  it("attaches protected and terminal segment replay only for identical requests", () => {
    const admission = admit(baseState(), "segment-replay"); const claimed = reduceCapacity(admission.state, offer(admission));
    expect(claimed.ok).toBe(true); if (!claimed.ok) return; const lease = claimed.value.state.leases[0];
    const protectedCommand = { schemaVersion: "capacity-segment-command-v1", kind: "observe-segment",
      commandId: "protected-exact", nowMs: 1200, leaseId: lease.leaseId, expectedLeaseHash: lease.leaseHash,
      expectedLeaseRevision: lease.revision, expectedBalanceHash: claimed.value.state.balance.balanceHash,
      expectedBalanceRevision: claimed.value.state.balance.revision, segmentState: "active", evidenceHash: null };
    const protectedFirst = reduceCapacity(claimed.value.state, protectedCommand);
    expect(protectedFirst.ok).toBe(true); if (!protectedFirst.ok) return;
    expect(reduceCapacity(protectedFirst.value.state, protectedCommand)).toMatchObject({ ok: true, value: { disposition: "attached" } });
    expect(reduceCapacity(protectedFirst.value.state, { ...protectedCommand, nowMs: 1201 }).ok).toBe(false);
    expect(reduceCapacity(protectedFirst.value.state, { ...protectedCommand, segmentState: "interrupted" }).ok).toBe(false);
    const currentLease = protectedFirst.value.state.leases[0];
    const terminal = terminalEvidence(protectedFirst.value.state, currentLease, "terminal-segment");
    const terminalCommand = { schemaVersion: "capacity-segment-command-v1", kind: "observe-segment",
      commandId: "terminal-exact", nowMs: 1250, leaseId: currentLease.leaseId,
      expectedLeaseHash: currentLease.leaseHash, expectedLeaseRevision: currentLease.revision,
      expectedBalanceHash: terminal.state.balance.balanceHash,
      expectedBalanceRevision: terminal.state.balance.revision, segmentState: "failed",
      evidenceHash: terminal.evidence.evidenceHash };
    const terminalFirst = reduceCapacity(terminal.state, terminalCommand);
    expect(terminalFirst.ok).toBe(true); if (!terminalFirst.ok) return;
    expect(reduceCapacity(terminalFirst.value.state, terminalCommand)).toMatchObject({ ok: true, value: { disposition: "attached" } });
    expect(reduceCapacity(terminalFirst.value.state, { ...terminalCommand, nowMs: 1251 }).ok).toBe(false);
    expect(reduceCapacity(terminalFirst.value.state, { ...terminalCommand, evidenceHash: H("f") }).ok).toBe(false);
  });
  it("attaches claim and owner reconciliation replay only for identical requests", () => {
    const activeAdmission = admit(baseState(), "claim-active"); const active = reduceCapacity(activeAdmission.state, offer(activeAdmission));
    expect(active.ok).toBe(true); if (!active.ok) return;
    const waitAdmission = admit(refresh(active.value.state, 1150), "claim-wait", "project-b");
    const queued = reduceCapacity(waitAdmission.state, offer(waitAdmission, 1150)); expect(queued.ok).toBe(true); if (!queued.ok) return;
    const activeLease = queued.value.state.leases.find((item) => item.leaseId === "lease-claim-active");
    const waiting = queued.value.state.leases.find((item) => item.leaseId === "lease-claim-wait");
    if (!activeLease || !waiting) throw new Error("missing leases");
    const terminal = terminalEvidence(queued.value.state, activeLease, "terminal-segment");
    const released = reduceCapacity(terminal.state, { schemaVersion: "capacity-segment-command-v1", kind: "observe-segment",
      commandId: "free-claim", nowMs: 1200, leaseId: activeLease.leaseId, expectedLeaseHash: activeLease.leaseHash,
      expectedLeaseRevision: activeLease.revision, expectedBalanceHash: terminal.state.balance.balanceHash,
      expectedBalanceRevision: terminal.state.balance.revision, segmentState: "failed", evidenceHash: terminal.evidence.evidenceHash });
    expect(released.ok).toBe(true); if (!released.ok) return; const current = refresh(released.value.state, 1250);
    const claimCommand = claim(current, waiting); const claimed = reduceCapacity(current, claimCommand);
    expect(claimed.ok).toBe(true); if (!claimed.ok) return;
    expect(reduceCapacity(claimed.value.state, claimCommand)).toMatchObject({ ok: true, value: { disposition: "attached" } });
    expect(reduceCapacity(claimed.value.state, { ...claimCommand, nowMs: 1251 }).ok).toBe(false);
    expect(reduceCapacity(claimed.value.state, { ...claimCommand, budgetGuardHash: H("f") }).ok).toBe(false);
    const holdAdmission = admit(baseState(), "reconcile"); const holdClaim = reduceCapacity(holdAdmission.state, offer(holdAdmission));
    expect(holdClaim.ok).toBe(true); if (!holdClaim.ok) return; const lease = holdClaim.value.state.leases[0];
    const held = reduceCapacity(holdClaim.value.state, { schemaVersion: "capacity-segment-command-v1", kind: "observe-segment",
      commandId: "make-hold", nowMs: 1200, leaseId: lease.leaseId, expectedLeaseHash: lease.leaseHash,
      expectedLeaseRevision: lease.revision, expectedBalanceHash: holdClaim.value.state.balance.balanceHash,
      expectedBalanceRevision: holdClaim.value.state.balance.revision, segmentState: "ambiguous", evidenceHash: null });
    expect(held.ok).toBe(true); if (!held.ok) return; const currentLease = held.value.state.leases[0];
    const owner = terminalEvidence(held.value.state, currentLease, "owner-reconciliation");
    const reconcile = { schemaVersion: "capacity-reconcile-command-v1", kind: "owner-reconcile", commandId: "reconcile-exact",
      nowMs: 1300, leaseId: currentLease.leaseId, expectedLeaseHash: currentLease.leaseHash,
      expectedLeaseRevision: currentLease.revision, expectedBalanceHash: owner.state.balance.balanceHash,
      expectedBalanceRevision: owner.state.balance.revision, evidenceHash: owner.evidence.evidenceHash };
    const reconciled = reduceCapacity(owner.state, reconcile); expect(reconciled.ok).toBe(true); if (!reconciled.ok) return;
    expect(reduceCapacity(reconciled.value.state, reconcile)).toMatchObject({ ok: true, value: { disposition: "attached" } });
    expect(reduceCapacity(reconciled.value.state, { ...reconcile, expectedLeaseRevision: reconcile.expectedLeaseRevision + 1 }).ok).toBe(false);
  });
  it("rejects receipt deletion and changed-body reuse of a represented lease command", () => {
    const admission = admit(baseState(), "stripped"); const command = offer(admission);
    const first = reduceCapacity(admission.state, command); expect(first.ok).toBe(true); if (!first.ok) return;
    const stripped = { ...first.value.state, commandReceipts: [] };
    expect(validateCapacityState(stripped).ok).toBe(false);
    expect(reduceCapacity(stripped, { ...command, nowMs: command.nowMs + 1 }).ok).toBe(false);
  });
  it("rejects reassignment of one canonical command receipt across leases", () => {
    const a = admit(baseState(), "receipt-a"); const first = reduceCapacity(a.state, offer(a)); if (!first.ok) return;
    const b = admit(refresh(first.value.state, 1150), "receipt-b", "project-b"); const second = reduceCapacity(b.state, offer(b, 1150)); if (!second.ok) return;
    const [active, waiting] = second.value.state.leases; if (!active || !waiting) return;
    const reassigned = seal({ ...waiting, lastCommandId: active.lastCommandId, lastCommandHash: active.lastCommandHash }, "leaseHash"); expect(validateCapacityState({ ...second.value.state, leases: [active, reassigned] }).ok).toBe(false);
  });
  it("rejects historical receipt substitution and revision rollback", () => {
    const admission = admit(baseState(), "history"); const original = offer(admission); const first = reduceCapacity(admission.state, original); if (!first.ok) return;
    const lease = first.value.state.leases[0]; const second = reduceCapacity(first.value.state, {
      schemaVersion: "capacity-segment-command-v1", kind: "observe-segment", commandId: "history-next", nowMs: 1200, leaseId: lease.leaseId, expectedLeaseHash: lease.leaseHash,
      expectedLeaseRevision: lease.revision, expectedBalanceHash: first.value.state.balance.balanceHash, expectedBalanceRevision: first.value.state.balance.revision,
      segmentState: "ambiguous", evidenceHash: null }); expect(second.ok).toBe(true); if (!second.ok) return;
    const receipts = second.value.state.commandReceipts; const replacement = { ...original, commandId: "padding" }; const json = canonicalize(replacement); const fingerprint = canonicalSha256(replacement); if (!json.ok || !fingerprint.ok) return;
    const padding = seal({ ...receipts[0], commandId: replacement.commandId, commandHash: fingerprint.value, commandJson: json.value }, "receiptHash"); const next = seal({ ...receipts[1], previousReceiptHash: padding.receiptHash }, "receiptHash"); const rolled = seal({ ...receipts[1], sequence: 1, previousReceiptHash: null }, "receiptHash");
    expect([validateCapacityState({ ...second.value.state, receiptHeadHash: next.receiptHash, commandReceipts: [padding, next] }).ok, validateCapacityState({ ...second.value.state, commandRevision: 1, receiptHeadHash: rolled.receiptHash, commandReceipts: [rolled] }).ok, validateCapacityState({ ...second.value.state, receiptHeadHash: receipts[0].receiptHash, commandReceipts: [receipts[1], receipts[0]] }).ok]).toEqual([false, false, false]);
  });
});
describe("state-bound queued cancellation", () => {
  it.each([["deadline", 1250], ["operator", 1200], ["kill-switch", 1200]] as const)(
    "requires admitted no-dispatch proof and current %s authority", (reason, nowMs) => {
      const firstAdmission = admit(baseState(), `cancel-active-${reason}`);
      const first = reduceCapacity(firstAdmission.state, offer(firstAdmission));
      expect(first.ok).toBe(true); if (!first.ok) return;
      const waitingAdmission = admit(refresh(first.value.state, 1150), `cancel-wait-${reason}`, "project-b");
      const queued = reduceCapacity(waitingAdmission.state, offer(waitingAdmission, 1150));
      expect(queued.ok).toBe(true); if (!queued.ok) return;
      const lease = queued.value.state.leases.find((item) => item.state === "queued"); if (!lease) return;
      const admitted = noDispatch(queued.value.state, lease, reason, nowMs);
      const command = { schemaVersion: "capacity-cancel-command-v1", kind: "cancel", commandId: `cancel-${reason}`,
        nowMs, leaseId: lease.leaseId, expectedLeaseHash: lease.leaseHash, expectedLeaseRevision: lease.revision,
        expectedQueueHash: queued.value.state.queue.queueHash, expectedQueueRevision: queued.value.state.queue.revision,
        reason, evidenceHash: admitted.evidence.evidenceHash };
      expect(reduceCapacity(queued.value.state, command).ok).toBe(false);
      if (reason === "deadline") expect(reduceCapacity(admitted.state, { ...command, nowMs: 1249 }).ok).toBe(false);
      const result = reduceCapacity(admitted.state, command); expect(result.ok).toBe(true); if (!result.ok) return;
      expect(result.value.state.queue).toMatchObject({ currentDepth: 0, tickets: [] });
      expect(reduceCapacity(result.value.state, command)).toMatchObject({ ok: true, value: { disposition: "attached" } });
      expect(reduceCapacity(result.value.state, { ...command, nowMs: nowMs + 1 }).ok).toBe(false);
      if (reason === "operator") { const next = admit(refresh(result.value.state, nowMs + 10), "after-cancel", "project-b");
        expect(reduceCapacity(next.state, offer(next, nowMs + 10)).ok).toBe(true); }
    });
});
