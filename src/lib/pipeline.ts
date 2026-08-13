/**
 * The deterministic pipeline controller (GPT-5.6 audit rec #1: checkpointed
 * job controller, not a free agent loop). Each stage is a function that
 * reads/writes artifacts under sites/<id>/ and reports progress via emit().
 * Stages already marked done in run.json are skipped — resume is free.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  ARTIFACTS,
  CopyDocSchema,
  DesignTokensSchema,
  Intake,
  PipelineEvent,
  ReferenceLockSchema,
  ScanResultSchema,
  SkeletonSpecSchema,
  type DesignTokens,
  type ReferenceLock,
  type ScanResult,
  type SkeletonSpec,
  type CopyDoc,
  MODELS,
} from "./contracts";
import {
  loadRun,
  saveArtifact,
  loadArtifact,
  sitePaths,
  startStage,
  finishStage,
  failStage,
  stageDone,
  addCost,
} from "./runstate";
import { generateJson, generateTextCapped } from "./openrouter";
import { findCompetitors } from "./tools/maps";
import { crawlSite } from "./tools/crawl";
import { capture } from "./tools/capture";
import {
  searchStyles,
  searchScreens,
  getStyle,
  getScreen,
} from "./tools/refero";
import { generateImage } from "./tools/higgsfield";
import { buildSite } from "./builder";
import { runGates } from "./gates";
import { z } from "zod";

type Emit = (ev: PipelineEvent) => void;

const STAGE_NOTES = {
  scanned: "Scouting the local market",
  locked: "Studying references on Refero",
  synthesized: "Writing the design contract",
  built: "Building the site",
} as const;

// One execution per run at a time (audit P1: a reconnect must never repeat
// paid stages). The first caller executes; later callers attach as listeners,
// get a state snapshot, and share the same completion.
interface ActiveRun {
  emitters: Set<Emit>;
  done: Promise<void>;
}
const activeRuns = new Map<string, ActiveRun>();

const PIPELINE_STAGES = ["scanned", "locked", "synthesized", "built"] as const;

export async function runPipeline(runId: string, emit: Emit) {
  const existing = activeRuns.get(runId);
  if (existing) {
    existing.emitters.add(emit);
    try {
      const run = await loadRun(runId);
      for (const name of PIPELINE_STAGES) {
        const st = run.stages[name];
        if (st && st.status !== "pending") {
          emit({
            type: "stage",
            stage: name,
            status: st.status === "done" ? "done" : st.status === "failed" ? "failed" : "running",
            note: "attached to build in progress",
          });
        }
      }
      emit({ type: "cost", usd: run.costUsd });
      await existing.done;
    } finally {
      existing.emitters.delete(emit);
    }
    return;
  }

  const emitters = new Set<Emit>([emit]);
  const broadcast: Emit = (ev) => {
    for (const e of emitters) {
      try {
        e(ev);
      } catch {
        // a disconnected listener must never break the run for the others
      }
    }
  };
  const done = executePipeline(runId, broadcast).finally(() => {
    activeRuns.delete(runId);
  });
  activeRuns.set(runId, { emitters, done });
  await done;
}

async function executePipeline(runId: string, emit: Emit) {
  const paths = sitePaths(runId);
  const intake = (await loadArtifact(runId, ARTIFACTS.intake)) as Intake;
  if (!intake) throw new Error("intake artifact missing — run /api/chat first");

  try {
    const scan = await stage(runId, "scanned", emit, () =>
      stageScan(runId, intake, emit)
    );
    const lock = await stage(runId, "locked", emit, () =>
      stageLock(runId, intake, scan, emit)
    );
    const synth = await stage(runId, "synthesized", emit, () =>
      stageSynthesize(runId, intake, scan, lock, emit)
    );
    await stage(runId, "built", emit, () =>
      stageBuild(runId, intake, synth, emit)
    );
    const run = await loadRun(runId);
    emit({ type: "cost", usd: run.costUsd });
    emit({
      type: "complete",
      runId,
      previewUrl: `/preview/${runId}`,
    });
  } catch (e) {
    emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

async function stage<T>(
  runId: string,
  name: "scanned" | "locked" | "synthesized" | "built",
  emit: Emit,
  fn: () => Promise<T>
): Promise<T> {
  if (await stageDone(runId, name)) {
    const cached = await cachedResult(runId, name);
    emit({ type: "stage", stage: name, status: "done", note: "resumed from checkpoint" });
    return cached as T;
  }
  await startStage(runId, name);
  emit({ type: "stage", stage: name, status: "running", note: STAGE_NOTES[name] });
  try {
    const out = await fn();
    await finishStage(runId, name);
    emit({ type: "stage", stage: name, status: "done" });
    return out;
  } catch (e) {
    await failStage(runId, name, e instanceof Error ? e.message : String(e));
    emit({ type: "stage", stage: name, status: "failed", note: String(e) });
    throw e;
  }
}

async function cachedResult(runId: string, name: string) {
  switch (name) {
    case "scanned":
      return loadArtifact(runId, ARTIFACTS.scan);
    case "locked":
      return loadArtifact(runId, ARTIFACTS.lock);
    case "synthesized":
      return loadSynth(runId);
    default:
      return undefined;
  }
}

// ---------- Stage 2: competitive scan ----------

async function stageScan(
  runId: string,
  intake: Intake,
  emit: Emit
): Promise<ScanResult> {
  const paths = sitePaths(runId);
  const found = await findCompetitors(runId, {
    category: intake.category,
    location: intake.location,
    excludeUrl: intake.prospectUrl,
  });
  emit({
    type: "card",
    stage: "scanned",
    title: `Found ${found.length} competitors`,
    body: found.map((c) => `${c.name} — ${c.url}`).join("\n"),
  });

  const competitors = [];
  // concurrency 2 (audit A5) — simple pair batching
  for (let i = 0; i < found.length; i += 2) {
    const batch = await Promise.all(
      found.slice(i, i + 2).map(async (c) => {
        const dir = path.join(/*turbopackIgnore: true*/ paths.research, domainSlug(c.url));
        await fs.mkdir(dir, { recursive: true });
        const crawl = await crawlSite(c.url, dir, runId);
        let shots: string[] = [];
        try {
          shots = await capture(c.url, dir);
        } catch {
          /* screenshot failure is nonfatal */
        }
        return { ...c, markdownPath: crawl.markdownPath, screenshotPaths: shots };
      })
    );
    competitors.push(...batch);
  }

  // Structure inventory from markdown — bulk model, one call per competitor.
  for (const c of competitors) {
    if (!c.markdownPath) continue;
    const md = (await fs.readFile(c.markdownPath, "utf8")).slice(0, 12000);
    const out = await generateJson(
      runId,
      MODELS.bulk,
      z.object({ sections: z.array(z.string()), notes: z.string() }),
      `List the homepage sections of this local-service business site in order (short kebab-case names like hero, services-grid, reviews). Then one sentence on what the site does well or badly.\n\nSITE MARKDOWN:\n${md}`
    );
    Object.assign(c, { structure: out.sections, notes: out.notes });
  }

  const agg = await generateJson(
    runId,
    MODELS.orchestrator,
    z.object({ commonSections: z.array(z.string()), gaps: z.array(z.string()) }),
    `Competitor section inventories for ${intake.category} in ${intake.location}:\n${competitors
      .map((c) => `${c.name}: ${(c.structure ?? []).join(", ")}`)
      .join("\n")}\n\nReturn commonSections (the structural table stakes, ordered) and gaps (what nobody does well — opportunities). Structure signal only; style is decided elsewhere.`
  );

  const scan: ScanResult = ScanResultSchema.parse({
    competitors: competitors.slice(0, 4),
    commonSections: agg.commonSections,
    gaps: agg.gaps,
  });
  await saveArtifact(runId, ARTIFACTS.scan, scan);
  emit({
    type: "card",
    stage: "scanned",
    title: "Market structure",
    body: `Table stakes: ${scan.commonSections.join(", ")}\nGaps: ${scan.gaps.join("; ")}`,
    // cards carry run-root-relative paths — the serving route treats research/* as root-relative
    images: scan.competitors.flatMap((c) =>
      c.screenshotPaths.slice(0, 1).map((p) => path.relative(paths.root, p))
    ),
  });
  return scan;
}

