# ONE BOX Release 1 contract

> Planning-only packet. This document defines the Release 1 boundary and the interfaces that a later implementation plan must satisfy. It does not authorize source-code changes, deployment, provider selection, client invitations, or appointment activation.

> Audit status (2026-08-29): the exact Grok 4.6 lane was unavailable after the
> first phase timed out. The owner-authorized OAuth fallback produced a single
> `REVISE` review; its findings were dispositioned in this packet without a
> second model pass. The review is evidence, not authority. See
> [fallback audit](../../../audits/grok-4.6/2026-08-29-release-1-contract-compatibility-opus-5-fallback-audit.md).

**Goal:** deliver one auditable, provider-neutral intake-to-monitor-to-re-delivery journey for a website candidate while preserving the existing immutable source and approval authorities.

**Architecture:** Release 1 is a closed lifecycle around the existing local-first generation and guarded candidate pipeline. It carries one source authority (`page-ir-v1` or the compatible `template-v1` path) through intake, evidence, candidate creation, core Canvas refinement, private client review, qualification, release preparation, provider execution, public verification, monitoring, rollback, and re-delivery. Automation may propose, validate, compile, observe, and report; named humans retain approval and recovery authority.

**Canonical inputs:**

- [Page IR safe pipeline PRD](../../../specs/2026-08-22-page-ir-safe-pipeline-prd.md)
- [Canvas-to-agency-shipping lifecycle](../../../superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md)
- [Appointment Acquisition v1 PRD](../../../specs/2026-08-27-appointment-acquisition-v1-prd.md), only where this contract names a boundary
- [Foundation index](index.md)

## 1. Release 1 promise

Release 1 proves that ONE BOX can move one website project from approved intake to a verified public artifact and, after a failed monitor or delivery event, to an explicitly authorized re-delivery without losing lineage or silently upgrading behavior.

Release 1 means:

- one project has one current candidate lineage and one selected release lineage;
- the candidate is generated from approved inputs under exactly one immutable layout authority;
- agency Canvas refinement uses typed, reversible mutations and named-human visual review against that exact private candidate;
- the client-facing review surface shows one exact candidate identity and cannot mutate source or live output;
- qualification produces a versioned, hash-bound result before release approval;
- the deployment adapter executes a release-owner decision but cannot create, alter, or approve it;
- monitoring can preserve, block, or request an authorized re-delivery according to a closed reason;
- rollback and re-delivery produce new auditable control actions and never reactivate a stale artifact by filename, timestamp, URL, or visual similarity.

Release 1 does not promise appointment inventory, conversion, booking completion, provider uptime, or a particular cloud product. It also does not establish a general-availability claim.

## 2. Authority and immutability

### 2.1 Layout authority

At intake, the project records `layoutAuthority` as exactly one of:

- `page-ir-v1`: Page IR is the editable source of truth and deterministic code compiles the site;
- `template-v1`: the compatible closed template path is the editable source of truth and its guarded mutation authority remains in force.

The value is immutable for the run. A `page-ir-v1` run cannot import template state as an alternate source, and a `template-v1` run cannot be silently translated into Page IR. Changing the authority requires a new run and an explicit contract decision; it is never a repair, migration, or re-delivery operation.

### 2.2 Candidate authority

Every candidate has a stable project ID, candidate ID, source-authority version, parent candidate ID when applicable, canonical manifest, source hash, rendered-artifact hash, compiler version, and gate receipt. A candidate is immutable after acceptance. A mutation creates a new candidate and must identify the exact parent hash it read.

### 2.3 Release authority

Every release is a separate immutable record bound to one candidate hash, the
current candidate-bound `ClientReviewReceiptV1`, qualification receipt,
two-person release authorization, deployment target descriptor, and deployment receipt.
Release approval is invalid when the client lock is absent, superseded, revoked,
or bound to another candidate. Two distinct active named humans approve the exact release
bundle; the deployment adapter only performs provider operations and reports
receipts.

