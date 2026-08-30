# Canvas Agent Studio Fable audit — T0 scope and baseline

Date: 2026-08-30
Task: T0 — freeze selected section, authority cage, baseline target, and deterministic baseline
Status: RECORDED — exact Grok review required before task closure

## Immutable baseline

- Branch: `research/la-appointment-field-study`
- Commit: `899b39433c4be242b4b3adcd39f3e6cd53df99c0`
- Tree: `7a1a54e421d12cf7e5cc5a1f42877d8ffe6750b5`
- Starting worktree state: clean and tracking `origin/research/la-appointment-field-study`

## Selected complete section

The audit target is `docs/specs/2026-08-29-ai-teammate-foundation-v1.md`
→ `Local Canvas and API surface`. Its preimage is read with
`git show 899b39433c4be242b4b3adcd39f3e6cd53df99c0:docs/specs/2026-08-29-ai-teammate-foundation-v1.md`
with no newline normalization. The section is the half-open UTF-8 byte range
from the first `#` byte of the exact heading line
`## Local Canvas and API surface\n` through the byte immediately before the
first `#` byte of the next exact heading line
`## Security and data boundary\n`. This includes both LF bytes after the last
section sentence and excludes every byte of the next heading. At the baseline
commit the range is `[3529, 4136)`, 607 bytes, SHA-256
`88db0652329a0bed2ca5ce6e778371959aa340f1e3e1e7a5d678c84f15d1b4ca`.
The full 6,065-byte source specification has SHA-256
`95575b1e432a4a63d7b6b72fe72eb4c7da2b27a834d0158da1773970c68bdf84`.

The named retained integration contract is the owner-approved
`docs/specs/2026-08-16-canvas-upgrade.md` criteria `A1`, `A2`, `A3`, `B1`,
`B2`, `B3`, `G1` through `G9`, and `M1`, as indexed by
`docs/plans/one-box-master/02-canvas/index.md`. This audit covers:

- full Canvas-upgrade source at the baseline commit: 6,845 bytes, SHA-256
  `196b5e1648d239a0f555428b34efd19ec80645215cdc9426b8d6a944fadeb7a8`;
- full Canvas master index at the baseline commit: 2,354 bytes, SHA-256
  `79d1b8072cfa4f0f05443b98c915ac5a54517d1a12308ea9b52e01e88e9d3328`.

Each named criterion is additionally bound below. Extraction is the exact UTF-8
table-row byte sequence whose first bytes are `| \`<id>\`` and whose last byte is
its existing LF (`0a`); byte counts include that LF. Every criterion-row hash
below was calculated from
`git show 899b394:docs/specs/2026-08-16-canvas-upgrade.md` bytes with no newline
normalization. The Canvas index full-file hash above is continuity evidence only;
it is not a criterion-row preimage.

| ID | Bytes | SHA-256 |
|---|---:|---|
| `A1` | 331 | `ba8a8c4cdd6e145b468c08811d1fe0363843204a7181b91d0c3044f2e1e81962` |
| `A2` | 330 | `f4c01e4cf197fedcfc8a25740c24f39fd591c4cf7a7e2aadcb768a43a821b57b` |
| `A3` | 223 | `6c44857a9fd4c5d62bc13557dc5584986c34a15b4ac7de1916d6d155d5604103` |
| `B1` | 233 | `ddcbdb336c7697ed85b7ae3cb93133e7ed137ce11f3f13e760308333a45933a3` |
| `B2` | 234 | `7142853d5d0dad78641eea64c40f13208e8fd2fbcb3de641ab8ed741bc970c1f` |
| `B3` | 261 | `a3c84beefefcb91369891436215c5cce6f6382c2cd4de5936ffdc80eaaf82608` |
| `G1` | 57 | `f625b60e5991e4f83fca8cfd51821e5fd32df0309aeef66f496a6aa82e7a996c` |
| `G2` | 52 | `de4c3d2e55cd2e673f4865b451b9e8eea44eb91bd61390f3965cb94166dc8140` |
| `G3` | 113 | `5beb142591b3c498c1396cb9585d3f31952bef09f814ee6daedfa5b507cfad04` |
| `G4` | 62 | `fb0ea2b19cb5b6b100d74b04cb662b06825a6ed7acea7c0773c6f350f833b76b` |
| `G5` | 67 | `7a1f6d5db6d4fb4c99c5dce081de1a65f327fd0a058a91923648305d97fa337a` |
| `G6` | 73 | `72751988e604143f58e0058e873d878118619135957a5520157fbecd0fc80f15` |
| `G7` | 127 | `e7de2f0a21ad6e2ec6ece817b7ef66a844bf6490fa32c4ab754f779369521f91` |
| `G8` | 126 | `7fd27b2a5f24c241f5d193194f4ca8f4ccd4dae1c941801e1f978e696880b134` |
| `G9` | 208 | `a0850aa28e2532242b292009dfe2e6ff741b49d10114eb737eebcf5475bfca2f` |
| `M1` | 311 | `33fddb781fb116db3d7f7c3ea76d346a2ce259419a806a68df0b84d0b4016147` |

