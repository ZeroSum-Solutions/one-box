import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gateMocks = vi.hoisted(() => ({ runGates: vi.fn() }));

vi.mock("../../../../lib/gates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/gates")>();
  return { ...actual, runGates: gateMocks.runGates };
});

import { GET, POST } from "./route";
import { GET as EXPORT } from "./export/route";
import {
  createRun,
  artifactApprovalState,
  advanceEvidenceWorkflow,
  saveArtifact,
  saveEvidenceArtifactVersion,
  loadRun,
  candidatePaths,
  sitePaths,
  transitionEvidenceArtifactApproval,
} from "../../../../lib/runstate";
import {
  ARTIFACTS,
  CANDIDATE_GATE_EXPECTATIONS,
  CandidateGateReceiptV1Schema,
  CandidateProvenanceV1Schema,
  DesignTokensSchema,
  type HumanVisualReviewCriteria,
  type LayoutAuthority,
  IntakeSchema,
  ReferenceLockSchema,
} from "../../../../lib/contracts";
import {
  candidateManifestSha256,
  createCandidateManifest,
} from "../../../../lib/candidate";
import {
  buildCssArchitecture,
  buildTailwindPlan,
  buildTokenInventory,
  computeSiteBuildSha256,
} from "../../../../lib/evidence";
import { withSiteAuthorityLock } from "../../../../lib/siteMutation";
import { compilerPageIr } from "../../../../lib/test-fixtures/pageIrCompilerFixtures";
import {
  loadPageIrSourceBundleForReview,
  proposePageIrSourceBundle,
  transitionPageIrSourceBundleReview,
} from "../../../../lib/pageIrPipeline";

const runIds: string[] = [];

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const passingGateReports = [{
  gate: "axe",
  pass: true,
  blocking: true,
  details: [],
  ranAt: "2026-08-13T12:00:00.000Z",
}];

function humanReview(overrides: { failedCriterion?: "businessSpecificity" } = {}) {
  const criterion = (status: "pass" | "fail") =>
    status === "fail" ? { status, findings: "The page reads like a generic template." } : { status };
  const criteria: HumanVisualReviewCriteria = {
    briefFidelity: criterion("pass"),
    visualHierarchy: criterion("pass"),
    spacingAndComposition: criterion("pass"),
    businessSpecificity: criterion(overrides.failedCriterion === "businessSpecificity" ? "fail" : "pass"),
    designAndReferenceAlignment: {
      ...criterion("pass"),
      referenceContext: "design-and-references",
    },
  };
  return {
    action: "record-human-visual-review",
    reviewerName: "Devin",
    reviewerKind: "human",
    humanAttestation: true,
    criteria,
  };
}

async function fixtureRun(layoutAuthority: LayoutAuthority = "template-v1") {
  const runId = await createRun({
    layoutAuthority,
    pageIrRolloutPermitted: layoutAuthority === "page-ir-v1",
  });
  runIds.push(runId);
  await saveEvidenceArtifactVersion(runId, {
    artifactType: "ledger",
    artifact: {
      projectTarget: "website",
      businessIntelligence: {
        kind: "business-intelligence",
        competitors: [],
        marketExpectations: [],
        differentiationOpportunities: [],
        sources: [
          {
            id: "business-1",
            sourceUrl: "https://example.com",
            screenshotPaths: [],
            extractedArtifactPaths: [],
            crawlAttempts: [],
            capturedAt: "2026-08-13T12:00:00.000Z",
            confidence: 0.9,
          },
        ],
        claims: [
          {
            id: "claim-1",
            statement: "Observed source",
            classification: "observed",
            sourceIds: ["business-1"],
            confidence: 0.9,
          },
        ],
      },
      referoDesignEvidence: {
        kind: "refero-design-evidence",
        sources: [],
        references: [],
        claims: [],
      },
      clientEvidence: { sources: [], claims: [], artifactRelationships: [], unsupportedUploadIds: [] },
    },
  });
  return runId;
}

async function fixtureVisualQaRun(
  layoutAuthority: LayoutAuthority = "template-v1",
  checkStatus: "pending" | "pass" = "pass",
) {
  const runId = await fixtureRun(layoutAuthority);
  await transitionEvidenceArtifactApproval(runId, "ledger", 1, "in-review");
  await transitionEvidenceArtifactApproval(runId, "ledger", 1, "approved");
  await advanceEvidenceWorkflow(runId, "contract");
  const designTokens = DesignTokensSchema.parse({
    colors: [{ name: "Primary", value: "#123456", cssVar: "--color-primary", role: "actions" }],
    fonts: [{ family: "Inter", cssVar: "--font-body", weights: [400], role: "body" }],
    typeScale: [{ role: "body", sizePx: 16, lineHeight: 1.5, cssVar: "--text-body" }],
    radii: { sm: "4px" }, spacing: { sm: "8px" }, borders: { subtle: "1px solid #ddd" }, shadows: { raised: "0 2px 8px #0002" }, layers: { base: "0" },
    layout: { maxWidthPx: 1000, sectionGapPx: 64, cardPaddingPx: 20 }, motion: { easing: "linear", durationMs: { micro: 100, reveal: 300 }, revealClasses: [] }, componentStates: [{ component: "button", states: { default: "solid" } }],
    imageryBrief: { subject: "work", lighting: "natural", grade: "neutral", framing: "wide", avoid: [] },
  });
  const contract = await saveEvidenceArtifactVersion(runId, { artifactType: "design-contract", artifact: { title: "contract", contractPath: "DESIGN.md", sourceLedgerVersion: 1, approvedEvidenceIds: [], exportPaths: [], contractSha256: "a".repeat(64), exportSha256: "b".repeat(64), designTokens } });
  await transitionEvidenceArtifactApproval(runId, "design-contract", contract.version, "in-review");
  await transitionEvidenceArtifactApproval(runId, "design-contract", contract.version, "approved");
  await advanceEvidenceWorkflow(runId, "tokens");
  const inventoryArtifact = buildTokenInventory(designTokens, contract.version, []);
  const inventory = await saveEvidenceArtifactVersion(runId, { artifactType: "token-inventory", artifact: inventoryArtifact });
  await transitionEvidenceArtifactApproval(runId, "token-inventory", inventory.version, "in-review");
  await transitionEvidenceArtifactApproval(runId, "token-inventory", inventory.version, "approved");
  await advanceEvidenceWorkflow(runId, "tailwind");
  const planArtifact = buildTailwindPlan(inventoryArtifact, inventory.version);
  const plan = await saveEvidenceArtifactVersion(runId, { artifactType: "tailwind-plan", artifact: planArtifact });
  await transitionEvidenceArtifactApproval(runId, "tailwind-plan", plan.version, "in-review");
  await transitionEvidenceArtifactApproval(runId, "tailwind-plan", plan.version, "approved");
  await advanceEvidenceWorkflow(runId, "css");
  const css = await saveEvidenceArtifactVersion(runId, { artifactType: "css-architecture", artifact: buildCssArchitecture(inventoryArtifact, planArtifact, plan.version) });
  await transitionEvidenceArtifactApproval(runId, "css-architecture", css.version, "in-review");
  await transitionEvidenceArtifactApproval(runId, "css-architecture", css.version, "approved");
  await advanceEvidenceWorkflow(runId, "build");
  await fs.mkdir(sitePaths(runId).site, { recursive: true });
  await fs.writeFile(path.join(sitePaths(runId).site, "index.html"), "original");
  const buildSha256 = await computeSiteBuildSha256(sitePaths(runId).site);
  await saveEvidenceArtifactVersion(runId, {
    artifactType: "visual-qa",
    artifact: {
      sourceCssArchitectureVersion: css.version,
      buildSha256,
      checks: (["desktop", "tablet", "mobile", "hover", "focus", "color-scheme", "reduced-motion"] as const).map((area) => ({
        area,
        status: checkStatus,
        ...(["desktop", "tablet", "mobile"].includes(area) ? { evidencePath: `evidence/qa/v1/${area}.png` } : {}),
      })),
    },
  });
  return { runId, buildSha256 };
}

