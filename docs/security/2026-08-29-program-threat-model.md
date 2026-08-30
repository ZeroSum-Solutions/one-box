# ONE BOX program threat model

- Status: planning baseline; no implementation authorization
- Date: 2026-08-29
- Applies to: Release 1 and the sequenced full product
- Related: ADR 0002, local API threat model, and the [normative embedded-browser closure requirements](2026-08-29-embedded-browser-closure-requirements.md) (`sha256:b51d58253b0ee84c5abc552fc28a7221f32bbe71bfd7517d11f9cc8a0bda9ccf`)
- Audit provenance: the [Opus 5 OAuth fallback audit](../audits/grok-4.6/2026-08-29-target-topology-program-threat-model-opus-5-fallback-audit.md) returned `REVISE` against earlier bytes (`sha256:2f1cc311863c3f84e67bed9ba46cd8798da6dd604bbb0e683e93690f69897dc4`); it is not Grok 4.6 evidence, does not review this revision, and grants no approval

## Purpose

This document extends the current loopback-only threat model across the planned
intake-to-re-delivery system. It defines assets, actors, trust boundaries, abuse
cases, controls, test oracles, and stop conditions before hosted identity,
collaboration, client review, workers, release adapters, or a desktop/browser
surface may be implemented.

It does not claim the current code implements these controls. The local API
threat model remains authoritative for the executable loopback product.
Every control below is required future-state language. No statement in this
document authorizes a dependency, schema, hosted service, client invitation,
desktop/browser experiment, deployment, or appointment activation.

## Assets and security properties

| Asset | Required property |
|---|---|
| Client briefs, files, captures, conversations | Tenant-confidential, purpose-limited, redacted from telemetry and model audits |
| Identity, membership, guest invitations | Authenticated, least-privileged, revocable, auditable |
| Page IR and source-mode selection | Integrity, one authority per run, no silent migration |
| Candidate artifacts and receipts | Immutable identity, provenance, reproducibility, bounded access |
| Human decisions and approvals | Actor-bound, candidate-bound, non-replayable across versions |
| Deployment credentials and domains | Environment-scoped, non-exportable to agents or generated sites |
| Model prompts, outputs, skills, and tool calls | Data-minimized, policy-bound, attributable, non-authoritative |
| Browser profiles, cookies, bookmarks, downloads | Local/profile-isolated, never available to site code or general agents |
| Audit log | Append-only semantics, redaction, integrity, retention, access logging |
| Public sites and runtime adapters | Available, rollbackable, tenant-isolated, no control-plane privilege |
| Public submissions and appointment personal data | Confidential, purpose-limited, data-subject accessible, bounded retention, excluded from model/audit and telemetry by default |
| Appointment records | Confidential, purpose-limited, bounded retention, separate lifecycle identity and revocation from website releases |
| Secrets, signing keys, and trust roots | Isolated custody, least privilege, versioned rotation, compromise revocation, never exportable to models, workers, clients, or generated sites |

## Actors

- agency owner: organization, budget, production, and policy authority;
- agency designer: project and Canvas work within granted role;
- agency engineer or operator: implementation, qualification, and deployment work;
- client reviewer: candidate-scoped comment and approval actions only;
- public end user, form submitter, or appointment booker: untrusted public actor
  and data subject with no project, control-plane, or release authority;
- service account: one named machine capability with no interactive identity;
- model or skill: untrusted proposal producer with explicit tools and limits;
- worker: ephemeral job identity restricted to one manifest;
- deployment adapter: project/environment-scoped release executor;
- external provider: untrusted availability and response boundary;
- attacker: internet user, malicious invitee, compromised dependency, hostile page,
  malicious upload, prompt injection, compromised endpoint, compromised
  administrator, or malicious privileged insider.

No model, skill, worker, provider callback, transcript, browser page, or test suite
is a human approval actor.

## Owner-role map

