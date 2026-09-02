# Release 1 measurable-outcome baseline (2026-09-02)

Closure record for **EOS-003 — a narrow first release and measurable product
outcome**, at
[`docs/plans/one-box-master/00-authority/2026-08-29-engineering-operating-system-and-gap-register.md`](../plans/one-box-master/00-authority/2026-08-29-engineering-operating-system-and-gap-register.md)
(heading *EOS-003 — a narrow first release and measurable product outcome*).

Run target: the Release 1 packet accepted by the owner on 2026-09-02,
[`docs/plans/one-box-master/01-foundation/release-1-contract.md`](../plans/one-box-master/01-foundation/release-1-contract.md).
Two headings of that contract govern this record:

- **§8 Readiness and exit gates** — gate R1-9 blocks on "numeric target
  presented without baseline".
- **§8.1 Baseline protocol before numeric targets** — a reproducible baseline
  must exist before anyone chooses a numeric quality target.

## What this document is

Every entry below is a **baseline**: the value the outcome has **today**, or an
explicit statement that it cannot yet be measured. **No entry is a target.** No
threshold, goal, or acceptable range is proposed here; per §8.1 that decision
belongs to the owner in a later qualification version.

Where an outcome cannot be measured, the entry names the exact reason and the
instrument that must exist first. **No number is estimated, inferred, or
carried over from another project.**

## Reproduction environment

- Repository state: `4b02f75ff8954ee09b1c58d4e16a600f6fe4ca41` (origin/main).
- All commands run from the repository root of a clean checkout at that commit.
- Commit-history range covered: **2026-08-12** (root commit) to **2026-09-02**
  (HEAD), 74 commits.
- **No live vendor call was made** to produce this record, and none is required
  to reproduce it. Every figure comes from committed repository files and local
  git metadata.

Baseline reproduction commands:

```
git rev-parse HEAD                                    # 4b02f75f...
git rev-list --count HEAD                             # 74
git log --format='%ad' --date=short --max-parents=0   # 2026-08-12
git log -1 --format='%ad' --date=short                # 2026-09-02
```

## Standing evidence surfaces checked

| Surface | What it holds | Reachable at HEAD |
|---|---|---|
| `sites/<id>/run.json`, `events.jsonl` | Per-run stage timings, `gateRepairAttempts`, gate cards | **No** — `sites/` is git-ignored (`.gitignore:45`) and absent from a clean checkout |
| `docs/eval/ab/manifest.json`, `results.md`, `scoresheet.md` | 3 prompts x 3 arms = 9 generated candidates, 2026-08-13 | Yes |
| `docs/eval/e2e-latest.json` | One end-to-end acceptance run, 2026-08-13 | Yes |
| `docs/eval/baseline/comparison-status.md` | Path A vs Path B controlled run state | Yes (run itself **pending**) |
| `scripts/smoke/gates-smoke.mjs` | One hardcoded fixture through builder + gates | Yes |
| `docs/ENGINE-LEDGER.md` | Append-only defect ledger, severity `S1`/`S2`/`S3` | Yes |
| `docs/audits/` | Planning and security audit runs | Yes |
| `sites/` evidence ledgers | Per-site evidence receipts | **No** — directory does not exist |

## Outcome baselines

### 1. Median designer finishing time

- **Method.** Median wall-clock elapsed per project from intake freeze (gate
  R1-0) to the designer-accepted candidate carrying the R1-2 three-viewport
  visual receipt.
- **Data source used.** `StageStatusSchema` in `src/lib/contracts.ts:1882-1889`
  records `startedAt` and `finishedAt` per pipeline stage; those land in
  `sites/<id>/run.json` (`SITES_DIR`, `RUN_FILE` at `src/lib/contracts.ts:4679-4680`).
- **Baseline. Not yet measurable.** Two reasons, both exact: (a) no run state is
  retained in the repository — `sites/` is git-ignored and absent, so the
  denominator is zero projects; (b) even with retained runs, the recorded clock
  covers pipeline stages only. There is no timestamp for the designer's Canvas
  session or for the human visual decision, so the measured interval would not
  be a designer finishing time.
