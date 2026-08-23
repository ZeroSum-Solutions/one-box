import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
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
  preparePromotedVisualQaUnderSiteAuthority,
  saveArtifact,
  saveEvidenceArtifactVersion,
  sitePaths,
  transitionEvidenceArtifactApproval,
  workflowArtifactAliasPath,
} from "./runstate";
import { withSiteAuthorityLock } from "./siteAuthority";
import {
  buildCssArchitecture,
  buildTailwindPlan,
  buildTokenInventory,
  computeSiteBuildSha256,
} from "./evidence";
import { withReleaseAuthorization } from "./release";
import { runGuardedMutation } from "./siteMutation";
import { materializePromotedPageIrVisualQa } from "./pageIrController";
import { GET as exportEvidence } from "../app/api/evidence/[id]/export/route";
import { GET as readSiteArtifact } from "../app/api/sites/[id]/[...path]/route";

type PromotionFaultStep =
  | "after-revalidation"
  | "before-staging-sync"
  | "after-staging"
  | "after-live-retired"
  | "before-retired-directory-sync"
  | "after-live-replaced"
  | "before-live-directory-sync"
  | "before-provenance-sync"
  | "after-provenance-renamed"
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
const recoverCandidateState = candidateModule.recoverCandidateState;
const runIds: string[] = [];
const execFileAsync = promisify(execFile);

const PROMOTION_FAULT_STEPS = [
  "after-revalidation",
  "before-staging-sync",
  "after-staging",
  "before-retired-directory-sync",
  "after-live-retired",
  "before-live-directory-sync",
  "after-live-replaced",
  "before-provenance-sync",
  "after-provenance-renamed",
  "after-provenance-committed",
  "before-visual-approval-invalidation",
  "after-visual-approval-invalidation",
  "before-retired-cleanup",
  "before-rollback",
] as const satisfies readonly PromotionFaultStep[];

const PROMOTION_COMMITTED_BEFORE_CRASH = new Set<PromotionFaultStep>([
  "after-provenance-renamed",
  "after-provenance-committed",
  "before-visual-approval-invalidation",
  "after-visual-approval-invalidation",
  "before-retired-cleanup",
]);

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
    pageIr?: boolean;
  } = {},
) {
  const runId = await createRun(
    options.pageIr
      ? { layoutAuthority: "page-ir-v1", pageIrRolloutPermitted: true }
      : undefined,
  );
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
  const intakeSha256 = sha256(
    await fs.readFile(path.join(roots.root, "intake.json")),
  );

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
    inputArtifactHashes: [{ path: "intake.json", sha256: intakeSha256 }],
    layoutAuthority: options.pageIr ? "page-ir-v1" : "template-v1",
    compilerVersion: "fixture-v1",
    ...(options.pageIr ? { pageIrSha256: "e".repeat(64) } : {}),
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

async function promoteThenDeleteLiveMetadata() {
  const prepared = await fixture();
  await promoteCandidate(prepared.runId);
  await fs.rm(
    path.join(prepared.roots.site, ".one-box"),
    { recursive: true },
  );
  return prepared;
}

afterEach(async () => {
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
    ),
  );
});

