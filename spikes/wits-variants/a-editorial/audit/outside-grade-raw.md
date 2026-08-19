# Outside grade

## Per-dimension grades

| # | Dimension | Grade | Evidence (one sentence, cite a selector, file, or screenshot region) |
|---|-----------|-------|----------------------------------------------------------------------|
| 1 | Hero distinctiveness | B | The desktop hero combines an oversized trade-specific headline, monochrome commissioning image, overlaid `.spec.glass--dark` company record, and six-stage `[data-hero]` entrance rather than a default text-and-photo split. |
| 2 | Color character | B | `site.css` establishes light, sunk, and dark surfaces with orange reserved for interactions and `.accent-word`, although the dominant black/off-white/orange palette still feels broadly transferable. |
| 3 | Motion design | B | `site.js` supplies once-only IntersectionObserver reveals with 90ms group staggering, while `site.css` adds hero choreography, moving hover states, image zoom, and reduced-motion handling, but no genuinely signature motion moment. |
| 4 | Section division & rhythm | B+ | The desktop capture alternates dark bands, sunk panels, split compositions, galleries, and large varied spacing, though several sparse light sections still become long islands of heading-plus-content. |
| 5 | Card craft | B- | `.spec`, `.seam-cell`, and `.console` provide distinct anatomy and some lift or surface feedback, but most remain severe rectangular data boxes without a particularly memorable visual treatment. |
| 6 | Visual hierarchy | B | Large uppercase display type, recurring `.eyebrow` labels, numbered metadata, and constrained body measures create a reliable reading order on both screenshots, albeit one repeated almost unchanged across every section. |
| 7 | Variety / anti-monotony | B+ | The page moves through hero split, seam grid, numbered index, statement band, list-plus-image, ledger, timeline, asymmetric gallery, portrait split, consoles, and FAQ without consecutive identical layouts. |
| 8 | Balance & composition | B- | The hero, creed, handover, and gallery compositions are balanced, but the desktop ledger, timeline, and FAQ leave substantial low-information whitespace while the 13,253px mobile page feels overextended. |
| 9 | Bespoke-ness | B- | Cabling-specific language, monochrome infrastructure imagery, documentation motifs, and the five-year closet statement provide industry character, but the text wordmark, generic palette, stock photography, and reusable editorial system stop it feeling uniquely WITS. |

## Overall grade

B-

This clearly surpasses the D baseline through deliberate typography, multiple surface treatments, varied layouts, staged entrances, and moving hover states. It remains short of a strong B because its motion is competent rather than distinctive, several sections repeat the same editorial hierarchy, the page is excessively long, and its strongest apparent proof—photography and operational specificity—is unsupported or misleading.

## Ranked fixes

1. Replace the stock hero and gallery with commissioned WITS job-site photography; until then, visibly label stock and remove “The work” framing.
   Hero distinctiveness: B to A-; Bespoke-ness: B- to A-; also resolves the largest trust failure.

2. Remove every unsupported operating promise, license/insurance claim, minimum-job policy, and handover guarantee until WITS confirms each one.
   Bespoke-ness: B- to B by replacing fabricated specificity with authenticated company proof; trust materially improves.

3. Replace the reserved phone number and `.example` email with verified contact details or an explicit non-live prototype state.
   Bespoke-ness: B- to B; restores credibility to the primary conversion path.

4. Build one signature cable-flow interaction—for example, a traced run connecting labeled endpoints as the handover section scrolls into view.
   Motion design: B to A-; Hero distinctiveness and Bespoke-ness: B/B- to B+.

5. Use the supplied WITS logo and documented brand colors instead of the plain `.wordmark` and generic monochrome-orange palette.
   Color character: B to A-; Bespoke-ness: B- to B+.

6. Consolidate the audience, qualifications, process, and FAQ copy so the mobile page loses several thousand pixels without losing decision-critical information.
   Section division & rhythm: B+ to A-; Balance: B- to B+.

7. Recompose the hero around a WITS-specific labeled-rack or as-built-document motif that visibly connects the headline, image, and company record.
   Hero distinctiveness: B to A-; Visual hierarchy: B to B+; Bespoke-ness: B- to B+.

8. Give `.console` and `.seam-cell` one shared but richer surface recipe with cable-path edges, connector details, and stateful reveals rather than mostly flat black rectangles.
   Card craft: B- to B+; Color character: B to B+.

## Trust check

The rendered site violates the brief’s trust constraints: `img/ATTRIBUTION.md` admits all photographs are stock and “must not ship,” yet `#work` presents them under “What this looks like on site” without disclosure; `#quals` and the FAQ invent Florida low-voltage licensing, insurance, occupied-building procedures, no minimum job size, statewide-normal travel, and other policies; the hero, creed, handover, process, and about sections invent labeling, testing, as-built records, written schedules, same-person service, and callback practices; “five years” and “twenty-minute fix” add prohibited numbers; and `(407) 555-0142` plus `estimates@witscabling.example` are visibly presented as real contact details despite being reserved placeholders.