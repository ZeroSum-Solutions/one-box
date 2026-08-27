# ONE BOX Appointment Acquisition v1

- **Status:** Architecture approved; implementation not authorized
- **Prepared:** 2026-08-27
- **Launch market:** Los Angeles
- **Launch verticals:** cosmetic dentistry and orthodontics; medical spas and aesthetic clinics; physical therapy and sports rehabilitation
- **Research basis:** `docs/research/appointment-journeys/`
- **Governing contract:** Universal Quality Contract
- **Product boundary:** truthful public handoff, not appointment fulfillment

## 1. Decision summary

ONE BOX will generate, configure, verify, publish, and monitor the public handoff from a client website to an independently operated appointment or contact destination. It will not own appointment inventory, reserve or confirm appointments, submit to vendor systems, collect payment, or become a clinical system of record.

The field study rejected a booking-versus-request binary. The same business may expose different completion capabilities by service, location, provider, and, only when required, new-versus-returning visitor status. ONE BOX must classify each exact route before it chooses CTA language or behavior.

V1 uses three isolated contracts:

1. `JourneyPromiseClass` describes the commercial promise for design and reporting.
2. `ObservedDestinationCapability` records what current public evidence proves for one exact route.
3. `HandoffMode` controls the only action ONE BOX performs.

The system is fail-closed. Missing, stale, contradictory, unsafe, or unavailable evidence cannot produce a stronger public promise.

## 2. Goals

V1 must:

- produce an agency-quality acquisition path whose words match the observable destination capability;
- preserve service, required location, and required provider context through an explicit external handoff;
- support restrictive vertical behavior without forking the classifier;
- make every published mode, target, fallback, and copy choice traceable to current evidence and human approval;
- automatically downshift or block on signed-manifest hosting when monitoring proves the current handoff unsafe or unavailable;
- remain testable without submitting a form, creating an appointment, contacting a business, or inspecting private inventory;
- qualify the system through deterministic proof, rendered proof, current public evidence, and consenting pilots without conflating those evidence classes.

## 3. Non-goals

V1 does not:

- create, hold, confirm, cancel, or reschedule appointments;
- consume vendor callbacks, webhooks, booking confirmations, or success events;
- inspect actual slot inventory, authenticate to a scheduler, or open a vendor session;
- collect identity, clinical information, free-text medical concerns, insurance details, payment, or deposits;
- provide a CRM, lead database, EHR, EMR, or clinical record;
- infer completed appointments, conversion lift, revenue, market share, treatment outcomes, or business consent;
- embed a third-party scheduler through an iframe, webview, popup, or in-page vendor session;
- permit vendor-specific bypasses, executable per-client classifier logic, AI judgment in runtime transitions, or automatic upgrades;
- certify production vertical packs beyond the three launch verticals;
- claim general availability before the R4 qualification stage;
- treat field-study proportions as estimates of the Los Angeles market.

## 4. Contract hierarchy and authority

The authority order is:

1. Universal Quality Contract
2. core appointment-acquisition contracts
3. exactly one certified vertical policy pack
4. verified business configuration
5. brand presentation

Lower layers may narrow, prohibit, or downgrade behavior. They may not weaken a higher-layer requirement, add evidence, mint a target, expand the privacy envelope, lengthen freshness windows, change classifier semantics, publish or cause publication of a positive public action from a non-positive decision, or replace semantic copy with an unreviewed promise.

Verified business configuration is signed declarative data with a closed schema. It may contain enabled route dimensions, a certified pack-version binding, business prohibitions, and presentation IDs. It may not contain executable code, prompts, regular expressions, evidence, raw targets, classifier predicates, display strings, or PII.

AI may propose candidates. It may not verify evidence, classify a route, approve an artifact, publish a release, or change runtime state. Deterministic code performs classification and runtime transitions. Named humans approve publication and every restoration or upgrade.

## 5. Core domain model

### 5.1 Project and exact route identity

`ProjectId` is an opaque, mandatory tenant boundary. The indivisible classification, evidence, artifact, episode, control-record, and publication scope is:

```text
AcquisitionScope = (ProjectId, RouteKey)
```

No capability, target, evidence observation, fallback, pointer, counter, or transient episode may merge across either ProjectId or RouteKey. ProjectId is present in authoritative internal records and signed artifacts but forbidden from analytics, general logs, dashboards, and audit summaries.

`RouteKey` is the indivisible classification and publication scope:

```text
RouteKey = service
         + required location
         + required provider
         + visitorKind only when the public route truly distinguishes new/returning
```

`visitorKind` is required if and only if eligible public pre-authentication evidence proves that new and returning visitors receive different destinations or capabilities. It must otherwise be absent. Disagreement about that fact returns `unresolved: route_shape_mismatch` with no launch.

Missing correctable dimensions return unresolved with escaped route options and one closed reason: `missing_service`, `missing_location`, `missing_provider`, or `missing_visitor_kind`. Missing, unknown, or supplied dimensions that violate the certified route shape return Blocked with `invalid_route_dimension` or `prohibited_route_dimension`. Capabilities, targets, evidence, and fallback validity never merge across different acquisition scopes.

The router may ask only for:

- service;
- required location;
- required provider;
- conditional new-versus-returning status.

It may not ask clinical, diagnostic, identity, financial, insurance, or free-text questions.

