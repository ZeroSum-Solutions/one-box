---
id: OBX-P180
status: proposed
priority: P1
epic: Agent platform
owner-role: agent platform and finance owners
depends-on: OBX-P120, OBX-P130, OBX-P140, OBX-P150
requirements: EOS-006, EOS-012
evaluations: PROG-EVAL-COST-001, PROG-EVAL-SEC-AGENT-001
---

# OBX-P180: Specify model routing, skills, budgets, and capacity

## Outcome

Every model and skill call declares data, tools, authority, quality, cost, concurrency, fallback, cancellation, and retention.

## Readiness gate

No hidden paid/privacy fallback, direct secret, authority tool, or automatic application is allowed.

## Bounded delivery

Produce the accepted contract, threat and evaluation evidence, test-first implementation plan, and child tickets required for this outcome. Do not perform product implementation, select a vendor, change a schema, invite a client, deploy, or activate appointments under this planning ticket.

Related planning inputs: [AI teammate operating model](../../plans/one-box-master/04-operating-environment/ai-teammate-operating-model.md), [Deep Agents JavaScript candidate intake](../../research/source-catalog/deepagents-js-candidate-intake-2026-08-29.md), [evaluation plan](../../plans/one-box-master/06-technology/deepagents-js-evaluation-plan.md), and [ADR 0003](../../adr/0003-deep-agents-js-job-plane-evaluation.md).

## Acceptance criteria

- Every listed requirement maps to the listed evaluation and to an owner in the machine manifests.
- Every parent and subagent has an explicit deny-by-default tool list; a child never inherits shell, browser, credentials, network, mutation, external-effect, or authority tools by omission.
- A persistent teammate identity is only durable role, brief, handoff, and evaluation context. Process lifetime, human ownership, route choice, authoritative project state, budgets, approvals, and release authority remain separate and explicit.
- Runtime checkpoints and caches are disposable. Authoritative tasks, decisions, candidate state, and receipts remain in ONE BOX and can reconstruct a job after runtime state deletion.
- A Deep Agents JavaScript disposition requires all T1 through T11 spike outcomes, dependency/license/telemetry evidence, an existing-controller comparison, a removal proof, exact Grok 4.6 review, named owners, and separate retained-code authorization.
- Every dependency is accepted and its blocking evidence is current; otherwise this ticket remains proposed or blocked.
- The packet defines success, failure, recovery, security/data/license/cost effects, observability, migration or compatibility where applicable, rollback or removal, and explicit non-goals.
- One exact Grok 4.6 review, or an owner-authorized labeled fallback review under the reviewer-role matrix, records requested and reported model, packet hash, verdict, findings, and limitations.
- No unaccepted P0/P1 remains. The named owner and required non-author reviewer record acceptance; the model cannot do so.

## Evidence boundary

Planning artifacts and audits are review input, not implementation or release authorization. The external synthetic spike is a research exception that can produce evidence only; it cannot make this ticket `ready`, install an application dependency, or confer implementation authority. Any live, metered, provider, repository-settings, client-invitation, schema, deployment, or appointment effect keeps its separate authority gate.
