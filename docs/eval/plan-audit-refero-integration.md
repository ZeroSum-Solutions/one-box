<!--
provenance: GPT-5.6 Sol adversarial audit via codex exec (read-only, effort=high), 2026-08-15.
subject: docs/plans/2026-08-15-refero-selection-editor-agent.md (commit 62ac121).
requested by Devin: "use GPT-5.6 Sol as an adversary and actually look at the code inside of the project."
-->

# Plan audit — refero selection tool + editor agent

Overall: **UNSOUND.** The plan contains a defensible disposable picker study and a useful editor prompt fix, but wraps them in a state-machine change that breaks existing and non-gated runs, misreads the prior ordering audit, understates costs, lacks the instrumentation it claims already exists, and substitutes an edit veto for the requested editor agent.

## Verdict per attack surface (A–G)

### A. Ordering decision — UNSOUND

Strongest counterargument: owner preference and consent are legitimate product outcomes separate from generated-site quality. A small usability probe can therefore precede renderer expressivity.

Does it survive? **Only for a disposable, non-production probe.** The prior audit did not authorize this implementation. It said “build,” not “ship,” a disposable picker at step 7—after repairing the renderer, defining an executable contract, producing client-content directions, and grading them in steps 3–6. It also required pre-vetted client-content thumbnails, not raw Refero screenshots ([prior audit](/Users/zero-suminc./projects/one-box/docs/eval/plan-audit-selection-first.md:114)).

Calling the renderer work “parallel” is also inaccurate: it is uncommissioned and left as founder question 7. The actual dependency graph is picker now, renderer perhaps later.

The disclosure line is truthful but cosmetic as a mitigation. It does not test whether users understand that the professional screenshot’s composition will not carry over. Visual anchoring remains the dominant signal. “Subordinate screenshot” and mandatory copy need a comprehension test, not an assertion.

### B. Gating mechanics — UNSOUND

Strongest counterargument: `advanceEvidenceWorkflow()` only requires the requested stage to be the immediate successor of the current stage, so a run can theoretically begin at index 1.

Does it survive? **No.** That reading isolates one function and ignores the schema that must parse the run before the function executes. `EvidenceWorkflowStateSchema.superRefine` walks every stage before `currentStage` and requires its artifact to be approved ([contracts.ts](/Users/zero-suminc./projects/one-box/src/lib/contracts.ts:652)). After prepending `"reference"`, a run starting at `"evidence"` without an approved reference artifact is invalid.

Consequences:

- New non-gated runs starting at `"evidence"` fail `RunStateSchema.parse`.
- Legacy runs whose missing workflow receives the default `"evidence"` state also fail.
- Existing v2 runs at any later stage fail unless migrated.
- `loadRun()` performs a strict parse with no migration layer ([runstate.ts](/Users/zero-suminc./projects/one-box/src/lib/runstate.ts:195)).

This is not hypothetical. The checkout contains a v2 run at `build` with six artifacts and no reference-selection artifact ([run.json](/Users/zero-suminc./projects/one-box/sites/pKrNnpmPGX6y/run.json:1)), plus one at `evidence` with a ledger draft ([run.json](/Users/zero-suminc./projects/one-box/sites/IrWQ-PJctPOZ/run.json:1)). Both become unreadable.

The proposed creation timing is also false. `createRun()` executes before intake is parsed or persisted, and its options do not include `referenceMode` or research configuration ([runstate.ts](/Users/zero-suminc./projects/one-box/src/lib/runstate.ts:143), [chat route](/Users/zero-suminc./projects/one-box/src/app/api/chat/route.ts:159)).

### C. Contracts — UNSOUND

Strongest counterargument: the current discriminated unions and optional transition metadata are extensible, so the proposed schemas can be added without changing existing artifact payloads.

Does it survive? **Structurally, yes; semantically, no.** Missing invariants include:

- Exactly one candidate must be recommended.
- Candidate IDs must be unique.
- The approved `selectedId` must name a candidate in that exact artifact version.
- `selectionKind` must agree with the candidate’s `recommended` value.
- `referenceSelection` must appear only on approval of a `reference-selection` artifact—not on arbitrary transitions.
- The direct click must obey the current `draft → in-review → approved` state machine; `draft → approved` is illegal.
- URLs, screenshot paths, labels, `bestFor`, and `headsUp` need bounded and safe validation.
- Reroll exclusions and cross-version uniqueness need invariants.
- `workflowArtifactSource()` and `draftSource()` need an explicit decision about whether the ledger references the selected artifact version.
- The digest needs a design-contract version/hash. Otherwise a revised contract can coexist with a stale v1 digest.

Prepending the stage also affects exact-array tests, pipeline fixtures, E2E fixtures, the baseline adapter, API hardcoded maps, UI switches, builder authorization, and every run fixture at `evidence` or `build`. The plan names only part of that blast radius.

### D. Measurement designs — UNSOUND

Strongest counterargument: because Devin is judge of record, small samples can guide a formative product decision without pretending to estimate a population effect.

Does it survive? **Yes, if explicitly labeled formative.** It does not support the proposed default-on decision or any generalized quality conclusion.

The plan also falsely says the necessary data already persists. A paused `PipelineEvent` has no timestamp, and the event logger adds none ([contracts.ts](/Users/zero-suminc./projects/one-box/src/lib/contracts.ts:1026), [pipeline.ts](/Users/zero-suminc./projects/one-box/src/lib/pipeline.ts:567)). Decision time therefore cannot be calculated as proposed. “Abandonment” has no defined event or observation window.

Other defects:

- N=6–8 and N=8–10 have no pre-registered thresholds, repetitions, order randomization, or uncertainty bounds.
- “Deliberately pick a different candidate” tests token sensitivity, not natural owner preference.
- One advisory model grader is not independent replication.
- The presentation rubric grades whole-site craft; it is poorly matched to edit refusals, false positives, state cleanliness, and usefulness ([rubric](/Users/zero-suminc./projects/one-box/docs/eval/presentation-rubric.md:193)).
- With 0 abandonments in 10 sessions, the approximate 95% upper bound remains around 28%; that is not evidence of low friction.

A minimal honest design would call the first 8–10 sessions a usability/comprehension pilot, instrument them explicitly, and use deterministic acceptance thresholds. Site-quality inference waits for the expressive renderer.

### E. Editor-agent scope cut — UNSOUND

Strongest counterargument: forwarding roles and adding guarded results repairs a real deficiency in the existing edit route with much less surface than a new planner.

Does it survive? **As maintenance work only.** It does not deliver “an agent in the editor I can ask how do I make my pricing section better.”

The current UI requires selecting an element and submits a persistent mutation instruction ([Workbench.tsx](/Users/zero-suminc./projects/one-box/src/components/preview/Workbench.tsx:253), [preview page](/Users/zero-suminc./projects/one-box/src/app/preview/[id]/page.tsx:407)). The surviving guardian neither converses, researches pricing patterns, explains options, nor plans page-wide changes. It applies, redirects, or refuses one selected-element mutation.

It is not a real enforcement boundary either. The same builder model proposes the HTML and judges whether its proposal is acceptable. `GuardedEditResultSchema` validates only the self-reported decision shape, not style-role compliance.

The proposed no-mutation refusal path also does not fit current control flow. Model generation occurs inside `applyElementHtmlEdit()`, after the guarded mutation has taken snapshots and acquired site authority; a refusal currently becomes a no-change error followed by restorative gate work ([elementEditor.ts](/Users/zero-suminc./projects/one-box/src/lib/elementEditor.ts:370), [siteMutation.ts](/Users/zero-suminc./projects/one-box/src/lib/siteMutation.ts:106)). Avoiding that requires a concurrency-safe preflight/refactor, not a schema replacement.

### F. Budget accounting and caching — UNSOUND

Strongest counterargument: Refero supports `style_ids` batches of up to ten, and a durable cache can reduce repeated detail calls ([Refero research](/Users/zero-suminc./projects/one-box/docs/refero-mcp-research.md:22)).

