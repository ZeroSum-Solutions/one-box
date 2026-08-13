/**
 * SSE stream of pipeline progress. GET /api/run?runId=xyz
 * Re-opening the stream after a disconnect resumes from run.json checkpoints.
 */
import { runPipeline } from "@/lib/pipeline";
import type { PipelineEvent } from "@/lib/contracts";

export const maxDuration = 600;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("runId");
  if (!runId || !/^[a-z0-9_-]{4,40}$/i.test(runId)) {
    return new Response("bad runId", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: PipelineEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      };
      try {
        await runPipeline(runId, send);
      } catch {
        // error event already emitted by the pipeline
      } finally {
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
