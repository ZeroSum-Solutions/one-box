---
id: OBX-015
title: Recover safely from crashes and concurrent writers
status: ready
priority: P0
epic: Candidate
depends_on: [OBX-013, OBX-014]
requirements: [REQ-BLD-006, REQ-BLD-008, REQ-EDT-001]
evals: [EVAL-CAND-006, EVAL-CAND-007]
---

## Problem

Crashes can leave candidates or retired directories behind, and separate build/edit
operations can race unless they share one filesystem authority.

## Delivery

Define startup/resume recovery for every lifecycle state and prove build, promotion,
edit, token, asset, and motion operations serialize through the same lock order.

## Acceptance

- Fault injection covers every candidate transition and promotion rename boundary.
- Recovery never deletes the last-known-good site or promotes an ungated candidate.
- Stale candidates are resumed only when hashes and state permit; otherwise abandoned
  with an observable reason.
- Concurrent operation tests show no lost update, mixed manifest, or deadlock.
- Mutations cannot interleave with promotion, and readers never observe a site paired
  with a gate report from another generation.
- Lock ordering is documented in architecture guidance.

## Non-goals

Distributed locks or multi-user conflict resolution.
