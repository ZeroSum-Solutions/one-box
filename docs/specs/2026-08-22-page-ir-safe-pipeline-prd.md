# ONE BOX — production Page IR and safe candidate pipeline

- **Status:** Approved by owner, 2026-08-22
- **Product boundary:** Website generation only
- **Prepared:** 2026-08-22
- **Source checkpoint:** `6561b19b0d613e8fe891fe700760e414153cb1b4`
- **Delivery mechanism:** dependency-ordered tickets under `docs/tickets/page-ir-safe-pipeline/`
- **Evaluation contract:** `docs/eval/page-ir-safe-pipeline/`

## Decision summary

Phase 1 makes ONE BOX truthful and safe before making it broader.

1. **Website is the only production target.** Web app and iOS are not production
   choices until each has its own output contract, compiler, fixtures, and promotion
   bar. Existing non-website runs remain readable and exportable, but cannot start a
   new generation or rebuild under the Phase 1 pipeline.
2. **A candidate must pass every blocking gate before it can replace the served
   site.** Repair operates on the candidate, never on the live site.
3. **`PageIRV1` becomes the validated input to a deterministic website compiler.**
   Models may propose structured inputs; they may not author executable HTML, CSS, or
   JavaScript for the production path.
4. **One layout authority is selected once per run.** The Page IR path and frozen
   template path are never blended. Template fallback creates a separately identified
   run; it never changes a failed Page IR run's authority.
5. **Existing human evidence and visual-approval gates remain authoritative.** A
   model review can find problems; it cannot publish or approve a site.
6. **Agents, Puck, visual-json, and json-render remain future experiments.** They do
   not replace the pipeline controller, schema validation, deterministic compiler,
   mutation authority, mechanical gates, or human approval in Phase 1.

## Problem

The current pipeline has several strong controls but an unsafe seam between building
and publishing:

- `buildSite()` builds into `site.building` and calls `publishBuild()` to move it into
  `site/`, but that publication occurs before `runGates()` evaluates the completed
  output.
- The single build-repair pass edits files in the already-served `site/` directory.
- Editor mutations use `runGuardedMutation()` with locking, snapshots, gate checks,
  rollback, and visual-approval invalidation. Initial builds do not yet use an
  equivalent candidate transaction.
- Generated structure is still controlled by the frozen `templates/local-service/`
  registry. Selecting Web app or iOS only decorates that website output with a thin
  wrapper, so the product currently promises more than it delivers.
- Design artifacts and section choices do not compile through one closed,
  versioned page representation. This makes structural variety, replay, provenance,
  and safe validation harder to prove.

The result is a product that can show a failing build, can repair a live directory,
and can label a reskinned website as another product class. Phase 1 removes those
failure modes without introducing a general autonomous agent runtime.

## Users and jobs

### Primary user

The owner/operator building and refining a client website locally.

### Jobs to be done

- Turn approved evidence and a website brief into a client-specific website.
- See only a last-known-good site, even while a new candidate is building or failing.
- Resume a stopped run without buying the same model work again.
- Understand whether the run used Page IR or the frozen-template fallback and why.
- Edit content, tokens, assets, layout, and motion without bypassing relevant gates.
- Review and explicitly approve visual quality after mechanical checks pass.

## Product principles

- **Truth before breadth:** only advertise production capabilities the engine can
  demonstrate.
- **Candidate before publish:** no unverified bytes become the served site.
- **Data, not executable instructions:** model output is validated structured data.
- **One authority:** no competing renderer or hidden second source of layout truth.
- **Fail closed, recover clearly:** preserve the last-known-good site and state what
  stopped the candidate.
- **Deterministic proof before judgment:** mechanical checks establish invariants;
  named humans decide visual acceptance.
- **Reuse proven controls:** extend the current site authority, run-state, evidence,
  and gate systems instead of replacing them.

## Scope

### In scope

- Website-only production intake and server enforcement.
- Compatibility policy for existing Web app and iOS records.
- Versioned `ReferenceContractV1`, `LayoutProgramV1`, and `PageIRV1` schemas in
  `src/lib/contracts.ts`.
