---
id: OBX-029
title: Audit and close generated-site mutation write-arounds
status: ready
priority: P0
epic: Editing
depends_on: []
requirements: [REQ-EDT-001, REQ-SEC-001]
evals: [EVAL-SEC-001]
---

## Problem

Candidate safety cannot hold if any current content, token, asset, layout, link, or
motion endpoint writes around the existing guarded site authority.

## Delivery

Inventory every generated-site writer on the source checkpoint, route any write-around
through `runGuardedMutation`, and record the complete mutation surface. This ticket is
independent of the later capability-routing optimization.

## Acceptance

- A checked-in inventory names every endpoint/module that writes generated-site state.
- Static and runtime instrumentation find no production write outside the guarded
  authority or the candidate compiler/promotion path.
- Snapshot sets include every file each current mutation can change.
- Existing local API, origin, rollback, and approval-invalidation tests remain green.
- New Page IR mutation integration remains assigned to OBX-031.

## Non-goals

Implementing Page IR edits or the capability-to-gate matrix.
