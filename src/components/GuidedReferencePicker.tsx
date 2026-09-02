"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReferenceSelectionState } from "../lib/contracts";

interface DraftChoice {
  referoId: string;
  note: string;
}

interface ReferenceDraft {
  choices: DraftChoice[];
  overallNote: string;
}

function safeReferenceDraft(
  value: unknown,
  candidateIds: ReadonlySet<string>,
): ReferenceDraft | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { choices?: unknown; overallNote?: unknown };
  if (!Array.isArray(record.choices) || record.choices.length > 3) return undefined;
  const seen = new Set<string>();
  const choices: DraftChoice[] = [];
  for (const raw of record.choices) {
    if (!raw || typeof raw !== "object") return undefined;
    const choice = raw as { referoId?: unknown; note?: unknown };
    if (
      typeof choice.referoId !== "string" ||
      typeof choice.note !== "string" ||
      !candidateIds.has(choice.referoId) ||
      seen.has(choice.referoId)
    ) return undefined;
    seen.add(choice.referoId);
    choices.push({ referoId: choice.referoId, note: choice.note.slice(0, 1_000) });
  }
  if (record.overallNote !== undefined && typeof record.overallNote !== "string") {
    return undefined;
  }
  return {
    choices,
    overallNote: (record.overallNote ?? "").slice(0, 2_000),
  };
}

export function referenceDraftKey(
  runId: string,
  selection: ReferenceSelectionState,
): string {
  const versions = selection.versions.map((version) => version.version).join("-");
  return `onebox:reference-draft:${runId}:${versions}`;
}

