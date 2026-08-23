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
unsafe paths, links, special files, mismatches, and output over 100 MiB. Cleanup
uses the last lifecycle transition rather than mtime, retains exactly-24-hour
diagnostics, and can remove only the fixed candidate root. Compilation, gate
execution, repair, promotion, and crash recovery remain separate consumers of
this contract and are not performed by the candidate module.

`events.jsonl` is the append-only audit record, not the UI view model. Reconnect
streams project it into one current journey, suppress superseded terminal events
and repeated narrative cards, attach to in-flight emissions, and flush queued
event writes before closing. Evidence truth is derived from persisted artifacts;
the intake artifact owns the user's research choice, while `run.json` owns the
current stage and approval state.

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
