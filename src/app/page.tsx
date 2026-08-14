"use client";

import { useEffect, useReducer, useState, type Dispatch, type ReactNode } from "react";
import Link from "next/link";
import { CostChip } from "@/components/CostChip";
import { IntakeComposer } from "@/components/IntakeComposer";
import { STAGE_LABEL, StageCard, type StageCardStatus } from "@/components/StageCard";
import {
  buildChatRequest,
  completedChatReplayRunId,
  type IntakeChatContext,
} from "@/components/intakeRequest";
import { readSSE } from "@/components/sse";
import { consumePipelineRunStream, resumedRunId } from "@/components/resumeRun";
import type {
  PipelineEvent,
  ProjectTarget,
  ResearchConfiguration,
  Stage,
  UploadMetadata,
} from "@/lib/contracts";

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

interface AttemptFailure {
  message: string;
  technicalDetails: string;
  retryable: boolean;
  kind: "authorization" | "request" | "upload-expired" | "conflict" | "configuration";
}

interface RuntimeCapabilities {
  referoDesignEvidence: boolean;
  referoConnectUrl: string;
}

interface SubmissionAttempt {
  id: string;
  userMessageId: string;
  assistantMessageId: string;
  prompt: string;
  context: IntakeChatContext;
  status: "pending" | "failed";
  failure: AttemptFailure | null;
}

interface OneBoxState {
  phase: "intake" | "pipeline";
  messages: ChatMsg[];
  isStreaming: boolean;
  activeAttempt: SubmissionAttempt | null;
  runId: string | null;
  timeline: TimelineItem[];
  costUsd: number;
  previewUrl: string | null;
  evidenceUrl: string | null;
  settled: boolean; // pipeline reached complete or error
}

const initialState: OneBoxState = {
  phase: "intake",
  messages: [],
  isStreaming: false,
  activeAttempt: null,
  runId: null,
  timeline: [],
  costUsd: 0,
  previewUrl: null,
  evidenceUrl: null,
  settled: false,
};

type Action =
  | { type: "SUBMIT"; attempt: SubmissionAttempt }
  | { type: "RETRY" }
  | { type: "EDIT_ATTEMPT" }
  | { type: "CHAT_DELTA"; delta: string }
  | { type: "CHAT_DONE" }
  | { type: "CHAT_ERROR"; failure: AttemptFailure }
  | { type: "UPLOAD_SESSION_EXPIRED"; message: string }
  | { type: "PIPELINE_START"; runId: string }
  | { type: "PIPELINE_EVENT"; event: PipelineEvent }
  | { type: "PIPELINE_STREAM_ERROR" }
  | { type: "RESET_TO_INTAKE"; messages?: ChatMsg[] };

