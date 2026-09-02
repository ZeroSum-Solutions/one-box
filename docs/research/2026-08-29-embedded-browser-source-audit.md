# ONE BOX embedded browser source audit

**Date:** 2026-08-29

**Status:** Architecture research and recommended course; not an implementation claim

**Scope:** Current source at pinned GitHub revisions for EGO Lite, Tandem Browser, BrowserOS, Nyra, WebPilot, Partitions/multiprofile-browser, browser-use, agent-browser, and official Electron guidance

## Executive decision

Build the browser as a native part of the future ONE BOX desktop shell:

- ONE BOX has one top-level tab strip containing typed tabs such as `Canvas`, `Browser`, `Plan`, and `Review`.
- Pressing the visible `+` button or `Command-T` opens a `Browser` tab immediately. It does not open Chrome and does not navigate away from ONE BOX.
- Every browser tab owns one Electron `WebContentsView` and one stable ONE BOX `browserTabId`.
- The selected browser tab's view is mounted into the shell's content rectangle. Inactive views are detached from the visible hierarchy but retain their browsing state.
- Human and agent operations target the same `WebContents`. The agent does not drive a second hidden Playwright browser.
- Agent observation and action use Electron's in-process `webContents.debugger` Chrome DevTools Protocol surface. ONE BOX does not expose a public remote-debugging port.
- Browser identity is local and explicit. A tab selects a named local profile backed by an Electron session partition. Project records may refer to a profile ID, but cookies, passwords, and raw browser storage do not sync to the project cloud.
- Screenshots, DOM/AX observations, computed styles, and selected assets enter the project only through a governed `ReferenceArtifact` capture. They remain evidence or proposals until translated into the approved design contract, Page IR, or a guarded experience module.

This is the best fit for the product promise: open a tab beside the Canvas, browse with normal logged-in state, capture an idea, ask the agent to reconstruct or adapt it, inspect the diff, and return to the Canvas without leaving ONE BOX.

## Why this is the right shape

The repositories divide into three categories:

1. **Browser product references:** Tandem, BrowserOS, EGO Lite, Nyra, and Partitions show useful human/browser/agent interaction patterns.
2. **Automation references:** agent-browser and browser-use provide the strongest observation, stable-target, policy, and recording patterns.
3. **Agent-workspace references:** WebPilot provides runs, threads, artifacts, and model/tool orchestration patterns.

No audited repository should become the ONE BOX runtime unchanged. Some use Electron's discouraged `<webview>` architecture, some control a separate browser, two impose strong copyleft obligations, one publishes no usable browser source, and one has no repository license text. ONE BOX should clean-room the product behavior around current Electron APIs and selectively port permissively licensed automation ideas.

## Audit method and limits

- Each repository was shallow-cloned from its current GitHub default branch on 2026-08-29.
- Commit IDs and commit dates below came from `git rev-parse HEAD` and `git show -s --format=%cI HEAD`.
- Architecture, security, session, tab, screenshot, and agent-control claims were checked against files at those exact revisions.
- This was a source inspection, not a full build, penetration test, or legal opinion.
- A repository's current commit date establishes freshness of the inspected revision, not production readiness or maintainership quality.
- License compatibility statements are engineering risk flags. Counsel should make the final license determination before any code is copied.

## Source comparison