A release owner may create `ReleaseRevocationV1`, bound to project, release,
candidate, actor, reason code, policy version, and timestamp. Revocation prevents
new deployment, retry, rollback-to, or re-delivery of that release. It does not
silently remove public bytes: the release owner separately authorizes rollback or
an explicit provider control action, both of which return receipts.

### 2.4 Appointment boundary

Release 1 adds no appointment field, slot, lease, target, classifier, handoff, or
runtime behavior to Page IR or `template-v1`. Ordinary website copy and generic
links remain ordinary content and cannot claim booking semantics. Appointment
evidence, publication, monitoring, downshift, revocation, and recovery remain
owned by the Appointment Acquisition v1 contract and are later work.

## 3. Closed Release 1 journey

Each phase has one input boundary, one durable output, and one stop condition. A failed phase leaves the last accepted artifact or state unchanged.

### 3.1 Intake and project freeze

The intake operator records the project identity, approved brief, scope, source references, requested route(s), data-handling boundary, selected `layoutAuthority`, and the named agency owner. Intake accepts no executable instructions, arbitrary deployment configuration, secrets, or unbounded client data.

The intake freeze records the canonical input manifest and its hash. Any material change after freeze opens a new candidate/run path; it does not mutate the frozen input.

**Output:** `IntakeManifestV1` with project identity, source authority, approved inputs, actor, timestamp, and hash.

**Stop:** missing authority, malformed input, unapproved source, secret/PII boundary violation, or an unresolved requirement blocks generation.

### 3.2 Evidence and direction

The system collects only approved evidence and project direction needed to generate the website. Evidence carries source, capture time, rights/provenance note, scope, and hash. AI may summarize or propose; deterministic code and a named reviewer decide what is admitted. Browser capture, private login state, and arbitrary third-party content are not required for Release 1.

**Output:** `EvidenceProjectionV1` and `DirectionManifestV1`, each versioned and
bound to project, admitted source hashes, actor, policy version, and decision.

**Stop:** stale, contradictory, unlicensed, out-of-scope, or unverifiable evidence cannot enter the candidate manifest.

### 3.3 Generation and candidate gates

The generation controller turns the frozen manifest into the chosen source representation. The compiler validates the closed schema, produces a deterministic renderable candidate, and records source, compiler, output, and gate hashes.

Page IR is the required Release 1 source mode. `template-v1` is an optional
compatibility mode only if the admitted fixture proves the same candidate
identity, manifest, content-addressing, gate, review, qualification, release, and
re-delivery contracts. If it cannot, it remains readable/exportable compatibility
outside new Release 1 runs; the system never silently converts it to Page IR.

An agency designer may request one bounded repair of a pre-acceptance failed
candidate. The repair controller, not a model, applies only a closed gate-owned
class of structure-preserving mechanical corrections; it cannot change admitted
evidence, copy, routes, actions, layout authority, scripts, visual direction, or
runtime capability. The result is a new candidate ID with the failed candidate as
parent and must rerun the full applicable gate set. Model output may propose bytes
within the closed repair contract but has no apply authority.

**Output:** `CandidateManifestV1` in the defined `canvas_ready` lifecycle state,
plus `CandidateGateReceiptV1`, both bound to exact source, compiler, artifact, and
policy hashes.

**Stop:** schema, integrity, executable-content, render, privacy, security, accessibility, or required-route failure preserves the prior accepted candidate and produces a blocking report.

### 3.4 Agency Canvas refinement

The agency designer opens the exact private candidate in the existing
single-writer Canvas workbench. Release 1 includes selection, hierarchy,
responsive viewport inspection, selection-scoped proposals, typed Page IR or
guarded template mutations, asset placement through the project library, history,
diff, restore, and named-human visual review. The rendered DOM is a projection,
not editable source. Every applied change names the expected source/candidate
revision, produces a new candidate identity, reruns the capability-aware gate set,
and invalidates any prior client, visual, qualification, or release decision.

