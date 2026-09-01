# OBX-P180 source-adoption closure receipt

- Decision date: 2026-08-31
- Named owner: Devin Wiggins
- Scope: planning references, audit routing, and provider-offline evaluation fixtures
- Product/runtime authorization: none
- Review expiry: 2026-09-30 for the hosted audit route; 2026-11-29 for source-pattern receipts

This receipt closes the exact source identities and bounded pattern uses needed by
`OBX-P180-T03` through `OBX-P180-T05`. It authorizes no copied upstream code,
dependency, provider-backed product route, persistence, browser, collaboration,
deployment, release behavior, or Page IR mutation. All cited patterns are rewritten
as ONE BOX-owned contracts and tested with synthetic provider-offline fixtures.

## T3 Code receipt

| Field | Receipt |
|---|---|
| Repository | `https://github.com/pingdotgg/t3code` |
| Exact commit | `41adccc83e819c286dcdf32cd8b5f55af8bb0b49` |
| Commit tree | `5ef26ef582a9d15682db0b335b415dd5b2a3bd06` |
| Commit verification | GitHub API reported a valid verified signature; commit time `2026-08-31T23:38:19Z` |
| Prior reviewed pin | `c0e09f323ac9f6bf4b9119cbad841db3379588d6`; exact comparison is 47 commits ahead and zero behind |
| License | MIT; `LICENSE` git blob `55ee675bb1de9e580b69f3dd68684df2a4dffba7`; copyright T3 Tools Inc.; preserve the copyright and permission notice if any substantial portion is ever copied |
| Acquisition | Read-only GitHub API/source inspection; no package, clone, dependency, or upstream byte entered ONE BOX |

Targeted source evidence at the exact commit:

| File | Git blob | Bounded pattern |
|---|---|---|
| `docs/internals/overview.md` | `6c5a61cd7d01b306c70f2da58ffa2edc20c04510` | serialized command to event/projection/receipt flow, drainable workers, and the warning that runtime receipts are test-only |
| `apps/server/src/provider/ProviderDriver.ts` | `c738882c23a4e6463b0b9d66af8fca53bca648cb` | typed config decoding, isolated provider instances, and scoped teardown |
| `apps/server/src/orchestration/commandInvariants.ts` | `8f1e3e89851cfbd5ef1066130e877f897ce34f65` | explicit precondition checks and duplicate-create rejection |
| `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` | `ac514d7eb2823a3cc5a5317f21e074774336f024` | deterministic event projection and replay discipline |
| `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` | `22c70094ce0e3f453192d8cc58df97e8a8278cc0` | intent-to-provider boundary separation |
| `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` | `7ec3a7e64243296381166514b407aa428bad4733` | provider-stream normalization before domain projection |
| `apps/server/src/orchestration/Layers/RuntimeReceiptBus.ts` | `586281dc9c6b410735fb56952c985389497ad558` | tests may await milestones; production behavior must not depend on the test receipt bus |

ONE BOX may adapt only the concepts above into independently named, closed
contracts. T3 Code cannot own or supply workspace, filesystem, VCS, terminal,
session, credential, route, budget, provider choice, Page IR, candidate, approval,
apply, deployment, or release authority. Its Effect runtime, server, clients,
database/event store, remote environment, Electron/mobile/browser/Tailscale layers,
provider processes, and dependency graph are outside scope.

Qualification is the provider-offline source-adoption lane: duplicate/replay,
stale-event, authority, isolated lifecycle, test-only receipt, and clean-removal
cases must pass with zero provider calls and denied network. Removal means deleting
the pattern citation and ONE BOX-owned optional adapter/reducer behind its registry
entry; the frozen Page IR/manual path must continue to pass without T3 source,
package, service, or runtime availability.

## MishMash internal-source receipt

| Field | Receipt |
|---|---|
| Repository | Authoritative pinned identity: `https://github.com/ZeroSum-Solutions/mishmash`; independently matched owner-controlled local read-only checkout: `/Users/zero-suminc./projects/mishmash` |
| Exact commit | `334e4ba4e01071825686a6793c56c6bc482fa951` |
| Provenance | Internal ZeroSum Solutions repository; commit authored by Devin Wiggins and merged by GitHub on 2026-08-25 |
| Working-tree rule | The named files were verified as their committed blobs. Unrelated local memory changes and untracked files were excluded. |
| License/use basis | ZeroSum Solutions owner-controlled source; “internal” denotes company ownership/use authority, not private repository visibility. Company-internal pattern study only; no external redistribution claim and no whole-file copy into ONE BOX. |

Exact referenced files:

