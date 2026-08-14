# Controlled baseline comparison status

## Frozen inputs

`brief-v2.json` and `rubric-v2.md` freeze the identical input and acceptance rules.
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
| Versioned identical brief | ready | `brief-v2.json` |
| Frozen rubric | ready | `rubric-v2.md` |
| Immutable evaluation contract and offline verifier | ready | `evaluation-contract-v2.json`, lock, and `scripts/eval/baseline-harness.mjs` |
| Authorized live producer | ready | `scripts/eval/baseline-live-runner.mjs` verifies frozen inputs, explicit approval, complete traces, neutralization, spend, and atomic fourteen-file publication |
| Path A prompts and artifacts | pending | Run the current pipeline under explicit approval, capture its complete trace, then use `publish-path-a`; the producer does not unlock ZS Vault |
| Path B direct Refero research | pending | Generate a credential-free request, complete Refero OAuth in the user-controlled MCP session, then import the bound handoff with `publish-path-b` |
| Randomized blind labels | ready when a run is prepared | reproducible seed and coordinator-only unblinding key; presentation is blocked until both provenanced paths finish |
| Independent scores | pending | two distinct human score files, each bound to the current immutable presentation packet, are required |
| Root-cause decision | pending | cannot precede comparison evidence |

No revised pipeline proposal is authorized by this incomplete comparison.