function reducer(state: OneBoxState, action: Action): OneBoxState {
  switch (action.type) {
    case "SUBMIT": {
      const userMsg: ChatMsg = {
        id: action.attempt.userMessageId,
        role: "user",
        content: action.attempt.prompt,
      };
      const assistantMsg: ChatMsg = {
        id: action.attempt.assistantMessageId,
        role: "assistant",
        content: "",
      };
      return {
        ...state,
        messages: [...state.messages, userMsg, assistantMsg],
        isStreaming: true,
        activeAttempt: action.attempt,
      };
    }
    case "RETRY":
      if (!state.activeAttempt?.failure?.retryable) return state;
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === state.activeAttempt?.assistantMessageId
            ? { ...message, content: "" }
            : message
        ),
        isStreaming: true,
        activeAttempt: {
          ...state.activeAttempt,
          status: "pending",
          failure: null,
        },
      };
    case "EDIT_ATTEMPT":
      if (!state.activeAttempt) return state;
      return {
        ...state,
        messages: state.messages.filter(
          (message) =>
            message.id !== state.activeAttempt?.userMessageId &&
            message.id !== state.activeAttempt?.assistantMessageId
        ),
        isStreaming: false,
        activeAttempt: null,
      };
    case "CHAT_DELTA": {
      const messages = state.messages.slice();
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant") {
        messages[messages.length - 1] = { ...last, content: last.content + action.delta };
      }
      return { ...state, messages };
    }
    case "CHAT_DONE":
      return {
        ...state,
        isStreaming: false,
        activeAttempt:
          state.phase === "pipeline" || state.activeAttempt?.status === "failed"
            ? state.activeAttempt
            : null,
      };
    case "CHAT_ERROR":
      return {
        ...state,
        isStreaming: false,
        activeAttempt: state.activeAttempt
          ? {
              ...state.activeAttempt,
              status: "failed",
              failure: action.failure,
            }
          : null,
      };
    case "UPLOAD_SESSION_EXPIRED":
      return {
        ...state,
        isStreaming: false,
        activeAttempt: state.activeAttempt
          ? {
              ...state.activeAttempt,
              status: "failed",
              failure: {
                message: action.message,
                technicalDetails: "The staged upload session expired before the build could claim it.",
                retryable: false,
                kind: "upload-expired",
              },
            }
          : null,
      };
    case "PIPELINE_START":
      return {
        ...state,
        phase: "pipeline",
        runId: action.runId,
        isStreaming: false,
      };
    case "PIPELINE_EVENT": {
      const ev = action.event;
      let costUsd = state.costUsd;
      let previewUrl = state.previewUrl;
      let evidenceUrl = state.evidenceUrl;
      let settled = state.settled;
      if (ev.type === "cost") costUsd = ev.usd;
      if (ev.type === "complete") {
        previewUrl = ev.previewUrl;
        settled = true;
      }
      if (ev.type === "paused") {
        evidenceUrl = ev.workspaceUrl;
        settled = true;
      }
      if (ev.type === "error") settled = true;
      const timeline =
        ev.type === "cost"
          ? state.timeline
          : [...state.timeline, { key: `${state.timeline.length}-${ev.type}`, event: ev }];
      return { ...state, timeline, costUsd, previewUrl, evidenceUrl, settled };
    }
    case "PIPELINE_STREAM_ERROR": {
      if (state.settled) return state;
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
    case "RESET_TO_INTAKE":
      return { ...initialState, messages: action.messages ?? [] };
    default:
      return state;
  }
}