Every row requires an active `OwnerAssignmentV1` from ADR 0002's assignment
contract that binds the role and scope to a named human. A second active named
human must fill the Independent Security Verifier role for high-risk closure.
No assignment records exist in this packet, so all rows remain unassigned and
this threat model cannot be accepted, used to enter implementation planning, or
used to authorize work.

| Scope | Accountable owner role | Required independent role |
|---|---|---|
| TM-01 | Identity and Tenancy Owner | Independent Security Verifier |
| TM-02 | Data Protection Owner | Independent Security Verifier |
| TM-03 | Website Authority Owner | Independent Security Verifier |
| TM-04 | Canvas and Agent Security Owner | Independent Security Verifier |
| TM-05 | Model and Skill Security Owner | Independent Security Verifier |
| TM-06 | Collaboration and Media Owner | Independent Security Verifier |
| TM-07 and EB-001–EB-021 | Desktop Security Owner | Independent Security Verifier |
| TM-08 | Job and Sandbox Owner | Independent Security Verifier |
| TM-09 | License and Supply-Chain Owner; Security and Key Custody Owner for signing roots | Independent Security Verifier |
| TM-10 | Release and Operations Owner; Security and Key Custody Owner for provider credentials | Independent Security Verifier |
| TM-11 | Public Runtime Owner; Data Protection Owner for public personal data | Independent Security Verifier |
| TM-12 | Appointment Architecture Owner | Independent Security Verifier |
| TM-13 | Data Protection Owner; Release and Operations Owner for recovery | Independent Security Verifier |
| Document maintenance and review | Threat-Model Steward | Program Architecture Owner |

## Trust boundaries

```text
untrusted intake/upload/browser content
        -> client and API validation
        -> tenant/project authorization
        -> authoritative control-plane state
        -> closed worker manifests
        -> immutable candidate and receipts
        -> named-human review and release decisions
        -> provider-scoped deployment
        -> untrusted public origin and runtime traffic
```

Additional boundaries exist between agency and client roles, desktop main and
renderer processes, browser profiles and product UI, model providers and tool
executors, realtime transport and durable decisions, website and appointment
authority, public end users and runtime adapters, the operational administration
plane and independently anchored audit evidence, residency regions, and one
tenant/project/environment and another.

## Threat domains and required controls

### TM-01: tenant and identity isolation

Threats: guessed project IDs, cross-tenant joins, stale memberships, confused
deputy service accounts, guest-link forwarding, session theft, privilege drift,
privileged self-approval, insider policy tampering, and authorization checks that
occur after side effects.

Required controls:

- resolve tenant, project, actor, role, session, and capability before reading a
  body that can trigger work;
- deny by default at route, use-case, and storage boundaries;
- use short-lived sessions, rotation, revocation, device/session inventory, and
  step-up authentication for release, credential, billing, and membership changes;
- require two distinct active named humans for membership/role escalation,
  credential creation/export/rotation, and production release; the initiator
  cannot approve the same operation;
- scope guest links to one project, candidate, role, expiry, and invitation use;
- record membership and policy version in decision and release receipts;
- make authorization changes immediately invalidate future writes and new reads.

Oracles: cross-tenant property tests, object-ID enumeration tests, revoked-session
replay, confused-deputy fixtures, guest forwarding/expiry tests, self-approval and
stale-assignment refusal, and an access-log review. Any cross-tenant access is P0
and blocks the affected surface.

### TM-02: intake, uploads, evidence, and prompt injection

Threats: malicious documents, archive bombs, polyglots, path traversal, hidden
instructions, credential exfiltration, remote-resource fetches, poisoned evidence,
and model output presented as fact.

Required controls:

- closed type and size allowlists, no-follow regular-file reads, quarantine, and
  separate parsing workers;
- archive depth/count/expanded-size limits and active-content stripping;
- source, observation, inference, and owner decision remain separate records;
- untrusted instructions cannot alter system policy, tool grants, model routing,
  source authority, approvals, or release state;
