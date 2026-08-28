# Canvas-to-Agency Shipping Program Roadmap

- **Status:** approved architecture decomposed for implementation planning
- **Design:** `docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md`
- **Implementation authorization:** each plan requires owner approval before execution

## Why this is a plan series

The design joins seven independently reviewable systems. Combining them in one execution plan would hide security, schema, and deployment decisions inside a long task list. Each plan below must produce working, testable software and preserve the current local-first product until its own qualification gate passes.

```text
P1 Lifecycle foundation
        |
        v
P2 Canvas candidate and approval automation
        |
        +-------------------+
        v                   v
P3 Client review       P4 Agency qualification and SEO
        |                   |
        +---------+---------+
                  v
       P5 Release Orchestrator and fake provider
                  |
          provider selection gate
                  |
                  v
       P6 Authorized production provider
                  |
       appointment PRD acceptance gate
                  |
                  v
       P7 Appointment release integration
                  |
                  v
       P8 End-to-end qualification and rollout
```

## P1: Lifecycle foundation

**Plan:** `docs/superpowers/plans/2026-08-27-release-lifecycle-foundation.md`

**Delivers:** closed project-workflow and release-state contracts, pure transition rules, append-only receipts in run state, a local read API, and a read-only Canvas status projection.

**Does not deliver:** client review, automated shipping gates, deployment, or appointment activation.

**Exit gate:** legacy runs still parse; every allowed and forbidden transition has a test; stale revisions produce no write; the existing verification suite remains green.

## P2: Canvas candidate and approval automation

**Depends on:** P1.

**Delivers:** candidate promotion and successful Canvas mutations update lifecycle state, visible or interactive changes invalidate client locks, deterministic non-presentational repairs preserve a lock only when fingerprints match, and Canvas shows the current approval state.

**Required design check before planning:** define the exact visual and interaction fingerprint inputs and fold lifecycle persistence into the existing site-authority to run-state lock order without creating a partially promoted build.

**Exit gate:** injected failures at every promotion and mutation boundary preserve the prior candidate, approval receipt, and lifecycle revision.

## P3: Version-bound client review

**Depends on:** P1 and P2.

**Delivers:** single-use invitation exchange, scoped review session, responsive read-only preview, stable-element comments, request-changes action, client-lock receipt, expiration, revocation, and non-indexable review responses.

**Required design check before planning:** extend the local API threat model for the review origin. The plan may build and test the review domain locally, but public client access remains forbidden until the selected host and authentication boundary pass security review.

**Exit gate:** a review secret cannot access another project or candidate; a stale approval fails; a visible change invalidates the lock; secrets do not enter URLs after exchange, logs, analytics, or artifacts.

## P4: Agency qualification and SEO automation

**Depends on:** P1 and P2. It may run in parallel with P3 after those dependencies pass.

**Delivers:** frozen agency gate catalog, technical SEO source contract and deterministic compiler, full qualification manifest, automatic-repair policy, designer-proposal queue, release blockers, and a qualification view in Canvas.

**Required approval before execution:** this plan changes `PageIRV1` and generated-site schemas. The owner must approve the exact schema diff before code changes begin.

**Exit gate:** the fixed corpus kills every seeded P0 and P1 defect; automatic repairs stay candidate-only; no structured-data fact appears without approved evidence; the complete suite binds the exact release bundle.

## P5: Release Orchestrator and conformance provider

**Depends on:** P1, P3, and P4.

**Delivers:** release-bundle compiler, final human approval receipt, Release Orchestrator, provider-neutral adapter, deterministic in-memory or filesystem conformance provider, deployment receipts, simulated promotion, rollback, and public-origin verification.

**Does not deliver:** a production provider or public deployment.

**Exit gate:** the conformance suite proves upload, verify, promote, fail, retry, rollback, and stale-writer behavior without contacting a provider.

## Production provider selection gate

P6 cannot be planned against an invented provider. The owner selects one provider after reviewing:

- immutable release and atomic-alias capabilities;
- custom-domain and DNS behavior;
- cache and header control;
- preview isolation;
- rollback and status semantics;
- credential scope and audit output;
- cost and operational ownership.

Selection authorizes a provider-specific plan, not deployment.

## P6: Authorized production provider

**Depends on:** P5 and explicit provider selection.

**Delivers:** one provider adapter, vault-backed credential loading, custom-domain workflow, production preview, public-origin probe, rollback drills, and provider-specific runbook.

**Exit gate:** an authorized production-like environment passes the P5 conformance suite and failure drills. No client domain becomes public during qualification.

## Appointment PRD acceptance gate

P7 cannot begin while the appointment-acquisition PRD has unresolved P0 or P1 findings or lacks owner approval and independent verification. The signed-manifest control-plane contract remains the source of truth.

## P7: Appointment release integration

**Depends on:** P5, the accepted appointment PRD, and its separately approved implementation plan.

**Delivers:** typed acquisition presentation slot, preview-only blocked behavior, site-release to appointment-release binding, post-origin-verification activation, no-CTA deployment, and proof that runtime downshift changes no website bytes.

**Exit gate:** a website rollback cannot restore stale acquisition; an appointment failure cannot strengthen a handoff; blocked acquisition does not block an otherwise valid website deployment.

## P8: End-to-end qualification and rollout

**Depends on:** P1 through P7.

**Delivers:** fixed evaluation corpus, full lifecycle harness, operator drills, independent verification packet, controlled rollout manifest, and current documentation.

**Exit gate:** every success criterion in the approved design has current evidence, every seeded P0 and P1 is detected or causes its required runtime action, and the owner approves rollout separately from implementation completion.

## Program-wide stop rules

- A plan cannot claim a later plan's capability.
- A green unit suite cannot replace the plan's integration and failure evidence.
- Missing provider, client, domain, authentication, or appointment evidence pauses the affected plan without weakening its gate.
- No plan authorizes external deployment, client invitations, credentials, schema changes, or appointment activation unless its own boundary says so and the owner supplies that approval.
- Existing appointment PRD and audit changes in this worktree remain separate from these plan artifacts.
