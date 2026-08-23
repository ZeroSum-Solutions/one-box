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
optional `intake.json` are read as stable regular files, checked against any
recorded provenance hash, and checked again after all gates.

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
