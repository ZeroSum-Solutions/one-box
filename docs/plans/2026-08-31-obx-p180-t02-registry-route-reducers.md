# OBX-P180 T02 Registry and Route Reducers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the provider-offline T02 registry and immutable route-state kernel without adding any provider, network, credential, persistence, runtime, UI, browser, Canvas, Page IR, deployment, release, or T03-T08 behavior.

**Architecture:** Reuse the completed T01 closed validators, canonical JSON, self-hash, and typed `Result` primitives. `registry.ts` owns three non-promoting fixture inventories and pure route admission; `routeState.ts` owns immutable compare-and-swap reducers for segment and attempt state. JSON fixtures provide hand-authored literal oracles; Vitest tests are the executable evaluation authority. Model reviews are advisory receipts bound to exact Git bytes.

**Tech Stack:** TypeScript, Vitest, Node built-ins already present in the repository, canonical SHA-256 from T01, no new dependency.

**Spec:** `docs/plans/one-box-master/04-operating-environment/obx-p180/02-provider-registry-and-route-contract.md` and ticket `OBX-P180-T02` in `docs/plans/one-box-master/04-operating-environment/obx-p180/06-ownership-tickets-and-authorization-proposal.md`.

## Global Constraints

- Implementation base is commit `07864a45d414db0998cc7cfb2731010d0d4cbe8b` unless the T02 authorization activation commit advances it; the activated record must pin the resulting implementation base exactly.
- T02 implementation may change exactly these six paths:
  - `src/lib/operatingEnvironment/registry.ts`
  - `src/lib/operatingEnvironment/registry.test.ts`
  - `src/lib/operatingEnvironment/routeState.ts`
  - `src/lib/operatingEnvironment/routeState.test.ts`
  - `src/lib/operatingEnvironment/fixtures/registry-v1.json`
  - `src/lib/operatingEnvironment/fixtures/route-state-v1.json`
- The protected untracked handoff must retain SHA-256 `cbbc878aa0691f333b128a71aee43adde89a9691a9ed65880f1f2b41a20643a6`.
- Keep `registry.ts` and `routeState.ts` below 400 lines each and keep public reducers below 50 lines where practical.
- Production imports are limited to `./canonical`, `./contracts`, and `./reasonCodes`; tests may additionally import Vitest and JSON fixtures.
- No current clock, randomness, environment, filesystem, shell, HTTP, provider, credential, persistence, worker, queue, browser, UI, collaboration, Canvas, Page IR, deploy, release, or product-runtime import.
- All liveness checks receive an explicit canonical UTC `observedAt` value. No reducer reads the clock.
- All reducer outputs are new frozen records. Inputs, nested arrays, fixtures, and prior state are never mutated.
- Unknown fields, aliases, silent defaults, unsupported effort, mismatched hashes, invalid admission, stale CAS, route switching in place, automatic fallback, third attempts, and late-output state mutation fail closed.
- GLM quick audits use exact model `z-ai/glm-5.3-flash` through the prepaid Nous Portal. The one full-section audit uses the Claude Max subscription alias `opus`, which must provider-report Opus 5. Model receipts never create product or implementation authority.

## Evaluation and Review Loop

1. Each behavior starts with one focused Vitest test that fails for the intended missing behavior.
2. Minimal implementation makes that test pass; the complete T02 focused suite runs after every cluster.
3. Fixture cases use hand-authored literal outputs and include adversarial mutations. Expectations never call the code under test to compute themselves.
4. GLM audits run only after meaningful green clusters, not after each micro-edit:
   - registry separation and admission;
   - segment admission and immutable switching;
   - retry, proposal interrupt, replay/attach, and quarantine.
5. The complete T02 bytes freeze before the single Opus 5 audit. If Opus reports findings, every correction begins with a failing regression test. Deterministic gates plus a final GLM receipt prove the correction; a second Opus call is reserved for a finding that cannot be mechanically closed.
6. Formal standalone evaluator command/hash pinning remains T05 scope. T02 creates only its two JSON fixtures and two Vitest suites.

---

### Task 0: Activate an exact T02-only solo authorization

