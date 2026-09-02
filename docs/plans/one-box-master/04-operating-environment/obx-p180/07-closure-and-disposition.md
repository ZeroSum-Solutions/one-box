# OBX-P180 Step 7: Closure and disposition

- Packet: `OBX-P180`
- Step: 7 of 7
- Planning disposition: `CLOSED / NOT AUTHORIZED`
- Implementation readiness: `BLOCKED ON HUMAN ASSIGNMENTS AND OWNER ACCEPTANCE`
- Base commit: `b6486fdfa4601b315944ad099bf2beba1c053e91`
- Branch: `research/la-appointment-field-study`

## Outcome

The planning question is closed. Steps 1 through 6 reconcile the linked operating-
environment sources into one provider-offline contract packet with explicit threat
boundaries, executable fixtures, ownership, sequenced tickets, and an implementation-
authorization proposal. The frozen Canvas foundation was not reopened or edited.

Product runtime, existing provider/model routes, dependencies/lockfile, persistence,
browser, collaboration, Page IR mutation, deployment, and release behavior remain
unchanged. The code changes in this planning checkpoint are evaluation-only: a local
provider-offline contract evaluator/test and bounded timeout/output controls for the
existing Grok audit harness.

Planning closure does not imply implementation readiness. The proposed authorization
is still `proposed-not-accepted`; its human assignments, expiry, accepted-by/time,
authorization hash, and copied packet hash remain unset by design. No ticket may
implement until the repository owner accepts a complete exact record in the existing
authority manifest.

## Frozen artifact manifest

SHA-256 values below bind the packet presented to the final model audits:

| Artifact | SHA-256 |
|---|---|
| `README.md` | `a7f6ec197adebdc935b5e01251da4735d471c0fc443453f9aeeaca284464a017` |
| `01-gap-and-conflict-matrix.md` | `f7bd960de6efc56185ff974a5078ade94bb0dbd28d188978d1001e133c546604` |
| `02-provider-registry-and-route-contract.md` | `61ab80eb579df514a5627f4d5ecb4133c61497c6e0a7895fb22e6581729be13d` |
| `03-skills-context-and-receipts.md` | `7755dee982a321a318843d6ce41d24b087032f533d4796283d8096c68227d31d` |
| `04-budget-capacity-compare-failure.md` | `e67002acfeea154a8376513fdf16add713af6ad436d68813e7c7158fd614d31b` |
| `05-security-and-executable-evaluations.md` | `13f99c0d6bd5a165625fbaf614ab4d9e67055570dd1d96c71d348bdec444314c` |
| `06-ownership-tickets-and-authorization-proposal.md` | `385e3c046528abe7f9a7307421741386fa0abf032f06e094745833feaa3370af` |
| `capacity-and-cost-fixture-v1.json` | `81ab1796a7f706d84ceae54c0539e725b1b95c821ebe56d02af6b1c85c1fc738` |
| `obx-p180-security-fixture-v1.json` | `ce368d420953f6f8996f2b4902c2fd7e3916f2f43e0bd3a0d578c07580091940` |
| `obx-p180-human-decision-fixture-v1.json` | `3d32ec35ee532b8acb15de1ab780bebdd828e371dc65fef491cbe491fabc6d11` |
| `obx-p180-apply-eligibility-fixture-v1.json` | `ad5116d85ac2ecc8ded78f209aee16c8a58adb3c569f58a7a1fdfb2c810ff0cf` |
| `obx-p180-contract-fixtures.mjs` | `19567521a37d524f654c6e241879a349a7c522f8a40681d08fd706ff6b36dfab` |
| `obx-p180-contract-fixtures.test.mjs` | `141ed3114269cb88c8725dc9b56c736914b38a7c8abcc8dce7523eb2bbd1f4a6` |
| `grok-audit.mjs` | `400238ae208ce5b2c426303ead6500a1049b9b94ced45934796a3c1f67d8f473` |

Step 7 is intentionally not self-hashed in its own body. The external exact-Grok
Step 7 receipt binds its final bytes, and the whole-packet exact-Fable receipt binds
Steps 1 through 7 plus the index and executable artifacts. Any later byte change
invalidates those receipts and reopens closure.

## Exact-Grok numbered-step receipts

Every receipt below records requested model `x-ai/grok-4.6`, provider-reported model
`x-ai/grok-4.6`, effort `high`, verdict `CLEAN`, and zero findings:

| Step | Clean receipt | Receipt SHA-256 |
|---:|---|---|
| 1 | `docs/audits/grok-4.6/2026-08-30-obx-p180-s1-definitive-clean-audit.json` | `d6a36edc8b61f6e550da94bbb4ab5a935dc107e5bd336aad9b68bd0fa45b6877` |
| 2 | `docs/audits/grok-4.6/2026-08-30-obx-p180-s2-final-clean-audit.json` | `5fa4ff61f42955d02cf72ecaff064eb9c24de6878f8dbb6516ef250c2382b83c` |
| 3 | `docs/audits/grok-4.6/2026-08-30-obx-p180-s3-definitive-closure-audit.json` | `b7f5d049968b20a209f3886745af541a81bd4b42f06fc19c33fb6199f130ee25` |
| 4 | `docs/audits/grok-4.6/2026-08-30-obx-p180-s4-absolute-clean-audit.json` | `3e0a8e9843ce3943b40cc0c5fdff73043df1f348b9d8800aff96dfe905e840b6` |
| 5 | `docs/audits/grok-4.6/2026-08-30-obx-p180-s5-security-evaluations-reaudit.json` | `bf52344d927aab92d6d9ce570e51cd309295d10639725a5c60dde939b09602d4` |
| 6 | `docs/audits/grok-4.6/2026-08-30-obx-p180-s6-ownership-authorization-reaudit.json` | `e6ecbb954225e632e5214afa40eb64589eba5584249ef83e10a5a86ca6d8825e` |
| 7 | `docs/audits/grok-4.6/2026-08-30-obx-p180-s7-packet-closure-audit.json` | external receipt written after whole-packet Fable CLEAN |