// ---------- asset path resolution ----------
// Pipeline card.images are usually filesystem paths under sites/<runId>/…
// (see pipeline.ts); the site-serving route only accepts
// /api/sites/<runId>/<rel>, so strip everything up to and including
// "sites/<runId>/". Reference-lock cards instead carry remote Refero preview
// URLs and inline data: URLs — those are already resolvable, pass them through.
function resolveSiteAsset(runId: string, rawPath: string): string {
  if (/^(https?:|data:)/i.test(rawPath)) return rawPath;
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
          images={event.images?.map((img) => ({
            src: resolveSiteAsset(runId, img.path),
            // per-image label, not the card title — four screenshots all
            // reading "Market structure" is useless to a screen reader
            alt: img.label,
            href: img.href,
          }))}
          links={event.links}
          map={event.map}
        />
      );
    case "error":
      return <StageCard key={key} title="Something went wrong" body={event.message} tone="error" />;
    case "paused":
      return (
        <StageCard
          key={key}
          title={`${event.workflowStage} ready for review`}
          body={event.note}
        />
      );
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
async function sendMessage(
  history: ChatMsg[],
  intakeContext: IntakeChatContext,
  attemptId: string,
  dispatch: Dispatch<Action>,
  onUploadSessionExpired: (message: string) => void
) {
  const toolNames = new Map<string, string>();
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildChatRequest(history, intakeContext, attemptId)),
    });
    if (!res.ok || !res.body) {
      let serverDetail = "";
      let serverCode = "";
      try {
        const body = (await res.json()) as { error?: unknown; code?: unknown };
        if (typeof body.error === "string") serverDetail = ` ${body.error}`;
        if (typeof body.code === "string") serverCode = body.code;
      } catch {
        // The status is still useful technical information when no JSON body exists.
      }
      dispatch({
        type: "CHAT_ERROR",
        failure: {
          message:
            res.status === 403
              ? "OneBox could not start this project because the local request was blocked. Your prompt and settings are still here."
              : res.status === 422 && serverCode === "missing-configuration"
                ? "OneBox needs a setup or research-setting change before it can start. Your prompt and settings are still here."
              : res.status === 409
                ? "This retry no longer matches the original request. Edit the prompt to start a fresh attempt."
              : "OneBox could not start this project. Your prompt and settings are still here.",
          technicalDetails: `Chat request failed (${res.status}).${serverDetail}`,
          retryable:
            res.status !== 409 &&
            !(res.status === 422 && serverCode === "missing-configuration"),
          kind:
            res.status === 403
              ? "authorization"
              : res.status === 422 && serverCode === "missing-configuration"
                ? "configuration"
              : res.status === 409
                ? "conflict"
                : "request",
        },
      });
      return;
    }

    const replayRunId = await completedChatReplayRunId(res);
    if (replayRunId) {
      dispatch({ type: "PIPELINE_START", runId: replayRunId });
      return;
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
          if (output?.code === "upload-session-expired") {
            const message =
              typeof output.message === "string"
                ? output.message
                : "Your private upload session expired. Choose the files again.";
            onUploadSessionExpired(message);
            dispatch({
              type: "UPLOAD_SESSION_EXPIRED",
              message,
            });
            return;
          }
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
            failure: {
              message: "OneBox could not start this project. Your prompt and settings are still here.",
              technicalDetails:
                typeof chunk.errorText === "string"
                  ? chunk.errorText
                  : "Could not start the build.",
              retryable: true,
              kind: "request",
            },
          });
        }
        return;
      }
      if (type === "error") {
        dispatch({
          type: "CHAT_ERROR",
          failure: {
            message: "OneBox could not finish the request. Your prompt and settings are still here.",
            technicalDetails:
              typeof chunk.errorText === "string"
                ? chunk.errorText
                : "The assistant hit an error.",
            retryable: true,
            kind: "request",
          },
        });
      }
    });

    dispatch({ type: "CHAT_DONE" });
  } catch (err) {
    dispatch({
      type: "CHAT_ERROR",
      failure: {
        message: "OneBox could not reach the local service. Your prompt and settings are still here.",
        technicalDetails:
          err instanceof Error ? err.message : "Chat request failed.",
        retryable: true,
        kind: "request",
      },
    });
  }
}