Does it survive? **The vendor capability survives. The accounting does not.**

- The current wrapper accepts only one `styleId` and sends `style_id`, not `style_ids` ([refero.ts](/Users/zero-suminc./projects/one-box/src/lib/tools/refero.ts:377)).
- A singular `getStyleCached(id)` conflicts with candidate generation’s batched API unless partial-hit coalescing and batch-response mapping are designed.
- Baseline accounting omits up to two `getScreenImage` calls ([pipeline.ts](/Users/zero-suminc./projects/one-box/src/lib/pipeline.ts:1396)). Cold baseline is up to **8–10**, not 6–8.
- Two rerolls raise the worst case to roughly **24–30** Refero calls before retries.
- At 8–10 calls/run, 8,000 calls supports 800–1,000 runs—not “1,000+”; rerolls and failures lower it further.
- An atomic JSON write alone does not prevent lost read-modify-write updates. Current searches run concurrently, and this repository already documents why cross-process locking is necessary for counters ([runstate.ts](/Users/zero-suminc./projects/one-box/src/lib/runstate.ts:292)).
- The proposed ledger counts but does not actually reserve or reject calls at the cap.
- A checkout-local `.one-box` ledger cannot enforce an account-wide limit across worktrees or other callers.

### G. Other issues — UNSOUND

Strongest counterargument: caps, a cheap translation model, a denylist, and a feature flag are reasonable Phase-1 simplifications.

Does it survive? **Only as ideas requiring real contracts.**

- `MODELS.bulk` is currently a DeepSeek thrift/classification lane ([contracts.ts](/Users/zero-suminc./projects/one-box/src/lib/contracts.ts:1082)). Using it for user-facing descriptions and possibly the recommendation is unbenchmarked and conflicts with the repository’s rule against downgrading a task on intuition alone.
- The plan never says who sets `recommended`; nevertheless the UI and `selectionKind` require exactly one.
- A five-term jargon denylist cannot enforce plain language. It misses “semantic role,” “design system,” “component recipe,” “surface hierarchy,” and countless equivalents, while offering no behavior after the one regeneration also fails.
- Reroll enforcement is described as UI behavior, not an idempotent server reservation. Double submission can spend twice and exceed the cap.
- Candidate relevance, duplicate results, insufficient unique results, inaccessible images, content safety, and screenshot-display rights are unresolved.
- A feature flag must be persisted per run. Changing an environment flag between creation and resume cannot be allowed to change workflow semantics.
- A digest generated from contract v1 becomes stale when the contract is revised.
- Raising a blind character slice from 14k to 24k is not “zero risk.” It increases model cost and still produces truncated JSON. A validated projection of required fields is the correct fix.
- Phase-1 task 6 is claimed to be unused, but changing the shared stage enumeration immediately affects parsing and run creation.
- The extra orchestrator call is not “latency invisible”: it occurs before the contract pause is emitted and adds model cost and wait time.

## Code-claim verification table

