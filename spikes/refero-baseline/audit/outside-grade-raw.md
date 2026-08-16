# Outside grade

## Per-dimension grades

| # | Dimension | Grade | Evidence (one sentence, cite a selector, file, or screenshot region) |
|---|-----------|-------|----------------------------------------------------------------------|
| 1 | Hero distinctiveness | D+ | `.hero__grid` is a conventional copy-and-buttons/photo split with no entrance choreography, while the dark `.spec` panel adds only a modest industry-specific touch. |
| 2 | Color character | C | `tokens.css:16-38` provides off-white, orange, charcoal, and a minor teal signal, but the desktop screenshot shows orange used flatly while nearly every middle section remains the same white surface. |
| 3 | Motion design | F | `index.html` contains no script and `site.css` has no keyframes or transforms; its hover rules at `site.css:111-213,619-691` only swap color, border, background, or underline. |
| 4 | Section division & rhythm | D+ | Nearly every content section uses identical `.shell.band.band--tight` treatment and 48px padding, leaving the orange `.creed` and final dark `.contact` as the only meaningful scene changes. |
| 5 | Card craft | D+ | `.quals li` and `.coverage__card` are literal white boxes with a hairline border and inert inset shadow, with no layered treatment, action, reveal, or hover response. |
| 6 | Visual hierarchy | C | The recurring `.label` eyebrows and 48px/36px heading scale establish basic order, but the screenshots remain dense with many similarly weighted small-text grids and no dominant focal point after the hero. |
| 7 | Variety / anti-monotony | B- | `.receive`, `.gallery`, `.about`, `.coverage__grid`, and `.faq` vary between split media, imagery, cards, and rows, although their identical white shells make those topology changes feel less pronounced. |
| 8 | Balance & composition | C+ | The desktop hero, `.receive`, and `.about` splits distribute weight competently, but the mobile screenshot becomes an extremely long sequence of narrow stacked blocks and the two-row scrolling header crowds the opening viewport. |
| 9 | Bespoke-ness | C | Cabling imagery, mono labels, the spec console, and unusually specific copy fit the trade, but the placeholder palette, absent supplied logo, generic stock photography, and lack of signature motion keep it readily transferable to another contractor. |

## Overall grade

D+

This is organized, readable, and more varied than a bare template, but the presentation still reproduces the benchmark’s decisive failures: a generic static hero, almost no surface progression, rudimentary cards, and color-swap-only interaction across a very long page. Its content specificity cannot compensate for a motion grade of F and multiple D-range craft dimensions.

## Ranked fixes

1. Recompose the hero around a full-bleed cabling image, an offset/layered company-record panel, and a staged copy-to-image entrance.
Hero distinctiveness: D+ to B; Bespoke-ness: C to B-; Motion: F to C+.

2. Build a page-level surface arc: warm opening, tinted scope panel, dark technical handover section, image-bleed work section, and a distinct closing CTA.
Section division: D+ to B; Color character: C to B; Variety: B- to B.

3. Add an IntersectionObserver reveal system with asymmetric section entrances, grouped-item stagger, moving 200–300ms hover states, and a complete reduced-motion fallback.
Motion design: F to B.

4. Replace the 48px/36px polite type scale with a committed 80–96px desktop display, stronger section-heading contrast, and fewer competing body-sized elements.
Visual hierarchy: C to B; Hero distinctiveness: D+ to B-.

5. Turn qualification and coverage boxes into one reusable technical-card formula with tinted depth, numbered/icon chips, edge illumination, stronger anatomy, and hover lift.
Card craft: D+ to B; Color character: C to B-.

6. Replace or visibly qualify the stock gallery, then art-direct approved WITS photography with purposeful crops, overlays, cable-path motifs, and offset annotations tied to image details.
Bespoke-ness: C to B+; Balance: C+ to B.

7. Consolidate overlapping scope, audience, handover, qualification, and process copy into fewer scenes with deliberately varied 64–144px spacing.
Section division: D+ to B-; Balance: C+ to B; Visual hierarchy: C to B-.

8. Replace the mobile header’s permanent second scrolling row with a compact accessible menu and tune mobile section density rather than merely stacking every desktop grid.
Balance: C+ to B-; Hero distinctiveness: D+ to C+.

## Trust check

- The site explicitly invents prohibited licensing and insurance claims: “Florida low-voltage licensing details” and “Are you insured and licensed? Yes” render as facts despite no support in the brief.
- Numerous unconfirmed operating promises ship as facts, including universal labeling/documentation, certification reports and as-built records, site walkthroughs, written schedules, occupied-building work, after-hours coordination, no minimum job size, statewide travel, and the same personal contact throughout.
- “WITS is small on purpose” and “the person who walks your site is the person who quotes it” invent a staffing model absent from the brief.
- The page violates the numeric constraint with “five years,” “Four ways,” numbered 01–04 sequences, a “twenty-minute fix,” and the placeholder telephone number.
- `(407) 555-0142` and `estimates@witscabling.example` are visibly fake contact details placed in primary conversion paths.
- The stock photographs are presented under “The work” and “What this looks like on site” without rendered disclosure; source comments and `img/ATTRIBUTION.md` admit they are not WITS projects and “must not ship.”
- The available logo and brand colors were not incorporated: the rendered wordmark is plain text and `tokens.css:26-29` identifies orange as a temporary brand-swap placeholder.