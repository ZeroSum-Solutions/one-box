# one-box

Chat-to-website prototype for the ZS acquisition engine. One chat box in, a
reference-locked local-service website out, with a click-to-select natural-language
editor on the preview.

Plan of record: `docs/plans/2026-08-13-refero-editor-evidence-workspace.md`.
Atomic acceptance requirements live in
`docs/specs/2026-08-13-refero-editor-requirements.md`. Contracts:
`src/lib/contracts.ts` — every stage artifact shape lives there; never invent
fields outside it.

## Hard lanes (Devin, 2026-08-12)

- **App runtime = OpenRouter only** (`MODELS` in contracts.ts; slugs verified live).
  Claude never enters the app's metered path.
- **Building/auditing this repo = subscription OAuth lanes only** (Claude Code,
  codex GPT-5.6 Sol for review, `agy` Gemini for visual QA).
- Secrets come from the shell env (ZS Vault via `scripts/dev.sh`) — never on disk.

## Architecture in one breath

`/` chat (intake) → `start_pipeline` tool → `/api/run` SSE drives the deterministic
controller in `src/lib/pipeline.ts` (scan → Refero reference lock → tokens/skeleton/
copy synthesis → build) → artifacts under `sites/<id>/` (run.json is the resumable
state machine) → `/preview/<id>` iframe (sandboxed, overlay-injected) → `/api/edit`
patches pristine source by `data-edit-id` and re-runs gates.

- The generated site comes from the FROZEN template `templates/local-service/` —
  builders parameterize approved tokens/copy rather than inventing structure.
  Motion uses a constrained, versioned schema and the pinned local GSAP runtime;
  arbitrary JavaScript/selectors are forbidden and reduced-motion is mandatory.
- Gates (`src/lib/gates.ts`) are invariants: token-drift, axe, console, assets,
  no-JS visibility (blocking) + perf budget (advisory). They re-run after every edit.
- The app's own chrome wears the GSAP style record (`DESIGN.md` + `variables.css`
  at repo root) — cream on near-black, ghost pills, `{ }` eyebrows, stage cards
  color-coded green/orange/pink/violet/blue per pipeline stage.

## Commands

- `./scripts/dev.sh` — dev server with vault-sourced env.
- `npm run test:smoke` — template, builder, and gates offline proof.
- `npm run test:e2e:intake` / `npm run test:e2e:preview` — rendered acceptance.
- `npm test` / `npm run typecheck` / `npm run lint` / `npm run build` — primary gates.
