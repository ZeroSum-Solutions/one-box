import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Workbench Agent Studio integration", () => {
  it("uses the assistant rail slot for Agent Studio with Teammates as its default", () => {
    const source = readFileSync(
      new URL("../Workbench.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'import { AgentStudioPanel } from "./AiTeammate/AgentStudioPanel";',
    );
    expect(source).toContain('{ id: "assistant", label: "Agent Studio" }');
    expect(source).toContain("<AgentStudioPanel");
    expect(source).not.toContain(
      'import { AssistantPanel } from "./AssistantPanel";',
    );
  });
});
