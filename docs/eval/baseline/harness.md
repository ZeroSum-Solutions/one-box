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

This writes `docs/eval/baseline/runs/fiber-refero-v1/`. Both paths are explicitly
`BLOCKED` because the offline harness cannot attest Refero OAuth or ZS Vault access
and is forbidden to run providers. The run manifest preserves the contract hash,
input hashes, seed, and randomized blind presentation order. The separately stored
`unblinding.json` must not be given to evaluators.

## Live boundary and provenance

An approved live runner may place actual outputs in `artifacts/path-a/` and
`artifacts/path-b/` beneath that run. Each path needs every file listed in the frozen
contract. `provenance.json` must identify the exact path, mark itself `completed`,
bind the run-manifest SHA-256, record prompts/models/tool calls/source records/output
hashes, and state `meteredCalls: []` when no metered calls occurred. The harness
rejects absent, blocked, or mismatched provenance.

Keep this rich provenance coordinator-only. Evaluator-facing artifact content must use
neutral source IDs and cannot contain a path label, provider, model, timing, or cost.
`assemble-blind` excludes provenance and rejects the frozen contract's producer-
identity terms in presentation files. Full source URLs and provider records remain
available for the audit after the human blind score is fixed.

It does not authorize that runner, unlock a vault, or treat a provider's availability
as completion. Preserve provider errors as provenance; do not replace them with a
zero-cost or successful result.

## Blind scoring and unblinding

Once a separately approved runner has supplied both real artifact sets, assemble a
blinded presentation packet:

```sh
node scripts/eval/baseline-harness.mjs assemble-blind --run-id fiber-refero-v1
node scripts/eval/baseline-harness.mjs score-template --run-id fiber-refero-v1
```

Give only `presentation/` and `scores.template.json` to the evaluator. The evaluator
fills each score from 0 to 4, cites evidence, names themselves, supplies a timestamp,
and attests that scoring was blind. Then a coordinator may run:

```sh
node scripts/eval/baseline-harness.mjs unblind --run-id fiber-refero-v1 \
  --scores /absolute/path/to/completed-scores.json
```

Unblinding is blocked until both complete artifact sets and all human scores validate.
The resulting record is an audited score aggregation only; it does not change model
routing or declare a root cause. Those decisions remain governed by the frozen rubric
and the independent quality audit.

Historical `docs/eval/ab/` material remains historical evidence only. It is neither
input nor a result of this two-path controlled comparison.
