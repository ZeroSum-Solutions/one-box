"use client";

import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
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
  isRunBoundRequestCurrent,
  isWorkbenchStateRestoredForRun,
  nearestPreviewBreakpoint,
  panelWidthForBreakpoint,
  panelWidthBounds,
  previewWidthForBreakpoint,
  persistWorkbenchState,
  readEditorStateMessage,
  restoreWorkbenchState,
  workbenchSizeForWidth,
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

interface EditGuardrail {
  decision: "redirect" | "refuse";
  reason: string;
  suggestedAlternative?: string;
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
  const activeRunIdRef = useRef(id);
  const pendingEditAbortRef = useRef<AbortController | null>(null);
  const dragRef = useRef<{
    startX: number;
    startWidth: number;
    lastWidth: number;
    moved: boolean;
    source: "divider" | "tab";
  } | null>(null);
  const suppressGrabClickRef = useRef(false);
  const [selection, setSelection] = useState<PreviewSelection | null>(null);
  const [editorState, setEditorState] =
    useState<EditorInteractionState>("idle");
  const [editorReason, setEditorReason] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [imageIntent, setImageIntent] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editResult, setEditResult] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editGuardrail, setEditGuardrail] = useState<EditGuardrail | null>(null);
  const [gateRefreshToken, setGateRefreshToken] = useState(0);
  const [iframeVersion, setIframeVersion] = useState(0);
  const [previewBreakpoint, setPreviewBreakpoint] =
    useState<PreviewBreakpoint>("desktop");
  const [workbench, setWorkbench] = useState<PersistedWorkbenchState>(
    DEFAULT_WORKBENCH_STATE,
  );
  const [restoredRunId, setRestoredRunId] = useState<string | null>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(1280);
  const [widthMenuOpen, setWidthMenuOpen] = useState(false);
  const [widthAnnouncement, setWidthAnnouncement] = useState<string | null>(
    null,
  );
  const [isResizing, setIsResizing] = useState(false);

  useLayoutEffect(() => {
    activeRunIdRef.current = id;
  }, [id]);

  const handleStructuredMutationComplete = useCallback((message?: string) => {
    setSelection(null);
    setEditorState("idle");
    setEditorReason(null);
    setEditResult(message ?? null);
    setGateRefreshToken((value) => value + 1);
    setIframeVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    pendingEditAbortRef.current?.abort();
    pendingEditAbortRef.current = null;
    dragRef.current = null;
    suppressGrabClickRef.current = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSelection(null);
      setEditorState("idle");
      setEditorReason(null);
      setInstruction("");
      setImageIntent(false);
      setIsEditing(false);
      setEditResult(null);
      setEditError(null);
      setGateRefreshToken(0);
      setIframeVersion(0);
      setPreviewBreakpoint("desktop");
      setWidthMenuOpen(false);
      setWidthAnnouncement(null);
      setIsResizing(false);
      setWorkbench(restoreWorkbenchState(localStorage, id));
      setRestoredRunId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!isWorkbenchStateRestoredForRun(restoredRunId, id)) return;
    persistWorkbenchState(localStorage, id, workbench);
  }, [id, restoredRunId, workbench]);

  const restored = isWorkbenchStateRestoredForRun(restoredRunId, id);

  useEffect(() => {
    if (!restored) return;
    const viewport = iframeRef.current;
    if (!viewport) return;
    const update = () =>
      setPreviewBreakpoint(
        breakpointForWidth(viewport.getBoundingClientRect().width),
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [iframeVersion, restored, workbench.mode]);

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

  useEffect(() => {
    if (!widthAnnouncement) return;
    const timeout = window.setTimeout(() => setWidthAnnouncement(null), 1400);
    return () => window.clearTimeout(timeout);
  }, [widthAnnouncement]);

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
      if (message.selection) setEditResult(null);
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
      previewPreset: null,
    }));
  }

  function setPreviewWidth(breakpoint: PreviewBreakpoint) {
    const nextWorkspaceWidth =
      workspaceRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const panelWidth = panelWidthForBreakpoint(
      breakpoint,
      nextWorkspaceWidth,
    );
    const size = workbenchSizeForWidth(panelWidth);
    setWorkbench((current) => ({
      ...current,
      panelWidth,
      size,
      lastOpenSize: size,
      previewPreset: breakpoint,
    }));
    setWidthMenuOpen(false);
    setWidthAnnouncement(
      `${breakpoint[0].toUpperCase()}${breakpoint.slice(1)} preview`,
    );
  }

  function cyclePreviewWidth() {
    const breakpoints: PreviewBreakpoint[] = ["desktop", "tablet", "mobile"];
    const currentIndex = breakpoints.indexOf(previewBreakpoint);
    setPreviewWidth(breakpoints[(currentIndex + 1) % breakpoints.length]);
  }

  function sendEditorCommand(action: "cancel" | "clear") {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "onebox-editor-command", action },
      "*",
    );
  }

  function previewSelectedMotion(draft: Record<string, unknown>) {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "onebox-editor-command", action: "preview-motion", editId: selection?.editId, draft },
      "*",
    );
  }

  function resetMotionPreview() {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "onebox-editor-command", action: "reset-motion" },
      "*",
    );
  }

  function previewToken(token: string, value: string) {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "onebox-editor-command", action: "preview-token", token, value },
      "*",
    );
  }

  function handleResizePointerDown(
    event: PointerEvent<HTMLDivElement | HTMLButtonElement>,
    source: "divider" | "tab",
  ) {
    if (!restored) return;
    if (workbench.size === "collapsed" && source === "divider") return;
    if (source === "tab" && workbench.size === "collapsed") {
      const size = workbenchSizeForWidth(workbench.panelWidth);
      setWorkbench((current) => ({ ...current, size, lastOpenSize: size }));
    }
    dragRef.current = {
      startX: event.clientX,
      startWidth: workbench.panelWidth,
      lastWidth: workbench.panelWidth,
      moved: false,
      source,
    };
    setIsResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizePointerMove(
    event: PointerEvent<HTMLDivElement | HTMLButtonElement>,
  ) {
    if (
      !dragRef.current ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    )
      return;
    const delta = dragRef.current.startX - event.clientX;
    const nextWidth = dragRef.current.startWidth + delta;
    dragRef.current.lastWidth = nextWidth;
    dragRef.current.moved ||= Math.abs(delta) > 3;
    if (dragRef.current.moved) setWidthMenuOpen(false);
    resizeWorkbench(nextWidth);
  }

  function handleResizePointerUp(
    event: PointerEvent<HTMLDivElement | HTMLButtonElement>,
  ) {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag) return;
    if (drag.source === "tab" && drag.moved) suppressGrabClickRef.current = true;
    if (!drag.moved) return;

    const nextWorkspaceWidth =
      workspaceRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const snappedBreakpoint = nearestPreviewBreakpoint(
      clampPanelWidth(drag.lastWidth, nextWorkspaceWidth),
      nextWorkspaceWidth,
    );
    if (snappedBreakpoint) setPreviewWidth(snappedBreakpoint);
  }

  function toggleWidthMenu() {
    if (suppressGrabClickRef.current) {
      suppressGrabClickRef.current = false;
      return;
    }
    setWidthMenuOpen((open) => !open);
  }

  function handleDividerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!restored) return;
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

  async function submitEdit(options: { confirmRedirect?: boolean; instruction?: string } = {}) {
    const submittedInstruction = options.instruction ?? instruction.trim();
    if (!restored || !selection || !submittedInstruction || isEditing) return;
    const requestRunId = id;
    const controller = new AbortController();
    pendingEditAbortRef.current?.abort();
    pendingEditAbortRef.current = controller;
    setIsEditing(true);
    setEditError(null);
    setEditResult(null);
    setEditGuardrail(null);
    try {
      const response = await fetch("/api/edit", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: id,
          editId: selection.editId,
          instruction: submittedInstruction,
          imageIntent,
          ...(options.confirmRedirect ? { confirmRedirect: true } : {}),
          ...(imageIntent ? { requestId: crypto.randomUUID() } : {}),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok: true; gates: EditApiGate[]; gatesClean: boolean }
        | { ok: false; guardrail: EditGuardrail }
        | { error: string }
        | null;

      if (!isRunBoundRequestCurrent(requestRunId, activeRunIdRef.current)) {
        return;
      }

      if (data && "guardrail" in data) {
        setEditGuardrail(data.guardrail);
        return;
      }

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
      if (
        controller.signal.aborted ||
        !isRunBoundRequestCurrent(requestRunId, activeRunIdRef.current)
      ) {
        return;
      }
      setEditError(error instanceof Error ? error.message : "Edit failed.");
    } finally {
      if (pendingEditAbortRef.current === controller) {
        pendingEditAbortRef.current = null;
      }
      if (isRunBoundRequestCurrent(requestRunId, activeRunIdRef.current)) {
        setIsEditing(false);
      }
    }
  }

  const activeTool = isWorkbenchTool(workbench.activeTool)
    ? workbench.activeTool
    : "selection";
  const style = {
    "--workbench-width": `${workbench.panelWidth}px`,
    "--preview-canvas-width":
      workbench.previewPreset && workbench.size !== "collapsed"
        ? `${previewWidthForBreakpoint(workbench.previewPreset)}px`
        : "100%",
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
              disabled={!restored}
              aria-pressed={workbench.mode === "view"}
              onClick={() => setMode("view")}
            >
              View
            </button>
            <button
              type="button"
              disabled={!restored}
              aria-pressed={workbench.mode === "edit"}
              onClick={() => setMode("edit")}
            >
              Edit
            </button>
          </div>
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
        className={`preview-divider ${isResizing ? "preview-divider--active" : ""}`}
        role="separator"
        aria-label="Resize preview and workbench"
        aria-orientation="vertical"
        aria-valuemin={panelBounds.min}
        aria-valuemax={panelBounds.max}
        aria-valuenow={clampPanelWidth(workbench.panelWidth, workspaceWidth)}
        aria-valuetext={`${previewBreakpoint} preview`}
        tabIndex={!restored || workbench.size === "collapsed" ? -1 : 0}
        onPointerDown={(event) => handleResizePointerDown(event, "divider")}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
        onKeyDown={handleDividerKeyDown}
      />

      {restored ? (
        <Workbench
          key={id}
          runId={id}
          mode={workbench.mode}
          size={workbench.size}
          previewBreakpoint={previewBreakpoint}
          widthMenuOpen={widthMenuOpen}
          widthAnnouncement={widthAnnouncement}
          activeTool={activeTool}
          selection={selection}
          editorState={editorState}
          editorReason={editorReason}
          instruction={instruction}
          imageIntent={imageIntent}
          isEditing={isEditing}
          editResult={editResult}
          editError={editError}
          editGuardrail={editGuardrail}
          gateRefreshToken={gateRefreshToken}
          onActiveToolChange={(activeTool) =>
            setWorkbench((current) => ({ ...current, activeTool }))
          }
          onInstructionChange={(value) => {
            setInstruction(value);
            setEditGuardrail(null);
          }}
          onImageIntentChange={setImageIntent}
          onSubmitEdit={submitEdit}
          onApplySuggestedRedirect={() => {
            if (editGuardrail?.decision !== "redirect" || !editGuardrail.suggestedAlternative) return;
            setInstruction(editGuardrail.suggestedAlternative);
            void submitEdit({
              confirmRedirect: true,
              instruction: editGuardrail.suggestedAlternative,
            });
          }}
          onSizeChange={setWorkbenchSize}
          onWidthMenuToggle={toggleWidthMenu}
          onWidthMenuClose={() => setWidthMenuOpen(false)}
          onPreviewBreakpointChange={setPreviewWidth}
          onPreviewBreakpointCycle={cyclePreviewWidth}
          onGrabTabPointerDown={(event) =>
            handleResizePointerDown(event, "tab")
          }
          onGrabTabPointerMove={handleResizePointerMove}
          onGrabTabPointerUp={handleResizePointerUp}
          onEditorCommand={sendEditorCommand}
          onStructuredMutationComplete={(message) => {
            if (isRunBoundRequestCurrent(id, activeRunIdRef.current)) {
              handleStructuredMutationComplete(message);
            }
          }}
          onMotionPreview={previewSelectedMotion}
          onMotionReset={resetMotionPreview}
          onTokenPreview={previewToken}
        />
      ) : null}
    </main>
  );
}
