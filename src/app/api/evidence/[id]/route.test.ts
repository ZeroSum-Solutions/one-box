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
  sitePaths,
  transitionEvidenceArtifactApproval,
} from "../../../../lib/runstate";
import { ARTIFACTS, DesignTokensSchema, IntakeSchema, ReferenceLockSchema } from "../../../../lib/contracts";
import {
  buildCssArchitecture,
  buildTailwindPlan,
  buildTokenInventory,
  computeSiteBuildSha256,
} from "../../../../lib/evidence";
import { withSiteAuthorityLock } from "../../../../lib/siteMutation";

const runIds: string[] = [];

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
  return {
    action: "record-human-visual-review",
    reviewerName: "Devin",
    reviewerKind: "human",
    humanAttestation: true,
    criteria: {
      briefFidelity: criterion("pass"),
      visualHierarchy: criterion("pass"),
      spacingAndComposition: criterion("pass"),
      businessSpecificity: criterion(overrides.failedCriterion === "businessSpecificity" ? "fail" : "pass"),
      designAndReferenceAlignment: {
        ...criterion("pass"),
        referenceContext: "design-and-references",
      },
    },
  };
}

async function fixtureRun() {
  const runId = await createRun();
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

async function fixtureVisualQaRun() {
  const runId = await fixtureRun();
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
        status: "pass",
        ...(["desktop", "tablet", "mobile"].includes(area) ? { evidencePath: `evidence/qa/v1/${area}.png` } : {}),
      })),
    },
  });
  return { runId, buildSha256 };
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
