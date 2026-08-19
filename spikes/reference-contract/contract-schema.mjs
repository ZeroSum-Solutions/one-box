/**
 * ReferenceContract — Gate C2.
 *
 * Composition constraints derived from a FULL Refero style (not just its
 * colour/font tokens). Every field below is documented against the specific
 * full-style field it comes from, per `docs/refero-mcp-research.md` Finding 2
 * (the field taxonomy `refero_get_style` actually returns) and
 * `spikes/refero-baseline/RESEARCH-LOG.md` §3 (the same taxonomy, confirmed
 * against a second live style fetch). A field with no directly-recorded value
 * for a given style must be marked in that contract's `assumptions[]` array
 * — this schema does not silently default a field a source doc never gave a
 * value for.
 *
 * Scope, deliberately: this contract governs COMPOSITION — section rhythm,
 * surfaces, density, media treatment, motion personality, component posture,
 * rejects. It does NOT carry colour hex values or font families. Those are a
 * separate, already-solved axis (DesignTokens / tokens.css) — conflating the
 * two axes is exactly what the 2026-08-13 A/B build did wrong (it wired only
 * colours/fonts and threw the composition-level fields away; see Finding 2's
 * closing paragraph). `spikes/reference-contract/build.mjs` renders both
 * example contracts in this spike against ONE shared WITS token sheet, so
 * every visible difference between the two output sites traces to this
 * contract, never to a palette swap.
 *
 * Compiler-consumption honesty (this spike, not a general claim): not every
 * field here is mechanically wired into `compile-from-contract.mjs`'s output
 * yet. `sectionRhythm`, `heroSurface`, `density`, `media.framing`, and
 * `componentPosture.depthMode` are structurally live — they change the
 * emitted LayoutProgramV1. `motion` and `componentPosture.radiusClass` are
 * captured for provenance and for the production ReferenceContract to grow
 * into, but this spike's reused, unmodified `compile.mjs` has no mechanism
 * for per-section transition timing or per-section radius, so those two
 * fields do not yet move a pixel. See FINDINGS.md "What's structurally live
 * vs captured-only" — this is the same honesty C1 owed the record for
 * `focalCrop` before it was wired up ("a constraint that compiles is not a
 * constraint that works").
 */
import { z } from "zod";

// ---------------------------------------------------------------- vocab

/** layout-ir's Section.surface enum (schema.mjs) — the only four surface
 * levels the compiler can assign a section to. A ReferenceContract picks
 * FROM this set; it cannot invent a fifth level. */
export const SURFACE_LEVELS = ["page", "raised", "inverted", "accent"];
const SurfaceLevel = z.enum(SURFACE_LEVELS);

export const ContractProvenance = z.object({
  /** Which of the doc's recorded fields this value traces to. Free text,
   * but must name a real field from Finding 2 / RESEARCH-LOG §3 — not a
   * paraphrase of the contract's own field name. */
  field: z.string().min(1),
  /** Verbatim or lightly-quoted text from the source doc, OR the literal
   * string "assumed" when the doc recorded the field's existence but not
   * this style's value for it. */
  quote: z.string().min(1),
}).strict();

/**
 * ReferenceContract — one per style, hand-derived in this spike (the
 * production version derives this programmatically from a live
 * `refero_get_style` response; see FINDINGS.md "What production should
 * learn").
 */
