# ONE BOX architecture-preserving refactor loop (project adaptation)

This is a local adaptation of [Loop 069, the published architecture-preserving
code refactor loop](https://signals.forwardfuture.com/loop-library/loops/architecture-preserving-code-refactor-loop/).
It is not the published loop. It improves one measurable ONE BOX target in at
most five rounds while preserving public contracts and downstream behavior; it
does not authorize a push, merge, deploy, or paid run.

## Trigger and input

Run when the user supplies a target in the repository and a
measurable goal such as readability, typing, maintainability, or performance.
Require the target, goal, intended unchanged behavior, and relevant baseline
check. If the target or goal is missing, ask and stop. Do not use this loop for
an intentional product, public-contract, persistence, or architecture change
unless that broader change is explicitly authorized.

## Authority and approval gates

The loop may inspect code, map dependencies, edit the task branch, and run
credential-free local checks. Preserve unrelated work and the generated-site
and run-state boundary under `sites/<id>/`. Ask for explicit approval before:

- deleting or overwriting files, data, run artifacts, branches, worktrees, or
  generated state;
- changing public APIs, persisted artifact contracts, architecture boundaries,
  or compatibility behavior beyond the stated refactor;
- invoking research, Refero, model calls, or any paid or metered provider call;
- deploying, publishing, exposing the app beyond `127.0.0.1`, or changing a
  production environment;
- pushing a branch or opening/updating an external pull request; or
- merging, rebasing shared work, or changing an integration branch.

Never weaken a test, lint rule, type check, contract, or acceptance criterion to
manufacture a pass.

## Bounded cycle

1. **Observe.** Read `AGENTS.md`, the relevant specification, the target code,
   its call sites, upstream dependencies, downstream consumers, and current
   branch state:

   ```bash
   git status --short --branch
   git diff --check
   ```

   Capture current behavior with the smallest credible baseline. Select
   representative boundary and failure-mode tests; use `npm test`, a targeted
   Vitest command, `npm run test:smoke`, or the relevant documented E2E command.
   Record public types and contracts from `src/lib/contracts.ts` when they are
   in scope. If no reproducible baseline or behavior check exists, stop
   blocked.

2. **Choose.** Map the blast radius and choose one atomic refactor that can
   improve the stated goal without changing public contracts or downstream
   behavior. Do not add arbitrary coverage, broad cleanup, or speculative
   abstractions. Keep the baseline and affected-consumer checks fixed.

3. **Act.** Apply the one atomic change on the current task branch. Preserve
   unrelated user work and earlier verified improvements. Do not commit, push,
   open/update a PR, merge, deploy, or spend without the approval gates above.

4. **Verify.** Run the same baseline and affected-consumer checks, plus the
   applicable static gates:

   ```bash
   npm test
   npm run typecheck
   npm run lint
   npm run build
   npm run test:smoke
   git diff --check
   ```

   Keep the change only when the measurable goal improves without a contract,
   behavior, or consumer regression. Reject only the current failed attempt;
   retain unrelated work and earlier verified improvements.

5. **Record.** Update the handoff with the round, target and goal, baseline,
   impact map, exact diff, checks and results, rejected attempts, contract and
   consumer evidence, remaining technical debt, and approvals still needed.

6. **Repeat or stop.** Repeat for no more than five rounds, and only while a
   fresh check identifies one remaining in-scope improvement. Stop earlier when
   the goal is met, the architecture is blocked, approval is needed, or a new
   round would make no measurable progress.

## Terminal states

- **SUCCESS** — the measurable goal is met, baseline behavior and public
  contracts remain intact, affected consumers and applicable ONE BOX checks
  pass, and the handoff is complete.
- **CLEAN_NO_OP** — the target already meets the goal or no safe refactor can
  improve it; leave the tree unchanged and return the baseline evidence.
- **BLOCKED** — a baseline, dependency, contract, consumer, or required check
  is unavailable, or the architecture cannot safely support the requested
  target; do not call an incomplete refactor success.
- **APPROVAL_REQUIRED** — the next action would change a public contract or
  architecture, delete/overwrite data, call a paid service, deploy, push,
  open/update a PR, or merge; stop before that action.
- **NO_PROGRESS** — the last round produced no measurable improvement or the
  same regression repeats; stop at the best verified state and record the
  rejected attempts.

## Handoff minimum

Return the terminal state, target and measurable goal, baseline and impact map,
diff summary, verification commands/results, public-contract and consumer
proof, rejected attempts, remaining debt, and one safe next action. Five rounds
or green tests alone do not prove architectural approval or production safety.
