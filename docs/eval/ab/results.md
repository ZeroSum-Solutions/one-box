# Phase 4 three-arm A/B — results package (2026-08-13)

**Devin is the judge of record** (rubric frozen 2026-08-12 at `docs/eval/rubric.md`).
Everything below is advisory input, prepared blind, unblinded only for this
summary. Score your own sheet (`scoresheet.md`) from the shots or live
previews BEFORE reading further if you want to stay blind.

## What was run

9 sites: 3 prompts (fiber installer / med spa / roofing contractor) × 3 arms —
R (Refero reference lock), L (local catalog-index lock, text-only per
RIGHTS.md), N (no-reference control). Per prompt, arm R ran the competitive
scan once and L/N inherited its artifacts verbatim — identical frozen
fixtures. All 9 sites pass ALL quality gates (token-drift, axe, console,
assets, no-JS, mobile-layout, perf budget). Total spend $5.18.

Unblinding key (also in `manifest.json`):
fiber A=R B=L C=N · medspa B=R C=L A=N · roofing A=R C=L B=N

## Advisory scores

**agy Gemini, blind, on the final builds** (totals /50):

| Prompt | R | L | N |
|---|---|---|---|
| fiber | **42** | 30 | 26 |
| medspa | 25 | **39** | 36 |
| roofing | 33 | **38** | 34 |
| **avg** | **33.3** | **35.7** | **32.0** |

**Claude (build agent), blind, on the prior build round** (before the final
hero-compression rebuild — heroes differ slightly, so cross-judge totals are
indicative, not exact):

| Prompt | R | L | N |
|---|---|---|---|
| fiber | 39 | **39** | 33 |
| medspa | 34 | 36 | **38** |
| roofing | **39** | 29¹ | 35 |
| **avg** | **37.3** | 34.7 | 35.3 |

¹ scored against a build with a duplicated-hero artifact that the final
rebuild replaced.

## Against the pre-registered decision rule

- **R wins iff avg ≥ both other arms +6 AND doesn't lose Distinctiveness.**
  Advisory result: **not met by either judge.** agy has R *behind* L
  (−2.4); Claude has R ahead by only +2.7/+2.0. Distinctiveness: R leads
  narrowly on Claude's sheet, ties L on agy's.
- **L beats N by ≥6 → reference-locking itself proven.** Not met either:
  agy +3.7, Claude −0.7.
- Judge-of-record scores pending (Devin).

## Honest observations (either judge, both rounds)

- Refero's clearest win is the **fiber R** site (orange-on-black trade
  identity — top score in 3 of 4 judge-rounds). Where the market is visually
  undifferentiated (med spa pastels), the Refero lock added little over the
  local index or the control.
- The graders **disagree with each other substantially** (medspa R: 25 vs 34)
  — consistent with the craft-falsification finding that motivated making
  Devin judge of record.
- The N control is NOT a strawman: with the same template, gates, and copy
  discipline, no-reference sites score within a few points. The frozen
  template + gates carry a large share of the quality floor.
- Recurring tell across ALL arms: multi-tile collage heroes from the image
  generator. A "single photograph only" constraint in the imagery brief is
  the highest-leverage next fix.
- The advisory rounds also surfaced two REAL defects that are now fixed and
  gated: the 390px nav squeeze (word-stacked logo/phone pill → new blocking
  `mobile-layout` gate) and primary-as-text contrast failures (new derived
  `--color-primary-text` / on-surface-alt vars with WCAG checks in the
  builder).

## Standing consequence (per the frozen rule, pending Devin)

If Devin's scores land like the advisory ones, the Refero pipeline claim
fails its gate: the style-corpus side quest
(`~/Inbox/plans/2026-08-12-zs-style-corpus.md`) **stays parked**, and the
Refero Pro subscription is re-examined (still plausibly useful as a manual
taste tool for taste-heavy categories; not proven as a pipeline multiplier).
