---
id: OBX-P150
status: in-review
priority: P0
epic: Supply chain
owner-role: security and licensing owners
depends-on: OBX-P100, OBX-P130, OBX-P140
requirements: EOS-011
evaluations: PROG-EVAL-SC-001
---

# OBX-P150: Enforce supply-chain policy and adoption ledger

## Outcome

Every executable dependency, model, skill, plugin, worker, desktop package, module, and hosted asset is pinned, licensed, permissioned, qualified, disableable, and removable.

## Readiness gate

Blocked, unselected, or license-review items cannot enter a production build.

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
