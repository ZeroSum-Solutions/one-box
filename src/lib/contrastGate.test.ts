import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gateContrast, hoverRulesFrom } from "./contrastGate";

/**
 * Negative test. A gate is not trusted until each known defect makes it fail
 * (H-001), so the fixture below reproduces every failure this gate exists to
 * catch — and the two false positives an earlier version produced.
 */
const FIXTURE_CSS = `
body { background: #fafaf8; color: #141415; font-family: sans-serif; font-size: 16px; }

/* Passes comfortably. If this is ever reported, the gate is broken. */
.pass-static { color: #141415; }

/* A11Y-002 verbatim: Faded Stone on Canvas White, 3.23:1, Refero's own
   documented role for "tertiary text". Must fail at both widths. */
.fail-static { color: #8c8c89; }

/* A11Y-005 shape: a ratio between the large-text and normal-text thresholds,
   on an element a media query shrinks. Passes as large text on desktop and
   fails as normal text on mobile. No static walk can see this. */
.hover-size { background: #ffffff; font-size: 30px; }
.hover-size:hover { color: #808080; }
@media (max-width: 640px) { .hover-size { font-size: 16px; } }

/* H-003 shape: hover darkens the background AND lightens the text. Forcing the
   colour without the background measures white-on-white and invents a failure.
   Must NOT be reported. */
.hover-both { transition: color 150ms, background 150ms; }
.hover-both:hover { background: #141415; color: #ffffff; }

/* H-002 shape: a real hover failure behind a colour transition. Unless
   transitions are frozen first, getComputedStyle returns the interpolated
   (old) colour and this silently passes. Must BE reported. */
.hover-transition { transition: color 150ms; }
.hover-transition:hover { color: #8c8c89; }

/* Cascade shape, taken from a live false positive: the generic rule would fail
   on this element, but a more specific rule overrides it and never lets that
   pair render. Replaying the generic rule with !important reported 2.53:1 on
   the smoke fixture's contact-band phone link. Must NOT be reported. */
.band { background: #ffffff; }
.band .beat-me:hover { color: #141415; }
.beat-me:hover { color: #b0b0b0; }
`;

const FIXTURE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="site.css"></head><body>
<p class="pass-static">Readable body copy</p>
<p class="fail-static">Tertiary label text</p>
<a class="hover-size" href="#">Call us today</a>
<a class="hover-both" href="#">Primary action</a>
<a class="hover-transition" href="#">Faded link</a>
<div class="band"><a class="beat-me" href="#">(512) 555-0142</a></div>
</body></html>`;

describe("hoverRulesFrom", () => {
  it("keeps the selector and body verbatim so the cascade can replay them", () => {
    expect(hoverRulesFrom(".b:hover{background:#141415;color:#fff}")).toEqual([
      { selector: ".b:hover", body: "background:#141415;color:#fff" },
    ]);
  });

  it("ignores hover rules that touch neither colour nor background", () => {
    expect(hoverRulesFrom(".b:hover{transform:translateY(-1px)}")).toEqual([]);
  });
});

describe("gateContrast", () => {
  let browser: Browser;
  let dir: string;
  let details: string[];
  let pass: boolean;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-contrast-"));
    await fs.writeFile(path.join(dir, "site.css"), FIXTURE_CSS);
    await fs.writeFile(path.join(dir, "index.html"), FIXTURE_HTML);
    browser = await chromium.launch();
    const report = await gateContrast(browser, `file://${path.join(dir, "index.html")}`, dir);
    details = report.details;
    pass = report.pass;
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  const lines = (needle: string) => details.filter((d) => d.includes(needle));

  it("fails the report when any pair fails", () => {
    expect(pass).toBe(false);
  });

  it("catches a static AA failure at both widths", () => {
    expect(lines("fail-static").map((d) => d.split(" ")[0]).sort()).toEqual(["desktop", "mobile"]);
  });

  it("catches a hover failure that only exists at the mobile size", () => {
    // The whole reason this gate exists alongside axe.
    expect(lines("hover-size").map((d) => d.split(" ")[0])).toEqual(["mobile"]);
  });

  it("catches a hover failure hidden behind a colour transition", () => {
    expect(lines("hover-transition").length).toBeGreaterThan(0);
  });

  it("does not invent a failure when hover moves text and background together", () => {
    expect(lines("hover-both")).toEqual([]);
  });

  it("never reports a comfortably passing pair", () => {
    expect(lines("pass-static")).toEqual([]);
  });

  it("respects the cascade instead of replaying a rule that never wins", () => {
    // The regression that failed the smoke fixture at 2.53:1 on a pair the
    // browser never renders. Specificity must decide, not the gate.
    expect(lines("beat-me")).toEqual([]);
  });
});
