# Website categories — the space ONE BOX must cover

Supplied by Devin 2026-08-15. Three **independent axes**, not one list. A single
job sits at one point on each axis, and the three answers are used by different
parts of the engine.

This file is a **capture**, not a design. It records the target space so the
engine's variation work has something to be measured against. Nothing here is
implemented yet.

---

## Why three axes and not one list

The three lists look similar and are not interchangeable. They answer different
questions:

| Axis | Question it answers | Consumed by |
|---|---|---|
| 1. Purpose | *Why does this site exist for its owner?* | Intake, information architecture, section selection, conversion design |
| 2. Greenfield archetype | *What is this built on?* | Scaffolding, runtime, dependency and hosting choices |
| 3. Model routing | *Which model writes the code?* | Delegation — which lane a build or a stage is sent down |

A brochure site and a campaign landing page share axis 2 and axis 3 almost
entirely, and differ completely on axis 1. A premium brand site and a WebGL
immersive site may share axis 1 and differ on 2 and 3. Collapsing the axes into
one taxonomy is what produces a single generic pipeline — the failure this work
exists to fix.

---

## Axis 1 — Purpose-based taxonomy

Operational definitions of *why a website exists for its owner*, from the master
market study.

| Category | Definition |
|---|---|
| **Brochure / presence** | Communicates who the owner is, establishes credibility, directs to contact or location. Local service firms, consultant profiles. |
| **Portfolio / showcase** | Displays work, craft or identity to win clients. Design studios, photographers, creators. |
| **Commerce** | Sells goods, services or digital products directly, with on-site checkout. |
| **Product / SaaS marketing** | Markets software or a tech product that actually lives in an external application. |
| **Web application / portal** | Delivers a functional tool: account area, dashboard, booking system. |
| **Editorial / media** | Publishes recurring content; the audience is the primary asset. News, blogs, magazines. |
| **Campaign / landing** | Temporary, focused single-page build driving one time-boxed conversion. |
| **Institutional / public-sector** | Serves a nonprofit, educational or governmental mandate; revenue is secondary. |

**WITS sits here:** brochure / presence.

## Axis 2 — Greenfield setup archetypes

Default technology setups from the Comprehensive Technology Guide, chosen to
align operational weight with project scale.

| Archetype | Setup |
|---|---|
| **Fast marketing site** | Astro, or a statically biased Next.js. Optimised for speed and static delivery. |
| **Editorial or publication** | Next.js with a headless CMS — Sanity, Storyblok or Contentful. |
| **3D or interactive brand** | Vite or static Next.js with React Three Fiber, plus 2D semantic fallbacks. |
| **Ecommerce** | Shopify theme-first. Scale to Hydrogen/Oxygen only when custom UX justifies the trade-off. |
| **Full web application** | Next.js on a full Node runtime, relational DB (Postgres via Supabase or Neon), Stripe, Sentry, PostHog. |

**WITS sits here:** fast marketing site. The Refero baseline spike is plain
HTML + CSS, which is below even this — deliberately, to isolate design output
from framework noise.

## Axis 3 — Multi-model routing categories

Task classifications from the AI Model Routing Guide, used to decide code
delegation.

- Simple landing / marketing
- Premium brand / agency
- SaaS dashboard / full-stack app
- E-commerce
- Editorial / content-heavy
- Animation-rich / scroll-driven / interactive
- WebGL / 3D / shader / immersive
- Large legacy / redesign / debug / performance

**WITS sits here:** simple landing / marketing.

---

## What this means for the engine

Recorded now so the multi-style trial is designed against the real target, not
against the one case in front of us.

1. **The engine currently expresses zero of this.** `ENG-001` (hardcoded section
   registry) and `ENG-002` (frozen template copy) mean every output is a
   brochure/presence page on a fast-marketing stack, whatever the intake says.
   Axis 1 has one value in practice; axes 2 and 3 have none.

2. **Axis 1 drives section selection, and section selection is where sameness
   actually lives.** Different tokens on the same thirteen sections is not
   variation. An editorial site and a commerce site do not share a section set,
   an ordering, or a conversion target. Fixing sameness means the section list
   must be *derived*, not enumerated in source.

3. **Axis 2 must not be decided by the generator.** It is a consequence of axis 1
   plus scale, and it decides the whole build target. It belongs in intake.

4. **Axis 3 is orthogonal to output.** Which model writes the code must not be
   inferable from the rendered result. If two routing lanes produce visibly
   different design quality for the same brief, that is a defect, not a feature.

5. **The trial must vary layout topology, not only tokens.** Acceptance for the
   multi-style trial (see the handoff) is several sites from one brief that
   differ in *rendered layout topology*. This taxonomy adds a second axis to
   that: several **briefs** across axis 1, each producing a structurally
   appropriate section set — not the same skeleton restyled.

---

## Coverage status

| Axis 1 category | Engine support | Evidence |
|---|---|---|
| Brochure / presence | Partial — one fixed shape | Refero baseline spike; 9+ prior generated sites, all identical |
| Portfolio / showcase | None | — |
| Commerce | None | — |
| Product / SaaS marketing | None | — |
| Web application / portal | None | — |
| Editorial / media | None | — |
| Campaign / landing | None | — |
| Institutional / public-sector | None | — |

Update this table when a category is genuinely demonstrated — a rendered output
that a person would recognise as that category, not a config flag that exists.
