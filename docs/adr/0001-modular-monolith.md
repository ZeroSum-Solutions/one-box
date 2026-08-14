# ADR 0001: Keep ONE BOX as a modular monolith

- Status: accepted baseline
- Date: 2026-08-14

## Context

ONE BOX has one Next.js application with intake, resumable pipeline execution,
evidence review, generated-site editing, and local run artifacts. The current
code already has useful seams (`src/app`, feature modules in `src/lib`, shared
contracts, and provider/template adapters), but splitting them into separate
processes or services would add coordination and persistence risk before those
seams are stable.

## Decision

Keep one deployable modular monolith. Enforce the dependency direction:

```text
app entrypoints (src/app, src/components)
        -> feature workflows (src/lib feature modules)
        -> platform/shared (contracts, locks, storage, adapters, templates)
```

The app layer handles pages, route protocols, and interaction. Feature modules
own business workflows and use cases. Platform/shared modules provide validated
contracts, filesystem and lock primitives, provider adapters, and the frozen
local-service template. Lower layers do not import app entrypoints or UI.

Run state and evidence remain per-run local artifacts below `sites/<id>/`; the
runtime and its guarded mutation paths remain the authority for those writes.
The application stays loopback-first, and any live model, research, or metered
operation remains explicitly selected and human-authorized. No deployment
provider or hosted architecture is implied by this ADR.

## Consequences

This keeps local development, resumability, evidence gates, and cross-module
contract tests in one process. It also means module boundaries must be kept
explicit: do not reach across layers for convenience, duplicate schemas, or
make a route own persistence rules.

When a seam earns extraction, do it incrementally behind an in-process module
interface and contract tests. The planned seams are pipeline stage modules,
contracts, run/evidence persistence, image-library operations, and
composition-only pages. Keep current facades such as `src/lib/pipeline.ts`
valid while moving implementations. Their current owners and extraction steps
are tracked in [`docs/architecture/README.md`](../architecture/README.md).

## Revisit when

Reconsider this decision only when a seam has a stable versioned contract,
independent tests, explicit authorization and persistence semantics, and a
demonstrated operational need for a separate process. Revisit the ADR before
introducing a second deployable or moving run/evidence authority outside this
repository.
