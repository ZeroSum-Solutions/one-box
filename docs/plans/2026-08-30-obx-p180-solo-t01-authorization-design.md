# OBX-P180 solo T01 authorization design

- Owner: Devin Wiggins (`person:devin-wiggins`)
- Project: `one-box`
- Branch: `research/la-appointment-field-study`
- Frozen planning base: `b6486fdfa4601b315944ad099bf2beba1c053e91`
- Proposed authorization ID: `OBX-AUTH-P180-T01-SOLO-001`
- Required amendment ID: `OBX-P180-T01-SOLO-AMENDMENT-001`
- Proposed child ticket: `OBX-P180-T01`
- Proposed duration: exactly 336 hours from `recordedAt`
- Design direction approved in Codex thread `01a0553b-ef7d-7b42-9f59-7204480be636`

## Goal and present state

Make only `OBX-P180-T01` ready to start under a truthful, hash-bound solo-operator
authorization. Devin may be the repository owner, risk owner, authorizer, and T01
implementation actor. The authorization must never represent Devin as holding a valid
`OwnerAssignmentV1` for a role whose assignment or separation requirements cannot be
met by one human.

Before the exact amendment, registry record, receipts, and verifier changes described
here are present and valid, the state remains:

```text
BLOCKER / NOT AUTHORIZED
```

The activated authorization ends at the T01 boundary. It grants no authority for T02
through T08 and no product-runtime, provider, network, credential, persistence, browser,
collaboration, Canvas/Page IR, deployment, release, or dependency effect.

## Existing conflict and exact accepted loss

The frozen `OBX-AUTH-P180-OFFLINE-V1` proposal cannot be activated by one human. T01
requires current `OwnerAssignmentV1` records for `implementation-lead`,
`model-skill-security-owner`, and `job-sandbox-owner`. Each assignment requires a
different, current named-human escalation actor. The implementation lead also cannot
accept their own authorization, and an independent security verifier must be disjoint
from the implementation actor and every frozen-diff author.

No such assignments or separated humans are available. The solo record therefore
enumerates every unavailable control instead of assigning Devin implicitly:

| Control or required role | Stored assignment status | Stored escalation status | Separation satisfied |
|---|---|---|---:|
| `OwnerAssignmentV1` contract for T01 | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `false` |
| `implementation-lead` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `false` |
| `model-skill-security-owner` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `false` |
| `job-sandbox-owner` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `false` |
| implementation-actor / authorizer separation | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `false` |
| independent human security review | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `false` |

For every unavailable role, `assignmentRecordPresent` is `false`, `humanActorId` is
`null`, and `escalationActorId` is `null`. A same-human, model, agent, implied, inherited,
or synthetic assignment is invalid. In particular, the record must reject Devin as the
assignee or escalation actor for any of the three T01 roles. Devin is recorded separately
as `implementationActorId` and `authorizedByActorId`; those fields do not satisfy an
`OwnerAssignmentV1` requirement.

The combined loss has one finding only:

```text
findingId: OBX-P180-T01-SOLO-SEPARATION-001
severity: MEDIUM
status: ACCEPTED
```

Independent human review remains `NOT_AVAILABLE` and `satisfied: false`. Model review
and owner self-review remain advisory. They can neither change that enum nor satisfy a
human role.

## Chosen scope

The chosen exception is one child ticket for 336 hours. It binds six exact paths, one
exact effect, a frozen packet, a frozen governance default, and exact evidence receipts.
It stops after T01. T02 requires a new owner decision and a different authorization.

A broad solo authorization for T01 through T08 is rejected. Treating missing humans as
ordinary assignments is also rejected. The frozen team proposal remains the preferred
future model and remains `proposed-not-accepted`.

## Closed stored record

The registry advances to top-level `schemaVersion: 2` solely to admit the following one
record kind. It retains the exact top-level key set `schemaVersion`, `program`, `status`,
`globalImplementationAuthorized`, and `authorizations`. The last array contains exactly
the unchanged `OBX-AUTH-ATF-001` value and this solo record. No third record, unknown
record kind, or unknown key is valid.

