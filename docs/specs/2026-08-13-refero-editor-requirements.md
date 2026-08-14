# One-Box implementation contract

This contract restates the three supplied briefs as testable requirements. It does not select an architecture, model, threshold, file layout, or product policy that the briefs leave open.

## A. Direct implementation acceptance criteria

### Architecture, modes, and editing

- **IMP-001** Before implementation, the current architecture, active worktrees, active files, preview/canvas boundary, rendering surface, editable-site representation, site-data source of truth, animation lifecycle, and responsive rendering are inspected and recorded.
- **IMP-002** Active and uncommitted work is identified and protected; implementation avoids broad refactors.
- **IMP-003** View mode and Edit mode are explicit, user-visible modes.
- **IMP-004** View mode preserves published behavior for navigation, buttons, animation, WebGL, parallax, hover, scrolling, and other interactive elements.
- **IMP-005** In Edit mode, clicking ordinary text enters direct text editing.
- **IMP-006** Direct text editing supports adding, deleting, and replacing text.
- **IMP-007** Button editing supports both label text and destination/action configuration.
- **IMP-008** Typography editing includes font family, font size, weight, color, and alignment; basic spacing is included only if supported by the existing design system.
- **IMP-009** Selection, text-editing, and element-dragging states are visually and behaviorally distinct.
- **IMP-010** Edit mode preserves undo/redo, escape/cancel, focus handling, and accessibility.
- **IMP-011** Each complex interactive content type used by a site has documented Edit-mode behavior chosen from fully live, selected-but-interactable, paused, or safe editable overlay.
- **IMP-012** Complex content that cannot be safely edited in place has a clear fallback.
- **IMP-013** Edit-mode controls safely take precedence over navigation and transient interactions when needed without imposing a global disable-all rule where safe live behavior is possible.
- **IMP-014** The selected preview architecture preserves responsive CSS, animation timing, and interactive behavior.

### Resizable preview and durable workbench

- **IMP-015** After rendering, the site preview appears on the left, the workbench on the right, and a draggable divider between them.
- **IMP-016** Dragging the divider resizes both panels smoothly in either direction.
- **IMP-017** Preview width is the rendered site's actual responsive viewport width, not a visually scaled shell.
- **IMP-018** Crossing configured tablet and mobile thresholds displays subtle breakpoint indicators without jumpy resizing.
- **IMP-019** Releasing the divider preserves the chosen panel layout.
- **IMP-020** The workbench supports expanded, normal, collapsed-to-icon-rail, and reopened states.
- **IMP-021** The collapsed rail is discoverable, polished, keyboard-accessible, and provides clear icons with intentional padding.
- **IMP-022** Collapsing the workbench allows the preview to fill nearly the entire workspace.
- **IMP-023** The initial durable tool system includes selection/layout, text/button editing, asset/image generation, research findings, and motion editing, plus existing tools where present.
- **IMP-024** Tool ownership, tool-state persistence, and targeting of the currently selected site element are defined.
- **IMP-025** Each tool has empty, loading, error, and unsupported states.
- **IMP-026** The rail has a defined way to scale as tools are added.
- **IMP-027** The interface remains responsive, accessible, keyboard-operable, and usable on smaller screens.

### Intake, uploads, targets, and research systems

