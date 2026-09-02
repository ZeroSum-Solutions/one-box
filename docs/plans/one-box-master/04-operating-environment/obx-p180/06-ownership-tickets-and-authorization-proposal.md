# OBX-P180 Step 6: Ownership, tickets, and authorization proposal

- Packet: `OBX-P180`
- Step: 6 of 7
- Status: planning proposal; implementation not authorized
- Depends on: Steps 1 through 5 exact-Grok CLEAN
- Governing requirements: `P180-R014` through `P180-R016`

## Boundary and present decision

This step proposes who must own the work, how later work would be sequenced, and the
exact first implementation authorization the repository owner could accept. It does
not accept that proposal. No ticket, favorable audit, completed fixture, role label,
or planning commit grants implementation authority.

The proposed first implementation slice is provider-offline only. It would create a
pure contract library, fixed fixtures, and deterministic in-memory adapters under
new isolated paths. It would not wire product runtime, change the frozen Canvas/job/
receipt contracts, call a model/provider, read credentials, persist state, add a
dependency, expose UI, add browser/collaboration, mutate Page IR, deploy, or release.

## Closed ownership contract

Every operative assignment must be an accepted, current `OwnerAssignmentV1`:

```text
OwnerAssignmentV1 = {
  schemaVersion: "owner-assignment-v1",
  assignmentId,
  roleId,
  humanActorId,
  projectId,
  permittedActions[],
  prohibitedActions[],
  governedArtifactHashes[],
  separationConstraintRefs[],
  escalationActorId,
  effectiveAt,
  expiresAt,
  revocationRef,
  acceptedAt,
  assignmentHash
}
```

Role, human, scope, expiry, acceptance, or escalation omission makes the assignment
unavailable. `escalationActorId` must resolve to a current named human different from
the assignee; a non-human, expired, revoked, missing, or same-human escalation is
invalid. A model, skill, provider, driver, worker, agent roster, audit reviewer, or
issue assignee cannot occupy a human role or accept an assignment. Assignment does
not create any action absent from the current scoped implementation authorization.

## Required roles and accountabilities

| Exact role ID | Accountable for | Cannot independently approve |
|---|---|---|
| `model-skill-security-owner` | provider/model/effort identity, route policy, skill/command admission, tool intersection, kill switches, injection/canary controls | own security-verifier result or implementation authorization |
| `job-sandbox-owner` | job/segment state, idempotency, CAS, cancellation, interrupt, replay/attach, sandbox/tool/path boundaries | own independent recovery/security verification |
| `evaluation-owner` | fixture/manifest hashes, deterministic oracles, quality/security/cost lane separation, NOT_RUN/BLOCKED truthfulness | product authorization or acceptance of own independent verification |
| `budget-operations-owner` | price/cap policies, hierarchy reservations, capacity/rate windows, reconciliation holds, queue/fairness, breach response | retroactive cap increase or independent verification of own reconciliation |
| `data-protection-owner` | data classes, regions/transfers, retention/deletion, telemetry/export, raw evidence access, repository payload census | waive Restricted/public-submission prohibition alone |
| `canvas-contract-steward` | frozen job/receipt/Page IR/apply/release compatibility and stale-safe proposal boundary | broaden the frozen foundation through this ticket |
| `implementation-lead` | provider-offline code/fixture execution within accepted paths and effects | accept own authorization or act as independent verifier |
| `independent-security-verifier` | adversarial verification of exact diff/evidence, residual-risk disposition, receipt integrity | implementation, policy authorship, budget reconciliation, or authorization acceptance for the reviewed slice |
| `repository-owner-authorizer` | accept/reject exact scoped authorization record and any later amendment | delegate acceptance to a model/audit/ticket state |

Before Ready, each of the first six operating roles, implementation lead,
independent verifier, and repository owner must resolve to at least one named,
current, unexpired, unrevoked human assignment. The independent verifier's
`humanActorId` must be disjoint from the implementation lead and every author of
every file in the reviewed frozen diff, not only policy/evaluator authors. Any
overlap invalidates authorization. A budget reconciler cannot independently verify
the reconciliation they authored. Multi-role assignment elsewhere must be explicit
and cannot erase these separations.

At this planning checkpoint the human assignments are intentionally `UNASSIGNED` in
this proposal. That is an implementation-readiness blocker, not a planning blocker
and not an invitation for this packet to invent names.

## Sequenced ticket ledger

No child ticket may start implementation until its exact scope is covered by an
accepted authorization. A predecessor's completion grants evidence, not authority.

