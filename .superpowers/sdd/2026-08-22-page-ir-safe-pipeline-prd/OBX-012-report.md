# OBX-012 implementation report

## Outcome

OBX-012 is verified. Production compilation and publication are separate.
`buildSite()` requires a durable Website run and exact durable input artifacts,
then compiles the frozen template into the OBX-010 private candidate root. It
creates the deterministic candidate manifest and moves provenance from
`preparing` to `ready-for-gates`; it never writes or swaps the served site.

`gateBuiltCandidate(runId)` reuses the OBX-011 `runCandidateGates(runId)`
receipt. Blocking failure moves the candidate to `failed`; a fully passing
receipt moves it to `promotable`. Both states remain unserved. The pipeline
stops at promotable and does not emit a live completion, run visual QA against
candidate bytes, or promote them. OBX-014 retains promotion ownership, and the
existing visual-QA code remains in place after the promotion boundary for that
ticket to reconnect.

## Files changed

- Candidate compilation, durable input authorization, receipt disposition,
  and same-process rollback: `src/lib/builder.ts`.
- Production pipeline gate-before-publish flow and promotable replay guard:
  `src/lib/pipeline.ts` and `src/lib/pipelineReplay.test.ts`.
- Approved runtime Tailwind candidate input path: `src/lib/contracts.ts`.
- Candidate, failure-injection, live-inventory, authorization, and fixture
  coverage: `src/lib/builder.test.ts`, `src/lib/evidence.test.ts`, and
  `src/lib/gates.candidate.test.ts`. `src/components/EvidenceWorkspace.test.tsx`
  follows the approved runtime theme's non-live artifact path.
- Explicit standalone compile/publish fixture boundary:
  `test-support/buildSiteFixture.ts` and its smoke/canvas consumers.
- Canonical delivery evidence: this report, the OBX-012 ticket, SDD progress,
  architecture baseline, engine ledger, documentation ledger, and security
  evidence.

## RED evidence

- Missing durable authorization: the focused builder test exited `1` because
  the old standalone fallback proceeded into compilation and failed later on
  missing input structure instead of denying before writes.
- Candidate compilation: the focused evidence test exited `1` with `ENOENT`
  for `candidate/site/index.html` because the old builder published only to
  `site/`.
- Candidate disposition: the focused gate test first exited `1` because
  `gateBuiltCandidate` did not exist, then the passing-receipt case remained
  red because the provisional implementation selected `failed`.
- Gate-run exception: the injected browser failure left provenance at
  `ready-for-gates`, proving the missing fail-closed transition.
- Atomic disposition rollback: an injected provenance rename failure left the
  newly written candidate receipt behind until receipt rollback was added.
- Fixture isolation: the focused builder test exited `1` because no guarded
  test-only compile/publish helper existed.
- Pipeline terminal semantics: the replay test exited `1` because a
  promotable candidate was still reported as a completed live build.

## GREEN evidence

- Candidate disposition suite: exit `0`; 18 tests passed. It covers passing,
  blocking, gate-run exception, exact prior receipt/provenance restoration,
  prior absence restoration, and exact live inventory/receipt preservation.
- Combined builder/candidate/pipeline/evidence suite: exit `0`; 4 files and 62
  tests passed before the two final acceptance cases were added.
- Typecheck: exit `0`; Next route types generated and `tsc --noEmit` completed.
- Full `npm test`: exit `0`; 66 files passed and 2 skipped; 610 tests passed
  and 2 skipped.
- `npm run lint`: exit `0`; 0 errors and 6 pre-existing warnings.
- `git diff --check`: exit `0`.
- Security report validation: `OK`; range gitleaks scan passed with no leaks.
- Project-documentation verification: `status: ok`; all changed paths were
  classified and both canonical documents passed path, Markdown, shell, and
  secret checks.

## Acceptance mapping

- `buildSite()` creates `candidate/{site,manifest.json,provenance.json}` only.
  The initial blocking-failure test proves no live `site/` or canonical
  run-root `gates.json` appears.
- Rebuild failure tests seed a nested live inventory plus canonical live gate
  report and compare every path, byte sequence, and SHA-256 after candidate
  gates and disposition.
- A passing receipt produces `promotable` with the exact candidate receipt hash
  bound in provenance; no served site appears and no promotion API is called.