Release 1 does not require realtime co-editing, cursors, CRDT Page IR, embedded
browsing, screenshot reconstruction, arbitrary code/DOM editing, general stack
switching, or visual motion-authoring expansion. Existing deterministic and
reduced-motion behavior remains covered; the motion-builder stop remains in force.

**Output:** a designer-accepted candidate plus `CanvasVisualReviewReceiptV1`, a
named-human decision bound to the candidate hash, rubric version, reviewer,
desktop/tablet/mobile evidence hashes, and `approve|revise|blocked` result.

**Stop:** stale selection/revision, unsupported typed capability, gate failure,
failed rollback, accessibility block, or `revise`/`blocked` visual decision
preserves the last accepted candidate and cannot open client review.

### 3.5 Private client review

The client review web surface serves one immutable candidate identity through an expiring, revocable, project-and-candidate-scoped session. It supports responsive viewing, advisory comments, and an approval or changes-requested decision. Client comments are source-linked input, not source, mutation, gate, or release authority. It exposes no source mutation endpoint, live deployment control, provider credential, private evidence, or appointment activation control.

**Remote-hosting gate:** the current loopback application does not satisfy public client access. Before P3 implementation or any public invitation, ADR 0002 must be accepted and a separately accepted migration/provider decision must name the review origin, authentication/session exchange, control-plane and review-record system of record, artifact storage owner, tenant boundary, revocation path, availability/degraded behavior, backup/restore, deletion, and rollback to the loopback-only baseline. Local P3 contract/fixture work may proceed under separate authorization, but a draft topology, reachable URL, or selected host alone cannot authorize public review.

Client approval binds the candidate hash, review artifact hash, reviewer identity, decision time, and unresolved blocking-comment count. A candidate mismatch, revoked session, or unresolved blocking comment cannot create a client lock.

**Output:** `ClientReviewReceiptV1` and either `changes_requested` or `client_locked`.

`changes_requested` returns to agency Canvas refinement. Any applied change creates
a new candidate and requires a fresh visual receipt and client-review session; no
comment or decision carries forward by position or similarity. The agency/project
owner bounds review rounds by the project scope and budget and records an explicit
continue, defer, or stop decision when that bound is reached.

**Stop:** expired/revoked session, candidate mismatch, unknown review version,
unresolved blocking comment, or invalid actor produces no lock and leaves source,
candidate, qualification, and release state unchanged.

### 3.6 Qualification

Qualification runs against the exact client-locked candidate and its current
`ClientReviewReceiptV1`, and produces a manifest covering contracts, integrity,
render behavior, accessibility, SEO semantics, privacy/security, route behavior,
artifact reproducibility, and deployment-readiness preconditions. Release 1 records results and blocks on failures; it does not waive a gate because the visual result is attractive or a deadline is near.

**Output:** `QualificationManifestV1` bound to candidate hash and qualification version.

**Stop:** any blocking result, missing/current-client-lock mismatch, stale input,
changed candidate, or incomplete test evidence blocks release. A source/candidate
repair returns to Canvas and then fresh client review; it never resumes directly at
qualification or release.

### 3.7 Release preparation and approval

The release compiler creates one immutable delivery bundle from the qualified candidate. It includes static files, manifest, hashes, version metadata, the current client-review and qualification receipt identities, public-origin expectations, and a rollback reference. It cannot add content, alter the source authority, change route semantics, or invent a provider-specific promise.

One active named release initiator reviews the exact bundle and proposes production
release. A different active named release approver signs the authorization bound to
the bundle hash, qualification receipt, current client-review receipt, and target
descriptor. The initiator cannot approve the same operation. Models, clients,
monitors, adapters, and a single human cannot mint production authorization.

**Output:** `ReleaseBundleV1` plus `ReleaseAuthorizationV1` containing distinct
initiator and approver identities.

