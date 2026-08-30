"use client";

import { useState, type ReactNode } from "react";

import { AssistantPanel } from "../AssistantPanel";
import type { PreviewSelection } from "../previewState";
import { LocalAiTeammatePanel } from "./LocalAiTeammatePanel";

export type AgentStudioMode = "teammates" | "site-advice";

export function AgentStudioPanelContent({
  mode,
  teammatesBusy,
  onModeChange,
  teammates,
  siteAdvice,
}: {
  mode: AgentStudioMode;
  teammatesBusy: boolean;
  onModeChange: (mode: AgentStudioMode) => void;
  teammates: ReactNode;
  siteAdvice: ReactNode;
}) {
  return (
    <div className="agent-studio">
      <div
        className="agent-studio__modes"
        role="group"
        aria-label="Agent Studio mode"
      >
        <button
          type="button"
          className="seg-pill"
          disabled={teammatesBusy}
          aria-pressed={mode === "teammates"}
          onClick={() => onModeChange("teammates")}
        >
          Teammates
        </button>
        <button
          type="button"
          className="seg-pill"
          disabled={teammatesBusy}
          aria-pressed={mode === "site-advice"}
          onClick={() => onModeChange("site-advice")}
        >
          Site advice
        </button>
      </div>

      <div
        className="agent-studio__pane"
        data-agent-studio-pane="teammates"
        hidden={mode !== "teammates"}
        aria-hidden={mode !== "teammates"}
        inert={mode !== "teammates"}
      >
        {teammates}
      </div>
      <div
        className="agent-studio__pane"
        data-agent-studio-pane="site-advice"
        hidden={mode !== "site-advice"}
        aria-hidden={mode !== "site-advice"}
        inert={mode !== "site-advice"}
      >
        <section
          className="agent-studio__site-advice"
          aria-labelledby="site-advice-heading"
        >
          <h2 id="site-advice-heading">Site advice</h2>
          <p className="agent-studio__boundary">
            Site advice is separate from Local foundation teammate proposals
            and receipts. Its existing suggestions and apply flow can change
            the site only through their established controls.
          </p>
          {siteAdvice}
        </section>
      </div>
    </div>
  );
}

export function AgentStudioPanel({
  runId,
  selection,
  onMutationComplete,
}: {
  runId: string;
  selection?: PreviewSelection | null;
  onMutationComplete?: (message?: string) => void;
}) {
  const [mode, setMode] = useState<AgentStudioMode>("teammates");
  const [teammatesBusy, setTeammatesBusy] = useState(false);

  return (
    <AgentStudioPanelContent
      mode={mode}
      teammatesBusy={teammatesBusy}
      onModeChange={setMode}
      teammates={
        <>
          <p className="agent-studio__boundary">
            {selection ? (
              <>
                Current Canvas selection: {selection.tag} {selection.editId}.
                It is context only and is not included in this local
                assignment. No selection data is sent.
              </>
            ) : (
              <>No Canvas selection is included in this local assignment.</>
            )}
          </p>
          <LocalAiTeammatePanel
            runId={runId}
            onBusyChange={setTeammatesBusy}
          />
        </>
      }
      siteAdvice={
        <AssistantPanel
          runId={runId}
          selection={selection}
          onMutationComplete={onMutationComplete}
        />
      }
    />
  );
}
