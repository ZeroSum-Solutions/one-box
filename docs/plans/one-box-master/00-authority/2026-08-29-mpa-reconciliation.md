# MPA-001 through MPA-011 reconciliation

- Status: corrected after one Opus 5 OAuth fallback review; no second model pass by owner instruction
- Date: 2026-08-29
- Source finding set: `2026-08-29-one-box-technology-master-plan-audit.md`
- Implementation authorization: none
- Review receipt: `docs/audits/grok-4.6/2026-08-29-mpa-authority-reconciliation-opus-5-fallback-audit.md`
- Reviewed target SHA-256: `3745aa2b1392ef8f55bc66b2c02937e64b1058760a14e1a4aede3c3d5d8c7493` (pre-correction target)

## Closure matrix

| Finding | Resolution | Current evidence | Planning status |
|---|---|---|---|
| MPA-001 retained shell before browser isolation | E0 now means identity/role/sync contracts only. Any retained native/remote-content shell is blocked until a rewritten browser plan closes EB-001 through EB-021, with EB-001 first. | `04-operating-environment/index.md`; operating-environment draft; technology roadmap T3/T4; OBX-P160 | corrected |
| MPA-002 draft promoted into sequence authority | E0 through E8 are labeled draft decomposition. A separately accepted spec, threat/eval packet, plan, tickets, and authorization are required before retained work. | `04-operating-environment/index.md`; authority manifest; OBX-P310–P360 | corrected |
| MPA-003 rejected E4.0–E4.7 copied as a second sequence | The technology roadmap contains no retained E4 slice sequence. A new sequence can be written only from the corrected EB owner/oracle/exit graph after acceptance. | technology roadmap T4; OBX-P160 and OBX-P320 | corrected |
| MPA-004 React/ExperienceModules collide with Page IR | Release 1 and Phase 1 have one static Page IR production source/compiler, with closed template compatibility per-run. General React is not a production target. Modules are post-Phase-1 and need a separate schema/security ADR. | Canvas index; technology roadmap T5; Release 1 contract; OBX-P185/P350 | corrected |
| MPA-005 E6 omits P3 gate | E6 is blocked on accepted P3 review-origin, guest, invitation, candidate-lock, revocation, stale-approval, and exit evidence. Media is transport only. | operating-environment index/draft; technology roadmap T5; OBX-P220/P340 | corrected |
| MPA-006 catalog disposition/phase conflicts | The 18-item shortlist is the sole planning disposition and phase authority. Relevance JSON/report are discovery metadata and use the shortlist's final decisions for named candidates. | source-catalog README, JSON, relevance report, shortlist, adoption matrix | corrected |
| MPA-007 license and adoption conflicts | PostHog and agent-native are `needs-license-review` with no code use. R3F is conditional only inside a later qualified ExperienceModule. The adoption ledger enforces disallowed states. | shortlist, adoption matrix, adoption ledger, supply-chain policy | corrected |
| MPA-008 unreproducible 107-to-18 cut | Six explicit selection criteria now explain the 107-to-18 cut; immediate anchors outside the shortlist are removed. Fontsource and semantica are Learn only and not shortlisted. Census remains 133 total, 107 relevant, 26 unrelated, 18 shortlisted. | source-catalog README, relevance report, shortlist, JSON | corrected |
| MPA-009 A4 motion ignores GSAP/Motion stop | Core deterministic/reduced-motion behavior is separate from visual authoring. Visual motion authoring is blocked on written GSAP scope consent or an accepted Motion evaluate-and-replace plan with a non-GSAP oracle and removal path. | Canvas index A4; technology roadmap T3; adoption ledger; OBX-P175/P300 | corrected |
| MPA-010 Hugging Face runtime/provenance overreach | Every HF row is Research/T1 only. MLX/mlx-vlm are Evaluate only; community conversions need their own reviewed revision/license/hash; WebInfinity is excluded pending page-rights/provenance; E4 mappings remain research fixtures while E4 is blocked. | HF candidate note; adoption ledger SC-HF-001 | corrected |
| MPA-011 audit listed as Canvas authority | The Canvas Grok audit is supporting evidence, not a canonical product source. The authority verifier rejects any `docs/audits` primary path. | Canvas index; authority manifest; `verify-plan-authority.mjs` negative test | corrected |

## Final reconciled technology decisions

- ONE BOX remains the base.
- Every run keeps exactly one immutable `page-ir-v1` or guarded `template-v1`
  authority. It never merges or switches within a run.
- Puck remains a behind-IR interaction experiment; GrapesJS is a learning source;
  Webstudio is rejected; external editors do not own the site document.
- Browser work remains blocked; captures can become provenance-bound reference
  evidence only after the replacement plan is accepted.
- Yjs may later own draft text and presence only.
- Existing GSAP runtime behavior is retained narrowly; visual-authoring expansion
  remains blocked. Motion is an evaluation candidate, not an adopted replacement.
- Tailwind, the existing AI SDK/provider surface, Playwright, and axe retain their
  bounded current roles. Every new executable use follows the adoption ledger.
- Appointments, provider selection, client invitations, deployment, schema changes,
  and retained desktop/browser work keep independent gates.

## Validation contract

`npm run verify:plans` must pass the authority graph, tickets, evaluations, links,
and adoption-ledger invariants. `npm run test:plans` must prove both the passing
tree and the deliberate failure when an audit is promoted to primary authority.
The required Grok 4.6 call timed out at 180 seconds without a result. Per the
owner's standing instruction, one Opus 5 review ran through Claude Max OAuth and
returned `REVISE` with two P1 and eight P2/P3 findings. The P1 findings and the
bounded precision corrections were applied after that reviewed target: rejected
E4 sub-slice labels were removed, and the manifest no longer contains any
domain-level implementation authorization. The remaining corrections added
machine-resolvable relationships, a manifest-level audit-path prohibition,
phase/adoption disclaimers, GSAP containment, evidence receipts, and complete
classification. No second model pass is run because the owner requested one pass
per phase. Mechanical verification and the named owner review control acceptance.
