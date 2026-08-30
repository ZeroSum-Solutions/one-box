# Hugging Face candidates for ONE BOX

Snapshot date: 2026-08-29

## Decision

Build the benchmark harness and evaluate permissively licensed fixtures inside Research/T1. Do not adopt a model runtime. Every row in this note remains Research/T1 only while E4 is blocked. None of these resources clears the embedded-browser security rejection or gains authority to click, write Page IR, approve a candidate, or publish a site.

The first local model comparison should be Qwen3.5-4B against specialist OCR, grounding, and retrieval baselines. It must run on the actual agency Apple-silicon target with pinned artifacts, no network after installation, and typed proposal output. A local weight conversion is ineligible unless its source, license, revision, and artifact hash come from an official publication or a counsel-reviewed receipt.

## Model and runtime shortlist

| Resource | Useful for | Published footprint and license | ONE BOX decision | Phase |
|---|---|---|---|---|
| [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B) | Multimodal understanding, Page IR proposals, bounded code proposals | 4.66B parameters; Apache-2.0 official base model | Evaluate first. Test 9B only if measured quality gain pays for memory and latency. Never accept raw HTML or JS; do not use an unreviewed community conversion. | Research/T1 only |
| [PaddleOCR-VL-1.6](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6) | OCR, text spotting, tables, charts, formulas, document parsing | 0.96B parameters; about 1.93 GB BF16; Apache-2.0 | Evaluate as the small OCR specialist, including web fonts, overlays, responsive screenshots, and boxes. | Research/T1 only |
| [Florence-2-large-ft](https://huggingface.co/microsoft/Florence-2-large-ft) | OCR, region proposals, phrase grounding, object detection | 0.77B parameters; about 3.08 GB Hub storage; MIT | Evaluate as a low-cost grounding baseline. Pin and inspect its `trust_remote_code` revision. | Research/T1 only |
| [SigLIP2 base](https://huggingface.co/google/siglip2-base-patch16-224) | Small visual-reference retrieval baseline | 0.375B parameters; Apache-2.0 | Evaluate first because it avoids custom model code. Expect tiny UI-text loss at 224 px. | Research/T1 only |
| [BGE-VL-Screenshot](https://huggingface.co/BAAI/BGE-VL-Screenshot) | Screenshot-specific text, image, and composed-query retrieval | 3.75B parameters; about 7.52 GB BF16; MIT | Evaluate only if smaller retrieval baselines are insufficient. Requires pinned custom code and local Apple-silicon evidence. | Research/T1 only |
| [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) | Text evidence, source, copy, and code retrieval | 0.596B parameters; Apache-2.0; 32K context | Evaluate in a OneBox-specific lane. It must not replace or contaminate the existing zs-memory embedding service. | Research/T1 only |
| [GUI-Actor-7B](https://huggingface.co/microsoft/GUI-Actor-7B-Qwen2.5-VL) | Candidate screen-target coordinates with a separate verifier | 8.39B parameters; about 16.8 GB BF16; MIT; CUDA-oriented reference path | Evaluate late. It may propose a target, but never click, type, navigate, or commit. | Research/T1 only |
| [HHEM-2.1-Open](https://huggingface.co/vectara/hallucination_evaluation_model) | Advisory premise-to-claim consistency | 0.11B parameters; about 439 MB safetensor; Apache-2.0 | Evaluate as one weak signal. It is not truth, SEO, legal substantiation, or release approval. | Research/T1 only |
| [BiRefNet](https://huggingface.co/ZhengPeng7/BiRefNet) | Governed background and salient-object extraction | 0.22B parameters; current main weight about 445 MB; MIT | Evaluate with source-rights receipts and preview. | Research/T1 only |
| [Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) | Optional local generated-image fallback | 6.15B parameters; large 53.98 GB Hub tree; Apache-2.0 | Learn first. It does not displace the approved Higgsfield-first asset lane. | Research/T1 only |
| [Apple MLX](https://github.com/ml-explore/mlx) and [mlx-vlm](https://github.com/Blaizzy/mlx-vlm) | Apple-silicon benchmark runtime and local multimodal adapter | Both MIT; MLX is Apple-owned, mlx-vlm is third-party | Evaluate both for the isolated research harness only. Bind loopback only. Use no conversion until an official or counsel-reviewed receipt records source, license, revision, and hash. | Research/T1 only |

Model-card benchmark numbers are vendor-published leads, not ONE BOX acceptance evidence. Hub storage can include multiple formats and repository history; it is not peak runtime memory.

## Hold, learn, or reject

Every row in this section remains Research/T1 only.

| Resource | Reason | Decision | Scope |
|---|---|---|---|
| [OmniParser v2](https://huggingface.co/microsoft/OmniParser-v2.0) | Top-level metadata says MIT, its bundled icon detector is AGPL-3.0, and the current official repository reports CC-BY-4.0. The card also says harmful input is not detected. | Needs license review. Do not use the bundled commercial runtime. | Research/T1 only |
| [UI-TARS-1.5-7B](https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B) and [ShowUI-2B](https://huggingface.co/showlab/ShowUI-2B) | Older action-oriented models with no authority-bound integration advantage over the primary shortlist | Learn only; benchmark only if Qwen3.5 and GUI-Actor fail. | Research/T1 only |
| [VLM WebSight fine-tune](https://huggingface.co/HuggingFaceM4/VLM_WebSight_finetuned) | Early-alpha direct HTML/CSS output conflicts with validated Page IR | Learn only. | Research/T1 only |
| [one-align](https://huggingface.co/q-future/one-align) | General aesthetic scalar is not web usability, brand fidelity, accessibility, or evidence | Reject as a production gate. | Research/T1 only |
| [Wan2.2 TI2V](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B) | Heavy video generator is not a deterministic site-motion system | Learn only for a future video-asset lane. | Research/T1 only |
| [WebLINX](https://huggingface.co/datasets/McGill-NLP/WebLINX) | CC-BY-NC-SA-4.0 conflicts with commercial training and runtime use | Reject for commercial training; learn from public paper and schema. | Research/T1 only |
| [WebInfinity](https://huggingface.co/datasets/DesonDai/WebInfinity) | Model-generated pages have not passed a page-rights and provenance audit | Exclude from the offline corpus pending provenance review. | Research/T1 only |

Public Hugging Face Spaces are demos only. Never upload private projects, client content, cookies, credentials, or unpublished captures to them.

## Research/T1 offline corpus candidates

These rows are eligible only for the Research/T1 offline harness after the stated pin, license, rights, and attribution checks.

| Dataset | License and size | Why it belongs | Limitation | Scope |
|---|---|---|---|---|
| [pattern2code](https://huggingface.co/datasets/knguyennguyen/pattern2code) | ODC-BY; 720 counterfactual cases; about 372 MB | Detects whether reconstruction follows the pixels or incorrectly repairs a deliberate local difference | Attribution must travel with fixtures; built from Design2Code | Research/T1 only |
| [ScreenSpot-v2](https://huggingface.co/datasets/OS-Copilot/ScreenSpot-v2) | Apache-2.0; about 2.66 GB | Standard GUI target grounding | Pin official files because Hub loading has had friction | Research/T1 only |
| [ScreenSpot-Pro](https://huggingface.co/datasets/likaixin/ScreenSpot-Pro) | MIT; about 3.32 GB | High-resolution professional GUI grounding | Not a ONE BOX acceptance corpus by itself | Research/T1 only |
| [WebClick](https://huggingface.co/datasets/Hcompany/WebClick) | Apache-2.0; 1,639 screenshots from more than 100 sites | Web-specific element localization where OCR alone is insufficient | Requires offline pinned cases and local geometry checks | Research/T1 only |
| [Design2Code](https://huggingface.co/datasets/SALT-NLP/Design2Code) and [HARD](https://huggingface.co/datasets/SALT-NLP/Design2Code-HARD) | ODC-BY; 485 main cases plus hard subset | Render similarity and layout-reconstruction evaluation | Use a reviewed evaluation subset only; source-page rights and direct-HTML target do not match Page IR | Research/T1 only |

## Separately authorized integration benchmarks

This section also remains Research/T1 only. Separate authorization permits a benchmark run, not product integration.

| Benchmark | Access and environment | Reusable value | Decision | Scope |
|---|---|---|---|---|
| [ST-WebAgentBench](https://huggingface.co/datasets/ST-WebAgentBench/st-webagentbench) | Apache-2.0 overview; files require contact-information agreement; full execution requires BrowserGym, provisioned WebArena and SuiteCRM applications, credentials, setup scripts, and effect isolation | Adapt the 80 modality-challenge and policy patterns into rights-reviewed local fixtures | Keep the official benchmark outside the offline corpus. Run it only as a separately authorized, sandboxed integration benchmark after environment, credential, dependency, and effect review. | Research/T1 only |

## ONE BOX local benchmark contract

The corpus must be pinned, offline, and contain:

- ONE BOX and Canvas renders at desktop, tablet, and mobile viewports;
- reference screenshots with viewport, device-pixel ratio, source URL, timestamp, crop, rights, and artifact hash;
- trusted local DOM, accessibility tree, computed styles, visible text, boxes, Page IR, and human labels;
- hostile cases with rendered prompt injection, hidden DOM, `aria-hidden`, invisible text, overlays, iframes, shadow DOM, occlusion, browser chrome, and false clickable targets.

Measure each capability separately:

- OCR character and word error, box precision, recall, and overlap;
- grounding hit rate and false-target rate by viewport and action class;
- screenshot retrieval Recall@1, Recall@5, and nDCG;
- Page IR schema-valid rate, typed-mutation validity, deterministic compile success, visual difference, and blinded fidelity ranking;
- evidence precision, recall, abstention, and false-confidence rate;
- cold start, p50 and p95 latency, peak unified memory, disk, energy, drift, and attempted network access on the 48 GB Apple-silicon target.

Predeclare a threshold per capability. Do not accept a model through one blended score.

## Non-negotiable integration controls

- Model output is a typed proposal with artifact hash, source, boxes, extracted text, confidence, and uncertainty.
- Cookies, credentials, storage, unrestricted raw DOM, and arbitrary browser state never enter a model context.
- Inspect and pin every `trust_remote_code` repository and weight revision. Install once, then run local-only in an isolated worker with no egress and hard resource limits.
- Bind local inference endpoints to loopback only.
- Revalidate any proposed coordinate against current view geometry and lifecycle state. Effectful use requires a separate verifier and explicit human commit.
- DOM and accessibility evidence, Page IR schemas, the compiler, deterministic gates, and human approval remain authoritative.