The solo record has this exact field contract. Fields described as derived values are
stored as concrete final values before activation; placeholder strings are invalid.

```text
id: "OBX-AUTH-P180-T01-SOLO-001"
recordKind: "owner-solo-child-ticket-exception-v1"
status: "authorized-with-solo-exception"
implementationAuthorized: true
projectId: "one-box"
branch: "research/la-appointment-field-study"
baseCommit: "b6486fdfa4601b315944ad099bf2beba1c053e91"
activationBaseCommit: the stored full commit ID immediately before authority implementation
activationWriteSet: the exact ordered goal write set defined below
preExistingUntrackedBaseline: the exact path/hash rows captured at activation start
parentTicketId: "OBX-P180"
parentTicketStatus: "proposed"
childTicketIds: ["OBX-P180-T01"]
authorizationProposalId: "OBX-AUTH-P180-OFFLINE-V1"
ownerActorId: "person:devin-wiggins"
riskOwnerActorId: "person:devin-wiggins"
implementationActorId: "person:devin-wiggins"
authorizedByActorId: "person:devin-wiggins"
ownerAssignmentV1Status: "NOT_AVAILABLE"
roleAvailability: the three exact unavailable role rows defined below
implementationAuthorizationSeparation.status: "NOT_AVAILABLE"
implementationAuthorizationSeparation.satisfied: false
escalation.status: "NOT_AVAILABLE"
escalation.actorId: null
independentHumanReview.status: "NOT_AVAILABLE"
independentHumanReview.satisfied: false
independentHumanReview.actorId: null
acceptedRisk.findingId: "OBX-P180-T01-SOLO-SEPARATION-001"
acceptedRisk.severity: "MEDIUM"
acceptedRisk.status: "ACCEPTED"
acceptedRisk.reasonCode: "SOLO_OWNER_SEPARATION_UNAVAILABLE"
requirementExceptions: the three exact exception rows defined below
traceabilityRefs: ["EOS-006", "EOS-012", "PROG-EVAL-COST-001", "PROG-EVAL-SEC-AGENT-001"]
allowedPaths: the exact ordered six-path array defined below
allowedEffects: ["add-pure-closed-contract-types-and-validators"]
forbiddenEffects: the exact closed array defined below
frozenArtifacts: the exact path/hash array defined below
planPacketBinding: the exact Step 7 path/algorithm/digest defined below
sourcePlanBinding: the exact Step 6 path/algorithm/digest defined below
governanceBindings: the exact path/hash records defined below
dependencyBindings: the exact path/hash records defined below
amendmentBinding: the exact amendment path/id/algorithm/final digest defined below
requiredEvidencePaths: the three exact final receipt paths defined below
invalidators: the exact closed array defined below
recordedAt: a stored canonical RFC3339 UTC instant
expiresAt: a stored canonical RFC3339 UTC instant exactly 336 hours later
renewable: false
authorizationHash.algorithm: "sha256"
authorizationHash.canonicalization: "canonical-json-v1"
authorizationHash.excludedJsonPointers: ["/authorizationHash/digest"]
authorizationHash.digest: a stored 64-character lowercase hexadecimal digest
```

Unknown or missing keys fail closed at every object level. `canonical-json-v1` means
UTF-8 JSON, recursively lexicographically sorted object keys, original array order,
no insignificant whitespace, and no omitted values. The verifier recomputes the digest
over the entire record with only `/authorizationHash/digest` absent and rejects mismatch.

`recordedAt` and `expiresAt` must use the canonical `YYYY-MM-DDTHH:mm:ssZ` form. The
verifier rejects fractional seconds, offsets other than `Z`, a date-only value, an
invalid instant, a future `recordedAt`, an interval other than exactly 1,209,600 seconds,
an expired active record, a missing `renewable`, or any `renewable` value other than
`false`.

### Exact unavailable-role rows

`roleAvailability` is an ordered array with exactly these role IDs and, for each row,
exactly these values: `assignmentStatus: "NOT_AVAILABLE"`,
`assignmentRecordPresent: false`, `humanActorId: null`,
`escalationStatus: "NOT_AVAILABLE"`, `escalationActorId: null`, and
`separationSatisfied: false`.