// ---------- Stage 3: Refero reference lock ----------

async function stageLock(
  runId: string,
  intake: Intake,
  scan: ScanResult,
  emit: Emit
): Promise<ReferenceLock> {
  const angles = await generateJson(
    runId,
    MODELS.orchestrator,
    z.object({ angles: z.array(z.string()).min(3).max(5) }),
    `Per the refero_skill methodology (research-first, 3-5 distinct search angles), write style-search queries for a ${intake.category} site in ${intake.location}. Vibe words from the client: ${intake.vibeWords.join(", ") || "none given — infer a premium-but-trustworthy local-service direction"}. Angles must be DIFFERENT lenses (mood, industry-adjacent, layout archetype, typography direction), not synonyms.`
  );

  const candidates: { id: string; kind: "style" | "screen"; name: string; summary: string }[] = [];
  for (const angle of angles.angles) {
    const styles = await searchStyles(angle, 4);
    candidates.push(
      ...styles.map((s) => ({ id: s.id, kind: "style" as const, name: s.name, summary: s.summary }))
    );
  }
  // two screen searches for section patterns
  for (const q of [`${intake.category} hero section`, `local service contact conversion section`]) {
    const screens = await searchScreens(q, 3);
    candidates.push(
      ...screens.map((s) => ({ id: s.id, kind: "screen" as const, name: s.name, summary: s.summary }))
    );
  }

  emit({
    type: "card",
    stage: "locked",
    title: `${candidates.length} references studied`,
    body: angles.angles.map((a) => `→ ${a}`).join("\n"),
  });

  const lockRaw = await generateJson(
    runId,
    MODELS.orchestrator,
    ReferenceLockSchema.omit({ searchAngles: true }),
    `You are enforcing the reference-lock discipline (vendor/refero_skill): pick ONE primary reference, borrow at most 2 specific details from others, reject the rest with reasons, and write a decision ledger where every choice cites its source. Anti-averaging is absolute — do not blend.\n\nCLIENT: ${JSON.stringify({ category: intake.category, location: intake.location, vibeWords: intake.vibeWords })}\nMARKET GAPS: ${scan.gaps.join("; ")}\nCANDIDATES:\n${candidates.map((c) => `[${c.kind}] ${c.id} — ${c.name}: ${c.summary}`).join("\n")}`
  );
  const lock: ReferenceLock = ReferenceLockSchema.parse({
    ...lockRaw,
    searchAngles: angles.angles,
  });
  await saveArtifact(runId, ARTIFACTS.lock, lock);
  emit({
    type: "card",
    stage: "locked",
    title: `Reference locked: ${lock.primary.name}`,
    body: `${lock.primary.why}\nBorrowed: ${lock.borrowedDetails.map((b) => b.detail).join("; ") || "nothing"}`,
  });
  return lock;
}