### 5.2 Promise, capability, and action

`JourneyPromiseClass` is a closed design and reporting enum:

- `care_scheduler`
- `consultation_scheduler`
- `staff_confirmed_request`
- `contact_only`
- `unclassified`

It does not prove runtime success and is never rendered directly.

`ObservedDestinationCapability` belongs to one RouteKey and one current target. It records only verified public facts for scheduler, request, or contact behavior.

`HandoffMode` is a closed public action enum:

- `scheduler`
- `request`
- `contact`
- `blocked`

`unresolved` is a classifier outcome and presentation state, not a launchable mode.

The public strength order is:

```text
scheduler > request > contact > blocked
```

Runtime may remain at the current strength, move downward inside an approved bundle, or block. Runtime may never move upward.

### 5.3 Typed targets

The target union is closed:

- verified `https` web destination;
- public business telephone number;
- public business SMS number;
- public scheduling email address.

Scheduler and request modes require a web target. Contact mode may use any target type. Invalid mode-target pairs are `blocked: invalid_input` and render no acquisition CTA.

Targets are canonicalized and redacted before storage. Public contact values may appear only where needed to render the approved action; general logs, dashboards, analytics, and audit summaries must not expose full values.

## 6. Evidence contract

### 6.1 Evidence production

The AI extractor proposes candidate observations only. A read-only browser verifier creates verified observations from public surfaces. It may navigate public steps needed to establish service, location, provider, route meaning, and the presence of a scheduler, request, or contact surface. It must stop before identity, authentication, inventory hold, submission, call connection, text, email, payment, or appointment creation.

Every verified observation records:

- unique observation ID and append-only supersession relation;
- opaque ProjectId and exact RouteKey;
- observation class and closed result;
- normalized target reference;
- public source and capture timestamp;
- verifier identity and verification method;
- content or artifact hash;
- evidence-specific expiry.

There may be only one active, non-superseded observation for a required fact. Duplicate active facts, conflicting facts, invalid supersession, or mixed targets make the evidence set ineligible.

### 6.2 Independent evidence channels

The closed observation classes are:

- `scheduler_surface_present`;
- `scheduler_route_meaning_present`;
- `request_scheduling_payload_present`;
- `request_staff_followup_promise_present`;
- `contact_channel_published`;
- `web_endpoint_verified`;
- `public_contact_match_verified`;
- the corresponding closed negative result for each class.

Scheduler, request, and contact observations remain independent. A scheduler label, vendor identity, or familiar scheduler interface does not prove inventory. A request form does not prove staff confirmation unless the public destination provides both `request_scheduling_payload_present` and `request_staff_followup_promise_present` for the same acquisition scope and target. Contact evidence must be scheduling-oriented; a generic contact path cannot silently become an appointment request.

`HandoffMode=request` is legal only when both request observations are current, positive, unique, non-conflicting, and bound to the same web target. Otherwise that candidate cannot emit request. A separate contact candidate may still emit contact if its own projection is eligible; otherwise the result is unresolved or Blocked.

Scheduler evidence proves public scheduler-surface presence and route meaning. It does not prove that ONE BOX owns inventory or that a future visit will complete.

### 6.3 Freshness

Freshness is derived from capture timestamps. Stored freshness labels are ignored.

- scheduler surface and route-meaning evidence expires after 7 days;
- request and contact semantics expire after 30 days;
- web endpoint reachability and target-safety checks expire after 24 hours;
- public phone, SMS, or email publication evidence expires after 30 days.

Expiry has no grace period. Stale evidence cannot upgrade or preserve a decision.

## 7. Deterministic classifier

The classifier is a sealed, pure function with no network I/O. One invocation evaluates exactly one candidate mode and candidate target:

```text
classify(ProjectId,
         RouteKey,
         certifiedPack,
         verifiedBusinessConfig,
         candidateMode,
         candidateTarget,
         sealedEvidenceProjection)
  -> SealedDecision
```

Candidate modes are `scheduler`, `request`, or `contact`. Separate invocations may produce a primary and independently eligible fallbacks for the same acquisition scope. Cross-channel observations are never combined into one candidate projection.

An evidence projection is eligible only when every observation required by its candidate mode:

- belongs to the same ProjectId, RouteKey, normalized target, and channel;
- is current, schema-valid, unique, active, and correctly superseded;
- has no conflicting positive or negative fact;
- satisfies the candidate-specific observation requirements in Section 6.2.

Endpoint and public-contact verification remain separate required publication facts. Their absence or staleness produces `unresolved: endpoint_unverified`; a dead or unsafe result produces a closed Blocked reason.

Missing, stale, duplicate, conflicting, mixed-target, mixed-channel, or invalidly superseded facts make that projection ineligible. They cannot produce a positive decision.

Evaluation order is total:

1. invalid ProjectId, schema, pack, config, candidate mode, target, or mode-target pair returns `blocked: invalid_input`;
2. prohibited or invalid route dimensions return `blocked: prohibited_route_dimension` or `blocked: invalid_route_dimension`;
3. disagreement about whether visitorKind is required returns `unresolved: route_shape_mismatch`;
4. a missing correctable dimension returns unresolved with the matching `missing_*` reason and escaped `PublicRouteOption[]`;
5. absence of an eligible projection returns `blocked: evidence_ineligible`;
6. a missing or stale required endpoint/public-contact verification returns `unresolved: endpoint_unverified`;
7. a dead, unsafe, revoked, or mismatched endpoint returns `blocked: endpoint_not_reachable` or its more specific closed safety reason;
8. an out-of-scope or prohibited pack category returns `blocked: out_of_scope`, `blocked: emergency_urgent_adverse`, `blocked: ambiguous_non_contact`, or `blocked: unclassified_category` as applicable;
9. only a fully eligible candidate projection whose category, candidate mode, and target satisfy Section 9.5 emits a positive publishable decision.

Contradictions appear as closed output annotations. They do not trigger side effects or hidden repair.

An unresolved result may carry escaped `PublicRouteOption[]` values that help the visitor correct missing route dimensions. Options are not targets and cannot launch.

## 8. Public handoff and rendering contract

### 8.1 Truthful public copy

Copy is chosen from a versioned, reviewed copy dictionary that maps each semantic key to exact display strings. The dictionary version and content hash are part of the immutable approval bundle. The renderer fails closed on a missing key, version mismatch, or hash mismatch. Any display-string change requires HumanRepublish.

Brand presentation may change visual treatment. It may not change approved words or alter scheduler, confirmation, request, or contact strength.

- scheduler copy may promise only the exact care or consultation surface supported by current evidence;
- request copy states that staff must review, match, confirm, or schedule the request;
- contact copy uses only `Call`, `Text`, `Email`, or `Contact the office` semantics;
- blocked and unresolved states offer no launchable acquisition target;
- external returns always become `returned_unknown` and never imply booking success.

`partial_route_availability` is the reason for a route set containing both available and unavailable choices. It is not treated as a generic mixed-blocked error.

### 8.2 Launch behavior

The handoff is one-way and top-level. ONE BOX does not embed or control the destination.

Before explicit activation, the page must not create a vendor request through an iframe, popup, webview, prefetch, preconnect, speculation rule, service worker, or query enrichment. The activation launches only the exact approved typed target after current pointer validation.

Blocked directory information remains noninteractive unless a separate positive contact decision supports an action.

### 8.3 Accessibility

Every acquisition path must provide:

- semantic controls and valid accessible names;
- `fieldset` and `legend` for route choices;
- keyboard completion and deterministic focus;
- live-region status and error messages;
- at least 44 by 44 CSS-pixel pointer targets;
- passing behavior at 320, 768, and 1200 pixel widths and 200 percent zoom;
- required contrast and reduced-motion behavior.

Accessibility failure is P1 and blocks publication.

### 8.4 Analytics and privacy

The closed analytics allowlist is:

- `acquisition_impression`
- `route_choice`
- `handoff_initiated`
- `launch_failed`
- `returned_unknown`

Events, general logs, dashboards, and audit summaries may include only opaque non-reversible IDs and closed enums such as mode, target kind, versions, and reason codes. They must not contain ProjectId, RouteKey, service, location, provider, visitorKind, full or partial URLs, reversible target references, or full or partial contact values. Typed targets remain confined to signed render-safe artifacts and the activation path.

They must not include identity, health, free text, booking or confirmation status, revenue, payment, or treatment information.

## 9. Vertical policy packs

### 9.1 Pack format and change authority

Packs are signed, versioned, declarative data using closed enums. They cannot contain executable code, prose instructions, URLs, vendor rules, business facts, evidence, PII, prompts, regular expressions, or safety copy.

Patch releases may add supported prohibited-claim enum members and selectors for existing copy keys. They may not add display strings. Any behavior change is breaking and requires recertification, exact-model audit, human approval, and reclassification of affected RouteKeys.

All packs inherit the universal `emergency_urgent_adverse` category. It is always `out_of_scope`, exposes no acquisition CTA, and cannot receive pack-authored safety copy. Uncertain equivalence to that category blocks.

### 9.2 Cosmetic dentistry and orthodontics

| Category | Mapping |
|---|---|
| `cosmetic_consultation` | `consultation` |
| `orthodontic_evaluation` | `consultation` |
| `routine_dental_exam` | `care` |
| `hygiene_visit` | `care` |
| `ambiguous_dental_service` | `ambiguous` |
| `emergency_urgent_adverse` | `out_of_scope` |

### 9.3 Medical spas and aesthetic clinics

| Category | Mapping |
|---|---|
| `exact_named_treatment` | `care` |
| `in_person_consultation` | `consultation` |
| `virtual_consultation` | `consultation` |
| `concern_or_unspecified` | `ambiguous` |
| `membership_or_package` | `out_of_scope` |
| `emergency_urgent_adverse` | `out_of_scope` |

### 9.4 Physical therapy and sports rehabilitation

| Category | Mapping |
|---|---|
| `initial_clinical_evaluation` | `care` |
| `followup_clinical_visit` | `care` |
| `phone_or_discovery_consultation` | `consultation` |
| `sports_performance_consultation` | `consultation` |
| `unspecified_performance` | `ambiguous` |
| `class_or_group` | `out_of_scope` |
| `emergency_urgent_adverse` | `out_of_scope` |

### 9.5 Promise restriction

The mapping from certified pack category and candidate decision is closed:

