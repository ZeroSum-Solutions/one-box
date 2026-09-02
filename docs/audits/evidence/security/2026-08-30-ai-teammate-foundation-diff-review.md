# AI teammate foundation v1 security diff review

- Review date: 2026-08-30
- Base: `47650fccb0fce0e96a49f9ae725abbe6a25540f1`
- Reviewed ref: `1b93148627fcc1cf6d29ecdd91d706b0a42dd582`
- Reviewed tree: `97dddb8b08c53ff3e0c8a492f0c63a116c303b12`
- Comparison: `47650fccb0fce0e96a49f9ae725abbe6a25540f1...1b93148627fcc1cf6d29ecdd91d706b0a42dd582`
- Execution environment: local macOS. Source review used only immutable Git objects. Focused tests ran from `/tmp/one-box-security-review-1b931486.iyFVMu`, populated by `git archive 1b93148627fcc1cf6d29ecdd91d706b0a42dd582`; the mutable checkout was only the destination for these requested artifacts.
- Verdict: `PASS`

## Canonical surface coverage

| Surface | State | Evidence and conclusion |
| --- | --- | --- |
| `prompt-injection` | `NOT-APPLICABLE` | The range adds no model/provider call, prompt or role/message constructor, retrieval source, tool definition, tool-result reinjection, or instruction-authority path. The task remains typed data, and the sole production proposer emits a fixed local recommendation (`src/app/api/ai-teammates/[id]/route.ts:149-167`). |
| `secrets` | `REVIEWED` | The exact range scan passed with `gitleaks` 8.30.1: one commit, about 286 KB, no leaks (`docs/audits/evidence/security/2026-08-30-ai-teammate-foundation-gitleaks.txt:1`). Manual source review found no credential value; the only credential boundary reached by the route is the unchanged optional `ONE_BOX_API_TOKEN` logic in `src/lib/localApiAuth.ts:39-45`. |
| `authentication` | `REVIEWED` | GET and POST call the established local guard before path use, and POST calls it before consuming the body (`src/app/api/ai-teammates/[id]/route.ts:74-82,95-110`). The expanded unchanged delegate requires loopback request URL plus matching normalized loopback Host and port, then exact same-origin browser mutation metadata or a configured bearer on loopback (`src/lib/localApiAuth.ts:25-52`). Tests cover hostile GET origin and unauthorized malformed POST without body consumption (`src/app/api/ai-teammates/[id]/route.test.ts:83-124`). |
| `authorization` | `REVIEWED` | The HTTP decision point admits exact `read`/`propose` effects and empty parent/child grants only (`src/app/api/ai-teammates/[id]/route.ts:25-35`). Job schemas close tools, retries, delegation, fallback, retention, and execution lane (`src/lib/contracts.ts:136-187`). The sole production callback is fixed and effect-free. The syntactic run ID is not treated as resource ownership and no run state is loaded, mutated, persisted, or exported (`docs/architecture/README.md:327-335`). |
| `untrusted-input` | `REVIEWED` | Run ID, assignment shape, task length, data label, tuple order, and empty grants are validated at ingress; the executor revalidates job/input, canonical byte size, input hash/data binding, deadline/duration, proposal schema, and output size before success (`src/app/api/ai-teammates/[id]/route.ts:25-35,104-153`; `src/lib/aiTeammates/executor.ts:146-239,283-338`). Serialization rejects non-finite numbers, cycles, and non-plain records (`src/lib/aiTeammates/serialization.ts:3-45`). React renders returned strings as text, not raw HTML. |
| `export` | `NOT-APPLICABLE` | Runtime search found only relative same-origin UI fetches to `/api/ai-teammates/<encoded-run-id>` (`src/components/preview/AiTeammate/LocalAiTeammatePanel.tsx:156-176,214-244`). No dependency/lock manifest changed, and the route imports no provider, network, filesystem, shell, storage, telemetry, webhook, email, queue, redirect, or logging adapter. Its `no-store` response returns only to the initiating authorized local client. No external destination or recipient exists, so `exports.state` is `NONE` and the export-policy result is `PASS`. |

