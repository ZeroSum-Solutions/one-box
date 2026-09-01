import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/budget-capacity-v1.json";
import { canonicalize, canonicalSha256, computeSelfHash } from "./canonical";
import { reserveBudget } from "./budget";
import { createCompareState, reduceCompare, validateCompareIntent, validateCompareState,
  type CompareComponentStateV1, type CompareStateV1 } from "./compare";

const H = (char: string) => char.repeat(64);
const SCOPES = ["agency", "project", "assignment", "compare", "segment", "retry", "evaluator", "reviewer"] as const;
const LIMITS = [1000, 900, 800, 700, 650, 600, 550, 500];
function seal<T extends Record<string, unknown>>(record: T, field: string): T {
  const candidate = { ...record, [field]: H("0") }; const result = computeSelfHash(candidate, field);
  if (!result.ok) throw new Error(result.reason); return { ...candidate, [field]: result.value } as T;
}
function intent() {
  const shared = { actorId: "person:fixture-actor", projectId: "project-1", jobId: "job-1",
    taskHash: H("1"), contextBundleHash: H("2"), skillSetHash: H("3"), toolGrantHash: H("4"),
    outputContractHash: H("5"), evaluationFixtureHash: H("6"), expectedTargetStateHash: H("7"), deadlineAtMs: 4000 };
  return { schemaVersion: "compare-intent-v1", compareId: "compare-1", ...shared, createdAtMs: 1000,
    arms: [{ armId: "arm-a", label: H("a"), routeIntentHash: H("8"), routePolicyHash: H("9"),
      capacityPolicyHash: H("a"), region: "offline-a", maxAttempts: 2, perAttemptUnits: 100, ...shared },
    { armId: "arm-b", label: H("b"), routeIntentHash: H("c"), routePolicyHash: H("d"),
      capacityPolicyHash: H("e"), region: "offline-b", maxAttempts: 2, perAttemptUnits: 120, ...shared }],
    evaluatorRuns: [{ componentId: "evaluator-1", reservedUnits: 25 }],
    reviewerRuns: [{ componentId: "reviewer-1", reservedUnits: 15 }] };
}
const COMPONENTS = [
  { componentType: "arm", componentId: "arm:arm-a", reservedUnits: 100 },
  { componentType: "retry", componentId: "retry:arm-a", reservedUnits: 100 },
  { componentType: "arm", componentId: "arm:arm-b", reservedUnits: 120 },
  { componentType: "retry", componentId: "retry:arm-b", reservedUnits: 120 },
  { componentType: "evaluator", componentId: "evaluator-1", reservedUnits: 25 },
  { componentType: "reviewer", componentId: "reviewer-1", reservedUnits: 15 },
] as const;
function reservation() {
  const balances = SCOPES.map((scopeType, index) => seal({ schemaVersion: "compare-budget-balance-v1", scopeType,
    scopeId: `${scopeType}-1`, limit: LIMITS[index], remaining: LIMITS[index] - 480, held: 480, settled: 0, released: 0,
    revision: 0, previousBalanceHash: null, balanceHash: H("0") }, "balanceHash"));
  return seal({ schemaVersion: "compare-reservation-v1", reservationId: "reservation-compare-1",
    compareId: "compare-1", state: "held", revision: 0, totalUnits: 480, components: COMPONENTS,
    balances, previousReservationHash: null, reservationHash: H("0") }, "reservationHash");
}
function initialState() {
  const result = createCompareState(intent(), reservation()); expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason); return result.value;
}
function componentOf(state: CompareStateV1, componentId: string): CompareComponentStateV1 {
  const current = state.componentStates.find((item) => item.componentId === componentId);
  if (!current) throw new Error(`missing component ${componentId}`); return current;
}
function admitTerminal(state: CompareStateV1, componentId: string, usageUnits: number, billingState: "known" | "ambiguous" = "known") {
  const current = componentOf(state, componentId);
  const evidence = seal({ schemaVersion: "compare-terminal-component-evidence-v1",
    componentType: current.componentType, componentId, expectedComponentStateHash: current.componentStateHash,
    expectedComponentRevision: current.revision, terminalReceiptHash: H("e"), usageUnits, billingState,
    effectAuthority: "compare-evidence-only", issuedBy: "one-box-control-plane", issuedAtMs: 1200,
    evidenceHash: H("0") }, "evidenceHash");
  return { evidence, state: { ...state, terminalEvidence: [...state.terminalEvidence, evidence] } };
}
function recordTerminal(state: CompareStateV1, componentId: string, usage: number, billing: "known" | "ambiguous" = "known") {
  const admitted = admitTerminal(state, componentId, usage, billing);
  const current = componentOf(state, componentId);
  return reduceCompare(admitted.state, { schemaVersion: "compare-terminal-command-v1", kind: "record-terminal",
    commandId: `terminal-${componentId}`, nowMs: 1250, expectedRevision: state.revision,
    actorId: state.manifest.intent.actorId, projectId: state.manifest.intent.projectId, componentId,
    expectedComponentStateHash: current.componentStateHash, expectedComponentRevision: current.revision,
    terminalEvidenceHash: admitted.evidence.evidenceHash });
}
function admitUnused(state: CompareStateV1, componentId: string) {
  const current = componentOf(state, componentId);
  const evidence = seal({ schemaVersion: "compare-no-dispatch-evidence-v1", componentType: current.componentType,
    componentId, expectedComponentStateHash: current.componentStateHash, expectedComponentRevision: current.revision,
    reason: "not-dispatched", leaseState: "none", leaseHash: null, leaseRevision: null,
    issuedBy: "one-box-control-plane", issuedAtMs: 1200, evidenceHash: H("0") }, "evidenceHash");
  return { evidence, state: { ...state, noDispatchEvidence: [...state.noDispatchEvidence, evidence] } };
}
function markUnused(state: CompareStateV1, componentId: string) {
  const admitted = admitUnused(state, componentId);
  const current = componentOf(state, componentId);
  return reduceCompare(admitted.state, { schemaVersion: "compare-unused-command-v1", kind: "mark-unused",
    commandId: `unused-${componentId}`, nowMs: 1250, expectedRevision: state.revision,
    actorId: state.manifest.intent.actorId, projectId: state.manifest.intent.projectId, componentId,
    expectedComponentStateHash: current.componentStateHash, expectedComponentRevision: current.revision,
    noDispatchEvidenceHash: admitted.evidence.evidenceHash });
}
function claimRequest(state: CompareStateV1, componentId: string, commandId = `claim-${componentId}`) {
  const current = componentOf(state, componentId);
  return { schemaVersion: "compare-claim-command-v1", kind: "claim-component", commandId,
    nowMs: 1250, expectedRevision: state.revision, actorId: state.manifest.intent.actorId,
    projectId: state.manifest.intent.projectId, componentId,
    expectedComponentStateHash: current.componentStateHash, expectedComponentRevision: current.revision };
}
function claim(state: CompareStateV1, componentId: string, commandId = `claim-${componentId}`) {
  return reduceCompare(state, claimRequest(state, componentId, commandId));
}
function settleCommand(state: CompareStateV1, commandId = "settle-compare-1") {
  return { schemaVersion: "compare-settle-command-v1", kind: "settle", commandId, expectedRevision: state.revision,
    actorId: state.manifest.intent.actorId, projectId: state.manifest.intent.projectId,
    reservationId: state.currentReservation.reservationId,
    expectedReservationHash: state.currentReservation.reservationHash,
    expectedReservationRevision: state.currentReservation.revision,
    balanceGuards: state.currentBalances.map(({ scopeType, scopeId, balanceHash, revision }) =>
      ({ scopeType, scopeId, balanceHash, revision })) };
}
function complete(ambiguous?: string) {
  let state: CompareStateV1 = initialState();
  for (const [id, kind, usage] of [["arm:arm-a", "terminal", 90], ["retry:arm-a", "unused", 0],
    ["arm:arm-b", "terminal", 120], ["retry:arm-b", "unused", 0],
    ["evaluator-1", "terminal", 20], ["reviewer-1", "unused", 0]] as const) {
    const result = kind === "terminal" ? recordTerminal(state, id, usage, id === ambiguous ? "ambiguous" : "known")
      : markUnused(state, id);
    expect(result.ok, JSON.stringify(result)).toBe(true); if (!result.ok) throw new Error(result.reason); state = result.value.state;
  }
  return state;
}

