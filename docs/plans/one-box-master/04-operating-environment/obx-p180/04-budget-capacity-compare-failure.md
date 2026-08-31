# OBX-P180 Step 4: Budget, capacity, compare, and failure contracts

- Packet: `OBX-P180`
- Step: 4 of 7
- Status: proposed contract; implementation not authorized
- Depends on: Steps 1 through 3 exact-Grok CLEAN
- Governing requirements: `P180-R008` through `P180-R011`

## Boundary

This step closes cost authority, capacity admission, two-arm compare, retry, and
failure ownership for a future compatibility slice. The first proposed slice remains
provider-offline and uses synthetic units. Nothing here authorizes spending, a
provider call, credential access, persistence, scheduling, collaboration, Page IR
mutation, deployment, or release.

All records use Step 2 canonical JSON, closed schemas, unknown-field rejection, and
self-hash rules. Money uses integer minor units and an ISO 4217 currency; durations,
tokens, bytes, calls, and capacity use non-negative integers with named units. No
floating-point value is valid in an authority or receipt record.

## Authority hierarchy and zero implicit budget

Paid, subscription, and synthetic work all require an admitted `BudgetPolicyV1`:

```text
BudgetPolicyV1 = {
  schemaVersion: "budget-policy-v1",
  budgetPolicyId,
  agencyScopeId,
  projectScopeId,
  assignmentScopeId,
  ownerAssignmentRefs[],
  fundingClass: "metered" | "subscription" | "synthetic",
  currency?,
  caps: {
    currencyMinorUnits?, inputTokens, outputTokens, totalTokens,
    toolCalls, outputBytes, wallTimeMs, attempts,
    compareArms, reviewerRuns, concurrentSegments
  },
  routePolicyAllowlist[],
  pricePolicyHash?,
  capacityPolicyHash,
  effectiveAt,
  expiresAt,
  killSwitchRef,
  policyHash
}
```

Validation rules:

- at least one current, unexpired, unrevoked budget/operations owner is required;
- omission of a cap means zero, not unlimited or inherited;
- the effective cap is the minimum remaining allowance across agency, project,
  assignment, compare parent, segment, retry, and reviewer scopes;
- a metered policy requires one currency and a current Step 2 pricing snapshot;
- subscription work records subscription capacity and rate limits, never a fabricated
  zero price; synthetic policy cannot be used for a provider-connected route;
- price, cap, owner, route allowlist, expiry, or kill-switch mismatch blocks before
  reservation and emits no provider attempt;
- only an accepted owner-authored policy revision can increase a cap. Models,
  providers, skills, workers, drivers, usage reports, retries, and compare selection
  cannot create, transfer, or enlarge budget authority.

## Deterministic worst-case forecast

`CostForecastV1` binds the exact route intent, pricing snapshot, context/input upper
bounds, declared output/tool maxima, `maxAttempts`, compare-arm count, evaluator and
reviewer runs, minimum charges, pricing tiers, taxes/fees, and a closed arithmetic
policy hash. It contains both the per-attempt bound and aggregate worst-case bound.

For metered routes the forecast is the maximum charge reachable under the immutable
intent, including the permitted retry. Long-context tiers are selected from declared
maximum input, never an optimistic estimate. Unknown units, overlapping tiers,
expired prices, ambiguous currency, negative values, integer overflow, or a provider
price that cannot bound the maximum makes the route unavailable.

For subscriptions, the forecast declares the exact subscription lane, concurrency,
request/token windows, known rate limits, review labor, and failure-attempt capacity.
Unknown subscription capacity is unavailable, not free. Provider-offline fixtures
use a named synthetic-unit policy and cannot satisfy metered/subscription admission.

## Atomic hierarchical reservation

```text
BudgetReservationV1 = {
  schemaVersion: "budget-reservation-v1",
  reservationId,
  jobId,
  segmentId?,
  compareId?,
  routeIntentHashes[],
  budgetPolicyHashes[],
  costForecastHashes[],
  reservedAmountsByScope[],
  state: "held" | "settled" | "released" | "reconciliation-hold",
  stateRevision,
  reservedAt,
  expiresAt,
  settledAt?,
  reservationHash
}
```

