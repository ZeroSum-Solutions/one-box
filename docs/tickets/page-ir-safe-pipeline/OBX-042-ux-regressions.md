---
id: OBX-042
title: Turn UX review notes into regression and reproduction tests
status: ready
priority: P1
epic: Evaluation
depends_on: [OBX-001, OBX-031, OBX-040]
requirements: [REQ-UX-001, REQ-UX-002, REQ-UX-003, REQ-UX-004, REQ-UX-005, REQ-UX-006, REQ-UX-007, REQ-SEC-001]
evals: [EVAL-UX-001, EVAL-UX-002, EVAL-UX-003, EVAL-UX-004, EVAL-UX-005, EVAL-UX-006, EVAL-SEC-001]
---

## Problem

The attached UX notes combine resolved behavior, a reproduction-needed failure, and a
real quality gap. Treating every line as a new bug duplicates work and loses regression
coverage.

## Delivery

Add rendered tests for shipped composer, prompt, attempt, upload, workbench, and image
library behavior. Reproduce the valid same-origin 403 path on the current checkpoint
before opening a defect.

## Acceptance

- Tests cover one composer, long-prompt growth from 120px to `min(360px, 50dvh)`, focus
  after Start, state-preserving Retry/Edit, accurate 403 copy, upload
  classification/idempotency, workbench controls, and image-library safety.
- Valid same-origin Start/upload requests succeed; hostile origin/host variants fail.
- If a valid request reproduces 403, capture request/response evidence and create a P0
  ticket; do not weaken the guard.
- Existing text and button editing acceptance remains green.
- Resolved observations do not receive duplicate bug tickets.

## Non-goals

Restyling the product or masking the active output-quality gap.
