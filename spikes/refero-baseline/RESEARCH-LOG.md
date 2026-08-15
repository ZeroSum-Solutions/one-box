# Refero-only baseline — research log

**Date:** 2026-08-15
**Brief:** `BRIEF.md` v1 (WITS, Orlando FL)
**Rule for this run:** Refero MCP is the **only** design input. No template, no
section registry, no house aesthetic, no other reference source. Every visual
decision must trace to a Refero style ID recorded below.

Model spend on design generation: **$0.** The design assets came from Refero;
the synthesis and the build are hand-authored from them.

---

## 1. Queries run

| # | Tool | Query | Result |
|---|---|---|---|
| 1 | `refero_search_styles` | `technical infrastructure engineering company, precise clean professional, trustworthy B2B` | 1000 results, page 1 of 100. Highly relevant. |
| 2 | `refero_search_styles` | `modern commercial contractor services, dependable high quality, clean editorial layout` | 1000 results. Relevant, skewed architectural/portfolio. |
| 3 | `refero_search_styles` | `field service trades contractor, photography led, approachable dependable, warm professional` | 1000 results. Relevant, surfaced the warm/approachable end. |
| 4 | `refero_search_screens` | `B2B technical services company homepage with services list and call for estimate` (web) | 1000 results. **Largely irrelevant** — see §4. |
| 5 | `refero_get_style` | `15fd028d…`, `63db7f14…`, `5d884659…` | Full references returned. |
| 6 | `refero_get_style` | `74adbdf2…`, `b11e1e78…` | Full references returned. |

## 2. Candidates surfaced (styles)

| Style ID | Title | Read | Verdict |
|---|---|---|---|
| `74adbdf2-822b-4df3-80d1-3c5a1b263a90` | Fingerprint | Data-sheet precision; warm off-white; sans + mono; single orange accent; dark console panels | **FOUNDATION** |
| `63db7f14-d256-47a7-aa0c-337555022b6b` | Outsource Consultants | Architectural blueprint; mono annotation; 0px radius; full-bleed accent divider | **BORROW** |
| `5d884659-1d6b-4b82-8ccd-dbb0434667a8` | Tailscale | Quiet, trustworthy, engineered; 3-level surface system; very subtle card shadow | **BORROW** |
| `b11e1e78-3c62-45df-bf28-17c97718ed7d` | Ambrook | Warm, grounded, tactile; candid desaturated work photography | **BORROW (imagery rule only)** |
| `15fd028d-c493-47a9-8e69-0a59c6fdb14b` | Andercore | Dark industrial control panel; crimson accent; trade-and-logistics photography | **REJECT (one device kept)** |
| `46e36efe-3ae2-4ea4-b4d0-9b35a8e7201e` | NEVERHACK | Light, airy, premium enterprise, violet accent | Not read in full — close 2nd to Fingerprint |
| `c00d3961-a100-4c22-91fe-75f6e488e579` | Pipe | Near-black canvas, molten orange, split photographic hero | Not read in full |
| `46bfdc1b-2a29-454e-ad35-e01a41c59dcf` | Inngest | Dark charcoal, amber precision accent, grid motifs | Not read in full |
| `de162c4d-f3e5-489f-b9eb-ac31b8e0412e` | Spacelab | Gallery-like, architectural, photography-dominant | Not read in full |
| `86351665-7483-48d1-9be4-5fe456093686` | Elementor | Stark monochrome, poster-like, full-bleed photo hero | Not read in full |
| `3e14bbe4-e207-4f6b-bf64-993fad7319b8` | MANNA | Linen-beige, editorial architecture portfolio | Not read in full |
| `13bc10c0-3cf9-4feb-8bf8-bfdd123931fc` | PostHog | Workshop-inspired, marigold, mascot illustration | Not read in full |
| `11fe119c-6dc0-495d-8885-78a275967bb7` | Apron | Pale yellow, amber, full-bleed lifestyle photo hero | Not read in full |
| `b9a2fcef-…`, `f293bacf-…`, `067fe2b3-…`, `6e358cfd-…`, `c0ca42f7-…`, `3b8443cf-…`, `a0f473eb-…`, `a4aebfee-…`, `5b18148a-…`, `7b6c53c7-…`, `14edc470-…` | various | Portfolio / fintech / devtool | Off-brief |

### Why Fingerprint is the foundation

The brief's feel list contains a direct tension: **technical** and
**approachable** in the same sentence. Most of the strong technical candidates
(Andercore, Pipe, Inngest, Outsource Consultants) resolve that tension by
dropping "approachable". Fingerprint's own north star resolves it explicitly —
*"technical but friendly"*, a warm off-white canvas rather than a cold white or
a black one, with the technical register carried by a monospace data treatment
instead of by darkness. That is the single best structural match to the brief
in the result set.

