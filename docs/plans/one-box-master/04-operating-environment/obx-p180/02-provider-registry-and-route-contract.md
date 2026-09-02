# OBX-P180 Step 2: Provider registry and route contract

- Packet: `OBX-P180`
- Step: 2 of 7
- Status: proposed contract; implementation not authorized
- Depends on: Step 1 exact-Grok CLEAN
- Governing requirements: `P180-R001` through `P180-R004`, `P180-R009`,
  `P180-R011`, `P180-R013`

## Decision

The first proposed E1 implementation slice is provider-offline. It can become an
implementation candidate only after the owner accepts the authorization proposal
in Step 6. Until then, this document is planning evidence only.

If later authorized, the first slice may add closed registry and route-policy
types, deterministic fixtures, an in-memory test registry, and a disabled driver
seam. It may not:

- enable a live model or provider;
- read, store, request, or validate a provider credential;
- add network access, a provider SDK, or another dependency;
- change the existing pinned generation routes;
- expose Codex OAuth or Grok as product runtime routes;
- add persistence, background execution, scheduling, or collaboration;
- mutate Page IR or grant apply, approval, deployment, or release authority.

This is the selected approach because it closes the product contract before a
provider's API semantics can become ONE BOX authority. Two alternatives are
rejected for this phase:

1. enabling the existing OpenRouter lane immediately, because current route use is
   not E1 conformance evidence and `OBX-AUTH-ATF-001` prohibits provider/network/
   credential capability;
2. adding a multi-provider abstraction immediately, because no second provider is
   selected and the added fallback, residency, credential, and dependency surface
   would be unowned.

## Planned contract status

The type names and fields below are proposed planning contracts. They are not
current `src/lib/contracts.ts` artifacts and cannot be consumed by runtime code
until a separately accepted compatibility/implementation ticket adds them inside
an explicit authorization boundary.

Every planned contract is closed: unknown fields, enum values, and capability
names fail validation. Canonical JSON uses UTF-8, recursively sorted object keys,
array order preserved where order is semantic, no duplicate keys, and SHA-256 over
the canonical bytes. For any record with its own `*Hash` field, compute the hash
over the closed record with that one self-hash field omitted, then insert the
result. References and nested-record hashes remain included.

## Registry separation

The registry has three distinct inventories. An entry in one inventory never
silently appears in another.

| Inventory | Purpose | Can dispatch product work? |
|---|---|---|
| Product registry | Owner-admitted provider/model routes and synthetic contract fixtures for ONE BOX assignments | Only hosted/local model entries with `enabled` admission and a current authorization; the first slice contains only a non-qualifying fixture entry |
| Evaluation registry | Exact candidates used by blinded benchmark fixtures | No; evaluation results are task-local evidence |
| External-review registry | Packet-declared model audits such as exact Grok 4.6 | No; audits are advisory and cannot produce product effects |

Operator tooling such as Codex OAuth is outside all three registries. Existing
pinned website-generation routes remain owned by their current pipeline contract
and do not become Agent Studio entries through documentation or shared provider
names.

## First catalog

| Catalog identity | Inventory | Admission | First-slice behavior | Promotion gate |
|---|---|---|---|---|
| provider `offline-deterministic-v1`; synthetic model `synthetic/offline-deterministic-v1` | Product registry | `fixture-only` on both entries | Exercises closed provider/model/route validation and receipts without presenting itself as a hosted or quality-bearing model and without network access | Separately authorized provider-offline implementation ticket |
| Existing pinned generation routes | Existing pipeline only | unchanged | Continue under their existing scope; absent from Agent Studio selection | New exact route entry, task-class qualification, security/provider conformance, and explicit authorization |
| GPT-5.6 Sol/Luna/Terra through Codex OAuth | Operator tooling outside the registries | not admitted | Not listed in product UI; no tenant/project credential or deployable driver. Existing benchmark entries remain owned only by that benchmark. | A different deployable service contract and new admission; OAuth availability alone is insufficient |
| audit entry `x-ai/grok-4.6` through OpenRouter | External-review registry only | `audit-only` | Exact packet review only under the review policy; never a product, evaluation-promotion, or approval route. The existing benchmark's separately owned candidate entry is not imported or aliased here. | Full task-class benchmark plus a separate product-route proposal and authorization |
| Deep Agents JS | No runtime catalog | `adapt-patterns-only` | No driver, dependency, state, or runtime entry | New intake, evaluation, ADR, ledger decision, named owners, and explicit authorization |
| Any future hosted or local model | None | `unselected` | Cannot validate or dispatch | Exact identity, service/driver admission, supply-chain/data/security evidence, evaluation, owners, and authorization |

