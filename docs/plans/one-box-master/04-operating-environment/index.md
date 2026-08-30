# Operating environment, team, agents, and browser

## Planning inputs

- [Canvas operating environment draft](../../../superpowers/specs/2026-08-29-canvas-operating-environment-design.md) — product and architecture draft, not implementation authority.
- [AI teammate operating model](ai-teammate-operating-model.md) — persistent visible teammate identities with bounded, receipted assignments and human authority.
- [ADR 0003: Deep Agents JavaScript job-plane evaluation](../../../adr/0003-deep-agents-js-job-plane-evaluation.md) — proposed research decision; no application runtime adoption.
- [Embedded-browser integration plan](../../2026-08-29-embedded-browser-integration.md) — rejected planning input that must be rewritten; its sequence is not authoritative.
- [Embedded-browser source audit](../../../research/2026-08-29-embedded-browser-source-audit.md) — supporting research evidence.

## Supporting review evidence

- [Grok 4.6 embedded-browser audit](../../../audits/grok-4.6/2026-08-29-embedded-browser-plan-audit.md) — adversarial review evidence, not product authority.

## Draft decomposition, not an implementation sequence

- E0: identity, role, membership, and sync contracts only; it does not include a desktop shell.
- E1: Agent Studio, model registry, effort filtering, context bundles, and receipts.
- E2: skills, PRD workspace, decisions, tasks, and schedules.
- E3: comments, presence, optional cursors, activity, and ordered mutation conflicts.
- E4: reserved for an embedded-browser decomposition rewritten from first principles. No E4 sequence is authoritative until the replacement plan closes EB-001 through EB-021 with an owner, threat, deterministic oracle, fixture, exit gate, and retained-code boundary for every finding.
- E5: governed reconstruction, contingent on the accepted E4 boundary and static Page IR translation.
- E6: client video and screen-share transport only after P3 exit criteria pass, including the review-origin threat model, scoped session, invitation, candidate lock, revocation, and stale-approval gates. LiveKit or another media layer cannot create review, lock, invitation, or approval authority.
- E7: post-Phase-1 Stack Intelligence research and separately approved React/`ExperienceModule` work; Phase 1 production remains deterministic static Page IR only.
- E8: distribution and update research; retained Apple-silicon packaging or updater work remains blocked with the native shell.

E0 through E8 are labels in a draft expansion decomposition, not accepted phases, tickets, dependencies, or permission to retain code. A separately accepted operating-environment specification and implementation plan are required before retained E0 through E3 work. Reports, contracts, and disposable out-of-tree spikes may inform that decision, but they create no candidate or release authority.

The roster may preserve stable role names, briefs, and handoff history. Persistence never means an always-running process, inherited tools, standing budget, project authority, or human approval. The Deep Agents JavaScript candidate is evaluated only as a bounded job-plane option and cannot become E1 authority.

No retained Electron or other native shell, remote-content host, browser profile, CDP adapter, capture bridge, packaging integration, or updater may begin until the rewritten browser plan closes EB-001 through EB-021 and passes its required human and independent review gates. Browser profiles, cookies, storage, and private history remain local-only requirements for any later authorized implementation.
