# One-Box model-routing decision log

## Confirmed results

- The repository baseline builds successfully with Next.js 16.3.0 and its existing
  generated-site gate smoke passes.
- GPT-5.6 Luna xhigh failed twice during a bounded contract-extraction task because the
  local Codex model cache reported `missing field base_instructions`. This is a local
  compatibility failure, not a quality score.
- GPT-5.6 Terra xhigh completed the bounded Refero ecosystem research lane. This proves
  availability for that task only.
- The existing three-arm visual experiment does not meet its pre-registered Refero win
  threshold on either advisory evaluator. Devin's judge-of-record scores remain blank.
- OpenRouter's live public catalog on 2026-08-13 lists `x-ai/grok-4.6` with a
  500,000-token context window, required reasoning, and low/medium/high/xhigh effort.
  The catalog price snapshot is $2/M input tokens, $6/M output tokens, $0.50/M cache
  reads, and $5 per web-search request; prompts above 200,000 tokens use the documented
  doubled input/output/cache tier. Availability is confirmed, but authenticated calls
  and quality remain unverified until the local ZS Vault is unlocked.

## Operating hypotheses

- GPT-5.6 Sol is the safest repository implementation and verification default.
- Grok 4.6 may be a fast technical implementer and strong adversarial reviewer.
- Kimi K3 may remain effective for runtime frontend generation.
- Gemini may be stronger for design synthesis than low-cost extraction models.
- Luna may be useful for light extraction after the local cache issue is fixed.
- Terra may provide a useful independent compatibility lane, but one research result is
  not enough to assign a default task class.

## Data still required

- At least one blinded technical implementation and seeded-defect review from Grok 4.6.
- A successful Luna compatibility probe and utility-task score.
- Matched Terra, Sol, and Grok outputs on the same fixture.
- Complete representative task set, including GSAP and WebGL lifecycle behavior.
- Devin's scores for the existing three-arm visual experiment.
- Full effective-cost and repair-round records.

## Decisions

No expanded One-Box runtime route changes are authorized yet. Keep the current runtime
slugs pinned, use Sol for repository implementation, and record Grok, Luna, and Terra as
candidate lanes until the benchmark gates pass.
