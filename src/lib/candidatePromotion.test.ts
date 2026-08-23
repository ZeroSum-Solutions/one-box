import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANDIDATE_GATE_EXPECTATIONS,
  CandidateGateReceiptV1Schema,
  CandidateProvenanceV1Schema,
  DesignTokensSchema,
  type CandidateGateReceiptV1,
} from "./contracts";
import * as candidateModule from "./candidate";
import {
  artifactApprovalState,
  advanceEvidenceWorkflow,
  candidatePaths,
  createRun,
  loadRun,
  saveArtifact,
  saveEvidenceArtifactVersion,
  sitePaths,
  transitionEvidenceArtifactApproval,
  workflowArtifactAliasPath,
} from "./runstate";
import {
  buildCssArchitecture,
  buildTailwindPlan,
  buildTokenInventory,
  computeSiteBuildSha256,
} from "./evidence";

type PromotionFaultStep =
  | "after-revalidation"
  | "before-staging-sync"
  | "after-staging"
  | "after-live-retired"
  | "before-retired-directory-sync"
  | "after-live-replaced"
  | "before-live-directory-sync"
  | "before-provenance-sync"
  | "after-provenance-committed"
  | "before-visual-approval-invalidation"
  | "after-visual-approval-invalidation"
  | "before-retired-cleanup"
  | "before-rollback";

type PromoteCandidate = (
  runId: string,
  options?: { injectFault?: (step: PromotionFaultStep) => void | Promise<void> },
) => Promise<{
  buildSha256: string;
  candidateManifestSha256: string;
  gateReportSha256: string;
  visualApprovalInvalidated: boolean;
  compatibilityCopyUpdated: boolean;
  retiredCleanupPending: boolean;
}>;

const promoteCandidate = candidateModule.promoteCandidate as unknown as PromoteCandidate;
const runIds: string[] = [];

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function reports(pass = true): CandidateGateReceiptV1["reports"] {
  return CANDIDATE_GATE_EXPECTATIONS.map(({ gate, blocking }) => ({
    gate,
    blocking,
    pass,
    details: [],
    ranAt: "2026-08-22T12:00:02.000Z",
  }));
}

type PriorVisualState =
  | "absent"
  | "draft"
  | "in-review"
  | "approved"
  | "revision-requested";