- Missing `run.json` is rejected before a run directory or candidate staging
  write. Supplied intake, tokens, skeleton, copy, runtime Tailwind theme, and
  hero asset must match stable durable artifacts; provenance records exact
  byte hashes.
- `evidence/approved/runtime-tailwind-theme.css` is a candidate compilation
  input. It is not written into the live site before promotion.
- Standalone builder consumers import only the guarded helper under
  `test-support/`. App routes and the production pipeline import the
  non-publishing builder directly, and the helper rejects `NODE_ENV=production`.
- Candidate receipt and provenance disposition use the existing OBX-010/011
  paths and schemas. A disposition publication failure restores exact prior
  receipt and provenance bytes or absence. A gate execution error moves the
  candidate to `failed` without inventing a receipt or report hash.
- Visual QA code remains after the new promotable guard. The pipeline stops at
  that guard until OBX-014 promotes the verified bundle and reconnects the
  live-only continuation.

## Assumptions and risks

- The same-process rollback deliberately does not introduce a lock or startup
  recovery. OBX-015 owns cross-process interleavings, interrupted swaps, and
  stale temporary recovery.
- Template compilation remains timestamped legacy output and uses
  `layoutAuthority: template-v1`; this ticket does not implement Page IR or the
  deterministic OBX-022 compiler.
- Candidate repair is absent. Blocking failure remains failed for OBX-013 to
  handle without changing live bytes.
- The repository smoke command has a known baseline Node 26 strip-only loader
  failure in `src/lib/productionTarget.ts`; final verification records whether
  that unchanged blocker reproduces.

## Final verification

- `npm test -- src/lib/gates.candidate.test.ts`: exit `0`; 18 passed.
- `npm test -- src/components/EvidenceWorkspace.test.tsx`: exit `0`; 15 passed.
- `npm test`: exit `0`; 610 passed, 2 skipped.
- `npm run typecheck`: exit `0`.
- `npm run lint`: exit `0`; 0 errors, 6 pre-existing warnings.
- `git diff --check`: exit `0`.
- Security and documentation validators: exit `0`.

`npm run test:smoke` was attempted and exits `1` before fixture compilation on
Node 26.7.0. The unchanged strip-only loader rejects the TypeScript parameter
property in `src/lib/productionTarget.ts:63`. OBX-011 recorded the same failure
on its untouched base archive; no OBX-012 path is on the failing stack, so this
ticket reports the baseline-only skip without expanding into the unrelated
loader repair.

## Fix Round 1 — bind candidate build authorization

Controller review found two real gaps in the original delivery. First,
evidence-gated reconnect accepted stale approved visual QA independently of a
new promotable candidate, so it could replay or synthesize completion for the
old live build. Second, durable `run.json` authorization used ordinary
`readFile` and did not prove that the persisted run ID matched the requested
run root.

### Fix Round 1 RED evidence

The focused command was:

```text
npm test -- src/lib/pipelineReplay.test.ts src/lib/builder.test.ts
```

Exit `1`: 29 tests passed and all 5 intended tests failed. Both evidence-gated
cases emitted `complete` with a promotable candidate present. Symbolic-link,
hardlink, and mismatched-ID authorization all advanced beyond `run.json` into
the missing `copy.json` read.

The import-boundary mutation command was:

```text
npm test -- src/lib/productionFixtureBoundary.test.ts
```

With a temporary forbidden pipeline import, exit `1` named
`src/lib/pipeline.ts` as the offender. The mutation was removed before GREEN.

### Fix Round 1 GREEN evidence

- Replay, builder, run-state, and import-boundary suite: exit `0`; 4 files and
  62 tests passed.
- Typecheck: exit `0`; Next route types generated and `tsc --noEmit` completed.
- Full `npm test`: exit `0`; 67 files passed and 2 skipped; 616 tests passed and
  2 skipped.
- Lint: exit `0`; 0 errors and 6 pre-existing warnings.
- `git diff --check`: exit `0`.
- Security report validation: `OK`; range gitleaks scan passed with no leaks.
- Project-documentation verification: `status: ok`; all changed paths were
  classified and the canonical architecture passed path, Markdown, shell, and
  secret checks.

### Fix Round 1 acceptance mapping

