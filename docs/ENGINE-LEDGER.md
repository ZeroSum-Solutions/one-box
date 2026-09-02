# ONE BOX — engine issue ledger

Append-only record of every defect, limitation and process failure found while
working on the generation engine. **Do not delete entries.** Resolved items stay,
with their resolution, because the resolution is usually the useful part.

Opened 2026-08-15. Covers the sameness investigation, the layout-IR spike, and
the Refero-only baseline.

**Status:** `OPEN` · `FIXED` · `CONFIRMED` (a limitation, not fixable by us) ·
`TRACKED` (managed elsewhere) · `DOCUMENTED` (recorded, no action)

**Severity:** `S1` blocks shipping · `S2` degrades output quality ·
`S3` friction or hygiene

---

## ENG — engine architecture

The root causes of "every site looks identical". Diagnosed 2026-08-15 with
evidence; **none are fixed yet.**

| ID | Sev | Status | Issue | Evidence |
|---|---|---|---|---|
| ENG-001 | S1 | OPEN | The section registry is **hardcoded into the orchestrator prompt**. The model may only choose from `nav, hero, trust-bar, services, why-us, service-area, contact, footer`. No brief can produce a section outside this list. | `src/lib/pipeline.ts:1842` |
| ENG-002 | S1 | OPEN | One frozen template is copied per run. `site.css` is **byte-identical across every run**; only `tokens.css` varies. | `src/lib/builder.ts:35`, `:106` |
| ENG-003 | S1 | OPEN | The `css-architecture` human-approval gate is **inert**. The approved artifact is existence-checked and then never read; theme CSS is rendered from the inventory and plan instead. A human approves something that has no effect. | `src/lib/pipeline.ts:883` |
| ENG-004 | S2 | OPEN | Refero is wired only into the token layer. It cannot influence composition. | `pipeline.ts` (token synthesis stage) |
| ENG-005 | S2 | **FIXED** | `buildSite` writes `complete:false` into the **active** site directory. Publication is not atomic; a failed build leaves a half-written live site. | `src/lib/builder.ts:69` |
| ENG-006 | S2 | **FIXED** | The `token-drift` gate only inspects computed `color`, `backgroundColor`, `fontFamily`. Spacing, radius, shadow and type-scale drift pass unnoticed. | `src/lib/gates.ts:137` |
| ENG-007 | S3 | **FIXED** | `scripts/dev.sh` ignores its port argument — `exec npm run dev:next` hardcodes 3000. | `scripts/dev.sh` |
| ENG-008 | S2 | **FIXED** | Shipped `tokens.css` declares `--border-subtle: 1px solid var(--color-stone-grey)`; `--color-stone-grey` is never defined anywhere. A dangling token reference in production output. | generated `tokens.css` |
| ENG-009 | S3 | **FIXED** | Evidence workspace 404s — absolute filesystem paths are rendered as image URLs. | evidence workspace UI |

**The architectural consequence, stated once:** ENG-001 and ENG-002 together mean
the brief cannot reach composition, and ENG-003 means the human gate that should
have caught it does nothing. Fixing tokens alone cannot fix sameness.

### Resolutions — 2026-08-15

**ENG-008** — root cause was wider than first recorded. `renderTokensCss`
(`builder.ts`) writes model-authored free-form strings for `radii`, `spacing`,
`borders`, `shadows` and `layers` straight into `tokens.css`. A `var()` inside
one of those values naming a property nothing defines makes the **whole
declaration** invalid at computed-value time, so the property reverts to its
initial value: the border does not render wrong, it disappears. `buildSite` now
refuses to emit such a sheet, naming the properties.

**ENG-006** — widened, but **not** the way the entry assumed. Comparing computed
spacing, radius and font-size against token values was tried on paper and
rejected, for two reasons found in the stylesheet itself:

- Fluid type is composed as `clamp(var(--text-a), 3vw + 0.5rem, var(--text-b))`
  in 5 places, so a correct rendered `font-size` is routinely a value that
  equals **no token at all**.
- The frozen `site.css` legitimately contains its own composition scalars
  (`50%` radii on avatars, `padding: 10px` in the iOS rules) — D-004 already
  established that Refero supplies a vocabulary, not a layout.

An equality check would have failed both, on every run. Per H-003 that gate
would have been switched off within a week. What shipped instead resolves every
`var()` the stylesheets reference against every `var()` they define — which
catches spacing, radius, shadow and type-scale drift at its **source** rather
than in its symptoms, with no viewport or serialisation ambiguity.

Measured against the real frozen `site.css`: 36 bare references, all satisfied
by the documented token contract, and exactly 3 references that could dangle
(`--border-subtle`, `--layer-overlay`, `--layer-sticky`) all carry fallbacks and
so are correctly ignored. Negative-tested: removing `--radius-md` and
`--text-heading` from a token sheet fails the gate; removing the three
fallback-guarded properties does not.

**ENG-007** — `dev:next` now reads `${PORT:-3000}` and `dev.sh` exports `PORT`
from an optional first argument. The port stays **explicitly** specified rather
than left to Next's default, because an unspecified port lets Next retry onto a
different one when 3000 is busy — and auditing a site the server is not serving
is a failure mode this ledger already knows too well. Verified: `PORT=5199`
binds `http://127.0.0.1:5199`.

The security test that pinned `--port 3000` was updated, not weakened: its
stated invariant is loopback-only, which `--hostname 127.0.0.1` carries.