`synthetic/offline-deterministic-v1` is an exact synthetic contract identity, not
a provider model slug. Its provider and model entries both use `fixture-only`.
Its results cannot qualify quality, cost, latency, provider availability, or tool
use, and it cannot be promoted in place to `enabled`.

## `ProviderRegistryEntryV1`

A future product provider entry contains exactly:

```text
ProviderRegistryEntryV1 = {
  schemaVersion: "provider-registry-entry-v1",
  providerId,
  displayName,
  serviceIdentity,
  driverIdentity,
  admission: "disabled" | "fixture-only" | "evaluation-only" | "enabled",
  accessLane: "offline" | "subscription" | "metered" | "contracted",
  credentialBoundary: "none" | credentialPolicyRef,
  allowedDataClasses[],
  processingRegions[],
  permittedTransferRegions[],
  subprocessorPolicyRef,
  trainingPolicyRef,
  retentionPolicyRef,
  telemetryPolicyRef,
  availabilityPolicyRef,
  killSwitchRef,
  removalPlanRef,
  ownerAssignmentRefs[],
  adoptionLedgerRef,
  policyVersion,
  effectiveAt,
  expiresAt?,
  entryHash
}
```

Rules:

- `enabled` requires an exact service identity and an independently admitted exact
  driver identity. A package license never clears the hosted service.
- `credentialBoundary: none` is the only value allowed in the provider-offline
  slice. A credential policy reference never contains a secret value.
- Empty or unknown region/subprocessor/training/retention/telemetry fields make a
  hosted entry unavailable, not permissive.
- Telemetry defaults to denied. Any later allowlisted telemetry is a separate
  export with data minimization, retention, and kill behavior.
- The kill switch is owned by ONE BOX and must disable dispatch without calling
  the provider or depending on the driver being healthy.
- A non-offline hosted/local entry requires `expiresAt`. Only a content-addressed
  offline fixture may omit it. Expired, disabled, incomplete, unowned, or hash-mismatched entries cannot be
  selected, reserved, queued, activated, or passed to any attempt.

## `ModelRegistryEntryV1`

A future model entry contains exactly:

```text
ModelRegistryEntryV1 = {
  schemaVersion: "model-registry-entry-v1",
  modelEntryId,
  providerId,
  exactModelIdentity,
  reportedIdentityRule,
  revisionPolicy,
  supportedEfforts[],
  capabilities[],
  maximumContextTokens,
  maximumOutputTokens,
  supportedDataClasses[],
  toolPolicyRef,
  pricingSnapshotHash,
  qualificationRefs[],
  admission: "disabled" | "fixture-only" | "evaluation-only" | "enabled",
  effectiveAt,
  expiresAt?,
  entryHash
}
```

Rules:

- No alias, display label, model family, or provider default can substitute for
  `exactModelIdentity`.
- `reportedIdentityRule` states the exact hash-bound identity evidence required
  from the provider. A requested-only or unverifiable identity is always
  evaluation-ineligible and product-disabled. Any later attestation mechanism is
  admitted as its own exact rule and identity contract, never as a provider-paper
  waiver.
- Effort is a closed model-specific enum. Unsupported effort fails validation;
  the driver cannot coerce it, choose a default, or silently change it.
- Capabilities are evidence-bound task properties, not intelligence claims. A
  capability does not grant tools or effects.
- A model entry cannot outlive its provider entry, price snapshot, qualification,
  or authorization.

