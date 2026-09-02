# Studio consolidation — extraction plan and spec list

Date: 2026-08-20. Owner: Devin. Status: **ACTIVE — read before starting work.**

Method: three file-grounded fan-out agents (MishMash bloat map, OpenWork
extension surface, ONE BOX/MishMash overlap), GPT-5.6 Sol at high effort reading
all three repos, Grok 4.6 adjudicating. A first draft of this plan was then
audited adversarially by GPT-5.6 Sol (file-grounded) and Grok 4.6. **Both
returned "wrong."** This is the rewrite. The v1 draft is not preserved; its
errors are recorded below so they are not repeated.

## Pinned revisions

Inventories in this document are only valid against these revisions.

| Repo | Path | SHA |
|---|---|---|
| ONE BOX | `~/projects/one-box` | `3f5ecdabce38245d6db097225739d3eb18c61a5a` |
| MishMash | `~/projects/mishmash` | `5bc993d36905e1da4c0318aa1a010ab56cd9254b` |
| OpenWork | `~/projects/tools/third-party/openwork` | `13504969eeafb4657e555b52e49587c6a7d21072` |

LOC metric for every figure below: tracked `.ts` + `.tsx`, raw line count. ONE BOX
is **41,714** by that metric (31,190 TS + 10,524 TSX); 68,637 if CSS/JS are
included. Any size target must name which metric it uses.

## Corrections — claims that were believed and are false

These were load-bearing in the v1 draft and in the conversation that produced it.
Verified false against the pinned revisions.

1. **"All nine ONE BOX gates fail closed."** Eight are blocking. `perf-budget` is
   deliberately **ADVISORY** — stated in the file header of `src/lib/gates.ts:18`.
2. **"MishMash's quality story is an advisory, non-blocking critique skill."**
   False. MishMash has an integrated Critique Theater with parsing, persistence,
   scored convergence, and interrupts. Skills can mark critique `required`
   (`apps/daemon/src/skills.ts:88`), and its spec says no artifact ships below
   8/10 by default (`specs/current/critique-theater.md:10`).
3. **"OpenWork's `contributions[]` is metadata no renderer reads."** False.
   `settings-panel` contributions select registered React configuration surfaces
   (`apps/app/src/react-app/domains/settings/extension-registry.tsx:55`). The
   accurate claim is narrower and still decisive: there is no contribution type
   that mounts a **new top-level product surface**. `PanelTabType` remains a
   closed enum (`artifact | browser`), routes remain hardcoded with a `/session`
   fallback.
4. **"`/ee` is half the repo."** It is 227,571 of 558,890 TS/TSX lines — **40.7%**.
5. **Catalog counts.** 151 design-system packages (not 153), 352 template
   directories of which 344 have `example.html` (not 354), 164 skills (not 166),
   and `scripts/guard.ts` registers 32 checks (not 53).
6. **"MishMash is ~833k LOC."** Current tracked TS+TSX is **989,415**.
7. **"The Tweaks panel is a documented open defect."** Stale.
   `docs/KNOWN-ISSUES-CANVAS.md` is pinned to old commit `a8dd0663e`; current
   `FileViewer.tsx` contains the Tweaks state, receiver, bridge, and toggle.
8. **"ONE BOX's DESIGN.md migration is half-finished."** Misleading. New runs
   default to `evidence-gated-v2` (`src/lib/runstate.ts:157`); `legacy-v1` is a
   backward-compatibility default for runs with no persisted version
   (`src/lib/contracts.ts:882`), and the legacy renderer explicitly refuses to
   overwrite a v2 contract (`src/lib/pipeline.ts:2540`). This is retained
   compatibility, not unfinished work.
9. **"MishMash yields no harvestable modules."** Overstated. It contains pure
   contracts, parsers, scoring functions, catalog validators, and deterministic
   mock harnesses that port cleanly. Whether to port them is a product choice.

## Defects found during the audit (pre-existing, in ONE BOX)

