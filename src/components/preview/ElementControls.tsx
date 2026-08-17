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

  // Undo/redo for the shared element-history.json now lives in the
  // page-level UndoRedoRail (canvas-upgrade Wave 4, Play 8) -- it is reached
  // from every tool and with no selection, not only from here. This
  // component only issues its own structured mutations.
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
        | { ok: true }
        | { error: string }
        | null;
      if (!response.ok || !data || "error" in data) {
        throw new Error(
          (data && "error" in data && data.error) ||
            `element edit failed (${response.status})`,
        );
      }
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

  // Shared between the container branch and the ordinary branch below: a
  // section can always be reordered among its editable siblings, container
  // or not. moveTargets (overlay.js selectionFor(), canvas-upgrade Wave 5,
  // Play 7) mirrors elementEditor.ts's own refusal rules -- a control
  // guaranteed to fail (the first section moving earlier, fixed page chrome
  // in either direction, ...) is disabled here rather than left to round-
  // trip to the server to learn that. A fixture with no moveTargets at all
  // (only hand-built tests take this path; every real overlay.js selection
  // sets it) falls back to enabled -- the server's own guard still refuses
  // an impossible move, this is only the earlier, cheaper signal.
  const canMoveEarlier = selection.moveTargets?.earlier !== false;
  const canMoveLater = selection.moveTargets?.later !== false;
  const layoutControls = (
    <fieldset className="layout-controls">
      <legend>Layout order</legend>
      <p>
        Drag beside an editable sibling, press Alt+Arrow Up/Down in the
        preview, or use these controls.
      </p>
      <div>
        <button
          type="button"
          disabled={pending || !canMoveEarlier}
          title={canMoveEarlier ? undefined : "Nothing earlier to swap with here."}
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
          disabled={pending || !canMoveLater}
          title={canMoveLater ? undefined : "Nothing later to swap with here."}
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
  );

  // A container groups other editable elements rather than holding text of
  // its own -- elementEditor.ts's setDirectText() 409s unconditionally on
  // any target with a descendant data-edit-id, so the structured text-
  // replace box, the href field, and the button-action fieldset below are
  // guaranteed to fail here and are never worth offering (canvas-upgrade
  // Wave 4, Play 10: a control that cannot succeed is the defect, not a
  // convenience). Typography is left out too -- it is not the whole
  // section's typography, it is one inline style declaration on the section
  // element itself, which is not what "Typography" reads as here. What DOES
  // work on a section is the composer (plain-language instructions, always
  // present below this panel) and reordering it among its siblings.
  if (selection.behavior === "container") {
    return (
      <div className="element-controls">
        <p className="workbench-note">
          {selection.tag} is a section, not a single piece of text or link --
          structured value edits can&rsquo;t rewrite a whole section at once.
          Describe the change in the composer below, or reorder this section
          among its siblings here.
        </p>
        {layoutControls}
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

  return (
    <div className="element-controls">
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

      {layoutControls}

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
          className="btn-primary"
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
