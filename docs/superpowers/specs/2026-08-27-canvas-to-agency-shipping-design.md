# ONE BOX Canvas-to-agency-shipping lifecycle

- **Status:** owner-approved design direction; written-spec review pending
- **Date:** 2026-08-27
- **Product boundary:** website generation, designer refinement, client review, release qualification, deployment, and post-launch monitoring
- **Implementation status:** not authorized by this document

## 1. Decision

ONE BOX uses one controlled website lifecycle with three product phases:

1. The generation pipeline turns approved evidence and project direction into a near-shippable website candidate.
2. Designers refine that candidate in Canvas and iterate with the client against private, immutable candidate versions.
3. The release pipeline qualifies the client-locked candidate, obtains final release approval, deploys an immutable bundle, verifies the public origin, and starts monitoring.

Canvas is the human judgment layer between automated generation and automated shipping. It is not a direct editor for live production files. The release pipeline does not replace design judgment, and Canvas cannot bypass release gates.

The appointment-acquisition capability participates in this lifecycle as one versioned site capability. ONE BOX may prepare and preview its public handoff during design, but the appointment PRD retains authority over evidence, public promise, target approval, signed publication, runtime downshift, and blocking.

## 2. Relationship to existing contracts

This design connects four existing product contracts without weakening them:

- The production Page IR and safe candidate pipeline owns deterministic generation, candidate-only repair, gate-before-publish, atomic promotion, and last-known-good preservation.
- The Canvas upgrade owns selection, references, scoped chat, layout controls, preview, diff, undo, and version history.
- The appointment-acquisition PRD owns appointment evidence, classification, release artifacts, pointer serving, monitoring, and fail-closed behavior.
- This document owns lifecycle states, client review, agency qualification, deployment orchestration, and the handoffs between those systems.

Domain ownership determines precedence. The Page IR contract wins for candidate generation and promotion, the Canvas contract wins for editor interaction, the appointment PRD wins for acquisition, and this document wins for cross-system lifecycle orchestration. Constraints from other domains still apply, and a cross-domain public-safety conflict fails closed until the documents agree. This design adds a future hosted release boundary that earlier local-first documents placed out of scope. It does not select a hosting provider or authorize a deployment.

## 3. Goals

- Produce a useful first candidate whose remaining work is primarily taste, client preference, and exceptional content judgment.
- Let designers change composition, imagery, copy, tokens, responsive behavior, hover states, and bounded motion without leaving Canvas.
- Capture inspiration and references with source provenance rather than copying untracked material into a site.
- Give clients a private, version-bound review surface for comments and approval.
- Automate objective agency work before and after design review.
- Preserve a last-known-good candidate and public release through every failed edit, gate, deployment, or monitor action.
- Make every public release traceable to approved inputs, candidate hashes, gate receipts, client lock, release approval, and deployment receipt.
- Keep deployment and appointment activation reversible without allowing an old or stale artifact to reactivate itself.

## 4. Non-goals

- Models do not author arbitrary executable HTML, CSS, JavaScript, commands, filesystem paths, or deployment configuration.
- Models and clients cannot approve evidence, weaken gates, publish, deploy, or restore a blocked appointment handoff.
- Canvas does not edit the live site in place.
- Client review does not introduce a general multi-user project workspace in v1.
- ONE BOX does not own appointment inventory, confirmation, payment, or vendor transactions.
- This design does not choose Vercel, Cloudflare, Netlify, or another production provider. A provider must satisfy the deployment adapter contract before it can be authorized.
- This design does not make Web app or iOS generation a production capability.

## 5. End-to-end lifecycle

```text
approved intake and evidence
            |
            v
      automatic generation
            |
            v
   mechanically valid candidate
            |
            v
           Canvas <-------+
            |              |
            v              |
     private client review |
            |              |
     changes requested ----+
            |
       client lock
            |
            v
   full agency qualification
            |
      blocked or ready
            |
       release approval
            |
            v
    immutable deployment
            |
     public-origin checks
            |
            v
 acquisition activation and monitoring
```

