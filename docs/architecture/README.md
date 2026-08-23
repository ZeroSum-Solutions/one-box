# ONE BOX architecture baseline

## Shape

ONE BOX is one deployable modular monolith: a Next.js application serving the
intake UI, evidence workspace, preview workbench, and API routes from one
process. Local development uses `npm run dev` on `127.0.0.1:3000`; this document
does not define a hosted deployment or production topology.

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
synthesize a live terminal. Historical live completion is replayed only when
it is already recorded and no candidate exists. At an incomplete build stage,
stale visual QA also cannot pause or bypass the candidate build path. OBX-014
provides the callable closed promotion and release proof; OBX-024 owns the later
exactly-once pipeline checkpoint and continuation that invokes it.

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

### Page IR v1 contract boundary

`src/lib/contracts.ts` is the only authority for the numeric-v1
`ReferenceContractV1`, `LayoutProgramV1`, and `PageIRV1` schemas. Phase 1 is
Website-only. The layout contract is a bounded normalized graph whose node ID is
also its stable editor identity; it admits only document, landmark, section,
group, and semantic slot nodes. Page IR carries inert content, typed token and
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

Derivation itself does not compile, persist, promote, or edit `page-ir.json`.
Compilation is the separate pure boundary below; runtime persistence/promotion
and authoritative editing remain with OBX-024 and OBX-031. Image is the only
Phase 1 Page IR asset kind; video and arbitrary embeddable media are not part of
v1.

`src/lib/pageIrCompiler.ts` owns the next pure boundary: numeric-v1 Page IR plus
an exact in-memory set of hash- and metadata-bound image bytes becomes a sorted
static inventory, deterministic candidate manifest, and fixed
`page-ir-static@1` compiler identity. The compiler reparses Page IR, renders the
layout graph from ordered child IDs, escapes inert content, emits no executable
source, validates image magic, and returns bytes without reading, writing,
publishing, or calling a provider. `src/lib/pageIrHash.ts` is the shared pure
authority for the canonical Page IR SHA-256 used by derivation and compilation.

Page IR v1 tokens carry only IDs and categories, not approved client values or
foreground/background roles. The compiler therefore emits versioned safe
category fallbacks; this proves mechanical static determinism only, not
client-owned visual quality. Human `EVAL-WEB-001` and visual qualification remain
`NOT_RUN` and require a future explicit contract/version decision. The current
no-JavaScript gate also assumes frozen template edit IDs and a run-root
`tokens.json`, so OBX-024 must not claim this compiler inventory is gate-compatible
until that separate integration mismatch is resolved.

### Persisted layout authority and template fallback

Every run persists one immutable layout authority: `template-v1` for the
current production path or rollout-gated `page-ir-v1`. The current pipeline and
template builder reject Page IR authority before recovery, provider, staging,
or candidate writes. Candidate and promoted-live reads require provenance
authority to equal the persisted run, so recovery, repair, inspection, and
promotion cannot blend the two layouts.

`createTemplateFallbackRun` is the server-side explicit recovery boundary for a
failed Page IR run. It appends one terminal source link, creates or resumes one
distinct template child with immutable origin provenance and fresh stage/spend
counters, and clones only validated intake plus hash-verified claimed uploads.
It does not copy Page IR, layout, candidate, live site, gate, evidence, or
visual artifacts. Exact source and child links plus atomic upload installation
make retries after each committed boundary converge on the same child. OBX-024
still owns Page IR persistence/routing; OBX-050 owns any operator/API surface.

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
