import { z } from "zod";

import {
  AiTeammateDataClassV1Schema,
  AiTeammateJobV1Schema,
  type AiTeammateJobV1,
} from "../contracts";
import {
  budgetExhaustedResult,
  cancelledResult,
  completeReceipt,
  failedResult,
  rejectedResult,
  type AiTeammateExecutionResultV1 as ExecutionResultV1,
} from "./executionReceipts";
import {
  canonicalJson,
  canonicalJsonSha256,
  canonicalJsonTextByteLength,
  canonicalJsonTextSha256,
  cloneAndFreezeCanonicalJson,
  cloneAndFreezeJson,
} from "./serialization";

export const AiTeammateExecutorInputV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    dataClass: AiTeammateDataClassV1Schema,
    payload: z.unknown(),
  })
  .strict();
export type AiTeammateExecutorInputV1 = z.infer<
  typeof AiTeammateExecutorInputV1Schema
>;

export interface AiTeammateProposalContextV1 {
  readonly job: AiTeammateJobV1;
  readonly input: AiTeammateExecutorInputV1;
  readonly signal: AbortSignal;
}

export type AiTeammateProposalFunctionV1<Proposal> = (
  context: AiTeammateProposalContextV1,
) => Proposal | Promise<Proposal>;

export interface ExecuteAiTeammateJobV1Options<Proposal> {
  readonly job: unknown;
  readonly input: unknown;
  readonly proposalSchemaId: string;
  readonly proposalSchema: z.ZodType<Proposal>;
  readonly propose: AiTeammateProposalFunctionV1<unknown>;
  readonly signal?: AbortSignal;
  readonly time?: AiTeammateExecutionTimeV1;
}

export interface AiTeammateExecutionTimeV1 {
  readonly now: () => number;
  readonly schedule: (callback: () => void, delayMs: number) => () => void;
}

const SYSTEM_EXECUTION_TIME: AiTeammateExecutionTimeV1 = Object.freeze({
  now: () => Date.now(),
  schedule: (callback: () => void, delayMs: number) => {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
});

const MAX_RECEIPT_TIMESTAMP_MS = Date.parse("9999-12-31T23:59:59.999Z");

interface ExecutionTimeSample {
  readonly atMs: number;
  readonly isValid: boolean;
}

function startTimeSample(value: number): ExecutionTimeSample {
  const isValid =
    Number.isFinite(value) && value >= 0 && value <= MAX_RECEIPT_TIMESTAMP_MS;
  return { atMs: isValid ? value : 0, isValid };
}

function stopTimeSample(value: number, startedAtMs: number): ExecutionTimeSample {
  const isValid =
    Number.isFinite(value) &&
    value >= startedAtMs &&
    value <= MAX_RECEIPT_TIMESTAMP_MS;
  return { atMs: isValid ? value : startedAtMs, isValid };
}

export type AiTeammateExecutionResultV1<Proposal> =
  ExecutionResultV1<Proposal>;

export function hashAiTeammateInputV1(input: unknown): string {
  const parsed = AiTeammateExecutorInputV1Schema.parse(input);
  return canonicalJsonSha256(parsed);
}

class ProposalCancelledError extends Error {}
class ProposalDurationExceededError extends Error {}
class ProposalFinishedError extends Error {}

function invokeBoundedProposal(
  propose: AiTeammateProposalFunctionV1<unknown>,
  context: AiTeammateProposalContextV1,
  time: AiTeammateExecutionTimeV1,
  maxDurationMs: number,
  internalController: AbortController,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let isSettled = false;
    let cancelDurationTimer: () => void = () => undefined;
    const settle = (action: () => void) => {
      if (isSettled) return;
      isSettled = true;
      cancelDurationTimer();
      context.signal.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = () =>
      settle(() =>
        reject(
          internalController.signal.reason instanceof
            ProposalDurationExceededError
            ? internalController.signal.reason
            : new ProposalCancelledError(),
        ),
      );
    context.signal.addEventListener("abort", onAbort, { once: true });
    cancelDurationTimer = time.schedule(
      () => internalController.abort(new ProposalDurationExceededError()),
      maxDurationMs,
    );
    if (context.signal.aborted) onAbort();
    Promise.resolve()
      .then(() => {
        if (isSettled || context.signal.aborted) return undefined;
        return propose(context);
      })
      .then(
        (proposal) => settle(() => resolve(proposal)),
        (error: unknown) => settle(() => reject(error)),
      );
  });
}

