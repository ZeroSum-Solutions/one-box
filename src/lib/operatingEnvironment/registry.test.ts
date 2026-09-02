import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import registryFixture from "./fixtures/registry-v1.json";
import { resolveFixtureRoute, validateRegistryBundle } from "./registry";

const OBSERVED_AT = "2026-09-01T00:00:00Z";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sealDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sealDeep(item)) as T;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const rebuilt = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sealDeep(item)]),
  );
  if (!("selfHash" in rebuilt)) {
    return rebuilt as T;
  }
  const payload = Object.fromEntries(
    Object.entries(rebuilt).filter(([key]) => key !== "selfHash"),
  );
  return {
    ...payload,
    selfHash: createHash("sha256").update(canonicalJson(payload)).digest("hex"),
  } as T;
}

function changedFixture(
  mutate: (fixture: typeof registryFixture) => void,
): typeof registryFixture {
  const fixture = structuredClone(registryFixture);
  mutate(fixture);
  return sealDeep(fixture);
}

function changedProvider(
  field: "accessLane" | "credentialBoundary",
  value: string,
): typeof registryFixture {
  const provider = sealDeep({
    ...structuredClone(registryFixture.product.providers[0]),
    [field]: value,
  });
  return changedFixture((fixture) => {
    fixture.product.providers[0][field] = value;
    fixture.product.routes[0].providerHash = provider.selfHash;
  });
}

describe("registry bundle validation", () => {
  it("accepts the literal three-inventory fixture and freezes every returned level", () => {
    const result = validateRegistryBundle(registryFixture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(registryFixture);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.product.providers)).toBe(true);
    expect(Object.isFrozen(result.value.product.providers[0])).toBe(true);
    expect(Object.isFrozen(result.value.evaluation.candidates)).toBe(true);
    expect(Object.isFrozen(result.value.externalReview.auditors)).toBe(true);
  });

  it("rejects unknown fields at the root and nested entry boundaries", () => {
    const unknownRoot = { ...registryFixture, promote: true };
    const unknownEntry = structuredClone(registryFixture) as typeof registryFixture & {
      product: typeof registryFixture.product & { providers: Array<Record<string, unknown>> };
    };
    unknownEntry.product.providers[0].runtimeUrl = "https://example.invalid";

    expect(validateRegistryBundle(unknownRoot).ok).toBe(false);
    expect(validateRegistryBundle(unknownEntry).ok).toBe(false);
  });

  it("rejects duplicate IDs and identities reused across inventories", () => {
    const duplicate = changedFixture((fixture) => {
      fixture.product.providers.push(structuredClone(fixture.product.providers[0]));
    });
    const crossInventoryAlias = changedFixture((fixture) => {
      fixture.evaluation.candidates[0].modelId = fixture.product.models[0].modelId;
    });

    expect(validateRegistryBundle(duplicate).ok).toBe(false);
    expect(validateRegistryBundle(crossInventoryAlias).ok).toBe(false);
  });

  it("rejects empty inventories instead of succeeding vacuously", () => {
    const empty = changedFixture((fixture) => {
      fixture.product.providers = [];
      fixture.product.models = [];
      fixture.product.routes = [];
      fixture.evaluation.candidates = [];
      fixture.externalReview.auditors = [];
    });

    expect(validateRegistryBundle(empty).ok).toBe(false);
  });

  it("rejects self-hash drift, non-offline product access, and credentials", () => {
    const hashDrift = structuredClone(registryFixture);
    hashDrift.product.models[0].selfHash = "f".repeat(64);
    const networkLane = changedProvider("accessLane", "network");
    const credentialReference = changedProvider("credentialBoundary", "vault");

    expect(validateRegistryBundle(hashDrift).ok).toBe(false);
    expect(networkLane.product.routes[0].providerHash).toBe(
      networkLane.product.providers[0].selfHash,
    );
    expect(credentialReference.product.routes[0].providerHash).toBe(
      credentialReference.product.providers[0].selfHash,
    );
    expect(validateRegistryBundle(networkLane).ok).toBe(false);
    expect(validateRegistryBundle(credentialReference).ok).toBe(false);
  });

  it("rejects admission values outside each inventory", () => {
    const promotedEvaluation = changedFixture((fixture) => {
      fixture.evaluation.candidates[0].admission = "fixture-only";
    });
    const promotedAuditor = changedFixture((fixture) => {
      fixture.externalReview.auditors[0].admission = "fixture-only";
    });

    expect(validateRegistryBundle(promotedEvaluation).ok).toBe(false);
    expect(validateRegistryBundle(promotedAuditor).ok).toBe(false);
  });
});

