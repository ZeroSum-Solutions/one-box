# OBX-002 implementation report

## Outcome

OBX-002 is verified. Persisted `web-app` and `ios-app` intake remains parseable
and keeps its recorded target. A historical intake with no `projectTarget` uses
the existing Website default. The classifier only reads intake and never saves
or backfills it.

Legacy records now expose this stable notice:

```text
Legacy/experimental and read-only in Phase 1; preview/export available; start a new Website project for generation/edit.
```

Valid historical site artifacts remain available through preview. Evidence GET
and export include the persisted target and compatibility metadata. The preview
workbench stays in view mode, and the evidence workspace removes mutation and
resume controls for legacy targets.

Asset GET no longer calls image synchronization for a legacy target. It reads
the existing catalog without taking a site lock, scanning site images,
reconciling the generation ledger, or invalidating visual approval. An absent
catalog returns an empty read-only library.

## Files changed

- Compatibility policy: `src/lib/productionTarget.ts`.
- Pure legacy asset read: `src/lib/imageLibrary.ts` and
  `src/app/api/assets/[id]/route.ts`.
- Read and export metadata: `src/app/api/evidence/[id]/route.ts` and
  `src/app/api/evidence/[id]/export/route.ts`.
- Visible read-only UX: `src/app/preview/[id]/page.tsx`,
  `src/app/evidence/[id]/page.tsx`, and
  `src/components/EvidenceWorkspace.tsx`.
- Focused coverage: `src/app/api/legacyCompatibility.test.ts`,
  `src/app/api/assets/[id]/route.test.ts`, and
  `src/components/EvidenceWorkspace.test.tsx`.
- Canonical delivery state: `docs/architecture/README.md`, this ticket, and the
  SDD progress ledger.
- Security evidence: the `OBX-002-security` review directory beside this
  report.

## RED evidence

Command:

```text
npm test -- src/app/api/legacyCompatibility.test.ts src/components/EvidenceWorkspace.test.tsx src/app/api/assets/[id]/route.test.ts
```

Exit `1`. Vitest ran 3 files and reported 4 intended failures with 20 passes.
The `web-app` and `ios-app` cases showed asset GET backfilling the catalog from
site images and returning no compatibility metadata. The missing-target case
returned no Website compatibility metadata. The evidence workspace rendered a
Resume generation action and no legacy/read-only notice. The existing asset
generation and regeneration guards passed during this RED run.

## GREEN evidence

The RED command reran with exit `0`: 3 files passed and 24 tests passed.

The legacy integration test serves the existing site, reads evidence, exports
evidence, and views the asset library for both historical targets. It compares
the complete run tree before and after, including file bytes and mtimes for
`intake.json`, `run.json`, gates, the image catalog and ledger, evidence and
approval aliases, versioned evidence, the site manifest, HTML, and image bytes.
The tree remains identical.

Full verification:

- `npm test`: exit `0`; 63 files passed, 2 skipped; 535 tests passed, 2 skipped.
- `npm run typecheck`: exit `0`; Next route types generated and `tsc --noEmit`
  completed.
- `npm run lint`: exit `0`; 0 errors and 6 pre-existing warnings.
- `git diff --check`: exit `0`.
- Range-based `gitleaks`: exit `0`; 1 commit and approximately 11.07 KB
  scanned, with no leaks found.
- Fix Round 1 security report validation: exit `0`; verdict `PASS` with no
  findings.
- Range-based `gitleaks`: exit `0`; 1 commit and 24.70 KB scanned, with no
  leaks found.
- Security report validation: exit `0`; verdict `PASS` with no findings.

## Acceptance mapping

- `IntakeSchema` and `ProjectTargetSchema` remain broad. The compatibility
  classifier returns explicit `web-app` and `ios-app` values unchanged and
  applies the existing Website default only when the field is absent.
- The site route still serves a valid historical manifest and HTML. Evidence
  export remains downloadable and adds `projectTarget` plus compatibility
  metadata without changing persisted state.
- Preview and evidence surfaces show `legacy/experimental` with the stable
  Phase 1 read-only message. Preview forces view mode and does not mount the
  workbench. Evidence retains read and export links but hides resume, approval,
  revision, regeneration, and reference-selection actions.