export async function executeAiTeammateJobV1<Proposal>(
  options: ExecuteAiTeammateJobV1Options<Proposal>,
): Promise<Readonly<AiTeammateExecutionResultV1<Proposal>>> {
  const job = cloneAndFreezeJson(AiTeammateJobV1Schema.parse(options.job));
  const time = options.time ?? SYSTEM_EXECUTION_TIME;
  const now = time.now;
  const startedAt = startTimeSample(now());
  const startedAtMs = startedAt.atMs;
  const stoppedAt = () => stopTimeSample(now(), startedAtMs);

  if (!startedAt.isValid) {
    return budgetExhaustedResult(
      job,
      "duration-exceeded",
      startedAtMs,
      startedAtMs,
    );
  }

  if (
    options.proposalSchemaId !== job.expectedProposalSchemaId ||
    !job.effectClasses.includes("read") ||
    !job.effectClasses.includes("propose")
  ) {
    return rejectedResult(
      job,
      "job-invalid",
      startedAtMs,
      stoppedAt().atMs,
    );
  }
  if (startedAtMs > Date.parse(job.deadlineAt)) {
    return rejectedResult(
      job,
      "deadline-expired",
      startedAtMs,
      stoppedAt().atMs,
    );
  }

  const parsedInput = AiTeammateExecutorInputV1Schema.safeParse(options.input);
  if (!parsedInput.success) {
    return rejectedResult(
      job,
      "input-invalid",
      startedAtMs,
      stoppedAt().atMs,
    );
  }

  let canonicalInput: string;
  try {
    canonicalInput = canonicalJson(parsedInput.data);
  } catch {
    return rejectedResult(
      job,
      "input-invalid",
      startedAtMs,
      stoppedAt().atMs,
    );
  }
  const inputBytes = canonicalJsonTextByteLength(canonicalInput);
  if (inputBytes > job.maxInputBytes) {
    return budgetExhaustedResult(
      job,
      "input-bytes-exceeded",
      startedAtMs,
      stoppedAt().atMs,
    );
  }
  if (
    canonicalJsonTextSha256(canonicalInput) !== job.inputSha256 ||
    !job.dataClasses.includes(parsedInput.data.dataClass)
  ) {
    return rejectedResult(
      job,
      "input-invalid",
      startedAtMs,
      stoppedAt().atMs,
    );
  }
  const afterInput = stoppedAt();
  if (
    !afterInput.isValid ||
    afterInput.atMs - startedAtMs >= job.maxDurationMs
  ) {
    return budgetExhaustedResult(
      job,
      "duration-exceeded",
      startedAtMs,
      afterInput.atMs,
    );
  }
  const input = cloneAndFreezeCanonicalJson<AiTeammateExecutorInputV1>(
    canonicalInput,
  );
  const remainingDurationMs =
    job.maxDurationMs - (afterInput.atMs - startedAtMs);

  const internalController = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, internalController.signal])
    : internalController.signal;
  if (signal.aborted) {
    internalController.abort(new ProposalFinishedError());
    return cancelledResult(job, startedAtMs, stoppedAt().atMs);
  }
  try {
    let proposed: unknown;
    try {
      proposed = await invokeBoundedProposal(
        options.propose,
        Object.freeze({ job, input, signal }),
        time,
        remainingDurationMs,
        internalController,
      );
    } catch (error) {
      if (error instanceof ProposalCancelledError) {
        return cancelledResult(job, startedAtMs, stoppedAt().atMs);
      }
      if (error instanceof ProposalDurationExceededError) {
        return budgetExhaustedResult(
          job,
          "duration-exceeded",
          startedAtMs,
          stoppedAt().atMs,
        );
      }
      return failedResult(
        job,
        "proposal-threw",
        startedAtMs,
        stoppedAt().atMs,
      );
    }

    let canonicalProposal: string;
    try {
      const parsedProposal = options.proposalSchema.safeParse(proposed);
      if (!parsedProposal.success) {
        return failedResult(
          job,
          "proposal-schema-invalid",
          startedAtMs,
          stoppedAt().atMs,
        );
      }
      canonicalProposal = canonicalJson(parsedProposal.data);
    } catch {
      return failedResult(
        job,
        "proposal-schema-invalid",
        startedAtMs,
        stoppedAt().atMs,
      );
    }
    if (canonicalJsonTextByteLength(canonicalProposal) > job.maxProposalBytes) {
      return budgetExhaustedResult(
        job,
        "proposal-bytes-exceeded",
        startedAtMs,
        stoppedAt().atMs,
      );
    }
    const proposal = cloneAndFreezeCanonicalJson<Proposal>(canonicalProposal);

    const stopped = stoppedAt();
    const stoppedAtMs = stopped.atMs;
    if (!stopped.isValid) {
      return budgetExhaustedResult(
        job,
        "duration-exceeded",
        startedAtMs,
        stoppedAtMs,
      );
    }
    if (stoppedAtMs - startedAtMs >= job.maxDurationMs) {
      return budgetExhaustedResult(
        job,
        "duration-exceeded",
        startedAtMs,
        stoppedAtMs,
      );
    }
    if (stoppedAtMs > Date.parse(job.deadlineAt)) {
      return rejectedResult(
        job,
        "deadline-expired",
        startedAtMs,
        stoppedAtMs,
      );
    }

    return Object.freeze({
      proposal,
      receipt: completeReceipt(
        job,
        canonicalJsonTextSha256(canonicalProposal),
        startedAtMs,
        stoppedAtMs,
      ),
    });
  } finally {
    if (!internalController.signal.aborted) {
      internalController.abort(new ProposalFinishedError());
    }
  }
}