**Stop:** non-reproducible bundle, missing/stale/revoked client lock, qualification
mismatch, release-owner rejection, target mismatch, or missing rollback reference
produces no approval or provider operation and preserves the current public release.

### 3.8 Provider-neutral deployment

The deployment adapter contract is the only Release 1 boundary to an external delivery provider. It accepts the approved bundle and returns a provider release identity, upload/promotion receipt, public-origin descriptor, and bounded diagnostics. Provider credentials remain outside artifacts and logs.

Release 1 does not select a provider. A provider is eligible only after its adapter passes the same contract and conformance checks. Provider-specific features cannot become project source, candidate identity, approval state, or monitor truth.

**Output:** `DeploymentReceiptV1` with immutable release identity and verification inputs.

**Stop:** upload, promotion, domain, cache, integrity, or public-origin verification failure leaves the previous valid public release selected.

### 3.9 Public verification and monitoring

After deployment, the monitor checks only the approved public-origin and artifact properties declared by the release manifest: reachability, expected release identity/hash, required route presence, safe normalized origin/path behavior, and current monitor configuration. It does not submit forms, inspect private inventory, collect PII, or infer business outcomes.

A monitor observation is classified into one closed result vocabulary:
`healthy`, `transient_reachability`, `release_owner_action_required`, or
`unknown_blocking`. The monitor records actor, observation time, release generation,
release identity, reason code, and evidence hash. It may alert and request an
explicit owner action; it cannot commit a downshift, takedown, rollback,
revocation, re-delivery, or release approval.

**Output:** `MonitorReceiptV1` and current operational status.

**Stop:** unknown provider state, missing heartbeat, hash mismatch, unsafe origin, revoked release, or unclassifiable observation fails closed and preserves the last-known-good release where safe.

### 3.10 Rollback and re-delivery

Ordinary rollback is an explicit two-person release authorization against a
still-valid prior release. A pre-authorized emergency rollback may be initiated by
one active on-call human only to restore previously qualified bytes; it cannot deploy
new bytes, change the target, or become re-delivery, and it requires independent
review within 24 hours.
Still-valid means its release and candidate are not revoked, its source and receipt
versions remain supported, its qualification and client-lock policy remain
acceptable for rollback, and current external dependencies and target identity pass
revalidation. The release initiator and distinct approver create a new
`RollbackAuthorizationV1` bound to
that exact prior release and current revalidation evidence before adapter execution.
A rollback creates a new control transaction and receipt; it does not mutate the
old release record or reuse its old approval as a current authorization.

Re-delivery starts from a new candidate or a new release bundle, depending on the reason:

- a candidate or qualification defect creates a new candidate from the current source authority;
- a deployment or provider failure may retry the same approved release only when the adapter contract says the prior receipt remains valid and the retry is idempotent;
- a monitor safety, semantic, target, or evidence failure requires repair, fresh qualification, and new release approval;
- a stale or revoked artifact cannot be re-delivered merely because its files still exist.

**Output:** a new release/re-delivery receipt with explicit parent release, reason, hashes, actor, and result.

**Stop:** failed revalidation, revoked/unsupported target, missing current
authorization, ambiguous provider state, or failed public verification preserves the
current safe public state, records a failed recovery receipt, and escalates to the
release owner. It cannot report rollback or re-delivery success.

## 4. Capabilities included in Release 1

- local-first intake with a frozen, hash-bound manifest;
- one immutable `page-ir-v1` or `template-v1` source path per run;
- deterministic generation, compilation, candidate identity, and candidate-only repair;
- core single-writer Canvas refinement with selection, hierarchy, responsive
  preview, typed mutations, project assets, history, diff, restore, and named-human
  desktop/tablet/mobile visual review;
