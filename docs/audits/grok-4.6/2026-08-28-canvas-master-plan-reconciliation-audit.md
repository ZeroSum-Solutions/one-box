# Grok 4.6 audit — Canvas master-plan reconciliation

- Date: 2026-08-28
- Reviewer: `x-ai/grok-4.6`
- Provider: OpenRouter
- Verdict: `PROCEED_WITH_CONDITIONS`
- Scope: product and architecture reconciliation only; no implementation authorization

## Executive verdict

The shared-platform approach is the only proposed option that preserves the frozen
website-only production boundary while leaving room for a later Web-app product.
Proceed with option 1, but do not describe the current synthesis as a frozen master
plan until the two blocking conflicts and the authority/traceability gaps below are
closed.

Track A must remain a website-first production program built on Page IR, typed Canvas
mutations, private version-bound client review, agency qualification, immutable
deployment, public-origin verification, and appointment activation owned by the
appointment contract. Track B may initially share named Canvas chrome and interaction
patterns only. It cannot share the website IR, compiler, runtime, auth/data model,
gate catalog, promotion authority, or production claim.

## Blocking conflicts

### G-B1 — Production target conflict

The candidate domain “intake and targets” is too broad. The frozen Page IR contract
requires every new production surface and server boundary to expose and accept only
`website`. Older Refero/editor briefs that show Website, Web app, and iOS targets are
superseded for production intake.

Required correction:

- Freeze Track A intake to website-only in both UI and API.
- Keep existing non-website records readable/exportable but legacy/experimental and
  non-startable.
- Put Web-app and iOS target selection only inside their future tracks after each has
  an output contract, compiler, fixtures, security model, release gates, and owner
  promotion decision.

Sources:

- `docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md` — scope and `REQ-SCP-*`
- `docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md` — non-goals
- `docs/specs/2026-08-13-refero-editor-requirements.md` — older `IMP-032/033`

### G-B2 — Canvas mutation-authority conflict

The approved Canvas-upgrade interaction model predates Page IR and still contains
template/DOM-specific constraints. It cannot remain co-equal with Page IR source
authority.

Required correction:

- The Canvas-upgrade spec retains authority over interaction UX: selection, parent/
  child navigation, scoped chat, device frames, workbench chrome, diff, undo, and
  history where not superseded.
- Page IR owns the editable source and typed mutation path for `page-ir-v1` runs:
  validate, compile a candidate, run affected gates, and promote atomically.
- `template-v1` keeps the guarded compiled-site mutation path.
- One run has one immutable layout authority; Page IR and template output never merge.

Sources:

- `docs/specs/2026-08-16-canvas-upgrade.md` — binding constraints
- `docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md` — `REQ-LAY-*`, `REQ-EDT-007`
- `docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md` — domain ownership

## Major conditions

1. Copy the lifecycle document's domain-ownership matrix into the master plan. Recency
   alone is not precedence. Page IR owns candidate generation/promotion; Canvas owns
   editor interaction; the appointment PRD owns acquisition; the shipping design owns
   cross-system lifecycle orchestration.
2. Keep client review and deployment as Track A lifecycle modules, not generic shared
   Canvas primitives. Public review invitations, provider selection, credentials, and
   production deployment retain separate security and owner-authorization gates.
3. Treat workspace tabs/reference capture as an unapproved draft. Preserve only
   unsuperseded requirements until the feature is re-approved under frozen contracts.
4. Treat the Refero conversational editor as one advice/proposal source, not an
   autonomous mutation runtime. The accepted path is scoped proposal, user acceptance,
   typed mutation, capability-to-gate routing.
5. Map the recovered Mac mini feature ranking onto the existing shipping roadmap. Its
   five selected features are useful capability evidence, not a replacement MVP or a
   reason to reorder P1-P8.
6. Treat prompt-engine motion as a bounded quality default with reduced-motion and
   interaction gates, not as authorization for a new runtime or Web-app scope.
7. Keep agency qualification and evidence-bound SEO separate from Canvas editing.
   Changes to Page IR or generated-site schemas require the explicit P4 schema-diff
   approval gate.

## Missing master-plan domains

- Closed lifecycle states, compare-and-swap revisions, receipts, and approval
  invalidation.