describe("compare module architecture", () => {
  it("is pure, evidence-only, provider-offline, and below 400 lines", () => {
    const source = readFileSync(new URL("./compare.ts", import.meta.url), "utf8");
    expect(source.split("\n").length - 1).toBeLessThan(400);
    expect(source).not.toMatch(/node:|fetch\s*\(|process\.|\.env\b|WebSocket|child_process|\bfs\b|PageIR|Canvas|applyPage|winner|defaultRoute|qualityPass/);
  });
});

describe("opaque two-arm admission", () => {
  it("accepts exactly two fairness-bound opaque arms and the fixture", () => {
    expect(validateCompareIntent(intent()).ok).toBe(true);
    expect(validateCompareIntent(fixture.compare.intent).ok).toBe(true);
    expect(createCompareState(fixture.compare.intent, fixture.compare.reservation).ok).toBe(true);
    const state = initialState(); expect(state.manifest.components).toEqual(COMPONENTS);
    expect(state.currentBalances.map((item) => item.scopeType)).toEqual(SCOPES);
  });
  it("derives fixture limits and stock from the admitted eight-scope aggregate reservation", () => {
    const reserved = reserveBudget(fixture.budget.portfolio, fixture.budget.reserveCommand);
    expect(reserved.ok, JSON.stringify(reserved)).toBe(true); if (!reserved.ok) return;
    expect({ reservationId: fixture.compare.reservation.reservationId,
      compareId: fixture.compare.reservation.compareId, revision: fixture.compare.reservation.revision,
      totalUnits: fixture.compare.reservation.totalUnits }).toEqual({
      reservationId: reserved.value.state.reservation.reservationId,
      compareId: reserved.value.state.reservation.compareId,
      revision: reserved.value.state.reservation.revision,
      totalUnits: reserved.value.state.reservation.forecastUnits,
    });
    expect(fixture.compare.reservation.balances.map(({ scopeType, scopeId, limit, remaining,
      held, settled, released }) => ({ scopeType, scopeId, limit, remaining, held, settled, released })))
      .toEqual(reserved.value.state.balances.map(({ scopeType, scopeId, limit, remaining,
        held, settled, released }) => ({ scopeType, scopeId, limit, remaining, held, settled, released })));
  });
  it("rejects a third arm, marketing labels, and actor/project/context drift", () => {
    const base = intent();
    expect(validateCompareIntent({ ...base, arms: [...base.arms, { ...base.arms[0], armId: "arm-c", label: H("f"), routeIntentHash: H("f") }] }).ok).toBe(false);
    for (const label of ["A", "gpt-5.6-sol", "premium-model"])
      expect(validateCompareIntent({ ...base, arms: [base.arms[0], { ...base.arms[1], label }] }).ok).toBe(false);
    for (const drift of [{ actorId: "person:foreign" }, { projectId: "project-foreign" },
      { contextBundleHash: H("f") }, { toolGrantHash: H("f") }, { deadlineAtMs: 3999 }])
      expect(validateCompareIntent({ ...base, arms: [base.arms[0], { ...base.arms[1], ...drift }] }).ok).toBe(false);
  });
  it("requires exact aggregate components and eight self-hashed scope stocks", () => {
    const base = reservation();
    for (const changed of [{ ...base, totalUnits: 479 }, { ...base, components: base.components.slice(1) },
      { ...base, balances: base.balances.slice(1) },
      { ...base, balances: base.balances.map((item, index) => index ? item : { ...item, held: 479 }) }])
      expect(createCompareState(intent(), changed).ok).toBe(false);
  });
  it("rejects balance stock overflow without sentinel recovery", () => {
    const base = reservation(); const overflow = seal({ ...base.balances[0],
      remaining: Number.MAX_SAFE_INTEGER, held: 480, settled: 1001 }, "balanceHash");
    const changed = seal({ ...base, balances: base.balances.map((item, index) => index ? item : overflow) }, "reservationHash");
    expect(createCompareState(intent(), changed).ok).toBe(false);
  });
});

describe("state-bound component authority", () => {
  it("rejects aggregate component revision overflow without sentinel recovery", () => {
    const state = complete(); const current = state.componentStates[0];
    const admitted = state.terminalEvidence.find((item) => item.evidenceHash === current.terminalEvidenceHash);
    if (!admitted) throw new Error("missing terminal evidence");
    const evidence = seal({ ...admitted, expectedComponentRevision: Number.MAX_SAFE_INTEGER - 1 }, "evidenceHash");
    const component = seal({ ...current, revision: Number.MAX_SAFE_INTEGER,
      terminalEvidenceHash: evidence.evidenceHash }, "componentStateHash");
    const forged = { ...state, revision: 3,
      componentStates: state.componentStates.map((item, index) => index ? item : component),
      terminalEvidence: state.terminalEvidence.map((item) => item.evidenceHash === admitted.evidenceHash ? evidence : item) };
    expect(validateCompareState(forged).ok).toBe(false);
  });
  it("rejects caller-authored unused proofs and derives D6U hashes from admitted no-dispatch state", () => {
    const state = initialState(); const current = state.componentStates[1];
    const forged = { schemaVersion: "compare-component-command-v1", kind: "record-component",
      commandId: "forged", expectedRevision: 0, actorId: intent().actorId, projectId: intent().projectId,
      componentId: current.componentId, evidenceKind: "unused", evidenceHash: H("3"), usageUnits: 0,
      billingState: "known", unusedProof: { proofHash: H("4"), terminalComponentStateHash: H("5") } };
    expect(reduceCompare(state, forged).ok).toBe(false);
    const result = markUnused(state, current.componentId); expect(result.ok).toBe(true); if (!result.ok) return;
    const terminal = result.value.state.componentStates[1];
    expect(terminal).toMatchObject({ lifecycle: "unused", revision: 1 });
    expect(terminal.unusedProof).not.toBeNull(); if (!terminal.unusedProof) return;
    expect(terminal.unusedProof.proofHash).toMatch(/^[a-f0-9]{64}$/);
    expect(terminal.unusedProof.terminalComponentStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(claim(result.value.state, current.componentId).ok).toBe(false);
    expect(validateCompareState({ ...result.value.state,
      componentStates: result.value.state.componentStates.map((item, index) => index ? item
        : { ...item, componentStateHash: H("f") }) }).ok).toBe(false);
  });
  it("requires admitted state-bound terminal evidence and preserves the held parent", () => {
    const state = initialState(); const current = state.componentStates[0];
    const command = { schemaVersion: "compare-terminal-command-v1", kind: "record-terminal",
      commandId: "terminal-forged", nowMs: 1250, expectedRevision: 0, actorId: intent().actorId,
      projectId: intent().projectId, componentId: current.componentId,
      expectedComponentStateHash: current.componentStateHash, expectedComponentRevision: 0,
      terminalEvidenceHash: H("f") };
    expect(reduceCompare(state, command).ok).toBe(false);
    const result = recordTerminal(state, current.componentId, 90); expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.value.state.currentReservation).toEqual(state.currentReservation);
    expect(result.value.state.currentBalances).toEqual(state.currentBalances);
    expect(result.value.state.manifest).toEqual(state.manifest);
    expect(recordTerminal(initialState(), current.componentId, 101).ok).toBe(false);
  });
  it("binds every component command to the exact actor and project", () => {
    const state = initialState(); const admitted = admitTerminal(state, "arm:arm-a", 90); const current = state.componentStates[0];
    const command = { schemaVersion: "compare-terminal-command-v1", kind: "record-terminal", commandId: "bound",
      nowMs: 1250, expectedRevision: 0, actorId: intent().actorId, projectId: intent().projectId,
      componentId: current.componentId, expectedComponentStateHash: current.componentStateHash,
      expectedComponentRevision: 0, terminalEvidenceHash: admitted.evidence.evidenceHash };
    expect(reduceCompare(admitted.state, { ...command, actorId: "person:foreign" }).ok).toBe(false);
    expect(reduceCompare(admitted.state, { ...command, projectId: "project-foreign" }).ok).toBe(false);
  });
});

describe("atomic full-set settlement", () => {
  it("blocks D6 until every arm, retry, evaluator, and reviewer is terminal or unused", () => {
    const first = recordTerminal(initialState(), "arm:arm-a", 90); expect(first.ok).toBe(true); if (!first.ok) return;
    expect(reduceCompare(first.value.state, settleCommand(first.value.state)).ok).toBe(false);
  });
  it("atomically re-hashes the current parent and all eight scopes from derived amounts", () => {
    const state = complete(); const manifest = structuredClone(state.manifest); const prior = state.currentBalances;
    const command = settleCommand(state); const result = reduceCompare(state, command);
    expect(result.ok, JSON.stringify(result)).toBe(true); if (!result.ok) return;
    expect(result.value.state).toMatchObject({ state: "settled",
      settlement: { reservedUnits: 480, settledUnits: 230, releasedUnits: 250, heldUnits: 0 } });
    expect(result.value.state.manifest).toEqual(manifest);
    expect(result.value.state.currentReservation).toMatchObject({ state: "settled", revision: 1,
      previousReservationHash: state.currentReservation.reservationHash });
    expect(result.value.state.currentReservation.reservationHash).not.toBe(state.currentReservation.reservationHash);
    expect(result.value.state.currentBalances).toHaveLength(8);
    result.value.state.currentBalances.forEach((item, index) => {
      expect(item).toMatchObject({ remaining: LIMITS[index] - 230, held: 0, settled: 230, released: 250,
        revision: 1, previousBalanceHash: prior[index].balanceHash });
      expect(item.remaining + item.held + item.settled).toBe(item.limit);
    });
    const replay = reduceCompare(result.value.state, command); expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value.disposition).toBe("attached");
  });
  it("holds an ambiguous share and rejects stale/tampered structural CAS", () => {
    const state = complete("evaluator-1"); const command = settleCommand(state);
    const result = reduceCompare(state, command); expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.value.state).toMatchObject({ state: "reconciliation-hold",
      settlement: { reservedUnits: 480, settledUnits: 210, releasedUnits: 245, heldUnits: 25 } });
    expect(result.value.state.currentBalances[0]).toMatchObject({ remaining: 765, held: 25, settled: 210, released: 245 });
    expect(reduceCompare(state, { ...command,
      balanceGuards: command.balanceGuards.map((item, index) => index ? item : { ...item, revision: 1 }) }).ok).toBe(false);
    expect(validateCompareState({ ...result.value.state,
      currentBalances: result.value.state.currentBalances.map((item, index) => index ? item : { ...item, released: 244 }) }).ok).toBe(false);
  });
  it("rejects result-selection, apply, quality, and mutation authority fields", () => {
    const state = complete(); const command = settleCommand(state);
    for (const field of ["winner", "defaultRoute", "apply", "qualityPass", "pageIrMutation"]) {
      expect(validateCompareState({ ...state, [field]: true }).ok).toBe(false);
      expect(reduceCompare(state, { ...command, [field]: true }).ok).toBe(false);
    }
  });
});

