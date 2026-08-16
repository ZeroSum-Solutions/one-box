import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  EVIDENCE_WORKFLOW_STAGES,
  RUN_FILE,
  WorkflowArtifactDraftSchema,
  type WorkflowArtifactDraft,
} from "./contracts";
import {
  EvidenceWorkflowError,
  advanceEvidenceWorkflow,
  artifactApprovalState,
  claimBuildGateRepair,
  createRun,
  invalidateApprovedVisualQa,
  loadEvidenceWorkflow,
  loadRun,
  saveEvidenceArtifactVersion,
  sitePaths,
  transitionEvidenceArtifactApproval,
  withRunTransaction,
  workflowArtifactAliasPath,
  workflowArtifactVersionPath,
} from "./runstate";
import { assertBuildAuthorized } from "./builder";
import { buildTailwindPlan, buildTokenInventory } from "./evidence";
import {
  loadSynth,
  persistSynthesizedDesignContract,
} from "./pipeline";

const testRunIds: string[] = [];
const execFileAsync = promisify(execFile);

interface PersistedRunFixture {
  evidenceWorkflow: {
    currentStage: string;
    artifacts: Array<{
      artifactType: string;
      version: number;
      revisionOf?: number;
      approvalTransitions: Array<{ state: string; at: string }>;
      artifact: Record<string, unknown>;
    }>;
  };
}

async function createTestRun(): Promise<string> {
  const runId = await createRun();
  testRunIds.push(runId);
  return runId;
}

async function corruptPersistedRun(
  runId: string,
  mutate: (run: PersistedRunFixture) => void
): Promise<void> {
  const runPath = path.join(sitePaths(runId).root, RUN_FILE);
  const run = JSON.parse(await fs.readFile(runPath, "utf8")) as PersistedRunFixture;
  mutate(run);
  await fs.writeFile(runPath, JSON.stringify(run), "utf8");
}

async function removePersistedEvidenceWorkflow(runId: string): Promise<void> {
  const runPath = path.join(sitePaths(runId).root, RUN_FILE);
  const run = JSON.parse(await fs.readFile(runPath, "utf8")) as Record<
    string,
    unknown
  >;
  delete run.evidenceWorkflow;
  await fs.writeFile(runPath, JSON.stringify(run), "utf8");
}

