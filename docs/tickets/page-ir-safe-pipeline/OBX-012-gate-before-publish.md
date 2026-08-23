---
id: OBX-012
title: Move initial build and rebuild behind gate-before-publish
status: verified
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

## Fix Round 1

Durable `run.json` authorization now uses the stable no-follow, nonlinked
regular-file reader and must bind its persisted ID to the requested run before
candidate output. Pipeline replay suppresses stale evidence-gated completion,
not only legacy completion, whenever an unserved promotable candidate exists.
A mechanical import guard keeps the test-only live publication helper out of
production app and pipeline modules.

## Fix Round 2

Promotable candidates are parked before pause, configuration, cost-cap, or
pipeline execution. Reconnect replays only nonterminal history plus current
cost; it neither appends an error nor resumes work. A built stage now accepts
only an exact present `promotable` candidate, and `stageBuild` independently
requires the durable gate disposition to be `promotable` before it can finish.
Missing, `failed`, or `ready-for-gates` post-build state fails closed before
legacy completion or evidence visual QA. Unproven completion is no longer
synthesized from stage or stale visual-QA state; a recorded historical live
completion remains replayable only when no candidate exists.

The standalone live-publishing fixture requires
`ONEBOX_TEST_FIXTURE_PUBLISH=1` in addition to a non-production runtime. Only
intentional smoke, canvas, and unit-test consumers set it. The import boundary
now scans every non-test/spec TypeScript source under `src/`, including
components, middleware, and library modules. If fixture publication and
restoration both fail, both errors are reported and the retired snapshot is
left intact for diagnosis/recovery.
