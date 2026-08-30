# Grok 4.6 audit: embedded browser integration plan

**Audit date:** 2026-08-29  
**Plan:** `docs/plans/2026-08-29-embedded-browser-integration.md`  
**Plan SHA-256:** `9f85e89a3e90479475629fbcc89c46f1c462c70de7ae6d973d94cf9c86a18574`  
**Requested and reported model:** `x-ai/grok-4.6`  
**Reasoning effort:** high  
**Verdict:** **REJECT**  
**Implementation authorization:** **NOT_AUTHORIZED**

## Executive finding

The current plan does not yet define a safe boundary between arbitrary websites opened in native `WebContentsView` tabs and OneBox's privileged local application service. A hostile page could navigate or redirect to a loopback, private-network, file, or application-service origin unless the shell blocks those routes and separates the trusted renderer's credentials and session.

This is a plan defect, not evidence that the browser concept is unsound. The retained Electron shell should not begin until the E4.0 and E4.1 specifications name the enforcement controls and their test oracles.

## Audit integrity

| Check | Result |
|---|---|
| Exact requested model | PASS: response reported `x-ai/grok-4.6` |
| Complete current plan supplied | PASS: 18,145 bytes |
| Plan hash reproduced | PASS |
| Structured findings returned | PASS: 21 |
| Raw response retained | PASS |
| Request packet retained | PASS |
| Secret scan of saved artifacts | PASS |

The prepaid Nous Portal attempt timed out after roughly two minutes. A full-packet OpenRouter attempt exceeded the 300-second client limit. The successful bounded attempt sent the complete normative plan through the approved OpenRouter fallback. It used 4,739 prompt tokens, 26,069 completion tokens, and 20,083 reasoning tokens. Provider-reported cost was $0.1657.

## Findings

| ID | Priority | Area | Required correction |
|---|---:|---|---|
| EB-001 | P0 | Hostile-content isolation | Give the trusted renderer an inaccessible partition and per-launch app-service credential. Block browser tabs from the app origin, loopback, private and link-local networks, and `file:`. Add a hostile-page isolation test. |
| EB-002 | P1 | Native-view occlusion | Hide or resize the browser view before every trusted overlay, including menus, command palette, permission UI, dialogs, and commit confirmations. |
| EB-003 | P1 | Keyboard ownership | Handle browser chrome shortcuts in the main process and define focus handoff for attached, hidden, and destroyed views. |
| EB-004 | P1 | Window composition | Lock the shell's native window and view tree, bounds system, lifecycle, and ownership before implementation. |
| EB-005 | P1 | Browser tab lifecycle | Maintain one managed `webContents` per browser tab, expose only the active view, and route new-window requests into managed tabs. |
| EB-006 | P1 | Profile bootstrap | Create the first browser tab in an explicit non-default partition mapped to a profile role. Define migration before retained use. |
| EB-007 | P1 | OAuth callbacks | Keep system-browser OAuth terminal in the first release. Any later callback must bind high-entropy state to the initiating profile and exclude untrusted views. |
| EB-008 | P1 | Navigation policy | Add a deny-by-default matrix for schemes, downloads, drag and drop, redirects, and `window.open`. Never allow unmanaged browser windows. |
| EB-009 | P1 | Electron hardening | Move fuses, sandbox enforcement, remote-preload prohibition, and remote-debugging controls into E4.0 and E4.1. |
| EB-010 | P1 | Reload and crash recovery | Hide native views until the trusted shell republishes bounds after reload. Preserve the tab registry and test HMR, reload, and renderer crash recovery. |
| EB-011 | P1 | Agent observation | Default agents to sandbox profiles. Require an explicit grant for human-profile observation. Block generic evaluation, cookies, storage, and raw DOM sharing; keep raw captures local. |
| EB-012 | P1 | Agent actions | Classify actions by effect, not primitive. Treat unknown effects as Commit, bind confirmations to origin and page generation, and reject stale node references. |
| EB-013 | P1 | Capture boundary | Use view-targeted capture rather than screen-wide capture. Require governed `ReferenceArtifact` receipts before any retained capture workflow. |
| EB-014 | P1 | Local and cloud authority | Make the packaged service a non-authoritative sidecar. Offline work must be read-only or an explicit proposal queue with conflict handling. |
| EB-015 | P1 | Licensing process | Keep GPL, AGPL, and unlicensed repositories reference-only. Derive the implementation from official platform documentation and require license or counsel review before reusing code. |
| EB-016 | P2 | Profile consistency | Add the Personal profile to the E4.2 implementation list or remove it from the product and acceptance sections. |
| EB-017 | P2 | Remote renderer surface | Do not install a preload in remote views. Treat favicon as inert bitmap data and show origin separately from page title. |
| EB-018 | P2 | DOM and accessibility capture | Add origin-scoped rights, redaction, byte limits, sensitive-field handling, and a rule that raw DOM stays local. |
| EB-019 | P2 | Private mode | Never suspend private tabs to disk. Destroy their state and define an explicit permission allowlist with lifecycle tests. |
| EB-020 | P2 | Agent task boundary | Bind each task to exact tabs, origins, and expiry. Record intent before side effects so retries cannot duplicate actions. |
| EB-021 | P2 | Security exit gates | Add a written threat model and executable hostile-page isolation oracles to the E4.0 and E4.1 exit gates. |

## Adjudication

Nineteen findings identify concrete omissions or contradictions in the current plan and should be accepted as written in substance.

Two findings need a narrower interpretation:

- **EB-004:** The missing composition contract is real. Grok recommends a `BaseWindow` with trusted and untrusted child views, but that is one viable correction rather than the only acceptable Electron topology. The plan must choose and test one explicit topology.
- **EB-015:** The licensing risk is real, especially for unlicensed and copyleft reference repositories. A mandatory split between auditors and implementers is a legal-process recommendation, not a confirmed legal requirement. Counsel should decide whether that separation is necessary.

## Required correction order

1. Close EB-001 and add the hostile-page oracle before any retained desktop shell work.
2. Rewrite the E4.0 and E4.1 gates to cover window composition, shortcuts, profiles, closed navigation policy, hardening, reload recovery, private state, and managed tab lifecycle.
3. Define local versus cloud authority before offline editing or local proposal queues.
4. Keep agent observation, agent action, and governed capture outside the first retained slice until their rights and receipt contracts are complete.
5. Complete the license review before implementation uses any audited repository as more than a behavioral reference.

## Accepted plan decisions

Grok accepted the plan's core product direction: do not fork browser repositories; keep Canvas in its iframe and typed protocol; let the main process own remote native views; install no bridge in remote pages; expose no public debug port; do not sync browser state; keep agent control, password storage, reconstruction, and client sessions outside the first retained slice; require confirmations for Commit effects; and route captures through Page IR and the existing gates.

## Saved evidence

- `2026-08-29-embedded-browser-plan-request.json`: exact request, attempt history, inline plan, and input hash
- `2026-08-29-embedded-browser-plan-raw-response.json`: raw provider response
- `2026-08-29-embedded-browser-plan-audit.json`: normalized structured audit

This audit did not modify the plan and does not authorize implementation.
