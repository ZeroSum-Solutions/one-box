import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium, type Page } from "playwright";
import { withSiteAuthorityLock } from "./siteMutation";
import {
  candidateBuildSha256,
  LIVE_BUNDLE_METADATA_DIR,
} from "./liveBundle";
import {
  CssArchitectureSchema,
  DesignResearchLedgerSchema,
  TailwindPlanSchema,
  TokenInventorySchema,
  VisualQaSchema,
  type CssArchitecture,
  type DesignResearchLedger,
  type DesignTokens,
  type Intake,
  type ReferenceLock,
  type ReferenceCandidate,
  type ScanResult,
  type TailwindPlan,
  type TokenInventory,
  type VisualQa,
} from "./contracts";

const execFileAsync = promisify(execFile);

export function preferredReferenceEvidenceImage(
  candidate: ReferenceCandidate | undefined
): string | undefined {
  return candidate?.screenshotPath ?? candidate?.previewImageUrl;
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^--/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "token";
}

function uniqueKey(value: string, used: Set<string>): string {
  const base = slug(value);
  let key = base;
  let suffix = 2;
  while (used.has(key)) {
    key = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function cssVariable(value: string): string {
  const normalized = value.startsWith("--") ? value : `--${value}`;
  return `--ds-${slug(normalized)}`;
}

export function buildDesignResearchLedger(input: {
  intake: Intake;
  scan: ScanResult;
  lock: ReferenceLock;
  capturedAt: string;
  uploads?: Array<{
    id: string;
    kind: string;
    sha256?: string;
    status: "text-consumed" | "asset-referenced" | "unsupported";
    consumer?: "design" | "copy";
  }>;
}): DesignResearchLedger {
  const { intake, scan, lock, capturedAt } = input;
  const clientUploads = input.uploads ?? [];
  const businessEnabled = intake.research.enabled && intake.research.businessIntelligence;
  const referoEnabled = intake.research.enabled && intake.research.referoDesignEvidence;
  const businessSources = businessEnabled ? scan.competitors.map((competitor, index) => ({
    id: `business-${index + 1}`,
    sourceUrl: competitor.url,
    title: competitor.name,
    screenshotPaths: competitor.screenshotPaths,
    extractedArtifactPaths: competitor.markdownPath ? [competitor.markdownPath] : [],
    capturedAt,
    confidence: competitor.structure.length > 0 ? 0.9 : 0.65,
    crawl: competitor.crawl,
    crawlAttempts: competitor.crawlAttempts,
  })) : [];

  const candidates = referoEnabled ? (lock.provenance?.candidates ?? []) : [];
  const referoSources = candidates.map((candidate, index) => ({
      id: `refero-${index + 1}`,
      sourceUrl: candidate.sourceUrl ?? `refero:screen:${candidate.referoId}`,
      title: candidate.name,
      screenshotPaths: candidate.screenshotPath ? [candidate.screenshotPath] : [],
      extractedArtifactPaths: [],
      capturedAt,
      confidence: candidate.referoId === lock.primary.referoId ? 0.95 : 0.75,
    }));
  const sourceByReferoId = new Map(
    candidates.map((candidate, index) => [candidate.referoId, referoSources[index]])
  );
  const primarySource = sourceByReferoId.get(lock.primary.referoId);

  return DesignResearchLedgerSchema.parse({
    projectTarget: intake.projectTarget,
    businessIntelligence: {
      kind: "business-intelligence",
      sources: businessSources,
      competitors: businessEnabled ? scan.competitors.map((competitor) => ({
        name: competitor.name,
        url: competitor.url,
        selectionRationale:
          competitor.kindReason ??
          `Included as a ${competitor.kind} market result for ${intake.category}.`,
        strengths: competitor.structure,
        gaps: competitor.notes ? [competitor.notes] : [],
      })) : [],
      marketExpectations: businessEnabled ? scan.commonSections : [],
      differentiationOpportunities: businessEnabled ? scan.gaps : [],
      claims: [
        ...(businessEnabled ? scan.commonSections : []).map((section, index) => ({
          id: `market-observation-${index + 1}`,
          statement: `${section} appears across the selected market set.`,
          classification: "observed" as const,
          sourceIds: businessSources.map((source) => source.id),
          confidence: 0.8,
        })),
        ...(businessEnabled ? scan.gaps : []).map((gap, index) => ({
          id: `market-recommendation-${index + 1}`,
          statement: gap,
          classification: "recommended" as const,
          sourceIds: businessSources.map((source) => source.id),
          confidence: 0.7,
        })),
      ],
    },
    referoDesignEvidence: {
      kind: "refero-design-evidence",
      sources: referoSources,
      references: referoEnabled ? [
        {
          referoId: lock.primary.referoId,
          name: lock.primary.name,
          sourceUrl: primarySource?.sourceUrl,
          learningRationale: lock.primary.why,
          reusablePatterns:
            lock.decisionLedger.length > 0
              ? lock.decisionLedger.map((entry) => entry.decision)
              : [lock.primary.why],
        },
        ...lock.borrowedDetails.map((detail) => {
          const candidate = candidates.find(
            (item) => item.referoId === detail.referoId
          );
          return {
            referoId: detail.referoId,
            name: candidate?.name ?? detail.referoId,
            sourceUrl: candidate?.sourceUrl,
            learningRationale: detail.why,
            reusablePatterns: [detail.detail],
          };
        }),
      ] : [],
      claims: (referoEnabled ? lock.decisionLedger : []).map((entry, index) => ({
        id: `design-decision-${index + 1}`,
        statement: entry.decision,
        classification: "inferred" as const,
        sourceIds: primarySource ? [primarySource.id] : [],
        confidence: primarySource ? 0.85 : 0.6,
      })),
    },
    clientEvidence: {
      sources: clientUploads
        .filter((upload) => upload.status !== "unsupported")
        .map((upload) => ({
          id: `upload-${upload.id}`,
          sourceUrl: `upload://${upload.id}`,
          title: `Client-provided ${upload.kind}`,
          screenshotPaths: [],
          extractedArtifactPaths: [],
          capturedAt,
          confidence: 1,
        })),
      claims: clientUploads
        .filter((upload) => upload.status !== "unsupported")
        .map((upload) => ({
          id: `client-${upload.id}`,
          statement:
            upload.status === "text-consumed" && upload.consumer === "design"
              ? `Client-provided ${upload.kind} must take priority over inferred design preferences.`
              : upload.status === "text-consumed"
                ? `Client-provided ${upload.kind} is approved copy context.`
              : `Client-provided ${upload.kind} is an approved visual asset reference.`,
          classification: "observed" as const,
          sourceIds: [`upload-${upload.id}`],
          confidence: 1,
        })),
      unsupportedUploadIds: clientUploads
        .filter((upload) => upload.status === "unsupported")
        .map((upload) => upload.id),
      artifactRelationships: clientUploads.map((upload) => ({
        uploadId: upload.id,
        kind: upload.kind,
        sha256: upload.sha256,
        status: upload.status,
        consumer: upload.consumer,
        sourceId: upload.status === "unsupported" ? undefined : `upload-${upload.id}`,
      })),
    },
  });
}

export function buildTokenInventory(
  tokens: DesignTokens,
  sourceContractVersion: number,
  sourceEvidenceIds: string[] = []
): TokenInventory {
  const inventory: TokenInventory["tokens"] = [];
  for (const color of tokens.colors) {
    inventory.push({
      semanticName: color.cssVar,
      value: color.value,
      usage: [color.role, color.forbidden ? `Never: ${color.forbidden}` : ""]
        .filter(Boolean)
        .join(" "),
      category: "color",
      sourceEvidenceIds,
      editable: true,
    });
  }
  for (const font of tokens.fonts) {
    inventory.push({
      semanticName: font.cssVar,
      value: font.family,
      usage: `${font.role}; weights ${font.weights.join(", ")}`,
      category: "typography",
      sourceEvidenceIds,
      editable: true,
    });
  }
  for (const type of tokens.typeScale) {
    inventory.push({
      semanticName: type.cssVar,
      value: `${type.sizePx}px`,
      usage: `${type.role}; line-height ${type.lineHeight}${
        type.trackingEm === undefined ? "" : `; tracking ${type.trackingEm}em`
      }`,
      category: "typography",
      sourceEvidenceIds,
      editable: true,
    });
  }
  for (const [name, value] of Object.entries(tokens.spacing)) {
    inventory.push({
      semanticName: `--space-${slug(name)}`,
      value,
      usage: "Shared spacing scale",
      category: "spacing",
      sourceEvidenceIds,
      editable: true,
    });
  }
  for (const [name, value] of Object.entries(tokens.radii)) {
    inventory.push({
      semanticName: `--radius-${slug(name)}`,
      value,
      usage: `${name} corner treatment`,
      category: "radius",
      sourceEvidenceIds,
      editable: true,
    });
  }
  for (const [name, value] of Object.entries(tokens.borders)) {
    inventory.push({
      semanticName: `--border-${slug(name)}`,
      value,
      usage: `${name} approved border treatment`,
      category: "border",
      sourceEvidenceIds,
      editable: true,
    });
  }
  for (const [name, value] of Object.entries(tokens.shadows)) {
    inventory.push({
      semanticName: `--shadow-${slug(name)}`,
      value,
      usage: `${name} approved depth treatment`,
      category: "shadow",
      sourceEvidenceIds,
      editable: true,
    });
  }
  for (const [name, value] of Object.entries(tokens.layers)) {
    inventory.push({
      semanticName: `--layer-${slug(name)}`,
      value,
      usage: `${name} stacking layer`,
      category: "layer",
      sourceEvidenceIds,
      editable: true,
    });
  }
  inventory.push(
    {
      semanticName: "--layout-max-width",
      value: `${tokens.layout.maxWidthPx}px`,
      usage: "Maximum content width",
      category: "breakpoint",
      sourceEvidenceIds,
      editable: true,
    },
    {
      semanticName: "--layout-section-gap",
      value: `${tokens.layout.sectionGapPx}px`,
      usage: "Vertical section rhythm",
      category: "spacing",
      sourceEvidenceIds,
      editable: true,
    },
    {
      semanticName: "--layout-card-padding",
      value: `${tokens.layout.cardPaddingPx}px`,
      usage: "Shared card inset",
      category: "spacing",
      sourceEvidenceIds,
      editable: true,
    },
    {
      semanticName: "--motion-ease",
      value: tokens.motion.easing,
      usage: "Shared easing curve",
      category: "motion",
      sourceEvidenceIds,
      editable: true,
    },
    {
      semanticName: "--motion-duration-micro",
      value: `${tokens.motion.durationMs.micro}ms`,
      usage: "Hover and focus feedback",
      category: "motion",
      sourceEvidenceIds,
      editable: true,
    },
    {
      semanticName: "--motion-duration-reveal",
      value: `${tokens.motion.durationMs.reveal}ms`,
      usage: `Reveal effects: ${tokens.motion.revealClasses.join(", ")}`,
      category: "motion",
      sourceEvidenceIds,
      editable: true,
    }
  );
  for (const component of tokens.componentStates) {
    for (const [state, value] of Object.entries(component.states)) {
      inventory.push({
        semanticName: `--state-${slug(component.component)}-${slug(state)}`,
        value,
        usage: `${component.component} ${state}`,
        category: "component-state",
        sourceEvidenceIds,
        editable: false,
      });
    }
  }
  return TokenInventorySchema.parse({ sourceContractVersion, tokens: inventory });
}

/** An approved inventory may change values only. Its semantic names,
 * categories, usage, editability and evidence lineage are fixed by the
 * approved contract so a revision cannot smuggle in or drop runtime tokens. */
export function assertCanonicalTokenInventory(
  source: DesignTokens,
  inventory: TokenInventory,
  expectedEvidenceIds: string[] = inventory.tokens[0]?.sourceEvidenceIds ?? []
): void {
  const canonical = buildTokenInventory(
    source,
    inventory.sourceContractVersion,
    expectedEvidenceIds
  );
  if (inventory.tokens.length !== canonical.tokens.length) {
    throw new Error("approved token inventory must contain the complete canonical token set");
  }
  const actual = new Map(inventory.tokens.map((token) => [token.semanticName, token]));
  for (const expected of canonical.tokens) {
    const token = actual.get(expected.semanticName);
    if (!token) {
      throw new Error(`approved token inventory is missing ${expected.semanticName}`);
    }
    for (const field of ["category", "usage", "editable"] as const) {
      if (token[field] !== expected[field]) {
        throw new Error(`${expected.semanticName} may change only its value`);
      }
    }
    if (JSON.stringify(token.sourceEvidenceIds) !== JSON.stringify(expectedEvidenceIds)) {
      throw new Error(`${expected.semanticName} evidence lineage does not match the approved contract`);
    }
    if (!expected.editable && token.value !== expected.value) {
      throw new Error(`${expected.semanticName} is not editable`);
    }
  }
}

export function buildTailwindPlan(
  inventory: TokenInventory,
  sourceTokenInventoryVersion: number
): TailwindPlan {
  const tailwindName = (token: TokenInventory["tokens"][number]): string | undefined => {
    const name = token.semanticName.startsWith("--")
      ? token.semanticName
      : `--${token.semanticName}`;
    if (name.startsWith("--font-") || name.startsWith("--text-")) return name;
    if (name.startsWith("--color-") || name.startsWith("--radius-") || name.startsWith("--shadow-")) return name;
    if (name.startsWith("--space-")) return name.replace("--space-", "--spacing-");
    if (name === "--layout-max-width") return "--container-content";
    if (name.startsWith("--layout-")) return name.replace("--layout-", "--spacing-");
    if (name === "--motion-ease") return "--ease-standard";
    return undefined;
  };
  const mapped = inventory.tokens.flatMap((token) => {
    const name = tailwindName(token);
    return name ? [{
      cssVariable: cssVariable(token.semanticName),
      tailwindName: name,
      rationale: `${token.usage}; mapped from the approved semantic ${token.category} token.`,
    }] : [];
  });
  const runtimeOnlyVariables = inventory.tokens.flatMap((token) =>
    tailwindName(token) ? [] : [{
      cssVariable: cssVariable(token.semanticName),
      rationale: `${token.usage}; retained as a runtime CSS variable because Tailwind v4 has no value-compatible utility namespace.`,
    }]
  );
  return TailwindPlanSchema.parse({
    sourceTokenInventoryVersion,
    themeMappings: mapped,
    runtimeOnlyVariables,
    componentVariants: ["hover", "focus-visible", "disabled"],
    responsiveRules: [
      "Mobile-first base styles",
      "Tablet changes are content-driven, not device-specific",
      "Desktop respects the approved maximum-width token",
    ],
  });
}

export function assertTailwindPlanMatchesInventory(
  inventory: TokenInventory,
  plan: TailwindPlan
): void {
  const canonical = buildTailwindPlan(
    inventory,
    plan.sourceTokenInventoryVersion
  );
  const pair = (mapping: TailwindPlan["themeMappings"][number]) =>
    `${mapping.cssVariable}\u0000${mapping.tailwindName}`;
  const expected = canonical.themeMappings.map(pair);
  const actual = plan.themeMappings.map(pair);
  if (
    expected.length !== actual.length ||
    new Set(actual).size !== actual.length ||
    expected.some((mapping) => !actual.includes(mapping)) ||
    plan.themeMappings.some(
      ({ cssVariable, tailwindName }) =>
        !/^--[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(cssVariable) ||
        !/^--[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(tailwindName)
    ) ||
    JSON.stringify(plan.runtimeOnlyVariables) !== JSON.stringify(canonical.runtimeOnlyVariables)
  ) {
    throw new Error(
      "Tailwind theme mappings must use every canonical variable/name pair exactly once"
    );
  }
}

export function tailwindComponentUtilityClasses(plan: TailwindPlan): string[] {
  const prefixes: Array<[string, string]> = [
    ["--font-", "font-"],
    ["--text-", "text-"],
    ["--radius-", "rounded-"],
    ["--shadow-", "shadow-"],
    ["--ease-", "ease-"],
    ["--container-", "max-w-"],
  ];
  const selected: string[] = [];
  for (const [themePrefix, utilityPrefix] of prefixes) {
    const mapping = plan.themeMappings.find(({ tailwindName }) =>
      tailwindName.startsWith(themePrefix)
    );
    if (mapping) selected.push(`${utilityPrefix}${mapping.tailwindName.slice(themePrefix.length)}`);
  }
  return selected;
}

export function buildCssArchitecture(
  inventory: TokenInventory,
  plan: TailwindPlan,
  sourceTailwindPlanVersion: number
): CssArchitecture {
  return CssArchitectureSchema.parse({
    sourceTailwindPlanVersion,
    cssVariableHierarchy: [
      "DESIGN.md values",
      "--ds-* source variables",
      "Tailwind v4 @theme inline mappings",
      "component utilities and scoped authored CSS",
    ],
    tokenToComponentUsage: Object.fromEntries(
      inventory.tokens.map((token) => [
        token.semanticName,
        token.usage
          .split(/[,;]/)
          .map((value) => value.trim())
          .filter(Boolean),
      ])
    ),
    styleScopes: {
      global: ["source design tokens", "Tailwind v4 theme mapping", "base accessibility"],
      page: ["page composition and responsive layout"],
      component: ["component states and deliberate variants"],
    },
    generatedCssPath: "site/tailwind-utilities.css",
    justifiedExceptions: [],
  });
}

export function buildVisualQa(
  sourceCssArchitectureVersion: number,
  buildSha256 = "0".repeat(64)
): VisualQa {
  return VisualQaSchema.parse({
    sourceCssArchitectureVersion,
    buildSha256,
    checks: [
      "desktop",
      "tablet",
      "mobile",
      "hover",
      "focus",
      "color-scheme",
      "reduced-motion",
    ].map((area) => ({
      area,
      status: "pending",
      ...(["desktop", "tablet", "mobile"].includes(area)
        ? { evidencePath: `evidence/qa/pending-${area}.png` }
        : {}),
    })),
  });
}

/** Exercise the static build at the three required widths plus interaction,
 * color-scheme, and reduced-motion states. Screenshots are run-relative paths
 * so the evidence record stays portable between the two Macs. */
const QA_TARGET_SELECTOR =
  ".hero__cta:visible, main .btn:visible, .nav__cta:visible";

async function boundedVisibleQaTarget(page: Page) {
  const target = page.locator(QA_TARGET_SELECTOR).first();
  try {
    await target.waitFor({ state: "visible", timeout: 2_000 });
    await target.scrollIntoViewIfNeeded({ timeout: 2_000 });
    return target;
  } catch {
    return null;
  }
}

async function runThreeWidthVisualQaUnlocked(
  siteDirectory: string,
  sourceCssArchitectureVersion: number,
  visualQaVersion: number,
  output?: { directory: string; evidenceBasePath: string }
): Promise<VisualQa> {
  const qaDirectory = output?.directory ?? path.join(
    path.dirname(siteDirectory), "evidence", "qa", `v${visualQaVersion}`
  );
  const evidenceBasePath = output?.evidenceBasePath ??
    path.relative(path.dirname(siteDirectory), qaDirectory).split(path.sep).join("/");
  await fs.mkdir(qaDirectory, { recursive: true });
  const url = `file://${path.join(siteDirectory, "index.html")}`;
  const buildSha256 = await computeSiteBuildSha256(siteDirectory);
  const browser = await chromium.launch();
  const checks: VisualQa["checks"] = [];
  try {
    for (const viewport of [
      { area: "desktop" as const, width: 1440, height: 1000 },
      { area: "tablet" as const, width: 768, height: 1024 },
      { area: "mobile" as const, width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "load" });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      const screenshot = path.join(qaDirectory, `${viewport.area}-${viewport.width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      checks.push({
        area: viewport.area,
        status: overflow ? "fail" : "pass",
        notes: overflow ? "Horizontal overflow detected." : `Rendered at ${viewport.width}px without horizontal overflow.`,
        evidencePath: path.posix.join(
          evidenceBasePath,
          path.basename(screenshot)
        ),
      });
      await context.close();
    }

    const interactionContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const interactionPage = await interactionContext.newPage();
    await interactionPage.goto(url, { waitUntil: "load" });
    const visibleTarget = await boundedVisibleQaTarget(interactionPage);
    let hoverPassed = false;
    let focusPassed = false;
    try {
      if (!visibleTarget) throw new Error("visible QA target missing");
      const visualState = () => visibleTarget.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          transform: style.transform,
          boxShadow: style.boxShadow,
        };
      });
      const beforeHover = await visualState();
      await visibleTarget.hover({ timeout: 2_000 });
      await interactionPage.waitForTimeout(250);
      const afterHover = await visualState();
      hoverPassed = JSON.stringify(beforeHover) !== JSON.stringify(afterHover);

      await visibleTarget.focus({ timeout: 2_000 });
      focusPassed = await visibleTarget.evaluate((element) => {
        const style = getComputedStyle(element);
        const outlineVisible =
          element.matches(":focus-visible") &&
          style.outlineStyle !== "none" &&
          Number.parseFloat(style.outlineWidth) > 0;
        return document.activeElement === element &&
          (outlineVisible || (style.boxShadow !== "none" && style.boxShadow.length > 0));
      });
    } catch {
      // A missing/offscreen target is a bounded QA failure, never an unbounded
      // browser wait that prevents the workflow from reaching review.
    }
    checks.push({ area: "hover", status: hoverPassed ? "pass" : "fail", notes: hoverPassed ? "A visible primary CTA exposes a computed hover-state delta." : "No bounded visible CTA hover-state delta was detected." });
    checks.push({ area: "focus", status: focusPassed ? "pass" : "fail", notes: focusPassed ? "A visible primary CTA accepts focus and exposes a focus-visible indicator." : "A visible primary CTA or its focus-visible indicator was missing." });
    await interactionContext.close();

    const darkContext = await browser.newContext({ colorScheme: "dark" });
    const darkPage = await darkContext.newPage();
    await darkPage.goto(url, { waitUntil: "load" });
    const darkTarget = await boundedVisibleQaTarget(darkPage);
    let darkContrast = Number.NaN;
    try {
      if (!darkTarget) throw new Error("visible QA target missing");
      darkContrast = await darkTarget.evaluate((element) => {
        type Rgba = [number, number, number, number];
        const rgba = (value: string): Rgba | null => {
          const values = value.match(/[\d.]+/g)?.map(Number) ?? [];
          if (values.length < 3 || values.some((channel) => !Number.isFinite(channel))) {
            return null;
          }
          return [values[0], values[1], values[2], values[3] ?? 1];
        };
        const over = (foreground: Rgba, background: Rgba): Rgba => {
          const alpha = foreground[3] + background[3] * (1 - foreground[3]);
          if (alpha === 0) return [0, 0, 0, 0];
          return [
            (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
            (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
            (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
            alpha,
          ];
        };
        const ancestors: Element[] = [];
        for (let current: Element | null = element; current; current = current.parentElement) {
          ancestors.unshift(current);
        }
        let background: Rgba = [255, 255, 255, 1];
        for (const ancestor of ancestors) {
          const candidate = rgba(getComputedStyle(ancestor).backgroundColor);
          if (candidate) background = over(candidate, background);
        }
        const foreground = rgba(getComputedStyle(element).color);
        if (!foreground) return Number.NaN;
        const effectiveForeground = over(foreground, background);
        const luminance = (color: Rgba) => {
          const linear = color.slice(0, 3).map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        };
        const foregroundLuminance = luminance(effectiveForeground);
        const backgroundLuminance = luminance(background);
        return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
          (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
      });
    } catch {
      // Missing or unreadable targets are explicit failures, not fatal QA errors.
    }
    checks.push({ area: "color-scheme", status: darkContrast >= 4.5 ? "pass" : "fail", notes: darkContrast >= 4.5 ? `A visible primary surface retains ${darkContrast.toFixed(2)}:1 contrast under dark preference.` : `Primary surface contrast under dark preference is ${Number.isFinite(darkContrast) ? darkContrast.toFixed(2) : "unreadable"}:1.` });
    await darkContext.close();

    const reducedContext = await browser.newContext({ reducedMotion: "reduce" });
    const reducedPage = await reducedContext.newPage();
    await reducedPage.goto(url, { waitUntil: "load" });
    const maxMotionSeconds = await reducedPage.locator("body *").evaluateAll((elements) =>
      elements.reduce((maximum, element) => {
        const style = getComputedStyle(element);
        const durations = `${style.animationDuration},${style.transitionDuration}`
          .split(",")
          .map((part) => {
            const value = Number.parseFloat(part);
            return part.trim().endsWith("ms") ? value / 1000 : value;
          })
          .filter(Number.isFinite);
        return Math.max(maximum, ...durations, 0);
      }, 0)
    );
    checks.push({ area: "reduced-motion", status: maxMotionSeconds <= 0.01 ? "pass" : "fail", notes: maxMotionSeconds <= 0.01 ? "Animations and transitions are bounded to 10ms under reduced-motion." : `Reduced-motion leaves a ${maxMotionSeconds.toFixed(3)}s duration.` });
    await reducedContext.close();
  } finally {
    await browser.close();
  }
  return VisualQaSchema.parse({ sourceCssArchitectureVersion, buildSha256, checks });
}

/** Writes QA screenshots only to a caller-owned staging directory. The caller
 * must already hold the run's site-authority lock and transactionally promote
 * the returned artifact's evidence paths. */
export function stageThreeWidthVisualQa(
  siteDirectory: string,
  sourceCssArchitectureVersion: number,
  visualQaVersion: number,
  stagingDirectory: string,
  finalEvidenceBasePath: string
): Promise<VisualQa> {
  return runThreeWidthVisualQaUnlocked(
    siteDirectory,
    sourceCssArchitectureVersion,
    visualQaVersion,
    { directory: stagingDirectory, evidenceBasePath: finalEvidenceBasePath }
  );
}

/** QA generation shares the exact authority lock used by all editor writes.
 * The pre-capture build hash and every browser observation therefore describe
 * one stable site generation. Approval later reacquires this same lock before
 * comparing the hash and transitioning workflow state. */
export function runThreeWidthVisualQa(
  runId: string,
  siteDirectory: string,
  sourceCssArchitectureVersion: number,
  visualQaVersion = 1
): Promise<VisualQa> {
  if (!Number.isInteger(visualQaVersion) || visualQaVersion < 1) {
    throw new Error("visual QA version must be a positive integer");
  }
  return withSiteAuthorityLock(runId, () =>
    runThreeWidthVisualQaUnlocked(
      siteDirectory,
      sourceCssArchitectureVersion,
      visualQaVersion
    )
  );
}

export async function computeSiteBuildSha256(
  siteDirectory: string
): Promise<string> {
  const files: Array<{ path: string; sizeBytes: number; sha256: string }> = [];
  async function visit(directory: string): Promise<void> {
    const entries = (await fs.readdir(directory, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name)
    );
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path
        .relative(siteDirectory, absolute)
        .split(path.sep)
        .join("/");
      if (
        directory === siteDirectory &&
        entry.name === LIVE_BUNDLE_METADATA_DIR
      ) {
        if (!entry.isDirectory()) {
          throw new Error("live bundle metadata must be a directory");
        }
        continue;
      }
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        const bytes = await fs.readFile(absolute);
        files.push({
          path: relative,
          sizeBytes: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      } else throw new Error(`live site path is not regular: ${relative}`);
    }
  }
  await visit(siteDirectory);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return candidateBuildSha256(files);
}

/**
 * A font family is the one token value that can legitimately carry an
 * apostrophe — "Suisse Int'l", "Bower's Sans". Emitted raw into a declaration,
 * that apostrophe opens a CSS string which never closes, and PostCSS fails the
 * ENTIRE stylesheet with "Unterminated string" rather than just that line.
 * Observed live on run PKcE4L_4j7Z1, which killed the build stage outright.
 *
 * Double quotes, not single, so an internal apostrophe stays literal. Family
 * tokens are `--font-*` under the typography category; sizes are `--text-*`
 * and carry units, so they must stay unquoted.
 */
function themeTokenValue(
  token: TokenInventory["tokens"][number],
  defined: ReadonlySet<string>
): string {
  const isFontFamily =
    token.category === "typography" && token.semanticName.startsWith("--font-");
  if (!isFontFamily) return normalizeVarReferences(token.value, defined);
  const trimmed = token.value.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return token.value;
  return `"${trimmed}"`;
}

/**
 * Component-state values arrive from the model as raw declaration strings and
 * routinely reference a token in camelCase — var(--color-primaryContrast) —
 * while every variable the pipeline defines is kebab-case
 * (--color-primary-contrast). The reference resolves to nothing, the browser
 * drops the declaration, and the token-drift gate fails the build with
 * "referenced by the stylesheets but defined nowhere". Observed on runs
 * PKcE4L_4j7Z1 and mPHVbkER-Qu8.
 *
 * Rewrite ONLY when the written name is undefined AND its kebab-case form is a
 * real variable, so a genuinely unknown reference still surfaces as drift
 * rather than being silently renamed into something that happens to exist.
 */
function normalizeVarReferences(
  value: string,
  defined: ReadonlySet<string>
): string {
  return value.replace(/var\(\s*(--[A-Za-z0-9_-]+)/g, (match, name: string) => {
    if (defined.has(name)) return match;
    const kebab = `--${slug(
      name.replace(/^--/, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    )}`;
    return defined.has(kebab) ? match.replace(name, kebab) : match;
  });
}

export function renderTailwindThemeCss(
  inventory: TokenInventory,
  plan: TailwindPlan
): string {
  assertTailwindPlanMatchesInventory(inventory, plan);
  // Both namespaces count as defined: the `--ds-*` source variables emitted
  // below, and the Tailwind-facing names the @theme block exposes — a state
  // declaration may legitimately reference either.
  const definedNames = new Set([
    ...inventory.tokens.map((token) => cssVariable(token.semanticName)),
    ...plan.themeMappings.map((mapping) => mapping.tailwindName),
  ]);
  const values = new Map(
    inventory.tokens.map((token) => [
      cssVariable(token.semanticName),
      themeTokenValue(token, definedNames),
    ])
  );
  const sourceLines = [...values].map(([name, value]) => `  ${name}: ${value};`);
  const themeLines = plan.themeMappings.map(
    (mapping) => `  ${mapping.tailwindName}: var(${mapping.cssVariable});`
  );
  return [
    ":root {",
    ...sourceLines,
    "}",
    "",
    "@theme inline {",
    ...themeLines,
    "}",
    "",
  ].join("\n");
}

export function applyApprovedTokenInventory(
  source: DesignTokens,
  inventory: TokenInventory,
  expectedEvidenceIds?: string[]
): DesignTokens {
  assertCanonicalTokenInventory(source, inventory, expectedEvidenceIds);
  const values = new Map(
    inventory.tokens.map((token) => [token.semanticName, token.value])
  );
  const requiredValue = (name: string): string => {
    const value = values.get(name);
    if (value === undefined) throw new Error(`approved token inventory is missing ${name}`);
    return value;
  };
  const numberValue = (name: string) => {
    const parsed = Number.parseFloat(requiredValue(name));
    if (!Number.isFinite(parsed)) throw new Error(`${name} must contain a finite numeric value`);
    return parsed;
  };
  return {
    ...source,
    colors: source.colors.map((token) => ({
      ...token,
      value: requiredValue(token.cssVar),
    })),
    fonts: source.fonts.map((token) => ({
      ...token,
      family: requiredValue(token.cssVar),
    })),
    typeScale: source.typeScale.map((token) => ({
      ...token,
      sizePx: numberValue(token.cssVar),
    })),
    spacing: Object.fromEntries(
      Object.keys(source.spacing).map((name) => [
        name,
        requiredValue(`--space-${slug(name)}`),
      ])
    ),
    radii: Object.fromEntries(
      Object.keys(source.radii).map((name) => [
        name,
        requiredValue(`--radius-${slug(name)}`),
      ])
    ),
    borders: Object.fromEntries(
      Object.keys(source.borders).map((name) => [
        name,
        requiredValue(`--border-${slug(name)}`),
      ])
    ),
    shadows: Object.fromEntries(
      Object.keys(source.shadows).map((name) => [
        name,
        requiredValue(`--shadow-${slug(name)}`),
      ])
    ),
    layers: Object.fromEntries(
      Object.keys(source.layers).map((name) => [
        name,
        requiredValue(`--layer-${slug(name)}`),
      ])
    ),
    layout: {
      maxWidthPx: numberValue("--layout-max-width"),
      sectionGapPx: numberValue("--layout-section-gap"),
      cardPaddingPx: numberValue("--layout-card-padding"),
    },
    motion: {
      ...source.motion,
      easing: requiredValue("--motion-ease"),
      durationMs: {
        micro: numberValue("--motion-duration-micro"),
        reveal: numberValue("--motion-duration-reveal"),
      },
    },
  };
}

export interface DesignContractVerification {
  lint: { errors: number; warnings: number; infos: number };
  exportedCssPath: string;
}

/**
 * Verify the generated contract with the exact pinned design.md CLI and save
 * its Tailwind v4 export. The CLI is invoked as argv (never through a shell),
 * so a run path cannot become executable input.
 */
export async function verifyAndExportDesignContract(
  contractPath: string,
  exportedCssPath: string
): Promise<DesignContractVerification> {
  const cliArgs = ["--yes", "-p", "@google/design.md@0.3.0", "design.md"];
  const lintResult = await execFileAsync(
    "npx",
    [...cliArgs, "lint", "--format", "json", contractPath],
    { maxBuffer: 1024 * 1024 }
  );
  const parsed = JSON.parse(lintResult.stdout) as {
    summary?: { errors?: number; warnings?: number; infos?: number };
    findings?: Array<{ severity?: string; path?: string; message?: string }>;
  };
  const lint = {
    errors: parsed.summary?.errors ?? 0,
    warnings: parsed.summary?.warnings ?? 0,
    infos: parsed.summary?.infos ?? 0,
  };
  if (lint.errors > 0 || lint.warnings > 0) {
    const details = (parsed.findings ?? [])
      .filter((finding) => finding.severity === "error" || finding.severity === "warning")
      .map((finding) => `${finding.path ? `${finding.path}: ` : ""}${finding.message ?? "lint finding"}`)
      .join(" | ");
    throw new Error(
      `DESIGN.md lint failed: ${lint.errors} error(s), ${lint.warnings} warning(s)${details ? ` — ${details}` : ""}`
    );
  }

  const exportResult = await execFileAsync(
    "npx",
    [...cliArgs, "export", contractPath, "--format", "css-tailwind"],
    { maxBuffer: 1024 * 1024 }
  );
  await fs.mkdir(path.dirname(exportedCssPath), { recursive: true });
  await fs.writeFile(exportedCssPath, exportResult.stdout, "utf8");
  return { lint, exportedCssPath };
}

export async function materializeDesignContractArtifacts(
  intake: Intake,
  tokens: DesignTokens,
  lock: ReferenceLock
): Promise<{
  contractBytes: Uint8Array;
  exportBytes: Uint8Array;
  contractSha256: string;
  exportSha256: string;
}> {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-contract-"));
  const contractPath = path.join(temporary, "DESIGN.md");
  const exportPath = path.join(temporary, "tailwind.css");
  try {
    await fs.writeFile(contractPath, renderDesignContract(intake, tokens, lock), "utf8");
    await verifyAndExportDesignContract(contractPath, exportPath);
    const [contractBytes, exportBytes] = await Promise.all([
      fs.readFile(contractPath),
      fs.readFile(exportPath),
    ]);
    const digest = (bytes: Uint8Array) =>
      createHash("sha256").update(bytes).digest("hex");
    return {
      contractBytes,
      exportBytes,
      contractSha256: digest(contractBytes),
      exportSha256: digest(exportBytes),
    };
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

export function renderDesignContract(
  intake: Intake,
  tokens: DesignTokens,
  lock: ReferenceLock
): string {
  const usedColors = new Set<string>();
  const colorEntries = tokens.colors.map((color) => ({
    key: uniqueKey(color.cssVar.replace(/^--color-/, ""), usedColors),
    value: color.value,
    role: color.role,
    forbidden: color.forbidden,
  }));
  const primaryIndex = Math.max(
    0,
    colorEntries.findIndex((entry) => entry.key === "primary")
  );
  if (colorEntries.length > 0 && primaryIndex !== 0) {
    [colorEntries[0], colorEntries[primaryIndex]] = [
      colorEntries[primaryIndex],
      colorEntries[0],
    ];
  }
  if (colorEntries[0] && colorEntries[0].key !== "primary") {
    colorEntries[0].key = "primary";
  }
  const font = tokens.fonts[0];
  const usedType = new Set<string>();
  const typography = tokens.typeScale.map((type) => ({
    key: uniqueKey(type.role, usedType),
    fontFamily: font?.family ?? "system-ui",
    fontSize: `${type.sizePx}px`,
    fontWeight: font?.weights.at(-1) ?? 400,
    lineHeight: type.lineHeight,
    letterSpacing:
      type.trackingEm === undefined ? undefined : `${type.trackingEm}em`,
  }));
  const usedRadius = new Set<string>();
  const usedSpacing = new Set<string>();
  const bodyType = typography.find((type) => type.key.includes("body")) ?? typography[0];
  const primary = colorEntries[0];
  const neutral =
    colorEntries.find((color) => /background|surface|canvas/i.test(color.role)) ??
    colorEntries[1] ??
    primary;
  const primaryContrast =
    colorEntries.find((color) => color.key === "primary-contrast") ?? neutral;

  const lines = [
    "---",
    "version: alpha",
    `name: ${yamlString(`${intake.businessName} Design System`)}`,
    `description: ${yamlString(`Evidence-derived design contract for the ${intake.projectTarget} target.`)}`,
    "colors:",
    ...colorEntries.map((color) => `  ${color.key}: ${yamlString(color.value)}`),
    "typography:",
    ...typography.flatMap((type) => [
      `  ${type.key}:`,
      `    fontFamily: ${yamlString(type.fontFamily)}`,
      `    fontSize: ${type.fontSize}`,
      `    fontWeight: ${type.fontWeight}`,
      `    lineHeight: ${type.lineHeight}`,
      ...(type.letterSpacing ? [`    letterSpacing: ${type.letterSpacing}`] : []),
    ]),
    "rounded:",
    ...Object.entries(tokens.radii).map(
      ([name, value]) => `  ${uniqueKey(name, usedRadius)}: ${value}`
    ),
    "spacing:",
    ...Object.entries(tokens.spacing).map(
      ([name, value]) => `  ${uniqueKey(name, usedSpacing)}: ${value}`
    ),
    "borders:",
    ...Object.entries(tokens.borders).map(
      ([name, value]) => `  ${slug(name)}: ${yamlString(value)}`
    ),
    "shadows:",
    ...Object.entries(tokens.shadows).map(
      ([name, value]) => `  ${slug(name)}: ${yamlString(value)}`
    ),
    "layers:",
    ...Object.entries(tokens.layers).map(
      ([name, value]) => `  ${slug(name)}: ${yamlString(value)}`
    ),
    "components:",
    "  button-primary:",
    `    backgroundColor: ${yamlString(`{colors.${primary?.key ?? "primary"}}`)}`,
    `    textColor: ${yamlString(`{colors.${primaryContrast?.key ?? primary?.key ?? "primary"}}`)}`,
    ...(bodyType
      ? [`    typography: ${yamlString(`{typography.${bodyType.key}}`)}`]
      : []),
    ...(Object.keys(tokens.radii).length > 0
      ? [`    rounded: ${yamlString(`{rounded.${slug(Object.keys(tokens.radii)[0])}}`)}`]
      : []),
    ...colorEntries.flatMap((color) => [
      `  token-color-${color.key}:`,
      `    backgroundColor: ${yamlString(`{colors.${color.key}}`)}`,
    ]),
    "---",
    "",
    "## Overview",
    "",
    `This ${intake.projectTarget} contract is derived from the approved reference lock **${lock.primary.name}**. ${lock.primary.why}`,
    "",
    "Source evidence and implementation decisions remain separate: references teach reusable hierarchy, structure, rhythm, and interaction patterns; they are not copied as a finished site.",
    "",
    "## Colors",
    "",
    ...colorEntries.map(
      (color) =>
        `- **${color.key} (${color.value}):** ${color.role}${color.forbidden ? ` Never use for ${color.forbidden}.` : ""}`
    ),
    "",
    "## Typography",
    "",
    ...tokens.fonts.map(
      (item) =>
        `- **${item.family}:** ${item.role} Weights ${item.weights.join(", ")}. Substitutes: ${item.substitutes.join(", ") || "system fallback"}.`
    ),
    "",
    "## Layout",
    "",
    `Content is capped at ${tokens.layout.maxWidthPx}px, with ${tokens.layout.sectionGapPx}px section rhythm and ${tokens.layout.cardPaddingPx}px card inset.`,
    "",
    "## Elevation & Depth",
    "",
    `Approved shadows: ${Object.entries(tokens.shadows)
      .map(([name, value]) => `${name} ${value}`)
      .join(", ") || "none"}.`,
    `Approved layers: ${Object.entries(tokens.layers)
      .map(([name, value]) => `${name} ${value}`)
      .join(", ") || "none"}.`,
    "",
    "## Shapes",
    "",
    `Approved radii: ${Object.entries(tokens.radii)
      .map(([name, value]) => `${name} ${value}`)
      .join(", ")}.`,
    `Approved borders: ${Object.entries(tokens.borders)
      .map(([name, value]) => `${name} ${value}`)
      .join(", ") || "none"}.`,
    "",
    "## Components",
    "",
    ...tokens.componentStates.map(
      (component) =>
        `- **${component.component}:** ${Object.entries(component.states)
          .map(([state, value]) => `${state} — ${value}`)
          .join("; ")}`
    ),
    "",
    "## Do's and Don'ts",
    "",
    "- Do preserve the approved semantic token roles, responsive behavior, focus visibility, and reduced-motion behavior.",
    "- Do trace shared style changes back to this contract and its approved evidence.",
    "- Don't copy a Refero example, blend competitors into the visual identity, or add raw values without a documented exception.",
    "- Don't use motion or decoration to compensate for weak hierarchy.",
    "",
  ];
  return lines.join("\n");
}
