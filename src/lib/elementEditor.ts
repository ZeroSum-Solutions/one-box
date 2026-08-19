import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { z } from "zod";
import { inventoryFromHtml } from "./assistant";
import {
  atomicWrite,
  assertSafeRunId,
  runGuardedMutation,
  type GateRunner,
} from "./siteMutation";

const TypographyPatchSchema = z
  .object({
    fontFamily: z.enum(["inherit", "display", "body"]).optional(),
    fontSize: z
      .enum([
        "inherit",
        "caption",
        "body-sm",
        "body",
        "body-lg",
        "heading-sm",
        "heading",
        "heading-lg",
        "display",
      ])
      .optional(),
    weight: z.enum(["inherit", "400", "600", "700"]).optional(),
    color: z.enum(["inherit", "text", "muted", "primary", "accent"]).optional(),
    alignment: z.enum(["inherit", "left", "center", "right"]).optional(),
  })
  .strict();

export const ElementPatchSchema = z
  .object({
    text: z.string().max(4000).optional(),
    href: z.string().max(500).optional(),
    typography: TypographyPatchSchema.optional(),
    buttonAction: z
      .object({
        type: z.enum(["none", "scroll", "submit"]),
        target: z.string().max(100).optional(),
      })
      .strict()
      .optional(),
    move: z.enum(["previous", "next"]).optional(),
  })
  .strict()
  .refine(
    (patch) =>
      patch.text !== undefined ||
      patch.href !== undefined ||
      patch.typography !== undefined ||
      patch.buttonAction !== undefined ||
      patch.move !== undefined,
    "at least one structured field is required",
  );
export type ElementPatch = z.infer<typeof ElementPatchSchema>;

export const ElementMutationRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("apply"),
    runId: z.string(),
    editId: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/i),
    patch: ElementPatchSchema,
  }).strict(),
  z.object({ action: z.enum(["undo", "redo"]), runId: z.string() }).strict(),
]);

const ElementHistoryEntrySchema = z.object({
  id: z.string(),
  editId: z.string(),
  previousHtml: z.string(),
  nextHtml: z.string(),
  at: z.string(),
});
const ElementHistorySchema = z.object({
  version: z.literal(1),
  entries: z.array(ElementHistoryEntrySchema),
  cursor: z.number().int().nonnegative(),
});
type ElementHistory = z.infer<typeof ElementHistorySchema>;

export class ElementEditError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ElementEditError";
    this.status = status;
  }
}

// Statically scoped production root keeps Next/Turbopack file tracing bounded
// to generated sites. Tests may inject an isolated root through options.
const SITES_ROOT = path.join(process.cwd(), "sites");

const TYPOGRAPHY_VALUES = {
  fontFamily: {
    inherit: null,
    display: "var(--font-display)",
    body: "var(--font-body)",
  },
  fontSize: {
    inherit: null,
    caption: "var(--text-caption)",
    "body-sm": "var(--text-body-sm)",
    body: "var(--text-body)",
    "body-lg": "var(--text-body-lg)",
    "heading-sm": "var(--text-heading-sm)",
    heading: "var(--text-heading)",
    "heading-lg": "var(--text-heading-lg)",
    display: "var(--text-display)",
  },
  weight: { inherit: null, "400": "400", "600": "600", "700": "700" },
  color: {
    inherit: null,
    text: "var(--color-text)",
    muted: "var(--color-text-muted)",
    primary: "var(--color-primary-text)",
    accent: "var(--color-accent)",
  },
  alignment: { inherit: null, left: "left", center: "center", right: "right" },
} as const;

const CSS_PROPERTIES = {
  fontFamily: "font-family",
  fontSize: "font-size",
  weight: "font-weight",
  color: "color",
  alignment: "text-align",
} as const;

function parseStyle(style: string | undefined): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const part of (style ?? "").split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const property = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (property && value) declarations.set(property, value);
  }
  return declarations;
}

function serializeStyle(declarations: Map<string, string>): string | undefined {
  if (declarations.size === 0) return undefined;
  return [...declarations]
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ");
}

function setDirectText(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<Element>,
  value: string,
) {
  const descendantEditIds = element.find("[data-edit-id]");
  if (descendantEditIds.length > 0) {
    throw new ElementEditError(
      "text edits cannot replace nested editable elements",
      409,
    );
  }
  let replaced = false;
  element.contents().each((_, node) => {
    if (node.type !== "text") return;
    if (!replaced) {
      node.data = value;
      replaced = true;
    } else {
      $(node).remove();
    }
  });
  if (!replaced) element.text(value);
}

function validateHref($: cheerio.CheerioAPI, href: string): string {
  const normalized = href.trim();
  if (normalized.startsWith("#")) {
    const id = normalized.slice(1);
    if (
      !/^[a-z][a-z0-9:_-]{0,79}$/i.test(id) ||
      $(`[id="${id}"]`).length !== 1
    ) {
      throw new ElementEditError(
        "internal destination must name one existing page anchor",
      );
    }
    return normalized;
  }
  if (/^tel:\+?[0-9() .-]{3,30}$/i.test(normalized)) return normalized;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalized)) return normalized;
  try {
    const url = new URL(normalized);
    if (url.protocol === "https:") return url.toString();
  } catch {
    // Report the same bounded error below.
  }
  throw new ElementEditError(
    "destination must be an existing #anchor, tel:, mailto:, or https URL",
  );
}

