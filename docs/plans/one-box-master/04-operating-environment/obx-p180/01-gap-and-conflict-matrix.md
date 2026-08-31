# OBX-P180 Step 1: Gap and conflict matrix

- Packet: `OBX-P180`
- Step: 1 of 7
- Status: planning contract input; implementation not authorized
- Frozen product base: `d844f9fead4e42d46d44b793203fad7489cc3597`
- Planning closure base: `b6486fdfa4601b315944ad099bf2beba1c053e91`
- Authority rule: the Canvas foundation and `OBX-AUTH-ATF-001` remain unchanged

## Purpose

This step reconciles the existing routing, skills, cost, capacity, security, and
evaluation inputs before any E0 through E3 implementation plan is accepted. It
does not select a provider, authorize a network call, add a dependency, create
persistence, or expand a teammate beyond typed `read` and `propose` effects.

The handoff is the binding summary for the frozen files it names. This matrix does
not reopen those completed inputs. The source ledger below adds only the linked
planning inputs needed to resolve `OBX-P180`.

## Authority order

When two sources disagree, apply this order:

1. the program authority manifest and scoped implementation authorization;
2. accepted contracts and ADRs in the master plan;
3. accepted evaluation and security policy;
4. the proposed `OBX-P180` ticket and draft operating-environment material;
5. benchmark hypotheses, research dispositions, and model audits.

An audit result is evidence. It cannot promote a lower-authority source, accept a
risk, select a provider, or authorize implementation.

Within band 1, the machine-readable authority manifest controls program scope and
the ticket manifest controls ticket order/status. The plan register is their human
projection and cannot override either machine-readable owner. The direct handoff
controls this session's procedure and frozen-work boundary only; it cannot grant or
expand program implementation authority.

SRC-02 exclusively controls whether implementation is authorized, which effects
are allowed, and which capabilities are prohibited. SRC-18, SRC-19, SRC-29, and
SRC-01 cannot override or imply expansion of those fields.

## Source ledger

The `Class` value is closed to `authority`, `accepted contract`, `proposed
target`, `evaluation evidence`, `research evidence`, or `audit evidence`.