- Pure derivation of `PageIRV1` from approved inputs.
- Deterministic compilation of Page IR to a static website candidate.
- Candidate manifest, full gate execution against the candidate, candidate-only
  repair, atomic promotion, rollback, locking, and crash recovery.
- One immutable layout-authority decision per run and an explicit, separately created
  template fallback run.
- Stable editor IDs and build/mutation/approval provenance.
- Capability-aware after-edit gate routing.
- Automated regression coverage for the attached UX review notes.
- A versioned evaluation corpus spanning materially different website purposes.
- Controlled rollout, kill switch, and production qualification.

### Out of scope

- Production Web app or iOS generation.
- Multi-page application logic, databases, accounts, checkout, or native binaries.
- Adding Hermes, Pi, Deep Agents, Puck, visual-json, json-render, Chakra UI, Ant
  Design, Gin, or mojs to the production runtime.
- Letting a model or agent publish, approve evidence, approve visual QA, or weaken a
  gate.
- Model-authored arbitrary HTML, CSS, JavaScript, filesystem paths, commands, or URLs.
- Hosted or multi-user deployment.
- Replacing the evidence workflow, local API boundary, current editor, or human
  visual-review contract.
- Reopening unrelated draft work such as workspace tabs or reference capture.

## Requirements

### Scope and product truthfulness

- **REQ-SCP-001:** New production runs expose and accept only the `website` target.
- **REQ-SCP-002:** Every server boundary that can create or restart generation rejects
  a new `web-app` or `ios-app` request; hiding a UI control alone is insufficient.
- **REQ-SCP-003:** Existing non-website runs remain readable and exportable. They are
  visibly marked legacy/experimental and cannot generate, rebuild, repair, edit, or
  generate/place assets through Phase 1.
- **REQ-SCP-004:** Product copy, help text, events, and persisted state never describe
  a template wrapper as a production Web app or iOS deliverable.

### Page IR contracts

- **REQ-IR-001:** `ReferenceContractV1`, `LayoutProgramV1`, and `PageIRV1` are closed,
  versioned Zod contracts defined in `src/lib/contracts.ts`; unknown fields fail.
- **REQ-IR-002:** `PageIRV1` represents website structure, semantic content slots,
  token references, asset references, constrained interactions, responsive intent,
  accessibility metadata, and stable editor identity without carrying executable
  source text.
- **REQ-IR-003:** Page IR cannot contain arbitrary HTML, CSS, JavaScript, event
  handlers, filesystem paths, commands, unbounded data URLs, or unvalidated external
  URLs.
- **REQ-IR-004:** Cross-references, required landmarks, unique IDs, section nesting,
  asset existence, action targets, and token references are validated before compile.
- **REQ-IR-005:** The derivation step consumes only approved/version-bound evidence,
  design, token, Tailwind, CSS-architecture, content, and asset inputs and records
  their hashes.
- **REQ-IR-006:** The same validated Page IR, compiler version, and asset set produces
  byte-identical output and a byte-identical deterministic candidate manifest. Runtime
  timestamps and operator events live in a separate provenance envelope.
- **REQ-IR-007:** Every rendered editable element has a stable ID derived from Page IR,
  not DOM position or a model-generated selector.
- **REQ-IR-008:** Existing schemas are migrated explicitly. No persisted record is
  silently reinterpreted as Page IR.

### Layout authority and fallback

- **REQ-LAY-001:** A run records exactly one immutable layout authority:
  `page-ir-v1` or `template-v1`.
- **REQ-LAY-002:** Page IR and template output are never merged in one run.
- **REQ-LAY-003:** Template fallback never changes an existing Page IR run. It creates
  a new `template-v1` run linked to the failed Page IR run with a bounded reason code;
  the original run and its failure remain immutable and observable.
- **REQ-LAY-004:** Existing runs default to `template-v1`; a new run may use
  `page-ir-v1` only when the rollout policy permits it.
- **REQ-LAY-005:** Replaying or resuming a run cannot switch layout authority.

### Candidate lifecycle

- **REQ-BLD-001:** Initial builds and rebuilds render into a run-scoped candidate that
  is not served by the site route.
