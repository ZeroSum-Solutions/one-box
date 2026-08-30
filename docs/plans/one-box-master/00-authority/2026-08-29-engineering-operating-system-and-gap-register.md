# ONE BOX engineering operating system and planning gap register

- **Status:** planning draft; no implementation authorization
- **Date:** 2026-08-29
- **Scope:** the complete ONE BOX website, Canvas, collaboration, browser, client-review, qualification, publishing, and appointment program
- **Review rule:** every named stage receives an exact `x-ai/grok-4.6` adversarial review input; a named human owner dispositions every finding, unresolved P0/P1 findings block progression, and deterministic and independent evidence always outrank the model

## 1. Current decision

ONE BOX has a strong local website-authority foundation, but the expanded product is not ready to become one implementation backlog. The immediate work is to finish the program contracts that make feature delivery safe: one discoverable authority chain, one accepted target topology, one deliberately narrow first release, cross-domain security and data boundaries, one test strategy, and a shared engineering workflow.

The website journey remains first:

```text
intake -> evidence -> private candidate -> Canvas refinement -> client review
       -> agency qualification -> exact release approval -> deploy -> monitor
```

Agent Studio, team collaboration, embedded browsing, video, stack intelligence, premium experience modules, and appointment acquisition are subordinate capabilities. They may not become alternate website source, approval, qualification, or release authorities.

## 2. Evidence basis

### Confirmed from versioned repository inputs

- Page IR has a machine-readable 22-ticket dependency pack, requirement/eval links, a traceability table, and an explicit closure rule.
- The committed CI contract runs unit tests, type checking, lint, build, and the merge-blocking Page IR rendered regression path. Additional smoke, Canvas, axe, motion, full-run, and eval commands exist but are not all part of the current CI workflow.
- ADR 0001 accepts a loopback modular monolith and requires reconsideration before a second deployable or remote persistence authority.
- The local API threat model explicitly covers a local-first single-user boundary rather than the proposed cloud, client-review, and multi-user product.
- The exact Grok 4.6 master-plan audit verdict is `REVISE / NOT_AUTHORIZED`, with five P1, five P2, and one P3 finding.

### Live observations from this review, not planning-policy authority

The current interactive review also observed a dirty, ahead worktree; a green 1,275-test unit baseline; passing typecheck and build; lint with warnings but no errors; build-time dynamic-filesystem tracing warnings; and GitHub review-control/backlog state. Those observations are time-specific and are not used to set a gap severity unless their raw receipt is attached to the relevant future packet.

The confirmed repository inputs show a healthy engineering pattern for the existing local compiler. They do not show that the expanded multi-user desktop/cloud product is build-ready.

## 3. Planning readiness

**Build readiness: NO-GO. Planning remains active because material program contracts are open.**

Existing strengths:

- Page IR already has requirement IDs, ticket dependencies, evaluation ownership, traceability, candidate isolation, recovery tests, and human approval boundaries.
- The shipping roadmap separates lifecycle, review, qualification, provider conformance, provider selection, appointment integration, and rollout.
- The local API has a real threat model, and the browser plan is correctly blocked rather than hand-waved into implementation.

Open conditions:

- the newly expanded system changes the accepted deployment and trust topology;
- the first product release is not narrow or measurable enough;
- the new domains do not yet inherit the Page IR ticket/evaluation discipline;
- several master-plan sources conflict or remain drafts;
- the shared team workflow is not yet represented by an active backlog and required peer review.

## 4. Prioritized gap register

### P0 — close before creating retained implementation tickets

#### EOS-001 — one discoverable authority chain

The root `AGENTS.md` and `README.md` still route contributors to the 2026-08-13 Refero requirements and frozen template assumptions. The master plan routes website authority to the 2026-08-22 Page IR PRD and Canvas authority to the 2026-08-16 Canvas upgrade. The Canvas index also lists a model audit as a canonical source, although audits are evidence, not authority.

**Required closure:** the ONE BOX program owner reconciles `AGENTS.md`, `README.md`, the architecture index, and the master authority register; labels every draft, superseded document, audit, and implementation plan consistently; and adds a fail-closed, machine-checkable authority/link oracle to CI. Until that oracle exists, `AGENTS.md` and `README.md` remain the contributor entry points and this document is draft evidence, not superseding authority.