| ID | Class | Source | Authority and use in this packet |
|---|---|---|---|
| SRC-01 | authority | `.claude/handoffs/one-box-operating-environment-next-phase.md` | Direct session continuation instruction only: frozen Canvas boundary, closed evidence, planning-only scope, open questions, and required exact-model review. It cannot override the program manifest or create implementation authority. |
| SRC-02 | authority | `docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json` | Current machine-readable authorization. `OBX-AUTH-ATF-001` allows only the closed deterministic local foundation and explicitly prohibits provider, network, credential, persistence, mutation, deployment, and release capabilities. |
| SRC-03 | proposed target | `docs/plans/one-box-master/04-operating-environment/index.md` | Domain index. E0 through E8 are draft labels, not implementation phases. Persistent roster identity creates no process, permission, budget, route, or approval (`:15-29`). |
| SRC-04 | proposed target | `docs/plans/one-box-master/00-authority/2026-08-29-engineering-operating-system-and-gap-register.md` | Defines the proposed missing supply-chain, cost, capacity, routing, degraded-mode, and model-audit controls (`:121-131`), packet rules (`:255-305`), Definition of Ready (`:311-325`), and planning sequence (`:359-374`). The current user instruction independently requires the exact-model procedure for this task. |
| SRC-05 | proposed target | `docs/adr/0002-target-desktop-cloud-topology.md` | Proposed target, not current runtime authority. The control plane owns policy and metering; jobs are closed, ephemeral, bounded proposal producers (`:115-148`, `:225-240`). Named owner assignments are currently absent (`:242-297`). |
| SRC-06 | accepted contract | `docs/adr/0003-deep-agents-js-job-plane-evaluation.md` | Accepted ADR and frozen research disposition: keep the ONE BOX controller and adapt only delegation, interrupt, and nested-stream patterns; no Deep Agents runtime or dependency (`:21-49`, `:73-93`). A proposed packet cannot reopen this ADR. Reconsideration requires a new ADR and explicit authorization. |
| SRC-07 | research evidence | `docs/plans/one-box-master/06-technology/deepagents-js-evaluation-plan.md`, `docs/eval/one-box-program/deepagents-js-spike-results-2026-08-29.md`, and `docs/eval/one-box-program/deepagents-js-spike-results-2026-08-29.json` | T1 through T11 provide synthetic research evidence. They do not supply same-fixture performance evidence, provider authority, or retained-code authorization. |
| SRC-08 | proposed target | `docs/eval/model-routing/policy.md` | Provisional operating hypotheses and same-route retry rules. It authorizes no silent substitution and requires new acceptance checks after a route change (`:20-54`). |
| SRC-09 | evaluation evidence | `docs/eval/model-routing/benchmark-plan.md` | Pre-registered candidate-quality benchmark. Its thresholds apply to exact task/model/provider/effort/prompt/tool configurations and do not rank general intelligence (`:3-13`, `:31-116`). |
| SRC-10 | evaluation evidence | `docs/eval/model-routing/benchmark-harness.md` | Existing coordinator provides isolation, blinding, metered authorization, and immutable evidence. Current qualification rows remain advisory because mechanical/seeded validators and executed-model attestation are incomplete (`:62-87`). |
| SRC-11 | evaluation evidence | `docs/eval/model-routing/task-model-matrix.md` and `decision-log.md` | Separates hypotheses from confirmed task-local observations. It authorizes no expanded runtime route (`task-model-matrix.md:22-39`; `decision-log.md:31-44`). |
| SRC-12 | proposed target | `docs/eval/one-box-program/evaluation-strategy.md` | Defines result vocabulary, evidence binding, `PROG-EVAL-SEC-AGENT-001`, non-functional measurement, paid-call gating, and current planned gaps (`:13-43`, `:124-146`, `:212-287`). |
| SRC-13 | evaluation evidence | `docs/eval/one-box-program/manifest.json` | Registers blocking `PROG-EVAL-SEC-AGENT-001` and `PROG-EVAL-COST-001`. The cost fixture is still `planned:capacity-and-cost-fixture-v1`. |
| SRC-14 | evaluation evidence | `docs/eval/one-box-program/fixtures/agent-routing-adversarial-corpus-v1.json` | Planned synthetic fixture for tool inheritance, injection, path escape, canary leakage, fallback, telemetry, budgets, interruption, checkpoint deletion, and clean removal. |
| SRC-15 | proposed target | `docs/security/2026-08-29-program-threat-model.md` | TM-02, TM-03, TM-04, TM-05, TM-08, TM-09, and TM-13 govern this packet. Model routes must declare identity, tools, data, budget, timeout, fallback, retention, and regions before execution (`:203-245`). |
| SRC-16 | proposed target | `docs/security/supply-chain-policy.md` | Every model, skill, plugin, hosted service, and driver needs exact identity, permissions, data policy, owner, oracle, kill switch, and removal plan. `adapt`, `evaluate`, and incomplete entries cannot authorize code or service use (`:14-97`, `:163-191`). |
| SRC-17 | accepted contract | `docs/plans/one-box-master/01-foundation/release-1-contract.md` | Preserves one layout authority, typed proposal-only model behavior, named human decisions, and provider-neutral release authority (`:39-77`, `:287-340`). |
| SRC-18 | authority | `docs/plans/one-box-master/00-authority/authority-manifest.json` | Canonical domain and packet authority named by the handoff. It outranks this packet. |
| SRC-19 | authority | `docs/plans/one-box-master/00-authority/plan-register.md` | Human-readable authority and scope register named by the handoff. It records the wider operating environment as draft and the local foundation as separately scoped. |
| SRC-20 | proposed target | `docs/tickets/one-box-program/OBX-P180.md` | Proposed planning ticket for model routing, skills, budgets, and capacity. It creates no implementation authority. |
| SRC-21 | proposed target | `docs/tickets/one-box-program/OBX-P310.md` | Blocked E0 through E3 planning ticket. It depends on accepted `OBX-P180` contracts and remains blocked by this packet. |
| SRC-22 | proposed target | `docs/plans/one-box-master/04-operating-environment/ai-teammate-operating-model.md` | Draft teammate operating model. Its route, skill, compare, budget, and persistent-roster concepts require the contracts in Steps 2 through 6. |
| SRC-23 | proposed target | `docs/superpowers/specs/2026-08-29-canvas-operating-environment-design.md` | Broader operating-environment concept. It is planning evidence only and cannot authorize E0 through E8. |
| SRC-24 | accepted contract | `docs/plans/one-box-master/06-technology/technology-adoption-roadmap.md` | Accepted sequencing and technology boundary named by the handoff. It preserves `adapt-patterns-only` and no retained Deep Agents dependency. |
| SRC-25 | accepted contract | `docs/specs/2026-08-29-ai-teammate-foundation-v1.md` | Frozen completed foundation boundary. This packet must not change its implementation scope or receipt authority. |
| SRC-26 | audit evidence | `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-final-closure-receipt.json` | Hash-bound closure evidence for the frozen foundation; it does not authorize the next phase. |
| SRC-27 | audit evidence | `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-final-immutable-target-audit.json` | Exact Grok 4.6 CLEAN audit of the frozen target. Advisory evidence only. |
| SRC-28 | audit evidence | `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-fable-5-final-clean-audit.json` | Exact Fable 5 CLEAN audit of the frozen target. Advisory evidence only. |
| SRC-29 | authority | `docs/tickets/one-box-program/manifest.json` | Program ticket order and status named by the handoff. `OBX-P180` remains proposed and `OBX-P310` blocked until separately accepted. |

