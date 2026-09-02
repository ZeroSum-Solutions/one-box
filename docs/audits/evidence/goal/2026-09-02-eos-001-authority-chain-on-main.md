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

Lineage C (PR #19) delivered that reconciliation and the CI oracle. This
record confirms the result is present and correct on `main`, cites every
pointer checked as `file:line`, and records the one drift found while
checking (already fixed on `main` by PR #19 — no further edit needed here).

## 1. Root pointers reach the master authority register

- `AGENTS.md:25` — `Program authority manifest: docs/plans/one-box-master/00-authority/authority-manifest.json`
- `AGENTS.md:26` — `Human-readable plan register: docs/plans/one-box-master/00-authority/plan-register.md`
- `AGENTS.md:80` — `Follow docs/plans/one-box-master/00-authority/authority-manifest.json when documents conflict.`
- `README.md:14` — `` [`authority-manifest.json`](docs/plans/one-box-master/00-authority/authority-manifest.json) ``
  (reached via the master plan library front door at `README.md:12`,
  `` [`ONE BOX master plan library`](docs/plans/one-box-master/README.md) ``)

Both entry-point documents route a contributor to the manifest and the
register before anything else in their "sources of truth" sections.

```text
$ grep -n "authority-manifest.json" AGENTS.md README.md
AGENTS.md:25:- Program authority manifest: `docs/plans/one-box-master/00-authority/authority-manifest.json`
AGENTS.md:80:- Follow `docs/plans/one-box-master/00-authority/authority-manifest.json` when documents conflict.
README.md:14:[`authority-manifest.json`](docs/plans/one-box-master/00-authority/authority-manifest.json).
```

## 2. Every AGENTS.md / README.md pointer checked against the register's labels

Register precedence table:
`docs/plans/one-box-master/00-authority/plan-register.md:9-30` (domain table)
and `plan-register.md:33-40` (supporting/historical table). Machine source:
`docs/plans/one-box-master/00-authority/authority-manifest.json` `domains.*.authorityClass`.

| Pointer | Target | Register label | Consistent? |
|---|---|---|---|
| `AGENTS.md:27` "Website source/candidate requirements" | `docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md` | `website-source` domain, `owner-approved` (`plan-register.md:11`); doc header itself says `Status: Approved by owner, 2026-08-22` (`docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md:3`) | Yes |
| `AGENTS.md:28` "Canvas interaction requirements" | `docs/specs/2026-08-16-canvas-upgrade.md` | `canvas` domain, `owner-approved` (`plan-register.md:12`); doc header `Status: approved by the owner, 2026-08-16` (`docs/specs/2026-08-16-canvas-upgrade.md:3`) | Yes |
| `AGENTS.md:29` "Website lifecycle direction" | `docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md` | `website-lifecycle` domain, `owner-approved-direction` (`plan-register.md:13`); doc header `Status: owner-approved design direction; written-spec review pending` (`docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md:3`) | Yes |
| `AGENTS.md:30` "Accepted Page IR implementation tickets" | `docs/tickets/page-ir-safe-pipeline/manifest.json` | Listed under `website-source.relatedPaths`; manifest `"status": "ready"` (`docs/tickets/page-ir-safe-pipeline/manifest.json:4`) | Yes |
| `AGENTS.md:31` "Program planning tickets" | `docs/tickets/one-box-program/manifest.json` | `program-tickets` domain, `proposed`, "Proposed/blocked planning tickets. None authorizes product implementation." (`plan-register.md:26`); manifest `"status": "planning", "implementationAuthorized": false` (`docs/tickets/one-box-program/manifest.json:4-5`) | Yes |
| `AGENTS.md:34` "Local API exposure boundary" | `docs/security/local-api-threat-model.md` | Named explicitly in the `program-security` row: "the local API threat model remains current for loopback runtime" (`plan-register.md:22`) | Yes |
| `AGENTS.md:35` "Module boundaries and ownership" | `docs/architecture/README.md` | Not a register domain row; doc self-labels its own content current: "does not supersede this current topology until an accepted migration proves each extracted seam" (`docs/architecture/README.md:12`) | Yes |
| `AGENTS.md:36` "Contribution workflow" | `CONTRIBUTING.md` | `CONTRIBUTING.md:5-6` itself points to the authority manifest and distinguishes "approved execution from proposed or blocked planning work" | Yes |
| `README.md:16-17` PRD + ticket pointers | `docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md`, `docs/tickets/page-ir-safe-pipeline/README.md` | Same `website-source`/`owner-approved` domain as above | Yes |
| `README.md:71-72` ADR 0002 pointer | `docs/adr/0002-target-desktop-cloud-topology.md` | `target-topology` domain, `proposed` (`plan-register.md:19`); README states in the same line: "it does not supersede ADR 0001 until accepted" | Yes |
| `README.md:236` local API threat model | `docs/security/local-api-threat-model.md` | Same as above | Yes |

No pointer in either file routes to a document the register calls
superseded, rejected, historical, or draft without saying so in the
pointing sentence.

## 3. The EOS-001 defects named in the gap register are resolved on main

The gap register text (`2026-08-29-engineering-operating-system-and-gap-register.md:61`)
named two concrete defects as of 2026-08-29:

1. *"The root `AGENTS.md` and `README.md` still route contributors to the
   2026-08-13 Refero requirements and frozen template assumptions."*
   Checked: `grep -n "2026-08-13-refero" AGENTS.md README.md` returns no
   match on `main` at `4b02f75`. Neither root file names that document or a
   frozen-template assumption; both instead point to the 2026-08-22 Page IR
   PRD (`AGENTS.md:27`, `README.md:16`).
2. *"The Canvas index also lists a model audit as a canonical source,
   although audits are evidence, not authority."*
   Checked: `docs/plans/one-box-master/02-canvas/index.md:3-8` lists only
   specs under "Canonical sources"; the Grok audit now sits under a separate
   "Supporting review evidence" heading with an explicit caveat —
   `docs/plans/one-box-master/02-canvas/index.md:10-12`:
   "adversarial review evidence, not product authority."

Both defects are fixed on `main`. No further edit was needed for this task.

## 4. CI runs the authority oracle fail-closed, before dependency install

`.github/workflows/ci.yml`:

```text
30 │       - name: Verify plan authority and traceability
31 │         run: npm run verify:plans && npm run test:plans
32 │
33 │       - name: Install dependencies
34 │         run: npm ci
```

The verify step (lines 30-31) runs before `npm ci` (lines 33-34), on every
pull request to `main` (`.github/workflows/ci.yml:3-7`,
`on.pull_request.branches: [main]`), and is a single `&&`-chained shell
command, so a non-zero exit from either `verify:plans` or `test:plans` fails
the job before any dependency is installed or later step runs (fail-closed).

## 5. Verification run in this task, on main at `4b02f75`

All commands run from the worktree root
`/Users/zero-suminc./projects/one-box-worktrees/wave-0-eos-001`.

```text
$ GITHUB_ACTIONS=true npm run verify:plans
> node scripts/verify-plan-authority.mjs
NOTE untracked baseline read skipped under GITHUB_ACTIONS; exact record binding still enforced
Plan authority verification passed: 17 domains, 29 tickets, 21 program evaluations.
Authority packet SHA-256: 6abc215646fd239feb001fc3d94e8f3cf9ca39bdf7ab756763639178487e66ab
exit 0
```

This SHA-256 matches the pinned `packetDigest` recorded in
`docs/plans/one-box-master/00-authority/authority-manifest.json`.

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
```

## Conclusion

EOS-001 is closed on `main`. `AGENTS.md` and `README.md` route contributors
to the master authority register; every pointer checked in section 2 carries
a label consistent with the register; the CI `verify` job runs
`npm run verify:plans && npm run test:plans` fail-closed ahead of `npm ci`
on every pull request to `main`; and no drift remained to fix at this
commit.