| Order | Ticket | Scope and durable output | Entry gate | Exit evidence | Forbidden even on exit |
|---:|---|---|---|---|---|
| 0 | `OBX-P180-AUTH` | Owner fills assignments and accepts/rejects `OBX-AUTH-P180-OFFLINE-V1` in the authority manifest | Steps 1-7 clean; exact hashes/current branch recorded | accepted manifest record or explicit rejection | no implementation on proposed status |
| 1 | `OBX-P180-T01` | Pure closed types, canonicalization, self-hash, validators, and reason-code registry in the isolated operating-environment directory | accepted offline authorization; current `implementation-lead`, `model-skill-security-owner`, and `job-sandbox-owner` assignments | focused unit/property tests for unknown fields, enums, hashes, overflow, malformed records | imports from product runtime, network, credentials, persistence, dependencies |
| 2 | `OBX-P180-T02` | Separate fixture-only product/evaluation/external-review registries and immutable route/segment reducers | T01 accepted; current `implementation-lead`, `model-skill-security-owner`, and `job-sandbox-owner` assignments | identity, admission, switching, retry, fallback, CAS, late-output tests | live provider entry, product route enablement, silent fallback |
| 3 | `OBX-P180-T03` | Skill/slash/context/proposal-HITL/receipt reducers with synthetic artifacts | T02 accepted; current `implementation-lead`, `model-skill-security-owner`, `job-sandbox-owner`, and `data-protection-owner` assignments | grammar, kill, owner/expiry, context-order, injection, single-decision, acyclic/apply tests | executable skills, tools, Page IR apply, runtime bridge |
| 4 | `OBX-P180-T04` | Integer budget/capacity/compare reducers and crash/replay fixtures in memory | T02 accepted; current `implementation-lead`, `budget-operations-owner`, `job-sandbox-owner`, and `evaluation-owner` assignments | hierarchy/rate CAS, aggregate reserve, ambiguous hold, queue fairness, evidence-only arms | spending, provider usage trust, durable claim, auto winner/apply |
| 5 | `OBX-P180-T05` | Pin provider-offline fixture/evaluator commands and hashes in a standalone offline manifest-entry artifact | T01-T04 accepted; current `evaluation-owner`, `model-skill-security-owner`, and `budget-operations-owner` assignments | deterministic repeats, oracle mutation sensitivity, no-network/import proof, separate lane receipts | quality PASS, provider-connected claims, or edits to the program manifest |
| 6 | `OBX-P180-T06` | Compatibility proof against frozen teammate job/receipt and Canvas proposal/apply boundaries, using test fixtures only | T03-T05 accepted; current `canvas-contract-steward` and `job-sandbox-owner` assignments | no duplicate terminal owner, no runtime imports, stale/failed/compare apply rejection | edits to frozen contracts or teammate/Page IR behavior |
| 7 | `OBX-P180-T07` | Independent security and plan-scope verification of the exact offline diff | T01-T06 green; code frozen; current separated `independent-security-verifier` assignment | signed finding ledger with zero BLOCK/HIGH/MEDIUM, leak scan, test receipts, residual risk | self-review substitution or provider authorization |
| 8 | `OBX-P180-T08` | Owner closure decision for the provider-offline slice | T07 accepted; every required exact role assignment current | accepted completion receipt or rework/revocation | live route/provider/credential/persistence/UI/deploy/release |

Any provider-connected, credential, durable persistence, runtime bridge, UI, browser,
collaboration, Page IR mutation, deployment, or release work starts a new proposal
after T08. It is not a continuation hidden under these IDs.

## Ticket acceptance detail

### `OBX-P180-T01`: contract kernel

Allowed new path: `src/lib/operatingEnvironment/`. Proposed files:

```text
canonical.ts                 canonical.test.ts
contracts.ts                 contracts.test.ts
reasonCodes.ts               reasonCodes.test.ts
```

Acceptance: no product-runtime import; no I/O; safe-integer/closed-enum/unknown-field
rejection; canonical self-hash rules; property tests for malformed/extra fields and
integer overflow; exact schema fixtures. Failure is local and returns a typed reason.

### `OBX-P180-T02`: registry and route reducers

Proposed files:

```text
registry.ts                  registry.test.ts
routeState.ts                routeState.test.ts
fixtures/registry-v1.json    fixtures/route-state-v1.json
```

