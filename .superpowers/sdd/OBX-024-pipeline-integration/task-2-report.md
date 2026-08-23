# OBX-024 Task 2 report — authority-aware full candidate gates

Date: 2026-08-23

Base: `2874118e00c33674cd61fe5f69692a8aa71be20e`

Code and test commits:

- `c24dfc3` — `feat: add authority-aware PageIR candidate gates`
- `fb96ff2` — `fix: ignore CSS token declaration lookalikes`
- `acee3a1` — `test: define normalized token equivalence`
- `d962b71` — `test: cover single PageIR call target`

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
- CSS comment, quoted-content, and function-payload declaration-lookalike
  rejection;
- normalized color and first-font equivalence with different-value,
  different-first-family, and named-color fail-closed boundaries;
- missing, tampered, unbound, or hash-mismatched PageIR;
- missing, tampered, wrong-version, linked, or token-less design contracts;
- linked PageIR inputs;
- PageIR and design-contract mutation during gate execution;
- design-contract mutation after receipt staging and before rename;
- exact multiple-call targets, missing/unexpected targets, and zero-call behavior;
- a real compiled PageIR candidate in Playwright; and
- all pre-existing template-v1 candidate behavior.

## Grok 4.6 Pass A adjudication

### Finding 1 — accepted and fixed

The PageIR design-token binding initially used a raw declaration-shaped regular
expression. A comment or quoted `content` value could therefore make a matching
`cssVar` appear declared when it was not a CSS declaration. The initial review
regression was RED:

```text
npm test -- src/lib/gates.candidate.test.ts -t 'lookalikes|normalized color'
Test Files  1 failed (1)
Tests       1 failed | 1 passed | 60 skipped (62)
```

The spoof case received `pass: true, details: []` instead of the three expected
token-drift failures. A follow-up RED also proved that declaration-shaped text in
an unquoted `url(...)` payload could be misread.

The minimum fix masks comments, strings, parentheses, and brackets while
preserving source positions, then recognizes custom properties only at declaration
positions. The raw value is taken from the original CSS only after that structural
match. A design token is authorized only when the exact `cssVar` has at least one
real declaration and every declaration for that variable normalizes to the
contract value.

Focused GREEN:

```text
npm test -- src/lib/gates.candidate.test.ts -t 'lookalikes|normalized color'
Test Files  1 passed (1)
Tests       2 passed | 60 skipped (62)
```

### Finding 2 — rejected as stated; boundary locked by tests

Requiring byte-identical design-contract and CSS values would contradict the
frozen Task 2 rule: the exact `cssVar` must bind a **normalized value**. Token drift
compares browser `getComputedStyle` output, so `#ffffff` and
`rgb(255, 255, 255)` are the same rendered authority. CSS font-family matching
likewise ignores quoting and ASCII case for the first family.

The boundary test passed before the parser fix and remains green:

- contract `#ffffff` accepts an actual declaration of
  `rgb(255, 255, 255)`;
- contract `ui-sans-serif` accepts a first family of `"UI-SANS-SERIF"`;
- `#fffffe` does not authorize rendered white;
- `system-ui, ui-sans-serif` does not authorize rendered `ui-sans-serif` because
  the first family differs; and
- the named declaration `white` remains fail-closed under the existing supported
  hex/rgb normalization and does not authorize rendered white.

This rejects the reviewer's byte-identity remedy while retaining its underlying
non-widening concern through exact-variable, declaration-position, normalized-value,
and first-family checks.

## Grok 4.6 Task 2 test-proof audit

The audit's one-telephone expected-set finding was accepted as a coverage gap.
Production already enforced the correct behavior, so the new proof was GREEN on
its first run and no production change or manufactured RED was needed:

```text
npm test -- src/lib/gates.candidate.test.ts -t 'single normalized PageIR call target'
Test Files  1 passed (1)
Tests       1 passed | 62 skipped (63)
```

The test uses the default persisted PageIR call action and selects the `assets`
report by its exact gate name. It asserts the gate's own `pass`, `blocking`, and
exact `details` fields for all three states:

- exactly `tel:+15550100400` passes with no details;
- no rendered telephone link fails with the missing expected-target detail; and
- the expected target plus `tel:+14155550123` fails with the unexpected-target
  detail.

A setup exception, missing receipt, missing `assets` report, or failure reported by
another gate cannot satisfy these assertions.

## Verification

- Focused gate unit tests:
  `npm test -- src/lib/gates.candidate.test.ts` — PASS, 1 file, 63 tests.
- Candidate real-browser integration:
  `npm test -- src/lib/gates.candidate.integration.test.ts` — PASS, 1 file,
  2 tests.
- Combined focused suite:
  `npm test -- src/lib/gates.candidate.test.ts src/lib/gates.candidate.integration.test.ts`
  — PASS, 2 files, 65 tests.
- Full suite: `npm test` — PASS on the fresh final rerun, 80 files passed,
  4 skipped; 965 tests passed, 4 skipped. The first attempt saw the unrelated
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
repair, or rollout file was changed. No additional model reviewer was invoked by
the Task 2 implementation agent, and no push, PR, merge, or history amendment was
performed.