## Expanded delegated-boundary review

### Authentication and resource authorization

`isLocalApiAuthorized` is unchanged but was reviewed because the new endpoint delegates its authentication decision to it. It denies non-loopback request URLs, absent or mismatched Host authority, port mismatch, hostile browser Origin, missing same-origin Fetch Metadata, and unsupported browser mutation content types. An optional bearer is valid only on the already validated loopback authority. The route performs the decision before parsing an untrusted body. There are no users, roles, tenants, or persisted resources in this local-only slice; the route's syntactically valid run ID is a response/job label, not a claim of ownership over loaded state.

### Tool, callback, and execution authority

Contracts permit only `read` and `propose`, require explicit empty `toolGrants` and `childToolGrants`, fix one attempt and zero delegation depth, and prohibit fallback and durable retention. The executor rejects an unexpected proposal-schema ID, incomplete effects, expired deadline, invalid/hash-mismatched or over-budget input, and invalid/over-budget output before returning success. The callback seam is intentionally trusted and cooperative cancellation is not a sandbox (`docs/architecture/README.md:316-325`), but the only production caller supplies a synchronous constant local callback with no ambient capability. Any future provider, arbitrary callback, tool, persistence, or mutation connection invalidates this conclusion and requires a new review.

### Data classification and input handling

The `dataClass` field is an explicit caller assertion limited to `public` or `project-internal`; it is not a content classifier (`docs/security/local-api-threat-model.md:9`). In this single-user local foundation lane, a misclassified task has no model, tool, log, persistence, filesystem, or external-export sink: it is canonicalized in process and returned `no-store` to the same authorized local client. That documented trust assumption does not demonstrate a current cross-boundary disclosure or control bypass, so it is not recorded as a defect here. It becomes a blocking design question before any provider, persistence, shared-user, telemetry, or other egress is connected.

### Receipt and rendering delegates

Receipt construction binds the validated job, input, effects, execution lane, output schema, and complete output hash; terminal failure paths return no proposal and no partial output. Client code rejects a mismatched envelope, teammate/task, status, effects, lane, cost, schema, or hash shape before rendering. Task and recommendation strings flow only through normal React text nodes; the changed source contains no raw-HTML, eval, shell, path, SQL, redirect, or URL sink.

### E2E gate changes

The target replaces the invalidated fail-open Agent Studio gate with strict navigation/Edit/reopen checks, visible-pane scoping, pre-submit compact touch-target enumeration, a real bounded proposal submission, completed receipt assertions, pre/post apply-like-control absence checks, and a hard failure when axe analysis throws. These test-harness changes do not add runtime authority or external data egress. The target's final exact Grok 4.6 reaudit records `CLEAN`; it remains advisory and is not used as a substitute for this review.

## Export-policy gate

No new export exists. The two application fetches are relative same-origin calls to the new local route. The E2E harness navigates the operator-supplied test base already used by the existing harness and submits only a fixed non-sensitive fixture assignment; it is not a product export path. Dependency and lock manifests are unchanged. Therefore `exports.state: NONE`, export coverage is `NOT-APPLICABLE`, and `export_policy.result: PASS`.

## Material commands and outcomes