- **REQ-BLD-002:** The full blocking gate suite runs against the candidate root, not
  the live site directory, and writes candidate-scoped reports. Candidate evaluation
  cannot replace the live site's current gate report. On a failed rebuild, the live
  site and live gate report remain byte-for-byte unchanged.
- **REQ-BLD-003:** A first build with a blocking failure publishes no site. A rebuild
  with a blocking failure leaves the last-known-good site byte-for-byte unchanged.
- **REQ-BLD-004:** Automated repair may change only allow-listed candidate artifacts
  and cannot mutate approved evidence artifacts or the live site.
- **REQ-BLD-005:** After repair, the full blocking suite runs again against the same
  candidate. Repair success is never inferred from model output.
- **REQ-BLD-006:** Promotion uses one site-authority lock and atomically replaces one
  self-contained live bundle containing both the site and its canonical gate report.
  A failed promotion restores the previous site and live gate report byte-for-byte.
  Any run-root compatibility copy is derived and non-authoritative.
- **REQ-BLD-007:** Candidate state distinguishes preparing, ready-for-gates, failed,
  promotable, promoted, and abandoned outcomes and records timestamps and hashes.
  Failed diagnostic retention is capped at one candidate per run, 100 MiB, and 24
  hours; cleanup never deletes the live site or approved evidence.
- **REQ-BLD-008:** Startup/resume safely identifies and resolves interrupted candidate
  and retired directories without deleting the last-known-good site.
- **REQ-BLD-009:** A successful promotion invalidates prior human visual approval and
  produces a new reviewable visual-QA artifact bound to the promoted build hash. A
  stale or absent approval blocks release/export/client handoff, while preview and
  further editing remain available.

### Editing and gates

- **REQ-EDT-001:** Every generated-site mutation continues through one guarded site
  authority. No endpoint writes around it.
- **REQ-EDT-002:** Mutations are classified into closed capabilities such as content,
  token/style, asset, structure, link/action, and motion before mutation.
- **REQ-EDT-003:** A versioned capability-to-gate matrix selects the required gates;
  an unknown capability or uncertain classification runs the full suite.
- **REQ-EDT-004:** Gate selection cannot omit a gate affected by the changed artifact.
  Negative tests prove each routing rule by injecting a defect that the selected gate
  must catch.
- **REQ-EDT-005:** Rejected mutations restore all changed files and the prior gate
  report byte-for-byte, including when the restorative gate run fails.
- **REQ-EDT-006:** A committed mutation invalidates visual approval only after gates
  and commit complete.
- **REQ-EDT-007:** For a `page-ir-v1` run, Page IR is the editable source of truth.
  Every supported edit applies a typed IR mutation, validates, recompiles to a
  candidate, runs the required gates, and promotes atomically. A direct compiled-file
  mutation is rejected for Page IR runs; an unsupported capability is reported rather
  than silently forking authority. `template-v1` runs may retain the existing guarded
  compiled-site mutation path.

### UX reliability and review-note disposition

- **REQ-UX-001:** Intake retains one prominent prompt composer with progressive
  controls and no competing prompt surface.
- **REQ-UX-002:** Long prompts auto-grow from 120px to `min(360px, 50dvh)`, remain
  internally scrollable at the cap, preserve focus, and do not obscure the primary
  action.
- **REQ-UX-003:** Starting a build moves focus/viewport to an explicit attempt state;
  failures preserve prompt and settings and provide Retry and Edit prompt actions.
- **REQ-UX-004:** A real 403 is described as a local authorization failure without
  claiming a cross-origin upload when none occurred. The security guard is not
  weakened to improve the message.
- **REQ-UX-005:** Failed uploads retain safe client-side selection where possible,
  distinguish authorization, validation, and transport failures, and support an
  idempotent retry.
- **REQ-UX-006:** Workbench resizing, device widths, collapse/reopen, rail labels,
  tooltips, keyboard operation, and touch targets remain regression-protected.
- **REQ-UX-007:** The project image library and explicit image-generation controls
  retain provenance, retry safety, consent boundaries, placement, and replacement.
