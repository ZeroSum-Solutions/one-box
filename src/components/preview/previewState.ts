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
  "text" | "interactive" | "safe-overlay" | "unsupported" | "container";

export interface PreviewSelection {
  editId: string;
  tag: string;
  text: string;
  behavior: SelectionBehavior;
  assetKind?: "image";
  href?: string;
  originalText?: string;
  /** Ancestor editIds, closest first (overlay.js selectionFor()). Powers the
   * breadcrumb strip (canvas-upgrade A3, Play 9) — every entry is itself a
   * selectable element, never a bare tag name. */
  parentChain?: string[];
  /** Whether a Move earlier/later action has a real target in that
   * direction — mirrors elementEditor.ts's own refusal rules (canvas-upgrade
   * Wave 5, Play 7), so ElementControls can disable a control that is
   * guaranteed to fail instead of letting the click round-trip to the
   * server to learn that. Absent only from a hand-built fixture (tests);
   * every real overlay.js selection sets it. */
  moveTargets?: { earlier: boolean; later: boolean };
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
  /** True while overlay.js holds a pending Select-Parent Escalation climb it
   * can still unwind (canvas-upgrade A3, Play 3) — drives the workbench's
   * "Back" control. */
  canStepBack?: boolean;
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
// Below this workspace width the preview and workbench can no longer share
// width without starving the generated site (see panelWidthBounds); the
// workbench renders as an overlay sheet instead (workbench.css) and starts
// collapsed (applyCompactDefault).
const COMPACT_WORKSPACE_THRESHOLD = 880;
const COMPACT_OVERLAY_MIN = 240;
const COMPACT_OVERLAY_MAX = 400;
const COMPACT_OVERLAY_MARGIN = 32;
const PREVIEW_SNAP_WIDTHS: Record<PreviewBreakpoint, number> = {
  mobile: 390,
  // Keep the named tablet width inside the existing <768 tablet boundary.
  tablet: 767,
  desktop: 1280,
};
// .preview-viewport pads the framed site on both sides (2 x --spacing-16,
// workbench.css) and .preview-frame itself carries a 1px border on both
// sides. Neither is visible to the generated site: only the space left
// over after both is what the iframe actually renders as window.innerWidth.
// panelWidthForBreakpoint must reserve this chrome on top of the named
// preset width, or the leftover .preview-viewport space equals the preset
// while the iframe itself renders preset-minus-chrome.
const PREVIEW_FRAME_PADDING = 16; // --spacing-16, one side
const PREVIEW_FRAME_BORDER = 1; // .preview-frame border-width, one side
const PREVIEW_FRAME_CHROME = 2 * (PREVIEW_FRAME_PADDING + PREVIEW_FRAME_BORDER);

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
  // Own shape validation, not a shared one -- the length cap exists so an
  // untrusted iframe payload cannot force the workbench to render (or this
  // guard to iterate) an unbounded ancestor trail.
  const parentChainValid =
    value.parentChain === undefined ||
    (Array.isArray(value.parentChain) &&
      value.parentChain.length <= 20 &&
      value.parentChain.every(
        (entry) =>
          typeof entry === "string" &&
          /^[a-z0-9][a-z0-9._-]{1,79}$/i.test(entry),
      ));
  const moveTargetsValid =
    value.moveTargets === undefined ||
    (isRecord(value.moveTargets) &&
      hasOnlyKeys(value.moveTargets, ["earlier", "later"]) &&
      typeof value.moveTargets.earlier === "boolean" &&
      typeof value.moveTargets.later === "boolean");
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
      "parentChain",
      "moveTargets",
    ]) &&
    typeof value.editId === "string" &&
    /^[a-z0-9][a-z0-9._-]{1,79}$/i.test(value.editId) &&
    typeof value.tag === "string" &&
    /^[a-z][a-z0-9-]{0,31}$/.test(value.tag) &&
    typeof value.text === "string" &&
    value.text.length <= 4000 &&
    ["text", "interactive", "safe-overlay", "unsupported", "container"].includes(
      String(value.behavior),
    ) &&
    (value.assetKind === undefined || value.assetKind === "image") &&
    (value.href === undefined ||
      (typeof value.href === "string" && value.href.length <= 500)) &&
    (value.originalText === undefined ||
      (typeof value.originalText === "string" &&
        value.originalText.length <= 4000)) &&
    typographyValid &&
    actionValid &&
    parentChainValid &&
    moveTargetsValid
  );
}

