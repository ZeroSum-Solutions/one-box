import { createHash } from "node:crypto";
import { assertCanonicalTokenInventory, assertTailwindPlanMatchesInventory } from "./evidence";
import {
  CssArchitectureSchema,
  DesignResearchLedgerSchema,
  PAGE_IR_DERIVATION_KINDS,
  PageIRV1Schema,
  PageIrAssetsV1Schema,
  PageIrContentV1Schema,
  PageIrDerivationRequestV1Schema,
  PageIrLayoutDecisionV1Schema,
  PageIrLineageV1Schema,
  TailwindPlanSchema,
  TokenInventorySchema,
  V2DesignContractMetadataSchema,
  type DesignResearchLedger,
  type PageIRV1,
  type PageIrArtifactBindingV1,
  type PageIrDerivationKind,
  type PageIrDerivationRequestV1,
  type PageIrLineageV1,
  type PageTokenCategory,
  type PageTokenV1,
  type ReferenceContractV1,
  type ReferenceTraceV1,
} from "./contracts";

export { PAGE_IR_DERIVATION_KINDS } from "./contracts";

const ERROR_LIMIT = 240;

export class PageIrDerivationError extends Error {
  constructor(message: string) {
    super(message.slice(0, ERROR_LIMIT));
    this.name = "PageIrDerivationError";
  }
}

function fail(message: string): never {
  throw new PageIrDerivationError(message);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail("Page IR contains a non-canonical value");
  return encoded;
}

/** The only Page IR hash authority: validated IR over canonical JSON. */
export function pageIrSha256(pageIr: PageIRV1): string {
  const validated = PageIRV1Schema.safeParse(pageIr);
  if (!validated.success) fail("Cannot hash an invalid Page IR artifact");
  return sha256(new TextEncoder().encode(canonicalJson(validated.data)));
}

function parseRequest(input: unknown): PageIrDerivationRequestV1 {
  if (input && typeof input === "object") {
    const bindings = (input as { bindings?: unknown }).bindings;
    if (Array.isArray(bindings)) {
      if (
        bindings.some(
          (binding) =>
            binding &&
            typeof binding === "object" &&
            (binding as { approvalState?: unknown }).approvalState !== "approved",
        )
      ) {
        fail("Every Page IR artifact binding must be approved");
      }
      const kinds = bindings.map((binding) =>
        binding && typeof binding === "object"
          ? (binding as { kind?: unknown }).kind
          : undefined,
      );
      if (
        bindings.length !== PAGE_IR_DERIVATION_KINDS.length ||
        new Set(kinds).size !== PAGE_IR_DERIVATION_KINDS.length ||
        PAGE_IR_DERIVATION_KINDS.some((kind) => !kinds.includes(kind))
      ) {
        fail("Page IR derivation requires the exact binding set and known kinds");
      }
    }
  }
  const parsed = PageIrDerivationRequestV1Schema.safeParse(input);
  if (!parsed.success) fail("Invalid Page IR derivation request");
  return parsed.data;
}

function decodeJson(binding: PageIrArtifactBindingV1): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(binding.bytes);
  } catch {
    fail(`Invalid ${binding.kind} artifact encoding`);
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`Invalid ${binding.kind} artifact JSON`);
  }
}

function parseArtifact<T>(
  binding: PageIrArtifactBindingV1,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
): T {
  const parsed = schema.safeParse(decodeJson(binding));
  if (!parsed.success) {
    fail(`Invalid ${binding.kind} artifact schema`);
  }
  return parsed.data;
}

type ParsedArtifacts = {
  evidence: ReturnType<typeof DesignResearchLedgerSchema.parse>;
  designContract: ReturnType<typeof V2DesignContractMetadataSchema.parse>;
  tokenInventory: ReturnType<typeof TokenInventorySchema.parse>;
  tailwindPlan: ReturnType<typeof TailwindPlanSchema.parse>;
  cssArchitecture: ReturnType<typeof CssArchitectureSchema.parse>;
  layoutDecision: ReturnType<typeof PageIrLayoutDecisionV1Schema.parse>;
  content: ReturnType<typeof PageIrContentV1Schema.parse>;
  assets: ReturnType<typeof PageIrAssetsV1Schema.parse>;
};