**Files:**
- Create: `docs/plans/2026-08-31-obx-p180-t02-solo-authorization-design.md`
- Create: `docs/governance/risk-exceptions/2026-08-31-obx-p180-t02-solo.json`
- Create: `docs/audits/evidence/security/2026-08-31-obx-p180-t02-solo-authorization-security-review.json`
- Modify: `docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json`
- Modify: `docs/plans/one-box-master/00-authority/authority-manifest.json`
- Modify: `scripts/verify-plan-authority.mjs`
- Modify: `scripts/verify-plan-authority.node.mjs`

**Interfaces:**
- Produces authorization ID `OBX-AUTH-P180-T02-SOLO-001` and amendment ID `OBX-P180-T02-SOLO-AMENDMENT-001`.
- Preserves `OBX-AUTH-P180-T01-SOLO-001` byte-for-byte and never broadens it.
- Allows only the exact six T02 implementation paths and effect `add-provider-offline-fixture-registries-and-route-reducers`.
- Records Devin as owner, risk owner, authorizer, and implementation actor while truthfully keeping unavailable separated role assignments and independent-human review as `NOT_AVAILABLE`/`false`.
- Pins a non-renewable 336-hour validity window, exact branch, exact activation base, exact implementation base, hashes, T01 predecessor checkpoint, handoff baseline, allowed paths/effect, forbidden effects, and invalidators.
- Forbids T03-T08, provider/network/credentials, runtime wiring, dependencies, persistence, UI/browser/collaboration, Canvas/Page IR mutation, deploy/release, and any independent-review claim.

- [ ] **Step 1: Add failing authority-verifier tests**

Add tests that reject a missing T01 predecessor binding, any changed T01 authorization byte, a seventh T02 path, reordered path arrays, route/provider capability, a renewable or overlong exception, fake separated assignments, T03 authority, and an incorrect authorization or amendment self-hash.

- [ ] **Step 2: Run the authority tests and verify RED**

Run: `npm run test:plans`

Expected: the new exact T02 authorization tests fail because the T02 schema and record do not exist.

- [ ] **Step 3: Add the minimal closed T02 authorization schema and records**

Implement a separate exact-record validator branch for the T02 tuple. Do not generalize the solo exception into arbitrary tickets. Hash-bind the final amendment and authorization records after their bytes settle.

- [ ] **Step 4: Run authority and security gates**

Run:

```bash
npm run test:plans
npm run verify:plans
npm run typecheck -- --pretty false
npm run lint
gitleaks detect --source . --no-banner --redact
```

Expected: all commands exit zero; lint may report only the six pre-existing unrelated warnings and no errors.

- [ ] **Step 5: Record the security review and commit the activation checkpoint**

The security receipt must cover authorization, untrusted input, secrets, exports, prompt-injection/model-review non-authority, and exact write scope. Commit using `docs: activate OBX-P180 solo T02 authorization`. Record the resulting commit as the immutable T02 implementation base.

---

### Task 1: Build three non-promoting registries and fixture admission

**Files:**
- Create: `src/lib/operatingEnvironment/registry.test.ts`
- Create: `src/lib/operatingEnvironment/registry.ts`
- Create: `src/lib/operatingEnvironment/fixtures/registry-v1.json`

**Interfaces:**
- Produces `RegistryBundleV1`, `ProductRegistryV1`, `EvaluationRegistryV1`, `ExternalReviewRegistryV1`, `ProviderRegistryEntryV1`, `ModelRegistryEntryV1`, and `RoutePolicyV1` readonly types.
- Produces `validateRegistryBundle(input: unknown): Result<RegistryBundleV1>`.
- Produces `resolveFixtureRoute(bundle: RegistryBundleV1, routePolicyHash: string, observedAt: string): Result<ResolvedFixtureRouteV1>`.
- Product fixture identity is provider `offline-deterministic-v1` and model `synthetic/offline-deterministic-v1`; both admissions are `fixture-only`, provider access lane is `offline`, credential boundary is `none`, and fallback policy is `none`.
- Evaluation entries are `evaluation-only`; external-review entries are `audit-only`; neither can resolve through `resolveFixtureRoute`.

- [ ] **Step 1: Write fixture and failing registry-shape tests**

The literal fixture contains exactly one product provider, model, and route, one evaluation candidate, and one external-review audit entry. Tests reject unknown roots/fields, duplicate IDs, cross-inventory aliasing, noncanonical/self-hash mismatch, non-offline credential boundaries, and admissions outside their inventory.

- [ ] **Step 2: Run the registry test and verify RED**

