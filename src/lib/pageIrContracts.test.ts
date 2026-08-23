import { describe, expect, it } from "vitest";
import {
  LayoutProgramV1Schema,
  PAGE_IR_BOUNDS,
  PageIRV1Schema,
  ReferenceContractV1Schema,
} from "./contracts";

const flow = (kind: "stack" | "row" | "grid" | "overlay" = "stack") =>
  kind === "grid" ? { flow: kind, columns: 2 } : { flow: kind };

const responsive = () => ({
  small: flow("stack"),
  medium: flow("row"),
  large: flow("grid"),
});

function validReference() {
  return {
    schemaVersion: 1 as const,
    selection: {
      mode: "selected" as const,
      sources: [
        { id: "style_alpha", kind: "refero-style" as const, role: "primary" as const },
        { id: "screen_beta", kind: "refero-screen" as const, role: "supporting" as const },
      ],
    },
    preserveTraits: ["Clear hierarchy", "Warm editorial spacing"],
    rhythm: "alternating" as const,
    density: "comfortable" as const,
    surfaceArc: ["base", "raised", "accent"] as const,
    mediaTreatment: "contained" as const,
    componentAnatomy: ["eyebrow", "headline", "supporting-copy", "primary-action"] as const,
    rejects: ["Unbounded card grids"],
    motion: {
      intent: "subtle" as const,
      reducedMotion: "static" as const,
    },
  };
}

function validLayout() {
  return {
    schemaVersion: 1 as const,
    rootNodeId: "document",
    nodes: [
      { id: "document", kind: "document" as const, childIds: ["header", "main", "footer"], responsive: responsive() },
      { id: "header", kind: "landmark" as const, landmark: "header" as const, childIds: ["navigation"], responsive: responsive() },
      { id: "navigation", kind: "landmark" as const, landmark: "navigation" as const, childIds: ["nav_group"], responsive: responsive() },
      { id: "nav_group", kind: "group" as const, childIds: ["nav_scroll"], responsive: responsive() },
      { id: "nav_scroll", kind: "slot" as const, slotType: "action" as const },
      { id: "main", kind: "landmark" as const, landmark: "main" as const, childIds: ["hero", "details"], responsive: responsive() },
      { id: "hero", kind: "section" as const, childIds: ["hero_group"], responsive: responsive() },
      {
        id: "hero_group",
        kind: "group" as const,
        childIds: ["hero_h1", "hero_text", "hero_media", "call_action", "email_action", "external_action"],
        responsive: responsive(),
      },
      { id: "hero_h1", kind: "slot" as const, slotType: "heading" as const, level: 1 as const },
      { id: "hero_text", kind: "slot" as const, slotType: "text" as const },
      { id: "hero_media", kind: "slot" as const, slotType: "media" as const },
      { id: "call_action", kind: "slot" as const, slotType: "action" as const },
      { id: "email_action", kind: "slot" as const, slotType: "action" as const },
      { id: "external_action", kind: "slot" as const, slotType: "action" as const },
      { id: "details", kind: "section" as const, childIds: ["details_heading", "details_list"], responsive: responsive() },
      { id: "details_heading", kind: "slot" as const, slotType: "heading" as const, level: 2 as const },
      { id: "details_list", kind: "slot" as const, slotType: "list" as const, ordered: false },
      { id: "footer", kind: "landmark" as const, landmark: "footer" as const, childIds: ["footer_text"], responsive: responsive() },
      { id: "footer_text", kind: "slot" as const, slotType: "text" as const },
    ],
  };
}