async function writeVisualApproval(
  runId: string,
  buildSha256: string,
  priorVisualState: PriorVisualState,
): Promise<void> {
  const approve = async (
    artifact: Awaited<ReturnType<typeof saveEvidenceArtifactVersion>>,
  ) => {
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
  };
  const ledger = await saveEvidenceArtifactVersion(runId, {
    artifactType: "ledger",
    artifact: {
      projectTarget: "website",
      businessIntelligence: {
        kind: "business-intelligence",
        sources: [],
        competitors: [],
        marketExpectations: [],
        differentiationOpportunities: [],
        claims: [],
      },
      referoDesignEvidence: {
        kind: "refero-design-evidence",
        sources: [],
        references: [],
        claims: [],
      },
      clientEvidence: {
        sources: [],
        claims: [],
        artifactRelationships: [],
        unsupportedUploadIds: [],
      },
    },
  });
  await approve(ledger);
  await advanceEvidenceWorkflow(runId, "contract");
  const designTokens = DesignTokensSchema.parse({
    colors: [{ name: "Primary", value: "#123456", cssVar: "--color-primary", role: "actions" }],
    fonts: [{ family: "Inter", cssVar: "--font-body", weights: [400], role: "body" }],
    typeScale: [{ role: "body", sizePx: 16, lineHeight: 1.5, cssVar: "--text-body" }],
    radii: { sm: "4px" },
    spacing: { sm: "8px" },
    borders: { subtle: "1px solid #ddd" },
    shadows: { raised: "0 2px 8px #0002" },
    layers: { base: "0" },
    layout: { maxWidthPx: 1000, sectionGapPx: 64, cardPaddingPx: 20 },
    motion: { easing: "linear", durationMs: { micro: 100, reveal: 300 }, revealClasses: [] },
    componentStates: [{ component: "button", states: { default: "solid" } }],
    imageryBrief: { subject: "work", lighting: "natural", grade: "neutral", framing: "wide", avoid: [] },
  });
  const contract = await saveEvidenceArtifactVersion(runId, {
    artifactType: "design-contract",
    artifact: {
      title: "Promotion fixture",
      contractPath: "DESIGN.md",
      sourceLedgerVersion: 1,
      approvedEvidenceIds: [],
      exportPaths: [],
      contractSha256: "b".repeat(64),
      exportSha256: "c".repeat(64),
      designTokens,
    },
  });
  await approve(contract);
  await advanceEvidenceWorkflow(runId, "tokens");
  const tokenArtifact = buildTokenInventory(designTokens, 1, []);
  const tokens = await saveEvidenceArtifactVersion(runId, {
    artifactType: "token-inventory",
    artifact: tokenArtifact,
  });
  await approve(tokens);
  await advanceEvidenceWorkflow(runId, "tailwind");
  const tailwindArtifact = buildTailwindPlan(tokenArtifact, 1);
  const tailwind = await saveEvidenceArtifactVersion(runId, {
    artifactType: "tailwind-plan",
    artifact: tailwindArtifact,
  });
  await approve(tailwind);
  await advanceEvidenceWorkflow(runId, "css");
  const css = await saveEvidenceArtifactVersion(runId, {
    artifactType: "css-architecture",
    artifact: buildCssArchitecture(tokenArtifact, tailwindArtifact, 1),
  });
  await approve(css);
  await advanceEvidenceWorkflow(runId, "build");
  if (priorVisualState === "absent") return;
  const visualQa = await saveEvidenceArtifactVersion(runId, {
    artifactType: "visual-qa",
    artifact: {
      sourceCssArchitectureVersion: 1,
      buildSha256,
      checks: ([
        "desktop",
        "tablet",
        "mobile",
        "hover",
        "focus",
        "color-scheme",
        "reduced-motion",
      ] as const).map((area) => ({
        area,
        status: "pass",
        ...(["desktop", "tablet", "mobile"].includes(area)
          ? { evidencePath: `evidence/qa/v1/${area}.png` }
          : {}),
      })),
    },
  });
  if (priorVisualState === "draft") return;
  if (priorVisualState === "revision-requested") {
    await transitionEvidenceArtifactApproval(
      runId,
      "visual-qa",
      visualQa.version,
      "revision-requested",
    );
    return;
  }
  await transitionEvidenceArtifactApproval(runId, "visual-qa", visualQa.version, "in-review");
  if (priorVisualState === "in-review") return;
  await transitionEvidenceArtifactApproval(
    runId,
    "visual-qa",
    visualQa.version,
    "approved",
    {
      humanVisualReview: {
        reviewerName: "Test reviewer",
        reviewerKind: "human",
        humanAttestation: true,
        reviewedAt: "2026-08-22T12:00:01.000Z",
        buildSha256,
        criteria: {
          briefFidelity: { status: "pass" },
          visualHierarchy: { status: "pass" },
          spacingAndComposition: { status: "pass" },
          businessSpecificity: { status: "pass" },
          designAndReferenceAlignment: {
            status: "pass",
            referenceContext: "design-and-references",
          },
        },
      },
    },
  );
}

