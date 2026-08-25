/**
 * Shared contracts for the one-box pipeline.
 * Every stage reads/writes these shapes; sites/<id>/run.json is the durable
 * state machine. No stage may invent fields outside these types.
 */
import { z } from "zod";

// ---------- Project and evidence workflow ----------

export const ProjectTargetSchema = z.enum(["website", "web-app", "ios-app"]);
export type ProjectTarget = z.infer<typeof ProjectTargetSchema>;
export const ProductionProjectTargetSchema = z.literal("website");
export type ProductionProjectTarget = z.infer<
  typeof ProductionProjectTargetSchema
>;

// ---------- Closed Page IR v1 contracts ----------

export const PAGE_IR_BOUNDS = {
  maxReferenceSources: 3,
  maxNodes: 256,
  maxChildren: 32,
  maxDepth: 12,
  maxContent: 256,
  maxTextLength: 4_000,
  maxTotalTextLength: 128 * 1_024,
  maxTokens: 128,
  maxAssets: 64,
  maxActions: 64,
  maxAssetBytes: 100 * 1_024 * 1_024,
  maxUrlLength: 2_048,
  maxCustomIssues: 32,
} as const;

const FORBIDDEN_IR_IDS = new Set(["__proto__", "prototype", "constructor"]);
export const PageIrEditorIdSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !FORBIDDEN_IR_IDS.has(value), {
    message: "reserved identifiers are not allowed",
  });
export type PageIrEditorId = z.infer<typeof PageIrEditorIdSchema>;

const IrIdSchema = PageIrEditorIdSchema;

const BoundedLabelSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value === value.trim(), {
    message: "labels cannot contain surrounding whitespace",
  });

const ReferenceSourceV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.enum(["refero-style", "refero-screen"]),
    role: z.enum(["primary", "supporting"]),
  })
  .strict();

const ReferenceSelectionV1Schema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("selected"),
      sources: z
        .array(ReferenceSourceV1Schema)
        .min(1)
        .max(PAGE_IR_BOUNDS.maxReferenceSources),
    })
    .strict(),
  z
    .object({
      mode: z.literal("explicit-none"),
      reason: BoundedLabelSchema,
    })
    .strict(),
]);

export const ReferenceContractV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    selection: ReferenceSelectionV1Schema,
    preserveTraits: z.array(BoundedLabelSchema).min(1).max(8),
    rhythm: z.enum(["compact", "steady", "alternating", "cinematic"]),
    density: z.enum(["airy", "comfortable", "dense"]),
    surfaceArc: z
      .array(z.enum(["base", "muted", "raised", "contrast", "accent"]))
      .min(1)
      .max(8),
    mediaTreatment: z.enum(["full-bleed", "contained", "framed", "minimal"]),
    componentAnatomy: z
      .array(
        z.enum([
          "eyebrow",
          "headline",
          "supporting-copy",
          "primary-action",
          "secondary-action",
          "media",
          "proof",
          "metadata",
        ])
      )
      .min(1)
      .max(8),
    rejects: z.array(BoundedLabelSchema).max(12),
    motion: z
      .object({
        intent: z.enum(["none", "subtle", "expressive"]),
        reducedMotion: z.literal("static"),
      })
      .strict(),
  })
  .strict()
  .superRefine((contract, context) => {
    if (contract.selection.mode === "selected") {
      const ids = contract.selection.sources.map((source) => source.id);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: "custom",
          path: ["selection", "sources"],
          message: "reference source IDs must be unique",
        });
      }
      const primaryCount = contract.selection.sources.filter(
        (source) => source.role === "primary"
      ).length;
      if (primaryCount !== 1) {
        context.addIssue({
          code: "custom",
          path: ["selection", "sources"],
          message: "selected references require exactly one primary source",
        });
      }
    }
    const semanticArrays: Array<[string, readonly string[]]> = [
      ["preserveTraits", contract.preserveTraits],
      ["surfaceArc", contract.surfaceArc],
      ["componentAnatomy", contract.componentAnatomy],
      ["rejects", contract.rejects],
    ];
    for (const [field, values] of semanticArrays) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "reference semantic arrays cannot contain duplicates",
        });
      }
    }
  });
export type ReferenceContractV1 = z.infer<typeof ReferenceContractV1Schema>;

const ResponsiveFlowV1Schema = z
  .object({
    flow: z.enum(["stack", "row", "grid", "overlay"]),
    columns: z.number().int().min(1).max(12).optional(),
  })
  .strict()
  .superRefine((intent, context) => {
    if (intent.flow === "grid" && intent.columns === undefined) {
      context.addIssue({
        code: "custom",
        path: ["columns"],
        message: "grid flow requires a column count",
      });
    }
    if (intent.flow !== "grid" && intent.columns !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["columns"],
        message: "only grid flow may declare columns",
      });
    }
  });

const ResponsiveIntentV1Schema = z
  .object({
    small: ResponsiveFlowV1Schema,
    medium: ResponsiveFlowV1Schema,
    large: ResponsiveFlowV1Schema,
  })
  .strict();

const CompositeNodeFields = {
  id: IrIdSchema,
  childIds: z.array(IrIdSchema).max(PAGE_IR_BOUNDS.maxChildren),
  responsive: ResponsiveIntentV1Schema,
};

const DocumentNodeV1Schema = z
  .object({
    ...CompositeNodeFields,
    kind: z.literal("document"),
  })
  .strict();
const LandmarkNodeV1Schema = z
  .object({
    ...CompositeNodeFields,
    kind: z.literal("landmark"),
    landmark: z.enum(["header", "navigation", "main", "footer"]),
  })
  .strict();
const SectionNodeV1Schema = z
  .object({
    ...CompositeNodeFields,
    kind: z.literal("section"),
  })
  .strict();
const GroupNodeV1Schema = z
  .object({
    ...CompositeNodeFields,
    kind: z.literal("group"),
  })
  .strict();

const HeadingSlotNodeV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("slot"),
    slotType: z.literal("heading"),
    level: z.number().int().min(1).max(6),
  })
  .strict();
const TextSlotNodeV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("slot"),
    slotType: z.literal("text"),
  })
  .strict();
const MediaSlotNodeV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("slot"),
    slotType: z.literal("media"),
  })
  .strict();
const ActionSlotNodeV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("slot"),
    slotType: z.literal("action"),
  })
  .strict();
const ListSlotNodeV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("slot"),
    slotType: z.literal("list"),
    ordered: z.boolean(),
  })
  .strict();

const SlotNodeV1Schema = z.discriminatedUnion("slotType", [
  HeadingSlotNodeV1Schema,
  TextSlotNodeV1Schema,
  MediaSlotNodeV1Schema,
  ActionSlotNodeV1Schema,
  ListSlotNodeV1Schema,
]);

const LayoutNodeV1Schema = z.union([
  DocumentNodeV1Schema,
  LandmarkNodeV1Schema,
  SectionNodeV1Schema,
  GroupNodeV1Schema,
  SlotNodeV1Schema,
]);
type LayoutNodeV1 = z.infer<typeof LayoutNodeV1Schema>;

function createBoundedIssue(
  context: z.RefinementCtx,
  limit = PAGE_IR_BOUNDS.maxCustomIssues
) {
  let count = 0;
  let omissionRecorded = false;
  return (path: PropertyKey[], message: string) => {
    if (count < limit) {
      context.addIssue({ code: "custom", path, message });
    } else if (!omissionRecorded) {
      context.addIssue({
        code: "custom",
        path: ["validation"],
        message: "additional validation issues omitted",
      });
      omissionRecorded = true;
    }
    count += 1;
  };
}

function isCompositeNode(
  node: LayoutNodeV1
): node is Exclude<LayoutNodeV1, { kind: "slot" }> {
  return node.kind !== "slot";
}

function validateLayoutProgramV1(
  layout: { rootNodeId: string; nodes: LayoutNodeV1[] },
  context: z.RefinementCtx
) {
  const issue = createBoundedIssue(context);
  const nodesById = new Map<string, LayoutNodeV1>();
  const nodeIndexes = new Map<string, number>();
  for (const [index, node] of layout.nodes.entries()) {
    if (nodesById.has(node.id)) {
      issue(["nodes", index, "id"], "layout node IDs must be unique");
      continue;
    }
    nodesById.set(node.id, node);
    nodeIndexes.set(node.id, index);
  }

  const root = nodesById.get(layout.rootNodeId);
  if (!root) {
    issue(["rootNodeId"], "layout root must reference an existing node");
  } else if (root.kind !== "document") {
    issue(["rootNodeId"], "layout root must reference the document node");
  }

  const parentCounts = new Map<string, number>();
  const childGraph = new Map<string, string[]>();
  for (const [index, node] of layout.nodes.entries()) {
    if (!isCompositeNode(node)) continue;
    childGraph.set(node.id, node.childIds);
    const localChildren = new Set<string>();
    for (const [childIndex, childId] of node.childIds.entries()) {
      if (localChildren.has(childId)) {
        issue(
          ["nodes", index, "childIds", childIndex],
          "a composite node cannot repeat a child"
        );
      }
      localChildren.add(childId);
      if (!nodesById.has(childId)) {
        issue(
          ["nodes", index, "childIds", childIndex],
          "child must reference an existing node"
        );
        continue;
      }
      parentCounts.set(childId, (parentCounts.get(childId) ?? 0) + 1);
    }
  }
  for (const [nodeId, parentCount] of parentCounts) {
    if (parentCount > 1) {
      issue(
        ["nodes", nodeIndexes.get(nodeId) ?? 0, "id"],
        "a layout node cannot have multiple parents"
      );
    }
  }

  const allowedChild = (parent: LayoutNodeV1, child: LayoutNodeV1) => {
    if (parent.kind === "document") {
      return (
        child.kind === "landmark" &&
        child.landmark !== "navigation"
      );
    }
    if (parent.kind === "group") return child.kind === "group" || child.kind === "slot";
    if (parent.kind === "section") {
      return child.kind === "group" || child.kind === "slot";
    }
    if (parent.kind !== "landmark") return false;
    if (parent.landmark === "main") return child.kind === "section";
    if (parent.landmark === "header") {
      return (
        (child.kind === "landmark" && child.landmark === "navigation") ||
        child.kind === "group" ||
        child.kind === "slot"
      );
    }
    return child.kind === "group" || child.kind === "slot";
  };

  for (const [index, parent] of layout.nodes.entries()) {
    if (!isCompositeNode(parent)) continue;
    for (const [childIndex, childId] of parent.childIds.entries()) {
      const child = nodesById.get(childId);
      if (child && !allowedChild(parent, child)) {
        issue(
          ["nodes", index, "childIds", childIndex],
          "node kind is not legal under this parent"
        );
      }
    }
  }

  const colors = new Map<string, "visiting" | "visited">();
  const reachable = new Set<string>();
  const visit = (nodeId: string, depth: number) => {
    if (depth > PAGE_IR_BOUNDS.maxDepth) {
      issue(
        ["nodes", nodeIndexes.get(nodeId) ?? 0, "id"],
        "layout depth exceeds the supported maximum"
      );
      return;
    }
    if (colors.get(nodeId) === "visiting") {
      issue(
        ["nodes", nodeIndexes.get(nodeId) ?? 0, "id"],
        "layout graph cannot contain a cycle"
      );
      return;
    }
    if (colors.get(nodeId) === "visited") return;
    colors.set(nodeId, "visiting");
    reachable.add(nodeId);
    for (const childId of childGraph.get(nodeId) ?? []) {
      if (nodesById.has(childId)) visit(childId, depth + 1);
    }
    colors.set(nodeId, "visited");
  };
  if (root) visit(root.id, 1);
  for (const [index, node] of layout.nodes.entries()) {
    if (!reachable.has(node.id)) {
      issue(["nodes", index, "id"], "layout nodes must be reachable from the root");
    }
  }

  const documents = layout.nodes.filter((node) => node.kind === "document");
  if (documents.length !== 1) {
    issue(["nodes"], "layout requires exactly one document node");
  }
  for (const landmark of ["header", "navigation", "main", "footer"] as const) {
    const count = layout.nodes.filter(
      (node) => node.kind === "landmark" && node.landmark === landmark
    ).length;
    if (count !== 1) {
      issue(["nodes"], `layout requires exactly one ${landmark} landmark`);
    }
  }

  const descendantsOf = (nodeId: string) => {
    const descendants = new Set<string>();
    const pending = [...(childGraph.get(nodeId) ?? [])];
    while (pending.length > 0) {
      const childId = pending.pop()!;
      if (descendants.has(childId)) continue;
      descendants.add(childId);
      pending.push(...(childGraph.get(childId) ?? []));
    }
    return descendants;
  };
  const header = layout.nodes.find(
    (node) => node.kind === "landmark" && node.landmark === "header"
  );
  const navigation = layout.nodes.find(
    (node) => node.kind === "landmark" && node.landmark === "navigation"
  );
  if (header && navigation && !descendantsOf(header.id).has(navigation.id)) {
    issue(["nodes", nodeIndexes.get(navigation.id) ?? 0], "navigation must descend from header");
  }
  const main = layout.nodes.find(
    (node) => node.kind === "landmark" && node.landmark === "main"
  );
  if (main) {
    const mainDescendants = descendantsOf(main.id);
    for (const [index, node] of layout.nodes.entries()) {
      if (node.kind === "section" && !mainDescendants.has(node.id)) {
        issue(["nodes", index], "sections must descend from main");
      }
    }
  }
  const h1Count = layout.nodes.filter(
    (node) => node.kind === "slot" && node.slotType === "heading" && node.level === 1
  ).length;
  if (h1Count !== 1) {
    issue(["nodes"], "layout requires exactly one level-one heading slot");
  }
}

export const LayoutProgramV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    rootNodeId: IrIdSchema,
    nodes: z.array(LayoutNodeV1Schema).min(1).max(PAGE_IR_BOUNDS.maxNodes),
  })
  .strict()
  .superRefine(validateLayoutProgramV1);
export type LayoutProgramV1 = z.infer<typeof LayoutProgramV1Schema>;

const HeadingContentV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("heading"),
    text: z.string().max(PAGE_IR_BOUNDS.maxTextLength),
  })
  .strict();
const TextContentV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("text"),
    text: z.string().max(PAGE_IR_BOUNDS.maxTextLength),
  })
  .strict();
const ListContentV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("list"),
    items: z.array(z.string().max(PAGE_IR_BOUNDS.maxTextLength)).min(1).max(64),
  })
  .strict();
export const ContentEntryV1Schema = z.discriminatedUnion("kind", [
  HeadingContentV1Schema,
  TextContentV1Schema,
  ListContentV1Schema,
]);
export type ContentEntryV1 = z.infer<typeof ContentEntryV1Schema>;

export const PageTokenCategorySchema = z.enum([
  "color",
  "typography",
  "spacing",
  "radius",
  "shadow",
  "motion",
]);
export type PageTokenCategory = z.infer<typeof PageTokenCategorySchema>;
export const PageTokenV1Schema = z
  .object({
    id: IrIdSchema,
    category: PageTokenCategorySchema,
  })
  .strict();
export type PageTokenV1 = z.infer<typeof PageTokenV1Schema>;

export const PageIrAssetMediaTypeV1Schema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);
export type PageIrAssetMediaTypeV1 = z.infer<
  typeof PageIrAssetMediaTypeV1Schema
>;

export const AssetV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("image"),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mediaType: PageIrAssetMediaTypeV1Schema,
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
    sizeBytes: z.number().int().nonnegative().max(PAGE_IR_BOUNDS.maxAssetBytes),
  })
  .strict();
export type AssetV1 = z.infer<typeof AssetV1Schema>;

function isSafeExternalHttpsUrl(value: string) {
  if (value.length > PAGE_IR_BOUNDS.maxUrlLength) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      hostname.length === 0 ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.includes(":") ||
      /^[0-9.]+$/.test(hostname)
    ) {
      return false;
    }
    const labels = hostname.split(".");
    return (
      labels.length >= 2 &&
      labels.every(
        (label) =>
          label.length >= 1 &&
          label.length <= 63 &&
          /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
      )
    );
  } catch {
    return false;
  }
}

const ScrollActionV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("scroll-to"),
    targetNodeId: IrIdSchema,
  })
  .strict();
const CallActionV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("call"),
    phone: z.string().trim().min(3).max(32).regex(/^\+?[0-9 ()-]+$/),
  })
  .strict();
const EmailActionV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("email"),
    email: z.string().trim().max(254).email(),
  })
  .strict();
const ExternalActionV1Schema = z
  .object({
    id: IrIdSchema,
    kind: z.literal("external"),
    href: z.string().max(PAGE_IR_BOUNDS.maxUrlLength).refine(isSafeExternalHttpsUrl, {
      message: "external action must use a public HTTPS URL without credentials",
    }),
  })
  .strict();
export const ActionV1Schema = z.discriminatedUnion("kind", [
  ScrollActionV1Schema,
  CallActionV1Schema,
  EmailActionV1Schema,
  ExternalActionV1Schema,
]);
export type ActionV1 = z.infer<typeof ActionV1Schema>;

const HeadingSlotBindingV1Schema = z
  .object({ nodeId: IrIdSchema, kind: z.literal("heading"), contentId: IrIdSchema })
  .strict();
const TextSlotBindingV1Schema = z
  .object({ nodeId: IrIdSchema, kind: z.literal("text"), contentId: IrIdSchema })
  .strict();
const ListSlotBindingV1Schema = z
  .object({ nodeId: IrIdSchema, kind: z.literal("list"), contentId: IrIdSchema })
  .strict();
const MediaSlotBindingV1Schema = z
  .object({
    nodeId: IrIdSchema,
    kind: z.literal("media"),
    assetId: IrIdSchema,
    decorative: z.boolean(),
    altText: z.string().max(300).optional(),
  })
  .strict();
const ActionSlotBindingV1Schema = z
  .object({
    nodeId: IrIdSchema,
    kind: z.literal("action"),
    labelContentId: IrIdSchema,
    actionId: IrIdSchema,
  })
  .strict();
export const SlotBindingV1Schema = z.discriminatedUnion("kind", [
  HeadingSlotBindingV1Schema,
  TextSlotBindingV1Schema,
  ListSlotBindingV1Schema,
  MediaSlotBindingV1Schema,
  ActionSlotBindingV1Schema,
]);
export type SlotBindingV1 = z.infer<typeof SlotBindingV1Schema>;

