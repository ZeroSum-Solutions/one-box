---
id: OBX-P370
status: blocked
priority: P0
epic: Appointment acquisition
owner-role: appointment product and security owners
depends-on: OBX-P100
dependency-semantics: Consumes only the reconciled program authority and traceability contract from OBX-P100; provider selection and website release outcomes remain outside this architecture-only ticket.
requirements: EOS-019, APPT-REQ-001
evaluations: PROG-EVAL-APPT-001
---

# OBX-P370: Plan appointment as an independent track

## Outcome

Appointment implementation, qualification, activation, revocation, rollback, and operations retain a separate authority chain.

## Readiness gate

PRD acceptance, independent verification, threat/eval/plan/tickets, and explicit activation authorization are required. `OBX-P100` supplies only the reconciled program authority and traceability contract; provider selection, vendor choice, website delivery, and the P6 outcome are not prerequisites or authorities for this ticket.

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
