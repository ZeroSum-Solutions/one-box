# ONE BOX embedded browser integration

- **Status:** corrected proposed integration contract; EB gates remain open; no runtime implementation
- **Date:** 2026-08-29
- **Parent design:** `docs/superpowers/specs/2026-08-29-canvas-operating-environment-design.md`
- **Source audit:** `docs/research/2026-08-29-embedded-browser-source-audit.md`
- **Normative closure register:** `docs/security/2026-08-29-embedded-browser-closure-requirements.md` (`sha256:3bc32cbc1fcbf8ce6abe9c38341e2f5f739cf31eb3df426c6dbf696ae01b0ef7`)
- **Production boundary:** Website Track A remains authoritative

## 1. Decision

If the accepted topology selects a signed desktop shell, ONE BOX will own a first-party browser workspace inside it. The proposed shell renders browser pages in Electron `WebContentsView` instances and manages those views from the main process. The project will not fork EGO Lite, Tandem, BrowserOS, Nyra, WebPilot, or another complete browser. This decision is a target design, not selection of Electron or authorization to retain a shell.

The interface will use one project-level tab strip. Tabs may represent Canvas, Browser, Plan, Review, or another ONE BOX workspace. Clicking `+` or pressing `Command-T` creates a Browser tab immediately. A designer can move between the site and a reference page without opening another application.

The existing generated-site iframe remains inside Canvas. It keeps its current sandbox and typed editing protocol. A general web page never enters that iframe and never receives access to Canvas APIs.

## 2. Why this course

The audited projects provide useful patterns but no complete foundation that fits ONE BOX:

| Project | What to learn from it | Why it is not the foundation |
| --- | --- | --- |
| EGO Lite | task spaces, ownership handoff, CDP observation, downloads, screenshots, and screencasts | The MIT repository publishes the agent harness, not the browser application's chrome, profile, or kernel implementation. |
| Tandem | explicit tab identity, workspaces, background-tab targeting, snapshots, and human-agent handoff | Its current renderer uses Electron `<webview>` tabs and a permission fallback that is too permissive for ONE BOX. |
| BrowserOS | page registries, tab isolation, accessibility snapshots, annotated screenshots, and prompt-injection boundaries | It is an AGPL Chromium fork. Adopting it would create a different product and maintenance model. |
| Nyra | spaces, bookmarks, history, downloads, session restore, and site-permission UX | It uses `<webview>` and deprecated `BrowserView` paths and has no agent-control layer. |
| WebPilot | agent run history, artifacts, provider adapters, and Playwright task UX | It controls a separate browser, uses GPL-3.0-or-later code, disables the Electron sandbox in its shell, and does not provide embedded browsing. |
| Multiprofile Browser | one `WebContentsView` per tab, persistent partitions, temporary tabs, crash restore, and profile routing | It has no repository license file, so its implementation is unsafe to copy even though package metadata says MIT. It also has no agent layer. |
| Browser Use | plan-act-observe loops, DOM representations, histories, recordings, and navigation watchdogs | It is a Python automation framework, not a desktop browser surface. The MVP does not need a second runtime. |
| Agent Browser | stable tab handles, accessibility references, CDP tools, content boundaries, action policies, and recordings | It drives Chrome through a daemon. ONE BOX can use the protocol ideas through an internal Electron adapter without exposing a remote-debugging port. |

ONE BOX will clean-room implement the browser shell from Electron's current APIs. Permissively licensed projects may inform bounded modules after a line-level license and security review. GPL and AGPL code remains reference-only.

## 3. Product interaction

### 3.1 One tab strip

The project window has one tab strip below the macOS title bar. It does not place a separate browser tab row inside Canvas.

- Canvas opens as a pinned project tab.
- `+` and `Command-T` open a Browser New Tab page.
- `Command-L` focuses the active Browser tab's address field. From a non-Browser tab, it opens a Browser tab and focuses the address field.
- Browser tabs show a favicon, title, loading state, audio state, profile badge, and private-state badge when applicable.
- Internal tabs show their workspace icon and project object, such as a page, PRD, review, or release.
- Closing the last Browser tab returns to the most recently used internal tab. It never closes the project.
- Links requested with `target=_blank`, middle click, or `Command-click` create another governed Browser tab rather than an unmanaged window.

### 3.2 Canvas and Browser together

