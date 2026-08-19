# Reference-contract spike — findings (Gate C2)

**Date:** 2026-08-15
**Branch:** `spike/refero-baseline`
**Builds on:** `spikes/layout-ir/` (Gate C1, PASSED, commit `59a0158`) — imported
unchanged, not forked.
**Model spend:** $0. No model and no live `refero_get_style`/`refero_search_styles`
call was made anywhere in this spike. Both contracts are hand-derived from
already-recorded doc text, per the task's explicit instruction to derive
honestly from `docs/refero-mcp-research.md` and flag gaps as `assumed`.

---

## Verdict: PASS

All four pre-registered criteria pass, against the exact criteria stated
below — written before either site was visually inspected. One real
compiler-adjacent defect was found and fixed during the build (not hidden
after the fact); it is reported in full under "What went wrong first."

---

## What a ReferenceContract is

A `ReferenceContract` (`contract-schema.mjs`) is the composition-only slice
of a full Refero style: section rhythm, surface levels, density, media
treatment, motion personality, component posture, and explicit rejects. It
deliberately excludes colour hex values and font families — those are a
separate, already-solved axis (`DesignTokens`/`tokens.css`). Conflating the
two axes is exactly what the 2026-08-13 A/B build did wrong, per
`docs/refero-mcp-research.md` Finding 2's closing paragraph: it wired only
colours/fonts into the build and discarded the rest of what
`refero_get_style` actually returns.

### Fields and their source-doc provenance

| Field | What it drives | Doc field it comes from |
|---|---|---|
| `northStar` | Documentation only (not compiled) | "North star — one-line visual thesis" (Finding 2) |
| `sectionRhythm.contentSurfaces` | Which of page/raised/inverted/accent each content section cycles through | "Layout & section rhythm — 'sections alternate between Greige Canvas and Warm Paper'" (Finding 2) |
| `sectionRhythm.heroSurface` | The hero section's own surface | Same field, hero called out separately because a style's dominant canvas (e.g. Pipe's "near-black canvas") is a hero-defining choice |
| `sectionRhythm.ctaSurface` | The contact/CTA band's surface | "Color roles — every hex has a named role (e.g. 'primary CTA only')" (Finding 2) |
| `surfaceLevels.*.purpose` | Documentation only | "Surfaces — explicit elevation levels and their purposes" (Finding 2) |
| `density.class` / `density.baseGapStep` | `page.density` enum + base `kernel.gap` step | "Spacing & shapes — density, radii per element class, section gap..." (Finding 2) |
| `media.treatment` | Documentation only in this spike (both contracts are photography-led) | "Imagery guidance — photography treatment... illustration system" (Finding 2) |
| `media.framing` | Hero kernel choice (stack vs split) + bleed/crop constraints | "Imagery guidance — ...framing rules" (Finding 2) |
| `motion.*` | **Not compiled** — captured only | "Motion philosophy — durations, easing, personality" (Finding 2) |
| `componentPosture.radiusClass` | **Not compiled** — captured only (shared `chrome.css` hard-codes `--radius-pill`) | "Component recipes — buttons/cards/inputs..." (Finding 2) |
| `componentPosture.depthMode` | Section `seam` choice (rule vs band) for proof/offer/story/area/contact | "Shadows as exact CSS values..." / component recipes (Finding 2) |
| `rejects[]` | Documentation only (no automated enforcement in this spike) | "Do's/Don'ts — style-preserving rules" (Finding 2) |
| `assumptions[]` | Every value above not directly recorded for this specific style | n/a — this is the honesty mechanism itself |

**What's structurally live vs captured-only, stated plainly (the same
honesty C1 owed `focalCrop` before it was wired up):** `sectionRhythm`,
`heroSurface`, `ctaSurface`, `density`, `media.framing`, and
`componentPosture.depthMode` change the emitted `LayoutProgramV1` and
therefore the rendered page. `motion` and `componentPosture.radiusClass` are
schema fields with real doc provenance but **do not move a pixel** in this
spike, because the reused, unmodified `compile.mjs` has no per-section
transition-timing or per-section-radius mechanism. A production
`ReferenceContract` should either grow `compile.mjs` a mechanism for these
two fields or drop them from the schema until it does — leaving them silently
inert would repeat the exact C1 mistake this repo already found once.

