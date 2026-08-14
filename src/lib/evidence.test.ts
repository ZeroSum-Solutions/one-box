import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compile } from "tailwindcss";
import { chromium } from "playwright";
import { buildSite } from "./builder";
import { createRun, sitePaths } from "./runstate";
import { withSiteAuthorityLock } from "./siteMutation";
import {
  assertCanonicalTokenInventory,
  buildCssArchitecture,
  applyApprovedTokenInventory,
  buildDesignResearchLedger,
  buildTailwindPlan,
  buildTokenInventory,
  buildVisualQa,
  computeSiteBuildSha256,
  renderDesignContract,
  renderTailwindThemeCss,
  runThreeWidthVisualQa,
  preferredReferenceEvidenceImage,
  tailwindComponentUtilityClasses,
  verifyAndExportDesignContract,
} from "./evidence";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});
import {
  DesignTokensSchema,
  IntakeSchema,
  ReferenceLockSchema,
  ScanResultSchema,
} from "./contracts";
import { VisualQaSchema } from "./contracts";

const intake = IntakeSchema.parse({
  businessName: "Northstar",
  category: "commercial electrical",
  location: "Portland, OR",
  services: ["Lighting"],
  primaryAction: "quote",
});

const scan = ScanResultSchema.parse({
  competitors: [
    {
      name: "Market Peer",
      url: "https://peer.example",
      source: "search",
      kind: "business",
      kindReason: "Local operating company",
      markdownPath: "research/peer.md",
      screenshotPaths: ["research/peer-1440.png"],
      structure: ["Proof", "Services"],
      crawl: {
        provider: "crawl4ai",
        sourceUrl: "https://peer.example",
        extractedAt: "2026-08-13T12:00:00.000Z",
        confidence: 0.95,
        outcome: "succeeded",
      },
      crawlAttempts: [
        {
          provider: "crawl4ai",
          sourceUrl: "https://peer.example",
          extractedAt: "2026-08-13T12:00:00.000Z",
          confidence: 0.95,
          outcome: "succeeded",
        },
      ],
    },
  ],
  commonSections: ["Services"],
  gaps: ["Show project proof"],
});

const lock = ReferenceLockSchema.parse({
  searchAngles: ["editorial utility", "technical proof", "clear conversion"],
  primary: {
    referoId: "ref-1",
    kind: "style",
    name: "Reference One",
    why: "Its hierarchy makes technical proof easy to scan.",
  },
  borrowedDetails: [],
  rejected: [],
  decisionLedger: [
    { decision: "Use a restrained proof grid", source: "ref-1 hierarchy" },
  ],
  provenance: {
    primary: {
      referoId: "ref-1",
      kind: "style",
      name: "Reference One",
      sourceUrl: "https://source.example",
    },
    candidates: [
      {
        referoId: "ref-1",
        kind: "style",
        name: "Reference One",
        sourceUrl: "https://source.example",
      },
    ],
    imagesViewed: ["research/ref-1.png"],
  },
});

const tokens = DesignTokensSchema.parse({
  colors: [
    {
      name: "Primary",
      value: "#1a1c1e",
      cssVar: "--color-primary",
      role: "Actions and headings",
    },
    {
      name: "Surface",
      value: "#f7f5f2",
      cssVar: "--color-surface",
      role: "Page background and button text",
    },
  ],
  fonts: [
    {
      family: "Public Sans",
      cssVar: "--font-sans",
      weights: [400, 600],
      role: "Narrative and UI",
      substitutes: ["system-ui"],
    },
  ],
  typeScale: [
    {
      role: "body",
      sizePx: 16,
      lineHeight: 1.5,
      cssVar: "--text-body",
    },
  ],
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
  componentStates: [
    { component: "button", states: { default: "solid", hover: "lift" } },
  ],
  imageryBrief: {
    subject: "Field work",
    lighting: "Natural",
    grade: "Neutral",
    framing: "Wide",
    avoid: ["stock poses"],
  },
});

