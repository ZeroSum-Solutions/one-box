# Guided Pipeline Mode — Architecture Design

**Status:** Approved by owner
**Date:** 2026-08-25
**Scope:** OneBox local product UI and persisted run artifacts
**Owner decision required before implementation:** Yes

## 1. Objective

Add a presentation toggle to OneBox with two modes over one authoritative pipeline:

- **Developer ON:** render the incumbent pipeline UI exactly as it works today.
- **Developer OFF (default):** render a clean, highly visual, guided experience that asks the user for only the decisions needed to generate a site.

The guided experience must make competitive research and design-reference choices legible to a non-developer without weakening the existing evidence, approval, cost, provider, or deployment gates.

## 2. Interpretation and assumptions

The request contains one ambiguous sentence about the OFF state showing the current pipeline, followed by a detailed request for the OFF state to look completely different. This design treats the detailed requirement as authoritative:

- OFF is the new guided experience and is the default.
- ON is the existing developer experience and must not be redesigned as part of this feature.
- “Completely different” means information architecture, disclosure, and interaction are simplified. It does not replace the approved One-Box Midnight Instrument visual identity in `DESIGN.md`.
- Competitor “site preview” means OneBox’s captured desktop/mobile screenshots plus a safe external link. OneBox will not iframe arbitrary third-party sites because many forbid framing and an embedded untrusted origin would create security, privacy, and reliability problems.
- The preference picker requires one to three design references. Rank is meaningful; every selected reference requires a short note so its intended influence is unambiguous.

## 3. Success criteria

1. A first-time browser opens in guided mode; a returning browser retains its last chosen view.
2. Switching to Developer ON reveals the current pipeline UI with no feature-driven behavioral changes.
3. Guided mode shows the same run and controller state as developer mode; toggling never starts, resumes, pauses, or mutates a run.
4. During competitive research, the map and research progress are visible without exposing the raw event log.
5. Completed research presents actual crawled competitor websites—not Yelp rank as the selection authority—with screenshot previews, selection rationale, strengths, gaps, sources, and confidence/fact labels.
6. A competitor can be expanded using keyboard or pointer to inspect captured desktop/mobile views and evidence, then opened externally in a new tab.
7. Refero choices are visually selectable in an ordered set of one to three. Each selected item displays rank 1, 2, or 3 and requires a short “what do you like?” field.
8. Reordering or removing a choice updates the displayed rank before submission.
9. Choosing cards does not immediately resume the pipeline. A separate confirm action persists one ordered preference set and resumes exactly once.
10. The ordered preferences and notes are consumed by the reference lock and downstream design work without mixing competitive evidence into design-reference evidence.
11. The guided experience provides a concise look-and-feel / type / color / spacing summary and routes final approval through the existing evidence workspace.
12. Existing persisted runs and the existing single-reference selection shape continue to parse and resume.

## 4. Approaches considered

### A. One pipeline, two projections, additive contracts — recommended

Keep the controller, SSE events, artifacts, approval gates, and cost controls authoritative. Add a guided projection over the same run state and add only the structured fields required for richer competitive analysis and ordered reference preferences.

Benefits:

- The developer view cannot drift from a second controller.
- Switching modes is safe and immediate.
- Existing recovery/checkpoint behavior remains authoritative.
- New UI can evolve without rewriting the pipeline.

Cost:

- Some current event-card text must be replaced by typed read models for the guided UI.
- The reference selection contract and lock generation need a backward-compatible extension.

### B. A separate guided pipeline and route — rejected

A second controller would duplicate run transitions, provider calls, spending rules, resume behavior, and human gates. It would inevitably diverge and make a presentation setting operationally dangerous.

### C. Hide parts of the current timeline with CSS — rejected

This would preserve the same overloaded information hierarchy, depend on prose event cards as a data API, and make the new interaction brittle. It would not support ranked multi-reference preferences cleanly.

## 5. Product model

### 5.1 Presentation mode

Use a client-side presentation preference:

```ts
type PipelinePresentationMode = "guided" | "developer";
```

