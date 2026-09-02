# Fable 5 audit — Deep Agents teammate proposal

Date: 2026-08-29  
Scope: read-only architecture and governance audit  
Driver model: `claude-fable-5[1m]`, maximum effort, Claude Code subscription OAuth  
Verdict: **REWORK**  
Authority: advisory model evidence only; this audit authorizes no planning-status change, dependency adoption, implementation, release, or deployment.

## Run provenance

- The Fable 5 driver produced the final verdict and synthesis.
- The run used one read-only Explore subagent. Runtime accounting also reported `claude-sonnet-5` and `claude-haiku-4-5` supporting usage; there was no driver fallback.
- Allowed tools were read-only repository inspection and web research. Bash, Edit, Write, and NotebookEdit were denied.
- The run reported no permission denials and made no repository changes.

## Executive finding

The proposal is technically plausible and its intended boundary is sound: ONE BOX should remain authoritative for project state, Page IR and candidates, tickets, permissions, evidence, Canvas state, client and human approvals, and release. Deep Agents may be evaluated only as a bounded job-execution runtime.

The proposal cannot yet promote Deep Agents from “learn/adapt” to an execution foundation. The current planning artifacts are research, draft, proposed, or audit class; none can authorize a disposition change. The newly verified JavaScript package is also a different adoption target from the pinned Python repository already reviewed by the shortlist.

Current upstream evidence is sufficient to **reopen evaluation as a new candidate intake**, not to adopt it.

## Confirmed upstream capability changes

Fable reported the following current upstream facts from official documentation and registries:

- A current JavaScript/TypeScript SDK exists as npm `deepagents`, associated with `langchain-ai/deepagentsjs`, separate from the pinned Python repository.
- Specialized subagents can declare their own model, tools, middleware, skills, output schema, permissions, and human-interrupt configuration.
- Backends include in-memory state, durable stores, real filesystem access, composite routing, and shell-capable variants.
- Human-in-the-loop interruptions and resumable LangGraph execution are available.
- The frontend SDK can expose coordinator state, subagents, task state, tool calls, artifacts, and interrupts through streaming projections.
- OpenRouter can be bound through LangChain model initialization.
- Deep Agents still runs on LangGraph; the existence of a JavaScript SDK does not remove the previously recorded LangGraph-runtime concern.

Primary upstream references:

- <https://docs.langchain.com/oss/javascript/deepagents/overview>
- <https://docs.langchain.com/oss/javascript/deepagents/subagents>
- <https://docs.langchain.com/oss/javascript/deepagents/backends>
- <https://docs.langchain.com/oss/javascript/deepagents/human-in-the-loop>
- <https://docs.langchain.com/oss/javascript/deepagents/frontend/overview>
- <https://github.com/langchain-ai/deepagentsjs>

## Findings

### DA-001 — P0: invalid promotion mechanism

Research, draft, proposed, and audit artifacts cannot authorize implementation or promote an adoption disposition. The source-catalog matrix cannot independently reclassify a shortlisted project, the supply-chain policy says “adapt” never clears code, relevant program tickets are not ready, and required human assignments remain blocking.

Required correction: create a new-candidate intake and a draft `evaluate` ledger record with code, service, and release use disabled. A bounded spike becomes research input to the owning program ticket; it does not change the disposition by itself.

### DA-002 — P1: the JavaScript SDK is a different adoption target

The existing shortlist row pins `langchain-ai/deepagents@1c14626`, the Python repository. The JavaScript SDK comes from a separate repository and introduces a separate direct and peer dependency tree.

Required correction: inventory the JavaScript repository, exact commit, npm version, direct and peer dependencies, licenses, permissions, telemetry, kill switch, and removal path as a new candidate.

### DA-003 — P1: the LangGraph exclusion remains unresolved

The old exclusion covered the Python/LangGraph runtime and broad filesystem authority. The JavaScript package still depends on LangGraph and can be configured with real filesystem and shell authority.

Required correction: the reopened decision must explicitly justify any bounded LangGraph job runtime and prohibit real-filesystem or local-shell backends outside a per-run sandbox.

### DA-004 — P1: standing-role names collide with human authority

Names such as Delivery Lead, Security/Supply Chain, and Release/Operations overlap human accountability roles. “Standing” agents also conflict with the program’s bounded-task, execution-window, and cost-cap model.

Required correction: model workers should be on-demand capability lanes. Delivery coordination is deterministic infrastructure plus a human owner. Risk acceptance, dependency admission, and release remain human roles.

### DA-005 — P1: subagents inherit tools by default

An upstream subagent that omits its tool list inherits the parent tool surface. That conflicts with ONE BOX’s deny-by-default tool policy.

Required correction: a ONE BOX construction wrapper must refuse any agent or subagent without explicit tools and permissions. Implicit tool inheritance must be unreachable and continuously tested.

### DA-006 — P1: provider routing could create a second policy plane

Deep Agents/LangChain introduces another model-binding layer alongside the retained AI SDK and OpenRouter adapter. OpenRouter service use is itself still evaluation-only under the current ledger.

Required correction: ONE BOX must remain the single route authority. Each job gets exactly one declared provider/model/revision, effort, tool set, data class, budget, timeout, region, retention rule, and `fallback=none`, enforced outside Deep Agents.

### DA-007 — P1: durable state could split in two