The system never treats “looks good in Canvas” as “safe to ship.” It also never makes the designer rerun every mechanical check by hand. Canvas mutations trigger bounded checks during design, and the final release candidate runs the complete qualification suite.

## 6. Lifecycle states

The closed project lifecycle is:

| State | Meaning | Public effect |
|---|---|---|
| `generating` | Approved inputs are producing a candidate. | None |
| `canvas_ready` | A candidate passed entry gates and may be edited. | None |
| `designing` | Designer edits create new candidate versions. | None |
| `client_review` | One immutable candidate is available through a private review session. | None |
| `changes_requested` | Client comments require another design cycle. | None |
| `client_locked` | Client approved one exact visible and interactive experience. | None |
| `qualifying` | Full agency and deployment-readiness gates are running. | None |
| `release_blocked` | At least one blocking gate failed. | Existing public release remains unchanged |
| `ready_to_deploy` | Qualification passed and the release owner approved the exact bundle. | Existing public release remains unchanged |
| `deploying` | An immutable provider release is being created and verified. | Existing public release remains unchanged |
| `live` | The verified provider release owns the production alias. | New release served |
| `superseded` | A newer live release replaced this release. | Audit and rollback evidence only |

All state transitions use compare-and-swap over the expected project revision and candidate or release hash. A stale actor produces no state change.

### 6.1 Approval invalidation

- Any visible copy, layout, token, asset, motion, interaction, navigation, form, or appointment-presentation change invalidates the client lock.
- A deterministic, non-visible shipping repair may preserve the client lock only when its policy declares the capability non-presentational and rendered visual plus interaction fingerprints remain identical.
- Any post-qualification byte change invalidates release-owner approval and requires qualification against the new bundle.
- A new candidate never inherits approval from a prior candidate by filename, timestamp, or visual similarity.

## 7. Phase A: automatic generation

The generation pipeline consumes approved, version-bound evidence and project direction. It produces structured source artifacts, validates them, compiles a candidate, and runs Canvas-entry gates.

For a `page-ir-v1` run, Page IR remains the editable source of truth. Models may propose closed, validated Page IR inputs, but deterministic code compiles the site. For a compatible `template-v1` run, the existing guarded mutation authority remains the source of truth. The two layout authorities never merge within one run.

A candidate reaches `canvas_ready` only when:

- source contracts and references validate;
- required assets exist and match their recorded hashes;
- the site compiles without executable or path injection;
- required landmarks, editor identities, responsive structure, links, and actions validate;
- no blocking accessibility, security, privacy, or rendering defect exists;
- the candidate manifest and gate receipt bind the exact files shown in Canvas.

“Near-shippable” means the candidate has no known mechanical blocker when it enters Canvas. It does not mean the system has made the final brand, taste, or client decision.

## 8. Phase B: Canvas and client collaboration

### 8.1 Canvas responsibilities

Canvas supports:

- direct selection of sections and editable descendants;
- parent and child navigation through real page structure;
- page, breakpoint, layer, stack, flex, grid, spacing, sizing, and positioning controls;
- controlled typography, color, asset, hover, focus, and bounded-motion changes;
- reference and inspiration tabs with source URL, capture time, license note, and selected design lesson;
- selection-scoped chat that proposes typed mutations;
- preview, diff, undo, redo, and version history;
- desktop, tablet, and mobile review against the same candidate identity.

Canvas does not accept an arbitrary DOM patch as production source. Every change enters through a typed mutation capability. The mutation authority validates the proposed source change, compiles a new candidate where required, runs affected gates, and promotes it to the private Canvas view only after those gates pass.

### 8.2 Continuous checks

The capability-to-gate matrix chooses the smallest safe gate set after each Canvas mutation. Unknown or mixed capabilities run the full suite. Examples:

| Change | Required checks |
|---|---|
| Copy | evidence binding, promise strength, overflow, heading structure, accessibility |
| Asset | file integrity, rights metadata, dimensions, responsive rendering, performance |
| Tokens or layout | schema, contrast, responsive rendering, overflow, visual regression |
| Hover or motion | keyboard parity, reduced motion, performance, bounded interaction schema |
| Link or CTA | URL safety, destination semantics, analytics binding, appointment rules when applicable |
| Structure | full compile, landmarks, navigation, responsive rendering, accessibility, visual regression |

