# OBX-024 Task 3b report — Source Bundle review API and UI

Date: 2026-08-23

Base: `8f867f9adba7c25d99e0d1cffd2118a8e800adc6`

Implementation commit:

- `a8d4586` — `feat: add PageIR source review workspace`

## Outcome

The existing evidence endpoint now exposes an additive, validated PageIR Source
Bundle review projection and three closed named-human actions. Every action is
bound to the displayed payload SHA-256 through Task 3a's transactional core
transition. The route fixes `actorKind` to `human`; it does not accept a client
actor kind or synthesize attestation. Generic evidence approval remains separate
from Source Bundle history.

The evidence workspace retains the six evidence workflow stages and renders the
Source Bundle as a build-stage subgate. It shows the three parsed sources and all
immutable hashes read-only. Draft, in-review, approved, rejected, and superseded
states expose only their permitted actions. Approval requires all five local
confirmations plus the explicit human-attestation checkbox, while the server
remains the approval authority. The client draft is keyed by payload hash and
resets in full when the hash changes. Direct workspace reloads receive the same
validated projection through a shared server-safe adapter, without a client
fetch or filesystem read.

The run stream and timeline now treat `page-ir-source-paused` as a terminal
review pause, group it under Build, retain its state/hash/timestamp, and link to
the evidence workspace. Structured candidate cards pass all reports into
`StageCard`, which renders pass/fail/advisory status plus every failure detail.
Candidate, promotion, and QA cards still cannot imply completion.

Preview truth is authority-aware: `template-v1` keeps its prior built-stage
behavior, while `page-ir-v1` advertises a preview only when
`inspectPromotedLiveBundle` validates canonical promoted live metadata. Candidate
ready, promotable, and failed states return no preview. Invalid promoted metadata
fails closed. A canonical promoted build is previewable while human visual QA is
still draft; release/export/handoff rules remain unchanged.

## TDD evidence

### Stream and timeline

Initial RED:

```text
npx vitest run src/components/resumeRun.test.ts src/components/RunTimeline.test.tsx
Test Files  2 failed (2)
Tests       1 failed | 6 passed (7)
```

The Source Bundle event returned `{ building }` instead of
`{ review required }`. The first direct timeline suite also exposed that the
previously untested component's `@/...` imports were not resolvable by this
repository's Vitest configuration. The two owned components now use semantically
equivalent relative imports; no global resolver/configuration was changed.

GREEN after the minimum event/card/detail implementation:

```text
Test Files  2 passed (2)
Tests       11 passed (11)
```

### Evidence API

Initial RED:

```text
npx vitest run src/app/api/evidence/'[id]'/route.test.ts
Test Files  1 failed (1)
Tests       8 failed | 18 passed (26)
```

The failures proved the missing additive projection and strict actions, the
template-only preview heuristic, and the lack of fail-closed PageIR preview
inspection. GREEN after the minimum route implementation:

```text
Test Files  1 passed (1)
Tests       26 passed (26)
```

### Evidence workspace and direct reload

Initial workspace RED:

```text
npx vitest run src/components/EvidenceWorkspace.test.tsx
Test Files  1 failed (1)
Tests       7 failed | 16 passed (23)
```

All seven PageIR state-machine cases failed because no Source Bundle UI or keyed
review draft existed. The template-null comparison already passed, proving the
legacy markup baseline before production changes.

An additional browsing regression was deliberately RED because the initial
integration did not yet suppress the Source Bundle panel while viewing an older
approved evidence gate:

```text
Tests  1 failed | 23 skipped (24)
TypeError: isPageIrSourceReviewActive is not a function
```

The direct-reload proof first failed before test execution because the owned page
still used the same unresolved Vitest aliases. The page now uses equivalent
relative imports and passes the validated Task 3a projection through the shared
pure adapter. The focused reload and browsing boundary then passed 2 of 2.

Final focused GREEN:

```text
npx vitest run src/app/api/evidence/'[id]'/route.test.ts \
  src/app/evidence/'[id]'/page.test.tsx \
  src/components/EvidenceWorkspace.test.tsx \
  src/components/RunTimeline.test.tsx \
  src/components/resumeRun.test.ts
Test Files  5 passed (5)
Tests       63 passed (63)
```

## Verification

- Focused Task 3b suite: PASS, 5 files and 63 tests.
- Typecheck: `npm run typecheck` — PASS.
- Lint: `npm run lint` — PASS with 0 errors and 7 pre-existing or concurrent
  warnings; none was introduced by Task 3b.
- Whitespace: `git diff --check` — PASS for the owned slice.
- First full-suite attempt: 82 files passed, 4 skipped; 1002 tests passed, 4
  skipped, and 1 concurrent Task 3a replay test failed. The out-of-scope failure
  was `pipelineReplay > parks a failed PageIR candidate at zero repair attempts`
  at `src/lib/pipelineReplay.test.ts:307`: its `emit` spy received zero calls.
  Task 3a was actively changing that core seam, so Task 3b did not work around or
  edit it. A fresh full rerun remains pending until Task 3a reports the core
  tranche stable.

## Scope confirmation

- No PageIR core sequencing, derivation, candidate materialization, gate,
  promotion, repair, release, export, handoff, rollout, compiler, or template
  implementation was changed.
- The only main-page change is the source-pause reducer branch required by the
  brief.
- The shared `pageIrSourceReview.ts` adapter is pure, server-safe, and limited to
  the API/client projection; it prevents mapping drift between route responses
  and direct page reloads.
- No model reviewer, push, PR, merge, history amendment, or rollout change was
  performed.

## Blockers

- Final full-suite confirmation is waiting only for Task 3a's concurrently
  changing replay seam to stabilize. No Task 3b focused, type, lint, or whitespace
  check is blocked.
