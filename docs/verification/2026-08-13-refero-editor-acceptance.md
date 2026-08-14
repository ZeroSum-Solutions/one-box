# Refero editor acceptance matrix

**Record date:** 2026-08-14

**Revision inspected:** `e2b41995d960eac14905c645631d3565f7ed5a54` on
`codex/onebox-production-loop`, matching merged `main` at the start of this pass

**Scope:** production-like local conformance. This is not a deployment or
live-provider verdict.

## Evidence rules

`npm test` was rerun at the inspected revision on 2026-08-14 and passed:
**232 tests in 33 files**, with two fixture-only suites skipped by the canonical
runner. The evaluation harness passed **43 tests**. Typecheck, production build,
smoke gates, DESIGN.md lint and export, and the intake, preview, motion, and
token/motion rendered matrices also passed. The live full-run harness is now
approval-aware, but no paid provider run, automatic evidence approval, or
deployment occurred. A row is **PROVEN** only where that direct check or a saved
authoritative artifact proves the whole stated requirement. **PARTIAL** means
there is focused implementation or unit coverage but no complete rendered,
persisted-project, or live-provider proof. **BLOCKED** requires an external
credential, human decision, or controlled run that has not occurred. **MISSING**
means this branch has no located implementation or authoritative artifact for the
requirement. Existing Wave notes are context only, not a passing result for this
branch.

The Refero/editor implementation is safe to checkpoint. Live model-routing promotion
and the Path A/Path B comparison remain blocked on externally isolated blind scoring
by two named humans; the coordinator and baseline harness must not be treated as
measured results. Baseline contract v2 adds frozen three-width screenshots and source
site evidence, but its two copied site files are not a standalone runnable bundle.

The acceptance source is
`docs/specs/2026-08-13-refero-editor-requirements.md`. Test paths below identify
the direct assertion family included in the passing `npm test` run. Commands in
**Remaining proof** are exact next checks, not claims that they have run.

## Direct implementation criteria

