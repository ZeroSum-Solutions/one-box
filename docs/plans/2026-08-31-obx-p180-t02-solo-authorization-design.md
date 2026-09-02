# OBX-P180 solo T02 authorization design

- Owner and risk owner: Devin Wiggins (`person:devin-wiggins`)
- Project: `one-box`
- Branch: `research/la-appointment-field-study`
- T01 checkpoint: `07864a45d414db0998cc7cfb2731010d0d4cbe8b`
- Authorization ID: `OBX-AUTH-P180-T02-SOLO-001`
- Amendment ID: `OBX-P180-T02-SOLO-AMENDMENT-001`
- Child ticket: `OBX-P180-T02`
- Duration: exactly 336 hours; non-renewable
- Owner direction: this Codex thread, “let's start building out,” with no further permission prompt

## Decision

Authorize only the provider-offline T02 registry and route-state reducers after the
completed, independently verified T01 checkpoint. This is a second exact child-ticket
exception. It does not amend, broaden, renew, overwrite, or reuse the T01 exception.

Devin is truthfully recorded as repository owner, risk owner, authorizer, and
implementation actor. The required `implementation-lead`,
`model-skill-security-owner`, and `job-sandbox-owner` assignments remain unavailable;
the implementation-actor/authorizer separation and independent-human review also
remain unavailable. No synthetic assignment or implied Alex Roth role is created.

The combined unavailable-separation risk is accepted as:

```text
findingId: OBX-P180-T02-SOLO-SEPARATION-001
severity: MEDIUM
status: ACCEPTED
reasonCode: SOLO_OWNER_SEPARATION_UNAVAILABLE
riskOwnerActorId: person:devin-wiggins
```

The standard non-waivable governance defaults remain unchanged and this exception is
not a reusable waiver mechanism.

## Exact implementation boundary

```text
src/lib/operatingEnvironment/registry.ts
src/lib/operatingEnvironment/registry.test.ts
src/lib/operatingEnvironment/routeState.ts
src/lib/operatingEnvironment/routeState.test.ts
src/lib/operatingEnvironment/fixtures/registry-v1.json
src/lib/operatingEnvironment/fixtures/route-state-v1.json
```

The only allowed effect is:

```text
add-provider-offline-fixture-registries-and-route-reducers
```

All unlisted paths and effects are denied. In particular, the authorization forbids
product-runtime imports/effects, provider/model calls, network, credentials or
environment access, filesystem or shell I/O, persistence, durable state, background
workers, live queues, browser, UI, collaboration, Canvas/Page IR access or mutation,
dependencies/lockfiles, deployment, release, mutable global state, implicit clock or
randomness, T03-T08 authority, parent-evaluation completion, independent-human-review
claims, and production-readiness claims.

Explicit timestamps supplied as fixture data are permitted; reading the current clock
is not. In-memory reducer values are permitted; persistence is not.

## T01 predecessor binding

The authorization pins the exact T01 checkpoint and the six committed T01 file hashes.
Any changed T01 byte, missing path, different checkpoint identity, or attempt to treat
T01 model evidence as T02 authority invalidates T02.

T01 historical receipts are verified by immutable receipt-file SHA-256 plus strict
schema/content parsing. They no longer re-hash future verifier source files. This
preserves the original reviewed evidence while allowing the verifier to support a new
ticket without rewriting historical audit artifacts.

## T02 executable evidence contract

T02 implementation uses two JSON fixtures and two Vitest suites as its current
executable evaluation authority. Formal standalone evaluator command/hash pinning is
reserved for T05.

Build-loop reviews are advisory and byte-bound:

- quick reviewer: exact `z-ai/glm-5.3-flash` through the prepaid Nous Portal;
- final section reviewer: Claude Max subscription alias `opus`, provider-reported as
  `anthropic/claude-opus-5`, once over the frozen complete T02 section;
- corrections: test-first, followed by deterministic gates and a final GLM quick pass;
- a second Opus call is allowed only when an Opus finding cannot be mechanically
  proven closed.

Neither model can authorize implementation, satisfy independent-human review, promote
an evaluation/audit route to product admission, or create a runtime/provider effect.

## Activation evidence

Activation requires one exact security receipt:

```text
docs/audits/evidence/security/2026-08-31-obx-p180-t02-solo-authorization-security-review.json
```

The receipt is parsed, not existence-checked. It binds the exact authorization,
amendment, activation write set, current hashes, accepted separation finding, six
security surfaces, and `independentHumanReview: NOT_AVAILABLE / false`. Any missing,
stale, malformed, extra, or symlinked receipt invalidates activation.

## Invalidators

- authorization or amendment hash mismatch;
- T01 checkpoint/path/hash drift;
- activation write-set or protected handoff drift;
- timestamp invalidity, expiry, or renewal;
- fake role/assignment/separation or independent-review claim;
- allowed path/effect or forbidden-effect drift;
- dependency or lockfile change;
- provider/network/credential/environment/runtime/I/O effect;
- persistence/background/browser/UI/collaboration/Canvas/Page IR/deploy/release effect;
- T03-T08 authority or parent-evaluation promotion;
- missing or stale security receipt;
- any unresolved finding beyond the explicitly accepted separation finding;
- failure of plan verification, typecheck, tests, lint, scope census, or secret scan.
