# Release Lifecycle Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the closed, revisioned local lifecycle authority that later Canvas, client-review, qualification, deployment, and appointment plans can consume without redefining persisted v1 state.

**Architecture:** Store one optional `SiteLifecycleV1` record inside the existing atomic `run.json` authority. Define the complete v1 event vocabulary and pure transition table now, then expose only generation and Canvas-candidate events to production callers in P1. A thin `withRunTransaction` service provides compare-and-swap persistence; a local read API and Canvas badge expose the projection without granting mutation authority.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript 5, Zod 4.4, Vitest 4.1, existing filesystem run transactions and site-authority locks.

**Spec:** `docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md`

**Program roadmap:** `docs/superpowers/plans/2026-08-27-canvas-to-agency-shipping-roadmap.md`

## Global Constraints

- This plan implements P1 only. It does not create client review, SEO qualification, deployment, provider, or appointment behavior.
- Preserve `PageIRV1` and the current generated-site schema; this plan requires no production schema change.
- Keep `RunStateSchema` backward-compatible by making `siteLifecycle` optional for persisted legacy runs. `createRun()` writes it for every new run.
- Every accepted transition compares the exact current revision and returns a new immutable record. A stale revision produces no write.
- Event timestamps are validated inputs. Pure transition code does not call the clock.
- Models, clients, API payloads, and UI components cannot mint approval, release, or deployment states.
- Keep all existing site filesystem writes under the site-authority lock and all run-state writes under `withRunTransaction`.
- Do not expose the app beyond loopback or change `isLocalApiAuthorized`.
- Do not add dependencies.
- Use test-first implementation and one conventional commit per task.

## File Structure

- Modify `src/lib/contracts.ts`: add closed workflow, release, binding, event, history, and projection schemas; add optional `siteLifecycle` to `RunStateSchema`.
- Create `src/lib/releaseLifecycle.ts`: pure initialization, transition table, approval clearing, idempotency, and projection.
- Create `src/lib/releaseLifecycle.test.ts`: exhaustive transition, hash-binding, stale-revision, and immutability tests.
- Modify `src/lib/runstate.ts`: initialize lifecycle for new runs and expose transaction-backed persistence.
- Create `src/lib/releaseLifecycleStore.ts`: load, apply, and idempotently record an accepted Canvas candidate.
- Create `src/lib/releaseLifecycleStore.test.ts`: persistence, rollback, legacy, and concurrency tests.
- Modify `src/lib/pageIrController.ts`: record an accepted Page IR build after promoted visual QA is bound to the live build.
- Modify `src/lib/pageIrController.test.ts`: replay and lifecycle-recording tests.
- Create `src/app/api/lifecycle/[id]/route.ts`: loopback-authorized read-only projection.
- Create `src/app/api/lifecycle/[id]/route.test.ts`: authorization, legacy, tracked, and malformed-run tests.
- Create `src/components/preview/LifecycleStatus.tsx`: small read-only Canvas status view.
- Create `src/components/preview/LifecycleStatus.test.tsx`: state-label and unavailable-state tests.
- Modify `src/app/preview/[id]/page.tsx`: fetch and display lifecycle status without changing editor authority.
- Modify `scripts/e2e/preview-workbench.mjs`: assert the status is visible for a tracked run.
- Modify `docs/architecture/README.md`: record lifecycle module ownership and later-plan boundaries.

---

### Task 1: Closed lifecycle contracts

**Files:**
- Modify: `src/lib/contracts.ts:1866-1986`
- Modify: `src/lib/contracts.test.ts`

**Interfaces:**
- Consumes: existing `Sha256Schema`, `RunIdSchema`, and `RunStateSchema` patterns.
- Produces: `SiteWorkflowState`, `SiteReleaseState`, `SiteLifecycleV1`, `SiteLifecycleEventV1`, `SiteLifecycleProjectionV1`, and their exported Zod schemas.

- [ ] **Step 1: Write failing contract tests**

Add tests that parse all project states, reject `superseded` as a project state, parse `superseded` as a release state, reject unknown fields, reject duplicate release IDs, and prove legacy `RunState` fixtures without `siteLifecycle` still parse.

