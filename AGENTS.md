<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ONE BOX agent guide

ONE BOX is a local-first, evidence-gated website builder for the ZS acquisition
engine. Intake starts at `/`; generated sites are edited at `/preview/<id>`.

## Sources of truth

- Program authority manifest: `docs/plans/one-box-master/00-authority/authority-manifest.json`
- Human-readable plan register: `docs/plans/one-box-master/00-authority/plan-register.md`
- Website source/candidate requirements: `docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md`
- Canvas interaction requirements: `docs/specs/2026-08-16-canvas-upgrade.md`
- Website lifecycle direction: `docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md`
- Accepted Page IR implementation tickets: `docs/tickets/page-ir-safe-pipeline/manifest.json`
- Program planning tickets: `docs/tickets/one-box-program/manifest.json`
- Runtime contracts and model routes: `src/lib/contracts.ts`
- Client-facing design contract: `DESIGN.md`
- Local API exposure boundary: `docs/security/local-api-threat-model.md`
- Module boundaries and ownership: `docs/architecture/README.md`
- Contribution workflow: `CONTRIBUTING.md`
- Project-specific bounded loops: `docs/loops/README.md`

Do not invent artifact fields outside `src/lib/contracts.ts`. The generated-site
structure comes from the frozen `templates/local-service/` template.

## Architecture

`/api/run` drives the resumable controller in `src/lib/pipeline.ts`. Run state and
artifacts live under ignored `sites/<id>/`. `/api/edit` applies guarded mutations
and reruns gates. Evidence approvals are human gates, not automatic pass states.

## Commands

- `npm ci` — install the committed dependency graph
- `npm run dev` — credential-free UI development where possible
- `./scripts/dev.sh` — live development with ZS Vault-backed credentials
- `npm test` — Vitest suite
- `npm run typecheck` — TypeScript validation
- `npm run lint` — ESLint
- `npm run build` — production build
- `npm run verify:plans` — authority, traceability, ticket, eval, and adoption-ledger validation
- `npm run test:plans` — positive and fail-closed authority-verifier tests
- `npm run test:smoke` — deterministic generated-site gates
- `npm run test:e2e:intake` / `npm run test:e2e:preview` — rendered acceptance

## Environment and safety

Environment names and optionality live in `.env.example`; never commit values.
The app runtime uses OpenRouter. Research and Refero calls require their explicit
intake choices and human approval boundaries. Do not expose the app beyond
loopback without reviewing the local API threat model.

## Skills and working conventions

- Use `project-setup` to audit baseline repository files.
- Use `project-documentation` when shipped behavior or entry points change.
- Use `loop-library` to adapt or audit bounded repeatable workflows.
- Use `design-contract` for `DESIGN.md` and `refero-design` for UI work.
- Use `security-review` for auth, endpoints, untrusted input, or external exports.
- Use `conventional-commits` and `github:yeet` for authorized publish flows.
- Use `verifier` for independent acceptance checks before declaring completion.
- Work on a feature branch and integrate through review; do not commit to `main`.
- A draft, audit, research note, rejected plan, or proposed ticket never authorizes implementation.
- Follow `docs/plans/one-box-master/00-authority/authority-manifest.json` when documents conflict.
- Keep changes surgical. Do not commit `sites/`, `.one-box/`, `.next/`, or secrets.
