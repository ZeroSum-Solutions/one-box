"use client";

import { useEffect, useState } from "react";
import type { EditorInteractionState, PreviewSelection } from "./previewState";

interface ElementControlsProps {
  runId: string;
  selection: PreviewSelection;
  editorState: EditorInteractionState;
  onEditorCommand: (action: "cancel" | "clear") => void;
  onMutationComplete: () => void;
}

interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

type Typography = {
  fontFamily: "untouched" | "inherit" | "display" | "body";
  fontSize:
    | "untouched"
    | "inherit"
    | "caption"
    | "body-sm"
    | "body"
    | "body-lg"
    | "heading-sm"
    | "heading"
    | "heading-lg"
    | "display";
  weight: "untouched" | "inherit" | "400" | "600" | "700";
  color: "untouched" | "inherit" | "text" | "muted" | "primary" | "accent";
  alignment: "untouched" | "inherit" | "left" | "center" | "right";
};

const DEFAULT_TYPOGRAPHY: Typography = {
  fontFamily: "untouched",
  fontSize: "untouched",
  weight: "untouched",
  color: "untouched",
  alignment: "untouched",
};

export function ElementControls({
  runId,
  selection,
  editorState,
  onEditorCommand,
  onMutationComplete,
}: ElementControlsProps) {
  const [text, setText] = useState(selection.text);
  const [originalText, setOriginalText] = useState(
    selection.originalText ?? selection.text,
  );
  const [href, setHref] = useState(selection.href ?? "");
  const [typography, setTypography] = useState<Typography>(DEFAULT_TYPOGRAPHY);
  const [buttonAction, setButtonAction] = useState<
    "untouched" | "none" | "scroll" | "submit"
  >("untouched");
  const [buttonTarget, setButtonTarget] = useState(
    selection.buttonAction?.target ?? "",
  );
  const [history, setHistory] = useState<HistoryState>({
    canUndo: false,
    canRedo: false,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setText(selection.text);
      setHref(selection.href ?? "");
      if (selection.originalText !== undefined)
        setOriginalText(selection.originalText);
      setTypography({
        fontFamily: selection.typography?.fontFamily ?? "untouched",
        fontSize: selection.typography?.fontSize ?? "untouched",
        weight: selection.typography?.weight ?? "untouched",
        color: selection.typography?.color ?? "untouched",
        alignment: selection.typography?.alignment ?? "untouched",
      });
      setButtonAction("untouched");
      setButtonTarget(selection.buttonAction?.target ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [
    selection.buttonAction,
    selection.href,
    selection.originalText,
    selection.text,
    selection.typography,
  ]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/elements?runId=${encodeURIComponent(runId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`history unavailable (${response.status})`);
        return (await response.json()) as HistoryState;
      })
      .then((next) => {
        if (!cancelled) setHistory(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [runId]);

  async function mutate(body: Record<string, unknown>, success: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/elements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, ...body }),
      });
      const data = (await response.json().catch(() => null)) as
        ({ ok: true } & HistoryState) | { error: string } | null;
      if (!response.ok || !data || "error" in data) {
        throw new Error(
          (data && "error" in data && data.error) ||
            `element edit failed (${response.status})`,
        );
      }
      setHistory({ canUndo: data.canUndo, canRedo: data.canRedo });
      setStatus(success);
      onMutationComplete();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "element edit failed",
      );
    } finally {
      setPending(false);
    }
  }

  function applyStructuredValue() {
    const changedTypography = Object.fromEntries(
      Object.entries(typography).filter(([, value]) => value !== "untouched"),
    );
    const patch: Record<string, unknown> = {};
    if (Object.keys(changedTypography).length > 0)
      patch.typography = changedTypography;
    if (selection.behavior === "text" || selection.behavior === "interactive")
      patch.text = text;
    if (selection.tag === "a") patch.href = href;
    if (selection.tag === "button") {
      if (buttonAction !== "untouched") {
        patch.buttonAction = {
          type: buttonAction,
          ...(buttonAction === "scroll" ? { target: buttonTarget } : {}),
        };
      }
    }
    void mutate(
      { action: "apply", editId: selection.editId, patch },
      "Structured value saved.",
    );
  }

  function cancelDraft() {
    setText(originalText);
    onEditorCommand("cancel");
    setStatus("Preview draft canceled.");
  }

  return (
    <div className="element-controls">
      <div className="element-history" aria-label="Element edit history">
        <button
          type="button"
          disabled={!history.canUndo || pending}
          onClick={() => void mutate({ action: "undo" }, "Undone.")}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!history.canRedo || pending}
          onClick={() => void mutate({ action: "redo" }, "Redone.")}
        >
          Redo
        </button>
      </div>

      <label className="workbench-field">
        <span>
          {selection.tag === "a" || selection.tag === "button"
            ? "Label"
            : "Text value"}
        </span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
        />
      </label>

      {selection.tag === "a" && (
        <label className="workbench-field">
          <span>Destination / action</span>
          <input
            value={href}
            onChange={(event) => setHref(event.target.value)}
            placeholder="#contact or https://…"
          />
        </label>
      )}

      {selection.tag === "button" && (
        <fieldset className="button-action-controls">
          <legend>Button action</legend>
          <p className="current-action">
            Current: {selection.buttonAction?.type ?? "none"}
            {selection.buttonAction?.explicit === false
              ? " (implicit form default)"
              : ""}
          </p>
          <label>
            Action
            <select
              value={buttonAction}
              onChange={(event) =>
                setButtonAction(event.target.value as typeof buttonAction)
              }
            >
              <option value="untouched">Keep current</option>
              <option value="none">No action</option>
              <option value="scroll">Scroll to section</option>
              <option value="submit">Submit containing form</option>
            </select>
          </label>
          {buttonAction === "scroll" && (
            <label>
              Target
              <input
                value={buttonTarget}
                onChange={(event) => setButtonTarget(event.target.value)}
                placeholder="#contact"
              />
            </label>
          )}
        </fieldset>
      )}

      <fieldset className="layout-controls">
        <legend>Layout order</legend>
        <p>
          Drag beside an editable sibling, press Alt+Arrow Up/Down in the
          preview, or use these controls.
        </p>
        <div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              void mutate(
                {
                  action: "apply",
                  editId: selection.editId,
                  patch: { move: "previous" },
                },
                "Moved earlier.",
              )
            }
          >
            Move earlier
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              void mutate(
                {
                  action: "apply",
                  editId: selection.editId,
                  patch: { move: "next" },
                },
                "Moved later.",
              )
            }
          >
            Move later
          </button>
        </div>
      </fieldset>

      <fieldset className="typography-controls">
        <legend>Typography</legend>
        <label>
          Family
          <select
            value={typography.fontFamily}
            onChange={(event) =>
              setTypography((current) => ({
                ...current,
                fontFamily: event.target.value as Typography["fontFamily"],
              }))
            }
          >
            <option value="untouched">Keep current</option>
            <option value="inherit">Reset</option>
            <option value="display">Display token</option>
            <option value="body">Body token</option>
          </select>
        </label>
        <label>
          Size
          <select
            value={typography.fontSize}
            onChange={(event) =>
              setTypography((current) => ({
                ...current,
                fontSize: event.target.value as Typography["fontSize"],
              }))
            }
          >
            <option value="untouched">Keep current</option>
            <option value="inherit">Reset</option>
            <option value="caption">Caption</option>
            <option value="body-sm">Body small</option>
            <option value="body">Body</option>
            <option value="body-lg">Body large</option>
            <option value="heading-sm">Heading small</option>
            <option value="heading">Heading</option>
            <option value="heading-lg">Heading large</option>
            <option value="display">Display</option>
          </select>
        </label>
        <label>
          Weight
          <select
            value={typography.weight}
            onChange={(event) =>
              setTypography((current) => ({
                ...current,
                weight: event.target.value as Typography["weight"],
              }))
            }
          >
            <option value="untouched">Keep current</option>
            <option value="inherit">Reset</option>
            <option value="400">Regular</option>
            <option value="600">Semibold</option>
            <option value="700">Bold</option>
          </select>
        </label>
        <label>
          Color
          <select
            value={typography.color}
            onChange={(event) =>
              setTypography((current) => ({
                ...current,
                color: event.target.value as Typography["color"],
              }))
            }
          >
            <option value="untouched">Keep current</option>
            <option value="inherit">Reset</option>
            <option value="text">Text</option>
            <option value="muted">Muted</option>
            <option value="primary">Primary</option>
            <option value="accent">Accent</option>
          </select>
        </label>
        <label>
          Align
          <select
            value={typography.alignment}
            onChange={(event) =>
              setTypography((current) => ({
                ...current,
                alignment: event.target.value as Typography["alignment"],
              }))
            }
          >
            <option value="untouched">Keep current</option>
            <option value="inherit">Reset</option>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
      </fieldset>

      <div className="element-controls__actions">
        {editorState === "text-editing" && (
          <button type="button" className="ghost-action" onClick={cancelDraft}>
            Cancel draft
          </button>
        )}
        <button
          type="button"
          className="pill-button"
          disabled={pending}
          onClick={applyStructuredValue}
        >
          {pending ? "Checking gates…" : "Save value"}
        </button>
      </div>
      {status && (
        <p className="edit-status" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="edit-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
