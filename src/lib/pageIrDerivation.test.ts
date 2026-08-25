import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PageIRV1Schema,
  PageIrAssetsV1Schema,
  PageIrContentV1Schema,
  PageIrLayoutDecisionV1Schema,
  type PagePurposeV1,
} from "./contracts";
import { buildTailwindPlan, buildTokenInventory } from "./evidence";
import {
  PAGE_IR_DERIVATION_KINDS,
  PageIrDerivationError,
  derivePageIRV1,
  pageIrSha256,
  projectPageTokensV1,
} from "./pageIrDerivation";
import { pageIrSha256 as purePageIrSha256 } from "./pageIrHash";

function expectDerivationError(input: unknown, message: string) {
  try {
    derivePageIRV1(input);
    throw new Error("expected Page IR derivation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(PageIrDerivationError);
    expect((error as Error).message).toBe(message);
  }
}

const RUN_ID = "run-derivation";
const VERSIONS = {
  evidence: 2,
  "design-contract": 3,
  "token-inventory": 4,
  "tailwind-plan": 5,
  "css-architecture": 6,
  "layout-decision": 7,
  content: 8,
  assets: 9,
} as const;

const PURPOSE_SECTIONS: Record<PagePurposeV1, readonly string[]> = {
  "brochure-local-service": ["hero", "services"],
  "portfolio-showcase": ["portfolio-intro", "project-gallery", "case-study"],
  "saas-marketing": ["product-hero", "features", "integrations", "pricing"],
  "editorial-index": ["editorial-index"],
  "campaign-landing": ["campaign-hero", "offer", "urgency"],
  "institutional-presence": ["mission", "governance", "programs", "history", "contact"],
};

const responsive = () => ({
  small: { flow: "stack" as const },
  medium: { flow: "row" as const },
  large: { flow: "grid" as const, columns: 2 },
});

const designTokens = () => ({
  colors: [{ name: "Primary", value: "#123456", cssVar: "--color-primary", role: "Actions", forbiddenContexts: [] }],
  fonts: [{ family: "Inter", cssVar: "--font-body", weights: [400, 700], role: "Body", substitutes: ["system-ui"] }],
  typeScale: [{ role: "body", sizePx: 16, lineHeight: 1.5, cssVar: "--text-body" }],
  radii: { sm: "4px" },
  spacing: { sm: "8px" },
  borders: { subtle: "1px solid #ddd" },
  shadows: { raised: "0 2px 8px #0002" },
  layers: { base: "0" },
  layout: { maxWidthPx: 1_200, sectionGapPx: 64, cardPaddingPx: 20 },
  motion: { easing: "linear", durationMs: { micro: 100, reveal: 300 }, revealClasses: [] },
  componentStates: [{ component: "button", states: { default: "solid" } }],
  imageryBrief: { subject: "Work", lighting: "Natural", grade: "Neutral", framing: "Wide", avoid: [] },
});

function layoutDecision(purpose: PagePurposeV1) {
  const sections = PURPOSE_SECTIONS[purpose];
  const firstSection = sections[0];
  const sectionNodes = sections.flatMap((sectionId, index) => index === 0
    ? [
        { id: sectionId, kind: "section" as const, childIds: ["page-h1", `${sectionId}-text`, "hero-media", "hero-action"], responsive: responsive() },
        { id: "page-h1", kind: "slot" as const, slotType: "heading" as const, level: 1 },
        { id: `${sectionId}-text`, kind: "slot" as const, slotType: "text" as const },
        { id: "hero-media", kind: "slot" as const, slotType: "media" as const },
        { id: "hero-action", kind: "slot" as const, slotType: "action" as const },
      ]
    : [
        { id: sectionId, kind: "section" as const, childIds: [`${sectionId}-text`], responsive: responsive() },
        { id: `${sectionId}-text`, kind: "slot" as const, slotType: "text" as const },
      ]);

  return {
    schemaVersion: 1 as const,
    purpose,
    sourceVersions: {
      evidence: VERSIONS.evidence,
      designContract: VERSIONS["design-contract"],
      tokenInventory: VERSIONS["token-inventory"],
      tailwindPlan: VERSIONS["tailwind-plan"],
      cssArchitecture: VERSIONS["css-architecture"],
    },
    referenceContract: {
      schemaVersion: 1 as const,
      selection: {
        mode: "selected" as const,
        sources: [
          { id: "style_alpha", kind: "refero-style" as const, role: "primary" as const },
          { id: "screen_beta", kind: "refero-screen" as const, role: "supporting" as const },
        ],
      },
      preserveTraits: ["Strong hero", "Proof rhythm"],
      rhythm: "alternating" as const,
      density: "comfortable" as const,
      surfaceArc: ["base", "raised"] as const,
      mediaTreatment: "contained" as const,
      componentAnatomy: ["headline", "supporting-copy", "primary-action"] as const,
      rejects: ["Generic card wall"],
      motion: { intent: "subtle" as const, reducedMotion: "static" as const },
    },
    referenceTrace: {
      mode: "selected" as const,
      sources: [
        { alias: "style_alpha", sourceKind: "refero-style" as const, rawReferoId: "raw/style:alpha", traits: ["Strong hero"] },
        { alias: "screen_beta", sourceKind: "refero-screen" as const, rawReferoId: "raw/screen:beta", traits: ["Proof rhythm"] },
      ],
    },
    layoutProgram: {
      schemaVersion: 1 as const,
      rootNodeId: "document",
      nodes: [
        { id: "document", kind: "document" as const, childIds: ["header", "main", "footer"], responsive: responsive() },
        { id: "header", kind: "landmark" as const, landmark: "header" as const, childIds: ["navigation"], responsive: responsive() },
        { id: "navigation", kind: "landmark" as const, landmark: "navigation" as const, childIds: ["nav-action"], responsive: responsive() },
        { id: "nav-action", kind: "slot" as const, slotType: "action" as const },
        { id: "main", kind: "landmark" as const, landmark: "main" as const, childIds: [...sections], responsive: responsive() },
        ...sectionNodes,
        { id: "footer", kind: "landmark" as const, landmark: "footer" as const, childIds: ["footer-text"], responsive: responsive() },
        { id: "footer-text", kind: "slot" as const, slotType: "text" as const },
      ],
    },
    slotBindings: [
      { nodeId: "nav-action", kind: "action" as const, labelContentId: "nav-label", actionId: "scroll-main" },
      { nodeId: "page-h1", kind: "heading" as const, contentId: "page-title" },
      { nodeId: `${firstSection}-text`, kind: "text" as const, contentId: `${firstSection}-copy` },
      { nodeId: "hero-media", kind: "media" as const, assetId: "hero-image", decorative: false, altText: "Team at work" },
      { nodeId: "hero-action", kind: "action" as const, labelContentId: "call-label", actionId: "call-primary" },
      ...sections.slice(1).map((sectionId) => ({ nodeId: `${sectionId}-text`, kind: "text" as const, contentId: `${sectionId}-copy` })),
      { nodeId: "footer-text", kind: "text" as const, contentId: "footer-copy" },
    ],
    nodeTokenBindings: [{ nodeId: "document", tokens: { color: "color-primary" } }],
    accessibility: { language: "en-US", titleContentId: "page-title", navigationNodeId: "navigation", mainNodeId: "main", skipToNodeId: "main" },
  };
}

function contentArtifact(purpose: PagePurposeV1) {
  const sections = PURPOSE_SECTIONS[purpose];
  return {
    schemaVersion: 1 as const,
    sourceLayoutDecisionVersion: VERSIONS["layout-decision"],
    content: [
      { id: "page-title", kind: "heading" as const, text: `${purpose} title` },
      { id: "nav-label", kind: "text" as const, text: "Skip to content" },
      { id: "call-label", kind: "text" as const, text: "Call us" },
      { id: "footer-copy", kind: "text" as const, text: "Local and accountable" },
      ...sections.map((sectionId) => ({ id: `${sectionId}-copy`, kind: "text" as const, text: `Purpose-specific copy for ${sectionId}` })),
    ],
    actions: [
      { id: "scroll-main", kind: "scroll-to" as const, targetNodeId: sections[0] },
      { id: "call-primary", kind: "call" as const, phone: "+1 555 010 0400" },
    ],
  };
}

function artifactValues(purpose: PagePurposeV1 = "brochure-local-service") {
  const approvedEvidenceIds = ["market-claim", "refero-claim", "client-claim"];
  const tokens = designTokens();
  const inventory = buildTokenInventory(tokens, VERSIONS["design-contract"], approvedEvidenceIds);
  const plan = buildTailwindPlan(inventory, VERSIONS["token-inventory"]);
  return {
    evidence: {
      projectTarget: "website",
      businessIntelligence: {
        kind: "business-intelligence",
        claims: [{ id: "market-claim", statement: "Buyers need proof", classification: "observed", sourceIds: [], confidence: 1 }],
      },
      referoDesignEvidence: {
        kind: "refero-design-evidence",
        references: [
          { referoId: "raw/style:alpha", name: "Style Alpha", learningRationale: "Strong hierarchy", reusablePatterns: ["Strong hero"] },
          { referoId: "raw/screen:beta", name: "Screen Beta", learningRationale: "Proof sequence", reusablePatterns: ["Proof rhythm"] },
        ],
        claims: [{ id: "refero-claim", statement: "Reference traits selected", classification: "observed", sourceIds: [], confidence: 1 }],
      },
      clientEvidence: {
        claims: [{ id: "client-claim", statement: "Client owns direction", classification: "observed", sourceIds: [], confidence: 1 }],
      },
    },
    "design-contract": {
      title: "Approved design contract",
      contractPath: "evidence/versions/design-contract/v3.DESIGN.md",
      sourceLedgerVersion: VERSIONS.evidence,
      approvedEvidenceIds,
      exportPaths: ["evidence/versions/design-contract/v3.tailwind.css"],
      contractSha256: "a".repeat(64),
      exportSha256: "b".repeat(64),
      designTokens: tokens,
    },
    "token-inventory": inventory,
    "tailwind-plan": plan,
    "css-architecture": { sourceTailwindPlanVersion: VERSIONS["tailwind-plan"], cssVariableHierarchy: [], tokenToComponentUsage: {}, styleScopes: {} },
    "layout-decision": layoutDecision(purpose),
    content: contentArtifact(purpose),
    assets: {
      schemaVersion: 1 as const,
      sourceLayoutDecisionVersion: VERSIONS["layout-decision"],
      assets: [{ id: "hero-image", kind: "image" as const, sha256: "c".repeat(64), mediaType: "image/webp" as const, width: 1_600, height: 900, sizeBytes: 250_000 }],
    },
  };
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function binding(kind: keyof ReturnType<typeof artifactValues>, value: unknown, runId = RUN_ID, version = VERSIONS[kind]) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return { kind, runId, version, approvalState: "approved" as const, sha256: sha256(bytes), bytes };
}

function request(purpose: PagePurposeV1 = "brochure-local-service") {
  const values = artifactValues(purpose);
  return {
    schemaVersion: 1 as const,
    runId: RUN_ID,
    bindings: PAGE_IR_DERIVATION_KINDS.map((kind) => binding(kind, values[kind])),
  };
}

function decodeBinding(value: ReturnType<typeof request>, kind: string) {
  const selected = value.bindings.find((candidate) => candidate.kind === kind);
  if (!selected) throw new Error("fixture binding missing");
  return JSON.parse(new TextDecoder().decode(selected.bytes)) as Record<string, unknown>;
}

function replaceArtifact(value: ReturnType<typeof request>, kind: keyof ReturnType<typeof artifactValues>, mutate: (artifact: Record<string, unknown>) => void) {
  const index = value.bindings.findIndex((candidate) => candidate.kind === kind);
  const artifact = decodeBinding(value, kind);
  mutate(artifact);
  value.bindings[index] = binding(kind, artifact) as never;
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, nested]) => [key, reverseObjectKeys(nested)]));
}

