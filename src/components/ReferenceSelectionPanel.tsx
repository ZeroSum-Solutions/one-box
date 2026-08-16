"use client";

import { useEffect, useState } from "react";
import type {
  CandidateProfile,
  ReferenceSelectionState,
} from "@/lib/contracts";

type PickerAction = "select" | "reroll" | null;

interface ReferenceResponse {
  error?: string;
  referenceSelection?: ReferenceSelectionState;
}

interface SelectResponse extends ReferenceResponse {
  resumeUrl?: string;
  resumeMethod?: "POST";
}

function latestVersion(state: ReferenceSelectionState) {
  return state.versions.at(-1);
}

function candidateImageUrl(runId: string, candidate: CandidateProfile): string | undefined {
  if (candidate.previewImageUrl) return candidate.previewImageUrl;
  if (!candidate.screenshotPath) return undefined;
  return "/api/sites/" + runId + "/" + candidate.screenshotPath;
}

function selectedCandidate(state: ReferenceSelectionState): CandidateProfile | undefined {
  const selectedId = state.selection?.selectedId;
  return state.versions
    .flatMap((version) => version.candidates)
    .find((candidate) => candidate.referoId === selectedId);
}

export function ReferenceSelectionPanel({
  runId,
  initial,
}: {
  runId: string;
  initial: ReferenceSelectionState;
}) {
  const [selection, setSelection] = useState(initial);
  const [action, setAction] = useState<PickerAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerollNote, setRerollNote] = useState<string | null>(null);
  const version = latestVersion(selection);
  const recommendation = version?.candidates.find((candidate) => candidate.recommended);
  const selected = selectedCandidate(selection);

  async function refresh(): Promise<ReferenceSelectionState | undefined> {
    const response = await fetch("/api/reference/" + runId, { cache: "no-store" });
    const result = (await response.json()) as ReferenceResponse;
    if (!response.ok || !result.referenceSelection) {
      throw new Error(result.error ?? "We couldn't refresh these options.");
    }
    setSelection(result.referenceSelection);
    return result.referenceSelection;
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/reference/" + runId, { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as ReferenceResponse;
        if (!response.ok || !result.referenceSelection) {
          throw new Error(result.error ?? "We couldn't refresh these options.");
        }
        return result.referenceSelection;
      })
      .then((nextSelection) => {
        if (active) setSelection(nextSelection);
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "We couldn't refresh these options.");
        }
      });
    return () => {
      active = false;
    };
  }, [runId]);

  async function choose(candidate: CandidateProfile) {
    setAction("select");
    setError(null);
    setRerollNote(null);
    try {
      const response = await fetch("/api/reference/" + runId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select", selectedId: candidate.referoId }),
      });
      const result = (await response.json()) as SelectResponse;
      if (!response.ok || !result.referenceSelection) {
        throw new Error(result.error ?? "We couldn't save that choice.");
      }

      if (result.resumeUrl && result.resumeMethod) {
        const resumeResponse = await fetch(result.resumeUrl, {
          method: result.resumeMethod,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId }),
        });
        if (!resumeResponse.ok) {
          const resumeResult = (await resumeResponse.json().catch(() => ({}))) as { error?: string };
          setError(resumeResult.error ?? "Your choice is saved, but we couldn't continue the build yet.");
        }
      }

      setSelection(result.referenceSelection);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save that choice.");
    } finally {
      setAction(null);
    }
  }

  async function reroll() {
    setAction("reroll");
    setError(null);
    setRerollNote(null);
    try {
      const response = await fetch("/api/reference/" + runId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reroll" }),
      });
      const result = (await response.json()) as ReferenceResponse & {
        ok?: boolean;
        reason?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "We couldn't find different directions.");
      if (result.ok === false && result.reason === "no-fresh-directions") {
        setRerollNote("We couldn't find enough new directions — these are still your options.");
        await refresh();
        return;
      }
      if (!result.referenceSelection) {
        throw new Error("We couldn't find different directions.");
      }
      setSelection(result.referenceSelection);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't find different directions.");
    } finally {
      setAction(null);
    }
  }

  if (selection.status === "selected" && selected) {
    return (
      <section className="reference-selection" aria-labelledby="reference-selection-title">
        <p className="eyebrow">{"{ look chosen }"}</p>
        <h2 id="reference-selection-title">{selected.name}</h2>
        <div className="reference-selection__swatches" aria-label={"Colors chosen for " + selected.name}>
          {selected.palette.map((swatch) => (
            <span
              key={selected.referoId + "-" + swatch.hex}
              className="reference-selection__swatch"
              role="img"
              aria-label={swatch.plainLabel}
              title={swatch.plainLabel}
              style={{ backgroundColor: swatch.hex }}
            />
          ))}
        </div>
        <p>Your look is chosen. We’re continuing with the build.</p>
      </section>
    );
  }

  if (!version || !recommendation) return null;

  return (
    <section className="reference-selection" aria-labelledby="reference-selection-title">
      <p className="eyebrow">{"{ choose a look }"}</p>
      <h2 id="reference-selection-title">Choose a look for your site</h2>
      <p className="reference-selection__framing">
        We found a few different looks for your site. Pick the one that feels most like your business — or let us pick for you.
      </p>
      <button
        type="button"
        className="reference-selection__recommendation"
        disabled={action !== null}
        onClick={() => void choose(recommendation)}
      >
        {action === "select" ? "Choosing this look…" : "Not sure? Use our recommendation"}
      </button>

      <div className="reference-selection__gallery">
        {version.candidates.map((candidate) => {
          const imageUrl = candidateImageUrl(runId, candidate);
          return (
            <article className="reference-selection__card" key={candidate.referoId}>
              <div className="reference-selection__card-header">
                <h3>{candidate.name}</h3>
                {candidate.recommended && <span className="reference-selection__badge">Our recommendation</span>}
              </div>
              <div className="reference-selection__swatches" aria-label={"Colors in " + candidate.name}>
                {candidate.palette.map((swatch) => (
                  <span
                    key={candidate.referoId + "-" + swatch.hex}
                    className="reference-selection__swatch"
                    role="img"
                    aria-label={swatch.plainLabel}
                    title={swatch.plainLabel}
                    style={{ backgroundColor: swatch.hex }}
                  />
                ))}
              </div>
              <div className="reference-selection__profile">
                <h4>{candidate.plainLanguageProfile.headline}</h4>
                <p>{candidate.plainLanguageProfile.feelSummary}</p>
                <h5>Best for</h5>
                <ul>{candidate.plainLanguageProfile.bestFor.map((item) => <li key={item}>{item}</li>)}</ul>
                {candidate.plainLanguageProfile.headsUp.length > 0 && (
                  <>
                    <h5>Heads up</h5>
                    <ul>{candidate.plainLanguageProfile.headsUp.map((item) => <li key={item}>{item}</li>)}</ul>
                  </>
                )}
              </div>
              {imageUrl && (
                <figure className="reference-selection__image">
                  {/* Runtime images can come from a remote reference or run artifact. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="" loading="lazy" />
                  <figcaption>A real business site with this feel — for inspiration, not a preview of your site</figcaption>
                </figure>
              )}
              <button type="button" disabled={action !== null} onClick={() => void choose(candidate)}>
                {action === "select" ? "Choosing this look…" : "Choose this look"}
              </button>
            </article>
          );
        })}
      </div>

      <p className="reference-selection__disclosure">
        This choice sets your colors, fonts, and photo style. The page layout comes from our standard business-website format for now.
      </p>

      {selection.rerollsUsed < 2 && (
        <button type="button" disabled={action === "reroll"} onClick={() => void reroll()}>
          {action === "reroll" ? "Finding different directions…" : "Show me different directions"}
        </button>
      )}
      {rerollNote && <p className="reference-selection__message" role="status">{rerollNote}</p>}
      {error && <p className="chat-error" role="alert">{error}</p>}
    </section>
  );
}
