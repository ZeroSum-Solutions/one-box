# EOS-001 authority chain — confirmed on main

Date: 2026-09-02
Base commit: `4b02f75ff8954ee09b1c58d4e16a600f6fe4ca41` (PR #19 merge, `main`)
Gap tracked: `docs/plans/one-box-master/00-authority/2026-08-29-engineering-operating-system-and-gap-register.md`,
EOS-001 ("one discoverable authority chain").

## What EOS-001 required

> the ONE BOX program owner reconciles `AGENTS.md`, `README.md`, the
> architecture index, and the master authority register; labels every draft,
> superseded document, audit, and implementation plan consistently; and adds
> a fail-closed, machine-checkable authority/link oracle to CI.
> (`2026-08-29-engineering-operating-system-and-gap-register.md:63`)

The named defects, as of 2026-08-29 (`...gap-register.md:61`): "The root
`AGENTS.md` and `README.md` still route contributors to the 2026-08-13 Refero
requirements and frozen template assumptions... The Canvas index also lists a
model audit as a canonical source, although audits are evidence, not
authority."

Lineage C (PR #19) delivered the reconciliation and the CI oracle. This
record checks every `AGENTS.md`/`README.md` pointer, cites each check as
`file:line`, and records the drift found while checking — two items: one
fixed in this task, one found and deliberately left unfixed, with reasons for
each (§3).

## 1. Root pointers reach the master authority register

- `AGENTS.md:25` — `Program authority manifest: docs/plans/one-box-master/00-authority/authority-manifest.json`
- `AGENTS.md:26` — `Human-readable plan register: docs/plans/one-box-master/00-authority/plan-register.md`
- `AGENTS.md:80` — `Follow docs/plans/one-box-master/00-authority/authority-manifest.json when documents conflict.`
- `README.md:14` — `` [`authority-manifest.json`](docs/plans/one-box-master/00-authority/authority-manifest.json) ``
  (reached via the master plan library front door at `README.md:12`,
  `` [`ONE BOX master plan library`](docs/plans/one-box-master/README.md) ``)

```text
$ grep -n "authority-manifest.json" AGENTS.md README.md
AGENTS.md:25:- Program authority manifest: `docs/plans/one-box-master/00-authority/authority-manifest.json`
AGENTS.md:80:- Follow `docs/plans/one-box-master/00-authority/authority-manifest.json` when documents conflict.
README.md:14:[`authority-manifest.json`](docs/plans/one-box-master/00-authority/authority-manifest.json).
```

**`README.md`'s route to `plan-register.md` is indirect — checked and confirmed
here, since the criterion names `plan-register.md` explicitly for both entry
points.** `README.md` carries no direct pointer to it:

```text
$ grep -n "plan-register" README.md
(no match, exit 1)
```

It reaches the register two hops from the same front door used for the
manifest above: `README.md:12` links to
`` [`ONE BOX master plan library`](docs/plans/one-box-master/README.md) ``,
and that file's own "Read in this order" list names the register second —
`docs/plans/one-box-master/README.md:8`.

```text
$ grep -n "plan-register" docs/plans/one-box-master/README.md
8:2. [Authority and plan register](00-authority/plan-register.md)
```

So the route is `README.md:12` → `docs/plans/one-box-master/README.md:8` →
`docs/plans/one-box-master/00-authority/plan-register.md`. This is a real
route to the register, but it is two hops, not one — a heavier path than
`AGENTS.md:26`'s direct pointer. It is recorded here as a fact about the
current chain, not corrected: the task rules bar restructuring these
documents, and a one-line pointer addition to `README.md` was not drift
found while checking (§2), it is a plausible improvement outside this task's
scope of confirming and fixing found drift.

**Correction from an earlier draft of this record:** the manifest pointer is
not first in `AGENTS.md`'s "Sources of truth" list. Two bullets precede it
(`AGENTS.md:16-24`):

- `AGENTS.md:18` — `**Open to-dos — read first:** docs/NEXT-SESSION.md`
- `AGENTS.md:20-24` — `**Active consolidation plan:** docs/plans/2026-08-20-studio-consolidation-extraction.md`

Both are checked against the register in §2 rather than assumed away. README.md
has no such precedent bullets — `README.md:14` is the first authority pointer
in that file.

## 2. Every AGENTS.md / README.md pointer checked against the register's labels

Register precedence table:
`docs/plans/one-box-master/00-authority/plan-register.md:13-30` (domain table,
header at :13, rows at :15-30) and `plan-register.md:34-43`
(supporting/historical table, header at :34, rows at :36-43). Machine source:
`docs/plans/one-box-master/00-authority/authority-manifest.json`
`domains.*.authorityClass`. Every citation below was re-read from the file at
the stated line as part of writing this record.

| Pointer | Target | Register label | Consistent? |
|---|---|---|---|
| `AGENTS.md:27` "Website source/candidate requirements" | `docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md` | `website-source` domain, `owner-approved` (`plan-register.md:15`); doc header itself says `Status: Approved by owner, 2026-08-22` (`docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md:3`) | Yes |
| `AGENTS.md:28` "Canvas interaction requirements" | `docs/specs/2026-08-16-canvas-upgrade.md` | `canvas` domain, `owner-approved` (`plan-register.md:16`); doc header `Status: approved by the owner, 2026-08-16` (`docs/specs/2026-08-16-canvas-upgrade.md:3`) | Yes |
| `AGENTS.md:29` "Website lifecycle direction" | `docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md` | `website-lifecycle` domain, `owner-approved-direction` (`plan-register.md:17`); doc header `Status: owner-approved design direction; written-spec review pending` (`docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md:3`) | Yes |
| `AGENTS.md:30` "Accepted Page IR implementation tickets" | `docs/tickets/page-ir-safe-pipeline/manifest.json` | Listed under `website-source.relatedPaths` in the manifest; ticket manifest `"status": "ready"` (`docs/tickets/page-ir-safe-pipeline/manifest.json:4`) | Yes |
| `AGENTS.md:31` "Program planning tickets" | `docs/tickets/one-box-program/manifest.json` | `program-tickets` domain, `proposed`, "Proposed/blocked planning tickets. None authorizes product implementation." (`plan-register.md:27`); manifest `"status": "planning", "implementationAuthorized": false` (`docs/tickets/one-box-program/manifest.json:4-5`) | Yes |
| `AGENTS.md:34` "Local API exposure boundary" | `docs/security/local-api-threat-model.md` | Not named in `plan-register.md` (verified: `grep -n "local API threat model\|loopback runtime" plan-register.md` returns no match). Registered as a `relatedPaths` entry of the `release-1` domain in the machine source (`authority-manifest.json:144`, `authorityClass: "proposed"`); the separate `program-security` domain's boundary text affirms it explicitly: "the local API threat model remains current for loopback runtime" (`authority-manifest.json:166`, **not** `plan-register.md` — an earlier draft of this record misattributed that quotation to `plan-register.md:22`, which is the unrelated Release 1 compatibility row). No register or manifest entry calls this document draft or superseded. | Yes (the register's human-readable table lists only domain primary docs, not every `relatedPaths` entry, so its silence here is not itself an inconsistency) |
| `AGENTS.md:32` "Runtime contracts and model routes" | `src/lib/contracts.ts` | Not a plan or register document — the live TypeScript schema source itself, not subject to draft/current/superseded labeling. No register or manifest entry names it or claims authority over it (verified: `grep -rn "contracts.ts" docs/plans/one-box-master/00-authority/plan-register.md docs/plans/one-box-master/00-authority/authority-manifest.json` returns no match); `AGENTS.md:39` itself treats it as the canonical schema: "Do not invent artifact fields outside `src/lib/contracts.ts`." | Yes (no competing or superseding claim exists to be inconsistent with) |
| `AGENTS.md:33` "Client-facing design contract" | `DESIGN.md` | Register affirms it directly: "`DESIGN.md` remains the design contract" (`plan-register.md:43`) | Yes |
| `AGENTS.md:35` "Module boundaries and ownership" | `docs/architecture/README.md` | Not a register domain row; listed as a `relatedPaths` entry of the `engineering-operating-system` domain (`authority-manifest.json:123`). Doc self-labels its own content current: "does not supersede this current topology until an accepted migration proves each extracted seam" (`docs/architecture/README.md:12-13`). Corroborated by the register's own `target-topology` row: "ADR 0001 remains the current executable topology until acceptance and migration" (`plan-register.md:23`) | Yes |
| `AGENTS.md:36` "Contribution workflow" | `CONTRIBUTING.md` | `relatedPaths` entry of `engineering-operating-system` (`authority-manifest.json:129`); `CONTRIBUTING.md:5-6` itself points to the authority manifest and distinguishes "approved execution from proposed or blocked planning work" | Yes |
| `AGENTS.md:37` "Project-specific bounded loops" | `docs/loops/README.md` | Not a register/manifest entry (verified: `grep -n "loops/README" docs/plans/one-box-master/00-authority/plan-register.md docs/plans/one-box-master/00-authority/authority-manifest.json` returns no match in either). Self-labels its own non-authorizing status: "not permission to run, schedule, push, merge, deploy, or spend" (`docs/loops/README.md:4-5`) | Yes |
| `README.md:16-17` PRD + ticket pointers | `docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md`, `docs/tickets/page-ir-safe-pipeline/README.md` | Same `website-source`/`owner-approved` domain as above | Yes |
| `README.md:65-66` "Project workflow" list | `CONTRIBUTING.md` | Same target and evidence as the `AGENTS.md:36` row above | Yes |
| `README.md:67-68` "Project workflow" list | `docs/architecture/README.md` | Same target and evidence as the `AGENTS.md:35` row above | Yes |
| `README.md:69-70` "Project workflow" list | `docs/adr/0001-modular-monolith.md` | `relatedPaths` entry of `engineering-operating-system` (`authority-manifest.json:122`); doc self-labels `Status: accepted baseline` (`docs/adr/0001-modular-monolith.md:3`); corroborated by the register's `target-topology` row, "ADR 0001 remains the current executable topology until acceptance and migration" (`plan-register.md:23`) | Yes |
| `README.md:71-72` ADR 0002 pointer | `docs/adr/0002-target-desktop-cloud-topology.md` | `target-topology` domain, `proposed` (`plan-register.md:23`); README states in the same line: "it does not supersede ADR 0001 until accepted" | Yes |
| `README.md:73-74` "Project workflow" list | `docs/governance/reviewer-roles.md` | `relatedPaths` entry of `engineering-operating-system` (`authority-manifest.json:124`), domain `authorityClass: "proposed"` (`authority-manifest.json:119`); doc self-labels `Status: proposed engineering-governance baseline` (`docs/governance/reviewer-roles.md:3`) — labels match | Yes |
| `README.md:75-77` "Project workflow" list | `docs/loops/README.md` | Same target and evidence as the `AGENTS.md:37` row above | Yes |
| `README.md:236` local API threat model | `docs/security/local-api-threat-model.md` | Same as the `AGENTS.md:34` row above | Yes |

This table now itemizes, by `file:line`, every pointer in both files'
dedicated authority lists: all 13 lines of `AGENTS.md:25-37` (the manifest
and register pointers at :25-26 in §1 above; the eleven document pointers at
:27-37 in this table) and every line of `README.md:11-18` (the front-door
and manifest links at :12/:14 in §1 above, the PRD/ticket pair at :16-17
here) and `README.md:65-77` (all six `CONTRIBUTING.md`/architecture/ADR
0001/ADR 0002/reviewer-roles/loops bullets, :65-66 through :75-77, each a
separate row above), plus the one pointer outside those two blocks
(`README.md:236`). No pointer in either list routes to a document the
register or manifest calls superseded, rejected, historical, or draft
without saying so in the pointing sentence itself.

### The two pointers that precede the manifest link in AGENTS.md

`AGENTS.md:18` (`docs/NEXT-SESSION.md`) and `AGENTS.md:20-24`
(`docs/plans/2026-08-20-studio-consolidation-extraction.md`) are not domain
rows in the register — verified:

```text
$ grep -rn "NEXT-SESSION" docs/plans/one-box-master/00-authority/
(no match)
$ grep -rn "2026-08-20-studio-consolidation" docs/plans/one-box-master/00-authority/
(no match)
```

That is not itself drift: neither document claims domain authority over any
of the register's 17 domains, and each labels its own non-authority status in
its own text — `docs/NEXT-SESSION.md:15` ("This file... is a queue and a
map, not a source of truth") and
`docs/plans/2026-08-20-studio-consolidation-extraction.md:3` ("Status:
**ACTIVE — read before starting work.**", a process-status marker, not a
claim to own any of the register's domains). Checking `docs/NEXT-SESSION.md`
line by line for this record did surface one genuine drift, fixed in this
task — see §3.

## 3. Drift found while checking, and disposition

Two items, both found while doing the pointer-by-pointer check in §2 —
neither is one of the two defects the gap register named in 2026-08-29 (those
are handled separately below).

1. **`docs/NEXT-SESSION.md:11-13` — fixed.** Its "Authority order" list said
   `plan-register.md` "lives on `research/la-appointment-field-study` and its
   descendants, not yet on `main`." That was false at this task's base commit:
   `plan-register.md` has been on `main` since PR #19 (`4b02f75`), which is
   the very fact this record confirms. Left as written, the document that
   `AGENTS.md:18` tells contributors to read "first" would have contradicted
   the authority chain it sits above. Fixed by removing the stale branch
   claim; no other line in that document was touched.
2. **`docs/plans/one-box-master/02-canvas/index.md:6` — found, not fixed.**
   It lists `2026-08-13-refero-editor-requirements.md` under its own
   `## Canonical sources` heading, while `plan-register.md:36` files that same
   document under `## Supporting and historical plans` with "Retain
   unsuperseded editor, evidence, motion, accessibility, and benchmark
   requirements. Ignore older multi-target production assumptions." That is a
   live label inconsistency, one hop from `README.md:12` via
   `docs/plans/one-box-master/README.md:12`, and it involves the exact
   2026-08-13 document the EOS-001 gap-register entry named as its defect
   ("What EOS-001 required" above). It is not fixed here: `index.md` sits under
   `docs/plans/one-box-master`, a hash-pinned authority-packet input per this
   task's operating rules, and editing it changes
   `authority-manifest.json`'s pinned `packetDigest` — confirmed by trial edit
   and revert in this task, `GITHUB_ACTIONS=true node
   scripts/verify-plan-authority.mjs` moved from "passed" to `FAIL authority
   manifest: packetDigest mismatch` and back on revert. Repinning the packet
   is out of this task's scope (the task's own rules reserve that for the
   integrator). Flagged here as a follow-up: move or re-label the
   `2026-08-13-refero-editor-requirements.md` line in `index.md` to match
   `plan-register.md:36`, then re-pin `packetDigest`.

## 4. The EOS-001 defects named in the gap register are resolved on main

1. *"The root `AGENTS.md` and `README.md` still route contributors to the
   2026-08-13 Refero requirements and frozen template assumptions."*
   Checked: `grep -n "2026-08-13-refero" AGENTS.md README.md` returns no
   match on `main` at `4b02f75`. Neither root file names that document or a
   frozen-template assumption; both instead point to the 2026-08-22 Page IR
   PRD (`AGENTS.md:27`, `README.md:16`).
2. *"The Canvas index also lists a model audit as a canonical source,
   although audits are evidence, not authority."*
   Checked: `docs/plans/one-box-master/02-canvas/index.md:3-8` lists only
   specs under "Canonical sources"; the Grok audit sits under a separate
   "Supporting review evidence" heading with an explicit caveat —
   `docs/plans/one-box-master/02-canvas/index.md:10-12`: "adversarial review
   evidence, not product authority."

Both gap-register-named defects are fixed on `main` by PR #19. Item 2 above
is a narrower claim than §3.2: the audit is correctly demoted, but a separate,
unrelated document (`2026-08-13-refero-editor-requirements.md`) is still
mislabeled in the same file — see §3.2 for that finding's disposition.

## 5. CI runs the authority oracle fail-closed, before dependency install

`.github/workflows/ci.yml`:

```text
 3 │ on:
 4 │   pull_request:
 5 │     branches: [main]
 6 │   push:
 7 │     branches: [main]
...
30 │       - name: Verify plan authority and traceability
31 │         run: npm run verify:plans && npm run test:plans
32 │
33 │       - name: Install dependencies
34 │         run: npm ci
```

The verify step (`ci.yml:30-31`) runs before `npm ci` (`ci.yml:33-34`), on
every pull request to `main` (`ci.yml:3-5`), and is a single `&&`-chained
shell command, so a non-zero exit from either `verify:plans` or `test:plans`
fails the job before any dependency is installed or any later step runs
(fail-closed).

## 6. Verification run in this task

All commands run from the worktree root
`/Users/zero-suminc./projects/one-box-worktrees/wave-0-eos-001`, on branch
`wave-0/eos-001`, which differs from `main` at `4b02f75` only by
documentation: this evidence record, and the `docs/NEXT-SESSION.md` fix in
§3.1. `docs/plans/one-box-master/02-canvas/index.md` was trial-edited to
confirm the packetDigest-mismatch claim in §3.2, then reverted before these
runs — the tree at these commands matches `main` for every packet input.

```text
$ GITHUB_ACTIONS=true npm run verify:plans
> node scripts/verify-plan-authority.mjs
NOTE untracked baseline read skipped under GITHUB_ACTIONS; exact record binding still enforced
Plan authority verification passed: 17 domains, 29 tickets, 21 program evaluations.
Authority packet SHA-256: 6abc215646fd239feb001fc3d94e8f3cf9ca39bdf7ab756763639178487e66ab
exit 0
```

This SHA-256 matches the pinned `packetDigest` recorded in
`docs/plans/one-box-master/00-authority/authority-manifest.json`, i.e. it is
unchanged from `main` at `4b02f75` — confirming no packet input differs from
`main` in the final state of this branch.

```text
$ GITHUB_ACTIONS=true npm run test:plans
> node --test scripts/verify-plan-authority.node.mjs
...
# tests 88
# suites 0
# pass 88
# fail 0
# cancelled 0
# skipped 0
# todo 0
exit 0
```

```text
$ grep -n "authority-manifest.json" AGENTS.md README.md
AGENTS.md:25:- Program authority manifest: `docs/plans/one-box-master/00-authority/authority-manifest.json`
AGENTS.md:80:- Follow `docs/plans/one-box-master/00-authority/authority-manifest.json` when documents conflict.
README.md:14:[`authority-manifest.json`](docs/plans/one-box-master/00-authority/authority-manifest.json).
exit 0
```

## Conclusion

EOS-001 is closed on `main` for the two defects the gap register named in
2026-08-29 (§4). `AGENTS.md` and `README.md` route contributors to the master
authority register — `AGENTS.md:26` directly, `README.md` two hops via
`README.md:12` → `docs/plans/one-box-master/README.md:8` (§1) — and to the
machine-checkable manifest, both files directly (§1). Every pointer in each
file's dedicated authority list carries a label consistent with the register
(§2, itemized by `file:line` for all thirteen `AGENTS.md:25-37` lines and all
of `README.md:11-18` and `:65-77`), including the two pointers that sit above
the manifest link, which disclaim authority status themselves and so do not
conflict with it. The CI `verify` job runs `npm run
verify:plans && npm run test:plans` fail-closed ahead of `npm ci` on every
pull request to `main` (§5). Two additional drift items were found while
checking, outside the two the gap register named: one fixed in this task
(`docs/NEXT-SESSION.md`), one found and left for a follow-up because fixing
it requires re-pinning the hash-pinned authority packet, which is out of this
task's authority (`docs/plans/one-box-master/02-canvas/index.md`, §3.2).

## 7. Post-integration addendum (wave-0 integration, 2026-09-02)

Sections 1 to 6 and the Conclusion were written on branch `wave-0/eos-001` and
describe that branch. The wave-0 integrator then merged this task with
`wave-0/eos-003` and `wave-0/hygiene` into `wave-0/integration` and did the
follow-up §3.2 reserved for it. Where the two disagree, **this addendum wins**;
it supersedes the affected claims rather than rewriting the record they were
recorded in.

### 7.1 §3.2 is fixed, not open

The label residue is closed. `docs/plans/one-box-master/02-canvas/index.md` no
longer lists `2026-08-13-refero-editor-requirements.md` under
`## Canonical sources`. The entry now sits alone under a new
`## Supporting and historical` heading (`index.md:9`), at `index.md:11`,
carrying the register's own wording verbatim: "Retain unsuperseded editor,
evidence, motion, accessibility, and benchmark requirements. Ignore older
multi-target production assumptions." (`plan-register.md:36`). Nothing else in
that file changed. §3.2's closing sentence — "Flagged here as a follow-up" — and
the Conclusion's "one found and left for a follow-up" no longer describe the
tree.

### 7.2 The packet was re-pinned; §6's digest claim is superseded

§6 states that this branch "differs from `main` at `4b02f75` only by
documentation" and that packet SHA-256
`6abc215646fd239feb001fc3d94e8f3cf9ca39bdf7ab756763639178487e66ab` is
"unchanged from `main`". That was true of `wave-0/eos-001`. It is not true of
`wave-0/integration`, which carries the §3.2 fix and PR #17's deferred
`docs/architecture/README.md` paragraph — both packet inputs. The packet digest
moved to
`48999a437bc127f7c4e27066a0c2ab344c91c09f0940f43d114f09c204faef36`, recorded in
`authority-manifest.json` and endorsed in
`docs/audits/evidence/security/2026-09-02-wave-0-authority-repin.json`, which
supersedes the 2026-09-02 ci-oracle re-pin. `GITHUB_ACTIONS=true npm run
verify:plans` passes on the integration tree with that digest, and
`node scripts/verify-p180-t02-authorization.mjs` exits 0.

### 7.3 Line citations that moved

W0.6 rewrote `docs/NEXT-SESSION.md` in the same integration, so two citations in
this record point at their base-commit lines, not at the integrated file:

| Cited as | Claim | Where it is now |
|---|---|---|
| `docs/NEXT-SESSION.md:15` (§2) | "This file. It is a queue and a map, not a source of truth." | `docs/NEXT-SESSION.md:16` |
| `docs/NEXT-SESSION.md:11-13` (§3.1) | The "Authority order" entry for `plan-register.md` | `docs/NEXT-SESSION.md:12-13` |

The §3.1 fix itself stands: the stale "not yet on `main`" claim is gone. §3.1's
"no other line in that document was touched" describes the `wave-0/eos-001`
commit only; W0.6 later rewrote the board deliberately.

Two citations in §4.2 also moved with the §3.2 fix, because the file gained a
heading: the `## Canonical sources` list is now `index.md:3-7`, and the Grok
audit under `## Supporting review evidence` with its "adversarial review
evidence, not product authority" caveat is now `index.md:13-15`. The claim is
unchanged — the audit is still correctly demoted.
