import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PAGE_IR_PURPOSES,
  PageIRV1Schema,
  PageIrQualityCorpusBriefV1Schema,
  PageIrQualityFixtureManifestV1Schema,
  type PageIRV1,
  type PageIrQualityCorpusBriefV1,
  type PagePurposeV1,
} from "../contracts";
import {
  compilePageIRV1,
  type PageIrCompilationResultV1,
} from "../pageIrCompiler";

export const QUALITY_CORPUS_FIXTURE_IDS = PAGE_IR_PURPOSES;

export interface PageIrQualitySourceFile {
  path: "brief.json" | "page-ir.json";
  sha256: string;
  bytes: Uint8Array;
}

export interface PageIrQualityFixture {
  id: PagePurposeV1;
  purpose: PagePurposeV1;
  fixtureSourceKind: "synthetic-evaluation";
  customerApproval: "not-applicable";
  brief: PageIrQualityCorpusBriefV1;
  pageIr: PageIRV1;
  sourceFiles: PageIrQualitySourceFile[];
}

export type PageIrQualityAutomaticRejection =
  | "fixture-contract-invalid"
  | "purpose-topology-mismatch"
  | "primary-conversion-mismatch"
  | "primary-conversion-label-mismatch"
  | "reference-state-mismatch"
  | "reference-source-mismatch"
  | "restyled-local-service-topology";

const DEFAULT_FIXTURES_ROOT = path.join(
  process.cwd(),
  "docs/eval/page-ir-safe-pipeline/fixtures",
);

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

function json(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

export async function loadPageIrQualityFixture(
  fixtureId: PagePurposeV1,
  fixturesRoot = DEFAULT_FIXTURES_ROOT,
): Promise<PageIrQualityFixture> {
  const fixtureRoot = path.join(fixturesRoot, fixtureId);
  const entries = await readdir(fixtureRoot, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
    throw new Error(`${fixtureId} fixture inventory must contain regular files only`);
  }
  const fixtureBytes = new Uint8Array(await readFile(path.join(fixtureRoot, "fixture.json")));
  const manifest = PageIrQualityFixtureManifestV1Schema.parse(
    json(fixtureBytes, `${fixtureId}/fixture.json`),
  );
  if (manifest.id !== fixtureId) {
    throw new Error(`${fixtureId} fixture authority does not match its directory`);
  }
  const expectedNames = ["fixture.json", ...manifest.inputs.map((input) => input.path)].sort();
  const actualNames = entries.map((entry) => entry.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`${fixtureId} fixture inventory is not closed`);
  }

  const sourceFiles: PageIrQualitySourceFile[] = [];
  for (const binding of [...manifest.inputs].sort((left, right) => left.path.localeCompare(right.path))) {
    const bytes = new Uint8Array(await readFile(path.join(fixtureRoot, binding.path)));
    if (sha256(bytes) !== binding.sha256) {
      throw new Error(`${fixtureId}/${binding.path} does not match its fixture hash`);
    }
    sourceFiles.push({ path: binding.path, sha256: binding.sha256, bytes });
  }

  const briefSource = sourceFiles.find((source) => source.path === "brief.json")!;
  const pageIrSource = sourceFiles.find((source) => source.path === "page-ir.json")!;
  const brief = PageIrQualityCorpusBriefV1Schema.parse(
    json(briefSource.bytes, `${fixtureId}/brief.json`),
  );
  const pageIr = PageIRV1Schema.parse(json(pageIrSource.bytes, `${fixtureId}/page-ir.json`));
  if (brief.fixtureId !== fixtureId || brief.purpose !== fixtureId) {
    throw new Error(`${fixtureId} brief authority does not match its directory`);
  }

  return {
    id: fixtureId,
    purpose: fixtureId,
    fixtureSourceKind: brief.fixtureSourceKind,
    customerApproval: brief.customerApproval,
    brief,
    pageIr,
    sourceFiles,
  };
}

export async function loadPageIrQualityCorpus(
  fixturesRoot = DEFAULT_FIXTURES_ROOT,
): Promise<PageIrQualityFixture[]> {
  return Promise.all(
    QUALITY_CORPUS_FIXTURE_IDS.map((fixtureId) =>
      loadPageIrQualityFixture(fixtureId, fixturesRoot),
    ),
  );
}

function mainSectionIds(pageIr: PageIRV1): string[] {
  const main = pageIr.layoutProgram.nodes.find(
    (node) => node.id === pageIr.accessibility.mainNodeId,
  );
  return main && main.kind === "landmark" && main.landmark === "main"
    ? [...main.childIds]
    : [];
}

/** Hashes semantic layout shape while deliberately erasing arbitrary IDs,
 * content, tokens, and styling. Child order, responsive behavior, slot kinds,
 * action kinds, and conversion placement remain observable. */
