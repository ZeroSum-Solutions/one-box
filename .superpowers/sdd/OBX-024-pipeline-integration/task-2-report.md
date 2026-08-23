# OBX-024 Task 2 report — authority-aware full candidate gates

Date: 2026-08-23

Base: `2874118e00c33674cd61fe5f69692a8aa71be20e`

Implementation commit: `c24dfc3` (`feat: add authority-aware PageIR candidate gates`)

## Outcome

`runCandidateGates` now dispatches its inputs and browser oracles from the
candidate's immutable `layoutAuthority`. The existing nine-gate suite and receipt
schema are unchanged. `template-v1` candidates retain their existing
`tokens.json`, optional `intake.json`, telephone, and fixed no-JavaScript
semantics. `page-ir-v1` candidates use the persisted PageIR and its exact
design-contract lineage without reading template-owned inputs.

The PageIR path now:

- stably reads a provenance-bound, regular, non-linked `page-ir.json` and verifies
  its strict envelope, run, canonical PageIR hash, provenance PageIR hash, and
  binding-set hash;
- resolves the exact design-contract lineage version with
  `workflowArtifactVersionPath`, verifies its lineage SHA-256, parses
  `V2DesignContractMetadataSchema`, and requires `designTokens`;
- treats PageIR and design-contract bytes as gate snapshots and revalidates the
  authority/compiler/PageIR/manifest/build/input bindings and both snapshots
  before receipt construction and again immediately before the atomic rename;
- derives no-JavaScript selectors from the declared navigation, main, skip target,
  every action slot, and a deterministic visible content binding;
- derives the exact normalized set of zero, one, or multiple `tel:` targets from
  PageIR call actions; and
- keeps token drift fail-closed: a design-contract value is accepted only when the
  candidate `tokens.css` declares the matching `cssVar` with the matching value.

All gate navigation and receipt writes remain candidate-scoped. Focused unit and
real-browser tests preserve byte-identical live-site and live-receipt sentinels.

## TDD evidence

The initial focused PageIR run was deliberately RED:

```text
npm test -- src/lib/gates.candidate.test.ts -t "PageIR|Page IR|page-ir|design-contract"
Test Files  1 failed (1)
Tests       8 failed | 51 skipped (59)
```

All eight cases reached the pre-existing template-only seam and failed with
`gate input is not bound by provenance: tokens.json`. The assertions were then
tightened so each mutation/linkage/oracle case failed for its intended reason
before production edits.

A separate token-drift RED proved that merely listing a color or font in the
design contract made undeclared rendered CSS pass under an initially permissive
implementation. That union was removed. The final test demonstrates that only
values declared through the corresponding candidate `tokens.css` custom property
are allowed; undeclared `rgb(255, 255, 255)` remains a blocking drift failure.

The final focused tests cover:

- the complete PageIR authority suite without run-root `tokens.json` or
  `intake.json`, IR-derived selectors, receipt output, and live sentinels;
- CSS-bound design-token enforcement;
- missing, tampered, unbound, or hash-mismatched PageIR;
- missing, tampered, wrong-version, linked, or token-less design contracts;
- linked PageIR inputs;
- PageIR and design-contract mutation during gate execution;
- design-contract mutation after receipt staging and before rename;
- exact multiple-call targets, missing/unexpected targets, and zero-call behavior;
- a real compiled PageIR candidate in Playwright; and
- all pre-existing template-v1 candidate behavior.

## Verification

- Focused gate unit tests:
  `npm test -- src/lib/gates.candidate.test.ts` — PASS, 1 file, 60 tests.
- Candidate real-browser integration:
  `npm test -- src/lib/gates.candidate.integration.test.ts` — PASS, 1 file,
  2 tests.
- Combined focused suite:
  `npm test -- src/lib/gates.candidate.test.ts src/lib/gates.candidate.integration.test.ts`
  — PASS, 2 files, 62 tests.
- Full suite: `npm test` — PASS on the fresh final rerun, 80 files passed,
  4 skipped; 962 tests passed, 4 skipped. The first attempt saw the unrelated
  cross-process timing test
  `imageLibrary > enforces the credit cap across processes with different request ids`
  fail once; that exact test passed immediately in isolation before the clean full
  rerun.
- Typecheck: `npm run typecheck` — PASS.
- Lint: `npm run lint` — PASS with 0 errors and 6 pre-existing warnings in
  out-of-scope files.
- Base diff whitespace check and final worktree status are recorded after the
  report commit in the Task 2 handoff.

## Known blocker

The exact current `page-ir-static@1` compiler fixture does not pass every blocking
gate. Its `site.css` hard-codes the skip-link background as `#fff`, while its
`tokens.css` does not declare a matching token. The real-browser proof therefore
passes by asserting the correct fail-closed receipt:

```text
token-drift: <a> backgroundColor rgb(255, 255, 255) not in tokens.css
```

All other blocking gates pass for that exact compiled candidate, and live
sentinels remain unchanged. Fixing the compiler output belongs to the separate
OBX-022-owned compatibility slice. Task 2 intentionally does not weaken token
drift or modify the compiler to hide this incompatibility.

## Scope confirmation

No pipeline, controller, API, UI, PageIR compiler, template builder, promotion,
repair, or rollout file was changed. No model reviewer was invoked, and no push,
PR, merge, or history amendment was performed.
