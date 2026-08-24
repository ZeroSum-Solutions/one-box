import { createHash } from "node:crypto";
import {
  CANDIDATE_GATE_EXPECTATIONS,
  MutationGateRequestV1Schema,
  type MutationCapability,
  type MutationGateRequestV1,
} from "./contracts";

export type MutationGateRequest = MutationGateRequestV1;

export type MutationGateName =
  (typeof CANDIDATE_GATE_EXPECTATIONS)[number]["gate"];

export const FULL_MUTATION_GATE_SUITE: readonly MutationGateName[] =
  Object.freeze(CANDIDATE_GATE_EXPECTATIONS.map(({ gate }) => gate));

export const MUTATION_GATE_MATRIX_V1: Readonly<
  Record<MutationCapability, readonly MutationGateName[]>
> = Object.freeze({
  content: Object.freeze([
    "axe",
    "contrast",
    "no-js",
    "mobile-layout",
  ] as const),
  "token-style": Object.freeze([
    "token-drift",
    "color-role-compliance",
    "axe",
    "contrast",
    "no-js",
    "mobile-layout",
  ] as const),
  asset: Object.freeze([
    "axe",
    "assets",
    "mobile-layout",
    "perf-budget",
  ] as const),
  structure: FULL_MUTATION_GATE_SUITE,
  "link-action": Object.freeze([
    "axe",
    "console-errors",
    "assets",
    "no-js",
  ] as const),
  motion: FULL_MUTATION_GATE_SUITE,
});

export const ACTIVE_MUTATION_GATE_MATRIX_VERSION = `1:${createHash("sha256")
  .update(JSON.stringify(MUTATION_GATE_MATRIX_V1))
  .digest("hex")}` as const;

function freezeRequest<T extends MutationGateRequestV1>(request: T): T {
  if ("capabilities" in request && request.capabilities) {
    Object.freeze(request.capabilities);
  }
  if (request.modelCapabilities) Object.freeze(request.modelCapabilities);
  return Object.freeze(request);
}

export function knownMutationGateRequest(
  capability: MutationCapability,
): MutationGateRequestV1 {
  return freezeRequest({
    schemaVersion: 1,
    matrixVersion: ACTIVE_MUTATION_GATE_MATRIX_VERSION,
    classification: "known",
    capabilities: [capability],
  });
}

export function mixedMutationGateRequest(
  capabilities: readonly MutationCapability[],
): MutationGateRequestV1 {
  const unique = [...new Set(capabilities)];
  if (unique.length < 2) return unknownMutationGateRequest();
  return freezeRequest({
    schemaVersion: 1,
    matrixVersion: ACTIVE_MUTATION_GATE_MATRIX_VERSION,
    classification: "mixed",
    capabilities: unique,
  });
}

export function unknownMutationGateRequest(): MutationGateRequestV1 {
  return freezeRequest({
    schemaVersion: 1,
    matrixVersion: ACTIVE_MUTATION_GATE_MATRIX_VERSION,
    classification: "unknown",
  });
}

export function uncertainMutationGateRequest(
  capabilities: readonly MutationCapability[] = [],
): MutationGateRequestV1 {
  const unique = [...new Set(capabilities)];
  return freezeRequest({
    schemaVersion: 1,
    matrixVersion: ACTIVE_MUTATION_GATE_MATRIX_VERSION,
    classification: "uncertain",
    ...(unique.length > 0 ? { capabilities: unique } : {}),
  });
}

/** Converts untrusted runtime input to the closed request contract. Invalid or
 * future input becomes an explicit unknown request, which mechanically maps
 * to the complete gate registry. */
export function normalizeMutationGateRequest(
  input: unknown,
): MutationGateRequestV1 {
  const parsed = MutationGateRequestV1Schema.safeParse(input);
  if (!parsed.success) return unknownMutationGateRequest();
  return freezeRequest(parsed.data);
}

export function selectMutationGateNames(
  input: unknown,
): readonly MutationGateName[] {
  const parsed = MutationGateRequestV1Schema.safeParse(input);
  if (!parsed.success || parsed.data.classification !== "known") {
    return FULL_MUTATION_GATE_SUITE;
  }
  if (parsed.data.matrixVersion !== ACTIVE_MUTATION_GATE_MATRIX_VERSION) {
    return FULL_MUTATION_GATE_SUITE;
  }

  const [capability] = parsed.data.capabilities;
  const modelCapabilities = parsed.data.modelCapabilities;
  if (
    modelCapabilities &&
    (modelCapabilities.length !== 1 || modelCapabilities[0] !== capability)
  ) {
    return FULL_MUTATION_GATE_SUITE;
  }
  return MUTATION_GATE_MATRIX_V1[capability];
}
