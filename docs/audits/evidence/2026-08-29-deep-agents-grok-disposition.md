# Deep Agents teammate Grok 4.6 finding disposition

- Date: 2026-08-29
- Reviewer: exact `x-ai/grok-4.6`, `xhigh`
- First audit: `docs/audits/grok-4.6/2026-08-29-deep-agents-teammate-final-audit.json`
- First verdict: `FINDINGS` (12)
- Corrections re-audit: `docs/audits/grok-4.6/2026-08-29-deep-agents-teammate-corrections-reaudit.json`
- Corrections verdict: `CLEAN` (0 findings)
- Authority: advisory review input only; no implementation authorization

## Disposition

| # | Severity | Disposition | Correction and evidence |
|---|---|---|---|
| 1 | HIGH | fixed | The teammate operating model now requires every child tool, filesystem grant, data class, and effect to be a subset of its parent, defines effective grants as the parent-child intersection, and fails construction before model execution on expansion. External spike T2 now rejects both child-only tools and child-only filesystem grants. |
| 2 | HIGH | fixed | Missing or `null` parent/child arrays are construction errors. Only an explicitly written `[]` means no grant. The run contract and tool boundary now state one rule. |
| 3 | HIGH | fixed | The normalized receipt now binds every T1-T11 result to an environment reference and hashed raw evidence pointers. External evidence is committed at `00922f29e0f2ed6f59e6016be9e26f2ef95e56ef` with manifest SHA-256 `aab5f21a6a868cd2aa30e13ea1475244c7abe43bc6301cfe95469eeecd53edcd`. Grok review and independent verification remain separate review inputs rather than part of the test oracle. |
| 4 | HIGH | fixed | T4 now states the exact boundary: the retained virtual `StateBackend` exposes no OS symlink class, and the source census rejects real-filesystem/shell backends. The plan requires a real symlink probe if any future OS-backed backend is evaluated. |
| 5 | MEDIUM | fixed | The roster contract adds `failed`, `cancelled`, `rejected`, and `budget-exhausted`, each with a typed terminal receipt, partial-output hash where present, stopping condition, and retry eligibility. |
| 6 | MEDIUM | fixed | External T6 now rejects tracing-enabled construction before model execution. External T7 now covers token, currency, wall-clock, and delegation-depth stops with partial-result hashes; 15 of 15 deterministic assertions pass. |
| 7 | MEDIUM | fixed | The Canvas operating environment now makes Canvas the pinned default and sole design-mutation surface. Other workspaces are focused adjuncts; Agent Studio's focused planning view cannot apply mutations. |
| 8 | MEDIUM | fixed | ADR 0003 now records `adapt-patterns-only`, explicitly closes the current runtime-candidate path, and requires a new intake/ADR/ledger/authorization to reopen it. |
| 9 | MEDIUM | fixed | The result, ADR, intake, roadmap, and evaluation plan label the controller comparison as architectural-only. They say no material advantage was demonstrated and do not claim comparative performance evidence. |
| 10 | MEDIUM | fixed | Non-human transitions are exhaustively limited to receipt persistence, deterministic-result recording, stop/cancel, and enqueueing an already-authorized bounded job. Human gates remain mandatory for accept/apply/qualify/scope/risk/ticket/release/publish. |
| 11 | LOW | fixed | The screenshot-to-code heading is now `Patterns to adapt` and explicitly preserves ledger `SC-GH-005` as research-only with no retained source, dependency, or generated-file clearance. |
| 12 | LOW | fixed | The interface contract now requires keyboard operation, accessible names/descriptions, visible focus, non-color textual state/error labels, and assistive-technology announcements for interrupt decisions. |

## Recheck gates

- Regenerate the authority packet digest and pass `npm run verify:plans` plus
  `npm run test:plans`.
- Freeze the corrected packet in Git and run one final exact Grok 4.6 audit against
  that immutable commit; preserve both prior verdicts.
- Run independent non-author verification and the final security range scan before
  push.