A Browser tab can be placed beside Canvas. The shell reserves an exact rectangle for the browser view and leaves Canvas in the trusted ONE BOX renderer. Opening Agent Studio or the inspector shrinks the browser rectangle instead of drawing privileged controls over untrusted page content.

The Browser toolbar offers:

- back, forward, reload, stop, address and search;
- profile selection;
- project and personal bookmarks;
- find, zoom, downloads, permissions, and page information;
- capture viewport, full page, element, or region;
- send URL to Agent Studio;
- attach reference to Canvas, a task, a PRD, or a design direction;
- open in the system browser when a site or identity provider rejects the embedded environment.

## 4. Desktop architecture

```text
Signed ONE BOX desktop app
├── Electron main process
│   ├── ProjectWindowManager
│   ├── ProjectTabManager
│   ├── BrowserViewManager
│   ├── BrowserProfileManager
│   ├── BrowserPolicyEngine
│   ├── BrowserControlAdapter
│   └── BrowserCaptureService
├── Trusted ONE BOX renderer
│   ├── global tab strip and browser toolbar
│   ├── Canvas, Plan, Team, Review, Qualify, and Ship
│   └── Agent Studio
├── Untrusted remote renderers
│   └── one WebContentsView per live Browser tab
└── ONE BOX application service
    └── existing Next.js routes, pipeline, Page IR, candidates, and gates
```

The desktop shell does not replace the current application service. During development it can connect to the loopback Next.js process. A signed release packages and starts the application service privately, waits for a health check, and then loads the trusted renderer.

The proposed composition tree is one main-process-owned `BaseWindow`, one trusted-shell `WebContentsView`, and at most one attached/visible untrusted Browser `WebContentsView`. `ProjectTabManager` owns the tab registry; `BrowserViewManager` is its only native-view lifecycle adapter. Bounds are device-independent pixels computed by the trusted shell, validated against the current content rectangle in the main process, and applied only after the trusted renderer and project generation match.

`BrowserViewManager` creates, attaches, positions, hides, restores, and destroys every untrusted view. The React shell sends only measured browser-surface bounds and typed user intent through a narrow trusted preload bridge. Remote pages receive no preload. Before a command palette, menu, permission prompt, dialog, sheet, or Commit confirmation appears, the main process first hides or shrinks the untrusted view and waits for the bounds acknowledgement; privileged HTML is never drawn as a renderer overlay above hostile native content.

The main process owns `Command-T`, `Command-L`, tab switching, escape, reload/stop, zoom, and close even when hostile content has focus. Attach, hide, crash, reload, HMR, and destroy have explicit focus successors. After a trusted-renderer reload or crash, every untrusted view remains hidden until the shell rebinds the project/tab generation and republishes valid bounds. No renderer can create a second view owner.

Inactive tabs keep their `webContents` until an explicit close, crash, memory-pressure suspension, or policy limit. Closing a project destroys every owned `webContents`; Electron does not do this automatically for views managed through `BaseWindow`-style composition.

## 5. Tab and profile contracts

The runtime contract should use a discriminated tab type rather than treating every tab as a URL:

```ts
type ProjectTab =
  | CanvasTab
  | BrowserTab
  | PlanTab
  | ReviewTab
  | QualifyTab
  | ShipTab;
```

Every Browser tab has a stable internal `browserTabId`. Human controls, agent tools, capture receipts, audit events, and crash restoration refer to this ID. No mutation tool may act on whichever tab happens to be active.

Browser identity is local to each teammate's Mac:

- **Agency Work profile:** persistent agency login state that may be reused across projects by its owner.
- **Client profile:** persistent, isolated state for one client or customer identity.
- **Project Research profile:** persistent, isolated state for research that should not share the Agency Work profile.
- **Personal profile:** persistent personal login and bookmark state, selected deliberately and never shared automatically.
- **Private profile:** memory-only state destroyed when its last tab closes.
- **Agent sandbox:** memory-only or bounded persistent state used when the agent must not inherit a human login.

Electron partitions use opaque local IDs. The first Browser tab must resolve an explicit profile role to an explicit non-default partition; `persist:default`, the trusted-shell partition, and unknown partitions are denied. Changing the role-to-partition mapping after retained use requires a versioned migration and rollback fixture. Shared project records contain a profile role, never a cookie partition path or credential. Cookies, local storage, IndexedDB, service workers, saved passwords, and raw browsing history stay on the device. A teammate who opens a shared tab receives the URL in a locally selected profile, not another person's authenticated session.

