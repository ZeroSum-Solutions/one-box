# ONE BOX Appointment Acquisition v1

- **Status:** Architecture approved; implementation not authorized
- **Prepared:** 2026-08-27
- **Launch market:** Greater Los Angeles (`greater_los_angeles`)
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
- claim general availability at any v1 stage; R4 is limited availability only;
- treat field-study proportions as estimates of the Los Angeles market.

## 4. Contract hierarchy and authority

The authority order is:

1. Universal Quality Contract
2. core appointment-acquisition contracts
3. exactly one certified vertical policy pack
4. verified business configuration
5. reviewed `CopyKeyMap`, copy dictionary, and dimension-label dictionary
6. brand presentation

Lower layers may narrow, prohibit, or downgrade behavior. They may not weaken a higher-layer requirement, add evidence, mint a target, expand the privacy envelope, lengthen freshness windows, change classifier semantics, publish or cause publication of a positive public action from a non-positive decision, or replace semantic copy with an unreviewed promise.

Verified business configuration is signed declarative data with a closed schema. It may contain enabled service IDs, optional location and provider axes with their enabled IDs, a certified pack-version binding, presentation IDs, a total `serviceCategoryBinding` that maps every enabled service ID to exactly one category enum member, and zero or more `businessProhibitionBinding` records. The closed prohibition enum has one member: `emergency_urgent_adverse`. Each prohibition record binds that member to exactly one enabled service ID; duplicate records or any other member are `blocked: invalid_input`. Its only semantics are the Section 7 step 10 result `blocked: emergency_urgent_adverse`; no compiler, pack, runtime, or prose rule may interpret it otherwise. `visitorKind` is not a config-enabled axis; Section 5.1 resolves it only from current `visitor_kind_distinction` evidence. When location is disabled as a route axis, config must contain exactly one opaque `projectServiceLocationBinding` for the ProjectId; when location is enabled, that binding is forbidden and each RouteKey carries an enabled location ID. Section 15.8 defines the current public evidence required for either form to count toward launch-market qualification. A binding may not name a service that is not enabled. Missing, duplicate, conflicting, extra, or schema-invalid bindings are `blocked: invalid_input`. A well-formed service-category binding whose enum member is not declared by the bound certified pack is `blocked: unclassified_category`. Bindings are data, not classifier predicates. Configuration may not contain executable code, prompts, regular expressions, evidence, raw targets, display strings, addresses, or PII.

AI may propose candidates. It may not verify evidence, classify a route, approve an artifact, publish a release, or change runtime state. Deterministic code performs classification and runtime transitions. Named humans approve publication and every restoration or upgrade.

The release compiler has no independent authority. It is a deterministic, pure, versioned, hash-locked transformer from approved contract inputs to render-safe artifacts and the approval bundle. It has no network, clock, AI, or mutable-state input. It may not add evidence, mint or rewrite targets, change a service-category binding, expand the privacy envelope, lengthen an expiry, change classifier semantics, alter the reviewed `CopyKeyMap`, replace reviewed copy or labels, or emit a positive public action from a non-positive decision. Invalid input or non-byte-identical output fails closed. The qualification manifest records its version and every input and output hash.

## 5. Core domain model

### 5.1 Project and exact route identity

`ProjectId` is an opaque, mandatory tenant boundary. For a completed route, the indivisible classification, channel evidence, artifact, episode, control-record, and publication scope is:

```text
AcquisitionScope = (ProjectId, RouteKey)
```

No capability, target, channel observation, target-verification observation, fallback, pointer, counter, or transient episode may merge across either ProjectId or RouteKey. There are exactly two scope-fact exceptions: every RouteKey completed from the same RouteShapeScope may cite that scope's single active `visitor_kind_distinction` observation, and every completed RouteKey with the same MarketLocationScope may cite that scope's single active `market_location_eligibility` observation. Neither scope fact carries visitorKind, channel, typed target, fallback, artifact, pointer, or lease data, and neither transfers channel strength between AcquisitionScopes. Every other observation class remains AcquisitionScope-local and cannot merge. ProjectId is present in authoritative internal records and signed artifacts but forbidden from analytics, general logs, dashboards, and audit summaries.

Route shape is resolved before `RouteKey`. The closed pre-shape scope is:

```text
RouteShapeScope = (ProjectId,
                   service,
                   location iff enabled by verified business configuration,
                   provider iff enabled by verified business configuration)
```

Only `visitor_kind_distinction` observations bind to `RouteShapeScope`; they never carry visitorKind, channel evidence, a target, fallback, artifact, pointer, or lease. Every RouteKey completed from that RouteShapeScope may cite the same single active distinction observation. `market_location_eligibility` binds only to MarketLocationScope under the second exception above. Every channel and target-verification observation binds to one completed AcquisitionScope and is never shared across RouteKeys.

Before a RouteKey exists, an unresolved correction presentation uses the closed non-launchable scope:

```text
PresentationScope = (ProjectId,
                     canonical PartialRouteInput,
                     UnresolvedDecision.reasonCode)
```

PresentationScope may identify only an unresolved presentation artifact, its reviewed dimension labels, and its `PublicRouteOption[]`. It is not an AcquisitionScope, cannot carry a typed target or channel evidence, cannot own a fallback ladder or transient episode, and can never receive a CTA-bearing lease. PresentationScopes do not merge across ProjectId, canonical partial input, or reason code.

`RouteKey` is the indivisible classification and publication scope after shape resolution:

```text
RouteKey = service
         + location iff enabled by verified business configuration
         + provider iff enabled by verified business configuration
         + visitorKind iff visitor_kind_distinction = required
```

`visitorKind` is the closed enum `{new, returning}`. It is required if and only if the current eligible `visitor_kind_distinction` observation returns `required` for the RouteShapeScope, and it is forbidden when that observation returns `not_required`. A missing, stale, duplicate, or conflicting distinction returns `unresolved: route_shape_mismatch` with no launch; no config flag or prose interpretation may decide the shape. A supplied disabled location or provider returns `blocked: prohibited_route_dimension`; an enabled location or provider with an unknown value returns `blocked: invalid_route_dimension`. Visitor-kind validation occurs only after the distinction is resolved: `required` plus an absent value returns `unresolved: missing_visitor_kind`, `required` plus a value outside the closed enum returns `blocked: invalid_route_dimension`, and `not_required` plus any supplied value returns `blocked: prohibited_route_dimension`.

Missing correctable dimensions return unresolved with escaped route options and one closed reason: `missing_service`, `missing_location`, `missing_provider`, or `missing_visitor_kind`. Missing, unknown, or supplied dimensions that violate the certified route shape return Blocked with `invalid_route_dimension` or `prohibited_route_dimension`. Capabilities, targets, evidence, and fallback validity never merge across different acquisition scopes.

The router represents missing correctable dimensions only as:

```text
PartialRouteInput = {
  service?: enabledServiceId,
  location?: enabledLocationId,
  provider?: enabledProviderId,
  visitorKind?: new | returning
}
```

`PartialRouteInput` exists only long enough to return one `missing_*` unresolved decision and, when human-approved, identify its PresentationScope. It cannot carry or select a candidate mode, candidate target, channel evidence, fallback, AcquisitionScope artifact, CTA-bearing pointer, or lease. Such a combination is `blocked: invalid_input`. Once the supplied fields and current distinction complete the configured route shape, the caller must submit a `RouteKey`; a complete shape represented as `PartialRouteInput` is `blocked: invalid_input`. An incomplete input returns exactly one reason in this priority order: `missing_service`, then `missing_location` when location is enabled, then `missing_provider` when provider is enabled, then `missing_visitor_kind` when the current distinction is `required`. It returns reviewed options only for that first missing axis. Classification may consume channel evidence only after the input completes one RouteKey. Completed AcquisitionScopes never share channel or target-verification observations; they may cite their shared RouteShapeScope distinction as specified above.

The router may ask only for:

- service;
- location when enabled by verified business configuration;
- provider when enabled by verified business configuration;
- conditional `new` or `returning` status.

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

Every channel or target-verification observation records:

- unique observation ID and append-only supersession relation;
- opaque ProjectId and exact RouteKey;
- observation class and closed result;
- normalized target reference;
- public source and capture timestamp;
- verifier identity and verification method;
- content or artifact hash;
- evidence-specific expiry.

