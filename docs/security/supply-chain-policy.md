# ONE BOX supply-chain policy

- Status: planning baseline; enforcement ticket required
- Date: 2026-08-29
- Applies to: packages, repositories, generated code, skills, plugins, MCP servers,
  model weights/custom code, worker and desktop images, ExperienceModules, build
  actions, deployment adapters, and externally hosted scripts/assets

> Audit status (2026-08-29): the exact Grok 4.6 lane was unavailable after the
> first phase timed out. The owner-authorized OAuth fallback produced one
> `REVISE` review; its findings were dispositioned in this policy and ledger
> without a second model pass. See [fallback audit](../audits/grok-4.6/2026-08-29-supply-chain-policy-ledger-opus-5-fallback-audit.md).

## Policy objective

No executable or build-influencing item enters ONE BOX because it is popular,
starred, model-recommended, or technically convenient. Retained use requires a
traceable source, exact identity, compatible license, bounded permissions,
integrity evidence, maintenance and vulnerability ownership, qualification,
kill switch, and removal plan.

The lockfile is the exact npm resolution inventory. The adoption ledger records
product-level decisions and stop gates. The SBOM inventories the release. None is
a substitute for the others.

## Dispositions

- `retain`: already part of the accepted baseline and allowed only in its current
  bounded role.
- `adopt`: approved dependency in a named phase after every entry gate passes.
- `adapt`: a research-only planning disposition. It never clears code or generated
  implementation for a build. Any proposed clean-room output requires its own
  exact ledger entry, an `adopt` decision, an independent provenance/license
  receipt, a source-access log, and the same qualification/removal controls as a
  dependency before it may enter production.
- `evaluate`: isolated research or benchmark only; no production/runtime path.
- `learn`: documentation and design evidence only; no code reuse.
- `needs-license-review`: no code, asset, model, or packaged reuse until a written
  compatible-license receipt exists.
- `blocked`: a named security, architecture, data, quality, or authority gate
  prevents retained use.
- `reject`: intentionally excluded; reconsideration requires a new decision record.

Only a complete `retain` or owner-accepted `adopt` entry with both
`codeUseAllowed: true` and `releaseUseAllowed: true` may enter a new production
build. `adapt`, `evaluate`, `learn`, `needs-license-review`, `blocked`, and
`reject` never clear code or service use. Copied, translated, model-generated, or
clean-room output remains blocked until its own adopt-equivalent entry is accepted.

`currentBaselinePresent: true` is an inventory fact, not permission. An incomplete
entry may remain in the inspected checkout while planning, but it must declare
`recordCompleteness: incomplete`, list `missingControls`, and set code, service,
expansion, and release allowances false. This blocks a future release; it does not
claim this planning packet removed existing source or packages.

A pre-policy `retain` entry with a scope-dependent or non-SPDX license may preserve
only the exact current behavior needed to keep the inspected baseline operable.
Its ledger must set expansion and release clearance to blocked, name the exact
version and public license source, and link the unresolved written-review ticket.
It cannot be updated, expanded, newly distributed, or treated as Release 1-cleared
until the licensing owner records the exact use decision. This narrow containment
rule currently applies to GSAP 3.15.0; it is not a general grandfathering path.

## Required ledger fields

Every product-level entry records:

1. stable ledger ID and category;
2. name, canonical source, publisher/maintainer, and acquisition channel;
3. exact package version, commit, tag, image digest, model revision and file hash,
   or `unselected` while code use is false;
4. direct and relevant transitive license, notices, source obligations, asset/data
   rights, and the reviewer/date/receipt;
5. intended phase, bounded capability, runtime/build/research location, and explicit
   authority it cannot own;
6. requested filesystem, network, browser, model, secret, process, data, and user
   interaction permissions;
7. integrity/provenance evidence, upstream maintenance posture, vulnerability and
   upgrade owner, support window, and emergency response;
8. qualification oracle, sandbox, data class, telemetry behavior, kill switch,
   rollback/removal plan, and replacement/export path;
9. decision, code-use flag, owner, decision date, review expiry, and linked ticket.

During planning, `ownerTicket` identifies the control-planning owner only. Each
future allowed item also needs its own implementation/change ticket for the exact
identity and use; one planning ticket may inventory several denied candidates but
cannot approve them as a group.

An `unselected` revision, unavailable license, missing integrity, missing owner,
missing oracle, or unresolved P0/P1 forces `codeUseAllowed: false`.
It also forces `serviceUseAllowed: false` and `releaseUseAllowed: false`.

The machine-readable ledger defines the allowed disposition, license-status, and
identity vocabularies. Missing allowance fields default to false; there is no
implicit clearance. License `clear` means a named reviewer accepted the exact
version, use, deployment/distribution model, obligations, and receipt—not merely
that an upstream page names an SPDX identifier.

## Distribution and service model under review

