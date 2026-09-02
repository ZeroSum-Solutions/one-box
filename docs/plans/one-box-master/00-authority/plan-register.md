# Authority and plan register

The machine-readable source for this table is
[`authority-manifest.json`](authority-manifest.json). Run `npm run verify:plans`
after changing any authority, plan status, ticket/eval mapping, or adoption
decision.

The closed-form disposition of the previous technology audit findings is in
[`2026-08-29-mpa-reconciliation.md`](2026-08-29-mpa-reconciliation.md).

## Precedence by product domain

| Domain | Current authority | Status and boundary |
|---|---|---|
| Website source and candidate production | [`2026-08-22-page-ir-safe-pipeline-prd.md`](../../../specs/2026-08-22-page-ir-safe-pipeline-prd.md) | Owner-approved. Page IR or the closed template path owns source, compilation, gates, and atomic promotion. |
| Canvas interaction | [`2026-08-16-canvas-upgrade.md`](../../../specs/2026-08-16-canvas-upgrade.md) | Owner-approved for selection, hierarchy, scoped chat, preview, diff, history, and workbench UX. Page IR supersedes its older mutation assumptions. |
| Cross-system website lifecycle | [`2026-08-27-canvas-to-agency-shipping-design.md`](../../../superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md) | Owner-approved direction; written-spec review and implementation authorization remain separate. |
| Program order | [`2026-08-27-canvas-to-agency-shipping-roadmap.md`](../../../superpowers/plans/2026-08-27-canvas-to-agency-shipping-roadmap.md) | Approved architecture sequence. Each execution plan requires its own authorization. |
| Appointment acquisition | [`2026-08-27-appointment-acquisition-v1-prd.md`](../../../specs/2026-08-27-appointment-acquisition-v1-prd.md) | Architecture approved. Implementation remains unauthorized. |
| Senior-engineering workflow | [`2026-08-29-engineering-operating-system-and-gap-register.md`](2026-08-29-engineering-operating-system-and-gap-register.md) | Proposed governance baseline; exact Grok audit passed, but owner acceptance and repository-control activation are separate. |
| Narrow Release 1 and re-delivery | [`release-1-contract.md`](../01-foundation/release-1-contract.md) | Proposed planning contract. Implementation and provider selection remain unauthorized. |
| Release 1 compatibility | [`release-1-compatibility-matrix.md`](../01-foundation/release-1-compatibility-matrix.md) | Proposed support/capability matrix. Baseline and owner selections remain tickets. |
| Target topology | [`ADR 0002`](../../../adr/0002-target-desktop-cloud-topology.md) | Proposed. ADR 0001 remains the current executable topology until acceptance and migration. |
| Full-product security | [`program threat model`](../../../security/2026-08-29-program-threat-model.md) | Proposed planning baseline. It does not claim the controls exist. |
| Program evaluation | [`evaluation strategy`](../../../eval/one-box-program/evaluation-strategy.md) | Proposed planning baseline; existing Page IR evals remain current for their scope. |
| Supply chain | [`supply-chain policy`](../../../security/supply-chain-policy.md) | Proposed policy plus adoption ledger; new executable use remains gated. |
| Program backlog | [`program ticket manifest`](../../../tickets/one-box-program/manifest.json) | Proposed/blocked planning tickets. None authorizes product implementation. |
| Team, agents, skills, browser, and desktop shell | [`2026-08-29-canvas-operating-environment-design.md`](../../../superpowers/specs/2026-08-29-canvas-operating-environment-design.md) and [`ai-teammate-operating-model.md`](../04-operating-environment/ai-teammate-operating-model.md) | The wider architecture remains draft. [`OBX-AUTH-ATF-001`](scoped-implementation-authorizations.json) separately authorizes only the native static roster, read/propose contracts and executor/receipts, and minimal local Canvas/API foundation in its closed path/effect boundary. It does not make `OBX-P180`, `OBX-P310`, E0-E8, a runtime/provider, deployment, or release ready. |
| Embedded browser | [`2026-08-29-embedded-browser-integration.md`](../../2026-08-29-embedded-browser-integration.md) | Source-audited plan. Grok 4.6 returned `REJECT`; no retained implementation may start yet. |
| External technology and model adoption | [`technology-adoption-roadmap.md`](../06-technology/technology-adoption-roadmap.md) | Research synthesis and phase map. Deep Agents JavaScript was separately evaluated and is `adapt-patterns-only`; it does not inherit the Python row or enter the application runtime. This authorizes no dependency or implementation; every retained item inherits its domain gate. |

## Supporting and historical plans

| Document | How to use it now |
|---|---|
| [`2026-08-13-refero-editor-requirements.md`](../../../specs/2026-08-13-refero-editor-requirements.md) | Retain unsuperseded editor, evidence, motion, accessibility, and benchmark requirements. Ignore older multi-target production assumptions. |
| [`2026-08-17-workspace-tabs-reference-capture.md`](../../../specs/2026-08-17-workspace-tabs-reference-capture.md) | Draft evidence only. Its untrusted-content findings remain useful; the newer browser plan owns the browser direction after correction. |
| [`2026-08-16-prompt-driven-engine-decisions.md`](../../2026-08-16-prompt-driven-engine-decisions.md) | Retain the Page IR, quality-instrument, motion-default, and corpus decisions. Reopen the runtime library because the GSAP license changed the risk. |
| [`2026-08-27-release-lifecycle-foundation.md`](../../../superpowers/plans/2026-08-27-release-lifecycle-foundation.md) | P1 execution plan. No `SiteLifecycleV1` implementation exists in the inspected checkout. |
| [`2026-08-12-one-box-prototype.md`](../../2026-08-12-one-box-prototype.md) | Historical product and architecture rationale. Newer Page IR and lifecycle contracts supersede conflicting runtime detail. |
| [`2026-08-13-refero-editor-evidence-workspace.md`](../../2026-08-13-refero-editor-evidence-workspace.md) | Branch-specific implementation record and retained evidence-workspace requirements. |
| [`2026-08-15-refero-selection-editor-agent.md`](../../2026-08-15-refero-selection-editor-agent.md) | Proposal and experiment record. Agent output remains advice until typed apply and gates. |
| [`2026-08-16-ui-ux-overhaul-linear.md`](../../2026-08-16-ui-ux-overhaul-linear.md) | Historical approved visual direction and branch work record. `DESIGN.md` remains the design contract. |

## Conflict rule

Domain ownership beats document recency. When two documents disagree, fail closed and use the authority named above. A proposed packet, draft, research note, rejected plan, historical artifact, or model audit cannot overrule an approved production contract or authorize implementation.
