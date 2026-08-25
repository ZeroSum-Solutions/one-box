---
id: OBX-023
title: Enforce one immutable layout authority and explicit fallback
status: ready
priority: P0
epic: Page IR
depends_on: [OBX-021, OBX-022]
requirements: [REQ-LAY-001, REQ-LAY-002, REQ-LAY-003, REQ-LAY-004, REQ-LAY-005]
evals: [EVAL-LAY-001, EVAL-LAY-002]
---

## Problem

Adding Page IR beside the frozen template can create two competing sources of
structure, non-reproducible fallback, or retries that silently change output engines.

## Delivery

Persist one authority at run creation and route compilation through it. Implement
template fallback by creating a separate linked run with a closed reason; never mutate
the original run's authority.

## Acceptance

- New and existing run defaults follow the PRD rollout policy.
- Authority cannot change on reconnect, resume, retry, edit, or promotion.
- No output combines Page IR and template section/layout structure.
- A template fallback has a new run ID, `template-v1` authority, link to the failed Page
  IR run, bounded reason, and visible originating failure.
- The failed Page IR run remains failed and immutable; resume/retry cannot cross the
  authority boundary.

## Non-goals

Automatic “best renderer” selection or blending component libraries.