1. `implementation-lead`
2. `model-skill-security-owner`
3. `job-sandbox-owner`

No additional role row is allowed. A future real `OwnerAssignmentV1` does not mutate
this record; it requires a replacement authorization.

### Exact requirement-exception rows

The record must not claim that the governing requirements are satisfied. It stores:

| Requirement | exceptionStatus | satisfactionStatus | Exact waived clauses for T01 only |
|---|---|---|---|
| `P180-R014` | `EXCEPT_T01_SOLO` | `NOT_SATISFIED` | named-human operating-role coverage for the three T01 roles; accepted/current `OwnerAssignmentV1` records; distinct per-role escalation humans |
| `P180-R015` | `EXCEPT_T01_SOLO` | `NOT_SATISFIED` | no authority inherited from planning/model evidence; T01 instead receives only this separately accepted, exact child authorization despite the unavailable role gate |
| `P180-R016` | `EXCEPT_T01_SOLO` | `NOT_SATISFIED` | implementation-lead/authorizer separation and the ordinary exact-owner roster; repository-owner acceptance, exact paths/effects/invalidators/tests/forbidden capabilities remain mandatory and are not waived |

These IDs are traceability and exception disclosures, never T01 PASS evidence. The
verifier rejects `SATISFIED`, `PASS`, `COMPLETE`, omission of a waived clause, or use of
the exception status for another ticket, project, branch, authorization, or actor.
Parent references `EOS-006`, `EOS-012`, `PROG-EVAL-COST-001`, and
`PROG-EVAL-SEC-AGENT-001` remain traceability-only and `planned`/`NOT_RUN`; they cannot
be marked complete by this authorization.

## Exact T01 capability boundary

`allowedPaths` is an exact ordered array, not a prefix or glob policy:

```text
src/lib/operatingEnvironment/canonical.ts
src/lib/operatingEnvironment/canonical.test.ts
src/lib/operatingEnvironment/contracts.ts
src/lib/operatingEnvironment/contracts.test.ts
src/lib/operatingEnvironment/reasonCodes.ts
src/lib/operatingEnvironment/reasonCodes.test.ts
```

The verifier requires array equality with those six strings: same length, order, and
values. It rejects prefixes, directories, normalization aliases, traversal, globs,
symlinks, case variants, extra paths, and missing paths. ATF prefix behavior is not
reused for this record kind.

The only allowed effect is
`add-pure-closed-contract-types-and-validators`. `allowedEffects` is an exact one-item
array, and any other effect is denied.

`forbiddenEffects` is an exact closed array:

```text
product-runtime-import-or-effect
provider-or-model-call
network
credential-or-environment-access
filesystem-or-shell-io
persistence-or-durable-state
queue-or-background-worker
browser
ui
collaboration
canvas-or-page-ir-read-write-or-mutation
deployment
release
dependency-or-lockfile-change
mutable-global-state
clock-or-randomness
authority-outside-exact-solo-record
t02-through-t08
parent-evaluation-completion-claim
independent-human-review-claim
production-readiness-claim
```

T01 is pure deterministic computation. It cannot read the clock, randomness,
environment, filesystem, browser, network, credentials, providers, persistence, product
runtime, mutable global state, Canvas, or Page IR.

## Frozen packet and base binding

The authorization stores `baseCommit` exactly as specified above and the following
`frozenArtifacts` entries. Each entry has `algorithm: "sha256"`; the verifier reads and
rehashes every path independently. Step 7's table is not trusted as a hash oracle.

