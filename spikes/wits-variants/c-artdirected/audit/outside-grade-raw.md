# Outside grade

## Per-dimension grades

| # | Dimension | Grade | Evidence (one sentence, cite a selector, file, or screenshot region) |
|---|-----------|-------|----------------------------------------------------------------------|
| 1 | Hero distinctiveness | B+ | The desktop hero layers image-specific annotation, alternating title alignment, proof chips, and staged copy, but `.hero__callout` disappears below 860px and leaves mobile with a conventional text-over-photo stack. |
| 2 | Color character | B | `site.css` establishes warm canvas, tinted, and dark surface tiers with disciplined orange accents, although the beige/ink/orange palette remains attractive rather than unmistakably WITS-specific. |
| 3 | Motion design | A- | `site.js` and `.reveal` provide letter-level hero choreography, staggered intersection reveals, moving hover states, a pulsing callout, shared timing tokens, and complete reduced-motion handling. |
| 4 | Section division & rhythm | B+ | The desktop capture alternates tinted panels, dark bands, timelines, full-bleed imagery, and offset media, but `.about` becomes cavernous on desktop and the mobile gallery-to-about sequence is visually prolonged. |
| 5 | Card craft | B | `.scope-card` adds a clipped corner, index, lift, shadow, and arrow reveal while `.audience-card` and `.coverage-card` provide variants, but several still resolve to bordered boxes and “More on this” is a non-interactive `<span>`. |
| 6 | Visual hierarchy | B+ | Consistent `.eyebrow`, committed Fraunces display type, restrained body copy, and strong dark/light inversions create clear reading order, though secondary copy becomes very small and recessive in the 1440px capture. |
| 7 | Variety / anti-monotony | A- | The page moves through card grids, a split manifesto, handover ledger, seam grid, timeline, photo strip, asymmetric portrait, coverage cards, and accordion without repeating consecutive topologies. |
| 8 | Balance & composition | B | The hero and `.receive__grid` distribute weight effectively, but the sparse process row and tall narrow `.about__panel` leave conspicuous unused space on desktop while mobile stacks several large image blocks consecutively. |
| 9 | Bespoke-ness | B | Cable-test annotation, labeled-handover narrative, technical imagery, and 15/30-year proof make this cabling-specific, but generic stock photography and unsupported operational copy prevent it from feeling authentically specific to WITS. |

## Overall grade

B

This is clearly above the D benchmark and contains a real visual and motion system, but its strongest art direction is desktop-only, several secondary sections fall back to polished template patterns, and the bespoke impression depends heavily on stock imagery and claims the brief never supplied.

## Ranked fixes

1. **Replace all stock photographs with commissioned WITS work and pin annotations to genuinely documented installation details.**  
   Hero distinctiveness B+ to A-, bespoke-ness B to A-, and trustworthiness materially improves.

2. **Remove or verify every invented licensing, insurance, minimum-job, occupied-building, testing, documentation, and service-policy claim.**  
   Bespoke-ness B to B+ by replacing synthetic specificity with defensible company proof; it also removes the launch-blocking trust failure.

3. **Retain an image-specific signature composition on mobile instead of hiding `.hero__callout` and reverting to a stacked panel.**  
   Hero distinctiveness B+ to A- and balance B to B+.

4. **Recompose `.about__grid` around a wider contextual image, owner portrait, or documented project artifact rather than the tall stock rack crop.**  
   Balance B to A- and bespoke-ness B to B+.

5. **Turn each `.scope-card` into a real destination or remove the false “More on this” affordance, then add cable-specific diagrams or deliverable previews.**  
   Card craft B to A- and bespoke-ness B to B+.

6. **Animate section internals independently—rows, image panels, timeline connectors, and captions—instead of revealing whole sections as one `.reveal` block.**  
   Motion design A- to A by extending the existing vocabulary into deliberate section choreography.

7. **Tighten the sparse desktop process/about spacing and break the mobile run of full-width imagery with captions, offsets, or horizontal scrolling.**  
   Section division B+ to A- and balance B to A-.

8. **Bind the palette to verified logo colors and apply one repeatable technical surface treatment across annotations, cards, and data panels.**  
   Color character B to A- and card craft B to B+.

## Trust check

The page ships fictional contact details—`(407) 555-0142` and `estimates@witscabling.example`—despite acknowledging them only in a source comment. `index.html` also invents Florida low-voltage licensing and insurance/COI status, “no fixed minimum,” occupied-building and after-hours practices, routine interstate travel, same-person continuity, and universal testing, certification, labeling, test-result, and as-built handover policies. Finally, all six images are stock photographs explicitly marked “must not ship” in `img/ATTRIBUTION.md`, yet visible copy such as “The work,” “On this cable,” and “Fiber termination at the panel” presents them as evidence of WITS’s own work.