describe("exact compare command replay", () => {
  it("attaches claim replay only for the identical canonical request", () => {
    const state = initialState(); const command = claimRequest(state, "arm:arm-a", "claim-exact");
    const first = reduceCompare(state, command); expect(first.ok).toBe(true); if (!first.ok) return;
    expect(reduceCompare(first.value.state, command)).toMatchObject({ ok: true, value: { disposition: "attached" } });
    for (const drift of [{ nowMs: 1251 }, { expectedRevision: 1 }, { actorId: "person:foreign" },
      { projectId: "project-foreign" }, { expectedComponentRevision: 1 }])
      expect(reduceCompare(first.value.state, { ...command, ...drift }).ok).toBe(false);
    const other = componentOf(first.value.state, "arm:arm-b");
    expect(reduceCompare(first.value.state, { ...command, expectedRevision: first.value.state.revision,
      componentId: other.componentId, expectedComponentStateHash: other.componentStateHash,
      expectedComponentRevision: other.revision }).ok).toBe(false);
  });
  it("attaches terminal and unused replay only for identical evidence-bound requests", () => {
    const start = initialState(); const terminalAdmission = admitTerminal(start, "arm:arm-a", 90);
    const terminalState = componentOf(start, "arm:arm-a");
    const terminal = { schemaVersion: "compare-terminal-command-v1", kind: "record-terminal",
      commandId: "terminal-exact", nowMs: 1250, expectedRevision: start.revision,
      actorId: start.manifest.intent.actorId, projectId: start.manifest.intent.projectId,
      componentId: terminalState.componentId, expectedComponentStateHash: terminalState.componentStateHash,
      expectedComponentRevision: terminalState.revision, terminalEvidenceHash: terminalAdmission.evidence.evidenceHash };
    const terminalFirst = reduceCompare(terminalAdmission.state, terminal);
    expect(terminalFirst.ok).toBe(true); if (!terminalFirst.ok) return;
    expect(reduceCompare(terminalFirst.value.state, terminal)).toMatchObject({ ok: true, value: { disposition: "attached" } });
    for (const drift of [{ nowMs: 1251 }, { expectedRevision: 1 }, { terminalEvidenceHash: H("f") }])
      expect(reduceCompare(terminalFirst.value.state, { ...terminal, ...drift }).ok).toBe(false);

    const unusedStart = initialState(); const unusedAdmission = admitUnused(unusedStart, "retry:arm-a");
    const unusedState = componentOf(unusedStart, "retry:arm-a");
    const unused = { schemaVersion: "compare-unused-command-v1", kind: "mark-unused", commandId: "unused-exact",
      nowMs: 1250, expectedRevision: unusedStart.revision, actorId: unusedStart.manifest.intent.actorId,
      projectId: unusedStart.manifest.intent.projectId, componentId: unusedState.componentId,
      expectedComponentStateHash: unusedState.componentStateHash, expectedComponentRevision: unusedState.revision,
      noDispatchEvidenceHash: unusedAdmission.evidence.evidenceHash };
    const unusedFirst = reduceCompare(unusedAdmission.state, unused); expect(unusedFirst.ok).toBe(true); if (!unusedFirst.ok) return;
    expect(reduceCompare(unusedFirst.value.state, unused)).toMatchObject({ ok: true, value: { disposition: "attached" } });
    for (const drift of [{ nowMs: 1251 }, { actorId: "person:foreign" }, { noDispatchEvidenceHash: H("f") }])
      expect(reduceCompare(unusedFirst.value.state, { ...unused, ...drift }).ok).toBe(false);
  });
  it("attaches settlement replay only for the identical full structural CAS", () => {
    const state = complete(); const command = settleCommand(state, "settle-exact");
    const first = reduceCompare(state, command); expect(first.ok).toBe(true); if (!first.ok) return;
    expect(reduceCompare(first.value.state, command)).toMatchObject({ ok: true, value: { disposition: "attached" } });
    expect(reduceCompare(first.value.state, { ...command, expectedRevision: command.expectedRevision + 1 }).ok).toBe(false);
    expect(reduceCompare(first.value.state, { ...command, balanceGuards: command.balanceGuards.map((item, index) =>
      index ? item : { ...item, revision: item.revision + 1 }) }).ok).toBe(false);
  });
  it("rejects receipt deletion and changed-body reuse across components", () => {
    const state = initialState(); const command = claimRequest(state, "arm:arm-a", "claim-stripped");
    const first = reduceCompare(state, command); expect(first.ok).toBe(true); if (!first.ok) return;
    const stripped = { ...first.value.state, commandReceipts: [] }; expect(validateCompareState(stripped).ok).toBe(false);
    const other = componentOf(first.value.state, "arm:arm-b");
    expect(reduceCompare(stripped, { ...command, expectedRevision: first.value.state.revision,
      componentId: other.componentId, expectedComponentStateHash: other.componentStateHash,
      expectedComponentRevision: other.revision }).ok).toBe(false);
  });
  it("rejects historical receipt substitution and changed-body reuse", () => {
    const start = initialState(); const original = claimRequest(start, "arm:arm-a", "claim-history");
    const first = reduceCompare(start, original); expect(first.ok).toBe(true); if (!first.ok) return;
    const second = recordTerminal(first.value.state, "arm:arm-a", 90); expect(second.ok).toBe(true); if (!second.ok) return;
    const receipts = second.value.state.commandReceipts; const replacement = { ...original, commandId: "padding" };
    const json = canonicalize(replacement); const fingerprint = canonicalSha256(replacement); if (!json.ok || !fingerprint.ok) return;
    const padding = seal({ ...receipts[0], commandId: replacement.commandId, commandHash: fingerprint.value, commandJson: json.value }, "receiptHash");
    const next = seal({ ...receipts[1], previousReceiptHash: padding.receiptHash }, "receiptHash");
    const padded = { ...second.value.state, receiptHeadHash: next.receiptHash, commandReceipts: [padding, next] };
    const changed = claimRequest(second.value.state, "arm:arm-b", original.commandId);
    expect([validateCompareState(padded).ok, reduceCompare(padded, changed).ok]).toEqual([false, false]);
  });
});
