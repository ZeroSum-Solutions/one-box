/**
 * Intake conversation. A small streaming chat whose ONLY tool is
 * start_pipeline(intake) — the model must elicit real business facts
 * (audit E26: never invent; ask) before firing it.
 */
import { streamText, tool, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import {
  IntakeSchema,
  ProjectTargetSchema,
  ProductionProjectTargetSchema,
  ResearchConfigurationSchema,
  UploadMetadataSchema,
  ARTIFACTS,
  MODELS,
  type Intake,
  type ResearchConfiguration,
  type UploadMetadata,
} from "../../../lib/contracts";
import {
  ensureRun,
  finishStage,
  removeRun,
  saveArtifact,
  startStage,
} from "../../../lib/runstate";
import { openrouter } from "../../../lib/openrouter";
import { claimUploadSession, UploadError } from "../../../lib/uploads";
import { isLocalApiAuthorized } from "../../../lib/localApiAuth";
import { ConfigError, preflight } from "../../../lib/preflight";
import {
  canonicalRequestFingerprint,
  inspectIntakeAttempt,
  IntakeAttemptConflict,
  reserveIntakeAttempt,
  runIntakeAttempt,
  type IntakeAttemptResult,
} from "../../../lib/intakeAttempts";
import {
  assertWebsiteProductionTarget,
  websiteOnlyProductionResponse,
} from "../../../lib/productionTarget";
import { INTAKE_MESSAGE_MAX_CHARS } from "../../../lib/intakeLimits";
import { selectPageIrRolloutDecision } from "../../../lib/rolloutObservability";

export const maxDuration = 120;

const UIMessageRequestSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["user", "assistant"]),
    parts: z
      .array(
        z
          .object({
            type: z.literal("text"),
            text: z.string().max(INTAKE_MESSAGE_MAX_CHARS),
          })
          .strict()
      )
      .length(1),
  })
  .passthrough();

export const IntakeContextRequestSchema = z
  .object({
    projectTarget: ProductionProjectTargetSchema,
    research: ResearchConfigurationSchema.transform(enforceResearchInvariant),
    uploads: z.array(UploadMetadataSchema).max(5),
    uploadSession: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .nullable()
      .default(null),
  })
  .superRefine((context, ctx) => {
    if (context.uploads.length > 0 && !context.uploadSession) {
      ctx.addIssue({
        code: "custom",
        path: ["uploadSession"],
        message: "uploaded files require an upload session",
      });
    }
  })
  .strict();

export type IntakeContextRequest = z.infer<typeof IntakeContextRequestSchema>;

export function enforceResearchInvariant(
  research: ResearchConfiguration
): ResearchConfiguration {
  return research.enabled
    ? research
    : {
        enabled: false,
        businessIntelligence: false,
        referoDesignEvidence: false,
        allowPaidFirecrawlFallback: false,
      };
}

export const ChatRequestSchema = z
  .object({
    attemptId: z.string().uuid(),
    messages: z.array(UIMessageRequestSchema).min(1).max(100),
    intakeContext: IntakeContextRequestSchema,
  })
  .strict();

const SYSTEM = `You are the intake assistant for one-box, a studio tool that builds a complete digital project from one conversation.

Your job: gather REAL facts, then call start_pipeline. Required before you may call it: business name, category, city+state location, at least one service, and the primary action (call | book | quote). Strongly ask for (but don't block on): phone, service area, years in business, certifications, true claims worth featuring, existing website URL, and 2-3 vibe words for how the site should feel.

Rules:
- Never invent a fact. If the user doesn't provide it, it stays empty.
- Ask at most 2-3 focused questions per turn; keep the voice warm and plain.
- Treat the server-provided project target and Design Research settings as fixed user choices. Do not ask the user to repeat them.
- This remains a thin local-service prototype. Gather target-appropriate requirements without promising unsupported production capabilities.
- When you have the required facts, confirm the summary in one compact block, then call start_pipeline.`;

function systemForContext(context: IntakeContextRequest): string {
  return `${SYSTEM}\n\nServer-selected intake context (authoritative):\n- Project target: ${context.projectTarget}\n- Design Research: ${context.research.enabled ? "enabled" : "disabled"}\n- Business context research: ${context.research.businessIntelligence ? "enabled" : "disabled"}\n- Design-reference evidence: ${context.research.referoDesignEvidence ? "enabled" : "disabled"}\n- Metered Firecrawl competitor discovery and local-crawler fallback: ${context.research.allowPaidFirecrawlFallback ? "allowed" : "not allowed"}\n- Staged uploads: ${context.uploads.length}`;
}

/** The model supplies business facts; server-owned controls always win. */
export function forceIntakeContext(
  modelIntake: Intake,
  context: IntakeContextRequest,
  authoritativeUploads: UploadMetadata[] = []
): Intake {
  return IntakeSchema.parse({
    ...modelIntake,
    projectTarget: context.projectTarget,
    research: context.research,
    uploads: authoritativeUploads,
  });
}

export type StartPipelineResult = IntakeAttemptResult;

interface StartPipelineDependencies {
  ensureRun: typeof ensureRun;
  claimUploadSession: typeof claimUploadSession;
  removeRun: typeof removeRun;
  runIntakeAttempt: typeof runIntakeAttempt;
  startStage: typeof startStage;
  saveArtifact: typeof saveArtifact;
  finishStage: typeof finishStage;
}

