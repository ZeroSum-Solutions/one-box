/**
 * Renders the FROZEN templates/local-service/ skeleton into a static site
 * under sites/<runId>/site/. Parameterizes tokens + copy + skeleton — never
 * invents structure (audit B6). See WAVE-NOTES-buildgate.md for the full
 * field contract (CSS var naming, CopyDoc key convention, deviations).
 *
 * Path resolution is self-contained (no import from ./runstate): that
 * module is owned by a different wave and did not exist yet at the time
 * this file was written, and buildSite must work standalone for
 * scripts/smoke/gates-smoke.mjs regardless of build order across waves.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { compile } from "tailwindcss";
import { collectDefinedCssVars, findUnresolvedCssVarRefs } from "./cssVars";

const execFileAsync = promisify(execFile);
import {
  SITES_DIR,
  SITE_DIR,
  SiteManifestSchema,
  RunStateSchema,
  workflowArtifactApprovalState,
  type DesignTokens,
  type SkeletonSpec,
  type CopyDoc,
  type Intake,
  type SiteManifest,
} from "./contracts";

const TEMPLATE_DIR = path.join(process.cwd(), "templates", "local-service");
const RUN_ID_RE = /^[a-z0-9_-]{4,40}$/i;

// Sections the template always renders regardless of skeleton content (nav
// and footer are chrome, hero and contact carry the primary conversion
// path). Every other section id is gated by skeleton.sections.
const ALWAYS_ON_SECTIONS = ["nav", "hero", "contact", "footer"] as const;
const GATED_SECTIONS = ["trust-bar", "services", "why-us", "reviews", "service-area"] as const;
const KNOWN_SECTION_IDS = new Set<string>([...ALWAYS_ON_SECTIONS, ...GATED_SECTIONS]);

export interface BuildSiteInput {
  runId: string;
  intake: Intake; // source of "ONLY intake-provided facts" for JSON-LD + phone
  tokens: DesignTokens;
  skeleton: SkeletonSpec;
  copy: CopyDoc;
  assets: { heroImagePath?: string };
  /** Approved Tailwind v4 source artifact. The static site does not require a
   * Tailwind runtime; this file preserves the exact semantic theme mapping. */
  tailwindThemeCss?: string;
  /** Concrete utility candidates derived from the approved Tailwind plan and
   * attached to the generated primary CTA. */
  tailwindUtilityClasses?: string[];
}

export async function compileTailwindUtilities(
  themeCss: string,
  utilityClasses: string[]
): Promise<string> {
  const candidates = [...new Set(utilityClasses)];
  if (candidates.some((candidate) => !/^[a-z0-9][a-z0-9-]*$/.test(candidate))) {
    throw new Error("unsafe Tailwind utility candidate");
  }
  const compiler = await compile(`${themeCss}\n@tailwind utilities;`);
  return compiler.build(candidates);
}

