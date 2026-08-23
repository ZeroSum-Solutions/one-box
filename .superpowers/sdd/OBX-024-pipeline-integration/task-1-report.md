# OBX-024 Task 1 Report

## Commit

- Implementation commit: `6725450372cc16ebc5c361bed7d7b9081cf20467`
- Review-fix commit: `1afedd58b512d00929222b2b5d9c028420a248f0`
- Subject: `feat: add durable PageIR candidate boundary`
- Base: `7a68c157809a127f64e1c3571fcb6fa5eb96b285`

## Files changed

- `src/lib/contracts.ts`: closed PageIR Source Bundle review contract and persisted PageIR envelope.
- `src/lib/runstate.ts`: fixed run-relative paths for `page-ir.json` and `page-ir-sources/v1`.
- `src/lib/pageIrPipeline.ts`: source proposal and human review, immutable PageIR compare-and-create, and PageIR-only candidate materialization.
- `src/lib/pageIrPipeline.test.ts`: focused contract, persistence, tamper, crash, concurrency, and candidate lifecycle coverage.
- `docs/architecture/README.md`: canonical ownership and limitation note for the new runtime boundary.

## RED and GREEN evidence

Each cycle used `npm test -- src/lib/pageIrPipeline.test.ts` unless a narrower command is shown.

1. Source-bundle contract
   - RED: 2 of 2 tests failed because `PageIrSourceBundleV1Schema` was not exported.
   - GREEN: 2 of 2 tests passed after adding the closed bundle, source-chain, transition, and human-review schemas.
2. Source-bundle persistence
   - RED: 2 persistence tests failed with `pageIrPipeline module must exist`.
   - GREEN: 4 of 4 tests passed after exact-byte staging, current approved upstream binding, and append-only review transitions were added.
3. Persisted PageIR contract
   - RED: 1 of 5 tests failed because `PersistedPageIrV1Schema` was not exported.
   - GREEN: 5 of 5 tests passed after adding the strict envelope and fixed lineage proof.
4. Persisted PageIR runtime
   - RED: 3 tests failed because `deriveAndPersistInitialPageIr` and `loadPersistedPageIr` did not exist.
   - Debugging exposed a test-fixture mismatch between `motion-subtle` and the approved inventory's `motion-ease`; the fixture binding was corrected without changing production derivation.
   - GREEN: 8 of 8 tests passed after atomic compare-and-create, tamper checks, and crash retry behavior were added.
5. Candidate materialization
   - RED: 3 candidate tests failed because `materializePageIrCandidate` did not exist; 8 tests passed.
   - GREEN: 11 of 11 tests passed after compiler-only staging, provenance binding, lock protection, reuse, and failed-candidate parking were added.
6. Candidate lifecycle regression
   - RED: `npm test -- src/lib/pageIrPipeline.test.ts -t "replaces only a valid stale candidate"` failed because an abandoned candidate was reused.
   - GREEN: the same command passed, with 1 test passed and 13 skipped, after reuse was limited to active or terminal validated states.
7. Final focused suite
   - GREEN: 1 file passed, 14 tests passed in 7.18 seconds.

## Full verification

- `npm test`: PASS on the final run, 80 files passed, 4 skipped; 946 tests passed, 4 skipped.
- The first full-suite run recorded two 5-second parallel-load timeouts: this task's five-scenario rejection test and the pre-existing `candidatePromotion.test.ts` crash test. The focused rejection test passed alone in 2.38 seconds. Its harness timeout was raised to 15 seconds, and the unchanged pre-existing test also passed on the final full run.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with 0 errors and 6 pre-existing warnings outside the owned files.
- `git diff --check 7a68c157809a127f64e1c3571fcb6fa5eb96b285..HEAD`: PASS.
- Project documentation verifier: PASS with no ledger, document, path, Markdown, shell, or secret-marker errors.
- `gitleaks detect --source . --no-banner --redact --log-opts 7a68c157809a127f64e1c3571fcb6fa5eb96b285..HEAD`: PASS; one commit scanned, no leaks found.
- Security report validator: `security-review-report: OK`, verdict `PASS`, no findings.

## Design decisions

- The PageIR Source Bundle lives at one closed numeric root, `page-ir-sources/v1`, with exactly `bundle.json`, `layout-decision.json`, `content.json`, and `assets.json`.
- Bundle creation binds exact bytes to the current approved ledger, design contract, token inventory, Tailwind plan, and CSS architecture. No latest alias or caller-provided destination exists.
- Review history is append-only. Approval requires a named human actor, literal attestation, and five explicit pass criteria bound to the immutable bundle payload hash. The implementation does not synthesize an approval.
- The initial `page-ir.json` is revision 1 and authoritative. Creation runs under the run lock, converges under concurrency, and never overwrites a conflicting checkpoint.
- Candidate input is the persisted PageIR envelope plus an explicit, bounded set of run-owned `uploads/` bytes. The existing pure compiler remains the only build path.
- Candidate reuse requires exact compiler, PageIR, input, manifest, build, authority, and inventory agreement. A matching failed candidate returns `parked-failed` unchanged.
- Candidate replacement stays below the candidate root and uses the existing site-authority lock. It never writes live `site/`, PageIR, source evidence, gates, or run metadata.

## Scope exclusions

