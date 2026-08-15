# Handoff: ONE BOX — Refero-only baseline & engine sameness fix
status: in-progress
date: 2026-08-15
branch: spike/refero-baseline   last-commit: 314da19 feat: add the six missing sections, real photography, and the engine ledger

## Active Task
Fix the ONE BOX engine defects that make every generated site identical, then run
the same frozen brief through several different Refero style directions to test
whether the approach produces genuine variation or converges on the same tics.

## Goal
1. Close the `OPEN` engine defects in `docs/ENGINE-LEDGER.md` (ENG-001..009).
2. Then run a multi-style trial against the frozen brief and falsify (or confirm)
   the convergence prediction in the ledger's REF section.
3. Longer arc: the engine must eventually produce **multiple styles AND layouts**
   across the website-category taxonomy the user supplied (see Decisions).

Acceptance for the trial: several sites from one brief that differ in **rendered
layout topology**, not only in tokens.

## Decisions

- **Refero is a design-reference retrieval and constraint source, nothing more.**
  Agreed jointly by Claude (Opus 5) and GPT-5.6 after independent audit. It
  supplies a visual vocabulary; it cannot supply information architecture, truth
  of claims, conversion strategy, or accessible token usage. Full agreed position
  in `docs/ENGINE-LEDGER.md` § "What Refero is genuinely for".
- **Correct pipeline position for Refero:** intake/evidence → business strategy &
  IA → Refero style retrieval → curated human direction lock → design synthesis →
  composition/build → gates. **Refero must not own stages 1, 2, 6 or 7.**
- **`refero_search_screens` is not worth calling for trades/local services.**
  Corpus gap confirmed by two independent directly-worded queries (REF-001).
  Use `refero_search_styles` for this category.
- **User-facing reference picking: yes, but curated** — three pre-vetted
  directions with a sample on the client's real content. Never a raw gallery.
- **A gate is not trusted until negative-tested** — reintroduce each known defect
  and confirm it fails. (`contrast-audit.mjs` is tested against 3.)
- **Never report a verification result from a hand-assembled artifact.** Three
  hand-audits of one page produced three wrong answers (PROC-001).
- **Every generated claim not traceable to intake goes in a claims register**
  with a confirm/remove decision (`spikes/refero-baseline/CLAIMS.md`).
- **Stock images are authorised for prototype layout evaluation only.** User will
  add a deployment guard blocking shipment of third-party stock later — explicitly
  out of scope for this work.
- **OpenRouter is permanently allowed** for this project and will be the default
  if the project is sold on. The earlier "no OpenRouter" note is revoked.
- **The paid Firecrawl discovery checkbox must always be enabled when testing.**
- ASSUMED: the multi-style trial should span the user's **website-category
  taxonomy**, not just visual styles — supplied 2026-08-15 and not yet written to
  a file. Three axes: (a) purpose-based — brochure/presence, portfolio/showcase,
  commerce, product-SaaS marketing, web app/portal, editorial/media,
  campaign/landing, institutional/public-sector; (b) greenfield archetypes — fast
  marketing (Astro/static Next), editorial (Next + headless CMS), 3D/interactive
  (Vite/R3F), ecommerce (Shopify-first), full web app (Next + Postgres/Stripe);
  (c) model-routing categories — simple landing, premium brand/agency, SaaS
  dashboard, e-commerce, editorial, animation-rich/scroll-driven, WebGL/3D,
  large legacy/redesign. **Capture this into a file before it is lost.**

## Files

Spike (all committed, branch `spike/refero-baseline`):
- `/Users/zero-suminc./projects/one-box/docs/ENGINE-LEDGER.md` — the tracing doc; 9 ENG, 7 REF, 5 A11Y, 5 HARNESS, 6 CONTENT, 8 DESIGN, 4 PROC entries. **Start here.**
- `/Users/zero-suminc./projects/one-box/spikes/refero-baseline/BRIEF.md` — frozen WITS intake, v1. Every avenue must use this verbatim.
- `/Users/zero-suminc./projects/one-box/spikes/refero-baseline/RESEARCH-LOG.md` — every Refero query, candidates, picks/rejections, limitations.
- `/Users/zero-suminc./projects/one-box/spikes/refero-baseline/DESIGN.md` — design contract with per-rule Refero provenance; §13 records where the contract itself was wrong.
- `/Users/zero-suminc./projects/one-box/spikes/refero-baseline/CLAIMS.md` — 28 claims needing WITS sign-off, 5 blocking.
- `/Users/zero-suminc./projects/one-box/spikes/refero-baseline/SITE-STRUCTURE.md` — page map + domain recommendation.
- `/Users/zero-suminc./projects/one-box/spikes/refero-baseline/contrast-audit.mjs` — WCAG gate, negative-tested. `node spikes/refero-baseline/contrast-audit.mjs`
- `/Users/zero-suminc./projects/one-box/spikes/refero-baseline/shot.mjs` — screenshot harness; forces lazy images to decode.
- `/Users/zero-suminc./projects/one-box/spikes/refero-baseline/site/` — the build (index.html, tokens.css, theme.css, site.css, img/).