Acceptance: three non-promoting registries; fixture-only route; exact identity and
live admission; immutable segments; one same-route retry; no fallback; proposal-HITL
distinct from switch/cancel; replay/attach and late-output quarantine. No driver,
HTTP client, environment lookup, or provider entry may exist.

### `OBX-P180-T03`: skills, context, HITL, receipts

Proposed files:

```text
skills.ts                    skills.test.ts
context.ts                   context.test.ts
interrupts.ts                interrupts.test.ts
receipts.ts                  receipts.test.ts
fixtures/security-v1.json
```

Acceptance: command control/grammar/reserved names; current ownership/kill/expiry;
exact permission intersection; unique deterministic context materialization; live
freshness; one immutable interrupt plus CAS decision slot; completed-attempt-only
proposal review; direct completed/cancelled terminal; one frozen receipt owner;
acyclic supplemental graph; compare/non-completed/stale outputs never apply.

### `OBX-P180-T04`: budget, capacity, compare

Proposed files:

```text
budget.ts                    budget.test.ts
capacity.ts                  capacity.test.ts
compare.ts                   compare.test.ts
fixtures/budget-capacity-v1.json
```

Acceptance: integer worst case; atomic multi-scope and rate-window CAS; attach-only
provider usage; ambiguous budget/capacity holds; bounded/fair queues; claimed lease
across retry/HITL; two-arm identical fairness snapshot; aggregate reserve; arms
evidence-only; no automatic winner, default, apply, or third arm.

### `OBX-P180-T05` through `T08`: evidence and closure

T05 may edit only the exact eval paths in the authorization. It must run identical
fixtures twice and compare bounded results, exercise adversarial mutations, and prove
the module graph has no network/provider/credential/product-runtime adapter. T06 is
test-only compatibility and cannot import the new library into existing product
modules. T07 is performed by the assigned independent human on frozen bytes. T08
records the owner's outcome without expanding scope.

## Proposed implementation authorization

This is a proposal to copy into the existing authority manifest only if the
repository owner explicitly accepts it. Its status here remains proposed.

