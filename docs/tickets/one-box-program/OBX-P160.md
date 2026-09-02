---
id: OBX-P160
status: blocked
priority: P0
epic: Desktop and browser
owner-role: desktop security owner
depends-on: OBX-P120, OBX-P130, OBX-P150
requirements: EOS-005, EB-001, EB-002, EB-003, EB-004, EB-005, EB-006, EB-007, EB-008, EB-009, EB-010, EB-011, EB-012, EB-013, EB-014, EB-015, EB-016, EB-017, EB-018, EB-019, EB-020, EB-021
evaluations: PROG-EVAL-SEC-BROWSER-001, PROG-EVAL-COMPAT-001
---

# OBX-P160: Rewrite retained desktop and embedded-browser security plan

## Outcome

A fresh plan maps every EB finding to an owner, oracle, and exit gate, starting with hostile-page isolation.

## Readiness gate

No retained native/remote-content shell or browser sequence until EB-001 through EB-021 close.

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
