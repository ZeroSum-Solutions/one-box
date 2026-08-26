# Guided pipeline direction and visual audit

Date: 2026-08-25
Scope: default guided OneBox pipeline, local runtime, current branch
Decision contract: `docs/specs/2026-08-25-guided-pipeline-direction-audit.md`

## Verdict

Production audit: 92/100, strong for the local guided-feature release. No known
launch blocker remains in the patched path. Production deployment, DNS, and a
production Google origin were intentionally outside scope.

## Direction

The guided experience remains a read-only projection over the authoritative
pipeline. It now follows one visual decision at a time:

1. Show the market map as soon as intake completes.
2. Surface up to four real first-party sites immediately, before slow crawl and
   analysis work finishes.
3. Label captured-but-unranked sites as provisional and reserve ranks and
   expandable analysis for evidence-scored sites.
4. Collapse completed market research when reference or approval work becomes
   current, while keeping it one click away.
5. Keep the existing Developer `RunTimeline` unchanged.

The four-site limit is intentional. `MarketAnalysisSchema` can retain up to
eight analyzed rows, but `displayCutoff: 4` and the legacy `ScanResult` contract
define the owner-facing set. The scan now limits paid crawl work to those four
durable candidates so completed evidence cannot become an orphan.

## Implemented findings

- Maps no longer embeds the raw unconfigured route. The server projection
  enables the iframe only when an Embed key exists and the query passes
  `MapEmbedQuerySchema`; an external Google Maps link remains available in
  every state.
- The scan persists discovery before crawl, then persists each completed crawl
  batch before emitting its captured event. Analysis failure cannot erase a
  successfully captured eligible site.
- Places is enrichment rather than an eligibility gate. A Places-unverified
  result must still have a successful first-party crawl and markdown artifact,
  must not be editorial, and must not match the shared directory/social/job
  host policy.
- Ranked and provisional cards have distinct copy and styling. Review counts,
  ratings, directory order, and social popularity stay outside the scorer.
- Completed research defaults to a compact disclosure during reference and
  evidence decisions, keeping the current action in the first viewport.
- Guided polling is serialized, stale evidence remains visible during a
  reconnect, malformed required artifacts fail closed, and ordinary stage
  failures offer checkpoint resume before clean restart.
- A completed evidence-gated run is labeled ready only after candidate and
  canonical promoted-live metadata agree. Missing, failed, abandoned, or
  unreadable live authority becomes `state-unavailable`.
- The competitor dialog contains keyboard focus, closes with Escape, restores
  focus to its card, and uses ordinary pressed-button screenshot controls.
- Mobile map, dialog, ranking, and confirmation controls meet the 44px touch
  target at 390px and 320px. Reduced-motion rules remain intact.
- Reference guidance explains the exact missing action. Browser draft storage
  is best-effort, clears deselected empty drafts, and cannot crash the in-memory
  picker when storage is blocked or full.

## Independent review dispositions

Exact `anthropic/claude-opus-5-fast` review ran through the approved Nous
subscription. Its complete closing response was `PASS` with no blocking or high
findings. Follow-up medium findings for trailing-dot host normalization and
stale empty drafts were implemented. The final independent TypeScript review
also returned `PASS` with no remaining high or medium findings.

The following suggestions were rejected with evidence:

- Render all eight sites expanded: rejected because the approved schema and
  `displayCutoff` define four owner-facing cards; density is handled by the
  completed-research disclosure.
- Treat omitted or failed promoted-live inspection as complete: rejected
  because guided completion must fail closed against the authoritative live
  bundle.
- Apply 44px visual controls on desktop: rejected because `DESIGN.md` explicitly
  limits the 44px touch-target expansion to the mobile breakpoint.
- Show a warning when local draft persistence fails: rejected because the
  current in-memory choice remains usable and a storage warning would add a
  false pipeline failure state.

## Existing-run compatibility

Runs whose scan stage finished before this patch are not silently re-ranked or
given synthetic analysis. Their saved source links remain visible as honest
`Captured site` cards, but an empty historical `market-analysis.json` remains
empty. Rewriting an already approved evidence ledger would violate artifact
authority. New and resumed non-complete scan stages use the repaired path.

## Blockers

None for the local guided-feature release.

## High-value fixes

None remain in the reviewed scope. Pre-existing repository lint/build warnings
are outside this patch and are recorded by the verification commands rather
than hidden.

## Evidence checked

- Focused Vitest regression suite for progressive persistence, market source
  policy, guided projection/route, map behavior, picker storage, and UI output.
- Full Vitest suite, TypeScript, repository ESLint, targeted zero-warning ESLint,
  production Next.js build, and `git diff --check`.
- Guided Playwright path at 1440px, 390px, and 320px, including configured and
  fallback map branches, overflow, current-action placement, touch targets,
  serialized polling, dialog focus containment, Escape, focus return, and the
  unchanged Developer view.
- Live local Maps Embed redirect and bounded Places smoke using vault-sourced
  credentials; no credential value was committed or documented.
- Range-scoped secret scan and the structured security review for the final
  commit range.

## Evidence missing

- Production-host Google key restrictions and production runtime behavior were
  not checked because production activation was outside the approved scope.
- Remote CI and branch-protection results are checked after push; they are not
  substitutes for the local gates above.

## Next action

Commit and push the verified branch, then open the current local run for owner
testing. Use a new run when testing ranked competitor breakdowns; the existing
pre-patch pool run intentionally shows its recovered sources without inventing
retroactive analysis.
