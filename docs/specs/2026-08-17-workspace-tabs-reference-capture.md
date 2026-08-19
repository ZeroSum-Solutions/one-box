# ONE BOX — workspace tabs, reference capture, image conditioning

- **Status:** DRAFT — awaiting owner approval. Do not run `/goal` against this until approved.
- **Branch:** `feat/ui-overhaul-linear`
- **Predecessor:** `docs/specs/2026-08-16-canvas-upgrade.md` (CLOSED — not reopened, not widened)
- **Planning method:** draft plan → adversarial review by GPT-5.6 Sol (high effort) →
  every finding verified against source → audit of the finding set itself by Grok 4.6 →
  every audit claim verified again. Two claims were refuted by the code and dropped; three
  changed the architecture. Adjudication table: `scratchpad/audit-adjudication.md`,
  reproduced in `docs/plans/` on approval.
  Implementation is verified by Gemini 3.7 Flash (high) as a second-model checker.

## Owner decisions on record

Asked and answered 2026-08-17, before any code:

1. **Tab model** — "Both: site/reference tabs now, page tabs later." A tab is either a
   generated run's canvas or a captured outside website. A per-site page switcher is a
   later pass inside that shell.
2. **Reference render** — "Both: screenshot first, HTML as an upgrade." Ship the
   screenshot + region-crop path end to end, then add single-file HTML behind the same
   panel where it works.
3. **Palette failure** — "One bounded re-ask, then fail." Name the violating pair back to
   the token model once; a second failure fails the tokens stage with no build spend.

## What the adversarial pass changed

Five findings survived verification and changed this plan. Two claims in the incoming
handoff were tested; one held and one did not.

| # | Finding | Verified how | Effect |
|---|---------|--------------|--------|
| F1 | `capture()` and `crawlSite()` take an unvalidated URL straight to `page.goto()` — a **pre-existing SSRF hole** on the live pipeline, not something Task 4 introduces | `src/lib/tools/capture.ts:34,73`; competitor URLs reach it unchecked at `src/lib/pipeline.ts:1298` | New Phase 0. Fixed first, on its own merits |
| F2 | `tailwind-theme.css` is **not** generated from `tokens.json` — it comes from human-**approved** evidence artifacts | `renderTailwindThemeCss(approvedInventory, approvedPlan)` at `src/lib/pipeline.ts:1047` | Task 2b reframed: repair must route back to approval, never model-patch |
| F3 | `GateReport` carries no source-file provenance, so "is this failure repairable" is not derivable | `GateReportSchema` at `src/lib/contracts.ts:1268-1274` — only `gate`/`pass`/`blocking`/`details`/`ranAt` | Needs a structured `repairTargets` field |
| F4 | A static palette-pairing table is the exact anti-pattern `contrastGate.ts` was built to replace | Its header: hand-listing pairs "audits your memory of the stylesheet, not the stylesheet" (`src/lib/contrastGate.ts:1-17`) | Task 2a redesigned to reuse the rendered gate |
| F5 | A reference attachment carries only the earlier image's **prompt text**, never bytes | `referenceItem?.prompt` interpolated at `src/app/api/edit/route.ts:170` | A capture crop needs a real import path, not the existing field |

**Handoff claim that held:** GPT Image 2 does accept image references. Live
`higgsfield model get gpt_image_2` reports
`image_references  array  —  use repeated --image-references (or --image)`.
Sol argued this was unsupported, citing `WAVE-NOTES-tools.md:119-127`; that note is
stale and the live check overrides it. Task 5's premise stands.

**Handoff claim that did not hold:** Task 5 is not a one-field addition.
`higgsfield generate cost` states "media flags match generate create. Local file paths
are auto-uploaded" — so putting `--image` in the shared `generationArgs()` would upload
the crop during what is documented as a *free* preflight. The two argument builders must
be split. `src/lib/imageLibrary.ts:36` also still advertises GPT Image 2 as
"prompt-based regeneration, not source-image editing", which is now false.

## Binding constraints (inherited)

- `DESIGN.md` — One-Box Midnight Instrument. One acid-lime action per view; nothing
  interactive over 34px except the composer textarea; 140ms state crossings; Switzer
  weights ≤ 590; errors structural, never chromatic (coral is action, not danger).