- **Instrument required.** A committed per-project timing ledger that stamps
  intake freeze, candidate ready, each Canvas refinement session open/close, and
  the named-human visual-approval receipt.
- **Command.**
  ```
  test -d sites && echo present || echo absent      # absent
  grep -n "finishedAt\|startedAt" src/lib/contracts.ts | sed -n '1,12p'
  ```

### 2. First-candidate gate pass rate

- **Method.** Share of generated site candidates whose **first** gate run passed
  every blocking gate: candidates with a first `gateBuiltCandidate` receipt
  clean on all blocking gates, divided by all generated candidates. The engine
  runs 8 candidate gates, **7 of them blocking** (`perf-budget` is advisory).
  The first-run/repaired discriminator already exists as
  `stages.built.gateRepairAttempts` (`src/lib/contracts.ts:1888`); `0` means the
  first run passed.
- **Data source used.** `docs/eval/ab/manifest.json` (the only committed
  multi-candidate record: 9 arm-runs, generated 2026-08-13T17:31:43Z);
  `docs/eval/e2e-latest.json` (n=1, 22/22 checks pass, 2026-08-13T13:30:52Z);
  `scripts/smoke/gates-smoke.mjs`.
- **Baseline. Not yet measurable.** The A/B manifest records only whether a run
  **stream completed** (`ok`), and `scripts/eval/ab-run.mjs:167` resumes an
  incomplete stream **up to three times** before recording that flag. It carries
  no per-gate field and no `gateRepairAttempts`, so a first-run pass cannot be
  separated from a repaired pass. `docs/eval/e2e-latest.json` is a single run and
  likewise records no repair count. `scripts/smoke/gates-smoke.mjs` builds one
  hardcoded fixture, which is a regression check, not a generated-candidate
  corpus. The durable per-run record that does hold the discriminator lives under
  git-ignored `sites/`.
- **Adjacent measurable, not the outcome.** `docs/eval/ab/results.md:14` states
  in prose that all 9 candidates passed all quality gates. That is a human
  summary of final state over 9 candidates on 2026-08-13; it does not say
  whether any candidate needed the repair cycle, so it cannot stand in for a
  first-candidate rate.
- **Instrument required.** A committed run-outcome ledger recording, per
  candidate: candidate id, first gate receipt with per-gate blocking pass/fail,
  and `gateRepairAttempts`.
- **Command.**
  ```
  node -e "const m=require('./docs/eval/ab/manifest.json');console.log('arm-runs',m.results.flatMap(r=>Object.keys(r.arms||{})).length)"   # 9
  node -e "const m=require('./docs/eval/ab/manifest.json');console.log(JSON.stringify(m.results[0]))"   # no gate or repair field
  grep -c '^    gate: "' src/lib/gates.ts                                        # 8 gates
  grep -c "blocking: true" src/lib/gates.ts                                      # 7 blocking
  grep -n "gateRepairAttempts" src/lib/contracts.ts src/lib/builder.ts
  ```

### 3. Escaped P0/P1 defects

- **Method.** Count of P0/P1 defects first observed **in a released public
  artifact**, over the number of Release 1 releases in the window.
- **Data source used.** `docs/ENGINE-LEDGER.md` (append-only defect ledger,
  severity legend at line 13: `S1` blocks shipping); `src/app/api/` route
  inventory; Release 1 contract §3.8, which leaves the deployment adapter
  unresolved (§10, first bullet).
- **Baseline. Not yet measurable as an escape count or rate.** The denominator
  is **zero releases** over 2026-08-12 to 2026-09-02: no deployment adapter
  exists in `src/`, there is no release route, and no public artifact has been
  produced. A defect cannot be classified as escaped when nothing has shipped.