LangGraph checkpoints and StoreBackend memory could become a second state authority beside ONE BOX run state, receipts, artifacts, and approvals.

Required correction: framework state is disposable execution cache. Every durable fact lives in ONE BOX. Deleting framework checkpoints must not destroy the authoritative run outcome.

### DA-008 — P1: telemetry and supply-chain evidence are incomplete

The JavaScript SDK brings LangSmith and other peers into the package graph. A verbatim proof that telemetry is off by default was unavailable, so telemetry is unknown-blocking.

Required correction: run the spike out of tree with an isolated lockfile. Capture all egress with telemetry variables unset and run a positive control for the documented toggle. Do not change the application lockfile during the spike.

### DA-009 — P2: E1 Agent Studio and job execution were conflated

E1 describes the model registry, routing, context, receipts, budgets, and user-facing agent controls. Long-running agent execution belongs in the isolated job plane.

Required correction: call Deep Agents a “candidate agent execution runtime for the isolated job plane, surfaced through E1 Agent Studio contracts.” Agent Studio stays ONE BOX-native regardless of the spike result.

### DA-010 — P2: missing risk bindings

The proposal did not yet bind tenancy, concurrent writers, memory retention and PII, prompt injection, process restart, provider deployment, middleware churn, UI package archival risk, observability ownership, or vendor removal to the program threat model and evaluation families.

Required correction: the spike packet must map every risk to the relevant threat-model and evaluation control, including why the dependency cannot become a second source of truth.

### DA-011 — P2: two audit-prompt paths were incorrect

The prompt referenced nonexistent engineering and evaluation paths. The current files are:

- `docs/plans/one-box-master/00-authority/2026-08-29-engineering-operating-system-and-gap-register.md`
- `docs/eval/one-box-program/evaluation-strategy.md`

Required correction: use the exact paths and hashes in the next audit packet.

## Recommended architecture boundary

Deep Agents may be evaluated as a bounded execution runtime inside ADR 0002’s isolated job plane. One Deep Agents run equals one ONE BOX-issued job with:

- a closed, typed input manifest;
- synthetic or explicitly permitted data only during evaluation;
- explicit read/propose tools and no implicit inheritance;
- no mutate, external-effect, credential, approval, release, or other authority-class tools;
- a per-run sandbox and explicit path permissions;
- one ONE BOX-declared model route with no hidden fallback;
- budgets, timeout, cancellation, and egress controls enforced outside the framework;
- human interrupts mapped to authoritative ONE BOX approval records;
- disposable LangGraph checkpoints;
- ONE BOX-owned receipts, artifacts, logs, and final state;
- LangSmith unprovisioned unless separately reviewed.

The comparison baseline is not “Deep Agents or nothing.” The spike must compare Deep Agents with extending the existing resumable ONE BOX controller using the retained AI SDK.

## Revised role model

All model workers should be on-demand capability lanes:

1. Research and evidence agent
2. PRD and planning drafter
3. Architecture drafter
4. Canvas and design proposal agent
5. Engineering proposal agent, only for an authorized ticket
6. QA and evaluation challenger
7. Security red-team agent
8. SEO and qualification advisory agent
9. External adversarial model reviewer when a packet policy requires one

Human or deterministic responsibilities:

- Delivery coordination: named human owner plus deterministic ONE BOX orchestrator
- Product, evidence, visual-taste, and client approvals
- Architecture and security ownership
- Supply-chain and license admission
- Risk acceptance and P0/P1 disposition
- Owner-role acceptance
- Implementation authorization
- Two-human release initiation and approval

## Bounded spike acceptance tests

Preconditions: written owner authorization, at most one week, out-of-tree workspace and lockfile, synthetic fixtures, explicit provider budget, no retained application code.

1. **Pin and parity:** demonstrate the required TypeScript subagent, interrupt, and composite-backend capabilities at exact versions.
2. **Least privilege:** reject construction without explicit tools and permissions; implicit inheritance must be unreachable.
3. **Injection resistance:** embedded instructions cannot call an unregistered tool, escape the sandbox, or change a simulated approval.
4. **Filesystem scope:** traversal, absolute-path, and symlink escapes fail; real-filesystem and local-shell backends are absent.
5. **Single route:** egress capture proves one declared model route, no hidden fallback, and no confidential-canary leak.
6. **Telemetry:** zero telemetry egress with variables unset; positive control proves the toggle and kill switch.
7. **Budget and cancellation:** cap, operator cancel, and hard process kill produce correct receipts and no duplicated side effects.
8. **Human interruption:** the job cannot continue without an external authoritative ONE BOX approval record; rejection terminates cleanly.
9. **State authority:** deleting framework checkpoints does not destroy the authoritative ONE BOX result.
10. **Removal drill:** deleting the spike leaves no application lockfile change and the current application gates still pass.
11. **Evidence report:** record PASS, FAIL, BLOCKED, or NOT_RUN with pins, hashes, and raw evidence; any failure in tests 2–9 forbids a disposition change.

## Bottom line

**REWORK: charter the spike; do not grant the promotion.**

The JavaScript SDK is real and capable enough to justify a reopened review. Deep Agents should remain a new evaluation candidate until the new artifact identity, LangGraph exclusion, tool inheritance, provider routing, state ownership, telemetry, supply-chain, and human-authority findings are closed through falsifiable evidence and the proper human authority chain.