describe("derivePageIRV1", () => {
  it("rejects an incomplete explicit binding set", () => {
    expect(() => derivePageIRV1({ schemaVersion: 1, runId: RUN_ID, bindings: [] })).toThrow(/binding set/i);
  });

  it("derives an exact validated Page IR and fixed-order timestamp-free lineage", () => {
    const input = request("campaign-landing");
    const result = derivePageIRV1(input);
    expect(PageIRV1Schema.parse(result.pageIr)).toEqual(result.pageIr);
    expect(result.pageIrSha256).toBe(pageIrSha256(result.pageIr));
    expect(pageIrSha256(result.pageIr)).toBe(purePageIrSha256(result.pageIr));
    expect(result.lineage.runId).toBe(input.runId);
    expect(result.lineage.purpose).toBe("campaign-landing");
    expect(result.lineage.sources).toHaveLength(8);
    for (const [index, kind] of PAGE_IR_DERIVATION_KINDS.entries()) {
      const source = input.bindings.find((candidate) => candidate.kind === kind)!;
      expect(result.lineage.sources[index]).toEqual({
        kind,
        version: source.version,
        sha256: source.sha256,
      });
      expect(source.runId).toBe(result.lineage.runId);
    }
    expect(JSON.stringify(result.lineage)).not.toMatch(/createdAt|generatedAt|timestamp/i);
    expect(result.lineage.referenceTrace.sources[0]).toMatchObject({ alias: "style_alpha", rawReferoId: "raw/style:alpha", traits: ["Strong hero"] });
  });

  it("projects exact token IDs and categories stably across token-inventory key order", () => {
    const original = request();
    const reordered = request();
    const tokenIndex = reordered.bindings.findIndex((source) => source.kind === "token-inventory");
    const originalTokenSource = original.bindings[tokenIndex];
    const tokenValue = reverseObjectKeys(decodeBinding(reordered, "token-inventory"));
    reordered.bindings[tokenIndex] = binding("token-inventory", tokenValue) as never;

    const expectedTokens = [
      { id: "color-primary", category: "color" },
      { id: "font-body", category: "typography" },
      { id: "text-body", category: "typography" },
      { id: "space-sm", category: "spacing" },
      { id: "radius-sm", category: "radius" },
      { id: "shadow-raised", category: "shadow" },
      { id: "layout-section-gap", category: "spacing" },
      { id: "layout-card-padding", category: "spacing" },
      { id: "motion-ease", category: "motion" },
      { id: "motion-duration-micro", category: "motion" },
      { id: "motion-duration-reveal", category: "motion" },
    ];
    const first = derivePageIRV1(original);
    const second = derivePageIRV1(reordered);
    expect(first.pageIr.tokens).toEqual(expectedTokens);
    expect(second.pageIr.tokens).toEqual(expectedTokens);
    expect(reordered.bindings[tokenIndex].sha256).not.toBe(originalTokenSource.sha256);
    expect(second.pageIrSha256).toBe(first.pageIrSha256);
  });

  it("hashes canonical object keys while preserving array order", () => {
    const original = request();
    const reordered = request();
    reordered.bindings = reordered.bindings.map((source) => {
      const value = reverseObjectKeys(JSON.parse(new TextDecoder().decode(source.bytes)));
      return binding(source.kind, value) as never;
    });
    const first = derivePageIRV1(original);
    const second = derivePageIRV1(reordered);
    expect(second.pageIr).toEqual(first.pageIr);
    expect(second.pageIrSha256).toBe(first.pageIrSha256);
    const reversedContent = request();
    replaceArtifact(reversedContent, "content", (artifact) => { artifact.content = [...(artifact.content as unknown[])].reverse(); });
    expect(derivePageIRV1(reversedContent).pageIrSha256).not.toBe(first.pageIrSha256);
  });

  it("does not mutate the request or exact input bytes", () => {
    const input = request();
    const before = structuredClone(input);
    derivePageIRV1(input);
    expect(input).toEqual(before);
  });

  it.each(PAGE_IR_DERIVATION_KINDS.flatMap((kind) =>
    ["draft", "in-review", "revision-requested", "superseded"].map(
      (approvalState) => [kind, approvalState] as const,
    ),
  ))("rejects non-approved %s binding state %s", (kind, approvalState) => {
    const input = request();
    input.bindings.find((candidate) => candidate.kind === kind)!.approvalState = approvalState as never;
    expectDerivationError(input, "Every Page IR artifact binding must be approved");
  });

  it("rejects cross-run bindings with the run-ID error", () => {
    const input = request(); input.bindings[0].runId = "other-run";
    expectDerivationError(input, "Every Page IR artifact binding must use the requested run ID");
  });

  it("rejects non-positive versions and malformed SHA fields at the request schema", () => {
    const badVersion = request(); badVersion.bindings[0].version = 0 as never;
    expectDerivationError(badVersion, "Invalid Page IR derivation request");
    const malformedSha = request(); malformedSha.bindings[0].sha256 = "not-a-sha";
    expectDerivationError(malformedSha, "Invalid Page IR derivation request");
  });

  it("rejects an exact-byte SHA mismatch before parsing", () => {
    const input = request(); input.bindings[0].sha256 = "0".repeat(64);
    expectDerivationError(input, "Exact-byte SHA-256 mismatch for evidence artifact");
  });

  it("rejects malformed artifact JSON without echoing it", () => {
    const input = request();
    input.bindings[0].bytes = new TextEncoder().encode("{ hostile-secret");
    input.bindings[0].sha256 = sha256(input.bindings[0].bytes);
    expectDerivationError(input, "Invalid evidence artifact JSON");
  });

  it("separates source-schema rejection from the Website policy", () => {
    const invalidSchema = request();
    replaceArtifact(invalidSchema, "evidence", (artifact) => { artifact.projectTarget = "unknown-target"; });
    expectDerivationError(invalidSchema, "Invalid evidence artifact schema");
    const nonWebsite = request();
    replaceArtifact(nonWebsite, "evidence", (artifact) => { artifact.projectTarget = "web-app"; });
    expectDerivationError(nonWebsite, "Page IR evidence target must be website");
  });

  it("rejects an opaque assembled Page IR field at the closed request schema", () => {
    expectDerivationError(
      { ...request(), pageIr: { invented: true } },
      "Invalid Page IR derivation request",
    );
  });

  it("rejects missing, duplicate, and unknown artifact kinds", () => {
    const missing = request(); missing.bindings.pop();
    const duplicate = request(); duplicate.bindings[6] = structuredClone(duplicate.bindings[0]);
    const unknown = request(); unknown.bindings[0].kind = "latest-evidence" as never;
    for (const input of [missing, duplicate, unknown]) expect(() => derivePageIRV1(input)).toThrow(/binding set|kind/i);
  });

  it.each([
    ["design-contract", "sourceLedgerVersion"], ["token-inventory", "sourceContractVersion"],
    ["tailwind-plan", "sourceTokenInventoryVersion"], ["css-architecture", "sourceTailwindPlanVersion"],
    ["content", "sourceLayoutDecisionVersion"], ["assets", "sourceLayoutDecisionVersion"],
  ] as const)("rejects a mismatched %s.%s version link", (kind, field) => {
    const input = request(); replaceArtifact(input, kind, (artifact) => { artifact[field] = 999; });
    expectDerivationError(input, "Page IR artifact version chain is inconsistent");
  });

  it.each(["evidence", "designContract", "tokenInventory", "tailwindPlan", "cssArchitecture"] as const)("rejects a mismatched layout source version for %s", (field) => {
    const input = request();
    replaceArtifact(input, "layout-decision", (artifact) => { (artifact.sourceVersions as Record<string, unknown>)[field] = 999; });
    expectDerivationError(input, "Page IR artifact version chain is inconsistent");
  });

  it("rejects design IDs and token/Tailwind attribution swaps", () => {
    const unknownEvidence = request();
    replaceArtifact(unknownEvidence, "design-contract", (artifact) => { artifact.approvedEvidenceIds = ["invented-evidence"]; });
    expect(() => derivePageIRV1(unknownEvidence)).toThrow(/evidence/i);
    const tokenSwap = request();
    replaceArtifact(tokenSwap, "token-inventory", (artifact) => { (artifact.tokens as Array<Record<string, unknown>>)[0].sourceEvidenceIds = ["client-claim", "refero-claim", "market-claim"]; });
    expect(() => derivePageIRV1(tokenSwap)).toThrow(/token inventory/i);
    const tailwindSwap = request();
    replaceArtifact(tailwindSwap, "tailwind-plan", (artifact) => {
      const mappings = artifact.themeMappings as Array<Record<string, unknown>>;
      [mappings[0].tailwindName, mappings[1].tailwindName] = [mappings[1].tailwindName, mappings[0].tailwindName];
    });
    expect(() => derivePageIRV1(tailwindSwap)).toThrow(/Tailwind/i);
  });

  it("rejects structurally valid but dangling layout, content, token, action, and asset components", () => {
    const mutations: Array<[keyof ReturnType<typeof artifactValues>, (artifact: Record<string, unknown>) => void]> = [
      ["layout-decision", (artifact) => { (artifact.slotBindings as Array<Record<string, unknown>>)[1].contentId = "invented-content"; }],
      ["layout-decision", (artifact) => { ((artifact.nodeTokenBindings as Array<Record<string, unknown>>)[0].tokens as Record<string, unknown>).color = "invented-token"; }],
      ["content", (artifact) => { artifact.actions = []; }],
      ["assets", (artifact) => { artifact.assets = []; }],
      ["layout-decision", (artifact) => {
        const nodes = (artifact.layoutProgram as { nodes: Array<Record<string, unknown>> }).nodes;
        const section = nodes.find((node) => node.id === "hero")!;
        section.childIds = (section.childIds as string[]).map((id) => id === "hero-action" ? "renamed-action" : id);
        nodes.find((node) => node.id === "hero-action")!.id = "renamed-action";
      }],
    ];
    for (const [kind, mutate] of mutations) {
      const input = request(); replaceArtifact(input, kind, mutate);
      expectDerivationError(input, "Derived Page IR failed closed validation");
    }
  });

  it("rejects structurally valid reference alias, kind, raw-ID, and trait attribution failures", () => {
    const mutations: Array<[(decision: Record<string, unknown>) => void, string]> = [
      [(decision) => { (decision.referenceTrace as { sources: Array<Record<string, unknown>> }).sources[0].alias = "invented_alias"; }, "Reference trace aliases and kinds must match selected references"],
      [(decision) => { (decision.referenceTrace as { sources: Array<Record<string, unknown>> }).sources[0].sourceKind = "refero-screen"; }, "Reference trace aliases and kinds must match selected references"],
      [(decision) => { (decision.referenceTrace as { sources: Array<Record<string, unknown>> }).sources[0].rawReferoId = "unknown/raw:id"; }, "Reference trace raw IDs must exist in approved evidence"],
      [(decision) => {
        const sources = (decision.referenceTrace as { sources: Array<Record<string, unknown>> }).sources;
        [sources[0].rawReferoId, sources[1].rawReferoId] = [sources[1].rawReferoId, sources[0].rawReferoId];
      }, "Reference trace traits must be attributed to their approved evidence"],
      [(decision) => { (decision.referenceTrace as { sources: Array<Record<string, unknown>> }).sources[0].traits = ["Proof rhythm"]; }, "Reference trace traits must be attributed to their approved evidence"],
    ];
    for (const [mutate, message] of mutations) {
      const input = request(); replaceArtifact(input, "layout-decision", mutate);
      expectDerivationError(input, message);
    }
  });

  it("keeps schema-invalid duplicate reference traces separate from attribution failures", () => {
    const input = request();
    replaceArtifact(input, "layout-decision", (decision) => {
      const sources = (decision.referenceTrace as { sources: Array<Record<string, unknown>> }).sources;
      sources.push({ ...sources[0] });
    });
    expectDerivationError(input, "Invalid layout-decision artifact schema");
  });

  it("accepts explicit-none only with an empty reference trace", () => {
    const valid = request();
    replaceArtifact(valid, "layout-decision", (artifact) => {
      const decision = artifact as ReturnType<typeof layoutDecision>;
      decision.referenceContract.selection = { mode: "explicit-none", reason: "Client requested an original direction" } as never;
      decision.referenceTrace = { mode: "explicit-none", sources: [] } as never;
    });
    expect(() => derivePageIRV1(valid)).not.toThrow();
    const invalid = request();
    replaceArtifact(invalid, "layout-decision", (artifact) => {
      const decision = artifact as ReturnType<typeof layoutDecision>;
      decision.referenceContract.selection = { mode: "explicit-none", reason: "Client requested an original direction" } as never;
      decision.referenceTrace = { mode: "explicit-none", sources: [{ alias: "style_alpha" }] } as never;
    });
    expect(() => derivePageIRV1(invalid)).toThrow(/reference|layout-decision/i);
  });

  it("rejects normalized token-ID collisions instead of suffixing by order", () => {
    expect(() => projectPageTokensV1({
      sourceContractVersion: 1,
      tokens: [
        { semanticName: "--color-collision", value: "#111", usage: "A", category: "color", sourceEvidenceIds: [], editable: true },
        { semanticName: "--color--collision", value: "#222", usage: "B", category: "color", sourceEvidenceIds: [], editable: true },
      ],
    })).toThrow(/collision/i);
  });

  it("returns bounded errors without echoing hostile artifact bytes", () => {
    const input = request();
    const hostile = `{"secret":"${"do-not-echo".repeat(2_000)}"`;
    input.bindings[0].bytes = new TextEncoder().encode(hostile);
    input.bindings[0].sha256 = sha256(input.bindings[0].bytes);
    try {
      derivePageIRV1(input);
      throw new Error("expected derivation failure");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message.length).toBeLessThanOrEqual(240);
      expect(message).not.toContain("do-not-echo");
    }
  });

  it.each(Object.entries(PURPOSE_SECTIONS) as Array<[PagePurposeV1, readonly string[]]>) ("preserves the materially distinct %s main topology", (purpose, expectedSections) => {
    const { pageIr, lineage } = derivePageIRV1(request(purpose));
    const main = pageIr.layoutProgram.nodes.find((node) => node.kind === "landmark" && node.landmark === "main");
    expect(main && "childIds" in main ? main.childIds : []).toEqual(expectedSections);
    expect(lineage.purpose).toBe(purpose);
  });
});

describe("authoritative Page IR derivation artifact contracts", () => {
  it("parses only closed numeric-v1 layout, content, and asset artifacts", () => {
    const values = artifactValues();
    expect(PageIrLayoutDecisionV1Schema.parse(values["layout-decision"])).toEqual(values["layout-decision"]);
    expect(PageIrContentV1Schema.parse(values.content)).toEqual(values.content);
    expect(PageIrAssetsV1Schema.parse(values.assets)).toEqual(values.assets);
    expect(PageIrLayoutDecisionV1Schema.safeParse({ ...values["layout-decision"], generatedAt: "now" }).success).toBe(false);
  });
});
