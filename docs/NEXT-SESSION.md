# NEXT SESSION — repository map and open to-dos

Working board for ONE BOX. Read this first, then the authority it points into.
An item lives here only while it is open. When one lands, delete the line and
record the outcome in the plan, spec, or ledger it belongs to.

Last updated: 2026-09-01 (repository-state sweep against `main` at `cb26ae9`).

Authority order when documents disagree:

1. `docs/plans/one-box-master/00-authority/plan-register.md` — the domain
   authority table. It lives on `research/la-appointment-field-study` and its
   descendants, not yet on `main`.
2. `docs/plans/2026-08-20-studio-consolidation-extraction.md` — decisions D1–D6,
   defects DEF-1 to DEF-3, kill criteria.
3. This file. It is a queue and a map, not a source of truth.

Defects go in `docs/ENGINE-LEDGER.md` (append-only). Repository and integration
defects from this sweep are the `REPO-*` rows there.

## Repository map (2026-09-01)

`main` is `cb26ae9` (PR #16). Verified on that commit: 1275 Vitest tests pass
(4 skipped), typecheck clean, lint 0 errors / 6 warnings, `test:smoke` passes.
CI (`.github/workflows/ci.yml`) runs `npm test`, typecheck, lint, build, and
then the rendered Page IR regressions (`test:e2e:page-ir` against a started
server) on every PR to `main`.

Three unmerged lineages branch from `main`. They were built by different agents
and do not reference each other.

| Lineage | Branch(es) | Ahead of `main` | Holds | State on 2026-09-01 |
|---|---|---|---|---|
| A — consolidation docs | `docs/studio-consolidation-plan` (local only) | 1 commit, 3 files | `AGENTS.md` pointers, this board, the 2026-08-20 consolidation plan | Cherry-picked into `chore/repo-state-20260901`. Merges onto `main` cleanly. |
| B — evidence review UI | `codex/onebox-review-evidence-ui` → PR #17 (draft) | 27 commits, 85 files | Evidence-review feedback workflow, guided pipeline mode, Google Maps embed, token specimens, capability roadmap | CI green on head `3643ee5` after the e2e fix (REPO-001). Conflicts with lineage C in `package.json`; both edit `src/lib/contracts.ts`. Rebases after C per the integration order. |
| C — OBX-P180 operating environment | `research/la-appointment-field-study` (21 commits, pushed) → `feat/obx-p180-t03-t05-offline-wave` → `feat/obx-p180-t03-t05-offline-wave-recovery` → `checkpoint/obx-p180-terminal-correction-handoff-20260901` (pushed, `1c39259`) | up to 44 commits, 380+ files | Master plan library, 29 program tickets, T01/T02 registry and route reducers, T03/T04 provider-offline reducers, correction governance, terminal verifier checkpoint | Governed by `OBX-AUTH-P180-PHASE1-TERMINAL-CORRECTION-003`. No PR. Resume only through the handoff below. |

Four branches landed by the PR #15 squash (`feat/ui-overhaul-linear`,
`spike/refero-baseline`, `spike/layout-ir`, `fix/pause-status-pulse-when-hidden`)
were deleted on 2026-09-01 after an ancestry re-check.

**Integration order (decided 2026-09-01):** A, then C in reviewed slices, then
rebase B. C lands with true merge commits only; the OBX-P180 program pins
`62b7b74` and `c09dfd0` by SHA, and a squash or rebase would orphan its branches
and the pushed checkpoint. The first mergeable slice of C is
`research/la-appointment-field-study` through `62b7b74`.

### Worktrees

| Path | Branch | Purpose |
|---|---|---|
| `~/projects/one-box` | `docs/studio-consolidation-plan` | Primary checkout. Untracked `references/` and `spikes/` are ignored or tracked on `main`; switch this checkout to `main` once lineage A lands. |
| `~/projects/one-box-worktrees/latest-main-20260825` | detached at `cb26ae9` | Clean mirror of `main` with `node_modules`; use it for gates against `main`. |
| `~/projects/one-box-worktrees/repo-state-20260901` | `chore/repo-state-20260901` | This sweep. |
| `~/projects/one-box-worktrees/la-appointment-field-study` | `research/la-appointment-field-study` | OBX-P180 source worktree. Read-only for the program. Holds the protected untracked handoff; never open it. |
| `~/projects/one-box-worktrees/obx-p180-t03-t05-offline-wave` | `feat/obx-p180-t03-t05-offline-wave` | Original T03/T04 wave. Superseded by the recovery lineage. |
| `~/projects/one-box-worktrees/obx-p180-t03-t05-offline-wave-recovery` | `feat/obx-p180-t03-t05-offline-wave-recovery` | `-002` supersession base `c09dfd0`. Clean; the former drafts are archived under `~/Backups/one-box/obx-p180-recovery-drafts-20260901/` (REPO-007). |
| `~/projects/one-box-worktrees/pr17-evidence-review-ui` | `fix/pr17-intake-e2e` | PR #17 head plus the e2e fix; remove once PR #17 lands. |
| `~/Documents/Codex/2026-09-01/one-box-obx-p180-terminal-correction/work/one-box-terminal` | `checkpoint/obx-p180-terminal-correction-handoff-20260901` | Codex execution clone for the terminal correction. Holds `task-6-final-review.md` and `task-7-governance-brief.md` under `.superpowers/sdd/implementation-plan/`. |

### Program state outside the repository

- OBX-P180 handoff and initialization prompt:
  `~/Inbox/notes/handoffs/obx-p180-terminal-correction.md`.
