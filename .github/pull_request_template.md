## Summary

<!-- What changed, and why? Link the issue or acceptance ID when one exists. -->

## Scope and architecture

- [ ] This change stays within the stated issue scope.
- [ ] App entrypoints depend on features; features depend on platform/shared code.
- [ ] No new deployment, hosted service, or credential assumption is introduced.
- [ ] If a boundary changed, update `docs/architecture/README.md` or the relevant ADR.

## Verification

<!-- List the exact commands run and their result. Note any intentionally skipped check. -->

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Risk and evidence

- User-visible or API behavior:
- Data/run-state or evidence impact:
- Security or authorization impact:
- Human review or approval still required:

## Reviewer checklist

- [ ] The diff is limited to the requested behavior and its canonical documentation.
- [ ] Tests cover changed behavior, or the PR explains why they are not needed.
- [ ] No secrets, local `sites/` data, `.next/`, or generated artifacts are included.
- [ ] Local-only and metered operations remain explicit and human-authorized.