```ts
it("separates project workflow from immutable release state", () => {
  expect(SiteWorkflowStateSchema.safeParse("superseded").success).toBe(false);
  expect(SiteReleaseStateSchema.parse("superseded")).toBe("superseded");
});

it("keeps lifecycle optional for persisted legacy runs", () => {
  const parsed = RunStateSchema.parse(legacyRunFixture());
  expect(parsed.siteLifecycle).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run src/lib/contracts.test.ts`

Expected: FAIL because the lifecycle schemas are not exported.

- [ ] **Step 3: Add the closed schemas**

Add these state members exactly:

```ts
export const SITE_WORKFLOW_STATES = [
  "generating",
  "canvas_ready",
  "designing",
  "client_review",
  "changes_requested",
  "client_locked",
  "qualifying",
  "release_blocked",
  "ready_to_deploy",
  "deploying",
  "live",
] as const;

export const SITE_RELEASE_STATES = [
  "prepared",
  "deploying",
  "live",
  "superseded",
  "failed",
] as const;
```

Define strict schemas with these exact fields:

```ts
SiteReleaseRecordV1 = {
  schemaVersion: 1;
  releaseId: string;
  buildSha256: string;
  state: SiteReleaseState;
  providerReleaseId: string | null;
  qualificationSha256: string;
  releaseApprovalSha256: string;
  deploymentReceiptSha256: string | null;
  createdAt: string;
  updatedAt: string;
}

SiteLifecycleBindingV1 = {
  buildSha256: string;
  receiptSha256: string;
  boundAt: string;
}

SiteLifecycleHistoryEntryV1 = {
  revision: number;
  eventId: string;
  eventType: SiteLifecycleEventV1["type"];
  actorKind: "system" | "designer" | "client" | "release_owner";
  actorName: string | null;
  at: string;
  fromState: SiteWorkflowState;
  toState: SiteWorkflowState;
  buildSha256: string | null;
}

SiteLifecycleV1 = {
  schemaVersion: 1;
  revision: number;
  state: SiteWorkflowState;
  currentBuildSha256: string | null;
  clientLock: SiteLifecycleBindingV1 | null;
  qualification: SiteLifecycleBindingV1 | null;
  releaseApproval: SiteLifecycleBindingV1 | null;
  releases: SiteReleaseRecordV1[];
  history: SiteLifecycleHistoryEntryV1[];
  updatedAt: string;
}
```

Use `z.string().datetime({ offset: true })` for timestamps, `Sha256Schema` for hashes, a bounded ID pattern for event and release IDs, `.strict()` for every object, unique release and event IDs, monotonic history revisions, and canonical release creation order.

Define the complete v1 event union now. Later plans may authorize new callers, but they may not append fields or members to this persisted v1 union:

```ts
type SiteLifecycleEventV1 =
  | { schemaVersion: 1; eventId: string; type: "generation_started"; expectedRevision: 0; actorKind: "system"; actorName: null; at: string }
  | { schemaVersion: 1; eventId: string; type: "canvas_candidate_accepted"; expectedRevision: number; actorKind: "system"; actorName: null; at: string; buildSha256: string }
  | { schemaVersion: 1; eventId: string; type: "design_mutation_accepted"; expectedRevision: number; actorKind: "system" | "designer"; actorName: string | null; at: string; buildSha256: string; isPresentational: boolean }
  | { schemaVersion: 1; eventId: string; type: "client_review_started"; expectedRevision: number; actorKind: "designer"; actorName: string; at: string; buildSha256: string }
  | { schemaVersion: 1; eventId: string; type: "client_changes_requested"; expectedRevision: number; actorKind: "client"; actorName: string; at: string; buildSha256: string; receiptSha256: string }
  | { schemaVersion: 1; eventId: string; type: "client_locked"; expectedRevision: number; actorKind: "client"; actorName: string; at: string; buildSha256: string; receiptSha256: string }
  | { schemaVersion: 1; eventId: string; type: "qualification_started"; expectedRevision: number; actorKind: "system"; actorName: null; at: string; buildSha256: string }
  | { schemaVersion: 1; eventId: string; type: "qualification_blocked"; expectedRevision: number; actorKind: "system"; actorName: null; at: string; buildSha256: string; receiptSha256: string }
  | { schemaVersion: 1; eventId: string; type: "qualification_passed"; expectedRevision: number; actorKind: "system"; actorName: null; at: string; buildSha256: string; receiptSha256: string }
  | { schemaVersion: 1; eventId: string; type: "release_approved"; expectedRevision: number; actorKind: "release_owner"; actorName: string; at: string; buildSha256: string; receiptSha256: string; releaseId: string }
  | { schemaVersion: 1; eventId: string; type: "deployment_started"; expectedRevision: number; actorKind: "release_owner"; actorName: string; at: string; releaseId: string }
  | { schemaVersion: 1; eventId: string; type: "deployment_verified"; expectedRevision: number; actorKind: "system"; actorName: null; at: string; releaseId: string; providerReleaseId: string; receiptSha256: string }
  | { schemaVersion: 1; eventId: string; type: "deployment_failed"; expectedRevision: number; actorKind: "system"; actorName: null; at: string; releaseId: string; receiptSha256: string };
```