function validPageIr() {
  return {
    schemaVersion: 1 as const,
    target: "website" as const,
    referenceContract: validReference(),
    layoutProgram: validLayout(),
    content: [
      { id: "title_content", kind: "heading" as const, text: "Acme Fiber" },
      { id: "details_title", kind: "heading" as const, text: "Built for the block" },
      { id: "hero_copy", kind: "text" as const, text: "Markup-looking text like <script> remains inert content." },
      { id: "footer_copy", kind: "text" as const, text: "Serving the local area." },
      { id: "nav_label", kind: "text" as const, text: "Skip to details" },
      { id: "call_label", kind: "text" as const, text: "Call now" },
      { id: "email_label", kind: "text" as const, text: "Email us" },
      { id: "external_label", kind: "text" as const, text: "Read our guide" },
      { id: "benefits", kind: "list" as const, items: ["Fast", "Local", "Reliable"] },
    ],
    tokens: [
      { id: "color_primary", category: "color" as const },
      { id: "type_heading", category: "typography" as const },
      { id: "space_section", category: "spacing" as const },
      { id: "radius_card", category: "radius" as const },
      { id: "shadow_card", category: "shadow" as const },
      { id: "motion_reveal", category: "motion" as const },
    ],
    assets: [
      {
        id: "hero_image",
        kind: "image" as const,
        sha256: "a".repeat(64),
        mediaType: "image/webp" as const,
        width: 1600,
        height: 900,
        sizeBytes: 250_000,
      },
    ],
    actions: [
      { id: "scroll_details", kind: "scroll-to" as const, targetNodeId: "details" },
      { id: "call_main", kind: "call" as const, phone: "+1 555 010 0200" },
      { id: "email_main", kind: "email" as const, email: "hello@example.com" },
      { id: "external_guide", kind: "external" as const, href: "https://example.com/guide" },
    ],
    slotBindings: [
      { nodeId: "nav_scroll", kind: "action" as const, labelContentId: "nav_label", actionId: "scroll_details" },
      { nodeId: "hero_h1", kind: "heading" as const, contentId: "title_content" },
      { nodeId: "hero_text", kind: "text" as const, contentId: "hero_copy" },
      { nodeId: "hero_media", kind: "media" as const, assetId: "hero_image", decorative: false, altText: "Technician installing fiber" },
      { nodeId: "call_action", kind: "action" as const, labelContentId: "call_label", actionId: "call_main" },
      { nodeId: "email_action", kind: "action" as const, labelContentId: "email_label", actionId: "email_main" },
      { nodeId: "external_action", kind: "action" as const, labelContentId: "external_label", actionId: "external_guide" },
      { nodeId: "details_heading", kind: "heading" as const, contentId: "details_title" },
      { nodeId: "details_list", kind: "list" as const, contentId: "benefits" },
      { nodeId: "footer_text", kind: "text" as const, contentId: "footer_copy" },
    ],
    nodeTokenBindings: [
      {
        nodeId: "document",
        tokens: {
          color: "color_primary",
          typography: "type_heading",
          spacing: "space_section",
          radius: "radius_card",
          shadow: "shadow_card",
          motion: "motion_reveal",
        },
      },
    ],
    accessibility: {
      language: "en-US",
      titleContentId: "title_content",
      navigationNodeId: "navigation",
      mainNodeId: "main",
      skipToNodeId: "main",
    },
  };
}

const clone = <T>(value: T): T => structuredClone(value);

