# ONE BOX program evaluation strategy

- Status: planning baseline; implementation authorization remains phase-specific
- Date: 2026-08-29
- Scope: intake through monitoring and re-delivery, including Canvas and sequenced expansions

> Audit status (2026-08-29): the exact Grok 4.6 lane was unavailable after the
> first phase timed out. The owner-authorized OAuth fallback produced one
> `REVISE` review; its findings were dispositioned in this packet without a
> second model pass. The review is evidence, not authority. See
> [fallback audit](../../audits/grok-4.6/2026-08-29-program-evaluation-strategy-opus-5-fallback-audit.md).

## Evaluation contract

Every normative requirement must map to a stable evaluation ID, a ticket, an
evaluation owner, a fixture or environment, a method, a blocking rule, and an
evidence-retention class before its ticket can become `ready`. A command name is
not an evaluation: the oracle must say what constitutes PASS, FAIL, BLOCKED, and
NOT_RUN.

Results are bound to the exact commit, source authority, candidate or release
identity, fixture/manifest version, toolchain, environment, and policy version.
Stale evidence is not inherited across changed bytes or changed policy.

Models may challenge a packet and explain failures. They cannot manufacture a
mechanical pass, approve visual quality, accept risk, or authorize release.

## Result vocabulary

- `PASS`: the named oracle ran against the named immutable target and satisfied
  every blocking assertion.
- `FAIL`: the oracle ran and at least one blocking assertion failed.
- `BLOCKED`: prerequisite, environment, authorization, or reliable measurement was
  unavailable. This is not a pass.
- `NOT_RUN`: no attempt was made. This is not a pass.
- `INVALIDATED`: a prior result no longer applies because target bytes, policy,
  fixture, toolchain, environment, or its declared expiry changed. It is not a
  pass and a blocking evaluation must run again.

Every receipt also declares `blocking` or `advisory`; advisory never silently
becomes a release gate. An evaluation can be advisory, but its result must still use this vocabulary.
Only a named human can record a human-review result, and the author cannot be the
sole accepting reviewer where the risk matrix requires independence.

## Test and evidence tiers

| Tier | Trigger | Maximum duration | Required scope | Blocks |
|---|---|---:|---|---|
| T0 local | every changed ticket before handoff | 15 minutes target | focused unit/contract, typecheck of touched boundaries, diff hygiene | ticket handoff |
| T1 pull request | every PR and every update to its final diff | 25 minutes target | plan authority, unit, contract, integration, lint, build, merge-blocking rendered Page IR | merge |
| T2 scheduled | nightly or explicit high-risk run | 90 minutes target | full smoke/Canvas/accessibility/motion/eval suites, concurrency and fault injection, dependency/security scans | release candidate, not ordinary low-risk merge unless linked |
| T3 release candidate | every immutable RC | bounded by release plan | production-like deployment, accessibility, SEO, performance, visual review, migration/recovery, security, SBOM, rollback | release authorization |
| T4 production verification | every controlled rollout and re-delivery | observation-window bound | exact public-origin bytes, runtime adapters, telemetry/cost, synthetic journeys, rollback readiness | rollout continuation |
| T5 operational drill | scheduled and after material incidents | plan-specific | backup/restore, provider outage, secret/revocation, desktop update/rollback, tenant deletion, incident response | support-window continuation |

The duration values are run-time targets, not permission to skip work. A suite
that exceeds its target is split or optimized while preserving coverage.

## Current executable baseline

The following commands exist in the inspected repository. “Configured T1” means
the checked-in [CI workflow](../../../.github/workflows/ci.yml) names the command;
it does not prove the remote branch rules, a successful hosted run, or required
review enforcement. Local/manual means no checked-in merge-blocking claim.

| Concern | Current command or artifact | Present tier | Intended tier |
|---|---|---|---|
| Unit/state/contract | `npm test` | T0/T1 | T0/T1 |
| Type safety | `npm run typecheck` | T0/T1 | T0/T1 |
| Static lint | `npm run lint` | T0/T1 | T0/T1 |
| Production bundle | `npm run build` | T1 | T1 |
| Plan authority | `npm run verify:plans` and `npm run test:plans` | configured T1; remote run unverified | T1 |
| Generated-site deterministic gates | `npm run test:smoke` | local/manual | T2 and linked PRs |
| Intake and preview | `npm run test:e2e:page-ir` | T1 | T1 |
| Canvas breadth | `npm run test:e2e:canvas` | local/manual | T2 and Canvas PRs |
| Canvas interaction contract | `npm run test:e2e:canvas-contract` | local/manual | T2 and Canvas PRs |
| Rendered accessibility | `npm run test:e2e:canvas-contract:axe` | local/manual | T2 and UI PRs; T3 |
| Motion behavior | `npm run test:e2e:motion` | local/manual | T2 and motion PRs |
| Integrated token/motion | `npm run test:e2e:token-motion` | local/manual | T2 and motion PRs |
| Full-run state machine | `npm run test:e2e:full-unit` | local/manual | T2 |
| Offline evaluation harness | `npm run test:eval` | local/manual | T2 |
| Frozen Page IR corpus | `npm run eval:page-ir` | local/manual | T2/T3 |
| Frozen baseline integrity | `npm run eval:baseline:verify` | local/manual | T2/T3 |