Private and Agent Sandbox partitions are ephemeral sessions, never `persist:` partitions. They are destroyed, not serialized or memory-pressure-suspended, when the last owned tab closes. Session-restore records exclude them. Personal remains an explicit supported role only after the same isolation fixtures as Work, Client, and Project Research pass; until then the UI must omit it.

## 6. Security boundary

Every remote `WebContentsView` uses:

- `nodeIntegration: false`;
- `contextIsolation: true`;
- `sandbox: true`;
- `webSecurity: true`;
- no unrestricted preload or Electron API;
- HTTPS by default, with explicit treatment for loopback development;
- deny-by-default permission check and request handlers;
- governed download destinations;
- guarded navigation, external protocols, and window creation;
- sender validation on every privileged IPC handler;
- current Electron and Chromium security releases;
- no user-agent spoofing, fingerprint evasion, or disabled certificate checks.

The trusted shell uses a partition that the profile resolver cannot return for a Browser tab. A per-launch application-service credential with at least 256 bits of entropy is created in the main process, held outside renderer storage, and conveyed only through the trusted boundary. Browser sessions receive neither the credential nor an ambient cookie for the application service. Navigation and request enforcement independently deny the application-service origin, all loopback, private, carrier-grade-NAT, link-local, multicast, unspecified, and metadata-service addresses, and `file:`. Redirects and resolved destinations are rechecked so DNS rebinding or an `https` redirect cannot bypass the IP policy. The packaged application service is a non-authoritative sidecar: it may render, cache, and queue conflict-visible proposals, but only Website Track A may finalize source or candidate state. Offline browser/desktop mode is read-only unless an accepted proposal-queue contract is present.

The main process applies this deny-by-default matrix before navigation and again at the session request boundary:

| Input/effect | Browser-tab policy |
|---|---|
| `https:` public destination | allow only after hostname and resolved-address policy passes |
| `http:` public destination | deny by default; separately allowlisted development fixture only |
| app origin, loopback, private/link-local/metadata address | deny navigation and subresource request |
| `file:`, `javascript:`, `data:` top-level, `blob:` top-level, unknown/custom protocol | deny |
| `about:blank` | allow only as an inert, no-opener intermediate owned by a governed tab |
| redirect | re-evaluate scheme, origin, resolved address, profile, and task grant |
| `window.open`, target blank, middle/Command click | suppress native window; create a governed tab in the opener's profile or deny |
| drag/drop URL or file | treat as a new navigation/file-import request; never implicit navigation or local-file access |
| download | deny by default; accepted file types use a governed destination, size/hash receipt, and malware/content policy |
| external protocol | visible human confirmation, explicit allowlist, and system handler; no return authority |
| permission request | explicit per-capability allowlist; deny all unlisted permissions |

Packaged verification must prove Electron fuses disable RunAsNode and unsafe Node behavior, no remote-debugging port or unsafe command-line switch is present, sandbox/context isolation remain enabled, untrusted views have zero preload, and the release uses a currently accepted Electron/Chromium identity. Titles are rendered as plain text with the normalized origin shown separately. Favicons are fetched in the untrusted session, decoded to bounded inert bitmap data, and never treated as SVG/HTML or trusted chrome.

OAuth or sign-in that rejects Electron opens in the system browser and is terminal in the first browser release: ONE BOX opens the provider page but accepts no callback into an untrusted view or project authority. A later callback design requires a separately accepted one-time high-entropy state bound to one pending profile, exact redirect URI, expiry, and single-use exchange in the trusted boundary. ONE BOX does not imitate Chrome to bypass a provider's policy. Password and cookie import are outside the first browser release.

## 7. Agent control

`BrowserControlAdapter` gives Agent Studio a typed allowlisted interface over a named tab's existing Electron `webContents`. It may use a single main-process debugger lease and bounded Electron APIs, but exposes neither raw CDP nor a public remote-debugging port. Generic runtime evaluation, cookie/storage APIs, password fields, hidden credential/token fields, raw network bodies, and raw DOM export are forbidden. Debugger attach/detach, navigation, crash, and generation change invalidate node references and the lease.

The first tool set is:

- list and describe tabs;
- open, focus, close, and navigate a tab;
- read title, URL, text, links, forms, accessibility tree, DOM snapshot, and computed styles;
- take viewport, full-page, element, and region screenshots;
- scroll, focus, click, type, select, and wait;
- inspect downloads and page errors;
- hand control to the human.

