"use client";

import { useEffect, useState } from "react";
import type { PreviewMode } from "./previewState";

interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export interface UndoRedoRailProps {
  runId: string;
  mode: PreviewMode;
  /** Bumped by the page whenever any surface (composer, ElementControls,
   * AssetControls, TokenControls, AssistantPanel apply) finishes a mutation
   * -- the same signal GateStrip already refetches on. Reusing it here means
   * this rail reflects real server-side history state, not an optimistic
   * local guess, without adding a poll of its own (canvas-upgrade Wave 4,
   * Play 8). */
  refreshToken: number;
  onMutationComplete: (message?: string) => void;
}

/**
 * Persistent Undo/Redo/Reset rail (canvas-upgrade Wave 4, Play 8). Surfaces
 * the one element-history.json elementEditor.ts already maintains -- it
 * calls the same GET/POST /api/elements endpoints ElementControls.tsx used
 * to call itself before this rail existed, lifted here so undo/redo is
 * reachable from every tool and with no selection at all, not only from a
 * "text" selection's own panel.
 *
 * View-mode guard: undo/redo mutate the site, so in view mode this UNMOUNTS
 * (returns null) rather than rendering disabled -- the same discipline
 * PersistentComposer applies, for the same reason (a disabled-but-present
 * control would still act the instant mode flips back to edit).
 */
export function UndoRedoRail({
  runId,
  mode,
  refreshToken,
  onMutationComplete,
}: UndoRedoRailProps) {
  const [history, setHistory] = useState<HistoryState>({
    canUndo: false,
    canRedo: false,
  });
  const [pending, setPending] = useState<"undo" | "redo" | "reset" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit") return;
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
  }, [runId, mode, refreshToken]);

  if (mode !== "edit") return null;

  async function moveHistory(action: "undo" | "redo"): Promise<HistoryState> {
    const response = await fetch("/api/elements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, action }),
    });
    const data = (await response.json().catch(() => null)) as
      | ({ ok: true } & HistoryState)
      | { error: string }
      | null;
    if (!response.ok || !data || "error" in data) {
      throw new Error(
        (data && "error" in data && data.error) ||
          `${action} failed (${response.status})`,
      );
    }
    return { canUndo: data.canUndo, canRedo: data.canRedo };
  }

  async function act(action: "undo" | "redo") {
    if (pending) return;
    setPending(action);
    setError(null);
    try {
      const next = await moveHistory(action);
      setHistory(next);
      onMutationComplete(action === "undo" ? "Undone." : "Redone.");
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : `${action} failed`,
      );
    } finally {
      setPending(null);
    }
  }

  // Reset unwinds every edit back to the run's original build. It is not a
  // second history -- it drives the SAME undo step repeatedly until the
  // cursor reaches 0, the one bounded escape hatch (guard below) against a
  // runaway loop if the server ever reports canUndo:true without end.
  async function reset() {
    if (pending) return;
    setPending("reset");
    setError(null);
    try {
      let next = history;
      let steps = 0;
      while (next.canUndo && steps < 1000) {
        next = await moveHistory("undo");
        steps += 1;
      }
      setHistory(next);
      onMutationComplete("Reset to the original build.");
    } catch (resetError) {
      setError(
        resetError instanceof Error ? resetError.message : "reset failed",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="undo-redo-rail" role="group" aria-label="Edit history">
      <button
        type="button"
        className="btn-ghost btn-mini"
        disabled={!history.canUndo || Boolean(pending)}
        onClick={() => void act("undo")}
      >
        {pending === "undo" ? "Undoing…" : "Undo"}
      </button>
      <button
        type="button"
        className="btn-ghost btn-mini"
        disabled={!history.canRedo || Boolean(pending)}
        onClick={() => void act("redo")}
      >
        {pending === "redo" ? "Redoing…" : "Redo"}
      </button>
      <button
        type="button"
        className="btn-ghost btn-mini"
        title="Undo every change back to the original build"
        disabled={!history.canUndo || Boolean(pending)}
        onClick={() => void reset()}
      >
        {pending === "reset" ? "Resetting…" : "Reset"}
      </button>
      {error && (
        <span className="undo-redo-rail__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
