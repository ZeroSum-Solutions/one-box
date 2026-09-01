import { computeSelfHash } from "./canonical";
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
import { failure, success, type Result } from "./reasonCodes";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const CONTENT_REF_PATTERN = /^artifact:[a-z0-9][a-z0-9._-]{0,63}@[a-f0-9]{64}$/;
const hashValue = refine(nonEmptyString(), (value) => HASH_PATTERN.test(value));
const nonNegativeInteger = refine(safeInteger(), (value) => value >= 0);
const utcTimestamp = refine(nonEmptyString(), (value) => {
  if (!UTC_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    && new Date(milliseconds).toISOString() === value.replace("Z", ".000Z");
});
const sourceKind = closedEnum([
  "accepted-policy", "actor-task", "human-decision", "skill-instruction",
  "project-artifact", "evidence", "prior-receipt", "prior-output",
] as const);
const authorityClass = closedEnum([
  "policy", "human-task", "human-decision", "skill-instruction", "untrusted-data",
] as const);
const uniqueHashes = refine(
  arrayOf(hashValue),
  (values) => values.length === new Set(values).size,
);

const fragmentValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("context-fragment-v1"),
  fragmentId: nonEmptyString(),
  sourceKind,
  sourceIdentity: nonEmptyString(),
  sourceVersion: nonEmptyString(),
  sourceHash: hashValue,
  boundedRange: literalValue(null),
  authorityClass,
  dataClass: closedEnum(["public", "internal"] as const),
  inclusionPurpose: nonEmptyString(),
  contentRef: refine(nonEmptyString(), (value) => CONTENT_REF_PATTERN.test(value)),
  contentHash: hashValue,
  normalizedBytes: nonNegativeInteger,
  estimatedTokens: nonNegativeInteger,
  freshnessPolicyRef: nonEmptyString(),
  rightsPolicyRef: nonEmptyString(),
  fragmentHash: hashValue,
}), "fragmentHash");

const observationValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("context-live-observation-v1"),
  fragmentHash: hashValue,
  sourceHash: hashValue,
  contentHash: hashValue,
  freshnessPolicyRef: nonEmptyString(),
  rightsPolicyRef: nonEmptyString(),
  freshnessExpiresAt: utcTimestamp,
  rightsExpiresAt: utcTimestamp,
  rightsGranted: booleanValue(),
  observationHash: hashValue,
}), "observationHash");

const bundleValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("context-bundle-v1"),
  bundleId: nonEmptyString(),
  projectId: nonEmptyString(),
  actorId: nonEmptyString(),
  policyFragmentHashes: uniqueHashes,
  taskFragmentHash: hashValue,
  humanDecisionFragmentHashes: uniqueHashes,
  skillInstructionFragmentHashes: uniqueHashes,
  untrustedDataFragmentHashes: uniqueHashes,
  orderedMaterializationHashes: uniqueHashes,
  contextPolicyHash: hashValue,
  maximumBytes: nonNegativeInteger,
  maximumTokens: nonNegativeInteger,
  actualBytes: nonNegativeInteger,
  estimatedTokens: nonNegativeInteger,
  excludedFragmentReceipts: uniqueHashes,
  createdAt: utcTimestamp,
  expiresAt: utcTimestamp,
  bundleHash: hashValue,
}), "bundleHash");

const requestValidator = closedRecord({
  schemaVersion: literalValue("context-materialization-request-v1"),
  bundleId: nonEmptyString(),
  projectId: nonEmptyString(),
  actorId: nonEmptyString(),
  contextPolicyHash: hashValue,
  maximumBytes: nonNegativeInteger,
  maximumTokens: nonNegativeInteger,
  createdAt: utcTimestamp,
  expiresAt: utcTimestamp,
  observedAt: utcTimestamp,
});

