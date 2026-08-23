import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as contracts from "./contracts";
import {
  EVIDENCE_WORKFLOW_STAGES,
  MAX_PAGE_IR_ARTIFACT_BYTES,
  WorkflowArtifactDraftSchema,
  type WorkflowArtifactDraft,
} from "./contracts";
import { buildTailwindPlan, buildTokenInventory } from "./evidence";
import {
  candidateManifestSha256,
  inspectCandidate,
  validateCandidateInventory,
} from "./candidate";
import { pageIrSha256 } from "./pageIrHash";
import {
  advanceEvidenceWorkflow,
  createRun,
  saveArtifact,
  saveEvidenceArtifactVersion,
  sitePaths,
  transitionEvidenceArtifactApproval,
} from "./runstate";
import {
  COMPILER_WEBP_BYTES,
  compilerPageIr,
} from "./test-fixtures/pageIrCompilerFixtures";
import {
  deriveAndPersistInitialPageIr,
  loadApprovedPageIrSourceBundle,
  loadPersistedPageIr,
  materializePageIrCandidate,
  proposePageIrSourceBundle,
  transitionPageIrSourceBundleReview,
} from "./pageIrPipeline";
import * as pageIrPipeline from "./pageIrPipeline";

const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
const testRunIds: string[] = [];

function canonicalizeProof(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeProof);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalizeProof(child)]),
    );
  }
  return value;
}

function bindingSetProofSha256(
  runId: string,
  sources: Array<{ kind: string; version: number; sha256: string }>,
) {
  return createHash("sha256")
    .update(
      JSON.stringify(canonicalizeProof({ schemaVersion: 1, runId, sources })),
    )
    .digest("hex");
}

function workflowDrafts(): WorkflowArtifactDraft[] {
  const designTokens = {
    colors: [
      {
        name: "Primary",
        value: "#123456",
        cssVar: "--color-primary",
        role: "actions",
        forbiddenContexts: [],
      },
    ],
    fonts: [
      {
        family: "Inter",
        cssVar: "--font-body",
        weights: [400],
        role: "body",
        substitutes: [],
      },
    ],
    typeScale: [
      { role: "body", sizePx: 16, lineHeight: 1.5, cssVar: "--type-body" },
    ],
    radii: { card: "4px" },
    spacing: { layout: "8px" },
    borders: { subtle: "1px solid #ddd" },
    shadows: { raised: "0 2px 8px #0002" },
    layers: { base: "0" },
    layout: { maxWidthPx: 1_000, sectionGapPx: 64, cardPaddingPx: 20 },
    motion: {
      easing: "linear",
      durationMs: { micro: 100, reveal: 300 },
      revealClasses: [],
    },
    componentStates: [{ component: "button", states: { default: "solid" } }],
    imageryBrief: {
      subject: "work",
      lighting: "natural",
      grade: "neutral",
      framing: "wide",
      avoid: [],
    },
  };
  const tokenArtifact = buildTokenInventory(designTokens, 1, ["claim-brand"]);
  const tailwindArtifact = buildTailwindPlan(tokenArtifact, 1);
  return [
    WorkflowArtifactDraftSchema.parse({
      artifactType: "ledger",
      artifact: {
        projectTarget: "website",
        businessIntelligence: {
          kind: "business-intelligence",
          claims: [
            {
              id: "claim-business",
              statement: "Local service",
              classification: "observed",
              confidence: 1,
            },
          ],
        },
        referoDesignEvidence: {
          kind: "refero-design-evidence",
          claims: [
            {
              id: "claim-brand",
              statement: "Strong hero",
              classification: "observed",
              confidence: 1,
            },
          ],
          references: [
            {
              referoId: "raw/style:alpha",
              name: "Style alpha",
              sourceUrl: "https://refero.design/style",
              learningRationale: "Strong hierarchy",
              reusablePatterns: ["Strong hero & proof"],
            },
          ],
        },
        clientEvidence: { claims: [] },
      },
    }),
    WorkflowArtifactDraftSchema.parse({
      artifactType: "design-contract",
      artifact: {
        title: "Acme design contract",
        contractPath: "evidence/DESIGN.md",
        sourceLedgerVersion: 1,
        contractSha256: HASH,
        exportSha256: OTHER_HASH,
        approvedEvidenceIds: ["claim-brand"],
        designTokens,
      },
    }),
    WorkflowArtifactDraftSchema.parse({
      artifactType: "token-inventory",
      artifact: tokenArtifact,
    }),
    WorkflowArtifactDraftSchema.parse({
      artifactType: "tailwind-plan",
      artifact: tailwindArtifact,
    }),
    WorkflowArtifactDraftSchema.parse({
      artifactType: "css-architecture",
      artifact: {
        sourceTailwindPlanVersion: 1,
        cssVariableHierarchy: [],
        tokenToComponentUsage: {},
        styleScopes: {},
      },
    }),
  ];
}

async function createApprovedPageIrRun(
  authority: "page-ir-v1" | "template-v1" = "page-ir-v1",
) {
  const runId = await createRun({
    layoutAuthority: authority,
    pageIrRolloutPermitted: authority === "page-ir-v1",
  });
  testRunIds.push(runId);
  const drafts = workflowDrafts();
  for (const [index, draft] of drafts.entries()) {
    const artifact = await saveEvidenceArtifactVersion(runId, draft);
    await transitionEvidenceArtifactApproval(
      runId,
      artifact.artifactType,
      artifact.version,
      "in-review",
    );
    await transitionEvidenceArtifactApproval(
      runId,
      artifact.artifactType,
      artifact.version,
      "approved",
    );
    const next = EVIDENCE_WORKFLOW_STAGES[index + 1];
    if (next) await advanceEvidenceWorkflow(runId, next);
  }
  return runId;
}

