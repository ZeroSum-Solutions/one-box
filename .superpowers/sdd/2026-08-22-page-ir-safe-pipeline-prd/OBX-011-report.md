# OBX-011 implementation report

## Outcome

OBX-011 is verified. Live gates retain the public
`runGates(runId, options?)` API, including full-build, after-edit, evidence
approval, and smoke callers. Candidate evaluation uses the separate public
`runCandidateGates(runId)` API, which accepts no caller path, URL, base URL, or
after-edit selection.

The candidate entry point derives one private target from the OBX-010 closed
paths and inspection contract. It requires a real non-symlink run, candidate,
and candidate-site directory; a `ready-for-gates` provenance binding; and a
valid manifest/inventory/build. Browser navigation uses the candidate
`index.html` file URL, while token, stylesheet, unresolved-reference, and
contrast inputs use that same candidate site root. Run-root `tokens.json` and
any present optional `intake.json` require provenance bindings, are read as
stable regular files, and are checked again after all gates.

Every candidate run executes the ordered nine-gate suite. After the browser
closes, the candidate manifest, inventory, build, provenance input bindings,
and mutable gate inputs are revalidated. Only then is this strict receipt
serialized and atomically written to `candidate/gates.json`:

```text
schemaVersion: 1
runId
candidateManifestSha256
buildSha256
reports: full ordered GateReport[9]
```

The returned `gateReportSha256` hashes those exact serialized receipt bytes for
OBX-012. OBX-011 does not decide `failed` versus `promotable`, update
provenance, repair a candidate, serve it, or publish it.

## Files changed

- Candidate receipt contract and tests: `src/lib/contracts.ts` and
  `src/lib/contracts.test.ts`.
- Closed live/candidate target orchestration and atomic candidate receipt:
  `src/lib/gates.ts`.
- Fast boundary, failure, tamper, and atomicity coverage:
  `src/lib/gates.candidate.test.ts`.
- Actual Playwright integration against an unserved candidate:
  `src/lib/gates.candidate.integration.test.ts`.
- Canonical architecture and delivery state: `docs/architecture/README.md`,
  the OBX-011 ticket, and the SDD progress ledger.
- Security evidence: the `OBX-011-security` directory beside this report.

## RED evidence

The contract RED command was:

```text
npm test -- src/lib/contracts.test.ts
```

Exit `1`: 29 tests passed and the intended candidate receipt test failed
because `CandidateGateReceiptV1Schema` was absent.

The candidate runner RED command was:

```text
npm test -- src/lib/gates.candidate.test.ts
```

Exit `1`: the intended candidate test failed because `runCandidateGates` was
absent. No production candidate gate code existed at either RED checkpoint.

## GREEN evidence

- Strict candidate contract: exit `0`; 30 tests passed.
- Fast candidate gate suite: exit `0`; 8 tests passed.
- Actual Playwright candidate integration: exit `0`; 1 test passed in 2.03
  seconds, all nine gate reports were present, and zero blocking gates failed.
- Combined focused regression command: exit `0`; 10 files and 118 tests passed,
  including OBX-010 candidate inspection, live evidence-approval rerun,
  after-edit mutation funnels, and gate behavior.
- Full `npm test`: exit `0`; 66 files passed and 2 skipped; 596 tests passed
  and 2 skipped.
- `npm run typecheck`: exit `0`; Next route types generated and `tsc --noEmit`
  completed.
- `npm run lint`: exit `0`; 0 errors and 6 pre-existing warnings.
- `git diff --check`: exit `0`.

The repository smoke command was attempted and recorded separately rather than
reported as a pass. `npm run test:smoke` exits before gate execution on Node
26.7.0 because the existing strip-only loader rejects the TypeScript parameter
property at `src/lib/productionTarget.ts:63`. A temporary archive of untouched
base `c916d2c` with the same dependencies reproduced the identical error. No
OBX-011 file is on that failing stack, and this ticket did not expand into an
unrelated smoke-loader repair.

## Acceptance mapping

- Candidate success executes the exact nine gate names and writes only the
  strict candidate receipt. The real-browser fixture proves the actual suite,
  not only an orchestration mock.
- A blocking contrast failure still records the complete candidate receipt;
  lifecycle outcome remains unselected.
- Candidate manifest/build hashes in the receipt equal the validated OBX-010
  bindings, and the returned report hash equals the exact bytes on disk.
- The candidate API has exactly one string parameter. It exposes no root,
  report, URL, base URL, path, or after-edit option.
- Unsafe run IDs, cross-run provenance, malformed provenance, and symlinked
  candidate sites fail before browser launch or report creation.
- Pre-run and in-run candidate tamper fail before publication of a new receipt.
  Provenance-bound token/intake mismatch or in-run drift does the same.
- Browser failure emits no new receipt. Atomic rename failure preserves the
  previous candidate receipt and removes the temporary file.
- Live `site/index.html` and run-root `gates.json` sentinel bytes stay unchanged
  on candidate pass, blocking failure, browser error, tamper, and atomic write
  failure.
- Existing full-build and after-edit routing remain in `runGates`; evidence
  approval still calls `runGates(id, {})`, and the focused/full suites are
  green.

## Lifecycle and eval ownership