| Pack category class | Eligible candidate | JourneyPromiseClass | HandoffMode |
|---|---|---|---|
| `care` | scheduler with exact current care evidence and safe endpoint | `care_scheduler` | `scheduler` |
| `care` | legal request projection | `staff_confirmed_request` | `request` |
| `care` | legal contact projection | `contact_only` | `contact` |
| `consultation` | scheduler with exact current consultation evidence and safe endpoint | `consultation_scheduler` | `scheduler` |
| `consultation` | legal request projection | `staff_confirmed_request` | `request` |
| `consultation` | legal contact projection | `contact_only` | `contact` |
| `ambiguous` | legal contact projection only | `contact_only` | `contact` |
| `ambiguous` | scheduler or request candidate | `unclassified` | `blocked` |
| any `out_of_scope` | any candidate | `unclassified` | `blocked` |
| `emergency_urgent_adverse` or uncertain equivalent | any candidate | `unclassified` | `blocked` |
| `unclassified` category | any candidate | `unclassified` | `blocked` |

Every out-of-scope category, including `membership_or_package` and `class_or_group`, exposes no acquisition CTA. Ambiguous and unclassified categories cannot emit scheduler or request.

A care promise is structurally valid only with a final scheduler channel, exact current care evidence, a current safe endpoint, and a compatible care category. Consultation scheduler, request, and contact decisions require their own independent evidence and receive their own promise keys. No weaker channel may inherit a care or confirmed-scheduler promise.

## 10. Release artifact and publication model

### 10.1 Approval bundle

A release contains one primary decision and zero or more fallback decisions for the same acquisition scope. Each decision comes from its own deterministic classifier invocation over its own eligible sealed evidence projection. A complete fallback ladder is not required.

Every non-Blocked artifact independently passes classifier, target, copy, Universal Quality Contract, rendering, accessibility, privacy, analytics, and security gates. Human approval signs the exact immutable bundle hash. Every bundle also contains a pre-signed Blocked artifact.

`releaseId` is the digest of the approval-bundle and artifact-set hash.

### 10.2 Initial publication and human republish

`InitialPublish` exists only when an acquisition scope has never had a public acquisition pointer.

After that transition, every non-runtime replacement uses `HumanRepublish`, including update, restore, reactivation, rollout, or rollback. It performs fresh evidence verification, independent classifications, render verification, `AwaitingHumanRestore`, recorded human approval, and atomic publication. It always creates a new immutable bundle and release ID. An old signed release may inform a design but cannot reactivate directly.

HumanRepublish is the only path that may:

- replace a bundle;
- change target or copy behavior;
- exit any nonterminal Blocked state;
- move to a stronger artifact.

`AwaitingHumanRestore` belongs to this publication workflow, not the runtime state machine. Qualification coverage tests it as a publication-workflow state. HumanRepublish atomically closes any open transient episode as `superseded` before it installs the new release.

### 10.3 Render-safe artifacts and active pointer

Approved artifacts are immutable, same-origin, signed, and render-safe. They contain only:

- opaque ProjectId, RouteKey, release and artifact versions;
- mode and public strength;
- promise and copy keys plus the reviewed copy-dictionary version and hash;
- escaped route options where allowed;
- typed target where allowed;
- evidence expiries, key ID, counter compatibility, and integrity hashes.

They contain no raw evidence, diagnostics, PII, secrets, or general-log contact values.

The `ActiveAcquisitionManifest` is a small same-origin pointer to one artifact. The control record separates:

- `releaseGeneration`, changed only by InitialPublish or HumanRepublish;
- `pointerRevision`, changed by every accepted control transaction;
- `runtimeWatermark`, advanced by every accepted runtime observation.

Every write compare-and-swaps all expected counters. A stale writer loses with no public write and records only safe contention metadata.

## 11. Runtime state machine

### 11.1 Validity and selection

At runtime, `BaseArtifactValid` preserves the publication attestation. It requires unexpired cited evidence; valid signatures, hashes, keys, copy-dictionary binding, and compatible counters; an unrevoked artifact, target, and project; and no failed closed runtime predicate. Runtime does not rerun render, accessibility, privacy, analytics, or full security gates. Those gates run only during InitialPublish and HumanRepublish.

`OperationallyAvailable` additionally requires no active unsafe, revoked, integrity, semantic, or terminal transient disqualifier and an independently valid monitored target.

For ordinary runtime evaluation:

1. Blocked stays Blocked.
2. If the current artifact remains OperationallyAvailable, keep it.
3. Otherwise choose the strongest approved OperationallyAvailable artifact strictly weaker than current.
4. If none exists, choose Blocked.

Unknown fallback state is not valid fallback state.

### 11.2 Authorized post-launch transactions

After InitialPublish, exactly four disjoint transaction types may update control state:

| Transaction | Authorized actor | Effect |
|---|---|---|
| `MonitorMetadata` | designated runtime monitor | update heartbeat or a non-decisive transient episode without changing acquisition selection |
| `RuntimeDownshift` | designated runtime monitor | apply the Section 11.1 selection rule after a closed decisive event; it cannot skip a valid weaker artifact |
| `SafetyBlock` | trusted revocation/control-plane identity | select only pre-signed Blocked for deletion, revocation, unsafe target, or integrity compromise and close any open episode as `resolved_blocked` |
| `HumanRepublish` | publication service holding fresh human approval | replace bundle, change target/copy, exit a nonterminal Blocked state, or move upward; it cannot exit `ProjectDeleted` |

