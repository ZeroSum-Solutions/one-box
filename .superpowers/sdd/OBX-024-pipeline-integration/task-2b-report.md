# OBX-024 Task 2b report: compiler/gate compatibility

Date: 2026-08-23

Base: `691bbdbde1e0b7e1d1cc5c22d102f5eded716d99`

Implementation commit:

- `9e0f004`: `fix: make PageIR compiler output gate-compatible`

## Outcome

`page-ir-static@2` declares the fixed `--compiler-canvas` background in
`tokens.css` and consumes it for both body and skip-link backgrounds. The
existing fixed compiler ink and font values are now also consumed through
`--compiler-color` and `--compiler-font` instead of being repeated as raw
rendered declarations in `site.css`. The fixed shadow was already declared and
consumed through `--compiler-shadow`. `SITE_CSS` contains no other direct fixed
rendered color or font declarations.

The compiler remains deterministic and provider-free. The existing inventory,
manifest, PageIR hash, asset validation, no-JavaScript actions, responsive
layouts, and output bounds remain unchanged except for the expected compiled CSS
bytes, manifest/build hashes, and compiler version.

The version bump makes an otherwise-valid `page-ir-static@1`
`ready-for-gates` candidate stale. Materialization creates a new `@2` candidate
instead of silently returning `reused`.

The real-browser PageIR candidate proof now requires the exact nine-gate order
with zero blocking failures. It continues to prove that the live site and
run-root live gate receipt remain byte-identical while the candidate-scoped
receipt is written.

## TDD evidence

The compiler contract RED was deliberate:

```text
npm test -- src/lib/pageIrCompiler.test.ts -t 'pins the compiler version|declares and consumes every fixed rendered color and font'
Test Files  1 failed (1)
Tests       2 failed | 35 skipped (37)
```

The failures showed `page-ir-static@1` instead of `@2` and no
`--compiler-canvas:#fff;` declaration.

The old-version materialization RED was deliberate:

```text
npm test -- src/lib/pageIrPipeline.test.ts -t 'replaces a valid page-ir-static@1 candidate'
Test Files  1 failed (1)
Tests       1 failed | 19 skipped (20)
Expected: "created"
Received: "reused"
```

The real-browser gate RED was deliberate:

```text
npm test -- src/lib/gates.candidate.integration.test.ts -t 'passes every blocking gate for compiled PageIR'
Test Files  1 failed (1)
Tests       1 failed | 1 skipped (2)
```

Its only blocking report was the known token drift:

```text
token-drift: <a> backgroundColor rgb(255, 255, 255) not in tokens.css
```

After the minimum compiler change, the same three focused commands were GREEN:

- compiler contract: 2 passed, 35 skipped;
- old-version materialization: 1 passed, 19 skipped; and
- real-browser PageIR proof: 1 passed, 1 skipped.

The combined focused suite was also GREEN:

```text
npm test -- src/lib/pageIrCompiler.test.ts src/lib/pageIrPipeline.test.ts src/lib/gates.candidate.integration.test.ts
Test Files  3 passed (3)
Tests       59 passed (59)
```

## Compatibility fixture found by the full suite

The first full run found one stale test fixture in
`src/lib/gates.candidate.test.ts`. Its undeclared-design-token case consumed the
default compiler `tokens.css`, so the new canvas declaration correctly made the
old expected failure pass. The fixture now explicitly supplies compiler color
and font declarations while omitting canvas. This preserves the gate's intended
fail-closed proof without changing `gates.ts` or weakening any assertion.

Focused verification of that compatibility fixture:

```text
npm test -- src/lib/gates.candidate.test.ts -t 'rejects PageIR design token values not declared by candidate tokens.css'
Test Files  1 passed (1)
Tests       1 passed | 62 skipped (63)
```

## Grok 4.6 proof-audit adjudication

### Finding 1: rejected

The integration-proof finding was stale. The existing assertions in
`src/lib/gates.candidate.integration.test.ts` lines 231-256 already require:

- the exact ordered list of all nine gates;
- zero blocking failures;
- the candidate receipt's manifest and build bindings;
- byte-identical live `index.html` and run-root `gates.json` sentinels; and
- candidate-scoped receipt bytes equal to the returned receipt.

No integration test change was needed.

### Finding 2: accepted

The focused compiler test now asserts all three exact fixed token declarations:

```text
--compiler-canvas:#fff;
--compiler-color:#172033;
--compiler-font:ui-sans-serif,system-ui,sans-serif;
```

This makes the declaration side of the compiler compatibility contract explicit
for canvas, ink, and body typography.

### Finding 3: accepted with a narrow test-only hardening

The raw-literal audit now inspects rendered `color`, `background`,
`background-color`, and `font-family` declarations. Its mutation table proves
that the guard catches three-, six-, and eight-digit hex forms regardless of
case, comma and modern-space `rgb()` forms, opaque `rgba()` forms, and the raw
compiler font stack. Separate assertions preserve `inherit` and compiler-owned
`var(...)` declarations as valid.

The current `page-ir-static@2` output was already compliant, so the strengthened
test passed on its first run. No production RED was manufactured. The test earns
its proof by injecting twelve raw CSS mutations one at a time and requiring the
audit to identify each exact declaration:

```text
npm test -- src/lib/pageIrCompiler.test.ts -t 'declares and consumes every fixed rendered color and font'
Test Files  1 passed (1)
Tests       1 passed | 36 skipped (37)
```

## Verification

- Required focused suite: PASS, 3 files and 59 tests.
- Full suite: `npm test`: PASS on the fresh rerun, 80 files passed and 4
  skipped; 966 tests passed and 4 skipped.
- Typecheck: `npm run typecheck`: PASS.
- Lint: `npm run lint`: PASS with 0 errors and 6 pre-existing warnings in
  out-of-scope files.
- Architecture documentation verification: PASS with no ledger, path,
  Markdown, shell, or secret errors.
- Whitespace checks before both commits: PASS.
- The Task 2b handoff records the exact base-diff whitespace check and final
  worktree status after this report commit.

## Scope confirmation

This task changed no `gates.ts`, pipeline implementation, controller, API, UI,
promotion, repair, rollout, or template file. I invoked no model reviewer and
performed no push, PR, merge, or history amendment.

## Blockers

None.