The control plane atomically checks and holds the full aggregate worst case against
every hierarchy level before it creates a Step 2 dispatch manifest. A compare parent
reserves both arms, every allowed retry, the deterministic evaluator, and declared
human-review allowance as one transaction. Partial reservations roll back; an arm
cannot dispatch against only its individual balance.

`BudgetBalanceStateV1` is the closed CAS record for each agency, project,
assignment, compare, segment, retry, and reviewer scope. It binds the policy hash,
scope ID/type, integer limit, held/settled/released totals, remaining amount, state
revision, prior-state hash, update time, and state hash. Reservation is one
transaction that compares and decrements every applicable balance revision and
inserts the held reservation, or changes nothing. A reservation-row CAS without all
balance CASes is invalid, so concurrent jobs cannot spend the same observed balance.
Every reserve, settle, release, reconciliation-hold, and owner-reconcile CAS enforces
`remaining >= 0`, `held >= 0`, `settled >= 0`, and
`remaining + held + settled = limit`. `released` is a flow counter only. Amounts in a
reservation `reconciliation-hold` remain in balance-state `held`, unavailable to any
other reservation, until D7 resolves them. Overflow, equality break, or double
release rejects the whole transaction.

The reservation is immutable except for CAS state transitions:

```text
held -> settled | released | reconciliation-hold
reconciliation-hold -> settled | released
settled | released -> no transition
```

`held` is required at dispatch and must outlive the route deadline plus the bounded
reconciliation window. Cancellation before a provably absent dispatch releases the
unused amount through D1 before claim or D1C after claim. Fixture/control-plane proof of non-dispatch, or a named owner's
schema-valid reconciliation evidence, settles known usage and releases the proven
unused remainder. Ambiguous
dispatch or billing moves the full unresolved amount to `reconciliation-hold`; it
cannot fund another segment until a named owner records external evidence and a CAS
settlement. Expiry never silently releases an ambiguous hold.

Every amount movement emits an immutable `BudgetLedgerEventV1` with reservation,
scope, event class, integer amount/unit, previous and next state revisions, evidence
hashes, actor/control-plane identity, timestamp, and event hash. The closed event
classes are `reserve`, `settle-known`, `release-unused`, `hold-ambiguous`, and
`owner-reconcile`. There is no generic adjustment event.

## Usage reconciliation and budget receipts

`UsageObservationV1` distinguishes `fixture`, `driver`, `provider`, and `owner`
sources and binds the exact attempt, reported units, currency, provider/model
identity, billing state, raw-evidence reference policy, observation time, and hash.
Provider and driver observations are attach-only untrusted reconciliation evidence.
They never justify `settle-known` or `release-unused`, whether reported units are
lower, equal, or higher than reserve, and cannot change reservation, ledger, route,
or terminal outcome. Provider-sourced under-reporting, absent final usage, or
unverifiable billing moves the full unresolved amount to `reconciliation-hold`.
Only fixture/control-plane proof of non-dispatch or `owner-reconcile` may reduce it.

`BudgetReceiptV1` binds the policy, forecast, reservation, all ledger events, all
attempt observations, priced known usage, unresolved amount, released amount,
hierarchy balances after CAS, reconciliation owner/deadline when held, terminal
status, and receipt hash. Closed terminal statuses are `settled`, `released`, and
`reconciliation-required`. Arithmetic must reproduce exactly from bound records.
Over-reporting above reserve is a blocking `budget-breach` incident; it never creates
retroactive authority. Under-reporting or absent final usage keeps the conservative
amount held until the bounded policy resolves it.

## Capacity admission and queues

```text
CapacityPolicyV1 = {
  schemaVersion: "capacity-policy-v1",
  capacityPolicyId,
  providerEntryHash,
  exactModelIdentity,
  admittedRegions[],
  fundingClasses[],
  maximumConcurrentSegments,
  maximumQueueDepth,
  maximumQueueWaitMs,
  rateWindows[],
  projectFairShareWeights[],
  priorityClasses[],
  ownerAssignmentRefs[],
  killSwitchRef,
  effectiveAt,
  expiresAt,
  policyHash
}
```

`CapacityObservationV1` is a time-bounded snapshot of admitted region, available
concurrency, rate-window remainder, queue depth, source, observed/expiry times, and
hash. A provider report is observational, not admission authority. A snapshot with
unknown, stale, mismatched, or noncompliant region/capacity cannot admit dispatch.