- private, version-bound client review over the web with comments and approval/change requests;
- qualification receipts for integrity, rendering, accessibility, SEO semantics, privacy/security, and delivery readiness;
- an external deployment adapter interface with no selected provider;
- immutable release bundles and deployment receipts;
- public-origin verification and bounded monitoring;
- fail-closed preservation of the last-known-good release;
- explicit rollback, retry, and re-delivery transactions;
- append-only audit records sufficient to trace actor, input, source, candidate, release, gate, monitor, and recovery lineage;
- baseline measurement protocol for accessibility, SEO, and performance before any numeric quality target is proposed.

## 5. Explicitly excluded from Release 1

- embedded Chromium/browser workspace, WebContentsView, browser profiles, downloads, or browser-agent control;
- Canvas as a collaborative operating environment, real-time cursors, CRDT editing, Yjs/Hocuspocus synchronization, or shared Page IR mutation;
- video, audio, screen-sharing rooms, recording, or LiveKit integration;
- general model marketplace/routing, provider-specific model switching, or unattended agent schedules;
- screenshot-to-code reconstruction, arbitrary DOM/code import, or executable generated output;
- appointment evidence classification, CTA leases, scheduler/request/contact publication, appointment monitoring, downshift, or HumanRepublish;
- CRM, inventory, payment, identity, clinical data, appointment confirmation, or vendor callbacks;
- a selected cloud, hosting, DNS, CDN, deployment, analytics, or storage vendor;
- automatic upgrades, automatic rollback without an authorized transaction, or automatic public re-delivery after a safety event;
- cross-project sharing, client-team collaboration, or a general project-management/meeting workspace;
- a general-availability claim or a numeric quality promise without a frozen baseline protocol and owner-approved target.

## 6. Actors and permissions

| Actor | May do in Release 1 | May not do |
|---|---|---|
| Intake operator | Create/freeze an approved intake manifest; identify scope and source authority | Change a frozen manifest, approve release, enter secrets, or activate appointments |
| Agency/project owner | Own project scope, budget, review-round bound, named role assignment, and stop/defer decisions | Approve their own technical/security evidence by role implication or bypass release gates |
| Agency designer | Review candidates, request typed source changes or one closed candidate repair, respond to client feedback, prepare a review session | Write live output, change layout authority, waive gates, approve deployment, or change runtime state |
| Source/compiler owner | Own Page IR/template admission, compiler/version compatibility, and source/candidate contract evidence | Approve visual quality, client decisions, release, or provider effects |
| Canvas/design owner | Own Canvas interaction evidence and named-human visual decision for an exact candidate | Mutate outside the guarded path, waive accessibility/gates, or approve release |
| Client reviewer | View the exact review candidate, comment, approve, or request changes for that candidate | Mutate source, access evidence/secrets, publish, deploy, rollback, or activate an appointment |
| Review/session owner | Create, expire, and revoke candidate-scoped review sessions and own review-reader compatibility | Alter source, client decision content, qualification, or release state |
| Evaluation owner | Own fixtures, tools, versions, oracles, baseline records, and evaluation-result integrity | Change requirements, accept their own implementation, or authorize release |
| Security/data owner | Own security/privacy blocking findings and typed risk acceptance | Mutate content, approve visual quality, or deploy |
| Reviewer/verifier | Inspect frozen candidate, qualification evidence, and release packet; record an independent finding | Approve their own behavior, alter evidence, waive a blocking result, or deploy |
| Release initiator | Propose provider control, rollback, or re-delivery for an exact qualified release and own escalation | Approve the same operation, rewrite candidate/source, alter gate results, select a provider by implication, or bypass appointment authority |
| Release approver | Independently approve or reject the exact initiator-bound release transaction | Initiate and approve the same operation, alter evidence, or approve a different bundle/target |
| Agent/model | Produce bounded proposals, summaries, extraction, or diagnostics inside an explicit scope | Verify evidence as a human decision, approve, publish, deploy, rollback, grant access, or change runtime state |
| Monitor | Read the public origin, compare against signed expectations, emit a typed observation and alert | Upgrade behavior, mint approval, reinterpret evidence, or silently re-deliver |
| Deployment adapter | Upload/promote the approved bundle, verify provider state, and return receipts | Create content, select a different bundle, approve, change source, or become the release authority |
| Appointment control plane | None in Release 1 beyond consuming a later typed integration boundary | It is not replaced: no appointment publication, CTA lease, classifier, or runtime downshift is implemented here |

