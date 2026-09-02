# Foundation and production authority

## Canonical sources

- [Production Page IR and safe candidate pipeline](../../../specs/2026-08-22-page-ir-safe-pipeline-prd.md)
- [Prompt-driven engine decisions](../../2026-08-16-prompt-driven-engine-decisions.md)
- [Release lifecycle foundation implementation plan](../../../superpowers/plans/2026-08-27-release-lifecycle-foundation.md)
- [Architecture baseline](../../../architecture/README.md)
- [Local API threat model](../../../security/local-api-threat-model.md)

## Proposed Release 1 packet

- [Narrow Release 1 and re-delivery contract](release-1-contract.md)
- [Release 1 compatibility matrix](release-1-compatibility-matrix.md)
- [Target topology ADR](../../../adr/0002-target-desktop-cloud-topology.md)
- [Program threat model](../../../security/2026-08-29-program-threat-model.md)

These are planning baselines pending owner acceptance. They do not weaken the
canonical sources above or authorize implementation, provider selection, client
invitations, deployment, or appointment activation.

## Locked foundation

- Website is the only Track A production target.
- One run selects one source authority: `page-ir-v1` or the closed `template-v1` path.
- Models produce proposals and structured inputs. Deterministic code validates, compiles, gates, and promotes.
- Candidate identity, hashes, receipts, last-known-good behavior, and human approvals remain authoritative.
- Outside editor frameworks cannot introduce a second site document model.

## Program position

The foundation corresponds to A0 through A3 and P1 through P2: freeze authority, add the closed lifecycle, preserve Page IR, and connect typed Canvas mutations to candidate and approval state.
