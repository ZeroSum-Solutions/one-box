---
id: OBX-013
title: Repair candidates without touching the live site
status: ready
priority: P0
epic: Candidate
depends_on: [OBX-012]
requirements: [REQ-BLD-004, REQ-BLD-005, REQ-OPS-003]
evals: [EVAL-CAND-003, EVAL-REPLAY-002]
---

## Problem

The build repair pass reads and writes the already-published `site/` files. Its retry
allowance can also be consumed by failures that never completed a repair.

## Delivery

Run bounded repairs exclusively against allow-listed candidate artifacts, rerun the
full suite, and make the allowance lifecycle transactional.

## Acceptance

- File tracing proves repair never writes live site or approved evidence artifacts.
- Repair targets are closed and validated before an attempt is claimed.
- Every completed repair runs the full blocking suite against the same candidate.
- Read, validation, provider, and write failures that produce no repair release the
  allowance; a completed attempt cannot be repeated.
- Remaining failures leave the candidate failed and the live site unchanged.

## Non-goals

Increasing repair rounds or allowing repair to patch gates and approval records.
