---
id: OBX-012
title: Move initial build and rebuild behind gate-before-publish
status: ready
priority: P0
epic: Candidate
depends_on: [OBX-010, OBX-011]
requirements: [REQ-BLD-001, REQ-BLD-002, REQ-BLD-003]
evals: [EVAL-CAND-001, EVAL-CAND-002]
---

## Problem

`buildSite()` currently swaps the staged build into `site/` before the pipeline runs
blocking gates. A failing candidate can therefore become the served site.

## Delivery

Separate compile/candidate creation from publication. Initial build and rebuild call
full gates on the unserved candidate and make no live mutation on failure.

## Acceptance

- `buildSite` or its replacement cannot publish as a side effect of compilation.
- A seeded first-build gate failure leaves no served site.
- A seeded rebuild failure leaves prior live inventory and canonical live gate-report
  path, bytes, and hashes unchanged; only the candidate-scoped report may change.
- Success exposes a promotable candidate; it does not bypass OBX-014.
- Production compilation fails closed when durable run authorization is absent.
  Existing standalone builder fixtures receive an explicit test-only compile/publish
  path that is not reachable from production routes.

## Non-goals

Page IR compilation or automated repair.