Export the projection as a strict discriminated union. The untracked member is exactly `{ schemaVersion: 1, tracked: false }`. The tracked member contains `schemaVersion`, `tracked: true`, `revision`, `state`, `currentBuildSha256`, and `updatedAt`. Do not expose history, receipts, or releases through this projection.

Add `siteLifecycle: SiteLifecycleV1Schema.optional()` to `RunStateSchema`.

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run src/lib/contracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Run type checking**

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contracts.ts src/lib/contracts.test.ts
git commit -m "feat: add site lifecycle contracts"
```

---

### Task 2: Pure transition authority

**Files:**
- Create: `src/lib/releaseLifecycle.ts`
- Create: `src/lib/releaseLifecycle.test.ts`

**Interfaces:**
- Consumes: `SiteLifecycleV1Schema`, `SiteLifecycleEventV1Schema`, and `SiteLifecycleProjectionV1Schema` from Task 1.
- Produces:

```ts
export function createInitialSiteLifecycle(event: SiteLifecycleEventV1): SiteLifecycleV1;
export function transitionSiteLifecycle(current: SiteLifecycleV1, event: SiteLifecycleEventV1): SiteLifecycleV1;
export function projectSiteLifecycle(current: SiteLifecycleV1 | undefined): SiteLifecycleProjectionV1;
```

- [ ] **Step 1: Write the failing transition tests**

Cover these cases:

- only `generation_started` can create the initial record;
- initial state is `generating`, revision is `1`, and history contains one entry;
- `canvas_candidate_accepted` moves `generating` to `canvas_ready`;
- the same event ID and same build is idempotent and returns the same value;
- a reused event ID with different content throws;
- a stale `expectedRevision` throws `SiteLifecycleConflictError`;
- every allowed project-workflow transition in the table below succeeds;
- every other state and event pair fails without mutation;
- `release_approved` creates one `prepared` release bound to the current build, qualification, and owner approval;
- `deployment_started` changes that release from `prepared` or `failed` to `deploying`;
- `deployment_verified` makes the selected release `live` and supersedes the prior live release atomically;
- `deployment_failed` marks the selected release `failed` and returns the project to `ready_to_deploy` without clearing qualification or release approval;
- a presentational mutation clears client lock, qualification, and release approval;
- a non-presentational mutation may preserve client lock only when the build hash is unchanged;
- input records and arrays remain unchanged;
- the untracked projection contains no invented state.

```ts
expect(() => transitionSiteLifecycle(current, {
  ...canvasAccepted,
  expectedRevision: current.revision - 1,
})).toThrow(SiteLifecycleConflictError);
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npx vitest run src/lib/releaseLifecycle.test.ts`

Expected: FAIL because `releaseLifecycle.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure state machine**

Use this explicit project transition table rather than conditional fallthrough:

```ts
const SITE_WORKFLOW_TRANSITIONS_V1 = Object.freeze({
  generating: Object.freeze({
    canvas_candidate_accepted: "canvas_ready",
  }),
  canvas_ready: Object.freeze({ design_mutation_accepted: "designing", client_review_started: "client_review" }),
  designing: Object.freeze({ design_mutation_accepted: "designing", client_review_started: "client_review" }),
  client_review: Object.freeze({ client_changes_requested: "changes_requested", client_locked: "client_locked" }),
  changes_requested: Object.freeze({ design_mutation_accepted: "designing" }),
  client_locked: Object.freeze({ design_mutation_accepted: "designing", qualification_started: "qualifying" }),
  qualifying: Object.freeze({ qualification_blocked: "release_blocked", qualification_passed: "ready_to_deploy" }),
  release_blocked: Object.freeze({ design_mutation_accepted: "designing", qualification_started: "qualifying" }),
  ready_to_deploy: Object.freeze({ release_approved: "ready_to_deploy", deployment_started: "deploying" }),
  deploying: Object.freeze({ deployment_verified: "live", deployment_failed: "ready_to_deploy" }),
  live: Object.freeze({ design_mutation_accepted: "designing" }),
} as const);
```

Parse inputs before use. Check exact revision before looking up the successor. Clone arrays and nested values. Append one history entry whose revision equals the new record revision. Parse the complete output before returning it.

For idempotency, compare the canonical parsed event with the history entry carrying the same `eventId`. Return the current parsed record only when event type, timestamp, actor, and build hash match.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/lib/releaseLifecycle.test.ts`

Expected: PASS.

- [ ] **Step 5: Run contracts plus transition tests**

Run: `npx vitest run src/lib/contracts.test.ts src/lib/releaseLifecycle.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/releaseLifecycle.ts src/lib/releaseLifecycle.test.ts
git commit -m "feat: add site lifecycle state machine"
```

---

### Task 3: Transaction-backed lifecycle persistence

**Files:**
- Modify: `src/lib/runstate.ts:226-335`
- Create: `src/lib/releaseLifecycleStore.ts`
- Create: `src/lib/releaseLifecycleStore.test.ts`

**Interfaces:**
- Consumes: `withRunTransaction`, `createInitialSiteLifecycle`, and `transitionSiteLifecycle`.
- Produces:

```ts
export async function loadSiteLifecycle(runId: string): Promise<SiteLifecycleV1 | undefined>;
export async function applySiteLifecycleEvent(runId: string, event: SiteLifecycleEventV1): Promise<SiteLifecycleV1>;
export async function recordCanvasCandidateAccepted(input: {
  runId: string;
  buildSha256: string;
  at: string;
  eventId: string;
}): Promise<SiteLifecycleV1>;
```

- [ ] **Step 1: Write failing persistence tests**

Test that:

- `createRun()` writes a `generation_started` lifecycle at revision `1` using the run's `createdAt` and event ID ``lifecycle-generation-${runId}``;
- loading a legacy fixture returns `undefined` without rewriting its bytes;
- applying `canvas_candidate_accepted` persists revision `2` atomically;
- stale revision rejects and leaves `run.json` byte-identical;
- an injected `saveRun` failure leaves the prior lifecycle intact;
- two concurrent events with the same expected revision produce exactly one success;
- `recordCanvasCandidateAccepted` is idempotent for the same build and event ID.

- [ ] **Step 2: Run the tests and verify failure**

Run: `npx vitest run src/lib/releaseLifecycleStore.test.ts`

Expected: FAIL because the store module and new-run initialization do not exist.

- [ ] **Step 3: Initialize new runs**

In `createRun()`, construct `createdAt` once and reuse it for both the run and this exact event:

```ts
const initialLifecycle = createInitialSiteLifecycle({
  schemaVersion: 1,
  eventId: `lifecycle-generation-${id}`,
  type: "generation_started",
  expectedRevision: 0,
  actorKind: "system",
  actorName: null,
  at: createdAt,
});
```

Do not use a schema default for legacy runs.

- [ ] **Step 4: Implement the store**

Use `withRunTransaction` for every mutation:

```ts
export function applySiteLifecycleEvent(
  runId: string,
  event: SiteLifecycleEventV1,
): Promise<SiteLifecycleV1> {
  return withRunTransaction(runId, async ({ state }) => {
    if (!state.siteLifecycle) {
      throw new SiteLifecycleConflictError("site lifecycle is not initialized");
    }
    const next = transitionSiteLifecycle(state.siteLifecycle, event);
    state.siteLifecycle = next;
    return next;
  });
}
```

`recordCanvasCandidateAccepted` performs one `withRunTransaction` call. If a legacy run has no lifecycle, create the initial `generation_started` record from the run's stored `createdAt`, then apply `canvas_candidate_accepted` in the same transaction. Reading a legacy run alone still performs no write. If a tracked record wins a concurrent write, retry once only when the winning record already names the same build hash. Do not convert a different winning state into `canvas_ready`.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run src/lib/releaseLifecycleStore.test.ts src/lib/releaseLifecycle.test.ts src/lib/runstate.test.ts`

