# ONE BOX Canvas operating environment

- **Status:** owner-requested product expansion, architecture draft, not implementation authorization
- **Date:** 2026-08-29
- **Production scope:** Website Track A only
- **Related contracts:** Canvas upgrade, Page IR safe pipeline, Canvas-to-agency shipping lifecycle
- **Browser integration plan:** `docs/plans/2026-08-29-embedded-browser-integration.md`

## 1. Decision

ONE BOX should become a project operating environment that the agency team can use without moving between a browser, chat app, project manager, design editor, terminal, and meeting tool.

The product will have one shell with seven workspaces:

1. Canvas
2. Browser
3. Plan
4. Team
5. Review
6. Qualify
7. Ship

Canvas is the pinned default home and the only primary design-and-mutation
workspace. Browser, Plan, Team, Review, Qualify, and Ship are focused adjuncts: a
person may intentionally bring one to the center, but none becomes the default
workspace, mutates the candidate directly, or displaces Canvas as the place where
design proposals are previewed and applied.

Agent Studio remains reachable from every workspace. It owns conversation, model selection, skill invocation, plans, proposals, and task execution. It does not bypass Page IR, candidate gates, client locks, release approval, or production promotion.

The candidate delivery shape is a signed Apple-silicon desktop app backed by a shared cloud project service. It is architecture exploration, not a selected topology or implementation authorization. No retained Electron or other native shell, remote-content host, browser profile, CDP adapter, capture bridge, packaging integration, or updater may begin until a rewritten browser plan closes EB-001 through EB-021 with an owner, threat, deterministic oracle, fixture, exit gate, and retained-code boundary for every finding and passes the required human and independent reviews. A later accepted topology must decide which desktop and cloud responsibilities remain.

## 2. Product outcome

A designer should be able to:

- open a shared project and see who is present;
- talk to an agent, switch models or reasoning effort, and invoke a skill;
- convert a conversation into a PRD, decisions, tasks, owners, and due dates;
- browse reference sites in a project-scoped browser;
- capture a page, element, region, or interaction recording;
- turn the capture into a design reference or a guarded reconstruction proposal;
- edit the current website candidate by direct manipulation or natural language;
- compare multiple model proposals without applying any of them;
- work alongside another designer with optional cursors and live presence;
- invite a client into a video or screen-sharing review room;
- lock one candidate, qualify it, deploy it, and monitor it;
- inspect an audit trail that identifies every person, agent, model, skill, mutation, version, and release action.

## 3. Product shell

The five-zone Canvas anatomy remains intact:

- top bar;
- left rail;
- center canvas;
- contextual right inspector;
- bottom status shelf.

The left rail gains a workspace switcher. Only one focused workspace occupies the center at a time, with Canvas remaining the pinned default and sole design-mutation surface. Agent Studio normally appears as a right drawer or bottom sheet. A person may deliberately open its focused planning view, but that view cannot apply a Canvas mutation and must return to Canvas for preview and application. This prevents the new functions from crowding or silently replacing the design surface.

### 3.1 Always visible

- project identity and lifecycle state;
- current workspace;
- current model route or `Auto`;
- connection and sync state;
- present collaborators;
- undo and redo where the current surface supports them;
- one primary next action;
- Agent Studio composer.

### 3.2 Contextual

- selected element and Page IR identity;
- skill inputs and permissions;
- model effort and cost estimate;
- reference or capture metadata;
- collaborator cursor and selection;
- current task or PRD section;
- affected gates and candidate diff.

### 3.3 On demand

- model registry;
- skill library;
- task board and calendar;
- activity log;
- browser tabs and bookmarks;
- captures and reconstruction variants;
- version history;
- quality issues;
- client room controls;
- deployment and monitoring detail.

## 4. Agent Studio and model routing

### 4.0 Teammate roster and bounded assignments

Agent Studio presents a stable roster of specialist teammates so a designer can
recognize who researches, plans, proposes Canvas changes, challenges quality,
checks security, or qualifies SEO. Persistence means the role name, brief,
handoff history, and evaluation record survive between assignments. It does not
mean an always-running process, inherited tools, a standing provider route,
authority over project state, or human approval.

