# Deep Agents teammate immutable review packet

- Target commit: `a0c932faa2df949db817538726e83e0202c3d417`
- Comparison base: `9d4ddfddc83efa2af5a560500cd87c787b7035f3`
- Authority packet digest: `01bd9f3e40670c5d4adb1e1bb985c94eef07663c57e3d397fa1f4709c5a8027e`
- Review model required: exact `x-ai/grok-4.6`
- Implementation authorized: no
- Runtime disposition: `adapt-patterns-only`

This packet is a hash-first bounded representation of the immutable correction
commit. The first whole-slice immutable review and its identical retry each hit the
five-minute harness timeout and produced no verdict or output artifact. The prior
corrections re-audit returned `CLEAN`, but it targeted the same bytes while they
were still uncommitted. This packet exists so the exact reviewer can verify the
same committed bytes without re-sending two large historical audit payloads.

## Target file hashes

| SHA-256 | Path |
|---|---|
| `969e6c0215865227bdaad677b52266522ab6408b6cdeec1a7af22f14197a089a` | `docs/adr/0003-deep-agents-js-job-plane-evaluation.md` |
| `5ff5321621d813be3e719e057c2f9cb625d5d7fb2081af439d290124fe63cc6f` | `docs/audits/evidence/2026-08-29-deep-agents-grok-disposition.md` |
| `e23841f350a52ec2817176e85e9a611daff45a7d70c43f58f7dadd0d728cb70b` | `docs/audits/grok-4.6/2026-08-29-deep-agents-teammate-final-audit.json` |
| `bc67b6093f3af54582866f78c8f6940dbadac2ddaff7c5dc5c993dcbd350079f` | `docs/audits/grok-4.6/2026-08-29-deep-agents-teammate-corrections-reaudit.json` |
| `765258a885542a5f852321142b8caaebe84e3591e8a3ddc48b281ef585537b30` | `docs/eval/one-box-program/deepagents-js-spike-results-2026-08-29.json` |
| `6e009df1efdfb4896d3a71931fb3c677dfef7e98ffb9a81d23973643c430c9b7` | `docs/eval/one-box-program/deepagents-js-spike-results-2026-08-29.md` |
| `0f193b820054ccaf2ae83a7cec8a7895fb5621a58540e9915c1d9cf9288f3488` | `docs/eval/one-box-program/fixtures/agent-routing-adversarial-corpus-v1.json` |
| `f35a63150526ae0531fa7f41b39c9293050a98dfffd36553fa74faf504e8a8a9` | `docs/plans/one-box-master/00-authority/authority-manifest.json` |
| `1136a17cf58bda43d7c99ad200d8c7372f5c01f3964b6ec82f53fa0ce88e5dbc` | `docs/plans/one-box-master/04-operating-environment/ai-teammate-operating-model.md` |
| `88dbe0e2da68d982da25202799e8962e861269cc97a45ff30972ef776f9c517b` | `docs/plans/one-box-master/06-technology/deepagents-js-evaluation-plan.md` |
| `f8240294ade59b8666d024f3a03e3512614696a44c69236a68db73db9c1d6250` | `docs/plans/one-box-master/06-technology/technology-adoption-roadmap.md` |
| `403ecdbecba86262fc6281e408672e16bf41bd1ff58bb17836a7dce9009b5a4d` | `docs/research/source-catalog/adoption-ledger.json` |
| `adb6c64e641f636c4e5d21dedf0e4e8ee2a70d598b1775c500ab79a169a3c337` | `docs/research/source-catalog/deepagents-js-candidate-intake-2026-08-29.md` |
| `e5e79e3f662a74555234481a19c264c4650106b674c10e84c6920962b9b6745b` | `docs/superpowers/specs/2026-08-29-canvas-operating-environment-design.md` |

## Control summary

1. **Authority and delegation.** Missing or `null` parent/child allowlists are
   construction errors; explicit empty arrays grant nothing. Every child tool,
   filesystem grant, data class, and effect must be inside the parent allowlists;
   effective grants are the parent-child intersection and expansion fails before
   model execution. `authority` is never model-accessible.
2. **Lifecycle and human gates.** The roster distinguishes complete, failed,
   cancelled, rejected, and budget-exhausted terminal states with typed receipts.
   Non-human transitions are limited to receipt persistence, mechanical result
   recording, stop/cancel, and enqueueing an already-authorized bounded job.
   Accept/apply/qualify/scope/risk/ticket/release/publish remain named-human gates.
3. **Canvas primacy.** Canvas is the pinned default and sole design-mutation
   surface. Browser, Plan, Team, Review, Qualify, Ship, and focused Agent Studio are
   adjuncts and cannot apply a Canvas mutation outside Canvas.
4. **Accessibility.** Roster, assignment, compare, filter, and interrupt controls
   require keyboard operation, accessible names/descriptions, visible focus,
   textual non-color state/error labels, and assistive-technology announcements.
5. **Evidence honesty.** The controller comparison is explicitly architectural,
   because same-fixture baseline metrics were not collected. The packet says the
   candidate did not demonstrate a material advantage; it makes no comparative
   performance claim.
6. **Runtime decision.** ADR 0003, the ledger, evaluation plan, intake, and roadmap
   agree on `adapt-patterns-only`. No upstream runtime, source, dependency, service,
   or generated file is cleared for retained application use. Reconsideration
   requires a new intake, ADR, ledger decision, owners, evaluation, and explicit
   implementation authorization.
7. **Screenshot-to-code vocabulary.** Its section is `Patterns to adapt`, explicitly
   preserving ledger `SC-GH-005` as research-only with no code-use clearance.

## External spike receipt

- External repository: `/Users/zero-suminc./Inbox/misc/one-box-deepagents-js-spike-20260829`
- External commit: `00922f29e0f2ed6f59e6016be9e26f2ef95e56ef`
- Evidence manifest SHA-256: `aab5f21a6a868cd2aa30e13ea1475244c7abe43bc6301cfe95469eeecd53edcd`
- Lockfile SHA-256: `994bd6f04d5ad2266e40d8a138db30a2e6d690c1650a6242743f422c6a306bb7`
- Deterministic assertions: 15/15 passed on Node `v22.22.3`, Darwin arm64
- Real credentials: none; paid calls: zero; application package/lock hashes unchanged
- T2 rejects missing lists and parent-child tool/filesystem expansion.
- T4 uses only virtual `StateBackend`; OS symlink semantics are absent. Any future
  OS-backed backend must add a real symlink probe.
- T6 records no egress when tracing is disabled, rejects tracing-enabled
  construction before model execution, and preserves the OS network-deny receipt.
- T7 records wall-clock, token, currency, and delegation-depth stops with
  partial-result hashes plus idempotent replay behavior.
- T11 binds every result to the test environment and hashed raw evidence pointers.

These are normalized, hash-bound external claims, not reproduced execution inside
the application repository. Independent verification must inspect the external Git
object and rerun the spike; Grok cannot convert these claims into authority.

## Preserved review history

- First exact Grok audit: `FINDINGS`, 12 findings.
- Human disposition register: all 12 corrected with source evidence.
- Exact Grok corrections re-audit: `CLEAN`, zero findings.
- Two identical whole-slice immutable final calls: timed out, no verdict, no output.
- This compact immutable review is advisory only. Deterministic tests, independent
  verification, and named human authority can still fail the packet.