function sourceProposal(runId: string) {
  const pageIr = compilerPageIr();
  const layoutDecision = {
    schemaVersion: 1 as const,
    purpose: "brochure-local-service" as const,
    sourceVersions: {
      evidence: 1,
      designContract: 1,
      tokenInventory: 1,
      tailwindPlan: 1,
      cssArchitecture: 1,
    },
    referenceContract: pageIr.referenceContract,
    referenceTrace: {
      mode: "selected" as const,
      sources: [
        {
          alias: "style_alpha",
          sourceKind: "refero-style" as const,
          rawReferoId: "raw/style:alpha",
          traits: ["Strong hero & proof"],
        },
      ],
    },
    layoutProgram: pageIr.layoutProgram,
    slotBindings: pageIr.slotBindings,
    nodeTokenBindings: pageIr.nodeTokenBindings.map((binding) => ({
      ...binding,
      tokens: { ...binding.tokens, motion: "motion-ease" },
    })),
    accessibility: pageIr.accessibility,
  };
  return {
    schemaVersion: 1 as const,
    runId,
    bundleVersion: 1,
    sources: [
      {
        kind: "layout-decision" as const,
        version: 1,
        bytes: Buffer.from(JSON.stringify(layoutDecision)),
      },
      {
        kind: "content" as const,
        version: 2,
        bytes: Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            sourceLayoutDecisionVersion: 1,
            content: pageIr.content,
            actions: pageIr.actions,
          }),
        ),
      },
      {
        kind: "assets" as const,
        version: 3,
        bytes: Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            sourceLayoutDecisionVersion: 1,
            assets: pageIr.assets,
          }),
        ),
      },
    ],
  };
}

function assetlessGeneratedSources(runId: string) {
  const proposal = sourceProposal(runId);
  const layoutDecision = JSON.parse(
    proposal.sources[0].bytes.toString("utf8"),
  );
  const mediaNodeIds = new Set(
    layoutDecision.layoutProgram.nodes
      .filter(
        (node: { kind: string; slotType?: string }) =>
          node.kind === "slot" && node.slotType === "media",
      )
      .map((node: { id: string }) => node.id),
  );
  layoutDecision.layoutProgram.nodes = layoutDecision.layoutProgram.nodes
    .filter((node: { id: string }) => !mediaNodeIds.has(node.id))
    .map((node: { childIds?: string[] }) =>
      node.childIds
        ? {
            ...node,
            childIds: node.childIds.filter((id) => !mediaNodeIds.has(id)),
          }
        : node,
    );
  layoutDecision.slotBindings = layoutDecision.slotBindings.filter(
    (binding: { nodeId: string; kind: string }) =>
      !mediaNodeIds.has(binding.nodeId) && binding.kind !== "media",
  );
  layoutDecision.nodeTokenBindings = layoutDecision.nodeTokenBindings.filter(
    (binding: { nodeId: string }) => !mediaNodeIds.has(binding.nodeId),
  );
  return {
    schemaVersion: 1 as const,
    layoutDecision,
    content: JSON.parse(proposal.sources[1].bytes.toString("utf8")),
    assets: {
      schemaVersion: 1 as const,
      sourceLayoutDecisionVersion: 1,
      assets: [],
    },
  };
}

async function savePageIrGenerationContext(runId: string) {
  await saveArtifact(runId, "intake.json", {
    businessName: "Acme",
    category: "local service",
    location: "Los Angeles, CA",
    services: ["Installation"],
    certifications: [],
    claims: ["Locally operated"],
    primaryAction: "quote",
    vibeWords: ["confident"],
    projectTarget: "website",
    research: {
      enabled: true,
      businessIntelligence: true,
      referoDesignEvidence: true,
      allowPaidFirecrawlFallback: false,
    },
    uploads: [],
  });
  await saveArtifact(runId, "reference-lock.json", {
    searchAngles: ["local service", "confident", "clear proof"],
    primary: {
      referoId: "raw/style:alpha",
      kind: "style",
      name: "Style alpha",
      why: "Strong hierarchy",
    },
    borrowedDetails: [],
    rejected: [],
    decisionLedger: [
      { decision: "Use a direct hero", source: "raw/style:alpha" },
    ],
  });
}

async function approveSourceBundle(runId: string) {
  const proposed = await proposePageIrSourceBundle(sourceProposal(runId));
  await transitionPageIrSourceBundleReview(runId, proposed.payloadSha256, "in-review", {
    actorKind: "human",
    actorName: "Devin",
  });
  return transitionPageIrSourceBundleReview(runId, proposed.payloadSha256, "approved", {
    actorKind: "human",
    actorName: "Devin",
    humanAttestation: true,
    criteria: {
      layoutDecision: "pass",
      content: "pass",
      assets: "pass",
      upstreamBindings: "pass",
      sourceChain: "pass",
    },
  });
}

async function preparePersistedPageIr(runId: string) {
  await approveSourceBundle(runId);
  return deriveAndPersistInitialPageIr(runId);
}

