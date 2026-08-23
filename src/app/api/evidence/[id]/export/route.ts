import { createHash } from "node:crypto";
import { isLocalApiAuthorized } from "../../../../../lib/localApiAuth";
import {
  ARTIFACTS,
} from "../../../../../lib/contracts";
import {
  classifyPersistedIntakeCompatibility,
} from "../../../../../lib/productionTarget";
import {
  loadArtifact,
  loadRun,
  RunNotFoundError,
  workflowArtifactVersionPath,
  workflowArtifactAliasPath,
} from "../../../../../lib/runstate";

const RUN_ID = /^[a-z0-9_-]{4,40}$/i;

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
    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        runId: id,
        projectTarget: compatibility?.projectTarget,
        compatibility,
        pipelineVersion: run.pipelineVersion,
        workflow: run.evidenceWorkflow,
        artifacts: run.evidenceWorkflow.artifacts.map((artifact) => ({
          artifactType: artifact.artifactType,
          version: artifact.version,
          approvalState: artifact.approvalTransitions.at(-1)?.state,
          artifactPath: workflowArtifactVersionPath(
            artifact.artifactType,
            artifact.version
          ),
          currentAliasPath: workflowArtifactAliasPath(artifact.artifactType),
          sha256: createHash("sha256")
            .update(JSON.stringify(artifact.artifact))
            .digest("hex"),
          payload: artifact.artifact,
        })),
      },
      null,
      2
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="one-box-${id}-evidence.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return Response.json({ error: "run not found" }, { status: 404 });
    }
    throw error;
  }
}