- **Adjacent measurable, not the outcome — pre-release S1 inventory.** Over
  2026-08-15 (ledger opened) to 2026-09-02 (last commit touching the ledger),
  the ledger holds **53 severity-bearing rows**, of which **19 are S1**
  ("blocks shipping", the closest local equivalent of P0/P1). S1 status split:
  12 FIXED, 3 OPEN, 2 TRACKED, 2 CONFIRMED. These are defects found **before**
  any release, which is the opposite of an escape.
- **Instrument required.** A release ledger assigning each release an id and
  hash, plus a defect field recording "first observed after release X", so an
  escape can be distinguished from a pre-release finding.
- **Command.**
  ```
  awk -F'|' '$2 ~ /^ [A-Z0-9]+-[0-9]+ $/ { s=$3; gsub(/[ *]/,"",s); if (s ~ /^S[123]$/) c[s]++ } END { for (k in c) print k, c[k] }' docs/ENGINE-LEDGER.md | sort
  # S1 19 / S2 24 / S3 10
  awk -F'|' '$2 ~ /^ [A-Z0-9]+-[0-9]+ $/ { s=$3; st=$4; gsub(/[ *]/,"",s); gsub(/[ *]/,"",st); if (s=="S1") c[st]++ } END { for (k in c) print k, c[k] }' docs/ENGINE-LEDGER.md | sort
  # CONFIRMED 1 / CONFIRMED,nowgated 1 / FIXED 12 / OPEN 3 / TRACKED 2
  ls src/app/api | grep -cE '^(deploy|release|rollback)$'   # 0
  ```

### 4. Number of manual code interventions

- **Method attempted.** Count human-authored fix commits that follow
  agent-authored commits, using git authorship to partition the history.
- **Data source used.** Local git metadata at HEAD; commit trailers.
- **Baseline. Not yet measurable. The method cannot run: authorship is not
  distinguishable.** All **74** commits carry a single author identity
  (`wiggdevin`), so no human/agent partition exists. **11 of 74** commits carry a
  `Co-authored-by: Claude ...` trailer; the other 63 carry no provenance marker
  at all. Absence of that trailer does **not** imply a human author — the house
  commit convention omits AI attribution trailers, so the trailer is a lower
  bound on agent involvement, never a partition of the history.
- **Limits of the method even if authorship were tagged.** A manual code
  intervention is an edit inside a run, whereas a commit aggregates many edits
  across many runs; a commit count would over- or under-state interventions by
  an unknown factor. The commit log is the wrong grain for this outcome.
- **Adjacent measurable, not the outcome.** 26 of 74 commits touch `src/`; 8 of
  those have a `fix` subject. These counts describe repository activity, not
  interventions in a generated candidate.
- **Instrument required.** Either a per-run intervention log that records each
  human edit applied to candidate files against its run id, or a mandatory
  commit trailer that marks each commit agent-authored or human-authored.
- **Command.**
  ```
  git shortlog -sne HEAD                                  # 74 wiggdevin <...>  (one identity)
  git rev-list --count -i --grep='co-authored-by' HEAD    # 11
  git rev-list --count HEAD                               # 74
  git rev-list --count HEAD -- src                        # 26
  git rev-list --count --grep='^fix' HEAD -- src          # 8
  ```

### 5. Visual-review score

- **Method.** Named-human score per candidate on the frozen five-dimension
  rubric (hierarchy, distinctiveness, cohesion, conversion, craft; 0-10 each,
  0-50 total) recorded at gate R1-2, per `docs/eval/rubric.md` (frozen
  2026-08-12, before any run).
- **Data source used.** `docs/eval/ab/scoresheet.md`, the judge-of-record sheet
  for the 9 A/B candidates.
- **Baseline. Not yet measurable.** The judge-of-record sheet is **unscored: 9
  of 9 candidate rows are empty** across all five dimensions.
  `docs/eval/ab/results.md:53` records the same state: "Judge-of-record scores
  pending (Devin)."
