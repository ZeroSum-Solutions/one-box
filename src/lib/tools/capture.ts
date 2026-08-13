/**
 * Playwright dual-viewport screenshots (audit E19 — the crawl4ai wrapper
 * returns markdown only, no pixels; competitor decode needs an explicit
 * capture step). Desktop 1440x900 + mobile 390x844, full-page JPEG q78,
 * height-capped at 4000px, common cookie banners dismissed first.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

export interface Viewport {
  width: number;
  height: number;
  label: string;
}

const VIEWPORTS: Viewport[] = [
  { width: 1440, height: 900, label: "desktop" },
  { width: 390, height: 844, label: "mobile" },
];

const MAX_HEIGHT_PX = 4000;
const JPEG_QUALITY = 78;
const SETTLE_MS = 800;
const NAV_TIMEOUT_MS = 30_000;

// Spec: buttons matching /accept|agree|got it/i inside
// [class*=cookie],[id*=cookie],[class*=consent].
const COOKIE_CONTAINER_SELECTOR = '[class*="cookie"], [id*="cookie"], [class*="consent"]';
const ACCEPT_TEXT_RE = /accept|agree|got it/i;

/** Full-page (height-capped) screenshots at both viewports. Returns the
 * screenshot paths, one per viewport, in VIEWPORTS order. */
export async function capture(url: string, outDir: string): Promise<string[]> {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const paths: string[] = [];
    for (const vp of VIEWPORTS) {
      paths.push(await shootPage(browser, url, outDir, vp, true));
    }
    return paths;
  } finally {
    await browser.close();
  }
}

/** A single screenshot bounded to the viewport rect (no full-page resize) —
 * for lighter-weight captures than the full dual-viewport `capture()`. */
export async function captureViewportOnly(
  url: string,
  outDir: string,
  viewport: Viewport = VIEWPORTS[0]
): Promise<string> {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    return await shootPage(browser, url, outDir, viewport, false);
  } finally {
    await browser.close();
  }
}

async function shootPage(
  browser: Browser,
  url: string,
  outDir: string,
  vp: Viewport,
  fullPage: boolean
): Promise<string> {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.evaluate(() => document.fonts.ready).catch(() => undefined);
    await dismissCookieBanners(page);
    await page.waitForTimeout(SETTLE_MS);

    let heightTag = `${vp.width}x${vp.height}`;
    if (fullPage) {
      // Playwright's fullPage flag has no max-height, so the cap is applied
      // by hand: measure the real content height, resize the viewport to
      // min(content, cap), then take a plain (non-fullPage) screenshot —
      // which now captures exactly that rect, top to bottom.
      const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const shotHeight = Math.max(vp.height, Math.min(scrollHeight, MAX_HEIGHT_PX));
      if (shotHeight !== vp.height) {
        await page.setViewportSize({ width: vp.width, height: shotHeight });
        await page.waitForTimeout(150); // let any resize-triggered reflow settle
        heightTag = `${vp.width}x${shotHeight}`;
      }
    }

    const shotPath = path.join(
      outDir,
      `${vp.label}-${fullPage ? "full" : "viewport"}-${heightTag}.jpg`
    );
    await page.screenshot({ path: shotPath, type: "jpeg", quality: JPEG_QUALITY });
    return shotPath;
  } finally {
    await page.close();
  }
}

async function dismissCookieBanners(page: Page): Promise<void> {
  try {
    const acceptButton = page
      .locator(
        `${COOKIE_CONTAINER_SELECTOR} button, ${COOKIE_CONTAINER_SELECTOR} [role="button"]`
      )
      .filter({ hasText: ACCEPT_TEXT_RE })
      .first();
    if (await acceptButton.isVisible({ timeout: 1500 })) {
      await acceptButton.click({ timeout: 2000 });
      await page.waitForTimeout(200);
    }
  } catch {
    // best-effort only — never block a capture on banner dismissal
  }
}
