"use client";

import type { PointerEvent } from "react";
import { ChatComposer } from "@/components/ChatComposer";
import { GateStrip } from "@/components/GateStrip";
import { AssetControls } from "./AssetControls";
import { ElementControls } from "./ElementControls";
import { MotionControls } from "./MotionControls";
import { ResearchFindings } from "./ResearchFindings";
import { TokenControls } from "./TokenControls";
import type {
  EditorInteractionState,
  PreviewMode,
  PreviewBreakpoint,
  PreviewSelection,
  WorkbenchSize,
} from "./previewState";

interface EditGuardrail {
  decision: "redirect" | "refuse";
  reason: string;
  suggestedAlternative?: string;
}

export type WorkbenchTool =
  "selection" | "text" | "assets" | "research" | "tokens" | "motion";

const TOOLS: Array<{ id: WorkbenchTool; label: string }> = [
  { id: "selection", label: "Selection and layout" },
  { id: "text", label: "Text and button" },
  { id: "assets", label: "Assets" },
  { id: "research", label: "Research" },
  { id: "tokens", label: "Tokens" },
  { id: "motion", label: "Motion" },
];

const BREAKPOINTS: Array<{
  id: PreviewBreakpoint;
  label: string;
}> = [
  { id: "desktop", label: "Desktop" },
  { id: "tablet", label: "Tablet" },
  { id: "mobile", label: "Mobile" },
];

function ToolIcon({ tool }: { tool: WorkbenchTool }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };

  if (tool === "selection")
    return (
      <svg {...common}>
        <path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M21 16v4a1 1 0 0 1-1 1h-4M8 21H4a1 1 0 0 1-1-1v-4" />
        <rect x="8" y="8" width="8" height="8" rx="1.5" />
      </svg>
    );
  if (tool === "text")
    return (
      <svg {...common}>
        <path d="M5 5h14M12 5v14M8.5 19h7" />
      </svg>
    );
  if (tool === "assets")
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m5 17 4-4 3 3 2.5-2.5L19 18" />
      </svg>
    );
  if (tool === "research")
    return (
      <svg {...common}>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 4.5 4.5M8.5 10.5h4M10.5 8.5v4" />
      </svg>
    );
  if (tool === "tokens")
    return (
      <svg {...common}>
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10M4 12h4M12 12h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
        <circle cx="10" cy="12" r="2" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M3 14c2.3 0 2.3-5 4.6-5s2.3 7 4.6 7 2.3-9 4.6-9S19.1 12 21 12" />
    </svg>
  );
}

function ViewportIcon({ breakpoint }: { breakpoint: PreviewBreakpoint }) {
  const width = breakpoint === "desktop" ? 20 : breakpoint === "tablet" ? 15 : 10;
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x={(24 - width) / 2} y="4" width={width} height="16" rx="2" />
      {breakpoint === "desktop" && <path d="M9 20v2M15 20v2M7 22h10" />}
      {breakpoint !== "desktop" && <circle cx="12" cy="17.5" r="0.6" fill="currentColor" stroke="none" />}
    </svg>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 12 18" aria-hidden="true" focusable="false">
      {[3, 9].flatMap((x) =>
        [3, 9, 15].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />),
      )}
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={direction === "left" ? "m14 7-5 5 5 5" : "m10 7 5 5-5 5"} />
    </svg>
  );
}

interface WorkbenchProps {
  runId: string;
  mode: PreviewMode;
  size: WorkbenchSize;
  previewBreakpoint: PreviewBreakpoint;
  widthMenuOpen: boolean;
  widthAnnouncement: string | null;
  activeTool: WorkbenchTool;
  selection: PreviewSelection | null;
  editorState: EditorInteractionState;
  editorReason: string | null;
  instruction: string;
  imageIntent: boolean;
  isEditing: boolean;
  editResult: string | null;
  editError: string | null;
  editGuardrail: EditGuardrail | null;
  gateRefreshToken: number;
  onActiveToolChange: (tool: WorkbenchTool) => void;
  onInstructionChange: (value: string) => void;
  onImageIntentChange: (value: boolean) => void;
  onSubmitEdit: () => void;
  onApplySuggestedRedirect: () => void;
  onSizeChange: (size: WorkbenchSize) => void;
  onWidthMenuToggle: () => void;
  onWidthMenuClose: () => void;
  onPreviewBreakpointChange: (breakpoint: PreviewBreakpoint) => void;
  onPreviewBreakpointCycle: () => void;
  onGrabTabPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onGrabTabPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onGrabTabPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onEditorCommand: (action: "cancel" | "clear") => void;
  onStructuredMutationComplete: (message?: string) => void;
  onMotionPreview: (draft: Record<string, unknown>) => void;
  onMotionReset: () => void;
  onTokenPreview: (token: string, value: string) => void;
}

