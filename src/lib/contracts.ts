/**
 * Shared contracts for the one-box pipeline.
 * Every stage reads/writes these shapes; sites/<id>/run.json is the durable
 * state machine. No stage may invent fields outside these types.
 */
import { z } from "zod";

// ---------- Project and evidence workflow ----------

export const ProjectTargetSchema = z.enum(["website", "web-app", "ios-app"]);
export type ProjectTarget = z.infer<typeof ProjectTargetSchema>;
export const ProductionProjectTargetSchema = z.literal("website");
export type ProductionProjectTarget = z.infer<
  typeof ProductionProjectTargetSchema
>;

export const ResearchConfigurationSchema = z.object({
  enabled: z.boolean().default(true),
  businessIntelligence: z.boolean().default(true),
  referoDesignEvidence: z.boolean().default(true),
  /** Firecrawl is the standing fallback tier (owner decision 2026-08-16): the
   * free local scraper still goes first, but a run no longer has to opt in for
   * the paid tier to catch what it misses. The flag stays so a run can still be
   * forced off from the intake UI, and so every metered path remains auditable. */
  allowPaidFirecrawlFallback: z.boolean().default(true),
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

const HumanVisualCriterionSchema = z.object({
  status: z.enum(["pass", "fail"]),
  findings: z.string().trim().max(2_000).optional(),
}).superRefine((criterion, context) => {
  if (criterion.status === "fail" && !criterion.findings) {
    context.addIssue({
      code: "custom",
      path: ["findings"],
      message: "failed human visual criteria require revision findings",
    });
  }
});

export const HumanVisualReviewCriteriaSchema = z.object({
  briefFidelity: HumanVisualCriterionSchema,
  visualHierarchy: HumanVisualCriterionSchema,
  spacingAndComposition: HumanVisualCriterionSchema,
  businessSpecificity: HumanVisualCriterionSchema,
  designAndReferenceAlignment: HumanVisualCriterionSchema.and(z.object({
    referenceContext: z.enum([
      "design-and-references",
      "explicit-no-reference",
    ]),
  })),
});
export type HumanVisualReviewCriteria = z.infer<
  typeof HumanVisualReviewCriteriaSchema
>;

/** A visual decision made by a named person. Automated/model audits remain
 * advisory inputs and must never be persisted in this human-only record. */
export const HumanVisualReviewSchema = z.object({
  reviewerName: z.string().trim().min(1).max(120),
  reviewerKind: z.literal("human"),
  humanAttestation: z.literal(true),
  reviewedAt: z.string(),
  buildSha256: z.string().regex(/^[a-f0-9]{64}$/),
  criteria: HumanVisualReviewCriteriaSchema,
});
export type HumanVisualReview = z.infer<typeof HumanVisualReviewSchema>;

export const ArtifactApprovalTransitionSchema = z.object({
  state: ArtifactApprovalStateSchema,
  at: z.string(),
  actor: z.string().optional(),
  note: z.string().optional(),
  humanVisualReview: HumanVisualReviewSchema.optional(),
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
  const latest = artifact.approvalTransitions.at(-1);
  if (artifact.artifactType === "visual-qa" && latest?.state === "approved") {
    const review = latest.humanVisualReview;
    const validHumanApproval =
      review?.reviewerKind === "human" &&
      review.humanAttestation === true &&
      review.buildSha256 === artifact.artifact.buildSha256 &&
      Object.values(review.criteria).every(
        (criterion) => criterion.status === "pass"
      );
    if (!validHumanApproval) return "revision-requested";
  }
  return latest?.state ?? "draft";
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
  gateRepairAttempts: z.number().default(0),
});

// ---------- Reference selection (picker pilot, plan rev 2) ----------

/** Preview images must come from Refero's own hosts over https — candidate
 * cards render these URLs directly, so the schema is the injection boundary. */
const REFERO_ASSET_HOSTS = new Set([
  "refero.design",
  "www.refero.design",
  "images.refero.design",
]);

function isReferoAssetUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && REFERO_ASSET_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const CandidatePaletteEntrySchema = z.object({
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), // extracted, never model-invented
  plainLabel: z.string().min(1).max(60), // "the button color", never a token name
});

export const CandidateProfileSchema = z.object({
  referoId: z.string().min(1).max(80),
  kind: z.literal("style"), // screens are a borrow pool, never picker options
  name: z.string().min(1).max(120),
  sourceUrl: z.string().refine(isHttpsUrl, "https URLs only").optional(),
  previewImageUrl: z
    .string()
    .refine(isReferoAssetUrl, "must be a https refero.design asset URL")
    .optional(),
  /** Run-relative, confined to the research dir — served via /api/sites. */
  screenshotPath: z
    .string()
    .regex(/^research\/refero\/[a-zA-Z0-9._-]+$/)
    .optional(),
  foundVia: z.string().min(1).max(200),
  palette: z.array(CandidatePaletteEntrySchema).min(2).max(6),
  plainLanguageProfile: z.object({
    headline: z.string().min(1).max(80),
    feelSummary: z.string().min(1).max(320),
    bestFor: z.array(z.string().min(1).max(80)).max(4),
    headsUp: z.array(z.string().min(1).max(160)).max(3).default(() => []),
  }),
  composition: z.object({
    northStar: z.string().min(1).max(200),
    preserveTraits: z.array(z.string().min(1).max(160)).min(2).max(5),
    rhythmNote: z.string().min(1).max(240),
  }),
  recommended: z.boolean().default(false),
  recommendedWhy: z.string().max(200).optional(),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

export const ReferenceSelectionVersionSchema = z
  .object({
    version: z.number().int().min(1).max(3),
    createdAt: z.string(),
    searchAngles: z.array(z.string().min(1).max(200)).min(3).max(5),
    candidates: z.array(CandidateProfileSchema).min(2).max(3),
    revisionNote: z.string().max(2_000).optional(),
    excludedFromPrior: z.array(z.string()).default(() => []),
  })
  .superRefine((version, context) => {
    const ids = version.candidates.map((candidate) => candidate.referoId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["candidates"],
        message: "candidate referoIds must be unique within a version",
      });
    }
    const recommended = version.candidates.filter((c) => c.recommended);
    if (recommended.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["candidates"],
        message: "exactly one candidate must carry the advisory recommendation",
      });
    }
  });

