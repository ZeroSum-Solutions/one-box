# ONE BOX architecture baseline

## Shape

ONE BOX is one deployable modular monolith: a Next.js application serving the
intake UI, evidence workspace, preview workbench, and API routes from one
process. Local development uses `npm run dev` on `127.0.0.1:3000`; this document
does not define a hosted deployment or production topology.

[ADR 0002](../adr/0002-target-desktop-cloud-topology.md) proposes a future
desktop/cloud target for the full product. It is not accepted runtime authority,
does not select vendors, and does not supersede this current topology until an
accepted migration proves each extracted seam.

The current repository maps to three logical layers:

```text
src/app/** and src/components/**       app entrypoints and UI
                 |
                 v
src/lib/pipeline.ts, builder.ts,       feature workflows and use cases
  evidence.ts, runstate.ts,
  imageLibrary.ts, siteTokens.ts,
  siteMotion.ts, elementEditor.ts,
  uploads.ts, src/features/uploads/policy.ts
                 |
                 v
src/lib/contracts.ts, fileLock.ts,     platform/shared capabilities
  siteMutation.ts, openrouter.ts,
  src/lib/tools/**, templates/local-service/**
```

The dependency rule is `app → features → platform/shared`. App code owns HTTP,
page composition, and user interaction. Feature modules own pipeline stages,
editing, evidence, run state, uploads, tokens, motion, and the image library.
Platform/shared code owns schemas, locks, guarded filesystem writes, provider
adapters, and the frozen local-service template. Lower layers must not import
pages, route handlers, or UI components. `src/lib/contracts.ts` is the boundary
for persisted and cross-module shapes; changes there require review of every
consumer.

The proposed target organization makes those seams visible. It is an
incremental module layout, not a second process or service topology; directories
may be introduced one seam at a time while current facades remain valid:

```text
src/app/                       pages and route entrypoints
src/features/
  intake/
  runs/pipeline/
    controller/
    stages/
  evidence/
  editor/
  assets/
  uploads/
src/platform/
  ai/
  research/
  storage/
  auth/
src/shared/
  contracts/
  ui/
```

For example, `src/lib/pipeline.ts` remains the stable pipeline facade while
stage implementations move behind it; callers should not need to change just
because a stage changes directory.

The concrete feature roots are `src/features/intake`,
`src/features/runs/pipeline/{controller,stages}`, `src/features/evidence`,
`src/features/editor`, `src/features/assets`, and `src/features/uploads`;
platform roots are `src/platform/{ai,research,storage,auth}`; shared roots are
`src/shared/{contracts,ui}`. Upload policy is the first concrete module at
`src/features/uploads/policy.ts`; the upload workflow remains in
`src/lib/uploads.ts` while later seams are established independently.

## Data and safety boundaries

Each run is rooted at `sites/<id>/`. `run.json`, artifacts, evidence versions,
research, uploads, and the generated site are local run state; the directory is
ignored and is not a source-controlled interface. The public generated-site
route reads only the validated site output. Uploads remain in the run's private
upload area. Guarded mutations use the run/site authority and re-run blocking
gates; a human evidence or visual approval is never replaced by a mechanical
test result.

The candidate contract is additive to the legacy site manifest and run-stage
state. One validated run ID maps to the closed
`sites/<id>/candidate/{site,manifest.json,provenance.json,gates.json}` layout;
the public site route never serves that root. `src/lib/contracts.ts` owns the
strict lifecycle, deterministic manifest, and mutable provenance schemas, while
`src/lib/candidate.ts` owns regular-file inventory, deterministic hashes,
read-only inspection, and failed/abandoned diagnostic cleanup. Inventory rejects
unsafe paths, links, special files, mismatches, and output over 100 MiB; file
handles are opened nonblocking/no-follow and the aggregate limit is charged
from opened-file sizes before body reads. Provenance retains every binding
implied by lifecycle history. Cleanup uses the last lifecycle transition rather
than mtime, retains exactly-24-hour diagnostics, and revalidates the unchanged
candidate root plus exact provenance immediately before removing only that
fixed root.