async function candidateRequest(runId: string, bytes = COMPILER_WEBP_BYTES) {
  const relativePath = "uploads/hero.webp";
  const absolutePath = path.join(sitePaths(runId).root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, bytes);
  return {
    schemaVersion: 1 as const,
    runId,
    assets: [
      {
        assetId: "hero-image",
        artifactPath: relativePath,
        mediaType: "image/webp" as const,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    ],
  };
}

async function parkCandidateInState(
  runId: string,
  state: "failed" | "promotable" | "promoted",
) {
  const candidateRoot = path.join(sitePaths(runId).root, "candidate");
  const provenancePath = path.join(candidateRoot, "provenance.json");
  const provenance = JSON.parse(await fs.readFile(provenancePath, "utf8"));
  const nextAt = () =>
    new Date(Date.parse(provenance.history.at(-1).at) + 1).toISOString();
  if (state === "failed") {
    provenance.state = "failed";
    provenance.history.push({ state: "failed", at: nextAt() });
  } else {
    const gates = Buffer.from("{}\n");
    await fs.writeFile(path.join(candidateRoot, "gates.json"), gates);
    provenance.gateReportSha256 = createHash("sha256")
      .update(gates)
      .digest("hex");
    provenance.state = "promotable";
    provenance.history.push({ state: "promotable", at: nextAt() });
    if (state === "promoted") {
      provenance.state = "promoted";
      provenance.promotedBuildSha256 = provenance.buildSha256;
      provenance.history.push({ state: "promoted", at: nextAt() });
    }
  }
  provenance.compilerVersion = "stale-page-ir-compiler@1";
  await fs.writeFile(provenancePath, JSON.stringify(provenance, null, 2));
  return {
    provenance: await fs.readFile(provenancePath),
    manifest: await fs.readFile(path.join(candidateRoot, "manifest.json")),
    index: await fs.readFile(path.join(candidateRoot, "site", "index.html")),
  };
}

afterEach(async () => {
  await Promise.all(
    testRunIds
      .splice(0)
      .map((runId) =>
        fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
      ),
  );
});

function sourceBundle() {
  return {
    schemaVersion: 1 as const,
    runId: "run-source",
    bundleVersion: 1,
    payloadSha256: HASH,
    upstreamBindings: [
      { kind: "evidence", version: 1, sha256: HASH },
      { kind: "design-contract", version: 2, sha256: HASH },
      { kind: "token-inventory", version: 3, sha256: HASH },
      { kind: "tailwind-plan", version: 4, sha256: HASH },
      { kind: "css-architecture", version: 5, sha256: HASH },
    ],
    sourceArtifacts: [
      {
        kind: "layout-decision",
        version: 6,
        sha256: HASH,
        sourceVersions: {
          evidence: 1,
          designContract: 2,
          tokenInventory: 3,
          tailwindPlan: 4,
          cssArchitecture: 5,
        },
      },
      {
        kind: "content",
        version: 7,
        sha256: HASH,
        sourceLayoutDecisionVersion: 6,
      },
      {
        kind: "assets",
        version: 8,
        sha256: HASH,
        sourceLayoutDecisionVersion: 6,
      },
    ],
    reviewTransitions: [
      {
        state: "draft" as const,
        at: "2026-08-23T12:00:00.000Z",
        actorKind: "system" as const,
        actorName: "page-ir-source-bundle",
      },
      {
        state: "in-review" as const,
        at: "2026-08-23T12:01:00.000Z",
        actorKind: "human" as const,
        actorName: "Test Reviewer",
      },
      {
        state: "approved" as const,
        at: "2026-08-23T12:02:00.000Z",
        actorKind: "human" as const,
        actorName: "Test Reviewer",
        humanReview: {
          reviewerName: "Test Reviewer",
          reviewerKind: "human" as const,
          humanAttestation: true as const,
          reviewedAt: "2026-08-23T12:02:00.000Z",
          payloadSha256: HASH,
          criteria: {
            layoutDecision: "pass" as const,
            content: "pass" as const,
            assets: "pass" as const,
            upstreamBindings: "pass" as const,
            sourceChain: "pass" as const,
          },
        },
      },
    ],
  };
}

function sourceBundleSchema() {
  const schema = (
    contracts as unknown as {
      PageIrSourceBundleV1Schema?: {
        parse(value: unknown): unknown;
        safeParse(value: unknown): { success: boolean };
      };
    }
  ).PageIrSourceBundleV1Schema;
  expect(schema, "PageIrSourceBundleV1Schema must be exported").toBeDefined();
  return schema!;
}

function persistedPageIrSchema() {
  const schema = (
    contracts as unknown as {
      PersistedPageIrV1Schema?: {
        parse(value: unknown): unknown;
        safeParse(value: unknown): { success: boolean };
      };
    }
  ).PersistedPageIrV1Schema;
  expect(schema, "PersistedPageIrV1Schema must be exported").toBeDefined();
  return schema!;
}

describe("PageIrSourceBundleV1Schema", () => {
  it("accepts only the fixed upstream and source order with an exact source chain", () => {
    const schema = sourceBundleSchema();
    expect(() => schema.parse(sourceBundle())).not.toThrow();

    const reordered = structuredClone(sourceBundle());
    reordered.sourceArtifacts.reverse();
    expect(schema.safeParse(reordered).success).toBe(false);

    const reorderedUpstream = structuredClone(sourceBundle());
    reorderedUpstream.upstreamBindings.reverse();
    expect(schema.safeParse(reorderedUpstream).success).toBe(false);

    const missingUpstream = structuredClone(sourceBundle());
    missingUpstream.upstreamBindings.pop();
    expect(schema.safeParse(missingUpstream).success).toBe(false);

    const duplicateUpstream = structuredClone(sourceBundle());
    duplicateUpstream.upstreamBindings[1] = {
      ...duplicateUpstream.upstreamBindings[0],
    };
    expect(schema.safeParse(duplicateUpstream).success).toBe(false);

    const staleChain = structuredClone(sourceBundle());
    staleChain.sourceArtifacts[1].sourceLayoutDecisionVersion = 5;
    expect(schema.safeParse(staleChain).success).toBe(false);

    const mismatchedSourceVersions = structuredClone(sourceBundle());
    mismatchedSourceVersions.sourceArtifacts[0].sourceVersions!.evidence = 2;
    expect(schema.safeParse(mismatchedSourceVersions).success).toBe(false);

    const unknown = { ...sourceBundle(), latestAlias: "v1" };
    expect(schema.safeParse(unknown).success).toBe(false);
  });

  it("requires a named attested human with every explicit criterion passing", () => {
    const schema = sourceBundleSchema();

    const modelApproval = structuredClone(sourceBundle());
    const modelTransition = modelApproval.reviewTransitions[2];
    modelTransition.actorKind = "model" as "human";
    expect(schema.safeParse(modelApproval).success).toBe(false);

    const failedCriterion = structuredClone(sourceBundle());
    failedCriterion.reviewTransitions[2].humanReview!.criteria.content =
      "fail" as "pass";
    expect(schema.safeParse(failedCriterion).success).toBe(false);

    const mismatchedPayload = structuredClone(sourceBundle());
    mismatchedPayload.reviewTransitions[2].humanReview!.payloadSha256 =
      OTHER_HASH;
    expect(schema.safeParse(mismatchedPayload).success).toBe(false);
  });
});

describe("PersistedPageIrV1Schema", () => {
  it("is closed and requires a positive revision with fixed-order lineage proof", () => {
    const schema = persistedPageIrSchema();
    const pageIr = compilerPageIr();
    const envelope = {
      schemaVersion: 1,
      runId: "run-page-ir",
      revision: 1,
      pageIr,
      pageIrSha256: HASH,
      bindingSetSha256: OTHER_HASH,
      lineage: {
        schemaVersion: 1,
        runId: "run-page-ir",
        purpose: "brochure-local-service",
        sources: [
          "evidence",
          "design-contract",
          "token-inventory",
          "tailwind-plan",
          "css-architecture",
          "layout-decision",
          "content",
          "assets",
        ].map((kind, index) => ({ kind, version: index + 1, sha256: HASH })),
        referenceTrace: {
          mode: "selected",
          sources: [
            {
              alias: "style_alpha",
              sourceKind: "refero-style",
              rawReferoId: "raw/style:alpha",
              traits: ["Strong hero & proof"],
            },
          ],
        },
      },
    };
    expect(() => schema.parse(envelope)).not.toThrow();
    expect(schema.safeParse({ ...envelope, revision: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...envelope, latest: true }).success).toBe(false);
    const reordered = structuredClone(envelope);
    reordered.lineage.sources.reverse();
    expect(schema.safeParse(reordered).success).toBe(false);
  });
});

describe("Page IR source bundle persistence", () => {
  it("generates and proposes one durable assetless source checkpoint across reconnects", async () => {
    const runId = await createApprovedPageIrRun();
    await savePageIrGenerationContext(runId);
    const controller = await import("./pageIrController").catch(() => ({}));
    const ensure = (
      controller as {
        ensurePageIrSourceBundle?: (
          runId: string,
          dependencies: {
            generateJson: (...args: unknown[]) => Promise<unknown>;
            proposePageIrSourceBundle: typeof proposePageIrSourceBundle;
          },
        ) => Promise<unknown>;
      }
    ).ensurePageIrSourceBundle;
    const generated = assetlessGeneratedSources(runId);
    const prompts: string[] = [];
    let generationCalls = 0;
    let proposalCalls = 0;
    const dependencies = {
      generateJson: async (...args: unknown[]) => {
        generationCalls += 1;
        prompts.push(String(args[3]));
        return generated;
      },
      proposePageIrSourceBundle: async (
        proposal: Parameters<typeof proposePageIrSourceBundle>[0],
      ) => {
        proposalCalls += 1;
        await expect(
          fs.stat(
            path.join(
              sitePaths(runId).root,
              "page-ir-source-generation.json",
            ),
          ),
        ).resolves.toBeDefined();
        return proposePageIrSourceBundle(proposal);
      },
    };

    const results = ensure
      ? await Promise.all([
          ensure(runId, dependencies),
          ensure(runId, dependencies),
        ])
      : undefined;

    expect(results).toHaveLength(2);
    expect(generationCalls).toBe(1);
    expect(proposalCalls).toBe(1);
    expect(results?.[1]).toEqual(results?.[0]);
    expect(results?.[0]).toMatchObject({
      reviewState: "draft",
      sources: { assets: { assets: [] } },
    });
    expect(prompts[0]).toMatch(/untrusted data/i);
    expect(prompts[0]).toMatch(/executable source/i);
    expect(prompts[0]).toMatch(/stable ids/i);
    expect(prompts[0]).toMatch(/assetless/i);

    const checkpoint = JSON.parse(
      await fs.readFile(
        path.join(sitePaths(runId).root, "page-ir-source-generation.json"),
        "utf8",
      ),
    );
    expect(checkpoint).toMatchObject({
      schemaVersion: 1,
      runId,
      model: contracts.MODELS.orchestrator,
      sources: generated,
    });
    expect(checkpoint.inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(checkpoint.sourceSha256).toMatch(/^[a-f0-9]{64}$/);

    await transitionPageIrSourceBundleReview(
      runId,
      (results?.[0] as { bundle: { payloadSha256: string } }).bundle
        .payloadSha256,
      "in-review",
      { actorKind: "human", actorName: "Devin" },
    );
    await expect(ensure?.(runId, dependencies)).resolves.toMatchObject({
      reviewState: "in-review",
    });
    expect(generationCalls).toBe(1);
    expect(proposalCalls).toBe(1);
  });

  it("persists the exact three immutable source files only after CSS approval", async () => {
    const runId = await createApprovedPageIrRun();
    await proposePageIrSourceBundle(sourceProposal(runId));
    const sourceRoot = path.join(
      sitePaths(runId).root,
      "page-ir-sources",
      "v1",
    );
    expect((await fs.readdir(sourceRoot)).sort()).toEqual([
      "assets.json",
      "bundle.json",
      "content.json",
      "layout-decision.json",
    ]);
    expect(
      await fs.readFile(path.join(sourceRoot, "layout-decision.json")),
    ).toEqual(sourceProposal(runId).sources[0].bytes);

    const changed = sourceProposal(runId);
    changed.sources[1].bytes = Buffer.from(
      changed.sources[1].bytes
        .toString("utf8")
        .replace("Start & talk", "Changed"),
    );
    await expect(proposePageIrSourceBundle(changed)).rejects.toThrow(
      /immutable|conflict/i,
    );
    expect(await fs.readFile(path.join(sourceRoot, "content.json"))).toEqual(
      sourceProposal(runId).sources[1].bytes,
    );
  });

  it("keeps approval append-only and rejects model or partial review authority", async () => {
    const runId = await createApprovedPageIrRun();
    const proposal = sourceProposal(runId);
    const proposed = await proposePageIrSourceBundle(proposal);

    await expect(
      transitionPageIrSourceBundleReview(runId, proposed.payloadSha256, "in-review", {
        actorKind: "model",
        actorName: "review-model",
      }),
    ).rejects.toThrow(/human/i);
    await transitionPageIrSourceBundleReview(runId, proposed.payloadSha256, "in-review", {
      actorKind: "human",
      actorName: "Devin",
    });
    await expect(
      transitionPageIrSourceBundleReview(runId, proposed.payloadSha256, "approved", {
        actorKind: "human",
        actorName: "Devin",
        humanAttestation: true,
        criteria: {
          layoutDecision: "pass",
          content: "fail",
          assets: "pass",
          upstreamBindings: "pass",
          sourceChain: "pass",
        },
      }),
    ).rejects.toThrow(/all-pass|criteria/i);
    const approved = await transitionPageIrSourceBundleReview(
      runId,
      proposed.payloadSha256,
      "approved",
      {
        actorKind: "human",
        actorName: "Devin",
        humanAttestation: true,
        criteria: {
          layoutDecision: "pass",
          content: "pass",
          assets: "pass",
          upstreamBindings: "pass",
          sourceChain: "pass",
        },
      },
    );
    expect(approved.reviewTransitions).toHaveLength(3);

    const reloaded = await loadApprovedPageIrSourceBundle(runId);
    expect(reloaded.bundle).toEqual(approved);
    expect(reloaded.bundle.payloadSha256).toBe(proposed.payloadSha256);
    expect(reloaded.bundle.upstreamBindings).toEqual(proposed.upstreamBindings);
    expect(
      reloaded.bundle.reviewTransitions.map((entry) => entry.state),
    ).toEqual(["draft", "in-review", "approved"]);
    expect(reloaded.bundle.reviewTransitions.at(-1)?.humanReview).toMatchObject(
      {
        reviewerName: "Devin",
        reviewerKind: "human",
        humanAttestation: true,
        payloadSha256: proposed.payloadSha256,
        criteria: {
          layoutDecision: "pass",
          content: "pass",
          assets: "pass",
          upstreamBindings: "pass",
          sourceChain: "pass",
        },
      },
    );
    for (const source of proposal.sources) {
      expect(reloaded.sourceBytes[source.kind]).toEqual(source.bytes);
    }
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(
            sitePaths(runId).root,
            "page-ir-sources",
            "v1",
            "bundle.json",
          ),
          "utf8",
        ),
      ),
    ).toEqual(approved);

    await expect(
      transitionPageIrSourceBundleReview(runId, proposed.payloadSha256, "rejected", {
        actorKind: "human",
        actorName: "Devin",
      }),
    ).rejects.toThrow(/transition/i);
  });

  it("rejects a human review bound to a stale payload without appending it", async () => {
    const runId = await createApprovedPageIrRun();
    const proposed = await proposePageIrSourceBundle(sourceProposal(runId));

    await expect(
      transitionPageIrSourceBundleReview(runId, OTHER_HASH, "in-review", {
        actorKind: "human",
        actorName: "Devin",
      }),
    ).rejects.toThrow(/payload/i);

    const persisted = JSON.parse(
      await fs.readFile(
        path.join(
          sitePaths(runId).root,
          "page-ir-sources",
          "v1",
          "bundle.json",
        ),
        "utf8",
      ),
    );
    expect(persisted.payloadSha256).toBe(proposed.payloadSha256);
    expect(persisted.reviewTransitions.map((entry: { state: string }) => entry.state))
      .toEqual(["draft"]);
  });

  it("loads a validated read-only projection for draft and in-review bundles", async () => {
    const runId = await createApprovedPageIrRun();
    const proposal = sourceProposal(runId);
    const proposed = await proposePageIrSourceBundle(proposal);
    const loadForReview = (
      pageIrPipeline as unknown as {
        loadPageIrSourceBundleForReview?: (runId: string) => Promise<unknown>;
      }
    ).loadPageIrSourceBundleForReview;

    const draft = loadForReview ? await loadForReview(runId) : undefined;
    expect(draft).toEqual({
      bundle: proposed,
      reviewState: "draft",
      sources: {
        layoutDecision: JSON.parse(proposal.sources[0].bytes.toString("utf8")),
        content: JSON.parse(proposal.sources[1].bytes.toString("utf8")),
        assets: JSON.parse(proposal.sources[2].bytes.toString("utf8")),
      },
    });

    const inReview = await transitionPageIrSourceBundleReview(
      runId,
      proposed.payloadSha256,
      "in-review",
      { actorKind: "human", actorName: "Devin" },
    );
    await expect(loadForReview?.(runId)).resolves.toMatchObject({
      bundle: JSON.parse(JSON.stringify(inReview)),
      reviewState: "in-review",
    });
  });

  it("fails closed before CSS approval and for unsafe source-root entries", async () => {
    const earlyRun = await createRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    testRunIds.push(earlyRun);
    await expect(
      proposePageIrSourceBundle(sourceProposal(earlyRun)),
    ).rejects.toThrow(/CSS approval|build boundary/i);

    const runId = await createApprovedPageIrRun();
    await approveSourceBundle(runId);
    const sourceRoot = path.join(
      sitePaths(runId).root,
      "page-ir-sources",
      "v1",
    );
    await fs.writeFile(path.join(sourceRoot, "latest.json"), "{}");
    await expect(loadApprovedPageIrSourceBundle(runId)).rejects.toThrow(
      /unknown|missing file/i,
    );
    await fs.rm(path.join(sourceRoot, "latest.json"));

    const hardlink = path.join(
      path.dirname(sourceRoot),
      "content-hardlink.json",
    );
    await fs.link(path.join(sourceRoot, "content.json"), hardlink);
    await expect(loadApprovedPageIrSourceBundle(runId)).rejects.toThrow(
      /hardlink|non-linked/i,
    );
    await fs.rm(hardlink);

    const contentPath = path.join(sourceRoot, "content.json");
    const contentBytes = await fs.readFile(contentPath);
    const symlinkTarget = path.join(
      path.dirname(sourceRoot),
      "content-target.json",
    );
    await fs.writeFile(symlinkTarget, contentBytes);
    await fs.rm(contentPath);
    await fs.symlink(symlinkTarget, contentPath);
    await expect(loadApprovedPageIrSourceBundle(runId)).rejects.toThrow(
      /symlink|regular|non-linked/i,
    );
  });

  it("rejects an oversized source before creating the source root", async () => {
    const runId = await createApprovedPageIrRun();
    const oversized = sourceProposal(runId);
    oversized.sources[0].bytes = Buffer.alloc(MAX_PAGE_IR_ARTIFACT_BYTES + 1);

    await expect(proposePageIrSourceBundle(oversized)).rejects.toThrow(
      /source artifact bytes exceed the supported maximum/i,
    );
    await expect(
      fs.stat(path.join(sitePaths(runId).root, "page-ir-sources")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it(
    "rejects draft, rejected, superseded, cross-run, and hash-mismatched bundles",
    { timeout: 15_000 },
    async () => {
      const draftRun = await createApprovedPageIrRun();
      await proposePageIrSourceBundle(sourceProposal(draftRun));
      await expect(deriveAndPersistInitialPageIr(draftRun)).rejects.toThrow(
        /draft|not approved/i,
      );

      const rejectedRun = await createApprovedPageIrRun();
      const rejected = await proposePageIrSourceBundle(sourceProposal(rejectedRun));
      await transitionPageIrSourceBundleReview(rejectedRun, rejected.payloadSha256, "rejected", {
        actorKind: "human",
        actorName: "Devin",
      });
      await expect(deriveAndPersistInitialPageIr(rejectedRun)).rejects.toThrow(
        /rejected|not approved/i,
      );

      const supersededRun = await createApprovedPageIrRun();
      const superseded = await approveSourceBundle(supersededRun);
      await transitionPageIrSourceBundleReview(supersededRun, superseded.payloadSha256, "superseded", {
        actorKind: "human",
        actorName: "Devin",
      });
      await expect(
        deriveAndPersistInitialPageIr(supersededRun),
      ).rejects.toThrow(/superseded|not approved/i);

      const crossRun = await createApprovedPageIrRun();
      await approveSourceBundle(crossRun);
      const bundlePath = path.join(
        sitePaths(crossRun).root,
        "page-ir-sources",
        "v1",
        "bundle.json",
      );
      const bundle = JSON.parse(await fs.readFile(bundlePath, "utf8"));
      bundle.runId = "other-run";
      await fs.writeFile(bundlePath, JSON.stringify(bundle));
      await expect(deriveAndPersistInitialPageIr(crossRun)).rejects.toThrow(
        /current run|run/i,
      );

      const mismatchedRun = await createApprovedPageIrRun();
      await approveSourceBundle(mismatchedRun);
      await fs.appendFile(
        path.join(
          sitePaths(mismatchedRun).root,
          "page-ir-sources",
          "v1",
          "assets.json",
        ),
        " ",
      );
      await expect(
        deriveAndPersistInitialPageIr(mismatchedRun),
      ).rejects.toThrow(/SHA-256|mismatch/i);
    },
  );
});

describe("initial persisted Page IR", () => {
  it("derives from exactly eight approved bindings and concurrent creators converge", async () => {
    const runId = await createApprovedPageIrRun();
    await approveSourceBundle(runId);

    const [first, second] = await Promise.all([
      deriveAndPersistInitialPageIr(runId),
      deriveAndPersistInitialPageIr(runId),
    ]);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ runId, revision: 1 });
    expect(first.lineage.sources.map((source) => source.kind)).toEqual([
      "evidence",
      "design-contract",
      "token-inventory",
      "tailwind-plan",
      "css-architecture",
      "layout-decision",
      "content",
      "assets",
    ]);
    expect(first.pageIrSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.bindingSetSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.pageIrSha256).toBe(pageIrSha256(first.pageIr));
    expect(first.bindingSetSha256).toBe(
      bindingSetProofSha256(first.runId, first.lineage.sources),
    );
    await expect(loadPersistedPageIr(runId)).resolves.toEqual(first);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(sitePaths(runId).root, "page-ir.json"),
          "utf8",
        ),
      ),
    ).toEqual(first);
  });

  it("detects persisted tamper and conflicting source changes without overwriting bytes", async () => {
    const runId = await createApprovedPageIrRun();
    await approveSourceBundle(runId);
    await deriveAndPersistInitialPageIr(runId);
    const pageIrPath = path.join(sitePaths(runId).root, "page-ir.json");
    const original = await fs.readFile(pageIrPath);

    const tampered = JSON.parse(original.toString("utf8"));
    tampered.pageIr.content[0].text = "tampered";
    await fs.writeFile(pageIrPath, JSON.stringify(tampered));
    await expect(loadPersistedPageIr(runId)).rejects.toThrow(
      /Page IR SHA-256|tamper|mismatch/i,
    );
    await fs.writeFile(pageIrPath, original);

    const hashBitTamper = JSON.parse(original.toString("utf8"));
    hashBitTamper.pageIrSha256 = `${
      hashBitTamper.pageIrSha256[0] === "0" ? "1" : "0"
    }${hashBitTamper.pageIrSha256.slice(1)}`;
    await fs.writeFile(pageIrPath, JSON.stringify(hashBitTamper));
    await expect(loadPersistedPageIr(runId)).rejects.toThrow(
      /Page IR SHA-256 mismatch/i,
    );
    await fs.writeFile(pageIrPath, original);

    const sourcePath = path.join(
      sitePaths(runId).root,
      "page-ir-sources",
      "v1",
      "content.json",
    );
    const source = await fs.readFile(sourcePath);
    await fs.writeFile(sourcePath, Buffer.concat([source, Buffer.from(" ")]));
    await expect(deriveAndPersistInitialPageIr(runId)).rejects.toThrow(
      /SHA-256|conflict|stale/i,
    );
    expect(await fs.readFile(pageIrPath)).toEqual(original);
  });

  it("reuses an identical checkpoint without rewriting and rejects a self-consistent binding conflict", async () => {
    const runId = await createApprovedPageIrRun();
    await approveSourceBundle(runId);
    const persisted = await deriveAndPersistInitialPageIr(runId);
    const pageIrPath = path.join(sitePaths(runId).root, "page-ir.json");
    const original = await fs.readFile(pageIrPath);
    const originalStat = await fs.stat(pageIrPath, { bigint: true });

    await expect(deriveAndPersistInitialPageIr(runId)).resolves.toEqual(
      persisted,
    );
    expect(await fs.readFile(pageIrPath)).toEqual(original);
    expect((await fs.stat(pageIrPath, { bigint: true })).mtimeNs).toBe(
      originalStat.mtimeNs,
    );

    const conflicting = structuredClone(persisted);
    conflicting.lineage.sources[0].sha256 = OTHER_HASH;
    conflicting.bindingSetSha256 = bindingSetProofSha256(
      runId,
      conflicting.lineage.sources,
    );
    const conflictBytes = Buffer.from(
      `${JSON.stringify(conflicting, null, 2)}\n`,
    );
    await fs.writeFile(pageIrPath, conflictBytes);

    await expect(deriveAndPersistInitialPageIr(runId)).rejects.toThrow(
      /conflicts with the current derivation bindings|cannot be overwritten/i,
    );
    expect(await fs.readFile(pageIrPath)).toEqual(conflictBytes);
  });

  it("retries safely around the Page IR atomic rename boundary", async () => {
    const beforeRun = await createApprovedPageIrRun();
    await approveSourceBundle(beforeRun);
    await expect(
      deriveAndPersistInitialPageIr(beforeRun, {
        beforePageIrRename: () => {
          throw new Error("before rename crash");
        },
      }),
    ).rejects.toThrow(/before rename crash/);
    await expect(
      fs.stat(path.join(sitePaths(beforeRun).root, "page-ir.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      deriveAndPersistInitialPageIr(beforeRun),
    ).resolves.toMatchObject({ runId: beforeRun });

    const afterRun = await createApprovedPageIrRun();
    await approveSourceBundle(afterRun);
    await expect(
      deriveAndPersistInitialPageIr(afterRun, {
        afterPageIrRename: () => {
          throw new Error("after rename crash");
        },
      }),
    ).rejects.toThrow(/after rename crash/);
    const committed = await fs.readFile(
      path.join(sitePaths(afterRun).root, "page-ir.json"),
    );
    await expect(deriveAndPersistInitialPageIr(afterRun)).resolves.toEqual(
      JSON.parse(committed.toString("utf8")),
    );
  });
});