export async function buildSite(input: BuildSiteInput): Promise<SiteManifest> {
  const runId = assertSafeRunId(input.runId);
  const runRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), SITES_DIR, runId);
  await assertBuildAuthorized(runRoot);
  const publishDir = path.join(/*turbopackIgnore: true*/ runRoot, SITE_DIR);
  // Build into a staging directory and swap it in at the end (ENG-005).
  // Writing into the live directory meant a rebuild dismantled the site that
  // was being served, and a build that failed halfway left it that way.
  const siteDir = `${publishDir}.building`;
  await rm(siteDir, { recursive: true, force: true }); // discard a crashed build's leftovers
  await mkdir(path.join(siteDir, "assets"), { recursive: true });

  // Stub first, so a crash between here and the swap leaves a staging
  // directory that is unmistakably incomplete rather than plausible.
  await writeManifest(siteDir, SiteManifestSchema.parse({
    entry: "index.html",
    files: [],
    assets: [],
    builtAt: new Date().toISOString(),
    complete: false,
  }));

  const enabledSections = resolveEnabledSections(input.skeleton);

  const tokensCss = await renderTokensCss(input.tokens);
  await writeFile(path.join(siteDir, "tokens.css"), tokensCss, "utf8");
  if (input.tailwindThemeCss) {
    await writeFile(
      path.join(siteDir, "tailwind-theme.css"),
      input.tailwindThemeCss,
      "utf8"
    );
    const utilities = await compileTailwindUtilities(
      input.tailwindThemeCss,
      input.tailwindUtilityClasses ?? []
    );
    await writeFile(
      path.join(siteDir, "tailwind-utilities.css"),
      utilities,
      "utf8"
    );
  }
  await copyFile(path.join(TEMPLATE_DIR, "site.css"), path.join(siteDir, "site.css"));
  await copyFile(path.join(TEMPLATE_DIR, "reveal.js"), path.join(siteDir, "reveal.js"));
  await copyFile(path.join(TEMPLATE_DIR, "motion-runtime.js"), path.join(siteDir, "motion-runtime.js"));
  await copyFile(path.join(process.cwd(), "node_modules", "gsap", "dist", "gsap.min.js"), path.join(siteDir, "gsap.min.js"));
  await copyFile(path.join(process.cwd(), "node_modules", "gsap", "dist", "ScrollTrigger.min.js"), path.join(siteDir, "ScrollTrigger.min.js"));
  await writeFile(path.join(siteDir, "motion.json"), '{"version":1,"entries":[]}\n', "utf8");
  await writeFile(path.join(siteDir, "motion-manifest.js"), 'window.__ONEBOX_MOTION_MANIFEST__={"version":1,"entries":[]};\n', "utf8");

  const assetEntries: SiteManifest["assets"] = [
    { path: "tokens.css", kind: "css", generatedBy: "builder:tokens" },
    { path: "site.css", kind: "css" },
    { path: "reveal.js", kind: "js" },
    { path: "gsap.min.js", kind: "js" },
    { path: "ScrollTrigger.min.js", kind: "js" },
    { path: "motion-runtime.js", kind: "js" },
    { path: "motion-manifest.js", kind: "js", generatedBy: "builder:motion-manifest" },
  ];
  const files = ["index.html", "tokens.css", "site.css", "reveal.js", "gsap.min.js", "ScrollTrigger.min.js", "motion-manifest.js", "motion-runtime.js", "motion.json"];
  if (input.tailwindThemeCss) {
    assetEntries.push({
      path: "tailwind-theme.css",
      kind: "css",
      generatedBy: "evidence-workflow:tailwind-v4-theme",
    });
    assetEntries.push({
      path: "tailwind-utilities.css",
      kind: "css",
      generatedBy: "evidence-workflow:tailwind-v4-compiler",
    });
    files.push("tailwind-theme.css", "tailwind-utilities.css");
  }

  const phone = resolvePhone(input.intake, input.copy);
  const heroMediaHtml = await renderHeroMedia({
    heroImagePath: input.assets.heroImagePath,
    siteDir,
    copy: input.copy,
    intake: input.intake,
    assetEntries,
    files,
  });

  const utilityClassText = (input.tailwindUtilityClasses ?? []).join(" ");
  const renderedHtml = renderHtml({
    template: await readFile(path.join(TEMPLATE_DIR, "index.html.tpl"), "utf8"),
    tokens: input.tokens,
    copy: input.copy,
    intake: input.intake,
    phone,
    enabledSections,
    heroMediaHtml,
  }).replace(
    'class="btn btn--primary hero__cta"',
    `class="btn btn--primary hero__cta${utilityClassText ? ` ${utilityClassText}` : ""}"`
  );
  const html = decorateTargetMarkup(input.intake.projectTarget, renderedHtml);
  await writeFile(
    path.join(siteDir, "index.html"),
    html.replace(
      "<html ",
      `<html data-project-target="${input.intake.projectTarget}" `
    ).replace(
      '<link rel="stylesheet" href="tokens.css" />',
      input.tailwindThemeCss
        ? '<link rel="stylesheet" href="tokens.css" />\n  <link rel="stylesheet" href="tailwind-theme.css" />\n  <link rel="stylesheet" href="tailwind-utilities.css" />'
        : '<link rel="stylesheet" href="tokens.css" />'
    ),
    "utf8"
  );

  const manifest = SiteManifestSchema.parse({
    entry: "index.html",
    files: files.map(assertSafeRelPath),
    assets: assetEntries.map((a) => ({ ...a, path: assertSafeRelPath(a.path) })),
    builtAt: new Date().toISOString(),
    complete: true,
  });
  await writeManifest(siteDir, manifest);
  await publishBuild(siteDir, publishDir);
  return manifest;
}

