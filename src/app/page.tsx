"use client";

import { useEffect, useReducer, useState, type Dispatch, type ReactNode } from "react";
import Link from "next/link";
import { ChatComposer } from "@/components/ChatComposer";
import { CostChip } from "@/components/CostChip";
import { STAGE_LABEL, StageCard, type StageCardStatus } from "@/components/StageCard";
import { readSSE } from "@/components/sse";
import type { PipelineEvent, Stage } from "@/lib/contracts";

// ---------- local state ----------

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface TimelineItem {
  key: string;
  event: PipelineEvent;
}

interface OneBoxState {
  phase: "intake" | "pipeline";
  messages: ChatMsg[];
  isStreaming: boolean;
  chatError: string | null;
  runId: string | null;
  timeline: TimelineItem[];
  costUsd: number;
  previewUrl: string | null;
  settled: boolean; // pipeline reached complete or error
}

const initialState: OneBoxState = {
  phase: "intake",
  messages: [],
  isStreaming: false,
  chatError: null,
  runId: null,
  timeline: [],
  costUsd: 0,
  previewUrl: null,
  settled: false,
};

type Action =
  | { type: "SUBMIT"; content: string }
  | { type: "CHAT_DELTA"; delta: string }
  | { type: "CHAT_DONE" }
  | { type: "CHAT_ERROR"; message: string }
  | { type: "PIPELINE_START"; runId: string }
  | { type: "PIPELINE_EVENT"; event: PipelineEvent }
  | { type: "PIPELINE_STREAM_ERROR" };

function reducer(state: OneBoxState, action: Action): OneBoxState {
  switch (action.type) {
    case "SUBMIT": {
      const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", content: action.content };
      const assistantMsg: ChatMsg = { id: crypto.randomUUID(), role: "assistant", content: "" };
      return {
        ...state,
        messages: [...state.messages, userMsg, assistantMsg],
        isStreaming: true,
        chatError: null,
      };
    }
    case "CHAT_DELTA": {
      const messages = state.messages.slice();
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant") {
        messages[messages.length - 1] = { ...last, content: last.content + action.delta };
      }
      return { ...state, messages };
    }
    case "CHAT_DONE":
      return { ...state, isStreaming: false };
    case "CHAT_ERROR":
      return { ...state, isStreaming: false, chatError: action.message };
    case "PIPELINE_START":
      return { ...state, phase: "pipeline", runId: action.runId, isStreaming: false };
    case "PIPELINE_EVENT": {
      const ev = action.event;
      let costUsd = state.costUsd;
      let previewUrl = state.previewUrl;
      let settled = state.settled;
      if (ev.type === "cost") costUsd = ev.usd;
      if (ev.type === "complete") {
        previewUrl = ev.previewUrl;
        settled = true;
      }
      if (ev.type === "error") settled = true;
      const timeline =
        ev.type === "cost"
          ? state.timeline
          : [...state.timeline, { key: `${state.timeline.length}-${ev.type}`, event: ev }];
      return { ...state, timeline, costUsd, previewUrl, settled };
    }
    case "PIPELINE_STREAM_ERROR": {
      if (state.settled) return state; // EventSource fires "error" on a clean close too
      const ev: PipelineEvent = {
        type: "error",
        message: "Lost connection to the build. Refresh — the run resumes from its last checkpoint.",
      };
      return {
        ...state,
        settled: true,
        timeline: [...state.timeline, { key: `${state.timeline.length}-stream-error`, event: ev }],
      };
    }
    default:
      return state;
  }
}

// ---------- asset path resolution ----------
// Pipeline card.images are filesystem paths under sites/<runId>/… (see
// pipeline.ts). The site-serving route only accepts /api/sites/<runId>/<rel>,
// so strip everything up to and including "sites/<runId>/".
function resolveSiteAsset(runId: string, rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, "/");
  const marker = `sites/${runId}/`;
  const idx = normalized.indexOf(marker);
  const rel = idx >= 0 ? normalized.slice(idx + marker.length) : normalized.replace(/^\/+/, "");
  return `/api/sites/${runId}/${rel}`;
}

function stageStatusTitle(stage: Stage, status: StageCardStatus): string {
  const label = STAGE_LABEL[stage];
  if (status === "running") return `${label} — in progress`;
  if (status === "failed") return `${label} — failed`;
  return `${label} — done`;
}

function timelineNode(item: TimelineItem, runId: string): ReactNode {
  const { event, key } = item;
  switch (event.type) {
    case "stage":
      return (
        <StageCard
          key={key}
          stage={event.stage}
          title={stageStatusTitle(event.stage, event.status)}
          body={event.note}
          status={event.status}
        />
      );
    case "card":
      return (
        <StageCard
          key={key}
          stage={event.stage}
          title={event.title}
          body={event.body}
          images={event.images?.map((p) => ({ src: resolveSiteAsset(runId, p), alt: event.title }))}
        />
      );
    case "error":
      return <StageCard key={key} title="Something went wrong" body={event.message} tone="error" />;
    default:
      return null; // "cost"/"complete" drive the cost chip and the preview link, not a card
  }
}

