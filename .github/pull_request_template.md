## Summary

<!-- What changed, and why? Link the issue or acceptance ID when one exists. -->

- Ticket ID:
- Requirement IDs:
- Evaluation IDs:
- Authority/source mode and exact base/head or artifact hash:
- Engineering stage (S0-S11):

## Scope and architecture

- [ ] This change stays within the stated issue scope.
- [ ] App entrypoints depend on features; features depend on platform/shared code.
- [ ] No new deployment, hosted service, or credential assumption is introduced.
- [ ] If a boundary changed, update `docs/architecture/README.md` or the relevant ADR.
- [ ] The authority manifest and program traceability still pass.
- [ ] No draft, audit, research note, rejected plan, or proposed ticket is being treated as implementation authorization.

## Verification

<!-- List the exact commands run and their result. Note any intentionally skipped check. -->

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run verify:plans`
- `npm run test:plans`

## Risk and evidence

- User-visible or API behavior:
- Data/run-state or evidence impact:
- Security or authorization impact:
- Human review or approval still required:
- Exact Grok 4.6 or owner-authorized labeled fallback receipt path, actual model, and target hash:
- Migration/compatibility impact:
- Rollout, rollback, kill switch, or removal path:
- Supply-chain/license/SBOM impact:

## Reviewer checklist

These review and owner gates are currently process-enforced, not remotely
enforced: the last inspected live branch ruleset required zero approving reviews.
See the [repository control target](../docs/governance/reviewer-roles.md#repository-control-target)
and do not treat mergeability or green remote checks as human acceptance.

- [ ] The diff is limited to the requested behavior and its canonical documentation.
- [ ] Tests cover changed behavior, or the PR explains why they are not needed.
- [ ] No secrets, local `sites/` data, `.next/`, or generated artifacts are included.
- [ ] Local-only and metered operations remain explicit and human-authorized.
- [ ] Required non-author verification and named domain-owner reviews are attached.
- [ ] Every linked blocking evaluation is PASS, or this PR is explicitly not ready to merge.
- [ ] The model audit is not presented as peer review, independent verification, risk acceptance, visual approval, or release authorization.
