import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuidedReferencePicker, referenceDraftKey } from "./GuidedReferencePicker";
import { ReferenceSelectionStateSchema } from "../lib/contracts";

const selection = ReferenceSelectionStateSchema.parse({
  status: "pending",
  rerollsUsed: 0,
  versions: [{
    version: 1,
    createdAt: "2026-08-25T12:00:00.000Z",
    searchAngles: ["warm", "clear", "local"],
    candidates: ["alpha", "beta"].map((referoId, index) => ({
      referoId,
      kind: "style",
      name: referoId,
      foundVia: "test",
      palette: [{ hex: "#112233", plainLabel: "dark" }, { hex: "#ddeeff", plainLabel: "light" }],
      plainLanguageProfile: { headline: `${referoId} feel`, feelSummary: "Clear and calm", bestFor: ["local firms"], headsUp: [] },
      composition: { northStar: "Clear", preserveTraits: ["space", "proof"], rhythmNote: "steady" },
      recommended: index === 0,
      ...(index === 0 ? { recommendedWhy: "Best fit" } : {}),
    })),
  }],
});

describe("GuidedReferencePicker", () => {
  it("scopes drafts to the run and candidate version", () => {
    expect(referenceDraftKey("run-1234", selection)).toBe(
      "onebox:reference-draft:run-1234:1",
    );
  });

  it("renders visual choices, rank guidance, and one confirmation action", () => {
    const html = renderToStaticMarkup(
      <GuidedReferencePicker
        runId="run-1234"
        selection={selection}
        onConfirmed={() => undefined}
      />,
    );
    expect(html).toContain("Choose up to three");
    expect(html).toContain("What do you like about it?");
    expect(html).toContain("Confirm direction");
    expect(html.match(/Confirm direction/g)).toHaveLength(1);
  });
});