The workflow configures `verify:plans` and its negative tests in T1. Its
acceptance evidence must include both a passing current-tree run and a deliberate
authority/traceability drift that the script rejects; remote enforcement remains
unverified until a hosted receipt and branch-rules evidence are linked.

## Required evaluation families

### PROG-EVAL-AUTH: authority and traceability

Prove the master front door resolves one domain authority, draft/audit evidence
cannot masquerade as approval, every current packet hash is discoverable, every
requirement maps to eval and ticket, and no ticket marked `ready` has unresolved
dependencies or missing Definition-of-Ready fields.

### PROG-EVAL-LIFE: lifecycle and re-delivery

Prove intake, evidence, private candidate, Canvas mutation, client review,
qualification, release, deployment, monitoring, rollback, and re-delivery bind
one candidate/release chain and fail closed on stale or ambiguous state.

### PROG-EVAL-IR: source and compiler authority

Inherit the frozen Page IR manifest and corpus. Prove one source mode per run,
closed schema, deterministic static output, stable edit identity, guarded mutation,
gate-before-publish, atomic promotion, and no executable payload in Page IR.

### PROG-EVAL-CANVAS: designer workflow and human quality

Prove selection, hierarchy, responsive view, history, diff, restore, asset and
typed mutation behaviors mechanically. Separately, a named designer reviews the
brief and reference fidelity on desktop, tablet, and mobile. Axe, screenshots,
pixel diffs, or model critique cannot approve taste.

### PROG-EVAL-CLIENT: client review and collaboration

Prove candidate-locked invitations, guest least privilege, revocation, stale
approval invalidation, comment provenance, actor/event integrity, conflict
handling, optional-cursor privacy, screen-share boundaries, and transcript consent.

### PROG-EVAL-SEC: security and privacy

Execute the threat-model oracles explicitly listed for the ticket; the author
cannot self-declare a domain inapplicable. The manifest splits tenant/shared
mutation, desktop/browser, agent/model, client/media, and ExperienceModule
boundaries into separately owned evaluations. Each receipt pins the normative
threat-model version and enumerated threat IDs. A P0/P1 finding blocks the phase.

For `PROG-EVAL-SEC-AGENT-001`, use the versioned
[`agent-routing-adversarial-corpus-v1`](fixtures/agent-routing-adversarial-corpus-v1.json).
It covers implicit parent/subagent tool inheritance, prompt injection, path escape,
data canaries, hidden or less-private fallback, undeclared telemetry, budget and
cancellation, human interruption, runtime-checkpoint deletion, ONE BOX state
reconstruction, and clean removal. Persistent teammate identity is role and
handoff context only: it cannot imply a running process, standing permission,
budget, provider route, authoritative state, or approval. Runtime state is
disposable and may never become the source of project truth.

The completed [Deep Agents JavaScript spike](deepagents-js-spike-results-2026-08-29.md)
is current research evidence for this fixture. T1 through T11 passed in the
external synthetic repository, but the comparative result was `adapt-patterns-only`;
it neither satisfies this planned release evaluation nor authorizes an application
dependency.

### PROG-EVAL-COMPAT: compatibility and recovery

Run the accepted OS/browser/device/source-mode/artifact/API/provider matrix,
including unsupported and version-skew states. Prove backup/restore, crash resume,
deploy rollback, re-delivery rollback, and later desktop update/downgrade where
applicable.

### PROG-EVAL-QUAL: agency-grade release quality

Use the immutable release candidate to evaluate accessibility, SEO, structured
data, metadata, link and asset integrity, performance budgets, responsive layout,
forms/runtime adapters, privacy/consent, security headers, copy and content
completeness, visual quality, deployment conformance, and runbooks.

Quantitative product-quality targets that lack current baselines are not invented
here. The owner records the target after the fixed corpus is measured on the
supported hardware/network profile; the fixture, metric, percentile, sample size,
and regression tolerance are then frozen before implementation claims success.
The inherited Page IR manifest is pinned by SHA-256 in the program manifest. Its
thresholds remain in force only for the exact pinned bytes. A changed inherited
manifest invalidates dependent results and requires an explicit re-pin plus a
new acceptance receipt; program receipts identify which inherited evaluation IDs
ran rather than re-reporting them under new IDs.

### PROG-EVAL-OPS: production and agency operations

Prove health checks, monitoring, alert ownership, public synthetic journeys,
provider reconciliation, cost attribution, backup/restore, incident response,
domain and credential ownership, support access, client export/offboarding,
maintenance cadence, dependency response, and evidence refresh.

### PROG-EVAL-APPT: appointment independence

Use the appointment PRD's separate suite. Add website/appointment version-skew,
revocation, rollback, re-delivery, duplicate/timeout replay, and runtime-downshift
tests. Website success never supplies appointment acceptance.