async function markLiveBundlePromoted(runId: string) {
  const roots = sitePaths(runId);
  const run = await loadRun(runId);
  const manifest = await createCandidateManifest(roots.site);
  const candidateManifestHash = candidateManifestSha256(manifest);
  const receipt = CandidateGateReceiptV1Schema.parse({
    schemaVersion: 1,
    runId,
    candidateManifestSha256: candidateManifestHash,
    buildSha256: manifest.buildSha256,
    reports: CANDIDATE_GATE_EXPECTATIONS.map(({ gate, blocking }) => ({
      gate,
      blocking,
      pass: true,
      details: [],
      ranAt: "2026-08-22T12:00:02.000Z",
    })),
  });
  const receiptBytes = Buffer.from(JSON.stringify(receipt, null, 2));
  const provenance = CandidateProvenanceV1Schema.parse({
    schemaVersion: 1,
    candidateId: `${runId}-candidate`,
    runId,
    createdAt: "2026-08-22T12:00:00.000Z",
    state: "promoted",
    history: [
      { state: "preparing", at: "2026-08-22T12:00:00.000Z" },
      { state: "ready-for-gates", at: "2026-08-22T12:00:01.000Z" },
      { state: "promotable", at: "2026-08-22T12:00:02.000Z" },
      { state: "promoted", at: "2026-08-22T12:00:03.000Z" },
    ],
    inputArtifactHashes: [{ path: "intake.json", sha256: "a".repeat(64) }],
    layoutAuthority: run.layoutAuthority,
    compilerVersion: "fixture-v1",
    ...(run.layoutAuthority === "page-ir-v1"
      ? { pageIrSha256: "c".repeat(64) }
      : {}),
    candidateManifestSha256: candidateManifestHash,
    buildSha256: manifest.buildSha256,
    gateReportSha256: sha256(receiptBytes),
    promotedBuildSha256: manifest.buildSha256,
  });
  const metadata = path.join(roots.site, ".one-box");
  await fs.mkdir(metadata);
  await Promise.all([
    fs.writeFile(
      path.join(metadata, "candidate-manifest.json"),
      JSON.stringify(manifest, null, 2),
    ),
    fs.writeFile(
      path.join(metadata, "provenance.json"),
      JSON.stringify(provenance, null, 2),
    ),
    fs.writeFile(path.join(metadata, "gates.json"), receiptBytes),
  ]);
  return provenance;
}

function pageIrSourceProposal(runId: string) {
  const pageIr = compilerPageIr();
  return {
    schemaVersion: 1 as const,
    runId,
    bundleVersion: 1,
    sources: [
      {
        kind: "layout-decision" as const,
        version: 1,
        bytes: Buffer.from(JSON.stringify({
          schemaVersion: 1,
          purpose: "brochure-local-service",
          sourceVersions: {
            evidence: 1,
            designContract: 1,
            tokenInventory: 1,
            tailwindPlan: 1,
            cssArchitecture: 1,
          },
          referenceContract: pageIr.referenceContract,
          referenceTrace: {
            mode: "selected",
            sources: [{
              alias: "style_alpha",
              sourceKind: "refero-style",
              rawReferoId: "raw/style:alpha",
              traits: ["Strong hero & proof"],
            }],
          },
          layoutProgram: pageIr.layoutProgram,
          slotBindings: pageIr.slotBindings,
          nodeTokenBindings: pageIr.nodeTokenBindings,
          accessibility: pageIr.accessibility,
        })),
      },
      {
        kind: "content" as const,
        version: 2,
        bytes: Buffer.from(JSON.stringify({
          schemaVersion: 1,
          sourceLayoutDecisionVersion: 1,
          content: pageIr.content,
          actions: pageIr.actions,
        })),
      },
      {
        kind: "assets" as const,
        version: 3,
        bytes: Buffer.from(JSON.stringify({
          schemaVersion: 1,
          sourceLayoutDecisionVersion: 1,
          assets: pageIr.assets,
        })),
      },
    ],
  };
}

async function fixturePageIrSourceBundle(
  checkStatus: "pending" | "pass" = "pass",
) {
  const { runId } = await fixtureVisualQaRun("page-ir-v1", checkStatus);
  const bundle = await proposePageIrSourceBundle(pageIrSourceProposal(runId));
  return { runId, bundle };
}

const sourceReviewCriteria = {
  layoutDecision: "pass" as const,
  content: "pass" as const,
  assets: "pass" as const,
  upstreamBindings: "pass" as const,
  sourceChain: "pass" as const,
};

async function approvePageIrSourceReview(
  runId: string,
  payloadSha256: string,
) {
  await transitionPageIrSourceBundleReview(
    runId,
    payloadSha256,
    "in-review",
    { actorKind: "human", actorName: "Devin" },
  );
  await transitionPageIrSourceBundleReview(
    runId,
    payloadSha256,
    "approved",
    {
      actorKind: "human",
      actorName: "Devin",
      humanAttestation: true,
      criteria: sourceReviewCriteria,
    },
  );
}