describe("ReferenceContractV1Schema", () => {
  it("accepts selected Refero style and screen identities", () => {
    expect(ReferenceContractV1Schema.parse(validReference())).toEqual(validReference());
  });

  it("accepts an explicit no-reference decision without invented sources", () => {
    const value = validReference();
    value.selection = { mode: "explicit-none", reason: "Client requested an original direction" } as never;
    expect(ReferenceContractV1Schema.safeParse(value).success).toBe(true);
  });

  it("rejects duplicate, path-bearing, oversized, or primary-less source selections", () => {
    const cases = [
      [{ id: "same", kind: "refero-style", role: "primary" }, { id: "same", kind: "refero-screen", role: "supporting" }],
      [{ id: "../screen", kind: "refero-screen", role: "primary" }],
      [{ id: "a", kind: "refero-style", role: "primary" }, { id: "b", kind: "refero-screen", role: "supporting" }, { id: "c", kind: "refero-screen", role: "supporting" }, { id: "d", kind: "refero-screen", role: "supporting" }],
      [{ id: "a", kind: "refero-style", role: "supporting" }],
    ];
    for (const sources of cases) {
      const value = validReference();
      value.selection.sources = sources as never;
      expect(ReferenceContractV1Schema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects unknown versions, fields, cross-variant fields, and prototype keys", () => {
    expect(ReferenceContractV1Schema.safeParse({ ...validReference(), schemaVersion: 2 }).success).toBe(false);
    expect(ReferenceContractV1Schema.safeParse({ ...validReference(), sourceUrl: "https://example.com" }).success).toBe(false);
    const explicit = validReference();
    explicit.selection = { mode: "explicit-none", reason: "Original", sources: [] } as never;
    expect(ReferenceContractV1Schema.safeParse(explicit).success).toBe(false);
    const proto = validReference();
    proto.selection.sources[0].id = "__proto__";
    expect(ReferenceContractV1Schema.safeParse(proto).success).toBe(false);
  });

  it("rejects whitespace-normalizing labels and duplicate semantic arrays", () => {
    const padded = validReference();
    padded.preserveTraits[0] = "  Clear hierarchy";
    expect(ReferenceContractV1Schema.safeParse(padded).success).toBe(false);

    for (const field of ["preserveTraits", "surfaceArc", "componentAnatomy", "rejects"] as const) {
      const value = validReference();
      value[field] = [value[field][0], value[field][0]] as never;
      expect(ReferenceContractV1Schema.safeParse(value).success).toBe(false);
    }
  });

  it("does not echo unknown Reference field values", () => {
    const value = validReference() as Record<string, unknown>;
    for (let index = 0; index < 64; index += 1) value[`secret_${index}`] = "hidden";
    const result = ReferenceContractV1Schema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.every((issue) => !issue.message.includes("hidden"))).toBe(true);
    }
  });
});

