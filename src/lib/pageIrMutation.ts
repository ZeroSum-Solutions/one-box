import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ActionV1Schema,
  PAGE_IR_BOUNDS,
  PageIRV1Schema,
  PageIrEditorIdSchema,
  PageIrEditorSourceMapV1Schema,
  PersistedPageIrV1Schema,
  RunIdSchema,
  type ActionV1,
  type GateReport,
  type PageIRV1,
  type PageIrEditorSourceMapV1,
  type PersistedPageIrV1,
} from "./contracts";
import {
  inspectCandidate,
  inspectPromotedLiveBundle,
  preparePageIrEditJournalUnderSiteAuthority,
  promoteCandidateUnderSiteAuthority,
  recoverPageIrEditTransactionUnderSiteAuthority,
} from "./candidate";
import { gateBuiltCandidateUnderSiteAuthority } from "./builder";
import type { ElementPatch } from "./elementEditor";
import { pageIrSha256 } from "./pageIrHash";
import {
  loadPersistedPageIr,
  materializePageIrCandidateUnderSiteAuthority,
} from "./pageIrPipeline";
import {
  derivePageIrAssetSourcesUnderSiteAuthority,
  type PageIrAssetAuthority,
  writePageIrFallbackAssetsUnderSiteAuthority,
} from "./pageIrAssets";
import {
  assertRunLayoutAuthority,
  candidatePaths,
  loadRun,
  pageIrPaths,
  sitePaths,
} from "./runstate";
import {
  assertSiteAuthorityHeld,
  resolveSiteAuthorityWriteTarget,
  withSiteAuthorityLock,
} from "./siteAuthority";
import { readOptionalBoundedAuthorityFile } from "./authorityFile";

const ReplaceTextMutationV1Schema = z
  .object({
    kind: z.literal("replace-text"),
    editId: PageIrEditorIdSchema,
    text: z.string().max(PAGE_IR_BOUNDS.maxTextLength),
  })
  .strict();

const SetDestinationMutationV1Schema = z
  .object({
    kind: z.literal("set-destination"),
    editId: PageIrEditorIdSchema,
    href: z.string().max(PAGE_IR_BOUNDS.maxUrlLength),
  })
  .strict();

const MoveSiblingMutationV1Schema = z
  .object({
    kind: z.literal("move-sibling"),
    editId: PageIrEditorIdSchema,
    direction: z.enum(["previous", "next"]),
  })
  .strict();

export const PageIrMutationV1Schema = z.discriminatedUnion("kind", [
  ReplaceTextMutationV1Schema,
  SetDestinationMutationV1Schema,
  MoveSiblingMutationV1Schema,
]);
export type PageIrMutationV1 = z.infer<typeof PageIrMutationV1Schema>;

export const PageIrEditRequestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    runId: RunIdSchema,
    mutations: z.array(PageIrMutationV1Schema).min(1).max(8),
  })
  .strict();
export type PageIrEditRequestV1 = z.infer<typeof PageIrEditRequestV1Schema>;

export class PageIrMutationUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageIrMutationUnsupportedError";
  }
}

