import { describe, expect, it } from "vitest";
import {
  CandidateProfileSchema,
  IntakeSchema,
  ReferenceLockSchema,
  ReferenceSelectionStateSchema,
} from "./contracts";
import {
  finalizeReferenceLock,
  referenceGateApplies,
  stageLockCandidates,
  type ReferenceStageDeps,
} from "./referenceStage";

const intake = IntakeSchema.parse({
  businessName: "Northstar Plumbing",
  category: "plumber",
  location: "Portland, Oregon",
  services: ["Emergency repairs"],
  primaryAction: "quote",
  vibeWords: ["warm", "capable"],
  research: {
    enabled: true,
    businessIntelligence: true,
    referoDesignEvidence: true,
    allowPaidFirecrawlFallback: false,
  },
});

const angles = ["warm craft", "calm dependable", "bright practical"];

const fullStyle = {
  colors: [
    { group: "surface", level: 1, value: "#F5F0E6" },
    { group: "brand", value: "#D89B38" },
    { group: "accent", value: "#23513A" },
    { group: "surface", level: 0, value: "#FFFFFF" },
    { group: "text", value: "#302820" },
  ],
};

function profile(referoId: string, recommended = false) {
  return {
    referoId,
    plainLanguageProfile: {
      headline: `${referoId} direction`,
      feelSummary: "A welcoming, dependable look for a local business.",
      bestFor: ["owners who want trust"],
      headsUp: [],
    },
    composition: {
      northStar: "Warm and straightforward",
      preserveTraits: ["calm backgrounds", "clear actions"],
      rhythmNote: "Give each section room to breathe.",
    },
    palette: [
      { hex: "#D89B38", plainLabel: "the button color" },
      { hex: "#23513A", plainLabel: "the supporting color" },
      { hex: "#F5F0E6", plainLabel: "the page background" },
      { hex: "#FFFFFF", plainLabel: "the light surface" },
      { hex: "#302820", plainLabel: "the text color" },
    ],
    recommended,
    recommendedWhy: recommended ? "The clearest fit for this business." : undefined,
  };
}

function deps(overrides: Partial<ReferenceStageDeps> = {}): ReferenceStageDeps {
  return {
    searchStyles: async (angle) => {
      const id = angle === angles[0] ? "ambrook" : angle === angles[1] ? "pipe" : "apron";
      return [
        {
          id,
          name: id[0].toUpperCase() + id.slice(1),
          summary: `${id} summary`,
          sourceUrl: `https://${id}.example`,
          previewImageUrl: `https://images.refero.design/styles/${id}/preview.jpg`,
        },
      ];
    },
    getStylesCached: async (ids) => new Map(ids.map((id) => [id, fullStyle])),
    generateJson: async (_runId, _model, _schema, prompt) => {
      if (prompt.includes("design-search angles")) return { angles };
      return {
        candidates: [
          profile("ambrook", true),
          profile("pipe"),
          profile("apron"),
        ],
      };
    },
    fetchImage: async () => undefined,
    mkdir: async () => undefined,
    writeFile: async () => undefined,
    now: () => new Date("2026-08-15T12:00:00.000Z"),
    ...overrides,
  };
}

describe("referenceGateApplies", () => {
  it.each([
    ["refero", true, true, true],
    ["refero", true, false, false],
    ["refero", false, true, false],
    ["local", true, true, false],
    ["none", true, true, false],
  ] as const)("requires Refero design research and the persisted picker flag", (mode, designEvidence, pickerEnabled, expected) => {
    expect(
      referenceGateApplies(
        mode,
        { ...intake.research, referoDesignEvidence: designEvidence },
        pickerEnabled
      )
    ).toBe(expected);
  });
});

