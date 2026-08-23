import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSite } from "./builder";
import { DesignTokensSchema, IntakeSchema } from "./contracts";
import { candidatePaths, createRun, saveArtifact, sitePaths } from "./runstate";
import { withSiteAuthorityLock } from "./siteAuthority";

const runIds: string[] = [];
const intake = IntakeSchema.parse({
  businessName: "Northstar",
  category: "commercial electrical",
  location: "Portland, OR",
  services: ["Lighting"],
  primaryAction: "quote",
});
const tokens = DesignTokensSchema.parse({
  colors: [
    { name: "Primary", value: "#1a1c1e", cssVar: "--color-primary", role: "Actions" },
    { name: "Surface", value: "#f7f5f2", cssVar: "--color-surface", role: "Page" },
  ],
  fonts: [{ family: "Public Sans", cssVar: "--font-sans", weights: [400, 600], role: "UI", substitutes: ["system-ui"] }],
  typeScale: [{ role: "body", sizePx: 16, lineHeight: 1.5, cssVar: "--text-body" }],
  radii: { sm: "4px" },
  spacing: { sm: "8px", md: "16px" },
  borders: { subtle: "1px solid #dedbd6" },
  shadows: { raised: "0 8px 24px rgb(0 0 0 / 0.12)" },
  layers: { base: "0", sticky: "20", overlay: "40" },
  layout: { maxWidthPx: 1200, sectionGapPx: 72, cardPaddingPx: 24 },
  motion: { easing: "linear", durationMs: { micro: 160, reveal: 500 }, revealClasses: [] },
  componentStates: [{ component: "button", states: { default: "solid" } }],
  imageryBrief: { subject: "Field work", lighting: "Natural", grade: "Neutral", framing: "Wide", avoid: [] },
});
const skeleton = {
  sections: [
    { id: "nav", name: "Navigation", purpose: "wayfinding", contentNeeds: [] },
    { id: "hero", name: "Hero", purpose: "conversion", contentNeeds: [] },
    { id: "contact", name: "Contact", purpose: "conversion", contentNeeds: [] },
    { id: "footer", name: "Footer", purpose: "chrome", contentNeeds: [] },
  ],
};
const copy = {
  sections: {
    nav: { logo: "Northstar", phone: "555-0100" },
    hero: { headline: "Proof first", sub: "Ready", cta: "Start", "image-alt": "Field work" },
    contact: { headline: "Contact", sub: "Ready", cta: "Start" },
    footer: { tagline: "Northstar" },
  },
};

afterEach(async () => {
  await Promise.all(runIds.splice(0).map((runId) =>
    fs.rm(sitePaths(runId).root, { recursive: true, force: true }),
  ));
});

describe("builder site authority", () => {
  it("does not write candidate bytes while another site-authority owner is active", async () => {
    const runId = await createRun({ pipelineVersion: "legacy-v1" });
    runIds.push(runId);
    for (const [name, value] of [
      ["intake.json", intake],
      ["tokens.json", tokens],
      ["skeleton.json", skeleton],
      ["copy.json", copy],
    ] as const) await saveArtifact(runId, name, value);

    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let acquired!: () => void;
    const entered = new Promise<void>((resolve) => { acquired = resolve; });
    const owner = withSiteAuthorityLock(runId, async () => {
      acquired();
      await held;
    });
    await entered;

    let settled = false;
    const build = buildSite({ runId, intake, tokens, skeleton, copy, assets: {} })
      .finally(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(settled).toBe(false);
    await expect(fs.stat(candidatePaths(runId).root)).rejects.toMatchObject({ code: "ENOENT" });

    release();
    await owner;
    await build;
    expect(await fs.readFile(path.join(candidatePaths(runId).site, "index.html"), "utf8"))
      .toContain("Proof first");
  });
});
