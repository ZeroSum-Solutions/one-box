# Appointment Acquisition control-plane contract split

**Date:** 2026-08-27

**Status:** Design approved in chat; written design awaiting owner review

**Branch:** `research/la-appointment-field-study`

**Current PRD:** `docs/specs/2026-08-27-appointment-acquisition-v1-prd.md`

**Proposed companion:** `docs/specs/2026-08-27-appointment-acquisition-control-plane-contract.md`

## 1. Decision

Split the Appointment Acquisition post-launch monitoring, pointer, and control-state rules into one normative companion contract.

The PRD remains the product authority for:

- v1 goals and non-goals;
- launch market and vertical scope;
- public promise and privacy boundaries;
- evidence and deterministic-classification requirements;
- publication approval and human-authority requirements;
- rollout stages, success metrics, and implementation authorization.

The companion becomes the sole detailed authority for:

- post-launch actors and transactions;
- publication, runtime-selection, transient-episode, and pointer states;
- monitor observation families and their mutually exclusive guards;
- control-plane transitions and compare-and-swap effects;
- pointer reads, status-only option probes, leases, activation checks, and cache rules;
- post-launch qualification coverage and operational drills.

This split changes document ownership, not product behavior. It cannot authorize implementation, relax a gate, add a public capability, or change the v1 market.

## 2. Why one companion contract

The final bounded Grok 4.6 audit found eight P1 issues concentrated in one coupled subsystem. Monitoring decides which control transaction occurs. The transaction changes runtime selection. Pointer behavior depends on that selection. Qualification must cover the same actor, event, guard, and result rows.

Keeping those rules in separate monitoring and pointer documents would create another cross-document synchronization problem. One companion can define the complete transition system and its serving consequences in one place.

## 3. Authority and conflict rules

The PRD will list the companion as a required core contract in Section 4. The companion is incorporated by exact version and SHA-256 hash into the approval bundle and `QualificationManifest`.

Authority rules:

1. The PRD owns product scope, public-strength limits, privacy limits, human gates, launch market, and implementation authorization.
2. The companion owns the exact post-launch control-plane semantics inside that boundary.
3. The companion may narrow, block, or make the PRD's fail-closed rules executable. It may not weaken or reinterpret a PRD invariant.
4. If the documents conflict outside the companion's assigned domain, the PRD wins and qualification fails until the conflict is corrected.
5. If both documents define the same detailed control-plane algorithm, qualification fails. The duplicate must be removed rather than resolved by precedence.
6. Any companion change creates a new qualification version and requires combined exact-file audit, deterministic coverage, independent verification, and owner approval.

The companion cannot add targets, promises, evidence classes, analytics fields, public copy, vertical categories, or rollout stages.

## 4. Extraction boundary

### 4.1 Rules that move to the companion

The companion will own the normative detail currently spread across:

- Section 10.2 publication workflow transitions;
- Section 10.3 active pointer and control-record mechanics;
- all of Section 11 runtime state machine;
- all of Section 12 pointer serving, cache safety, and replay resistance;
- Sections 13.1 through 13.3 monitoring, recovery, and signed-manifest service levels;
- the post-launch portions of Sections 15.3 and 15.9;
- post-launch fail-closed timing in Section 17.1;
- qualification-watch writer restrictions in Section 18.

### 4.2 Rules that stay in the PRD

The PRD will retain short normative invariants:

- only the named transactions may update public control state;
- runtime may keep, downshift inside an approved bundle, or block, but never upgrade;
- `HumanRepublish` is the only path to replace a bundle, restore a nonterminal Blocked scope, change target or copy, or move upward;
- `ProjectDeleted` is terminal for that ProjectId;
- unresolved presentations are target-null and cannot issue a CTA-bearing lease;
- CTA activation requires a fresh same-origin pointer read;
- automatic-protection claims require signed-manifest hosting;
- all companion states and transitions require deterministic qualification coverage.

Each retained invariant will reference the exact companion section that makes it executable. The PRD will not retain transition tables, actor aliases, observation ordering, or pointer algorithms.

## 5. Companion contract structure

The companion will use this section order:

1. Scope, non-goals, and incorporated PRD invariants.
2. Closed identifiers and scope facts.
3. Actors and exclusive transaction authority.
4. Publication and install-time selection.
5. Runtime-selection states and strength order.
6. Monitor observation families and first-match partition.
7. Transient reachability episode.
8. Immediate RuntimeDownshift and SafetyBlock transitions.
9. Pointer endpoints and response unions.
10. Status-only route-option probe.
11. CTA lease issuance and activation revalidation.
12. Cache, replay, counter, clock, and concurrency rules.
13. Recovery and HumanRepublish interaction.
14. Qualification coverage matrix.
15. Operational drills and timing proof.
16. Versioning, audit evidence, and stop rules.

## 6. Required closed contracts

### 6.1 Scope facts

Exactly two observation classes may be cited across multiple completed AcquisitionScopes:

- `visitor_kind_distinction` bound to one `RouteShapeScope`;
- `market_location_eligibility` bound to one `MarketLocationScope`.

Neither scope fact may carry visitor kind, channel strength, typed target, fallback, artifact, pointer, lease, or runtime state. Every other observation remains isolated to one candidate projection and completed AcquisitionScope.

### 6.2 Actors

The companion will define one canonical identifier for each actor. The same bytes must appear in the transaction table, monitor partition, drills, and qualification matrix.

At minimum:

- publication service;
- designated runtime monitor;
- trusted control-plane safety identity;
- deletion service;
- human-republish service holding fresh approval.

Only the trusted control-plane safety identity may commit `SafetyBlock`.

### 6.3 Monitor partition

The monitor contract will be a first-match, mutually exclusive table. It must separate:

1. eligible transient reachability blips;
2. transient second-failure and deadline events that require `RuntimeDownshift`;
3. deterministic non-blip unreachability that requires immediate `RuntimeDownshift`;
4. semantic, route-shape, market, safety, integrity, and revocation events that require immediate `SafetyBlock`;
5. metadata-only observations that cannot change selection.

A later row cannot consume a member assigned to an earlier row. The table must name the actor, transaction, guard, and resulting public selection for every family.

### 6.4 Operational availability

`OperationallyAvailable` will be a closed predicate. An eligible `open_degraded` blip does not clear it before the bounded second-failure or deadline transition. Evidence expiry, semantic mismatch, approved-surface absence, public-contact mismatch, deterministic non-blip unreachability, safety failure, integrity failure, revocation, or a committed downshift or Block does clear it as defined by the transition table.

Pointer heartbeat validity remains separate from target-reachability validity.

### 6.5 Pointer surfaces

The companion will define two separate same-origin surfaces:

- a status-only route-option probe that returns one reviewed marker key and cannot mint, copy, or expose a lease, typed target, or activation material;
- the CTA pointer endpoint that may issue a bounded lease only for a completed AcquisitionScope after every predicate passes.

Selecting an option creates a new partial route input and reruns route resolution. It never launches. Activation independently fetches a new lease after the caller submits a completed RouteKey.

### 6.6 Qualification coverage

The normative matrix must cover:

- every actor and transaction;
- every monitor observation family and first-match guard;
- every publication, runtime-selection, presentation, and transient-episode state;
- every legal and illegal transition;
- every public-selection outcome;
- every permitted fallback topology;
- every pointer response union and activation result;
- first blip, early success, second failure, deadline, SafetyBlock, deletion, and HumanRepublish interactions.

An uncovered row blocks qualification.

## 7. PRD migration method

The migration will happen in one reviewable change set:

1. Write the complete companion from the current PRD and v7 findings.
2. Add the companion to the PRD contract hierarchy and approval-bundle hash list.
3. Replace duplicated PRD algorithms with short invariants and exact companion references.
4. Run searches for actor aliases, duplicate transitions, contradictory pointer endpoints, and orphaned qualification rows.
5. Confirm that the PRD still contains every product and authorization boundary.
6. Audit the exact PRD and companion together as one contract.

No section may silently disappear. Each extracted rule will appear in a migration ledger with its old PRD location and new companion location.

## 8. Verification and acceptance

The split is accepted only when all of these pass:

1. `git diff --check` and placeholder, ambiguity, actor-alias, and duplicate-authority scans are clean.
2. A migration ledger accounts for every extracted normative rule.
3. Exact-file SHA-256 hashes are recorded for both documents.
4. A fresh `x-ai/grok-4.6` audit reviews both exact files in one prompt and returns no P0 or P1 finding.
5. The audit evidence is saved under `docs/audits/grok-4.6/`.
6. A separate verifier checks authority, traceability, closed transitions, and all eight v7 findings against the written files.
7. The verifier returns `VERDICT: PASS` with evidence for every criterion.
8. The owner reviews the committed PRD and companion before any implementation plan is created.

## 9. Files changed by the contract split

Expected project files:

- add `docs/specs/2026-08-27-appointment-acquisition-control-plane-contract.md`;
- update `docs/specs/2026-08-27-appointment-acquisition-v1-prd.md`;
- add a migration ledger under `docs/verification/`;
- add exact Grok audit evidence under `docs/audits/grok-4.6/`;
- add independent verification under `docs/verification/`;
- update the restart handoff with the final hashes, verdicts, and authorization boundary.

No application code, dependency, schema, deployment configuration, or public acquisition surface is in scope.

## 10. Stop conditions

Stop and return `REWORK` if:

- either file defines the same detailed control-plane rule;
- an extracted rule has no migration-ledger destination;
- an actor or event has more than one canonical name;
- any transition lacks an actor, guard, transaction, and public outcome;
- a pointer surface can mint authority outside its declared response contract;
- Grok returns any P0 or P1 finding;
- independent verification is incomplete or fails;
- the owner has not approved the committed contract set.

The split does not authorize an implementation plan, code, rollout, deployment, or public acquisition change.
