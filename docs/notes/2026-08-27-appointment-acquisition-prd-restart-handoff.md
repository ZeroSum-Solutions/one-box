# Appointment Acquisition v1 PRD restart handoff

- **Date:** 2026-08-27
- **Branch:** `research/la-appointment-field-study`
- **Worktree:** `/Users/zero-suminc./projects/one-box-worktrees/la-appointment-field-study`
- **PRD:** `docs/specs/2026-08-27-appointment-acquisition-v1-prd.md`
- **Status:** checkpoint only; final audit and verification remain incomplete

## Completed before restart

- The owner approved all six architecture sections.
- Every individual section received an exact `x-ai/grok-4.6` adversarial review and reached `ACCEPT` with no remaining findings.
- The six sections were assembled into the project PRD.
- Placeholder and whitespace scans were clean before the cross-section review.
- The exact assembled file received a fresh `x-ai/grok-4.6` cross-section audit.

## Cross-section audit result

The first full-file audit returned `REVISE` with `implementation_authorization: NOT_AUTHORIZED`.

Findings:

1. `CS-001`: request mode did not explicitly require both scheduling payload and public staff follow-up evidence.
2. `CS-002`: classifier inputs, candidate-mode projection, eligibility, and fallback behavior were not one total contract.
3. `CS-003`: ProjectId was missing from the classification and publication boundary.
4. `CS-004`: visitorKind and missing-route-dimension behavior lacked closed rules.
5. `CS-005`: pack category, promise class, and handoff mode lacked a total mapping.
6. `CS-006`: exact public display strings were not bound into the approved bundle hash.
7. `CS-007`: lower-layer authority wording conflicted with required blocking, and business configuration lacked a closed schema.
8. `CS-008`: runtime validity, episode closure, counters, clock, and lease-margin rules had cross-section ambiguity.
9. `CS-009`: manual-invalidation hosting conflicted with automatic-protection goals and warning horizons.
10. `CS-010`: analytics and operator surfaces did not explicitly prohibit route and project values.
11. `CS-011`: live recapture did not distinguish hash-identical refresh from material change.
12. `CS-012`: rollout wording could be read as implementation authorization.
13. `CS-013`: R3 and R4 thirty-day windows were ambiguous.
14. `CS-014`: human safety corrections were incorrectly treated as quality misses, and review time lacked a defined site class.
15. `CS-015`: project deletion and later publication authority conflicted.

## Corrections already applied

- Added `AcquisitionScope = (ProjectId, RouteKey)` and cross-project isolation.
- Added closed visitorKind and route-dimension rules.
- Added closed observation classes and the two-fact request legality requirement.
- Replaced the classifier with a candidate-mode and candidate-target sealed invocation plus an explicit eligibility predicate and total decision order.
- Added the closed pack-category to promise and handoff mapping.
- Bound a versioned exact copy dictionary into the approval bundle.
- Added a closed verified-business-config schema.
- Clarified publication workflow versus runtime state, runtime attestation validity, episode closure, counter meanings, one control-plane clock, and lease-skew direction.
- Restricted manual-invalidation hosting from automatic-protection qualification.
- Tightened analytics, dashboard, and summary privacy.
- Split hash-identical recapture from material semantic change.
- Clarified post-authorization rollout, R4 timing, diagnostic proposal calibration, and diagnostic review time.
- Made project deletion terminal for its ProjectId.

## Required continuation

1. Re-read the current PRD and confirm every `CS-001` through `CS-015` correction is complete and internally consistent.
2. Run `git diff --check` and placeholder/ambiguity scans.
3. Run a second exact `x-ai/grok-4.6` cross-section audit against the full current PRD.
4. If the result is `REVISE`, preserve the findings, correct the document, and rerun until no P0/P1 remains.
5. Save the final audit evidence under `docs/audits/grok-4.6/`.
6. Perform the PRD self-review for placeholders, contradictions, ambiguity, and scope.
7. Run an independent verifier against the written PRD and its approved architecture.
8. Commit final corrections and audit evidence in a new commit. Do not amend this checkpoint.
9. Ask the owner to review the committed PRD before creating an implementation plan.

No implementation, implementation plan, deployment, or public acquisition change is authorized by this checkpoint.