License and contract review must assume the union of all target delivery modes
until the proposed topology is accepted: an agency-operated local/web workspace;
a potentially signed and distributed Apple-silicon desktop application; hosted
client-review/control services; source or build artifacts handed to clients; and
generated static/client sites publicly redistributed. A use cleared only for one
mode records that mode and remains denied in all others. This policy selects no
desktop, cloud, deployment, or model provider.

Hosted services and subprocessors that receive runtime data have separate ledger
entries from their SDKs. They require exact contracting entity and service,
terms/DPA version, processing purpose and data classes, training/retention policy,
regions/residency and transfer mechanism, subprocessor list, incident-notice and
deletion terms, availability/degraded mode, owner, kill route, export/exit path,
and expiry. A package license cannot clear a hosted service.

## Package and lockfile controls

- Add a direct dependency only in the ticket that needs its accepted capability.
- Use the package manager and committed lockfile; do not download runtime code from
  mutable URLs, branches, `latest`, or unverified install scripts.
- Inspect lifecycle scripts, native binaries, postinstall downloads, dynamic code
  loading, telemetry, egress, filesystem scans, and optional dependency behavior.
- Review the dependency delta and transitive licenses before merge. A small API can
  still carry a large executable or native tree.
- Generate an SBOM for every release candidate and compare it with the prior
  release. New, removed, or materially changed items need an owning ticket.
- Dependabot or vulnerability alerts are inputs. Severity, exploitability, reach,
  fix availability, and compensating controls determine the response, with P0/P1
  handled by the security incident path.
- Renovation is not automatic release. Updates pass the original and regression
  qualification and preserve the ability to pin or roll back.
- Reserve internal package scopes; reject public-name fallthrough, lookalike or
  typosquat names, unexpected registry changes, and maintainer/ownership transfer.
  Newly published versions wait in review quarantine until provenance,
  maintainership, and behavior are checked; age alone never establishes trust.
- Prefer registry provenance/signature evidence when available and record BLOCKED
  when it cannot be verified. Unmaintained or end-of-life packages require a dated
  replacement/removal decision before release.

Current semver ranges in `package.json` resolve to exact `package-lock.json`
versions. A range does not authorize an unreviewed resolution change.

## Repository and copied-code controls

- Record the exact upstream commit and license file before reading source as an
  implementation input.
- Keep research captures outside production source. Record adapted concepts in the
  ledger and implementation ticket.
- Preserve required attribution/notices and source disclosures.
- Do not copy code from mixed, Commons Clause, source-available, unknown, AGPL, or
  incompatible repositories without a written review approving the exact use.
- Generated or translated code does not erase provenance or license obligations.
- A repository's editor, document, collaboration, deployment, or agent runtime may
  be studied without importing its alternate authority model.
- Clean-room work uses public documentation and an independently written bounded
  contract. A person or model context exposed to upstream source cannot produce
  the clean-room implementation; a fresh implementation context receives only the
  accepted contract. The provenance record names who inspected source, who wrote
  the contract, who implemented, the exact upstream identity, and the independent
  reviewer. If that separation cannot be shown, the output is treated as copied
  code and remains blocked.

## Skills, plugins, MCP, and agent tools

- Pin package and skill/plugin version or commit. Review `SKILL.md`, executable
  scripts, MCP server commands, apps/connectors, transitive packages, and update
  behavior.
- Permission manifests are deny-by-default. Read, propose, mutate, external-effect,
  credential, and authority capabilities are distinct.
- No model or plugin receives approval, membership, release, deployment-credential,
  or risk-acceptance authority.
- A skill update is a supply-chain change. Re-run its permission and prompt-injection
  suite before promotion.
- Every retained integration has a product kill switch that does not require the
  dependency to be healthy.

## Models, datasets, and custom code

- Record model/dataset card, publisher, revision, file list and hashes, license,
  use restrictions, training/data provenance claims, custom code, tokenizer,
  quantization/conversion source, and runtime.
- Community conversions need their own publisher, revision, license analysis,
  hashes, and quality/security evidence. The base model's license and name are not
  sufficient.
- `trust_remote_code`, custom operators, pickled artifacts, conversion scripts, and
  model-server plugins execute only in an isolated research worker until approved.
- Private/client data is denied by default. Evaluation uses synthetic or
  rights-cleared fixtures and records permissible use.
- Benchmark inclusion requires fixture rights and provenance; unfinished
  provenance means excluded, not “adopt with a note.”
- Model quality never grants tool, mutation, approval, or release authority.

## Browser, desktop, workers, and images

- Container and worker images use immutable digests, minimal bases, non-root users,
  bounded egress, vulnerability scan, SBOM, provenance/attestation where available,
  and rebuild/rollback instructions.
- Electron/desktop packages require signed/notarized artifacts, protected updater
  metadata, exact contents census, supported Apple-silicon OS matrix, update and
  downgrade tests, and emergency disable/rollback.
