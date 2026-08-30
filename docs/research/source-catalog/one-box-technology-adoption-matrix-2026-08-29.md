# ONE BOX technology integration matrix

Decision date: 2026-08-29

This file summarizes integration boundaries. It is not a planning disposition authority. For starred repositories, the [18-item shortlist](github-starred-one-box-shortlist-2026-08-29.md) alone controls disposition and phase. For platform technologies outside that snapshot, the approved master plan and its gates control. This matrix cannot promote a source or authorize implementation.

## Executive decision

Build from the existing ONE BOX repository. Do not re-platform onto an outside editor, browser, agent shell, or site generator.

The current modular Next.js, React, TypeScript, Zod, `page-ir-v1` and closed `template-v1` paths, candidate and gate contracts, AI SDK, Tailwind, Playwright, and axe foundation is closer to the intended product than any reviewed base project. Add a thin Electron desktop shell when the hostile-content boundary passes. Use outside work only as bounded dependencies, protocol patterns, benchmark fixtures, and UX references.

This preserves the product's differentiator: a nearly shippable generated site enters a governed Canvas, designers apply taste through typed changes, clients review an exact candidate, deterministic and human gates qualify it, and the release pipeline deploys the locked artifact.

## Base-project comparison

| Candidate | What it proves | Why it is not the base | Use |
|---|---|---|---|
| Existing ONE BOX repository | Page IR, typed candidate path, source and approval boundaries, website lifecycle, model routing, quality tooling | It is the base | Continue |
| [Puck](https://github.com/measuredco/puck) | Strong React component-editor interaction model; MIT and active | Component-tree state could become a second source authority; current Page IR plan reserves this as a future experiment | Benchmark Canvas interactions only |
| [GrapesJS](https://github.com/GrapesJS/grapesjs) | Mature page-builder UX and plugin surface; BSD-3-Clause | HTML/CSS document authority conflicts with Page IR and deterministic compilation | Learn UX only |
| [Webstudio](https://github.com/webstudio-is/webstudio) | Serious visual-builder architecture | AGPL-3.0 and alternate document/runtime authority | Reject code reuse |
| [Onlook](https://github.com/onlook-dev/onlook) | Direct-in-browser React editing patterns; Apache-2.0 | File and code ownership conflicts with typed candidate application | Learn only |
| [Craft.js](https://github.com/prevwong/craft.js) | Extensible React page-editor primitives; MIT | Quiet maintenance since early 2025 and alternate editor state | Reject as dependency |
| [OpenPage](https://github.com/buildingopen/openpage) | Young AI page-builder reference; MIT | Too immature for a foundation and direct output authority does not match ONE BOX | Learn only |

## Platform and product decisions

| Technology | Decision | Why it helps | Phase and required gate |
|---|---|---|---|
| [Electron](https://github.com/electron/electron) | Adopt platform APIs | `WebContentsView`, session partitions, native windows, screen capture, signing, and desktop distribution fit the Mac application requirement | E0 shell and E4.0/E4.1 only after EB-001 and the complete fail-closed browser review |
| [Electron Forge](https://www.electronforge.io/) stable v7 line | Evaluate, then adopt packaging baseline | Official Electron packaging and publishing tool with makers, signing, notarization, and update paths | E8 spike after shell containment; do not use an alpha major for production |
| [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) | Adapt a narrow allowlist | Useful for deterministic observation and capture against an exact managed tab | E4.3/E4.4; prohibit public debug ports, raw evaluation, cookie/storage APIs, unrestricted DOM, and ambiguous tab fallback |
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | Adapt | Trusted-shell editor for PRDs, code proposals, receipts, and diffs | E2 and E7; read-only or proposal mode until typed apply |
| [Yjs](https://github.com/yjs/yjs) | Adapt narrowly | Good CRDT foundation for shared draft PRDs, notes, comments, cursors, and presence | E2/E3; never merge Page IR, release state, approvals, or ordered site mutations |
| [Automerge](https://github.com/automerge/automerge) | Reject for this plan | A second CRDT adds complexity without a distinct role | E3 decision closed unless Yjs fails a benchmark |
| [LiveKit](https://github.com/livekit/livekit) | Conditional adopt, SFU transport only | Rooms, audio/video, screen share, and participant state fit the client review room | P3 first; E6 media transport only after the P3 exit gate. Use short-lived guest tokens, visible recording state, screen share without remote control, and exact candidate binding. This does not adopt `livekit/agents`, which remains learn-only. |
| [Vercel AI SDK](https://github.com/vercel/ai) | Retain existing core | Strong typed streaming and provider abstraction already fits the TypeScript stack | E1/E5; keep the existing approved OpenRouter/provider lane and do not adopt direct billed provider examples or a second gateway |
| [LiteLLM](https://github.com/BerriAI/litellm) | Reject as runtime | Would add a second router, secret boundary, and policy surface | Learn only if a missing provider forces reconsideration |
| [screenshot-to-code](https://github.com/abi/screenshot-to-code) | Adapt bounded patterns | Model/stack registry, asset tools, variants, self-review, streaming vocabulary | E5; no raw HTML authority, project-store import, self-apply, or direct capture-to-candidate path |
| [React Grab](https://github.com/aidenybai/react-grab) | Adapt hit-testing ideas | Fast element targeting and source mapping can help generated-candidate selection | Canvas and E5; candidate iframe only, never a remote browser view |
| Existing non-builder motion defaults | Retain only the bounded behavior already in tree | Preserves current presentation without creating visual animation-authoring capability | A4 may exercise existing defaults only with reduced-motion and interaction oracles; no new authoring controls |
| [Motion](https://github.com/motiondivision/motion) | Evaluate as a possible replacement runtime | MIT and suitable for deterministic interaction and reduced-motion support | Research only until an evaluate-and-replace plan defines acceptance oracles, migration, and a removal path |
| GSAP 3.15 | Hold; written consent or license review | Technically capable, but current terms prohibit tools that let users build visual animations without code when they compete with Webflow unless prior written consent is granted | Block visual motion-authoring UI until written consent exists or the Motion evaluate-and-replace plan is accepted; existing non-builder use needs scoped review |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | Conditional adopt | Premium WebGL experiences can live behind a signed module contract | E7 after Page IR qualification; allowlisted ExperienceModule only, with static fallback, accessibility, SEO, bundle, GPU, and reduced-motion gates |

## Quality, SEO, publishing, and operations

| Technology | Decision | ONE BOX role | Phase and boundary |
|---|---|---|---|
| [Playwright](https://github.com/microsoft/playwright) | Retain and expand | Render, interaction, responsive, release, and failure-drill tests | P1-P8 and E4/E8; test worker, not browser runtime |
| [Lighthouse](https://github.com/GoogleChrome/lighthouse) | Adopt | Performance, SEO, best-practice, and accessibility signal | P4/P8; version-pin and preserve raw reports |
| [axe-core](https://github.com/dequelabs/axe-core) | Retain with notice review | Automated accessibility defects | P4/P8; MPL-2.0 distribution notice review, and never treat a pass as human accessibility approval |
| [schema-dts](https://github.com/google/schema-dts) | Adopt | Typed Schema.org structures | P4; emit only evidence-backed facts and bind output to the exact release bundle |
| [open-seo](https://github.com/every-app/open-seo) | Adapt protocol | Resumable crawl frontier, bounded concurrency, idempotent replay, watchdog, SSRF revalidation | E8/P4; subordinate to P1-P8 and do not import its Cloudflare control plane |
| [Instatic](https://github.com/CoreBunch/Instatic) | Adapt protocol | Publish version, serialized lock, version-keyed render cache, stale-result discard, atomic replacement | P5/E8 after P1, P3, P4, and explicit P5 implementation authorization; subordinate to the Release Orchestrator, with no E7 publishing authority and no alternate CMS or NodeTree |
| [astryx](https://github.com/facebook/astryx) | Adapt contracts | Visual-baseline promotion, publication lock, acceptance provenance | E7/P4/P8; avoid its complete design-system foundation |
| [OpenNext for Cloudflare](https://github.com/opennextjs/opennextjs-cloudflare) | Learn until provider selection | Evidence for a possible Next.js deployment adapter | P6 provider selection gate; do not preselect Cloudflare through a library |
| [PostHog](https://github.com/PostHog/posthog) | Needs license review | Behavioral reference for explicit, redacted event receipts for actors, models, skills, candidates, gates, and costs | E8 research only; no SDK, dependency, code-level adaptation, autocapture, session replay, or `ee/` source use until a license receipt exists |
| [Strix](https://github.com/usestrix/strix) | Learn; optional authorized external gate | Scope and authorization receipts for isolated security runners | E8 only through a separately authorized external scan; never automatic or in-process |

## Agent, plan, and collaboration patterns

| Source | Decision | Retain | Boundary |
|---|---|---|---|
| [t3code](https://github.com/pingdotgg/t3code) | Adapt contracts | Provider SPI, command/event/projection flow, idempotent receipts | ONE BOX keeps workspace, file, VCS, and candidate authority |
| [loop.js](https://github.com/loop-js/loop.js) | Adapt state machine | Execute, handoff, verify phases with budgets and resumability | No bypass, no auto-edit default, and model verification is not acceptance |
| [deepagents](https://github.com/langchain-ai/deepagents) | Learn and adapt middleware ideas | Ordered capabilities, paths, interruptions, typed state | Do not import Python runtime or broad filesystem agent authority |
| [Deep Agents JavaScript SDK](https://github.com/langchain-ai/deepagentsjs) | Adapt patterns only after separate evaluation | TypeScript subagent, interruption, and nested-stream contract ideas for bounded jobs | T1-T11 passed, but the runtime showed no material advantage and remains excluded from E1 Agent Studio, routing, state, memory, and application dependencies; retain the ONE BOX controller |
| [Buzz](https://github.com/block/buzz) | Adapt envelopes | Signed actors, idempotent events, tenant context, tamper-evident audit | Cloud identity and ordered ONE BOX mutations remain authoritative |
| [Puck](https://github.com/measuredco/puck) | Evaluate Canvas experiment | Component palette, field controls, preview and inspector ergonomics | Trusted Canvas only; benchmark against Page IR without creating a second document model |
| [tldraw](https://github.com/tldraw/tldraw) | Needs license review | Optional plan sketch and diagram surface | Custom production license; never use as site Canvas or bypass Page IR |

## Hugging Face decision capsule

- Keep every model, runtime, and dataset row in Research/T1. No catalog row advances into E1 or E4 while E4 remains blocked.
- Evaluate Qwen3.5-4B first for multimodal Page IR proposals, with PaddleOCR-VL and Florence-2 as small specialist baselines.
- Compare SigLIP2, BGE-VL, and BGE-VL-Screenshot for visual retrieval.
- Keep GUI-Actor in a target-proposal benchmark lane with deterministic geometry checks and no effect authority.
- Evaluate MLX and mlx-vlm for the Apple-silicon research harness only. Use no local weight conversion until its source, license, revision, and hash come from an official artifact or a counsel-reviewed receipt.
- Evaluate pinned ScreenSpot-v2, ScreenSpot-Pro, WebClick, pattern2code, and a reviewed Design2Code subset as Research/T1 offline fixtures.
- Exclude WebInfinity from the offline corpus until its page rights and provenance audit passes.
- Learn and adapt ST-WebAgentBench's 80 modality-challenge and policy patterns into rights-reviewed local fixtures. Keep the full official benchmark outside the offline corpus; run it only as a separately authorized, sandboxed integration benchmark after environment, credential, and dependency review.
- Hold OmniParser because its model bundle has conflicting MIT, AGPL-3.0, and CC-BY-4.0 signals.

See [the full Hugging Face catalog](hugging-face-one-box-candidates-2026-08-29.md) for footprints, limitations, datasets, metrics, and model isolation controls.

## License and security stop list

| Item | Stop reason |
|---|---|
| GSAP visual motion builder | Current standard terms can prohibit a competing no-code visual animation builder without prior written consent |
| Webstudio, Firecrawl source, Plane, OpenMontage | AGPL-3.0 code-reuse boundary |
| ComfyUI | GPL-3.0 code-reuse boundary |
| React Bits | MIT plus Commons Clause restricts commercial redistribution of the components |
| OmniParser bundle | Conflicting component and repository licenses |
| tldraw production SDK | Custom license and production key requirements |
| PostHog monorepo and SDK decision | Mixed MIT and enterprise source tree; no dependency or code-level use until a license receipt exists |
| BuilderIO agent-native | README license claim without a recognized license artifact; no dependency or code-level use until a license receipt exists |
| Sandpack and Craft.js | Maintenance signal too weak for a new production dependency |

## What can happen before implementation authorization

- Finalize typed contracts and threat models.
- Build the offline model and dataset benchmark harness in a research-only boundary.
- Prototype Puck interactions against synthetic Page IR fixtures without retaining a dependency.
- A disposable, out-of-tree Electron Forge study may run before authorization only if it loads no remote content and retains no ONE BOX dependency or configuration. First retained development packaging waits for corrected E4.0/E4.1 acceptance; production signing, notarization, and updater adoption belongs to E8.
- Run license review for GSAP, tldraw, OmniParser, React Bits, PostHog, and any missing-SPDX source.

No item in this matrix changes the authorization state of the website, browser, appointment, production-provider, or deployment plans.
