import { z } from "zod";
import { createHash } from "node:crypto";
import {
  EVIDENCE_WORKFLOW_STAGES,
  ARTIFACTS,
  HumanVisualReviewCriteriaSchema,
  PageIrSourceBundleReviewCriteriaV1Schema,
  WorkflowArtifactDraftSchema,
  type HumanVisualReview,
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
import { runGates } from "../../../../lib/gates";
import { requiredReferenceContext } from "../../../../lib/referenceContext";
import {
  assertWebsiteProductionRun,
  classifyPersistedIntakeCompatibility,
  type PersistedIntakeCompatibility,
  websiteOnlyProductionResponse,
} from "../../../../lib/productionTarget";
import {
  loadPageIrSourceBundleForReview,
  loadPersistedPageIr,
  transitionPageIrSourceBundleReview,
} from "../../../../lib/pageIrPipeline";
import {
  candidateManifestSha256,
  inspectPromotedLiveBundle,
} from "../../../../lib/candidate";
import { toPageIrSourceReviewView } from "../../../../components/pageIrSourceReview";
import {
  recordReviewFeedback,
  ReviewFeedbackActionSchema,
  ReviewFeedbackError,
} from "../../../../lib/reviewFeedback";

const RUN_ID = /^[a-z0-9_-]{4,40}$/i;
const PAYLOAD_SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const REVIEWER_NAME = z.string().trim().min(1).max(120);

const ActionSchema = z.discriminatedUnion("action", [
  ReviewFeedbackActionSchema,
  z.object({ action: z.literal("submit"), note: z.string().max(2_000).optional() }),
  z.object({
    action: z.literal("request-revision"),
    note: z.string().min(1).max(2_000),
  }),
  z.object({ action: z.literal("approve"), note: z.string().max(2_000).optional() }),
  z.object({
    action: z.literal("record-human-visual-review"),
    reviewerName: z.string().trim().min(1).max(120),
    reviewerKind: z.literal("human"),
    humanAttestation: z.literal(true),
    criteria: HumanVisualReviewCriteriaSchema,
  }),
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
  z.object({
    action: z.literal("begin-page-ir-source-bundle-review"),
    payloadSha256: PAYLOAD_SHA256,
    reviewerName: REVIEWER_NAME,
  }).strict(),
  z.object({
    action: z.literal("approve-page-ir-source-bundle"),
    payloadSha256: PAYLOAD_SHA256,
    reviewerName: REVIEWER_NAME,
    humanAttestation: z.literal(true),
    criteria: PageIrSourceBundleReviewCriteriaV1Schema,
  }).strict(),
  z.object({
    action: z.literal("reject-page-ir-source-bundle"),
    payloadSha256: PAYLOAD_SHA256,
    reviewerName: REVIEWER_NAME,
    note: z.string().trim().min(1).max(2_000),
  }).strict(),
]).superRefine((input, ctx) => {
  if (input.action !== "record-feedback") return;
  if (input.uploadIds.length > 0 && !input.uploadSession) {
    ctx.addIssue({
      code: "custom",
      path: ["uploadSession"],
      message: "feedback attachments require an upload session",
    });
  }
  if (input.uploadIds.length === 0 && input.uploadSession) {
    ctx.addIssue({
      code: "custom",
      path: ["uploadSession"],
      message: "an upload session requires selected feedback attachments",
    });
  }
});

function humanReviewPassed(review: Pick<HumanVisualReview, "criteria">): boolean {
  return Object.values(review.criteria).every((criterion) => criterion.status === "pass");
}

function visualQaRevisionBaseline(
  artifact: Extract<ReturnType<typeof latestCurrentArtifact>, { artifactType: "visual-qa" }>
): { buildSha256: string; humanRejected: boolean } {
  const review = artifact.approvalTransitions.at(-1)?.humanVisualReview;
  if (review && !humanReviewPassed(review)) {
    return { buildSha256: review.buildSha256, humanRejected: true };
  }
  return { buildSha256: artifact.artifact.buildSha256, humanRejected: false };
}

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

type CurrentVisualQaArtifact = Extract<
  NonNullable<ReturnType<typeof latestCurrentArtifact>>,
  { artifactType: "visual-qa" }
>;

async function assertPageIrVisualQaReviewAuthority(
  runId: string,
  run: Awaited<ReturnType<typeof loadRun>>,
  visualQa: CurrentVisualQaArtifact,
): Promise<void> {
  if (run.layoutAuthority !== "page-ir-v1") return;

  let sourceReview;
  try {
    sourceReview = await loadPageIrSourceBundleForReview(runId);
  } catch {
    throw new EvidenceWorkflowError(
      "PageIR visual QA review requires a current approved Source Bundle",
    );
  }
  if (sourceReview.reviewState !== "approved") {
    throw new EvidenceWorkflowError(
      "PageIR visual QA review requires a current approved Source Bundle",
    );
  }
  if (visualQa.artifact.checks.some((check) => check.status === "pending")) {
    throw new EvidenceWorkflowError(
      "PageIR visual QA review requires real visual QA with no pending checks",
    );
  }

  let persistedPageIr;
  try {
    persistedPageIr = await loadPersistedPageIr(runId);
  } catch {
    throw new EvidenceWorkflowError(
      "PageIR visual QA review requires valid current persisted PageIR",
    );
  }

  let live;
  try {
    live = await inspectPromotedLiveBundle(runId);
  } catch {
    throw new EvidenceWorkflowError(
      "PageIR visual QA review requires valid canonical promoted live metadata",
    );
  }
  if (live.status !== "present") {
    throw new EvidenceWorkflowError(
      "PageIR visual QA review requires canonical promoted live",
    );
  }
  const visualQaBuildSha256 = visualQa.artifact.buildSha256;
  const liveCandidateManifestSha256 = candidateManifestSha256(live.manifest);
  if (
    live.manifest.buildSha256 !== visualQaBuildSha256 ||
    live.provenance.buildSha256 !== visualQaBuildSha256 ||
    live.provenance.promotedBuildSha256 !== visualQaBuildSha256 ||
    live.receipt.buildSha256 !== visualQaBuildSha256
  ) {
    throw new EvidenceWorkflowError(
      "PageIR promoted live build does not match the current visual QA artifact",
    );
  }
  if (
    !live.provenance.pageIrSha256 ||
    live.provenance.pageIrSha256 !== persistedPageIr.pageIrSha256
  ) {
    throw new EvidenceWorkflowError(
      "PageIR promoted live provenance does not match the current persisted PageIR",
    );
  }
  if (
    !live.provenance.candidateManifestSha256 ||
    live.provenance.candidateManifestSha256 !== liveCandidateManifestSha256 ||
    live.receipt.candidateManifestSha256 !== liveCandidateManifestSha256
  ) {
    throw new EvidenceWorkflowError(
      "PageIR promoted live candidate manifest bindings do not match",
    );
  }
}

function isMissingPageIrSourceBundle(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function pageIrSourceReview(
  run: Awaited<ReturnType<typeof loadRun>>,
) {
  if (run.layoutAuthority !== "page-ir-v1") return null;
  try {
    return toPageIrSourceReviewView(
      await loadPageIrSourceBundleForReview(run.id),
    );
  } catch (error) {
    if (isMissingPageIrSourceBundle(error)) return null;
    throw error;
  }
}

async function pageIrPreviewUrl(
  run: Awaited<ReturnType<typeof loadRun>>,
): Promise<string | null> {
  if (run.layoutAuthority === "template-v1") {
    return run.stages.built.status === "done" ? `/preview/${run.id}` : null;
  }
  try {
    const live = await inspectPromotedLiveBundle(run.id);
    return live.status === "present" ? `/preview/${run.id}` : null;
  } catch {
    return null;
  }
}

async function responsePayload(
  run: Awaited<ReturnType<typeof loadRun>>,
  compatibility?: PersistedIntakeCompatibility,
) {
  const currentArtifact = latestCurrentArtifact(run);
  const [sourceReview, previewUrl] = await Promise.all([
    pageIrSourceReview(run),
    pageIrPreviewUrl(run),
  ]);
  return {
    runId: run.id,
    layoutAuthority: run.layoutAuthority,
    pageIrSourceReview: sourceReview,
    projectTarget: compatibility?.projectTarget,
    compatibility,
    pipelineVersion: run.pipelineVersion,
    workflow: run.evidenceWorkflow,
    currentArtifact,
    currentApprovalState: currentArtifact
      ? artifactApprovalState(currentArtifact)
      : null,
    resumeUrl: "/api/run",
    resumeMethod: "POST",
    previewUrl,
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
    const [run, rawIntake] = await Promise.all([
      loadRun(id),
      loadArtifact(id, ARTIFACTS.intake),
    ]);
    const compatibility =
      rawIntake === null || rawIntake === undefined
        ? undefined
        : classifyPersistedIntakeCompatibility(rawIntake);
    return Response.json(await responsePayload(run, compatibility));
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
    await assertWebsiteProductionRun(id);
    const before = await loadRun(id);
    if (before.pipelineVersion !== "evidence-gated-v2") {
      return Response.json(
        { error: "legacy runs cannot enter the v2 evidence workflow" },
        { status: 409 }
      );
    }
    const current = latestCurrentArtifact(before);
    const input = parsed.data;
    let feedback;
    if (
      input.action === "begin-page-ir-source-bundle-review" ||
      input.action === "approve-page-ir-source-bundle" ||
      input.action === "reject-page-ir-source-bundle"
    ) {
      const nextState = input.action === "begin-page-ir-source-bundle-review"
        ? "in-review"
        : input.action === "approve-page-ir-source-bundle"
          ? "approved"
          : "rejected";
      try {
        await transitionPageIrSourceBundleReview(
          id,
          input.payloadSha256,
          nextState,
          {
            actorKind: "human",
            actorName: input.reviewerName,
            ...(input.action === "approve-page-ir-source-bundle"
              ? {
                  humanAttestation: input.humanAttestation,
                  criteria: input.criteria,
                }
              : {}),
            ...(input.action === "reject-page-ir-source-bundle"
              ? { note: input.note }
              : {}),
          },
        );
      } catch (error) {
        throw new EvidenceWorkflowError(
          error instanceof Error ? error.message : "PageIR Source Bundle review failed",
        );
      }
    } else if (input.action === "record-feedback") {
      if (!current) {
        throw new EvidenceWorkflowError(
          "resume generation before sending feedback for this stage",
        );
      }
      feedback = await recordReviewFeedback({
        runId: id,
        feedbackId: input.feedbackId,
        text: input.text,
        uploadSession: input.uploadSession,
        uploadIds: input.uploadIds,
        stage: before.evidenceWorkflow.currentStage,
        artifactType: current.artifactType,
        artifactVersion: current.version,
      });
    } else if (input.action === "advance") {
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
          const revisionBaseline = visualQaRevisionBaseline(transactionCurrent);
          const currentBuildHash = await computeSiteBuildSha256(sitePaths(id).site);
          if (currentBuildHash === revisionBaseline.buildSha256) {
            throw new EvidenceWorkflowError(
              revisionBaseline.humanRejected
                ? "the build must change after a human rejection before visual QA can be regenerated"
                : "the build must change after visual QA was revision-requested before it can be regenerated"
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
    } else if (input.action === "record-human-visual-review") {
      if (!current || current.artifactType !== "visual-qa") {
        throw new EvidenceWorkflowError("human visual review is available only for visual QA");
      }
      const intake = await loadArtifact<Intake>(
        id,
        ARTIFACTS.intake
      );
      const expectedReferenceContext = requiredReferenceContext(
        before.referenceMode,
        intake
      );
      await withSiteAuthorityLock(id, () =>
        withRunTransaction(id, async (transaction) => {
          const transactionCurrent = latestCurrentArtifact(transaction.state);
          if (
            !transactionCurrent ||
            transactionCurrent.artifactType !== "visual-qa" ||
            transactionCurrent.version !== current.version ||
            artifactApprovalState(transactionCurrent) !== "in-review"
          ) {
            throw new EvidenceWorkflowError("visual QA must be in review before human review");
          }
          await assertPageIrVisualQaReviewAuthority(
            id,
            transaction.state,
            transactionCurrent,
          );
          const referenceContext = input.criteria.designAndReferenceAlignment.referenceContext;
          if (referenceContext !== expectedReferenceContext) {
            throw new EvidenceWorkflowError(
              expectedReferenceContext === "explicit-no-reference"
                ? "visual review must explicitly record that no external reference was selected"
                : "visual review must evaluate the selected design/reference evidence"
            );
          }

          const currentBuildHash = await computeSiteBuildSha256(sitePaths(id).site);
          if (transactionCurrent.artifact.buildSha256 !== currentBuildHash) {
            throw new EvidenceWorkflowError("visual QA does not match the current build");
          }
          const humanVisualReview: HumanVisualReview = {
            reviewerName: input.reviewerName,
            reviewerKind: input.reviewerKind,
            humanAttestation: input.humanAttestation,
            reviewedAt: new Date().toISOString(),
            buildSha256: currentBuildHash,
            criteria: input.criteria,
          };
          const passed = humanReviewPassed(humanVisualReview);
          if (passed) {
            if (transactionCurrent.artifact.checks.some((check) => check.status !== "pass")) {
              throw new EvidenceWorkflowError(
                "every automated visual evidence check must pass before human approval"
              );
            }
            const reports = await runGates(id, {});
            const blockingFailures = reports.filter((report) => report.blocking && !report.pass);
            if (blockingFailures.length > 0) {
              throw new EvidenceWorkflowError(
                `mechanical gates must pass before visual approval: ${blockingFailures.map((report) => report.gate).join(", ")}`
              );
            }
            const verifiedBuildHash = await computeSiteBuildSha256(sitePaths(id).site);
            if (verifiedBuildHash !== currentBuildHash) {
              throw new EvidenceWorkflowError("the build changed while mechanical gates were running");
            }
          }
          await transaction.transitionEvidenceArtifactApproval(
            "visual-qa",
            transactionCurrent.version,
            passed ? "approved" : "revision-requested",
            {
              actor: "human-reviewer",
              note: passed
                ? "All named human visual-quality criteria passed."
                : "Human visual review requested a meaningful revision.",
              humanVisualReview,
            }
          );
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
        throw new EvidenceWorkflowError(
          "visual QA approval requires a structured named human visual review"
        );
      }
      if (input.action === "request-revision" && current.artifactType === "visual-qa") {
        throw new EvidenceWorkflowError(
          "visual QA rejection requires a structured named human visual review"
        );
      }
      if (
        input.action === "submit" &&
        before.layoutAuthority === "page-ir-v1" &&
        current.artifactType === "visual-qa"
      ) {
        await withSiteAuthorityLock(id, () =>
          withRunTransaction(id, async (transaction) => {
            const transactionCurrent = latestCurrentArtifact(transaction.state);
            if (
              !transactionCurrent ||
              transactionCurrent.artifactType !== "visual-qa" ||
              transactionCurrent.version !== current.version ||
              artifactApprovalState(transactionCurrent) !== "draft"
            ) {
              throw new EvidenceWorkflowError(
                "visual QA revision changed before submission",
              );
            }
            await assertPageIrVisualQaReviewAuthority(
              id,
              transaction.state,
              transactionCurrent,
            );
            await transaction.transitionEvidenceArtifactApproval(
              "visual-qa",
              transactionCurrent.version,
              "in-review",
              { actor: "workspace-user", note: input.note },
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
    return Response.json({
      ...(await responsePayload(await loadRun(id))),
      ...(feedback ? { feedback } : {}),
    });
  } catch (error) {
    const targetResponse = websiteOnlyProductionResponse(error);
    if (targetResponse) return targetResponse;
    if (error instanceof RunNotFoundError) {
      return Response.json({ error: "run not found" }, { status: 404 });
    }
    if (error instanceof ReviewFeedbackError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof EvidenceWorkflowError || error instanceof z.ZodError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
