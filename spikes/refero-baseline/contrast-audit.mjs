/**
 * Contrast gate.
 *
 * Written after two hand-audits of this same page both reported "all pass"
 * while real AA failures were live. Hand-listing the colour pairs you *believe*
 * are in use does not work — it audits your memory of the stylesheet, not the
 * stylesheet. This walks the rendered page instead.
 *
 * Covers:
 *   - every element with its own text, at every viewport given
 *   - effective background (walks ancestors past transparent)
 *   - size-aware thresholds (WCAG large text = >=24px, or >=18.66px at >=700)
 *   - :hover colour rules, forced by rewriting them onto a class
 *
 * That last part matters: a hover colour can pass as 30px large text on desktop
 * and fail as 16px normal text on mobile. Static walks never see it.
 *
 * Usage: node contrast-audit.mjs [url]
 * Exit 1 on any failure — wire this into the build.
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.argv[2] ?? "http://localhost:4321";
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

/**
 * Pull `selector:hover { … }` out of the stylesheet so we can force it.
 *
 * Captures background as well as colour. A first version took only `color`,
 * which produced two confident false positives: hover states that darken the
 * background AND lighten the text were measured as light-text-on-light-bg.
 * A gate that cries wolf gets switched off, so both halves must be forced.
 */
function hoverRulesFrom(css) {
  const out = [];
  const re = /([^{}]+:hover[^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const body = m[2];
    const col = /(?:^|[;{\s])color\s*:\s*([^;}]+)/.exec(body);
    const bg = /(?:^|[;{\s])background(?:-color)?\s*:\s*([^;}]+)/.exec(body);
    if (col || bg) {
      out.push({
        selector: m[1].trim(),
        color: col ? col[1].trim() : null,
        background: bg ? bg[1].trim() : null,
      });
    }
  }
  return out;
}

const AUDIT = ({ hoverRules }) => {
  const lum = (r, g, b) => {
    const f = (c) => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const parse = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || "");
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const effBg = (el) => {
    let n = el, acc = null;
    while (n && n !== document.documentElement.parentNode) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) acc = acc ? over(acc, c) : c;
      if (acc && acc.a >= 1) return acc;
      n = n.parentElement;
    }
    return acc ?? { r: 255, g: 255, b: 255, a: 1 };
  };
  const ratio = (a, b) => {
    const la = lum(a.r, a.g, a.b), lb = lum(b.r, b.g, b.b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const path = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  const results = [];
  const check = (el, state) => {
    const own = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 1
    );
    if (!own) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;

    let fg = parse(cs.color);
    if (!fg) return;
    const bg = effBg(el);
    if (fg.a < 1) fg = over(fg, bg);

    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3.0 : 4.5;
    const got = Math.round(ratio(fg, bg) * 100) / 100;

    results.push({
      el: path(el), state, size, weight, got, need,
      pass: got >= need,
      text: (el.textContent || "").trim().slice(0, 42),
    });
  };

  document.querySelectorAll("body *").forEach((el) => check(el, "static"));

  // Kill transitions BEFORE forcing hover. getComputedStyle returns the
  // interpolated value mid-transition, so a 150ms colour transition makes a
  // freshly-applied hover colour read as the old one and every hover state
  // silently passes. This cost an hour; do not remove it.
  const freeze = document.createElement("style");
  freeze.textContent =
    "*,*::before,*::after{transition:none !important;animation:none !important}";
  document.head.appendChild(freeze);

  // Force hover: re-declare each :hover colour onto a class we can add.
  const style = document.createElement("style");
  style.textContent = hoverRules
    .map((r, i) => {
      const d = [];
      if (r.color) d.push(`color:${r.color} !important`);
      if (r.background) d.push(`background:${r.background} !important`);
      return `.__hov${i}{${d.join(";")}}`;
    })
    .join("\n");
  document.head.appendChild(style);
  hoverRules.forEach((r, i) => {
    const base = r.selector.replace(/:hover/g, "");
    let nodes = [];
    try { nodes = [...document.querySelectorAll(base)]; } catch { return; }
    nodes.forEach((el) => {
      el.classList.add(`__hov${i}`);
      check(el, "hover");
      el.classList.remove(`__hov${i}`);
    });
  });

  return results;
};

const css = readFileSync(join(HERE, "site/site.css"), "utf8");
const hoverRules = hoverRulesFrom(css);

const browser = await chromium.launch();
let failures = 0, checked = 0;

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(URL_, { waitUntil: "networkidle" });
  // open every <details> so collapsed copy is audited too
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  const rows = await page.evaluate(AUDIT, { hoverRules });
  await page.close();

  const seen = new Map();
  for (const r of rows) {
    const k = `${r.el}|${r.state}|${r.got}|${r.size}`;
    if (!seen.has(k)) seen.set(k, r);
  }
  const uniq = [...seen.values()];
  const bad = uniq.filter((r) => !r.pass);
  checked += uniq.length;
  failures += bad.length;

  console.log(`\n${vp.name} (${vp.width}px) — ${uniq.length} text elements checked`);
  if (!bad.length) console.log("  all pass");
  for (const r of bad) {
    console.log(
      `  FAIL ${r.got}:1 (need ${r.need}) ${r.size}px/${r.weight} ${r.state}  ${r.el}  "${r.text}"`
    );
  }
}

await browser.close();
console.log(`\n${checked} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