`src/lib/gates.ts` preserves `runGates(runId, options?)` for the live site and
adds the separate `runCandidateGates(runId)` boundary for an unserved candidate.
The candidate entry point accepts no path, URL, or after-edit option. It derives
one private target through exact closed candidate paths and read-only
inspection, runs all nine gates with browser and stable disk-side CSS reads
rooted at the same candidate site, then revalidates the manifest, build, and
gate-relevant run inputs. The required `tokens.json` and any present
`intake.json` must be provenance-bound before their contents are consumed.
Receipt replacement stages a same-filesystem temporary file under the validated
run, repeats candidate and input revalidation immediately before rename, and
atomically replaces only the closed candidate root's `gates.json`. The strict
versioned receipt rejects unknown nested report fields and pins the complete
gate order plus blocking policy: the first eight gates block and the performance
budget remains advisory. It binds the run, manifest hash, and build hash; its
exact serialized SHA-256 is returned to the later lifecycle owner. Gate
execution does not select `failed` or `promotable`, mutate provenance, publish
the candidate, or replace live `site/` or run-root `gates.json`. Compilation,
repair, promotion, crash recovery, and final cross-process locking remain
separate consumers of this contract and are not performed by the candidate or
gate modules.

`src/lib/builder.ts` compiles the frozen template only into that closed
candidate root. Production compilation requires a durable `run.json` plus
stable regular-file copies of the supplied intake, tokens, skeleton, copy,
approved runtime Tailwind theme when present, and run-owned hero asset when
present. The run authorization itself uses the same no-follow, nonlinked
regular-file reader, and its persisted ID must exactly match the validated
requested run before candidate or staging output can begin. Input artifact
bytes are hash-bound in candidate provenance. A run-owned hero is read once
through the stable authorization handle; those retained bytes are written to
the candidate without reopening the source path. Optional compression then
operates only on the candidate copy, whose final bytes are bound by the
candidate manifest. The approved runtime Tailwind
theme lives at
`evidence/approved/runtime-tailwind-theme.css`; compilation copies it into the
candidate bundle but never writes it into the live site. Standalone tests and
browser fixtures use `test-support/buildSiteFixture.ts`, whose explicit live
copy/swap helper requires `ONEBOX_TEST_FIXTURE_PUBLISH=1`, rejects production
runtime use even with that flag, and is not imported by any non-test/spec
TypeScript source under `src/`. Intentional smoke and canvas scripts set the
flag at their fixture boundary. If the staging rename and restoration both
fail, the helper reports both errors and preserves the retired snapshot.

After compilation, `gateBuiltCandidate(runId)` reuses
`runCandidateGates(runId)` and moves `ready-for-gates` to `failed` when any
blocking report fails or to `promotable` when all blocking reports pass. It
re-reads, parses, binds, and hashes the exact candidate receipt immediately
before the provenance transition. Receipt publication and provenance
disposition are one same-process transaction: if the provenance rename fails,
the prior receipt bytes and provenance bytes, or their prior absence, are
restored exactly. If gate execution throws before a receipt exists, provenance
becomes `failed` without inventing a receipt or hash. Initial failure leaves no
served site; rebuild failure leaves the complete live inventory and its
authoritative gate report unchanged. A promotable candidate is still unserved, and
the pipeline parks before approval pauses, configuration checks, cost-cap
errors, resumed execution, visual QA, or a live-complete event. A built stage
accepts only an exact present `promotable` candidate, and independently asserts
that the durable gate disposition is `promotable`; absent, `failed`, or
`ready-for-gates` state fails closed. Pipeline sequencing remains parked at this
boundary until OBX-024 invokes the closed promotion operation. OBX-015 owns
startup/resume recovery beyond same-process rollback.

`promoteCandidate(runId)` acquires the shared site-authority lock exactly once,
then revalidates the exact `promotable` provenance, deterministic manifest,
candidate inventory, and full passing receipt before any live rename and again
immediately before commit. It stages one durable `site/` directory whose
reserved `.one-box/` metadata contains the deterministic candidate manifest,
promoted provenance, and canonical candidate gate receipt. The generated-site
build hash excludes only that closed metadata directory and uses the same
inventory algorithm as candidate provenance and visual QA. Directory swap,
promoted-candidate provenance, and visual-approval replacement roll back to the
prior complete site and approval history on any authoritative failure. After
the site and promoted provenance are durable, the prior visual decision becomes
superseded and a new pending visual-QA version is created with the promoted build
hash; later mechanical and named-human review can never inherit the old hash.
The old site is retired only after the new bundle, promotion provenance, and
visual state are durable; cleanup failure leaves the committed new bundle
authoritative for OBX-015 recovery instead of reporting promotion failure.
Run-root `gates.json` is a best-effort compatibility projection of the receipt
reports. Promoted preview gate status, edit baselines, release, export, and
client-handoff decisions read the canonical receipt; only historical bundles
without promotion metadata fall back to the run-root copy.