- Default: `guided`.
- Persist to browser storage only; it is a view preference, not run state.
- Optional query override `?view=guided|developer` supports testing and shared instructions without mutating storage unless the user changes the toggle.
- The toggle remains reachable in both modes, has a visible text label, and uses a native/switch-equivalent accessible control.
- Mode changes do not call pipeline APIs.

### 5.2 One authoritative run

`Home` continues to own the reducer and SSE connection. It passes the same timeline, run ID, terminal state, cost data, and callbacks to one of two projections:

```text
Home + run reducer
  ├── guided   -> GuidedPipeline
  └── developer -> existing RunTimeline (unchanged)
```

No run transition may depend on the selected presentation mode.

When the guided feature rollout is enabled, new website runs are created with the existing immutable `referencePickerEnabled=true` run flag. This is a creation-time pipeline capability, not a value read from the browser presentation toggle. Existing/legacy runs whose persisted flag is false continue through the current automatic reference lock and skip the chooser. Turning Developer ON or OFF never changes the run flag.

The durable `run.json` state plus validated stage artifacts are the read-model authority. SSE is transport only: an event invalidates/refetches the typed read model but event-card prose is never parsed into guided state. After a disconnect, guided mode shows **Reconnecting** while it refetches. A dropped SSE stream is not a terminal error. If SSE and disk momentarily disagree, the validated durable state wins; the client retries no more often than once per second with bounded exponential backoff and returns to the existing recover action only for a durable `error` terminal.

Developer mode remains visually and behaviorally unchanged. Compatibility work is limited to the server-side selection normalizer and controller: a ranked selection is recognized as a completed reference checkpoint, invalidates a replayed `reference-paused` event, and cannot trigger a second legacy selection POST. `RunTimeline` does not gain guided components or new controls.

### 5.3 Guided journey

The guided experience uses five human-readable steps:

1. **Researching your market** — map, plain-language progress, discovered businesses.
2. **Understanding the leaders** — ranked analyzed competitor sites with basis and evidence.
3. **Choose your direction** — ordered Refero selection and notes.
4. **Your design system** — concise visual summary for color, type, spacing, imagery, and layout.
5. **Review your website** — generated preview and the existing evidence/approval entry point.

Only the current step is fully expanded. Completed steps collapse to a one-line summary and can be reopened. Future steps remain visible but inert so the user understands the journey without seeing developer-stage noise.

### 5.4 Authoritative state-to-surface matrix

The five steps are navigation labels, not a replacement state machine. A pure server-side `deriveGuidedSurface(run, artifacts, durableHistory)` helper returns one closed `GuidedSurfaceKind`; the client renders that discriminator and never runs its own loose first-match conditions.

Derivation precedence is explicit:

1. current durable terminal/error/parked/fallback state;
2. current human gate (reference, evidence artifact, Page IR source, or visual review);
3. current active evidence/build stage;
4. reference-selection/auto-lock work;
5. scan/intake work.

The helper uses the same current-pause invalidation rules as `replayedPauseIsCurrent`, so stale terminal events cannot outrank advanced run state. Each predicate below is mutually exclusive after this precedence is applied. Separately, `market-analysis.json` controls whether step 2 is available/reopenable; its existence never chooses the current surface by itself.

