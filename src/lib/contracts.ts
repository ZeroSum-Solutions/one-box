/**
 * Shared contracts for the one-box pipeline.
 * Every stage reads/writes these shapes; sites/<id>/run.json is the durable
 * state machine. No stage may invent fields outside these types.
 */
import { z } from "zod";

// ---------- Run state ----------

export const STAGES = [
  "intake",
  "scanned",
  "locked",
  "synthesized",
  "built",
  "edited",
] as const;
export type Stage = (typeof STAGES)[number];

export const StageStatusSchema = z.object({
  status: z.enum(["pending", "running", "done", "failed"]),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  error: z.string().optional(),
  retries: z.number().default(0),
});

export const RunStateSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  stages: z.record(z.enum(STAGES), StageStatusSchema),
  costUsd: z.number().default(0), // OpenRouter + Firecrawl spend tally
  costCapUsd: z.number().default(3), // hard per-run cap; stop, never silently retry
  modelSlugs: z.record(z.string(), z.string()),
  /** Phase 4 A/B arm: refero (R, default) | local (L, catalog-index lock) |
   * none (N, control — identity invented from intake + vibe alone). */
  referenceMode: z.enum(["refero", "local", "none"]).default("refero"),
});
export type RunState = z.infer<typeof RunStateSchema>;
export type ReferenceMode = RunState["referenceMode"];

// ---------- Stage 1: intake ----------

export const IntakeSchema = z.object({
  businessName: z.string(),
  category: z.string(), // e.g. "fiber optic installer" — pilot is local-service L1–L2
  location: z.string(), // city, state — REQUIRED for a meaningful competitor scan
  services: z.array(z.string()).min(1),
  phone: z.string().optional(),
  serviceArea: z.string().optional(),
  yearsInBusiness: z.string().optional(),
  certifications: z.array(z.string()).default([]),
  claims: z.array(z.string()).default([]), // only evidence-backed facts the user gave us
  primaryAction: z.enum(["call", "book", "quote"]),
  prospectUrl: z.string().optional(), // existing site, if any
  vibeWords: z.array(z.string()).default([]), // how they want to feel
});
export type Intake = z.infer<typeof IntakeSchema>;

// ---------- Stage 2: competitive scan ----------

export const CompetitorSchema = z.object({
  name: z.string(),
  url: z.string(),
  source: z.string(), // where we found it (search result provenance)
  markdownPath: z.string().optional(), // crawl artifact
  screenshotPaths: z.array(z.string()).default([]), // 1440 + 390
  structure: z.array(z.string()).default([]), // observed section inventory
  notes: z.string().optional(),
});
export type Competitor = z.infer<typeof CompetitorSchema>;