/**
 * Swaps the staged build over the live one.
 *
 * Two renames rather than one, because POSIX rename() refuses to replace a
 * non-empty directory. The live copy is moved aside first and only deleted
 * once the new one is in place; if the second rename fails, the old site is
 * put back. A build that fails must leave the previous site serving — that is
 * the entire reason the staging directory exists.
 */
export async function publishBuild(stagingDir: string, publishDir: string): Promise<void> {
  const retired = `${publishDir}.retired-${process.pid}`;
  const hadPrevious = await stat(publishDir).then(() => true).catch(() => false);
  if (hadPrevious) await rename(publishDir, retired);
  try {
    await rename(stagingDir, publishDir);
  } catch (error) {
    if (hadPrevious) await rename(retired, publishDir).catch(() => {});
    throw error;
  }
  if (hadPrevious) await rm(retired, { recursive: true, force: true });
}

export function decorateTargetMarkup(
  target: Intake["projectTarget"],
  html: string
): string {
  if (target === "website") return html;
  if (target === "web-app") {
    return html.replace(
      "<body>",
      '<body><aside class="app-sidebar" aria-label="Application navigation"><strong>Workspace</strong><a href="#main">Overview</a><a href="#services">Tasks</a><a href="#contact">Account</a></aside><div class="app-surface">'
    ).replace("</body>", "</div></body>");
  }
  return html
    .replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />'
    )
    .replace(
      "<body>",
      '<body><div class="ios-device-surface"><header class="ios-navigation" aria-label="iOS navigation"><span aria-hidden="true">‹</span><strong>Overview</strong><button type="button" aria-label="More options">•••</button></header>'
    )
    .replace(
      "</body>",
      '<nav class="ios-tab-bar" aria-label="App tabs"><a href="#main">Home</a><a href="#services">Services</a><a href="#contact">Contact</a></nav></div></body>'
    );
}

export async function assertBuildAuthorized(runRoot: string): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(path.join(runRoot, "run.json"), "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return; // standalone builder fixture, not a durable pipeline run
    }
    throw error;
  }
  const run = RunStateSchema.parse(JSON.parse(raw));
  if (run.pipelineVersion === "legacy-v1") return;
  const approvedCss = run.evidenceWorkflow.artifacts.some(
    (artifact) =>
      artifact.artifactType === "css-architecture" &&
      workflowArtifactApprovalState(artifact) === "approved"
  );
  if (run.evidenceWorkflow.currentStage !== "build" || !approvedCss) {
    throw new Error(
      "evidence-gated-v2 build blocked: approve evidence, contract, tokens, Tailwind, and CSS architecture first"
    );
  }
}

// ---------- manifest ----------

async function writeManifest(siteDir: string, manifest: SiteManifest): Promise<void> {
  const target = path.join(siteDir, "manifest.json");
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(manifest, null, 2), "utf8");
  await rename(tmp, target);
}

// ---------- section gating ----------

function resolveEnabledSections(skeleton: SkeletonSpec): Set<string> {
  const enabled = new Set<string>(ALWAYS_ON_SECTIONS);
  for (const section of skeleton.sections) {
    if (KNOWN_SECTION_IDS.has(section.id)) enabled.add(section.id);
  }
  return enabled;
}

/**
 * Strips <!-- SECTION:id -->/<!-- NAVLINK:id --> marker blocks per enabled
 * set. NAVLINK markers nest inside <!-- SECTION:nav -->, so they're
 * resolved in their own first pass — a single linear regex match can't see
 * inside an outer match's own capture group, so a combined one-pass regex
 * would consume the whole nav section (nested NAVLINK markers included) as
 * one opaque "inner" blob and never strip the disabled ones inside it.
 */
function stripMarkedBlocks(html: string, enabled: Set<string>): string {
  return stripOneKind(stripOneKind(html, "NAVLINK", enabled), "SECTION", enabled);
}