function unsupported(message: string): never {
  throw new PageIrMutationUnsupportedError(message);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateAuthority(
  rawEnvelope: PersistedPageIrV1,
  rawSourceMap: PageIrEditorSourceMapV1,
) {
  const envelope = PersistedPageIrV1Schema.parse(rawEnvelope);
  const sourceMap = PageIrEditorSourceMapV1Schema.parse(rawSourceMap);
  const actualPageIrSha256 = pageIrSha256(envelope.pageIr);
  if (envelope.pageIrSha256 !== actualPageIrSha256) {
    unsupported("persisted Page IR hash does not match its validated payload");
  }
  if (sourceMap.pageIrSha256 !== envelope.pageIrSha256) {
    unsupported("Page IR editor source map is stale for the persisted payload");
  }
  if (sourceMap.bindingSetSha256 !== envelope.bindingSetSha256) {
    unsupported("Page IR editor source map binding set does not match the persisted payload");
  }
  if (!sameValue(sourceMap.lineage, envelope.lineage)) {
    unsupported("Page IR editor source map lineage does not match the persisted payload");
  }
  return { envelope, sourceMap };
}

function nodeIdForEditId(
  sourceMap: PageIrEditorSourceMapV1,
  editId: string,
): string {
  const matches = sourceMap.entries.filter((entry) => entry.editId === editId);
  if (matches.length !== 1) {
    return unsupported("edit ID is not represented exactly once in the Page IR editor source map");
  }
  return matches[0].nodeId;
}

function bindingForNode(pageIr: PageIRV1, nodeId: string) {
  const matches = pageIr.slotBindings.filter((binding) => binding.nodeId === nodeId);
  if (matches.length !== 1) {
    return unsupported("edited Page IR node does not have exactly one slot binding");
  }
  return matches[0];
}

function replaceText(
  pageIr: PageIRV1,
  sourceMap: PageIrEditorSourceMapV1,
  mutation: z.infer<typeof ReplaceTextMutationV1Schema>,
): PageIrMutationV1 {
  const nodeId = nodeIdForEditId(sourceMap, mutation.editId);
  const node = pageIr.layoutProgram.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== "slot") {
    return unsupported("text editing is not represented for Page IR container nodes");
  }
  if (node.slotType === "list" || node.slotType === "media") {
    return unsupported(`text editing is not represented for Page IR ${node.slotType} slots`);
  }
  const binding = bindingForNode(pageIr, nodeId);
  const contentId = binding.kind === "action"
    ? binding.labelContentId
    : binding.kind === "heading" || binding.kind === "text"
      ? binding.contentId
      : undefined;
  if (!contentId) {
    return unsupported("text editing is not represented for this Page IR slot");
  }
  const content = pageIr.content.find((entry) => entry.id === contentId);
  if (!content || content.kind === "list") {
    return unsupported("text editing requires bound heading, text, or action-label content");
  }
  const previous = content.text;
  content.text = mutation.text;
  return { kind: "replace-text", editId: mutation.editId, text: previous };
}

function destinationAction(actionId: string, href: string): ActionV1 {
  if (href.startsWith("#")) {
    return ActionV1Schema.parse({
      id: actionId,
      kind: "scroll-to",
      targetNodeId: href.slice(1),
    });
  }
  if (href.startsWith("tel:")) {
    return ActionV1Schema.parse({ id: actionId, kind: "call", phone: href.slice(4) });
  }
  if (href.startsWith("mailto:")) {
    return ActionV1Schema.parse({ id: actionId, kind: "email", email: href.slice(7) });
  }
  return ActionV1Schema.parse({ id: actionId, kind: "external", href });
}

function actionDestination(action: ActionV1): string {
  switch (action.kind) {
    case "scroll-to":
      return `#${action.targetNodeId}`;
    case "call":
      return `tel:${action.phone}`;
    case "email":
      return `mailto:${action.email}`;
    case "external":
      return action.href;
  }
}

function setDestination(
  pageIr: PageIRV1,
  sourceMap: PageIrEditorSourceMapV1,
  mutation: z.infer<typeof SetDestinationMutationV1Schema>,
): PageIrMutationV1 {
  const nodeId = nodeIdForEditId(sourceMap, mutation.editId);
  const node = pageIr.layoutProgram.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== "slot" || node.slotType !== "action") {
    return unsupported("destinations are represented only for Page IR action slots");
  }
  const binding = bindingForNode(pageIr, nodeId);
  if (binding.kind !== "action") {
    return unsupported("destination editing requires a Page IR action binding");
  }
  const actionIndex = pageIr.actions.findIndex((action) => action.id === binding.actionId);
  if (actionIndex < 0) {
    return unsupported("destination editing requires a bound Page IR action");
  }
  const previous = actionDestination(pageIr.actions[actionIndex]);
  pageIr.actions[actionIndex] = destinationAction(binding.actionId, mutation.href);
  return { kind: "set-destination", editId: mutation.editId, href: previous };
}