---

## The two derivations

### Ambrook (`contracts/ambrook.contract.json`)

Style `b11e1e78-3c62-45df-bf28-17c97718ed7d`. The richer-documented of the
two — RESEARCH-LOG.md records a full-style fetch actually happened for
Ambrook (§1, query 6), and several concrete fields survive into the record:
its north star quote, its "primary CTA only" colour role, its imagery
direction (repeated three times across the doc), its section-rhythm
alternation quote, and the component-radius inconsistency Finding 2 flags by
name. Result: **7 of 14 schema fields have a direct quoted value**; the rest
(`density`, `motion`, `componentPosture.depthMode`, one `surfaceLevels`
purpose, one `rejects` rule) are marked `assumed`, each with a stated
rationale tying it back to a real descriptor ("Warm, grounded, tactile")
rather than inventing from nothing.

One documented internal inconsistency required reconciling, per Finding 2's
own instruction ("synthesis must reconcile, never trust a single field
blindly"): Ambrook's component spec says 3.75px button radius; its Agent
Prompt Guide says a 9999px pill. This contract keeps the primary
component-spec value (a soft, near-flat radius) over the secondary
convenience-layer value, and says so in `componentPosture`'s provenance.

### Pipe (`contracts/pipe.contract.json`)

Style `c00d3961-a100-4c22-91fe-75f6e488e579`. RESEARCH-LOG.md marks it
explicitly **"Not read in full"** — its full style was never fetched at all.
Everything beyond the two-sentence search-result descriptor ("Near-black
canvas, molten orange, split photographic hero") and Finding 1's aesthetic
label ("black-and-orange technical") is `assumed`. That is **7 of 14 fields
assumed**, roughly double Ambrook's rate — an honest reflection of how much
less is actually recorded, not a stylistic choice to make Pipe "more
assumed" for variety. The task's own framing anticipated this ("derive
honestly... where the doc lacks a field, mark it assumed... keep assumptions
minimal") and this contract keeps every assumption tied to one of the two
real descriptor fragments rather than free-inventing a persona.

### Why these two, specifically

They are the same contrasting pair the task named (Ambrook vs the dark
technical black-and-orange "Pipe"), and RESEARCH-LOG.md §2 independently
already flagged them as opposite poles of the same underlying tension: "The
brief's feel list contains a direct tension: technical and approachable...
Most of the strong technical candidates (Andercore, Pipe, Inngest...) resolve
that tension by dropping 'approachable'." Ambrook is the approachable pole;
Pipe is the technical pole Fingerprint (the repo's actual foundation choice)
deliberately did NOT take.

---

## Pre-registered verify criteria and results

Criteria (a)-(d) below are copied verbatim from the task brief and were
written into `verify.mjs` **before** either build was opened in a browser.

| # | Criterion | Result |
|---|---|---|
| (a) | Topology divergence: role-order or kernel assignments differ in >=2 of the first 4 sections | **PASS** — 3 of 4 (hero, proof, offer); role is identical by design (see below), kernel objects diverge |
| (b) | Surface-rhythm divergence: background alternation patterns differ | **PASS** — both rendered `background-color` sequence and IR-level `surface` sequence differ |
| (c) | Both pass the layout-ir spike's own geometry gates, adapted | **PASS** — all 8 per-output checks x2 builds, plus role/topology/media-geometry pairwise checks |
| (d) | Hero media paints (C1 eager-loading lesson) | **PASS** — deterministic grayscale-stddev pixel check, both >0.2 against a 0.02 threshold |

Full output: `node spikes/reference-contract/verify.mjs` (reproducible;
report also written to `verify-report.json`).

```
=== (a) topology divergence: first 4 sections, role/kernel ===
[1] ambrook.hero kernel={"kind":"stack",...}   pipe.hero kernel={"kind":"split",...}   DIFFERS
[2] ambrook.proof kernel={"kind":"grid","columns":3,...}  pipe.proof kernel={"kind":"stack",...}  DIFFERS
[3] ambrook.offer kernel={"kind":"grid","columns":3,...}  pipe.offer kernel={"kind":"grid","columns":2,...}  DIFFERS
  PASS  first 4 sections diverge in role/kernel at >=2 positions (found 3)

=== (b) surface-rhythm divergence ===
  PASS  rendered per-section background-color sequence differs
        ambrook: f7f6f2|f7f6f2|eeece4|f7f6f2|eeece4|f7f6f2|d97a2e|f7f6f2
        pipe:    f7f6f2|1c1d18|1c1d18|f7f6f2|1c1d18|f7f6f2|d97a2e|f7f6f2
  PASS  IR-level surface sequence differs
        ambrook: page|page|raised|page|raised|page|accent|page
        pipe:    page|inverted|inverted|page|inverted|page|accent|page

=== (d) hero media paints ===
  PASS  ambrook: hero media painted (grayscale stddev 0.2086, threshold 0.02)
  PASS  pipe:    hero media painted (grayscale stddev 0.2061, threshold 0.02)

ALL CHECKS PASSED
```

Note on criterion (a) and role graph: the two contracts render the **same
role set in the same order** (`nav>hero>proof>offer>story>area>contact>footer`)
by deliberate design — both draw on the identical WITS content plan, which
is what makes this a fair "same brief" comparison rather than one contract
arbitrarily dropping or reordering sections to game a topology metric. The
task's own criterion (a) explicitly allows "role-order **or** kernel
assignments differ" — this pair proves divergence entirely through the
kernel branch, which the pre-registered check treats as sufficient (and
reports role-graph identity as informational, not a failure).

### CSS provenance audit (promotion-bar item, checked here for confidence)

Both builds pass `spikes/layout-ir/audit-css.mjs`'s independent audit with
**zero violations** — every design scalar in the generated CSS traces to a
`var(--token)` reference or an approved derived step, never a raw literal.
Confirmed via both `build.mjs`'s internal call and a standalone CLI run
against each output.

### Layout-ir regression check

`compile.mjs`, `schema.mjs`, and `audit-css.mjs` were imported unchanged, not
forked — `git diff --stat spikes/layout-ir/` is empty. Re-ran
`spikes/layout-ir/build.mjs` + `verify.mjs` against all four original
programs regardless (not required by the task since no patch was made, but
cheap and directly answers "did this touch C1"): **ALL CHECKS PASSED**,
output byte-identical to before this spike touched anything.

---

## What went wrong first (found and fixed, not swept under)

Two real defects surfaced while building this spike, both caught by
looking at rendered output rather than at schema/gate pass status alone —
the same lesson C1 already learned once and this spike re-learned
independently:

1. **Horizontal overflow on Pipe's desktop build (12px at 1440px).** Root
   cause: Pipe's `page.measure = "wide"` (`--page-wide`, 88rem = 1408px)
   leaves the page-shell only marginally narrower than a 1440px viewport, so
   its auto-centering margin plus inner padding gave a smaller bleed budget
   than the hero's `bleed step:3` (`--space-lg`, 56px) needed. Every existing
   layout-ir program that uses a bleed constraint (`gutter-editorial`) pairs
   it with `page.measure: "normal"`, which has much more slack — this spike
   was the first to combine a bleed with the "wide" measure, and the
   combination overflowed. Fixed by reducing the bleed step to 2
   (`--space-md`, 28px), which fits the available budget at both verified
   viewports (1440/390). **Not proven safe at arbitrary viewport widths**
   between roughly 1408 and 1440px — this is a real, narrow limitation,
   stated here rather than silently generalized away. This is a
   program-authoring responsibility (matching a bleed magnitude to the
   page's actual available margin), not a `compile.mjs` defect, so no patch
   was made to the reused compiler.
2. **Ambrook's hero heading visually collided with its own hero photo.**
   `compile-from-contract.mjs`'s first draft spanned the heading to column
   11 while the media slot started at column 7 — schema-valid, gate-passing
   (no overflow, no console error, unique edit-ids), and still visually
   broken: the h1 text ran directly under the photograph in the shared
   column range. Found only by reading the actual screenshot. Fixed by
   confining text to columns 1-7 and media to columns 8-13 — zero shared
   columns. This is the same category of finding C1's FINDINGS.md already
   named: "a constraint that compiles is not a constraint that works."

Both fixes are recorded as comments at their exact point of use in
`compile-from-contract.mjs`, not just here.

---

## Screenshots

- `evidence/ambrook-desktop.png` — full-page, 1440px
- `evidence/pipe-desktop.png` — full-page, 1440px
- `evidence/ambrook-hero-media.png` / `evidence/pipe-hero-media.png` — cropped
  hero-media element screenshots, the exact images `verify.mjs`'s paint check
  ran its stddev computation against

Visual summary: Ambrook renders as a light, warm, editorial page — a
typographic stack hero with a contained documentary-style photo inset, an
even 3-up trust-bar row, a soft raised/page alternation, one orange CTA
band. Pipe renders as a near-black-dominant page — a full-bleed split hero
with a diagonal molten-orange photo, a vertical console-style stat readout,
a dark-dominant inverted/page alternation, the same orange CTA band (shared
token, deliberately). The two are visibly, unmistakably different
compositions from byte-identical WITS copy and one shared token sheet.

---

## What the production ReferenceContract (src-side, later) should learn

1. **The doc-provenance discipline is worth keeping, not just for this
   spike.** Requiring every field to cite which real `refero_get_style`
   field it came from — and forcing an explicit `assumed` marker plus
   rationale when it didn't — caught real gaps (Pipe's near-total absence of
   component/motion/spacing data) instead of silently papering over them
   with plausible-sounding defaults. A production pipeline that calls
   `refero_get_style` live will have MORE data than either contract here,
   not less — but the reconciliation discipline for internally inconsistent
   fields (Ambrook's radius conflict) still applies every time, per Finding
   2's own warning.
2. **Motion and radius need a real mechanism before they belong in a
   contract that claims to be "live."** Shipping fields the compiler
   silently ignores is the exact class of bug `focalCrop` was in C1 before
   it was wired up. Either extend `compile.mjs` (or its production
   successor) to actually consume `motion.*` and `componentPosture.radiusClass`,
   or don't carry them as if they do something.
3. **Bleed magnitude needs to be checked against the page's actual measure
   budget, not chosen independently.** This spike hit that exact interaction
   bug on its first attempt. A production compiler should either compute the
   safe bleed ceiling from `page.measure` and the target viewport
   automatically, or the provenance audit should grow a check for it — right
   now nothing catches this class of overflow except literally rendering the
   page and measuring `scrollWidth`, which is what caught it here.
4. **Section-level visual collision (two slots sharing a column with no
   perceptible separation) is not caught by any current gate.** The
   Ambrook heading/media collision was schema-valid and gate-green. A
   pixel-level "no two `[data-edit-id]` boxes with an intersecting
   bounding rect" assertion would have caught it automatically instead of
   requiring a human to look at the screenshot — worth adding to
   `verify.mjs`'s per-output gates before this architecture is promoted
   further.
5. **A `ReferenceContract` genuinely produces different topologies from one
   brief, structurally, not just cosmetically** — the actual thing Gate C2
   set out to prove. `compile-from-contract.mjs`'s decision functions are
   pure functions of typed contract fields (`media.framing`,
   `componentPosture.depthMode`, `density.class`) and never inspect
   `contractId` or `sourceStyle` — the same "no branch inspects identity"
   discipline `compile.mjs` already holds itself to. That discipline is what
   makes this a compiler proof and not two hand-authored IR files wearing a
   contract costume.

### C2 review disposition (2026-08-15, independent Grok 4.5 audit)

1. **Claim narrowed**: the two outputs ship different hero photographs
   (per-style media inputs), so visible difference = composition + asset
   choice, not composition alone. The topology/surface divergence checks are
   what isolate composition; the screenshots do not. An identical-hero re-run
   is the clean isolation and belongs to the promotion-bar pass.
2. **Paint assertion is anti-blank, not pro-photo**: the 0.02 stddev threshold
   proves the hero box is not flat/empty (the C1 failure class); it does not
   bind the decoded pixels to the specific asset. Tighten (higher threshold +
   asset binding) at the promotion bar.
