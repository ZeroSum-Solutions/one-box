/**
 * LayoutProgramV1 — the spike contract.
 *
 * Sol's correction to Grok's LayoutProgramV1: a section-level `composition` enum
 * is under-expressive. Real art direction needs semantic SLOTS plus typed
 * CONSTRAINTS that target those slots.
 *
 * Hard rules encoded here:
 *   - Targets are semantic slot names, never CSS selectors.
 *   - Values are enums, quantized steps, or normalized coordinates.
 *   - There is NO generic { property, value } escape hatch. That would be CSS
 *     with worse tooling.
 *   - Closed discriminated unions; unknown keys are rejected (`.strict()`).
 */
import { z } from "zod";

export const BREAKPOINTS = ["mobile", "tablet", "desktop"];
export const Breakpoint = z.enum(BREAKPOINTS);

/** Semantic slots. A section's content is addressed by these names only. */
export const SLOTS = [
  "eyebrow",
  "heading",
  "lede",
  "actions",
  "media",
  "proof",
  "items",
  "aside",
  "caption",
];
export const Slot = z.enum(SLOTS);

export const ROLES = [
  "nav",
  "hero",
  "proof",
  "offer",
  "process",
  "story",
  "gallery",
  "area",
  "faq",
  "contact",
  "footer",
];
export const Role = z.enum(ROLES);

/** Quantized steps. The model never writes a length; it picks a step, and the
 * compiler resolves the step against approved spacing tokens. */
export const Step = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export const SignedStep = z.union([
  z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2),
]);

/** Column positions on a 12-track grid. Structural, not a design scalar. */
export const Column = z.number().int().min(1).max(13);

// ---------------------------------------------------------------- constraints

const SpanConstraint = z.object({
  type: z.literal("span"),
  slot: Slot,
  from: Column,
  to: Column,
  /** Row placement. Discovered during the spike: column spans alone cannot
   * determine rows — two slots in different columns auto-place into the same
   * row (collapsing a media figure), and inferring rows from column starts
   * produces collisions. Rows must be declared, not inferred. */
  row: z.number().int().min(1).max(12).optional(),
  rowSpan: z.number().int().min(1).max(12).optional(),
  at: Breakpoint.default("desktop"),
}).strict().refine((c) => c.to > c.from, {
  message: "span `to` must exceed `from`",
});

const AlignConstraint = z.object({
  type: z.literal("align"),
  slot: Slot,
  axis: z.enum(["inline", "block"]),
  value: z.enum(["start", "center", "end", "stretch"]),
  at: Breakpoint.default("desktop"),
}).strict();

const OrderConstraint = z.object({
  type: z.literal("order"),
  slot: Slot,
  index: z.number().int().min(0).max(11),
  at: Breakpoint,
}).strict();

const BleedConstraint = z.object({
  type: z.literal("bleed"),
  slot: Slot,
  side: z.enum(["inline-start", "inline-end", "both"]),
  step: Step,
  at: Breakpoint.default("desktop"),
}).strict();

const OverlapConstraint = z.object({
  type: z.literal("overlap"),
  slot: Slot,
  against: Slot,
  axis: z.enum(["inline", "block"]),
  step: z.union([z.literal(1), z.literal(2)]),
  at: Breakpoint.default("desktop"),
}).strict();

const MeasureConstraint = z.object({
  type: z.literal("measure"),
  slot: Slot,
  value: z.enum(["narrow", "normal", "wide"]),
}).strict();

/** Normalized focal point, per breakpoint. This is the crop decision a
 * designer makes and Grok's IR could not express. */
const FocalCropConstraint = z.object({
  type: z.literal("focalCrop"),
  slot: Slot,
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  at: Breakpoint.default("desktop"),
}).strict();

export const Constraint = z.discriminatedUnion("type", [
  SpanConstraint.innerType ? SpanConstraint.innerType() : SpanConstraint,
  AlignConstraint,
  OrderConstraint,
  BleedConstraint,
  OverlapConstraint,
  MeasureConstraint,
  FocalCropConstraint,
]);

// -------------------------------------------------------- art-direction patch

const OpticalOffsetAdjustment = z.object({
  type: z.literal("opticalOffset"),
  slot: Slot,
  axis: z.enum(["inline", "block"]),
  step: SignedStep,
}).strict();

const LineBreakHint = z.object({
  type: z.literal("lineBreakHint"),
  slot: Slot,
  afterWord: z.number().int().min(1).max(24),
}).strict();

const FocalCropAdjustment = z.object({
  type: z.literal("focalCropAdjust"),
  slot: Slot,
  at: Breakpoint,
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
}).strict();

export const ArtDirection = z.discriminatedUnion("type", [
  OpticalOffsetAdjustment,
  LineBreakHint,
  FocalCropAdjustment,
]);

