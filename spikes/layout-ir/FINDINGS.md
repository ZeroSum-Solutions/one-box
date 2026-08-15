# Layout-IR spike — findings

**Date:** 2026-08-15
**Branch:** `spike/layout-ir`
**Protocol:** GPT-5.6 Sol's upper-bound compiler spike (see
`~/Inbox/notes/2026-08-15-one-box-variation-sol-second-opinion.md`)
**Model spend:** $0. No model was called at any point. All four IR documents were
hand-authored.

---

## Verdict: REVISE

Not PROMOTE (it did not clear the pre-registered craft bar).
Not RETIRE (nothing here required raw CSS or reference-specific compiler code).

The thesis survives, but the pre-registered budget did not.

---

## Pre-registered criteria, scored honestly

| # | Criterion | Result |
|---|---|---|
| 1 | All four outputs pass current blocking gates + static CSS provenance audit | **PASS** |
| 2 | Double-recompile byte-identical, every `data-edit-id` preserved | **PASS** |
| 3 | Same-brief pairs differ in role/slot graph **and** rendered bounding-box topology at 1440 and 390 | **PASS** |
| 4 | No compiler branch inspects business name, run id, or reference id | **PASS** |
| 5 | No case-specific macro, raw CSS, selector, or manual post-build patch | **PASS** |
| 6 | After **at most one** generic compiler iteration, ≥3 of 4 rated "would ship" | **FAIL** |

Criterion 6 is the one that matters, and it failed on the iteration budget, not on
the ceiling. It took **four** compiler iterations plus **one schema addition**, and
one of the four outputs still has a broken hero.

## What the four outputs actually look like

| Output | Assessment |
|---|---|
| `medspa-gallery` | Genuinely good. Would ship with minor nits. |
| `gutter-trade-split` | Solid, coherent, readable. Close to shippable. |
| `medspa-typographic` | Structurally sound. |
| `gutter-editorial` | **Broken** — hero media occupies a correct 711×311 box but renders invisible. Unresolved after four iterations. |

The two same-brief pairs are unmistakably different sites from *identical* copy,
tokens, and assets. That is the thing the current engine cannot do at all.

## The finding neither Grok nor Sol predicted

**Column spans alone cannot determine row structure.** Grok's `LayoutProgramV1` and
Sol's corrected slot+constraint layer both describe columns, spans, order, bleed,
overlap, measure and crop — and neither has a row dimension.

Two failure modes proved this empirically:

1. **Auto-placement shares rows.** With only column spans declared, `hero.media`
   (columns 6–13) and `hero.actions` (columns 2–5) auto-placed into the *same*
   implicit grid row. The media figure collapsed to the button's height — 44px.
2. **Inferring rows from columns collides.** The obvious generic repair — "slots
   sharing a column start stack in order; a column with one slot spans the block" —
   puts every slot in row 1 whenever each slot has a distinct column start. The
   contact section rendered its heading, lede and CTA on top of one another.

Rows must be **declared**, not inferred. `SpanConstraint` now carries optional
`row` and `rowSpan`. This is a real addition to the architecture, discovered only
by building it.

## Second finding: `focalCrop` was silently inert

`object-fit: cover` does nothing unless the image has a constrained box. Until
`.slot--media` was given `block-size: 100%` and the image `inline-size/block-size:
100%`, every `focalCrop` constraint in all four programs compiled to CSS that had
no effect. The provenance audit passed it, the gates passed it, and the constraint
did nothing. Worth remembering: a constraint that compiles is not a constraint that
works.

## Third finding: the token authority had to be extended, exactly as Sol said

The first build failed the provenance audit on `--measure-*` and on `1px solid`.
Both were compiler-invented scalars wearing a token costume. The honest fix was to
create `layout-authority.css` — a **global, versioned, reviewed-once** sheet holding
the page-width scale, measure scale, section rhythm, and the single approved
hairline. The IR selects among these; it cannot add to them.

This is the mechanism that makes generated CSS honest under `token-drift`. It also
exposed a real bug in the existing engine: shipped `tokens.css` declares
`--border-subtle: 1px solid var(--color-stone-grey)` and `--color-stone-grey` is
never defined anywhere. A dangling token reference in production output.

## Fourth finding: page width ≠ text measure

The first render put a 1440px viewport's entire page inside a ~670px column,
because `page.measure` was driving `.page-shell`'s `max-inline-size`. Measure is a
*line-length* value (46–78ch). Page canvas is a different scale entirely. Conflating
them produced the single worst visual result of the spike. They are now separate
token families.

## What this says about the architecture

**For it:** four structurally distinct, deterministic, provenance-clean,
gate-passing sites from two briefs — with per-site layout CSS, no model call, and no
raw CSS anywhere. Same-brief pairs diverge in role graph, in rendered topology at
both viewports, and in media geometry. The compiler never sees a business name.

**Against it:** the compiler needed four passes to stop producing collisions,
zero-height figures, and inert constraints. Sol's stated risk — "a bad CSS generator
with a perfect IR is just a more complicated template" — is the live risk, and the
generator is the hard part. Every defect found was in the compiler or the schema,
never in the concept.

## Recommended next step

Do **not** proceed straight to the Refero picker or pipeline integration.

Fix `gutter-editorial`'s media rendering first, then re-score. If a second honest
compiler pass gets 3 of 4 to "would ship", the architecture has cleared the bar
late rather than failed it, and Phase B (ReferenceContract + picker) is justified.
If it does not, Sol's fallback applies: designer-authored layout kernels as code,
plus human art direction — not a larger enum, and not raw model CSS.

## Reproduce

```bash
node spikes/layout-ir/build.mjs spikes/layout-ir/programs/*.json   # compile + audit
node spikes/layout-ir/verify.mjs                                   # gates + topology
```

Screenshots land in `spikes/layout-ir/shots/`, geometry in `verify-report.json`.