const NodeTokenReferencesV1Schema = z
  .object({
    color: IrIdSchema.optional(),
    typography: IrIdSchema.optional(),
    spacing: IrIdSchema.optional(),
    radius: IrIdSchema.optional(),
    shadow: IrIdSchema.optional(),
    motion: IrIdSchema.optional(),
  })
  .strict()
  .refine((references) => Object.keys(references).length > 0, {
    message: "node token bindings must contain at least one token reference",
  });
export const NodeTokenBindingV1Schema = z
  .object({
    nodeId: IrIdSchema,
    tokens: NodeTokenReferencesV1Schema,
  })
  .strict();
export type NodeTokenBindingV1 = z.infer<typeof NodeTokenBindingV1Schema>;

export const PageAccessibilityV1Schema = z
  .object({
    language: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
    titleContentId: IrIdSchema,
    navigationNodeId: IrIdSchema,
    mainNodeId: IrIdSchema,
    skipToNodeId: IrIdSchema,
  })
  .strict();
export type PageAccessibilityV1 = z.infer<typeof PageAccessibilityV1Schema>;

function addDuplicateIdIssues<T extends { id: string }>(
  records: T[],
  path: string,
  issue: (path: PropertyKey[], message: string) => void
) {
  const seen = new Set<string>();
  for (const [index, record] of records.entries()) {
    if (seen.has(record.id)) {
      issue([path, index, "id"], `${path} IDs must be unique`);
    }
    seen.add(record.id);
  }
}

function validatePageIRV1(
  page: {
    layoutProgram: z.infer<typeof LayoutProgramV1Schema>;
    content: ContentEntryV1[];
    tokens: Array<{ id: string; category: PageTokenCategory }>;
    assets: Array<z.infer<typeof AssetV1Schema>>;
    actions: ActionV1[];
    slotBindings: SlotBindingV1[];
    nodeTokenBindings: Array<z.infer<typeof NodeTokenBindingV1Schema>>;
    accessibility: z.infer<typeof PageAccessibilityV1Schema>;
  },
  context: z.RefinementCtx
) {
  const issue = createBoundedIssue(context);
  addDuplicateIdIssues(page.content, "content", issue);
  addDuplicateIdIssues(page.tokens, "tokens", issue);
  addDuplicateIdIssues(page.assets, "assets", issue);
  addDuplicateIdIssues(page.actions, "actions", issue);

  const nodes = new Map(page.layoutProgram.nodes.map((node) => [node.id, node]));
  const content = new Map(page.content.map((entry) => [entry.id, entry]));
  const tokens = new Map(page.tokens.map((token) => [token.id, token]));
  const assets = new Map(page.assets.map((asset) => [asset.id, asset]));
  const actions = new Map(page.actions.map((action) => [action.id, action]));

  const bindingCounts = new Map<string, number>();
  for (const [index, binding] of page.slotBindings.entries()) {
    bindingCounts.set(binding.nodeId, (bindingCounts.get(binding.nodeId) ?? 0) + 1);
    const node = nodes.get(binding.nodeId);
    if (!node) {
      issue(["slotBindings", index, "nodeId"], "slot binding must reference an existing node");
    } else if (node.kind !== "slot") {
      issue(["slotBindings", index, "nodeId"], "slot binding must reference a slot node");
    } else if (node.slotType !== binding.kind) {
      issue(["slotBindings", index, "kind"], "slot binding kind must match the target slot");
    }

    if (binding.kind === "heading" || binding.kind === "text" || binding.kind === "list") {
      const entry = content.get(binding.contentId);
      if (!entry) {
        issue(["slotBindings", index, "contentId"], "binding must reference existing content");
      } else if (entry.kind !== binding.kind) {
        issue(["slotBindings", index, "contentId"], "content kind must match the slot binding");
      }
    } else if (binding.kind === "media") {
      if (!assets.has(binding.assetId)) {
        issue(["slotBindings", index, "assetId"], "media binding must reference an existing asset");
      }
      if (binding.decorative && binding.altText !== undefined && binding.altText.length > 0) {
        issue(["slotBindings", index, "altText"], "decorative media cannot declare alternative text");
      }
      if (!binding.decorative && (!binding.altText || binding.altText.trim().length === 0)) {
        issue(["slotBindings", index, "altText"], "informative media requires alternative text");
      }
    } else {
      const label = content.get(binding.labelContentId);
      if (!label) {
        issue(["slotBindings", index, "labelContentId"], "action label must reference existing content");
      } else if (label.kind !== "text") {
        issue(["slotBindings", index, "labelContentId"], "action labels must reference text content");
      }
      if (!actions.has(binding.actionId)) {
        issue(["slotBindings", index, "actionId"], "action binding must reference an existing action");
      }
    }
  }
  for (const [index, node] of page.layoutProgram.nodes.entries()) {
    if (node.kind !== "slot") continue;
    if ((bindingCounts.get(node.id) ?? 0) !== 1) {
      issue(["layoutProgram", "nodes", index, "id"], "every slot requires exactly one binding");
    }
  }

  const tokenBindingNodes = new Set<string>();
  for (const [index, binding] of page.nodeTokenBindings.entries()) {
    if (tokenBindingNodes.has(binding.nodeId)) {
      issue(["nodeTokenBindings", index, "nodeId"], "a node may have only one token binding");
    }
    tokenBindingNodes.add(binding.nodeId);
    if (!nodes.has(binding.nodeId)) {
      issue(["nodeTokenBindings", index, "nodeId"], "token binding must reference an existing node");
    }
    for (const [category, tokenId] of Object.entries(binding.tokens) as Array<
      [PageTokenCategory, string]
    >) {
      const token = tokens.get(tokenId);
      if (!token) {
        issue(["nodeTokenBindings", index, "tokens", category], "token reference must exist");
      } else if (token.category !== category) {
        issue(["nodeTokenBindings", index, "tokens", category], "token reference category must match its binding");
      }
    }
  }

  for (const [index, action] of page.actions.entries()) {
    if (action.kind !== "scroll-to") continue;
    const target = nodes.get(action.targetNodeId);
    if (
      !target ||
      !(
        target.kind === "section" ||
        (target.kind === "landmark" && target.landmark === "main")
      )
    ) {
      issue(["actions", index, "targetNodeId"], "scroll actions must target a section or main landmark");
    }
  }

  const title = content.get(page.accessibility.titleContentId);
  if (!title || (title.kind !== "heading" && title.kind !== "text")) {
    issue(["accessibility", "titleContentId"], "page title must reference heading or text content");
  }
  const navigation = nodes.get(page.accessibility.navigationNodeId);
  if (!navigation || navigation.kind !== "landmark" || navigation.landmark !== "navigation") {
    issue(["accessibility", "navigationNodeId"], "navigation reference must target the navigation landmark");
  }
  const main = nodes.get(page.accessibility.mainNodeId);
  if (!main || main.kind !== "landmark" || main.landmark !== "main") {
    issue(["accessibility", "mainNodeId"], "main reference must target the main landmark");
  }
  const skip = nodes.get(page.accessibility.skipToNodeId);
  if (
    !skip ||
    !(skip.kind === "section" || (skip.kind === "landmark" && skip.landmark === "main"))
  ) {
    issue(["accessibility", "skipToNodeId"], "skip reference must target a section or main landmark");
  }

  const totalTextLength = page.content.reduce((total, entry) => {
    if (entry.kind === "list") {
      return total + entry.items.reduce((sum, item) => sum + item.length, 0);
    }
    return total + entry.text.length;
  }, 0);
  if (totalTextLength > PAGE_IR_BOUNDS.maxTotalTextLength) {
    issue(["content"], "combined Page IR text exceeds the supported maximum");
  }
  const totalAssetBytes = page.assets.reduce((total, asset) => total + asset.sizeBytes, 0);
  if (totalAssetBytes > PAGE_IR_BOUNDS.maxAssetBytes) {
    issue(["assets"], "combined Page IR assets exceed the supported maximum");
  }
}

export const PageIRV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    target: z.literal("website"),
    referenceContract: ReferenceContractV1Schema,
    layoutProgram: LayoutProgramV1Schema,
    content: z.array(ContentEntryV1Schema).max(PAGE_IR_BOUNDS.maxContent),
    tokens: z.array(PageTokenV1Schema).max(PAGE_IR_BOUNDS.maxTokens),
    assets: z.array(AssetV1Schema).max(PAGE_IR_BOUNDS.maxAssets),
    actions: z.array(ActionV1Schema).max(PAGE_IR_BOUNDS.maxActions),
    slotBindings: z.array(SlotBindingV1Schema).max(PAGE_IR_BOUNDS.maxNodes),
    nodeTokenBindings: z.array(NodeTokenBindingV1Schema).max(PAGE_IR_BOUNDS.maxNodes),
    accessibility: PageAccessibilityV1Schema,
  })
  .strict()
  .superRefine(validatePageIRV1);
export type PageIRV1 = z.infer<typeof PageIRV1Schema>;

export const PageIrCompilerAssetBindingV1Schema = z
  .object({
    assetId: IrIdSchema,
    mediaType: PageIrAssetMediaTypeV1Schema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z
      .instanceof(Uint8Array)
      .refine((bytes) => bytes.byteLength <= PAGE_IR_BOUNDS.maxAssetBytes, {
        message: "compiler asset exceeds the supported maximum",
      }),
  })
  .strict();
export type PageIrCompilerAssetBindingV1 = z.infer<
  typeof PageIrCompilerAssetBindingV1Schema
>;

export const PageIrCompilerRequestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    pageIr: PageIRV1Schema,
    assets: z
      .array(PageIrCompilerAssetBindingV1Schema)
      .max(PAGE_IR_BOUNDS.maxAssets),
  })
  .strict()
  .superRefine((request, context) => {
    const totalBytes = request.assets.reduce(
      (total, asset) => total + asset.bytes.byteLength,
      0,
    );
    if (totalBytes > PAGE_IR_BOUNDS.maxAssetBytes) {
      context.addIssue({
        code: "custom",
        path: ["assets"],
        message: "compiler assets exceed the 100 MiB aggregate maximum",
      });
    }
  });
export type PageIrCompilerRequestV1 = z.infer<
  typeof PageIrCompilerRequestV1Schema
>;

export const ResearchConfigurationSchema = z.object({
  enabled: z.boolean().default(true),
  businessIntelligence: z.boolean().default(true),
  referoDesignEvidence: z.boolean().default(true),
  /** Firecrawl is the standing fallback tier (owner decision 2026-08-16): the
   * free local scraper still goes first, but a run no longer has to opt in for
   * the paid tier to catch what it misses. The flag stays so a run can still be
   * forced off from the intake UI, and so every metered path remains auditable. */
  allowPaidFirecrawlFallback: z.boolean().default(true),
});
export type ResearchConfiguration = z.infer<
  typeof ResearchConfigurationSchema
>;

export const UploadMetadataSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  kind: z.enum([
    "logo",
    "brand-guidelines",
    "screenshot",
    "copy-document",
    "do-dont-list",
    "wish-list",
    "folder",
    "archive",
    "other",
  ]),
  mediaType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedAt: z.string(),
  sha256: z.string().optional(),
  /** Run-relative path assigned only after the server claims staged bytes. */
  storagePath: z.string().optional(),
});
export type UploadMetadata = z.infer<typeof UploadMetadataSchema>;

export const CrawlProvenanceSchema = z
  .object({
    provider: z.enum(["crawl4ai", "firecrawl"]),
    sourceUrl: z.string(),
    extractedAt: z.string(),
    confidence: z.number().min(0).max(1),
    outcome: z.enum(["succeeded", "failed"]),
    failureReason: z.string().optional(),
    fallbackReason: z
      .enum([
        "local-failure",
        "bot-challenge",
        "unsupported-capability",
        "user-approved-paid-fallback",
      ])
      .optional(),
    paidFallbackApproved: z.boolean().optional(),
  })
  .superRefine((record, ctx) => {
    if (record.outcome === "failed" && !record.failureReason) {
      ctx.addIssue({
        code: "custom",
        path: ["failureReason"],
        message: "failed crawls must record a failure reason",
      });
    }
    if (record.provider === "firecrawl" && !record.fallbackReason) {
      ctx.addIssue({
        code: "custom",
        path: ["fallbackReason"],
        message: "Firecrawl records must identify the fallback reason",
      });
    }
    if (
      record.fallbackReason === "user-approved-paid-fallback" &&
      record.paidFallbackApproved !== true
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["paidFallbackApproved"],
        message: "paid fallback must record explicit approval",
      });
    }
  });
export type CrawlProvenance = z.infer<typeof CrawlProvenanceSchema>;