export async function startPipelineFromIntake(
  intake: Intake,
  intakeContext: IntakeContextRequest,
  attemptId: string,
  requestFingerprint: string,
  dependencies: StartPipelineDependencies = {
    ensureRun,
    claimUploadSession,
    removeRun,
    runIntakeAttempt,
    startStage,
    saveArtifact,
    finishStage,
  }
): Promise<StartPipelineResult> {
  assertWebsiteProductionTarget(intakeContext.projectTarget);
  return dependencies.runIntakeAttempt(attemptId, requestFingerprint, async (runId) => {
    const rolloutDecision = selectPageIrRolloutDecision(process.env);
    await dependencies.ensureRun(runId, {
      // Captured once here; the persisted run is authoritative from then on,
      // so flipping the env var mid-run can never change resume semantics.
      referencePickerEnabled: process.env.ONE_BOX_REFERENCE_PICKER === "1",
      newRunRolloutDecision: rolloutDecision,
    });
    let authoritativeUploads: UploadMetadata[];
    try {
      authoritativeUploads = await dependencies.claimUploadSession(
        intakeContext.uploadSession,
        intakeContext.uploads.map((upload) => upload.id),
        runId
      );
    } catch (error) {
      await dependencies.removeRun(runId).catch(() => undefined);
      if (error instanceof UploadError && [401, 409].includes(error.status)) {
        return {
          started: false,
          code: "upload-session-expired",
          message: "Your private upload session expired. Choose the files again.",
        };
      }
      throw error;
    }
    const parsed = forceIntakeContext(intake, intakeContext, authoritativeUploads);
    await dependencies.startStage(runId, "intake");
    await dependencies.saveArtifact(runId, ARTIFACTS.intake, parsed);
    await dependencies.finishStage(runId, "intake");
    return { runId, started: true };
  });
}

interface ChatRouteDependencies {
  streamText: typeof streamText;
  inspectIntakeAttempt?: typeof inspectIntakeAttempt;
  reserveIntakeAttempt?: typeof reserveIntakeAttempt;
  preflight?: typeof preflight;
}

export async function handleChat(
  req: Request,
  dependencies: ChatRouteDependencies = { streamText }
) {
  if (!isLocalApiAuthorized(req)) {
    return Response.json({ error: "Unauthorized local API request" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON request" }, { status: 400 });
  }
  const targetProbe = z
    .object({
      intakeContext: z
        .object({ projectTarget: ProjectTargetSchema })
        .passthrough(),
    })
    .passthrough()
    .safeParse(body);
  if (targetProbe.success) {
    try {
      assertWebsiteProductionTarget(targetProbe.data.intakeContext.projectTarget);
    } catch (error) {
      const response = websiteOnlyProductionResponse(error);
      if (response) return response;
      throw error;
    }
  }
  const parsedRequest = ChatRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return Response.json(
      { error: "Invalid chat request", issues: parsedRequest.error.issues },
      { status: 400 }
    );
  }
  const { attemptId, messages, intakeContext } = parsedRequest.data;
  const requestFingerprint = canonicalRequestFingerprint({ messages, intakeContext });
  let existingAttempt;
  try {
    existingAttempt = await (
      dependencies.inspectIntakeAttempt ?? inspectIntakeAttempt
    )(
      attemptId,
      requestFingerprint
    );
  } catch (error) {
    if (error instanceof IntakeAttemptConflict) {
      return Response.json(
        { error: error.message },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    throw error;
  }
  if (existingAttempt?.state === "completed") {
    return Response.json(
      { runId: existingAttempt.runId, started: true, replayed: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const configuration = (dependencies.preflight ?? preflight)("refero", {
    businessResearch:
      intakeContext.research.enabled &&
      intakeContext.research.businessIntelligence,
    referenceResearch:
      intakeContext.research.enabled &&
      intakeContext.research.referoDesignEvidence,
    allowPaidFirecrawlFallback:
      intakeContext.research.allowPaidFirecrawlFallback,
  });
  if (!configuration.ok) {
    return Response.json(
      {
        code: "missing-configuration",
        error: new ConfigError(configuration.blocking).message,
        issues: configuration.blocking,
      },
      { status: 422, headers: { "Cache-Control": "no-store" } }
    );
  }

  let attempt;
  try {
    attempt = await (dependencies.reserveIntakeAttempt ?? reserveIntakeAttempt)(
      attemptId,
      requestFingerprint
    );
  } catch (error) {
    if (error instanceof IntakeAttemptConflict) {
      return Response.json(
        { error: error.message },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    throw error;
  }
  if (attempt.state === "completed") {
    return Response.json(
      { runId: attempt.runId, started: true, replayed: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const result = dependencies.streamText({
    model: openrouter(MODELS.orchestrator),
    system: systemForContext(intakeContext),
    messages: await convertToModelMessages(messages as UIMessage[]),
    tools: {
      start_pipeline: tool({
        description:
          "Start the build pipeline once required intake facts are gathered and confirmed.",
        inputSchema: IntakeSchema,
        execute: (intake) =>
          startPipelineFromIntake(
            intake,
            intakeContext,
            attemptId,
            requestFingerprint
          ),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}

export async function POST(req: Request) {
  return handleChat(req);
}