## Pricing snapshot

`PricingSnapshotV1` is a closed record containing exactly:

```text
PricingSnapshotV1 = {
  schemaVersion: "pricing-snapshot-v1",
  pricingSnapshotId,
  providerId,
  exactModelIdentity,
  currency,
  inputPriceUnits[],
  outputPriceUnits[],
  cachePriceUnits[],
  toolPriceUnits[],
  minimumCharge?,
  longContextTiers[],
  taxAndFeeBasis,
  sourceRef,
  capturedAt,
  validUntil,
  pricingSnapshotHash
}
```

Each price-unit and long-context-tier item is a closed, canonical record in the
pricing policy; duplicate/overlapping tiers or an unpriceable unit invalidate the
snapshot. The record never contains an API key or invoice data.

A metered route is unavailable when the snapshot is missing, expired, ambiguous,
or cannot price the declared maximum input, output, tools, and retries. Any later
compare contract must reserve each arm from this same rule. A provider's usage
report reconciles a completed reservation but cannot
create or enlarge the reservation.

Subscription is recorded as subscription, never as zero cost. Capacity limits,
review labor, failure attempts, and rate limits still appear in receipts.

## `RoutePolicyV1`

A route policy contains exactly:

```text
RoutePolicyV1 = {
  schemaVersion: "route-policy-v1",
  routePolicyId,
  providerEntryHash,
  modelEntryHash,
  pricingSnapshotHash,
  effort,
  taskClasses[],
  requiredCapabilities[],
  allowedDataClasses[],
  toolGrantPolicyRef,
  skillAdmissionPolicyRef,
  contextPolicyRef,
  budgetPolicyRef,
  timeoutPolicyRef,
  retryPolicyRef,
  fallbackPolicy: "none",
  retentionPolicyRef,
  telemetryPolicyRef,
  processingRegion,
  permittedTransferRegions[],
  outputContractRef,
  ownerAssignmentRefs[],
  effectiveAt,
  expiresAt?,
  routePolicyHash
}
```

For the first contract, `fallbackPolicy` is always `none`. A different provider,
model, revision, effort, region, tool policy, skill set, data class, or price basis
is a different route and requires a new segment.

Every `*PolicyRef` is a content-hash reference to a separately accepted closed
record of the named type. A bare URL/name, unresolved hash, unknown field, expired
record, or invalid owner/authorization makes route validation fail. Step 5 maps the
security policy records; their absence cannot be treated as an implementation
default.

The effective route is the intersection of admission, current implementation
authorization, provider, model, project, actor, assignment, skill, tool, data,
region, and budget permissions. Product dispatch resolves entries only from the
Product registry and requires provider admission `enabled`, model admission
`enabled`, and a current exact authorization. A fixture dispatch requires both
admissions `fixture-only`, provider `offline`, and the provider-offline fixture
authorization. Evaluation/audit admissions never dispatch through the Product
registry or product driver; their separate coordinators cannot import or promote
their entries. Route data, region, tools, skills, and capabilities cannot exceed
the stricter provider/model/project/actor allowlists. `processingRegion` must be a
member of the provider's `processingRegions` and every transfer must be in all
applicable permitted-transfer sets. Empty intersection fails before reservation.
Omission never inherits a broader value.

The `pricingSnapshotHash` stored by `ModelRegistryEntryV1` and `RoutePolicyV1`
must equal the hash recomputed from the resolved `PricingSnapshotV1` bytes and
must bind the same provider and exact model. Any mismatch empties the intersection.

## Driver seam

A provider-offline fixture driver may implement only:

```text
preflight(closedManifest) -> available | blockedReceipt
dispatchOffline(reservedManifest, attemptManifest) -> fixtureAttemptHandle
cancel(fixtureAttemptHandle, reason) -> cancellationObservation
normalize(fixtureResponse) -> untrustedNormalizedResponse
reconcileUsage(fixtureUsage, reservation) -> reconciliationObservation
```

A later provider-connected driver would require a separately authorized operation
that cannot exist in the first slice:

```text
dispatchProvider(reservedManifest, attemptManifest, credentialLeaseRef) -> providerAttemptHandle
cancel(providerAttemptHandle, reason) -> cancellationObservation
normalize(providerResponse) -> untrustedNormalizedResponse
reconcileUsage(providerUsage, reservation) -> reconciliationObservation
```

`credentialLeaseRef` is a short-lived opaque custody reference, never a value. Its
schema, issuance, and revocation remain blocked until a credential-boundary ticket
is accepted.

The control boundary, not the driver:

- validates the route, data class, tools, skill, context, region, and budget;
- owns reservation, job/segment state, cancellation intent, and terminal receipts;
- validates normalized output against the declared output contract;
- rejects stale, mismatched, extra-field, over-budget, or unverifiable results;
- decides whether any proposal may enter the existing guarded apply flow.

The driver cannot choose another model, provider, region, effort, tool, retry,
fallback, budget, retention rule, or output contract. Provider response text and
error text are untrusted data and never become system instructions.

## Route-selection state machine

```text
draft -> validated -> reserved -> queued? -> active
draft|validated -> rejected | cancelled
validated -> budget-exhausted
reserved|queued -> rejected | cancelled | budget-exhausted
active -> completed | failed | cancelled | budget-exhausted
active -> interrupted -> completed | cancelled
```

Allowed transitions:

- `draft -> validated`: all registry, policy, data, owner, region, context, skill,
  tool, output, price, and authorization checks pass.
- `draft|validated -> rejected`: closed validation, policy, admission,
  authorization, region, kill-switch, or manifest checks fail before a provider
  attempt.
- `draft|validated -> cancelled`: the user withdraws or switches the immutable
  validated intent before reservation; no provider observation or reservation
  release is required.
- `validated -> reserved`: the full worst-case hierarchical budget is atomically
  reserved and the immutable reserved manifest binds that reservation.
  Provider-offline fixtures reserve synthetic units only.
- `validated -> budget-exhausted`: the declared hierarchy cannot fund the full
  worst case; no provider attempt occurs.
- `reserved -> queued`: capacity is not immediately available but the deadline can
  still be met. Queueing never changes the route.
- `reserved|queued -> rejected|cancelled|budget-exhausted`: a preflight,
  kill-switch, deadline, capacity, policy, or reservation condition terminates the
  immutable segment, releases or reconciles its reservation, and emits a receipt.
- `reserved|queued -> active`: capacity, an unexpired reservation, and the exact
  immutable manifest exist; the control plane atomically claims attempt index zero.
- `active -> terminal`: output, cancellation, or limits settle the segment. A first
  retryable failure may create attempt index one while the segment remains `active`;
  it does not transition to `failed` between attempts.
- A completed attempt with a schema-valid unapplied typed proposal is a closed mutex:
  `active -> completed|failed|budget-exhausted` is forbidden. Only the atomic
  proposal-HITL `active -> interrupted` transition or an operational
  `active -> cancelled` may win the state revision. A typed proposal cannot obtain a
  completed segment receipt without the unique `accept-proposal` decision.
- `active -> interrupted`: this transition is only the proposal-HITL gate. The sole
  current attempt must already be `completed`, its typed proposal must be validated
  but unapplied, and no handle/work may remain live. No attempt may be `claimed`,
  `in-flight`, or `ambiguous`. Before attempt index one is claimed, attempt zero must
  CAS from `retryable-failure` to terminal `failed` with the closed reason
  `transient-retry-consumed`; proposal-HITL then evaluates the completed current
  attempt, while every earlier attempt is terminal. The control plane atomically CASes
  the settled attempt, unique interrupt, pending proposal, expected project/candidate
  state, and segment state. The reservation remains held. Operational cancel,
  user/system stop, route switch, and provider interruption never use this state.
- `interrupted -> completed`: only the one current schema-valid
  `accept-proposal` decision may close the segment, and only when the interrupt,
  intent, manifest, route, context, skill set, tool grant, budget, deadline, expected
  project/candidate state, proposal, and completed attempt hashes still match; the
  interrupt/context/reservation/authorization are unexpired and current; the
  reservation is still held; and all kill switches remain off. This CAS creates the
  completed segment receipt but performs no proposal apply or other effect.