// ---------- Stage 4: synthesis ----------

type Synth = { tokens: DesignTokens; skeleton: SkeletonSpec; copy: CopyDoc; heroImagePath?: string };

async function loadSynth(runId: string): Promise<Synth> {
  return {
    tokens: (await loadArtifact(runId, ARTIFACTS.tokens)) as DesignTokens,
    skeleton: (await loadArtifact(runId, ARTIFACTS.skeleton)) as SkeletonSpec,
    copy: (await loadArtifact(runId, ARTIFACTS.copy)) as CopyDoc,
    heroImagePath: await findHero(runId),
  };
}

async function findHero(runId: string) {
  const dir = path.join(sitePaths(runId).root, "assets");
  try {
    const files = await fs.readdir(dir);
    const hero = files.find((f) => f.startsWith("hero"));
    return hero ? path.join(dir, hero) : undefined;
  } catch {
    return undefined;
  }
}

// ---- token transport shape ----
// Strict structured-output providers collapse open-keyed z.record fields and
// let free-form cssVar names drift off the template's contract (live failure:
// a tokens.css with zero canonical vars → the whole site rendered in UA
// black/Times). Generation therefore uses FIXED-KEY objects — one required
// property per canonical CSS variable the frozen template consumes — folded
// deterministically into the DesignTokens artifact shape.