function assertVersionChain(
  bindings: ReadonlyMap<PageIrDerivationKind, PageIrArtifactBindingV1>,
  artifacts: ParsedArtifacts,
): void {
  const expectedLayoutVersions = {
    evidence: bindings.get("evidence")!.version,
    designContract: bindings.get("design-contract")!.version,
    tokenInventory: bindings.get("token-inventory")!.version,
    tailwindPlan: bindings.get("tailwind-plan")!.version,
    cssArchitecture: bindings.get("css-architecture")!.version,
  };
  if (
    artifacts.designContract.sourceLedgerVersion !== expectedLayoutVersions.evidence ||
    artifacts.tokenInventory.sourceContractVersion !== expectedLayoutVersions.designContract ||
    artifacts.tailwindPlan.sourceTokenInventoryVersion !== expectedLayoutVersions.tokenInventory ||
    artifacts.cssArchitecture.sourceTailwindPlanVersion !== expectedLayoutVersions.tailwindPlan ||
    Object.entries(expectedLayoutVersions).some(
      ([field, version]) =>
        artifacts.layoutDecision.sourceVersions[
          field as keyof typeof expectedLayoutVersions
        ] !== version,
    ) ||
    artifacts.content.sourceLayoutDecisionVersion !== bindings.get("layout-decision")!.version ||
    artifacts.assets.sourceLayoutDecisionVersion !== bindings.get("layout-decision")!.version
  ) {
    fail("Page IR artifact version chain is inconsistent");
  }
}

function evidenceClaimIds(evidence: DesignResearchLedger): Set<string> {
  const ids = [
    ...evidence.businessIntelligence.claims.map((claim) => claim.id),
    ...evidence.referoDesignEvidence.claims.map((claim) => claim.id),
    ...evidence.clientEvidence.claims.map((claim) => claim.id),
  ];
  if (new Set(ids).size !== ids.length) {
    fail("Design evidence claim IDs must be unique");
  }
  return new Set(ids);
}

function assertDesignAttribution(artifacts: ParsedArtifacts): void {
  const { evidence, designContract, tokenInventory, tailwindPlan } = artifacts;
  if (evidence.projectTarget !== "website") fail("Page IR evidence target must be website");
  const availableEvidenceIds = evidenceClaimIds(evidence);
  if (
    designContract.approvedEvidenceIds.length === 0 ||
    new Set(designContract.approvedEvidenceIds).size !== designContract.approvedEvidenceIds.length ||
    designContract.approvedEvidenceIds.some((id) => !availableEvidenceIds.has(id))
  ) {
    fail("Design contract evidence attribution is invalid");
  }
  if (!designContract.designTokens) fail("Design contract must contain approved design tokens");
  try {
    assertCanonicalTokenInventory(
      designContract.designTokens,
      tokenInventory,
      designContract.approvedEvidenceIds,
    );
  } catch {
    fail("Approved token inventory does not match its design contract");
  }
  try {
    assertTailwindPlanMatchesInventory(tokenInventory, tailwindPlan);
  } catch {
    fail("Approved Tailwind plan does not match its token inventory");
  }
}

function assertReferenceAttribution(
  contract: ReferenceContractV1,
  trace: ReferenceTraceV1,
  evidence: DesignResearchLedger,
): void {
  if (contract.selection.mode === "explicit-none") {
    if (trace.mode !== "explicit-none" || trace.sources.length !== 0) {
      fail("Explicit-none references require an empty reference trace");
    }
    return;
  }
  if (trace.mode !== "selected") fail("Selected references require a selected reference trace");
  if (trace.sources.length !== contract.selection.sources.length) {
    fail("Reference trace must cover every selected alias exactly once");
  }
  const traceByAlias = new Map(trace.sources.map((source) => [source.alias, source]));
  const rawEvidenceIds = evidence.referoDesignEvidence.references.map(
    (reference) => reference.referoId,
  );
  if (new Set(rawEvidenceIds).size !== rawEvidenceIds.length) {
    fail("Approved reference evidence IDs must be unique");
  }
  const evidenceByRawId = new Map(
    evidence.referoDesignEvidence.references.map((reference) => [reference.referoId, reference]),
  );
  const attributedTraits: string[] = [];
  for (const selection of contract.selection.sources) {
    const source = traceByAlias.get(selection.id);
    if (!source || source.sourceKind !== selection.kind) {
      fail("Reference trace aliases and kinds must match selected references");
    }
    const reference = evidenceByRawId.get(source.rawReferoId);
    if (!reference) fail("Reference trace raw IDs must exist in approved evidence");
    for (const trait of source.traits) {
      if (
        !contract.preserveTraits.includes(trait) ||
        !reference.reusablePatterns.includes(trait)
      ) {
        fail("Reference trace traits must be attributed to their approved evidence");
      }
      attributedTraits.push(trait);
    }
  }
  if (
    attributedTraits.length !== contract.preserveTraits.length ||
    new Set(attributedTraits).size !== attributedTraits.length ||
    contract.preserveTraits.some((trait) => !attributedTraits.includes(trait))
  ) {
    fail("Reference trace must attribute every preserved trait exactly once");
  }
}