`visitor_kind_distinction` instead records a unique observation ID, append-only supersession relation, RouteShapeScope, closed result, public source and capture timestamp, verifier identity and method, content hash, and evidence-specific expiry. It contains no RouteKey, visitorKind, target, or channel fact.

`market_location_eligibility` binds to `MarketLocationScope=(ProjectId, enabledLocationId|projectServiceLocationBinding)`. It records a unique observation ID, append-only supersession relation, that exact scope, the closed result `in_bound|out_of_bound`, public source and capture timestamp, verifier identity and method, the frozen boundary version and hash, content hash, and evidence-specific expiry. It contains no channel, typed target, fallback, or availability fact. The read-only verifier may inspect only the public service-location identity and boundary evidence and must stop before identity entry, authentication, contact, submission, or private data.

Eligibility is evaluated inside one candidate evidence projection, not globally across every observation for an AcquisitionScope. Within one projection, there may be only one active, non-superseded observation for each required class. Duplicate-class facts, conflicting facts, an extra class, invalid supersession, or mixed targets make only that projection ineligible. Independent classifier invocations for the same AcquisitionScope may cite disjoint channel classes and different normalized targets for a primary and weaker fallbacks. Those projections remain isolated and may never be combined, spliced, or compared to strengthen a decision.

### 6.2 Independent evidence channels

The closed observation classes and results are:

- `visitor_kind_distinction`: `required` or `not_required`;
- `market_location_eligibility`: `in_bound` or `out_of_bound`;
- `scheduler_surface`: `present` or `absent`;
- `scheduler_route_meaning`: `care`, `consultation`, or `neither`;
- `request_scheduling_payload`: `present` or `absent`;
- `request_staff_followup_promise`: `present` or `absent`;
- `contact_channel`: `published` or `absent`;
- `contact_orientation`: `scheduling_oriented`, `generic`, or `negative`;
- `web_endpoint`: `verified`, `unreachable`, or `unsafe`;
- `public_contact_match`: `verified`, `mismatch`, or `absent`.

Every completed-route candidate requires one current, unique, eligible `visitor_kind_distinction` observation for its RouteShapeScope and one current, unique `market_location_eligibility=in_bound` observation for its MarketLocationScope. Candidate invocations for one AcquisitionScope may cite the same location observation as a scope fact; it cannot transfer channel strength. Channel and target-verification requirements are otherwise closed by candidate mode and typed-target kind:

| Candidate mode | Legal target kind | Required channel observations | Required target-verification observation |
|---|---|---|---|
| `scheduler` | verified `https` web destination | `scheduler_surface` and `scheduler_route_meaning` | `web_endpoint`; never `public_contact_match` |
| `request` | verified `https` web destination | `request_scheduling_payload` and `request_staff_followup_promise` | `web_endpoint`; never `public_contact_match` |
| `contact` | verified `https` web destination | `contact_channel` and `contact_orientation` | `web_endpoint`; never `public_contact_match` |
| `contact` | public business telephone, SMS, or scheduling email | `contact_channel` and `contact_orientation` | `public_contact_match`; never `web_endpoint` |

Every other mode-target pair is `blocked: invalid_input`. A required target-verification observation binds to the same normalized target as the channel observations. An observation marked "never" for that row is extra evidence and makes the request `blocked: invalid_input`; it cannot strengthen or repair the required projection.

Scheduler, request, and contact observations remain independent per candidate projection. A scheduler label, vendor identity, or familiar scheduler interface does not prove inventory. A request form does not prove staff confirmation unless both request observations return `present` for the same acquisition scope and target. A contact candidate requires `contact_channel=published` and `contact_orientation=scheduling_oriented`; other closed results cannot support it. A legal scheduler or request web projection and a separate contact phone, SMS, or email projection may coexist for one AcquisitionScope because neither projection contributes evidence to the other.

`HandoffMode=request` is legal only when both request observations are current, `present`, unique, non-conflicting, and bound to the same web target. Otherwise that candidate cannot emit request and Section 7 assigns the result. A separate contact candidate may emit contact only through its independently eligible projection.

Scheduler candidates require `scheduler_surface=present` and a `scheduler_route_meaning` result of `care` or `consultation` that matches the bound pack-category class. These closed observations replace prose-only route-shape, route-meaning, and contact-orientation tests. Scheduler evidence does not prove that ONE BOX owns inventory or that a future visit will complete.

Closed non-positive results have one disjoint outcome family:

- Channel-negative results are `scheduler_surface=absent`, either request observation=`absent`, `contact_channel=absent`, or `contact_orientation=negative`. They are `blocked: evidence_ineligible` under Section 7 step 7.
- Section 9.5 semantic incompatibilities are `scheduler_route_meaning=neither`, a `care` versus `consultation` route-meaning mismatch, or `contact_orientation=generic`. They are `blocked: category_mode_mismatch` under step 12, not step 7.
- Target mismatch results are `web_endpoint=unreachable` or `public_contact_match=mismatch|absent`. They are `blocked: endpoint_not_reachable` under step 9.
- Target-safety results are `web_endpoint=unsafe`. They are `blocked: endpoint_unsafe` under step 9. Post-publication key, artifact, target, or project revocation is not an observation result and is handled only by `SafetyBlock`.

### 6.3 Freshness

The verifier and classifier derive freshness from capture timestamps. They ignore stored `fresh` or `stale` labels.

- scheduler surface and route-meaning evidence expires after 7 days;
- visitor-kind-distinction evidence expires after 7 days;
- market-location-eligibility evidence expires after 30 days;
- request and contact semantics expire after 30 days;
- web endpoint reachability and target-safety checks expire after 24 hours;
- public phone, SMS, or email publication evidence expires after 30 days.

During InitialPublish or HumanRepublish, the classifier derives each absolute expiry as `captureTimestamp + the Section 6.3 TTL` and compares it with the bundle's classificationTime. ClassificationTime does not change the formula. Publication seals those instants without rewriting them. Pointer and runtime code cannot read raw capture timestamps; they treat the signed absolute expiry instants as authoritative and still ignore freshness labels. Expiry has no grace period, and no layer may lengthen a TTL. Stale evidence cannot upgrade or preserve a decision.

## 7. Deterministic classifier

The classifier is a sealed, pure function with no network I/O. Its request is a closed discriminated union:

```text
RouteResolutionRequest = {
  routeInput: PartialRouteInput,
  candidateMode: null,
  candidateTarget: null,
  sealedEvidenceProjection: RouteShapeEvidenceProjection
}

CandidateClassificationRequest = {
  routeInput: RouteKey,
  candidateMode: scheduler | request | contact,
  candidateTarget: TypedTarget,
  sealedEvidenceProjection: CandidateEvidenceProjection
}

classify(ProjectId,
         request: RouteResolutionRequest | CandidateClassificationRequest,
         certifiedPack,
         verifiedBusinessConfig,
         classificationTime)
  -> SealedDecision
```

`RouteShapeEvidenceProjection` is empty while service, enabled location, or enabled provider remains missing. Once those fields identify one RouteShapeScope, the projection contains at most the one active `visitor_kind_distinction` fact for that scope and no channel observation. Supplying an observation before the scope is identifiable, or supplying a candidate mode, candidate target, or channel observation with `PartialRouteInput`, is `blocked: invalid_input`.

`classificationTime` is one mandatory absolute instant sampled once by the publication service from the control-plane clock and hash-locked into the approval bundle before its classifier invocations. The pure classifier derives each absolute expiry from the cited capture timestamp and Section 6.3 TTL. A positive decision is illegal unless every cited expiry is strictly later than classificationTime. Separate candidate-classification invocations may produce a primary and independently eligible fallbacks for the same completed acquisition scope. Cross-channel observations are never combined into one candidate projection.

`SealedDecision` is a closed union. Every invocation returns exactly one member, and every member carries one closed reason code:

```text
EvidenceCitation   = { observationId, observationClass, absoluteExpiry }

PositiveDecision   = { result: positive, reasonCode: eligible_candidate,
                       classificationTime,
                       JourneyPromiseClass, HandoffMode, typedTarget,
                       evidenceCitations: nonempty canonical set<EvidenceCitation> }
UnresolvedDecision = { result: unresolved, reasonCode: route_shape_mismatch |
                       missing_service | missing_location | missing_provider |
                       missing_visitor_kind | endpoint_unverified,
                       decisionScope: PresentationScope | AcquisitionScope,
                       JourneyPromiseClass: unclassified,
                       HandoffMode: blocked, typedTarget: null,
                       publicRouteOptions?: PublicRouteOption[] }
BlockedDecision    = { result: blocked,    reasonCode: invalid_input |
                       prohibited_route_dimension | invalid_route_dimension |
                       evidence_ineligible | endpoint_not_reachable |
                       endpoint_unsafe | out_of_scope |
                       market_location_ineligible |
                       emergency_urgent_adverse | ambiguous_non_contact |
                       unclassified_category | category_mode_mismatch,
                       JourneyPromiseClass: unclassified,
                       HandoffMode: blocked, typedTarget: null,
                       publicRouteOptions: null }
```

For `missing_*` and `route_shape_mismatch`, `UnresolvedDecision.decisionScope` is the exact PresentationScope. For `endpoint_unverified`, the RouteKey is complete and `decisionScope` is the exact AcquisitionScope. A `BlockedDecision` carries no route options under either input shape.

`PositiveDecision.evidenceCitations` contains exactly one entry for every current observation the decision relies on, including `visitor_kind_distinction`, `market_location_eligibility`, every required channel observation, and the one required target-verification observation from Section 6.2. Observation IDs are unique, and the closed set has one canonical serialization ordered by observation ID. The set cannot be empty, and every absolute expiry must be strictly later than classificationTime. A missing, extra, duplicate, non-canonical, or altered citation makes the decision invalid. The compiler must copy this sealed set byte-for-byte into an artifact; it may not derive, omit, add, or change an instant.

A candidate evidence projection is eligible only when:

- its `visitor_kind_distinction` belongs to the exact RouteShapeScope from which the RouteKey was completed;
- its `market_location_eligibility=in_bound` observation belongs to the exact MarketLocationScope selected by the RouteKey location or inherited project binding;
- every channel and target-verification observation belongs to the same ProjectId, RouteKey, normalized target, and candidate channel;
- every required observation is current, schema-valid, unique, active, and correctly superseded;
- no required fact conflicts with another active fact; and
- it contains exactly the observation classes required by the Section 6.2 matrix and satisfies the corresponding closed-result requirements.

`web_endpoint` and `public_contact_match` remain mutually exclusive target-verification facts for one candidate request. Absence or staleness of the required fact produces `unresolved: endpoint_unverified`; a closed mismatch, unreachable, or unsafe result produces the Section 6.2 Blocked reason.

Missing, stale, duplicate, conflicting, mixed-target, mixed-channel, extra, or invalidly superseded facts cannot produce a positive decision. The ordered rows below assign their only result.

Evaluation order is total and stops at the first matching row:

1. Invalid ProjectId, request variant, schema, pack, config, candidate mode, target, mode-target pair, extra projection class, missing, duplicate, conflicting, extra, or schema-invalid service-category binding, or any business-prohibition member outside `emergency_urgent_adverse` returns `blocked: invalid_input`. `PartialRouteInput` combined with a candidate mode, candidate target, or channel observation also returns this result.
2. For service, location, and provider only, a supplied disabled axis returns `blocked: prohibited_route_dimension`; an enabled axis with an unknown supplied value returns `blocked: invalid_route_dimension`. This row never evaluates `visitorKind`.
3. An incomplete `PartialRouteInput` returns exactly one unresolved reason in this priority order: `missing_service`, `missing_location`, `missing_provider`, then `missing_visitor_kind` after a current distinction returns `required`. It includes reviewed `PublicRouteOption[]` only for that first missing axis and reads no channel evidence.
4. A well-formed enabled-service binding whose category enum member is not declared by the bound certified pack returns `blocked: unclassified_category`.
5. A missing, stale, duplicate, or conflicting `visitor_kind_distinction` observation for the completed RouteShapeScope returns `unresolved: route_shape_mismatch`.
6. After a unique current distinction exists, `required` plus an absent visitorKind returns `unresolved: missing_visitor_kind`; `required` plus a value outside `{new, returning}` returns `blocked: invalid_route_dimension`; `not_required` plus any supplied value returns `blocked: prohibited_route_dimension`. A `PartialRouteInput` with no missing configured axis after this evaluation is complete-shape misuse and returns `blocked: invalid_input`; the caller must use `RouteKey`.
6a. A missing, stale, duplicate, conflicting, or `out_of_bound` `market_location_eligibility` observation for the completed RouteKey's MarketLocationScope returns `blocked: market_location_ineligible`.
7. After the RouteKey is complete, a missing, stale, duplicate, conflicting, mixed-target, mixed-channel, or invalidly superseded required scheduler, request, or contact channel observation returns `blocked: evidence_ineligible`. The channel-negative results enumerated in Section 6.2 return the same result. This row never evaluates `web_endpoint` or `public_contact_match`, and it does not consume Section 9.5 semantic incompatibilities.
8. A missing, stale, duplicate, conflicting, mixed-target, or invalidly superseded required `web_endpoint` or `public_contact_match` observation returns `unresolved: endpoint_unverified`.
9. `web_endpoint=unreachable` or `public_contact_match=mismatch|absent` returns `blocked: endpoint_not_reachable`. Only verifier-sealed `web_endpoint=unsafe` returns `blocked: endpoint_unsafe`. Post-publication key, artifact, target, or project revocation is a Section 11 `SafetyBlock` event, not a classifier input or reason.
10. A `serviceCategoryBinding=emergency_urgent_adverse` or an exact enabled-service `businessProhibitionBinding=emergency_urgent_adverse` returns `blocked: emergency_urgent_adverse`; every other `out_of_scope` category returns `blocked: out_of_scope`; an unclassified pack category returns `blocked: unclassified_category`.
11. An `ambiguous` category with a scheduler or request candidate returns `blocked: ambiguous_non_contact`.
12. `scheduler_route_meaning=neither`, a care-versus-consultation route-meaning mismatch, `contact_orientation=generic`, or any other category, mode, target, or channel-semantics combination not admitted by Section 9.5 returns `blocked: category_mode_mismatch`.
13. The remaining fully eligible Section 9.5 combination returns `positive: eligible_candidate` with the exact promise class, handoff mode, typed target, and nonempty citation set defined above.

No input may fall through. Contradictions appear only through the closed results above; annotations cannot change a result. An invocation cannot repair another invocation, splice fields, combine evidence, join strengths, or cause a side effect.

An unresolved result may carry `PublicRouteOption[]` values that help the visitor correct its first missing route dimension. Each option contains only one enabled dimension ID and keys from a reviewed, versioned, hash-locked dimension-label dictionary in the approval bundle. It contains no ad-hoc display string, typed target, sealed availability flag, or launch authority. Selecting an option produces a new canonical `PartialRouteInput` and reruns route resolution.

Serve-time handoff status is evaluated only when that option, the already supplied dimensions, and the current distinction for the resulting RouteShapeScope complete exactly one RouteKey. The renderer may then perform one current same-origin status-only probe for that exact AcquisitionScope and display only the reviewed marker key `route_option_cta_lease_would_issue` or `route_option_cta_lease_would_not_issue` from the response. The status-only response schema has exactly one field, `markerKey`, whose value is one of those two keys; it cannot contain metadata or mint, copy, expose, or return a lease, typed target, activation token, target reference, pointer body, or other launch material. The CTA-lease endpoint is forbidden for option rendering. The keys mean only that a later independent activation check would currently be eligible to issue a website handoff lease; they cannot use inventory, slot, booking, reservation, or confirmation wording. If any later axis remains missing or the distinction does not resolve exactly one RouteKey, the option is a choosable correction label only: it is non-launchable and carries no status marker. No sibling scope may authorize it. Selecting any option creates a new `PartialRouteInput` and reruns resolution. Even the positive marker does not launch; launch requires later submission of the completed RouteKey and a new CTA-bearing lease fetched only after that completed RouteKey is submitted.

## 8. Public handoff and rendering contract

### 8.1 Truthful public copy