`withReleaseAuthorization` is the common release/export/client-handoff guard.
Under the same site authority it validates the canonical live metadata and
requires the latest effective named-human visual approval, QA artifact hash, and
review hash to equal the promoted build hash. The evidence export route uses this
guard; preview and guarded editing remain available while review is stale.
Historical sites without promoted-bundle metadata, including read-only
non-Website records, retain their existing export compatibility.

`repairFailedCandidate(runId, provider)` accepts only a durable authorized run
with one closed, inventory-valid `failed` candidate and a strict full-suite
receipt bound to that candidate's manifest and build hashes. It validates and
reads the complete candidate before claiming the single durable repair
allowance, exposes only `index.html` and `tokens.css` to the provider, and
rejects duplicate or non-allow-listed output. Provider input and aggregate output
are byte-bounded. Deterministic validation also preserves the HTML element and
`data-edit-id` structure, scripts, styles, remote-request attributes, CSS
selectors, and custom-property inventory; an identical result is not a repair
and releases the allowance.

The repaired files are assembled with all unchanged candidate bytes in a sibling
staging bundle; a new manifest and `failed -> preparing -> ready-for-gates`
provenance replace the obsolete gate binding. The whole candidate bundle is
swapped as one unit with exact rollback on an incomplete commit, after the
retired source bundle is revalidated. Read, validation, provider, or write
failure before that swap releases the allowance and leaves the failed candidate
intact; a completed swap consumes it. Every completed repair then returns through
`gateBuiltCandidate(runId)`, which runs the same complete gate suite against the
same closed candidate root and leaves any remaining failure in `failed` state.
Gate or disposition-publication failure after the swap also fails the candidate
closed and cannot reopen the provider allowance. Same-process reconnects park a
completed-but-failed repair instead of rebuilding it, replaying only the current
persisted terminal build error rather than an earlier stale terminal. Repair
never writes live `site/`, the canonical live gate report, or approved evidence.
Atomic promotion is the separate OBX-014 operation described above; OBX-015
retains startup/resume recovery for interrupted or leftover retired directories.

OBX-015 makes `recoverCandidateState(runId)` the first resume operation before
the pipeline reads candidate state. Recovery holds the same site authority as
all writers and recognizes only the closed transaction names emitted by the
builder, repair, receipt/provenance writers, and promotion code. A valid
canonical candidate wins over its orphan build, repair, backup, and retired
siblings. If the canonical root is absent, exactly one complete hash-valid
candidate transaction root may be restored; multiple valid generations or no
valid generation are blocked and preserved. `preparing` and invalid resumable
canonical state are abandoned with a bounded reason in
`candidate-recovery.json`; `ready-for-gates` resumes only at the gate boundary,
`failed` remains diagnostic/repairable, and a clean `promotable` candidate is
parked rather than promoted. OBX-024 remains the only owner of ordinary
promotion sequencing.

Promotion recovery groups `.site-promotion-stage-*` and
`.site-promotion-retired-*` by their exact transaction token and never chooses
by mtime. A missing live root may be restored only from one bounded regular-file
retired tree containing `index.html`; links, files, malformed trees, and
multiple generations block without being installed or deleted. An exact new
live bundle with still-promotable candidate provenance rolls back to its paired
retired site. An exact promoted live bundle first reconciles one pending
visual-QA version for its build hash idempotently, then removes the paired
retired site. A later edited or otherwise noncanonical live site causes recovery
to block and preserve both generations. Startup recovery never initiates a new
promotion and never trusts the run-root compatibility gate report as authority.