- **IMP-028** The intake surface replaces “referral research” with a credible user-facing label; the final label is chosen for the product tone and the rationale is documented.
- **IMP-029** Intake includes a Research control that lets a user opt into or configure research before generation.
- **IMP-030** Intake includes upload support for relevant business artifacts and inspiration, including logos, brand guidelines, screenshots, copy documents, do/don't lists, wish lists, and folders/archives where safely supported.
- **IMP-031** Upload UI and handling explicitly disclose accepted types, size limits, extraction behavior, privacy, and failure states.
- **IMP-032** Intake provides at least Website, Web app, and iOS app project targets.
- **IMP-033** The selected project target changes research criteria, design-language analysis, platform assumptions, generated requirements, and the resulting build.
- **IMP-034** Competitive research is a business-strategy system and does not make a competitor site a design reference by default.
- **IMP-035** Competitive research accounts for client category, geography where applicable, target buyer, positioning, and maturity.
- **IMP-036** Competitive output identifies selected competitors and selection rationale, strengths, weaknesses/gaps, differentiation opportunities, relevant market expectations, evidence links, permitted screenshots, and confidence.
- **IMP-037** Competitive output separates observed facts from strategic inference and contains no unsupported or generic competitor claims.
- **IMP-038** Refero MCP is the primary source for design/structural references, driven by business type, audience, project target, page type, desired brand attributes, approved inspiration, functional requirements, complexity, and current design quality.
- **IMP-039** Refero output identifies reusable patterns rather than copying a site, and gives a learning rationale for every reference (such as hierarchy, navigation, grid, information architecture, interaction, conversion structure, visual tone, or mobile pattern).
- **IMP-040** Competitive-business research and Refero-driven design-reference research remain explicitly separated in data, workflow, and presentation.

### Crawling and observability

- **IMP-041** Known URLs and supported public pages use local Crawl4AI as the default research/extraction provider for the demo.
- **IMP-042** Crawl4AI and Firecrawl remain modular behind a provider interface.
- **IMP-043** Firecrawl is available only as fallback for local-crawl failure, bot challenge, a required unsupported capability, or a user-approved paid fallback.
- **IMP-044** Paid Firecrawl fallback never occurs silently.
- **IMP-045** Every crawl records provider, failure reason where applicable, source URL, extraction timestamp, and confidence.
- **IMP-046** Research, crawler, and fallback decisions are observable to the user.

### Design system, Tailwind v4, and CSS

- **IMP-047** Every generated or reconstructed site has a deliberate, project-specific design contract created before implementation from approved findings.
- **IMP-048** Design research captures credible evidence for typography, spacing, color, contrast, grids, layout rhythm, responsive patterns, components, and interactions.
- **IMP-049** Source-derived evidence is distinguishable from implementation decisions, inferences, and generated recommendations.
- **IMP-050** Generated sites use Tailwind CSS v4 with semantic CSS custom properties as token source of truth and Tailwind v4 theme mappings consuming those properties.
- **IMP-051** Named tokens cover color, typography, spacing, radii, borders, shadows, breakpoints, motion, layering, and component states.
- **IMP-052** Token names are semantic rather than visual or literal.
- **IMP-053** Responsive tokens and component-level variants are supplied where necessary.
- **IMP-054** Design-system defaults provide accessible contrast and reduced-motion behavior.
- **IMP-055** Generated components contain no raw Tailwind color, spacing, radius, or shadow literals unless the design contract explicitly justifies them.
- **IMP-056** A sampled screenshot value becomes a token only after it is established as a reusable system decision.
- **IMP-057** Reconstruction preserves required source-site fidelity while keeping styles maintainable through tokens.
- **IMP-058** The workbench has a token-inspection surface where users can understand and safely edit shared style decisions.
- **IMP-059** Before applying a shared-token change, the UI shows its scope and affected elements.
- **IMP-060** Generated CSS remains portable outside One-Box.
- **IMP-061** The evidence workflow enforces this order: design evidence, design contract, token proposal, Tailwind v4 plan, CSS architecture, then build.
- **IMP-062** At every workflow gate, users can preview, approve, revise, export, and save the artifact to the project record.
- **IMP-063** Code generation cannot begin before the Tailwind v4 plan review step.
- **IMP-064** CSS architecture distinguishes global, page-scoped, and component-scoped styles and records justified exceptions.

### GSAP motion authoring