| Exact path | SHA-256 |
|---|---|
| `docs/plans/one-box-master/04-operating-environment/obx-p180/README.md` | `a7f6ec197adebdc935b5e01251da4735d471c0fc443453f9aeeaca284464a017` |
| `docs/plans/one-box-master/04-operating-environment/obx-p180/01-gap-and-conflict-matrix.md` | `f7bd960de6efc56185ff974a5078ade94bb0dbd28d188978d1001e133c546604` |
| `docs/plans/one-box-master/04-operating-environment/obx-p180/02-provider-registry-and-route-contract.md` | `61ab80eb579df514a5627f4d5ecb4133c61497c6e0a7895fb22e6581729be13d` |
| `docs/plans/one-box-master/04-operating-environment/obx-p180/03-skills-context-and-receipts.md` | `7755dee982a321a318843d6ce41d24b087032f533d4796283d8096c68227d31d` |
| `docs/plans/one-box-master/04-operating-environment/obx-p180/04-budget-capacity-compare-failure.md` | `e67002acfeea154a8376513fdf16add713af6ad436d68813e7c7158fd614d31b` |
| `docs/plans/one-box-master/04-operating-environment/obx-p180/05-security-and-executable-evaluations.md` | `13f99c0d6bd5a165625fbaf614ab4d9e67055570dd1d96c71d348bdec444314c` |
| `docs/plans/one-box-master/04-operating-environment/obx-p180/06-ownership-tickets-and-authorization-proposal.md` | `385e3c046528abe7f9a7307421741386fa0abf032f06e094745833feaa3370af` |
| `docs/plans/one-box-master/04-operating-environment/obx-p180/07-closure-and-disposition.md` | `ce4bb95623bc4c3eaef29475f7b582e5feec266063da0cfc0753483e00cc8420` |
| `docs/eval/one-box-program/fixtures/capacity-and-cost-fixture-v1.json` | `81ab1796a7f706d84ceae54c0539e725b1b95c821ebe56d02af6b1c85c1fc738` |
| `docs/eval/one-box-program/fixtures/obx-p180-security-fixture-v1.json` | `ce368d420953f6f8996f2b4902c2fd7e3916f2f43e0bd3a0d578c07580091940` |
| `docs/eval/one-box-program/fixtures/obx-p180-human-decision-fixture-v1.json` | `3d32ec35ee532b8acb15de1ab780bebdd828e371dc65fef491cbe491fabc6d11` |
| `docs/eval/one-box-program/fixtures/obx-p180-apply-eligibility-fixture-v1.json` | `ad5116d85ac2ecc8ded78f209aee16c8a58adb3c569f58a7a1fdfb2c810ff0cf` |
| `scripts/eval/obx-p180-contract-fixtures.mjs` | `19567521a37d524f654c6e241879a349a7c522f8a40681d08fd706ff6b36dfab` |
| `scripts/eval/obx-p180-contract-fixtures.test.mjs` | `141ed3114269cb88c8725dc9b56c736914b38a7c8abcc8dce7523eb2bbd1f4a6` |
| `scripts/eval/grok-audit.mjs` | `400238ae208ce5b2c426303ead6500a1049b9b94ced45934796a3c1f67d8f473` |

The closure path/hash is also stored as `planPacketBinding`; the Step 6 path/hash is
also stored as `sourcePlanBinding`. Both objects contain `path`, `algorithm: "sha256"`,
and `digest`. A mismatch in any nested artifact, Step 7, Step 6, or `baseCommit`
immediately invalidates authorization.

The record also stores and the verifier rechecks exact `dependencyBindings` so a
dependency change cannot hide behind a passing source census:

| Exact path | Algorithm | Digest |
|---|---|---|
| `package.json` | `sha256` | `c1feab7cc337c89a59d344da2854764b488a831bf40ab6e98d00338a5a7d421e` |
| `package-lock.json` | `sha256` | `b2f15e1f27c86ad1c2b98a67674367ce8ada5fb9ba6d32702f9de4bd09a66191` |

## Exact governance amendment and frozen default

The only amendment file is:

```text
docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json
```

It has exact ID `OBX-P180-T01-SOLO-AMENDMENT-001`, exact authorization ID
`OBX-AUTH-P180-T01-SOLO-001`, `standardWaiverEligible: false`, the six explicit
unavailable-control rows, the three exact requirement-exception rows, the one accepted
finding, exact T01 paths/effect, exact expiry, and `renewable: false`. Unknown keys fail
closed. Its final SHA-256 digest is stored in both `amendmentBinding.digest` and a literal
verifier constant after its bytes settle. The binding also stores its exact path and
`algorithm: "sha256"`. No placeholder digest may enter the registry.