export const EvidenceSourceSchema = z.object({
  id: z.string(),
  sourceUrl: z.string(),
  title: z.string().optional(),
  screenshotPaths: z.array(z.string()).default([]),
  extractedArtifactPaths: z.array(z.string()).default([]),
  capturedAt: z.string(),
  confidence: z.number().min(0).max(1),
  crawl: CrawlProvenanceSchema.optional(),
  crawlAttempts: z.array(CrawlProvenanceSchema).default([]),
});
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const EvidenceClaimSchema = z.object({
  id: z.string(),
  statement: z.string(),
  classification: z.enum(["observed", "inferred", "recommended"]),
  sourceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;

/** Business/market findings are intentionally a different contract from
 * visual/structural Refero findings. A competitor never becomes a design
 * reference merely by appearing here. */
export const BusinessIntelligenceEvidenceSchema = z.object({
  kind: z.literal("business-intelligence"),
  sources: z.array(EvidenceSourceSchema).default([]),
  competitors: z
    .array(
      z.object({
        name: z.string(),
        url: z.string(),
        selectionRationale: z.string(),
        strengths: z.array(z.string()).default([]),
        gaps: z.array(z.string()).default([]),
      })
    )
    .default([]),
  marketExpectations: z.array(z.string()).default([]),
  differentiationOpportunities: z.array(z.string()).default([]),
  claims: z.array(EvidenceClaimSchema).default([]),
});
export type BusinessIntelligenceEvidence = z.infer<
  typeof BusinessIntelligenceEvidenceSchema
>;

export const ReferoDesignEvidenceSchema = z.object({
  kind: z.literal("refero-design-evidence"),
  sources: z.array(EvidenceSourceSchema).default([]),
  references: z
    .array(
      z.object({
        referoId: z.string(),
        name: z.string(),
        sourceUrl: z.string().optional(),
        learningRationale: z.string(),
        reusablePatterns: z.array(z.string()).min(1),
      })
    )
    .default([]),
  claims: z.array(EvidenceClaimSchema).default([]),
});
export type ReferoDesignEvidence = z.infer<
  typeof ReferoDesignEvidenceSchema
>;

export const DesignResearchLedgerSchema = z.object({
  projectTarget: ProjectTargetSchema,
  businessIntelligence: BusinessIntelligenceEvidenceSchema,
  referoDesignEvidence: ReferoDesignEvidenceSchema,
  clientEvidence: z
    .object({
      sources: z.array(EvidenceSourceSchema).default([]),
      claims: z.array(EvidenceClaimSchema).default([]),
      artifactRelationships: z
        .array(
          z.object({
            uploadId: z.string(),
            kind: z.string(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
            status: z.enum(["text-consumed", "asset-referenced", "unsupported"]),
            consumer: z.enum(["design", "copy"]).optional(),
            sourceId: z.string().optional(),
          })
        )
        .default([]),
      unsupportedUploadIds: z.array(z.string()).default([]),
    })
    .default(() => ({
      sources: [],
      claims: [],
      artifactRelationships: [],
      unsupportedUploadIds: [],
    })),
});
export type DesignResearchLedger = z.infer<
  typeof DesignResearchLedgerSchema
>;

export const DesignContractMetadataSchema = z.object({
  title: z.string(),
  contractPath: z.string(),
  sourceLedgerVersion: z.number().int().positive(),
  approvedEvidenceIds: z.array(z.string()).default([]),
  exportPaths: z.array(z.string()).default([]),
  contractSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  exportSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /** The approved semantic proposal embodied by DESIGN.md. Optional only for
   * persisted pre-v2 fixtures; gated generation requires it downstream. */
  designTokens: z.lazy(() => DesignTokensSchema).optional(),
});
export const V2DesignContractMetadataSchema = DesignContractMetadataSchema.extend({
  contractSha256: z.string().regex(/^[a-f0-9]{64}$/),
  exportSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type DesignContractMetadata = z.infer<
  typeof DesignContractMetadataSchema
>;

export const TOKEN_INVENTORY_CATEGORIES = [
  "color",
  "typography",
  "spacing",
  "radius",
  "border",
  "shadow",
  "breakpoint",
  "motion",
  "layer",
  "component-state",
] as const;

export const TokenInventorySchema = z.object({
  sourceContractVersion: z.number().int().positive(),
  tokens: z.array(
    z.object({
      semanticName: z.string(),
      value: z.string(),
      usage: z.string(),
      category: z.enum(TOKEN_INVENTORY_CATEGORIES),
      sourceEvidenceIds: z.array(z.string()).default([]),
      editable: z.boolean().default(true),
    })
  ).min(1),
}).superRefine((inventory, ctx) => {
  const names = inventory.tokens.map((token) => token.semanticName);
  if (new Set(names).size !== names.length) {
    ctx.addIssue({
      code: "custom",
      path: ["tokens"],
      message: "semantic token names must be unique",
    });
  }
  const categories = new Set(inventory.tokens.map((token) => token.category));
  for (const category of TOKEN_INVENTORY_CATEGORIES) {
    if (!categories.has(category)) {
      ctx.addIssue({
        code: "custom",
        path: ["tokens"],
        message: `token inventory is missing required ${category} category`,
      });
    }
  }
});
export type TokenInventory = z.infer<typeof TokenInventorySchema>;

export const TailwindPlanSchema = z.object({
  sourceTokenInventoryVersion: z.number().int().positive(),
  themeMappings: z.array(
    z.object({
      cssVariable: z.string(),
      tailwindName: z.string(),
      rationale: z.string(),
    })
  ).min(1),
  runtimeOnlyVariables: z.array(
    z.object({
      cssVariable: z.string(),
      rationale: z.string(),
    })
  ).default([]),
  componentVariants: z.array(z.string()).default([]),
  responsiveRules: z.array(z.string()).default([]),
}).superRefine((plan, ctx) => {
  const cssVariables = plan.themeMappings.map((mapping) => mapping.cssVariable);
  const tailwindNames = plan.themeMappings.map((mapping) => mapping.tailwindName);
  const runtimeVariables = plan.runtimeOnlyVariables.map((mapping) => mapping.cssVariable);
  if (new Set(cssVariables).size !== cssVariables.length) {
    ctx.addIssue({ code: "custom", path: ["themeMappings"], message: "Tailwind CSS variable mappings must be unique" });
  }
  if (new Set(tailwindNames).size !== tailwindNames.length) {
    ctx.addIssue({ code: "custom", path: ["themeMappings"], message: "Tailwind theme names must be unique" });
  }
  if (new Set(runtimeVariables).size !== runtimeVariables.length) {
    ctx.addIssue({ code: "custom", path: ["runtimeOnlyVariables"], message: "Runtime-only CSS variables must be unique" });
  }
  if (runtimeVariables.some((variable) => cssVariables.includes(variable))) {
    ctx.addIssue({ code: "custom", path: ["runtimeOnlyVariables"], message: "A CSS variable cannot be both a Tailwind theme mapping and runtime-only" });
  }
});
export type TailwindPlan = z.infer<typeof TailwindPlanSchema>;

export const CssArchitectureSchema = z.object({
  sourceTailwindPlanVersion: z.number().int().positive(),
  cssVariableHierarchy: z.array(z.string()),
  tokenToComponentUsage: z.record(z.string(), z.array(z.string())),
  styleScopes: z.object({
    global: z.array(z.string()).default([]),
    page: z.array(z.string()).default([]),
    component: z.array(z.string()).default([]),
  }),
  generatedCssPath: z.string().optional(),
  justifiedExceptions: z.array(z.string()).default([]),
});
export type CssArchitecture = z.infer<typeof CssArchitectureSchema>;

export const VisualQaSchema = z.object({
  sourceCssArchitectureVersion: z.number().int().positive(),
  buildSha256: z.string().regex(/^[a-f0-9]{64}$/),
  checks: z.array(
    z.object({
      area: z.enum([
        "desktop",
        "tablet",
        "mobile",
        "hover",
        "focus",
        "color-scheme",
        "reduced-motion",
      ]),
      status: z.enum(["pending", "pass", "fail", "not-applicable"]),
      notes: z.string().optional(),
      evidencePath: z.string().optional(),
    })
  ).length(7),
}).superRefine((qa, ctx) => {
  const required = ["desktop", "tablet", "mobile", "hover", "focus", "color-scheme", "reduced-motion"] as const;
  const areas = qa.checks.map((check) => check.area);
  if (new Set(areas).size !== required.length || required.some((area) => !areas.includes(area))) {
    ctx.addIssue({ code: "custom", path: ["checks"], message: "visual QA must contain each required area exactly once" });
  }
  for (const [index, check] of qa.checks.entries()) {
    if (["desktop", "tablet", "mobile"].includes(check.area) && !check.evidencePath) {
      ctx.addIssue({ code: "custom", path: ["checks", index, "evidencePath"], message: "width checks require screenshot evidence" });
    }
  }
});
export type VisualQa = z.infer<typeof VisualQaSchema>;

export const EVIDENCE_WORKFLOW_STAGES = [
  "evidence",
  "contract",
  "tokens",
  "tailwind",
  "css",
  "build",
] as const;
export const EvidenceWorkflowStageSchema = z.enum(EVIDENCE_WORKFLOW_STAGES);
export type EvidenceWorkflowStage = z.infer<
  typeof EvidenceWorkflowStageSchema
>;

export const ArtifactApprovalStateSchema = z.enum([
  "draft",
  "in-review",
  "approved",
  "revision-requested",
  "superseded",
]);
export type ArtifactApprovalState = z.infer<
  typeof ArtifactApprovalStateSchema
>;

const HumanVisualCriterionSchema = z.object({
  status: z.enum(["pass", "fail"]),
  findings: z.string().trim().max(2_000).optional(),
}).superRefine((criterion, context) => {
  if (criterion.status === "fail" && !criterion.findings) {
    context.addIssue({
      code: "custom",
      path: ["findings"],
      message: "failed human visual criteria require revision findings",
    });
  }
});

export const HumanVisualReviewCriteriaSchema = z.object({
  briefFidelity: HumanVisualCriterionSchema,
  visualHierarchy: HumanVisualCriterionSchema,
  spacingAndComposition: HumanVisualCriterionSchema,
  businessSpecificity: HumanVisualCriterionSchema,
  designAndReferenceAlignment: HumanVisualCriterionSchema.and(z.object({
    referenceContext: z.enum([
      "design-and-references",
      "explicit-no-reference",
    ]),
  })),
});
export type HumanVisualReviewCriteria = z.infer<
  typeof HumanVisualReviewCriteriaSchema
>;

/** A visual decision made by a named person. Automated/model audits remain
 * advisory inputs and must never be persisted in this human-only record. */
export const HumanVisualReviewSchema = z.object({
  reviewerName: z.string().trim().min(1).max(120),
  reviewerKind: z.literal("human"),
  humanAttestation: z.literal(true),
  reviewedAt: z.string(),
  buildSha256: z.string().regex(/^[a-f0-9]{64}$/),
  criteria: HumanVisualReviewCriteriaSchema,
});
export type HumanVisualReview = z.infer<typeof HumanVisualReviewSchema>;

export const ArtifactApprovalTransitionSchema = z.object({
  state: ArtifactApprovalStateSchema,
  at: z.string(),
  actor: z.string().optional(),
  note: z.string().optional(),
  humanVisualReview: HumanVisualReviewSchema.optional(),
});
export type ArtifactApprovalTransition = z.infer<
  typeof ArtifactApprovalTransitionSchema
>;

const ArtifactVersionBaseSchema = z.object({
  version: z.number().int().positive(),
  createdAt: z.string(),
  revisionOf: z.number().int().positive().optional(),
  approvalTransitions: z.array(ArtifactApprovalTransitionSchema).min(1),
});

const LedgerArtifactVersionSchema = ArtifactVersionBaseSchema.extend({
  artifactType: z.literal("ledger"),
  artifact: DesignResearchLedgerSchema,
});
const DesignContractArtifactVersionSchema = ArtifactVersionBaseSchema.extend({
  artifactType: z.literal("design-contract"),
  artifact: DesignContractMetadataSchema,
});
const TokenInventoryArtifactVersionSchema = ArtifactVersionBaseSchema.extend({
  artifactType: z.literal("token-inventory"),
  artifact: TokenInventorySchema,
});
const TailwindPlanArtifactVersionSchema = ArtifactVersionBaseSchema.extend({
  artifactType: z.literal("tailwind-plan"),
  artifact: TailwindPlanSchema,
});
const CssArchitectureArtifactVersionSchema = ArtifactVersionBaseSchema.extend({
  artifactType: z.literal("css-architecture"),
  artifact: CssArchitectureSchema,
});
const VisualQaArtifactVersionSchema = ArtifactVersionBaseSchema.extend({
  artifactType: z.literal("visual-qa"),
  artifact: VisualQaSchema,
});

export const WorkflowArtifactVersionSchema = z.discriminatedUnion(
  "artifactType",
  [
    LedgerArtifactVersionSchema,
    DesignContractArtifactVersionSchema,
    TokenInventoryArtifactVersionSchema,
    TailwindPlanArtifactVersionSchema,
    CssArchitectureArtifactVersionSchema,
    VisualQaArtifactVersionSchema,
  ]
);
export type WorkflowArtifactVersion = z.infer<
  typeof WorkflowArtifactVersionSchema
>;

export const WorkflowArtifactDraftSchema = z.discriminatedUnion(
  "artifactType",
  [
    z.object({ artifactType: z.literal("ledger"), artifact: DesignResearchLedgerSchema }),
    z.object({
      artifactType: z.literal("design-contract"),
      artifact: DesignContractMetadataSchema,
    }),
    z.object({
      artifactType: z.literal("token-inventory"),
      artifact: TokenInventorySchema,
    }),
    z.object({ artifactType: z.literal("tailwind-plan"), artifact: TailwindPlanSchema }),
    z.object({
      artifactType: z.literal("css-architecture"),
      artifact: CssArchitectureSchema,
    }),
    z.object({ artifactType: z.literal("visual-qa"), artifact: VisualQaSchema }),
  ]
);
export type WorkflowArtifactDraft = z.infer<typeof WorkflowArtifactDraftSchema>;
export type WorkflowArtifactType = WorkflowArtifactDraft["artifactType"];

export const EVIDENCE_STAGE_ARTIFACT = {
  evidence: "ledger",
  contract: "design-contract",
  tokens: "token-inventory",
  tailwind: "tailwind-plan",
  css: "css-architecture",
  build: "visual-qa",
} as const satisfies Record<EvidenceWorkflowStage, WorkflowArtifactType>;

export const ARTIFACT_APPROVAL_TRANSITIONS: Record<
  ArtifactApprovalState,
  readonly ArtifactApprovalState[]
> = {
  draft: ["in-review", "revision-requested"],
  "in-review": ["approved", "revision-requested"],
  approved: ["revision-requested"],
  "revision-requested": ["superseded"],
  superseded: [],
};

export function workflowArtifactApprovalState(
  artifact: WorkflowArtifactVersion
): ArtifactApprovalState {
  const latest = artifact.approvalTransitions.at(-1);
  if (artifact.artifactType === "visual-qa" && latest?.state === "approved") {
    const review = latest.humanVisualReview;
    const validHumanApproval =
      review?.reviewerKind === "human" &&
      review.humanAttestation === true &&
      review.buildSha256 === artifact.artifact.buildSha256 &&
      Object.values(review.criteria).every(
        (criterion) => criterion.status === "pass"
      );
    if (!validHumanApproval) return "revision-requested";
  }
  return latest?.state ?? "draft";
}

export function workflowArtifactSource(
  artifact: WorkflowArtifactVersion
): { artifactType: WorkflowArtifactType; version: number } | undefined {
  switch (artifact.artifactType) {
    case "ledger":
      return undefined;
    case "design-contract":
      return {
        artifactType: "ledger",
        version: artifact.artifact.sourceLedgerVersion,
      };
    case "token-inventory":
      return {
        artifactType: "design-contract",
        version: artifact.artifact.sourceContractVersion,
      };
    case "tailwind-plan":
      return {
        artifactType: "token-inventory",
        version: artifact.artifact.sourceTokenInventoryVersion,
      };
    case "css-architecture":
      return {
        artifactType: "tailwind-plan",
        version: artifact.artifact.sourceTailwindPlanVersion,
      };
    case "visual-qa":
      return {
        artifactType: "css-architecture",
        version: artifact.artifact.sourceCssArchitectureVersion,
      };
  }
}

export const EvidenceWorkflowStateSchema = z
  .object({
    currentStage: EvidenceWorkflowStageSchema.default("evidence"),
    artifacts: z.array(WorkflowArtifactVersionSchema).default(() => []),
  })
  .superRefine((workflow, ctx) => {
    const byType = new Map<WorkflowArtifactType, WorkflowArtifactVersion[]>();
    for (const artifact of workflow.artifacts) {
      const versions = byType.get(artifact.artifactType) ?? [];
      versions.push(artifact);
      byType.set(artifact.artifactType, versions);

      const transitions = artifact.approvalTransitions;
      if (transitions[0]?.state !== "draft") {
        ctx.addIssue({
          code: "custom",
          path: ["artifacts"],
          message: `${artifact.artifactType} v${artifact.version} must begin in draft`,
        });
      }
      for (let index = 1; index < transitions.length; index += 1) {
        const previous = transitions[index - 1].state;
        const next = transitions[index].state;
        if (!ARTIFACT_APPROVAL_TRANSITIONS[previous].includes(next)) {
          ctx.addIssue({
            code: "custom",
            path: ["artifacts"],
            message: `invalid ${artifact.artifactType} v${artifact.version} transition: ${previous} -> ${next}`,
          });
        }
      }
    }

    for (const [artifactType, versions] of byType) {
      versions.sort((left, right) => left.version - right.version);
      const seen = new Set<number>();
      for (let index = 0; index < versions.length; index += 1) {
        const artifact = versions[index];
        if (seen.has(artifact.version) || artifact.version !== index + 1) {
          ctx.addIssue({
            code: "custom",
            path: ["artifacts"],
            message: `${artifactType} versions must be unique and linear from 1`,
          });
        }
        seen.add(artifact.version);

        const expectedRevision = index === 0 ? undefined : versions[index - 1].version;
        if (artifact.revisionOf !== expectedRevision) {
          ctx.addIssue({
            code: "custom",
            path: ["artifacts"],
            message:
              index === 0
                ? `${artifactType} v1 cannot revise another version`
                : `${artifactType} v${artifact.version} must revise v${expectedRevision}`,
          });
        }
      }

      const active = versions.filter(
        (artifact) => workflowArtifactApprovalState(artifact) !== "superseded"
      );
      if (
        active.length > 1 ||
        (active[0] && active[0].version !== versions.at(-1)?.version)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["artifacts"],
          message: `${artifactType} may have at most one nonsuperseded latest version`,
        });
      }
    }

    for (const artifact of workflow.artifacts) {
      const source = workflowArtifactSource(artifact);
      if (!source) continue;
      const approvedSource = (byType.get(source.artifactType) ?? [])
        .filter(
          (candidate) => workflowArtifactApprovalState(candidate) === "approved"
        )
        .sort((left, right) => right.version - left.version)[0];
      if (!approvedSource || approvedSource.version !== source.version) {
        ctx.addIssue({
          code: "custom",
          path: ["artifacts"],
          message: `${artifact.artifactType} v${artifact.version} must reference the latest approved ${source.artifactType}`,
        });
      }
    }

    const currentIndex = EVIDENCE_WORKFLOW_STAGES.indexOf(workflow.currentStage);
    for (let index = 0; index < currentIndex; index += 1) {
      const stage = EVIDENCE_WORKFLOW_STAGES[index];
      const artifactType = EVIDENCE_STAGE_ARTIFACT[stage];
      const latest = (byType.get(artifactType) ?? []).sort(
        (left, right) => right.version - left.version
      )[0];
      if (!latest || workflowArtifactApprovalState(latest) !== "approved") {
        ctx.addIssue({
          code: "custom",
          path: ["currentStage"],
          message: `${artifactType} must be approved before stage ${workflow.currentStage}`,
        });
      }
    }
  });
export type EvidenceWorkflowState = z.infer<typeof EvidenceWorkflowStateSchema>;

// ---------- Run state ----------

export const STAGES = [
  "intake",
  "scanned",
  "locked",
  "synthesized",
  "built",
  "edited",
] as const;
export type Stage = (typeof STAGES)[number];

export const StageStatusSchema = z.object({
  status: z.enum(["pending", "running", "done", "failed"]),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  error: z.string().optional(),
  retries: z.number().default(0),
  gateRepairAttempts: z.number().default(0),
});

export const LayoutAuthoritySchema = z.enum(["template-v1", "page-ir-v1"]);
export type LayoutAuthority = z.infer<typeof LayoutAuthoritySchema>;

export const PageIrRolloutDecisionV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    rolloutEnabled: z.boolean(),
    killSwitchEngaged: z.boolean(),
    layoutAuthority: LayoutAuthoritySchema,
    reason: z.enum(["default-off", "rollout-enabled", "kill-switch"]),
  })
  .strict()
  .superRefine((decision, context) => {
    const expected = decision.killSwitchEngaged
      ? { authority: "template-v1", reason: "kill-switch" }
      : decision.rolloutEnabled
        ? { authority: "page-ir-v1", reason: "rollout-enabled" }
        : { authority: "template-v1", reason: "default-off" };
    if (decision.layoutAuthority !== expected.authority) {
      context.addIssue({
        code: "custom",
        path: ["layoutAuthority"],
        message: "rollout controls do not select this layout authority",
      });
    }
    if (decision.reason !== expected.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "rollout reason does not match the selected controls",
      });
    }
  });
export type PageIrRolloutDecisionV1 = z.infer<
  typeof PageIrRolloutDecisionV1Schema
>;

export const TemplateFallbackReasonSchema = z.enum([
  "page-ir-derivation-failed",
  "page-ir-compilation-failed",
  "candidate-gates-failed",
  "candidate-promotion-failed",
  "operator-requested-after-failure",
]);
export type TemplateFallbackReason = z.infer<
  typeof TemplateFallbackReasonSchema
>;

const FallbackRunIdSchema = z.string().regex(/^[A-Za-z0-9_-]{4,40}$/);
const FallbackSha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const FallbackFailureSnapshotSchema = z
  .object({
    stage: z.enum(STAGES),
    message: z.string().min(1).max(500),
    messageSha256: FallbackSha256Schema.optional(),
  })
  .strict();
export type FallbackFailureSnapshot = z.infer<
  typeof FallbackFailureSnapshotSchema
>;

export const TemplateFallbackLinkSchema = z
  .object({
    childRunId: FallbackRunIdSchema,
    reason: TemplateFallbackReasonSchema,
    failure: FallbackFailureSnapshotSchema,
  })
  .strict();
export type TemplateFallbackLink = z.infer<
  typeof TemplateFallbackLinkSchema
>;

export const FallbackOriginSchema = z
  .object({
    sourceRunId: FallbackRunIdSchema,
    reason: TemplateFallbackReasonSchema,
    failure: FallbackFailureSnapshotSchema,
  })
  .strict();
export type FallbackOrigin = z.infer<typeof FallbackOriginSchema>;

export function normalizeFallbackFailureMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

// ---------- Reference selection (picker pilot, plan rev 2) ----------

/** Preview images must come from Refero's own hosts over https — candidate
 * cards render these URLs directly, so the schema is the injection boundary. */
const REFERO_ASSET_HOSTS = new Set([
  "refero.design",
  "www.refero.design",
  "images.refero.design",
]);

function isReferoAssetUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && REFERO_ASSET_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const CandidatePaletteEntrySchema = z.object({
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), // extracted, never model-invented
  plainLabel: z.string().min(1).max(60), // "the button color", never a token name
});