`CapacityBalanceStateV1` is the authoritative CAS record for concurrency slots and
each rate window. It binds policy/region/window identity, integer limit, claimed and
remaining tokens, window interval, state revision, prior-state hash, and state hash.
`QueueStateV1` separately binds policy/route/priority class, integer maximum/current
depth, ordered ticket IDs, revision, prior-state hash, and state hash.
`offered -> queued` atomically increments queue depth and inserts one unique ticket
only when current depth is below the maximum and the deadline still survives
`maximumQueueWaitMs`; otherwise it CASes to `cancelled` with no-dispatch proof.
`queued -> claimed|expired|cancelled` atomically removes that exact ticket and
decrements depth once. `offered -> claimed|expired|cancelled` never changes depth
because it inserted no ticket. Capacity observations cannot increment or decrement
queue depth.

Lease claim is one transaction that verifies the reservation remains `held` and all
hierarchy balance revisions/hashes are unchanged, with zero hierarchy amount
movement. It mutates only applicable rate-window remaining, the capacity slot, queue
ticket removal when present, lease state, and attempt claim; otherwise every change
rolls back. Hierarchy amounts change only on initial reserve and final settlement/
release/hold. An observation alone never spends capacity.

`CapacityLeaseV1` binds one immutable segment manifest, one reservation, exact
policy/observation, admitted region, queue ticket if any, lease interval, state
revision, and hash. The control plane alone grants it. Its CAS states are:

```text
offered -> queued | claimed | expired | cancelled
queued -> claimed | expired | cancelled
claimed -> released | reconciliation-hold
reconciliation-hold -> released
expired | cancelled | released -> no transition
```

A segment dispatches only while its budget reservation is `held` and capacity lease
is atomically `claimed`. Lease replay attaches to the existing segment; it cannot
consume a second slot. `offered|queued -> expired` proves no claim/dispatch and must
release the applicable unclaimed allocation in the same CAS. A claimed lease never expires into reusable
capacity: only a provable terminal **segment** state may release it. Attempt
completion alone never releases capacity. In-flight/ambiguous or retryable-failure
attempts, an already-reserved same-route retry, and proposal-HITL interruption keep
the same lease claimed; uncertain dispatch moves it to `reconciliation-hold`. No
retry or interrupt consumes a second slot. Named reconciliation evidence is required
before held capacity returns to the pool. `claimed -> released` requires the hash of
a schema-valid terminal segment receipt
(`completed|failed|cancelled|rejected|budget-exhausted`). A lease
`reconciliation-hold -> released` is legal only through D7 with bound terminal hashes
and `owner-reconcile` evidence. Owner reconciliation cannot release capacity while
the segment remains non-terminal.

Queues are bounded and deterministic: policy priority first, then weighted project
fair share, then reservation timestamp and segment ID as tie-breakers. Neither a
model nor a user payload sets priority. Queue pressure can wait, expire, reject, or
cancel; it cannot change provider, model, effort, region, privacy, retention, tools,
budget, or output contract. A route whose deadline cannot survive the maximum queue
wait is rejected before queueing. Killing a route stops new claims and cancels queued
leases without discarding held-budget or receipt evidence.

## Compare contract

The first contract permits zero or exactly two arms. Compare is an evaluation aid,
not an implicit route, fallback, majority vote, or apply authority.

```text
CompareIntentV1 = {
  schemaVersion: "compare-intent-v1",
  compareId,
  jobId,
  actorId,
  projectId,
  taskHash,
  contextBundleHash,
  skillSetHash,
  toolGrantHash,
  outputContractHash,
  evaluationFixtureHash,
  armRouteIntentHashes[2],
  armLabels[2],
  deadline,
  createdAt,
  intentHash
}
```

Both arm intents must bind the same job, task, context, skill set, tool grant, output
contract, evaluation fixture, expected project/candidate state, and deadline. They
may differ only in declared provider entry, exact model entry, effort, and the price/
capacity/region fields necessarily resolved by those routes. Arm labels are opaque
and randomized for evaluators; provider/model marketing names do not enter scoring.

`CompareManifestV1` binds the intent, exactly two arm manifests, the one aggregate
budget reservation, per-arm capacity requirements, evaluator policy, cancellation
policy, and manifest hash. Both worst cases must fit before either arm dispatches.
Capacity may queue the arms separately, but evaluation cannot claim simultaneous-
start fairness; receipts record dispatch and completion skew.

