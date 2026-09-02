# Appointment Acquisition v1 PRD restart handoff

- **Date:** 2026-08-27
- **Branch:** `research/la-appointment-field-study`
- **Worktree:** `/Users/zero-suminc./projects/one-box-worktrees/la-appointment-field-study`
- **PRD:** `docs/specs/2026-08-27-appointment-acquisition-v1-prd.md`
- **Status:** eight v7 findings corrected; exact Grok 4.6 correction re-audit v2 is `CLEAN`; implementation remains unauthorized

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

## 2026-08-29 correction closure

The resumed session preserved exact Grok 4.6 audit artifacts v2 through v7 under `docs/audits/grok-4.6/`. The bounded v7 audit reviewed PRD SHA-256 `16b2aa5d485b5ebe53d75863835512790c9ea9ca511249064a32aab5455d4606` and returned eight P1 findings concentrated in the post-launch monitoring and pointer contract:

1. name both allowed cross-scope facts in the isolation rule;
2. use one exact SafetyBlock actor name;
3. assign transient second-failure and deadline writes to an authorized RuntimeDownshift actor;
4. make reachability blips disjoint from immediate non-blip unreachability;
5. close `OperationallyAvailable` behavior during `open_degraded`;
6. align the Section 13.1 monitor allowlist with all decisive observations;
7. use a status-only route-option probe that cannot mint a lease;
8. extend qualification coverage to every post-launch transaction and observation-family row.

All eight were corrected in the current PRD. The first completed exact
`x-ai/grok-4.6` correction audit found one remaining MEDIUM state-machine hole:
a late `TransientFailure` at or after deadline could miss both table guards and
produce no write. The table was made total for every failure at or after
`earliestSecondAt`; the non-blip set and status-only response schema were also
closed. Exact Grok re-audit v2 returned `CLEAN` with zero findings.

Current PRD SHA-256:
`3c4aca6207174dbbb69be059a5963d9e42b2d29da89450f5f9a0ed9348754e2d`.

Current receipts:

1. `docs/audits/grok-4.6/2026-08-29-appointment-acquisition-v1-corrections-audit.json`
2. `docs/audits/grok-4.6/2026-08-29-appointment-acquisition-v1-corrections-reaudit-v2.json`

The next legitimate steps are independent PRD verification, a non-amended
checkpoint commit, owner review of the exact committed PRD, and only then a
separately authorized implementation plan. No implementation, deployment, or
public acquisition change is authorized by this closure.

No implementation, implementation plan, deployment, or public acquisition change is authorized by this checkpoint.
