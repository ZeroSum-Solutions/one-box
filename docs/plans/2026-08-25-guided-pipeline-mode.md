# Guided Pipeline Mode Implementation Plan

> Approved architecture: `docs/specs/2026-08-25-guided-pipeline-mode.md`

**Goal:** Ship a default guided, visual OneBox pipeline view while preserving the existing Developer view and one authoritative controller.

**Architecture:** Add typed durable projections and backward-compatible ranked reference preferences at the server boundary. Render a new client-only guided projection over the same run ID/SSE lifecycle. Keep `RunTimeline` and the existing evidence workspace visually unchanged; only their shared server contracts gain additive compatibility.

**Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Vitest, Playwright, existing OneBox artifact/run-state helpers.

## Constraints

- TDD for every behavior change: write one focused failing test, verify the expected failure, implement minimally, rerun green.
- Runtime schemas remain in `src/lib/contracts.ts`.
- New routes use `isLocalApiAuthorized`, strict run IDs, `Cache-Control: no-store`, run-root confinement, and schema-validated responses.
- No arbitrary competitor iframes; previews use existing captured artifacts.
- No provider, spending, evidence-approval, Page IR, or deployment gate may depend on the browser view toggle.
- No production deployment in this task.

## Task 1: Add backward-compatible ranked preference contracts

**Files:**

- Modify `src/lib/contracts.ts`
- Modify `src/lib/referenceSelectionState.test.ts`
- Modify `src/lib/contracts.test.ts`

**RED:** Add tests proving:

- historical untagged single selections still parse byte-for-byte;
- ranked metadata is optional and additive to the current rank-one compatibility fields;
- ranked preferences require 1–3 unique candidates, contiguous rank, valid versions, and 3–1,000 character notes;
- mixed/invalid ranks and oversized overall notes fail;
- `ReferenceLockSchema` accepts historical locks and an optional ranked preference ledger;
- `MarketAnalysisSchema` accepts 0–8 scored competitors with a top-four display cutoff and rejects directory-derived rubric evidence.

Run and observe failure:

```bash
npx vitest run src/lib/referenceSelectionState.test.ts src/lib/contracts.test.ts
```

**GREEN:** Add only the schemas/types/artifact name required by those tests. Preserve the existing selection object fields and defaults.

## Task 2: Normalize and persist ranked selections atomically

**Files:**

- Create `src/lib/referenceSelection.ts`
- Create `src/lib/referenceSelection.test.ts`
- Modify `src/app/api/reference/[id]/route.ts`
- Modify `src/app/api/reference/route.test.ts`

**RED:** Add tests for:

- legacy selection normalization to one in-memory ranked preference without rewriting persisted bytes;
- server derivation of rank-one compatibility fields;
- canonical fingerprint excluding timestamp/source mode;
- identical ranked retry returns the existing selection;
- ranked-vs-ranked conflict, ranked-vs-legacy conflict, and legacy-vs-ranked conflict return 409 without mutation;
- unauthorized, malformed, zero-choice, missing-candidate, duplicate-rank, and cross-version inputs fail closed.

Run and observe failure:

```bash
npx vitest run src/lib/referenceSelection.test.ts src/app/api/reference/route.test.ts
```

**GREEN:** Add `{action:"select-ranked"}` to the route action union. Validate under the existing per-run transaction, derive server fields, persist before resume, and leave the legacy action intact.

## Task 3: Propagate ordered preferences into the lock and Page IR

**Files:**

- Modify `src/lib/referenceStage.ts`
- Modify `src/lib/referenceStage.test.ts`
- Modify `src/lib/pageIrDerivation.ts`
- Modify `src/lib/pageIrDerivation.test.ts`

**RED:** Add tests proving:

- rank 1 becomes the lock primary;
- ranks 2–3 become exactly two `borrowedDetails` using their notes;
- preference ledger preserves order and overall note;
- legacy single selection produces the current lock behavior;
- Page IR maps rank 1 to `primary` and ranks 2–3 to `supporting`, never exceeding `PAGE_IR_BOUNDS.maxReferenceSources`;
- competitor URLs/IDs mentioned inside notes cannot change the locked provenance/source set.

Run and observe failure:

```bash
npx vitest run src/lib/referenceStage.test.ts src/lib/pageIrDerivation.test.ts
```

**GREEN:** Make both consumers call the shared normalizer. Treat notes as bounded untrusted prose only.

## Task 4: Produce deep competitor analysis without Yelp influence

**Files:**

- Create `src/lib/marketAnalysis.ts`
- Create `src/lib/marketAnalysis.test.ts`
- Modify `src/lib/pipeline.ts`
- Modify `src/lib/pipelineEvidence.test.ts`
- Modify `src/lib/contracts.ts`

**RED:** Add fixtures proving:

- directory/social URLs and non-business classifications are ineligible before model analysis;
- rubric prompt input contains first-party crawl evidence but excludes Place/Yelp rating, review count, and directory rank;
- changing only directory popularity fields leaves the rubric input hash and persisted order unchanged;
- uncited rubric criteria score zero;
- deterministic ties use cited-observation count then canonical URL;
- `market-analysis.json` stores up to eight rows while legacy `scan.json` stays capped at four;
- research-disabled and zero-eligible runs persist honest typed artifacts.