**ENG-005** — the build now runs in `site.building/` and is swapped over the
live directory only after the manifest flips to `complete:true`. The swap is
two renames (POSIX `rename()` refuses to replace a non-empty directory): live
moves aside, staging moves in, the retired copy is deleted last — and put back
if the second rename fails. A failed build now leaves the **previous** site
serving, which is the property the entry was actually about. The
`complete:false` stub is kept inside staging so a crash leaves a directory that
is unmistakably incomplete rather than plausible. Covered by three
`publishBuild` tests, including replace-not-merge (a copy-over would leave
stale files the manifest no longer lists).

OBX-012 supersedes that interim publication boundary. Production `buildSite`
now requires a durable authorized run, compiles into the fixed unserved
`candidate/site/` root, and stops at `ready-for-gates`. The old directory-swap
behavior survives only in the guarded test fixture helper. The candidate runs
the full candidate gate suite and becomes `failed` or `promotable`; neither
outcome mutates the live site, and promotion remains a separate OBX-014
operation.

OBX-014 now implements that separate operation. Promotion revalidates the exact
promotable candidate under the shared site-authority lock, swaps one durable
`site/` bundle containing closed `.one-box/` manifest/provenance/gate metadata,
and only after the authoritative commit supersedes the prior visual decision
and creates a pending visual-QA version bound to the promoted hash. The run-root
`gates.json` is now only a derived compatibility projection; release, evidence
export, client handoff, promoted preview gate status, and promoted edit baselines
validate the canonical bundle rather than this projection. Outward actions also
require a named human review bound to the promoted build hash. OBX-024 still owns
calling this operation from the resumable pipeline, and OBX-015 owns startup
crash recovery.

OBX-015 now closes that recovery boundary. Resume first runs deterministic
candidate and promotion-footprint recovery under the shared site authority.
Only exact hash-bound candidate state or one exact transaction generation is
resumed; clean promotable state remains parked, while invalid/ambiguous state is
abandoned or blocked with a bounded durable reason. Promotion recovery restores
the prior site or completes only an already-committed promoted bundle, reconciles
visual QA idempotently before retired cleanup, and preserves last-known-good
bytes whenever live authority is ambiguous. Build, gate disposition, repair
commit, cleanup, promotion, editing, tokens, assets, motion, and generated-site
reads now serialize through one documented site-authority-first lock order.
Fresh-process exits at every promotion fault step, repeated recovery, reader
contention, and cross-process lock contention are covered by regression tests.

OBX-020 now defines the previously missing production Page IR contract boundary
in `src/lib/contracts.ts`. Numeric-v1 Reference, Layout, and Website-only Page IR
schemas are recursively strict and bounded. The layout is a normalized,
single-parent graph with one required document, header, navigation, main, footer,
and H1; Page IR registries validate every slot, content, token, image, action, and
accessibility reference before compilation. Interactions are limited to scroll,
call, email, and public HTTPS actions, and unrecognized executable or path-bearing
field shapes fail closed. This resolves only the schema authority: derivation,
deterministic compilation, runtime persistence/promotion, and authoritative edits
remain owned by OBX-021, OBX-022, OBX-024, and OBX-031.

OBX-021 now closes the approved-input derivation seam in
`src/lib/pageIrDerivation.ts`. The pure synchronous boundary accepts exactly one
approved, positive-version, exact-byte binding for each of the eight fixed
source kinds, hashes all source bytes before parsing, and rejects unknown,
duplicate, missing, cross-run, stale-chain, or misattributed inputs. It parses
the five existing evidence/design/token/CSS contracts plus closed numeric-v1
layout, content, and image artifacts, then assembles and revalidates Page IR.
Supported semantic tokens project deterministically to safe IDs and collision
fails closed. The returned Page IR hash uses canonical recursively sorted object
keys while preserving array order; fixed-order lineage carries source versions,
hashes, purpose, and safe Refero alias/trait attribution without a timestamp.
This does not claim human qualitative eval passage and does not read, persist,
compile, promote, or edit an artifact; those remain later ticket boundaries.

OBX-022 introduced the pure `page-ir-static@1` compiler boundary; the shipped
contract is now `page-ir-static@3`. It reparses
numeric-v1 Page IR, requires the exact referenced in-memory image set, binds
media type, byte count, SHA-256, and image magic, clones input bytes, and returns
only sorted `index.html`, `site.css`, `tokens.css`, and canonical asset files plus
a deterministic candidate manifest. Graph child order, not registry order,
controls semantic HTML; content and attributes are escaped, actions remain
usable as anchors without JavaScript, and Page IR data cannot author CSS or
executable source. The compiler has no filesystem, network, provider, latest-
alias, persistence, candidate-lifecycle, or publication authority. Canonical
Page IR hashing moved to the pure `src/lib/pageIrHash.ts` authority shared with
derivation.

This closes mechanical determinism, not visual qualification: Page IR v1 has
token IDs/categories but no approved values or contrast roles, so the current
compiler uses fixed safe compiler-owned canvas, color, typography, and category
fallbacks. Human `EVAL-WEB-001` and visual-quality
qualification remain separate named-human gates backed by the frozen six-purpose
packets. The current compiler emits the closed canvas and token declarations needed
by the no-JavaScript and token-drift checks; OBX-024 routes those checks against the
unserved Page IR candidate before atomic promotion.

**ENG-009** — root cause was in the *writers*, not the workspace: `crawlSite`
and `capture()` record **absolute** filesystem paths in the scan artifact, and
the workspace concatenated them into `/api/sites/<id>//Users/…`. Fixed at the
render boundary (`artifactUrl` now recovers the run-relative path from any of
the three recorded shapes), because runs already on disk hold absolute values
and a writer-side fix would have left every existing run broken. Absolute paths
in artifacts also leak the machine's home-directory layout into anything
exported — a second reason not to trust the stored shape.