export const ReferenceSelectionStateSchema = z
  .object({
    status: z.enum(["pending", "selected"]),
    /** Server-side reroll reservation counter — counts reservations SPENT,
     * incremented and persisted BEFORE candidate generation so a duplicate
     * submit sees the spent reservation and a crash never refunds it. A spent
     * reservation whose generation failed leaves versions one short, so
     * versions.length is rerollsUsed or rerollsUsed + 1, never more. */
    rerollsUsed: z.number().int().min(0).max(2).default(0),
    recommendedBy: z.literal("advisory-model").default("advisory-model"),
    versions: z.array(ReferenceSelectionVersionSchema).min(1).max(3),
    selection: z
      .object({
        selectedId: z.string().min(1),
        selectionKind: z.enum(["user-picked-recommended", "user-picked-other"]),
        version: z.number().int().min(1).max(3),
        at: z.string(),
        note: z.string().max(2_000).optional(),
      })
      .optional(),
  })
  .superRefine((state, context) => {
    if (state.versions.length > state.rerollsUsed + 1) {
      context.addIssue({
        code: "custom",
        path: ["versions"],
        message:
          "versions.length may not exceed rerollsUsed + 1 (every extra version needs a spent reservation; spent-but-failed reservations may leave versions short by any amount)",
      });
    }
    const seen = new Set<string>();
    for (const [index, version] of state.versions.entries()) {
      if (version.version !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["versions", index, "version"],
          message: "versions must be linear starting at 1",
        });
      }
      for (const candidate of version.candidates) {
        if (seen.has(candidate.referoId)) {
          context.addIssue({
            code: "custom",
            path: ["versions", index, "candidates"],
            message: `reroll repeats an earlier candidate: ${candidate.referoId}`,
          });
        }
      }
      for (const candidate of version.candidates) seen.add(candidate.referoId);
    }
    if (state.status === "selected" && !state.selection) {
      context.addIssue({
        code: "custom",
        path: ["selection"],
        message: "selected status requires a selection record",
      });
    }
    if (state.status === "pending" && state.selection) {
      context.addIssue({
        code: "custom",
        path: ["selection"],
        message: "pending status cannot carry a selection record",
      });
    }
    if (state.selection) {
      const version = state.versions.find(
        (v) => v.version === state.selection?.version
      );
      const candidate = version?.candidates.find(
        (c) => c.referoId === state.selection?.selectedId
      );
      if (!candidate) {
        context.addIssue({
          code: "custom",
          path: ["selection", "selectedId"],
          message: "selection must name a candidate in the referenced version",
        });
      } else {
        const expectedKind = candidate.recommended
          ? "user-picked-recommended"
          : "user-picked-other";
        if (state.selection.selectionKind !== expectedKind) {
          context.addIssue({
            code: "custom",
            path: ["selection", "selectionKind"],
            message: `selectionKind must be ${expectedKind} for this candidate`,
          });
        }
      }
    }
  });