function ToolState({
  kind,
  title,
  children,
}: {
  kind: "empty" | "loading" | "error" | "unsupported";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`workbench-state workbench-state--${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <span className="workbench-state__label">{kind}</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function SelectionTarget({ selection }: { selection: PreviewSelection }) {
  return (
    <div className="selection-chip">
      <span className="selection-chip__tag">{selection.tag}</span>
      {selection.editId}
      {selection.text && (
        <span className="selection-chip__text">
          &ldquo;{selection.text}&rdquo;
        </span>
      )}
    </div>
  );
}

export function Workbench(props: WorkbenchProps) {
  const active = TOOLS.find((tool) => tool.id === props.activeTool) ?? TOOLS[0];
  const isTextTarget =
    props.selection?.behavior === "text" ||
    props.selection?.behavior === "interactive";

  function panelContent() {
    if (props.mode === "view") {
      return (
        <ToolState kind="unsupported" title="Editing is paused">
          Switch to Edit mode to select or change the rendered site. View mode
          keeps navigation and interactions live.
        </ToolState>
      );
    }

    if (props.activeTool === "selection") {
      if (!props.selection) {
        return (
          <ToolState kind="empty" title="Nothing selected">
            Choose an element in the preview to inspect its layout target.
          </ToolState>
        );
      }
      if (props.editorState === "unsupported") {
        return (
          <ToolState kind="unsupported" title="Safe fallback">
            {props.editorReason ??
              "This content cannot be edited safely in place."}
          </ToolState>
        );
      }
      return (
        <>
          <SelectionTarget selection={props.selection} />
          <p className="workbench-note">
            {props.editorState === "dragging"
              ? `Reorder preview active. ${props.editorReason ?? "Choose an editable sibling, then confirm the move here."}`
              : props.editorReason
                ? props.editorReason
                : props.selection.behavior === "safe-overlay"
              ? "Complex content stays live behind a safe selection overlay."
              : "This element is targeted by the active tool."}
          </p>
        </>
      );
    }

    if (props.activeTool === "text") {
      if (props.isEditing)
        return (
          <ToolState kind="loading" title="Applying change">
            The existing edit endpoint is updating the selected element.
          </ToolState>
        );
      if (props.editError)
        return (
          <ToolState kind="error" title="Edit failed">
            {props.editError}
          </ToolState>
        );
      if (!props.selection)
        return (
          <ToolState kind="empty" title="No text target">
            Select text or a button in the preview first.
          </ToolState>
        );
      if (!isTextTarget)
        return (
          <ToolState kind="unsupported" title="Not a text or button target">
            Choose an ordinary text element, link, or button.
          </ToolState>
        );
      return (
        <>
          <SelectionTarget selection={props.selection} />
          <p className="workbench-note">
            {props.editorReason ?? (props.editorState === "dragging"
              ? "Reorder preview active. Drop beside an editable sibling, or press Escape to cancel."
              : props.editorState === "text-editing"
                ? "Editing a preview-only draft in place. Press Escape in the preview to cancel; use Apply to persist an instruction."
                : props.selection.behavior === "interactive"
                  ? "Interactive actions are protected from navigation in Edit mode."
                  : "Direct editing is ready. Select the text in the preview to begin a preview-only draft.")}
          </p>
          <ElementControls
            key={props.selection.editId}
            runId={props.runId}
            selection={props.selection}
            editorState={props.editorState}
            onEditorCommand={props.onEditorCommand}
            onMutationComplete={props.onStructuredMutationComplete}
          />
          <hr className="hairline" />
          <p className="workbench-note">
            For broader structural changes, describe an instruction below.
          </p>
          <ChatComposer
            value={props.instruction}
            onChange={props.onInstructionChange}
            onSubmit={props.onSubmitEdit}
            placeholder="Describe the persistent change…"
            disabled={props.isEditing}
            submitLabel={props.isEditing ? "Applying…" : "Apply"}
            rows={3}
            extra={
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={props.imageIntent}
                  onChange={(event) =>
                    props.onImageIntentChange(event.target.checked)
                  }
                />
                Generate image
              </label>
            }
          />
          {props.editResult && (
            <p className="edit-status">{props.editResult}</p>
          )}
          {props.editGuardrail && (
            <div className="workbench-state workbench-state--error" role="alert">
              <span className="workbench-state__label">{props.editGuardrail.decision}</span>
              <strong>{props.editGuardrail.reason}</strong>
              {props.editGuardrail.suggestedAlternative && (
                <p>{props.editGuardrail.suggestedAlternative}</p>
              )}
              {props.editGuardrail.decision === "redirect" && props.editGuardrail.suggestedAlternative && (
                <button type="button" onClick={props.onApplySuggestedRedirect}>
                  Apply the suggested version instead
                </button>
              )}
            </div>
          )}
        </>
      );
    }

    if (props.activeTool === "assets") {
      return (
        <AssetControls
          key={`${props.runId}:${props.selection?.editId ?? "library"}`}
          runId={props.runId}
          selection={props.selection}
          onMutationComplete={props.onStructuredMutationComplete}
        />
      );
    }

    if (props.activeTool === "research") {
      return (
        <>
          <ResearchFindings runId={props.runId} />
          <hr className="hairline" />
          <GateStrip runId={props.runId} refreshToken={props.gateRefreshToken} />
        </>
      );
    }

    if (props.activeTool === "tokens") {
      return (
        <TokenControls
          runId={props.runId}
          onMutationComplete={props.onStructuredMutationComplete}
          onPreview={props.onTokenPreview}
        />
      );
    }

    if (!props.selection)
      return (
        <ToolState kind="empty" title="No motion target">
          Select an editable element to inspect or configure its motion.
        </ToolState>
      );
    if (props.selection.behavior === "unsupported")
      return (
        <ToolState kind="unsupported" title="Unsupported motion target">
          Custom interactive content cannot receive declarative motion safely.
        </ToolState>
      );
    return <MotionControls key={props.selection.editId} runId={props.runId} selection={props.selection} onMutationComplete={props.onStructuredMutationComplete} onPreview={props.onMotionPreview} onReset={props.onMotionReset} />;
  }

  return (
    <aside
      className={`preview-workbench preview-workbench--${props.size}`}
      aria-label="Preview workbench"
    >
      <nav className="workbench-tools" aria-label="Workbench tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`workbench-tool ${props.activeTool === tool.id ? "workbench-tool--active" : ""}`}
            aria-label={tool.label}
            aria-pressed={props.activeTool === tool.id}
            title={tool.label}
            onClick={() => props.onActiveToolChange(tool.id)}
          >
            <span className="workbench-tool__icon">
              <ToolIcon tool={tool.id} />
            </span>
          </button>
        ))}

        <div className="workbench-viewport-control">
          <button
            type="button"
            className="workbench-grab-tab"
            aria-label={`Preview width: ${props.previewBreakpoint}. Choose or drag to resize`}
            aria-expanded={props.widthMenuOpen}
            aria-controls="preview-width-menu"
            title="Choose or drag preview width"
            onClick={props.onWidthMenuToggle}
            onDoubleClick={() => {
              props.onWidthMenuClose();
              props.onPreviewBreakpointCycle();
            }}
            onPointerDown={props.onGrabTabPointerDown}
            onPointerMove={props.onGrabTabPointerMove}
            onPointerUp={props.onGrabTabPointerUp}
            onPointerCancel={props.onGrabTabPointerUp}
          >
            <GripIcon />
          </button>
          {props.widthMenuOpen && (
            <div
              id="preview-width-menu"
              className="workbench-width-menu"
              role="group"
              aria-label="Preview width"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  props.onWidthMenuClose();
                }
              }}
            >
              {BREAKPOINTS.map((breakpoint) => (
                <button
                  key={breakpoint.id}
                  type="button"
                  aria-label={`${breakpoint.label} preview width`}
                  aria-pressed={props.previewBreakpoint === breakpoint.id}
                  title={breakpoint.label}
                  onClick={() => props.onPreviewBreakpointChange(breakpoint.id)}
                >
                  <ViewportIcon breakpoint={breakpoint.id} />
                  <span className="visually-hidden">{breakpoint.label}</span>
                </button>
              ))}
            </div>
          )}
          {props.widthAnnouncement && (
            <span className="preview-width-announcement" aria-live="polite">
              {props.widthAnnouncement}
            </span>
          )}
        </div>

        <button
          type="button"
          className="workbench-tool workbench-tool--collapse"
          aria-label={
            props.size === "collapsed"
              ? "Reopen workbench"
              : "Collapse workbench"
          }
          title={
            props.size === "collapsed"
              ? "Reopen workbench"
              : "Collapse workbench"
          }
          onClick={() =>
            props.onSizeChange(
              props.size === "collapsed" ? "normal" : "collapsed",
            )
          }
        >
          <span className="workbench-tool__icon">
            <ChevronIcon
              direction={props.size === "collapsed" ? "left" : "right"}
            />
          </span>
        </button>
      </nav>

      {props.size !== "collapsed" && (
        <section className="workbench-panel" aria-labelledby="workbench-title">
          <div className="workbench-panel__header">
            <div>
              <p className="eyebrow">{"{ Workbench }"}</p>
              <h1 id="workbench-title">{active.label}</h1>
            </div>
          </div>
          <div className="workbench-panel__body">{panelContent()}</div>
        </section>
      )}
    </aside>
  );
}
