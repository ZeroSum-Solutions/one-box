/**
 * Shared contracts for the one-box pipeline.
 * Every stage reads/writes these shapes; sites/<id>/run.json is the durable
 * state machine. No stage may invent fields outside these types.
 */
import { z } from "zod";

// ---------- Project and evidence workflow ----------

export const ProjectTargetSchema = z.enum(["website", "web-app", "ios-app"]);
export type ProjectTarget = z.infer<typeof ProjectTargetSchema>;

export const ResearchConfigurationSchema = z.object({
  enabled: z.boolean().default(true),
  businessIntelligence: z.boolean().default(true),
  referoDesignEvidence: z.boolean().default(true),
  allowPaidFirecrawlFallback: z.boolean().default(false),
});
export type ResearchConfiguration = z.infer<
  typeof ResearchConfigurationSchema
>;

export const UploadMetadataSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  kind: z.enum([
    "logo",
    "brand-guidelines",
    "screenshot",
    "copy-document",
    "do-dont-list",
    "wish-list",
    "folder",
    "archive",
    "other",
  ]),
  mediaType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedAt: z.string(),
  sha256: z.string().optional(),
  /** Run-relative path assigned only after the server claims staged bytes. */
  storagePath: z.string().optional(),
});
export type UploadMetadata = z.infer<typeof UploadMetadataSchema>;

export const CrawlProvenanceSchema = z
  .object({
    provider: z.enum(["crawl4ai", "firecrawl"]),
    sourceUrl: z.string(),
    extractedAt: z.string(),
    confidence: z.number().min(0).max(1),
    outcome: z.enum(["succeeded", "failed"]),
    failureReason: z.string().optional(),
    fallbackReason: z
      .enum([
        "local-failure",
        "bot-challenge",
        "unsupported-capability",
        "user-approved-paid-fallback",
      ])
      .optional(),
    paidFallbackApproved: z.boolean().optional(),
  })
  .superRefine((record, ctx) => {
    if (record.outcome === "failed" && !record.failureReason) {
      ctx.addIssue({
        code: "custom",
        path: ["failureReason"],
        message: "failed crawls must record a failure reason",
      });
    }
    if (record.provider === "firecrawl" && !record.fallbackReason) {
      ctx.addIssue({
        code: "custom",
        path: ["fallbackReason"],
        message: "Firecrawl records must identify the fallback reason",
      });
    }
    if (
      record.fallbackReason === "user-approved-paid-fallback" &&
      record.paidFallbackApproved !== true
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["paidFallbackApproved"],
        message: "paid fallback must record explicit approval",
      });
    }
  });
export type CrawlProvenance = z.infer<typeof CrawlProvenanceSchema>;

