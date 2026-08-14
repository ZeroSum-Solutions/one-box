# one-box

Local-first, evidence-gated website builder for the ZS acquisition engine. A user
supplies a brief, target platform, research consent, and optional private text
documents. One Box researches the market, locks design evidence, produces a
versioned `DESIGN.md` plus Tailwind v4 tokens, builds a generated site, and opens
an accessible View/Edit workbench with guarded text, action, layout, token, and
motion changes.

The current implementation plan and acceptance IDs are in
[`docs/specs/2026-08-13-refero-editor-requirements.md`](docs/specs/2026-08-13-refero-editor-requirements.md).

## Prerequisites

- macOS or Linux
- Node.js 20.9 or newer and npm
- GitHub access to the private `wiggdevin/one-box` repository
- ZS Vault access for live model/research runs
- Refero OAuth authorization for the official Refero MCP

Offline tests, type checking, linting, builds, and generated-site smoke gates do
not require model or research credentials.

## Install on a Mac

```bash
git clone https://github.com/wiggdevin/one-box.git
cd one-box
git switch main
git pull --ff-only
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

`main` is the shared, reviewed checkpoint. For concurrent work, create one
branch per machine or task instead of committing to the same branch from both
Macs:

```bash
git fetch origin
git switch main
git pull --ff-only
git switch -c macbook/<task>   # use macmini/<task> on the other Mac
```

Push the task branch and integrate it through a pull request or an intentional
cherry-pick. Before resuming on another Mac, push the first Mac's clean commit,
then `git fetch` and `git pull --ff-only` on the second. Generated `sites/`,
private `.one-box/` staging data, `.next/`, and environment files are deliberately
local and are not synchronized through Git.

## Credentials and live development

Credential names are documented without values in [`.env.example`](.env.example).
Do not copy secrets into the repository. On a configured ZS machine:

```bash
zsvault unlock
./scripts/dev.sh
```

Open [http://localhost:3000](http://localhost:3000). `scripts/dev.sh` sources the
approved vault-backed environment and fails before startup if required keys are
missing. Refero MCP authentication is separate:

```bash
codex mcp login refero
codex mcp list
```

Complete the browser OAuth approval yourself. A ready connection reports Refero
as enabled and authenticated. Paid Firecrawl fallback is never inferred from the
presence of a key; the intake control must explicitly opt in after local crawl
failure.

## Commands

```bash
npm run dev                 # credential-free UI development where possible
./scripts/dev.sh            # live pipeline with vault-backed credentials
npm test                    # Vitest suite
npm run typecheck           # TypeScript
npm run lint                # ESLint
npm run build               # Next.js production build
npm run test:smoke          # deterministic generated-site gates
npm run test:e2e:intake     # rendered intake/upload acceptance
npm run test:e2e:preview    # rendered View/Edit workbench acceptance
npm run test:e2e:motion     # isolated GSAP lifecycle/reduced-motion matrix
npm run test:e2e:token-motion # integrated token/motion workbench matrix
npm run test:eval           # offline frozen-comparison harness tests
npm run eval:baseline:verify # verify frozen brief, rubric, and hashes
```

## Architecture and safety boundary

`/` collects intake and starts a resumable run. The server controller in
`src/lib/pipeline.ts` writes immutable, versioned evidence beneath `sites/<id>/`,
and each approval advances a persisted workflow gate. `/preview/<id>` serves a
sandboxed generated site; structured and natural-language edits share the same
per-run lock, history, validation, and rollback path.

Uploads are privately staged, bounded, integrity-checked, atomically claimed by
one run, and never exposed by the public site route. Local mutation APIs require
same-origin browser requests or the optional `ONE_BOX_API_TOKEN` bearer. See
[`docs/security/local-api-threat-model.md`](docs/security/local-api-threat-model.md)
before exposing the service beyond loopback.

The frozen client design source is `DESIGN.md`. Lint and export it with the pinned
tool used by the pipeline:

```bash
npx --yes -p @google/design.md@0.3.0 design.md lint --format json DESIGN.md
npx --yes -p @google/design.md@0.3.0 design.md export DESIGN.md --format css-tailwind
```
