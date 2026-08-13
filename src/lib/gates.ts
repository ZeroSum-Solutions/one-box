/**
 * Quality gates for a built site (sites/<runId>/site/). Gates measure the
 * BUILT SITE, not the design contract (audit E24) — everything runs against
 * a real Playwright page load, never a static grep of DESIGN.md.
 *
 * (a) token-drift   BLOCKING — every rendered color/font traces to tokens.css
 * (b) axe           BLOCKING — zero serious/critical a11y violations
 * (c) console-errors BLOCKING — no console errors on load
 * (d) assets        BLOCKING — every img/stylesheet/script resolves, every
 *                    internal #anchor resolves, tel: links match intake phone
 * (e) no-js         BLOCKING — hero/nav/contact CTA visible with JS disabled
 * (f) perf-budget   ADVISORY — transfer size + image bytes + DCL under a
 *                    throttled-CPU load; reports numbers, never blocks
 *
 * Path resolution is self-contained (no import from ./runstate) — see the
 * matching note in builder.ts.
 */
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import {
  SITES_DIR,
  SITE_DIR,
  ARTIFACTS,
  GateReportSchema,
  IntakeSchema,
  type GateReport,
} from "./contracts";

export interface RunGatesOptions {
  afterEdit?: boolean;
  /** URL that resolves directly to the built site's index.html. When
   * omitted, gates load the file straight off disk via file://. */
  baseUrl?: string;
}

const PERF_BUDGET = {
  totalBytes: 900 * 1024,
  imageBytes: 500 * 1024,
  domContentLoadedMs: 2000,
  cpuThrottleRate: 4,
};

export async function runGates(runId: string, opts: RunGatesOptions = {}): Promise<GateReport[]> {
  const runRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), SITES_DIR, runId);
  const siteDir = path.join(/*turbopackIgnore: true*/ runRoot, SITE_DIR);
  const url = opts.baseUrl ?? `file://${path.join(siteDir, "index.html")}`;

  const tokensCssText = await readFile(path.join(siteDir, "tokens.css"), "utf8");
  const allowed = parseAllowedTokens(tokensCssText);
  const phone = await readIntakePhone(runRoot);

  // afterEdit re-checks only the two invariants amendment B8 calls out by
  // name (token lint + axe) — the full suite still runs on a fresh build.
  const gateNames = opts.afterEdit
    ? (["token-drift", "axe", "mobile-layout"] as const)
    : (["token-drift", "axe", "console-errors", "assets", "no-js", "mobile-layout", "perf-budget"] as const);

  const browser = await chromium.launch();
  const reports: GateReport[] = [];
  try {
    for (const name of gateNames) {
      const report = await runOne(browser, name, url, { allowed, phone });
      reports.push(GateReportSchema.parse(report));
    }
  } finally {
    await browser.close();
  }

  await mkdir(runRoot, { recursive: true });
  await writeGates(runRoot, reports);
  return reports;
}

async function runOne(
  browser: import("playwright").Browser,
  name: string,
  url: string,
  ctx: { allowed: AllowedTokens; phone?: string }
): Promise<GateReport> {
  switch (name) {
    case "token-drift":
      return withPage(browser, (page) => gateTokenDrift(page, url, ctx.allowed));
    case "axe":
      return withPage(browser, (page) => gateAxe(page, url));
    case "console-errors":
      return withPage(browser, (page) => gateConsoleErrors(page, url));
    case "assets":
      return withPage(browser, (page) => gateAssets(page, url, ctx.phone));
    case "no-js":
      return gateNoJs(browser, url);
    case "mobile-layout":
      return gateMobileLayout(browser, url);
    case "perf-budget":
      return withPage(browser, (page) => gatePerfBudget(page, url));
    default:
      throw new Error(`unknown gate: ${name}`);
  }
}

