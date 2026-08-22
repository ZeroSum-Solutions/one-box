---
id: OBX-022
title: Compile Page IR deterministically to a static website
status: ready
priority: P0
epic: Page IR
depends_on: [OBX-020]
requirements: [REQ-IR-002, REQ-IR-006, REQ-IR-007, REQ-BLD-001, REQ-SEC-003]
evals: [EVAL-COMP-001, EVAL-WEB-001]
---

## Problem

Production output needs a renderer whose result can be replayed and verified. Direct
model-authored source cannot guarantee byte determinism or a closed capability set.

## Delivery

Implement a pure compiler from validated Page IR and allow-listed assets to a static
candidate inventory. Separate deterministic output from timestamped provenance.

## Acceptance

- Ten clean compiles per fixture have identical file inventories and hashes.
- Compiler performs no provider/network calls and consumes no credential.
- Output contains no unvalidated executable source from Page IR or research.
- Core navigation, content, and primary action work without JavaScript.
- Compiler returns a candidate; it cannot publish.

## Non-goals

A general React renderer, arbitrary component loading, or visual approval.