## Reconciled requirements

| ID | Requirement | Owning later step |
|---|---|---|
| P180-R001 | A route is an immutable, versioned policy object. It identifies provider class, model identity policy, effort, data classes, capabilities, tools, region/transfer policy, retention, price snapshot, timeout, retry, and fallback behavior. | Step 2 |
| P180-R002 | The first proposed implementation slice is provider-offline. If the owner later authorizes that exact slice, it may define schemas, registries, fixtures, and deterministic adapters but may not call a provider, read credentials, or enable a model. This packet does not itself authorize that work. | Step 2 |
| P180-R003 | Existing pinned generation routes remain unchanged and outside Agent Studio route authority. Codex OAuth remains an operator/development lane. Grok 4.6 remains an advisory audit lane. | Step 2 |
| P180-R004 | Each user-requested model or effort change starts a new immutable route segment before dispatch. No route changes during a turn and no silent substitution are allowed. | Steps 2 and 3 |
| P180-R005 | Skills and slash commands are versioned, hash-bound, deny-by-default supply-chain items. They cannot inherit tools, choose undeclared routes, accept risk, mutate Page IR, or create release authority. | Step 3 |
| P180-R006 | Context is a bounded, classified, provenance-bearing bundle. A hash binds the exact context, route, skill set, policy, and task to receipts and compare arms. | Step 3 |
| P180-R007 | The frozen teammate job and terminal receipt contracts are not edited by this packet. Future route-segment receipts are adjacent evidence linked by IDs and hashes; a compatibility ticket must authorize any runtime schema bridge. | Step 3 |
| P180-R008 | Budget authority is hierarchical and reserved before dispatch. Agency, project, assignment, route-segment, compare, retry, and reviewer cost are attributed. Provider self-report is reconciliation evidence, not budget authority. | Step 4 |
| P180-R009 | Missing price, owner cap, residency compatibility, or compliant capacity blocks dispatch. Capacity pressure queues or rejects work; it never lowers privacy, raises cost, changes effort, or selects another model. | Step 4 |
| P180-R010 | Compare mode has at most two arms in the first contract. Arms use the same task/context/skill/tool/policy snapshot, reserve their aggregate worst-case cost, emit separate receipts, and never auto-apply a winner. | Step 4 |
| P180-R011 | A retry is the same route, at most once, and only for a classified transient failure with known billing state. Any fallback is a new explicit route segment chosen by the user or authorized operator. | Step 4 |
| P180-R012 | Blocking evaluations use fixed synthetic fixtures and deterministic oracles. Quality benchmarking, security conformance, cost/capacity conformance, and named-human decisions remain separate results. | Step 5 |
| P180-R013 | All provider/model/skill/tool content and responses are untrusted. Page IR, candidate, approval, mutation, deployment, release, credential, and risk-acceptance authority remain outside the model boundary. | Step 5 |
| P180-R014 | Named humans must fill Model and Skill Security Owner, Job and Sandbox Owner, Evaluation Owner, Budget/Operations Owner, Data Protection Owner, and Independent Security Verifier before provider-connected implementation becomes Ready. | Step 6 |
| P180-R015 | Planning tickets are sequenced from provider-offline contracts and fixtures to later, separately authorized provider conformance. No ticket inherits implementation authority from this packet or from a favorable model audit. | Step 6 |
| P180-R016 | The final authorization proposal is a proposed scope record with exact paths, effects, invalidators, tests, owners, and forbidden capabilities. Only the repository owner may accept it in the authority manifest. | Step 6 |

## Gap and conflict matrix

