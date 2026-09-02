# OBX-P180 Step 3: Skills, context, interrupts, and receipts

- Packet: `OBX-P180`
- Step: 3 of 7
- Status: proposed contract; implementation not authorized
- Depends on: Steps 1 and 2 exact-Grok CLEAN
- Governing requirements: `P180-R004` through `P180-R007`, `P180-R013`

## Boundary

This step plans closed skill, slash-command, context, human-interrupt, and receipt
contracts. It does not authorize a skill runtime, slash-command execution, model
call, tool call, persistence layer, durable memory, schedule, collaborator, or Page
IR mutation.

The frozen local teammate job/receipt contract remains unchanged. The planned
route, skill, context, and attempt records are adjacent evidence for a future
compatibility slice. They cannot replace, mutate, or create a second terminal job
authority.

All planned records follow Step 2's closed canonical-JSON and self-hash rules.
Unknown fields, enum values, states, commands, tools, effects, references, or hashes
fail validation.

## Skill admission, not prompt discovery

A skill is an admitted supply-chain item. A model cannot create, enable, upgrade,
alias, or grant permissions to a skill by emitting text that resembles a skill or
command.

`SkillAdmissionV1` contains exactly:

```text
SkillAdmissionV1 = {
  schemaVersion: "skill-admission-v1",
  skillId,
  skillVersion,
  displayName,
  sourceIdentity,
  sourceRevision,
  packageHash,
  instructionHash,
  executableAssetHashes[],
  inputSchemaHash,
  outputSchemaHash,
  allowedTaskClasses[],
  requiredCapabilities[],
  requestedToolGrants[],
  allowedDataClasses[],
  contextPolicyHash,
  budgetClassId,
  compatibleRoutePolicyHashes[],
  promptTemplateHashes[],
  telemetryPolicyRef,
  retentionPolicyRef,
  provenanceAndLicenseRef,
  killSwitchRef,
  ownerAssignmentRefs[],
  admission: "disabled" | "fixture-only" | "evaluation-only" | "enabled",
  effectiveAt,
  expiresAt?,
  admissionHash
}
```

Rules:

- The provider-offline first slice may contain `fixture-only` records with no
  executable assets and empty requested tool grants. It cannot contain an enabled
  skill.
- A future enabled skill requires exact source/revision, license/provenance,
  permission review, input/output schemas, route compatibility, prompt-injection
  suite, current owners, kill switch, expiry, and implementation authorization.
- `ownerAssignmentRefs` contains at least one current, unexpired, unrevoked
  `OwnerAssignmentV1`. An unowned, expired, or revoked skill cannot be admitted,
  selected, parsed through a bound command, or invoked.
- `executableAssetHashes` lists every script/binary/module the skill could reach.
  An unlisted asset or dynamic download is prohibited.
- Prompt templates are untrusted build inputs until admitted. Template text cannot
  add system authority, tools, providers, routes, data classes, effects, or budget.
- The ONE BOX-owned kill switch disables admission before parsing or invocation and
  does not need the skill, package, model, or provider to be healthy.
- A skill update is a new version and hash. No invocation or receipt changes in
  place to point to new bytes.

## Permission intersection

The effective skill permission is the intersection of:

```text
current implementation authorization
∩ project and actor capability policy
∩ route policy
∩ admitted skill request
∩ assignment grant
∩ tool-specific data/path/destination policy
```

Omission means empty, never inherit. A parent/child or composite skill applies the
same intersection at every edge; a child cannot gain a provider, model, effort,
tool, path, destination, data class, budget, effect, or authority absent from the
parent and current assignment.

Tool/effect classes stay separate:

| Class | Meaning | Model/skill availability in this packet |
|---|---|---|
| `read` | Read an admitted immutable context/artifact reference | contract-only fixture |
| `propose` | Emit a typed non-authoritative proposal | contract-only fixture |
| `mutate` | Change project/source state | prohibited |
| `external-effect` | Network, message, provider action, publish, or other external change | prohibited |
| `credential` | Access or use a credential/lease | prohibited |
| `authority` | Approve, accept risk, grant access, release, deploy, or change policy | never available to a model or skill |

Filesystem, shell, browser, network, credentials, MCP/apps/connectors, memory write,
background process, collaboration, deployment, release, and Page IR mutation are
not implicit subtypes of `read` or `propose`. They require separate capabilities
and remain prohibited in the proposed first slice.

## Slash-command contract