- `AGENTS.md` — surgical changes; no artifact fields outside `src/lib/contracts.ts`;
  never commit `sites/`, `.one-box/`, `.next/`, secrets; the generated-site structure
  comes from the frozen `templates/local-service/`.
- `docs/security/local-api-threat-model.md` — every new endpoint field validated at the
  boundary. The app never binds past loopback.
- **Audit P1 stays:** a build that fails a blocking gate is never published green. No
  gate is weakened to make a build pass.
- Every mutation to a generated site goes through `runGuardedMutation`
  (`src/lib/siteMutation.ts`). One funnel, still one funnel.
- The iframe protocol stays data-only and origin-checked. A new field means new
  validation, never a loosened `hasOnlyKeys`.

---

## Phase 0 — untrusted-content containment (security, prerequisite)

Fixes live holes and builds the primitives Task 4 cannot be safe without.

### Rejected architecture, recorded so it is not re-proposed

An earlier draft routed Chromium through a local `proxy-chain` server and pinned DNS
with `--host-resolver-rules="MAP <host> <ip>"`. **That design is inert.** Behind an HTTP
proxy the browser sends `CONNECT host:443` and the *proxy* resolves the name — Chromium's
resolver rules never fire, so the pin protects nothing. It also does not survive contact
with a real page: launch-time `MAP` knows one hostname, while a live page pulls CDNs,
fonts, consent frames and apex redirects that were never pre-resolved, so unmapped hosts
either bypass the pin or fail the capture. Pinning a single A record also defeats Happy
Eyeballs, turning one dead address into a false failure. Dropped.

### 0a — proportionate egress validation

ONE BOX is loopback-only, single-user, on a Mac. There is no instance-metadata service
and no remote caller. The realistic harm is a poisoned search result or hostile
competitor URL reaching the LAN — a router admin page, a NAS, CUPS, a dev database — and
landing in evidence, then in a model prompt, then possibly in a published site. That is
real and bounded, and it is addressed by validation rather than network isolation.

`src/lib/net/urlGuard.ts` — one validator, applied to **every** egress path (Playwright
captures, crawl, search, and any server-side `fetch`), not just the browser:

- `https:` only; reject credentials in the URL; ports 80/443 only
- reject literal addresses in loopback, RFC1918, CGNAT (`100.64/10`), link-local
  (`169.254/16`, `fe80::/10`), multicast, reserved, `0.0.0.0`, `::`, IPv4-mapped IPv6,
  and decimal/octal/hex integer encodings
- reject trailing-dot FQDNs and `*.local`
- resolve and validate **all** A/AAAA records, not the first
- re-validate the **final** `response.url` after redirects, and abort in `page.route()`
  on any request whose host fails the check — this covers subresources
- `--disable-quic`, WebRTC disabled, `file://` navigation blocked, no reused profile
  (so no persistent service worker)
- `request-filtering-agent` (MIT) supplies the same guarantee for ONE BOX's own Node
  fetches, where its socket-level check is the right tool

### 0b — untrusted content reaching the model

The higher-impact gap, missed by both earlier passes. Crawled markdown and captured
screenshots are third-party content that reaches an LLM which can write tokens, copy and
markup into a client site. A hostile page can carry instructions.

- Every crawled or captured artifact is fenced and labelled as untrusted data in any
  prompt that carries it, never merged into the instruction region.
- The existing edit guard already forbids an edit adding classes, ids, inline styles,
  scripts or new colours (`api/edit/route.ts:188`). That invariant is the backstop and is
  re-asserted with a test that feeds an injection string through the crawl path.
- Evidence approval stays a human gate. No model output derived from captured content
  may auto-approve a gate.

### 0c — resource bounds

Absent from every prior pass. Per capture: navigation timeout, total byte cap, max
concurrent captures, decoded-pixel cap. Per run: an evidence-directory disk quota.

### Success criteria

| id | criterion | verification |
|----|-----------|--------------|
| `S1` | Every private/link-local/loopback/CGNAT/mapped-IPv6/integer-encoded address is refused | one unit test per range, incl. `169.254.169.254`, `[::ffff:127.0.0.1]`, `2130706433` |
| `S2` | A redirect from a public host into a private one is refused | test server issuing 302 to `127.0.0.1`; asserts on final `response.url` |
| `S3` | A subresource pointing at a private host is aborted | fixture page loading `http://127.0.0.1/x.png`; `page.route` abort asserted |
| `S4` | Non-`https`, credentialed, and off-port URLs are refused | table test |
| `S5` | An injection string in crawled content cannot add a script, class or colour to a site | end-to-end test through the crawl path into `/api/edit` |
| `S6` | A capture exceeding the byte, time or pixel cap fails closed and cleans up | bounded fixture |
| `S7` | The existing competitor scan still captures public sites | `npm run test:smoke` exit 0 |

