# OBX-P180 solo T01 authorization design

- Owner: Devin Wiggins (`person:devin-wiggins`)
- Project: `one-box`
- Branch: `research/la-appointment-field-study`
- Frozen planning base: `b6486fdfa4601b315944ad099bf2beba1c053e91`
- Proposed authorization ID: `OBX-AUTH-P180-T01-SOLO-001`
- Proposed child ticket: `OBX-P180-T01`
- Proposed duration: exactly 14 days from `recordedAt`
- Design direction approved in Codex thread `01a0553b-ef7d-7b42-9f59-7204480be636`

## Goal

Make only `OBX-P180-T01` legally ready to start under a truthful solo-operator
authorization. Devin may act as owner, authorizer, implementation lead, and the required
operating roles for this child ticket. The record must say that independent human review
is not available; model audits and self-review remain advisory and cannot be represented as
independent verification.

The authorization ends before T01 implementation. It grants no authority for T02 through
T08 and no product-runtime, provider, network, credential, persistence, browser,
collaboration, Page IR, deployment, or release effect.

## Existing conflict and explicit owner decision

The frozen `OBX-AUTH-P180-OFFLINE-V1` proposal cannot be activated by one human. Its
current rules require a different escalation human, prohibit the implementation lead from
accepting their own authorization, and require an independent verifier disjoint from every
diff author. Devin has stated that all work must presently be performed by Devin alone.

This design does not relabel that state as compliant. The existing proposal remains
`proposed-not-accepted`, and its seven-step clean audit history remains unchanged. A
separate exact child-ticket record accepts three control losses for T01 only:

1. Devin authorizes work Devin will implement.
2. No distinct escalation human is available.
3. Independent human security verification is `NOT_AVAILABLE`, never `PASS`.

The combined loss is classified `MEDIUM / ACCEPTED RISK` only while every pure,
provider-offline T01 boundary below holds. Before the solo amendment exists, the current
state remains `BLOCKER / NOT AUTHORIZED`.

## Considered approaches

### Chosen: single-ticket solo exception

Authorize T01 for fourteen days, bind six exact files and one exact effect, retain global
deny-by-default state, and require deterministic and model-advisory evidence. Stop after
T01; T02 needs a new owner decision and authorization.

This is the smallest slice that creates forward motion without giving a solo actor broad
operating-environment authority.

### Rejected: broad solo authorization for T01 through T08

This would combine authoring, authorization, provider policy, budget, data protection,
evaluation, and closure authority across the entire slice. Its blast radius is not
justified by the immediate goal of starting the contract kernel.

### Rejected for present availability: retain full human separation

The frozen team proposal remains the preferred future operating model, but it cannot make
T01 ready while Devin is the only participating human.

## Authority architecture

### Registry remains globally closed

`docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json`
advances to registry schema version 2 while keeping:

- `globalImplementationAuthorized: false`;
- the existing `OBX-AUTH-ATF-001` record semantically unchanged; and
- an exact allowlist containing only `OBX-AUTH-ATF-001` and
  `OBX-AUTH-P180-T01-SOLO-001`.

Unknown authorization IDs, record kinds, fields, paths, effects, or ticket coverage fail
closed. The parent `OBX-P180` ticket remains `proposed`; the child authorization cannot
promote it or satisfy any parent dependency, assignment, or evaluation.

### Solo record

The new discriminated record has these fixed meanings:

```text
recordId: "OBX-AUTH-P180-T01-SOLO-001"
recordKind: "owner-solo-child-ticket-exception"
status: "authorized-with-solo-exception"
implementationAuthorized: true
projectId: "one-box"
branch: "research/la-appointment-field-study"
parentTicketId: "OBX-P180"
childTicketId: "OBX-P180-T01"
authorizationProposalId: "OBX-AUTH-P180-OFFLINE-V1"
ownerActorId: "person:devin-wiggins"
riskOwnerActorId: "person:devin-wiggins"
implementationActorId: "person:devin-wiggins"
escalationActorId: null
escalationStatus: "not-available-solo-owner"
independentHumanReview.status: "not-available"
independentHumanReview.satisfied: false
acceptedRisk.severity: "MEDIUM"
acceptedRisk.reasonCode: "SOLO_OWNER_SEPARATION_UNAVAILABLE"
recordedAt: execution-time RFC3339 instant
expiresAt: exactly 14 days after recordedAt
renewable: false
```

