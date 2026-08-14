# One-Box Refero editor and evidence workspace

Status: implementation in progress on `codex/refero-editor-goal-complete`, based on merged `main` at `92cb2a1`.

## 2026-08-13 branch-specific current-state record

This record was refreshed on `codex/refero-editor-goal-complete` after the
checkpoint PR merged to `main`. It is an implementation and documentation
inventory, not a release declaration. The current direct test run is `npm test`:
**26 files / 170 tests passed**. Preview, motion, token/motion, intake, smoke,
typecheck, lint, and build have passing checkpoint evidence; the current preview
slice additionally proves live WebGL, scroll parallax, and hover behavior. Live
Refero, a genuine retained v2 project, and the controlled baseline/model
benchmark remain incomplete.

Current protected areas—do not overwrite, reformat, or fold them into a broad
refactor while this goal continues—are:

- `scripts/e2e/token-motion-workbench.mjs` and `scripts/eval/grok-audit.mjs`;
- `src/app/api/evidence/[id]/route.ts` and its test;
- `src/components/EvidenceWorkspace.tsx`, its test, and
  `src/components/preview/MotionControls.tsx`; and
- `src/lib/builder.ts`, `src/lib/evidence.ts`, `src/lib/evidence.test.ts`,
  `src/lib/pipeline.ts`, and the untracked `src/lib/fixtures/` area.

The working tree contains the active workbench/fidelity continuation slice. Re-read
both the worktree and acceptance record before every handoff because a new audit or
live-provider result can invalidate a row's evidence.

External and human gates remain unresolved:

- Devin must complete Refero OAuth for a direct Path B run.
- The ZS Vault/OpenRouter lane must be unlocked for the authenticated Path A run.
- Two independent blinded evaluators and Devin's judge-of-record decision are
  required before the controlled baseline or a routing-policy change can pass.
- Any paid Firecrawl call still needs the per-run explicit consent recorded in
  the artifact provenance; a key alone is never consent.

Verification ownership is deliberately separate from implementation ownership:
the implementation owner supplies focused test and rendered evidence, the
independent verifier checks the acceptance matrix against the branch, and the
release owner decides whether the remaining external gates may be opened. Every
slice retains its stated rollback boundary below; no rollback is authorized by
this record, and no partial row may be presented as release-ready.

This plan extends the prototype plan of record in
`docs/plans/2026-08-12-one-box-prototype.md`. The three briefs supplied on
2026-08-13 govern this extension. Existing security, persistence, source-editing,
quality-gate, and spend-control decisions remain binding unless this plan names a
replacement.

## Success contract

The acceptance source is the versioned contract copied into
`docs/specs/2026-08-13-refero-editor-requirements.md`. It preserves the atomic
`IMP`, `ART`, `EXP`, and `BEN` identifiers from the approved briefs. The build is
complete only when the acceptance matrix links every identifier to a passing
mechanical, rendered, or saved-artifact check.

## Confirmed current state

- The pipeline is a resumable state machine in `src/lib/pipeline.ts`, with Zod
  contracts in `src/lib/contracts.ts`, evidence-gated persistence in
  `src/lib/runstate.ts`, and project artifacts in `sites/<runId>/`.
- Generated sites use the frozen `templates/local-service/` skeleton and are
  served through a CSP-protected catch-all route.
- Preview uses a sandboxed opaque-origin iframe. `public/overlay.js` sends only
  validated selection messages, and `/api/edit` patches pristine source by
  `data-edit-id` before re-running gates.
- Crawl4AI precedes Firecrawl for known URLs and the provider contract records
  attempts/provenance. Its live known-URL and paid-fallback evidence is still
  outstanding; unit coverage alone is not a provider-run pass.
- Competitive scan data and Refero reference-lock data are separate contracts and
  have focused contract/ledger tests, but no complete authenticated project
  workspace has been accepted.
- Intake now exposes Website/Web app/iOS targets, Design Research configuration,
  and upload staging. The preview now has View/Edit mode, a resizable workbench,
  structured element editing, token inspection, and constrained motion controls.
  Those visible behaviors remain partial until the local browser matrices are rerun.
- Evidence workflow versions, approvals, and build authorization have direct unit
  coverage; the complete persisted-project/export/browser route remains pending.
- Existing Phase 4 fixtures cover three prompts and three reference arms. They do
  not substitute for the frozen two-path baseline or expanded model-routing
  benchmark.
- No `/Users/zero-suminc.` path was found in the current source scan. Portability
  still needs a clean-install and cross-Mac verification rather than a text scan.

Historical base: remote `main` was recorded clean at
`5076f9e417566d37dc676a42464a520794faf810` before the original implementation
branch. The active branch for this record is `codex/refero-editor-goal-finalize`;
its intentionally non-clean state is enumerated above rather than treated as a
clean checkpoint.

## Dependency-ordered slices

### 1. Portable baseline and executable test surface

Ownership: `src/lib/tools/crawl.ts`, `src/lib/tools/locallib.ts`, `package.json`,
test configuration, setup documentation.

- Replace machine-specific paths with environment-aware, repository-independent
  resolution.
- Add named test commands for unit, type, smoke, and rendered checks.
- Preserve the crawl4ai-first and explicit Firecrawl-fallback policy.

Verify: clean install, lint, TypeScript, unit tests, production build, gate smoke,
and crawl-provider tests on this Mac. Rollback: revert only the portability and
script commit; no data migration is involved.

### 2. Project, evidence, and approval contracts

Ownership: `src/lib/contracts.ts`, `src/lib/runstate.ts`, evidence routes and
components.

