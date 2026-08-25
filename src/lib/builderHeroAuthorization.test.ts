import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const heroRace = vi.hoisted(() => ({
  armed: false,
  heroPath: "",
  replacementPath: "",
  swapped: false,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const copyFile: typeof actual.copyFile = async (source, destination, mode) => {
    if (
      heroRace.armed &&
      !heroRace.swapped &&
      String(source).endsWith("/gsap/dist/gsap.min.js")
    ) {
      heroRace.swapped = true;
      await actual.rm(heroRace.heroPath);
      await actual.symlink(heroRace.replacementPath, heroRace.heroPath);
    }
    return actual.copyFile(source, destination, mode);
  };
  return { ...actual, default: { ...actual, copyFile }, copyFile };
});

import fs from "node:fs/promises";
import { buildSite } from "./builder";
import { DesignTokensSchema, IntakeSchema } from "./contracts";
import { candidatePaths, createRun, saveArtifact, sitePaths } from "./runstate";

const runRoots: string[] = [];

afterEach(async () => {
  heroRace.armed = false;
  heroRace.heroPath = "";
  heroRace.replacementPath = "";
  heroRace.swapped = false;
  await Promise.all(
    runRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

const intake = IntakeSchema.parse({
  businessName: "Northstar",
  category: "commercial electrical",
  location: "Portland, OR",
  services: ["Lighting"],
  primaryAction: "quote",
});

const tokens = DesignTokensSchema.parse({
  colors: [
    { name: "Primary", value: "#1a1c1e", cssVar: "--color-primary", role: "Actions and headings" },
    { name: "Surface", value: "#f7f5f2", cssVar: "--color-surface", role: "Page background and button text" },
  ],
  fonts: [
    { family: "Public Sans", cssVar: "--font-sans", weights: [400, 600], role: "Narrative and UI", substitutes: ["system-ui"] },
  ],
  typeScale: [{ role: "body", sizePx: 16, lineHeight: 1.5, cssVar: "--text-body" }],
  radii: { sm: "4px" },
  spacing: { sm: "8px", md: "16px" },
  borders: { subtle: "1px solid #dedbd6" },
  shadows: { raised: "0 8px 24px rgb(0 0 0 / 0.12)" },
  layers: { base: "0", sticky: "20", overlay: "40" },
  layout: { maxWidthPx: 1200, sectionGapPx: 72, cardPaddingPx: 24 },
  motion: {
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    durationMs: { micro: 160, reveal: 500 },
    revealClasses: ["up"],
  },
  componentStates: [{ component: "button", states: { default: "solid", hover: "lift" } }],
  imageryBrief: { subject: "Field work", lighting: "Natural", grade: "Neutral", framing: "Wide", avoid: ["stock poses"] },
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

describe("hero build authorization", () => {
  it("rejects a hero reached through a symlinked intermediate directory", async () => {
    const runId = await createRun({ pipelineVersion: "legacy-v1" });
    const runRoot = sitePaths(runId).root;
    runRoots.push(runRoot);
    const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onebox-hero-authority-"));
    runRoots.push(externalRoot);
    const externalHero = path.join(externalRoot, "hero.jpg");
    await fs.writeFile(externalHero, "external-hero-bytes");
    await fs.mkdir(path.join(runRoot, "assets"), { recursive: true });
    await fs.symlink(externalRoot, path.join(runRoot, "assets", "nested"));
    await saveArtifact(runId, "intake.json", intake);
    await saveArtifact(runId, "tokens.json", tokens);
    await saveArtifact(runId, "skeleton.json", skeleton);
    await saveArtifact(runId, "copy.json", copy);

    await expect(
      buildSite({
        runId,
        intake,
        tokens,
        skeleton,
        copy,
        assets: {
          heroImagePath: path.join(runRoot, "assets", "nested", "hero.jpg"),
        },
      }),
    ).rejects.toThrow(/hero|run-owned|symlink|authority/i);
    await expect(fs.stat(candidatePaths(runId).root)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("writes the authorized hero bytes when the source path is substituted before rendering", async () => {
    const runId = await createRun({ pipelineVersion: "legacy-v1" });
    const runRoot = sitePaths(runId).root;
    runRoots.push(runRoot);
    const heroPath = path.join(runRoot, "assets", "hero.jpg");
    const replacementPath = path.join(runRoot, "assets", "replacement.jpg");
    const authorizedBytes = Buffer.from("authorized-hero-bytes");
    const replacementBytes = Buffer.from("substituted-hero-bytes");

    await fs.mkdir(path.dirname(heroPath), { recursive: true });
    await fs.writeFile(heroPath, authorizedBytes);
    await fs.writeFile(replacementPath, replacementBytes);
    await saveArtifact(runId, "intake.json", intake);
    await saveArtifact(runId, "tokens.json", tokens);
    await saveArtifact(runId, "skeleton.json", skeleton);
    await saveArtifact(runId, "copy.json", copy);

    heroRace.heroPath = heroPath;
    heroRace.replacementPath = replacementPath;
    heroRace.armed = true;

    await buildSite({
      runId,
      intake,
      tokens,
      skeleton,
      copy,
      assets: { heroImagePath: heroPath },
    });

    expect(heroRace.swapped).toBe(true);
    expect(await fs.readFile(path.join(candidatePaths(runId).site, "assets", "hero.jpg")))
      .toEqual(authorizedBytes);
    const provenance = JSON.parse(await fs.readFile(candidatePaths(runId).provenance, "utf8"));
    expect(provenance.inputArtifactHashes).toContainEqual({
      path: "assets/hero.jpg",
      sha256: createHash("sha256").update(authorizedBytes).digest("hex"),
    });
  });
});