export type ReferenceSelectionState = z.infer<
  typeof ReferenceSelectionStateSchema
>;

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
  /** Picker pilot flag, persisted at creation so a mid-run env change can
   * never alter resume semantics (plan rev 2 §A). Default false = today's
   * behavior for every pre-existing run. */
  referencePickerEnabled: z.boolean().default(false),
  /** Sibling picker state — deliberately NOT an evidence-workflow stage, so
   * every persisted run parses unchanged (Sol audit blocker 1). */
  referenceSelection: ReferenceSelectionStateSchema.optional(),
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
    allowPaidFirecrawlFallback: true,
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

/** One organic Yelp search result. Sponsored placements are dropped upstream
 * in tools/yelp.ts — an advertiser's rating is not a market fact. */
export const YelpListingSchema = z.object({
  rank: z.number(), // position in Yelp's organic ordering
  name: z.string(),
  rating: z.number().optional(),
  reviewCount: z.number().optional(),
  categories: z.array(z.string()).default([]),
  priceRange: z.string().optional(), // "$".."$$$$"
  yelpUrl: z.string().optional(),
});
export type YelpListing = z.infer<typeof YelpListingSchema>;

/** The derived market bar. Kept in its own object, NOT spread across the
 * market, so a consumer can be handed the aggregates without also being handed
 * the named roster. */
export const YelpMarketSummarySchema = z.object({
  rosterSize: z.number(),
  ratingMedian: z.number().optional(),
  reviewCountMedian: z.number().optional(),
});
export type YelpMarketSummary = z.infer<typeof YelpMarketSummarySchema>;

/** Yelp market intelligence for the scan. Report-only: Yelp stays on
 * DIRECTORY_DOMAINS, so it is never a competitor site, a crawl target, or a
 * design input. `unavailable` explains an empty roster so a Yelp miss reads as
 * "not reachable" rather than "no competitors". */
export const YelpMarketSchema = z.object({
  searchUrl: z.string(),
  fetchedAt: z.string(),
  listings: z.array(YelpListingSchema).max(10).default([]),
  summary: YelpMarketSummarySchema,
  unavailable: z.string().optional(),
});
export type YelpMarket = z.infer<typeof YelpMarketSchema>;

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
  /** Optional so scans saved before the Yelp lane existed still parse. */
  yelp: YelpMarketSchema.optional(),
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

const ReferenceStyleDigestDraftShape = z.object({
  northStar: z.string().max(200),
  preserveTraits: z.array(z.string()).min(3).max(5),
  sectionRhythm: z.string().max(500),
  surfaces: z
    .array(
      z.object({
        level: z.number().int().min(0).max(3),
        purpose: z.string().max(160),
      })
    )
    .min(1)
    .max(4),
  componentRecipes: z.array(z.string()).min(1).max(8),
  imageryTreatment: z.string().max(400),
  motionPersonality: z.string().max(200),
  dosDonts: z
    .array(
      z.object({
        polarity: z.enum(["do", "dont"]),
        rule: z.string().max(200),
      })
    )
    .min(4)
    .max(14),
});