| ID | Topic | Current evidence | Gap or conflict | Resolution in this packet | State |
|---|---|---|---|---|---|
| GC-01 | Implementation authority | SRC-02 closes the deterministic local foundation; SRC-20, SRC-22, and SRC-23 are proposed targets only. | SRC-03, SRC-20, SRC-22, and SRC-23 E1 language can be mistaken for authority beyond SRC-02. | Step 2 defines a provider-offline first slice; Step 6 proposes, but does not grant, authority. | resolved-by-contract |
| GC-02 | First provider catalog | SRC-08 through SRC-11 name provisional runtime and benchmark candidates. | SRC-08 through SRC-11 contain no accepted Agent Studio provider catalog, and their runtime slugs/prices are not current conformance evidence. | The first slice enables no live provider. A later conformance ticket may admit only an exact, owner-approved entry. | resolved-by-contract |
| GC-03 | Current runtime routes | SRC-08 and SRC-11 record pinned OpenRouter routes as low-confidence hypotheses. | Promoting SRC-08/SRC-11 routes to E1 winners would generalize unrelated evidence beyond SRC-09's task-class scope. | Preserve them unchanged and outside the new registry until task-class qualification and separate authorization. | resolved-by-contract |
| GC-04 | Codex OAuth | SRC-09 through SRC-11 include Sol, Luna, and Terra as benchmark/operator candidates. | SRC-09 through SRC-11 do not establish Codex OAuth as a product provider driver or deployable tenant credential boundary. | Keep Codex OAuth in evaluation/operator tooling only. | resolved-by-contract |
| GC-05 | Grok 4.6 | SRC-01 and SRC-04 require exact-model adversarial review; SRC-09 through SRC-11 leave runtime candidate quality incomplete. | A favorable SRC-27-style audit can be mistaken for runtime-model qualification or approval despite SRC-04's advisory rule. | Audit-only advisory lane. No product route, certification, or approval authority. | resolved-by-contract |
| GC-06 | Deep Agents JS | SRC-06 freezes `adapt-patterns-only`; SRC-07 records T1 through T11 and no material advantage. | SRC-20/SRC-22 product requirements could be conflated with the non-adopted SRC-07 runtime. | Retain ONE BOX-native controller and adapt contract patterns only. Reopening needs a new ADR and authorization. | frozen-decision |
| GC-07 | Route switching | SRC-15 TM-05 already requires a new receipted route segment for each user switch and prohibits hidden fallback and silent effort changes; SRC-20 and SRC-22 require per-turn model/effort switching. | SRC-15 TM-05 is governing and closed on receipted switching, no hidden fallback, and no silent effort change. SRC-15, SRC-20, and SRC-22 leave only the segment schema, allowed state transitions, mid-turn rejection, stale-result rule, and receipt-link fields open. | Steps 2 and 3 define the remaining pre-dispatch route-segment schema and stale-result rejection without reopening TM-05. | open-to-step-3 |
| GC-08 | Skills and slash commands | SRC-03, SRC-20, and SRC-22 name E2 skills; SRC-16 gives general supply-chain controls. | SRC-15 and SRC-16 do not supply an admission schema, invocation grammar, permission intersection, collision rule, or kill behavior. | Step 3 defines versioned admission and a closed command grammar. | open-to-step-3 |
| GC-09 | Context contract | SRC-20 and SRC-22 require context hashes and bundles. | SRC-20/SRC-22 do not close data classification, provenance, truncation, user-visible exclusions, or receipt binding required by SRC-15. | Step 3 defines context manifests, deterministic packing, and fail-closed overflow. | open-to-step-3 |
| GC-10 | Receipt compatibility | SRC-25 and SRC-26 freeze the foundation's terminal job receipts. | Adding provider fields directly would reopen SRC-25 accepted bytes and could create two receipt authorities. | Add a future adjacent route-segment receipt; bridge only through a separately accepted compatibility ticket. | resolved-by-contract |
| GC-11 | Budget authority | SRC-09/SRC-10 have benchmark caps; SRC-05 assigns metering to a future control plane. | Those sources define no agency/project reservation ledger, ownership, reconciliation, or unknown-cost rule required by SRC-04/SRC-15. | Step 4 defines hierarchical reservation and zero implicit paid budget. | open-to-step-4 |
| GC-12 | Capacity | SRC-15 requires bounded workers and compliant regions. | SRC-15 and SRC-22 define no concurrency ceilings, queue behavior, deadline behavior, or saturation oracle. | Step 4 defines conservative caps as policy inputs and Step 5 supplies synthetic vectors. | open-to-step-4 |
| GC-13 | Compare mode | SRC-22 names compare mode. | SRC-04 and SRC-22 define no arm limit, fairness snapshot, aggregate reserve, partial-failure, cancellation, or apply boundary. | Two-arm maximum, identical manifest, separate receipts, parent cancellation, no auto-apply. | open-to-step-4 |
| GC-14 | Retry versus fallback | SRC-08 permits one transient same-route retry and names escalation. | Without SRC-15's explicit-route rules, SRC-08 escalation could become silent paid or less-private fallback. | Same-route retry only. Every different route is an explicit new segment with fresh validation and reserve. | resolved-by-contract |
| GC-15 | Benchmark authority | SRC-09/SRC-10 support blinding and evidence integrity. | SRC-10 says current qualification lacks authoritative mechanical/seeded validators and executed-model attestation for OAuth rows; SRC-09 lacks the full task set. | Benchmark results remain advisory until their own promotion gates pass; they do not satisfy runtime conformance. | blocked-by-existing-gates |
| GC-16 | Cost fixture | SRC-13 points to `planned:capacity-and-cost-fixture-v1`. | Blocking `PROG-EVAL-COST-001` in SRC-13 has no executable fixture. | Steps 4 and 5 add a versioned synthetic fixture and reference evaluator. | open-to-step-5 |
| GC-17 | Security owners | SRC-05 and SRC-15 require named owner assignments. | SRC-05/SRC-15 state assignments are absent, so provider-connected readiness cannot be accepted. | Step 6 identifies exact roles and leaves provider work blocked pending active human records. | authority-blocker |
| GC-18 | Persistence | SRC-05 places durable policy/receipts in a future control plane. | SRC-02/SRC-25 authorize no persistent operating-environment state. | Contracts are storage-neutral. First slice uses fixtures/in-memory test state only; persistence is later work. | resolved-by-scope |
| GC-19 | Data residency | SRC-15 requires route and failover region compliance. | SRC-08 through SRC-11 do not prove region pinning or subprocessor compatibility. | Unknown or unpinnable residency blocks the route; no cross-region fallback. | resolved-by-contract |
| GC-20 | Price freshness | SRC-09/SRC-11 contain historical catalog snapshots. | Historical SRC-09/SRC-11 prices cannot safely reserve a later paid call under SRC-04/SRC-15. | Each enabled route requires a current immutable pricing snapshot and expiry; expired/unpriced routes are unavailable. | resolved-by-contract |
| GC-21 | Page IR and release authority | SRC-17/SRC-25 preserve typed proposal-only model effects and SRC-26 closes that foundation. | SRC-20/SRC-22 skills, compare selection, or model confidence could be treated as apply authority. | All outputs remain proposals. Apply and release remain named-human guarded funnels outside this packet. | frozen-invariant |
| GC-22 | Evidence retention | SRC-04, SRC-12, and SRC-15 separate repository-normalized evidence from restricted raw provider payloads. | SRC-04, SRC-12, and SRC-15 also state no provider-connected store or deletion owner exists. | Provider-offline slice retains no raw payload. Later connection requires external restricted-store readiness and deletion receipts. | later-provider-blocker |
| GC-23 | Teammate persistence | SRC-03 and SRC-22 describe persistent teammate identities. | Without SRC-03/SRC-15 limits, persistent identity could imply always-on execution, standing tools, budget, or route. | Persist only role/brief/handoff/evaluation identity once separately authorized; each job reconstructs grants and reserve from current policy. | resolved-by-contract |
| GC-24 | Human interruption and checkpoint deletion | SRC-14 covers interrupts and reconstruction after runtime checkpoint deletion. | SRC-12, SRC-14, and SRC-15 do not yet bind resume to a separate decision-record schema or define the retained proof that disposable runtime state is not authority. | Step 3 binds resume to a separate human decision record and Step 5 requires deletion/reconstruction fixtures. | open-to-step-5 |
| GC-25 | Telemetry and kill switch | SRC-14 tests undeclared telemetry; SRC-16 requires a product-owned kill switch. | SRC-14, SRC-15, and SRC-16 do not yet state how an enabled route denies telemetry or how an unhealthy provider/skill is disabled without its cooperation. | Steps 2 and 3 require telemetry-off declarations and owner-controlled disable state; Step 5 adds positive and negative controls. | open-to-step-5 |

## Step 1 acceptance criteria

`OBX-P180-S1` is acceptable only when:

1. every source is classified as authority, accepted contract, proposed target,
   evaluation evidence, research evidence, or audit evidence;
2. every identified conflict has one explicit resolution, later blocker, or frozen
   decision and no row silently treats a draft or audit as authority;
3. the first-slice provider decision is explicit: provider-offline, no credentials,
   no network, no live model, and no existing runtime route change;
4. the frozen Canvas, Page IR, proposal-only effect, and release-authority chain are
   unchanged;
5. the exact Grok 4.6 review binds this file's current bytes and has no unresolved
   BLOCK, HIGH, or MEDIUM finding.

Passing Step 1 permits writing Steps 2 through 6. It does not authorize runtime or
dependency changes.
