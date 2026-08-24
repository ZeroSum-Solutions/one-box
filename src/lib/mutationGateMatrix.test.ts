import { describe, expect, it } from "vitest";
import {
  ACTIVE_MUTATION_GATE_MATRIX_VERSION,
  FULL_MUTATION_GATE_SUITE,
  MUTATION_GATE_MATRIX_V1,
  knownMutationGateRequest,
  mixedMutationGateRequest,
  normalizeMutationGateRequest,
  selectMutationGateNames,
  uncertainMutationGateRequest,
  unknownMutationGateRequest,
} from "./mutationGateMatrix";

const fullSuite = [
  "token-drift",
  "color-role-compliance",
  "axe",
  "contrast",
  "console-errors",
  "assets",
  "no-js",
  "mobile-layout",
  "perf-budget",
] as const;

describe("capability-aware after-edit gate selection", () => {
  it("pins the complete V1 matrix so a row change requires a versioned fixture update", () => {
    expect(ACTIVE_MUTATION_GATE_MATRIX_VERSION).toMatch(
      /^1:[a-f0-9]{64}$/,
    );
    expect(MUTATION_GATE_MATRIX_V1).toEqual({
      content: ["axe", "contrast", "no-js", "mobile-layout"],
      "token-style": [
        "token-drift",
        "color-role-compliance",
        "axe",
        "contrast",
        "no-js",
        "mobile-layout",
      ],
      asset: ["axe", "assets", "mobile-layout", "perf-budget"],
      structure: fullSuite,
      "link-action": ["axe", "console-errors", "assets", "no-js"],
      motion: fullSuite,
    });
  });

  it("content-addresses every request and fails stale matrix semantics closed", () => {
    const current = knownMutationGateRequest("content");
    expect(current.matrixVersion).toBe(ACTIVE_MUTATION_GATE_MATRIX_VERSION);
    expect(
      selectMutationGateNames({
        ...current,
        matrixVersion: `1:${"0".repeat(64)}`,
      }),
    ).toEqual(fullSuite);
  });

  it("covers every registered blocking gate and never names an unregistered gate", () => {
    const registered = new Set(fullSuite);
    const covered = new Set(Object.values(MUTATION_GATE_MATRIX_V1).flat());
    expect([...covered].every((gate) => registered.has(gate))).toBe(true);
    expect(
      fullSuite
        .filter((gate) => gate !== "perf-budget")
        .every((gate) => covered.has(gate)),
    ).toBe(true);
  });

  it.each([
    ["content", ["axe", "contrast", "no-js", "mobile-layout"]],
    [
      "token-style",
      [
        "token-drift",
        "color-role-compliance",
        "axe",
        "contrast",
        "no-js",
        "mobile-layout",
      ],
    ],
    ["asset", ["axe", "assets", "mobile-layout", "perf-budget"]],
    ["structure", fullSuite],
    ["link-action", ["axe", "console-errors", "assets", "no-js"]],
    ["motion", fullSuite],
  ] as const)("selects the closed %s row in registry order", (capability, expected) => {
    expect(selectMutationGateNames(knownMutationGateRequest(capability))).toEqual(
      expected,
    );
  });

  it.each([
    ["missing request", undefined],
    ["null request", null],
    ["future schema", { schemaVersion: 2, classification: "known", capabilities: ["content"] }],
    ["empty known", { schemaVersion: 1, classification: "known", capabilities: [] }],
    [
      "multiple known",
      { schemaVersion: 1, classification: "known", capabilities: ["content", "asset"] },
    ],
    ["unknown capability", { schemaVersion: 1, classification: "known", capabilities: ["copy"] }],
    ["mixed", mixedMutationGateRequest(["content", "asset"])],
    ["unknown", unknownMutationGateRequest()],
    ["uncertain", uncertainMutationGateRequest(["motion"])],
  ])("fails closed to the full ordered suite for %s", (_label, request) => {
    expect(selectMutationGateNames(request)).toEqual(fullSuite);
  });

  it("allows an advisory model match but widens on any differing or additional hint", () => {
    const deterministic = knownMutationGateRequest("content");
    expect(
      selectMutationGateNames({
        ...deterministic,
        modelCapabilities: ["content"],
      }),
    ).toEqual(["axe", "contrast", "no-js", "mobile-layout"]);
    expect(
      selectMutationGateNames({
        ...deterministic,
        modelCapabilities: ["asset"],
      }),
    ).toEqual(fullSuite);
    expect(
      selectMutationGateNames({
        ...deterministic,
        modelCapabilities: ["content", "asset"],
      }),
    ).toEqual(fullSuite);
    expect(
      selectMutationGateNames({
        ...deterministic,
        modelCapabilities: [],
      }),
    ).toEqual(fullSuite);
  });

  it("publishes immutable rows so callers cannot weaken later selections", () => {
    const selected = selectMutationGateNames(knownMutationGateRequest("asset"));
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(FULL_MUTATION_GATE_SUITE)).toBe(true);
    expect(() => (selected as string[]).pop()).toThrow();
    expect(selectMutationGateNames(knownMutationGateRequest("asset"))).toEqual([
      "axe",
      "assets",
      "mobile-layout",
      "perf-budget",
    ]);
  });

  it("normalizes valid runtime input to a frozen plain clone", () => {
    const prototype = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(prototype, "inheritedAuthority", {
      value: true,
      enumerable: false,
    });
    const input = Object.assign(
      Object.create(prototype) as Record<string, unknown>,
      {
        schemaVersion: 1,
        matrixVersion: ACTIVE_MUTATION_GATE_MATRIX_VERSION,
        classification: "known",
        capabilities: ["asset"],
      },
    );

    const normalized = normalizeMutationGateRequest(input);

    expect(normalized).toEqual(knownMutationGateRequest("asset"));
    expect(normalized).not.toBe(input);
    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
  });
});
