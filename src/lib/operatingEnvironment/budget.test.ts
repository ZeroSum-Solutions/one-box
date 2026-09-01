import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalSha256, computeSelfHash } from "./canonical";
import fixture from "./fixtures/budget-capacity-v1.json";
import {
  computeWorstCaseForecast, evaluateBudgetRetry, reduceBudget, reserveBudget,
  validateBudgetPortfolio, validateBudgetState,
} from "./budget";

const H = (char: string) => char.repeat(64);
const TYPES = ["agency", "project", "assignment", "compare", "segment", "retry", "evaluator", "reviewer"] as const;
const IDS = TYPES.map((type) => `${type}-1`);
const LIMITS = [1000, 900, 800, 700, 650, 600, 550, 500];
const forecastRequest = {
  schemaVersion: "worst-case-forecast-input-v1",
  components: [
    { componentId: "arm-a", unitAmount: 100, maximumOccurrences: 2 },
    { componentId: "arm-b", unitAmount: 120, maximumOccurrences: 2 },
    { componentId: "evaluator", unitAmount: 25, maximumOccurrences: 1 },
    { componentId: "reviewer", unitAmount: 15, maximumOccurrences: 1 },
  ],
} as const;

function digest(value: unknown) {
  const result = canonicalSha256(value);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
function seal<T extends Record<string, unknown>>(record: T, field: string): T {
  const candidate = { ...record, [field]: H("0") };
  const result = computeSelfHash(candidate, field);
  if (!result.ok) throw new Error(result.reason);
  return { ...candidate, [field]: result.value } as T;
}
function evidence() {
  return [
    seal({ schemaVersion: "budget-finalization-evidence-v1", evidenceId: "terminal-1",
      reservationId: "reservation-compare-1", evidenceKind: "terminal-usage",
      terminalReceiptHash: H("d"), noDispatchEvidenceHash: null,
      ownerAssignmentRef: null, ownerEvidenceHash: null, knownUsageUnits: 230,
      issuedBy: "one-box-control-plane", evidenceHash: H("0") }, "evidenceHash"),
    seal({ schemaVersion: "budget-finalization-evidence-v1", evidenceId: "unused-1",
      reservationId: "reservation-compare-1", evidenceKind: "no-dispatch",
      terminalReceiptHash: null, noDispatchEvidenceHash: H("c"),
      ownerAssignmentRef: null, ownerEvidenceHash: null, knownUsageUnits: 0,
      issuedBy: "one-box-control-plane", evidenceHash: H("0") }, "evidenceHash"),
    seal({ schemaVersion: "budget-finalization-evidence-v1", evidenceId: "owner-1",
      reservationId: "reservation-compare-1", evidenceKind: "owner-reconciliation",
      terminalReceiptHash: H("d"), noDispatchEvidenceHash: null,
      ownerAssignmentRef: "owner:budget", ownerEvidenceHash: H("e"), knownUsageUnits: 300,
      issuedBy: "budget-owner", evidenceHash: H("0") }, "evidenceHash"),
  ];
}
function admittedPortfolio() {
  const finalizationEvidence = evidence();
  const scopeCeilings = TYPES.map((scopeType, index) => ({
    scopeType, scopeId: IDS[index], limit: LIMITS[index],
  }));
  const policy = seal({
    schemaVersion: "budget-policy-v1", budgetPolicyId: "budget-policy-1",
    reservationId: "reservation-compare-1",
    fundingClass: "synthetic", compareId: "compare-1",
    routeIntentHashes: [H("8"), H("9")], forecastHash: digest(forecastRequest),
    forecastUnits: 480, scopeCeilings, ownerAssignmentRefs: ["owner:budget"],
    acceptedOwnerAssignmentRefs: ["owner:budget"], capacityPolicyHash: H("c"),
    effectiveAtMs: 1000, expiresAtMs: 5000, killSwitchRef: "kill:budget",
    finalizationEvidenceHashes: finalizationEvidence.map((item) => item.evidenceHash),
    revision: 0, policyHash: H("0"),
  }, "policyHash");
  return {
    schemaVersion: "budget-portfolio-v1", observedAtMs: 1100,
    currentOwnerAssignmentRefs: ["owner:budget"], killedRefs: [], policy,
    forecast: forecastRequest, finalizationEvidence,
    balances: scopeCeilings.map((scope) => ({ ...scope, policyHash: policy.policyHash,
      remaining: scope.limit, held: 0, settled: 0, released: 0, revision: 0 })),
  };
}
function reserveCommand(portfolio = admittedPortfolio()) {
  return {
    schemaVersion: "budget-reserve-command-v1", kind: "reserve", commandId: "reserve-1",
    reservationId: "reservation-compare-1", expectedPolicyHash: portfolio.policy.policyHash,
    expectedPolicyRevision: portfolio.policy.revision,
    expectedScopeRevisions: portfolio.balances.map(({ scopeId, revision }) => ({ scopeId, revision })),
  };
}
function reserveFixture() {
  const portfolio = admittedPortfolio();
  const result = reserveBudget(portfolio, reserveCommand(portfolio));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("reservation fixture failed");
  return result.value.state;
}
function guards(state: ReturnType<typeof reserveFixture>) {
  return state.balances.map(({ scopeId, revision }) => ({ scopeId, revision }));
}
function finalize(state: ReturnType<typeof reserveFixture>, evidenceHash: string, commandId = "finalize-1") {
  return { schemaVersion: "budget-finalize-command-v1", kind: "finalize", commandId,
    observedAtMs: 1300, expectedReservationHash: state.reservation.reservationHash,
    expectedReservationRevision: state.reservation.revision,
    expectedScopeRevisions: guards(state), evidenceHash };
}
function retryGate(state: ReturnType<typeof reserveFixture>) {
  return { schemaVersion: "budget-retry-gate-v1", failureClass: "transient-transport",
    billingState: "known", effectState: "none", hasUsableOutput: false,
    attemptIndex: 0, maxAttempts: 2, reservationId: state.reservation.reservationId,
    reservationHash: state.reservation.reservationHash,
    reservationRevision: state.reservation.revision, policyHash: state.policy.policyHash,
    observedAtMs: 1300, deadlineAtMs: 4000 };
}

describe("budget module architecture", () => {
  it("stays pure, provider-offline, and below 400 lines", () => {
    const source = readFileSync(new URL("./budget.ts", import.meta.url), "utf8");
    expect(source.split("\n").length - 1).toBeLessThan(400);
    expect(source).not.toMatch(/node:|fetch\s*\(|process\.|\.env\b|WebSocket|child_process|\bfs\b|\bhttp\b|\bhttps\b|PageIR|Canvas/);
  });
});

describe("safe worst-case arithmetic", () => {
  it("derives the exact deterministic aggregate", () => {
    expect(computeWorstCaseForecast(forecastRequest)).toEqual({ ok: true, value: {
      schemaVersion: "cost-forecast-v1", components: [
        { componentId: "arm-a", maximumUnits: 200 },
        { componentId: "arm-b", maximumUnits: 240 },
        { componentId: "evaluator", maximumUnits: 25 },
        { componentId: "reviewer", maximumUnits: 15 },
      ], totalUnits: 480 } });
  });
  it("rejects unsafe, negative, duplicate, empty, and unknown arithmetic", () => {
    const cases = [
      { ...forecastRequest, components: [] },
      { ...forecastRequest, components: [forecastRequest.components[0], forecastRequest.components[0]] },
      { ...forecastRequest, components: [{ componentId: "x", unitAmount: -1, maximumOccurrences: 1 }] },
      { ...forecastRequest, components: [{ componentId: "x", unitAmount: Number.MAX_SAFE_INTEGER, maximumOccurrences: 2 }] },
      { ...forecastRequest, currency: "USD" },
    ];
    for (const value of cases) expect(computeWorstCaseForecast(value).ok).toBe(false);
  });
});

describe("authoritative budget policy reservation", () => {
  it("keeps the shared synthetic fixture admitted", () => {
    expect(validateBudgetPortfolio(fixture.budget.portfolio).ok).toBe(true);
    expect(reserveBudget(fixture.budget.portfolio, fixture.budget.reserveCommand).ok).toBe(true);
  });
  it("holds the policy forecast across all exact eight scopes atomically", () => {
    const portfolio = admittedPortfolio();
    expect(validateBudgetPortfolio(portfolio).ok).toBe(true);
    const result = reserveBudget(portfolio, reserveCommand(portfolio));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.balances).toHaveLength(8);
    expect(result.value.state.balances.map((item) => item.scopeType)).toEqual(TYPES);
    expect(result.value.state.balances.every((item) => item.held === 480 && item.revision === 1)).toBe(true);
    expect(result.value.state.reservation).toMatchObject({ state: "held", forecastUnits: 480,
      policyHash: portfolio.policy.policyHash, routeIntentHashes: [H("8"), H("9")] });
    expect(validateBudgetState(result.value.state).ok).toBe(true);
  });
  it("rejects a caller-chosen forecast and scope subset without admitted policy authority", () => {
    const legacyForecast = { schemaVersion: "worst-case-forecast-input-v1",
      components: [{ componentId: "cheap", unitAmount: 1, maximumOccurrences: 1 }] };
    const balances = [{ scopeType: "agency", scopeId: "agency-attacker", limit: 10,
      remaining: 10, held: 0, settled: 0, released: 0, revision: 0 }];
    const scopeSet = balances.map(({ scopeType, scopeId }) => ({ scopeType, scopeId }));
    const command = { schemaVersion: "budget-reserve-command-v1", kind: "reserve",
      reservationId: "attacker", compareId: "compare-1", forecast: legacyForecast,
      forecastHash: digest(legacyForecast), forecastUnits: 1, scopeSetHash: digest(scopeSet),
      expectedScopeRevisions: [{ scopeId: "agency-attacker", revision: 0 }] };
    expect(reserveBudget({ schemaVersion: "budget-portfolio-v1", balances }, command).ok).toBe(false);
  });
  it("rejects stale policy CAS, owner, kill, forecast, and any missing scope", () => {
    const portfolio = admittedPortfolio();
    expect(reserveBudget(portfolio, { ...reserveCommand(portfolio), expectedPolicyRevision: 1 }).ok).toBe(false);
    expect(validateBudgetPortfolio({ ...portfolio, currentOwnerAssignmentRefs: [] }).ok).toBe(false);
    expect(validateBudgetPortfolio({ ...portfolio, killedRefs: ["kill:budget"] }).ok).toBe(false);
    expect(validateBudgetPortfolio({ ...portfolio, forecast: { ...forecastRequest, components: forecastRequest.components.slice(1) } }).ok).toBe(false);
    expect(validateBudgetPortfolio({ ...portfolio, balances: portfolio.balances.slice(1) }).ok).toBe(false);
  });
});

describe("authoritative finalization and conservative usage", () => {
  it("rejects caller-authored proof hashes and settlement splits", () => {
    const legacyState = { schemaVersion: "budget-state-v1", reservation: {
      schemaVersion: "budget-reservation-v1", reservationId: "legacy", compareId: null,
      forecastUnits: 1, forecastHash: H("1"), scopeSetHash: H("2"), state: "held",
      revision: 0, settledUnits: 0, releasedUnits: 0, unresolvedUnits: 1 },
      balances: [{ scopeType: "agency", scopeId: "agency", limit: 10, remaining: 9,
        held: 1, settled: 0, released: 0, revision: 1 }], observations: [],
      dispatchState: "allowed", breachObservationId: null };
    const seed = { schemaVersion: "budget-finalization-proof-v1", proofKind: "no-dispatch",
      reservationId: "legacy", reservationRevision: 0, terminalReceiptHash: null,
      noDispatchEvidenceHash: H("c"), ownerEvidenceHash: null };
    const command = { schemaVersion: "budget-finalize-command-v1", kind: "finalize",
      expectedReservationRevision: 0, expectedScopeRevisions: [{ scopeId: "agency", revision: 1 }],
      evidenceSource: "fixture", settledUnits: 0, releasedUnits: 1,
      proof: { ...seed, proofHash: digest(seed) } };
    expect(reduceBudget(legacyState, command).ok).toBe(false);
  });
  it("derives settlement and release only from admitted state evidence", () => {
    const state = reserveFixture();
    const terminal = state.finalizationEvidence.find((item) => item.evidenceId === "terminal-1");
    if (!terminal) throw new Error("missing terminal evidence");
    const result = reduceBudget(state, finalize(state, terminal.evidenceHash));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.reservation).toMatchObject({ state: "settled",
      settledUnits: 230, releasedUnits: 250, unresolvedUnits: 0, finalEvidenceHash: terminal.evidenceHash });
    expect(result.value.state.balances.every((item) => item.held === 0
      && item.settled === 230 && item.released === 250
      && item.remaining + item.held + item.settled === item.limit)).toBe(true);
    expect(reduceBudget(result.value.state, finalize(state, terminal.evidenceHash))).toMatchObject({
      ok: true, value: { disposition: "attached" },
    });
  });
  it("rejects unreachable balance redistribution and revision progression", () => {
    const held = reserveFixture(); const terminal = held.finalizationEvidence.find((item) => item.evidenceId === "terminal-1");
    if (!terminal) throw new Error("missing terminal evidence"); const result = reduceBudget(held, finalize(held, terminal.evidenceHash)); if (!result.ok) return;
    const redistributed = { ...result.value.state, balances: result.value.state.balances.map((item, index) => index ? item : { ...item, remaining: item.limit, held: 0, settled: 0, released: 480, revision: 999 }) };
    const lateReservation = seal({ ...result.value.state.reservation, revision: 998 }, "reservationHash");
    const late = { ...result.value.state, reservation: lateReservation, balances: result.value.state.balances.map((item) => ({ ...item, revision: 999 })) };
    const lateHeld = { ...held, balances: held.balances.map((item) => ({ ...item, revision: 999 })) };
    expect([validateBudgetState(redistributed).ok, validateBudgetState(late).ok, validateBudgetState(lateHeld).ok]).toEqual([false, false, false]);
  });
  it("keeps provider and driver observations attach-only and kills on over-reserve", () => {
    let state = reserveFixture();
    for (const [source, units] of [["provider", 300], ["driver", 181]] as const) {
      const result = reduceBudget(state, { schemaVersion: "budget-usage-command-v1",
        kind: "attach-usage", expectedReservationHash: state.reservation.reservationHash,
        expectedReservationRevision: state.reservation.revision,
        observation: { observationId: `usage-${source}`, attemptId: source, source,
          reportedUnits: units, billingState: "known", observedAtMs: 1200 } });
      expect(result.ok).toBe(true); if (!result.ok) return; state = result.value.state;
    }
    expect(state).toMatchObject({ dispatchState: "killed", breachObservationId: "usage-driver",
      reservation: { state: "held", unresolvedUnits: 480 } });
    expect(state.balances.every((item) => item.held === 480)).toBe(true);
  });
  it("requires admitted owner evidence to exit an ambiguous hold", () => {
    const held = reserveFixture();
    const onHold = reduceBudget(held, { schemaVersion: "budget-hold-command-v1",
      kind: "hold-ambiguous", commandId: "hold-1", observedAtMs: 1250,
      expectedReservationHash: held.reservation.reservationHash,
      expectedReservationRevision: held.reservation.revision, expectedScopeRevisions: guards(held),
      reason: "billing" });
    expect(onHold.ok).toBe(true); if (!onHold.ok) return;
    const state = onHold.value.state;
    const owner = state.finalizationEvidence.find((item) => item.evidenceId === "owner-1");
    const unused = state.finalizationEvidence.find((item) => item.evidenceId === "unused-1");
    if (!owner || !unused) throw new Error("missing evidence");
    expect(reduceBudget(state, finalize(state, unused.evidenceHash)).ok).toBe(false);
    const result = reduceBudget(state, finalize(state, owner.evidenceHash, "owner-finalize"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.state.reservation).toMatchObject({
      state: "settled", settledUnits: 300, releasedUnits: 180,
    });
  });
});

describe("state-bound retry gate", () => {
  it("allows one same-route retry only against the exact current held state", () => {
    const state = reserveFixture();
    expect(evaluateBudgetRetry(state, retryGate(state))).toEqual({ ok: true, value: true });
    for (const drift of [{ reservationHash: H("f") }, { attemptIndex: 1 },
      { billingState: "ambiguous" }, { effectState: "possible" }, { observedAtMs: 5000 }]) {
      expect(evaluateBudgetRetry(state, { ...retryGate(state), ...drift })).not.toEqual({ ok: true, value: true });
    }
  });
  it("denies killed, breached, and reconciliation-held budget states", () => {
    const held = reserveFixture();
    const breached = reduceBudget(held, { schemaVersion: "budget-usage-command-v1",
      kind: "attach-usage", expectedReservationHash: held.reservation.reservationHash,
      expectedReservationRevision: 0, observation: { observationId: "breach", attemptId: "a",
        source: "provider", reportedUnits: 481, billingState: "known", observedAtMs: 1200 } });
    expect(breached.ok).toBe(true);
    if (breached.ok) expect(evaluateBudgetRetry(breached.value.state, retryGate(breached.value.state)))
      .not.toEqual({ ok: true, value: true });
    const uncertain = reduceBudget(held, { schemaVersion: "budget-hold-command-v1",
      kind: "hold-ambiguous", commandId: "hold-retry", observedAtMs: 1200,
      expectedReservationHash: held.reservation.reservationHash,
      expectedReservationRevision: 0, expectedScopeRevisions: guards(held), reason: "dispatch" });
    expect(uncertain.ok).toBe(true);
    if (uncertain.ok) expect(evaluateBudgetRetry(uncertain.value.state, retryGate(uncertain.value.state)))
      .not.toEqual({ ok: true, value: true });
  });
});

describe("exact budget command replay", () => {
  it("records canonical reserve and hold hashes and attaches only the exact hold", () => {
    const portfolio = admittedPortfolio(); const command = reserveCommand(portfolio); const reserved = reserveBudget(portfolio, command); if (!reserved.ok) return;
    expect(reserved.value.state.lastCommandHash).toBe(digest(command)); const held = reserved.value.state;
    const hold = { schemaVersion: "budget-hold-command-v1", kind: "hold-ambiguous", commandId: "hold-exact", observedAtMs: 1250,
      expectedReservationHash: held.reservation.reservationHash, expectedReservationRevision: held.reservation.revision,
      expectedScopeRevisions: guards(held), reason: "billing" } as const;
    const first = reduceBudget(held, hold); expect(first.ok).toBe(true); if (!first.ok) return;
    expect(first.value.state.lastCommandHash).toBe(digest(hold));
    expect(reduceBudget(first.value.state, hold)).toMatchObject({ ok: true, value: { disposition: "attached" } });
    expect(reduceBudget(first.value.state, { ...hold, reason: "stop" }).ok).toBe(false);
  });
  it("requires exact reservation CAS for a duplicate usage observation", () => {
    const state = reserveFixture(); const command = { schemaVersion: "budget-usage-command-v1", kind: "attach-usage",
      expectedReservationHash: state.reservation.reservationHash, expectedReservationRevision: state.reservation.revision,
      observation: { observationId: "usage-exact", attemptId: "attempt-exact", source: "provider", reportedUnits: 10, billingState: "known", observedAtMs: 1200 } } as const;
    const first = reduceBudget(state, command); expect(first.ok).toBe(true); if (!first.ok) return;
    expect([reduceBudget(first.value.state, command).ok, reduceBudget(first.value.state, { ...command, expectedReservationHash: H("f") }).ok,
      reduceBudget(first.value.state, { ...command, expectedReservationRevision: 1 }).ok,
      reduceBudget(first.value.state, { ...command, observation: { ...command.observation, reportedUnits: 11 } }).ok]).toEqual([true, false, false, false]);
  });
  it("attaches a finalized state only for the identical full command", () => {
    const state = reserveFixture(); const terminal = state.finalizationEvidence.find((item) => item.evidenceId === "terminal-1"); if (!terminal) return;
    const command = finalize(state, terminal.evidenceHash); const first = reduceBudget(state, command); expect(first.ok).toBe(true); if (!first.ok) return;
    expect(first.value.state.lastCommandHash).toBe(digest(command));
    expect([reduceBudget(first.value.state, command).ok, reduceBudget(first.value.state, { ...command, observedAtMs: 1301 }).ok,
      reduceBudget(first.value.state, { ...command, expectedReservationRevision: 1 }).ok]).toEqual([true, false, false]);
  });
  it("rejects reassigned current command hashes in every lifecycle state", () => {
    const held = reserveFixture(); const hold = { schemaVersion: "budget-hold-command-v1", kind: "hold-ambiguous", commandId: "hold-bound", observedAtMs: 1250,
      expectedReservationHash: held.reservation.reservationHash, expectedReservationRevision: held.reservation.revision, expectedScopeRevisions: guards(held), reason: "billing" } as const;
    const onHold = reduceBudget(held, hold); const terminal = held.finalizationEvidence.find((item) => item.evidenceId === "terminal-1"); if (!onHold.ok || !terminal) return;
    const done = reduceBudget(held, finalize(held, terminal.evidenceHash)); if (!done.ok) return;
    expect([held, onHold.value.state, done.value.state].map((state) => validateBudgetState({ ...state, lastCommandHash: H("f") }).ok)).toEqual([false, false, false]);
  });
});
