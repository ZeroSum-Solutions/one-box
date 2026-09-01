# OBX-P180 T04 solo authorization and activation design

This document explains the exact machine record `OBX-AUTH-P180-T04-SOLO-001`.
The scoped registry and deterministic verifier are the authority; this prose adds
none. The wider `OBX-P180` operating environment remains proposed.

## Identity, predecessor, and interval

- Owner/risk owner: Devin Wiggins (`person:devin-wiggins`).
- Controller: `agent:codex-gpt-5.6-sol-ultra:obx-p180-controller`.
- Reserved claimant: `agent:codex-gpt-5.6-sol-ultra:obx-p180-t04-implementer`.
- Goal run/lane/sequence: `obx-p180-t03-t05-offline-wave` / `T04` / `1`.
- Branch: `feat/obx-p180-t03-t05-offline-wave`.
- Base commit/tree: `62b7b749f37ad9a1b8d9cc2a9a45f6062f59bbf1` /
  `6c79e9c0eb6b42fd5f4835362a7d31821d91654b`.
- Inclusive `notBefore`: `2026-09-01T02:05:00.000Z`.
- Exclusive `expiresAt`: `2026-09-15T02:05:00.000Z`.
- Exact duration `1209600000` ms / 336 hours; zero skew; nonrenewable.

The hash-covered state is directly `RESERVED` for that tuple. There is no generic,
transferable, or renewable grant. T02 completion is evidence only. The record pins
checkpoint self-hash `1378a9a7f158658d197362c99ffc7890d8abe7c6371ecee74a6914afca83aabe`,
owner-receipt self-hash `eb00341ec8c9798dffcbe172bd6d5e5377b22d585b8068607a1d67d89bb5eed8`,
and T02 implementation `514d10d1b61e3332acb27e302adc20f353b64315` with the six stored hashes.
The owner receipt is single-use for exactly the disjoint T03/T04 pair.

Its separate derived-governance clause permits only the verifier-derived
authority-manifest `/packetDigest` refresh and the exact integrity receipt at
`docs/audits/evidence/security/2026-08-31-obx-p180-source-adoption-authority-repin.json`.
That receipt is required T04 evidence and one of the 16 non-self Phase 0A security
targets. It grants no implementation, runtime, provider, dependency, activation,
completion, or source-adoption-artifact authority.

## Exact T04 boundary

Allowed paths, in order:

```text
src/lib/operatingEnvironment/budget.ts
src/lib/operatingEnvironment/budget.test.ts
src/lib/operatingEnvironment/capacity.ts
src/lib/operatingEnvironment/capacity.test.ts
src/lib/operatingEnvironment/compare.ts
src/lib/operatingEnvironment/compare.test.ts
src/lib/operatingEnvironment/fixtures/budget-capacity-v1.json
```

Only effect:

```text
add-provider-offline-in-memory-budget-capacity-compare-reducers
```

Required roles are `implementation-lead`, `budget-operations-owner`,
`job-sandbox-owner`, and `evaluation-owner`. Each is truthfully `NOT_AVAILABLE`;
Devin accepts the exact MEDIUM solo-separation risk without satisfying, waiving, or
generalizing the ordinary control.

All unlisted paths/effects are denied: provider/model calls, spending, provider usage
trust, network, credentials/environment, implementation-module filesystem/shell I/O,
persistence/durable claims, workers/queues, browser/UI/collaboration,
product-runtime imports, Canvas/Page IR access/mutation, dependencies/lockfiles,
mutable globals, implicit clock/randomness, automatic winner/default/apply,
deployment/release, inference/product-data transfer, T03/T05-T08 authority,
independent-human-review claims, and production readiness.

## Activation, sibling leases, and derived abort

Phase 0A validates this record while both activation receipts are absent. Claim
validation must fail `ACTIVATION_RECEIPT_MISSING` until the controller creates the
exact T03 and T04 activation receipts at:

```text
docs/audits/evidence/goal/2026-08-31-obx-p180-t03-activation-receipt.json
docs/audits/evidence/goal/2026-08-31-obx-p180-t04-activation-receipt.json
```

