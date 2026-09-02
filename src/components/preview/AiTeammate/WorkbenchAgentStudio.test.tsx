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
    expect(source).toContain('data-retained-agent-studio="true"');
    expect(source).toContain(
      'const workbenchCollapsed = props.size === "collapsed";',
    );
    expect(source).toContain("hidden={workbenchCollapsed}");
    expect(source).toContain("aria-hidden={workbenchCollapsed || undefined}");
    expect(source).toContain("inert={workbenchCollapsed || undefined}");
    expect(source).toContain(
      "const agentStudioHidden = agentStudioInactive || workbenchCollapsed;",
    );
    expect(source).toContain("hidden={agentStudioHidden}");
    expect(source).toContain("aria-hidden={agentStudioHidden}");
    expect(source).toContain("inert={agentStudioHidden}");
    expect(source).not.toContain('{props.size !== "collapsed" && (');
    expect(source.match(/\{!workbenchCollapsed && \(/g)).toHaveLength(2);
    expect(source).toContain("key={props.runId}");
    expect(source).toContain('props.mode === "view"');
    expect(source).not.toContain(
      'import { AssistantPanel } from "./AssistantPanel";',
    );

    const previewPageSource = readFileSync(
      new URL("../../../app/preview/[id]/page.tsx", import.meta.url),
      "utf8",
    );
    expect(previewPageSource).toMatch(/<Workbench\s+key=\{id\}/);

    const workbenchStyles = readFileSync(
      new URL("../../../app/styles/workbench.css", import.meta.url),
      "utf8",
    );
    expect(workbenchStyles).toMatch(
      /\.workbench-panel\[hidden\]\s*\{[^}]*display:\s*none;/,
    );
  });
});