Agents default to the Agent Sandbox profile. Observing or acting in a human profile requires a visible, expiring grant naming the tab, exact allowed origins, task, observation classes, action classes, and data-sharing boundary. Each call names `browserTabId`, actor, task, project, expected page generation, current origin, and effect class. A short ownership lease prevents the human and agent from typing into the same tab at once. Read-only observation can occur in a background tab only when the grant permits it. An agent cannot silently move the visible designer to another page.

The policy engine classifies the expected effect after considering the current DOM, origin, page generation, redirects, and event handlers; it does not classify merely by primitive:

- **Observe:** read page state or take an approved capture.
- **Draft:** type or select without submitting.
- **Navigate:** open or change a URL inside the declared task boundary.
- **Commit:** submit a form, send a message, publish, purchase, delete, download executable content, grant a permission, or change an account.

Unknown or changed effects are Commit. Commit actions always require a visible human confirmation in the first release. The confirmation binds the tab, normalized origin, page generation, exact action, material inputs, expected effect, and idempotency key. Before the effect, the trusted service durably records `CommitIntentV1`; after it, it records a result or an explicit unknown-outcome state. A crash before intent persistence prevents the action, and retries cannot reuse a completed key. Navigation and Draft actions may run only inside the exact task grant. Redirects, expiry, background mutation, lease loss, stale page generations, and stale node IDs fail closed. Every action produces an audit event.

## 8. Capture to Canvas

Browser content remains untrusted input. Capture is the only initial bridge from arbitrary browsing into a project artifact.

1. The designer or agent selects a page, element, region, or short interaction.
2. The main process captures only the untrusted view surface, never a display, application window, Canvas, Agent Studio, privileged chrome, or another app. ONE BOX records the stable tab ID, URL, origin, title, timestamp, viewport, exact view bounds, profile class, actor, and content hashes.
3. The user declares inspiration, reconstruction, asset extraction, behavior study, or evidence.
4. The capture service strips credential fields and hidden secrets, enforces per-type byte and duration limits, stores raw image/recording/snapshot bytes locally, and creates a bounded `ReferenceArtifact` proposal.
5. An explicit attach action uploads the governed artifact to the shared project when its visibility permits it.
6. Agent Studio may receive only a redacted, bounded derivative permitted by the grant. DOM, accessibility, and style collection is top-level-origin scoped unless a separate cross-origin grant and rights basis exist; raw DOM/AX/style snapshots never enter shared project state or a model context.
7. Reconstruction produces a proposal against the current Page IR source hash.
8. Canvas shows source, current candidate, and proposal before typed apply and gates.

A URL, screenshot, DOM snapshot, or model output never mutates a site directly. Attach and reconstruction require a declared rights basis, project visibility, retention/expiry, redaction result, source and capture hashes, and a named human decision. Missing or ambiguous rights fail closed.

### 8.1 Assignment gate

The assignment source is `docs/tickets/one-box-program/manifest.json#humanAssignments`, currently `unassigned-blocking` with no active `OwnerAssignmentV1` records. The browser roles therefore resolve as follows:

| Required role | Current active person | State |
|---|---|---|
| Desktop Security Owner | none | BLOCKED |
| Desktop Architecture Owner | none | BLOCKED |
| Identity and Tenancy Owner | none | BLOCKED |
| Canvas and Agent Security Owner | none | BLOCKED |
| Data Protection Owner | none | BLOCKED |
| Website Authority Owner | none | BLOCKED |
| License and Supply-Chain Owner | none | BLOCKED |
| Independent security verifier, distinct from the relevant author | none | BLOCKED |

A role label, Devin's product-direction acceptance, model audit, or inferred team identity is not an assignment. Before any EB row can close or BR-1/BR-2 work can be authorized, the manifest must hold active named-person records for every role used by that row and a qualifying non-author verifier. This table is an explicit blocker, not an implementation authorization or a request to weaken separation of duties.

## 9. Security-first delivery sequence

The former E4.0–E4.7 implementation sequence is withdrawn because it allowed retained shell code before the P0 isolation gate closed. These replacement slice IDs do not inherit that authorization. Every slice begins as specification-and-fixture work; retained product code requires a separate ticket whose prerequisites are mechanically current.

### BR-0, contract and hostile-fixture packet only