```text
ScopedImplementationAuthorizationProposalV1 = {
  schemaVersion: "scoped-implementation-authorization-proposal-v1",
  proposalId: "OBX-AUTH-P180-OFFLINE-V1",
  status: "proposed-not-accepted",
  projectId: "one-box",
  branch: "research/la-appointment-field-study",
  baseCommit: "b6486fdfa4601b315944ad099bf2beba1c053e91",
  planPacketHash: "TO-BE-FILLED-FROM-STEP-7-MANIFEST",
  effectPolicy: "deny-every-unlisted-path-and-effect",
  ticketScopes: [
    {
      ticketId: "OBX-P180-T01",
      predecessorTicketIds: [],
      requiredOwnerRoleIds: ["implementation-lead", "model-skill-security-owner", "job-sandbox-owner"],
      allowedPaths: [
        "src/lib/operatingEnvironment/canonical.ts",
        "src/lib/operatingEnvironment/canonical.test.ts",
        "src/lib/operatingEnvironment/contracts.ts",
        "src/lib/operatingEnvironment/contracts.test.ts",
        "src/lib/operatingEnvironment/reasonCodes.ts",
        "src/lib/operatingEnvironment/reasonCodes.test.ts"
      ],
      allowedEffects: ["add-pure-closed-contract-types-and-validators"]
    },
    {
      ticketId: "OBX-P180-T02",
      predecessorTicketIds: ["OBX-P180-T01"],
      requiredOwnerRoleIds: ["implementation-lead", "model-skill-security-owner", "job-sandbox-owner"],
      allowedPaths: [
        "src/lib/operatingEnvironment/registry.ts",
        "src/lib/operatingEnvironment/registry.test.ts",
        "src/lib/operatingEnvironment/routeState.ts",
        "src/lib/operatingEnvironment/routeState.test.ts",
        "src/lib/operatingEnvironment/fixtures/registry-v1.json",
        "src/lib/operatingEnvironment/fixtures/route-state-v1.json"
      ],
      allowedEffects: ["add-provider-offline-fixture-registries-and-route-reducers"]
    },
    {
      ticketId: "OBX-P180-T03",
      predecessorTicketIds: ["OBX-P180-T02"],
      requiredOwnerRoleIds: ["implementation-lead", "model-skill-security-owner", "job-sandbox-owner", "data-protection-owner"],
      allowedPaths: [
        "src/lib/operatingEnvironment/skills.ts",
        "src/lib/operatingEnvironment/skills.test.ts",
        "src/lib/operatingEnvironment/context.ts",
        "src/lib/operatingEnvironment/context.test.ts",
        "src/lib/operatingEnvironment/interrupts.ts",
        "src/lib/operatingEnvironment/interrupts.test.ts",
        "src/lib/operatingEnvironment/receipts.ts",
        "src/lib/operatingEnvironment/receipts.test.ts",
        "src/lib/operatingEnvironment/fixtures/security-v1.json"
      ],
      allowedEffects: ["add-provider-offline-skill-context-interrupt-receipt-reducers"]
    },
    {
      ticketId: "OBX-P180-T04",
      predecessorTicketIds: ["OBX-P180-T02"],
      requiredOwnerRoleIds: ["implementation-lead", "budget-operations-owner", "job-sandbox-owner", "evaluation-owner"],
      allowedPaths: [
        "src/lib/operatingEnvironment/budget.ts",
        "src/lib/operatingEnvironment/budget.test.ts",
        "src/lib/operatingEnvironment/capacity.ts",
        "src/lib/operatingEnvironment/capacity.test.ts",
        "src/lib/operatingEnvironment/compare.ts",
        "src/lib/operatingEnvironment/compare.test.ts",
        "src/lib/operatingEnvironment/fixtures/budget-capacity-v1.json"
      ],
      allowedEffects: ["add-provider-offline-in-memory-budget-capacity-compare-reducers"]
    },
    {
      ticketId: "OBX-P180-T05",
      predecessorTicketIds: ["OBX-P180-T01", "OBX-P180-T02", "OBX-P180-T03", "OBX-P180-T04"],
      requiredOwnerRoleIds: ["evaluation-owner", "model-skill-security-owner", "budget-operations-owner"],
      allowedPaths: [
        "scripts/eval/obx-p180-contract-fixtures.mjs",
        "scripts/eval/obx-p180-contract-fixtures.test.mjs",
        "docs/eval/one-box-program/fixtures/capacity-and-cost-fixture-v1.json",
        "docs/eval/one-box-program/fixtures/obx-p180-security-fixture-v1.json",
        "docs/eval/one-box-program/fixtures/obx-p180-human-decision-fixture-v1.json",
        "docs/eval/one-box-program/fixtures/obx-p180-apply-eligibility-fixture-v1.json",
        "docs/eval/one-box-program/obx-p180-offline-manifest-entry-v1.json"
      ],
      allowedEffects: ["pin-and-run-separate-provider-offline-evaluation-lanes"]
    },
    {
      ticketId: "OBX-P180-T06",
      predecessorTicketIds: ["OBX-P180-T03", "OBX-P180-T04", "OBX-P180-T05"],
      requiredOwnerRoleIds: ["canvas-contract-steward", "job-sandbox-owner"],
      allowedPaths: ["src/lib/operatingEnvironment/compatibility.test.ts"],
      allowedEffects: ["add-test-only-frozen-foundation-compatibility-proof"]
    },
    {
      ticketId: "OBX-P180-T07",
      predecessorTicketIds: ["OBX-P180-T06"],
      requiredOwnerRoleIds: ["independent-security-verifier"],
      allowedPaths: ["docs/audits/obx-p180/offline-independent-security-review.json"],
      allowedEffects: ["record-independent-security-review-of-frozen-diff"]
    },
    {
      ticketId: "OBX-P180-T08",
      predecessorTicketIds: ["OBX-P180-T07"],
      requiredOwnerRoleIds: ["repository-owner-authorizer"],
      allowedPaths: ["docs/audits/obx-p180/offline-owner-closure.json"],
      allowedEffects: ["record-owner-closure-without-scope-expansion"]
    }
  ],
  forbiddenEffects: [
    "provider-or-model-call", "provider-or-live-product-registry-enable",
    "credential-read-or-issuance", "network-or-browser", "new-dependency",
    "persistence-or-background-process", "runtime-product-import-or-wiring",
    "expose-ui-or-product-surface",
    "edit-frozen-canvas-job-receipt-page-ir-apply-release-contracts",
    "skill-or-tool-execution", "collaboration-or-schedule",
    "page-ir-or-candidate-mutation", "deployment-or-release",
    "customer-or-confidential-data", "automatic-fallback-winner-or-apply",
    "edit-program-eval-manifest-or-unrelated-eval-lane",
    "quality-pass-or-provider-connected-evaluation-claim"
  ],
  requiredOwnerRoleIds: [
    "model-skill-security-owner", "job-sandbox-owner", "evaluation-owner",
    "budget-operations-owner", "data-protection-owner",
    "canvas-contract-steward", "implementation-lead",
    "independent-security-verifier", "repository-owner-authorizer"
  ],
  requiredEvidence: [
    "all-owner-assignments-current-and-separation-valid",
    "steps-1-through-7-exact-grok-clean-on-current-hashes",
    "step-7-exact-fable-5-clean-on-whole-packet",
    "provider-offline-fixture-and-negative-sensitivity-green",
    "focused-unit-property-security-cost-capacity-compatibility-green",
    "typecheck-lint-plan-verification-and-leak-scan-green",
    "independent-security-verifier-accepts-exact-frozen-diff"
  ],
  invalidators: [
    "path-or-effect-outside-allowlist", "owner-expiry-revocation-or-conflict",
    "independent-verifier-is-author-of-any-reviewed-diff-file",
    "plan-or-foundation-hash-change", "dependency-or-lockfile-change",
    "provider-network-credential-persistence-runtime-or-ui-import",
    "unresolved-block-high-or-medium-finding", "fixture-or-oracle-drift",
    "test-typecheck-lint-plan-or-leak-gate-failure", "branch-or-base-change"
  ],
  expiresAt: "OWNER-MUST-SET",
  acceptedBy: null,
  acceptedAt: null,
  authorizationHash: null
}
```

