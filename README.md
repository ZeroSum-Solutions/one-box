# one-box

Local-first, evidence-gated website builder for the ZS acquisition engine. A user
supplies a brief through one contextual composer, with project target, research
consent, and optional private files available through progressive disclosure.
One Box researches the market, locks design evidence, produces a
versioned `DESIGN.md` plus Tailwind v4 tokens, builds a generated site, and opens
an accessible View/Edit workbench with guarded text, action, layout, token, and
motion changes plus a project-scoped generated-image library.

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
git switch -c macbook/task-name   # use macmini/task-name on the other Mac
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

Open [http://localhost:3000](http://localhost:3000). `scripts/dev.sh` checks its
environment first, then reads the three named credentials from an unlocked ZS
Vault. It requires `OPENROUTER_API_KEY` and warns when optional Firecrawl or
Refero credentials are unavailable. Without `REFERO_MCP_TOKEN`, turn off
**Design-reference evidence** under Research settings before submitting the
project. Refero MCP authentication is separate:

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
npm run test:e2e:full-unit  # live full-run terminal-state tests
npm run test:eval           # offline frozen-comparison harness tests
npm run eval:baseline:verify # verify frozen brief, rubric, and hashes
```

The live full-run harness uses real model and provider calls, so run it only
after approving that spend. It stops with exit code 2 whenever an evidence
artifact needs human review and prints the evidence workspace URL. Approve or
request revision in that workspace, then resume the same run:

```bash
node scripts/e2e/full-run.mjs --allow-metered --resume RUN_ID
```

The required `--allow-metered` flag records operator intent; it does not approve
Firecrawl fallback or any evidence artifact. The harness never approves evidence
or final visual quality. Successful edit checks invalidate the prior visual
decision and stop at one final review. After approving the edited build, complete
the recorded run with:

```bash
node scripts/e2e/full-run.mjs --allow-metered --finalize RUN_ID
```

`--reuse RUN_ID` skips intake and pipeline execution, retests a completed run,
then requires the same final visual review.

## Architecture and safety boundary

`/` collects intake and starts a resumable run. The server controller in
`src/lib/pipeline.ts` writes immutable, versioned evidence beneath `sites/<id>/`,
and each approval advances a persisted workflow gate. `/preview/<id>` serves a
sandboxed generated site; structured and natural-language edits share the same
per-run lock, history, validation, and rollback path.

The intake keeps attachment, Website/Web app/iOS target, research, and paid
fallback choices inside the composer. Failed chat and upload attempts retain
their local context for Retry or Edit. Stable attempt and upload-batch IDs make
those retries idempotent, so an ambiguous response cannot create a second run or
stage the same file batch twice; completed intake retries also bypass another
model call. The preview workbench persists exact
Desktop, Tablet, and Mobile canvas presets while manual splitter dragging remains
fluid, and falls back safely when browser storage is unavailable. Its Assets
tool stores generation state and provenance in an `image-library.json` file in
that run's directory; the server advertises only implemented models, requires
explicit metered consent, keeps provider work outside the long-held site
mutation lock, replays an ambiguous generation request without reserving credits
or calling the provider twice, and reconciles interrupted ledger, catalog, and
file transitions. Cross-process filesystem claims protect each of these durable
retry boundaries.

Automated visual QA remains a mechanical render check. Final visual approval is
a separate named human review covering brief fidelity, hierarchy, composition,
business specificity, and alignment with the approved design/reference basis.
The full blocking gate set and current build hash are rechecked before approval,
and any committed site mutation invalidates the prior visual decision.

Uploads are privately staged, bounded, integrity-checked, atomically claimed by
one run, and never exposed by the public site route. Local mutation APIs require
same-origin browser requests or the optional `ONE_BOX_API_TOKEN` bearer. See
[`docs/security/local-api-threat-model.md`](docs/security/local-api-threat-model.md)
before exposing the service beyond loopback.

The frozen client design source is `DESIGN.md`. Lint and export it with the pinned
tool used by the pipeline:

```bash
DESIGN_MD_PACKAGE=$'@google\x2fdesign.md@0.3.0'
npx --yes -p "$DESIGN_MD_PACKAGE" design.md lint --format json DESIGN.md
npx --yes -p "$DESIGN_MD_PACKAGE" design.md export DESIGN.md --format css-tailwind
```
