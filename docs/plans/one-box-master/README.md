# ONE BOX master plan library

This directory is the front door for the full ONE BOX plan corpus. It organizes the existing product contracts without copying or silently rewriting them. Canonical documents remain at their current paths so earlier audit links, requirement IDs, and commit history stay valid.

## Read in this order

1. [Machine-checkable authority manifest](00-authority/authority-manifest.json)
2. [Authority and plan register](00-authority/plan-register.md)
3. [Engineering operating system and gap register](00-authority/2026-08-29-engineering-operating-system-and-gap-register.md)
4. [MPA-001 through MPA-011 reconciliation](00-authority/2026-08-29-mpa-reconciliation.md)
5. [Foundation and Release 1 contract](01-foundation/index.md)
6. [Canvas, generation, and designer workflow](02-canvas/index.md)
7. [Client review, qualification, and shipping](03-shipping/index.md)
8. [Operating environment, team, agent, and browser](04-operating-environment/index.md)
9. [Appointment acquisition](05-acquisition/index.md)
10. [Technology adoption and source catalog](06-technology/index.md)

The [program ticket manifest](../../tickets/one-box-program/manifest.json),
[evaluation strategy](../../eval/one-box-program/evaluation-strategy.md),
[program threat model](../../security/2026-08-29-program-threat-model.md), and
[supply-chain policy](../../security/supply-chain-policy.md) are the planning
control surfaces for closing the remaining readiness gaps.

## Governing rule

ONE BOX remains the base project. Outside repositories may supply a bounded dependency, an interaction pattern, a test oracle, or research evidence. They do not replace the run's immutable `page-ir-v1` or `template-v1` layout authority, candidate identity, guarded mutation path, approval, qualification, release, or appointment authority.

The website production track stays first. Operating-environment work may proceed only where it cannot weaken the website authority chain.

## Current stop conditions

- The embedded-browser plan remains rejected for implementation until EB-001 through EB-021 are resolved, starting with hostile-page isolation.
- GSAP use in visual motion authoring requires written consent or license review before the motion-builder work continues.
- Client invitations, production providers, schema changes, deployment, and appointment activation retain their separate approval gates.
- Draft or historical plans remain evidence. Their age or location does not make them authoritative.
