# Embedded-browser closure requirements

- Status: proposed normative planning gate; all findings open; no implementation authorization
- Date: 2026-08-29
- Scope: EB-001 through EB-021 only
- Source evidence: `docs/audits/grok-4.6/2026-08-29-embedded-browser-plan-audit.md` (`sha256:3867c8ed7147af9e750cad585cb50425434ae0d8eb303db766989fea8141a31b`)
- Structured source evidence: `docs/audits/grok-4.6/2026-08-29-embedded-browser-plan-audit.json` (`sha256:801fc68295a5d453473195bab1f71d6ed0ed449888a828a848c61cb7c443341c`)

## Authority boundary

This file transcribes the rejected-plan findings into a non-audit-path closure
contract. The source audit remains evidence and grants no authority. This file
also grants no implementation, spike, dependency, packaging, signing, remote
content, browser-profile, CDP, capture, updater, or distribution authorization.

All rows are `OPEN`. An ID may move to `CLOSED` only after an active
`OwnerAssignmentV1` binds its owner role to a named human, the rewritten browser
plan contains the row's required control and deterministic oracle, the fixed
fixture passes on current bytes, and both the named human owner and independent
security verifier accept the evidence. EB-001 is the first stop gate. No retained
desktop or embedded-browser product code of any kind may begin while EB-001 is
open, and closing a later row cannot bypass it.

## Closure register