- **Adjacent measurable, advisory only, explicitly not the Release 1
  instrument.** Two blind model advisories scored the same 9 candidates on
  2026-08-13, arm averages out of 50: agy Gemini R 33.3 / L 35.7 / N 32.0
  (`results.md:29`); Claude build agent, on the prior build round, R 37.3 /
  L 34.7 / N 35.3 (`results.md:40`). `results.md:61-63` records that the two
  advisory judges disagreed materially, which is why a named human is the judge
  of record. These numbers are advisory input, never a visual-review baseline.
- **Instrument required.** A completed judge-of-record score sheet bound to a
  candidate hash and to the R1-2 three-viewport visual receipt.
- **Command.**
  ```
  awk -F'|' '$2 ~ /^ *[ABC] *$/ {t++; b=1; for (i=3;i<=8;i++) if ($i ~ /[^ ]/) b=0; u+=b} END {print u"/"t" rows unscored"}' docs/eval/ab/scoresheet.md
  # 9/9 rows unscored
  sed -n '22,53p' docs/eval/ab/results.md      # advisory tables and the pending line
  ```

### 6. Release success rate

- **Method.** Releases whose deployment produced a verified public artifact
  matching the approved bundle identity and hash (gate R1-6 conformance
  receipts), divided by release attempts.
- **Data source used.** `src/app/api/` route inventory; Release 1 contract §3.8
  (provider-neutral deployment) and §10 (the deployment adapter is an
  unresolved decision).
- **Baseline. Not yet measurable.** Denominator is **zero release attempts**.
  No deployment adapter, release route, or provider descriptor exists in `src/`;
  the contract defers provider selection to an authorization after this packet.
- **Instrument required.** A deployment adapter emitting R1-6 upload, promotion,
  and verification receipts, committed to a release ledger keyed by release id.
- **Command.**
  ```
  ls src/app/api | grep -cE '^(deploy|release|rollback)$'         # 0
  grep -rli 'deployment adapter' src --include='*.ts' | wc -l     # 0
  ```

### 7. Rollback success rate

- **Method.** Authorized rollbacks that restored a prior verified release
  without reactivating a stale artifact (gate R1-8), divided by rollback
  attempts.
- **Data source used.** `src/` TypeScript sources mentioning `rollback`.
- **Baseline. Not yet measurable.** Denominator is **zero rollback attempts**,
  for the same reason as outcome 6. The 9 `src/**/*.ts` files that mention
  `rollback` all concern **local candidate promotion and recovery**
  (`candidate.ts`, `siteMutation.ts`, `pageIrMutation.ts`, and their tests), not
  rollback of a public release. Passing recovery tests are correctness evidence,
  never an outcome measurement.
- **Instrument required.** A release ledger plus recorded R1-8 recovery drills
  (seeded failure, retry, rollback, requalify) with pass/fail per attempt.
- **Command.**
  ```
  grep -rl "rollback" src --include='*.ts' | sort   # 9 files, all candidate-local
  ```

### 8. Post-launch support load

- **Method.** Support contacts per released site in the first 30 days after
  launch.
- **Data source used.** Repository-wide search for a support record.
- **Baseline. Not yet measurable.** No site has launched (outcome 6), and the
  repository contains **no support channel, ticket record, or intake log**. The
  only occurrence of the phrase in `docs/` is the EOS-003 requirement text
  itself.
- **Instrument required.** A support intake record keyed by release id and
  launch date, with a contact type and a resolution field.
- **Command.**
  ```
  grep -rl "support load" docs --exclude-dir=audits
  # docs/plans/one-box-master/00-authority/2026-08-29-engineering-operating-system-and-gap-register.md  (the requirement, not data)
  ```

## Summary

