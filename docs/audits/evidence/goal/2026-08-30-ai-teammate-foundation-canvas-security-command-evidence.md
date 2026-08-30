# Canvas security review command evidence

Captured: 2026-08-30T18:50:00Z
Base: `899b39433c4be242b4b3adcd39f3e6cd53df99c0`
Synthetic target commit: `edaa6c751d99d38c7f04e5421751028ff78b009d`

## CMD-001 — exact changed-path capture

`git diff --name-only 899b39433c4be242b4b3adcd39f3e6cd53df99c0...edaa6c751d99d38c7f04e5421751028ff78b009d`
Outcome: exit 0; 83 paths. The exact ordered list is duplicated in the validated report's `changed_paths` and `captured_diff_paths`.

## CMD-002 — range secrets scan

`gitleaks detect --source . --no-banner --redact --log-opts 899b39433c4be242b4b3adcd39f3e6cd53df99c0..edaa6c751d99d38c7f04e5421751028ff78b009d`
Outcome: exit 0.
Output: `1 commits scanned`.
Output: `scanned ~376758 bytes (376.76 KB)`.
Output: `no leaks found`.

## CMD-003 — changed sensitive-surface tests

`npm test -- --run 'src/app/api/ai-teammates/[id]/route.test.ts' src/components/preview/AiTeammate/AiTeammatePanel.test.tsx src/components/preview/AiTeammate/AgentStudioPanel.test.tsx src/components/preview/AiTeammate/WorkbenchAgentStudio.test.tsx`
Outcome: exit 0; 4 files and 32 tests passed.

## CMD-004 — prohibited-capability import/sink scan

`rg -n 'fetch\\(|node:(?:fs|child_process|net|http|https)|process\\.env|eval\\(|new Function|dangerouslySetInnerHTML|localStorage|sessionStorage|WebSocket|EventSource' src/app/api/ai-teammates src/lib/aiTeammates src/components/preview/AiTeammate || true`
Outcome: exit 0. Production hits are only the two same-origin roster/assignment fetches in LocalAiTeammatePanel; `node:fs` occurs only in static source tests. No provider, environment, shell, raw HTML, storage, socket, or external-export sink appears.

## Manual surface conclusions

Authentication and authorization: the route applies `isLocalApiAuthorized` before params and before consuming the POST body; the assignment schema fixes effects to read/propose and both grant arrays to empty.
Untrusted input: run ID and the strict seven-key assignment are bounded at ingress; the client parses exact response keys and proposal/receipt bindings; selection data remains display-only and absent from the POST.
Prompt injection: no prompt, role/message, retrieval, tool-definition, or model-output reinjection surface is introduced.
Secrets: no credential source or secret-loading path is introduced; the exact synthetic range passed gitleaks.
Export: the only new request path is same-origin `/api/ai-teammates/<runId>`; it performs deterministic process-local work with no third-party destination, telemetry, queue, email, provider, storage, or download.
Audit-only documents and style-only CSS have no runtime authentication, authorization, input, prompt, secret, or export behavior.


## CMD-005 — exact synthetic-target path listing

The exact stdout of `git diff --name-only 899b39433c4be242b4b3adcd39f3e6cd53df99c0...edaa6c751d99d38c7f04e5421751028ff78b009d` was:

- `docs/architecture/README.md`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-authority-packet-digest-proof.md`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-evidence-relocation-receipt.md`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-selection-display-boundary-proof.md`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-t0-baseline-runs.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-t0-scope-baseline.md`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-t3-corrections.md`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-t4-closure-receipt.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-t4-execution-receipt.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-t5-corrections.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-t6-closure-receipt.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-t6a-authority-digest-receipt.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-t6c-collapse-non-retention-receipt.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-t7-historical-chronology-receipt.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-fable-5-corrected-scope-audit.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-fable-5-corrected-scope-disposition.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-fable-5-disposition.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-fable-5-final-audit.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-fable-5-final-clean-audit.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-fable-5-final-closure-audit.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-fable-5-final-closure-disposition.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-fable-5-final-closure-reaudit-disposition.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-fable-5-final-closure-reaudit.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-fable-5-final-disposition.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-fable-5-initial-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t0-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t0-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t0-definitive-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t0-final-reaudit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t0-reaudit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t1-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t1-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t2-disposition-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t2-disposition-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3-implementation-audit-timeout-600000.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3-implementation-audit-timeout.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3a-route-audit-timeout.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3a-route-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3a-route-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3b-local-panel-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3b-local-panel-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3c-continuity-e2e-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3c-continuity-e2e-closure-audit-timeout.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3c1-component-continuity-closure-audit-invalid-schema.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3c1a-agent-studio-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3c1a-agent-studio-closure-reaudit-timeout.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3c1a-agent-studio-final-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3c1b-workbench-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3c2-live-e2e-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3c2-live-e2e-definitive-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3c2-live-e2e-final-closure-audit-timeout.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3c2-live-e2e-final-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3c2-live-e2e-residual-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3d-docs-authority-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t3d-docs-authority-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t4a-accessibility-closure-audit-timeout.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t4a1-component-accessibility-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t4a1-component-accessibility-closure-reaudit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t4a2-live-e2e-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t4a2-live-e2e-closure-reaudit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t4b-route-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t4c-evidence-governance-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t4c-evidence-governance-closure-reaudit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t5a-evidence-binding-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t5b-collapse-continuity-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t5b-collapse-continuity-closure-reaudit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t6a-authority-packet-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t6a-authority-packet-closure-reaudit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t6b-evidence-chronology-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t6c-non-retained-collapse-oracle-closure-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-fable-t7-historical-chronology-closure-audit.json`
- `docs/plans/one-box-master/00-authority/authority-manifest.json`
- `docs/security/local-api-threat-model.md`
- `scripts/e2e/canvas-contract.mjs`
- `src/app/api/ai-teammates/[id]/route.test.ts`
- `src/app/api/ai-teammates/[id]/route.ts`
- `src/app/styles/workbench.css`
- `src/components/preview/AiTeammate/AgentStudioPanel.test.tsx`
- `src/components/preview/AiTeammate/AgentStudioPanel.tsx`
- `src/components/preview/AiTeammate/AiTeammatePanel.test.tsx`
- `src/components/preview/AiTeammate/LocalAiTeammatePanel.tsx`
- `src/components/preview/AiTeammate/WorkbenchAgentStudio.test.tsx`
- `src/components/preview/Workbench.tsx`

