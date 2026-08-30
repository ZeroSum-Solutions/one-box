# ADR 0002: Target desktop and cloud topology

- Status: proposed; owner acceptance required
- Accepting owner: unassigned; acceptance is blocked until an active `OwnerAssignmentV1` binds the Program Architecture Owner role to a named human
- Date: 2026-08-29
- Scope: target architecture for the full ONE BOX product
- Supersedes: no current runtime decision
- Relationship to ADR 0001: this proposal triggers ADR 0001's revisit condition but does not discharge or supersede it; the accepted loopback modular monolith remains current authority
- Embedded-browser closure register: [`../security/2026-08-29-embedded-browser-closure-requirements.md`](../security/2026-08-29-embedded-browser-closure-requirements.md) (`sha256:3bc32cbc1fcbf8ce6abe9c38341e2f5f739cf31eb3df426c6dbf696ae01b0ef7`)
- Audit status: the [Opus 5 OAuth fallback audit](../audits/grok-4.6/2026-08-29-target-topology-program-threat-model-opus-5-fallback-audit.md) returned `REVISE`; it reviewed earlier bytes, is not Grok 4.6 evidence, and grants no approval or implementation authority

## Context

ADR 0001 correctly keeps the current product as one loopback-first Next.js
modular monolith with local per-run state. The approved website contracts now
describe a larger lifecycle: intake, evidence, private candidate creation,
Canvas editing, client review, qualification, controlled release, deployment,
monitoring, rollback, and re-delivery. Draft expansion plans also describe team
membership, agents, collaboration, a desktop shell, and a client room.

Those capabilities cannot safely share the current assumptions that one process,
one local filesystem, and one trusted operator own every decision. A target
topology is needed before hosted identity, shared projects, remote review,
realtime collaboration, release orchestration, or a retained desktop shell can
enter implementation planning.

This ADR proposes boundaries and ownership. It deliberately does not select a
database, identity vendor, realtime vendor, hosting provider, model provider,
desktop framework, or deployment provider.

## Decision drivers

1. One immutable site source authority per run: `page-ir-v1` or the closed
   `template-v1` compatibility path, never both and never a mid-run switch.
2. Candidate identity binds review, approval, qualification, release, rollback,
   and re-delivery.
3. Model, skill, browser, and collaboration output is a proposal or event; none
   is release authority.
4. Shared projects require tenant isolation, durable identity, explicit roles,
   revocation, auditability, backup, and conflict handling.
5. Client review must be less privileged than agency authoring.
6. Generated sites must stay portable and must not depend on the authoring
   control plane to serve ordinary public traffic unless their explicit site
   capability requires it.
7. A compromised hostile page, desktop renderer, client browser, model, worker,
   or deployment adapter must not gain another boundary's authority.

## Proposed target decision

Everything in this section is required target-state behavior, not a claim about
the current executable product. This ADR proposes seven target trust zones and
one portable artifact boundary. It selects no deployable, vendor, schema, or
implementation. The current modular monolith remains the executable baseline
until a separately accepted migration plan proves and authorizes each extraction.

```text
Agency desktop/web client          Client review surface
          |                                  |
          +---------- public API edge -------+
                            |
                    Cloud control plane
           identity, tenancy, projects, decisions,
             candidate/release metadata, audit log
                     /                 \
          isolated job plane       realtime/media plane
       compile, gate, scan, eval    presence, comments, A/V
                     \                 /
                      release orchestrator
                  provider adapters + receipts
                            |
                immutable delivery artifact
                            |
                   public delivery origin <--- public end user

Appointment authority placement: deferred to a separate accepted ADR and
absent from this target topology until that ADR exists.
```

### Zone 1: agency client

The agency client presents intake, evidence, Canvas, history, planning, and
release surfaces. It may be a web client and, later, a signed Apple-silicon
desktop package. It holds short-lived user sessions and local presentation state.
It does not own authoritative project membership, approvals, release state, or
deployment credentials.

No retained desktop or embedded-browser product code of any kind, whether or not
it can display remote content, may begin until the normative closure register
linked in this ADR closes EB-001 through EB-021 and the desktop security plus
Apple-silicon install, update, downgrade, and rollback gates pass. This ADR does
not authorize a disposable spike or other experiment; any research execution
requires separate written owner authorization under the authority manifest and
cannot be inferred from this proposal.

### Zone 1b: client review surface