async function withPage<T>(
  browser: import("playwright").Browser,
  fn: (page: Page) => Promise<T>
): Promise<T> {
  // Content-integrity gates care about the settled page, not an in-flight
  // CSS reveal transition — emulating reduced-motion makes reveal.js show
  // every [data-reveal] node at its final state synchronously (see
  // reveal.js), so axe/token-drift never race a mid-fade opacity frame.
  // Motion itself is a design concern the reduced-motion + no-js gates
  // already cover, not something these gates need to re-verify.
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await context.close();
  }
}

async function writeGates(runRoot: string, reports: GateReport[]): Promise<void> {
  const target = path.join(runRoot, ARTIFACTS.gates);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(reports, null, 2), "utf8");
  await rename(tmp, target);
}

async function readIntakePhone(runRoot: string): Promise<string | undefined> {
  try {
    const raw = JSON.parse(await readFile(path.join(runRoot, ARTIFACTS.intake), "utf8"));
    return IntakeSchema.parse(raw).phone;
  } catch {
    return undefined; // no intake.json in this run — tel: check degrades to informational
  }
}

// ---------- (a) token-drift ----------

interface AllowedTokens {
  colorRgb: Set<string>; // normalized "rgb(r, g, b)" / "rgba(r, g, b, a)"
  fontFirstFamilies: Set<string>; // lowercased, quote-stripped
}

function parseAllowedTokens(cssText: string): AllowedTokens {
  const colorRgb = new Set<string>(["rgba(0, 0, 0, 0)", "transparent", "currentcolor"]);
  const fontFirstFamilies = new Set<string>();
  const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(cssText))) {
    const [, name, rawValue] = m;
    const value = rawValue.trim();
    if (name.startsWith("--color-")) {
      const rgb = colorToRgbString(value);
      if (rgb) colorRgb.add(rgb);
    } else if (name.startsWith("--font-")) {
      const first = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
      if (first) fontFirstFamilies.add(first.toLowerCase());
    }
  }
  return { colorRgb, fontFirstFamilies };
}

function colorToRgbString(value: string): string | undefined {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) {
      const a = Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100) / 100;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (/^rgba?\(/i.test(value)) {
    // Already in functional form — pass through with Chromium's own comma-space
    // normalization so it compares equal to getComputedStyle output.
    const nums = value.match(/[\d.]+/g);
    if (!nums) return undefined;
    return nums.length === 4
      ? `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${nums[3]})`
      : `rgb(${nums[0]}, ${nums[1]}, ${nums[2]})`;
  }
  // gradients / hsl() / named colors used as a color-*, not rendering-checkable
  // by this gate (see WAVE-NOTES-buildgate.md) — no entry added, not a failure.
  return undefined;
}

async function gateTokenDrift(page: Page, url: string, allowed: AllowedTokens): Promise<GateReport> {
  await page.goto(url, { waitUntil: "load" });
  const elements = await page.$$eval("body *", (els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        editId: el.getAttribute("data-edit-id") ?? "",
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontFamily: cs.fontFamily,
      };
    })
  );

  const details: string[] = [];
  for (const el of elements) {
    if (["script", "style"].includes(el.tag)) continue;
    if (!isAllowedColor(el.color, allowed)) {
      details.push(`<${el.tag}${el.editId ? ` data-edit-id="${el.editId}"` : ""}> color ${el.color} not in tokens.css`);
    }
    if (!isAllowedColor(el.backgroundColor, allowed)) {
      details.push(`<${el.tag}${el.editId ? ` data-edit-id="${el.editId}"` : ""}> backgroundColor ${el.backgroundColor} not in tokens.css`);
    }
    if (!isAllowedFont(el.fontFamily, allowed)) {
      details.push(`<${el.tag}${el.editId ? ` data-edit-id="${el.editId}"` : ""}> fontFamily ${el.fontFamily} not in tokens.css`);
    }
  }

  return {
    gate: "token-drift",
    pass: details.length === 0,
    blocking: true,
    details: details.slice(0, 40),
    ranAt: new Date().toISOString(),
  };
}

