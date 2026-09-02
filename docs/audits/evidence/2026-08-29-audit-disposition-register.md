# ONE BOX audit disposition register

- Date: 2026-08-29
- Scope: planning audits through the current remediation pass
- Current authority packet: `d16f385aff91cc56c2c73c636f8396b2d467ebb8c9238222ed9b1d282a2e21fe`
- Implementation authorization: none

## Direct answer

Earlier audit findings were not handled uniformly. Some were corrected and re-audited immediately; some were corrected once without a second pass; and two important groups were deliberately preserved as open findings in notes rather than repaired: the final Appointment Acquisition v7 findings and the embedded-browser REJECT findings. This remediation pass corrected those plan defects and records the remaining implementation/human gates separately so they cannot be mistaken for forgotten audit work.

## History and current disposition

| Audit family | Historical treatment | Current disposition |
|---|---|---|
| Canvas master-plan reconciliation | Grok returned `PROCEED_WITH_CONDITIONS`; conditions were incorporated across the master authority, lifecycle, and phase plans rather than closed in the audit file itself | Reconciled into the current authority packet; proposed domains and implementation gates remain intentionally unaccepted/unimplemented |
| Engineering operating system | Initial exact Grok verdict `REVISE` | Corrected and exact-Grok re-audited twice; v2 and v3 are `PASS` review input |
| Technology master plan / MPA-001–MPA-011 | Exact Grok verdict `REVISE` | Findings were reconciled into the authority graph, technology roadmap, ledger, and phase boundaries; later fallback and GLM reviews supplied further corrections |
| Six planning packets audited through the owner-authorized Opus 5 OAuth fallback | Each returned `REVISE`; findings were applied once, but the corrected bytes were not sent through an immediate second pass | The consolidated corrected packet later received the GLM 5.3 Flash audit; its validated findings were repaired, and the exact Grok 4.6 cross-check is now `CLEAN` |
| GLM 5.3 Flash full planning packet | `REVISE`: 11 findings, of which 8 were confirmed, 2 partially confirmed, and 1 not substantiated | Release/model policy, graph coverage/cycle, EB digest, client-review hosting, durable identity, CI timing/pins, trace validation, and conditional provider language corrected; exact Grok cross-check `CLEAN` |
| Appointment Acquisition cross-section v2–v6 | Each `REVISE` result drove another correction pass | Superseded by later audited hashes |
| Appointment Acquisition v7 | Eight P1 findings were left open in the restart handoff; the PRD bytes remained unchanged until this pass | All eight corrected. First exact Grok correction audit found one residual post-deadline no-write edge; it was corrected. Exact Grok re-audit v2 is `CLEAN` |
| Embedded-browser plan | Exact Grok verdict `REJECT`; the plan itself was not changed. EB-001–EB-021 were transcribed into an all-OPEN closure register | Plan rewritten with every control/oracle and a security-first retained-code stop. Exact Grok found missing explicit assignment state; machine-readable `unassigned-blocking` roles were added. Exact Grok re-audit v2 is `CLEAN` for planning coverage |

## Current exact-model receipts

- Appointment initial correction audit: `docs/audits/grok-4.6/2026-08-29-appointment-acquisition-v1-corrections-audit.json` — exact `x-ai/grok-4.6`, one MEDIUM finding.
- Appointment re-audit: `docs/audits/grok-4.6/2026-08-29-appointment-acquisition-v1-corrections-reaudit-v2.json` — exact `x-ai/grok-4.6`, `CLEAN`, zero findings.
- Embedded-browser correction audit: `docs/audits/grok-4.6/2026-08-29-embedded-browser-plan-corrections-audit.json` — exact `x-ai/grok-4.6`, one HIGH assignment-gate finding.
- Embedded-browser re-audit: `docs/audits/grok-4.6/2026-08-29-embedded-browser-plan-corrections-reaudit-v2.json` — exact `x-ai/grok-4.6`, `CLEAN`, zero findings.
- Consolidated GLM-remediation cross-check: `docs/audits/grok-4.6/2026-08-29-glm-remediation-grok-crosscheck.json` — exact `x-ai/grok-4.6`, `CLEAN`, zero findings.

The first high-effort appointment correction attempt and first medium-effort browser correction attempt timed out at the fixed five-minute transport boundary and returned no verdict. Successful exact-model retries are preserved separately; no timeout is represented as a pass.

## What remains open by design

The planning findings above are corrected on current bytes, but ONE BOX is not implementation-ready. The following are gates, not silently ignored findings:

- proposed authorities still require named-human acceptance;
- `humanAssignments.status` remains `unassigned-blocking`; no teammate identity or independent security verifier was invented;
- EB-001 through EB-021 remain OPEN until fixed fixtures, current packaged evidence, named owners, and a non-author verifier exist;
- topology/provider/service/license/schema/repository-settings/deployment/invitation/appointment activation remain separately authorized;
- CI action commits are immutable, but the human license/runner/provenance qualification remains release-blocking;
- no commit or push has been made.

Raw request/response payloads were moved, not deleted, to the owner-only backup described in `docs/audits/grok-4.6/RAW-PAYLOAD-LOCATION.md`.