const ColorSlot = z.object({
  name: z.string(),
  value: z.string(),
  role: z.string(),
  forbidden: z.string().optional(),
});
const FontSlot = z.object({
  family: z.string(),
  weights: z.array(z.number()),
  role: z.string(),
  substitutes: z.array(z.string()).default([]),
});
const ScaleSlot = z.object({
  sizePx: z.number(),
  lineHeight: z.number(),
  trackingEm: z.number().optional(),
});

const TokenTransportSchema = z.object({
  colors: z.object({
    bg: ColorSlot,
    surface: ColorSlot,
    surfaceAlt: ColorSlot,
    text: ColorSlot,
    textMuted: ColorSlot,
    primary: ColorSlot,
    primaryContrast: ColorSlot,
    border: ColorSlot,
  }),
  fonts: z.object({ body: FontSlot, display: FontSlot }),
  typeScale: z.object({
    caption: ScaleSlot,
    bodySm: ScaleSlot,
    body: ScaleSlot,
    bodyLg: ScaleSlot,
    headingSm: ScaleSlot,
    heading: ScaleSlot,
    headingLg: ScaleSlot,
    display: ScaleSlot,
  }),
  radii: z.object({ sm: z.string(), md: z.string(), lg: z.string(), pill: z.string() }),
  spacing: z.object({
    xs: z.string(),
    sm: z.string(),
    md: z.string(),
    lg: z.string(),
    xl: z.string(),
  }),
  layout: z.object({
    maxWidthPx: z.number(),
    sectionGapPx: z.number(),
    cardPaddingPx: z.number(),
  }),
  motion: z.object({
    easing: z.string(),
    durationMs: z.object({ micro: z.number(), reveal: z.number() }),
    revealClasses: z.array(z.string()),
  }),
  componentStates: z.array(
    z.object({
      component: z.string(),
      states: z.array(z.object({ state: z.string(), css: z.string() })).min(1),
    })
  ),
  imageryBrief: z.object({
    subject: z.string(),
    lighting: z.string(),
    grade: z.string(),
    framing: z.string(),
    avoid: z.array(z.string()),
  }),
});
type TokenTransport = z.infer<typeof TokenTransportSchema>;

const COLOR_SLOT_VAR: Record<keyof TokenTransport["colors"], string> = {
  bg: "--color-bg",
  surface: "--color-surface",
  surfaceAlt: "--color-surface-alt",
  text: "--color-text",
  textMuted: "--color-text-muted",
  primary: "--color-primary",
  primaryContrast: "--color-primary-contrast",
  border: "--color-border",
};
const SCALE_SLOT_VAR: Record<keyof TokenTransport["typeScale"], string> = {
  caption: "--text-caption",
  bodySm: "--text-body-sm",
  body: "--text-body",
  bodyLg: "--text-body-lg",
  headingSm: "--text-heading-sm",
  heading: "--text-heading",
  headingLg: "--text-heading-lg",
  display: "--text-display",
};