Unknown actor, event, missing predicate, or illegal successor produces no write.

### 11.3 Transient reachability episode

Each acquisition scope may have at most one open transient episode. It is bound to the current ProjectId, RouteKey, non-Blocked release ID, and artifact ID. Every transition uses one control-plane monotonic clock sampled once inside the atomic transaction.

Classification order is fixed:

1. Blocked rejects transient inputs; heartbeat metadata may still update.
2. The first timeout, network error, or 5xx opens `Degraded` at `t0`, with `earliestSecondAt = t0 + 15 minutes` and `deadline = t0 + 30 minutes`. The current CTA remains.
3. At or after the deadline, `TransientDeadlineReached` wins over a late success and executes RuntimeDownshift.
4. A matching failure before 15 minutes records `ExtraEarlyTransientFailure` without extending the episode.
5. A matching failure from 15 minutes until the deadline records `SecondQualifiedTransientFailure` and executes RuntimeDownshift.
6. A matching success before the deadline closes `resolved_success` and returns operator status to Healthy.
7. A success with no open episode updates heartbeat only and cannot revive or strengthen a route.

Every event is reclassified after CAS contention. Submitted event labels are not trusted.

Terminal episode reasons are closed:

- `resolved_success`
- `resolved_downshift`
- `resolved_blocked`
- `superseded`

### 11.4 Immediate and deterministic transitions

The following may cause immediate RuntimeDownshift or SafetyBlock without passing through Degraded:

- expired evidence;
- closed semantic contradiction;
- deterministic target failure;
- signature, schema, or hash failure;
- unsafe redirect, origin, path, or query;
- identity, payment, or session parameters;
- key, artifact, target, or project revocation;
- project deletion;
- integrity compromise.

RuntimeDownshift always applies the Section 11.1 selection rule and cannot skip an OperationallyAvailable weaker artifact. SafetyBlock may bypass weaker artifacts only to remove acquisition capability. SafetyBlock and project deletion atomically close any open episode as `resolved_blocked`.

The decisive observation, watermark, control fields, selected pointer, and new pointer revision commit atomically. There is no committed-but-unapplied decisive observation.

## 12. Pointer serving, cache safety, and replay resistance

The same-origin pointer endpoint may issue a CTA-bearing lease only when one consistent control-record read proves:

- the current artifact is non-Blocked, BaseArtifactValid, and OperationallyAvailable;
- signatures, hashes, key, release, artifact, ProjectId, RouteKey, and counters are current and unrevoked;
- cited evidence remains unexpired;
- monitor heartbeat age is no more than 5 minutes;
- no immediate transition or mandatory transient deadline is due;
- no authoritative deletion or revocation tombstone exists.

Any false, missing, stale, unavailable, or inconsistent predicate returns a typed Blocked response with no CTA. The pointer service may not synthesize a fallback.

A CTA lease ends at the earliest of:

- issuance plus 60 seconds;
- earliest cited evidence expiry;
- key-overlap end;
- explicit earlier revocation or unsafe deadline;

The client ends the lease 30 seconds before that earliest server-side end. The margin can only shorten a lease and must never extend a CTA.

Pointer responses are `no-store`, never stale-on-error, and never cached by CDN, service worker, or prerender. A page must fetch the current pointer before showing a CTA. It removes or disables the CTA at lease end unless renewal succeeds.

Every CTA activation performs a fresh same-origin pointer fetch and validates the RouteKey, release, artifact, counters, lease, signature, hashes, and revocation state before external navigation. Failure produces no navigation.

Origin emits the latest `releaseGeneration` and `pointerRevision` for the acquisition scope. The browser rejects a lower releaseGeneration for the same origin-scoped ProjectId and RouteKey, and rejects any pointerRevision that decreases within one release generation. Clearing browser storage cannot enable replay because display and activation both require a current no-store origin response.

## 13. Monitoring, recovery, and operations

### 13.1 Permitted monitoring

V1 monitors public, non-PII surface presence and approved-target safety only. It may check:

- reachability and final origin/path;
- allowlisted query and redirect behavior;
- absence of identity, payment, and session parameters;
- continued public scheduler, request, or contact surface presence;
- continued RouteKey service, location, and provider meaning;
- continued publication and normalized match of a public phone, SMS, or email target.

It never inspects actual inventory, authenticates, holds a slot, submits, calls, texts, emails, or pays.

Closed semantic failures are:

- approved surface absent;
- required RouteKey meaning absent;
- channel label contradicts sealed mode;
- normalized public contact no longer matches.

Ambiguous or AI-only interpretation creates an operator alert and no automatic change until deterministic verification or evidence expiry.

### 13.2 Recovery

Runtime never upgrades. Fresh evidence starts a new HumanRepublish path. A late success cannot undo a completed downshift or SafetyBlock.

Atomic swaps preserve prior pointers for audit. Failed writes have no partial public state.

### 13.3 Signed-manifest ownership and service levels

Every signed-manifest project names an accountable service owner and on-call escalation before first publish.

- monitor-heartbeat absence detected within 5 minutes;
- pointer-service availability or lease-renewal alarm within 1 minute;
- mandatory transient recheck completed within 30 minutes;
- unsafe or revocation update initiated immediately and confirmed within 5 minutes;
- CAS contention unresolved for 5 minutes escalated;
- evidence-expiry warnings issued at 72 and 24 hours only when the remaining TTL is at least that horizon. Warnings never lengthen a TTL or add grace.