All timeout and finding receipts remain beside the clean receipts. They are adverse
history and must not be overwritten, deleted, or presented as passing evidence.

## Executable evaluation evidence

Current provider-offline lane results under Node denied-network permission:

| Lane | Result | Network | Provider calls |
|---|---:|---|---:|
| cost/capacity | 11/11 PASS | denied | 0 |
| security | 9/9 PASS | denied | 0 |
| human-decision state conformance | 3/3 PASS | denied | 0 |
| apply-eligibility conformance | 4/4 PASS | denied | 0 |

The 18-test evaluator suite passes, including oracle mutation, malformed fixture,
lane separation, fail-closed cancellation, and network-permission tests. These are
contract-conformance receipts only. They are not quality evidence, a named human
decision, independent security verification, product behavior, or authorization.

Repository gates at freeze time:

- `node --test scripts/eval/obx-p180-contract-fixtures.test.mjs`: 18/18 PASS;
- `npm run test:plans`: 48/48 PASS;
- `npm run verify:plans`: PASS; operating environment remains draft and OBX-P180
  remains proposed; authority-packet hash
  `5efe92421246d22520e425f05ca5b45b5e734b57b57d19fd7d8925247570b38b`;
- focused ESLint for all three changed evaluation scripts: PASS;
- `npm run typecheck`: PASS;
- `git diff --check`: PASS.

## Security disposition

Step 5 preserves the program threat-model meanings and owner map for TM-02, TM-03,
TM-04, TM-05, TM-08, TM-09, and TM-13, then adds P180-specific confused-deputy,
receipt-authority, and resource-exhaustion rows. Every trust boundary names trusted
and untrusted sides, forbidden crossing, fail-closed behavior, and accountable role.

Exact Grok and exact Fable are adversarial advisory reviewers. They cannot satisfy
the `independent-security-verifier` assignment. That named-human gate remains
`NOT_RUN / UNASSIGNED`, as do the other proposed role assignments. This is the honest
implementation blocker and must not be converted to PASS by this packet.

## Authorization disposition

The recommended owner decision, if and only if the owner wants implementation next,
is to consider `OBX-AUTH-P180-OFFLINE-V1` exactly as proposed in Step 6. Before
acceptance the owner must:

1. assign every required named human, including a verifier disjoint from every diff
   author, with distinct current escalation actors;
2. copy the frozen packet hash into the authority record, set a bounded expiry, and
   fill acceptance identity/time/hash;
3. retain exact per-ticket paths, predecessors, role IDs, deny-unlisted effects,
   forbidden effects, evidence, and invalidators; and
4. accept the complete record in
   `docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json`.

Until that separate human action, the only lawful next work is review/assignment/
authorization administration. T01 through T08 remain unstarted. Provider-connected,
credential, persistence, runtime wiring, UI, browser, collaboration, Page IR,
deployment, and release work require a later distinct proposal even after the offline
slice closes.

## Final audit procedure and closure rule

1. Exact `claude-fable-5` at effort `max` reads the index, Steps 1 through 7, all four
   fixtures, both evaluator files, the final clean Grok receipts, and governing
   authority/threat sources. Its external receipt is
   `docs/audits/fable-5/2026-08-30-obx-p180-whole-packet-audit.json`.
2. If Fable reports any BLOCK/HIGH/MEDIUM finding, preserve the receipt, reopen the
   affected step, remediate, and repeat that step's Grok audit before Fable re-audit.
3. Only after exact-Fable CLEAN, exact Grok 4.6 audits this Step 7 with the Fable
   receipt as proof. Any finding reopens closure.
4. After both receipts are CLEAN, rerun executable, plan, lint, type, leak, diff, and
   source-scope checks. Do not edit packet bytes after those receipts.

## Acceptance criteria

`OBX-P180-S7` is closed only when:

1. Steps 1 through 6 retain exact-model CLEAN receipts on the hashes above;
2. exact Fable 5 returns CLEAN on the whole frozen packet with no unresolved BLOCK,
   HIGH, or MEDIUM finding;
3. exact Grok 4.6 returns CLEAN for Step 7 with the Fable receipt as proof;
4. all executable/local gates remain green and no product runtime, dependency,
   authority manifest, frozen Canvas, provider, or Page IR behavior changed;
5. the final disposition remains `CLOSED / NOT AUTHORIZED`, with named-human security
   verification and owner acceptance explicitly unresolved.

This closes planning only. It grants no implementation, provider, credential,
persistence, browser, collaboration, Page IR, deployment, or release authority.