- `interrupted -> cancelled`: rejection, expiry, revocation, or stale expected state
  cancels the segment, reconciles the reservation, and emits
  a terminal receipt with the interrupt and unique decision where one exists.
- a terminal state is final. Late provider output becomes a quarantined observation
  and cannot alter the receipt or create a proposal.

Any transition not listed is rejected and emits no provider call. A worker or
driver cannot advance control-plane state directly.

## Per-turn switching and route segments

TM-05 is already governing: each user-requested provider/model/effort switch starts
a new receipted segment, and hidden fallback or silent effort change is prohibited.

Validation closes an immutable intent before a reservation exists:

```text
RouteSegmentIntentV1 = {
  schemaVersion: "route-segment-intent-v1",
  jobId,
  segmentId,
  parentSegmentId?,
  actorId,
  projectId,
  taskHash,
  routePolicyHash,
  contextBundleHash,
  skillSetHash,
  toolGrantHash,
  outputContractHash,
  retryPolicyHash,
  maxAttempts,
  deadline,
  createdAt,
  intentHash
}
```

Reservation creates, but does not mutate, the immutable dispatch manifest:

```text
RouteSegmentManifestV1 = {
  schemaVersion: "route-segment-manifest-v1",
  jobId,
  segmentId,
  intentHash,
  budgetReservationId,
  reservedAt,
  manifestHash
}
```

The manifest resolves every field from the intent by `intentHash`; it cannot
override one. `maxAttempts` is exactly `1` or `2` and is fixed in the intent.
Validation requires either `maxAttempts: 1` with a retry policy that forbids retry,
or `maxAttempts: 2` with exactly the one same-route transient retry policy. No
other pairing is valid. Compare ownership is defined in Step 4 and does not add
mutable fields to either record.

Each provider/fixture attempt has a closed record:

```text
RouteAttemptV1 = {
  schemaVersion: "route-attempt-v1",
  jobId,
  segmentId,
  attemptId,
  attemptIndex,
  idempotencyKey,
  segmentIntentHash,
  segmentManifestHash,
  state: "claimed" | "in-flight" | "retryable-failure" |
    "completed" | "failed" | "cancelled" | "ambiguous",
  startedAt,
  endedAt?,
  providerAttemptRef?,
  billingState: "none" | "known" | "ambiguous",
  observationHash?,
  stateRevision,
  attemptHash
}
```

Segment state is a separate closed compare-and-swap record:

```text
RouteSegmentStateV1 = {
  schemaVersion: "route-segment-state-v1",
  jobId,
  segmentId,
  intentHash,
  manifestHash?,
  state: "draft" | "validated" | "reserved" | "queued" | "active" | "interrupted" |
    "completed" | "rejected" | "failed" | "cancelled" | "budget-exhausted",
  currentAttemptIndex?,
  interruptHash?,
  pendingProposalEnvelopeHash?,
  expectedProjectStateHash?,
  expectedCandidateHash?,
  stateRevision,
  terminalReceiptHash?,
  updatedAt,
  stateHash
}
```

Unknown segment states or transitions fail validation. Every segment transition is
a compare-and-swap on `stateRevision`; duplicate worker delivery returns or
attaches to the current state/attempt record and never creates another transition.
`interrupted` requires all four interrupt/proposal/expected-state hash fields and no
`terminalReceiptHash`; those four fields are forbidden in every other non-terminal
state. Resume or cancellation compares them as part of the state CAS, not through an
out-of-band lookup. Every terminal state requires one receipt, and no transition
leaves a terminal state. The four hashes are written exactly once by
`active -> interrupted` and are immutable until the listed
`interrupted -> completed|cancelled` CAS. `interrupted -> interrupted` and every CAS
that rewrites one of those hashes reject or replay/attach with zero mutation; a
duplicate interrupt delivery cannot cancel. The hashes remain immutable in the
terminal record. Only a listed reject/expiry/revocation/stale-state trigger, or a
failed live-gate/hash compare while processing the unique `accept-proposal` decision,
may CAS `interrupted -> cancelled`; that mismatch cancels rather than rebinds.
Any provider/driver output arriving while interrupted, or
not bound to the already settled attempt hash, is quarantined: it cannot transition
an attempt, create a proposal, or mutate state/receipt evidence.