- Completion for both pipeline versions is conditional on no promotable
  candidate awaiting OBX-014. Tests cover both stale terminal replay and
  terminal synthesis from stale approved visual QA, and both resume execution.
- `run.json` uses the existing stable no-follow/nonblocking reader. Symbolic and
  hard links fail before candidate or staging output.
- Parsed durable authorization must bind its ID to the validated requested run;
  a schema-valid cross-run ID fails before candidate or staging output.
- `src/lib/productionFixtureBoundary.test.ts` scans every TypeScript app module
  plus the production pipeline module and rejects static or dynamic imports of
  `test-support/buildSiteFixture`.
- OBX-011 candidate gate runtime, Website-only policy, fixture runtime guard,
  Page IR, repair, promotion, and OBX-015 recovery/locking remain unchanged.

## Fix Round 2 — park promotable candidate runs

Controller review found three sustained boundaries. A promotable reconnect
suppressed completion but still advanced into pause, preflight, cost-cap, and
execution. The two post-build paths treated promotable as a negative
early-return, so any other re-read state fell into live completion or visual
QA. The standalone fixture publisher also lacked affirmative authorization,
its import scan covered only app/pipeline files, and it discarded restoration
errors.

### Fix Round 2 RED evidence

- `npm test -- --run src/lib/pipelineReplay.test.ts src/lib/builder.test.ts`:
  exit `1`; 2 files failed, 7 tests failed and 32 passed. The four parking
  cases resumed or appended a cost-cap error, both fixture exports ran without
  affirmative authorization, and the double-rename case did not produce an
  `AggregateError`.
- `npm test -- --run src/lib/pipelineReplay.test.ts`: exit `1`; 4 tests failed
  and 14 passed because missing, `failed`, and `ready-for-gates` post-build
  state plus a non-promotable clean receipt had no exact disposition guard.
- The expanded import-boundary mutation failed with
  `src/components/intakeRequest.ts` as the sole offender after a deliberate
  side-effect fixture import. The probe was removed before GREEN.
- The final controller-level integration RED exited `1`; 3 tests failed and
  18 passed because legacy completion was still synthesized for missing,
  `failed`, and `ready-for-gates` candidates before the internal guard ran.

### Fix Round 2 behavior

- `runPipeline` inspects candidate state once at the replay boundary. An exact
  present `promotable` candidate replays nonterminal history and current cost,
  then returns before pause, configuration, cost-cap, or execution. Over-cap
  parked runs append no error.
- Both execution paths require exact present `promotable` state after a built
  stage and return. Evidence built-stage resume checks the same boundary before
  an existing visual-QA artifact can complete or restart QA. `stageBuild`
  separately rejects any gate disposition other than `promotable`, even if its
  receipt rows appear clean.
- Stage and stale visual-QA state no longer synthesize a live completion.
  Previously recorded historical live completion remains replay-only when no
  candidate exists. Promotion and live continuation remain OBX-014 work.
- Both fixture exports require `ONEBOX_TEST_FIXTURE_PUBLISH=1` and reject
  production even when authorized. Only intentional unit, smoke, and canvas
  consumers set the flag. The mechanical boundary covers all non-test/spec
  TypeScript and TSX under `src/`, including side-effect imports.
- If staged publication fails and restoration also fails, the publisher throws
  an `AggregateError` containing both failures and leaves the retired snapshot
  untouched. No cross-process recovery or locking was added.

### Fix Round 2 verification

- Focused pipeline, builder, evidence, and boundary suite: exit `0`; 4 files,
  65 tests passed.
- Full `npm test`: exit `0`; 67 files passed and 2 skipped; 629 tests passed
  and 2 skipped.
- `npm run typecheck`: exit `0`.
- `npm run lint`: exit `0`; 0 errors and 6 pre-existing warnings.
- `git diff --check`: exit `0`.
- Security report validation: `OK`; range gitleaks scan passed with no leaks.
- Project-documentation verification: `status: ok`.

`npm run test:smoke` still exits `1` before fixture execution on Node 26.7.0:
the unchanged strip-only loader rejects the TypeScript parameter property in
`src/lib/productionTarget.ts:63`. The same baseline blocker was recorded by
OBX-011, OBX-012, and Fix Round 1; no Fix Round 2 path executes before failure.
