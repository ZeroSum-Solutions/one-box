# Planning remediation verification receipt

- Captured: 2026-08-29 America/Los_Angeles
- Branch: `research/la-appointment-field-study`
- HEAD at run: `7167a2488a7a0b82f1b5df0fde6b96e1e7b869ef`
- Worktree: uncommitted planning state
- Authority packet: `d16f385aff91cc56c2c73c636f8396b2d467ebb8c9238222ed9b1d282a2e21fe`
- Implementation authorization: none

## Deterministic results

| Command | Result |
|---|---|
| `npm run verify:plans` | PASS; 17 domains, 29 tickets, 21 program evaluations; digest matched |
| `npm run test:plans` | PASS; 22/22 fail-closed tests |
| `npm test -- --reporter=dot` | PASS; 96 files passed, 4 skipped; 1,275 tests passed, 4 skipped |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; 0 errors, 6 pre-existing warnings |
| `npm run build` | PASS; 6 previously disclosed dynamic-filesystem tracing warnings |
| `node --check` for both plan-verifier sources | PASS |
| `jq empty` for changed machine manifests | PASS |
| `git diff --check` | PASS |

The verifier now rejects missing EB closure coverage, ticket requirements without linked-evaluation coverage, evaluation-owner dependency cycles, trace rows whose evaluation does not cover the requirement, mutable CI action references, missing governance policies, and owner-approved records without durable person/role identity.

## Current target hashes

| Target | SHA-256 |
|---|---|
| Authority manifest | `15a2cce86114e9eb27cd48211caad0c175512559b96466426c83878bc4f7af00` |
| Appointment Acquisition v1 PRD | `3c4aca6207174dbbb69be059a5963d9e42b2d29da89450f5f9a0ed9348754e2d` |
| Embedded-browser plan | `ce77c30dc053af88a1abde0b9f5a4606e5fbc0e4e7d0bf64710c22c34bb12ee9` |
| Embedded-browser closure register | `3bc32cbc1fcbf8ce6abe9c38341e2f5f739cf31eb3df426c6dbf696ae01b0ef7` |

## Exact Grok 4.6 outcomes

| Packet | Result |
|---|---|
| Appointment corrections, first completed run | `FINDINGS`; one MEDIUM post-deadline transient edge |
| Appointment corrections, v2 current target | `CLEAN`; zero findings |
| Embedded-browser corrections, first completed run | `FINDINGS`; one HIGH missing explicit assignment-state gate |
| Embedded-browser corrections, v2 current target | `CLEAN`; zero findings |
| Consolidated GLM remediation cross-check | `CLEAN`; zero findings |

Exact-model audit receipts are normalized JSON under `docs/audits/grok-4.6/`. Two earlier attempts timed out with no verdict and were not represented as passes. Model review remains advisory and cannot supply human acceptance, independent verification, implementation authorization, release approval, or EB row closure.

## Known non-failures and blockers

The lint and build warning sets predate this planning remediation and are unchanged in kind. They are disclosed, not waived. The browser assignment table remains `unassigned-blocking`, all EB rows remain OPEN, and proposed authorities remain pending named-human decisions. This receipt proves the commands above on uncommitted bytes only; it is not a commit, PR, branch-protection receipt, deployment, or production-readiness claim.