- OBX-001 still blocks start, resume, continue, retry, rebuild, repair, edit,
  reference, evidence, element, token, motion, and asset placement before
  downstream work. OBX-002 adds generation and regeneration checks before
  image claims, reservation, staging, or provider work.
- No authority-migration endpoint exists in the current application. This
  ticket adds no migration or Page IR implementation and does not add a target
  field to `RunState`.
- Asset GET classifies the persisted target before choosing a read path.
  Legacy targets use the pure catalog reader and never call the synchronizing
  `listProjectImages()` path.

## Assumptions

- `intake.json` remains the target authority. A missing intake artifact keeps
  the existing route behavior and is not assigned a target by this ticket.
- An empty library is the truthful read-only representation when a legacy run
  has site images but no durable image catalog. Backfilling those images would
  violate the no-write requirement.
- The shared OBX-001 `409` contract remains the active-operation response.

## Risks

- Legacy preview preserves historical bytes but does not claim that old wrapper
  output is correct.
- No Page IR, layout-authority, or candidate migration exists here. Later
  tickets must call the same production-target guard before exposing a new
  active boundary.
- The full suite covers the compatibility metadata, read invariance, evidence
  label, and mutation guards. This ticket does not add a browser screenshot of
  the preview notice.

## Fix Round 1 — fail closed on unknown preview compatibility

Grok 4.6 identified a preview-only fail-open in the original delivery. The
client treated a completed HTTP request as a confirmed target policy: an HTTP
200 response with absent or malformed compatibility data set the old
`compatibilityLoaded` flag while leaving compatibility null, which enabled the
workbench. Non-OK and failed requests stayed noninteractive but showed no
reason.

The preview now resolves untrusted evidence JSON into explicit loading, active,
legacy, or error states. Runtime validation accepts only the complete Website
or legacy compatibility shapes. Editing is available only in the confirmed
Website state. Legacy remains view-only with the stable Phase 1 notice; missing
or malformed 200 payloads, non-OK responses, and fetch failures remain
view-only with an actionable compatibility-check notice. The iframe depends on
preview restoration rather than compatibility success, so the load-only view
remains available on error.

### Fix Round 1 RED/GREEN evidence

Command:

```text
npm test -- src/components/preview/previewState.test.ts
```

RED exit `1`: 1 file ran; 4 intended tests failed and 21 existing tests passed.
Each failure reported that the expected compatibility resolver was undefined.
The four cases were valid Website, valid legacy, missing/malformed HTTP 200,
and non-OK/fetch failure.

GREEN exit `0`: 1 file passed; all 25 tests passed. The cases prove that only a
valid Website response is interactive, legacy is view-only with its notice,
and unknown or failed checks are view-only with the compatibility error notice.

### Fix Round 1 verification and acceptance

- `npm test`: exit `0`; 63 files passed, 2 skipped; 539 tests passed, 2 skipped.
- `npm run typecheck`: exit `0`; route types generated and `tsc --noEmit`
  completed.
- `npm run lint`: exit `0`; 0 errors and 6 pre-existing warnings.
- `git diff --check`: exit `0`.
- Valid Website compatibility enables the edit mode and workbench only after
  preview state restoration.
- Valid legacy compatibility keeps the workbench unmounted, forces view mode,
  and renders the legacy/experimental notice.
- Missing or malformed compatibility on HTTP 200, non-OK responses, and fetch
  failures keep edit mode disabled and render an actionable failure notice.
- The view-mode iframe remains rendered when compatibility resolution fails.
- The architecture contract now enumerates guarded active operations and
  states that preview/evidence read and export surfaces perform no run/intake
  rewrite, ledger or alias reconciliation, or generated-site write.

### Fix Round 1 files, assumptions, and risks

- Runtime policy and focused tests:
  `src/components/preview/previewState.ts` and `previewState.test.ts`.
- Preview state and notice rendering: `src/app/preview/[id]/page.tsx`.
- Contract precision: `docs/architecture/README.md`.
- Assumption: the evidence endpoint continues to return the exact stable
  compatibility contract produced by `src/lib/productionTarget.ts`; any
  unrecognized future shape intentionally fails closed until the preview
  validator is updated.
- Risk: a compatibility service outage removes editing for that request, but
  preserves preview access and gives the user a retry/new-Website action. This
  is the intended safe degradation.