- **REQ-UX-008:** Output quality is evaluated across multiple website purposes for
  structure, hierarchy, specificity, responsive composition, accessibility, and
  reference alignment—not merely token or color variation.

### Operations and provenance

- **REQ-OPS-001:** Build provenance records input artifact hashes, Page IR hash,
  compiler version, layout authority, deterministic candidate-manifest hash,
  candidate-scoped gate-report hash, promoted build hash, and linked fallback-run
  reason where applicable.
- **REQ-OPS-002:** Resume/replay reuses valid checkpoints and does not repeat a model
  call solely because the client disconnected.
- **REQ-OPS-003:** Retry allowances are claimed and released transactionally; a read,
  validation, transport, or write failure cannot silently consume an attempt.
- **REQ-OPS-004:** Operators can distinguish candidate failure, repair failure, gate
  failure, promotion failure, and recovery action without reading raw logs.
- **REQ-OPS-005:** Page IR has a default-off rollout flag and a one-action kill switch
  back to `template-v1` for new runs. Existing run authority remains immutable.
- **REQ-OPS-006:** A production promotion decision requires the frozen evaluation
  manifest, passing deterministic checks, no open P0 findings, and named human visual
  approval on the qualification corpus.

### Security and authorization

- **REQ-SEC-001:** Existing loopback, same-origin, upload, iframe-origin, evidence
  approval, credential, and paid-provider boundaries remain unchanged or stronger.
- **REQ-SEC-002:** Candidate and IR paths are derived from validated IDs and closed
  enums; traversal, absolute paths, symlinks, and unexpected files fail closed.
- **REQ-SEC-003:** Untrusted research, uploads, and model output remain data. They
  cannot select a filesystem target, publish action, gate result, or approval state.
- **REQ-SEC-004:** Candidate manifests use a regular-file allow-list, size bounds, and
  hashes before promotion.
- **REQ-SEC-005:** No model credential or live provider is required to run the
  deterministic contract, compiler, candidate, security, and replay evaluations.

## Architecture

```text
approved evidence + design + content + assets
                    |
                    v
      ReferenceContractV1 + LayoutProgramV1
                    |
          validated derivation
                    v
                PageIRV1
                    |
        deterministic compiler
                    v
          unserved candidate directory
                    |
         full gates -> bounded repair -> full gates
                    |
       site-authority lock + atomic promotion
                    v
             last-known-good site
                    |
          named human visual approval
```

The schema implementation belongs in `src/lib/contracts.ts`. This PRD specifies
required semantics but intentionally does not create a parallel docs-only runtime
schema. The compiler must be pure with respect to approved inputs; timestamps and
runtime metadata belong in a separate provenance envelope, not compiler output or the
deterministic candidate manifest.

### Candidate invariant

At all times, the live site bundle means “last candidate and candidate-scoped gate
report that passed every blocking mechanical gate and completed atomic promotion.”
The canonical live gate report moves with that bundle; a run-root compatibility copy
cannot determine status. A `.building` directory is not a candidate contract, and a
candidate is never a served fallback. Failed candidate bytes are never mistaken for
the current site. Failed diagnostics are limited to one candidate per run, 100 MiB,
and 24 hours as specified by `REQ-BLD-007`.

### Repair invariant

Repair receives a structured gate report and a closed list of repairable candidate
artifacts. It may propose validated data or bounded diffs only for those files. It
cannot change layout authority, approved evidence, the gate set, or the live site.

### Gate-routing invariant

The initial candidate always receives the full suite. After-edit routing is an
optimization, not a weaker standard: every route has negative fixtures, and unknown
or mixed changes receive the full suite.

### Page IR edit invariant

For `page-ir-v1`, the persisted Page IR is authoritative and the compiled site is a
derived projection. An edit cannot write the projection directly. It must update the
validated IR and travel through compile, candidate gates, and promotion. An
edit-then-rebuild therefore preserves the edit by construction. Existing
`template-v1` runs continue through the current guarded-file mutation authority and
cannot be relabeled as Page IR.

## Evaluation corpus