The one compare-parent reservation remains `held` until its full reserved-component
terminal set exists. Each
arm may append usage/hold observations and non-restoring `ArmCostAnnotationV1`
evidence, but cannot emit a parent ledger amount movement or mutate any hierarchy
remaining/held balance. An ambiguous arm does not block an
already-admitted sibling from using its reserved share and cannot release that
sibling's share. The set contains both arm terminal hashes plus terminal-or-proven-
unused hashes for every allowed retry, evaluator run, and declared reviewer run.
Only then does one parent CAS settle/release all proven amounts or move the unresolved
aggregate to `reconciliation-hold`. That CAS is
the single transaction that emits `settle-known`, `release-unused`, and/or
`hold-ambiguous` movements across every hierarchy scope. It enforces
`remaining >= 0`, `held >= 0`, `settled >= 0`, and the stock identity
`remaining + held + settled = limit`; `released` is a flow counter, not another
stock. Any movement that breaks equality, overflows, or double-releases is rejected.

Unused reserved components require a closed control-plane record:

```text
UnusedCompareComponentProofV1 = {
  schemaVersion: "unused-compare-component-proof-v1",
  compareIntentHash,
  compareManifestHash,
  budgetReservationId,
  componentType: "retry" | "evaluator" | "reviewer",
  componentId,
  reason: "not-dispatched" | "ineligible" | "parent-cancelled",
  noDispatchEvidenceHash,
  priorComponentStateRevision,
  terminalComponentStateHash,
  issuedBy: "one-box-control-plane",
  issuedAt,
  proofHash
}
```

Proof issuance is one control-plane compare-safe D6U CAS: it compares the component
attempt/lease revision, writes a terminal no-dispatch state, and when a lease exists
moves `offered|queued -> cancelled|expired` without changing the compare parent or
hierarchy amounts. A later claim against that terminal revision rejects. The proof is
invalid after any claim/dispatch and cannot be authored by an arm, evaluator,
reviewer, model, provider, or owner. Missing optional `evaluatorReceiptHash` is not a
proof.

Each arm is an ordinary Step 2 route segment with its own attempts, segment receipt,
usage, and capacity receipt. Parent cancellation cancels both. One arm failure never
causes route substitution, retry of the other arm, or winner selection. The compare
settles only after both arms are terminal. Parent deadline/cancellation may only
drive each arm toward terminal through that arm's segment/lease CAS; hierarchy
amounts and the parent reservation remain unchanged until the full reserved-component
terminal set exists and D6 performs the single aggregate CAS. Every compare-arm segment receipt and proposal is
marked `compare-evidence-only` and is not Step 3 apply-eligible, even when its arm is
completed. It cannot enter Page IR apply, mutation, risk acceptance, authority grant,
release, or default-route promotion.

```text
CompareReceiptV1 = {
  schemaVersion: "compare-receipt-v1",
  compareId,
  compareIntentHash,
  compareManifestHash,
  armSegmentReceiptHashes[2],
  budgetReceiptHash,
  capacityReceiptHashes[2],
  evaluatorReceiptHash?,
  result: "both-complete" | "partial" | "both-failed" | "cancelled" |
    "evaluation-rejected",
  dispatchSkewMs?,
  completionSkewMs?,
  endedAt,
  receiptHash
}
```

The deterministic evaluator runs only when both outputs meet the identical declared
schema. A partial result records failure and may be shown side by side, but it has no
machine winner. A score, model confidence, lower price, faster completion, or single
successful arm cannot auto-apply, alter Page IR, approve risk, grant authority, or
become the future default route. Any human preference is a separate non-authorizing
decision record bound to the compare receipt and stale-safe expected source hash.
That decision remains non-authorizing. If the actor wants to pursue an arm's proposal,
the control plane must open a fresh explicit non-compare segment that revalidates the
selected artifact, current target state, route, context, skill/tool grants, budget,
and all existing guarded apply prerequisites. The compare receipt itself never
supplies apply authority.

## Retry, failure, and stop-work ownership

