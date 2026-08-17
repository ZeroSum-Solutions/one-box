/**
 * Custom-property reference resolution, shared by the builder (which must not
 * EMIT a broken sheet) and the gates (which must not SHIP one).
 *
 * A `var(--x)` naming a property nothing defines makes the whole declaration
 * invalid at computed-value time: the property silently reverts to its initial
 * value. A missing radius token flattens every corner, a missing type token
 * drops text to 16px, a missing border token erases the border — and the page
 * still renders, so nothing downstream notices. Checking computed values
 * cannot catch it either, because the computed value that comes back is a
 * legal one; it is simply not the designed one.
 *
 * A reference carrying a fallback, `var(--x, 1rem)`, renders correctly whether
 * or not --x exists, so it is never reported.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

/** Strips comments so token names mentioned in prose are never mistaken for
 * declarations or references. The token sheet's own header lists them. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

export function collectDefinedCssVars(css: string): Set<string> {
  const defined = new Set<string>();
  const declRe = /(^|[;{]|\s)(--[\w-]+)\s*:/g;
  let m: RegExpExecArray | null;
  const text = stripComments(css);
  while ((m = declRe.exec(text))) defined.add(m[2]);
  return defined;
}

/**
 * Collects `@property --x { … initial-value: … }` registrations.
 *
 * A registration that supplies an initial value defines the property globally,
 * so a bare reference to it resolves wherever the block sits — unlike an
 * ordinary declaration, which only reaches elements its selector matches.
 * A registration WITHOUT initial-value is not a definition: for `syntax: "*"`
 * there is no initial value to fall back to, so a bare reference to it stays
 * guaranteed-invalid and still counts as drift.
 */
export function collectRegisteredCssVars(css: string): Set<string> {
  const registered = new Set<string>();
  const blockRe = /@property\s+(--[\w-]+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  const text = stripComments(css);
  while ((m = blockRe.exec(text))) {
    if (/initial-value\s*:/.test(m[2])) registered.add(m[1]);
  }
  return registered;
}

/**
 * Returns the referenced properties that carry no fallback and that `defined`
 * does not cover, sorted and deduplicated.
 *
 * Deliberately conservative in one place: a bare reference nested inside
 * another reference's fallback — `var(--a, var(--b))` — is reported when --b
 * is undefined, even though --a resolving would make it unreachable. That
 * shape is vanishingly rare in generated CSS, and an undefined token named
 * anywhere is worth knowing about.
 */
export function findUnresolvedCssVarRefs(css: string, defined: Set<string>): string[] {
  const unresolved = new Set<string>();
  // The trailing capture is what separates `var(--x)` from `var(--x, …)`.
  const refRe = /var\(\s*(--[\w-]+)\s*([,)])/g;
  let m: RegExpExecArray | null;
  const text = stripComments(css);
  while ((m = refRe.exec(text))) {
    const [, name, next] = m;
    if (next === ")" && !defined.has(name)) unresolved.add(name);
  }
  return [...unresolved].sort();
}

/**
 * Resolves the whole built site's stylesheets against each other (ENG-006).
 *
 * The check is static, because the computed-value route cannot work here:
 * fluid type is composed as `clamp(var(--text-a), …, var(--text-b))`, so a
 * rendered font-size is legitimately a value equal to no token at all, and the
 * template's own composition scalars are not token drift either. Comparing
 * computed lengths against token values would fail both, constantly — and a
 * gate that cries wolf gets switched off (H-003).
 */
export async function findUnresolvedSheetRefs(
  siteDir: string,
  tokensCssText: string
): Promise<string[]> {
  const defined = collectDefinedCssVars(tokensCssText);
  const sheets: string[] = [];
  // tailwind-theme.css both defines and consumes, so it is read before the
  // resolution pass; it exists only on evidence-workflow runs.
  for (const name of ["tailwind-theme.css", "site.css", "tailwind-utilities.css"]) {
    const text = await readFile(path.join(siteDir, name), "utf8").catch(() => undefined);
    if (text === undefined) continue;
    if (name === "tailwind-theme.css") {
      for (const declared of collectDefinedCssVars(text)) defined.add(declared);
    }
    // Every sheet's own @property registrations count, wherever they sit:
    // Tailwind registers its shadow/ring internals in the utilities sheet and
    // bare-references them from the same file, and those names are not token
    // drift — no token stage chooses or supplies them.
    for (const registered of collectRegisteredCssVars(text)) defined.add(registered);
    sheets.push(text);
  }
  return findUnresolvedCssVarRefs(sheets.join("\n"), defined);
}