export const ReferenceContract = z.object({
  contractId: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),

  /** Provenance anchor: the Refero style this contract was derived from.
   * Doc source: the style record itself (id + title), RESEARCH-LOG §2. */
  sourceStyle: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }).strict(),

  /** One-line visual thesis.
   * Doc field: "North star — one-line visual thesis" (Finding 2). */
  northStar: z.object({
    value: z.string().min(1),
    provenance: ContractProvenance,
  }).strict(),

  /**
   * Section rhythm — the surface a section is assigned to, by content
   * position, plus a distinguished surface for the hero and for the
   * primary-CTA (contact) band.
   * Doc field: "Layout & section rhythm — 'sections alternate between
   * Greige Canvas and Warm Paper'" (Finding 2), corroborated by
   * RESEARCH-LOG §3 "Surface levels (0/1/2) with hex and purpose".
   */
  sectionRhythm: z.object({
    /** Cyclic alternation applied to the CONTENT sections between hero and
     * contact (proof/offer/story/area in this spike's WITS section plan).
     * `compile-from-contract.mjs` assigns `contentSurfaces[i % length]` in
     * declaration order — a generic rule, not a per-section lookup table. */
    contentSurfaces: z.array(SurfaceLevel).min(1).max(4),
    /** The surface the hero section itself sits on — called out separately
     * because a style's north-star canvas (e.g. Pipe's "near-black canvas")
     * is a hero-defining choice, not just one step in the alternation. */
    heroSurface: SurfaceLevel,
    /** The surface the primary-CTA / contact band uses.
     * Doc field: "Color roles — every hex has a named role (e.g. 'primary
     * CTA only')" (Finding 2) — the contract records WHICH surface level
     * carries that role, not the hex itself. */
    ctaSurface: SurfaceLevel,
    provenance: ContractProvenance,
  }).strict(),

  /** Named purpose per surface level, for documentation/traceability only
   * (compile-from-contract.mjs does not branch on the purpose strings).
   * Doc field: "Surfaces — explicit elevation levels and their purposes"
   * (Finding 2); RESEARCH-LOG §3 "Surface levels (0/1/2) with hex and
   * purpose — Tailscale and Ambrook". */
  surfaceLevels: z.object({
    page: z.object({ purpose: z.string().min(1), provenance: ContractProvenance }).strict(),
    raised: z.object({ purpose: z.string().min(1), provenance: ContractProvenance }).strict(),
    inverted: z.object({ purpose: z.string().min(1), provenance: ContractProvenance }).strict(),
    accent: z.object({ purpose: z.string().min(1), provenance: ContractProvenance }).strict(),
  }).strict(),

  /**
   * Density — comfortable/compact plus a base gap step. Maps onto
   * layout-ir's `page.density` enum (compact/regular/editorial) and
   * `kernel.gap` Step (0-3) in compile-from-contract.mjs.
   * Doc field: "Spacing & shapes — density, radii per element class,
   * section gap, card padding, page max-width" (Finding 2).
   */
  density: z.object({
    class: z.enum(["comfortable", "compact"]),
    /** Quantized step (layout-ir Step: 0-3), the base kernel gap this
     * contract prefers before any per-section override. */
    baseGapStep: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    provenance: ContractProvenance,
  }).strict(),

  /**
   * Media treatment — what kind of imagery the style uses and how it is
   * framed. `treatment` maps to nothing structural in this spike (both
   * example contracts happen to be photography-led, per the doc); `framing`
   * is what compile-from-contract.mjs actually branches on to choose the
   * hero kernel and its media constraints.
   * Doc field: "Imagery guidance — photography treatment (candid,
   * desaturated, warm filter), illustration system, framing rules"
   * (Finding 2); RESEARCH-LOG §3 "Imagery direction — subject, treatment,
   * density, icon style" and the repeated "Photography art direction
   * (candid, desaturated, real work environments) | Ambrook" row.
   */
  media: z.object({
    treatment: z.enum(["photography", "illustration", "none"]),
    /** documentary-inset: media reads as one supporting plate beside/under
     * the copy, cropped in, not bleeding.
     * full-bleed-dramatic: media is the hero's dominant mass, bleeds to an
     * edge, drives the split ratio. */
    framing: z.enum(["documentary-inset", "full-bleed-dramatic", "none"]),
    provenance: ContractProvenance,
  }).strict(),

  /**
   * Motion personality. Captured for provenance and for the production
   * contract; NOT wired into compile-from-contract.mjs's output in this
   * spike (see file header). Doc field: "Motion philosophy — durations,
   * easing, personality" (Finding 2); RESEARCH-LOG §3 "Sometimes motion
   * philosophy (Ambrook: durations and easing)".
   */
  motion: z.object({
    durationClass: z.enum(["brisk", "moderate", "slow"]),
    easingClass: z.enum(["mechanical", "organic"]),
    provenance: ContractProvenance,
  }).strict(),

  /**
   * Component posture. `depthMode` is structurally live — it selects the
   * section `seam` (rule/band/flush) compile-from-contract.mjs emits.
   * `radiusClass` is captured only (this spike's shared, unmodified
   * chrome.css hard-codes `--radius-pill` for `.cta` and defines no other
   * per-component radius hook — see FINDINGS.md).
   * Doc field: "Component recipes — buttons/cards/inputs with exact
   * treatments" and "Shadows as exact CSS values with token names"
   * (Finding 2).
   */
  componentPosture: z.object({
    radiusClass: z.enum(["sharp", "soft", "pill"]),
    /** border: hairline dividers carry the separation (technical/precise).
     * shadow: soft elevation/background-shift carries it, no hard rule. */
    depthMode: z.enum(["border", "shadow"]),
    provenance: ContractProvenance,
  }).strict(),

  /** Explicit rejects — composition moves this style forbids. Informational
   * in this spike (no automated enforcement here; production's B2-style gate
   * is the natural home for turning these into enforced checks).
   * Doc field: "Do's/Don'ts — style-preserving rules (anti-slop
   * constraints)" (Finding 2). */
  rejects: z.array(z.object({
    rule: z.string().min(1),
    provenance: ContractProvenance,
  }).strict()).min(1),

  /** Every field above whose VALUE (not existence) is not directly recorded
   * in the source docs for this specific style. Kept minimal by design —
   * see the task's own instruction: "keep assumptions minimal." */
  assumptions: z.array(z.object({
    field: z.string().min(1),
    rationale: z.string().min(1),
  }).strict()),
}).strict();

export function parseContract(input) {
  return ReferenceContract.parse(input);
}