`recordedAt` and `expiresAt` are execution values, not discretionary placeholders. The
verifier computes their interval and rejects a non-RFC3339 value, a duration other than
fourteen days, a future `recordedAt`, an expired active record, or any renewal flag.

### Frozen packet binding

The record binds the existing planning closure without editing it:

- closure document:
  `docs/plans/one-box-master/04-operating-environment/obx-p180/07-closure-and-disposition.md`;
- closure SHA-256:
  `ce4bb95623bc4c3eaef29475f7b582e5feec266063da0cfc0753483e00cc8420`;
- source plan:
  `docs/plans/one-box-master/04-operating-environment/obx-p180/06-ownership-tickets-and-authorization-proposal.md`;
- source-plan SHA-256:
  `385e3c046528abe7f9a7307421741386fa0abf032f06e094745833feaa3370af`.

The closure document hash is the `planPacketHash`. Its final bytes contain the manifest
of the fourteen underlying packet/evaluator artifacts, so this definition removes the
earlier ambiguity between hashing the table and hashing the closure document. The record
also stores both paths and algorithms; hash or path drift invalidates authorization.

### Exact traceability

The record binds:

- planning contract requirements `P180-R014`, `P180-R015`, and `P180-R016`;
- parent traceability requirements `EOS-006` and `EOS-012`; and
- parent evaluation references `PROG-EVAL-COST-001` and
  `PROG-EVAL-SEC-AGENT-001`.

The parent references are traceability only. They remain planned and cannot be presented
as completed T01 evidence. T01 acceptance comes only from the focused contract-kernel
tests and gates defined below.

## Exact T01 capability boundary

The only allowed effect is:

```text
add-pure-closed-contract-types-and-validators
```

The only writable paths are:

```text
src/lib/operatingEnvironment/canonical.ts
src/lib/operatingEnvironment/canonical.test.ts
src/lib/operatingEnvironment/contracts.ts
src/lib/operatingEnvironment/contracts.test.ts
src/lib/operatingEnvironment/reasonCodes.ts
src/lib/operatingEnvironment/reasonCodes.test.ts
```

All other paths and effects are denied. T01 code may perform deterministic computation
only. It may not read the environment, clock, randomness, filesystem, browser, network,
credentials, providers, persistence, queues, background workers, product runtime, mutable
global state, or frozen Canvas/Page IR surfaces. It may not change dependencies,
lockfiles, exports to external systems, UI, collaboration, deployment, release behavior,
or program authority outside the two exact registry records.

## Governance amendment record

The ordinary risk-exception policy treats authorization controls as non-waivable. This
solo record therefore cannot masquerade as an ordinary waiver. The implementation adds
one exact owner-governance amendment at:

```text
docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json
```

The amendment records `standardWaiverEligible: false`, Devin's owner direction, the three
lost separations, the bounded T01 scope, evidence requirements, compensating controls,
fourteen-day expiry, and `renewable: false`. The risk-exception index identifies this one
active owner amendment without weakening the default rule for any other authorization,
ticket, branch, project, or actor.

The authority verifier parses and hashes the amendment. Missing, malformed, broadened,
expired, or hash-drifted amendment evidence invalidates the authorization.

## Verifier design

`scripts/verify-plan-authority.mjs` uses discriminated, per-ID validators:

1. the existing ATF validator retains its behavior;
2. a new exact solo-T01 validator accepts only the record described here; and
3. the registry rejects every ID outside the two-record allowlist.

The solo validator reuses existing traversal, glob, and broad-path rejection. It also
checks the exact child ticket, proposal, requirements, parent traceability references,
six paths, single effect, owner identity, packet/source hashes, amendment hash, timestamps,
fourteen-day duration, non-renewability, forbidden effects, and truthful unavailable-review
state. It rejects T02 through T08, any claimed independent PASS, and any change to the
parent ticket's proposed state.

`scripts/verify-plan-authority.node.mjs` preserves the foundation tests and adds positive
and negative tests for the solo record. Tests must prove rejection of unknown IDs/keys,
missing or invalid timestamps, duration drift, expiry, renewal, T02+ coverage, path/effect
broadening, false independent-review claims, amendment absence/drift, packet/source drift,
forbidden capabilities, and parent-ticket promotion.

