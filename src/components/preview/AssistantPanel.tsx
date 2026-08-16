"use client";

import { useEffect, useState } from "react";
import { ChatComposer } from "../ChatComposer";
import type { EditorThread } from "../../lib/contracts";

type Guardrail = {
  decision: "redirect" | "refuse";
  reason: string;
  suggestedAlternative?: string;
};

type Suggestion = Extract<EditorThread["messages"][number], { role: "assistant" }>["suggestions"][number];

type EditGate = { gate: string; pass: boolean; blocking: boolean };

export type AssistantPanelState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string }
  | { kind: "ready"; thread: EditorThread };

export type AssistantSuggestionState =
  | { kind: "working" }
  | { kind: "done" }
  | { kind: "error"; message: string }
  | { kind: "guardrail"; guardrail: Guardrail };

function errorFrom(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }
  return fallback;
}

function guardrailFrom(data: unknown): Guardrail | null {
  if (
    !data ||
    typeof data !== "object" ||
    !("guardrail" in data) ||
    !data.guardrail ||
    typeof data.guardrail !== "object"
  ) {
    return null;
  }
  const guardrail = data.guardrail;
  if (
    !("decision" in guardrail) ||
    !("reason" in guardrail) ||
    (guardrail.decision !== "redirect" && guardrail.decision !== "refuse") ||
    typeof guardrail.reason !== "string"
  ) {
    return null;
  }
  const suggestedAlternative =
    "suggestedAlternative" in guardrail &&
    typeof guardrail.suggestedAlternative === "string"
      ? guardrail.suggestedAlternative
      : undefined;
  return {
    decision: guardrail.decision,
    reason: guardrail.reason,
    ...(suggestedAlternative
      ? { suggestedAlternative }
      : {}),
  };
}

