"use client";

import { useState, type PointerEvent } from "react";
import { ChatComposer } from "@/components/ChatComposer";
import { GateStrip } from "@/components/GateStrip";
import { AssetControls } from "./AssetControls";
import { AgentStudioPanel } from "./AiTeammate/AgentStudioPanel";
import { ElementControls } from "./ElementControls";
import { LayersPanel } from "./LayersPanel";
import { MotionControls } from "./MotionControls";
import { ResearchFindings } from "./ResearchFindings";
import { TokenControls } from "./TokenControls";
import { UndoRedoRail } from "./UndoRedoRail";
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
  "selection" | "text" | "assets" | "research" | "assistant" | "tokens" | "motion" | "layers";

const TOOLS: Array<{ id: WorkbenchTool; label: string }> = [
  { id: "selection", label: "Selection and layout" },
  { id: "text", label: "Text and button" },
  { id: "assets", label: "Assets" },
  { id: "layers", label: "Layers" },
  { id: "research", label: "Research" },
  { id: "assistant", label: "Agent Studio" },
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
  if (tool === "layers")
    return (
      <svg {...common}>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 13 9 5 9-5" />
      </svg>
    );
  if (tool === "research")
    return (
      <svg {...common}>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 4.5 4.5M8.5 10.5h4M10.5 8.5v4" />
      </svg>
    );
  if (tool === "assistant")
    return (
      <svg {...common}>
        <path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-5 3v-13a2 2 0 0 1 2-2Z" />
        <path d="M8.5 11.5h7M8.5 14.5h4" />
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
  canStepBack: boolean;
  editorState: EditorInteractionState;
  editorReason: string | null;
  instruction: string;
  imageIntent: boolean;
  isEditing: boolean;
  editResult: string | null;
  editError: string | null;
  editGuardrail: EditGuardrail | null;
  referenceAssetId: string | null;
  referenceLabel: string | null;
  gateRefreshToken: number;
  onActiveToolChange: (tool: WorkbenchTool) => void;
  onInstructionChange: (value: string) => void;
  onImageIntentChange: (value: boolean) => void;
  onSubmitEdit: () => void;
  onApplySuggestedRedirect: () => void;
  onAttachReference: (assetId: string, label: string) => void;
  onClearReference: () => void;
  onSizeChange: (size: WorkbenchSize) => void;
  onWidthMenuToggle: () => void;
  onWidthMenuClose: () => void;
  onPreviewBreakpointChange: (breakpoint: PreviewBreakpoint) => void;
  onPreviewBreakpointCycle: () => void;
  onGrabTabPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onGrabTabPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onGrabTabPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onEditorCommand: (action: "cancel" | "clear") => void;
  onSelectParent: () => void;
  onStepBack: () => void;
  onSelectAncestor: (editId: string) => void;
  onHoverElement: (editId: string | null) => void;
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

// Ancestor breadcrumb strip (canvas-upgrade A3, Play 9). Lives in workbench
// chrome alongside the header, not inside panelContent(), so it stays
// visible whichever tool is active -- the FACTS instruction. The "Select
// parent" control is the pointer route for the same one-level climb
// overlay.js's ArrowUp key performs (Play 3); "Back" mirrors ArrowDown and
// only appears while overlay.js still holds a climb to unwind
// (props.canStepBack). Every crumb click reaches an ancestor directly
// (select-by-id), never through a synthetic iframe click.
function SelectionBreadcrumb({
  selection,
  canStepBack,
  onSelectParent,
  onStepBack,
  onSelectAncestor,
}: {
  selection: PreviewSelection;
  canStepBack: boolean;
  onSelectParent: () => void;
  onStepBack: () => void;
  onSelectAncestor: (editId: string) => void;
}) {
  const chain = selection.parentChain ?? [];
  // parentChain is closest-ancestor-first (overlay.js ancestorChain()); the
  // trail reads root-to-leaf left-to-right, so display order is reversed.
  const ancestors = [...chain].reverse();
  return (
    <div className="workbench-breadcrumb" aria-label="Selection ancestry">
      <button
        type="button"
        className="btn-ghost btn-mini"
        disabled={chain.length === 0}
        title="Select parent"
        onClick={onSelectParent}
      >
        Select parent
      </button>
      {canStepBack && (
        <button
          type="button"
          className="btn-ghost btn-mini"
          title="Back to previous selection"
          onClick={onStepBack}
        >
          Back
        </button>
      )}
      {ancestors.length > 0 && (
        <ol className="workbench-breadcrumb__trail">
          {ancestors.map((editId, index) => (
            <li key={editId}>
              {index > 0 && (
                <span className="workbench-breadcrumb__sep" aria-hidden="true">
                  /
                </span>
              )}
              <button
                type="button"
                className="btn-ghost btn-mini workbench-breadcrumb__crumb"
                title={`Select ${editId}`}
                onClick={() => onSelectAncestor(editId)}
              >
                {editId}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

interface ReferenceLibraryItem {
  id: string;
  status: "pending" | "completed" | "failed";
  prompt: string | null;
  url: string | null;
}

// Chat Reference Attachment (canvas-upgrade B3, Play 11). Browses the SAME
// run image library AssetControls.tsx already fetches from GET
// /api/assets/<runId> — no new listing endpoint, no new picker pattern. The
// chosen id travels in the /api/edit request body (api/edit/route.ts
// validates it against this run's own library before it can touch a
// prompt); this component only has to make the choice visible once made.
function ReferenceAttachment({
  runId,
  referenceAssetId,
  referenceLabel,
  onAttach,
  onClear,
}: {
  runId: string;
  referenceAssetId: string | null;
  referenceLabel: string | null;
  onAttach: (assetId: string, label: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ReferenceLibraryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (items || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(runId)}`);
      const data = (await response.json().catch(() => null)) as
        | { library: { items: ReferenceLibraryItem[] } }
        | { error?: string }
        | null;
      if (!response.ok || !data || !("library" in data)) {
        throw new Error(
          (data && "error" in data && data.error) || "Reference library unavailable.",
        );
      }
      setItems(data.library.items.filter((item) => item.status === "completed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reference library unavailable.");
    } finally {
      setLoading(false);
    }
  }

  if (referenceAssetId) {
    return (
      <span className="composer-reference__chip">
        Reference: {referenceLabel ?? referenceAssetId}
        <button
          type="button"
          className="composer-reference__clear"
          aria-label="Remove attached reference"
          onClick={onClear}
        >
          ×
        </button>
      </span>
    );
  }

  return (
    <div className="composer-reference">
      <button
        type="button"
        className="btn-ghost btn-mini"
        aria-expanded={open}
        onClick={() => void toggle()}
      >
        Attach reference
      </button>
      {open && (
        <div className="composer-reference__menu" role="menu" aria-label="Attach a reference image">
          {loading && <p className="workbench-note">Loading your generated images…</p>}
          {error && <p className="workbench-note">{error}</p>}
          {items && items.length === 0 && (
            <p className="workbench-note">
              No completed images yet — generate one in the Assets tool first.
            </p>
          )}
          {items?.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="composer-reference__option"
              onClick={() => {
                onAttach(item.id, item.prompt ? item.prompt.slice(0, 60) : item.id);
                setOpen(false);
              }}
            >
              {item.url && (
                // A 28px reference-picker thumbnail of this run's own
                // generated image library, served locally by the guarded
                // project asset route (AssetControls.tsx uses the same
                // justification) -- not a remote/third-party image next/image
                // would be optimizing for.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" />
              )}
              <span>{item.prompt ? item.prompt.slice(0, 60) : item.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Persistent Any-Selection Chat Composer (canvas-upgrade B1, Play 2). Lives
// inside .workbench-panel__body but OUTSIDE panelContent()'s per-tool
// switch, so it renders once per mode and survives every tool change — the
// FACTS instruction that a half-typed instruction must not vanish when the
// active tool changes. Its state (instruction/imageIntent/isEditing/
// editResult/editError/editGuardrail/referenceAssetId) is hoisted at
// page.tsx, the single shared source for every chat-driven /api/edit call
// regardless of which tool was active when it was typed.
//
// View-mode guard, re-implemented at this new mount point (review finding):
// in view mode this returns null rather than a disabled composer, because a
// disabled-but-present composer still POSTs to /api/edit the instant mode
// flips back — the exact edit side door the surrounding code comments warn
// against. `panelContent()` carries its own, independent copy of this same
// guard for the tool-specific panels; both must agree.
function PersistentComposer(props: WorkbenchProps) {
  if (props.mode !== "edit") return null;

  const selection = props.selection;
  const blocked = selection?.behavior === "unsupported";
  const canSubmit = Boolean(selection) && !blocked;

  return (
    <div className="workbench-composer">
      <div className="workbench-composer__scope">
        {selection ? (
          <div className="selection-chip">
            <span className="selection-chip__tag">{selection.tag}</span>
            {selection.editId}
            {selection.text && (
              <span className="selection-chip__text">&ldquo;{selection.text}&rdquo;</span>
            )}
            <button
              type="button"
              className="btn-ghost btn-mini selection-chip__clear"
              onClick={() => {
                // Clearing the selection must also clear the draft written
                // against it -- otherwise it sits in the box as an orphan,
                // ready to silently re-attach to whatever gets selected
                // next (review finding: a "clear" that doesn't actually
                // clear the instruction is not a safety valve). Clear
                // directly here rather than only waiting on the
                // selection:null round-trip through overlay.js, so the
                // textarea empties in the same tick as the chip.
                props.onEditorCommand("clear");
                props.onInstructionChange("");
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <p className="workbench-note">
            No element selected — instructions are not applied to the whole
            site. Select something in the preview to give this instruction a
            target.
          </p>
        )}
        {selection && blocked && (
          <p className="workbench-note">This selection is protected from persistent edits.</p>
        )}
      </div>
      <ChatComposer
        value={props.instruction}
        onChange={props.onInstructionChange}
        onSubmit={props.onSubmitEdit}
        placeholder={
          canSubmit
            ? "Describe the change you want…"
            : "Select an element, then describe the change…"
        }
        disabled={props.isEditing}
        submitDisabled={!canSubmit}
        submitLabel={props.isEditing ? "Applying…" : "Apply"}
        rows={3}
        extra={
          <div className="workbench-composer__extra">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={props.imageIntent}
                onChange={(event) => props.onImageIntentChange(event.target.checked)}
              />
              Generate image
            </label>
            {props.imageIntent && (
              <ReferenceAttachment
                runId={props.runId}
                referenceAssetId={props.referenceAssetId}
                referenceLabel={props.referenceLabel}
                onAttach={props.onAttachReference}
                onClear={props.onClearReference}
              />
            )}
          </div>
        }
      />
      {props.editResult && <p className="edit-status">{props.editResult}</p>}
      {props.editError && (
        <p className="edit-error" role="alert">
          {props.editError}
        </p>
      )}
      {props.editGuardrail && (
        <div className="workbench-state workbench-state--error" role="alert">
          <span className="workbench-state__label">{props.editGuardrail.decision}</span>
          <strong>{props.editGuardrail.reason}</strong>
          {props.editGuardrail.suggestedAlternative && <p>{props.editGuardrail.suggestedAlternative}</p>}
          {props.editGuardrail.decision === "redirect" && props.editGuardrail.suggestedAlternative && (
            <button type="button" className="btn-coral" onClick={props.onApplySuggestedRedirect}>
              Apply the suggested version instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Workbench(props: WorkbenchProps) {
  const active = TOOLS.find((tool) => tool.id === props.activeTool) ?? TOOLS[0];
  const workbenchCollapsed = props.size === "collapsed";
  const [hasOpenedAgentStudio, setHasOpenedAgentStudio] = useState(
    props.activeTool === "assistant",
  );
  const shouldRenderAgentStudio =
    props.activeTool === "assistant" || hasOpenedAgentStudio;
  const agentStudioInactive =
    props.activeTool !== "assistant" || props.mode === "view";
  const agentStudioHidden = agentStudioInactive || workbenchCollapsed;
  const isTextTarget =
    props.selection?.behavior === "text" ||
    props.selection?.behavior === "interactive";

  function panelContent() {
    // The view-mode pause guards every tool, the assistant included (review
    // finding): its Apply buttons reach /api/edit, so view mode must not
    // become an edit side door.
    if (props.mode === "view") {
      return (
        <ToolState kind="unsupported" title="Editing is paused">
          Switch to Edit mode to select or change the rendered site. View mode
          keeps navigation and interactions live.
        </ToolState>
      );
    }

    if (props.activeTool === "assistant") return null;

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
      // A section (behavior === "container") lands on this tool, not "text"
      // -- it holds other editable elements rather than text of its own
      // (canvas-upgrade Wave 4, Play 10). ElementControls' own container
      // branch is what surfaces the move controls here instead of a note
      // that names nothing to actually do.
      if (props.selection.behavior === "container") {
        return (
          <>
            <SelectionTarget selection={props.selection} />
            <ElementControls
              key={props.selection.editId}
              runId={props.runId}
              selection={props.selection}
              editorState={props.editorState}
              onEditorCommand={props.onEditorCommand}
              onMutationComplete={props.onStructuredMutationComplete}
            />
          </>
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
            For broader structural changes, describe an instruction in the
            composer below — it stays available whichever tool you switch to.
          </p>
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

    if (props.activeTool === "layers") {
      return (
        <LayersPanel
          runId={props.runId}
          refreshToken={props.gateRefreshToken}
          selectedEditId={props.selection?.editId ?? null}
          onSelectElement={props.onSelectAncestor}
          onHoverElement={props.onHoverElement}
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
      <nav
        id="workbench-tools"
        className="workbench-tools"
        aria-label="Workbench tools"
        tabIndex={-1}
      >
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`workbench-tool ${props.activeTool === tool.id ? "workbench-tool--active" : ""}`}
            aria-label={tool.label}
            aria-pressed={props.activeTool === tool.id}
            title={tool.label}
            onClick={() => {
              if (tool.id === "assistant") setHasOpenedAgentStudio(true);
              props.onActiveToolChange(tool.id);
            }}
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

      <section
        className="workbench-panel"
        aria-labelledby={workbenchCollapsed ? undefined : "workbench-title"}
        hidden={workbenchCollapsed}
        aria-hidden={workbenchCollapsed || undefined}
        inert={workbenchCollapsed || undefined}
      >
        {!workbenchCollapsed && (
          <>
          <div className="workbench-panel__header">
            <div>
              <p className="eyebrow">{"{ Workbench }"}</p>
              <h1 id="workbench-title">{active.label}</h1>
            </div>
            <div className="workbench-panel__header-actions">
              <UndoRedoRail
                runId={props.runId}
                mode={props.mode}
                refreshToken={props.gateRefreshToken}
                onMutationComplete={props.onStructuredMutationComplete}
              />
              <button
                type="button"
                className="btn-ghost btn-mini"
                disabled={!props.selection}
                onClick={() => props.onEditorCommand("clear")}
              >
                Clear
              </button>
            </div>
          </div>
          {props.selection && (
            <SelectionBreadcrumb
              selection={props.selection}
              canStepBack={props.canStepBack}
              onSelectParent={props.onSelectParent}
              onStepBack={props.onStepBack}
              onSelectAncestor={props.onSelectAncestor}
            />
          )}
          </>
        )}
        <div className="workbench-panel__body">
          {shouldRenderAgentStudio && (
            <div
              data-retained-agent-studio="true"
              hidden={agentStudioHidden}
              aria-hidden={agentStudioHidden}
              inert={agentStudioHidden}
            >
              <AgentStudioPanel
                key={props.runId}
                runId={props.runId}
                selection={props.selection}
                onMutationComplete={props.onStructuredMutationComplete}
              />
            </div>
          )}
          {!workbenchCollapsed && (
            <>
            {panelContent()}
            {props.mode === "edit" && <hr className="hairline" aria-hidden="true" />}
            <PersistentComposer {...props} />
            </>
          )}
        </div>
      </section>
    </aside>
  );
}