#### EOS-002 — accepted target architecture and system-of-record ADR

ADR 0001 accepts one loopback modular monolith with local run artifacts and requires the ADR to be revisited before a second deployable or remote persistence authority is introduced. The operating-environment draft proposes an Electron desktop app, a web edition, Supabase project service, LiveKit, remote jobs, desktop bridges, local caches, and server-owned release state.

**Required closure:** one accepted target-topology ADR must name every deployable, system of record, trust boundary, persistence owner, synchronization direction, secret boundary, availability dependency, migration step, local-only fallback, and rollback path. Supabase, LiveKit, Electron, and any hosting provider named in a draft remain candidates, not selected vendors or authorized dependencies. Until the ADR is accepted, only reports, contracts, and disposable spikes may proceed. EOS-010 is the operational child of this topology decision, not a second topology authority.

#### EOS-003 — a narrow first release and measurable product outcome

“An interface the team never has to leave” is a compelling north star but an unsafe first release. It currently combines a site generator, high-fidelity Canvas, AI IDE, model router, skill platform, project manager, collaborative editor, browser, meeting product, release system, SEO system, and appointment acquisition control plane.

**Required closure:** define Release 1 as one end-to-end agency website journey, with an explicit excluded-capabilities list. Declare measurable outcomes such as median designer finishing time, first-candidate gate pass rate, escaped P0/P1 defects, number of manual code interventions, visual-review score, release success rate, rollback success, and post-launch support load. EOS-015 owns the matching capability matrix; the two closures must cite the same Release 1 version.

#### EOS-004 — durable planning checkpoint and shared backlog

The master-plan library does not yet contain a shared program backlog manifest or a binding to the team tracker comparable to the Page IR ticket/eval pack. A second engineer cannot derive claimable program work, state, and ownership from one authority.

**Required closure:** preserve the planning packet as a reviewable checkpoint; create a single program board; represent Initiative -> Phase -> Epic -> Ticket -> Subtask relationships; bind every ticket to requirement IDs, eval IDs, dependencies, owner, and evidence; do not make local Markdown and GitHub Issues competing status authorities.

### P1 — design before its owning phase is accepted

#### EOS-005 — cloud identity, tenancy, privacy, and data lifecycle

The existing threat model explicitly covers a local-first single-user loopback application. The draft adds project membership, client guests, cloud artifacts, transcripts, recordings, screenshots, model prompts, browser captures, notifications, and server-side secrets.

**Required closure:** threat-model the cloud service, review origin, and external-model audit channel; define tenant isolation, RBAC and least privilege, device trust, session revocation, audit access, encryption, residency, retention, deletion, export, backup, restore, legal hold, recording consent, client offboarding, model-provider egress, and audit-receipt access before E0, E3, E6, P3, or any audit containing client material. EOS-013 owns the operational handoff/offboarding procedure and must implement the same retention, deletion, and export contract.

#### EOS-006 — distributed collaboration and conflict semantics

The draft correctly refuses CRDT merging of Page IR, but “ordered commands against a known hash” is not a complete distributed consistency design.

**Required closure:** specify idempotency keys, command ordering, optimistic concurrency, offline proposal queues, duplicate delivery, reconnect, stale device behavior, partial upload, clock independence, conflict UX, abandoned work recovery, audit ordering, and disaster tests. Prove that no offline or realtime path can silently overwrite candidate, review, approval, or release authority.

#### EOS-007 — hostile browser containment

The embedded-browser plan is already rejected and blocked. The remaining planning risk is allowing “desktop shell” work to smuggle in the same remote-content host before hostile-page isolation is proven.

**Required closure:** rewrite the browser plan so every EB-001 through EB-021 finding has an owner, threat, deterministic oracle, fixture, exit gate, and retained-code boundary. No retained Electron shell, remote content, browser profile, CDP adapter, capture bridge, or updater begins before that plan passes.

#### EOS-008 — static Page IR versus React and ExperienceModules

The operating-environment draft currently describes static, React, and interactive production targets. The accepted Phase 1 source authority is deterministic static Page IR. General React targets or model-generated modules can recreate a second document/runtime authority.

