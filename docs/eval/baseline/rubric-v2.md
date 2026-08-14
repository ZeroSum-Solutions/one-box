# Baseline Path A and Path B rubric v2

Status: frozen before the controlled comparison run.

Both paths use identical brief, builder configuration, copy facts, imagery policy,
quality gates, and current-source commit. The only variable is the research and
synthesis handoff. Score every area from 0 to 4 using an evaluator-visible artifact,
the built `site/` files, or the approved desktop/tablet/mobile screenshots.

| Area | Required evidence |
|---|---|
| Reference relevance | neutral source IDs, rationale, target fit, confidence |
| Structural usefulness | hierarchy, navigation, conversion, mobile patterns |
| Source credibility | neutral source ID, freshness, confidence, fact/inference label |
| Design contract | visual thesis, role-scoped tokens, media direction, rejected alternatives |
| Token and Tailwind plan | semantic variables, traceable source, responsive variants |
| Visual quality | rendered hierarchy, type, color, spacing, composition |
| Responsiveness | approved desktop, tablet, and mobile screenshots and built CSS |
| Brand specificity | factual brief fit without generic template behavior |
| Accessibility and performance | focus, contrast, reduced motion, asset evidence, built HTML/CSS |
| Unsupported output | invented claims, copied reference, ungrounded recommendation |
| Efficiency | coordinator-only provenance after scoring; evaluators score repair evidence only |

Automatic rejection: invented business fact, copied reference composition without
synthesis, missing built site files, missing approved desktop/tablet/mobile output,
broken blocking gate, hidden paid fallback, screenshot metadata/identity leak, or a
research artifact with no provenance.

2 distinct human evaluators independently receive randomized A/B labels and no
provider/model/path identity, timing, cost, or coordinator metadata. A finding names
severity, evaluator-visible evidence, certainty, and the smallest safe corrective
experiment. No routing change occurs until unblinded root-cause analysis is complete.