Outcome: exit 0; 83 paths. This list is byte-for-byte equal to both path arrays in the validated report.

## CMD-006 — fail-closed changed runtime and shared-file capability scan

`rg -n 'fetch\\(|node:(?:fs|child_process|net|http|https)|process\\.env|eval\\(|new Function|dangerouslySetInnerHTML|localStorage|sessionStorage|WebSocket|EventSource|sendBeacon|indexedDB|document\\.cookie|postMessage\\(|import\\(|XMLHttpRequest' scripts/e2e/canvas-contract.mjs 'src/app/api/ai-teammates/[id]/route.test.ts' 'src/app/api/ai-teammates/[id]/route.ts' src/app/styles/workbench.css src/components/preview/AiTeammate/AgentStudioPanel.test.tsx src/components/preview/AiTeammate/AgentStudioPanel.tsx src/components/preview/AiTeammate/AiTeammatePanel.test.tsx src/components/preview/AiTeammate/LocalAiTeammatePanel.tsx src/components/preview/AiTeammate/WorkbenchAgentStudio.test.tsx src/components/preview/Workbench.tsx`

The wrapper exits nonzero when `rg` returns greater than 1; an ordinary no-match exit 1 is accepted, while scanner errors fail the gate. Outcome: wrapper exit 0; `rg` exit 0 with these complete hits:

- `LocalAiTeammatePanel.tsx:197` and `:282`: same-origin roster GET and assignment POST.
- `Workbench.tsx:353`: pre-existing same-origin asset GET; the line is not added by this diff.
- `WorkbenchAgentStudio.test.tsx:1`: static source test reads current source through `node:fs`.
- `canvas-contract.mjs:37-38`: E2E-only filesystem imports.
- `canvas-contract.mjs:42,55-56,88`: E2E-only environment configuration.
- `canvas-contract.mjs:89`: E2E-only dynamic import of the local fixture builder.

No changed production file contains provider/external-network configuration, credentials, shell/process execution, raw HTML injection, browser storage, socket/event stream, beacon, IndexedDB, cookie, postMessage, XMLHttpRequest, or dynamic import. Every match is classified above; there are no unreviewed hits.

## CMD-007 — report validator with pinned script

`python3 /Users/zero-suminc./.codex/skills/security-review/scripts/validate_report.py --report docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-security-review.json`

Validator SHA-256: `78a0a6ffeefaae80fc710ded11db723b3b3edcde1776bd143728e67ffe7bc9f4`.
Outcome: exit 0.
Output: `security-review-report: OK`.

## CMD-008 — shared-file diff review binding

`shasum -a 256 docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-shared-file-diff-review.json`

Outcome: exit 0.
Output: `f36050631599fa0c828fcde63c0c55d77ce4c9fcb8491510bbb0c22b136ae149`.
The artifact reviews every changed OBX-AUTH-ATF-001 allowed exact shared path with before and after hashes, numstat, hunk-level responsibility, and a verdict.

## CMD-009 — independent-verification binding

`shasum -a 256 docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-independent-verification.json`

Outcome: exit 0.
Output: `5b4150d7f9e0c769277cc212d5a6dfd54d4d17a31a0479d39ba0d14c35ffdbc9`.
The record names the separate read-only verifier, binds current product-source hashes, and reports criterion-by-criterion and gate results.

## CMD-010 — authorized derived packet-digest write proof

Owner authorization is bound by SHA-256:

`shasum -a 256 docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-packet-digest-derived-write-authorization.json`

Outcome: exit 0.
Output: `5aa48df3c780dc530a48bf6c699c185dc257510c9e76bb2638dbcad46b8a5fa2`.

`git diff --unified=3 -- docs/plans/one-box-master/00-authority/authority-manifest.json`

Outcome: exit 0. The diff contains one hunk and changes only `/packetDigest`, from
`f17059ecbf094c89ace92f1b415f0bf5a695f8893feec3a0843dd9eedd50aa51` to
`5efe92421246d22520e425f05ca5b45b5e734b57b57d19fd7d8925247570b38b`.
No other manifest byte or field changes.

`npm run verify:plans`

Outcome: exit 0.
Output: `Plan authority verification passed: 17 domains, 29 tickets, 21 program evaluations.`
The verifier-computed authority packet SHA-256 is
`5efe92421246d22520e425f05ca5b45b5e734b57b57d19fd7d8925247570b38b`, exactly matching the authorized derived write.