export function persistReferenceDraft(
  storage: Pick<Storage, "setItem" | "removeItem">,
  key: string,
  value?: string,
): boolean {
  try {
    if (value === undefined) storage.removeItem(key);
    else storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function referenceDraftForPersistence(
  draft: ReferenceDraft,
  hydratedKey: string | null,
  key: string,
): string | null | undefined {
  if (hydratedKey !== key) return undefined;
  if (draft.choices.length === 0 && !draft.overallNote) return null;
  return JSON.stringify(draft);
}

export function GuidedReferencePicker(props: {
  runId: string;
  selection: ReferenceSelectionState;
  onConfirmed: () => void;
}) {
  const key = referenceDraftKey(props.runId, props.selection);
  const [draft, setDraft] = useState<ReferenceDraft>({ choices: [], overallNote: "" });
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const candidates = useMemo(
    () => props.selection.versions.flatMap((version) => version.candidates),
    [props.selection.versions],
  );
  const candidateIds = useMemo(
    () => new Set(candidates.map((candidate) => candidate.referoId)),
    [candidates],
  );

  useEffect(() => {
    let frame = 0;
    let restored: ReferenceDraft | undefined;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        restored = safeReferenceDraft(JSON.parse(stored), candidateIds);
      }
    } catch {
      // A damaged local draft must never block a fresh selection.
    }
    frame = window.requestAnimationFrame(() => {
      setDraft(restored ?? { choices: [], overallNote: "" });
      setHydratedKey(key);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [candidateIds, key]);

  useEffect(() => {
    const persisted = referenceDraftForPersistence(draft, hydratedKey, key);
    if (persisted === undefined) return;
    if (persisted === null) {
      persistReferenceDraft(window.localStorage, key);
      return;
    }
    persistReferenceDraft(window.localStorage, key, persisted);
  }, [draft, hydratedKey, key]);

  function toggle(referoId: string) {
    setStatus("idle");
    setDraft((current) => {
      const existing = current.choices.find((choice) => choice.referoId === referoId);
      if (existing) {
        return { ...current, choices: current.choices.filter((choice) => choice.referoId !== referoId) };
      }
      if (current.choices.length === 3) return current;
      return { ...current, choices: [...current.choices, { referoId, note: "" }] };
    });
  }

  function move(index: number, delta: number) {
    setDraft((current) => {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= current.choices.length) return current;
      const choices = [...current.choices];
      [choices[index], choices[nextIndex]] = [choices[nextIndex], choices[index]];
      return { ...current, choices };
    });
  }

  const valid =
    draft.choices.length > 0 &&
    draft.choices.every((choice) => choice.note.trim().length >= 3);
  const incompleteChoice = draft.choices.findIndex((choice) => choice.note.trim().length < 3);
  const guidance = draft.choices.length === 0
    ? "Select at least one direction to continue."
    : incompleteChoice >= 0
      ? `Add a short note for choice #${incompleteChoice + 1} to continue.`
      : `${draft.choices.length}/3 selected and ready.`;

  async function confirm() {
    if (!valid || status === "saving") return;
    setStatus("saving");
    try {
      const response = await fetch(`/api/reference/${props.runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "select-ranked",
          preferences: draft.choices.map((choice) => ({
            referoId: choice.referoId,
            note: choice.note.trim(),
          })),
          overallNote: draft.overallNote.trim() || undefined,
        }),
      });
      if (response.status === 409) {
        setStatus("conflict");
        props.onConfirmed();
        return;
      }
      if (!response.ok) throw new Error(`Selection failed (${response.status})`);
      persistReferenceDraft(window.localStorage, key);
      setStatus("saved");
      props.onConfirmed();
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="guided-picker" aria-labelledby="guided-picker-title">
      <header>
        <p className="guided-kicker">Your visual direction</p>
        <h2 id="guided-picker-title">Choose up to three</h2>
        <p>Pick in order of importance. For each choice, tell us: What do you like about it?</p>
      </header>
      <div className="guided-picker__grid">
        {candidates.map((candidate) => {
          const rank = draft.choices.findIndex((choice) => choice.referoId === candidate.referoId);
          return (
            <article key={candidate.referoId} className={rank >= 0 ? "guided-reference is-selected" : "guided-reference"}>
              <button type="button" className="guided-reference__select" onClick={() => toggle(candidate.referoId)} aria-pressed={rank >= 0}>
                <span className="guided-reference__rank">{rank >= 0 ? `#${rank + 1}` : "+"}</span>
                {candidate.screenshotPath || candidate.previewImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={candidate.screenshotPath ? `/api/sites/${props.runId}/${candidate.screenshotPath}` : candidate.previewImageUrl}
                    alt=""
                  />
                ) : <span className="guided-reference__empty" />}
                <span className="guided-reference__name">{candidate.name}</span>
                <span>{candidate.plainLanguageProfile.feelSummary}</span>
              </button>
              {rank >= 0 && (
                <div className="guided-reference__note">
                  <label>
                    What do you like about it?
                    <textarea
                      value={draft.choices[rank].note}
                      maxLength={1000}
                      placeholder={rank === 0 ? "I like the colors…" : rank === 1 ? "I like the layout…" : "I like how it uses…"}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        choices: current.choices.map((choice, index) => index === rank ? { ...choice, note: event.target.value } : choice),
                      }))}
                    />
                  </label>
                  <div>
                    <button type="button" onClick={() => move(rank, -1)} disabled={rank === 0}>Move up</button>
                    <button type="button" onClick={() => move(rank, 1)} disabled={rank === draft.choices.length - 1}>Move down</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <label className="guided-picker__overall">
        Anything else to carry through?
        <textarea
          value={draft.overallNote}
          maxLength={2000}
          placeholder="Keep it simple, calm, and easy to scan."
          onChange={(event) => setDraft((current) => ({ ...current, overallNote: event.target.value }))}
        />
      </label>
      <div className="guided-picker__confirm">
        <span aria-live="polite">
          {status === "conflict" ? "This direction was already confirmed. Refreshing will show the saved choice." : status === "error" ? "Could not save yet. Your draft is still here." : status === "saved" ? "Direction saved. Continuing the build…" : guidance}
        </span>
        <button type="button" className="btn-primary" disabled={!valid || status === "saving"} onClick={confirm}>
          {status === "saving" ? "Saving…" : "Confirm direction"}
        </button>
      </div>
    </section>
  );
}
