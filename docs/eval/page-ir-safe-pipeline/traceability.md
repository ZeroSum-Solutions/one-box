# Phase 1 traceability

Every normative PRD requirement maps to at least one evaluation and one delivery
ticket. The machine-readable manifests remain the sources for eval and dependency
metadata; this table is the review surface.

| Requirement | Evaluation evidence | Delivery ticket |
|---|---|---|
| REQ-SCP-001 | EVAL-SCOPE-001 | OBX-001 |
| REQ-SCP-002 | EVAL-SCOPE-002 | OBX-001 |
| REQ-SCP-003 | EVAL-SCOPE-003 | OBX-002 |
| REQ-SCP-004 | EVAL-SCOPE-001 | OBX-001 |
| REQ-IR-001 | EVAL-IR-001 | OBX-020 |
| REQ-IR-002 | EVAL-IR-002, EVAL-WEB-001 | OBX-020, OBX-022 |
| REQ-IR-003 | EVAL-IR-002 | OBX-020 |
| REQ-IR-004 | EVAL-IR-003 | OBX-020 |
| REQ-IR-005 | EVAL-IR-004, EVAL-QUAL-003 | OBX-021 |
| REQ-IR-006 | EVAL-COMP-001 | OBX-022 |
| REQ-IR-007 | EVAL-COMP-002 | OBX-025 |
| REQ-IR-008 | EVAL-SCOPE-003 | OBX-002 |
| REQ-LAY-001 | EVAL-LAY-001 | OBX-023 |
| REQ-LAY-002 | EVAL-LAY-001 | OBX-023 |
| REQ-LAY-003 | EVAL-LAY-002 | OBX-023 |
| REQ-LAY-004 | EVAL-LAY-002 | OBX-023 |
| REQ-LAY-005 | EVAL-LAY-001 | OBX-023 |
| REQ-BLD-001 | EVAL-CAND-001 | OBX-010, OBX-012 |
| REQ-BLD-002 | EVAL-CAND-001, EVAL-CAND-002 | OBX-011, OBX-012 |
| REQ-BLD-003 | EVAL-CAND-001, EVAL-CAND-002 | OBX-012 |
| REQ-BLD-004 | EVAL-CAND-003 | OBX-013 |
| REQ-BLD-005 | EVAL-CAND-003 | OBX-013 |
| REQ-BLD-006 | EVAL-CAND-004, EVAL-CAND-007 | OBX-014, OBX-015 |
| REQ-BLD-007 | EVAL-CAND-005 | OBX-010 |
| REQ-BLD-008 | EVAL-CAND-006 | OBX-015 |
| REQ-BLD-009 | EVAL-CAND-008 | OBX-014 |
| REQ-EDT-001 | EVAL-CAND-007, EVAL-SEC-001 | OBX-029, OBX-031 |
| REQ-EDT-002 | EVAL-EDIT-001 | OBX-030 |
| REQ-EDT-003 | EVAL-EDIT-001 | OBX-030 |
| REQ-EDT-004 | EVAL-EDIT-001 | OBX-030 |
| REQ-EDT-005 | EVAL-EDIT-002 | OBX-031 |
| REQ-EDT-006 | EVAL-EDIT-003 | OBX-031 |
| REQ-EDT-007 | EVAL-EDIT-004 | OBX-031 |
| REQ-UX-001 | EVAL-UX-001 | OBX-042 |
| REQ-UX-002 | EVAL-UX-001 | OBX-042 |
| REQ-UX-003 | EVAL-UX-002, EVAL-UX-006 | OBX-042 |
| REQ-UX-004 | EVAL-UX-002, EVAL-UX-003, EVAL-UX-006 | OBX-042 |
| REQ-UX-005 | EVAL-UX-003 | OBX-042 |
| REQ-UX-006 | EVAL-UX-004 | OBX-042 |
| REQ-UX-007 | EVAL-UX-005 | OBX-042 |
| REQ-UX-008 | EVAL-WEB-002, EVAL-WEB-003, EVAL-QUAL-001, EVAL-QUAL-002, EVAL-QUAL-003 | OBX-021, OBX-041 |
| REQ-OPS-001 | EVAL-OPS-001 | OBX-010, OBX-014, OBX-025, OBX-050 |
| REQ-OPS-002 | EVAL-REPLAY-001 | OBX-024 |
| REQ-OPS-003 | EVAL-REPLAY-002 | OBX-013, OBX-024 |
| REQ-OPS-004 | EVAL-OPS-002 | OBX-050 |
| REQ-OPS-005 | EVAL-OPS-003 | OBX-050 |
| REQ-OPS-006 | EVAL-QUAL-002, EVAL-OPS-004 | OBX-040, OBX-041, OBX-051 |
| REQ-SEC-001 | EVAL-SEC-001 | OBX-001, OBX-029, OBX-031, OBX-042 |
| REQ-SEC-002 | EVAL-IR-002, EVAL-SEC-002 | OBX-010, OBX-014, OBX-020 |
| REQ-SEC-003 | EVAL-IR-002, EVAL-WEB-001 | OBX-020, OBX-022 |
| REQ-SEC-004 | EVAL-CAND-005, EVAL-SEC-002 | OBX-010, OBX-014 |
| REQ-SEC-005 | EVAL-SEC-003 | OBX-040 |

## Closure rule

A ticket is verified when its own acceptance criteria pass independently. If the eval
manifest names that ticket as an evaluation's `evaluationOwner`, that evaluation must
also be PASS. Other linked evaluations are traceability and regression obligations:
an already-passing eval may not regress, but an end-to-end eval owned by a later
dependency does not deadlock an earlier ticket. Every evaluation owner must be the last
required ticket in dependency order.

A requirement is complete only when all mapped tickets are done, all mapped blocking
evaluations are PASS, and required human evidence is present.