| ID | Status | Authoritative evidence | Exact remaining proof |
|---|---|---|---|
| IMP-001 | PROVEN | This record; plan current-state record; `git status --short` inspected 2026-08-13 | Re-inspect and refresh both records before any architecture-changing slice. |
| IMP-002 | PROVEN | Plan protected-active-areas record and branch status inventory | Independent verifier confirms no protected active file was overwritten. |
| IMP-003 | PROVEN | View/Edit iframe implementation plus passing `npm run test:e2e:preview` | Re-run after any preview trust-boundary change. |
| IMP-004 | PROVEN | Passing preview E2E exercises navigation, forms, popups, hover, scroll parallax, and a live WebGL render loop in both modes | Re-run after generated-runtime or sandbox changes. |
| IMP-005 | PROVEN | Passing preview E2E directly edits, cancels, persists, undoes, and redoes ordinary text | Re-run after overlay or element-history changes. |
| IMP-006 | PARTIAL | `src/lib/elementEditor.test.ts` escaped text persistence assertions | Rendered add/delete/replace coverage at desktop, tablet, and mobile. |
| IMP-007 | PARTIAL | `src/lib/elementEditor.test.ts` bounded href/native button action assertions | Render and persist label and every supported destination/action type. |
| IMP-008 | PARTIAL | `src/lib/elementEditor.test.ts` allowlisted typography assertions | Workbench browser proof for family, size, weight, color, alignment, and supported spacing. |
| IMP-009 | PROVEN | Preview E2E asserts selection, text-editing, drag-preview, Escape, and parent-confirmed move states | Re-run after overlay protocol changes. |
| IMP-010 | PROVEN | Preview E2E proves Escape cancel, focus restoration, keyboard selection, undo, and redo | Re-run after element-history changes. |
| IMP-011 | PROVEN | Live WebGL/parallax fixture remains active in Edit behind the documented `safe-overlay`; declarative motion rejects the owning target | Re-run after complex-content policy changes. |
| IMP-012 | PROVEN | Preview E2E selects the live canvas through the visible safe-overlay fallback; motion E2E rejects it | Re-run after overlay behavior changes. |
| IMP-013 | PROVEN | Preview E2E proves navigation/form suppression and zero generated capture-handler execution while WebGL/parallax/hover remain live | Re-run after overlay or sandbox changes. |
| IMP-014 | PROVEN | Preview E2E asserts actual iframe `window.innerWidth`, breakpoint behavior, and live interactions | Re-run after responsive-layout changes. |
| IMP-015 | PROVEN | Preview E2E renders the desktop split workbench and measures its iframe, panel, tools, and divider | Re-run after split-layout changes. |
| IMP-016 | PROVEN | Preview E2E drags the divider in both directions across standard and wide workspaces and checks ARIA values | Re-run after divider behavior changes. |
| IMP-017 | PROVEN | Preview E2E asserts iframe `window.innerWidth` equals rendered width across six boundary cases | Re-run after split-layout changes. |
| IMP-018 | PROVEN | Preview E2E crosses exact 479/480 and 767/768 boundaries with visible stable labels | Re-run after breakpoint-token changes. |
| IMP-019 | PROVEN | Preview E2E reloads after divider release and asserts retained width/size | Re-run after persistence-key changes. |
| IMP-020 | PROVEN | Preview E2E exercises expanded, collapsed, reopened, and reloaded state | Normal-size transition remains covered by state tests. |
| IMP-021 | PROVEN | Preview E2E exercises named collapse/reopen controls, keyboard divider resizing, focus, and the collapsed grab-tab label | Re-run after rail accessibility changes. |
| IMP-022 | PROVEN | Preview E2E measures a near-full-workspace iframe while collapsed | Re-run after rail width changes. |
| IMP-023 | PROVEN | Workbench registry plus preview/token-motion E2Es cover Selection, Text, Assets, Research, Tokens, and Motion targeting | Re-run after adding or removing a tool. |
| IMP-024 | PARTIAL | `parseWorkbenchState` and local persistence tests | E2E proves per-project/session persistence and selected-element targeting. |
| IMP-025 | PARTIAL | Component implementation only | Rendered empty, loading, error, and unsupported states for every tool. |
| IMP-026 | PARTIAL | Tool registry implementation only | Document and test overflow/scaling behavior with more tools than the rail viewport. |
| IMP-027 | PROVEN | Preview and token/motion E2Es verify small-screen focus, one-column controls, fixed panel bounds, breakpoint labels, and 44px targets | Re-run after small-screen workbench changes. |
| IMP-028 | PROVEN | Intake E2E renders `Design Research`, its controls, rationale, disabled states, and explicit paid-fallback consent | Re-run after research intake copy or consent changes. |
| IMP-029 | PARTIAL | `src/lib/pipelineEvidence.test.ts`; `src/app/page.tsx` | Render and submit research configuration through a real local run. |
| IMP-030 | PARTIAL | `src/app/api/uploads/route.test.ts` direct bounded-upload coverage | `npm run test:e2e:intake` plus a real authorized upload of each supported kind. |
| IMP-031 | PARTIAL | Upload validation tests and intake policy UI | Browser proof of types, limits, extraction, privacy, and every failure state. |
| IMP-032 | PARTIAL | `src/lib/pipelineEvidence.test.ts`; intake page target controls | `npm run test:e2e:intake` checks Website, Web app, and iOS app. |
| IMP-033 | PARTIAL | `researchCriteriaForTarget` and `decorateTargetMarkup` tests in `src/lib/pipelineEvidence.test.ts` | Three persisted runs show target-specific criteria, contract, and generated output. |
| IMP-034 | PARTIAL | Separation test in `src/lib/contracts.test.ts` | Persisted evidence workspace and UI must display competitor research as non-reference material. |
| IMP-035 | PARTIAL | Contract/pipeline evidence implementation | Live fixture with category, geography, buyer, positioning, and maturity evidence. |
| IMP-036 | PARTIAL | Ledger derivation test in `src/lib/evidence.test.ts` | A saved project ledger with selected competitors, rationales, findings, permitted media, links, and confidence. |
| IMP-037 | PARTIAL | Fact/inference assertions in `src/lib/evidence.test.ts` | Independent review of a live competitor artifact for unsupported/generic claims. |
| IMP-038 | PARTIAL | Refero evidence contracts; `src/lib/pipelineEvidence.test.ts` | Authenticated Refero run covering all required query inputs. |
| IMP-039 | PARTIAL | Reference-lock/ledger tests in `src/lib/evidence.test.ts` | Human review of a live Refero record: reusable patterns and a rationale per reference, without copying. |
| IMP-040 | PARTIAL | `src/lib/contracts.test.ts` and `src/lib/evidence.test.ts` separation checks | Rendered evidence-workspace proof of separate workflow and presentation. |
| IMP-041 | PROVEN | `docs/verification/live-crawl4ai-2026-08-14.json` retains URL, timestamp, HTTP result, bytes, and SHA-256 from the canonical local wrapper | Repeat if the wrapper/version changes. |
| IMP-042 | PARTIAL | `src/lib/tools/crawl.test.ts` provider fallback seams | Integration test using both provider implementations behind the same interface. |
| IMP-043 | PARTIAL | `src/lib/tools/crawl.test.ts` ERR-only fallback and consent checks | Live approved fallback run for each allowed reason, with provenance. |
| IMP-044 | PROVEN | Intake E2E verifies explicit paid consent; live fallback record shows consent and local failure before Firecrawl | Re-run after consent or provider routing changes. |
| IMP-045 | PROVEN | Both retained live crawl records include provider, reason, URL, timestamp, confidence, bytes, and body hash | Repeat if provenance schema changes. |
| IMP-046 | PARTIAL | Pipeline/evidence contracts | User-visible run timeline/workspace proof for research and fallback decisions. |
| IMP-047 | PARTIAL | `src/lib/evidence.test.ts` contract rendering; `src/lib/runstate.test.ts` gate order | Complete a persisted project through approved design contract before build. |
| IMP-048 | PARTIAL | Token/ledger fixtures in `src/lib/evidence.test.ts` | Approved project evidence capturing every named design dimension from live/approved findings. |
| IMP-049 | PARTIAL | Fact/inference labels in `src/lib/evidence.test.ts` | Workspace UI and export proof for source, decision, inference, and recommendation labels. |
| IMP-050 | PARTIAL | Tailwind v4 compile test in `src/lib/evidence.test.ts` | Generated-site smoke and export inspection from an approved project. |
| IMP-051 | PARTIAL | Token inventory categories in `src/lib/evidence.test.ts` | Full generated contract proves all required named token families and states. |
| IMP-052 | PARTIAL | Semantic-inventory assertions in `src/lib/evidence.test.ts` | Review a project token inventory for no literal/visual naming exceptions. |
| IMP-053 | PARTIAL | Tailwind responsive-rule artifact generation | Three-width generated project with component variants and responsive tokens. |
| IMP-054 | PARTIAL | `buildVisualQa` and reduced-motion checks in `src/lib/evidence.test.ts` | Rendered contrast and reduced-motion gate results for generated project. |
| IMP-055 | PARTIAL | Token-drift smoke implementation referenced by `WAVE-NOTES-buildgate.md` | Current `npm run test:smoke` plus source audit of a generated project for justified exceptions. |
| IMP-056 | MISSING | No located sampled-value promotion decision artifact | Add a reviewed evidence-to-token promotion record and its test. |
| IMP-057 | PARTIAL | Builder/gate implementation and smoke note only | Reference-fidelity review against approved source evidence with maintainability token report. |
| IMP-058 | PROVEN | Token/motion E2E previews, applies, persists, reloads, and reverts a semantic token against the local app | Re-run after token editing changes. |
| IMP-059 | PROVEN | Token/motion E2E requires visible usage scope and affected elements before apply | Re-run after token scope presentation changes. |
| IMP-060 | PARTIAL | Tailwind v4 export test in `src/lib/evidence.test.ts` | Export a project CSS artifact and load it outside One-Box. |
| IMP-061 | PROVEN | `src/lib/runstate.test.ts` required transition-order assertion, passing `npm test` | Independent verifier reruns focused transition test after remediation lands. |
| IMP-062 | PARTIAL | Evidence route/export tests; `src/components/EvidenceWorkspace.test.tsx` | Browser flow through preview, approve, revise, export, and reload for each artifact. |
| IMP-063 | PROVEN | `src/lib/runstate.test.ts` blocks build until CSS architecture approval, passing `npm test` | Independent verifier reruns focused authorization test after remediation lands. |
| IMP-064 | PARTIAL | CSS architecture artifact derivation in `src/lib/evidence.test.ts` | Saved project CSS map with global/page/component scopes and justified exceptions. |
| IMP-065 | PROVEN | Token/motion E2E selects an element and exposes its motion configuration in context | Re-run after motion targeting changes. |
| IMP-066 | PARTIAL | Supported kinds asserted in `src/lib/siteMotion.test.ts` | Rendered run exercises every kind, including timeline behavior. |
| IMP-067 | PARTIAL | Motion draft schema assertions in `src/lib/siteMotion.test.ts` | Browser configuration proof for all listed values and replay behavior. |
| IMP-068 | PROVEN | Token/motion E2E proves contextual preview, reset, apply, reload, remove, and revert | Re-run after motion history changes. |
| IMP-069 | PROVEN | `src/lib/siteMotion.test.ts` rejects selector/code/unknown properties; motion route rejects JavaScript, passing `npm test` | Independent verifier reruns focused schema/route tests. |
| IMP-070 | PARTIAL | View/Edit mode and motion implementation | E2E at all breakpoints in both modes. |
| IMP-071 | PROVEN | Motion E2E verifies initial reduced motion plus live preference changes without transforms or active motion markers | Re-run after reduced-motion handling changes. |
| IMP-072 | PROVEN | Motion and token/motion E2Es verify resize deduplication, reload persistence, reset, remove, revert, and runtime cleanup | Re-run after motion lifecycle changes. |
| IMP-073 | PARTIAL | WebGL target safety in `src/lib/siteMotion.test.ts` | Render a WebGL/parallax fixture before and after motion changes at three widths. |

