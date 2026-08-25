# SDD ledger — plan: docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md

## Baseline

- Base: `6561b19b0d613e8fe891fe700760e414153cb1b4`
- Contract commit: `d893fb85f0d1e39128ac3110604742f018655226`
- `npm ci`: exit 0, 497 packages audited, 0 vulnerabilities.
- `npm test`: exit 0, 62 files passed, 2 skipped; 512 tests passed, 2 skipped.

## Preflight interface scan

| Tasks | Producer / consumer boundary | Ruling |
|---|---|---|
| OBX-001 / OBX-002 | New-run target rejection vs legacy persisted target loading | Keep `ProjectTargetSchema` backward-readable; enforce Website at creation/mutation boundaries, not by deleting enum values. |
| OBX-010..015 | Candidate schema, gate target, builder, repair, promotion, recovery share filesystem authority | Implement in dependency order; one implementer at a time; canonical gate report travels inside the promoted bundle. |
| OBX-020..025 | Contracts feed derivation, compiler, authority, pipeline, editor IDs | Contract first; compiler and derivation may follow only after schema tests are red/green. |
| OBX-029..031 | Existing mutation inventory feeds capability routing and Page IR edit transaction | Audit current write surfaces before changing routing; OBX-031 waits for candidate and IR paths. |
| OBX-040..042 | Eval harness owns manifest validation; corpus and UX suites consume it | Harness first; frozen thresholds and recorded provider fixtures are binding. |
| OBX-050 / OBX-051 | Rollout controls produce events/config consumed by qualification | Qualification cannot mark default-on without all earlier owners and named human approval. |

## Rulings

- Ruling: Existing non-website records remain parseable; Website-only is enforced at
  active operation boundaries. Cost if wrong: a schema-level enum reduction would make
  legacy data unreadable and violate OBX-002.
- Ruling: No parallel implementation writers share this worktree. Explorers may run in
  parallel, but each implementation diff is sequentially committed and reviewed. Cost
  if wrong: lower wall-clock parallelism in exchange for deterministic ownership.
- Ruling: The agent-team-architect persistence output is not created. This is a bounded
  implementation team for the current approved plan, and the PRD excludes a production
  agent framework. Cost if wrong: the orchestration is stateful in the goal/SDD ledger,
  not a new `.claude/agents` product artifact.

## Tasks

- T00: complete (commit `d893fb8`, contract hash lock verified)
- OBX-001: verified — Website is the only new production target; shared guards reject
  non-Website create/start/resume/rebuild and active mutation paths before work or writes.
  Focused verification: 112 passed. Full suite: 529 passed, 2 skipped.
- OBX-002: verified. Persisted non-Website targets remain intact and readable, preview
  and evidence export remain available with legacy/read-only metadata, and legacy asset
  GET uses a pure catalog read. Focused verification: 24 passed. Full suite: 535 passed,
  2 skipped.
- OBX-002 Fix Round 1: verified. Preview editing now requires a runtime-validated
  Website compatibility response; unknown, malformed, non-OK, and failed checks remain
  view-only with an actionable notice. Focused verification: 25 passed. Full suite:
  539 passed, 2 skipped.
- OBX-010: verified. Strict lifecycle/manifest/provenance contracts, one fixed
  unserved candidate root, deterministic regular-file inventory, read-only inspection,
  and bounded terminal diagnostic cleanup are implemented without changing builder,
  gates, promotion, recovery, or legacy run/site state. Candidate suite: 23 passed.
  Full suite: 580 passed, 2 skipped. Security review: PASS with no findings.
- OBX-010 Fix Round 1: verified. Candidate reads are nonblocking/no-follow,
  opened sizes are charged before body reads, cleanup revalidates exact provenance
  after its diagnostic walk, and lifecycle history retains all reached-state bindings.
  Focused verification: 56 passed. Full suite: 586 passed, 2 skipped. Security review:
  PASS with no findings.
