# ONE BOX AI teammate operating model

- Status: planning draft
- Date: 2026-08-29
- Implementation authorized: no
- Parent: `OBX-P180` and `OBX-P310`

## Decision

ONE BOX should present a persistent roster of recognizable AI teammates while
executing every assignment as a bounded, receipted job. A persistent identity is
not an always-running process and is never an accountable human role.

The product experience and the execution contract are deliberately separate:

```text
persistent teammate identity
  name + specialty + skills + memory namespace + route preferences + history
        |
        v
ONE BOX deterministic orchestrator
  accepted task + typed context + explicit route + tools + budget + deadline
        |
        v
bounded isolated run
  propose -> challenge -> verify -> receipt -> stop
        |
        v
receipt persistence + mechanical state; named human decisions
```

This preserves the useful teammate experience without turning a model into a
manager, approver, release owner, security owner, or source of durable truth.

## Why teammates are useful

The product has repeated, separable work with measurable outputs: research,
requirements extraction, architecture options, Canvas proposals, implementation
drafts, cross-boundary QA, security challenge generation, and release-quality/SEO
analysis. Persistent specialties reduce repeated prompting, make tool permissions
understandable, and provide visible ownership of work products.

The expected value is leverage and continuity, not autonomous authority. The team
is useful only while assignments are bounded, outputs are typed proposals, routes
and costs are visible, and independent/human gates remain outside the model.

## Persistent roster

The UI may retain teammate identity, description, avatar, specialty, skills,
default route preferences, permitted data classes, memory namespace, activity
history, and current availability. It may show `idle`, `queued`, `running`,
`waiting-for-input`, `challenging`, `blocked`, `complete`, `failed`, `cancelled`,
`rejected`, or `budget-exhausted`. Every terminal state emits a typed receipt with
the stopping condition, partial-output hash when one exists, and retry eligibility.

The roster is not a set of background daemons. `idle` means no process, tools,
provider session, lease, or budget is active. Schedules create a new bounded job;
they do not keep an agent alive.

### On-demand capability lanes

| Teammate identity | Produces | Must never do |
|---|---|---|
| Researcher | source-linked evidence packs with observation/inference separation | approve evidence, follow fetched instructions, or use unsanctioned fetches |
| PRD Planner | draft requirements, decisions, criteria, tickets, and traceability | mark a requirement accepted or invent business approval |
| Architecture Analyst | ADR options, boundary comparisons, contract proposals | accept an ADR, dependency, schema, provider, or risk |
| Canvas Designer | design-contract and typed Canvas mutation proposals | apply a mutation, approve taste, or bypass Page IR |
| Implementation Producer | isolated diffs for an implementation-authorized ticket | self-merge, deploy, publish, or work without an authorized ticket |
| QA Challenger | cross-boundary seam tests, failure reproduction, and fixture proposals | record a blocking PASS for its own output or quarantine a gate |
| Security Challenger | threat cases, prompt-injection fixtures, and advisory findings | accept risk, hold credentials, or close P0/P1 findings |
| SEO Qualifier | metadata, structured-data, accessibility, performance, and content evidence | publish, release, or make unsupported claims |

External packet reviewers such as exact Grok 4.6 are advisory reviewers, not roster
members with product authority. They cannot replace deterministic verification or
the required non-author human verifier.

## Deterministic orchestration

Delivery coordination is ONE BOX infrastructure plus a named human program owner,
not a model role. The default workflow combines four patterns:

1. **Expert routing:** task type selects the smallest capable teammate.
2. **Pipeline:** accepted task flows through produce, challenge, verify, and receipt.
3. **Producer–reviewer:** the producer cannot be its only reviewer; retries are capped.
4. **Supervisor loop:** the deterministic orchestrator drains explicit tickets within
   budgets and stops when the queue, budget, deadline, or cancellation condition fires.

Cross-boundary QA compares both sides of every changed interface: producer and
consumer field shape, optionality, collections, enums, units, error channels, and
identity. File existence is never sufficient verification.

## Run contract

Every run declares before provider execution:

- tenant, project, task, actor, teammate identity, and immutable input hash;
- provider, model, revision, effort, region/transfer policy, and retention;
- explicit parent and child tool and permission arrays; missing or `null` arrays
  are construction errors, while an explicitly written `[]` means no grant;
- allowed data classes and redaction policy;
- token, currency, time, concurrency, delegation-depth, and output-size budgets;
- timeout, cancellation, retry, and fallback behavior;
- expected output schema and evidence destination;
- policy, skill, fixture, and toolchain versions.

