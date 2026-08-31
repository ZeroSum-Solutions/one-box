export const CONTRACT_REASON_CODES = [
  "INVALID_TYPE",
  "MISSING_FIELD",
  "UNKNOWN_FIELD",
  "INVALID_LITERAL",
  "INVALID_ENUM",
  "EMPTY_STRING",
  "INVALID_SAFE_INTEGER",
  "UNSUPPORTED_VALUE",
  "INVALID_RECORD",
  "CYCLIC_VALUE",
  "HASH_MISMATCH",
  "INVARIANT_VIOLATION",
] as const;

export type ContractReasonCode = (typeof CONTRACT_REASON_CODES)[number];
export type ContractPathSegment = string | number;
export type ContractPath = readonly ContractPathSegment[];

export type ContractFailure = Readonly<{
  ok: false;
  reason: ContractReasonCode;
  path: ContractPath;
}>;

export type ContractSuccess<T> = Readonly<{
  ok: true;
  value: T;
}>;

export type Result<T> = ContractSuccess<T> | ContractFailure;

const REASON_CODE_SET: ReadonlySet<string> = new Set(CONTRACT_REASON_CODES);

export function isContractReasonCode(value: unknown): value is ContractReasonCode {
  return typeof value === "string" && REASON_CODE_SET.has(value);
}

export function success<T>(value: T): ContractSuccess<T> {
  return Object.freeze({ ok: true, value });
}

export function failure(
  reason: ContractReasonCode,
  path: ContractPath = [],
): ContractFailure {
  return Object.freeze({ ok: false, reason, path: Object.freeze([...path]) });
}
