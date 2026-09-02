import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuidedPipelineView } from "./GuidedPipeline";
import type { GuidedPipelineProjection } from "../lib/guidedPipeline";
import { ReferenceSelectionStateSchema } from "../lib/contracts";

function projection(
  surface: GuidedPipelineProjection["surface"],
  extras: Record<string, unknown> = {},
): GuidedPipelineProjection {
  return { runId: "run-1234", businessName: "Northstar", costUsd: 0, surface, ...extras } as GuidedPipelineProjection;
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

  it("renders a deliberate Google Maps fallback instead of the raw unavailable embed", () => {
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
        }, { mapEmbedConfigured: false })}
        onResume={() => undefined}
      />,
    );
    expect(html).not.toContain("<iframe");
    expect(html).toContain("https://www.google.com/maps/search/?api=1&amp;query=plumber%20in%20Portland%2C%20OR");
    expect(html).toContain("Open market map");
    expect(html).toContain("No verified competitor sites yet");
  });

  it("renders the embed only when server configuration says it is available", () => {
    const html = renderToStaticMarkup(
      <GuidedPipelineView
        projection={projection({
          kind: "market-leaders",
          source: "legacy-scan",
          mapQuery: "plumber in Portland, OR",
        }, { mapEmbedConfigured: true })}
        onResume={() => undefined}
      />,
    );
    expect(html).toContain("<iframe");
    expect(html).toContain("/api/maps/embed?q=plumber%20in%20Portland%2C%20OR");
    expect(html).toContain('loading="eager"');
    expect(html).toContain("Open market map");
  });

  it("keeps the market and discovered site links visible beside reference choice", () => {
    const html = renderToStaticMarkup(
      <GuidedPipelineView
        projection={projection({
          kind: "reference-pending",
          selection: ReferenceSelectionStateSchema.parse({
            status: "pending",
            rerollsUsed: 0,
            versions: [{
              version: 1,
              createdAt: "2026-08-25T12:00:00.000Z",
              searchAngles: ["local", "service", "trust"],
              candidates: [{
                referoId: "alpha",
                kind: "style",
                name: "Alpha",
                foundVia: "local",
                palette: [{ hex: "#112233", plainLabel: "dark" }, { hex: "#ddeeff", plainLabel: "light" }],
                plainLanguageProfile: { headline: "Calm", feelSummary: "Clear", bestFor: ["service firms"], headsUp: [] },
                composition: { northStar: "Clear", preserveTraits: ["space", "clear actions"], rhythmNote: "steady" },
                recommended: true,
                recommendedWhy: "Fit",
              }, {
                referoId: "beta",
                kind: "style",
                name: "Beta",
                foundVia: "service",
                palette: [{ hex: "#223344", plainLabel: "deep" }, { hex: "#eef5ff", plainLabel: "pale" }],
                plainLanguageProfile: { headline: "Direct", feelSummary: "Focused", bestFor: ["local operators"], headsUp: [] },
                composition: { northStar: "Direct", preserveTraits: ["proof", "simple navigation"], rhythmNote: "brisk" },
                recommended: false,
              }],
            }],
          }),
        }, {
          mapEmbedConfigured: false,
          marketContext: {
            source: "legacy-scan",
            analysisStatus: "ready",
            mapQuery: "plumber in Portland, OR",
            scan: {
              competitors: [{
                name: "Alpha Plumbing",
                url: "https://alpha.example",
                source: "plumber Portland",
                kind: "unknown",
                kindReason: "first-party site discovered",
                mapsSearchUrl: "https://www.google.com/maps/search/?api=1&amp;query=Alpha",
                screenshotPaths: [],
                structure: [],
                crawlAttempts: [],
              }],
              commonSections: [],
              gaps: [],
              excluded: [],
            },
          },
        })}
        onResume={() => undefined}
      />,
    );
    expect(html).toContain("Sites found in your market");
    expect(html).toContain("https://alpha.example");
    expect(html).toContain("guided-competitor--pending");
    expect(html).toContain("Captured site");
    expect(html).not.toContain("Analysis in progress");
    expect(html).toContain("Choose up to three");
    expect(html).toContain("Competitive research · 1 site");
    expect(html).not.toContain("<details open=");
  });

  it("does not duplicate a discovered site after its canonical analysis is ready", () => {
    const html = renderToStaticMarkup(
      <GuidedPipelineView
        projection={projection({ kind: "research-running" }, {
          mapEmbedConfigured: false,
          marketContext: {
            source: "market-analysis",
            mapQuery: "pool service in Austin, TX",
            marketAnalysis: {
              schemaVersion: 1,
              status: "ready",
              generatedAt: "2026-08-25T12:00:00.000Z",
              displayCutoff: 4,
              competitors: [{
                id: "alpha.example",
                name: "Alpha Pool Care",
                url: "https://alpha.example/",
                rank: 1,
                totalScore: 0,
                confidence: "low",
                screenshots: {},
                selectedBecause: [{ text: "Relevant service", basis: "observed", evidence: [] }],
                strengths: [],
                gaps: [],
                rubric: [],
              }],
              commonPatterns: [],
              gaps: [],
            },
            scan: {
              competitors: [{
                name: "Alpha Pool Care",
                url: "https://alpha.example/?utm_source=search",
                source: "pool service Austin",
                kind: "unknown",
                kindReason: "first-party site discovered",
                screenshotPaths: [],
                structure: [],
                crawlAttempts: [],
              }],
              commonSections: [],
              gaps: [],
              excluded: [],
            },
          },
        })}
        onResume={() => undefined}
      />,
    );
    expect(html.match(/class="guided-competitor"/g)).toHaveLength(1);
  });
});