function isAllowedColor(value: string, allowed: AllowedTokens): boolean {
  const v = value.trim().toLowerCase();
  if (v === "transparent" || v === "inherit" || v === "currentcolor") return true;
  return allowed.colorRgb.has(v) || allowed.colorRgb.has(value.trim());
}

function isAllowedFont(stack: string, allowed: AllowedTokens): boolean {
  const first = stack.split(",")[0]?.trim().replace(/^["']|["']$/g, "").toLowerCase();
  return !!first && allowed.fontFirstFamilies.has(first);
}

// ---------- (b) axe ----------

async function gateAxe(page: Page, url: string): Promise<GateReport> {
  await page.goto(url, { waitUntil: "load" });
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return {
    gate: "axe",
    pass: serious.length === 0,
    blocking: true,
    details: results.violations.map((v) => `${v.impact ?? "n/a"}: ${v.id} — ${v.help} (${v.nodes.length} node(s))`),
    ranAt: new Date().toISOString(),
  };
}

// ---------- (c) console-errors ----------

async function gateConsoleErrors(page: Page, url: string): Promise<GateReport> {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(300); // let async reveal/counter code settle
  return {
    gate: "console-errors",
    pass: errors.length === 0,
    blocking: true,
    details: errors,
    ranAt: new Date().toISOString(),
  };
}

// ---------- (d) assets ----------

async function gateAssets(page: Page, url: string, phone: string | undefined): Promise<GateReport> {
  const badResponses: string[] = [];
  page.on("response", (res) => {
    if (!res.ok() && res.status() !== 0) badResponses.push(`${res.status()} ${res.url()}`);
  });
  page.on("requestfailed", (req) => {
    badResponses.push(`FAILED ${req.url()} (${req.failure()?.errorText ?? "unknown"})`);
  });

  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(200);

  const details: string[] = [...new Set(badResponses)];

  const anchors = await page.$$eval("a[href]", (els) => els.map((el) => el.getAttribute("href") ?? ""));
  for (const href of anchors) {
    if (!href.startsWith("#") || href === "#") continue;
    const id = href.slice(1);
    const found = await page.locator(`[id="${id}"]`).count();
    if (found === 0) details.push(`internal anchor href="${href}" has no matching id`);
  }

  const telLinks = await page.$$eval("a[href^='tel:']", (els) =>
    els.map((el) => el.getAttribute("href") ?? "")
  );
  if (phone) {
    const expectedDigits = phone.replace(/[^\d]/g, "");
    for (const href of telLinks) {
      const hrefDigits = href.replace(/[^\d]/g, "");
      if (hrefDigits !== expectedDigits) {
        details.push(`tel: link "${href}" does not match intake phone "${phone}"`);
      }
    }
  } else if (telLinks.length === 0) {
    details.push("no intake.json phone available and no tel: links found — nothing to verify");
  }

  return {
    gate: "assets",
    pass: details.length === 0 || (details.length === 1 && details[0].startsWith("no intake.json")),
    blocking: true,
    details,
    ranAt: new Date().toISOString(),
  };
}

// ---------- (e) no-js ----------

async function gateNoJs(browser: import("playwright").Browser, url: string): Promise<GateReport> {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const details: string[] = [];
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    const checks: Array<[string, string]> = [
      ["hero headline", '[data-edit-id="hero.headline"]'],
      ["nav", "nav"],
      ["contact CTA", '[data-edit-id="contact.cta"]'],
    ];
    for (const [label, selector] of checks) {
      const visible = await page.locator(selector).first().isVisible().catch(() => false);
      if (!visible) details.push(`${label} (${selector}) not visible with JavaScript disabled`);
    }
  } finally {
    await context.close();
  }
  return {
    gate: "no-js",
    pass: details.length === 0,
    blocking: true,
    details,
    ranAt: new Date().toISOString(),
  };
}

// ---------- (f) mobile-layout ----------

/**
 * 390px invariants. Two failure modes that desktop review never catches and
 * that both shipped live before this gate existed:
 *
 * (1) horizontal overflow — anything wider than the viewport;
 * (2) word-stacking — a short label squeezed so narrow that each word wraps
 *     to its own line (a 14-char phone number rendered over 3 lines). Any
 *     leaf element with a short string across ≥3 lines is a squeeze, since
 *     no deliberate design breaks a 40-character label that way.
 */
async function gateMobileLayout(
  browser: import("playwright").Browser,
  url: string
): Promise<GateReport> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  let details: string[] = [];
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    details = await page.evaluate(() => {
      const out: string[] = [];
      const vw = window.innerWidth;
      if (document.documentElement.scrollWidth > vw + 1) {
        out.push(
          `page scrolls horizontally: content ${document.documentElement.scrollWidth}px wide in a ${vw}px viewport`
        );
      }
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 1) {
          out.push(
            `<${el.tagName.toLowerCase()}${el.className ? ` class="${el.className}"` : ""}> overflows the viewport (right edge ${Math.round(rect.right)}px)`
          );
        }
        const text = (el.textContent ?? "").trim();
        if (!text || text.length > 40) continue;
        if (el.children.length > 0) continue; // leaf text nodes only
        // Count real line boxes via a Range — height/line-height overcounts
        // on padded elements (a one-line button reads as three).
        const node = el.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = range.getClientRects().length;
        // A long headline wrapping to 4 lines is design; a 14-character phone
        // number over 3 lines is a squeeze. Characters-per-line separates
        // them — word-stacking always lands far below a normal line's worth.
        if (lines >= 3 && text.length / lines < 8) {
          out.push(
            `"${text}" wraps to ${lines} lines at 390px (element only ${Math.round(rect.width)}px wide)`
          );
        }
      }
      return out.slice(0, 20);
    });
  } finally {
    await context.close();
  }
  return {
    gate: "mobile-layout",
    pass: details.length === 0,
    blocking: true,
    details,
    ranAt: new Date().toISOString(),
  };
}