describe("LayoutProgramV1Schema", () => {
  it("accepts every closed node, landmark, slot, and responsive flow kind", () => {
    const layout = validLayout();
    layout.nodes.push({ id: "overlay_group", kind: "group", childIds: [], responsive: { small: flow("overlay"), medium: flow("stack"), large: flow("row") } } as never);
    (layout.nodes.find((node) => node.id === "details") as { childIds: string[] }).childIds.push("overlay_group");
    expect(LayoutProgramV1Schema.safeParse(layout).success).toBe(true);
  });

  it("rejects unknown fields, kinds, versions, and cross-variant slot properties", () => {
    expect(LayoutProgramV1Schema.safeParse({ ...validLayout(), schemaVersion: 2 }).success).toBe(false);
    expect(LayoutProgramV1Schema.safeParse({ ...validLayout(), editorId: "parallel" }).success).toBe(false);
    const unknownKind = validLayout();
    unknownKind.nodes[0] = { ...unknownKind.nodes[0], kind: "component" } as never;
    expect(LayoutProgramV1Schema.safeParse(unknownKind).success).toBe(false);
    const wrongSlot = validLayout();
    wrongSlot.nodes[8] = { ...wrongSlot.nodes[8], ordered: true } as never;
    expect(LayoutProgramV1Schema.safeParse(wrongSlot).success).toBe(false);
  });

  it("rejects duplicate IDs, dangling or duplicate children, and unsafe stable IDs", () => {
    const cases = [clone(validLayout()), clone(validLayout()), clone(validLayout()), clone(validLayout())];
    cases[0].nodes[1].id = "document";
    (cases[1].nodes[0] as { childIds: string[] }).childIds.push("missing");
    (cases[2].nodes[0] as { childIds: string[] }).childIds.push("header");
    cases[3].nodes[1].id = "constructor";
    for (const value of cases) expect(LayoutProgramV1Schema.safeParse(value).success).toBe(false);
  });

  it("rejects self and indirect cycles, multiple parents, orphans, and excessive depth", () => {
    const self = validLayout();
    (self.nodes.find((node) => node.id === "hero") as { childIds: string[] }).childIds.push("hero");
    const cycle = validLayout();
    (cycle.nodes.find((node) => node.id === "hero_group") as { childIds: string[] }).childIds.push("hero");
    const multiParent = validLayout();
    (multiParent.nodes.find((node) => node.id === "footer") as { childIds: string[] }).childIds.push("hero_text");
    const orphan = validLayout();
    orphan.nodes.push({ id: "orphan", kind: "group", childIds: [], responsive } as never);
    const deep = validLayout();
    const details = deep.nodes.find((node) => node.id === "details") as { childIds: string[] };
    details.childIds = ["deep_1"];
    for (let index = 1; index <= PAGE_IR_BOUNDS.maxDepth; index += 1) {
      deep.nodes.push({ id: `deep_${index}`, kind: "group", childIds: index === PAGE_IR_BOUNDS.maxDepth ? ["details_heading", "details_list"] : [`deep_${index + 1}`], responsive: responsive() } as never);
    }
    for (const value of [self, cycle, multiParent, orphan, deep]) {
      expect(LayoutProgramV1Schema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects illegal nesting and missing, duplicate, or misplaced landmarks and H1", () => {
    const illegal = validLayout();
    (illegal.nodes.find((node) => node.id === "document") as { childIds: string[] }).childIds.push("hero_text");
    const noNav = validLayout();
    noNav.nodes = noNav.nodes.filter((node) => node.id !== "navigation" && node.id !== "nav_group" && node.id !== "nav_scroll");
    (noNav.nodes.find((node) => node.id === "header") as { childIds: string[] }).childIds = [];
    const misplacedSection = validLayout();
    (misplacedSection.nodes.find((node) => node.id === "header") as { childIds: string[] }).childIds.push("details");
    (misplacedSection.nodes.find((node) => node.id === "main") as { childIds: string[] }).childIds = ["hero"];
    const noH1 = validLayout();
    (noH1.nodes.find((node) => node.id === "hero_h1") as { level: number }).level = 2;
    const twoH1 = validLayout();
    (twoH1.nodes.find((node) => node.id === "details_heading") as { level: number }).level = 1;
    for (const value of [illegal, noNav, misplacedSection, noH1, twoH1]) {
      expect(LayoutProgramV1Schema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects sections nested inside other sections", () => {
    const nested = validLayout();
    (nested.nodes.find((node) => node.id === "main") as { childIds: string[] }).childIds = ["hero"];
    (nested.nodes.find((node) => node.id === "hero") as { childIds: string[] }).childIds.push("details");
    expect(LayoutProgramV1Schema.safeParse(nested).success).toBe(false);
  });

  it("enforces node, child, grid-column, and depth bounds", () => {
    const tooManyNodes = validLayout();
    for (let index = tooManyNodes.nodes.length; index <= PAGE_IR_BOUNDS.maxNodes; index += 1) {
      tooManyNodes.nodes.push({ id: `orphan_${index}`, kind: "group", childIds: [], responsive: responsive() } as never);
    }
    expect(LayoutProgramV1Schema.safeParse(tooManyNodes).success).toBe(false);
    const tooManyChildren = validLayout();
    (tooManyChildren.nodes[0] as { childIds: string[] }).childIds = Array.from({ length: PAGE_IR_BOUNDS.maxChildren + 1 }, (_, index) => `missing_${index}`);
    expect(LayoutProgramV1Schema.safeParse(tooManyChildren).success).toBe(false);
    const badGrid = validLayout();
    (badGrid.nodes[0] as { responsive: { large: { columns: number } } }).responsive.large.columns = 13;
    expect(LayoutProgramV1Schema.safeParse(badGrid).success).toBe(false);
  });

  it("caps actionable graph issues without echoing hostile values", () => {
    const value = validLayout();
    (value.nodes[0] as { childIds: string[] }).childIds = Array.from({ length: PAGE_IR_BOUNDS.maxChildren }, (_, index) => `missing_secret_${index}`);
    (value.nodes.find((node) => node.id === "main") as { childIds: string[] }).childIds = Array.from({ length: PAGE_IR_BOUNDS.maxChildren }, (_, index) => `other_secret_${index}`);
    const result = LayoutProgramV1Schema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeLessThanOrEqual(PAGE_IR_BOUNDS.maxCustomIssues + 1);
      expect(result.error.issues.some((issue) => issue.message.includes("omitted"))).toBe(true);
      expect(result.error.issues.every((issue) => issue.path.length > 0)).toBe(true);
      expect(result.error.issues.every((issue) => !issue.message.includes("missing_secret"))).toBe(true);
    }
  });
});

describe("PageIRV1Schema", () => {
  it("accepts a complete website IR with all registries, bindings, and safe action kinds", () => {
    const value = validPageIr();
    const result = PageIRV1Schema.safeParse(value);
    expect(
      result.success,
      result.success ? "" : JSON.stringify(result.error.issues)
    ).toBe(true);
    expect(PageIRV1Schema.parse(value)).toEqual(value);
  });

  it("rejects non-v1, non-website, unknown top-level and nested executable or path-bearing fields", () => {
    const cases: unknown[] = [
      { ...validPageIr(), schemaVersion: 2 },
      { ...validPageIr(), target: "web-app" },
      { ...validPageIr(), html: "<main />" },
    ];
    for (const field of ["script", "style", "onClick", "className", "filePath", "command", "dataUrl"]) {
      const value = validPageIr();
      value.content[0] = { ...value.content[0], [field]: "hostile" } as never;
      cases.push(value);
    }
    for (const value of cases) expect(PageIRV1Schema.safeParse(value).success).toBe(false);
  });

  it("bounds and sanitizes custom referential validation errors", () => {
    const value = validPageIr();
    value.nodeTokenBindings = Array.from({ length: 64 }, (_, index) => ({
      nodeId: `missing_secret_${index}`,
      tokens: { color: "color_primary" },
    })) as never;
    const result = PageIRV1Schema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeLessThanOrEqual(PAGE_IR_BOUNDS.maxCustomIssues + 1);
      expect(result.error.issues.some((issue) => issue.message.includes("omitted"))).toBe(true);
      expect(result.error.issues.every((issue) => issue.path.length > 0)).toBe(true);
      expect(result.error.issues.every((issue) => !issue.message.includes("missing_secret"))).toBe(true);
    }
  });

  it("allows markup-looking characters only as inert bounded plain text", () => {
    const value = validPageIr();
    value.content[2].text = "<script>alert('not executed')</script> ../../shown as copy";
    const result = PageIRV1Schema.safeParse(value);
    expect(
      result.success,
      result.success ? "" : JSON.stringify(result.error.issues)
    ).toBe(true);
    value.content[2].text = "x".repeat(PAGE_IR_BOUNDS.maxTextLength + 1);
    expect(PageIRV1Schema.safeParse(value).success).toBe(false);
  });

  it("rejects duplicate registry IDs and dangling content, token, asset, action, or node references", () => {
    const mutations = [
      (value: ReturnType<typeof validPageIr>) => value.content.push(clone(value.content[0])),
      (value: ReturnType<typeof validPageIr>) => { value.slotBindings[0].labelContentId = "missing_content"; },
      (value: ReturnType<typeof validPageIr>) => { value.nodeTokenBindings[0].tokens.color = "missing_token"; },
      (value: ReturnType<typeof validPageIr>) => { (value.slotBindings[3] as { assetId: string }).assetId = "missing_asset"; },
      (value: ReturnType<typeof validPageIr>) => { (value.slotBindings[4] as { actionId: string }).actionId = "missing_action"; },
      (value: ReturnType<typeof validPageIr>) => { value.nodeTokenBindings[0].nodeId = "missing_node"; },
    ];
    for (const mutate of mutations) {
      const value = validPageIr();
      mutate(value);
      expect(PageIRV1Schema.safeParse(value).success).toBe(false);
    }
  });

  it("requires exactly one kind-matching binding for every slot", () => {
    const missing = validPageIr();
    missing.slotBindings.pop();
    const duplicate = validPageIr();
    duplicate.slotBindings.push(clone(duplicate.slotBindings[0]));
    const mismatch = validPageIr();
    mismatch.slotBindings[1] = { nodeId: "hero_h1", kind: "text", contentId: "hero_copy" } as never;
    for (const value of [missing, duplicate, mismatch]) {
      expect(PageIRV1Schema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects token-category mismatches and duplicate node token bindings", () => {
    const mismatch = validPageIr();
    mismatch.nodeTokenBindings[0].tokens.color = "type_heading";
    const duplicate = validPageIr();
    duplicate.nodeTokenBindings.push(clone(duplicate.nodeTokenBindings[0]));
    for (const value of [mismatch, duplicate]) expect(PageIRV1Schema.safeParse(value).success).toBe(false);
  });

  it("rejects invalid scroll targets and accessibility references", () => {
    const badScroll = validPageIr();
    (badScroll.actions[0] as { targetNodeId: string }).targetNodeId = "hero_text";
    const badNav = validPageIr();
    badNav.accessibility.navigationNodeId = "header";
    const badMain = validPageIr();
    badMain.accessibility.mainNodeId = "footer";
    const badSkip = validPageIr();
    badSkip.accessibility.skipToNodeId = "hero_text";
    const badTitle = validPageIr();
    badTitle.accessibility.titleContentId = "benefits";
    for (const value of [badScroll, badNav, badMain, badSkip, badTitle]) {
      expect(PageIRV1Schema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects media alt/decorative contradictions", () => {
    const missingAlt = validPageIr();
    const binding = missingAlt.slotBindings[3] as { decorative: boolean; altText?: string };
    delete binding.altText;
    const decorativeAlt = validPageIr();
    const decorative = decorativeAlt.slotBindings[3] as { decorative: boolean; altText?: string };
    decorative.decorative = true;
    decorative.altText = "Must be absent";
    for (const value of [missingAlt, decorativeAlt]) expect(PageIRV1Schema.safeParse(value).success).toBe(false);
  });

  it("accepts only bounded external HTTPS URLs with public DNS hosts and no credentials", () => {
    const hostile = [
      "http://example.com",
      "javascript:alert(1)",
      "data:text/html;base64,AAA",
      "https://user:pass@example.com",
      "https://localhost/admin",
      "https://service.local/admin",
      "https://127.0.0.1/admin",
      "https://[::1]/admin",
      "https://10.0.0.1/admin",
      `https://example.com/${"a".repeat(PAGE_IR_BOUNDS.maxUrlLength)}`,
    ];
    for (const href of hostile) {
      const value = validPageIr();
      (value.actions[3] as { href: string }).href = href;
      const result = PageIRV1Schema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.every((issue) => !issue.message.includes(href))).toBe(true);
        expect(result.error.issues.every((issue) => issue.path.length > 0)).toBe(true);
      }
    }
  });

  it("rejects oversized registries, total text, and total asset bytes", () => {
    const tooMuchContent = validPageIr();
    for (let index = tooMuchContent.content.length; index <= PAGE_IR_BOUNDS.maxContent; index += 1) {
      tooMuchContent.content.push({ id: `copy_${index}`, kind: "text", text: "x" });
    }
    const tooMuchText = validPageIr();
    tooMuchText.content = Array.from({ length: 33 }, (_, index) => ({ id: `copy_${index}`, kind: "text", text: "x".repeat(4000) }));
    const tooManyAssetBytes = validPageIr();
    tooManyAssetBytes.assets[0].sizeBytes = PAGE_IR_BOUNDS.maxAssetBytes;
    tooManyAssetBytes.assets.push({ ...tooManyAssetBytes.assets[0], id: "second_asset", sha256: "b".repeat(64), sizeBytes: 1 });
    for (const value of [tooMuchContent, tooMuchText, tooManyAssetBytes]) {
      expect(PageIRV1Schema.safeParse(value).success).toBe(false);
    }
  });
});
