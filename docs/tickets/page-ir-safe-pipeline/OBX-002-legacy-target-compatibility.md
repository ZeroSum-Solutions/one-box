---
id: OBX-002
title: Quarantine legacy non-website runs without data loss
status: verified
priority: P1
epic: Scope
depends_on: [OBX-001]
requirements: [REQ-SCP-003, REQ-IR-008]
evals: [EVAL-SCOPE-003]
---

## Problem

Older persisted records may contain `web-app` or `ios-app`. Treating them as Page IR
would silently change meaning; rejecting all reads would strand user data.

## Delivery

Add an explicit compatibility path that loads and exports those records, labels them
legacy/experimental, and blocks generation or rebuild under Phase 1.

## Acceptance

- Existing fixtures load without schema erasure, silent target coercion, or silent
  Page IR reinterpretation.
- Preview/export remains available when underlying artifacts are valid.
- Start, resume/continue, retry, rebuild, repair, edit, asset generation/placement, and
  authority migration fail with an actionable message.
- No legacy record is rewritten merely by being viewed.

## Non-goals

Guaranteeing correctness of prior wrapper output or migrating it to Page IR.