function stripOneKind(html: string, kind: "SECTION" | "NAVLINK", enabled: Set<string>): string {
  const re = new RegExp(`<!--\\s*${kind}:([\\w-]+)\\s*-->([\\s\\S]*?)<!--\\s*/${kind}:\\1\\s*-->`, "g");
  return html.replace(re, (_match, id: string, inner: string) => (enabled.has(id) ? inner : ""));
}

// ---------- tokens.css ----------

/**
 * Finds var() references inside the emitted token declarations that no
 * declaration defines.
 *
 * Most token values are literals, but borders and shadows are free-form model
 * output and legitimately reference other tokens — `--border-subtle: 1px solid
 * var(--color-border)`. When the referenced name is never emitted, the browser
 * treats the WHOLE declaration as invalid at computed-value time: the property
 * silently falls back to its initial value and the border simply disappears.
 * Nothing else catches this — token-drift inspects colour and font only — so it
 * ships looking fine (ENG-008: `var(--color-stone-grey)`, never defined).
 *
 * A reference carrying a fallback, `var(--x, 1px)`, still renders and is not
 * reported. The check is deliberately confined to this sheet, which
 * tokens.css.tpl documents as a self-contained flat value sheet; a token value
 * reaching into another stylesheet is itself a contract break.
 */
export function findDanglingTokenRefs(declarations: string[]): string[] {
  const sheet = declarations.join("\n");
  return findUnresolvedCssVarRefs(sheet, collectDefinedCssVars(sheet));
}

