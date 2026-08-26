import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuidedPipelineView } from "./GuidedPipeline";
import type { GuidedPipelineProjection } from "../lib/guidedPipeline";

function projection(
  surface: GuidedPipelineProjection["surface"],
): GuidedPipelineProjection {
  return { runId: "run-1234", businessName: "Northstar", costUsd: 0, surface };
}

describe("GuidedPipelineView", () => {
  it("shows a clean current/completed/future step sequence", () => {
    const html = renderToStaticMarkup(
      <GuidedPipelineView
        projection={projection({ kind: "research-running" })}
        onResume={() => undefined}
      />,
    );
    expect(html).toContain("Understanding your business");
    expect(html).toContain("Finding market leaders");
    expect(html).toContain("Choosing your direction");
    expect(html).toContain("Building your website");
    expect(html).toContain('aria-current="step"');
  });

  it("renders the map and an honest zero-competitor state", () => {
    const html = renderToStaticMarkup(
      <GuidedPipelineView
        projection={projection({
          kind: "market-leaders",
          source: "market-analysis",
          mapQuery: "plumber in Portland, OR",
          marketAnalysis: {
            schemaVersion: 1,
            status: "ready",
            generatedAt: "2026-08-25T12:00:00.000Z",
            displayCutoff: 4,
            competitors: [],
            commonPatterns: [],
            gaps: [],
          },
        })}
        onResume={() => undefined}
      />,
    );
    expect(html).toContain("/api/maps/embed?q=plumber%20in%20Portland%2C%20OR");
    expect(html).toContain("No verified competitor sites yet");
  });
});