| ID | Purpose | Command | Outcome |
| --- | --- | --- | --- |
| `CMD-001` | Immutable changed-path capture | `git diff --name-only 47650fccb0fce0e96a49f9ae725abbe6a25540f1...1b93148627fcc1cf6d29ecdd91d706b0a42dd582` | Exit 0; 53 paths captured in `docs/audits/evidence/security/2026-08-30-ai-teammate-foundation-diff.txt`. Merge base equals the supplied base and the ref tree equals the supplied tree. |
| `CMD-002` | Exact range secret scan | `gitleaks detect --source . --no-banner --redact --log-opts 47650fccb0fce0e96a49f9ae725abbe6a25540f1..1b93148627fcc1cf6d29ecdd91d706b0a42dd582` | Exit 0; no leaks found. Transcript saved in `docs/audits/evidence/security/2026-08-30-ai-teammate-foundation-gitleaks.txt`. |
| `CMD-003` | Focused exact-target security seam tests | `npm test -- 'src/app/api/ai-teammates/[id]/route.test.ts' src/lib/aiTeammates/executor.test.ts src/lib/aiTeammates/receiptBinding.test.ts src/lib/aiTeammates/registry.test.ts src/lib/contracts.test.ts src/components/preview/AiTeammate/AiTeammatePanel.test.tsx src/components/preview/AiTeammate/AiTeammateStyles.test.ts src/components/preview/AiTeammate/AgentStudioPanel.test.tsx src/components/preview/AiTeammate/WorkbenchAgentStudio.test.tsx` | Exit 0 in the archived target snapshot; 9 files and 84 tests passed. |
| `CMD-004` | Exact-target authority verifier | `npm run verify:plans` | Exit 0 in the archived target snapshot; 17 domains, 29 tickets, 21 evaluations; digest `ba44f49582e96dcc06afa6a82d7fed6e8171d9cf6fabcc5507f1c72da075f13c`. |
| `CMD-005` | Exact-target fail-closed authority tests | `npm run test:plans` | Exit 0 in the archived target snapshot; 48/48 passed. |

## Changed-path classification

Exactly one row appears for each path captured by `CMD-001`. Empty surface lists denote reviewed paths that add no sensitive behavior.

