---
id: OBX-014
title: Promote candidates atomically and invalidate visual approval
status: ready
priority: P0
epic: Candidate
depends_on: [OBX-012, OBX-013]
requirements: [REQ-BLD-006, REQ-BLD-009, REQ-OPS-001, REQ-SEC-004]
evals: [EVAL-CAND-004, EVAL-CAND-008, EVAL-OPS-001, EVAL-SEC-002]
---

## Problem

Promotion must bind the exact gated bytes to the served site and visual-QA state. A
rename alone is insufficient without lock ownership, manifest revalidation, and
post-commit approval invalidation.

## Delivery

Create one promotion operation under the existing site-authority lock: revalidate the
candidate, atomically replace a self-contained bundle containing the site and its
canonical gate report, restore both on failure, record hashes, and invalidate prior
visual approval only after commit.

## Acceptance

- Only a promotable candidate whose deterministic manifest and candidate-scoped gate
  hashes match can enter promotion.
- Injected failures around every promotion step leave a complete old or new site and
  matching canonical gate report, never a cross-version mix.
- Rejected/failed promotion preserves prior visual approval; successful promotion
  invalidates it and binds the next review to the promoted hash.
- Stale approval blocks release/export/client handoff but not preview or further edits.
- Retired data is removed only after the new live site and provenance are durable.
- Any run-root gate-report compatibility copy is derived and cannot determine live
  status.

## Non-goals

Cross-machine deployment or remote transactional storage.
