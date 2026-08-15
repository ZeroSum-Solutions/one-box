import { describe, expect, it } from "vitest";
import { describeTokensForEdit } from "./editorPromptContext";
import type { DesignTokens } from "./contracts";

const tokens = {
  colors: [
    {
      name: "Harvest Gold",
      value: "#e8b672",
      cssVar: "--color-accent",
      role: "primary call-to-action buttons only",
      forbidden: "backgrounds, body text, borders",
    },
    {
      name: "Greige Canvas",
      value: "#fcfaf1",
      cssVar: "--color-canvas",
      role: "page background",
    },
  ],
  fonts: [
    {
      family: "Lora",
      cssVar: "--font-display",
      weights: [500, 700],
      role: "display headings only",
      substitutes: [],
    },
  ],
} as unknown as DesignTokens;

describe("describeTokensForEdit", () => {
  it("carries every color's role into the edit prompt", () => {
    const out = describeTokensForEdit(tokens);
    expect(out).toContain("--color-accent");
    expect(out).toContain("primary call-to-action buttons only");
    expect(out).toContain("--color-canvas");
    expect(out).toContain("page background");
  });

  it("carries the forbidden context when a color has one and omits the clause when it does not", () => {
    const out = describeTokensForEdit(tokens);
    expect(out).toMatch(/--color-accent.*never: backgrounds, body text, borders/);
    expect(out).not.toMatch(/--color-canvas.*never:/);
  });

  it("carries font roles, not just names", () => {
    const out = describeTokensForEdit(tokens);
    expect(out).toContain("--font-display");
    expect(out).toContain("Lora");
    expect(out).toContain("display headings only");
  });
});