| Durable/controller state | Guided surface | Primary action | Boundary rule |
|---|---|---|---|
| Intake/chat pending | Tell us about your project | Existing intake action | This remains the current composer; no pipeline mutation from the view toggle. |
| Intake/chat failed | We could not start the project | Existing recover/edit action | Uploaded files must be reselected under the existing rule. |
| `scanned` pending/running | Researching your market | None | Show typed progress; never infer completion from event prose. |
| `scanned` failed | Research could not finish | Existing recover/edit action | No hidden retry or provider fallback. |
| Research disabled in persisted intake | Market research skipped | None | Mark steps 1–2 skipped; continue through the existing non-research path. |
| `scanned=done`, no higher-precedence state, `locked=pending`, picker enabled, no selection state yet | Understanding the leaders | None | Show the analyzed cards while `stageLockCandidates` finds design directions; when candidates persist, step 2 collapses/reopens and step 3 becomes current. This is normal progress, not a review gate. |
| `referenceSelection.status=pending` / `reference-paused` | Choose your direction | Use these preferences | Confirm is the only selection transition. |
| `referencePickerEnabled=false`, `locked` pending/running | Selecting a foundation automatically | None | Legacy/picker-disabled run; mark step 3 skipped and do not invent a chooser. |
| `referenceSelection.status=selected`, `locked` pending/running | Applying your preferences | None | Reuse the persisted immutable selection; reconnect does not ask again. |
| `locked` failed | Design direction could not be locked | Existing recover/edit action | Retry uses the same selected checkpoint. |
| `locked=done`, evidence stage has no current draft yet | Organizing the research | None | Generate the evidence ledger, then pause normally. |
| Evidence workflow `evidence` paused | Review the research foundation | Review in evidence workspace | Step 2 remains reopenable; never auto-approve. |
| Evidence workflow `contract` generating | Creating your design system | None | Step 4 is current. |
| Evidence workflow `contract` paused | Your design system | Review in evidence workspace | Show the compact look/type/color/spacing summary. |
| Evidence workflow `tokens`, `tailwind`, or `css` generating | Refining your design system | None | Step 4 remains current with the approved upstream summary. |
| Evidence workflow `tokens`, `tailwind`, or `css` paused | Design system checkpoint | Review in evidence workspace | Reuse current approval/revision controls. |
| Current evidence artifact `revision-requested` | Changes requested | Review in evidence workspace | Show the revision note; preserve artifact versioning. |
| `synthesized` pending/running | Planning your website | None | Plain-language generation progress only. |
| `synthesized` failed | Site plan could not be created | Existing recover/edit action | No silent substitute. |
| `page-ir-source-paused` | Source bundle ready | Review Source Bundle | Preserve named-human attestation gate. |
| `built` pending/running | Building your website | None | Plain-language progress; raw lifecycle detail stays in Developer mode. |
| `built` failed | Build needs attention | Existing recover or evidence action | Preserve gate/lifecycle/provenance details in Developer mode. |
| Page IR candidate parked / lifecycle or promotion failure | Build needs attention | Existing recover, evidence, or linked fallback action | Do not claim completion; preserve the parked candidate and provenance. |
| `build` paused on visual QA | Review your website | Review in evidence workspace | Preserve named-human visual approval. |
| `complete` | Website ready | Open preview | Evidence remains available as a secondary action. |
| Configuration/provider prerequisite error | Setup needed | Existing recover/edit action | Name the unavailable capability; never select or buy a substitute silently. |
| Cost cap exceeded | Spending limit reached | Existing recover/edit action | No reconnect/resume loop and no automatic cap increase. |
| Lifecycle/gate/promotion failure | Build needs attention | Existing recover or evidence action | Preserve failure provenance and fallback link when present. |
| Fallback run created | Safer fallback available | Open linked fallback run | Failed source run remains immutable. |
| SSE disconnected, durable terminal absent | Reconnecting | None | Refetch durable state; do not label failure. |

Completed steps remain collapsed but reopenable: step 2 becomes available when `market-analysis.json` validates but never overrides a later current surface; step 3 is complete when selection is persisted or is explicitly skipped for a picker-disabled legacy run; step 4 becomes current from contract generation through the CSS approval. Unknown future terminal/gate states alone fail closed to a generic **Review required** surface linking to the evidence workspace or Developer mode—never to an automatic continuation.

## 6. Competitive research design

### 6.1 Authority boundaries

- Google Maps/Yelp are discovery and local-market context.
- Yelp review count, rating, and directory rank are never the competitor scoring authority.
- Actual competitor selection is based on crawled first-party sites plus corroborating discovery evidence.
- Competitor evidence remains separate from Refero/design evidence in artifacts and prompts.
- Observed facts and model inferences must be labeled distinctly.

### 6.2 Deterministic competitor inclusion and ranking

The saved scan—not live directory order—is ranked once and then treated as immutable evidence for that run.

Eligibility:

1. `kind` must be `business`.
2. The canonical URL must be a first-party business site, not a directory/editorial/social-only URL.
3. Crawl provenance must show a successful bounded crawl with usable first-party text.
4. The site must have observed category/service relevance. Geographic relevance is required for local-service runs and optional for non-local targets.

