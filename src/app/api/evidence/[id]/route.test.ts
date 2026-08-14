import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

function context(runId: string) {
  return { params: Promise.resolve({ id: runId }) };
}

function request(runId: string, body?: unknown, origin = "http://localhost:3000") {
  return new Request(`http://localhost:3000/api/evidence/${runId}`, {
    method: body ? "POST" : "GET",
    headers: body
      ? { "Content-Type": "application/json", Origin: origin, "Sec-Fetch-Site": "same-origin" }
      : { Origin: origin },
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

describe("evidence workspace routes", () => {
  it("denies cross-origin reads and actions", async () => {
    const runId = await fixtureRun();
    expect((await GET(request(runId, undefined, "https://evil.example"), context(runId))).status).toBe(403);
    expect((await POST(request(runId, { action: "submit" }, "https://evil.example"), context(runId))).status).toBe(403);
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
        headers: { Origin: "http://localhost:3000" },
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
    const exported = await (await EXPORT(new Request(`http://localhost:3000/api/evidence/${runId}/export`, { headers: { Origin: "http://localhost:3000" } }), context(runId))).json();
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

  it("rejects approval when the generated site changes after server QA", async () => {
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
    const approval = POST(request(runId, { action: "approve" }), context(runId));
    releaseEdit();
    await edit;
    const response = await approval;
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "visual QA does not match the current build" });
    const retainedV1 = path.join(sitePaths(runId).root, "evidence/qa/v1/desktop.png");
    await fs.mkdir(path.dirname(retainedV1), { recursive: true });
    await fs.writeFile(retainedV1, "v1 evidence");
    expect((await POST(request(runId, { action: "request-revision", note: "Re-run against the changed build" }), context(runId))).status).toBe(200);
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
    expect((await POST(request(runId, { action: "request-revision", note: "Exercise transactional failure recovery" }), context(runId))).status).toBe(200);
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
