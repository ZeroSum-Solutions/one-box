# ADR 0003: Evaluate Deep Agents JS only in the isolated job plane

- Status: proposed research conclusion; adapt patterns only
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

## Proposed decision

Evaluate `langchain-ai/deepagentsjs` as a new, separate candidate runtime for ADR
0002 Zone 3 isolated jobs. Do not make it the E1 Agent Studio, control plane,
project state, route authority, teammate registry, memory authority, approval
system, Canvas mutation system, or release system.

The evaluation occurs only through the external spike and tests defined in
`docs/plans/one-box-master/06-technology/deepagents-js-evaluation-plan.md`.
Application dependencies and retained runtime code remain unchanged.

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
- A passing spike still requires a later accepted ADR and ledger change.
- A failed or removed runtime leaves the Agent Studio and project history intact.
- Tool inheritance, model routing, checkpoint state, filesystem, telemetry, and
  supply-chain behavior become explicit decision criteria rather than defaults.

## Research result

The isolated pinned spike passed T1 through T11 but did not show a material runtime
advantage. It required a 196-line fail-closed policy wrapper and a peer-complete
tree with 54 production package/version nodes. The SDK defaults are permissive for
filesystem operations, omitted subagent permissions inherit parent permissions,
and an implicit general-purpose subagent is added unless explicitly replaced.
LangGraph checkpoint state and LangSmith also remain additional ownership surfaces.

The proposed conclusion is therefore to retain the ONE BOX-native job controller
and adapt only delegation, interruption, and nested-stream contract ideas. See the
[normalized spike result](../eval/one-box-program/deepagents-js-spike-results-2026-08-29.md).

## Status transition

The external spike, supply-chain census, and comparison are complete. This ADR
remains a proposed research conclusion until the exact Grok 4.6 audit, named owner
decision, and independent verification are complete. Even acceptance authorizes
no retained upstream runtime; any future reconsideration needs a new ledger entry,
implementation ticket, and explicit authorization.
