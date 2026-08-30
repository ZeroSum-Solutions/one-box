# Deep Agents JS candidate intake

- Status: evaluated; adapt patterns only
- Date: 2026-08-29
- Owner ticket: `OBX-P180`
- Implementation authorized: no
- Code, service, expansion, and release use allowed: no

## Why this is a new candidate

The existing shortlist row evaluates the Python repository
`langchain-ai/deepagents@1c14626d068e`. The JavaScript SDK is a different
repository and package with a different dependency and runtime surface:

- repository: `langchain-ai/deepagentsjs`;
- pinned repository commit: `b393223f6f6f37716979ee23ed561338f7ea63fc`;
- npm package: `deepagents@1.13.2`;
- npm integrity:
  `sha512-OMm+Ark4yaICZhGqC9kYkIx5vw5eH+GqIhzX1PAMmYhdxK5XeBTyn4pdfo1fKrBj2X/8GEg6TPnKS2jORLqJAQ==`;
- license file: MIT, repository blob
  `611da687a0f196b8ea5329ef1c4923ef9d4e4ec3`;
- npm publication: 2026-08-27T19:33:40.819Z.

The authenticated GitHub account did not star `langchain-ai/deepagentsjs` at
intake time. This note therefore does not modify or reinterpret the 18-item
starred shortlist. It is a non-starred candidate intake governed by the
technology matrix, adoption ledger, `OBX-P180`, and the supply-chain policy.

## Capability worth evaluating

Current upstream sources expose:

- TypeScript agent and subagent construction;
- per-subagent models, tools, middleware, skills, response formats, interrupts,
  and filesystem permissions;
- a fixed middleware stack with planning, context management, and delegation;
- pluggable state, store, filesystem, composite, and shell-capable backends;
- human-in-the-loop interrupts backed by LangGraph checkpoints;
- frontend streaming projections for coordinator, subagents, tasks, tools,
  artifacts, and interrupts;
- provider-neutral model binding, including an OpenRouter integration path.

These capabilities may reduce the cost of implementing bounded multi-step job
execution. They do not supply ONE BOX project authority, Page IR, candidate state,
model policy, approval, qualification, release, collaboration, or human identity.

## Dependency surface at intake

Direct dependencies declared by `deepagents@1.13.2`:

- `fast-glob ^3.3.3`
- `micromatch ^4.0.8`
- `yaml ^2.8.2`
- `zod ^4.3.6`

Peer dependencies:

- `@langchain/core ^1.2.9`
- `@langchain/langgraph ^1.4.10`
- `@langchain/langgraph-checkpoint ^1.1.5`
- `@langchain/langgraph-sdk ^1.9.23`
- `langchain ^1.5.10`
- `langsmith >=0.7.1 <0.10.0`

The transitive lockfile, lifecycle-script, vulnerability, bundled-code, and
license census is incomplete until the isolated spike installs the exact package
graph and records its evidence. LangSmith is a dependency and possible telemetry
surface; telemetry remains `unknown-blocking` until a captured negative and
positive-control egress test exists.

## Bounded evaluation use

The only allowed evaluation is the disposable external spike defined in
[`deepagents-js-evaluation-plan.md`](../../plans/one-box-master/06-technology/deepagents-js-evaluation-plan.md):

- synthetic fixtures only;
- external workspace and independent lockfile;
- zero ONE BOX application dependency or lockfile change;
- explicit read/propose tools only;
- no implicit subagent tool inheritance;
- no real project files, client data, credentials, browser state, Page IR,
  candidate mutation, external effect, deployment, publication, or release;
- no durable truth stored only in LangGraph or Deep Agents memory;
- one declared model route per run, no hidden fallback, and captured egress;
- report and normalized receipts retained; spike code remains outside the
  application branch.

## Runtime-reconsideration stop gates

The isolated spike subsequently passed T1 through T11, but the runtime did not
materially beat the existing controller. The current disposition is therefore
`adapt` under the research-only supply-chain meaning: no application dependency,
service, or upstream source reuse. See the
[normalized result](../../eval/one-box-program/deepagents-js-spike-results-2026-08-29.md).

The runtime stays excluded unless all of the following are re-established for a
new exact candidate and a new owner decision:

1. tests T1 through T11 pass at exact pins;
2. the package and peer dependency census, licenses, telemetry, permissions,
   vulnerabilities, kill switch, and removal drill are complete;
3. the comparison proves a material advantage over extending the existing ONE BOX
   resumable controller and retained AI SDK;
4. `OBX-P180` and its prerequisite tickets become ready with named human owners and
   an independent verifier;
5. a new owner-accepted adoption record explicitly resolves the recorded
   LangGraph-runtime exclusion;
6. the exact review packet passes its required Grok 4.6 advisory audit and all
   deterministic gates;
7. separate implementation authorization is recorded.

Failure of the least-privilege, injection, filesystem, route, telemetry, budget,
human-interrupt, or state-authority tests means no disposition change. Removing the
external spike must leave the application dependency graph and behavior unchanged.

## Primary evidence

- <https://github.com/langchain-ai/deepagentsjs/tree/b393223f6f6f37716979ee23ed561338f7ea63fc>
- <https://registry.npmjs.org/deepagents/-/deepagents-1.13.2.tgz>
- <https://docs.langchain.com/oss/javascript/deepagents/overview>
- <https://docs.langchain.com/oss/javascript/deepagents/subagents>
- <https://docs.langchain.com/oss/javascript/deepagents/backends>
- <https://docs.langchain.com/oss/javascript/deepagents/human-in-the-loop>
- <https://docs.langchain.com/oss/javascript/deepagents/frontend/overview>

## Review evidence

The [Fable 5 audit](../../audits/fable-5/2026-08-29-deep-agents-teammate-proposal-audit.md)
returned `REWORK` and required this separate intake. It is advisory evidence, not
the source of the candidate disposition or implementation authority.
