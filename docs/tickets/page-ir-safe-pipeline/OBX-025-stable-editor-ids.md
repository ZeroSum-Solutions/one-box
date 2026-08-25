---
id: OBX-025
title: Guarantee stable editor IDs and source provenance
status: ready
priority: P1
epic: Page IR
depends_on: [OBX-022]
requirements: [REQ-IR-007, REQ-OPS-001]
evals: [EVAL-COMP-002, EVAL-OPS-001]
---

## Problem

Editor targeting, history, and repair become fragile when identity depends on DOM
position, selector shape, or a model's generated text.

## Delivery

Define deterministic Page IR-derived editor identity, emit it for every editable
element, and retain a source mapping in build provenance.

## Acceptance

- Every editable corpus element has exactly one unique ID at all viewports.
- IDs are stable across ten compiles and unaffected by unrelated sibling content.
- The compiler rejects duplicate or unsafe IDs before writing a candidate.
- Source mapping identifies Page IR node and approved input lineage.
- Existing selection parent/child navigation remains functional.

## Non-goals

Changing the editor's visual design.
