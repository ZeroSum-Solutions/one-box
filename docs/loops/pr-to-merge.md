# ONE BOX ticket-to-PR-ready loop (project adaptation)

This is a local adaptation of [Loop 016, the published ticket-to-PR-ready
loop](https://signals.forwardfuture.com/loop-library/loops/ticket-to-pr-ready-loop/).
It is not the published loop. It prepares one reviewable ONE BOX patch and
stops at a verified handoff; it does not authorize a push, merge, deploy, or
paid run.

## Trigger and input

Run when the user supplies one ONE BOX ticket, bug report, failing behavior, or
customer complaint and names the expected behavior. Require the repository,
current branch, and enough reproduction detail to identify the relevant route,
API, pipeline stage, or generated-site behavior. If the expected behavior or
failure is missing, ask one focused question and stop.

## Authority and approval gates

The loop may read the repository, inspect current state, edit the task branch,
and run credential-free local checks. It must preserve unrelated and uncommitted
work. Ask for explicit approval immediately before:

- deleting or overwriting files, data, branches, worktrees, or run artifacts;
- invoking research, Refero, Firecrawl fallback, model calls, or any paid or
  metered provider call;
- deploying, publishing, exposing the app beyond `127.0.0.1`, or changing a
  production environment;
- pushing a branch or opening/updating an external pull request; or
- merging, rebasing shared work, or otherwise changing an integration branch.

Do not treat a credential, a green check, or a draft handoff as approval.

## Bounded cycle

1. **Observe.** From the repository root, read `AGENTS.md`, the
   applicable spec, and fresh state with:

   ```bash
   git status --short --branch
   git diff --check
   ```

   Reproduce the reported behavior in the smallest safe environment. Prefer
   `npm test`, a targeted Vitest command, `npm run test:smoke`, or the relevant
   documented E2E command. For UI work, `npm run dev` is loopback-only and
   credential-free where possible. Record the exact command and result. Make no
   change until the cause is supported by current code, logs, or a test.

2. **Choose.** Select the smallest credible fix that addresses the proven root
   cause. Keep the ticket scope narrow; do not fold cleanup, architecture
   changes, generated `sites/` state, or unrelated refactors into it. Choose
   the relevant regression check before editing.

3. **Act.** Make one atomic, reviewable change on the current task branch.
   Preserve public contracts and existing run-state boundaries unless the input
   explicitly authorizes a contract change. Do not commit, push, open/update a
   PR, merge, deploy, or spend without the approval gates above.

4. **Verify.** Rerun the original reproduction and the relevant regression
   checks under recorded conditions. Run the applicable offline gates:

   ```bash
   npm test
   npm run typecheck
   npm run lint
   npm run build
   npm run test:smoke
   git diff --check
   ```

   Do not claim a full gate passed when a command was unavailable or skipped.
   A UI or live-provider check remains local evidence unless its separate human
   review and authorization exist.

5. **Record.** Write a reviewer-ready handoff containing the ticket, expected
   and actual behavior, proven cause, changed files, before/after evidence,
   exact checks and results, risks, untouched scope, branch, and remaining
   uncertainty. Include a concise PR summary, but do not open or update a PR
   without approval.

6. **Repeat or stop.** Repeat only when fresh verification identifies one
   remaining, in-scope gap and the next atomic action could change the result.
   Stop instead of repeating the same reproduction or patch when there is no
   measurable progress.

## Terminal states

- **SUCCESS** — the issue reproduced before the change, no longer reproduces
  afterward, relevant regression checks pass, and the handoff is complete.
- **CLEAN_NO_OP** — the issue is absent, already fixed, or the current code
  already meets the stated behavior; make no change and return the evidence.
- **BLOCKED** — the issue cannot be reproduced after two serious attempts, the
  required code or test baseline is unavailable, or access/dependency state
  prevents a trustworthy check. Do not call this success.
- **APPROVAL_REQUIRED** — the next useful action is destructive, paid or
  metered, deploy-related, push-related, PR-related, or merge-related; preserve
  the current evidence and ask the user.
- **NO_PROGRESS** — a further bounded pass would repeat the same action without
  new evidence or measurable improvement; keep the best verified state and
  record the failed or rejected attempt.

## Handoff minimum

Return the terminal state, reproduction proof, cause, diff summary, commands
and results, risks, approvals still needed, and the exact next safe action. A
PR-ready handoff is not a merged PR, deployment, or production verification.