export const CandidateProfileSchema = z.object({
  referoId: z.string().min(1).max(80),
  kind: z.literal("style"), // screens are a borrow pool, never picker options
  name: z.string().min(1).max(120),
  sourceUrl: z.string().refine(isHttpsUrl, "https URLs only").optional(),
  previewImageUrl: z
    .string()
    .refine(isReferoAssetUrl, "must be a https refero.design asset URL")
    .optional(),
  /** Run-relative, confined to the research dir — served via /api/sites. */
  screenshotPath: z
    .string()
    .regex(/^research\/refero\/[a-zA-Z0-9._-]+$/)
    .optional(),
  foundVia: z.string().min(1).max(200),
  palette: z.array(CandidatePaletteEntrySchema).min(2).max(6),
  plainLanguageProfile: z.object({
    headline: z.string().min(1).max(80),
    feelSummary: z.string().min(1).max(320),
    bestFor: z.array(z.string().min(1).max(80)).max(4),
    headsUp: z.array(z.string().min(1).max(160)).max(3).default(() => []),
  }),
  composition: z.object({
    northStar: z.string().min(1).max(200),
    preserveTraits: z.array(z.string().min(1).max(160)).min(2).max(5),
    rhythmNote: z.string().min(1).max(240),
  }),
  recommended: z.boolean().default(false),
  recommendedWhy: z.string().max(200).optional(),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

export const ReferenceSelectionVersionSchema = z
  .object({
    version: z.number().int().min(1).max(3),
    createdAt: z.string(),
    searchAngles: z.array(z.string().min(1).max(200)).min(3).max(5),
    candidates: z.array(CandidateProfileSchema).min(2).max(3),
    revisionNote: z.string().max(2_000).optional(),
    excludedFromPrior: z.array(z.string()).default(() => []),
  })
  .superRefine((version, context) => {
    const ids = version.candidates.map((candidate) => candidate.referoId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["candidates"],
        message: "candidate referoIds must be unique within a version",
      });
    }
    const recommended = version.candidates.filter((c) => c.recommended);
    if (recommended.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["candidates"],
        message: "exactly one candidate must carry the advisory recommendation",
      });
    }
  });

export const ReferenceSelectionStateSchema = z
  .object({
    status: z.enum(["pending", "selected"]),
    /** Server-side reroll reservation counter — counts reservations SPENT,
     * incremented and persisted BEFORE candidate generation so a duplicate
     * submit sees the spent reservation and a crash never refunds it. A spent
     * reservation whose generation failed leaves versions one short, so
     * versions.length is rerollsUsed or rerollsUsed + 1, never more. */
    rerollsUsed: z.number().int().min(0).max(2).default(0),
    recommendedBy: z.literal("advisory-model").default("advisory-model"),
    versions: z.array(ReferenceSelectionVersionSchema).min(1).max(3),
    selection: z
      .object({
        selectedId: z.string().min(1),
        selectionKind: z.enum(["user-picked-recommended", "user-picked-other"]),
        version: z.number().int().min(1).max(3),
        at: z.string(),
        note: z.string().max(2_000).optional(),
      })
      .optional(),
  })
  .superRefine((state, context) => {
    if (state.versions.length > state.rerollsUsed + 1) {
      context.addIssue({
        code: "custom",
        path: ["versions"],
        message:
          "versions.length may not exceed rerollsUsed + 1 (every extra version needs a spent reservation; spent-but-failed reservations may leave versions short by any amount)",
      });
    }
    const seen = new Set<string>();
    for (const [index, version] of state.versions.entries()) {
      if (version.version !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["versions", index, "version"],
          message: "versions must be linear starting at 1",
        });
      }
      for (const candidate of version.candidates) {
        if (seen.has(candidate.referoId)) {
          context.addIssue({
            code: "custom",
            path: ["versions", index, "candidates"],
            message: `reroll repeats an earlier candidate: ${candidate.referoId}`,
          });
        }
      }
      for (const candidate of version.candidates) seen.add(candidate.referoId);
    }
    if (state.status === "selected" && !state.selection) {
      context.addIssue({
        code: "custom",
        path: ["selection"],
        message: "selected status requires a selection record",
      });
    }
    if (state.status === "pending" && state.selection) {
      context.addIssue({
        code: "custom",
        path: ["selection"],
        message: "pending status cannot carry a selection record",
      });
    }
    if (state.selection) {
      const version = state.versions.find(
        (v) => v.version === state.selection?.version
      );
      const candidate = version?.candidates.find(
        (c) => c.referoId === state.selection?.selectedId
      );
      if (!candidate) {
        context.addIssue({
          code: "custom",
          path: ["selection", "selectedId"],
          message: "selection must name a candidate in the referenced version",
        });
      } else {
        const expectedKind = candidate.recommended
          ? "user-picked-recommended"
          : "user-picked-other";
        if (state.selection.selectionKind !== expectedKind) {
          context.addIssue({
            code: "custom",
            path: ["selection", "selectionKind"],
            message: `selectionKind must be ${expectedKind} for this candidate`,
          });
        }
      }
    }
  });
export type ReferenceSelectionState = z.infer<
  typeof ReferenceSelectionStateSchema
>;

export const RunStateSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  /** Missing means the persisted run predates the approval-gated workflow.
   * createRun writes evidence-gated-v2 for every new run unless a migration or
   * compatibility test explicitly opts into the legacy controller. */
  pipelineVersion: z
    .enum(["legacy-v1", "evidence-gated-v2"])
    .default("legacy-v1"),
  stages: z.record(z.enum(STAGES), StageStatusSchema),
  costUsd: z.number().default(0), // OpenRouter + Firecrawl spend tally
  costCapUsd: z.number().default(3), // hard per-run cap; stop, never silently retry
  modelSlugs: z.record(z.string(), z.string()),
  /** Phase 4 A/B arm: refero (R, default) | local (L, catalog-index lock) |
   * none (N, control — identity invented from intake + vibe alone). */
  referenceMode: z.enum(["refero", "local", "none"]).default("refero"),
  /** Additive gated workflow for new runs. Legacy STAGES remain unchanged. */
  evidenceWorkflow: EvidenceWorkflowStateSchema.default(() => ({
    currentStage: "evidence" as const,
    artifacts: [],
  })),
  /** Picker pilot flag, persisted at creation so a mid-run env change can
   * never alter resume semantics (plan rev 2 §A). Default false = today's
   * behavior for every pre-existing run. */
  referencePickerEnabled: z.boolean().default(false),
  /** Sibling picker state — deliberately NOT an evidence-workflow stage, so
   * every persisted run parses unchanged (Sol audit blocker 1). */
  referenceSelection: ReferenceSelectionStateSchema.optional(),
  /** Frozen per-run layout authority. Missing legacy values parse as the
   * current template path without rewriting their persisted bytes. */
  layoutAuthority: LayoutAuthoritySchema.default("template-v1"),
  /** Creation-time rollout decision. Missing legacy values remain readable;
   * once present, runstate enforces it as immutable alongside authority. */
  rolloutDecision: PageIrRolloutDecisionV1Schema.optional(),
  /** Append-only terminal link from a failed PageIR run to its one template
   * fallback child. */
  templateFallback: TemplateFallbackLinkSchema.optional(),
  /** Immutable provenance on a server-created template fallback child. */
  fallbackOrigin: FallbackOriginSchema.optional(),
}).superRefine((state, context) => {
  if (state.templateFallback && state.fallbackOrigin) {
    context.addIssue({
      code: "custom",
      path: ["fallbackOrigin"],
      message: "a run cannot be both a fallback source and fallback child",
    });
  }
  if (
    state.rolloutDecision &&
    state.rolloutDecision.layoutAuthority !== state.layoutAuthority
  ) {
    context.addIssue({
      code: "custom",
      path: ["rolloutDecision"],
      message: "run rollout decision must match its immutable layout authority",
    });
  }
  if (state.templateFallback) {
    if (state.layoutAuthority !== "page-ir-v1") {
      context.addIssue({
        code: "custom",
        path: ["templateFallback"],
        message: "only a page-ir-v1 run may link to a template fallback",
      });
    }
    if (state.templateFallback.childRunId === state.id) {
      context.addIssue({
        code: "custom",
        path: ["templateFallback", "childRunId"],
        message: "a fallback child must have a distinct run ID",
      });
    }
    const failure = state.templateFallback.failure;
    const failedStage = state.stages[failure.stage];
    const normalizedError = normalizeFallbackFailureMessage(
      failedStage?.error ?? "",
    );
    const expectedPreview = normalizedError.slice(0, 500);
    if (
      failedStage?.status !== "failed" ||
      expectedPreview.length === 0 ||
      failure.message !== expectedPreview ||
      (normalizedError.length > 500) !== Boolean(failure.messageSha256)
    ) {
      context.addIssue({
        code: "custom",
        path: ["templateFallback", "failure"],
        message: "template fallback must snapshot the current failed stage",
      });
    }
  }
  if (state.fallbackOrigin) {
    if (state.layoutAuthority !== "template-v1") {
      context.addIssue({
        code: "custom",
        path: ["fallbackOrigin"],
        message: "only a template-v1 run may have a fallback origin",
      });
    }
    if (state.fallbackOrigin.sourceRunId === state.id) {
      context.addIssue({
        code: "custom",
        path: ["fallbackOrigin", "sourceRunId"],
        message: "a fallback source must have a distinct run ID",
      });
    }
  }
  if (state.pipelineVersion !== "evidence-gated-v2") return;
  for (const [index, artifact] of state.evidenceWorkflow.artifacts.entries()) {
    if (artifact.artifactType !== "design-contract") continue;
    const parsed = V2DesignContractMetadataSchema.safeParse(artifact.artifact);
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        path: ["evidenceWorkflow", "artifacts", index, "artifact"],
        message: "evidence-gated-v2 design contracts require immutable contract and export SHA-256 hashes",
      });
    }
  }
});
export type RunState = z.infer<typeof RunStateSchema>;
export type ReferenceMode = RunState["referenceMode"];

// ---------- Stage 1: intake ----------

export const IntakeSchema = z.object({
  businessName: z.string(),
  category: z.string(), // e.g. "fiber optic installer" — pilot is local-service L1–L2
  location: z.string(), // city, state — REQUIRED for a meaningful competitor scan
  services: z.array(z.string()).min(1),
  phone: z.string().optional(),
  serviceArea: z.string().optional(),
  yearsInBusiness: z.string().optional(),
  certifications: z.array(z.string()).default([]),
  claims: z.array(z.string()).default([]), // only evidence-backed facts the user gave us
  primaryAction: z.enum(["call", "book", "quote"]),
  prospectUrl: z.string().optional(), // existing site, if any
  vibeWords: z.array(z.string()).default([]), // how they want to feel
  projectTarget: ProjectTargetSchema.default("website"),
  research: ResearchConfigurationSchema.default({
    enabled: true,
    businessIntelligence: true,
    referoDesignEvidence: true,
    allowPaidFirecrawlFallback: true,
  }),
  uploads: z.array(UploadMetadataSchema).default([]),
});
export type Intake = z.infer<typeof IntakeSchema>;

// ---------- Stage 2: competitive scan ----------

/** A competitor resolved against Google Maps Platform. Present only when the
 * Maps lane is configured (GOOGLE_MAPS_API_KEY); its absence is a normal
 * degraded state, never a scan failure — see tools/places.ts. */
export const PlaceSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  mapsUri: z.string(), // canonical Google Maps deep link for this place
  websiteUri: z.string().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

export const CompetitorSchema = z.object({
  name: z.string(),
  url: z.string(),
  source: z.string(), // where we found it (search result provenance)
  /** business = a real local operator. editorial = listicle/guide/media page.
   * ONLY "business" entries carry market-structure signal; an editorial page
   * teaches us blog structure, not competitor structure (see maps.ts). */
  kind: z.enum(["business", "editorial", "unknown"]).default("unknown"),
  /** Why the classifier landed where it did — auditable, not a black box. */
  kindReason: z.string().optional(),
  place: PlaceSchema.optional(),
  /** Key-free Google Maps search link — always present, works with no API key. */
  mapsSearchUrl: z.string().optional(),
  markdownPath: z.string().optional(), // crawl artifact
  screenshotPaths: z.array(z.string()).default([]), // 1440 + 390
  structure: z.array(z.string()).default([]), // observed section inventory
  notes: z.string().optional(),
  crawl: CrawlProvenanceSchema.optional(),
  crawlAttempts: z.array(CrawlProvenanceSchema).default([]),
});
export type Competitor = z.infer<typeof CompetitorSchema>;

/** One organic Yelp search result. Sponsored placements are dropped upstream
 * in tools/yelp.ts — an advertiser's rating is not a market fact. */
export const YelpListingSchema = z.object({
  rank: z.number(), // position in Yelp's organic ordering
  name: z.string(),
  rating: z.number().optional(),
  reviewCount: z.number().optional(),
  categories: z.array(z.string()).default([]),
  priceRange: z.string().optional(), // "$".."$$$$"
  yelpUrl: z.string().optional(),
});
export type YelpListing = z.infer<typeof YelpListingSchema>;

/** The derived market bar. Kept in its own object, NOT spread across the
 * market, so a consumer can be handed the aggregates without also being handed
 * the named roster. */
export const YelpMarketSummarySchema = z.object({
  rosterSize: z.number(),
  ratingMedian: z.number().optional(),
  reviewCountMedian: z.number().optional(),
});
export type YelpMarketSummary = z.infer<typeof YelpMarketSummarySchema>;

/** Yelp market intelligence for the scan. Report-only: Yelp stays on
 * DIRECTORY_DOMAINS, so it is never a competitor site, a crawl target, or a
 * design input. `unavailable` explains an empty roster so a Yelp miss reads as
 * "not reachable" rather than "no competitors". */
export const YelpMarketSchema = z.object({
  searchUrl: z.string(),
  fetchedAt: z.string(),
  listings: z.array(YelpListingSchema).max(10).default([]),
  summary: YelpMarketSummarySchema,
  unavailable: z.string().optional(),
});
export type YelpMarket = z.infer<typeof YelpMarketSchema>;