- selection and hierarchy continuity;
- the persistent selection-scoped composer;
- Site Advice isolation;
- references;
- proposal and textual receipt states;
- preview, diff, and history boundaries; and
- the rule that typed Page IR mutation remains separate and never automatic.

The integration surfaces are dependencies of the audit. They are not a grant to
reopen blocked A4 motion, the draft operating environment, embedded browser,
collaboration, provider/model routing, skills, memory, scheduling, persistence,
Page IR mutation, deployment, or release.

## Authority cage

Only `OBX-AUTH-ATF-001` authorizes bounded implementation correction. It permits
only the `read` and `propose` effect classes. It grants
no new runtime dependency and prohibits provider/network/credential/filesystem/
shell/browser/mutate/external-effect/authority/background-process/persistent-
storage/Deep Agents/LangGraph/LangSmith/deployment/release capability.

The program-level implementation flag, operating-environment plan, `OBX-P180`,
and `OBX-P310` remain non-authorizing. A reviewer idea outside the cage must be
recorded as a deferred planning disposition and must not be implemented.

The exhaustive allowed path set at the baseline tree is:

- prefixes: `src/lib/aiTeammates/`, `src/app/api/ai-teammates/`,
  `src/components/preview/AiTeammate/`;
- exact source and documentation paths: `src/lib/contracts.ts`,
  `src/lib/contracts.test.ts`, `src/components/preview/Workbench.tsx`,
  `src/app/styles/workbench.css`, `docs/architecture/README.md`, and
  `docs/security/local-api-threat-model.md`;
- exact E2E paths: `scripts/e2e/canvas-contract.mjs`,
  `scripts/e2e/canvas-coverage.mjs`, and
  `scripts/e2e/preview-workbench.mjs`;
- supporting-evidence prefix
  `docs/audits/grok-4.6/2026-08-29-ai-teammate-foundation-`;
- supporting-evidence prefix
  `docs/audits/evidence/goal/2026-08-29-ai-teammate-foundation-`;
- supporting-evidence prefix
  `docs/verification/2026-08-29-ai-teammate-foundation-`;
- supporting-evidence prefix
  `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-`;
- supporting-evidence prefix
  `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-`;
- supporting-evidence prefix
  `docs/audits/evidence/2026-08-30-ai-teammate-foundation-`;
- supporting-evidence prefix
  `docs/audits/evidence/security/2026-08-30-ai-teammate-foundation-`; and
- supporting-evidence prefix
  `docs/verification/2026-08-30-ai-teammate-foundation-`.

The implementation inventory read by this audit is:

- `src/components/preview/AiTeammate/AgentStudioPanel.tsx`;
- `src/components/preview/AiTeammate/LocalAiTeammatePanel.tsx`;
- `src/components/preview/AiTeammate/*test*`;
- `src/components/preview/Workbench.tsx` and `src/app/styles/workbench.css`;
- `src/app/api/ai-teammates/[id]/route.ts` and its test;
- `src/lib/aiTeammates/*` and directly associated tests/contracts; and
- the three exact Canvas E2E harnesses above.

## Fresh deterministic baseline

- `npm run verify:plans`: exit 0 — 17 domains, 29 tickets, 21 program evaluations.
- Authority packet SHA-256: `f17059ecbf094c89ace92f1b415f0bf5a695f8893feec3a0843dd9eedd50aa51`.
- `npm run test:plans`: exit 0 — 48/48.
- Focused Agent Studio, local route, registry, executor, and receipt suite:
  exit 0 — 8 files, 37/37 tests.

Exact shell-free argv, cwd, exit codes, stdout/stderr byte counts, full short
transcripts, the long plan-suite transcript hash, and all three transcript
SHA-256 values are recorded in
`docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-t0-baseline-runs.json`.

One first focused-test invocation left the route-test path unquoted and zsh
treated `[id]` as a glob. It ran no test and is explicitly marked
`baselineEvidence: false` in the run artifact. The baseline is the subsequent
shell-free argv run, which passed the literal path without glob expansion.

## Reviewer routing

- Primary full-section audit: exact `claude-fable-5`, maximum effort, Claude
  Code subscription OAuth, read-only tools, no fallback, no subagent delegation.
- Per-task adversarial review: exact `x-ai/grok-4.6`, `xhigh`, OpenRouter, no
  fallback.

This receipt is evidence, not authority, and authorizes no release or deployment.