function foldTokens(t: TokenTransport): DesignTokens {
  return DesignTokensSchema.parse({
    colors: (Object.keys(COLOR_SLOT_VAR) as Array<keyof TokenTransport["colors"]>).map(
      (slot) => ({ ...t.colors[slot], cssVar: COLOR_SLOT_VAR[slot] })
    ),
    fonts: [
      { ...t.fonts.body, cssVar: "--font-body" },
      { ...t.fonts.display, cssVar: "--font-display" },
    ],
    typeScale: (Object.keys(SCALE_SLOT_VAR) as Array<keyof TokenTransport["typeScale"]>).map(
      (slot) => ({ ...t.typeScale[slot], role: slot, cssVar: SCALE_SLOT_VAR[slot] })
    ),
    radii: t.radii,
    spacing: t.spacing,
    layout: t.layout,
    motion: t.motion,
    componentStates: t.componentStates.map((c) => ({
      component: c.component,
      states: Object.fromEntries(c.states.map((s) => [s.state, s.css])),
    })),
    imageryBrief: t.imageryBrief,
  });
}

async function stageSynthesize(
  runId: string,
  intake: Intake,
  scan: ScanResult,
  lock: ReferenceLock,
  emit: Emit
): Promise<Synth> {
  // Each sub-step checkpoints its artifact, so a mid-stage crash (e.g. a
  // schema miss on copy) resumes here without re-buying tokens/skeleton.
  let tokens = await loadArtifact<DesignTokens>(runId, ARTIFACTS.tokens);
  if (!tokens) {
    const primaryRecord = await (lock.primary.kind === "screen"
      ? getScreen(lock.primary.referoId)
      : getStyle(lock.primary.referoId)
    ).catch(() => null);
    const transport = await generateJson(
      runId,
      MODELS.orchestrator,
      TokenTransportSchema,
      `Convert the locked reference into a complete client design contract. Tokens must serve ${intake.businessName} (${intake.category}, ${intake.location}) — client-owned identity derived FROM the reference, never a copy of it and never a blend of competitors. Every slot in the schema maps 1:1 to a CSS variable the frozen template consumes, so fill every one deliberately: colors get a role AND a forbidden-context (Refero's own discipline), fonts substitute licensed faces with a free equivalent, the type scale runs caption→display, radii/spacing set the geometry rhythm, motion is CSS-only reveals, and the imagery brief (subject/lighting/grade/framing/avoid) is grounded in the reference's imagery language.\n\nREFERENCE LOCK:\n${JSON.stringify(lock)}\n\nPRIMARY RECORD:\n${JSON.stringify(primaryRecord)?.slice(0, 14000)}`
    );
    tokens = foldTokens(transport);
    await saveArtifact(runId, ARTIFACTS.tokens, tokens);
  }

  let skeleton = await loadArtifact<SkeletonSpec>(runId, ARTIFACTS.skeleton);
  if (!skeleton) {
    skeleton = await generateJson(
      runId,
      MODELS.orchestrator,
      SkeletonSpecSchema,
      `Choose and order sections for a ${intake.category} one-pager. Available section ids (the frozen template registry — you may ONLY use these): nav, hero, trust-bar, services, why-us, service-area, contact, footer. Use the market table stakes (${scan.commonSections.join(", ")}) and gaps (${scan.gaps.join("; ")}). primaryAction=${intake.primaryAction}. Every section gets purpose + contentNeeds.`
    );
    await saveArtifact(runId, ARTIFACTS.skeleton, skeleton);
  }
  // The intake shape carries no real customer quotes, so a reviews section
  // could only be fabricated — a hard disqualifier. Strip it on generation
  // AND on artifact load (older runs may have saved one).
  if (skeleton.sections.some((s) => s.id === "reviews")) {
    skeleton = SkeletonSpecSchema.parse({
      sections: skeleton.sections.filter((s) => s.id !== "reviews"),
    });
    await saveArtifact(runId, ARTIFACTS.skeleton, skeleton);
  }

  let copyDoc = await loadArtifact<CopyDoc>(runId, ARTIFACTS.copy);
  if (!copyDoc) {
    // Copy: builder-model drafts under stop-slop rules, bulk model scores, one revision.
    // The key names are the builder's EXACT template contract (builder.ts
    // numbered-item convention) — generic keys render as empty sections.
    const sectionIds = new Set(skeleton.sections.map((s) => s.id));
    const keyContract = [
      `"nav": { "logo": string, "phone": string }`,
      `"hero": { "headline": string, "sub": string, "cta": string, "image-alt": string }`,
      sectionIds.has("trust-bar") &&
        `"trust-bar": { "stat-1-value": string, "stat-1-label": string, "stat-2-value": string, "stat-2-label": string, "stat-3-value": string, "stat-3-label": string } — stats MUST come from the client's real numbers (years, homes wired, certifications)`,
      sectionIds.has("services") &&
        `"services": { "intro": string, "card-1-title": string, "card-1-body": string, ... } — one card per client service, numbered contiguously from 1`,
      sectionIds.has("why-us") &&
        `"why-us": { "intro": string, "point-1-title": string, "point-1-body": string, ... } — 3-4 points, numbered contiguously`,
      sectionIds.has("reviews") &&
        `"reviews": { "card-1-quote": string, "card-1-author": string, ... }`,
      sectionIds.has("service-area") &&
        `"service-area": { "intro": string, "area-1": string, "area-2": string, ... } — real neighborhoods/towns inside the stated service area, numbered contiguously`,
      `"contact": { "headline": string, "sub": string, "cta": string, "phone": string }`,
      `"footer": { "business-name": string, "tagline": string, "phone": string }`,
    ]
      .filter(Boolean)
      .join("\n");
    const copyPrompt = (feedback?: string) =>
      `Write website copy for ${intake.businessName}. FACTS YOU MAY USE (nothing else may be claimed): ${JSON.stringify(intake)}. Rules: plain, concrete, no AI-slop constructions (no "seamless", "elevate", "unlock", no em-dash chains, no rule-of-three padding), sentences a real owner would say, primary action = ${intake.primaryAction}.\n\nReturn sections as an array; each section has its id and a fields array of {key, value} pairs. Use EXACTLY these keys (every value a plain string; numbered keys contiguous from 1, the first missing number ends the list):\n${keyContract}\n\nDo not add other sections or other keys.${feedback ? `\nREVISE per this critique: ${feedback}` : ""}`;
    // Kimi's strict structured-output collapses open-keyed z.record fields
    // (live failure: empty sections object), so generation uses an explicit
    // array transport shape and folds it into the CopyDoc record.
    const CopyTransportSchema = z.object({
      sections: z
        .array(
          z.object({
            id: z.string(),
            fields: z.array(z.object({ key: z.string(), value: z.string() })).min(1),
          })
        )
        .min(3),
    });
    const foldCopy = (t: z.infer<typeof CopyTransportSchema>): CopyDoc["sections"] =>
      Object.fromEntries(
        t.sections.map((s) => [s.id, Object.fromEntries(s.fields.map((f) => [f.key, f.value]))])
      );
    const REQUIRED_COPY_KEYS: Array<[string, string]> = [
      ["hero", "headline"],
      ["hero", "sub"],
      ["hero", "cta"],
      ["contact", "headline"],
      ["contact", "cta"],
    ];
    const missingKeys = (sections: CopyDoc["sections"]) =>
      REQUIRED_COPY_KEYS.filter(([sec, key]) => !sections[sec]?.[key]?.trim()).map(
        ([sec, key]) => `${sec}.${key}`
      );

    let sections = foldCopy(
      await generateJson(runId, MODELS.builder, CopyTransportSchema, copyPrompt())
    );
    const score = await generateJson(
      runId,
      MODELS.bulk,
      z.object({ total: z.number(), critique: z.string() }),
      `Score this website copy 0-50 across 5 dimensions (10 each): natural voice, concreteness, zero AI-tells, conversion clarity, fact-grounding (no invented claims vs these facts: ${JSON.stringify(intake.claims.concat(intake.services))}). Be harsh. Copy: ${JSON.stringify(sections)}`
    );
    let stopSlopScore = score.total;
    const needsRevision = score.total < 35 || missingKeys(sections).length > 0;
    if (needsRevision) {
      const critique = [
        score.critique,
        ...(missingKeys(sections).length
          ? [`MISSING REQUIRED KEYS: ${missingKeys(sections).join(", ")} — every one must be present and non-empty.`]
          : []),
      ].join("\n");
      sections = foldCopy(
        await generateJson(runId, MODELS.builder, CopyTransportSchema, copyPrompt(critique))
      );
      const re = await generateJson(runId, MODELS.bulk, z.object({ total: z.number(), critique: z.string() }), `Re-score 0-50, same dimensions. Copy: ${JSON.stringify(sections)}`);
      stopSlopScore = re.total;
    }
    const stillMissing = missingKeys(sections);
    if (stillMissing.length) {
      throw new Error(`copy incomplete after revision — missing ${stillMissing.join(", ")}`);
    }
    copyDoc = CopyDocSchema.parse({ sections, stopSlopScore });
    await saveArtifact(runId, ARTIFACTS.copy, copyDoc);
  }
  const stopSlopScore = copyDoc.stopSlopScore ?? 0;
  emit({
    type: "card",
    stage: "synthesized",
    title: "Design contract written",
    body: `${tokens.colors.length} color tokens · ${skeleton.sections.length} sections · copy ${stopSlopScore}/50`,
  });

  // DESIGN.md — deterministic render, no LLM.
  await saveArtifact(runId, ARTIFACTS.designMd, renderDesignMd(intake, tokens, lock), true);

  // Hero image — ONE build-time Higgsfield generation from the imagery brief.
  let heroImagePath: string | undefined = await findHero(runId);
  if (heroImagePath) return { tokens, skeleton, copy: copyDoc, heroImagePath };
  const b = tokens.imageryBrief;
  const hero = await generateImage({
    prompt: `${b.subject}. Lighting: ${b.lighting}. Color grade: ${b.grade}. Framing: ${b.framing}. Avoid: ${b.avoid.join(", ")}. Photorealistic marketing hero image for a ${intake.category} website, no text, no logos.`,
    aspectRatio: "16:9",
    outPath: path.join(sitePaths(runId).root, "assets", "hero.jpg"),
  });
  if ("path" in hero) {
    heroImagePath = hero.path;
    // copy into research/ so the chat card can display it (research/* is servable)
    const previewCopy = path.join(sitePaths(runId).research, "hero-preview.jpg");
    await fs.mkdir(sitePaths(runId).research, { recursive: true });
    await fs.copyFile(heroImagePath, previewCopy).catch(() => {});
    emit({
      type: "card",
      stage: "synthesized",
      title: "Hero imagery generated",
      body: b.subject,
      images: ["research/hero-preview.jpg"],
    });
  } else {
    emit({ type: "card", stage: "synthesized", title: "Hero imagery skipped", body: `Higgsfield unavailable: ${hero.error}. Using gradient hero.` });
  }

  return { tokens, skeleton, copy: copyDoc, heroImagePath };
}

