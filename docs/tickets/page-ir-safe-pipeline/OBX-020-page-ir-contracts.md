---
id: OBX-020
title: Add closed Reference, Layout, and Page IR v1 contracts
status: ready
priority: P0
epic: Page IR
depends_on: [OBX-001]
requirements: [REQ-IR-001, REQ-IR-002, REQ-IR-003, REQ-IR-004]
evals: [EVAL-IR-001, EVAL-IR-002, EVAL-IR-003]
---

## Problem

No production Page IR exists in `src/lib/contracts.ts`; layout is encoded in a frozen
template and model-generated section choices. A docs-only shape would create another
unvalidated authority.

## Delivery

Define `ReferenceContractV1`, `LayoutProgramV1`, and `PageIRV1` as closed versioned Zod
contracts with bounded nodes, typed references, safe actions, responsive intent,
accessibility metadata, and cross-field validation.

## Acceptance

- Valid fixtures cover all Phase 1 node and reference kinds.
- Unknown fields/kinds/versions and oversized structures fail.
- Executable source, event handlers, arbitrary paths, unsafe URLs, and unbounded data
  fail closed.
- Duplicate IDs, dangling references, invalid nesting, missing landmarks, and cycles
  fail with bounded actionable errors.
- No parallel runtime schema is created outside `src/lib/contracts.ts`.

## Non-goals

An open plugin schema, arbitrary React components, or non-website targets.
