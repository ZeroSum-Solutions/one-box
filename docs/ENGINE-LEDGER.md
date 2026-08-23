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

## PROC — process failures

Recorded because they recur.

| ID | Issue | Countermeasure |
|---|---|---|
| PROC-001 | Reported "19 pairs, all pass" from a hand-list. Wrong. Then reported it again after a fix. Also wrong. | Never report a verification result from an artifact you assembled by hand. Extract it from the thing itself, and negative-test the extractor. |
| PROC-002 | Announced completion before external review, twice, on work that then failed review on checkable facts. | Treat "it renders and looks right" as the start of verification, not the end. |
| PROC-003 | Missed an explicit, written requirement in the brief (site structure recommendation) while building elaborate machinery around it. | Re-read the brief against the deliverable before declaring done, not just the parts that felt like the task. |
| PROC-004 | Deleted a client project that was not in git. Backup was taken first and verified — but the **first archive was silently corrupt** (a macOS `Icon\r` file broke the tar header) and would have been useless. | Verify a backup by listing and counting its contents before destroying the source. |

---

## Next

1. Trial several more Refero style directions against the same frozen brief
   (`spikes/refero-baseline/BRIEF.md`) to test the convergence prediction in
   REF-001..007 — specifically whether different foundations produce genuinely
   different sites or the same synthesis tics.
2. Only after that, wire the validated approach into the engine and fix
   ENG-001..004.