export const EvidenceSourceSchema = z.object({
  id: z.string(),
  sourceUrl: z.string(),
  title: z.string().optional(),
  screenshotPaths: z.array(z.string()).default([]),
  extractedArtifactPaths: z.array(z.string()).default([]),
  capturedAt: z.string(),
  confidence: z.number().min(0).max(1),
  crawl: CrawlProvenanceSchema.optional(),
  crawlAttempts: z.array(CrawlProvenanceSchema).default([]),
});
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const EvidenceClaimSchema = z.object({
  id: z.string(),
  statement: z.string(),
  classification: z.enum(["observed", "inferred", "recommended"]),
  sourceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;

/** Business/market findings are intentionally a different contract from
 * visual/structural Refero findings. A competitor never becomes a design
 * reference merely by appearing here. */
export const BusinessIntelligenceEvidenceSchema = z.object({
  kind: z.literal("business-intelligence"),
  sources: z.array(EvidenceSourceSchema).default([]),
  competitors: z
    .array(
      z.object({
        name: z.string(),
        url: z.string(),
        selectionRationale: z.string(),
        strengths: z.array(z.string()).default([]),
        gaps: z.array(z.string()).default([]),
      })
    )
    .default([]),
  marketExpectations: z.array(z.string()).default([]),
  differentiationOpportunities: z.array(z.string()).default([]),
  claims: z.array(EvidenceClaimSchema).default([]),
});
export type BusinessIntelligenceEvidence = z.infer<
  typeof BusinessIntelligenceEvidenceSchema
>;

export const ReferoDesignEvidenceSchema = z.object({
  kind: z.literal("refero-design-evidence"),
  sources: z.array(EvidenceSourceSchema).default([]),
  references: z
    .array(
      z.object({
        referoId: z.string(),
        name: z.string(),
        sourceUrl: z.string().optional(),
        learningRationale: z.string(),
        reusablePatterns: z.array(z.string()).min(1),
      })
    )
    .default([]),
  claims: z.array(EvidenceClaimSchema).default([]),
});
export type ReferoDesignEvidence = z.infer<
  typeof ReferoDesignEvidenceSchema
>;

export const DesignResearchLedgerSchema = z.object({
  projectTarget: ProjectTargetSchema,
  businessIntelligence: BusinessIntelligenceEvidenceSchema,
  referoDesignEvidence: ReferoDesignEvidenceSchema,
  clientEvidence: z
    .object({
      sources: z.array(EvidenceSourceSchema).default([]),
      claims: z.array(EvidenceClaimSchema).default([]),
      artifactRelationships: z
        .array(
          z.object({
            uploadId: z.string(),
            kind: z.string(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
            status: z.enum(["text-consumed", "asset-referenced", "unsupported"]),
            consumer: z.enum(["design", "copy"]).optional(),
            sourceId: z.string().optional(),
          })
        )
        .default([]),
      unsupportedUploadIds: z.array(z.string()).default([]),
    })
    .default(() => ({
      sources: [],
      claims: [],
      artifactRelationships: [],
      unsupportedUploadIds: [],
    })),
});
export type DesignResearchLedger = z.infer<
  typeof DesignResearchLedgerSchema
>;

export const DesignContractMetadataSchema = z.object({
  title: z.string(),
  contractPath: z.string(),
  sourceLedgerVersion: z.number().int().positive(),
  approvedEvidenceIds: z.array(z.string()).default([]),
  exportPaths: z.array(z.string()).default([]),
  contractSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  exportSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /** The approved semantic proposal embodied by DESIGN.md. Optional only for
   * persisted pre-v2 fixtures; gated generation requires it downstream. */
  designTokens: z.lazy(() => DesignTokensSchema).optional(),
});
export const V2DesignContractMetadataSchema = DesignContractMetadataSchema.extend({
  contractSha256: z.string().regex(/^[a-f0-9]{64}$/),
  exportSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type DesignContractMetadata = z.infer<
  typeof DesignContractMetadataSchema
>;

export const TOKEN_INVENTORY_CATEGORIES = [
  "color",
  "typography",
  "spacing",
  "radius",
  "border",
  "shadow",
  "breakpoint",
  "motion",
  "layer",
  "component-state",
] as const;

export const TokenInventorySchema = z.object({
  sourceContractVersion: z.number().int().positive(),
  tokens: z.array(
    z.object({
      semanticName: z.string(),
      value: z.string(),
      usage: z.string(),
      category: z.enum(TOKEN_INVENTORY_CATEGORIES),
      sourceEvidenceIds: z.array(z.string()).default([]),
      editable: z.boolean().default(true),
    })
  ).min(1),
}).superRefine((inventory, ctx) => {
  const names = inventory.tokens.map((token) => token.semanticName);
  if (new Set(names).size !== names.length) {
    ctx.addIssue({
      code: "custom",
      path: ["tokens"],
      message: "semantic token names must be unique",
    });
  }
  const categories = new Set(inventory.tokens.map((token) => token.category));
  for (const category of TOKEN_INVENTORY_CATEGORIES) {
    if (!categories.has(category)) {
      ctx.addIssue({
        code: "custom",
        path: ["tokens"],
        message: `token inventory is missing required ${category} category`,
      });
    }
  }
});
export type TokenInventory = z.infer<typeof TokenInventorySchema>;

export const TailwindPlanSchema = z.object({
  sourceTokenInventoryVersion: z.number().int().positive(),
  themeMappings: z.array(
    z.object({
      cssVariable: z.string(),
      tailwindName: z.string(),
      rationale: z.string(),
    })
  ).min(1),
  runtimeOnlyVariables: z.array(
    z.object({
      cssVariable: z.string(),
      rationale: z.string(),
    })
  ).default([]),
  componentVariants: z.array(z.string()).default([]),
  responsiveRules: z.array(z.string()).default([]),
}).superRefine((plan, ctx) => {
  const cssVariables = plan.themeMappings.map((mapping) => mapping.cssVariable);
  const tailwindNames = plan.themeMappings.map((mapping) => mapping.tailwindName);
  const runtimeVariables = plan.runtimeOnlyVariables.map((mapping) => mapping.cssVariable);
  if (new Set(cssVariables).size !== cssVariables.length) {
    ctx.addIssue({ code: "custom", path: ["themeMappings"], message: "Tailwind CSS variable mappings must be unique" });
  }
  if (new Set(tailwindNames).size !== tailwindNames.length) {
    ctx.addIssue({ code: "custom", path: ["themeMappings"], message: "Tailwind theme names must be unique" });
  }
  if (new Set(runtimeVariables).size !== runtimeVariables.length) {
    ctx.addIssue({ code: "custom", path: ["runtimeOnlyVariables"], message: "Runtime-only CSS variables must be unique" });
  }
  if (runtimeVariables.some((variable) => cssVariables.includes(variable))) {
    ctx.addIssue({ code: "custom", path: ["runtimeOnlyVariables"], message: "A CSS variable cannot be both a Tailwind theme mapping and runtime-only" });
  }
});
export type TailwindPlan = z.infer<typeof TailwindPlanSchema>;

export const CssArchitectureSchema = z.object({
  sourceTailwindPlanVersion: z.number().int().positive(),
  cssVariableHierarchy: z.array(z.string()),
  tokenToComponentUsage: z.record(z.string(), z.array(z.string())),
  styleScopes: z.object({
    global: z.array(z.string()).default([]),
    page: z.array(z.string()).default([]),
    component: z.array(z.string()).default([]),
  }),
  generatedCssPath: z.string().optional(),
  justifiedExceptions: z.array(z.string()).default([]),
});
export type CssArchitecture = z.infer<typeof CssArchitectureSchema>;

export const VisualQaSchema = z.object({
  sourceCssArchitectureVersion: z.number().int().positive(),
  buildSha256: z.string().regex(/^[a-f0-9]{64}$/),
  checks: z.array(
    z.object({
      area: z.enum([
        "desktop",
        "tablet",
        "mobile",
        "hover",
        "focus",
        "color-scheme",
        "reduced-motion",
      ]),
      status: z.enum(["pending", "pass", "fail", "not-applicable"]),
      notes: z.string().optional(),
      evidencePath: z.string().optional(),
    })
  ).length(7),
}).superRefine((qa, ctx) => {
  const required = ["desktop", "tablet", "mobile", "hover", "focus", "color-scheme", "reduced-motion"] as const;
  const areas = qa.checks.map((check) => check.area);
  if (new Set(areas).size !== required.length || required.some((area) => !areas.includes(area))) {
    ctx.addIssue({ code: "custom", path: ["checks"], message: "visual QA must contain each required area exactly once" });
  }
  for (const [index, check] of qa.checks.entries()) {
    if (["desktop", "tablet", "mobile"].includes(check.area) && !check.evidencePath) {
      ctx.addIssue({ code: "custom", path: ["checks", index, "evidencePath"], message: "width checks require screenshot evidence" });
    }
  }
});
export type VisualQa = z.infer<typeof VisualQaSchema>;

export const EVIDENCE_WORKFLOW_STAGES = [
  "evidence",
  "contract",
  "tokens",
  "tailwind",
  "css",
  "build",
] as const;
export const EvidenceWorkflowStageSchema = z.enum(EVIDENCE_WORKFLOW_STAGES);
export type EvidenceWorkflowStage = z.infer<
  typeof EvidenceWorkflowStageSchema
>;

export const ArtifactApprovalStateSchema = z.enum([
  "draft",
  "in-review",
  "approved",
  "revision-requested",
  "superseded",
]);
export type ArtifactApprovalState = z.infer<
  typeof ArtifactApprovalStateSchema
>;

export const ArtifactApprovalTransitionSchema = z.object({
  state: ArtifactApprovalStateSchema,
  at: z.string(),
  actor: z.string().optional(),
  note: z.string().optional(),
});
export type ArtifactApprovalTransition = z.infer<
  typeof ArtifactApprovalTransitionSchema
>;

const ArtifactVersionBaseSchema = z.object({
  version: z.number().int().positive(),
  createdAt: z.string(),
  revisionOf: z.number().int().positive().optional(),
  approvalTransitions: z.array(ArtifactApprovalTransitionSchema).min(1),
});

const LedgerArtifactVersionSchema = ArtifactVersionBaseSchema.extend({
  artifactType: z.literal("ledger"),
  artifact: DesignResearchLedgerSchema,
});
const DesignContractArtifactVersionSchema = ArtifactVersionBaseSchema.extend({
  artifactType: z.literal("design-contract"),
  artifact: DesignContractMetadataSchema,
});
const TokenInventoryArtifactVersionSchema = ArtifactVersionBaseSchema.extend({
  artifactType: z.literal("token-inventory"),
  artifact: TokenInventorySchema,
});
const TailwindPlanArtifactVersionSchema = ArtifactVersionBaseSchema.extend({
  artifactType: z.literal("tailwind-plan"),
  artifact: TailwindPlanSchema,
});
const CssArchitectureArtifactVersionSchema = ArtifactVersionBaseSchema.extend({
  artifactType: z.literal("css-architecture"),
  artifact: CssArchitectureSchema,
});
const VisualQaArtifactVersionSchema = ArtifactVersionBaseSchema.extend({
  artifactType: z.literal("visual-qa"),
  artifact: VisualQaSchema,
});

export const WorkflowArtifactVersionSchema = z.discriminatedUnion(
  "artifactType",
  [
    LedgerArtifactVersionSchema,
    DesignContractArtifactVersionSchema,
    TokenInventoryArtifactVersionSchema,
    TailwindPlanArtifactVersionSchema,
    CssArchitectureArtifactVersionSchema,
    VisualQaArtifactVersionSchema,
  ]
);
export type WorkflowArtifactVersion = z.infer<
  typeof WorkflowArtifactVersionSchema
>;

export const WorkflowArtifactDraftSchema = z.discriminatedUnion(
  "artifactType",
  [
    z.object({ artifactType: z.literal("ledger"), artifact: DesignResearchLedgerSchema }),
    z.object({
      artifactType: z.literal("design-contract"),
      artifact: DesignContractMetadataSchema,
    }),
    z.object({
      artifactType: z.literal("token-inventory"),
      artifact: TokenInventorySchema,
    }),
    z.object({ artifactType: z.literal("tailwind-plan"), artifact: TailwindPlanSchema }),
    z.object({
      artifactType: z.literal("css-architecture"),
      artifact: CssArchitectureSchema,
    }),
    z.object({ artifactType: z.literal("visual-qa"), artifact: VisualQaSchema }),
  ]
);
export type WorkflowArtifactDraft = z.infer<typeof WorkflowArtifactDraftSchema>;
export type WorkflowArtifactType = WorkflowArtifactDraft["artifactType"];

export const EVIDENCE_STAGE_ARTIFACT = {
  evidence: "ledger",
  contract: "design-contract",
  tokens: "token-inventory",
  tailwind: "tailwind-plan",
  css: "css-architecture",
  build: "visual-qa",
} as const satisfies Record<EvidenceWorkflowStage, WorkflowArtifactType>;

export const ARTIFACT_APPROVAL_TRANSITIONS: Record<
  ArtifactApprovalState,
  readonly ArtifactApprovalState[]
> = {
  draft: ["in-review", "revision-requested"],
  "in-review": ["approved", "revision-requested"],
  approved: ["revision-requested"],
  "revision-requested": ["superseded"],
  superseded: [],
};

export function workflowArtifactApprovalState(
  artifact: WorkflowArtifactVersion
): ArtifactApprovalState {
  return artifact.approvalTransitions.at(-1)?.state ?? "draft";
}

export function workflowArtifactSource(
  artifact: WorkflowArtifactVersion
): { artifactType: WorkflowArtifactType; version: number } | undefined {
  switch (artifact.artifactType) {
    case "ledger":
      return undefined;
    case "design-contract":
      return {
        artifactType: "ledger",
        version: artifact.artifact.sourceLedgerVersion,
      };
    case "token-inventory":
      return {
        artifactType: "design-contract",
        version: artifact.artifact.sourceContractVersion,
      };
    case "tailwind-plan":
      return {
        artifactType: "token-inventory",
        version: artifact.artifact.sourceTokenInventoryVersion,
      };
    case "css-architecture":
      return {
        artifactType: "tailwind-plan",
        version: artifact.artifact.sourceTailwindPlanVersion,
      };
    case "visual-qa":
      return {
        artifactType: "css-architecture",
        version: artifact.artifact.sourceCssArchitectureVersion,
      };
  }
}

export const EvidenceWorkflowStateSchema = z
  .object({
    currentStage: EvidenceWorkflowStageSchema.default("evidence"),
    artifacts: z.array(WorkflowArtifactVersionSchema).default(() => []),
  })
  .superRefine((workflow, ctx) => {
    const byType = new Map<WorkflowArtifactType, WorkflowArtifactVersion[]>();
    for (const artifact of workflow.artifacts) {
      const versions = byType.get(artifact.artifactType) ?? [];
      versions.push(artifact);
      byType.set(artifact.artifactType, versions);

      const transitions = artifact.approvalTransitions;
      if (transitions[0]?.state !== "draft") {
        ctx.addIssue({
          code: "custom",
          path: ["artifacts"],
          message: `${artifact.artifactType} v${artifact.version} must begin in draft`,
        });
      }
      for (let index = 1; index < transitions.length; index += 1) {
        const previous = transitions[index - 1].state;
        const next = transitions[index].state;
        if (!ARTIFACT_APPROVAL_TRANSITIONS[previous].includes(next)) {
          ctx.addIssue({
            code: "custom",
            path: ["artifacts"],
            message: `invalid ${artifact.artifactType} v${artifact.version} transition: ${previous} -> ${next}`,
          });
        }
      }
    }

    for (const [artifactType, versions] of byType) {
      versions.sort((left, right) => left.version - right.version);
      const seen = new Set<number>();
      for (let index = 0; index < versions.length; index += 1) {
        const artifact = versions[index];
        if (seen.has(artifact.version) || artifact.version !== index + 1) {
          ctx.addIssue({
            code: "custom",
            path: ["artifacts"],
            message: `${artifactType} versions must be unique and linear from 1`,
          });
        }
        seen.add(artifact.version);

        const expectedRevision = index === 0 ? undefined : versions[index - 1].version;
        if (artifact.revisionOf !== expectedRevision) {
          ctx.addIssue({
            code: "custom",
            path: ["artifacts"],
            message:
              index === 0
                ? `${artifactType} v1 cannot revise another version`
                : `${artifactType} v${artifact.version} must revise v${expectedRevision}`,
          });
        }
      }

      const active = versions.filter(
        (artifact) => workflowArtifactApprovalState(artifact) !== "superseded"
      );
      if (
        active.length > 1 ||
        (active[0] && active[0].version !== versions.at(-1)?.version)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["artifacts"],
          message: `${artifactType} may have at most one nonsuperseded latest version`,
        });
      }
    }

    for (const artifact of workflow.artifacts) {
      const source = workflowArtifactSource(artifact);
      if (!source) continue;
      const approvedSource = (byType.get(source.artifactType) ?? [])
        .filter(
          (candidate) => workflowArtifactApprovalState(candidate) === "approved"
        )
        .sort((left, right) => right.version - left.version)[0];
      if (!approvedSource || approvedSource.version !== source.version) {
        ctx.addIssue({
          code: "custom",
          path: ["artifacts"],
          message: `${artifact.artifactType} v${artifact.version} must reference the latest approved ${source.artifactType}`,
        });
      }
    }

    const currentIndex = EVIDENCE_WORKFLOW_STAGES.indexOf(workflow.currentStage);
    for (let index = 0; index < currentIndex; index += 1) {
      const stage = EVIDENCE_WORKFLOW_STAGES[index];
      const artifactType = EVIDENCE_STAGE_ARTIFACT[stage];
      const latest = (byType.get(artifactType) ?? []).sort(
        (left, right) => right.version - left.version
      )[0];
      if (!latest || workflowArtifactApprovalState(latest) !== "approved") {
        ctx.addIssue({
          code: "custom",
          path: ["currentStage"],
          message: `${artifactType} must be approved before stage ${workflow.currentStage}`,
        });
      }
    }
  });
export type EvidenceWorkflowState = z.infer<typeof EvidenceWorkflowStateSchema>;

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
  /** Missing means the persisted run predates the approval-gated workflow.
   * createRun writes evidence-gated-v2 for every new run unless a migration or
   * compatibility test explicitly opts into the legacy controller. */
  pipelineVersion: z
    .enum(["legacy-v1", "evidence-gated-v2"])
    .default("legacy-v1"),
  stages: z.record(z.enum(STAGES), StageStatusSchema),
  costUsd: z.number().default(0), // OpenRouter + Firecrawl spend tally
  costCapUsd: z.number().default(3), // hard per-run cap; stop, never silently retry
  modelSlugs: z.record(z.string(), z.string()),
  /** Phase 4 A/B arm: refero (R, default) | local (L, catalog-index lock) |
   * none (N, control — identity invented from intake + vibe alone). */
  referenceMode: z.enum(["refero", "local", "none"]).default("refero"),
  /** Additive gated workflow for new runs. Legacy STAGES remain unchanged. */
  evidenceWorkflow: EvidenceWorkflowStateSchema.default(() => ({
    currentStage: "evidence" as const,
    artifacts: [],
  })),
}).superRefine((state, context) => {
  if (state.pipelineVersion !== "evidence-gated-v2") return;
  for (const [index, artifact] of state.evidenceWorkflow.artifacts.entries()) {
    if (artifact.artifactType !== "design-contract") continue;
    const parsed = V2DesignContractMetadataSchema.safeParse(artifact.artifact);
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        path: ["evidenceWorkflow", "artifacts", index, "artifact"],
        message: "evidence-gated-v2 design contracts require immutable contract and export SHA-256 hashes",
      });
    }
  }
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
  projectTarget: ProjectTargetSchema.default("website"),
  research: ResearchConfigurationSchema.default({
    enabled: true,
    businessIntelligence: true,
    referoDesignEvidence: true,
    allowPaidFirecrawlFallback: false,
  }),
  uploads: z.array(UploadMetadataSchema).default([]),
});
export type Intake = z.infer<typeof IntakeSchema>;

