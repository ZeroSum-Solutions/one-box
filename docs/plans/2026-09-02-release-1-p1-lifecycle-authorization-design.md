# Release 1 P1 — closed lifecycle authorization packet

- Proposal id: `OBX-AUTH-R1-P1-PROPOSAL-V1`
- Authorization record: `OBX-AUTH-R1-P1-SOLO-001` in
  `docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json`
- Amendment: `docs/governance/risk-exceptions/2026-09-02-release-1-p1-solo.json`
- Parent ticket: `OBX-P200` (stays `proposed`; this packet moves no ticket status)
- Predecessor: none. `predecessorBinding` and `activationPrecondition` are `null`,
  so P1 work starts when the governance change merges.
- Recorded window: 336 hours, `2026-09-02T13:00:00Z` to `2026-09-16T13:00:00Z`,
  non-renewable. The record's `effectiveWindow` also states the earlier effective
  end, `2026-09-14T13:33:33Z`, because the phase module fails closed once
  `OBX-AUTH-P180-T01-SOLO-001` expires.
- Status: planning packet. This document authorizes nothing on its own. Only the
  registry record authorizes code, and only inside the exact paths and effects below.

## 1. Scope

P1 builds the closed website lifecycle for Release 1: the state and event contracts,
the pure transition function, the optional persisted lifecycle record under the
existing run transaction, the promotion binding between a Page IR build and the
`canvas_ready` state, and a read-only loopback projection with a read-only Canvas
status. Source direction: `docs/superpowers/plans/2026-08-27-release-lifecycle-foundation.md`
tasks 1 to 6, `docs/plans/one-box-master/01-foundation/release-1-contract.md`
sections 3.1 to 3.3, and `docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md`
section 6.

Out of scope, and forbidden by the record: any mutation path (that is P2), any client
review surface (P3), any qualification gate (P4), any dependency change, any new
network or provider call, any endpoint outside the existing `isLocalApiAuthorized`
guard, and any control that mints an approval, client lock, qualification, or release.

## 2. Child ticket ledger

| Child ticket | Work package | Effects | Exact paths |
|---|---|---|---|
| `OBX-P200-T01` | Contracts and pure transitions | `add-closed-lifecycle-contracts-and-pure-transitions` | `src/lib/contracts.ts`, `src/lib/contracts.test.ts`, `src/lib/releaseLifecycle.ts`, `src/lib/releaseLifecycle.test.ts` |
| `OBX-P200-T02` | Persistence and controller binding | `persist-optional-lifecycle-record-under-withRunTransaction`, `bind-promoted-page-ir-build-to-canvas-ready` | `src/lib/runstate.ts`, `src/lib/runstate.test.ts`, `src/lib/releaseLifecycleStore.ts`, `src/lib/releaseLifecycleStore.test.ts`, `src/lib/pageIrController.ts`, `src/lib/pageIrController.test.ts`, `src/lib/pipelineReplay.test.ts` |
| `OBX-P200-T03` | Read-only projection and Canvas status | `add-loopback-read-only-lifecycle-projection-route`, `add-read-only-canvas-lifecycle-status`, `document-lifecycle-module-ownership` | `src/app/api/lifecycle/[id]/route.ts`, `src/app/api/lifecycle/[id]/route.test.ts`, `src/components/preview/LifecycleStatus.tsx`, `src/components/preview/LifecycleStatus.test.tsx`, `src/app/preview/[id]/page.tsx`, `scripts/e2e/preview-workbench.mjs`, `docs/architecture/README.md`, `docs/security/local-api-threat-model.md` |

The union of those three path lists is the record's `allowedPaths`. Every unlisted
path and every unlisted effect is denied; the record's `forbiddenEffects` floor is
the common Release 1 floor and applies to all three tickets.

Child tickets are not added to `docs/tickets/one-box-program/manifest.json` in this
wave. `OBX-P200` cannot become `ready` while no OwnerAssignmentV1 record exists, so
the ledger above is the sequencing authority, exactly as the OBX-P180 Step 6
precedent does.

## 3. Data classes

`public`, `project-internal`, `synthetic-fixture`. No credential, no personal data,
no client-supplied secret enters any P1 artifact or test fixture.

## 4. Invariants the work must prove

1. Release 1 contract section 7 items 1 to 5: one layout authority per run,
   content-addressed candidate identity, no approval inherited by similarity, a
   rejected mutation leaves state unchanged, a stale revision produces no write.
2. Contract section 3.3: the P1 output state is `canvas_ready`.
3. Design section 6: the lifecycle state set is closed; no state is invented at a
   call site.
4. No clock and no randomness inside the pure transition function.
5. Threat model TM-03: atomic transitions fail closed on ambiguity and preserve the
   last known-good record.
6. Legacy run-state fixtures parse without a rewrite, byte-identical on disk.
7. Replay is idempotent; every write stays inside the existing lock order and the
   existing `withRunTransaction` boundary.
8. The projection route reuses `isLocalApiAuthorized` unchanged and exposes no
   history, no receipt body, and no actor identity.
9. Models, clients, API payloads, and UI components cannot mint an approval, a
   release, or a deployment state.

## 5. Test oracles

- `npm test` (Vitest) for every `.test.ts` and `.test.tsx` path above, including a
  concurrency case and an injected save failure for the store.
- `npm run test:e2e:full-unit` (`scripts/e2e/full-run-state.node.mjs`) for run-state
  persistence.
- `npm run test:e2e:preview` inside `npm run test:e2e:page-ir` for the Canvas status.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- `GITHUB_ACTIONS=true npm run verify:plans` and `GITHUB_ACTIONS=true npm run test:plans`.
- The `security-review` skill on `src/app/api/lifecycle/[id]/route.ts`.

Deterministic tests are the authority. The model review is advisory only.

## 6. Grok 4.6 packet list

Reviewer lane: `x-ai/grok-4.6` through OpenRouter at effort `high`, run with
`scripts/eval/grok-audit.mjs`. Two packets per work package, both required:

1. Ticket-readiness packet before the first commit: this document, the record, the
   amendment, and the exact path list for that work package.
2. Final-diff packet before merge: the complete work-package diff plus the proof
   output of every oracle in section 5.

An exact-model failure may fall back only under an owner-authorized fallback block
that retains the failed attempt and names the actual model. A Critical or Important
model finding is fixed and the audit rerun before merge.