A rejected edit leaves the current Canvas candidate and its gate receipt unchanged.

### 8.3 Client review

The designer creates a review session for one immutable candidate hash. The session provides:

- an expiring, revocable, project-and-candidate-scoped access link;
- responsive preview without Canvas mutation controls;
- comments attached to stable section or element identities;
- resolved and unresolved comment state;
- “request changes” and “approve this version” actions;
- a receipt naming the candidate hash, reviewer, approval time, and unresolved-comment count.

The v1 review session does not create a general client account or expose other projects. An invitation carries one high-entropy, single-use exchange secret. The service stores only its hash, exchanges it for a short-lived Secure, HttpOnly, SameSite cookie, and redirects immediately to a URL without the secret. It sends `Referrer-Policy: no-referrer`, excludes the review origin from analytics, and rejects a host that cannot support this exchange.

Client approval moves the exact candidate to `client_locked`. An approval attempt with unresolved blocking comments or a mismatched candidate hash fails without changing state.

## 9. Phase C: agency qualification and shipping

### 9.1 Release Orchestrator

The Release Orchestrator is the sole coordinator for `client_locked` through `live`. It does not own compilation, gate logic, deployment-provider internals, or appointment classification. It invokes those modules through versioned interfaces and records their receipts.

Its inputs are:

- the client-locked candidate hash;
- current approved evidence and design-contract versions;
- the frozen gate-policy version;
- the deployment target and domain binding;
- optional appointment release references;
- the expected project revision.

Its output is either a typed blocking report or one immutable release bundle and qualification manifest.

### 9.2 Agency qualification suite

The full suite runs against the exact release bundle and covers:

1. **Integrity:** contracts, hashes, provenance, executable-content prohibition, and candidate identity.
2. **Visual quality:** required breakpoints, overflow, typography, spacing, media bounds, interaction states, and visual regression.
3. **Accessibility:** landmarks, names, keyboard operation, focus, contrast, reduced motion, forms, and serious or critical automated findings.
4. **Content truth:** approved claims, contact details, legal copy, destination meaning, and client-provided facts.
5. **Technical SEO:** titles, descriptions, canonical URLs, crawl policy, sitemap, social metadata, heading structure, structured data, image metadata, and internal-link validity.
6. **Performance:** versioned page-weight and runtime budgets, image delivery, layout stability, script behavior, and representative route measurements.
7. **Functionality:** navigation, forms, links, responsive menus, error states, analytics events, and external handoffs.
8. **Privacy and security:** secret and PII scans, unsafe URLs, headers, third-party inventory, consent requirements, and local-artifact exclusion.
9. **Appointment acquisition:** current approved release, exact copy and target, pointer compatibility, blocked presentation, and no unsupported promise.
10. **Deployment readiness:** immutable bundle, provider capabilities, domain state, rollback target, cache policy, and post-deploy probe plan.

Each rule has a stable ID, severity, affected artifact, remediation class, and proof. The qualification manifest records the frozen rule catalog and exact result set. A summary score cannot override a blocking result.

### 9.3 SEO truth boundary

ONE BOX generates technical SEO from approved project facts and page structure. It may derive canonical paths, sitemap entries, social cards, and schema shape. It may not invent reviews, ratings, credentials, opening hours, prices, service areas, staff, addresses, or other structured-data facts.

Preview and client-review origins are non-indexable. The production bundle becomes indexable only when the release policy permits it and the canonical production origin is known. A domain change requires canonical, sitemap, social, redirect, and structured-data requalification.

### 9.4 Automation classes

Every finding belongs to one of three closed classes:

- `automatic_repair`: deterministic, candidate-only, evidence-preserving, and behavior-preserving. The repair records a diff and reruns all affected gates.
- `designer_proposal`: requires taste, copy judgment, composition, asset choice, brand interpretation, or a visible behavior change. Canvas presents the proposal for acceptance or rejection.
- `release_blocker`: cannot be repaired safely from approved inputs or violates a non-negotiable gate. Shipping stops with an owner and remediation path.

