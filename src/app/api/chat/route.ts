/**
 * Intake conversation. A small streaming chat whose ONLY tool is
 * start_pipeline(intake) — the model must elicit real business facts
 * (audit E26: never invent; ask) before firing it.
 */
import { streamText, tool, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { IntakeSchema, ARTIFACTS, MODELS } from "@/lib/contracts";
import { createRun, saveArtifact, startStage, finishStage } from "@/lib/runstate";
import { openrouter } from "@/lib/openrouter";

export const maxDuration = 120;

const SYSTEM = `You are the intake assistant for one-box, a studio tool that builds a complete local-service website from one conversation.

Your job: gather REAL facts, then call start_pipeline. Required before you may call it: business name, category, city+state location, at least one service, and the primary action (call | book | quote). Strongly ask for (but don't block on): phone, service area, years in business, certifications, true claims worth featuring, existing website URL, and 2-3 vibe words for how the site should feel.

Rules:
- Never invent a fact. If the user doesn't provide it, it stays empty.
- Ask at most 2-3 focused questions per turn; keep the voice warm and plain.
- This pilot builds single-page local-service sites (brochure tier). If asked for e-commerce, portals, or app-like builds, say honestly that this prototype doesn't do that yet.
- When you have the required facts, confirm the summary in one compact block, then call start_pipeline.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openrouter(MODELS.orchestrator),
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    tools: {
      start_pipeline: tool({
        description:
          "Start the build pipeline once required intake facts are gathered and confirmed.",
        inputSchema: IntakeSchema,
        execute: async (intake) => {
          const parsed = IntakeSchema.parse(intake);
          const runId = await createRun();
          await startStage(runId, "intake");
          await saveArtifact(runId, ARTIFACTS.intake, parsed);
          await finishStage(runId, "intake");
          return { runId, started: true };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