// ---------- Stage 2: competitive scan ----------

/** A competitor resolved against Google Maps Platform. Present only when the
 * Maps lane is configured (GOOGLE_MAPS_API_KEY); its absence is a normal
 * degraded state, never a scan failure — see tools/places.ts. */
export const PlaceSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  mapsUri: z.string(), // canonical Google Maps deep link for this place
  websiteUri: z.string().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

export const CompetitorSchema = z.object({
  name: z.string(),
  url: z.string(),
  source: z.string(), // where we found it (search result provenance)
  /** business = a real local operator. editorial = listicle/guide/media page.
   * ONLY "business" entries carry market-structure signal; an editorial page
   * teaches us blog structure, not competitor structure (see maps.ts). */
  kind: z.enum(["business", "editorial", "unknown"]).default("unknown"),
  /** Why the classifier landed where it did — auditable, not a black box. */
  kindReason: z.string().optional(),
  place: PlaceSchema.optional(),
  /** Key-free Google Maps search link — always present, works with no API key. */
  mapsSearchUrl: z.string().optional(),
  markdownPath: z.string().optional(), // crawl artifact
  screenshotPaths: z.array(z.string()).default([]), // 1440 + 390
  structure: z.array(z.string()).default([]), // observed section inventory
  notes: z.string().optional(),
  crawl: CrawlProvenanceSchema.optional(),
  crawlAttempts: z.array(CrawlProvenanceSchema).default([]),
});
export type Competitor = z.infer<typeof CompetitorSchema>;