Freeze the composition tree, trusted/application-service boundary, profile mapping, navigation/protocol matrix, Page IR authority boundary, supply-chain provenance process, assignment-source contract, and EB-001 through EB-021 fixtures. Build the hostile fixtures outside the product source. Do not package or retain a shell. Exit only when the plan verifier resolves the closure-register digest and every row has a runnable fixture definition; row states remain OPEN until active named owners, a qualifying independent verifier, current evidence, and their decisions exist.

### BR-1, isolation evidence before retention

Only after separate written authorization, exercise a disposable out-of-tree packaged harness against EB-001, EB-004, EB-008, EB-009, EB-014, EB-015, and EB-021. The harness contains no project/client data, production credentials, browser profiles, shared service, or reusable shell module. Failed or incomplete evidence is discarded and retains no product code. Exit requires the P0 app-service and trust-domain oracles plus named owner and independent-security-verifier acceptance.

### BR-2, governed shell and one browser tab

After BR-1 closure, a separately authorized retained ticket may implement the trusted/untrusted view tree, typed tab registry, main-process shortcuts, privileged-overlay occlusion, one explicit Work or Project Research partition, closed navigation matrix, fuses, reload/crash rebind, and governed new-window routing. It excludes OAuth callbacks, Personal, agent observation/action, capture attachment, offline writes, synchronization, and reconstruction. Exit requires EB-002, EB-003, EB-005, EB-006, EB-007 terminal-system-browser behavior, EB-010, and EB-017 evidence.

### BR-3, profile and lifecycle expansion

Add Client, Private, and Agent Sandbox only through exact partition/lifecycle fixtures; add Personal only if explicitly authorized. Prove cookie, storage, cache, worker, permission, download, restart, memory-pressure, and last-tab-close isolation. Exit requires EB-016 and EB-019 evidence and proves no private state enters disk restore or project synchronization.

### BR-4, bounded observation and view capture

Add typed observation with a single debugger lease, sandbox-profile default, human-profile grants, redaction, byte limits, top-level-origin collection, view-targeted capture, rights, visibility, retention, and local-only raw snapshots. Exit requires EB-011, EB-013, and EB-018 evidence. No generic evaluate/cookie/storage tool or screen-wide capture exists.

### BR-5, guarded actions

Add effect-aware actions, tab/origin/expiry grants, generation-bound references, durable Commit intent, idempotency, visible confirmation, handoff, and unknown-outcome recovery. Exit requires EB-012 and EB-020 evidence across redirect, SPA mutation, background mutation, debugger loss, expiry, crash, duplicate, and prompt-injection fixtures.

### BR-6, governed project reference and reconstruction proposals

Allow only accepted `ReferenceArtifact` derivatives to enter shared project state. Reconstruction remains a source-hash-bound proposal through typed Page IR mutation, gates, human review, and candidate creation. It receives no direct file, source, candidate, client-lock, qualification, release, provider, or appointment authority.

### BR-7, team and release qualification

Sync only explicitly shared URLs/bookmarks, bounded references, comments, and activity events—not sessions, cookies, storage, passwords, raw history, or raw snapshots. Complete signing, notarization, update/downgrade/rollback, long-session, sleep/wake, crash, tab-volume, offline, dependency, and Apple-silicon device qualification. A teammate reconstructs a shared reference in a local profile without receiving the source user's browser state. The feature remains release-disabled until every EB row, owner assignment, independent review, topology, supply-chain, and desktop lifecycle gate is current.

## 10. EB control-to-oracle crosswalk

The closure register is normative; this table points each unmerged ID to its control and fixed evidence slice. A plan row is not a closed implementation finding.

