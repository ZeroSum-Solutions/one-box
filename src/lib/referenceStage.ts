import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CandidateProfileSchema,
  Intake,
  MODELS,
  PipelineEvent,
  ReferenceLockSchema,
  ReferenceMode,
  ReferenceSelectionStateSchema,
  ReferenceSelectionState,
  ReferenceSelectionVersionSchema,
  type ReferenceLock,
} from "./contracts";
import { generateJson } from "./openrouter";
import { normalizeReferencePreferences } from "./referenceSelection";
import { sitePaths } from "./runstate";
import { searchStyles, type StyleSummary } from "./tools/refero";
import { getStylesCached } from "./tools/referoStyleCache";

type Emit = (event: PipelineEvent) => void;
type ReferenceSelectionVersion = z.infer<typeof ReferenceSelectionVersionSchema>;
type JsonGenerator = (...args: Parameters<typeof generateJson>) => Promise<unknown>;

const MAX_IMAGE_BYTES = 1_500_000;
const MAX_RUN_IMAGE_BYTES = 4_000_000;
const JARGON_DENYLIST = /\b(?:css|tokens?|tailwind|design\s+system|hex)\b/i;

const PROFILE_RESPONSE_SCHEMA = z.object({
  candidates: z.array(
    CandidateProfileSchema.pick({
      referoId: true,
      palette: true,
      plainLanguageProfile: true,
      composition: true,
      recommended: true,
      recommendedWhy: true,
    })
  ).min(2).max(3),
});

type ProfileResponse = z.infer<typeof PROFILE_RESPONSE_SCHEMA>;

export interface ReferenceStageDeps {
  searchStyles: (query: string, limit?: number) => Promise<StyleSummary[]>;
  getStylesCached: (styleIds: string[]) => Promise<Map<string, unknown>>;
  generateJson: JsonGenerator;
  fetchImage: (url: string, maximumBytes: number) => Promise<{ data: Uint8Array; mediaType: "image/png" | "image/jpeg" | "image/webp" } | undefined>;
  mkdir: typeof fs.mkdir;
  writeFile: typeof fs.writeFile;
  now: () => Date;
}

async function fetchPreviewImage(url: string, maximumBytes: number): Promise<{ data: Uint8Array; mediaType: "image/png" | "image/jpeg" | "image/webp" } | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return undefined;
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
    if (mediaType !== "image/png" && mediaType !== "image/jpeg" && mediaType !== "image/webp") {
      return undefined;
    }
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maximumBytes) return undefined;
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength === 0 || data.byteLength > maximumBytes) return undefined;
    return { data, mediaType };
  } catch {
    return undefined;
  }
}

const DEFAULT_DEPS: ReferenceStageDeps = {
  searchStyles,
  getStylesCached,
  generateJson,
  fetchImage: fetchPreviewImage,
  mkdir: fs.mkdir,
  writeFile: fs.writeFile,
  now: () => new Date(),
};

interface SearchCandidate {
  id: string;
  name: string;
  summary: string;
  sourceUrl?: string;
  previewImageUrl: string;
  foundVia: string;
}

function targetCriteriaForPicker(target: Intake["projectTarget"]) {
  switch (target) {
    case "web-app":
      return { outputLabel: "responsive web application", researchLens: "task flows, navigation, empty/loading/error states, and responsive data density" };
    case "ios-app":
      return { outputLabel: "iOS application prototype", researchLens: "native navigation, touch ergonomics, safe areas, system feedback, and accessibility" };
    default:
      return { outputLabel: "marketing website", researchLens: "information hierarchy, trust, discoverability, and conversion" };
  }
}

/** Shared verbatim by the legacy lock and the picker, so candidate generation
 * cannot quietly drift into a different design brief. */
export function referenceSearchAnglesPrompt(intake: Intake): string {
  const targetCriteria = targetCriteriaForPicker(intake.projectTarget);
  return `Per the refero_skill methodology, write 3-5 distinct design-search angles for a ${intake.category} ${targetCriteria.outputLabel} in ${intake.location}. Judge ${targetCriteria.researchLens}. Vibe words: ${intake.vibeWords.join(", ") || "none given"}. Angles must use different lenses, not synonyms.`;
}

export function referenceGateApplies(
  mode: ReferenceMode,
  research: Intake["research"],
  pickerEnabled: boolean
): boolean {
  return mode === "refero" && research.enabled && research.referoDesignEvidence && pickerEnabled;
}

