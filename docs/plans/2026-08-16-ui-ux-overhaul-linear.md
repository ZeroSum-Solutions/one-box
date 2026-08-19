# ONE BOX UI/UX overhaul — Midnight Instrument (Linear voice)

Date: 2026-08-16 · Branch: `feat/ui-overhaul-linear` · Status: approved direction, implementation in progress

## What Devin approved

Probe `direction-l.html` (scratchpad, rendered `dir-l2.png`): the app shell in
the owner-supplied Linear style bundle, with two amendments he requested on
approval — Coral Red promoted to real roles, and type moved off Inter to
**Switzer (UI) + Clash Display (display/headings)** (his round-2 specimen pick).
The full visual contract lives in `DESIGN.md` ("One-Box Midnight Instrument",
lint: 0 errors). This doc is the scope + execution contract for the build.

Approval trail: GSAP-voice round rejected (font/structure/polish) → cool-glass
round reverted → owner supplied the Linear bundle ("use this style please") →
Linear probe approved ("yes i like it, please use some red for colors too …
and change the font").

## Scope

Five workstreams, in dependency order:

### W1 — Token layer + fonts (the root-cause fix)
- Replace the GSAP `:root` block in `src/app/globals.css` with the Midnight
  Instrument semantic set (from `design.md export`, hand-tuned): surfaces,
  text ramp, accents, radii, spacing, shadows, control heights.
- Define the previously-undefined semantics ONCE: every `var(--line, #d8d8d4)`
  style fallback is deleted; `--line` class needs are served by
  `--border-graphite` / `--border-smoke`. Grep gate: zero `var(--*,#literal)`
  color fallbacks remain in app CSS.
- Retire: cream palette tokens, `--stage-*` GSAP hues (remap to accent set:
  intake=pulse, scanned=teal, locked=coral, synthesized=iris, built=lavender,
  edited=lavender), pill-button base styles.
- Fonts via `next/font/local` in `src/app/layout.tsx`: Switzer 400/510(Medium)/
  590(Semibold), Clash Display 500/600, JetBrains Mono 400. Files under
  `src/fonts/` (Fontshare FFL for Switzer/Clash — free commercial use, files
  not resold standalone; JetBrains Mono OFL). Expose as `--font-body`,
  `--font-display`, `--font-mono`. Weight mapping note: Switzer ships
  Medium(500)/Semibold(600) files; they SERVE the contract's 510/590 roles.
- Button system classes: `.btn-primary` (lime), `.btn-coral`, `.btn-ghost`,
  `.btn-white-pill`, `.badge`, `.seg-pill` per DESIGN.md Controls table.
  Compact heights 24–34px desktop; ≤768px keeps 44px hit areas via padding.

### W2 — Intake screen (`src/app/page.tsx` intake phase + `IntakeComposer` + `IntakeControls`)
- Nav bar (brand + Runs/Evidence/Settings links + white-pill New project).
- Hero: coral tick eyebrow, Clash 600 display statement, fog sub.
- Composer as carbon card: textarea, hairline-divided control row (target
  segment pills, research dot-badges with popover explanations kept from
  current IntakeControls behavior, upload badges), lime "Start the build".
- Example-prompt pill row (reuses GUIDANCE_PROMPTS content class).
- Transcript/failure states restyled to card grammar (keep all reducer logic,
  retry/edit flows, aria roles — this is a reskin + layout change, not logic).

### W3 — Pipeline timeline + scan presentation (`page.tsx` pipeline phase, `StageCard`, CSS)
- Timeline header → KPI-strip class treatment; stage cards → carbon cards with
  badge-based stage identity (dot-badges, not colored titles).
- NEW `ScanMarketCard` presentation for the scanned stage: KPI strip (medians/
  count/market) + two-panel grid — Yelp roster (ranked rows, verified badges,
  ghost Site buttons, filtered-out disclosure in coral) + Market map panel
  (embed in obsidian body, header + teal count badge, mono caption, external
  link). Data sources unchanged: `emitYelpCard` + competitor card + `CardMap`
  from `src/lib/pipeline.ts` — presentation-layer only. If card payload shape
  needs enrichment (e.g. joining yelp roster + map into one view), extend the
  EMITTED card structure additively in pipeline.ts without changing artifacts
  or contracts.
- Map pins already come from the embed; the panel frames it (no full-bleed).

### W4 — Evidence workspace one-action flow (`EvidenceWorkspace.tsx` + CSS)
- Single workspace, Mercury layout: gate rail card (six named gates, three-state
  dots, mono metadata) + artifact panel (header-pinned actions).
- ONE action per gate: "Approve & continue" chains the existing API actions
  client-side — `submit` (when draft) → `approve` → `advance` — then kicks the
  run via `POST /api/run {runId}` fire-and-consume and refreshes workflow state.
  The user never leaves the workspace; "Resume generation" link survives only
  as fallback when no artifact exists. NO evidence API changes; IMP-062
  preview/approve/revise/export all remain per gate.
- "Request changes" = coral action, opens the inline note + revision path
  (existing request-revision + save-version flow, restyled inline).
- Artifact previews: keep ArtifactPreview structure; restyle to obsidian wells,
  key-value rows, token tables with swatches; human visual review form gets the
  card grammar (logic untouched — it is a compliance surface).
- White-island CSS (hardcoded `#1b1b18` inks, `--line` fallbacks, `#fff`
  cards) is deleted with W1; evidence surfaces live on carbon like everything
  else.
- Pre-build recap: before the `build` gate's approve, the action row shows a
  compact recap line of the five prior approvals (client-side from workflow
  state).

### W5 — Workbench structure pass (`Workbench.tsx`, `ReferenceSelectionPanel`, preview page)
- Inherits W1 tokens automatically; then: rail/divider/panel chrome to card
  grammar, reference-selection panel restyled (carbon cards, badge chips,
  compact buttons), clarify preview⇄workbench relationship with an explicit
  header strip (site title + run id + mode) per IMP-015..27 constraints.
- Structural changes stay within existing component logic; no editor-behavior
  changes.

## Out of scope (unchanged from handoff)
- Generator bugs: `componentStates` `--colors-*` namespace mismatch; gate
  repairs not accumulating across `built` retries. Do not mask via restyling.
- Generated client sites and their per-run contracts.

## Gates before shipping
- `npx vitest run` — all 445 passing (some UI tests may need updating for new
  markup/classes; update tests to the new truth, never delete assertions).
- `npm run typecheck` — clean.
- `npm run lint` — 0 errors (5 pre-existing warnings allowed).
- Visual verification against `dir-l2.png` probe in the dev server, all three
  surfaces + workbench, screenshots to Devin.
- Grep gates: no `#fffce1`/`#0ae448`/GSAP tokens in app CSS; no color literal
  fallbacks in `var()`.

## Execution order
W1 alone first (everything depends on it) → W2/W3/W4 in parallel (separate
files) → W5 → gates + visual pass. Worktree isolation not needed if each
workstream owns its files; `globals.css` is shared — W2–W5 append component
sections in clearly-marked blocks to avoid collisions, W1 owns the token head.
