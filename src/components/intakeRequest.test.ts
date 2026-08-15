import { describe, expect, it } from "vitest";
import {
  completedChatReplayRunId,
  defaultResearchConfiguration,
  researchConfigurationForCapability,
} from "./intakeRequest";

describe("intake research defaults", () => {
  it("requests both evidence lanes without silently approving paid discovery", () => {
    expect(defaultResearchConfiguration()).toEqual({
      enabled: true,
      businessIntelligence: true,
      referoDesignEvidence: true,
      allowPaidFirecrawlFallback: false,
    });
  });

  it("fails closed until Refero capability is confirmed", () => {
    expect(researchConfigurationForCapability(false).referoDesignEvidence).toBe(false);
    expect(researchConfigurationForCapability(true).referoDesignEvidence).toBe(true);
  });
});

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
