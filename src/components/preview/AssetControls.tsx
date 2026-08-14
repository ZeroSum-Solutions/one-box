"use client";

import { useState } from "react";
import type { PreviewSelection } from "./previewState";

interface AssetControlsProps {
  runId: string;
  selection: PreviewSelection;
  onMutationComplete: (message: string) => void;
}

type AssetTarget = {
  supported: boolean;
  summary: string;
  reason?: string;
};

const NON_IMAGE_MEDIA_TAGS = new Set(["audio", "canvas", "iframe", "source", "video"]);

/**
 * The edit endpoint only replaces an img (or an img inside the selected
 * element). Keep the UI boundary equally narrow so a user never starts a
 * paid generation for an unsupported media primitive.
 */
export function classifyAssetTarget(selection: PreviewSelection): AssetTarget {
  const tag = selection.tag.toLowerCase();
  const summary = `${tag} · ${selection.editId}`;
  if (selection.behavior === "unsupported") {
    return {
      supported: false,
      summary,
      reason: "This selection is protected from persistent edits.",
    };
  }
  if (NON_IMAGE_MEDIA_TAGS.has(tag)) {
    return {
      supported: false,
      summary,
      reason: "This route replaces images only; video, audio, canvas, and embeds stay live.",
    };
  }
  if (selection.assetKind === "image") {
    return { supported: true, summary };
  }
  return {
    supported: false,
    summary,
    reason: "Select an image or a named image/media region in the preview.",
  };
}

export function imageEditPayload(
  runId: string,
  editId: string,
  instruction: string,
  requestId: string,
) {
  return {
    runId,
    editId,
    instruction: instruction.trim(),
    imageIntent: true,
    requestId,
  };
}

export function AssetControls({
  runId,
  selection,
  onMutationComplete,
}: AssetControlsProps) {
  const target = classifyAssetTarget(selection);
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function replaceImage() {
    if (!target.supported || pending || !instruction.trim()) return;
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      // This relative browser request supplies the required same-origin and
      // Fetch Metadata headers; Content-Type makes the mutation unambiguous.
      const response = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          imageEditPayload(
            runId,
            selection.editId,
            instruction,
            crypto.randomUUID(),
          ),
        ),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok: true; gates?: Array<{ pass: boolean }>; gatesClean?: boolean }
        | { error?: string }
        | null;
      const success = data && "ok" in data && data.ok === true ? data : null;
      if (!response.ok || !success) {
        throw new Error(
          (data && "error" in data && data.error) ||
            `Image replacement failed (${response.status}).`,
        );
      }
      const gateSummary = success.gates
        ? ` Gates ${success.gatesClean ? "clean" : "flagged"} (${success.gates.filter((gate) => gate.pass).length}/${success.gates.length} passing).`
        : "";
      const message = `Image replaced.${gateSummary}`;
      setInstruction("");
      setStatus(message);
      onMutationComplete(message);
    } catch (replacementError) {
      setError(
        replacementError instanceof Error
          ? replacementError.message
          : "Image replacement failed.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!target.supported) {
    return (
      <div className="workbench-state workbench-state--unsupported" role="status">
        <span className="workbench-state__label">unsupported</span>
        <strong>Image replacement unavailable</strong>
        <p>{target.reason}</p>
        <p className="workbench-note">Selected: {target.summary}</p>
      </div>
    );
  }

  return (
    <div className="asset-controls">
      <div className="selection-chip" aria-label="Selected image target">
        <span className="selection-chip__tag">{selection.tag}</span>
        {selection.editId}
      </div>
      <p className="workbench-note">
        Selected image target: {target.summary}. Generation preserves the
        approved imagery brief and runs the normal blocking gates.
      </p>
      <label className="workbench-field">
        <span>Image prompt</span>
        <textarea
          aria-label="Image prompt"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Describe the replacement image…"
          rows={4}
          disabled={pending}
        />
      </label>
      <button
        type="button"
        className="pill-button"
        disabled={pending || !instruction.trim()}
        onClick={() => void replaceImage()}
      >
        {pending ? "Generating image…" : "Generate and replace image"}
      </button>
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