describe("fixture route resolution", () => {
  it("resolves only the exact admitted product route at an explicit observation time", () => {
    const validated = validateRegistryBundle(registryFixture);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const result = resolveFixtureRoute(
      validated.value,
      registryFixture.product.routes[0].selfHash,
      OBSERVED_AT,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        routeId: "fixture-product-route-v1",
        routePolicyHash: registryFixture.product.routes[0].selfHash,
        providerId: "offline-deterministic-v1",
        providerHash: registryFixture.product.providers[0].selfHash,
        modelId: "synthetic/offline-deterministic-v1",
        modelHash: registryFixture.product.models[0].selfHash,
        effort: "deterministic",
        admission: "fixture-only",
        accessLane: "offline",
        credentialBoundary: "none",
        fallbackPolicy: "none",
        expiresAt: "2026-09-14T21:47:59Z",
      },
    });
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("does not promote evaluation or audit identities into product routing", () => {
    const validated = validateRegistryBundle(registryFixture);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(
      resolveFixtureRoute(
        validated.value,
        registryFixture.evaluation.candidates[0].selfHash,
        OBSERVED_AT,
      ).ok,
    ).toBe(false);
    expect(
      resolveFixtureRoute(
        validated.value,
        registryFixture.externalReview.auditors[0].selfHash,
        OBSERVED_AT,
      ).ok,
    ).toBe(false);
  });

  it("rejects mismatched hashes, unsupported effort, and expired admission", () => {
    const validated = validateRegistryBundle(registryFixture);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const unsupportedEffort = changedFixture((fixture) => {
      fixture.product.routes[0].effort = "high";
    });
    const mismatchedBinding = changedFixture((fixture) => {
      fixture.product.routes[0].providerHash = "f".repeat(64);
    });

    expect(resolveFixtureRoute(validated.value, "f".repeat(64), OBSERVED_AT).ok).toBe(false);
    expect(
      resolveFixtureRoute(
        mismatchedBinding as unknown as typeof validated.value,
        mismatchedBinding.product.routes[0].selfHash,
        OBSERVED_AT,
      ).ok,
    ).toBe(false);
    expect(
      resolveFixtureRoute(
        unsupportedEffort as unknown as typeof validated.value,
        unsupportedEffort.product.routes[0].selfHash,
        OBSERVED_AT,
      ).ok,
    ).toBe(false);
    expect(
      resolveFixtureRoute(
        validated.value,
        registryFixture.product.routes[0].selfHash,
        "2026-09-14T21:48:00Z",
      ).ok,
    ).toBe(false);
    expect(
      resolveFixtureRoute(
        validated.value,
        registryFixture.product.routes[0].selfHash,
        "2026-09-01T00:00:00.000Z",
      ).ok,
    ).toBe(false);
  });

  it("rejects network, credential, and fallback drift before any effect", () => {
    const networkLane = changedProvider("accessLane", "network");
    const credentialReference = changedProvider("credentialBoundary", "vault");
    const fallback = changedFixture((fixture) => {
      fixture.product.routes[0].fallbackPolicy = "automatic";
    });

    for (const fixture of [networkLane, credentialReference, fallback]) {
      expect(
        resolveFixtureRoute(
          fixture as unknown as Parameters<typeof resolveFixtureRoute>[0],
          fixture.product.routes[0].selfHash,
          OBSERVED_AT,
        ).ok,
      ).toBe(false);
    }
  });
});