Engine files with OPEN defects (not yet touched):
- `/Users/zero-suminc./projects/one-box/src/lib/pipeline.ts` — `:1842` hardcoded section registry (ENG-001); `:883` inert css-architecture gate (ENG-003).
- `/Users/zero-suminc./projects/one-box/src/lib/builder.ts` — `:35`,`:106` frozen template copy (ENG-002); `:69` non-atomic publish (ENG-005).
- `/Users/zero-suminc./projects/one-box/src/lib/gates.ts` — `:137` token-drift checks only 3 properties (ENG-006).
- `/Users/zero-suminc./projects/one-box/scripts/dev.sh` — ignores port arg (ENG-007).

Earlier spike, separate branch `spike/layout-ir` (commit `8218685`), verdict REVISE:
- `/Users/zero-suminc./projects/one-box/spikes/layout-ir/FINDINGS.md` — key discovery: **column spans alone cannot determine row structure; rows must be declared, not inferred.** One of four outputs (`gutter-editorial`) still has an invisible hero media.

## Evidence

Verbatim, expensive to regenerate:

- Refero screen-corpus gap, query `electrician contractor construction company website` (web) returned: LEGO contact page, Chargetrip EV software ×3, Programa interior-design SaaS, Visual Electric ToS, Netflix careers, Webflow ToS, Twitch Safety Center, Tesla support. **Zero contractors.**
- Corrupted Refero style record: `14edc470-fa1c-47f9-9efa-d44194be4aec` (Empower) — description breaks into a leaked JSON fragment then repeating bracket glyphs plus stray Cyrillic ("строг").
- Refero style IDs used in the baseline: Fingerprint `74adbdf2-822b-4df3-80d1-3c5a1b263a90` (foundation), Outsource Consultants `63db7f14-d256-47a7-aa0c-337555022b6b`, Tailscale `5d884659-1d6b-4b82-8ccd-dbb0434667a8`, Ambrook `b11e1e78-3c62-45df-bf28-17c97718ed7d`, Andercore `15fd028d-c493-47a9-8e69-0a59c6fdb14b` (rejected).
- Contrast measurements: white on `#f35b22` = **3.32:1** (Refero's own button spec, fails AA); ink `#141415` on `#f35b22` = **5.55:1**; Faded Stone `#8c8c89` on `#fafaf8` = **3.23:1**; accent on canvas = **3.17:1**; coverage meta = **3.37:1**; contact hover on console = **4.10:1**.
- GPT-5.6 audit grade: **C+**, "strong visual prototype and a weak commercial deliverable", VERDICT FAIL as client-ready. Full transcript: `/private/tmp/claude-501/-Users-zero-suminc-/dcafb21c-32af-47e0-b93b-09c838a3b9f5/scratchpad/sol-audit-result.md` (ephemeral — copy it if still needed).
- Current gate state: `87 checks, 0 failures` across 1440 and 390.
- Google Maps blocked: vault `google_api_key` is AI-Studio-only; Places returns `401 UNAUTHENTICATED — "API keys are not supported by this API"`. Needs a real Maps Platform key via `zsvault add google_maps_api_key`.
- Deleted client project `~/projects/clients/WITS` (was not a git repo). Verified backup: `~/Backups/wits-site/wits-site-source-2026-08-15.tar.gz` (43.7K, 25 entries).

## Open Questions

- QUESTION: Which engine defects to fix first — ENG-001/002/003 are the sameness root cause and are mutually entangled (registry, frozen template, inert gate). Fixing tokens alone cannot fix sameness.
- QUESTION: Does the multi-style trial run inside the engine or as further standalone spikes? The engine currently cannot express layout variation (ENG-001/002), so a trial run through it would be uninformative until those are fixed.
- QUESTION: Should the layout-IR spike (`spike/layout-ir`, verdict REVISE) be revived as the composition layer? Its unresolved defect is one invisible hero media out of four outputs.
- BLOCKER: (scoped to WITS client delivery only — does **not** gate engine work or
  the Next Action) 5 blocking claims in `CLAIMS.md` — insurance, FL low-voltage
  licensing, staffing structure — plus real phone, email, domain, logo and brand
  colours. The WITS site cannot ship without these.
- QUESTION: Google Maps still degraded — needs a user-created Maps Platform key
  (`zsvault add google_maps_api_key`), then wiring into `scripts/dev.sh`.
- QUESTION: mem0 record `2a9268a5` (the revoked OpenRouter note) could not be
  deleted — token lacks delete scope. Superseded by record `0238cec2` instead.
  Needs a delete-scoped token if actual removal matters.

## Next Action
Write the user's website-category taxonomy (all three axes, listed under Decisions) into `docs/WEBSITE-CATEGORIES.md`, then work through the `OPEN` ENG-001..009 entries in `docs/ENGINE-LEDGER.md` starting with ENG-001/002/003 as one entangled fix.

## Suggested Skills
superpowers:systematic-debugging (for the ENG defects — root cause before fixes), superpowers:brainstorming (before restructuring the pipeline architecture), superpowers:test-driven-development (one-box is test-backed)
