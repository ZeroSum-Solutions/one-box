import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  DesignResearchLedger,
  EvidenceWorkflowState,
} from "../../lib/contracts";
import {
  ResearchFindings,
  ResearchFindingsContent,
  latestResearchLedger,
  researchStateFromResponse,
  stateForRun,
} from "./ResearchFindings";

const createdAt = "2026-08-14T12:00:00.000Z";
const ledger: DesignResearchLedger = {
  projectTarget: "website",
  businessIntelligence: {
    kind: "business-intelligence",
    sources: [
      {
        id: "business-source",
        sourceUrl: "https://business.example/report",
        title: "Market report",
        capturedAt: createdAt,
        confidence: 0.84,
        screenshotPaths: [],
        extractedArtifactPaths: [],
        crawlAttempts: [],
      },
    ],
    competitors: [
      {
        name: "Competitor One",
        url: "https://competitor.example",
        selectionRationale: "Comparable audience and offer.",
        strengths: [],
        gaps: [],
      },
    ],
    marketExpectations: [],
    differentiationOpportunities: [],
    claims: [
      {
        id: "business-claim",
        statement: "Visitors expect clear pricing.",
        classification: "observed",
        sourceIds: ["business-source"],
        confidence: 0.78,
      },
    ],
  },
  referoDesignEvidence: {
    kind: "refero-design-evidence",
    sources: [
      {
        id: "refero-source",
        sourceUrl: "https://refero.design/example",
        title: "Refero example",
        capturedAt: createdAt,
        confidence: 0.93,
        screenshotPaths: [],
        extractedArtifactPaths: [],
        crawlAttempts: [],
      },
    ],
    references: [
      {
        referoId: "ref-1",
        name: "Reference One",
        sourceUrl: "https://refero.design/reference-one",
        learningRationale: "Clear hierarchy.",
        reusablePatterns: ["Contrast", "Spacing"],
      },
    ],
    claims: [
      {
        id: "refero-claim",
        statement: "The hero uses a clear CTA hierarchy.",
        classification: "inferred",
        sourceIds: ["refero-source"],
        confidence: 0.88,
      },
    ],
  },
  clientEvidence: {
    sources: [],
    claims: [],
    artifactRelationships: [],
    unsupportedUploadIds: [],
  },
};

const workflow: EvidenceWorkflowState = {
  currentStage: "evidence",
  artifacts: [
    {
      artifactType: "ledger",
      version: 1,
      createdAt,
      approvalTransitions: [{ state: "draft", at: createdAt }],
      artifact: ledger,
    },
  ],
};

describe("ResearchFindings", () => {
  it("keeps business and Refero findings distinct with linked sources, claims, confidence, and rationale", () => {
    const html = renderToStaticMarkup(
      <ResearchFindingsContent state={{ kind: "ready", ledger }} />,
    );

    expect(html).toContain("Business intelligence");
    expect(html).toContain("not design references");
    expect(html).toContain("Refero design reference evidence");
    expect(html).toContain("not competitor research");
    expect(html).toContain('href="https://business.example/report"');
    expect(html).toContain('href="https://refero.design/reference-one"');
    expect(html).toContain("78% confidence");
    expect(html).toContain("88% confidence");
    expect(html).toContain("Rationale: Comparable audience and offer.");
    expect(html).toContain("Rationale: Clear hierarchy.");
  });

  it("selects the most recent retained ledger and models empty and legacy responses", () => {
    expect(latestResearchLedger(workflow)).toEqual(ledger);
    expect(researchStateFromResponse({ pipelineVersion: "evidence-gated-v2", workflow }))
      .toMatchObject({ kind: "ready", ledger });
    expect(researchStateFromResponse({ pipelineVersion: "evidence-gated-v2", workflow: { currentStage: "evidence", artifacts: [] } }))
      .toEqual({ kind: "empty" });
    expect(researchStateFromResponse({ pipelineVersion: "legacy", workflow }))
      .toMatchObject({ kind: "unsupported" });
  });

  it("does not carry prior-run evidence or unsafe competitor URLs into the next render", () => {
    expect(
      stateForRun("run-b", { runId: "run-a", state: { kind: "ready", ledger } }),
    ).toEqual({ kind: "loading" });

    const unsafeLedger: DesignResearchLedger = {
      ...ledger,
      businessIntelligence: {
        ...ledger.businessIntelligence,
        competitors: [
          { ...ledger.businessIntelligence.competitors[0], url: "javascript:alert(1)" },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <ResearchFindingsContent state={{ kind: "ready", ledger: unsafeLedger }} />,
    );
    expect(html).toContain("Competitor One");
    expect(html).not.toContain("javascript:");
  });

  it("renders loading, error, empty, and unsupported states without calling fetch during server rendering", () => {
    const fetchMock = vi.fn();
    const previousFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      expect(renderToStaticMarkup(<ResearchFindings runId="run-test" />)).toContain("Loading saved evidence");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(renderToStaticMarkup(<ResearchFindingsContent state={{ kind: "error", message: "Forbidden" }} />)).toContain('role="alert"');
      expect(renderToStaticMarkup(<ResearchFindingsContent state={{ kind: "empty" }} />)).toContain("No saved research findings");
      expect(renderToStaticMarkup(<ResearchFindingsContent state={{ kind: "unsupported", message: "Legacy" }} />)).toContain("Saved research is unavailable");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
