export type PreviewMode = "view" | "edit";
export type WorkbenchSize = "normal" | "expanded" | "collapsed";
export type PreviewBreakpoint = "mobile" | "tablet" | "desktop";
export type EditorInteractionState =
  | "idle"
  | "selected"
  | "text-editing"
  | "dragging"
  | "unsupported";

export type SelectionBehavior =
  "text" | "interactive" | "safe-overlay" | "unsupported";

export interface PreviewSelection {
  editId: string;
  tag: string;
  text: string;
  behavior: SelectionBehavior;
  assetKind?: "image";
  href?: string;
  originalText?: string;
  typography?: {
    fontFamily?: "inherit" | "display" | "body";
    fontSize?:
      | "inherit"
      | "caption"
      | "body-sm"
      | "body"
      | "body-lg"
      | "heading-sm"
      | "heading"
      | "heading-lg"
      | "display";
    weight?: "inherit" | "400" | "600" | "700";
    color?: "inherit" | "text" | "muted" | "primary" | "accent";
    alignment?: "inherit" | "left" | "center" | "right";
  };
  buttonAction?: {
    type: "none" | "scroll" | "submit";
    target?: string;
    explicit: boolean;
  };
}

export interface EditorStateMessage {
  type: "onebox-editor-state";
  state: EditorInteractionState;
  selection: PreviewSelection | null;
  reason?: string;
}

export interface PersistedWorkbenchState {
  mode: PreviewMode;
  size: WorkbenchSize;
  lastOpenSize: Exclude<WorkbenchSize, "collapsed">;
  panelWidth: number;
  activeTool: string;
  previewPreset: PreviewBreakpoint | null;
}

const DEFAULT_PANEL_WIDTH = 360;
const DIVIDER_LAYOUT_WIDTH = 1;
const MAX_PANEL_WIDTH = 960;
const PREVIEW_SNAP_WIDTHS: Record<PreviewBreakpoint, number> = {
  mobile: 390,
  // Keep the named tablet width inside the existing <768 tablet boundary.
  tablet: 767,
  desktop: 1280,
};

