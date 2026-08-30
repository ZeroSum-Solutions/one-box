import {
  AiTeammateJobV1Schema,
  AiTeammateRunReceiptV1Schema,
  type AiTeammateJobV1,
  type AiTeammateRunReceiptV1,
} from "../contracts";
import { canonicalJsonSha256, cloneAndFreezeJson } from "./serialization";

function hashParsedJob(job: AiTeammateJobV1): string {
  return canonicalJsonSha256(job);
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function hashAiTeammateJobV1(job: unknown): string {
  return hashParsedJob(AiTeammateJobV1Schema.parse(job));
}

export function validateAiTeammateRunReceiptV1(
  job: unknown,
  receipt: unknown,
  canonicalOutputSha256: string | null,
): AiTeammateRunReceiptV1 {
  const parsedJob = AiTeammateJobV1Schema.parse(job);
  const parsedReceipt = AiTeammateRunReceiptV1Schema.parse(receipt);
  const doesOutputBind =
    parsedReceipt.status === "complete"
      ? canonicalOutputSha256 !== null &&
        parsedReceipt.outputSha256 === canonicalOutputSha256
      : canonicalOutputSha256 === null && parsedReceipt.outputSha256 === null;
  const doesBind =
    parsedReceipt.jobSha256 === hashParsedJob(parsedJob) &&
    parsedReceipt.jobId === parsedJob.jobId &&
    parsedReceipt.teammateId === parsedJob.teammateId &&
    parsedReceipt.inputSha256 === parsedJob.inputSha256 &&
    arraysEqual(parsedReceipt.effectClasses, parsedJob.effectClasses) &&
    parsedReceipt.outputSchemaId === parsedJob.expectedProposalSchemaId &&
    parsedReceipt.executionLane === parsedJob.executionLane &&
    doesOutputBind;

  if (!doesBind) {
    throw new Error("AI teammate receipt does not bind to the supplied job");
  }

  return cloneAndFreezeJson(parsedReceipt);
}