| ID | Severity | Title / area | Required owner role | Threat and fixed fixture | Deterministic oracle and exit gate | State |
|---|---|---|---|---|---|---|
| EB-001 | P0 | Application-service isolation | Desktop Security Owner | A hostile page attempts the application service, loopback, private/link-local targets, `file:`, and the trusted renderer's partition. | A separate trusted partition and per-launch authenticated service boundary deny every request/navigation; no hostile view obtains the service token. Close first with packaged-process evidence and independent verification. | OPEN |
| EB-002 | P1 | Privileged overlay composition | Desktop Architecture Owner | Palette, menu, permission, and commit-confirmation fixtures open while an untrusted native view is attached. | `BrowserViewManager` hides or shrinks the native view before every privileged overlay; privileged HTML is never composited over hostile content. | OPEN |
| EB-003 | P1 | Global shortcut ownership | Desktop Architecture Owner | Focused hostile pages attempt to consume application shortcuts during attach, hide, and destroy transitions. | One main-process shortcut owner handles chrome commands and deterministic focus-handoff tests pass for every lifecycle transition. | OPEN |
| EB-004 | P1 | Window and view tree | Desktop Architecture Owner | Composition, device-pixel-ratio, resize, attach, hide, and destroy fixtures exercise the proposed window tree. | The rewritten plan selects one composition tree and its DIP-bounds/lifecycle contract passes without a second view owner. | OPEN |
| EB-005 | P1 | Governed multi-tab lifecycle | Desktop Architecture Owner | `window.open`, `target=_blank`, middle-click, Command-click, and identity-provider popup fixtures run across multiple tabs. | Every new window becomes a governed tab in the opener's partition, only one view is visible, and no unmanaged `BrowserWindow` exists. | OPEN |
| EB-006 | P1 | Explicit profile partition | Identity and Tenancy Owner | A first browser tab attempts `persist:default`, the trusted-renderer session, and an unmapped partition. | The tab uses an explicit non-default profile-role partition and a tested migration contract exists before additional profiles. | OPEN |
| EB-007 | P1 | OAuth callback boundary | Identity and Tenancy Owner | OAuth/system-browser callbacks are replayed, navigated from hostile views, or bound to the wrong profile. | System-browser open is terminal, or a separately specified one-time high-entropy callback is bound to one pending profile and cannot be invoked by untrusted views. | OPEN |
| EB-008 | P1 | Navigation and protocol deny matrix | Desktop Security Owner | Scheme, protocol, redirect, drag/drop, popup, `about:blank` opener, and download fixtures attempt to escape navigation policy. | A deny-by-default matrix blocks every unlisted scheme, `file:` in Browser tabs, and all unmanaged windows; every denied fixture passes. | OPEN |
| EB-009 | P1 | Packaged hardening baseline | Desktop Security Owner | Packaged builds attempt Node/run-as-node, remote debugging, preload, disabled sandbox/context isolation, and unsafe switches. | Fuses, switch lockdown, sandbox, context isolation, zero remote preload, and no public debug port are verified before any retained shell. | OPEN |
| EB-010 | P1 | Trusted-renderer rebind | Desktop Architecture Owner | HMR, trusted-renderer reload, crash, and error-overlay fixtures occur while native views and project tabs exist. | All hostile views hide until chrome rebinds and resends bounds; project-tab identity survives without a second tab source of truth. | OPEN |
| EB-011 | P1 | CDP and model-context exclusion | Canvas and Agent Security Owner | Prompt-injected logged-in pages attempt generic CDP, `Runtime.evaluate`, cookie/storage access, hidden-field/token capture, and raw-DOM sharing. | The typed allowlist forbids those APIs, defaults agents to a sandbox profile, requires explicit human-profile grants, redacts credentials, and keeps raw DOM local. | OPEN |
| EB-012 | P1 | Effect classification and page generations | Canvas and Agent Security Owner | Click/type/select fixtures change effect after navigation, SPA mutation, DevTools attachment, or node-ID invalidation. | Effects are classified against the current page generation; unknown is Commit; confirmation binds tab/origin/generation/material inputs; debugger lease loss and stale IDs fail closed. | OPEN |
| EB-013 | P1 | View-targeted capture | Data Protection Owner | Capture fixtures attempt screen/display/window capture that includes Canvas, Agent Studio, other apps, or privileged chrome. | Only the untrusted view is captured; screen-wide capture is absent; any retained capture path emits provenance, rights, bounds, and content hashes before storage. | OPEN |
| EB-014 | P1 | Packaged sidecar authority | Website Authority Owner | Packaged/offline clients attempt to finalize Page IR or candidate writes while Track A advances. | The packaged service is a non-authoritative sidecar; offline is read-only or a conflict-visible proposal queue; only Track A can finalize source/candidate state. | OPEN |
| EB-015 | P1 | Clean-room and license separation | License and Supply-Chain Owner | An implementation provenance review detects influence or copying from AGPL, GPL, unlicensed, or non-permissive browser sources. | Electron design is justified from primary Electron documentation; non-permissive/unlicensed readers are separated from implementers; every copied permissive module has line-level license approval. | OPEN |
| EB-016 | P2 | Personal-profile scope | Identity and Tenancy Owner | Profile-role coverage fixtures attempt to place Personal state into Work or an invented partition. | Personal is either explicitly supported with isolation tests or removed from the phase contract and acceptance gates until a later authorization. | OPEN |
| EB-017 | P2 | Trusted tab chrome | Desktop Security Owner | Hostile titles/favicons spoof trusted chrome or SVG/markup executes; remote views attempt any preload. | Titles render as plain text with origin shown separately, favicons are inert bitmaps fetched in the untrusted session, and all untrusted views have no preload. | OPEN |
| EB-018 | P2 | Snapshot privacy and rights | Data Protection Owner | Cross-origin iframe, credential-field, oversized DOM/AX/style, raw-share, and unlicensed reconstruction fixtures run. | Collection is top-level-origin only unless granted, credentials are stripped, bytes are capped, raw snapshots remain local, and rights/visibility gates pass before attach or Page IR proposal. | OPEN |
| EB-019 | P2 | Ephemeral sessions and permissions | Identity and Tenancy Owner | Private/Agent Sandbox sessions face last-tab close, simulated memory pressure, restore, and every permission request. | Ephemeral sessions are destroyed rather than discarded to disk, test cookies vanish, an explicit permission allowlist exists, and all other permissions remain denied. | OPEN |
| EB-020 | P2 | Agent task and commit durability | Canvas and Agent Security Owner | Redirect, expiry, background mutation, crash-before-receipt, and duplicate-Commit fixtures exercise an agent task. | The grant binds tab, exact origins, and expiry; background mutation is forbidden or Commit; Commit intent is durably written before effect and failure prevents the action. | OPEN |
| EB-021 | P2 | Pre-retention isolation gate | Desktop Security Owner | Native-view/Canvas isolation fixtures probe preload, IPC, Node, application-service origin, `postMessage`, and crash propagation. | A written threat model plus packaged isolation tests prove distinct trust domains before any prototype retention; failure keeps the entire desktop/browser domain blocked. | OPEN |

## Rewrite and closure packets

The replacement browser plan must include this file's exact SHA-256, preserve all
twenty-one IDs without merging or narrowing them, and state the current
machine-readable owner/verifier assignment source and blocking status. A plan may
be corrected while assignments are unavailable, but it cannot claim a CLOSED row
or authorize implementation.

Before any claimed row closure or retained browser/desktop work, the closure
packet must name the active `OwnerAssignmentV1` for every owner role used by that
row, identify the qualifying non-author independent security verifier, and attach
fixed-fixture receipts for every claimed closure. Missing assignments keep the row
OPEN and implementation blocked. Any content or hash change reopens the affected
review packet. Audit prose, prototype screenshots, successful packaging, or a
favorable model verdict cannot close a row by itself.