The client review surface may receive only the exact invited candidate's
renderable bytes, explicitly shared evidence/assets, scoped review comments, and
the minimum participant metadata required for that review. It may issue only
candidate-scoped comment and review-decision commands allowed by the accepted P3
contract.

An invitation must be single-purpose, short-lived, one-use at exchange, bound to
one tenant/project/candidate/role, and exchanged for a revocable short-lived
session. Raw invitation secrets are never stored in client state or logs. On
expiry, revocation, candidate supersession, authorization ambiguity, or control-
plane failure, writes fail closed and the UI becomes visibly read-only or denies
access; it never queues an approval against a stale candidate.

This zone does not own membership, invitation minting, candidate locks,
qualification, release, deployment credentials, other candidates/projects, or
any agency authoring capability. P3's review-origin threat model and gates remain
the prerequisite for this zone and E6 media transport.

### Zone 2: public API edge and cloud control plane

The API edge authenticates a principal, resolves exactly one tenant and project,
enforces role and capability policy, applies request limits, and creates an audit
correlation ID before dispatch.

The control plane is the system of record for:

- tenant, user, service, guest, and role identity;
- project membership and revocation;
- requirement, decision, task, and approval records;
- run source-authority selection;
- candidate, review, qualification, release, and re-delivery identities;
- idempotency, concurrency, and state-machine transitions;
- audit receipts and retention policy.

It stores metadata and references to immutable artifacts. A logically separate
credential and signing-key custody boundary, governed by separate administrative
policy even if a future provider implements it beside the control plane, owns
secret storage and issuance. The control-plane data store is not a general
browser credential store and does not grant a model direct persistence or
release access.

### Zone 3: isolated job plane

Compilers, gates, asset processors, scanners, evaluation harnesses, and model
proposal jobs must run as least-privileged jobs with a closed input manifest,
bounded resources, no ambient tenant access, a fixed egress policy, and an
explicit output manifest. A job receives only a short-lived workload identity;
it never holds a long-lived receipt-signing or provider key. A separate receipt-
signing boundary validates the manifest and result before signing with a
versioned key. Jobs may propose or evaluate; only the control plane can advance
lifecycle state after validating the receipt, signer/key status, and current
candidate identity.

Untrusted source capture, model weights with custom code, browser reconstruction,
and active security testing require dedicated sandbox profiles rather than the
ordinary build worker.

### Zone 4: realtime and media plane

Presence, optional cursors, comments, screen share, voice/video, and transcript
transport are subordinate communication channels. Durable decisions are created
only when an authenticated actor explicitly accepts a source-linked proposal in
the control plane. CRDTs may own draft text and awareness; they never merge Page
IR, candidate state, approval, or release authority.

The media service cannot mint review invitations, change candidate locks, approve
a candidate, or deploy. E6 remains blocked until P3's review-origin threat model,
guest scope, invitation, candidate-lock, revocation, and stale-approval gates pass.

Durable review comments and accepted draft text must be acknowledged only after
write-through to the backed-up durable draft store. Presence, cursors, transient
composition, and unsubmitted text are explicitly ephemeral. When realtime or
durable acknowledgement is unavailable, affected write surfaces become visibly
offline/read-only, preserve an explicit local unsent draft where safe, and never
silently discard, imply acceptance, or advance review state.

### Zone 5: release orchestrator

The release orchestrator accepts one immutable qualified candidate and an
explicit two-person production release authorization from two distinct active
humans: one initiator and one approver. It executes a provider-neutral adapter
contract, records attempt and result receipts, verifies the public origin, and
either makes the new release live or fails without silently changing the prior
release. A pre-authorized emergency rollback may be initiated by one on-call
operator only to restore a previously qualified release; it cannot deploy new
bytes and receives independent review within 24 hours.

Provider credentials are isolated to the adapter's project and environment scope.
An adapter cannot change Page IR, Canvas state, client approval, or qualification.
Production provider selection remains a P6 owner decision after conformance and
rollback evidence.

### Zone 6: public delivery origin and runtime adapters

The public origin may hold only the immutable published artifact, public headers
and routing metadata, and explicitly enabled runtime-adapter inputs. It accepts
ordinary public reads plus bounded, validated form or runtime-adapter requests;
it cannot issue authoring, approval, qualification, membership, or release
commands.

