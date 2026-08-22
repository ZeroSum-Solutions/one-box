---
id: OBX-051
title: Run production qualification and record the owner decision
status: ready
priority: P0
epic: Rollout
depends_on: [OBX-015, OBX-041, OBX-042, OBX-050]
requirements: [REQ-OPS-006]
evals: [EVAL-QUAL-001, EVAL-QUAL-002, EVAL-QUAL-003, EVAL-OPS-004]
---

## Problem

Passing unit tests does not prove product-quality output or authorize Page IR as the
default production authority.

## Delivery

Freeze the approved manifest, run the full qualification corpus, collect deterministic
and rendered evidence, resolve P0s, obtain named human review, and record the owner's
default-on/opt-in/reject decision.

## Acceptance

- Frozen manifest hash and source commit are recorded.
- Every blocking eval passes; BLOCKED and NOT_RUN cannot be counted as pass.
- Six complete qualification packets and named human reviews validate.
- No open P0 or unresolved critical/high security finding remains.
- Owner decision and rationale are recorded without rewriting historical results.
- Default-on occurs only after explicit approval; otherwise Page IR remains opt-in or
  disabled.

## Non-goals

Allowing a model reviewer to approve production or creating GitHub issues without
separate authorization.