**Required closure:** keep static Page IR as Release 1. Defer ExperienceModules to a separate post-Phase-1 schema/security ADR with signed manifests, fixed allowlists, CSP, network permissions, SSR/static fallback, reduced motion, accessibility, performance, SEO, ownership, updates, revocation, and removal. A module may add bounded behavior but may not author the site document or release itself.

#### EOS-009 — program-wide test strategy and CI tiers

The repository has excellent Page IR tests, but the CI workflow does not execute every documented smoke, Canvas, axe, motion, full-run, or eval command. The new domains have no common quality matrix yet.

**Required closure:** define which tests run per commit, PR, nightly, release candidate, and production-like drill. The matrix must cover unit/state-machine, schema/contract, component, accessibility, E2E, visual regression, concurrency/fault injection, sandbox escape, prompt injection, performance, install/update/rollback on Apple silicon, provider conformance, model evaluation, data migration, backup/restore, and human visual review. Every requirement needs an oracle and an evaluation owner.

#### EOS-010 — cloud and desktop operations

The current architecture intentionally defines no hosted topology. The new plan assumes sync, jobs, media, release operations, signing, notarization, and updates, none of which inherit the local monolith's operating model.

**Required closure:** after EOS-002, define environments, configuration, migrations, health checks, queues, retry and dead-letter behavior, observability, redaction, SLI/SLO, alert ownership, incident severity, runbooks, backup/restore drills, deployment rollback, desktop update rollback, version compatibility, support windows, and end-of-life policy. A hosted-packaging receipt must also prove that local dynamic-filesystem behavior cannot pull unintended repository or client files into a bundle.

#### EOS-011 — dependency, skill, plugin, and model supply chain

The Grok audit found conflicting Adopt/Adapt/Learn and license classifications. Skills, model weights, provider drivers, Electron packages, browser code, and ExperienceModules enlarge the executable supply chain.

**Required closure:** use one adoption ledger with exact package/commit/model revision, SPDX and notices, transitive review, integrity hash, permissions, maintainer/upgrade policy, vulnerability response, SBOM, provenance, sandbox, kill switch, and removal plan. “Needs license review” means no code-level use.

#### EOS-012 — cost, capacity, and routing economics

The model registry mentions estimates and cost caps, but there is no program budget for compare mode, long agent jobs, recordings, storage, realtime, browser inference, screenshots, qualification, provider previews, or client traffic.

**Required closure:** define per-project and agency budgets, reservation and cancellation, runaway-job stops, compare-mode limits, cache policy, attribution, chargeback visibility, concurrency ceilings, degraded modes, vendor failure policy, and the mandatory Grok audit budget by packet class. Auto routing must be benchmarked by task class and cannot silently fall back to a more expensive or less private lane.

#### EOS-013 — agency handoff and post-launch ownership

“Deploy and monitor” is not the end of an agency-grade product. The plan does not yet fully assign domains, DNS, analytics, consent, form destinations, content updates, CMS responsibilities, credentials, renewals, incident communication, warranty, accessibility regressions, dependency patches, exports, and client offboarding.

**Required closure:** define the support and ownership contract for the first release, including what the client can edit, what remains agency-managed, emergency rollback authority, evidence refresh, maintenance cadence, and deletion/export at termination.

#### EOS-014 — user validation and cognitive load

The seven-workspace shell and progressive inspector are sensible hypotheses, not usability evidence. Model routing, skills, candidates, gates, collaboration, browser tabs, client rooms, and shipping status can still overwhelm designers and clients.

**Required closure:** prototype and test the five critical journeys with agency designers and a client reviewer. Measure time, errors, discoverability, recovery, and confidence. Define role-based defaults, keyboard behavior, focus management, screen-reader behavior, reduced motion, empty/error states, and the point at which advanced controls appear.

#### EOS-015 — supported website capability contract

Stack Intelligence names forms, appointments, commerce, auth, data, and content frequency as decision inputs, but Release 1 does not yet say which site capabilities ONE BOX guarantees, degrades, exports, or rejects.

**Required closure:** publish a capability matrix for pages, navigation, forms, spam protection, analytics, consent, maps, embeds, CMS/content updates, localization, search, appointments, commerce, auth, dynamic data, and premium motion. Each row needs a supported source authority, runtime owner, test oracle, hosting requirement, maintenance owner, and non-goal.

#### EOS-016 — authority fallback retirement and migration

