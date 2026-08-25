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

export const LEGACY_PROJECT_COMPATIBILITY_MESSAGE =
  "Legacy/experimental and read-only in Phase 1; preview/export available; start a new Website project for generation/edit.";

export type PersistedIntakeCompatibility =
  | {
      mode: "phase-1-website";
      projectTarget: "website";
      label: "website";
      readOnly: false;
      message: null;
    }
  | {
      mode: "legacy-read-only";
      projectTarget: Exclude<ProjectTarget, "website">;
      label: "legacy/experimental";
      readOnly: true;
      message: typeof LEGACY_PROJECT_COMPATIBILITY_MESSAGE;
    };

/** Classifies persisted intake without saving, backfilling, or narrowing its schema. */
export function classifyPersistedIntakeCompatibility(
  rawIntake: unknown,
): PersistedIntakeCompatibility {
  const { projectTarget } = IntakeSchema.pick({ projectTarget: true })
    .passthrough()
    .parse(rawIntake);
  if (projectTarget === "website") {
    return {
      mode: "phase-1-website",
      projectTarget,
      label: "website",
      readOnly: false,
      message: null,
    };
  }
  return {
    mode: "legacy-read-only",
    projectTarget,
    label: "legacy/experimental",
    readOnly: true,
    message: LEGACY_PROJECT_COMPATIBILITY_MESSAGE,
  };
}

export class WebsiteOnlyProductionError extends Error {
  readonly code = WEBSITE_ONLY_PRODUCTION_ERROR.code;
  readonly action = WEBSITE_ONLY_PRODUCTION_ERROR.action;
  readonly projectTarget: Exclude<ProjectTarget, "website">;

  constructor(projectTarget: Exclude<ProjectTarget, "website">) {
    super(WEBSITE_ONLY_PRODUCTION_ERROR.error);
    this.name = "WebsiteOnlyProductionError";
    this.projectTarget = projectTarget;
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
  const { projectTarget } = classifyPersistedIntakeCompatibility(raw);
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
