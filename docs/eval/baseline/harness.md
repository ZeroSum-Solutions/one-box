# Frozen Path A vs Path B evaluation harness

## Current contract: v2

`evaluation-contract-v2.json` is the active immutable comparison contract;
v1 files remain historical and are not modified. V2 adds evaluator-visible built
`site/index.html` and `site/styles.css`, plus binary-safe `screenshots/desktop.png`,
`screenshots/tablet.png`, and `screenshots/mobile.png`. Screenshots must be PNGs
without textual or EXIF metadata and match frozen viewport widths/minimum heights:
1440×900, 768×1024, and 390×844 respectively.

One authorization record must cover both paths and is persisted immutably under the
prepared run. The runner rejects a different sibling authorization and enforces its
`maxCostUsd` against the aggregate recorded cost of both paths. The runner computes
builder/gate/evidence hashes from the trace's producing Git commit, and Path A also
requires that both its persisted run and site manifest name that same commit. Path B
must return the identical v2 artifact set and producing-commit constants. The external
handoff request must be created with `--source-commit <40-hex-commit>`.

```sh
npm run eval:baseline:verify
npm run eval:baseline:prepare -- --run-id fiber-refero-v2 --seed review-2026-08-13
npm run eval:baseline:request-path-b -- --run-id fiber-refero-v2 --source-commit COMMIT --out /absolute/path/to/path-b-request.json
```

This harness implements the controlled comparison required by the baseline brief. It
is deliberately an **offline coordinator and verifier**, not a live producer. It
never reads credentials, initiates OAuth, contacts Refero or OpenRouter, or makes a
model call. No command can fabricate a completed Path A or Path B result.

## Frozen contract

`evaluation-contract-v1.json` fixes the exact brief and rubric by SHA-256. Its
repository lock, `evaluation-contract-v1.lock.json`, fixes the contract bytes. Run
the following before every use:

```sh
npm run eval:baseline:verify
```

The command validates the contract lock, input hashes, structured brief, and all
eleven rubric areas plus the automatic-rejection and blind-scoring rules. Any changed
input is a new versioned contract, not a reason to overwrite this one.

## Offline preparation

Create a run only after selecting a reproducible seed and run ID:

```sh
npm run eval:baseline:prepare -- --run-id fiber-refero-v1 --seed review-2026-08-13
```

This atomically writes `docs/eval/baseline/runs/fiber-refero-v1/`; an existing run is
immutable and is never replaced. Both paths are explicitly
`BLOCKED` because the offline harness cannot attest Refero OAuth or ZS Vault access
and is forbidden to run providers. The run manifest preserves the contract hash,
input hashes, seed hash, and randomized blind presentation order. The seed itself and
mapping exist only in the coordinator-side `unblinding.json`, which must not be given
to evaluators.

## Live boundary and provenance

An approved live runner may place actual outputs in `artifacts/path-a/` and
`artifacts/path-b/` beneath that run. Each path needs every file listed in the frozen
contract. Every required artifact must be a regular, non-symlink file.
`provenance.json` must identify the exact path, mark itself `completed`, bind the
run-manifest SHA-256, record nonempty prompts and models, explicitly record tool calls,
sources, and metered calls, and supply a matching SHA-256 for every presentation
artifact. (`provenance.json` cannot self-hash.) The harness rejects absent, blocked,
mismatched, incomplete, duplicate, or unexpected provenance.

Keep this rich provenance coordinator-only. Evaluator-facing artifact content must use
neutral source IDs and freshness classes and cannot contain path, provider, model,
timing, token-use, or cost metadata. `assemble-blind` reads only the frozen regular-
file allowlist, completes normalized leak scanning across the full set, then atomically
publishes an immutable presentation packet. It never recursively copies an artifact
directory. Full source URLs and provider records remain available for the audit after
both human blind scores are fixed.

It does not authorize that runner, unlock a vault, or treat a provider's availability
as completion. Preserve provider errors as provenance; do not replace them with a
zero-cost or successful result.

### Authorized producer

`scripts/eval/baseline-live-runner.mjs` is the separately authorized producer. It
verifies the frozen lock and input hashes again before invoking an injected adapter.
Its built-in CLI adapters do not read environment variables, call `zsvault`, extract
OAuth credentials, or initiate provider requests:

- Path A adapts an already completed and fully approved `evidence-gated-v2`
  `sites/<sourceRunId>/` plus a separately captured complete provider trace.