An automatic repair never writes to the live site. If it changes the visible or interactive experience, the classification is invalid and the client lock must be removed.

### 9.5 Release approval

After the suite passes, a named release owner reviews:

- the client approval receipt;
- the final rendered release candidate;
- the complete qualification manifest;
- automatic-repair diffs;
- deployment target, domain, and rollback target;
- appointment copy and destination approval where enabled.

Approval binds the exact release-bundle hash. Models, clients, gate summaries, and deployment providers cannot produce this approval.

## 10. Deployment contract

ONE BOX uses one deployment adapter interface. A production adapter must support:

- upload of an immutable, content-addressed release;
- private preview without production promotion;
- production-domain binding and current-binding inspection;
- atomic promotion of one verified release to the public alias;
- cache and header control required by the release manifest;
- status and log receipts without exposing secrets;
- rollback by promoting a still-valid prior release through an authorized rollback transaction;
- post-deploy origin verification.

The product stores provider credentials in ZS Vault-backed runtime configuration. Credentials never enter site artifacts, Page IR, prompts, logs, or repository files.

Provider selection is an operational choice constrained by this interface. Adding the first production adapter or changing providers requires explicit implementation and deployment authorization. The adapter contract prevents provider-specific state from becoming the site source of truth.

### 10.1 Deployment sequence

1. Upload the immutable release under a unique provider release ID.
2. Verify its private provider URL against the release hash and smoke suite.
3. Confirm the expected production domain and current rollback target.
4. Atomically move the production alias to the verified release.
5. Verify HTTPS, headers, canonical origin, routes, assets, forms, analytics, and cache behavior from the public origin.
6. If verification fails, restore the prior valid alias and record a failed deployment receipt.
7. Mark `live` only after public-origin verification passes.

A DNS action that the provider cannot automate becomes an explicit human step with a generated instruction and a blocking verification check. Waiting for DNS never exposes an unverified release as successful.

## 11. Appointment-acquisition integration

The website release contains a typed acquisition presentation slot and the ProjectId and route bindings required by the appointment contract. It does not embed raw evidence, private contact data, or scheduler inventory.

During Canvas and client review:

- the designer sees the exact proposed CTA copy, route context, handoff mode, and destination class;
- unavailable or unresolved routes render their approved no-CTA presentation;
- the client approves the destination and public wording as part of the version-bound review;
- previews cannot issue a production CTA lease.

During shipping:

- qualification verifies that the site integration matches the approved appointment release contract;
- the site may deploy with acquisition blocked when no valid positive release exists;
- positive activation occurs only after the public origin passes deployment verification and the appointment publication workflow authorizes its signed release;
- runtime pointer changes may keep, downshift, or block the CTA without rebuilding the website;
- restoring, strengthening, changing copy, or changing the destination follows the appointment PRD's HumanRepublish path.

The site release and appointment release keep separate identities and audit trails. A website rollback cannot reactivate a stale appointment release, and an appointment downshift does not rewrite site design files.

## 12. Failure and recovery behavior

- Generation or Canvas gate failure preserves the latest accepted private candidate.
- Client-review service failure does not alter the candidate or approval state.
- Qualification failure preserves the current public release and returns the project to a repairable blocked state.
- Deployment upload failure has no public effect.
- Promotion or public-origin verification failure restores the prior valid release when one exists.
- Missing deployment status, unknown provider state, stale project revision, or mismatched hash fails closed.
- Interrupted jobs resume from recorded receipts and do not repeat metered work whose exact inputs and successful outputs remain valid.
- Appointment pointer or monitor failure follows the appointment PRD and never grants a stronger action.

Every recovery action records the initiating actor, expected revision, prior state, next state, affected hashes, result, and bounded diagnostic code.

## 13. Interfaces and ownership