const rejectionValidator = withSelfHash(closedRecord({
  schemaVersion: literalValue("context-overflow-rejection-v1"),
  bundleId: nonEmptyString(),
  candidateFragmentHashes: uniqueHashes,
  reason: closedEnum([
    "maximum-bytes-exceeded", "maximum-tokens-exceeded", "both-caps-exceeded",
  ] as const),
  actualBytes: nonNegativeInteger,
  estimatedTokens: nonNegativeInteger,
  maximumBytes: nonNegativeInteger,
  maximumTokens: nonNegativeInteger,
  createdAt: utcTimestamp,
  receiptHash: hashValue,
}), "receiptHash");

export type ContextFragmentV1 = InferValidator<typeof fragmentValidator>;
export type ContextLiveObservationV1 = InferValidator<typeof observationValidator>;
export type ContextBundleV1 = InferValidator<typeof bundleValidator>;
export type ContextMaterializationV1 = Readonly<{
  status: "packed";
  bundle: ContextBundleV1;
  layers: Readonly<{
    policy: readonly string[];
    human: readonly string[];
    skill: readonly string[];
    untrusted: readonly string[];
  }>;
}>;
export type ContextOverflowRejectionV1 = InferValidator<typeof rejectionValidator>;
export type ContextMaterializationOutcomeV1 = ContextMaterializationV1 | Readonly<{
  status: "rejected";
  receipt: ContextOverflowRejectionV1;
}>;

const AUTHORITY_BY_SOURCE: Readonly<Record<ContextFragmentV1["sourceKind"], ContextFragmentV1["authorityClass"]>> = {
  "accepted-policy": "policy",
  "actor-task": "human-task",
  "human-decision": "human-decision",
  "skill-instruction": "skill-instruction",
  "project-artifact": "untrusted-data",
  evidence: "untrusted-data",
  "prior-receipt": "untrusted-data",
  "prior-output": "untrusted-data",
};

function fragmentInvariant(fragment: ContextFragmentV1): boolean {
  return AUTHORITY_BY_SOURCE[fragment.sourceKind] === fragment.authorityClass;
}

export function validateContextFragment(input: unknown): Result<ContextFragmentV1> {
  const parsed = fragmentValidator(input);
  if (!parsed.ok) return parsed;
  return fragmentInvariant(parsed.value)
    ? parsed
    : failure("INVARIANT_VIOLATION", ["authorityClass"]);
}

function parseFragments(input: unknown): Result<readonly ContextFragmentV1[]> {
  const parsed = arrayOf(fragmentValidator)(input);
  if (!parsed.ok) return parsed;
  const ids = parsed.value.map((fragment) => fragment.fragmentId);
  const hashes = parsed.value.map((fragment) => fragment.fragmentHash);
  if (ids.length !== new Set(ids).size || hashes.length !== new Set(hashes).size) {
    return failure("INVARIANT_VIOLATION", ["fragments"]);
  }
  if (parsed.value.some((fragment) => !fragmentInvariant(fragment))) {
    return failure("INVARIANT_VIOLATION", ["fragments", "authorityClass"]);
  }
  return parsed;
}

type OrderedFragments = Readonly<{
  policy: readonly ContextFragmentV1[];
  task: ContextFragmentV1;
  decisions: readonly ContextFragmentV1[];
  skills: readonly ContextFragmentV1[];
  untrusted: readonly ContextFragmentV1[];
  ordered: readonly ContextFragmentV1[];
}>;

function byId(left: ContextFragmentV1, right: ContextFragmentV1): number {
  if (left.fragmentId === right.fragmentId) return 0;
  return left.fragmentId < right.fragmentId ? -1 : 1;
}

function orderFragments(fragments: readonly ContextFragmentV1[]): Result<OrderedFragments> {
  const policy = fragments.filter((item) => item.authorityClass === "policy").sort(byId);
  const tasks = fragments.filter((item) => item.authorityClass === "human-task");
  const decisions = fragments.filter((item) => item.authorityClass === "human-decision").sort(byId);
  const skills = fragments.filter((item) => item.authorityClass === "skill-instruction").sort(byId);
  const untrusted = fragments.filter((item) => item.authorityClass === "untrusted-data").sort(byId);
  if (policy.length === 0 || tasks.length !== 1 || decisions.length === 0 || skills.length === 0) {
    return failure("INVARIANT_VIOLATION", ["fragments"]);
  }
  const ordered = Object.freeze([...policy, tasks[0], ...decisions, ...skills, ...untrusted]);
  return success(Object.freeze({ policy, task: tasks[0], decisions, skills, untrusted, ordered }));
}

