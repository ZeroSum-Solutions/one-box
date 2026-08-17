# Handoff: ONE BOX UI/UX overhaul
status: not started — this is the brief for the next session
date: 2026-08-16
branch: spike/refero-baseline (pushed, 4 commits ahead of b94f85a)

## The ask (Devin, end of the maps-yelp session)
The app's own interface needs a redesign, not a patch. His words: the system flows are
"pretty whack", there are "a hundred bugs", the buttons are "way too big" and need to be
compact with different colours, the first screen needs to look cool, the competitive screen
needs to actually feature the Google Maps and Yelp material, and information needs "clean
little boxes" to live in. He is supplying a font to apply — WAIT for it before locking type.

## Read these first
- `DESIGN.md` — ONE BOX's OWN design contract, "One-Box GSAP Studio": primary `#0ae448`,
  canvas `#0e100f`, text `#fffce1`, muted `#7c7c6f`, border `#42433d`, raised `#191919`.
  **This governs the app UI, not generated client sites** — those get a per-run contract under
  `evidence/versions/design-contract/`. Do not cross the two.
- `~/.claude/rules/frontend.md` — the design-contract workflow. The house pattern is: change
  `DESIGN.md` FIRST, then export tokens, then build from them, then grade the build against it.
  A font swap and a button restyle belong in the contract before they reach CSS.
  Lint: `npx --yes -p @google/design.md@0.3.0 design.md lint --format json DESIGN.md`
- `docs/specs/2026-08-13-refero-editor-requirements.md` and `docs/architecture/README.md`.

## The one root cause worth knowing before you touch CSS
`--ink`, `--muted`, and `--line` are **used throughout the evidence CSS and defined nowhere**.
Every use silently falls back to a light-theme literal (`#151513`, `#65655f`, `#d8d8d4`) on a
near-black shell. That is why the evidence workspace was unreadable. I fixed the specific
symptoms in commit `d671e43` by hardcoding ink on the white cards, which is a patch, not a fix.
The real job is to define the token set once, from `DESIGN.md`, and delete the fallbacks.
Grep `var(--ink` / `var(--muted` / `var(--line` to find every site.

## Surfaces, by size
| File | Lines | What it is |
|---|---|---|
| `src/app/globals.css` | 2757 | every app style; where the token work lands |
| `src/app/page.tsx` | 823 | the intake screen — the "make it look cool" one |
| `src/components/preview/Workbench.tsx` | 535 | the editor shell |
| `src/components/EvidenceWorkspace.tsx` | 496 | the review/gate screen |
| `src/components/ReferenceSelectionPanel.tsx` | 325 | the look picker |
| `src/components/StageCard.tsx` | — | renders every pipeline card, incl. scan output |
| `src/components/IntakeControls.tsx` | 263 | the intake toggles |

## Buttons — the concrete complaint
Current pill pattern, repeated in several places: `min-height: 44px; padding: 10px 16px;
border-radius: 999px;` plus `.pill-button` at 15px/24px. Devin wants these materially smaller
and colour-differentiated by role. Note 44px is the documented mobile touch-target floor in
`~/.claude/rules/frontend.md`, so compact desktop sizing needs a deliberate touch-target answer
rather than shrinking everything globally.

## Maps and Yelp on the competitive screen
Both already produce real data and are only weakly presented.
- Yelp card: `emitYelpCard` at `src/lib/pipeline.ts:169`, called at `:1150`. Renders a market
  bar (`4.85★ median across 10 operators, median 222 reviews`) plus a ranked roster of 10.
- Maps: competitor card at `src/lib/pipeline.ts:1171-1191` ("N competitor located · open in
  Google Maps"); the embed URL and `mapsNote` come from `src/lib/tools/maps.ts`.
- Both currently render as generic stage cards. This is the "clean little boxes" work.
- Live example to look at: run `mPHVbkER-Qu8`.

## Known UX dead ends already found (some fixed, listed so they are not rediscovered)
- FIXED `d671e43`: reference pick resumed the pipeline but never refreshed, so the next stage's
  draft stayed invisible behind "Draft not generated"; review-note box rendered with no action
  that could submit it; current step chip was near-black on black.
- OPEN: the evidence flow is six sequential gates each needing submit → approve → advance →
  resume. Driving one run to a build took ~15 API calls. This is the flow Devin calls whack.
- OPEN: `/preview/<id>` renders the site in an iframe with a workbench rail; the relationship
  between the two is not obvious.

## Two generated-site bugs, out of scope for UI work but do not "fix" them by restyling
- The design-contract model authors `componentStates` as raw CSS strings inventing their own
  variable namespace (`var(--colors-primary)`, `--radii-sm`, `--fonts-display-family`). The
  emitter produces `--color-primary`, singular, so every reference is undefined and dropped.
  This is why two blocking gates (`color-role-compliance`, `contrast`) fail on every run.
- Each `built` retry re-runs `buildSite` and discards the previous gate repair, so repairs
  never accumulate.

## Environment
- `./scripts/dev.sh` for a credentialed dev server on :3400 (ZS Vault-backed).
- Phone/tailnet access is wired: `python3 scripts/tailnet-proxy.py`, then
  `https://devins-macbook-pro.tail908c18.ts.net:3443`. Tailnet-only, never Funnel. The shim is
  opt-in and **wants a security-review pass** — it trades one-box's Origin/Sec-Fetch-Site
  checks for Tailscale device auth. Teardown: `tailscale serve --https=3443 off`.
- Screenshot gotcha: the in-app browser pane's tab is `visibilityState: hidden`, which freezes
  CSS transitions mid-flight and throttles rAF. Scroll reveals read `opacity: 0.003` and
  count-up numbers read `0`. Neither is a real bug — force with a transitions-off style.

## Gate before shipping
`npx vitest run` (445 passing), `npm run typecheck`, `npm run lint` (0 errors, 5 pre-existing
warnings in files this work did not touch).