// ---------- page ----------

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [input, setInput] = useState("");
  const [projectTarget, setProjectTarget] = useState<ProjectTarget>("website");
  const [research, setResearch] = useState<ResearchConfiguration>({
    enabled: true,
    businessIntelligence: true,
    referoDesignEvidence: false,
    allowPaidFirecrawlFallback: false,
  });
  const [runtimeCapabilities, setRuntimeCapabilities] =
    useState<RuntimeCapabilities>({
      referoDesignEvidence: false,
      referoConnectUrl: "/api/refero/connect",
    });
  const [uploads, setUploads] = useState<UploadMetadata[]>([]);
  const [uploadSession, setUploadSession] = useState<string | null>(null);
  const [uploadRecoveryMessage, setUploadRecoveryMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/capabilities", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as Partial<RuntimeCapabilities>;
        return typeof body.referoDesignEvidence === "boolean" &&
          typeof body.referoConnectUrl === "string"
          ? {
              referoDesignEvidence: body.referoDesignEvidence,
              referoConnectUrl: body.referoConnectUrl,
            }
          : null;
      })
      .then((capabilities) => {
        if (!capabilities) return;
        setRuntimeCapabilities(capabilities);
        if (!capabilities.referoDesignEvidence) {
          setResearch((current) => ({
            ...current,
            referoDesignEvidence: false,
          }));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  // Restore a run from the URL so a refresh rejoins the build instead of
  // stranding the checkpointed run (audit P1). The server attaches
  // reconnects to an in-flight run; finished stages replay instantly.
  useEffect(() => {
    const runId = resumedRunId(window.location.search);
    if (runId) {
      dispatch({ type: "PIPELINE_START", runId });
    }
  }, []);

  useEffect(() => {
    if (state.phase !== "pipeline" || !state.runId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("run") !== state.runId) {
      url.searchParams.set("run", state.runId);
      window.history.replaceState(null, "", url);
    }
  }, [state.phase, state.runId]);

  const activeAttemptId = state.activeAttempt?.id;
  const activeAttemptStatus = state.activeAttempt?.status;

  useEffect(() => {
    if (!activeAttemptId) return;
    const frame = window.requestAnimationFrame(() => {
      const status = document.getElementById(`attempt-status-${activeAttemptId}`);
      status?.focus({ preventScroll: true });
      status?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeAttemptId, activeAttemptStatus]);

  // Pipeline SSE: authorized POST starts/resumes once per run. Native
  // EventSource is GET-only, so use the shared bounded frame reader.
  useEffect(() => {
    if (state.phase !== "pipeline" || !state.runId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: state.runId }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Pipeline request failed (${response.status})`);
        const terminal = await consumePipelineRunStream(response, (event) =>
          dispatch({ type: "PIPELINE_EVENT", event })
        );
        if (!terminal && !controller.signal.aborted) {
          dispatch({ type: "PIPELINE_STREAM_ERROR" });
        }
      } catch {
        if (!controller.signal.aborted) dispatch({ type: "PIPELINE_STREAM_ERROR" });
      }
    })();
    return () => controller.abort();
  }, [state.phase, state.runId]);

  function runAttempt(attempt: SubmissionAttempt, history: ChatMsg[]) {
    void sendMessage(
      history,
      attempt.context,
      attempt.id,
      dispatch,
      (message) => {
        setUploadSession(null);
        setUploads([]);
        setUploadRecoveryMessage(message);
      }
    );
  }

  function handleSend() {
    const content = input.trim();
    if (!content || state.isStreaming) return;
    const userMessageId = crypto.randomUUID();
    const context: IntakeChatContext = {
      projectTarget,
      research: { ...research },
      uploads: uploads.map((upload) => ({ ...upload })),
      uploadSession,
    };
    const attempt: SubmissionAttempt = {
      id: crypto.randomUUID(),
      userMessageId,
      assistantMessageId: crypto.randomUUID(),
      prompt: content,
      context,
      status: "pending",
      failure: null,
    };
    const history = [
      ...state.messages,
      { id: userMessageId, role: "user" as const, content },
    ];
    dispatch({ type: "SUBMIT", attempt });
    setInput("");
    runAttempt(attempt, history);
  }

  function handleRetry() {
    const attempt = state.activeAttempt;
    if (!attempt?.failure?.retryable || state.isStreaming) return;
    const history = state.messages.filter(
      (message) => message.id !== attempt.assistantMessageId
    );
    dispatch({ type: "RETRY" });
    runAttempt({ ...attempt, status: "pending", failure: null }, history);
  }

  function handleEditPrompt() {
    const attempt = state.activeAttempt;
    if (!attempt || state.isStreaming) return;
    setInput(attempt.prompt);
    setProjectTarget(attempt.context.projectTarget);
    setResearch({
      ...attempt.context.research,
      referoDesignEvidence:
        attempt.context.research.referoDesignEvidence &&
        runtimeCapabilities.referoDesignEvidence,
    });
    if (attempt.failure?.kind !== "upload-expired") {
      setUploads(attempt.context.uploads.map((upload) => ({ ...upload })));
      setUploadSession(attempt.context.uploadSession);
    }
    dispatch({ type: "EDIT_ATTEMPT" });
    window.requestAnimationFrame(() => {
      const composer = document.querySelector<HTMLTextAreaElement>(".composer__input");
      composer?.focus();
      composer?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function handlePipelineRecovery() {
    const attempt = state.activeAttempt;
    const priorMessages = attempt
      ? state.messages.filter(
          (message) =>
            message.id !== attempt.userMessageId &&
            message.id !== attempt.assistantMessageId
        )
      : state.messages;
    if (attempt) {
      setInput(attempt.prompt);
      setProjectTarget(attempt.context.projectTarget);
      setResearch({
        ...attempt.context.research,
        referoDesignEvidence:
          attempt.context.research.referoDesignEvidence &&
          runtimeCapabilities.referoDesignEvidence,
      });
      if (attempt.context.uploads.length > 0) {
        setUploadRecoveryMessage(
          "Files attached to the failed run must be selected again."
        );
      }
    }
    setUploads([]);
    setUploadSession(null);
    dispatch({ type: "RESET_TO_INTAKE", messages: priorMessages });
    const url = new URL(window.location.href);
    url.searchParams.delete("run");
    window.history.replaceState(null, "", url);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(".composer__input")?.focus();
    });
  }

  const latestPipelineEvent = state.timeline.at(-1)?.event;

  return (
    <main>
      {state.phase === "intake" && (
        <section className="intake-view" aria-label="Describe your project">
          <div className="intake-view__inner">
            {state.messages.length > 0 && (
              <div className="transcript">
                {state.messages
                  .filter((m) => m.content.length > 0 || m.role === "user")
                  .map((m) => {
                    const attempt =
                      m.id === state.activeAttempt?.userMessageId
                        ? state.activeAttempt
                        : null;
                    return (
                      <div key={m.id}>
                        <p className="transcript__line">
                          <span className="transcript__role">
                            {m.role === "user" ? "You" : "one-box"}
                          </span>
                          {m.content || (state.isStreaming ? "…" : "")}
                        </p>
                        {attempt && (
                          <div
                            id={`attempt-status-${attempt.id}`}
                            className={attempt.status === "failed" ? "chat-error" : undefined}
                            role={attempt.status === "failed" ? "alert" : "status"}
                            tabIndex={-1}
                          >
                            {attempt.status === "pending" ? (
                              <p>Starting your project…</p>
                            ) : (
                              <>
                                <p>{attempt.failure?.message}</p>
                                <div>
                                  {attempt.failure?.retryable && (
                                    <button
                                      type="button"
                                      onClick={handleRetry}
                                      disabled={state.isStreaming}
                                    >
                                      Retry
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={handleEditPrompt}
                                    disabled={state.isStreaming}
                                  >
                                    Edit prompt
                                  </button>
                                </div>
                                <details>
                                  <summary>Technical details</summary>
                                  <code>{attempt.failure?.technicalDetails}</code>
                                </details>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
            <IntakeComposer
              value={input}
              onChange={setInput}
              onSubmit={handleSend}
              projectTarget={projectTarget}
              research={research}
              uploads={uploads}
              uploadSession={uploadSession}
              onProjectTargetChange={setProjectTarget}
              onResearchChange={setResearch}
              onUploadsChange={setUploads}
              onUploadSessionChange={(handle) => {
                setUploadSession(handle);
                if (handle) setUploadRecoveryMessage(null);
              }}
              referoDesignEvidenceAvailable={
                runtimeCapabilities.referoDesignEvidence
              }
              referoConnectUrl={runtimeCapabilities.referoConnectUrl}
              uploadRecoveryMessage={uploadRecoveryMessage}
              onUploadRecoveryClear={() => setUploadRecoveryMessage(null)}
              disabled={state.isStreaming}
              submitLabel={state.isStreaming ? "Thinking…" : "Send"}
            />
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
          {state.evidenceUrl && (
            <div className="timeline-complete">
              <Link href={state.evidenceUrl} className="pill-button">
                Review evidence
              </Link>
            </div>
          )}
          {latestPipelineEvent?.type === "error" && (
            <div className="timeline-complete">
              <button
                type="button"
                className="pill-button"
                onClick={handlePipelineRecovery}
              >
                {state.activeAttempt
                  ? "Edit prompt and settings"
                  : "Start a new project"}
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
