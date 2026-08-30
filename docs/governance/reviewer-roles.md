# ONE BOX reviewer roles and approval matrix

- Status: proposed engineering-governance baseline
- Date: 2026-08-29
- Remote repository enforcement: not changed by this planning packet

## Separation of duties

The author supplies implementation and evidence. A technical peer reviews the
diff. An independent verifier executes acceptance against the immutable target.
Named domain owners accept architecture, security/data, design, licensing, and
release decisions where applicable. A packet-declared model audit is mandatory
adversarial review input; packets that name Grok 4.6 attempt that exact model first. Model review is never a human approval, peer review,
independent verification, risk acceptance, or release authorization.

One person may hold multiple owner roles for a small team, but the author cannot
be the only acceptance voice for high-risk work. Non-author verification is
non-waivable for authentication/authorization, tenant isolation, untrusted
browser/file input, secrets/privacy, loss-risk migrations, release/rollback,
appointment authority, and release candidates. Other exceptions use the
[risk-exception registry](risk-exceptions/README.md), expire within fourteen days,
cannot renew without a new independent decision, and must name compensating
evidence and escalation. Otherwise the ticket remains blocked.

Until CODEOWNERS and team identities are configured, the only accepted interim
identity source is an active `OwnerAssignmentV1` record in the authority manifest
or a manifest-linked owner register. The program ticket manifest currently marks
`humanAssignments.status` as `unassigned-blocking` and contains no assignment
records. A role label, model, service account, team name, or inferred identity
does not satisfy named approval.

If only one active maintainer is available, every non-waivable high-risk class
above remains blocked until a second named external or delegated person has an
active assignment and independently verifies the immutable target. The
risk-exception registry cannot waive this rule, and neither an owner-authorized
model fallback nor the sole maintainer's self-review substitutes for that second
human.

## Roles

| Role | Owns | Cannot substitute for |
|---|---|---|
| Product owner | scope, users, outcomes, non-goals, launch decision | technical/security verification |
| Technical peer | code/design-plan review, maintainability, tests | independent acceptance of their own change |
| Independent verifier | spec-to-evidence acceptance on exact target | author implementation or product approval |
| Architecture owner | system boundaries, contracts, ADR acceptance | security/data approval or release |
| Security/data owner | threat, auth, privacy, retention, risk acceptance | product or visual approval |
| Design/visual owner | interaction, accessibility intent, named-human visual quality | mechanical gate results or security approval |
| Evaluation owner | fixture, oracle, threshold, harness and evidence validity | requirement owner or release owner |
| Licensing/supply-chain owner | code/data/model/asset rights and adoption decision | security qualification or product selection |
| Release initiator | environment, credentials, runbook, rollout proposal, rollback proposal, escalation | approving the same production transaction |
| Release approver | independent production decision bound to exact release bytes, evidence, and target | initiating and approving the same transaction |
| Incident owner | severity, containment, communication, recovery and review | permanent risk acceptance |

## Minimum approval matrix

| Change class | Peer | Independent verifier | Required named owner |
|---|---:|---:|---|
| Documentation with no contract change | 1 | risk-based | document/domain owner |
| Product requirement or release contract | 1 | 1 | product owner |
| Architecture, schema, persisted contract, migration | 1 | 1 | architecture owner; security/data owner when data/trust changes |
| Auth, tenant, untrusted input, browser, model tools, secrets, privacy | 1 | 1 | security/data owner |
| Dependency, model, skill, plugin, asset or license | 1 | 1 for executable/high risk | licensing/supply-chain owner |
| Canvas or client-facing UI | 1 | 1 | design/visual owner; accessibility evidence |
| Evaluation oracle or threshold | 1 | 1 | evaluation owner independent of the implementation under test |
| Deployment adapter, domain, production configuration or rollback | 1 | 1 | distinct release initiator and approver |
| Release candidate | 1 | 1 | distinct release initiator and approver plus product/design/security roles required by the packet |
| Appointment activation or authority change | 1 | 1 | appointment product, security/data, and release owners |

## Review packet

Every review identifies ticket and requirement IDs, exact base/head or artifact
hash, authority/source mode, changed trust/data/dependency boundaries, linked evals
and results, current exact-target model-review receipt, migration/compatibility, telemetry, rollout,
rollback/removal, open findings, and explicit decisions requested. Review comments
remain unresolved until the author responds with code/evidence or the relevant
owner records a reasoned disposition.

For a Grok-required packet, the exact Grok 4.6 lane is attempted once. An owner-
authorized fallback after timeout/error is labeled with its actual model, preserves
the failed primary attempt and authorization, and does not impersonate Grok evidence.
An owner-requested supplemental review follows the same labeling rule. Any target-byte
or policy change invalidates every receipt; model review never grants acceptance or
implementation authority.

## Repository control target

The protected `main` branch should require pull requests, the plan-authority and
technical CI checks, resolved conversations, squash merge, and at least one
non-author approval. High-risk owner assignments are enforced by review process
and later CODEOWNERS/team configuration after the team GitHub identities are
recorded. The inspected live ruleset had zero required approving reviews; this
document does not mutate that external setting or pretend it already enforces the
target.