This is not a generalized risk-waiver mechanism. The verifier honors only the tuple:

```text
OBX-AUTH-P180-T01-SOLO-001
OBX-P180-T01-SOLO-AMENDMENT-001
the exact final amendment SHA-256 digest
OBX-P180-T01
person:devin-wiggins
research/la-appointment-field-study
```

Every other amendment ID, digest, authorization, ticket, actor, branch, project, or
waiver route is rejected. The ordinary non-waivable default remains frozen. Neither
`docs/governance/risk-exceptions/README.md` nor `docs/governance/reviewer-roles.md` may
be edited. The record stores and the verifier rechecks these governance bindings:

| Exact path | Algorithm | Digest |
|---|---|---|
| `docs/governance/risk-exceptions/README.md` | `sha256` | `c5139be92b42987e70d73b6851530d4917c8716b96cfcfbda1c7e9a685f726c2` |
| `docs/governance/reviewer-roles.md` | `sha256` | `ea1f4cf440ce3122bf40866c0097c516550d876e9674462bbe61edc7dcb701bc` |

The verifier snapshot-tests the exact non-waivable authorization sentences and these
hashes. This one exact owner amendment is an additional, narrow authority record; it
does not alter, waive, reinterpret, or extend the default policy.

## Exact evidence oracles

Activation requires these three exact paths; no `docs/audits/` prefix or substitute
receipt is accepted:

```text
docs/audits/evidence/security/2026-08-30-obx-p180-t01-solo-authorization-security-review.json
docs/audits/grok-4.6/2026-08-30-obx-p180-solo-t01-authorization-final-audit.json
docs/audits/fable-5/2026-08-30-obx-p180-solo-t01-authorization-final-audit.json
```

Each receipt must be parsed, not existence-checked. Each uses the exact top-level keys
`schemaVersion`, `receiptKind`, `authorizationId`, `authorizationHash`,
`amendmentId`, `amendmentHash`, `baseCommit`, `targetPaths`, `targetHashes`, `verdict`,
`findings`, `independentHumanReview`, and `capturedAt`. The two model receipts
additionally require `requestedModel`, `providerReportedModel`, and `effort`.
Unknown/missing keys fail closed at every object level. Every `targetHashes` entry contains only `path`,
`algorithm: "sha256"`, and the final lowercase digest, in the same order as
`targetPaths`; the verifier rehashes every target.

Required common values are:

```text
schemaVersion: 1
authorizationId: "OBX-AUTH-P180-T01-SOLO-001"
authorizationHash: exact current stored authorizationHash.digest
amendmentId: "OBX-P180-T01-SOLO-AMENDMENT-001"
amendmentHash: exact current stored amendmentBinding.digest
baseCommit: "b6486fdfa4601b315944ad099bf2beba1c053e91"
verdict: "PASS-WITH-ACCEPTED-RISK"
independentHumanReview.status: "NOT_AVAILABLE"
independentHumanReview.satisfied: false
findings.length: 1
findings[0].findingId: "OBX-P180-T01-SOLO-SEPARATION-001"
findings[0].severity: "MEDIUM"
findings[0].status: "ACCEPTED"
```

The exact security-receipt `targetPaths` array is:

```text
docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json
docs/plans/one-box-master/00-authority/authority-manifest.json
docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json
scripts/verify-plan-authority.mjs
scripts/verify-plan-authority.node.mjs
```

The Grok receipt has the same five entries followed by:

```text
docs/audits/evidence/security/2026-08-30-obx-p180-t01-solo-authorization-security-review.json
```

The Fable receipt has the Grok array followed by:

```text
docs/audits/grok-4.6/2026-08-30-obx-p180-solo-t01-authorization-final-audit.json
```

The security receipt uses `receiptKind: "solo-t01-security-review-v1"` and exactly six
surface rows inside its sole finding's `surfaceDisposition`: `prompt-injection`,
`secrets`, `authentication`, `authorization`, `untrusted-input`, and `export`. Each row
must contain changed-path evidence and a fixed disposition; `NOT_APPLICABLE` is allowed
only for a surface with explicit path evidence. Authorization must be reviewed, not
`NOT_APPLICABLE`.

