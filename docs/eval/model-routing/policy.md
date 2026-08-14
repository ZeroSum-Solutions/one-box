# One-Box model-routing policy

Status: provisional operating policy. Benchmark evidence can replace it only through
the change gate in `benchmark-plan.md`.

## Current routes

| Stage | Default | Fast path | Escalation | Independent review | Confidence |
|---|---|---|---|---|---|
| Intake and orchestration | Gemini 3.1 Pro Preview through OpenRouter | none yet | GPT-5.6 Sol xhigh during development | Grok 4.6 | hypothesis from current code |
| Source classification and extraction | DeepSeek V4 Flash through OpenRouter | GPT-5.6 Luna xhigh through Codex OAuth for local utility work | GPT-5.6 Sol high | Grok 4.6 | low; Luna cache failure unresolved |
| Design research synthesis | Gemini 3.1 Pro Preview | none | GPT-5.6 Sol high | separate visual evaluator family | low |
| Frontend and Tailwind implementation | Kimi K3 through OpenRouter at runtime; GPT-5.6 Sol high for repository work | none | GPT-5.6 Sol xhigh | TypeScript reviewer plus Grok 4.6 | medium for repository work, low for runtime |
| Editor, GSAP, WebGL architecture | GPT-5.6 Sol xhigh | none | human architecture review | Grok 4.6 | provisional |
| Deterministic verification and repair | GPT-5.6 Sol xhigh | none | human review after two failures | repository gates and independent verifier | medium |

Grok 4.6, Luna, and Terra are candidates, not winners. Terra runs only where an
explicit comparison or compatibility need exists. Luna runs only on light utility work.

## Retry and escalation

- One transient provider failure may retry with the same model.
- One substantive artifact failure receives one repair prompt.
- Two failed attempts stop the lane. Escalate to Sol xhigh or human review with the
  original artifact, failures, and proof attached.
- Authentication, policy, or spend-cap failures do not retry. Resolve the gate first.
- A visual disagreement above 15 percent triggers Devin review.
- Any secret, authorization, prompt-injection, upload, arbitrary-code, or external
  export concern triggers the formal security review.

## Budget policy

- Every metered run has a declared per-task cap and records provider usage.
- Paid Firecrawl is outside model inference and requires an explicit fallback event.
- Benchmark rounds use fixed caps in their manifests. A cap increase needs Devin's
  approval before the call.
- Prefer subscription lanes when quality is equal. Do not downgrade quality merely to
  reduce nominal cost.

## Availability fallback

1. Preserve the task fixture, prompt, partial output, and error.
2. Retry once only for a transient transport or rate-limit response.
3. Use the assigned escalation lane. Do not substitute an unregistered model silently.
4. Re-run every acceptance check because provider substitution changes the evaluated
   configuration.
5. Mark the original row unavailable and the fallback as a separate result.

## Change control

The routing table changes only when a blinded round meets the registered thresholds.
The decision log must name the exact task class and model configuration. No result for
classification authorizes frontend routing, and no code-review result authorizes visual
direction. Historical results remain attached to the policy version that used them.
