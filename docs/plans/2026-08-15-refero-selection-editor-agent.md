<!--
provenance: revision 2, 2026-08-15. Revision 1 (ultracode ideation synthesis, wf_52c4deb2-74a)
was audited by GPT-5.6 Sol (docs/eval/plan-audit-refero-integration.md) — verdict FAIL/HOLD,
2 misquotes and 1 schema-breaking mechanism confirmed against real code. This revision
addresses all 8 of Sol's pre-phase-1 changes and folds in Devin's four decisions
(2026-08-15): build the conversational editor agent now; commission the renderer track now
(Q2 delegated to GPT-5.6 — Sol's answer); accept honest-labeled real-site photos; flag-gated
rollout with a personally-reviewed soak. Devin approved starting this rewrite ("go and start
the rewrite").
post-write verification (wf_58987168-5e9, 2 opus code-grounded verifiers): state scope
UNSOUND→fixed (resume replay-guard blocker, reference-paused event, awaited budget reserve,
ensureRun threading); editor scope SOUND-WITH-FIXES→fixed (classify-then-apply TOCTOU
blocker, editId field name, gate scoped to machine-decidable tags, non-streaming v1).
All 8 findings folded in below. Status: implementing.
-->

# Refero integration — implementation plan (revision 2)

Three deliverables, one commissioned parallel track:

- **A. Reference picker** — the user picks the design direction at a human pause, in plain
  language, with visible palettes. Ships as a *formative pilot*, never as a quality claim.
- **B1. Conversational editor agent** — the "how do I make my pricing section better?"
  assistant inside `/preview/<id>`, grounded in Refero research and the site's locked
  direction. Devin's explicit override: built now, not deferred.
- **B2. Edit guardrail** — deterministic role-compliance checking on the existing edit path
  (renamed from "guardian"; it is a guardrail, not the agent).
- **C. Renderer expressivity track** — commissioned now (Sol's answer to Q2), so the pick
  can eventually change composition, not just tokens.

## How Sol's eight pre-phase-1 changes are addressed

| # | Sol's demand | Where this plan answers it |
|---|---|---|
| 1 | Picker as isolated probe, not a production workflow edit | §A: sibling `referenceSelection` state; `EVIDENCE_WORKFLOW_STAGES` is untouched; per-run persisted flag; formative-pilot framing |
| 2 | Commission the renderer track or stop calling it parallel | §C: commissioned, owner + first gate + promotion bar |
| 3 | Migration-safe workflow state | §A architecture: optional sibling field — old/new/non-gated runs parse unchanged; explicit fixture tests for every persisted run shape |
| 4 | Complete selection invariants | §A contracts: exactly-one-recommended, unique ids, selectedId membership, version-bound transitions, safe URLs, server-side reroll reservation |
| 5 | Enforced account-scoped Refero reservation ledger | §Budget: ledger (shipped, race-fixed) grows enforcement — image calls counted, cap rejection, lockfile serialization |
| 6 | Separate the maintenance fix from the editor deliverable; specify the real agent | §B1 is the requested agent, specified; §B2 is the renamed guardrail; the role-forwarding fix already shipped as plain maintenance (`9624a6b`) |
| 7 | Replace blind truncation with validated projection | §B2 Task 1: `ReferoStyleProjection` schema; the 24k helper (shipped) remains only as fallback |
| 8 | Pre-registered, fit-for-purpose evaluations | §Measurement: comprehension/usability pilot with explicit instrumentation + thresholds; guardrail false-positive/negative fixtures; presentation rubric reserved for rendered sites |

## Decisions locked by Devin (2026-08-15)

1. Conversational editor agent: **build now**, alongside the guardrail. Not gated on B2 data.
2. Renderer track: **commission now** (per Sol, as delegated).
3. Candidate cards use **honest-labeled real-site photos** (no per-candidate live renders in
   phase 1); the soak adds a comprehension check (Sol's amendment, compatible).
4. Rollout: **flag-gated soak** — Devin personally reviews 8–10 real picker sessions before
   default-on.

---

## A. Reference picker

### Architecture — sibling state, not a stage edit

Sol's blocker was real: prepending to `EVIDENCE_WORKFLOW_STAGES` invalidates every
persisted run against `EvidenceWorkflowStateSchema.superRefine` (contracts.ts:652), and
`loadRun()` strict-parses with no migration layer (runstate.ts:195). So the picker never
touches the stage array. Instead:

```ts
// RunStateSchema gains ONE optional field (absent = today's behavior everywhere):
referenceSelection: ReferenceSelectionStateSchema.optional()
```

- `stageLock` splits as revision 1 proposed (`stageLockCandidates` / `finalizeReferenceLock`,
  today's `stageLock` kept verbatim for non-gated arms), but the gate check happens **where
  stageLock already runs** (pipeline.ts:713) — not at run creation. This also dissolves
  Sol's "intake isn't known at createRun" objection: by the time the pipeline reaches the
  lock, intake and mode are loaded.
- Gated + no approved selection → generate candidates, persist state + artifacts under
  `sites/<runId>/research/refero/`, emit a **new `reference-paused` event variant**, return.
  The existing `paused` event's `workflowStage` is a closed 6-value union
  (contracts.ts:1039-1046) and its only emitter derives UI copy from
  `EVIDENCE_STAGE_ARTIFACT` — reusing it would render "evidence ready for review" for a
  picker pause (verified against src/app/page.tsx:299-306). The new variant carries
  `at`, `workspaceUrl`, and its own note; the client timeline renderer gains a case for it.
- **Resume-guard fix (verifier blocker):** `runPipeline`'s resume short-circuit decides
  "still paused" via `replayedPauseIsCurrent` comparing ONLY
  `evidenceWorkflow.currentStage` (pipeline.ts:345-364, 501-511) — which the sibling state
  never changes, so a post-pick `POST /api/run` would replay the stale pause forever. The
  `ReplayCheckpoint` comparison is extended to include the `referenceSelection` status +
  version: a `reference-paused` event is only "current" while the selection is still
  pending; once a pick is recorded the guard sees the mismatch and re-executes.
- Gated + approved selection → `finalizeReferenceLock` (cached like any stage), continue
  into the untouched evidence workflow.
- The pause/approve/reroll API lives on a new route `POST /api/reference/[id]`
  (actions: `select`, `reroll`) rather than overloading `/api/evidence/[id]`'s
  artifact state machine — the selection has its own, smaller state machine.
- **Flag persisted per run** (Sol G): `referencePickerEnabled: boolean` recorded into run
  state at creation from the env flag; resume semantics can never change mid-run because
  the env var changed. Concretely (verifier): run creation is `ensureRun(runId)`
  (runstate.ts:178-186, sole caller src/app/api/chat/route.ts:160) which takes no options —
  Phase A widens `ensureRun`/`CreateRunOptions` to accept the flag and threads it from the
  chat route, following the existing `pipelineVersion` override pattern.

Migration tests (phase A, non-negotiable): fixture-parse every persisted shape — a v2 run at
`build` with six artifacts, a v2 run at `evidence` with a ledger draft (both shapes exist in
the checkout today), a legacy run with no evidenceWorkflow, and a new gated run mid-pause.

### Contracts and invariants

`CandidateProfileSchema` and palette/profile shapes carry over from revision 1 (plain-language
profile, 2–6 extracted swatches, shallow composition note, `recommended` flag) with Sol's
invariants added as refinements on `ReferenceSelectionStateSchema`:

- exactly one `recommended: true` candidate; `recommendedBy: "advisory-model"` recorded
  (Sol: "who sets recommended" — the model's advisory pick, shown as such);
- candidate `referoId`s unique within a version; reroll versions must not repeat any
  `excludedFromPrior` id;
- `selection.selectedId` must be a member of the *same version's* candidate list
  (version-bound, recorded with `at` timestamp and `selectionKind`);
- `selectionKind` (`user-picked-recommended` | `user-picked-other`) must agree with the
  selected candidate's `recommended` flag;
- `previewImageUrl`/`sourceUrl` validated https + hostname allowlist
  (`refero.design`, `images.refero.design`); screenshot paths run-relative, no traversal;
- all user-facing strings length-bounded; profile text passes the jargon check (below);
- **reroll reservation is server-side**: `rerollsUsed` increments atomically inside the run
  transaction before any Refero call fires; cap 2 (3 total versions); a duplicate submit
  sees the incremented counter and returns the existing in-flight/latest version
  (idempotent), never double-spends.

### Candidate generation

As revision 1 (§candidate generation) with three corrections:

- profile/palette-labeling copy is written by **`MODELS.orchestrator`, not `MODELS.bulk`**
  (Sol G: bulk is the DeepSeek thrift lane; user-facing copy doesn't get downgraded on
  intuition — revisit only with a benchmark);
- `getStyle` grows real batching (`style_ids`, ≤10 per Refero docs) — Sol verified the
  wrapper is single-id today (refero.ts:377); a `getStylesBatch(ids)` wrapper + disk cache
  with **partial-hit coalescing** (cached ids served locally, only misses hit the API);
- candidate relevance floor: if fewer than 2 distinct usable candidates survive shortlisting
  (dead images, duplicate sources, parse failures), the run falls back to today's
  auto-pick with an honest card saying so — never a one-option "choice".

### Plain-language enforcement

The denylist regex stays as a backstop but is not the mechanism (Sol G: a five-term list
can't enforce plain language). The mechanism is layered: (1) the writing prompt (orchestrator
tier) with worked examples; (2) denylist + regeneration once; (3) **the soak itself** — every
profile Devin reviews during the 8–10-session soak is a human audit of the copy, and the
comprehension question (below) measures whether the language worked, which no denylist can.

### UI

As revision 1: swatches + plain-language profile primary, real-site photo smaller and labeled
"a real business site with this feel — inspiration, not a preview of your site", one-click
"use our recommendation", "show me different directions" (server-capped), and the mandatory
disclosure line: *"This choice sets your colors, fonts, and photo style. The page layout
comes from our standard business-website format for now."* Rendered by a new
`ReferenceSelectionPanel` on the existing evidence workspace page, driven by the run's
`referenceSelection` state (not by the artifact switch).

### Measurement — a formative pilot, explicitly

Sol's D verdict accepted in full. This is a usability/comprehension pilot, labeled formative,
never quality evidence.

- **Instrumentation shipped first, not assumed**: `paused`/selection events carry `at`
  timestamps (new fields — Sol verified pause events have none today); selection state
  records shown-at/decided-at; abandonment = no selection within a 7-day observation window.
- **Comprehension check** (Sol A + Devin's photo decision): one question per soak session
  after the pick — *"What will this choice change on your site?"* — recorded free-text into
  the run's research notes. If owners answer "my site will look like that screenshot," the
  anchoring mitigation failed and the photo treatment gets revisited (Devin's standing
  FOUNDER-DECISION from revision 1).
- **Pre-registered formative thresholds** (decided before the soak): ≥8/10 sessions complete
  without help; ≥7/10 comprehension answers name colors/fonts (not layout); decision time
  median under 3 minutes; zero sessions blocked by a technical fault. Meeting them argues
  default-on; missing them names the fix. No site-quality claim either way — that waits for
  track C's renderer (prior audit step 9, quoted correctly this time).
- Paired outside-grader runs are **dropped from phase A** (Sol: token-sensitivity theater on
  the frozen renderer). The quality experiment belongs to track C's promotion bar.

---

## B1. Conversational editor agent (the actual request)

*"We should have an agent in there... if I come down and say, how do I make my pricing
section better, we should be able to use that."* — the deliverable is an **advice-first,
research-grounded conversation** that can hand off to the existing guarded edit path. It is
not an autonomous mutator.

### Shape

- **Thread model**: `sites/<runId>/editor-thread.json` — persisted multi-turn thread
  (role/content/timestamps/suggestion refs), Zod-schema'd in contracts.ts, loaded by the
  Workbench. `ChatComposer` stays the input; a new `assistant` Workbench tool tab renders
  the thread (the existing single-shot edit box remains untouched under the `text` tool).
- **Route**: `POST /api/assistant/[id]` — one turn in, streamed reply out. Read-only with
  respect to the site: the assistant NEVER mutates; it produces suggestions.
- **Grounding, in priority order** (every reply cites what it used, in plain words):
  1. the site itself — served HTML (section inventory by `data-edit-id`), current tokens;
  2. the locked direction — reference lock + style digest (B2 Task 1) for what must not
     break, phrased plainly ("your site keeps its warm cream background and gold buttons");
  3. **Refero screens research** — `searchScreens` (+ new `getSimilarScreens` wrapper) for
     the asked-about section type; thumbnails saved under `research/refero/assistant/` and
     shown in the thread as evidence cards ("here's how three real businesses handle
     pricing"), each with a one-line plain-language takeaway. Budget-disciplined: ≤3 search
     calls + ≤4 thumbnails per user question, ledger-counted, cached per query string.
- **Suggestion handoff**: each concrete suggestion renders as a card with an "apply this"
  button whose handler POSTs `/api/edit` directly with `{ runId, editId, instruction }` —
  `editId` per `EditRequestSchema` (contracts.ts:984-990; verifier: `targetEditId` is a
  different subsystem's field name — the image library's — and must not be borrowed). The
  suggestion's `editId` enum is built from the live site's actual `data-edit-id`s at
  suggestion time (the one strong `editor-coach` idea, kept), so the model structurally
  cannot target a node that doesn't exist. Applying runs the normal `/api/edit` flow:
  guarded mutation, gates, B2 checks. The user clicks; the agent never self-applies.
- **Model routing**: `MODELS.orchestrator` for conversation turns (user-facing prose);
  suggestions that become edit instructions are executed by the existing `MODELS.builder`
  path unchanged.
- **Non-streaming v1** (verifier): replies go through the cost-tracked
  `generateJson`/`generateTextCapped` wrappers, which bill `costCapUsd` automatically. The
  repo's only streaming precedent (`/api/chat`) deliberately bypasses cost tracking, so
  "streamed reply" would need new usage-accounting plumbing — deferred; v1 returns the
  complete turn.
- **Cost**: assistant turns bill the run's existing `costCapUsd` ledger; when the remaining
  budget can't cover a research turn, the agent says so plainly and answers from the site +
  digest alone (degrade, don't fail).

### What B1 explicitly does not do (phase 1)

No page-wide multi-step edit execution (suggest-only; each apply is one guarded edit);
no flows research; no image generation from chat (the existing edit box already covers it);
no cross-run memory.

### B1 measurement (fit-for-purpose, pre-registered)

10 scripted questions against 2 real built sites ("make my pricing section better", "why
does my hero feel empty", ...): grounded-citation rate (every claim traceable to site/digest/
screen evidence — target 100%), suggestion applicability (≥8/10 suggestions applicable via
the handoff without error), zero mutations without a click, thread survives reload. Rubric
grading of the *site* stays out of it (Sol #8).

---

## B2. Edit guardrail (renamed; deterministic where it counts)

Sol's E verdict accepted: a model self-declaring compliance is not enforcement, and the
refusal path can't return "before the mutation" from inside `applyElementHtmlEdit`. Revised:

- **Task 1 — `ReferoStyleProjection` + digest.** Replace blind truncation with a validated
  projection of the exact fields synthesis consumes (colors/roles, typography, spacing,
  surfaces, components, layout, imagery, dos/donts, motion — the live-verified JSON shape in
  docs/refero-mcp-research.md). Projection failure falls back to the shipped 24k helper.
  The digest artifact (revision 1's `ReferenceStyleDigestSchema`, kept) is generated from
  the projection at the contract stage and **versioned against the approved design-contract
  version** (Sol C: a revised contract supersedes its digest; regeneration is part of
  contract approval).
- **Task 2 — deterministic role-compliance gate.** A new blocking gate (joins the existing
  Playwright gate suite, which already computes `getComputedStyle` per element —
  gates.ts:202-247, so computed-style access is real). Verifier correction on scope:
  `role`/`forbidden` are free-text prose today, not machine-decidable. So: (a) the gate's
  v1 enforces what IS mechanical — non-token color/font introduction, tightening today's
  hex-exists-somewhere check; (b) `DesignTokensSchema.colors[]` gains an optional
  structured `forbiddenContexts: enum[]` field (e.g. `"section-background"`, `"body-text"`,
  `"border"`), authored at token-generation time alongside the prose, and the gate enforces
  exactly those structured tags — prose stays for prompts, tags are for enforcement.
  Fixtures: the three code-verified naive-editor failures must be caught via the tags.
- **Task 3 — classify-then-apply refusal (TOCTOU-safe).** Verifier blocker accepted: HTML
  generation must stay inside the site-authority lock, because the lock is what guarantees
  the model sees fresh source (generation-outside-lock = lost-update window against any
  concurrent mutation). Revised shape: a cheap **classify-only preflight** (decision +
  reason + suggested alternative, NO final HTML) runs before the lock — refusals and
  redirect-confirmations return without ever entering the mutation transaction, exactly as
  Sol required. Only the `apply` case proceeds into `applyElementHtmlEdit`, where
  generation re-runs fresh inside the transform as today. Cost: one extra small
  classification call per edit; accepted. Redirects require a user confirmation click
  before applying (Sol #4). The model's self-report is advisory; Task 2's gate is the
  enforcement.
- B2 measurement: false-positive/false-negative fixture suite for the gate (pre-registered:
  0 false blocks on 10 legitimate edits; 3/3 planted violations caught), plus refusal-path
  state-cleanliness (no snapshot, no history entry, no gate run on refusal).

---

## C. Renderer expressivity track (commissioned)

Owner: this engine team (Claude-driven, Devin-gated). Starts now, parallel, no dependency on
A/B1/B2. Blueprint: the `select-contract` proposal's phase-1 scope, per revision 1.

1. **Gate C1 — repair the layout-IR spike**: fix the gutter-editorial hero (unresolved after
   four iterations — FINDINGS.md), re-run the spike's own pre-registered pass criteria.
2. **Gate C2 — `ReferenceContract`**: the executable schema deriving composition constraints
   (section rhythm, surfaces, density, media treatment, motion rules, explicit rejects) from
   a style projection; two hand-picked styles → two contracts → two visibly different
   topologies from the same WITS brief.
3. **Promotion bar**: outside-grader ≥ B on both topologies (presentation rubric — its
   proper job), CSS provenance audit pass, token-drift + contrast gates pass. Clearing the
   bar unlocks the real experiment (prior audit step 9): no-reference vs model-picked vs
   user-picked on the expressive renderer.

Timeline honesty (Sol #2): C1 is genuinely uncertain — the spike broke four times. If C1
misses, the track reports why and re-plans; A/B1/B2 do not slip with it, and nothing in A
claims what only C can prove.

---

## Refero call budget (enforced, honestly counted)

- Cold baseline **8–10 calls/run** (3–5 style searches + 2 screen searches + up to 2 screen
  images + style detail), per Sol's corrected count. Reroll worst case +8–10 each, capped at
  2 → worst-case ~30/run; realistic soak volume is far below the 8k/month cap, and B1 adds
  ≤3 searches + ≤4 thumbnails per question, cached.
- The shipped ledger (`referoBudget.ts`, race-fixed `d92bf54`) grows **enforcement** — and
  this is an explicit reversal of one `d92bf54` trade-off (verifier): enforcement cannot be
  fire-and-forget. A new awaited `reserveReferoCall()` primitive does an atomic, lockfile-
  guarded (the `fileLock.ts` pattern `referoAuth.ts` already uses) check-and-increment
  *before* `client.callTool` fires, throwing a typed `ReferoBudgetExceededError` at the cap
  (env-overridable ceiling, default 8000, headroom warning at 90%). The reintroduced
  latency (one small locked file op vs. a network MCP call) is accepted; the existing
  fire-and-forget `recordReferoCall` is subsumed by the reserve step. Every invocation
  counts, including `getScreenImage`. "Account-wide across machines" is accepted as out of
  scope: one machine runs this app today (recorded limitation, not a claim).

## Phase plan

- **Phase 0 — shipped 2026-08-15**: role forwarding, 24k fallback helper, durable ledger +
  race fix (`9624a6b`, `d92bf54`).
- **Phase A (first PR series)**: instrumentation timestamps → sibling state + invariants +
  migration fixtures → budget enforcement → `getStylesBatch` + cache → candidate generation
  → panel UI → flag + soak. Devin reviews the soak against the pre-registered thresholds.
- **Phase B (parallel with A after its first two PRs)**: B2 Task 1 projection/digest → B1
  thread + route + assistant tab → B1 Refero research cards + handoff → B2 gate + preflight.
- **Phase C (parallel, starts immediately)**: C1 spike repair → C2 contract spike →
  promotion-bar run.

## Deliberately not built

Per-candidate live renders (Devin decision 3); page-wide autonomous edit execution; flows
research in the assistant; "force apply" override on refusals; competitor-scan re-entry
(baseline isolation holds); structured category filtering (API doesn't support it);
cross-machine budget accounting; any site-quality claim from phase A/B data.
