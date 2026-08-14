import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { z } from "zod";
import { atomicWrite, assertSafeRunId, runGuardedMutation, type GateRunner } from "./siteMutation";

export const TokenCategorySchema = z.enum([
  "color",
  "typography",
  "spacing",
  "radius",
  "motion",
  "other",
]);
export type TokenCategory = z.infer<typeof TokenCategorySchema>;

export interface InspectedToken {
  name: string;
  semanticName: string;
  value: string;
  category: TokenCategory;
  usageScope: string[];
  affectedEditIds: string[];
  editable: boolean;
}

const TokenHistoryEntrySchema = z.object({
  id: z.string(),
  token: z.string(),
  previousValue: z.string(),
  nextValue: z.string(),
  at: z.string(),
});
const TokenHistorySchema = z.object({
  version: z.literal(1),
  entries: z.array(TokenHistoryEntrySchema),
  cursor: z.number().int().nonnegative(),
});
type TokenHistory = z.infer<typeof TokenHistorySchema>;

export class TokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenValidationError";
  }
}

function categoryFor(name: string): TokenCategory {
  if (name.startsWith("--color-")) return "color";
  if (name.startsWith("--font-") || name.startsWith("--text-")) return "typography";
  if (name.startsWith("--space-") || name.startsWith("--layout-")) return "spacing";
  if (name.startsWith("--radius-")) return "radius";
  if (name.startsWith("--motion-")) return "motion";
  return "other";
}

const DERIVED_TOKENS = new Set([
  "--color-primary-text",
  "--color-on-surface-alt",
  "--color-on-surface-alt-muted",
]);

export function parseTokenDeclarations(css: string): Array<{ name: string; value: string }> {
  const declarations: Array<{ name: string; value: string }> = [];
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css))) {
    declarations.push({ name: match[1], value: match[2].trim() });
  }
  return declarations;
}

function selectorsUsingToken(siteCss: string, token: string): string[] {
  const selectors = new Set<string>();
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(siteCss))) {
    if (!match[2].includes(`var(${token})`)) continue;
    for (const raw of match[1].split(",")) {
      const selector = raw.replace(/\/\*[\s\S]*?\*\//g, "").trim();
      if (selector && !selector.startsWith("@")) selectors.add(selector);
    }
  }
  return [...selectors];
}