## Human evaluation protocols

### Named-human visual review

The reviewer sees the brief, evidence, candidate ID, and fixed 1440x900, 768x1024,
and 390x844 captures plus a live keyboard/screen-reader-capable preview. They score
brief fidelity, hierarchy, typography, spacing/rhythm, imagery, interaction,
responsive intent, credibility, differentiation, and production polish. The
receipt includes reviewer identity, timestamp, candidate hash, rubric version,
notes, and `approve`, `revise`, or `blocked`.

### Agency-designer usability study

Before the expanded shell is accepted, representative agency designers complete
five fixed journeys: intake and evidence, generate-to-Canvas, precise edit and
recovery, client review resolution, and release/rollback/re-delivery. Record task
completion, time, errors, recovery, discoverability, confidence, assistance, and
qualitative findings. Results set the first defensible usability targets.

### Client-review usability study

Representative reviewers open one candidate-scoped invitation, understand what is
and is not live, comment on an exact target, approve/request changes, recover from
an expired or revoked link, and understand recording/screen-share state. Agency
controls, model settings, deployment, unrelated projects, and secrets must remain
undiscoverable and inaccessible.

## Non-functional measurement protocol

Every performance, reliability, cost, or quality claim records:

1. immutable target and fixture version;
2. supported hardware, OS, browser/runtime, viewport, network and throttle profile;
3. warm/cold state and cache policy;
4. sample count, percentile, variance, and excluded-run rule;
5. exact tool/version and raw evidence path;
6. target, regression tolerance, owner, and expiry;
7. PASS/FAIL/BLOCKED/NOT_RUN.

Do not compare results collected under different fixed conditions as one trend.

## Evidence retention

| Evidence | Retention rule |
|---|---|
| Merge receipts and normalized audit findings | repository history or linked durable store for product lifetime |
| Raw model/audit request and response | proposed restricted external evidence store; 90 days by default; security/data owner controls deletion and access logging; no repository raw-response file satisfies this class |
| Release/rollback and security evidence | support lifetime plus contractual/legal window |
| Client files, recordings, and transcripts | no collection until project contract records legal basis, maximum period, access roles, deletion owner, and legal-hold behavior |
| Synthetic fixtures and corpus manifests | versioned indefinitely while a supported release depends on them |
| Local scratch, worker files, unredacted logs | delete after bounded job/diagnostic window |

## CI and release policy

- T1 is the target merge-blocking, credential-free policy. The checked-in
  workflow configures the commands, but the current remote ruleset does not
  require an approving review and this packet does not change that external state.
- Paid/live/provider tests require explicit operator intent and a budget receipt;
  absence is BLOCKED, never simulated success.
- High-risk changes add their relevant T2 security, fault, and compatibility suite
  before `ready`; they do not wait until the release candidate to design an oracle.
- A rerun never erases an initial failure. A test is classified flaky only when
  the same immutable target and fixed environment alternate outcomes across three
  controlled attempts and an incident records the raw evidence. Quarantine is a
  reviewed manifest entry under `docs/eval/quarantine/`, lasts at most seven days,
  names owner, incident, compensating gate, restoration ticket, and exact test,
  and cannot cover a P0/P1 security, tenant-isolation, data-loss, release-integrity,
  or appointment-authority oracle. At most five tests or five percent of a suite,
  whichever is smaller, may be quarantined; exceeding the cap blocks the tier.
- A release candidate has zero unresolved P0/P1 findings, complete blocking T3
  evidence, one non-author technical verification, and named human visual and
  release decisions.
- Every re-delivery is a new release candidate and follows the same qualification;
  a “small content change” does not inherit stale evidence when its target changed.

## Reviewer availability and freshness

A current model-review receipt is bound to the exact packet SHA-256 and policy
version and is created after those bytes. Changed bytes invalidate it. For packets
where Grok 4.6 is required, the exact lane is attempted once. If it errors or
times out, only an explicit owner authorization may permit one named OAuth fallback;
the artifact must retain the failed request, identify the actual fallback model,
and must never be labeled Grok evidence. The owner still dispositions findings;
neither review grants implementation authority.

## Independence and risk exceptions

Non-author verification is non-waivable for authentication/authorization,
tenant isolation, untrusted browser or file input, secrets/privacy, migrations
with loss risk, release/rollback, appointment authority, and any release candidate.
Other exceptions require a reasoned record under `docs/governance/risk-exceptions/`,
one named owner, compensating evidence, and an expiry of at most fourteen days;
they cannot be renewed without a new independent decision. The registry and
escalation owner must exist before an affected ticket can become `ready`.

## Current gaps and sequencing

The existing Page IR suite is the strongest executable evidence and remains
authoritative for its scope. Program-level authority verification, collaboration,
hosted tenancy, desktop/browser isolation, provider conformance, production
operations, supply-chain enforcement, and re-delivery drills are planned oracles,
not current passes. Their tickets remain proposed or blocked until their parent
contracts are accepted and test fixtures exist.