async function reviewAndApprove(
  runId: string,
  artifact: Awaited<ReturnType<typeof saveEvidenceArtifactVersion>>
): Promise<void> {
  await transitionEvidenceArtifactApproval(
    runId,
    artifact.artifactType,
    artifact.version,
    "in-review"
  );
  await transitionEvidenceArtifactApproval(
    runId,
    artifact.artifactType,
    artifact.version,
    "approved",
    artifact.artifactType === "visual-qa"
      ? {
          humanVisualReview: {
            reviewerName: "Test reviewer",
            reviewerKind: "human",
            humanAttestation: true,
            reviewedAt: "2026-08-13T12:00:00.000Z",
            buildSha256: artifact.artifact.buildSha256,
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
        }
      : undefined
  );
}

async function createVisualQaDraftRun() {
  const runId = await createTestRun();
  const drafts = artifactDrafts();
  for (let index = 0; index < drafts.length - 1; index += 1) {
    const artifact = await saveEvidenceArtifactVersion(runId, drafts[index]);
    await reviewAndApprove(runId, artifact);
    await advanceEvidenceWorkflow(runId, EVIDENCE_WORKFLOW_STAGES[index + 1]);
  }
  const visualQa = await saveEvidenceArtifactVersion(
    runId,
    drafts[drafts.length - 1]
  );
  return { runId, visualQa };
}

function artifactDrafts(): WorkflowArtifactDraft[] {
  const designTokens = {
    colors: [{ name: "Primary", value: "#123456", cssVar: "--color-primary", role: "actions", forbiddenContexts: [] }],
    fonts: [{ family: "Inter", cssVar: "--font-body", weights: [400], role: "body", substitutes: [] }],
    typeScale: [{ role: "body", sizePx: 16, lineHeight: 1.5, cssVar: "--text-body" }],
    radii: { sm: "4px" }, spacing: { sm: "8px" }, borders: { subtle: "1px solid #ddd" }, shadows: { raised: "0 2px 8px #0002" }, layers: { base: "0" },
    layout: { maxWidthPx: 1000, sectionGapPx: 64, cardPaddingPx: 20 },
    motion: { easing: "linear", durationMs: { micro: 100, reveal: 300 }, revealClasses: [] },
    componentStates: [{ component: "button", states: { default: "solid" } }],
    imageryBrief: { subject: "work", lighting: "natural", grade: "neutral", framing: "wide", avoid: [] },
  };
  const tokenArtifact = buildTokenInventory(designTokens, 1, []);
  const tailwindArtifact = buildTailwindPlan(tokenArtifact, 1);
  return [
    WorkflowArtifactDraftSchema.parse({
      artifactType: "ledger",
      artifact: {
        projectTarget: "website",
        businessIntelligence: { kind: "business-intelligence" },
        referoDesignEvidence: { kind: "refero-design-evidence" },
        clientEvidence: {},
      },
    }),
    WorkflowArtifactDraftSchema.parse({
      artifactType: "design-contract",
      artifact: {
        title: "Acme design contract",
        contractPath: "evidence/DESIGN.md",
        sourceLedgerVersion: 1,
        contractSha256: "a".repeat(64),
        exportSha256: "b".repeat(64),
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
    WorkflowArtifactDraftSchema.parse({
      artifactType: "visual-qa",
      artifact: {
        sourceCssArchitectureVersion: 1,
        buildSha256: "0".repeat(64),
        checks: ["desktop", "tablet", "mobile", "hover", "focus", "color-scheme", "reduced-motion"].map((area) => ({
          area,
          status: "pass",
          ...(["desktop", "tablet", "mobile"].includes(area)
            ? { evidencePath: `evidence/qa/${area}.png` }
            : {}),
        })),
      },
    }),
  ];
}

afterEach(async () => {
  await Promise.all(
    testRunIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true })
    )
  );
});

describe("evidence workflow persistence", () => {
  it("defaults persisted pre-version runs to legacy and new runs to gated", async () => {
    const newRunId = await createTestRun();
    expect((await loadRun(newRunId)).pipelineVersion).toBe("evidence-gated-v2");

    const legacyRunId = await createTestRun();
    const runPath = path.join(sitePaths(legacyRunId).root, RUN_FILE);
    const persisted = JSON.parse(await fs.readFile(runPath, "utf8")) as Record<
      string,
      unknown
    >;
    delete persisted.pipelineVersion;
    await fs.writeFile(runPath, JSON.stringify(persisted), "utf8");
    expect((await loadRun(legacyRunId)).pipelineVersion).toBe("legacy-v1");
  });

  it("preserves the approved v2 DESIGN.md and loads approved build tokens", async () => {
    const runId = await createTestRun();
    const approvedContract = "---\nversion: alpha\n---\n\n# Approved contract\n";
    const approvedTokens = {
      colors: [],
      fonts: [],
      typeScale: [],
      radii: {},
      spacing: {},
      borders: {},
      shadows: {},
      layers: {},
      layout: { maxWidthPx: 1200, sectionGapPx: 64, cardPaddingPx: 24 },
      motion: {
        easing: "linear",
        durationMs: { micro: 0, reveal: 0 },
        revealClasses: [],
      },
      componentStates: [],
      imageryBrief: {
        subject: "approved",
        lighting: "natural",
        grade: "neutral",
        framing: "wide",
        avoid: [],
      },
    };
    await fs.writeFile(
      path.join(sitePaths(runId).root, "DESIGN.md"),
      approvedContract,
      "utf8"
    );
    await fs.writeFile(
      path.join(sitePaths(runId).root, "tokens.json"),
      JSON.stringify(approvedTokens),
      "utf8"
    );
    await persistSynthesizedDesignContract(runId, "# Legacy overwrite");

    expect(await fs.readFile(path.join(sitePaths(runId).root, "DESIGN.md"), "utf8"))
      .toBe(approvedContract);
    expect((await loadSynth(runId)).tokens).toEqual(approvedTokens);
  });

  it("persists the complete required transition order", async () => {
    const runId = await createTestRun();
    const drafts = artifactDrafts();

    for (let index = 0; index < drafts.length; index += 1) {
      const artifact = await saveEvidenceArtifactVersion(runId, drafts[index]);
      await reviewAndApprove(runId, artifact);
      const nextStage = EVIDENCE_WORKFLOW_STAGES[index + 1];
      if (nextStage) await advanceEvidenceWorkflow(runId, nextStage);
    }

    const workflow = await loadEvidenceWorkflow(runId);
    expect(workflow.currentStage).toBe("build");
    expect(workflow.artifacts.map((artifact) => artifact.artifactType)).toEqual([
      "ledger",
      "design-contract",
      "token-inventory",
      "tailwind-plan",
      "css-architecture",
      "visual-qa",
    ]);
    expect(workflow.artifacts.every((artifact) => artifactApprovalState(artifact) === "approved"))
      .toBe(true);
  });

  it("rejects skipped gates and unapproved advancement", async () => {
    const runId = await createTestRun();
    const ledger = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);

    await expect(advanceEvidenceWorkflow(runId, "contract")).rejects.toThrow(
      /must be approved/
    );
    await transitionEvidenceArtifactApproval(
      runId,
      ledger.artifactType,
      ledger.version,
      "in-review"
    );
    await transitionEvidenceArtifactApproval(
      runId,
      ledger.artifactType,
      ledger.version,
      "approved"
    );
    await expect(advanceEvidenceWorkflow(runId, "tokens")).rejects.toThrow(
      EvidenceWorkflowError
    );

    expect((await loadEvidenceWorkflow(runId)).currentStage).toBe("evidence");
    await expect(advanceEvidenceWorkflow(runId, "contract")).resolves.toMatchObject({
      evidenceWorkflow: { currentStage: "contract" },
    });
  });

  it("blocks a gated build until CSS architecture is approved", async () => {
    const runId = await createTestRun();
    await expect(assertBuildAuthorized(sitePaths(runId).root)).rejects.toThrow(
      /build blocked/
    );

    const drafts = artifactDrafts();
    for (let index = 0; index < 5; index += 1) {
      const artifact = await saveEvidenceArtifactVersion(runId, drafts[index]);
      await reviewAndApprove(runId, artifact);
      await advanceEvidenceWorkflow(runId, EVIDENCE_WORKFLOW_STAGES[index + 1]);
    }
    await expect(assertBuildAuthorized(sitePaths(runId).root)).resolves.toBeUndefined();
  });

  it("rejects nonexistent and mismatched predecessor versions", async () => {
    const runId = await createTestRun();
    const ledger = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await reviewAndApprove(runId, ledger);
    await advanceEvidenceWorkflow(runId, "contract");

    const badContract = WorkflowArtifactDraftSchema.parse({
      artifactType: "design-contract",
      artifact: {
        title: "Bad lineage",
        contractPath: "evidence/DESIGN.md",
        sourceLedgerVersion: 99,
        contractSha256: "a".repeat(64),
        exportSha256: "b".repeat(64),
      },
    });
    await expect(
      saveEvidenceArtifactVersion(runId, badContract)
    ).rejects.toThrow(/does not match latest approved ledger v1/);
    expect((await loadEvidenceWorkflow(runId)).artifacts).toHaveLength(1);
  });

  it("requires immutable design/export hashes on every v2 contract", async () => {
    const runId = await createTestRun();
    const ledger = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await reviewAndApprove(runId, ledger);
    await advanceEvidenceWorkflow(runId, "contract");
    const draft = structuredClone(artifactDrafts()[1]);
    if (draft.artifactType !== "design-contract") throw new Error("fixture mismatch");
    delete draft.artifact.contractSha256;
    delete draft.artifact.exportSha256;
    await expect(saveEvidenceArtifactVersion(runId, draft)).rejects.toThrow(/contractSha256/);
  });

  it("rejects a stale predecessor version after an approved revision", async () => {
    const runId = await createTestRun();
    const first = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await reviewAndApprove(runId, first);
    await transitionEvidenceArtifactApproval(
      runId,
      first.artifactType,
      first.version,
      "revision-requested"
    );
    const second = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await reviewAndApprove(runId, second);
    await advanceEvidenceWorkflow(runId, "contract");

    await expect(
      saveEvidenceArtifactVersion(runId, artifactDrafts()[1])
    ).rejects.toThrow(/source version 1 does not match latest approved ledger v2/);
  });

  it("atomically persists immutable revisions and approval history", async () => {
    const runId = await createTestRun();
    const first = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await transitionEvidenceArtifactApproval(
      runId,
      first.artifactType,
      first.version,
      "revision-requested",
      { actor: "reviewer", note: "Clarify the market claim" }
    );

    const revisedDraft = WorkflowArtifactDraftSchema.parse({
      artifactType: "ledger",
      artifact: {
        projectTarget: "ios-app",
        businessIntelligence: { kind: "business-intelligence" },
        referoDesignEvidence: { kind: "refero-design-evidence" },
        clientEvidence: {},
      },
    });
    const second = await saveEvidenceArtifactVersion(runId, revisedDraft, {
      actor: "author",
    });
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(
            sitePaths(runId).root,
            workflowArtifactVersionPath("ledger", 1)
          ),
          "utf8"
        )
      ).projectTarget
    ).toBe("website");

    const persisted = await loadEvidenceWorkflow(runId);
    const [persistedFirst, persistedSecond] = persisted.artifacts;
    expect(second).toMatchObject({ version: 2, revisionOf: 1 });
    expect(persistedFirst.artifact).toEqual(first.artifact);
    expect(artifactApprovalState(persistedFirst)).toBe("superseded");
    expect(persistedSecond).toMatchObject({
      version: 2,
      revisionOf: 1,
      artifact: { projectTarget: "ios-app" },
    });
    expect(
      (await fs.readdir(sitePaths(runId).root)).some((name) => name.endsWith(".tmp"))
    ).toBe(false);
  });

  it("promotes only the exact approved version to the current alias", async () => {
    const runId = await createTestRun();
    const first = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await reviewAndApprove(runId, first);
    const aliasPath = path.join(
      sitePaths(runId).root,
      workflowArtifactAliasPath("ledger")
    );
    expect(JSON.parse(await fs.readFile(aliasPath, "utf8")).version).toBe(1);
    await transitionEvidenceArtifactApproval(runId, "ledger", 1, "revision-requested");
    const revised = WorkflowArtifactDraftSchema.parse({
      ...artifactDrafts()[0],
      artifact: {
        ...artifactDrafts()[0].artifact,
        projectTarget: "ios-app",
      },
    });
    const second = await saveEvidenceArtifactVersion(runId, revised);
    expect(JSON.parse(await fs.readFile(aliasPath, "utf8")).version).toBe(1);
    await reviewAndApprove(runId, second);
    expect(JSON.parse(await fs.readFile(aliasPath, "utf8")).version).toBe(2);
  });

  it("rolls back workflow and aliases when a multi-file promotion fails", async () => {
    const runId = await createTestRun();
    const first = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await reviewAndApprove(runId, first);
    const aliasPath = path.join(sitePaths(runId).root, workflowArtifactAliasPath("ledger"));
    const approvedV1 = await fs.readFile(aliasPath, "utf8");
    await transitionEvidenceArtifactApproval(runId, "ledger", 1, "revision-requested");
    const revisedLedger = WorkflowArtifactDraftSchema.parse({
      artifactType: "ledger",
      artifact: {
        projectTarget: "ios-app",
        businessIntelligence: { kind: "business-intelligence" },
        referoDesignEvidence: { kind: "refero-design-evidence" },
        clientEvidence: {},
      },
    });
    const second = await saveEvidenceArtifactVersion(runId, revisedLedger);
    await transitionEvidenceArtifactApproval(runId, "ledger", second.version, "in-review");

    await expect(withRunTransaction(runId, async (transaction) => {
      await transaction.transitionEvidenceArtifactApproval("ledger", 2, "approved");
      await transaction.writeArtifact("evidence/approved/project-record.json", "partial alias");
      throw new Error("simulated alias-copy failure");
    })).rejects.toThrow(/alias-copy failure/);

    const workflow = await loadEvidenceWorkflow(runId);
    expect(artifactApprovalState(workflow.artifacts.at(-1)!)).toBe("in-review");
    expect(await fs.readFile(aliasPath, "utf8")).toBe(approvedV1);
    await expect(fs.readFile(path.join(sitePaths(runId).root, "evidence/approved/project-record.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("holds the shared filesystem run-state lock for the whole transaction", async () => {
    const runId = await createTestRun();
    let enterTransaction!: () => void;
    let releaseTransaction!: () => void;
    const entered = new Promise<void>((resolve) => { enterTransaction = resolve; });
    const release = new Promise<void>((resolve) => { releaseTransaction = resolve; });

    const transaction = withRunTransaction(runId, async () => {
      enterTransaction();
      await release;
    });
    await entered;

    const lockDirectory = path.join(sitePaths(runId).root, ".run-state-lock");
    const owner = JSON.parse(
      await fs.readFile(path.join(lockDirectory, "owner.lock"), "utf8"),
    ) as { pid: number; token: string };
    expect(owner.pid).toBe(process.pid);
    expect(owner.token).toMatch(/^[a-f0-9]{32}$/);

    releaseTransaction();
    await transaction;
    await expect(
      fs.access(path.join(lockDirectory, "owner.lock")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not lose run-state updates from separate processes", async () => {
    const runId = await createTestRun();
    const barrierDirectory = path.join(
      sitePaths(runId).root,
      "cross-process-run-barrier",
    );
    const vitestEntry = path.join(
      process.cwd(),
      "node_modules/vitest/vitest.mjs",
    );
    const fixturePath = path.join(
      process.cwd(),
      "src/lib/runstate.crossProcess.fixture.test.ts",
    );

    await Promise.all(
      ["writer-a", "writer-b"].map((writerId) =>
        execFileAsync(
          process.execPath,
          [vitestEntry, "run", fixturePath, "--maxWorkers=1"],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              ONEBOX_CROSS_PROCESS_RUN_ID: runId,
              ONEBOX_CROSS_PROCESS_WRITER_ID: writerId,
              ONEBOX_CROSS_PROCESS_BARRIER_DIRECTORY: barrierDirectory,
            },
          },
        ),
      ),
    );

    expect((await loadRun(runId)).costUsd).toBe(2);
  }, 20_000);

  it("rolls back an initial contract transaction without exposing unapproved aliases", async () => {
    const runId = await createTestRun();
    const ledger = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await reviewAndApprove(runId, ledger);
    await advanceEvidenceWorkflow(runId, "contract");
    const root = sitePaths(runId).root;
    await expect(withRunTransaction(runId, async (transaction) => {
      await transaction.writeArtifact("evidence/versions/design-contract/v1.DESIGN.md", "contract");
      await transaction.writeArtifact("evidence/versions/design-contract/v1.tailwind.css", "@theme {}");
      throw new Error("simulated initial-contract failure");
    })).rejects.toThrow(/initial-contract failure/);
    for (const relative of [
      "evidence/versions/design-contract/v1.DESIGN.md",
      "evidence/versions/design-contract/v1.tailwind.css",
      "DESIGN.md",
      "design-tailwind.css",
    ]) {
      await expect(fs.access(path.join(root, relative))).rejects.toMatchObject({ code: "ENOENT" });
    }
    expect((await loadRun(runId)).evidenceWorkflow.artifacts).toHaveLength(1);
  });

  it("rejects invalid approval-state jumps", async () => {
    const runId = await createTestRun();
    const ledger = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);

    await expect(
      transitionEvidenceArtifactApproval(
        runId,
        ledger.artifactType,
        ledger.version,
        "approved"
      )
    ).rejects.toThrow(/draft -> approved/);
  });

  it("does not silently supersede an approved artifact", async () => {
    const runId = await createTestRun();
    const ledger = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await reviewAndApprove(runId, ledger);

    await expect(
      saveEvidenceArtifactVersion(runId, artifactDrafts()[0])
    ).rejects.toThrow(/must be revision-requested before replacement/);
    const workflow = await loadEvidenceWorkflow(runId);
    expect(workflow.artifacts).toHaveLength(1);
    expect(artifactApprovalState(workflow.artifacts[0])).toBe("approved");
  });

  it("invalidates an approved visual review after a committed site mutation without erasing history", async () => {
    const runId = await createTestRun();
    const drafts = artifactDrafts();
    for (let index = 0; index < drafts.length; index += 1) {
      const artifact = await saveEvidenceArtifactVersion(runId, drafts[index]);
      await reviewAndApprove(runId, artifact);
      const nextStage = EVIDENCE_WORKFLOW_STAGES[index + 1];
      if (nextStage) await advanceEvidenceWorkflow(runId, nextStage);
    }

    await expect(invalidateApprovedVisualQa(runId)).resolves.toBe(true);
    const workflow = await loadEvidenceWorkflow(runId);
    const visualQa = workflow.artifacts.find((artifact) => artifact.artifactType === "visual-qa");
    expect(visualQa && artifactApprovalState(visualQa)).toBe("revision-requested");
    expect(visualQa?.approvalTransitions.at(-1)).toMatchObject({
      actor: "site-mutation",
      note: expect.stringMatching(/site changed/i),
    });
    const alias = JSON.parse(
      await fs.readFile(
        path.join(sitePaths(runId).root, workflowArtifactAliasPath("visual-qa")),
        "utf8"
      )
    );
    expect(alias.approvalTransitions.at(-1).state).toBe("revision-requested");
    expect(await invalidateApprovedVisualQa(runId)).toBe(false);
  });

  it("rejects generic visual approval and invalidates draft or in-review QA after a site mutation", async () => {
    const draftRun = await createVisualQaDraftRun();
    await expect(invalidateApprovedVisualQa(draftRun.runId)).resolves.toBe(true);

    const reviewRun = await createVisualQaDraftRun();
    await transitionEvidenceArtifactApproval(
      reviewRun.runId,
      "visual-qa",
      reviewRun.visualQa.version,
      "in-review"
    );
    await expect(
      transitionEvidenceArtifactApproval(
        reviewRun.runId,
        "visual-qa",
        reviewRun.visualQa.version,
        "approved"
      )
    ).rejects.toThrow(/attested all-pass human review/i);
    await expect(invalidateApprovedVisualQa(reviewRun.runId)).resolves.toBe(true);
    const current = (await loadEvidenceWorkflow(reviewRun.runId)).artifacts.at(-1);
    expect(current && artifactApprovalState(current)).toBe("revision-requested");
  });

  it("claims the build gate-repair allowance independently of stage retries", async () => {
    const runId = await createTestRun();
    expect(await claimBuildGateRepair(runId)).toBe(true);
    expect(await claimBuildGateRepair(runId)).toBe(false);
    expect((await loadRun(runId)).stages.built.gateRepairAttempts).toBe(1);
  });
});