The control plane uses compare-and-swap on `stateRevision` to claim attempt index
zero. It may claim index one only when the intent has `maxAttempts: 2`, attempt zero
is `retryable-failure`, billing is `known` and not `ambiguous`, the reservation can
cover both attempts, and the deadline/policy remain valid. `(segmentId,
attemptIndex)` and `idempotencyKey` are unique. A provider-connected route cannot enable retry until the driver proves
provider-side idempotency or a durable dispatch/outbox protocol. A crash after an
uncertain call yields `ambiguous`, holds the reservation for reconciliation, and
never retries. The provider-offline first slice tests these rules in memory only;
it is not evidence for durable or provider-side idempotency.

A repeated dispatch with the same `idempotencyKey` returns or attaches to the
original attempt/observation; it cannot issue another call. A provider or driver
unable to prove that replay/attach behavior cannot enable automated retry.

Attempt transitions are closed:

```text
claimed -> in-flight | failed | cancelled | ambiguous
in-flight -> completed | retryable-failure | failed | cancelled | ambiguous
retryable-failure -> failed with `transient-retry-consumed`; only that control-plane
  CAS may atomically claim the next attempt permitted by the immutable intent
completed | failed | cancelled | ambiguous -> no further attempt transition
```

`claimed -> failed` is valid only when dispatch provably did not occur because of
a non-interrupt driver/control failure. `claimed -> cancelled` is valid only when
dispatch provably did not occur and an interrupt is current; its evidence is the
interrupt intent plus reservation release/reconciliation with no provider
observation. If dispatch may have occurred, recovery must compare-and-swap to
`ambiguous`, hold the reservation for reconciliation, and refuse attempt index one.
Once a handle exists, the attempt is `in-flight` and driver/provider cancellation
evidence is required.

Switch rules:

1. A selection is mutable UI draft state only while its segment is `draft`.
2. Validation freezes the segment intent; reservation later creates the manifest.
   The provider/model/effort cannot change while validated, reserved, queued,
   active, interrupted, or terminal.
3. A user switch for a validated segment first terminates that immutable intent as
   `cancelled` and emits a pre-dispatch receipt with no provider observation. A
   switch for a reserved/queued segment terminates it as `cancelled`, releases or
   reconciles its reservation, and emits the release receipt. Only then may a new
   draft segment with a new intent, validation, reservation, manifest, and receipt
   chain open. History is never rewritten.
4. A switch request while `active` is an operational cancellation, never a
   proposal-HITL interrupt. The current segment must reach `cancelled`, `failed`, or
   another terminal state before the new route can validate. An interrupted
   proposal-HITL segment must cancel before a switched route can open.
5. Output for a prior segment remains visible history but is stale for any newer
   expected segment/candidate and cannot apply automatically.
6. A route mismatch between requested, manifest, driver, and provider-reported
   identity is `failed`; it is never normalized to success.

## Retry and fallback

A retry is permitted only when all are true:

- the same exact segment route and immutable input remain current;
- the failure is classified as transient transport or rate limit;
- no usable output exists;
- provider billing state is known and the original plus retry fit the reservation;
- attempt zero is `retryable-failure` and the immutable intent has
  `maxAttempts: 2`;
- the deadline and policy remain valid.

Authentication, authorization, policy, model-identity, region, data, price,
budget, schema, cancellation, ambiguous-billing, or content failures do not retry.

The single retry is attempt index one under the same route segment and is permitted
only through the `RouteAttemptV1` compare-and-swap and idempotency rules. It never
changes provider/model/effort. A later choice of another route is
a new user/operator-requested segment with fresh validation and reservation, not a
fallback. There is no automatic escalation lane.

