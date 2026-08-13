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

const CATALOG_PATH = "/Users/zero-suminc./projects/mishmash-assets/catalog.json";
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

export async function localLibraryCandidates(): Promise<LocalCandidate[]> {
  const raw = await fs.readFile(CATALOG_PATH, "utf8");
  const catalog = JSON.parse(raw) as Catalog;
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
