# ONE BOX program ticket system

This backlog makes the full intake-to-re-delivery plan traceable without turning planning artifacts into implementation authorization. Existing Page IR tickets remain the accepted detailed source/candidate backlog; these `OBX-P###` tickets own program governance and future phase definition.

## Status flow

```text
proposed -> in-review [reviewStage=planning] -> ready -> in-progress
         -> in-review [reviewStage=implementation] -> verified -> done
         \-> blocked
```

`status` records lifecycle state; `reviewStage` distinguishes the planning review
from the later implementation review. It is `planning` or `implementation` only
while status is `in-review`, and otherwise is null. The six current in-review
tickets are in planning review.

Only the named accountable owner moves a planning contract to `ready` after its
authority, threat, evaluation, dependency, and model-review packet is complete.
The manifest's `humanAssignments` collection is currently empty and explicitly
blocking: a role label is not a person, and no ticket can become ready or later
until active `OwnerAssignmentV1` records identify the accountable owner and every
required non-author verifier. Implementation still requires separate
authorization. A model verdict never changes status.

## Machine-readable contracts

The backlog manifest declares schema version `2`, backlog version `2.0.0`,
planning status, no implementation authorization, its README and evaluation-
manifest paths, required ticket sections, review stage, relative size, and the
unassigned human-identity blocker. The
[ticket-body contract](ticket-body-contract.json) declares the required YAML
fields and headings. The [requirement vocabulary](requirement-vocabulary.json)
enumerates every exact requirement/scope ID; ranges, prose aliases, missing
requirement arrays, and missing evaluation arrays are invalid.

The plan verifier enforces the declared schema and path fields, required ticket
sections, exact requirement vocabulary, and local references across `README.md`,
`AGENTS.md`, `CONTRIBUTING.md`, `.github/`, `docs/governance/`,
`docs/tickets/one-box-program/`, and `docs/plans/one-box-master/` in local runs
and CI. Those repository checks do not prove that remote branch-review settings
or named-human approvals are enforced. The
[risk-exception registry](../../governance/risk-exceptions/README.md) exists but
contains no active exception.

## Definition of Ready

A ticket is ready only when it has stable identity, a named accountable owner,
priority, reviewed relative size, dependencies, exact requirement IDs, evals,
bounded outcome, non-goals, a test-first oracle, security/data/license/telemetry
impact, migration/rollback where applicable, documentation targets, one exact
Grok 4.6 packet review or an owner-authorized labeled fallback review under the
[reviewer-role matrix](../../governance/reviewer-roles.md), no unaccepted P0/P1,
and the required human acceptance. `M`, `L`, and `XL` are relative complexity
sizes for decomposition, not duration estimates or delivery commitments; they
must be reviewed when the accountable owner is assigned. Provider, paid, live,
invitation, schema, deployment, and appointment effects remain separately
authorized.

## Definition of Done

Done requires current implementation and documentation, all linked blocking
evals PASS, CI and relevant scheduled/release evidence, no unresolved P0/P1, a
recorded non-author verifier where required, exact candidate/diff receipts,
accepted rollback, the accountable owner's decision, approver identity, and
decision date. Written plans, self-report, and model review alone are not done.

## Boundaries

- `docs/tickets/page-ir-safe-pipeline/` remains the detailed accepted Page IR backlog.
- `OBX-P100` through `OBX-P195` close program readiness gaps.
- `OBX-P200` through `OBX-P270` define P1 through P8.
- `OBX-P300` defines A4 after its motion and usability gates.
- `OBX-P310` through `OBX-P360` define draft operating-environment slices only after their gates.
- `OBX-P370` keeps appointment work independent. Its dependency on `OBX-P195`
  consumes only the accepted appointment-independence guarantee; provider
  selection and the P6 provider outcome are not prerequisites or authorities for
  appointment planning.
- GitHub Issues/Projects may mirror these files only after authorized remote writes; the repository IDs remain durable.
