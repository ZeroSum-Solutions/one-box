# Plan audit — selection-tool-first

Overall verdict: reject the proposed ordering. Preserve the competitive/design separation as an experimental baseline, but do not build an integrated Refero picker until the renderer can express the choice. Otherwise the experiment measures picker UX attached to a non-responsive design system.

Scope note: the current checkout is `spike/refero-baseline`, with uncommitted edits removing both competitor-to-design prompt paths. Those edits are not landed policy, and no regression test currently proves that scan data cannot re-enter design prompts.

## Verdict per pillar

### P1 — AGREE-WITH-AMENDMENTS

Strongest counterargument: “separate tracks” and “zero eventual influence” are different policies. Competitive research can identify commercially necessary proof, local expectations, and differentiation opportunities without becoming a visual reference. The repository’s requirements already make this distinction: competitors are not design references by default, while their output includes market expectations and differentiation opportunities; business and design evidence remain separate in data and presentation ([requirements](/Users/zero-suminc./projects/one-box/docs/specs/2026-08-13-refero-editor-requirements.md:48)). The category taxonomy also assigns purpose to information architecture and section selection ([taxonomy](/Users/zero-suminc./projects/one-box/docs/WEBSITE-CATEGORIES.md:18)).

Does the counterargument survive? Yes, against P1 as a permanent resting state. It does not defeat P1 as a baseline. Local competitor data is noisy, can encode mediocre conventions, and previously entered design invisibly. Removing `scan.gaps` from reference selection and both scan fields from section selection is correct for the controlled baseline ([lock prompt](/Users/zero-suminc./projects/one-box/src/lib/pipeline.ts:1448), [section prompt](/Users/zero-suminc./projects/one-box/src/lib/pipeline.ts:1846)).

Amendment: keep competitive research report-only during baseline testing. Later permit one explicit, separately measured re-entry point:

- “Preserve expected market information”
- “Use this differentiation opportunity”
- “Ignore competitor-derived recommendations”

That decision should become an approved IA/content constraint, never an invisible prompt injection. Also add a regression test: the existing research-control test proves disabled research makes no provider calls, not that enabled scan content stays out of design prompts ([current test](/Users/zero-suminc./projects/one-box/src/lib/pipelineEvidence.test.ts:52)).

### P2 — DISAGREE

Strongest counterargument: the picker cannot currently cause the design change it purports to offer. The builder always copies the same `site.css`, gates output through a fixed section registry, and renders one HTML topology ([builder](/Users/zero-suminc./projects/one-box/src/lib/builder.ts:36), [frozen template](/Users/zero-suminc./projects/one-box/templates/local-service/index.html.tpl:4)). The engine ledger correctly calls the hardcoded registry and byte-identical stylesheet root causes of sameness and says Refero cannot influence composition ([ledger](/Users/zero-suminc./projects/one-box/docs/ENGINE-LEDGER.md:23)). The taxonomy independently says meaningful variation requires rendered layout topology rather than token changes ([taxonomy](/Users/zero-suminc./projects/one-box/docs/WEBSITE-CATEGORIES.md:90)).

Does the counterargument survive? Completely. A user-selected reference processed through the current renderer will mostly change colors, fonts, spacing constants, and imagery instructions. That is effectively the failed A/B with a different selector. It may test whether users enjoy browsing references, but it cannot test whether their selection improves the resulting site.

The minimum renderer change is not a large pattern library. It is a constrained composition contract that can express, at minimum:

- hero slot order, spans, overlap, media geometry, and responsive stacking;
- section surface arc and varied vertical rhythm;
- text measure, alignment, density, and visual priority;
- grid/list/split/bleed topology for major sections;
- card anatomy and interaction treatment;
- imagery crop and placement;
- one bounded motion signature plus reduced-motion behavior.

The existing layout-IR spike is already close to that approach. It produced genuine same-brief topology differences, but failed its iteration budget and retained one broken hero ([results](/Users/zero-suminc./projects/one-box/spikes/layout-ir/FINDINGS.md:23)). Its own conclusion is explicit: repair and re-score the compiler before proceeding to the picker ([recommendation](/Users/zero-suminc./projects/one-box/spikes/layout-ir/FINDINGS.md:111)).

User selection is also not proven superior to model selection. The defensible evidence is narrower:

- Visual preferences vary substantially across people and demographic groups; a large CHI study collected 2.4 million ratings from nearly 40,000 participants and found strong preference variation ([Reinecke and Gajos](https://www.eecs.harvard.edu/~kgajos/papers/2014/reinecke14visual.shtml)).
- “Choice overload” is not an automatic objection: a meta-analysis of 50 experiments found a near-zero mean effect with large contextual variation ([Scheibehenne et al.](https://academic.oup.com/jcr/article-abstract/37/3/409/1827647?login=false)).
- Preference-elicitation research favors small comparative sets—typically two to five—because qualitative comparison is easier than absolute specification ([Frontiers review](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2017.00071/full)).

None of that establishes that a local-business owner’s favorite reference will produce the best acquisition site for the owner’s customers. User selection captures owner preference and consent. It does not certify design competence, audience fit, or conversion performance.

Amendment: test three curated directions, each shown using the client’s real content in a composition-capable thumbnail or mockup. Explain what will carry into the build and what will not. Include “Recommend one for me.” Do not present a raw Refero gallery.

The documented three-axis taxonomy is also not a Refero retrieval taxonomy: its axes separately govern purpose/IA, technology setup, and model routing. The current Refero wrapper supports semantic query plus platform—not structured category filtering ([Refero wrapper](/Users/zero-suminc./projects/one-box/src/lib/tools/refero.ts:358)). For local services, the screen corpus has already returned semantically wrong results and zero contractors across two direct searches ([ledger](/Users/zero-suminc./projects/one-box/docs/ENGINE-LEDGER.md:105)). Use style search for this pilot and treat screen retrieval as unsupported unless fresh evidence overturns that result.

### P3 — AGREE-WITH-AMENDMENTS

Strongest counterargument: pipeline stages are not independent variables. An upstream signal can look useless when the downstream renderer cannot express it, then become valuable after the renderer changes. “Locking” the selector before changing composition could freeze conclusions produced by the old bottleneck.

Does the counterargument survive? Yes. The A/B demonstrates this interaction: the fixed template and gates carried much of the quality floor, while references affected only tokens ([A/B observations](/Users/zero-suminc./projects/one-box/docs/eval/ab/results.md:55)). It does not establish that references are intrinsically useless.

Amendment: lock experimental interfaces, fixtures, prompts, seeds, rubrics, and decision thresholds—not the permanent implementation. Version every stage contract. Reopen an upstream stage whenever downstream expressivity changes materially.

“One next-largest influence at a time” is sound only after establishing a complete causal path:

`selected signal → executable contract → visibly different render → blinded evaluation`

Product exploration can proceed in parallel offline. Integration should proceed serially. That preserves speed without contaminating the production baseline.

The evaluation evidence also remains limited: the nine outputs represent three prompt groups, the advisory graders disagreed substantially, and the founder’s judge-of-record scores remain pending ([results](/Users/zero-suminc./projects/one-box/docs/eval/ab/results.md:45)). Treat it as a strong routing result, not a general statistical conclusion.

### P4 — DISAGREE

Strongest counterargument: the evidence identifies composition expressivity—not selection—as the next bottleneck. The D/D+ baseline failed on generic hero construction, flat surface progression, rudimentary cards, weak hierarchy, and minimal motion ([outside audit](/Users/zero-suminc./projects/one-box/spikes/refero-baseline/audit/outside-grade.md:7)). The three same-content variants improved primarily through layout topology, surface treatment, hierarchy, interaction, and motion ([variant A](/Users/zero-suminc./projects/one-box/spikes/wits-variants/a-editorial/audit/outside-grade.md:7), [variant C](/Users/zero-suminc./projects/one-box/spikes/wits-variants/c-artdirected/audit/outside-grade.md:7)).

Does the counterargument survive? Yes. The Refero-selection hypothesis is plausible, but the ordering does not survive. The existing experiment falsified the current tokens-only route. The hand-built variants and layout-IR spike point to renderer expressivity as the next-largest lever.

A fair Refero test must carry more than tokens:

- 3–5 preserved composition traits;
- layout topology and responsive behavior;
- surface/rhythm arc;
- typography hierarchy and density;
- media strategy and crop;
- component anatomy;
- interaction and motion rules;
- explicit rejects that prevent reversion to the generic template.

That cannot be tested honestly without some composition machinery. This is the chicken-and-egg answer: a picker can be tested first for usability and preference elicitation, but not for generated-site quality. Do not conflate those experiments.

## The strongest case against the plan

The plan risks building polished false agency: users choose among professional references, receive near-identical sites because the renderer cannot honor those choices, and the team then concludes either that Refero or user choice has no value. The retrieval scheme is based on a taxonomy that was not designed for visual search, the local-service screen corpus is already known to misfire, palette display will make color disproportionately salient even though structure is the proven bottleneck, and sequential “locking” may freeze upstream conclusions produced by downstream incapacity. Meanwhile, permanent report-only competitive research discards potentially valuable IA and trust signals. The likely result is another null experiment with more UI, more latency, more contracts, and less diagnostic clarity.

## Failure modes and hidden costs (ranked)

1. **Invalid causal test.** The chosen reference cannot materially alter composition, so a null result says nothing about selection quality.

2. **Work on the wrong bottleneck.** Current evidence points to hero, topology, section rhythm, hierarchy, card craft, and motion—not candidate selection.

3. **False user agency.** A visible choice that the output does not faithfully express is worse than model selection because it creates a broken promise.

4. **Optimizing owner taste instead of acquisition performance.** The person buying the site is not necessarily representative of the site’s prospective customers.

5. **Retrieval/taxonomy mismatch.** Purpose, runtime, and model-routing categories do not form a visual-style ontology; Refero currently accepts semantic queries, not those three structured axes.

6. **Reference-corpus bias.** Local-service screen searches have already produced legal pages, SaaS, EV, and unrelated results. Popular style attractors could make outputs converge around the same fashionable directions.

7. **Palette salience bias.** Showing swatches makes the easiest visible attribute dominate selection, even though structural factors affect perceived diversity and craftsmanship while color most directly affects colorfulness ([experimental study](https://www.sciencedirect.com/science/article/pii/S0747563215001776)). Refero-derived role combinations have also already failed contrast gates ([ledger](/Users/zero-suminc./projects/one-box/docs/ENGINE-LEDGER.md:113)).

8. **Premature product surface.** Search, caching, candidate explanations, screenshots, palette extraction, persistence, change-selection behavior, unavailable-reference recovery, and OAuth failure states become maintained product code before the underlying hypothesis passes.

9. **Over-learning from weak evaluation.** The original A/B has only three prompt families and no completed judge-of-record sheet. The hand-built variants prove a presentation ceiling, but all also contained serious unsupported claims and stock-evidence problems; they are not production outcomes.

10. **Permanent loss of market intelligence.** “Report-only forever” discards user-mediated table-stakes and differentiation decisions that could improve IA without contaminating visual direction.

## What I would actually build first

1. **Freeze the next experiment.** Record the exact hypothesis, briefs, seeds, assets, rubrics, evaluators, and success threshold.  
   *Measure:* reproducibility and complete blinded score rows.

2. **Make competitor exclusion an explicit versioned policy.** Add tests proving `scan.commonSections` and `scan.gaps` cannot enter reference, composition, or copy prompts under the baseline policy.  
   *Measure:* prompt snapshots/hashes and negative-injection tests.

3. **Repair the existing layout-IR spike before creating new architecture.** Fix the broken hero and re-score all four outputs.  
   *Measure:* deterministic recompilation, topology differences at 1440/390, all gates, and the pre-registered “3 of 4 would ship” criterion.

4. **Define a minimal `ReferenceContract` beyond tokens.** Include preserved traits, layout slots/rows/spans, surface arc, density, media treatment, component anatomy, motion, responsive behavior, and rejects.  
   *Measure:* every selected trait is either executable or explicitly marked unsupported.

5. **Produce three materially distinct directions from identical client content.** Use the constrained compiler, not a growing catalog of named heroes/cards.  
   *Measure:* bounding-box/topology divergence, visual-diff evidence, and no case-specific CSS branches.

6. **Grade the rendered directions before exposing a picker.** Use the frozen presentation rubric and blind the evaluator to the reference and producer.  
   *Measure:* composition-capable outputs versus both the frozen-template baseline and expressive no-reference control.

7. **Build a disposable picker probe.** Show three pre-vetted, plain-language directions using client-content thumbnails; make palettes secondary; include “Recommend one for me.”  
   *Measure:* completion rate, decision time, confidence, abandon rate, and selection reversals.

8. **Test owner preference separately from audience performance.** Owners select; representative target users judge credibility, clarity, and intended action without knowing which owner selected.  
   *Measure:* owner satisfaction and target-user outcome as separate metrics.

9. **Run the fair reference experiment on the expressive renderer.** Compare no reference, model-selected reference, and user-selected reference using the same renderer and content.  
   *Measure:* pre-registered presentation uplift, distinctiveness, conversion clarity, latency, cost, and repair effort.

10. **Only after that, test competitor re-entry.** Let users approve one market expectation or differentiation opportunity as an IA/content constraint.  
    *Measure:* its incremental effect versus the clean design baseline, with provenance visible.

## Questions the founder must answer before building

- What is the picker meant to improve: owner confidence, perceived agency, design grade, target-customer trust, conversion clarity, or actual conversion?
- Is the user selecting a raw Refero site, a translated design direction, or a mockup using their own content?
- Whose taste governs when the owner’s preference conflicts with the target audience’s response?
- Is “Recommend one for me” a supported default, and is skipping selection allowed?
- Which exact reference traits must the renderer honor before the choice is considered truthful?
- What pre-registered uplift makes user selection worth its intake friction and engineering cost?
- Is P1 a baseline policy or a permanent product rule? What explicit event permits competitor insight to re-enter?
- Which taxonomy axis drives Refero retrieval? The current three axes have different documented consumers.
- Is the layout-IR spike still the intended non-pattern-library route, and what evidence would promote or retire it?
- What happens when Refero returns irrelevant, inaccessible, corrupted, unlicensed, or compositionally unsupported references?
- Will users see only pre-vetted directions, or can popularity and retrieval rank determine the candidate set?
- Who owns palette extraction, contrast correction, screenshot rights, source persistence, and reference-removal recovery?