## Failure classification

| Class | Terminal result | Retry | Required evidence |
|---|---|---|---|
| invalid registry/policy/manifest | `rejected` | no | failed field/policy reference, no provider call |
| unavailable compliant region/capacity before dispatch | `rejected` or `cancelled` after queue | no route change | capacity/region observation |
| transient transport/rate limit | `failed` only after allowed retry is exhausted | same-route once | both attempt observations and billing state |
| authentication or credential boundary | `failed` | no | redacted classification; no credential value |
| provider/model/effort mismatch | `failed` | no | requested, manifest, driver, and reported identities |
| ambiguous provider charge | `failed` and budget hold pending reconciliation | no | attempt ID and reconciliation owner |
| output schema, size, data, or canary violation | `failed` | no | rejected-output hash or redacted canary result |
| user/system interrupt before an attempt is claimed | `cancelled` | no | interrupt intent and, when reserved, reservation-release/reconciliation receipt; no provider observation |
| user/system interrupt after claim but before dispatch is proven | `cancelled` only if no dispatch occurred; otherwise segment `failed` after ambiguous reconciliation | no | interrupt intent and reservation release when no dispatch; uncertain dispatch uses attempt `ambiguous`, holds reservation, and has no fabricated provider observation |
| user/system interrupt after an attempt is in-flight | `cancelled` | no | interrupt intent, driver/provider cancel observation, and late-output disposition |
| proposal-HITL after one completed attempt and typed unapplied proposal | `completed` on unique live acceptance; otherwise `cancelled` | no new attempt | interrupt/decision slot, settled attempt, pending proposal, expected-state, liveness, authorization, and reservation evidence |
| time/token/currency/tool/output/delegation cap | `budget-exhausted` | no | cap, observed usage, partial-output hash if safe |

An error message may be shown to the user only after secrets, raw provider payload,
and confidential content are removed. User guidance must not claim an invalid
receipt when a valid terminal receipt exists.

## Data and export gate

- Public data may use a later enabled route only when its service and model entries
  allow it.
- Internal data requires minimization and an exact admitted purpose.
- Confidential data is denied by default and needs a separately accepted routed
  purpose, provider terms, regions, retention, and owner authorization.
- Confidential public-submission data and Restricted data are prohibited from
  model and audit routes in this contract.
- Context, telemetry, logs, errors, and usage metadata are exports and follow the
  same data-class policy.
- Unknown provider training, retention, telemetry, region, subprocessor, or deletion
  behavior blocks the route.

The provider-offline first slice performs no export and retains no raw provider
payload.

## Acceptance criteria

`OBX-P180-S2` is acceptable only when:

1. no live provider/model is enabled and no exact existing generation route is
   changed or copied into Agent Studio;
2. product, evaluation, and external-review inventories are separate and cannot
   promote entries implicitly;
3. provider, model, route, pricing, and segment contracts are closed, hash-bound,
   owner-bound, and fail closed on missing security/data/region/cost facts;
4. TM-05 switch behavior is preserved: a new receipted segment per user switch,
   no mid-turn mutation, hidden fallback, or silent effort change;
5. one same-route retry is the maximum and every different route requires an
   explicit new segment;
6. drivers cannot own route selection, budget, state transition, authority, output
   acceptance, or apply/release behavior;
7. the data/export policy prohibits Restricted and public-submission content and
   treats unknown service behavior as unavailable;
8. proposal-HITL interruption binds the unique interrupt, completed attempt, pending
   proposal, and expected state in one CAS; no live handle/output can cross it;
   expiry/revocation wins over acceptance; and acceptance closes the segment without
   dispatch, apply, approval, release, or terminal revival; a typed unapplied
   proposal cannot obtain a completed receipt without that unique acceptance; and
9. the exact Grok 4.6 audit binds this file's current bytes and has no unresolved
   BLOCK, HIGH, or MEDIUM finding.

Passing Step 2 supplies contract input to later planning. It does not authorize
implementation, provider access, credentials, network, persistence, dependencies,
Page IR mutation, deployment, or release.