The lock order is fixed: acquire the per-run site authority first, then any
`run.json` transaction; code must never acquire those in reverse order and must
not reacquire site authority from an under-authority helper. Production build,
candidate gate disposition, repair prepare/commit, diagnostic cleanup,
promotion, element edits, token changes, asset placement, and motion changes all
use that authority. Generated-site GET also acquires it after a read-only
existence and no-symlink check, so a reader cannot observe tentative site bytes
with a report from another generation and an unknown read cannot create a run
root. Repair provider work is deliberately outside the lock: the failed
candidate is snapshotted and the allowance claimed under authority, and its
exact bytes/state are revalidated after authority is reacquired before commit.
The filesystem lock reclaims dead process owners and bounds claim retries;
separate-process contention tests cover serialization and abrupt-owner exit.

`events.jsonl` is the append-only audit record, not the UI view model. Reconnect
streams project it into one current journey, suppress superseded terminal events
and repeated narrative cards, attach to in-flight emissions, and flush queued
event writes before closing. Evidence truth is derived from persisted artifacts;
the intake artifact owns the user's research choice, while `run.json` owns the
current stage and approval state. For both legacy and evidence-gated runs, a
promotable candidate suppresses stale live-completion replay or synthesis,
replays only nonterminal history and current cost, and returns without resuming
pipeline execution. Stage completion or stale approved visual QA cannot
synthesize a live terminal. A recorded template legacy completion is replayed
only when no candidate exists. A recorded PageIR completion is replayed only
when the current Source Bundle remains approved, the validated persisted PageIR
matches the promoted candidate and live provenance, manifest and gate-receipt
bindings remain exact, and the latest exact-build visual QA still has seven
passing checks plus its named, attested human approval. At an incomplete build
stage, stale visual QA also cannot pause or bypass the candidate build path.
OBX-014 provides the callable closed promotion and release proof; OBX-024 owns
the exactly-once PageIR checkpoints and continuation that invokes it.

`src/lib/productionTarget.ts` owns the production target policy. Persisted
contracts continue to parse `website`, `web-app`, and `ios-app` so historical
records remain readable, while new intake uses the separate literal Website
schema. The shared guard runs before intake reservation, pipeline replay or
execution, builder staging writes, and active reference, evidence, edit,
element, token, motion, and asset mutations. Its read-only compatibility
classifier preserves an explicit historical target and applies the existing
Website default only when `projectTarget` is absent. The guard covers every
active start, resume, continue, retry, rebuild, repair, edit, asset generation,
and asset placement operation; any future authority-migration operation must
pass the same guard before provider calls, reservations, transactions, or
filesystem writes. Legacy non-Website preview and evidence views show one
legacy/read-only notice; evidence GET and export include target and
compatibility metadata. Preview GET, evidence GET, and evidence export are
load-only compatibility surfaces: they must not rewrite intake or run state,
reconcile asset ledgers or approval/evidence aliases, or write generated site
bytes. Asset GET uses a pure catalog read for legacy records for the same
reason.

Refero authentication follows the MCP server's browser OAuth flow. The Next.js
process persists its own refreshable OAuth client state under the ignored
`.one-box/oauth/` boundary; it does not copy Codex's separate OAuth session or
require a static project bearer token. `src/lib/referoAuth.ts` owns OAuth state,
callback validation, refresh persistence, and the local connect flow.

### AI teammate Local foundation boundary

`src/lib/contracts.ts` owns the closed v1 teammate, job, and receipt schemas.
`src/lib/aiTeammates/registry.ts` owns the immutable eight-role roster; `idle`
means no process, provider session, tool, lease, or budget is active. Jobs admit
only `public` or `project-internal` data labels, exact `read` and `propose`
effects, empty parent and child tool grants, one attempt, zero delegation depth,
bounded bytes and duration, and process-only retention.

`src/lib/aiTeammates/executor.ts`, `executionReceipts.ts`,
`receiptBinding.ts`, and `serialization.ts` own deterministic in-memory
execution. For a schema-valid job they canonicalize and freeze the job, input,
proposal, and terminal receipt; bind the job, input, and complete output hashes;
enforce cancellation, deadline, and byte/time budgets; and return `complete`,
`failed`, `cancelled`, `rejected`, or `budget-exhausted`. Receipts are not
persisted, cannot be retried in v1, and record zero external cost. The injected
proposal function remains a trusted in-process seam, not a sandbox: cooperative
abort cannot stop a future callback that ignores its signal or introduces an
effect. The shipped route supplies only a fixed, local, effect-free callback.