export const ScanResultSchema = z.object({
  competitors: z.array(CompetitorSchema).max(4),
  commonSections: z.array(z.string()), // structure signal, NOT style input
  gaps: z.array(z.string()), // what nobody in the market does well
  /** Discovery results dropped before the crawl, kept so the scan is
   * auditable — a filter that silently eats real competitors is invisible
   * otherwise. */
  excluded: z
    .array(z.object({ url: z.string(), title: z.string(), why: z.string() }))
    .default([]),
  /** Optional so scans saved before the Yelp lane existed still parse. */
  yelp: YelpMarketSchema.optional(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

// ---------- Stage 3: Refero reference lock ----------

/** One candidate as Refero returned it — id, human name, and the two links
 * that make a lock auditable. Kept for EVERY candidate, not just the winner,
 * so a rejected reference can still be looked at. */
export const ReferenceCandidateSchema = z.object({
  referoId: z.string(),
  kind: z.enum(["style", "screen"]),
  name: z.string(),
  sourceUrl: z.string().optional(), // the real site the style was extracted from
  previewImageUrl: z.string().optional(),
  /** Bounded, validated image bytes persisted under this run. */
  screenshotPath: z.string().optional(),
  /** Which of the generated search angles surfaced this candidate. */
  foundVia: z.string().optional(),
});
export type ReferenceCandidate = z.infer<typeof ReferenceCandidateSchema>;

export const ReferenceProvenanceSchema = z.object({
  primary: ReferenceCandidateSchema.optional(),
  candidates: z.array(ReferenceCandidateSchema).default([]),
  /** Screens whose pixels were actually fetched and shown to the vision model
   * (refero_get_screen_image), as run-root-relative paths. Empty means the
   * lock was decided on prose alone. */
  imagesViewed: z.array(z.string()).default([]),
});
export type ReferenceProvenance = z.infer<typeof ReferenceProvenanceSchema>;

export const ReferenceLockSchema = z.object({
  searchAngles: z.array(z.string()).min(3).max(5),
  primary: z.object({
    referoId: z.string(), // style or screen id
    kind: z.enum(["style", "screen"]),
    name: z.string(),
    why: z.string(),
  }),
  borrowedDetails: z
    .array(
      z.object({
        referoId: z.string(),
        detail: z.string(), // ONE specific detail borrowed
        why: z.string(),
      })
    )
    .max(2), // anti-averaging: never more than 2
  rejected: z.array(
    z.object({ referoId: z.string(), name: z.string(), why: z.string() })
  ),
  decisionLedger: z.array(
    z.object({ decision: z.string(), source: z.string() }) // every choice traces
  ),
  /** Clickable provenance, filled DETERMINISTICALLY after generation — never
   * by the model, which would invent URLs. Refero's search results carry a
   * sourceUrl and previewImageUrl per candidate; without this the lock records
   * only an opaque UUID and "reference-locked to X" can't be verified. */
  provenance: ReferenceProvenanceSchema.optional(),
});
export type ReferenceLock = z.infer<typeof ReferenceLockSchema>;

/** The generation-time shape: the model authors judgement, never provenance
 * or the search angles it was handed. */
export const ReferenceLockDraftSchema = ReferenceLockSchema.omit({
  searchAngles: true,
  provenance: true,
});

// ---------- Stage 4: synthesis ----------

const ReferenceStyleDigestDraftShape = z.object({
  northStar: z.string().max(200),
  preserveTraits: z.array(z.string()).min(3).max(5),
  sectionRhythm: z.string().max(500),
  surfaces: z
    .array(
      z.object({
        level: z.number().int().min(0).max(3),
        purpose: z.string().max(160),
      })
    )
    .min(1)
    .max(4),
  componentRecipes: z.array(z.string()).min(1).max(8),
  imageryTreatment: z.string().max(400),
  motionPersonality: z.string().max(200),
  dosDonts: z
    .array(
      z.object({
        polarity: z.enum(["do", "dont"]),
        rule: z.string().max(200),
      })
    )
    .min(4)
    .max(14),
});

function requireDigestDont(
  digest: z.infer<typeof ReferenceStyleDigestDraftShape>,
  context: z.RefinementCtx
) {
  if (digest.dosDonts.some((rule) => rule.polarity === "dont")) return;
  context.addIssue({
    code: "custom",
    path: ["dosDonts"],
    message: "style digest must include at least one don't rule",
  });
}

export const ReferenceStyleDigestDraftSchema = ReferenceStyleDigestDraftShape.superRefine(
  requireDigestDont
);

export const ReferenceStyleDigestSchema = ReferenceStyleDigestDraftShape.extend({
  sourceStyleId: z.string().min(1),
  designContractVersion: z.number().int().min(1),
}).superRefine(requireDigestDont);
export type ReferenceStyleDigest = z.infer<typeof ReferenceStyleDigestSchema>;

export const FORBIDDEN_CONTEXTS = [
  "section-background",
  "body-text",
  "heading-text",
  "border",
  "button-background",
  "large-surface",
] as const;

export const DesignTokensSchema = z.object({
  colors: z.array(
    z.object({
      name: z.string(),
      value: z.string(), // hex or gradient
      cssVar: z.string(), // --color-*
      role: z.string(), // where it lives
      forbidden: z.string().optional(), // where it must NEVER appear
      forbiddenContexts: z.array(z.enum(FORBIDDEN_CONTEXTS)).default([]),
    })
  ),
  fonts: z.array(
    z.object({
      family: z.string(),
      cssVar: z.string(),
      weights: z.array(z.number()),
      role: z.string(),
      substitutes: z.array(z.string()).default([]),
    })
  ),
  typeScale: z.array(
    z.object({
      role: z.string(),
      sizePx: z.number(),
      lineHeight: z.number(),
      trackingEm: z.number().optional(),
      cssVar: z.string(),
    })
  ),
  radii: z.record(z.string(), z.string()),
  spacing: z.record(z.string(), z.string()),
  borders: z.record(z.string(), z.string()).default(() => ({})),
  shadows: z.record(z.string(), z.string()).default(() => ({})),
  layers: z.record(z.string(), z.string()).default(() => ({})),
  layout: z.object({
    maxWidthPx: z.number(),
    sectionGapPx: z.number(),
    cardPaddingPx: z.number(),
  }),
  motion: z.object({
    easing: z.string(),
    durationMs: z.object({ micro: z.number(), reveal: z.number() }),
    revealClasses: z.array(z.string()), // which classes get scroll reveals
  }),
  componentStates: z.array(
    z.object({
      component: z.string(),
      states: z.record(z.string(), z.string()), // default/hover/focus/disabled → css summary
    })
  ),
  imageryBrief: z.object({
    subject: z.string(),
    lighting: z.string(),
    grade: z.string(),
    framing: z.string(),
    avoid: z.array(z.string()),
  }),
});
export type DesignTokens = z.infer<typeof DesignTokensSchema>;

export const SkeletonSpecSchema = z.object({
  sections: z.array(
    z.object({
      id: z.string(), // maps to template section + data-edit-id prefix
      name: z.string(),
      purpose: z.string(),
      contentNeeds: z.array(z.string()),
    })
  ),
});
export type SkeletonSpec = z.infer<typeof SkeletonSpecSchema>;

export const CopyDocSchema = z.object({
  // Every string traces to intake facts or is generic-safe; no invented claims.
  sections: z.record(z.string(), z.record(z.string(), z.string())),
  stopSlopScore: z.number().optional(), // out of 50; revise below 35
});
export type CopyDoc = z.infer<typeof CopyDocSchema>;

// ---------- Stage 5: build ----------

export const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{4,40}$/;
export const RunIdSchema = z.string().regex(RUN_ID_PATTERN);

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

// ---------- Page IR v1 approved-artifact derivation ----------

export const PAGE_IR_DERIVATION_KINDS = [
  "evidence",
  "design-contract",
  "token-inventory",
  "tailwind-plan",
  "css-architecture",
  "layout-decision",
  "content",
  "assets",
] as const;
export const PageIrDerivationKindSchema = z.enum(PAGE_IR_DERIVATION_KINDS);
export type PageIrDerivationKind = z.infer<typeof PageIrDerivationKindSchema>;

export const PAGE_IR_PURPOSES = [
  "brochure-local-service",
  "portfolio-showcase",
  "saas-marketing",
  "editorial-index",
  "campaign-landing",
  "institutional-presence",
] as const;
export const PagePurposeV1Schema = z.enum(PAGE_IR_PURPOSES);
export type PagePurposeV1 = z.infer<typeof PagePurposeV1Schema>;

export const PAGE_IR_QUALIFICATION_DIMENSIONS = [
  "briefFidelity",
  "purposeTopology",
  "hierarchy",
  "compositionAndSpacing",
  "typographyAndColor",
  "businessSpecificity",
  "referenceAlignment",
  "responsiveBehavior",
  "interactionAndMotion",
  "craftAndCompleteness",
] as const;

const PageIrQualificationScoreV1Schema = z
  .object({
    score: z.number().int().min(0).max(4),
    evidence: z.string().trim().min(1).max(2_000),
  })
  .strict();

const PageIrQualificationHashesV1Schema = z
  .object({
    buildSha256: Sha256Schema,
    pageIrSha256: Sha256Schema,
    candidateManifestSha256: Sha256Schema,
    mechanicalChecksSha256: Sha256Schema,
    browserEvidenceSha256: Sha256Schema,
  })
  .strict();

export const PageIrQualificationAutomaticRejectionV1Schema = z.enum([
  "invented-business-fact",
  "broken-blocking-gate",
  "missing-viewport-evidence",
  "restyled-local-service-topology",
  "copied-reference-branding-or-composition",
  "missing-provenance-or-hidden-paid-fallback",
  "unsupported-product-target",
  "served-before-gates",
  "page-ir-authority-bypass",
]);

/** Serializable reviewer artifact only. Parsing this shape is not approval;
 * callers must use verifyPageIrQualificationHumanReviewV1 with identity and
 * current hashes supplied by the trusted human-review ingestion boundary. */
export const PageIrQualificationHumanReviewV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    reviewerName: z.string().trim().min(1).max(120),
    reviewerKind: z.literal("human"),
    humanAttestation: z.literal(true),
    reviewedAt: z.string().datetime({ offset: true }),
    fixtureId: PagePurposeV1Schema,
    reviewedHashes: PageIrQualificationHashesV1Schema,
    mechanicalGatesPassed: z.boolean(),
    automaticRejections: z
      .array(PageIrQualificationAutomaticRejectionV1Schema)
      .max(9),
    dimensions: z
      .object({
        briefFidelity: PageIrQualificationScoreV1Schema,
        purposeTopology: PageIrQualificationScoreV1Schema,
        hierarchy: PageIrQualificationScoreV1Schema,
        compositionAndSpacing: PageIrQualificationScoreV1Schema,
        typographyAndColor: PageIrQualificationScoreV1Schema,
        businessSpecificity: PageIrQualificationScoreV1Schema,
        referenceAlignment: PageIrQualificationScoreV1Schema,
        responsiveBehavior: PageIrQualificationScoreV1Schema,
        interactionAndMotion: PageIrQualificationScoreV1Schema,
        craftAndCompleteness: PageIrQualificationScoreV1Schema,
      })
      .strict(),
    findings: z.array(z.string().trim().min(1).max(2_000)).max(50),
    decision: z.enum(["pass", "fail"]),
  })
  .strict()
  .superRefine((review, context) => {
    if (review.decision === "fail") return;
    if (!review.mechanicalGatesPassed) {
      context.addIssue({
        code: "custom",
        path: ["mechanicalGatesPassed"],
        message: "a passing qualification requires all blocking mechanical gates",
      });
    }
    if (review.automaticRejections.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["automaticRejections"],
        message: "a passing qualification cannot contain an automatic rejection",
      });
    }
    const scores = PAGE_IR_QUALIFICATION_DIMENSIONS.map(
      (dimension) => review.dimensions[dimension].score,
    );
    if (scores.some((score) => score < 3)) {
      context.addIssue({
        code: "custom",
        path: ["dimensions"],
        message: "every qualification dimension must score at least 3",
      });
    }
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    if (mean < 3.2) {
      context.addIssue({
        code: "custom",
        path: ["dimensions"],
        message: "qualification dimension mean must be at least 3.2",
      });
    }
  });
export type PageIrQualificationHumanReviewV1 = z.infer<
  typeof PageIrQualificationHumanReviewV1Schema
>;

export interface PageIrQualificationHumanAuthorityV1 {
  reviewerName: string;
  currentHashes: z.infer<typeof PageIrQualificationHashesV1Schema>;
}

export function verifyPageIrQualificationHumanReviewV1(
  input: unknown,
  authority: PageIrQualificationHumanAuthorityV1,
): PageIrQualificationHumanReviewV1 {
  const review = PageIrQualificationHumanReviewV1Schema.parse(input);
  const reviewerName = z.string().trim().min(1).max(120).parse(authority.reviewerName);
  const currentHashes = PageIrQualificationHashesV1Schema.parse(authority.currentHashes);
  if (review.reviewerName !== reviewerName) {
    throw new Error("qualification reviewer does not match trusted human authority");
  }
  for (const key of Object.keys(currentHashes) as Array<keyof typeof currentHashes>) {
    if (review.reviewedHashes[key] !== currentHashes[key]) {
      throw new Error(`qualification review is stale for ${key}`);
    }
  }
  return review;
}

const EvaluatedGitShaSchema = z.string().regex(/^[a-f0-9]{40}$|^[a-f0-9]{64}$/);

export const PageIrQualificationPacketHashesV1Schema = z
  .object({
    fixtureSha256: Sha256Schema,
    evaluatedGitSha: EvaluatedGitShaSchema,
    manifestSha256: Sha256Schema,
    registrySha256: Sha256Schema,
    buildSha256: Sha256Schema,
    pageIrSha256: Sha256Schema,
    candidateManifestSha256: Sha256Schema,
    mechanicalChecksSha256: Sha256Schema,
    browserEvidenceSha256: Sha256Schema,
  })
  .strict();
export type PageIrQualificationPacketHashesV1 = z.infer<
  typeof PageIrQualificationPacketHashesV1Schema
>;

export const PageIrQualificationPacketV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: PagePurposeV1Schema,
    hashes: PageIrQualificationPacketHashesV1Schema,
    humanReview: PageIrQualificationHumanReviewV1Schema,
  })
  .strict()
  .superRefine((packet, context) => {
    if (packet.humanReview.fixtureId !== packet.purpose) {
      context.addIssue({
        code: "custom",
        path: ["humanReview", "fixtureId"],
        message: "qualification review must bind the packet purpose",
      });
    }
    const reviewedHashKeys = [
      "buildSha256",
      "pageIrSha256",
      "candidateManifestSha256",
      "mechanicalChecksSha256",
      "browserEvidenceSha256",
    ] as const;
    for (const key of reviewedHashKeys) {
      if (packet.humanReview.reviewedHashes[key] !== packet.hashes[key]) {
        context.addIssue({
          code: "custom",
          path: ["humanReview", "reviewedHashes", key],
          message: `qualification review does not bind packet ${key}`,
        });
      }
    }
  });
export type PageIrQualificationPacketV1 = z.infer<
  typeof PageIrQualificationPacketV1Schema
>;

export interface PageIrQualificationPacketAuthorityV1 {
  reviewerName: string;
  currentHashes: PageIrQualificationPacketHashesV1;
}

export function verifyPageIrQualificationPacketV1(
  input: unknown,
  authority: PageIrQualificationPacketAuthorityV1,
): PageIrQualificationPacketV1 {
  const packet = PageIrQualificationPacketV1Schema.parse(input);
  const currentHashes = PageIrQualificationPacketHashesV1Schema.parse(
    authority.currentHashes,
  );
  for (const key of Object.keys(currentHashes) as Array<keyof typeof currentHashes>) {
    if (packet.hashes[key] !== currentHashes[key]) {
      throw new Error(`qualification packet is stale for ${key}`);
    }
  }
  verifyPageIrQualificationHumanReviewV1(packet.humanReview, {
    reviewerName: authority.reviewerName,
    currentHashes: {
      buildSha256: currentHashes.buildSha256,
      pageIrSha256: currentHashes.pageIrSha256,
      candidateManifestSha256: currentHashes.candidateManifestSha256,
      mechanicalChecksSha256: currentHashes.mechanicalChecksSha256,
      browserEvidenceSha256: currentHashes.browserEvidenceSha256,
    },
  });
  return packet;
}

const PromotionFindingCommonV1Fields = {
  schemaVersion: z.literal(1),
  findingId: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  severity: z.enum(["P0", "critical", "high"]),
  summary: z.string().trim().min(1).max(2_000),
  recordedAt: z.string().datetime({ offset: true }),
};

const PageIrOpenPromotionFindingV1Schema = z
  .object({
    ...PromotionFindingCommonV1Fields,
    disposition: z.literal("open"),
  })
  .strict();

const FixedFindingAuthorityV1Fields = {
  resolution: z.string().trim().min(1).max(4_000),
  authorityName: z.string().trim().min(1).max(120),
  authorityKind: z.enum(["human", "owner"]),
  authorityAttestation: z.literal(true),
  disposedAt: z.string().datetime({ offset: true }),
};

const PageIrFixedPromotionFindingV1Schema = z
  .object({
    ...PromotionFindingCommonV1Fields,
    disposition: z.literal("fixed"),
    ...FixedFindingAuthorityV1Fields,
  })
  .strict();

const PageIrAcceptedPromotionFindingV1Schema = z
  .object({
    ...PromotionFindingCommonV1Fields,
    disposition: z.literal("accepted"),
    ...FixedFindingAuthorityV1Fields,
    authorityKind: z.literal("owner"),
  })
  .strict();

export const PageIrPromotionFindingV1Schema = z.discriminatedUnion(
  "disposition",
  [
    PageIrOpenPromotionFindingV1Schema,
    PageIrFixedPromotionFindingV1Schema,
    PageIrAcceptedPromotionFindingV1Schema,
  ],
);
export type PageIrPromotionFindingV1 = z.infer<
  typeof PageIrPromotionFindingV1Schema
>;

export interface PageIrPromotionFindingAuthorityV1 {
  authorityName: string;
  authorityKind: "human" | "owner";
}

export function verifyPageIrPromotionFindingV1(
  input: unknown,
  authority?: PageIrPromotionFindingAuthorityV1,
): PageIrPromotionFindingV1 {
  const finding = PageIrPromotionFindingV1Schema.parse(input);
  if (finding.disposition === "open") return finding;
  if (
    !authority ||
    finding.authorityName !== authority.authorityName ||
    finding.authorityKind !== authority.authorityKind
  ) {
    throw new Error("finding disposition does not match trusted authority");
  }
  return finding;
}

const PageIrRolloutAuthorityHashesV1Schema = z
  .object({
    evaluatedGitSha: EvaluatedGitShaSchema,
    manifestSha256: Sha256Schema,
    registrySha256: Sha256Schema,
    aggregateSha256: Sha256Schema,
    findingsInventorySha256: Sha256Schema,
  })
  .strict();

const PageIrQualificationPacketHashV1Schema = z
  .object({
    purpose: PagePurposeV1Schema,
    sha256: Sha256Schema,
  })
  .strict();

export const PageIrOwnerRolloutDecisionV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    sequence: z.number().int().positive(),
    previousDecisionSha256: Sha256Schema.nullable(),
    decision: z.enum(["default-on", "opt-in", "reject"]),
    evaluatedGitSha: EvaluatedGitShaSchema,
    manifestSha256: Sha256Schema,
    registrySha256: Sha256Schema,
    aggregateSha256: Sha256Schema,
    findingsInventorySha256: Sha256Schema,
    qualificationPacketHashes: z.array(PageIrQualificationPacketHashV1Schema).max(6),
    ownerName: z.string().trim().min(1).max(120),
    ownerKind: z.literal("owner"),
    ownerAttestation: z.literal(true),
    decidedAt: z.string().datetime({ offset: true }),
    rationale: z.string().trim().min(1).max(4_000),
  })
  .strict()
  .superRefine((record, context) => {
    if ((record.sequence === 1) !== (record.previousDecisionSha256 === null)) {
      context.addIssue({
        code: "custom",
        path: ["previousDecisionSha256"],
        message: "only the first rollout decision may omit its predecessor hash",
      });
    }
    const purposes = record.qualificationPacketHashes.map((entry) => entry.purpose);
    const hashes = record.qualificationPacketHashes.map((entry) => entry.sha256);
    if (new Set(purposes).size !== purposes.length || new Set(hashes).size !== hashes.length) {
      context.addIssue({
        code: "custom",
        path: ["qualificationPacketHashes"],
        message: "qualification packet bindings must be unique",
      });
    }
    for (const [index, entry] of record.qualificationPacketHashes.entries()) {
      if (PAGE_IR_PURPOSES.indexOf(entry.purpose) <= PAGE_IR_PURPOSES.indexOf(purposes[index - 1])) {
        context.addIssue({
          code: "custom",
          path: ["qualificationPacketHashes", index, "purpose"],
          message: "qualification packet bindings must use canonical purpose order",
        });
      }
    }
  });
export type PageIrOwnerRolloutDecisionV1 = z.infer<
  typeof PageIrOwnerRolloutDecisionV1Schema
>;

const PageIrAggregateResultV1Schema = z
  .object({
    evaluationId: z.string().regex(/^EVAL-[A-Z]+-\d{3}$/),
    state: z.enum(["PASS", "FAIL", "BLOCKED", "NOT_RUN"]),
  })
  .strict();

export interface PageIrOwnerRolloutEligibilityAuthorityV1 {
  ownerName: string;
  currentHashes: z.infer<typeof PageIrRolloutAuthorityHashesV1Schema>;
  previousDecision: null | { sequence: number; sha256: string };
  qualificationPackets: ReadonlyArray<{
    sha256: string;
    packet: unknown;
    reviewerName: string;
    currentHashes: PageIrQualificationPacketHashesV1;
  }>;
  blockingEvaluationIds: readonly string[];
  aggregateResults: readonly unknown[];
  findings: ReadonlyArray<{
    record: unknown;
    authority?: PageIrPromotionFindingAuthorityV1;
  }>;
}

export interface PageIrOwnerRolloutEligibilityInputV1 {
  decision: unknown;
  /** Authenticated host authority assembled from sealed packet, aggregate,
   * findings, and frozen-manifest loaders. None of these values may come from
   * sibling decision payload fields or general CLI arguments. */
  authority: PageIrOwnerRolloutEligibilityAuthorityV1;
}