describe("evidence artifact derivation", () => {
  it("keeps market evidence and Refero design evidence separate", () => {
    const ledger = buildDesignResearchLedger({
      intake,
      scan,
      lock,
      capturedAt: "2026-08-13T12:00:00.000Z",
    });
    expect(ledger.businessIntelligence.sources[0].sourceUrl).toBe(
      "https://peer.example"
    );
    expect(ledger.referoDesignEvidence.sources[0].sourceUrl).toBe(
      "https://source.example"
    );
    expect(ledger.businessIntelligence.claims[0].classification).toBe("observed");
    expect(ledger.businessIntelligence.sources[0].crawl).toMatchObject({
      provider: "crawl4ai",
      outcome: "succeeded",
    });
    expect(ledger.businessIntelligence.sources[0].crawlAttempts).toHaveLength(1);
    expect(ledger.referoDesignEvidence.claims[0].classification).toBe("inferred");
  });

  it("retains screen and client artifact lineage without storage details", () => {
    const screenLock = ReferenceLockSchema.parse({
      searchAngles: ["a", "b", "c"],
      primary: { referoId: "screen-7", kind: "screen", name: "iOS checkout", why: "Clear action hierarchy" },
      borrowedDetails: [],
      rejected: [],
      decisionLedger: [{ decision: "Use a persistent action", source: "screen-7" }],
      provenance: {
        primary: { referoId: "screen-7", kind: "screen", name: "iOS checkout", screenshotPath: "research/refero/reference-1.png" },
        candidates: [{ referoId: "screen-7", kind: "screen", name: "iOS checkout", screenshotPath: "research/refero/reference-1.png" }],
        imagesViewed: ["research/refero/reference-1.png"],
      },
    });
    const ledger = buildDesignResearchLedger({
      intake,
      scan,
      lock: screenLock,
      capturedAt: "2026-08-13T12:00:00.000Z",
      uploads: [{ id: "claim-7", kind: "brand-guidelines", sha256: "a".repeat(64), status: "text-consumed", consumer: "design" }],
    });
    expect(ledger.referoDesignEvidence.sources[0]).toMatchObject({
      sourceUrl: "refero:screen:screen-7",
      screenshotPaths: ["research/refero/reference-1.png"],
    });
    expect(ledger.referoDesignEvidence.claims[0].sourceIds).toEqual(["refero-1"]);
    expect(ledger.clientEvidence.artifactRelationships[0]).toEqual({
      uploadId: "claim-7",
      kind: "brand-guidelines",
      sha256: "a".repeat(64),
      status: "text-consumed",
      consumer: "design",
      sourceId: "upload-claim-7",
    });
    expect(JSON.stringify(ledger.clientEvidence)).not.toContain("storagePath");
  });

  it("derives traceable token, Tailwind, CSS, and QA artifacts", () => {
    const inventory = buildTokenInventory(tokens, 1, ["refero-1"]);
    const plan = buildTailwindPlan(inventory, 1);
    const architecture = buildCssArchitecture(inventory, plan, 1);
    const qa = buildVisualQa(1);
    const css = renderTailwindThemeCss(inventory, plan);

    expect(inventory.tokens.every((token) => token.usage.length > 0)).toBe(true);
    expect(plan.themeMappings.length + plan.runtimeOnlyVariables.length).toBe(inventory.tokens.length);
    expect(new Set(inventory.tokens.map((token) => token.category))).toEqual(
      new Set([
        "color",
        "typography",
        "spacing",
        "radius",
        "border",
        "shadow",
        "breakpoint",
        "motion",
        "layer",
        "component-state",
      ])
    );
    expect(architecture.generatedCssPath).toBe("site/tailwind-utilities.css");
    expect(qa.checks.map((check) => check.area)).toContain("reduced-motion");
    expect(css).toContain("@theme inline");
    expect(css).toContain("var(--ds-color-primary)");
  });

  it("compiles approved inventory values back into runtime tokens", () => {
    const inventory = buildTokenInventory(tokens, 1, ["refero-1"]);
    const primary = inventory.tokens.find(
      (token) => token.semanticName === "--color-primary"
    );
    if (!primary) throw new Error("fixture primary token missing");
    primary.value = "#0057ff";
    const compiled = applyApprovedTokenInventory(tokens, inventory);
    expect(compiled.colors.find((token) => token.cssVar === "--color-primary")?.value).toBe("#0057ff");
  });

  it("rejects incomplete, duplicate, invented, and structural token edits", () => {
    const canonical = buildTokenInventory(tokens, 1, ["refero-1"]);
    expect(() => assertCanonicalTokenInventory(tokens, { ...canonical, tokens: canonical.tokens.slice(1) }, ["refero-1"])).toThrow(/complete canonical/);
    expect(() => assertCanonicalTokenInventory(tokens, { ...canonical, tokens: [...canonical.tokens.slice(0, -1), canonical.tokens[0]] }, ["refero-1"])).toThrow();
    expect(() => assertCanonicalTokenInventory(tokens, { ...canonical, tokens: canonical.tokens.map((token, index) => index === 0 ? { ...token, semanticName: "--invented" } : token) }, ["refero-1"])).toThrow(/missing/);
    expect(() => assertCanonicalTokenInventory(tokens, { ...canonical, tokens: canonical.tokens.map((token, index) => index === 0 ? { ...token, usage: "changed structure" } : token) }, ["refero-1"])).toThrow(/only its value/);
    const immutable = canonical.tokens.find((token) => !token.editable);
    if (!immutable) throw new Error("fixture immutable token missing");
    expect(() => assertCanonicalTokenInventory(tokens, { ...canonical, tokens: canonical.tokens.map((token) => token.semanticName === immutable.semanticName ? { ...token, value: "invented" } : token) }, ["refero-1"])).toThrow(/not editable/);
  });

  it("requires a one-to-one Tailwind mapping for approved tokens", () => {
    const inventory = buildTokenInventory(tokens, 1, ["refero-1"]);
    const plan = buildTailwindPlan(inventory, 1);
    expect(() => renderTailwindThemeCss(inventory, { ...plan, themeMappings: plan.themeMappings.slice(1) })).toThrow(/canonical variable\/name pair/);
    expect(() => renderTailwindThemeCss(inventory, { ...plan, themeMappings: [...plan.themeMappings.slice(0, -1), plan.themeMappings[0]] })).toThrow();
    const swapped = plan.themeMappings.map((mapping, index, mappings) =>
      index < 2 ? { ...mapping, tailwindName: mappings[1 - index].tailwindName } : mapping
    );
    expect(() => renderTailwindThemeCss(inventory, { ...plan, themeMappings: swapped })).toThrow(/canonical variable\/name pair/);
    expect(() => renderTailwindThemeCss(inventory, { ...plan, themeMappings: plan.themeMappings.map((mapping, index) => index === 0 ? { ...mapping, tailwindName: "--arbitrary-invention" } : mapping) })).toThrow(/canonical variable\/name pair/);
    const names = new Map(plan.themeMappings.map((mapping) => [mapping.cssVariable, mapping.tailwindName]));
    expect(names.get("--ds-font-sans")).toBe("--font-sans");
    expect(names.get("--ds-text-body")).toBe("--text-body");
    expect(names.get("--ds-motion-ease")).toBe("--ease-standard");
    expect(names.has("--ds-motion-duration-micro")).toBe(false);
    expect(plan.runtimeOnlyVariables.map((entry) => entry.cssVariable)).toContain("--ds-motion-duration-micro");
    expect(plan.runtimeOnlyVariables.map((entry) => entry.cssVariable)).toContain("--ds-border-subtle");
    expect(plan.runtimeOnlyVariables.map((entry) => entry.cssVariable)).toContain("--ds-layer-base");
    expect(names.get("--ds-layout-max-width")).toBe("--container-content");
  });

  it("compiles documented Tailwind v4 namespaces into working computed utilities", async () => {
    const inventory = buildTokenInventory(tokens, 1, ["refero-1"]);
    const plan = buildTailwindPlan(inventory, 1);
    const compiler = await compile(`${renderTailwindThemeCss(inventory, plan)}\n@tailwind utilities;`);
    const css = compiler.build(["font-sans", "text-body", "max-w-content", "ease-standard"]);
    expect(css).toContain(".font-sans");
    expect(css).toContain(".text-body");
    expect(css).toContain(".max-w-content");
    expect(css).toContain(".ease-standard");
    expect(css).not.toContain(".duration-micro");
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-tailwind-utility-"));
    temporaryDirectories.push(directory);
    await fs.writeFile(path.join(directory, "index.html"), `<style>${css}</style><div id="probe" class="font-sans text-body max-w-content ease-standard">Probe</div>`);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`file://${path.join(directory, "index.html")}`);
      const computed = await page.locator("#probe").evaluate((element) => {
        const style = getComputedStyle(element);
        return { fontFamily: style.fontFamily, fontSize: style.fontSize, maxWidth: style.maxWidth, easing: style.transitionTimingFunction };
      });
      expect(computed.fontFamily).toContain("Public Sans");
      expect(computed.fontSize).toBe("16px");
      expect(computed.maxWidth).toBe("1200px");
      expect(computed.easing).toBe("cubic-bezier(0.2, 0.8, 0.2, 1)");
    } finally {
      await browser.close();
    }
  });

  it("renders a machine-readable design.md contract in canonical section order", () => {
    const markdown = renderDesignContract(intake, tokens, lock);
    expect(markdown.startsWith("---\nversion: alpha")).toBe(true);
    expect(markdown).toContain('backgroundColor: "{colors.primary}"');
    expect(markdown.indexOf("## Colors")).toBeLessThan(
      markdown.indexOf("## Typography")
    );
    expect(markdown.indexOf("## Components")).toBeLessThan(
      markdown.indexOf("## Do's and Don'ts")
    );
  });

  it(
    "passes the pinned design.md lint and Tailwind v4 export",
    async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-design-"));
      temporaryDirectories.push(directory);
      const contractPath = path.join(directory, "DESIGN.md");
      const exportPath = path.join(directory, "design-tailwind.css");
      await fs.writeFile(contractPath, renderDesignContract(intake, tokens, lock));

      const verification = await verifyAndExportDesignContract(
        contractPath,
        exportPath
      );
      expect(verification.lint.errors).toBe(0);
      expect(verification.lint.warnings).toBe(0);
      expect(verification.lint.infos).toBeGreaterThanOrEqual(1);
      expect(await fs.readFile(exportPath, "utf8")).toContain("@theme");
    },
    30_000
  );

  it("records passing visual QA at desktop, tablet, and mobile widths", async () => {
    const runId = await createRun({ pipelineVersion: "legacy-v1" });
    const runRoot = sitePaths(runId).root;
    const site = sitePaths(runId).site;
    temporaryDirectories.push(runRoot);
    const runtimeTokens = {
      ...tokens,
      colors: [
        ...tokens.colors,
        { name: "Background", value: "#111315", cssVar: "--color-bg", role: "Page background" },
        { name: "Text", value: "#faf9f7", cssVar: "--color-text", role: "Body text" },
        { name: "Muted", value: "#c9c5bf", cssVar: "--color-text-muted", role: "Secondary text" },
        { name: "Primary contrast", value: "#ffffff", cssVar: "--color-primary-contrast", role: "Text on primary" },
        { name: "Border", value: "#77716a", cssVar: "--color-border", role: "Dividers" },
        { name: "Surface alt", value: "#24282c", cssVar: "--color-surface-alt", role: "Alternate surface" },
      ],
    };
    const inventory = buildTokenInventory(runtimeTokens, 1, ["fixture"]);
    const plan = buildTailwindPlan(inventory, 1);
    await buildSite({
      runId,
      intake,
      tokens: runtimeTokens,
      skeleton: {
        sections: [
          { id: "nav", name: "Navigation", purpose: "wayfinding", contentNeeds: [] },
          { id: "hero", name: "Hero", purpose: "conversion", contentNeeds: [] },
          { id: "contact", name: "Contact", purpose: "conversion", contentNeeds: [] },
          { id: "footer", name: "Footer", purpose: "chrome", contentNeeds: [] },
        ],
      },
      copy: {
        sections: {
          nav: { logo: "Northstar", phone: "555-0100" },
          hero: { headline: "Proof first", sub: "Ready", cta: "Start", "image-alt": "Field work" },
          contact: { headline: "Contact", sub: "Ready", cta: "Start" },
          footer: { tagline: "Northstar" },
        },
      },
      assets: {},
      tailwindThemeCss: renderTailwindThemeCss(inventory, plan),
      tailwindUtilityClasses: tailwindComponentUtilityClasses(plan),
    });

    const [builtHtml, compiledCss] = await Promise.all([
      fs.readFile(path.join(site, "index.html"), "utf8"),
      fs.readFile(path.join(site, "tailwind-utilities.css"), "utf8"),
    ]);
    expect(builtHtml).toContain("hero__cta font-sans text-body rounded-sm shadow-raised ease-standard max-w-content");
    expect(builtHtml).toContain('href="tailwind-utilities.css"');
    expect(compiledCss).toContain(".font-sans");
    expect(compiledCss).toContain("font-family: var(--ds-font-sans)");
    const runtimeBrowser = await chromium.launch({ headless: true });
    try {
      const runtimePage = await runtimeBrowser.newPage();
      await runtimePage.goto(`file://${path.join(site, "index.html")}`);
      expect(await runtimePage.locator(".hero__cta").evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Public Sans");
    } finally {
      await runtimeBrowser.close();
    }

    const qa = await runThreeWidthVisualQa(runId, site, 1);
    for (const area of ["desktop", "tablet", "mobile"] as const) {
      expect(qa.checks.find((check) => check.area === area)).toMatchObject({
        status: "pass",
        evidencePath: expect.stringMatching(new RegExp(`${area}-`)),
      });
    }
    expect(qa.checks.find((check) => check.area === "focus")?.status).toBe("pass");
    expect(qa.checks.find((check) => check.area === "hover")?.status).toBe("pass");
    expect(qa.checks.find((check) => check.area === "color-scheme")?.status).toBe("pass");
    expect(qa.checks.find((check) => check.area === "reduced-motion")?.status).toBe("pass");
    expect(qa.buildSha256).toMatch(/^[a-f0-9]{64}$/);
  }, 30_000);

  it("rejects empty, duplicate, and screenshot-free visual QA", () => {
    const base = buildVisualQa(1);
    expect(() => VisualQaSchema.parse({ ...base, checks: [] })).toThrow();
    expect(() =>
      VisualQaSchema.parse({
        ...base,
        checks: base.checks.map((check, index) =>
          index === 6 ? { ...check, area: "focus" } : check
        ),
      })
    ).toThrow(/exactly once/);
    expect(() =>
      VisualQaSchema.parse({
        ...base,
        checks: base.checks.map((check) =>
          check.area === "mobile" ? { ...check, evidencePath: undefined } : check
        ),
      })
    ).toThrow(/screenshot evidence/);
  });

  it("prefers stable run-relative Refero evidence for iOS screens and styles", () => {
    for (const kind of ["screen", "style"] as const) {
      expect(preferredReferenceEvidenceImage({
        referoId: `${kind}-1`,
        kind,
        name: "Reference",
        screenshotPath: `evidence/refero/${kind}-1.webp`,
        previewImageUrl: `https://remote.example/${kind}-1.webp`,
      })).toBe(`evidence/refero/${kind}-1.webp`);
    }
  });

  it("bounds missing dark targets and computes transparent CTA contrast over ancestors", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-qa-target-"));
    temporaryDirectories.push(root);
    const site = path.join(root, "site");
    await fs.mkdir(site, { recursive: true });
    await fs.writeFile(path.join(site, "index.html"), `<!doctype html><style>
      body{margin:0}.surface{background:#111;color:#fff;padding:2rem}.hero__cta{background:transparent;color:rgba(255,255,255,.9);display:inline-block;padding:1rem;transition:transform .1s}.hero__cta:hover{transform:scale(1.02)}.hero__cta:focus-visible{outline:3px solid #fff}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
    </style><main class="surface"><a class="hero__cta" href="#">Start</a></main>`);
    const transparent = await runThreeWidthVisualQa("qa-target-test", site, 1);
    expect(transparent.checks.find((check) => check.area === "color-scheme")?.status).toBe("pass");

    await fs.writeFile(path.join(site, "index.html"), "<!doctype html><main>No call to action</main>");
    const missing = await runThreeWidthVisualQa("qa-target-test", site, 1);
    expect(missing.checks.find((check) => check.area === "hover")?.status).toBe("fail");
    expect(missing.checks.find((check) => check.area === "focus")?.status).toBe("fail");
    expect(missing.checks.find((check) => check.area === "color-scheme")?.status).toBe("fail");
  }, 30_000);

  it("waits for a transient site edit rollback before hashing and capturing QA", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-qa-lock-"));
    temporaryDirectories.push(root);
    const site = path.join(root, "site");
    const index = path.join(site, "index.html");
    await fs.mkdir(site, { recursive: true });
    const stable = '<!doctype html><style>.hero__cta{display:inline-block;background:#111;color:#fff}.hero__cta:hover{transform:scale(1.1)}.hero__cta:focus-visible{outline:3px solid #fff}</style><main><a class="hero__cta" href="#">Start</a></main>';
    await fs.writeFile(index, stable);
    let editStarted!: () => void;
    let releaseEdit!: () => void;
    const started = new Promise<void>((resolve) => { editStarted = resolve; });
    const release = new Promise<void>((resolve) => { releaseEdit = resolve; });
    const transientEdit = withSiteAuthorityLock("qa-lock-test", async () => {
      await fs.writeFile(index, "<!doctype html><main>transient candidate</main>");
      editStarted();
      await release;
      await fs.writeFile(index, stable);
    });
    await started;
    const qaPromise = runThreeWidthVisualQa("qa-lock-test", site, 1);
    releaseEdit();
    await transientEdit;
    const qa = await qaPromise;
    expect(qa.buildSha256).toBe(await computeSiteBuildSha256(site));
    expect(qa.checks.find((check) => check.area === "hover")?.status).toBe("pass");
  }, 30_000);
});