Run and observe failure:

```bash
npx vitest run src/lib/marketAnalysis.test.ts src/lib/pipelineEvidence.test.ts
```

**GREEN:** Extend the existing per-competitor decode output with structured claims/rubric fields, sanitize its prompt input, rank once, persist the full analysis artifact, and project only the top four into the legacy scan.

## Task 5: Add the authenticated guided read model

**Files:**

- Create `src/lib/guidedPipeline.ts`
- Create `src/lib/guidedPipeline.test.ts`
- Create `src/app/api/guided/[id]/route.ts`
- Create `src/app/api/guided/route.test.ts`

**RED:** Add tests for every approved surface:

- intake/research running, research failed/disabled;
- market leaders while direction candidates are generated;
- reference pending, auto-lock legacy, applying selected preferences, lock failure;
- evidence/contract/tokens/tailwind/css generation and pause/revision;
- synthesis/build running or failed, Page IR source pause, parked/fallback;
- cost cap/configuration error, reconnecting, and complete;
- stale pause invalidation and unknown-state fail-closed behavior;
- unauthorized/bad/missing run responses and `Cache-Control: no-store`;
- legacy fallback from scan when `market-analysis.json` is absent.

Run and observe failure:

```bash
npx vitest run src/lib/guidedPipeline.test.ts src/app/api/guided/route.test.ts
```

**GREEN:** Implement one server-derived discriminated `GuidedSurfaceKind`. Do not parse event-card prose.

## Task 6: Enable ranked picking for new website runs

**Files:**

- Modify `src/app/api/chat/route-runtime.ts`
- Modify `src/app/api/chat/route.test.ts`

**RED:** Prove new website runs created with the guided rollout enabled persist `referencePickerEnabled=true`, while existing runs and an explicit rollback flag retain their persisted value. Prove browser presentation mode is not an input.

Run and observe failure:

```bash
npx vitest run src/app/api/chat/route.test.ts
```

**GREEN:** Capture the guided rollout once at run creation; do not consult it on resume.

## Task 7: Build the guided visual projection and ranked picker

**Files:**

- Create `src/components/PipelineModeToggle.tsx`
- Create `src/components/PipelineModeToggle.test.tsx`
- Create `src/components/GuidedPipeline.tsx`
- Create `src/components/GuidedPipeline.test.tsx`
- Create `src/components/GuidedCompetitorDialog.tsx`
- Create `src/components/GuidedReferencePicker.tsx`
- Create `src/components/GuidedReferencePicker.test.tsx`
- Modify `src/app/page.tsx`
- Modify `src/app/globals.css`

**RED:** Add component tests proving:

- default guided mode, local persistence, and `?view=` override;
- toggling never fetches a mutation route;
- Developer mode renders the unchanged `RunTimeline` projection;
- guided current/completed/future step disclosure;
- map and 0/1/2–4 competitor states;
- competitor dialog desktop/mobile tabs, focus restoration, Escape close, and safe external link;
- add/remove/reorder 1–3 references with rank labels and required notes;
- run/version-scoped draft restore without server mutation;
- one confirm POST, idempotent retry messaging, conflict refresh, and resume-stream consumption;
- responsive semantic order and non-color selection state.

Run and observe failure:

```bash
npx vitest run src/components/PipelineModeToggle.test.tsx src/components/GuidedPipeline.test.tsx src/components/GuidedReferencePicker.test.tsx
```

**GREEN:** Branch only at the presentation layer in `Home`. Keep existing `RunTimeline` code unchanged. Reuse Midnight Instrument tokens and existing map/artifact URL helpers; add no new heavy dependency.

## Task 8: Browser QA, security review, and documentation

**Files:**

- Create `scripts/e2e/guided-pipeline.mjs`
- Create `docs/audits/security/guided-pipeline.json`
- Update `DESIGN.md` only if the implemented component rules add durable design-system semantics
- Update relevant README/codemap only if behavior/setup locations changed materially

**Verification:**

```bash
npm test
npm run typecheck
npm run lint
npm run build
node scripts/e2e/guided-pipeline.mjs
```

Browser matrix: 1440, 768, 390, and 320 widths; keyboard-only; Escape/focus restoration; reduced motion; console/page errors; reconnect; script-blocked generated preview; Axe severity scan.

Run the security-review skill with an exact branch diff, all six surface rows, range gitleaks scan, export-policy decision, and validator. Run independent senior review, fix all important findings, then run the final bounded Grok 4.6 implementation audit.

## Task 9: Git handoff

- Re-read this plan and the approved spec line by line.
- Record fresh full verification output.
- Commit logical slices with conventional subjects.
- Confirm clean worktree, branch, HEAD SHA, upstream parity, and no ignored run artifacts staged.
- Push the feature branch only after all verification and review gates pass.
