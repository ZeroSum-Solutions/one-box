import { describe, expect, it } from "vitest";
import {
  canonicalSha256,
  canonicalize,
  computeSelfHash,
  parseCanonicalJson,
  verifySelfHash,
} from "./canonical";

describe("canonical JSON", () => {
  it("recursively sorts object keys while preserving array order", () => {
    expect(canonicalize({ z: [{ b: 2, a: 1 }, 3], a: true })).toEqual({
      ok: true,
      value: '{"a":true,"z":[{"a":1,"b":2},3]}',
    });
  });

  it("produces one canonical form for deterministic key permutations", () => {
    const permutations = [
      { a: 1, b: 2, c: 3 },
      { c: 3, a: 1, b: 2 },
      { b: 2, c: 3, a: 1 },
      { c: 3, b: 2, a: 1 },
    ];

    for (const value of permutations) {
      expect(canonicalize(value)).toEqual({
        ok: true,
        value: '{"a":1,"b":2,"c":3}',
      });
    }
  });

  it("hashes the canonical UTF-8 bytes with SHA-256", () => {
    expect(canonicalSha256({ b: 2, a: 1 })).toEqual({
      ok: true,
      value: "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    });
  });

  it.each([
    [1.5, "INVALID_SAFE_INTEGER", []],
    [Number.MAX_SAFE_INTEGER + 1, "INVALID_SAFE_INTEGER", []],
    [{ value: undefined }, "UNSUPPORTED_VALUE", ["value"]],
    [new Date(0), "INVALID_RECORD", []],
  ] as const)("rejects values outside the closed canonical domain", (value, reason, path) => {
    expect(canonicalize(value)).toEqual({ ok: false, reason, path });
  });

  it("rejects cyclic records locally", () => {
    const value: Record<string, unknown> = {};
    value.self = value;

    expect(canonicalize(value)).toEqual({
      ok: false,
      reason: "CYCLIC_VALUE",
      path: ["self"],
    });
  });

  it("rejects sparse arrays and extra array properties", () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    const extended = [1] as unknown[] & { extra?: number };
    extended.extra = 2;

    expect(canonicalize(sparse)).toEqual({
      ok: false,
      reason: "INVALID_RECORD",
      path: [0],
    });
    expect(canonicalize(extended)).toEqual({
      ok: false,
      reason: "UNKNOWN_FIELD",
      path: [],
    });
  });

  it("rejects accessors and symbol-bearing records without invoking the accessor", () => {
    let reads = 0;
    const accessor = Object.defineProperty({}, "secret", {
      enumerable: true,
      get() {
        reads += 1;
        return "not-read";
      },
    });
    const symbolBearing = { id: "fixture-v1" } as Record<PropertyKey, unknown>;
    symbolBearing[Symbol("hidden")] = true;

    expect(canonicalize(accessor)).toEqual({
      ok: false,
      reason: "UNSUPPORTED_VALUE",
      path: ["secret"],
    });
    expect(reads).toBe(0);
    expect(canonicalize(symbolBearing)).toEqual({
      ok: false,
      reason: "UNKNOWN_FIELD",
      path: [],
    });
  });

  it("rejects unpaired Unicode surrogates before UTF-8 hashing", () => {
    expect(canonicalize("\ud800")).toEqual({
      ok: false,
      reason: "UNSUPPORTED_VALUE",
      path: [],
    });
    expect(canonicalSha256("\ud800")).not.toEqual(canonicalSha256("\ufffd"));
  });

  it("rejects unpaired Unicode surrogates in object keys", () => {
    expect(canonicalize({ ["\ud800"]: 1 })).toEqual({
      ok: false,
      reason: "UNSUPPORTED_VALUE",
      path: [],
    });
    expect(canonicalSha256({ ["\ud800"]: 1 })).not.toEqual(
      canonicalSha256({ ["\ufffd"]: 1 }),
    );
  });

  it("rejects proxies and array subclasses outside the closed data domain", () => {
    const proxy = new Proxy({ id: "fixture-v1" }, {});
    class ArraySubclass extends Array<number> {}

    expect(canonicalize(proxy)).toEqual({
      ok: false,
      reason: "UNSUPPORTED_VALUE",
      path: [],
    });
    expect(canonicalize(new ArraySubclass(1, 2))).toEqual({
      ok: false,
      reason: "INVALID_RECORD",
      path: [],
    });
  });

  it("rejects non-enumerable array indices", () => {
    const values = [1];
    Object.defineProperty(values, "0", { enumerable: false, value: 1 });

    expect(canonicalize(values)).toEqual({
      ok: false,
      reason: "INVALID_RECORD",
      path: [0],
    });
  });

  it("accepts canonical JSON text and rejects whitespace, unsorted, and duplicate-key text", () => {
    expect(parseCanonicalJson('{"a":1,"b":2}')).toEqual({
      ok: true,
      value: { a: 1, b: 2 },
    });
    for (const text of [
      ' {"a":1,"b":2}',
      '{"b":2,"a":1}',
      '{"a":1,"a":2}',
      '{"a":1.5}',
      "not-json",
    ]) {
      expect(parseCanonicalJson(text)).toEqual({
        ok: false,
        reason: "INVALID_RECORD",
        path: [],
      });
    }
  });
});

describe("canonical self-hashes", () => {
  const recordHash = "8cb6625c7e12f32d489291a7a60217e73e603970d639d2f7521e65cd255b269f";

  it("computes and verifies a root self-hash by omitting exactly that field", () => {
    const record = { id: "fixture-v1", recordHash };

    expect(computeSelfHash(record, "recordHash")).toEqual({ ok: true, value: recordHash });
    expect(verifySelfHash(record, "recordHash")).toEqual({ ok: true, value: true });
  });

  it("retains nested hashes when omitting the root self-hash", () => {
    const nestedHash = "a".repeat(64);
    const rootHash = "e3fb39abb0841b47722cea000edcfa5c35c3ed6a9a73c5937440f4194c67a82a";

    expect(
      computeSelfHash(
        { id: "fixture-v1", child: { recordHash: nestedHash }, rootHash },
        "rootHash",
      ),
    ).toEqual({ ok: true, value: rootHash });
  });

  it("retains an own __proto__ field as ordinary canonical data", () => {
    const record = Object.create(null) as Record<string, unknown>;
    record.id = "fixture-v1";
    Object.defineProperty(record, "__proto__", {
      enumerable: true,
      value: "value",
    });
    record.recordHash = "0".repeat(64);

    expect(computeSelfHash(record, "recordHash")).toEqual({
      ok: true,
      value: "0d5930b65e321f881bf5780da9e3568f9f80db86808da4c19d5e3859fc4d73d9",
    });
  });

  it("rejects missing, malformed, and mismatched root self-hashes", () => {
    expect(verifySelfHash({ id: "fixture-v1" }, "recordHash")).toEqual({
      ok: false,
      reason: "MISSING_FIELD",
      path: ["recordHash"],
    });
    expect(verifySelfHash({ id: "fixture-v1", recordHash: "ABC" }, "recordHash")).toEqual({
      ok: false,
      reason: "INVALID_LITERAL",
      path: ["recordHash"],
    });
    expect(verifySelfHash({ id: "fixture-v1", recordHash: "0".repeat(64) }, "recordHash")).toEqual({
      ok: false,
      reason: "HASH_MISMATCH",
      path: ["recordHash"],
    });
  });

  it("rejects proxied self-hash records before invoking any trap", () => {
    let traps = 0;
    const target = { id: "fixture-v1", recordHash };
    const record = new Proxy(target, {
      getPrototypeOf() {
        traps += 1;
        return Reflect.getPrototypeOf(target);
      },
      ownKeys() {
        traps += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(_target, key) {
        traps += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });

    expect(computeSelfHash(record, "recordHash")).toEqual({
      ok: false,
      reason: "UNSUPPORTED_VALUE",
      path: [],
    });
    expect(verifySelfHash(record, "recordHash")).toEqual({
      ok: false,
      reason: "UNSUPPORTED_VALUE",
      path: [],
    });
    expect(traps).toBe(0);
  });
});
