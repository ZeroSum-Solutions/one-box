# Grok 4.6 audit: ONE BOX engineering operating system and gap register

- **Date:** 2026-08-29
- **Requested model:** `x-ai/grok-4.6`
- **Reported model:** `x-ai/grok-4.6`
- **Provider:** xAI through OpenRouter
- **Effort:** high
- **Verdict:** **REVISE**
- **Implementation authorization:** **NOT_AUTHORIZED**
- **Inputs:** 22 files, supplied with SHA-256 hashes
- **Usage:** 42,125 prompt tokens; 17,646 completion tokens; 59,771 total tokens

## Summary

Grok accepted the substance of the gap register but rejected it as an engineering policy until its own audit gate was corrected. The original text made a model `PASS` certificate-like, had no bounded packet or unavailable-model protocol, could recurse into auditing audits, and lacked a data-classification/retention boundary for external-model payloads. It also required a direct mapping to the existing Page IR tickets, P1–P8 roadmap, draft E0–E8 work, contribution controls, and blocked domain gates.

## Findings and working-team disposition

| ID | Severity | Finding | Disposition in revised target |
|---|---|---|---|
| EOSA-001 | P0 | The Grok gate was unbounded, recursive, and certificate-like. | Accepted. Grok is mandatory review input; humans disposition findings; packets are bounded and hash-first; identical hashes reuse receipts; reported-model mismatch and unavailability fail closed; emergency rollback is narrowly allowed. |
| EOSA-002 | P0 | Raw diffs, receipts, and candidate material created an ungoverned external-model egress and retention path. | Accepted. Added explicit forbidden data, redaction, hash-only binary handling, restricted raw storage, access/retention/deletion, and EOS-005 audit-channel ownership. |
| EOSA-003 | P1 | Live Git/GitHub/runtime observations lacked receipts in the supplied packet and could not justify policy severity or a numeric score. | Accepted. Split versioned evidence from time-specific observations, removed the 58/100 score, and removed live-state claims from gap justifications. |
| EOSA-004 | P1 | S0–S11, P1–P8, A0–A4, E0–E8, section 10, and existing OBX tickets were not mapped. | Accepted. Added the mapping table, Page IR grandfather rule, phase granularity, and the rule that S7–S11 are not current implementation authorization. |
| EOSA-005 | P1 | GSAP/A4, human visual qualification, vendor non-selection, appointment independence, contribution enforcement, audit economics, and blocked test rows were missing or unclear. | Accepted. Added EOS-017 through EOS-019, extended EOS-001/EOS-002/EOS-012, and marked every blocked-domain oracle as planning-only. |
| EOSA-006 | P2 | Overlapping gaps, premature policy precedence, and the unsupported numeric score reduced consistency. | Accepted. Made EOS-010 a child of EOS-002, cross-linked related ownership, kept contributor entrypoints authoritative until EOS-001 closes, and removed the score. |

These are working-team dispositions embodied in a new target hash. They are not an owner acceptance, implementation authorization, or proof that the corrections pass. The corrected target receives a new exact Grok 4.6 audit.

## Accepted strengths

- The gap classes were materially complete and aligned with the existing Page IR and shipping boundaries.
- Website source, candidate, qualification, and release authority remained above agents, browser, collaboration, and appointments.
- The draft correctly withheld implementation authorization.
- The Page IR ticket/eval pattern and P1–P8 stop rules were correctly identified as the delivery model to extend.

## Evidence artifacts

- Request: `docs/audits/grok-4.6/2026-08-29-engineering-operating-system-gap-audit-request.json`
- Raw response: `docs/audits/grok-4.6/2026-08-29-engineering-operating-system-gap-audit-raw-response.json`
- Normalized audit: `docs/audits/grok-4.6/2026-08-29-engineering-operating-system-gap-audit.json`
- Corrected target: `docs/plans/one-box-master/00-authority/2026-08-29-engineering-operating-system-and-gap-register.md`