- OBX-011: verified. `runCandidateGates(runId)` derives one validated unserved
  candidate target, always runs all nine gates, emits an atomic hash-bound v1
  receipt only at `candidate/gates.json`, and revalidates candidate plus mutable
  gate inputs before that write without changing provenance or lifecycle state.
  Focused verification: 118 passed. Real-browser candidate path: 9/9 gates and
  zero blocking failures. Full suite: 596 passed, 2 skipped. Security review:
  PASS with no findings. The legacy smoke command remains baseline-blocked on
  Node 26 strip-only handling of `productionTarget.ts`; untouched base `c916d2c`
  reproduces the same pre-gate error.
- OBX-011 Fix Round 1: verified. Candidate receipts now reject nested unknown
  fields and blocking-policy downgrade; all consumed run-root inputs require
  provenance bindings; candidate CSS uses stable no-follow reads; every fixed
  target path is asserted; and candidate/input bindings are revalidated after
  temporary receipt creation immediately before rename. Focused verification:
  134 passed, including the real Playwright path. Full suite: 600 passed,
  2 skipped. Typecheck and lint pass; security review: PASS with no findings.
  OBX-015 retains ownership of the final cross-process lock window.
- OBX-012: verified. Production builds require durable run/input authorization,
  compile only into the fixed unserved candidate, run the OBX-011 full gate
  suite, and disposition the OBX-010 lifecycle as `failed` or `promotable`
  without live publication. Initial blocking failure leaves no served site;
  rebuild failure preserves exact live inventory and canonical live gate-report
  bytes/hashes. Same-process disposition failure restores exact prior candidate
  receipt/provenance bytes or absence, while a thrown gate run records `failed`
  without a fabricated receipt/hash. The pipeline stops before existing visual
  QA or live-complete semantics; OBX-014 still owns promotion and OBX-015 owns
  cross-process recovery/locking. Focused candidate verification: 18 passed.
  Full suite: 610 passed, 2 skipped. Typecheck and lint pass; security review:
  PASS with no findings. The legacy smoke command remains baseline-blocked on
  Node 26 strip-only handling of `productionTarget.ts` before fixture execution.
- OBX-012 Fix Round 1: verified. Evidence-gated completion replay and synthesis
  now stop when an unserved promotable candidate exists, even if the prior live
  build has approved visual QA. Durable `run.json` authorization is a stable
  no-follow, nonlinked regular-file read whose persisted ID must equal the
  validated requested run before candidate/staging output. Symlink, hardlink,
  and cross-run authorization cases fail closed. A mechanical boundary test
  prevents app or pipeline imports of the test-only live publication helper.
  Focused verification: 62 passed. Full suite: 616 passed, 2 skipped.
  Typecheck and lint pass; security review: PASS with no findings.
- OBX-012 Fix Round 2: verified. Promotable runs now park before pause,
  preflight, cost-cap, or execution and replay only nonterminal history plus
  current cost. Built-stage continuation accepts only exact present
  `promotable` state, and stage completion separately requires the durable
  disposition to be `promotable`; absent, failed, and ready candidates fail
  closed before completion or visual QA. Unproven live completion is no longer
  synthesized. The fixture publisher now requires explicit test authorization,
  all production TypeScript source is mechanically import-guarded, and a
  double rename failure preserves the retired snapshot while surfacing both
  errors. Focused verification: 65 passed. Full suite: 629 passed, 2 skipped.
  Typecheck and lint pass; security review: PASS with no findings. The legacy
  smoke command remains baseline-blocked on Node 26 strip-only handling of
  `productionTarget.ts` before fixture execution.
- OBX-012 Fix Round 3: verified. Hero compilation now writes the exact bytes
  retained by the stable authorization read and never reopens a substitutable
  source path; candidate compression and manifest hashing remain downstream.
  At an incomplete evidence build stage, stale approved visual QA cannot emit
  completion or preview, pause the run, or bypass candidate rebuilding.
  Focused verification: 66 passed. Full suite: 631 passed, 2 skipped.
  Typecheck and lint pass; security review: PASS with no findings.
