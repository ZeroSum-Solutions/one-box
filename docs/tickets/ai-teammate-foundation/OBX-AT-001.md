---
id: OBX-AT-001
status: ready
priority: P1
requirement: E1
authorization: OBX-AUTH-ATF-001
---

# OBX-AT-001: Build the native read/propose teammate foundation

## Outcome

ONE BOX exposes the validated eight-role teammate roster and can run one bounded,
credential-free, deterministic local proposal job to a terminal immutable receipt.

## Authorized scope

- Static ONE BOX-native teammate registry.
- Closed read/propose-only job and receipt contracts.
- Deterministic in-memory validator/executor with no I/O or automatic apply.
- Minimal local registry/proposal API and Canvas roster/assignment surface.
- Tests, canonical documentation, security evidence, exact Grok 4.6 review, and
  independent verification for this slice.

## Acceptance criteria

- All seven criteria in the source specification pass on the same target.
- Tests are written red-first at contract, executor, route, and component seams.
- Unknown fields and every prohibited effect fail closed before execution.
- A proposal is visibly advisory and never changes Page IR or project authority.
- No new runtime dependency is added.

## Non-goals

Provider/model calls, network, credentials, filesystem/shell/browser tools,
mutation, external effects, authority tools, persistent state, background work,
Deep Agents/LangGraph/LangSmith, deployment, release, and broader E0-E8 work.

## Security boundary

Only bounded in-memory public/project-internal inputs enter the executor. Existing
local API protections are preserved. The model/tool/credential/browser and
production-release boundaries remain closed.

## Evidence and completion

Unit, route/component, plan, typecheck, lint, build, security, exact Grok 4.6, and
independent-verifier evidence are required. The feature-branch checkpoint does not
grant merge, deployment, or release authorization.

The ticket remains machine-pinned at `ready` until an explicit owner-directed
transition synchronizes this body and the manifest, updates the verifier invariant
and its negative test, refreshes the authority digest, and obtains same-target
review evidence. The documented sequence is `ready`, `in-progress`, implementation
`in-review`, `verified`, then `done`; automatic status movement is forbidden.