function requireDigestDont(
  digest: z.infer<typeof ReferenceStyleDigestDraftShape>,
  context: z.RefinementCtx
) {
  if (digest.dosDonts.some((rule) => rule.polarity === "dont")) return;
  context.addIssue({
    code: "custom",
    path: ["dosDonts"],
    message: "style digest must include at least one don't rule",
  });
}

export const ReferenceStyleDigestDraftSchema = ReferenceStyleDigestDraftShape.superRefine(
  requireDigestDont
);

export const ReferenceStyleDigestSchema = ReferenceStyleDigestDraftShape.extend({
  sourceStyleId: z.string().min(1),
  designContractVersion: z.number().int().min(1),
}).superRefine(requireDigestDont);
export type ReferenceStyleDigest = z.infer<typeof ReferenceStyleDigestSchema>;

export const FORBIDDEN_CONTEXTS = [
  "section-background",
  "body-text",
  "heading-text",
  "border",
  "button-background",
  "large-surface",
] as const;

export const DesignTokensSchema = z.object({
  colors: z.array(
    z.object({
      name: z.string(),
      value: z.string(), // hex or gradient
      cssVar: z.string(), // --color-*
      role: z.string(), // where it lives
      forbidden: z.string().optional(), // where it must NEVER appear
      forbiddenContexts: z.array(z.enum(FORBIDDEN_CONTEXTS)).default([]),
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

export const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{4,40}$/;
export const RunIdSchema = z.string().regex(RUN_ID_PATTERN);

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

function isSafeCandidateRelativePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

export const CandidateRelativePathSchema = z
  .string()
  .refine(isSafeCandidateRelativePath, "unsafe candidate relative path");

export const MAX_CANDIDATE_BYTES = 100 * 1024 * 1024;

export const CandidateFileRecordSchema = z
  .object({
    path: CandidateRelativePathSchema,
    sizeBytes: z.number().int().nonnegative().safe().max(MAX_CANDIDATE_BYTES),
    sha256: Sha256Schema,
  })
  .strict();
export type CandidateFileRecord = z.infer<typeof CandidateFileRecordSchema>;

export const CandidateManifestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    entry: z.literal("index.html"),
    files: z.array(CandidateFileRecordSchema).min(1),
    totalBytes: z
      .number()
      .int()
      .nonnegative()
      .safe()
      .max(MAX_CANDIDATE_BYTES),
    buildSha256: Sha256Schema,
  })
  .strict()
  .superRefine((manifest, context) => {
    let previousPath: string | undefined;
    let totalBytes = 0;
    for (const [index, file] of manifest.files.entries()) {
      if (previousPath !== undefined && file.path <= previousPath) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "candidate files must be sorted and unique by path",
        });
      }
      previousPath = file.path;
      totalBytes += file.sizeBytes;
    }
    if (!manifest.files.some((file) => file.path === manifest.entry)) {
      context.addIssue({
        code: "custom",
        path: ["entry"],
        message: "candidate manifest must inventory index.html",
      });
    }
    if (totalBytes !== manifest.totalBytes) {
      context.addIssue({
        code: "custom",
        path: ["totalBytes"],
        message: "candidate totalBytes must equal the file inventory total",
      });
    }
    if (totalBytes > MAX_CANDIDATE_BYTES) {
      context.addIssue({
        code: "custom",
        path: ["totalBytes"],
        message: "candidate inventory exceeds 100 MiB",
      });
    }
  });
export type CandidateManifestV1 = z.infer<typeof CandidateManifestV1Schema>;

export const CANDIDATE_STATES = [
  "preparing",
  "ready-for-gates",
  "failed",
  "promotable",
  "promoted",
  "abandoned",
] as const;
export const CandidateStateSchema = z.enum(CANDIDATE_STATES);
export type CandidateState = z.infer<typeof CandidateStateSchema>;