OBX-011 emits a validated receipt plus its exact SHA-256 only. It does not write
`gateReportSha256` into provenance because the current contract couples that
binding to later lifecycle disposition. OBX-012 owns the `ready-for-gates` to
`failed`/`promotable` decision, the provenance update, publication refusal, and
the complete `EVAL-CAND-001`/`EVAL-CAND-002` outcome.

## Assumptions and risks

- Candidate evaluation requires current state `ready-for-gates`; repair and
  recovery must return to that state through the OBX-010 transition contract
  before rerunning the suite.
- Optional intake remains optional, but if provenance binds it, absence or any
  byte mismatch fails closed. `tokens.json` is required because the existing
  gate suite always consumes it.
- A crash after atomic candidate receipt replacement but before OBX-012 binds
  provenance leaves a deliberately unbound diagnostic. OBX-010 inspection
  rejects it, so recovery cannot mistake it for promotable evidence.
- The Node 26 smoke-loader incompatibility is a baseline repository issue. Unit,
  type, lint, focused gate, and direct real-browser candidate evidence cover
  this ticket without claiming that baseline smoke command passed.

## Fix Round 1 — harden receipt and last-write validation

Grok 4.6 sustained six bounded findings in the original delivery: nested report
objects were not strict, blocking flags were not receipt invariants, consumed
run-root inputs could be unbound, the candidate `tokens.css` gate read followed
the ordinary read path, candidate path checks did not assert every fixed path,
and receipt publication did not revalidate after staging its temporary bytes.
This round closes those seams without adding a caller path API, lifecycle
decision, site mutation, compiler, repair, promotion, or cross-process lock.
OBX-015 still owns the final last-instant concurrency window.

### Fix Round 1 RED/GREEN evidence

Contract RED command:

```text
npm test -- src/lib/contracts.test.ts
```

RED exit `1`: 29 tests passed and the intended receipt test failed because a
nested unknown report key was accepted. The same test also pins the exact
blocking tuple so no blocking gate can be downgraded in a receipt.

Runtime RED command:

```text
npm test -- src/lib/gates.candidate.test.ts
```

RED exit `1`: 9 tests passed and the 3 intended tests failed. Unbound consumed
inputs produced a receipt, a deterministic post-inventory `tokens.css` symlink
swap reached browser launch, and a provenance binding flip after temporary
receipt creation was still renamed into place.

GREEN evidence:

- Contract plus fast candidate suite: exit `0`; 42 tests passed.
- Contract, mocked candidate, and actual Playwright candidate path: exit `0`;
  43 tests passed. The real path had zero blocking failures.
- Ten-file candidate/live caller regression: exit `0`; 134 tests passed.
- Full `npm test`: exit `0`; 66 files passed and 2 skipped; 600 tests passed
  and 2 skipped.
- `npm run typecheck`: exit `0`; route types generated and `tsc --noEmit`
  completed.
- `npm run lint`: exit `0`; 0 errors and 6 pre-existing warnings.
- `git diff --check`: exit `0`.

### Fix Round 1 acceptance mapping

- Candidate receipts use a candidate-only strict nested gate-report schema.
  One closed tuple pins exact order and policy: the first eight gates are
  blocking and `perf-budget` is advisory.
- Required `tokens.json` must be provenance-bound before reading. A present
  optional `intake.json` must also be bound; a bound but missing intake fails
  closed. Both remain stable regular-file reads and are compared again after
  evaluation and immediately before publication.
- Candidate `tokens.css` uses the same nonblocking/no-follow stable reader. A
  deterministic symlink swap after inventory is rejected before browser launch
  and creates no report.
- The validated run root is derived only after run-ID validation. Candidate
  root, site, manifest, provenance, and report paths must exactly equal the
  fixed layout, with candidate and site confirmed as real non-symlink
  directories below their exact parent.
- After gates, receipt bytes are staged in a same-filesystem private run temp.
  Candidate manifest/build/provenance plus gate inputs are revalidated again
  immediately before atomic rename. Tamper removes the temp and emits no new
  receipt; rename failure still preserves a previous receipt.
- Tests prove file-URL navigation, exact gate/blocking order, candidate-site
  roots for contrast and unresolved-reference disk seams, unsafe run-ID
  no-create behavior, pre/in-run provenance binding flips, and exact real
  receipt bytes and SHA-256.

### Fix Round 1 files, assumptions, and risks

- Receipt closure: `src/lib/contracts.ts` and `src/lib/contracts.test.ts`.
- Closed target, stable inputs, and staged revalidation:
  `src/lib/gates.ts` and `src/lib/gates.candidate.test.ts`.
- Real Playwright byte/hash binding:
  `src/lib/gates.candidate.integration.test.ts`.
- Canonical evidence: `docs/architecture/README.md`, the OBX-011 ticket, this
  report, the SDD progress ledger, and the
  `OBX-011-fix-round-1-security` directory.
- Assumption: the private temporary receipt is created under the validated run
  root so rename into `candidate/gates.json` remains same-filesystem atomic; it
  is always removed on rejection or rename failure.
- Risk: no competing lock was introduced. OBX-015 owns swap-and-restore across
  the full browser run and the final cross-process rename window.
