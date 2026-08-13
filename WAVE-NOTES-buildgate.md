# WAVE-NOTES — buildgate

Files owned: `templates/local-service/**`, `src/lib/builder.ts`, `src/lib/gates.ts`,
`scripts/smoke/gates-smoke.mjs`.

Status: `npx tsc --noEmit` is clean for both my files (zero errors). The smoke script
runs the real template through the real builder through the real Playwright gates and
passes — confirmed on repeated runs, including a second run with a reduced
`SkeletonSpec` (see "Bugs found and fixed" below). Every deviation and assumption I
made is listed below, honestly, because contracts.ts and the plan text left some of
these choices unspecified.

## How to run the proof

```
node scripts/smoke/gates-smoke.mjs
```
Must be run from the repo root (it resolves `sites/` off `process.cwd()`, same as
`runstate.ts`'s `REPO_ROOT = process.cwd()` — verified they agree, see "Integration
check" below). It builds a fiber-optic-installer fixture into `sites/smoke-fixture/`,
serves it on a throwaway local HTTP server, runs all 6 gates, and prints the reports.
Exit code is 1 if any blocking gate fails, 0 otherwise. It leaves `sites/smoke-fixture/`
on disk as a durable example of real builder output — harmless, but note `.gitignore`
does not currently exclude `sites/` (not my file to edit; flagging for whoever owns
repo hygiene).

You'll see one harmless stderr warning on every run:
`[MODULE_TYPELESS_PACKAGE_JSON] ... add "type": "module" to package.json`. That's
Node noting `package.json` has no `"type"` field — cosmetic, not an error, and fixing
it means touching `package.json`, which isn't in my file list.

## Real bugs found and fixed during this wave (not just design choices)

1. **Premature HTML-comment closure in `index.html.tpl`'s header doc-comment.** My
   first draft of the top-of-file explanatory comment illustrated the marker syntax
   inline, e.g. `<!-- SECTION:<id> --> ... <!-- /SECTION:<id> -->`, *inside* the outer
   `<!-- ... -->` doc-comment. HTML comments don't nest — the browser closes the outer
   comment at the *first* `-->` it sees, so everything from there to the intended end
   of the doc-comment leaked into the real DOM as parsed markup, including a stray,
   attribute-less `<section>` element. This showed up as an axe-core "region" (page
   content not contained by a landmark) violation — moderate severity, so it never
   actually failed the gate, but it was a real defect, not gate noise. Fixed by
   rewriting the doc-comment to describe the marker syntax in prose instead of
   reproducing it literally. Confirmed fixed: axe now reports zero violations, not
   just zero *blocking* ones.
2. **Nested-marker stripping bug in `builder.ts`'s `stripMarkedBlocks`.** `NAVLINK:*`
   markers live inside the `SECTION:nav` block. My first implementation used one
   regex pass with a `(SECTION|NAVLINK)` alternation and a backreference for the id.
   Because `String.replace` with a global regex does a single non-overlapping
   left-to-right scan, the outer `SECTION:nav` match consumed the *entire* nav block
   — NAVLINK markers included — as one opaque "inner" capture before the regex ever
   got a chance to match them individually. Since nav is always enabled, that inner
   blob was returned verbatim, un-stripped, and disabled sections' nav links (e.g. a
   `href="#why-us"` when the why-us section was gated off) were never removed. This
   was caught by gate (d) itself when I built a second fixture with a reduced
   `SkeletonSpec` — `assets` correctly failed with "internal anchor href=\"#why-us\"
   has no matching id", proving the gate does real work. Fixed by resolving NAVLINK
   markers in their own pass before SECTION markers. Re-verified: a `SkeletonSpec`
   with only `services` now correctly renders `nav`/`hero`/`services`/`contact`/
   `footer`, correctly omits `trust-bar`/`why-us`/`reviews`/`service-area`, correctly
   strips the matching nav links, leaves no dangling `#anchor`, leaves no unresolved
   `{{...}}` placeholders, and passes all 6 gates.