A slash command is a user-interface shortcut to one exact admitted skill. It is not
a shell, URL scheme, path, plugin discovery mechanism, or model-interpreted command.

`SlashCommandEntryV1` contains exactly:

```text
SlashCommandEntryV1 = {
  schemaVersion: "slash-command-entry-v1",
  commandName,
  aliases[],
  skillAdmissionHash,
  inputSchemaHash,
  helpText,
  admission: "disabled" | "fixture-only" | "enabled",
  killSwitchRef,
  ownerAssignmentRefs[],
  effectiveAt,
  expiresAt?,
  commandHash
}
```

`SlashCommandRegistryV1` binds its exact ordered command-entry hashes, the closed
reserved-name policy hash, a ONE BOX-owned registry kill switch, effective/expiry
times, owner assignments, and registry hash. Each command entry also has its own
ONE BOX-owned kill switch. Registry, entry, or bound-skill kill is checked without
reading skill bytes and rejects before grammar success.

Closed grammar:

- `commandName` and every alias match `^[a-z][a-z0-9-]{0,31}$`.
- The parser consumes the entire composer payload as exactly one invocation. It
  begins with exactly one `/`, one registered name, then either end of input or one
  ASCII space followed by UTF-8 user text. Any newline, second command-shaped line,
  or extra leading slash rejects the whole action.
- The remaining user text is one typed input field. It is not split into shell
  flags, environment assignments, redirects, paths, URLs, or nested commands.
- Backticks, `$()`, semicolons, path separators, URLs, plugin IDs, and additional
  `/` characters are never executable grammar. The first contract's closed input
  schemas reject them as executable fields. No newline is accepted anywhere in the
  payload.
- Unknown, disabled, expired, duplicate, or ambiguous names/aliases are rejected
  before route validation. Registration itself fails on case-folded collisions.
- Registration and parse fail when `commandName` or any alias matches a reserved
  product command under the same case-folding rule used for collisions. The closed,
  versioned reserved-name policy hash is included in the command-registry hash.
- Retrieved content, pasted/free text, model output, and another skill cannot invoke
  a slash command. Only a current authenticated actor selecting the explicit
  command control and submitting that selection can invoke one; merely sending text
  beginning with `/` is insufficient.

Every command has at least one current, unexpired, unrevoked owner assignment.
`inputSchemaHash` equals the bound skill input schema or names a closed, proven
restriction of it. Neither schema in this packet admits a filesystem path, URL,
shell token, environment assignment, redirect, or plugin ID as an executable field.

`SlashCommandInvocationV1` contains actor/project/job IDs, exact command-registry
hash, command hash, raw input hash, parsed input hash, timestamp, and invocation
hash. Parsing never dispatches. It produces a skill-selection draft that must pass
the full Step 2 intent, permission, context, and budget flow.

## Skill set and invocation

`SkillSetV1` is an ordered list of exact admission hashes plus a set hash. The first
contract allows one primary skill and zero child skills. Future composition must
declare a finite directed acyclic graph, maximum depth, maximum invocation count,
and per-edge permission intersection before validation. Cycles, dynamic discovery,
unbounded fan-out, and undeclared children are rejected.

`SkillInvocationIntentV1` contains exactly:

```text
SkillInvocationIntentV1 = {
  schemaVersion: "skill-invocation-intent-v1",
  jobId,
  segmentId,
  invocationId,
  actorId,
  projectId,
  skillAdmissionHash,
  selectionSource: "direct" | "slash",
  slashInvocationHash?,
  inputHash,
  routePolicyHash,
  contextBundleHash,
  effectiveToolGrantHash,
  segmentManifestHash,
  budgetReservationId,
  parentInvocationId?,
  depth,
  createdAt,
  intentHash
}
```

The intent is created only after Step 2 reservation. `budgetReservationId` therefore
already exists and must match the segment manifest. The manifest must be the reserved
manifest for `(jobId, segmentId)` and resolve the exact immutable segment intent.
`skillAdmissionHash` must be a member of that intent's `SkillSetV1`; `routePolicyHash`
and `contextBundleHash` equal the frozen segment hashes; and
`effectiveToolGrantHash` equals the frozen grant or a recorded closed intersection
subset of it. Any mismatch fails closed before invocation and emits no invocation
receipt. `depth` is zero in the first contract. Any future parent/child relation
binds both IDs and the parent grant; duplicate `(segmentId, invocationId)` replays
the existing receipt.