Expected: PASS.

- [ ] **Step 6: Run type checking**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/runstate.ts src/lib/releaseLifecycleStore.ts src/lib/releaseLifecycleStore.test.ts
git commit -m "feat: persist site lifecycle state"
```

---

### Task 4: Bind accepted Page IR builds to Canvas readiness

**Files:**
- Modify: `src/lib/pageIrController.ts:372-405,580-650`
- Modify: `src/lib/pageIrController.test.ts`

**Interfaces:**
- Consumes: `recordCanvasCandidateAccepted()` from Task 3 and the exact promoted `live.manifest.buildSha256` already verified by `pageIrController`.
- Produces: one idempotent `canvas_candidate_accepted` transition per promoted Page IR build.

- [ ] **Step 1: Write failing controller tests**

Add an injectable dependency and assert:

- it runs after promoted bundle and visual-QA build hashes match;
- it receives the exact promoted build hash;
- it does not run on candidate, promotion, live-bundle, or visual-QA failure;
- controller replay calls it with the same deterministic event ID and does not append history twice;
- lifecycle persistence failure pauses or fails the controller without claiming the run complete.

```ts
expect(dependencies.recordCanvasCandidateAccepted).toHaveBeenCalledWith({
  runId,
  buildSha256: live.manifest.buildSha256,
  at: expect.any(String),
  eventId: `canvas-candidate-${live.manifest.buildSha256}`,
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run src/lib/pageIrController.test.ts`

Expected: FAIL because the controller dependency is missing.

- [ ] **Step 3: Add the dependency and transition**

Add `recordCanvasCandidateAccepted` to the controller dependency object. Invoke it only after `materializePromotedPageIrVisualQa()` returns the exact promoted build. Use one captured ISO timestamp and the deterministic event ID shown in the test.

Do not add template-path handling in this task. P2 owns the shared promotion and mutation integration needed for both layout authorities.

- [ ] **Step 4: Run controller and replay tests**

Run: `npx vitest run src/lib/pageIrController.test.ts src/lib/pageIrPipeline.test.ts src/lib/pipelineReplay.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pageIrController.ts src/lib/pageIrController.test.ts
git commit -m "feat: mark page ir builds canvas ready"
```

---

### Task 5: Read-only lifecycle API and Canvas status

**Files:**
- Create: `src/app/api/lifecycle/[id]/route.ts`
- Create: `src/app/api/lifecycle/[id]/route.test.ts`
- Create: `src/components/preview/LifecycleStatus.tsx`
- Create: `src/components/preview/LifecycleStatus.test.tsx`
- Modify: `src/app/preview/[id]/page.tsx`
- Modify: `scripts/e2e/preview-workbench.mjs`

**Interfaces:**
- Consumes: `isLocalApiAuthorized()`, `loadSiteLifecycle()`, and `projectSiteLifecycle()`.
- Produces: `GET /api/lifecycle/:id` returning `SiteLifecycleProjectionV1`; `<LifecycleStatus projection={...} />`.

- [ ] **Step 1: Write failing route tests**

Cover invalid run ID `400`, unauthorized request `403`, missing run `404`, legacy run `200` with `{ tracked: false }`, and tracked run `200` with no-store headers and only projection fields.

```ts
expect(await response.json()).toEqual({
  schemaVersion: 1,
  tracked: true,
  revision: 2,
  state: "canvas_ready",
  currentBuildSha256: BUILD_SHA,
  updatedAt: NOW,
});
expect(response.headers.get("cache-control")).toBe("no-store");
```

- [ ] **Step 2: Run route tests and verify failure**

Run: `npx vitest run 'src/app/api/lifecycle/[id]/route.test.ts'`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the GET route**

Follow the error and authorization structure of `src/app/api/evidence/[id]/export/route.ts`. Accept GET only, use the existing run ID regex, return the projection, and never return lifecycle history, actor names, receipt hashes, or release records.

- [ ] **Step 4: Write failing component tests**

Assert these exact labels:

```ts
const LABELS = {
  generating: "Generating",
  canvas_ready: "Canvas ready",
  designing: "Designing",
  client_review: "Client review",
  changes_requested: "Changes requested",
  client_locked: "Client locked",
  qualifying: "Agency checks",
  release_blocked: "Release blocked",
  ready_to_deploy: "Ready to deploy",
  deploying: "Deploying",
  live: "Live",
} as const;
```

An untracked run renders `Lifecycle unavailable for this legacy run` and no invented status.

- [ ] **Step 5: Run component tests and verify failure**

Run: `npx vitest run src/components/preview/LifecycleStatus.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 6: Implement the status component and preview fetch**

Keep the component read-only. In `page.tsx`, fetch the route when the preview run ID changes, parse the response with `SiteLifecycleProjectionV1Schema`, and render the status beside the existing run identity. A failed fetch renders unavailable state and does not block Canvas.

Do not add buttons, transition POST routes, polling, client links, qualification controls, or deployment controls.

- [ ] **Step 7: Extend the preview E2E assertion**

Add one assertion that a new tracked Page IR run displays `Canvas ready`. Preserve the existing Canvas selection and editing assertions.

- [ ] **Step 8: Run focused UI verification**

Run: `npx vitest run 'src/app/api/lifecycle/[id]/route.test.ts' src/components/preview/LifecycleStatus.test.tsx`

Expected: PASS.

Run: `npm run test:e2e:preview`

Expected: PASS with the lifecycle status visible and all prior preview checks green.

- [ ] **Step 9: Commit**

```bash
git add 'src/app/api/lifecycle/[id]/route.ts' 'src/app/api/lifecycle/[id]/route.test.ts' src/components/preview/LifecycleStatus.tsx src/components/preview/LifecycleStatus.test.tsx 'src/app/preview/[id]/page.tsx' scripts/e2e/preview-workbench.mjs
git commit -m "feat: show canvas release lifecycle"
```

---

### Task 6: Foundation documentation and complete verification

**Files:**
- Modify: `docs/architecture/README.md`
- Test: existing repository gates

**Interfaces:**
- Consumes: all P1 interfaces.
- Produces: current architecture ownership and a green P1 verification receipt in the implementation task handoff, not in committed generated state.

- [ ] **Step 1: Update architecture ownership**

Document these boundaries:

- `contracts.ts` owns persisted lifecycle shapes;
- `releaseLifecycle.ts` owns pure transition semantics;
- `releaseLifecycleStore.ts` owns run-transaction persistence;
- the lifecycle API is read-only and loopback-only;
- P2 owns mutation invalidation and template integration;
- P3 through P8 remain unavailable.

- [ ] **Step 2: Run the complete unit suite**

Run: `npm test`

Expected: exit `0`; no test file or test-count regression.

- [ ] **Step 3: Run static verification**

Run: `npm run typecheck`

Expected: exit `0`.

Run: `npm run lint`

Expected: exit `0` with no errors.

- [ ] **Step 4: Run production and generated-site gates**

Run: `npm run build`

Expected: exit `0`.

Run: `npm run test:smoke`

Expected: exit `0`.

Run: `npm run test:e2e:preview`

Expected: exit `0`.

- [ ] **Step 5: Review the full P1 diff**

At execution kickoff, record `P1_BASE=$(git rev-parse HEAD)` in the task tracker. Then run:

`git diff "$P1_BASE"...HEAD -- src docs/architecture/README.md scripts/e2e/preview-workbench.mjs`

Expected: only P1 lifecycle contracts, state authority, Page IR binding, read projection, Canvas status, tests, and ownership documentation.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/README.md
git commit -m "docs: document site lifecycle ownership"
```

- [ ] **Step 7: Run independent verification before completion**

Use the `verifier` skill against this plan and the approved design. Do not claim P1 complete until the verifier confirms the P1 exit gate with current command evidence.