async function markPageIrCandidateState(
  runId: string,
  state: "ready-for-gates" | "promotable" | "failed",
) {
  const history = state === "ready-for-gates"
    ? [
        { state: "preparing" as const, at: "2026-08-23T12:00:00.000Z" },
        { state, at: "2026-08-23T12:00:01.000Z" },
      ]
    : state === "promotable"
      ? [
          { state: "preparing" as const, at: "2026-08-23T12:00:00.000Z" },
          { state: "ready-for-gates" as const, at: "2026-08-23T12:00:01.000Z" },
          { state, at: "2026-08-23T12:00:02.000Z" },
        ]
      : [
          { state: "preparing" as const, at: "2026-08-23T12:00:00.000Z" },
          { state, at: "2026-08-23T12:00:01.000Z" },
        ];
  const provenance = CandidateProvenanceV1Schema.parse({
    schemaVersion: 1,
    candidateId: `${runId}-candidate`,
    runId,
    createdAt: history[0].at,
    state,
    history,
    inputArtifactHashes: [{ path: "page-ir.json", sha256: "c".repeat(64) }],
    layoutAuthority: "page-ir-v1",
    compilerVersion: "page-ir-static@2",
    pageIrSha256: "c".repeat(64),
    ...(state === "ready-for-gates" || state === "promotable"
      ? {
          candidateManifestSha256: "d".repeat(64),
          buildSha256: "e".repeat(64),
        }
      : {}),
    ...(state === "promotable" ? { gateReportSha256: "f".repeat(64) } : {}),
  });
  const paths = candidatePaths(runId);
  await fs.mkdir(paths.root, { recursive: true });
  await fs.writeFile(paths.provenance, JSON.stringify(provenance, null, 2));
}

async function approveVisualQa(runId: string, buildSha256: string) {
  await transitionEvidenceArtifactApproval(runId, "visual-qa", 1, "in-review");
  await transitionEvidenceArtifactApproval(
    runId,
    "visual-qa",
    1,
    "approved",
    {
      humanVisualReview: {
        reviewerName: "Devin",
        reviewerKind: "human",
        humanAttestation: true,
        reviewedAt: "2026-08-22T12:00:04.000Z",
        buildSha256,
        criteria: humanReview().criteria,
      },
    },
  );
}

function context(runId: string) {
  return { params: Promise.resolve({ id: runId }) };
}

function request(runId: string, body?: unknown, origin = "http://localhost:3000") {
  return new Request(`http://localhost:3000/api/evidence/${runId}`, {
    method: body ? "POST" : "GET",
    headers: body
      ? { "Content-Type": "application/json", Origin: origin, "Sec-Fetch-Site": "same-origin", Host: "localhost:3000" }
      : { Origin: origin, Host: "localhost:3000" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

afterEach(async () => {
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true })
    )
  );
});

beforeEach(() => {
  gateMocks.runGates.mockReset();
  gateMocks.runGates.mockResolvedValue(passingGateReports);
});

