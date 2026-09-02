import { describe, expect, it } from "vitest";
import {
  arrayOf,
  booleanValue,
  closedEnum,
  closedRecord,
  literalValue,
  nonEmptyString,
  refine,
  safeInteger,
  withSelfHash,
  type InferValidator,
} from "./contracts";

const FixtureValidator = withSelfHash(
  refine(
    closedRecord({
      schemaVersion: literalValue("contract-fixture-v1"),
      id: nonEmptyString(),
      mode: closedEnum(["fixture-only", "disabled"] as const),
      revision: safeInteger(),
      enabled: booleanValue(),
      tags: arrayOf(nonEmptyString()),
      recordHash: nonEmptyString(),
    }),
    (value) => value.mode !== "disabled" || value.enabled === false,
    ["enabled"],
  ),
  "recordHash",
);

type Fixture = InferValidator<typeof FixtureValidator>;

const VALID_FIXTURE: Fixture = {
  schemaVersion: "contract-fixture-v1",
  id: "offline-v1",
  mode: "fixture-only",
  revision: 1,
  enabled: false,
  tags: ["offline", "deterministic"],
  recordHash: "6b122b158cceca1317e3bc054b752304f4056439b9491ed5a996ac3945622087",
};

describe("closed contract validators", () => {
  it("validates an exact self-hashed schema fixture", () => {
    expect(FixtureValidator(VALID_FIXTURE)).toEqual({ ok: true, value: VALID_FIXTURE });
  });

  it("rejects malformed non-record input", () => {
    expect(FixtureValidator(null)).toEqual({
      ok: false,
      reason: "INVALID_RECORD",
      path: [],
    });
  });

  it("turns hostile proxy traps into a typed local failure", () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("must not escape");
        },
      },
    );

    expect(FixtureValidator(hostile)).toEqual({
      ok: false,
      reason: "UNSUPPORTED_VALUE",
      path: [],
    });
  });

  it("rejects missing and unknown fields with precise local paths", () => {
    const missingId = {
      schemaVersion: "contract-fixture-v1",
      mode: "fixture-only",
      revision: 1,
      enabled: false,
      tags: ["offline", "deterministic"],
      recordHash: "6b122b158cceca1317e3bc054b752304f4056439b9491ed5a996ac3945622087",
    };

    expect(FixtureValidator(missingId)).toEqual({
      ok: false,
      reason: "MISSING_FIELD",
      path: ["id"],
    });
    expect(FixtureValidator({ ...VALID_FIXTURE, providerUrl: "https://example.invalid" })).toEqual({
      ok: false,
      reason: "UNKNOWN_FIELD",
      path: ["providerUrl"],
    });
  });

  it("rejects closed-literal and enum drift", () => {
    expect(FixtureValidator({ ...VALID_FIXTURE, schemaVersion: "contract-fixture-v2" })).toEqual({
      ok: false,
      reason: "INVALID_LITERAL",
      path: ["schemaVersion"],
    });
    expect(FixtureValidator({ ...VALID_FIXTURE, mode: "enabled" })).toEqual({
      ok: false,
      reason: "INVALID_ENUM",
      path: ["mode"],
    });
  });

  it.each([1.5, Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1])(
    "rejects non-safe integer revisions",
    (revision) => {
      expect(FixtureValidator({ ...VALID_FIXTURE, revision })).toEqual({
        ok: false,
        reason: "INVALID_SAFE_INTEGER",
        path: ["revision"],
      });
    },
  );

  it("rejects empty strings, non-booleans, and malformed arrays", () => {
    expect(FixtureValidator({ ...VALID_FIXTURE, id: "" })).toEqual({
      ok: false,
      reason: "EMPTY_STRING",
      path: ["id"],
    });
    expect(FixtureValidator({ ...VALID_FIXTURE, enabled: 0 })).toEqual({
      ok: false,
      reason: "INVALID_TYPE",
      path: ["enabled"],
    });
    expect(FixtureValidator({ ...VALID_FIXTURE, tags: ["offline", ""] })).toEqual({
      ok: false,
      reason: "EMPTY_STRING",
      path: ["tags", 1],
    });
    expect(FixtureValidator({ ...VALID_FIXTURE, tags: "offline" })).toEqual({
      ok: false,
      reason: "INVALID_TYPE",
      path: ["tags"],
    });
  });

  it("rejects sparse arrays without normalizing them", () => {
    const tags: string[] = [];
    tags.length = 1;

    expect(FixtureValidator({ ...VALID_FIXTURE, tags })).toEqual({
      ok: false,
      reason: "INVALID_RECORD",
      path: ["tags", 0],
    });
  });

  it("rejects integer-like extra array fields at their exact path", () => {
    const tags = ["offline", "deterministic"] as string[] & Record<string, unknown>;
    Object.defineProperty(tags, "4294967296", { enumerable: true, value: "hidden" });

    expect(FixtureValidator({ ...VALID_FIXTURE, tags })).toEqual({
      ok: false,
      reason: "UNKNOWN_FIELD",
      path: ["tags", "4294967296"],
    });
  });

  it("rejects proxied arrays instead of normalizing them", () => {
    const tags = new Proxy(["offline", "deterministic"], {});

    expect(FixtureValidator({ ...VALID_FIXTURE, tags })).toEqual({
      ok: false,
      reason: "UNSUPPORTED_VALUE",
      path: ["tags"],
    });
  });

  it("rejects non-enumerable array indices", () => {
    const tags = ["offline"];
    Object.defineProperty(tags, "0", { enumerable: false, value: "offline" });

    expect(FixtureValidator({ ...VALID_FIXTURE, tags })).toEqual({
      ok: false,
      reason: "INVALID_RECORD",
      path: ["tags", 0],
    });
  });

  it("rejects cross-field invariant violations locally", () => {
    expect(FixtureValidator({ ...VALID_FIXTURE, mode: "disabled", enabled: true })).toEqual({
      ok: false,
      reason: "INVARIANT_VIOLATION",
      path: ["enabled"],
    });
  });

  it("rejects malformed and mismatched self-hashes", () => {
    expect(FixtureValidator({ ...VALID_FIXTURE, recordHash: "ABC" })).toEqual({
      ok: false,
      reason: "INVALID_LITERAL",
      path: ["recordHash"],
    });
    expect(FixtureValidator({ ...VALID_FIXTURE, recordHash: "0".repeat(64) })).toEqual({
      ok: false,
      reason: "HASH_MISMATCH",
      path: ["recordHash"],
    });
  });

  it("deterministically rejects every injected extra field", () => {
    for (const field of ["url", "credential", "fallback", "provider", "runtime"]) {
      expect(FixtureValidator({ ...VALID_FIXTURE, [field]: true })).toEqual({
        ok: false,
        reason: "UNKNOWN_FIELD",
        path: [field],
      });
    }
  });
});