The Grok receipt uses `receiptKind: "solo-t01-model-audit-v1"`,
`requestedModel: "x-ai/grok-4.6"`, `providerReportedModel: "x-ai/grok-4.6"`, and
`effort: "high"`. The Fable receipt uses the same receipt kind,
`requestedModel: "claude-fable-5"`, `providerReportedModel: "claude-fable-5"`, and
`effort: "max"`. Their finding arrays must contain only the accepted separation finding.

Any missing receipt, wrong schema/model/effort/verdict, absent accepted finding, changed
finding ID/severity/status, extra finding, claimed independent review, target mismatch,
or stale authorization/amendment hash invalidates activation. The preserved adverse
design audit at
`docs/audits/grok-4.6/2026-08-30-obx-p180-solo-t01-design-audit.json` is history, not
passing evidence, and must never be overwritten or deleted.

## Verifier implementation contract

`scripts/verify-plan-authority.mjs` keeps the ATF validator behavior byte-stable and adds
an ID-specific solo validator. It must not share ATF prefix/glob admission logic with the
solo record. The solo validator hard-codes:

- the exact record kind and complete key sets;
- exact equality for the six paths and one effect;
- all unavailable-role/separation enums and `false` values;
- every requirement exception and waived clause;
- every artifact and governance hash;
- the one exact amendment ID/path/final digest;
- the three exact receipt paths and receipt schemas;
- the base commit, duration, expiry, and authorization self-hash; and
- the exact invalidator array.

`scripts/verify-plan-authority.node.mjs` runs against copies of the committed registry,
manifest, amendment, governance, packet, dependency, and receipt bytes. It may mutate
those copies per case, but it must not use a parallel synthetic graph that can diverge
from the committed artifacts.

The positive oracle requires all of the following simultaneously:

- registry top-level `schemaVersion === 2` and `globalImplementationAuthorized === false`;
- exact top-level registry keys and exactly two authorization records;
- ATF deep-equality with its base value and canonical SHA-256
  `1d46a9476b9cda04727e02cd171bf7d700352deec045cd673011b23034315a3f`;
- exact solo-record schema and self-hash;
- authority-manifest deep-equality to base except `packetDigest`;
- unchanged governance defaults and dependency files;
- every nested packet hash and the base commit;
- exact amendment identity/hash; and
- exact parsed security/Grok/Fable evidence.

Negative tests must individually prove rejection for every case below. Each fixture that
mutates a stored solo-record field recomputes `authorizationHash.digest` and every other
derived checksum not under test, so the targeted field guard is exercised against a
hash-consistent forged record. Case 17 alone intentionally preserves or introduces a
self-hash mismatch. File, amendment, manifest, and receipt mutations likewise refresh
unrelated derived values unless the named mismatch is the behavior under test.

1. any ATF field, nested value, array item, or canonical digest changes;
2. `globalImplementationAuthorized: true` or a changed registry program/status/key set;
3. schema version other than exactly `2`, unknown record kind, third record, or unknown key;
4. missing `renewable`, `renewable: true`, date-only `recordedAt`, non-UTC timestamp,
   future time, expiry drift, or an interval other than 1,209,600 seconds;
5. `escalationActorId: "person:devin-wiggins"`, any other escalation actor, a same-human
   or implied role assignment, a present `OwnerAssignmentV1`, or any unavailable role
   represented as assigned;
6. `not-available`, `PASS`, or any token other than exact `NOT_AVAILABLE`; any unavailable
   `satisfied: true`; any non-null independent reviewer or role assignee;
7. any `P180-R014`, `P180-R015`, or `P180-R016` row claimed `SATISFIED`, `PASS`, or
   `COMPLETE`, missing its waived clauses, or applied beyond exact T01;
8. one byte changed in each nested frozen artifact, Step 7, Step 6, or the base commit;
9. path omission, addition, reorder, prefix, directory, glob, traversal, symlink, case
   change, normalization alias, or a seventh path such as
   `src/lib/operatingEnvironment/registry.ts`;
