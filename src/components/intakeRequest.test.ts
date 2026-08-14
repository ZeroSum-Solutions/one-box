import { describe, expect, it } from "vitest";
import { completedChatReplayRunId } from "./intakeRequest";

describe("completed chat replay transport", () => {
  it("extracts the original run from the pre-model JSON response", async () => {
    await expect(
      completedChatReplayRunId(
        Response.json({ runId: "original-run", started: true, replayed: true })
      )
    ).resolves.toBe("original-run");
  });

  it("leaves the AI SDK stream response for the SSE reducer", async () => {
    await expect(
      completedChatReplayRunId(
        new Response("data: {}", { headers: { "Content-Type": "text/event-stream" } })
      )
    ).resolves.toBeNull();
  });
});