`page-ir-v1` and `template-v1` are correctly immutable within a run, but maintaining both paths doubles regression, security, support, qualification, and migration work.

**Required closure:** define the fallback's success metric, compatibility promise, observability, sunset condition, migration/non-migration policy, and the evidence needed to remove it. A kill switch is operational safety, not a permanent two-platform strategy.

#### EOS-017 — A4 motion and named-human visual qualification

Visual motion authoring remains blocked on written GSAP consent or an accepted evaluate-and-replace plan with a non-GSAP oracle and removal path. Existing bounded runtime defaults do not authorize a motion-builder UI. The named-human visual contract and current EVAL-WEB-001 status must be explicit before an implementation plan can claim high-premium visual quality.

**Required closure:** separate existing deterministic/reduced-motion behavior from visual authoring; close the GSAP or replacement decision; define the desktop/tablet/mobile review basis, rubric, reviewer identity, evidence retention, disagreement path, and rule that mechanical visual checks cannot approve taste or brief fidelity.

#### EOS-018 — contribution controls and independent-review ownership

The proposed workflow requires non-author verification for high-risk changes, but the current contribution guide, issue template, PR template, CI tiers, reviewer roster, and repository review enforcement do not yet encode that operating contract.

**Required closure:** after this operating system is owner-accepted, revise the contribution documents and repository controls as a separate planning/governance change. Name the required reviewer class for ordinary code, security/data, architecture/schema, design/visual, release/operations, and licensing decisions. Require at least one non-author approval where the risk matrix says so; do not treat a model audit as that approval.

#### EOS-019 — provider non-selection and appointment independence

Draft architecture names are not provider selections. Production hosting remains a P6 owner decision after conformance evidence. Appointment implementation remains behind PRD acceptance, independent verification, a separate implementation plan, and tests proving website deploy/rollback cannot silently strengthen, restore, or corrupt appointment authority.

**Required closure:** keep vendor names and appointment suites as planning candidates/oracles only; publish the explicit selection and acceptance gates; preserve separate website and appointment candidate, release, revocation, rollback, and runtime-downshift identities.

## 5. Senior-engineering workflow

Each stage produces a versioned artifact packet. No stage inherits approval merely because the previous stage passed.

```text
S0 Initiative and outcomes
  -> S1 Discovery and evidence
  -> S2 PRD and requirement IDs
  -> S3 Architecture, data, security, and ADRs
  -> S4 Evaluation and test design
  -> S5 Implementation plan and dependency graph
  -> S6 Ticket pack and Definition of Ready
  -> S7 Ticket implementation and local evidence
  -> S8 Pull request, CI, peer review, and independent verification
  -> S9 Release candidate, qualification, and rollback drill
  -> S10 Controlled rollout and production verification
  -> S11 Operations, metrics, incident review, and learning
```

### How the existing plan languages connect

| Existing unit | S-stage relationship | Current rule |
|---|---|---|
| ONE BOX program | S0 and S1 occur once for the website-first program and are refreshed only when the initiative or evidence basis materially changes. | Planning only. |
| Each approved P1–P8 shipping phase | Its owning PRD/design/architecture/evals/plan/tickets pass S2 through S6, then receive separate authorization before S7. | P1–P8 dependency order remains authoritative. |
| A0–A4 website/Canvas slices | Delivery capabilities subordinate to the Page IR and P1/P2 authority; they do not create another lifecycle. | A0–A3/P1–P2 stay first; A4 inherits EOS-017. |
| E0–E8 operating-environment slices | Draft decomposition of a separate expansion program. EOS-002, EOS-005, and EOS-007 must close before any slice enters S7. | No retained implementation authorization. |
| Existing Page IR OBX tickets | The accepted PRD/eval/ticket work is grandfathered through S0–S6. A current implementation change needs only its scoped S7 implementation and S8 PR audit packets unless its parent contract changes. | Do not recycle the website foundation through discovery. |
| Section 10 steps | Pre-build governance packets that close open S0–S6 program conditions. | They are not another feature phase sequence. |

S7 through S11 are the execution and operating workflow, not current permission to begin them. They become enforceable for a phase only after section 10 reaches that phase's accepted ticket packet and the owner separately authorizes implementation.

### S0 — initiative and outcomes

Required: problem statement, users, first release, non-goals, success metrics, authority owner, budget envelope, and stop conditions.