Every assignment is a bounded job with an explicit owner, task, input hashes,
model/effort route, parent and subagent tool lists, data class, budget, deadline,
fallback policy, output schema, cancellation path, and receipt. The deterministic
ONE BOX orchestrator owns scheduling and lifecycle state. Each agent returns a
typed proposal or challenge; guarded product services own validation and apply.
Missing parent or child allowlists are construction errors, and every child grant
is intersected with the parent's grants before execution. An agent can never apply
or approve its own proposal.
See the [AI teammate operating model](../../plans/one-box-master/04-operating-environment/ai-teammate-operating-model.md).

### 4.1 Model registry

Model choices must come from a runtime registry, not a hardcoded enum. Each entry records:

- provider and stable model ID;
- user-facing name;
- supported reasoning efforts;
- context and output limits;
- vision, audio, tool, and structured-output capabilities;
- approved access lanes;
- availability and last successful probe;
- task-class benchmark status;
- pricing or subscription identity;
- privacy boundary;
- allowed skills and tools.

The UI shows `Auto` first, followed by connected models such as Kimi K3, Claude Fable 5, GPT-5.6 Sol, Gemini Flash, Grok, and local models when available. The effort selector changes to match the selected model. ONE BOX never displays an effort a provider cannot accept.

### 4.2 Switching behavior

The user may pin a model for the thread, override it for one turn, or choose `Auto`.

Switching models does not hand provider-specific conversation state to another provider. ONE BOX builds a normalized `ThreadContextBundle` containing:

- the current user request;
- accepted decisions;
- project facts and evidence references;
- active selection and viewport;
- PRD and task state;
- candidate and Page IR hashes;
- recent conversation summary;
- tool and skill permissions;
- unresolved questions;
- bounded attachment references.

The bundle is versioned and hashed. Every model turn records the bundle hash, provider, model, effort, tools, latency, usage, and result.

### 4.3 Automatic routing

`Auto` chooses a route by task class, capability, benchmark evidence, privacy, availability, cost cap, and connected account. The current provisional ONE BOX policy remains the starting point:

- GPT-5.6 Sol for repository implementation, repair, and verification;
- Kimi K3 as the current bounded runtime frontend lane;
- Gemini for orchestration and visual synthesis where the current policy permits it;
- light models for bounded extraction or classification only;
- independent reviewer models for audit, not certification.

The routing policy remains evidence-based. A model does not become the default because it succeeded once or because it is newest.

### 4.4 Compare mode

Any proposal can run as a model comparison:

1. select two to four connected routes;
2. show the cost or subscription lane before dispatch;
3. run each route against the same context bundle and output contract;
4. render variants side by side;
5. run deterministic checks and optional blind review;
6. let the designer select, combine through a new proposal, or discard;
7. apply only through the normal typed mutation path.

### 4.5 Execution lanes

ONE BOX supports three lane types:

- **Local subscription bridge:** runs approved local OAuth tools on a team member's Mac and returns bounded artifacts and receipts.
- **Agency cloud gateway:** runs shared background work through agency-approved provider accounts.
- **Local model lane:** runs private or offline jobs through an approved local runtime.

Each task records which person or agency account paid for and executed the run. Provider keys stay in server secrets or the signed local bridge. They never enter project files, prompts, browser pages, client links, or logs.

## 5. Skills and commands

Skills are versioned application capabilities with a manifest:

- name and version;
- purpose;
- input schema;
- compatible models and efforts;
- required tools;
- readable and writable project scopes;
- expected artifacts;
- cost class;
- confirmation and release boundaries;
- deterministic acceptance checks.

The composer accepts slash commands such as `/design`, `/plan`, `/research`, `/copy`, `/seo`, `/motion`, `/audit`, and `/ship-check`. Typing `/` opens a searchable skill menu. Selecting a skill displays its inputs, selected scope, model route, and expected output before it runs.

The `/design` skill may produce a design contract, reference direction, token proposal, or mutation proposal. It cannot directly rewrite a candidate. The user previews and applies the resulting typed changes.

Skills can be chained into a plan, but each step produces an artifact and receipt. A failure stops the chain at the last accepted artifact.

## 6. Plan workspace, PRDs, and scheduled work

### 6.1 Conversation to plan

