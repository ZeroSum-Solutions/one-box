# Deep Agents JavaScript spike result

- Date: 2026-08-29
- Status: complete research evidence
- Runtime disposition: **adapt patterns only**
- Application implementation authorized: no
- Owner ticket: `OBX-P180`

## Outcome

The pinned Deep Agents JavaScript primitives work, but the runtime is not the
recommended ONE BOX base. Keep the persistent teammate product model and adapt
the useful delegation, interrupt, and nested-stream concepts into the existing
ONE BOX controller. Do not add `deepagents`, LangGraph, or LangSmith to the
application dependency graph from this evidence.

This is a runtime decision, not a rejection of AI teammates. The teammate roster,
model switching, skills, PRD work, bounded assignments, challenge roles, receipts,
and human authority remain valid runtime-independent product requirements.

## Exact evidence

- Repository: `langchain-ai/deepagentsjs@b393223f6f6f37716979ee23ed561338f7ea63fc`
- Package: `deepagents@1.13.2`
- External isolated repository:
  `/Users/zero-suminc./Inbox/misc/one-box-deepagents-js-spike-20260829`
- External commit: `32ea73c009f2cc711ca4d5f6a4f4d374ecee7715`
- Normalized external evidence SHA-256:
  `63c69727c605a05417247442e0f9ecf448b8a4912452514b48995550335d1973`
- External lockfile SHA-256:
  `994bd6f04d5ad2266e40d8a138db30a2e6d690c1650a6242743f422c6a306bb7`
- Repository-normalized receipt:
  [`deepagents-js-spike-results-2026-08-29.json`](deepagents-js-spike-results-2026-08-29.json)

## T1 through T11

| Test | Result | What the evidence established |
|---|---|---|
| T1 pin and parity | PASS | Pinned subagent delegation, state/composite backends, and TypeScript execution worked on Node 22 arm64. |
| T2 least privilege | PASS | The ONE BOX spike wrapper rejects omitted parent/subagent tools and permissions and replaces the SDK's auto-added general-purpose subagent explicitly. |
| T3 prompt injection | PASS | An unregistered deployment tool could not execute. |
| T4 filesystem scope | PASS | Synthetic fixture reads worked; absolute, traversal, and home-path escapes failed; no real-filesystem or shell backend entered spike source. |
| T5 route/data boundary | PASS | Route mismatch, fallback, and canary payloads failed closed before egress. |
| T6 telemetry | PASS | Tracing-off execution produced no fetch egress; an OS `deny network*` run passed and its curl positive control failed. |
| T7 budget/cancellation | PASS | External wall-clock cancellation and idempotent replay behavior passed. |
| T8 human interrupt | PASS | The proposal tool did not run before an external decision record; explicit approval resumed it. |
| T9 state authority | PASS | Deleting runtime checkpoint state did not delete the authoritative ONE BOX-side receipt. |
| T10 removal | PASS | ONE BOX `package.json` and `package-lock.json` hashes stayed byte-identical. |
| T11 evidence | PASS | Raw synthetic command, test, dependency, audit, network-sandbox, and removal pointers are retained in the external commit. |

## Why runtime adoption did not win

- The isolated peer-complete tree contains 54 unique production package/version
  nodes and 149 lock entries including development tooling.
- The spike needed a 196-line policy wrapper to counter permissive filesystem
  defaults, omitted subagent permission inheritance, the auto-added
  general-purpose subagent, hidden fallback, canary egress, and unbounded work.
- The pinned declarations did not typecheck with
  `exactOptionalPropertyTypes: true` and `skipLibCheck: false`.
- LangGraph checkpoints and LangSmith remain extra state and telemetry surfaces
  that ONE BOX would have to contain, observe, migrate, and remove.
- The existing controller already owns Page IR, candidates, receipts, resume, and
  release boundaries. The new runtime did not materially reduce that domain work.

## Supply-chain boundary

The metadata census found zero unknown license strings and `npm audit` found zero
current vulnerabilities. Five packages in the full development lock graph declare
lifecycle scripts; `.npmrc` disabled their execution. These are useful research
facts, not a named legal review or production clearance.

## Decision

Set the product-level ledger disposition to `adapt`, which is research-only under
the supply-chain policy. Extract contracts and ideas from public documentation and
this evidence; retain no upstream runtime or spike code in ONE BOX. Reopening
runtime adoption requires new upstream or product evidence, a new isolated
evaluation, named owners, legal review, exact advisory review, and separate
implementation authorization.