Step 2's same-route retry remains the only retry: attempt index one, at most once,
under the already-reserved maximum, after a classified transient failure with known
billing and no usable output. Compare does not multiply this rule or turn a failed
arm into a third arm. Any provider/model/effort change is a new actor/operator-chosen
segment with fresh validation and reserve.

Every role in this table is an exact `OwnerAssignmentV1` role proposed in Step 6.
`Evaluation Owner` and `Budget/Operations Owner` are distinct closed role IDs and
must each have at least one current, unexpired, unrevoked named human before their
associated policy or reconciliation path is valid.

Except for the compare-specific row, every reservation transition below applies to
a non-compare segment reservation. Per-arm conditions never transition the compare
parent or hierarchy balances; the parent follows only the full-component-terminal CAS
above. `terminal receipt` always means a schema-valid terminal segment receipt hash.

Closed disposition codes remove ambiguous words such as "hold" or
"settle/release":

| Code | Exact reservation state | Exact lease state | Required proof |
|---|---|---|---|
| `D0` | no reservation exists | no lease exists | rejection precedes reservation |
| `D1` | `held -> released` | `offered|queued -> cancelled|expired` | no-dispatch proof; prior `queued` removes that exact ticket and decrements depth once in the same CAS; prior `offered` does not read or write `QueueStateV1` |
| `D1C` | `held -> released` | `claimed -> released` | no-dispatch proof plus this-segment terminal receipt; queue ticket was already removed at claim, so `QueueStateV1` is not read or written |
| `D2` | `held -> settled` | `claimed -> released` | owner/fixture-proven usage plus this-segment terminal receipt |
| `D3` | `held -> reconciliation-hold` | `claimed -> reconciliation-hold` | dispatch, billing, or stop uncertainty; later lease release still requires terminal receipt |
| `D4` | `held -> reconciliation-hold` | `claimed -> released` | this-segment terminal receipt but no owner/fixture-proven usage; a lease already in `reconciliation-hold` cannot use D4 |
| `D5` | remains `held` | remains `claimed` | segment is non-terminal retry/HITL work under the same reserve/lease |
| `D6U` | compare parent remains `held`; hierarchy amount no-op | component `offered|queued -> cancelled|expired`, or no lease exists | atomic `UnusedCompareComponentProofV1` CAS; later claim rejects |
| `D6` | compare parent remains `held`; after the full reserved-component terminal set one CAS -> `settled|released|reconciliation-hold` | each associated lease already `released|cancelled|expired` with bound terminal/unused proof (no-op), or `claimed -> released` in this CAS; any lease in `reconciliation-hold` remains there and forces the parent -> `reconciliation-hold` | per-component annotations restore nothing; arms, retries, evaluator, and reviewer terminal-or-proven-unused hashes select the one parent outcome |
| `D7` | `reconciliation-hold -> settled|released` | each associated lease is already `released|cancelled|expired` with its bound terminal receipt or `UnusedCompareComponentProofV1` hash (no-op), or `reconciliation-hold -> released` in this CAS | bound terminal/unused component hashes plus schema-valid `owner-reconcile` evidence; this is the only reservation-hold exit after D3, D4, or D6 and the only lease-hold exit; terminal leases never reopen |

No other reservation/lease pairing is valid.

