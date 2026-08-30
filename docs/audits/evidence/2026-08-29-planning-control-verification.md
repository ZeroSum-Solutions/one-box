# Planning-control verification receipt

> Superseded for the current remediation bytes by [2026-08-29-planning-remediation-verification.md](2026-08-29-planning-remediation-verification.md). This historical receipt remains evidence for its exact earlier digest only.

- Captured: `2026-08-30T01:47:15Z`
- Worktree HEAD at run: `7167a2488a7a0b82f1b5df0fde6b96e1e7b869ef`
- Branch: `research/la-appointment-field-study`
- Node: `v22.22.3`
- npm: `10.9.7`
- Evidence state: uncommitted planning worktree; this is not a commit, release, or implementation-authorization receipt

## Positive authority verification

Command: `npm run verify:plans`

Result: PASS, exit 0.

```text
Plan authority verification passed: 17 domains, 29 tickets, 21 program evaluations.
Authority packet SHA-256: 7363d374212e5a29fa7211a5de19d9709db0757b6bfaf4c13bb8e5816e030390
```

The aggregate binds the canonical authority manifest with its digest field
removed, every registered non-audit primary and related authority artifact, all
29 program ticket bodies, the inherited Page IR evaluation manifest, the program
evaluation and adoption manifests, governance records, contributor templates,
`package.json`, the CI workflow, and both verifier sources. Audit artifacts and
this supporting receipt are intentionally outside the authority digest and
cannot become authority by changing their bytes.

## Fail-closed control tests

Command: `npm run test:plans`

Result: PASS, exit 0, 15 tests passed.

The suite copies the packet to an isolated temporary on-disk fixture, proves the
current non-empty packet passes, and requires failure for JSON `null`, an empty
manifest, audit promotion, implementation-authority drift, a missing required
domain, an unknown dependency, a duplicate ticket, an unknown evaluation owner,
an invalid adoption decision that attempts to enable use, repository traversal,
a missing EOS trace row, a missing authority front door, a broken contributor
link, and a symlink escape. Every mutation is restored inside the temporary
fixture; repository bytes are not mutated by the tests.

## Repository verification

| Command | Result |
|---|---|
| `npm test -- --reporter=dot` | PASS; 96 files passed, 4 skipped; 1,275 tests passed, 4 skipped |
| `npm run typecheck` | PASS; route types generated and TypeScript exited 0 |
| `npm run lint` | PASS; 0 errors, 6 warnings |
| `npm run build` | PASS; production build completed with 6 dynamic-filesystem tracing warnings |
| `git diff --check` | PASS; no whitespace errors |
| `jq empty` over planning/governance/audit-control JSON | PASS |

The six lint warnings are in pre-existing application/spike files: one unused
parameter in `spikes/layout-ir/compile.mjs`, one unused import in
`EvidenceWorkspace.tsx`, one `img` optimization warning in `AssistantPanel.tsx`,
and three unused-symbol/directive warnings in `refero.ts`. The six build warnings
are existing dynamic-filesystem tracing warnings in `contrastGate.ts`,
`cssVars.ts`, `gates.ts`, and `siteAuthority.ts`. They are not reported as fixed
or waived by this planning packet.

## Exact file hashes

| File | SHA-256 |
|---|---|
| `docs/plans/one-box-master/00-authority/authority-manifest.json` | `cc683f736173a26061746fd6c117c9559d67f6da64190808b7a1e5a8af0ef48a` |
| `docs/plans/one-box-master/01-foundation/release-1-contract.md` | `8ab6358e3e481f37d61991b9edb1d6c29e0543c09a18ec3689ce7eb2db89095e` |
| `docs/plans/one-box-master/01-foundation/release-1-compatibility-matrix.md` | `9227a7914d07b11cc2db03722ce9d20a0dc0b64a03af1b563633ded4271e3ac5` |
| `docs/adr/0002-target-desktop-cloud-topology.md` | `c2e5638b27b811e09a1556efcbf18ee29355035ecc74608f5a1a34697110896f` |
| `docs/security/2026-08-29-program-threat-model.md` | `4c32a37c097eed07cf661cb46da5d9e142d4c31a689ce45615eb08acf951a285` |
| `docs/eval/one-box-program/manifest.json` | `f24f7be7a5d522c88ba4b26ebb20782c792eec103fc1c6ae63254a694416bd07` |
| `docs/research/source-catalog/adoption-ledger.json` | `4e86e1243d155c12d96277b84a560ccdbc323ef378a625520562a9107035a08e` |
| `docs/tickets/one-box-program/manifest.json` | `eb3dbdb4161415237557ad1acd484cedefa35b4740716c6c1c213b61383d10c7` |
| `scripts/verify-plan-authority.mjs` | `7bbc240eeb27259017de3ac1390bf4b78b3e13cef4dddd66c5898fce2aae53ce` |
| `scripts/verify-plan-authority.node.mjs` | `e84c4841d98214d6bff9119b11fbef3d7ecb7de88864d08fd4c35c4983e51a56` |
| `.github/workflows/ci.yml` | `44779aac65e0a92ef601483cd2db2b9d746d2d74a1366d33023b66c451c08972` |
| `package.json` | `c1feab7cc337c89a59d344da2854764b488a831bf40ab6e98d00338a5a7d421e` |

## Limits and blockers

This receipt proves only the stated controls on the stated uncommitted bytes. It
does not make proposed documents owner-accepted, configure remote branch rules,
assign humans, authorize implementation, clear a dependency or service, select a
provider, deploy, invite a client, or activate appointments. The ticket manifest
has an empty `OwnerAssignmentV1` register, so every ticket remains blocked from
`ready` and later states until named accountable owners and required independent
verifiers are recorded. The corrected post-audit bytes were internally verified
but were not sent for a second model pass, preserving the requested one-pass
limit. Any change to the authority packet invalidates the aggregate digest and
requires a new receipt.
