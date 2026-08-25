---
id: OBX-031
title: Make Page IR edits authoritative and fully transactional
status: ready
priority: P0
epic: Editing
depends_on: [OBX-015, OBX-024, OBX-025, OBX-029, OBX-030]
requirements: [REQ-EDT-001, REQ-EDT-005, REQ-EDT-006, REQ-EDT-007, REQ-SEC-001]
evals: [EVAL-CAND-007, EVAL-EDIT-002, EVAL-EDIT-003, EVAL-EDIT-004, EVAL-SEC-001]
---

## Problem

The compiled site is a projection for Page IR runs. Directly editing that projection
would make rebuild discard the edit or make the recorded Page IR hash false.

## Delivery

For `page-ir-v1`, translate every supported editor action into a typed IR mutation,
validate, compile a candidate, run the capability-required gates, and promote through
the existing authority. Keep `template-v1` on its current guarded-file path.

## Acceptance

- Page IR runs reject direct compiled-file mutation.
- A supported edit updates persisted validated IR, survives restart/rebuild, and
  reaches the live site only through candidate promotion.
- An unsupported IR capability fails without changing IR, candidate, or live output.
- Template-v1 guarded edits remain compatible and cannot relabel the run as Page IR.
- Rejected mutations restore files and gate report byte-for-byte even if restorative
  gates fail.
- Rejected Page IR mutations restore persisted IR, candidate files, candidate-scoped
  report, live bundle, and canonical live report byte-for-byte as applicable.
- Commit then approval-invalidation ordering is preserved.
- Interleaving with promotion and other mutations is serialized without deadlock.

## Non-goals

An unversioned reverse compiler from arbitrary DOM/source back into Page IR.
