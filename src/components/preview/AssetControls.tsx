"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PreviewSelection } from "./previewState";

interface AssetControlsProps {
  runId: string;
  selection: PreviewSelection | null;
  onMutationComplete: (message: string) => void;
}

type AssetTarget = {
  supported: boolean;
  summary: string;
  reason?: string;
};

interface ImageModel {
  id: string;
  label: string;
  provider: string;
  descriptor: string;
  aspectRatios: string[];
  qualities: Array<"low" | "medium" | "high">;
}

interface LibraryItem {
  id: string;
  status: "pending" | "completed" | "failed";
  prompt: string | null;
  model: string;
  provider: string;
  aspectRatio: string | null;
  quality: "low" | "medium" | "high" | null;
  dimensions: { width: number; height: number } | null;
  mimeType: string | null;
  createdAt: string;
  credits: number | null;
  error: string | null;
  outputPath: string | null;
  source: {
    kind: "generated" | "legacy";
    parentAssetId: string | null;
    targetEditId: string | null;
    originalPath: string | null;
  };
  usage: Array<{ editId: string | null; src: string }>;
  url: string | null;
}

interface LibraryPayload {
  models: ImageModel[];
  library: { version: 1; items: LibraryItem[] };
}

interface PlacementGate {
  gate: string;
  pass: boolean;
  blocking: boolean;
}

export function blockingPlacementFailure(
  gates: PlacementGate[] | undefined,
): string | null {
  const failures = gates?.filter((gate) => gate.blocking && !gate.pass) ?? [];
  if (failures.length === 0) return null;
  const names = failures.map((gate) => gate.gate).join(", ");
  return `Image placement was blocked because ${names} did not pass. The selected image was not replaced.`;
}

export interface GenerationAttemptSnapshot {
  requestId: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  quality: "low" | "medium" | "high";
  sourceAssetId: string | null;
  targetEditId: string | null;
}

export function retainGenerationAttempt(
  current: GenerationAttemptSnapshot | null,
  proposed: GenerationAttemptSnapshot,
): GenerationAttemptSnapshot {
  return current ?? proposed;
}

const NON_IMAGE_MEDIA_TAGS = new Set([
  "audio",
  "canvas",
  "iframe",
  "source",
  "video",
]);

