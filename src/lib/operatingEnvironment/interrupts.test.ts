import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeSelfHash } from "./canonical";
import {
  attachHumanInterrupt,
  reduceInterruptDecision,
  validateHumanInterrupt,
} from "./interrupts";
const CREATED_AT = "2026-09-01T00:00:00Z";
const EXPIRES_AT = "2026-09-02T00:00:00Z";
function seal<T extends Record<string, unknown>>(record: T, hashField: string): T {
  const candidate = { ...record, [hashField]: "0".repeat(64) };
  const hash = computeSelfHash(candidate, hashField);
  if (!hash.ok) throw new Error(`fixture hash failed: ${hash.reason}`);
  return { ...candidate, [hashField]: hash.value } as T;
}
function makeInterrupt(overrides: Record<string, unknown> = {}) {
  return seal({
    schemaVersion: "human-interrupt-v1",
    interruptId: "interrupt-fixture-1",
    jobId: "job-fixture-1",
    segmentId: "segment-fixture-1",
    invocationId: "invocation-fixture-1",
    intentHash: "1".repeat(64),
    segmentManifestHash: "2".repeat(64),
    completedAttemptHash: "3".repeat(64),
    proposalEnvelopeHash: "4".repeat(64),
    expectedProjectStateHash: "5".repeat(64),
    expectedCandidateHash: "6".repeat(64),
    issuer: "one-box-control-plane",
    issuerPolicyHash: "7".repeat(64),
    reasonCode: "proposal-review-required",
    requestedDecisionSchemaHash: "8".repeat(64),
    safeSummary: "Review the typed synthetic proposal.",
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    interruptHash: "0".repeat(64),
    ...overrides,
  }, "interruptHash");
}
function makeGenesis(interrupt = makeInterrupt(), overrides: Record<string, unknown> = {}) {
  return seal({
    schemaVersion: "interrupt-decision-slot-v1",
    interruptHash: interrupt.interruptHash,
    state: "undecided",
    decisionHash: null,
    stateRevision: 0,
    previousSlotHash: null,
    updatedAt: CREATED_AT,
    slotHash: "0".repeat(64),
    ...overrides,
  }, "slotHash");
}
function makeAttachmentEvent(
  interrupt = makeInterrupt(),
  genesisSlot = makeGenesis(interrupt),
  overrides: Record<string, unknown> = {},
) {
  return seal({
    schemaVersion: "interrupt-attachment-event-v1",
    projectId: "one-box",
    interrupt,
    genesisSlot,
    attemptState: "completed",
    proposalState: "validated-unapplied",
    hasLiveWork: false,
    eventHash: "0".repeat(64),
    ...overrides,
  }, "eventHash");
}
function makeDecision(
  interrupt = makeInterrupt(),
  decisionValue: "accept-proposal" | "reject" | "cancel" = "accept-proposal",
  overrides: Record<string, unknown> = {},
) {
  return seal({
    schemaVersion: "human-decision-v1",
    decisionId: "decision-fixture-1",
    interruptHash: interrupt.interruptHash,
    actorId: "person:fixture-reviewer",
    projectId: "one-box",
    decisionSchemaHash: interrupt.requestedDecisionSchemaHash,
    decisionValue,
    rationaleHash: "9".repeat(64),
    policyHash: "a".repeat(64),
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    decisionHash: "0".repeat(64),
    ...overrides,
  }, "decisionHash");
}
function allLive(overrides: Record<string, unknown> = {}) {
  return {
    actorAuthorized: true,
    authorizationCurrent: true,
    ownershipCurrent: true,
    contextCurrent: true,
    routeCurrent: true,
    skillCurrent: true,
    toolGrantCurrent: true,
    budgetCurrent: true,
    deadlineCurrent: true,
    reservationHeld: true,
    killSwitchesOff: true,
    ...overrides,
  };
}
function makeDecisionEvent(
  interrupt = makeInterrupt(),
  decision = makeDecision(interrupt),
  overrides: Record<string, unknown> = {},
) {
  return seal({
    schemaVersion: "interrupt-decision-event-v1",
    expectedRevision: 0,
    decision,
    observedAt: CREATED_AT,
    projectStateHash: interrupt.expectedProjectStateHash,
    candidateHash: interrupt.expectedCandidateHash,
    completedAttemptHash: interrupt.completedAttemptHash,
    proposalEnvelopeHash: interrupt.proposalEnvelopeHash,
    live: allLive(),
    eventHash: "0".repeat(64),
    ...overrides,
  }, "eventHash");
}
function createControl(interrupt = makeInterrupt()) {
  const attached = attachHumanInterrupt(null, makeAttachmentEvent(interrupt, makeGenesis(interrupt)));
  expect(attached.ok).toBe(true);
  if (!attached.ok) throw new Error("fixture control failed");
  return attached.value.state;
}
describe("immutable proposal interrupt attachment", () => {
  it("accepts only the control-plane interrupt contract", () => {
    const interrupt = makeInterrupt();
    const result = validateHumanInterrupt(interrupt);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
    expect(validateHumanInterrupt(
      seal({ ...interrupt, issuer: "model" }, "interruptHash"),
    ).ok).toBe(false);
    expect(validateHumanInterrupt(
      seal({ ...interrupt, providerHandle: "opaque" }, "interruptHash"),
    ).ok).toBe(false);
  });
  it("creates exactly one immutable interrupt with one genesis decision slot", () => {
    const interrupt = makeInterrupt();
    const result = attachHumanInterrupt(null, makeAttachmentEvent(interrupt, makeGenesis(interrupt)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.disposition).toBe("applied");
    expect(result.value.state.interrupt).toEqual(interrupt);
    expect(result.value.state.slot).toMatchObject({
      state: "undecided",
      decisionHash: null,
      stateRevision: 0,
      previousSlotHash: null,
    });
    expect(result.value.state.terminalDirective).toBeNull();
    expect(Object.isFrozen(result.value.state)).toBe(true);
  });
  it("attaches an exact duplicate and rejects any competing interrupt", () => {
    const interrupt = makeInterrupt();
    const event = makeAttachmentEvent(interrupt, makeGenesis(interrupt));
    const first = attachHumanInterrupt(null, event);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const replay = attachHumanInterrupt(first.value.state, event);
    const competingInterrupt = makeInterrupt({ proposalEnvelopeHash: "f".repeat(64) });
    const competing = attachHumanInterrupt(
      first.value.state,
      makeAttachmentEvent(competingInterrupt, makeGenesis(competingInterrupt)),
    );
    expect(replay).toEqual({
      ok: true,
      value: { disposition: "attached", state: first.value.state },
    });
    expect(competing.ok).toBe(false);
  });
  it("rejects a decided genesis, non-completed attempt, or live work", () => {
    const interrupt = makeInterrupt();
    const decidedGenesis = makeGenesis(interrupt, {
      state: "decided",
      decisionHash: "d".repeat(64),
    });
    expect(attachHumanInterrupt(null, makeAttachmentEvent(interrupt, decidedGenesis)).ok).toBe(false);
    expect(attachHumanInterrupt(
      null,
      makeAttachmentEvent(interrupt, makeGenesis(interrupt), { attemptState: "active" }),
    ).ok).toBe(false);
    expect(attachHumanInterrupt(
      null,
      makeAttachmentEvent(interrupt, makeGenesis(interrupt), { hasLiveWork: true }),
    ).ok).toBe(false);
  });
});
describe("single decision-slot compare-and-swap", () => {
  it("accepts directly to one completed terminal directive with no further work", () => {
    const interrupt = makeInterrupt();
    const result = reduceInterruptDecision(createControl(interrupt), makeDecisionEvent(interrupt));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.disposition).toBe("applied");
    expect(result.value.directive).toMatchObject({
      terminalState: "completed",
      reason: "proposal-accepted",
      workDirective: "none",
      effectDirective: "none",
    });
    expect(result.value.state.slot).toMatchObject({
      state: "decided",
      decisionHash: result.value.directive.decisionHash,
      stateRevision: 1,
    });
    expect(result.value.directive).not.toHaveProperty("resume");
    expect(result.value.directive).not.toHaveProperty("provider");
    expect(result.value.directive).not.toHaveProperty("apply");
  });
  it.each(["reject", "cancel"] as const)(
    "moves %s directly to cancellation",
    (decisionValue) => {
      const interrupt = makeInterrupt();
      const decision = makeDecision(interrupt, decisionValue);
      const result = reduceInterruptDecision(
        createControl(interrupt),
        makeDecisionEvent(interrupt, decision),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.directive.terminalState).toBe("cancelled");
    },
  );
  it("cancels acceptance when any live completion gate is no longer current", () => {
    for (const field of Object.keys(allLive())) {
      const interrupt = makeInterrupt();
      const event = makeDecisionEvent(interrupt, makeDecision(interrupt), {
        live: allLive({ [field]: false }),
      });
      const result = reduceInterruptDecision(createControl(interrupt), event);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.directive.terminalState).toBe("cancelled");
        expect(result.value.directive.reason).toBe("live-gate-failed");
      }
    }
  });
  it("cancels an acceptance observed at interrupt expiry", () => {
    const interrupt = makeInterrupt();
    const decision = makeDecision(interrupt, "accept-proposal", {
      createdAt: EXPIRES_AT,
      expiresAt: "2026-09-03T00:00:00Z",
    });
    const result = reduceInterruptDecision(
      createControl(interrupt),
      makeDecisionEvent(interrupt, decision, { observedAt: EXPIRES_AT }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.directive.terminalState).toBe("cancelled");
      expect(result.value.directive.reason).toBe("live-gate-failed");
    }
  });
  it.each(["projectStateHash", "candidateHash"] as const)(
    "turns stale %s CAS into terminal cancellation",
    (field) => {
      const interrupt = makeInterrupt();
      const result = reduceInterruptDecision(createControl(interrupt), makeDecisionEvent(
        interrupt, makeDecision(interrupt), { [field]: "f".repeat(64) },
      ));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.directive).toMatchObject({
        terminalState: "cancelled", reason: "live-gate-failed",
      });
    },
  );
  it("rejects a decision created before its interrupt", () => {
    const interrupt = makeInterrupt();
    const decision = makeDecision(interrupt, "accept-proposal", {
      createdAt: "2026-08-31T23:59:59Z",
    });
    expect(reduceInterruptDecision(
      createControl(interrupt), makeDecisionEvent(interrupt, decision),
    ).ok).toBe(false);
  });
  it("attaches an exact decision replay without creating a second slot head", () => {
    const interrupt = makeInterrupt();
    const event = makeDecisionEvent(interrupt);
    const first = reduceInterruptDecision(createControl(interrupt), event);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const replay = reduceInterruptDecision(first.value.state, event);
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.value.disposition).toBe("attached");
      expect(replay.value.state).toEqual(first.value.state);
      expect(replay.value.directive).toEqual(first.value.directive);
      expect(replay.value.state.slot.stateRevision).toBe(1);
    }
  });
  it("rejects stale CAS revisions and conflicting later decisions", () => {
    const interrupt = makeInterrupt();
    const acceptedEvent = makeDecisionEvent(interrupt);
    const initial = createControl(interrupt);
    const applied = reduceInterruptDecision(initial, acceptedEvent);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const rejection = makeDecision(interrupt, "reject", { decisionId: "decision-fixture-2" });
    expect(reduceInterruptDecision(
      initial,
      makeDecisionEvent(interrupt, makeDecision(interrupt), { expectedRevision: 1 }),
    ).ok).toBe(false);
    expect(reduceInterruptDecision(
      applied.value.state,
      makeDecisionEvent(interrupt, rejection),
    ).ok).toBe(false);
  });
  it("rejects decision, schema, project, attempt, and proposal mismatches", () => {
    const interrupt = makeInterrupt();
    const mismatchedDecision = makeDecision(interrupt, "accept-proposal", {
      interruptHash: "f".repeat(64),
    });
    const cases = [
      makeDecisionEvent(interrupt, mismatchedDecision),
      makeDecisionEvent(interrupt, makeDecision(interrupt, "accept-proposal", {
        decisionSchemaHash: "f".repeat(64),
      })),
      makeDecisionEvent(interrupt, makeDecision(interrupt, "accept-proposal", {
        projectId: "other-project",
      })),
      makeDecisionEvent(interrupt, makeDecision(interrupt), {
        completedAttemptHash: "f".repeat(64),
      }),
      makeDecisionEvent(interrupt, makeDecision(interrupt), {
        proposalEnvelopeHash: "f".repeat(64),
      }),
    ];
    for (const event of cases) {
      expect(reduceInterruptDecision(createControl(interrupt), event).ok).toBe(false);
    }
  });
  it("requires a named human actor and rejects unknown decision fields", () => {
    const interrupt = makeInterrupt();
    const modelDecision = makeDecision(interrupt, "accept-proposal", {
      actorId: "model:fixture",
    });
    const extra = makeDecision(interrupt, "accept-proposal", { approveRelease: true });
    expect(reduceInterruptDecision(
      createControl(interrupt), makeDecisionEvent(interrupt, modelDecision),
    ).ok).toBe(false);
    expect(reduceInterruptDecision(
      createControl(interrupt), makeDecisionEvent(interrupt, extra),
    ).ok).toBe(false);
  });
});
describe("interrupt module architecture", () => {
  it("keeps the pure terminal-only interface below 400 lines", () => {
    const source = readFileSync(new URL("./interrupts.ts", import.meta.url), "utf8");
    const exportedNames = [...source.matchAll(
      /^export (?:function|type) (\w+)/gm,
    )].map((match) => match[1]);
    expect(source.split("\n").length - 1).toBeLessThan(400);
    expect(source).not.toMatch(/node:(?:fs|child_process|http|https|net|tls)/);
    expect(source).not.toMatch(/\b(?:fetch|WebSocket|process\.env|exec|spawn)\b/);
    expect(exportedNames).toEqual([
      "HumanInterruptV1",
      "HumanDecisionV1",
      "InterruptDecisionSlotV1",
      "ProposalTerminalDirectiveV1",
      "ProposalInterruptControlV1",
      "InterruptAttachmentEventV1",
      "InterruptDecisionEventV1",
      "InterruptAttachmentV1",
      "InterruptDecisionReductionV1",
      "validateHumanInterrupt",
      "attachHumanInterrupt",
      "reduceInterruptDecision",
    ]);
  });
});
