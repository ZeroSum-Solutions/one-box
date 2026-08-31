import {
  arrayOf,
  closedEnum,
  closedRecord,
  literalValue,
  nonEmptyString,
  refine,
  withSelfHash,
  type InferValidator,
} from "./contracts";
import { failure, success, type Result } from "./reasonCodes";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const hashValue = refine(nonEmptyString(), (value) => HASH_PATTERN.test(value));
const utcTimestamp = refine(nonEmptyString(), (value) => isCanonicalUtc(value));
const admission = closedEnum(["fixture-only", "evaluation-only", "audit-only"] as const);
const effort = closedEnum(["deterministic", "low", "medium", "high"] as const);
const efforts = refine(
  arrayOf(effort),
  (values) => values.length > 0 && new Set(values).size === values.length,
);

const providerRegistryEntry = withSelfHash(
  closedRecord({
    schemaVersion: literalValue("provider-registry-entry-v1"),
    providerId: nonEmptyString(),
    admission,
    accessLane: literalValue("offline"),
    credentialBoundary: literalValue("none"),
    expiresAt: utcTimestamp,
    selfHash: hashValue,
  }),
  "selfHash",
);

const modelRegistryEntry = withSelfHash(
  closedRecord({
    schemaVersion: literalValue("model-registry-entry-v1"),
    modelId: nonEmptyString(),
    providerId: nonEmptyString(),
    admission,
    supportedEfforts: efforts,
    expiresAt: utcTimestamp,
    selfHash: hashValue,
  }),
  "selfHash",
);

const routePolicy = withSelfHash(
  closedRecord({
    schemaVersion: literalValue("route-policy-v1"),
    routeId: nonEmptyString(),
    providerId: nonEmptyString(),
    providerHash: hashValue,
    modelId: nonEmptyString(),
    modelHash: hashValue,
    effort,
    admission: literalValue("fixture-only"),
    fallbackPolicy: literalValue("none"),
    expiresAt: utcTimestamp,
    selfHash: hashValue,
  }),
  "selfHash",
);

const productRegistry = withSelfHash(
  closedRecord({
    schemaVersion: literalValue("product-registry-v1"),
    providers: arrayOf(providerRegistryEntry),
    models: arrayOf(modelRegistryEntry),
    routes: arrayOf(routePolicy),
    selfHash: hashValue,
  }),
  "selfHash",
);

const evaluationRegistry = withSelfHash(
  closedRecord({
    schemaVersion: literalValue("evaluation-registry-v1"),
    candidates: arrayOf(modelRegistryEntry),
    selfHash: hashValue,
  }),
  "selfHash",
);

const externalReviewRegistry = withSelfHash(
  closedRecord({
    schemaVersion: literalValue("external-review-registry-v1"),
    auditors: arrayOf(modelRegistryEntry),
    selfHash: hashValue,
  }),
  "selfHash",
);

const registryBundle = withSelfHash(
  closedRecord({
    schemaVersion: literalValue("registry-bundle-v1"),
    product: productRegistry,
    evaluation: evaluationRegistry,
    externalReview: externalReviewRegistry,
    selfHash: hashValue,
  }),
  "selfHash",
);

export type ProviderRegistryEntryV1 = InferValidator<typeof providerRegistryEntry>;
export type ModelRegistryEntryV1 = InferValidator<typeof modelRegistryEntry>;
export type RoutePolicyV1 = InferValidator<typeof routePolicy>;
export type ProductRegistryV1 = InferValidator<typeof productRegistry>;
export type EvaluationRegistryV1 = InferValidator<typeof evaluationRegistry>;
export type ExternalReviewRegistryV1 = InferValidator<typeof externalReviewRegistry>;
export type RegistryBundleV1 = InferValidator<typeof registryBundle>;

export type ResolvedFixtureRouteV1 = Readonly<{
  routeId: string;
  routePolicyHash: string;
  providerId: string;
  providerHash: string;
  modelId: string;
  modelHash: string;
  effort: RoutePolicyV1["effort"];
  admission: "fixture-only";
  accessLane: "offline";
  credentialBoundary: "none";
  fallbackPolicy: "none";
  expiresAt: string;
}>;

