import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DesignTokens, TokenInventory } from "./contracts";
import {
  TEMPLATE_FORCED_ROLES,
  derivedRoleSources,
  enforceTemplateTextContrast,
  reconcileTemplateRoles,
} from "./templateRoles";

const baseColor = (over: Partial<DesignTokens["colors"][number]>) => ({
  name: "Token",
  value: "#123456",
  cssVar: "--color-primary",
  role: "role",
  forbidden: "",
  forbiddenContexts: [],
  ...over,
});

const tokensWith = (colors: Array<Partial<DesignTokens["colors"][number]>>): DesignTokens =>
  ({ colors: colors.map(baseColor) }) as unknown as DesignTokens;

describe("reconcileTemplateRoles", () => {
  it("drops a prohibition the frozen template violates on every build", () => {
    // .contact-band__heading is an h2 painted var(--color-bg); no palette can
    // avoid it, so banning bg from heading-text is a contradiction, not a rule.
    const { tokens, dropped } = reconcileTemplateRoles(
      tokensWith([{ cssVar: "--color-bg", value: "#ebe3d4", forbiddenContexts: ["heading-text"] }])
    );
    expect(tokens.colors[0].forbiddenContexts).toEqual([]);
    expect(dropped).toEqual([{ cssVar: "--color-bg", context: "heading-text" }]);
  });

  it("keeps a prohibition the template never forces", () => {
    // Nothing in the template paints a section background with primary, so a
    // ban there is a real design rule the gate must still enforce.
    const { tokens, dropped } = reconcileTemplateRoles(
      tokensWith([
        { cssVar: "--color-primary", value: "#3e2c1a", forbiddenContexts: ["section-background"] },
      ])
    );
    expect(tokens.colors[0].forbiddenContexts).toEqual(["section-background"]);
    expect(dropped).toEqual([]);
  });

  it("splits a mixed rule set, keeping only the enforceable half", () => {
    const { tokens } = reconcileTemplateRoles(
      tokensWith([
        {
          cssVar: "--color-text",
          value: "#000000",
          // section-background/large-surface are forced by .contact-band;
          // border is not painted with text anywhere.
          forbiddenContexts: ["section-background", "large-surface", "border"],
        },
      ])
    );
    expect(tokens.colors[0].forbiddenContexts).toEqual(["border"]);
  });

  it("leaves an empty rule set untouched", () => {
    const { tokens, dropped } = reconcileTemplateRoles(
      tokensWith([{ cssVar: "--color-bg", forbiddenContexts: [] }])
    );
    expect(tokens.colors[0].forbiddenContexts).toEqual([]);
    expect(dropped).toEqual([]);
  });

  it("ignores a token the template never consumes", () => {
    const { tokens } = reconcileTemplateRoles(
      tokensWith([{ cssVar: "--color-accent-x", forbiddenContexts: ["body-text"] }])
    );
    expect(tokens.colors[0].forbiddenContexts).toEqual(["body-text"]);
  });

  it("clears every violation the three failed live runs reported", () => {
    // The exact palette slots run PKcE4L_4j7Z1 lost the gate on.
    const { tokens } = reconcileTemplateRoles(
      tokensWith([
        { cssVar: "--color-primary", value: "#3e2c1a", forbiddenContexts: ["section-background", "large-surface", "body-text", "heading-text"] },
        { cssVar: "--color-text", value: "#000000", forbiddenContexts: ["section-background", "button-background", "large-surface", "border"] },
        { cssVar: "--color-bg", value: "#ebe3d4", forbiddenContexts: ["body-text", "heading-text", "border"] },
      ])
    );
    const remaining = Object.fromEntries(
      tokens.colors.map((c) => [c.cssVar, c.forbiddenContexts])
    );
    // heading-text survives: nothing in the template paints an h1-h3 with
    // primary, so that ban is still a real rule the gate can enforce.
    expect(remaining["--color-primary"]).toEqual([
      "section-background",
      "large-surface",
      "heading-text",
    ]);
    expect(remaining["--color-text"]).toEqual(["border"]);
    expect(remaining["--color-bg"]).toEqual([]);
  });
});

