# Controlled baseline comparison status

## Frozen inputs

`brief-v1.json` and `rubric-v1.md` freeze the identical input and acceptance rules.
The existing Phase 4 experiment in `docs/eval/ab/` supplies useful historical evidence,
but it is not a substitute for this run. It compares Refero, a local catalog, and no
reference inside the same One-Box pipeline. The new brief requires current-pipeline
Path A versus a direct Refero MCP research workflow in Path B.

## Historical evidence retained

- Three local-service prompts and three reference arms completed.
- Nine built sites passed the existing generated-site gates.
- Advisory evaluators did not meet the pre-registered Refero win threshold.
- The graders disagreed materially, which supports keeping Devin as the visual judge
  of record.
- Repeated failure patterns were generic collage imagery, weak mobile details, and a
  frozen template carrying much of the baseline quality floor.

## Controlled run state

| Gate | State | Evidence or blocker |
|---|---|---|
| Versioned identical brief | ready | `brief-v1.json` |
| Frozen rubric | ready | `rubric-v1.md` |
| Immutable evaluation contract and offline verifier | ready | `evaluation-contract-v1.json`, lock, and `scripts/eval/baseline-harness.mjs` |
| Path A prompts and artifacts | pending | OpenRouter key is in locked ZS Vault |
| Path B direct Refero research | pending | Refero OAuth is not authorized in Codex |
| Randomized blind labels | ready when a run is prepared | reproducible seed and coordinator-only unblinding key; presentation is blocked until both provenanced paths finish |
| Independent scores | pending | inputs do not exist yet |
| Root-cause decision | pending | cannot precede comparison evidence |

No revised pipeline proposal is authorized by this incomplete comparison.