function moveSibling(
  pageIr: PageIRV1,
  sourceMap: PageIrEditorSourceMapV1,
  mutation: z.infer<typeof MoveSiblingMutationV1Schema>,
): PageIrMutationV1 {
  const nodeId = nodeIdForEditId(sourceMap, mutation.editId);
  if (!pageIr.layoutProgram.nodes.some((node) => node.id === nodeId)) {
    return unsupported("edited node is missing from the Page IR layout program");
  }
  const parents: Array<{ childIds: string[] }> = [];
  for (const node of pageIr.layoutProgram.nodes) {
    if ("childIds" in node && node.childIds.includes(nodeId)) parents.push(node);
  }
  if (parents.length !== 1) {
    return unsupported("sibling movement requires exactly one Page IR parent");
  }
  const siblings = parents[0].childIds;
  const currentIndex = siblings.indexOf(nodeId);
  const nextIndex = currentIndex + (mutation.direction === "next" ? 1 : -1);
  if (nextIndex < 0 || nextIndex >= siblings.length) {
    return unsupported("sibling movement cannot cross a Page IR parent boundary");
  }
  [siblings[currentIndex], siblings[nextIndex]] = [siblings[nextIndex], siblings[currentIndex]];
  return {
    kind: "move-sibling",
    editId: mutation.editId,
    direction: mutation.direction === "next" ? "previous" : "next",
  };
}

export function applyPageIrMutationsToEnvelope(
  rawEnvelope: PersistedPageIrV1,
  rawSourceMap: PageIrEditorSourceMapV1,
  rawMutations: readonly PageIrMutationV1[],
): { envelope: PersistedPageIrV1; inverse: PageIrMutationV1[] } {
  const { envelope, sourceMap } = validateAuthority(rawEnvelope, rawSourceMap);
  const mutations = z.array(PageIrMutationV1Schema).min(1).max(8).parse(rawMutations);
  const pageIr = PageIRV1Schema.parse(envelope.pageIr);
  const inverse: PageIrMutationV1[] = [];
  for (const mutation of mutations) {
    const undo = mutation.kind === "replace-text"
      ? replaceText(pageIr, sourceMap, mutation)
      : mutation.kind === "set-destination"
        ? setDestination(pageIr, sourceMap, mutation)
        : moveSibling(pageIr, sourceMap, mutation);
    inverse.unshift(undo);
  }
  const validatedPageIr = PageIRV1Schema.parse(pageIr);
  const updated = PersistedPageIrV1Schema.parse({
    ...envelope,
    revision: envelope.revision + 1,
    pageIr: validatedPageIr,
    pageIrSha256: pageIrSha256(validatedPageIr),
  });
  return { envelope: updated, inverse };
}

export function pageIrMutationsFromElementPatch(
  editId: string,
  rawPatch: ElementPatch,
): PageIrMutationV1[] {
  const parsedEditId = PageIrEditorIdSchema.parse(editId);
  if (rawPatch.typography !== undefined) {
    return unsupported("typography is not represented by the supported Page IR edit capabilities");
  }
  if (rawPatch.buttonAction?.type === "submit" || rawPatch.buttonAction?.type === "none") {
    return unsupported(`${rawPatch.buttonAction.type} button actions are not represented in Page IR v1`);
  }
  const mutations: PageIrMutationV1[] = [];
  if (rawPatch.text !== undefined) {
    mutations.push({ kind: "replace-text", editId: parsedEditId, text: rawPatch.text });
  }
  if (rawPatch.href !== undefined) {
    mutations.push({ kind: "set-destination", editId: parsedEditId, href: rawPatch.href });
  }
  if (rawPatch.buttonAction?.type === "scroll") {
    const target = rawPatch.buttonAction.target;
    if (!target) return unsupported("scroll button actions require a represented Page IR target");
    mutations.push({
      kind: "set-destination",
      editId: parsedEditId,
      href: target.startsWith("#") ? target : `#${target}`,
    });
  }
  if (rawPatch.move !== undefined) {
    mutations.push({ kind: "move-sibling", editId: parsedEditId, direction: rawPatch.move });
  }
  if (mutations.length === 0) {
    return unsupported("element patch contains no capability represented in Page IR v1");
  }
  return z.array(PageIrMutationV1Schema).parse(mutations);
}