---

## Phase 1 — Task 2, close the token-pipeline thread

### 1a. Pre-build palette pairing check (F4-corrected)

**Not** a hand-maintained pairing table — `contrastGate.ts` exists precisely because
three hand-audits of one page produced three wrong answers. Instead: build a
deterministic fixture from the **frozen template** plus the **proposed tokens**, render
it, and run the existing gate. The stylesheet stays the single source of truth, so it
cannot drift from a table nobody remembered to update.

`src/lib/palettePreflight.ts` → `checkPalettePairings(tokens)`:
1. render `templates/local-service/` against the candidate palette into a temp dir
2. run the existing rendered contrast gate over it
3. return the failing pairs, named by CSS variable and measured ratio

Called in the tokens stage after `foldTokens`, **before** any build spend. On failure:
re-ask the token model once, naming the exact pair and ratio; if the second palette also
fails, fail the tokens stage. Owner decision 3.

**Bounded claim.** A fixture is still a stand-in, and the same header comment that kills
the static table applies here too: this preflight agrees with the real build only while
components, order and copy match. So it is scoped as a cheap early-out for
*palette-internal* failures — a pair that cannot work at any content — and it **never**
substitutes for the post-build rendered gate, which still runs and still blocks. Fixture
dirs get unique paths and are removed on crash.

### 1b. Repair reachability (F2/F3-corrected)

Patching `tailwind-theme.css` is unsound in both directions: patch the emitted sheet and
the next resume regenerates it from approved evidence and wipes the patch; patch the
evidence and you have silently mutated an artifact a human approved. So repair does not
learn to reach the theme sheet — it learns to **say so honestly**.

1. Add `repairTargets` to `GateReportSchema` as a **closed enum**
   (`"index.html" | "tokens.css" | "tailwind-theme.css" | "site.css"`), never free
   strings — a free-string path reaching a writer is path injection (`../`, absolute
   paths, approved evidence). Gates populate it; absent means unknown.
2. Before `claimBuildGateRepair`, decide repairability. If no failure has a target
   inside `{index.html, tokens.css}`, do **not** claim — fail with the reason and the
   route back to token/contract revision.
3. Fix the allowance lifecycle: today the claim is taken at `pipeline.ts:2401` before the
   file reads, and released only when `generateJson` throws (`:2415-2427`). An early
   return or a read failure burns the one repair, so a later resume can never claim it.
   Establish repairability *before* claiming, and release on every non-repair exit.
4. Record the `tokens.css` → `tailwind-theme.css` cascade order (`builder.ts:168-177`) as
   a known limitation: the theme redeclares `:root` semantic variables and wins, so a
   `tokens.css` repair for a semantic-token failure can have no rendered effect.

### 1c. One fresh generated run

Drive `/api/run` through stage 5 and confirm the new run carries section-level
`data-edit-id`s — the only real proof the canvas upgrade reaches new sites. Today only
`sites/smoke-fixture` has them.

### Success criteria

| id | criterion | verification |
|----|-----------|--------------|
| `T1` | The `primaryContrast #000` / `text #000` palette is refused before any build spend | unit test asserting the tokens stage fails with that pair named |
| `T2` | A healthy palette passes the preflight unchanged | unit test, no false failure |
| `T3` | The re-ask happens exactly once, then fails | test counting model calls |
| `T4` | A theme-sheet-only failure does not consume the repair allowance | test asserting `gateRepairAttempts` stays 0 and the error names the route back |
| `T5` | An `index.html`/`tokens.css` failure still repairs as today | existing behavior preserved |
| `T6` | A fresh run reaches stage 5 with section-level edit ids | count sections in the new run's `index.html` — must be > 0 |
| `T7` | No blocking gate was weakened | diff review of `src/lib/gates.ts` — audit P1 intact |

---

## Phase 2 — Task 3, workspace tabs

Owner decision 1: site tabs and reference tabs now; page tabs later.

