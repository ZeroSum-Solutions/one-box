import {
  createTemplateFallbackRun,
  RunNotFoundError,
} from "../../../../../lib/runstate";
import { isLocalApiAuthorized } from "../../../../../lib/localApiAuth";

interface FallbackDependencies {
  createTemplateFallbackRun: typeof createTemplateFallbackRun;
}

const defaultDependencies: FallbackDependencies = {
  createTemplateFallbackRun,
};

export async function handleFallbackRequest(
  request: Request,
  runId: string,
  dependencies: FallbackDependencies = defaultDependencies,
): Promise<Response> {
  if (!isLocalApiAuthorized(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(runId)) {
    return Response.json({ error: "bad runId" }, { status: 400 });
  }

  try {
    const fallbackRunId = await dependencies.createTemplateFallbackRun(
      runId,
      "operator-requested-after-failure",
    );
    return Response.json({
      sourceRunId: runId,
      fallbackRunId,
      layoutAuthority: "template-v1",
      reason: "operator-requested-after-failure",
    });
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return Response.json(
        { error: "run not found", action: "Check the Page IR run ID." },
        { status: 404 },
      );
    }
    const expectedConflict =
      error instanceof Error &&
      /^template fallback (?:requires|reason|source|claim conflicts)/.test(
        error.message,
      );
    return Response.json(
      {
        error: expectedConflict ? error.message : "template fallback failed",
        action: expectedConflict
          ? "Keep the Page IR run unchanged, then request fallback only after a recorded failure."
          : "Inspect the server log, then retry without changing the Page IR source run.",
      },
      { status: expectedConflict ? 409 : 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleFallbackRequest(request, id);
}