- No desktop package, shell, updater, native bridge, remote-content browser, or
  executable spike is allowed before the rewritten EB-001–EB-021 security plan
  and desktop signing/updater boundary pass. Metadata and public-document research
  remain allowed; executable evaluation does not.
- Packaged artifacts must prove they exclude repository history, local client files,
  `sites/`, `.one-box/`, secrets, browser profiles, audit scratch, and developer
  home paths.

## Hosted scripts, fonts, media, and assets

- Prefer self-hosted, integrity-bound release assets.
- Record font, image, video, icon, animation, and dataset licenses separately from
  the code that downloads or renders them.
- Third-party runtime scripts require purpose, data flow, consent/region behavior,
  CSP/SRI feasibility, availability/degraded mode, update owner, and removal path.
- A generated asset records provider/model, prompt/reference provenance, rights
  policy, exact file hash, project scope, and human acceptance.

## License stop rules

- `UNAVAILABLE`, `NOASSERTION`, conflicting files, mixed/open-core boundaries, or a
  commercial-use/redistribution ambiguity is `needs-license-review`.
- Written owner consent or counsel review names the exact version, use, distribution
  model, and obligations. General project familiarity is not a receipt.
- `needs-license-review` items cannot be copied, linked, bundled, shipped, used as a
  hosted service implementation, or converted into a model-generated derivative.
- Study of public documentation and clean-room pattern extraction remains allowed
  when the research note avoids source reuse and records the boundary.

## Intake and decision workflow

```text
candidate discovered
  -> source and exact identity captured
  -> license/rights and provenance classified
  -> authority, permission, data, and threat review
  -> isolated evaluation with named oracle
  -> adoption ledger decision
  -> implementation ticket and kill switch
  -> PR SBOM/lockfile/permission diff
  -> release-candidate qualification
  -> monitored use, update, incident, or removal
```

A decision applies only to the exact identity and bounded role. A phase, use,
license, permission, maintainer, hosting, or authority change reopens review.

## CI and release enforcement

The enforcement ticket must add credential-free checks that:

- parse the adoption ledger and reject invalid state combinations;
- compare direct dependency and lockfile changes with accepted ledger entries;
- reject blocked or license-review items from production source/build manifests;
- produce and archive an SBOM for release candidates;
- scan packaged contents for forbidden paths and secret canaries;
- verify exact model/asset/worker/desktop hashes when those classes are introduced;
- report vulnerability/license tool failures as BLOCKED, not PASS;
- prove the kill-switch path for every high-risk executable integration.

Tool selection is deliberately not fixed by this policy. The owning ticket records
coverage, false-positive handling, data egress, version, and replacement path before
a scanner becomes merge- or release-blocking.

The enforcement owner is `OBX-P150`; no current compliance is inferred. Release
SBOMs use CycloneDX JSON, are generated once for the frozen baseline and for every
release candidate, bind the release hash, are signed or attested by the release
pipeline, and are retained with release-support evidence. The first candidate is
diffed against the frozen baseline rather than an empty inventory.

Vulnerability triage uses the program severity owner and reachability evidence.
Proposed maximum remediation or containment targets are P0 24 hours, P1 7 days,
P2 30 days, and P3 90 days; an owner must accept or replace these before Release 1.
No-fix findings require disable/removal, a bounded compensating control with
expiry, or a blocked release—not an indefinite exception.

### CI/CD trust controls

- Third-party actions are ledgered and pinned to full commit SHA; mutable tags are
  not release clearance even when a comment records the friendly version.
- Workflow permissions and job tokens are least-privileged; secrets are not
  exposed to untrusted forks or third-party actions without an accepted need.
- `pull_request_target`, self-hosted runners, reusable external workflows,
  artifact downloads, cache restores, and workflow-file changes receive explicit
  threat and owner review.
- Release runners record image/provenance, dependency-cache inputs, action SHAs,
  and produced artifact attestations. A workflow-control failure is BLOCKED.

The current checked-in workflow uses version tags for actions and is not claimed
to satisfy this target; correcting it is later `OBX-P150` implementation work.

## Exceptions and emergency response

An exception names the item/version, risk, affected releases, business reason,
compensating controls, owner, expiry, removal ticket, and independent reviewer.
No permanent exception and no model-authored acceptance is valid.

For suspected compromise: disable the item through its external kill switch,
preserve evidence, identify every affected build/release and tenant, rotate scoped
credentials where relevant, rebuild from known-good inputs, requalify, notify by
incident policy, and record the upstream and internal lessons. Restoring service
does not close the incident or waive provenance repair.

Runtime integrations need an external kill switch. Build-time libraries and
compiled assets instead need a tested repin, rebuild, and removal path that works
without the dependency's service or maintainer; that satisfies the recovery
intent but is not mislabeled a runtime switch.