---

## REF — Refero MCP

Findings from using Refero as the sole design input. These are properties of the
service, not bugs we can fix.

| ID | Sev | Status | Finding |
|---|---|---|---|
| REF-001 | S1 | CONFIRMED | **The screen corpus does not cover trades or local services.** Two independent, directly-worded queries both returned Terms-of-Service pages. `B2B technical services homepage with call for estimate` → Bloomberg ToS, Webflow ToS, Kraken legal, Microsoft plan chooser, DJI support. `electrician contractor construction company website` → LEGO contact page, Chargetrip EV software ×3, Programa SaaS, Visual Electric ToS, Netflix careers, Twitch Safety Center, Tesla support. **Zero contractors across both.** Do not spend calls on `refero_search_screens` for this category. |
| REF-002 | S2 | CONFIRMED | Style record `14edc470-fa1c-47f9-9efa-d44194be4aec` (Empower) is **corrupted**: the description breaks mid-sentence into a leaked raw JSON fragment, then thousands of repeating bracket glyphs, with stray Cyrillic. Appeared in two separate searches. Any consumer parsing descriptions must be defensive. |
| REF-003 | S2 | CONFIRMED | Named typefaces are licensed and unobtainable (PP Neue Montreal, GT America Mono, Lateral, MDIO). Refero supplies a `substitute` per family — **only substitutes are safe to ship.** |
| REF-004 | S3 | CONFIRMED | Token values contain transcription artefacts: `9.99999px` padding, a hover colour in raw `oklab()`. Needs rounding and sanity-checking, never literal use. |
| REF-005 | S2 | CONFIRMED | Styles are extracted from **one marketing page each**. Nothing describes secondary page types, deep form states, or states beyond hover. Anything past a landing page is extrapolation. |
| REF-006 | **S1** | CONFIRMED, **now gated** | **Refero's token roles are not accessibility-audited.** Three roles, applied exactly as written, fail WCAG AA — see A11Y-001/002/003. The page looks correct while failing. Any engine consuming Refero **must** run a contrast gate over resolved pairs. The engine had none; `src/lib/contrastGate.ts` is now a blocking gate on every build **and** every edit, since a token edit is precisely how a passing pair becomes a failing one. |
| REF-007 | S3 | CONFIRMED | Semantic search matches the wrong **word sense**. "electrician… electric" surfaced Visual Electric (an AI image tool), Chargetrip (EV), and Tesla. |

### What Refero is genuinely for

Agreed position between Claude (Opus 5) and GPT-5.6 after independent audit:

- **Good at:** supplying a complete, internally-consistent *visual vocabulary* —
  palette with written roles, type pairing and scale, spacing, shape, shadows,
  surface levels, component specs, enforceable do/don't lists, imagery direction,
  sometimes motion. Traceable, so a design contract can cite it.
- **Structurally cannot supply:** what the business must prove to earn trust;
  which sections are commercially necessary; whether a claim is true; conversion
  strategy; the client's brand, photography or qualifications; multi-page
  systems; accessible token usage.
- **Correct pipeline position:** intake and evidence inventory → business
  strategy and IA → Refero style retrieval → curated human direction lock →
  design synthesis → composition and build → gates. **Refero must not own stages
  1, 2, 6 or 7.**
- **User-facing reference picking:** yes, but *curated*. Three pre-vetted
  directions, each translated into what carries in, what will not be copied, and
  a sample on the client's real content. Never a raw gallery — that rewards
  superficial taste and lets popular references dominate every site.
- **The weakest part of Refero-only:** it breaks at the seam between style
  vocabulary and composition judgment. At 100 sites you would no longer share
  byte-identical CSS, but you would share **reference attractors and synthesis
  tics** — warm off-white canvases, sans+mono, split heroes with pseudo-console
  panels, three-column grids, a full-bleed accent divider, one dark closing CTA.
  The same failure in a more tasteful disguise. Business completeness breaks
  first; visual convergence breaks second.

---

## A11Y — accessibility

All found on the Refero-only baseline. **All five originate from following
Refero's own token roles literally** (REF-006).

| ID | Sev | Status | Pair | Measured | Fix |
|---|---|---|---|---|---|
| A11Y-001 | S1 | FIXED | `#ffffff` on `#f35b22` — Refero's own primary-button spec | 3.32:1 | Ink `#141415` on accent, 5.55:1. Ambrook uses dark-on-accent, so precedent stays inside the reference set. |
| A11Y-002 | S1 | FIXED | Faded Stone `#8c8c89` on Canvas White — role: *"tertiary text, descriptive labels"* | 3.23:1 | Graphite `#454542`, 9.21:1 |
| A11Y-003 | S1 | FIXED | Accent Orange on Canvas White — role: *"key highlights in text"* | 3.17:1 | Accent Edge `#be400f`, 5.11:1 |
| A11Y-004 | S1 | FIXED | Coverage metadata, 14px | 3.37:1 | Missed by a bulk edit because the rule was single-line. Caught by external audit. |
| A11Y-005 | S1 | FIXED | Contact link **hover** on console | 4.10:1 | Passes as 30px large text on desktop; **fails once the ≤640px rule drops it to 16px normal text.** Replaced with an underline affordance. |

Every fix uses Refero's *own* darker tokens, so provenance survives.

---

## HARNESS — verification tooling

Bugs in the tools that were supposed to catch the bugs. **These matter more than
they look: each one produced a confident green result over a real defect.**