Project conversations, meeting transcripts, comments, and agent threads feed a decision extractor. The extractor creates a draft with four separate outputs:

- decisions;
- open questions;
- PRD requirements;
- tasks.

The draft links every item to its source message or meeting moment. Unsupported assumptions remain marked as assumptions.

### 6.2 PRD workspace

The Plan workspace provides:

- structured PRD sections;
- inline comments and suggested edits;
- requirement IDs;
- source links;
- acceptance criteria;
- dependencies;
- status and owner;
- implementation boundary;
- version diff and immutable approvals.

The agent can draft and update a PRD from accepted conversation decisions. It cannot treat a transcript guess as an approved requirement.

### 6.3 Tasks and schedules

Tasks support:

- person or agent owner;
- due date and recurrence;
- dependencies and blockers;
- related PRD requirements;
- project object, page, selection, or candidate scope;
- required model, skill, and effort;
- execution window and cost cap;
- reminders and notification policy;
- completion evidence.

Human tasks create reminders. Agent tasks enter the job orchestrator at the scheduled time, but only if their execution policy and project state still allow the work. A stale candidate, revoked permission, missing provider, or failed prerequisite blocks the task and records the reason.

## 7. Team collaboration

### 7.1 Roles

- **Owner:** project, membership, model budget, and release authority.
- **Designer:** Canvas, Browser, Plan, assets, and proposal work.
- **Reviewer:** comments, comparisons, and qualification review.
- **Client guest:** candidate review and meeting room only.
- **Agent:** scoped project actor with explicit tool permissions.

### 7.2 Presence and cursors

Presence is ephemeral. It includes user, workspace, page, selection, viewport, and optional pointer position. Users can disable cursor sharing while remaining visible as online.

Remote cursors use low-latency broadcast and never become project history. This follows the same separation described by Yjs Awareness: awareness helps people coordinate but should not be persisted as document state.

### 7.3 Shared editing

ONE BOX should not CRDT-merge Page IR or generated code. Site mutations remain ordered commands against a known candidate and source hash:

1. user proposes a mutation;
2. server checks the source version;
3. conflict returns a diff against the new version;
4. accepted mutation compiles and runs affected gates;
5. a new immutable candidate becomes current;
6. every participant receives the version event.

CRDT text is appropriate for draft PRDs, meeting notes, and chat composition. It is not the authority for Page IR, deployment, or approvals.

### 7.4 Communication and activity

Each project has:

- general and object-scoped threads;
- mentions and assignments;
- page and element comments;
- decisions and unresolved questions;
- a project activity feed;
- an append-only audit log.

The audit log records actor, device, action, model, effort, skill, source hash, result hash, candidate version, gate result, timestamp, and reason. Sensitive prompt bodies and provider secrets do not appear in the general team log.

## 8. Client session room

ONE BOX may later include a project-scoped live room for agency and client review. E6 cannot begin until P3 exit criteria pass, including the review-origin threat model, scoped session, invitation, candidate lock, revocation, and stale-approval gates. LiveKit is a candidate media transport only; it cannot create review, lock, invitation, or approval authority.

The room provides:

- camera and microphone;
- entire-screen, window, tab, or in-app Canvas sharing where the platform permits it;
- participant list and host controls;
- pointer and annotation overlay;
- candidate and breakpoint controls synchronized for all viewers;
- comments and decisions captured against stable IDs;
- optional recording with explicit participant notice and retention policy;
- transcript to decisions, PRD updates, and tasks;
- client guest access that cannot mutate Canvas.

The client joins from a private web link and does not need the desktop app. The agency can run the session from the desktop app without switching to a separate meeting product.

## 9. Embedded Browser workspace

### 9.1 Delivery boundary

A normal web iframe cannot provide a dependable browser because many sites block framing and cross-origin inspection. This section records product intent and candidate technology findings only. The existing E4.0 through E4.7 browser sequence is rejected and has no authority. A rewritten plan must close EB-001 through EB-021 before choosing or retaining Electron, `WebContentsView`, another native shell, or any remote-content host.

### 9.2 Browser features

