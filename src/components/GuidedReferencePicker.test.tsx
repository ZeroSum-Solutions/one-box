import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  GuidedReferencePicker,
  persistReferenceDraft,
  referenceDraftForPersistence,
  referenceDraftKey,
} from "./GuidedReferencePicker";
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
    expect(html).toContain("Select at least one direction to continue.");
  });

  it("keeps the in-memory draft usable when browser storage rejects writes", () => {
    const storage = {
      setItem: () => { throw new DOMException("blocked", "SecurityError"); },
      removeItem: () => { throw new DOMException("blocked", "SecurityError"); },
    };
    expect(() => persistReferenceDraft(storage, "draft", "{}")).not.toThrow();
    expect(persistReferenceDraft(storage, "draft", "{}")).toBe(false);
    expect(() => persistReferenceDraft(storage, "draft")).not.toThrow();
    expect(persistReferenceDraft(storage, "draft")).toBe(false);
  });

  it("clears a discarded empty draft from browser storage", () => {
    const removed: string[] = [];
    const storage = {
      setItem: () => undefined,
      removeItem: (key: string) => { removed.push(key); },
    };
    expect(persistReferenceDraft(storage, "draft")).toBe(true);
    expect(removed).toEqual(["draft"]);
  });

  it("does not persist or clear a draft until storage hydration completes", () => {
    const draft = {
      choices: [{ referoId: "alpha", note: "Calm colors" }],
      overallNote: "Keep the tone restrained",
    };
    expect(referenceDraftForPersistence(draft, null, "draft-key")).toBeUndefined();
    expect(referenceDraftForPersistence(draft, "other-key", "draft-key")).toBeUndefined();
    expect(referenceDraftForPersistence(draft, "draft-key", "draft-key"))
      .toBe(JSON.stringify(draft));
    expect(referenceDraftForPersistence(
      { choices: [], overallNote: "" },
      "draft-key",
      "draft-key",
    )).toBeNull();
  });
});
