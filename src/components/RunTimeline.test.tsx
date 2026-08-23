import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CANDIDATE_GATE_EXPECTATIONS,
  type PipelineEvent,
} from "../lib/contracts";

vi.mock("./MarketFeature", () => ({
  collectMarketIntel: () => null,
  MarketFeature: () => null,
}));

import { RunTimeline, timelineNode } from "./RunTimeline";

function renderTimeline(events: PipelineEvent[], options: {
  terminal?: "complete" | "paused" | "error" | null;
  previewUrl?: string | null;
  evidenceUrl?: string | null;
} = {}) {
  return renderToStaticMarkup(
    <RunTimeline
      runId="run-review"
      timeline={events.map((event, index) => ({ key: String(index), event }))}
      costUsd={0}
      previewUrl={options.previewUrl ?? null}
      evidenceUrl={options.evidenceUrl ?? null}
      terminal={options.terminal ?? null}
      hasActiveAttempt={false}
      onRecover={() => undefined}
    />
  );
}

describe("RunTimeline PageIR truth", () => {
  it("renders Source Bundle review as a build-stage pause with its immutable binding", () => {
    const html = renderTimeline([
      {
        type: "page-ir-source-paused",
        runId: "run-review",
        stage: "built",
        reviewState: "in-review",
        payloadSha256: "abcdef012345" + "0".repeat(52),
        workspaceUrl: "/evidence/run-review",
        note: "Named human review required",
        at: "2026-08-23T12:00:00.000Z",
      },
    ], {
      terminal: "paused",
      evidenceUrl: "/evidence/run-review",
    });

    expect(html).toContain("Build");
    expect(html).toContain("PageIR Source Bundle review");
    expect(html).toContain("in-review");
    expect(html).toContain("abcdef012345");
    expect(html).toContain("2026-08-23");
    expect(html).toContain('href="/evidence/run-review"');
    expect(html).not.toContain("Open preview");
    expect(html).not.toContain("{ complete }");
  });

  it("renders all ordered candidate reports with status, advisory truth, and failure details", () => {
    const reports = CANDIDATE_GATE_EXPECTATIONS.map(({ gate, blocking }, index) => ({
      gate,
      pass: gate !== "axe",
      blocking,
      details: gate === "axe" ? ["missing required asset", "telephone target drift"] : [],
      ranAt: `2026-08-23T12:00:0${index}.000Z`,
    }));
    const event: PipelineEvent = {
      type: "card",
      stage: "built",
      title: "Candidate gates",
      body: "Nine reports",
      gates: reports,
    };
    const html = renderToStaticMarkup(
      <>{timelineNode({ key: "candidate", event }, "run-review")}</>
    );

    const renderedGateOrder = [...html.matchAll(
      /<span class="gate-row__name">([^<]+)<\/span>/g,
    )].map((match) => match[1]);
    expect(renderedGateOrder).toEqual(
      CANDIDATE_GATE_EXPECTATIONS.map(({ gate }) => gate),
    );
    const renderedAdvisoryGates = [...html.matchAll(
      /<span class="gate-row__name">([^<]+)<\/span><span class="gate-row__advisory">advisory<\/span>/g,
    )].map((match) => match[1]);
    expect(renderedAdvisoryGates).toEqual(
      CANDIDATE_GATE_EXPECTATIONS
        .filter(({ blocking }) => !blocking)
        .map(({ gate }) => gate),
    );
    expect(html.match(/gate-dot--pass/g)).toHaveLength(8);
    expect(html.match(/gate-dot--fail/g)).toHaveLength(1);
    expect(html).toContain("missing required asset");
    expect(html).toContain("telephone target drift");
  });

  it("does not infer completion from candidate, promotion, or QA cards", () => {
    const html = renderTimeline([
      { type: "card", stage: "built", title: "Candidate ready", body: "ready" },
      { type: "card", stage: "built", title: "Promoted", body: "promoted" },
      { type: "card", stage: "built", title: "Visual QA", body: "recorded" },
    ], { previewUrl: "/preview/run-review" });

    expect(html).not.toContain("{ complete }");
    expect(html).not.toContain("Open preview");
  });

  it("still renders Open preview only for a genuine complete event", () => {
    const html = renderTimeline([
      { type: "complete", runId: "run-review", previewUrl: "/preview/run-review" },
    ], {
      terminal: "complete",
      previewUrl: "/preview/run-review",
    });

    expect(html).toContain("{ complete }");
    expect(html).toContain("Open preview");
  });
});
