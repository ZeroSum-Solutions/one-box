import { describe, expect, it } from "vitest";
import { ReferenceStyleDigestSchema } from "./contracts";
import {
  projectReferenceRecordForPrompt,
  ReferoStyleProjectionSchema,
} from "./referoStyleProjection";
import { serializeReferenceRecordForPrompt } from "./referenceRecordPrompt";

function ambrookStyle() {
  return {
    id: "ambrook-style",
    title: "Ambrook",
    northStar: "Rustic ledger on cream parchment",
    theme: "warm rural craftsmanship",
    description: "A grounded financial tool with generous paper-like surfaces.",
    colors: [
      {
        hex: "#D89B38",
        name: "Harvest Gold",
        role: "primary CTA only",
        group: "accent",
        ignored: "drop me",
      },
    ],
    typography: [
      {
        role: "display",
        sizes: "48px / 56px",
        family: "Lateral",
        source: "Google Fonts",
        weight: "700",
        lineHeight: "1.05",
        substitute: "Inter",
        letterSpacing: "-0.02em",
        ignored: "drop me",
      },
    ],
    typeScale: ["12px", "16px", "24px"],
    spacing: {
      radius: { button: "4px", card: "8px", ignored: "drop me" },
      density: "relaxed",
      baseUnit: "8px",
      elementGap: "16px",
      sectionGap: "80px",
      cardPadding: "32px",
      pageMaxWidth: "1200px",
      ignored: "drop me",
    },
    surfaces: [
      {
        hex: "#F5F0E6",
        name: "Cream Parchment",
        level: 0,
        purpose: "Main canvas",
        ignored: "drop me",
      },
    ],
    components: [
      {
        name: "Primary button",
        role: "conversion",
        description: "Gold rectangular action with dark text",
        ignored: "drop me",
      },
    ],
    layout: "Alternate cream canvas and warm paper sections.",
    imagery: "Candid, warm, subtly desaturated agricultural photography.",
    dos: ["Reserve gold for primary actions"],
    donts: ["Do not use glossy gradients"],
    customSections: [
      { title: "Agent Prompt Guide", content: "x".repeat(40_000) },
      { title: "Motion Philosophy", content: "Quick, quiet reveals." },
    ],
    unknownTopLevel: "drop me",
  };
}

describe("projectReferenceRecordForPrompt", () => {
  it("retains synthesis fields from an Ambrook-shaped style and drops Agent Prompt Guide", () => {
    const projected = JSON.parse(projectReferenceRecordForPrompt(ambrookStyle()));

    expect(projected).toMatchObject({
      title: "Ambrook",
      colors: [{ hex: "#D89B38", role: "primary CTA only" }],
      surfaces: [{ hex: "#F5F0E6", purpose: "Main canvas" }],
      dos: ["Reserve gold for primary actions"],
      donts: ["Do not use glossy gradients"],
      layout: "Alternate cream canvas and warm paper sections.",
      customSections: [{ title: "Motion Philosophy" }],
    });
    expect(projected.unknownTopLevel).toBeUndefined();
    expect(projected.colors[0].ignored).toBeUndefined();
    expect(projected.customSections).toHaveLength(1);
    expect(ReferoStyleProjectionSchema.parse(ambrookStyle())).toEqual(projected);
  });

  it("falls back byte-for-byte for a screen-shaped record", () => {
    const screen = {
      id: "screen-1",
      title: "Pricing screen",
      description: "A pricing-page screenshot",
      blocks: [{ kind: "pricing" }],
    };

    expect(projectReferenceRecordForPrompt(screen)).toBe(
      serializeReferenceRecordForPrompt(screen)
    );
  });

  it("falls back for null records", () => {
    expect(projectReferenceRecordForPrompt(null)).toBe(
      serializeReferenceRecordForPrompt(null)
    );
  });

  it("keeps projected output below the defensive 32k cap", () => {
    const style = {
      ...ambrookStyle(),
      irrelevantBlob: "x".repeat(100_000),
    };

    expect(projectReferenceRecordForPrompt(style).length).toBeLessThanOrEqual(32_000);
  });
});

describe("ReferenceStyleDigestSchema", () => {
  const validDigest = {
    sourceStyleId: "ambrook-style",
    designContractVersion: 1,
    northStar: "Rustic ledger on cream parchment",
    preserveTraits: ["cream canvas", "gold primary actions", "quiet typography"],
    sectionRhythm: "Alternate canvas and paper surfaces to create deliberate pauses.",
    surfaces: [{ level: 0, purpose: "primary parchment canvas" }],
    componentRecipes: ["Square gold CTA with dark text and restrained hover."],
    imageryTreatment: "Warm, candid, softly desaturated photography.",
    motionPersonality: "Quick and quiet.",
    dosDonts: [
      { polarity: "do", rule: "Use gold only for primary conversion actions." },
      { polarity: "do", rule: "Keep section transitions spacious." },
      { polarity: "dont", rule: "Do not use glossy gradients." },
      { polarity: "dont", rule: "Do not make controls pill-shaped." },
    ],
  };

  it("rejects an all-do ruleset and out-of-range digest fields", () => {
    expect(
      ReferenceStyleDigestSchema.safeParse({
        ...validDigest,
        dosDonts: validDigest.dosDonts.map((entry) => ({
          ...entry,
          polarity: "do",
        })),
      }).success
    ).toBe(false);
    expect(
      ReferenceStyleDigestSchema.safeParse({
        ...validDigest,
        northStar: "x".repeat(201),
        surfaces: [{ level: 4, purpose: "x".repeat(161) }],
      }).success
    ).toBe(false);
  });
});
