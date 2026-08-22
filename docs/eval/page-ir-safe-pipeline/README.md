# Page IR and safe candidate pipeline evaluations

This directory is the Phase 1 evaluation contract for the PRD at
`docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md`.

## Status

- Contract version: `1.0.0`
- Product target: Website only
- Source checkpoint: `6561b19b0d613e8fe891fe700760e414153cb1b4`
- Current contents define the tests; they do not claim the implementation passes.
- `manifest.json` is owner-approved and hash-locked. Any contract change requires a new
  version and lock.

## Evidence classes

| Class | What it proves | Examples |
|---|---|---|
| Contract | Inputs fail closed and persisted data stays versioned | Zod unit tests, hostile payload tables |
| Mechanical | Deterministic behavior and safety invariants | candidate failure injection, byte hashes, gate selection |
| Rendered | Browser-visible behavior | Playwright at 1440, 768, and 390 widths |
| Human | Product quality and approval | named rubric, screenshots, findings, attestation |
| Advisory | An independent model found or did not find a concern | Opus 5/Grok 4.6 document review |

Advisory evidence never substitutes for a contract, mechanical, rendered, or human
pass. A model cannot write `humanVisualReview`, waive a failure, or promote a run.

## Test tiers

1. **Merge blockers:** credential-free schema, compiler, candidate, security,
   replay, and regression checks. These run on every implementation PR.
2. **Page IR promotion:** the complete six-purpose corpus, deterministic rebuilds,
   browser gates, failure injection, and human visual review.
3. **Future experiments:** agent or alternative-renderer comparisons. These cannot
   affect Phase 1 until separately approved and are not listed as blockers here.

## Corpus

The frozen corpus must contain one versioned brief and expected structural intent for
each supported purpose:

- `brochure-local-service`
- `portfolio-showcase`
- `saas-marketing`
- `editorial-index`
- `campaign-landing`
- `institutional-presence`

Each fixture includes approved evidence references or an explicit no-reference state,
approved facts, content, asset metadata, expected landmarks and conversion behavior,
viewport assertions, and forbidden outcomes. Fixtures contain no live credentials and
do not require provider calls.

Commerce checkout, Web application/portal behavior, and native iOS are excluded from
the positive corpus. Their unsupported product claims and request shapes are negative
cases in the scope contract tests.

## Execution rules

- Inputs, seeds, expected output inventory, compiler version, gate version, and
  viewport dimensions are frozen before a qualification run.
- Every file read by a candidate or compiler is a regular, non-symlink file beneath an
  allow-listed root.
- Failure-injection tests capture the served-site hash before and after each fault.
- Determinism is measured over ten clean compiles with normalized environment and no
  timestamps inside compiler output.
- Browser checks run at 1440x900, 768x1024, and 390x844; reduced-motion and disabled
  JavaScript paths are included where relevant.
- Gate-routing tests seed a defect for every capability mapping. A route is not trusted
  because a positive fixture passed.
- A first build failure must produce no served `site/`. A rebuild failure must retain
  the prior site hash.
- Reconnect/replay tests record model-call counts and require zero new calls when all
  necessary checkpoints already exist.
- Every merge-blocking rendered evaluation uses recorded or stubbed provider responses
  and runs with live provider credentials absent. A UI consent or retry test does not
  make a metered generation call.
- Qualification screenshots are reviewed by a named person using `rubric.md`.

## Frozen thresholds

- Composer height: 120px minimum and `min(360px, 50dvh)` maximum.
- Failed candidate diagnostics: at most one per run, at most 100 MiB, retained for at
  most 24 hours.
- Accessibility: the repository-pinned axe-core ruleset; zero serious or critical
  violations. Rendered contrast remains a separate blocking WCAG AA gate.
- Performance promotion budget: the registered values in `src/lib/gates.ts` — less
  than 900 KiB total transfer, less than 500 KiB image transfer, and DOMContentLoaded
  below 2000ms at 4x CPU throttle. The runtime gate may remain advisory, but exceeding
  these values blocks Page IR production qualification.

## Required artifacts per qualification run

```text
run-manifest.json
inputs/
page-ir.json
candidate-manifest.json
gate-reports.json
provenance.json
site/
screenshots/desktop.png
screenshots/tablet.png
screenshots/mobile.png
human-visual-review.json
```

Failed candidates retain at most one 100 MiB diagnostic packet per run for at most 24
hours without a promoted `site/` claim. Promotion evidence includes pre-promotion and
post-promotion hashes.

## Result vocabulary

- `PASS`: criterion satisfied by the required evidence class.
- `FAIL`: criterion contradicted or required evidence missing.
- `BLOCKED`: the evaluator could not execute because an explicit prerequisite was
  unavailable; blocked is not pass.
- `NOT_RUN`: evaluation has not been attempted.

## Change control

After approval, any change to a fixture, threshold, required artifact, viewport,
blocking status, or automatic-rejection rule creates a new manifest version. Historical
manifests and results remain immutable.

The GitHub ticket source is `docs/tickets/page-ir-safe-pipeline/manifest.json`. Every
blocking eval names at least one ticket, and every Phase 1 requirement is reachable
through an eval/ticket row in `traceability.md`.