The [AI teammate route](../../src/app/api/ai-teammates/%5Bid%5D/route.ts) is the
sole HTTP adapter. Its GET returns the static roster and its POST builds one 8
KiB, one-second local job from a strict bounded assignment; both responses are
`no-store`. The path ID is validated syntactically and echoed into the job, but
this foundation route does not load, authenticate, mutate, or persist a run. It
performs no provider, credential, network, filesystem, Page IR, site, queue, or
automatic-application work. The local authorization and request-body boundary
are documented in the [local API threat
model](../security/local-api-threat-model.md).

The Workbench exposes Agent Studio only in Edit mode. Teammates is the default
`Local foundation` pane; the existing Site advice pane stays separately labeled
and may mutate the site only through its established controls. Both panes remain
mounted while their visibility changes, so a local assignment and receipt are
not discarded by switching modes. During local execution, assignment controls
are locked and run/assignment generation checks discard stale completions. The
accepted result remains proposal-only and shows its bound teammate, task, fixed
notice, and complete textual receipt; it has no apply control.

This slice has no migration or durable runtime state. Rollback reverts its
contracts, `src/lib/aiTeammates/`, route, `AiTeammate/` components, Workbench
integration, and styles together; in-process values are discarded and existing
Page IR, candidate, site, review, and release state stays untouched. Provider or
model calls, model routing, skills, memory, scheduling, background workers,
collaboration, tools, mutation authority, deployment, release, and Deep Agents,
LangGraph, or LangSmith adoption remain non-goals.

### Page IR v1 contract boundary

`src/lib/contracts.ts` is the only authority for the numeric-v1
`ReferenceContractV1`, `LayoutProgramV1`, and `PageIRV1` schemas. Phase 1 is
Website-only. The layout contract is a bounded normalized graph whose node ID is
also its stable editor identity. Editor IDs use the same bounded two-to-64
character grammar at the Page IR, preview, and overlay boundaries; they never
derive from DOM position or a generated selector. The graph admits only document,
landmark, section, group, and semantic slot nodes. Page IR carries inert content, typed token and
asset references, constrained call, email, scroll, and public-HTTPS actions,
and page-level accessibility references. Recursive strict schemas plus bounded
cross-reference validation reject unknown or executable field shapes, arbitrary
paths, unsafe action targets, malformed graph structure, and dangling registry
references before a compiler can consume the artifact.

`src/lib/pageIrDerivation.ts` owns the synchronous, pure derivation boundary. It
accepts exact bytes plus approved run/version/SHA bindings for the fixed
evidence, design, token, CSS, layout, content, and asset source set; it never
selects a latest alias or reads a file. After hashing every source before JSON
parsing, it validates the complete version and attribution chain, projects the
approved token inventory, validates the assembled Page IR, and returns a
canonical Page IR SHA-256 plus fixed-order, timestamp-free lineage. Raw Refero
IDs remain only in lineage behind safe Page IR aliases.

The pure derivation module does not compile, persist, promote, or edit
`page-ir.json`. `src/lib/pageIrPipeline.ts` owns the runtime boundary after CSS
approval. It stores exact layout, content, and asset source bytes under the
closed numeric-v1 source root, requires a named human to attest every source
criterion, derives one immutable revision-1 Page IR from the exact eight
approved bindings, and installs compiler output only in the unserved candidate
root. A matching failed Page IR candidate stays parked for diagnosis; this
boundary does not repair compiled files or mutate the live site. Authoritative
Page IR editing remains with OBX-031. Image is the only Phase 1 Page IR asset
kind; video and arbitrary embeddable media are not part of v1.

Each Page IR candidate provenance envelope carries one closed
`PageIrEditorSourceMapV1`. Its sorted identity entries cover every layout node
exactly once and bind those IDs to the persisted Page IR SHA-256, approved
fixed-order lineage, and binding-set SHA-256. Creation and reuse revalidate that
entire map before committing candidate bytes. Template provenance rejects the
map. Legacy `page-ir-static@2` provenance remains parseable as legacy state, but
cannot be silently reused as the current compiler; a ready candidate may migrate
once through normal materialization, while failed, promotable, and promoted
terminal candidates remain preserved.

