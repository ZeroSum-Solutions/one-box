# one-box

Local-first, evidence-gated website builder for the ZS acquisition engine. A user
supplies a brief through one contextual composer, with project target, research
consent, and optional private files available through progressive disclosure.
One Box researches the market, locks design evidence, produces a
versioned `DESIGN.md` plus Tailwind v4 tokens, builds a generated site, and opens
an accessible View/Edit workbench with guarded text, action, layout, token, and
motion changes plus a project-scoped generated-image library.

The complete plan corpus starts at the
[`ONE BOX master plan library`](docs/plans/one-box-master/README.md). Its
machine-checkable source map is
[`authority-manifest.json`](docs/plans/one-box-master/00-authority/authority-manifest.json).
The accepted source/candidate requirements and ticket IDs remain in
[`2026-08-22-page-ir-safe-pipeline-prd.md`](docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md)
and [`docs/tickets/page-ir-safe-pipeline/`](docs/tickets/page-ir-safe-pipeline/README.md).
Program and future-phase planning tickets are separate and remain non-authorizing.

## Prerequisites

- macOS or Linux
- Node.js 20.9 or newer and npm
- GitHub access to the `ZeroSum-Solutions/one-box` repository
- ZS Vault access for live model/research runs
- Refero OAuth authorization for the official Refero MCP

Offline tests, type checking, linting, builds, and generated-site smoke gates do
not require model or research credentials.

## Install on a Mac

```bash
git clone --recurse-submodules https://github.com/ZeroSum-Solutions/one-box.git
cd one-box
git switch main
git pull --ff-only
git submodule update --init --recursive
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

## Project workflow

- [`CONTRIBUTING.md`](CONTRIBUTING.md) defines branch, verification, safety, and
  pull-request expectations.
- [`docs/architecture/README.md`](docs/architecture/README.md) owns the modular
  monolith boundary and incremental extraction path.
- [`docs/adr/0001-modular-monolith.md`](docs/adr/0001-modular-monolith.md) records
  why ONE BOX remains one deployable application.
- [`docs/adr/0002-target-desktop-cloud-topology.md`](docs/adr/0002-target-desktop-cloud-topology.md)
  is the proposed target topology; it does not supersede ADR 0001 until accepted.
- [`docs/governance/reviewer-roles.md`](docs/governance/reviewer-roles.md) defines
  separation of duties and the target approval matrix.
- [`docs/loops/README.md`](docs/loops/README.md) indexes the bounded engineering
  loops for ticket delivery, repository hygiene, and architecture-preserving
  refactors.

GitHub requires pull requests, the `verify` CI check, and resolved review
conversations on `main`. The repository uses squash merges and automatically
deletes newly merged remote branches.

## Credentials and live development

Credential names are documented without values in [`.env.example`](.env.example).
Do not copy secrets into the repository. `npm run dev` always uses the
vault-backed launcher, so OpenRouter and the optional Firecrawl fallback do not
depend on which terminal started the app. On a configured ZS machine:

```bash
zsvault unlock
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). `scripts/dev.sh` checks its
environment first, then reads OpenRouter and Firecrawl from an unlocked ZS
Vault. It requires `OPENROUTER_API_KEY` and warns when optional Firecrawl is
unavailable. Refero uses the vendor-supported browser OAuth flow: open Research
settings and choose **Connect Refero** once. ONE BOX stores the refreshable OAuth
session under the `.one-box/oauth/` directory, which is private local state and already
excluded from Git. A legacy `REFERO_MCP_TOKEN` remains an optional non-interactive
fallback, not the normal setup path.

Codex's own Refero connection is a separate OAuth client and cannot securely
share its private session with the Next.js process:

```bash
codex mcp login refero
codex mcp list
```

Complete browser OAuth approvals yourself. Paid Firecrawl fallback is never
inferred from the presence of a key; the intake control must explicitly opt in
after local crawl failure.

## Commands

```bash
npm run dev                 # live local app with vault-backed credentials
npm run dev:next            # raw Next.js server; bypasses vault loading
npm test                    # Vitest suite
npm run typecheck           # TypeScript
npm run lint                # ESLint
npm run build               # Next.js production build
npm run verify:plans        # program authority and traceability validation
npm run test:plans          # positive and fail-closed plan-authority tests
npm run test:smoke          # deterministic generated-site gates
npm run test:e2e:intake     # rendered intake/upload acceptance
npm run test:e2e:preview    # rendered View/Edit workbench acceptance
npm run test:e2e:page-ir    # merge-blocking intake, workbench, and rollout UI
npm run test:e2e:motion     # isolated GSAP lifecycle/reduced-motion matrix
npm run test:e2e:token-motion # integrated token/motion workbench matrix
npm run test:e2e:full-unit  # live full-run terminal-state tests
npm run test:eval           # offline frozen-comparison harness tests
npm run eval:baseline:verify # verify frozen brief, rubric, and hashes
```

Page IR rollout is default-off. Set `ONE_BOX_PAGE_IR_ROLLOUT=1` to select
`page-ir-v1` for newly created runs. Set `ONE_BOX_PAGE_IR_KILL_SWITCH=1` to
select `template-v1` for new runs even when rollout is enabled. The decision is
captured at run creation; changing either variable never changes an existing
run's authority or artifacts.

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

The intake keeps attachment, the Phase 1 Website target, research, and paid
fallback choices inside one composer. The prompt begins at 120px, grows to
`min(360px, 50dvh)`, and scrolls internally without hiding Start. Failed chat
and upload attempts retain their local context for Retry or Edit. Stable attempt and upload-batch IDs make
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
file transitions. A blocking placement gate names the failed gate, keeps the
selection operable, and does not reload the preview or report a completed
mutation. Cross-process filesystem claims protect each of these durable retry
boundaries.

Run reconnects project the append-only event audit into the current journey:
superseded errors and earlier approval pauses remain on disk but do not render
as the present outcome. Event writes are flushed before a run stream closes, so
a reconnect cannot miss the terminal checkpoint. A failed pipeline exposes a
return-to-intake action that restores the submitted prompt and settings; claimed
uploads must be selected again. Blocking build gates get one bounded repair
attempt before the run fails closed instead of spending repeatedly on reload.

Build events distinguish candidate creation, repair, gate, promotion, and
recovery outcomes and include a bounded operator next step. A provenance event
links the input artifacts, Page IR, compiler, candidate manifest/build, gate
receipt, promoted build, and named-human review hashes. Preview is exposed only
after promotion has completed.

Template fallback is always explicit and creates a separate linked run. From a
trusted local client, request it for a failed Page IR run with:

```bash
curl -X POST \
  -H 'Origin: http://127.0.0.1:3000' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Content-Type: application/json' \
  --data '{}' \
  http://127.0.0.1:3000/api/runs/RUN_ID/fallback
```

The server owns the bounded fallback reason. It preserves the source run,
failed Page IR artifacts, and recorded failure; it never relabels the source
run or silently serves the template path. The source event log records the
linked child and reason, so reconnecting operators can open the separate run.

Automated visual QA remains a mechanical render check. Final visual approval is
a separate named human review covering brief fidelity, hierarchy, composition,
business specificity, and alignment with the approved design/reference basis.
The full blocking gate set and current build hash are rechecked before approval,
and any committed site mutation invalidates draft, in-review, or approved visual
QA so it can be regenerated. The review basis follows the user's persisted intake
choice; a run with design-reference research disabled records that no external
reference was selected even when its experiment mode retains the Refero default.

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