10. effect omission/addition/change or any forbidden source import/capability/effect;
11. missing or altered amendment, wrong amendment ID/path/hash, unknown amendment key,
    `standardWaiverEligible: true`, renewable amendment, or broadened actor/ticket/branch;
12. any byte or non-waivable sentence change in either frozen governance file;
13. `package.json`, `package-lock.json`, another dependency manifest, or a lockfile change;
14. any authority-manifest field other than `packetDigest` changing, including
    `implementationAuthorized`, a domain, policy, path, or status field;
15. either parent evaluation reference marked PASS/complete, parent `OBX-P180` promoted,
    or any authority for T02 through T08;
16. missing/malformed/stale receipt, wrong exact path, wrong schema/model/effort/verdict,
    wrong accepted finding, extra finding, or a receipt claiming independent review;
17. authorization self-hash omission, unknown exclusion, algorithm/canonicalization drift,
    or digest mismatch; and
18. any extra write outside the exact goal write set below, including an arbitrary file
    under `docs/audits/`; this case is exercised through the source-scope census described
    below, whose test injects the extra path into a hash-consistent changed-path fixture; and
19. an otherwise valid active record evaluated at a time strictly later than `expiresAt`.

## Exact invalidators

The stored `invalidators` array is exact and closed:

```text
base-commit-mismatch
authorization-hash-mismatch
packet-artifact-path-or-hash-drift
source-plan-path-or-hash-drift
governance-default-path-or-hash-drift
amendment-path-id-schema-or-hash-drift
receipt-path-schema-target-or-hash-drift
timestamp-invalid-expired-or-renewal
assignment-or-separation-claim
requirement-exception-drift
allowed-path-or-effect-drift
dependency-or-lockfile-change
product-runtime-or-io-effect
provider-network-credential-or-environment-effect
persistence-queue-or-background-effect
browser-ui-or-collaboration-effect
canvas-or-page-ir-effect
deployment-or-release-effect
parent-ticket-or-evaluation-promotion
t02-through-t08-authority
gate-failure
additional-unaccepted-finding
independent-review-or-production-readiness-claim
```

Any invalidator makes T01 not ready immediately. There is no automatic fallback,
renewal, scope normalization, or amendment inheritance.

## Exact goal write set and key allowlists

The authorization goal may modify or create only these exact files:

```text
docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json
docs/plans/one-box-master/00-authority/authority-manifest.json
docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json
scripts/verify-plan-authority.mjs
scripts/verify-plan-authority.node.mjs
docs/audits/evidence/security/2026-08-30-obx-p180-t01-solo-authorization-security-review.json
docs/audits/grok-4.6/2026-08-30-obx-p180-solo-t01-authorization-final-audit.json
docs/audits/fable-5/2026-08-30-obx-p180-solo-t01-authorization-final-audit.json
```

The verifier exposes a pure `verifySoloActivationSourceScope` decision that consumes the
captured output of `git diff --name-only <activationBaseCommit>...HEAD` and
`git status --porcelain=v1 -uall`. It requires the committed changed-path set to equal the
stored `activationWriteSet` and the untracked set to equal the stored
`preExistingUntrackedBaseline` by exact path and SHA-256. The activation command captures
those two Git outputs; the unit test supplies the same normalized arrays and proves that an
otherwise inert extra `docs/audits/` path fails. This is the mechanical oracle for negative
case 18; receipt parsing alone is not claimed to inventory the working tree.

Before `activationBaseCommit` is captured, the design-review history may contain only
these exact immutable receipts:

```text
docs/audits/grok-4.6/2026-08-30-obx-p180-solo-t01-design-audit.json
docs/audits/grok-4.6/2026-08-30-obx-p180-solo-t01-design-reaudit.json
docs/audits/fable-5/2026-08-30-obx-p180-solo-t01-design-audit.json
docs/audits/grok-4.6/2026-08-30-obx-p180-solo-t01-design-final-audit.json
docs/audits/fable-5/2026-08-30-obx-p180-solo-t01-design-final-audit.json
```