const PageIrEditHistoryEntryV1Schema = z
  .object({
    beforePageIrSha256: z.string().regex(/^[a-f0-9]{64}$/),
    afterPageIrSha256: z.string().regex(/^[a-f0-9]{64}$/),
    forward: z.array(PageIrMutationV1Schema).min(1).max(8),
    inverse: z.array(PageIrMutationV1Schema).min(1).max(8),
  })
  .strict();

export const PageIrEditHistoryV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.array(PageIrEditHistoryEntryV1Schema).max(50),
    cursor: z.number().int().nonnegative().max(50),
  })
  .strict()
  .superRefine((history, context) => {
    if (history.cursor > history.entries.length) {
      context.addIssue({
        code: "custom",
        path: ["cursor"],
        message: "Page IR edit-history cursor exceeds the bounded entry list",
      });
    }
    for (let index = 1; index < history.entries.length; index += 1) {
      if (
        history.entries[index - 1].afterPageIrSha256 !==
        history.entries[index].beforePageIrSha256
      ) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "beforePageIrSha256"],
          message: "Page IR edit history must form one continuous hash chain",
        });
      }
    }
  });
export type PageIrEditHistoryV1 = z.infer<typeof PageIrEditHistoryV1Schema>;

export class PageIrMutationRejectedError extends Error {
  readonly reports: GateReport[];

  constructor(
    message = "Page IR mutation was rejected by candidate gates",
    reports: readonly GateReport[] = [],
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "PageIrMutationRejectedError";
    this.reports = [...reports];
  }
}

export interface PageIrEditTransactionResult {
  revision: number;
  pageIrSha256: string;
  reports: GateReport[];
  canUndo: boolean;
  canRedo: boolean;
  buildSha256: string;
  candidateManifestSha256: string;
  gateReportSha256: string;
}

type OptionalFileSnapshot =
  | { present: false }
  | { present: true; bytes: Buffer };

const EMPTY_HISTORY: PageIrEditHistoryV1 = {
  schemaVersion: 1,
  entries: [],
  cursor: 0,
};

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readOptionalRegularFile(
  filePath: string,
  maxBytes = 5 * 1024 * 1024,
): Promise<OptionalFileSnapshot> {
  const bytes = await readOptionalBoundedAuthorityFile(
    filePath,
    maxBytes,
    "Page IR transaction input",
  );
  return bytes === undefined ? { present: false } : { present: true, bytes };
}

