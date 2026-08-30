# Canvas, generation, and designer workflow

## Canonical sources

- [Approved Canvas upgrade](../../../specs/2026-08-16-canvas-upgrade.md)
- [Refero editor requirements](../../../specs/2026-08-13-refero-editor-requirements.md)
- [Canvas-to-agency lifecycle](../../../superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md)
- [Page IR safe pipeline](../../../specs/2026-08-22-page-ir-safe-pipeline-prd.md)

## Supporting review evidence

- [Canvas master-plan Grok audit](../../../audits/grok-4.6/2026-08-28-canvas-master-plan-reconciliation-audit.md) — adversarial review evidence, not product authority.

## Retained interaction model

Canvas keeps the Framer-like surface, Webflow-like structural constraints, and proposal-first AI workflow. Deterministic static Page IR is the Phase 1 production document and compiler authority. Every accepted visual or natural-language edit becomes a typed mutation against a known source hash, compiles a private candidate, runs affected gates, and invalidates approval when its visible or interactive result changes. The existing closed `template-v1` compatibility path remains governed by the authority register; it is not a second Phase 1 target and does not gain new Canvas, React, or module capability here.

## Delivery slices

- A4: selection, responsive comparison, assets, hierarchy, history, diff, restore, and quality navigation. Existing deterministic and reduced-motion behavior may remain, but visual motion authoring is blocked until ONE BOX obtains written GSAP consent or accepts a Motion/non-GSAP evaluate-and-replace plan with a deterministic oracle and removal path.
- E5 is a draft operating-environment decomposition label for governed screenshot or recording reconstruction into a `ReconstructionProposal`, followed by Page IR translation. It is not implementation authorization.
- E7 is a draft post-Phase-1 decomposition label. React targets and `ExperienceModule`s require a separate accepted schema/security ADR and implementation plan after Phase 1; a module may add bounded behavior but may not author the site document, bypass static Page IR, or release itself.

Puck, GrapesJS, Onlook, OpenPage, and similar projects remain research and pattern sources unless a later authorized, bounded experiment proves that one can operate entirely behind the typed Page IR boundary.
