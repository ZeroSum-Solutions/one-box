import { describe, expect, it } from "vitest";

import {
  hashAiTeammateJobV1,
  validateAiTeammateRunReceiptV1,
} from "./receiptBinding";

const INPUT_HASH = "a".repeat(64);
const OUTPUT_HASH = "b".repeat(64);
const KNOWN_JOB_SHA256 =
  "704815766bc6d45522d72c11edf808ffbec41cb9081a00f4d7cea49283232ad1";

const job = {
  schemaVersion: 1,
  jobId: "job-001",
  projectId: "project-001",
  taskId: "task-001",
  actorId: "actor-001",
  teammateId: "researcher",
  inputSha256: INPUT_HASH,
  expectedProposalSchemaId: "one-box.proposal.research.v1",
  effectClasses: ["read", "propose"],
  toolGrants: [],
  childToolGrants: [],
  dataClasses: ["public", "project-internal"],
  maxInputBytes: 64_000,
  maxProposalBytes: 64_000,
  maxDurationMs: 5_000,
  maxAttempts: 1,
  maxDelegationDepth: 0,
  deadlineAt: "2026-08-30T00:00:00.000Z",
  cancellationPolicy: "caller-signal-only",
  retentionPolicy: "process-only",
  fallback: "none",
  executionLane: "deterministic-local",
};

describe("AI teammate receipt binding", () => {
  it("validates a receipt against the exact closed job hash and repeated fields", () => {
    const jobSha256 = hashAiTeammateJobV1(job);
    const receipt = {
      schemaVersion: 1,
      jobId: job.jobId,
      jobSha256,
      teammateId: job.teammateId,
      inputSha256: job.inputSha256,
      outputSha256: OUTPUT_HASH,
      partialOutputSha256: null,
      startedAt: "2026-08-29T20:00:00.000Z",
      stoppedAt: "2026-08-29T20:00:01.000Z",
      status: "complete",
      stoppingCondition: "proposal-complete",
      retryEligible: false,
      effectClasses: job.effectClasses,
      outputSchemaId: job.expectedProposalSchemaId,
      providerCostUsd: 0,
      executionLane: job.executionLane,
    };

    expect(jobSha256).toBe(KNOWN_JOB_SHA256);
    expect(hashAiTeammateJobV1({ ...job })).toBe(jobSha256);
    expect(
      validateAiTeammateRunReceiptV1(job, receipt, OUTPUT_HASH),
    ).toEqual(receipt);
    expect(() =>
      validateAiTeammateRunReceiptV1(
        { ...job, jobId: "job-independent-tamper" },
        receipt,
        OUTPUT_HASH,
      ),
    ).toThrow(/does not bind/i);

    for (const invalid of [
      { ...receipt, jobSha256: "c".repeat(64) },
      { ...receipt, jobId: "job-002" },
      { ...receipt, teammateId: "qa-challenger" },
      { ...receipt, inputSha256: "d".repeat(64) },
      { ...receipt, outputSha256: "e".repeat(64) },
      { ...receipt, effectClasses: ["read"] },
      { ...receipt, outputSchemaId: "one-box.proposal.other.v1" },
    ]) {
      expect(() =>
        validateAiTeammateRunReceiptV1(job, invalid, OUTPUT_HASH),
      ).toThrow(/does not bind/i);
    }
    expect(() =>
      validateAiTeammateRunReceiptV1(job, receipt, null),
    ).toThrow(/does not bind/i);
  });
});