Those pre-activation receipts are not members of `activationWriteSet`. They are committed
before the activation base is frozen and become read-only history at that point. No design
receipt may be overwritten or presented as an activation receipt.

Within the registry, the only allowed changes from the frozen base are top-level
`schemaVersion: 1 -> 2` and appending the one exact solo record; the top-level key set,
`program`, `status`, `globalImplementationAuthorized: false`, and ATF record are fixed.
Within the authority manifest, only `packetDigest` may change after all final bytes
settle; every other field must be deep-equal to its base value. The amendment and three
receipts accept only their schemas defined here.

There is no writable audit prefix, no `README.md` edit, and no write permission for
`docs/governance/reviewer-roles.md`, dependency files, packet files, T01 implementation
files, runtime files, or any other authority/governance surface.

## Gates and activation order

1. Freeze this remediated design and obtain an exact Grok design re-audit without
   unresolved findings.
2. Create the exact amendment, then pin its final digest in the amendment binding and
   verifier constant.
3. Add the solo record with concrete timestamps, exact 336-hour expiry, exact derived
   hashes, and no placeholders.
4. Add the ID-specific verifier and committed-byte positive/negative tests.
5. Refresh only `authority-manifest.json.packetDigest` after the registry, amendment,
   and verifier bytes settle. Freeze the five security-receipt target files; do not
   change any target byte after its first receipt is captured.
6. Generate the exact security receipt. It must return
   `PASS-WITH-ACCEPTED-RISK` with only
   `OBX-P180-T01-SOLO-SEPARATION-001 / MEDIUM / ACCEPTED`.
7. Generate the exact Grok and Fable receipts under the same verdict and sole-finding
   rule. They remain advisory and must preserve human review as `NOT_AVAILABLE / false`.
8. Run authority verification against committed artifact bytes, all negative fixtures,
   plan tests, plan verification, typecheck, focused lint, diff check, changed-range
   secret scan, dependency/lockfile check, and source-scope/import census.
9. Create a frozen checkpoint. Any later target-byte change invalidates receipts and
   requires re-review.

Activation stops for any finding other than the exact accepted separation finding, any
finding with a different ID/severity/status, or any failed gate. There is no owner
downgrade path in this design.

## Success criteria

The goal is complete only when all criteria are mechanically proven:

1. All fifteen frozen packet/evaluator artifacts and the frozen base commit rehash to
   the stored values.
2. The registry contains exactly the unchanged ATF record and exact solo record;
   `globalImplementationAuthorized` remains `false`.
3. The solo record binds Devin, only T01, exact unavailable controls, exact requirement
   exceptions, six paths, one effect, forbidden effects, hashes, algorithms,
   invalidators, timestamps, amendment, receipts, and authorization self-hash.
4. The exact owner amendment is active and hash-bound while the non-waivable default
   files and sentences remain unchanged for every other case.
5. Parent `OBX-P180` and its evaluation references remain proposed/planned; T02 through
   T08 remain unauthorized.
6. Positive authority verification passes and every numbered negative mutation above
   fails against committed artifact copies.
7. Plan tests, plan verification, typecheck, focused lint, diff check, changed-range
   secret scan, dependency/lockfile check, and source-scope/import census pass.
8. The exact security, Grok, and Fable receipts each parse to
   `PASS-WITH-ACCEPTED-RISK` with exactly the one accepted
   `OBX-P180-T01-SOLO-SEPARATION-001 / MEDIUM` finding and
   `independentHumanReview: NOT_AVAILABLE / false`.
9. A checkpoint binds the final record, amendment, verifier, receipts, and manifest
   digest.
10. The terminal state is exactly:

```text
OBX-P180-T01 READY UNDER SOLO EXCEPTION
INDEPENDENT HUMAN REVIEW NOT_AVAILABLE / false
T02 THROUGH T08 NOT AUTHORIZED
```

This terminal state authorizes only the pure provider-offline T01 implementation start.
It does not claim independent verification, parent completion, product readiness, or any
provider, credential, persistence, runtime, UI, Canvas/Page IR, deployment, or release
authority.
