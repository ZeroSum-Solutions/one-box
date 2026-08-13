# Phase 4 evaluation — pre-registered rubric (frozen 2026-08-12, BEFORE any run)

Three arms per prompt, identical frozen fixtures (same Maps results, same crawls,
same copy facts, same hero-image seed policy):

- **Arm R** — Refero reference lock (full pipeline as shipped)
- **Arm L** — reference lock built only from the local design-asset-library index
  (no Refero calls)
- **Arm N** — no references at all (tokens invented directly from intake + vibe)

Prompts (≥3, across 2 categories): fiber-optic installer (Chattanooga TN),
med-spa (Franklin TN), roofing contractor (Chattanooga TN).

## Scoring — 5 dimensions, 0–10 each, per site

1. **Visual hierarchy** — is there one obvious path through the page?
2. **Distinctiveness** — would you recognize this site among ten in the niche?
3. **Cohesion / token fidelity** — does everything look like one decision system?
4. **Conversion clarity** — is the primary action unmistakable and easy?
5. **Craft** — spacing rhythm, type quality, detail finish.

**Disqualifiers** (auto −10 total each): invented business claims; AI-slop tells
(generic gradient-blob hero with stock-corporate copy); broken layout at 390px.

## Protocol

- Judge of record: **Devin** (vision-model critiques are advisory — the
  craft-falsification experiment showed graders disagree at high confidence).
- Advisory model critique: `agy` Gemini, shown the three sites per prompt in
  randomized order labeled A/B/C, never told which arm is which.
- Score sheet per prompt per judge; totals averaged across prompts.

## Pre-registered decision rule

- Refero (R) **wins** if: avg total ≥ both other arms +6 points AND R does not
  lose the Distinctiveness dimension to either arm.
- R ties/loses → the Refero bet is re-examined honestly (subscription still
  useful for taste-heavy categories per its docs, but the pipeline claim fails).
- L beats N by ≥6 → reference-locking methodology itself is proven valuable even
  without Refero (build the local-library lane harder).

No post-hoc rubric edits. If the rubric proves unmeasurable in practice, that is
itself a reported result, not a license to move goalposts.
