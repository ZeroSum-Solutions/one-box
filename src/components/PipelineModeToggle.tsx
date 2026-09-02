"use client";

export type PipelineMode = "guided" | "developer";

export function resolvePipelineMode(
  search: string,
  stored: string | null,
): PipelineMode {
  const requested = new URLSearchParams(search).get("view");
  if (requested === "guided" || requested === "developer") return requested;
  return stored === "developer" ? "developer" : "guided";
}

export function PipelineModeToggle(props: {
  mode: PipelineMode;
  onChange: (mode: PipelineMode) => void;
}) {
  return (
    <div className="pipeline-mode" aria-label="Pipeline view">
      <span className="pipeline-mode__label">Developer</span>
      <button
        type="button"
        role="switch"
        aria-checked={props.mode === "developer"}
        aria-label="Developer view"
        className="pipeline-mode__switch"
        onClick={() =>
          props.onChange(props.mode === "guided" ? "developer" : "guided")
        }
      >
        <span aria-hidden="true" />
      </button>
      <div className="pipeline-mode__choices" aria-hidden="true">
        <span aria-pressed={props.mode === "guided"}>Guided</span>
        <span aria-pressed={props.mode === "developer"}>Developer</span>
      </div>
    </div>
  );
}