## Saved evidence and artifact criteria

| ID | Status | Authoritative evidence | Exact remaining proof |
|---|---|---|---|
| ART-001 | PROVEN | Plan's dated branch-specific current-state record | Independent verifier compares current branch/worktree to the record before handoff. |
| ART-002 | PARTIAL | This plan describes the major surfaces | Produce a dedicated UX/technical design artifact covering every required surface. |
| ART-003 | PROVEN | Dependency-ordered slices, ownership, tests, and rollback in this plan | Independent verifier checks each nontrivial landed change against its slice. |
| ART-004 | PROVEN | This exhaustive matrix | Run all exact remaining rendered/live checks and update rows only with direct results. |
| ART-005 | PARTIAL | Evidence workflow persistence tests in `src/lib/runstate.test.ts` | Create and view a complete evidence workspace for a real project before build. |
| ART-006 | PARTIAL | Ledger lineage tests in `src/lib/evidence.test.ts` | Persist and render Refero results, links, evidence media, rationales, and all required findings. |
| ART-007 | PARTIAL | Fact/inference assertions in `src/lib/evidence.test.ts` | User-visible workspace/export proof of all three labels. |
| ART-008 | PARTIAL | `buildDesignResearchLedger` tests | Complete real design ledger with links/media/confidence. |
| ART-009 | PARTIAL | Contract rendering/lint tests in `src/lib/evidence.test.ts` | Save and approve a project design contract. |
| ART-010 | PARTIAL | Token-inventory derivation tests | Save a project token inventory with source and editability. |
| ART-011 | PARTIAL | Tailwind-plan derivation tests | Save a project plan with mappings, rationales, variants, and responsive rules. |
| ART-012 | PARTIAL | CSS-architecture derivation tests | Save project hierarchy, usage/scope maps, CSS, and exceptions. |
| ART-013 | PARTIAL | Tailwind/CSS artifact derivation tests | Persist and view the architecture map in a complete project. |
| ART-014 | PARTIAL | Visual-QA derivation tests include widths/focus/reduced motion | Save actual desktop/tablet/mobile/hover/focus/color-scheme/reduced-motion evidence. |
| ART-015 | PARTIAL | Evidence route export/revision tests; workspace preview test | Browser proof of preview, approval, revision, export, and durable attachment across all artifact types. |