URL eligibility is deterministic before model analysis: normalize redirects and scheme/host, reject the existing directory denylist plus an explicit social-platform denylist, require a registrable-domain match to the discovered first-party business URL, and require `kind=business`. The model may explain category/geographic relevance but cannot reclassify a directory/social URL into the eligible set.

Eligible sites receive a structured, evidence-backed rubric. Each 0–3 criterion must cite observed first-party page evidence; an uncited criterion scores zero:

- category and buyer relevance;
- proof and authority signals;
- offer and conversion-path maturity;
- information architecture and content completeness;
- differentiation useful to the market/gap analysis.

Total score orders the saved set. Ties break by count of cited observed claims, then normalized canonical URL. The scorer receives a dedicated `RubricCandidateInput` containing only canonical URL, normalized name, successful crawl text/structure, category/location targets, and confined first-party evidence references. The projection explicitly strips `Place.rating`, `Place.userRatingCount`, Yelp listing/rank/rating/review count, Maps rank, and every directory-order field before constructing the model prompt. The artifact persists criterion scores, evidence references, final score, and rank so reconnects do not rerun or reshuffle the analysis.

Cardinality:

- 0 eligible: explain that no first-party sites passed the evidence bar; show the map/directory roster only as unranked discovery context.
- 1 eligible: show one analyzed site and explicitly avoid plural/market-leader claims.
- 2–4 eligible: show all, ordered by the persisted rubric.
- More than 4 eligible: persist the complete analyzed set and display the top four with “why these four” plus a count of additional analyzed sites.

A new additive `market-analysis.json` artifact stores up to eight eligible scored rows, ranks, evidence references, and `displayCutoff: 4`. Existing `scan.json` remains schema-compatible with `competitors.max(4)` and continues to contain only the top four required by legacy downstream consumers. The scan stage may inspect/crawl at most eight first-party candidates under the existing cost cap; it writes and validates both artifacts before marking `scanned=done`. The guided GET reads `market-analysis.json`, with a legacy projection from `scan.json` when that new artifact is absent.

A fixture with deliberately inverted Yelp ratings/review counts keeps those directory fields present on the scan but proves that the sanitized rubric prompt hash, eligibility, rank, and tie-break are unchanged.

### 6.3 Typed research projection

The guided UI must not reconstruct important state from event-card prose. Add a read-only typed projection over the saved scan artifact, either by extending an existing confined artifact endpoint or by adding a narrow local API endpoint.

Recommended response shape:

```ts
type GuidedMarketResearch = {
  status: "researching" | "ready" | "failed" | "disabled";
  mapStatus: "ready" | "degraded" | "unavailable";
  map?: { center: { lat: number; lng: number }; places: Place[] }; // existing PlaceSchema
  competitors: GuidedCompetitor[];
  marketSummary?: { commonPatterns: string[]; gaps: string[] };
  progress: { label: string; completed: number; total?: number };
};

type GuidedCompetitor = {
  id: string;
  name: string;
  siteUrl: string;
  mapsUrl?: string;
  screenshots: { desktop?: string; mobile?: string };
  selectedBecause: AnalysisClaim[];
  strengths: AnalysisClaim[];
  gaps: AnalysisClaim[];
  confidence: "high" | "medium" | "low";
  sources: EvidenceLink[]; // confined artifact paths or validated https links
};

type AnalysisClaim = {
  text: string;
  basis: "observed" | "inferred";
  evidence?: string[];
};
```

The new analyzed-competitor schema owns stable IDs and structured analysis without raising the legacy `ScanResultSchema` bound. New IDs are a hash of normalized canonical site URL plus normalized name. Legacy `notes` remains readable during migration and receives the same derived stable ID; list indexes are forbidden as React keys or evidence identifiers. Durable stage failure drives `status=failed`; research-disabled intake drives `disabled`; Maps degradation is represented only by `mapStatus`, never by overloading research readiness.

### 6.4 UI behavior