- No edits to `src/lib/gates.ts`, the pipeline controller, APIs, UI, or template behavior.
- No rollout activation, provider call, agent framework, PageIR editing, promotion, live write, or gate execution.
- No automated compiled-file repair. That work remains prohibited until OBX-031.
- No candidate, gate, or live metadata was copied into `run.json`.
- No model reviewer was invoked.

## Residual risks and unresolved acceptance

- Task 1 exposes internal runtime operations only. Controller, API, and UI integration remain for later OBX-024 tasks, including collection of a real human review action at the caller boundary.
- Candidate gate compatibility remains limited by the existing token and edit-ID integration mismatch documented in the architecture note.
- Automated repair of failed PageIR output remains intentionally absent until OBX-031. Failed matching candidates stay parked.
- No Task 1 acceptance clause remains unresolved.

## Grok 4.6 review adjudication

| Finding | Result | Verified evidence |
| --- | --- | --- |
| 1. Candidate swap can replace promoted or promotable state and lose the prior root during a failed swap | FIXED | `materializePageIrCandidate` now refuses to replace stale `failed`, `promotable`, or `promoted` candidates. `installCandidateDirectory` restores the retired candidate after any caught pre-commit failure, reports restoration failure instead of swallowing it, and retains the completed new candidate after a post-commit hook failure. The three-state preservation test and post-retire rollback test cover the regression. |
| 2. PageIR creation can overwrite another concurrent creator | REJECTED | The existence check, derivation, temporary write, and rename all execute inside `withRunTransaction`. That transaction uses the per-run in-process queue plus the cross-process hard-link `.run-state-lock`. Repository search finds no other `page-ir.json` writer. The existing concurrent-creator and crash-boundary tests prove one byte-identical checkpoint for every cooperating Task 1 creator. |
| 3. A newer draft should not invalidate a prior approved workflow version | REJECTED | The workflow intentionally has one current nonsuperseded version. Saving a revision requires the prior version to be `revision-requested`, appends `superseded`, and creates the new draft. `EvidenceWorkflowStateSchema` rejects an older active version or more than one nonsuperseded version. Selecting the highest historical approval would revive superseded evidence and violate the current-source chain. |
| 4. Compiler output paths are written before validation | REJECTED | `compilePageIRV1` constructs only fixed static filenames plus `assets/<validated-asset-id>.<closed-media-extension>`. Before returning, it parses a manifest containing the same file paths through `CandidateManifestV1Schema`, whose file records use `CandidateRelativePathSchema`. Materialization receives no provider or caller-supplied compiler result, and final writes use exclusive create in a fresh random staging tree. |
| 5. Materialization inverts the site and run lock order | REJECTED | The documented order is site authority first, then a run transaction. Materialization acquires `withSiteAuthorityLock` and performs only read-only `loadRun` calls inside it; it never acquires `withRunTransaction`. Read-only run loads are explicitly unlocked. The implementation follows the established order. |
| 6. `O_NOFOLLOW` fallback leaves a concrete link or TOCTOU gap | REJECTED | On the target macOS platform, `O_NOFOLLOW` is available. The portable fallback still compares the initial path with the opened file descriptor by device, inode, size, regular-file type, and link count, then repeats the descriptor checks after reading. A swap to different bytes or a hardlink fails closed; a fallback symlink to the exact already-validated inode cannot change the accepted bytes. |
| 7. Reuse and parking do not revalidate candidate site bytes | REJECTED | `inspectCandidate` parses the manifest, verifies its provenance and build bindings, and calls `validateCandidateInventory` before returning a present candidate. That inventory walk rehashes every candidate file and rejects missing, unexpected, linked, size-mismatched, or hash-mismatched bytes before materialization can reuse or park it. |
| 8. Candidate publication lacks durable directory sync and leftover handling | FIXED | Staging file directories and the staging root are synced before publication. The run root is synced after retirement, publication, restoration, and retired-root removal. Caught post-retire failures restore the exact prior candidate and leave no build or retired sibling. True process-crash leftovers already use the closed `candidate.building-*` and `candidate.retired-*` names consumed by `recoverCandidateState`, which restores exactly one valid generation or blocks ambiguity. |

### Review-fix RED and GREEN evidence

- RED: `npm test -- src/lib/pageIrPipeline.test.ts -t "preserves a stale|restores the prior candidate"` failed all 4 selected tests. Each stale `failed`, `promotable`, and `promoted` candidate was replaced, and the post-retire hook was ignored.
- GREEN: the same command passed all 4 selected tests with 14 skipped after lifecycle parking, rollback, cleanup, and directory-sync changes.
- Focused final: `npm test -- src/lib/pageIrPipeline.test.ts` passed 18 of 18 tests.
- Full final: `npm test` passed 80 files with 4 skipped; 950 tests passed with 4 skipped.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with 0 errors and the same 6 pre-existing warnings outside the owned files.
- `git diff --check`: PASS.

### Review-fix residual risk

- The compare-and-create guarantee depends on all repository writers respecting the per-run filesystem lock. No other PageIR writer exists in this revision. An unrelated external process with direct run-directory write access is outside the local single-user service's coordination contract.
- A real process death between candidate retirement and publication leaves the valid retired generation for the existing startup recovery path. Materialization itself does not duplicate that recovery controller.