`selectionSource: slash` requires the exact `slashInvocationHash` produced by the
authenticated command selection and keeps that binding for the full segment;
`selectionSource: direct` forbids the field. The control plane derives the source
from the admitted UI selection record, not actor/model text. Dropping or fabricating
a used command binding invalidates the intent.

Hash membership is identity, not a liveness waiver. Parse and intent creation also
require the current command and bound skill to be `fixture-only` in this proposed
slice (or `enabled` only after later authorization), unexpired, unrevoked, unkilled,
and currently owner-bound. Invocation, dispatch, and proposal-HITL completion also
require `now < ContextBundleV1.expiresAt` and every included fragment's freshness,
rights, and expiry checks to remain current. Any live-gate failure cancels or rejects
without invoking; unchanged hashes do not override expiry or revocation.

## Context authority and layering

Context is data, not instruction authority. The future message builder maintains
four physically distinct layers:

1. accepted product/system policy from exact policy hashes;
2. authenticated actor task and accepted human decision records;
3. admitted skill instructions from the exact skill admission;
4. context fragments and prior model/tool output, all labeled untrusted data.

No lower layer is concatenated into, templated as, or assigned the role of a higher
layer. Quoted instructions in a document, tool result, model output, HTML/Markdown,
comment, or previous transcript cannot change route, tools, skill, budget, source
authority, approval, or release state.

## `ContextFragmentV1`

Each fragment contains exactly:

```text
ContextFragmentV1 = {
  schemaVersion: "context-fragment-v1",
  fragmentId,
  sourceKind: "accepted-policy" | "actor-task" | "human-decision" |
    "skill-instruction" | "project-artifact" | "evidence" |
    "prior-receipt" | "prior-output",
  sourceIdentity,
  sourceVersion,
  sourceHash,
  boundedRange?,
  authorityClass: "policy" | "human-task" | "human-decision" |
    "skill-instruction" | "untrusted-data",
  dataClass,
  inclusionPurpose,
  contentRef,
  contentHash,
  normalizedBytes,
  estimatedTokens,
  freshnessPolicyRef,
  rightsPolicyRef,
  fragmentHash
}
```

`contentRef` resolves only through an admitted immutable local artifact boundary.
It is not a URL, filesystem path supplied by a user/model, browser handle, database
query, or provider object ID. Resolution must reproduce `contentHash` and byte
count through no-follow regular-file or equivalent immutable reads before packing.

`boundedRange` has an exact source-specific closed schema. It cannot expand after
hashing. A missing range means the entire already-bounded content object, not an
unbounded source.

The source/authority mapping is closed:

| `sourceKind` | Required `authorityClass` |
|---|---|
| `accepted-policy` | `policy` |
| `actor-task` | `human-task` |
| `human-decision` | `human-decision` |
| `skill-instruction` | `skill-instruction` |
| `project-artifact`, `evidence`, `prior-receipt`, `prior-output` | `untrusted-data` |

Any other pair is rejected before packing. In particular, quoted project, evidence,
receipt, or model bytes can never be relabeled as policy or skill instructions.

Restricted and confidential public-submission data are prohibited. Confidential
data remains denied unless a later provider-connected contract explicitly accepts
the routed purpose; the provider-offline fixture uses Public/Internal synthetic
data only.

## `ContextBundleV1`

```text
ContextBundleV1 = {
  schemaVersion: "context-bundle-v1",
  bundleId,
  projectId,
  actorId,
  policyFragmentHashes[],
  taskFragmentHash,
  humanDecisionFragmentHashes[],
  skillInstructionFragmentHashes[],
  untrustedDataFragmentHashes[],
  orderedMaterializationHashes[],
  contextPolicyHash,
  maximumBytes,
  maximumTokens,
  actualBytes,
  estimatedTokens,
  excludedFragmentReceipts[],
  createdAt,
  expiresAt,
  bundleHash
}
```

Rules:

- Every fragment appears exactly once in its matching authority-class list and
  exactly once in `orderedMaterializationHashes`. Unknown, omitted, or duplicate
  hashes fail validation.
- Policy, actor-task, accepted human-decision, and admitted skill-instruction
  fragments are mandatory for the applicable route and cannot be excluded.
- The message builder materializes by the closed context policy, not by model
  preference. Ordering, separators, labels, encodings, and role mapping are
  deterministic and hash-bound. `orderedMaterializationHashes` must equal the one
  sequence produced by `contextPolicyHash`: closed authority-layer order followed by
  the policy's closed intra-layer sort. Any other permutation is invalid.
