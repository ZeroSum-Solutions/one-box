import { describe, expect, it } from "vitest";
import {
  CONTRACT_REASON_CODES,
  failure,
  isContractReasonCode,
  success,
} from "./reasonCodes";

describe("contract reason codes", () => {
  it("accepts only the closed reason-code registry", () => {
    expect(isContractReasonCode("UNKNOWN_FIELD")).toBe(true);
    expect(isContractReasonCode("PROVIDER_ERROR_BODY")).toBe(false);
    expect(new Set(CONTRACT_REASON_CODES).size).toBe(CONTRACT_REASON_CODES.length);
  });

  it("constructs typed success without changing the value", () => {
    const value = Object.freeze({ fixtureId: "fixture-v1" });

    expect(success(value)).toEqual({ ok: true, value });
  });

  it("constructs a bounded local failure with safe path segments", () => {
    expect(failure("UNKNOWN_FIELD", ["records", 2, "secret"])).toEqual({
      ok: false,
      reason: "UNKNOWN_FIELD",
      path: ["records", 2, "secret"],
    });
  });

  it("does not retain mutable caller-owned failure paths", () => {
    const path: Array<string | number> = ["records", 0];
    const result = failure("INVALID_TYPE", path);
    path.push("raw input");

    expect(result.path).toEqual(["records", 0]);
    expect(Object.isFrozen(result.path)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