describe("evidence workspace routes", () => {
  it("denies cross-origin reads and actions", async () => {
    const runId = await fixtureRun();
    expect((await GET(request(runId, undefined, "https://evil.example"), context(runId))).status).toBe(403);
    expect((await POST(request(runId, { action: "submit" }, "https://evil.example"), context(runId))).status).toBe(403);
  });

  it("rejects a non-Website action before changing evidence state", async () => {
    const runId = await fixtureRun();
    await saveArtifact(
      runId,
      ARTIFACTS.intake,
      IntakeSchema.parse({
        businessName: "Legacy App",
        category: "service",
        location: "Austin, TX",
        services: ["Help"],
        primaryAction: "quote",
        projectTarget: "ios-app",
      })
    );
    const before = await loadRun(runId);

    const response = await POST(
      request(runId, { action: "submit" }),
      context(runId)
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "unsupported-project-target",
      projectTarget: "ios-app",
    });
    expect(await loadRun(runId)).toEqual(before);
  });

  it("rejects saving an artifact type outside the current stage", async () => {
    const runId = await fixtureRun();
    await POST(request(runId, { action: "request-revision", note: "Clarify" }), context(runId));
    const response = await POST(
      request(runId, {
        action: "save-version",
        draft: {
          artifactType: "token-inventory",
          artifact: {
            sourceContractVersion: 1,
            tokens: ["color", "typography", "spacing", "radius", "border", "shadow", "breakpoint", "motion", "layer", "component-state"].map((category) => ({
              semanticName: `--outside-stage-${category}`,
              value: "1",
              usage: `${category} fixture`,
              category,
              editable: category !== "component-state",
              sourceEvidenceIds: [],
            })),
          },
        },
      }),
      context(runId)
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/requires ledger/) });
  });

  it("rejects client-authored visual QA versions before persistence", async () => {
    const runId = await fixtureRun();
    const response = await POST(
      request(runId, {
        action: "save-version",
        draft: {
          artifactType: "visual-qa",
          artifact: {
            sourceCssArchitectureVersion: 1,
            buildSha256: "0".repeat(64),
            checks: [],
          },
        },
      }),
      context(runId)
    );
    expect(response.status).toBe(400);
  });

  it("exports full versioned payloads with paths and hashes, not media bytes", async () => {
    const runId = await fixtureRun();
    const response = await EXPORT(
      new Request(`http://localhost:3000/api/evidence/${runId}/export`, {
        headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
      }),
      context(runId)
    );
    expect(response.status).toBe(200);
    const exported = await response.json();
    expect(exported.artifacts[0]).toMatchObject({
      artifactType: "ledger",
      artifactPath: "evidence/versions/ledger/v1.json",
      currentAliasPath: "evidence/approved/ledger.json",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      payload: {
        businessIntelligence: {
          sources: [{ sourceUrl: "https://example.com" }],
        },
      },
    });
    expect(JSON.stringify(exported)).not.toContain("data:image");
  });

  it("blocks export when a promoted bundle has only a stale visual approval", async () => {
    const { runId, buildSha256 } = await fixtureVisualQaRun();
    await approveVisualQa(runId, buildSha256);
    await fs.writeFile(path.join(sitePaths(runId).site, "index.html"), "promoted");
    await markLiveBundlePromoted(runId);
    await fs.writeFile(
      path.join(sitePaths(runId).root, "gates.json"),
      JSON.stringify([{ gate: "opposite-root-copy", pass: true }]),
    );

    const response = await EXPORT(
      new Request(`http://localhost:3000/api/evidence/${runId}/export`, {
        headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
      }),
      context(runId),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/current promoted build.*visual approval/i),
    });
  });

  it("blocks export when a promoted bundle has no effective visual approval", async () => {
    const { runId } = await fixtureVisualQaRun();
    await markLiveBundlePromoted(runId);

    const response = await EXPORT(
      new Request(`http://localhost:3000/api/evidence/${runId}/export`, {
        headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
      }),
      context(runId),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/current promoted build.*visual approval/i),
    });
  });

  it("blocks export when canonical live metadata is corrupt even if root gates pass", async () => {
    const { runId, buildSha256 } = await fixtureVisualQaRun();
    await markLiveBundlePromoted(runId);
    await approveVisualQa(runId, buildSha256);
    await fs.writeFile(
      path.join(sitePaths(runId).site, ".one-box", "gates.json"),
      JSON.stringify({ corrupt: true }),
    );
    await fs.writeFile(
      path.join(sitePaths(runId).root, "gates.json"),
      JSON.stringify([{ gate: "root-only", blocking: true, pass: true }]),
    );

    const response = await EXPORT(
      new Request(`http://localhost:3000/api/evidence/${runId}/export`, {
        headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
      }),
      context(runId),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/live bundle metadata is invalid/i),
    });
  });

  it("exports a promoted bundle only after a human review bound to its hash", async () => {
    const { runId, buildSha256 } = await fixtureVisualQaRun();
    const promoted = await markLiveBundlePromoted(runId);
    expect(promoted.promotedBuildSha256).toBe(buildSha256);
    await approveVisualQa(runId, buildSha256);
    await fs.writeFile(
      path.join(sitePaths(runId).root, "gates.json"),
      JSON.stringify([{ gate: "opposite-root-copy", pass: false }]),
    );

    const response = await EXPORT(
      new Request(`http://localhost:3000/api/evidence/${runId}/export`, {
        headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
      }),
      context(runId),
    );

    expect(response.status).toBe(200);
  });

  it("regenerates, approves, and exports an immutable contract revision", async () => {
    const runId = await fixtureRun();
    const intake = IntakeSchema.parse({ businessName: "Revision Co", category: "service", location: "Austin, TX", services: ["Help"], primaryAction: "quote" });
    const lock = ReferenceLockSchema.parse({ searchAngles: ["a", "b", "c"], primary: { referoId: "r1", kind: "style", name: "Reference", why: "Clear" }, borrowedDetails: [], rejected: [], decisionLedger: [] });
    await saveArtifact(runId, ARTIFACTS.intake, intake);
    await saveArtifact(runId, ARTIFACTS.lock, lock);
    await transitionEvidenceArtifactApproval(runId, "ledger", 1, "in-review");
    await transitionEvidenceArtifactApproval(runId, "ledger", 1, "approved");
    await advanceEvidenceWorkflow(runId, "contract");
    const designTokens = DesignTokensSchema.parse({
      colors: [{ name: "Primary", value: "#123456", cssVar: "--color-primary", role: "actions" }, { name: "Surface", value: "#ffffff", cssVar: "--color-surface", role: "background" }],
      fonts: [{ family: "Inter", cssVar: "--font-body", weights: [400, 600], role: "body" }],
      typeScale: [{ role: "body", sizePx: 16, lineHeight: 1.5, cssVar: "--text-body" }],
      radii: { sm: "4px" }, spacing: { sm: "8px" }, borders: { subtle: "1px solid #ddd" }, shadows: { raised: "0 2px 8px #0002" }, layers: { base: "0" },
      layout: { maxWidthPx: 1000, sectionGapPx: 64, cardPaddingPx: 20 }, motion: { easing: "linear", durationMs: { micro: 100, reveal: 300 }, revealClasses: [] }, componentStates: [],
      imageryBrief: { subject: "work", lighting: "natural", grade: "neutral", framing: "wide", avoid: [] },
    });
    const v1Path = "evidence/versions/design-contract/v1.DESIGN.md";
    await saveArtifact(runId, v1Path, "v1", true);
    const v1 = await saveEvidenceArtifactVersion(runId, { artifactType: "design-contract", artifact: { title: "v1", contractPath: v1Path, sourceLedgerVersion: 1, approvedEvidenceIds: [], exportPaths: [], contractSha256: "a".repeat(64), exportSha256: "b".repeat(64), designTokens } });
    await transitionEvidenceArtifactApproval(runId, "design-contract", v1.version, "revision-requested");

    const saveResponse = await POST(request(runId, { action: "save-version", draft: { artifactType: "design-contract", artifact: { title: "v2", contractPath: "ignored", sourceLedgerVersion: 1, designTokens } } }), context(runId));
    expect(saveResponse.status).toBe(200);
    await POST(request(runId, { action: "submit" }), context(runId));
    const approveResponse = await POST(request(runId, { action: "approve" }), context(runId));
    expect(approveResponse.status).toBe(200);
    const versioned = await fs.readFile(path.join(sitePaths(runId).root, "evidence/versions/design-contract/v2.DESIGN.md"), "utf8");
    expect(await fs.readFile(path.join(sitePaths(runId).root, ARTIFACTS.designMd), "utf8")).toBe(versioned);
    const exported = await (await EXPORT(new Request(`http://localhost:3000/api/evidence/${runId}/export`, { headers: { Origin: "http://localhost:3000", Host: "localhost:3000" } }), context(runId))).json();
    expect(exported.artifacts.find((artifact: { artifactType: string; version: number }) => artifact.artifactType === "design-contract" && artifact.version === 2).artifactPath).toBe("evidence/versions/design-contract/v2.json");
  }, 30_000);

  it("serializes conflicting contract revisions and leaves no orphan version", async () => {
    const runId = await fixtureRun();
    const intake = IntakeSchema.parse({ businessName: "Conflict Co", category: "service", location: "Austin, TX", services: ["Help"], primaryAction: "quote" });
    const lock = ReferenceLockSchema.parse({ searchAngles: ["a", "b", "c"], primary: { referoId: "r1", kind: "style", name: "Reference", why: "Clear" }, borrowedDetails: [], rejected: [], decisionLedger: [] });
    await saveArtifact(runId, ARTIFACTS.intake, intake);
    await saveArtifact(runId, ARTIFACTS.lock, lock);
    await transitionEvidenceArtifactApproval(runId, "ledger", 1, "in-review");
    await transitionEvidenceArtifactApproval(runId, "ledger", 1, "approved");
    await advanceEvidenceWorkflow(runId, "contract");
    const designTokens = DesignTokensSchema.parse({
      colors: [{ name: "Primary", value: "#123456", cssVar: "--color-primary", role: "actions" }, { name: "Surface", value: "#ffffff", cssVar: "--color-surface", role: "background" }],
      fonts: [{ family: "Inter", cssVar: "--font-body", weights: [400], role: "body" }],
      typeScale: [{ role: "body", sizePx: 16, lineHeight: 1.5, cssVar: "--text-body" }],
      radii: { sm: "4px" }, spacing: { sm: "8px" }, borders: { subtle: "1px solid #ddd" }, shadows: { raised: "0 2px 8px #0002" }, layers: { base: "0" },
      layout: { maxWidthPx: 1000, sectionGapPx: 64, cardPaddingPx: 20 }, motion: { easing: "linear", durationMs: { micro: 100, reveal: 300 }, revealClasses: [] }, componentStates: [{ component: "button", states: { default: "solid" } }],
      imageryBrief: { subject: "work", lighting: "natural", grade: "neutral", framing: "wide", avoid: [] },
    });
    await saveArtifact(runId, "evidence/versions/design-contract/v1.DESIGN.md", "v1", true);
    const first = await saveEvidenceArtifactVersion(runId, { artifactType: "design-contract", artifact: { title: "v1", contractPath: "evidence/versions/design-contract/v1.DESIGN.md", sourceLedgerVersion: 1, approvedEvidenceIds: [], exportPaths: [], contractSha256: "a".repeat(64), exportSha256: "b".repeat(64), designTokens } });
    await transitionEvidenceArtifactApproval(runId, "design-contract", first.version, "revision-requested");
    const draft = {
      action: "save-version",
      draft: {
        artifactType: "design-contract",
        artifact: {
          title: "v2",
          contractPath: "ignored",
          sourceLedgerVersion: 1,
          designTokens,
        },
      },
    };
    const responses = await Promise.all([
      POST(request(runId, draft), context(runId)),
      POST(request(runId, draft), context(runId)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const versions = await fs.readdir(path.join(sitePaths(runId).root, "evidence/versions/design-contract"));
    expect(versions.sort()).toEqual(["v1.DESIGN.md", "v1.json", "v2.DESIGN.md", "v2.json", "v2.tailwind.css"]);
  }, 30_000);

  it("approves visual QA only through a named human review after rerunning the full mechanical gates", async () => {
    const { runId, buildSha256 } = await fixtureVisualQaRun();
    await POST(request(runId, { action: "submit" }), context(runId));

    const genericApproval = await POST(request(runId, { action: "approve" }), context(runId));
    expect(genericApproval.status).toBe(409);
    expect(await genericApproval.json()).toMatchObject({
      error: expect.stringMatching(/structured named human visual review/i),
    });

    const wrongReferenceBasis = humanReview();
    wrongReferenceBasis.criteria.designAndReferenceAlignment.referenceContext = "explicit-no-reference";
    const referenceResponse = await POST(request(runId, wrongReferenceBasis), context(runId));
    expect(referenceResponse.status).toBe(409);
    expect(await referenceResponse.json()).toMatchObject({
      error: expect.stringMatching(/selected design\/reference evidence/i),
    });

    const response = await POST(request(runId, humanReview()), context(runId));
    expect(response.status).toBe(200);
    expect(gateMocks.runGates).toHaveBeenCalledWith(runId, {});
    const run = await loadRun(runId);
    const qa = run.evidenceWorkflow.artifacts.at(-1)!;
    expect(artifactApprovalState(qa)).toBe("approved");
    expect(qa.approvalTransitions.at(-1)).toMatchObject({
      actor: "human-reviewer",
      humanVisualReview: {
        reviewerName: "Devin",
        reviewerKind: "human",
        humanAttestation: true,
        buildSha256,
      },
    });
  });

  it("uses the user's disabled design-research choice as the truthful human-review basis", async () => {
    const { runId } = await fixtureVisualQaRun();
    await saveArtifact(
      runId,
      ARTIFACTS.intake,
      IntakeSchema.parse({
        businessName: "No Reference Co",
        category: "service",
        location: "Austin, TX",
        services: ["Help"],
        primaryAction: "quote",
        research: {
          enabled: true,
          businessIntelligence: true,
          referoDesignEvidence: false,
          allowPaidFirecrawlFallback: false,
        },
      })
    );
    await saveArtifact(
      runId,
      ARTIFACTS.lock,
      ReferenceLockSchema.parse({
        searchAngles: ["disabled one", "disabled two", "disabled three"],
        primary: {
          referoId: "research-disabled",
          kind: "style",
          name: "No design reference (disabled)",
          why: "The user disabled Refero design research for this run.",
        },
        borrowedDetails: [],
        rejected: [],
        decisionLedger: [],
      })
    );
    await POST(request(runId, { action: "submit" }), context(runId));

    const wrongBasis = await POST(
      request(runId, humanReview()),
      context(runId)
    );
    expect(wrongBasis.status).toBe(409);
    await expect(wrongBasis.json()).resolves.toMatchObject({
      error: expect.stringMatching(/no external reference was selected/i),
    });

    const truthfulReview = humanReview();
    truthfulReview.criteria.designAndReferenceAlignment.referenceContext =
      "explicit-no-reference";
    const accepted = await POST(
      request(runId, truthfulReview),
      context(runId)
    );
    expect(accepted.status).toBe(200);
  });

  it("keeps mechanical failures separate and refuses human approval while a blocking gate fails", async () => {
    const { runId } = await fixtureVisualQaRun();
    await POST(request(runId, { action: "submit" }), context(runId));
    gateMocks.runGates.mockResolvedValueOnce([{
      gate: "axe",
      pass: false,
      blocking: true,
      details: ["contrast regression"],
      ranAt: "2026-08-13T12:00:00.000Z",
    }]);

    const response = await POST(request(runId, humanReview()), context(runId));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/mechanical gates.*axe/i),
    });
    const qa = (await loadRun(runId)).evidenceWorkflow.artifacts.at(-1)!;
    expect(artifactApprovalState(qa)).toBe("in-review");
    expect(qa.approvalTransitions.at(-1)).not.toHaveProperty("humanVisualReview");
  });

  it("turns a failed human criterion into revision-required findings and requires a changed build", async () => {
    const { runId, buildSha256 } = await fixtureVisualQaRun();
    await POST(request(runId, { action: "submit" }), context(runId));

    const genericRejection = await POST(
      request(runId, { action: "request-revision", note: "Too generic" }),
      context(runId)
    );
    expect(genericRejection.status).toBe(409);
    expect(await genericRejection.json()).toMatchObject({
      error: expect.stringMatching(/structured named human visual review/i),
    });
    expect(
      artifactApprovalState((await loadRun(runId)).evidenceWorkflow.artifacts.at(-1)!)
    ).toBe("in-review");

    const rejected = await POST(
      request(runId, humanReview({ failedCriterion: "businessSpecificity" })),
      context(runId)
    );
    expect(rejected.status).toBe(200);
    let qa = (await loadRun(runId)).evidenceWorkflow.artifacts.at(-1)!;
    expect(artifactApprovalState(qa)).toBe("revision-requested");
    expect(qa.approvalTransitions.at(-1)).toMatchObject({
      humanVisualReview: {
        buildSha256,
        criteria: {
          businessSpecificity: {
            status: "fail",
            findings: "The page reads like a generic template.",
          },
        },
      },
    });

    const unchanged = await POST(
      request(runId, { action: "regenerate-visual-qa" }),
      context(runId)
    );
    expect(unchanged.status).toBe(409);
    expect(await unchanged.json()).toMatchObject({
      error: expect.stringMatching(/build must change after a human rejection/i),
    });

    await fs.writeFile(path.join(sitePaths(runId).site, "index.html"), "meaningful revision");
    const regenerated = await POST(
      request(runId, { action: "regenerate-visual-qa" }),
      context(runId)
    );
    expect(regenerated.status).toBe(200);
    qa = (await loadRun(runId)).evidenceWorkflow.artifacts.at(-1)!;
    expect(qa.version).toBe(2);
    expect(qa.artifactType === "visual-qa" && qa.artifact.buildSha256).not.toBe(buildSha256);
  }, 60_000);

  it("requires changed site bytes before regenerating a revision-requested historical visual QA without a human review", async () => {
    const { runId } = await fixtureVisualQaRun();
    await transitionEvidenceArtifactApproval(
      runId,
      "visual-qa",
      1,
      "revision-requested",
      { actor: "historical-import", note: "Persisted before structured human review" }
    );

    const response = await POST(
      request(runId, { action: "regenerate-visual-qa" }),
      context(runId)
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/build must change/i),
    });
    const qa = (await loadRun(runId)).evidenceWorkflow.artifacts.at(-1)!;
    expect(artifactApprovalState(qa)).toBe("revision-requested");
    expect(qa.version).toBe(1);
  });

  it("rejects approval when the generated site changes after server QA", async () => {
    const { runId } = await fixtureVisualQaRun();
    await POST(request(runId, { action: "submit" }), context(runId));
    let releaseEdit!: () => void;
    let editStarted!: () => void;
    const started = new Promise<void>((resolve) => { editStarted = resolve; });
    const release = new Promise<void>((resolve) => { releaseEdit = resolve; });
    const edit = withSiteAuthorityLock(runId, async () => {
      await fs.writeFile(path.join(sitePaths(runId).site, "index.html"), "tampered");
      editStarted();
      await release;
    });
    await started;
    const approval = POST(request(runId, humanReview()), context(runId));
    releaseEdit();
    await edit;
    const response = await approval;
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "visual QA does not match the current build" });
    const retainedV1 = path.join(sitePaths(runId).root, "evidence/qa/v1/desktop.png");
    await fs.mkdir(path.dirname(retainedV1), { recursive: true });
    await fs.writeFile(retainedV1, "v1 evidence");
    await transitionEvidenceArtifactApproval(
      runId,
      "visual-qa",
      1,
      "revision-requested",
      { actor: "site-integrity", note: "Detected a build-hash mismatch" }
    );
    const concurrent = await Promise.all([
      POST(request(runId, { action: "regenerate-visual-qa" }), context(runId)),
      POST(request(runId, { action: "regenerate-visual-qa" }), context(runId)),
    ]);
    expect(concurrent.map((candidate) => candidate.status).sort()).toEqual([200, 409]);
    const regenerated = concurrent.find((candidate) => candidate.status === 200)!;
    expect(regenerated.status).toBe(200);
    const payload = await regenerated.json();
    const versions = payload.workflow.artifacts.filter((artifact: { artifactType: string }) => artifact.artifactType === "visual-qa");
    expect(versions).toHaveLength(2);
    expect(versions[0].approvalTransitions.at(-1).state).toBe("superseded");
    expect(versions[1]).toMatchObject({ version: 2, revisionOf: 1 });
    expect(versions[1].artifact.checks.find((check: { area: string }) => check.area === "desktop").evidencePath).toContain("evidence/qa/v2/");
    expect(await fs.readFile(retainedV1, "utf8")).toBe("v1 evidence");
    await transitionEvidenceArtifactApproval(
      runId,
      "visual-qa",
      2,
      "revision-requested",
      { actor: "site-integrity", note: "Exercise transactional failure recovery" }
    );
    await fs.writeFile(path.join(sitePaths(runId).site, "index.html"), "third build revision");
    const aliasPath = path.join(sitePaths(runId).root, ARTIFACTS.visualQa);
    const aliasBeforeFailure = await fs.readFile(aliasPath);
    const blockedTarget = path.join(sitePaths(runId).root, "evidence/qa/v3/tablet-768.png");
    await fs.mkdir(blockedTarget, { recursive: true });
    await expect(
      POST(request(runId, { action: "regenerate-visual-qa" }), context(runId))
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(sitePaths(runId).root, "evidence/qa/v3/desktop-1440.png"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.access(path.join(sitePaths(runId).root, "evidence/qa/v3/mobile-390.png"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.access(path.join(sitePaths(runId).root, "evidence/versions/visual-qa/v3.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(aliasPath)).toEqual(aliasBeforeFailure);
    const afterFailure = await loadRun(runId);
    const qaVersions = afterFailure.evidenceWorkflow.artifacts.filter((artifact) => artifact.artifactType === "visual-qa");
    expect(qaVersions).toHaveLength(2);
    expect(artifactApprovalState(qaVersions[1])).toBe("revision-requested");
    expect((await fs.readdir(path.join(sitePaths(runId).root, "evidence"))).some((entry) => entry.startsWith(".qa-stage-"))).toBe(false);
  }, 60_000);
});

describe("PageIR Source Bundle evidence API", () => {
  it("keeps the template response additive and Source-Bundle-free", async () => {
    const runId = await fixtureRun();

    const response = await GET(request(runId), context(runId));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId,
      layoutAuthority: "template-v1",
      pageIrSourceReview: null,
      previewUrl: null,
    });
  });

  it("projects the exact immutable hash, bindings, and three validated source values", async () => {
    const { runId, bundle } = await fixturePageIrSourceBundle();
    const validated = await loadPageIrSourceBundleForReview(runId);

    const response = await GET(request(runId), context(runId));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      layoutAuthority: "page-ir-v1",
      pageIrSourceReview: {
        schemaVersion: 1,
        bundleVersion: 1,
        payloadSha256: bundle.payloadSha256,
        state: "draft",
        upstreamBindings: bundle.upstreamBindings,
        sources: {
          layoutDecision: {
            version: 1,
            sha256: bundle.sourceArtifacts[0].sha256,
            value: validated.sources.layoutDecision,
          },
          content: {
            version: 2,
            sha256: bundle.sourceArtifacts[1].sha256,
            value: validated.sources.content,
          },
          assets: {
            version: 3,
            sha256: bundle.sourceArtifacts[2].sha256,
            value: validated.sources.assets,
          },
        },
      },
    });
    expect(JSON.stringify(payload.pageIrSourceReview)).not.toMatch(/page-ir-sources|\.json"/);
  });

  it("strictly rejects invalid begin-review identity, binding, authority, and state", async () => {
    const { runId, bundle } = await fixturePageIrSourceBundle();
    const invalidBodies = [
      {
        action: "begin-page-ir-source-bundle-review",
        payloadSha256: bundle.payloadSha256,
        reviewerName: " ",
      },
      {
        action: "begin-page-ir-source-bundle-review",
        payloadSha256: bundle.payloadSha256,
        reviewerName: "Devin",
        actorKind: "model",
      },
    ];
    for (const body of invalidBodies) {
      expect((await POST(request(runId, body), context(runId))).status).toBe(400);
    }
    expect((await POST(request(runId, {
      action: "begin-page-ir-source-bundle-review",
      payloadSha256: "f".repeat(64),
      reviewerName: "Devin",
    }), context(runId))).status).toBe(409);

    const templateRun = await fixtureVisualQaRun();
    expect((await POST(request(templateRun.runId, {
      action: "begin-page-ir-source-bundle-review",
      payloadSha256: bundle.payloadSha256,
      reviewerName: "Devin",
    }), context(templateRun.runId))).status).toBe(409);

    expect((await POST(request(runId, {
      action: "begin-page-ir-source-bundle-review",
      payloadSha256: bundle.payloadSha256,
      reviewerName: "Devin",
    }), context(runId))).status).toBe(200);
    expect((await POST(request(runId, {
      action: "begin-page-ir-source-bundle-review",
      payloadSha256: bundle.payloadSha256,
      reviewerName: "Devin",
    }), context(runId))).status).toBe(409);
  });

  it("requires a literal attestation, exact all-pass criteria, displayed hash, and in-review state", async () => {
    const { runId, bundle } = await fixturePageIrSourceBundle();
    const approve = (overrides: Record<string, unknown> = {}) => ({
      action: "approve-page-ir-source-bundle",
      payloadSha256: bundle.payloadSha256,
      reviewerName: "Devin",
      humanAttestation: true,
      criteria: sourceReviewCriteria,
      ...overrides,
    });

    for (const body of [
      approve({ humanAttestation: undefined }),
      approve({ humanAttestation: false }),
      approve({ criteria: { ...sourceReviewCriteria, sourceChain: undefined } }),
      approve({ criteria: { ...sourceReviewCriteria, extra: "pass" } }),
      approve({ actorKind: "system" }),
    ]) {
      expect((await POST(request(runId, body), context(runId))).status).toBe(400);
    }
    expect((await POST(request(runId, approve()), context(runId))).status).toBe(409);

    await POST(request(runId, {
      action: "begin-page-ir-source-bundle-review",
      payloadSha256: bundle.payloadSha256,
      reviewerName: "Devin",
    }), context(runId));
    expect((await POST(request(runId, approve({ payloadSha256: "f".repeat(64) })), context(runId))).status).toBe(409);
  });

  it("never routes generic approval into Source Bundle history", async () => {
    const { runId } = await fixturePageIrSourceBundle();
    const before = await loadPageIrSourceBundleForReview(runId);

    await POST(request(runId, { action: "approve" }), context(runId));

    const after = await loadPageIrSourceBundleForReview(runId);
    expect(after.bundle.reviewTransitions).toEqual(before.bundle.reviewTransitions);
  });

  it("records exactly one named-human approval bound to the displayed hash", async () => {
    const { runId, bundle } = await fixturePageIrSourceBundle();
    await POST(request(runId, {
      action: "begin-page-ir-source-bundle-review",
      payloadSha256: bundle.payloadSha256,
      reviewerName: "Devin",
    }), context(runId));

    const response = await POST(request(runId, {
      action: "approve-page-ir-source-bundle",
      payloadSha256: bundle.payloadSha256,
      reviewerName: "Devin",
      humanAttestation: true,
      criteria: sourceReviewCriteria,
    }), context(runId));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pageIrSourceReview).toMatchObject({
      state: "approved",
      humanReview: {
        reviewerName: "Devin",
        payloadSha256: bundle.payloadSha256,
        criteria: sourceReviewCriteria,
      },
    });
    const persisted = await loadPageIrSourceBundleForReview(runId);
    expect(persisted.bundle.reviewTransitions.filter((item) => item.humanReview)).toHaveLength(1);
    expect(persisted.bundle.reviewTransitions.at(-1)).toMatchObject({
      actorKind: "human",
      actorName: "Devin",
      humanReview: {
        humanAttestation: true,
        payloadSha256: bundle.payloadSha256,
      },
    });
  });

  it("requires a named reviewer and note for terminal rejection", async () => {
    const { runId, bundle } = await fixturePageIrSourceBundle();
    for (const body of [
      {
        action: "reject-page-ir-source-bundle",
        payloadSha256: bundle.payloadSha256,
        reviewerName: "",
        note: "Wrong sources",
      },
      {
        action: "reject-page-ir-source-bundle",
        payloadSha256: bundle.payloadSha256,
        reviewerName: "Devin",
        note: " ",
      },
    ]) {
      expect((await POST(request(runId, body), context(runId))).status).toBe(400);
    }
    const response = await POST(request(runId, {
      action: "reject-page-ir-source-bundle",
      payloadSha256: bundle.payloadSha256,
      reviewerName: "Devin",
      note: "The content source is incorrect.",
    }), context(runId));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      pageIrSourceReview: {
        state: "rejected",
        latestTransition: {
          actorKind: "human",
          actorName: "Devin",
          note: "The content source is incorrect.",
        },
      },
    });
  });

  it("never advertises ready, promotable, or failed PageIR candidates as previewable", async () => {
    for (const state of ["ready-for-gates", "promotable", "failed"] as const) {
      const { runId } = await fixturePageIrSourceBundle();
      await markPageIrCandidateState(runId, state);
      const response = await GET(request(runId), context(runId));
      await expect(response.json()).resolves.toMatchObject({ previewUrl: null });
    }
  });

  it("advertises only canonical promoted PageIR live and fails closed on corrupt metadata", async () => {
    const { runId } = await fixturePageIrSourceBundle();
    await markLiveBundlePromoted(runId);

    const promoted = await GET(request(runId), context(runId));
    await expect(promoted.json()).resolves.toMatchObject({
      previewUrl: `/preview/${runId}`,
      currentApprovalState: "draft",
    });

    await fs.writeFile(
      path.join(sitePaths(runId).site, ".one-box", "provenance.json"),
      "{}",
    );
    const corrupt = await GET(request(runId), context(runId));
    expect(corrupt.status).toBe(200);
    await expect(corrupt.json()).resolves.toMatchObject({ previewUrl: null });
  });

  it("rejects direct submission of the pending PageIR visual-QA placeholder without changing history", async () => {
    const { runId, bundle } = await fixturePageIrSourceBundle("pending");
    await approvePageIrSourceReview(runId, bundle.payloadSha256);
    await markLiveBundlePromoted(runId);
    const before = (await loadRun(runId)).evidenceWorkflow.artifacts.at(-1)!;

    const response = await POST(
      request(runId, { action: "submit" }),
      context(runId),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/pending|real visual QA/i),
    });
    const after = (await loadRun(runId)).evidenceWorkflow.artifacts.at(-1)!;
    expect(after.approvalTransitions).toEqual(before.approvalTransitions);
    expect(artifactApprovalState(after)).toBe("draft");
  });

  it("rejects PageIR visual-QA submission without current source approval or exact canonical live", async () => {
    const scenarios = [
      {
        name: "unapproved source",
        prepare: async () => {
          const fixture = await fixturePageIrSourceBundle();
          await markLiveBundlePromoted(fixture.runId);
          return fixture;
        },
        error: /approved Source Bundle/i,
      },
      {
        name: "absent promoted live",
        prepare: async () => {
          const fixture = await fixturePageIrSourceBundle();
          await approvePageIrSourceReview(fixture.runId, fixture.bundle.payloadSha256);
          return fixture;
        },
        error: /canonical promoted live/i,
      },
      {
        name: "corrupt promoted live",
        prepare: async () => {
          const fixture = await fixturePageIrSourceBundle();
          await approvePageIrSourceReview(fixture.runId, fixture.bundle.payloadSha256);
          await markLiveBundlePromoted(fixture.runId);
          await fs.writeFile(
            path.join(sitePaths(fixture.runId).site, ".one-box", "provenance.json"),
            "{}",
          );
          return fixture;
        },
        error: /canonical promoted live/i,
      },
      {
        name: "mismatched promoted live",
        prepare: async () => {
          const fixture = await fixturePageIrSourceBundle();
          await approvePageIrSourceReview(fixture.runId, fixture.bundle.payloadSha256);
          await fs.writeFile(
            path.join(sitePaths(fixture.runId).site, "index.html"),
            "different promoted build",
          );
          await markLiveBundlePromoted(fixture.runId);
          return fixture;
        },
        error: /promoted live.*visual QA|visual QA.*promoted live/i,
      },
    ];

    for (const scenario of scenarios) {
      const { runId } = await scenario.prepare();
      const before = (await loadRun(runId)).evidenceWorkflow.artifacts.at(-1)!;

      const response = await POST(
        request(runId, { action: "submit" }),
        context(runId),
      );

      expect(response.status, scenario.name).toBe(409);
      expect(await response.json(), scenario.name).toMatchObject({
        error: expect.stringMatching(scenario.error),
      });
      const after = (await loadRun(runId)).evidenceWorkflow.artifacts.at(-1)!;
      expect(after.approvalTransitions, scenario.name).toEqual(
        before.approvalTransitions,
      );
    }
  });

  it("enforces PageIR source, real-QA, and promoted-live authority inside human review", async () => {
    const fixtures = [
      {
        name: "unapproved source",
        create: async () => {
          const fixture = await fixturePageIrSourceBundle();
          await markLiveBundlePromoted(fixture.runId);
          return fixture;
        },
        error: /approved Source Bundle/i,
      },
      {
        name: "pending QA",
        create: async () => {
          const fixture = await fixturePageIrSourceBundle("pending");
          await approvePageIrSourceReview(fixture.runId, fixture.bundle.payloadSha256);
          await markLiveBundlePromoted(fixture.runId);
          return fixture;
        },
        error: /pending|real visual QA/i,
      },
      {
        name: "absent promoted live",
        create: async () => {
          const fixture = await fixturePageIrSourceBundle();
          await approvePageIrSourceReview(fixture.runId, fixture.bundle.payloadSha256);
          return fixture;
        },
        error: /canonical promoted live/i,
      },
      {
        name: "corrupt promoted live",
        create: async () => {
          const fixture = await fixturePageIrSourceBundle();
          await approvePageIrSourceReview(fixture.runId, fixture.bundle.payloadSha256);
          await markLiveBundlePromoted(fixture.runId);
          await fs.writeFile(
            path.join(sitePaths(fixture.runId).site, ".one-box", "provenance.json"),
            "{}",
          );
          return fixture;
        },
        error: /canonical promoted live/i,
      },
      {
        name: "mismatched promoted live",
        create: async () => {
          const fixture = await fixturePageIrSourceBundle();
          await approvePageIrSourceReview(fixture.runId, fixture.bundle.payloadSha256);
          await fs.writeFile(
            path.join(sitePaths(fixture.runId).site, "index.html"),
            "different promoted build",
          );
          await markLiveBundlePromoted(fixture.runId);
          return fixture;
        },
        error: /promoted live.*visual QA|visual QA.*promoted live/i,
      },
    ];

    for (const fixtureCase of fixtures) {
      const { runId } = await fixtureCase.create();
      await transitionEvidenceArtifactApproval(runId, "visual-qa", 1, "in-review");
      const before = (await loadRun(runId)).evidenceWorkflow.artifacts.at(-1)!;

      const response = await POST(
        request(runId, humanReview()),
        context(runId),
      );

      expect(response.status, fixtureCase.name).toBe(409);
      expect(await response.json(), fixtureCase.name).toMatchObject({
        error: expect.stringMatching(fixtureCase.error),
      });
      const after = (await loadRun(runId)).evidenceWorkflow.artifacts.at(-1)!;
      expect(after.approvalTransitions, fixtureCase.name).toEqual(
        before.approvalTransitions,
      );
      expect(artifactApprovalState(after), fixtureCase.name).toBe("in-review");
    }
  });

  it("accepts exact real PageIR visual QA only after source approval and canonical promotion", async () => {
    const { runId, bundle } = await fixturePageIrSourceBundle();
    await approvePageIrSourceReview(runId, bundle.payloadSha256);
    await markLiveBundlePromoted(runId);

    const submitted = await POST(
      request(runId, { action: "submit" }),
      context(runId),
    );
    expect(submitted.status).toBe(200);
    await expect(submitted.json()).resolves.toMatchObject({
      currentApprovalState: "in-review",
    });

    const approved = await POST(
      request(runId, humanReview()),
      context(runId),
    );
    expect(approved.status).toBe(200);
    await expect(approved.json()).resolves.toMatchObject({
      currentApprovalState: "approved",
    });
    const current = (await loadRun(runId)).evidenceWorkflow.artifacts.at(-1)!;
    expect(current.approvalTransitions.at(-1)).toMatchObject({
      state: "approved",
      humanVisualReview: {
        reviewerName: "Devin",
        humanAttestation: true,
        buildSha256: current.artifactType === "visual-qa"
          ? current.artifact.buildSha256
          : undefined,
      },
    });
  });

  it("preserves template visual-QA submission without Source Bundle or promotion", async () => {
    const { runId } = await fixtureVisualQaRun("template-v1", "pending");

    const response = await POST(
      request(runId, { action: "submit" }),
      context(runId),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      layoutAuthority: "template-v1",
      pageIrSourceReview: null,
      currentApprovalState: "in-review",
    });
  });
});
