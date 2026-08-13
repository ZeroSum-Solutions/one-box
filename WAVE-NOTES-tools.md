# WAVE-NOTES — tools

Files owned: `src/lib/openrouter.ts`, `src/lib/runstate.ts`, `src/lib/tools/maps.ts`,
`src/lib/tools/crawl.ts`, `src/lib/tools/capture.ts`, `src/lib/tools/refero.ts`,
`src/lib/tools/higgsfield.ts`, `scripts/smoke/tools-smoke.mjs`.

Read first, as instructed: `src/lib/contracts.ts`, the plan's Audit amendments A–E.
By the time I started, `src/lib/pipeline.ts`, `src/app/api/{chat,edit,run,sites}`,
and `WAVE-NOTES-ui.md` already existed (other waves running concurrently — CLAUDE.md
also changed under me mid-wave). I read all of them before writing anything, because
`pipeline.ts` and the two API routes already import `openrouter.ts`/`runstate.ts` by
name — the ONLY way to not break a system already being built around this contract
was to match what they actually call, not just the task brief's literal item list.
That drove most of the "expanded beyond spec" decisions below.

## Verification run

- `npx tsc --noEmit` — **zero errors in any file I own.** One pre-existing error
  remains project-wide, in a file I don't own: `src/app/api/chat/route.ts:30` —
  `messages: convertToModelMessages(messages)` is typed `Promise<ModelMessage[]>`
  where `ModelMessage[]` is expected (looks like a missing `await`). Not touched —
  outside my file list. My landing did resolve every "missing module" error the ui
  wave's notes mention (`runstate.ts`/`openrouter.ts`/`tools/*` didn't exist yet
  when they ran their check).
- `node scripts/smoke/tools-smoke.mjs` — **ran for real, live**, all four sections
  `ok:true`. Full output and cost accounting below.
- Did not run the dev server or `npm run build`, per the house rules for this task.

## Live smoke-test output (verbatim summary)

```json
{
  "refero": { "ok": true, "toolCount": 8, "styleCount": 5 },
  "maps": { "ok": true, "count": 4, "costUsd": 0.01 },
  "capture": { "ok": true, "paths": [
    "/tmp/one-box-smoke/capture/desktop-full-1440x900.jpg",
    "/tmp/one-box-smoke/capture/mobile-full-390x844.jpg"
  ] },
  "higgsfield": { "ok": true }
}
```

- **Total external spend: $0.01** (Firecrawl, one query batch — the second query
  was never attempted because the first alone filled all 4 competitor slots).
  Higgsfield: $0 (no generation call made). Refero: $0 (subscription budget, not
  costUsd). Well under the $0.05 cap.
- refero tools/list returned 8 tools: `refero_get_flow`, `refero_get_screen`,
  `refero_get_screen_image`, `refero_get_similar_screens`, `refero_get_style`,
  `refero_search_flows`, `refero_search_screens`, `refero_search_styles` — matches
  vendor/refero_skill's docs exactly, no namespacing prefix.
- `searchStyles('dark saas landing')` returned 5 real, correctly-named results:
  beehiiv, LaunchDarkly, Dashlane, FlutterFlow, Notion.