export function verifyPageIrOwnerRolloutEligibilityV1(
  input: PageIrOwnerRolloutEligibilityInputV1,
): { record: PageIrOwnerRolloutDecisionV1; defaultOnEligible: boolean } {
  const record = PageIrOwnerRolloutDecisionV1Schema.parse(input.decision);
  const currentHashes = PageIrRolloutAuthorityHashesV1Schema.parse(
    input.authority.currentHashes,
  );
  const ownerName = z.string().trim().min(1).max(120).parse(input.authority.ownerName);
  if (record.ownerName !== ownerName) {
    throw new Error("rollout decision does not match trusted owner authority");
  }
  for (const key of Object.keys(currentHashes) as Array<keyof typeof currentHashes>) {
    if (record[key] !== currentHashes[key]) {
      throw new Error(`rollout decision is stale for ${key}`);
    }
  }
  const previousDecision = input.authority.previousDecision;
  if (previousDecision === null) {
    if (record.sequence !== 1 || record.previousDecisionSha256 !== null) {
      throw new Error("rollout decision does not begin the append-only history");
    }
  } else {
    const previousSequence = z.number().int().positive().parse(previousDecision.sequence);
    const previousSha256 = Sha256Schema.parse(previousDecision.sha256);
    if (
      record.sequence !== previousSequence + 1 ||
      record.previousDecisionSha256 !== previousSha256
    ) {
      throw new Error("rollout decision does not bind the previous decision");
    }
  }

  const packetBindings = input.authority.qualificationPackets.map((binding) => {
    const sha256 = Sha256Schema.parse(binding.sha256);
    const packet = verifyPageIrQualificationPacketV1(binding.packet, {
      reviewerName: binding.reviewerName,
      currentHashes: binding.currentHashes,
    });
    if (
      packet.hashes.evaluatedGitSha !== currentHashes.evaluatedGitSha ||
      packet.hashes.manifestSha256 !== currentHashes.manifestSha256 ||
      packet.hashes.registrySha256 !== currentHashes.registrySha256
    ) {
      throw new Error(`qualification packet is stale for ${packet.purpose}`);
    }
    return { purpose: packet.purpose, sha256, packet };
  });
  const expectedPacketHashes = packetBindings.map(({ purpose, sha256 }) => ({
    purpose,
    sha256,
  }));
  if (
    record.decision === "default-on" &&
    (packetBindings.length !== PAGE_IR_PURPOSES.length ||
      packetBindings.some((binding, index) => binding.purpose !== PAGE_IR_PURPOSES[index]))
  ) {
    throw new Error("default-on requires exactly six qualification purposes");
  }
  if (JSON.stringify(record.qualificationPacketHashes) !== JSON.stringify(expectedPacketHashes)) {
    throw new Error("rollout decision does not bind the current qualification packet inventory");
  }

  const aggregateResults = input.authority.aggregateResults.map((result) =>
    PageIrAggregateResultV1Schema.parse(result),
  );
  if (new Set(aggregateResults.map((result) => result.evaluationId)).size !== aggregateResults.length) {
    throw new Error("aggregate evaluation result IDs must be unique");
  }
  const blockingEvaluationIds = z
    .array(z.string().regex(/^EVAL-[A-Z]+-\d{3}$/))
    .min(1)
    .parse([...input.authority.blockingEvaluationIds]);
  if (new Set(blockingEvaluationIds).size !== blockingEvaluationIds.length) {
    throw new Error("blocking evaluation IDs must be unique");
  }
  const findings = input.authority.findings.map((binding) =>
    verifyPageIrPromotionFindingV1(binding.record, binding.authority),
  );
  if (new Set(findings.map((finding) => finding.findingId)).size !== findings.length) {
    throw new Error("promotion finding IDs must be unique");
  }

  if (record.decision !== "default-on") {
    return { record, defaultOnEligible: false };
  }
  if (packetBindings.some(({ packet }) => packet.humanReview.decision !== "pass")) {
    throw new Error("default-on requires all named human reviews to PASS");
  }
  const resultsById = new Map(
    aggregateResults.map((result) => [result.evaluationId, result.state]),
  );
  for (const evaluationId of blockingEvaluationIds) {
    if (resultsById.get(evaluationId) !== "PASS") {
      throw new Error(`blocking evaluation ${evaluationId} must PASS for default-on`);
    }
  }
  if (findings.some((finding) => finding.disposition === "open")) {
    throw new Error("default-on cannot contain an unresolved P0, critical, or high finding");
  }
  return { record, defaultOnEligible: true };
}

const PageIrQualityViewportV1Schema = z
  .object({
    id: z.enum(["desktop", "tablet", "mobile"]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export const PageIrQualityCorpusBriefV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    fixtureId: PagePurposeV1Schema,
    purpose: PagePurposeV1Schema,
    fixtureSourceKind: z.literal("synthetic-evaluation"),
    customerApproval: z.literal("not-applicable"),
    audience: BoundedLabelSchema,
    objective: BoundedLabelSchema,
    syntheticFacts: z.array(BoundedLabelSchema).min(1).max(12),
    referenceState: z.discriminatedUnion("mode", [
      z
        .object({ mode: z.literal("selected"), sourceAliases: z.array(IrIdSchema).min(1).max(3) })
        .strict(),
      z
        .object({ mode: z.literal("explicit-none"), reason: BoundedLabelSchema })
        .strict(),
    ]),
    expectedSectionIds: z.array(IrIdSchema).min(1).max(12),
    primaryConversion: z
      .object({
        label: BoundedLabelSchema,
        kind: z.enum(["scroll-to", "call", "email", "external"]),
        actionId: IrIdSchema,
        targetNodeId: IrIdSchema,
      })
      .strict(),
    expectedCoreSelectors: z.array(BoundedLabelSchema).min(1).max(20),
    expectedActionSelectors: z.array(BoundedLabelSchema).min(1).max(20),
    forbiddenOutcomes: z.array(BoundedLabelSchema).min(1).max(20),
    viewports: z.array(PageIrQualityViewportV1Schema).length(3),
  })
  .strict()
  .superRefine((brief, context) => {
    if (brief.fixtureId !== brief.purpose) {
      context.addIssue({ code: "custom", path: ["purpose"], message: "fixture purpose must match its ID" });
    }
    const expectedViewports = [
      ["desktop", 1440, 900],
      ["tablet", 768, 1024],
      ["mobile", 390, 844],
    ] as const;
    if (brief.viewports.some((viewport, index) => {
      const expected = expectedViewports[index];
      return viewport.id !== expected[0] || viewport.width !== expected[1] || viewport.height !== expected[2];
    })) {
      context.addIssue({ code: "custom", path: ["viewports"], message: "quality fixtures use the frozen viewport set" });
    }
  });
export type PageIrQualityCorpusBriefV1 = z.infer<
  typeof PageIrQualityCorpusBriefV1Schema
>;

export const PageIrQualityFixtureManifestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    id: PagePurposeV1Schema,
    purpose: PagePurposeV1Schema,
    providerMode: z.literal("recorded-or-stubbed"),
    inputs: z
      .array(
        z
          .object({
            path: z.enum(["brief.json", "page-ir.json"]),
            sha256: Sha256Schema,
          })
          .strict(),
      )
      .length(2),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.id !== manifest.purpose) {
      context.addIssue({ code: "custom", path: ["purpose"], message: "fixture purpose must match its ID" });
    }
    const paths = manifest.inputs.map((input) => input.path).sort();
    if (paths.join(",") !== "brief.json,page-ir.json") {
      context.addIssue({ code: "custom", path: ["inputs"], message: "fixture inventory must contain both literal sources once" });
    }
  });
export type PageIrQualityFixtureManifestV1 = z.infer<
  typeof PageIrQualityFixtureManifestV1Schema
>;

const RawReferoIdV1Schema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value === value.trim(), {
    message: "raw Refero IDs cannot contain surrounding whitespace",
  })
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
    message: "raw Refero IDs cannot contain control characters",
  });

export const ReferenceTraceSourceV1Schema = z
  .object({
    alias: IrIdSchema,
    sourceKind: z.enum(["refero-style", "refero-screen"]),
    rawReferoId: RawReferoIdV1Schema,
    traits: z.array(BoundedLabelSchema).min(1).max(8),
  })
  .strict()
  .superRefine((source, context) => {
    if (new Set(source.traits).size !== source.traits.length) {
      context.addIssue({
        code: "custom",
        path: ["traits"],
        message: "reference trace traits must be unique",
      });
    }
  });
export type ReferenceTraceSourceV1 = z.infer<typeof ReferenceTraceSourceV1Schema>;

export const ReferenceTraceV1Schema = z
  .discriminatedUnion("mode", [
    z
      .object({
        mode: z.literal("selected"),
        sources: z
          .array(ReferenceTraceSourceV1Schema)
          .min(1)
          .max(PAGE_IR_BOUNDS.maxReferenceSources),
      })
      .strict(),
    z
      .object({
        mode: z.literal("explicit-none"),
        sources: z.array(z.never()).length(0),
      })
      .strict(),
  ])
  .superRefine((trace, context) => {
    if (trace.mode !== "selected") return;
    const aliases = trace.sources.map((source) => source.alias);
    const rawIds = trace.sources.map((source) => source.rawReferoId);
    if (new Set(aliases).size !== aliases.length) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "reference trace aliases must be unique",
      });
    }
    if (new Set(rawIds).size !== rawIds.length) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "reference trace raw IDs must be unique",
      });
    }
  });
export type ReferenceTraceV1 = z.infer<typeof ReferenceTraceV1Schema>;

export const PageIrLayoutDecisionV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: PagePurposeV1Schema,
    sourceVersions: z
      .object({
        evidence: z.number().int().positive(),
        designContract: z.number().int().positive(),
        tokenInventory: z.number().int().positive(),
        tailwindPlan: z.number().int().positive(),
        cssArchitecture: z.number().int().positive(),
      })
      .strict(),
    referenceContract: ReferenceContractV1Schema,
    referenceTrace: ReferenceTraceV1Schema,
    layoutProgram: LayoutProgramV1Schema,
    slotBindings: z.array(SlotBindingV1Schema).max(PAGE_IR_BOUNDS.maxNodes),
    nodeTokenBindings: z
      .array(NodeTokenBindingV1Schema)
      .max(PAGE_IR_BOUNDS.maxNodes),
    accessibility: PageAccessibilityV1Schema,
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.referenceContract.selection.mode !== decision.referenceTrace.mode) {
      context.addIssue({
        code: "custom",
        path: ["referenceTrace", "mode"],
        message: "reference trace mode must match the reference contract",
      });
    }
  });
export type PageIrLayoutDecisionV1 = z.infer<
  typeof PageIrLayoutDecisionV1Schema
>;

export const PageIrContentV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    sourceLayoutDecisionVersion: z.number().int().positive(),
    content: z.array(ContentEntryV1Schema).max(PAGE_IR_BOUNDS.maxContent),
    actions: z.array(ActionV1Schema).max(PAGE_IR_BOUNDS.maxActions),
  })
  .strict();
export type PageIrContentV1 = z.infer<typeof PageIrContentV1Schema>;

export const PageIrAssetsV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    sourceLayoutDecisionVersion: z.number().int().positive(),
    assets: z.array(AssetV1Schema).max(PAGE_IR_BOUNDS.maxAssets),
  })
  .strict();
export type PageIrAssetsV1 = z.infer<typeof PageIrAssetsV1Schema>;

/** Closed response contract for the one cost-tracked PageIR source-draft call.
 * Phase 1 is deliberately assetless until claimed-upload path and dimension
 * bindings can be proven end-to-end. */
export const PageIrGeneratedSourcesV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    layoutDecision: PageIrLayoutDecisionV1Schema,
    content: PageIrContentV1Schema,
    assets: PageIrAssetsV1Schema,
  })
  .strict()
  .superRefine((sources, context) => {
    if (sources.content.sourceLayoutDecisionVersion !== 1) {
      context.addIssue({
        code: "custom",
        path: ["content", "sourceLayoutDecisionVersion"],
        message: "generated content must bind layout-decision v1",
      });
    }
    if (sources.assets.sourceLayoutDecisionVersion !== 1) {
      context.addIssue({
        code: "custom",
        path: ["assets", "sourceLayoutDecisionVersion"],
        message: "generated assets must bind layout-decision v1",
      });
    }
    if (sources.assets.assets.length !== 0) {
      context.addIssue({
        code: "custom",
        path: ["assets", "assets"],
        message: "Phase 1 generated PageIR sources must be assetless",
      });
    }
    if (
      sources.layoutDecision.layoutProgram.nodes.some(
        (node) => node.kind === "slot" && node.slotType === "media",
      ) ||
      sources.layoutDecision.slotBindings.some(
        (binding) => binding.kind === "media",
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["layoutDecision"],
        message: "assetless PageIR sources cannot declare media slots",
      });
    }
  });
export type PageIrGeneratedSourcesV1 = z.infer<
  typeof PageIrGeneratedSourcesV1Schema
>;

export const MAX_PAGE_IR_ARTIFACT_BYTES = 8 * 1_024 * 1_024;
export const PageIrArtifactBindingV1Schema = z
  .object({
    kind: PageIrDerivationKindSchema,
    runId: RunIdSchema,
    version: z.number().int().positive(),
    approvalState: z.literal("approved"),
    sha256: Sha256Schema,
    bytes: z
      .instanceof(Uint8Array)
      .refine((bytes) => bytes.byteLength <= MAX_PAGE_IR_ARTIFACT_BYTES, {
        message: "artifact bytes exceed the supported maximum",
      }),
  })
  .strict();
export type PageIrArtifactBindingV1 = z.infer<
  typeof PageIrArtifactBindingV1Schema
>;

export const PageIrDerivationRequestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    runId: RunIdSchema,
    bindings: z
      .array(PageIrArtifactBindingV1Schema)
      .length(PAGE_IR_DERIVATION_KINDS.length),
  })
  .strict()
  .superRefine((request, context) => {
    const kinds = request.bindings.map((binding) => binding.kind);
    if (
      new Set(kinds).size !== PAGE_IR_DERIVATION_KINDS.length ||
      PAGE_IR_DERIVATION_KINDS.some((kind) => !kinds.includes(kind))
    ) {
      context.addIssue({
        code: "custom",
        path: ["bindings"],
        message: "Page IR derivation requires the exact binding set",
      });
    }
  });
export type PageIrDerivationRequestV1 = z.infer<
  typeof PageIrDerivationRequestV1Schema
>;

export const PageIrLineageSourceV1Schema = z
  .object({
    kind: PageIrDerivationKindSchema,
    version: z.number().int().positive(),
    sha256: Sha256Schema,
  })
  .strict();

export const PageIrLineageV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    runId: RunIdSchema,
    purpose: PagePurposeV1Schema,
    sources: z
      .array(PageIrLineageSourceV1Schema)
      .length(PAGE_IR_DERIVATION_KINDS.length),
    referenceTrace: ReferenceTraceV1Schema,
  })
  .strict()
  .superRefine((lineage, context) => {
    for (const [index, expectedKind] of PAGE_IR_DERIVATION_KINDS.entries()) {
      if (lineage.sources[index]?.kind !== expectedKind) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "kind"],
          message: "lineage sources must use the fixed artifact order",
        });
      }
    }
  });
export type PageIrLineageV1 = z.infer<typeof PageIrLineageV1Schema>;

export const PageIrEditorIdentityEntryV1Schema = z
  .object({
    editId: PageIrEditorIdSchema,
    nodeId: PageIrEditorIdSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.editId !== entry.nodeId) {
      context.addIssue({
        code: "custom",
        path: ["nodeId"],
        message: "Page IR editor identity must equal its source node ID",
      });
    }
  });
export type PageIrEditorIdentityEntryV1 = z.infer<
  typeof PageIrEditorIdentityEntryV1Schema
>;

export const PageIrEditorSourceMapV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    pageIrSha256: Sha256Schema,
    bindingSetSha256: Sha256Schema,
    lineage: PageIrLineageV1Schema,
    entries: z
      .array(PageIrEditorIdentityEntryV1Schema)
      .min(1)
      .max(PAGE_IR_BOUNDS.maxNodes),
  })
  .strict()
  .superRefine((sourceMap, context) => {
    const editIds = new Set<string>();
    const nodeIds = new Set<string>();
    for (const [index, entry] of sourceMap.entries.entries()) {
      if (editIds.has(entry.editId)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "editId"],
          message: "Page IR editor IDs must be unique",
        });
      }
      if (nodeIds.has(entry.nodeId)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "nodeId"],
          message: "Page IR source node IDs must be unique",
        });
      }
      if (index > 0 && sourceMap.entries[index - 1].editId >= entry.editId) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "editId"],
          message: "Page IR editor source-map entries must be sorted by edit ID",
        });
      }
      editIds.add(entry.editId);
      nodeIds.add(entry.nodeId);
    }
  });
export type PageIrEditorSourceMapV1 = z.infer<
  typeof PageIrEditorSourceMapV1Schema
>;

export const PAGE_IR_SOURCE_BUNDLE_UPSTREAM_KINDS = [
  "evidence",
  "design-contract",
  "token-inventory",
  "tailwind-plan",
  "css-architecture",
] as const;
export const PAGE_IR_SOURCE_BUNDLE_ARTIFACT_KINDS = [
  "layout-decision",
  "content",
  "assets",
] as const;

const PageIrSourceBundleUpstreamBindingV1Schema = z
  .object({
    kind: z.enum(PAGE_IR_SOURCE_BUNDLE_UPSTREAM_KINDS),
    version: z.number().int().positive().max(1_000_000),
    sha256: Sha256Schema,
  })
  .strict();

const PageIrSourceBundleArtifactV1Schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("layout-decision"),
      version: z.number().int().positive().max(1_000_000),
      sha256: Sha256Schema,
      sourceVersions: z
        .object({
          evidence: z.number().int().positive().max(1_000_000),
          designContract: z.number().int().positive().max(1_000_000),
          tokenInventory: z.number().int().positive().max(1_000_000),
          tailwindPlan: z.number().int().positive().max(1_000_000),
          cssArchitecture: z.number().int().positive().max(1_000_000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("content"),
      version: z.number().int().positive().max(1_000_000),
      sha256: Sha256Schema,
      sourceLayoutDecisionVersion: z.number().int().positive().max(1_000_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("assets"),
      version: z.number().int().positive().max(1_000_000),
      sha256: Sha256Schema,
      sourceLayoutDecisionVersion: z.number().int().positive().max(1_000_000),
    })
    .strict(),
]);