async function atomicWriteUnderAuthority(
  runId: string,
  filePath: string,
  bytes: Uint8Array,
): Promise<void> {
  assertSiteAuthorityHeld(runId);
  const target = await resolveSiteAuthorityWriteTarget(filePath);
  const parent = path.dirname(target);
  await fs.mkdir(parent, { recursive: true });
  const temporary = path.join(
    parent,
    `.${path.basename(target)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    const handle = await fs.open(temporary, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, target);
    await syncDirectory(parent);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function historyForEnvelope(
  history: PageIrEditHistoryV1,
  envelope: PersistedPageIrV1,
): void {
  if (history.entries.length === 0) return;
  const expected = history.cursor === 0
    ? history.entries[0].beforePageIrSha256
    : history.entries[history.cursor - 1].afterPageIrSha256;
  if (expected !== envelope.pageIrSha256) {
    unsupported("Page IR edit history does not match the authoritative persisted revision");
  }
}

function parseHistory(
  snapshot: OptionalFileSnapshot,
  envelope: PersistedPageIrV1,
): PageIrEditHistoryV1 {
  if (!snapshot.present) return PageIrEditHistoryV1Schema.parse(EMPTY_HISTORY);
  let raw: unknown;
  try {
    raw = JSON.parse(snapshot.bytes.toString("utf8"));
  } catch {
    return unsupported("Page IR edit history is not valid JSON");
  }
  const history = PageIrEditHistoryV1Schema.safeParse(raw);
  if (!history.success) return unsupported("Page IR edit history is not a valid bounded V1 record");
  historyForEnvelope(history.data, envelope);
  return history.data;
}

function assertCompleteSourceMap(
  envelope: PersistedPageIrV1,
  sourceMap: PageIrEditorSourceMapV1,
): void {
  validateAuthority(envelope, sourceMap);
  const expected = envelope.pageIr.layoutProgram.nodes
    .map((node) => ({ editId: node.id, nodeId: node.id }))
    .sort((left, right) =>
      left.editId < right.editId ? -1 : left.editId > right.editId ? 1 : 0,
    );
  if (!sameValue(sourceMap.entries, expected)) {
    unsupported("promoted Page IR editor source map does not cover the exact layout program");
  }
}

type PromotedEditAuthority = {
  sourceMap: PageIrEditorSourceMapV1;
} & PageIrAssetAuthority;

async function loadPromotedEditAuthority(
  runId: string,
  envelope: PersistedPageIrV1,
): Promise<PromotedEditAuthority> {
  const [candidate, live] = await Promise.all([
    inspectCandidate(runId),
    inspectPromotedLiveBundle(runId),
  ]);
  if (
    candidate.status !== "present" ||
    !candidate.manifest ||
    candidate.provenance.state !== "promoted" ||
    candidate.provenance.layoutAuthority !== "page-ir-v1" ||
    !candidate.provenance.editorSourceMap
  ) {
    return unsupported("Page IR editing requires the exact current promoted Page IR candidate");
  }
  if (
    live.status !== "present" ||
    live.provenance.layoutAuthority !== "page-ir-v1" ||
    !live.provenance.editorSourceMap ||
    candidate.provenance.pageIrSha256 !== envelope.pageIrSha256 ||
    live.provenance.pageIrSha256 !== envelope.pageIrSha256 ||
    candidate.manifest.buildSha256 !== live.manifest.buildSha256 ||
    candidate.provenance.promotedBuildSha256 !== live.manifest.buildSha256 ||
    !sameValue(candidate.provenance, live.provenance) ||
    !sameValue(candidate.manifest, live.manifest)
  ) {
    return unsupported("persisted Page IR, promoted candidate, and canonical live bundle do not match");
  }
  assertCompleteSourceMap(envelope, candidate.provenance.editorSourceMap);
  assertCompleteSourceMap(envelope, live.provenance.editorSourceMap);
  return {
    sourceMap: candidate.provenance.editorSourceMap,
    inputArtifactHashes: candidate.provenance.inputArtifactHashes,
    manifest: candidate.manifest,
  };
}

type PreparedHistoryMutation = {
  nextEnvelope: PersistedPageIrV1;
  nextHistory: PageIrEditHistoryV1;
};

type HistoryOperation =
  | { kind: "append"; mutations: PageIrMutationV1[] }
  | { kind: "move"; direction: "undo" | "redo" };

function prepareHistoryMutation(
  envelope: PersistedPageIrV1,
  sourceMap: PageIrEditorSourceMapV1,
  history: PageIrEditHistoryV1,
  operation: HistoryOperation,
): PreparedHistoryMutation {
  if (operation.kind === "append") {
    const applied = applyPageIrMutationsToEnvelope(
      envelope,
      sourceMap,
      operation.mutations,
    );
    let entries = [
      ...history.entries.slice(0, history.cursor),
      {
        beforePageIrSha256: envelope.pageIrSha256,
        afterPageIrSha256: applied.envelope.pageIrSha256,
        forward: operation.mutations,
        inverse: applied.inverse,
      },
    ];
    if (entries.length > 50) entries = entries.slice(entries.length - 50);
    return {
      nextEnvelope: applied.envelope,
      nextHistory: PageIrEditHistoryV1Schema.parse({
        schemaVersion: 1,
        entries,
        cursor: entries.length,
      }),
    };
  }

  if (operation.direction === "undo") {
    if (history.cursor === 0) return unsupported("Page IR edit history has nothing to undo");
    const entry = history.entries[history.cursor - 1];
    const applied = applyPageIrMutationsToEnvelope(envelope, sourceMap, entry.inverse);
    if (applied.envelope.pageIrSha256 !== entry.beforePageIrSha256) {
      return unsupported("Page IR undo did not restore the exact recorded payload");
    }
    return {
      nextEnvelope: applied.envelope,
      nextHistory: PageIrEditHistoryV1Schema.parse({
        ...history,
        cursor: history.cursor - 1,
      }),
    };
  }

  if (history.cursor >= history.entries.length) {
    return unsupported("Page IR edit history has nothing to redo");
  }
  const entry = history.entries[history.cursor];
  const applied = applyPageIrMutationsToEnvelope(envelope, sourceMap, entry.forward);
  if (applied.envelope.pageIrSha256 !== entry.afterPageIrSha256) {
    return unsupported("Page IR redo did not restore the exact recorded payload");
  }
  return {
    nextEnvelope: applied.envelope,
    nextHistory: PageIrEditHistoryV1Schema.parse({
      ...history,
      cursor: history.cursor + 1,
    }),
  };
}

async function executePageIrEditTransaction(
  runId: string,
  operation: HistoryOperation,
): Promise<PageIrEditTransactionResult> {
  return withSiteAuthorityLock(runId, async () => {
    const run = await loadRun(runId);
    assertRunLayoutAuthority(run, "page-ir-v1", "Page IR edit transaction");
    const envelope = await loadPersistedPageIr(runId);
    const authority = await loadPromotedEditAuthority(runId, envelope);
    const files = pageIrPaths(runId);
    const historyPath = path.join(sitePaths(runId).root, "page-ir-edit-history.json");
    const [pageIrBefore, historyBefore] = await Promise.all([
      readOptionalRegularFile(files.pageIr),
      readOptionalRegularFile(historyPath),
    ]);
    if (!pageIrBefore.present) {
      throw new Error("authoritative persisted Page IR file is missing");
    }
    const history = parseHistory(historyBefore, envelope);
    const prepared = prepareHistoryMutation(
      envelope,
      authority.sourceMap,
      history,
      operation,
    );
    const assetPlan = await derivePageIrAssetSourcesUnderSiteAuthority(runId, envelope, authority);
    const fallbackSnapshots = new Map<string, OptionalFileSnapshot>();
    for (const fallback of assetPlan.fallbackWrites) {
      fallbackSnapshots.set(fallback.path, await readOptionalRegularFile(fallback.path, PAGE_IR_BOUNDS.maxAssetBytes));
    }

    const candidateRoot = candidatePaths(runId).root;
    const nextPageIrBytes = jsonBytes(prepared.nextEnvelope);
    const nextHistoryBytes = jsonBytes(prepared.nextHistory);
    const runRoot = sitePaths(runId).root;
    const journal = await preparePageIrEditJournalUnderSiteAuthority({
      runId,
      nextPageIrSha256: prepared.nextEnvelope.pageIrSha256,
      files: [
        { relativePath: "page-ir.json", before: pageIrBefore.bytes, after: nextPageIrBytes },
        {
          relativePath: "page-ir-edit-history.json",
          before: historyBefore.present ? historyBefore.bytes : undefined,
          after: nextHistoryBytes,
        },
        ...assetPlan.fallbackWrites.map((fallback) => ({
          relativePath: path.relative(runRoot, fallback.path).split(path.sep).join("/"),
          before: fallbackSnapshots.get(fallback.path)?.present
            ? (fallbackSnapshots.get(fallback.path) as { present: true; bytes: Buffer }).bytes
            : undefined,
          after: fallback.bytes,
        })),
      ],
    });
    const retiredCandidateRoot = `${candidateRoot}.retired-${journal.token}`;
    let promoted = false;
    try {
      await fs.rename(candidateRoot, retiredCandidateRoot);
      await syncDirectory(path.dirname(candidateRoot));
      await atomicWriteUnderAuthority(runId, files.pageIr, nextPageIrBytes);
      await atomicWriteUnderAuthority(runId, historyPath, nextHistoryBytes);
      await writePageIrFallbackAssetsUnderSiteAuthority(runId, assetPlan.fallbackWrites);

      await materializePageIrCandidateUnderSiteAuthority({
        schemaVersion: 1,
        runId,
        assets: assetPlan.assets,
      });
      let disposition;
      try {
        disposition = await gateBuiltCandidateUnderSiteAuthority(runId);
      } catch (error) {
        throw new PageIrMutationRejectedError(
          "Page IR mutation gate execution failed",
          [],
          error,
        );
      }
      if (disposition.state !== "promotable") {
        throw new PageIrMutationRejectedError(
          "Page IR mutation was rejected by blocking candidate gates",
          disposition.receipt.reports,
        );
      }
      const promotion = await promoteCandidateUnderSiteAuthority(runId);
      promoted = true;
      const recovery = await recoverPageIrEditTransactionUnderSiteAuthority(runId);
      if (recovery !== "finalized") {
        throw new Error("promoted Page IR edit transaction did not finalize durably");
      }
      return {
        revision: prepared.nextEnvelope.revision,
        pageIrSha256: prepared.nextEnvelope.pageIrSha256,
        reports: [...disposition.receipt.reports],
        canUndo: prepared.nextHistory.cursor > 0,
        canRedo: prepared.nextHistory.cursor < prepared.nextHistory.entries.length,
        buildSha256: promotion.buildSha256,
        candidateManifestSha256: promotion.candidateManifestSha256,
        gateReportSha256: promotion.gateReportSha256,
      };
    } catch (error) {
      if (promoted) throw error;
      try {
        const recovery = await recoverPageIrEditTransactionUnderSiteAuthority(runId);
        if (recovery !== "rolled-back") throw new Error("Page IR edit rollback did not complete");
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          "Page IR mutation failed and authoritative rollback was incomplete",
        );
      }
      throw error;
    }
  });
}

export function applyPageIrEditTransaction(
  input: unknown,
): Promise<PageIrEditTransactionResult> {
  const request = PageIrEditRequestV1Schema.parse(input);
  return executePageIrEditTransaction(request.runId, {
    kind: "append",
    mutations: request.mutations,
  });
}

export function movePageIrEditHistory(
  rawRunId: string,
  direction: "undo" | "redo",
): Promise<PageIrEditTransactionResult> {
  const runId = RunIdSchema.parse(rawRunId);
  const parsedDirection = z.enum(["undo", "redo"]).parse(direction);
  return executePageIrEditTransaction(runId, {
    kind: "move",
    direction: parsedDirection,
  });
}

export function pageIrEditHistoryState(
  rawRunId: string,
): Promise<{ canUndo: boolean; canRedo: boolean }> {
  const runId = RunIdSchema.parse(rawRunId);
  return withSiteAuthorityLock(runId, async () => {
    const run = await loadRun(runId);
    assertRunLayoutAuthority(run, "page-ir-v1", "Page IR edit history read");
    const envelope = await loadPersistedPageIr(runId);
    const historyPath = path.join(sitePaths(runId).root, "page-ir-edit-history.json");
    const history = parseHistory(
      await readOptionalRegularFile(historyPath),
      envelope,
    );
    return {
      canUndo: history.cursor > 0,
      canRedo: history.cursor < history.entries.length,
    };
  });
}
