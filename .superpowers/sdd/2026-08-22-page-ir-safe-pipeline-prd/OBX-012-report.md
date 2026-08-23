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
