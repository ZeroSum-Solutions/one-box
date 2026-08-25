# Page IR and safe candidate pipeline ticket system

These files are the owner-approved canonical Phase 1 backlog. GitHub Issues may mirror
them after separate remote-write authorization; until then, no issue number or
repository label is authoritative.

## Workflow

```text
proposed -> ready -> in-progress -> in-review -> verified -> done
                    \-> blocked
```

- `proposed`: drafted but not owner-approved.
- `ready`: scope and dependencies are approved.
- `in-progress`: one branch/worktree owns the ticket.
- `in-review`: implementation complete; checks and required review attached.
- `verified`: independent acceptance completed against the linked evals.
- `done`: landed through review and documentation is current.
- `blocked`: a named external decision or prerequisite prevents progress.

Only the owner changes a proposed ticket to ready as part of backlog approval. A ticket
cannot be `verified` from an implementer's self-report.

## Required fields

Every ticket has stable `OBX-###` identity, status, priority, epic, dependencies,
requirement IDs, eval IDs, problem, bounded delivery, non-goals, and verifiable
acceptance criteria. IDs never change when mirrored into GitHub.

The eval manifest names one `evaluationOwner` for each eval. That owner is the last
ticket in dependency order needed to make the whole eval pass. Earlier contributing
tickets verify against their own acceptance criteria and must not regress any already
passing linked eval; they do not wait on an end-to-end eval owned by future work.

## Priority

- `P0`: required to prevent unsafe publication, false product claims, or invalid
  production qualification.
- `P1`: required for Phase 1 quality, regression protection, or operability.
- `P2`: follow-up that can ship after Phase 1 without weakening its invariants.

## Implementation policy

- One ticket, one feature branch/worktree unless a dependency bundle is explicitly
  approved.
- Keep the existing `runGuardedMutation` funnel and security boundaries intact.
- Add code fields only in `src/lib/contracts.ts` and validate them at every boundary.
- Use test-first failure fixtures for safety invariants.
- Run the exact linked evals plus repository checks relevant to changed files.
- Code created for these tickets receives Grok 4.6 model review only. Opus is reserved
  for product documents, not implementation code.
- Do not close from a model verdict. Mechanical evidence and the independent verifier
  control closure.

## GitHub synchronization

When authorized, create one GitHub Issue per ticket using the same title and body. Add
labels corresponding to priority, epic, `phase1`, and `type`. Append the GitHub URL to
the ticket front matter in a follow-up commit; never replace the stable OBX ID.

Dependency order is maintained in `manifest.json`. GitHub Projects or another tracker
may mirror status, but the reviewed repo files remain the durable specification.

## Epics

| Epic | Outcome |
|---|---|
| Scope | Website-only production promise is true at UI, API, and persistence boundaries |
| Candidate | No failing or partially repaired build becomes live |
| Page IR | Closed structured representation compiles deterministically |
| Pipeline | Page IR and candidate lifecycle integrate without duplicate model work |
| Editing | Every mutation uses sufficient gates and complete rollback |
| Evaluation | Frozen fixtures and regressions prove safety and product quality |
| Rollout | Operators can qualify, observe, enable, and stop Page IR safely |
