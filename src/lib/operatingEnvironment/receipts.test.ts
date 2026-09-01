import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeSelfHash } from "./canonical";
import securityFixture from "./fixtures/security-v1.json";
import {
  createTerminalRouteReceipt,
  projectRouteTerminalState,
  reviewProposal,
  validateReceiptSecurityFixture,
} from "./receipts";
function seal<T extends Record<string, unknown>>(record: T, hashField: string): T {
  const candidate = { ...record, [hashField]: "0".repeat(64) };
  const hash = computeSelfHash(candidate, hashField);
  if (!hash.ok) throw new Error(`fixture hash failed: ${hash.reason}`);
  return { ...candidate, [hashField]: hash.value } as T;
}
function resealFixture<T extends Record<string, unknown>>(fixture: T): T {
  return seal(fixture, "fixtureHash");
}
function reviewRequest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "proposal-review-request-v1",
    routeReceiptHash: securityFixture.routeReceipts[0].receiptHash,
    proposalHash: securityFixture.proposalEnvelopes[0].proposalHash,
    targetProjectId: "one-box",
    currentSourceIdentity: "source:fixture-v1",
    currentSourceHash: "b".repeat(64),
    reviewMode: "single",
    observedAt: "2026-09-01T00:00:02Z",
    ...overrides,
  };
}
function terminalInput(
  routeState: "succeeded" | "cancelled",
  overrides: Record<string, unknown> = {},
) {
  const receipt = securityFixture.routeReceipts[0];
  const isCompleted = routeState === "succeeded";
  return {
    schemaVersion: "route-terminal-receipt-input-v1",
    jobId: receipt.jobId,
    segmentId: receipt.segmentId,
    segmentIntentHash: receipt.segmentIntentHash,
    segmentManifestHash: receipt.segmentManifestHash,
    finalSegmentStateHash: receipt.finalSegmentStateHash,
    routePolicyHash: receipt.routePolicyHash,
    contextBundleHash: receipt.contextBundleHash,
    skillSetHash: receipt.skillSetHash,
    toolGrantHash: receipt.toolGrantHash,
    attemptHashes: isCompleted ? receipt.attemptHashes : [],
    routeState,
    outputArtifactHash: isCompleted ? receipt.outputArtifactHash : null,
    proposalEnvelopeHash: isCompleted ? receipt.proposalEnvelopeHash : null,
    interruptHash: isCompleted ? receipt.interruptHash : null,
    decisionHash: isCompleted ? receipt.decisionHash : null,
    startedAt: isCompleted ? receipt.startedAt : null,
    endedAt: receipt.endedAt,
    ...overrides,
  };
}
function completedReceiptCase() {
  const route = securityFixture.routeReceipts[0];
  const proposal = securityFixture.proposalEnvelopes[0];
  const attempt = securityFixture.attempts[0];
  const interrupt = seal({
    schemaVersion: "human-interrupt-v1", interruptId: "interrupt-completion-1",
    jobId: route.jobId, segmentId: route.segmentId, invocationId: null,
    intentHash: route.segmentIntentHash, segmentManifestHash: route.segmentManifestHash,
    completedAttemptHash: attempt.attemptHash, proposalEnvelopeHash: proposal.proposalHash,
    expectedProjectStateHash: "c".repeat(64), expectedCandidateHash: "d".repeat(64),
    issuer: "one-box-control-plane", issuerPolicyHash: "e".repeat(64),
    reasonCode: "proposal-review-required", requestedDecisionSchemaHash: "f".repeat(64),
    safeSummary: "Review the synthetic completed proposal.",
    createdAt: "2026-09-01T00:00:00Z", expiresAt: "2026-09-02T00:00:00Z",
    interruptHash: "0".repeat(64),
  }, "interruptHash");
  const decision = seal({
    ...securityFixture.decisions[0], interruptHash: interrupt.interruptHash,
  }, "decisionHash");
  return {
    input: terminalInput("succeeded", {
      proposalEnvelopeHash: proposal.proposalHash,
      interruptHash: interrupt.interruptHash,
      decisionHash: decision.decisionHash,
    }),
    evidence: {
      schemaVersion: "route-completion-evidence-v1", proposal, interrupt, decision,
    },
  };
}
function fixtureWithUnrelatedProposal() {
  const proposal = seal({
    ...securityFixture.proposalEnvelopes[0], proposalId: "proposal-fixture-2",
  }, "proposalHash");
  const node = seal({
    ...securityFixture.nodes[1], receiptHash: proposal.proposalHash,
  }, "nodeHash");
  const bundle = seal({
    ...securityFixture.bundle,
    proposalEnvelopeHashes: [...securityFixture.bundle.proposalEnvelopeHashes, proposal.proposalHash],
  }, "bundleHash");
  return {
    proposal,
    fixture: resealFixture({
      ...securityFixture,
      proposalEnvelopes: [...securityFixture.proposalEnvelopes, proposal],
      nodes: [...securityFixture.nodes, node],
      bundle,
    }),
  };
}
function failedFixture() {
  const fixture = structuredClone(securityFixture);
  const attempt = seal({
    ...fixture.attempts[0],
    state: "failed",
    outputArtifactHash: null,
  }, "attemptHash");
  const route = seal({
    ...fixture.routeReceipts[0],
    attemptHashes: [attempt.attemptHash],
    terminalState: "failed",
    outputArtifactHash: null,
    proposalEnvelopeHash: null,
    interruptHash: null,
    decisionHash: null,
  }, "receiptHash");
  const bundle = seal({
    ...fixture.bundle,
    routeSegmentReceiptHashes: [route.receiptHash],
  }, "bundleHash");
  const routeNode = seal({
    ...fixture.nodes[0],
    receiptHash: route.receiptHash,
    references: [],
  }, "nodeHash");
  return resealFixture({
    ...fixture,
    attempts: [attempt],
    routeReceipts: [route],
    bundle,
    nodes: [routeNode, ...fixture.nodes.slice(1)],
  });
}
describe("single receipt ownership and supplemental graph", () => {
  it("accepts the literal fixture with one authoritative foundation receipt", () => {
    const result = validateReceiptSecurityFixture(securityFixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.foundationReceipt.receiptOwner).toBe("foundation-job-contract");
    expect(result.value.bundle.foundationJobReceiptHash).toBe(
      result.value.foundationReceipt.receiptHash,
    );
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.nodes)).toBe(true);
  });
  it("rejects a second owner field and any supplemental ownership claim", () => {
    const duplicateOwner = {
      ...securityFixture,
      secondFoundationReceipt: securityFixture.foundationReceipt,
    };
    const fixture = structuredClone(securityFixture) as Record<string, unknown> & {
      nodes: Array<Record<string, unknown>>;
    };
    fixture.nodes[0].receiptOwner = "supplemental-owner";
    expect(validateReceiptSecurityFixture(duplicateOwner).ok).toBe(false);
    expect(validateReceiptSecurityFixture(fixture).ok).toBe(false);
  });
  it("rejects foundation hash drift and supplemental references to it", () => {
    const foundationDrift = structuredClone(securityFixture);
    foundationDrift.bundle.foundationJobReceiptHash = "f".repeat(64);
    const referenceOwner = structuredClone(securityFixture);
    referenceOwner.nodes[0] = seal({
      ...referenceOwner.nodes[0],
      references: [
        ...referenceOwner.nodes[0].references,
        referenceOwner.foundationReceipt.receiptHash,
      ],
    }, "nodeHash");
    expect(validateReceiptSecurityFixture(foundationDrift).ok).toBe(false);
    expect(validateReceiptSecurityFixture(resealFixture(referenceOwner)).ok).toBe(false);
  });
  it("rejects unresolved edges and an otherwise allowed supplemental self-cycle", () => {
    const unresolved = structuredClone(securityFixture);
    unresolved.nodes[0] = seal({
      ...unresolved.nodes[0], references: ["f".repeat(64)],
    }, "nodeHash");
    const cyclic = structuredClone(securityFixture);
    const skillHash = "f".repeat(64);
    const skillNode = seal({
      schemaVersion: "supplemental-receipt-node-v1",
      kind: "skill-invocation",
      receiptHash: skillHash,
      references: [skillHash],
      nodeHash: "0".repeat(64),
    }, "nodeHash");
    cyclic.nodes.push(skillNode as unknown as typeof cyclic.nodes[number]);
    cyclic.bundle = seal({
      ...cyclic.bundle, skillInvocationReceiptHashes: [skillHash],
    }, "bundleHash") as unknown as typeof cyclic.bundle;
    expect(validateReceiptSecurityFixture(resealFixture(unresolved)).ok).toBe(false);
    expect(validateReceiptSecurityFixture(resealFixture(cyclic)).ok).toBe(false);
  });
  it("rejects graph kinds, unknown fields, and self-hash drift", () => {
    const badKind = structuredClone(securityFixture);
    badKind.nodes[0].kind = "page-ir";
    const extra = { ...securityFixture, applyAutomatically: true };
    const hashDrift = structuredClone(securityFixture);
    hashDrift.routeReceipts[0].receiptHash = "f".repeat(64);
    expect(validateReceiptSecurityFixture(badKind).ok).toBe(false);
    expect(validateReceiptSecurityFixture(extra).ok).toBe(false);
    expect(validateReceiptSecurityFixture(hashDrift).ok).toBe(false);
  });
});
describe("direct terminal receipt projection", () => {
  it("projects T02 succeeded one-way to receipt completed", () => {
    expect(projectRouteTerminalState("succeeded")).toEqual({
      ok: true, value: "completed",
    });
    expect(projectRouteTerminalState("completed").ok).toBe(false);
    expect(projectRouteTerminalState("interrupted").ok).toBe(false);
  });
  it("creates a completed receipt directly from a succeeded route and completed attempt", () => {
    const completed = completedReceiptCase();
    const result = createTerminalRouteReceipt(
      completed.input, securityFixture.attempts, completed.evidence,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.terminalState).toBe("completed");
    expect(result.value.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result.value)).toBe(true);
  });
  it("creates cancellation directly with no proposal or output evidence", () => {
    const result = createTerminalRouteReceipt(terminalInput("cancelled"), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      terminalState: "cancelled",
      outputArtifactHash: null,
      proposalEnvelopeHash: null,
      interruptHash: null,
      decisionHash: null,
    });
  });
  it("rejects completed projection without a completed bound attempt", () => {
    const failedAttempt = seal({
      ...securityFixture.attempts[0], state: "failed", outputArtifactHash: null,
    }, "attemptHash");
    const input = terminalInput("succeeded", { attemptHashes: [failedAttempt.attemptHash] });
    expect(createTerminalRouteReceipt(input, [failedAttempt]).ok).toBe(false);
    expect(createTerminalRouteReceipt(
      { ...terminalInput("cancelled"), proposalEnvelopeHash: "f".repeat(64) }, [],
    ).ok).toBe(false);
  });
  it("rejects completed construction without exact proposal, interrupt, and acceptance evidence", () => {
    const completed = completedReceiptCase();
    const rejected = seal({
      ...completed.evidence.decision, decisionValue: "reject",
    }, "decisionHash");
    expect(createTerminalRouteReceipt(completed.input, securityFixture.attempts).ok).toBe(false);
    expect(createTerminalRouteReceipt(
      completed.input, securityFixture.attempts,
      { ...completed.evidence, decision: rejected },
    ).ok).toBe(false);
  });
  it("rejects non-null skill receipt hashes until their linkage schema exists", () => {
    const completed = completedReceiptCase();
    const proposal = seal({
      ...completed.evidence.proposal, skillInvocationReceiptHash: "f".repeat(64),
    }, "proposalHash");
    const interrupt = seal({
      ...completed.evidence.interrupt, proposalEnvelopeHash: proposal.proposalHash,
    }, "interruptHash");
    const decision = seal({
      ...completed.evidence.decision, interruptHash: interrupt.interruptHash,
    }, "decisionHash");
    const input = terminalInput("succeeded", {
      proposalEnvelopeHash: proposal.proposalHash,
      interruptHash: interrupt.interruptHash,
      decisionHash: decision.decisionHash,
    });
    expect(createTerminalRouteReceipt(input, securityFixture.attempts, {
      ...completed.evidence, proposal, interrupt, decision,
    }).ok).toBe(false);
  });
});
describe("proposal review eligibility without mutation", () => {
  it("reviews only the exact completed, accepted, current proposal evidence", () => {
    const result = reviewProposal(securityFixture, reviewRequest());
    expect(result).toEqual({
      ok: true,
      value: {
        reviewable: true,
        reason: null,
        routeReceiptHash: securityFixture.routeReceipts[0].receiptHash,
        proposalHash: securityFixture.proposalEnvelopes[0].proposalHash,
        effectDirective: "none",
      },
    });
    if (result.ok) {
      expect(result.value).not.toHaveProperty("pageIr");
      expect(result.value).not.toHaveProperty("mutation");
      expect(result.value).not.toHaveProperty("apply");
    }
  });
  it("denies stale source identity or hash", () => {
    for (const override of [
      { currentSourceIdentity: "source:other" },
      { currentSourceHash: "f".repeat(64) },
      { observedAt: "2026-08-31T23:59:59Z" },
      { observedAt: "2026-09-02T00:00:00Z" },
    ]) {
      const result = reviewProposal(securityFixture, reviewRequest(override));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reviewable).toBe(false);
        expect(result.value.reason).toBe("stale-target");
      }
    }
  });
  it("denies a valid proposal that is not paired to the selected route receipt", () => {
    const { fixture, proposal } = fixtureWithUnrelatedProposal();
    const result = reviewProposal(fixture, reviewRequest({ proposalHash: proposal.proposalHash }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({
      reviewable: false, reason: "route-proposal-mismatch",
    });
  });
  it("denies compare review and a valid failed route receipt", () => {
    const compare = reviewProposal(
      securityFixture, reviewRequest({ reviewMode: "compare" }),
    );
    const failed = failedFixture();
    const failedReview = reviewProposal(failed, reviewRequest({
      routeReceiptHash: failed.routeReceipts[0].receiptHash,
    }));
    expect(compare.ok).toBe(true);
    if (compare.ok) expect(compare.value.reason).toBe("compare-not-reviewable");
    expect(failedReview.ok).toBe(true);
    if (failedReview.ok) expect(failedReview.value.reason).toBe("route-not-completed");
  });
  it("rejects completed evidence with a failed attempt or non-accept decision", () => {
    const failedAttempt = structuredClone(securityFixture);
    const invalidAttempt = seal({
      ...failedAttempt.attempts[0], state: "failed", outputArtifactHash: null,
    } as Record<string, unknown>, "attemptHash");
    const failedAttemptFixture = resealFixture({
      ...failedAttempt, attempts: [invalidAttempt],
    });
    const rejectedDecision = structuredClone(securityFixture);
    rejectedDecision.decisions[0] = seal({
      ...rejectedDecision.decisions[0], decisionValue: "reject",
    }, "decisionHash");
    expect(reviewProposal(failedAttemptFixture, reviewRequest()).ok).toBe(false);
    expect(reviewProposal(resealFixture(rejectedDecision), reviewRequest()).ok).toBe(false);
  });
});
describe("receipts module architecture", () => {
  it("keeps the pure evidence-only interface below 400 lines", () => {
    const source = readFileSync(new URL("./receipts.ts", import.meta.url), "utf8");
    const exportedNames = [...source.matchAll(
      /^export (?:function|type) (\w+)/gm,
    )].map((match) => match[1]);
    expect(source.split("\n").length - 1).toBeLessThan(400);
    expect(source).not.toMatch(/node:(?:fs|child_process|http|https|net|tls)/);
    expect(source).not.toMatch(/\b(?:fetch|WebSocket|process\.env|exec|spawn)\b/);
    expect(exportedNames).toEqual([
      "SyntheticFoundationReceiptV1",
      "ReceiptAttemptEvidenceV1",
      "ProposalDecisionEvidenceV1",
      "ProposalEnvelopeV1",
      "RouteSegmentReceiptV1",
      "ReceiptBundleManifestV1",
      "SupplementalReceiptNodeV1",
      "ReceiptSecurityFixtureV1",
      "RouteTerminalReceiptInputV1",
      "ProposalReviewV1",
      "validateReceiptSecurityFixture",
      "projectRouteTerminalState",
      "createTerminalRouteReceipt",
      "reviewProposal",
    ]);
  });
});