function queryableSelector(selector: string): string {
  return selector
    .replace(/::?[a-z-]+(?:\([^)]*\))?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function inspectTokenSheet(tokensCss: string, siteCss: string, html: string): InspectedToken[] {
  const $ = cheerio.load(html);
  return parseTokenDeclarations(tokensCss).map(({ name, value }) => {
    const usageScope = selectorsUsingToken(siteCss, name);
    const affectedEditIds = new Set<string>();
    for (const selector of usageScope) {
      const query = queryableSelector(selector);
      if (!query) continue;
      try {
        $(query).each((_, element) => {
          const own = $(element).attr("data-edit-id");
          if (own) affectedEditIds.add(own);
          $(element)
            .find("[data-edit-id]")
            .each((__, child) => {
              const editId = $(child).attr("data-edit-id");
              if (editId) affectedEditIds.add(editId);
            });
        });
      } catch {
        // The selector remains visible as usage scope even if Cheerio cannot
        // evaluate a browser-only pseudo selector.
      }
    }
    return {
      name,
      semanticName: name.slice(2).replace(/-/g, " "),
      value,
      category: categoryFor(name),
      usageScope,
      affectedEditIds: [...affectedEditIds].sort(),
      editable: !DERIVED_TOKENS.has(name) && categoryFor(name) !== "other",
    };
  });
}

function numericUnit(value: string): { amount: number; unit: string } | null {
  const match = /^(\d+(?:\.\d+)?)(px|rem|em|ms)$/.exec(value);
  return match ? { amount: Number(match[1]), unit: match[2] } : null;
}

export function validateTokenValue(token: InspectedToken, value: string): string {
  const normalized = value.trim();
  if (!token.editable) throw new TokenValidationError(`${token.name} is derived or read-only`);
  if (/[;{}]|url\s*\(|var\s*\(/i.test(normalized)) {
    throw new TokenValidationError("token values cannot contain CSS rules, URLs, or variable references");
  }

  switch (token.category) {
    case "color":
      if (!/^#[0-9a-f]{6}$/i.test(normalized)) {
        throw new TokenValidationError("colors must be six-digit hex values");
      }
      break;
    case "typography":
      if (token.name.startsWith("--font-")) {
        if (!/^[a-z0-9 "'-]{1,60}(?:,\s*(?:sans-serif|serif|monospace))?$/i.test(normalized)) {
          throw new TokenValidationError("font values must be a local family with an optional generic fallback");
        }
      } else {
        const numeric = numericUnit(normalized);
        if (!numeric || !["px", "rem", "em"].includes(numeric.unit) || numeric.amount < 8 || numeric.amount > 224) {
          throw new TokenValidationError("type sizes must be 8–224px/rem/em");
        }
      }
      break;
    case "spacing":
    case "radius": {
      const numeric = numericUnit(normalized);
      if (!numeric || !["px", "rem", "em"].includes(numeric.unit) || numeric.amount < 0 || numeric.amount > 2000) {
        throw new TokenValidationError("layout values must be bounded px/rem/em lengths");
      }
      break;
    }
    case "motion":
      if (token.name === "--motion-ease") {
        if (!["linear", "ease", "ease-in", "ease-out", "ease-in-out"].includes(normalized)) {
          throw new TokenValidationError("motion easing must use the allowlist");
        }
      } else {
        const numeric = numericUnit(normalized);
        if (!numeric || numeric.unit !== "ms" || numeric.amount < 0 || numeric.amount > 5000) {
          throw new TokenValidationError("motion duration must be 0–5000ms");
        }
      }
      break;
    default:
      throw new TokenValidationError("unsupported token category");
  }
  return normalized;
}

export function replaceTokenDeclaration(css: string, tokenName: string, nextValue: string): string {
  const escaped = tokenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${escaped}\\s*:\\s*)([^;{}]+)(;)`);
  if (!pattern.test(css)) throw new TokenValidationError(`token not found: ${tokenName}`);
  return css.replace(pattern, `$1${nextValue}$3`);
}

function sitePaths(sitesRoot: string, runId: string) {
  const root = path.join(sitesRoot, assertSafeRunId(runId));
  return {
    root,
    site: path.join(root, "site"),
    tokensCss: path.join(root, "site", "tokens.css"),
    siteCss: path.join(root, "site", "site.css"),
    html: path.join(root, "site", "index.html"),
    sourceTokens: path.join(root, "tokens.json"),
    history: path.join(root, "token-history.json"),
    gates: path.join(root, "gates.json"),
  };
}

async function readHistory(filePath: string): Promise<TokenHistory> {
  try {
    return TokenHistorySchema.parse(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    return { version: 1, entries: [], cursor: 0 };
  }
}

async function updateSourceTokens(filePath: string, tokenName: string, value: string): Promise<void> {
  let source: Record<string, unknown>;
  try {
    source = JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  const updateByCssVar = (key: "colors" | "fonts" | "typeScale", updater: (item: Record<string, unknown>) => void) => {
    const items = source[key];
    if (!Array.isArray(items)) return false;
    const item = items.find((entry) => typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).cssVar === tokenName) as Record<string, unknown> | undefined;
    if (!item) return false;
    updater(item);
    return true;
  };

  if (tokenName.startsWith("--color-")) updateByCssVar("colors", (item) => { item.value = value; });
  else if (tokenName.startsWith("--font-")) updateByCssVar("fonts", (item) => { item.family = value.split(",")[0].trim().replace(/^['"]|['"]$/g, ""); });
  else if (tokenName.startsWith("--text-")) updateByCssVar("typeScale", (item) => {
    const parsed = numericUnit(value);
    if (parsed) item.sizePx = parsed.unit === "rem" || parsed.unit === "em" ? parsed.amount * 16 : parsed.amount;
  });
  else if (tokenName.startsWith("--radius-") && source.radii && typeof source.radii === "object") (source.radii as Record<string, unknown>)[tokenName.slice(9)] = value;
  else if (tokenName.startsWith("--space-") && source.spacing && typeof source.spacing === "object") (source.spacing as Record<string, unknown>)[tokenName.slice(8)] = value;
  else if (tokenName.startsWith("--layout-") && source.layout && typeof source.layout === "object") {
    const key = tokenName === "--layout-max-width" ? "maxWidthPx" : tokenName === "--layout-section-gap" ? "sectionGapPx" : "cardPaddingPx";
    (source.layout as Record<string, unknown>)[key] = numericUnit(value)?.amount;
  } else if (tokenName.startsWith("--motion-") && source.motion && typeof source.motion === "object") {
    const motion = source.motion as Record<string, unknown>;
    if (tokenName === "--motion-ease") motion.easing = value;
    else if (motion.durationMs && typeof motion.durationMs === "object") {
      (motion.durationMs as Record<string, unknown>)[tokenName.endsWith("micro") ? "micro" : "reveal"] = numericUnit(value)?.amount;
    }
  }
  await atomicWrite(filePath, `${JSON.stringify(source, null, 2)}\n`);
}

export interface TokenSiteOptions {
  sitesRoot?: string;
  gateRunner?: GateRunner;
}

export async function inspectSiteTokens(runId: string, options: TokenSiteOptions = {}) {
  const files = sitePaths(options.sitesRoot ?? path.join(process.cwd(), "sites"), runId);
  const [tokensCss, siteCss, html, history] = await Promise.all([
    fs.readFile(files.tokensCss, "utf8"),
    fs.readFile(files.siteCss, "utf8"),
    fs.readFile(files.html, "utf8"),
    readHistory(files.history),
  ]);
  return { tokens: inspectTokenSheet(tokensCss, siteCss, html), canRevert: history.cursor > 0 };
}

export async function previewTokenEdit(runId: string, tokenName: string, value: string, options: TokenSiteOptions = {}) {
  const inspection = await inspectSiteTokens(runId, options);
  const token = inspection.tokens.find((candidate) => candidate.name === tokenName);
  if (!token) throw new TokenValidationError(`token not found: ${tokenName}`);
  return { token, value: validateTokenValue(token, value) };
}

export async function applyTokenEdit(runId: string, tokenName: string, value: string, options: TokenSiteOptions = {}) {
  const sitesRoot = options.sitesRoot ?? path.join(process.cwd(), "sites");
  const files = sitePaths(sitesRoot, runId);
  const result = await runGuardedMutation({
    runId,
    snapshotPaths: [files.tokensCss, files.sourceTokens, files.history, files.gates],
    gateRunner: options.gateRunner,
    mutate: async () => {
      const [currentCss, siteCss, html, history] = await Promise.all([
        fs.readFile(files.tokensCss, "utf8"),
        fs.readFile(files.siteCss, "utf8"),
        fs.readFile(files.html, "utf8"),
        readHistory(files.history),
      ]);
      const token = inspectTokenSheet(currentCss, siteCss, html).find(
        (candidate) => candidate.name === tokenName,
      );
      if (!token) throw new TokenValidationError(`token not found: ${tokenName}`);
      const nextValue = validateTokenValue(token, value);
      const previousValue = token.value;
      const nextHistory: TokenHistory = {
        version: 1,
        entries: [
          ...history.entries.slice(0, history.cursor),
          { id: crypto.randomUUID(), token: tokenName, previousValue, nextValue, at: new Date().toISOString() },
        ],
        cursor: history.cursor + 1,
      };
      await atomicWrite(files.tokensCss, replaceTokenDeclaration(currentCss, tokenName, nextValue));
      await updateSourceTokens(files.sourceTokens, tokenName, nextValue);
      return nextHistory;
    },
    commit: (committed) => atomicWrite(files.history, `${JSON.stringify(committed, null, 2)}\n`),
  });
  return { ...(await inspectSiteTokens(runId, options)), gates: result.reports };
}

export async function revertTokenEdit(runId: string, options: TokenSiteOptions = {}) {
  const sitesRoot = options.sitesRoot ?? path.join(process.cwd(), "sites");
  const files = sitePaths(sitesRoot, runId);
  const result = await runGuardedMutation({
    runId,
    snapshotPaths: [files.tokensCss, files.sourceTokens, files.history, files.gates],
    gateRunner: options.gateRunner,
    mutate: async () => {
      const [history, currentCss] = await Promise.all([
        readHistory(files.history),
        fs.readFile(files.tokensCss, "utf8"),
      ]);
      if (history.cursor === 0) throw new TokenValidationError("no token edit to revert");
      const entry = history.entries[history.cursor - 1];
      const nextHistory = { ...history, cursor: history.cursor - 1 };
      await atomicWrite(files.tokensCss, replaceTokenDeclaration(currentCss, entry.token, entry.previousValue));
      await updateSourceTokens(files.sourceTokens, entry.token, entry.previousValue);
      return nextHistory;
    },
    commit: (committed) => atomicWrite(files.history, `${JSON.stringify(committed, null, 2)}\n`),
  });
  return { ...(await inspectSiteTokens(runId, options)), gates: result.reports };
}