The versioned, reviewed, hash-locked `CopyKeyMap` is a total mapping from `(JourneyPromiseClass, HandoffMode, typedTarget.kind|null)` to one canonical ordered set of copy keys. Each entry's keys are reviewed for that exact maximum promise and action strength; non-positive tuples use `typedTarget.kind=null` and cannot contain acquisition-action keys. The map also reserves exactly two route-option marker keys: `route_option_cta_lease_would_issue` and `route_option_cta_lease_would_not_issue`, with the narrow meanings defined in Section 7. Their reviewed display strings must say only whether a website handoff is currently available; they must not mention inventory, slots, booking, reservation, or confirmation. A declarative pack selector may narrow an entry only to a reviewed alternative set already declared by that same map entry; it cannot select another tuple, add a key, or increase scheduler, confirmation, request, or contact strength. The map version, hash, input tuple, selector, marker keys, and resolved key set are part of the immutable approval bundle. Missing, duplicate, ambiguous, unknown, or strength-increasing resolution fails closed.

The reviewed copy dictionary maps each resolved semantic key to an exact display string. Route correction labels come from a separate reviewed dimension-label dictionary that maps enabled service, location, and provider IDs plus the closed `new` and `returning` visitor-kind members to exact display strings. The compiler copies the resolved copy keys and dictionary bindings byte-for-byte into the artifact. It cannot choose or rewrite them. The renderer fails closed on a missing key, unknown dimension ID, version mismatch, hash mismatch, or non-identical copied key set. Any map, selector, key-set, or display-string change requires HumanRepublish.

Brand presentation may change visual treatment. It may not change approved words or alter scheduler, confirmation, request, or contact strength.

- scheduler copy may promise only the exact care or consultation surface supported by current evidence;
- request copy states that staff must review, match, confirm, or schedule the request;
- contact copy uses only `Call`, `Text`, `Email`, or `Contact the office` semantics;
- blocked and unresolved states offer no launchable acquisition target;
- external returns always become `returned_unknown` and never imply booking success.

A mix of the two reviewed route-option marker keys is a rendering condition only. It emits no additional sentence, classifier reason, runtime reason, or analytics event. `partial_route_availability` is not a v1 closed reason or event and must not be emitted. Options that do not yet complete one RouteKey are correction labels and receive no marker. Compile-time sibling decisions and sealed option flags are not authority, and the renderer may not infer a marker or launch from a sibling scope.

### 8.2 Launch behavior

The handoff is one-way and top-level. ONE BOX does not embed or control the destination.

Before explicit activation, the page must not create a vendor request through an iframe, popup, webview, prefetch, preconnect, speculation rule, service worker, or query enrichment. The activation launches only the exact approved typed target after current pointer validation.

Blocked and unresolved directory information may contain reviewed labels but no typed target or contact value. A contact value renders only inside the activation control for a separate, current positive contact decision.

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

Events, general logs, dashboards, audit summaries, alerts, tickets, on-call payloads, and operator exports may include only opaque non-reversible IDs and closed enums such as mode, target kind, versions, and reason codes. They must not contain ProjectId, RouteKey, service, location, provider, visitorKind, full or partial URLs, reversible target references, or full or partial contact values. Typed targets remain confined to signed render-safe artifacts and the approved positive activation path.

They must not include identity, health, free text, booking or confirmation status, revenue, payment, or treatment information.

SMS and email drafts are assembled only from reviewed copy keys plus escaped labels for enabled route dimensions from the approved dimension-label dictionary. They contain no free text, identity, clinical or diagnostic information, insurance data, payment data, or unreviewed string. The acceptance harness cancels before connection or send.

## 9. Vertical policy packs

### 9.1 Pack format and change authority

Packs are signed, versioned, declarative data using closed enums. They cannot contain executable code, prose instructions, URLs, vendor rules, business facts, evidence, PII, prompts, regular expressions, or safety copy.

Patch releases may add a prohibited-claim enum member only when the pack maps that member declaratively to an existing `BlockedDecision` reason code. The member cannot add classifier or runtime behavior, and it remains inactive until recertification and reclassification complete. Patch releases may add only selectors for reviewed alternatives already present in the applicable `CopyKeyMap` entry; selectors cannot name arbitrary keys or a stronger tuple. Packs may not add display strings. Any behavior change or new reason code is breaking and requires recertification, exact-model audit, human approval, and reclassification of affected RouteKeys.

All packs inherit the universal `emergency_urgent_adverse` category. It is always `out_of_scope`, exposes no acquisition CTA, and cannot receive pack-authored safety copy. The classifier emits `blocked: emergency_urgent_adverse` only when the signed `serviceCategoryBinding` or a closed verified-business-config prohibition names that exact enum. Similarity, embedding, confidence, uncertainty, AI output, and prose judgment are not classifier, compiler, or runtime inputs. Human uncertainty during blind labeling uses the canonical `dual_label_unresolved` Blocked tuple and does not add a classifier reason.

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
| `emergency_urgent_adverse` | any candidate | `unclassified` | `blocked` |
| `unclassified` category | any candidate | `unclassified` | `blocked` |

Every out-of-scope category, including `membership_or_package` and `class_or_group`, exposes no acquisition CTA. Ambiguous and unclassified categories cannot emit scheduler or request.

A care promise is structurally valid only with a final scheduler channel, exact current care evidence, a current safe endpoint, and a compatible care category. Consultation scheduler, request, and contact decisions require their own independent evidence and receive their own promise keys. No weaker channel may inherit a care or confirmed-scheduler promise.

## 10. Release artifact and publication model

### 10.1 Approval bundle

An AcquisitionScope release contains one primary decision and a closed fallback topology for that exact scope. Each decision comes from its own deterministic classifier invocation over its own eligible sealed evidence projection and the same hash-locked classificationTime. Independent decisions may cite disjoint channel classes and different normalized targets; their projections never combine to strengthen a decision. A PresentationScope release contains exactly one unresolved decision and its pre-signed target-null, option-null Blocked artifact; it has no positive decision or fallback ladder. The approval bundle records the classification instant, each positive decision's exact nonempty `evidenceCitations` set, and the `CopyKeyMap` version, hash, input tuple, optional pack selector, and resolved canonical key set.

V1 permits exactly these non-Blocked mode chains before the mandatory pre-signed Blocked artifact: `scheduler`; `scheduler>request`; `scheduler>contact`; `scheduler>request>contact`; `request`; `request>contact`; or `contact`. Scheduler and request targets are web. A contact member selects exactly one legal contact target kind. There is at most one artifact per mode, at most two non-Blocked fallbacks, and at most three non-Blocked artifacts total. Every fallback must be strictly weaker than the preceding member. A duplicate mode, stronger or same-strength fallback, longer chain, second contact target, or any other topology fails compiler and publication gates with no install.

Atomic install computes one closed initial runtime selection before changing the pointer:

1. `ProjectDeleted` rejects install and remains `blocked_terminal`.
2. An unresolved primary that is UnresolvedArtifactValid selects `unresolved_presentation`. Its `HandoffMode=blocked` does not select `blocked_restorable`.
3. A positive primary selects itself when OperationallyAvailable; otherwise install applies the Section 11.1 rule to the approved strictly weaker fallback chain and selects the strongest OperationallyAvailable member.
4. Any other case selects the bundle's pre-signed Blocked artifact as `blocked_restorable`.

The selected artifact, release generation, pointer revision, and bundle install commit atomically. No installed bundle may have an undefined current artifact.

Every positive or unresolved presentation artifact independently passes its applicable classifier, target-nullability, copy, Universal Quality Contract, rendering, accessibility, privacy, analytics, and security gates. Human approval signs the exact immutable bundle hash. Every bundle also contains a pre-signed Blocked artifact.

`releaseId` is the digest of the approval-bundle and artifact-set hash.

### 10.2 Initial publication and human republish

`InitialPublish` exists only when a publication scope, either an AcquisitionScope or PresentationScope, has never had a public pointer.

A positive AcquisitionScope artifact may enter InitialPublish or HumanRepublish only when its sealed decision cites one current `market_location_eligibility=in_bound` observation for the exact MarketLocationScope and copies its absolute expiry into the artifact. With missing, stale, duplicate, conflicting, `out_of_bound`, or mismatched market evidence, that AcquisitionScope may publish only its pre-signed Blocked artifact; every positive or unresolved publication is rejected with the closed gate reason `market_location_ineligible` and leaves the prior pointer unchanged. No pack, config, owner approval, or weaker layer may override this gate.