describe("candidate promotion", () => {
  it("lawfully replaces the promoted PageIR pending QA placeholder once", async () => {
    const prepared = await fixture({ pageIr: true });
    await promoteCandidate(prepared.runId);
    let captures = 0;
    const stageVisualQa = async (
      _siteDirectory: string,
      sourceCssArchitectureVersion: number,
      _visualQaVersion: number,
      stagingDirectory: string,
      evidenceBasePath: string,
    ) => {
      captures += 1;
      await fs.mkdir(stagingDirectory, { recursive: true });
      const widths = ["desktop-1440.png", "tablet-768.png", "mobile-390.png"];
      await Promise.all(
        widths.map((name) => fs.writeFile(path.join(stagingDirectory, name), name)),
      );
      return {
        sourceCssArchitectureVersion,
        buildSha256: prepared.manifest.buildSha256,
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
          status: "pass" as const,
          ...(["desktop", "tablet", "mobile"].includes(area)
            ? {
                evidencePath: `${evidenceBasePath}/${
                  area === "desktop"
                    ? "desktop-1440.png"
                    : area === "tablet"
                      ? "tablet-768.png"
                      : "mobile-390.png"
                }`,
              }
            : {}),
        })),
      };
    };

    const first = await materializePromotedPageIrVisualQa(prepared.runId, {
      stageThreeWidthVisualQa: stageVisualQa,
    });
    const second = await materializePromotedPageIrVisualQa(prepared.runId, {
      stageThreeWidthVisualQa: stageVisualQa,
    });

    expect(second).toEqual(first);
    expect(captures).toBe(1);
    expect(first).toMatchObject({
      artifactType: "visual-qa",
      version: 3,
      artifact: { buildSha256: prepared.manifest.buildSha256 },
      approvalTransitions: [{ state: "draft" }],
    });
    const visualQa = (await loadRun(prepared.runId)).evidenceWorkflow.artifacts
      .filter((artifact) => artifact.artifactType === "visual-qa");
    expect(visualQa.at(-2)?.approvalTransitions.map((entry) => entry.state)).toEqual([
      "draft",
      "revision-requested",
      "superseded",
    ]);
    expect(visualQa.at(-1)).toEqual(first);
    await expect(
      fs.readFile(
        path.join(
          prepared.roots.root,
          "evidence/qa/v3/desktop-1440.png",
        ),
        "utf8",
      ),
    ).resolves.toBe("desktop-1440.png");
  });

  it("blocks authority-mismatched promotion before changing live or reports", async () => {
    const prepared = await fixture();
    const runPath = path.join(prepared.roots.root, "run.json");
    const run = JSON.parse(await fs.readFile(runPath, "utf8"));
    run.layoutAuthority = "page-ir-v1";
    await fs.writeFile(runPath, JSON.stringify(run));
    const beforeLive = await fs.readFile(path.join(prepared.roots.site, "index.html"));
    const beforeReport = await fs.readFile(path.join(prepared.roots.root, "gates.json"));
    const beforeProvenance = await fs.readFile(prepared.candidate.provenance);

    await expect(promoteCandidate(prepared.runId)).rejects.toThrow(
      "candidate provenance requires template-v1 authority",
    );
    expect(await fs.readFile(path.join(prepared.roots.site, "index.html"))).toEqual(beforeLive);
    expect(await fs.readFile(path.join(prepared.roots.root, "gates.json"))).toEqual(beforeReport);
    expect(await fs.readFile(prepared.candidate.provenance)).toEqual(beforeProvenance);
  });

  it("blocks Page IR candidate promotion on a template run before changing live, report, or candidate bytes", async () => {
    const prepared = await fixture();
    const provenance = CandidateProvenanceV1Schema.parse({
      ...JSON.parse(await fs.readFile(prepared.candidate.provenance, "utf8")),
      layoutAuthority: "page-ir-v1",
      pageIrSha256: "c".repeat(64),
    });
    await fs.writeFile(
      prepared.candidate.provenance,
      JSON.stringify(provenance, null, 2),
    );
    const runPath = path.join(prepared.roots.root, "run.json");
    const livePath = path.join(prepared.roots.site, "index.html");
    const reportPath = path.join(prepared.roots.root, "gates.json");
    const before = {
      run: await fs.readFile(runPath),
      live: await fs.readFile(livePath),
      report: await fs.readFile(reportPath),
      provenance: await fs.readFile(prepared.candidate.provenance),
      manifest: await fs.readFile(prepared.candidate.manifest),
      gates: await fs.readFile(prepared.candidate.gates),
    };

    await expect(promoteCandidate(prepared.runId)).rejects.toThrow(
      "candidate provenance requires page-ir-v1 authority",
    );
    expect(await fs.readFile(runPath)).toEqual(before.run);
    expect(await fs.readFile(livePath)).toEqual(before.live);
    expect(await fs.readFile(reportPath)).toEqual(before.report);
    expect(await fs.readFile(prepared.candidate.provenance)).toEqual(before.provenance);
    expect(await fs.readFile(prepared.candidate.manifest)).toEqual(before.manifest);
    expect(await fs.readFile(prepared.candidate.gates)).toEqual(before.gates);
  });

  it("blocks authority-mismatched promoted-live inspection without changing live bytes", async () => {
    const prepared = await fixture();
    await promoteCandidate(prepared.runId);
    const runPath = path.join(prepared.roots.root, "run.json");
    const run = JSON.parse(await fs.readFile(runPath, "utf8"));
    run.layoutAuthority = "page-ir-v1";
    await fs.writeFile(runPath, JSON.stringify(run));
    const beforeLive = await fs.readFile(path.join(prepared.roots.site, "index.html"));
    const beforeMetadata = await fs.readFile(
      path.join(prepared.roots.site, ".one-box", "provenance.json"),
    );

    await expect(
      candidateModule.inspectPromotedLiveBundle(prepared.runId),
    ).rejects.toThrow("candidate provenance requires template-v1 authority");
    expect(await fs.readFile(path.join(prepared.roots.site, "index.html"))).toEqual(beforeLive);
    expect(
      await fs.readFile(path.join(prepared.roots.site, ".one-box", "provenance.json")),
    ).toEqual(beforeMetadata);
  });

  it("blocks Page IR promoted-live provenance on a template run without changing live or report bytes", async () => {
    const prepared = await fixture();
    await promoteCandidate(prepared.runId);
    const liveProvenancePath = path.join(
      prepared.roots.site,
      ".one-box",
      "provenance.json",
    );
    const liveProvenance = CandidateProvenanceV1Schema.parse({
      ...JSON.parse(await fs.readFile(liveProvenancePath, "utf8")),
      layoutAuthority: "page-ir-v1",
      pageIrSha256: "d".repeat(64),
    });
    await fs.writeFile(liveProvenancePath, JSON.stringify(liveProvenance, null, 2));
    const livePath = path.join(prepared.roots.site, "index.html");
    const reportPath = path.join(prepared.roots.root, "gates.json");
    const before = {
      live: await fs.readFile(livePath),
      report: await fs.readFile(reportPath),
      provenance: await fs.readFile(liveProvenancePath),
    };

    await expect(
      candidateModule.inspectPromotedLiveBundle(prepared.runId),
    ).rejects.toThrow("candidate provenance requires page-ir-v1 authority");
    expect(await fs.readFile(livePath)).toEqual(before.live);
    expect(await fs.readFile(reportPath)).toEqual(before.report);
    expect(await fs.readFile(liveProvenancePath)).toEqual(before.provenance);
  });

  it("blocks recovery when live provenance authority differs without writing a recovery report", async () => {
    const prepared = await fixture();
    await promoteCandidate(prepared.runId);
    const liveProvenancePath = path.join(
      prepared.roots.site,
      ".one-box",
      "provenance.json",
    );
    const liveProvenance = JSON.parse(
      await fs.readFile(liveProvenancePath, "utf8"),
    );
    liveProvenance.layoutAuthority = "page-ir-v1";
    liveProvenance.pageIrSha256 = "c".repeat(64);
    await fs.writeFile(liveProvenancePath, JSON.stringify(liveProvenance, null, 2));
    const beforeLive = await fs.readFile(path.join(prepared.roots.site, "index.html"));
    const beforeReport = await fs.readFile(path.join(prepared.roots.root, "gates.json"));
    const beforeMetadata = await fs.readFile(liveProvenancePath);

    await expect(recoverCandidateState(prepared.runId)).resolves.toMatchObject({
      action: "blocked",
      reason: expect.stringContaining("candidate provenance requires page-ir-v1 authority"),
    });
    expect(await fs.readFile(path.join(prepared.roots.site, "index.html"))).toEqual(beforeLive);
    expect(await fs.readFile(path.join(prepared.roots.root, "gates.json"))).toEqual(beforeReport);
    expect(await fs.readFile(liveProvenancePath)).toEqual(beforeMetadata);
    await expect(
      fs.stat(path.join(prepared.roots.root, "candidate-recovery.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(PROMOTION_FAULT_STEPS)(
    "recovers idempotently after a fresh process exits at %s",
    async (faultStep) => {
      const prepared = await fixture();
      const childFixture = path.join(
        process.cwd(),
        "src/lib/candidatePromotion.crash.fixture.test.ts",
      );
      const vitest = path.join(process.cwd(), "node_modules/vitest/vitest.mjs");

      let crash: unknown;
      try {
        await execFileAsync(
          process.execPath,
          [vitest, "run", childFixture, "--maxWorkers=1"],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              ONEBOX_PROMOTION_CRASH_RUN_ID: prepared.runId,
              ONEBOX_PROMOTION_CRASH_STEP: faultStep,
            },
          },
        );
      } catch (error) {
        crash = error;
      }
      expect(crash).toMatchObject({ code: 1 });
      expect((crash as { stderr: string }).stderr).toMatch(/worker exited unexpectedly/i);
      const crashMarker = path.join(prepared.roots.root, ".promotion-crash-marker");
      expect(await fs.readFile(crashMarker, "utf8")).toBe(`${faultStep}:86`);
      await fs.rm(crashMarker);

      const first = await recoverCandidateState(prepared.runId);
      const liveText = await fs.readFile(
        path.join(prepared.roots.site, "index.html"),
        "utf8",
      );
      const expectedCommitted = PROMOTION_COMMITTED_BEFORE_CRASH.has(faultStep);
      expect(liveText).toBe(expectedCommitted ? "new-live" : "old-live");
      const siteEntries = (await fs.readdir(prepared.roots.site)).sort();
      if (!expectedCommitted) {
        expect(first).toMatchObject({
          action: "retain-promotable",
          state: "promotable",
        });
        expect(siteEntries).toEqual(["index.html", "manifest.json"]);
        expect(JSON.parse(await fs.readFile(prepared.candidate.provenance, "utf8")))
          .toMatchObject({ state: "promotable" });
      } else {
        expect(first).toMatchObject({ action: "completed", state: "promoted" });
        expect(siteEntries).toEqual([".one-box", "index.html", "manifest.json"]);
        await expect(candidateModule.inspectPromotedLiveBundle(prepared.runId))
          .resolves.toMatchObject({
            status: "present",
            manifest: { buildSha256: prepared.manifest.buildSha256 },
            receipt: { buildSha256: prepared.manifest.buildSha256 },
          });
        expect(JSON.parse(await fs.readFile(prepared.candidate.provenance, "utf8")))
          .toMatchObject({
            state: "promoted",
            promotedBuildSha256: prepared.manifest.buildSha256,
          });
      }
      expect((await loadRun(prepared.runId)).evidenceWorkflow.artifacts.filter(
        (artifact) => artifact.artifactType === "visual-qa",
      )).toHaveLength(expectedCommitted ? 2 : 1);
      expect((await fs.readdir(prepared.roots.root)).filter((entry) =>
        /^\.site-promotion-(?:stage|retired)-/.test(entry)
      )).toEqual([]);

      const beforeSecond = {
        live: await fs.readFile(path.join(prepared.roots.site, "index.html")),
        provenance: await fs.readFile(prepared.candidate.provenance),
        visualQaCount: (await loadRun(prepared.runId)).evidenceWorkflow.artifacts.filter(
          (artifact) => artifact.artifactType === "visual-qa",
        ).length,
      };
      const second = await recoverCandidateState(prepared.runId);
      expect(second).toMatchObject({ action: first.action, state: first.state });
      expect(await fs.readFile(path.join(prepared.roots.site, "index.html")))
        .toEqual(beforeSecond.live);
      expect(await fs.readFile(prepared.candidate.provenance))
        .toEqual(beforeSecond.provenance);
      expect((await loadRun(prepared.runId)).evidenceWorkflow.artifacts.filter(
        (artifact) => artifact.artifactType === "visual-qa",
      )).toHaveLength(beforeSecond.visualQaCount);
    },
    30_000,
  );

  it("reconciles an already prepared promoted visual review idempotently", async () => {
    const prepared = await fixture();
    await promoteCandidate(prepared.runId);
    const before = await loadRun(prepared.runId);
    const beforeVersions = before.evidenceWorkflow.artifacts.filter(
      (artifact) => artifact.artifactType === "visual-qa",
    );

    await withSiteAuthorityLock(prepared.runId, () =>
      preparePromotedVisualQaUnderSiteAuthority(
        prepared.runId,
        prepared.manifest.buildSha256,
      ),
    );

    const after = await loadRun(prepared.runId);
    expect(after.evidenceWorkflow.artifacts.filter(
      (artifact) => artifact.artifactType === "visual-qa",
    )).toEqual(beforeVersions);
  });

  it("cleans a committed promotion leftover only after idempotent QA reconciliation", async () => {
    const prepared = await fixture();
    const priorApproval = await snapshotApproval(prepared.runId);
    await promoteCandidate(prepared.runId);
    await fs.writeFile(path.join(prepared.roots.root, "run.json"), priorApproval.run);
    await fs.writeFile(
      path.join(prepared.roots.root, workflowArtifactAliasPath("visual-qa")),
      priorApproval.alias,
    );
    const retired = path.join(
      prepared.roots.root,
      ".site-promotion-retired-123-deadbeefcafe",
    );
    await fs.mkdir(retired);
    await fs.writeFile(path.join(retired, "index.html"), "retired-old-live");
    const before = await loadRun(prepared.runId);
    const beforeVisualCount = before.evidenceWorkflow.artifacts.filter(
      (artifact) => artifact.artifactType === "visual-qa",
    ).length;

    await expect(recoverCandidateState(prepared.runId)).resolves.toMatchObject({
      action: "completed",
      state: "promoted",
    });

    await expect(fs.stat(retired)).rejects.toMatchObject({ code: "ENOENT" });
    const after = await loadRun(prepared.runId);
    const afterVisual = after.evidenceWorkflow.artifacts.filter(
      (artifact) => artifact.artifactType === "visual-qa",
    );
    expect(afterVisual).toHaveLength(beforeVisualCount + 1);
    expect(afterVisual.at(-1)).toMatchObject({
      artifact: { buildSha256: prepared.manifest.buildSha256 },
    });

    await recoverCandidateState(prepared.runId);
    expect((await loadRun(prepared.runId)).evidenceWorkflow.artifacts.filter(
      (artifact) => artifact.artifactType === "visual-qa",
    )).toHaveLength(afterVisual.length);
  });

  it("preserves retired recovery data when promoted QA reconciliation cannot commit", async () => {
    const prepared = await fixture();
    await promoteCandidate(prepared.runId);
    const run = await loadRun(prepared.runId);
    run.evidenceWorkflow.artifacts = run.evidenceWorkflow.artifacts.filter(
      (artifact) => !["css-architecture", "visual-qa"].includes(artifact.artifactType),
    );
    await saveArtifact(prepared.runId, "run.json", run);
    const retired = path.join(
      prepared.roots.root,
      ".site-promotion-retired-123-deadbeefcafe",
    );
    await fs.mkdir(retired);
    await fs.writeFile(path.join(retired, "index.html"), "retired-old-live");

    await expect(recoverCandidateState(prepared.runId)).resolves.toMatchObject({
      action: "blocked",
      reason: expect.any(String),
    });
    expect(await fs.readFile(path.join(retired, "index.html"), "utf8"))
      .toBe("retired-old-live");
  });

  it("fails closed when promoted live metadata disappears", async () => {
    const prepared = await promoteThenDeleteLiveMetadata();

    await expect(
      candidateModule.inspectPromotedLiveBundle(prepared.runId),
    ).rejects.toThrow(/promoted live bundle metadata is missing/i);
  });

  it("blocks release and export when promoted live metadata disappears", async () => {
    const prepared = await promoteThenDeleteLiveMetadata();

    await expect(
      withReleaseAuthorization(prepared.runId, async () => "released"),
    ).rejects.toThrow(/promoted live bundle metadata is invalid/i);

    const response = await exportEvidence(
      new Request(
        `http://localhost:3000/api/evidence/${prepared.runId}/export`,
        {
          headers: {
            Origin: "http://localhost:3000",
            Host: "localhost:3000",
          },
        },
      ),
      { params: Promise.resolve({ id: prepared.runId }) },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/promoted live bundle metadata is invalid/i),
    });
  });

  it("does not serve root gates when promoted live metadata disappears", async () => {
    const prepared = await promoteThenDeleteLiveMetadata();

    const response = await readSiteArtifact(
      new Request(
        `http://localhost:3000/api/sites/${prepared.runId}/gates.json`,
      ),
      {
        params: Promise.resolve({
          id: prepared.runId,
          path: ["gates.json"],
        }),
      },
    );

    expect(response.status).toBe(409);
    expect(await response.text()).toMatch(/canonical live gate report invalid/i);
  });

  it("does not use root gates as an edit baseline when promoted live metadata disappears", async () => {
    const prepared = await promoteThenDeleteLiveMetadata();
    const target = path.join(prepared.roots.site, "index.html");
    let mutated = false;

    await expect(
      runGuardedMutation({
        runId: prepared.runId,
        snapshotPaths: [target],
        mutate: async () => {
          mutated = true;
          await fs.writeFile(target, "edited");
        },
        gateRunner: async () => [],
      }),
    ).rejects.toThrow(/promoted live bundle metadata is missing/i);
    expect(mutated).toBe(false);
    expect(await fs.readFile(target, "utf8")).toBe("new-live");
  });

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

  it("does not interleave a guarded site mutation with promotion", async () => {
    const prepared = await fixture();
    let releasePromotion!: () => void;
    const held = new Promise<void>((resolve) => { releasePromotion = resolve; });
    let promotionReached!: () => void;
    const reached = new Promise<void>((resolve) => { promotionReached = resolve; });
    const promotion = promoteCandidate(prepared.runId, {
      injectFault: async (step) => {
        if (step !== "after-live-replaced") return;
        promotionReached();
        await held;
      },
    });
    await reached;

    const liveIndex = path.join(prepared.roots.site, "index.html");
    let mutationSettled = false;
    let mutationEntered = false;
    const mutation = runGuardedMutation({
      runId: prepared.runId,
      snapshotPaths: [liveIndex, path.join(prepared.roots.root, "gates.json")],
      mutate: async () => {
        mutationEntered = true;
        const exactPromotedBytes = await fs.readFile(liveIndex);
        await fs.writeFile(liveIndex, exactPromotedBytes);
      },
      gateRunner: async () => [],
    }).finally(() => { mutationSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mutationSettled).toBe(false);
    expect(mutationEntered).toBe(false);
    expect(await fs.readFile(liveIndex, "utf8")).toBe("new-live");
    releasePromotion();
    await promotion;
    await mutation;
    expect(mutationEntered).toBe(true);
    expect(await candidateModule.inspectPromotedLiveBundle(prepared.runId))
      .toMatchObject({
        status: "present",
        manifest: { buildSha256: prepared.manifest.buildSha256 },
      });
  });

  it("replaces the approved visual-QA alias with its invalidation transition", async () => {
    const prepared = await fixture();

    await promoteCandidate(prepared.runId);

    const alias = JSON.parse(
      await fs.readFile(
        path.join(
          prepared.roots.root,
          workflowArtifactAliasPath("visual-qa"),
        ),
        "utf8",
      ),
    ) as {
      version: number;
      approvalTransitions: Array<{ state: string }>;
    };
    expect(alias.version).toBe(1);
    expect(alias.approvalTransitions.at(-1)?.state).toBe(
      "revision-requested",
    );
    expect(alias.approvalTransitions.at(-1)?.state).not.toBe("approved");
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
    "after-provenance-renamed",
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
    "after-provenance-renamed",
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