- Researching state: map is the visual anchor; a restrained progress statement names the current human task (discovering, reading sites, comparing patterns).
- Ready state: show zero to four analyzed competitors according to the cardinality rules as large visual cards with captured screenshot, “why this competitor,” strongest patterns, and confidence.
- Card expansion uses one accessible dialog implementation with desktop/mobile screenshot tabs, strengths, gaps, observed/inferred labels, sources, and external actions.
- The map and directory roster can remain available as supporting context, but not as the primary ranking UI.
- Missing Maps API: retain the existing key-free/local fallback and explain reduced capability. No silent paid-provider activation.
- Capture failure: show the written analysis and external link with an honest unavailable state; never render a broken preview as evidence.

## 7. Ordered design preferences

### 7.1 Interaction

- Display the current candidate set as visual cards using the existing stable Refero screenshots/profile data.
- Instruction: “Choose one to three. Your first choice matters most. Tell us what you like about each one.”
- Clicking an unselected card appends it to the ordered set and displays rank 1–3.
- Clicking a selected card focuses its preference editor; removal is a separate explicit action.
- Drag-and-drop is optional and must not be the only reorder mechanism. Provide accessible Move up / Move down controls.
- Each selected card has a required note (3–1,000 characters after trimming) with examples scoped to the card: colors, layout, typography, imagery, interaction, or tone.
- Provide an optional overall direction note below the ranked set.
- A persistent summary shows the ordered set before confirmation.
- One primary **Use these preferences** action validates and submits. It is disabled until one to three unique choices have contiguous ranks and valid notes. The pipeline resumes only after this explicit action succeeds.
- The unconfirmed draft is stored in run- and candidate-set-scoped browser storage. Refresh/reconnect restores it without changing server state. It is discarded if the run, candidate-set version, or finalized server selection changes.

### 7.2 Weight semantics

Store rank as the source of truth, not precomputed floating-point weights:

```ts
type RankedReferencePreference = {
  referoId: string;
  version: number;
  rank: 1 | 2 | 3;
  note: string;
};
```

Downstream prompts receive the ordered list and the plain-language rule “earlier selections have more influence.” They must not blend token values mathematically or average styles into a generic middle. The primary reference establishes the foundation; second and third references contribute only the specific details named by the user.

This follows the existing reference-lock doctrine and prevents a numeric weighting formula from implying precision the system cannot guarantee.

### 7.3 Backward-compatible state

Keep the current untagged persisted selection as the compatibility envelope and extend it additively:

```ts
type PersistedReferenceSelection = {
  // Existing required fields stay present on historical and new records.
  selectedId: string;
  selectionKind: "user-picked-recommended" | "user-picked-other";
  version: number;
  at: string;
  note?: string;
  ranked?: {
    schemaVersion: 1;
    checkpointId: string;
    preferences: [RankedReferencePreference, ...RankedReferencePreference[]];
    overallNote?: string;
    sourceMode: "guided";
    fingerprint: string;
  };
};
```

- The exact existing untagged object remains a first-class parse shape. Reads do not tag it or rewrite `run.json`.
- New guided selection derives the compatibility fields from rank 1: `selectedId`, `version`, `selectionKind`, and `note`; server assigns `at`. Current Developer/evidence clients therefore continue to read a selected checkpoint.
- New guided selection additionally stores `ranked.preferences: [1..3]`, `overallNote` (trimmed, maximum 2,000 characters), source mode, checkpoint ID, and canonical payload fingerprint.
- The request union is discriminated by action: existing `{action:"select", selectedId, note?}` stays valid; guided mode sends `{action:"select-ranked", preferences, overallNote?}`. Mixed payloads are rejected.
- Server normalization to ranked form happens once in a shared reference-selection domain helper used by the API, replay check, `finalizeReferenceLock`, and Page IR reference-contract derivation. An untagged legacy record normalizes to one rank-1 preference in memory only.
- Every preference must point to a candidate in the referenced `ReferenceSelectionVersionSchema` entry. The version is copied from the candidate set that displayed the card, never accepted as an unrelated client assertion.
- Ranks must be unique, contiguous, and match array order.
- A candidate may appear only once.
- Once selected, the set is immutable for that controller checkpoint. A lock-generation failure keeps the same persisted selection and the existing failed-stage recovery retries the lock without reselection. A new choice is allowed only if a future explicit evidence revision transition reopens the reference-selection checkpoint with a new `checkpointId`; that transition is not created implicitly by errors or mode changes.
- The selection endpoint persists inside the existing per-run transaction before the client calls `/api/run`. The server—not the client—assigns `at`, `sourceMode`, `checkpointId`, and `fingerprint`. The digest covers only server-derived checkpoint ID plus canonical trimmed `preferences` and `overallNote` with sorted object keys; timestamps and source mode are excluded.
- An identical ranked retry against the same checkpoint returns 200 when that server-computed digest matches and does not create another transition. Any different ranked payload, a ranked submit after a legacy selection, or a legacy submit after a ranked selection returns 409 and does not mutate. `/api/run` remains checkpoint-driven and coalesces concurrent execution, so a retry after persist-before-resume continues once.
- Developer mode sees the unchanged compatibility fields and `status=selected`, never shows/posts a second legacy choice, and continues to render its existing view unchanged.