- **IMP-065** Selecting an element exposes its motion configuration.
- **IMP-066** The validated motion model supports entrance, exit, hover, scroll-triggered, and timeline-based sequences.
- **IMP-067** Motion configuration supports duration, delay, easing, transform properties, trigger, and replay behavior.
- **IMP-068** Users can preview motion in context and safely reset or remove it.
- **IMP-069** Motion authoring uses a constrained, validated, serializable model and does not permit arbitrary JavaScript execution.
- **IMP-070** Motion behavior is defined for View mode and Edit mode and is compatible with responsive breakpoints.
- **IMP-071** Motion respects reduced-motion preferences.
- **IMP-072** Animation lifecycle cleanup prevents orphaned ScrollTriggers, duplicate timelines, memory leaks, and preview-size-dependent behavioral drift.
- **IMP-073** Responsiveness, WebGL, parallax, and existing site behavior remain intact after motion changes.

## B. Saved evidence and artifact acceptance criteria

- **ART-001** Current-state findings identify confirmed architecture/relevant files, protected active-work areas, and unresolved implementation decisions.
- **ART-002** UX/technical design documents the mode model, responsive workbench/preview, element editing, intake/research/uploads, crawler providers, and GSAP authoring.
- **ART-003** The incremental implementation plan uses small dependency-ordered slices and states file ownership, tests, and rollback for every nontrivial change.
- **ART-004** An acceptance matrix covers desktop/tablet/mobile resizing, workbench collapse/restore, text/button editing, View fidelity, Edit safety, WebGL/parallax/hover, Crawl4AI/fallback, and motion editing/reduced motion/cleanup/persistence.
- **ART-005** Every project has a saved, viewable evidence workspace available before build.
- **ART-006** The evidence workspace preserves Refero results, source links, screenshots or extracted evidence, relevance rationales, and typography/palette/spacing/layout/component/interaction/responsive findings.
- **ART-007** The evidence workspace visibly labels source evidence, inferred decisions, and generated recommendations.
- **ART-008** Every project saves a design research ledger with links, screenshots or extracted evidence, and confidence.
- **ART-009** Every project saves a design contract defining the intended visual language.
- **ART-010** Every project saves a token inventory containing semantic name, value, usage, source, and editability.
- **ART-011** Every project saves proposed Tailwind theme mappings, semantic tokens and rationales, component variants, and responsive rules.
- **ART-012** Every project saves a CSS-variable hierarchy, token-to-component usage map, style scope map, generated CSS, and justified exceptions.
- **ART-013** Every project saves a Tailwind v4/CSS-variable architecture map.
- **ART-014** Every project saves a visual-QA checklist for desktop, tablet, mobile, hover, focus, applicable dark/light behavior, and reduced motion.
- **ART-015** Gate artifacts remain previewable, approvable, revisable, exportable, and persistently attached to the project record.

## C. Experiment and benchmark acceptance criteria

### Controlled pipeline baseline and quality audit

- **EXP-001** Before random prompt edits or broad pipeline implementation changes, a controlled baseline experiment is run.
- **EXP-002** One versioned brief is used unchanged in Path A (current One-Box pipeline) and Path B (direct Refero MCP workflow).
- **EXP-003** Both paths hold constant the client/business brief, product target, pages/functionality, brand constraints, reference-selection criteria, output format, and evaluation rubric.
- **EXP-004** Both paths record every prompt, model, tool call, source, extracted artifact, intermediate summary, design contract, token proposal, and generated result.
- **EXP-005** The side-by-side comparison evaluates reference quality/relevance, structural usefulness, source freshness/credibility, design-contract quality, token/Tailwind plan quality, visual quality, responsiveness, brand specificity, accessibility, reference fidelity, generic-template behavior, unsupported claims, time, cost, retries, and repair effort.
- **EXP-006** Refero is not presumed superior; both paths are independently evaluated against the same rubric.
- **EXP-007** Root-cause analysis tests weak/stale sources, competitive contamination, prompt framing, lossy synthesis, contract weakness, token weakness, model routing, handoff failure, implementation defects, and weak evaluation as possible causes.
- **EXP-008** Every quality-audit finding states severity, evidence, originating stage if identifiable, certainty (confirmed/inferred/unresolved), and the smallest safe corrective experiment.
- **EXP-009** The audit evaluates intentionality, audience/category/position fit, product-appropriate structure, hierarchy, coherent typography/color/spacing/composition, modern relevant references, semantic traceable tokens, maintainable CSS, three-width responsiveness, accessibility, performance, generic AI patterns, arbitrary decoration, and unsupported strategy claims.
- **EXP-010** A revised pipeline is proposed only after evidence identifies what is failing.