| ID | Plan control | Fixed oracle / slice |
|---|---|---|
| EB-001 | separate trusted partition, per-launch credential, network/app-origin denial | hostile app-service/loopback/private/file/DNS-rebind corpus; BR-1 |
| EB-002 | hide/shrink native view before privileged UI | palette/menu/permission/dialog/Commit occlusion fixtures; BR-2 |
| EB-003 | main-process chrome shortcuts and focus successors | attach/hide/crash/destroy shortcut matrix; BR-2 |
| EB-004 | one BaseWindow, trusted view, one active untrusted view, DIP bounds | composition/DPR/lifecycle fixture; BR-1 |
| EB-005 | stable tab registry, one webContents per live tab, no unmanaged windows | popup/target/middle/Command-click matrix; BR-2 |
| EB-006 | explicit non-default role partition and migration contract | default/trusted/unmapped partition rejection; BR-2 |
| EB-007 | terminal system-browser OAuth in first release | callback/replay/wrong-profile denial; BR-2 |
| EB-008 | deny-by-default scheme/address/redirect/download/protocol matrix | every matrix denial plus DNS-rebind fixture; BR-1 |
| EB-009 | fuses, switch lockdown, sandbox, isolation, no preload/debug port | packaged hardening inspection; BR-1 |
| EB-010 | hide on trusted-shell loss; generation-bound rebind | HMR/reload/crash/error-overlay recovery; BR-2 |
| EB-011 | sandbox-profile default, explicit grants, typed observations, raw-local rule | injection/evaluate/cookie/storage/token/raw-share denial; BR-4 |
| EB-012 | effect classification, unknown=Commit, generation-bound confirmation | SPA/navigation/stale-node/debugger-loss matrix; BR-5 |
| EB-013 | view-only capture and governed receipt | no Canvas/chrome/other-app pixels; BR-4 |
| EB-014 | non-authoritative sidecar; read-only or conflict-visible offline proposals | Track A advance/offline conflict corpus; BR-1 and BR-6 |
| EB-015 | primary-doc clean-room design and source-access provenance | license/provenance review blocks copyleft/unlicensed reuse; BR-0/BR-1 |
| EB-016 | Personal explicitly qualified or absent | profile-role coverage fixture; BR-3 |
| EB-017 | no remote preload, plain-text title, separate origin, inert favicon | spoofing/SVG/markup/preload corpus; BR-2 |
| EB-018 | origin/rights/redaction/size limits; raw snapshots local | cross-origin/credential/oversize/raw-share/rights corpus; BR-4 |
| EB-019 | ephemeral destruction and explicit permission allowlist | last-tab/memory/restart/all-permission matrix; BR-3 |
| EB-020 | exact task grant, durable intent before effect, idempotent result | redirect/expiry/mutation/crash/duplicate Commit corpus; BR-5 |
| EB-021 | written threat model and packaged trust-domain oracle before retention | preload/IPC/Node/app-origin/postMessage/crash corpus; BR-1 |

## 11. Product acceptance gates

- `+` and `Command-T` open a governed Browser tab without leaving the project window, but only after BR-2 is authorized and qualified.
- Canvas remains usable with no Browser tab and keeps its existing iframe sandbox and single-writer source contract.
- At most one untrusted native view is visible; privileged UI first hides or shrinks it.
- Every Browser tab uses an allowed explicit partition, stable ID, current page generation, and governed lifecycle.
- Persistent profile state survives restart only in its own partition; ephemeral state never does.
- Remote pages cannot reach Node, Electron, local files, application service, project APIs, privileged IPC, another profile, loopback, or private/link-local targets.
- Every navigation, redirect, popup, protocol, permission, download, drag/drop, and OAuth transition follows the explicit deny matrix.
- Every agent observation/action is grant-, origin-, generation-, data-, and effect-bound; stale or unknown state fails closed.
- Commit intent is durable before the effect and duplicate execution is rejected.
- Captures are view-targeted, bounded, redacted, rights-classified, attributable, local by default, and subordinate to typed proposals and candidate gates.
- The packaged sidecar and offline mode cannot finalize source, candidate, approval, qualification, release, provider, or appointment state.
- Renderer/app crashes, trusted-shell reload, update, downgrade, offline use, and memory pressure preserve the tab registry without exposing or silently corrupting browser/project state.
- Shared project state contains no cookies, passwords, raw storage, automatic history, raw snapshots, browser credential, or profile partition path.

## 12. Retained-implementation boundary

There is no authorized first retained implementation yet. The next permitted output is BR-0's corrected contract and external hostile-fixture specification. A separately authorized disposable BR-1 harness may run only after active owner assignments and an independent verifier are recorded. Retained BR-2 product code remains blocked until EB-001, EB-004, EB-008, EB-009, EB-014, EB-015, and EB-021 are CLOSED on current evidence and the accepted topology selects the desktop boundary.

No favorable model audit, prototype screenshot, successful packaging run, or plan wording can substitute for those closures. Agent control, capture attachment, reconstruction, cloud sharing, OAuth callback, password/cookie import, and Personal profiles remain outside the first retained slice.