// ---------- Stage 5: build + gates ----------

async function stageBuild(runId: string, intake: Intake, synth: Synth, emit: Emit) {
  await buildSite({
    runId,
    intake,
    tokens: synth.tokens,
    skeleton: synth.skeleton,
    copy: synth.copy,
    assets: { heroImagePath: synth.heroImagePath },
  });
  emit({ type: "card", stage: "built", title: "Site assembled", body: "Running quality gates…" });

  let reports = await runGates(runId, {});
  const failing = reports.filter((r) => r.blocking && !r.pass);
  if (failing.length) {
    // one repair cycle: builder model gets the gate report + files, patches
    emit({
      type: "card",
      stage: "built",
      title: `${failing.length} gate(s) failing — repairing`,
      body: failing.map((f) => `${f.gate}: ${f.details.slice(0, 2).join("; ")}`).join("\n"),
    });
    const sitePath = path.join(sitePaths(runId).site, "index.html");
    const css = path.join(sitePaths(runId).site, "tokens.css");
    const html = await fs.readFile(sitePath, "utf8");
    const cssText = await fs.readFile(css, "utf8");
    const fix = await generateJson(
      runId,
      MODELS.builder,
      z.object({ files: z.array(z.object({ path: z.enum(["index.html", "tokens.css"]), content: z.string() })) }),
      `Fix ONLY these gate failures with minimal diffs. Preserve every data-edit-id. Failures:\n${JSON.stringify(failing)}\n\nindex.html:\n${html}\n\ntokens.css:\n${cssText}`
    );
    for (const f of fix.files) {
      await fs.writeFile(path.join(sitePaths(runId).site, f.path), f.content);
    }
    reports = await runGates(runId, {});
  }
  const stillFailing = reports.filter((r) => r.blocking && !r.pass);
  emit({
    type: "card",
    stage: "built",
    title: stillFailing.length ? `Gates: ${stillFailing.length} still failing after repair` : "All blocking gates green",
    body: reports.map((r) => `${r.pass ? "✓" : "✗"} ${r.gate}${r.blocking ? "" : " (advisory)"}`).join("\n"),
  });
  // Blocking gates are invariants — a build that fails them is not done
  // (audit P1). The stage stays failed and resumable, never published green.
  if (stillFailing.length) {
    throw new Error(
      `blocking gates failing after repair: ${stillFailing.map((r) => r.gate).join(", ")}`
    );
  }
}

