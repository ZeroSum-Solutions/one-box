import {
  ARTIFACTS,
  IntakeSchema,
  MarketAnalysisSchema,
  ScanResultSchema,
} from "../../../../lib/contracts";
import { deriveGuidedPipeline } from "../../../../lib/guidedPipeline";
import { inspectCandidate, inspectPromotedLiveBundle } from "../../../../lib/candidate";
import { isLocalApiAuthorized } from "../../../../lib/localApiAuth";
import {
  RunNotFoundError,
  loadArtifact,
  loadRun,
} from "../../../../lib/runstate";

const RUN_ID = /^[a-z0-9_-]{4,40}$/i;
const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const ARTIFACT_READ_FAILED = Symbol("artifact-read-failed");

async function guidedCandidateState(id: string) {
  try {
    const [candidate, live] = await Promise.all([
      inspectCandidate(id),
      inspectPromotedLiveBundle(id),
    ]);
    if (candidate.status === "absent") return "absent" as const;
    if (
      candidate.provenance.state === "promoted" &&
      live.status === "present" &&
      candidate.provenance.promotedBuildSha256 === live.manifest.buildSha256 &&
      candidate.provenance.candidateManifestSha256 === live.provenance.candidateManifestSha256
    ) {
      return "promoted" as const;
    }
    return candidate.provenance.state === "promoted" ? "failed" as const : candidate.provenance.state;
  } catch {
    return "failed" as const;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  if (!RUN_ID.test(id)) {
    return Response.json({ error: "bad run id" }, { status: 400, headers: HEADERS });
  }
  if (!isLocalApiAuthorized(request)) {
    return Response.json({ error: "forbidden" }, { status: 403, headers: HEADERS });
  }
  try {
    const [run, intakeValue, marketValue, scanValue, candidate] = await Promise.all([
      loadRun(id),
      loadArtifact(id, ARTIFACTS.intake).catch(() => ARTIFACT_READ_FAILED),
      loadArtifact(id, ARTIFACTS.marketAnalysis).catch(() => ARTIFACT_READ_FAILED),
      loadArtifact(id, ARTIFACTS.scan).catch(() => ARTIFACT_READ_FAILED),
      guidedCandidateState(id),
    ]);
    const intake = IntakeSchema.safeParse(intakeValue);
    const marketAnalysis = MarketAnalysisSchema.safeParse(marketValue);
    const scan = ScanResultSchema.safeParse(scanValue);
    const requiredArtifactInvalid =
      (run.stages.intake.status === "done" && !intake.success) ||
      (run.stages.scanned.status === "done" && !scan.success) ||
      marketValue === ARTIFACT_READ_FAILED ||
      (marketValue !== undefined && !marketAnalysis.success);
    const projection = deriveGuidedPipeline({
      run,
      ...(intake.success ? { intake: intake.data } : {}),
      ...(marketAnalysis.success ? { marketAnalysis: marketAnalysis.data } : {}),
      ...(scan.success ? { scan: scan.data } : {}),
      candidateState: candidate,
    });
    return Response.json(
      requiredArtifactInvalid
        ? {
            ...projection,
            surface: {
              kind: "state-unavailable" as const,
              message: "A required saved pipeline artifact is missing or invalid.",
            },
          }
        : projection,
      { headers: HEADERS },
    );
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return Response.json({ error: "run not found" }, { status: 404, headers: HEADERS });
    }
    throw error;
  }
}
