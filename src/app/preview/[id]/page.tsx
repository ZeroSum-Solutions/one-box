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
import Link from "next/link";
import { Workbench, type WorkbenchTool } from "@/components/preview/Workbench";
import {
  DEFAULT_WORKBENCH_STATE,
  INITIAL_PREVIEW_COMPATIBILITY_STATE,
  applyCompactDefault,
  breakpointForWidth,
  clampPanelWidth,
  didComposerTargetChange,
  isTrustedEditorMessage,
  isRunBoundRequestCurrent,
  isWorkbenchStateRestoredForRun,
  nearestPreviewBreakpoint,
  panelWidthForBreakpoint,
  panelWidthBounds,
  previewWidthForBreakpoint,
  persistWorkbenchState,
  readEditorStateMessage,
  resolvePreviewCompatibility,
  restoreWorkbenchState,
  workbenchSizeForWidth,
  type EditorInteractionState,
  type PersistedWorkbenchState,
  type PreviewBreakpoint,
  type PreviewCompatibilityState,
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
  "layers",
  "research",
  "assistant",
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
  const previousComposerTargetRef = useRef<string | null>(null);
  const [selection, setSelection] = useState<PreviewSelection | null>(null);
  const [canStepBack, setCanStepBack] = useState(false);
  const [editorState, setEditorState] =
    useState<EditorInteractionState>("idle");
  const [editorReason, setEditorReason] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [imageIntent, setImageIntent] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editResult, setEditResult] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editGuardrail, setEditGuardrail] = useState<EditGuardrail | null>(null);
  const [referenceAssetId, setReferenceAssetId] = useState<string | null>(null);
  const [referenceLabel, setReferenceLabel] = useState<string | null>(null);
  const [gateRefreshToken, setGateRefreshToken] = useState(0);
  const [iframeVersion, setIframeVersion] = useState(0);
  const [blockedGates, setBlockedGates] = useState<string[]>([]);
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
  const [compatibilityState, setCompatibilityState] =
    useState<PreviewCompatibilityState>(INITIAL_PREVIEW_COMPATIBILITY_STATE);

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
    previousComposerTargetRef.current = null;
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
      setEditGuardrail(null);
      setReferenceAssetId(null);
      setReferenceLabel(null);
      setGateRefreshToken(0);
      setIframeVersion(0);
      setPreviewBreakpoint("desktop");
      setWidthMenuOpen(false);
      setWidthAnnouncement(null);
      setIsResizing(false);
      setCompatibilityState(INITIAL_PREVIEW_COMPATIBILITY_STATE);
      setWorkbench(
        applyCompactDefault(
          restoreWorkbenchState(localStorage, id),
          window.innerWidth,
        ),
      );
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
  const interactive = restored && compatibilityState.editingAvailable;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/evidence/${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        const payload: unknown = await response.json().catch(() => null);
        if (cancelled) return;
        const nextCompatibility = resolvePreviewCompatibility(
          response.ok,
          payload,
        );
        setCompatibilityState(nextCompatibility);
        if (!nextCompatibility.editingAvailable) {
          setWorkbench((current) => ({ ...current, mode: "view" }));
        }
      } catch {
        if (cancelled) return;
        setCompatibilityState(resolvePreviewCompatibility(false, null));
        setWorkbench((current) => ({ ...current, mode: "view" }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!restored) return;
    const viewport = iframeRef.current;
    if (!viewport) return;
    // clientWidth (content box), not getBoundingClientRect().width (border
    // box): .preview-frame carries a 1px border on each side (workbench.css),
    // so the border box overshoots the generated site's actual viewport by
    // 2px -- enough to misclassify a 767px tablet preset as "desktop" once
    // its border box crosses the 768px threshold in breakpointForWidth.
    const update = () =>
      setPreviewBreakpoint(breakpointForWidth(viewport.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [iframeVersion, restored, workbench.mode]);

  // A build that fails a blocking gate is still served, and the workbench used
  // to arm itself over it as if nothing were wrong — every edit then refused on
  // a failure the site arrived with, which reads as an editor that does not
  // work. Read the gate status the build left behind and say so up front.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/sites/${encodeURIComponent(id)}/gates.json`
        );
        if (!response.ok) return;
        const reports: unknown = await response.json();
        if (cancelled || !Array.isArray(reports)) return;
        setBlockedGates(
          (reports as EditApiGate[])
            .filter((report) => report?.blocking && !report.pass)
            .map((report) => report.gate)
        );
      } catch {
        // No gate status to show is not itself a failure worth reporting.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, gateRefreshToken]);

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
      // The composer's draft is scoped to whichever element it was written
      // against (Wave 3 review finding, gap #1/#2). Selecting a different
      // element -- including clearing the selection outright via the chip's
      // Clear button, which round-trips through overlay.js back to a
      // selection: null message -- must not leave a stale draft sitting in
      // the box ready to fire against the wrong target with one Apply
      // click. Re-selecting the SAME element (same editId) is not a target
      // change and must not nuke a draft still being typed.
      const nextComposerTarget = message.selection?.editId ?? null;
      if (didComposerTargetChange(previousComposerTargetRef.current, nextComposerTarget)) {
        setInstruction("");
        setEditGuardrail(null);
        setEditError(null);
      }
      previousComposerTargetRef.current = nextComposerTarget;
      setSelection(message.selection);
      setCanStepBack(Boolean(message.canStepBack));
      setWorkbench((current) => {
        const nextActiveTool =
          message.state === "dragging"
            ? "selection"
            : // The Layers/Navigator panel stays open across an ordinary
              // canvas selection (canvas-upgrade Wave 5, Play 6d) -- the
              // same "one selection state" claim direction 1 of
              // layers-sync proves: parked, the way a real Navigator panel
              // stays open across canvas clicks, rather than yanking the
              // user to Text/Selection the instant they click something
              // while browsing the tree. A drag is still routed to
              // "selection" regardless (its own reorder note lives there,
              // not in Layers).
              current.activeTool === "layers"
              ? "layers"
              : message.selection?.behavior === "text" ||
                  message.selection?.behavior === "interactive"
                ? "text"
                : // A container scopes layout, not a single line of text
                  // or a button action -- it belongs on the
                  // selection/layout tool, same as a plain leaf selection,
                  // but named explicitly rather than left to the generic
                  // fallback so the routing table stays legible as more
                  // container-specific tooling lands.
                  message.selection
                  ? "selection"
                  : null;
        if (!nextActiveTool) return current;
        if (current.size !== "collapsed") {
          return current.activeTool === nextActiveTool
            ? current
            : { ...current, activeTool: nextActiveTool };
        }
        // A selection or an in-progress edit has to surface the controls
        // that act on it. On a compact workspace the workbench starts
        // collapsed by default (applyCompactDefault), and it can also be
        // collapsed manually at any width -- either way, leaving it
        // collapsed here would hide those controls with no way back except
        // the rail's own reopen button, even though the user just asked to
        // edit something. Reopen using the same restored-width math
        // setWorkbenchSize("normal") uses for the reopen button.
        const workspaceWidth =
          workspaceRef.current?.getBoundingClientRect().width ??
          window.innerWidth;
        const restoredWidth = clampPanelWidth(
          current.panelWidth,
          workspaceWidth,
        );
        const nextSize = workbenchSizeForWidth(restoredWidth);
        return {
          ...current,
          activeTool: nextActiveTool,
          size: nextSize,
          lastOpenSize: nextSize,
          panelWidth: restoredWidth,
        };
      });
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  function setMode(mode: PreviewMode) {
    setSelection(null);
    setCanStepBack(false);
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

  // Select-Parent Escalation (canvas-upgrade A3, Play 3) and the breadcrumb
  // strip (Play 9) — the pointer routes that must agree with overlay.js's
  // own ArrowUp/ArrowDown keyboard shortcuts.
  function selectParent() {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "onebox-editor-command", action: "select-parent" },
      "*",
    );
  }

  function stepBackSelection() {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "onebox-editor-command", action: "step-back" },
      "*",
    );
  }

  function selectAncestor(editId: string) {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "onebox-editor-command", action: "select-by-id", editId },
      "*",
    );
  }

  // Layers/Navigator row hover (canvas-upgrade Wave 5, Play 6c) — a
  // separate command from selection, so browsing the tree never moves the
  // canvas selection, only its highlight.
  function hoverTreeElement(editId: string | null) {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "onebox-editor-command", action: "tree-hover", editId: editId ?? undefined },
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
    if (!interactive || !selection || !submittedInstruction || isEditing) return;
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
          ...(referenceAssetId ? { referenceAssetId } : {}),
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
      setReferenceAssetId(null);
      setReferenceLabel(null);
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
  const effectiveMode: PreviewMode = interactive ? workbench.mode : "view";
  const safeIframeSrc = `/api/sites/${encodeURIComponent(id)}/index.html${effectiveMode === "edit" ? "?edit=1" : ""}`;

  return (
    <main
      ref={workspaceRef}
      className={`preview-layout preview-layout--${interactive ? workbench.size : "collapsed"}`}
      style={style}
    >
      <header className="preview-header">
        <div className="preview-header__identity">
          <span className="preview-header__title">Site preview</span>
          <span className="preview-header__sep" aria-hidden="true">
            /
          </span>
          <span className="mono-meta preview-header__run">{id}</span>
        </div>
        <div className="preview-header__actions">
          <div
            className="preview-mode-switch"
            role="group"
            aria-label="Preview mode"
          >
            <button
              type="button"
              className={`seg-pill ${effectiveMode === "view" ? "seg-pill--active" : ""}`}
              disabled={!restored}
              aria-pressed={effectiveMode === "view"}
              onClick={() => setMode("view")}
            >
              View
            </button>
            <button
              type="button"
              className={`seg-pill ${effectiveMode === "edit" ? "seg-pill--active" : ""}`}
              disabled={!interactive}
              aria-pressed={effectiveMode === "edit"}
              onClick={() => setMode("edit")}
            >
              Edit
            </button>
          </div>
          <Link
            className="btn-ghost btn-mini preview-header__evidence"
            href={`/evidence/${id}`}
          >
            Review evidence
          </Link>
        </div>
      </header>

      {compatibilityState.notice && (
        <div className="preview-alert" role="status">
          <strong className="preview-alert__title">
            {compatibilityState.status === "legacy"
              ? compatibilityState.compatibility.label
              : "Compatibility check failed"}
          </strong>
          <span className="preview-alert__detail">
            {compatibilityState.notice}
          </span>
        </div>
      )}

      {compatibilityState.status === "active" && blockedGates.length > 0 && (
        <div className="preview-alert" role="status">
          <strong className="preview-alert__title">
            This build did not pass its gates, so it cannot accept edits.
          </strong>
          <span className="preview-alert__detail">
            Failing:{" "}
            <span className="mono-meta">{blockedGates.join(", ")}</span>. Every
            change is refused until these pass — regenerate the site, or repair
            it from{" "}
            <Link href={`/evidence/${id}`}>Review evidence</Link>.
          </span>
        </div>
      )}

      <div className="preview-body">
        <section
          className="preview-viewport"
          aria-label="Rendered site preview"
        >
          {interactive && (
            <a href="#workbench-tools" className="visually-hidden preview-skip-link">
              Skip to workbench
            </a>
          )}
          {restored ? (
            <iframe
              key={`${iframeVersion}:${effectiveMode}`}
              ref={iframeRef}
              className="preview-frame"
              src={safeIframeSrc}
              sandbox={
                effectiveMode === "view"
                  ? "allow-scripts allow-forms allow-popups allow-downloads"
                  : "allow-scripts"
              }
              title={`${effectiveMode === "view" ? "View" : "Edit"} site preview`}
            />
          ) : (
            <div className="preview-frame-pending" role="status">
              Restoring preview…
            </div>
          )}
        </section>

        {interactive && <div
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
        />}

        {interactive ? (
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
          canStepBack={canStepBack}
          editorState={editorState}
          editorReason={editorReason}
          instruction={instruction}
          imageIntent={imageIntent}
          isEditing={isEditing}
          editResult={editResult}
          editError={editError}
          editGuardrail={editGuardrail}
          referenceAssetId={referenceAssetId}
          referenceLabel={referenceLabel}
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
          onAttachReference={(assetId, label) => {
            setReferenceAssetId(assetId);
            setReferenceLabel(label);
          }}
          onClearReference={() => {
            setReferenceAssetId(null);
            setReferenceLabel(null);
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
          onSelectParent={selectParent}
          onStepBack={stepBackSelection}
          onSelectAncestor={selectAncestor}
          onHoverElement={hoverTreeElement}
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
      </div>
    </main>
  );
}
