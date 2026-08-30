# GitHub starred repositories: OneBox relevance

Snapshot date: 2026-08-29

## Coverage and method

GitHub authenticated `gh` as `wiggdevin`. A read-only `gh api --paginate --slurp` request to `/user/starred?per_page=100` returned 2 pages and 133 repositories. GitHub GraphQL independently reported `viewer.starredRepositories.totalCount = 133`; the counts match. This process issued no mutation calls, changed no stars, and cloned no repositories.

The companion JSON classifies all 133 repositories. This filtered report includes the 107 OneBox-relevant entries and excludes 26 unrelated entries. The triage uses repository metadata (name, description, topics, language, license, activity) plus read-only README checks for ambiguous entries. It does not substitute for a source-code or security audit.

The later source and license pass narrowed this broad triage to an [18-item phase-specific shortlist](github-starred-one-box-shortlist-2026-08-29.md). That shortlist is the only planning disposition and phase authority for starred repositories. The disposition and proposed-phase columns below, and their JSON counterparts, are reconciled traceability labels only. They cannot authorize a dependency, code reuse, or phase work.

## Category census

| Category | Repositories |
|---|---:|
| AI agent/model routing | 48 |
| Animation/assets | 14 |
| Browser shell/automation | 5 |
| Canvas/editor | 13 |
| Code/runtime | 6 |
| Collaboration | 10 |
| Design extraction/screenshot-to-code | 4 |
| QA/SEO/deploy | 7 |
| Unrelated | 26 |

## Shortlist cross-reference

Only sources present in the 18-item shortlist appear here:

- **E1 Agent Studio:** `pingdotgg/t3code`, `ollama/ollama`, `langchain-ai/deepagents`, `loop-js/loop.js`, `BuilderIO/agent-native`, and `supermemoryai/supermemory`.
- **E3 Collaboration:** `block/buzz`.
- **E4 Browser:** `ChromeDevTools/chrome-devtools-mcp` and `citrolabs/ego-lite`. These references do not clear the existing E4 rejection.
- **E5 Reconstruction:** `heygen-com/hyperframes` and `abi/screenshot-to-code`.
- **E7 Stack Intelligence:** `facebook/astryx`, `tailwindlabs/tailwindcss`, and `pmndrs/react-three-fiber`.
- **P5/E8 Publishing:** `CoreBunch/Instatic`, subordinate to the Release Orchestrator and with no E7 publishing authority.
- **E8 Delivery and gates:** `every-app/open-seo`, `usestrix/strix`, and `PostHog/posthog`.

The 89 other relevant repositories failed at least one published narrowing criterion: source-level specificity, architecture or dependency impact, non-duplication, authority-safe phase fit, maintenance or operational fit, or license fitness for the proposed use. In particular, `semantica-agi/semantica`, `fontsource/font-files`, and `livekit/agents` remain learn-only research references outside the shortlist. The separate LiveKit SFU decision concerns P3-gated media transport, not adoption of `livekit/agents`.

## License and metadata gaps

GitHub did not provide a usable SPDX identifier for 24 repositories: 9 returned no license object and 15 returned `NOASSERTION`. The classification marks 17 relevant entries as `Needs license review`. Missing SPDX repositories: `AutoForgeAI/autoforge`, `awesome-selfhosted/awesome-selfhosted`, `BuilderIO/agent-native`, `codecrafters-io/build-your-own-x`, `cursor/plugins`, `DavidHDev/react-bits`, `different-ai/openwork`, `goauthentik/authentik`, `google-deepmind/lab`, `harvard-edge/cs249r_book`, `hasaneyldrm/exercises-dataset`, `HowieHwong/MemoHarness`, `JuliusBrussee/caveman`, `karpathy/llm-council`, `lightningpixel/modly`, `lobehub/lobehub`, `michaelshimeles/skills`, `multica-ai/andrej-karpathy-skills`, `NateBJones-Projects/OB1`, `per-simmons/clone-app-pat-pro-public`, `PostHog/posthog`, `pytorch/pytorch`, `ripienaar/free-for-dev`, `twentyhq/twenty`.

