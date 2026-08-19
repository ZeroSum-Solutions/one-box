import { deriveTextMuted } from "./builder";
import type { DesignTokens, TokenInventory } from "./contracts";
import type { ForbiddenContext } from "./gates";

/**
 * Roles the frozen template paints a token in on EVERY build, whatever the
 * palette.
 *
 * The site is rendered from templates/local-service, whose stylesheet hard-codes
 * which CSS variable paints which role. The synthesis model authors each
 * token's `forbiddenContexts` from the token's nominal role, with no knowledge
 * of those fixed assignments, and builder.ts never shows them to it. The
 * color-role gate then judges the template's fixed output against the model's
 * rules — so a rule that contradicts the template fails every build and no
 * repair can help.
 *
 * Live evidence: 17/17 runs whose palettes carried no forbiddenContexts passed
 * the gate; 3/3 runs that carried any failed it. Runs PKcE4L_4j7Z1,
 * bC3CmmsckaUB and mPHVbkER-Qu8 all died on the same handful of selectors —
 * the eyebrows, the inverted contact band and the footer.
 *
 * The template is a constant, so a ban on what it hard-codes is not a design
 * decision the model gets to make; it is a contradiction. Those bans are
 * dropped here. Everything else — a token misused somewhere the template does
 * NOT force, which is where the edit path lives — still reaches the gate.
 *
 * Sources, all in templates/local-service/site.css:
 *   body / h1,h2,h3        color: --color-text            (global inherit)
 *   .section__eyebrow      color: --color-primary-text    (primary or text)
 *   .hero__sub, .card__body, .point__body, .area-chip, .area-panel__note,
 *   .stat__label, .review__author
 *                          color: --color-text-muted
 *   .contact-band          background: --color-text  color: --color-bg
 *   .contact-band__heading color: --color-bg              (h2)
 *   .contact-band .btn--ghost  border-color: --color-bg
 *   .site-footer           background: --color-surface-alt
 *   .footer__*             color: --color-on-surface-alt  (text or bg)
 *   .trust-bar             background: --color-surface
 *   .btn--primary          background: --color-primary
 *   .btn--primary:hover    background: --color-text
 *   .btn--ghost            border-color: --color-border
 *   .btn--ghost:hover      border-color: --color-primary
 */
export const TEMPLATE_FORCED_ROLES: Readonly<Record<string, readonly ForbiddenContext[]>> = {
  "--color-text": ["body-text", "heading-text", "section-background", "large-surface", "button-background"],
  "--color-bg": ["body-text", "heading-text", "border"],
  "--color-text-muted": ["body-text"],
  "--color-primary": ["body-text", "button-background", "border"],
  "--color-surface": ["section-background", "large-surface", "button-background"],
  "--color-surface-alt": ["section-background", "large-surface"],
  "--color-border": ["border"],
};

/**
 * builder.ts emits three derived variables whose value is chosen at build time
 * from the palette. A role forced on the derived name is really forced on
 * whichever token it can resolve to, so the table has to be read through them.
 */
export function derivedRoleSources(cssVar: string): readonly string[] {
  if (cssVar === "--color-primary-text") return ["--color-primary", "--color-text"];
  if (cssVar === "--color-on-surface-alt") return ["--color-text", "--color-bg"];
  if (cssVar === "--color-on-surface-alt-muted") return ["--color-text", "--color-bg", "--color-text-muted"];
  return [cssVar];
}

export interface DroppedRoleBan {
  cssVar: string;
  context: ForbiddenContext;
}

/**
 * Strips the bans the frozen template must violate, and reports each one so the
 * change is visible rather than silent.
 */
export function reconcileTemplateRoles(tokens: DesignTokens): {
  tokens: DesignTokens;
  dropped: DroppedRoleBan[];
} {
  const dropped: DroppedRoleBan[] = [];
  const colors = tokens.colors.map((color) => {
    const cssVar = color.cssVar.startsWith("--") ? color.cssVar : `--${color.cssVar}`;
    const forced = TEMPLATE_FORCED_ROLES[cssVar];
    if (!forced || !color.forbiddenContexts?.length) return color;
    const kept = color.forbiddenContexts.filter((context) => {
      if (!forced.includes(context)) return true;
      dropped.push({ cssVar, context });
      return false;
    });
    return kept.length === color.forbiddenContexts.length ? color : { ...color, forbiddenContexts: kept };
  });
  return { tokens: { ...tokens, colors }, dropped };
}

/**
 * Raises --color-text-muted to WCAG AA against the two surfaces the template
 * always pairs it with.
 *
 * The template paints that token as body copy in eight places, all on bg or
 * surface, and nothing validated the pairing — run PKcE4L_4j7Z1 shipped
 * #895D2F on #EBE3D4 at 4.49:1 and lost the contrast gate by 0.01.
 *
 * The correction has to land on the inventory rather than on tokens.css.
 * tokens.css is the first sheet the page loads, and tailwind-theme.css
 * re-declares all eight palette names after it (`--color-text-muted:
 * var(--ds-color-text-muted)`), so anything corrected while emitting tokens.css
 * is overwritten by the raw model value before it ever paints. Both Tailwind
 * sheets and tokens.json are generated from this inventory, so correcting it
 * here is the one place that reaches all of them. Colour tokens are `editable`,
 * which the approved-inventory contract defines as "may change only its value".
 */
export function enforceTemplateTextContrast(inventory: TokenInventory): {
  inventory: TokenInventory;
  corrected?: { from: string; to: string };
} {
  const valueOf = (name: string) =>
    inventory.tokens.find((token) => token.semanticName === name)?.value;
  const muted = valueOf("--color-text-muted");
  const bg = valueOf("--color-bg");
  if (muted === undefined || bg === undefined) return { inventory };
  const corrected = deriveTextMuted({
    muted,
    text: valueOf("--color-text") ?? "#111111",
    bg,
    surface: valueOf("--color-surface") ?? bg,
  });
  if (corrected === muted) return { inventory };
  return {
    inventory: {
      ...inventory,
      tokens: inventory.tokens.map((token) =>
        token.semanticName === "--color-text-muted" ? { ...token, value: corrected } : token
      ),
    },
    corrected: { from: muted, to: corrected },
  };
}