| ID | Sev | Status | Issue |
|---|---|---|---|
| H-001 | S1 | FIXED | **Three hand-audits of one small page produced three wrong answers.** Hand-listing colour pairs audits your memory of the stylesheet, not the stylesheet. Replaced with `spikes/refero-baseline/contrast-audit.mjs`, which walks the rendered page. |
| H-002 | S1 | FIXED | `getComputedStyle` returns the **interpolated** value mid-transition. A 150ms colour transition made every freshly-forced hover state read as the *old* colour, so all hover states silently passed. Transitions must be frozen before measuring. |
| H-003 | S2 | FIXED | Forcing a hover *colour* without its hover *background* invents failures. Two states here darken the background and lighten the text together; a colour-only gate reported them as light-on-light. **A gate that cries wolf gets switched off** — false positives are as damaging as misses. |
| H-004 | S2 | FIXED | A `fullPage` screenshot does **not** reliably trigger `loading="lazy"`. Below-fold images rendered blank, which reads as a broken layout rather than a harness gap. Fixed by forcing `loading=eager` and awaiting `decode()`. |
| H-005 | S3 | TRACKED | The dev server died twice under the preview harness, producing "OneBox could not reach the local service". Worked around by launching via background shell. |
| H-006 | S2 | FIXED | **Forcing a hover rule with `!important` overrides the cascade.** Porting the spike's gate into the engine, the generic `.btn--ghost:hover` rule was replayed onto a button that a more specific `.contact-band .btn--ghost:hover` rule governs. It reported **2.53:1 on a pair the browser never renders**, and failed the smoke suite on its first run. Fixed by replaying `:hover` as a `.__hover` class — identical specificity — so the cascade resolves the pair instead of the gate. This is H-003 in a third disguise: the first version measured the wrong background, the second measured the wrong rule. |

**Rule adopted:** a gate is not trusted until it has been **negative-tested** —
reintroduce each known defect and confirm it fails. `contrast-audit.mjs` is
negative-tested against A11Y-001, A11Y-004 and A11Y-005.

---

## CONTENT — evidence discipline

| ID | Sev | Status | Issue |
|---|---|---|---|
| C-001 | S1 | FIXED | "no forms" — an invented policy. The brief forbids online *booking*, not an inquiry form. Worse, it sat inside a panel headed "Company record", making an inference look documented. |
| C-002 | S1 | FIXED | "Commercial only." — the brief names a target *audience*, never a refusal of residential work. |
| C-003 | S2 | FIXED | "work we do every week" — an unsupported frequency claim. |
| C-004 | S1 | FIXED | A photography **shot list published on the client's public page**. Production documentation is not honesty; it is leaking the handoff. |
| C-005 | S1 | TRACKED | 28 further claims outrun the brief. Tracked in `spikes/refero-baseline/CLAIMS.md`, five marked blocking (insurance, licensing, staffing structure). |
| C-006 | S2 | FIXED | A source comment asserted "every value here is stated in the brief" while two values were inferred. |

**Rule adopted:** every generated claim not traceable to intake goes in a claims
register with a confirm/remove decision. Generated copy for a real business is
not free text — it is an assertion someone has to stand behind.

---

## DESIGN — the design contract itself

| ID | Sev | Status | Issue |
|---|---|---|---|
| D-001 | S3 | DOCUMENTED | *"Soft for people, sharp for data"* is **post-rationalised**. It does not describe the page: coverage cards are rounded as "content", but service entries, process steps and FAQ are content too and are sharp. The geometry works; the stated rule is not what produced it. Recorded in `DESIGN.md` §13. |
| D-002 | S2 | FIXED | The **loudest device carried the least evidence** — a full-bleed accent band holding four adjectives any contractor could claim. Now carries the mechanism behind them. |
| D-003 | S2 | FIXED | The mono annotation layer was over-applied — it spread from technical data into navigation, prose, coverage rows and the footer, reading as software-company costume. Prose returned to the sans. |
| D-004 | S2 | FIXED | The stylesheet claimed "no invented scalar" while containing 9× `1px`, `7px`, `13ch`, `44px`, `34px` and more. Refero supplies a vocabulary, **not a layout**; composition scalars are the build's own. |
| D-005 | S2 | FIXED | Navigation **vanished entirely below 960px** with nothing replacing it. Now wraps to a scrollable second row. |
| D-006 | S2 | FIXED | The most important values on the page — phone and email — were shrunk hardest on mobile (30px → 16px). |
| D-007 | S2 | FIXED | The brief explicitly asked the designer to *"recommend the site structure/pages"*. The first build delivered a single page and no recommendation. See `SITE-STRUCTURE.md`. |
| D-008 | S2 | FIXED | Six commercially necessary sections were missing: buyer situations, what you receive, commercial qualification, project imagery, who you're dealing with, and an FAQ covering what commercial buyers actually screen on. |

---

## REPO — repository and integration state

Opened 2026-09-01 by the repository-state sweep (`main` at `cb26ae9`). Findings
about branches, PRs, CI, and worktrees rather than the engine. Same status and
severity vocabulary as above. `main` itself was green on that date: 1275 Vitest
tests, typecheck, lint with 0 errors, `test:smoke`.

