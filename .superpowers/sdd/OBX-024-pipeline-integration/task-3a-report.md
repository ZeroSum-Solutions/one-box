# OBX-024 Task 3a report — resumable PageIR controller core

Date: 2026-08-23

Base: `a8d4586`

Implementation commit:

- `3511877` — `feat: integrate resumable PageIR pipeline`

## Outcome

The evidence-gated build boundary now dispatches immutable `page-ir-v1` runs to
one resumable PageIR controller while preserving the established `template-v1`
path. The controller uses durable Source Bundle, persisted PageIR, candidate,
promotion, live-bundle, and visual-QA state as authority; the event log remains
descriptive and reconnect-safe.

The production source producer uses the normal cost-tracked orchestrator
`generateJson` call under a dedicated cross-process generation lock. It consumes
the exact five approved upstream versions plus bounded current intake/reference
facts, validates a strict combined assetless source object, and commits a
hash-bound `page-ir-source-generation.json` checkpoint before proposing the
immutable Source Bundle. Reconnect reuses the checkpoint/proposal without a
second model purchase. The producer never appends human review state.

Every Source Bundle human action now carries the displayed payload SHA-256. The
core compares it inside the same run transaction before appending the transition,
closing the route-level TOCTOU window. A narrow validated read-only loader
exposes draft/in-review source bytes and immutable bindings for Task 3b.

Draft and in-review bundles emit the distinct frozen
`page-ir-source-paused` event. Currentness is bound to run, payload hash, and
review state. Human approval makes that terminal stale; rejected and superseded
bundles become durable terminal failures. If a terminal event was lost, replay
reconstructs the error from durable state without re-entering generation or
build execution.

Approved runs load or derive the authoritative revision-1 PageIR, materialize or
reuse the candidate, run the full candidate gates only from `ready-for-gates`,
promote only from `promotable`, and validate an already-`promoted` exact live
bundle without promoting again. A failed PageIR candidate parks even with zero
repair attempts; no repair provider or allowance is invoked.

Promotion-created pending visual QA is captured against the exact promoted live
build under site authority. In one run transaction the pending version moves to
`revision-requested`, becomes `superseded`, and a real screenshot-backed version
is created. Reconnect reuses the real version without another browser capture.
The QA selector adds only `main a[data-edit-id]` for compiled PageIR actions, so
template target priority remains unchanged. Completion requires exact candidate,
live provenance, manifest, receipt, PageIR, gate, build, real-QA, and existing
named-human all-pass review bindings.

## TDD evidence

Focused REDs were recorded before each missing seam:

- PageIR authority routing: 1 failed, 22 skipped; the old controller threw
  `current pipeline controller requires template-v1`.
- payload-bound human transition: 1 failed, 20 skipped; stale payload reached
  review validation instead of failing on payload.
- read-only Source Bundle projection: 1 failed, 21 skipped; loader was absent.
- source terminal replay: 1 failed, 23 skipped; duplicate terminals survived.
- single source generation/checkpoint: 1 failed, 22 skipped; producer was absent.
- durable candidate resume matrix: 4 failed; controller entry point was absent.
- promoted QA materialization: 1 failed, 67 skipped; helper reported not
  implemented.
- compiled action QA target: 1 failed, 17 skipped; hover was `fail`.
- draft source pause, zero-repair failed parking, and promoted completion replay:
  3 failed, 24 skipped.
- lost failed-candidate event recovery: 1 failed, 27 skipped.
- exact promoted-live mismatch: 1 failed, 27 skipped; mismatched gate provenance
  still replayed completion.
- authority dispatch: 1 failed, 28 skipped; dispatch helper was absent.
- durable rejected/superseded terminals: 2 failed, 29 skipped.

Focused GREEN evidence after the minimum changes:

```text
npm test -- src/lib/pageIrPipeline.test.ts src/lib/pageIrController.test.ts \
  src/lib/pipelineReplay.test.ts src/lib/candidatePromotion.test.ts \
  src/lib/evidence.test.ts
Test Files  5 passed (5)
Tests       149 passed (149)
```

Two later rejected/superseded replay cases were added after that combined run;
the final `pipelineReplay.test.ts` run was 31 passed, and the final full suite
below includes all 151 current focused tests.

## Verification

- Final full suite: `npm test` — PASS, 83 files passed and 4 skipped; 1015 tests
  passed and 4 skipped; exit 0; duration 57.83s.
- Typecheck: `npm run typecheck` — PASS, exit 0.
- Lint: `npm run lint` — PASS, exit 0 with 0 errors and 6 unrelated or
  concurrently introduced warnings.
- Whitespace: `git diff --check` and staged `git diff --cached --check` — PASS.
- Architecture documentation verifier: PASS with `status: ok`, no ledger,
  document, path, Markdown, shell, or secret errors.
- Conventional subject verifier: PASS for `3511877`.

## Scope confirmation

- Core/test commit paths were exactly:
  `src/lib/candidatePromotion.test.ts`, `src/lib/contracts.ts`,
  `src/lib/evidence.test.ts`, `src/lib/evidence.ts`,
  `src/lib/pageIrController.test.ts`, `src/lib/pageIrController.ts`,
  `src/lib/pageIrPipeline.test.ts`, `src/lib/pageIrPipeline.ts`,
  `src/lib/pipeline.ts`, and `src/lib/pipelineReplay.test.ts`.
- No evidence API, React component, CSS, client stream consumer, gate
  implementation, template, repair behavior, rollout default, or deployment
  path was changed.
- No model reviewer was invoked. No push, PR, merge, history amendment, or
  rollout change was performed.

## Residual risk and blockers

The real browser QA engine and the immutable replacement transaction are each
covered, while the transaction test injects deterministic screenshot capture to
avoid duplicating the browser engine's own integration suite. The full suite
passes. No blocker remains.