Publication workflow states are closed: `NeverPublished`, `AwaitingInitialApproval`, `Published`, `AwaitingHumanRestore`, and `ProjectDeleted`. The transition table is total:

| Current state | Authorized actor and event | Next state | Public pointer during or after transition |
|---|---|---|---|
| `NeverPublished` | publication service: `InitialPublishStarted` | `AwaitingInitialApproval` | none |
| `AwaitingInitialApproval` | owner: `InitialPublishApproved`, followed by atomic install | `Published` | new release |
| `AwaitingInitialApproval` | owner or publication service: `InitialPublishRejectedOrAborted` | `NeverPublished` | none |
| `Published` | publication service: `HumanRepublishStarted` | `AwaitingHumanRestore` | prior release |
| `AwaitingHumanRestore` | owner: `HumanRepublishApproved`, followed by atomic install | `Published` | new release |
| `AwaitingHumanRestore` | owner or publication service: `HumanRepublishRejectedOrAborted` | `Published` | prior release |
| `NeverPublished` | deletion service: `ProjectDeletion` | `ProjectDeleted` | none |
| `AwaitingInitialApproval` | deletion service: `ProjectDeletion` | `ProjectDeleted` | none |
| `Published` | deletion service: `ProjectDeletion` | `ProjectDeleted` | pre-signed Blocked; no CTA |
| `AwaitingHumanRestore` | deletion service: `ProjectDeletion` | `ProjectDeleted` | pre-signed Blocked; no CTA |
| `ProjectDeleted` | any event | `ProjectDeleted` | pre-signed Blocked; no CTA |

`HumanRepublishStarted` is the only event that enters `AwaitingHumanRestore`. `ProjectDeletion` is the only event that enters `ProjectDeleted`. Every unlisted actor, event, or guard failure produces no write and leaves both state and pointer unchanged.

After that transition, every non-runtime replacement uses `HumanRepublish`, including update, restore, reactivation, rollout, or rollback. It performs fresh evidence verification, independent classifications, render verification, `AwaitingHumanRestore`, recorded human approval, and atomic publication. It always creates a new immutable bundle and release ID. An old signed release may inform a design but cannot reactivate directly.

HumanRepublish is the only path that may:

- replace a bundle;
- change target or copy behavior;
- exit any nonterminal Blocked state;
- move to a stronger artifact.

`AwaitingHumanRestore` belongs to this publication workflow, not the runtime state machine. Qualification coverage tests it as a publication-workflow state. HumanRepublish atomically closes any open transient episode as `superseded` before it installs the new release.

An unresolved decision may become a signed, human-approved target-null artifact through InitialPublish or HumanRepublish. A `missing_*` or `route_shape_mismatch` decision uses its PresentationScope; `endpoint_unverified` uses its completed AcquisitionScope. It has `JourneyPromiseClass=unclassified`, `HandoffMode=blocked`, no typed target, no channel action, no fallback ladder, and no CTA. Its pointer may serve reviewed copy and, only for PresentationScope, correction labels and options through the `unresolved_presentation` runtime selection, but it may not issue a CTA-bearing lease. A completed RouteKey is a different AcquisitionScope from an incomplete PresentationScope; a new positive artifact still requires fresh candidate classification and its own approved publication.

Presentation states are closed: `positive`, `unresolved`, and `blocked`. They are projections of the corresponding `SealedDecision` member and cannot change its reason, promise class, handoff mode, or target.

### 10.3 Render-safe artifacts and active pointer

Approved artifacts are immutable, same-origin, signed, and render-safe. Every artifact contains exactly one publication scope. AcquisitionScope artifacts may be positive, `endpoint_unverified`, or Blocked. PresentationScope artifacts may be incomplete-route unresolved or the pre-signed target-null, option-null Blocked artifact for that same scope. They contain only:

- opaque ProjectId; exactly one RouteKey or canonical partial-route identity and unresolved reason; release and artifact versions;
- mode and public strength;
- promise; the canonical copy keys copied byte-for-byte from `CopyKeyMap`; and the map, pack-selector, and copy-dictionary versions and hashes;
- dimension-label keys plus the reviewed dimension-label-dictionary version and hash where route options appear;
- escaped route options where allowed;
- typed target where allowed;
- the positive decision's observation IDs and absolute evidence-expiry instants copied byte-for-byte, key ID, counter compatibility, and integrity hashes.

They contain no raw evidence, diagnostics, PII, secrets, or general-log contact values.

For a positive artifact, the compiler must copy the classifier-sealed citation set byte-for-byte. A missing, empty, extra, reordered, or non-identical observation ID or expiry fails compilation and produces no artifact. The compiler has no clock and cannot re-derive an expiry. Runtime and pointer code treat only the signed copied instants as authoritative.

For every artifact, the compiler must copy the `CopyKeyMap` resolution and dictionary binding byte-for-byte. Missing, ambiguous, extra, reordered, non-identical, or stronger keys fail compilation and produce no artifact.

`ActivePublicationManifest` is a closed same-origin pointer union: `ActiveAcquisitionManifest` for one AcquisitionScope artifact or `ActivePresentationManifest` for one PresentationScope artifact. One control record is keyed by that exact scope and separates:

- `releaseGeneration`, changed only by InitialPublish or HumanRepublish;
- `pointerRevision`, changed by every accepted control transaction;
- `runtimeWatermark`, advanced by every accepted runtime observation.

Every write compare-and-swaps all expected counters. A stale writer loses with no public write and records only safe contention metadata.

## 11. Runtime state machine

### 11.1 Validity and selection

At runtime, `BaseArtifactValid` preserves the publication attestation. It requires every sealed absolute evidence-expiry instant to be in the future; valid signatures, hashes, keys, copy- and dimension-label-dictionary bindings, and compatible counters; an unrevoked artifact and project; an unrevoked target when one is present; and no failed closed runtime predicate. Runtime does not read capture timestamps or freshness labels and does not rerun render, accessibility, privacy, analytics, or full security gates. Those gates run only during InitialPublish and HumanRepublish.

`OperationallyAvailable` additionally requires no active unsafe, revoked, integrity, semantic, or terminal transient disqualifier and a monitored target that has not entered a closed immediate-loss family. An `open_degraded` episode caused only by the Section 11.3 reachability-blip guard does not clear OperationallyAvailable and is not a terminal transient disqualifier, so the current CTA may remain until success, an eligible second failure, or deadline. OperationallyAvailable clears on every Section 11.4 `safety_block` member, evidence expiry, approved-surface absence, channel-semantic contradiction, public-contact mismatch, safe target-identity change, deterministic non-blip target unreachability, revocation or integrity failure, and after committed RuntimeDownshift or SafetyBlock. Pointer heartbeat eligibility remains a separate lease predicate and does not redefine target reachability.

`UnresolvedArtifactValid` applies only to a target-null unresolved artifact under its sealed decisionScope. It requires valid signatures, hashes, keys, `CopyKeyMap`, copy- and dimension-label-dictionary bindings, compatible counters, an unrevoked artifact and project, and no failed closed presentation predicate. It never requires a monitored target, never becomes OperationallyAvailable, and never authorizes a CTA or fallback.

For ordinary runtime evaluation:

1. If selection is `unresolved_presentation` and the artifact remains UnresolvedArtifactValid, keep and serve that non-launchable artifact. Do not replace it with pre-signed Blocked solely because it has no target.
2. If an unresolved presentation fails UnresolvedArtifactValid, choose `blocked_restorable`; no options or CTA render.
3. Blocked stays Blocked within the current bundle and runtime control state.
4. If the current positive artifact remains OperationallyAvailable, keep it.
5. Otherwise choose the strongest approved OperationallyAvailable artifact strictly weaker than current.
6. If none exists, choose Blocked.

Unknown fallback state is not valid fallback state.

Runtime selection states are closed: `unresolved_presentation`, `scheduler`, `request`, `contact`, `blocked_restorable`, and `blocked_terminal`. `unresolved_presentation` is outside the public-strength order and cannot transition to a positive selection; it may only remain target-null or become Blocked. Positive runtime may keep a selection, move downward in the scheduler-to-contact order, or enter a Blocked state. Only `ProjectDeleted` maps to `blocked_terminal`. Every other Blocked reason, including revocation, unsafe target, integrity failure, evidence failure, and exhausted fallback, maps to `blocked_restorable`; it may exit only when HumanRepublish completes every Section 10.2 gate. Runtime never performs that exit or any upgrade.

