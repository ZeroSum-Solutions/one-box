"use client";

import { useEffect, useState } from "react";
import type { PreviewSelection } from "./previewState";

const defaults = {
  kind: "entrance",
  durationMs: 600,
  delayMs: 0,
  ease: "power2.out",
  trigger: "load",
  replay: "once",
  breakpoint: "all",
  x: 0,
  y: 24,
  scale: 1,
  rotation: 0,
  opacity: 0,
};

export function MotionControls({ runId, selection, onMutationComplete, onPreview, onReset }: { runId: string; selection: PreviewSelection; onMutationComplete: () => void; onPreview: (draft: Record<string, unknown>) => void; onReset: () => void }) {
  const [form, setForm] = useState(defaults);
  const [entries, setEntries] = useState<Array<{ kind: string }>>([]);
  const [canRevert, setCanRevert] = useState(false);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/motion?runId=${encodeURIComponent(runId)}&editId=${encodeURIComponent(selection.editId)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || result.error) throw new Error(result.error || "motion inspection failed");
        if (!cancelled) {
          setEntries(result.entries);
          setCanRevert(result.canRevert);
          setPending(false);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "motion inspection failed");
          setPending(false);
        }
      });
    return () => { cancelled = true; };
  }, [runId, selection.editId]);

  function draft() {
    const kind = form.kind as "entrance" | "exit" | "hover" | "scroll" | "timeline";
    return {
      editId: selection.editId,
      kind,
      durationMs: Number(form.durationMs),
      delayMs: Number(form.delayMs),
      ease: form.ease,
      trigger: kind === "hover" ? "hover" : kind === "scroll" ? "viewport" : kind === "exit" ? "manual" : form.trigger,
      replay: form.replay,
      breakpoint: form.breakpoint,
      properties: { x: Number(form.x), y: Number(form.y), scale: Number(form.scale), rotation: Number(form.rotation), opacity: Number(form.opacity) },
      ...(kind === "scroll" ? { scrub: false } : {}),
      ...(kind === "timeline" ? { timelineId: "primary", order: 0 } : {}),
    };
  }

  async function act(action: "preview" | "apply" | "remove" | "revert") {
    setPending(true); setError(null);
    try {
      const body = action === "revert" ? { action, runId } : action === "remove" ? { action, runId, editId: selection.editId, kind: form.kind } : { action, runId, draft: draft() };
      const response = await fetch("/api/motion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || "motion action failed");
      if (action === "preview") onPreview(result.draft);
      else { setEntries(result.entries.filter((entry: { editId: string }) => entry.editId === selection.editId)); setCanRevert(result.canRevert); onMutationComplete(); }
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "motion action failed"); }
    finally { setPending(false); }
  }

  if (pending && !entries.length) return <div className="workbench-state workbench-state--loading" role="status"><strong>Loading motion</strong><p>Reading the constrained manifest for {selection.editId}.</p></div>;
  return <div className="motion-controls">
    <div className="motion-summary"><strong>{selection.editId}</strong><p>{entries.length ? `${entries.length} saved configuration(s): ${entries.map((entry) => entry.kind).join(", ")}` : "No saved motion. Existing CSS reveal behavior remains active."}</p></div>
    <div className="motion-grid">
      <label>Kind<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}><option value="entrance">Entrance</option><option value="exit">Exit</option><option value="hover">Hover</option><option value="scroll">Scroll-triggered</option><option value="timeline">Timeline</option></select></label>
      <label>Breakpoint<select value={form.breakpoint} onChange={(event) => setForm({ ...form, breakpoint: event.target.value })}><option value="all">All</option><option value="mobile">Mobile</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option></select></label>
      <label>Duration ms<input type="number" min="50" max="5000" value={form.durationMs} onChange={(event) => setForm({ ...form, durationMs: Number(event.target.value) })} /></label>
      <label>Delay ms<input type="number" min="0" max="5000" value={form.delayMs} onChange={(event) => setForm({ ...form, delayMs: Number(event.target.value) })} /></label>
      <label>Easing<select value={form.ease} onChange={(event) => setForm({ ...form, ease: event.target.value })}><option value="none">None</option><option value="power1.out">Gentle</option><option value="power2.out">Balanced</option><option value="power3.out">Strong</option><option value="sine.inOut">Sine</option></select></label>
      <label>Replay<select value={form.replay} onChange={(event) => setForm({ ...form, replay: event.target.value })}><option value="once">Once</option><option value="repeat">Repeat</option></select></label>
      {(["x", "y", "scale", "rotation", "opacity"] as const).map((key) => <label key={key}>{key}<input type="number" step={key === "scale" || key === "opacity" ? "0.1" : "1"} value={form[key]} onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })} /></label>)}
    </div>
    <div className="motion-actions"><button type="button" disabled={pending} onClick={() => void act("preview")}>Preview motion</button><button type="button" disabled={pending} onClick={onReset}>Reset preview</button><button type="button" disabled={pending} onClick={() => void act("apply")}>Apply motion</button><button type="button" disabled={pending || !entries.some((entry) => entry.kind === form.kind)} onClick={() => void act("remove")}>Remove kind</button><button type="button" disabled={pending || !canRevert} onClick={() => void act("revert")}>Revert last motion</button></div>
    {error && <p className="edit-error" role="alert">{error}</p>}
  </div>;
}