/** Parses the opaque iframe protocol without trusting arbitrary window data. */
export function readEditorStateMessage(
  data: unknown,
): EditorStateMessage | null {
  if (!isRecord(data)) return null;

  if (data.type !== "onebox-editor-state") return null;
  if (
    !hasOnlyKeys(data, [
      "type",
      "state",
      "selection",
      "reason",
      "canStepBack",
    ])
  )
    return null;
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
  if (data.canStepBack !== undefined && typeof data.canStepBack !== "boolean")
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

/** Below the compact threshold the workbench is an overlay sheet floating on
 * top of the (always full-width) preview, not a panel sharing space with it —
 * see the `@media (max-width: 879px)` block in workbench.css. */
export function isCompactWorkspace(workspaceWidth: number): boolean {
  return workspaceWidth < COMPACT_WORKSPACE_THRESHOLD;
}

export function panelWidthBounds(workspaceWidth: number): {
  min: number;
  max: number;
} {
  if (isCompactWorkspace(workspaceWidth)) {
    // An overlay's width is bounded by the viewport itself, not by how much
    // room the preview needs to keep — the old formula floored at 220px
    // regardless of viewport, which read as "more than half the screen" on
    // a phone-sized workspace once the panel shared space with the preview.
    const max = Math.max(
      COMPACT_OVERLAY_MIN,
      Math.min(COMPACT_OVERLAY_MAX, workspaceWidth - COMPACT_OVERLAY_MARGIN),
    );
    return { min: Math.min(COMPACT_OVERLAY_MIN, max), max };
  }
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
  // Reserve the frame chrome (padding + border) on top of the named preset
  // so the .preview-viewport space left over, once that chrome is
  // subtracted again inside the CSS box model, is exactly the preset width
  // -- what previewWidthForBreakpoint promises the generated site.
  return clampPanelWidth(
    workspaceWidth -
      DIVIDER_LAYOUT_WIDTH -
      PREVIEW_SNAP_WIDTHS[breakpoint] -
      PREVIEW_FRAME_CHROME,
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

/** A run restored on a compact workspace opens with the rail collapsed so the
 * preview keeps the full viewport — the workbench overlay is on-demand, not
 * persistent, below the compact threshold. Applied once at restore, not on
 * every resize, so a panel the user opened mid-session doesn't snap shut
 * under them on a minor viewport reflow. */
export function applyCompactDefault(
  state: PersistedWorkbenchState,
  workspaceWidth: number,
): PersistedWorkbenchState {
  if (!isCompactWorkspace(workspaceWidth) || state.size === "collapsed") {
    return state;
  }
  return {
    ...state,
    size: "collapsed",
    lastOpenSize: state.size === "expanded" ? "expanded" : "normal",
  };
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

/**
 * The persistent composer (canvas-upgrade Wave 3, Play 2) keeps one
 * instruction draft alive across tool switches so a half-typed prompt
 * survives navigating the panel. But that same persistence becomes a
 * silent-mistarget hazard the moment the SELECTION moves out from under an
 * unsent draft: text written with element A in mind must not go on to
 * describe a change for element B just because the user clicked B before
 * sending. Compare editIds, not selection object identity or contents --
 * the same element re-selected (or a text/metadata update on the same
 * element) must not nuke a draft the user is still typing.
 */
export function didComposerTargetChange(
  previousEditId: string | null,
  nextEditId: string | null,
): boolean {
  return previousEditId !== nextEditId;
}