### 7.4 Downstream use

`stageLock` produces one backward-compatible `ReferenceLock` with:

- primary foundation from rank 1;
- borrowed details from ranks 2–3, limited to the user’s notes;
- ranks 2–3 mapped into the existing `borrowedDetails` slots (maximum two), using each required note as the specific intended detail;
- an optional additive `preferenceLedger` recording all chosen references, per-reference notes, ranks, and `overallNote`; absence/default-empty keeps historical lock artifacts valid;
- no competitor source used as design inspiration unless the owner explicitly creates a separate future action.

The same normalizer maps rank 1 to the single `primary` `ReferenceContractV1` source and ranks 2–3 to `supporting`, bounded by `PAGE_IR_BOUNDS.maxReferenceSources=3`. Template and Page IR layout authorities therefore consume the same ordered reference set.

Reference names, crawled competitor text, and user notes enter model prompts only through the existing bounded untrusted-data context, never system/developer instructions. Reference notes cannot introduce a competitor URL or competitor ID as a design reference; such text remains ordinary preference prose and does not change the locked source set.

## 8. Design system summary and approval

After the lock/design stage, guided mode presents a compact visual summary drawn from existing artifacts:

- look and feel / north star;
- primary and support colors with role labels;
- display and interface type specimens with representative sizes;
- spacing/radius/surface character;
- the key layout and imagery rules influenced by each ranked preference.

This is a summary, not a second editing authority. Detailed token review, motion review, revision, approval, and preview continue through the existing evidence workspace and human gates.

## 9. Reference-pattern lock

The approved One-Box Midnight Instrument remains the visual foundation.

Interaction patterns borrowed from current Refero research:

- **ElevenLabs style-choice flow:** visual cards, unmistakable selected state, then a separate Continue action.
- **ALO guided onboarding:** one focused question, clear progress, generous whitespace, and quick option selection.
- **Parallel Deep Research:** plain-language run progress plus expandable source/basis detail after completion.

Adaptation rules:

- Keep OneBox tokens, typefaces, density rules, and accent semantics.
- Borrow journey structure and disclosure behavior, not the references’ colors or brand expression.
- Use one lime primary action per view; use teal only for map semantics; reserve coral for route-back/flagged states.
- Do not add a permanent dashboard sidebar to guided mode.

## 10. Reliability, security, and privacy

- No arbitrary competitor iframe embedding.
- Do not expose `scan.json` directly as the guided read model. The narrow GET endpoint must use the existing `isLocalApiAuthorized` policy, validate the run ID, load through run-state helpers, return only the typed projection, set `Cache-Control: no-store`, and reject missing/foreign/non-directory/symlinked run roots. Endpoint tests cover unauthorized requests and a different run ID.
- All screenshot/artifact URLs must remain run-confined and origin-checked through existing site-serving guards. Screenshot metadata is accepted only for allowlisted image content types and confined paths.
- Validate every new endpoint input and response with schemas in `src/lib/contracts.ts`.
- Treat competitor page content, titles, analysis, and user notes as untrusted text; render as text, not HTML, and pass them to models only through bounded untrusted-data prompt sections.
- External links use explicit external-link treatment and safe `rel` values.
- The view toggle cannot affect spending, provider choice, run execution, approvals, or deployment.
- Preserve exact resume/checkpoint behavior across page refresh and mode changes.
- A browser disconnect must not misreport a completed run as failed; guided status derives from saved run/artifact state after reconnect.
- Crawled pages, screenshots, structured analysis, and user preference notes stay in the existing ignored `sites/<runId>/` run directory and follow the run’s existing local deletion/retention lifecycle. This feature adds no remote analytics, sync, or durable store. UI copy reminds the user not to enter secrets or personal data in preference notes.