Sol's F7 is correct that this is larger than one tab bar. Verified: selection, composer
draft, editor state, guardrail, reference attachment, gate refresh and iframe version are
one route-wide collection at `src/app/preview/[id]/page.tsx:71-111`, and the `[id]` effect
**destroys** them on route change (`:126-163`) rather than keeping a per-run map. Undo/redo
is local to `UndoRedoRail` (`:43-70`), server-backed. The iframe protocol assumes exactly
one frame: trust is `event.source === iframeRef.current.contentWindow`, and messages carry
no run identifier (`page.tsx:243-337`).

So the work is:
- lift per-run state into a keyed map (`Map<tabId, RunWorkspaceState>`)
- give the iframe protocol a run identifier and keep a frame registry, so a message from
  a background tab's frame can never be applied to the foreground run
- keep inactive frames mounted but hidden — unmounting loses `overlay.js`'s selection-climb
  and preview-draft state (`public/overlay.js:334-345,744-818`)
- per-tab async request/abort state, so an in-flight edit on tab A cannot land on tab B

**No state library.** A keyed `Map` plus the existing React 19 tree does this. Adding
`zustand` would be a tenth runtime dependency to avoid writing a map, against this repo's
own no-new-deps rule. Considered and dropped.

Tab bar sits above the canvas, left of the workbench rail. Reference tabs are visually
distinct from site tabs. Nothing exceeds 34px. The tool rail and composer scoping are
unchanged — that is the acceptance bar.

### Success criteria

| id | criterion | verification |
|----|-----------|--------------|
| `B1` | Two runs open at once, switching preserves each one's selection and composer draft | harness: type in A, switch to B, return, assert A's draft and selection intact |
| `B2` | An iframe message from a background tab never applies to the foreground run | unit test posting a message with a foreign run id — asserted ignored |
| `B3` | An in-flight edit on tab A lands on A after switching to B | harness with a delayed `/api/edit` |
| `B4` | All eight tools still work in every tab | existing `test:e2e:canvas-contract` extended per tab |
| `B5` | Composer selection scoping unchanged | existing tests still pass unmodified |

---

## Phase 3 — Task 4, reference capture

Owner decision 2: screenshot first, single-file HTML as an upgrade.

Depends on Phase 0. No live iframe — X-Frame-Options and CSP `frame-ancestors` refuse
most real sites, which is settled and not re-litigated here.

**3a — screenshot lane.** A reference tab takes a URL, captures through the guarded
egress proxy using the shipped `capture.ts` (1440 and 390, full page, 4000px cap,
cookie banners dismissed), and renders the image in the panel with pan/zoom. Drag a
rectangle; the crop is written to the run.

**3b — crop import (F5).** The existing `referenceAssetId` cannot carry this: it resolves
only against the run's own generated-image library and passes just the earlier item's
**prompt text** into the edit prompt (`src/app/api/edit/route.ts:170`). A crop needs a
bounded import: validated bytes, MIME + magic-number check, dimension and byte quotas,
run ownership, provenance recording the source URL and capture time, a catalog entry, a
safe run-relative path. This is a new contract surface and is specced as one, not
smuggled in as "the existing path".

**3c — HTML upgrade.** Owner decision 2 asked for single-file HTML as the upgrade lane.
The tool choice changed under audit:

- **SingleFile is AGPL-3.0.** Shelling out to it as a separate, unmodified process creates
  no copyleft obligation for ONE BOX — §13 covers the AGPL work being offered as a network
  service, which a local CLI is not — but it cannot be vendored or bundled, and any script
  SingleFile injects into the snapshot must be stripped before that HTML goes near a client
  deliverable.
- **`monolith` (CC0) and `obelisk` (MIT) are not substitutes.** Neither runs a browser, so
  a React or SPA competitor page saves as an empty shell. That is a capability cliff, not a
  polish gap. Recorded because the permissive licence made them look like a free swap.
- **Chosen:** inline assets with the Playwright instance this repo already runs. No new
  licence surface, no new binary, and the capture already has the live DOM. `shot-scraper`
  (Apache-2.0) is the honest sibling of this approach and confirms it is the normal path.

Rendered in a sandboxed iframe from loopback, DOM-node selection instead of rectangle
drag. Behind the same panel, after 3a is proven.

**3d — provenance and use gate.** A captured competitor page is someone else's
copyrighted work, and this product's output is a paid client website. Neither earlier pass
raised it. Every capture records its source URL, capture time and a use-scope marker; a
crop is usable as *style direction* for generation, and the UI says so. Wholesale
reproduction of a captured layout into a client site is out of scope for this spec and
flagged to the owner as a product-policy decision, not an engineering one.

