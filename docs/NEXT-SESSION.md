# NEXT SESSION — repository map and open to-dos

Working board for ONE BOX. Read this first, then the authority it points into.
An item lives here only while it is open. When one lands, delete the line and
record the outcome in the plan, spec, or ledger it belongs to.

Last updated: 2026-09-02 (wave 0 of the `one-box-gauntlet-r1` run, against `main`
at `4b02f75`).

Authority order when documents disagree:

1. `docs/plans/one-box-master/00-authority/plan-register.md` — the domain
   authority table, on `main` since PR #19 (lineage C slice 1).
2. `docs/plans/2026-08-20-studio-consolidation-extraction.md` — decisions D1–D6,
   defects DEF-1 to DEF-3, kill criteria.
3. This file. It is a queue and a map, not a source of truth.

Defects go in `docs/ENGINE-LEDGER.md` (append-only). Repository and integration
defects from this sweep are the `REPO-*` rows there.

## Repository map (2026-09-02)

`main` is `4b02f75` (the PR #19 merge commit). Verified on the wave-0
integration branch: 1399 Vitest tests pass (4 skipped), typecheck clean, lint
0 errors and 0 warnings, `test:smoke` passes with no module-type warning,
`verify:plans` and `test:plans` pass. CI (`.github/workflows/ci.yml`) runs the
authority oracle **first**, fail-closed and before dependency install: step
"Verify plan authority and traceability" (`verify:plans && test:plans`,
`ci.yml:30-31`) precedes `npm ci` (`:33-34`). Only then come `npm test`,
typecheck, lint, build, and last the rendered Page IR regressions
(`test:e2e:page-ir` against a started server). This runs on every PR to `main`.

Lineage A landed (PR #18) and lineage C's first slice landed (PR #19). Two
things are still out: lineage B, open as PR #20, and lineage C's terminal
correction wave (T-8), which has no PR.

| Lineage | Branch(es) | Ahead of `main` | Holds | State on 2026-09-02 |
|---|---|---|---|---|
| A — consolidation docs | `chore/repo-state-20260901` → PR #18 | landed | `AGENTS.md` pointers, this board, the 2026-08-20 consolidation plan | **Landed 2026-09-02**, squash `c7d1243`. |
| B — evidence review UI | `wave-0/pr17-rebased` → PR #20 (supersedes #17) | 29 commits | Evidence-review feedback workflow, guided pipeline mode, Google Maps embed, token specimens, capability roadmap | Rebased onto `main` at `4b02f75`; CI green (run 33634877941); ready for review. `package.json` untouched — its four script additions are `node` invocations instead, because the file is hash-pinned. Merge is the owner's; see the typography-specimen gate in the PR body. |
| C — OBX-P180 operating environment | slice 1 `integrate/lineage-c-slice-1` → PR #19; then `feat/obx-p180-t03-t05-offline-wave-recovery` → `feat/obx-p180-terminal-correction-r1` | slice 1 landed; the terminal wave is still out | Master plan library, 29 program tickets, T01/T02 registry and route reducers, T03/T04 provider-offline reducers, correction governance, terminal verifier checkpoint | **Slice 1 landed 2026-09-02** as true merge commit `4b02f75`. Merge commits needed two repository toggles (`allow_merge_commit`, ruleset `allowed_merge_methods`), changed for the merge and restored after; later C descendants need the same. The terminal wave stays governed by `OBX-AUTH-P180-PHASE1-TERMINAL-CORRECTION-003`; resume only through the handoff below. |

Four branches landed by the PR #15 squash (`feat/ui-overhaul-linear`,
`spike/refero-baseline`, `spike/layout-ir`, `fix/pause-status-pulse-when-hidden`)
were deleted on 2026-09-01 after an ancestry re-check.

**Integration order (decided 2026-09-01, executed 2026-09-02):** A, then C in
reviewed slices, then rebase B. A landed as PR #18 and C slice 1 as PR #19; B
was rebased onto that result and opened as PR #20, which is **not merged** —
the owner holds it. C lands with true merge commits only; the OBX-P180 program
pins `62b7b74` and `c09dfd0` by SHA, and a squash or rebase would orphan its
branches and the pushed checkpoint.

### Worktrees

| Path | Branch | Purpose |
|---|---|---|
| `~/projects/one-box` | `docs/studio-consolidation-plan` | Primary checkout. Lineage A has landed (PR #18), so switch it to `main` and delete the branch. |
| `~/projects/one-box-worktrees/gauntlet-r1` | `wave-0/integration` | The `one-box-gauntlet-r1` run's own worktree. Wave-0 integration branch; gates run here. |
| `~/projects/one-box-worktrees/latest-main-20260825` | detached at `cb26ae9` | A 2026-08-25 snapshot with `node_modules`, two merges behind current `main`. **Not** a mirror of `main`; do not run gates against `main` here. Retarget it or delete it. |
| `~/projects/one-box-worktrees/repo-state-20260901` | `chore/repo-state-20260901` | The 2026-09-01 sweep. Landed as PR #18; removable. |
| `~/projects/one-box-worktrees/integrate-lineage-c` | `integrate/lineage-c-slice-1` | Lineage C slice 1. Landed as PR #19 (`4b02f75`); **removable**. |
| `~/projects/one-box-worktrees/la-appointment-field-study` | `research/la-appointment-field-study` | OBX-P180 source worktree. Read-only for the program. Holds the protected untracked handoff; never open it. |
| `~/projects/one-box-worktrees/obx-p180-t03-t05-offline-wave` | `feat/obx-p180-t03-t05-offline-wave` | Original T03/T04 wave. Superseded by the recovery lineage. |
| `~/projects/one-box-worktrees/obx-p180-t03-t05-offline-wave-recovery` | `feat/obx-p180-t03-t05-offline-wave-recovery` | `-002` supersession base `c09dfd0`. Clean; the former drafts are archived under `~/Backups/one-box/obx-p180-recovery-drafts-20260901/` (REPO-007). |
| `~/projects/one-box-worktrees/obx-p180-terminal-correction-r1` | `feat/obx-p180-terminal-correction-r1` | Wave 1 of the run: the OBX-P180 terminal correction, from `c09dfd0` with the `1c39259` checkpoint diff applied. |
| `~/projects/one-box-worktrees/pr17-evidence-review-ui` | `fix/pr17-intake-e2e` | PR #17 head plus the e2e fix. Superseded by PR #20; remove once #20 lands. |
| `~/projects/one-box-worktrees/wave-0-eos-001` | `wave-0/eos-001` | Wave 0, EOS-001 authority-chain confirmation. Merged into `wave-0/integration`. |
| `~/projects/one-box-worktrees/wave-0-eos-003` | `wave-0/eos-003` | Wave 0, EOS-003 outcome baseline. Merged into `wave-0/integration`. |
| `~/projects/one-box-worktrees/wave-0-hygiene` | `wave-0/hygiene` | Wave 0, REPO-002 and REPO-003 hygiene. Merged into `wave-0/integration`. |
| `~/projects/one-box-worktrees/wave-0-pr17-rebase` | `wave-0/pr17-rebased` | Wave 0, lineage B rebase. PR #20; keep until the owner merges it. |
| `~/projects/one-box-worktrees/wave-2-governance` | `wave-2/governance` | Wave 2 authorization mechanism for phases P1 and P2. Not yet in a PR. |
| `~/projects/one-box-worktrees/wave-3-t2-probe` | `wave-3/t2-probe` | The T-2 probe record. Lands with wave 3. |
| `~/projects/one-box-worktrees/wave-3-defects` | `wave-3/t3-t4` | Wave 3, T-3 (DEF-2) and T-4 (`perf-budget`). |
| `~/Documents/Codex/2026-09-01/one-box-obx-p180-terminal-correction/work/one-box-terminal` | `checkpoint/obx-p180-terminal-correction-handoff-20260901` | Codex execution clone for the terminal correction. Holds `task-6-final-review.md` and `task-7-governance-brief.md` under `.superpowers/sdd/implementation-plan/`. |

### Program state outside the repository

- OBX-P180 handoff and initialization prompt:
  `~/Inbox/notes/handoffs/obx-p180-terminal-correction.md`.
- OBX-P180 goal state (contract, state, run log, proofs, receipts, censuses):
  `~/.claude/goal-state/obx-p180-t03-t05-offline-wave/`. Status on 2026-09-01:
  `AUTHORIZED_PRE_ACTIVATION`, current task T6, T05 prohibited, T06+ unauthorized.
- Autonomous run `one-box-gauntlet-r1`:
  `~/.claude/goal-state/one-box-gauntlet-r1/` (contract with the owner block,
  `run.log.md`, `decisions.json`, proofs, the owner's 126-site reference library
  under `bars/`). Waves 0 to 3. Wave 0 closed three items from this board:
  **T-9** (REPO-002, six lint warnings; lint now reports 0 errors and 0
  warnings), **T-10** (the contract exists at
  `~/.claude/goal-state/one-box-gauntlet-r1/contract.md` with the owner block
  filled, and the run is executing), and **T-2** (the probe record
  `docs/audits/2026-09-02-t2-probe-auric-clinic-glow.md`, on branch
  `wave-3/t2-probe`, landing with wave 3).
- Earlier completed runs: `~/.claude/goal-state/onebox-canvas-upgrade/`,
  `one-box-native-ai-teammate-slice/`, `obx-p180-source-adoption-closure/`,
  `obx-p180-t01-contract-kernel/`, `obx-p180-t02-registry-route/`.
- Daily maintenance automation (docs, housekeeper, contract-conformance,
  accepted-main verification, dependency CVE) runs from
  `~/bin/zs-project-maintenance` against this repository. It records a blocker
  instead of touching active work.

## Do first

- [ ] **T-3 — Fix DEF-2: gates are coupled to the frozen template.**
  The `no-js` gate hardcodes `hero.headline`, `nav`, `contact.cta`
  (`src/lib/gates.ts:1303`); token drift parses only `--color-*` and `--font-*`
  (`src/lib/gates.ts:991`); the repair loop edits only `index.html` and
  `tokens.css` (`src/lib/pipeline.ts:2317`). Scope from T-2's gate-failure
  record, `docs/audits/2026-09-02-t2-probe-auric-clinic-glow.md`, which is on
  branch `wave-3/t2-probe` and lands with wave 3.

## Do next

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

## Owner actions (outward-facing or hook-gated; not for agents)

- Review and merge **PR #20** (lineage B rebased, supersedes #17). CI is green
  and `package.json` is untouched. Its own merge gate stands: typography
  specimen support is marked Partial, so accept or narrow that criterion first.
  When it lands, close PR #17 and remove the `pr17-evidence-review-ui` worktree.
- Three decisions are open in the run's `decisions.json`
  (`~/.claude/goal-state/one-box-gauntlet-r1/decisions.json`), each with the
  default the run takes if the owner stays silent:
  - **D-1** — name a second human as the non-author verifier, or confirm none is
    available. `docs/governance/reviewer-roles.md` makes that role a named
    human, and a model cannot fill it. With one human no `OwnerAssignmentV1` can
    be active, so wave 2 runs on solo-exception records and the P3 client-review
    surface stays frozen.
  - **D-2** — the T01 and T02 authorization records carry `renewable: false` and
    expire 2026-09-14. From that moment `verify:plans` fails on every PR. See
    the REPO row in `docs/ENGINE-LEDGER.md`.
  - **D-3** — approve the exact `PageIRV1` and generated-site schema diff before
    any P4 code that changes schemas. The diff has to exist first, so this one
    comes later, at the P2 merge.
- Switch `~/projects/one-box` to `main` and delete `docs/studio-consolidation-plan`
  (PR #18 landed).

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
delete its certified dead weight instead — say so now rather than later.
