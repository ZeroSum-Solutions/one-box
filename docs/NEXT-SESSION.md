# NEXT SESSION — open to-dos

Working board for ONE BOX. Read this first, then the active plan it points into.
Keep it short: an item lives here only while it is open. When one lands, delete
the line and record the outcome in the plan or spec it belongs to.

Last updated: 2026-08-20.

Authority: `docs/plans/2026-08-20-studio-consolidation-extraction.md` (the active
consolidation plan — decisions D1–D6, spec list, kill criteria). This file is a
queue, not a source of truth. If the two disagree, the plan wins.

## Do first

- [ ] **T-1 — Fix DEF-1: the site is published before gates run.**
  `buildSite()` swaps the staged directory over the live one at
  `src/lib/builder.ts:190`; `stageBuild()` only calls `runGates()` afterwards
  (`src/lib/pipeline.ts:2412`, gates at 2432). A gate-failing build has already
  replaced the previous preview. Move the promotion after blocking gates pass.
  *Blocks T-2 — do this first or the probe run eats the previous preview.*
  *Done when:* a deliberately gate-failing build leaves the published site
  byte-identical, proven by a test.

- [ ] **T-2 — Probe run: one design system through the current pipeline.**
  Take one MishMash design system that already meets the CAT-001 bar (HTML +
  CSS custom properties + a ONE BOX-shaped DESIGN.md), or strip one until it
  does. Convert it **by hand**. Run the current pipeline. Record which gates fail
  and why.
  This single run is the only inventory that counts — it tells us whether this is
  content-into-spine or whether the consolidation thesis is false.
  *Do not build an ExecutionAdapter to make this work.* Both auditors named that
  as the seductive wrong first step. If one package cannot get through without a
  new runtime abstraction, the thesis is already wrong.
  *Done when:* a written gate-failure record exists in `docs/audits/`.

## Do next

- [ ] **T-3 — Fix DEF-2: gates are coupled to the frozen template.**
  The `no-js` gate hardcodes `hero.headline`, `nav`, `contact.cta`
  (`src/lib/gates.ts:523`); token drift parses only `--color-*` and `--font-*`, so
  HSL, gradients and named colors are skipped rather than rejected
  (`src/lib/gates.ts:235`); `runGates()` throws outside a structured report when
  `site/tokens.css` is missing (`src/lib/gates.ts:115`).
  Scope from T-2's failure record — do not guess at it beforehand.

- [ ] **T-4 — Decide `perf-budget`.** It is advisory today
  (`src/lib/gates.ts:18`). Either make it blocking or record why not (GATE-001).
  Until then, "all gates fail closed" is not a true statement about this repo.

- [ ] **T-5 — Write the provenance schema (LIC-001) before any import.**
  Source repo, commit, path, SPDX licence, licence-text pointer, SHA-256, import
  mode, destination. CI fails on missing records or hash drift. Nothing gets
  copied in from MishMash or OpenWork until this exists.

- [ ] **T-6 — Commit the CAT-001 bar and cap as numbers.**
  Bar: HTML + CSS custom properties + ONE BOX DESIGN.md; no framework components,
  no foreign tool names, no JS build step. Cap for v1: single-digit design
  systems, ~10 templates, a named skill list. Failing the bar means exclusion,
  not wrapping.

## Watch list — do not start these

Recorded so they are not restarted by accident. Each is excluded by a decision in
the plan, not by oversight.

- **Do not build an ExecutionAdapter yet.** Blocked behind P1 (artifact boundary)
  and P2 (proof harness). See EXEC-001 and the plan's "First action" section.
- **Do not add a second routing table.** ONE BOX already has a routing policy at
  `docs/eval/model-routing/policy.md`, and its evidence matrix authorizes no new
  production route (`docs/eval/model-routing/task-model-matrix.md:22`).
- **Do not delete the legacy DESIGN.md renderer** before migration behaviour is
  defined (DES-001). Legacy is retained compatibility, not unfinished work.
- **Do not start a second artifact type** (PPTX, MP4, audio) before D5 is
  satisfied — its own artifact contract, compiler, blocking gates, preview
  semantics, and rollback proof.
- **Do not adopt Panda CSS, Storybook, Radix, Biome, ts-morph, PostHog,
  OpenTelemetry, Medusa/Strapi, OpenWebUI, Remotion, Theatre.js, Excalidraw, or
  Styled System.** All evaluated 2026-08-20 and excluded with reasons — see
  "Evaluated and excluded" in the plan.
- **Do not vendor any byte from OpenWork's `/ee`.** FSL-1.1-MIT: internal use is
  permitted, commercial substituting use is not, until each version's two-year
  MIT conversion (LIC-002).

## Open question for the owner

None blocking. HTML-first is decided (D5), not a poll. If PPTX and MP4 must ship
in v1, the plan is wrong and the correct move is to stay on MishMash and delete
its certified dead weight instead — say so before T-2 rather than after.
