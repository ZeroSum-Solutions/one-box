import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";
import { failure, success, type ContractPath, type Result } from "./reasonCodes";

export interface CanonicalArray {
  readonly [index: number]: CanonicalValue;
  readonly length: number;
}

export interface CanonicalRecord {
  readonly [key: string]: CanonicalValue;
}

export type CanonicalValue = null | boolean | string | number | CanonicalArray | CanonicalRecord;

const HEX_SHA256 = /^[0-9a-f]{64}$/;
const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/;

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function at(path: ContractPath, segment: string | number): ContractPath {
  return [...path, segment];
}

function encodeCanonical(
  value: unknown,
  path: ContractPath,
  ancestors: ReadonlySet<object>,
): Result<string> {
  if (value === null || typeof value === "boolean") {
    return success(JSON.stringify(value));
  }

  if (typeof value === "string") {
    return isWellFormedUnicode(value)
      ? success(JSON.stringify(value))
      : failure("UNSUPPORTED_VALUE", path);
  }

  if (typeof value === "number") {
    return Number.isSafeInteger(value)
      ? success(JSON.stringify(value))
      : failure("INVALID_SAFE_INTEGER", path);
  }

  if (typeof value !== "object") {
    return failure("UNSUPPORTED_VALUE", path);
  }

  if (isProxy(value)) return failure("UNSUPPORTED_VALUE", path);

  if (ancestors.has(value)) {
    return failure("CYCLIC_VALUE", path);
  }

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return failure("INVALID_RECORD", path);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.some(
        (key) =>
          typeof key === "symbol" ||
          (key !== "length" && (!ARRAY_INDEX.test(key) || Number(key) >= value.length)),
      )
    ) {
      return failure("UNKNOWN_FIELD", path);
    }

    const numericKeys = (ownKeys as string[])
      .filter((key) => key !== "length")
      .map(Number)
      .sort((left, right) => left - right);
    if (numericKeys.length !== value.length) {
      let missingIndex = 0;
      for (const index of numericKeys) {
        if (index !== missingIndex) break;
        missingIndex += 1;
      }
      return failure("INVALID_RECORD", at(path, missingIndex));
    }

    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) return failure("INVALID_RECORD", at(path, index));
      if (!descriptor.enumerable) return failure("INVALID_RECORD", at(path, index));
      if (!("value" in descriptor)) return failure("UNSUPPORTED_VALUE", at(path, index));
      const encoded = encodeCanonical(descriptor.value, at(path, index), nextAncestors);
      if (!encoded.ok) return encoded;
      items.push(encoded.value);
    }
    return success(`[${items.join(",")}]`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return failure("INVALID_RECORD", path);
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) {
    return failure("UNKNOWN_FIELD", path);
  }

  const fields: string[] = [];
  for (const key of (ownKeys as string[]).sort()) {
    if (!isWellFormedUnicode(key)) return failure("UNSUPPORTED_VALUE", path);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable) {
      return failure("UNKNOWN_FIELD", at(path, key));
    }
    if (!("value" in descriptor)) {
      return failure("UNSUPPORTED_VALUE", at(path, key));
    }
    const encoded = encodeCanonical(descriptor.value, at(path, key), nextAncestors);
    if (!encoded.ok) return encoded;
    fields.push(`${JSON.stringify(key)}:${encoded.value}`);
  }
  return success(`{${fields.join(",")}}`);
}

export function canonicalize(value: unknown): Result<string> {
  try {
    return encodeCanonical(value, [], new Set());
  } catch {
    return failure("UNSUPPORTED_VALUE");
  }
}

export function parseCanonicalJson(text: unknown): Result<CanonicalValue> {
  if (typeof text !== "string") return failure("INVALID_TYPE");
  try {
    const value: unknown = JSON.parse(text);
    const encoded = canonicalize(value);
    if (!encoded.ok || encoded.value !== text) return failure("INVALID_RECORD");
    return success(value as CanonicalValue);
  } catch {
    return failure("INVALID_RECORD");
  }
}

export function canonicalSha256(value: unknown): Result<string> {
  const encoded = canonicalize(value);
  if (!encoded.ok) return encoded;
  return success(createHash("sha256").update(encoded.value, "utf8").digest("hex"));
}

function omitRootField(
  record: Readonly<Record<string, unknown>>,
  hashField: string,
): Result<Record<string, unknown>> {
  if (isProxy(record)) return failure("UNSUPPORTED_VALUE");
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) {
    return failure("INVALID_RECORD");
  }
  const copy = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key === "symbol") return failure("UNKNOWN_FIELD");
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !descriptor.enumerable) return failure("UNKNOWN_FIELD", [key]);
    if (!("value" in descriptor)) return failure("UNSUPPORTED_VALUE", [key]);
    if (key !== hashField) copy[key] = descriptor.value;
  }
  return success(copy);
}

export function computeSelfHash(
  record: Readonly<Record<string, unknown>>,
  hashField: string,
): Result<string> {
  try {
    const omitted = omitRootField(record, hashField);
    return omitted.ok ? canonicalSha256(omitted.value) : omitted;
  } catch {
    return failure("UNSUPPORTED_VALUE");
  }
}

export function verifySelfHash(
  record: Readonly<Record<string, unknown>>,
  hashField: string,
): Result<true> {
  if (isProxy(record)) return failure("UNSUPPORTED_VALUE");
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(record, hashField);
  } catch {
    return failure("UNSUPPORTED_VALUE");
  }
  if (!descriptor) return failure("MISSING_FIELD", [hashField]);
  if (!("value" in descriptor)) return failure("UNSUPPORTED_VALUE", [hashField]);
  if (typeof descriptor.value !== "string" || !HEX_SHA256.test(descriptor.value)) {
    return failure("INVALID_LITERAL", [hashField]);
  }
  const actual = computeSelfHash(record, hashField);
  if (!actual.ok) return actual;
  return actual.value === descriptor.value
    ? success(true)
    : failure("HASH_MISMATCH", [hashField]);
}
