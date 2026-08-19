/**
 * WCAG AA contrast over the RENDERED page, including hover states.
 *
 * Ported from the Refero-only baseline spike, where three separate hand-audits
 * of one small page produced three wrong answers (PROC-001). Hand-listing the
 * colour pairs you believe are in use audits your memory of the stylesheet, not
 * the stylesheet.
 *
 * This exists alongside axe rather than inside it. axe checks the static page;
 * it does not evaluate `:hover`, and a hover colour can pass as 30px large text
 * on desktop and fail as 16px normal text once a media query shrinks it. That
 * was A11Y-005 — a real, shipped failure no static walk could see.
 *
 * It is not optional for this engine. Refero's token roles are not
 * accessibility-audited (REF-006): three roles applied exactly as written
 * measured 3.32:1, 3.23:1 and 3.17:1 against their documented backgrounds. The
 * page looks correct while failing.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "playwright";
import type { GateReport } from "./contracts";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

export interface HoverRule {
  /** The original selector, `:hover` intact. */
  selector: string;
  /** The rule's declarations, verbatim. */
  body: string;
}

/**
 * Pulls whole `selector:hover { … }` rules out of a stylesheet, keeping only
 * those that move colour or background — hovering something that merely
 * translates by a pixel tells us nothing about contrast.
 *
 * The body is kept VERBATIM and the selector keeps its `:hover`, because both
 * halves of the pair must be replayed together and at their original
 * specificity. Two earlier versions got this wrong in different ways:
 *
 *   - Extracting `color` alone measured hover states that darken the background
 *     AND lighten the text as light-on-light, inventing failures (H-003).
 *   - Extracting both, then forcing them with `!important`, overrode the
 *     cascade: a button covered by a more specific `.band .btn:hover` rule was
 *     measured against the generic rule that never applies to it. That reported
 *     2.53:1 on a pair the browser never renders.
 *
 * A gate that cries wolf gets switched off, so the cascade is left to decide.
 */
export function hoverRulesFrom(css: string): HoverRule[] {
  const out: HoverRule[] = [];
  const re = /([^{}]+:hover[^{}]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const body = m[2];
    const touchesInk =
      /(?:^|[;{\s])color\s*:/.test(body) || /(?:^|[;{\s])background(?:-color)?\s*:/.test(body);
    if (touchesInk) out.push({ selector: m[1].trim(), body: body.trim() });
  }
  return out;
}

interface AuditRow {
  el: string;
  state: string;
  size: number;
  weight: number;
  got: number;
  need: number;
  pass: boolean;
  text: string;
}

/** Runs in the page. Self-contained by necessity — it is serialised across. */
const AUDIT = ({ hoverRules }: { hoverRules: HoverRule[] }): AuditRow[] => {
  const lum = (r: number, g: number, b: number) => {
    const f = (c: number) => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  type Rgba = { r: number; g: number; b: number; a: number };
  const parse = (s: string): Rgba | null => {
    const m = /rgba?\(([^)]+)\)/.exec(s || "");
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg: Rgba, bg: Rgba): Rgba => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  // Transparency means the declared background is rarely the effective one;
  // walking ancestors is what makes the measured pair the real pair.
  const effBg = (el: Element): Rgba => {
    let n: Element | null = el;
    let acc: Rgba | null = null;
    while (n) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) acc = acc ? over(acc, c) : c;
      if (acc && acc.a >= 1) return acc;
      n = n.parentElement;
    }
    return acc ?? { r: 255, g: 255, b: 255, a: 1 };
  };
  const ratio = (a: Rgba, b: Rgba) => {
    const la = lum(a.r, a.g, a.b);
    const lb = lum(b.r, b.g, b.b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const describe = (el: Element) => {
    const id = el.id ? `#${el.id}` : "";
    const raw = typeof el.className === "string" ? el.className.trim() : "";
    const cls = raw ? "." + raw.split(/\s+/).slice(0, 2).join(".") : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  const results: AuditRow[] = [];
  const check = (el: Element, state: string) => {
    // Only elements holding their own text: a wrapper inherits a colour it
    // never paints, and counting it doubles every real failure.
    const own = [...el.childNodes].some(
      (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1
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
      el: describe(el),
      state,
      size,
      weight,
      got,
      need,
      pass: got >= need,
      text: (el.textContent || "").trim().slice(0, 42),
    });
  };

  document.querySelectorAll("body *").forEach((el) => check(el, "static"));

  // Kill transitions BEFORE forcing hover. getComputedStyle returns the
  // interpolated value mid-transition, so a 150ms colour transition makes a
  // freshly-applied hover colour read as the old one and every hover state
  // silently passes (H-002). This cost an hour; do not remove it.
  const freeze = document.createElement("style");
  freeze.textContent =
    "*,*::before,*::after{transition:none !important;animation:none !important}";
  document.head.appendChild(freeze);

  // Replay each hover rule against a class instead of the pseudo-class. A
  // class and a pseudo-class carry IDENTICAL specificity, so `.band
  // .btn.__hover` still beats `.btn.__hover` exactly as `.band .btn:hover`
  // beats `.btn:hover`. The cascade resolves the pair, not this gate — which
  // is the only way the measured colours are the ones a visitor sees.
  const style = document.createElement("style");
  style.textContent = hoverRules
    .map((rule) => `${rule.selector.replace(/:hover/g, ".__hover")}{${rule.body}}`)
    .join("\n");
  document.head.appendChild(style);

  const candidates = new Set<Element>();
  for (const rule of hoverRules) {
    try {
      document
        .querySelectorAll(rule.selector.replace(/:hover/g, ""))
        .forEach((el) => candidates.add(el));
    } catch {
      // A selector we cannot re-query is not a contrast failure.
    }
  }
  candidates.forEach((el) => {
    el.classList.add("__hover");
    check(el, "hover");
    el.classList.remove("__hover");
  });

  return results;
};

export async function gateContrast(
  browser: Browser,
  url: string,
  siteDir: string
): Promise<GateReport> {
  const sheets: string[] = [];
  for (const name of ["site.css", "tailwind-utilities.css"]) {
    const text = await readFile(path.join(siteDir, name), "utf8").catch(() => undefined);
    if (text !== undefined) sheets.push(text);
  }
  const hoverRules = hoverRulesFrom(sheets.join("\n"));

  const details: string[] = [];
  let checked = 0;
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "load" });
      // Collapsed copy is still copy — a failing FAQ answer must not hide.
      await page.evaluate(() =>
        document.querySelectorAll("details").forEach((d) => (d.open = true))
      );
      const rows = await page.evaluate(AUDIT, { hoverRules });
      const unique = new Map<string, AuditRow>();
      for (const row of rows) {
        const key = `${row.el}|${row.state}|${row.got}|${row.size}`;
        if (!unique.has(key)) unique.set(key, row);
      }
      checked += unique.size;
      for (const row of unique.values()) {
        if (row.pass) continue;
        details.push(
          `${vp.name} ${row.got}:1 (needs ${row.need}) ${row.size}px/${row.weight} ${row.state} — ${row.el} "${row.text}"`
        );
      }
    } finally {
      await context.close();
    }
  }

  return {
    gate: "contrast",
    pass: details.length === 0,
    blocking: true,
    details: details.length ? details.slice(0, 40) : [`${checked} text elements checked, all pass`],
    ranAt: new Date().toISOString(),
  };
}
