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
  intakeContext: IntakeChatContext
) {
  return {
    messages: history.map((message) => ({
      id: message.id,
      role: message.role,
      parts: [{ type: "text" as const, text: message.content }],
    })),
    intakeContext,
  };
}
