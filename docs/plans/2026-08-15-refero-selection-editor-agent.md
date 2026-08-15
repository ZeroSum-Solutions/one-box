<!--
provenance: ultracode ideation workflow wf_52c4deb2-74a, 2026-08-15
5 proposal agents (opus) x 5 adversarial judges (sonnet) x 1 synthesis (opus); 11 agents, 0 errors.
judge totals /50: select-probe 43, select-contract 40, select-ux 39, editor-coach 37, editor-guardian 37.
status: awaiting Devin go/no-go + GPT-5.6 Sol adversarial audit (docs/eval/plan-audit-refero-integration.md).
-->

# Refero integration — synthesized implementation plan

Five proposals went through adversarial judging. This plan takes the two highest-scoring designs as the foundation for each deliverable, grafts verified good ideas from the other three, fixes every fatal flaw a judge raised (or states plainly why it's accepted), and resolves the standing ordering dispute instead of dodging it.

Every code citation below was re-verified live against the repo on 2026-08-15 (not re-derived from the proposals). Line numbers match the current `spike/refero-baseline` checkout.

## Ordering decision: ship the picker now, split the claim, run the renderer track in parallel

The standing audit (`docs/eval/plan-audit-selection-first.md`) is right about one thing, verified independently: `builder.ts` copies the same `site.css` byte-for-byte (`src/lib/builder.ts:112`) and renders one frozen `index.html.tpl` (8 sections, no topology variation). A user-picked reference run through today's renderer changes colors, fonts, and spacing constants — nothing else. Testing "does the user's pick make a better site" against this renderer would just be the falsified 2026-08-13 tokens-only A/B again, with a human instead of the model choosing which tokens.

But the founder's hard constraint — "the user picks the design reference, not the model" — is not a quality-uplift hypothesis. It is a product requirement already decided. Conflating it with the renderer-expressivity question, as a strict picker-after-renderer gate would, makes a settled requirement wait on an unsettled, already-partly-failed experiment (the layout-IR spike still has one broken hero after four iterations — `spikes/layout-ir/FINDINGS.md`).

The audit's own document resolves this itself, in one place the "reject picker-first" verdict doesn't quote: step 7 of "what I would actually build first" says to ship "a disposable picker probe… three pre-vetted, plain-language directions… include 'Recommend one for me'" and measure completion rate, decision time, and abandon rate — explicitly separate from step 9's "run the fair reference experiment on the expressive renderer." That is a claim split, not a ship-date split.

**Decision: ship the selection tool now, as a consent-and-usability probe that never claims a quality uplift, running in parallel with (not gated by, not gating) a separate renderer-expressivity workstream.** Concretely:

- The picker ships with a mandatory, un-skippable disclosure line telling the owner exactly what the pick changes today (colors, fonts, photo style) and what it doesn't yet (page layout). This is the actual mechanism that keeps "user picks" from becoming "polished false agency" — an honest, disclosed limit, not a hidden one.
- Phase 1's own data (completion rate, decision time, agreement with the model's advisory pick, a small paired outside-grader check) is reported to Devin and used only to decide whether the picker should be default-on — never cited as evidence that user selection beats model selection for site quality. That question needs the expressive renderer and is out of scope here.
- A named sibling workstream — repair the layout-IR spike, define a `ReferenceContract` beyond tokens, measure topology distinctiveness, gate on the outside grader versus the frozen template — is what unlocks the real quality-uplift experiment later (audit step 9: no-reference vs. model-picked vs. user-picked, same expressive renderer). This plan does not design that workstream in full; `select-contract`'s Phase 1 scope (§10 of that proposal) is the right blueprint to commission separately if Devin wants to fund it. It has no dependency edge on either deliverable below — it can start today, in parallel.

