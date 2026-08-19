# Refero MCP — research digest (2026-08-15)

Sources: doc.refero.design (Getting Started, Tools, Data Model, Examples, Refero Skill),
the live MCP tool schemas, and live probe calls run against the connected server on
2026-08-15. This is the grounding doc for the selection-tool and editor-agent design
work. Facts here were verified against real responses, not marketing copy.

## The three research layers

| Layer | Search tool | Detail tool | What it is | Corpus shape (observed) |
|---|---|---|---|---|
| Styles | `refero_search_styles(query, page)` | `refero_get_style(style_id \| style_ids≤10)` | Semantic design reference extracted from a real marketing/product page: visual language as tokens + rules | ~1,000 curated styles (`total_count: 1000`). Heavily SaaS / fintech / product-marketing. No local-trade sites observed. |
| Screens | `refero_search_screens(query, platform, page)` | `refero_get_screen`, `refero_get_similar_screens(limit≤20)`, `refero_get_screen_image(thumbnail\|full)` | Single real page/view with structured metadata | The big layer (the "135k sites" claim lives here). `page_types`, `ux_patterns`, `ui_elements`, `hex_colors`, `fonts`, prose `content.description/layout/functions`. |
| Flows | `refero_search_flows(query, platform, page)` | `refero_get_flow(flow_id \| flow_ids≤10)` | Multi-step journey: per-step goal / action / system_response + screen refs | Sparse for niche queries (a probe-adjacent query reported `total_count: 13`). |

Key mechanics:

- Search is **semantic-only**: `query` + `platform` (+ `page`). There is NO structured
  filtering by category, color, industry, or page type. Filtering happens by writing a
  better query, or client-side on the returned metadata.
- Style search takes **no platform param** (styles are desktop-web).
- Screens use UUIDs; flows use numeric ids. Detail batches: ≤10, but docs recommend
  3–4 styles per call (full styles run 10–15k chars).
- `response_format: "json" | "md"` on everything. One live style search returned a
  corrupted description tail (repeated `}]}】` garbage) — **any wrapper must sanitize
  and length-cap description fields** before they reach prompts or UI.
- Official anti-patterns (docs "Common mistakes"): don't use screens as the main
  source of visual taste when styles exist; don't copy one style wholesale; don't
  average many references — pick ONE primary, borrow narrow details from 1–2 others.

## Finding 1 — query by aesthetic, not by business category

Live probe: `refero_search_styles("local home services contractor website warm
trustworthy bold")` returned zero contractors — it returned Elementor, Empower,
Apron, Pipe, PostHog, HubSpot, Ambrook, Peloton. The engine matched the *adjectives*
("warm", "trustworthy", "bold"), not the industry. And the matches were genuinely
usable as directions for a trade site (Ambrook = warm rustic craftsmanship; Pipe =
black-and-orange technical; Apron = sunlit friendly).

Implication for the selection tool: `docs/WEBSITE-CATEGORIES.md` must not be passed
to Refero as a literal filter. The taxonomy's job is to map a brief to an **aesthetic
query vocabulary** — mood words, audience words, trust posture, energy level — and to
run 3–5 *different* query angles (docs explicitly recommend "search several visual
angles before choosing a direction"). The docs' own good-query examples are all of
this form: "premium fintech website with restrained typography", "editorial
monochrome SaaS landing page".

## Finding 2 — a full style IS the composition contract we discarded

`refero_get_style` for Ambrook returned, beyond color/font tokens:

- **North star** — one-line visual thesis ("Rustic ledger on cream parchment")
- **Color roles** — every hex has a named role ("Harvest Gold — primary CTA only")
- **Type system** — families with substitution fallbacks (Lateral → Inter), full
  scale with per-size line-height and tracking
- **Spacing & shapes** — density, radii per element class, section gap, card
  padding, page max-width
- **Component recipes** — buttons/cards/inputs with exact treatments
- **Surfaces** — explicit elevation levels and their purposes
- **Layout & section rhythm** — "sections alternate between Greige Canvas and Warm
  Paper", "alternating text-left/image-right", "3-column card grid for services"
- **Imagery guidance** — photography treatment (candid, desaturated, warm filter),
  illustration system, framing rules
- **Motion philosophy** — durations, easing, personality
- **Do's/Don'ts** — style-preserving rules (anti-slop constraints)
- **Agent Prompt Guide** — ready-made component prompts

The 2026-08-13 A/B wired ONLY colors/fonts into the build and threw the rest away.
The composition-level signal Sol's audit said the renderer lacked a contract for is
*already structured inside the full style*. Caveat: styles contain internal
inconsistencies (Ambrook's components say 3.75px button radius; its prompt guide
says 9999px pill) — synthesis must reconcile, never trust a single field blindly.

## Finding 3 — layer routing (docs' own rules, confirmed by probes)

- **Styles** → visual language/taste. Always the entry point for "how should it look".
- **Screens** → concrete section/page patterns: "pricing page annual monthly toggle",
  "feature comparison table", "trust badges above the fold". Query by what is
  literally ON the screen (screen type, component, state, company, on-screen text).
  Our screens probe for "local service company pricing section" returned SaaS pricing
  pages — fine for *pattern* research (pricing UI is pricing UI), wrong for *taste*.
- **Flows** → journey logic only (booking, quote request, checkout). Sparse corpus;
  broaden queries or fall back to screens.
- **Images** → `refero_get_screen_image` when text metadata isn't enough; thumbnails
  first, `full` only for fine detail. Styles ship a `preview_url` — the visual the
  user can be shown.

## Finding 4 — the official methodology (Refero Skill)

Refero ships a skill (`npx skills add https://github.com/referodesign/refero_skill
--skill refero-design`) encoding: brief → styles first → screens/flows as needed →
synthesis (ONE primary direction, narrow borrows, preserve token/media roles, write a
reference lock / decision ledger) → implement against craft rules + anti-AI-slop
gates. This is materially the same shape as our pipeline's lock stage + DESIGN.md —
external validation of the architecture, and worth diffing against our lock-stage
prompt when we harden it.

## Implications (input to the ideation fan-out, not decisions)

1. Selection tool: brief → 3–5 aesthetic query angles → style previews (image +
   plain-language profile derived from the description) → user picks ONE primary
   (optionally 1–2 narrow borrows) → full style fetched → contract written.
2. The pick can feed the build with far more than tokens: layout rhythm, surfaces,
   imagery treatment, motion, component recipes, do/don'ts. Renderer expressivity
   must grow to honor those fields — that ordering question is Sol's standing
   objection and Devin's call.
3. Editor agent: "make my pricing section better" routes to screens
   (`pricing … packages`, platform web) for patterns + the site's locked style for
   taste; `get_similar_screens` to widen; screen thumbnails as show-the-user
   evidence. The locked DESIGN.md acts as the guardrail so editor suggestions stay
   on-brand.
4. Wrapper hygiene: sanitize descriptions, cap lengths, cache style payloads
   (10–15k chars) so repeat views don't re-fetch.