Only after final bytes settle may
`docs/plans/one-box-master/00-authority/authority-manifest.json.packetDigest` be refreshed.

## Security review and evidence

The authorization change is reviewed as an authorization-sensitive surface. The formal
security report must contain exactly one evidenced row for prompt injection, secrets,
authentication, authorization, untrusted input, and export. Authorization and secrets are
reviewed; other surfaces may be `NOT-APPLICABLE` only with changed-path evidence.

The accepted separation finding is `MEDIUM`, owned by Devin, with these compensating
controls:

- T01-only scope and exact fourteen-day expiry;
- exact paths/effect with deny-unlisted behavior;
- deterministic pure computation and no I/O;
- focused unit/property tests for unknown fields, closed enums, canonical hashes,
  malformed records, extra fields, and integer overflow;
- typecheck, focused lint, plan tests, plan verification, changed-range secret scan,
  import/source-scope census, and diff check;
- mandatory independent advisory Grok review for each goal task;
- final exact `x-ai/grok-4.6` and exact `claude-fable-5` authorization audits; and
- a frozen checkpoint before T01 is considered ready.

Model reviews remain advisory. They do not change independent human review from
`NOT_AVAILABLE` to PASS.

If formal security review classifies the separation loss as BLOCKER/HIGH or discovers any
other unresolved BLOCKER/HIGH/MEDIUM finding, activation stops. This design does not permit
the owner to downgrade a finding merely to make the verifier pass.

## Failure and invalidation

The record fails closed or immediately expires on:

- any path or effect outside the exact T01 allowlist;
- branch, packet, source-plan, governance-amendment, or authorization-record hash drift;
- expiry, revocation, renewal, or timestamp invalidity;
- dependency or lockfile change;
- product-runtime, I/O, provider, network, credential, environment, persistence, UI,
  collaboration, Page IR, Canvas, deployment, or release import/effect;
- any failed test, typecheck, lint, plan, secret, import-census, or diff gate;
- any unresolved BLOCKER/HIGH/MEDIUM finding other than the explicitly accepted solo
  separation risk; or
- any claim of independent review, parent completion, T02 authority, production readiness,
  or broader operating-environment authorization.

Failure leaves the registry globally unauthorized and T01 not ready. No automatic fallback
or scope expansion is permitted.

## File map

The authorization-activation implementation may modify only these planning/governance
surfaces:

- `docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json`
- `docs/plans/one-box-master/00-authority/authority-manifest.json`
- `docs/governance/risk-exceptions/README.md`
- `docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json`
- `scripts/verify-plan-authority.mjs`
- `scripts/verify-plan-authority.node.mjs`
- authorization/security/model-audit proof artifacts under `docs/audits/`

It does not create or modify any of the six T01 implementation files. Those begin only
after this goal completes and a new implementation run starts from the accepted record.

## Success criteria

The solo-authorization goal is complete only when all of the following are mechanically
proven:

1. The frozen seven-step packet and its final hashes are unchanged.
2. The registry contains exactly the unchanged ATF record and the exact solo-T01 record;
   global authorization remains false.
3. The solo record binds Devin, T01, the six paths, one effect, exact packet/source hashes,
   exact traceability, a fourteen-day non-renewable lifetime, and truthful unavailable
   independent review.
4. The owner-governance amendment is parsed, hash-bound, exact-scope, and active; the
   default non-waivable rule remains unchanged for every other case.
5. The parent `OBX-P180` ticket remains proposed; T02 through T08 remain unauthorized.
6. Positive authority verification passes and negative tests reject every documented drift
   or broadening case.
7. Plan tests, plan verification, typecheck, focused lint, diff check, changed-range secret
   scan, and source-scope/import census pass on captured proof.
8. The formal security report validates and returns `PASS-WITH-ACCEPTED-RISK` with exactly
   the one MEDIUM solo-separation finding; any stronger or additional material finding
   stops activation.
9. Mandatory goal-task Grok audits are clean, and final exact Grok 4.6 and Fable 5 audits
   report no unresolved BLOCKER/HIGH/MEDIUM finding beyond the explicitly accepted solo
   separation risk.
10. A checkpoint binds the final record and proof; the terminal state is
    `OBX-P180-T01 READY UNDER SOLO EXCEPTION / INDEPENDENT HUMAN REVIEW NOT AVAILABLE /
    T02 NOT AUTHORIZED`.

