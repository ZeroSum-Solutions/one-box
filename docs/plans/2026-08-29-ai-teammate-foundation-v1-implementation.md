# AI teammate foundation v1 implementation plan

- **Status:** owner-approved execution plan for `OBX-AT-001`
- **Date:** 2026-08-29
- **Specification:** [AI teammate foundation v1](../specs/2026-08-29-ai-teammate-foundation-v1.md)
- **Authorization:** [OBX-AUTH-ATF-001](one-box-master/00-authority/scoped-implementation-authorizations.json)

## Scope rule

Implement only the static registry, read/propose contracts, deterministic local
executor and receipts, and minimal local Canvas/API surface. Keep the full
operating-environment domain and `OBX-P180`/`OBX-P310` planning-only. Do not add a
runtime dependency or connect a provider.

## Test-first sequence

1. Add contract/registry tests for the exact eight-role roster, closed schemas,
   immutable results, explicit empty grants, allowed data classes, and fail-closed
   effect validation; then add the minimum contracts and registry.
2. Add executor/receipt tests for every terminal state, hash binding, byte/time
   budgets, cancellation, schema rejection, and no automatic application; then
   add the deterministic in-memory executor.
3. Add route/component tests for the local roster, bounded assignment preview,
   textual receipt state, keyboard/accessibility behavior, origin/auth reuse, and
   accurate `Local foundation` labeling; then add the smallest API/Canvas surface.
4. Update the canonical [architecture map](../architecture/README.md) and
   [local API threat model](../security/local-api-threat-model.md) only for
   behavior that is verified. Use the exact [Canvas contract
   harness](../../scripts/e2e/canvas-contract.mjs), [Canvas coverage
   harness](../../scripts/e2e/canvas-coverage.mjs), and [preview workbench
   harness](../../scripts/e2e/preview-workbench.mjs) as verification-only path
   scope: they may verify this bounded slice but do not authorize production
   runtime or effect expansion. Run the full gates, complete security review,
   exact Grok 4.6 audits for each task and the immutable final target, and
   independent verification.

Each implementation task follows red, green, focused review, and exact-target
evidence. A failed gate stops the slice. No task may widen the authorized paths,
effects, dependencies, data classes, or external-state boundary.

## Rollback

The slice has no migration or durable runtime state. Revert the ticket's code and
UI/API integration files together. Static receipts created only in process are
discarded. Existing Page IR, site, candidate, review, and release state remains
untouched.

## Ticket-state transitions

`OBX-AT-001` is deliberately pinned at `ready` while implementation begins. No
command, model verdict, test result, or elapsed time advances it automatically.
The only allowed sequence is `ready` to `in-progress` to implementation
`in-review` to `verified` to `done`. Each transition requires explicit owner
direction, synchronized manifest and ticket-body status, an updated verifier
invariant plus negative test, a refreshed authority-packet digest, and same-target
review evidence. This deliberately makes status progress a reviewed contract
change instead of weakening the current `ready` pin.

The two shared implementation files are narrow exceptions, not general edit
authority: `contracts.ts` may receive only the foundation's named versioned
contracts, and `Workbench.tsx` may receive only the import/render integration for
the dedicated `AiTeammate/` component directory. Their tests and CSS follow the
same named-surface constraint. Final review must show an empty dependency diff,
scan for prohibited provider/network/mutation capabilities, and inspect every
shared-file hunk.

## Completion boundary

Completion means the ticket acceptance criteria and required gates pass on one
immutable commit that receives exact Grok 4.6 review and independent verification.
It does not authorize merge to a protected branch, deployment, provider use,
release, or any later operating-environment slice.
