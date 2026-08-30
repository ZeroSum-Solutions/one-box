import {
  AiTeammateRunReceiptV1Schema,
  type AiTeammateJobV1,
  type AiTeammateRunReceiptV1,
} from "../contracts";
import { hashAiTeammateJobV1 } from "./receiptBinding";
import { cloneAndFreezeJson } from "./serialization";

export interface AiTeammateExecutionResultV1<Proposal> {
  readonly proposal: Proposal | null;
  readonly receipt: AiTeammateRunReceiptV1;
}

type TerminalReceiptOutcome =
  | {
      readonly status: "complete";
      readonly stoppingCondition: "proposal-complete";
      readonly outputSha256: string;
    }
  | {
      readonly status: "rejected";
      readonly stoppingCondition:
        | "job-invalid"
        | "input-invalid"
        | "deadline-expired";
      readonly outputSha256: null;
    }
  | {
      readonly status: "failed";
      readonly stoppingCondition:
        | "proposal-threw"
        | "proposal-schema-invalid";
      readonly outputSha256: null;
    }
  | {
      readonly status: "cancelled";
      readonly stoppingCondition: "cancelled";
      readonly outputSha256: null;
    }
  | {
      readonly status: "budget-exhausted";
      readonly stoppingCondition:
        | "input-bytes-exceeded"
        | "proposal-bytes-exceeded"
        | "duration-exceeded";
      readonly outputSha256: null;
    };

function terminalReceipt(
  job: AiTeammateJobV1,
  outcome: TerminalReceiptOutcome,
  startedAtMs: number,
  stoppedAtMs: number,
): AiTeammateRunReceiptV1 {
  return cloneAndFreezeJson(
    AiTeammateRunReceiptV1Schema.parse({
      schemaVersion: 1,
      jobId: job.jobId,
      jobSha256: hashAiTeammateJobV1(job),
      teammateId: job.teammateId,
      inputSha256: job.inputSha256,
      outputSha256: outcome.outputSha256,
      partialOutputSha256: null,
      startedAt: new Date(startedAtMs).toISOString(),
      stoppedAt: new Date(stoppedAtMs).toISOString(),
      status: outcome.status,
      stoppingCondition: outcome.stoppingCondition,
      retryEligible: false,
      effectClasses: job.effectClasses,
      outputSchemaId: job.expectedProposalSchemaId,
      providerCostUsd: 0,
      executionLane: job.executionLane,
    }),
  );
}

export function completeReceipt(
  job: AiTeammateJobV1,
  outputSha256: string,
  startedAtMs: number,
  stoppedAtMs: number,
): AiTeammateRunReceiptV1 {
  return terminalReceipt(
    job,
    {
      status: "complete",
      stoppingCondition: "proposal-complete",
      outputSha256,
    },
    startedAtMs,
    stoppedAtMs,
  );
}

function terminalResult<Proposal>(
  job: AiTeammateJobV1,
  outcome: Exclude<TerminalReceiptOutcome, { readonly status: "complete" }>,
  startedAtMs: number,
  stoppedAtMs: number,
): Readonly<AiTeammateExecutionResultV1<Proposal>> {
  const receipt = terminalReceipt(job, outcome, startedAtMs, stoppedAtMs);
  return Object.freeze({ proposal: null, receipt });
}

export function rejectedResult<Proposal>(
  job: AiTeammateJobV1,
  stoppingCondition: "job-invalid" | "input-invalid" | "deadline-expired",
  startedAtMs: number,
  stoppedAtMs: number,
): Readonly<AiTeammateExecutionResultV1<Proposal>> {
  return terminalResult(
    job,
    { status: "rejected", stoppingCondition, outputSha256: null },
    startedAtMs,
    stoppedAtMs,
  );
}

export function failedResult<Proposal>(
  job: AiTeammateJobV1,
  stoppingCondition: "proposal-threw" | "proposal-schema-invalid",
  startedAtMs: number,
  stoppedAtMs: number,
): Readonly<AiTeammateExecutionResultV1<Proposal>> {
  return terminalResult(
    job,
    { status: "failed", stoppingCondition, outputSha256: null },
    startedAtMs,
    stoppedAtMs,
  );
}

export function cancelledResult<Proposal>(
  job: AiTeammateJobV1,
  startedAtMs: number,
  stoppedAtMs: number,
): Readonly<AiTeammateExecutionResultV1<Proposal>> {
  return terminalResult(
    job,
    {
      status: "cancelled",
      stoppingCondition: "cancelled",
      outputSha256: null,
    },
    startedAtMs,
    stoppedAtMs,
  );
}

export function budgetExhaustedResult<Proposal>(
  job: AiTeammateJobV1,
  stoppingCondition:
    | "input-bytes-exceeded"
    | "proposal-bytes-exceeded"
    | "duration-exceeded",
  startedAtMs: number,
  stoppedAtMs: number,
): Readonly<AiTeammateExecutionResultV1<Proposal>> {
  return terminalResult(
    job,
    { status: "budget-exhausted", stoppingCondition, outputSha256: null },
    startedAtMs,
    stoppedAtMs,
  );
}