export function pageIrQualityTopologyFingerprint(
  pageIr: PageIRV1,
  options: { includeActionKinds?: boolean } = {},
): string {
  const includeActionKinds = options.includeActionKinds ?? true;
  const nodes = new Map(pageIr.layoutProgram.nodes.map((node) => [node.id, node]));
  const bindings = new Map(pageIr.slotBindings.map((binding) => [binding.nodeId, binding]));
  const actions = new Map(pageIr.actions.map((action) => [action.id, action]));
  const normalize = (nodeId: string): unknown => {
    const node = nodes.get(nodeId);
    if (!node) return { kind: "missing" };
    if (node.kind === "slot") {
      const binding = bindings.get(node.id);
      const action = binding?.kind === "action" ? actions.get(binding.actionId) : undefined;
      return {
        kind: "slot",
        slotType: node.slotType,
        ...(node.slotType === "heading" ? { level: node.level } : {}),
        ...(node.slotType === "list" ? { ordered: node.ordered } : {}),
        ...(action && includeActionKinds ? { actionKind: action.kind } : {}),
      };
    }
    return {
      kind: node.kind,
      ...(node.kind === "landmark" ? { landmark: node.landmark } : {}),
      responsive: node.responsive,
      children: node.childIds.map(normalize),
    };
  };
  return sha256(new TextEncoder().encode(JSON.stringify(normalize(pageIr.layoutProgram.rootNodeId))));
}

const BROCHURE_LOCAL_SERVICE_TOPOLOGY_FINGERPRINT =
  "dfb393d4301a3d3375f903c82b15c6781a1a1e928468c7de49a7abe74fca1715";
const BROCHURE_LOCAL_SERVICE_SKELETON_FINGERPRINT =
  "3d395a67f8cc4c3a95bd158ca6453ea6a6a7871d1d5cd8cbe088ba6942f20133";

export function evaluatePageIrQualityStructure(
  fixture: PageIrQualityFixture,
): PageIrQualityAutomaticRejection[] {
  const rejected = new Set<PageIrQualityAutomaticRejection>();
  if (
    fixture.purpose !== "brochure-local-service" &&
    (pageIrQualityTopologyFingerprint(fixture.pageIr) ===
      BROCHURE_LOCAL_SERVICE_TOPOLOGY_FINGERPRINT ||
      pageIrQualityTopologyFingerprint(fixture.pageIr, { includeActionKinds: false }) ===
        BROCHURE_LOCAL_SERVICE_SKELETON_FINGERPRINT)
  ) {
    rejected.add("restyled-local-service-topology");
  }
  if (!PageIRV1Schema.safeParse(fixture.pageIr).success) {
    rejected.add("fixture-contract-invalid");
    return [...rejected];
  }
  const sectionIds = mainSectionIds(fixture.pageIr);
  if (JSON.stringify(sectionIds) !== JSON.stringify(fixture.brief.expectedSectionIds)) {
    rejected.add("purpose-topology-mismatch");
  }
  const conversion = fixture.brief.primaryConversion;
  const action = fixture.pageIr.actions.find((candidate) => candidate.id === conversion.actionId);
  const binding = fixture.pageIr.slotBindings.find(
    (candidate) => candidate.nodeId === conversion.targetNodeId,
  );
  if (
    !action ||
    action.kind !== conversion.kind ||
    !binding ||
    binding.kind !== "action" ||
    binding.actionId !== conversion.actionId
  ) {
    rejected.add("primary-conversion-mismatch");
  }
  const labelContent = binding?.kind === "action"
    ? fixture.pageIr.content.find((entry) => entry.id === binding.labelContentId)
    : undefined;
  if (
    !labelContent ||
    labelContent.kind !== "text" ||
    labelContent.text !== conversion.label
  ) {
    rejected.add("primary-conversion-label-mismatch");
  }
  const selection = fixture.pageIr.referenceContract.selection;
  const expectedReference = fixture.brief.referenceState;
  if (selection.mode !== expectedReference.mode) {
    rejected.add("reference-state-mismatch");
  } else if (
    selection.mode === "selected" &&
    expectedReference.mode === "selected" &&
    JSON.stringify(selection.sources.map((source) => source.id)) !==
      JSON.stringify(expectedReference.sourceAliases)
  ) {
    rejected.add("reference-source-mismatch");
  } else if (
    selection.mode === "explicit-none" &&
    expectedReference.mode === "explicit-none" &&
    selection.reason !== expectedReference.reason
  ) {
    rejected.add("reference-source-mismatch");
  }
  return [...rejected];
}

export function compilePageIrQualityFixture(
  fixture: PageIrQualityFixture,
): PageIrCompilationResultV1 {
  const rejections = evaluatePageIrQualityStructure(fixture);
  if (rejections.length > 0) {
    throw new Error(`quality fixture rejected: ${rejections.join(", ")}`);
  }
  return compilePageIRV1({ schemaVersion: 1, pageIr: fixture.pageIr, assets: [] });
}

export async function materializePageIrQualityFixture(
  fixtureId: PagePurposeV1,
  siteRoot: string,
  fixturesRoot = DEFAULT_FIXTURES_ROOT,
) {
  const fixture = await loadPageIrQualityFixture(fixtureId, fixturesRoot);
  const compilation = compilePageIrQualityFixture(fixture);
  await mkdir(siteRoot, { recursive: true });
  for (const file of compilation.files) {
    const destination = path.join(siteRoot, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.bytes, { flag: "wx" });
  }
  await writeFile(path.join(siteRoot, "candidate-manifest.json"), compilation.manifestBytes, { flag: "wx" });
  return { fixture, compilation, siteRoot };
}