Transient episode states are closed: `none`, `open_degraded`, `resolved_success`, `resolved_downshift`, `resolved_blocked`, and `superseded`. Section 11.3 defines every legal transition. Publication workflow, runtime selection, presentation, and transient episode states do not substitute for or implicitly transition one another.

### 11.2 Authorized post-launch transactions

After InitialPublish, exactly five disjoint transaction types may update control state:

| Transaction | Authorized actor | Effect |
|---|---|---|
| `MonitorMetadata` | designated runtime monitor | update heartbeat or a non-decisive transient episode without changing acquisition selection |
| `RuntimeDownshift` | designated runtime monitor | apply the Section 11.1 selection rule after a closed decisive event, including an eligible second `TransientFailure` or `TransientDeadlineReached`; it cannot skip a valid weaker artifact |
| `SafetyBlock` | trusted control-plane safety identity | select only pre-signed Blocked for every Section 11.4 safety observation and close any open episode as `resolved_blocked`; only this actor may commit SafetyBlock |
| `ProjectDeletion` | deletion service | select pre-signed Blocked, enter `ProjectDeleted`, create the deletion tombstone, and close any open episode as `resolved_blocked` |
| `HumanRepublish` | publication service holding fresh human approval | replace bundle, change target/copy, exit a nonterminal Blocked state, or move upward; it cannot exit `ProjectDeleted` |

Unknown actor, event, missing predicate, or illegal successor produces no write.

The absence of an open transient episode is not a missing predicate or illegal successor for `SafetyBlock`, `ProjectDeletion`, or an otherwise authorized `HumanRepublish`. Those parent transactions must commit their Section 11.2 effects when episode state is `none`; episode closure is then a no-op.

Qualification watches, dashboards, alerts, and manifest comparison jobs are read-only observers of public control state. They are not transaction actors and cannot mutate a pointer, selection, counter, or episode.

### 11.3 Transient reachability episode

Each acquisition scope may have at most one open transient episode. It is bound to the current ProjectId, RouteKey, non-Blocked release ID, and artifact ID. Every transition uses one control-plane monotonic clock sampled once inside the atomic transaction.

`TransientFailure` is closed to a reachability blip: connection timeout, DNS `SERVFAIL` or resolver timeout, connection reset, or HTTP `408|425|429|500|502|503|504` on the currently approved target, with no semantic, target-identity, unsafe, revocation, integrity, evidence-expiry, or market-location guard present. It is mutually exclusive with every immediate event in Section 11.4. An HTTP `404|410` for the exact approved path or a DNS `NXDOMAIN` result confirmed by two independent approved resolvers is deterministic non-blip unreachability. An approved-surface absence, RouteKey-meaning change, channel-semantic contradiction, public-contact mismatch, unsafe or identity/payment/session detection, or revocation can never be labeled TransientFailure, open `open_degraded`, or keep a CTA.

The designated runtime monitor owns both closed transient events. A first or early eligible `TransientFailure` commits only MonitorMetadata and the episode transition. A `TransientFailure` at or after `earliestSecondAt`, or `TransientDeadlineReached` at or after deadline, must CAS-commit RuntimeDownshift and the Section 11.1 selection result in the same transaction. The monitor schedules the deadline event when it opens the episode; missed probes, restarts, or pointer refusal do not cancel that required write. Pointer refusal is an independent lease block, never a substitute for RuntimeDownshift.

Transient transitions use only the closed states from Section 11.1:

| Current state | Closed event and guard | Next state | Effect |
|---|---|---|---|
| `none` | `TransientFailure` satisfying the reachability-blip guard above on the current non-Blocked artifact | `open_degraded` | set `t0`, `earliestSecondAt=t0+15m`, and `deadline=t0+30m`; keep current CTA |
| `none` | `MonitorSuccess` | `none` | update heartbeat only; never revive or strengthen |
| `none` | `HumanRepublishInstalled` | `none` | install the newly approved release atomically; there is no episode to close |
| `none` | `SafetyBlock` or `ProjectDeletion` | `none` | select the required Blocked artifact atomically; there is no episode to close |
| `open_degraded` | `MonitorSuccess` before deadline | `resolved_success` | record success; no selection change |
| `open_degraded` | `TransientFailure` before `earliestSecondAt` | `open_degraded` | record early failure; do not extend either bound |
| `open_degraded` | `TransientFailure` at or after `earliestSecondAt`, including at or after deadline | `resolved_downshift` | execute RuntimeDownshift; a late blip can never become a no-write |
| `open_degraded` | `TransientDeadlineReached` at or after deadline | `resolved_downshift` | deadline wins over a late success; execute RuntimeDownshift |
| `open_degraded` | `HumanRepublishInstalled` | `superseded` | install new release atomically |
| `open_degraded` | `SafetyBlock` or `ProjectDeletion` | `resolved_blocked` | select the required Blocked artifact atomically |
| `resolved_success` | mandatory `TerminalReasonRecorded` continuation | `none` | no open episode remains |
| `resolved_downshift` | mandatory `TerminalReasonRecorded` continuation | `none` | no open episode remains |
| `resolved_blocked` | mandatory `TerminalReasonRecorded` continuation | `none` | no open episode remains |
| `superseded` | mandatory `TerminalReasonRecorded` continuation | `none` | no open episode remains |

The terminal-reason transition and return to `none` commit in the same atomic control transaction, so terminal markers are not durable between parent transactions. If a retry observes an intra-transaction terminal marker, it records the mandatory terminal reason, normalizes the episode to `none`, and then applies an authorized `SafetyBlock`, `ProjectDeletion`, or `HumanRepublishInstalled` parent event in the same CAS transaction. It must not abort that parent transaction because no episode remains open. A later matching failure may open `open_degraded` only for the then-current non-Blocked artifact. Blocked selection rejects transient failures; heartbeat metadata may still update.

The no-write rule for an unlisted state-event pair applies only to an unrecognized transient event or a failed transient guard. It cannot veto an independently authorized Section 11.2 parent transaction. Every event is reclassified after CAS contention, and submitted event labels are not trusted.

### 11.4 Immediate and deterministic transitions

Every non-success monitor observation enters exactly one row in this closed partition. The Section 11.3 blip guard is evaluated before general non-unsafe unreachability; the general family explicitly excludes every blip member. Guards are otherwise evaluated in table order, and a later row cannot consume an earlier-row event:

| Observation family and closed members | Required transaction and actor | Public selection |
|---|---|---|
| `safety_block`: RouteKey meaning absent or changed; `market_location_eligibility=out_of_bound`; unsafe redirect, origin, path, or query; identity, payment, or session parameter; signature, schema, hash, or integrity failure; key, artifact, target, or project revocation | trusted control-plane safety identity commits `SafetyBlock` immediately on deterministic detection | pre-signed Blocked; no weaker CTA |
| `transient_reachability_open`: first eligible Section 11.3 blip, or an eligible repeat before `earliestSecondAt` | designated runtime monitor commits `MonitorMetadata` plus `TransientFailure` and the applicable episode transition | keep current CTA only inside the bounded 15/30-minute episode |
| `transient_reachability_downshift`: eligible `TransientFailure` at or after `earliestSecondAt`, or `TransientDeadlineReached` at or after deadline | designated runtime monitor commits `RuntimeDownshift` and the episode transition in one CAS transaction | strongest independently OperationallyAvailable weaker artifact, otherwise pre-signed Blocked |
| `runtime_downshift`: evidence expiry; approved surface absent; channel semantics contradict sealed mode; normalized public contact mismatch; deterministic non-unsafe, non-blip target unreachability closed to HTTP `404|410` on the exact approved path or DNS `NXDOMAIN` confirmed by two independent approved resolvers; safe normalized target identity change | designated runtime monitor commits `RuntimeDownshift` immediately on deterministic detection | strongest independently OperationallyAvailable weaker artifact, otherwise pre-signed Blocked |