// ---------- helpers ----------

function domainSlug(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9.-]/gi, "_");
  } catch {
    return url.replace(/[^a-z0-9.-]/gi, "_").slice(0, 40);
  }
}

function renderDesignMd(intake: Intake, t: DesignTokens, lock: ReferenceLock): string {
  const colorRows = t.colors
    .map((c) => `| ${c.name} | \`${c.value}\` | \`${c.cssVar}\` | ${c.role}${c.forbidden ? ` — never: ${c.forbidden}` : ""} |`)
    .join("\n");
  const scaleRows = t.typeScale
    .map((s) => `| ${s.role} | ${s.sizePx}px | ${s.lineHeight} | \`${s.cssVar}\` |`)
    .join("\n");
  return `# ${intake.businessName} — Design Contract

> Reference-locked to **${lock.primary.name}** (${lock.primary.referoId}). ${lock.primary.why}

Borrowed details: ${lock.borrowedDetails.map((b) => `${b.detail} (${b.referoId})`).join("; ") || "none"}

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
${colorRows}

## Type Scale

| Role | Size | Line Height | Token |
|------|------|-------------|-------|
${scaleRows}

## Fonts

${t.fonts.map((f) => `- **${f.family}** (${f.weights.join("/")}) — ${f.role}. Substitutes: ${f.substitutes.join(", ") || "n/a"}`).join("\n")}

## Motion

Easing \`${t.motion.easing}\`; micro ${t.motion.durationMs.micro}ms, reveal ${t.motion.durationMs.reveal}ms. Reveal classes: ${t.motion.revealClasses.join(", ")}. All motion disabled under \`prefers-reduced-motion\`.

## Imagery

${t.imageryBrief.subject}. Lighting: ${t.imageryBrief.lighting}. Grade: ${t.imageryBrief.grade}. Framing: ${t.imageryBrief.framing}. Avoid: ${t.imageryBrief.avoid.join(", ")}.

## Decision Ledger

${lock.decisionLedger.map((d) => `- ${d.decision} — _${d.source}_`).join("\n")}
`;
}