async function renderTokensCss(tokens: DesignTokens): Promise<string> {
  const template = await readFile(path.join(TEMPLATE_DIR, "tokens.css.tpl"), "utf8");
  const lines: string[] = [];

  for (const color of tokens.colors) {
    lines.push(`  ${normalizeCssVarName(color.cssVar)}: ${color.value};`);
  }
  lines.push(`  --color-primary-text: ${derivePrimaryText(tokens)};`);
  const onAlt = deriveOnSurfaceAlt(tokens);
  lines.push(`  --color-on-surface-alt: ${onAlt.strong};`);
  lines.push(`  --color-on-surface-alt-muted: ${onAlt.muted};`);
  for (const font of tokens.fonts) {
    lines.push(`  ${normalizeCssVarName(font.cssVar)}: ${fontFamilyValue(font.family)};`);
  }
  for (const scale of tokens.typeScale) {
    lines.push(`  ${normalizeCssVarName(scale.cssVar)}: ${pxToRem(scale.sizePx)};`);
  }
  for (const [key, value] of Object.entries(tokens.radii)) {
    lines.push(`  --radius-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(tokens.spacing)) {
    lines.push(`  --space-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(tokens.borders)) {
    lines.push(`  --border-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(tokens.shadows)) {
    lines.push(`  --shadow-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(tokens.layers)) {
    lines.push(`  --layer-${key}: ${value};`);
  }
  lines.push(`  --layout-max-width: ${tokens.layout.maxWidthPx}px;`);
  lines.push(`  --layout-section-gap: ${tokens.layout.sectionGapPx}px;`);
  lines.push(`  --layout-card-padding: ${tokens.layout.cardPaddingPx}px;`);
  lines.push(`  --motion-ease: ${tokens.motion.easing};`);
  lines.push(`  --motion-duration-micro: ${tokens.motion.durationMs.micro}ms;`);
  lines.push(`  --motion-duration-reveal: ${tokens.motion.durationMs.reveal}ms;`);

  const dangling = findDanglingTokenRefs(lines);
  if (dangling.length) {
    throw new Error(
      `tokens.css references undefined custom ${
        dangling.length === 1 ? "property" : "properties"
      }: ${dangling.join(", ")}. Every declaration using one would be dropped by the browser.`
    );
  }

  return template.replace("{{tokenDeclarations}}", lines.join("\n"));
}

function normalizeCssVarName(name: string): string {
  return name.startsWith("--") ? name : `--${name}`;
}

/**
 * The template uses --color-primary-text wherever the PRIMARY color renders
 * as text on light surfaces (eyebrows, stat values, ghost hover). A brand
 * primary picked for buttons is often too light for that (live axe failure:
 * amber on cream, 1.5:1) — so the derived var keeps the primary only when it
 * meets WCAG AA (4.5:1) against both bg and surface, else falls back to the
 * text color. Non-hex values (gradients) fall back conservatively.
 */
function derivePrimaryText(tokens: DesignTokens): string {
  const byVar = (v: string) => tokens.colors.find((c) => normalizeCssVarName(c.cssVar) === v)?.value;
  const primary = byVar("--color-primary");
  const text = byVar("--color-text") ?? "#111111";
  const bg = byVar("--color-bg");
  const surface = byVar("--color-surface") ?? bg;
  if (!primary || !bg) return text;
  const ok =
    (contrastRatio(primary, bg) ?? 0) >= 4.5 &&
    (contrastRatio(primary, surface ?? bg) ?? 0) >= 4.5;
  return ok ? primary : text;
}

/**
 * surface-alt is the one token a reference can legitimately make light OR
 * dark (a pale paper tone or a near-black band). The footer sits on it, so
 * its text colors are derived: pick whichever of text/bg reads against it,
 * and a muted companion that still clears AA.
 */
function deriveOnSurfaceAlt(tokens: DesignTokens): { strong: string; muted: string } {
  const byVar = (v: string) => tokens.colors.find((c) => normalizeCssVarName(c.cssVar) === v)?.value;
  const alt = byVar("--color-surface-alt");
  const text = byVar("--color-text") ?? "#111111";
  const bg = byVar("--color-bg") ?? "#ffffff";
  const muted = byVar("--color-text-muted") ?? text;
  if (!alt) return { strong: text, muted };
  const textOk = (contrastRatio(text, alt) ?? 0) >= 4.5;
  const strong = textOk ? text : bg;
  // keep the muted tone only when it still clears AA on this surface
  const mutedOk = (contrastRatio(muted, alt) ?? 0) >= 4.5;
  return { strong, muted: mutedOk ? muted : strong };
}

function contrastRatio(a: string, b: string): number | undefined {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === undefined || lb === undefined) return undefined;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function relativeLuminance(hex: string): number | undefined {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return undefined;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const chan = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
}

function fontFamilyValue(family: string): string {
  const quoted = /\s/.test(family) ? `"${family}"` : family;
  return `${quoted}, sans-serif`;
}

function pxToRem(px: number): string {
  return `${Math.round((px / 16) * 10000) / 10000}rem`;
}

// ---------- hero media ----------

async function renderHeroMedia(opts: {
  heroImagePath?: string;
  siteDir: string;
  copy: CopyDoc;
  intake: Intake;
  assetEntries: SiteManifest["assets"];
  files: string[];
}): Promise<string> {
  const alt = escapeHtml(
    firstNonEmpty(field(opts.copy, "hero", "image-alt"), `${opts.intake.businessName} team at work`)
  );
  if (!opts.heroImagePath) {
    return `<div class="hero__media hero__media--placeholder" data-edit-id="hero.image" role="img" aria-label="${alt}"></div>`;
  }
  const ext = path.extname(opts.heroImagePath) || ".jpg";
  const relPath = `assets/hero${ext}`;
  await copyFile(opts.heroImagePath, path.join(opts.siteDir, relPath));
  await compressHeroInPlace(path.join(opts.siteDir, relPath));
  opts.assetEntries.push({ path: relPath, kind: "image", generatedBy: "intake:hero-image" });
  opts.files.push(relPath);
  return `<div class="hero__media" data-edit-id="hero.image"><img src="${relPath}" alt="${alt}" loading="eager" /></div>`;
}

/**
 * Generated heroes come back at 5MB+ — far past the perf budget (500KB image
 * bytes). macOS `sips` (always present, no deps) downscales + recompresses
 * in place. Best-effort: a failure leaves the original, never breaks a build.
 */
async function compressHeroInPlace(filePath: string): Promise<void> {
  // Step down until the hero fits the perf budget's image allowance (500KB);
  // a 5MB generated hero needs more than one pass at a single quality.
  const BUDGET_BYTES = 460 * 1024;
  const steps: Array<[string, string]> = [
    ["1920", "70"],
    ["1600", "60"],
    ["1400", "50"],
  ];
  try {
    for (const [maxDim, quality] of steps) {
      const { size } = await stat(filePath);
      if (size <= BUDGET_BYTES) return;
      await execFileAsync("sips", [
        "--resampleHeightWidthMax", maxDim,
        "-s", "format", "jpeg",
        "-s", "formatOptions", quality,
        filePath,
        "--out", filePath,
      ]);
    }
  } catch {
    // keep whatever we have — the perf-budget gate reports it honestly
  }
}

// ---------- HTML render ----------

function renderHtml(opts: {
  template: string;
  tokens: DesignTokens;
  copy: CopyDoc;
  intake: Intake;
  phone?: string;
  enabledSections: Set<string>;
  heroMediaHtml: string;
}): string {
  const { copy, intake } = opts;
  const stripped = stripMarkedBlocks(opts.template, opts.enabledSections);

  const phoneHref = opts.phone ? `tel:${digitsOnly(opts.phone)}` : "#contact";
  const heroCtaHref =
    intake.primaryAction === "call" && opts.phone ? `tel:${digitsOnly(opts.phone)}` : "#contact";
  const { title, description } = buildMeta(intake, copy);

  const values: Record<string, string> = {
    "meta.title": escapeHtml(title),
    "meta.description": escapeHtml(description),
    jsonLd: buildJsonLd(intake, opts.phone),
    "hero.media": opts.heroMediaHtml,
    "nav.logo": escapeHtml(firstNonEmpty(field(copy, "nav", "logo"), intake.businessName)),
    "nav.phone": escapeHtml(firstNonEmpty(opts.phone, field(copy, "nav", "phone"))),
    "nav.phoneHref": phoneHref,
    "hero.headline": escapeHtml(field(copy, "hero", "headline")),
    "hero.sub": escapeHtml(field(copy, "hero", "sub")),
    "hero.cta": escapeHtml(field(copy, "hero", "cta")),
    "hero.ctaHref": heroCtaHref,
    "trust-bar.items": buildPairedItems(copy, "trust-bar", "stat", ["value", "label"], "stat"),
    "services.intro": escapeHtml(field(copy, "services", "intro")),
    "services.items": buildPairedItems(copy, "services", "card", ["title", "body"], "card"),
    "why-us.intro": escapeHtml(field(copy, "why-us", "intro")),
    "why-us.items": buildPairedItems(copy, "why-us", "point", ["title", "body"], "point"),
    "reviews.items": buildPairedItems(copy, "reviews", "card", ["quote", "author"], "card"),
    "service-area.intro": escapeHtml(field(copy, "service-area", "intro")),
    "service-area.items": buildAreaItems(copy),
    "service-area.range": escapeHtml(
      firstNonEmpty(intake.serviceArea, `${intake.location} and nearby`)
    ),
    "contact.headline": escapeHtml(field(copy, "contact", "headline")),
    "contact.sub": escapeHtml(field(copy, "contact", "sub")),
    "contact.cta": escapeHtml(field(copy, "contact", "cta")),
    "contact.ctaHref": intake.primaryAction === "call" && opts.phone ? `tel:${digitsOnly(opts.phone)}` : "#contact",
    "contact.phone": escapeHtml(firstNonEmpty(opts.phone, field(copy, "contact", "phone"))),
    "contact.phoneHref": phoneHref,
    "footer.business-name": escapeHtml(
      firstNonEmpty(field(copy, "footer", "business-name"), intake.businessName)
    ),
    "footer.tagline": escapeHtml(field(copy, "footer", "tagline")),
    "footer.phone": escapeHtml(firstNonEmpty(opts.phone, field(copy, "footer", "phone"))),
    "footer.phoneHref": phoneHref,
    "footer.year": String(new Date().getFullYear()),
  };

  return stripped.replace(/\{\{([\w.-]+)\}\}/g, (_match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : ""
  );
}

function buildMeta(intake: Intake, copy: CopyDoc): { title: string; description: string } {
  const fallbackName = firstNonEmpty(field(copy, "nav", "logo"), intake.businessName);
  const title = `${intake.businessName} | ${intake.category} in ${intake.location}`;
  const rawDescription = firstNonEmpty(
    field(copy, "hero", "sub"),
    field(copy, "contact", "sub"),
    `${fallbackName} — ${intake.category} serving ${intake.location}.`
  );
  return { title, description: truncate(rawDescription, 155) };
}

function buildJsonLd(intake: Intake, phone: string | undefined): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: intake.businessName,
  };
  const areaServed = firstNonEmpty(intake.serviceArea, intake.location);
  if (areaServed) data.areaServed = areaServed;
  if (phone) data.telephone = phone;
  if (intake.services.length) {
    data.makesOffer = intake.services.map((service) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: service },
    }));
  }
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