export const ScanResultSchema = z.object({
  competitors: z.array(CompetitorSchema).max(4),
  commonSections: z.array(z.string()), // structure signal, NOT style input
  gaps: z.array(z.string()), // what nobody in the market does well
  /** Discovery results dropped before the crawl, kept so the scan is
   * auditable — a filter that silently eats real competitors is invisible
   * otherwise. */
  excluded: z
    .array(z.object({ url: z.string(), title: z.string(), why: z.string() }))
    .default([]),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

// ---------- Stage 3: Refero reference lock ----------

/** One candidate as Refero returned it — id, human name, and the two links
 * that make a lock auditable. Kept for EVERY candidate, not just the winner,
 * so a rejected reference can still be looked at. */
export const ReferenceCandidateSchema = z.object({
  referoId: z.string(),
  kind: z.enum(["style", "screen"]),
  name: z.string(),
  sourceUrl: z.string().optional(), // the real site the style was extracted from
  previewImageUrl: z.string().optional(),
  /** Bounded, validated image bytes persisted under this run. */
  screenshotPath: z.string().optional(),
  /** Which of the generated search angles surfaced this candidate. */
  foundVia: z.string().optional(),
});
export type ReferenceCandidate = z.infer<typeof ReferenceCandidateSchema>;

export const ReferenceProvenanceSchema = z.object({
  primary: ReferenceCandidateSchema.optional(),
  candidates: z.array(ReferenceCandidateSchema).default([]),
  /** Screens whose pixels were actually fetched and shown to the vision model
   * (refero_get_screen_image), as run-root-relative paths. Empty means the
   * lock was decided on prose alone. */
  imagesViewed: z.array(z.string()).default([]),
});
export type ReferenceProvenance = z.infer<typeof ReferenceProvenanceSchema>;

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
  /** Clickable provenance, filled DETERMINISTICALLY after generation — never
   * by the model, which would invent URLs. Refero's search results carry a
   * sourceUrl and previewImageUrl per candidate; without this the lock records
   * only an opaque UUID and "reference-locked to X" can't be verified. */
  provenance: ReferenceProvenanceSchema.optional(),
});
export type ReferenceLock = z.infer<typeof ReferenceLockSchema>;