- tabs and tab groups;
- project bookmarks and personal bookmarks;
- back, forward, reload, address, search, zoom, find, and reader controls;
- per-user session partition and cookies stored locally;
- optional bookmark import;
- downloads routed through an explicit project or personal destination;
- open current page beside Canvas;
- full-page, viewport, element, and region capture;
- short interaction recording;
- send current URL or capture to Agent Studio;
- attach capture to a page, element, task, PRD, or design direction.

The product should not try to embed EGO Lite itself. It should implement a first-party browser workspace with a comparable isolated-session philosophy. Personal logins and cookies remain on each teammate's Mac.

### 9.3 Unified project tabs

ONE BOX uses one top-level tab strip for internal workspaces and web pages. Canvas opens as a pinned project tab. Clicking `+` or pressing `Command-T` creates a Browser tab; `Command-L` focuses its address field. Browser, Canvas, Plan, Review, Qualify, and Ship tabs can coexist without placing a second browser tab row inside Canvas.

If the rewritten plan later selects Electron, each Browser tab would own one main-process `WebContentsView` and one stable `browserTabId`. The trusted renderer would own the tab strip and toolbar, send typed intent and measured bounds through a narrow desktop bridge, and never expose that bridge to a remote page. Opening Agent Studio or an inspector would resize the native browser rectangle instead of drawing privileged controls over untrusted content.

### 9.4 Local profile boundary

Browser profiles are local roles rather than cloud-synchronized cookie jars:

- Agency Work for the designer's normal agency identity;
- Client for one isolated customer identity;
- Project Research for isolated project work;
- Personal for deliberately selected personal logins and bookmarks;
- Private for memory-only browsing;
- Agent Sandbox when an agent must not inherit a human login.

Shared tab invitations and bookmarks carry URLs and project metadata. They do not carry cookies, passwords, local storage, IndexedDB, service workers, permission grants, or raw browsing history. Another teammate opens a shared URL through a locally selected profile.

### 9.5 Agent control boundary

If a later accepted plan selects Electron, Agent Studio would control the same `webContents` through a typed main-process adapter backed by Electron's debugger/CDP connection and native APIs. ONE BOX must not expose a public remote-debugging port. Every action must name the exact `browserTabId`; tools must never act on whichever tab happens to be active.

Read-only observation may run in a background tab without taking focus. A short ownership lease prevents the human and agent from typing into the same tab. Submit, send, purchase, publish, delete, permission, account-change, and executable-download actions require visible confirmation in the first release. Every observation and action records its actor, page generation, policy class, result, and project relation.

### 9.6 Capture contract

Every browser capture becomes a `ReferenceArtifact` with:

- URL and title;
- capture time;
- viewport and pixel ratio;
- capture type and bounds;
- image or recording hash;
- actor and project;
- declared use: inspiration, reconstruction, asset extraction, or evidence;
- rights and redistribution scope;
- optional DOM and computed-style evidence when collection is allowed;
- untrusted-content classification.

The browser never sends a capture directly into the production candidate.

## 10. Screenshot-to-code integration

### 10.1 Repository finding

The MIT-licensed `abi/screenshot-to-code` repository was inspected at commit `d026163f586dfa8c5c10d28c36edd59a9d3b0e88` on 2026-08-29.

Useful patterns in the inspected tree:

- image, text, and screen-recording inputs;
- stack selection for HTML, React, Vue, Bootstrap, Ionic, Tailwind, and CSS targets;
- model and effort selection across multiple providers;
- multi-variant generation;
- WebSocket events for status, thinking, assistant output, tools, and completion;
- provider adapters around one tool-calling loop;
- create, edit, image, asset-extraction, and screenshot-preview tools;
- desktop and mobile visual self-checks;
- update history, variants, and export packaging.

The repository does not provide the architecture ONE BOX needs for team identity, shared projects, Page IR authority, evidence, client approval, qualification, deployment, or an embedded browser. Its current local setup also accepts provider keys and treats generated single-file HTML as the editable file state.

### 10.2 Patterns to adapt

This is pattern extraction only. Ledger entry `SC-GH-005` remains `adapt`; no
repository source, dependency, or generated file is cleared for retained use.

- multimodal screenshot and recording intake;
- streamed agent and tool events;
- provider-adapter pattern;
- model variants and side-by-side comparison;
- asset extraction as an explicit tool;
- screenshot self-review at desktop and mobile widths;
- update history and export concepts;
- select-and-edit overlay interaction ideas.

