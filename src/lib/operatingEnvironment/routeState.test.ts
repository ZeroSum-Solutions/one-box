import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import routeFixture from "./fixtures/route-state-v1.json";
import { reduceAttempt, reduceSegment, validateRouteStateFixture } from "./routeState";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(
    (key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`,
  ).join(",")}}`;
}

function sealDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => sealDeep(item)) as T;
  if (value === null || typeof value !== "object") return value;
  const rebuilt = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sealDeep(item)]),
  );
  if (!("selfHash" in rebuilt)) return rebuilt as T;
  const payload = Object.fromEntries(
    Object.entries(rebuilt).filter(([key]) => key !== "selfHash"),
  );
  return {
    ...payload,
    selfHash: createHash("sha256").update(canonicalJson(payload)).digest("hex"),
  } as T;
}

function sealEvent<T extends { eventHash: string }>(event: T): T {
  const payload = Object.fromEntries(
    Object.entries(event).filter(([key]) => key !== "eventHash"),
  );
  return {
    ...payload,
    eventHash: createHash("sha256").update(canonicalJson(payload)).digest("hex"),
  } as T;
}

function changedFixture(
  mutate: (fixture: typeof routeFixture) => void,
): typeof routeFixture {
  const fixture = structuredClone(routeFixture);
  mutate(fixture);
  return sealDeep(fixture);
}

describe("route module architecture", () => {
  it("keeps the deep route-state interface honest and below 400 lines", () => {
    const source = readFileSync(new URL("./routeState.ts", import.meta.url), "utf8");
    const exportedNames = [...source.matchAll(
      /^export (?:function|type) (\w+)/gm,
    )].map((match) => match[1]);

    expect(source.split("\n").length - 1).toBeLessThan(400);
    expect(source).not.toMatch(
      /;[^\S\r\n]+(?:const|let|function|class|type|interface|export)\b/,
    );
    expect(exportedNames).toEqual([
      "RouteSegmentIntentV1",
      "RouteSegmentManifestV1",
      "RouteAttemptV1",
      "RouteSegmentStateV1",
      "RouteStateFixtureV1",
      "SegmentReductionV1",
      "AttemptReductionV1",
      "validateRouteStateFixture",
      "reduceSegment",
      "reduceAttempt",
    ]);
  });
});