`src/lib/pageIrController.ts` owns the resumable Phase 1 PageIR build sequence.
A dedicated per-run filesystem lock serializes the one orchestrator source call;
its strict assetless result is bound to current approved upstream versions plus
bounded intake/reference facts in `page-ir-source-generation.json` before the
immutable Source Bundle is proposed. Draft and in-review bundles stop at the
payload-hash-bound named-human checkpoint. Approval resumes immutable PageIR
derivation, candidate materialization, the full candidate gate receipt,
promotion, and exact-live validation from durable state rather than event-log
claims. Failed PageIR candidates remain parked without repair. Promotion's
pending visual-QA placeholder is lawfully revision-requested and superseded by
one real three-width exact-build QA version under site authority; only the
existing attested all-pass human approval can permit completion.

`src/lib/pageIrCompiler.ts` owns the next pure boundary: numeric-v1 Page IR plus
an exact in-memory set of hash- and metadata-bound image bytes becomes a sorted
static inventory, deterministic candidate manifest, and fixed
`page-ir-static@3` compiler identity. The compiler reparses Page IR, renders the
layout graph from ordered child IDs, escapes inert content, emits no executable
source, validates image magic, and returns bytes plus the sorted editor-identity
entries without reading, writing, publishing, or calling a provider.
`src/lib/pageIrHash.ts` is the shared pure
authority for the canonical Page IR SHA-256 used by derivation and compilation.

Page IR v1 tokens carry only IDs and categories, not approved client values or
foreground/background roles. The compiler therefore emits versioned safe
category fallbacks; this proves mechanical static determinism only, not
client-owned visual quality. Human `EVAL-WEB-001` and visual qualification remain
`NOT_RUN` and require a future explicit contract/version decision. Candidate gates
now dispatch from immutable layout authority: PageIR candidates bind the strict
persisted envelope plus its exact versioned design contract, derive telephone and
no-JavaScript oracles from validated IR, and revalidate both authority snapshots
before receipt publication. Template candidates retain their existing run-root
token/intake and fixed-selector behavior. Token drift remains fail-closed: a PageIR
design value is allowed only when its exact custom property and normalized value are
declared in candidate `tokens.css`. `page-ir-static@3` declares its fixed canvas
background and consumes that token for the body and skip link; its fixed ink and
font fallbacks are likewise consumed through compiler-owned properties. An exact
compiled PageIR candidate therefore passes all nine gates without weakening token
drift, and earlier compiler candidates are never silently treated as current.

### Persisted layout authority and template fallback

Every run persists one immutable layout authority: `template-v1` for the
established path or rollout-gated `page-ir-v1`. The pipeline dispatches the
approved build boundary by that authority; the template builder still rejects
PageIR authority, while the PageIR controller never enters template synthesis
or compiled-file repair. Candidate and promoted-live reads require provenance
authority to equal the persisted run, so recovery, inspection, and promotion
cannot blend the two layouts.

`createTemplateFallbackRun` is the server-side explicit recovery boundary for a
failed Page IR run. Under the source lock it validates intake and claimed
uploads, then persists a private nonterminal transaction claim containing the
reserved child ID and origin. It creates or resumes that exact template child,
clones only verified input, and commits the terminal source link only after the
child intake and uploads are complete. The claim makes pre-link crash retries
converge without exposing an incomplete child through run state. Page IR,
layout, candidate, live site, gate, evidence, and visual artifacts are never
copied. OBX-024 still owns Page IR persistence/routing; OBX-050 owns any
operator/API surface.

`startPipelineFromIntake` reads the rollout environment exactly once when it
creates a run and persists a closed `rolloutDecision` beside the selected
authority. `ONE_BOX_PAGE_IR_ROLLOUT=1` opts new runs into `page-ir-v1`;
`ONE_BOX_PAGE_IR_KILL_SWITCH=1` takes precedence and selects `template-v1` for
new runs. Resume and replay ignore later environment changes and use the stored
authority. Run-state mutation rejects attempts to change either the authority
or its rollout decision.

`POST /api/runs/[id]/fallback` is the explicit local operator boundary. It
accepts only the path run ID and supplies the server-owned
`operator-requested-after-failure` reason to `createTemplateFallbackRun`.
Authorization is checked before validation or mutation. The resulting child is
a linked `template-v1` run; the failed Page IR source remains independently
inspectable.

