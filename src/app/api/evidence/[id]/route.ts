import { z } from "zod";
import { createHash } from "node:crypto";
import {
  EVIDENCE_WORKFLOW_STAGES,
  ARTIFACTS,
  WorkflowArtifactDraftSchema,
  type WorkflowArtifactType,
} from "../../../../lib/contracts";
import {
  EvidenceWorkflowError,
  RunNotFoundError,
  advanceEvidenceWorkflow,
  artifactApprovalState,
  loadRun,
  loadArtifact,
  transitionEvidenceArtifactApproval,
  withRunTransaction,
} from "../../../../lib/runstate";
import { isLocalApiAuthorized } from "../../../../lib/localApiAuth";
import fs from "node:fs/promises";
import path from "node:path";
import { sitePaths } from "../../../../lib/runstate";
import type { Intake, ReferenceLock, WorkflowArtifactDraft } from "../../../../lib/contracts";
import {
  computeSiteBuildSha256,
  materializeDesignContractArtifacts,
  stageThreeWidthVisualQa,
} from "../../../../lib/evidence";
import { withSiteAuthorityLock } from "../../../../lib/siteMutation";

const RUN_ID = /^[a-z0-9_-]{4,40}$/i;

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit"), note: z.string().max(2_000).optional() }),
  z.object({
    action: z.literal("request-revision"),
    note: z.string().min(1).max(2_000),
  }),
  z.object({ action: z.literal("approve"), note: z.string().max(2_000).optional() }),
  z.object({ action: z.literal("regenerate-visual-qa") }),
  z.object({
    action: z.literal("advance"),
    nextStage: z.enum(EVIDENCE_WORKFLOW_STAGES),
  }),
  z.object({
    action: z.literal("save-version"),
    draft: WorkflowArtifactDraftSchema.refine(
      (draft) => draft.artifactType !== "visual-qa",
      "visual QA versions are server-generated"
    ),
  }),
]);

function latestCurrentArtifact(run: Awaited<ReturnType<typeof loadRun>>) {
  const expected: Record<string, WorkflowArtifactType> = {
    evidence: "ledger",
    contract: "design-contract",
    tokens: "token-inventory",
    tailwind: "tailwind-plan",
    css: "css-architecture",
    build: "visual-qa",
  };
  return run.evidenceWorkflow.artifacts
    .filter(
      (artifact) =>
        artifact.artifactType === expected[run.evidenceWorkflow.currentStage]
    )
    .sort((left, right) => right.version - left.version)[0];
}

function responsePayload(run: Awaited<ReturnType<typeof loadRun>>) {
  const currentArtifact = latestCurrentArtifact(run);
  return {
    runId: run.id,
    pipelineVersion: run.pipelineVersion,
    workflow: run.evidenceWorkflow,
    currentArtifact,
    currentApprovalState: currentArtifact
      ? artifactApprovalState(currentArtifact)
      : null,
    resumeUrl: "/api/run",
    resumeMethod: "POST",
    previewUrl:
      run.stages.built.status === "done" ? `/preview/${run.id}` : null,
  };
}

