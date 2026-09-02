# Release 1 P2 — Canvas candidate and approval authorization packet

- Proposal id: `OBX-AUTH-R1-P2-PROPOSAL-V1`
- Authorization record: `OBX-AUTH-R1-P2-SOLO-001` in
  `docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json`
- Amendment: `docs/governance/risk-exceptions/2026-09-02-release-1-p2-solo.json`
- Parent ticket: `OBX-P210` (stays `proposed`; this packet moves no ticket status)
- Predecessor: `OBX-P200` under `OBX-AUTH-R1-P1-SOLO-001`. P2 code may not start
  until P1 merges. The record's `predecessorBinding` stays
  `PENDING_PREDECESSOR_MERGE` and names P1's exact file list, and while that status
  holds the record carries `implementationAuthorized: false`. The phase module
  enforces both directions: a pending predecessor may not authorize implementation,
  and a `COMPLETED_VERIFIED` predecessor must name a 40-character checkpoint commit
  with live SHA-256 bindings of P1's merged files. P2 therefore becomes an
  implementation authorization only when a later governance change re-issues this
  record against the P1 merge commit.
- Status: planning packet. It authorizes nothing on its own, and the P2 record
  authorizes no code until the predecessor gate closes.

## 1. Scope

P2 binds Canvas mutation to the P1 lifecycle: every applied design mutation emits a
lifecycle event with a presentational flag, computes visual and interaction
fingerprints, invalidates any prior client, visual, qualification, or release
decision, binds a named-human visual decision to a candidate hash through
`CanvasVisualReviewReceiptV1`, and shows the current approval state read-only in the
Canvas. Source direction: `docs/superpowers/plans/2026-08-27-canvas-to-agency-shipping-roadmap.md`
P2, `docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md`
sections 6.1, 8.1 and 8.2, and `release-1-contract.md` section 3.4.

Out of scope, and forbidden by the record: any `PageIRV1` or generated-site schema
change, any client-review surface, any qualification gate, any collaboration or CRDT
work, any motion authoring, any dependency change, and any control that mints an
approval, client lock, qualification, or release.

## 2. Child ticket ledger

| Child ticket | Work package | Effects | Exact paths |
|---|---|---|---|
| `OBX-P210-T00` | Fingerprint and lock-order design note | none | `docs/plans/2026-09-02-release-1-p2-fingerprint-and-lock-order-design.md` |
| `OBX-P210-T01` | Mutation to lifecycle and approval invalidation | `emit-design-mutation-accepted-with-presentational-flag`, `compute-visual-and-interaction-fingerprints` | `src/lib/pageIrMutation.ts`, `src/lib/pageIrMutation.test.ts`, `src/lib/siteMutation.ts`, `src/lib/siteMutation.test.ts`, `src/lib/elementEditor.ts`, `src/lib/elementEditor.test.ts`, `src/lib/mutationGateMatrix.ts`, `src/lib/mutationGateMatrix.test.ts`, `src/lib/releaseLifecycleStore.ts`, `src/lib/releaseLifecycleStore.test.ts`, `src/lib/contracts.ts`, `src/lib/contracts.test.ts` |
| `OBX-P210-T02` | Promotion binding and visual-review receipt | `bind-named-human-visual-decision-to-candidate-hash`, `template-v1-promotion-lifecycle-binding` | `src/lib/pageIrController.ts`, `src/lib/pageIrController.test.ts`, `src/lib/candidatePromotion.ts`, `src/lib/candidatePromotion.test.ts`, `src/lib/pipelineStaleVisualQa.test.ts`, `src/lib/contracts.ts`, `src/lib/contracts.test.ts` |
| `OBX-P210-T03` | Canvas approval-state projection | `show-current-approval-state-read-only` | `src/components/preview/LifecycleStatus.tsx`, `src/components/preview/LifecycleStatus.test.tsx`, `src/components/preview/Workbench.tsx`, `src/app/styles/workbench.css`, `scripts/e2e/preview-workbench.mjs`, `scripts/e2e/canvas-contract.mjs` |

The deduplicated union of those four path lists is the record's `allowedPaths`. The
contracts change is the fingerprint record and `CanvasVisualReviewReceiptV1` bound to
the existing `VisualQaSchema` only; `PageIRV1` does not change in P2.

Child tickets are not added to `docs/tickets/one-box-program/manifest.json` in this
wave, for the same reason as P1.

## 3. Data classes

`public`, `project-internal`, `synthetic-fixture`.

## 4. Invariants the work must prove

1. Design section 6.1: a visible change invalidates the client lock; a
   non-presentational repair preserves the lock only when both fingerprints are
   identical.
2. Contract section 3.4: every applied change names the expected source and candidate
   revision, produces a new candidate identity, reruns the capability-aware gate set,
   and invalidates any prior client, visual, qualification, or release decision.
3. Threat model TM-04: Page IR stays the source; the preview DOM is a projection.
4. Contract section 3.4 output: a designer-accepted candidate plus a
   `CanvasVisualReviewReceiptV1` carrying `approve`, `revise`, or `blocked`.
5. Stop rule: a `revise` or `blocked` visual decision preserves the last accepted
   candidate and cannot open client review.
6. `PROG-EVAL-CANVAS-001`: mechanical evidence cannot substitute for visual approval.
   The named non-author designer stays `NOT_AVAILABLE`; that blocks the evaluation
   PASS, not the code start.
7. One layout authority per run.
8. The Canvas projection is read-only. No control in it mints an approval.

## 5. Test oracles

- `npm test` (Vitest), including an injected failure at every mutation boundary.
- `npm run test:smoke` (`scripts/smoke/gates-smoke.mjs`).
- `npm run test:e2e:preview` and `npm run test:e2e:canvas-contract` (accessibility
  evidence through the existing harness; no new `@axe-core/playwright` call site,
  because `SC-NPM-003` sets `codeUseAllowed: false`).
- `npm run typecheck`, `npm run lint`, `npm run build`.
- `GITHUB_ACTIONS=true npm run verify:plans` and `GITHUB_ACTIONS=true npm run test:plans`.

Deterministic tests are the authority. The model review is advisory only.

## 6. Grok 4.6 packet list

Reviewer lane: `x-ai/grok-4.6` through OpenRouter at effort `high`, run with
`scripts/eval/grok-audit.mjs`. Two packets per work package:

1. Ticket-readiness packet before the first commit: this document, the record, the
   amendment, the P1 merge evidence, and the exact path list for that work package.
2. Final-diff packet before merge: the complete work-package diff plus the proof
   output of every oracle in section 5.

An exact-model failure may fall back only under an owner-authorized fallback block
that retains the failed attempt and names the actual model. A Critical or Important
model finding is fixed and the audit rerun before merge.