export const CANDIDATE_STATE_TRANSITIONS = Object.freeze({
  preparing: Object.freeze(["ready-for-gates", "failed", "abandoned"] as const),
  "ready-for-gates": Object.freeze(["promotable", "failed", "abandoned"] as const),
  failed: Object.freeze(["preparing", "abandoned"] as const),
  promotable: Object.freeze(["promoted", "failed", "abandoned"] as const),
  promoted: Object.freeze([] as const),
  abandoned: Object.freeze([] as const),
}) satisfies Readonly<Record<CandidateState, readonly CandidateState[]>>;

export const CandidateLifecycleEventSchema = z
  .object({
    state: CandidateStateSchema,
    at: z.string().datetime({ offset: true }),
  })
  .strict();
export type CandidateLifecycleEvent = z.infer<
  typeof CandidateLifecycleEventSchema
>;

export const CandidateInputArtifactHashSchema = z
  .object({
    path: CandidateRelativePathSchema,
    sha256: Sha256Schema,
  })
  .strict();

export const CandidateProvenanceV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    candidateId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    runId: RunIdSchema,
    createdAt: z.string().datetime({ offset: true }),
    state: CandidateStateSchema,
    history: z.array(CandidateLifecycleEventSchema).min(1),
    inputArtifactHashes: z.array(CandidateInputArtifactHashSchema).min(1),
    layoutAuthority: z.enum(["page-ir-v1", "template-v1"]),
    compilerVersion: z.string().min(1).max(200),
    pageIrSha256: Sha256Schema.optional(),
    candidateManifestSha256: Sha256Schema.optional(),
    buildSha256: Sha256Schema.optional(),
    gateReportSha256: Sha256Schema.optional(),
    promotedBuildSha256: Sha256Schema.optional(),
  })
  .strict()
  .superRefine((provenance, context) => {
    const first = provenance.history[0];
    if (!first) return;
    if (first.state !== "preparing") {
      context.addIssue({
        code: "custom",
        path: ["history", 0, "state"],
        message: "candidate history must begin in preparing",
      });
    }
    if (first.at !== provenance.createdAt) {
      context.addIssue({
        code: "custom",
        path: ["createdAt"],
        message: "candidate createdAt must equal its preparing transition",
      });
    }
    for (let index = 1; index < provenance.history.length; index += 1) {
      const previous = provenance.history[index - 1];
      const current = provenance.history[index];
      if (Date.parse(current.at) < Date.parse(previous.at)) {
        context.addIssue({
          code: "custom",
          path: ["history", index, "at"],
          message: "candidate transition timestamps must be monotonic",
        });
      }
      const allowed = CANDIDATE_STATE_TRANSITIONS[
        previous.state
      ] as readonly CandidateState[];
      if (!allowed.includes(current.state)) {
        context.addIssue({
          code: "custom",
          path: ["history", index, "state"],
          message: `illegal candidate transition ${previous.state} -> ${current.state}`,
        });
      }
    }
    const last = provenance.history[provenance.history.length - 1];
    if (last.state !== provenance.state) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "candidate state must match the last history transition",
      });
    }

    let previousInputPath: string | undefined;
    for (const [index, input] of provenance.inputArtifactHashes.entries()) {
      if (previousInputPath !== undefined && input.path <= previousInputPath) {
        context.addIssue({
          code: "custom",
          path: ["inputArtifactHashes", index, "path"],
          message: "input artifact hashes must be sorted and unique by path",
        });
      }
      previousInputPath = input.path;
    }

    if (provenance.layoutAuthority === "page-ir-v1" && !provenance.pageIrSha256) {
      context.addIssue({
        code: "custom",
        path: ["pageIrSha256"],
        message: "page-ir-v1 authority requires a Page IR SHA-256",
      });
    }
    const manifestBound = Boolean(provenance.candidateManifestSha256);
    const buildBound = Boolean(provenance.buildSha256);
    if (manifestBound !== buildBound) {
      context.addIssue({
        code: "custom",
        path: [manifestBound ? "buildSha256" : "candidateManifestSha256"],
        message: "candidate manifest and build SHA-256 bindings must appear together",
      });
    }
    if (provenance.gateReportSha256 && (!manifestBound || !buildBound)) {
      context.addIssue({
        code: "custom",
        path: ["gateReportSha256"],
        message: "a gate report binding requires manifest and build bindings",
      });
    }
    if (
      ["ready-for-gates", "promotable", "promoted"].includes(
        provenance.state,
      ) &&
      (!manifestBound || !buildBound)
    ) {
      context.addIssue({
        code: "custom",
        path: ["candidateManifestSha256"],
        message: `${provenance.state} requires manifest and build bindings`,
      });
    }
    if (
      ["promotable", "promoted"].includes(provenance.state) &&
      !provenance.gateReportSha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["gateReportSha256"],
        message: `${provenance.state} requires a candidate gate report binding`,
      });
    }
    if (provenance.state === "promoted" && !provenance.promotedBuildSha256) {
      context.addIssue({
        code: "custom",
        path: ["promotedBuildSha256"],
        message: "promoted requires a promoted build binding",
      });
    }
    if (
      provenance.promotedBuildSha256 &&
      provenance.promotedBuildSha256 !== provenance.buildSha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["promotedBuildSha256"],
        message: "promoted build SHA-256 must match the candidate build SHA-256",
      });
    }
  });
