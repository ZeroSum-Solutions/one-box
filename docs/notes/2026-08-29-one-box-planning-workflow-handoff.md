# ONE BOX planning workflow handoff

- Date: 2026-08-29
- Branch: `research/la-appointment-field-study`
- HEAD inspected: `7167a2488a7a0b82f1b5df0fde6b96e1e7b869ef`
- State: audit findings reconciled and locally verified; uncommitted; no product implementation or external activation authorized
- Authority packet: `d16f385aff91cc56c2c73c636f8396b2d467ebb8c9238222ed9b1d282a2e21fe`

## Outcome

The senior-engineering planning system now covers the entire ONE BOX lifecycle:
intake and evidence, source/candidate compilation, the core single-writer Canvas,
designer and agent iteration, client review, qualification, release, deployment,
monitoring, and re-delivery. It also keeps appointment acquisition on an
independent authority path rather than quietly folding it into website release.

The package does not claim that these future systems are implemented. It makes
the authority chain discoverable, narrows Release 1, records a proposed target
topology, models threats and compatibility, defines evaluation and supply-chain
controls, and decomposes future work into traceable tickets with fail-closed
human-assignment gates.

## Remediation update

The current packet supersedes the earlier audit-status narrative below. The
[audit disposition register](../audits/evidence/2026-08-29-audit-disposition-register.md)
records which historical findings were fixed, which were only noted at the time,
and which remaining gates require people or implementation evidence.

- The 11 GLM findings were reconciled; an exact Grok 4.6 cross-check is `CLEAN`.
- The Appointment Acquisition v7 findings were corrected; a first exact Grok
  pass found one residual transient edge, which was fixed; exact re-audit v2 is
  `CLEAN`.
- The rejected embedded-browser plan was rewritten against EB-001 through
  EB-021; a first exact Grok pass found an omitted explicit assignment-state
  gate, which was fixed; exact re-audit v2 is `CLEAN` for planning coverage.
- All EB rows remain OPEN because named owners, a distinct verifier, packaged
  fixtures, and implementation evidence do not yet exist.
- Twenty-three raw request/response payloads were moved recoverably to the
  owner-only backup recorded in
  `docs/audits/grok-4.6/RAW-PAYLOAD-LOCATION.md`.

## Start here

1. Read the canonical [authority manifest](../plans/one-box-master/00-authority/authority-manifest.json).
2. Read the [MPA-001 through MPA-011 reconciliation](../plans/one-box-master/00-authority/2026-08-29-mpa-reconciliation.md).
3. Review the [Release 1 contract](../plans/one-box-master/01-foundation/release-1-contract.md) and [compatibility matrix](../plans/one-box-master/01-foundation/release-1-compatibility-matrix.md).
4. Review [ADR 0002](../adr/0002-target-desktop-cloud-topology.md), the [program threat model](../security/2026-08-29-program-threat-model.md), and the [embedded-browser closure register](../security/2026-08-29-embedded-browser-closure-requirements.md).
5. Review the [evaluation strategy](../eval/one-box-program/evaluation-strategy.md), [supply-chain policy](../security/supply-chain-policy.md), and [program ticket system](../tickets/one-box-program/README.md).
6. Run `npm run verify:plans` and `npm run test:plans` before relying on any packet bytes.

## What is now defined

| Control plane | Result |
|---|---|
| Authority | 17 exact domains with fixed primary paths, explicit classes, boundaries, acceptance records for the five previously owner-approved domains, and implementation authorization false everywhere |
| MPA closure | MPA-001 through MPA-011 reconciled against the authority graph with rejected/stopped work kept subordinate |
| Release 1 | Bounded to intake, evidence, Page IR source/candidate flow, core single-writer Canvas, client receipt, qualification, static release, monitoring, and re-delivery; appointment, live collaboration, embedded browser, and ExperienceModules are excluded |
| Canvas | Preserved as the central human-authoring surface: deterministic Page IR mutation, agent suggestions under the same authority, preview/device inspection, evidence capture, undo/redo, and explicit candidate promotion rather than direct production writes |
| Target topology | Proposed desktop/cloud/client/public boundary with secrets custody, durable drafts, audit events, release/signing ownership, rollback, deletion, RPO/RTO, and appointment separation |
| Browser security | EB-001 through EB-021 each has an owner role, fixture, oracle, gate, and open status; retained browser implementation remains rejected until closure begins with EB-001 |
| Evaluation | 21 program evals across T0 through T5, exact requirement links, fixtures, oracles, evidence classes, prerequisites, invalidation rules, quarantine, and inherited Page IR hash |
| Supply chain | Deny-by-default ledger for packages, source, hosted services, upstream models, actions, assets, skills, plugins, workers, desktop updates, and ExperienceModules; no new future item is cleared for use |
| Tickets | 29 `OBX-P###` ticket bodies with exact requirement and evaluation links, dependencies, owner roles, sizes, bounded outcomes, non-goals, security/data/license/telemetry impact, rollback/removal, and evidence boundaries |
| Team workflow | Reviewer roles, separation of duties, risk exceptions, contribution rules, issue/PR templates, CI entry points, and remote-enforcement caveats |
| Mechanical controls | One verifier, 22 isolated fail-closed tests, expanded digest coverage, JSON/link/path/symlink/dependency/coverage/traceability/governance/CI-pin checks, and CI hooks |