### Model-routing benchmark

- **BEN-001** A blinded evaluation rubric is defined before model testing, and artifact evaluators do not know the producing model.
- **BEN-002** No model is declared best from self-evaluation or a single reviewer.
- **BEN-003** Candidate evaluation includes Grok 4.6 for technical implementation and treats its perceived speed/strength as an unconfirmed hypothesis.
- **BEN-004** Candidates are evaluated for research/discovery, extraction/synthesis, design analysis/contract creation, spec/requirement QA, frontend implementation, Tailwind/CSS tokens, editor architecture, GSAP, WebGL/3D, code review, visual critique, verification/test orchestration, repair/integration, and strategic/adversarial architecture audit.
- **BEN-005** Every candidate/task measurement includes rubric quality, first-pass acceptance, independent-review defects, relevant visual fidelity, latency to usable result, repair rounds, effective cost including retries/reviewer time, subscription-versus-metered lane, reliability, context handling, and tool compatibility.
- **BEN-006** Representative tasks include a static marketing page, premium brand/editorial page, ecommerce page, responsive Tailwind v4 component system, editor/canvas feature, GSAP feature, WebGL/3D preview, competitive-research report, seeded-defect code review, and visual comparison with approved de-branding changes.
- **BEN-007** The benchmark plan records fixed inputs, rubrics, evaluator assignments, and success thresholds.
- **BEN-008** The task-to-model matrix reports quality, speed, effective cost, confidence, and recommended lane.
- **BEN-009** The routing policy assigns each stage a default, low-risk fast path, difficult/repeated-failure escalation model, and independent reviewer model or model family.
- **BEN-010** The routing policy states retry/escalation/human-review triggers, maximum repair rounds, cost/latency budgets, and evidence required to change policy.
- **BEN-011** The fallback policy covers unavailable, slow, and failing models.
- **BEN-012** A cheaper model is used for a task class only when benchmark evidence shows the same acceptance standard is met.
- **BEN-013** The decision log separates confirmed results, operating hypotheses, and assumptions requiring data.

## Required deliverables

1. Current-state findings (`ART-001`).
2. UX and technical design (`ART-002`).
3. Incremental implementation plan (`ART-003`).
4. Acceptance matrix (`ART-004`).
5. Saved, viewable evidence workspace for every project (`ART-005`–`ART-015`).
6. Explicit separation of competitive-business research and Refero-driven design research (`IMP-034`–`IMP-040`).
7. Versioned baseline brief and identical-input Path A/Path B run (`EXP-001`–`EXP-004`).
8. Side-by-side research, design-contract, token, and build outputs (`EXP-005`).
9. Independent quality-audit report (`EXP-006`, `EXP-008`, `EXP-009`).
10. Root-cause decision log (`EXP-007`).
11. Evidence-gated revised pipeline proposal (`EXP-010`).
12. Task-to-model matrix (`BEN-008`).
13. Benchmark plan (`BEN-007`).
14. One-Box model-routing policy (`BEN-009`, `BEN-010`).
15. Model fallback policy (`BEN-011`).
16. Model decision log (`BEN-013`).

## Constraints and protected behavior

- Preserve published-preview fidelity and existing View-mode navigation/button behavior.
- Prefer separate View/Edit modes when fully live editing cannot be made safe.
- Do not execute arbitrary code inside generated sites or motion controls.
- Do not silently use paid Firecrawl.
- Use local Crawl4AI first for known supported public URLs in this demo.
- Do not conflate competitive-business research with design-reference research.
- Do not copy a particular Refero site; extract patterns with rationale.
- Do not skip evidence gates and go directly from research to code.
- Do not use raw utility sprawl or undocumented visual decisions; keep exported CSS portable.
- Preserve accessibility, keyboard operation, smaller-screen usability, contrast, reduced motion, responsiveness, performance, WebGL, parallax, and animation cleanup.
- Protect active/uncommitted work, use a thin verified vertical slice first, and avoid broad refactors.
- Do not declare a feature complete until rendered behavior has been directly tested.
- Do not change the pipeline broadly until the controlled experiment identifies a failure source.
- Do not select or downgrade models on reputation, intuition, plausible output, self-evaluation, or one successful run.

