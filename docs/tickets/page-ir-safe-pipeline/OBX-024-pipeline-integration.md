---
id: OBX-024
title: Integrate Page IR checkpoints into the resumable pipeline
status: ready
priority: P0
epic: Pipeline
depends_on: [OBX-013, OBX-014, OBX-023]
requirements: [REQ-IR-005, REQ-BLD-001, REQ-OPS-002, REQ-OPS-003]
evals: [EVAL-REPLAY-001, EVAL-REPLAY-002]
---

## Problem

Page IR, compilation, candidate gates, repair, and promotion must join the durable
state machine without re-buying completed model work or skipping human gates.

## Delivery

Add explicit hashed checkpoints and events to the current pipeline; resume from the
last valid boundary and call promotion only after candidate gates pass.

## Acceptance

- Disconnect/reconnect at every new boundary resumes without duplicate completed
  model calls.
- Hash mismatch invalidates only dependent downstream checkpoints.
- Rebuild and resume compile the latest validated persisted Page IR, including accepted
  edits. Re-deriving Page IR from upstream evidence requires an explicit new run and
  cannot overwrite an edited run.
- Human evidence approvals remain prerequisites and are never synthesized.
- Retry allowance lifecycle survives process interruption.
- Event replay describes Page IR derivation, candidate, repair, gates, and promotion
  without claiming success early.

## Non-goals

Replacing the pipeline controller with an agent framework.