async function fixture(
  options: {
    gatePass?: boolean;
    priorVisualState?: PriorVisualState;
  } = {},
) {
  const runId = await createRun();
  runIds.push(runId);
  const roots = sitePaths(runId);
  const candidate = candidatePaths(runId);
  await saveArtifact(runId, "intake.json", {
    businessName: "Atomic Co",
    category: "service",
    location: "Austin, TX",
    services: ["Repair"],
    primaryAction: "quote",
    projectTarget: "website",
  });

  await fs.mkdir(roots.site, { recursive: true });
  await fs.writeFile(path.join(roots.site, "index.html"), "old-live");
  await fs.writeFile(
    path.join(roots.site, "manifest.json"),
    JSON.stringify({
      entry: "index.html",
      files: ["index.html"],
      assets: [],
      builtAt: "2026-08-22T11:00:00.000Z",
      complete: true,
    }),
  );
  const oldBuildSha256 = await computeSiteBuildSha256(roots.site);
  const oldRootReport = Buffer.from(JSON.stringify([{ version: "old" }], null, 2));
  await fs.writeFile(path.join(roots.root, "gates.json"), oldRootReport);
  await writeVisualApproval(
    runId,
    oldBuildSha256,
    options.priorVisualState ?? "approved",
  );

  await fs.mkdir(candidate.site, { recursive: true });
  await fs.writeFile(path.join(candidate.site, "index.html"), "new-live");
  await fs.writeFile(
    path.join(candidate.site, "manifest.json"),
    JSON.stringify({
      entry: "index.html",
      files: ["index.html"],
      assets: [],
      builtAt: "2026-08-22T12:00:00.000Z",
      complete: true,
    }),
  );
  const manifest = await candidateModule.createCandidateManifest(candidate.site);
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  await fs.writeFile(candidate.manifest, manifestBytes);
  const candidateManifestSha256 = candidateModule.candidateManifestSha256(manifest);
  const receipt = CandidateGateReceiptV1Schema.parse({
    schemaVersion: 1,
    runId,
    candidateManifestSha256,
    buildSha256: manifest.buildSha256,
    reports: reports(options.gatePass ?? true),
  });
  const receiptBytes = Buffer.from(JSON.stringify(receipt, null, 2));
  await fs.writeFile(candidate.gates, receiptBytes);
  const gateReportSha256 = sha256(receiptBytes);
  const provenance = CandidateProvenanceV1Schema.parse({
    schemaVersion: 1,
    candidateId: `${runId}-candidate`,
    runId,
    createdAt: "2026-08-22T12:00:00.000Z",
    state: "promotable",
    history: [
      { state: "preparing", at: "2026-08-22T12:00:00.000Z" },
      { state: "ready-for-gates", at: "2026-08-22T12:00:01.000Z" },
      { state: "promotable", at: "2026-08-22T12:00:02.000Z" },
    ],
    inputArtifactHashes: [{ path: "intake.json", sha256: "a".repeat(64) }],
    layoutAuthority: "template-v1",
    compilerVersion: "fixture-v1",
    candidateManifestSha256,
    buildSha256: manifest.buildSha256,
    gateReportSha256,
  });
  await fs.writeFile(candidate.provenance, JSON.stringify(provenance, null, 2));

  return {
    runId,
    roots,
    candidate,
    manifest,
    receipt,
    oldRootReport,
  };
}

async function snapshotApproval(runId: string): Promise<{
  run: Buffer;
  alias: Buffer;
}> {
  return {
    run: await fs.readFile(path.join(sitePaths(runId).root, "run.json")),
    alias: await fs.readFile(
      path.join(sitePaths(runId).root, workflowArtifactAliasPath("visual-qa")),
    ),
  };
}

afterEach(async () => {
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
    ),
  );
});

