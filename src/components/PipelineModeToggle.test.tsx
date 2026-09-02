import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PipelineModeToggle, resolvePipelineMode } from "./PipelineModeToggle";

describe("PipelineModeToggle", () => {
  it("defaults to guided while query overrides local persistence", () => {
    expect(resolvePipelineMode("", null)).toBe("guided");
    expect(resolvePipelineMode("", "developer")).toBe("developer");
    expect(resolvePipelineMode("?view=guided", "developer")).toBe("guided");
    expect(resolvePipelineMode("?view=developer", "guided")).toBe("developer");
  });

  it("renders a semantic two-state control without a mutation form", () => {
    const html = renderToStaticMarkup(
      <PipelineModeToggle mode="guided" onChange={() => undefined} />,
    );
    expect(html).toContain("Guided");
    expect(html).toContain("Developer");
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("<form");
  });
});
