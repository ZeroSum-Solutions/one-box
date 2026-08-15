const RUN_ID = /^[a-z0-9_-]{4,40}$/i;

export function resumedRunId(search: string): string | null {
  const runId = new URLSearchParams(search).get("run");
  return runId && RUN_ID.test(runId) ? runId : null;
}

export function pipelineStatusLabel(event: PipelineEvent | undefined): string {
  if (event?.type === "paused") return "{ review required }";
  if (event?.type === "complete") return "{ complete }";
  if (event?.type === "error") return "{ blocked }";
  return "{ building }";
}

export async function consumePipelineRunStream(
  response: Response,
  onEvent: (event: PipelineEvent) => void
): Promise<boolean> {
  let terminal = false;
  await readSSE(response, (raw) => {
    if (!raw || typeof raw !== "object" || !("type" in raw)) return;
    const event = raw as PipelineEvent;
    if (event.type === "complete" || event.type === "paused" || event.type === "error") {
      terminal = true;
    }
    onEvent(event);
  });
  return terminal;
}
import type { PipelineEvent } from "../lib/contracts";
import { readSSE } from "./sse";