- **DEF-1 — the site is published before gates run.** `buildSite()` swaps the
  staged directory over the live one at `src/lib/builder.ts:190`, and
  `stageBuild()` only calls `runGates()` afterwards (`src/lib/pipeline.ts:2412`,
  gates at 2432). A gate-failing build has already replaced the previous preview.
  The staging directory exists but the transaction boundary is in the wrong place.
  *Status 2026-09-01:* fixed on `main` by OBX-012 (`status: verified`) in the Page IR
  safe pipeline (PR #16); the line references above are historical.
- **DEF-2 — gates are coupled to the frozen template.** The no-JS gate hardcodes
  `hero.headline`, `nav`, and `contact.cta` selectors (`src/lib/gates.ts:523`);
  token drift only parses `--color-*` and `--font-*`, so HSL, gradients, and named
  colors can be skipped rather than rejected (`src/lib/gates.ts:235`); `runGates()`
  throws outside a structured report if `site/tokens.css` is missing
  (`src/lib/gates.ts:115`). The repair loop can only edit `index.html` and
  `tokens.css` (`src/lib/pipeline.ts:2444`).
- **DEF-3 — no gate exists** for Page IR validity, manifest provenance, allowed
  external origins, stable edit identity, CSP, or reduced-motion composition.

DEF-1 and DEF-2 must be fixed before any generation path that emits markup the
frozen template did not produce. This is the real blocker, not the adapter.

## Decisions

**D1 — ONE BOX is the spine.** Its nouns (intake, evidence, locked contract,
approval, generated site, guarded mutation, rollback, human visual review) are the
product and own generation.

**D2 — OpenWork is not a base.** No top-level product-surface extension point;
external pinned `opencode` binary (`v1.18.18`) from another org; `/ee` is
FSL-1.1-MIT — internal use permitted, commercial substituting/substantially-similar
use barred until each version's two-year MIT conversion.

**D3 — Generation goes through validated Page IR, never arbitrary HTML.** This is
not new: it is ONE BOX's already-ratified D1 in
`docs/plans/2026-08-16-prompt-driven-engine-decisions.md:15`. The v1 draft of this
plan contradicted it. Any execution transport returns validated Page IR plus
declared asset references, and never receives a live-site output path.

**D4 — Catalogs are converted one-way into ONE BOX's schema, not loaded from the
quarry at runtime.** A runtime loader of MishMash packages is a dependency on
MishMash.

**D5 — HTML-first. This is a decision, not an open question.** A second artifact
type ships only with its own artifact contract, compiler, blocking gates, preview
semantics, and rollback proof.

**D6 — "Evaluate" defaults to excluded.** Nothing on the manifest marked Evaluate
enters the tree until a named spine gap justifies it in writing.

## Non-goals

Electron and desktop packaging. 24 of 26 runtime adapters. PPTX/MP4/audio in v1.
Plugin runtime, marketplace, registry protocol. Org control plane, billing,
automations. i18n scaffolding. Desktop pets. Any byte from `/ee` on a commercial
path.

## Extraction manifest

Mode: **Spec** = read as a specification, write our own. **Port** = copy with
provenance. **Content** = convert one-way. **Excluded** = do not take.

### OpenWork (MIT outside `/ee`)

| Source | LOC | Value | Mode |
|---|---|---|---|
| `apps/server/src/managed-opencode.ts` | 249 | Engine spawn, per-instance credentials, TERM→KILL race handling | Spec |
| `apps/server/src/engine-pool.ts` | 1,131 | Blue/green rollover | Spec |
| `engine-reload-defer.ts`, `reload-fingerprint.ts`, `reload-watcher.ts` + tests | — | The actual rule separating rollover-safe reload from session-interrupting reload | Spec |
| `packages/headless-threads` | 1,369 | Typed session client; exports transcripts, **not** artifacts | Spec |
| `workspace-export-safety.ts`, `workspace-import-preview.ts`, `portable-files.ts`, `portable-opencode.ts` + tests | — | Secret detection, deterministic fingerprints, dry-run change preview, replace-vs-merge — maps directly onto guarded mutation and rollback | Spec |
| Tests for every selected source (`managed-opencode.test.ts`, `engine-pool.test.ts`, `skills.test.ts`, `mcp-app-host.test.ts`, `headless-threads.e2e.test.ts`) | — | The selected sources are not a spec without their tests | Spec |
| `evals/packages/testkit/` + `engine-rollover-session-survival.e2e.test.ts`, `safe-edit-resend.e2e.test.ts`, `clamp-html-errors.e2e.test.ts` | — | Their actual proof surface | Spec |
| `apps/server/src/skills.ts` | 296 | `SKILL.md` discovery and frontmatter validation | Spec |
| `packages/enterprise-mcp-client` + `SECURITY.md`, `PRIOR-FINDINGS.md` | 5,981 | Standards MCP OAuth | Excluded until a spine gap names it (D6) |
| `packages/codemode` + `NOTICE`, `UPSTREAM.md` | 9,262 | Confined tool-call execution. Vendored from `anomalyco/opencode@38e10eb` and locally diverged — provenance is unreconstructable after copying | Excluded (D6) |
| `mcp-app-host.ts` + `mcp-app-sandbox.ts` + `packages/mcp-apps/` | 690+ | MCP-UI host | Excluded (D6) |
| `/ee/**` | 227,571 | — | Excluded |

### MishMash (Apache-2.0, own fork of Open Design)

| Source | Value | Mode |
|---|---|---|
| `apps/daemon/src/runtimes/{types,registry,launch,env,executables,invocation,prompt-budget,prompt-file,terminal-control}.ts` | The real runtime contract. Prompt transport, session capability, native binary resolution, output caps, cancellation. **The three adapter defs are unusable as a spec without these** | Spec |
| `apps/daemon/src/{chat-run-lifecycle,run-terminal-reconciliation}.ts` | Resume reconciliation and terminal status | Spec |
| `mocks/bin/*`, `mocks/lib/format-*.mjs`, `mocks/golden/*.events.json`, `mocks/scripts/{contract-check,smoke-test}.sh`, `e2e/lib/fake-agents.ts` | **Deterministic fake-agent harness. Higher value than the adapter definitions** — permits malformed-stream, resume, timeout, cancellation and exit-status testing with no authenticated CLI | Spec, high priority |
| `apps/daemon/tests/{agent,codex,opencode}-session-resume.test.ts`, `retry-orphan-process-group.test.ts`, `run-retry-runtime.test.ts`, `plain-stream-artifact-event-truncation.test.ts`, `tests/runtimes/*` | Runtime contract tests | Spec |
| `runtimes/{claude-stream,json-event-stream,plain-stream}.ts` | 2,062 LOC of event parsing and session-ID capture. Resume flags live in defs, lifecycle elsewhere | Spec |
| `runtimes/defs/{claude,codex,opencode}.ts` | 392 LOC of flags, models, auth, prompt limits | Spec |
| `design-systems/_schema/*`, `packages/contracts/src/design-systems/{token-schema,components-manifest,derived-token-outputs}.ts` | **Catalog schemas. A loader without these imports malformed and path-unsafe content** | Spec, high priority |
| `scripts/{check-design-system-manifests,check-design-system-package-quality,validate-design-catalog,build-design-index,extract-components-manifest}.ts` | Catalog validators | Spec |
| `specs/current/skills-and-design-templates.md`, `docs/skills-protocol.md`, `docs/design-systems.md` | Catalog protocol. **Skills are not inert markdown** — frontmatter changes generation, critique, defaults, and capability behaviour | Spec, read first |
| `craft/` + `apps/daemon/src/craft.ts` | A fourth content category the v1 draft missed entirely | Spec |
| `packages/contracts/src/critique.ts`, `apps/daemon/src/critique/{parser,scoreboard,transcript,config,persistence}.ts` | Bounded scoring, replayable transcripts, parser-failure handling, explicit fallback semantics | Spec |
| `apps/web/tests/runtime/srcdoc-*.test.ts` | Transport, redirect guard, sandbox shim, navigation, fonts timeout, palette variables | Spec — prefer over reading `srcdoc.ts` (3,684) as a monolith |
| `apps/daemon/src/previews.ts` (315) + `preview-service.test.ts`, `project-preview-containment.test.ts` | Detached process group; **accepts any HTTP response as ready — not necessarily 2xx.** Tests cover port collision and teardown | Spec |
| `apps/daemon/src/brands/design-md.ts` (182) + `brands/index.ts`, `prefetch.ts` | Brand object → DESIGN.md, and the extraction path that produces the Brand | Spec |
| `e2e/ui/visual-catalog.test.ts`, `e2e/tests/visual-catalog-coverage.test.ts`, `e2e/lib/playwright/catalog.ts` | Harness pattern. Note: their visual baseline lane is not universally merge-gating | Spec |
| `design-systems/` (151), `design-templates/` (352, 344 with `example.html`), `skills/` (164), `craft/` | Catalog content | Content, capped and converted |
| `scripts/guard.ts` (32 checks) | Decide in writing which become ONE BOX gates and which are discarded | Spec |
| `sidecar/desktop-renderer/render.ts`, `deck-export.ts`, `pdf-export.ts` | Second-artifact machinery | Excluded until D5 is satisfied |
| `tools/pack` (19,711, dormant), `packages/launcher-proto`, i18n, pets, plugins/marketplace | — | Excluded |

## Phases

The catalog track runs **in parallel** with the execution track. They share only
the schema definitions from CAT-001.

**P0 — Pin and classify.** Record the three SHAs and dirty state, fix the LOC
metric, and define the provenance schema. Catalog selection is by the CAT-001 bar
and a written reason per entry; do not plan around a usage signal that does not
exist (see CAT-003).
*Done when:* provenance schema committed, SHAs recorded, metric stated.

**P1 — Artifact boundary and publish transaction.** Specify Page IR, capability
allowlist, asset manifest, stable edit identity, and a staged `SiteBundle` that is
promoted only after blocking gates pass. **Fix DEF-1 and DEF-2 here.**
*Done when:* a gate-failing build provably leaves the previous published site
byte-identical, and the gates no longer assume the frozen template's selectors.

**P2 — Deterministic proof harness.** Extract the fake-agent fixtures, stream and
lifecycle contract tests, malformed-output tests, and staged-publish rollback
tests.
*Done when:* the suite runs green with no authenticated CLI and no network.

**P3 — One execution transport.** Implement it beneath structured generation. It
returns validated Page IR; it cannot write the live site.
*Done when:* one real CLI drives a full run, all blocking gates still fail closed,
and the import-boundary architecture test passes.

**Parallel — Catalog track.** Schemas, indexes, licensing records, import
normalization, validation, DESIGN import. Retains explicit legacy compatibility.
*Done when:* the portability bar and cap are committed and every converted entry
passes schema validation plus a deterministic render smoke.

**P4 — Curated catalog activation.** Prove multiple representatives per category
including negative fixtures and one atypical template.

**P5 — Second adapter and routing.** Extend ONE BOX's **existing** routing policy
(`docs/eval/model-routing/policy.md`) — do not invent a second table. Its evidence
matrix currently authorizes no new production route
(`docs/eval/model-routing/task-model-matrix.md:22`), so this needs benchmark
evidence first.

**P6 — Second artifact type.** Only under D5.

## Spec list

- **GATE-001** — Name all nine gates and their blocking status. `perf-budget` is
  advisory today; either make it blocking or record why not. Fixtures per gate.
- **GEN-001** — Generate output contract. The transport writes only commissioned
  paths and never the live site.
- **OWN-001** — The pipeline owns generation, review, and rollback. Cancel and
  resume cannot skip a lock. Pipeline checkpoint resume and CLI conversation
  resume are different mechanisms and must not share an interface.
- **EXEC-001** — Separate `ExecutionTransport` and `PageIRProducer` interfaces with
  versioned Zod request/event/result schemas. Cancellation is `AbortSignal`.
  Resume is a declared capability, not an assumed method.
- **EXEC-002** — First adapter names the exact CLI, version range, binary
  resolution rule, auth lane, cwd, environment allowlist, prompt transport, output
  cap, timeout, and exit/signal mapping. Passes the fake-CLI suite plus one opt-in
  live smoke.
- **EXEC-003** — Detection is table-driven over: GUI-minimal `PATH`, symlink/shim
  resolution, native binary resolution and fallback, missing shebang interpreter,
  missing binary, Windows `Path` casing. Each asserts resolved executable plus
  diagnostic.
- **EXEC-004** — Transport failure, schema-invalid output, compile failure, and
  gate failure are distinct terminal codes. In every failure the prior published
  site is byte-identical, no approval record is written, and failure evidence is
  retained.
- **EXEC-005** — `pipeline.ts` may import only an orchestration facade; never
  `child_process`, runtime definitions, CLI flags, or stream parsers. Enforced by
  an architecture test. **Line count is not a criterion** — the v1 draft used it
  and it was a metric chosen because it would not fire.
- **PREV-001** — Start refuses an occupied port. Readiness requires a configured
  HTTP predicate, not any response. Cancellation terminates and confirms the whole
  process group. Teardown failure reports as failure.
- **DES-001** — One v2 materializer for new runs, passing `@google/design.md@0.3.0`
  with zero errors and warnings. Legacy fixtures either resume byte-compatibly or
  pass an idempotent migration with before/after hashes. **Do not delete legacy
  before migration behaviour is defined.** App-shell `DESIGN.md` and per-run
  contracts are different scopes; do not conflate them.
- **BRAND-001** — Intake and evidence produce a Brand object. The DESIGN.md
  renderer is downstream of this and is not a substitute for it.
- **CAT-001** — Portability bar, numeric cap, one-way conversion. Bar: HTML plus
  CSS custom properties plus ONE BOX DESIGN.md; no framework components, no
  foreign tool names, no JS build step. Cap for v1: single-digit design systems,
  ~10 templates, a named skill list. Failing the bar means exclusion, not
  wrapping. A runtime loader of quarry packages is forbidden.
- **CAT-002** — Loader schemas per category. Reject traversal, escaping symlinks,
  undeclared files, invalid frontmatter, oversized files, missing required assets,
  missing provenance. Loading never executes catalog scripts.
- **CAT-003** — The curated allowlist commits entry ID, source SHA, path, licence,
  content hash, selection reason, and supported artifact type. **Selection is by
  the CAT-001 bar plus a written reason per entry — not by usage.** No usage
  signal exists: neither repo carries run records or telemetry that could answer
  "which entries have been used", and ONE BOX is loopback-only and local-first, so
  product analytics is not the fix. If a usage signal is ever wanted, it is local
  run records under `sites/`, and it is an input, never the rule.
- **SKILL-001** — Skills are rewritten to ONE BOX's nouns and tool surface or
  excluded. Loading MishMash skills unmodified prompt-injects MishMash into ONE
  BOX.
- **EVAL-001** — Golden runs for the curated catalogs. Every `guard.ts` check is
  mapped to a ONE BOX gate or discarded in writing.
- **BUD-001** — Per-phase LOC caps summing to the stated target under the P0
  metric. Vendored lines count.
- **LIC-001** — Provenance recorded before import: source repo, commit, path,
  SPDX licence, licence-text pointer, SHA-256, import mode, destination. CI fails
  on missing records or hash drift.
- **LIC-002** — A provenance-closure check proves every imported byte resolves to a
  non-`/ee` path at the pinned OpenWork commit. A string search for `/ee` is
  insufficient.
- **EXCL-001** — `codemode`, MCP-UI host, and `enterprise-mcp-client` stay excluded
  until a named spine gap justifies each in writing.

## Kill criteria

Re-decide if any of these becomes true:

- A generation path can produce a published site the pipeline did not commission.
- A blocking gate is made advisory to unblock a runtime, **or** a gate stays
  nominally blocking while generation happens outside its reach.
- A second artifact type is started before D5 is satisfied.
- The catalog loader reads quarry packages at runtime (violates D4/CAT-001).
- Total tracked TS/TSX passes the BUD-001 ceiling.
- Any `/ee` byte appears on a commercial path.

## Evaluated and excluded — third-party dependencies

Recorded under D6 so these are not re-litigated. Evaluated 2026-08-20 against a
recommendation list produced for **MishMash** by an outside tool. Its substantive
repo claims checked out (GSAP is conditional in MishMash's `design-authority.json`;
PostHog and OpenTelemetry are in its daemon deps; `multica-ai/multica` is real and
referenced in its specs) but four of twenty-two links were wrong: Panda CSS is
`chakra-ui/panda` not `panagiotisp/panda`, Remotion is `remotion-dev/remotion` not
`remotionjs/remotion`, and `instructlab/hermes` and `figma/figma-api` both 404.

The list was written for a multi-runtime, multi-artifact, catalog-heavy studio.
ONE BOX is the opposite shape by decision: one artifact type, one process,
deterministic compile, nine runtime dependencies. Adopting these would move ONE
BOX toward being MishMash, which is the failure mode this plan exists to prevent.

| Candidate | Verdict | Reason |
|---|---|---|
| Panda CSS | **Excluded — actively harmful** | Replaces the DESIGN.md → `@google/design.md@0.3.0` → Tailwind v4 export pipeline, which is the product. Conflicts with DES-001. |
| Storybook | Excluded | Catalogs component libraries; ONE BOX emits static sites and has none. |
| Radix UI | Excluded | React runtime components in output, against the blocking `no-js` gate. Arguable only for the workbench shell, which has its own contract. |
| Medusa / Strapi | Excluded | A service topology ADR 0001 rejected. ONE BOX is loopback-only. |
| OpenWebUI | Excluded | Chat surface — the same category error as OpenWork (D2). |
| Remotion, Theatre.js | Excluded under D5 | Second-artifact-type work. `gsap@3.15.0`, `siteMotion.ts` and the motion gates already cover motion rendering. |
| Biome | Excluded | Churn against `eslint-config-next`'s Next-specific rules; 152 files have no lint speed problem. |
| ts-morph | Excluded | Manipulates TypeScript ASTs; the mutation surface here is HTML and `cheerio` is already a dependency. |
| Styled System | Excluded | Unmaintained and superseded. |
| PostHog, OpenTelemetry | Excluded | Single process, local-first, loopback-only. Conflicts with `docs/security/local-api-threat-model.md`. |
| Multica | Excluded from the product | Issue-level agent assignment, not generation. May be relevant to fleet workflow, which is out of scope here. |
| Excalidraw | Excluded | Input is a brief, not a wireframe. |

**Held as candidates, not adopted** — each names a real future gap rather than
adding mass. None enters the tree until its gap is named in writing (D6):

- **Figma REST API / Penpot** — additional evidence sources for BRAND-001. The
  reference path today is Refero MCP only. Legitimate *after* the Brand contract
  exists.
- **`github/copilot-cli`** — one candidate CLI for EXEC-002. Candidate list only;
  the artifact boundary (P1) comes first.
- **Theatre.js** — revisit only if motion *authoring* becomes a named spine gap.
  Motion *rendering* already works.

## First action for the next session

Do **not** start an ExecutionAdapter. Both auditors independently identified it as
the seductive wrong first step.

Take one MishMash design system that already meets the CAT-001 bar — HTML plus
tokens plus DESIGN.md — or strip one until it does. Convert it by hand into what
ONE BOX already consumes. Run the **current** pipeline. Record which gates fail
and why.

That single run is the only inventory that counts. It tells you whether this is
content-into-spine or whether the consolidation thesis is false. If one package
cannot get through without a new runtime abstraction, the thesis is already wrong
and an adapter would only hide it.

Fix DEF-1 (publish before gates) before that run, or the failing gates will have
already replaced the previous preview.
