import { describe, expect, it } from "vitest";
import {
  CandidateProvenanceV1Schema,
  FallbackFailureSnapshotSchema,
  LayoutAuthoritySchema,
  TemplateFallbackLinkSchema,
  TemplateFallbackReasonSchema,
} from "./contracts";

describe("layout authority contracts", () => {
  it("accepts only the frozen template and PageIR authorities", () => {
    expect(LayoutAuthoritySchema.parse("template-v1")).toBe("template-v1");
    expect(LayoutAuthoritySchema.parse("page-ir-v1")).toBe("page-ir-v1");
    expect(LayoutAuthoritySchema.safeParse("mixed").success).toBe(false);
  });

  it("closes fallback reasons and nested records at the 500-character boundary", () => {
    for (const reason of [
      "page-ir-derivation-failed",
      "page-ir-compilation-failed",
      "candidate-gates-failed",
      "candidate-promotion-failed",
      "operator-requested-after-failure",
    ]) {
      expect(TemplateFallbackReasonSchema.parse(reason)).toBe(reason);
    }
    expect(TemplateFallbackReasonSchema.safeParse("automatic").success).toBe(false);
    expect(
      FallbackFailureSnapshotSchema.safeParse({
        stage: "built",
        message: "x".repeat(500),
      }).success,
    ).toBe(true);
    expect(
      FallbackFailureSnapshotSchema.safeParse({
        stage: "built",
        message: "x".repeat(501),
      }).success,
    ).toBe(false);
    expect(
      TemplateFallbackLinkSchema.safeParse({
        childRunId: "child-run",
        reason: "candidate-gates-failed",
        failure: { stage: "built", message: "failed", extra: true },
      }).success,
    ).toBe(false);
  });

  it("binds the PageIR hash only to PageIR candidate provenance", () => {
    const base = {
      schemaVersion: 1 as const,
      candidateId: "candidate-v1",
      runId: "candidate-run",
      createdAt: "2026-08-23T00:00:00.000Z",
      state: "preparing" as const,
      history: [{ state: "preparing" as const, at: "2026-08-23T00:00:00.000Z" }],
      inputArtifactHashes: [{ path: "intake.json", sha256: "a".repeat(64) }],
      compilerVersion: "fixture@1",
    };
    expect(
      CandidateProvenanceV1Schema.safeParse({
        ...base,
        layoutAuthority: "page-ir-v1",
      }).success,
    ).toBe(false);
    expect(
      CandidateProvenanceV1Schema.safeParse({
        ...base,
        layoutAuthority: "page-ir-v1",
        pageIrSha256: "b".repeat(64),
      }).success,
    ).toBe(true);
    expect(
      CandidateProvenanceV1Schema.safeParse({
        ...base,
        layoutAuthority: "template-v1",
        pageIrSha256: "b".repeat(64),
      }).success,
    ).toBe(false);
  });
});
