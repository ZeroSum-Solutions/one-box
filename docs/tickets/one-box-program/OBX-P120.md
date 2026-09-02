---
id: OBX-P120
status: in-review
priority: P0
epic: Architecture
owner-role: architecture owner
depends-on: OBX-P100, OBX-P110
requirements: EOS-002, EOS-003, EOS-004, EOS-010
evaluations: PROG-EVAL-TOPO-001
---

# OBX-P120: Accept target desktop-cloud topology ADR

## Outcome

Current local and target client, control-plane, worker, realtime, release, and delivery zones have explicit authority and migration boundaries.

## Readiness gate

ADR 0001 remains executable authority until each reversible contract-tested migration passes.

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