export type CandidateProvenanceV1 = z.infer<
  typeof CandidateProvenanceV1Schema
>;

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

const EditorEvidenceSchema = z.object({
  screenId: z.string().min(1).max(160),
  /** Run-relative Refero thumbnail path, never an arbitrary URL. */
  thumbnailPath: z.string().regex(/^research\/refero\/assistant\/[a-zA-Z0-9._-]+$/),
  siteName: z.string().min(1).max(160),
  takeaway: z.string().min(1).max(200),
});

const EditorSuggestionSchema = z.object({
  id: z.string().min(1).max(120),
  /** Live data-edit-id, validated against the generated site at turn time. */
  editId: z.string().min(1).max(160),
  instruction: z.string().min(1).max(400),
  summary: z.string().min(1).max(160),
});

const EditorOwnerMessageSchema = z.object({
  id: z.string().min(1).max(120),
  role: z.literal("owner"),
  text: z.string().min(1).max(2_000),
  at: z.string().datetime(),
});

const EditorAssistantMessageSchema = z.object({
  id: z.string().min(1).max(120),
  role: z.literal("assistant"),
  reply: z.string().min(1).max(4_000),
  at: z.string().datetime(),
  evidence: z.array(EditorEvidenceSchema).max(4).default([]),
  suggestions: z.array(EditorSuggestionSchema).max(3).default([]),
});

/** Persisted, advice-only assistant conversation. The writer prunes before
 * saving, so the bound remains a durable storage limit rather than a failure. */
export const EditorThreadSchema = z.object({
  messages: z
    .array(z.discriminatedUnion("role", [EditorOwnerMessageSchema, EditorAssistantMessageSchema]))
    .max(60),
  updatedAt: z.string().datetime(),
});
export type EditorThread = z.infer<typeof EditorThreadSchema>;
export type EditorThreadMessage = EditorThread["messages"][number];

export const EditRequestSchema = z.object({
  runId: z.string(),
  editId: z.string(), // data-edit-id — the ONLY selector the editor accepts
  instruction: z.string(),
  imageIntent: z.boolean().default(false), // route to Higgsfield swap
  requestId: z.string().uuid().optional(),
  confirmRedirect: z.boolean().optional(),
  // Same id-format contract as GenerateImageRequestSchema's sourceAssetId
  // (src/lib/imageLibrary.ts) — an id, never a URL, and only ever trusted
  // after api/edit/route.ts checks it against the run's OWN image library.
  referenceAssetId: z.string().min(8).max(80).optional(),
});
export type EditRequest = z.infer<typeof EditRequestSchema>;