The origin and generated client bytes hold no control-plane, signing, deployment,
or cross-tenant credential. Runtime-adapter credentials remain server-side and
are scoped to one capability, tenant/project, and environment. On origin or
adapter failure, the system serves or republishes the last independently verified
static release when available and visibly degrades the failed adapter; it never
serves unknown bytes or infers a booking/form success. The public origin does not
own Page IR, candidate identity, approvals, release state, appointment authority,
or another tenant's data.

### Deferred external boundary: appointment authority

This ADR does not place or select the appointment authority. No appointment
deployable, bounded context, provider, data owner, command path, secret boundary,
failure policy, or activation path is authorized by this topology. A separate
accepted appointment-topology ADR must define those boundaries and preserve
separate candidate, approval, activation, revocation, and release identities
before P7 implementation planning. Until then, website rollback, re-delivery,
release, and runtime adapters are explicit non-owners of appointment state.

### Portable delivery artifact

The Release 1 target must produce a deterministic static Website artifact with manifest,
provenance, gate, approval, and release receipts. The public site remains usable
without the authoring UI or model providers. Forms, appointments, analytics,
consent, and other runtime capabilities are explicit adapters with separate
owners and health contracts; they are not smuggled into the artifact as arbitrary
generated code.

## Authority and data ownership

| Data or decision | Authoritative owner | Explicit non-owners |
|---|---|---|
| Tenant/user identity, project membership, invitations, and role policy | Control-plane identity and authorization boundary | Agency/client UI, realtime/media plane, model, worker, generated site |
| Source mode and Page IR | Versioned run contract | Canvas DOM, model output, browser capture, CRDT |
| Draft comments and presence | Realtime draft store | Release and approval state |
| Candidate bytes and manifest | Immutable artifact store plus control-plane identity | Client cache, worker scratch space |
| Human review decision | Control-plane decision record bound to actor and candidate | Transcript, model audit, test result |
| Qualification receipt | Deterministic gate owner bound to candidate | Canvas, deployment provider |
| Release decision | Two distinct assigned human Release and Operations roles through the control plane | Model, worker, client guest, provider webhook, one person acting alone except bounded emergency rollback |
| Public delivery | Provider adapter's immutable deployment record | Authoring client local state |
| Appointment state | Separate appointment authority and release identity | Website rollback or re-delivery |
| Secrets, signing keys, and provider credentials | Credential and Signing-Key Custody boundary under the Security and Key Custody Owner | Model, skill, worker, realtime/media plane, agency client, client review surface, generated site |
| Audit log and integrity anchors | Append-only audit boundary plus an independently administered anchor/copy | Ordinary control-plane administrator, release initiator, model, worker, provider |
| Billing, metering, budgets, and chargeback | Control-plane metering ledger under the Release and Operations Owner | Model, worker self-report, client guest, provider invoice alone |

## Owner roles and assignment contract

Roles name accountability but do not identify a person. Before this ADR can be
accepted, every required role below must be bound to a named human by one active
`OwnerAssignmentV1` record in the authority manifest or a manifest-linked owner
register. No model, service account, team name, or unbound job title satisfies
this requirement.

| Owner role | Required scope |
|---|---|
| Program Architecture Owner | ADR acceptance, topology, migration, and supersession |
| Identity and Tenancy Owner | API edge, control-plane identity, membership, guest access |
| Desktop Security Owner | Agency client plus EB-001 through EB-021 remediation |
| Desktop Architecture Owner | Native-window composition, view lifecycle, focus, profile, and packaging boundaries after EB closure |
| Website Authority Owner | Page IR, candidate, approval, qualification, rollback, and re-delivery integrity |
| Canvas and Agent Security Owner | Canvas/preview isolation, typed mutations, and scoped agent control |
| Model and Skill Security Owner | Model routing, tool grants, skills, external-audit boundaries |
| Job and Sandbox Owner | Isolated job plane, queue, cache, worker isolation |
| Collaboration and Media Owner | Durable drafts, realtime, presence, E6 media transport |
| Release and Operations Owner | Release orchestrator, public origin, recovery, runtime adapters |
| Public Runtime Owner | Generated public origin, forms, consent, adapter health, public data flows |
| License and Supply-Chain Owner | Dependencies, executable provenance, SBOM, licensing, build contents |
| Security and Key Custody Owner | Credential custody, trust roots, rotation, revocation, audit integrity |
| Data Protection Owner | Classification, retention, deletion, legal hold, residency, data-subject rights |
| Appointment Architecture Owner | Separate future appointment-topology ADR; no current implementation authority |
| Threat-Model Steward | TM-01 through TM-13 maintenance and review packet |
| Independent Security Verifier | Non-author verification of identity, browser, key, deletion, release, and recovery gates |