| Claim | File:line | Result |
|---|---|---|
| `stageLock` runs before the evidence-workflow branch | [pipeline.ts:709](/Users/zero-suminc./projects/one-box/src/lib/pipeline.ts:709) | **Verified true** |
| Disabled research returns a lock without Refero calls | [pipeline.ts:1244](/Users/zero-suminc./projects/one-box/src/lib/pipeline.ts:1244) | **Verified true** |
| Both primary records are sliced at 14,000 characters | [pipeline.ts:1762](/Users/zero-suminc./projects/one-box/src/lib/pipeline.ts:1762), [pipeline.ts:1807](/Users/zero-suminc./projects/one-box/src/lib/pipeline.ts:1807) | **Verified true** |
| Existing evidence stages and artifact map have six entries | [contracts.ts:342](/Users/zero-suminc./projects/one-box/src/lib/contracts.ts:342), [contracts.ts:488](/Users/zero-suminc./projects/one-box/src/lib/contracts.ts:488) | **Verified true** |
| Existing `ReferenceLockSchema` can hold a fixed primary | [contracts.ts:836](/Users/zero-suminc./projects/one-box/src/lib/contracts.ts:836) | **Verified true**, but it does not prove the primary belonged to the approved selection |
| Color roles and forbidden contexts exist | [contracts.ts:876](/Users/zero-suminc./projects/one-box/src/lib/contracts.ts:876) | **Verified true** |
| `/api/edit` drops roles and sends only color variable names | [edit route:129](/Users/zero-suminc./projects/one-box/src/app/api/edit/route.ts:129) | **Verified true** |
| Refero counter is in-memory and increments per invocation | [refero.ts:139](/Users/zero-suminc./projects/one-box/src/lib/tools/refero.ts:139), [refero.ts:181](/Users/zero-suminc./projects/one-box/src/lib/tools/refero.ts:181) | **Verified true** |
| Builder copies `site.css` byte-for-byte | [builder.ts:112](/Users/zero-suminc./projects/one-box/src/lib/builder.ts:112) | **Verified true** |
| Starting at workflow index 1 needs no special handling | [runstate.ts:716](/Users/zero-suminc./projects/one-box/src/lib/runstate.ts:716), [contracts.ts:652](/Users/zero-suminc./projects/one-box/src/lib/contracts.ts:652) | **False globally**; transition logic tolerates it, schema validation does not |
| Intake and mode are known at run creation | [runstate.ts:154](/Users/zero-suminc./projects/one-box/src/lib/runstate.ts:154), [chat route:159](/Users/zero-suminc./projects/one-box/src/app/api/chat/route.ts:159) | **False** |
| Existing `getStyle` already supports batching | [refero.ts:377](/Users/zero-suminc./projects/one-box/src/lib/tools/refero.ts:377) | **False**; the MCP supports batching, the wrapper does not |
| Cold Refero baseline is 6–8 calls | [pipeline.ts:1319](/Users/zero-suminc./projects/one-box/src/lib/pipeline.ts:1319), [pipeline.ts:1350](/Users/zero-suminc./projects/one-box/src/lib/pipeline.ts:1350), [pipeline.ts:1396](/Users/zero-suminc./projects/one-box/src/lib/pipeline.ts:1396) | **False**; screen-image calls make it up to 8–10 |
| Picker timing data already persists | [contracts.ts:1026](/Users/zero-suminc./projects/one-box/src/lib/contracts.ts:1026), [runstate.ts:250](/Users/zero-suminc./projects/one-box/src/lib/runstate.ts:250) | **False**; pause events have no timestamp |
| Prior audit step 7 licenses integrated picker-first shipping | [prior audit:114](/Users/zero-suminc./projects/one-box/docs/eval/plan-audit-selection-first.md:114) | **Misleading/misquoted** |
| Layout-IR retained a broken hero after four iterations | [FINDINGS.md:30](/Users/zero-suminc./projects/one-box/spikes/layout-ir/FINDINGS.md:30) | **Verified true** |
| A refusal can return before `applyElementHtmlEdit` without architectural work | [edit route:55](/Users/zero-suminc./projects/one-box/src/app/api/edit/route.ts:55), [elementEditor.ts:370](/Users/zero-suminc./projects/one-box/src/lib/elementEditor.ts:370) | **False under current control flow** |

## The strongest case against shipping this plan

The plan converts a valid product preference—letting owners express taste—into a durable production gate before the renderer can honor the most salient part of that choice, then calls a disclosure line sufficient protection without measuring comprehension. At the same time, it replaces the requested advisory editor agent with a self-policing single-element mutation model, installs a globally breaking stage-order change without migration, and justifies rollout using measurements the system does not record and a site-wide rubric unsuited to guardian behavior. The probable outcome is broken resume compatibility, higher-than-stated Refero spend, users anchored to reference compositions they will not receive, and Phase-1 evidence incapable of answering either the quality or editor-agent question.

## Ranked issues

