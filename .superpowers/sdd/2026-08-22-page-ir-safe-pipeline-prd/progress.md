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