- external fetches use SSRF-safe resolution and per-hop validation;
- prompt packets exclude secrets, raw client files, private URLs, browser session
  data, and unnecessary conversation history.

Oracles: malicious corpus, archive/resource exhaustion, symlink/race tests, SSRF
redirect matrix, prompt-injection challenge set, provenance completeness, and a
redaction canary. A prompt or file that grants tools or authority is P0.

### TM-03: candidate, mutation, approval, and rollback integrity

Threats: stale approval, time-of-check/time-of-use swaps, alternate mutation paths,
partial promotion, receipt replay, rollback to an unqualified artifact, and
re-delivery that edits the live site outside the candidate pipeline.

Required controls:

- every mutation targets a draft/source version and produces a new immutable
  candidate; every gate and decision binds its exact hashes;
- the candidate lock, named-human approval, qualification, release authorization,
  and provider result must all name the same identity;
- atomic transitions fail closed on ambiguity and preserve the last known-good
  release;
- rollback selects a previously qualified release by identity and records a new
  rollback event; it never copies unknown live bytes into authority;
- every post-launch change re-enters intake/change request, Canvas, review,
  qualification, release, and monitoring as a re-delivery release.

Oracles: concurrency, crash and fault-injection matrix, stale-version replay,
manifest mutation, ambiguous provider result, rollback drill, and re-delivery
trace. Any live artifact without complete identity and authorization is P0.

### TM-04: Canvas, preview, and generated code

Threats: iframe escape, generated script execution, DOM treated as source, unsafe
asset URLs, CSS exfiltration, hidden overlays, accessibility loss, and a tool
mutating outside the selected scope.

Required controls:

- Page IR remains source; preview DOM is a projection;
- generated candidates execute in a sandboxed origin with strict CSP, no product
  credentials, no same-origin control-plane access, and an allowlisted network
  policy;
- selections resolve to stable Page IR/edit identity before a proposal can apply;
- model and skill results are typed proposals; apply uses one guarded mutation
  funnel and capability-aware gates;
- asset provenance, content type, size, rights, and project scope are verified;
- visual taste approval remains a named-human decision.

Oracles: iframe/origin tests, CSP/network probes, edit-scope fuzzing, unsafe CSS
and URL corpus, accessibility suite, deterministic compile, and named-human
desktop/tablet/mobile review. Canvas convenience cannot weaken a P0 gate.

### TM-05: models, agents, skills, and external audit

Threats: prompt injection, excessive tools, hidden provider fallback, data leakage,
runaway cost, malicious skill update, model self-approval, audit laundering, and a
review result applied to different bytes.

Required controls:

- a model route declares provider/model/revision, effort, tools, data class, budget,
  timeout, fallback, retention, execution region, and permitted transfer regions
  before execution;
- every parent and subagent tool list is explicit and deny-by-default; omission
  never inherits shell, browser, credentials, network, mutation, external-effect,
  or authority tools;
- a persistent teammate identity stores only a durable role, brief, handoff, and
  evaluation history; it creates no always-on lease, inherited tools, standing
  budget, provider route, project authority, or approval;
- each provider/model selection or user-requested switch creates a new receipted
  route segment. Hidden fallback, silent effort changes, and unreceipted telemetry
  are prohibited;
- memory writes are typed proposals subject to current project authorization;
  shared policy memory is read-only to jobs and cannot override repository or
  ONE BOX authority;
- tools are deny-by-default and separated into read, propose, mutate, external
  effect, and authority classes; models cannot receive authority-class tools;
- skills/plugins are versioned supply-chain items with permissions and kill switch;
- exact packet hashes, requested and reported model identity, and full verdict are
  recorded for external audits;
- Grok 4.6 review is mandatory input for the named packets but never approval; a
  different model is explicitly recorded as a user-authorized fallback, not called
  Grok evidence;
- clients and secrets are excluded from review packets; same-hash receipts may be
  reused within policy, changed bytes require new review.