Project deletion is not a monitor observation; the deletion service commits `ProjectDeletion`. Only `transient_reachability_open` may enter or remain `open_degraded` and preserve the current CTA. No safety, transient-downshift, or runtime-downshift member may do so. Pointer refusal independently blocks a lease when its predicates fail, but pointer refusal does not classify the observation or replace the required control transaction.

RuntimeDownshift always applies the Section 11.1 selection rule and cannot skip an OperationallyAvailable weaker artifact. SafetyBlock may bypass weaker artifacts only to remove acquisition capability. SafetyBlock and project deletion atomically close an open episode as `resolved_blocked`; when the episode is `none`, they leave it `none` and still commit the required Blocked selection.

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

Separately, the endpoint may serve a target-null unresolved presentation response when one consistent decisionScope control-record read proves the current artifact is UnresolvedArtifactValid and selection is `unresolved_presentation`. That response contains only reviewed copy and, for a PresentationScope, correction labels; it carries no lease or typed target and cannot be interpreted as a typed Blocked response or positive action. Failure returns typed Blocked with no options or CTA.

For a displayed `PublicRouteOption` that completes exactly one RouteKey under Section 7, the renderer performs one current same-origin status-only probe for that exact AcquisitionScope. The response schema is exactly `{markerKey}` and its value is only `route_option_cta_lease_would_issue` or `route_option_cta_lease_would_not_issue`; no other field is legal, and the probe cannot mint, copy, expose, or return a lease, target, activation material, target reference, or pointer body. The CTA-lease endpoint cannot be called for option rendering. A currently eligible status selects the positive marker; a Blocked, unresolved, failed, or unavailable status selects the negative marker. An option that does not complete exactly one RouteKey triggers no status probe and carries no marker. It remains a non-launchable correction label. The reviewed marker describes only current eligibility for a later website handoff lease, never appointment inventory or outcome. An immutable option artifact cannot preserve the marker, and one scope's response cannot authorize another scope. Selection produces a new PartialRouteInput and reruns route resolution; only later submission of the completed RouteKey may request a fresh CTA lease, and activation performs another fresh validation.

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

V1 monitors only this closed public, non-PII observation allowlist:

- reachability and final origin/path;
- allowlisted query and redirect behavior;
- absence of identity, payment, and session parameters;
- continued public scheduler, request, or contact surface presence;
- current `visitor_kind_distinction` and resulting RouteShapeScope meaning;
- current `market_location_eligibility` against the frozen launch-boundary version;
- continued RouteKey service, location, provider, and required/forbidden visitor-kind shape meaning;
- continued channel semantics for the sealed mode;
- continued publication and normalized match of a public phone, SMS, or email target;
- safe normalized target identity and deterministic reachability;
- signature, schema, hash, key, artifact, target, project, integrity, and revocation state.

It never inspects actual inventory, authenticates, holds a slot, submits, calls, texts, emails, or pays.

Closed semantic failures are:

- approved surface absent: immediate `RuntimeDownshift` by the designated runtime monitor;
- a distinction-result or service/location/provider change that changes RouteKey shape or meaning: immediate `SafetyBlock` by the trusted control-plane safety identity as `route_key_meaning_change`;
- `market_location_eligibility=out_of_bound`: immediate `SafetyBlock` by the trusted control-plane safety identity;
- channel label contradicts sealed mode: immediate `RuntimeDownshift` by the designated runtime monitor;
- normalized public contact no longer matches: immediate `RuntimeDownshift` by the designated runtime monitor.

Unsafe redirect/origin/path/query, identity/payment/session parameters, integrity failure, and revocation are immediate `SafetyBlock` observations. Only a Section 11.3 reachability blip may open `open_degraded`; none of the closed semantic or SafetyBlock observations above may do so.

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

Alerts cover `open_degraded`, fallback, Blocked, expiry, restore required, CAS contention, revocation, heartbeat loss, and manual-invalidation SLA risk. Alert failure is recorded and escalated but cannot open public acquisition.

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
- each of the seven Section 10.1 fallback chains, including every legal contact-target-kind variant, and every forbidden duplicate, non-decreasing, over-depth, or multi-contact topology;
- every actor, event, guard, and member of the closed publication, presentation, runtime-selection, and transient-episode state sets in Sections 10.2, 11.1, and 11.3;
- every Section 11.2 transaction type with its exact authorized actor, precondition, CAS behavior, effect, illegal-actor case, and public-selection outcome;
- every Section 11.4 observation-family member, actor, guard, and public-selection outcome, including each legal contact-target kind, the disjoint first/early blip set, eligible second failure, `TransientDeadlineReached`, deterministic non-blip unreachability, every RuntimeDownshift member, and every SafetyBlock member.

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
- unresolved decisions may be signed only as non-launchable presentation artifacts and never issue a CTA-bearing lease, typed target, or positive public action;
- runtime non-upgrade;
- exhaustive state-machine guards and controlled 15/30-minute boundaries;
- CAS, watermark, replay, key, expiry, revocation, deletion, and monitor-death behavior;
- artifact hashing, signatures, atomic selection, and failed-CAS no-op.

A hash-locked `BlockingInvariantCatalog` maps every P0/P1 invariant to a deliberately violating seed, expected detecting gate, and forbidden survivor. Qualification requires 100 percent mutation kill. No seeded candidate may publish or navigate.

Any classifier, pack, `CopyKeyMap`, copy dictionary, compiler, renderer, monitor rule, threshold, corpus, expected output, invariant catalog, or coverage matrix change creates a new qualification version and reruns the entire blocking suite.

### 15.6 Rendered acceptance

Every legal mode, target, representative vertical, and RouteKey must pass the Section 8 rendering contract plus:

- exact approved promise and recovery copy;
- handoff context limited to allowed route dimensions;
- hostile content and URL payloads fail closed;
- CSP, scheme, origin, path, query, and redirect controls;
- current pointer validation at page load and activation;
- lease expiry, offline, fetch, signature, hash, schema, generation, and revocation failure removes the CTA;
- local or synthetic destinations for automated tests.

Telephone, SMS, and email acceptance runs on a supported mobile OS or official simulator with an instrumented handler or composer. It verifies the scheme, normalized destination, focus, return behavior, and a draft composed only from approved copy keys and escaped enabled route-dimension labels. It rejects free text and identity, clinical, insurance, payment, or unreviewed content, then cancels before a connection or send.

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

R1 scoring normalizes system output through this closed mapping before comparison:

| JourneyPromiseClass | HandoffMode | Closed reason family | safeClass | publicStrength |
|---|---|---|---|---|
| `care_scheduler` | `scheduler` | `eligible_candidate` | `care_scheduler` | `scheduler` |
| `consultation_scheduler` | `scheduler` | `eligible_candidate` | `consultation_scheduler` | `scheduler` |
| `staff_confirmed_request` | `request` | `eligible_candidate` | `staff_confirmed_request` | `request` |
| `contact_only` | `contact` | `eligible_candidate` | `contact_only` | `contact` |
| `unclassified` | `blocked` | any reasonCode declared by `UnresolvedDecision` or `BlockedDecision` in Section 7 | `blocked` | `blocked` |

Any other tuple is invalid and cannot count as agreement. Positive rows require exact normalized typed-target equality. Aligned non-positive rows require a null target and count as class-and-target agreement under the final mapping row; their closed reason remains available for the confusion matrix.

### 15.8 Live recertification

The v1 `LaunchMarketId` enum has one member: `greater_los_angeles`. The location eligibility function is total:

- When location is an enabled route axis, every counted RouteKey must contain one enabled location ID and cite the unique, current `market_location_eligibility=in_bound` observation for `MarketLocationScope=(ProjectId, enabledLocationId)`.
- When location is not an enabled route axis, verified business configuration must contain exactly one `projectServiceLocationBinding` for the ProjectId and every counted AcquisitionScope inherits the unique, current `market_location_eligibility=in_bound` observation for `MarketLocationScope=(ProjectId, projectServiceLocationBinding)`.