## 7. Invariants

### Candidate and source invariants

1. Every run records exactly one immutable layout authority: `page-ir-v1` or `template-v1`.
2. Candidate identity is content-addressed and includes source authority, parent identity, compiler/version inputs, and output hashes.
3. No candidate inherits approval, client lock, qualification, or release status from another candidate by filename, timestamp, similarity, or position in a list.
4. A rejected or failed mutation leaves the current accepted candidate and its receipts unchanged.
5. A stale expected revision or source hash produces no write and no public effect.

### Release and deployment invariants

6. Two-person release authorization binds distinct active initiator and approver
   identities, the exact release-bundle hash, qualification receipt, and target descriptor.
   It also binds the current candidate-matching `ClientReviewReceiptV1`.
7. The adapter can execute only the approved release and must return an immutable provider release identity.
8. Upload failure has no public effect; promotion or verification failure preserves the prior valid release.
9. A superseded release remains audit evidence and is not eligible for reactivation until an authorized rollback revalidates it.
10. Retry is idempotent only when the exact release, provider target, and adapter contract permit it; otherwise a new release transaction is required.

### Monitoring and recovery invariants

11. Missing, stale, contradictory, unsafe, revoked, or unverifiable state fails closed.
12. Monitoring cannot upgrade, downshift, revoke, take down, roll back, or re-deliver. It emits typed observations and owner-action requests. Fresh evidence or repaired content returns through Canvas, client review, qualification, and release approval.
13. Rollback and re-delivery record their parent identity, reason, actor, expected revision, hashes, and result.
14. Website release identity and any future appointment release identity remain separate; a website rollback cannot reactivate appointment state.

### Privacy and boundary invariants

15. Secrets, credentials, private browser state, raw private evidence, and PII do not enter static delivery artifacts, Page IR, prompts, client links, general logs, or manifests.
16. Release 1 does not submit forms, create appointments, inspect inventory, collect payment, or infer a completed business outcome.
17. Provider-specific state stays inside the adapter and receipts; it cannot become source truth.

## 8. Readiness and exit gates

Release 1 is ready only when each gate has a named owner, immutable input set, receipt, and independent review. A gate result is not an authorization to implement or deploy beyond the scope stated here.

| Gate | Entry evidence | Exit condition | Blocking examples |
|---|---|---|---|
| R1-0 authority freeze | Approved scope, source authority, data boundary | `IntakeManifestV1` parses, hashes, and names owners | mixed Page IR/template authority; unbounded input; secret/PII intake |
| R1-1 source and candidate | Frozen manifest and approved evidence | Candidate compiles deterministically and passes entry gates | unknown schema; changed source hash; unsafe or executable output |
| R1-2 Canvas refinement | Gated private candidate and expected revision | Typed mutation/history/restore and named-human three-viewport visual receipt bind the final candidate | DOM/raw-code write; stale edit; unsupported capability; failed rollback; non-approve visual decision |
| R1-3 client review | One designer-accepted candidate hash and review manifest | Review receipt records comments and a candidate-bound client decision | candidate mismatch; revoked link; unresolved blocking comment |
| R1-4 qualification | Candidate-matching current client lock and frozen gate version | Qualification manifest covers every Release 1 check and is hash-bound | missing/stale/revoked client receipt; stale candidate; accessibility/SEO/security/render failure |
| R1-5 release approval | Qualified bundle, current client receipt, and target descriptor | Distinct active release initiator and approver authorize the exact bundle and client/qualification binding | self-approval; approval for a different candidate; provider-specific mutation; missing rollback reference |
| R1-6 deployment conformance | Adapter contract and approved bundle | Adapter upload/promotion/verification receipts prove exact release identity | adapter selects content; unknown provider state; public origin mismatch |
| R1-7 monitor | Verified public origin and monitor manifest | Healthy, transient, owner-action-required, unknown-blocking, and monitor-loss paths are deterministic and auditable | stale heartbeat; unsafe target; hash/release mismatch; autonomous public action |
| R1-8 recovery and re-delivery | Valid prior release plus seeded failure | Retry, rollback, repair/requalify, and re-delivery preserve lineage and fail closed | stale artifact reactivated; recovery without approval; partial public swap |
| R1-9 independent exit review | All receipts, test evidence, and unresolved-decision register | Independent verifier confirms scope, invariants, and compatibility matrix; owner signs packet | open P0/P1; unowned gap; numeric target presented without baseline |

