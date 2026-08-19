<!-- outside-grade | label: wits-variant-b-cinematic | model: gpt-5.6-sol | date: 2026-08-15 | url: http://127.0.0.1:8092/ -->

# Outside grade

## Per-dimension grades

| # | Dimension | Grade | Evidence (one sentence, cite a selector, file, or screenshot region) |
|---|-----------|-------|----------------------------------------------------------------------|
| 1 | Hero distinctiveness | B- | The desktop hero combines trade-specific copy with an offset `.hero__visual .spec` panel, but its underlying text-left/photo-right composition remains conventional. |
| 2 | Color character | C+ | `site.css` uses disciplined orange accents and three dark surfaces, but `--bg-1`, `--bg-2`, and `--bg-3` render so similarly that the screenshots read as one nearly uninterrupted black page. |
| 3 | Motion design | B | `site.js` supplies staggered intersection reveals while `.marquee__track`, card/image lifts, and reduced-motion rules form a real system, although `.hero.is-visible .reveal-item { animation:none }` cancels the intended hero text sequence almost immediately. |
| 4 | Section division & rhythm | C+ | The creed, gallery, alternate bands, and contact glow provide some variation, but most sections reuse the same dark surface, heading placement, and one of only two padding formulas. |
| 5 | Card craft | B- | `.glass.card` has numbered chips, translucent layering, inset shadows, and a four-pixel hover lift, yet the low-contrast treatment is repeated so broadly that cards, contact fields, qualifications, and FAQs lose individual character. |
| 6 | Visual hierarchy | B- | Large display type and consistent `.label` eyebrows establish clear reading order, but nearly every post-hero section receives the same heading scale and emphasis, flattening the page’s longer narrative. |
| 7 | Variety / anti-monotony | B- | The desktop page alternates grids, ruled lists, splits, a timeline, gallery, and FAQ, but the mobile capture collapses most of these into a very long succession of similarly styled stacked blocks. |
| 8 | Balance & composition | B- | Desktop splits such as `.receive` and `.about` are stable and well weighted, while several centered bands and the mobile qualification/FAQ runs feel cramped and overextended. |
| 9 | Bespoke-ness | C+ | Cabling terminology, handover concepts, and the 15/30-year panel are company-directed, but the orange-on-black glass aesthetic, stock photography, generic wordmark, and absent owner or real project proof remain readily transferable to another contractor. |

## Overall grade

C+

This materially clears the D baseline through competent hierarchy, varied layouts, real hover behavior, scroll reveals, and a cohesive surface system, but it stops short of premium work: the dark-on-dark arc is monotonous, the glass treatment becomes a scaffold, the hero motion is partly neutralized, mobile is excessively stacked, and the most bespoke-looking content is unsupported rather than demonstrated.

## Ranked fixes

1. Replace the stock gallery and anonymous rack image with WITS-owned project photography, an owner portrait, and photographed handover artifacts.
Hero distinctiveness rises B- to B+ and bespoke-ness C+ to B+/A-.

2. Remove or obtain written confirmation for every operational promise, then turn confirmed labeling, testing, and as-built deliverables into visible proof instead of copy-only assertions.
Bespoke-ness rises C+ to B+ and visual hierarchy B- to B.

3. Create a stronger surface arc: introduce one genuinely warm/tinted band, one full-bleed photographic scene, and visibly different section spacing instead of three nearly indistinguishable blacks.
Color character rises C+ to B+ and section rhythm C+ to B+.

4. Fix the hero entrance conflict by delaying `.hero.is-visible` until choreography completes or separating hero animation state from scroll-reveal state.
Hero distinctiveness rises B- to B and motion B to B+.

5. Replace the generic marquee with a cabling-specific signature motion, such as a line tracing through labeled process nodes or an animated rack-to-desk handover path.
Motion rises B to A- and bespoke-ness C+ to B.

6. Limit the glass formula to priority surfaces and give services, handover deliverables, coverage, and FAQs distinct anatomies.
Card craft rises B- to B+ and variety B- to B+.

7. Consolidate repetitive claims across scope, handover, process, about, and FAQ so each section adds new information rather than restating labeling, testing, and documentation.
Visual hierarchy rises B- to B and section rhythm C+ to B.

8. Recompose mobile into fewer, stronger scenes: use compact horizontal process steps, close every FAQ initially, shorten the qualifications block, and add larger inter-section contrast.
Balance rises B- to B and mobile variety B- to B.

## Trust check

The rendered phone number and `.example` email are fictional placeholders presented as working contact details; all photographs are Unsplash stock but appear beneath “What this looks like on site” with project-like captions; and the brief does not support the site’s claims that WITS labels and documents every run, supplies certification results and as-builts, uses one contact throughout, performs pre-quote site walks, provides written schedules, is deliberately small, routinely handles occupied or after-hours work, has no minimum job size, serves Florida statewide, or is insured and licensed with COI availability.