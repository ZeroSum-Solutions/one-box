# OBX-P180 T03 solo authorization and activation design

This document explains the exact machine record `OBX-AUTH-P180-T03-SOLO-001`.
The scoped registry and deterministic verifier are the authority; this prose adds
none. The wider `OBX-P180` operating environment remains proposed.

## Identity and fixed interval

- Owner and risk owner: Devin Wiggins (`person:devin-wiggins`).
- Controller: `agent:codex-gpt-5.6-sol-ultra:obx-p180-controller`.
- Reserved claimant: `agent:codex-gpt-5.6-sol-ultra:obx-p180-t03-implementer`.
- Goal run: `obx-p180-t03-t05-offline-wave`; lane `T03`; claim sequence `1`.
- Branch: `feat/obx-p180-t03-t05-offline-wave`.
- Base commit/tree: `62b7b749f37ad9a1b8d9cc2a9a45f6062f59bbf1` /
  `6c79e9c0eb6b42fd5f4835362a7d31821d91654b`.
- `notBefore`: `2026-09-01T02:05:00.000Z` (inclusive).
- `expiresAt`: `2026-09-15T02:05:00.000Z` (exclusive).
- Duration: exactly `1209600000` milliseconds (336 hours), zero clock skew,
  nonrenewable, and no wall-clock substitution for a persisted observation.

The record begins in hash-covered `RESERVED` state for only this tuple. It has no
unreserved, transferable, or renewable state. Duplicate reservation, claimant,
sequence, activation, completion, or reuse fails closed.

## Predecessor and owner decision

T02 completion is evidence, never inherited authority. The grant pins:

- checkpoint `OBX-P180-T02-COMPLETION-001` self-hash
  `1378a9a7f158658d197362c99ffc7890d8abe7c6371ecee74a6914afca83aabe`;
- owner receipt `OBX-P180-T02-OWNER-COMPLETION-001` self-hash
  `eb00341ec8c9798dffcbe172bd6d5e5377b22d585b8068607a1d67d89bb5eed8`;
- implementation commit `514d10d1b61e3332acb27e302adc20f353b64315` and the exact
  six frozen T02 file hashes stored in the checkpoint.

The owner receipt is single-use for exactly the T03/T04 successor pair. Identity
compromise, supersession, checkpoint mismatch, a second conflicting owner receipt,
or successor-pair drift invalidates both successors.

That owner receipt separately authorizes one derived integrity re-pin only: the
verifier-derived authority-manifest `/packetDigest` refresh and the exact receipt
`docs/audits/evidence/security/2026-08-31-obx-p180-source-adoption-authority-repin.json`.
The re-pin is required T03 evidence and one of the 16 non-self Phase 0A security
targets. It grants no implementation, runtime, provider, dependency, activation,
completion, or source-adoption-artifact authority.

## Exact T03 boundary

Allowed paths, in order:

```text
src/lib/operatingEnvironment/skills.ts
src/lib/operatingEnvironment/skills.test.ts
src/lib/operatingEnvironment/context.ts
src/lib/operatingEnvironment/context.test.ts
src/lib/operatingEnvironment/interrupts.ts
src/lib/operatingEnvironment/interrupts.test.ts
src/lib/operatingEnvironment/receipts.ts
src/lib/operatingEnvironment/receipts.test.ts
src/lib/operatingEnvironment/fixtures/security-v1.json
```

Only effect:

```text
add-provider-offline-skill-context-interrupt-receipt-reducers
```

Required roles are `implementation-lead`, `model-skill-security-owner`,
`job-sandbox-owner`, and `data-protection-owner`. All remain truthfully
`NOT_AVAILABLE`; Devin accepts the exact MEDIUM solo-separation risk. The exception
does not satisfy or waive the ordinary controls and cannot become a general waiver.

Every unlisted path/effect is denied, including provider/model calls, network,
credentials/environment, filesystem/shell I/O in implementation modules,
persistence, workers/queues, browser/UI/collaboration, product-runtime imports,
Canvas/Page IR read/write/mutation, dependencies/lockfiles, mutable globals,
implicit clock/randomness, deployment/release, inference/product-data transfer,
T04/T05-T08 authority, independent-human-review claims, or production readiness.

## Two-checkpoint activation

Phase 0A commits the authorization bytes. It does not create either activation
receipt. Record validation passes before activation; claim validation returns
`ACTIVATION_RECEIPT_MISSING` until both exact future receipts exist:

```text
docs/audits/evidence/goal/2026-08-31-obx-p180-t03-activation-receipt.json
docs/audits/evidence/goal/2026-08-31-obx-p180-t04-activation-receipt.json
```