/** True when any owner-facing copy contains technical implementation language. */
export function hasReferenceProfileJargon(value: unknown): boolean {
  if (typeof value === "string") return JARGON_DENYLIST.test(value);
  if (Array.isArray(value)) return value.some(hasReferenceProfileJargon);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(hasReferenceProfileJargon);
  }
  return false;
}

function colorHex(value: unknown): string | undefined {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["hex", "value", "color"]) {
    if (typeof record[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(record[key] as string)) {
      return record[key] as string;
    }
  }
  return undefined;
}

/** Pull colors from Refero's full-style payload only. Model output can label
 * them, but it never supplies the palette values stored in the candidate. */
function extractPalette(style: unknown): string[] {
  if (typeof style !== "object" || style === null) return [];
  const colors = (style as { colors?: unknown }).colors;
  if (!Array.isArray(colors)) return [];
  const seen = new Set<string>();
  const ranked: Array<{ hex: string; rank: number; index: number }> = [];
  colors.forEach((entry, index) => {
    const hex = colorHex(entry);
    if (!hex || seen.has(hex.toLowerCase())) return;
    seen.add(hex.toLowerCase());
    const record = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
    const group = String(record.group ?? record.category ?? "").toLowerCase();
    const level = Number(record.level ?? record.elevation);
    ranked.push({
      hex,
      rank: group === "brand" || group === "accent" ? 0 : level === 0 || level === 1 ? 1 : 2,
      index,
    });
  });
  return ranked
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, 6)
    .map((entry) => entry.hex);
}

function shortlistCandidates(
  angles: string[],
  batches: StyleSummary[][],
  excludedIds: Set<string>
): SearchCandidate[] {
  const seen = new Set<string>();
  const shortlisted: SearchCandidate[] = [];
  for (const [index, angle] of angles.entries()) {
    const match = batches[index].find((style) =>
      !seen.has(style.id) &&
      !excludedIds.has(style.id) &&
      Boolean(style.name && style.summary && style.previewImageUrl)
    );
    if (!match?.previewImageUrl) continue;
    seen.add(match.id);
    shortlisted.push({
      id: match.id,
      name: match.name,
      summary: match.summary,
      sourceUrl: match.sourceUrl,
      previewImageUrl: match.previewImageUrl,
      // Angles are model-written and routinely exceed the schema's 200-char
      // provenance cap (live failure, 2026-08-15) — record a bounded prefix.
      foundVia: angle.slice(0, 200),
    });
    if (shortlisted.length === 3) break;
  }
  return shortlisted;
}

async function persistPreviews(
  runId: string,
  candidates: SearchCandidate[],
  deps: ReferenceStageDeps
): Promise<Map<string, string>> {
  const screenshots = new Map<string, string>();
  let remaining = MAX_RUN_IMAGE_BYTES;
  for (const [index, candidate] of candidates.entries()) {
    if (remaining <= 0) break;
    const image = await deps.fetchImage(candidate.previewImageUrl, Math.min(remaining, MAX_IMAGE_BYTES));
    if (!image || image.data.byteLength > remaining) continue;
    const extension = image.mediaType === "image/png" ? "png" : image.mediaType === "image/webp" ? "webp" : "jpg";
    const relativePath = `research/refero/reference-${index + 1}.${extension}`;
    await deps.mkdir(path.join(sitePaths(runId).research, "refero"), { recursive: true });
    await deps.writeFile(path.join(sitePaths(runId).root, relativePath), image.data);
    screenshots.set(candidate.id, relativePath);
    remaining -= image.data.byteLength;
  }
  return screenshots;
}

function profilePrompt(
  intake: Intake,
  candidates: Array<SearchCandidate & { palette: string[] }>,
  retrying: boolean
): string {
  return `You write short, plain-language design-direction cards for a small-business owner. They are choosing a visual direction, not implementation details. ${retrying ? "Your last response used technical jargon. Rewrite every owner-facing phrase in ordinary business language." : ""}

CLIENT: ${JSON.stringify({ businessName: intake.businessName, category: intake.category, location: intake.location, vibeWords: intake.vibeWords })}
CANDIDATES: ${JSON.stringify(candidates.map((candidate) => ({ referoId: candidate.id, name: candidate.name, summary: candidate.summary, foundVia: candidate.foundVia, palette: candidate.palette })))}

For every candidate, write its plainLanguageProfile, composition, one short label for each supplied palette color, and recommended/recommendedWhy. Pick exactly one recommendation and give it a reason. Use the supplied candidate ids and color values exactly; do not add colors. Do not use technical words such as CSS, tokens, Tailwind, design system, or hex. Explain the direction as if the reader owns a small business.`;
}

