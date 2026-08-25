import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGates } from "./gates";
import {
  knownMutationGateRequest,
  type MutationGateRequest,
} from "./mutationGateMatrix";
import { sitePaths } from "./runstate";

const runIds: string[] = [];

const tokens = {
  colors: [
    { name: "Canvas", value: "#ffffff", cssVar: "--color-bg", role: "page" },
    { name: "Ink", value: "#111111", cssVar: "--color-text", role: "text" },
  ],
  fonts: [
    { family: "Arial", cssVar: "--font-body", weights: [400, 700], role: "body" },
  ],
  typeScale: [],
  radii: {},
  spacing: {},
  layout: { maxWidthPx: 1200, sectionGapPx: 64, cardPaddingPx: 24 },
  motion: {
    easing: "linear",
    durationMs: { micro: 100, reveal: 200 },
    revealClasses: [],
  },
  componentStates: [],
  imageryBrief: {
    subject: "none",
    lighting: "none",
    grade: "none",
    framing: "none",
    avoid: [],
  },
};

function baseHtml(bodyExtra = "", headExtra = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>After-edit fixture</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="site.css">${headExtra}</head><body><nav aria-label="Main navigation"><a href="#contact">Contact</a></nav><main><section><h1 data-edit-id="hero.headline">After-edit fixture</h1><p>Readable body copy.</p></section><section id="contact"><h2>Contact</h2><a data-edit-id="contact.cta" href="tel:5550100">Call 555-0100</a></section>${bodyExtra}</main></body></html>`;
}

async function createLiveFixture(
  suffix: string,
  options: { html?: string; css?: string } = {},
): Promise<string> {
  const runId = `after-edit-${suffix}-${process.pid}`;
  runIds.push(runId);
  const { root, site } = sitePaths(runId);
  await fs.mkdir(site, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(site, "index.html"), options.html ?? baseHtml()),
    fs.writeFile(
      path.join(site, "tokens.css"),
      ":root { --color-bg: #ffffff; --color-text: #111111; --font-body: Arial, sans-serif; }\n",
    ),
    fs.writeFile(
      path.join(site, "site.css"),
      options.css ??
        "* { box-sizing: border-box; color: var(--color-text); font-family: var(--font-body); } body { margin: 0; background: var(--color-bg); } nav, main, section { display: block; padding: 1rem; } a { display: inline-block; }\n",
    ),
    fs.writeFile(path.join(root, "tokens.json"), JSON.stringify(tokens)),
    fs.writeFile(
      path.join(root, "intake.json"),
      JSON.stringify({
        businessName: "After Edit Co",
        category: "service",
        location: "Portland, OR",
        services: ["Service"],
        phone: "555-0100",
        primaryAction: "call",
      }),
    ),
  ]);
  return runId;
}

afterEach(async () => {
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
    ),
  );
});

describe("capability-aware after-edit gates in a real browser", () => {
  it.each([
    {
      capability: "content",
      expected: ["axe", "contrast", "no-js", "mobile-layout"],
      failingGate: "no-js",
      html: baseHtml().replace(' data-edit-id="contact.cta"', ""),
    },
    {
      capability: "token-style",
      expected: [
        "token-drift",
        "color-role-compliance",
        "axe",
        "contrast",
        "no-js",
        "mobile-layout",
      ],
      failingGate: "token-drift",
      css: "* { color: var(--missing-color); font-family: var(--font-body); } body { background: var(--color-bg); }",
    },
    {
      capability: "asset",
      expected: ["axe", "assets", "mobile-layout", "perf-budget"],
      failingGate: "assets",
      html: baseHtml('<img src="missing-image.webp" alt="Missing fixture">'),
    },
    {
      capability: "structure",
      expected: [
        "token-drift",
        "color-role-compliance",
        "axe",
        "contrast",
        "console-errors",
        "assets",
        "no-js",
        "mobile-layout",
        "perf-budget",
      ],
      failingGate: "console-errors",
      html: baseHtml("", '<script>throw new Error("seeded structure defect")</script>'),
    },
    {
      capability: "link-action",
      expected: ["axe", "console-errors", "assets", "no-js"],
      failingGate: "assets",
      html: baseHtml('<a href="#missing-target">Broken route link</a>'),
    },
    {
      capability: "motion",
      expected: [
        "token-drift",
        "color-role-compliance",
        "axe",
        "contrast",
        "console-errors",
        "assets",
        "no-js",
        "mobile-layout",
        "perf-budget",
      ],
      failingGate: "console-errors",
      html: baseHtml("", '<script>throw new Error("seeded motion defect")</script>'),
    },
  ] as const)(
    "$capability runs its ordered row and catches $failingGate",
    { timeout: 90_000 },
    async ({ capability, expected, failingGate, html, css }) => {
      const runId = await createLiveFixture(capability, { html, css });
      const request: MutationGateRequest = knownMutationGateRequest(capability);

      const reports = await runGates(runId, { afterEdit: request });

      expect(reports.map((report) => report.gate)).toEqual(expected);
      expect(reports.find((report) => report.gate === failingGate)).toMatchObject({
        pass: false,
        blocking: true,
      });
    },
  );
});