Each self-hashed receipt binds its own authorization ID/hash, the exact reservation,
the same real Phase 0A commit `H1` and tree `T1`, a controller-generated canonical
UTC-millisecond `observedAt`, and the exact two-receipt Phase0A..Phase0B write set.
Both receipts must bind the same H1/T1 and an observation satisfying
`notBefore <= observedAt < expiresAt`. The synchronous controller-only receipt commit
produces the sole frozen worker start `H2/T2`. No receipt embeds H2 and no
self-referential placeholder is allowed.

H2 must have H1 as its sole activation parent and differ from H1 only at the two
receipt paths. Any later HEAD/tree movement derives `ABORTED_DERIVED`, exits nonzero,
and permits no repository invalidation write, replacement, rebaseline, amend,
rebase, reset, or retry. Diagnostics may exist only under external
`reports/abort/`; validators never consume them.

T03 and T04 are disjoint siblings. Their activation and completion output paths are
unique, controller-owned, and outside both implementation sets. Workers never stage,
commit, write goal-state proof, or advance HEAD. A lease release is accepted only
after terminal report plus completed task status; premature release fails and a
duplicate valid release is idempotent. Controller staging requires both releases.

## Controller proof and completion

The only completion output path is:

```text
docs/audits/evidence/goal/2026-08-31-obx-p180-t03-completion-receipt.json
```

Path presence alone changes no state. Empty, malformed, unrelated, alternate-path,
or non-self-hash-valid content fails. Only a valid `COMPLETED_VERIFIED` receipt bound
to the authorization, activation, implementation commit/tree, exact changed paths
and file hashes, and controller proof registry derives `CONSUMED`; reuse then returns
`AUTHORIZATION_ALREADY_CONSUMED`.

Controller proof lives outside the repository under the exact goal-state root.
Root and `proof/` must be real, owner-matching, nonsymlinked mode-0700 directories;
registry, lock, and envelope paths must be real, owner-matching, nonsymlinked
mode-0600 regular files whose realpaths remain contained. Permission, type, owner,
symlink, or realpath drift fails.

Every acceptance command is rerun by the controller only after both workers stop.
Its immutable envelope binds authorization and activation IDs/self-hashes, lane,
stable command ID, canonical controller `startedAt`/`finishedAt`, exit code, and
bounded output digest. The entire command must satisfy
`notBefore <= startedAt <= finishedAt < expiresAt`; worker timestamps are ineligible.

Before use, every envelope is registered in
`proof/controller-proof-registry.jsonl`. Under an exclusive `O_EXCL` 0600 lock, the
controller verifies the newline-terminated append-only chain, executes one command,
writes/fsyncs one immutable envelope, appends/fsyncs one canonical entry, revalidates,
and removes the lock. Entries have monotonic sequence; grant bindings; envelope,
output, previous, and current chain digests; genesis previous digest is 64 zeroes.
Existing/stale lock, crash gap, missing envelope/entry, torn tail, duplicate,
insertion, removal, reorder, or chain mismatch stops without truncate, repair, or
automatic retry. The completion receipt binds ordered grant-bound envelope tuples and
the final registry digest; cross-authorization or cross-activation substitution fails.

Required completion evidence includes RED/GREEN tests for the closed slash grammar,
actor control, reserved names, kill/owner/expiry, permission intersection, replay and
authority denial; deterministic context uniqueness/order/freshness/caps/injection;
single immutable interrupt and CAS decision slot; one receipt owner, acyclic
supplemental graph, completed-attempt-only review, stale/failed/compare rejection,
direct completed/cancelled terminal, and no Page IR apply; plus source adoption,
typecheck, focused lint, plan verification/tests, exact census, dependency diff,
forbidden-effect/import scan, and secrets scan.

## Review and invalidation

Quick audit is exact `z-ai/glm-5.3-flash` on the approved prepaid route. Final source
audit is exact `anthropic/claude-opus-5` through Claude Max OAuth. Both are advisory;
deterministic evidence controls. Any reviewed-target change invalidates its receipt.

Invalidators include every identity/hash/path/effect/role/dependency/predecessor/time
drift; activation or completion schema/self-hash/binding drift; sibling overlap;
claimant/sequence/replay; H1/T1 or frozen H2/T2 mismatch; premature lease release;
proof-registry containment/mode/owner/type/symlink/lock/tail/chain failure; command
crossing expiry; unregistered or cross-grant envelope; forbidden effect; gate failure;
additional unaccepted finding; or authority/readiness claim outside this record.
