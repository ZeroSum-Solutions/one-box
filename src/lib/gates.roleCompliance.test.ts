import { describe, expect, it } from "vitest";
import type { DesignTokens } from "./contracts";
import { evaluateColorRoleCompliance } from "./gates";

const tokens = {
  colors: [
    {
      name: "Harvest Gold",
      value: "#e8b672",
      cssVar: "--color-accent",
      role: "primary call-to-action buttons only",
      forbiddenContexts: ["section-background", "body-text", "large-surface"],
    },
    {
      // A band color's own surface IS a section background — banning it there
      // would false-block every legitimate render (review finding). Bans are
      // only for contexts the color must NEVER paint.
      name: "Midnight CTA Band",
      value: "#172033",
      cssVar: "--color-cta-band",
      role: "call-to-action band only",
      forbiddenContexts: ["body-text"],
    },
    {
      name: "Canvas",
      value: "#f8f5ef",
      cssVar: "--color-canvas",
      role: "page canvas",
      forbiddenContexts: [],
    },
  ],
} as unknown as DesignTokens;

describe("evaluateColorRoleCompliance", () => {
  it("blocks an accent tagged for section backgrounds when a section uses it", () => {
    expect(
      evaluateColorRoleCompliance(
        [
          {
            editId: "services",
            selector: '[data-edit-id="services"]',
            context: "section-background",
            colorHex: "#e8b672",
          },
        ],
        tokens
      )
    ).toEqual([
      {
        selector: '[data-edit-id="services"]',
        context: "section-background",
        colorHex: "#e8b672",
        tokenName: "Harvest Gold",
      },
    ]);
  });

  it("allows a band color on the section surface it exists to paint", () => {
    expect(
      evaluateColorRoleCompliance(
        [
          {
            selector: "section.cta-band",
            context: "section-background",
            colorHex: "#172033",
          },
          {
            selector: "section.cta-band",
            context: "large-surface",
            colorHex: "#172033",
          },
        ],
        tokens
      )
    ).toEqual([]);
  });

  it("blocks a band color where its tags do forbid it", () => {
    expect(
      evaluateColorRoleCompliance(
        [
          {
            selector: "p.testimonial-quote",
            context: "body-text",
            colorHex: "#172033",
          },
        ],
        tokens
      )
    ).toEqual([
      {
        selector: "p.testimonial-quote",
        context: "body-text",
        colorHex: "#172033",
        tokenName: "Midnight CTA Band",
      },
    ]);
  });

  it("blocks an accent tagged for body text when body copy uses it", () => {
    expect(
      evaluateColorRoleCompliance(
        [
          {
            selector: "p.introduction",
            context: "body-text",
            colorHex: "#e8b672",
          },
        ],
        tokens
      )
    ).toEqual([
      {
        selector: "p.introduction",
        context: "body-text",
        colorHex: "#e8b672",
        tokenName: "Harvest Gold",
      },
    ]);
  });

  it("allows ten legitimate token observations in contexts their tags do not ban", () => {
    expect(
      evaluateColorRoleCompliance(
        [
          { selector: "button.primary", context: "button-background", colorHex: "#e8b672" },
          { selector: "h2", context: "heading-text", colorHex: "#e8b672" },
          { selector: ".accent-rule", context: "border", colorHex: "#e8b672" },
          { selector: "button.cta", context: "button-background", colorHex: "#172033" },
          { selector: "h1", context: "heading-text", colorHex: "#172033" },
          { selector: ".cta-rule", context: "border", colorHex: "#172033" },
          { selector: "p", context: "body-text", colorHex: "#f8f5ef" },
          { selector: "section", context: "section-background", colorHex: "#f8f5ef" },
          { selector: ".card", context: "large-surface", colorHex: "#f8f5ef" },
          { selector: ".rule", context: "border", colorHex: "#f8f5ef" },
        ],
        tokens
      )
    ).toEqual([]);
  });

  it("normalizes three-digit hex values before comparing a tagged token", () => {
    const shortHexTokens = {
      colors: [
        {
          name: "Short Hex Accent",
          value: "#ABC",
          cssVar: "--color-short-accent",
          role: "buttons only",
          forbiddenContexts: ["body-text"],
        },
      ],
    } as unknown as DesignTokens;

    expect(
      evaluateColorRoleCompliance(
        [{ selector: "p", context: "body-text", colorHex: "#aabbcc" }],
        shortHexTokens
      )
    ).toMatchObject([{ colorHex: "#aabbcc", tokenName: "Short Hex Accent" }]);
  });

  it("never blocks a token without structured forbidden contexts", () => {
    expect(
      evaluateColorRoleCompliance(
        [{ selector: "p", context: "body-text", colorHex: "#f8f5ef" }],
        tokens
      )
    ).toEqual([]);
  });

  it("does not blame a shared rendered color when one matching token allows the context", () => {
    const duplicateWhiteTokens = {
      colors: [
        {
          name: "Page Canvas",
          value: "#ffffff",
          cssVar: "--color-bg",
          role: "inverted contact text",
          forbiddenContexts: [],
        },
        {
          name: "Card Surface",
          value: "#ffffff",
          cssVar: "--color-surface-alt",
          role: "card backgrounds only",
          forbiddenContexts: ["body-text", "heading-text", "border"],
        },
        {
          name: "Button Contrast",
          value: "#ffffff",
          cssVar: "--color-primary-contrast",
          role: "primary button text only",
          forbiddenContexts: ["body-text", "heading-text", "border"],
        },
      ],
    } as unknown as DesignTokens;

    expect(
      evaluateColorRoleCompliance(
        [
          {
            selector: '[data-edit-id="contact.headline"]',
            context: "heading-text",
            colorHex: "#ffffff",
          },
          {
            selector: '[data-edit-id="contact.sub"]',
            context: "body-text",
            colorHex: "#ffffff",
          },
          {
            selector: '[data-edit-id="contact.phone"]',
            context: "border",
            colorHex: "#ffffff",
          },
        ],
        duplicateWhiteTokens
      )
    ).toEqual([]);
  });
});