export const EditClassificationSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("apply") }),
  z.object({
    decision: z.literal("redirect"),
    reason: z.string().min(1).max(400),
    suggestedAlternative: z.string().min(1).max(400),
  }),
  z.object({
    decision: z.literal("refuse"),
    reason: z.string().min(1).max(400),
    suggestedAlternative: z.string().max(400).optional(),
  }),
]);
export type EditClassification = z.infer<typeof EditClassificationSchema>;

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

/** One ranked Yelp roster row, presentation-shaped from YelpListing.
 * `verified` means this operator was independently corroborated by the
 * Google Places-resolved competitor scan — two sources agreeing, not a
 * platform badge. */
export interface ScanRosterItem {
  rank: number;
  name: string;
  rating?: number;
  reviewCount?: number;
  url?: string;
  verified: boolean;
}

/** The scan card's KPI-strip source. `directoriesFiltered` is the web
 * discovery exclusion count known at Yelp-card emit time — the same number
 * the later "Filtered out" card reports, surfaced here so the roster's KPI
 * strip does not need to wait on it. */
export interface ScanMarketSummary {
  rosterSize: number;
  ratingMedian?: number;
  reviewCountMedian?: number;
  directoriesFiltered: number;
}

export type PipelineEvent =
  | {
      type: "stage";
      stage: Stage;
      status: "running" | "done" | "failed";
      note?: string;
      /** ISO timestamp; optional so historical events.jsonl lines still parse.
       * Lets the timeline's collapsed stage row show a mono elapsed duration. */
      at?: string;
    }
  | {
      type: "card";
      stage: Stage;
      title: string;
      body: string;
      images?: CardImage[];
      links?: CardLink[];
      map?: CardMap;
      /** Additive, Yelp-roster-only presentation fields — see ScanRosterItem. */
      roster?: ScanRosterItem[];
      market?: ScanMarketSummary;
      /** Additive, build-gate-repair-card-only presentation field. */
      gates?: GateReport[];
    }
  | { type: "cost"; usd: number }
  | { type: "complete"; runId: string; previewUrl: string }
  | {
      type: "paused";
      runId: string;
      workflowStage: EvidenceWorkflowStage;
      workspaceUrl: string;
      note: string;
      /** ISO timestamp; optional so historical events.jsonl lines still parse. */
      at?: string;
    }
  | {
      /** Picker pause. Distinct from "paused": workflowStage is a closed
       * 6-value union and its UI copy derives from EVIDENCE_STAGE_ARTIFACT —
       * reusing it would render "evidence ready for review" for a pick. */
      type: "reference-paused";
      runId: string;
      workspaceUrl: string;
      note: string;
      at?: string;
    }
  | { type: "error"; message: string };

/** Transport-only note: a stage the controller skipped because it was
 * already checkpointed (pipeline.ts's `stage()` helper). The durable event
 * log never records these — pipeline.ts's broadcast filters them out before
 * appending — but the live SSE stream still replays one per already-done
 * stage on every reconnect, so the timeline UI needs to recognize and
 * collapse them too. Lives here, not in pipeline.ts, so a client component
 * (RunTimeline) can import the predicate without pulling in pipeline.ts's
 * server-only `node:fs`/`node:path` graph. */
export const RESUMED_NOTE = "resumed from checkpoint";

export function isResumeNoise(event: PipelineEvent): boolean {
  return event.type === "stage" && event.note === RESUMED_NOTE;
}

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
export const CANDIDATE_DIR = "candidate"; // unserved, one fixed candidate per run
export const UPLOADS_DIR = "uploads"; // server-claimed intake blobs + manifest
export const ARTIFACTS = {
  intake: "intake.json",
  scan: "scan.json",
  lock: "reference-lock.json",
  designMd: "DESIGN.md",
  referenceStyleDigest: "reference-style-digest.json",
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
  editorThread: "editor-thread.json",
} as const;

// ---------- Model slugs (verified live 2026-08-12; re-verify in Phase 0 smoke) ----------

export const MODELS = {
  orchestrator: "google/gemini-3.1-pro-preview", // reasoning + vision
  builder: "moonshotai/kimi-k3", // frontend/webdev strength
  bulk: "deepseek/deepseek-v4-flash", // classification/extraction
} as const;