- provider fallback must preserve the tenant's residency/transfer policy; a route
  whose processing or subprocessors cannot be region-pinned fails closed.

Oracles: the versioned `agent-routing-adversarial-corpus-v1` fixture; explicit
parent/subagent tool-grant tests; injection, path-escape, memory-poisoning, and
redaction-canary suites; user-selected route-segment switching; undeclared
telemetry detection; model-route mismatch; timeout and budget exhaustion;
provider-fallback and region-mismatch tests; audit hash tamper; and malicious
skill fixtures. Any implicit tool grant, canary leak, undeclared route or audit
claimed for different bytes is P0.

### TM-06: collaboration, comments, cursors, and media

Threats: CRDT authority drift, spoofed cursor/actor, replayed events, transcript
decisions without consent, client remote control, meeting data over-retention, and
media room privilege escalation.

Required controls:

- signed actor/project/session/event envelopes and durable deduplication;
- CRDTs own only draft text and awareness; ordered Page IR mutations use explicit
  serialization/conflict;
- screen share is view-only in Release 1; remote control is excluded;
- recording/transcription is explicit, visible, jurisdiction-aware, and governed by
  retention and deletion policy;
- transcript extraction produces source-linked drafts requiring explicit acceptance;
- media transport cannot create membership, invitation, approval, lock, or release
  state.
- durable comments and accepted draft text are acknowledged only after durable
  write-through; presence, cursors, transient composition, and unsubmitted text
  are explicitly ephemeral;
- realtime failure produces a visible offline/read-only state or an explicit
  local unsent draft and never silently drops content or implies acceptance.

Oracles: actor-spoof/replay tests, offline conflict, cursor opt-out, concurrent
mutation collision, durable-ack failure, store-loss/reconnect, visible degraded
state, consent start/stop, participant revocation, and media/control-plane
privilege tests. E6 cannot proceed until P3 passes these gates.

### TM-07: desktop shell and embedded browser

Threats: hostile-page renderer escape, `window.open`/popup confusion, privileged
preload exposure, navigation to dangerous schemes, download execution, permission
grant, public debug ports, cross-profile cookie leakage, screen-capture leakage,
and browser automation acting on the wrong tab.

Required controls:

- no retained desktop or embedded-browser product code of any kind, remote-
  content-capable or not, until every row in
  `docs/security/2026-08-29-embedded-browser-closure-requirements.md`
  (`sha256:b51d58253b0ee84c5abc552fc28a7221f32bbe71bfd7517d11f9cc8a0bda9ccf`)
  is closed by its active named owner and independent verifier;
- product UI and hostile web content use separate renderer processes, origins,
  sessions, permissions, IPC schemas, and network policies;
- context isolation, sandboxing, no Node integration, narrow one-way IPC, navigation
  and scheme allowlists, download quarantine, permission deny-by-default, no public
  debug port, and exact stable tab identity;
- browser profiles/cookies remain local and cannot enter models, sync, project
  exports, or generated candidates;
- capture produces a provenance-bound ReferenceArtifact, never executable source.

Oracles: the fixed fixture and deterministic oracle for every EB row, hostile-page
corpus, navigation/popup/download/permission matrix, IPC fuzz, process and session
isolation, exact-tab race, debug-port scan, packaged-app tests, and Apple-silicon
install/update/downgrade/rollback. EB-001 is the first stop gate. This threat model
authorizes no disposable spike or experiment; any separately authorized research
cannot narrow or bypass the normative register.

### TM-08: workers, sandbox, and queue integrity

Threats: cross-job data, ambient credentials, oversized output, fork bombs, egress
exfiltration, poisoned cache, duplicate delivery, dead-letter replay, and a worker
advancing lifecycle state.

Required controls:

- one immutable job manifest, ephemeral identity/filesystem, resource budget,
  egress allowlist, permitted execution region, output schema and size bounds,
  and complete cleanup;
- artifact/cache keys include tenant, project, input hash, toolchain, and policy
  version; no private cache is shared across tenants;