The key runbook defines generation-bound key IDs, overlap start and end, emergency revocation, artifact re-signing, purge, and a quarterly fail-closed drill. Expired or revoked keys never validate.

### 13.4 Manual-invalidation hosting

Hosting without signed runtime pointer support is labeled `manual_invalidation`. It cannot claim automatic protection, cannot satisfy the automatic-downshift goal, cannot satisfy the current-evidence publication bar in Section 17.1, and cannot qualify for signed-manifest R3 or R4. It requires:

- tested origin replacement and CDN/cache purge;
- tested no-CTA Blocked build;
- named owner and on-call path;
- documented removal SLA;
- timestamped drills and executions.

If purge or replacement is unavailable or misses the SLA, the edge or site must be disabled or replaced by the tested Blocked response. Continued stale CTA service is not allowed.

## 14. Dashboard, alerts, audit, and retention

The dashboard may show safe mode, target kind, versions, lifecycle state, last verification, next expiry, fallback, and closed reason codes. It must not show ProjectId, RouteKey values, service, location, provider, visitorKind, raw evidence excerpts, PII, secrets, URLs, reversible targets, or contact values.

Alerts cover Degraded, fallback, Blocked, expiry, restore required, CAS contention, revocation, heartbeat loss, and manual-invalidation SLA risk. Alert failure is recorded and escalated but cannot open public acquisition.

Lifecycle events are append-only and record actor, timestamp, hashes, reason codes, and cited IDs without raw vendor responses or PII.

- redacted evidence artifacts: retain 90 days, then delete while preserving digest and metadata;
- decision, release, and audit metadata: retain 1 year, then delete unless a documented client or legal hold applies;
- legal hold is never the default;
- project deletion immediately revokes public acquisition and schedules idempotent logged deletion jobs;
- retained metadata can never reactivate acquisition.

Project deletion is terminal for that ProjectId. HumanRepublish cannot restore it. A future project requires a new ProjectId, fresh evidence, and a new InitialPublish. Identical RouteKey dimensions under the new ProjectId inherit no pointer, release generation, observation, or episode from the deleted project.

## 15. Acceptance and qualification

### 15.1 Evidence classes

Qualification keeps four evidence classes separate:

1. deterministic fixtures prove rules and reproducibility;
2. archived rendered fixtures prove copy, UI, accessibility, analytics, privacy, and security;
3. live public read-only checks prove current detection and operational compatibility;
4. consenting client pilots measure agency workflow and live reliability.

No class substitutes for another. Synthetic or archived evidence is never current market evidence. Live failure is an unavailable or Blocked result, not a flaky-test exemption.

### 15.2 Severity

`P0` includes false booking or confirmation promises, unsafe navigation, prohibited data collection or exposure, unauthorized publication or upgrade, stale CTA navigation after fail-close, and RouteKey leakage. P0 stops release and public acquisition.

`P1` includes wrong mode, target, or copy; missed fallback or block; inaccessible acquisition; broken mobile launch; manifest, signature, CAS, key, monitoring, or invalidation failure. P1 blocks release and downshifts or blocks an affected public project.

`P2` is limited to polish, diagnostic clarity, or operator efficiency with no effect on truth, accessibility, destination, privacy, safety, or a blocking gate. It requires an owner and due date. Severity cannot be lowered to meet a date.

### 15.3 Qualification coverage matrix

Counts are diagnostics. The normative bar is a versioned, hash-locked `QualificationCoverageMatrix` covering:

- every category enum for all three launch packs;
- emergency, out-of-scope, and ambiguous categories;
- every structurally legal public mode and typed-target pair;
- every terminal classifier and reason family;
- every legal route-dimension shape;
- every fallback topology;
- every state-machine actor, event, state, and guard.

Every non-excluded cell links to a semantically distinct exact RouteKey fixture, expected sealed evidence, decision, reason, artifacts, render, and test IDs. Identical sealed projections, decisions, and reasons count as one coverage instance. Exclusions need a closed reason and independent approval. Every non-excluded cell must pass.

Corpus admission requires a reviewer who is not the behavior author, pack author, or release owner.

### 15.4 Blind holdout

At least 20 percent of distinct qualifying cells form a sealed author-blind holdout. Sampling is stratified across every matrix row family. Every non-empty stratum contributes at least one holdout cell, and no family appears below its rounded-up population share.

Before candidate freeze, authors see only aggregate family counts. They cannot see selected cell identities, inputs, or expectations. A holdout failure blocks the candidate. Once a revealed holdout drives a behavior change, it retires and a fresh sealed holdout is required.

### 15.5 Deterministic and mutation suites

The blocking suite requires 100 percent pass for:

- golden classifier cases and all legal or illegal mode-target pairs;
- deterministic byte identity and input-order invariance;
- pack retain-or-weaken behavior;
- stale or ineligible evidence non-upgrade;
- RouteKey isolation;
- unresolved non-publication;
- runtime non-upgrade;
- exhaustive state-machine guards and controlled 15/30-minute boundaries;
- CAS, watermark, replay, key, expiry, revocation, deletion, and monitor-death behavior;
- artifact hashing, signatures, atomic selection, and failed-CAS no-op.