### Why Andercore was rejected

It is the closest match on *industry* — its own description names "rugged
trade-and-logistics visual language", and it is the only candidate whose
photography direction is literally industrial trucks and machinery. It was
rejected on *audience*. WITS sells to commercial offices, GCs, and new
construction — buyers who need the vendor to read as safe and documented, not
as heavy industry. Its own do/don't list also forbids the light theme the
brief left open. One device was kept: a single dark high-contrast band for the
final call-to-action.

## 3. What Refero actually gives you

Per full style reference, delivered as structured content:

- **Named colour tokens** with hex, token name, and a written role for each
  (Fingerprint: 13 colours; Ambrook: 11; Tailscale: 11; Andercore: 7).
- **Typography** — real families, substitute stacks, weights, size sets, line
  heights, per-size letter-spacing, and the role each family plays.
- **A named type scale** — caption / body / subheading / heading / display with
  size, line height, letter spacing, and token name.
- **Spacing and shape** — density, per-element border radius, section gap,
  card padding, element gap, page max width.
- **Shadows** as exact CSS values with token names.
- **Surface levels** (0/1/2) with hex and purpose — Tailscale and Ambrook.
- **Component specs** — background, text colour, border, radius, exact padding,
  font and weight, per component.
- **Do / Don't lists** — typically 6–7 each, specific and enforceable.
- **Imagery direction** — subject, treatment, density, icon style.
- **Layout** — max width, hero pattern, section rhythm, column patterns, nav.
- **Agent prompt guide** — a quick colour reference plus 3–5 worked component
  prompts.
- Sometimes **motion philosophy** (Ambrook: durations and easing).

This is materially more than "inspiration". It is close to a design contract.

## 4. Where Refero is weak — findings

1. **The screen corpus does not cover local/commercial trade services.** Query 4
   asked for a B2B technical-services homepage with a call-for-estimate CTA and
   returned: Bloomberg Terms of Service, Webflow Terms of Service, Kraken legal,
   a Microsoft plan chooser, a JetBrains partner form, and a DJI support page.
   Nothing in the first page was a services company marketing homepage. The
   corpus is SaaS/product-heavy. **Screens contributed nothing to this build.**
   For this business category, Refero's value is entirely in **styles**.

   **Re-tested with a maximally direct query** to rule out bad prompting.
   `electrician contractor construction company website` (web) returned: the
   LEGO contact page, Chargetrip EV-routing software (three separate screens),
   Programa interior-design SaaS, a Visual Electric Terms of Service, Netflix
   careers, Webflow Terms of Service, the Twitch Safety Center, and Tesla
   support. Zero contractors. Zero local services.

   Note the failure mode: semantic search matched the wrong *sense* of
   "electric" — Visual Electric (an AI image tool), Chargetrip (EV), Tesla.
   Two independent, directly-worded queries both returned Terms-of-Service
   pages. This is a corpus gap, not a prompting problem. Do not spend calls on
   `refero_search_screens` for trade, local-service, or contractor businesses.

2. **At least one style record is corrupted.** `14edc470-fa1c-47f9-9efa-d44194be4aec`
   (Empower) returns a description that breaks mid-sentence into a leaked raw
   JSON fragment (`","searches":[…]`) followed by several thousand characters of
   repeating bracket glyphs, including stray Cyrillic ("строг"). It appeared in
   two separate searches. Anything consuming search descriptions programmatically
   must be defensive about this.

3. **Fonts are mostly licensed and not obtainable.** PP Neue Montreal, GT America
   Mono, Lateral, Lateral Display, MDIO, Archivo, Inter, JetBrains Mono, Space
   Mono. Refero supplies a `substitute` for each, which is what makes the output
   usable — but a build cannot honour the named families without licensing.
   Only the substitutes are safe by default.

4. **Some token values are transcription artefacts.** Outsource Consultants
   reports padding of `9.99999px` and a hover colour in raw `oklab()`. Values
   need rounding and sanity-checking, not literal use.

5. **Styles are page-level, not multi-page systems.** Each is extracted from one
   marketing page. Nothing describes secondary page types, forms at depth, or
   states beyond hover. Anything past a landing page is extrapolation.