### 10.3 Adapt

- replace hardcoded model enums with the ONE BOX model registry;
- replace raw single-file HTML authority with deterministic static Page IR; record unsupported executable behavior as deferred post-Phase-1 scope;
- replace direct provider keys with cloud secrets or local subscription bridges;
- replace one-user file state with project-scoped durable artifacts and immutable candidates;
- replace generic stack selection with Stack Intelligence and supported compiler adapters;
- bind every asset to source, rights, hash, and candidate lineage;
- route every applied result through typed mutations and affected gates.

### 10.4 Reject

- copying the whole repository into ONE BOX;
- arbitrary HTML, CSS, or JavaScript as production source;
- stale hardcoded provider and model lists;
- silent provider fallback;
- model-written changes that self-apply;
- capture flows that obscure source rights;
- a browser capture that becomes deployable code without review and translation.

### 10.5 Capture-to-component flow

1. Browse to a reference.
2. Capture a page, element, region, or short behavior recording.
3. Choose inspiration, rebuild, asset extraction, or behavior study.
4. Agent extracts structure, design lessons, assets, and interaction observations.
5. ONE BOX produces one or more `ReconstructionProposal` variants.
6. The proposal maps supported content, layout, tokens, assets, and actions to Page IR.
7. Unsupported premium behavior is recorded as a deferred capability during Phase 1; it does not become executable module code.
8. Designer compares the source capture, current candidate, and proposal.
9. Apply creates typed mutations against the current source hash.
10. The compiler builds a private candidate and runs affected gates.

## 11. Stack Intelligence and the Phase 1 boundary

The designer should not need to choose a framework before understanding the site requirements. During Phase 1, however, ONE BOX has one production document and compiler authority: deterministic static Page IR. Stack Intelligence may explain constraints and record later research, but it cannot select React, Next.js, or an executable module as a Phase 1 production target.

### 11.1 Decision inputs

- number and type of pages;
- content update frequency;
- SEO and structured-data needs;
- forms, appointments, commerce, auth, and data requirements;
- animation and interaction complexity;
- WebGL or 3D requirements;
- hosting and portability constraints;
- performance budget;
- client maintenance capability;
- agency support boundary.

### 11.2 Track A compiler targets

- **Phase 1 static website:** semantic HTML and portable CSS generated deterministically from Page IR. Tailwind v4 may serve as a pinned compile-time token and utility layer but does not become a second source or need to ship to the browser.

React, Next.js, Vue, Vite React, Ionic, and other targets are outside Phase 1 production. They may enter separately authorized, disposable research after Phase 1, but they do not become production targets because a model can emit them.

### 11.3 Experience modules

`ExperienceModule`s are deferred until after Phase 1 and require a separate accepted schema/security ADR and implementation plan. Any later signed contract must include:

- typed props and events;
- package allowlist and locked versions;
- bounded network access;
- bundle and performance budget;
- SSR and hydration behavior where applicable;
- keyboard and semantic fallback;
- reduced-motion behavior;
- cleanup and error boundary;
- deterministic fixture and visual tests;
- explicit ownership and source provenance.

A future module may add bounded behavior but may not author the site document, bypass deterministic static Page IR or release gates, or release itself. React, GSAP, Three.js, WebGL, and similar executable behavior gain no production authority from this draft. Visual motion authoring also remains blocked until ONE BOX obtains written GSAP consent or accepts a Motion/non-GSAP evaluate-and-replace plan with a deterministic oracle and removal path.

## 12. Team delivery and remote architecture

### 12.1 Candidate desktop edition

- possible native shell around the current trusted product surfaces;
- Chromium Browser workspace through `WebContentsView`;
- signed local agent bridge;
- secure local session and token storage;
- project cache and offline-readable artifacts;
- file, screenshot, screen-recording, and clipboard integration;
- Apple-silicon package signed and notarized for direct distribution;
- automatic updates from an agency-controlled update feed.

These are candidate responsibilities, not selected dependencies or retained-code authority. The native shell, remote-content host, packaging integration, and updater remain blocked on the rewritten EB-001 through EB-021 plan and its review gates.

### 12.2 Web edition