function mergeProfiles(
  candidates: Array<SearchCandidate & { palette: string[]; screenshotPath?: string }>,
  response: ProfileResponse
): ReferenceSelectionVersion["candidates"] {
  const rawById = new Map(response.candidates.map((candidate) => [candidate.referoId, candidate]));
  if (rawById.size !== candidates.length || candidates.some((candidate) => !rawById.has(candidate.id))) {
    throw new Error("profile response must cover every shortlisted candidate exactly once");
  }
  return candidates.map((candidate) => {
    const profile = rawById.get(candidate.id)!;
    const labels = new Map(profile.palette.map((entry) => [entry.hex.toLowerCase(), entry.plainLabel]));
    if (labels.size !== candidate.palette.length || candidate.palette.some((hex) => !labels.has(hex.toLowerCase()))) {
      throw new Error("profile response must label each extracted palette color exactly once");
    }
    return CandidateProfileSchema.parse({
      referoId: candidate.id,
      kind: "style",
      name: candidate.name,
      sourceUrl: candidate.sourceUrl,
      previewImageUrl: candidate.previewImageUrl,
      screenshotPath: candidate.screenshotPath,
      foundVia: candidate.foundVia,
      palette: candidate.palette.map((hex) => ({ hex, plainLabel: labels.get(hex.toLowerCase())! })),
      plainLanguageProfile: profile.plainLanguageProfile,
      composition: profile.composition,
      recommended: profile.recommended,
      recommendedWhy: profile.recommendedWhy,
    });
  });
}

export async function stageLockCandidates(
  runId: string,
  intake: Intake,
  emit: Emit,
  opts: { revisionNote?: string; excludedIds?: string[]; version?: number } = {},
  deps: ReferenceStageDeps = DEFAULT_DEPS
): Promise<ReferenceSelectionVersion | null> {
  const angleResult = z.object({ angles: z.array(z.string()).min(3).max(5) }).parse(
    await deps.generateJson(
      runId,
      MODELS.orchestrator,
      z.object({ angles: z.array(z.string()).min(3).max(5) }),
      referenceSearchAnglesPrompt(intake)
    )
  );
  const angles = angleResult.angles;
  const batches = await Promise.all(angles.map((angle) => deps.searchStyles(angle, 4)));
  batches.forEach((styles, index) => {
    emit({
      type: "card",
      stage: "locked",
      title: `${styles.length} references for "${angles[index]}"`,
      body: styles.map((style) => `→ ${style.name}`).join("\n") || "no results",
    });
  });

  const excludedIds = new Set(opts.excludedIds ?? []);
  const shortlisted = shortlistCandidates(angles, batches, excludedIds);
  if (shortlisted.length < 2) return null;

  const fullStyles = await deps.getStylesCached(shortlisted.map((candidate) => candidate.id));
  const withPalettes = shortlisted.flatMap((candidate) => {
    const palette = extractPalette(fullStyles.get(candidate.id));
    return palette.length >= 2 ? [{ ...candidate, palette }] : [];
  });
  if (withPalettes.length < 2) return null;

  const screenshots = await persistPreviews(runId, withPalettes, deps);
  const candidates = withPalettes.map((candidate) => ({
    ...candidate,
    screenshotPath: screenshots.get(candidate.id),
  }));

  // Persistent profile defects (jargon, recommendation-count violations)
  // degrade to null → the caller's honest legacy auto-pick fallback — a
  // malformed model response must never kill the run (review finding,
  // 2026-08-15).
  let profiles: ReferenceSelectionVersion["candidates"] | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = PROFILE_RESPONSE_SCHEMA.parse(
      await deps.generateJson(
        runId,
        MODELS.orchestrator,
        PROFILE_RESPONSE_SCHEMA,
        profilePrompt(intake, candidates, attempt === 1)
      )
    );
    if (hasReferenceProfileJargon(raw)) {
      if (attempt === 0) continue;
      return null;
    }
    const merged = mergeProfiles(candidates, raw);
    const recommended = merged.filter((candidate) => candidate.recommended);
    if (recommended.length !== 1 || !recommended[0].recommendedWhy) {
      if (attempt === 0) continue;
      return null;
    }
    profiles = merged;
    break;
  }
  if (!profiles) return null;

  return ReferenceSelectionVersionSchema.parse({
    version: opts.version ?? 1,
    createdAt: deps.now().toISOString(),
    // Same bounding as foundVia: full angle text drives the search, a
    // 200-char prefix is what the version records as provenance.
    searchAngles: angles.map((angle) => angle.slice(0, 200)),
    candidates: profiles,
    revisionNote: opts.revisionNote,
    excludedFromPrior: opts.excludedIds ?? [],
  });
}

