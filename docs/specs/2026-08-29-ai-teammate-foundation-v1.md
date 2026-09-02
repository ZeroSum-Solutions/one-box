# AI teammate foundation v1

- **Status:** owner-approved for the exact foundation slice below
- **Date:** 2026-08-29
- **Implementation authorization:** `OBX-AUTH-ATF-001`
- **Implementation ticket:** `OBX-AT-001`
- **Parent direction:** AI teammate operating model; E1 Agent Studio direction

## Outcome

ONE BOX gains a credential-free foundation for recognizable AI teammates: a
static native roster, a closed read/propose-only job contract, deterministic
validation and execution, immutable terminal receipts, and the smallest local
Canvas/API surface needed to exercise those contracts. The slice proves the
authority boundary before any model or tool runtime is connected.

This specification approves only the foundation slice. The wider operating
environment, `OBX-P180`, `OBX-P310`, E0 through E8, production release, and every
provider/runtime choice remain planning-only or blocked according to their
existing authority.

## Teammate registry contract

`AiTeammateDefinitionV1` is a closed, versioned record with:

- `schemaVersion: 1`;
- stable `id`, `displayName`, `specialty`, and concise `brief`;
- explicit `skills` and permitted `dataClasses` arrays;
- explicit `effectClasses`, which in this slice contain only `read` and
  `propose`;
- a static availability value of `idle`, meaning no process, lease, provider
  session, tool, or budget is active.

The registry contains the eight roles named by the operating model: Researcher,
PRD Planner, Architecture Analyst, Canvas Designer, Implementation Producer, QA
Challenger, Security Challenger, and SEO Qualifier. Duplicate IDs, unknown
fields, an empty roster, an unrecognized data class, or any effect outside
`read`/`propose` fails validation. Callers receive immutable values and cannot
mutate the registry through a returned reference.

## Bounded job contract

`AiTeammateJobV1` declares, before execution:

- `schemaVersion`, `jobId`, `projectId`, `taskId`, `actorId`, and `teammateId`;
- an immutable SHA-256 input hash and the expected proposal schema ID;
- explicit `effectClasses`, `toolGrants`, `childToolGrants`, and `dataClasses`
  arrays; missing or `null` arrays are invalid and `[]` means no grant;
- byte, duration, attempt, and delegation-depth budgets;
- a deadline, cancellation policy, retention policy, and `fallback: none`;
- `executionLane: deterministic-local`.

For v1, `toolGrants` and `childToolGrants` must both be empty,
`maxDelegationDepth` is zero, `maxAttempts` is one, and the only effect classes
are `read` and `propose`. No provider, model, credential, filesystem, shell,
browser, network, Page IR mutation, external effect, or authority field is part
of the contract.

## Deterministic executor and receipt

The executor accepts an already constructed job plus bounded in-memory input,
validates both before work, invokes only a locally supplied deterministic
proposal function, validates the proposal schema/size, and returns a proposal
plus `AiTeammateRunReceiptV1`. It cannot discover tools, perform I/O, apply the
proposal, mutate Page IR, or enqueue another job.

Every attempted run reaches exactly one terminal receipt state: `complete`,
`failed`, `cancelled`, `rejected`, or `budget-exhausted`. A receipt binds the job,
teammate, input hash, output hash when output exists, start/stop timestamps,
stopping condition, retry eligibility, effect classes, output schema ID, and
zero provider cost. Receipts are immutable values; this slice returns them to
the caller but adds no database or durable-storage migration.

## Local Canvas and API surface

The authorized interface is deliberately small:

- a local GET endpoint may expose the validated static registry;
- a local POST endpoint may validate and execute only the deterministic
  proposal contract above;
- Canvas may show the roster, read/propose permission summary, bounded local
  assignment fields, proposal state, and textual receipt outcome.

All controls require accessible names, keyboard operation, visible focus, and
textual status/error output. The UI must label this lane `Local foundation` and
must not imply that a provider-backed agent is connected.

## Security and data boundary

- Input is limited to `public` and `project-internal` data classes.
- Client-sensitive, credential, cookie, browser-profile, release, and
  appointment data are rejected.
- Unknown fields and unknown enum values fail closed.
- Payload and proposal byte limits are enforced before a success receipt.
- A failed or cancelled run cannot expose partial output unless its receipt
  contains the explicit partial-output hash.
- Local API origin/auth protections remain unchanged and are reused where the
  existing local endpoint contract requires them.

## Acceptance criteria

1. The public registry validates exactly eight unique static teammates and
   rejects mutation or authority-bearing definitions.
2. Missing/null grant arrays, non-empty tool grants, delegation, retry, hidden
   fallback, unsupported data, unknown fields, and effects outside
   `read`/`propose` fail before proposal execution.
3. Complete, rejected, failed, cancelled, and budget-exhausted paths emit one
   schema-valid immutable receipt bound to the input and output hashes.
4. Oversized or schema-invalid proposals cannot receive `complete`.
5. Local API and Canvas tests prove the visible roster, accurate foundation
   labeling, keyboard/accessibility contract, and no automatic application.
6. The dependency graph gains no Deep Agents, LangGraph, or LangSmith package
   and the implementation performs no provider/network/credential access.
7. Unit, route/component, typecheck, lint, build, plan-authority, security,
   exact Grok 4.6, and independent-verifier gates pass on the same target.

## Non-goals

Provider/model calls, model routing, skills, memory, scheduling, background
workers, persistent storage, multi-user collaboration, shell/filesystem/browser
tools, Page IR mutation, external effects, human authority, deployment, release,
and any Deep Agents/LangGraph/LangSmith adoption are outside this slice.