- OBX-P180 goal state (contract, state, run log, proofs, receipts, censuses):
  `~/.claude/goal-state/obx-p180-t03-t05-offline-wave/`. Status on 2026-09-01:
  `AUTHORIZED_PRE_ACTIVATION`, current task T6, T05 prohibited, T06+ unauthorized.
- Earlier completed runs: `~/.claude/goal-state/onebox-canvas-upgrade/`,
  `one-box-native-ai-teammate-slice/`, `obx-p180-source-adoption-closure/`,
  `obx-p180-t01-contract-kernel/`, `obx-p180-t02-registry-route/`.
- Daily maintenance automation (docs, housekeeper, contract-conformance,
  accepted-main verification, dependency CVE) runs from
  `~/bin/zs-project-maintenance` against this repository. It records a blocker
  instead of touching active work.

## Do first

- [ ] **T-2 — Probe run: one design system through the current pipeline.**
  Take one MishMash design system that already meets the CAT-001 bar (HTML +
  CSS custom properties + a ONE BOX-shaped DESIGN.md), or strip one until it
  does. Convert it **by hand**. Run the current pipeline. Record which gates fail
  and why. The pipeline is now the Page IR safe pipeline (PR #16), so DEF-1 no
  longer eats the previous preview.
  *Do not build an ExecutionAdapter to make this work.* If one package cannot
  get through without a new runtime abstraction, the thesis is already wrong.
  *Done when:* a written gate-failure record exists in `docs/audits/`.

## Do next

- [ ] **T-3 — Fix DEF-2: gates are coupled to the frozen template.**
  The `no-js` gate hardcodes `hero.headline`, `nav`, `contact.cta`
  (`src/lib/gates.ts:1303`); token drift parses only `--color-*` and `--font-*`
  (`src/lib/gates.ts:991`); the repair loop edits only `index.html` and
  `tokens.css` (`src/lib/pipeline.ts:2317`). Scope from T-2's failure record.

- [ ] **T-4 — Decide `perf-budget`.** Still advisory (`src/lib/gates.ts:18`,
  `:1406`). Make it blocking or record why not (GATE-001). Until then, "all
  gates fail closed" is not a true statement about this repository.

- [ ] **T-5 — Write the provenance schema (LIC-001) before any import.**
  Source repo, commit, path, SPDX licence, licence-text pointer, SHA-256, import
  mode, destination. CI fails on missing records or hash drift. Nothing gets
  copied in from MishMash or OpenWork until this exists.

- [ ] **T-6 — Commit the CAT-001 bar and cap as numbers.**
  Bar: HTML + CSS custom properties + ONE BOX DESIGN.md; no framework components,
  no foreign tool names, no JS build step. Cap for v1: single-digit design
  systems, ~10 templates, a named skill list.

- [ ] **T-8 — Resume OBX-P180 terminal correction.** Follow the initialization
  prompt in the handoff exactly: fresh worktree from `c09dfd0`, apply the
  `1c39259` diff uncommitted, turn the 7 malformed-proof tests green, close the
  four open verifier findings in `task-6-final-review.md`, get a fresh
  independent scanner review, then build the twelve-path G1 commit per
  `task-7-governance-brief.md`. T05 stays closed until T03 and T04 are both
  `COMPLETED_VERIFIED`.

- [ ] **T-9 — Clear the six lint warnings on `main`** (REPO-002). Two are unused
  eslint-disable directives, three are unused symbols, one is `<img>` in
  `AssistantPanel.tsx`. Zero-risk cleanup; do it in its own commit.

- [ ] **T-10 — Write the gauntlet-loop contract.** The owner's stated goal is a
  gauntlet loop that drives this repository to completion. Its quality bar must
  come from the plan register and the Release 1 contract, not from this board.
  Prerequisite: lineage C on `main`.

## Owner actions (outward-facing or hook-gated; not for agents)

- Review and merge PR #18 (lineage A), then switch `~/projects/one-box` to
  `main` and delete `docs/studio-consolidation-plan`.
- Review and merge PR #17 once its CI is green and its own merge gate (the
  typography specimen note in the PR body) is accepted or narrowed.

## Watch list — do not start these

Recorded so they are not restarted by accident. Each is excluded by a decision in
the consolidation plan or the plan register, not by oversight.

- **Do not build an ExecutionAdapter yet.** Blocked behind P1 (artifact boundary)
  and P2 (proof harness). See EXEC-001 and the consolidation plan's "First
  action" section.
- **Do not add a second routing table.** ONE BOX already has a routing policy at
  `docs/eval/model-routing/policy.md`, and its evidence matrix authorizes no new
  production route.
- **Do not delete the legacy DESIGN.md renderer** before migration behaviour is
  defined (DES-001).
- **Do not start a second artifact type** (PPTX, MP4, audio) before D5 is
  satisfied.
- **Do not adopt Panda CSS, Storybook, Radix, Biome, ts-morph, PostHog,
  OpenTelemetry, Medusa/Strapi, OpenWebUI, Remotion, Theatre.js, Excalidraw, or
  Styled System.** Evaluated 2026-08-20 and excluded with reasons in the plan.
- **Do not vendor any byte from OpenWork's `/ee`** (FSL-1.1-MIT, LIC-002).
- **Do not start T05, T06, or later OBX-P180 work** outside the authority named
  in the handoff.
- **Do not open `.claude/handoffs/one-box-operating-environment-next-phase.md`**
  in any worktree. It is protected; integrity is checked by hash only.
- **Do not add `.codex/config.toml`** during the OBX-P180 wave.

## Open question for the owner

None blocking. HTML-first is decided (D5). If PPTX and MP4 must ship in v1, the
consolidation plan is wrong and the correct move is to stay on MishMash and
delete its certified dead weight instead — say so before T-2 rather than after.
