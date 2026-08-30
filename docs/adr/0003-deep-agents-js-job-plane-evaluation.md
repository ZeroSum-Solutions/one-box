# ADR 0003: Evaluate Deep Agents JS only in the isolated job plane

- Status: recorded research disposition; adapt patterns only
- Date: 2026-08-29
- Implementation authorized: no

## Context

ONE BOX needs a visible roster of specialized AI teammates, per-turn model and
effort switching, skills, planning, task delegation, human interrupts, and
receipted work. The existing technology research retained capability-middleware
ideas from the Python Deep Agents repository but rejected importing its
Python/LangGraph runtime or broad filesystem authority.

A separate JavaScript SDK now exposes relevant agent, subagent, backend,
interrupt, and frontend-streaming primitives. It still depends on LangGraph and
can expose broad filesystem, shell, model-binding, memory, and telemetry surfaces.
Treating it as the existing Python candidate would erase the artifact and
dependency boundary.

## Decision

Set `langchain-ai/deepagentsjs` to **adapt-patterns-only**. It is not a current ADR
0002 Zone 3 runtime candidate. Keep the existing ONE BOX controller and adapt only
delegation, interrupt, and nested-stream contract ideas. Do not make the SDK the E1
Agent Studio, control plane, project state, route authority, teammate registry,
memory authority, approval system, Canvas mutation system, or release system.

The completed evaluation is retained only as external research evidence under
`docs/plans/one-box-master/06-technology/deepagents-js-evaluation-plan.md`.
Application dependencies and retained runtime code remain unchanged. Reopening a
runtime path requires a new intake, evaluation, ADR, ledger decision, and explicit
implementation authorization.

## Runtime-independent ONE BOX ownership

ONE BOX owns:

- persistent teammate identities and activity history;
- accepted task, project, tenant, actor, and candidate context;
- model/provider/effort/data/budget/fallback policy;
- explicit tool and filesystem permissions;
- skills and plugin admission;
- human interruption and approval records;
- durable receipts, artifacts, decisions, and lifecycle transitions;
- deterministic and human verification;
- cancellation, scheduling, cost attribution, release, and incident controls.

The candidate may own only disposable internal execution state for one job.

## Alternatives

1. **Extend the existing ONE BOX controller and retained AI SDK.** Lowest new
   dependency and state cost; requires building delegation, interruption, and
   context-isolation primitives.
2. **Adopt Deep Agents JS now.** Rejected: no candidate intake, supply-chain
   clearance, isolation evidence, owner assignment, or implementation authority.
3. **Adapt middleware patterns only.** Remains the fallback if the runtime does not
   materially beat the existing controller.
4. **Use the Python repository.** Rejected for the current TypeScript application
   and unchanged by discovery of the separate JavaScript SDK.

## Consequences

- The teammate product model can proceed in planning without selecting a runtime.
- The spike adds no application dependency or production authority.
- Any future runtime-adoption proposal still requires a new accepted ADR and
  ledger change; this spike closes only the pattern-only research disposition.
- A failed or removed runtime leaves the Agent Studio and project history intact.
- Tool inheritance, model routing, checkpoint state, filesystem, telemetry, and
  supply-chain behavior become explicit decision criteria rather than defaults.

## Research result

The isolated pinned spike passed T1 through T11 but did not demonstrate a material
runtime advantage. It required a 275-line fail-closed policy wrapper and a peer-complete
tree with 54 production package/version nodes. The SDK defaults are permissive for
filesystem operations, omitted subagent permissions inherit parent permissions,
and an implicit general-purpose subagent is added unless explicitly replaced.
LangGraph checkpoint state and LangSmith also remain additional ownership surfaces.

The decision is therefore to retain the ONE BOX-native job controller
and adapt only delegation, interruption, and nested-stream contract ideas. See the
[normalized spike result](../eval/one-box-program/deepagents-js-spike-results-2026-08-29.md).

## Status transition

The external spike and supply-chain census are complete. The comparison is an
architectural assessment, not same-fixture baseline performance evidence. The exact
Grok 4.6 completed-packet audit and independent verification remain review inputs
and cannot authorize code. This decision authorizes no retained upstream runtime;
any future reconsideration needs a new ledger entry, implementation ticket, named
owners, and explicit authorization.