### S1 — discovery and evidence

Required: source register, user journeys, constraints, current-system inventory, claims classified as confirmed/inferred/unknown, alternatives, and unanswered questions.

### S2 — PRD and requirement IDs

Required: normative requirement IDs, acceptance behavior, error and recovery states, privacy and safety rules, compatibility, launch exclusions, and explicit implementation authorization state.

### S3 — architecture, data, security, and ADRs

Required: system context, deployables, contracts, sequence diagrams, data ownership, migrations, threat models, dependency decisions, failure modes, operational topology, and supersession rules.

### S4 — evaluation and test design

Required: requirement-to-eval traceability, fixed fixtures, deterministic oracles, performance budgets, failure injection, human review rubrics, test ownership, environments, and evidence retention.

### S5 — implementation plan and dependency graph

Required: vertical slices, ordered dependencies, owner, touched boundaries, rollout controls, rollback, observability, documentation, and separately authorized external effects.

### S6 — ticket pack and Definition of Ready

Required: one ticket per reviewable result, requirement/eval links, dependencies, acceptance criteria, non-goals, test-first oracle, security/data/license impact, telemetry, migration, rollback, owner, and estimate. Tickets that do not meet the Definition of Ready stay in refinement.

### S7 — ticket implementation and local evidence

Required: isolated branch/worktree, current-state inventory, failing or missing baseline captured first, minimal change, targeted tests, full applicable local gates, documentation, and a reviewer-ready handoff. No hidden cleanup or cross-ticket refactor.

### S8 — pull request, CI, peer review, and independent verification

Required: linked ticket, exact diff scope, test receipts, security and data notes, UI evidence where applicable, no unresolved P0/P1 review finding, required independent approval, and green merge-blocking checks. The author cannot be the only acceptance voice for a high-risk change.

### S9 — release candidate and qualification

Required: exact immutable candidate, SBOM, migration rehearsal, security/accessibility/performance/SEO evidence, provider conformance, install/update/rollback or deploy/rollback drills, runbooks, support owner, and release-owner signature.

### S10 — controlled rollout and production verification

Required: explicit release authorization, staged cohort, monitoring, stop/rollback thresholds, public-origin verification, data and cost checks, support readiness, and a time-bound owner observation window.

### S11 — operations and learning

Required: SLI/SLO reporting, incident response, defect and support review, cost review, evidence refresh, dependency patching, postmortems without blame, and decisions fed back into PRDs, ADRs, fixtures, and tickets.

## 6. Mandatory packet-declared adversarial review input

Every stage S0 through S11, every implementation ticket before work, every completed pull request before merge, and every release candidate receives a model audit under the packet's declared review policy. Existing packets that declare `x-ai/grok-4.6` continue to require one exact Grok 4.6 attempt; a reviewer, provider, or model is never inferred from availability.

This is mandatory review input, not approval or certification. The audit proves that the exact pinned model reviewed the exact hashed packet. It does not prove that the packet is correct. The named human owner and required independent verifier are the only acceptance voices.

### Granularity and anti-recursion

- Audit one packet when an S-stage is ready for its owner decision.
- Audit one bounded ticket-readiness packet before S7 and one final diff/evidence packet before S8 acceptance. Do not audit every command, commit, comment, or intermediate edit.
- Audit one immutable release-candidate packet before S9 acceptance.
- Do not audit an audit response or a finding-disposition memo by itself. Re-audit only when the target artifact hash set changes.
- Existing accepted Page IR tickets use scoped S7/S8 packets. They do not repeat S0–S6 unless their parent PRD, architecture, or eval contract changes.

### Audit packet

Each committed audit receipt stores:

1. stage or ticket ID and intended decision;
2. exact input file list with SHA-256 hashes;
3. accepted parent requirements and non-goals;
4. a bounded, redacted diff or immutable candidate hash when applicable;
5. named tests/evaluations and receipt hashes, with only the excerpts necessary to review a claim;
6. unresolved risks, missing evidence, and external authorization boundaries;
7. packet-declared primary model, requested model, reported model, provider, effort, timestamp, and usage;
8. a redacted request manifest, normalized JSON, readable Markdown verdict, and a restricted-store pointer for any retained raw request/response.

### Packet budget and data classification

