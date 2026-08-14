import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { z } from "zod";
import {
  atomicWrite,
  assertSafeRunId,
  runGuardedMutation,
  type GateRunner,
} from "./siteMutation";

export const MotionPropertiesSchema = z
  .object({
    x: z.number().min(-2000).max(2000).optional(),
    y: z.number().min(-2000).max(2000).optional(),
    scale: z.number().min(0.1).max(4).optional(),
    rotation: z.number().min(-360).max(360).optional(),
    opacity: z.number().min(0).max(1).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "at least one motion property is required");

const motionDraftShape = {
    editId: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/i),
    kind: z.enum(["entrance", "exit", "hover", "scroll", "timeline"]),
    durationMs: z.number().int().min(50).max(5000),
    delayMs: z.number().int().min(0).max(5000),
    ease: z.enum([
      "none",
      "power1.out",
      "power2.out",
      "power3.out",
      "sine.inOut",
    ]),
    properties: MotionPropertiesSchema,
    trigger: z.enum(["load", "viewport", "hover", "manual"]),
    replay: z.enum(["once", "repeat"]),
    breakpoint: z.enum(["all", "mobile", "tablet", "desktop"]),
    scrub: z.boolean().optional(),
    timelineId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]{1,39}$/i)
      .optional(),
    order: z.number().int().min(0).max(50).optional(),
} as const;

function refineMotion(
  value: z.infer<z.ZodObject<typeof motionDraftShape>>,
  context: z.RefinementCtx,
) {
    if (value.kind === "hover" && value.trigger !== "hover") {
      context.addIssue({ code: "custom", path: ["trigger"], message: "hover motion requires the hover trigger" });
    }
    if (value.kind === "scroll" && value.trigger !== "viewport") {
      context.addIssue({ code: "custom", path: ["trigger"], message: "scroll motion requires the viewport trigger" });
    }
    if (value.kind === "exit" && value.trigger !== "manual") {
      context.addIssue({ code: "custom", path: ["trigger"], message: "exit motion is manual so content is never hidden unexpectedly" });
    }
    if (value.kind === "timeline" && (!value.timelineId || value.order === undefined)) {
      context.addIssue({ code: "custom", path: ["timelineId"], message: "timeline motion requires a group and order" });
    }
    if (value.kind !== "timeline" && (value.timelineId !== undefined || value.order !== undefined)) {
      context.addIssue({ code: "custom", path: ["timelineId"], message: "timeline fields are only allowed for timeline motion" });
    }
    if (value.scrub && value.kind !== "scroll") {
      context.addIssue({ code: "custom", path: ["scrub"], message: "scrub is only allowed for scroll motion" });
    }
}

export const MotionDraftSchema = z
  .object(motionDraftShape)
  .strict()
  .superRefine(refineMotion);

export const MotionEntrySchema = z
  .object({ ...motionDraftShape, id: z.string().uuid() })
  .strict()
  .superRefine(refineMotion);
export const MotionManifestSchema = z
  .object({ version: z.literal(1), entries: z.array(MotionEntrySchema).max(100) })
  .strict();

const MotionHistorySchema = z
  .object({
    version: z.literal(1),
    entries: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            previous: MotionManifestSchema,
            next: MotionManifestSchema,
            at: z.string(),
          })
          .strict(),
      )
      .max(50),
    cursor: z.number().int().nonnegative(),
  })
  .strict();

export type MotionDraft = z.infer<typeof MotionDraftSchema>;
export type MotionEntry = z.infer<typeof MotionEntrySchema>;
export type MotionManifest = z.infer<typeof MotionManifestSchema>;

export class MotionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MotionValidationError";
  }
}

function motionPaths(sitesRoot: string, runId: string) {
  const root = path.join(sitesRoot, assertSafeRunId(runId));
  return {
    html: path.join(root, "site", "index.html"),
    manifest: path.join(root, "site", "motion.json"),
    history: path.join(root, "motion-history.json"),
    gates: path.join(root, "gates.json"),
  };
}

async function readManifest(filePath: string): Promise<MotionManifest> {
  try {
    return MotionManifestSchema.parse(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, entries: [] };
    throw error;
  }
}

async function readHistory(filePath: string) {
  try {
    return MotionHistorySchema.parse(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return MotionHistorySchema.parse({ version: 1, entries: [], cursor: 0 });
    }
    throw error;
  }
}

function assertMotionTarget(html: string, editId: string): void {
  const $ = cheerio.load(html);
  const targets = $("[data-edit-id]").filter(
    (_, element) => $(element).attr("data-edit-id") === editId,
  );
  if (targets.length !== 1) {
    throw new MotionValidationError(`motion target not found or ambiguous: ${editId}`);
  }
  if (targets.is("canvas,iframe") || targets.find("canvas,iframe").length > 0) {
    throw new MotionValidationError("WebGL and embedded-frame targets are not motion-editable");
  }
}