- at-least-once jobs are idempotent; retry, cancellation, timeout, and dead-letter
  state are explicit;
- runtime checkpoints, subagent transcripts, and caches are disposable job state,
  never authoritative project state. Accepted facts, tasks, decisions, candidates,
  and receipts remain in ONE BOX and can reconstruct a job after checkpoint deletion;
- workers return receipts only; the control plane validates current state and owns
  transitions.
- region failover and queue replay must remain inside the tenant's declared
  residency/transfer policy; unavailable compliant capacity fails closed.

Oracles: duplicate/out-of-order jobs, worker kill at each transition, cache
poisoning, cross-tenant residue scan, exact job-root path escape, egress denial,
checkpoint deletion followed by reconstruction from ONE BOX state, clean runtime
removal, region-placement and failover tests, resource exhaustion, and dead-letter
replay. Cross-tenant residue, ambient production credentials, or unreconstructable
authority held only in runtime state are P0.

### TM-09: supply chain and build integrity

Threats: dependency takeover, typosquat, lifecycle scripts, mutable tags, compromised
model weights, custom model code, license breach, malicious skill/plugin, unsigned
desktop update, and build inclusion of client or repository files.

Required controls:

- exact versions/revisions and lockfiles; verified source, integrity, license,
  notices, maintainer posture, vulnerability policy, permissions, and removal plan;
- SBOM and provenance for release artifacts and desktop packages;
- no code-level use while license is unavailable, ambiguous, or incompatible;
- model weights and custom code require revision/hash, source, license, sandbox,
  and deletion path;
- signed/notarized desktop release with protected update metadata and rollback;
- packaged-build inventory proves no local client, secret, repository, or audit
  scratch file is included.
- signing and receipt keys are isolated from workers and builds, versioned by
  purpose, and revocable; receipt-signing and long-lived provider credential
  versions rotate at most every 90 days, offline verification trust roots at most
  every 365 days, and owner change or suspected exposure triggers earlier
  rotation; verifiers pin authorized public trust roots and validity windows;
- suspected key compromise blocks dependent transitions, quarantines receipts in
  the exposure window, revokes dependent grants, and requires deterministic
  recomputation or independent re-verification before authority is restored.

Oracles: lockfile and adoption-ledger verification, SBOM diff, known-vulnerable and
license-conflict fixtures, package-content census, signature/notarization checks,
wrong-purpose/expired/revoked signer, rotation cutover, forged receipt,
compromised-key-window re-verification, model hash mismatch, and update rollback.
Unknown executable provenance or an unowned trust root is P0.

### TM-10: release, provider, DNS, and public origin

Threats: credential overreach, wrong project/environment, duplicate deployment,
provider ambiguity, domain takeover, DNS drift, webhook spoofing, rollback failure,
public/private preview confusion, and a healthy deployment serving the wrong bytes.

Required controls:

- provider-neutral adapter with scoped credentials and exact project/environment;
- release request contains qualified candidate, authorization, desired environment,
  idempotency identity, and expected public-origin policy;
- verify deployed bytes/manifest, headers, TLS, canonical/robots/sitemap, runtime
  adapters, and domain ownership after provider success;
- signed or secret-verified callbacks are evidence only; polling/reconciliation
  resolves ambiguous outcomes;
- provider credentials are issued through the credential-custody boundary as
  short-lived project/environment/capability grants and never enter an adapter
  manifest, client, generated site, or general control-plane record;
- production release requires two distinct active named humans as initiator and
  approver. A one-person emergency path may only roll back to a previously
  qualified release and requires independent review within 24 hours;
- prior release remains known and rollbackable until the observation window passes;
- preview, staging, production, and client-review origins are unmistakably distinct.

Oracles: wrong-project refusal, duplicate and timeout replay, callback forgery,
self-approval refusal, expired/revoked provider grant, provider-success/wrong-
bytes, DNS/TLS drift, rollback drill, and public qualification. No provider is
selected until P6 conformance passes.