Run: `npm test -- src/lib/operatingEnvironment/registry.test.ts`

Expected: FAIL because `registry.ts` is absent.

- [ ] **Step 3: Implement minimal closed validators**

Compose T01 `closedRecord`, `closedEnum`, `arrayOf`, `refine`, and `withSelfHash`. Validate every registry and entry independently, freeze all returned arrays/records, and reject duplicate or cross-inventory identities without adding a mutation or promotion API.

- [ ] **Step 4: Add failing route-resolution tests**

Tests prove that only the exact current fixture product route resolves, and that evaluation/audit entries, requested-only identity, provider/model/hash mismatch, unsupported effort, expired admission at explicit `observedAt`, non-offline lane, credential reference, and any fallback policy fail locally before an effect.

- [ ] **Step 5: Implement pure fixture route resolution and verify GREEN**

Run: `npm test -- src/lib/operatingEnvironment/registry.test.ts`

Expected: all registry tests pass with no skipped cases or warnings.

- [ ] **Step 6: Run first GLM 5.3 Flash audit**

Send only the T02 authorization, registry source/test/fixture diff, focused output, path census, and forbidden-effect census to `z-ai/glm-5.3-flash`. Store a JSON receipt outside the repository goal-state proof directory, require provider-reported exact model identity, and treat every finding as advisory until reproduced by a failing test.

---

### Task 2: Build immutable segment admission and switching reducers

**Files:**
- Create: `src/lib/operatingEnvironment/routeState.test.ts`
- Create: `src/lib/operatingEnvironment/routeState.ts`
- Create: `src/lib/operatingEnvironment/fixtures/route-state-v1.json`

**Interfaces:**
- Produces readonly `RouteSegmentIntentV1`, `RouteSegmentManifestV1`, `RouteAttemptV1`, and `RouteSegmentStateV1` types matching the closed fields in the governing route contract.
- Produces `validateRouteStateFixture(input: unknown): Result<RouteStateFixtureV1>`.
- Produces `reduceSegment(state, event): Result<SegmentReductionV1>` and `reduceAttempt(attempt, event): Result<AttemptReductionV1>` where reduction disposition is `applied`, `attached`, or `quarantined` and returned state is frozen.
- Every event carries `expectedRevision`; applied transitions increment exactly once. A duplicate exact event may attach without mutation; stale or conflicting CAS fails.

- [ ] **Step 1: Write fixture and failing closed-state tests**

Use literal draft, validated, reserved, active, interrupted, and terminal records. Reject unknown fields/states, unsafe revisions, malformed hashes, incomplete interrupted bindings, terminal records without receipts, nonterminal receipt hashes, and mutable or aliased output.

- [ ] **Step 2: Run the route-state test and verify RED**

Run: `npm test -- src/lib/operatingEnvironment/routeState.test.ts`

Expected: FAIL because `routeState.ts` is absent.

- [ ] **Step 3: Implement validators and listed segment transitions**

Implement only the contract transition graph. Validation binds the immutable intent; reservation binds but never rewrites the manifest; a switch cancels the existing immutable segment before a new draft may exist. No reducer creates a provider call, reservation, queue, receipt, proposal apply, or new route.

- [ ] **Step 4: Add failing switching/CAS/replay tests**

Tests prove in-place route mutation rejects after validation, active switch is cancellation rather than proposal interruption, terminal state is final, exact duplicate delivery attaches unchanged, and stale/conflicting revision never mutates state.

- [ ] **Step 5: Implement minimal switching/CAS/replay behavior and verify GREEN**

Run: `npm test -- src/lib/operatingEnvironment/routeState.test.ts`

Expected: the admission/switch/CAS cluster passes.

- [ ] **Step 6: Run the second GLM quick audit**

Audit the exact current T02 diff for invalid transitions, state aliasing, in-place route changes, unsafe replay, missing terminal finality, or hidden effects. Reproduce any accepted finding with a failing regression test before correction.

---

### Task 3: Add one same-route retry, proposal interruption, and late-output quarantine

**Files:**
- Modify: `src/lib/operatingEnvironment/routeState.test.ts`
- Modify: `src/lib/operatingEnvironment/routeState.ts`
- Modify: `src/lib/operatingEnvironment/fixtures/route-state-v1.json`