export async function finalizeReferenceLock(
  _runId: string,
  _intake: Intake,
  selection: ReferenceSelectionState,
  emit: Emit
): Promise<ReferenceLock> {
  const checked = ReferenceSelectionStateSchema.parse(selection);
  if (checked.status !== "selected" || !checked.selection) {
    throw new Error("reference selection is not complete");
  }
  const committedSelection = checked.selection;
  const normalized = normalizeReferencePreferences(checked);
  const selectedCandidates = normalized.preferences.map((preference) => {
    const selectedVersion = checked.versions.find(
      (entry) => entry.version === preference.version,
    );
    const candidate = selectedVersion?.candidates.find(
      (entry) => entry.referoId === preference.referoId,
    );
    if (!candidate) throw new Error("selected reference candidate is unavailable");
    return { preference, candidate };
  });
  const version = checked.versions.find(
    (entry) => entry.version === committedSelection.version,
  );
  const primary = selectedCandidates[0]?.candidate;
  if (!version || !primary) throw new Error("selected reference candidate is unavailable");
  const provenanceCandidates = [...version.candidates];
  for (const { candidate } of selectedCandidates.slice(1)) {
    if (!provenanceCandidates.some((entry) => entry.referoId === candidate.referoId)) {
      provenanceCandidates.push(candidate);
    }
  }
  const candidates = provenanceCandidates.map((candidate) => ({
    referoId: candidate.referoId,
    kind: candidate.kind,
    name: candidate.name,
    sourceUrl: candidate.sourceUrl,
    previewImageUrl: candidate.previewImageUrl,
    screenshotPath: candidate.screenshotPath,
    foundVia: candidate.foundVia,
  }));
  const lock = ReferenceLockSchema.parse({
    searchAngles: version.searchAngles,
    primary: {
      referoId: primary.referoId,
      kind: primary.kind,
      name: primary.name,
      why: `The owner chose this direction: ${primary.plainLanguageProfile.headline}.`,
    },
    borrowedDetails: selectedCandidates.slice(1, 3).map(({ preference }) => ({
      referoId: preference.referoId,
      detail: preference.note,
      why: `The owner ranked this direction ${preference.rank === 2 ? "second" : "third"}.`,
    })),
    rejected: version.candidates
      .filter(
        (candidate) =>
          !selectedCandidates.some(
            (selection) => selection.candidate.referoId === candidate.referoId,
          ),
      )
      .map((candidate) => ({
        referoId: candidate.referoId,
        name: candidate.name,
        why: "not chosen by the owner",
      })),
    decisionLedger: [
      {
        decision: `The owner chose ${primary.name}: ${primary.plainLanguageProfile.headline}, recorded at ${checked.selection.at}.`,
        source: "owner choice",
      },
      { decision: "The page layout comes from the standard business-website format for now.", source: "picker disclosure" },
      ...(normalized.overallNote
        ? [{ decision: normalized.overallNote, source: "owner overall preference" }]
        : []),
    ],
      ...(committedSelection.ranked
      ? {
          preferenceLedger: {
            schemaVersion: 1 as const,
            preferences: normalized.preferences,
            overallNote: normalized.overallNote,
          },
        }
      : {}),
    provenance: {
      primary: candidates.find((candidate) => candidate.referoId === primary.referoId),
      candidates,
      imagesViewed: candidates.flatMap((candidate) => candidate.screenshotPath ? [candidate.screenshotPath] : []),
    },
  });
  emit({
    type: "card",
    stage: "locked",
    title: `Reference locked: ${lock.primary.name}`,
    body: lock.primary.why,
  });
  return lock;
}
