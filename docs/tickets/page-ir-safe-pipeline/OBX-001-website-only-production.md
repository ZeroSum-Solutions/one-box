---
id: OBX-001
title: Enforce Website-only production intake
status: ready
priority: P0
epic: Scope
depends_on: []
requirements: [REQ-SCP-001, REQ-SCP-002, REQ-SCP-004, REQ-SEC-001]
evals: [EVAL-SCOPE-001, EVAL-SCOPE-002, EVAL-SEC-001]
---

## Problem

The UI describes Website, Web app, and iOS, while the builder produces one frozen
website structure with superficial wrappers. Phase 1 supports Website only.

## Delivery

Remove non-website choices from production intake and enforce the same rule at every
server boundary that creates, starts, retries, or rebuilds a run. Keep strict local API
authorization unchanged.

## Acceptance

- UI and accessibility tree expose Website as the only production target.
- Forged `web-app` and `ios-app` requests fail before run/build artifacts are created.
- Persisted new Phase 1 runs record Website.
- Product text makes no production Web app or iOS claim.
- Existing local API hostile-origin tests still pass.

## Non-goals

Deleting legacy records or implementing a new target.