/** Keep paid actions narrower than the server mutation boundary. */
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
  // A container's own assetKind can read "image" merely because it WRAPS an
  // <img> descendant somewhere inside it (overlay.js selectionFor() sets
  // assetKind from el.querySelector("img")) -- that must not be read as "this
  // whole section is a single swappable image" (canvas-upgrade Wave 4, Play
  // 10). Select the image itself to replace it.
  if (selection.behavior === "container") {
    return {
      supported: false,
      summary,
      reason:
        "This is a section, not a single image. Select the image inside it to replace that image specifically.",
    };
  }
  if (NON_IMAGE_MEDIA_TAGS.has(tag)) {
    return {
      supported: false,
      summary,
      reason:
        "This route replaces images only; video, audio, canvas, and embeds stay live.",
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

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function modelLabel(item: LibraryItem, models: ImageModel[]) {
  if (item.model === "unknown") return "Existing site image";
  return models.find((model) => model.id === item.model)?.label ?? item.model;
}

export function AssetControls({
  runId,
  selection,
  onMutationComplete,
}: AssetControlsProps) {
  const target = selection ? classifyAssetTarget(selection) : null;
  const [view, setView] = useState<"library" | "generate">("library");
  const [models, setModels] = useState<ImageModel[]>([]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [quality, setQuality] = useState<"low" | "medium" | "high">("high");
  const [meteredConsent, setMeteredConsent] = useState(false);
  const [sourceAssetId, setSourceAssetId] = useState<string | null>(null);
  const [generationAttempt, setGenerationAttempt] =
    useState<GenerationAttemptSnapshot | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<LibraryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => models.find((candidate) => candidate.id === model) ?? models[0],
    [model, models],
  );

  const loadLibrary = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(runId)}`, {
        signal,
      });
      const data = (await response.json().catch(() => null)) as
        | LibraryPayload
        | { error?: string }
        | null;
      if (!response.ok || !data || !("library" in data)) {
        throw new Error(
          (data && "error" in data && data.error) ||
            `Image library unavailable (${response.status}).`,
        );
      }
      setError(null);
      setModels(data.models);
      setItems(data.library.items);
      setModel((current) => current || data.models[0]?.id || "");
      setAspectRatio((current) =>
        data.models[0]?.aspectRatios.includes(current)
          ? current
          : data.models[0]?.aspectRatios[0] || "1:1",
      );
    } catch (loadError) {
      if ((loadError as Error).name !== "AbortError") {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Image library unavailable.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => void loadLibrary(controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadLibrary]);

  function configureRegeneration(item: LibraryItem) {
    setGenerationAttempt(null);
    setSourceAssetId(item.id);
    setPrompt(item.prompt ?? "");
    if (
      item.aspectRatio &&
      selectedModel?.aspectRatios.includes(item.aspectRatio)
    ) {
      setAspectRatio(item.aspectRatio);
    }
    if (item.quality) setQuality(item.quality);
    setMeteredConsent(false);
    setError(null);
    setStatus(null);
    setView("generate");
  }

  async function generateConfiguredImage() {
    if (
      pendingAction ||
      !prompt.trim() ||
      !selectedModel ||
      !meteredConsent
    )
      return;
    const attempt = retainGenerationAttempt(generationAttempt, {
      requestId: crypto.randomUUID(),
      prompt: prompt.trim(),
      model: selectedModel.id,
      aspectRatio,
      quality,
      sourceAssetId,
      targetEditId:
        !sourceAssetId && target?.supported && selection
          ? selection.editId
          : null,
    });
    setGenerationAttempt(attempt);
    setPendingAction("generate");
    setError(null);
    setStatus("Reserving the credit estimate, then generating with Higgsfield…");
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(runId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          attempt.sourceAssetId
            ? {
                action: "regenerate",
                requestId: attempt.requestId,
                assetId: attempt.sourceAssetId,
                prompt: attempt.prompt,
                model: attempt.model,
                aspectRatio: attempt.aspectRatio,
                quality: attempt.quality,
                meteredConsent: true,
              }
            : {
                action: "generate",
                requestId: attempt.requestId,
                prompt: attempt.prompt,
                model: attempt.model,
                aspectRatio: attempt.aspectRatio,
                quality: attempt.quality,
                meteredConsent: true,
                ...(attempt.targetEditId
                  ? { targetEditId: attempt.targetEditId }
                  : {}),
              },
        ),
      });
      const data = (await response.json().catch(() => null)) as
        | {
            ok: true;
            item: LibraryItem;
            library: { items: LibraryItem[] };
          }
        | { error?: string }
        | null;
      if (!response.ok || !data || !("ok" in data)) {
        throw new Error(
          (data && "error" in data && data.error) ||
            `Image generation failed (${response.status}).`,
        );
      }
      setItems(data.library.items);
      if (data.item.status === "pending") {
        setStatus(
          "This saved request is still generating. Check it again with the same request id.",
        );
        return;
      }
      setGenerationAttempt(null);
      setStatus(
        data.item.status === "completed"
          ? "Image generated and saved to this project."
          : "Generation finished with a recorded failure. Your prompt is unchanged.",
      );
      setMeteredConsent(false);
      setSourceAssetId(null);
      if (data.item.status === "completed") {
        setPrompt("");
        setView("library");
      }
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Image generation failed.",
      );
      setStatus(
        "The request outcome is unknown. Retry checks the same saved request without starting another generation.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function placeImage(item: LibraryItem) {
    if (!selection || !target?.supported || pendingAction) return;
    setPendingAction(item.id);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(runId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "place",
          assetId: item.id,
          editId: selection.editId,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok: true; gates?: PlacementGate[]; item: LibraryItem }
        | { error?: string; gates?: PlacementGate[] }
        | null;
      const gateFailure = blockingPlacementFailure(data?.gates);
      if (gateFailure) throw new Error(gateFailure);
      if (!response.ok || !data || !("ok" in data)) {
        throw new Error(
          (data && "error" in data && data.error) ||
            `Image placement failed (${response.status}).`,
        );
      }
      const gateSummary = data.gates
        ? ` ${data.gates.filter((gate) => gate.pass).length}/${data.gates.length} blocking gates passed.`
        : "";
      const message = `Selected image replaced.${gateSummary}`;
      setStatus(message);
      await loadLibrary();
      onMutationComplete(message);
    } catch (placementError) {
      setError(
        placementError instanceof Error
          ? placementError.message
          : "Image placement failed.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="asset-controls">
      <div className="asset-view-switch" role="group" aria-label="Asset view">
        <button
          type="button"
          aria-pressed={view === "library"}
          onClick={() => setView("library")}
        >
          Library
        </button>
        <button
          type="button"
          aria-pressed={view === "generate"}
          onClick={() => setView("generate")}
        >
          Generate
        </button>
      </div>

      {selection && (
        <div className="selection-chip" aria-label="Selected image target">
          <span className="selection-chip__tag">{selection.tag}</span>
          {selection.editId}
        </div>
      )}

      {view === "library" ? (
        <section className="asset-library" aria-label="Project image library">
          <div className="asset-section-heading">
            <div>
              <strong>Project images</strong>
              <p className="workbench-note">
                Generated and existing images for this project only.
              </p>
            </div>
            <button
              type="button"
              className="asset-quiet-action"
              disabled={loading}
              onClick={() => void loadLibrary()}
            >
              Refresh
            </button>
          </div>

          {loading && items.length === 0 ? (
            <p className="workbench-note" role="status">
              Loading project images…
            </p>
          ) : items.length === 0 ? (
            <div className="workbench-state" role="status">
              <strong>No project images yet</strong>
              <p>Generate the first image without leaving the workbench.</p>
            </div>
          ) : (
            <div className="asset-library-grid">
              {items.map((item) => (
                <article
                  key={item.id}
                  className={`asset-library-card asset-library-card--${item.status}`}
                >
                  <div className="asset-library-card__thumb">
                    {item.url && item.status === "completed" ? (
                      // Generated-site images are served locally by the guarded
                      // project asset route rather than a third-party host.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt={item.prompt || "Existing project image"}
                        loading="lazy"
                      />
                    ) : (
                      <div className="asset-library-card__placeholder">
                        {item.status === "pending" ? "Generating…" : "No output"}
                      </div>
                    )}
                    <span className={`asset-status asset-status--${item.status}`}>
                      {item.status === "pending" ? "Generating" : item.status}
                    </span>
                  </div>
                  <div className="asset-library-card__body">
                    <strong>{modelLabel(item, models)}</strong>
                    <p className="asset-library-card__prompt">
                      {item.prompt || "Prompt unknown — existing site image"}
                    </p>
                    <dl className="asset-meta">
                      <div>
                        <dt>Size</dt>
                        <dd>
                          {item.dimensions
                            ? `${item.dimensions.width}×${item.dimensions.height}`
                            : item.aspectRatio || "Unknown"}
                        </dd>
                      </div>
                      <div>
                        <dt>Created</dt>
                        <dd>{formatCreatedAt(item.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Usage</dt>
                        <dd>
                          {item.usage.length
                            ? item.usage
                                .map((usage) => usage.editId || usage.src)
                                .join(", ")
                            : "Unused"}
                        </dd>
                      </div>
                      {item.credits != null && (
                        <div>
                          <dt>Cost</dt>
                          <dd>{item.credits} credits</dd>
                        </div>
                      )}
                    </dl>
                    {item.error && (
                      <p className="asset-card-error" role="alert">
                        {item.error}
                      </p>
                    )}
                    <div className="asset-card-actions">
                      {item.url && (
                        <button
                          type="button"
                          onClick={() => setPreviewAsset(item)}
                        >
                          Preview
                        </button>
                      )}
                      {item.status === "completed" && target?.supported && (
                        <button
                          type="button"
                          disabled={Boolean(pendingAction)}
                          onClick={() => void placeImage(item)}
                        >
                          {pendingAction === item.id
                            ? "Replacing…"
                            : "Replace selected"}
                        </button>
                      )}
                      {item.status !== "pending" && (
                        <button
                          type="button"
                          onClick={() => configureRegeneration(item)}
                        >
                          {item.status === "failed" ? "Retry" : "Regenerate"}
                        </button>
                      )}
                      {item.url && (
                        <a href={item.url} download>
                          Download
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="asset-generate" aria-label="Generate project image">
          <div className="asset-section-heading">
            <div>
              <strong>{sourceAssetId ? "Regenerate image" : "Generate image"}</strong>
              <p className="workbench-note">
                Saved to this project’s library; placement is a separate action.
              </p>
            </div>
          </div>
          {sourceAssetId && (
            <div className="asset-lineage">
              Regenerating from saved asset <code>{sourceAssetId.slice(0, 12)}</code>
              <button
                type="button"
                onClick={() => {
                  setSourceAssetId(null);
                  setMeteredConsent(false);
                }}
              >
                Clear
              </button>
            </div>
          )}
          {selectedModel ? (
            <>
              <label className="workbench-field">
                <span>Model</span>
                <select
                  aria-label="Image model"
                  value={selectedModel.id}
                onChange={(event) => setModel(event.target.value)}
                  disabled={Boolean(pendingAction) || Boolean(generationAttempt)}
                >
                  {models.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="asset-model-descriptor">
                {selectedModel.descriptor}
              </p>
              <div className="asset-generation-options">
                <label className="workbench-field">
                  <span>Aspect ratio</span>
                  <select
                    aria-label="Aspect ratio"
                    value={aspectRatio}
                    onChange={(event) => setAspectRatio(event.target.value)}
                    disabled={Boolean(pendingAction) || Boolean(generationAttempt)}
                  >
                    {selectedModel.aspectRatios.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="workbench-field">
                  <span>Quality</span>
                  <select
                    aria-label="Image quality"
                    value={quality}
                    onChange={(event) =>
                      setQuality(event.target.value as typeof quality)
                    }
                    disabled={Boolean(pendingAction) || Boolean(generationAttempt)}
                  >
                    {selectedModel.qualities.map((value) => (
                      <option key={value} value={value}>
                        {value[0].toUpperCase() + value.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="workbench-field">
                <span>Image prompt</span>
                <textarea
                  aria-label="Image prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe the image to generate…"
                  rows={5}
                  disabled={Boolean(pendingAction) || Boolean(generationAttempt)}
                />
              </label>
              <label className="asset-metered-consent">
                <input
                  type="checkbox"
                  checked={meteredConsent}
                  onChange={(event) => setMeteredConsent(event.target.checked)}
                  disabled={Boolean(pendingAction) || Boolean(generationAttempt)}
                />
                <span>
                  I approve this metered Higgsfield generation. One credit
                  estimate will be reserved before the provider job starts.
                </span>
              </label>
              <button
                type="button"
                className="btn-primary"
                disabled={
                  Boolean(pendingAction) ||
                  (!generationAttempt && (!prompt.trim() || !meteredConsent))
                }
                onClick={() => void generateConfiguredImage()}
              >
                {pendingAction === "generate"
                  ? "Generating and saving…"
                  : generationAttempt
                    ? "Check saved request"
                  : sourceAssetId
                    ? "Regenerate and save"
                    : "Generate and save"}
              </button>
            </>
          ) : (
            <p className="workbench-note" role="status">
              Loading the available image model…
            </p>
          )}
        </section>
      )}

      {previewAsset?.url && (
        <section className="asset-preview" aria-label="Image preview">
          <div className="asset-section-heading">
            <strong>Preview</strong>
            <button type="button" onClick={() => setPreviewAsset(null)}>
              Close
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewAsset.url}
            alt={previewAsset.prompt || "Existing project image preview"}
          />
        </section>
      )}

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
