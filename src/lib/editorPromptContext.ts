import type { DesignTokens } from "./contracts";

/**
 * Token summary for the element-edit rewrite prompt. Every color carries its
 * licensed role and forbidden context (DesignTokens computes both at
 * synthesis time; the edit path used to forward bare cssVar names, which made
 * role misuse — a CTA accent on a footer background — fully legal to the
 * rewrite model and invisible to gateTokenDrift).
 */
export function describeTokensForEdit(tokens: DesignTokens): string {
  const colors = tokens.colors.map((c) => {
    const never = c.forbidden ? `; never: ${c.forbidden}` : "";
    return `- ${c.cssVar} (${c.name}): role — ${c.role}${never}`;
  });
  const fonts = tokens.fonts.map(
    (f) => `- ${f.cssVar} (${f.family}): role — ${f.role}`
  );
  return [
    "COLORS (each is licensed for its stated role only; treat the never-context as a hard ban):",
    ...colors,
    "FONTS:",
    ...fonts,
  ].join("\n");
}