describe("route-state fixture validation", () => {
  it("accepts and deeply freezes every literal lifecycle state", () => {
    const result = validateRouteStateFixture(routeFixture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(routeFixture);
    expect(Object.isFrozen(result.value.states)).toBe(true);
    expect(Object.isFrozen(result.value.states.active.attempts)).toBe(true);
    expect(Object.isFrozen(result.value.attempts.retryable)).toBe(true);
  });

  it("rejects unknown fields, unsafe revisions, and malformed hashes", () => {
    const unknown = structuredClone(routeFixture) as typeof routeFixture & {
      states: typeof routeFixture.states & { draft: Record<string, unknown> };
    };
    unknown.states.draft.providerHandle = "live";
    const unsafeRevision = changedFixture((fixture) => {
      fixture.states.validated.revision = -1;
    });
    const malformedHash = changedFixture((fixture) => {
      fixture.attempts.active.inputHash = "not-a-hash";
    });

    expect(validateRouteStateFixture(unknown).ok).toBe(false);
    expect(validateRouteStateFixture(unsafeRevision).ok).toBe(false);
    expect(validateRouteStateFixture(malformedHash).ok).toBe(false);
  });

  it("rejects incomplete interrupted state and invalid receipt finality", () => {
    const incompleteInterrupt = changedFixture((fixture) => {
      fixture.states.interrupted.interrupt = null as unknown as typeof fixture.states.interrupted.interrupt;
    });
    const terminalWithoutReceipt = changedFixture((fixture) => {
      fixture.states.terminal.receiptHash = null as unknown as string;
    });
    const nonterminalReceipt = changedFixture((fixture) => {
      fixture.states.active.receiptHash = "8".repeat(64) as unknown as null;
    });

    expect(validateRouteStateFixture(incompleteInterrupt).ok).toBe(false);
    expect(validateRouteStateFixture(terminalWithoutReceipt).ok).toBe(false);
    expect(validateRouteStateFixture(nonterminalReceipt).ok).toBe(false);
  });
});

describe("immutable segment admission and switching", () => {
  it("refuses a draft that is not at the genesis revision", () => {
    const advancedDraft = sealDeep({
      ...structuredClone(routeFixture.states.draft),
      revision: 7,
    });
    const result = reduceSegment(advancedDraft, sealEvent({
      kind: "validate" as const,
      expectedRevision: 7,
      eventHash: "0".repeat(64),
      manifest: routeFixture.states.validated.manifest,
    }));

    expect(result.ok).toBe(false);
  });

  it("validates a draft by binding the immutable manifest", () => {
    const result = reduceSegment(routeFixture.states.draft, {
      kind: "validate",
      expectedRevision: 0,
      eventHash: routeFixture.states.validated.lastEventHash,
      manifest: routeFixture.states.validated.manifest,
    });

    expect(result).toEqual({
      ok: true,
      value: { disposition: "applied", state: routeFixture.states.validated },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value.state)).toBe(true);
    expect(Object.isFrozen(result.value.state.intent)).toBe(true);
  });

  it("reserves and activates without rewriting the admitted route", () => {
    const reserved = reduceSegment(routeFixture.states.validated, {
      kind: "reserve",
      expectedRevision: 1,
      eventHash: routeFixture.states.reserved.lastEventHash,
      reservationEvidenceHash: "f".repeat(64),
    });
    expect(reserved).toEqual({
      ok: true,
      value: { disposition: "applied", state: routeFixture.states.reserved },
    });

    const active = reduceSegment(routeFixture.states.reserved, {
      kind: "activate",
      expectedRevision: 2,
      eventHash: routeFixture.states.active.lastEventHash,
      attempt: routeFixture.attempts.active,
    });
    expect(active).toEqual({
      ok: true,
      value: { disposition: "applied", state: routeFixture.states.active },
    });
  });

  it("attaches an exact replay and rejects a conflicting stale CAS", () => {
    const replay = reduceSegment(routeFixture.states.validated, {
      kind: "validate",
      expectedRevision: 0,
      eventHash: routeFixture.states.validated.lastEventHash,
      manifest: routeFixture.states.validated.manifest,
    });
    const conflict = reduceSegment(
      routeFixture.states.validated,
      sealEvent({
        kind: "reserve" as const,
        expectedRevision: 0,
        eventHash: "0".repeat(64),
        reservationEvidenceHash: "f".repeat(64),
      }),
    );

    expect(replay).toEqual({
      ok: true,
      value: { disposition: "attached", state: routeFixture.states.validated },
    });
    expect(conflict.ok).toBe(false);
  });

  it("turns route switching into cancellation and keeps terminal state final", () => {
    const cancelled = reduceSegment(routeFixture.states.active, {
      kind: "cancel",
      expectedRevision: 3,
      eventHash: routeFixture.states.terminal.lastEventHash,
      reason: "route-switch",
      receiptHash: "8".repeat(64),
    });
    expect(cancelled).toEqual({
      ok: true,
      value: { disposition: "applied", state: routeFixture.states.terminal },
    });

    const terminalMutation = reduceSegment(routeFixture.states.terminal, sealEvent({
      kind: "cancel",
      expectedRevision: 4,
      eventHash: "0".repeat(64),
      reason: "operator-cancel",
      receiptHash: "b".repeat(64),
    }));
    expect(terminalMutation.ok).toBe(false);
  });

  it("quarantines late output without changing terminal bytes", () => {
    const late = reduceSegment(routeFixture.states.terminal, sealEvent({
      kind: "observe-output",
      expectedRevision: 4,
      eventHash: "0".repeat(64),
      attemptId: "attempt-0",
      outputHash: "c".repeat(64),
    }));

    expect(late).toEqual({
      ok: true,
      value: { disposition: "quarantined", state: routeFixture.states.terminal },
    });
  });
});

function claimRetryEvent(retryAttempt: typeof routeFixture.attempts.retry = routeFixture.attempts.retry) {
  return sealEvent({
    kind: "claim-retry" as const,
    expectedRevision: 1,
    eventHash: "0".repeat(64),
    retryAttempt,
    deadlineEvidenceHash: "1".repeat(64),
    policyEvidenceHash: "2".repeat(64),
    hasUsableOutput: false as const,
  });
}

describe("one same-route retry", () => {
  it("consumes attempt zero while claiming exactly one same-route retry", () => {
    const result = reduceAttempt(routeFixture.attempts.retryable, claimRetryEvent());

    expect(result).toEqual({
      ok: true,
      value: {
        disposition: "applied",
        attempt: routeFixture.attempts.consumed,
        retryAttempt: routeFixture.attempts.retryClaimed,
      },
    });
  });

  it("also permits one known-billing transient rate-limit retry", () => {
    const retryable = sealDeep({
      ...routeFixture.attempts.retryable,
      failureClass: "transient-rate-limit",
    });

    expect(reduceAttempt(retryable, claimRetryEvent()).ok).toBe(true);
  });

  it("rejects non-transient classes, ambiguous billing, and usable output", () => {
    const classes = [
      "authentication", "authorization", "policy", "identity", "region", "data",
      "price", "budget", "schema", "cancelled", "ambiguous-billing", "content",
    ];
    for (const failureClass of classes) {
      const attempt = sealDeep({ ...routeFixture.attempts.retryable, failureClass });
      expect(reduceAttempt(attempt, claimRetryEvent()).ok).toBe(false);
    }
    const ambiguous = sealDeep({ ...routeFixture.attempts.retryable, billingState: "ambiguous" });
    const usableOutput = sealEvent({ ...claimRetryEvent(), hasUsableOutput: true });
    expect(reduceAttempt(ambiguous, claimRetryEvent()).ok).toBe(false);
    expect(reduceAttempt(routeFixture.attempts.retryable, usableOutput).ok).toBe(false);
  });

  it("rejects a third attempt, a cross-route retry, and maxAttempts one", () => {
    const crossRoute = sealDeep({
      ...routeFixture.attempts.retry,
      routePolicyHash: "f".repeat(64),
    });
    const noRetry = sealDeep({
      ...routeFixture.attempts.retryable,
      maxAttempts: 1,
    });

    expect(reduceAttempt(routeFixture.attempts.retryClaimed, claimRetryEvent()).ok).toBe(false);
    expect(reduceAttempt(routeFixture.attempts.retryable, claimRetryEvent(crossRoute)).ok).toBe(false);
    expect(reduceAttempt(noRetry, claimRetryEvent()).ok).toBe(false);
  });

  it("attaches an exact retry replay without creating another attempt", () => {
    const result = reduceAttempt(routeFixture.attempts.consumed, claimRetryEvent());

    expect(result).toEqual({
      ok: true,
      value: {
        disposition: "attached",
        attempt: routeFixture.attempts.consumed,
        retryAttempt: routeFixture.attempts.retryClaimed,
      },
    });
  });
});

function proposalEvent(overrides: Record<string, unknown> = {}) {
  return sealEvent({
    kind: "proposal-interrupt" as const,
    expectedRevision: 4,
    eventHash: "0".repeat(64),
    proposalHash: "4".repeat(64),
    expectedStateHash: routeFixture.states.proposalReady.selfHash,
    decisionHash: "6".repeat(64),
    reservationEvidenceHash: "f".repeat(64),
    proposalStatus: "validated-unapplied" as const,
    decision: "accepted" as const,
    hasLiveWork: false as const,
    ...overrides,
  });
}

describe("proposal interruption and quarantine", () => {
  it("interrupts only a settled proposal-ready segment with four bound hashes", () => {
    const result = reduceSegment(routeFixture.states.proposalReady, proposalEvent());

    expect(result).toEqual({
      ok: true,
      value: { disposition: "applied", state: routeFixture.states.interrupted },
    });
  });

  it("keeps proposal interruption distinct and unique under replay", () => {
    const replay = reduceSegment(routeFixture.states.interrupted, proposalEvent());
    const competing = reduceSegment(
      routeFixture.states.interrupted,
      proposalEvent({ proposalHash: "5".repeat(64) }),
    );

    expect(replay).toEqual({
      ok: true,
      value: { disposition: "attached", state: routeFixture.states.interrupted },
    });
    expect(competing.ok).toBe(false);
    expect(routeFixture.states.terminal.interrupt).toBeNull();
  });

  it("cancels rejected, expired, revoked, or stale-state proposal decisions", () => {
    for (const decision of ["rejected", "expired", "revoked"]) {
      const result = reduceSegment(
        routeFixture.states.proposalReady,
        proposalEvent({ decision }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.state.state).toBe("cancelled");
        expect(result.value.state.interrupt).toBeNull();
      }
    }
    const stale = reduceSegment(
      routeFixture.states.proposalReady,
      proposalEvent({ expectedStateHash: "a".repeat(64) }),
    );
    expect(stale.ok).toBe(true);
    if (stale.ok) expect(stale.value.state.state).toBe("cancelled");
  });

  it("rejects live work and quarantines every post-interrupt output", () => {
    expect(
      reduceSegment(routeFixture.states.proposalReady, proposalEvent({ hasLiveWork: true })).ok,
    ).toBe(false);
    expect(
      reduceSegment(routeFixture.states.active, proposalEvent({
        expectedRevision: 3,
        expectedStateHash: routeFixture.states.active.selfHash,
      })).ok,
    ).toBe(false);
    const late = reduceSegment(routeFixture.states.interrupted, sealEvent({
      kind: "observe-output" as const,
      expectedRevision: 5,
      eventHash: "0".repeat(64),
      attemptId: "attempt-0",
      outputHash: "a".repeat(64),
    }));
    expect(late).toEqual({
      ok: true,
      value: { disposition: "quarantined", state: routeFixture.states.interrupted },
    });
  });

  it("attaches an exact output only while the segment remains active", () => {
    const observed = reduceSegment(routeFixture.states.proposalReady, sealEvent({
      kind: "observe-output" as const,
      expectedRevision: 4,
      eventHash: "0".repeat(64),
      attemptId: "attempt-0",
      outputHash: routeFixture.states.proposalReady.attempts[0].outputHash,
    }));

    expect(observed).toEqual({
      ok: true,
      value: { disposition: "attached", state: routeFixture.states.proposalReady },
    });
  });

  it("quarantines an exact matching output after the segment is settled", () => {
    const late = reduceSegment(routeFixture.states.interrupted, sealEvent({
      kind: "observe-output" as const,
      expectedRevision: 5,
      eventHash: "0".repeat(64),
      attemptId: "attempt-0",
      outputHash: routeFixture.states.interrupted.attempts[0].outputHash,
    }));

    expect(late).toEqual({
      ok: true,
      value: { disposition: "quarantined", state: routeFixture.states.interrupted },
    });
  });
});
