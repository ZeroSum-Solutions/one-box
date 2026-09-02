import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  executeAiTeammateJobV1,
  hashAiTeammateInputV1,
} from "./executor";
import { validateAiTeammateRunReceiptV1 } from "./receiptBinding";

const INPUT = {
  schemaVersion: 1,
  dataClass: "project-internal",
  payload: { brief: "Build an accessible local roster." },
} as const;
const INPUT_SHA256 =
  "36a002de57b30afd187b44fa8bd6a3a660f89345941864fe7fcc6ac8a3ef7d55";
const OUTPUT_SHA256 =
  "4a0f642e19b340769328585c6ea787eed827fc3db98c2652c21e7401ca578930";
const PROPOSAL_SCHEMA_ID = "one-box.proposal.test.v1";
const STARTED_AT_MS = Date.parse("2026-08-29T20:00:00.000Z");

const proposalSchema = z
  .object({
    summary: z.string().min(1).max(200),
  })
  .strict();

class FakeTime {
  private currentMs: number;
  private sequence = 0;
  private readonly timers = new Map<
    number,
    { readonly at: number; readonly callback: () => void }
  >();

  constructor(startedAtMs = STARTED_AT_MS) {
    this.currentMs = startedAtMs;
  }

  readonly now = () => this.currentMs;

  readonly schedule = (callback: () => void, delayMs: number) => {
    const id = this.sequence;
    this.sequence += 1;
    this.timers.set(id, { at: this.currentMs + delayMs, callback });
    return () => this.timers.delete(id);
  };

  advanceBy(durationMs: number): void {
    const target = this.currentMs + durationMs;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort(
          ([leftId, left], [rightId, right]) =>
            left.at - right.at || leftId - rightId,
        )[0];
      if (!next) break;
      const [id, timer] = next;
      this.timers.delete(id);
      this.currentMs = timer.at;
      timer.callback();
    }
    this.currentMs = target;
  }
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    jobId: "job-001",
    projectId: "project-001",
    taskId: "task-001",
    actorId: "actor-001",
    teammateId: "researcher",
    inputSha256: INPUT_SHA256,
    expectedProposalSchemaId: PROPOSAL_SCHEMA_ID,
    effectClasses: ["read", "propose"],
    toolGrants: [],
    childToolGrants: [],
    dataClasses: ["public", "project-internal"],
    maxInputBytes: 64_000,
    maxProposalBytes: 64_000,
    maxDurationMs: 5_000,
    maxAttempts: 1,
    maxDelegationDepth: 0,
    deadlineAt: "2099-08-30T00:00:00.000Z",
    cancellationPolicy: "caller-signal-only",
    retentionPolicy: "process-only",
    fallback: "none",
    executionLane: "deterministic-local",
    ...overrides,
  };
}