The web edition supports shared projects, Canvas, Plan, Team, Review, Qualify, Ship, and client rooms. It does not promise a full embedded browser or unrestricted local tools. Those actions can be handed to a connected desktop bridge.

### 12.3 Cloud project service

If and only if the accepted target-topology ADR and provider decision select Supabase, provision it in the primary `Zerosumsolutions-Projects` organization for:

- authentication and team membership;
- project metadata and row-level authorization;
- durable conversations, PRDs, tasks, comments, decisions, and audit events;
- Realtime Presence and Broadcast;
- encrypted artifact storage and signed access;
- scheduled-task records and notifications.

Evaluate LiveKit for video, audio, and screen-share transport only after P3 passes. Evaluate a separate job orchestrator and worker boundary for agent runs, compilers, gates, and releases in the future topology ADR. Provider and deployment secrets remain server-side requirements for any authorized cloud design.

### 12.4 Sync model

- server owns project identity, membership, durable collaboration, and release state;
- candidate source mutations use ordered server commands and hashes;
- desktop caches artifacts and may run local jobs;
- local results upload as immutable artifacts plus receipts;
- server verifies expected project, source hash, actor, lane, and result contract before accepting them;
- offline mutations queue as proposals and resolve conflicts after reconnect;
- live production never depends on one teammate's laptop remaining online.

## 13. Core data contracts

New product domains should use separate versioned contracts:

- `ProjectMemberV1`
- `PresenceStateV1`
- `ActivityEventV1`
- `ThreadContextBundleV1`
- `ModelRegistryEntryV1`
- `AgentRunReceiptV1`
- `SkillManifestV1`
- `PlanDocumentV1`
- `TaskV1`
- `ScheduleV1`
- `ReferenceArtifactV1`
- `ReconstructionProposalV1`
- `ExperienceModuleV1`
- `LiveReviewRoomV1`
- `DesktopBridgeReceiptV1`

These contracts must not be added to `src/lib/contracts.ts` until their owning subsystem and migration boundary are approved. Page IR remains the source authority for `page-ir-v1` Website runs.

## 14. Safety and privacy

- Project rooms and realtime channels are private and authorized by project membership.
- Client guests receive candidate-scoped access with expiration and revocation.
- Cursor sharing defaults to on for agency members and can be disabled instantly.
- Browser cookies, saved sessions, and personal bookmarks remain local unless a user explicitly shares a bookmark.
- Browser content and captures are untrusted input.
- Screenshots and recordings carry source and rights metadata.
- Meeting recording requires visible participant notice and retention controls.
- Model switching shows which provider receives which bounded context.
- Local subscription lanes never expose OAuth tokens to the cloud project.
- Cloud agents cannot reach a teammate's files without a live, scoped desktop bridge grant.
- Every executable module, mutation, qualification, and release uses a versioned receipt.

## 15. Draft program decomposition

E0 through E8 are draft decomposition labels only. They are not accepted phases, a backlog, dependencies, or implementation authorization. A separately accepted operating-environment specification and implementation plan are required before retained E0 through E3 work.

1. **E0, identity contracts:** project identity, members, roles, and sync contracts only; no desktop or native shell.
2. **E1, Agent Studio:** model registry, connection manager, per-turn switching, effort filtering, context bundles, receipts.
3. **E2, skills and Plan:** skill manifests, slash commands, PRD workspace, tasks, schedules, decision extraction.
4. **E3, collaboration:** project threads, comments, presence, cursor toggle, activity log, mutation conflict handling.
5. **E4, reserved browser rewrite:** no sequence is authoritative until a replacement plan closes EB-001 through EB-021 and passes the required reviews; do not reuse the rejected E4.0 through E4.7 numbering before then.
6. **E5, reconstruction:** governed screenshot and recording analysis, variants, and static Page IR translation, contingent on the accepted browser boundary.
7. **E6, client room:** media transport only after P3 exit criteria; no independent review, lock, invitation, or approval authority.
8. **E7, post-Phase-1 stack research:** React targets and signed `ExperienceModule`s only after a separate schema/security ADR and implementation plan are accepted.
9. **E8, delivery research:** retained native packaging and updates remain blocked with the shell until the browser rewrite closes.