| ID | Sev | Status | Issue | Evidence |
|---|---|---|---|---|
| REPO-001 | S2 | **FIXED** | PR #17 (`codex/onebox-review-evidence-ui`, head `0e806a0`) fails the CI `verify` job: the rendered Page IR step's `test:e2e:intake` times out after 30 s waiting for `getByRole('button', { name: 'Edit prompt and settings' })`. The PR body reports every local gate as passed. | `scripts/e2e/intake-upload.mjs:663`; Actions run 32935846188 |
| REPO-002 | S3 | **FIXED** | Six ESLint warnings on `main`: unused `tokens` (`spikes/layout-ir/compile.mjs:467`); unused `useEffect` (`src/components/EvidenceWorkspace.tsx:4`); `<img>` in `src/components/preview/AssistantPanel.tsx:273`; two unused `eslint-disable` directives and unused `asOptionalString` in `src/lib/tools/refero.ts:75,77,250`. | `npm run lint` on `cb26ae9` |
| REPO-003 | S3 | **FIXED** | `npm run test:smoke` emits `MODULE_TYPELESS_PACKAGE_JSON`: Node reparses `src/lib/tools/maps.ts` as ESM because the smoke harness loads a TypeScript source through a typeless package. Harmless today; it buries real module warnings. | `scripts/smoke/gates-smoke.mjs` output on `cb26ae9` |
| REPO-004 | S2 | OPEN | Lineage B (PR #17) and lineage C (`research/la-appointment-field-study`) conflict: a read-only `git merge-tree` reports a content conflict in `package.json`; both also edit `src/lib/contracts.ts`, `src/lib/contracts.test.ts`, `README.md`, and `docs/architecture/README.md`. Neither branch references the other. | `git merge-tree --write-tree origin/codex/onebox-review-evidence-ui research/la-appointment-field-study` exit 1 |
| REPO-005 | S2 | **FIXED** | Unpushed work: `research/la-appointment-field-study` is 9 commits ahead of `origin` (OBX-P180 planning closure, T01, T02). `docs/studio-consolidation-plan` (this board and the consolidation plan) existed only on one machine until this sweep. | `git branch -vv`, 2026-09-01 |
| REPO-006 | S3 | **FIXED** | Four local branches are fully landed by the PR #15 squash and hold no unlanded work: `feat/ui-overhaul-linear` (tip `3f5ecda` equals the PR #15 head), `spike/refero-baseline`, `spike/layout-ir`, `fix/pause-status-pulse-when-hidden` (all ancestors of `3f5ecda`). Squash merges hide this from `git branch --merged`; deletion needs `-D`. | `git merge-base --is-ancestor <tip> 3f5ecda` |
| REPO-007 | S2 | **FIXED** | `~/projects/one-box-worktrees/obx-p180-t03-t05-offline-wave-recovery` carries uncommitted drafts of the two OBX-P180 verifier scripts whose bytes differ from the pushed checkpoint `1c39259` (file mtimes 13:36 and 13:41 on 2026-09-01; the checkpoint was cut at 15:47). The four JSON records match. An agent that resumes from that worktree starts from superseded code. | SHA-256 of `scripts/verify-plan-authority.node.mjs` and `scripts/verify-p180-phase1-terminal-correction-authorization.mjs` in the worktree vs `git show 1c39259:<path>` |
| REPO-008 | S3 | DOCUMENTED | The 2026-08-20 board's first item (DEF-1, publish before gates) was already fixed on `main` by OBX-012 (`status: verified`, PR #16) before the board reached `main`. The board was written on a branch two commits behind `main`, so its line references had also moved. | `docs/tickets/page-ir-safe-pipeline/OBX-012-gate-before-publish.md`; PR #16 |
| REPO-009 | S1 | TRACKED | The OBX-P180 terminal verifier has five open independent-review findings (AST scanner bypass, resealable immutable history, fail-open expiry, reads after a rejected file type, malformed proof rows that throw) plus `SEC-001` and `SEC-002` from the `-002` security gate. Tracked in the goal state; not duplicated here. | `task-6-final-review.md` in the Codex terminal worktree; `~/.claude/goal-state/obx-p180-t03-t05-offline-wave/summary.md` |
| REPO-010 | S1 | **FIXED** | `npm run verify:plans` (CI job "Verify plan authority and traceability" on lineage C) fails on every fresh checkout: `OBX-AUTH-P180-T01-SOLO-001` and `-T02-SOLO-001` pin `preExistingUntrackedBaseline` to the untracked protected handoff `.claude/handoffs/one-box-operating-environment-next-phase.md`, and `scripts/verify-plan-authority.mjs:609` enforces that hash in every mode. CI can never hold that file. First observed on PR #19 run 33591356178 (fails in 10s, before tests run). Fix belongs inside OBX-P180 verifier authority: enforce the untracked baseline only in solo-local modes and report it as skipped under `GITHUB_ACTIONS`. | PR #19 run 33591356178; `scripts/verify-plan-authority.mjs:609`; `scoped-implementation-authorizations.json` T01/T02 `preExistingUntrackedBaseline` |
| REPO-011 | S1 | **FIXED** | `npm test` fails on lineage C: `scripts/eval/obx-p180-contract-fixtures.test.mjs` is a `node:test` file, but the repo has no Vitest config, so Vitest's default include glob loads it and reports "No test suite found in file" (1 suite failed, 1399 passed). Its 18 assertions run in no npm script either; every other node-test file uses the `.node.mjs` suffix. The file is a frozen T01 artifact with a pinned digest, so renaming it means amending an immutable record. Preferred fix: add a Vitest config that scopes `include` to `src/**`, leaving the frozen file untouched. | 62b7b74; `npx vitest run scripts/eval/obx-p180-contract-fixtures.test.mjs` exit 1 on 2026-09-01; independent review on PR #19 |
| REPO-012 | S2 | OPEN | Lineage C code paths outside every authorization record: `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/feature.yml`, `package.json` (commit `9d4ddfd`); `scripts/eval/grok-audit.mjs` edited in `8587256` then retro-frozen in T01; three unwired source-adoption scripts added in `62b7b74` (`scripts/eval/obx-p180-source-adoption-fixtures.mjs`, `...-fixtures.node.mjs`, `scripts/verify-obx-p180-source-adoption.mjs`) that no npm script or CI job runs. The manifest's own governing rule says proposed artifacts cannot authorize implementation, so the code and the authority record disagree. Resolution: record explicit exceptions in `scoped-implementation-authorizations.json`, and wire or delete the three scripts. | Independent review on PR #19; `authority-manifest.json` `engineering-operating-system` domain (`authorityClass: proposed`) |
| REPO-013 | S1 | OPEN | `OBX-AUTH-P180-T01-SOLO-001` and `-T02-SOLO-001` are non-renewable and expire on 2026-09-14 (`renewable: false` at `scoped-implementation-authorizations.json:396` and `:631`; `expiresAt` `2026-09-14T13:33:33Z` at `:395` and `2026-09-14T21:47:59Z` at `:630`). `scripts/verify-plan-authority.mjs:697` fails the whole run with "authorization is expired" once the clock passes either value, and `:563` pins the window to exactly 336 hours, so no record may be written with a longer one. The CI job "Verify plan authority and traceability" runs `verify:plans` first on every PR, so from 2026-09-14 every PR to `main` blocks. Retiring an expired record means either editing an immutable record — which invalidates its own `authorizationHash` and the three byte-pinned T01 receipts — or teaching the verifier an expired-archived status, which changes what the frozen records mean. Owner decision D-2 in the `one-box-gauntlet-r1` run. | `docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json:394-396`, `:629-631`; `scripts/verify-plan-authority.mjs:693 (record) and :563 (amendment)`, `:689-697`; `.github/workflows/ci.yml` plan-authority job; `~/.claude/goal-state/one-box-gauntlet-r1/decisions.json` D-2 |
| REPO-014 | S1 | **FIXED** | `scripts/verify-r1-phase-authorization.mjs` `validatePredecessorGate` fails a `PENDING_PREDECESSOR_MERGE` binding whenever any path in `OBX-AUTH-R1-P2-SOLO-001.predecessorBinding.expectedAbsentFiles` exists in the working tree. Those eight paths are exactly the files the live `OBX-AUTH-R1-P1-SOLO-001` record authorizes P1 to create, so every P1 feature branch fails `GITHUB_ACTIONS=true npm run verify:plans` and `npm run test:plans` the moment it does its authorized work: the gate reads P1 succeeding as P2's binding being stale. Observed on `wave-2/p1` at `05fe84c` with `src/lib/releaseLifecycle.ts` and `src/lib/releaseLifecycle.test.ts` present: 2 `FAIL` lines from `verify:plans` and 9 failing node tests. Fix: while the predecessor record is present, unexpired and authorizing implementation, the gate tolerates the predecessor's declared files either way and instead refuses a path only the pending record authorizes that did not exist at `4b02f75f`, or an `OBX-P210` child ticket in the program manifest. Neither registry record changed. | `wave-2/p1` at `05fe84c`; `scripts/verify-r1-phase-authorization.mjs` `validatePredecessorGate`; `scripts/verify-plan-authority.node.mjs` "a pending predecessor tolerates the predecessor's own declared files"; re-pin `docs/audits/evidence/security/2026-09-02-release-1-p2-gate-authority-repin.json` |

### Resolutions — 2026-09-02

- **Wave 0 of `one-box-gauntlet-r1` landed the three EOS gap-register
  records.** EOS-001 (one discoverable authority chain):
  `docs/audits/evidence/goal/2026-09-02-eos-001-authority-chain-on-main.md`,
  which also found and fixed the last label residue —
  `docs/plans/one-box-master/02-canvas/index.md` listed the 2026-08-13 Refero
  editor requirements under "Canonical sources" while
  `docs/plans/one-box-master/00-authority/plan-register.md:36` files them under
  "Supporting and historical plans". EOS-003 (measurable outcomes):
  `docs/audits/2026-09-02-release-1-outcome-baseline.md`, eight outcomes with
  the instrument named for each; every one reads "Not yet measurable", because
  no numeric baseline exists yet. EOS-004 (program board):
  `docs/audits/evidence/goal/2026-09-02-eos-004-program-board-confirmation.md`,
  a confirmation rather than a manifest change — the four wave-2 parents are
  already listed in full, and `humanAssignments.status: unassigned-blocking`
  keeps every one of them out of `ready`. The two packet-document edits the
  wave made are re-pinned once in
  `docs/audits/evidence/security/2026-09-02-wave-0-authority-repin.json`
  (packet `6abc2156…` → `48999a43…`), which supersedes the ci-oracle re-pin.
- **REPO-002:** all six warnings cleared — the unused `tokens` and
  `useEffect` symbols and the unused `asOptionalString` helper removed, the
  two unused `eslint-disable` directives in `src/lib/tools/refero.ts` removed,
  and the `<img>` in `src/components/preview/AssistantPanel.tsx` kept as-is
  (a local run-artifact thumbnail served by the guarded `/api/sites` route,
  same justification `EvidenceWorkspace.tsx` already uses, where `next/image`
  would change runtime behavior) with a scoped, justified
  `eslint-disable-next-line @next/next/no-img-element`. `npm run lint`: 0
  errors, 0 warnings.
- **REPO-003:** `scripts/smoke/gates-smoke.mjs` and
  `scripts/smoke/scan-filter-smoke.mjs` add a `load` hook that declares
  `.ts` files as `module-typescript` up front, so Node no longer guesses
  CommonJS first and reparses as ESM. `npm run test:smoke 2>&1 | grep -c
  MODULE_TYPELESS_PACKAGE_JSON` reports 0.
- **REPO-010:** `scripts/verify-plan-authority.mjs` keeps the exact
  `preExistingUntrackedBaseline` record binding in every mode and skips only the
  local file read when `GITHUB_ACTIONS=true`, announced on stdout as `NOTE`. The
  node test copies the baseline only when present and covers the absent, drifted,
  and CI cases; the CI-mode record-binding assertion forces `GITHUB_ACTIONS=true`
  itself (independent review finding on PR #19). Packet digest and T02 receipt
  target hashes re-pinned per
  `docs/audits/evidence/security/2026-09-02-obx-p180-ci-oracle-authority-repin.json`.
  On a machine that does not hold the baseline run
  `GITHUB_ACTIONS=true npm run test:plans`.
- **REPO-011:** `vitest.config.ts` scopes `include` to
  `src/**/*.{test,spec}.?(c|m)[jt]s?(x)`; 1399 tests pass and the frozen
  `scripts/eval/obx-p180-contract-fixtures.test.mjs` is untouched.
- **REPO-012 (still OPEN, annotated):** left open by W0.0 on purpose. The T01
  verifier freezes the authorization record list to exactly three ids and T01/T02
  pin `package.json` by hash, so recording exceptions needs the EOS-001
  authority-chain mechanism. `obx-p180-source-adoption-fixtures.node.mjs` already
  matches the `test:eval` glob. `scripts/verify-obx-p180-source-adoption.mjs`
  still runs nowhere, and since W0.0 it fails: lines 128-139 hard-code the
  2026-08-31 re-pin record and assert its `currentAuthorityManifest` and
  `refreshedT02SecurityReceipt` digests against the live files, which the
  2026-09-02 re-pin moved. Re-point it at the newest
  `obx-p180-authority-repin-review-v1` record (or add a `supersededBy` pointer
  to the 2026-08-31 record) before wiring it; do not wire it red. Re-pin
  checklist addition: grep for scripts that assert a prior re-pin record before
  refreshing any digest.

- **Wave 2 of `one-box-gauntlet-r1` landed the release-1 P1 and P2
  implementation authority.** Records `OBX-AUTH-R1-P1-SOLO-001` and
  `OBX-AUTH-R1-P2-SOLO-001` (`owner-solo-phase-exception-v3`) join the scoped
  registry behind the three frozen records, which stay byte-identical. Their
  risk-exception amendments are
  `docs/governance/risk-exceptions/2026-09-02-release-1-p1-solo.json` and
  `-p2-solo.json`; the owner's packet acceptance is
  `docs/governance/acceptances/2026-09-02-release-1-packet-acceptance.json`,
  which moves the `release-1` and `compatibility` domains to `owner-approved`
  with every grant withheld. The phase scopes are written out in
  `docs/plans/2026-09-02-release-1-p1-lifecycle-authorization-design.md` and
  `docs/plans/2026-09-02-release-1-p2-canvas-approval-authorization-design.md`.
  A new module, `scripts/verify-r1-phase-authorization.mjs`, validates every
  phase record on each `verify:plans` run;
  `scripts/verify-plan-authority.mjs` now requires the first three registry ids
  exactly and in order and pattern-matches later ones, and
  `scripts/verify-plan-authority.node.mjs` adds 27 tests, 26 negative and 1
  positive (88 at origin/main, 115 total). Evidence: security receipts
  `docs/audits/evidence/security/2026-09-02-release-1-p1-solo-authorization-security-review.json`
  and `-p2-`, Grok 4.6 model receipts
  `docs/audits/grok-4.6/2026-09-02-release-1-p1-authorization-audit.json` and
  `-p2-` with their raw audits. The audit of the merge and re-pin themselves,
  `docs/audits/grok-4.6/2026-09-02-wave-2-integration.json`, cannot exist in the
  tree it reads, so it lands one commit later, together with the corrections its
  findings asked for; it is not in the tree that carries this ledger entry. The
  merge with wave 0 re-pins the packet once (`67623504…` → `61afa7b8…`) in
  `docs/audits/evidence/security/2026-09-02-release-1-wave2-authority-repin.json`,
  which supersedes the wave-0 re-pin. No ticket status moved and REPO-013 still
  bounds the effective window at 2026-09-14.

- **REPO-014 (predecessor gate):** `validatePredecessorGate` treated every
  declared predecessor file as a file that must be absent, so
  `OBX-AUTH-R1-P2-SOLO-001` raised `predecessor-phase-not-merged` as soon as
  `OBX-AUTH-R1-P1-SOLO-001` created a file it is authorized to create, and every
  P1 branch turned `verify:plans` and `test:plans` red. `expectedAbsentFiles`
  now records what was absent when the record was written and its shape is still
  checked, but presence in the current tree is no longer a failure while the
  predecessor record is present, unexpired and authorizing implementation. What
  the gate refuses instead is the pending phase's own work appearing first: any
  path `OBX-AUTH-R1-P2-SOLO-001` authorizes that no P1 ticket scope names and
  that does not exist at `4b02f75f`. The thirteen such paths that do exist there
  are pinned in the module as `P2_PRE_EXISTING_PHASE_ONLY_PATHS`, each required
  to be phase-only and to still exist, so an early P2 file cannot pass itself off
  as pre-existing. A predecessor that no longer authorizes implementation is now
  refused as well; the checkpoint-commit, file-list, child-ticket, missing and
  expired refusals and the `COMPLETED_VERIFIED` branch are unchanged. Both
  registry records stay byte-identical to `origin/main`, `expectedAbsentFiles`
  included. `scripts/verify-plan-authority.node.mjs` replaces the test that
  encoded the defect with a positive test that creates all eight declared P1
  files and requires the full verifier to pass, plus four negative tests (119
  tests, 115 before). Both phase security receipts and both Grok 4.6 wrapper
  receipts are regenerated because they hash the module; the audits ran at
  `ea2eccb` over the same thirteen-file slice and returned CLEAN. The packet is
  re-pinned once (`61afa7b8…` → `d3178d00…`) in
  `docs/audits/evidence/security/2026-09-02-release-1-p2-gate-authority-repin.json`,
  which supersedes the wave-2 re-pin.

### Resolutions — 2026-09-01

- **REPO-001:** root cause was PR #17 commit `7d2e7f9`, which made the guided
  pipeline view the default while `scripts/e2e/intake-upload.mjs` and
  `scripts/e2e/rollout-observability.mjs` assert developer-timeline elements that
  only `RunTimeline` renders; the guided view renders from server-side run state
  the mocked runs do not have. Both scenarios now open `view=developer` (PR #17
  head `3643ee5`). CI run 33573249461 passed every step. Gap left open: the
  guided view's own recovery control ("Start a clean retry") has no e2e coverage.
- **REPO-005:** `research/la-appointment-field-study` fast-forwarded on origin
  (`b6486fd..62b7b74`). The board and consolidation plan are in PR #18.
- **REPO-006:** the four landed branches were deleted after a fresh ancestry
  re-check against the PR #15 head. Owner-authorized.
- **REPO-007:** the six drafts are archived under
  `~/Backups/one-box/obx-p180-recovery-drafts-20260901/` with a `SHA256SUMS`
  manifest; all six match `recoveredFileHashes` in the goal-state `state.json`.
  The worktree is clean at `c09dfd0` / tree `ab07eb0`. See PROC-006 for how the
  archive was almost lost.
- **Integration order (T-0, owner decision):** lineage A (PR #18) first, then
  lineage C in reviewed slices, then rebase lineage B (PR #17). Lineage C must
  land with true merge commits, never squash or rebase: the OBX-P180 program
  pins `62b7b74` and `c09dfd0` by SHA, and rewriting them would orphan every
  descendant branch and the pushed checkpoint. The first mergeable slice of C
  is `research/la-appointment-field-study` through `62b7b74`; the T03/T04
  lineage stays on its branches until the program's terminal gate passes.

## PROC — process failures

Recorded because they recur.

| ID | Issue | Countermeasure |
|---|---|---|
| PROC-001 | Reported "19 pairs, all pass" from a hand-list. Wrong. Then reported it again after a fix. Also wrong. | Never report a verification result from an artifact you assembled by hand. Extract it from the thing itself, and negative-test the extractor. |
| PROC-002 | Announced completion before external review, twice, on work that then failed review on checkable facts. | Treat "it renders and looks right" as the start of verification, not the end. |
| PROC-003 | Missed an explicit, written requirement in the brief (site structure recommendation) while building elaborate machinery around it. | Re-read the brief against the deliverable before declaring done, not just the parts that felt like the task. |
| PROC-004 | Deleted a client project that was not in git. Backup was taken first and verified — but the **first archive was silently corrupt** (a macOS `Icon\r` file broke the tar header) and would have been useless. | Verify a backup by listing and counting its contents before destroying the source. |
| PROC-005 | PR #17's body lists every gate as passed, including an e2e script, while the PR's own CI failed `test:e2e:intake` on the same head. The local claim covered a different e2e script than CI runs, and the CI result was not read before the claim. | The verification block names the exact commands CI runs; the CI status on the PR head is the claim, not a local run. |
| PROC-006 | Ran a worktree cleanup in the same command as its backup. The copy loop had silently copied nothing, because zsh does not word-split an unquoted variable, and the verification output (2 files instead of 8, empty manifest) was printed but not acted on before the removal ran. Two pinned draft files existed nowhere else; both were later reconstructed byte-exact from Codex session logs. | The destructive step is a separate command, issued only after reading the backup verification. Under zsh, split explicitly (an array or `${=VAR}`). Same lesson as PROC-004; it recurred. |

---

## Next

### OBX-023 — layout authority and explicit fallback boundary

- **Implemented:** immutable persisted `template-v1 | page-ir-v1` authority,
  rollout-gated Page IR creation, candidate provenance cross-binding, and
  fail-closed guards on the current template builder/pipeline and candidate
  inspection, recovery, promotion, and promoted-live reads.
- **Implemented:** a private durable, nonterminal fallback transaction claim
  reserves one exact child while the failed source remains unlinked. The source
  link commits only after the origin-bearing template child has complete,
  validated intake and claimed upload bytes; path/size/SHA and nonlink checks
  run before the claim and again before commit. Retries converge on the claim's
  child across every pre-link crash boundary.
- **Not included:** Page IR persistence/routing (OBX-024), fallback UI/API or
  environment flags (OBX-050), and Page IR editing (OBX-031).

1. Trial several more Refero style directions against the same frozen brief
   (`spikes/refero-baseline/BRIEF.md`) to test the convergence prediction in
   REF-001..007 — specifically whether different foundations produce genuinely
   different sites or the same synthesis tics.
2. Only after that, wire the validated approach into the engine and fix
   ENG-001..004.
