# Agent Studio display-only selection boundary proof

Candidate date: 2026-08-30

Authorization evidence prefix: `2026-08-30-ai-teammate-foundation-`

- `src/components/preview/AiTeammate/LocalAiTeammatePanel.tsx` SHA-256: `5a537f2da5ea750e85d871e69cfe71c31f3cfc8d213f15a038f1632920e28cf8`.
- `rg -n 'PreviewSelection|selection\??:' src/components/preview/AiTeammate/LocalAiTeammatePanel.tsx` exits 1: the assignment component has no selection import or prop.
- `AgentStudioPanel` renders only `selection.tag` and `selection.editId` in its read-only Teammates boundary paragraph, then mounts `<LocalAiTeammatePanel runId={runId} onBusyChange={setTeammatesBusy} />` with no selection value.
- The pre-existing Site Advice child remains `<AssistantPanel runId={runId} selection={selection} ... />`; its separate mutation boundary is unchanged.
- `npx vitest run src/components/preview/AiTeammate/AgentStudioPanel.test.tsx src/components/preview/AiTeammate/AiTeammatePanel.test.tsx` passes 23/23.
- `npm run typecheck` passes, so the removed assignment-component prop and parent call agree.
- The live Canvas E2E separately requires the Teammates POST body to contain exactly seven authorized assignment keys and asserts the selected edit ID is absent.

This proof is evidence only. It does not grant selection scope to the local assignment or job.