export const PageIrSourceBundleReviewCriteriaV1Schema = z
  .object({
    layoutDecision: z.literal("pass"),
    content: z.literal("pass"),
    assets: z.literal("pass"),
    upstreamBindings: z.literal("pass"),
    sourceChain: z.literal("pass"),
  })
  .strict();

export const PageIrSourceBundleHumanReviewV1Schema = z
  .object({
    reviewerName: z.string().trim().min(1).max(120),
    reviewerKind: z.literal("human"),
    humanAttestation: z.literal(true),
    reviewedAt: z.string().datetime({ offset: true }),
    payloadSha256: Sha256Schema,
    criteria: PageIrSourceBundleReviewCriteriaV1Schema,
  })
  .strict();
export type PageIrSourceBundleHumanReviewV1 = z.infer<
  typeof PageIrSourceBundleHumanReviewV1Schema
>;

export const PageIrSourceBundleReviewStateV1Schema = z.enum([
  "draft",
  "in-review",
  "approved",
  "rejected",
  "superseded",
]);
export type PageIrSourceBundleReviewStateV1 = z.infer<
  typeof PageIrSourceBundleReviewStateV1Schema
>;

export const PAGE_IR_SOURCE_BUNDLE_REVIEW_TRANSITIONS = Object.freeze({
  draft: Object.freeze(["in-review", "rejected"] as const),
  "in-review": Object.freeze(["approved", "rejected"] as const),
  approved: Object.freeze(["superseded"] as const),
  rejected: Object.freeze(["superseded"] as const),
  superseded: Object.freeze([] as const),
}) satisfies Readonly<
  Record<
    PageIrSourceBundleReviewStateV1,
    readonly PageIrSourceBundleReviewStateV1[]
  >
>;

export const PageIrSourceBundleReviewTransitionV1Schema = z
  .object({
    state: PageIrSourceBundleReviewStateV1Schema,
    at: z.string().datetime({ offset: true }),
    actorKind: z.enum(["human", "system", "model"]),
    actorName: z.string().trim().min(1).max(120),
    note: z.string().trim().min(1).max(2_000).optional(),
    humanReview: PageIrSourceBundleHumanReviewV1Schema.optional(),
  })
  .strict();
export type PageIrSourceBundleReviewTransitionV1 = z.infer<
  typeof PageIrSourceBundleReviewTransitionV1Schema
>;

export const PageIrSourceBundleV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    runId: RunIdSchema,
    bundleVersion: z.number().int().positive().max(1_000_000),
    payloadSha256: Sha256Schema,
    upstreamBindings: z
      .array(PageIrSourceBundleUpstreamBindingV1Schema)
      .length(PAGE_IR_SOURCE_BUNDLE_UPSTREAM_KINDS.length),
    sourceArtifacts: z
      .array(PageIrSourceBundleArtifactV1Schema)
      .length(PAGE_IR_SOURCE_BUNDLE_ARTIFACT_KINDS.length),
    reviewTransitions: z
      .array(PageIrSourceBundleReviewTransitionV1Schema)
      .min(1)
      .max(8),
  })
  .strict()
  .superRefine((bundle, context) => {
    for (const [
      index,
      kind,
    ] of PAGE_IR_SOURCE_BUNDLE_UPSTREAM_KINDS.entries()) {
      if (bundle.upstreamBindings[index]?.kind !== kind) {
        context.addIssue({
          code: "custom",
          path: ["upstreamBindings", index, "kind"],
          message: "source bundle upstream bindings must use the fixed order",
        });
      }
    }
    for (const [
      index,
      kind,
    ] of PAGE_IR_SOURCE_BUNDLE_ARTIFACT_KINDS.entries()) {
      if (bundle.sourceArtifacts[index]?.kind !== kind) {
        context.addIssue({
          code: "custom",
          path: ["sourceArtifacts", index, "kind"],
          message: "source bundle artifacts must use the fixed order",
        });
      }
    }

    const layout = bundle.sourceArtifacts[0];
    const content = bundle.sourceArtifacts[1];
    const assets = bundle.sourceArtifacts[2];
    if (layout?.kind === "layout-decision") {
      const upstreamVersions = Object.fromEntries(
        bundle.upstreamBindings.map((binding) => [
          binding.kind,
          binding.version,
        ]),
      );
      const expected = {
        evidence: upstreamVersions.evidence,
        designContract: upstreamVersions["design-contract"],
        tokenInventory: upstreamVersions["token-inventory"],
        tailwindPlan: upstreamVersions["tailwind-plan"],
        cssArchitecture: upstreamVersions["css-architecture"],
      };
      if (JSON.stringify(layout.sourceVersions) !== JSON.stringify(expected)) {
        context.addIssue({
          code: "custom",
          path: ["sourceArtifacts", 0, "sourceVersions"],
          message: "layout decision must bind the exact upstream versions",
        });
      }
      if (
        content?.kind !== "content" ||
        content.sourceLayoutDecisionVersion !== layout.version
      ) {
        context.addIssue({
          code: "custom",
          path: ["sourceArtifacts", 1, "sourceLayoutDecisionVersion"],
          message: "content and assets must bind the layout-decision version",
        });
      }
      if (
        assets?.kind !== "assets" ||
        assets.sourceLayoutDecisionVersion !== layout.version
      ) {
        context.addIssue({
          code: "custom",
          path: ["sourceArtifacts", 2, "sourceLayoutDecisionVersion"],
          message: "content and assets must bind the layout-decision version",
        });
      }
    }

    const first = bundle.reviewTransitions[0];
    if (first?.state !== "draft") {
      context.addIssue({
        code: "custom",
        path: ["reviewTransitions", 0, "state"],
        message: "source bundle review must begin in draft",
      });
    }
    for (const [index, transition] of bundle.reviewTransitions.entries()) {
      if (index > 0) {
        const previous = bundle.reviewTransitions[index - 1];
        const allowed = PAGE_IR_SOURCE_BUNDLE_REVIEW_TRANSITIONS[
          previous.state
        ] as readonly PageIrSourceBundleReviewStateV1[];
        if (!allowed.includes(transition.state)) {
          context.addIssue({
            code: "custom",
            path: ["reviewTransitions", index, "state"],
            message: `invalid source bundle review transition: ${previous.state} -> ${transition.state}`,
          });
        }
        if (Date.parse(transition.at) < Date.parse(previous.at)) {
          context.addIssue({
            code: "custom",
            path: ["reviewTransitions", index, "at"],
            message: "source bundle review timestamps must be monotonic",
          });
        }
      }
      if (transition.state === "approved") {
        const review = transition.humanReview;
        if (
          transition.actorKind !== "human" ||
          !review ||
          transition.actorName !== review.reviewerName ||
          transition.at !== review.reviewedAt ||
          review.payloadSha256 !== bundle.payloadSha256
        ) {
          context.addIssue({
            code: "custom",
            path: ["reviewTransitions", index, "humanReview"],
            message:
              "source bundle approval requires one named attested human review bound to the immutable payload",
          });
        }
      } else if (transition.humanReview) {
        context.addIssue({
          code: "custom",
          path: ["reviewTransitions", index, "humanReview"],
          message: "only source bundle approval may carry a human review",
        });
      }
      if (
        transition.state === "in-review" &&
        transition.actorKind !== "human"
      ) {
        context.addIssue({
          code: "custom",
          path: ["reviewTransitions", index, "actorKind"],
          message: "source bundle review must be claimed by a named human",
        });
      }
    }
  });
export type PageIrSourceBundleV1 = z.infer<typeof PageIrSourceBundleV1Schema>;

export const PageIrSourceGenerationCheckpointV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    runId: RunIdSchema,
    createdAt: z.string().datetime({ offset: true }),
    model: z.string().trim().min(1).max(200),
    inputSha256: Sha256Schema,
    upstreamBindings: z
      .array(PageIrSourceBundleUpstreamBindingV1Schema)
      .length(PAGE_IR_SOURCE_BUNDLE_UPSTREAM_KINDS.length),
    sourceSha256: Sha256Schema,
    sources: PageIrGeneratedSourcesV1Schema,
  })
  .strict()
  .superRefine((checkpoint, context) => {
    for (const [index, kind] of PAGE_IR_SOURCE_BUNDLE_UPSTREAM_KINDS.entries()) {
      if (checkpoint.upstreamBindings[index]?.kind !== kind) {
        context.addIssue({
          code: "custom",
          path: ["upstreamBindings", index, "kind"],
          message: "source generation bindings must use the fixed order",
        });
      }
    }
  });
export type PageIrSourceGenerationCheckpointV1 = z.infer<
  typeof PageIrSourceGenerationCheckpointV1Schema
>;

export const PersistedPageIrV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    runId: RunIdSchema,
    revision: z.number().int().positive().max(1_000_000),
    pageIr: PageIRV1Schema,
    pageIrSha256: Sha256Schema,
    bindingSetSha256: Sha256Schema,
    lineage: PageIrLineageV1Schema,
  })
  .strict()
  .superRefine((envelope, context) => {
    if (envelope.lineage.runId !== envelope.runId) {
      context.addIssue({
        code: "custom",
        path: ["lineage", "runId"],
        message: "persisted Page IR lineage must match the envelope run",
      });
    }
  });
export type PersistedPageIrV1 = z.infer<typeof PersistedPageIrV1Schema>;

function isSafeCandidateRelativePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

export const CandidateRelativePathSchema = z
  .string()
  .refine(isSafeCandidateRelativePath, "unsafe candidate relative path");

export const MAX_CANDIDATE_BYTES = 100 * 1024 * 1024;

export const CandidateFileRecordSchema = z
  .object({
    path: CandidateRelativePathSchema,
    sizeBytes: z.number().int().nonnegative().safe().max(MAX_CANDIDATE_BYTES),
    sha256: Sha256Schema,
  })
  .strict();
export type CandidateFileRecord = z.infer<typeof CandidateFileRecordSchema>;

export const CandidateManifestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    entry: z.literal("index.html"),
    files: z.array(CandidateFileRecordSchema).min(1),
    totalBytes: z
      .number()
      .int()
      .nonnegative()
      .safe()
      .max(MAX_CANDIDATE_BYTES),
    buildSha256: Sha256Schema,
  })
  .strict()
  .superRefine((manifest, context) => {
    let previousPath: string | undefined;
    let totalBytes = 0;
    for (const [index, file] of manifest.files.entries()) {
      if (previousPath !== undefined && file.path <= previousPath) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "candidate files must be sorted and unique by path",
        });
      }
      previousPath = file.path;
      totalBytes += file.sizeBytes;
    }
    if (!manifest.files.some((file) => file.path === manifest.entry)) {
      context.addIssue({
        code: "custom",
        path: ["entry"],
        message: "candidate manifest must inventory index.html",
      });
    }
    if (totalBytes !== manifest.totalBytes) {
      context.addIssue({
        code: "custom",
        path: ["totalBytes"],
        message: "candidate totalBytes must equal the file inventory total",
      });
    }
    if (totalBytes > MAX_CANDIDATE_BYTES) {
      context.addIssue({
        code: "custom",
        path: ["totalBytes"],
        message: "candidate inventory exceeds 100 MiB",
      });
    }
  });
export type CandidateManifestV1 = z.infer<typeof CandidateManifestV1Schema>;

export const CANDIDATE_STATES = [
  "preparing",
  "ready-for-gates",
  "failed",
  "promotable",
  "promoted",
  "abandoned",
] as const;
export const CandidateStateSchema = z.enum(CANDIDATE_STATES);
export type CandidateState = z.infer<typeof CandidateStateSchema>;

export const CANDIDATE_STATE_TRANSITIONS = Object.freeze({
  preparing: Object.freeze(["ready-for-gates", "failed", "abandoned"] as const),
  "ready-for-gates": Object.freeze(["promotable", "failed", "abandoned"] as const),
  failed: Object.freeze(["preparing", "abandoned"] as const),
  promotable: Object.freeze(["promoted", "failed", "abandoned"] as const),
  promoted: Object.freeze([] as const),
  abandoned: Object.freeze([] as const),
}) satisfies Readonly<Record<CandidateState, readonly CandidateState[]>>;

export const CandidateLifecycleEventSchema = z
  .object({
    state: CandidateStateSchema,
    at: z.string().datetime({ offset: true }),
  })
  .strict();
export type CandidateLifecycleEvent = z.infer<
  typeof CandidateLifecycleEventSchema
>;

export const CandidateInputArtifactHashSchema = z
  .object({
    path: CandidateRelativePathSchema,
    sha256: Sha256Schema,
  })
  .strict();

export const CandidateProvenanceV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    candidateId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    runId: RunIdSchema,
    createdAt: z.string().datetime({ offset: true }),
    state: CandidateStateSchema,
    history: z.array(CandidateLifecycleEventSchema).min(1),
    inputArtifactHashes: z.array(CandidateInputArtifactHashSchema).min(1),
    layoutAuthority: z.enum(["page-ir-v1", "template-v1"]),
    compilerVersion: z.string().min(1).max(200),
    pageIrSha256: Sha256Schema.optional(),
    editorSourceMap: PageIrEditorSourceMapV1Schema.optional(),
    candidateManifestSha256: Sha256Schema.optional(),
    buildSha256: Sha256Schema.optional(),
    gateReportSha256: Sha256Schema.optional(),
    promotedBuildSha256: Sha256Schema.optional(),
  })
  .strict()
  .superRefine((provenance, context) => {
    const first = provenance.history[0];
    if (!first) return;
    if (first.state !== "preparing") {
      context.addIssue({
        code: "custom",
        path: ["history", 0, "state"],
        message: "candidate history must begin in preparing",
      });
    }
    if (first.at !== provenance.createdAt) {
      context.addIssue({
        code: "custom",
        path: ["createdAt"],
        message: "candidate createdAt must equal its preparing transition",
      });
    }
    for (let index = 1; index < provenance.history.length; index += 1) {
      const previous = provenance.history[index - 1];
      const current = provenance.history[index];
      if (Date.parse(current.at) < Date.parse(previous.at)) {
        context.addIssue({
          code: "custom",
          path: ["history", index, "at"],
          message: "candidate transition timestamps must be monotonic",
        });
      }
      const allowed = CANDIDATE_STATE_TRANSITIONS[
        previous.state
      ] as readonly CandidateState[];
      if (!allowed.includes(current.state)) {
        context.addIssue({
          code: "custom",
          path: ["history", index, "state"],
          message: `illegal candidate transition ${previous.state} -> ${current.state}`,
        });
      }
    }
    const last = provenance.history[provenance.history.length - 1];
    if (last.state !== provenance.state) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "candidate state must match the last history transition",
      });
    }

    let previousInputPath: string | undefined;
    for (const [index, input] of provenance.inputArtifactHashes.entries()) {
      if (previousInputPath !== undefined && input.path <= previousInputPath) {
        context.addIssue({
          code: "custom",
          path: ["inputArtifactHashes", index, "path"],
          message: "input artifact hashes must be sorted and unique by path",
        });
      }
      previousInputPath = input.path;
    }

    if (provenance.layoutAuthority === "page-ir-v1" && !provenance.pageIrSha256) {
      context.addIssue({
        code: "custom",
        path: ["pageIrSha256"],
        message: "page-ir-v1 authority requires a Page IR SHA-256",
      });
    }
    if (provenance.layoutAuthority === "template-v1" && provenance.pageIrSha256) {
      context.addIssue({
        code: "custom",
        path: ["pageIrSha256"],
        message: "template-v1 authority rejects a Page IR SHA-256",
      });
    }
    if (
      provenance.layoutAuthority === "page-ir-v1" &&
      provenance.compilerVersion === "page-ir-static@3" &&
      !provenance.editorSourceMap
    ) {
      context.addIssue({
        code: "custom",
        path: ["editorSourceMap"],
        message: "page-ir-static@3 provenance requires an editor source map",
      });
    }
    if (provenance.layoutAuthority === "template-v1" && provenance.editorSourceMap) {
      context.addIssue({
        code: "custom",
        path: ["editorSourceMap"],
        message: "template-v1 authority rejects an editor source map",
      });
    }
    if (
      provenance.layoutAuthority === "page-ir-v1" &&
      provenance.editorSourceMap
    ) {
      if (provenance.editorSourceMap.pageIrSha256 !== provenance.pageIrSha256) {
        context.addIssue({
          code: "custom",
          path: ["editorSourceMap", "pageIrSha256"],
          message: "editor source map must match the provenance Page IR SHA-256",
        });
      }
      if (provenance.editorSourceMap.lineage.runId !== provenance.runId) {
        context.addIssue({
          code: "custom",
          path: ["editorSourceMap", "lineage", "runId"],
          message: "editor source map lineage must match the provenance run",
        });
      }
    }
    const manifestBound = Boolean(provenance.candidateManifestSha256);
    const buildBound = Boolean(provenance.buildSha256);
    const reachedReadyForGates = provenance.history.some(
      (event) => event.state === "ready-for-gates",
    );
    const reachedPromotable = provenance.history.some(
      (event) => event.state === "promotable",
    );
    if (manifestBound !== buildBound) {
      context.addIssue({
        code: "custom",
        path: [manifestBound ? "buildSha256" : "candidateManifestSha256"],
        message: "candidate manifest and build SHA-256 bindings must appear together",
      });
    }
    if (provenance.gateReportSha256 && (!manifestBound || !buildBound)) {
      context.addIssue({
        code: "custom",
        path: ["gateReportSha256"],
        message: "a gate report binding requires manifest and build bindings",
      });
    }
    if (
      ["ready-for-gates", "promotable", "promoted"].includes(
        provenance.state,
      ) &&
      (!manifestBound || !buildBound)
    ) {
      context.addIssue({
        code: "custom",
        path: ["candidateManifestSha256"],
        message: `${provenance.state} requires manifest and build bindings`,
      });
    }
    if (reachedReadyForGates && (!manifestBound || !buildBound)) {
      context.addIssue({
        code: "custom",
        path: ["candidateManifestSha256"],
        message:
          "history that reached ready-for-gates requires manifest and build bindings",
      });
    }
    if (
      ["promotable", "promoted"].includes(provenance.state) &&
      !provenance.gateReportSha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["gateReportSha256"],
        message: `${provenance.state} requires a candidate gate report binding`,
      });
    }
    if (reachedPromotable && !provenance.gateReportSha256) {
      context.addIssue({
        code: "custom",
        path: ["gateReportSha256"],
        message:
          "history that reached promotable requires a candidate gate report binding",
      });
    }
    if (provenance.state === "promoted" && !provenance.promotedBuildSha256) {
      context.addIssue({
        code: "custom",
        path: ["promotedBuildSha256"],
        message: "promoted requires a promoted build binding",
      });
    }
    if (
      provenance.state !== "promoted" &&
      provenance.promotedBuildSha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["promotedBuildSha256"],
        message: "only promoted provenance may carry a promoted build binding",
      });
    }
    if (
      provenance.promotedBuildSha256 &&
      provenance.promotedBuildSha256 !== provenance.buildSha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["promotedBuildSha256"],
        message: "promoted build SHA-256 must match the candidate build SHA-256",
      });
    }
  });