### 8.1 Baseline protocol before numeric targets

Release 1 must establish a reproducible baseline before anyone chooses a numeric quality target. The protocol freezes the candidate, routes, supported browsers, Apple-silicon agency device profile, client-review device/browser profile, network condition, viewport set, build mode, and measurement tool versions. It measures every supported route and representative state, records raw results and hashes, repeats the run to identify variance, and separates deterministic failures from environmental noise. Only after review of that baseline may an owner propose thresholds, with the chosen scope and rationale recorded in a new qualification version. Until then, “passes” means the qualitative contract checks pass; it does not imply an invented score, latency, conversion rate, or market claim.

## 9. Later-release boundaries

The following remain separate contracts and cannot be pulled into Release 1 by convenience:

- **Expanded Canvas/browser:** realtime Canvas collaboration, visual motion authoring,
  general stack/module authoring, embedded browsing, WebContentsView, browser
  permissions, capture, screenshot-to-code, and agent-browser control require their
  own accepted contracts and gates. Core single-writer Canvas refinement remains in
  Release 1.
- **Collaboration:** team identity, durable cloud project state, Yjs/Hocuspocus text collaboration, presence, conflict handling, and LiveKit review rooms require their own tenancy, privacy, and recovery contract. They must not CRDT-merge Page IR or generated code.
- **Appointment acquisition:** route classification, evidence freshness, target verification, pointer serving, CTA leases, runtime downshift, HumanRepublish, and appointment monitoring remain governed by the appointment PRD.
- **Model and technology adoption:** the existing repository-pinned AI SDK,
  Playwright, and axe may remain subordinate Release 1 implementation/evaluation
  dependencies under the accepted supply-chain ledger. Any new or changed model,
  Lighthouse/SEO tool, motion runtime, Monaco/Sandpack surface, or related
  integration needs an accepted ledger entry, exact version, data/permission
  review, oracle, kill switch, and removal path; none becomes Release 1 authority.
- **Production provider:** selecting or changing a cloud/deployment provider requires a provider-specific adapter review and explicit deployment authorization after this packet.

## 10. Unresolved decisions before implementation authorization

- Which concrete deployment adapter, if any, will be authorized after provider-neutral conformance is proven?
- Which exact client-review authentication/session mechanism satisfies revocation and candidate scoping without introducing a shared project backend prematurely?
- Which hosting origin, persistence owner, and system-of-record boundary serves
  private client review, and which accepted ADR/migration authorizes that remote
  surface while ADR 0001 remains the executable loopback authority?
- Which supported browser/device set will be frozen by the baseline protocol?
- Which existing Page IR and template-v1 capabilities are admitted to the first Release 1 fixture corpus?
- Which owner and independent verifier are named for each gate and for re-delivery escalation?
- Which monitor observations are available in the first provider-neutral adapter, and which require an explicit manual operator step?
- Which exact repository-pinned and new evaluation tools are accepted for the
  Release 1 qualification version after supply-chain review?

No unresolved decision may be filled by a provider assumption, an AI output, a new schema field, or a numeric target inferred from a benchmark or field study.
