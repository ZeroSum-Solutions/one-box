"use client";

import { ChatComposer } from "@/components/ChatComposer";
import { GateStrip } from "@/components/GateStrip";
import { ElementControls } from "./ElementControls";
import { MotionControls } from "./MotionControls";
import { TokenControls } from "./TokenControls";
import type {
  EditorInteractionState,
  PreviewMode,
  PreviewSelection,
  WorkbenchSize,
} from "./previewState";

export type WorkbenchTool =
  "selection" | "text" | "assets" | "research" | "tokens" | "motion";

const TOOLS: Array<{ id: WorkbenchTool; icon: string; label: string }> = [
  { id: "selection", icon: "▣", label: "Selection and layout" },
  { id: "text", icon: "Aa", label: "Text and button" },
  { id: "assets", icon: "◇", label: "Assets" },
  { id: "research", icon: "?", label: "Research" },
  { id: "tokens", icon: "◉", label: "Tokens" },
  { id: "motion", icon: "~", label: "Motion" },
];

interface WorkbenchProps {
  runId: string;
  mode: PreviewMode;
  size: WorkbenchSize;
  activeTool: WorkbenchTool;
  selection: PreviewSelection | null;
  editorState: EditorInteractionState;
  editorReason: string | null;
  instruction: string;
  imageIntent: boolean;
  isEditing: boolean;
  editResult: string | null;
  editError: string | null;
  gateRefreshToken: number;
  onActiveToolChange: (tool: WorkbenchTool) => void;
  onInstructionChange: (value: string) => void;
  onImageIntentChange: (value: boolean) => void;
  onSubmitEdit: () => void;
  onSizeChange: (size: WorkbenchSize) => void;
  onEditorCommand: (action: "cancel" | "clear") => void;
  onStructuredMutationComplete: () => void;
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
        </>
      );
    }

    if (props.activeTool === "assets") {
      if (!props.selection)
        return (
          <ToolState kind="empty" title="No asset target">
            Select an image or media region to target this tool.
          </ToolState>
        );
      if (!/image|asset|media/i.test(props.selection.editId)) {
        return (
          <ToolState kind="unsupported" title="Selection is not an asset">
            This slice only routes recognized image and media targets here.
          </ToolState>
        );
      }
      return (
        <ToolState kind="empty" title="Asset target ready">
          Use the Text and button tool’s existing image intent until the asset
          workflow lands.
        </ToolState>
      );
    }

    if (props.activeTool === "research") {
      return (
        <GateStrip runId={props.runId} refreshToken={props.gateRefreshToken} />
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
    return <MotionControls runId={props.runId} selection={props.selection} onMutationComplete={props.onStructuredMutationComplete} onPreview={props.onMotionPreview} onReset={props.onMotionReset} />;
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
            <span aria-hidden="true">{tool.icon}</span>
          </button>
        ))}
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
          <span aria-hidden="true">
            {props.size === "collapsed" ? "‹" : "›"}
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
            <div
              className="workbench-size-controls"
              aria-label="Workbench size"
            >
              <button
                type="button"
                onClick={() => props.onSizeChange("normal")}
                aria-pressed={props.size === "normal"}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => props.onSizeChange("expanded")}
                aria-pressed={props.size === "expanded"}
              >
                Expand
              </button>
            </div>
          </div>
          <div className="workbench-panel__body">{panelContent()}</div>
        </section>
      )}
    </aside>
  );
}