The receipts are self-hashed and bind their exact grant/reservation plus the same
real Phase 0A `H1/T1`, exact two-path activation write set, and persisted canonical
UTC-millisecond observation inside the lower-inclusive/upper-exclusive interval.
They never contain a self-referential H2 placeholder. The synchronous controller
commit yields the sole frozen `H2/T2`; H1 is its activation parent and the diff is
exactly the two receipt paths.

Any later HEAD/tree movement produces `ABORTED_DERIVED` and nonzero claim validation,
without repository invalidation writes or automatic replacement, rebaseline, retry,
amend, rebase, or reset. Diagnostics are controller-only under external
`reports/abort/` and are never evidence.

T03/T04 implementation, activation, and completion path sets are pairwise disjoint.
Workers never stage, commit, write controller proof state, or advance HEAD. Lease
release requires terminal report plus completed task status; premature release fails,
duplicate valid release is idempotent, and controller staging requires both releases.

## Completion and proof registry

The sole completion output location is:

```text
docs/audits/evidence/goal/2026-08-31-obx-p180-t04-completion-receipt.json
```

Presence alone does not consume. Only schema-valid, self-hash-valid content bound to
the authorization and activation IDs/hashes, exact implementation commit/tree/path
hashes, ordered controller proof tuples, and registry head can derive
`COMPLETED_VERIFIED` and `CONSUMED`. Empty, malformed, unrelated, alternate-path, or
replayed content fails; a consumed reservation returns
`AUTHORIZATION_ALREADY_CONSUMED`.

The external goal-state root and `proof/` are real owner-matching nonsymlinked 0700
directories. Registry, lock, and envelopes are contained real owner-matching
nonsymlinked 0600 regular files. Permission, owner, type, symlink, or realpath drift
fails. Proof and abort namespaces are disjoint; diagnostics are not evidence.

Every controller acceptance command runs after both workers stop. Its immutable
envelope binds exact authorization and activation IDs/self-hashes, lane, command ID,
canonical controller `startedAt`/`finishedAt`, exit code, and bounded output digest;
the full interval satisfies `notBefore <= startedAt <= finishedAt < expiresAt`.
Worker timestamps cannot qualify.

Before consumption, each envelope is registered in the append-only newline-terminated
`proof/controller-proof-registry.jsonl`. The controller holds an exclusive `O_EXCL`
0600 lock while it validates chain/paths/modes/owner, executes one command,
writes+fsyncs one immutable envelope, appends+fsyncs one canonical monotonic entry,
revalidates, and removes the lock. Genesis previous digest is 64 zeroes. A stale or
concurrent lock, crash gap, torn tail, missing envelope/entry, sequence duplicate,
insertion/removal/reorder, chain mismatch, cross-authorization binding, or
cross-activation binding stops without truncate, repair, or retry. Completion binds
ordered `(sequence, envelope digest, authorization ID/hash, activation ID/hash)`
tuples and the final chain digest.

Required T04 evidence covers safe-integer worst case, hierarchy/rate-window CAS,
atomic aggregate reserve, ambiguous holds, attach-only usage and side-effect-aware
retry denial; bounded fair queues, lease replay, active-turn protection, claimed
holds, unique ticket removal and immutable routes; exactly two fairness-bound
evidence-only arms, aggregate reserve, third-arm/context-drift rejection, full
settlement, and no winner/default/apply. It also includes RED/GREEN proof, integrated
operating-environment tests, source adoption, typecheck, focused lint, plan gates,
exact census, dependency diff, forbidden-effect/import scan, and secrets scan.

## Review and invalidators

Exact quick review is `z-ai/glm-5.3-flash` on the approved prepaid route. Exact final
source review is `anthropic/claude-opus-5` through Claude Max OAuth. Reviews are
advisory and any target change invalidates the receipt.

Invalidators cover identity, self-hash, predecessor, owner receipt, sibling pair,
path/effect/role/risk/dependency/time drift; plus/minus-one duration or boundary
errors; malformed or replayed activation/completion; H1/T1/H2/T2 movement; premature
lease release; proof containment/mode/owner/type/symlink/lock/tail/chain/registration
failure; cross-grant substitution; command crossing expiry; forbidden effect; gate
failure; extra unaccepted finding; or authority/readiness claim outside this record.