function parseDraft(value: unknown): MotionDraft {
  const parsed = MotionDraftSchema.safeParse(value);
  if (!parsed.success) {
    throw new MotionValidationError(parsed.error.issues.map((issue) => issue.message).join("; "));
  }
  return parsed.data;
}

export interface MotionSiteOptions {
  sitesRoot?: string;
  gateRunner?: GateRunner;
}

export async function inspectSiteMotion(
  runId: string,
  editId?: string,
  options: MotionSiteOptions = {},
) {
  const files = motionPaths(options.sitesRoot ?? path.join(process.cwd(), "sites"), runId);
  const [manifest, history, html] = await Promise.all([
    readManifest(files.manifest),
    readHistory(files.history),
    fs.readFile(files.html, "utf8"),
  ]);
  const $ = cheerio.load(html);
  const availableEditIds = $("[data-edit-id]")
    .map((_, element) => $(element).attr("data-edit-id") ?? "")
    .get()
    .filter(Boolean)
    .sort();
  return {
    manifest,
    entries: editId
      ? manifest.entries.filter((entry) => entry.editId === editId)
      : manifest.entries,
    availableEditIds,
    canRevert: history.cursor > 0,
  };
}

export async function previewMotionEdit(
  runId: string,
  value: unknown,
  options: MotionSiteOptions = {},
) {
  const draft = parseDraft(value);
  const files = motionPaths(options.sitesRoot ?? path.join(process.cwd(), "sites"), runId);
  assertMotionTarget(await fs.readFile(files.html, "utf8"), draft.editId);
  return draft;
}

type MotionMutation =
  | { action: "apply"; draft: unknown }
  | { action: "remove"; editId: string; kind: MotionDraft["kind"] };

export async function mutateSiteMotion(
  runId: string,
  mutation: MotionMutation,
  options: MotionSiteOptions = {},
) {
  const files = motionPaths(options.sitesRoot ?? path.join(process.cwd(), "sites"), runId);
  const result = await runGuardedMutation({
    runId,
    snapshotPaths: [files.manifest, files.history, files.gates],
    gateRunner: options.gateRunner,
    mutate: async () => {
      const [manifest, history, html] = await Promise.all([
        readManifest(files.manifest),
        readHistory(files.history),
        fs.readFile(files.html, "utf8"),
      ]);
      let next: MotionManifest;
      if (mutation.action === "apply") {
        const draft = parseDraft(mutation.draft);
        assertMotionTarget(html, draft.editId);
        const existing = manifest.entries.find(
          (entry) =>
            entry.editId === draft.editId &&
            entry.kind === draft.kind &&
            (entry.timelineId ?? "") === (draft.timelineId ?? ""),
        );
        const entry = MotionEntrySchema.parse({ ...draft, id: existing?.id ?? randomUUID() });
        next = MotionManifestSchema.parse({
          version: 1,
          entries: [
            ...manifest.entries.filter((candidate) => candidate.id !== existing?.id),
            entry,
          ],
        });
      } else {
        if (!/^[a-z0-9][a-z0-9._-]{1,79}$/i.test(mutation.editId)) {
          throw new MotionValidationError("invalid motion target");
        }
        next = MotionManifestSchema.parse({
          version: 1,
          entries: manifest.entries.filter(
            (entry) => !(entry.editId === mutation.editId && entry.kind === mutation.kind),
          ),
        });
        if (next.entries.length === manifest.entries.length) {
          throw new MotionValidationError("motion configuration not found");
        }
      }
      const entry = {
        id: randomUUID(),
        previous: manifest,
        next,
        at: new Date().toISOString(),
      };
      const nextHistory = MotionHistorySchema.parse({
        version: 1,
        entries: [...history.entries.slice(0, history.cursor), entry].slice(-50),
        cursor: Math.min(history.cursor + 1, 50),
      });
      await atomicWrite(files.manifest, `${JSON.stringify(next, null, 2)}\n`);
      return nextHistory;
    },
    commit: (history) => atomicWrite(files.history, `${JSON.stringify(history, null, 2)}\n`),
  });
  return { ...(await inspectSiteMotion(runId, undefined, options)), gates: result.reports };
}

export async function revertSiteMotion(runId: string, options: MotionSiteOptions = {}) {
  const files = motionPaths(options.sitesRoot ?? path.join(process.cwd(), "sites"), runId);
  const result = await runGuardedMutation({
    runId,
    snapshotPaths: [files.manifest, files.history, files.gates],
    gateRunner: options.gateRunner,
    mutate: async () => {
      const history = await readHistory(files.history);
      if (history.cursor === 0) throw new MotionValidationError("no motion edit to revert");
      const previous = history.entries[history.cursor - 1].previous;
      await atomicWrite(files.manifest, `${JSON.stringify(previous, null, 2)}\n`);
      return MotionHistorySchema.parse({ ...history, cursor: history.cursor - 1 });
    },
    commit: (history) => atomicWrite(files.history, `${JSON.stringify(history, null, 2)}\n`),
  });
  return { ...(await inspectSiteMotion(runId, undefined, options)), gates: result.reports };
}