export const DEFAULT_WORKBENCH_STATE: PersistedWorkbenchState = {
  mode: "edit",
  size: "normal",
  lastOpenSize: "normal",
  panelWidth: DEFAULT_PANEL_WIDTH,
  activeTool: "selection",
  previewPreset: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isSelection(value: unknown): value is PreviewSelection {
  if (!isRecord(value)) return false;
  const typographyValid =
    value.typography === undefined ||
    (isRecord(value.typography) &&
      hasOnlyKeys(value.typography, [
        "fontFamily",
        "fontSize",
        "weight",
        "color",
        "alignment",
      ]) &&
      (value.typography.fontFamily === undefined ||
        ["inherit", "display", "body"].includes(
          String(value.typography.fontFamily),
        )) &&
      (value.typography.fontSize === undefined ||
        [
          "inherit",
          "caption",
          "body-sm",
          "body",
          "body-lg",
          "heading-sm",
          "heading",
          "heading-lg",
          "display",
        ].includes(String(value.typography.fontSize))) &&
      (value.typography.weight === undefined ||
        ["inherit", "400", "600", "700"].includes(
          String(value.typography.weight),
        )) &&
      (value.typography.color === undefined ||
        ["inherit", "text", "muted", "primary", "accent"].includes(
          String(value.typography.color),
        )) &&
      (value.typography.alignment === undefined ||
        ["inherit", "left", "center", "right"].includes(
          String(value.typography.alignment),
        )));
  const actionValid =
    value.buttonAction === undefined ||
    (isRecord(value.buttonAction) &&
      hasOnlyKeys(value.buttonAction, ["type", "target", "explicit"]) &&
      ["none", "scroll", "submit"].includes(String(value.buttonAction.type)) &&
      typeof value.buttonAction.explicit === "boolean" &&
      (value.buttonAction.target === undefined ||
        (typeof value.buttonAction.target === "string" &&
          value.buttonAction.target.length <= 100)));
  return (
    hasOnlyKeys(value, [
      "editId",
      "tag",
      "text",
      "behavior",
      "assetKind",
      "href",
      "originalText",
      "typography",
      "buttonAction",
    ]) &&
    typeof value.editId === "string" &&
    /^[a-z0-9][a-z0-9._-]{1,79}$/i.test(value.editId) &&
    typeof value.tag === "string" &&
    /^[a-z][a-z0-9-]{0,31}$/.test(value.tag) &&
    typeof value.text === "string" &&
    value.text.length <= 4000 &&
    ["text", "interactive", "safe-overlay", "unsupported"].includes(
      String(value.behavior),
    ) &&
    (value.assetKind === undefined || value.assetKind === "image") &&
    (value.href === undefined ||
      (typeof value.href === "string" && value.href.length <= 500)) &&
    (value.originalText === undefined ||
      (typeof value.originalText === "string" &&
        value.originalText.length <= 4000)) &&
    typographyValid &&
    actionValid
  );
}

/** Parses the opaque iframe protocol without trusting arbitrary window data. */
export function readEditorStateMessage(
  data: unknown,
): EditorStateMessage | null {
  if (!isRecord(data)) return null;

  if (data.type !== "onebox-editor-state") return null;
  if (!hasOnlyKeys(data, ["type", "state", "selection", "reason"])) return null;
  if (
    ![
      "idle",
      "selected",
      "text-editing",
      "dragging",
      "unsupported",
    ].includes(String(data.state))
  ) {
    return null;
  }
  if (data.selection !== null && !isSelection(data.selection)) return null;
  if (data.state !== "idle" && data.selection === null) return null;
  if (
    data.reason !== undefined &&
    (typeof data.reason !== "string" || data.reason.length > 500)
  )
    return null;

  return data as unknown as EditorStateMessage;
}

export function isTrustedEditorMessage(
  source: MessageEventSource | null,
  iframeWindow: Window | null | undefined,
  data: unknown,
): boolean {
  return source === iframeWindow && readEditorStateMessage(data) !== null;
}

export function breakpointForWidth(width: number): PreviewBreakpoint {
  if (width < 480) return "mobile";
  if (width < 768) return "tablet";
  return "desktop";
}

export function clampPanelWidth(width: number, workspaceWidth: number): number {
  const { min, max } = panelWidthBounds(workspaceWidth);
  return Math.round(Math.min(Math.max(width, min), max));
}

export function panelWidthBounds(workspaceWidth: number): {
  min: number;
  max: number;
} {
  const min = Math.min(300, Math.max(220, workspaceWidth - 260));
  const max = Math.max(
    min,
    Math.min(MAX_PANEL_WIDTH, workspaceWidth - 260),
  );
  return { min, max };
}

export function panelWidthForBreakpoint(
  breakpoint: PreviewBreakpoint,
  workspaceWidth: number,
): number {
  const { min } = panelWidthBounds(workspaceWidth);
  if (breakpoint === "desktop") return min;
  return clampPanelWidth(
    workspaceWidth - DIVIDER_LAYOUT_WIDTH - PREVIEW_SNAP_WIDTHS[breakpoint],
    workspaceWidth,
  );
}

export function previewWidthForBreakpoint(
  breakpoint: PreviewBreakpoint,
): number {
  return PREVIEW_SNAP_WIDTHS[breakpoint];
}

export function nearestPreviewBreakpoint(
  panelWidth: number,
  workspaceWidth: number,
  threshold = 28,
): PreviewBreakpoint | null {
  const candidates: PreviewBreakpoint[] = ["desktop", "tablet", "mobile"];
  let nearest: { breakpoint: PreviewBreakpoint; distance: number } | null =
    null;

  for (const breakpoint of candidates) {
    const distance = Math.abs(
      panelWidth - panelWidthForBreakpoint(breakpoint, workspaceWidth),
    );
    if (!nearest || distance < nearest.distance) {
      nearest = { breakpoint, distance };
    }
  }

  return nearest && nearest.distance <= threshold ? nearest.breakpoint : null;
}

export function workbenchSizeForWidth(
  width: number,
): Exclude<WorkbenchSize, "collapsed"> {
  return width >= 520 ? "expanded" : "normal";
}

export function parseWorkbenchState(
  value: string | null,
): PersistedWorkbenchState {
  if (!value) return DEFAULT_WORKBENCH_STATE;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return DEFAULT_WORKBENCH_STATE;
    const mode =
      parsed.mode === "view" || parsed.mode === "edit" ? parsed.mode : "edit";
    const size = ["normal", "expanded", "collapsed"].includes(
      String(parsed.size),
    )
      ? (parsed.size as WorkbenchSize)
      : "normal";
    const panelWidth =
      typeof parsed.panelWidth === "number" &&
      Number.isFinite(parsed.panelWidth)
        ? Math.min(
            MAX_PANEL_WIDTH,
            Math.max(220, Math.round(parsed.panelWidth)),
          )
        : DEFAULT_PANEL_WIDTH;
    const lastOpenSize =
      parsed.lastOpenSize === "expanded" ||
      (parsed.lastOpenSize === undefined && size === "expanded")
        ? "expanded"
        : "normal";
    const activeTool =
      typeof parsed.activeTool === "string" ? parsed.activeTool : "selection";
    const previewPreset = ["mobile", "tablet", "desktop"].includes(
      String(parsed.previewPreset),
    )
      ? (parsed.previewPreset as PreviewBreakpoint)
      : null;
    return {
      mode,
      size,
      lastOpenSize,
      panelWidth,
      activeTool,
      previewPreset,
    };
  } catch {
    return DEFAULT_WORKBENCH_STATE;
  }
}

export function workbenchStorageKey(runId: string): string {
  return `onebox:preview-workbench:${runId}`;
}

export function restoreWorkbenchState(
  storage: Pick<Storage, "getItem">,
  runId: string,
): PersistedWorkbenchState {
  try {
    return parseWorkbenchState(storage.getItem(workbenchStorageKey(runId)));
  } catch {
    return DEFAULT_WORKBENCH_STATE;
  }
}

export function persistWorkbenchState(
  storage: Pick<Storage, "setItem">,
  runId: string,
  state: PersistedWorkbenchState,
): void {
  try {
    storage.setItem(workbenchStorageKey(runId), JSON.stringify(state));
  } catch {
    // Storage can be unavailable or full; persistence must remain best-effort.
  }
}

export function isWorkbenchStateRestoredForRun(
  restoredRunId: string | null,
  currentRunId: string,
): boolean {
  return restoredRunId === currentRunId;
}

/** Ignore edit/asset completions that resolve after client navigation. */
export function isRunBoundRequestCurrent(
  requestRunId: string,
  activeRunId: string,
): boolean {
  return requestRunId === activeRunId;
}
