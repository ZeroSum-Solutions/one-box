# Page IR and safe candidate pipeline — document verification

- **Date:** 2026-08-22
- **Source checkpoint:** `6561b19b0d613e8fe891fe700760e414153cb1b4`
- **Scope:** PRD, eval contract, traceability, and repo-native ticket backlog
- **Implementation code changed:** No
- **Final document verdict:** PASS

## Mechanical validation

The local integrity check parsed both JSON manifests and verified:

- 52 unique PRD requirements.
- 44 unique evaluations.
- 22 ticket files.
- 44 evaluation owners, one per evaluation.
- No missing ticket files, duplicate IDs, dangling requirement/eval/ticket references,
  dependency drift, owner-order violations, dependency cycles, or untraced requirement.
- `git diff --check` clean.

These checks prove document structure and traceability, not implementation completion.

## Opus 5 review

The initial documents-only Opus 5 audit returned FAIL with five blocking findings:

1. Runtime fallback contradicted immutable per-run layout authority.
2. The shadow rollout stage had no requirement, eval, or ticket.
3. Page IR versus compiled-site authority after editing was undefined.
4. Ticket closure rules could deadlock early dependency tickets on later end-to-end
   evals.
5. Composer, retention, accessibility, and performance bounds were not frozen.

Corrections:

- Template fallback now creates a separate linked `template-v1` run.
- The ownerless shadow stage was removed.
- `page-ir-v1` edits mutate validated persisted IR and re-enter compile/candidate/gate/
  promotion; direct compiled-file edits fail.
- Every eval has one dependency-valid owner; early tickets verify their own acceptance
  without waiting on later owned end-to-end evals.
- Numeric and ruleset thresholds are explicit in the eval contract.

The final four-file Opus 5 gate returned:

> **PASS — zero blocking findings across the four documents.**

It separately confirmed the fallback, edit authority, closure, threshold, canonical
gate-report transaction, and owner-dependency corrections.

## Grok 4.6 review

The first large Grok response became repetitive and did not produce a usable verdict;
it was excluded rather than treated as approval. A smaller bounded rerun against the
documents and current source evidence returned FAIL with two blocking findings:

1. Failed rebuild evidence preserved site bytes but did not prove the live gate report
   remained unchanged.
2. Promotion did not specify how the gated candidate report becomes the canonical live
   report in the same transaction as the site.

Corrections:

- Candidate gates write candidate-scoped reports and cannot overwrite the canonical
  live report.
- A failed rebuild preserves live site and live gate-report path, bytes, and hashes.
- Promotion atomically replaces one self-contained bundle containing the site and its
  canonical gate report; failure restores both byte-for-byte.
- Any run-root compatibility copy is derived and non-authoritative.
- Related dependency, legacy-resume, edit/re-derivation, and eval-owner wording was
  aligned.

The final bounded Grok 4.6 gate returned:

> **PASS — Remaining blocking findings: none.**

## Decisions preserved

- Website is the only Phase 1 production target.
- No candidate bytes or candidate gate report become live before blocking gates pass.
- Repair is candidate-only and cannot alter approved evidence, live output, or gates.
- One immutable layout authority exists per run.
- Page IR is data, not executable source, and is the edit authority for Page IR runs.
- Human visual approval remains required for release/export/client handoff.
- Models provide advisory review only and cannot approve, publish, or waive failures.
- Code created during implementation will be sent to Grok 4.6 only for model review.

## Deliberate remaining gates

- The PRD is owner-approved for implementation.
- Eval contract `1.0.0` is frozen and hash-locked.
- Tickets are `ready`; no GitHub Issues have been created.
- No implementation eval has been run and no production-readiness claim is made.