**Interfaces:**
- `maxAttempts` is exactly `1` or `2`; index one requires the same immutable route/input, a terminalized retryable attempt zero, known non-ambiguous billing, valid deadline/policy evidence, and no usable output.
- Proposal interruption is a unique `active -> interrupted` CAS with four immutable hashes; switch/cancel/provider interruption cannot create it.
- Provider output after interruption/terminal or output not bound to the settled attempt returns `quarantined` and leaves state unchanged.

- [ ] **Step 1: Write failing retry classification tests**

Cover one transient transport/rate-limit retry and reject authentication, authorization, policy, identity, region, data, price, budget, schema, cancellation, ambiguous-billing, content, third-attempt, or cross-route retry.

- [ ] **Step 2: Implement the minimal attempt reducer and verify GREEN**

Attempt zero must CAS from `retryable-failure` to terminal `failed` with reason `transient-retry-consumed` while index one is claimed. No state passes through a fabricated success or fallback route.

- [ ] **Step 3: Write failing proposal-HITL and quarantine tests**

Require a completed settled attempt, validated unapplied proposal, no live handle/work, four exact expected-state hashes, unique decision, current liveness evidence, and held reservation evidence. Rejection, expiry, revocation, or stale expected state cancels; acceptance only closes the segment receipt boundary and never applies a proposal.

- [ ] **Step 4: Implement minimal proposal-HITL and quarantine behavior**

Run: `npm test -- src/lib/operatingEnvironment/routeState.test.ts`

Expected: all route-state tests pass and late observations leave the original state byte-equivalent.

- [ ] **Step 5: Run the third GLM quick audit**

Audit retry/fallback, proposal-interrupt uniqueness, CAS, replay/attach, terminal finality, and late-output quarantine. Reproduce and correct accepted findings test-first.

---

### Task 4: Freeze T02, run executable evals, and perform the one Opus 5 audit

**Files:**
- Verify only: the exact six T02 implementation paths
- Proofs: external goal-state receipts and repository security receipt required by the activated authorization

**Interfaces:**
- The frozen T02 checkpoint is the only input to the final audit.
- No model review substitutes for tests, security verification, owner authorization, or a later T07 independent-human review.

- [ ] **Step 1: Run the complete deterministic gate matrix**

Run:

```bash
npm test -- src/lib/operatingEnvironment/registry.test.ts src/lib/operatingEnvironment/routeState.test.ts
npm test -- --exclude scripts/eval/obx-p180-contract-fixtures.test.mjs
node --test scripts/eval/obx-p180-contract-fixtures.test.mjs
npm run typecheck -- --pretty false
./node_modules/.bin/eslint src/lib/operatingEnvironment/*.ts
npm run verify:plans
npm run test:plans
git diff --check
gitleaks detect --source . --no-banner --redact
```

Expected: all commands exit zero. The unchanged unfiltered Vitest discovery mismatch remains disclosed rather than edited under T02.

- [ ] **Step 2: Run mutation sensitivity checks**

Temporarily mutate, one at a time, registry separation, fallback rejection, CAS revision comparison, retry count, proposal-interrupt uniqueness, and quarantine no-mutation. Each mutation must make at least one named focused test fail; restore exact bytes after every mutation.

- [ ] **Step 3: Run security and scope review**

Verify exact six-path implementation scope, unchanged dependency and lock files, allowed imports only, no forbidden capability strings/effects, no secrets, protected handoff hash, and source files below the line ceiling.

- [ ] **Step 4: Run one Opus 5 full-section audit**

Invoke Claude Max with `--model opus --effort high --print --no-session-persistence`. Require structured JSON containing model identity, verdict, findings, proof assessment, and residual risks. The packet includes the frozen six-file diff, governing T02 criteria, all deterministic outputs, GLM receipts, mutation evidence, security report, and scope census.

- [ ] **Step 5: Correct Opus findings test-first**

For each accepted finding, add a failing regression test, implement the smallest correction, rerun all affected deterministic gates, and run one final GLM quick audit over the corrected frozen bytes. Use a second Opus audit only when the original finding cannot be mechanically proven closed.

- [ ] **Step 6: Commit and record closure**

Commit only the exact six T02 implementation paths using `feat: add offline registry and route reducers`. Record the checkpoint, test totals, model receipts, residual risks, and explicit statement that T03-T08 and provider-connected/runtime work remain unauthorized.
