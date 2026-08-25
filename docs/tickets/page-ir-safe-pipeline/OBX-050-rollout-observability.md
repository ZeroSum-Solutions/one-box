---
id: OBX-050
title: Add Page IR rollout controls and candidate observability
status: ready
priority: P0
epic: Rollout
depends_on: [OBX-024, OBX-025, OBX-031, OBX-040]
requirements: [REQ-OPS-001, REQ-OPS-004, REQ-OPS-005]
evals: [EVAL-OPS-001, EVAL-OPS-002, EVAL-OPS-003]
---

## Problem

Operators need to know which authority built a site, what failed, and how to stop new
Page IR runs without mutating existing run history.

## Delivery

Add a default-off new-run flag, safe template kill switch, structured lifecycle events,
and UI states for candidate, repair, gate, promotion, and recovery outcomes.

## Acceptance

- Flag changes affect future runs only; existing run authority is immutable.
- Kill switch selects `template-v1` for new runs without deleting Page IR artifacts or
  changing existing run authority.
- UI and events distinguish all five failure classes with actionable next steps.
- Provenance links inputs, Page IR, compiler, candidate, gates, promotion, and review.
- No event reports a site live before promotion completes.
- A requested template fallback creates a separate linked run and preserves the failed
  Page IR run and reason.

## Non-goals

Remote telemetry SaaS, automatic rollout, or silent fallback.
