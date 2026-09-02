import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Agent Studio workbench styles", () => {
  it("uses project tokens, compact responsive layout, and 44px narrow targets", () => {
    const css = readFileSync(
      new URL("../../../app/styles/workbench.css", import.meta.url),
      "utf8",
    );
    const start = css.indexOf("/* ---------- Agent Studio");
    const styles = css.slice(start);

    expect(start).toBeGreaterThan(-1);
    expect(styles).toContain(".agent-studio__modes");
    expect(styles).toContain(".ai-teammate-roster__grid");
    expect(styles).toContain("repeat(auto-fit, minmax(9rem, 1fr))");
    expect(styles).toContain("@media (max-width: 768px)");
    expect(styles).toContain("min-height: 44px");
    expect(styles).toContain("gap: var(--spacing-8)");
    expect(styles).toContain("outline: 2px solid var(--accent-teal)");
    expect(styles).toMatch(
      /\.ai-teammate-result > p strong\s*\{[^}]*font-weight: var\(--weight-medium\)/,
    );
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|font-family:/i);
  });
});
