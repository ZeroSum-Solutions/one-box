---
id: OBX-040
title: Build the credential-free Phase 1 evaluation harness
status: ready
priority: P0
epic: Evaluation
depends_on: [OBX-010, OBX-020]
requirements: [REQ-OPS-006, REQ-SEC-005]
evals: [EVAL-WEB-001, EVAL-WEB-002, EVAL-WEB-003, EVAL-SEC-003]
---

## Problem

The PRD cannot be enforced by prose. Safety and determinism checks need a frozen,
credential-free runner with immutable inputs and explicit blocked/fail semantics.

## Delivery

Implement manifest validation, fixture preparation, candidate/failure orchestration,
hash verification, browser evidence capture, result aggregation, and a lock file.

## Acceptance

- Harness validates every manifest entry, ticket reference, fixture, and required
  artifact before execution.
- Bidirectional validation rejects drift among eval ticket lists, evaluation owners,
  ticket front matter, and traceability rows.
- Contract/compiler/candidate/replay/security tests run with provider credentials
  absent.
- Result states distinguish PASS, FAIL, BLOCKED, and NOT_RUN.
- Rendered merge blockers use recorded/stubbed provider responses and never make a
  metered call.
- Frozen numeric/accessibility/performance/retention thresholds are read from the eval
  manifest or the exact registered source named by it.
- Existing results and frozen inputs cannot be overwritten.
- A manifest change requires a new version and lock.

## Non-goals

Running paid providers or fabricating human review records.