// ---------- /api/chat wire format (ai@7 UIMessageChunk over SSE) ----------
// /api/chat is a real streamText(...).toUIMessageStreamResponse() route whose
// only tool is start_pipeline (see src/app/api/chat/route.ts). @ai-sdk/react
// isn't installed (not in the approved dep list), so this hand-rolls the
// chunk reducer instead of useChat — see WAVE-NOTES-ui.md for the exact
// chunk vocabulary this relies on.
async function sendMessage(history: ChatMsg[], dispatch: Dispatch<Action>) {
  const toolNames = new Map<string, string>();
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.map((m) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: "text", text: m.content }],
        })),
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Chat request failed (${res.status}).`);
    }

    await readSSE(res, (raw) => {
      if (!raw || typeof raw !== "object") return;
      const chunk = raw as Record<string, unknown>;
      const type = chunk.type;

      if (type === "text-delta" && typeof chunk.delta === "string") {
        dispatch({ type: "CHAT_DELTA", delta: chunk.delta });
        return;
      }
      if (
        (type === "tool-input-start" || type === "tool-input-available") &&
        typeof chunk.toolCallId === "string" &&
        typeof chunk.toolName === "string"
      ) {
        toolNames.set(chunk.toolCallId, chunk.toolName);
        return;
      }
      if (type === "tool-output-available" && typeof chunk.toolCallId === "string") {
        if (toolNames.get(chunk.toolCallId) === "start_pipeline") {
          const output = chunk.output as Record<string, unknown> | undefined;
          if (output && typeof output.runId === "string") {
            dispatch({ type: "PIPELINE_START", runId: output.runId });
          }
        }
        return;
      }
      if (type === "tool-output-error" && typeof chunk.toolCallId === "string") {
        if (toolNames.get(chunk.toolCallId) === "start_pipeline") {
          dispatch({
            type: "CHAT_ERROR",
            message: typeof chunk.errorText === "string" ? chunk.errorText : "Could not start the build.",
          });
        }
        return;
      }
      if (type === "error") {
        dispatch({
          type: "CHAT_ERROR",
          message: typeof chunk.errorText === "string" ? chunk.errorText : "The assistant hit an error.",
        });
      }
    });

    dispatch({ type: "CHAT_DONE" });
  } catch (err) {
    dispatch({
      type: "CHAT_ERROR",
      message: err instanceof Error ? err.message : "Chat request failed.",
    });
  }
}

// ---------- page ----------

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [input, setInput] = useState("");

  // Pipeline SSE: opens once per run, closes itself on complete/error.
  useEffect(() => {
    if (state.phase !== "pipeline" || !state.runId) return;
    const es = new EventSource(`/api/run?runId=${encodeURIComponent(state.runId)}`);
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as PipelineEvent;
        dispatch({ type: "PIPELINE_EVENT", event: parsed });
        if (parsed.type === "complete" || parsed.type === "error") es.close();
      } catch {
        // ignore malformed frame
      }
    };
    es.onerror = () => {
      dispatch({ type: "PIPELINE_STREAM_ERROR" });
      es.close();
    };
    return () => es.close();
  }, [state.phase, state.runId]);

  function handleSend() {
    const content = input.trim();
    if (!content || state.isStreaming) return;
    const history = [...state.messages, { id: crypto.randomUUID(), role: "user" as const, content }];
    dispatch({ type: "SUBMIT", content });
    setInput("");
    void sendMessage(history, dispatch);
  }

  return (
    <main>
      {state.phase === "intake" && (
        <section className="hero" aria-label="Describe your business">
          <div className="hero-blob" aria-hidden="true" />
          <div className="hero-inner">
            <h1 className="hero-display">
              Describe the business.
              <br />
              Get the site.
            </h1>
            <p className="eyebrow">{"{ one prompt }"}</p>
            {state.messages.length > 0 && (
              <div className="transcript">
                {state.messages
                  .filter((m) => m.content.length > 0 || m.role === "user")
                  .map((m) => (
                    <p className="transcript__line" key={m.id}>
                      <span className="transcript__role">{m.role === "user" ? "You" : "one-box"}</span>
                      {m.content || (state.isStreaming ? "…" : "")}
                    </p>
                  ))}
              </div>
            )}
            <ChatComposer
              value={input}
              onChange={setInput}
              onSubmit={handleSend}
              placeholder="A fiber-optic installer in Reno, NV that wants more booked quotes…"
              disabled={state.isStreaming}
              submitLabel={state.isStreaming ? "Thinking…" : "Send"}
            />
            {state.chatError && <p className="chat-error">{state.chatError}</p>}
          </div>
        </section>
      )}

      {state.phase === "pipeline" && state.runId && (
        <section className="timeline-view" aria-label="Build progress">
          <header className="timeline-header">
            <p className="eyebrow">{"{ building }"}</p>
            <CostChip usd={state.costUsd} />
          </header>
          <div className="timeline">{state.timeline.map((item) => timelineNode(item, state.runId!))}</div>
          {state.previewUrl && (
            <div className="timeline-complete">
              <Link href={state.previewUrl} className="pill-button">
                Open preview
              </Link>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