1. **BLOCKER — workflow compatibility.**  
   Failure: deploying the prepended stage makes old, legacy-default, and non-gated run states fail parsing.  
   Minimal fix: do not modify the v2 global stage array. Add a versioned v3 pre-evidence gate or a separate optional reference-selection state, with explicit migration tests.

2. **BLOCKER — dishonest ordering rationale.**  
   Failure: an integrated picker ships while the supposedly parallel renderer track remains optional and uncommissioned.  
   Minimal fix: keep Phase 1 as an isolated disposable preference/comprehension probe, or commission and gate the renderer track before production integration.

3. **BLOCKER — editor deliverable substitution.**  
   Failure: “How can I improve this pricing section?” reaches a selected-element apply/refuse endpoint, not an advice/planning agent.  
   Minimal fix: rename the guardian as an edit guardrail and separately specify the requested read-only conversational planner.

4. **HIGH — guardian is not enforcement.**  
   Failure: the same model self-declares compliance; refusal still enters the guarded mutation transaction; redirects can apply an unrequested alternative.  
   Minimal fix: introduce deterministic HTML/postcondition checks and a concurrency-safe analyze-then-apply protocol. Require confirmation before redirected mutations.

5. **HIGH — incomplete selection invariants.**  
   Failure: multiple recommendations, foreign selected IDs, invalid transition metadata, duplicate candidates, or unsafe URLs can parse.  
   Minimal fix: add cross-object refinements and server-side atomic selection transitions tied to an exact artifact version.

6. **HIGH — materially false budget model.**  
   Failure: image calls and rerolls consume 2–4× the stated allowance while concurrent ledger writes lose increments.  
   Minimal fix: account for every invocation, reserve under a cross-process/account-wide lock, enforce the cap, and design batch-cache partial hits.

7. **HIGH — measurement theater.**  
   Failure: default-on decisions are made from tiny uninstrumented samples and an irrelevant rubric.  
   Minimal fix: add explicit events, definitions, thresholds, blinding/order rules, and task-specific metrics; label the first sample formative.

8. **MEDIUM — stale/unsafe generated guidance.**  
   Failure: unbenchmarked bulk copy leaks jargon or unsupported claims; a contract revision leaves the digest stale; rerolls spend on duplicates.  
   Minimal fix: version digests to approved contracts, benchmark or template the user-facing copy, sanitize every field, and make rerolls idempotent with duplicate recovery.

## What I would change before Phase 1 starts

1. Recast the picker as a disposable, isolated preference-and-comprehension probe; do not add it to the production evidence workflow yet.
2. Commission the renderer/`ReferenceContract` work with an owner, timeline, and promotion bar—or stop calling it parallel.
3. Preserve `evidence-gated-v2`; design a v3 or separate optional pre-gate with explicit migration and resume fixtures for every persisted-run shape.
4. Add complete selection invariants: unique candidates, exactly one recommendation, safe URLs/paths, selected-ID membership, version-bound transitions, and atomic rerolls.
5. Replace the Refero estimate with an enforced account-scoped reservation ledger that includes screen-image calls, concurrency, retries, partial batch-cache hits, and rerolls.
6. Separate the role-forwarding maintenance fix from the editor-agent deliverable. Specify the actual advice-only pricing/section planner before claiming the founder’s request is addressed.
7. Replace blind 24k truncation with a validated projection of the exact Refero fields consumed; version the digest against the approved contract.
8. Pre-register two fit-for-purpose evaluations: real-owner picker comprehension/usability, and guardian false-positive/false-negative/state-cleanliness tests. Reserve the presentation rubric for rendered-site quality.

## Ship / hold recommendation

**VERDICT: FAIL — HOLD Phase 1 as written.**

The color-role forwarding fix is worth preserving as a narrow maintenance change, and a structured primary-record projection is justified. Do not begin the stage prepend, picker integration, guardian rollout, budget-ledger claim, or default-on measurement until the plan is rewritten around migration-safe workflow state, honest instrumentation, and the actual editor-agent requirement.