- Add project target, research configuration, upload metadata, evidence stages,
  approval state, design ledger, contract, token proposal, Tailwind plan, CSS map,
  visual QA, and crawler provenance contracts.
- Persist immutable artifact versions and approval transitions under the run.
- Enforce `evidence -> contract -> tokens -> Tailwind plan -> CSS architecture -> build`.

Verify: schema tests cover valid order, invalid skips, revision history, exports,
and separation of business versus design research. Rollback: the new fields are
defaulted and additive; revert the slice without rewriting existing runs.

### 3. Intake, targets, research configuration, and safe uploads

Ownership: intake UI, chat/start-pipeline contract, upload endpoint and tests.

- Use the label `Design Research`: it describes the user benefit and avoids the
  ambiguous internal term “referral research.”
- Add Website, Web app, and iOS targets, an explicit research control, and upload
  intake with documented types, limits, privacy, extraction, and failure states.
- Reject unsafe names, unsupported formats, oversized content, and unapproved
  archives before storage.

Verify: keyboard/UI tests plus endpoint tests for accepted, malformed, oversized,
and traversal inputs. Rollback: the original chat intake remains the fallback when
the new controls are absent.

### 4. View/Edit workbench vertical slice

Ownership: preview page, overlay protocol, editor endpoints, workbench components,
and preview CSS.

- Add explicit View and Edit modes. View loads production behavior without the
  editor overlay. Edit loads the safe overlay.
- Add a persisted resizable workbench, actual iframe viewport resizing, breakpoint
  indicator, and accessible collapsed rail.
- Add distinct select/text-edit/drag states, direct text editing, button label and
  action editing, typography controls, undo/redo, Escape cancellation, focus
  restoration, and clear unsupported states.

Verify: Playwright at desktop, tablet, and mobile widths; direct text/button edits;
navigation in View; keyboard collapse/restore; undo/redo; opaque iframe security.
Rollback: mode and workbench state are client-side additions; the existing
natural-language edit endpoint stays available.

### 5. Token inspection and constrained motion authoring

Ownership: token/motion schemas, workbench tools, edit route, generated runtime.

- Expose semantic tokens, usage scope, affected elements, preview, apply, and revert.
- Add a versioned motion schema for entrance, exit, hover, scroll trigger, and
  timeline sequences. Allow only validated values; never execute user JavaScript.
- Clean up timelines and ScrollTriggers on reload, resize, edit, and unmount; honor
  reduced motion.

Verify: schema rejection tests, lifecycle tests, rendered reduced-motion checks,
and repeated preview-size changes without duplicate effects. Rollback: remove the
motion manifest/runtime and retain existing CSS reveal behavior.

### 6. Evidence-gated pipeline and Tailwind v4 output

Ownership: pipeline stages, builder, token export, template, evidence workspace.

- Persist separate business intelligence and Refero design evidence with source,
  timestamp, confidence, fact/inference labels, and rationale.
- Generate and approve the project design contract, semantic token inventory,
  Tailwind v4 mapping, CSS architecture, and QA checklist before build.
- Keep exported CSS portable and forbid unjustified raw utility values.

Verify: deterministic stage-order tests, design-contract lint/export, token drift,
artifact preview/export, and three-width rendered QA. Rollback: retain prior
artifacts and route new runs through the existing synthesis stage behind a versioned
pipeline flag.

### 7. Controlled baseline and routing benchmark

Ownership: `docs/eval/`, evaluation scripts, fixed fixtures, blinded score data.

- Reuse one versioned brief for the current pipeline and direct Refero workflow.
- Record prompts, sources, intermediate artifacts, outputs, time, cost, repairs,
  and independent findings without using Refero content to train or benchmark a
  model in violation of Refero terms.
- Benchmark representative task classes, including Grok 4.6, Luna, and Terra only
  through approved billing lanes. Keep producers hidden from evaluators.
- Separate confirmed measurements from operating hypotheses and missing data.

Verify: manifest identity checks, blinding/randomization tests, complete score rows,
and a decision log whose routing recommendations follow the registered thresholds.
Rollback: evaluation artifacts do not change runtime routing until a policy version
is explicitly adopted.

### 8. Independent review, documentation, and release gate

Ownership: tests, security report, documentation impact ledger, proof files, PR.

- Run independent Grok 4.6 advisory review per completed slice.
- Run the TypeScript reviewer, security review, project-documentation verifier, and
  independent acceptance verifier.
- Capture command output and rendered evidence for every acceptance-matrix row.
- Open a draft PR with cross-Mac setup and coordination instructions.

Verify: all canonical gates exit zero, security report validates, independent
verdict is PASS, and the `/goal` completion gate reports DONE. Rollback: keep the PR
draft and do not merge if any mandatory gate is incomplete.

## Cross-Mac coordination

Use one feature branch per task and one owner per file group. Before starting, fetch
and branch from the current `origin/main`. Do not share an uncommitted working tree
through file synchronization. Publish work through GitHub, open a draft PR early,
and integrate by reviewed commits. Each machine uses its own ZS Vault and Refero OAuth
session; secrets and OAuth tokens never enter Git. Generated `sites/` data remains
local unless a fixture is deliberately redacted and committed under `docs/eval/`.

## Acceptance and rollback record

The canonical acceptance matrix will live at
`docs/verification/2026-08-13-refero-editor-acceptance.md`. Each row records the
criterion, implementation owner, verification command or rendered artifact, result,
and rollback boundary. A missing or skipped check is not a pass.