| Condition | Control-plane action | Budget/capacity disposition | Named owner required |
|---|---|---|---|
| missing/expired price, cap, owner, region, or capacity policy | reject before reserve/dispatch | `D0` | Budget/Operations Owner |
| hierarchy cannot reserve aggregate maximum | `budget-exhausted` before insertion | `D0`; transaction rolls back every balance/rate CAS | Budget/Operations Owner |
| queue full, deadline infeasible, or offered/queued expiry | reject/cancel with no attempt | `D1` | Job/Sandbox plus Budget/Operations Owners |
| lease claimed but dispatch later proven absent | terminal `cancelled` with no provider observation | `D1C` | Job/Sandbox plus Budget/Operations Owners |
| transient failure with known billing | if every Step 2 retry gate passes use same-route retry; otherwise terminal `failed` | gates pass: `D5`; gates fail: `D2` with usage proof, otherwise `D4` | Job/Sandbox plus Budget/Operations Owners |
| ambiguous dispatch or billing | fail and stop retry/switch/apply | `D3` | Budget/Operations Owner |
| provider/model/effort mismatch | fail closed, kill route, quarantine output | terminal receipt and usage proof: `D2`; terminal receipt without usage proof: `D4`; stop/dispatch uncertainty: `D3` | Model/Skill Security plus Budget/Operations Owners |
| authentication or credential boundary failure | fail and kill affected route; no retry | no dispatch before claim: `D1`; no dispatch after claim: `D1C`; terminal receipt plus usage proof: `D2`; terminal receipt without usage proof: `D4`; uncertainty: `D3` | Model/Skill Security, Job/Sandbox, and Budget/Operations Owners |
| output schema/size/data/canary violation | fail with terminal receipt, quarantine output, stop apply; canary kills route | usage proof: `D2`; otherwise `D4` | Model/Skill Security, Data Protection, and Budget/Operations Owners |
| time/token/currency/tool/output/delegation cap reached in flight | `budget-exhausted` terminal, stop work, preserve safe partial hash | usage proof: `D2`; otherwise `D4`; stop uncertainty before terminal: `D3` | Budget/Operations plus Job/Sandbox Owners |
| proposal-HITL after completed attempt | before decision no effect; accept -> completed/no apply, reject/expiry -> cancelled | before terminal: `D5`; terminal plus usage proof: `D2`; terminal without usage proof: `D4` | Job/Sandbox plus Budget/Operations Owners and current decision actor |
| operational/user stop or route switch | cancel/fail current segment; never proposal-resume | no dispatch before claim: `D1`; no dispatch after claim: `D1C`; terminal plus usage proof: `D2`; terminal without usage proof: `D4`; uncertainty: `D3` | Job/Sandbox plus Budget/Operations Owners |
| over-reserve usage observation | `budget-breach` terminal incident; kill route; never enlarge cap | terminal receipt: `D4`; before terminal/stop uncertainty: `D3` | Budget/Operations and Independent Security Owners |
| reserved compare retry/evaluator/reviewer becomes provably unused before claim | terminal that component with atomic no-dispatch proof; later claim rejects | `D6U`; parent/hierarchy amounts remain unchanged | Evaluation plus Budget/Operations Owners |
| compare arm failure/cancel | terminal that arm; never substitute | `D6` | Evaluation plus Budget/Operations Owners |
| owner/kill-switch revocation | stop new reservation/claim; terminal existing work by proof | queued/no dispatch: `D1`; claimed/no dispatch: `D1C`; non-terminal claimed work: `D5`; terminal plus usage proof: `D2`; terminal without usage proof: `D4`; uncertainty: `D3` | owning role, Budget/Operations Owner, plus Independent Security Verifier |
| named reconciliation resolves prior D3/D4/D6 hold | apply bound owner evidence after every associated component terminal | `D7` | Budget/Operations Owner plus Independent Security Verifier for breach/compare holds |

No automated cleanup may delete unresolved reservations, capacity claims, attempt
evidence, compare arms, or their receipt graph. A later persistent implementation
must prove crash-safe CAS, replay/attach, and reconciliation; the provider-offline
in-memory fixture may test state transitions but cannot claim durable recovery.

## Acceptance criteria

`OBX-P180-S4` is acceptable only when:

1. every route has current owner-bound budget and capacity policy, with omission and
   unknown values failing closed;
2. deterministic integer arithmetic reserves the complete worst case across agency,
   project, assignment, segment, retry, compare, evaluator, and reviewer scopes;
3. provider usage is observational, every ledger movement is immutable, ambiguous
   billing stays held, and no observation can enlarge authority;
4. capacity admission uses current compliant snapshots and CAS leases; queue pressure
   never changes route, privacy, effort, price, tools, or authority;
5. compare has exactly two immutable, fairness-bound arms, one aggregate reserve,
   separate receipts, explicit partial-failure behavior, and no automatic winner or
   apply path;
6. retry remains same-route and once-only, fallback remains a fresh explicit segment,
   and ambiguous or policy failures never retry;
7. every failure class has a terminal action, budget/capacity disposition, preserved
   evidence, kill/stop behavior, and named human owner;
8. exact Grok 4.6 binds this file's current bytes and reports no unresolved BLOCK,
   HIGH, or MEDIUM finding.

Passing Step 4 is planning evidence only. It authorizes no ledger, queue, provider,
credential, spend, dependency, persistence, runtime, compare UI, Page IR mutation,
deployment, or release behavior.
