import {
  ARTIFACTS,
  IntakeSchema,
  MarketAnalysisSchema,
  ScanResultSchema,
} from "../../../../lib/contracts";
import { deriveGuidedPipeline } from "../../../../lib/guidedPipeline";
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
    const [run, intakeValue, marketValue, scanValue] = await Promise.all([
      loadRun(id),
      loadArtifact(id, ARTIFACTS.intake),
      loadArtifact(id, ARTIFACTS.marketAnalysis),
      loadArtifact(id, ARTIFACTS.scan),
    ]);
    const intake = IntakeSchema.safeParse(intakeValue);
    const marketAnalysis = MarketAnalysisSchema.safeParse(marketValue);
    const scan = ScanResultSchema.safeParse(scanValue);
    return Response.json(
      deriveGuidedPipeline({
        run,
        ...(intake.success ? { intake: intake.data } : {}),
        ...(marketAnalysis.success ? { marketAnalysis: marketAnalysis.data } : {}),
        ...(scan.success ? { scan: scan.data } : {}),
      }),
      { headers: HEADERS },
    );
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return Response.json({ error: "run not found" }, { status: 404, headers: HEADERS });
    }
    throw error;
  }
}