- Default maximum: 25 input files, 60,000 prompt tokens, and 20,000 completion tokens. If the review cannot fit, split it into ordered domain packets plus one bounded cross-section packet; do not silently truncate.
- A split review's final cross-section packet must enumerate every domain packet hash and explicitly test authority, data-flow, security, lifecycle, and release interactions across them.
- The committed packet is hash-first. It carries exact paths, hashes, bounded excerpts, and named receipts rather than whole-repository content.
- Never send secrets, environment values, `.env*`, `sites/`, `.one-box/`, OAuth/session material, credentials, raw uploads, raw browser storage, private recordings, or client-identifying evidence.
- Binary images, video, audio, and private artifacts are represented by hash and redacted metadata unless the owner explicitly classifies a sanitized derivative as required review evidence.
- Repository audit artifacts may contain only Public or Internal-Redacted data. Raw provider payloads, when retention is necessary, live in an access-restricted audit store and are deleted 90 days after stage closure unless the owner records a different legal/operational retention basis.
- Record tokens, latency, and cost against EOS-012. Crossing the packet budget requires decomposition, not an untracked larger call.

### Verdict rules

- `PASS`, `REVISE`, and `BLOCKED` are model labels on review input, not process decisions.
- The human owner dispositions every finding. A P0/P1 closes only through correction evidence or a documented false-positive/not-applicable ruling accepted by the owner and the required independent verifier; silent risk acceptance is not closure. P2/P3 risk may be accepted with an explicit rationale and owner.
- Correct target artifacts receive a new hash set and one new audit. Preserve prior verdicts. Identical hash sets reuse the stored audit rather than paying for a non-deterministic replay.
- If an owner deliberately requests a same-hash second run, preserve both results and require human reconciliation of any disagreement.
- A different model or Grok version is not Grok evidence and cannot be labeled as such.
- Fail closed when the reported model does not match the requested model, required hashes/files are missing, or the packet violates its data class. After a timeout, provider error, or confirmed unavailability, the named human owner may authorize one named fallback model. The receipt must preserve the failed primary attempt, the authorization, and the exact fallback identity. The fallback is advisory model-review evidence, never Grok evidence, human acceptance, independent verification, or implementation authority.
- The owner may also request a supplemental model review. It is labeled supplemental, reconciled by a human when findings conflict, and cannot replace the primary attempt or any deterministic or human gate.
- If a packet changes after any review, its receipt is stale. Recompute the target hash set and repeat the packet-declared review flow; no favorable result survives changed target bytes.
- A pre-accepted emergency rollback/runbook may execute to protect users or data during model unavailability. It receives a retrospective audit after stabilization and cannot introduce new feature scope.
- A model cannot close its own P0/P1 findings. A human records correction evidence or an explicitly owned disposition, and the required independent verifier checks the high-risk boundaries.
- Failed deterministic tests, security or schema oracles, and named-human evidence/visual/release decisions always override a favorable Grok label.
- Grok is an adversarial reviewer, not an authority, certifier, peer approval, security penetration test, or release owner.

### Independent verification

Grok review does not replace deterministic tests or an independent verifier. Security boundaries, schema changes, cloud identity, browser containment, migration, release, and rollback require a separate non-author verification packet. Human visual quality, evidence truth, client approval, deployment, and rollout remain named-human decisions. EOS-018 owns the reviewer roster and repository enforcement.

## 7. Definition of Ready

A build ticket is Ready only when all are true:

- its parent phase/spec is accepted and implementation-authorized;
- requirement, eval, dependency, and owner IDs are present;
- every dependency gate is passed on current evidence;
- architecture, persistence, security, privacy, license, and cost impacts are classified;
- the expected failure is reproducible or the missing capability has a fixed acceptance oracle;
- tests, fixtures, environments, and human evidence are named before code;
- rollout, kill switch, rollback, migration, and observability obligations are explicit;
- the ticket fits one independently reviewable result;
- a current packet-declared model-review receipt exists for the current ticket hash set, including any authorized fallback record, the owner has dispositioned every finding, and no P0/P1 finding remains unresolved;
- for security, privacy, schema, browser, identity, migration, release, or rollback tickets, the named non-author verifier accepts the readiness evidence and every P0/P1 disposition;
- the owner moves it from refinement to Ready.

## 8. Definition of Done