describe("Page IR candidate materialization", () => {
  it("installs one unserved hash-bound candidate and reuses it under concurrency", async () => {
    const runId = await createApprovedPageIrRun();
    const persisted = await preparePersistedPageIr(runId);
    const request = await candidateRequest(runId);

    const liveRoot = path.join(sitePaths(runId).root, "site");
    await fs.mkdir(liveRoot, { recursive: true });
    await fs.writeFile(path.join(liveRoot, "index.html"), "last-known-good");
    const liveBefore = await fs.readFile(path.join(liveRoot, "index.html"));
    const [first, second] = await Promise.all([
      materializePageIrCandidate(request),
      materializePageIrCandidate(request),
    ]);
    expect(new Set([first.status, second.status])).toEqual(
      new Set(["created", "reused"]),
    );
    expect(first.manifest).toEqual(second.manifest);
    expect(first.provenance).toEqual(second.provenance);
    expect(first.manifest.buildSha256).toBe(second.manifest.buildSha256);
    expect(first.provenance.candidateManifestSha256).toBe(
      second.provenance.candidateManifestSha256,
    );
    expect(
      (await fs.readdir(sitePaths(runId).root)).filter((entry) =>
        /^candidate(?:\.|$)/.test(entry),
      ),
    ).toEqual(["candidate"]);
    const result = first.status === "created" ? first : second;
    expect(result.provenance).toMatchObject({
      layoutAuthority: "page-ir-v1",
      compilerVersion: "page-ir-static@2",
      pageIrSha256: persisted.pageIrSha256,
      buildSha256: result.manifest.buildSha256,
    });
    expect(
      result.provenance.inputArtifactHashes.map((input) => input.path),
    ).toEqual(["page-ir.json", "uploads/hero.webp"]);
    expect(result.provenance.candidateManifestSha256).toMatch(/^[a-f0-9]{64}$/);
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(sitePaths(runId).root, "candidate", "manifest.json"),
        "utf8",
      ),
    );
    expect(candidateManifestSha256(manifest)).toBe(
      result.provenance.candidateManifestSha256,
    );
    expect(await fs.readFile(path.join(liveRoot, "index.html"))).toEqual(
      liveBefore,
    );
    expect(
      await fs.readFile(
        path.join(sitePaths(runId).root, "candidate", "site", "index.html"),
        "utf8",
      ),
    ).toContain("<!doctype html>");
  });

  it("parks a matching failed candidate without repair or live/PageIR/source mutation", async () => {
    const runId = await createApprovedPageIrRun();
    await preparePersistedPageIr(runId);
    const request = await candidateRequest(runId);
    const runRoot = sitePaths(runId).root;
    const liveRoot = path.join(runRoot, "site");
    await fs.mkdir(liveRoot, { recursive: true });
    await fs.writeFile(path.join(liveRoot, "index.html"), "last-known-good");
    await materializePageIrCandidate(request);

    const provenancePath = path.join(runRoot, "candidate", "provenance.json");
    const provenance = JSON.parse(await fs.readFile(provenancePath, "utf8"));
    const at = new Date(
      Date.parse(provenance.history.at(-1).at) + 1,
    ).toISOString();
    provenance.state = "failed";
    provenance.history.push({ state: "failed", at });
    await fs.writeFile(provenancePath, JSON.stringify(provenance, null, 2));
    const manifestPath = path.join(runRoot, "candidate", "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const candidateFiles = Object.fromEntries(
      await Promise.all(
        manifest.files.map(async (file: { path: string }) => [
          file.path,
          await fs.readFile(
            path.join(runRoot, "candidate", "site", ...file.path.split("/")),
          ),
        ]),
      ),
    );
    const before = {
      provenance: await fs.readFile(provenancePath),
      manifest: await fs.readFile(manifestPath),
      candidateFiles,
      live: await fs.readFile(path.join(liveRoot, "index.html")),
      pageIr: await fs.readFile(path.join(runRoot, "page-ir.json")),
      bundle: await fs.readFile(
        path.join(runRoot, "page-ir-sources", "v1", "bundle.json"),
      ),
      layoutDecision: await fs.readFile(
        path.join(runRoot, "page-ir-sources", "v1", "layout-decision.json"),
      ),
      content: await fs.readFile(
        path.join(runRoot, "page-ir-sources", "v1", "content.json"),
      ),
      assets: await fs.readFile(
        path.join(runRoot, "page-ir-sources", "v1", "assets.json"),
      ),
    };

    await expect(materializePageIrCandidate(request)).resolves.toMatchObject({
      status: "parked-failed",
    });
    expect(await fs.readFile(provenancePath)).toEqual(before.provenance);
    expect(await fs.readFile(manifestPath)).toEqual(before.manifest);
    for (const [relativePath, bytes] of Object.entries(before.candidateFiles)) {
      expect(
        await fs.readFile(
          path.join(runRoot, "candidate", "site", ...relativePath.split("/")),
        ),
      ).toEqual(bytes);
    }
    expect(await fs.readFile(path.join(liveRoot, "index.html"))).toEqual(
      before.live,
    );
    expect(await fs.readFile(path.join(runRoot, "page-ir.json"))).toEqual(
      before.pageIr,
    );
    expect(
      await fs.readFile(
        path.join(runRoot, "page-ir-sources", "v1", "bundle.json"),
      ),
    ).toEqual(before.bundle);
    expect(
      await fs.readFile(
        path.join(runRoot, "page-ir-sources", "v1", "layout-decision.json"),
      ),
    ).toEqual(before.layoutDecision);
    expect(
      await fs.readFile(
        path.join(runRoot, "page-ir-sources", "v1", "content.json"),
      ),
    ).toEqual(before.content);
    expect(
      await fs.readFile(
        path.join(runRoot, "page-ir-sources", "v1", "assets.json"),
      ),
    ).toEqual(before.assets);
  });

  it.each(["failed", "promotable", "promoted"] as const)(
    "preserves a stale %s candidate instead of compiling over its lifecycle state",
    async (state) => {
      const runId = await createApprovedPageIrRun();
      await preparePersistedPageIr(runId);
      const request = await candidateRequest(runId);
      await materializePageIrCandidate(request);
      const before = await parkCandidateInState(runId, state);
      const candidateRoot = path.join(sitePaths(runId).root, "candidate");

      await expect(materializePageIrCandidate(request)).rejects.toThrow(
        /parked|preserve|cannot replace/i,
      );
      expect(
        await fs.readFile(path.join(candidateRoot, "provenance.json")),
      ).toEqual(before.provenance);
      expect(
        await fs.readFile(path.join(candidateRoot, "manifest.json")),
      ).toEqual(before.manifest);
      expect(
        await fs.readFile(path.join(candidateRoot, "site", "index.html")),
      ).toEqual(before.index);
    },
  );

  it("rejects template authority and invalid compiler assets before candidate or live writes", async () => {
    const templateRun = await createApprovedPageIrRun("template-v1");
    await expect(deriveAndPersistInitialPageIr(templateRun)).rejects.toThrow(
      "initial Page IR derivation requires page-ir-v1 authority; persisted run uses template-v1",
    );
    const templateRequest = await candidateRequest(templateRun);
    await expect(materializePageIrCandidate(templateRequest)).rejects.toThrow(
      "Page IR candidate materialization requires page-ir-v1 authority; persisted run uses template-v1",
    );
    await expect(
      fs.stat(path.join(sitePaths(templateRun).root, "page-ir.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(path.join(sitePaths(templateRun).root, "candidate")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const pageIrRun = await createApprovedPageIrRun();
    await preparePersistedPageIr(pageIrRun);
    const invalidRequest = await candidateRequest(
      pageIrRun,
      new Uint8Array(
        COMPILER_WEBP_BYTES.map((byte, index) => (index === 0 ? 0 : byte)),
      ),
    );
    const liveRoot = path.join(sitePaths(pageIrRun).root, "site");
    await fs.mkdir(liveRoot, { recursive: true });
    await fs.writeFile(path.join(liveRoot, "index.html"), "last-known-good");
    await expect(materializePageIrCandidate(invalidRequest)).rejects.toThrow(
      /asset|SHA-256|magic|compiler/i,
    );
    await expect(
      fs.stat(path.join(sitePaths(pageIrRun).root, "candidate")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(path.join(liveRoot, "index.html"), "utf8")).toBe(
      "last-known-good",
    );
  });

  it("replaces a valid page-ir-static@1 candidate and retries around the atomic swap", async () => {
    const runId = await createApprovedPageIrRun();
    await preparePersistedPageIr(runId);
    const request = await candidateRequest(runId);
    await materializePageIrCandidate(request);
    const runRoot = sitePaths(runId).root;
    const provenancePath = path.join(runRoot, "candidate", "provenance.json");
    const liveRoot = path.join(runRoot, "site");
    await fs.mkdir(liveRoot, { recursive: true });
    await fs.writeFile(path.join(liveRoot, "index.html"), "last-known-good");
    const stale = JSON.parse(await fs.readFile(provenancePath, "utf8"));
    stale.compilerVersion = "page-ir-static@1";
    await fs.writeFile(provenancePath, JSON.stringify(stale, null, 2));
    const authoritativeBefore = {
      pageIr: await fs.readFile(path.join(runRoot, "page-ir.json")),
      bundle: await fs.readFile(
        path.join(runRoot, "page-ir-sources", "v1", "bundle.json"),
      ),
      live: await fs.readFile(path.join(liveRoot, "index.html")),
    };
    const replaced = await materializePageIrCandidate(request);
    expect(replaced.status).toBe("created");
    const persisted = await loadPersistedPageIr(runId);
    const inspection = await inspectCandidate(runId);
    expect(inspection).toMatchObject({
      status: "present",
      provenance: {
        state: "ready-for-gates",
        compilerVersion: "page-ir-static@2",
        layoutAuthority: "page-ir-v1",
        pageIrSha256: persisted.pageIrSha256,
        candidateManifestSha256: candidateManifestSha256(replaced.manifest),
        buildSha256: replaced.manifest.buildSha256,
      },
      manifest: replaced.manifest,
    });
    await validateCandidateInventory(
      path.join(runRoot, "candidate", "site"),
      replaced.manifest,
    );
    for (const file of replaced.manifest.files) {
      const bytes = await fs.readFile(
        path.join(runRoot, "candidate", "site", ...file.path.split("/")),
      );
      expect(bytes.byteLength).toBe(file.sizeBytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        file.sha256,
      );
    }
    expect(await fs.readFile(path.join(runRoot, "page-ir.json"))).toEqual(
      authoritativeBefore.pageIr,
    );
    expect(
      await fs.readFile(
        path.join(runRoot, "page-ir-sources", "v1", "bundle.json"),
      ),
    ).toEqual(authoritativeBefore.bundle);
    expect(await fs.readFile(path.join(liveRoot, "index.html"))).toEqual(
      authoritativeBefore.live,
    );

    const abandoned = JSON.parse(await fs.readFile(provenancePath, "utf8"));
    abandoned.state = "abandoned";
    abandoned.history.push({
      state: "abandoned",
      at: new Date(Date.parse(abandoned.history.at(-1).at) + 1).toISOString(),
    });
    await fs.writeFile(provenancePath, JSON.stringify(abandoned, null, 2));
    await expect(materializePageIrCandidate(request)).resolves.toMatchObject({
      status: "created",
    });

    await fs.rm(path.join(runRoot, "candidate"), { recursive: true });
    await expect(
      materializePageIrCandidate(request, {
        beforeCandidateRename: () => {
          throw new Error("before candidate rename");
        },
      }),
    ).rejects.toThrow(/before candidate rename/);
    await expect(
      fs.stat(path.join(runRoot, "candidate")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    await expect(
      materializePageIrCandidate(request, {
        afterCandidateRename: () => {
          throw new Error("after candidate rename");
        },
      }),
    ).rejects.toThrow(/after candidate rename/);
    await expect(materializePageIrCandidate(request)).resolves.toMatchObject({
      status: "reused",
    });
  });

  it("restores the prior candidate and reaps swap leftovers after a post-retire failure", async () => {
    const runId = await createApprovedPageIrRun();
    await preparePersistedPageIr(runId);
    const request = await candidateRequest(runId);
    await materializePageIrCandidate(request);
    const runRoot = sitePaths(runId).root;
    const candidateRoot = path.join(runRoot, "candidate");
    const provenancePath = path.join(candidateRoot, "provenance.json");
    const stale = JSON.parse(await fs.readFile(provenancePath, "utf8"));
    stale.compilerVersion = "stale-page-ir-compiler@1";
    await fs.writeFile(provenancePath, JSON.stringify(stale, null, 2));
    const before = await fs.readFile(provenancePath);

    await expect(
      materializePageIrCandidate(request, {
        afterCandidateRetire: () => {
          throw new Error("after candidate retire");
        },
      }),
    ).rejects.toThrow(/after candidate retire/);
    expect(await fs.readFile(provenancePath)).toEqual(before);
    expect(
      (await fs.readdir(runRoot)).filter((entry) =>
        /^candidate\.(?:building|retired)-/.test(entry),
      ),
    ).toEqual([]);

    await expect(materializePageIrCandidate(request)).resolves.toMatchObject({
      status: "created",
    });
  });
});