Missing, stale, duplicate, conflicting, or `out_of_bound` location evidence is `ineligible`, cannot count, and cannot pass the positive-publication gate in Section 10.2. A multi-location business that needs more than the single project binding must enable location as a route axis; out-of-bound scopes on the same site still do not count or publish a positive CTA. The observation expires after the Section 6.3 30-day TTL and is recaptured at the earlier of material location change, that expiry, or the seven-day live-set cadence below. The reviewed, versioned, hash-locked boundary and point-in-boundary rule are recorded in the `QualificationManifest` and freeze before R1; changing either creates a new qualification version. Each admitted case records the market ID, binding form, location ID or opaque binding, observation ID and expiry, boundary version and hash, public-location evidence hash, and closed `eligible|ineligible` result. Replacements must satisfy the same market rule.

Live qualification inspects at least five current market-eligible public businesses per vertical. The R1 set is exactly those 15 or more businesses plus a recorded same-market replacement ledger. Dead, changed, failed, and replaced sources remain in the denominator history. A non-Los-Angeles fixture may support synthetic or lab evidence only; it cannot count as live market evidence, a live-set replacement, or an R3/R4 client site.

Each case stores capture time, normalized content hash, source, mandatory ProjectId, exact RouteKey, observations, sealed labels, and expiry. Recapture occurs at the earliest evidence TTL and at least every 7 calendar days through R1 to R4.

A hash-identical recapture refreshes qualification live-set currency and endpoint proofs without starting a new blind cycle. It does not rewrite an artifact expiry, preserve a public decision beyond its sealed expiry, issue or extend a CTA lease, replace a bundle, or bypass HumanRepublish. Production remains bound to the sealed absolute expiry, and `evidence_expiry` still requires runtime downshift or Block at that instant.

A material change triggers fresh sealed evidence, a fresh blind label cycle, and deterministic reclassification, but its public transaction is closed by kind:

- `route_key_meaning_change`, `market_location_out_of_bound`, or a material content-hash change that cannot yet be deterministically assigned to a weaker family requires the trusted control-plane safety identity to commit `SafetyBlock` immediately. The pre-signed Blocked artifact remains selected with no CTA until HumanRepublish.
- `channel_semantic_change` or a safe normalized `target_identity_change` requires the designated runtime monitor to commit `RuntimeDownshift` immediately. An independently eligible, OperationallyAvailable weaker fallback may keep its own CTA; otherwise selection is Blocked. The changed channel or target itself remains unavailable until HumanRepublish.

No generic `recertify_unavailable` transaction exists. A daily service checks due and overdue recertification but does not write public state. Non-semantic bytes excluded by the versioned normalizer do not constitute a material change; changing the normalizer creates a new qualification version and full suite rerun.

`DriftEvent`, `ExpectedRecommendation`, and its bound use this closed table:

| DriftEvent | ExpectedRecommendation | Bound |
|---|---|---|
| `route_key_meaning_change` | `safety_block` | trusted control-plane safety identity commits immediately; no CTA until HumanRepublish |
| `market_location_out_of_bound` | `safety_block` | trusted control-plane safety identity commits immediately; no CTA until HumanRepublish |
| `unassigned_material_hash_change` | `safety_block` | trusted control-plane safety identity commits immediately; no CTA until deterministic recertification and HumanRepublish |
| `channel_semantic_change` | `runtime_downshift` | designated runtime monitor commits immediately; only an independently eligible weaker fallback may retain a CTA |
| `target_identity_change` | `runtime_downshift` | designated runtime monitor commits immediately; only an independently eligible weaker fallback may retain a CTA |
| `evidence_expiry` | `runtime_downshift_or_block` | at the sealed absolute expiry instant |
| `decisive_unsafe` | `safety_block` | CTA lease issuance stops within 5 minutes |
| `revocation` | `safety_block` | CTA lease issuance stops within 5 minutes |
| `transient_reachability` | `degraded_then_runtime_downshift_or_block` | the fixed 15-minute second-failure and 30-minute deadline rules in Section 11.3 |

No other event or recommendation may enter the R1 drift metric without a new qualification version.

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
- every counted business satisfies the Section 15.8 `greater_los_angeles` eligibility rule;
- zero P0 and no unresolved P1;
- zero false-positive strength or target errors;
- at least 95 percent exact class and target agreement with sealed ExpectedLabels;
- remaining misses only conservative unresolved or Blocked;
- strength distribution and confusion matrix reported so under-publication remains visible;
- every drift event reaches its expected recommendation within its bound.

### R2: Internal preview

For at least 7 consecutive days, access-controlled agency preview sites use signed manifests and local or synthetic targets. All operational drills run twice, including once by an operator other than the builder. Zero P0/P1 and 100 percent expected state transitions are required.

### R3: Controlled client pilot

At least three consenting, market-eligible public client sites across at least two verticals run for 30 consecutive days using signed-manifest hosting, current evidence, named on-call ownership, and explicit client approval of destinations and copy. Only sites that satisfy the Section 15.8 `greater_los_angeles` rule count toward R3.

Each participating vertical exercises every target channel its pack may publish plus at least one fallback and one unavailable or Blocked path. A synthetic access-controlled mirror may prove a missing mechanical path but does not count as live business evidence.

R3 remains vertically incomplete until R4. Any P0 stops pilot acquisition. A project P1 downshifts or Blocks the project and pauses expansion until root cause and regression proof are complete.

### R4: Limited availability

R4 starts only after R3 exits successfully. At least six consenting, market-eligible signed-manifest client sites, with all three launch verticals represented across the set, must each complete 30 consecutive R4 days. Every counted site satisfies the Section 15.8 `greater_los_angeles` rule. R3 days do not count toward this duration. All blocking gates remain green, no P0/P1 remains open, live evidence and drills are current, and the owner signs the qualification manifest.

Manual-invalidation projects cannot count toward automatic-protection qualification. No stage may be skipped. Calendar time cannot override evidence.

R4 is limited availability for those consenting signed-manifest sites. V1 never claims general availability. Any GA stage, metric, or claim requires a new product contract and is not an outcome authorized by this PRD.

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
- pointer endpoint from the supported launch region, defined as a probe location inside the same Section 15.8 `greater_los_angeles` boundary: p95 no more than 250 ms and p99 no more than 750 ms without relaxing validation.

Proposal distribution must be reported by vertical and scheduler, request, contact, and Blocked result so conservative gaming remains visible.

### 17.3 Diagnostic-only events

The five Section 8.4 names are the exclusive client and analytics events. V1 may derive approval time, fallback frequency, and Blocked frequency only as operator aggregates from dashboard-safe closed enums, versions, and timestamps; they are not events and add no client payload field. A new event name or field is a breaking contract change. These events and aggregates have no v1 success target and cannot support appointment, conversion, revenue, market-share, or treatment-outcome claims.

## 18. Qualification manifest and stop rules

The immutable, hash-locked `QualificationManifest` contains:

- product commit and every contract, classifier, compiler, renderer, monitor, pack, config, `CopyKeyMap`, copy-dictionary, and dimension-label-dictionary version and hash;
- release-compiler input and output hashes;
- coverage matrix, exclusion register, corpus, holdout, invariant catalog, and seed hashes;
- deterministic, artifact, render, accessibility, privacy, security, mutation, and operations report hashes;
- launch-market ID, boundary version and hash, eligibility evidence, live set, same-market replacement ledger, snapshot hashes, blind labels, disagreement records, and recertification status;
- rollout stage, dates, channel/fallback/Blocked coverage, performance, and production service-level reports;
- P0/P1 register, owners, and runbooks;
- independent verifier identity, signature, and date;
- release owner identity, signature, and date;
- exact Grok audit model and verdict as advisory evidence.

The independent verifier is a named human who is not the behavior author, pack author, release owner, or sole author of relevant tests. One person cannot sign both verifier and owner roles.

Missing, stale, mismatched, unsigned, or unavailable manifest data fails qualification.

A daily watch compares current code, config, pack, live evidence, key, drill, monitor, and alert status with the manifest. It may mark qualification stale, block expansion, and dispatch an alert, but it cannot mutate public control state. Any public change enters through the exact Section 11.2 transaction assigned in Sections 11.4 and 15.8: `RuntimeDownshift` for evidence expiry, channel-semantic change, or safe target-identity change; `SafetyBlock` for RouteKey-meaning change, out-of-bound market location, unassigned material hash change, decisive unsafe state, or revocation; `ProjectDeletion` for deletion; or `HumanRepublish` after recertification and human approval. The watch is not a sixth writer.

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