| Module | Owns | Must not own |
|---|---|---|
| Generation controller | Approved-input orchestration and candidate creation | Visual or release approval |
| Page IR or template authority | Editable source and deterministic compile path | Deployment or appointment runtime state |
| Canvas mutation authority | Typed edits, candidate gates, history, undo | Direct live writes |
| Client review service | Scoped preview, comments, candidate approval receipt | Design mutation or release approval |
| Agency gate runner | Frozen checks and proof | Gate waiver or deployment |
| Release Orchestrator | Shipping state and receipt coordination | Compiler, gate, provider, or classifier internals |
| Deployment adapter | Provider operations and receipts | Site source of truth or release approval |
| Appointment control plane | Signed handoff publication and runtime safety | Website layout or deployment alias |
| Monitor | Public-origin and appointment health observations | Runtime upgrade or arbitrary repair |

## 14. Verification strategy

### 14.1 Contract and state tests

- Parse and reject unknown lifecycle states, events, actors, and receipt fields.
- Exhaustively test permitted and forbidden transitions.
- Prove stale revisions and mismatched hashes produce no write.
- Prove every mutation capability selects a gate set that detects an injected defect.
- Prove approval invalidation rules for visible, interactive, and non-presentational repairs.

### 14.2 Integration tests

- Generate, edit, review, lock, qualify, deploy, verify, and monitor one deterministic fixture.
- Request changes and prove the prior client approval cannot authorize the new candidate.
- Fail every gate family and prove no deployment begins.
- Fail upload, promotion, and public verification independently and prove the prior public release remains or returns.
- Deploy without valid appointment evidence and prove the site is live with no CTA.
- Downshift and block appointment acquisition without changing website bytes.

### 14.3 Rendered and human gates

- Run representative site purposes and verticals at required desktop, tablet, and mobile sizes.
- Exercise hover, focus, keyboard, reduced motion, slow network, expired review access, and open-page lease expiry.
- Require designer visual approval before client review and release-owner approval before deployment.
- Use an independent verifier against the written success criteria before production qualification.

### 14.4 Operational drills

- Provider outage and ambiguous status.
- Failed production promotion and rollback.
- DNS delay or wrong binding.
- Stale cache and wrong canonical origin.
- Broken form or analytics destination after deployment.
- Appointment target removal, pointer failure, key revocation, and blocked restore attempt.

## 15. Product success criteria

The lifecycle qualifies only when all of the following are proven against a frozen evaluation corpus and at least one authorized production-like environment:

- Every generated Canvas candidate has a manifest and no known Canvas-entry blocker.
- No failed edit changes the current private candidate.
- No unapproved or gate-failing candidate reaches a deployment adapter.
- Every client approval binds one immutable candidate and is invalidated by every covered visible or interactive change.
- Every final bundle passes the complete frozen agency gate catalog.
- Every deployment receipt resolves the bundle hash, provider release, domain, public verification, and rollback target.
- Every injected P0 or P1 defect is detected before public promotion or causes the specified fail-closed runtime action.
- The last-known-good public release survives failed generation, editing, qualification, upload, and verification.
- The appointment capability can remain blocked, activate through its own approval path, and downshift without a full site redeploy.
- A designer can identify what needs taste or client judgment without manually reconstructing mechanical gate output.

## 16. Implementation decomposition

The future dependency-ordered implementation plan should sequence work as follows:

1. Lifecycle contracts, receipts, state transitions, and approval invalidation.
2. Canvas candidate identity, typed mutation coverage, and continuous gate routing.
3. Version-bound client review sessions, comments, and client-lock receipts.
4. Frozen agency gate catalog, SEO compiler, automation classes, and qualification manifest.
5. Release Orchestrator and provider-neutral deployment adapter with a fake conformance provider.
6. One explicitly authorized production provider adapter and public-origin verification.
7. Appointment presentation binding, release coordination, and runtime drills.
8. Evaluation corpus, end-to-end qualification, independent verification, and controlled rollout.

Each step must preserve the existing local-first workflow until its replacement path qualifies. No step may expose ONE BOX beyond its reviewed security boundary merely to make the next demo work.

## 17. Authorization boundary

The owner approved the product direction in conversation on 2026-08-27. This written design still requires owner review. Approval of this document authorizes creation of a dependency-ordered implementation plan only. It does not authorize code changes, dependencies, schema changes, provider selection, credentials, deployment, public client access, or appointment activation.
