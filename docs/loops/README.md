# ONE BOX bounded engineering loops

These are project adaptations of published Forward Future Loop Library
scaffolds. They are local operating documents for ONE BOX, not published Loop
Library loops and not permission to run, schedule, push, merge, deploy, or spend.

## Adapted loops

- [Ticket to PR-ready](./pr-to-merge.md) — turn one supplied failure or ticket
  into a minimal, verified handoff.
- [Repository hygiene](./repository-hygiene.md) — classify repository state and
  remove only proven stale state after approval.
- [Architecture-preserving refactor](./modular-refactor.md) — improve one
  measurable code target while preserving contracts and consumers.

Published scaffolds used as references:

- [The ticket-to-PR-ready loop](https://signals.forwardfuture.com/loop-library/loops/ticket-to-pr-ready-loop/)
- [The repository cleanup loop](https://signals.forwardfuture.com/loop-library/loops/repository-cleanup-loop/)
- [The architecture-preserving code refactor loop](https://signals.forwardfuture.com/loop-library/loops/architecture-preserving-code-refactor-loop/)

## Shared ONE BOX boundary

Run from the repository root on a task branch. Read `AGENTS.md`,
the relevant specification, and the current working tree before acting. Preserve
unrelated changes, ignored local run state under `sites/`, `.next/`, and secrets.
Use the documented offline gates when possible:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:smoke
git diff --check
```

`./scripts/dev.sh`, live full-run commands, research, Refero calls, and paid or
metered provider calls are never inferred from a key or from a loop prompt. Ask
before any paid or metered call. Ask separately before destructive cleanup,
deploying or exposing the app beyond loopback, pushing or opening/updating a
pull request, or merging. A green local check is evidence for review; it is not
approval or production proof.