| Target zone or boundary | Required active owner assignments |
|---|---|
| Zone 1 agency client | Desktop Architecture Owner; Desktop Security Owner |
| Zone 1b client review | Identity and Tenancy Owner; Data Protection Owner |
| Zone 2 API/control plane | Program Architecture Owner; Identity and Tenancy Owner; Security and Key Custody Owner |
| Zone 3 isolated jobs | Job and Sandbox Owner; Security and Key Custody Owner |
| Zone 4 realtime/media | Collaboration and Media Owner; Data Protection Owner |
| Zone 5 release orchestrator | Release and Operations Owner; Security and Key Custody Owner; Independent Security Verifier |
| Zone 6 public origin/runtime | Public Runtime Owner; Release and Operations Owner; Data Protection Owner |
| Deferred appointment boundary | Appointment Architecture Owner; Independent Security Verifier |

`OwnerAssignmentV1` is a planning/governance record with this minimum shape:

```text
OwnerAssignmentV1 = {
  schemaVersion: "owner-assignment-v1",
  assignmentId, personId, displayName, ownerRole, scopeIds[],
  effectiveAt, expiresAt?, acceptedAt, acceptedByPersonId,
  evidencePath, revokedAt?, replacementAssignmentId?
}
```

An assignment is inactive when expired, revoked, self-accepted, missing its
evidence path, or outside the requested scope. The accepting ADR owner, each
zone owner, EB remediation owner, each threat-domain owner, and independent
verifier must resolve to active assignments. They are currently unassigned, so
this proposed ADR remains blocked from acceptance, and no implementation plan or
authorization may derive from it.

## Credential, signing-key, and trust-root lifecycle

- Secrets enter only the credential-custody boundary and are issued as short-
  lived, project/environment/capability-scoped grants; raw values never enter
  project data, worker manifests, model context, logs, audit packets, or builds.
- Receipt signing uses versioned asymmetric keys or an equivalent isolated trust
  root. Verifiers pin the authorized public key set, key version, purpose,
  validity window, and revocation status.
- Receipt-signing key versions and any long-lived provider credential rotate at
  most every 90 days; offline verification trust roots rotate at most every 365
  days. Personnel/owner change, provider event, suspected exposure, or
  cryptographic-policy change triggers earlier rotation. Rotation proves overlap,
  cutover, and rejection of the retired signer.
- Suspected compromise immediately blocks affected lifecycle transitions,
  revokes the key version and dependent grants, quarantines receipts signed in
  the exposure window, and requires deterministic recomputation or independent
  re-verification before those receipts regain authority.
- Historical receipts retain their signature and key-version reference. A
  revoked-compromise key does not silently validate historical authority; the
  incident disposition records which receipts were reconstructed, invalidated,
  or preserved under independently verified evidence.

Required oracles include wrong-purpose/wrong-project grants, expired and revoked
signers, rotation overlap and cutover, forged receipt, compromised-key window
reverification, provider-credential revocation, and restore without resurrecting
retired keys.

## Consistency and failure rules

- All commands carry tenant, project, actor, source mode, candidate or draft
  version, idempotency key, and correlation ID where applicable.
- Ordered mutations serialize or return an explicit conflict. Realtime merge is
  never used to settle authoritative Page IR or release state.
- At-least-once delivery is assumed. Consumers deduplicate with durable operation
  identity and return the prior receipt for an exact retry.
- A stale client, worker, audit, gate, approval, or deployment result cannot
  advance a newer candidate.
- Queue exhaustion, worker loss, provider ambiguity, or network partition parks
  the transition. It does not infer success.
- Backups protect control-plane metadata and immutable artifacts. Restore drills
  must prove referential integrity between candidate, decision, and release IDs.
- Desktop and web version skew is handled by declared API and artifact support
  windows. Unsupported clients become read-only before they can mutate.

### Proposed durability and recovery objectives

These are target requirements, not current service claims:

| Data/service class | RPO | RTO | Required drill |
|---|---:|---:|---|
| Control-plane identity, candidate/review/release metadata, and audit events | 5 minutes | 4 hours | Quarterly point-in-time restore plus cross-tenant and referential-integrity checks |
| Acknowledged immutable candidate and released artifact bytes | 0 after durable acknowledgement | 4 hours | Quarterly complete artifact-store-loss restore and hash verification |
| Durable review comments and accepted draft text | 5 minutes | 4 hours | Quarterly realtime-store loss/reconnect drill; ephemeral presence/cursors are excluded and visibly non-durable |
| Last independently verified public static release | 0 for release identity and bytes | 1 hour to restore or republish | Quarterly origin-loss and provider-ambiguity drill |

Drills also run before first production use and after a material storage,
encryption, replication, or provider change. If immutable artifacts are
unavailable, rollback and re-delivery stop; the orchestrator may keep the
currently verified public release serving but may not claim another release or
reconstruct authority from live bytes.

Tenant content must use per-tenant envelope encryption. Approved deletion
destroys the tenant data-encryption keys across active stores and marks those key
versions revoked for every restore. Candidate bytes, confidential audit payloads,
and backups then remain cryptographically unrecoverable, while a content-free
append-only tombstone preserves opaque identity links, keyed integrity
commitments under a separate audit-integrity key that contains no tenant content,
lifecycle event type, time, key version, and deletion receipt. A
legal-hold exception must name scope, basis, owner, and expiry. Restore must apply
revocation/tombstone state before exposing recovered data and must never resurrect
deleted plaintext.

The combined deletion/restore oracle deletes a tenant, restores every storage
class including backups, proves content is unrecoverable, proves revoked keys are
not reissued, and proves candidate/decision/release identity links and the
deletion receipt remain internally consistent.

## Migration sequence

1. Keep the current local modular monolith and Page IR work as the executable
   baseline.
2. Accept the Release 1 contract, compatibility matrix, threat model, evaluation
   strategy, and supply-chain policy.
3. Specify provider-neutral control-plane contracts without introducing a hosted
   deployment.
4. Implement contract tests and an in-process adapter that preserves current
   local behavior.
5. Select infrastructure only after tenancy, data residency, recovery, cost,
   operational, and conformance evidence exists.
6. Extract one deployable seam at a time behind the accepted contract and rollback
   to the in-process path if its qualification fails. Before run or evidence
   authority leaves local per-run artifacts, accept a separate authority-migration
   ADR and data-migration plan with dual-run comparison, cutover, rollback,
   integrity, deletion, and recovery evidence. ADR 0002 alone does not discharge
   ADR 0001's revisit condition.
7. Introduce a retained desktop package only after every row in the pinned
   embedded-browser closure register is closed and the desktop security plus
   Apple-silicon install, update, downgrade, rollback, key-rotation, and recovery
   tests pass. Separate implementation authorization remains required.

## Rejected alternatives

### Keep all shared state on one designer's Mac

Rejected for team continuity, tenant isolation, client access, durable
revocation, backup, and production operations. It remains valid for the current
single-user baseline, not the target multi-user product.

### Make the desktop app the system of record

Rejected because offline forks, lost devices, hostile remote content, and client
review would give a high-risk endpoint release authority.

### Make the generated site repository the source of truth

Rejected because it would bypass typed Page IR mutation, candidate identity, gate
receipts, and version-bound approvals.

### Choose named vendors now

Rejected because the current plans contain candidates, not conformance evidence
or an owner selection. Vendor choice before the contracts would let provider
semantics become product authority.

## Consequences

- The target product is no longer accurately described as one deployable process,
  but ADR 0001 remains authoritative for the current executable system.
- Hosted and desktop work needs explicit migrations, operational ownership, and
  new threat models before implementation.
- Collaboration and browser features can evolve without becoming site or release
  authority.
- The system carries more explicit receipts and immutable identities, trading
  implementation simplicity for recoverability, auditability, and safe team use.

## Acceptance and supersession

This proposed ADR is planning evidence only. It becomes target-architecture
authority only after the owner records acceptance in the authority manifest.
Acceptance does not authorize implementation, vendor selection, schema changes,
desktop retention, client invitations, deployment, or appointment activation.
A future ADR must supersede this one if a selected topology changes any trust
zone or authority owner.

The current accepting owner and all `OwnerAssignmentV1` bindings are unassigned,
the EB closure register remains fully open, and the Opus fallback audit reviewed
superseded bytes. Therefore this revision remains proposed, unaudited on its
current hash set, and `NOT_AUTHORIZED`. The fallback audit is provenance evidence
only; the separately required exact Grok 4.6 packet remains outstanding.