Every resulting site change still goes through `runGuardedMutation`.

### Success criteria

| id | criterion | verification |
|----|-----------|--------------|
| `R1` | A public URL captures and renders in a reference tab | harness against a local fixture site |
| `R2` | Every Phase 0 refusal also refuses here | the `S1`–`S4` suite re-run through the reference endpoint |
| `R3` | A dragged region produces a crop with correct bounds | unit test on the crop maths |
| `R4` | An imported crop is rejected when it fails MIME, magic-number, dimension or quota checks | one test per rejection |
| `R5` | An imported crop reaches an `/api/edit` request with provenance intact | contract test |
| `R6` | Import is refused for a run the request does not own | boundary test |
| `R7` | SVG uploads are refused outright, and a decompression bomb is refused on declared dimensions **before** decode | one test per case — `sharp` has a known CVE class here |
| `R8` | Every capture carries source URL and capture time, and the UI states the style-direction scope | assertion on the stored record + a rendered-copy check |

### Dependencies this phase adds

Four survive audit. Everything else was cut.

| package | licence | why it earns a slot |
|---|---|---|
| `react-image-crop` | ISC | 2.0M downloads/wk, zero deps — the crop rectangle, not the import contract |
| `react-zoom-pan-pinch` | MIT | 1.9M/wk, zero deps — pan/zoom over a 4000px capture |
| `sharp` | Apache-2.0 | server-side crop and re-encode; already a Playwright-adjacent norm |
| `file-type` | MIT | magic-number detection for `R4`. Note: v22 is ESM-only |

**Cut:** `proxy-chain` and the resolver-pin design (Phase 0 rejected architecture);
`monolith` / `obelisk` / `single-file-cli` (3c above); `zustand` (Phase 2 below);
`ipaddr.js` kept only if `urlGuard` needs range maths beyond what Node's `net` provides.

---

## Phase 4 — Task 5, Higgsfield conditioning

Live-confirmed: `gpt_image_2` accepts `image_references` via repeated `--image-references`
(or `--image`).

1. Add `imageReferences?: string[]` to `GenerateImageOptions`.
2. **Split `generationArgs()`** into cost and create builders. `higgsfield generate cost`
   auto-uploads local file paths, so sharing the builder would upload the crop during the
   documented-free preflight — and possibly again at create.
3. Thread bytes properly: `sourceAssetId` is currently validated for existence and
   recorded as lineage only (`src/lib/imageLibrary.ts:875-880`); its bytes never reach
   `GenerateImageOptions`.
4. Correct `src/lib/imageLibrary.ts:36`, which still says GPT Image 2 supports
   "prompt-based regeneration, not source-image editing".
5. Result routes through `AssetControls.tsx` and `runGuardedMutation` as today.

### Success criteria

| id | criterion | verification |
|----|-----------|--------------|
| `H1` | The cost preflight sends no `--image` and uploads nothing | unit test asserting the cost argv — the CLI auto-uploads local paths, so a shared builder would leak the crop to a third party on a path advertised as free |
| `H2` | Create sends the reference | unit test asserting the create argv |
| `H3` | A crop conditions one real generation end to end | one bounded credited run, owner-visible |
| `H4` | The stale capability descriptor is corrected | assertion on `IMAGE_MODELS` |
| `H5` | A retried edit does not double-charge | idempotency test on `requestId` — `claimBuildGateRepair` is a one-bit latch, not an idempotency key, and paid generation needs a real one |

---

## Repository gates — all phases

`npm test` · `npm run typecheck` · `npm run lint` · `npm run test:smoke` ·
`npm run test:e2e:canvas-contract` · `npm run test:e2e:canvas-contract:axe` ·
`npx --yes -p @google/design.md@0.3.0 design.md lint --format json DESIGN.md`

`npm run build` needs an APFS-cloned tree or a stopped dev server — `next build` and
`next dev` share `.next`.

## Out of scope

- Landing the branch. `zs-land` is not run by this spec.
- Publish/download destination for the workbench — still unrequested.
- Moving the Maps lane to a keyed JS/Static Maps API.
- Changing `templates/local-service/` beyond what a criterion above names.
- Retro-applying section markup to runs built before 2026-08-16.
