---
id: OBX-011
title: Run the full gate suite against an explicit candidate root
status: ready
priority: P0
epic: Candidate
depends_on: [OBX-010]
requirements: [REQ-BLD-002]
evals: [EVAL-CAND-001]
---

## Problem

`runGates()` currently resolves the live site directory from a run ID. A candidate
cannot be safely evaluated without either serving it or teaching gates an explicit,
validated target.

## Delivery

Add a private gate target abstraction for validated run-owned site roots. Preserve the
public run-ID path and all current gate behavior.

## Acceptance

- Full gate suite evaluates a candidate without copying or renaming it to `site/`.
- The target must be a validated directory inside the current run and cannot be a
  symlink.
- Gate reports identify the candidate manifest/build hash they evaluated.
- Candidate evaluation writes a candidate-scoped report and cannot replace the live
  site's `gates.json`.
- Existing live-site, smoke, and after-edit tests remain green.

## Non-goals

Changing thresholds, removing gates, or accepting arbitrary filesystem paths.
