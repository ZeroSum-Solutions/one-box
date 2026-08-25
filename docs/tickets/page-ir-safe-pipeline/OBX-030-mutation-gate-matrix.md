---
id: OBX-030
title: Define capability-aware after-edit gate routing
status: ready
priority: P0
epic: Editing
depends_on: [OBX-020]
requirements: [REQ-EDT-002, REQ-EDT-003, REQ-EDT-004]
evals: [EVAL-EDIT-001]
---

## Problem

After-edit gates are currently one fixed subset. Content, token, asset, structure,
link, and motion changes affect different invariants, while a weak classifier can
silently skip a required check.

## Delivery

Add closed mutation capabilities and a versioned capability-to-gate matrix. Run the
full suite for mixed, unknown, or uncertain changes.

## Acceptance

- Matrix covers every mutation endpoint and every registered blocking gate.
- Each route has a seeded defect that its selected gate set catches.
- Unknown/mixed classification mechanically selects the full suite.
- No model classification can reduce the deterministic minimum gate set.
- Matrix changes require a version bump and test updates.

## Non-goals

Weakening gates or optimizing initial candidate checks.