6. **Refero's token roles are not accessibility-audited, and following them
   literally produces WCAG AA failures.** This is the most consequential finding
   in the list. Refero assigns each colour a written role. Three of those roles,
   applied exactly as written, fail:

   | Refero token | Its stated role | Measured | Verdict |
   |---|---|---|---|
   | Accent Orange `#f35b22` on white | *"primary calls to action"* — [F]'s own button spec | 3.32:1 | Fails AA normal text |
   | Faded Stone `#8c8c89` on Canvas White | *"tertiary text, descriptive labels"* | 3.23:1 | Fails AA normal text |
   | Accent Orange `#f35b22` on Canvas White | *"key highlights in text"* | 3.17:1 | Fails AA normal text |

   The first shipped in the build's first pass and the other two shipped too —
   all three were caught only by computing every pair independently, after the
   page already looked finished and had passed a visual review. A generation
   engine consuming Refero **must** run a contrast gate over the resolved token
   pairs; the style reference will not warn you, and the page looks correct.

   All three were repaired using Refero's *own* darker tokens (Graphite `#454542`
   at 9.21:1, Accent Edge `#be400f` at 5.11:1) rather than invented values, so
   provenance survives the fix.

   **A first repair pass then claimed "19 pairs, all pass". That claim was also
   wrong**, and the GPT-5.6 audit caught it. Two failures were still live:
   14px coverage metadata at 3.37:1 (a single-line rule a bulk edit missed), and
   the contact-link hover at 4.10:1 — which passes as 30px large text on desktop
   but fails once the `<=640px` rule drops it to 16px normal text.

   The pattern is the point: **three hand-audits of one small page, three wrong
   answers.** Hand-listing pairs audits your memory of the stylesheet, not the
   stylesheet. `contrast-audit.mjs` now walks the rendered page at both
   viewports, resolves effective backgrounds through transparency, applies
   size-aware thresholds, and forces every `:hover` rule. It exits non-zero on
   failure and is negative-tested against all three known defects.

   Two traps found while building it, both of which silently produce a green
   gate:
   - `getComputedStyle` returns the **interpolated** value mid-transition, so a
     150ms colour transition makes a freshly-forced hover state read as the old
     colour. Transitions must be killed before measuring.
   - Forcing a hover *colour* without its hover *background* invents failures.
     Two states here darken the background and lighten the text together; a
     colour-only gate reported them as light-on-light. A gate that cries wolf
     gets switched off.

## 5. The mix

| Layer | Source | Style ID |
|---|---|---|
| Palette, type pairing, type scale, radius, shadow, page width, section rhythm | Fingerprint | `74adbdf2-…` |
| Mono annotation labels, 0-radius technical elements, full-bleed accent divider, two-column text/structured-visual pattern | Outsource Consultants | `63db7f14-…` |
| Surface level system (0/1/2), restrained elevation, alternating light rhythm | Tailscale | `5d884659-…` |
| Photography art direction (candid, desaturated, real work environments) | Ambrook | `b11e1e78-…` |
| Single dark high-contrast CTA band | Andercore | `15fd028d-…` |

## 6. Verdict on Refero as a design source

**Refero alone is enough to design from.** The build in `site/` used no other
design input: no template, no section registry, no house palette, no second
reference source, and no model call for design generation. Every colour, type
size, radius, shadow, surface level, spacing value, page width, imagery rule
and motion value traces to a style ID in §2.

Two qualifications:

1. **Styles carry the build; screens contributed nothing** for this business
   category (§4.1). Any pipeline that treats "search Refero" as one undifferentiated
   step will get much worse results than one that goes to styles first.
2. **Refero supplies the vocabulary, not the composition.** It says what a
   surface, a button, a label and a rhythm should be. It does not say what
   sections this business needs or what order they go in. That came from the
   brief. This is the actual division of labour, and it is why a fixed section
   registry defeats the whole exercise — it overrides the only part Refero
   deliberately leaves open.

Two deviations from Refero were required and are documented at their point of
use:

- **CTA text colour.** Fingerprint specifies white on Accent Orange, which
  measures **3.32:1** and fails WCAG AA for normal text. The build uses Ink on
  Accent at **5.55:1**. Ambrook's own primary button uses dark text on its
  accent, so the override stays inside the reference set. (`site.css`, `.btn--primary`)
- **Section padding.** Fingerprint's 48px is a *gap* token; its own page runs
  looser between bands. Major bands here use `2 × 48px`. (`DESIGN.md` §7)

## 7. Build defects found and fixed during verification

| Defect | Fix |
|---|---|
| Photography plate at 16:9 full width rendered as a 666px empty hole that dominated the page | Sized as a callout (4:3, max 280px) with the art-direction copy beside it as the actual content |
| `auto-fit` on the five secondary services produced a 4+1 split, orphaning the fifth | Explicit 5-column grid at desktop, 2 at tablet, 1 at mobile |

Verified at 1440 and 390: no horizontal overflow, no console errors, one `h1`,
`tel:` and `mailto:` both present.

Reproduce any of these with:

```bash
# in an MCP-enabled session
refero_get_style style_ids=["74adbdf2-822b-4df3-80d1-3c5a1b263a90"]
```
