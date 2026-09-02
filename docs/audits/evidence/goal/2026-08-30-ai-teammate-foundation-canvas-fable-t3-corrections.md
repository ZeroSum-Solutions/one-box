# T3 — accepted Fable 5 corrections

Date: 2026-08-30
Authority: `OBX-AUTH-ATF-001` (`read` + `propose` only)
Baseline commit: `899b39433c4be242b4b3adcd39f3e6cd53df99c0`
Baseline tree: `7a1a54e421d12cf7e5cc5a1f42877d8ffe6750b5`

## Correction ledger

| Finding | Correction | RED evidence | GREEN evidence |
| --- | --- | --- | --- |
| F-01 | Preserve legal run IDs; map dash/underscore-leading IDs reversibly into a 51–123 character internal-only namespace that cannot collide with any 4–40 character external run ID. | New route cases threw a `projectId` Zod error before returning a response. The first `run-` normalization also aliased `-abc1` and legal `run--abc1`, producing identical frozen-clock job hashes. | Focused route suite returns HTTP 200, original run ID, and a complete bound receipt for short and maximum-length leading-symbol IDs; the collision pair now produces distinct job hashes. |
| F-02 | Retain exactly one Agent Studio instance for the current run; inactive state is `hidden`, `aria-hidden`, and `inert`; run change resets it. | Live Canvas contract: `Agent Studio was destroyed after leaving its tool` (`0 !== 1`). Source integration oracle also failed on the absent retained wrapper. | Live contract restores the same assignment, teammate, proposal, and receipt after tool and View/Edit changes; the hidden wrapper is absent from focus, layout, and accessibility interaction. |
| F-03 | Label the fixed deterministic output as a placeholder and state that no model/provider is connected; keep roster availability `Idle`. | Markup lacked the required boundary and used agentic action/result labels. | Component checks find the explicit no-provider boundary, placeholder action/result labels, and eight static `Idle` rows; the live Canvas contract checks the boundary text and absence of apply controls. |
| F-04 | Parse and render a strictly bound non-complete terminal receipt only from the exact five-key Local envelope with a literal JSON-null proposal; reject missing, malformed non-null, or extra-field envelopes. | Valid `budget-exhausted` envelope was classified as an invalid receipt. The first correction then collapsed malformed/missing proposals to null and accepted them as terminal. | Adapter returns `kind: terminal` only for the exact null-proposal envelope; malformed, missing, and extra-field variants return `kind: error`. The alert renders the full receipt with no proposal, apply control, false retry advice, or `aria-invalid`. |
| F-05 | Let Agent Studio, not the Local assignment component, own a read-only selection banner containing only tag and edit ID plus an explicit no-send disclosure. | Selected `hero.headline` was absent from Teammates markup. | Agent Studio renders tag/edit ID once in the Teammates pane; the Local component receives no selection object, and the live request oracle proves the selected edit ID is absent from the body, headers, query, and decoded path. |
| F-06 | Explain caller-asserted data class/no scanning and prohibit sensitive input; bind help with `aria-describedby`. | Select had no description and no safety warning. | Unit checks prove the described-by relationship resolves to the exact help text and includes every required warning category. |
| F-07 | Add a real keyboard/focus/busy-lock Canvas oracle using existing Playwright only. | Baseline harness had no keyboard, held-route, or `activeElement` assertions. | Live contract arrow-navigates the roster, tabs through the form, proves focus outline, holds the POST, proves locked controls and one request, and checks focus after completion. |
| F-08 | Keep valid working submit natively enabled but `aria-disabled`; retain synchronous duplicate guard and focus. | Held-request Chromium probe moved focus from submit to `BODY`. | Live contract keeps `document.activeElement` on submit while held and after receipt commit; a second Enter produces no second POST. |

## Executed proof

- RED route, adapter, markup, selection, data-class, submit, source-integration, and browser cases were observed before their corresponding production changes.
- `npm test -- --run src/components/preview/AiTeammate/AiTeammatePanel.test.tsx src/components/preview/AiTeammate/AgentStudioPanel.test.tsx src/components/preview/AiTeammate/WorkbenchAgentStudio.test.tsx 'src/app/api/ai-teammates/[id]/route.test.ts'` — 4 files, 28 tests passed.
- `npm run typecheck` — passed after Next route-type generation.
- `WIDTHS=1440 ONEBOX_BASE_URL=http://127.0.0.1:8791 npm run test:e2e:canvas-contract` — passed; summary: `No contract or accessibility problems detected.`
- No dependency, provider, persistence, Page IR mutation, browser, collaboration, deployment, or release capability was added.

## Corrected-file SHA-256 manifest

```text
1871f9a810465908309bfe3460a4ea23d1aeb487ea2272c60d59ffbf8b5754ee  docs/architecture/README.md
d640b6a20642670e0352a4eb778ed987de054dfea9669520f7020097be3b0ac2  docs/plans/one-box-master/00-authority/authority-manifest.json
cc502382d4253190d6d949f2842ffb5e88b6d26c130ec68897013c6df13e881c  docs/security/local-api-threat-model.md
140794bb42e5dc15f24e843753d9687f5824e8534a1fa5a3cfe117feae9b28ff  scripts/e2e/canvas-contract.mjs
d131f0e15efe16f5446a42ce0926282dee0e844796765b34195e22e84dad4fb8  src/app/api/ai-teammates/[id]/route.test.ts
0321e9ba10fb588b7a1ea6ea41d4306532c7c52417bcad8d61ebb597afff447a  src/app/api/ai-teammates/[id]/route.ts
2397e25bd0c3aa962acbd2bbc66fb8a70030c7ea920ef48c06ee9043a8e55bd0  src/components/preview/Workbench.tsx
a99a944bd3b7eed379a73d46d47bae024a2056f1935aec324964d6bce579b139  src/components/preview/AiTeammate/WorkbenchAgentStudio.test.tsx
10d75bb53db76a25f9d09b13dd80c544d1590af21bf3db47b33d13d1088d4795  src/components/preview/AiTeammate/AgentStudioPanel.test.tsx
3c3afee04d9636cff40f76f1c75952cbd9ab81d25568f5f6655dc35879f02cbb  src/components/preview/AiTeammate/AgentStudioPanel.tsx
55c5e26c7b6bd1ec80f351f6bfe599617ad3179f3903f6c35d63b40a5cd78b0b  src/components/preview/AiTeammate/AiTeammatePanel.test.tsx
7079a78b2676b6bb0be94bdb9f5d05be7770f43314e973dbcbffd3ecad5f09d1  src/components/preview/AiTeammate/LocalAiTeammatePanel.tsx
```

The manifest binds the post-T3, pre-T4 implementation candidate reviewed by the T3 Grok 4.6 closures. The evidence file itself is intentionally excluded from its own manifest.