The snapshot contains no archived repositories or forks. Six entries lacked a primary language, three lacked a description, and every entry had a default branch. These metadata gaps do not establish whether a repository is safe or usable.

Copyleft code-reuse rejects are `calesthio/OpenMontage` (AGPL-3.0), `Comfy-Org/ComfyUI` (GPL-3.0), `firecrawl/firecrawl` (AGPL-3.0), `makeplane/plane` (AGPL-3.0), and `webstudio-is/webstudio` (AGPL-3.0). This does not prohibit reading public documentation or using a separately approved hosted service; it rejects direct incorporation into OneBox without a deliberate licensing decision.

## Relevant inventory

| Repository | Category | Disposition | Proposed OneBox phase | License |
|---|---|---|---|---|
| [1jehuang/jcode](https://github.com/1jehuang/jcode) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | AI agent/model routing | Learn only | E2 Skills and Plan | MIT |
| [agegr/pi-web](https://github.com/agegr/pi-web) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [aipoch/open-science](https://github.com/aipoch/open-science) | AI agent/model routing | Learn only | E1 Agent Studio | Apache-2.0 |
| [anthropics/claude-cookbooks](https://github.com/anthropics/claude-cookbooks) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [asgeirtj/system_prompts_leaks](https://github.com/asgeirtj/system_prompts_leaks) | AI agent/model routing | Learn only | E1 Agent Studio | CC0-1.0 |
| [AutoForgeAI/autoforge](https://github.com/AutoForgeAI/autoforge) | AI agent/model routing | Needs license review | E1 Agent Studio | UNAVAILABLE |
| [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) | AI agent/model routing | Learn only | E2 Skills and Plan | MIT |
| [BennyKok/omg.dev](https://github.com/BennyKok/omg.dev) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [BuilderIO/agent-native](https://github.com/BuilderIO/agent-native) | AI agent/model routing | Needs license review | E1 Agent Studio | UNAVAILABLE |
| [cursor/plugins](https://github.com/cursor/plugins) | AI agent/model routing | Needs license review | E1 Agent Studio | UNAVAILABLE |
| [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [different-ai/openwork](https://github.com/different-ai/openwork) | AI agent/model routing | Needs license review | E1 Agent Studio | UNAVAILABLE |
| [earendil-works/pi](https://github.com/earendil-works/pi) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [esengine/DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) | AI agent/model routing | Learn only | E2 Skills and Plan | MIT |
| [garrytan/gstack](https://github.com/garrytan/gstack) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [google/skills](https://github.com/google/skills) | AI agent/model routing | Learn only | E2 Skills and Plan | Apache-2.0 |
| [herdrdev/herdr](https://github.com/herdrdev/herdr) | AI agent/model routing | Learn only | E1 Agent Studio | Apache-2.0 |
| [HowieHwong/MemoHarness](https://github.com/HowieHwong/MemoHarness) | AI agent/model routing | Needs license review | E1 Agent Studio | UNAVAILABLE |
| [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) | AI agent/model routing | Needs license review | E1 Agent Studio | UNAVAILABLE |
| [karpathy/llm-council](https://github.com/karpathy/llm-council) | AI agent/model routing | Needs license review | E1 Agent Studio | UNAVAILABLE |
| [Kulaxyz/self-learning-skills](https://github.com/Kulaxyz/self-learning-skills) | AI agent/model routing | Learn only | E2 Skills and Plan | MIT |
| [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) | AI agent/model routing | Adapt | E1 Agent Studio | MIT |
| [lobehub/lobehub](https://github.com/lobehub/lobehub) | AI agent/model routing | Needs license review | E1 Agent Studio | UNAVAILABLE |
| [loop-js/loop.js](https://github.com/loop-js/loop.js) | AI agent/model routing | Adapt | E1 Agent Studio | Apache-2.0 |
| [mattpocock/skills](https://github.com/mattpocock/skills) | AI agent/model routing | Learn only | E2 Skills and Plan | MIT |
| [michaelshimeles/skills](https://github.com/michaelshimeles/skills) | AI agent/model routing | Needs license review | E2 Skills and Plan | UNAVAILABLE |
| [microsoft/Orchard](https://github.com/microsoft/Orchard) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [MoonshotAI/kimi-cli](https://github.com/MoonshotAI/kimi-cli) | AI agent/model routing | Learn only | E1 Agent Studio | Apache-2.0 |
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | AI agent/model routing | Needs license review | E2 Skills and Plan | UNAVAILABLE |
| [NateBJones-Projects/OB1](https://github.com/NateBJones-Projects/OB1) | AI agent/model routing | Needs license review | E1 Agent Studio | UNAVAILABLE |
| [obra/superpowers](https://github.com/obra/superpowers) | AI agent/model routing | Learn only | E2 Skills and Plan | MIT |
| [ollama/ollama](https://github.com/ollama/ollama) | AI agent/model routing | Adapt | E1 Agent Studio | MIT |
| [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) | AI agent/model routing | Learn only | E1 Agent Studio | Apache-2.0 |
| [owainlewis/push](https://github.com/owainlewis/push) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [pingdotgg/t3code](https://github.com/pingdotgg/t3code) | AI agent/model routing | Adapt | E1 Agent Studio | MIT |
| [PrimeIntellect-ai/prime-agent](https://github.com/PrimeIntellect-ai/prime-agent) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [revfactory/harness](https://github.com/revfactory/harness) | AI agent/model routing | Learn only | E2 Skills and Plan | Apache-2.0 |
| [ruvnet/ruflo](https://github.com/ruvnet/ruflo) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [semantica-agi/semantica](https://github.com/semantica-agi/semantica) | AI agent/model routing | Learn only | E1 Agent Studio research reference; not shortlisted | MIT |
| [shanraisshan/claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [Shubhamsaboo/awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) | AI agent/model routing | Learn only | E1 Agent Studio | Apache-2.0 |
| [stablyai/orca](https://github.com/stablyai/orca) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [steipete/CodexBar](https://github.com/steipete/CodexBar) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [supermemoryai/supermemory](https://github.com/supermemoryai/supermemory) | AI agent/model routing | Learn only | E1 Agent Studio | MIT |
| [virgiliojr94/book-to-skill](https://github.com/virgiliojr94/book-to-skill) | AI agent/model routing | Learn only | E2 Skills and Plan | MIT |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | AI agent/model routing | Learn only | E2 Skills and Plan | MIT |
| [bradtraversy/design-resources-for-developers](https://github.com/bradtraversy/design-resources-for-developers) | Animation/assets | Learn only | E7 Stack Intelligence | MIT |
| [browser-use/video-use](https://github.com/browser-use/video-use) | Animation/assets | Learn only | E7 Stack Intelligence | MIT |
| [calesthio/OpenMontage](https://github.com/calesthio/OpenMontage) | Animation/assets | Reject | E7 Stack Intelligence | AGPL-3.0 |
| [Comfy-Org/ComfyUI](https://github.com/Comfy-Org/ComfyUI) | Animation/assets | Reject | E7 Stack Intelligence | GPL-3.0 |
| [DavidHDev/react-bits](https://github.com/DavidHDev/react-bits) | Animation/assets | Needs license review | E7 Stack Intelligence | UNAVAILABLE |
| [fontsource/font-files](https://github.com/fontsource/font-files) | Animation/assets | Learn only | E7 Stack Intelligence research reference; not shortlisted | MIT |
| [guillermolg00/morphicons](https://github.com/guillermolg00/morphicons) | Animation/assets | Adapt | E7 Stack Intelligence | MIT |
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Animation/assets | Adapt | E5 Reconstruction | Apache-2.0 |
| [kud/globetrotter](https://github.com/kud/globetrotter) | Animation/assets | Learn only | E7 Stack Intelligence | MIT |
| [lightningpixel/modly](https://github.com/lightningpixel/modly) | Animation/assets | Needs license review | E7 Stack Intelligence | UNAVAILABLE |
| [mojs/mojs](https://github.com/mojs/mojs) | Animation/assets | Learn only | E7 Stack Intelligence | MIT |
| [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut) | Animation/assets | Learn only | E7 Stack Intelligence | MIT |
| [pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber) | Animation/assets | Conditional adopt | E7 Stack Intelligence; qualified ExperienceModule only | MIT |
| [pulkitxm/claude-directory](https://github.com/pulkitxm/claude-directory) | Animation/assets | Learn only | E7 Stack Intelligence | MIT |
| [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Browser shell/automation | Adapt | E4 Browser | Apache-2.0 |
| [citrolabs/ego-lite](https://github.com/citrolabs/ego-lite) | Browser shell/automation | Adapt | E4 Browser | MIT |
| [CloakHQ/CloakBrowser](https://github.com/CloakHQ/CloakBrowser) | Browser shell/automation | Reject | E4 Browser | MIT |
| [firecrawl/firecrawl](https://github.com/firecrawl/firecrawl) | Browser shell/automation | Reject | E4 Browser | AGPL-3.0 |
| [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | Browser shell/automation | Learn only | E4 Browser | MIT |
| [ant-design/ant-design](https://github.com/ant-design/ant-design) | Canvas/editor | Learn only | Existing Canvas lifecycle + E7 Stack Intelligence | MIT |
| [chakra-ui/chakra-ui](https://github.com/chakra-ui/chakra-ui) | Canvas/editor | Learn only | Existing Canvas lifecycle + E7 Stack Intelligence | MIT |
| [CoreBunch/Instatic](https://github.com/CoreBunch/Instatic) | Canvas/editor | Adapt | P5/E8 after P1, P3, P4, and explicit P5 authorization; no E7 publishing authority | MIT |
| [darkroomengineering/satus](https://github.com/darkroomengineering/satus) | Canvas/editor | Learn only | Existing Canvas lifecycle + E7 Stack Intelligence | MIT |
| [emilkowalski/skills](https://github.com/emilkowalski/skills) | Canvas/editor | Learn only | Existing Canvas lifecycle + E7 Stack Intelligence | MIT |
| [facebook/astryx](https://github.com/facebook/astryx) | Canvas/editor | Adapt | Existing Canvas lifecycle + E7 Stack Intelligence | MIT |
| [ibelick/ui-skills](https://github.com/ibelick/ui-skills) | Canvas/editor | Learn only | Existing Canvas lifecycle + E7 Stack Intelligence | MIT |
| [Nutlope/hallmark](https://github.com/Nutlope/hallmark) | Canvas/editor | Adapt | Existing Canvas lifecycle + E7 Stack Intelligence | MIT |
| [pascalorg/editor](https://github.com/pascalorg/editor) | Canvas/editor | Learn only | Existing Canvas lifecycle + E7 Stack Intelligence | MIT |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Canvas/editor | Learn only | Existing Canvas lifecycle + E7 Stack Intelligence | Apache-2.0 |
| [saadeghi/daisyui](https://github.com/saadeghi/daisyui) | Canvas/editor | Learn only | Existing Canvas lifecycle + E7 Stack Intelligence | MIT |
| [tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss) | Canvas/editor | Adopt | Existing Canvas lifecycle + E7 Stack Intelligence | MIT |
| [webstudio-is/webstudio](https://github.com/webstudio-is/webstudio) | Canvas/editor | Reject | Existing Canvas lifecycle + E7 Stack Intelligence | AGPL-3.0 |
| [apple/container](https://github.com/apple/container) | Code/runtime | Adapt | E8 Delivery | Apache-2.0 |
| [coderabbitai/git-worktree-runner](https://github.com/coderabbitai/git-worktree-runner) | Code/runtime | Adapt | E8 Delivery | Apache-2.0 |
| [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) | Code/runtime | Adapt | E8 Delivery | MIT |
| [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | Code/runtime | Adapt | E8 Delivery | Apache-2.0 |
| [lyogavin/airllm](https://github.com/lyogavin/airllm) | Code/runtime | Learn only | E8 Delivery | Apache-2.0 |
| [orbstack/orbstack](https://github.com/orbstack/orbstack) | Code/runtime | Learn only | E8 Delivery | MIT |
| [block/buzz](https://github.com/block/buzz) | Collaboration | Adapt | E0 Identity + E3 Collaboration | Apache-2.0 |
| [goauthentik/authentik](https://github.com/goauthentik/authentik) | Collaboration | Needs license review | E0 Identity + E3 Collaboration | UNAVAILABLE |
| [huggingface/speech-to-speech](https://github.com/huggingface/speech-to-speech) | Collaboration | Learn only | E6 Client room | Apache-2.0 |
| [lfnovo/open-notebook](https://github.com/lfnovo/open-notebook) | Collaboration | Learn only | E2 Skills and Plan | MIT |
| [likec4/likec4](https://github.com/likec4/likec4) | Collaboration | Adapt | E2 Skills and Plan | MIT |
| [livekit/agents](https://github.com/livekit/agents) | Collaboration | Learn only | E6 Client room research reference; not the P3-gated LiveKit SFU | Apache-2.0 |
| [makeplane/plane](https://github.com/makeplane/plane) | Collaboration | Reject | E0 Identity + E3 Collaboration | AGPL-3.0 |
| [trycompai/crm](https://github.com/trycompai/crm) | Collaboration | Learn only | E0 Identity + E3 Collaboration | MIT |
| [tt-a1i/archify](https://github.com/tt-a1i/archify) | Collaboration | Adapt | E2 Skills and Plan | MIT |
| [twentyhq/twenty](https://github.com/twentyhq/twenty) | Collaboration | Needs license review | E0 Identity + E3 Collaboration | UNAVAILABLE |
| [abi/screenshot-to-code](https://github.com/abi/screenshot-to-code) | Design extraction/screenshot-to-code | Adapt | E5 Reconstruction | MIT |
| [bradautomates/claude-video](https://github.com/bradautomates/claude-video) | Design extraction/screenshot-to-code | Adapt | E5 Reconstruction | MIT |
| [JCodesMore/ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template) | Design extraction/screenshot-to-code | Adapt | E5 Reconstruction | MIT |
| [per-simmons/clone-app-pat-pro-public](https://github.com/per-simmons/clone-app-pat-pro-public) | Design extraction/screenshot-to-code | Needs license review | E5 Reconstruction | UNAVAILABLE |
| [alibaba/open-code-review](https://github.com/alibaba/open-code-review) | QA/SEO/deploy | Learn only | Existing P1-P8 lifecycle + E8 Delivery | Apache-2.0 |
| [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | QA/SEO/deploy | Adapt | Existing P1-P8 lifecycle + E8 Delivery | MIT |
| [every-app/open-seo](https://github.com/every-app/open-seo) | QA/SEO/deploy | Adapt | Existing P1-P8 lifecycle + E8 Delivery | MIT |
| [PostHog/posthog](https://github.com/PostHog/posthog) | QA/SEO/deploy | Needs license review | E8 Delivery research only; no code-level use until a license receipt exists | UNAVAILABLE |
| [smicallef/spiderfoot](https://github.com/smicallef/spiderfoot) | QA/SEO/deploy | Learn only | Existing P1-P8 lifecycle + E8 Delivery | MIT |
| [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph) | QA/SEO/deploy | Adapt | Existing P1-P8 lifecycle + E8 Delivery | MIT |
| [usestrix/strix](https://github.com/usestrix/strix) | QA/SEO/deploy | Learn only | E8 Delivery; optional separately authorized external gate | Apache-2.0 |

## Raw artifact

The companion `github-starred-2026-08-29.json` contains all 133 repositories and the requested repository fields plus the per-repository OneBox classification, disposition, and phase.