### TM-11: public runtime, forms, privacy, and availability

Threats: spam, form or appointment personal-data exfiltration, over-retention,
stored content injection, analytics without consent, third-party script drift,
denial of service, dependency outage, and inaccessible or unindexable pages.

Required controls:

- explicit per-capability runtime owner and data flow; generated sites receive no
  control-plane or deployment credentials;
- validated form destinations, spam/rate controls, consent and privacy behavior,
  CSP/SRI where applicable, minimal third-party scripts, and degraded modes;
- public submission and appointment fields are purpose-limited, minimized,
  encrypted, excluded from model/audit packets and telemetry by default, and
  deleted or forwarded under the bounded retention rule below;
- monitoring distinguishes public artifact health from appointment/form/analytics
  adapter health;
- availability incidents can disable an adapter without corrupting the site or its
  source authority.

Oracles: spam/rate tests, data-destination and retention trace, public data-subject
request fixture, consent region matrix, third-party outage, CSP scanner,
accessibility, SEO crawl, and load budget. Unsupported runtime capabilities are
rejected at intake, not improvised during generation.

### TM-12: appointment separation

Threats: website rollback restoring stale appointment UI/config, revoked appointment
authority returning through re-delivery, fail-open runtime behavior, duplicate booking,
and shared deployment identity conflating site and appointment release.

Required controls:

- separate appointment candidate, approval, activation, revocation, and release IDs;
- website artifacts reference only an allowed appointment capability contract;
- appointment runtime failure downshifts visibly and never claims a booking;
- website rollback/re-delivery cannot strengthen or restore appointment authority;
- appointment activation remains separately authorized after its PRD, evals, plan,
  threat review, and independent verification pass.

Oracles: website/appointment version-skew matrix, revoke-then-rollback, duplicate and
timeout replay, runtime-downshift, and cross-authority corruption tests.

### TM-13: monitoring, support, export, and deletion

Threats: telemetry leaks, missing or administrator-tampered incident evidence,
indefinite recordings/prompts/submissions, incomplete tenant or individual data-
subject deletion, backups that cannot restore, cross-border replication, exported
secrets, and a former client retaining agency access or vice versa.

Required controls:

- field allowlists, redaction, access logging, retention tiers, legal hold process,
  and deletion/export receipts;
- append-only audit events use independently administered tamper-evident storage
  plus a digest anchored at least daily and an independent copy outside the
  ordinary control-plane administrative boundary; continuity is verified daily,
  and reads and administrative actions are themselves logged;
- support access is time-bound, approved, attributable, and least-privileged;
- encrypted backups with tenant-aware restore and deletion handling;
- per-tenant envelope encryption and key revocation reconcile deletion with
  immutable identity: deletion crypto-shreds content across primary, queue,
  cache, replicas, and backups while preserving only content-free tombstones,
  opaque identity links, keyed integrity commitments under a separate audit-
  integrity key containing no tenant content, event type/time/key version, and
  deletion receipts;
- data-subject access, correction, export, objection, and deletion apply to public
  submissions and appointment personal data as well as tenant/client offboarding;
- storage, backup replication, telemetry, exports, and disaster-recovery failover
  remain inside the tenant's versioned residency/transfer policy. Cross-border
  transfer requires a recorded basis, owner, recipients, data classes, and expiry;
- client offboarding revokes sessions, invitations, service accounts, provider
  access, domains, and support access while preserving required audit evidence;
- public monitoring and incident communication have named owners and severities.

Oracles: telemetry canary, export and repository audit-artifact census, audit-log
tamper and missing-anchor detection, privileged self-approval test, data-subject
access/export/deletion, residency/backup/failover mismatch, support-access expiry,
and offboarding walkthrough. The combined deletion/restore drill deletes a tenant,
restores every storage class, proves content is unrecoverable and revoked keys are
not reissued, and proves candidate/decision/release identity links plus deletion
receipts remain consistent.