A ticket is Done only when all are true:

- acceptance criteria pass without weakening the requirement or oracle;
- applicable unit, contract, component, E2E, accessibility, visual, security, performance, concurrency, recovery, and migration checks pass;
- every mapped blocking evaluation is current and passing;
- documentation, ADRs, runbooks, diagrams, and generated contract references are current;
- telemetry and audit receipts bind the exact change/candidate;
- no unresolved P0/P1 defect or review finding remains;
- a current packet-declared model-review receipt binds the final diff/evidence hash set, including any authorized fallback record, the owner has dispositioned every finding, and no P0/P1 finding remains unresolved;
- an independent reviewer accepts the evidence;
- rollout and rollback boundaries are explicit;
- merge, deploy, production exposure, invitation, schema, provider, or appointment actions have their own required authorization.

## 9. Required test oracles by product boundary

These are predeclared planning oracles. A row for a blocked or unauthorized domain is not permission to implement its suite or product.

| Boundary | Status | Minimum oracles when its phase is authorized |
|---|---|---|
| Page IR and candidate authority | Existing foundation; phase-specific execution authorization still applies | schema, property/invariant, deterministic compile, mutation, concurrency, crash/fault injection, promotion, recovery, traceability |
| Canvas UI | Planned; A4 inherits EOS-017 | component, keyboard, focus, axe, responsive E2E, visual regression, undo/redo, stale proposal, conflict, reduced motion |
| Agent Studio and skills | Draft E1/E2; no retained implementation | contract, capability/permission, context hashing, prompt injection, budget, cancellation, provider failure, deterministic output validation, compare fairness |
| Cloud identity and collaboration | Blocked on EOS-002/EOS-005/EOS-006 | RLS/tenant isolation, role matrix, invitation/revocation, replay/idempotency, offline/reconnect, conflict, audit ordering, backup/restore |
| Embedded browser | REJECT/blocked on EB-001–EB-021 and EOS-007 | hostile page, navigation policy, process isolation, permission denial, download, profile partition, no-debug-port, capture provenance, model-context exclusion, crash recovery |
| Client room | Blocked on P3 and EOS-005 | scoped guest access, expiration/revocation, exact-candidate binding, stale approval, recording consent/retention, media-only authority, abuse/rate limits |
| Qualification and SEO | Planned P4; schema approval required | evidence provenance, structured-data truth, accessibility, privacy, security, links, assets, performance, visual baselines, seeded-defect kill corpus |
| Release and providers | Planned P5/P6; no provider selected | conformance, retry, idempotency, stale writer, atomic promotion, public-origin verification, DNS/cache/header behavior, rollback drill |
| Desktop distribution | Blocked on EOS-002/EOS-007 | clean install, upgrade, downgrade policy, signing/notarization, update tamper, compatibility matrix, offline behavior, rollback and recovery on every agency Mac class |
| Appointment acquisition | Architecture only; implementation unauthorized under EOS-019 | full accepted PRD corpus, classifier, artifact, runtime downshift, target revocation, privacy, operations, mutation, website/appointment independence |

## 10. Planning sequence from here

Each numbered step is a separate packet-declared model-review packet. Packets already naming Grok 4.6 attempt that exact model first. The named owner dispositions every finding; unresolved P0/P1 findings block the next step, and corrected target artifacts receive one audit flow for their new hash set.

1. Reconcile MPA-001 through MPA-011 and make the master authority chain discoverable.
2. Freeze Release 1 outcome, excluded capabilities, metrics, and support boundary.
3. Accept the target-topology and system-of-record ADR, including local-to-cloud migration and rollback.
4. Complete cloud/review-origin, collaboration, data-lifecycle, desktop-bridge, and browser threat models.
5. Freeze the supported website capability matrix and keep static Page IR as Release 1 authority.
6. Freeze the program-wide evaluation strategy, CI tiers, human rubrics, and evidence-retention rules.
7. Reconcile the adoption/license catalog and establish the supply-chain/SBOM process.
8. Define cost, capacity, model-routing, degraded-mode, and provider-failure policy.
9. Produce the traceable phase plans, then ticket packs with Definition of Ready evidence.
10. Run a final pre-build audit across the complete frozen packet and record the owner go/no-go decision.

No feature implementation begins from this document alone.
