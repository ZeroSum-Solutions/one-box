# One-Box task-to-model matrix

Status: provisional evidence matrix. `Unmeasured` is intentional; a missing or
unauthenticated run is never converted into a score or a routing win.

The quality scale is the pre-registered 0–4 rubric in `benchmark-plan.md`.
Speed is wall time from dispatch to a usable artifact. Effective cost includes
failed attempts and review/repair work; subscription lanes are reported as
subscription, never as zero-dollar inference.

| Task class | Candidate/configuration | Quality | Speed | Effective cost | Confidence | Recommended lane now |
|---|---|---:|---:|---:|---|---|
| Repository implementation and repair | GPT-5.6 Sol, high/xhigh, Codex OAuth | Unmeasured in blinded fixtures | Unmeasured | Subscription; marginal API cost N/A | Medium operating evidence, no benchmark win | Default development lane pending benchmark |
| Utility extraction and compression | GPT-5.6 Luna, xhigh, Codex OAuth | No score; artifact not produced | Two failed starts | Subscription plus two failed attempts | High confidence in current incompatibility only | Unavailable; do not route until a successful compatibility probe |
| Refero ecosystem research | GPT-5.6 Terra, xhigh, Codex OAuth | Accepted for the bounded source-verification task; not blind-scored | One completed run; timing not captured | Subscription; no repair round recorded | Low outside this exact research task | Compatibility/research comparison only |
| Technical implementation | Grok 4.6 (`x-ai/grok-4.6`), high, OpenRouter | Unmeasured | Unmeasured | Catalog: $2/M input and $6/M output under 200k prompt tokens | Catalog availability confirmed; quality unknown | Candidate only; no production route |
| Adversarial code audit | Grok 4.6 (`x-ai/grok-4.6`), high, OpenRouter | Pending seeded-defect and live-diff audits | Pending | Same catalog lane plus review time | Low until authenticated audits finish | Mandatory advisory reviewer for this goal once vault unlocks; never certification authority |
| Runtime orchestration and visual synthesis | Gemini 3.1 Pro Preview, OpenRouter | Nine historical sites completed gates, but isolated contribution is unmeasured | Historical aggregate only | Historical three-arm experiment total was $5.18 across all providers and tools | Low for expanded task | Keep current pinned runtime; no expansion |
| Runtime frontend generation | Kimi K3, OpenRouter | Nine historical sites completed gates, but isolated contribution is unmeasured | Historical aggregate only | Included in the inseparable $5.18 experiment total | Low for editor/Tailwind/motion work | Keep current pinned runtime; no expansion |
| Runtime classification/extraction | DeepSeek V4 Flash, OpenRouter | Unmeasured by task class | Historical aggregate only | Included in the inseparable $5.18 experiment total | Low | Keep current bounded classification route only |

## What the matrix authorizes

- It authorizes no new runtime model switch.
- It preserves the current pinned runtime slugs while the controlled benchmarks
  remain incomplete.
- It authorizes Grok 4.6 only as the user-requested independent advisory audit
  lane after authenticated access is available.
- It records Luna as unavailable for this machine state, not as a quality loss.
- It records Terra's successful research task without generalizing that result
  to implementation, design direction, or review.

## Required evidence to promote a lane

A task-class recommendation becomes measured only after the exact model/provider/
effort configuration meets the threshold across the registered fixtures, is
blind-scored by independent evaluators, records wall time and provider usage, and
passes deterministic acceptance. Until then, `policy.md` remains provisional and
the decision log keeps hypotheses separate from confirmed results.