const BUTTON_ACTION_RUNTIME = `(function(){document.addEventListener("click",function(event){var button=event.target&&event.target.closest&&event.target.closest("button[data-onebox-action]");if(!button)return;var action=button.getAttribute("data-onebox-action");if(action==="scroll"){event.preventDefault();var id=button.getAttribute("data-onebox-target");var target=id&&document.getElementById(id);if(target)target.scrollIntoView();}else if(action==="none"){event.preventDefault();}},true);}());`;

function applyButtonAction(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<Element>,
  action: NonNullable<ElementPatch["buttonAction"]>,
) {
  if (!element.is("button"))
    throw new ElementEditError(
      "button actions are supported only for button elements",
    );
  element.attr("data-onebox-action", action.type);
  element.removeAttr("data-onebox-target");
  if (action.type === "scroll") {
    const target = action.target?.replace(/^#/, "") ?? "";
    if (
      !/^[a-z][a-z0-9:_-]{0,79}$/i.test(target) ||
      $(`[id="${target}"]`).length !== 1
    ) {
      throw new ElementEditError(
        "scroll action must target one existing page id",
      );
    }
    element.attr("type", "button");
    element.attr("data-onebox-target", target);
  } else if (action.type === "submit") {
    if (element.closest("form").length !== 1)
      throw new ElementEditError(
        "submit action requires the button to belong to one form",
      );
    element.attr("type", "submit");
  } else {
    element.attr("type", "button");
  }
  if ($("script[data-onebox-actions]").length === 0) {
    $("body").append(
      `<script data-onebox-actions>${BUTTON_ACTION_RUNTIME}</script>`,
    );
  }
}

function moveEditableSibling(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<Element>,
  direction: "previous" | "next",
) {
  // canvas-upgrade Wave 5, Play 7 (hazard). nav and footer sit directly
  // under <body>, alongside the skip-link and <main> -- neither of the
  // latter two is a content section, but the skip-link DOES carry its own
  // data-edit-id, so without this guard `nav`'s "previous" move would pass
  // moveEditableSibling's ordinary sibling check and swap places with it
  // (verified against the real template; <main> itself has no data-edit-id,
  // so nav/footer's OTHER direction was already refused by the plain
  // "no editable sibling" case below, but only by accident of that one
  // attribute being absent -- this makes the refusal deliberate and
  // consistent in both directions). Fixed page chrome is never a
  // reorderable section; content sections and nested list items, whose
  // parent is never <body>, are unaffected.
  if (element.parent().is("body")) {
    throw new ElementEditError(
      "this element is fixed page chrome and cannot be reordered",
      409,
    );
  }
  const sibling = direction === "previous" ? element.prev() : element.next();
  if (sibling.length !== 1 || !sibling.is("[data-edit-id]")) {
    throw new ElementEditError(
      `element has no editable ${direction} sibling`,
      409,
    );
  }
  if (direction === "previous") sibling.before(element);
  else sibling.after(element);
}

export function applyElementPatchToHtml(
  html: string,
  editId: string,
  rawPatch: ElementPatch,
): string {
  const patch = ElementPatchSchema.parse(rawPatch);
  const $ = cheerio.load(html);
  const matches = $("[data-edit-id]").filter(
    (_, element) => $(element).attr("data-edit-id") === editId,
  );
  if (matches.length !== 1)
    throw new ElementEditError(
      `edit id not found or ambiguous: ${editId}`,
      404,
    );
  const element = matches.first();

  if (patch.text !== undefined) setDirectText($, element, patch.text);
  if (patch.href !== undefined) {
    if (!element.is("a"))
      throw new ElementEditError("destinations are supported only for links");
    element.attr("href", validateHref($, patch.href));
  }
  if (patch.buttonAction) applyButtonAction($, element, patch.buttonAction);
  if (patch.move) moveEditableSibling($, element, patch.move);
  if (patch.typography) {
    const declarations = parseStyle(element.attr("style"));
    for (const [key, choice] of Object.entries(patch.typography) as Array<
      [keyof typeof TYPOGRAPHY_VALUES, string]
    >) {
      const property = CSS_PROPERTIES[key];
      const value = (TYPOGRAPHY_VALUES[key] as Record<string, string | null>)[
        choice
      ];
      if (value === undefined)
        throw new ElementEditError(`unsupported ${key} value`);
      if (value === null) declarations.delete(property);
      else declarations.set(property, value);
    }
    const style = serializeStyle(declarations);
    if (style) element.attr("style", style);
    else element.removeAttr("style");
  }
  return $.html();
}

function editorPaths(runId: string, testSitesRoot?: string) {
  const safeRunId = assertSafeRunId(runId);
  const root = testSitesRoot
    ? path.join(testSitesRoot, safeRunId)
    : path.join(/* turbopackIgnore: true */ SITES_ROOT, safeRunId);
  return {
    index: path.join(root, "site", "index.html"),
    history: path.join(root, "element-history.json"),
    gates: path.join(root, "gates.json"),
  };
}

async function readHistory(filePath: string): Promise<ElementHistory> {
  try {
    return ElementHistorySchema.parse(
      JSON.parse(await fs.readFile(filePath, "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, entries: [], cursor: 0 };
    }
    throw error;
  }
}

export interface ElementEditorOptions {
  sitesRoot?: string;
  gateRunner?: GateRunner;
}

export interface HtmlEditOptions extends ElementEditorOptions {
  snapshotPaths?: string[];
}

export async function elementHistoryState(
  runId: string,
  options: ElementEditorOptions = {},
) {
  const files = editorPaths(runId, options.sitesRoot);
  const history = await readHistory(files.history);
  return {
    canUndo: history.cursor > 0,
    canRedo: history.cursor < history.entries.length,
  };
}

/** The Layers/Navigator panel's data source (canvas-upgrade Wave 5, Play 6):
 * the live site's data-edit-id inventory, in DOM order, with the
 * depth/parentEditId assistant.ts's inventoryFromHtml() now also computes --
 * reusing that one walker rather than a second tree-builder. A site not yet
 * built (same ENOENT case elementHistoryState's readHistory absorbs) reads
 * as an empty tree, not an error -- there is nothing to browse yet. */
export async function elementTree(
  runId: string,
  options: ElementEditorOptions = {},
) {
  const files = editorPaths(runId, options.sitesRoot);
  let html: string;
  try {
    html = await fs.readFile(/* turbopackIgnore: true */ files.index, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return inventoryFromHtml(html);
}

export async function applyStructuredElementEdit(
  runId: string,
  editId: string,
  patch: ElementPatch,
  options: ElementEditorOptions = {},
) {
  return applyElementHtmlEdit(
    runId,
    editId,
    (previousHtml) => applyElementPatchToHtml(previousHtml, editId, patch),
    options,
  );
}

/** Serializes every editor mutation through one history and blocking-gate transaction. */
export async function applyElementHtmlEdit(
  runId: string,
  editId: string,
  transform: (previousHtml: string) => Promise<string> | string,
  options: HtmlEditOptions = {},
) {
  const files = editorPaths(runId, options.sitesRoot);
  const result = await runGuardedMutation({
    runId,
    snapshotPaths: [
      files.index,
      files.history,
      files.gates,
      ...(options.snapshotPaths ?? []),
    ],
    gateRunner: options.gateRunner,
    mutate: async () => {
      const [previousHtml, history] = await Promise.all([
        fs
          .readFile(/* turbopackIgnore: true */ files.index, "utf8")
          .catch(() => {
            throw new ElementEditError("site not built", 404);
          }),
        readHistory(files.history),
      ]);
      const nextHtml = await transform(previousHtml);
      if (nextHtml === previousHtml)
        throw new ElementEditError(
          "edit did not change the selected element",
          409,
        );
      const nextHistory: ElementHistory = {
        version: 1,
        entries: [
          ...history.entries.slice(0, history.cursor),
          {
            id: crypto.randomUUID(),
            editId,
            previousHtml,
            nextHtml,
            at: new Date().toISOString(),
          },
        ],
        cursor: history.cursor + 1,
      };
      await atomicWrite(files.index, nextHtml);
      return nextHistory;
    },
    commit: (committed) =>
      atomicWrite(files.history, `${JSON.stringify(committed, null, 2)}\n`),
  });
  return {
    canUndo: true,
    canRedo: false,
    gates: result.reports,
  };
}

export async function moveElementHistory(
  runId: string,
  action: "undo" | "redo",
  options: ElementEditorOptions = {},
) {
  const files = editorPaths(runId, options.sitesRoot);
  const result = await runGuardedMutation({
    runId,
    snapshotPaths: [files.index, files.history, files.gates],
    gateRunner: options.gateRunner,
    mutate: async () => {
      const history = await readHistory(files.history);
      if (action === "undo" && history.cursor === 0)
        throw new ElementEditError("nothing to undo", 409);
      if (action === "redo" && history.cursor >= history.entries.length)
        throw new ElementEditError("nothing to redo", 409);
      const entry =
        action === "undo"
          ? history.entries[history.cursor - 1]
          : history.entries[history.cursor];
      const html = action === "undo" ? entry.previousHtml : entry.nextHtml;
      const nextHistory = {
        ...history,
        cursor: history.cursor + (action === "undo" ? -1 : 1),
      };
      await atomicWrite(files.index, html);
      return nextHistory;
    },
    commit: (committed) =>
      atomicWrite(files.history, `${JSON.stringify(committed, null, 2)}\n`),
  });
  return {
    canUndo: result.value.cursor > 0,
    canRedo: result.value.cursor < result.value.entries.length,
    gates: result.reports,
  };
}
