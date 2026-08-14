# Baseline Path A and Path B rubric

Status: frozen before the controlled comparison run.

Path A is the current One-Box pipeline at the recorded Git commit. Path B is a
direct Refero MCP research workflow using the identical
`brief-v1.json`. Both paths must produce the same artifact types and use the same
builder model, template, copy facts, imagery policy, viewport checks, and quality
gates. The only intended variable is the research and synthesis handoff.

Score each area from 0 to 4 and cite an artifact or rendered screenshot.

| Area | Required evidence |
|---|---|
| Reference relevance | source IDs, rationale, page/target fit, and confidence |
| Structural usefulness | concrete hierarchy, navigation, conversion, and mobile patterns |
| Source credibility | source URL, capture time, provider, and fact/inference label |
| Design contract | specific visual thesis, role-scoped tokens, media direction, and rejected alternatives |
| Token and Tailwind plan | semantic variables, traceable source, responsive variants, and no raw utility sprawl |
| Visual quality | intentional hierarchy, coherent typography, color, spacing, and composition |
| Responsiveness | rendered desktop, tablet, and mobile checks |
| Brand specificity | matches the factual brief without generic template behavior |
| Accessibility and performance | gate output, focus, contrast, motion, and asset evidence |
| Unsupported output | invented claims, copied reference, or ungrounded recommendation |
| Efficiency | time, metered cost, retries, and repair rounds |

Automatic rejection: invented business fact, copied reference composition without
synthesis, missing mobile output, broken blocking gate, hidden paid fallback, or a
research artifact with no provenance.

Two evaluators receive randomized A/B labels and no provider/model names. A finding
records severity, evidence, originating stage if known, certainty, and the smallest
safe corrective experiment. The output cannot change routing until the unblinded root
cause log identifies a stage-level difference.