// ------------------------------------------------------------------- kernels

/** Exactly three generic composition kernels. They carry no business meaning
 * and no case-specific branches. */
const StackKernel = z.object({
  kind: z.literal("stack"),
  align: z.enum(["start", "center", "end"]).default("start"),
  gap: Step.default(2),
}).strict();

const SplitKernel = z.object({
  kind: z.literal("split"),
  ratio: z.enum(["3-9", "4-8", "5-7", "6-6", "7-5", "8-4", "9-3"]),
  gap: Step.default(2),
  reverseOnMobile: z.boolean().default(false),
}).strict();

const GridKernel = z.object({
  kind: z.literal("grid"),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  gap: Step.default(2),
  rhythm: z.enum(["even", "alternating"]).default("even"),
}).strict();

export const Kernel = z.discriminatedUnion("kind", [
  StackKernel,
  SplitKernel,
  GridKernel,
]);

// ------------------------------------------------------------------ sections

export const SlotBinding = z.object({
  name: Slot,
  /** Reference into approved copy: "<sectionKey>.<field>". Never literal prose. */
  copyRef: z.string().regex(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/).optional(),
  /** Reference into approved assets, run-relative. Never a URL. */
  assetRef: z.string().regex(/^assets\/[a-zA-Z0-9._-]+$/).optional(),
  /** Repeated content pulled from an approved copy collection. */
  collectionRef: z.string().regex(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/).optional(),
}).strict();

export const Section = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,38}$/),
  role: Role,
  kernel: Kernel,
  surface: z.enum(["page", "raised", "inverted", "accent"]).default("page"),
  seam: z.enum(["flush", "rule", "band", "overlap"]).optional(),
  slots: z.array(SlotBinding).min(1).max(9),
  constraints: z.array(Constraint).max(24).default([]),
  artDirection: z.array(ArtDirection).max(12).default([]),
}).strict();

export const Page = z.object({
  family: z.enum([
    "editorial-asymmetric",
    "trade-split",
    "gallery-forward",
    "proof-dense",
    "typographic",
  ]),
  measure: z.enum(["narrow", "normal", "wide"]),
  density: z.enum(["compact", "regular", "editorial"]),
  seam: z.enum(["flush", "rule", "band", "overlap"]),
  nav: z.enum(["minimal", "utility", "split-cta"]),
  footer: z.enum(["thin", "directory", "editorial"]),
}).strict();

export const LayoutProgramV1 = z.object({
  schemaVersion: z.literal("1"),
  programId: z.string().regex(/^[a-z0-9-]{3,60}$/),
  /** Hashes bind the program to the exact approved inputs it was authored against. */
  inputs: z.object({
    designHash: z.string(),
    copyHash: z.string(),
    assetCatalogHash: z.string(),
  }).strict(),
  page: Page,
  sections: z.array(Section).min(3).max(14),
}).strict().superRefine((program, ctx) => {
  const seen = new Set();
  for (const section of program.sections) {
    if (seen.has(section.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["sections"],
        message: `duplicate section id: ${section.id}`,
      });
    }
    seen.add(section.id);

    const slotNames = new Set();
    for (const slot of section.slots) {
      if (slotNames.has(slot.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", section.id, "slots"],
          message: `duplicate slot ${slot.name} in section ${section.id}`,
        });
      }
      slotNames.add(slot.name);
    }
    // A constraint may only target a slot the section actually binds.
    for (const constraint of section.constraints) {
      for (const key of ["slot", "against"]) {
        const target = constraint[key];
        if (target && !slotNames.has(target)) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", section.id, "constraints"],
            message: `constraint targets unbound slot ${target}`,
          });
        }
      }
    }
    for (const patch of section.artDirection) {
      if (!slotNames.has(patch.slot)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", section.id, "artDirection"],
          message: `art direction targets unbound slot ${patch.slot}`,
        });
      }
    }
  }

  const roles = program.sections.map((s) => s.role);
  if (roles.filter((r) => r === "nav").length !== 1) {
    ctx.addIssue({ code: "custom", path: ["sections"], message: "exactly one nav required" });
  }
  if (roles.filter((r) => r === "footer").length !== 1) {
    ctx.addIssue({ code: "custom", path: ["sections"], message: "exactly one footer required" });
  }
  if (roles.filter((r) => r === "hero").length !== 1) {
    ctx.addIssue({ code: "custom", path: ["sections"], message: "exactly one hero required" });
  }
  if (!roles.includes("contact")) {
    ctx.addIssue({ code: "custom", path: ["sections"], message: "a contact path is required" });
  }
});

export function parseProgram(input) {
  return LayoutProgramV1.parse(input);
}