- Path B creates a credential-free request for the user-controlled authenticated MCP
  session, then imports the returned handoff. This keeps Refero OAuth inside that
  session instead of exporting it to Node.

Every publish requires a regular JSON authorization file such as:

```json
{
  "schemaVersion": 1,
  "scope": "one-box-frozen-baseline-live-runner",
  "runId": "fiber-refero-v2",
  "pathIds": ["path-a", "path-b"],
  "liveExecutionApproved": true,
  "approvedBy": "Devin",
  "approvedAt": "2026-08-13T20:00:00.000Z",
  "maxCostUsd": 3,
  "allowPaidFallback": false
}
```

The approval time must precede the trace start. `maxCostUsd` is a hard recorded-cost
ceiling, and `allowPaidFallback` is always explicit. A credential's presence is not
authorization. The trace must record the producing commit, exact prompts, models,
every tool call (including failures), sources, metered calls, timestamps, hashes, and
repair rounds. A completed Path A trace must also name every model slug persisted by
the source run.

Prepare and publish Path A:

```sh
npm run eval:baseline:prepare -- --run-id fiber-refero-v2 --seed review-2026-08-13
npm run eval:baseline:live -- publish-path-a \
  --run-id fiber-refero-v2 \
  --source-run-id CURRENT_PIPELINE_RUN_ID \
  --trace /absolute/path/to/path-a-trace.json \
  --authorization-file /absolute/path/to/live-authorization.json
```

Create the Path B request, use it in the authenticated Refero MCP session, and import
the response:

```sh
npm run eval:baseline:request-path-b -- \
  --run-id fiber-refero-v2 \
  --source-commit COMMIT \
  --out /absolute/path/to/path-b-request.json

npm run eval:baseline:live -- publish-path-b \
  --run-id fiber-refero-v2 \
  --handoff /absolute/path/to/path-b-handoff.json \
  --authorization-file /absolute/path/to/live-authorization.json
```

The handoff is bound to the prepared run-manifest, frozen contract, frozen brief, and
the current downstream builder/evidence/gate hashes. It maps exactly the thirteen
presentation filenames to regular, size-bounded files beneath the handoff directory
and includes the complete Path B trace. The producer neutralizes presentation copies,
keeps complete identity/cost/tool provenance coordinator-side, validates passing
desktop/tablet/mobile evidence, and atomically creates exactly fourteen files under
`artifacts/path-a/` or `artifacts/path-b/`. A partial, leaking, mismatched, over-budget,
symlinked, or pre-existing output fails closed and is never replaced.

The v2 evaluator packet is suitable for screenshot-led blind scoring. Its copied
`site/index.html` and `site/styles.css` are source-inspection evidence, not a
self-contained runnable site bundle: linked CSS/assets outside that two-file contract
are intentionally absent. A future contract version must enumerate every linked
dependency before claiming standalone rendering from the packet.

## Blind scoring and unblinding

Once a separately approved runner has supplied both real artifact sets, assemble a
blinded presentation packet:

```sh
node scripts/eval/baseline-harness.mjs assemble-blind --run-id fiber-refero-v2
node scripts/eval/baseline-harness.mjs score-template --run-id fiber-refero-v2 --evaluator-slot 1
node scripts/eval/baseline-harness.mjs score-template --run-id fiber-refero-v2 --evaluator-slot 2
```

Give only `presentation/` and one evaluator-specific template to each evaluator. Both
evaluators independently fill each score from 0 to 4, cite evidence, provide distinct
IDs and names, supply timestamps, and attest that scoring was blind. Each score file
is bound to the current packet hash. Then a coordinator may run:

```sh
node scripts/eval/baseline-harness.mjs unblind --run-id fiber-refero-v2 \
  --scores-a /absolute/path/to/evaluator-1.json \
  --scores-b /absolute/path/to/evaluator-2.json
```

Unblinding revalidates source provenance, current packet hashes, the presentation
allowlist, non-symlink files, and the full leak scan. It is blocked until both complete
artifact sets and both distinct human score files validate. The result is written
atomically once and cannot be overwritten. It is an audited score aggregation only;
it does not change model routing or declare a root cause. Those decisions remain
governed by the frozen rubric and the independent quality audit.

Historical `docs/eval/ab/` material remains historical evidence only. It is neither
input nor a result of this two-path controlled comparison.