// ---------- CopyDoc numbered-item convention ----------
// Field keys inside a CopyDoc section follow "<prefix>-<n>-<part>" (or
// "<prefix>-<n>" for single-part lists), 1-indexed, contiguous — the first
// missing index ends the list. See WAVE-NOTES-buildgate.md.

function field(copy: CopyDoc, sectionId: string, elementId: string): string {
  return copy.sections[sectionId]?.[elementId] ?? "";
}

function buildPairedItems(
  copy: CopyDoc,
  sectionId: string,
  prefix: string,
  parts: [string, string],
  itemClass: string
): string {
  const section = copy.sections[sectionId] ?? {};
  const out: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const firstKey = `${prefix}-${i}-${parts[0]}`;
    if (!(firstKey in section)) break;
    const a = escapeHtml(section[firstKey] ?? "");
    const b = escapeHtml(section[`${prefix}-${i}-${parts[1]}`] ?? "");
    out.push(renderItemMarkup(sectionId, prefix, i, parts, itemClass, a, b));
  }
  return out.join("\n");
}

function renderItemMarkup(
  sectionId: string,
  prefix: string,
  i: number,
  parts: [string, string],
  itemClass: string,
  a: string,
  b: string
): string {
  const idA = `${sectionId}.${prefix}-${i}-${parts[0]}`;
  const idB = `${sectionId}.${prefix}-${i}-${parts[1]}`;
  if (itemClass === "stat") {
    return `<li class="stat" data-reveal="up"><span class="stat__value" data-edit-id="${idA}">${a}</span><span class="stat__label" data-edit-id="${idB}">${b}</span></li>`;
  }
  if (itemClass === "card" && parts[0] === "quote") {
    return `<li class="card review" data-reveal="up"><p class="review__quote" data-edit-id="${idA}">${a}</p><p class="review__author" data-edit-id="${idB}">${b}</p></li>`;
  }
  if (itemClass === "card") {
    return `<li class="card" data-reveal="up"><span class="card__icon" aria-hidden="true"></span><h3 class="card__title" data-edit-id="${idA}">${a}</h3><p class="card__body" data-edit-id="${idB}">${b}</p></li>`;
  }
  // "point" (why-us)
  return `<li class="point" data-reveal="up"><h3 class="point__title" data-edit-id="${idA}">${a}</h3><p class="point__body" data-edit-id="${idB}">${b}</p></li>`;
}