3. **Gate-timing race between CSS scroll-reveal and axe's color-contrast check.**
   `reveal.js` fades `[data-reveal]` nodes in via a 600ms CSS `opacity` transition
   once `IntersectionObserver` fires. In the very first smoke run, `axe` caught a
   *serious* `color-contrast` violation on 3 nodes; on every later run (including
   several file:// and http:// reproductions with a settle delay) it didn't reproduce
   — a classic sign axe sometimes evaluated the page mid-fade, when text was rendered
   at partial opacity and therefore at genuinely (if transiently) lower contrast.
   Rather than paper over this with a guessed fixed-duration wait (fragile — motion
   durations are per-run DesignTokens, not a constant), I made `gates.ts`'s shared
   `withPage` helper create its browser context with `{ reducedMotion: "reduce" }`.
   `reveal.js` already has a `prefers-reduced-motion` branch that shows every
   `[data-reveal]` node at its final state synchronously with no transition (see
   `reveal.js`) — this makes the content-integrity gates (token-drift, axe,
   console-errors, assets, perf-budget) always evaluate the settled page,
   deterministically, regardless of any run's `motion.durationMs`. The `no-js` gate is
   unaffected (JS is off there, motion is moot). Confirmed stable across many repeat
   runs after the fix; zero flakes.

## Deviations from the literal task text (all necessary, all documented here)

1. **`buildSite`'s options object includes a required `intake: Intake` field**, not
   present in the task prompt's illustrative signature
   (`buildSite({runId, tokens, skeleton, copy, assets})`). Reason: `src/lib/pipeline.ts`
   already exists (written by a concurrent wave) and calls
   `buildSite({ runId, intake, tokens, skeleton, copy, assets })` — always passing
   `intake`. I matched the real caller rather than the prompt's shorthand, since (a)
   it's the only source of "ONLY intake-provided facts" for JSON-LD (the task's own
   requirement), and (b) breaking the real integration point in favor of the prompt's
   abbreviated pseudocode would be strictly worse. `npx tsc --noEmit` confirms
   `pipeline.ts`'s call site type-checks cleanly against my `BuildSiteInput`.
2. **No import from `./runstate`.** That module didn't exist when I started this file
   (it does now — another wave landed it mid-session). `builder.ts`/`gates.ts` compute
   `sites/<runId>/...` paths locally instead of importing `sitePaths()`. I re-verified
   after `runstate.ts` landed: its `REPO_ROOT = process.cwd()` and its `sitePaths()`
   math are byte-identical to mine, so there's no behavioral drift — just a small,
   deliberate amount of duplicated path arithmetic (a few lines) in exchange for
   `builder.ts`/`gates.ts` working completely standalone, which is exactly what let
   `scripts/smoke/gates-smoke.mjs` run and prove itself without depending on another
   wave's build order. I did not go back and wire in the now-available `./runstate`
   import — the code is proven correct and switching now would only add risk for a
   readability win, not a correctness one (Surgical Changes).
