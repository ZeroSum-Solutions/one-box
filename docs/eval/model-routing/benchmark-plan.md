# One-Box model-routing benchmark plan

Status: pre-registered. Do not edit thresholds after opening producer outputs.

## Purpose

This benchmark selects models for bounded One-Box task classes. It does not rank
general intelligence. A result belongs to the exact model, provider, effort,
prompt version, tool set, and task fixture that produced it.

Refero content is research evidence, not model-training or model-benchmark data.
Fixtures may contain our derived requirements and redacted pattern summaries, but
must not redistribute Refero screenshots, bulk results, or proprietary records.

## Candidate lanes

| Candidate | Provider lane | Planned role | Status before testing |
|---|---|---|---|
| GPT-5.6 Sol, high or xhigh | Codex OAuth | implementation, repair, verification | operating default from local routing policy |
| GPT-5.6 Luna, xhigh | Codex OAuth | extraction, classification, compression | utility hypothesis; local cache failed twice during contract extraction |
| GPT-5.6 Terra, xhigh | Codex OAuth | explicit compatibility comparison | user-requested candidate; no default claim |
| Grok 4.6 (`x-ai/grok-4.6`) | OpenRouter | technical implementation and independent audit | live catalog verified 2026-08-13; authenticated benchmark pending |
| Kimi K3 | OpenRouter | frontend implementation | current One-Box runtime choice; unconfirmed for expanded editor work |
| DeepSeek V4 Flash | OpenRouter | bulk extraction and classification | current low-cost runtime choice; unconfirmed for judgment tasks |
| Gemini 3.1 Pro Preview | OpenRouter | orchestration and visual synthesis | current runtime choice; unconfirmed against new rubric |

Add a candidate only before a benchmark round starts. Record its exact catalog
slug, provider, pricing snapshot, context limit, tool support, and access lane in
the round manifest.

## Fixed task set

Each fixture is versioned and receives an immutable SHA-256 in the round manifest.

1. Static local-service marketing page from a factual brief.
2. Premium editorial landing page with a locked brand direction.
3. Ecommerce product page with cart and variant states.
4. Responsive Tailwind v4 component system with semantic CSS tokens.
5. Resizable iframe editor/workbench interaction.
6. Constrained GSAP entrance, hover, scroll, and cleanup model.
7. WebGL preview with safe Edit-mode overlay and resize lifecycle.
8. Competitive-business report with fact/inference separation.
9. Code review containing seeded type, security, lifecycle, and accessibility defects.
10. Visual comparison containing intentional, approved de-branding changes.

The initial qualification round may use a stratified subset of tasks 4, 5, 8, and
9. No lane becomes the general default until the complete set has evidence.

## Producer protocol

- Give every producer the same fixture bytes, output contract, time limit, tool
  policy, and acceptance tests.
- Start each task in a clean worktree or isolated output directory.
- Record model slug, provider, effort, timestamps, prompts, tool calls, errors,
  output hashes, latency to first usable artifact, and provider-reported cost.
- Allow at most two repair rounds. A third attempt requires human review and a new
  benchmark round.
- Producers never score their own work.

## Blinding

The coordinator assigns random artifact IDs and stores the producer mapping in a
sealed manifest. Evaluators receive only artifact ID, task brief, rubric, rendered
screens, code, and deterministic test output. Model names, provider metadata, timing,
and cost remain hidden until score sheets are complete.

At least two evaluator families score visual or strategic work. Deterministic tests
remain authoritative for mechanical criteria. Devin is the judge of record when
visual graders materially disagree.

## Rubric

Score each dimension from 0 to 4.

| Dimension | 0 | 2 | 4 |
|---|---|---|---|
| Requirement coverage | misses the core outcome | partial with material gaps | every stated check is met |
| Correctness | unusable or unsafe | works on the happy path | edge cases and lifecycle are correct |
| Design fidelity | generic or contradictory | direction is visible but drifts | reference lock is specific and coherent |
| Responsiveness and accessibility | broken | usable with defects | keyboard, focus, contrast, widths, and motion pass |
| Maintainability | arbitrary or coupled | serviceable | typed, bounded, minimal, and well tested |
| Evidence discipline | unsupported claims | mixed facts and inference | provenance and confidence are explicit |
| Tool compatibility | cannot complete | completes with manual repair | reliable bounded tool use |

Mechanical failure, invented client claims, arbitrary JavaScript execution, secret
exposure, silent paid fallback, or broken mobile layout is an automatic rejection.

## Measurements

For every model and task record:

- total rubric score and dimension scores;
- first-pass accepted or rejected;
- seeded defects found and false positives;
- visual-fidelity score where applicable;
- latency to usable result;
- repair rounds;
- input, output, and reviewer cost;
- subscription or metered lane;
- context failures, tool failures, and completion reliability.

Effective cost includes failed attempts and reviewer time. A subscription lane is
not recorded as free; report it as subscription with marginal API cost not applicable.

## Success thresholds

- Mechanical tasks: every required test passes and no automatic rejection occurs.
- Code review: at least 90 percent of seeded high and medium defects found, no invented
  blocker, and no security-sensitive false fix.
- Visual tasks: average at least 3.0 per dimension, no dimension below 2, and no
  automatic rejection.
- Default lane: meets the threshold in at least three fixtures of its task class
  across two rounds, with at least 80 percent first-pass acceptance.
- Fast path: meets the same acceptance threshold as the default within a five-point
  relative score margin and improves median latency or effective cost by 25 percent.
- Policy change: requires a new blinded round plus an independent reviewer sign-off.

## Evaluator assignment

- Mechanical acceptance: repository tests and the independent verifier.
- TypeScript review: TypeScript reviewer agent, blind to producer identity.
- Adversarial architecture and security: Grok 4.6 through OpenRouter, plus the formal
  security-review gate for sensitive changes.
- Visual critique: two different model families, followed by Devin when their total
  scores differ by more than 15 percent or their preferred artifact differs.

## Required round outputs

Each round saves `manifest.json`, `producer-events.jsonl`, anonymized artifacts,
`scores/*.json`, `unblinding.json`, `results.md`, and updates the decision log. Missing,
timed-out, skipped, or unauthenticated calls remain failures or unverified rows. They
never become zero-cost wins.

The executable coordinator and adapter contract are documented in
[`benchmark-harness.md`](./benchmark-harness.md). Its `prepare`, `run`, `accept`,
`assemble`, `score-template`, `unblind`, and `verify` modes implement this pre-registered plan;
the harness does not alter the thresholds above.