| # | Release 1 outcome | Baseline at 2026-09-02 | Blocking instrument gap |
|---|---|---|---|
| 1 | Median designer finishing time | Not yet measurable | Per-project timing ledger incl. human review clock |
| 2 | First-candidate gate pass rate | Not yet measurable | Run-outcome ledger with first gate receipt + `gateRepairAttempts` |
| 3 | Escaped P0/P1 defects | Not yet measurable (0 releases) | Release ledger with "first observed after release X" |
| 4 | Manual code interventions | Not yet measurable (authorship indistinguishable) | Per-run intervention log or agent/human commit trailer |
| 5 | Visual-review score | Not yet measurable (9/9 rows unscored) | Completed judge-of-record sheet bound to candidate hash |
| 6 | Release success rate | Not yet measurable (0 attempts) | Deployment adapter with R1-6 receipts |
| 7 | Rollback success rate | Not yet measurable (0 attempts) | Release ledger plus recorded R1-8 recovery drills |
| 8 | Post-launch support load | Not yet measurable (0 launches) | Support intake record keyed by release id |

All eight Release 1 outcomes are **unmeasurable at HEAD**. Per Release 1
contract §8.1 and gate R1-9, no numeric target may be proposed for any of them
until its named instrument exists and produces a reproducible baseline.

## Post-integration addendum (wave-0 integration, 2026-09-02)

Everything above was measured on branch `wave-0/eos-003`, whose only change to
`main` at `4b02f75` is this file. The wave-0 integrator then merged that branch
with `wave-0/eos-001` and `wave-0/hygiene`, and wave 0 itself edited the ledger
this record counts. Three corrections follow. None changes a baseline: every
outcome above is still **Not yet measurable**, and no target is proposed.

### A. Outcome 3's S1 status split is reported wrong

§3 reads "S1 status split: 12 FIXED, 3 OPEN, 2 TRACKED, 2 CONFIRMED". The awk
quoted immediately below it does not emit that. It emits five keys, and one of
them is a compound the prose silently folded into `CONFIRMED`:

```
CONFIRMED 1 / CONFIRMED,nowgated 1 / FIXED 12 / OPEN 3 / TRACKED 2
```

`CONFIRMED,nowgated` is `ENG-010`'s own status string, not a `CONFIRMED` row.
Read the instrument's output as it is printed; the prose count of 2 CONFIRMED
is an unstated normalization.

### B. Wave 0 moved the ledger this record counts

Wave 0 flipped `REPO-002` and `REPO-003` from `OPEN` to `FIXED` (both `S3`) and
added `REPO-013` (`S1`, `OPEN`, the 2026-09-14 T01/T02 expiry cliff). On the
integration tree the same two commands print:

```
$ awk -F'|' '$2 ~ /^ [A-Z0-9]+-[0-9]+ $/ { s=$3; gsub(/[ *]/,"",s); if (s ~ /^S[123]$/) c[s]++ } END { for (k in c) print k, c[k] }' docs/ENGINE-LEDGER.md | sort
S1 20
S2 24
S3 10

$ awk -F'|' '$2 ~ /^ [A-Z0-9]+-[0-9]+ $/ { s=$3; st=$4; gsub(/[ *]/,"",s); gsub(/[ *]/,"",st); if (s=="S1") c[st]++ } END { for (k in c) print k, c[k] }' docs/ENGINE-LEDGER.md | sort
CONFIRMED 1
CONFIRMED,nowgated 1
FIXED 12
OPEN 4
TRACKED 2
```

So §3's adjacent measurable reads, on the integration tree: **54**
severity-bearing rows, **20** of them `S1`, split as printed above. Outcome 3
itself is unchanged — the denominator is still zero releases, so no escape rate
exists either way.

### C. Outcome 4's trailer grep is wider than its claim

§4 says 11 of 74 commits carry a `Co-authored-by: Claude ...` trailer, but the
quoted command, `git rev-list --count -i --grep='co-authored-by'`, counts any
co-author trailer. On `main` at `4b02f75` the two happen to agree — the narrow
grep returns the same number:

```
$ git rev-list --count -i --grep='^Co-authored-by: Claude' origin/main
11
```

The claim stands; the instrument written beside it did not prove it. Use the
narrow form. The conclusion §4 draws is unaffected, and is the important part:
the trailer is a lower bound on agent involvement, never a partition of the
history.