const PAGE_TOKEN_CATEGORIES = new Set<PageTokenCategory>([
  "color",
  "typography",
  "spacing",
  "radius",
  "shadow",
  "motion",
]);

function normalizedTokenId(semanticName: string): string {
  const normalized = semanticName
    .trim()
    .toLowerCase()
    .replace(/^--/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) fail("Page IR token semantic name cannot normalize to an empty ID");
  const safe = /^[a-z]/.test(normalized) ? normalized : `token-${normalized}`;
  if (safe.length > 64) fail("Page IR token semantic name exceeds the safe ID bound");
  return safe;
}

export function projectPageTokensV1(
  inventory: ParsedArtifacts["tokenInventory"],
): PageTokenV1[] {
  const projected: PageTokenV1[] = [];
  const ids = new Set<string>();
  for (const token of inventory.tokens) {
    if (!PAGE_TOKEN_CATEGORIES.has(token.category as PageTokenCategory)) continue;
    const id = normalizedTokenId(token.semanticName);
    if (ids.has(id)) fail("Page IR token ID normalization collision");
    ids.add(id);
    projected.push({ id, category: token.category as PageTokenCategory });
  }
  return projected;
}

export interface PageIrDerivationResultV1 {
  pageIr: PageIRV1;
  pageIrSha256: string;
  lineage: PageIrLineageV1;
}

export function derivePageIRV1(input: unknown): PageIrDerivationResultV1 {
  const request = parseRequest(input);
  const bindingByKind = new Map(request.bindings.map((binding) => [binding.kind, binding]));

  for (const binding of request.bindings) {
    if (binding.runId !== request.runId) {
      fail("Every Page IR artifact binding must use the requested run ID");
    }
    if (sha256(binding.bytes) !== binding.sha256) {
      fail(`Exact-byte SHA-256 mismatch for ${binding.kind} artifact`);
    }
  }

  const get = (kind: PageIrDerivationKind) => bindingByKind.get(kind)!;
  const artifacts: ParsedArtifacts = {
    evidence: parseArtifact(get("evidence"), DesignResearchLedgerSchema),
    designContract: parseArtifact(get("design-contract"), V2DesignContractMetadataSchema),
    tokenInventory: parseArtifact(get("token-inventory"), TokenInventorySchema),
    tailwindPlan: parseArtifact(get("tailwind-plan"), TailwindPlanSchema),
    cssArchitecture: parseArtifact(get("css-architecture"), CssArchitectureSchema),
    layoutDecision: parseArtifact(get("layout-decision"), PageIrLayoutDecisionV1Schema),
    content: parseArtifact(get("content"), PageIrContentV1Schema),
    assets: parseArtifact(get("assets"), PageIrAssetsV1Schema),
  };

  assertVersionChain(bindingByKind, artifacts);
  assertDesignAttribution(artifacts);
  assertReferenceAttribution(
    artifacts.layoutDecision.referenceContract,
    artifacts.layoutDecision.referenceTrace,
    artifacts.evidence,
  );

  const candidate = {
    schemaVersion: 1 as const,
    target: "website" as const,
    referenceContract: artifacts.layoutDecision.referenceContract,
    layoutProgram: artifacts.layoutDecision.layoutProgram,
    content: artifacts.content.content,
    tokens: projectPageTokensV1(artifacts.tokenInventory),
    assets: artifacts.assets.assets,
    actions: artifacts.content.actions,
    slotBindings: artifacts.layoutDecision.slotBindings,
    nodeTokenBindings: artifacts.layoutDecision.nodeTokenBindings,
    accessibility: artifacts.layoutDecision.accessibility,
  };
  const parsedPageIr = PageIRV1Schema.safeParse(candidate);
  if (!parsedPageIr.success) fail("Derived Page IR failed closed validation");

  const lineage = PageIrLineageV1Schema.parse({
    schemaVersion: 1,
    runId: request.runId,
    purpose: artifacts.layoutDecision.purpose,
    sources: PAGE_IR_DERIVATION_KINDS.map((kind) => {
      const binding = get(kind);
      return { kind, version: binding.version, sha256: binding.sha256 };
    }),
    referenceTrace: artifacts.layoutDecision.referenceTrace,
  });
  return {
    pageIr: parsedPageIr.data,
    pageIrSha256: pageIrSha256(parsedPageIr.data),
    lineage,
  };
}