A hash-locked `BlockingInvariantCatalog` maps every P0/P1 invariant to a deliberately violating seed, expected detecting gate, and forbidden survivor. Qualification requires 100 percent mutation kill. No seeded candidate may publish or navigate.

Any classifier, pack, compiler, renderer, monitor rule, threshold, corpus, expected output, invariant catalog, or coverage matrix change creates a new qualification version and reruns the entire blocking suite.

### 15.6 Rendered acceptance

Every legal mode, target, representative vertical, and RouteKey must pass the Section 8 rendering contract plus:

- exact approved promise and recovery copy;
- handoff context limited to allowed route dimensions;
- hostile content and URL payloads fail closed;
- CSP, scheme, origin, path, query, and redirect controls;
- current pointer validation at page load and activation;
- lease expiry, offline, fetch, signature, hash, schema, generation, and revocation failure removes the CTA;
- local or synthetic destinations for automated tests.

Telephone, SMS, and email acceptance runs on a supported mobile OS or official simulator with an instrumented handler or composer. It verifies the scheme, normalized destination, permitted safe draft, focus, and return behavior, then cancels before a connection or send.

### 15.7 Blind live labels

Two different named human labelers inspect the same frozen, content-hashed live snapshot and rubric. Neither may be a behavior author, pack author, release owner, verifier, or contributor to the classifier, labeling harness, expected-output tooling, or relevant tests.

Until both labels and the derived expectation are sealed, each labeler remains isolated from the other labeler, all cross-labeler signals, system output, scores, model classifications, and implementation diagnostics.

Each labeler seals one material decision. `safeClass` is one of `care_scheduler`, `consultation_scheduler`, `staff_confirmed_request`, `contact_only`, or `blocked`:

```text
{ safeClass, publicStrength, exact normalized typedTarget, closed reasonCode }
```

Metadata such as confidence and evidence citations remains separate.

A resolved positive requires a structurally legal complete positive tuple. Every incomplete, uncertain, invalid, or non-positive determination uses exactly:

```text
{ safeClass: blocked,
  publicStrength: blocked,
  typedTarget: null,
  reasonCode: dual_label_unresolved }
```

A deterministic service produces a positive `ExpectedLabel` only when both sealed material decisions are byte-identical resolved positives. Every other pair produces the canonical Blocked tuple. There is no reconciliation, field splicing, strength join, human override, or third positive tuple. New evidence starts a fresh blind cycle.

### 15.8 Live recertification

Live qualification inspects at least five current public businesses per vertical. The R1 set is exactly those 15 or more businesses plus a recorded replacement ledger. Dead, changed, failed, and replaced sources remain in the denominator history.

Each case stores capture time, normalized content hash, source, ProjectId where applicable, exact RouteKey, observations, sealed labels, and expiry. Recapture occurs at the earliest evidence TTL and at least every 7 calendar days through R1 to R4.

A hash-identical recapture refreshes timestamps and endpoint proofs without making the route unavailable and without starting a new blind cycle.

A material content-hash change, target change, RouteKey-meaning change, or channel-semantic change triggers fresh sealed evidence, a fresh blind label cycle, and deterministic reclassification. Until completion, the acquisition scope is unavailable and any public project using it downshifts or Blocks. A daily service checks due and overdue recertification. Non-semantic bytes excluded by the versioned normalizer do not constitute a material change; changing the normalizer creates a new qualification version and full suite rerun.

### 15.9 Operational drills

Signed-manifest staging must prove:

- first transient, early success, second failure after 15 minutes, and missed 30-minute recheck;
- unsafe target, key/artifact/target revocation, deletion, expiry, semantic contradiction, and heartbeat loss;
- simultaneous writers, stale CAS, crash before commit, retry, and pointer outage;
- key overlap and emergency revocation;
- fallback, fallback failure, Blocked, and HumanRepublish;
- client clock skew, storage reset, replay, stale cache attempts, offline activation, and an open page beyond lease;
- alert-delivery failure and retention/deletion jobs.

Every drill asserts public state, maximum exposure, audit event, alert, and recovery owner. It never submits or contacts a business.

## 16. Rollout

### R0: Lab qualification

All deterministic, corpus, holdout, rendered, accessibility, privacy, security, artifact, mutation, and operations suites pass. The independent verifier and release owner sign the production-candidate manifest.

### R1: Live shadow

For at least 14 consecutive days, the system produces sealed decisions, artifacts, and alerts for the bound 15-or-more business live set but publishes no CTA. Requirements:

- all three verticals represented;
- zero P0 and no unresolved P1;
- zero false-positive strength or target errors;
- at least 95 percent exact class and target agreement with sealed ExpectedLabels;
- remaining misses only conservative unresolved or Blocked;
- strength distribution and confusion matrix reported so under-publication remains visible;
- every drift event reaches its expected recommendation within its bound.

### R2: Internal preview

For at least 7 consecutive days, access-controlled agency preview sites use signed manifests and local or synthetic targets. All operational drills run twice, including once by an operator other than the builder. Zero P0/P1 and 100 percent expected state transitions are required.

### R3: Controlled client pilot

At least three consenting public client sites across at least two verticals run for 30 consecutive days using signed-manifest hosting, current evidence, named on-call ownership, and explicit client approval of destinations and copy.