| File | Git blob | Bounded pattern |
|---|---|---|
| `docs/agent-adapters.md` | `b6fb195ac7754b22d036eb468ef28c308be3e0c1` | data-defined adapter registry and normalized runtime definition |
| `apps/daemon/src/runtimes/types.ts` | `b1eb85509b3478f0b3926ebf54995fc233bea88e` | typed runtime/event boundary |
| `packages/contracts/src/api/agent-sessions.ts` | `4e165b9bf811ef37fa80c4d7ba37f5125fc6efff` | explicit handle acquisition, continuation, visibility, and invalidation vocabulary |
| `apps/daemon/src/run-retry-policy.ts` | `4d6b577c629ef82a5d5350b5da58226f5bc59367` | same-run retry suppression after output, tool, artifact, live-artifact, cancellation, or unsafe failure |
| `apps/daemon/src/runtimes/run-lifecycle-analytics.ts` | `682c717b145f4eff547480ca72370cdfc80e7be6` | incremental side-effect observations used by retry admission |
| `docs/skills-protocol.md` | `53989a2e6c1e5d08bb62ffe0549c153524811f8d` | isolated skill staging and explicit manifest/permission boundaries |

The no-copy boundary excludes MishMash application/runtime source, daemon, HTTP
surface, database and migrations, durable session store, web/Electron UI, updater,
release system, memory/collaboration behavior, direct agent spawning, secrets,
provider configuration, and project/artifact schemas. ONE BOX does not import a
MishMash package or call its daemon. The source may not choose a model route,
approve a retry, gain a capability, own a ONE BOX receipt, mutate Page IR, or
authorize apply/release.

Qualification is the provider-offline source-adoption lane plus existing T03/T04
oracles for permission intersection and retry. Removal means deleting the citation
and any optional ONE BOX-owned pattern adapter; the offline controller, manual
workflow, and frozen Canvas contracts must remain deterministic without MishMash.

## OpenRouter external-review route

Product inference and external audit review are separate registries and separate
authorities. The existing AI SDK/OpenRouter package and every product/upstream route
remain disabled for new product use. This receipt admits only the following
short-lived audit route:

```json
{
  "routeId": "audit-openrouter-glm-5.3-flash-zai-v2",
  "registry": "external-review-only",
  "model": "z-ai/glm-5.3-flash",
  "upstreamProvider": "Z.AI",
  "endpointRelease": "z-ai/glm-5.3-flash-20260826",
  "endpointTag": "z-ai/fp8",
  "providerPreferences": {
    "order": ["z-ai/fp8"],
    "only": ["z-ai/fp8"],
    "allow_fallbacks": false,
    "require_parameters": true,
    "data_collection": "deny",
    "zdr": true
  },
  "tools": [],
  "plugins": [],
  "openRouterLoggingAssumption": "potentially-enabled-and-accepted-for-sanitized-packet",
  "reasoningEffort": "low",
  "allowedDataClass": "synthetic-internal",
  "productDataTransferAllowed": false,
  "maxInputTokens": 200000,
  "maxOutputTokens": 8000,
  "maxAttempts": 1,
  "maxCostUsd": "0.05",
  "owner": "Devin Wiggins",
  "expiresAt": "2026-09-30T23:59:59-07:00"
}
```

The route is for quick advisory review of a bounded, leak-scanned planning or
synthetic evaluation packet. Customer/client content, credentials, secrets, PII,
raw evidence, browser/session data, product prompts, generated-site content, and
Page IR are forbidden. OpenRouter account input/output logging cannot be proved
disabled from this lane and is therefore treated as potentially enabled; the
sanitized packet must be acceptable under that conservative retention assumption.
Request-level ZDR and `data_collection: deny` are still mandatory for the upstream
endpoint; tools, plugins, web search, and provider fallback are disabled. Local raw
request/response evidence stays in an owner-only restricted backup for at most 90
days; only normalized, redacted findings may enter the repository. This local limit
does not claim to override OpenRouter's account-level retention settings or terms.
GLM 5.3 reasoning is always on; the `v2` route requires its supported `low` effort
so a single bounded attempt reserves output space for the requested verdict. The
superseded `v1` attempt omitted this control, consumed its 8,000-token completion
budget in reasoning, returned no visible verdict, and was not treated as a pass.

The OpenRouter model catalog observed at `2026-08-31T23:58:25Z` reported prompt
price `0.000000075` and completion price `0.00000025` USD/token for the Z.AI
endpoint. Dispatch must revalidate the exact model, endpoint/provider, ZDR status,
parameters, and price at call time. Any mismatch, policy uncertainty, unavailable
Z.AI endpoint, exhausted budget, over-size packet, route expiry, or reported model/
provider mismatch returns `NOT_RUN` or `BLOCKED`; it never retries or chooses
another provider/model.

Retrieval observations (snapshot metadata, not future invariants):

| Official source | SHA-256 observed 2026-08-31 |
|---|---|
| `https://openrouter.ai/docs/guides/routing/provider-selection.md` | `2d009cc5cb9d1810eedc20238b72acdf055c6d8686f909fdf5b9baa254874fd1` |
| `https://openrouter.ai/docs/guides/features/zdr.md` | `cf03792d2088a101c082a1b50505e49d1af4c30b0db80b1c7f05375533f135ab` |
| `https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flash/endpoints` | `6e87b6c233f038438a6381e39c344b35084d8c575df64ab1a0f0b89c0246b100` |
| `https://openrouter.ai/api/frontend/v1/all-providers` | `c8a3c55aec8a40b77a4a73044695755b8165011fa1c50b74df29935cb04df52f` |

