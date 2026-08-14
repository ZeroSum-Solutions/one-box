"use client";

import {
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Workbench, type WorkbenchTool } from "@/components/preview/Workbench";
import {
  DEFAULT_WORKBENCH_STATE,
  breakpointForWidth,
  clampPanelWidth,
  isTrustedEditorMessage,
  panelWidthBounds,
  parseWorkbenchState,
  readEditorStateMessage,
  workbenchSizeForWidth,
  workbenchStorageKey,
  type EditorInteractionState,
  type PersistedWorkbenchState,
  type PreviewBreakpoint,
  type PreviewMode,
  type PreviewSelection,
  type WorkbenchSize,
} from "@/components/preview/previewState";

interface EditApiGate {
  gate: string;
  pass: boolean;
  blocking: boolean;
}

const WORKBENCH_TOOLS: WorkbenchTool[] = [
  "selection",
  "text",
  "assets",
  "research",
  "tokens",
  "motion",
];

function isWorkbenchTool(value: string): value is WorkbenchTool {
  return WORKBENCH_TOOLS.includes(value as WorkbenchTool);
}

export default function PreviewPage(props: PageProps<"/preview/[id]">) {
  const { id } = use(props.params);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [selection, setSelection] = useState<PreviewSelection | null>(null);
  const [editorState, setEditorState] =
    useState<EditorInteractionState>("idle");
  const [editorReason, setEditorReason] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [imageIntent, setImageIntent] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editResult, setEditResult] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [gateRefreshToken, setGateRefreshToken] = useState(0);
  const [iframeVersion, setIframeVersion] = useState(0);
  const [previewBreakpoint, setPreviewBreakpoint] =
    useState<PreviewBreakpoint>("desktop");
  const [workbench, setWorkbench] = useState<PersistedWorkbenchState>(
    DEFAULT_WORKBENCH_STATE,
  );
  const [restored, setRestored] = useState(false);
  const [workspaceWidth, setWorkspaceWidth] = useState(1280);

  const handleStructuredMutationComplete = useCallback(() => {
    setSelection(null);
    setEditorState("idle");
    setEditorReason(null);
    setGateRefreshToken((value) => value + 1);
    setIframeVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setWorkbench(
        parseWorkbenchState(localStorage.getItem(workbenchStorageKey(id))),
      );
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem(workbenchStorageKey(id), JSON.stringify(workbench));
  }, [id, restored, workbench]);

  useEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) return;
    const update = () =>
      setPreviewBreakpoint(
        breakpointForWidth(viewport.getBoundingClientRect().width),
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || !restored) return;
    const reclamp = () => {
      const width = workspace.getBoundingClientRect().width;
      setWorkspaceWidth(width);
      setWorkbench((current) => {
        if (current.size === "collapsed") return current;
        const panelWidth = clampPanelWidth(current.panelWidth, width);
        if (panelWidth === current.panelWidth) return current;
        const size = workbenchSizeForWidth(panelWidth);
        return { ...current, panelWidth, size, lastOpenSize: size };
      });
    };
    reclamp();
    const observer = new ResizeObserver(reclamp);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [restored]);

  // The sandbox omits allow-same-origin, so event.origin is the literal "null".
  // Exact contentWindow identity plus a strict payload guard is the trust boundary.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        !isTrustedEditorMessage(
          event.source,
          iframeRef.current?.contentWindow,
          event.data,
        )
      )
        return;
      const message = readEditorStateMessage(event.data);
      if (!message) return;
      setEditorState(message.state);
      setEditorReason(message.reason ?? null);
      setSelection(message.selection);
      if (message.state === "dragging") {
        setWorkbench((current) => ({ ...current, activeTool: "selection" }));
      } else if (
        message.selection?.behavior === "text" ||
        message.selection?.behavior === "interactive"
      ) {
        setWorkbench((current) => ({ ...current, activeTool: "text" }));
      } else if (message.selection) {
        setWorkbench((current) => ({ ...current, activeTool: "selection" }));
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  function setMode(mode: PreviewMode) {
    setSelection(null);
    setEditorState("idle");
    setEditorReason(null);
    setWorkbench((current) => ({ ...current, mode }));
  }

  function setWorkbenchSize(size: WorkbenchSize) {
    const workspaceWidth =
      workspaceRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    setWorkbench((current) => {
      if (size === "collapsed") {
        return {
          ...current,
          size,
          lastOpenSize: current.size === "expanded" ? "expanded" : "normal",
        };
      }
      const reopening = current.size === "collapsed";
      const restoredWidth = clampPanelWidth(current.panelWidth, workspaceWidth);
      const nextSize = reopening ? workbenchSizeForWidth(restoredWidth) : size;
      return {
        ...current,
        size: nextSize,
        lastOpenSize: nextSize,
        panelWidth: reopening
          ? restoredWidth
          : nextSize === "expanded"
            ? clampPanelWidth(Math.max(current.panelWidth, 560), workspaceWidth)
            : clampPanelWidth(
                Math.min(current.panelWidth, 420),
                workspaceWidth,
              ),
      };
    });
  }

  function resizeWorkbench(nextWidth: number) {
    const workspaceWidth =
      workspaceRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const panelWidth = clampPanelWidth(nextWidth, workspaceWidth);
    setWorkbench((current) => ({
      ...current,
      panelWidth,
      size: workbenchSizeForWidth(panelWidth),
      lastOpenSize: workbenchSizeForWidth(panelWidth),
    }));
  }

  function sendEditorCommand(action: "cancel" | "clear") {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "onebox-editor-command", action },
      "*",
    );
  }

  function previewSelectedMotion() {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "onebox-editor-command", action: "preview-motion", editId: selection?.editId },
      "*",
    );
  }

  function handleDividerPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (workbench.size === "collapsed") return;
    dragRef.current = {
      startX: event.clientX,
      startWidth: workbench.panelWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDividerPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (
      !dragRef.current ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    )
      return;
    resizeWorkbench(
      dragRef.current.startWidth + dragRef.current.startX - event.clientX,
    );
  }

  function handleDividerPointerUp(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleDividerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      resizeWorkbench(
        workbench.panelWidth + (event.key === "ArrowLeft" ? 24 : -24),
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setWorkbenchSize("collapsed");
    } else if (event.key === "End") {
      event.preventDefault();
      setWorkbenchSize("expanded");
    }
  }

  async function submitEdit() {
    if (!selection || !instruction.trim() || isEditing) return;
    setIsEditing(true);
    setEditError(null);
    setEditResult(null);
    try {
      const response = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: id,
          editId: selection.editId,
          instruction: instruction.trim(),
          imageIntent,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok: true; gates: EditApiGate[]; gatesClean: boolean }
        | { error: string }
        | null;

      if (!response.ok || !data || "error" in data) {
        throw new Error(
          (data && "error" in data && data.error) ||
            `Edit failed (${response.status}).`,
        );
      }

      const passing = data.gates.filter((gate) => gate.pass).length;
      setEditResult(
        `Applied. Gates ${data.gatesClean ? "clean" : "flagged"} (${passing}/${data.gates.length} passing).`,
      );
      setInstruction("");
      setImageIntent(false);
      setGateRefreshToken((value) => value + 1);
      setIframeVersion((value) => value + 1);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Edit failed.");
    } finally {
      setIsEditing(false);
    }
  }

  const activeTool = isWorkbenchTool(workbench.activeTool)
    ? workbench.activeTool
    : "selection";
  const style = {
    "--workbench-width": `${workbench.panelWidth}px`,
  } as CSSProperties;
  const panelBounds = panelWidthBounds(workspaceWidth);
  const iframeSrc = `/api/sites/${encodeURIComponent(id)}/index.html${workbench.mode === "edit" ? "?edit=1" : ""}`;

  return (
    <main
      ref={workspaceRef}
      className={`preview-layout preview-layout--${workbench.size}`}
      style={style}
    >
      <section
        ref={previewViewportRef}
        className="preview-viewport"
        aria-label="Rendered site preview"
      >
        <div className="preview-toolbar">
          <div
            className="preview-mode-switch"
            role="group"
            aria-label="Preview mode"
          >
            <button
              type="button"
              aria-pressed={workbench.mode === "view"}
              onClick={() => setMode("view")}
            >
              View
            </button>
            <button
              type="button"
              aria-pressed={workbench.mode === "edit"}
              onClick={() => setMode("edit")}
            >
              Edit
            </button>
          </div>
          <span className="preview-breakpoint" aria-live="polite">
            {previewBreakpoint}
          </span>
        </div>
        {restored ? (
          <iframe
            key={`${iframeVersion}:${workbench.mode}`}
            ref={iframeRef}
            className="preview-frame"
            src={iframeSrc}
            sandbox={
              workbench.mode === "view"
                ? "allow-scripts allow-forms allow-popups allow-downloads"
                : "allow-scripts"
            }
            title={`${workbench.mode === "view" ? "View" : "Edit"} site preview`}
          />
        ) : (
          <div className="preview-frame-pending" role="status">
            Restoring preview…
          </div>
        )}
      </section>

      <div
        className="preview-divider"
        role="separator"
        aria-label="Resize preview and workbench"
        aria-orientation="vertical"
        aria-valuemin={panelBounds.min}
        aria-valuemax={panelBounds.max}
        aria-valuenow={clampPanelWidth(workbench.panelWidth, workspaceWidth)}
        tabIndex={workbench.size === "collapsed" ? -1 : 0}
        onPointerDown={handleDividerPointerDown}
        onPointerMove={handleDividerPointerMove}
        onPointerUp={handleDividerPointerUp}
        onPointerCancel={handleDividerPointerUp}
        onKeyDown={handleDividerKeyDown}
      />

      <Workbench
        runId={id}
        mode={workbench.mode}
        size={workbench.size}
        activeTool={activeTool}
        selection={selection}
        editorState={editorState}
        editorReason={editorReason}
        instruction={instruction}
        imageIntent={imageIntent}
        isEditing={isEditing}
        editResult={editResult}
        editError={editError}
        gateRefreshToken={gateRefreshToken}
        onActiveToolChange={(activeTool) =>
          setWorkbench((current) => ({ ...current, activeTool }))
        }
        onInstructionChange={setInstruction}
        onImageIntentChange={setImageIntent}
        onSubmitEdit={submitEdit}
        onSizeChange={setWorkbenchSize}
        onEditorCommand={sendEditorCommand}
        onStructuredMutationComplete={handleStructuredMutationComplete}
        onMotionPreview={previewSelectedMotion}
      />
    </main>
  );
}
