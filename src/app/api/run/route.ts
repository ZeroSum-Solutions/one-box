/**
 * SSE stream of pipeline progress. POST /api/run { runId }
 * Re-opening the stream after a disconnect resumes from run.json checkpoints.
 */
import { z } from "zod";
import { runPipeline } from "../../../lib/pipeline";
import type { PipelineEvent } from "../../../lib/contracts";
import { isLocalApiAuthorized } from "../../../lib/localApiAuth";

export const maxDuration = 600;
export const dynamic = "force-dynamic";

const RunRequestSchema = z.object({
  runId: z.string().regex(/^[a-z0-9_-]{4,40}$/i),
});

export async function POST(req: Request) {
  // This route starts or resumes model/tool work. Apply mutation-strength
  // authorization before parsing input or invoking the pipeline.
  if (!isLocalApiAuthorized(req)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = RunRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "bad runId" }, { status: 400 });
  }
  const { runId } = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: PipelineEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      };
      // Long model calls leave the stream silent for minutes; undici kills a
      // quiet body after 300s (UND_ERR_BODY_TIMEOUT, observed live). SSE
      // comment frames keep every consumer's connection warm.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 20_000);
      try {
        await runPipeline(runId, send);
      } catch {
        // error event already emitted by the pipeline
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