## 11. Accessibility and responsive behavior

- Full keyboard support for toggle, candidate selection, ranking, dialogs, tabs, and all actions.
- Visible focus states and minimum 44px touch targets on mobile.
- Expanded competitor detail is an accessible dialog that traps and restores focus, closes with Escape, and has an explicit close control.
- Selection cannot rely on color; rank label, check state, and accessible name are all present.
- Text fields have persistent labels and character guidance.
- Motion respects reduced-motion preference. JavaScript-disabled testing applies to generated-site preview documents; the OneBox guided controller itself requires JavaScript/SSE.
- Target WCAG 2.2 AA for the guided product UI.
- Desktop target: 1440px. Intermediate: 768px. Mobile: 390px and 320px overflow check.
- On mobile, map and competitor cards stack; ordered preferences use buttons rather than drag as the primary reorder control.

## 12. Verification strategy

Implementation begins with failing tests for:

1. presentation-mode default, persistence, and query override;
2. developer projection equivalence/no API side effects when toggled;
3. legacy and ranked reference-selection contract parsing;
4. rank uniqueness/contiguity, candidate membership, and one-to-three limits;
5. idempotent confirm and conflict behavior;
6. reference-lock normalization and ordered ledger propagation;
7. competitor analysis contract and legacy `notes` fallback;
8. guided research states: running, ready, unavailable, missing screenshot;
9. competitor expansion keyboard/focus/Escape behavior;
10. reference picker add/remove/reorder/note/confirm behavior;
11. reconnect from saved run state without false failure.
12. every current pause/error/terminal in the state-to-surface matrix, including unknown-state fail-closed behavior;
13. inverted Yelp-order competitor fixture and 0/1/2–4/>4 cardinality;
14. cross-tab ranked-vs-legacy submission conflict and developer-mode read compatibility;
15. unauthorized/different-run research projection requests;
16. prompt-injection-like competitor text and preference notes remaining bounded data.

Required completion proof:

- focused unit/API/component tests;
- full test suite, typecheck/lint, and production build;
- browser verification at 1440, 768, 390, and 320 widths;
- reduced-motion and keyboard-only pass;
- console/page-error pass;
- Axe severity pass;
- developer-mode regression comparison against the current view;
- independent senior code review plus a final Grok 4.6 audit of the bounded implementation diff;
- clean Git state and explicit branch/SHA handoff. No production deployment without separate approval.

## 13. Delivery slices after approval

1. Typed guided research projection and richer competitor analysis artifact, hidden from the default UI.
2. Ranked reference preference contracts, API, lock propagation, and cross-mode compatibility.
3. Guided research/map/competitor UI behind an internal incomplete feature gate.
4. Guided reference chooser, full controller state matrix, reconnect behavior, and design-system summary behind the same gate.
5. Presentation-mode shell and unchanged developer projection; only now remove the incomplete gate and make guided the default.
6. Cross-mode regression, accessibility, reconnect, and full verification.

Each slice must preserve passing tests and remain independently reviewable. Guided mode cannot become the default until slices 1–4 are complete, so incremental delivery cannot strand non-developer users.

## 14. Owner decisions captured by approval

Approving this design confirms:

1. Guided mode is OFF/default; developer mode is ON/incumbent.
2. Both modes project one pipeline rather than creating separate controllers.
3. Competitor previews use captured screenshots plus external links, not live iframes.
4. One to three Refero choices are ranked by order; rank is authoritative and notes describe the borrowed detail.
5. The primary reference sets the foundation; later references contribute named details rather than mathematical style averaging.
6. Existing human approval gates remain authoritative.