| Path | Surfaces | Evidence |
| --- | --- | --- |
| `docs/architecture/README.md` | `authorization`, `untrusted-input` | Lines 307-346 document the closed job, trusted callback, syntactic run ID, and no-effect boundary. |
| `docs/audits/evidence/goal/2026-08-29-ai-teammate-foundation-t0-authority.txt` | `authorization` | Authority-scope command evidence inspected in the immutable ref. |
| `docs/audits/evidence/goal/2026-08-29-ai-teammate-foundation-t1-registry-contracts.txt` | `authorization`, `untrusted-input` | Contract/registry command evidence inspected in the immutable ref. |
| `docs/audits/evidence/goal/2026-08-29-ai-teammate-foundation-t2-executor-receipts.txt` | `authorization`, `untrusted-input` | Executor/receipt command evidence inspected in the immutable ref. |
| `docs/audits/evidence/goal/2026-08-29-ai-teammate-foundation-t3-api-canvas.txt` | `authentication`, `authorization`, `untrusted-input` | Route/Canvas command evidence inspected in the immutable ref. |
| `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-t4-final-gates.txt` | `secrets`, `authentication`, `authorization`, `untrusted-input` | Final-gate evidence records boundary limitations and corrected gate outcomes. |
| `docs/audits/grok-4.6/2026-08-29-ai-teammate-foundation-t0-authority-audit.json` | `authorization` | Advisory authority audit; it grants no authority. |
| `docs/audits/grok-4.6/2026-08-29-ai-teammate-foundation-t0-authority-reaudit.json` | `authorization` | Advisory authority reaudit; it grants no authority. |
| `docs/audits/grok-4.6/2026-08-29-ai-teammate-foundation-t1-registry-contracts-audit.json` | `authorization`, `untrusted-input` | Advisory contract audit inspected. |
| `docs/audits/grok-4.6/2026-08-29-ai-teammate-foundation-t2-executor-receipts-audit.json` | `authorization`, `untrusted-input` | Advisory executor audit inspected. |
| `docs/audits/grok-4.6/2026-08-29-ai-teammate-foundation-t3-api-canvas-audit.json` | `authentication`, `authorization`, `untrusted-input` | Advisory route/Canvas audit inspected. |
| `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-t2-executor-receipts-reaudit.json` | `authorization`, `untrusted-input` | Advisory executor reaudit inspected. |
| `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-t3-api-canvas-reaudit-v2.json` | `authentication`, `authorization`, `untrusted-input` | Advisory route/Canvas reaudit inspected. |
| `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-t3-api-canvas-reaudit-v3.json` | `authentication`, `authorization`, `untrusted-input` | Advisory route/Canvas reaudit inspected. |
| `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-t3-api-canvas-reaudit-v4.json` | `authentication`, `authorization`, `untrusted-input` | Advisory route/Canvas reaudit inspected. |
| `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-t3-api-canvas-reaudit.json` | `authentication`, `authorization`, `untrusted-input` | Advisory route/Canvas reaudit inspected. |
| `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-t4-final-gates-audit.json` | `authorization`, `untrusted-input` | Advisory E2E-gate audit records the invalidated fail-open conditions. |
| `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-t4-final-gates-reaudit-v2.json` | `authorization`, `untrusted-input` | Final advisory reaudit records `CLEAN` after the target fixes. |
| `docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-t4-final-gates-reaudit.json` | `authorization`, `untrusted-input` | Intermediate advisory reaudit records remaining E2E gaps. |
| `docs/plans/2026-08-29-ai-teammate-foundation-v1-implementation.md` | `authentication`, `authorization`, `untrusted-input` | Lines 15-39 pin test-first boundaries and forbid widening. |
| `docs/plans/one-box-master/00-authority/authority-manifest.json` | `authorization` | Adds the scoped-authorization registry to the canonical packet. |
| `docs/plans/one-box-master/00-authority/plan-register.md` | `authorization` | Registers only the narrow approved foundation slice. |
| `docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json` | `authorization` | Lines 23-90 pin effects, data, paths, prohibited capabilities, reviews, and invalidators. |
| `docs/plans/one-box-master/04-operating-environment/ai-teammate-operating-model.md` | `authorization` | Lines 8-12 retain planning-only status outside the foundation. |
| `docs/security/local-api-threat-model.md` | `secrets`, `authentication`, `authorization`, `untrusted-input` | Line 9 documents local auth, strict assignment, caller classification, and no-effect execution. |
| `docs/specs/2026-08-29-ai-teammate-foundation-v1.md` | `authorization`, `untrusted-input` | Lines 41-98 define jobs, grants, execution, and the security/data boundary. |
| `docs/tickets/ai-teammate-foundation/OBX-AT-001.md` | `authorization`, `untrusted-input` | Lines 16-49 bound implementation and required security review. |
| `docs/tickets/ai-teammate-foundation/manifest.json` | `authorization` | Pins the ticket to scoped authority and forbids automatic transition. |
| `scripts/e2e/canvas-contract.mjs` | `authorization`, `untrusted-input` | Strictly exercises visible teammate controls, a bounded assignment, receipt, no-apply boundary, and hard-fail axe behavior. |
| `scripts/e2e/canvas-coverage.mjs` | `authorization` | Extends the deterministic workbench matrix to Agent Studio. |
| `scripts/e2e/preview-workbench.mjs` | `authorization` | Exercises Agent Studio without adding runtime authority. |
| `scripts/verify-plan-authority.mjs` | `authorization`, `untrusted-input` | Lines 219-299 and 437-545 validate paths, files, exact authority, grants, and prohibited widening. |
| `scripts/verify-plan-authority.node.mjs` | `authorization`, `untrusted-input` | Negative tests reject unknown grants, traversal/globs, provider dependencies, and scope drift. |
| `src/app/api/ai-teammates/[id]/route.test.ts` | `authentication`, `authorization`, `untrusted-input` | Lines 83-151 cover hostile origin, auth-before-body, malformed ID, grants, effects, data labels, and unknown keys. |
| `src/app/api/ai-teammates/[id]/route.ts` | `secrets`, `authentication`, `authorization`, `untrusted-input` | Lines 25-35 and 74-178 implement the guarded strict assignment, fixed callback, and no-store response. |
| `src/app/styles/workbench.css` |  | Styling only; no authority, input, credential, prompt, or export behavior. |
| `src/components/preview/AiTeammate/AgentStudioPanel.test.tsx` | `authorization` | Tests separation of teammates from the existing Site advice mutation pane. |
| `src/components/preview/AiTeammate/AgentStudioPanel.tsx` | `authorization` | Lines 51-74 preserve distinct panes and name the Site advice mutation boundary. |
| `src/components/preview/AiTeammate/AiTeammatePanel.test.tsx` | `authorization`, `untrusted-input` | Tests response binding, stale-result rejection, working lock, and text rendering. |
| `src/components/preview/AiTeammate/AiTeammateStyles.test.ts` |  | CSS contract test only; no sensitive runtime behavior. |
| `src/components/preview/AiTeammate/LocalAiTeammatePanel.tsx` | `authorization`, `untrusted-input` | Lines 139-297 validate envelopes/results and submit an encoded run ID plus bounded assignment. |
| `src/components/preview/AiTeammate/WorkbenchAgentStudio.test.tsx` | `authorization` | Static seam test confirms Workbench uses Agent Studio. |
| `src/components/preview/Workbench.tsx` | `authorization` | Integrates Agent Studio while retaining established Site advice mutation controls. |
| `src/lib/aiTeammates/executionReceipts.ts` | `authorization`, `untrusted-input` | Lines 49-165 construct immutable terminal receipts and hide partial output. |
| `src/lib/aiTeammates/executor.test.ts` | `authorization`, `untrusted-input` | Tests pre-callback rejection, cancellation, deadline, size, schema, and timeout paths. |
| `src/lib/aiTeammates/executor.ts` | `authorization`, `untrusted-input` | Lines 146-353 validate job/input, hash/data binding, budgets, callback, proposal, and receipt. |
| `src/lib/aiTeammates/receiptBinding.test.ts` | `authorization`, `untrusted-input` | Tests job/receipt/output binding and tamper rejection. |
| `src/lib/aiTeammates/receiptBinding.ts` | `authorization`, `untrusted-input` | Lines 23-53 bind job, teammate, input, effects, schema/lane, and output hash. |
| `src/lib/aiTeammates/registry.test.ts` | `authorization` | Tests the exact immutable eight-role read/propose roster. |
| `src/lib/aiTeammates/registry.ts` | `authorization` | Lines 7-106 define the closed static roster. |
| `src/lib/aiTeammates/serialization.ts` | `untrusted-input` | Lines 3-84 canonicalize finite plain JSON, reject cycles/non-plain records, hash, clone, and freeze. |
| `src/lib/contracts.test.ts` | `authorization`, `untrusted-input` | Tests closed schemas, empty grants, budgets, terminal invariants, and unknown fields. |
| `src/lib/contracts.ts` | `authorization`, `untrusted-input` | Lines 17-313 define closed teammate/job/receipt schemas, empty grants, zero delegation, budgets, and receipt invariants. |

## Reviewer conclusion

No secret leak, authentication bypass, privilege/resource escape, prompt-injection path, tool or grant expansion, unsafe raw rendering sink, provider/network call, persistent data handling, or external export was found in the immutable range. The documented caller-classification, syntactic-run-id, and trusted-callback limitations remain bounded by this local, in-memory, effect-free slice and must be re-reviewed before any corresponding boundary is widened. With the exact range scan and required coverage available, the security verdict is `PASS`.

The bundled validator was run from `/Users/zero-suminc./.codex/skills/security-review` with `python3 scripts/validate_report.py --report /Users/zero-suminc./projects/one-box-worktrees/la-appointment-field-study/docs/audits/evidence/2026-08-30-ai-teammate-foundation-security-review.json`; it exited 0 with `security-review-report: OK`.