export const ScanResultSchema = z.object({
  competitors: z.array(CompetitorSchema).max(4),
  commonSections: z.array(z.string()), // structure signal, NOT style input
  gaps: z.array(z.string()), // what nobody in the market does well
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

// ---------- Stage 3: Refero reference lock ----------

export const ReferenceLockSchema = z.object({
  searchAngles: z.array(z.string()).min(3).max(5),
  primary: z.object({
    referoId: z.string(), // style or screen id
    kind: z.enum(["style", "screen"]),
    name: z.string(),
    why: z.string(),
  }),
  borrowedDetails: z
    .array(
      z.object({
        referoId: z.string(),
        detail: z.string(), // ONE specific detail borrowed
        why: z.string(),
      })
    )
    .max(2), // anti-averaging: never more than 2
  rejected: z.array(
    z.object({ referoId: z.string(), name: z.string(), why: z.string() })
  ),
  decisionLedger: z.array(
    z.object({ decision: z.string(), source: z.string() }) // every choice traces
  ),
});
export type ReferenceLock = z.infer<typeof ReferenceLockSchema>;

// ---------- Stage 4: synthesis ----------

export const DesignTokensSchema = z.object({
  colors: z.array(
    z.object({
      name: z.string(),
      value: z.string(), // hex or gradient
      cssVar: z.string(), // --color-*
      role: z.string(), // where it lives
      forbidden: z.string().optional(), // where it must NEVER appear
    })
  ),
  fonts: z.array(
    z.object({
      family: z.string(),
      cssVar: z.string(),
      weights: z.array(z.number()),
      role: z.string(),
      substitutes: z.array(z.string()).default([]),
    })
  ),
  typeScale: z.array(
    z.object({
      role: z.string(),
      sizePx: z.number(),
      lineHeight: z.number(),
      trackingEm: z.number().optional(),
      cssVar: z.string(),
    })
  ),
  radii: z.record(z.string(), z.string()),
  spacing: z.record(z.string(), z.string()),
  layout: z.object({
    maxWidthPx: z.number(),
    sectionGapPx: z.number(),
    cardPaddingPx: z.number(),
  }),
  motion: z.object({
    easing: z.string(),
    durationMs: z.object({ micro: z.number(), reveal: z.number() }),
    revealClasses: z.array(z.string()), // which classes get scroll reveals
  }),
  componentStates: z.array(
    z.object({
      component: z.string(),
      states: z.record(z.string(), z.string()), // default/hover/focus/disabled → css summary
    })
  ),
  imageryBrief: z.object({
    subject: z.string(),
    lighting: z.string(),
    grade: z.string(),
    framing: z.string(),
    avoid: z.array(z.string()),
  }),
});
export type DesignTokens = z.infer<typeof DesignTokensSchema>;

export const SkeletonSpecSchema = z.object({
  sections: z.array(
    z.object({
      id: z.string(), // maps to template section + data-edit-id prefix
      name: z.string(),
      purpose: z.string(),
      contentNeeds: z.array(z.string()),
    })
  ),
});
export type SkeletonSpec = z.infer<typeof SkeletonSpecSchema>;

export const CopyDocSchema = z.object({
  // Every string traces to intake facts or is generic-safe; no invented claims.
  sections: z.record(z.string(), z.record(z.string(), z.string())),
  stopSlopScore: z.number().optional(), // out of 50; revise below 35
});
export type CopyDoc = z.infer<typeof CopyDocSchema>;

// ---------- Stage 5: build ----------

export const SiteManifestSchema = z.object({
  entry: z.string(), // "index.html"
  files: z.array(z.string()), // relative paths only, no ".." — validated
  assets: z.array(
    z.object({
      path: z.string(),
      kind: z.enum(["image", "css", "js", "font"]),
      generatedBy: z.string().optional(), // e.g. "higgsfield:gpt-image-2"
    })
  ),
  builtAt: z.string(),
  complete: z.boolean(), // atomic completion marker — preview refuses incomplete
});
export type SiteManifest = z.infer<typeof SiteManifestSchema>;

// ---------- Gates ----------

export const GateReportSchema = z.object({
  gate: z.string(),
  pass: z.boolean(),
  blocking: z.boolean(),
  details: z.array(z.string()),
  ranAt: z.string(),
});
export type GateReport = z.infer<typeof GateReportSchema>;

// ---------- Editor ----------

export const EditRequestSchema = z.object({
  runId: z.string(),
  editId: z.string(), // data-edit-id — the ONLY selector the editor accepts
  instruction: z.string(),
  imageIntent: z.boolean().default(false), // route to Higgsfield swap
});
export type EditRequest = z.infer<typeof EditRequestSchema>;

// ---------- Pipeline progress events (SSE to the chat UI) ----------

export type PipelineEvent =
  | { type: "stage"; stage: Stage; status: "running" | "done" | "failed"; note?: string }
  | { type: "card"; stage: Stage; title: string; body: string; images?: string[] }
  | { type: "cost"; usd: number }
  | { type: "complete"; runId: string; previewUrl: string }
  | { type: "error"; message: string };

// ---------- Paths ----------

export const SITES_DIR = "sites"; // repo-root relative; each run = sites/<id>/
export const RUN_FILE = "run.json";
export const RESEARCH_DIR = "research";
export const SITE_DIR = "site"; // the built artifact lives here
export const ARTIFACTS = {
  intake: "intake.json",
  scan: "scan.json",
  lock: "reference-lock.json",
  designMd: "DESIGN.md",
  tokens: "tokens.json",
  skeleton: "skeleton.json",
  copy: "copy.json",
  manifest: "site/manifest.json",
  gates: "gates.json",
} as const;

// ---------- Model slugs (verified live 2026-08-12; re-verify in Phase 0 smoke) ----------

export const MODELS = {
  orchestrator: "google/gemini-3.1-pro-preview", // reasoning + vision
  builder: "moonshotai/kimi-k3", // frontend/webdev strength
  bulk: "deepseek/deepseek-v4-flash", // classification/extraction
} as const;