## Material ambiguities requiring inspection or decision

- **AMB-001 — Repository/project location:** The briefs do not identify the current One-Box repository or authoritative branch/worktree.
- **AMB-002 — Existing architecture:** Preview isolation, current rendering surface, editable-site representation, site-data source of truth, animation lifecycle, responsive implementation, existing tools, undo/redo, and component boundaries must be discovered before architecture is chosen.
- **AMB-003 — Preview technology:** The briefs require evaluating iframe, isolated canvas/runtime, or existing rendering surface but do not prescribe one.
- **AMB-004 — Complex-content Edit behavior:** The correct live/paused/overlay behavior must be selected per actual content type after inspection.
- **AMB-005 — Breakpoints and persistence:** Tablet/mobile thresholds and whether panel state persists per session, user, or project are not specified.
- **AMB-006 — Workbench geometry:** Numeric panel sizes, rail width, “nearly the entire workspace,” animation timing, and smaller-screen layout are not defined.
- **AMB-007 — Editing scope:** Layout-editing operations, button action types, and “basic spacing” capabilities depend on existing representation/design-system support.
- **AMB-008 — Upload policy:** Exact file types, size/count limits, folder/archive support, extraction rules, storage/retention/privacy policy, and failure recovery require product/security decisions.
- **AMB-009 — Research control:** Whether the Research control is binary, configurable, or both, and which options it exposes, is unspecified.
- **AMB-010 — Final intake label:** “Design Research” is an example, not a mandated string; tone and final naming require inspection/approval.
- **AMB-011 — Geography applicability and competitor selection:** Rules for when geography applies, source coverage, number of competitors, screenshot permissions, and confidence scale are unspecified.
- **AMB-012 — Refero availability/contract:** Required Refero MCP tools, schemas, authentication, usage limits, and permitted evidence storage must be confirmed.
- **AMB-013 — Firecrawl approval:** The exact user-approval interaction and paid-fallback budget are unspecified.
- **AMB-014 — Token editor safety:** Allowed value ranges, validation, preview/revert flow, approval granularity, and token edit permissions are unspecified.
- **AMB-015 — Design contract format:** Required schema, versioning, approval authority, and export formats are not defined.
- **AMB-016 — Dark/light behavior:** It is required only “when applicable”; applicability and expected modes must be decided per project.
- **AMB-017 — Motion schema:** Exact allowed transforms/easings/triggers, timeline composition limits, serialization version, and breakpoint override rules are unspecified.
- **AMB-018 — Rollback and test environment:** Required test framework, visual-diff tooling, supported browsers/devices, rollback mechanism, and pass tolerances require repository inspection.
- **AMB-019 — Baseline fixture:** The identical versioned client brief, required outputs, reference criteria, and artifact format for the experiment have not been supplied.
- **AMB-020 — Evaluation governance:** Rubric scales, severity/confidence scales, success thresholds, evaluator identities/families, blinding mechanism, and human-review authority are unspecified.
- **AMB-021 — Model candidate set and access:** Aside from Grok 4.6, the candidate roster, exact versions, tool access, subscription/metered lanes, and availability are unspecified.
- **AMB-022 — Benchmark budgets:** Maximum cost, latency, repetitions/sample size, repair-round ceiling, and statistical confidence requirements are not specified.
- **AMB-023 — Evidence persistence:** Project-record storage, schema, version history, approval states, export formats, retention, and screenshot/source licensing are unspecified.
- **AMB-024 — Delivery scope/order:** The briefs require a thin slice first but do not select that slice or state which direct features versus experiments must ship in the present iteration.