describe("stageLockCandidates", () => {
  it("shortlists one usable unique style per angle and excludes prior selections", async () => {
    const version = await stageLockCandidates(
      "run-1234",
      intake,
      () => undefined,
      { excludedIds: ["pipe"] },
      deps({
        searchStyles: async (angle) => {
          if (angle === angles[0]) {
            return [
              { id: "ambrook", name: "Ambrook", summary: "warm", previewImageUrl: "https://images.refero.design/a.jpg" },
              { id: "ambrook", name: "Duplicate", summary: "duplicate", previewImageUrl: "https://images.refero.design/b.jpg" },
            ];
          }
          if (angle === angles[1]) {
            return [{ id: "pipe", name: "Pipe", summary: "technical", previewImageUrl: "https://images.refero.design/c.jpg" }];
          }
          return [{ id: "apron", name: "Apron", summary: "friendly", previewImageUrl: "https://images.refero.design/d.jpg" }];
        },
        generateJson: async (_runId, _model, _schema, prompt) =>
          prompt.includes("design-search angles")
            ? { angles }
            : { candidates: [profile("ambrook", true), profile("apron")] },
      })
    );

    expect(version?.candidates.map((candidate) => candidate.referoId)).toEqual([
      "ambrook",
      "apron",
    ]);
    expect(version?.excludedFromPrior).toEqual(["pipe"]);
  });

  it("returns null instead of presenting a one-option picker", async () => {
    const version = await stageLockCandidates(
      "run-1234",
      intake,
      () => undefined,
      undefined,
      deps({
        searchStyles: async () => [
          { id: "only", name: "Only", summary: "usable", previewImageUrl: "https://images.refero.design/only.jpg" },
        ],
      })
    );

    expect(version).toBeNull();
  });

  it("extracts a stable source-derived palette from the Ambrook-shaped full style", async () => {
    const version = await stageLockCandidates("run-1234", intake, () => undefined, undefined, deps());

    expect(version?.candidates[0].palette.map((entry) => entry.hex)).toEqual([
      "#D89B38",
      "#23513A",
      "#F5F0E6",
      "#FFFFFF",
      "#302820",
    ]);
    expect(CandidateProfileSchema.safeParse(version?.candidates[0]).success).toBe(true);
  });

  it("regenerates profiles once when the first response includes forbidden jargon", async () => {
    let profileCalls = 0;
    const version = await stageLockCandidates(
      "run-1234",
      intake,
      () => undefined,
      undefined,
      deps({
        generateJson: async (_runId, _model, _schema, prompt) => {
          if (prompt.includes("design-search angles")) return { angles };
          profileCalls += 1;
          return {
            candidates:
              profileCalls === 1
                ? [
                    {
                      ...profile("ambrook", true),
                      plainLanguageProfile: {
                        ...profile("ambrook", true).plainLanguageProfile,
                        feelSummary: "Use CSS variables for a welcoming local-business look.",
                      },
                    },
                    profile("pipe"),
                    profile("apron"),
                  ]
                : [profile("ambrook", true), profile("pipe"), profile("apron")],
          };
        },
      })
    );

    expect(profileCalls).toBe(2);
    expect(version?.candidates[0].plainLanguageProfile.feelSummary).not.toMatch(/CSS/i);
  });

  it("rejects model output that tries to recommend more than one option", async () => {
    await expect(
      stageLockCandidates(
        "run-1234",
        intake,
        () => undefined,
        undefined,
        deps({
          generateJson: async (_runId, _model, _schema, prompt) =>
            prompt.includes("design-search angles")
              ? { angles }
              : {
                  candidates: [profile("ambrook", true), profile("pipe", true), profile("apron")],
                },
        })
      )
    ).rejects.toThrow("exactly one candidate must carry the advisory recommendation");
  });
});

describe("finalizeReferenceLock", () => {
  it("folds the selected candidate into a valid deterministic reference lock", async () => {
    const version = await stageLockCandidates("run-1234", intake, () => undefined, undefined, deps());
    if (!version) throw new Error("test fixture must produce a picker version");
    const selection = ReferenceSelectionStateSchema.parse({
      status: "selected",
      rerollsUsed: 0,
      versions: [version],
      selection: {
        selectedId: "pipe",
        selectionKind: "user-picked-other",
        version: 1,
        at: "2026-08-15T13:00:00.000Z",
      },
    });

    const lock = await finalizeReferenceLock("run-1234", intake, selection, () => undefined);

    expect(ReferenceLockSchema.safeParse(lock).success).toBe(true);
    expect(lock.primary.referoId).toBe(selection.selection?.selectedId);
    expect(lock.rejected.map((candidate) => candidate.why)).toEqual([
      "not chosen by the owner",
      "not chosen by the owner",
    ]);
    expect(lock.decisionLedger[0].decision).toContain("2026-08-15T13:00:00.000Z");
    expect(lock.decisionLedger[1].decision).toContain("standard business-website format");
  });
});
