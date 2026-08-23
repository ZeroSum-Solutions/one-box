import {
  ARTIFACTS,
  IntakeSchema,
  ProductionProjectTargetSchema,
  type ProjectTarget,
} from "./contracts";
import { loadArtifact } from "./runstate";

export const WEBSITE_ONLY_PRODUCTION_ERROR = {
  code: "unsupported-project-target",
  error: "Phase 1 production supports Website projects only.",
  action: "Start a new Website project to generate, retry, or rebuild.",
} as const;

export class WebsiteOnlyProductionError extends Error {
  readonly code = WEBSITE_ONLY_PRODUCTION_ERROR.code;
  readonly action = WEBSITE_ONLY_PRODUCTION_ERROR.action;

  constructor(readonly projectTarget: Exclude<ProjectTarget, "website">) {
    super(WEBSITE_ONLY_PRODUCTION_ERROR.error);
    this.name = "WebsiteOnlyProductionError";
  }
}

export function assertWebsiteProductionTarget(
  projectTarget: ProjectTarget
): asserts projectTarget is "website" {
  if (!ProductionProjectTargetSchema.safeParse(projectTarget).success) {
    throw new WebsiteOnlyProductionError(
      projectTarget as Exclude<ProjectTarget, "website">
    );
  }
}

type IntakeLoader = (
  runId: string,
  relativePath: string
) => Promise<unknown>;

export async function assertWebsiteProductionRun(
  runId: string,
  loadIntake: IntakeLoader = loadArtifact
): Promise<"website" | undefined> {
  const raw = await loadIntake(runId, ARTIFACTS.intake);
  if (raw === null || raw === undefined) return undefined;
  const { projectTarget } = IntakeSchema.pick({ projectTarget: true })
    .passthrough()
    .parse(raw);
  assertWebsiteProductionTarget(projectTarget);
  return projectTarget;
}

export function websiteOnlyProductionResponse(
  error: unknown
): Response | undefined {
  if (!(error instanceof WebsiteOnlyProductionError)) return undefined;
  return Response.json(
    {
      ...WEBSITE_ONLY_PRODUCTION_ERROR,
      projectTarget: error.projectTarget,
    },
    { status: 409, headers: { "Cache-Control": "no-store" } }
  );
}
