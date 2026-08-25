# OneBox capability roadmap after the review UX integration

Date: 2026-08-25
Branch: `codex/onebox-review-evidence-ui`
Base: `cb26ae9f6179e6570ed305262a26ed360bd5a30f`

## Status key

- **Shipped:** the current branch contains the behavior and automated coverage.
- **Partial:** useful foundations exist, but the requested product system is not complete.
- **Missing:** the current product has no truthful end-to-end implementation.
- **Superseded:** a later product decision replaced the proposal.
- **Externally gated:** implementation or activation needs owner approval, credentials, spending, billing, licensing clearance, or deployment authority.

## Review experience audit

| Requirement | Status | Current evidence or remaining boundary |
|---|---|---|
| Plain-language stage explanations | Shipped | Reference selection plus the evidence, contract, token, mapping, CSS, and build stages now open with plain-language review summaries. |
| Useful summary before sources and technical detail | Shipped | Each current artifact shows the review summary first. Sources, provenance, raw JSON, generated CSS, and other implementation detail sit behind one disclosure. |
| Four review questions | Shipped | Every artifact summary answers the decision, learning, proposed result, and next-action questions in a fixed order. |
| Bottom feedback composer | Shipped | Pending reference selection and each active evidence artifact stage have one bottom composer. Read-only browsing, legacy runs, and the separate Page IR Source Bundle compliance checkpoint do not gain mutation controls. |
| Drag and drop plus visible attachment control | Shipped | The composer accepts dropped files and exposes a visible Attach files control through the existing private upload route and policy. |
| Feedback text, send state, validation, and accessible errors | Shipped | Feedback requires bounded text, reports status through a live region, keeps upload errors in alerts, disables duplicate clicks while busy, and retains the written draft after a failed or expired upload request while asking the reviewer to reselect only stale files. |
| Private attachment persistence | Shipped | A feedback id binds the current stage and artifact version to an idempotent receipt. Files reuse intake inspection and staging, then move into a private run evidence folder. |
| Bottom approval and change controls | Shipped | Standard gates use Approve to Continue and Request Changes at the bottom. Visual QA keeps its named-human criteria and maps all-pass to approval and any failed criterion to a change request. |
| Guarded submit, approve, advance, revision, and resume flow | Shipped | The existing route actions remain authoritative. The client records each successful intermediate state so a later failure resumes from the server's current transition instead of replaying an earlier one. |
| Visual typography specimens | Shipped | The token review renders the canonical family, scale, weights, line heights, and tracking together when those values are present. |
| Color, spacing, radius, border, shadow, and overlay specimens | Shipped | Token review shows every canonical value in a bounded role example before its technical table. |
| Hover, focus, selected, disabled, and error specimens | Shipped | The token review includes bounded component-state examples without moving client colors into OneBox shell chrome. |
| Desktop, tablet, phone, keyboard, focus, touch, overflow, motion, and Axe verification | Shipped | `scripts/e2e/evidence-review.mjs` covers the shared review surface at 1440, 768, and 390 pixels, measures every visible interactive target at mobile widths, checks keyboard disclosure, focus, Escape stability, overflow, console and page errors, script-blocked mode, reduced motion, canonical computed type, forced upload expiry and recovery, attachment removal and persistence, and Axe serious/critical findings. Unit coverage exercises every artifact reader and the reference-selection review contract. |
| Google Maps and Places setup | Externally gated | No account, billing, key, API enablement, or origin restriction work is authorized in this branch. |

## Broader capability reconciliation

| Requested system | Status | Disposition |
|---|---|---|
| Native Page IR canvas and OneBox authority | Shipped | Continue. Page IR, stable IDs, candidate gates, evidence, qualification, and promotion stay authoritative. Production rollout remains default-off. |
| OpenDesign as the canvas substrate | Superseded | Do not adopt or fork it. Keep it as a pattern reference. A narrow stateless inspector experiment needs a measured native-canvas gap and separate approval. |
| Discoverability Studio | Missing | Add typed search, metadata, structured-data, sitemap, canonical, crawler-policy, and agent-readability records plus deterministic qualification. |
| Governed Vercel integration | Missing and externally gated | Define a typed adapter first. OAuth, domains, environment changes, staged production, promotion, rollback, and any live deployment need separate approval. |
| Multi-tab Playwright Browser Lab | Partial | Deterministic Playwright gates and viewport scenarios exist. The product does not yet provide a multi-tab research and comparison workspace. |
| Versioned Design and Asset Registry | Partial | OneBox already versions `DESIGN.md`, tokens, run uploads, references, and image-library provenance. It lacks one reusable registry for kits, fonts, components, templates, licenses, and deprecation state. |
| Vendor-neutral Motion/Scene IR | Partial | The product has bounded motion intent and reduced-motion gates. It lacks typed timelines, triggers, scenes, runtime adapters, performance budgets, and WebGL fallbacks. |
| Native GSAP visual authoring | Externally gated | Hold until the competing-builder licensing question receives written clearance. Existing runtime use does not authorize a visual authoring product. |
| Media Project IR and provider adapters | Partial and externally gated | Image generation, provenance, budgets, and a Higgsfield tool boundary exist. Storyboards, shots, characters, camera, lighting, FX, cross-provider jobs, and approved media outputs do not. Paid actions remain approval-gated. |
| Screenshot-to-code importer | Missing | Any experiment must create candidates, preserve rights and provenance, and normalize accepted output into OneBox IR. It cannot become an HTML authority. |
| Agent, MCP, plugin, Zapier, and memory control plane | Partial and externally gated | Current integrations are separate. Build one capability, risk, approval, audit, and revocation model before adding high-side-effect adapters. Memory can suggest context but cannot grant authority. |
| App IR and constrained generative UI | Missing | The production target is intentionally website-only. Add typed state, actions, data bindings, auth boundaries, and a trusted component catalog before generating application surfaces. |