/** The generation-time shape: the model authors judgement, never provenance
 * or the search angles it was handed. */
export const ReferenceLockDraftSchema = ReferenceLockSchema.omit({
  searchAngles: true,
  provenance: true,
});

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
  borders: z.record(z.string(), z.string()).default(() => ({})),
  shadows: z.record(z.string(), z.string()).default(() => ({})),
  layers: z.record(z.string(), z.string()).default(() => ({})),
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
  requestId: z.string().uuid().optional(),
});
export type EditRequest = z.infer<typeof EditRequestSchema>;

// ---------- Pipeline progress events (SSE to the chat UI) ----------

/** A thumbnail on a card. `path` is run-root-relative (the /api/sites route
 * serves research/* and the built site); `label` becomes the alt text, so it
 * must describe THIS image, not the card. `href` makes it click-to-open. */
export interface CardImage {
  path: string;
  label: string;
  href?: string;
}

/** An outbound or artifact link rendered as a real anchor on a card.
 * external → opens in a new tab. artifact → served by /api/sites/<runId>/… */
export interface CardLink {
  label: string;
  href: string;
  kind: "site" | "maps" | "artifact" | "reference";
  /** secondary line: address + rating, byte size, provenance note */
  sub?: string;
  external?: boolean;
}

/** Map payload for the competitive-scan card. `embedUrl` is present only when
 * the Maps lane is configured; `note` explains its absence so a missing map
 * reads as "not wired" rather than "broken". */