Each participating vertical exercises every target channel its pack may publish plus at least one fallback and one unavailable or Blocked path. A synthetic access-controlled mirror may prove a missing mechanical path but does not count as live business evidence.

R3 remains vertically incomplete until R4. Any P0 stops pilot acquisition. A project P1 downshifts or Blocks the project and pauses expansion until root cause and regression proof are complete.

### R4: Limited availability

R4 starts only after R3 exits successfully. At least six consenting signed-manifest client sites, with all three launch verticals represented across the set, must each complete 30 consecutive R4 days. R3 days do not count toward this duration. All blocking gates remain green, no P0/P1 remains open, live evidence and drills are current, and the owner signs the qualification manifest.

Manual-invalidation projects cannot count toward automatic-protection qualification. No stage may be skipped. Calendar time cannot override evidence.

R0 through R2 are post-authorization stages. This PRD does not authorize them. Code work begins only after the owner approves a dependency-ordered implementation plan that preserves this contract or explicitly identifies a proposed contract change. After authorization, lack of clients may pause R3 and R4 without invalidating completed R0 through R2 evidence.

## 17. Success metrics

### 17.1 Safety and truth

These qualification metrics apply to signed-manifest hosting. Manual-invalidation hosting is reported separately and cannot satisfy them.

The following must remain zero:

- false scheduler or confirmation promises;
- unauthorized upgrades;
- ProjectId or RouteKey leakage;
- acquisition navigation after a required fail-closed result;
- identity, clinical, payment, secret, or prohibited analytics fields collected or logged.

The following must remain 100 percent:

- published decisions supported by current eligible evidence and an approved artifact;
- blocking Universal Quality Contract, render, accessibility, privacy, and security gates;
- live decisive unsafe or revocation events stop CTA lease issuance within 5 minutes;
- transient episodes downshift or Block within 30 minutes absent success;
- alert and drill records identify an owner and recovery action.

### 17.2 Quality and agency operations

- R1 exact class and target agreement: at least 95 percent, with zero false positives;
- proposal calibration among non-Blocked pilot proposals is diagnostic only and is reported by whether humans accept, weaken, strengthen, change target, reject, or Block;
- required human weakening, rejection, or Blocked is a successful safety gate, never a release-quality failure. An over-strong proposal is still recorded as a diagnostic proposer error and reruns affected gates;
- human strengthening or target change never bypasses fresh evidence and HumanRepublish;
- post-candidate review time is diagnostic only. A `standard_site` is a signed-manifest site with one certified vertical pack, no more than 12 acquisition scopes, no unavailable evidence, and no client-response wait during the measured interval;
- wall-clock intake-to-approved-release, including evidence research, unavailable time, and client response, is mandatory diagnostic reporting and cannot become a delivery-speed or sales claim;
- pointer endpoint from the supported launch region: p95 no more than 250 ms and p99 no more than 750 ms without relaxing validation.

Proposal distribution must be reported by vertical and scheduler, request, contact, and Blocked result so conservative gaming remains visible.

### 17.3 Diagnostic-only events

V1 may report handoff impressions, route choices, handoff initiation, launch failure, returned unknown, approval time, fallback frequency, and Blocked frequency. These have no v1 success target and cannot support appointment, conversion, revenue, market-share, or treatment-outcome claims.

## 18. Qualification manifest and stop rules

The immutable, hash-locked `QualificationManifest` contains:

- product commit and every contract, classifier, compiler, renderer, monitor, pack, and config version;
- coverage matrix, exclusion register, corpus, holdout, invariant catalog, and seed hashes;
- deterministic, artifact, render, accessibility, privacy, security, mutation, and operations report hashes;
- live set, replacement ledger, snapshot hashes, blind labels, disagreement records, and recertification status;
- rollout stage, dates, channel/fallback/Blocked coverage, performance, and production service-level reports;
- P0/P1 register, owners, and runbooks;
- independent verifier identity, signature, and date;
- release owner identity, signature, and date;
- exact Grok audit model and verdict as advisory evidence.

The independent verifier is a named human who is not the behavior author, pack author, release owner, or sole author of relevant tests. One person cannot sign both verifier and owner roles.

Missing, stale, mismatched, unsigned, or unavailable manifest data fails qualification.

A daily watch compares current code, config, pack, live evidence, key, drill, monitor, and alert status with the manifest. Drift marks qualification stale, blocks expansion, and downshifts or Blocks affected projects until recertified.

Rollout stops or regresses for:

- any P0;
- repeated same-cause P1;
- a missed fail-closed bound;
- unowned alert;
- missing heartbeat;
- compromised key;
- evidence that the public promise exceeds observable capability.

Restoration requires a root-cause record, regression test, fresh evidence where relevant, affected drills, independent verification, and human approval.

## 19. Implementation authorization boundary

This PRD defines the product and release contract. It does not authorize implementation. After owner review of this written document, the next permitted artifact is a dependency-ordered implementation plan. That plan must preserve the frozen contracts and identify any project contract changes before code work begins.

## 20. Advisory audit record

Every design section received an exact `x-ai/grok-4.6` adversarial review before owner approval. Findings were incorporated and rerun until each section returned `ACCEPT` with no remaining findings.

The final written PRD must also receive a fresh cross-section review against the file itself. That review is advisory and cannot replace the independent human verifier or owner approval required by the qualification contract.