describe("persisted evidence workflow validation", () => {
  it("isolates factory defaults across two on-disk legacy runs", async () => {
    const firstRunId = await createTestRun();
    const secondRunId = await createTestRun();
    await Promise.all([
      removePersistedEvidenceWorkflow(firstRunId),
      removePersistedEvidenceWorkflow(secondRunId),
    ]);

    await saveEvidenceArtifactVersion(firstRunId, artifactDrafts()[0]);

    expect((await loadEvidenceWorkflow(firstRunId)).artifacts).toHaveLength(1);
    expect(await loadEvidenceWorkflow(secondRunId)).toEqual({
      currentStage: "evidence",
      artifacts: [],
    });
    const secondRaw = JSON.parse(
      await fs.readFile(path.join(sitePaths(secondRunId).root, RUN_FILE), "utf8")
    ) as Record<string, unknown>;
    expect(secondRaw).not.toHaveProperty("evidenceWorkflow");
  });

  it("loadRun rejects duplicate or nonlinear versions", async () => {
    const runId = await createTestRun();
    const first = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await transitionEvidenceArtifactApproval(
      runId,
      first.artifactType,
      first.version,
      "revision-requested"
    );
    await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await corruptPersistedRun(runId, (run) => {
      run.evidenceWorkflow.artifacts[1].version = 1;
    });

    await expect(loadRun(runId)).rejects.toThrow(/unique and linear/);
  });

  it("loadRun rejects invalid transitions and transitions after superseded", async () => {
    const runId = await createTestRun();
    await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await corruptPersistedRun(runId, (run) => {
      const at = "2026-08-13T00:00:00.000Z";
      run.evidenceWorkflow.artifacts[0].approvalTransitions.push(
        { state: "revision-requested", at },
        { state: "superseded", at },
        { state: "approved", at }
      );
    });

    await expect(loadRun(runId)).rejects.toThrow(/superseded -> approved/);
  });

  it("loadRun rejects a revision that does not point to its prior version", async () => {
    const runId = await createTestRun();
    const first = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await transitionEvidenceArtifactApproval(
      runId,
      first.artifactType,
      first.version,
      "revision-requested"
    );
    await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await corruptPersistedRun(runId, (run) => {
      run.evidenceWorkflow.artifacts[1].revisionOf = 99;
    });

    await expect(loadRun(runId)).rejects.toThrow(/must revise v1/);
  });

  it("loadRun rejects multiple nonsuperseded versions", async () => {
    const runId = await createTestRun();
    const first = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await transitionEvidenceArtifactApproval(
      runId,
      first.artifactType,
      first.version,
      "revision-requested"
    );
    await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await corruptPersistedRun(runId, (run) => {
      run.evidenceWorkflow.artifacts[0].approvalTransitions.pop();
    });

    await expect(loadRun(runId)).rejects.toThrow(/at most one nonsuperseded/);
  });

  it("loadRun rejects a stage whose preceding gate is absent", async () => {
    const runId = await createTestRun();
    await corruptPersistedRun(runId, (run) => {
      run.evidenceWorkflow.currentStage = "tokens";
    });

    await expect(loadRun(runId)).rejects.toThrow(
      /ledger must be approved before stage tokens/
    );
  });

  it("loadRun rejects persisted stale lineage", async () => {
    const runId = await createTestRun();
    const ledger = await saveEvidenceArtifactVersion(runId, artifactDrafts()[0]);
    await reviewAndApprove(runId, ledger);
    await advanceEvidenceWorkflow(runId, "contract");
    const contract = await saveEvidenceArtifactVersion(runId, artifactDrafts()[1]);
    await corruptPersistedRun(runId, (run) => {
      const persistedContract = run.evidenceWorkflow.artifacts.find(
        (artifact) => artifact.artifactType === contract.artifactType
      );
      if (persistedContract) persistedContract.artifact.sourceLedgerVersion = 99;
    });

    await expect(loadRun(runId)).rejects.toThrow(
      /must reference the latest approved ledger/
    );
  });
});