function isCanonicalUtc(value: string): boolean {
  if (!UTC_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    && new Date(milliseconds).toISOString() === value.replace("Z", ".000Z");
}

function hasUnique(values: readonly string[]): boolean {
  return values.length === new Set(values).size;
}

function inventoryIdentities(bundle: RegistryBundleV1): readonly string[] {
  return [
    ...bundle.product.providers.map((entry) => `provider:${entry.providerId}`),
    ...bundle.product.models.map((entry) => `model:${entry.modelId}`),
    ...bundle.evaluation.candidates.flatMap((entry) => [
      `provider:${entry.providerId}`,
      `model:${entry.modelId}`,
    ]),
    ...bundle.externalReview.auditors.flatMap((entry) => [
      `provider:${entry.providerId}`,
      `model:${entry.modelId}`,
    ]),
  ];
}

function hasValidAdmissions(bundle: RegistryBundleV1): boolean {
  return bundle.product.providers.every((entry) => entry.admission === "fixture-only")
    && bundle.product.models.every((entry) => entry.admission === "fixture-only")
    && bundle.evaluation.candidates.every((entry) => entry.admission === "evaluation-only")
    && bundle.externalReview.auditors.every((entry) => entry.admission === "audit-only");
}

function hasUniqueLocalIds(bundle: RegistryBundleV1): boolean {
  return hasUnique(bundle.product.providers.map((entry) => entry.providerId))
    && hasUnique(bundle.product.models.map((entry) => entry.modelId))
    && hasUnique(bundle.product.routes.map((entry) => entry.routeId))
    && hasUnique(bundle.evaluation.candidates.map((entry) => entry.modelId))
    && hasUnique(bundle.externalReview.auditors.map((entry) => entry.modelId));
}

function hasRequiredEntries(bundle: RegistryBundleV1): boolean {
  return bundle.product.providers.length > 0
    && bundle.product.models.length > 0
    && bundle.product.routes.length > 0
    && bundle.evaluation.candidates.length > 0
    && bundle.externalReview.auditors.length > 0;
}

function routeBindingsAreValid(product: ProductRegistryV1): boolean {
  return product.routes.every((route) => {
    const provider = product.providers.find((entry) => entry.providerId === route.providerId);
    const model = product.models.find((entry) => entry.modelId === route.modelId);
    return provider?.selfHash === route.providerHash
      && model?.selfHash === route.modelHash
      && model.providerId === provider.providerId
      && model.supportedEfforts.includes(route.effort)
      && Date.parse(route.expiresAt) <= Date.parse(provider.expiresAt)
      && Date.parse(route.expiresAt) <= Date.parse(model.expiresAt);
  });
}

function bundleInvariantFailure(
  bundle: RegistryBundleV1,
): ReturnType<typeof failure> | undefined {
  if (!hasRequiredEntries(bundle)) return failure("INVARIANT_VIOLATION", []);
  if (!hasUniqueLocalIds(bundle)) return failure("INVARIANT_VIOLATION", ["product"]);
  if (!hasUnique(inventoryIdentities(bundle))) {
    return failure("INVARIANT_VIOLATION", ["evaluation"]);
  }
  if (!hasValidAdmissions(bundle)) return failure("UNSUPPORTED_VALUE", ["admission"]);
  if (!routeBindingsAreValid(bundle.product)) {
    return failure("INVARIANT_VIOLATION", ["product", "routes"]);
  }
  return undefined;
}

export function validateRegistryBundle(input: unknown): Result<RegistryBundleV1> {
  const parsed = registryBundle(input);
  if (!parsed.ok) return parsed;
  const invariantFailure = bundleInvariantFailure(parsed.value);
  return invariantFailure ?? success(parsed.value);
}

function isLiveAt(expiresAt: string, observedAt: string): boolean {
  return Date.parse(observedAt) < Date.parse(expiresAt);
}

function isLiveRoute(
  route: RoutePolicyV1,
  provider: ProviderRegistryEntryV1,
  model: ModelRegistryEntryV1,
  observedAt: string,
): boolean {
  return isLiveAt(route.expiresAt, observedAt)
    && isLiveAt(provider.expiresAt, observedAt)
    && isLiveAt(model.expiresAt, observedAt);
}

export function resolveFixtureRoute(
  bundle: RegistryBundleV1,
  routePolicyHash: string,
  observedAt: string,
): Result<ResolvedFixtureRouteV1> {
  const validated = validateRegistryBundle(bundle);
  if (!validated.ok) return validated;
  if (!HASH_PATTERN.test(routePolicyHash) || !isCanonicalUtc(observedAt)) {
    return failure("UNSUPPORTED_VALUE", ["routePolicyHash"]);
  }
  const route = validated.value.product.routes.find(
    (candidate) => candidate.selfHash === routePolicyHash,
  );
  if (!route) return failure("UNSUPPORTED_VALUE", ["routePolicyHash"]);
  const provider = validated.value.product.providers.find(
    (candidate) => candidate.providerId === route.providerId,
  );
  const model = validated.value.product.models.find(
    (candidate) => candidate.modelId === route.modelId,
  );
  if (!provider || !model || !isLiveRoute(route, provider, model, observedAt)) {
    return failure("INVARIANT_VIOLATION", ["expiresAt"]);
  }
  return success(Object.freeze({
    routeId: route.routeId,
    routePolicyHash: route.selfHash,
    providerId: provider.providerId,
    providerHash: provider.selfHash,
    modelId: model.modelId,
    modelHash: model.selfHash,
    effort: route.effort,
    admission: route.admission,
    accessLane: provider.accessLane,
    credentialBoundary: provider.credentialBoundary,
    fallbackPolicy: route.fallbackPolicy,
    expiresAt: route.expiresAt,
  }));
}