- Byte and token caps are both enforced before reservation/dispatch. Token count is
  an estimator observation; bytes are authoritative for ingestion safety. The
  chosen tokenizer/version is part of `contextPolicyHash`.
- Overflow never silently truncates, drops content, or asks a model to summarize
  inside the same segment. It produces no valid `ContextBundleV1`; it returns only a
  rejected `ContextReceiptV1` listing every candidate fragment and exclusion reason.
  `actualBytes` counts the exact encoded materialization, including role labels,
  separators, and framing bytes.
- A separately admitted summarization skill may produce a new artifact and receipt;
  using it creates a new fragment and bundle hash and then a new route intent.
- An expired/freshness-failed fragment invalidates the bundle. A later source change
  creates a new fragment and bundle; it never changes prior bytes.
- The user sees included/excluded source labels, data classes, byte/token estimates,
  and exclusion reasons before a paid or confidential route can validate.

## Human proposal interrupt and completion

The model, skill, driver, and worker cannot self-approve. A propose-class operation
that reaches an interrupt emits `HumanInterruptV1`:

```text
HumanInterruptV1 = {
  schemaVersion: "human-interrupt-v1",
  interruptId,
  jobId,
  segmentId,
  invocationId?,
  intentHash,
  segmentManifestHash,
  completedAttemptHash,
  proposalEnvelopeHash,
  expectedProjectStateHash,
  expectedCandidateHash,
  issuer: "one-box-control-plane",
  issuerPolicyHash,
  reasonCode,
  requestedDecisionSchemaHash,
  safeSummary,
  createdAt,
  expiresAt,
  interruptHash
}
```

Only the ONE BOX control plane may construct this record. Model-, skill-, worker-,
driver-, provider-, and reviewer-authored interrupt objects are rejected. The
`requestedDecisionSchemaHash` resolves only to a ONE BOX-owned closed schema whose
values are `accept-proposal`, `reject`, or `cancel`; no decision schema or value can
add tools, paths, data classes, providers, routes, budgets, effects, or authority.
The control plane derives `safeSummary` from typed proposal fields rather than
accepting authored free text.

This proposal-HITL interrupt is legal only when the sole current attempt is already
`completed`, its typed proposal is schema-valid and unapplied, and no driver handle
or work remains live. The control plane atomically CASes Step 2 state from `active`
to `interrupted` with that attempt, unique interrupt, pending proposal, and expected
state hashes, then holds the reservation. Operational stop, route switch, and
provider cancellation never enter `interrupted`. No driver, worker, skill, proposal
apply, or other effect may run while interrupted. A named human may create a
separate closed decision record:

```text
HumanDecisionV1 = {
  schemaVersion: "human-decision-v1",
  decisionId,
  interruptHash,
  actorId,
  projectId,
  decisionSchemaHash,
  decisionValue,
  rationaleHash,
  policyHash,
  createdAt,
  expiresAt,
  decisionHash
}
```

`decisionValue` must be one exact value from the closed schema requested by the
interrupt. Unknown or extra decision content fails validation.

The immutable interrupt is paired with a separate closed control-plane record:

```text
InterruptDecisionSlotV1 = {
  schemaVersion: "interrupt-decision-slot-v1",
  interruptHash,
  state: "undecided" | "decided",
  decisionHash?,
  stateRevision,
  previousSlotHash?,
  updatedAt,
  slotHash
}
```

The control plane atomically creates each immutable `HumanInterruptV1` with exactly
one genesis slot keyed uniquely by `interruptHash`. Genesis is `undecided`, has
`stateRevision: 0`, and forbids both `decisionHash` and `previousSlotHash`; a genesis
`decided` row or second chain for the same key is invalid. The only legal mutation is
one CAS on that chain from `undecided` to `decided`, with the prior genesis hash and
one decision hash. No reverse, fork, second head, or second decision transition
exists. Concurrent/later decisions and any other interrupt for the segment cannot
complete or terminal it. The Step 2 `active -> interrupted` CAS stores this unique
interrupt hash as the sole decision authority.

Completion rules:

- the decision actor must be currently authorized and cannot be the model, skill,
  worker, provider, or audit reviewer;
- interrupt, decision, segment intent, route, context, skill set, tools, budget,
  deadline, and expected project/candidate state must still match;
- `reject`, `cancel`, expiry, revocation, mismatch, or stale expected state CASes the
  interrupted segment to `cancelled`, reconciles the reservation, and emits a
  terminal receipt without the proposed effect;
