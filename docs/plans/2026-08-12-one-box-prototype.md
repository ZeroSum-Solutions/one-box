# One-Box Prototype — chat-to-website front door for the acquisition engine

Drafted 2026-08-12. Proves the acquisition pipeline end-to-end with the Refero MCP as the
style-research engine. Companions: `~/Inbox/notes/2026-08-12-refero-design-teardown.md`,
`~/Inbox/plans/2026-08-12-zs-style-corpus.md` (PARKED — side quest), and the two source
docs: `~/Desktop/The_Agency_Assembly_Line.pdf`, `~/Desktop/agency-website-opportunity-map.html`.

## What this proves

1. The Refero MCP materially improves build quality (the user's core bet).
2. The acquisition pipeline works as one automated flow: intake → competitive scan →
   reference lock → DESIGN.md → build → edit.
3. The output website is genuinely high quality — that is the test, not the plumbing.

Pilot category: **local-service / SMB presence (L1–L2)** — the opportunity map's Core
Factory bucket and where the acquisition engine points. Example run: fiber-optic company.

## Prototype UI design contract (Devin, 2026-08-12)

The app's own chrome uses the **GSAP style record** Devin supplied — a Refero-format
DESIGN.md copied to `~/Inbox/plans/one-box-prototype/` along with its matching exports
`variables.css` (ready-to-use `:root` custom properties) and `tokens.json` (W3C design
tokens) — all from `~/Downloads/`; copy the bundle into the repo at build start and
build the chat + preview shell FROM these tokens (`variables.css` drops in as-is).
This dogfoods the exact artifact set the pipeline produces.

- Near-black `#0e100f` canvas, warm cream `#fffce1` type, ghost pill buttons (100px
  radius, hairline cream border), curly-bracket `{ }` section eyebrows, no filled CTAs.
- MWM-style hero: oversized display headline (scale the 224px display down to the
  viewport), one chat box, no other controls.
- The five-discipline color taxonomy maps to **pipeline stages** in the chat cards:
  green = intake, orange = competitive scan, pink = Refero research, violet =
  synthesis/DESIGN.md, blue = build. Color as taxonomy, exactly per the record.
- Font: Mori is commercial — use the record's own substitutes (Inter Tight or DM Sans),
  do not pirate the face.
- This contract governs the APP only. Generated client sites always wear their own
  per-run DESIGN.md — client-owned identity, never this one.

## User journey (the whole product surface)

1. **One page, one chat box** (MWM-style hero). Person types their business + what they
   want. No forms, no settings.
2. Agent loop streams visible pipeline stages as cards in the chat (Refero-demo style).
3. When the build lands, redirect to **/preview/[id]**: the site in an iframe + a second
   chat box that doubles as an image generator. Click any element to select it; talk to
   change it. Double-click text to edit inline.

## Architecture (lightweight, local-only)

- **App**: Next.js App Router + Vercel AI SDK, `npm run dev` on localhost. Single user,
  no auth, no deploy. Same shape as Refero's own demo (already torn down).
- **Model runtime**: AI SDK Anthropic provider with `baseURL` = zs-anthropic-proxy
  (Claude Max OAuth). Never billed api.anthropic.com. Orchestrator: **Claude Opus 5**,
  effort high.
- **Generated sites**: written to `sites/<id>/` as static multi-file HTML — **Lane A**
  from the Assembly Line doc (falsification test: static lane won 3/4 blind judges).
  All styling through CSS custom properties emitted from DESIGN.md. Tier-0 craft
  primitives: clamp() fluid type, clip-path/mask reveals, GSAP ScrollTrigger, Lenis
  gated on touch/reduced-motion, background-media discipline.
- **Repo**: new project `~/projects/one-box/` (confirm at build start). This plan moves
  to `docs/plans/` once the repo exists.

## Tools in the agent loop

| Tool | Implementation | Notes |
|---|---|---|
| `maps_search` | Google Places API (Text Search + Details) | Top 3–5 local competitors: name, rating, reviews, website URL. Key via ZS Vault (zs-credential-access at build time). |
| `crawl_site` | Canonical crawl4ai wrapper script | Free/local first; Firecrawl fallback per house tiering (bot walls). |
| `refero_search_styles` / `refero_get_style` / `refero_search_screens` / `refero_get_screen` / `refero_get_screen_image` | MCP client (streamable HTTP) → api.refero.design/mcp | Bearer token via ZS Vault (`refero_mcp_token`) — never hardcoded. Budget: 8,000 calls/mo on Pro. |
| `decode_competitor` | crawl capture + screenshot + one vision pass | Mini DESIGN.md per competitor (prospect + top 3). Lightweight version of design-language, not the full corpus extractor. |
| `higgsfield_image` | Higgsfield (GPT Image 2 default) | Hero/section imagery + the preview chat's image generator. Higgsfield-first billing rule. |
| `build_site` | Builder subagent (Opus 5) | Skeleton spec + locked DESIGN.md + copy + imagery → static site in `sites/<id>/`. |
| `edit_site` | Targeted-edit subagent | `{selector, fragment, instruction}` → rewritten fragment patched into the file, iframe reloads. |

## Pipeline stages (streamed as chat cards)

1. **Intake** — classify: category bucket (opportunity map), complexity tier (L1–L3
   only for the pilot; refuse L4+ politely), primary action (call/book/quote).
2. **Competitive scan** — `maps_search` → `crawl_site` each competitor →
   `decode_competitor`: structure inventory + token snapshot per site.
3. **Reference research** — Refero MCP per the MIT refero_skill methodology: 3–5 search
   angles, pick **one primary reference**, borrow ≤2 details from others, write the
   **reference lock** + decision ledger (every choice traces to a source). Anti-averaging
   rule enforced in the prompt.
4. **Synthesis** — two artifacts, kept separate per the flagship-skeleton insight:
   **skeleton spec** (structure: sections, IA, conversion elements — from competitors +
   category blueprint) and **DESIGN.md** (style: locked tokens — client-owned identity,
   never a house aesthetic).
5. **Build** — `build_site` from tokens only; Higgsfield imagery; copy through stop-slop
   rules baked into the prompt.
6. **Preview + edit** — selector overlay + NL edits + image chat.

## Editor mechanics (no editor framework)

Injected overlay script in the iframe: hover outline → click posts `{selector,
outerHTML, rect}` to the parent → chat shows a "selected: hero headline" chip → user
talks → `edit_site` patches the fragment → reload. Double-click = contenteditable for
direct text fixes, saved on blur. ~200–300 lines of vanilla JS. GrapesJS et al.
deliberately skipped — heavier than the prototype needs.

## Model routing (Devin's runtime decision, 2026-08-12)

**The app's runtime is OpenRouter** — Devin's explicit instruction ("for the prototype,
don't use Claude SDK, use OpenRouter instead"). All in-app model calls go through the
OpenRouter API via `@openrouter/ai-sdk-provider` + Vercel AI SDK: one OpenAI-compatible
API with REAL multi-tool calling and REAL vision, which cleanly kills both blocker
findings against the proxy/Agent-SDK design. It also makes the prototype portable — it
runs on an API key, not on Devin's local OAuth session.

Roster (per `~/.claude/billing-lanes.md` premium roster — verify exact slugs against
the live OpenRouter catalog at build time, never guess):

- **Orchestrator + vision decode + in-app visual QA**: Gemini 3.1 Pro (frontier
  multimodal, long context).
- **Builder + edit_site (frontend/motion)**: Kimi K3 (WebDev-preference #2, premium
  frontend; direct Moonshot lane is the fallback if OpenRouter is slow).
- **Intake classification / extraction bulk**: DeepSeek V4 (direct `api.deepseek.com`
  is also approved if cheaper).
- **BUILDING the prototype uses ONLY subscription OAuth models** (Devin, 2026-08-12).
  Every dev-time agent — writing the code, reviewing it, QA during development — runs
  on Claude Max OAuth (Claude Code), Codex OAuth (GPT-5.6 Sol review), or `agy`
  (Gemini, advisory visual critic). No metered API touches the build process. Claude
  also stays OUT of the app's metered runtime path (hard rule: Claude only via OAuth
  lanes). The OpenRouter roster above is exclusively the APP's runtime.
- **Budget governor lite** (from the Assembly Line doc): per-run hard cost cap using
  OpenRouter's usage accounting + a token bucket; a run that blows its cap stops and
  reports, never retries silently. Marginal cost is honestly non-zero: OpenRouter
  tokens + Places API (Enterprise SKU fields) + Higgsfield credits — small per run,
  but state it, don't claim $0.

## Quality gates (the actual deliverable)

1. **Reference lock + decision ledger** present in every run's artifacts.
2. **design-contract lint**: build consumes ONLY DESIGN.md tokens; grade the build
   against it.
3. **Release gates** (from the Assembly Line doc, non-negotiable): axe-core
   accessibility pass, Lighthouse performance + SEO budget, `prefers-reduced-motion`
   respected.
4. **Visual QA loop**: screenshot both viewports → multimodal critique → one fix cycle
   minimum before "done".
5. **stop-slop** on all copy.

## Phases (each with a verify check)

- **Phase 0 — tool smoke tests (half day).** Each tool proven standalone from a script:
  Refero MCP call returns a style record; Maps returns competitors; crawl4ai returns
  markdown; Higgsfield returns an image. *Verify: real data from all four.*
- **Phase 1 — chat + pipeline to DESIGN.md (1 day).** One-box page, agent loop, stages
  1–4. *Verify: fiber-optic prompt → competitor teardown + locked DESIGN.md + ledger.*
- **Phase 2 — builder + preview (1 day).** Stages 5–6 minus editing. *Verify: site
  renders from tokens only; gates 2–3 pass.*
- **Phase 3 — editor + image chat (1 day).** *Verify: select hero → "darker, swap image
  to a night-time fiber crew" → correct visible change without touching other sections.*
- **Phase 4 — the proof A/B (half day).** Same prompt twice: Refero tools disabled vs
  enabled. Compare outputs side by side (this is also the still-binding gate from the
  Grok 4.6 audit). *Verify: an honest scored comparison exists; the Refero-locked build
  visibly wins or the bet is re-examined.*

Total: ~4 days of build. Everything past this list is out of scope: corpus ingestion,
Supabase, deploy, auth, multi-tenant, payments, the 9-category flagship system (that
build order comes AFTER the prototype proves the pipeline).

## Security note

The Refero bearer token was pasted into a chat transcript and `claude mcp add` config —
it is compromised. **Revoke and regenerate it from the Refero dashboard BEFORE the
first smoke test** (Phase 0 item #1), then `zsvault add refero_mcp_token` and reference
it from env only. Same discipline for every other key the app touches: OpenRouter,
Google (Places), Higgsfield — vault-sourced env, nothing hardcoded, nothing pasted.

## Audit amendments (adopted 2026-08-12 — supersede conflicting text above)

Reviews: Grok 4.5 via OpenRouter (`~/Inbox/notes/2026-08-12-one-box-grok45-audit.md`,
16 findings), a 3-lens
Claude workflow that verified claims against actual source on this machine (23
findings), and GPT-5.6 Sol (deltas below when noted). Adopted:

### A. Architecture corrections (blocking — the original runtime design was wrong)

1. **The orchestrator CANNOT be Vercel AI SDK → zs-anthropic-proxy.** Verified in
   `~/projects/services/zs-anthropic-proxy/src/claude-bridge.ts`: the proxy never
   forwards a `tools` array in auto mode (only single pinned-tool `--json-schema`
   forcing), so the 8-tool loop would never fire — and it stubs every image block as
   the literal text `[image]`, so vision calls silently reason over a placeholder.
   **Resolution (Devin, 2026-08-12): the app runtime is OpenRouter** — see Model
   routing. Real tool-calling + real vision through one API; both defects vanish.
   zs-anthropic-proxy is not in the app's loop at all.
2. **Vision is native** through the OpenRouter multimodal models; still add the
   assertion that every vision call carried actual image bytes (cheap guard against a
   future silent regression). `agy` Gemini stays as the dev-time advisory critic.
3. **Pin exact OpenRouter slugs in Phase 0** — verify against the live catalog
   (billing-lanes rule: never guess a slug), record them in the run manifest.
4. **Refero MCP client**: AI SDK `experimental_createMCPClient` or official
   `@modelcontextprotocol/sdk` StreamableHTTPClientTransport, cached on `globalThis`
   (Prisma-singleton pattern) so Next.js HMR doesn't leak sessions against the
   8k-call/mo budget; explicit close on exit.
5. **Concurrency + spend cap**: decode at most 2 competitors at a time; per-run hard
   cost cap via OpenRouter usage accounting (budget governor lite). Phase 4's
   back-to-back runs are the spend-hungry moment — cap each arm.

### B. Builder + editor contracts (where quality silently died)

6. **Frozen starter skeleton.** One checked-in L1 local-service template (semantic
   sections, motion utilities, a11y landmarks) that the builder PARAMETERIZES — it may
   not invent structure or motion from scratch. Motion defaults to CSS +
   `prefers-reduced-motion` guards; GSAP/Lenis enter only via the `scroll-film-studio`
   skill lane per house frontend rules. This kills the broken-scroll-junk failure mode.
7. **Builder output contract**: `data-edit-id` on every editable node; all color/type/
   space through CSS custom properties emitted from DESIGN.md; **no raw hex/px outside
   the token sheet** — enforced by a lint script that greps emitted CSS for values
   absent from the token table and FAILS the build.
8. **`edit_site` patches the pristine source file, never live DOM `outerHTML`** (live
   capture bakes GSAP-mutated inline styles into source). Overlay sends only
   `data-edit-id` + instruction; server reads the source fragment, patches via
   parse5/cheerio, then verifies every `<script>` selector still resolves. **Token
   lint + axe re-run after every edit** — gates are invariants, not build-time stamps.
9. **Copy is its own pass**, drafted before the structural build and scored with the
   actual stop-slop rubric (recorded in run artifacts, revise below 35/50) — not
   "rules baked into the prompt". Intake asks 2–3 follow-ups for concrete business
   facts (service area, certifications, years) so the builder never fabricates claims.
10. **DESIGN.md is schema-checked and role-scoped**, produced through the
    design-contract skill's pinned tool (`@google/design.md@0.3.0` lint/export): token
    roles with where-forbidden notes, component-state table (default/hover/focus/
    disabled), a motion block (easing, duration bands, which classes reveal), and an
    **imagery art-direction brief** stored in the site manifest and passed to EVERY
    `higgsfield_image` call — build-time and edit-time — so imagery can't drift
    across sections.
11. **`reference_lock` is a structured artifact**: primary reference IDs, ≤2 borrowed
    details with sources, rejected alternatives, decision ledger — schema-validated,
    not prose.

### C. Reuse instead of rebuild (scope cuts)

12. **Competitive scan reuses `site-blueprint`** (already does Maps/Yelp discovery +
    crawl4ai-first scraping + structure derivation); **competitor decode reuses
    `design-language`**; the only genuinely new pipeline code is the Refero
    reference-lock step and the build/edit tools.
13. **Cut from v1**: the L1–L5 intake classifier + "refuse L4+" UX (pilot is hardcoded
    local-service L1–L2); double-click contenteditable (redundant with the chat edit
    loop). **Kept per Devin's explicit requirement**: the preview chat doubling as
    image generator — implemented as the same select-and-talk loop (select an image
    node → describe → Higgsfield → swap), not a separate surface.
14. **Visual QA gets a written rubric** (reuse design-taste-frontend's AI-tell
    checklist + imagery-consistency line item), loops until pass or a cycle cap
    (then human review), and adds a reduced-motion screenshot diff + console-error
    check for silent GSAP/selector failures.

### D. Honest schedule and the A/B that can actually prove the bet

15. **Timeline: 6–8 build days**, not 4 (Phase 1 splits into scaffold+loop vs
    pipeline; Phase 2 carries gate wiring; reviewers' consensus). Still lightweight —
    the cuts in §C buy back most of the added honesty.
16. **Phase 0 additions (hard gates)**: regenerate + vault the Refero token
    (`zsvault add refero_mcp_token`); server-side Places API call proving the vault's
    generic `GOOGLE_API_KEY` isn't referrer-restricted / has Places enabled (grep
    confirmed NO Places-specific key exists in the vault env — if denied, mint a
    server-restricted key); Maps queries must geocode + location-bias or local results
    are junk; Agent SDK tool-loop smoke test (2+ tools, auto choice, tool_use comes
    back).
17. **Phase 4 redesign**: ≥3 prompts across 2 categories, **three arms** (Refero
    reference-lock / local design-asset-library reference-lock / no references) to
    separate data-value from methodology-value; blind judging by the Gemini critic
    against a rubric fixed in writing BEFORE the runs, output order randomized, win
    threshold predefined. "Visibly wins" is not a gate; this is.

### E. GPT-5.6 Sol deltas (adopted 2026-08-12 — full review:
`~/Inbox/notes/2026-08-12-one-box-gpt56-audit.md`)

18. **Revoke the Refero token BEFORE the first smoke test**, not "when convenient" —
    it is compromised (chat transcript + config); vaulting the same token repairs
    nothing. Regenerate → `zsvault add refero_mcp_token` is Phase 0 item #1.
19. **`decode_competitor` needs its own capture step**: the crawl4ai wrapper returns
    title/metadata/markdown ONLY — no screenshots, no computed styles (verified in
    `crawl4ai-scrape.sh`). Add an explicit Playwright dual-viewport screenshot step
    (1440px + 390px) feeding the vision decode; without it the "token snapshot" is an
    LLM guessing colors from markdown — the exact silent-garbage path the parked
    corpus plan warns about.
20. **Static serving is a designed piece, not an assumption**: Next.js will not serve
    a root-level `sites/<id>/` tree. Serve generated sites through a catch-all route
    handler with explicit base-path/asset rules (or copy into `public/`), else
    `/preview/[id]` 404s on every asset.
21. **Sandbox the preview iframe**: generated HTML is untrusted model output. Serve it
    from an opaque origin (`sandbox` attribute WITHOUT `allow-same-origin`), add a
    CSP, and validate `postMessage` origin + message schema — otherwise generated
    script can reach the parent app and its local mutation routes.
22. **`build_site` gets an executor contract**: schema-validated site manifest (file
    inventory, asset list, entry page), safe relative paths only, atomic completion
    marker, explicit failure state. A model "writing files" without a contract is how
    half-built sites get previewed.
23. **Durable run state**: persist per-stage status + artifacts under
    `sites/<id>/run.json` (stage: `intake|scanned|locked|synthesized|built|edited`,
    with idempotency keys and retry counts) so a browser refresh, rate-limit hit, or
    crawl timeout resumes instead of repeating paid work. This is the lightweight
    version of the corpus plan's queue lesson.
24. **Gates must measure the BUILT SITE, not the DESIGN.md**: `design.md lint` only
    validates the DESIGN.md file itself. Add: computed-style token-drift check
    (Playwright reads rendered styles, compares to the token sheet), console-error
    check, broken asset/link check, functional CTA check (tel:/booking hrefs
    resolve), numeric Lighthouse thresholds (set in Phase 0), and — from Devin's own
    craft-falsification experiment (`~/Inbox/plans/craft-falsification/RESULT.md`) —
    a **no-JS content-visibility gate**: with JavaScript disabled the page must still
    show its content (reveal animations once produced a blank static page).
25. **Vision graders are advisory; a human is judge of record** for Phase 4 — the
    craft-falsification result found vision graders disagreeing at high confidence.
    Freeze the research fixtures (Maps results + crawls captured once, reused across
    all arms) so the only variable is the reference source; hold copy/imagery inputs
    identical where the arm doesn't vary them.
26. **Intake elicits real business facts or refuses to invent them**: prospect URL,
    geography/service area (needed for a meaningful Maps query at all), services,
    phone, certifications, claims with evidence, brand assets. Per the
    design-contract skill's own rule: ask for missing client materials, never
    substitute. Copy that can't cite an intake fact gets flagged, not fabricated.
27. **Places API cost realism**: `rating`, `userRatingCount`, `websiteUri` fields
    trigger the Enterprise SKU — request minimal field masks, cache responses into
    the frozen fixtures, and count Places spend in the per-run cost cap.
28. **Refero is thin on local trades** (their own docs scope styles to marketing/
    product/editorial/SaaS): expect the fiber pilot's reference lock to lean on
    adjacent-category styles + screens plus the local design-asset-library. That is
    fine — measuring whether that still helps is precisely what Phase 4's three arms
    exist to answer.
29. **Timeline note**: GPT-5.6 estimates 10–15 days for the ORIGINAL scope; with the
    §C cuts the 6–8 day estimate stands, with Phase 3 (editor) as the explicit
    slip-buffer — if it threatens the schedule, ship build+preview and cut editing to
    a follow-up, per its "cut v1 to prove the bet" recommendation.