function buildAreaItems(copy: CopyDoc): string {
  const section = copy.sections["service-area"] ?? {};
  const out: string[] = [];
  for (let i = 1; i <= 24; i++) {
    const key = `area-${i}`;
    if (!(key in section)) break;
    const value = escapeHtml(section[key] ?? "");
    out.push(`<li class="area-chip" data-edit-id="service-area.${key}">${value}</li>`);
  }
  return out.join("\n");
}

// ---------- small helpers ----------

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const v of values) {
    if (v && v.trim().length > 0) return v.trim();
  }
  return "";
}

function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1).trimEnd()}…`;
}

function digitsOnly(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function resolvePhone(intake: Intake, copy: CopyDoc): string | undefined {
  const candidate = firstNonEmpty(
    intake.phone,
    field(copy, "nav", "phone"),
    field(copy, "contact", "phone"),
    field(copy, "footer", "phone")
  );
  return candidate || undefined;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function assertSafeRunId(runId: string): string {
  if (!RUN_ID_RE.test(runId)) {
    throw new Error(`buildSite: unsafe runId "${runId}"`);
  }
  return runId;
}

function assertSafeRelPath(relPath: string): string {
  if (relPath.includes("..") || path.isAbsolute(relPath)) {
    throw new Error(`buildSite: unsafe output path "${relPath}"`);
  }
  return relPath;
}