export interface CardMap {
  embedUrl?: string;
  /** Key-free Google Maps link — always usable. */
  fallbackUrl: string;
  pins: Array<{ name: string; lat: number; lng: number }>;
  note?: string;
}

export type PipelineEvent =
  | { type: "stage"; stage: Stage; status: "running" | "done" | "failed"; note?: string }
  | {
      type: "card";
      stage: Stage;
      title: string;
      body: string;
      images?: CardImage[];
      links?: CardLink[];
      map?: CardMap;
    }
  | { type: "cost"; usd: number }
  | { type: "complete"; runId: string; previewUrl: string }
  | {
      type: "paused";
      runId: string;
      workflowStage: EvidenceWorkflowStage;
      workspaceUrl: string;
      note: string;
    }
  | { type: "error"; message: string };

// ---------- Paths ----------

export const SITES_DIR = "sites"; // repo-root relative; each run = sites/<id>/
export const RUN_FILE = "run.json";
/** Append-only log of every PipelineEvent the run emitted. run.json checkpoints
 * stage STATUS; this preserves the narrative — cards, links, artifacts,
 * screenshots — so reopening a finished run shows what actually happened
 * instead of four bare "done" rows. */
export const EVENTS_FILE = "events.jsonl";
export const RESEARCH_DIR = "research";
export const SITE_DIR = "site"; // the built artifact lives here
export const UPLOADS_DIR = "uploads"; // server-claimed intake blobs + manifest
export const ARTIFACTS = {
  intake: "intake.json",
  scan: "scan.json",
  lock: "reference-lock.json",
  designMd: "DESIGN.md",
  evidenceLedger: "evidence/ledger.json",
  designContractMeta: "evidence/design-contract.json",
  designTailwindExport: "evidence/design-tailwind.css",
  tokenInventory: "evidence/token-inventory.json",
  tailwindPlan: "evidence/tailwind-plan.json",
  cssArchitecture: "evidence/css-architecture.json",
  visualQa: "evidence/visual-qa.json",
  tailwindTheme: "site/tailwind-theme.css",
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