async function materializeDesignContractRevision(
  runId: string,
  draft: Extract<WorkflowArtifactDraft, { artifactType: "design-contract" }>,
  version: number,
  writeArtifact: (relativePath: string, content: string | Uint8Array) => Promise<void>
): Promise<typeof draft> {
  if (!draft.artifact.designTokens) {
    throw new EvidenceWorkflowError("design-contract revision requires designTokens");
  }
  const intake = await loadArtifact<Intake>(runId, ARTIFACTS.intake);
  const lock = await loadArtifact<ReferenceLock>(runId, ARTIFACTS.lock);
  if (!intake || !lock) throw new EvidenceWorkflowError("contract source artifacts missing");
  const contractPath = `evidence/versions/design-contract/v${version}.DESIGN.md`;
  const exportPath = `evidence/versions/design-contract/v${version}.tailwind.css`;
  const materialized = await materializeDesignContractArtifacts(
    intake,
    draft.artifact.designTokens,
    lock
  );
  await writeArtifact(contractPath, materialized.contractBytes);
  await writeArtifact(exportPath, materialized.exportBytes);
  return {
    artifactType: "design-contract",
    artifact: {
      ...draft.artifact,
      contractPath,
      exportPaths: [exportPath],
      contractSha256: materialized.contractSha256,
      exportSha256: materialized.exportSha256,
    },
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!RUN_ID.test(id)) return Response.json({ error: "bad run id" }, { status: 400 });
  if (!isLocalApiAuthorized(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    return Response.json(responsePayload(await loadRun(id)));
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return Response.json({ error: "run not found" }, { status: 404 });
    }
    throw error;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!RUN_ID.test(id)) return Response.json({ error: "bad run id" }, { status: 400 });
  if (!isLocalApiAuthorized(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid evidence action", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const before = await loadRun(id);
    if (before.pipelineVersion !== "evidence-gated-v2") {
      return Response.json(
        { error: "legacy runs cannot enter the v2 evidence workflow" },
        { status: 409 }
      );
    }
    const current = latestCurrentArtifact(before);
    const input = parsed.data;
    if (input.action === "advance") {
      await advanceEvidenceWorkflow(id, input.nextStage);
    } else if (input.action === "save-version") {
      await withRunTransaction(id, async (transaction) => {
        const transactionCurrent = latestCurrentArtifact(transaction.state);
        const draft = input.draft.artifactType === "design-contract"
          ? await materializeDesignContractRevision(
              id,
              input.draft,
              (transactionCurrent?.version ?? 0) + 1,
              transaction.writeArtifact
            )
          : input.draft;
        await transaction.saveEvidenceArtifactVersion(draft, { actor: "workspace-user" });
      });
    } else if (input.action === "regenerate-visual-qa") {
      await withSiteAuthorityLock(id, () =>
        withRunTransaction(id, async (transaction) => {
          const transactionCurrent = latestCurrentArtifact(transaction.state);
          if (
            !transactionCurrent ||
            transactionCurrent.artifactType !== "visual-qa" ||
            artifactApprovalState(transactionCurrent) !== "revision-requested"
          ) {
            throw new EvidenceWorkflowError(
              "visual QA regeneration requires a revision-requested visual-qa artifact"
            );
          }
          const nextVersion = transactionCurrent.version + 1;
          const evidenceBasePath = `evidence/qa/v${nextVersion}`;
          const stagingParent = path.join(sitePaths(id).root, "evidence");
          await fs.mkdir(stagingParent, { recursive: true });
          const stagingDirectory = await fs.mkdtemp(
            path.join(stagingParent, ".qa-stage-")
          );
          try {
            const qa = await stageThreeWidthVisualQa(
              sitePaths(id).site,
              transactionCurrent.artifact.sourceCssArchitectureVersion,
              nextVersion,
              stagingDirectory,
              evidenceBasePath
            );
            for (const check of qa.checks) {
              if (!check.evidencePath) continue;
              if (!check.evidencePath.startsWith(`${evidenceBasePath}/`)) {
                throw new EvidenceWorkflowError("visual QA staged an invalid evidence path");
              }
              await transaction.writeArtifact(
                check.evidencePath,
                await fs.readFile(path.join(stagingDirectory, path.basename(check.evidencePath)))
              );
            }
            await transaction.writeArtifact(
              ARTIFACTS.visualQa,
              `${JSON.stringify(qa, null, 2)}\n`
            );
            await transaction.saveEvidenceArtifactVersion(
              { artifactType: "visual-qa", artifact: qa },
              {
                actor: "visual-qa-runner",
                note: `Regenerated from visual QA v${transactionCurrent.version}`,
              }
            );
          } finally {
            await fs.rm(stagingDirectory, { recursive: true, force: true });
          }
        })
      );
    } else {
      if (!current) {
        return Response.json(
          { error: "resume generation before reviewing this stage" },
          { status: 409 }
        );
      }
      const nextState =
        input.action === "submit"
          ? "in-review"
          : input.action === "request-revision"
            ? "revision-requested"
            : "approved";
      if (nextState === "approved" && current.artifactType === "visual-qa") {
        // Site authority always precedes run authority. Editors use the same
        // site lock, so the verified build bytes cannot change between the
        // hash check and the approval transition.
        await withSiteAuthorityLock(id, () =>
          withRunTransaction(id, async (transaction) => {
            const transactionCurrent = latestCurrentArtifact(transaction.state);
            if (
              !transactionCurrent ||
              transactionCurrent.artifactType !== "visual-qa" ||
              transactionCurrent.version !== current.version
            ) {
              throw new EvidenceWorkflowError("visual QA revision changed before approval");
            }
            if (transactionCurrent.artifact.checks.some((check) => check.status !== "pass")) {
              throw new EvidenceWorkflowError("every visual QA check must pass before approval");
            }
            const currentBuildHash = await computeSiteBuildSha256(sitePaths(id).site);
            if (transactionCurrent.artifact.buildSha256 !== currentBuildHash) {
              throw new EvidenceWorkflowError("visual QA does not match the current build");
            }
            await transaction.transitionEvidenceArtifactApproval(
              "visual-qa",
              transactionCurrent.version,
              "approved",
              { actor: "workspace-user", note: input.note }
            );
          })
        );
      } else if (nextState === "approved" && current.artifactType === "design-contract") {
        await withRunTransaction(id, async (transaction) => {
          const transactionCurrent = latestCurrentArtifact(transaction.state);
          if (!transactionCurrent || transactionCurrent.artifactType !== "design-contract" || transactionCurrent.version !== current.version) {
            throw new EvidenceWorkflowError("design-contract revision changed before approval");
          }
          const contractBytes = await fs.readFile(path.join(sitePaths(id).root, transactionCurrent.artifact.contractPath));
          const exportPath = transactionCurrent.artifact.exportPaths[0];
          if (!exportPath) throw new EvidenceWorkflowError("design-contract export missing");
          const exportBytes = await fs.readFile(path.join(sitePaths(id).root, exportPath));
          const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
          if (!transactionCurrent.artifact.contractSha256 || digest(contractBytes) !== transactionCurrent.artifact.contractSha256) {
            throw new EvidenceWorkflowError("design-contract bytes do not match immutable revision hash");
          }
          if (!transactionCurrent.artifact.exportSha256 || digest(exportBytes) !== transactionCurrent.artifact.exportSha256) {
            throw new EvidenceWorkflowError("design-contract export bytes do not match immutable revision hash");
          }
          await transaction.writeArtifact(ARTIFACTS.designMd, contractBytes);
          await transaction.writeArtifact(ARTIFACTS.designTailwindExport, exportBytes);
          await transaction.transitionEvidenceArtifactApproval("design-contract", current.version, nextState, { actor: "workspace-user", note: input.note });
        });
      } else {
        await transitionEvidenceArtifactApproval(
          id,
          current.artifactType,
          current.version,
          nextState,
          { actor: "workspace-user", note: input.note }
        );
      }
    }
    return Response.json(responsePayload(await loadRun(id)));
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return Response.json({ error: "run not found" }, { status: 404 });
    }
    if (error instanceof EvidenceWorkflowError || error instanceof z.ZodError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
