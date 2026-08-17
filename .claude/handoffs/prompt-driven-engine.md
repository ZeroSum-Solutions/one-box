# Handoff: prompt-driven engine (MotionSites-level generation)

status: in-progress
date: 2026-08-16
branch: one-box `feat/ui-overhaul-linear` (last-commit 3798081, docs: brief the UI/UX overhaul session — UI-overhaul work is a SEPARATE task, do not touch) · prompt-catalog `main` (last-commit 17230fe; new files uncommitted)

## Active Task
Make the prompt-catalog corpus the main driver of ONE BOX website generation at
MotionSites quality for any vertical. The decision + instrument package is
COMPLETE and council-ratified; the next phase is implementation.

## Goal
ONE BOX produces sites that pass QUALITY-RUBRIC's ship bar (≥30/40, D1/D2/D3/
D6/D7 each ≥3, others ≥2, all hard gates) for any client vertical, driven by
catalog prompts through a typed Page IR. Acceptance for the architecture: four
anchor builds (static / stateful / video / motion-led) through the full path
with owner verdicts appended to CALIBRATION-V3.

## Decisions
All final, council-ratified 2026-08-16 — do NOT re-litigate:
- D1: build target = prompt → typed Page IR → deterministic static compile
  ("option D"); current engine (C) stays production fallback. First council
  vote was unanimous B; Sol's file-grounded verification killed B-as-stated
  (Tailwind filter `src/lib/builder.ts:63` rejects variant/arbitrary syntax;
  utilities attach only to hero CTA); D = B with the compiler made explicit.
- D2: motion is the DEFAULT for every vertical (owner directive) — one named
  signature mechanic per page + ambient layer; reduced-motion lands in a
  complete composed static state.
- D3: quality instruments = PROMPT-ANATOMY / HARD-RULES (R1–R16) /
  QUALITY-RUBRIC in prompt-catalog/pipeline/ (all ratified, amendments in).
- D7: the nine composition discriminators are enforced ENGINE-SIDE as IR
  compile constraints (unanimous council); asset↔business coherence is a
  declared IR mapping field the critic verifies.
- Full record incl. D4–D6 + ratification details:
  one-box/docs/plans/2026-08-16-prompt-driven-engine-decisions.md
- Licence: owner confirmed the MotionSites plan covers commercial client
  work. Closed — do not re-raise.
- mem0 records written: 10157528-c51b-4f09-8711-86a85685b9a8 (decision
  package), 12383f7c-5981-4448-98a7-53a07c87c9cb (owner directives, council
  roster, supersession note on ba8299c2).
- ASSUMED: prompt-catalog new files will be committed to its main (direct
  commits are that repo's norm) once Devin says go; nothing committed yet.

## Files
- ~/projects/prompt-catalog/pipeline/PROMPT-ANATOMY.md — NEW, measured format
- ~/projects/prompt-catalog/pipeline/HARD-RULES.md — NEW, ratified R1–R16
- ~/projects/prompt-catalog/pipeline/QUALITY-RUBRIC.md — NEW, ratified rubric
- ~/projects/prompt-catalog/.claude/skills/site-to-prompt/SKILL.md — NEW skill
- ~/projects/one-box/docs/plans/2026-08-16-prompt-driven-engine-decisions.md — NEW
- ~/projects/prompt-catalog/pipeline/PROMPT-STANDARD.md — pre-existing,
  MODIFIED before this session (uncommitted)
- ~/projects/tools/llm-council/backend/config.py — MODIFIED (premium roster:
  Gemini 3.1 Pro, Grok 4.6, Kimi K3, DeepSeek V4 Pro; chairman
  gpt-5.6-sol-pro; old :free slugs were all 404-dead), uncommitted; backend
  left running on localhost:8001

## Evidence
- Council ratification (verbatim conditions now incorporated in the files):
  ship bar "total ≥30/40 AND D1,D2,D3,D6,D7 each ≥3"; "commitment is the
  rule; darkness is not"; reduced-motion "lands directly in a complete,
  composed static state"; thin intake → "delete the claim and recompose to a
  truthful empty-state variant".
- Sol adversarial verdict on my original claims: FAIL overall (C2/C5/C6
  confirmed; C1/C3/C4 partly; C7/C8 refuted) — the reason option B became D.
- Corpus measurements: median 7,871 chars; top-liked quartile TIGHTER (7.1k
  vs 9.6k); atmosphere-kit ≥6/7 in 192/430 ≈ 1.7× median likes; a11y in only
  27% of bodies; slot gaps: 0 process, 0 contact, 5 local-presence, 13
  trust-booking.
- MotionSites MCP: authorized via browser OAuth, 4 tools
  (search/list/get/get_related_prompts), unlimited plan verified
  (premium `oyla` returned locked:false, free_prompts_remaining:null).
  Re-auth if a fresh session lacks the tools: call authenticate, open URL in
  real Chrome via chrome-control.
- Council/Sol raw transcripts lived in the session scratchpad (ephemeral,
  gone after reset) — all load-bearing content was incorporated into the
  repo files above; nothing to recover.

## Open Questions
- QUESTION (non-gating): Devin pasted "[Pasted text #1 +6 lines]" in his very
  first message; it never transmitted and was never recovered. If something
  still feels unaddressed, ask him for it.
- QUESTION: commit authorization for prompt-catalog files + llm-council
  config (see Next Action).

## Next Action
Ask Devin to authorize the baseline pin, then execute: commit the four new
prompt-catalog files + modified PROMPT-STANDARD.md to its main (conventional
commits), snapshot catalog.db to ~/Backups/prompt-catalog/, commit the
llm-council roster change — then start the Page IR spec (types, capability
allowlist v1, composition compile constraints per D7) as
one-box/docs/specs/, per the decision record's "Next implementation steps".

## Suggested Skills
conventional-commits (baseline commits), superpowers:writing-plans (Page IR
spec), site-to-prompt (when authoring new trade prompts)
