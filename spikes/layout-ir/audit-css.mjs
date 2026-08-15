/**
 * Independent CSS provenance audit.
 *
 * Sol's requirement: "Parse the emitted CSS independently and reject unexplained
 * design literals. Do not trust the provenance file merely because the compiler
 * emitted it."
 *
 * So this file NEVER reads provenance.json. It re-derives legality from the CSS
 * text alone, against the token names actually declared in tokens.css.
 *
 * Legal values:
 *   - var(--token) references to tokens that exist
 *   - calc()/expressions whose only scalars are var() refs and small integer
 *     multipliers (the approved derived-step grammar)
 *   - CSS structural grammar: grid/flex keywords, fr, minmax(), auto, repeat(),
 *     0, 1 (unitless), percentages used as normalized coordinates
 *   - enum keywords (start/center/end/stretch/cover/relative/grid/...)
 *
 * Illegal: any raw length (px/rem/em/vh/vw), any hex/rgb/hsl colour, any
 * font-family literal, any unexplained magic number.
 */
import { readFile } from "node:fs/promises";

const STRUCTURAL_KEYWORDS = new Set([
  "grid", "flex", "block", "inline-flex", "none", "auto", "relative", "absolute",
  "static", "cover", "contain", "start", "center", "end", "stretch", "baseline",
  "space-between", "normal", "hidden", "visible", "0", "1", "-1", "2",
  "minmax(0,1fr)", "uppercase", "lowercase", "capitalize", "balance", "pretty",
  "border-box", "content-box", "100%", "solid",
]);

/** Properties whose value is pure layout structure, never a design scalar. */
const STRUCTURAL_PROPERTIES = new Set([
  "display", "position", "grid-column", "grid-row", "grid-template-columns",
  "grid-template-rows", "order", "z-index", "justify-self", "align-self",
  "justify-items", "align-items", "justify-content", "align-content",
  "object-fit", "margin-inline", "box-sizing", "list-style", "flex-wrap",
]);

/** Normalized-coordinate properties: percentages are the whole point. */
const COORDINATE_PROPERTIES = new Set(["object-position"]);

const HEX = /#[0-9a-f]{3,8}\b/i;
const RGB = /\b(?:rgb|hsl)a?\(/i;
const RAW_LENGTH = /(?<![\w-])\d*\.?\d+(px|rem|em|vh|vw|pt|cm|mm|in)\b/i;

export function collectDeclaredTokens(tokensCss) {
  const tokens = new Set();
  for (const match of tokensCss.matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
    tokens.add(match[1]);
  }
  return tokens;
}

/** Strip comments and split into { selector, declarations[] } blocks. */
function parseBlocks(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(withoutComments)) !== null) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith("@")) continue;
    const declarations = match[2]
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const index = d.indexOf(":");
        return {
          property: d.slice(0, index).trim(),
          value: d.slice(index + 1).trim(),
        };
      })
      .filter((d) => d.property && d.value);
    if (declarations.length) blocks.push({ selector, declarations });
  }
  return blocks;
}

/** Every var() reference in a value must name a token that exists. */
function unknownTokenRefs(value, declared) {
  const missing = [];
  for (const match of value.matchAll(/var\((--[a-z0-9-]+)/gi)) {
    if (!declared.has(match[1])) missing.push(match[1]);
  }
  return missing;
}

/**
 * Remove every legal construct from a value. Whatever text remains is an
 * unexplained literal.
 */
function residue(value) {
  return value
    .replace(/var\(--[a-z0-9-]+\)/gi, " ")
    .replace(/calc\(|\)/gi, " ")
    .replace(/minmax\(|repeat\(/gi, " ")
    .replace(/\b\d+fr\b/gi, " ")
    .replace(/[*/+-]/g, " ")
    .replace(/,/g, " ")
    .trim();
}

export function auditCss({ css, tokensCss }) {
  const declared = collectDeclaredTokens(tokensCss);
  const violations = [];

  for (const block of parseBlocks(css)) {
    for (const { property, value } of block.declarations) {
      const where = `${block.selector} { ${property} }`;

      // The compiler may declare a custom property ONLY as a pure alias of an
      // approved token. Any scalar on the right-hand side is an invented value.
      if (property.startsWith("--")) {
        const isPureAlias = /^var\(--[a-z0-9-]+\)$/i.test(value);
        if (!isPureAlias) {
          violations.push({ where, value, reason: "compiler-declared property must be a pure token alias" });
          continue;
        }
        const aliasMissing = unknownTokenRefs(value, declared);
        if (aliasMissing.length) {
          violations.push({ where, value, reason: `alias references undeclared token(s): ${aliasMissing.join(", ")}` });
        }
        continue;
      }

      const missing = unknownTokenRefs(value, declared);
      if (missing.length) {
        violations.push({ where, value, reason: `references undeclared token(s): ${missing.join(", ")}` });
      }

      if (HEX.test(value) || RGB.test(value)) {
        violations.push({ where, value, reason: "literal colour" });
        continue;
      }

      if (COORDINATE_PROPERTIES.has(property)) {
        if (!/^[\d.]+%\s+[\d.]+%$/.test(value)) {
          violations.push({ where, value, reason: "object-position must be two normalized percentages" });
        }
        continue;
      }

      if (STRUCTURAL_PROPERTIES.has(property)) {
        if (HEX.test(value) || RAW_LENGTH.test(value)) {
          violations.push({ where, value, reason: "design scalar in a structural property" });
        }
        continue;
      }

      if (RAW_LENGTH.test(value)) {
        violations.push({ where, value, reason: "raw length literal — must be a token or derived step" });
        continue;
      }

      const rest = residue(value);
      if (!rest) continue;
      const words = rest.split(/\s+/).filter(Boolean);
      for (const word of words) {
        if (STRUCTURAL_KEYWORDS.has(word)) continue;
        if (/^\d+$/.test(word) && Number(word) <= 4) continue; // small integer multiplier
        if (/^[a-z-]+$/i.test(word) && !/^\d/.test(word)) continue; // enum keyword
        violations.push({ where, value, reason: `unexplained literal: ${word}` });
      }
    }
  }
  return violations;
}

if (process.argv[1] && process.argv[1].endsWith("audit-css.mjs")) {
  const [cssPath, tokensPath] = process.argv.slice(2);
  const css = await readFile(cssPath, "utf8");
  const tokensCss = await readFile(tokensPath, "utf8");
  const violations = auditCss({ css, tokensCss });
  if (violations.length) {
    console.error(`PROVENANCE AUDIT FAILED — ${violations.length} violation(s)`);
    for (const v of violations.slice(0, 40)) {
      console.error(`  ${v.where}\n    value: ${v.value}\n    ${v.reason}`);
    }
    process.exit(1);
  }
  console.log("PROVENANCE AUDIT PASSED — every design scalar traces to a token or approved step");
}
