# ONE BOX authority-packet digest proof

Date: 2026-08-30

Authorization evidence prefix: `2026-08-30-ai-teammate-foundation-`

## Canonical recomputation

Run from the repository root:

```sh
npm run verify:plans
```

Observed result:

```text
Plan authority verification passed: 17 domains, 29 tickets, 21 program evaluations.
Authority packet SHA-256: 1b86107bb20bb4e5e206de725aa6dec048a1acff8a3247b3963a34cae1780da5
```

The verifier creates the preimage in `scripts/verify-plan-authority.mjs`. It
sorts the 84 repository-relative input keys with `localeCompare`, then feeds
each key, a NUL byte, the file bytes, and a second NUL byte to one SHA-256
stream. For the authority manifest input, it parses the JSON, removes only
`packetDigest`, and serializes the remaining object with
`JSON.stringify(value, null, 2)` plus a final newline before hashing. The
manifest's stored digest therefore does not hash itself.

The newline-delimited sorted key census below has SHA-256
`b24233ba313ad4380fe53af6bc40e83fa9cbd8950fd2c4b08282886331a04dc4`.
The verifier source has SHA-256
`e289cc8d895d78f77541c95adbf5fd1905fefd1e4c8c4952200258ef856daf47`.
The final manifest, including its stored digest, has SHA-256
`d640b6a20642670e0352a4eb778ed987de054dfea9669520f7020097be3b0ac2`.

## Sorted digest-input keys

```text
.github/ISSUE_TEMPLATE/feature.yml
.github/pull_request_template.md
.github/workflows/ci.yml
CONTRIBUTING.md
docs/adr/0001-modular-monolith.md
docs/adr/0002-target-desktop-cloud-topology.md
docs/adr/0003-deep-agents-js-job-plane-evaluation.md
docs/architecture/README.md
docs/eval/one-box-program/deepagents-js-spike-results-2026-08-29.json
docs/eval/one-box-program/deepagents-js-spike-results-2026-08-29.md
docs/eval/one-box-program/evaluation-strategy.md
docs/eval/one-box-program/manifest.json
docs/eval/one-box-program/traceability.md
docs/eval/page-ir-safe-pipeline/manifest.json
docs/eval/quarantine/README.md
docs/governance/reviewer-roles.md
docs/governance/risk-exceptions/README.md
docs/plans/2026-08-29-ai-teammate-foundation-v1-implementation.md
docs/plans/2026-08-29-embedded-browser-integration.md
docs/plans/one-box-master/00-authority/2026-08-29-engineering-operating-system-and-gap-register.md
docs/plans/one-box-master/00-authority/2026-08-29-mpa-reconciliation.md
docs/plans/one-box-master/00-authority/authority-manifest.json#without-packetDigest
docs/plans/one-box-master/00-authority/plan-register.md
docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json
docs/plans/one-box-master/01-foundation/release-1-compatibility-matrix.md
docs/plans/one-box-master/01-foundation/release-1-contract.md
docs/plans/one-box-master/02-canvas/index.md
docs/plans/one-box-master/04-operating-environment/ai-teammate-operating-model.md
docs/plans/one-box-master/06-technology/deepagents-js-evaluation-plan.md
docs/plans/one-box-master/06-technology/technology-adoption-roadmap.md
docs/research/source-catalog/adoption-ledger.json
docs/research/source-catalog/deepagents-js-candidate-intake-2026-08-29.md
docs/research/source-catalog/github-starred-one-box-shortlist-2026-08-29.md
docs/research/source-catalog/README.md
docs/security/2026-08-29-embedded-browser-closure-requirements.md
docs/security/2026-08-29-program-threat-model.md
docs/security/local-api-threat-model.md
docs/security/supply-chain-policy.md
docs/specs/2026-08-16-canvas-upgrade.md
docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md
docs/specs/2026-08-27-appointment-acquisition-v1-prd.md
docs/specs/2026-08-29-ai-teammate-foundation-v1.md
docs/superpowers/plans/2026-08-27-canvas-to-agency-shipping-roadmap.md
docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md
docs/superpowers/specs/2026-08-29-canvas-operating-environment-design.md
docs/tickets/ai-teammate-foundation/manifest.json
docs/tickets/ai-teammate-foundation/OBX-AT-001.md
docs/tickets/one-box-program/manifest.json
docs/tickets/one-box-program/OBX-P100.md
docs/tickets/one-box-program/OBX-P110.md
docs/tickets/one-box-program/OBX-P120.md
docs/tickets/one-box-program/OBX-P130.md
docs/tickets/one-box-program/OBX-P140.md
docs/tickets/one-box-program/OBX-P150.md
docs/tickets/one-box-program/OBX-P160.md
docs/tickets/one-box-program/OBX-P170.md
docs/tickets/one-box-program/OBX-P175.md
docs/tickets/one-box-program/OBX-P180.md
docs/tickets/one-box-program/OBX-P185.md
docs/tickets/one-box-program/OBX-P190.md
docs/tickets/one-box-program/OBX-P195.md
docs/tickets/one-box-program/OBX-P200.md
docs/tickets/one-box-program/OBX-P210.md
docs/tickets/one-box-program/OBX-P220.md
docs/tickets/one-box-program/OBX-P230.md
docs/tickets/one-box-program/OBX-P240.md
docs/tickets/one-box-program/OBX-P250.md
docs/tickets/one-box-program/OBX-P260.md
docs/tickets/one-box-program/OBX-P270.md
docs/tickets/one-box-program/OBX-P300.md
docs/tickets/one-box-program/OBX-P310.md
docs/tickets/one-box-program/OBX-P320.md
docs/tickets/one-box-program/OBX-P330.md
docs/tickets/one-box-program/OBX-P340.md
docs/tickets/one-box-program/OBX-P350.md
docs/tickets/one-box-program/OBX-P360.md
docs/tickets/one-box-program/OBX-P370.md
docs/tickets/one-box-program/README.md
docs/tickets/one-box-program/requirement-vocabulary.json
docs/tickets/one-box-program/ticket-body-contract.json
docs/tickets/page-ir-safe-pipeline/manifest.json
package.json
scripts/verify-plan-authority.mjs
scripts/verify-plan-authority.node.mjs
```

The receipt is reproducible rather than authoritative: the canonical verifier
and current repository bytes remain the source of truth, and any target change
requires recomputation and invalidates reviews bound to the prior packet.