describe("AI teammate deterministic executor", () => {
  it("returns a frozen proposal and complete receipt bound to known input/output hashes", async () => {
    const originalJob = job();
    const expectedJobSnapshot = structuredClone(originalJob);
    const result = await executeAiTeammateJobV1({
      job: originalJob,
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: ({ input, job: parsedJob }) => {
        expect(Object.isFrozen(input)).toBe(true);
        expect(Object.isFrozen(input.payload)).toBe(true);
        expect(Object.isFrozen(parsedJob)).toBe(true);
        expect(Object.isFrozen(parsedJob.effectClasses)).toBe(true);
        expect(Object.isFrozen(parsedJob.dataClasses)).toBe(true);
        expect(Object.isFrozen(parsedJob.toolGrants)).toBe(true);
        expect(Object.isFrozen(parsedJob.childToolGrants)).toBe(true);
        originalJob.jobId = "job-mutated-after-snapshot";
        originalJob.effectClasses.splice(0);
        return { summary: "Bounded proposal" };
      },
      time: new FakeTime(),
    });

    expect(hashAiTeammateInputV1(INPUT)).toBe(INPUT_SHA256);
    expect(result.proposal).toEqual({ summary: "Bounded proposal" });
    expect(result.receipt.status).toBe("complete");
    expect(result.receipt.outputSha256).toBe(OUTPUT_SHA256);
    expect(result.receipt.jobId).toBe(expectedJobSnapshot.jobId);
    expect(result.receipt.providerCostUsd).toBe(0);
    expect(
      validateAiTeammateRunReceiptV1(
        expectedJobSnapshot,
        result.receipt,
        OUTPUT_SHA256,
      ),
    ).toEqual(result.receipt);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.proposal)).toBe(true);
    expect(Object.isFrozen(result.receipt)).toBe(true);
    expect(Object.isFrozen(result.receipt.effectClasses)).toBe(true);
  });

  it("deep-freezes nested proposal output and receipt collections", async () => {
    const nestedSchema = z
      .object({
        summary: z.string(),
        sections: z.array(
          z.object({
            title: z.string(),
            checks: z.array(z.string()),
          }),
        ),
      })
      .strict();
    const result = await executeAiTeammateJobV1({
      job: job(),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema: nestedSchema,
      propose: () => ({
        summary: "Nested proposal",
        sections: [{ title: "Safety", checks: ["No automatic apply"] }],
      }),
      time: new FakeTime(),
    });

    expect(result.receipt.status).toBe("complete");
    expect(Object.isFrozen(result.proposal)).toBe(true);
    expect(Object.isFrozen(result.proposal?.sections)).toBe(true);
    expect(Object.isFrozen(result.proposal?.sections[0])).toBe(true);
    expect(Object.isFrozen(result.proposal?.sections[0]?.checks)).toBe(true);
    expect(Object.isFrozen(result.receipt)).toBe(true);
    expect(Object.isFrozen(result.receipt.effectClasses)).toBe(true);
  });

  it("rejects empty data/effect classes, mismatched input, and expired jobs before proposal work", async () => {
    let proposalCalls = 0;
    const cases = [
      {
        job: job({ effectClasses: [] }),
        input: INPUT,
        proposalSchemaId: PROPOSAL_SCHEMA_ID,
        stoppingCondition: "job-invalid",
      },
      {
        job: job({ dataClasses: [] }),
        input: INPUT,
        proposalSchemaId: PROPOSAL_SCHEMA_ID,
        stoppingCondition: "input-invalid",
      },
      {
        job: job({ inputSha256: "f".repeat(64) }),
        input: INPUT,
        proposalSchemaId: PROPOSAL_SCHEMA_ID,
        stoppingCondition: "input-invalid",
      },
      {
        job: job(),
        input: { ...INPUT, hiddenAuthority: true },
        proposalSchemaId: PROPOSAL_SCHEMA_ID,
        stoppingCondition: "input-invalid",
      },
      {
        job: job(),
        input: INPUT,
        proposalSchemaId: "one-box.proposal.other.v1",
        stoppingCondition: "job-invalid",
      },
      {
        job: job({ deadlineAt: "2026-08-29T19:59:59.000Z" }),
        input: INPUT,
        proposalSchemaId: PROPOSAL_SCHEMA_ID,
        stoppingCondition: "deadline-expired",
      },
    ] as const;

    for (const testCase of cases) {
      const result = await executeAiTeammateJobV1({
        job: testCase.job,
        input: testCase.input,
        proposalSchemaId: testCase.proposalSchemaId,
        proposalSchema,
        propose: () => {
          proposalCalls += 1;
          return { summary: "must not run" };
        },
        time: new FakeTime(),
      });

      expect(result.proposal).toBeNull();
      expect(result.receipt.status).toBe("rejected");
      expect(result.receipt.stoppingCondition).toBe(
        testCase.stoppingCondition,
      );
      expect(result.receipt.retryEligible).toBe(false);
      expect(Object.isFrozen(result.receipt)).toBe(true);
    }
    expect(proposalCalls).toBe(0);
  });

  it("returns non-retryable failed receipts without exposing thrown or invalid proposals", async () => {
    const thrown = await executeAiTeammateJobV1({
      job: job(),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => {
        throw new Error("private proposal failure");
      },
      time: new FakeTime(),
    });
    const schemaInvalid = await executeAiTeammateJobV1({
      job: job(),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => ({ unexpected: "not a proposal" }),
      time: new FakeTime(),
    });
    const schemaThrew = await executeAiTeammateJobV1({
      job: job(),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema: z.unknown().transform(() => {
        throw new Error("private schema failure");
      }),
      propose: () => ({ summary: "untrusted proposal" }),
      time: new FakeTime(),
    });

    expect(thrown.proposal).toBeNull();
    expect(thrown.receipt.status).toBe("failed");
    expect(thrown.receipt.stoppingCondition).toBe("proposal-threw");
    expect(thrown.receipt.retryEligible).toBe(false);
    expect(thrown.receipt.partialOutputSha256).toBeNull();
    expect(
      validateAiTeammateRunReceiptV1(job(), thrown.receipt, null),
    ).toEqual(thrown.receipt);
    expect(() =>
      validateAiTeammateRunReceiptV1(job(), thrown.receipt, OUTPUT_SHA256),
    ).toThrow(/does not bind/i);
    expect(schemaInvalid.proposal).toBeNull();
    expect(schemaInvalid.receipt.status).toBe("failed");
    expect(schemaInvalid.receipt.stoppingCondition).toBe(
      "proposal-schema-invalid",
    );
    expect(schemaInvalid.receipt.retryEligible).toBe(false);
    expect(schemaInvalid.receipt.partialOutputSha256).toBeNull();
    expect(schemaThrew.proposal).toBeNull();
    expect(schemaThrew.receipt.status).toBe("failed");
    expect(schemaThrew.receipt.stoppingCondition).toBe(
      "proposal-schema-invalid",
    );
  });

  it("returns one non-retryable cancelled receipt before or during proposal work", async () => {
    let preCancelledCalls = 0;
    const preCancelledController = new AbortController();
    preCancelledController.abort();
    const preCancelled = await executeAiTeammateJobV1({
      job: job(),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => {
        preCancelledCalls += 1;
        return { summary: "must not run" };
      },
      signal: preCancelledController.signal,
      time: new FakeTime(),
    });

    const duringController = new AbortController();
    const during = await executeAiTeammateJobV1({
      job: job(),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: ({ signal }) => {
        queueMicrotask(() => duringController.abort());
        return new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () => resolve({ summary: "cancelled proposal must stay hidden" }),
            { once: true },
          );
        });
      },
      signal: duringController.signal,
      time: new FakeTime(),
    });

    let cancelledBeforeStartCalls = 0;
    const cancelledBeforeStartController = new AbortController();
    const cancelledBeforeStartExecution = executeAiTeammateJobV1({
      job: job(),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => {
        cancelledBeforeStartCalls += 1;
        return { summary: "must not start after cancellation" };
      },
      signal: cancelledBeforeStartController.signal,
      time: new FakeTime(),
    });
    cancelledBeforeStartController.abort();
    const cancelledBeforeStart = await cancelledBeforeStartExecution;

    expect(preCancelledCalls).toBe(0);
    expect(cancelledBeforeStartCalls).toBe(0);
    for (const result of [preCancelled, during, cancelledBeforeStart]) {
      expect(result.proposal).toBeNull();
      expect(result.receipt.status).toBe("cancelled");
      expect(result.receipt.stoppingCondition).toBe("cancelled");
      expect(result.receipt.retryEligible).toBe(false);
      expect(result.receipt.partialOutputSha256).toBeNull();
      expect(Object.isFrozen(result.receipt)).toBe(true);
    }
  });

  it("returns budget-exhausted receipts before exposing oversized or late output", async () => {
    let inputBudgetCalls = 0;
    const inputBudget = await executeAiTeammateJobV1({
      job: job({ maxInputBytes: 1 }),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => {
        inputBudgetCalls += 1;
        return { summary: "must not run" };
      },
      time: new FakeTime(),
    });
    const proposalBudget = await executeAiTeammateJobV1({
      job: job({ maxProposalBytes: 1 }),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => ({ summary: "Bounded proposal" }),
      time: new FakeTime(),
    });
    const durationTime = new FakeTime();
    const durationBudget = await executeAiTeammateJobV1({
      job: job({ maxDurationMs: 1_000 }),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => {
        durationTime.advanceBy(2_000);
        return { summary: "Bounded proposal" };
      },
      time: durationTime,
    });

    expect(inputBudgetCalls).toBe(0);
    for (const [result, stoppingCondition] of [
      [inputBudget, "input-bytes-exceeded"],
      [proposalBudget, "proposal-bytes-exceeded"],
      [durationBudget, "duration-exceeded"],
    ] as const) {
      expect(result.proposal).toBeNull();
      expect(result.receipt.status).toBe("budget-exhausted");
      expect(result.receipt.stoppingCondition).toBe(stoppingCondition);
      expect(result.receipt.outputSha256).toBeNull();
      expect(result.receipt.partialOutputSha256).toBeNull();
      expect(result.receipt.retryEligible).toBe(false);
      expect(Object.isFrozen(result.receipt)).toBe(true);
    }
  });

  it("terminates a never-resolving proposal at the duration budget", async () => {
    const execution = executeAiTeammateJobV1({
      job: job({ maxDurationMs: 5 }),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => new Promise(() => undefined),
    });
    const outcome = await Promise.race([
      execution,
      new Promise<"guard-timeout">((resolve) => {
        setTimeout(() => resolve("guard-timeout"), 100);
      }),
    ]);

    expect(outcome).not.toBe("guard-timeout");
    if (outcome === "guard-timeout") return;
    expect(outcome.proposal).toBeNull();
    expect(outcome.receipt.status).toBe("budget-exhausted");
    expect(outcome.receipt.stoppingCondition).toBe("duration-exceeded");
  });

  it("uses one fake time source and aborts internal work exactly at the duration bound", async () => {
    const time = new FakeTime();
    const timedJob = job({ maxDurationMs: 5 });
    let proposalSignal: AbortSignal | undefined;
    let isSettled = false;
    const execution = executeAiTeammateJobV1({
      job: timedJob,
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: ({ signal }) => {
        proposalSignal = signal;
        return new Promise(() => undefined);
      },
      time,
    });
    void execution.then(() => {
      isSettled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    time.advanceBy(4);
    await Promise.resolve();
    expect(isSettled).toBe(false);

    time.advanceBy(1);
    const result = await execution;
    expect(result.receipt.status).toBe("budget-exhausted");
    expect(result.receipt.stoppingCondition).toBe("duration-exceeded");
    expect(result.receipt.inputSha256).toBe(INPUT_SHA256);
    expect(result.receipt.outputSha256).toBeNull();
    expect(result.receipt.retryEligible).toBe(false);
    expect(
      validateAiTeammateRunReceiptV1(timedJob, result.receipt, null),
    ).toEqual(result.receipt);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.receipt)).toBe(true);
    expect(Object.isFrozen(result.receipt.effectClasses)).toBe(true);
    expect(proposalSignal?.aborted).toBe(true);

    const completeTime = new FakeTime();
    let completeSignal: AbortSignal | undefined;
    const complete = await executeAiTeammateJobV1({
      job: job(),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: ({ signal }) => {
        completeSignal = signal;
        return { summary: "Bounded proposal" };
      },
      time: completeTime,
    });
    expect(complete.receipt.status).toBe("complete");
    expect(completeSignal?.aborted).toBe(true);
  });

  it("rejects a proposal that finishes after the declared deadline", async () => {
    const time = new FakeTime();
    const result = await executeAiTeammateJobV1({
      job: job({
        deadlineAt: new Date(STARTED_AT_MS + 1).toISOString(),
      }),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => {
        time.advanceBy(100);
        return { summary: "late proposal must stay hidden" };
      },
      time,
    });

    expect(result.proposal).toBeNull();
    expect(result.receipt.status).toBe("rejected");
    expect(result.receipt.stoppingCondition).toBe("deadline-expired");
    expect(result.receipt.outputSha256).toBeNull();
  });

  it("turns non-finite or backwards clock samples into valid terminal receipts", async () => {
    let invalidClockProposalCalls = 0;
    const nonFinite = await executeAiTeammateJobV1({
      job: job(),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => {
        invalidClockProposalCalls += 1;
        return { summary: "must not run" };
      },
      time: {
        now: () => Number.NaN,
        schedule: () => () => undefined,
      },
    });
    const backwardsSamples = [STARTED_AT_MS, STARTED_AT_MS - 1];
    const backwards = await executeAiTeammateJobV1({
      job: job(),
      input: INPUT,
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => ({ summary: "must stay hidden" }),
      time: {
        now: () => backwardsSamples.shift() ?? STARTED_AT_MS - 1,
        schedule: () => () => undefined,
      },
    });

    expect(invalidClockProposalCalls).toBe(0);
    for (const result of [nonFinite, backwards]) {
      expect(result.proposal).toBeNull();
      expect(result.receipt.status).toBe("budget-exhausted");
      expect(result.receipt.stoppingCondition).toBe("duration-exceeded");
      expect(Date.parse(result.receipt.stoppedAt)).toBeGreaterThanOrEqual(
        Date.parse(result.receipt.startedAt),
      );
      expect(Object.isFrozen(result.receipt)).toBe(true);
    }
  });

  it("measures input before cloning and stops at an exact pre-proposal duration bound", async () => {
    const time = new FakeTime();
    let proposalCalls = 0;
    const timedPayload = {} as { readonly brief: string };
    Object.defineProperty(timedPayload, "brief", {
      enumerable: true,
      get: () => {
        time.advanceBy(5);
        return INPUT.payload.brief;
      },
    });

    const result = await executeAiTeammateJobV1({
      job: job({ maxDurationMs: 5 }),
      input: { ...INPUT, payload: timedPayload },
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => {
        proposalCalls += 1;
        return { summary: "must not run" };
      },
      time,
    });

    expect(proposalCalls).toBe(0);
    expect(result.proposal).toBeNull();
    expect(result.receipt.status).toBe("budget-exhausted");
    expect(result.receipt.stoppingCondition).toBe("duration-exceeded");
  });

  it("stops an oversized input after one canonical measurement without cloning its payload", async () => {
    let payloadReads = 0;
    let proposalCalls = 0;
    const oversizedPayload = {} as { readonly brief: string };
    Object.defineProperty(oversizedPayload, "brief", {
      enumerable: true,
      get: () => {
        payloadReads += 1;
        return "oversized";
      },
    });

    const result = await executeAiTeammateJobV1({
      job: job({ maxInputBytes: 1 }),
      input: { ...INPUT, payload: oversizedPayload },
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: () => {
        proposalCalls += 1;
        return { summary: "must not run" };
      },
      time: new FakeTime(),
    });

    expect(payloadReads).toBe(1);
    expect(proposalCalls).toBe(0);
    expect(result.proposal).toBeNull();
    expect(result.receipt.status).toBe("budget-exhausted");
    expect(result.receipt.stoppingCondition).toBe("input-bytes-exceeded");
  });

  it("schedules only the duration budget remaining after input validation", async () => {
    const time = new FakeTime();
    const timedPayload = {} as { readonly brief: string };
    Object.defineProperty(timedPayload, "brief", {
      enumerable: true,
      get: () => {
        time.advanceBy(2);
        return INPUT.payload.brief;
      },
    });
    let isSettled = false;
    let proposalSignal: AbortSignal | undefined;
    const execution = executeAiTeammateJobV1({
      job: job({ maxDurationMs: 5 }),
      input: { ...INPUT, payload: timedPayload },
      proposalSchemaId: PROPOSAL_SCHEMA_ID,
      proposalSchema,
      propose: ({ signal }) => {
        proposalSignal = signal;
        return new Promise(() => undefined);
      },
      time,
    });
    void execution.then(() => {
      isSettled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    time.advanceBy(2);
    await Promise.resolve();
    expect(isSettled).toBe(false);
    time.advanceBy(1);
    await Promise.resolve();
    const abortedAtExactBound = proposalSignal?.aborted;
    time.advanceBy(2);
    const result = await execution;

    expect(abortedAtExactBound).toBe(true);
    expect(result.receipt.status).toBe("budget-exhausted");
    expect(result.receipt.stoppingCondition).toBe("duration-exceeded");
  });
});
