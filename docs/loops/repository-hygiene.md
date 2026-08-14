# ONE BOX repository hygiene loop (project adaptation)

This is a local adaptation of [Loop 012, the published repository cleanup
loop](https://signals.forwardfuture.com/loop-library/loops/repository-cleanup-loop/).
It is not the published loop. It inventories ONE BOX repository state, recovers
valuable work, and prepares or performs only approved cleanup; it never treats
"organized" as permission to delete, push, merge, or deploy.

## Trigger and input

Run when the user asks for repository hygiene or when a named branch, pull
request, commit, or worktree needs classification. The input is the current
ONE BOX checkout, the active branch, and the requested cleanup scope. If
ownership or scope is unclear, ask and stop.

## Authority and approval gates

Read-only inventory and classification are allowed. Preserve active,
uncommitted, ignored, generated, private, and uncertain work, including
`sites/`, `.next/`, and environment files. Ask for explicit approval before:

- deleting or overwriting any file, run artifact, branch, worktree, tag, or
  remote-tracking reference, including `git worktree remove`, `git branch -d`,
  or any force/delete form;
- recovering work by applying, cherry-picking, rebasing, or otherwise changing
  a branch when conflicts or ownership are unclear;
- invoking research, Refero, model calls, or any paid or metered provider call;
- deploying, publishing, exposing the app beyond `127.0.0.1`, or changing a
  production environment;
- pushing, closing/commenting on, or opening/updating a pull request; or
- merging, rebasing shared work, or changing an integration branch.

Never infer approval from stale state, branch age, GitHub access, or a clean
working tree.

## Bounded cycle

1. **Observe.** Re-read current state immediately before each consequential
   action. Start with read-only evidence:

   ```bash
   git status --short --branch
   git branch --all --verbose --no-abbrev
   git log --all --decorate --oneline -n 50
   git worktree list
   git remote -v
   ```

   If GitHub CLI access is configured, inspect pull requests with
   `gh pr list --state all --limit 100 --json number,state,title,headRefName,baseRefName,updatedAt`; otherwise record that PR evidence is unavailable.
   Do not fetch, prune, delete, or mutate during inventory.

2. **Choose.** Classify every in-scope item as current, valuable but
   unfinished, merged/superseded, abandoned, or uncertain. Tie the class to
   an owner, commit/PR relationship, worktree path, or other repository
   evidence. Choose at most one proven stale item or one recovery action per
   pass. Uncertain work is never selected for cleanup.

3. **Act.** First preserve valuable work in an appropriate existing task
   branch, with approval if the recovery requires branch mutation or conflict
   resolution. Then perform only the approved, smallest cleanup. Never discard
   uncommitted changes. A read-only pass is valid when no mutation is safe or
   necessary.

4. **Verify.** Rerun the same inventory after each approved action:

   ```bash
   git status --short --branch
   git branch --all --verbose --no-abbrev
   git log --all --decorate --oneline -n 50
   git worktree list
   git diff --check
   ```

   For recovered code, run the applicable ONE BOX checks (`npm test`,
   `npm run typecheck`, `npm run lint`, `npm run build`, and
   `npm run test:smoke`) before calling the recovery verified. If a check is
   unavailable, record it as unverified.

5. **Record.** Return the initial and final inventory, each classification,
   ownership/recovery evidence, exact approved action, exact commands and
   results, preserved uncertain items, and any approval still needed. Do not
   claim that remote state changed unless a separately approved command proved
   it.

6. **Repeat or stop.** Repeat only while the fresh inventory identifies one
   different, evidence-backed next action. Stop when every remaining item is
   intentional, when the next item is uncertain or approval-gated, or when a
   pass makes no measurable progress.

## Terminal states

- **SUCCESS** — valuable work is preserved, every remaining in-scope item is
  current, owned, or intentionally retained, and approved cleanup is verified.
- **CLEAN_NO_OP** — the inventory is already intentional or no safe stale item
  exists; make no changes and return the inventory as evidence.
- **BLOCKED** — ownership, remote/PR evidence, repository access, or recovery
  dependencies are unavailable; preserve state and identify the missing proof.
- **APPROVAL_REQUIRED** — the next action would delete, overwrite, recover via
  branch mutation, call a paid service, deploy, push, open/update/close a PR,
  or merge; stop before it.
- **NO_PROGRESS** — repeated inventory finds the same items with no new
  evidence or safe improvement; stop and return the unresolved classifications.

## Handoff minimum

Return the terminal state, inventory snapshot, classifications, recovered and
removed items with evidence, untouched/uncertain items, commands and results,
and one safe next action. Cleanup is complete only when the final inventory,
not a smaller repository, proves the state is intentional.
