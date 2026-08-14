/**
 * Local design-asset-library index for the Phase 4 "L" arm: reference-lock
 * candidates drawn from the mishmash-assets catalog's WRITTEN METADATA only.
 *
 * Rights boundary (RIGHTS.md, mishmash-assets): the site-screenshot captures
 * are `human-local-only` — the IMAGES must never be fed to a model or used in
 * a commercial pipeline. Design learnings travel as written notes; the
 * catalog's labels/descriptions/domain tags are Devin's own notes and are the
 * sanctioned index. This module therefore exposes TEXT ONLY.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CATALOG_RELATIVE_PATH = "projects/mishmash-assets/catalog.json";
// Web-genre groups only — app-UI kits and icon sets are the wrong genre for
// marketing-site references.
const WEB_GROUPS = new Set(["03 Site Screenshots", "04 Design Inspiration"]);

interface CatalogItem {
  id: string;
  label: string;
  rel: string;
  description?: string;
  domains?: string[];
  allowed_use?: string;
}

interface Catalog {
  groups: Array<{ folder: string; title: string; items: CatalogItem[] }>;
}

export interface LocalCandidate {
  id: string;
  name: string;
  summary: string;
}

export function resolveLocalLibraryCatalogPath(): string {
  const override = process.env.MISHMASH_CATALOG_PATH?.trim();
  return override ? path.resolve(override) : path.join(os.homedir(), CATALOG_RELATIVE_PATH);
}

function validateCatalogStructure(value: unknown, catalogPath: string): asserts value is Catalog {
  if (!isRecord(value) || !Array.isArray(value.groups)) {
    throw new Error(
      `Local design catalog at "${catalogPath}" has an invalid structure: ` +
        "expected a top-level object with a groups array."
    );
  }

  for (const [index, group] of value.groups.entries()) {
    if (!isRecord(group)) {
      throw new Error(
        `Local design catalog at "${catalogPath}" has an invalid structure: ` +
          `expected groups[${index}] to be an object.`
      );
    }
    if (
      typeof group.folder === "string" &&
      WEB_GROUPS.has(group.folder) &&
      !Array.isArray(group.items)
    ) {
      throw new Error(
        `Local design catalog at "${catalogPath}" has an invalid structure: ` +
          `expected groups[${index}].items to be an array for selected group "${group.folder}".`
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function localLibraryCandidates(): Promise<LocalCandidate[]> {
  const catalogPath = resolveLocalLibraryCatalogPath();
  let raw: string;
  try {
    raw = await fs.readFile(catalogPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `Local design catalog was not found at "${catalogPath}". ` +
          "Set MISHMASH_CATALOG_PATH to the mishmash-assets catalog.json path."
      );
    }
    throw new Error(
      `Unable to read local design catalog at "${catalogPath}": ` +
        (err instanceof Error ? err.message : String(err))
    );
  }

  let catalog: unknown;
  try {
    catalog = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new Error(
      `Local design catalog at "${catalogPath}" is not valid JSON: ` +
        (err instanceof Error ? err.message : String(err))
    );
  }
  validateCatalogStructure(catalog, catalogPath);
  const out: LocalCandidate[] = [];
  for (const group of catalog.groups) {
    if (!WEB_GROUPS.has(group.folder)) continue;
    for (const item of group.items) {
      if (item.allowed_use === "blocked-pending-license") continue;
      const domains = item.domains?.length ? ` [${item.domains.join(", ")}]` : "";
      out.push({
        id: item.id,
        name: item.label,
        summary: `${item.description ?? "(no notes)"}${domains}`,
      });
    }
  }
  return out;
}

/** Text-only record for token synthesis — the local analog of a Refero
 * style record, deliberately limited to the index's written notes. */
export async function localLibraryRecord(candidateId: string): Promise<unknown> {
  const all = await localLibraryCandidates();
  return all.find((c) => c.id === candidateId) ?? null;
}