export type CandidateProvenanceV1 = z.infer<
  typeof CandidateProvenanceV1Schema
>;

export const BuildProvenanceV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    runId: RunIdSchema,
    layoutAuthority: LayoutAuthoritySchema,
    rolloutDecision: PageIrRolloutDecisionV1Schema.optional(),
    inputArtifactHashes: z.array(CandidateInputArtifactHashSchema).min(1),
    pageIrSha256: Sha256Schema.optional(),
    compilerVersion: z.string().min(1).max(200),
    candidateManifestSha256: Sha256Schema.optional(),
    candidateBuildSha256: Sha256Schema.optional(),
    gateReportSha256: Sha256Schema.optional(),
    promotedBuildSha256: Sha256Schema.optional(),
    reviewSha256: Sha256Schema.optional(),
    reviewBuildSha256: Sha256Schema.optional(),
    fallback: z
      .object({
        relationship: z.enum(["source", "child"]),
        linkedRunId: RunIdSchema,
        reason: TemplateFallbackReasonSchema,
        failedStage: z.enum(STAGES),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((provenance, context) => {
    if (
      provenance.rolloutDecision &&
      provenance.rolloutDecision.layoutAuthority !== provenance.layoutAuthority
    ) {
      context.addIssue({
        code: "custom",
        path: ["rolloutDecision"],
        message: "rollout decision must match run layout authority",
      });
    }
    if (provenance.layoutAuthority === "page-ir-v1" && !provenance.pageIrSha256) {
      context.addIssue({
        code: "custom",
        path: ["pageIrSha256"],
        message: "Page IR provenance requires the persisted Page IR hash",
      });
    }
    if (provenance.layoutAuthority === "template-v1" && provenance.pageIrSha256) {
      context.addIssue({
        code: "custom",
        path: ["pageIrSha256"],
        message: "template provenance cannot carry a Page IR hash",
      });
    }
    if (
      Boolean(provenance.candidateManifestSha256) !==
      Boolean(provenance.candidateBuildSha256)
    ) {
      context.addIssue({
        code: "custom",
        path: ["candidateBuildSha256"],
        message: "candidate manifest and build hashes must be linked together",
      });
    }
    if (
      provenance.promotedBuildSha256 &&
      provenance.promotedBuildSha256 !== provenance.candidateBuildSha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["promotedBuildSha256"],
        message: "promoted build must match the candidate build",
      });
    }
    if (Boolean(provenance.reviewSha256) !== Boolean(provenance.reviewBuildSha256)) {
      context.addIssue({
        code: "custom",
        path: ["reviewSha256"],
        message: "review hash and reviewed build hash must be linked together",
      });
    }
    if (
      provenance.reviewBuildSha256 &&
      provenance.reviewBuildSha256 !== provenance.promotedBuildSha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["reviewBuildSha256"],
        message: "review must bind the exact promoted build",
      });
    }
  });
export type BuildProvenanceV1 = z.infer<typeof BuildProvenanceV1Schema>;

export const SiteManifestSchema = z.object({
  entry: z.string(), // "index.html"
  files: z.array(z.string()), // relative paths only, no ".." — validated
  assets: z.array(
    z.object({
      path: z.string(),
      kind: z.enum(["image", "css", "js", "font"]),
      generatedBy: z.string().optional(), // e.g. "higgsfield:gpt-image-2"
    })
  ),
  builtAt: z.string(),
  complete: z.boolean(), // atomic completion marker — preview refuses incomplete
});
export type SiteManifest = z.infer<typeof SiteManifestSchema>;

// ---------- Gates ----------

export const GateReportSchema = z.object({
  gate: z.string(),
  pass: z.boolean(),
  blocking: z.boolean(),
  details: z.array(z.string()),
  ranAt: z.string(),
});
export type GateReport = z.infer<typeof GateReportSchema>;

export const MutationCapabilitySchema = z.enum([
  "content",
  "token-style",
  "asset",
  "structure",
  "link-action",
  "motion",
]);
export type MutationCapability = z.infer<typeof MutationCapabilitySchema>;

const MutationModelCapabilitiesSchema = z
  .array(MutationCapabilitySchema)
  .min(1);
const MutationGateMatrixVersionV1Schema = z
  .string()
  .regex(/^1:[a-f0-9]{64}$/);

/** Closed V1 description of the deterministic mutation classification plus
 * an optional advisory model hint. The hint may widen gate execution but can
 * never replace the deterministic capability. */
export const MutationGateRequestV1Schema = z.discriminatedUnion(
  "classification",
  [
    z
      .object({
        schemaVersion: z.literal(1),
        matrixVersion: MutationGateMatrixVersionV1Schema,
        classification: z.literal("known"),
        capabilities: z.array(MutationCapabilitySchema).length(1),
        modelCapabilities: MutationModelCapabilitiesSchema.optional(),
      })
      .strict(),
    z
      .object({
        schemaVersion: z.literal(1),
        matrixVersion: MutationGateMatrixVersionV1Schema,
        classification: z.literal("mixed"),
        capabilities: z.array(MutationCapabilitySchema).min(2),
        modelCapabilities: MutationModelCapabilitiesSchema.optional(),
      })
      .strict(),
    z
      .object({
        schemaVersion: z.literal(1),
        matrixVersion: MutationGateMatrixVersionV1Schema,
        classification: z.literal("unknown"),
        modelCapabilities: MutationModelCapabilitiesSchema.optional(),
      })
      .strict(),
    z
      .object({
        schemaVersion: z.literal(1),
        matrixVersion: MutationGateMatrixVersionV1Schema,
        classification: z.literal("uncertain"),
        capabilities: z.array(MutationCapabilitySchema).min(1).optional(),
        modelCapabilities: MutationModelCapabilitiesSchema.optional(),
      })
      .strict(),
  ],
);
export type MutationGateRequestV1 = z.infer<
  typeof MutationGateRequestV1Schema
>;

export const CANDIDATE_GATE_EXPECTATIONS = [
  { gate: "token-drift", blocking: true },
  { gate: "color-role-compliance", blocking: true },
  { gate: "axe", blocking: true },
  { gate: "contrast", blocking: true },
  { gate: "console-errors", blocking: true },
  { gate: "assets", blocking: true },
  { gate: "no-js", blocking: true },
  { gate: "mobile-layout", blocking: true },
  { gate: "perf-budget", blocking: false },
] as const;

const CandidateGateReportSchema = GateReportSchema.strict();

export const CandidateGateReceiptV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    runId: RunIdSchema,
    candidateManifestSha256: Sha256Schema,
    buildSha256: Sha256Schema,
    reports: z
      .array(CandidateGateReportSchema)
      .length(CANDIDATE_GATE_EXPECTATIONS.length),
  })
  .strict()
  .superRefine((receipt, context) => {
    for (const [index, expected] of CANDIDATE_GATE_EXPECTATIONS.entries()) {
      if (receipt.reports[index]?.gate !== expected.gate) {
        context.addIssue({
          code: "custom",
          path: ["reports", index, "gate"],
          message: `candidate gate ${index + 1} must be ${expected.gate}`,
        });
      }
      if (receipt.reports[index]?.blocking !== expected.blocking) {
        context.addIssue({
          code: "custom",
          path: ["reports", index, "blocking"],
          message: `candidate gate ${expected.gate} blocking must be ${expected.blocking}`,
        });
      }
    }
  });
export type CandidateGateReceiptV1 = z.infer<
  typeof CandidateGateReceiptV1Schema
>;

// ---------- Editor ----------

const EditorEvidenceSchema = z.object({
  screenId: z.string().min(1).max(160),
  /** Run-relative Refero thumbnail path, never an arbitrary URL. */
  thumbnailPath: z.string().regex(/^research\/refero\/assistant\/[a-zA-Z0-9._-]+$/),
  siteName: z.string().min(1).max(160),
  takeaway: z.string().min(1).max(200),
});

const EditorSuggestionSchema = z.object({
  id: z.string().min(1).max(120),
  /** Live data-edit-id, validated against the generated site at turn time. */
  editId: z.string().min(1).max(160),
  instruction: z.string().min(1).max(400),
  summary: z.string().min(1).max(160),
});

const EditorOwnerMessageSchema = z.object({
  id: z.string().min(1).max(120),
  role: z.literal("owner"),
  text: z.string().min(1).max(2_000),
  at: z.string().datetime(),
});

const EditorAssistantMessageSchema = z.object({
  id: z.string().min(1).max(120),
  role: z.literal("assistant"),
  reply: z.string().min(1).max(4_000),
  at: z.string().datetime(),
  evidence: z.array(EditorEvidenceSchema).max(4).default([]),
  suggestions: z.array(EditorSuggestionSchema).max(3).default([]),
});

/** Persisted, advice-only assistant conversation. The writer prunes before
 * saving, so the bound remains a durable storage limit rather than a failure. */
export const EditorThreadSchema = z.object({
  messages: z
    .array(z.discriminatedUnion("role", [EditorOwnerMessageSchema, EditorAssistantMessageSchema]))
    .max(60),
  updatedAt: z.string().datetime(),
});
export type EditorThread = z.infer<typeof EditorThreadSchema>;
export type EditorThreadMessage = EditorThread["messages"][number];

export const EditRequestSchema = z.object({
  runId: z.string(),
  editId: z.string(), // data-edit-id — the ONLY selector the editor accepts
  instruction: z.string(),
  imageIntent: z.boolean().default(false), // route to Higgsfield swap
  requestId: z.string().uuid().optional(),
  confirmRedirect: z.boolean().optional(),
  // Same id-format contract as GenerateImageRequestSchema's sourceAssetId
  // (src/lib/imageLibrary.ts) — an id, never a URL, and only ever trusted
  // after api/edit/route.ts checks it against the run's OWN image library.
  referenceAssetId: z.string().min(8).max(80).optional(),
});
export type EditRequest = z.infer<typeof EditRequestSchema>;

export const EditClassificationSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("apply") }),
  z.object({
    decision: z.literal("redirect"),
    reason: z.string().min(1).max(400),
    suggestedAlternative: z.string().min(1).max(400),
  }),
  z.object({
    decision: z.literal("refuse"),
    reason: z.string().min(1).max(400),
    suggestedAlternative: z.string().max(400).optional(),
  }),
]);
export type EditClassification = z.infer<typeof EditClassificationSchema>;

// ---------- Pipeline progress events (SSE to the chat UI) ----------

/** A thumbnail on a card. `path` is run-root-relative (the /api/sites route
 * serves research/* and the built site); `label` becomes the alt text, so it
 * must describe THIS image, not the card. `href` makes it click-to-open. */
export interface CardImage {
  path: string;
  label: string;
  href?: string;
}

/** An outbound or artifact link rendered as a real anchor on a card.
 * external → opens in a new tab. artifact → served by /api/sites/<runId>/… */
export interface CardLink {
  label: string;
  href: string;
  kind: "site" | "maps" | "artifact" | "reference";
  /** secondary line: address + rating, byte size, provenance note */
  sub?: string;
  external?: boolean;
}

/** Map payload for the competitive-scan card. `embedUrl` is present only when
 * the Maps lane is configured; `note` explains its absence so a missing map
 * reads as "not wired" rather than "broken". */
export interface CardMap {
  embedUrl?: string;
  /** Key-free Google Maps link — always usable. */
  fallbackUrl: string;
  pins: Array<{ name: string; lat: number; lng: number }>;
  note?: string;
}

/** One ranked Yelp roster row, presentation-shaped from YelpListing.
 * `verified` means this operator was independently corroborated by the
 * Google Places-resolved competitor scan — two sources agreeing, not a
 * platform badge. */
export interface ScanRosterItem {
  rank: number;
  name: string;
  rating?: number;
  reviewCount?: number;
  url?: string;
  verified: boolean;
}

/** The scan card's KPI-strip source. `directoriesFiltered` is the web
 * discovery exclusion count known at Yelp-card emit time — the same number
 * the later "Filtered out" card reports, surfaced here so the roster's KPI
 * strip does not need to wait on it. */
export interface ScanMarketSummary {
  rosterSize: number;
  ratingMedian?: number;
  reviewCountMedian?: number;
  directoriesFiltered: number;
}

export type PipelineEvent =
  | {
      type: "stage";
      stage: Stage;
      status: "running" | "done" | "failed";
      note?: string;
      /** ISO timestamp; optional so historical events.jsonl lines still parse.
       * Lets the timeline's collapsed stage row show a mono elapsed duration. */
      at?: string;
    }
  | {
      type: "card";
      stage: Stage;
      title: string;
      body: string;
      images?: CardImage[];
      links?: CardLink[];
      map?: CardMap;
      /** Additive, Yelp-roster-only presentation fields — see ScanRosterItem. */
      roster?: ScanRosterItem[];
      market?: ScanMarketSummary;
      /** Additive, build-gate-repair-card-only presentation field. */
      gates?: GateReport[];
    }
  | { type: "cost"; usd: number }
  | { type: "complete"; runId: string; previewUrl: string }
  | {
      type: "paused";
      runId: string;
      workflowStage: EvidenceWorkflowStage;
      workspaceUrl: string;
      note: string;
      /** ISO timestamp; optional so historical events.jsonl lines still parse. */
      at?: string;
    }
  | {
      /** Picker pause. Distinct from "paused": workflowStage is a closed
       * 6-value union and its UI copy derives from EVIDENCE_STAGE_ARTIFACT —
       * reusing it would render "evidence ready for review" for a pick. */
      type: "reference-paused";
      runId: string;
      workspaceUrl: string;
      note: string;
      at?: string;
    }
  | {
      /** Named-human review of the immutable PageIR Source Bundle. This is a
       * build-stage subgate, not a seventh evidence workflow stage. */
      type: "page-ir-source-paused";
      runId: string;
      stage: "built";
      reviewState: "draft" | "in-review";
      payloadSha256: string;
      workspaceUrl: string;
      note: string;
      at?: string;
    }
  | {
      type: "lifecycle";
      stage: "built";
      outcomeClass:
        | "candidate-failure"
        | "repair-failure"
        | "gate-failure"
        | "promotion-failure"
        | "recovery-action";
      status: "failed" | "action";
      message: string;
      nextAction: string;
      at: string;
    }
  | {
      type: "provenance";
      stage: "built";
      provenance: BuildProvenanceV1;
    }
  | {
      type: "fallback-created";
      stage: "built";
      sourceRunId: string;
      fallbackRunId: string;
      reason: TemplateFallbackReason;
      failedStage: Stage;
      at: string;
    }
  | { type: "error"; message: string };

/** Transport-only note: a stage the controller skipped because it was
 * already checkpointed (pipeline.ts's `stage()` helper). The durable event
 * log never records these — pipeline.ts's broadcast filters them out before
 * appending — but the live SSE stream still replays one per already-done
 * stage on every reconnect, so the timeline UI needs to recognize and
 * collapse them too. Lives here, not in pipeline.ts, so a client component
 * (RunTimeline) can import the predicate without pulling in pipeline.ts's
 * server-only `node:fs`/`node:path` graph. */
export const RESUMED_NOTE = "resumed from checkpoint";

export function isResumeNoise(event: PipelineEvent): boolean {
  return event.type === "stage" && event.note === RESUMED_NOTE;
}

// ---------- Paths ----------

export const SITES_DIR = "sites"; // repo-root relative; each run = sites/<id>/
export const RUN_FILE = "run.json";
/** Append-only log of every PipelineEvent the run emitted. run.json checkpoints
 * stage STATUS; this preserves the narrative — cards, links, artifacts,
 * screenshots — so reopening a finished run shows what actually happened
 * instead of four bare "done" rows. */
export const EVENTS_FILE = "events.jsonl";
export const RESEARCH_DIR = "research";
export const SITE_DIR = "site"; // the built artifact lives here
export const CANDIDATE_DIR = "candidate"; // unserved, one fixed candidate per run
export const UPLOADS_DIR = "uploads"; // server-claimed intake blobs + manifest
export const ARTIFACTS = {
  intake: "intake.json",
  scan: "scan.json",
  lock: "reference-lock.json",
  designMd: "DESIGN.md",
  referenceStyleDigest: "reference-style-digest.json",
  evidenceLedger: "evidence/ledger.json",
  designContractMeta: "evidence/design-contract.json",
  designTailwindExport: "evidence/design-tailwind.css",
  tokenInventory: "evidence/token-inventory.json",
  tailwindPlan: "evidence/tailwind-plan.json",
  cssArchitecture: "evidence/css-architecture.json",
  visualQa: "evidence/visual-qa.json",
  tailwindTheme: "evidence/approved/runtime-tailwind-theme.css",
  tokens: "tokens.json",
  skeleton: "skeleton.json",
  copy: "copy.json",
  pageIr: "page-ir.json",
  pageIrSourceGeneration: "page-ir-source-generation.json",
  manifest: "site/manifest.json",
  gates: "gates.json",
  editorThread: "editor-thread.json",
} as const;

// ---------- Model slugs (verified live 2026-08-12; re-verify in Phase 0 smoke) ----------

export const MODELS = {
  orchestrator: "google/gemini-3.1-pro-preview", // reasoning + vision
  builder: "moonshotai/kimi-k3", // frontend/webdev strength
  bulk: "deepseek/deepseek-v4-flash", // classification/extraction
} as const;
