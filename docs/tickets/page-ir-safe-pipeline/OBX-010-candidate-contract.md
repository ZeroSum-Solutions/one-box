---
id: OBX-010
title: Define the candidate lifecycle and manifest contract
status: ready
priority: P0
epic: Candidate
depends_on: []
requirements: [REQ-BLD-001, REQ-BLD-007, REQ-OPS-001, REQ-SEC-002, REQ-SEC-004]
evals: [EVAL-CAND-001, EVAL-CAND-005, EVAL-OPS-001, EVAL-SEC-002]
---

## Problem

`.building` is a staging implementation detail, not a versioned state contract with
provenance, valid transitions, bounds, or recovery semantics.

## Delivery

Define candidate state and manifest schemas in `src/lib/contracts.ts`, safe run-scoped
paths, transitions, inventory/hash validation, and one-per-run, 100 MiB, 24-hour
diagnostic retention.

## Acceptance

- Candidate states and legal transitions are closed and unit-tested.
- Deterministic manifest accepts regular allow-listed files only and validates size and
  SHA-256; timestamps and operator events live in a separate provenance envelope.
- Traversal, absolute paths, symlinks, missing, duplicate, and unexpected files fail.
- Provenance binds candidate to input artifacts, compiler/layout authority, and the
  candidate-scoped gate report.
- Candidate path cannot be served through the site route.
- Failed diagnostics retain at most one candidate per run, 100 MiB, for 24 hours.

## Non-goals

Changing compiler output or performing promotion.