Phase 1 remains a static website system, but “website” must not mean one local-service
shape. Qualification uses at least these purpose-level fixtures from
`docs/WEBSITE-CATEGORIES.md`:

1. Brochure/presence local service.
2. Portfolio/showcase.
3. Product/SaaS marketing site, without implementing the product application.
4. Editorial/media landing or index.
5. Campaign/landing page.
6. Institutional/nonprofit presence.

Commerce checkout, Web application/portal, and native iOS remain excluded. A fixture
passes only when its rendered topology and conversion structure fit its purpose; a
restyled copy of the local-service skeleton is an automatic quality failure.

## Attached UX review disposition

The attached `OneBox UX Review Notes.md` is evidence, not an implementation command.
Its observations enter this plan as follows:

| Observation | Current disposition at source checkpoint | Phase 1 treatment |
|---|---|---|
| One prompt composer | Implemented | Regression evaluation |
| Explain project types | Explanations implemented; output contract was not truthful | Website-only production enforcement |
| Long-prompt resizing | Implemented | Regression evaluation |
| Post-Send disorientation and 403 | Recovery UI implemented; live failure not yet reproduced on this checkpoint | Reproduction evaluation; P0 ticket only if reproduced |
| Misleading upload error | Error classes and retry implemented | Security/message regression evaluation |
| Output below quality bar | Active | Page IR corpus and human quality rubric |
| Editor chrome and device widths | Largely implemented | Workbench regression evaluation |
| Image generation and library | Implemented | Feature/safety regression evaluation |
| Text and button editing | Validated capability | Preserve through mutation evaluations |

No resolved observation becomes a duplicate bug solely because it appears in the
notes. A regression that reproduces on the source checkpoint creates or reopens a
ticket with captured evidence.

## Success measures

- Zero requests can start a new production Web app or iOS run through UI or API.
- Zero candidate bytes are served before all blocking gates pass.
- Every injected build, repair, promotion, and recovery failure preserves the
  last-known-good site hash.
- Recompiling the same Page IR fixture produces identical content hashes across ten
  clean runs.
- All schema and security negative cases fail closed.
- Stable editor ID coverage is 100% for rendered editable elements in the corpus.
- Every after-edit routing rule has at least one defect-seeding negative test.
- All six website-purpose fixtures pass blocking gates at desktop, tablet, mobile,
  reduced-motion, and no-JavaScript conditions where applicable.
- Each qualification fixture receives a passing named human visual review; model
  review is advisory and cannot satisfy this measure.
- No open P0 ticket and no unresolved critical/high security finding remains at
  promotion.

## Rollout

1. **Foundation:** enforce Website-only intake and build the candidate transaction
   while retaining the current template authority.
2. **Opt-in:** allow named local runs to choose `page-ir-v1` at creation. The choice is
   immutable and visible.
3. **Qualification:** freeze and execute the evaluation manifest. Resolve all P0s and
   obtain named human visual approvals.
4. **Default-on:** make Page IR the authority for eligible new Website runs. Keep the
   new-run kill switch to `template-v1`.

Rollback never changes an existing run's authority. It affects only future runs and
preserves all failed-run provenance. If an operator needs template fallback for a
failed Page IR run, ONE BOX creates a new linked `template-v1` run rather than
rewriting or resuming the failed run under another authority.

## Model-review policy

- PRD, evaluation, and ticket documents receive independent adversarial review from
  Opus 5 and Grok 4.6.
- Code produced during implementation is reviewed by Grok 4.6 only, per owner
  instruction. Opus is not sent that code.
- Deterministic tests, security checks, and named human approvals remain authoritative
  regardless of model verdict.

## Phase 1 exit criteria

Phase 1 is complete only when:

1. All tickets in the approved Phase 1 ticket manifest are closed with linked evidence.
2. The frozen eval manifest validates and all blocking evaluations pass.
3. The six-fixture qualification packet is complete and reproducible.
4. The owner reviews the packet and supplies named human visual approval.
5. Documentation accurately identifies Page IR as default-on or still opt-in.
6. GitHub issues, if created, match the approved repo-native ticket source without
   changing IDs, requirements, dependencies, or acceptance criteria.