The append-only pipeline event stream has three operational records. A closed
`lifecycle` event distinguishes candidate, repair, gate, promotion, and actual
recovery actions and carries a bounded next step. Candidate and gate guidance
is authority-aware, so only a failed Page IR run offers template fallback;
blocked recovery is a failure that requires inspection, and promotion failure
copy makes no claim about potentially ambiguous live state. A strict `provenance` event
links the run decision and input hashes through Page IR, compiler, candidate,
gates, promotion, named-human review, and any fallback relationship. A
`fallback-created` event records the durable source/child relationship after
the fallback transaction commits; retries deduplicate that exact relationship
and the timeline links to the separate template run. Because event append is a
projection rather than transaction authority, reconnect reconstructs a missing
fallback record and its provenance from the immutable source link and child
run. Meaningful candidate recovery is likewise retained in the strict
`candidate-recovery.json` record and reprojected if its first event append was
interrupted; no-op inspections do not replace that record. Supplemental
Pure authority mismatch deliberately writes no recovery record: the mismatch
is stable, is re-detected on every reconnect, and the stronger fail-closed
invariant forbids candidate/live/report mutation. If recovery completed a
one-time cleanup before discovering a later mismatch, only then is that action
plus the block recorded so reconnect cannot lose the completed outcome. A
post-rename validation failure carries the completed reconciliation action
through the error boundary for the same reason. A
currently blocked recovery is an early replay boundary: the pipeline delivers
the failed recovery event plus a terminal error and does not re-enter candidate
inspection or controller execution. A retained historical blocked record may
restore a missing event, but cannot stop execution after the current recovery
inspection reports the condition resolved.
Other supplemental lifecycle, provenance, fallback, and cost records after a terminal event keep
the run terminal, while later real stage or card progress deliberately resumes
projection. Recovery emits an action only when `recoverCandidateState` reports
work it actually performed. None of these events grants live authority: the
Page IR controller emits provenance only after atomic promotion, adds review
hashes only after the matching named-human approval passes the build-binding
assertion, and exposes preview only after the terminal live event.

The frozen generated-site structure is
`templates/local-service/index.html.tpl`, `site.css`, `tokens.css.tpl`, and the
supporting runtime files. The builder and contracts define what can be emitted;
feature code must not add undocumented artifact fields or bypass those gates.

## Incremental extraction path

Keep the monolith until a boundary has a stable contract, an independent test
surface, and an operational reason to extract it. Extract one seam at a time;
the first step for every seam is an in-process interface with contract tests.

| Seam | Current owner | Incremental next boundary |
| --- | --- | --- |
| Pipeline | `src/lib/pipeline.ts` and `src/app/api/run/route.ts` | Split stage implementations behind the stable `src/lib/pipeline.ts` facade. Keep `/api/run` as the adapter that starts or resumes a run and streams events; do not introduce a worker or service boundary as part of this move. |
| Contracts | `src/lib/contracts.ts` | Isolate versioned schemas and compatibility tests as a package/module boundary before sharing them with another process. |
| Run/evidence persistence | `src/lib/runstate.ts`, `src/lib/evidence.ts`, `src/lib/siteMutation.ts` | Introduce a persistence interface for run state, artifacts, locks, and approval transitions; keep filesystem storage as the first implementation. |
| Image library | `src/lib/imageLibrary.ts`, `src/lib/imageGenerationBudget.ts`, and the `src/app/api/assets` route tree | Put catalog, generation ledger, idempotency, and placement behind an asset-service interface; preserve the per-run catalog and explicit metered consent. |
| Composition-only pages | `src/app/page.tsx`, the `src/app/preview` and `src/app/evidence` route trees, and `src/components` | Separate page composition from feature calls so a future renderer can consume the same contracts without moving pipeline or persistence first. |

An extraction is complete only when the old in-process path and the new module
boundary share the same contract tests, run/evidence semantics, authorization
checks, and rollback behavior. Until then, the deployable unit remains this
repository and its one Next.js application; no process or service extraction is
implied.

## Related sources

- Product and acceptance requirements:
  [`docs/specs/2026-08-13-refero-editor-requirements.md`](../specs/2026-08-13-refero-editor-requirements.md)
- Runtime contract: [`src/lib/contracts.ts`](../../src/lib/contracts.ts)
- Local API boundary: [`docs/security/local-api-threat-model.md`](../security/local-api-threat-model.md)
- Local setup and commands: [`README.md`](../../README.md) and [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
