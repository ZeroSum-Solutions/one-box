# Final immutable-target command evidence

Captured: 2026-08-30
Baseline: `899b39433c4be242b4b3adcd39f3e6cd53df99c0`
Target commit: `d844f9fead4e42d46d44b793203fad7489cc3597`
Target tree: `50eebc624a599655adb1e7cce4fc478da7c017b3`

This is post-target evidence. It does not alter the reviewed commit or product/source bytes.

## FT-001 — exact immutable census

Command: `git diff --name-only 899b39433c4be242b4b3adcd39f3e6cd53df99c0...d844f9fead4e42d46d44b793203fad7489cc3597`

Outcome: exit 0, exactly 92 paths:

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
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-independent-verification.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-security-closure-receipt.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-security-command-evidence.md`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-security-evidence-reconciliation.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-security-review.json`
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-shared-file-diff-review.json`
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
- `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-packet-digest-derived-write-authorization.json`
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
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-final-security-audit.json`
- `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-canvas-final-security-corrected-evidence-audit.json`
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

## FT-002 — target integrity

Commands: `git rev-parse HEAD`, `git show -s --format=%T HEAD`, `git diff --check 899b39433c4be242b4b3adcd39f3e6cd53df99c0...d844f9fead4e42d46d44b793203fad7489cc3597`.

Outcome: exit 0. Commit and tree exactly match the values above; diff check is clean.

## FT-003 — secret scan

Command: `gitleaks detect --source . --no-banner --redact --log-opts 899b39433c4be242b4b3adcd39f3e6cd53df99c0..d844f9fead4e42d46d44b793203fad7489cc3597`

Outcome: exit 0. One commit and 475,596 bytes scanned; no leaks found.

## FT-004 — authority and derived digest

`git diff --unified=3 899b39433c4be242b4b3adcd39f3e6cd53df99c0...d844f9fead4e42d46d44b793203fad7489cc3597 -- docs/plans/one-box-master/00-authority/authority-manifest.json` contains one hunk and changes only `/packetDigest`.

The value changes from `f17059ecbf094c89ace92f1b415f0bf5a695f8893feec3a0843dd9eedd50aa51` to `5efe92421246d22520e425f05ca5b45b5e734b57b57d19fd7d8925247570b38b`.

The explicit owner authorization is `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-packet-digest-derived-write-authorization.json`, SHA-256 `5aa48df3c780dc530a48bf6c699c185dc257510c9e76bb2638dbcad46b8a5fa2`. It permits that exact path and JSON pointer only, requires the verifier-derived value, and prohibits all other manifest fields.

`npm run verify:plans` passed 17 domains, 29 tickets, and 21 program evaluations; it recomputed exactly `5efe92421246d22520e425f05ca5b45b5e734b57b57d19fd7d8925247570b38b`.
`npm run test:plans` passed 48/48.

## FT-005 — deterministic code gates

- Focused Canvas teammate suite: 4 files, 32/32 passed.
- Full Vitest suite: 104 files passed, 4 fixture suites skipped; 1,328 tests passed, 4 skipped.
- Type generation and TypeScript: passed.
- ESLint: 0 errors; 6 pre-existing warnings.
- Production build: Next 16 `next build --webpack` passed, including `/api/ai-teammates/[id]`. The default Turbopack build was separately unavailable because this managed host denied its internal CSS-worker port; this is a host-policy restriction, not an application compile error.
- Frozen Page IR meta-evaluator: 171/184; all 13 failures are the independent Node 26.7.0 runtime guard on the installed Node 22.22.3 shell. `npm run eval:page-ir -- verify` passes.

## FT-006 — live Canvas contract and accessibility

Command: `ONEBOX_BASE_URL=http://127.0.0.1:8791 npm run test:e2e:canvas-contract:axe`

Outcome: exit 0. The complete 1440, 768, and 390 interaction matrix passed with no contract problems and no serious/critical accessibility violations. The harness intentionally exercises missing/error fixtures that emit expected 404/503 console lines; the final contract summary is clean.

## FT-007 — fail-closed capability review

The full changed runtime/test/E2E/shared-file scan and classification is recorded at `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-security-command-evidence.md:130`.

Reviewed hits are limited to same-origin roster/assignment requests, one pre-existing same-origin asset request, and test/E2E-only filesystem, environment, and dynamic-import use. No changed production file adds provider or external-network configuration, credentials, shell/process execution, raw HTML injection, browser storage, sockets/event streams, beacons, IndexedDB, cookies, postMessage, XMLHttpRequest, or dynamic imports.

## FT-008 — current source integrity

- `bd0fe8b0c083fca7b8d20589852b9465f16c5ba6b3342a2b166593f467f6dd55  docs/architecture/README.md`
- `62e9e2804937817ce3fbbc8d0db3ff18900f68666f32b02aaaadaf93b72543e2  docs/plans/one-box-master/00-authority/authority-manifest.json`
- `cc502382d4253190d6d949f2842ffb5e88b6d26c130ec68897013c6df13e881c  docs/security/local-api-threat-model.md`
- `aff029ced45eac675eab41f03c670a70dc4d9f368528eb7e57eabc8bbb016051  scripts/e2e/canvas-contract.mjs`
- `f69ba64037ad49680291d19dfda6671f0ded69c40fd535775152393daa39738d  src/app/api/ai-teammates/[id]/route.test.ts`
- `d9a512f0bfe53f9d4ed96fb8be30c6b2a4db922c04b7898d572f1156f285d7b5  src/app/api/ai-teammates/[id]/route.ts`
- `11238437b99c0a88c9926c15bce96958f8fd1dea960e4ecb1a6abd05ddb35f6c  src/app/styles/workbench.css`
- `10d75bb53db76a25f9d09b13dd80c544d1590af21bf3db47b33d13d1088d4795  src/components/preview/AiTeammate/AgentStudioPanel.test.tsx`
- `3c3afee04d9636cff40f76f1c75952cbd9ab81d25568f5f6655dc35879f02cbb  src/components/preview/AiTeammate/AgentStudioPanel.tsx`
- `680aa80fd11bac06fc83d0766fb2aab901281021080f7275f87923549ef4a84a  src/components/preview/AiTeammate/AiTeammatePanel.test.tsx`
- `5a537f2da5ea750e85d871e69cfe71c31f3cfc8d213f15a038f1632920e28cf8  src/components/preview/AiTeammate/LocalAiTeammatePanel.tsx`
- `8a403f271cb2ca997ef77bfceae7a521fe005b405e0e69b5b13a75a521ad0c62  src/components/preview/AiTeammate/WorkbenchAgentStudio.test.tsx`
- `75f3b299063a61705acc425debddbed28bcae4df8362cfd21a957701a67b8db7  src/components/preview/Workbench.tsx`