- Screenshot files verified on disk: real JPEGs, exact expected pixel dimensions
  (1440x900, 390x844 — example.com is shorter than both viewports so the
  height-cap resize path didn't trigger; see item 8 below).

## Deviations / assumptions (honest list)

1. **openrouter.ts/runstate.ts exports go well beyond the task's literal item
   list, to match what `pipeline.ts`, `chat/route.ts`, and `edit/route.ts` already
   import.** Concretely: `openrouter.ts` exports `openrouter` (the raw provider —
   `chat/route.ts` calls `openrouter(MODELS.orchestrator)` directly inside its own
   `streamText`), `generateJson(runId, model, zodSchema, prompt)` (used 8x in
   `pipeline.ts` and once in `edit/route.ts` — the real workhorse), and
   `generateTextCapped(runId, model, opts)` (imported by `pipeline.ts` but not yet
   called anywhere I could see — likely reserved for `builder.ts`, which isn't
   landed yet; I designed its signature from the name alone: minimal cost-tracked
   plain-text generation, returns `string`) — **in addition to** the spec'd
   `chat(model, opts)`, which I kept as the general-purpose tool-calling passthrough.
   `runstate.ts` exports `loadRun`, `createRun`, `saveArtifact`, `loadArtifact`,
   `sitePaths`, `stageDone`, `artifactPath` — in addition to the spec'd
   `startStage`/`finishStage`/`failStage`/`addCost`/`makeRunId`. `createRun()` is
   called with **zero arguments** in `chat/route.ts` and returns a bare `runId`
   string (not the full state) — I matched that exactly; it defaults
   `modelSlugs` to `{...MODELS}` from contracts.ts (audit #3: record the pinned
   slugs a run actually used) and `costCapUsd` to the schema default (3).
2. **`CostCapExceeded` lives in `runstate.ts`, not `openrouter.ts`**, and is
   re-exported from `openrouter.ts` for the literal import the task described.
   Reason: `addCost` is what actually detects+throws it, and `pipeline.ts` calls
   `addCost` directly (not only through a chat/generateJson wrapper) — so the class
   has to be owned by the module that throws it to avoid a circular import.
3. **`generateJson` uses `generateObject`**, which the installed `ai@7.0.64`
   marks `@deprecated` in favor of `generateText`'s newer `output` setting — it's
   still fully functional (I verified with a real live call, see below), just
   simpler for this single use case. Flagging as a candidate for a later swap if
   the SDK actually removes the deprecated path.
4. **OpenRouter's own docs (fetched live) say `usage:{include:true}` is now a
   deprecated no-op** — cost is always inline in `usage.cost` today. I kept
   passing it anyway (harmless) and kept the `/api/v1/generation?id=` fallback
   (verified its real response shape live — `data.total_cost`) as a safety net.
5. **`maps.ts` registrable-domain dedup is "last two dot-labels," not a real
   public-suffix-list** — fine for the US local-service domains this pilot
   targets, would mis-handle compound TLDs like `.co.uk`. No PSL library is
   installed and adding one would violate the no-new-heavy-deps rule.
6. **The directory/aggregator blocklist matches the task spec exactly** (yelp,
   angi, homeadvisor, thumbtack, facebook, bbb, mapquest, reddit, wikipedia) —
   and the live smoke run exposed a real gap it doesn't cover: all 4 results for
   `"fiber optic installer Chattanooga TN"` were job boards/training sites
   (indeed.com, ziprecruiter.com, lightbrigade.com, broadbandnation.org), not
   competing businesses. I did not expand the blocklist with guessed domains
   beyond what was specified — flagging this as a real, live-observed
   data-quality gap for whoever owns query design/the blocklist next: either the
   query needs a qualifier (e.g. "company" / "near me") or the filter list needs
   growing past the nine literal domains named in the brief.
7. **`crawlSite(url, outDir)` has no `runId` param** (matches both the task's
   literal signature and `pipeline.ts`'s actual call site exactly), so the
   Firecrawl-scrape fallback's real cost is **not** tracked into any run's
   `costUsd` — a known, unavoidable-given-the-signature gap. Only `crawl4ai`
   (free) is billed nothing; the paid fallback path currently has no run to
   charge.
8. **`capture.ts`'s height cap is hand-rolled**, since Playwright's `fullPage`
   screenshot option has no max-height of its own: I measure
   `document.documentElement.scrollHeight`, resize the viewport to
   `min(scrollHeight, 4000)`, then take a plain (non-fullPage) screenshot at that
   exact size. Verified live against `example.com` — real JPEGs at the exact
   viewport dimensions came back — but `example.com` is shorter than both
   viewports, so the actual >4000px truncation branch was never exercised
   end-to-end (only read-through-reasoned, not run against a real tall page).
9. **`higgsfield.ts` is the least-verified file, by design of the smoke-test
   brief** ("print --help parse result WITHOUT generating — no credits spent").
   Live-verified: `higgsfield model get gpt_image_2` (exact params: `prompt`
   required; `aspect_ratio` one of `1:1,4:3,3:4,16:9,9:16,3:2,2:3`, default `1:1`;
   `quality` low/medium/high, default high; `resolution` 1k/2k/4k, default 2k) and
   `higgsfield generate cost gpt_image_2 --prompt ... --aspect-ratio 16:9` (real
   dry-run cost estimate: 7 credits, zero credits actually spent). **NOT
   live-verified:** the actual `generate create gpt_image_2 ... --wait --json`
   call and its result-URL JSON shape. The CLI's own `--help` text documents
   `--wait`/`--wait-timeout`/`--wait-interval` in its example line but — oddly —
   does **not** list them in the printed `Flags:` section; I used them anyway
   since the example is the only documentation the CLI gives for that flow. URL
   extraction from the eventual JSON is a defensive multi-strategy parser
   (known key names → any string URL anywhere → regex over raw stdout) that has
   never seen real output. **This is the single highest-risk unverified piece in
   this wave — validate it with one real (credited) generation before Phase 2
   relies on it for hero imagery.**
10. **`refero.ts` parsing was wrong on the first pass and fixed live, mid-wave.**
    I initially assumed MCP-typical `structuredContent`/JSON responses. A live
    probe against the real server showed `refero_search_styles` and
    `refero_search_screens` actually return **one text block of rendered
    markdown** — `## Style: <uuid>` / `## Screen: <uuid>` headed sections with
    `- **Key**: value` bullets (value sometimes wrapping onto an indented
    continuation line), and screens additionally nest `### Content` / `### Site`
    subsections whose bullets I prefix (`content_description`, `site_name`, …) so
    a repeated key like "Description" can't collide across subsections. I rewrote
    the parser around this real shape and re-verified live (see smoke output
    above — 5 correctly-named style results). `refero_get_style` with
    `response_format:"json"` **does** return real JSON, confirmed live, so
    `getStyle`/`getScreen` keep the JSON-parse path unchanged. `getScreen` itself
    wasn't separately live-called (get_style's shape was the representative
    case for that code path); `getScreenImage` (raw screenshot bytes) was never
    called — it's outside the 4-part smoke-test brief.
11. **`searchScreens`'s `platform` param defaults to `"web"`.** The real
    `refero_search_screens` tool *requires* `platform` (`web`|`ios`) per its own
    docs, but `pipeline.ts`'s call site (`searchScreens(q, 3)`) never passes one —
    I default it rather than making it required, since I can't change that call
    site.
12. **`searchStyles`/`searchScreens`'s numeric second argument is a client-side
    slice, never sent to the server.** The real MCP tools only accept
    `{query, page}` — `refero-design`'s own docs explicitly say "do not pass
    `limit`... to search tools." `pipeline.ts` calls `searchStyles(angle, 4)` /
    `searchScreens(q, 3)` expecting that number to bound the result count, so my
    wrapper honors the intent by slicing locally after the call returns.
13. **Import style: plain relative (`./runstate`, `../contracts`, …), not the
    `@/*` alias**, across all files I own — despite the house rule phrasing
    "relative imports via @/*." I matched `pipeline.ts`'s own established
    convention for `src/lib`-internal imports (it already uses `./contracts`,
    `./runstate`, `./openrouter`, `./tools/maps` — extensionless relative, not
    `@/lib/...`) rather than introduce a second style into the same directory
    tree. This also happens to be load-bearing: `@/*` only resolves through
    Next.js's own bundler, not plain `node` — using it anywhere in the dependency
    chain the smoke script imports would have made the mandated live smoke test
    impossible to run without editing `tsconfig.json` (shared config, outside my
    file list).
14. **`scripts/smoke/tools-smoke.mjs` needed a small resolver hook to run at
    all.** This repo's `.ts` files use extensionless relative imports; plain
    `node` (this machine: v26.5.0, which strips TS types natively) still requires
    explicit extensions on relative specifiers regardless of TS involvement —
    empirically confirmed by hand before writing anything. `tsc` itself refuses
    `.ts`-extension imports without `allowImportingTsExtensions` (a project-wide
    tsconfig change I'm not authorized to make). Fixed entirely inside the one
    file I own: `node:module`'s `registerHooks()` (pure builtin, zero new deps)
    installs a `resolve` hook that only activates when the default resolver
    fails on a relative specifier, then tries `.ts`/`.tsx`/`.js`/`.mjs` in turn.
    Verified it doesn't affect bare package resolution (zod etc. still resolve
    normally). This same investigation also surfaced a real, permanent fix:
    `CostCapExceeded`/`RunNotFoundError` in `runstate.ts` originally used
    TypeScript constructor-parameter-property shorthand
    (`constructor(public readonly runId: string, ...)`), which Node's
    strip-only TS mode rejects outright (it's not erasable — it generates
    `this.x = x` assignments). Rewrote both as explicit field declarations +
    assignments in the constructor body — `tsc`-equivalent, now also
    Node-native-runnable, not just a smoke-test workaround.
15. **`CompetitorLead` (maps.ts) is typed wider than `findCompetitors` actually
    populates** — it mirrors `contracts.ts`'s `CompetitorSchema` shape
    (`markdownPath?`, `screenshotPaths?`, `structure?`, `notes?` all optional) so
    that `pipeline.ts`'s later `Object.assign(c, {structure, notes})` +
    `c.structure` read pattern type-checks. `findCompetitors` itself still only
    ever sets `{name, url, source}`.
16. **`openrouter` provider is constructed at module load, not lazily.** Safe:
    the underlying SDK only reads/validates `OPENROUTER_API_KEY` lazily, per
    request (confirmed by reading its compiled source) — importing this module
    never throws even before env is sourced.
17. Total time/spend discipline: kept the live refero-shape investigation to
    read-only, zero-cost `tools/list`/`search`/`get_style` calls (all free
    against the subscription budget); the maps live run was the only priced
    call in the whole wave, at $0.01.