async function jsonFrom(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function threadFrom(data: unknown): EditorThread | null {
  if (!data || typeof data !== "object" || !("thread" in data)) return null;
  if (!data.thread || typeof data.thread !== "object") return null;
  return data.thread as EditorThread;
}

export function assistantThumbnailUrl(runId: string, thumbnailPath: string) {
  const encodedPath = thumbnailPath.split("/").map(encodeURIComponent).join("/");
  return `/api/sites/${encodeURIComponent(runId)}/${encodedPath}`;
}

export async function loadAssistantThread(runId: string): Promise<AssistantPanelState> {
  try {
    const response = await fetch(`/api/assistant/${encodeURIComponent(runId)}`, {
      cache: "no-store",
    });
    const data = await jsonFrom(response);
    if (response.status === 409) return { kind: "unavailable" };
    if (!response.ok) {
      return { kind: "error", message: errorFrom(data, "We could not load this conversation. Please try again.") };
    }
    const thread = threadFrom(data);
    return thread
      ? { kind: "ready", thread }
      : { kind: "error", message: "We could not load this conversation. Please try again." };
  } catch {
    return { kind: "error", message: "We could not load this conversation. Please try again." };
  }
}

export async function sendAssistantTurn(runId: string, text: string): Promise<AssistantPanelState> {
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 2_000) {
    return { kind: "error", message: "Write a message between 1 and 2,000 characters." };
  }
  try {
    const response = await fetch(`/api/assistant/${encodeURIComponent(runId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed }),
    });
    const data = await jsonFrom(response);
    if (response.status === 409) return { kind: "unavailable" };
    if (!response.ok) {
      return {
        kind: "error",
        message: errorFrom(
          data,
          response.status === 502
            ? "Your message is saved; please try again."
            : "We could not send your message. Please try again.",
        ),
      };
    }
    const thread = threadFrom(data);
    return thread
      ? { kind: "ready", thread }
      : { kind: "error", message: "We could not send your message. Please try again." };
  } catch {
    return { kind: "error", message: "We could not send your message. Please try again." };
  }
}

function failedChecks(data: unknown): string[] {
  if (!data || typeof data !== "object" || !("gates" in data) || !Array.isArray(data.gates)) {
    return [];
  }
  return data.gates
    .filter((gate): gate is EditGate => Boolean(gate) && typeof gate === "object" && "gate" in gate && "pass" in gate && typeof gate.gate === "string" && gate.pass === false)
    .map((gate) => gate.gate);
}

export async function applyAssistantSuggestion(
  runId: string,
  suggestion: Suggestion,
  confirmRedirect = false,
  instructionOverride?: string,
): Promise<AssistantSuggestionState> {
  try {
    const response = await fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        editId: suggestion.editId,
        // Confirming a redirect applies the guardrail's alternative, matching
        // the page editor's semantics — the button says "suggested version".
        instruction: instructionOverride ?? suggestion.instruction,
        ...(confirmRedirect ? { confirmRedirect: true } : {}),
      }),
    });
    const data = await jsonFrom(response);
    const guardrail = guardrailFrom(data);
    if (guardrail) return { kind: "guardrail", guardrail };
    if (response.status === 409) {
      const failed = failedChecks(data);
      return {
        kind: "error",
        message: failed.length
          ? `This suggestion could not be applied because these checks did not pass: ${failed.join(", ")}.`
          : errorFrom(data, "This suggestion could not be applied. Please try again."),
      };
    }
    if (!response.ok || !data || typeof data !== "object" || !("ok" in data) || data.ok !== true) {
      return { kind: "error", message: errorFrom(data, "We could not apply that suggestion. Please try again.") };
    }
    return { kind: "done" };
  } catch {
    return { kind: "error", message: "We could not apply that suggestion. Please try again." };
  }
}

export function AssistantPanelContent({
  runId,
  state,
  turnError,
  draft,
  isSending,
  suggestionStates,
  onDraftChange,
  onSend,
  onApplySuggestion,
  onRetry,
}: {
  runId: string;
  state: AssistantPanelState;
  turnError?: string | null;
  draft: string;
  isSending: boolean;
  suggestionStates: Record<string, AssistantSuggestionState | undefined>;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onApplySuggestion: (suggestion: Suggestion, confirmRedirect?: boolean) => void;
  onRetry?: () => void;
}) {
  if (state.kind === "loading") {
    return <div className="workbench-state workbench-state--loading" role="status"><strong>Loading your conversation</strong><p>Getting advice for this site.</p></div>;
  }
  if (state.kind === "unavailable") {
    return <div className="workbench-state workbench-state--unsupported" role="status"><strong>Generate the site first</strong><p>Advice about the site will be ready after there is a generated site to review.</p></div>;
  }
  if (state.kind === "error") {
    return <div className="workbench-state workbench-state--error" role="alert"><strong>Conversation unavailable</strong><p>{state.message}</p>{onRetry && <button type="button" onClick={onRetry}>Try again</button>}</div>;
  }

  return (
    <div className="assistant-panel">
      <p className="workbench-note">Ask for ideas about your site. Suggestions only change the site when you choose Apply.</p>
      <div className="assistant-thread" aria-label="Conversation about your site">
        {state.thread.messages.map((message) => (
          <article key={message.id} className={`assistant-message assistant-message--${message.role}`}>
            <span className="assistant-message__label">{message.role === "owner" ? "You" : "Site assistant"}</span>
            <p className="assistant-message__text">{message.role === "owner" ? message.text : message.reply}</p>
            {message.role === "assistant" && message.evidence.length > 0 && (
              <div className="assistant-evidence" aria-label="Inspiration evidence">
                {message.evidence.map((evidence) => (
                  <figure key={`${message.id}:${evidence.screenId}`} className="assistant-evidence__card">
                    <img src={assistantThumbnailUrl(runId, evidence.thumbnailPath)} alt={`Screenshot of ${evidence.siteName}`} />
                    <figcaption><strong>Real business site used for inspiration</strong><span>{evidence.siteName}</span><p>{evidence.takeaway}</p></figcaption>
                  </figure>
                ))}
              </div>
            )}
            {message.role === "assistant" && message.suggestions.length > 0 && (
              <div className="assistant-suggestions" aria-label="Suggested changes">
                {message.suggestions.map((suggestion) => {
                  const action = suggestionStates[suggestion.id];
                  return (
                    <section key={suggestion.id} className="assistant-suggestion">
                      <strong>{suggestion.summary}</strong>
                      <p>{suggestion.instruction}</p>
                      {action?.kind === "guardrail" ? (
                        <div className="workbench-state workbench-state--error" role="alert"><strong>{action.guardrail.reason}</strong>{action.guardrail.suggestedAlternative && <p>{action.guardrail.suggestedAlternative}</p>}{action.guardrail.decision === "redirect" && action.guardrail.suggestedAlternative && <button type="button" onClick={() => onApplySuggestion(suggestion, true)}>Apply the suggested version instead</button>}</div>
                      ) : action?.kind === "done" ? <p className="assistant-suggestion__done">Applied to your site.</p> : (
                        <><button type="button" disabled={action?.kind === "working"} onClick={() => onApplySuggestion(suggestion)}>{action?.kind === "working" ? "Applying…" : "Apply"}</button>{action?.kind === "error" && <p className="assistant-suggestion__error" role="alert">{action.message}</p>}</>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </article>
        ))}
      </div>
      {turnError && <p className="assistant-turn-error" role="alert">{turnError}</p>}
      <ChatComposer value={draft} onChange={onDraftChange} onSubmit={onSend} placeholder="Ask a question about your site" disabled={isSending} submitLabel={isSending ? "Working…" : "Send"} rows={4} />
    </div>
  );
}

export function AssistantPanel({ runId, onMutationComplete }: { runId: string; onMutationComplete?: (message?: string) => void }) {
  const [state, setState] = useState<AssistantPanelState>({ kind: "loading" });
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [suggestionStates, setSuggestionStates] = useState<Record<string, AssistantSuggestionState | undefined>>({});

  useEffect(() => {
    // No synchronous setState in the effect (lint: cascading renders); the
    // active flag also drops stale responses after unmount or a runId change.
    let active = true;
    void loadAssistantThread(runId).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [runId]);

  async function reload() {
    setState({ kind: "loading" });
    setTurnError(null);
    setState(await loadAssistantThread(runId));
  }

  async function handleSend() {
    if (isSending) return;
    setTurnError(null);
    setIsSending(true);
    const next = await sendAssistantTurn(runId, draft);
    if (next.kind === "error" && state.kind === "ready") {
      setTurnError(next.message);
    } else {
      setState(next);
      setTurnError(null);
      if (next.kind === "ready") setDraft("");
    }
    setIsSending(false);
  }

  async function handleApplySuggestion(suggestion: Suggestion, confirmRedirect = false) {
    const current = suggestionStates[suggestion.id];
    if (current?.kind === "working") return;
    const alternative =
      confirmRedirect && current?.kind === "guardrail"
        ? current.guardrail.suggestedAlternative
        : undefined;
    setSuggestionStates((states) => ({ ...states, [suggestion.id]: { kind: "working" } }));
    const next = await applyAssistantSuggestion(runId, suggestion, confirmRedirect, alternative);
    setSuggestionStates((states) => ({ ...states, [suggestion.id]: next }));
    if (next.kind === "done") onMutationComplete?.("Applied suggestion.");
  }

  return <AssistantPanelContent runId={runId} state={state} turnError={turnError} draft={draft} isSending={isSending} suggestionStates={suggestionStates} onDraftChange={(value) => { setDraft(value); setTurnError(null); }} onSend={() => void handleSend()} onApplySuggestion={(suggestion, confirmRedirect) => void handleApplySuggestion(suggestion, confirmRedirect)} onRetry={() => void reload()} />;
}
