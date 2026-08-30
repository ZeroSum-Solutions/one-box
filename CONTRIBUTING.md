# Contributing to ONE BOX

ONE BOX is a local-first, evidence-gated website builder. Keep contributions
small, reviewable, and consistent with the [architecture baseline](docs/architecture/README.md).
The [authority manifest](docs/plans/one-box-master/00-authority/authority-manifest.json)
and [program ticket system](docs/tickets/one-box-program/README.md) distinguish
approved execution from proposed or blocked planning work.

## Before you change code

Use a task branch from the reviewed checkpoint. Do not work directly on `main`.
Confirm the checkout and inspect the current diff before editing:

```bash
git status --short --branch
git diff --check
```

Install the committed dependency graph with `npm ci`. The supported local UI
entrypoint is `npm run dev`, which binds to `127.0.0.1:3000`.

## Checks

Run the checks relevant to the change; the pull request should record the exact
commands and results:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run verify:plans
npm run test:plans
```

For generated-site behavior, also use `npm run test:smoke`. The rendered checks
are available as `npm run test:e2e:intake`, `npm run test:e2e:preview`,
`npm run test:e2e:motion`, and `npm run test:e2e:token-motion`.

These checks are credential-free where possible. Live model, research, or
metered-provider runs require explicit operator approval; do not add credentials
to the repository or silently turn on a paid fallback. Keep the app on loopback
unless the [local API threat model](docs/security/local-api-threat-model.md) has
been reviewed.

## Change boundaries

Keep the dependency direction `src/app` → feature modules → platform/shared
modules. Treat `src/lib/contracts.ts` as the runtime contract for persisted and
cross-module shapes; do not invent artifact fields. Keep generated run data under
the ignored `sites/<id>/` tree and never commit `sites/`, `.next/`, `.one-box/`,
environment files, or secrets.

Evidence artifacts and visual approvals are separate human gates. Tests can
prove mechanical behavior, but they do not approve evidence or final visual
quality. Preserve that distinction in code, tests, and issue/PR descriptions.

## Pull requests

Use the pull-request template. Explain the user-visible behavior, affected
boundaries, verification, data/evidence impact, and any human approval still
required. Update the canonical architecture or ADR when a module boundary,
entrypoint, contract, or persistence owner changes. Keep unrelated cleanup out
of the change.

Link stable requirement, evaluation, and ticket IDs. Include one exact Grok 4.6
packet review, or an owner-authorized labeled fallback review under the
[reviewer-role matrix](docs/governance/reviewer-roles.md); either is adversarial
input, not approval. Follow the reviewer-role matrix:
high-risk work requires non-author verification and its named architecture,
security/data, design, licensing, evaluation, or release owner. A proposed,
draft, research, rejected, historical, or audit artifact cannot make a ticket ready.

These review and owner gates are currently process-enforced, not remotely
enforced: the last inspected live branch ruleset required zero approving reviews.
See the matrix's [repository control target](docs/governance/reviewer-roles.md#repository-control-target);
do not treat a mergeable pull request or green remote checks as proof that the
human gates were satisfied.