This rejects `select-contract`'s strict two-phase gate (no picker until the renderer clears its own bar) because it makes a settled requirement wait on an uncertain repair with no committed timeline, and the founder asked to get the selection tool's value case *settled*, not deferred again. It rejects doing nothing to answer the audit's objection, because that would ship exactly the false-agency risk it names. The middle position — ship small, disclose honestly, measure narrowly, never overclaim — is what both top-scoring proposals (`select-probe`, 43; `select-ux`, 39) independently converged on, and it's the one the audit's own document licenses.

---

## Deliverable A: Selection tool

**Foundation: `select-probe`** (highest score, 43, no fatal flaws — its own judge's strongest objection was about rollout blast radius, addressed below). Grafted: `select-ux`'s reroll cap and disclosure-line wording discipline; `select-contract`'s composition-field capture and disk cache; a gate-condition fix neither proposal fully solved.

### Architecture

Today, `stageLock` (`src/lib/pipeline.ts:1237-1535`) runs unconditionally inside `executeEvidenceGatedPipeline`, before any human ever sees a candidate — verified: it's called at `pipeline.ts:713-715`, above the `run.evidenceWorkflow.currentStage` branch that drives every other pause. It also has an existing short-circuit that must be preserved: `if (!intake.research.enabled || !intake.research.referoDesignEvidence)` at `pipeline.ts:1244` returns a disabled lock with zero Refero calls, regardless of `referenceMode`. Any picker design has to route around this correctly — it's the interaction `select-ux`'s judge flagged and no proposal fully resolved.

Split `stageLock` into two functions, gated by one new predicate:

```ts
// src/lib/referenceGate.ts (new, small)
export function referenceGateApplies(mode: ReferenceMode, research: Intake["research"]): boolean {
  return mode === "refero" && research.enabled && research.referoDesignEvidence;
}
```

- **`stageLockCandidates(runId, intake, emit, revision?)`** — new. Search + shortlist + palette extraction + plain-language/composition translation. Never picks a primary.
- **`finalizeReferenceLock(runId, intake, selection, selectedId, emit)`** — new. Deterministic fold of the human's click into the *existing, unmodified* `ReferenceLockSchema` (`contracts.ts:836-865`). No LLM call for the fold itself; one LLM call (unchanged from today's `pipeline.ts:1444-1460` lock-discipline prompt, narrowed) to write `borrowedDetails`/`rejected`/`decisionLedger` around the now-fixed primary.
- **`stageLock`** (today's full body, `pipeline.ts:1237-1535`) is kept **verbatim**, used only when `referenceGateApplies()` is false — i.e., `local`/`none` arms and the disabled-research case behave byte-for-byte as today. No pause, no extra click, no change to your own experiment arms.

In `executeEvidenceGatedPipeline` (`pipeline.ts:688-926`), replace the single unconditional `stage(runId, "locked", …, () => stageLock(...))` call with a branch on `referenceGateApplies(mode, intake.research)`:

- **False** → run today's `stageLock` exactly as now (cached via the existing `stage()` wrapper).
- **True** → check for an approved `reference-selection` artifact. If none: generate candidates (`stageLockCandidates`), save as a `draft` artifact, `pauseForApproval(runId, "reference", emit)`, return. If approved: run `finalizeReferenceLock` once (cached the same way `stageLock` is today) and continue into the existing `"evidence"` branch, unchanged.

**Default-stage precision fix (a real improvement over every source proposal):** rather than hardcoding `currentStage: "reference"` for *every* new run — which is what all three picker proposals did, and which reintroduces the exact `pipeline.ts:1244` conflict `select-ux`'s judge caught — compute the default at run-creation time, when `referenceMode` and `intake.research` are already known:

```ts
currentStage: referenceGateApplies(referenceMode, intake.research) ? "reference" : "evidence"
```

Gated runs start their evidence workflow at `"reference"` (index 0) and walk all 7 stages. Non-gated runs (local/none/disabled) start at `"evidence"` (index 1) and never touch the `"reference"` stage or its artifact — no extra click, no special-cased skip logic needed in `advanceEvidenceWorkflow`, because the array-walking logic (`runstate.ts:722-742`) only needs `nextStage` to be the array's immediate successor of the *current* stage, not index 0.

### Contracts (`src/lib/contracts.ts`)

```ts
export const CandidatePaletteEntrySchema = z.object({
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),   // extracted, never model-invented
  plainLabel: z.string().max(60),                // "the button color", not the source's raw role string
});

export const CandidateProfileSchema = z.object({
  referoId: z.string(),
  kind: z.literal("style"),                      // screens are never picker candidates — see below
  name: z.string(),
  sourceUrl: z.string().optional(),
  previewImageUrl: z.string().optional(),
  screenshotPath: z.string().optional(),
  foundVia: z.string(),
  palette: z.array(CandidatePaletteEntrySchema).min(2).max(6),
  plainLanguageProfile: z.object({
    headline: z.string().max(80),
    feelSummary: z.string().max(320),
    bestFor: z.array(z.string()).max(4),
    headsUp: z.array(z.string()).max(3).default([]),
  }),
  // Lightweight, not the full digest (see Deliverable B) — just enough to
  // write an honest card and to be forward-compatible with the renderer
  // track without re-fetching later. Grafted from select-contract's field
  // set, kept shallow on purpose.
  composition: z.object({
    northStar: z.string().max(200),
    preserveTraits: z.array(z.string().max(160)).min(2).max(5),
    rhythmNote: z.string().max(240), // one plain sentence, e.g. "sections alternate light and dark"
  }),
  recommended: z.boolean().default(false),
  recommendedWhy: z.string().max(200).optional(),
});

export const ReferenceSelectionSchema = z.object({
  searchAngles: z.array(z.string()).min(3).max(5),
  candidates: z.array(CandidateProfileSchema).min(2).max(3),
  revisionNote: z.string().max(2_000).optional(),
  excludedFromPrior: z.array(z.string()).default([]),
});
```

No `selectedId` on the artifact body. The pick is recorded on the **approval transition**, matching how `HumanVisualReview` already lives on `ArtifactApprovalTransitionSchema` (`contracts.ts:407-416`) rather than mutating the artifact:

```ts
// extend ArtifactApprovalTransitionSchema
referenceSelection: z.object({
  selectedId: z.string(),
  selectionKind: z.enum(["user-picked-recommended", "user-picked-other"]),
}).optional(),
```

Wiring (mechanical, follows the existing pattern exactly):

- `EVIDENCE_WORKFLOW_STAGES` (`contracts.ts:342-349`): prepend `"reference"`.
- `EVIDENCE_STAGE_ARTIFACT` (`contracts.ts:488-495`): add `reference: "reference-selection"`.
- Add the new member to `WorkflowArtifactVersionSchema` / `WorkflowArtifactDraftSchema` (`contracts.ts:450-486`).
- `ARTIFACTS` (`contracts.ts:1060-1078`): no change — `ARTIFACTS.lock` still means "the final lock," now written by `finalizeReferenceLock` instead of `stageLock`, for gated runs.
- `route.ts`'s `save-version` refine (`route.ts:58-61`) and `latestCurrentArtifact`'s expected map (`route.ts:79-94`): add `"reference-selection"` alongside `"visual-qa"` as server-generated-only (drafts come from `regenerate-reference-candidates`, never a client-authored draft).
- `ActionSchema` (`route.ts:37-63`): add `select-reference` (`{selectedId, note?}`) and `regenerate-reference-candidates` (`{revisionNote?}`), following the exact shape of the existing `record-human-visual-review` / `regenerate-visual-qa` branches.

### Candidate generation (`stageLockCandidates`)

1. Search angles — **unchanged prompt**, `pipeline.ts:1283-1288`.
2. `searchStyles(angle, 4)` per angle — **unchanged**, `pipeline.ts:1319-1348`.
3. Two `searchScreens` calls — **unchanged mechanics**, but role changes: never shown as picker options (REF-001's confirmed zero-contractor result backs this; screens stay a pure borrow pool for the post-pick prompt).
4. Deterministic shortlist: at most one candidate per angle, capped at 3 (anti-convergence guard — no LLM call).
5. **One batched** `getStyle(ids)` call (`refero.ts`'s existing single-id `getStyle`, extended to accept up to 10 ids per Refero's own batch limit) for the shortlisted 2-3 candidates.
6. Deterministic palette extraction from each full style JSON — never model-authored hex values, mirroring the codebase's existing discipline that `ReferenceLock.provenance` is filled deterministically, never by the model (`contracts.ts:859-863`).
7. **One new batched call, `MODELS.bulk`**, covering all 2-3 finalists: writes `plainLanguageProfile` + `composition` + picks 2-6 palette entries to label. This is a deliberate deviation from `select-probe`'s "zero new prompts" claim — justified because the hard "genuinely plain language, no jargon" constraint needs real translation, not templated string concatenation of Refero's own summary text (which risks leaking jargon or the corrupted-description-tail bug documented in `docs/refero-mcp-research.md`). One cheap, batched, thrift-tier call is worth that guarantee.
8. Persist preview images + full style JSON to `sites/<runId>/research/refero/` (same pattern `stageLock` already uses at `pipeline.ts:1410-1426`) — this is the cache Deliverable B's digest generation reads from.
9. Save as `reference-selection` v1, `pauseForApproval(runId, "reference", emit)`.

### UI

New `ReferenceSelectionPanel.tsx`, rendered from a new case in `EvidenceWorkspace.tsx`'s artifact-preview switch (mirrors the existing `visual-qa` special case that hides the generic approve-button row).

Layout, in order of visual weight:

1. One-line framing: *"We found a few different looks for your site. Pick the one that feels most like your business — or let us pick for you."*
2. **"Not sure? Use our recommendation"** — one click, fires `select-reference` with the flagged candidate.
3. 2-3 candidate cards. **Swatches and the plain-language profile are the primary visual element; the real-site photo is smaller and explicitly labeled** ("A real business site with this feel — for inspiration, not a preview of your site").
4. Mandatory, non-optional disclosure line below the gallery: *"This choice sets your colors, fonts, and photo style. The page layout comes from our standard business-website format for now."* Exact wording is FOUNDER-DECISION; the presence and honesty of the claim is not negotiable.
5. **"Show me different directions"** — fires `regenerate-reference-candidates`, capped at 2 rerolls (3 total versions). Grafted from `select-ux`/`select-contract`: `select-probe`'s own judge flagged "no revision path" as a real trust risk, and this is a cheap, mechanical addition (`regenerate-visual-qa` already establishes the exact pattern).

**Accepted deviation from the audit's literal ask** ("client-content thumbnail," i.e., render each candidate through the full pipeline before the user picks): a true per-candidate live render costs 2-3x the build work, thrown away for the 1-2 unchosen candidates, with no budget headroom to justify it in Phase 1. Both surviving high-scored proposals (`select-contract`, `select-probe`) independently reached the same conclusion. Mitigated by making the real-site photo visually subordinate and the disclosure line mandatory. **FOUNDER-DECISION:** revisit a full-render option once Phase 1 usage data (or your own read of 10-15 real runs) says anchoring is actually a problem.

### Rollout — fixing `select-probe`'s strongest objection

Its judge's real concern: this pause lands in `executeEvidenceGatedPipeline`, the default pipeline for all new runs, with no revision path in the original design. Reroll (above) closes half of it. The other half:

**FOUNDER-DECISION:** ship Phase 1 behind a simple flag (e.g. an env var, or scoped to a specific batch of runs you pick) for a short internal soak before it becomes the default for every new customer run. Recommend: soak until you've personally reviewed 8-10 real picker sessions, then flip default-on.

### Measurement gate

Every number below comes from data this design already persists — no new instrumentation schema:

- Completion / abandon rate, decision time (diff the pause-emit timestamp against the approval transition's `.at`), "use our recommendation" uptake, agreement rate (`selectionKind`).
- A small paired quality check (N=6-8 briefs, run twice each — once approving the model's advisory recommendation, once deliberately picking a different shown candidate) graded with the existing `scripts/audit/outside-grade.mjs` / `docs/eval/presentation-rubric.md` harness — the same measurement mechanism already trusted for the 2026-08-13 A/B.

**Devin reviews this before deciding:** (a) flip default-on for all runs, (b) keep soaking, or (c) the paired check shows something interesting enough to prioritize the renderer-expressivity track sooner. This result is never reported as "user selection beats model selection for site quality" — the renderer can't express that yet, and the report must say so.

---

## Deliverable B: Editor agent

**Foundation: neither `editor-coach` nor `editor-guardian` ships as specified — both tied at 37 with real, overlapping fatal flaws** (no measurement plan tying to the outside-model rubric; large new product surface shipped before any validation). The correct move is not to average them but to take the narrower, better-grounded half of `editor-guardian` (the style-guardian retrofit of the *existing, already-shipped* single-element edit path) and explicitly cut the half that both judges independently flagged as premature (a brand-new multi-step, page-wide planner with its own chat thread, HTTP route, Refero consumption, and UI panel).

### Why the guardian half, not the planner half

The guardian fixes a defect that exists **today**, independent of any picker: `/api/edit/route.ts:133` forwards only `tokens.colors.map(c => c.cssVar)` to the edit-rewrite prompt — verified live. `DesignTokens.colors[].role` and `.forbidden` (`contracts.ts:882-883`) are computed at token-generation time and then silently dropped. A color that's a real, valid token — but licensed for exactly one job — is completely legal for the naive editor to misuse anywhere on the page, because `gateTokenDrift` only checks that a rendered color's hex exists *somewhere* in `tokens.css`, never that it's used in-role. This is fixable in one line, ships alone, needs no new schema or endpoint.

The planner (multi-step, page-wide, its own Refero screen-search caching and budget-degrade logic, a new chat thread persisted per run, a new `/api/edit/plan` route, a new Workbench tab) is genuinely new capability, not a guardrail — and it's exactly the kind of surface both judges flagged as shipped ahead of any graded hypothesis. It is deferred, explicitly, to a phase gated on Phase 1's measured results.

### Phase 1 scope

**Task 0 — zero-risk fixes, ship immediately, no dependency on anything else:**

1. `src/app/api/edit/route.ts:133` — forward each color's `role` + `forbidden` and each font's `role`, not just `cssVar` names, into the edit-rewrite prompt.
2. `pipeline.ts:1762` and `:1807` — raise `JSON.stringify(primaryRecord)?.slice(0, 14000)` to `24000`. Refero's own field order (confirmed in `docs/refero-mcp-research.md` Finding 2 and cross-checked against the RESEARCH-LOG) puts colors/type/spacing before surfaces/component-recipes/dos-donts/layout-rhythm — meaning today's blind slice may already be silently cutting exactly the fields Finding 2 calls "the untested upside," independent of anything else in this plan. If still truncated at 24,000, drop the verbose "agent prompt guide" field first — no downstream schema consumes it.

**Task 1 — `ReferenceStyleDigestSchema`, generated once at the "contract" pause:**

```ts
export const ReferenceStyleDigestSchema = z.object({
  sourceStyleId: z.string(),                 // = lock.primary.referoId, deterministic
  northStar: z.string().max(200),
  preserveTraits: z.array(z.string().max(160)).min(3).max(5),
  sectionRhythm: z.string().max(500),
  surfaces: z.array(z.object({ level: z.number().int().min(0).max(3), purpose: z.string().max(160) })).min(1).max(4),
  componentRecipes: z.array(z.object({ component: z.string().max(60), treatment: z.string().max(240) })).min(1).max(8),
  imageryTreatment: z.string().max(400),
  motionPersonality: z.string().max(200),
  dosDonts: z.array(z.object({ polarity: z.enum(["do", "dont"]), rule: z.string().max(200) })).min(4).max(14),
}).superRefine((digest, ctx) => {
  if (!digest.dosDonts.some((d) => d.polarity === "dont")) {
    ctx.addIssue({ code: "custom", path: ["dosDonts"], message: "digest must carry at least one don't — an all-do digest can't ground a refusal" });
  }
});
```

Generated inside `proposeDesignTokens` (`pipeline.ts:1734-1771`), reusing `primaryRecord` **already fetched in memory at that call site** — zero extra Refero calls. One extra `generateJson(MODELS.orchestrator, …)` call, made at a stage that already pauses for human approval, so the latency is invisible. `ARTIFACTS.referenceStyleDigest = "reference-style-digest.json"`. If generation fails, the digest is simply absent (`loadArtifact` returns `undefined`) — the guardian degrades to tokens + lock only, never blocks the "contract" pause.

**Task 2 — `GuardedEditResultSchema` and the guardian prompt:**

```ts
export const GuardedEditResultSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("apply"), innerHtml: z.string() }),
  z.object({ decision: z.literal("redirect"), innerHtml: z.string(), guardrailNote: z.string().min(1).max(400) }),
  z.object({ decision: z.literal("refuse"), reason: z.string().min(1).max(400), suggestedAlternative: z.string().max(400).optional() }),
]);
```

Replaces the bare `z.object({ innerHtml })` call at `route.ts:129-134`. Same model (`MODELS.builder`), same four hard rules (keep `data-edit-id`s, no new classes/colors/scripts, preserve tag structure), plus the full color-role/forbidden list, `preserveTraits`, `sectionRhythm`, and `dosDonts` from the digest (falls back to tokens+lock if the digest is absent). On `refuse`, the route returns **before** calling `applyElementHtmlEdit` — no snapshot, no gate rerun, no history entry, `200 {ok:false, guardrail:{...}}`, not a 409 (it's a correct answer, not an error).

**Fixing `editor-guardian`'s specific fatal flaws in the part that survives:**

- *Jargon enforced only by prompting, no output check* — add a lightweight denylist/regex check on `guardrailNote`/`reason` text ("token", "CSS variable", "Tailwind", "DESIGN.md", "hex code") before the response leaves the server; reject and regenerate once on match. Applied symmetrically with Deliverable A's own plain-language risk.
- *Color info shown as prose, not swatches* — the read-only "what we'll always keep / what we won't do" summary (folded into the existing `research` Workbench tab, see below) renders color chips as real swatch divs, matching the picker's own hard-constraint treatment. No prose-only color description anywhere in this plan.
- *No override/escape hatch* — Phase 1 does not build a "force apply anyway" button (correctly YAGNI'd — both judges' notes agree this needs real usage data first). It does ship the free equivalent: `suggestedAlternative` on every refusal, and the existing chat composer already supports re-submitting a refined instruction. A refusal is never a dead end.
- *No measurement plan* — see below.

### UI

No new Workbench tab in Phase 1 (a genuine scope reduction versus both source proposals). Fold a compact, collapsed read-only summary — *"The [Style Name] look: what we'll always keep"* / *"what we won't do"* — into the **existing** `research` tool tab's `ResearchFindings.tsx`, sourced from the digest. Whatever component currently renders `/api/edit`'s response needs to render the new `decision`/`reason`/`guardrailNote`/`suggestedAlternative` fields — **verification task, not yet located in this pass**: identify that component before writing code.

### Measurement gate

Before this becomes default-on behavior: a small paired comparison (N=8-10 edit instructions, run against a few real built sites, guardian-on vs. guardian-off) graded with the **same** `outside-grade.mjs`/`presentation-rubric.md` harness used everywhere else in this plan — closing the "no measurement plan" fatal flaw both judges raised, by importing the same rigor already used for Deliverable A and the 2026-08-13 A/B. Acceptance fixtures: confirm the guardian actually catches the three concrete, code-verified naive-editor failures `editor-guardian` documented (an accent color licensed "primary CTA only" applied to a footer background and passing token-drift anyway; a reserved single-use dark CTA-band color bleeding into another section because `DesignTokens.layout` carries no surface/rhythm concept; an autoplay carousel being fully legal under today's four hard edit rules).

**Devin reviews this before deciding whether to build Phase 2** (the multi-step, page-wide planner). If it's funded later, reuse `editor-coach`'s one genuinely strong, generalizable technique: build the planner's suggestion-target schema (`targetEditId`/`targetToken` enums) dynamically from the *live* site's actual data-edit-ids and `inspectSiteTokens()` output at generation time, so the model structurally cannot name an edit target that doesn't exist — the strongest anti-hallucination idea across all five proposals, verified against real code (`siteTokens.ts`'s `InspectedToken.affectedEditIds`), and worth reusing wherever a suggestion needs a fixed target.

---

## Refero call-budget accounting

Verified today's baseline (cold cache): 3-5 style searches + 2 screen searches + 1 live `getStyle` call for the primary at the "contract" stage = **6-8 calls/run**.

| | Refero calls | Notes |
|---|---|---|
| Deliverable A candidate generation | 6-8 | same searches, but ONE batched `getStyle(ids)` call for 2-3 finalists instead of one single-id call later — same call count, richer payload |
| Deliverable A finalize + Deliverable B digest | 0 | both read the style JSON already cached to disk during candidate generation |
| Deliverable A reroll (capped at 2) | +6-8 each | bounded by the reroll cap; trends toward cache hits as query patterns repeat |
| Deliverable B guardian (Task 1 + 2) | 0 | reuses the already-fetched, already-cached `primaryRecord` |

**Net: flat to better than today's baseline**, before any caching. Two pieces of shared infrastructure, built once in Deliverable A's first PR and reused by Deliverable B:

- **Durable, month-bucketed Refero budget ledger** (`src/lib/tools/referoBudget.ts`) — closes a real, verified gap: `referoCallCount()` (`refero.ts:139-141`) is in-memory only, on a `globalThis` singleton, and resets on every restart/redeploy. Nothing today actually enforces the documented 8k/month budget. Wire one line into `invokeRefero`'s existing `state.callCount += 1` (`refero.ts:189`) so every caller — the lock stage, the picker, any future digest fetch — is durably counted, not just this feature. Unit test the month-rollover boundary.
- **Disk cache** (`getStyleCached()`, 60-day TTL, keyed by `referoId`) wrapping the existing `getStyle()` — a cache hit never reaches `invokeRefero`, so it never touches the ledger either.

At 8,000 calls/month and ~6-8 calls/run, this supports 1,000+ completed runs/month with both deliverables live, before caching improves that further.

---

## What is deliberately NOT built yet

- **Renderer-expressivity / composition-contract work** (layout-IR repair, a full `ReferenceContract` schema, topology-level rendering). Named as a parallel sibling workstream this plan positions but does not design in full — `select-contract`'s Phase 1 scope is the reference blueprint if Devin wants to commission it separately.
- **Full per-candidate live-rendered ("client-content") thumbnails** for the picker. Real Refero source screenshots ship instead, honestly labeled and visually subordinate to swatches/plain-language copy.
- **The multi-step, page-wide edit planner** and its own chat thread, `/api/edit/plan` route, Refero screen-search consumption, and new Workbench tab. Gated on the guardian's Phase 1 measurement results.
- **A "force apply anyway" override** for guardian refusals. Suggested alternative + free re-ask is the Phase 1 answer.
- **Competitor-scan re-entry into design prompts.** Report-only baseline isolation holds, unchanged, per the hard constraint.
- **Structured category-filtered Refero retrieval.** Not supported by the API; query-by-aesthetic-vocabulary (the existing angle-generation prompt) remains the only path.
- **Picker parity for local/none experiment arms.** They keep today's silent auto-pick, unpaused — this is internal test plumbing, not the customer-facing path.
- **iOS/web-app template support** for the editor guardian's section vocabulary. One template exists today; this is scoped to `templates/local-service/` only.


---

## Phase 1 tasks (first PR-sized increment)

1. Live-verify refero_get_style's actual JSON field shape (call it against 2-3 real style ids) and document the confirmed color-role array structure before writing any palette extractor — every downstream palette/composition-extraction task depends on this.
2. Fix src/app/api/edit/route.ts:133 to forward each color's role and forbidden context (not just cssVar names) and each font's role into the edit-rewrite prompt.
3. Raise the primaryRecord truncation cap in pipeline.ts (proposeDesignTokens at line ~1762 and stageSynthesize at line ~1807) from slice(0, 14000) to slice(0, 24000); if still truncated, drop the 'agent prompt guide' field first since no downstream schema consumes it.
4. Add CandidatePaletteEntrySchema, CandidateProfileSchema, ReferenceSelectionSchema, ReferenceStyleDigestSchema, and GuardedEditResultSchema to src/lib/contracts.ts — additive only, not yet wired into any running code path.
5. Add referenceGateApplies(mode, research) as a small pure predicate (new src/lib/referenceGate.ts), and use it to compute RunStateSchema's evidenceWorkflow.currentStage default at run-creation time instead of a single hardcoded literal.
6. Prepend 'reference' to EVIDENCE_WORKFLOW_STAGES, add reference: 'reference-selection' to EVIDENCE_STAGE_ARTIFACT, add the new artifact-type member to both WorkflowArtifactVersionSchema and WorkflowArtifactDraftSchema, and add ARTIFACTS.referenceStyleDigest — all in contracts.ts, still unused by any code path.
7. Build src/lib/tools/referoBudget.ts: a durable, month-bucketed Refero call ledger (.one-box/refero-usage.json, atomic write), wire one line into refero.ts's invokeRefero to increment it alongside the existing in-memory callCount, and write a unit test covering the month-rollover boundary.
8. Build getStyleCached(id): a disk cache (60-day TTL, keyed by referoId) wrapping the existing getStyle() export in src/lib/tools/refero.ts, with a hit/miss/TTL unit test.

## Open questions for Devin (plain language)

1. Should the new 'pick a look' pause apply only when a run actually uses live Refero search, or also to your internal test arms (local library / no-reference control)? This plan's default: skip the pause entirely for internal test arms so your own testing doesn't slow down. Confirm or override.
2. Should the picker go live for every new run right away, or only for a small batch you watch first before it becomes the default? Recommend: soak on 8-10 real sessions you personally review, then flip default-on.
3. How many times should someone be allowed to ask for different looks before we just ask them to pick one of what's shown? Recommend two more tries (three total looks shown).
4. Each look's picture will be a real business site with that feel, honestly labeled as inspiration — not a live preview built from the customer's own words and colors. A true live preview for all 2-3 choices costs several times more (thrown away for the ones not picked) and would eat into the monthly design-research budget. Is that trade-off fine for now, or do you want the pricier live-preview version instead?
5. When the edit assistant can't safely do what someone asked (e.g. change the page layout), it will say so and suggest the closest thing it can do, rather than silently comply or silently refuse. Is that the right tone, or do you want it to stay quiet about limits nobody asked about?
6. Do you want a manual 'do it anyway' override for edit refusals in this first version, or is 'explain why, suggest an alternative, let them ask again differently' enough for now? Recommend holding off on override until there's real usage data.
7. Do you want the renderer-expressivity workstream (fixing the layout-IR spike so the site's actual structure can vary, not just colors/fonts) commissioned now as a parallel track, or held until the picker's Phase 1 numbers come back?
