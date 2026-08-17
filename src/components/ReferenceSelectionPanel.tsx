"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  CandidateProfile,
  ReferenceSelectionState,
} from "@/lib/contracts";
import { consumePipelineRunStream } from "./resumeRun";

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

/** Client-side mirror of the contract's injection boundary (review finding):
 * remote previews must be https Refero assets; local paths get encoded per
 * segment before entering the sites API URL. */
function candidateImageUrl(runId: string, candidate: CandidateProfile): string | undefined {
  if (candidate.previewImageUrl) {
    try {
      const url = new URL(candidate.previewImageUrl);
      if (url.protocol === "https:" && (url.hostname === "refero.design" || url.hostname.endsWith(".refero.design"))) {
        return candidate.previewImageUrl;
      }
    } catch {
      // fall through to the screenshot artifact
    }
  }
  if (!candidate.screenshotPath) return undefined;
  // encodeURIComponent keeps dots, so dot-segments are rejected outright
  // (review finding) — the sites API rejects them too.
  const segments = candidate.screenshotPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return undefined;
  }
  return "/api/sites/" + encodeURIComponent(runId) + "/" + segments.map(encodeURIComponent).join("/");
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
  const router = useRouter();
  const [selection, setSelection] = useState(initial);
  const [action, setAction] = useState<PickerAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerollNote, setRerollNote] = useState<string | null>(null);
  // Synchronous lock (review finding): two clicks can both pass the React
  // disabled state before the re-render lands; the ref closes that window.
  const inFlight = useRef(false);
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
    if (inFlight.current) return;
    inFlight.current = true;
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

      setSelection(result.referenceSelection);

      // Only the known resume endpoint may be followed, always as POST
      // (review finding: a response body must not be able to steer the
      // browser at arbitrary loopback write APIs).
      if (result.resumeUrl === "/api/run") {
        const resumeResponse = await fetch(result.resumeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId }),
        });
        if (!resumeResponse.ok) {
          setError("Your choice is saved, but we couldn't continue the build yet.");
          return;
        }
        // /api/run answers with an SSE stream, so an ok response only means
        // the pipeline started. Reading it to its terminal event is what tells
        // us the next gate's draft exists; refreshing then is what puts that
        // draft on screen. Without this the page kept its pre-selection
        // snapshot and stranded the reviewer on "Draft not generated".
        await consumePipelineRunStream(resumeResponse, () => {});
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save that choice.");
    } finally {
      inFlight.current = false;
      setAction(null);
    }
  }

  async function reroll() {
    if (inFlight.current) return;
    inFlight.current = true;
    setAction("reroll");
    setError(null);
    setRerollNote(null);
    try {
      const response = await fetch("/api/reference/" + runId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reroll" }),
      });
      const result = (await response.json().catch(() => ({}))) as ReferenceResponse & {
        ok?: boolean;
        reason?: string;
      };
      // Friendly outcomes come before the generic error throw (review
      // finding): exhaustion can arrive as a 2xx reason or as a 409 when a
      // second tab spent the last reroll first. The reason alone is the
      // signal — never require the ok flag alongside it.
      if (result.reason === "no-fresh-directions") {
        setRerollNote("We couldn't find enough new directions — these are still your options.");
        await refresh();
        return;
      }
      if (response.status === 409) {
        setRerollNote("You've seen all the different directions we can offer — every look shown is still yours to pick.");
        await refresh();
        return;
      }
      if (!response.ok || !result.referenceSelection) {
        throw new Error("We couldn't find different directions right now. Please try again.");
      }
      setSelection(result.referenceSelection);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't find different directions.");
    } finally {
      inFlight.current = false;
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

  if (!version) return null;

  // Every direction from BEFORE the latest reroll stays choosable (soak
  // feedback 2026-08-15) — newest earlier set first.
  const earlierCandidates = selection.versions
    .slice(0, -1)
    .reverse()
    .flatMap((entry) => entry.candidates);

  function renderCard(candidate: CandidateProfile) {
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
        <button className="btn-ghost" type="button" disabled={action !== null} onClick={() => void choose(candidate)}>
          {action === "select" ? "Choosing this look…" : "Choose this look"}
        </button>
      </article>
    );
  }

  return (
    <section className="reference-selection" aria-labelledby="reference-selection-title">
      <p className="eyebrow">{"{ choose a look }"}</p>
      <h2 id="reference-selection-title">Choose a look for your site</h2>
      <p className="reference-selection__framing">
        We found a few different looks for your site. Pick the one that feels most like your business — or let us pick for you.
      </p>
      {/* Contract guarantees exactly one recommended candidate, but a picker
          with cards and no shortcut beats a blank panel if that ever breaks. */}
      {recommendation && (
        <button
          type="button"
          className="btn-primary"
          disabled={action !== null}
          onClick={() => void choose(recommendation)}
        >
          {action === "select" ? "Choosing this look…" : "Not sure? Use our recommendation"}
        </button>
      )}

      <div className="reference-selection__gallery">
        {version.candidates.map((candidate) => renderCard(candidate))}
      </div>

      <p className="reference-selection__disclosure">
        This choice sets your colors, fonts, and photo style. The page layout comes from our standard business-website format for now.
      </p>

      {selection.rerollsUsed < 2 && (
        <button className="btn-ghost" type="button" disabled={action !== null} onClick={() => void reroll()}>
          {action === "reroll" ? "Finding different directions…" : "Show me different directions"}
        </button>
      )}

      {earlierCandidates.length > 0 && (
        <div className="reference-selection__earlier">
          <h3>Earlier directions you saw</h3>
          <p>Changed your mind? Any look we showed you before is still yours to pick.</p>
          <div className="reference-selection__gallery">
            {earlierCandidates.map((candidate) => renderCard(candidate))}
          </div>
        </div>
      )}
      {rerollNote && <p className="reference-selection__message" role="status">{rerollNote}</p>}
      {error && <p className="chat-error" role="alert">{error}</p>}
    </section>
  );
}