A person may switch model or effort freely between turns or jobs. The switch ends
the prior route segment and starts a new receipted segment. During the Deep Agents
spike, fallback is `none`. A later accepted product contract may allow only an
explicitly declared fallback with its own data, region, quality, cost, and reason
receipt. Hidden or provider-selected fallback is forbidden.

## Tool and effect boundary

Tools are separated into `read`, `propose`, `mutate`, `external-effect`, and
`authority`. Each teammate receives an explicit allowlist for one job. Deep Agents
or any later runtime is wrapped so an omitted subagent tool list is a construction
error.

Every child tool, filesystem grant, data class, and effect must be a subset of its
parent's declared grants. Effective child grants are the intersection of parent and
child allowlists. Any requested child grant outside the parent set fails
construction before model execution; delegation can reduce authority but never
expand it.

- Research evaluation starts with `read` and `propose` only.
- `mutate` requires an implementation-authorized ticket and the guarded ONE BOX
  mutation or repository workflow.
- `external-effect` requires the effect-specific ticket, human gate, idempotency,
  and receipt.
- `authority` is never available to a model, skill, worker, or provider.

The only non-human post-run transitions are: persist the immutable receipt, record
a deterministic verification result, stop/cancel the run, and enqueue an already
authorized next bounded job. Accepting or applying a proposal, qualifying a
candidate, changing scope, accepting risk, authorizing a ticket, releasing, or
publishing always requires the named human gate defined by the owning contract.

Filesystem access is virtual and rooted to one ephemeral job workspace. Real local
filesystem or shell backends are denied by default and require a separate accepted
sandbox implementation. Browser profiles, cookies, credentials, client files, Page
IR authority, deployment targets, and release records are never ambient context.

## State and memory

ONE BOX is the only durable state authority. A runtime checkpoint, scratch
filesystem, todo list, or model memory is disposable execution cache.

- Durable facts become typed ONE BOX records after validation.
- Agent memory is scoped by teammate plus tenant/project/user as applicable.
- Organization policy and shared skills are read-only to model runs.
- A proposed memory write is reviewed like any other mutation; agents do not edit
  shared policy or approval history directly.
- Concurrent writes use versioned proposals and explicit conflict handling, not
  last-write-wins authority.
- Deleting a runtime checkpoint cannot delete the authoritative receipt, artifact,
  decision, or run result.

No new runtime fields enter `src/lib/contracts.ts` until the owning subsystem,
schema, threat model, evaluation, implementation plan, and authorization are
accepted. Draft vocabulary such as `AgentRunReceiptV1` remains planning-only.

## Human accountability

Named humans retain:

- product scope, business decisions, evidence acceptance, and design taste;
- architecture selection and implementation authorization;
- identity, tenancy, data, security, supply-chain, and license ownership;
- risk acceptance and P0/P1 disposition;
- client decisions and candidate locks;
- production release initiation and approval by two distinct active humans;
- owner-role assignments and independent non-author verification.

One human may hold several roles in a small team, but cannot self-approve where
independence or the two-human release policy applies.

## Interface requirements

The Canvas shell should expose:

- a compact teammate roster with availability and permission summary;
- assignment composer with task, model, effort, skill, budget, and data controls;
- live plan/subtask stream with collapsible tool and evidence cards;
- explicit human-interrupt cards showing the exact proposed effect and target;
- compare mode for alternative model outputs without automatic application;
- one activity log across humans and agents with filters by actor, task, model,
  candidate, and receipt;
- clear separation between `proposal`, `mechanically verified`, `human accepted`,
  `qualified`, and `released`.

Roster controls, assignment fields, compare mode, activity filters, and interrupt
cards require complete keyboard operation, accessible names and descriptions,
visible focus, and textual state/error labels that do not rely on color. Approve,
reject, cancel, and resume events must be announced to assistive technology.

## Adoption boundary

The roster, task model, route policy, permissions, receipts, activity history,
human gates, and UI are ONE BOX-native regardless of runtime choice. The completed
Deep Agents JS evaluation is `adapt-patterns-only`; it is not a current job-plane
runtime candidate. Its delegation, interrupt, and nested-stream ideas may inform
ONE BOX-native contracts, but no upstream runtime or code enters the application.
A future runtime reconsideration requires a new intake and authorization and must
not remove the teammate UX, project history, or authority chain.

## Exit criteria

This model is ready for implementation planning only when `OBX-P180` and
`OBX-P310` are ready, human assignments exist, route/tool/memory/receipt contracts
are accepted, the agent security and cost evaluations have executable fixtures,
the selected runtime has an accepted ledger entry, and separate implementation
authorization is recorded.