## Experiment and benchmark criteria

| ID | Status | Authoritative evidence | Exact remaining proof |
|---|---|---|---|
| EXP-001 | BLOCKED | `docs/eval/baseline/comparison-status.md` records no controlled run | Unlock approved lanes and run the frozen baseline before any broad pipeline change. |
| EXP-002 | BLOCKED | Frozen `docs/eval/baseline/brief-v1.json` and harness contract | Produce complete Path A and direct Refero Path B outputs from identical bytes. |
| EXP-003 | BLOCKED | Frozen rubric/contract define controls | Verify both completed provenance sets against the harness. |
| EXP-004 | BLOCKED | `docs/eval/baseline/harness.md` defines required provenance | Save every required producer record and artifact for both paths. |
| EXP-005 | BLOCKED | `docs/eval/baseline/rubric-v1.md` defines comparison dimensions | Blind-score the two complete paths against every required dimension. |
| EXP-006 | BLOCKED | Harness requires blind independent scoring; no scores exist | Obtain two independent blinded evaluations and unblind only after completion. |
| EXP-007 | PARTIAL | `docs/eval/baseline/root-cause-log.md` lists candidate causes | Complete comparison and assign evidence-backed root-cause findings. |
| EXP-008 | PARTIAL | Frozen rubric specifies finding fields | Publish independent audit findings with severity, evidence, stage, certainty, and smallest experiment. |
| EXP-009 | BLOCKED | Rubric defines dimensions but no new controlled audit exists | Execute and retain the complete independent quality audit. |
| EXP-010 | PARTIAL | Root-cause log defers revision until evidence | After a completed audit, either evidence-gate a minimal proposal or retain an explicit no-change decision. |
| BEN-001 | PROVEN | Pre-registered blinded rubric in `docs/eval/model-routing/benchmark-plan.md` | Preserve rubric bytes when opening a benchmark round. |
| BEN-002 | PROVEN | Benchmark blinding and independent-evaluator protocol | Execute a round with at least two independent evaluator families. |
| BEN-003 | BLOCKED | Grok 4.6 is a candidate in plan/matrix; authenticated quality run pending | Run registered Grok 4.6 technical fixture; score blind and record measured result. |
| BEN-004 | PARTIAL | Candidate/task coverage is registered in benchmark plan | Execute the complete registered task set for every selected candidate. |
| BEN-005 | PARTIAL | Measurement fields are pre-registered in benchmark plan | Collect all measurements from completed blinded rounds. |
| BEN-006 | PARTIAL | Ten representative fixtures are listed in benchmark plan | Create/version and execute each fixture. |
| BEN-007 | PROVEN | `docs/eval/model-routing/benchmark-plan.md` fixes inputs, rubric, assignments, thresholds | Independent verifier checks a round manifest against the plan before producers run. |
| BEN-008 | PROVEN | `docs/eval/model-routing/task-model-matrix.md` reports all fields and marks unmeasured data honestly | Replace provisional rows only with completed blinded measurements. |
| BEN-009 | PROVEN | `docs/eval/model-routing/policy.md` defines default/fast/escalation/reviewer per stage | Enforce policy through a completed benchmark change gate before changing routes. |
| BEN-010 | PROVEN | Policy retry, budget, human-review, and change-control sections | Test the policy's stop/escalation records in a benchmark round. |
| BEN-011 | PROVEN | Policy availability-fallback section | Exercise unavailable/slow/failing lane records without silent substitution. |
| BEN-012 | PROVEN | Benchmark thresholds and policy prohibit unsupported downgrade | Demonstrate same-standard cheaper-lane result before any actual downgrade. |
| BEN-013 | PROVEN | `docs/eval/model-routing/decision-log.md` separates confirmed results, hypotheses, and required data | Update only with new measured evidence and preserve category separation. |

## Release boundary

No row in **PARTIAL**, **BLOCKED**, or **MISSING** can support a release claim.
The remaining live journey requires manual evidence approvals. The baseline also
requires Devin-controlled Refero OAuth, ZS Vault/OpenRouter access,
and independent blinded evaluation. The independent verifier owns the final
row-by-row re-read; implementation owners must not self-certify their active
remediation.