## Historical model-review record

The exact Grok 4.6 lane was attempted for the first packet and timed out after 180
seconds without a review result. Under the user's stated fallback authorization,
the six packets were each audited once through Claude Code's Claude.ai Max OAuth
lane using requested model `claude-opus-5`. The execution envelopes reported
`claude-haiku-4-5-20251001, claude-opus-5`. These are explicitly labeled Opus 5
fallback audits, are not Grok evidence, and have no approval or implementation
authority.

Each audit returned `REVISE`; its findings were applied once to the planning
packet. In order to preserve the requested one-pass limit, the corrected bytes
were not sent through a second model audit. They were instead subjected to the
local structural checks and test suite recorded below.

| Packet | Single-pass review |
|---|---|
| MPA and authority | [Opus 5 fallback audit](../audits/grok-4.6/2026-08-29-mpa-authority-reconciliation-opus-5-fallback-audit.md) |
| Release 1 and compatibility | [Opus 5 fallback audit](../audits/grok-4.6/2026-08-29-release-1-contract-compatibility-opus-5-fallback-audit.md) |
| Target topology and threat model | [Opus 5 fallback audit](../audits/grok-4.6/2026-08-29-target-topology-program-threat-model-opus-5-fallback-audit.md) |
| Evaluation strategy | [Opus 5 fallback audit](../audits/grok-4.6/2026-08-29-program-evaluation-strategy-opus-5-fallback-audit.md) |
| Supply-chain policy and ledger | [Opus 5 fallback audit](../audits/grok-4.6/2026-08-29-supply-chain-policy-ledger-opus-5-fallback-audit.md) |
| Tickets and review workflow | [Opus 5 fallback audit](../audits/grok-4.6/2026-08-29-tickets-review-workflow-controls-opus-5-fallback-audit.md) |

The original exact-Grok request timed out without a verdict. Its raw request was
moved to the restricted archive recorded in
`docs/audits/grok-4.6/RAW-PAYLOAD-LOCATION.md`. The current remediation receipts
are listed in the audit disposition register above.

## Verification

The current [verification receipt](../audits/evidence/2026-08-29-planning-remediation-verification.md) records:

- `npm run verify:plans`: PASS; 17 domains, 29 tickets, 21 program evaluations; packet digest matches.
- `npm run test:plans`: PASS; 22 of 22 control and mutation tests.
- `npm test -- --reporter=dot`: PASS; 1,275 tests passed and 4 skipped across 96 passing and 4 skipped files.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with 0 errors and 6 disclosed existing warnings.
- `npm run build`: PASS with 6 disclosed existing filesystem-tracing warnings.
- `git diff --check` and planning JSON parsing: PASS.

## Deliberately unresolved human gates

No teammate identities were available in the repository. The ticket manifest
therefore records role-level ownership but leaves `humanAssignments.records`
empty and `status: unassigned-blocking`. Do not infer people from geography,
machine names, email addresses, model identities, or team labels. Before any
ticket becomes `ready`, record an active `OwnerAssignmentV1` for its accountable
owner and every required non-author verifier. High-risk work remains blocked if
only one human is available.

The following also require named human decisions or external evidence:

- accept or revise the proposed Release 1, compatibility, topology, threat,
  evaluation, supply-chain, ticket, and workflow authorities;
- record team GitHub identities, configure CODEOWNERS/branch protection, and
  capture an external ruleset receipt;
- complete an exact adoption record before any new package, repository, model,
  service, skill, plugin, asset, worker, desktop runtime, or ExperienceModule is
  used;
- select providers only under a separately accepted selection ticket;
- retain or delete restricted raw audit payloads according to the recorded
  90-day-after-stage-closure review rule; they are already outside the repository.

## Hard boundaries

This task performed planning and workflow setup only. It did not implement the
Canvas, desktop shell, browser, collaboration, client portal, release adapters,
monitoring, or appointment acquisition. It did not alter a production schema,
write to GitHub, select or pay a provider, send invitations, deploy, sign a
desktop build, publish a client site, or activate appointments. No commit or push
was made, and the existing dirty worktree was preserved.

## Resume rule

On restart, treat the manifest and digest as the front door. If
`npm run verify:plans` reports a digest mismatch, stop and inspect the changed
authority bytes before relying on the packet. The next legitimate planning move
is named-human assignment and owner review of the proposed authorities—not
product implementation by implication.