| Project | Inspected revision | License at revision | What the source actually provides | ONE BOX disposition |
| --- | --- | --- | --- | --- |
| [citrolabs/ego-lite](https://github.com/citrolabs/ego-lite/commit/5ca3c36cba2240b8df2e22ba32127747029039d5) | `5ca3c36`, 2026-08-24 | MIT for repository contents | TypeScript agent helper layer over a separately distributed Chromium browser runtime | Borrow task-space, ownership/handoff, snapshot, and CDP ergonomics. The GitHub repo cannot supply an embeddable EGO browser. |
| [hydro13/tandem-browser](https://github.com/hydro13/tandem-browser/commit/3b613cfd4c299609ca7ca415d638c1b71c6ba5de) | `3b613cf`, 2026-08-16 | MIT | Full Electron browser shell, tabs, workspaces, sessions, MCP/HTTP control, snapshots, downloads, and handoffs | Strong product reference. Port selected manager/data patterns, but replace its `<webview>` implementation and permissive permission fallback. |
| [browseros-ai/BrowserOS](https://github.com/browseros-ai/BrowserOS/commit/83846a6625e084ae98da9428a7c1099c7977c989) | `83846a6`, 2026-08-27 | AGPL-3.0 | Chromium fork plus Rust/TypeScript/Go agent platform, MCP, tab ownership, observation, replay, and prompt-injection fencing | Architecture/reference only unless ONE BOX deliberately accepts AGPL obligations or obtains another license. Far too heavy for an embedded tab feature. |
| [Zeyzers/nyra](https://github.com/Zeyzers/nyra/commit/ce5ad13c96a5721ee637c8a7eeb5976504f5683c) | `ce5ad13`, 2026-06-10 | MIT | Conventional Electron browser UX: tabs, Spaces, bookmarks, history, downloads, permissions, site data, password store | UX reference only. Reject its `<webview>` and deprecated `BrowserView` core. |
| [ahamSel/WebPilot](https://github.com/ahamSel/WebPilot/commit/afd8ea4b5bedaf083270f868ff0c10b86cd17398) | `afd8ea4`, 2026-07-28 | GPL-3.0-or-later | Next.js/Electron agent workspace controlling a separate Playwright browser; runs, threads, artifacts, providers, recorder | Reference only. Clean-room the Agent Studio/run-history ideas; do not copy GPL code into a closed product. |
| [dmshust86/multiprofile-browser](https://github.com/dmshust86/multiprofile-browser/commit/2608c393a1c7285d663038172ca602fb1bd192a6) | `2608c39`, 2026-06-12 | `package.json` says MIT; no `LICENSE`/`COPYING` file | Compact Electron `WebContentsView` browser with per-profile partitions, tab movement, recovery, and temporary sessions | Closest implementation-shaped reference, but clean-room it from Electron docs until its license is clarified. |
| [browser-use/browser-use](https://github.com/browser-use/browser-use/commit/2e32d260341fae39c80bc8529ec174bad91e7672) | `2e32d26`, 2026-08-28 | MIT | Python agent framework using direct CDP, enhanced DOM representations, watchdogs, history, screenshots, video, HAR, and traces | Pattern donor only for MVP. Port bounded ideas; do not introduce a Python browser runtime into the desktop shell. |
| [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser/commit/fbd046c23a2c1156891bda294aaaee715c23b3f1) | `fbd046c`, 2026-08-26 | Apache-2.0 | Rust CLI/daemon over Chrome CDP with stable tabs, snapshots, screenshots, policies, sessions, recording, and an optional dashboard | Strongest automation reference. Port its protocol and safeguards behind an Electron-backed adapter; keep the tool itself optional and isolated. |

## Repository findings

### EGO Lite: best human/agent handoff language, not an embeddable source base

The EGO repository is easy to misread. Its [README](https://github.com/citrolabs/ego-lite/blob/5ca3c36cba2240b8df2e22ba32127747029039d5/README.md) states that the repository contents are MIT while the actual EGO Lite browser is a separate free download. The open source is principally the Node/TypeScript helper bundle that runs against `globalThis.ego`, a capability supplied by the absent native browser runtime.

Reusable ideas include:

- Named task spaces with explicit agent/user ownership and handoff.
- A code-oriented helper surface that lets an agent compose several browser operations coherently.
- Semantic snapshots first, screenshot/coordinates for visual or canvas-heavy pages, and raw CDP as the advanced escape hatch.
- Strong stop semantics when the human takes control.
- Download and screencast abstractions.

Relevant sources:

- [Browser runtime bridge and target selection](https://github.com/citrolabs/ego-lite/blob/5ca3c36cba2240b8df2e22ba32127747029039d5/package/ego-browser/src/browser-runtime.ts)
- [Raw CDP/evaluate surface](https://github.com/citrolabs/ego-lite/blob/5ca3c36cba2240b8df2e22ba32127747029039d5/package/ego-browser/src/cdp-eval.ts)
- [Snapshot and screenshot observation](https://github.com/citrolabs/ego-lite/blob/5ca3c36cba2240b8df2e22ba32127747029039d5/package/ego-browser/src/driver/observe.ts)
- [Tab navigation helpers](https://github.com/citrolabs/ego-lite/blob/5ca3c36cba2240b8df2e22ba32127747029039d5/package/ego-browser/src/driver/nav.ts)
- [Downloads](https://github.com/citrolabs/ego-lite/blob/5ca3c36cba2240b8df2e22ba32127747029039d5/package/ego-browser/src/driver/downloads.ts)
- [Agent-facing task-space and handoff contract](https://github.com/citrolabs/ego-lite/blob/5ca3c36cba2240b8df2e22ba32127747029039d5/skills/ego-browser/SKILL.md)

**Course:** adopt the control vocabulary and interaction hierarchy. Do not plan to embed EGO Lite itself: the GitHub source does not contain the browser chrome, profile, or kernel implementation needed to do that.

### Tandem: closest complete product reference, dated embedding choice

Tandem is the richest open Electron product reference in the set. Its main process has a tab manager, named sessions, workspaces, bookmarks, history, downloads, snapshots, tab locks, human handoffs, an authenticated local API, and MCP tools. Its tab record already carries identity, URL, title, favicon, source, grouping, and partition fields. See [TabManager](https://github.com/hydro13/tandem-browser/blob/3b613cfd4c299609ca7ca415d638c1b71c6ba5de/src/tabs/manager.ts), [SessionManager](https://github.com/hydro13/tandem-browser/blob/3b613cfd4c299609ca7ca415d638c1b71c6ba5de/src/sessions/manager.ts), and [API server](https://github.com/hydro13/tandem-browser/blob/3b613cfd4c299609ca7ca415d638c1b71c6ba5de/src/api/server.ts).

However, its visible pages are renderer-created Electron `<webview>` elements with `allowpopups`, and the main shell enables `webviewTag`. [The tab renderer shows this directly](https://github.com/hydro13/tandem-browser/blob/3b613cfd4c299609ca7ca415d638c1b71c6ba5de/shell/js/tabs.js#L204-L227). Electron currently recommends avoiding `<webview>` because of stability concerns. Tandem workspaces also usually organize tabs over the shared `persist:tandem` partition rather than giving every workspace a distinct identity partition. Its permission-monitoring path requires careful review because unspecified cases may pass rather than default-deny.

Useful patterns:

- Stable main-process tab registry and tab source labels.
- Session restore and crash-safe state.
- Agent-created tab indicators and tab locks.
- Downloads, activity events, snapshot references, and human handoff records.
- Bearer-token local API with timing-safe comparisons and bounded CORS.
- User approval before an agent weakens security posture.

Reject or rewrite:

- `<webview>` and `allowpopups`.
- A renderer that owns remote browsing surfaces.
- Shared identity state merely because tabs share a logical workspace.
- Any allow-by-default permission behavior.
- The enormous MCP/HTTP surface as an MVP starting point.

### BrowserOS: powerful full-browser reference, wrong product and license boundary

BrowserOS contains two browser products in one monorepo: a Chromium fork for people and a secondary agent browser. The source combines Chromium patches, an agent platform, CDP bindings, MCP endpoints, a new-tab dashboard, session replay, and external-agent connections. [The monorepo README documents the split](https://github.com/browseros-ai/BrowserOS/blob/83846a6625e084ae98da9428a7c1099c7977c989/README.md).

The best patterns for ONE BOX are:

- Separate human and agent tab ownership with visible colored grouping.
- Closing an agent session closes its owned tabs without touching human tabs.
- A stable CDP page registry rather than positional tab indexes.
- Accessibility-tree and iframe-aware observation.
- Annotated screenshots and replayable action evidence.
- Explicit trust-boundary wrapping for page-derived content before it reaches an agent.

Relevant sources:

- [Human/agent tab isolation model](https://github.com/browseros-ai/BrowserOS/blob/83846a6625e084ae98da9428a7c1099c7977c989/docs/neo/tabs-and-isolation.mdx)
- [Stable page registry](https://github.com/browseros-ai/BrowserOS/blob/83846a6625e084ae98da9428a7c1099c7977c989/packages/browseros-agent/packages/browser-core/src/core/pages.ts)
- [AX/iframe observer](https://github.com/browseros-ai/BrowserOS/blob/83846a6625e084ae98da9428a7c1099c7977c989/packages/browseros-agent/packages/browser-core/src/core/observer/observer.ts)
- [Screenshot capture](https://github.com/browseros-ai/BrowserOS/blob/83846a6625e084ae98da9428a7c1099c7977c989/packages/browseros-agent/packages/browser-core/src/core/screenshot.ts)
- [Prompt-injection trust boundary](https://github.com/browseros-ai/BrowserOS/blob/83846a6625e084ae98da9428a7c1099c7977c989/packages/browseros-agent/packages/browser-mcp/src/tools/trust-boundary.ts)
- [AGPL-3.0 license](https://github.com/browseros-ai/BrowserOS/blob/83846a6625e084ae98da9428a7c1099c7977c989/LICENSE)

**Course:** study the architecture and interaction model. Do not base ONE BOX on a Chromium fork. A Chromium fork adds a large build, patch, release, security-update, extension, and signing burden that is disproportionate to opening a browser next to the Canvas. AGPL also makes direct code use unsuitable without a deliberate licensing decision.

### Nyra: useful conventional browser UX, obsolete core for ONE BOX

Nyra is a small, legible Electron browser with tabs, Spaces, bookmarks, bookmark folders, history, downloads, site-data controls, permissions, password storage, and session restore. Its [main process](https://github.com/Zeyzers/nyra/blob/ce5ad13c96a5721ee637c8a7eeb5976504f5683c/main.js) and [renderer](https://github.com/Zeyzers/nyra/blob/ce5ad13c96a5721ee637c8a7eeb5976504f5683c/src/renderer.js) are useful for understanding expected browser affordances.

Its page tabs use `<webview>` with `webviewTag: true`, and docked DevTools use deprecated `BrowserView`. It has no durable agent session, target lease, action policy, snapshot protocol, or project capture layer.

**Course:** borrow only product behaviors such as bookmark folders, history, download management, site permissions, and persistent Spaces. Do not adopt its embedding architecture.

### WebPilot: Agent Studio reference, not the browser surface

WebPilot is a Next.js interface packaged in Electron around an agent runtime and Playwright MCP driver. It supports managed browsers, installed channels, custom executables, and CDP connections; it records run summaries, JSONL steps, artifacts, and thread follow-ups. See its [architecture](https://github.com/ahamSel/WebPilot/blob/afd8ea4b5bedaf083270f868ff0c10b86cd17398/ARCHITECTURE.md), [Playwright driver](https://github.com/ahamSel/WebPilot/blob/afd8ea4b5bedaf083270f868ff0c10b86cd17398/lib/playwright-mcp-driver.ts), and [recorder](https://github.com/ahamSel/WebPilot/blob/afd8ea4b5bedaf083270f868ff0c10b86cd17398/lib/recorder.ts).

It does not render arbitrary sites as tabs inside its Electron shell; it drives another browser. The code is GPL-3.0-or-later. The inspected Electron configuration also sets `sandbox: false`, and local model settings need a more protective credential boundary than its files/localStorage approach.

**Course:** clean-room its run/thread/artifact and normalized provider/tool interaction ideas for Agent Studio. Do not use its runtime or code as the ONE BOX browser foundation.

### Partitions/multiprofile-browser: closest small WebContentsView example, unclear copying rights

This compact project is the closest source example of the desired rendering shape. Each tab is a `WebContentsView`; profile tabs use `session.fromPartition('persist:profile-<uuid>')`; temporary tabs use memory-only partitions and clear their storage; tabs can move between windows; a recovery journal restores URLs. See [browser-window.js](https://github.com/dmshust86/multiprofile-browser/blob/2608c393a1c7285d663038172ca602fb1bd192a6/src/main/browser-window.js), [sessions.js](https://github.com/dmshust86/multiprofile-browser/blob/2608c393a1c7285d663038172ca602fb1bd192a6/src/main/sessions.js), and [recovery.js](https://github.com/dmshust86/multiprofile-browser/blob/2608c393a1c7285d663038172ca602fb1bd192a6/src/main/recovery.js).

It has no agent control layer. Its package metadata says MIT, but the repository contains no `LICENSE` or `COPYING` file at the pinned revision. A metadata string is not an adequate copying basis. The latest code also contains proxy-rotation behavior that is not central to ONE BOX and should not be inherited.

**Course:** use it to validate that the interaction is practical, then clean-room the implementation from official Electron documentation unless the maintainer clarifies licensing.

### browser-use: strong planning and observation patterns, wrong MVP runtime language

browser-use is a Python agent framework built around an `Agent`, tools, a `BrowserSession`, an event bus, watchdogs, CDP, provider adapters, and stored histories. It handles DOM serialization, screenshots, GIF/video, HAR, tracing, allowed/prohibited domains, and persistent user data. See [Agent service](https://github.com/browser-use/browser-use/blob/2e32d260341fae39c80bc8529ec174bad91e7672/browser_use/agent/service.py), [BrowserSession](https://github.com/browser-use/browser-use/blob/2e32d260341fae39c80bc8529ec174bad91e7672/browser_use/browser/session.py), [profile settings](https://github.com/browser-use/browser-use/blob/2e32d260341fae39c80bc8529ec174bad91e7672/browser_use/browser/profile.py), and [security watchdog](https://github.com/browser-use/browser-use/blob/2e32d260341fae39c80bc8529ec174bad91e7672/browser_use/browser/watchdogs/security_watchdog.py).

Its optional security-disabling flags, Docker sandbox reductions, default telemetry, and cloud-sync behavior are not ONE BOX defaults. Domain navigation controls also do not replace a complete request/subresource/action policy.

**Course:** port narrow MIT patterns for plan/act/observe, history, watchdogs, and structured DOM state. Keep Python and its browser lifecycle out of the desktop MVP.

### agent-browser: strongest automation protocol donor

agent-browser is a native Rust CLI/daemon that speaks directly to Chrome over CDP. It provides:

- Stable tab IDs and labels instead of shifting array positions.
- Persistent named sessions and strict pinned target bindings.
- Accessibility snapshots with stable element references.
- DOM, text, computed-style, screenshot, PDF, HAR, trace, profile, video, and live-view operations.
- Content-boundary marking, domain and subresource controls, action policies, and confirmation rules.
- Bounded output and plugin capability surfaces.
- Unix-domain sockets on macOS/Linux rather than a universal public TCP API.

See the [behavior and security documentation](https://github.com/vercel-labs/agent-browser/blob/fbd046c23a2c1156891bda294aaaee715c23b3f1/README.md), [daemon transport](https://github.com/vercel-labs/agent-browser/blob/fbd046c23a2c1156891bda294aaaee715c23b3f1/cli/src/native/daemon.rs), [stable tab binding](https://github.com/vercel-labs/agent-browser/blob/fbd046c23a2c1156891bda294aaaee715c23b3f1/cli/src/native/tab_binding.rs), [policy engine](https://github.com/vercel-labs/agent-browser/blob/fbd046c23a2c1156891bda294aaaee715c23b3f1/cli/src/native/policy.rs), and [snapshot implementation](https://github.com/vercel-labs/agent-browser/blob/fbd046c23a2c1156891bda294aaaee715c23b3f1/cli/src/native/snapshot.rs).

The safeguards are configurable and cannot simply be presumed active. Persisted state also needs explicit encryption policy. A Chrome remote-debugging endpoint effectively grants complete control to a capable local process.

**Course:** make its stable target handles, snapshot contract, content boundaries, action policy, and recording concepts the main automation reference. Implement those ideas in a typed `BrowserControlAdapter` backed by the already-owned Electron `WebContents`; do not use an open remote-debugging port between ONE BOX and its own tabs. agent-browser itself can remain an optional isolated QA/research sidecar later.

## Recommended ONE BOX browser architecture

```text
Signed ONE BOX desktop application
|
+-- Main process (trusted)
|   |
|   +-- ShellWindow
|   +-- WorkspaceTabRegistry
|   |   +-- CanvasTab
|   |   +-- BrowserTab -> WebContentsView
|   |   +-- PlanTab
|   |   +-- ReviewTab
|   |
|   +-- BrowserProfileManager
|   |   +-- persist:onebox-profile-<localProfileId>
|   |   +-- onebox-ephemeral-<nonce> (memory-only)
|   |
|   +-- BrowserControlAdapter
|   |   +-- webContents.debugger / CDP
|   |   +-- AX + DOM observations
|   |   +-- screenshots + computed styles
|   |   +-- input/navigation/download operations
|   |
|   +-- BrowserActionPolicy
|   +-- CaptureService -> governed ReferenceArtifact
|   +-- Local encrypted browser metadata and audit log
|
+-- Shell renderer (trusted UI, sandboxed)
|   +-- top tab strip, address bar, bookmarks, history, downloads
|   +-- Agent Studio and visible control/confirmation state
|   +-- no direct Node or unrestricted Electron API
|
+-- Remote page renderers (untrusted, sandboxed)
    +-- no Node integration
    +-- no ONE BOX preload bridge
    +-- no direct project filesystem or IPC access
```

### Electron choices

Use `WebContentsView`, not `BrowserView` and not `<webview>`. Electron defines `WebContentsView` as the current main-process view for displaying a `WebContents`, and its example shows multiple views attached to one window. Electron marks `BrowserView` deprecated and [recommends avoiding `<webview>`](https://www.electronjs.org/docs/latest/api/webview-tag#warning).

Each browser tab gets web preferences equivalent to:

```ts
{
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  session: profileSession,
}
```

The production implementation must follow the installed Electron version's types rather than copying this illustrative object verbatim.

Electron's [`session.fromPartition`](https://www.electronjs.org/docs/latest/api/session#sessionfrompartitionpartition-options) contract is the identity primitive: names beginning with `persist:` survive restarts; names without that prefix are memory-only. Permission check and permission request handlers must be installed on every remote-content session.

For agent control, Electron's [`webContents.debugger`](https://www.electronjs.org/docs/latest/api/debugger) attaches directly to a known `WebContents` and sends CDP commands in-process. That avoids launching another browser and avoids opening a machine-wide debugging port.

## Tab interaction model

### One strip, multiple tab types

Do not create one set of “Canvas tabs” and a second set of “browser tabs.” Use one typed top-level strip:

```text
[ Canvas: Homepage ] [ Browser: Awwwards ] [ Browser: Client site ] [ Plan: Launch ] [+]
```

Every record has a stable ID and a discriminated kind:

```ts
type WorkspaceTab =
  | { kind: "canvas"; tabId: string; runId: string; pageId: string }
  | { kind: "browser"; tabId: string; browserTabId: string; localProfileId: string }
  | { kind: "plan"; tabId: string; projectId: string; documentId: string }
  | { kind: "review"; tabId: string; runId: string; reviewId: string };
```

The exact contract belongs in the future desktop package, not in the current website-builder `src/lib/contracts.ts`, until desktop implementation is authorized.

### `+` and keyboard behavior

- Clicking `+` immediately opens a new `Browser` tab with the project new-tab page focused in the address field.
- `Command-T` performs the same action from anywhere in ONE BOX.
- A small adjacent disclosure, or long press/right click on `+`, can create another Canvas, Plan, or Review tab without slowing the default browser action.
- `Command-L` focuses the address/search field when the selected tab is a Browser tab. From another tab type it creates a Browser tab and focuses that field.
- Links opened from the Canvas, evidence ledger, agent responses, or project sources create a Browser tab in the same strip.
- `Command-Shift-C` captures the current browser selection/viewport into the active project. It never silently writes generated code.
- Closing an agent-owned tab requires the controller to cancel or retarget the active task. Closing a task may offer to close all tabs owned only by that task.

### Browser tab chrome

The browser tab surface should include only familiar, high-value controls:

- Back, forward, reload/stop.
- Address/search field with security/origin indicator.
- Project bookmark button.
- Capture button with selection, element, viewport, full-page, and short recording modes.
- Profile chip showing the exact local identity in use.
- Agent-control indicator: `You`, `Agent observing`, `Agent acting`, `Waiting for you`, or `Paused`.
- Overflow for downloads, site permissions, history, DevTools, duplicate tab, move to profile, and ephemeral reopen.

Agent Studio remains available as the persistent right-side workbench. It does not cover the page or invent a second chat tied only to Browser mode.

## Local profile and session model

Do not equate a project with a login identity. Designers often use the same agency accounts across several projects, while a client account must remain isolated. Use explicit local profiles:

| Profile kind | Session partition | Use | Sync policy |
| --- | --- | --- | --- |
| Agency Work | `persist:onebox-profile-<uuid>` | Shared agency research and tools | Profile metadata may sync; raw session state never syncs |
| Client | `persist:onebox-profile-<uuid>` | Client-specific accounts and permissions | Local to the assigned Mac unless a future explicit secure migration exists |
| Project Research | `persist:onebox-profile-<uuid>` | Isolated research for one project | Local identity state; project role hint may sync |
| Personal | `persist:onebox-profile-<uuid>` | User's personal bookmarks/logins when deliberately selected | Local only |
| Private | `onebox-ephemeral-<nonce>` | Untrusted research, clean-session QA, sensitive one-off work | Memory-only; clear on close |
| Agent Sandbox | `onebox-agent-<nonce>` or bounded persistent partition | Agent work that must not inherit a human login | Local only; explicit retention |

A project stores only a preferred local profile reference or role hint. If that profile does not exist on another teammate's Mac, ONE BOX asks them to map or create one. It must never sync cookies, passwords, OAuth refresh tokens, IndexedDB, service workers, or cache through Supabase.

Bookmarks require two scopes:

- **Personal/profile bookmarks:** local, useful across projects.
- **Project bookmarks:** shared URLs, titles, notes, tags, and captured evidence references. They do not carry authentication state.

## Browser control contract

The agent sees a bounded adapter rather than raw Electron or arbitrary CDP by default:

```ts
interface BrowserControlAdapter {
  listTabs(): Promise<BrowserTabSummary[]>;
  observe(tabId: BrowserTabId, options: ObserveOptions): Promise<BrowserObservation>;
  navigate(tabId: BrowserTabId, request: NavigateRequest): Promise<NavigationReceipt>;
  act(tabId: BrowserTabId, action: BrowserAction): Promise<ActionReceipt>;
  capture(tabId: BrowserTabId, request: CaptureRequest): Promise<CaptureDraft>;
  waitFor(tabId: BrowserTabId, condition: WaitCondition): Promise<WaitReceipt>;
  requestControl(tabId: BrowserTabId, taskId: AgentTaskId): Promise<ControlLease>;
  releaseControl(leaseId: ControlLeaseId): Promise<void>;
}
```

Important invariants:

- Every tab, element reference, control lease, action, observation, and capture has a stable ID.
- Element references are scoped to an observation revision and fail clearly when stale.
- A task cannot act without a current lease for that tab.
- Human interaction immediately pauses or revokes agent control according to the visible mode.
- Every mutating action writes an ordered audit event before the next action is accepted.
- Raw page content is always marked untrusted before it enters model context.
- The adapter enforces output bounds and redacts password fields, payment fields, session tokens, and configured sensitive regions.
- Arbitrary `Runtime.evaluate` is an elevated developer capability, not an ordinary model tool.

## Capture-to-Canvas pipeline

Opening a browser tab is useful only if it connects cleanly to the evidence and build pipeline.

```text
Browse in ONE BOX
  -> select element / region / viewport / page
  -> capture DOM + AX + screenshot + computed style + source URL
  -> create immutable ReferenceArtifact draft
  -> label rights, source, confidence, purpose, and project scope
  -> agent proposes pattern, component, token, layout, copy, or motion interpretation
  -> designer previews proposal and source comparison
  -> explicit apply creates a guarded Page IR/design-contract/asset change
  -> normal editor, qualification, approval, and shipping gates continue
```

Recommended `ReferenceArtifact` contents:

- Project, actor, device, browser tab, local profile role, and capture timestamp.
- Final URL, origin, page title, viewport, device scale, and navigation chain.
- Screenshot hash and bounded image bytes.
- Sanitized DOM/AX fragment and computed-style subset when requested.
- Source element geometry and stable capture-local references.
- Selected asset URLs plus retrieval status, media type, dimensions, and hashes.
- Source/evidence/inference/generated classification.
- Rights state and allowed use: inspiration, factual evidence, licensed reuse, or blocked.
- Prompt/model/skill/tool versions for any reconstruction proposal.
- Link to every downstream proposal and applied Page IR revision.

The captured site's DOM is never the editable authority. The approved design contract and Page IR remain authoritative for ONE BOX-generated sites.

## Security boundary

The browser makes the desktop application a renderer of hostile internet content. Treat it as a separate security program, not a routine UI feature.

Electron's [security checklist](https://www.electronjs.org/docs/latest/tutorial/security) requires the relevant baseline: no Node integration for remote content, context isolation, renderer sandboxing, handled permission requests, intact `webSecurity`, restricted navigation/window creation, validated IPC senders, and no broad Electron API exposure.

### Required controls

1. **Remote pages receive no ONE BOX preload API.** The shell renderer and remote page renderers are separate trust zones.
2. **Deny-by-default permissions.** Camera, microphone, screen, notifications, clipboard, geolocation, HID, USB, serial, Bluetooth, MIDI, sensors, and filesystem access require explicit policy and user-visible decisions.
3. **Convert popups to typed tabs.** Use `setWindowOpenHandler` and validate URL schemes. Do not permit arbitrary child windows or `allowpopups`.
4. **Allow normal public web navigation, but block unsafe schemes.** `javascript:`, arbitrary `file:`, privileged internal routes, and unexpected custom protocols fail closed.
5. **Agent action policy:**
   - Observe, scroll, and same-origin navigation may be preauthorized per task.
   - Typing ordinary draft text may be allowed when the destination and field are visible.
   - Sending messages, publishing, purchasing, accepting terms, deleting, changing account/security settings, granting permissions, downloading executables, and revealing credentials always require human confirmation.
6. **Content boundaries and prompt-injection defense.** Page text, accessibility labels, downloaded files, and hidden DOM are untrusted evidence, never agent instructions.
7. **Download quarantine.** Record origin, referrer, MIME, size, hashes, and user/agent initiator. Scan and require confirmation before opening executable or active content.
8. **No public CDP endpoint.** Use the in-process debugger for owned tabs. Any later external connector gets authenticated, scoped IPC or a per-user local socket, not unrestricted CDP.
9. **No raw browser-state sync.** Team cloud sync handles project artifacts, tabs' shareable URLs, comments, and audit references, not identity material.
10. **Sensitive OAuth fallback.** Prefer the ONE BOX browser for ordinary authentication. If an identity provider forbids embedded user agents or requires an external browser, use a system-browser OAuth flow with a verified callback into ONE BOX and make the exception explicit.

## Team collaboration boundary

The same project can show that Devin is on a Canvas tab and another designer is on a Browser tab, but their remote pages remain local to their Macs.

Shareable live state:

- Typed tab title/kind and optional shareable URL.
- Presence, cursor/viewport indicators, comments, assignments, and agent-task status.
- Captured `ReferenceArtifact` records and permitted image/DOM evidence.
- PRDs, decisions, Page IR changes, review artifacts, and audit receipts.
- Optional LiveKit screen-share track from a selected Canvas or Browser surface.

Local-only state:

- Cookies, passwords, form history, OAuth tokens, IndexedDB, localStorage, service workers, cache, client certificates, and private browsing history.
- Page contents from origins or accounts that the user did not explicitly share.
- An agent control lease on one teammate's machine. Another machine receives a request, not the lease itself.

## Recommended implementation sequence

### E4.0. Desktop containment spike

Prove a signed-development Electron shell can host the current ONE BOX web UI and one `WebContentsView` without changing the Page IR or pipeline authority.

Acceptance:

- `+` and `Command-T` open a Browser tab beside a Canvas tab.
- Switching tabs mounts the correct view with no overlap or input bleed.
- Remote page has no Node, filesystem, or unrestricted IPC access.
- Popup, permission, crash, and certificate-error paths fail safely.
- Apple Silicon development build starts and quits cleanly.

### E4.1. Typed tab registry and lifecycle

Create the stable top-level tab contract, activation behavior, lazy view creation, detach/reattach behavior, close semantics, session restore, and crash recovery.

Acceptance:

- Tab IDs never depend on array position.
- Restored Canvas and Browser tabs retain kind and safe state.
- Closing one tab cannot retarget an agent silently.
- Inactive views do not render over the active workspace.

### E4.2. Local profiles and familiar browsing

Add named persistent profiles, ephemeral sessions, address/search, navigation, project/profile bookmarks, history, downloads, site permissions, and profile indicators.

Acceptance:

- Cookies persist only in the selected persistent profile.
- Private profile storage is absent after close/restart.
- Project bookmark sync does not include login state.
- Every permission has an explicit allow/deny/prompt result and durable scope.

### E4.3. Read-only BrowserControlAdapter

Attach the Electron debugger internally and implement tab listing, page metadata, bounded AX/DOM observation, screenshots, computed styles, network-idle/load waits, and stale-reference detection.

Acceptance:

- No remote-debugging port is opened.
- Observation works across navigation and same-origin frames; cross-origin limitations are explicit.
- Password and configured sensitive inputs are redacted.
- Page-derived output is marked untrusted and bounded.

### E4.4. Controlled action and human handoff

Add navigation, click, typing, selection, scroll, file input, downloads, action policies, control leases, visible agent state, confirmations, pause/takeover, and ordered audit events.

Acceptance:

- Human takeover prevents subsequent agent actions until a new lease is granted.
- Side-effect actions cannot bypass confirmation through raw CDP/evaluate.
- Audit receipts identify task, model route, actor, tab, observation, policy result, and outcome.
- Closing or crashing a controlled tab terminates or explicitly retargets its task.

### E4.5. Governed capture into the project

Implement region, element, viewport, full-page, and short-recording capture plus immutable provenance and rights classification.

Acceptance:

- Capture creates a draft artifact, never an automatic Page IR edit.
- Every applied proposal links back to exact capture hashes and source URL.
- Rights state can block asset reuse while preserving allowed inspiration notes.
- Screenshot/DOM/style inputs are size-bounded and sanitized.

### E4.6. Agent Studio browser skills

Expose bounded tools and slash skills such as `/research`, `/capture`, `/design`, `/rebuild-section`, `/compare`, and `/qa-page`. Route models through the existing model policy rather than hardcoding a browser-specific model list.

Acceptance:

- Model switching preserves a normalized, hashed context bundle.
- Skills declare capabilities and cannot escalate into raw CDP or filesystem access silently.
- Compare mode reads the same captured evidence without allowing multiple writers to the same Page IR revision.

### E4.7. Collaboration, client room, and release hardening

Add shareable presence, optional cursor/viewport following, LiveKit screen share, client annotations, auto-update/signing/notarization, browser regression suites, and an independent security review.

Acceptance:

- Shared project state works across different networks without sharing browser credentials.
- Client participants cannot obtain browser-control or project-write authority by joining a screen share.
- The final app is signed/notarized and update rollback is defined.
- Browser security, capture provenance, Page IR authority, and release gates pass independent review.

## Build versus borrow decision

### Safe candidates for selective code-level adaptation

Subject to attribution and a final license check:

- agent-browser's Apache-2.0 stable tab handles, policy vocabulary, snapshot/recording protocols.
- browser-use's MIT observation/history/watchdog patterns.
- Tandem's MIT tab/source/activity/download/handoff data patterns.
- EGO helper repo's MIT task-space and explicit control-handoff ergonomics.
- Nyra's MIT conventional browser UX details.

### Reference only

- BrowserOS because it is AGPL-3.0 and is a full Chromium-fork program.
- WebPilot because it is GPL-3.0-or-later.
- multiprofile-browser until an actual license grant is present in the repository.
- The non-repository EGO Lite browser binary and native runtime.

### Build directly from primary platform APIs

- `WebContentsView` ownership, layout, attach/detach, and destruction.
- Electron session partitions and permission handlers.
- Browser popup, navigation, download, certificate, and crash handling.
- In-process `webContents.debugger` attachment.
- The trusted shell/remote-content IPC boundary.
- ONE BOX tab, profile, control, capture, audit, Page IR, and collaboration contracts.

## Final recommendation

The fastest responsible path is not to fork a browser and not to bolt Playwright onto the current web app. Package ONE BOX as the planned Apple Silicon Electron application, add a main-process `WebContentsView` browser surface, and make Browser a peer tab type beside Canvas.

Use one stable tab and control model across human browsing, agent work, capture, and project history. Make agent-browser the primary automation-design reference, Tandem the primary human/agent product reference, EGO Lite the primary handoff-language reference, and multiprofile-browser the proof that per-tab `WebContentsView` plus partitions is practical. Reimplement against official Electron contracts and preserve ONE BOX's Page IR, evidence, rights, qualification, and publish boundaries.

That gives the desired experience without swallowing a Chromium fork or allowing a browser automation tool to become a second, competing source of truth.

## Primary sources

### Official Electron

- [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [BrowserView deprecation](https://www.electronjs.org/docs/latest/api/browser-view)
- [`<webview>` warning](https://www.electronjs.org/docs/latest/api/webview-tag#warning)
- [Session and persistent partitions](https://www.electronjs.org/docs/latest/api/session)
- [In-process debugger/CDP](https://www.electronjs.org/docs/latest/api/debugger)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)
- [DownloadItem](https://www.electronjs.org/docs/latest/api/download-item)

### Audited repositories

- [EGO Lite pinned tree](https://github.com/citrolabs/ego-lite/tree/5ca3c36cba2240b8df2e22ba32127747029039d5)
- [Tandem Browser pinned tree](https://github.com/hydro13/tandem-browser/tree/3b613cfd4c299609ca7ca415d638c1b71c6ba5de)
- [BrowserOS pinned tree](https://github.com/browseros-ai/BrowserOS/tree/83846a6625e084ae98da9428a7c1099c7977c989)
- [Nyra pinned tree](https://github.com/Zeyzers/nyra/tree/ce5ad13c96a5721ee637c8a7eeb5976504f5683c)
- [WebPilot pinned tree](https://github.com/ahamSel/WebPilot/tree/afd8ea4b5bedaf083270f868ff0c10b86cd17398)
- [multiprofile-browser pinned tree](https://github.com/dmshust86/multiprofile-browser/tree/2608c393a1c7285d663038172ca602fb1bd192a6)
- [browser-use pinned tree](https://github.com/browser-use/browser-use/tree/2e32d260341fae39c80bc8529ec174bad91e7672)
- [agent-browser pinned tree](https://github.com/vercel-labs/agent-browser/tree/fbd046c23a2c1156891bda294aaaee715c23b3f1)
