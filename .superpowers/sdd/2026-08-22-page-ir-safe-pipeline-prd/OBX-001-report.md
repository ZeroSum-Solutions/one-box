# OBX-001 implementation report

## Outcome

OBX-001 is verified. Phase 1 production intake exposes Website only, persists new
intake as `projectTarget: "website"`, and rejects `web-app` or `ios-app` before a
run, model/provider operation, stage, repair credit, SSE stream, build staging
directory, or active mutation can begin. Persisted compatibility remains broad:
`ProjectTargetSchema` still parses all three historical values.

Unsupported operations use one actionable contract:

```json
{
  "code": "unsupported-project-target",
  "error": "Phase 1 production supports Website projects only.",
  "projectTarget": "web-app",
  "action": "Start a new Website project to generate, retry, or rebuild."
}
```

HTTP boundaries return this contract with status `409` and `Cache-Control:
no-store`.

## Files changed

- Production policy and compatibility contracts:
  `src/lib/contracts.ts`, `src/lib/productionTarget.ts`.
- Intake and product UI:
  `src/app/page.tsx`, `src/components/IntakeControls.tsx`,
  `src/components/IntakeComposer.tsx`, `src/app/api/chat/route.ts`.
- Start/retry/rebuild defenses:
  `src/app/api/run/route.ts`, `src/lib/pipeline.ts`, `src/lib/builder.ts`.
- Active POST mutation defenses:
  `src/app/api/reference/[id]/route.ts`,
  `src/app/api/evidence/[id]/route.ts`, `src/app/api/edit/route.ts`,
  `src/app/api/elements/route.ts`, `src/app/api/tokens/route.ts`,
  `src/app/api/motion/route.ts`, `src/app/api/assets/[id]/route.ts`.
- Focused regression coverage:
  `src/app/api/chat/route.test.ts`, `src/app/api/run/route.test.ts`,
  `src/lib/pipelineReplay.test.ts`, `src/lib/builder.test.ts`,
  `src/components/IntakeComposer.test.tsx`,
  `src/app/api/reference/route.test.ts`,
  `src/app/api/evidence/[id]/route.test.ts`,
  `src/app/api/edit/route.test.ts`, `src/app/api/elements/route.test.ts`,
  `src/app/api/tokens/route.test.ts`, `src/app/api/motion/route.test.ts`,
  `src/app/api/assets/[id]/route.test.ts`.
- Canonical documentation and delivery state:
  `docs/architecture/README.md`, `docs/security/local-api-threat-model.md`,
  `docs/tickets/page-ir-safe-pipeline/OBX-001-website-only-production.md`, and
  `.superpowers/sdd/2026-08-22-page-ir-safe-pipeline-prd/progress.md`.

## RED evidence

### Intake, pipeline, builder, and UI

Command:

```text
npm test -- src/app/api/chat/route.test.ts src/app/api/run/route.test.ts src/lib/pipelineReplay.test.ts src/lib/builder.test.ts src/components/IntakeComposer.test.tsx
```

Exit `1`. Vitest reported 5 failed files with 12 intended failures and 45
passes. The failures proved that forged targets still reached intake attempt
handling, `/api/run` returned `200`, `runPipeline()` advanced into execution,
`buildSite()` reached template work, and the rendered intake still contained Web
app and iOS choices/copy.

### Active mutation paths

Command:

```text
npm test -- src/app/api/reference/route.test.ts src/app/api/evidence/[id]/route.test.ts src/app/api/edit/route.test.ts src/app/api/elements/route.test.ts src/app/api/tokens/route.test.ts src/app/api/motion/route.test.ts src/app/api/assets/[id]/route.test.ts
```

Exit `1`. Vitest reported 7 failed files with 7 intended failures and 48
passes. Reference, evidence, edit, element, token, and motion requests returned
`200`; asset placement returned `404`. Each should have returned the shared
Website-only `409` before its downstream work.

## GREEN evidence

### Core policy

The first RED command reran with exit `0`: 5 files passed, 57 tests passed.

### Mutation policy

The second RED command reran with exit `0`: 7 files passed, 55 tests passed.

### Combined focused verification and types

Command:

```text
npm test -- src/app/api/chat/route.test.ts src/app/api/run/route.test.ts src/lib/pipelineReplay.test.ts src/lib/builder.test.ts src/components/IntakeComposer.test.tsx src/app/api/reference/route.test.ts src/app/api/evidence/[id]/route.test.ts src/app/api/edit/route.test.ts src/app/api/elements/route.test.ts src/app/api/tokens/route.test.ts src/app/api/motion/route.test.ts src/app/api/assets/[id]/route.test.ts && npm run typecheck
```

Exit `0`: 12 files passed, 112 tests passed; Next route type generation and
`tsc --noEmit` completed successfully.

### Full suite

Command: `npm test`

Exit `0`: 62 files passed, 2 skipped; 529 tests passed, 2 skipped.

### Lint

Command: `npm run lint`

Exit `0`: 0 errors. ESLint reported six pre-existing warnings in
`spikes/layout-ir/compile.mjs`, `src/components/EvidenceWorkspace.tsx`,
`src/components/preview/AssistantPanel.tsx`, and `src/lib/tools/refero.ts`; none
are in OBX-001 changed lines.

## Acceptance mapping

- Website is the sole rendered radio target; Web app and iOS copy is absent.
- `IntakeContextRequestSchema` uses a separate literal Website production
  schema, while `ProjectTargetSchema` remains unchanged for persisted records.
- `handleChat()` rejects forged targets before attempt inspection, preflight,
  reservation, or model work; `startPipelineFromIntake()` repeats the guard
  before `runIntakeAttempt()` or `ensureRun()`.
- `/api/run`, `runPipeline()`, and `buildSite()` reject before streaming,
  history replay, model/provider work, stage start, repair-credit claims, or
  `.building` writes.
- Reference, evidence, edit, element, token, motion, and asset POST paths apply
  the guard after existing authorization and request/run-ID validation and
  before mutation work.
- Existing hostile-origin tests remain green in the focused and full suites.

## Assumptions

- New production intake is the only place target breadth is narrowed. Existing
  record parsing/export compatibility remains owned by OBX-002.
- A persisted run without an intake artifact retains its prior missing-artifact
  behavior; the guard acts when a persisted target exists.
- `409` is the stable conflict status for an otherwise valid request targeting
  an unsupported production class; callers should branch on the error code.

## Risks

- Legacy read-only labels and export UX are intentionally not implemented here;
  OBX-002 owns that behavior.
- The UI assertion is server-rendered markup coverage, not a new browser
  screenshot artifact. The static markup proves one accessible target control
  and the full suite covers the surrounding intake behavior.
- No live provider call, deployment, migration, or persisted run rewrite was
  performed.