- `accept-proposal` CASes the same segment directly from `interrupted` to `completed`
  only when the bound attempt is already completed, the pending proposal and every
  bound hash match, the context/interrupt/deadline are unexpired, authorization and
  ownership remain current, the reservation remains held, and all kill switches are
  off. For `selectionSource: slash`, the bound command entry and its registry must
  remain unexpired, unrevoked, unkilled, and owner-bound. The skill admission,
  context bundle/fragments, interrupt, and decision must meet the same live gates.
  Any expiry/revocation cancellation wins a race with acceptance;
- acceptance creates no attempt, dispatch, route change, apply, approval, release,
  or other effect. Any route/context/skill/tool/budget/deadline/expected-state change
  cancels the old segment and requires a new one;
- a terminal segment can never resume, and completion never revives, rewrites, or
  replaces a terminal receipt;
- runtime checkpoint deletion cannot delete the interrupt/decision/receipt evidence.
  A future persistent control plane must reconstruct from ONE BOX records; the
  provider-offline in-memory fixture cannot claim durability.

Human approval of a proposal still does not authorize Page IR apply or release.
Those remain separate guarded product actions under their existing contracts.

## Adjacent receipt bundle

The future compatibility design has one terminal job receipt owner. It may bind
supplemental receipts through `ReceiptBundleManifestV1`:

```text
ReceiptBundleManifestV1 = {
  schemaVersion: "receipt-bundle-manifest-v1",
  jobId,
  foundationJobReceiptHash,
  routeSegmentReceiptHashes[],
  skillInvocationReceiptHashes[],
  contextReceiptHashes[],
  interruptHashes[],
  decisionHashes[],
  proposalEnvelopeHashes[],
  createdAt,
  bundleHash
}
```

The `foundationJobReceiptHash` references exactly one schema-valid terminal receipt
from the frozen job contract. Supplemental receipts cannot change its outcome,
output hashes, timestamps, effect class, or retry eligibility. A mismatch makes the
bundle invalid; it never repairs or replaces the foundation receipt.

The provider-offline contract fixture uses a synthetic foundation receipt fixture
with an explicit non-production schema ID. It cannot be presented as a receipt
from the frozen runtime.

## `RouteSegmentReceiptV1`

```text
RouteSegmentReceiptV1 = {
  schemaVersion: "route-segment-receipt-v1",
  jobId,
  segmentId,
  parentSegmentReceiptHash?,
  segmentIntentHash,
  segmentManifestHash?,
  finalSegmentStateHash,
  routePolicyHash,
  requestedProviderEntryHash,
  requestedModelEntryHash,
  requestedEffort,
  reportedProviderIdentity?,
  reportedModelIdentity?,
  contextBundleHash,
  skillSetHash,
  toolGrantHash,
  skillInvocationReceiptHashes[],
  budgetReservationId?,
  attemptHashes[],
  terminalState: "completed" | "rejected" | "failed" |
    "cancelled" | "budget-exhausted",
  failureClass?,
  outputArtifactHash?,
  proposalEnvelopeHash?,
  partialOutputHash?,
  interruptHash?,
  decisionHash?,
  startedAt?,
  endedAt,
  receiptHash
}
```

Terminal invariants:

- `completed` requires a manifest, at least one completed attempt, exact reported
  identity where the route requires it, a schema-valid output artifact, and either
  one typed proposal envelope or an explicitly declared no-proposal output contract.
  Every `completed` receipt with `proposalEnvelopeHash` requires the bound unique
  `interruptHash` and `decisionHash`, and that decision must resolve to
  `decisionValue: accept-proposal`; no non-HITL completed/proposal combination is
  valid.
- `rejected` permits no attempt, output, proposal, reported provider/model identity,
  or `startedAt`. A pre-reservation rejection has no manifest/reservation.
- `cancelled` may have zero attempts before dispatch. A post-dispatch cancellation
  lists attempts and safe partial-output hash only; it has no proposal envelope.
- `failed` lists every attempt and failure class. It has no proposal envelope or
  apply-shaped output. Ambiguous execution retains the reservation pending
  reconciliation and records only safe opaque provider references.
- `budget-exhausted` records the exact cap/stopping reason in the linked budget
  receipt and may contain only a safe partial-output hash.
- Every non-completed terminal state has no `proposalEnvelopeHash` and no output
  matching an apply-shaped proposal schema. Unknown/mixed terminal combinations
  fail validation. The non-terminal `interrupted` state has no segment receipt. Its
  only next legal CAS is `interrupted -> completed|cancelled`, which creates the
  terminal receipt and never returns to `active` or creates another attempt.

