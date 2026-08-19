import { describe, expect, it } from "vitest";
import { foldTokens } from "./pipeline";
import { findUnresolvedCssVarRefs } from "./cssVars";

/**
 * The tokens stage hands back a slot-keyed transport and folding assigns the
 * custom-property names the builder actually emits. componentState CSS is free
 * text, though, so the model sometimes writes the JSON path it just filled
 * (`var(--colors-primary)`) instead of the emitted property (`--color-primary`).
 * Observed live in run mPHVbkER-Qu8 (2026-08-17), which failed its build on
 * seven such names and could not be repaired: the build's one repair cycle may
 * only patch index.html and tokens.css, while these strings reach the site
 * through the theme sheet generated from tokens.json.
 */
const DRIFTED_STATE_CSS =
  "background-color: var(--colors-primary); color: var(--colors-primaryContrast); " +
  "border-radius: var(--radii-sm); padding: var(--layout-cardPaddingPx); " +
  "font-family: var(--fonts-display-family); border: 2px outset var(--colors-border); " +
  "gap: var(--spacing-md); box-shadow: var(--shadows-raised); font-size: var(--typeScale-body);";

function transport(stateCss: string) {
  const color = (value: string) => ({ name: value, value, role: "role", forbiddenContexts: [] });
  const scale = { sizePx: 16, lineHeight: 1.5 };
  return {
    colors: {
      bg: color("#ffffff"),
      surface: color("#fafafa"),
      surfaceAlt: color("#efefef"),
      text: color("#111111"),
      textMuted: color("#555555"),
      primary: color("#0b5cd5"),
      primaryContrast: color("#ffffff"),
      border: color("#dddddd"),
    },
    fonts: {
      body: { family: "Inter", weights: [400], role: "body", substitutes: [] },
      display: { family: "Inter", weights: [700], role: "display", substitutes: [] },
    },
    typeScale: {
      caption: scale,
      bodySm: scale,
      body: scale,
      bodyLg: scale,
      headingSm: scale,
      heading: scale,
      headingLg: scale,
      display: scale,
    },
    radii: { sm: "2px", md: "6px", lg: "12px", pill: "999px" },
    spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "40px" },
    borders: { subtle: "1px solid #ddd", strong: "2px solid #111" },
    shadows: { raised: "0 1px 2px #0002", overlay: "0 8px 24px #0003" },
    layers: { base: "0", sticky: "10", overlay: "20" },
    layout: { maxWidthPx: 1200, sectionGapPx: 64, cardPaddingPx: 24 },
    motion: {
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      durationMs: { micro: 120, reveal: 320 },
      revealClasses: ["reveal"],
    },
    componentStates: [{ component: "button", states: [{ state: "default", css: stateCss }] }],
    imageryBrief: {
      subject: "s",
      lighting: "l",
      grade: "g",
      framing: "f",
      avoid: ["a"],
    },
  };
}

describe("foldTokens componentState references", () => {
  /** Every property name renderTokensCss emits for this transport. */
  const emitted = new Set([
    "--color-bg",
    "--color-surface",
    "--color-surface-alt",
    "--color-text",
    "--color-text-muted",
    "--color-primary",
    "--color-primary-contrast",
    "--color-border",
    "--font-body",
    "--font-display",
    "--text-body",
    "--radius-sm",
    "--space-md",
    "--shadow-raised",
    "--layout-card-padding",
  ]);

  it("rewrites slot-path references onto the properties the builder emits", () => {
    const folded = foldTokens(transport(DRIFTED_STATE_CSS));
    const css = folded.componentStates[0].states.default;
    expect(findUnresolvedCssVarRefs(css, emitted)).toEqual([]);
    expect(css).toContain("var(--color-primary)");
    expect(css).toContain("var(--color-primary-contrast)");
    expect(css).toContain("var(--layout-card-padding)");
    expect(css).not.toMatch(/var\(--colors-/);
    expect(css).not.toMatch(/var\(--radii-/);
  });

  it("leaves CSS that already names the emitted properties untouched", () => {
    const clean = "background-color: var(--color-primary); border-radius: var(--radius-sm);";
    expect(foldTokens(transport(clean)).componentStates[0].states.default).toBe(clean);
  });

  it("leaves a reference it cannot map alone, for the gate to report", () => {
    // Silently dropping an unknown name would hide real drift; token-drift is
    // the backstop that must still see it.
    const unknown = "color: var(--brand-mystery);";
    expect(foldTokens(transport(unknown)).componentStates[0].states.default).toBe(unknown);
  });
});
