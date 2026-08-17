import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectDefinedCssVars,
  findUnresolvedCssVarRefs,
  findUnresolvedSheetRefs,
} from "./cssVars";

describe("collectDefinedCssVars", () => {
  it("collects declarations across a :root block", () => {
    const defined = collectDefinedCssVars(":root {\n  --color-bg: #fff;\n  --space-md: 1rem;\n}");
    expect([...defined].sort()).toEqual(["--color-bg", "--space-md"]);
  });

  it("does not treat token names mentioned in a comment as declarations", () => {
    // tokens.css.tpl's own header lists the contract's property names in prose.
    const defined = collectDefinedCssVars("/* Colors:\n *   --color-bg, --color-surface:\n */\n:root{--color-bg:#fff;}");
    expect([...defined]).toEqual(["--color-bg"]);
  });
});

describe("findUnresolvedCssVarRefs", () => {
  const defined = new Set(["--color-border", "--radius-md"]);

  it("reports a bare reference nothing defines", () => {
    expect(findUnresolvedCssVarRefs(".card{border-radius:var(--radius-lg);}", defined)).toEqual([
      "--radius-lg",
    ]);
  });

  it("accepts a bare reference that resolves", () => {
    expect(findUnresolvedCssVarRefs(".card{border-radius:var(--radius-md);}", defined)).toEqual([]);
  });

  it("accepts an unresolved reference that carries a fallback", () => {
    // This is the real shape in site.css: var(--border-subtle, 1px solid …).
    expect(
      findUnresolvedCssVarRefs(
        ".t{border-top:var(--border-subtle, 1px solid var(--color-border));}",
        defined
      )
    ).toEqual([]);
  });

  it("deduplicates and sorts across many rules", () => {
    expect(
      findUnresolvedCssVarRefs(
        ".a{font-size:var(--text-body);}.b{font-size:var(--text-body);}.c{gap:var(--space-lg);}",
        defined
      )
    ).toEqual(["--space-lg", "--text-body"]);
  });

  it("reads both endpoints of a clamp()", () => {
    // Fluid type is composed from PAIRS of flat tokens; a missing endpoint
    // invalidates the whole declaration just as a plain reference would.
    expect(
      findUnresolvedCssVarRefs(
        ".h{font-size:clamp(var(--text-heading-sm), 3vw + 0.5rem, var(--text-heading));}",
        defined
      )
    ).toEqual(["--text-heading", "--text-heading-sm"]);
  });

  it("ignores references that appear only inside a comment", () => {
    expect(findUnresolvedCssVarRefs("/* was var(--legacy-gap) */ .a{gap:var(--radius-md);}", defined)).toEqual([]);
  });
});

// ENG-006, negative-tested against the REAL frozen stylesheet. A gate is not
// trusted until a known defect makes it fail (H-001), and the defect that
// matters is a tokens.css that omits a name site.css needs — the exact shape
// tokens.css.tpl warns about and that nothing previously caught.
describe("findUnresolvedSheetRefs against the shipped template", () => {
  const dirs: string[] = [];
  afterEach(async () =>
    Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  );

  /** A tokens.css defining every property the frozen site.css bare-references,
   * minus any the caller asks to drop. */
  async function siteDirWithout(...omit: string[]) {
    const siteCss = await fs.readFile(
      path.join(process.cwd(), "templates", "local-service", "site.css"),
      "utf8"
    );
    const needed = findUnresolvedCssVarRefs(siteCss, new Set()).filter((n) => !omit.includes(n));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-cssvars-"));
    dirs.push(dir);
    await fs.writeFile(path.join(dir, "site.css"), siteCss);
    const tokensCss = `:root{\n${needed.map((n) => `  ${n}: 0;`).join("\n")}\n}`;
    return { dir, tokensCss };
  }

  it("passes when tokens.css defines everything site.css needs", async () => {
    const { dir, tokensCss } = await siteDirWithout();
    expect(await findUnresolvedSheetRefs(dir, tokensCss)).toEqual([]);
  });

  it("fails when a token site.css needs is missing", async () => {
    const { dir, tokensCss } = await siteDirWithout("--radius-md", "--text-heading");
    expect(await findUnresolvedSheetRefs(dir, tokensCss)).toEqual(["--radius-md", "--text-heading"]);
  });

  it("does not fault the three properties site.css references with a fallback", async () => {
    // --border-subtle, --layer-overlay and --layer-sticky render correctly
    // whether or not tokens.css supplies them; flagging them would be noise.
    const { dir, tokensCss } = await siteDirWithout();
    const withoutOptional = tokensCss
      .split("\n")
      .filter((line) => !/--(border-subtle|layer-overlay|layer-sticky)\s*:/.test(line))
      .join("\n");
    expect(await findUnresolvedSheetRefs(dir, withoutOptional)).toEqual([]);
  });

  it("resolves references that only tailwind-theme.css defines", async () => {
    const { dir, tokensCss } = await siteDirWithout("--color-primary");
    await fs.writeFile(path.join(dir, "tailwind-theme.css"), "@theme{--color-primary:#123456;}");
    expect(await findUnresolvedSheetRefs(dir, tokensCss)).toEqual([]);
  });

  // Tailwind emits its own shadow/ring internals as @property registrations in
  // the utilities sheet and then bare-references them from the same file. The
  // registration carries an initial value, so those declarations are valid —
  // reporting them made token-drift fail every build that used a shadow
  // utility, on five names no token stage has any say over.
  it("resolves a bare reference registered by @property with an initial value", async () => {
    const { dir, tokensCss } = await siteDirWithout();
    await fs.writeFile(
      path.join(dir, "tailwind-utilities.css"),
      '@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000;}\n' +
        ".shadow-sm{box-shadow:var(--tw-shadow);}"
    );
    expect(await findUnresolvedSheetRefs(dir, tokensCss)).toEqual([]);
  });

  // A registration without initial-value gives syntax:"*" no initial value, so
  // a bare reference to it stays guaranteed-invalid and must still be reported.
  it("still reports a reference whose @property omits an initial value", async () => {
    const { dir, tokensCss } = await siteDirWithout();
    await fs.writeFile(
      path.join(dir, "tailwind-utilities.css"),
      '@property --tw-ring-color{syntax:"*";inherits:false;}\n' +
        ".ring{--x:var(--tw-ring-color);}"
    );
    expect(await findUnresolvedSheetRefs(dir, tokensCss)).toEqual(["--tw-ring-color"]);
  });
});