Every ticket uses only its exact enumerated files after all predecessor tickets have
accepted evidence and every listed role assignment is current. There are no globs;
unlisted paths and effects are denied. The proposal cannot be accepted with placeholders,
null acceptance fields, missing current assignments, or an unresolved finding. Any
invalidator stops work and requires a new owner-reviewed proposal; it cannot be
waived by changing a test, audit prompt, ticket status, or model verdict.

## Required execution gates if accepted later

The implementation lead would run, at minimum:

```bash
npm test -- src/lib/operatingEnvironment
node --test scripts/eval/obx-p180-contract-fixtures.test.mjs
node --experimental-permission --allow-fs-read=. \
  scripts/eval/obx-p180-contract-fixtures.mjs \
  --fixture docs/eval/one-box-program/fixtures/capacity-and-cost-fixture-v1.json
npm run typecheck
npm run lint -- src/lib/operatingEnvironment scripts/eval
npm run test:plans
npm run verify:plans
gitleaks detect --no-banner --redact
```

Commands are proposed acceptance gates, not current authorization to implement the
new library. T07 must also inspect imports, changed paths, lockfile/dependency diff,
provider/network/credential strings, raw payload census, receipt graph, and every
test output against the accepted authorization hash.

## Definition of Ready

The provider-offline slice is Ready only after all are true:

1. Steps 1 through 7 have exact current hashes and clean required audits;
2. every required role has a current named human and separations are valid;
3. the repository owner replaces all proposal placeholders, sets expiry, and accepts
   the exact record in the authority manifest;
4. branch/base/paths/effects/forbidden effects/tests/invalidators are exact;
5. the frozen Canvas/job/receipt/Page IR/apply/release baseline is unchanged;
6. no product/provider/credential/persistence/dependency/UI behavior is in scope;
7. every ticket has its predecessor evidence and a stop-work invalidator check.

Until then, status is `PLANNED / NOT AUTHORIZED`.

## Acceptance criteria

`OBX-P180-S6` is acceptable only when:

1. roles have exact non-overlapping accountabilities, current human-assignment rules,
   escalation, expiry/revocation, and independent-verifier separation;
2. tickets are ordered, path/effect bounded, evidence-gated, and cannot inherit
   authority from predecessors or favorable audits;
3. the proposed authorization names exact branch, tickets, paths, allowed/forbidden
   effects, owners, evidence, invalidators, expiry, and acceptance fields;
4. placeholders/nulls make the proposal unaccepted and only repository-owner action
   in the authority manifest can accept it;
5. the first slice is provider-offline and cannot import or wire product runtime,
   add dependencies, use secrets/network/persistence, or mutate Canvas/Page IR;
6. provider-connected or broader work is explicitly a new authorization proposal;
7. exact Grok 4.6 binds this file's current bytes and reports no unresolved BLOCK,
   HIGH, or MEDIUM finding.

Passing Step 6 completes an authorization proposal, not authorization. No runtime,
provider, credential, dependency, persistence, browser, collaboration, Page IR,
deployment, or release behavior may change.