These hashes identify the representations fetched at the stated observation time;
the public documents and catalogs can change. Dispatch-time revalidation of the
exact route controls and returned identity is authoritative.

Contract and privacy observations:

| Official source | Version observed | SHA-256 observed 2026-08-31 | Bounded conclusion |
|---|---|---|---|
| `https://openrouter.ai/terms` | Last updated 2026-08-31 | not pinned; dynamic HTML bytes | OpenRouter Terms incorporate applicable Model Terms; acceptance here is only for the exact advisory route |
| `https://openrouter.ai/privacy/` | Last updated 2026-08-31 | not pinned; dynamic HTML bytes | inputs are transmitted to the selected provider and provider practices must be reviewed |
| `https://openrouter.ai/docs/guides/privacy/provider-logging.md` | live policy snapshot | `d0eff57976ab12490e04286f9932588146ae3c2d0a2f57e9a70c560bd4202b51` | account logging/training settings and request-level provider filters are distinct controls |
| `https://docs.z.ai/legal-agreement/terms-of-use` | Last updated 2026-04-14 | `c279aa8ab826898ee3fbc41b08ab02e85a0f25735d71a6f5a4aacbabae61bff1` | API use is allowed subject to restrictions including professional/high-risk decisions, misuse, and external-model development |
| `https://docs.z.ai/legal-agreement/privacy-policy` | Last updated 2025-09-29 | `5bd98a068c660fccc9baea430a8d1483b5f5c88b0ad587d57c0bd42f5b891d62` | the incorporated API DPA governs business/developer data; it states API content is processed in real time and not stored by Z.AI |

Devin Wiggins, as repository and business owner, accepts these current terms and
the conservative potentially-logged assumption only for this sanitized synthetic
advisory packet through the stated expiry. This is not product-data, regulated-use,
professional-decision, model-training, deployment, or release authorization.

The one final Opus 5 section review uses the separately authorized Claude Max OAuth
operator lane with requested model `anthropic/claude-opus-5`; it is not an
OpenRouter route and cannot substitute for deterministic fixtures, adversarial
security review, fact checking, independent verification, or owner authorization.

## Pattern-to-ticket fixture binding

| Ticket | Adopted pattern | Executable case family | Removal proof |
|---|---|---|---|
| `OBX-P180-T03` | T3 duplicate receipts, pure projection, stale-event rejection; MishMash explicit capability/skill boundary | `command-replay`, `event-projection`, `source-authority` | source/runtime absence leaves ONE BOX-owned reducers and frozen authority intact |
| `OBX-P180-T04` | MishMash side-effect-aware retry and explicit session lifecycle; T3 isolated instances and drainable work | `retry-side-effect`, `provider-lifecycle` | no upstream daemon/session/runtime is required to execute the offline oracle |
| `OBX-P180-T05` | exact audit route, privacy/budget/no-fallback, test-only receipts, source kill/removal | `audit-route-policy`, `source-removal` | disabled route makes zero provider calls and deterministic/manual workflow remains available |

Every source-adoption case declares its source references and ticket coverage. The
evaluator rejects unknown sources/tickets, source authority expansion, stale replay,
unsafe retry, active-session cleanup, privacy/budget drift, production reliance on a
test receipt bus, or removal that breaks the baseline.

Executable integrity binding:

| Artifact | SHA-256 |
|---|---|
| `docs/eval/one-box-program/fixtures/obx-p180-source-adoption-fixture-v1.json` | `3afe9adfd78251dd2904415995338335d027daa84eb082f2ce785d6ca708b3f2` |
| `scripts/eval/obx-p180-source-adoption-fixtures.mjs` | `81c52fe3033b9ad343c964880e2adfc9f9fbe9bd819f8df2fb3ca685f46b1d3a` |
| `scripts/eval/obx-p180-source-adoption-fixtures.node.mjs` | `5ea949f04718a432a1f14b79ae521bcc87b7577d41ab342f5b9a9459565f1f88` |
| `scripts/verify-obx-p180-source-adoption.mjs` | `f6825ae15e8401205d92a4c78c96870660d8e0c1f66141eafe5ba3e5242dd5d9` |

The packet-digest-covered ledger pins the same values. The standalone verifier
checks every digest and executes the network-denied fixture lane; file existence
alone cannot produce closure.
`SC-GH-010` and `SC-INT-001` each reference this same
`SC-SVC-003.evaluationBinding`, so pattern qualification does not rely on an
unbound textual oracle.

The authority manifest's derived `packetDigest` changed because the adopted-source
ledger is packet-covered. The resulting T02 target-hash refresh is separately
re-reviewed in
`docs/audits/evidence/security/2026-08-31-obx-p180-source-adoption-authority-repin.json`.
That receipt verifies the manifest changed only at `packetDigest` and records the
refresh as an integrity re-pin, not a re-approval or expansion of implementation
authority.
