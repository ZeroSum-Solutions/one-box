# WAVE-NOTES — ui

Files owned: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`,
`src/app/preview/[id]/page.tsx`, `src/components/**`, `public/overlay.js`.

Read first, as instructed: `src/lib/contracts.ts`, the plan's Audit amendments
A–E, `DESIGN.md` + `variables.css` + `tokens.json` at repo root. The API wave
had already landed `src/app/api/{chat,edit,run,sites}` and `src/lib/pipeline.ts`
by the time I started, so where noted below I built against their *actual*
code, not the plan doc's paraphrase of it.

## Verification run

- `npx tsc --noEmit` — **zero errors in any file I own.** The 30 errors the
  full run reports are all in `src/app/api/{chat,edit,sites}/route.ts` and
  `src/lib/pipeline.ts` (not mine), caused by missing sibling modules that
  another wave hasn't landed yet (`src/lib/runstate.ts`, `openrouter.ts`,
  `tools/*`, `builder.ts`, `gates.ts`). Expected in a parallel-wave repo;
  re-run once those land.
- `npx eslint <my files>` — zero errors/warnings after two fixes (see below).
- `npx next typegen` — regenerated `.next/types` so `PageProps<'/preview/[id]'>`
  resolves; not a dev-server start, just route-type generation (`next
  typegen --help` confirms: "without running a full build").
- **Did not run `npm run build`.** A full build type-checks and bundles every
  route eagerly, including the API routes above, which currently fail to
  resolve their own imports (unrelated to my files) — a full build was
  guaranteed to fail on code I don't own and can't fix. `tsc --noEmit` was the
  meaningful check available; re-run `npm run build` once the lib/API waves
  finish landing their modules.

## Deviations / assumptions (honest list)

1. **`useChat` / `@ai-sdk/react` is not installed** (checked
   `node_modules/@ai-sdk/` — only `gateway`, `provider`, `provider-utils`;
   `ai@7.0.64`'s own `index.d.ts` confirms `useChat` isn't exported from `ai`
   itself, only referenced in a JSDoc example that imports it from
   `@ai-sdk/react`). Adding it would violate the "no new heavy deps beyond
   what is installed" rule, so `page.tsx` hand-rolls an SSE chunk reader
   instead of `useChat`. I verified the actual wire format against
   `src/app/api/chat/route.ts` (a real `streamText(...).toUIMessageStreamResponse()`
   route) and `node_modules/ai/dist/index.js`'s `JsonToSseTransformStream`
   (emits `data: <json>\n\n` frames, `data: [DONE]\n\n` on flush — confirmed
   by reading the compiled source, not guessed). My reader in
   `src/components/sse.ts` matches that framing exactly.
2. **Pipeline-start detection reads the `start_pipeline` tool's output, not a
   `data-pipelineStart` part.** The plan doc says "server signals pipeline
   start (data event `{type:'pipeline-start', runId}`)" — but the real
   `/api/chat` route has no such custom data part; it calls a `start_pipeline`
   tool whose `execute` returns `{ runId, started: true }`. AI SDK streams
   that as `tool-input-start`/`tool-input-available` (carries `toolName`) then
   `tool-output-available` (carries `output`, but **not** `toolName`). My
   reader in `page.tsx` tracks `toolCallId → toolName` from the input chunks
   so it can recognize the matching output chunk and pull `runId` out of
   `output.runId`. This is read from the actual route code, not inferred.
3. **`/api/chat` request body is a real `UIMessage[]`** (`{id, role, parts:
   [{type:'text', text}]}`), matching `route.ts`'s
   `const { messages }: { messages: UIMessage[] } = await req.json()` — not
   the simpler `{role, content}` pairs the plan doc implies. Confirmed by
   reading the route and `ai`'s `UIMessage`/`TextUIPart` type declarations.
4. **`/api/edit` is request/response, not a stream.** Read
   `src/app/api/edit/route.ts`: it returns one `Response.json({ok, editId,
   gates, gatesClean, costUsd})` or `Response.json({error}, {status})` — no
   SSE. The plan doc's "shows streamed status + result" is approximated as a
   pending state ("Applying…") while the fetch is in flight, then the final
   result/error line — there is nothing to stream against the real endpoint.
5. **Possible path mismatch for the hero image asset (flagging, not fixing —
   not my files).** `pipeline.ts`'s `stageSynthesize` writes the hero image to
   `path.join(sitePaths(runId).root, "assets", "hero.jpg")` (run root). The
   site-serving route (`src/app/api/sites/[id]/[...path]/route.ts`) only
   treats `research/*` and the three named root artifacts
   (`gates.json`/`DESIGN.md`/`run.json`) as root-relative; every other path,
   including `assets/hero.jpg`, resolves against `roots.site` instead. If
   `sitePaths().root` and `.site` are different directories (their separate
   names imply they are, though `runstate.ts` doesn't exist yet to confirm),
   the hero-image card my UI renders would 404. Competitor screenshot paths
   are fine — they're under `research/`, which the route does treat as
   root-relative. My `resolveSiteAsset()` in `page.tsx` faithfully implements
   the route's actual URL scheme either way; this is a pipeline/API-wave
   reconciliation, not a UI bug.
6. **Cost cap fallback.** `PipelineEvent`'s `cost` variant only carries `usd`,
   never the cap (`RunState.costCapUsd` isn't threaded through). `CostChip`
   defaults `capUsd` to `3`, matching the schema default in `contracts.ts`.
   If a run is ever created with a non-default cap, the chip will show the
   wrong ceiling — there's no field to read the real one from.
7. **Gate pass/fail dots use shape, not a sixth color.** DESIGN.md's Don'ts
   say "don't introduce new category colors beyond the five-discipline
   palette." The plan brief says "green/red dots per gate." I resolved the
   tension by reusing the existing green token for "pass" and a hollow
   cream-outlined ring (no fill, no new hue) for "fail," rather than inventing
   a red. Flagging in case a literal red was actually wanted.
8. **`edited` stage color.** The GSAP record's five disciplines don't include
   an "edit" stage (STAGES in contracts.ts has six: intake/scanned/locked/
   synthesized/built/**edited**). `StageCard` maps `edited` to the same blue
   as `built` (same family, post-build state) rather than inventing a sixth
   hue.
9. **`postMessage` origin validation.** The preview iframe is intentionally
   opaque-origin (`sandbox="allow-scripts"`, no `allow-same-origin`, per audit
   E21 — confirmed against the actual route.ts comment). That means
   `event.origin` is always the literal string `"null"`, so checking it
   against an expected origin would be meaningless. I validate provenance via
   `event.source === iframeRef.current?.contentWindow` instead (stronger:
   proves the message came from *this* iframe element, not just "some
   opaque-origin frame somewhere"), plus a full shape guard on the payload
   before trusting any field.
10. **Markdown-lite, not a markdown library.** `StageCard` renders `\n`-split
    lines, `-`/`→`-prefixed lines as bullets, and `**bold**` spans by hand —
    no new dependency, matches the "body markdown-lite" instruction.
11. **`<img>` over `next/image`** for stage-card thumbnails (eslint-disabled
    with an inline reason): they're a variable-count set of small runtime
    thumbnails from locally generated files, never the page's LCP element;
    `next/image` would need known dimensions or a configured remote loader
    for a dynamically-sized, per-run asset set.
12. **`globals.css` is 600 lines** — over the 400-line "aim" but under the
    800 hard max. It's one file by design (the task's own spec: "globals.css:
    import Tailwind v4, paste the variables.css tokens, base styles"), and it
    also carries every component's CSS since this project has no CSS-in-JS
    or Tailwind `@apply` layer — splitting it wasn't asked for and would
    scatter the token/primitive definitions the whole app shares.
13. **No `sites/` fixtures exist yet** (empty dir), so none of the chat →
    pipeline → preview flow has been exercised against real data — only
    verified by reading contracts, reading the real API route code, and
    type/lint checking. The dev server was not started per instructions.
    First real integration test needs all waves landed plus a live run.