3. **Node-vs-tsc extension conflict, resolved with an in-script loader hook.**
   `tsconfig.json` uses `moduleResolution: "bundler"`, under which `tsc` *rejects* a
   `.ts` extension in relative import specifiers (`TS5097`) — and the rest of the
   codebase (`pipeline.ts`, the API routes) already imports its `src/lib/*` siblings
   extensionlessly (`from "./runstate"`, `from "./gates"`, etc.), so `builder.ts` and
   `gates.ts` do the same for consistency. But Node's native TypeScript execution
   (this machine: Node v26.5.0, unflagged type-stripping) never guesses extensions for
   relative specifiers — extensionless imports fail at runtime with
   `ERR_MODULE_NOT_FOUND` (verified empirically, including that a `.js`-extension
   NodeNext-style specifier does *not* get remapped to a sibling `.ts` file by
   default). Since `scripts/smoke/gates-smoke.mjs` must import `builder.ts`/`gates.ts`
   directly under plain `node` (bullet 4's explicit "RUN IT"), I registered a small
   resolution hook via the non-deprecated `node:module` `registerHooks()` API, entirely
   inside `gates-smoke.mjs` (no new file, no new dependency): on a failed relative,
   extensionless specifier, it retries once with `.ts` appended. This only ever
   activates after normal resolution has already failed, so it can't mask a real
   missing-module error under any other circumstance. This is scoped to the smoke
   script; it has no effect on `tsc` or on Next.js's own bundler-based resolution at
   build/dev time.
4. **`runGates`'s `afterEdit: true` path runs only `token-drift` and `axe`**, not the
   full 6-gate suite. The plan's amendment B8 says "Token lint + axe re-run after
   every edit — gates are invariants, not build-time stamps," naming exactly these two
   by name for the post-edit path; `src/app/api/edit/route.ts` (another wave's file)
   already calls `runGates(runId, { afterEdit: true })` and only reads back
   `{gate, pass, blocking}` per report, which is compatible with either a 2-gate or
   6-gate result set. I chose the narrower 2-gate interpretation to match B8's literal
   wording and keep post-edit latency low; if the full suite is wanted after edits
   too, this is a one-line change in `gates.ts`'s `gateNames` ternary.

## Conventions I had to invent (contracts.ts leaves these open by design)

`DesignTokensSchema` and `CopyDocSchema` are intentionally free-form (arbitrary
`cssVar` strings, arbitrary `Record<string,string>` section/field maps) — they don't
by themselves define a naming contract a *frozen, hand-authored* `site.css` can
depend on. I had to pick one. It's documented at the top of
`templates/local-service/tokens.css.tpl` and repeated here so it's in one place a
future synthesis-stage author can find:

- **CSS custom-property names** `site.css` expects, which `DesignTokens` entries must
  supply via their own `cssVar` field to actually take effect (colors: `--color-bg`,
  `--color-surface`, `--color-surface-alt`, `--color-text`, `--color-text-muted`,
  `--color-primary`, `--color-primary-contrast`, `--color-border`, `--color-accent`;
  fonts: `--font-display`, `--font-body`; type scale, one per role: `--text-caption`,
  `--text-body-sm`, `--text-body`, `--text-body-lg`, `--text-subheading`,
  `--text-heading-sm`, `--text-heading`, `--text-heading-lg`, `--text-display`).
  `radii`/`spacing` keys become `--radius-<key>`/`--space-<key>` directly (my smoke
  fixture uses `sm/md/lg/pill` and `xs/sm/md/lg/xl/2xl/3xl`). `layout`/`motion` have no
  per-entry `cssVar` in the schema at all, so I fixed their names outright:
  `--layout-max-width`, `--layout-section-gap`, `--layout-card-padding`,
  `--motion-ease`, `--motion-duration-micro`, `--motion-duration-reveal`.
  **Consequence if a future DesignTokens producer uses different `cssVar` names:**
  nothing crashes — `builder.ts` faithfully writes whatever `cssVar` it's given into
  `tokens.css` — but `site.css`'s rules referencing the *expected* name will fall back
  to the browser default, and `gates.ts`'s token-drift gate will correctly catch the
  resulting mismatch (computed color won't trace to any value in `tokens.css`).
- **`CopyDoc` numbered-item key convention**, since the schema has no native array
  type inside a section: repeatable content uses `"<prefix>-<n>-<part>"` (or
  `"<prefix>-<n>"` for single-part lists), 1-indexed, contiguous, first gap ends the
  list. Trust bar: `stat-<n>-value`/`stat-<n>-label`. Services/reviews cards:
  `card-<n>-title`/`card-<n>-body` (services) or `card-<n>-quote`/`card-<n>-author`
  (reviews). Why-us: `point-<n>-title`/`point-<n>-body`. Service area: `area-<n>`
  (single-part). If a section's copy has zero numbered entries, that list renders
  empty (an empty `<ul>`) rather than fabricating placeholder content — a graceful
  degrade, not a crash.
- **`data-edit-id` naming**: exactly `section.element`, one dot, matching the task's
  own examples (`hero.headline`, `hero.image`). For repeatable items the element part
  is `<prefix>-<n>-<part>` (e.g. `data-edit-id="services.card-2-title"`), still one
  dot total. The `CopyDoc` field key convention above was deliberately made identical
  to the `data-edit-id` element part so `builder.ts` does a direct, untransformed
  lookup — no separate mapping table to keep in sync.
- **`hero.image` is one editable node covering the whole media block** (the `<img>`
  or, when no `heroImagePath` is supplied, a CSS gradient placeholder `<div>`), not a
  separately-editable alt-text node — matches the task's own example
  (`hero.headline, hero.sub, hero.cta, hero.image`) and makes sense for an
  image-intent edit (you regenerate the image, you don't hand-type new alt text).
- **`motion.revealClasses` is accepted but not wired into which template nodes get
  `data-reveal`.** Confirmed from `pipeline.ts`'s own `renderDesignMd` that this field
  is DESIGN.md-documentation-only in the actual pipeline (`t.motion.revealClasses.join(", ")`
  — never consumed to control template rendering anywhere else) — so the frozen
  template's own fixed set of `[data-reveal]` nodes (hero content, trust-bar, every
  card/point in services/why-us/reviews, the service-area copy block and map
  placeholder, the contact band) is authoritative, not this field.
- **Phone number fallback chain**: `intake.phone` (required by "ONLY intake-provided
  facts" spirit) → `copy.sections.nav.phone` → `.contact.phone` → `.footer.phone` →
  none. If truly absent everywhere, `tel:` hrefs degrade to `#contact` (a safe in-page
  anchor, not a fabricated number) and the displayed phone text is just whatever
  (possibly empty) copy provided — never invented.
- **JSON-LD LocalBusiness** is built from `intake` only (`name`, `telephone` if a
  phone resolved, `areaServed` from `intake.serviceArea ?? intake.location`,
  `makesOffer` from `intake.services`) — never from copy, since copy is
  model-generated prose and the task requires "ONLY intake-provided facts."
- **Structural/layout numbers with no matching token category** (CSS grid `minmax()`
  track widths, media-query breakpoints, `aspect-ratio`, transform distances, blur/
  outline offsets) stay as literal CSS values in `site.css` — there's no
  `DesignTokens` category for them, so "every color/font/size/space/radius through
  var(--*)" is honored for the categories that actually exist in the schema, and
  plain structural mechanics are left as ordinary CSS.
- **Service-area map placeholder always renders** (a bordered, decorative,
  `aria-label`led box — no real map, no external asset) rather than being
  conditionally gated on some inferred signal from `contentNeeds` free text; the task
  calls it "optional" for a *real* implementation, and an always-present lightweight
  placeholder is strictly simpler and needs no speculative parsing of prose.
- **Icons are CSS-drawn `currentColor` shapes** (a circle for phone, the classic
  border-radius teardrop for the map pin), not raster/SVG asset files — keeps
  `gates.ts`'s asset-resolution gate simple (nothing extra to 404) and keeps every
  pixel of color token-derived (icon `background: currentColor` inherits from a
  token-set `color`, so it can never introduce an untracked raw color).

## Gate implementation notes

- **token-drift** parses `tokens.css` for `--color-*`/`--font-*` declarations, builds
  an allowed set (hex → `rgb()`/`rgba()` normalized to match Chromium's
  `getComputedStyle` string format; functional `rgb()`/`rgba()` values pass through
  normalized; gradients/`hsl()` used as a color-role value aren't converted — out of
  scope for this prototype, noted rather than silently mishandled), then walks every
  element under `<body>` checking `.color`/`.backgroundColor`/`.fontFamily`.
- **assets** uses Playwright's own `response`/`requestfailed` listeners (matching the
  task's explicit "no 404 via response listener" instruction) rather than a
  filesystem existence check, since the smoke script — and, per the plan, the real API
  route eventually — always drives gates through a served `baseUrl`, where response
  listeners are fully reliable. `file://` fallback (no `baseUrl`) is supported too, on
  the same listeners; a missing local file surfaces via `requestfailed` there.
  Internal navigation is anchor-only (`#id`) for this single-page template, checked by
  DOM presence, not network. `tel:` links are cross-checked against `intake.json`'s
  `phone` when that artifact exists at `sites/<runId>/intake.json`
  (`ARTIFACTS.intake`); if it's missing (e.g. a bare template-only build with no
  pipeline run), the check degrades to informational rather than failing the gate.
- **perf-budget** is genuinely advisory: `pass` reflects the three numeric budgets
  (900KB transfer / 500KB image bytes / 2000ms DOMContentLoaded at 4x CPU throttle
  via CDP `Emulation.setCPUThrottlingRate`), but `blocking` is always `false` and the
  actual numbers are always reported in `details`, win or lose.

## Minor things worth flagging

- `templates/local-service/site.css` is 471 lines and `src/lib/builder.ts` is 411 —
  both a bit over the "<400 lines" house guideline (well under the 800 hard max).
  `site.css` is a single stylesheet by explicit task design ("site.css (ALL
  styling...)" is named as one file in the spec); splitting it would contradict that.
  `builder.ts` is 11 lines over; I left it whole rather than fragmenting cohesive
  render logic across an extra file purely to hit a soft metric.
- The smoke script's own fixture reviewer "names" are role descriptors ("Austin
  homeowner", "Round Rock property manager"), never invented proper names — matching
  the template's own contract ("testimonial cards — content only from provided copy,
  never invented names").
- `sites/smoke-fixture/` (this wave's proof artifact) and any other `sites/<id>/`
  directories from other waves' concurrent runs are left on disk; I did not touch or
  delete anything under `sites/` other than what my own script wrote to
  `sites/smoke-fixture/`.
