import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReferenceSelectionStateSchema } from "../lib/contracts";
import { ReferenceSelectionPanel } from "./ReferenceSelectionPanel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function candidate(referoId: string, recommended: boolean) {
  return {
    referoId,
    kind: "style" as const,
    name: `${referoId} direction`,
    sourceUrl: `https://refero.design/${referoId}`,
    previewImageUrl: `https://images.refero.design/${referoId}.jpg`,
    foundVia: "a test search angle",
    palette: [
      { hex: "#112233", plainLabel: "the dark anchor" },
      { hex: "#ddeeff", plainLabel: "the light backdrop" },
    ],
    plainLanguageProfile: {
      headline: `${referoId} feel`,
      feelSummary: "Clear and welcoming.",
      bestFor: ["A local business"],
      headsUp: [],
    },
    composition: {
      northStar: "Keep the opening clear.",
      preserveTraits: ["Clear calls to action", "Comfortable breathing room"],
      rhythmNote: "Alternate detail and pause.",
    },
    recommended,
    ...(recommended ? { recommendedWhy: "Best fit for the brief." } : {}),
  };
}

describe("ReferenceSelectionPanel", () => {
  it("uses the same summary-first, attachment-aware decision surface as evidence gates", () => {
    const selection = ReferenceSelectionStateSchema.parse({
      status: "pending",
      rerollsUsed: 0,
      versions: [{
        version: 1,
        createdAt: "2026-08-25T12:00:00.000Z",
        searchAngles: ["first angle", "second angle", "third angle"],
        candidates: [candidate("recommended", true), candidate("other", false)],
      }],
    });

    const html = renderToStaticMarkup(
      <ReferenceSelectionPanel runId="run-reference-review" initial={selection} />,
    );

    const deciding = html.indexOf("What are we deciding?");
    const composer = html.indexOf("Add feedback or evidence");
    expect(deciding).toBeGreaterThan(-1);
    expect(html).toContain("What did OneBox learn?");
    expect(html).toContain("What does the proposed choice look like?");
    expect(html).toContain("What do you need to do next?");
    expect(composer).toBeGreaterThan(deciding);
    expect(html).toContain("Drop files here");
    expect(html).toContain("Send feedback");
    expect(html).toContain("Approve to Continue");
    expect(html).toContain("Request Changes");
  });
});