// The table above is only correct while it matches the frozen template. If
// site.css starts painting a token in a role the table does not list, the gate
// silently goes back to failing every build that bans it — the exact bug this
// module exists to kill. Re-derive the usage from the stylesheet, resolving
// selectors to tags the way the gate does (body-text is p/li only, heading-text
// is h1-h6 only), and compare.
describe("TEMPLATE_FORCED_ROLES stays in sync with site.css", () => {
  const templateDir = path.join(process.cwd(), "templates/local-service");

  const tagsByClass = async (): Promise<Map<string, Set<string>>> => {
    const html = await readFile(path.join(templateDir, "index.html.tpl"), "utf8");
    const map = new Map<string, Set<string>>();
    for (const [, tag, classes] of html.matchAll(/<(\w+)[^>]*class="([^"]*)"/g)) {
      for (const className of classes.split(/\s+/)) {
        map.set(className, (map.get(className) ?? new Set()).add(tag.toLowerCase()));
      }
    }
    return map;
  };

  const paintedIn = async (
    role: "body-text" | "heading-text"
  ): Promise<string[]> => {
    const css = await readFile(path.join(templateDir, "site.css"), "utf8");
    const byClass = await tagsByClass();
    const wanted =
      role === "body-text" ? ["p", "li"] : ["h1", "h2", "h3", "h4", "h5", "h6"];
    const painted = new Set<string>();
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const declared = body.match(/(?:^|;)\s*color\s*:\s*[^;]*var\((--color-[\w-]+)/);
      if (!declared) continue;
      const bare = selector.split(",").map((part) => part.trim());
      const hits = bare.some((part) => {
        if (wanted.some((tag) => new RegExp(`(^|[\\s>+~])${tag}\\b`).test(part))) return true;
        return [...part.matchAll(/\.([\w-]+)/g)].some(([, className]) =>
          wanted.some((tag) => byClass.get(className)?.has(tag))
        );
      });
      if (hits) for (const source of derivedRoleSources(declared[1])) painted.add(source);
    }
    return [...painted].filter(
      (cssVar) => !(TEMPLATE_FORCED_ROLES[cssVar] ?? []).includes(role)
    );
  };

  it("covers every token the template paints as body text", async () => {
    expect(await paintedIn("body-text")).toEqual([]);
  });

  it("covers every token the template paints as heading text", async () => {
    expect(await paintedIn("heading-text")).toEqual([]);
  });

  it("covers every token the template paints as a full-width surface", async () => {
    const css = await readFile(path.join(templateDir, "site.css"), "utf8");
    const painted = new Set<string>();
    for (const [, , body] of css.matchAll(
      /\.(contact-band|site-footer|trust-bar|hero)\s*\{([^}]*)\}/g
    )) {
      const ref = body.match(/background(?:-color)?\s*:\s*[^;]*var\((--color-[\w-]+)/);
      if (ref) for (const source of derivedRoleSources(ref[1])) painted.add(source);
    }
    expect(
      [...painted].filter(
        (cssVar) => !(TEMPLATE_FORCED_ROLES[cssVar] ?? []).includes("section-background")
      )
    ).toEqual([]);
  });
});

// tokens.css is loaded first and tailwind-theme.css re-declares all eight
// palette names after it (`--color-text-muted: var(--ds-color-text-muted)`),
// so a correction made while emitting tokens.css never reaches the page — it is
// overwritten by the raw model value two stylesheets later. The correction has
// to land on the inventory, which is what both sheets and tokens.json are
// generated from. Run PKcE4L_4j7Z1 lost the contrast gate at 4.49:1 this way.
describe("enforceTemplateTextContrast", () => {
  const inventory = (colors: Record<string, string>): TokenInventory =>
    ({
      sourceContractVersion: 1,
      tokens: Object.entries(colors).map(([semanticName, value]) => ({
        semanticName,
        value,
        usage: "",
        category: "color" as const,
        sourceEvidenceIds: [],
        editable: true,
      })),
    }) as TokenInventory;

  const valueOf = (inv: TokenInventory, name: string) =>
    inv.tokens.find((t) => t.semanticName === name)?.value;

  it("raises a muted tone that misses AA against the surfaces the template pairs it with", () => {
    const result = enforceTemplateTextContrast(
      inventory({
        "--color-text-muted": "#895D2F",
        "--color-text": "#000000",
        "--color-bg": "#EBE3D4",
        "--color-surface": "#F7F2EC",
      })
    );
    expect(result.corrected).toEqual({ from: "#895D2F", to: "#82582d" });
    expect(valueOf(result.inventory, "--color-text-muted")).toBe("#82582d");
  });

  it("leaves a compliant palette exactly as approved", () => {
    const source = inventory({
      "--color-text-muted": "#5a5a5a",
      "--color-text": "#000000",
      "--color-bg": "#ffffff",
      "--color-surface": "#ffffff",
    });
    const result = enforceTemplateTextContrast(source);
    expect(result.corrected).toBeUndefined();
    expect(result.inventory).toBe(source);
  });

  it("touches nothing but the muted tone", () => {
    const result = enforceTemplateTextContrast(
      inventory({
        "--color-text-muted": "#895D2F",
        "--color-text": "#000000",
        "--color-bg": "#EBE3D4",
        "--color-surface": "#F7F2EC",
      })
    );
    expect(valueOf(result.inventory, "--color-bg")).toBe("#EBE3D4");
    expect(valueOf(result.inventory, "--color-text")).toBe("#000000");
    expect(valueOf(result.inventory, "--color-surface")).toBe("#F7F2EC");
  });

  it("does nothing when the palette has no muted tone to correct", () => {
    const source = inventory({ "--color-bg": "#ffffff", "--color-text": "#000000" });
    expect(enforceTemplateTextContrast(source).inventory).toBe(source);
  });
});
