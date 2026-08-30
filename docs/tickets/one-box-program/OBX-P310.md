---
id: OBX-P310
status: blocked
priority: P1
epic: Operating environment
owner-role: platform owner
depends-on: OBX-P120, OBX-P130, OBX-P140, OBX-P170, OBX-P180
requirements: E0, E1, E2, E3
evaluations: PROG-EVAL-TOPO-001, PROG-EVAL-SEC-TENANT-001, PROG-EVAL-SEC-AGENT-001, PROG-EVAL-COST-001
---

# OBX-P310: Plan E0-E3 operating-environment contracts

## Outcome

Identity, agent proposals, planning drafts, tasks, comments, presence, and cursors gain accepted authority and tenancy contracts before retained work.

## Readiness gate

No desktop shell in E0, model authority, CRDT Page IR, or implementation from the current draft.

## Bounded delivery

Produce the accepted contract, threat and evaluation evidence, test-first implementation plan, and child tickets required for this outcome. Do not perform product implementation, select a vendor, change a schema, invite a client, deploy, or activate appointments under this planning ticket.

## Acceptance criteria

- Every listed requirement maps to the listed evaluation and to an owner in the machine manifests.
- Every dependency is accepted and its blocking evidence is current; otherwise this ticket remains proposed or blocked.
- The packet defines success, failure, recovery, security/data/license/cost effects, observability, migration or compatibility where applicable, rollback or removal, and explicit non-goals.
- One exact Grok 4.6 review, or an owner-authorized labeled fallback review under the reviewer-role matrix, records requested and reported model, packet hash, verdict, findings, and limitations.
- No unaccepted P0/P1 remains. The named owner and required non-author reviewer record acceptance; the model cannot do so.

## Evidence boundary

Planning artifacts and audits are review input, not implementation or release authorization. Any live, metered, provider, repository-settings, client-invitation, schema, deployment, or appointment effect keeps its separate authority gate.