## Sequenced roadmap

### Slice 1: Local Design and Asset Registry

Create a local, versioned registry for design kits, fonts, components, templates, and assets. Each record pins its source, version, digest, license, required notices, provenance, supported project types, specimens, automated checks, and deprecation state. Reuse the current `DESIGN.md`, token inventory, upload, reference, and image-library contracts.

Exit criteria:

- One complete kit can be imported, inspected, versioned, selected, and pinned without network credentials.
- Font and asset rights remain visible at selection and build time.
- Existing runs keep their pinned bytes when the registry receives a newer version.

### Slice 2: Browser Lab and Discoverability records

Add a multi-tab Browser Lab for exploratory research and a separate repeatable qualification runner. Extend Site IR with typed discoverability fields for metadata, canonicals, redirects, structured data, sitemaps, crawler policy, media descriptions, and agent-readable semantics.

Exit criteria:

- Exploratory tabs cannot issue qualification evidence.
- A deterministic job checks scripts enabled and blocked, reduced motion, viewports, links, metadata, structured data, robots, sitemap, accessibility, overflow, console errors, and page errors.
- No Search Console, Google billing, or external deployment is required for local completion.

### Slice 3: Governed Vercel Preview adapter

Define deployment records and typed actions before connecting an account. Then add a private OAuth-backed adapter for index-protected Preview deployments, exact-SHA checks, logs, qualification evidence, and rollback metadata.

Exit criteria:

- One protected Preview record binds the repository SHA, deployment ID, immutable URL, build settings, and qualification run.
- Domain, environment, staged production, promotion, rollback, and deletion remain separate permission classes.
- No production promotion occurs in this slice.

### Slice 4: Motion and Scene IR vertical slice

Add stable targets, timelines, triggers, reduced-motion behavior, script-failure behavior, mobile policy, and performance budgets. Compile ordinary motion to CSS, WAAPI, or Motion. Add optional Lenis and one bounded React Three Fiber scene only behind typed records.

Exit criteria:

- One scroll-controlled site and one small 3D scene stay editable through OneBox IDs.
- Script-blocked, reduced-motion, WebGL-loss, mobile, accessibility, and performance checks pass.
- Native GSAP authoring remains unavailable without written clearance.

### Slice 5: Bounded visual importer

Generate several candidates from a screenshot, recording, or live reference, compare them mechanically and visually, and normalize the accepted result into Site IR.

Exit criteria:

- The importer records rights attestation, source evidence, inferred regions, confidence, and transformation history.
- Accepted output remains semantically editable and passes the normal candidate gates.
- Raw generated HTML, CSS, and JavaScript never become trusted authority.

### Slice 6: Media Project IR

Add briefs, storyboards, shots, characters, references, camera, lighting, FX, generation jobs, estimated and actual cost, provenance, review, and approved outputs. Put Higgsfield, direct GPT Image 2, and later ImageRouter behind one provider contract without hiding provider identity.

Exit criteria:

- Read-only capability browsing works before any paid action is enabled.
- Each paid job shows cost and data handling before explicit approval.
- A provider cannot publish, promote, or become canonical project state.

### Slice 7: App IR and trusted generative UI

Add typed application routes, state, actions, forms, tables, dashboards, data bindings, and auth boundaries. Render agent proposals through a validated trusted component catalog using JSON Render or A2UI patterns.

Exit criteria:

- A data-backed dashboard can be assembled without arbitrary agent-generated host code.
- Side effects remain typed, authorized, logged, and reversible where possible.

### Slice 8: Extension control plane and production release

Unify agent, MCP, plugin, Zapier, and memory adapters under one capability and approval system. Only after those controls pass should OneBox add staged production builds, explicit domain changes, Promote, Rollback, and post-launch search evidence.

Exit criteria:

- Integrations are pinned, least-privilege, revocable, independently qualified, and unable to change their risk class silently.
- Production promotion always names the exact SHA, deployment, domains, test evidence, and rollback target.

## Next recommended slice

Build Slice 1, the local Design and Asset Registry. It is code-ready without credentials or provider spending, extends the review work in this branch, and supplies versioned inputs for Browser Lab, motion, media, importing, and App IR.

## External gates kept separate

- Google sign-in, MFA, Maps billing, API enablement, and key restrictions.
- Vercel OAuth, domain or DNS changes, environment values, deployment, staged production, promotion, rollback, and deletion.
- Paid image, video, model, research, or provider calls.
- GSAP visual-builder licensing clearance.
- Search Console OAuth, IndexNow submission, or production telemetry.
- Production Page IR rollout or promotion.
