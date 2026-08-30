import { createHash } from "node:crypto";

function encodeCanonicalJson(
  value: unknown,
  ancestors: WeakSet<object>,
): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("JSON numbers must be finite");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error("Value is not JSON-serializable");
  }
  if (ancestors.has(value)) {
    throw new Error("JSON values cannot contain cycles");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((nested) => encodeCanonicalJson(nested, ancestors))
        .join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("JSON objects must be plain records");
    }
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(
        ([key, nested]) =>
          `${JSON.stringify(key)}:${encodeCanonicalJson(nested, ancestors)}`,
      )
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return encodeCanonicalJson(value, new WeakSet());
}

export function canonicalJsonSha256(value: unknown): string {
  return canonicalJsonTextSha256(canonicalJson(value));
}

export function canonicalJsonTextSha256(canonicalValue: string): string {
  return createHash("sha256")
    .update(new TextEncoder().encode(canonicalValue))
    .digest("hex");
}

export function canonicalJsonTextByteLength(canonicalValue: string): number {
  return new TextEncoder().encode(canonicalValue).byteLength;
}

export function cloneAndFreezeJson<Value>(value: Value): Value {
  return cloneAndFreezeCanonicalJson(canonicalJson(value));
}

export function cloneAndFreezeCanonicalJson<Value>(
  canonicalValue: string,
): Value {
  const clone = JSON.parse(canonicalValue) as Value;
  return deepFreezeJson(clone);
}

function deepFreezeJson<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) {
      deepFreezeJson(nested);
    }
    Object.freeze(value);
  }
  return value;
}
