---
id: OBX-P270
status: blocked
priority: P1
epic: P8 migration
owner-role: migration and support owners
depends-on: OBX-P250, OBX-P190
requirements: P8, EOS-016
evaluations: PROG-EVAL-COMPAT-001, PROG-EVAL-HANDOFF-001, PROG-EVAL-DRILL-001
---

# OBX-P270: Plan P8 legacy migration, support, and retirement

## Outcome

Legacy template runs and clients remain safe/readable, migrate only explicitly, and retire with evidence.

## Readiness gate

No silent source-mode conversion, indefinite dual-platform promise, or destructive migration.

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
