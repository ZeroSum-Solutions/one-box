/**
 * one-box / templates/local-service / tokens.css.tpl
 *
 * Generated at build time by src/lib/builder.ts from a DesignTokens object
 * (src/lib/contracts.ts). Do not hand-edit the output — edit the DesignTokens
 * input instead. This file is a flat value sheet only: every custom property
 * holds a literal color/length/time value, never a clamp()/calc() expression.
 * Fluid type is composed in site.css from PAIRS of these flat size tokens.
 *
 * CONTRACT — the L1 local-service template expects DesignTokens entries to
 * name their cssVar fields exactly as below, because site.css (a frozen,
 * hand-authored file) references these exact custom-property names. If a
 * DesignTokens object supplies different cssVar names, its values still get
 * written into this file faithfully, but site.css's rules will fall back to
 * the browser default for any name it expected that never arrived — which
 * the token-drift gate (src/lib/gates.ts) will catch, since the resulting
 * computed color/font will not trace back to a token value.
 *
 * Colors   (DesignTokens.colors[].cssVar):
 *   --color-bg, --color-surface, --color-surface-alt, --color-text,
 *   --color-text-muted, --color-primary, --color-primary-contrast,
 *   --color-border, --color-accent
 * Fonts    (DesignTokens.fonts[].cssVar):
 *   --font-display, --font-body
 * Type scale (DesignTokens.typeScale[].cssVar, role must match the name):
 *   --text-caption, --text-body-sm, --text-body, --text-body-lg,
 *   --text-subheading, --text-heading-sm, --text-heading, --text-heading-lg,
 *   --text-display
 * Radii    (DesignTokens.radii keys):
 *   --radius-sm, --radius-md, --radius-lg, --radius-pill
 * Spacing  (DesignTokens.spacing keys):
 *   --space-xs, --space-sm, --space-md, --space-lg, --space-xl,
 *   --space-2xl, --space-3xl
 * Layout   (DesignTokens.layout, fixed names — no per-entry cssVar in schema):
 *   --layout-max-width, --layout-section-gap, --layout-card-padding
 * Motion   (DesignTokens.motion, fixed names — no per-entry cssVar in schema):
 *   --motion-ease, --motion-duration-micro, --motion-duration-reveal
 *
 * See WAVE-NOTES-buildgate.md for the full rationale.
 */
:root {
{{tokenDeclarations}}
}