// ---------- (g) perf-budget (advisory) ----------

async function gatePerfBudget(page: Page, url: string): Promise<GateReport> {
  let totalBytes = 0;
  let imageBytes = 0;
  const responseSizes: Promise<void>[] = [];

  page.on("response", (res) => {
    const p = res
      .request()
      .sizes()
      .then((sizes) => {
        const bytes = sizes.responseBodySize + sizes.responseHeadersSize;
        totalBytes += bytes;
        const ct = res.headers()["content-type"] ?? "";
        if (ct.startsWith("image/")) imageBytes += bytes;
      })
      .catch(() => undefined);
    responseSizes.push(p);
  });

  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: PERF_BUDGET.cpuThrottleRate });

  await page.goto(url, { waitUntil: "load" });
  await Promise.all(responseSizes);

  const dcl = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav ? Math.round(nav.domContentLoadedEventEnd) : -1;
  });

  const pass =
    totalBytes < PERF_BUDGET.totalBytes && imageBytes < PERF_BUDGET.imageBytes && dcl >= 0 && dcl < PERF_BUDGET.domContentLoadedMs;

  return {
    gate: "perf-budget",
    pass,
    blocking: false,
    details: [
      `total transfer: ${Math.round(totalBytes / 1024)}KB (budget ${PERF_BUDGET.totalBytes / 1024}KB)`,
      `image bytes: ${Math.round(imageBytes / 1024)}KB (budget ${PERF_BUDGET.imageBytes / 1024}KB)`,
      `DOMContentLoaded: ${dcl}ms at ${PERF_BUDGET.cpuThrottleRate}x CPU throttle (budget ${PERF_BUDGET.domContentLoadedMs}ms)`,
    ],
    ranAt: new Date().toISOString(),
  };
}