- Immutable per-run layout authority, template fallback, Page IR rollout flag, and
  kill switch.
- Evidence, design-contract, and token approval as human-authoritative pre-generation
  inputs.
- Appointment presentation slot and PRD-owned publication, activation, downshift, and
  blocking.
- Review-origin and deployment-credential threat models.
- Frozen evaluation corpus, independent verification, qualification packet, and named
  production-promotion approval.

## Required deduplication

| Overlapping concepts | Reconciled capability |
|---|---|
| Canvas scoped chat, shipping typed mutation, Refero editor agent | Scoped proposal -> user accept -> typed mutation -> affected gates; never self-apply |
| Reference tabs, attachments, capture draft, Refero lock | One provenance-bound design-direction lock; capture implementation remains unapproved |
| Checkpoints, undo/history, candidate versions, rollback | Candidate hash is version identity; guarded restore reruns gates and cannot inherit approvals |
| Quality navigator, continuous checks, qualification queue | One receipt-backed issue navigator; result is rerun, designer proposal, or blocker—never waiver |
| Asset import, image library, shipping asset gates | One project library with validation, lineage, rights metadata, hash binding, placement, and rollback |
| Responsive comparison, device frames, client review | True viewports against one candidate hash, never visually scaled shells |
| Run library, resume/replay, lifecycle states | One local project home with state, authority, cost, activity, and correct Resume/Evidence/Preview actions |
| Metadata editor, technical SEO, SEO source contract | Deterministic SEO from approved facts and structure; no freeform invented-fact CMS |

## Website and Web-app boundary

### Shared interaction primitives

- Canvas shell chrome, pan/zoom, and workbench rail
- direct selection and parent/child navigation patterns
- evidence/research and provenance presentation patterns
- token/design-system inspection UX
- asset-library UX and lineage concepts
- history, diff, and restore interaction patterns

### Website-only production contracts

- `PageIRV1` / `template-v1` layout authority and deterministic static compilation
- website candidate manifest, Canvas-entry gates, and site-authority promotion
- client lock, agency qualification, immutable deployment, and public-origin verification
- technical SEO compiler and SEO truth boundary
- typed appointment presentation slot

### Required before Web-app production

- a separate Application IR and runtime
- data, authentication, authorization, and integration contracts
- a Web-app threat model
- Web-app fixtures and evaluation corpus
- Web-app-specific release gates
- a named owner production-promotion decision

## Recommended program order

1. `A0` — Freeze authority, supersession, and website-only production boundaries.
2. `A1` — Lifecycle foundation (`P1`).
3. `A2` — Preserve the Page IR candidate path and immutable layout authority.
4. `A3` — Typed Canvas mutation and approval automation (`P2`).
5. `A4` — Canvas capability slices: asset import, responsive comparison,
   checkpoints/diff/restore, quality navigator, and run library.
6. `A5` — Version-bound local/test client review (`P3`).
7. `A6` — Agency qualification and evidence-bound SEO (`P4`).
8. `A7` — Release Orchestrator and fake provider (`P5`).
9. `A8` — Separately authorized production provider (`P6`).
10. `A9` — Appointment integration after PRD acceptance (`P7`).
11. `A10` — Qualification corpus, independent verification, and rollout (`P8`).
12. `B0` — Web-app appendix containing shared chrome and required new contracts only;
    no production generation.

## Owner decisions still required

1. Confirm option 1: shared Canvas foundation, website-first production, later separate
   Web-app track.
2. Confirm the 2026-08-27 shipping design may serve as lifecycle authority for
   master-plan writing while written-spec review remains pending.
3. Decide whether workspace tabs/reference capture and the Refero editor-agent draft
   should be re-reviewed, deferred, or dropped.
4. Confirm client-review work may be built and tested locally in P3 without enabling
   public invitations.
5. Decide whether motion remains a default inside bounded shipping gates.
6. Decide Track A v1 multi-page scope.
7. Confirm which Mac mini feature-ranked capabilities belong in A4 versus after P5.

## Traceability result

`CONDITIONAL`

The final master plan must map every retained capability to its source requirement or
roadmap gate, record every supersession, label archived-task and ranking material as
discovery evidence, and avoid claiming that approved design direction, draft plans, or
ranked features are implemented.
