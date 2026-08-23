# OBX-010 implementation report

## Outcome

OBX-010 is verified. Candidate state, deterministic inventory, mutable
provenance, closed paths, read-only inspection, and diagnostic cleanup now have
one additive contract. The legacy `SiteManifestSchema`, `RunStateSchema` stage
states, builder, gate runner, promotion path, and site authority are unchanged.

One validated run ID maps to one fixed candidate layout:

```text
sites/<id>/candidate/
  site/
  manifest.json
  provenance.json
  gates.json
```

The manifest contains only schema version, `index.html`, sorted regular-file
records, aggregate bytes, and deterministic build hash. Runtime identifiers,
lifecycle timestamps, input hashes, authority/compiler bindings, Page IR hash,
manifest/build hash, candidate gate hash, and promoted build hash stay in strict
provenance.

## Files changed

- Candidate schemas and lifecycle rules: `src/lib/contracts.ts` and
  `src/lib/contracts.test.ts`.
- Closed paths, inventory/hash validation, transition helper, read-only
  inspection, and cleanup: `src/lib/runstate.ts`, `src/lib/candidate.ts`, and
  `src/lib/candidate.test.ts`.
- Candidate non-serving regression:
  `src/app/api/sites/[id]/[...path]/route.test.ts`.
- Canonical architecture and delivery state: `docs/architecture/README.md`,
  the OBX-010 ticket, and the SDD progress ledger.
- Security evidence: the `OBX-010-security` directory beside this report.

## RED evidence

The initial focused command was:

```text
npm test -- src/lib/contracts.test.ts src/lib/candidate.test.ts src/app/api/sites/[id]/[...path]/route.test.ts
```

Exit `1`. Candidate tests could not load the intentionally absent
`src/lib/candidate.ts`; contract tests reported 17 intended failures because
the new schemas and transition matrix did not exist. The existing route suite
passed 21 tests, including the newly pinned non-serving behavior.

A later malformed-input regression ran with:

```text
npm test -- src/lib/contracts.test.ts
```

Exit `1`: an empty lifecycle history caused `safeParse` to throw while the
schema refinement accessed the absent first event. The refinement now returns
the schema's ordinary failed parse for that malformed shape. The command reran
with exit `0`; all 27 contract tests passed.

## GREEN evidence

- Final focused command: exit `0`; 3 files and 61 tests passed.
- Focused candidate inventory suite: exit `0`; 23 tests passed, including FIFO
  and Unix-socket objects plus the sparse 100 MiB boundary.
- Full `npm test`: exit `0`; 64 files passed, 2 skipped; 580 tests passed,
  2 skipped.
- `npm run typecheck`: exit `0`; Next route types generated and `tsc --noEmit`
  completed.
- `npm run lint`: exit `0`; 0 errors and 6 pre-existing warnings.
- Range-based `gitleaks`: exit `0`; 1 commit and approximately 53.66 KB
  scanned, with no leaks found.
- Security report validation: exit `0`; verdict `PASS` with no findings.
- Project documentation verifier: exit `0`; status `ok`, exact Git manifest
  matched, canonical architecture review passed, and no path, Markdown, shell,
  or secret-marker errors were reported.

## Acceptance mapping

- `CandidateStateSchema` closes the six states and
  `CANDIDATE_STATE_TRANSITIONS` closes every legal edge. Provenance parsing
  requires creation into `preparing`, contiguous legal history, last-state
  equality, and nondecreasing timestamps. `promoted` and `abandoned` are
  terminal.
- `CandidateManifestV1Schema` is strict and timestamp/ID/event-free. It requires
  literal schema version 1 and entry `index.html`, sorted unique safe paths,
  exact total bytes, per-file SHA-256, and a deterministic build SHA-256.
- `CandidateProvenanceV1Schema` is strict at the envelope and nested event/input
  records. Page IR authority requires a Page IR hash. Ready, promotable, and
  promoted states require progressively complete manifest/build, gate, and
  promoted-build bindings; promoted build must equal candidate build.
- `candidatePaths(runId)` validates before joining and returns a frozen closed
  object for `site`, manifest, provenance, and candidate gates. It accepts no
  suffix, so one fixed root structurally permits at most one candidate per run.
- Inventory walks recursively with `lstat` and no-follow file handles. It
  rejects traversal, POSIX/Windows absolute paths, backslashes, NUL, dot
  segments, duplicates, links, hardlink aliases, directories named as files,
  FIFO/socket objects, missing/unexpected files, and size/hash/build mismatch.
- The byte limit is inclusive at exactly `100 * 1024 * 1024`; a sparse
  `index.html` at that size passes and one byte over fails before publication.
  Creation order and mtime do not affect file order, build hash, or canonical
  manifest hash.
- `inspectCandidate()` is read-only and validates cross-file bindings for later
  OBX-015 recovery work. It does not resume, abandon, lock, compile, gate,
  repair, promote, or write.
- Cleanup reads validated regular-file provenance and uses the last lifecycle
  transition time, never mtime. Failed/abandoned diagnostics exactly 24 hours
  old remain; one millisecond older or over 100 MiB is removed. Active states,
  malformed provenance, and symlinked provenance are retained/fail closed.
  Tests preserve live site, run-root gates, uploads, research, and evidence
  bytes while removing only the exact validated candidate root.
- The public route regression proves both a candidate-shaped URL and a symlink
  from the served site cannot expose candidate bytes. No candidate path was
  added to a served allowlist.

## Eval ownership

- OBX-010 owns `EVAL-CAND-005`; its transition, inventory, byte, one-root, and
  retention contract is covered by the focused suite.
- `EVAL-CAND-001`, `EVAL-OPS-001`, and `EVAL-SEC-002` remain contribution
  obligations owned by later tickets. This ticket pins the unserved root,
  provenance bindings, and unsafe-object rejection without claiming later
  compile/gate/promotion behavior.

## Assumptions

- Diagnostic cleanup applies only to `failed` and `abandoned`; anomalous active
  candidates remain available for later recovery rather than being deleted.
- Monotonic lifecycle timestamps may be equal. They may never move backward.
- Hardlinked regular files are rejected even when both links are inside the
  candidate; this prevents an alias outside the root from weakening inventory
  identity.

## Risks

- No ticket yet writes these files in the production pipeline. Later candidate
  builder/gate/promotion tickets must use the schemas and fixed paths rather
  than recreate them.
- The 100 MiB diagnostic cap includes metadata as well as site bytes, so a
  terminal diagnostic whose site alone is exactly 100 MiB is intentionally
  oversized once provenance is included.
- Cleanup uses no competing lock. OBX-015 must coordinate its recovery actions
  through the existing site authority where live publication is involved.
