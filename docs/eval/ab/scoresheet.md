# Phase 4 A/B score sheet — Devin (judge of record)

Rubric: `docs/eval/rubric.md` (frozen 2026-08-12, before any run). Score each
site 0–10 per dimension. **Judge blind**: open the three sites per prompt by
their A/B/C labels below and score BEFORE looking at `manifest.json` (the
unblinding key mapping labels → arms).

Sites are served at `/preview/<runId>` (run `./scripts/dev.sh`), or open
`sites/<runId>/site/index.html` directly. Screenshots: `docs/eval/ab/shots/`.

Dimensions: hierarchy / distinctiveness / cohesion / conversion / craft.
Disqualifiers (−10 each): invented claims, AI-slop hero, broken 390px layout.

## fiber (fiber-optic installer, Chattanooga TN)

| Site | Hierarchy | Distinct | Cohesion | Conversion | Craft | DQ | Total |
|------|-----------|----------|----------|------------|-------|----|-------|
| A    |           |          |          |            |       |    |       |
| B    |           |          |          |            |       |    |       |
| C    |           |          |          |            |       |    |       |

## medspa (med spa, Franklin TN)

| Site | Hierarchy | Distinct | Cohesion | Conversion | Craft | DQ | Total |
|------|-----------|----------|----------|------------|-------|----|-------|
| A    |           |          |          |            |       |    |       |
| B    |           |          |          |            |       |    |       |
| C    |           |          |          |            |       |    |       |

## roofing (roofing contractor, Chattanooga TN)

| Site | Hierarchy | Distinct | Cohesion | Conversion | Craft | DQ | Total |
|------|-----------|----------|----------|------------|-------|----|-------|
| A    |           |          |          |            |       |    |       |
| B    |           |          |          |            |       |    |       |
| C    |           |          |          |            |       |    |       |

## Decision (pre-registered — no post-hoc edits)

- R wins iff: avg total ≥ both other arms **+6** AND R does not lose
  Distinctiveness to either arm.
- L beats N by ≥6 → reference-locking itself is proven valuable even
  without Refero.
- R ties/loses → the Refero bet is re-examined honestly.
- Style-corpus side quest (`~/Inbox/plans/2026-08-12-zs-style-corpus.md`)
  stays PARKED unless this gate passes.

Advisory (non-binding) model critique: `docs/eval/ab/advisory-*.md` — agy
Gemini, blind labels, shown after your own scores are down.
