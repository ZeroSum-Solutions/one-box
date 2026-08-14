import type {
  ProjectTarget,
  ResearchConfiguration,
  UploadMetadata,
} from "@/lib/contracts";

export interface IntakeChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface IntakeChatContext {
  projectTarget: ProjectTarget;
  research: ResearchConfiguration;
  uploads: UploadMetadata[];
  uploadSession: string | null;
}

export function buildChatRequest(
  history: IntakeChatMessage[],
  intakeContext: IntakeChatContext,
  attemptId: string
) {
  return {
    attemptId,
    messages: history.map((message) => ({
      id: message.id,
      role: message.role,
      parts: [{ type: "text" as const, text: message.content }],
    })),
    intakeContext,
  };
}

/** AI stream retries may receive a pre-model completed-attempt response. */
export async function completedChatReplayRunId(
  response: Response
): Promise<string | null> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return null;
  }
  const replay = (await response.json()) as { runId?: unknown };
  if (typeof replay.runId !== "string") {
    throw new Error("Chat replay response did not include a run id.");
  }
  return replay.runId;
}