describe("candidate promotion", () => {
  it("promotes the exact gated bytes as one live bundle before invalidating approval", async () => {
    const prepared = await fixture();

    const result = await promoteCandidate(prepared.runId);

    expect(result).toEqual({
      buildSha256: prepared.manifest.buildSha256,
      candidateManifestSha256:
        candidateModule.candidateManifestSha256(prepared.manifest),
      gateReportSha256: sha256(
        Buffer.from(JSON.stringify(prepared.receipt, null, 2)),
      ),
      visualApprovalInvalidated: true,
      compatibilityCopyUpdated: true,
      retiredCleanupPending: false,
    });
    expect(await fs.readFile(path.join(prepared.roots.site, "index.html"), "utf8")).toBe(
      "new-live",
    );
    expect(
      CandidateGateReceiptV1Schema.parse(
        JSON.parse(
          await fs.readFile(
            path.join(prepared.roots.site, ".one-box", "gates.json"),
            "utf8",
          ),
        ),
      ),
    ).toEqual(prepared.receipt);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(prepared.roots.site, ".one-box", "candidate-manifest.json"),
          "utf8",
        ),
      ),
    ).toEqual(prepared.manifest);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(prepared.roots.site, ".one-box", "provenance.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      state: "promoted",
      promotedBuildSha256: prepared.manifest.buildSha256,
    });
    expect(
      JSON.parse(await fs.readFile(path.join(prepared.roots.root, "gates.json"), "utf8")),
    ).toEqual(prepared.receipt.reports);
    expect(await computeSiteBuildSha256(prepared.roots.site)).toBe(
      prepared.manifest.buildSha256,
    );
    const promoted = await candidateModule.inspectCandidate(prepared.runId);
    expect(promoted.status === "present" && promoted.provenance).toMatchObject({
      state: "promoted",
      promotedBuildSha256: prepared.manifest.buildSha256,
    });
    const visualQaArtifacts = (await loadRun(prepared.runId)).evidenceWorkflow.artifacts.filter(
      (artifact) => artifact.artifactType === "visual-qa",
    );
    expect(visualQaArtifacts).toHaveLength(2);
    expect(artifactApprovalState(visualQaArtifacts[0])).toBe("superseded");
    expect(visualQaArtifacts[1]).toMatchObject({
      artifactType: "visual-qa",
      version: 2,
      revisionOf: 1,
      artifact: {
        buildSha256: prepared.manifest.buildSha256,
        checks: expect.arrayContaining([
          expect.objectContaining({ status: "pending" }),
        ]),
      },
    });
    expect(artifactApprovalState(visualQaArtifacts[1])).toBe("draft");
    expect(
      (await fs.readdir(prepared.roots.root)).filter((entry) =>
        entry.startsWith(".site-promotion-retired-"),
      ),
    ).toEqual([]);
  });

  it("rejects a receipt with a blocking failure without changing live bytes or approval", async () => {
    const prepared = await fixture({ gatePass: false });
    const beforeApproval = await snapshotApproval(prepared.runId);
    const oldSite = await fs.readFile(path.join(prepared.roots.site, "index.html"));

    await expect(promoteCandidate(prepared.runId)).rejects.toThrow(
      /blocking candidate gate/i,
    );

    expect(await fs.readFile(path.join(prepared.roots.site, "index.html"))).toEqual(oldSite);
    expect(await fs.readFile(path.join(prepared.roots.root, "gates.json"))).toEqual(
      prepared.oldRootReport,
    );
    expect(await snapshotApproval(prepared.runId)).toEqual(beforeApproval);
    const candidate = await candidateModule.inspectCandidate(prepared.runId);
    expect(candidate.status === "present" && candidate.provenance.state).toBe("promotable");
  });

  it("rejects a gate receipt bound to different build bytes before live mutation", async () => {
    const prepared = await fixture();
    const mismatched = {
      ...prepared.receipt,
      buildSha256: "f".repeat(64),
    };
    const bytes = Buffer.from(JSON.stringify(mismatched, null, 2));
    await fs.writeFile(prepared.candidate.gates, bytes);
    const provenance = JSON.parse(
      await fs.readFile(prepared.candidate.provenance, "utf8"),
    ) as Record<string, unknown>;
    provenance.gateReportSha256 = sha256(bytes);
    await fs.writeFile(prepared.candidate.provenance, JSON.stringify(provenance, null, 2));

    await expect(promoteCandidate(prepared.runId)).rejects.toThrow(
      /receipt does not match/i,
    );
    expect(await fs.readFile(path.join(prepared.roots.site, "index.html"), "utf8")).toBe(
      "old-live",
    );
  });

  it("revalidates inventory immediately before commit", async () => {
    const prepared = await fixture();

    await expect(
      promoteCandidate(prepared.runId, {
        injectFault: async (step) => {
          if (step === "after-staging") {
            await fs.writeFile(
              path.join(prepared.candidate.site, "index.html"),
              "tampered-after-staging",
            );
          }
        },
      }),
    ).rejects.toThrow(/(size|SHA-256) mismatch/i);
    expect(await fs.readFile(path.join(prepared.roots.site, "index.html"), "utf8")).toBe(
      "old-live",
    );
  });

  it.each([
    ["manifest", "manifest.json"],
    ["provenance", "provenance.json"],
    ["receipt", "gates.json"],
  ] as const)(
    "revalidates exact %s bytes immediately before commit",
    async (_label, fileName) => {
      const prepared = await fixture();

      await expect(
        promoteCandidate(prepared.runId, {
          injectFault: async (step) => {
            if (step !== "after-staging") return;
            await fs.appendFile(path.join(prepared.candidate.root, fileName), "\n");
          },
        }),
      ).rejects.toThrow();
      expect(await fs.readFile(path.join(prepared.roots.site, "index.html"), "utf8")).toBe(
        "old-live",
      );
      expect((await loadRun(prepared.runId)).evidenceWorkflow.artifacts).toHaveLength(6);
    },
  );

  it.each([
    ["absent", false],
    ["draft", true],
    ["in-review", true],
    ["approved", true],
    ["revision-requested", false],
  ] as const)(
    "creates a promoted-hash QA draft from a prior %s visual state",
    async (priorVisualState, expectedInvalidation) => {
      const prepared = await fixture({ priorVisualState });

      const result = await promoteCandidate(prepared.runId);

      expect(result.visualApprovalInvalidated).toBe(expectedInvalidation);
      const visualQaArtifacts = (await loadRun(prepared.runId)).evidenceWorkflow.artifacts.filter(
        (artifact) => artifact.artifactType === "visual-qa",
      );
      expect(visualQaArtifacts).toHaveLength(priorVisualState === "absent" ? 1 : 2);
      expect(visualQaArtifacts.at(-1)).toMatchObject({
        artifactType: "visual-qa",
        artifact: { buildSha256: prepared.manifest.buildSha256 },
      });
      expect(artifactApprovalState(visualQaArtifacts.at(-1)!)).toBe("draft");
      if (visualQaArtifacts.length > 1) {
        expect(artifactApprovalState(visualQaArtifacts[0])).toBe("superseded");
      }
    },
  );

  it.each([
    "after-revalidation",
    "before-staging-sync",
    "after-staging",
    "after-live-retired",
    "before-retired-directory-sync",
    "after-live-replaced",
    "before-live-directory-sync",
    "before-provenance-sync",
    "after-provenance-committed",
    "before-visual-approval-invalidation",
    "after-visual-approval-invalidation",
  ] as const)(
    "restores the complete old bundle and approval when %s fails",
    async (faultStep) => {
      const prepared = await fixture();
      const beforeApproval = await snapshotApproval(prepared.runId);
      const oldSite = await fs.readFile(path.join(prepared.roots.site, "index.html"));

      await expect(
        promoteCandidate(prepared.runId, {
          injectFault: (step) => {
            if (step === faultStep) throw new Error(`fault:${step}`);
          },
        }),
      ).rejects.toThrow(`fault:${faultStep}`);

      expect(await fs.readFile(path.join(prepared.roots.site, "index.html"))).toEqual(oldSite);
      expect(await fs.readFile(path.join(prepared.roots.root, "gates.json"))).toEqual(
        prepared.oldRootReport,
      );
      expect(await snapshotApproval(prepared.runId)).toEqual(beforeApproval);
      const candidate = await candidateModule.inspectCandidate(prepared.runId);
      expect(candidate.status === "present" && candidate.provenance.state).toBe(
        "promotable",
      );
    },
  );

  it.each([
    "after-revalidation",
    "before-staging-sync",
    "after-staging",
    "after-live-retired",
    "after-live-replaced",
    "before-live-directory-sync",
    "before-provenance-sync",
    "after-provenance-committed",
    "before-visual-approval-invalidation",
    "after-visual-approval-invalidation",
  ] as const)(
    "restores an unpublished first build when %s fails",
    async (faultStep) => {
      const prepared = await fixture();
      await fs.rm(prepared.roots.site, { recursive: true });
      await fs.rm(path.join(prepared.roots.root, "gates.json"));
      const beforeApproval = await snapshotApproval(prepared.runId);

      await expect(
        promoteCandidate(prepared.runId, {
          injectFault: (step) => {
            if (step === faultStep) throw new Error(`fault:${step}`);
          },
        }),
      ).rejects.toThrow(`fault:${faultStep}`);

      await expect(fs.access(prepared.roots.site)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(
        fs.access(path.join(prepared.roots.root, "gates.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(await snapshotApproval(prepared.runId)).toEqual(beforeApproval);
      const candidate = await candidateModule.inspectCandidate(prepared.runId);
      expect(candidate.status === "present" && candidate.provenance.state).toBe(
        "promotable",
      );
    },
  );

  it("publishes a complete first-build bundle without inventing a retired generation", async () => {
    const prepared = await fixture();
    await fs.rm(prepared.roots.site, { recursive: true });
    await fs.rm(path.join(prepared.roots.root, "gates.json"));

    const result = await promoteCandidate(prepared.runId);

    expect(result.retiredCleanupPending).toBe(false);
    expect(await candidateModule.inspectPromotedLiveBundle(prepared.runId)).toMatchObject({
      status: "present",
      manifest: { buildSha256: prepared.manifest.buildSha256 },
      receipt: { buildSha256: prepared.manifest.buildSha256 },
    });
    expect(
      (await fs.readdir(prepared.roots.root)).filter((entry) =>
        entry.startsWith(".site-promotion-retired-"),
      ),
    ).toEqual([]);
  });

  it("exposes only the complete new canonical generation at the publish barrier", async () => {
    const prepared = await fixture();

    await expect(
      promoteCandidate(prepared.runId, {
        injectFault: async (step) => {
          if (step !== "after-live-replaced") return;
          expect(await candidateModule.inspectPromotedLiveBundle(prepared.runId)).toMatchObject({
            status: "present",
            manifest: { buildSha256: prepared.manifest.buildSha256 },
            receipt: { buildSha256: prepared.manifest.buildSha256 },
          });
          expect(await fs.readFile(path.join(prepared.roots.root, "gates.json"))).toEqual(
            prepared.oldRootReport,
          );
          throw new Error("barrier-observed");
        },
      }),
    ).rejects.toThrow("barrier-observed");
    expect(await fs.readFile(path.join(prepared.roots.site, "index.html"), "utf8")).toBe(
      "old-live",
    );
  });

  it("keeps the committed new bundle when retired cleanup cannot finish", async () => {
    const prepared = await fixture();

    const result = await promoteCandidate(prepared.runId, {
      injectFault: (step) => {
        if (step === "before-retired-cleanup") {
          throw new Error("cleanup unavailable");
        }
      },
    });

    expect(result.retiredCleanupPending).toBe(true);
    expect(await fs.readFile(path.join(prepared.roots.site, "index.html"), "utf8")).toBe(
      "new-live",
    );
    expect(
      (await fs.readdir(prepared.roots.root)).some((entry) =>
        entry.startsWith(".site-promotion-retired-"),
      ),
    ).toBe(true);
    const visualQa = (await loadRun(prepared.runId)).evidenceWorkflow.artifacts.at(-1);
    expect(visualQa).toMatchObject({
      artifactType: "visual-qa",
      artifact: { buildSha256: prepared.manifest.buildSha256 },
    });
    expect(visualQa && artifactApprovalState(visualQa)).toBe("draft");
  });

  it("reports an aggregate error when authoritative rollback also fails", async () => {
    const prepared = await fixture();

    await expect(
      promoteCandidate(prepared.runId, {
        injectFault: (step) => {
          if (step === "after-live-replaced") throw new Error("publish fault");
          if (step === "before-rollback") throw new Error("rollback fault");
        },
      }),
    ).rejects.toBeInstanceOf(AggregateError);
  });
});