## Data classification and model/export policy

| Class | Examples | External model/audit | Telemetry | Default retention |
|---|---|---|---|---|
| Public | published site content | allowed when required | allowlisted | while live plus 365 days after supersession |
| Internal | planning IDs, synthetic fixtures | allowed with minimization | allowlisted | active project plus 180 days after closure |
| Confidential | client brief, private assets, comments | deny by default; explicit routed purpose only | redacted metadata only | active engagement plus 90 days after offboarding |
| Confidential public-submission data | names, contact details, message bodies, appointment request/time | prohibited by default; a separately accepted capability may authorize a minimized purpose | prohibited except delivery/abuse metadata | 30 days in ONE BOX, or shorter contract/law; downstream authority has a separate policy |
| Restricted | credentials, sessions, cookies, payment/auth data | prohibited | prohibited | session/invitation tokens at most 24 hours; long-lived credential versions at most 90 days before rotation; revoked values deleted immediately |

Future audit handling must exclude confidential client/public-submission content
and all restricted data from provider packets. Only normalized redacted findings,
request manifests, and packet hashes may be committed to version control. Raw
provider requests/responses, when retention is authorized, must live outside the
repository in the access-restricted audit store owned by the Data Protection
Owner, expire within 90 days, and emit deletion receipts unless a named legal-
hold/incident exception records scope and expiry. Before each audit and monthly,
an oracle must census tracked and untracked repository audit artifacts, inspect
the restricted-store expiry queue, and fail on raw payloads in version control or
overdue deletion. This is a required future control, not a claim that such a
store, custodian assignment, expiry job, or census is implemented today.

## Durability, recovery, deletion, and residency targets

ADR 0002's proposed objectives are mandatory planning inputs: control-plane and
durable draft data have RPO 5 minutes/RTO 4 hours; acknowledged immutable and
released artifact bytes have RPO 0/RTO 4 hours; the last verified public static
release has RPO 0/RTO 1 hour. Full point-in-time, realtime-store, artifact-store-
loss, public-origin-loss, and deletion-plus-restore drills run before production,
quarterly, and after material storage, encryption, replication, residency, or
provider changes. These values are targets, not current evidence.

Every tenant has a versioned residency/transfer policy covering primary storage,
workers, model/audit providers and subprocessors, queues/caches, telemetry,
backups, exports, and disaster recovery. An unpinnable route, noncompliant region,
or ambiguous failover fails closed. The Data Protection Owner must record any
lawful cross-border basis and the Independent Security Verifier must accept the
region-placement and failover evidence before infrastructure selection.

## Risk acceptance and closure

- P0: credible cross-tenant, authority, secret, arbitrary-code, release-integrity,
  or public-safety failure. Blocks the affected phase immediately.
- P1: credible bypass of required review, isolation, rollback, privacy, or recovery.
  Blocks retained implementation or release for the affected phase.
- P2: material operability, usability, or defense-in-depth weakness. Must have an
  owner and scheduled closure before the relevant release candidate.
- P3: improvement or documentation gap. Track; it does not silently become a gate.

Risk acceptance must name the risk, scope, expiry, compensating control, owner, and
evidence. A model cannot accept risk. A phase is ready only when every applicable
threat has an owner, oracle, implementation ticket, and no unaccepted P0/P1.

## Review and maintenance

Review this model when a trust boundary, data class, provider, executable
dependency, model/skill permission, runtime capability, deployment target, or
retention policy changes; after a P0/P1 incident; and at each release candidate.
Each review records the exact document hash, changed threat IDs, owner, and linked
tickets. Threat-model review is evidence, not implementation authorization.

The current `OwnerAssignmentV1` records are unassigned, every EB closure row is
open, the fallback audit reviewed superseded bytes, and no current-hash exact
Grok 4.6 audit exists. This revision therefore remains planning-only and
`NOT_AUTHORIZED`.
