import { describe, expect, it } from "vitest";
import {
  BuildProvenanceV1Schema,
  PageIrRolloutDecisionV1Schema,
} from "./contracts";
import {
  buildRunProvenance,
  lifecycleEvent,
  selectPageIrRolloutDecision,
} from "./rolloutObservability";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);

describe("Page IR rollout controls", () => {
  it("is default-off and lets the kill switch win for future runs", () => {
    expect(selectPageIrRolloutDecision({})).toEqual({
      schemaVersion: 1,
      rolloutEnabled: false,
      killSwitchEngaged: false,
      layoutAuthority: "template-v1",
      reason: "default-off",
    });
    expect(selectPageIrRolloutDecision({ ONE_BOX_PAGE_IR_ROLLOUT: "1" }))
      .toMatchObject({
        rolloutEnabled: true,
        killSwitchEngaged: false,
        layoutAuthority: "page-ir-v1",
        reason: "rollout-enabled",
      });
    expect(selectPageIrRolloutDecision({
      ONE_BOX_PAGE_IR_ROLLOUT: "1",
      ONE_BOX_PAGE_IR_KILL_SWITCH: "1",
    })).toMatchObject({
      rolloutEnabled: true,
      killSwitchEngaged: true,
      layoutAuthority: "template-v1",
      reason: "kill-switch",
    });
  });

  it("rejects a decision whose selected authority conflicts with its controls", () => {
    expect(PageIrRolloutDecisionV1Schema.safeParse({
      schemaVersion: 1,
      rolloutEnabled: false,
      killSwitchEngaged: false,
      layoutAuthority: "page-ir-v1",
      reason: "default-off",
    }).success).toBe(false);
    expect(PageIrRolloutDecisionV1Schema.safeParse({
      schemaVersion: 1,
      rolloutEnabled: false,
      killSwitchEngaged: false,
      layoutAuthority: "template-v1",
      reason: "default-off",
      unexpected: true,
    }).success).toBe(false);
  });

  it("does not claim a live site exists when first-attempt promotion fails", () => {
    expect(lifecycleEvent("promotion-failure", "Atomic promotion failed").nextAction)
      .toBe("Inspect promotion and recovery state, then retry only from the reported durable boundary.");
  });

  it("offers template fallback only for Page IR candidate and gate failures", () => {
    expect(lifecycleEvent(
      "candidate-failure",
      "Candidate creation failed",
      { layoutAuthority: "template-v1" },
    ).nextAction).toBe(
      "Inspect the candidate failure, then retry the same template run.",
    );
    expect(lifecycleEvent(
      "gate-failure",
      "Quality gates blocked promotion",
      { layoutAuthority: "page-ir-v1" },
    ).nextAction).toContain("explicit template fallback");
  });
});

describe("build provenance", () => {
  const run = {
    id: "run-provenance",
    layoutAuthority: "page-ir-v1" as const,
    rolloutDecision: {
      schemaVersion: 1 as const,
      rolloutEnabled: true,
      killSwitchEngaged: false,
      layoutAuthority: "page-ir-v1" as const,
      reason: "rollout-enabled" as const,
    },
  };
  const candidate = {
    runId: run.id,
    layoutAuthority: "page-ir-v1" as const,
    inputArtifactHashes: [{ path: "page-ir.json", sha256: HASH_A }],
    pageIrSha256: HASH_A,
    compilerVersion: "page-ir-static@3",
    candidateManifestSha256: HASH_B,
    buildSha256: HASH_C,
    gateReportSha256: HASH_D,
    promotedBuildSha256: HASH_C,
  };
  const review = {
    reviewerName: "Named Human",
    reviewerKind: "human" as const,
    humanAttestation: true as const,
    reviewedAt: "2026-08-24T12:00:00.000Z",
    buildSha256: HASH_C,
    criteria: {
      briefFidelity: { status: "pass" as const },
      visualHierarchy: { status: "pass" as const },
      spacingAndComposition: { status: "pass" as const },
      businessSpecificity: { status: "pass" as const },
      designAndReferenceAlignment: {
        status: "pass" as const,
        referenceContext: "design-and-references" as const,
      },
    },
  };

  it("links exact inputs, IR, compiler, candidate, gates, promotion, and review", () => {
    const provenance = buildRunProvenance(run, candidate, review);
    expect(BuildProvenanceV1Schema.parse(provenance)).toEqual(provenance);
    expect(provenance).toMatchObject({
      runId: run.id,
      inputArtifactHashes: candidate.inputArtifactHashes,
      pageIrSha256: HASH_A,
      compilerVersion: "page-ir-static@3",
      candidateManifestSha256: HASH_B,
      candidateBuildSha256: HASH_C,
      gateReportSha256: HASH_D,
      promotedBuildSha256: HASH_C,
      reviewBuildSha256: HASH_C,
    });
    expect(provenance.reviewSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(BuildProvenanceV1Schema.safeParse({
      ...provenance,
      unexpected: true,
    }).success).toBe(false);
  });

  it("rejects cross-run, authority, promotion, and review mismatches", () => {
    expect(() => buildRunProvenance(run, { ...candidate, runId: "other-run" }, review))
      .toThrow(/run/i);
    expect(() => buildRunProvenance(run, {
      ...candidate,
      layoutAuthority: "template-v1",
      pageIrSha256: undefined,
    }, review)).toThrow(/authority/i);
    expect(() => buildRunProvenance(run, {
      ...candidate,
      promotedBuildSha256: HASH_E,
    }, review)).toThrow(/promoted/i);
    expect(() => buildRunProvenance(run, candidate, {
      ...review,
      buildSha256: HASH_E,
    })).toThrow(/review/i);
  });

  it("projects immutable fallback linkage and bounded failure reason ownership", () => {
    const provenance = buildRunProvenance({
      ...run,
      templateFallback: {
        childRunId: "template-child",
        reason: "operator-requested-after-failure",
        failure: {
          stage: "built",
          message: "blocking candidate gates failed",
        },
      },
    }, candidate, review);
    expect(provenance.fallback).toEqual({
      relationship: "source",
      linkedRunId: "template-child",
      reason: "operator-requested-after-failure",
      failedStage: "built",
    });
  });
});