## Skill, context, and proposal receipts

`SkillInvocationReceiptV1` binds invocation intent hash, admission hash, segment
intent and manifest hashes, input/output schema hashes, effective tool grants, child receipt
hashes, terminal state, output artifact hash if complete, failure reason, start/end,
and receipt hash. It never references the final route-segment receipt. A child hash
not declared by the intent is invalid.

`ContextReceiptV1` binds context policy, included/excluded fragment hashes,
materialization hash, byte/token observations, data-class result, rejection reasons,
created/expiry times, and receipt hash. It stores no raw confidential content.

`ProposalEnvelopeV1` contains exactly:

```text
ProposalEnvelopeV1 = {
  schemaVersion: "proposal-envelope-v1",
  proposalId,
  jobId,
  segmentIntentHash,
  segmentManifestHash,
  skillInvocationReceiptHash?,
  proposalSchemaHash,
  targetProjectId,
  expectedSourceIdentity,
  expectedSourceHash,
  effectClass: "propose",
  proposalArtifactHash,
  createdAt,
  expiresAt,
  proposalHash
}
```

The final `RouteSegmentReceiptV1` binds the skill receipt and proposal envelope
hashes. Neither the skill receipt nor proposal envelope references that final
segment receipt, so the hash graph is acyclic.

The envelope is untrusted input to the existing guarded proposal/apply boundary.
It cannot carry credentials, executable Page IR, raw code authority, approval,
risk acceptance, deployment, release, or automatic mutation. Expired/stale target
identity rejects apply without changing the current candidate.

Apply eligibility requires a schema-valid `completed` `RouteSegmentReceiptV1` whose
`proposalEnvelopeHash` equals this envelope and whose segment intent/manifest hashes
equal the envelope bindings. That completed receipt must contain the unique
interrupt/decision hashes whose decision resolves to `accept-proposal`. It also
requires a schema-valid
`ReceiptBundleManifestV1` for the same `jobId` whose `routeSegmentReceiptHashes`
contains that completed receipt hash and whose `foundationJobReceiptHash` resolves
to the unique frozen-contract terminal job receipt. A failed,
cancelled, rejected, budget-exhausted, interrupted, orphaned, stale, or mismatched
envelope is never apply-eligible. This reverse lookup preserves the acyclic hash
graph; the envelope still does not reference the final segment receipt.

## Receipt redaction and retention

- Repository-normalized receipts contain hashes, classifications, bounded counts,
  opaque attempt IDs, and safe reason codes only.
- Raw prompts, provider responses, confidential fragments, user submissions,
  credentials, session material, and provider error bodies do not enter receipts or
  version control.
- A later provider route requires the restricted external evidence-store owner,
  access logs, retention expiry, deletion receipt, and repository raw-payload census
  before it can enable raw request/response retention.
- Telemetry is denied unless a separately admitted export policy names exact fields,
  destination, purpose, data classes, retention, regions, owner, and kill switch.

## Acceptance criteria

`OBX-P180-S3` is acceptable only when:

1. skills and commands are exact, versioned, hash-bound, owner-bound,
   deny-by-default supply-chain items with an external kill switch;
2. slash parsing cannot become shell/path/URL/plugin execution, and only an explicit
   authenticated actor action can invoke a command;
3. tool/effect permissions are intersected at every skill/composition edge and no
   model or skill can receive authority-class capability;
4. context authority layers remain separate, fragments are bounded/provenanced/
   classified, packing is deterministic, and overflow/freshness fail closed;
5. Restricted/public-submission data and untrusted instructions cannot enter or
   alter route, tool, skill, approval, mutation, or release authority;
6. proposal-HITL interruption requires a completed attempt, one CAS-bound interrupt
   and decision slot, current live gates, and direct completion or cancellation; it
   cannot resume work or change route/context/skill/tool/budget in place;
7. exactly one frozen-contract terminal job receipt remains authoritative, while
   supplemental segment/skill/context/decision/proposal receipts are immutable
   adjacent evidence;
8. terminal receipt combinations are closed and non-completed segments cannot
   produce an apply-eligible proposal;
9. the exact Grok 4.6 audit binds this file's current bytes and has no unresolved
   BLOCK, HIGH, or MEDIUM finding.

Passing Step 3 supplies planning input only. It authorizes no new runtime schema,
skill, command, tool, provider, credential, persistence, memory, browser,
collaboration, Page IR mutation, deployment, or release behavior.
