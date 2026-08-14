# Model benchmark coordinator

`scripts/eval/model-benchmark.mjs` materializes and verifies the blinded rounds
pre-registered in `benchmark-plan.md`. It does not select credentials or call a
provider directly. The CLI accepts only
`scripts/eval/model-provider-adapter.mjs`; tests may inject an in-process adapter.

## Round configuration

Prepare takes a JSON config with `fixtures`, `candidates`, and one fixed
`protocol`. Fixture files must be bounded regular files under
`docs/eval/model-routing/fixtures/`; realpath and stable file-descriptor checks
reject symlink and read-race escapes.

Each candidate records `id`, `displayName`, exact `modelSlug`, `provider`,
`modelFamily`, `effort`, `pricingSnapshot`, `contextLimit`, `toolSupport`,
`blindAliases`, and `accessLane` (`subscription` or `metered`). Subscription lanes
are labeled subscription with marginal API cost not applicable, never free.

The protocol freezes `timeLimitMs`, `toolPolicy`, `perTaskCapUsd`, and
`maxRepairRounds`. Metered candidates additionally require a frozen
`meteredAuthorization` covering exact candidates, fixtures, repair rounds, and an
aggregate USD cap. Every metered run also requires `--allow-metered`; both checks
happen before the adapter is called. Above-cap failures preserve reported spend.

The current qualification config registers tasks 4, 5, 8, and 9 and repair round
zero only. A missing Luna entitlement is recorded as unauthenticated without a
fallback or relabel.

## Commands

```bash
npm run eval:model-benchmark -- prepare \
  --round-id <round-id> \
  --config docs/eval/model-routing/configs/qualification-stratified-v1.json

npm run eval:model-benchmark -- run \
  --round-id <round-id> --candidate <candidate-id> \
  --fixture <fixture-id> --repair-round 0 \
  --adapter scripts/eval/model-provider-adapter.mjs [--allow-metered]

npm run eval:model-benchmark -- accept \
  --round-id <round-id> --candidate <candidate-id> \
  --fixture <fixture-id> --repair-round 0 --record <acceptance.json>

npm run eval:model-benchmark -- assemble --round-id <round-id>

npm run eval:model-benchmark -- score-template \
  --round-id <round-id> --evaluator-slot 1 --out <score-1.json>
npm run eval:model-benchmark -- score-template \
  --round-id <round-id> --evaluator-slot 2 --out <score-2.json>

npm run eval:model-benchmark -- unblind \
  --round-id <round-id> --score <score-1.json> --score <score-2.json> \
  [--judge <judge-score.json>]

npm run eval:model-benchmark -- verify --round-id <round-id> --complete
```

The shell brackets above denote an optional argument; do not type the brackets.

## Acceptance authority

Producer acceptance fields are retained as claims but cannot pass a threshold.
The `accept` command stores an immutable independent record bound to the exact
round, event, and artifact set. Mechanical and seeded-review rows remain
promotion-ineligible until a coordinator-owned adapter executes a registered,
hashed validator or seeded oracle. Caller-supplied pass/count records cannot stand
in for that execution. The current qualification fixtures do not yet register
those authorities, so their outputs are advisory rather than a routing-policy
result.

Repair rounds are sequential. The shipped provider adapter rejects repair attempts
until the coordinator can supply a bounded prior-artifact and independent-failure
packet; the current qualification config therefore permits only round zero.

## Provider boundary

The Codex subscription adapter runs with a private mode-0700 HOME, CODEX_HOME, and
working directory containing only an opaque copy of the configured OAuth file. It
ignores user rules and disables shell, browser, apps, memory, collaboration, image,
and other dynamic tools. Any unexpected tool event is an automatic rejection.

Current Codex JSONL does not attest the executed model. Successful Sol, Luna, or
Terra outputs are therefore marked `requested-only-unverified` and automatically
promotion-ineligible. OpenRouter outputs require an exact provider-reported model,
provider cost, and the explicit metered authorization gates.

## Blinding and evidence separation

Local round state lives under ignored
`docs/eval/model-routing/runs/<round-id>/`. `prepare` atomically freezes the
manifest, fixture hashes, candidate metadata, policy, event log, and a mode-0600
mapping under `.coordinator/`.

`assemble` closes producer intake and atomically publishes only `blind-packet/`.
Presentation order is derived from random artifact IDs, not candidate order.
Artifacts are bounded UTF-8 text; configured identity aliases and common
evaluator-control instructions are rejected. Never give evaluators the round root
or `.coordinator/`.

Score sheets must bind the exact packet hash and attest that the evaluator received
only the blind packet with no filesystem, coordinator, or provider tools. Two
distinct identities and model families are required. If their totals differ by
more than 15 percent or their preferred artifact differs, a third distinct
judge-of-record score is required before unblinding.

`unblind` atomically publishes `unblind/` with score sheets, mapping, results, and
decision log. `verify --complete` recomputes plan, fixture, attempt, event,
acceptance, packet, score, and result hashes. Missing, skipped, unauthenticated,
timed-out, unverified-model, and failed rows remain failures; none become zero-cost
wins or routing-policy promotions.
