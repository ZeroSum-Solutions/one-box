# Frozen Path A vs Path B evaluation harness

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

## Blind scoring and unblinding

Once a separately approved runner has supplied both real artifact sets, assemble a
blinded presentation packet:

```sh
node scripts/eval/baseline-harness.mjs assemble-blind --run-id fiber-refero-v1
node scripts/eval/baseline-harness.mjs score-template --run-id fiber-refero-v1 --evaluator-slot 1
node scripts/eval/baseline-harness.mjs score-template --run-id fiber-refero-v1 --evaluator-slot 2
```

Give only `presentation/` and one evaluator-specific template to each evaluator. Both
evaluators independently fill each score from 0 to 4, cite evidence, provide distinct
IDs and names, supply timestamps, and attest that scoring was blind. Each score file
is bound to the current packet hash. Then a coordinator may run:

```sh
node scripts/eval/baseline-harness.mjs unblind --run-id fiber-refero-v1 \
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