The existing A0 to A4 and P1 to P8 website lifecycle work remains ahead of any subsystem that could weaken Page IR authority, candidate identity, qualification, or release safety. Reports, contracts, and disposable out-of-tree spikes may inform the draft, but they create no retained implementation, candidate, or release authority. Deterministic static Page IR remains the sole Phase 1 production document/compiler authority; the existing closed `template-v1` compatibility path is not extended by this draft.

## 16. Acceptance criteria

The operating environment is credible when:

- two agency members on different networks can open the same project and see accurate presence;
- cursor sharing can be toggled without hiding online status;
- concurrent site edits either serialize safely or produce a clear conflict, never a silent merge;
- a user can switch between connected models and supported efforts for one turn without losing project context;
- every model and skill action has an actor, context hash, route, result, cost identity, and receipt;
- every teammate assignment has explicit non-inherited tools and a bounded run contract; durable teammate identity creates no background process or standing authority;
- a conversation can produce a source-linked PRD draft and scheduled human or agent tasks;
- a client can join a private room, see the exact candidate, screen share, comment, and leave without Canvas mutation permission;
- the desktop Browser workspace supports tabs, project bookmarks, authenticated sessions, and governed capture;
- a capture can produce a reconstruction proposal, but cannot enter a candidate without translation, preview, typed apply, and gates;
- Phase 1 Stack Intelligence explains the static Page IR target and records unsupported later capabilities without selecting React or an `ExperienceModule` for production;
- the same locked candidate moves through client review, qualification, deployment, and monitoring;
- signed Apple-silicon builds install and update on every agency Mac without manual development setup.

## 17. Sources inspected

- [Embedded browser source audit](../../research/2026-08-29-embedded-browser-source-audit.md)
- [Embedded browser integration plan](../../plans/2026-08-29-embedded-browser-integration.md)
- [EGO Lite pinned source](https://github.com/citrolabs/ego-lite/tree/5ca3c36cba2240b8df2e22ba32127747029039d5)
- [Tandem Browser pinned source](https://github.com/hydro13/tandem-browser/tree/3b613cfd4c299609ca7ca415d638c1b71c6ba5de)
- [BrowserOS pinned source](https://github.com/browseros-ai/BrowserOS/tree/83846a6625e084ae98da9428a7c1099c7977c989)
- [Nyra pinned source](https://github.com/Zeyzers/nyra/tree/ce5ad13c96a5721ee637c8a7eeb5976504f5683c)
- [WebPilot pinned source](https://github.com/ahamSel/WebPilot/tree/afd8ea4b5bedaf083270f868ff0c10b86cd17398)
- [multiprofile-browser pinned source](https://github.com/dmshust86/multiprofile-browser/tree/2608c393a1c7285d663038172ca602fb1bd192a6)
- [browser-use pinned source](https://github.com/browser-use/browser-use/tree/2e32d260341fae39c80bc8529ec174bad91e7672)
- [agent-browser pinned source](https://github.com/vercel-labs/agent-browser/tree/fbd046c23a2c1156891bda294aaaee715c23b3f1)
- [screenshot-to-code repository](https://github.com/abi/screenshot-to-code/tree/d026163f586dfa8c5c10d28c36edd59a9d3b0e88)
- [screenshot-to-code model registry](https://github.com/abi/screenshot-to-code/blob/d026163f586dfa8c5c10d28c36edd59a9d3b0e88/frontend/src/lib/models.ts)
- [screenshot-to-code stack registry](https://github.com/abi/screenshot-to-code/blob/d026163f586dfa8c5c10d28c36edd59a9d3b0e88/frontend/src/lib/stacks.ts)
- [screenshot-to-code agent tools](https://github.com/abi/screenshot-to-code/blob/d026163f586dfa8c5c10d28c36edd59a9d3b0e88/backend/agent/tools/definitions.py)
- [Electron WebContentsView migration](https://www.electronjs.org/blog/migrate-to-webcontentsview)
- [Electron distribution overview](https://www.electronjs.org/docs/latest/tutorial/distribution-overview)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Yjs Awareness and Presence](https://docs.yjs.dev/getting-started/adding-awareness)
- [LiveKit screen sharing](https://docs.livekit.io/transport/media/screenshare/)