function hashList(fragments: readonly ContextFragmentV1[]): readonly string[] {
  return Object.freeze(fragments.map((fragment) => fragment.fragmentHash));
}

function encodedBytes(fragments: readonly ContextFragmentV1[]): number {
  const encoder = new TextEncoder();
  return fragments.reduce((total, fragment) => {
    const label = `[${fragment.authorityClass}:${fragment.fragmentHash}]\n`;
    return total + encoder.encode(label).length + fragment.normalizedBytes + 1;
  }, 0);
}

function tokenCount(fragments: readonly ContextFragmentV1[]): number {
  return fragments.reduce((total, fragment) => total + fragment.estimatedTokens, 0);
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function bundleInvariant(bundle: ContextBundleV1, ordered: OrderedFragments): boolean {
  const allHashes = hashList(ordered.ordered);
  return Date.parse(bundle.createdAt) < Date.parse(bundle.expiresAt)
    && bundle.actorId === ordered.task.sourceIdentity
    && same(bundle.policyFragmentHashes, hashList(ordered.policy))
    && bundle.taskFragmentHash === ordered.task.fragmentHash
    && same(bundle.humanDecisionFragmentHashes, hashList(ordered.decisions))
    && same(bundle.skillInstructionFragmentHashes, hashList(ordered.skills))
    && same(bundle.untrustedDataFragmentHashes, hashList(ordered.untrusted))
    && same(bundle.orderedMaterializationHashes, allHashes)
    && bundle.actualBytes === encodedBytes(ordered.ordered)
    && bundle.estimatedTokens === tokenCount(ordered.ordered)
    && bundle.actualBytes <= bundle.maximumBytes
    && bundle.estimatedTokens <= bundle.maximumTokens
    && bundle.excludedFragmentReceipts.length === 0;
}

export function validateContextBundle(
  bundleInput: unknown,
  fragmentsInput: unknown,
): Result<ContextBundleV1> {
  const bundle = bundleValidator(bundleInput);
  if (!bundle.ok) return bundle;
  const fragments = parseFragments(fragmentsInput);
  if (!fragments.ok) return fragments;
  const ordered = orderFragments(fragments.value);
  if (!ordered.ok) return ordered;
  return bundleInvariant(bundle.value, ordered.value)
    ? bundle
    : failure("INVARIANT_VIOLATION", ["bundle"]);
}

function parseObservations(input: unknown): Result<readonly ContextLiveObservationV1[]> {
  const parsed = arrayOf(observationValidator)(input);
  if (!parsed.ok) return parsed;
  const fragmentHashes = parsed.value.map((item) => item.fragmentHash);
  return fragmentHashes.length === new Set(fragmentHashes).size
    ? parsed
    : failure("INVARIANT_VIOLATION", ["observations"]);
}

function observationsAreLive(
  fragments: readonly ContextFragmentV1[],
  observations: readonly ContextLiveObservationV1[],
  observedAt: string,
  bundleExpiresAt: string,
): boolean {
  if (fragments.length !== observations.length) return false;
  return fragments.every((fragment) => {
    const observation = observations.find((item) => item.fragmentHash === fragment.fragmentHash);
    return observation !== undefined
      && observation.sourceHash === fragment.sourceHash
      && observation.contentHash === fragment.contentHash
      && observation.freshnessPolicyRef === fragment.freshnessPolicyRef
      && observation.rightsPolicyRef === fragment.rightsPolicyRef
      && observation.rightsGranted
      && Date.parse(observedAt) < Date.parse(observation.freshnessExpiresAt)
      && Date.parse(observedAt) < Date.parse(observation.rightsExpiresAt)
      && Date.parse(bundleExpiresAt) <= Date.parse(observation.freshnessExpiresAt)
      && Date.parse(bundleExpiresAt) <= Date.parse(observation.rightsExpiresAt);
  });
}

function sealBundle(value: Record<string, unknown>): Result<ContextBundleV1> {
  const candidate = { ...value, bundleHash: "0".repeat(64) };
  const hash = computeSelfHash(candidate, "bundleHash");
  return hash.ok ? bundleValidator({ ...candidate, bundleHash: hash.value }) : hash;
}

function sealRejection(value: Record<string, unknown>): Result<ContextOverflowRejectionV1> {
  const candidate = { ...value, receiptHash: "0".repeat(64) };
  const hash = computeSelfHash(candidate, "receiptHash");
  return hash.ok ? rejectionValidator({ ...candidate, receiptHash: hash.value }) : hash;
}

export function materializeContext(
  requestInput: unknown,
  fragmentsInput: unknown,
  observationsInput: unknown,
): Result<ContextMaterializationOutcomeV1> {
  const request = requestValidator(requestInput);
  if (!request.ok) return request;
  const fragments = parseFragments(fragmentsInput);
  if (!fragments.ok) return fragments;
  const ordered = orderFragments(fragments.value);
  if (!ordered.ok) return ordered;
  const observations = parseObservations(observationsInput);
  if (!observations.ok) return observations;
  const observed = Date.parse(request.value.observedAt);
  if (Date.parse(request.value.createdAt) > observed
    || observed >= Date.parse(request.value.expiresAt)
    || request.value.actorId !== ordered.value.task.sourceIdentity
    || !observationsAreLive(
      fragments.value, observations.value, request.value.observedAt, request.value.expiresAt,
    )) {
    return failure("INVARIANT_VIOLATION", ["observedAt"]);
  }
  const actualBytes = encodedBytes(ordered.value.ordered);
  const estimatedTokens = tokenCount(ordered.value.ordered);
  const bytesExceeded = actualBytes > request.value.maximumBytes;
  const tokensExceeded = estimatedTokens > request.value.maximumTokens;
  if (bytesExceeded || tokensExceeded) {
    const receipt = sealRejection({
      schemaVersion: "context-overflow-rejection-v1",
      bundleId: request.value.bundleId,
      candidateFragmentHashes: [...hashList(ordered.value.ordered)].sort(),
      reason: bytesExceeded && tokensExceeded
        ? "both-caps-exceeded"
        : bytesExceeded ? "maximum-bytes-exceeded" : "maximum-tokens-exceeded",
      actualBytes,
      estimatedTokens,
      maximumBytes: request.value.maximumBytes,
      maximumTokens: request.value.maximumTokens,
      createdAt: request.value.createdAt,
    });
    return receipt.ok
      ? success(Object.freeze({ status: "rejected", receipt: receipt.value }))
      : receipt;
  }
  const bundle = sealBundle({
    schemaVersion: "context-bundle-v1",
    bundleId: request.value.bundleId,
    projectId: request.value.projectId,
    actorId: request.value.actorId,
    policyFragmentHashes: hashList(ordered.value.policy),
    taskFragmentHash: ordered.value.task.fragmentHash,
    humanDecisionFragmentHashes: hashList(ordered.value.decisions),
    skillInstructionFragmentHashes: hashList(ordered.value.skills),
    untrustedDataFragmentHashes: hashList(ordered.value.untrusted),
    orderedMaterializationHashes: hashList(ordered.value.ordered),
    contextPolicyHash: request.value.contextPolicyHash,
    maximumBytes: request.value.maximumBytes,
    maximumTokens: request.value.maximumTokens,
    actualBytes,
    estimatedTokens,
    excludedFragmentReceipts: [],
    createdAt: request.value.createdAt,
    expiresAt: request.value.expiresAt,
  });
  if (!bundle.ok) return bundle;
  const validated = validateContextBundle(bundle.value, fragments.value);
  if (!validated.ok) return validated;
  return success(Object.freeze({
    status: "packed",
    bundle: validated.value,
    layers: Object.freeze({
      policy: hashList(ordered.value.policy),
      human: Object.freeze([
        ordered.value.task.fragmentHash, ...hashList(ordered.value.decisions),
      ]),
      skill: hashList(ordered.value.skills),
      untrusted: hashList(ordered.value.untrusted),
    }),
  }));
}
