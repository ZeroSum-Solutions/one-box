"use client";

import { useEffect, useState } from "react";
import type { PreviewSelection } from "./previewState";

type MotionKind = "entrance" | "exit" | "hover" | "scroll" | "timeline";
type MotionTrigger = "load" | "viewport" | "hover" | "manual";

interface MotionForm {
  kind: MotionKind;
  durationMs: number;
  delayMs: number;
  ease: string;
  trigger: MotionTrigger;
  replay: string;
  breakpoint: string;
  scrub: boolean;
  timelineId: string;
  order: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

interface SavedMotionEntry {
  id: string;
  editId: string;
  kind: MotionKind;
  durationMs: number;
  delayMs: number;
  ease: string;
  trigger: MotionTrigger;
  replay: string;
  breakpoint: string;
  scrub?: boolean;
  timelineId?: string;
  order?: number;
  properties: Partial<Pick<MotionForm, "x" | "y" | "scale" | "rotation" | "opacity">>;
}

const defaults: MotionForm = {
  kind: "entrance",
  durationMs: 600,
  delayMs: 0,
  ease: "power2.out",
  trigger: "load",
  replay: "once",
  breakpoint: "all",
  scrub: false,
  timelineId: "primary",
  order: 0,
  x: 0,
  y: 24,
  scale: 1,
  rotation: 0,
  opacity: 0,
};

const triggerOptions: Record<MotionKind, Array<{ value: MotionTrigger; label: string }>> = {
  entrance: [
    { value: "load", label: "Page load" },
    { value: "viewport", label: "Enter viewport" },
    { value: "manual", label: "Manual preview" },
  ],
  exit: [{ value: "manual", label: "Manual preview" }],
  hover: [{ value: "hover", label: "Pointer or focus" }],
  scroll: [{ value: "viewport", label: "Enter viewport" }],
  timeline: [
    { value: "load", label: "Page load" },
    { value: "viewport", label: "Enter viewport" },
    { value: "manual", label: "Manual preview" },
  ],
};

const propertyFields = [
  { key: "x", label: "Horizontal offset", min: -2000, max: 2000, step: 1 },
  { key: "y", label: "Vertical offset", min: -2000, max: 2000, step: 1 },
  { key: "scale", label: "Scale", min: 0.1, max: 4, step: 0.1 },
  { key: "rotation", label: "Rotation", min: -360, max: 360, step: 1 },
  { key: "opacity", label: "Opacity", min: 0, max: 1, step: 0.1 },
] as const;

function formFromEntry(entry: SavedMotionEntry): MotionForm {
  return {
    kind: entry.kind,
    durationMs: entry.durationMs,
    delayMs: entry.delayMs,
    ease: entry.ease,
    trigger: entry.trigger,
    replay: entry.replay,
    breakpoint: entry.breakpoint,
    scrub: entry.scrub ?? false,
    timelineId: entry.timelineId ?? defaults.timelineId,
    order: entry.order ?? defaults.order,
    x: entry.properties.x ?? defaults.x,
    y: entry.properties.y ?? defaults.y,
    scale: entry.properties.scale ?? defaults.scale,
    rotation: entry.properties.rotation ?? defaults.rotation,
    opacity: entry.properties.opacity ?? defaults.opacity,
  };
}

export function MotionControls({ runId, selection, onMutationComplete, onPreview, onReset }: { runId: string; selection: PreviewSelection; onMutationComplete: () => void; onPreview: (draft: Record<string, unknown>) => void; onReset: () => void }) {
  const [form, setForm] = useState(defaults);
  const [entries, setEntries] = useState<SavedMotionEntry[]>([]);
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
          const nextEntries = result.entries as SavedMotionEntry[];
          setEntries(nextEntries);
          setForm(nextEntries[0] ? formFromEntry(nextEntries[0]) : defaults);
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
    const kind = form.kind;
    return {
      editId: selection.editId,
      kind,
      durationMs: Number(form.durationMs),
      delayMs: Number(form.delayMs),
      ease: form.ease,
      trigger: form.trigger,
      replay: form.replay,
      breakpoint: form.breakpoint,
      properties: { x: Number(form.x), y: Number(form.y), scale: Number(form.scale), rotation: Number(form.rotation), opacity: Number(form.opacity) },
      ...(kind === "scroll" ? { scrub: form.scrub } : {}),
      ...(kind === "timeline" ? { timelineId: form.timelineId, order: Number(form.order) } : {}),
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
      else { setEntries(result.entries.filter((entry: SavedMotionEntry) => entry.editId === selection.editId)); setCanRevert(result.canRevert); onMutationComplete(); }
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "motion action failed"); }
    finally { setPending(false); }
  }

  if (pending && !entries.length) return <div className="workbench-state workbench-state--loading" role="status"><strong>Loading motion</strong><p>Reading the constrained manifest for {selection.editId}.</p></div>;
  return <div className="motion-controls">
    <div className="motion-summary"><strong>{selection.editId}</strong><p>{entries.length ? `${entries.length} saved configuration(s): ${entries.map((entry) => entry.kind).join(", ")}` : "No saved motion. Existing CSS reveal behavior remains active."}</p></div>
    <div className="motion-grid">
      <label>Kind<select value={form.kind} onChange={(event) => {
        const kind = event.target.value as MotionKind;
        const saved = entries.find((entry) => entry.kind === kind);
        setForm((current) => saved ? formFromEntry(saved) : { ...current, kind, trigger: triggerOptions[kind][0].value });
      }}><option value="entrance">Entrance</option><option value="exit">Exit</option><option value="hover">Hover</option><option value="scroll">Scroll-triggered</option><option value="timeline">Timeline</option></select></label>
      <label>Trigger<select value={form.trigger} onChange={(event) => setForm({ ...form, trigger: event.target.value as MotionTrigger })}>{triggerOptions[form.kind].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Breakpoint<select value={form.breakpoint} onChange={(event) => setForm({ ...form, breakpoint: event.target.value })}><option value="all">All</option><option value="mobile">Mobile</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option></select></label>
      <label>Duration ms<input type="number" min="50" max="5000" step="1" value={form.durationMs} onChange={(event) => setForm({ ...form, durationMs: Number(event.target.value) })} /></label>
      <label>Delay ms<input type="number" min="0" max="5000" step="1" value={form.delayMs} onChange={(event) => setForm({ ...form, delayMs: Number(event.target.value) })} /></label>
      <label>Easing<select value={form.ease} onChange={(event) => setForm({ ...form, ease: event.target.value })}><option value="none">None</option><option value="power1.out">Gentle</option><option value="power2.out">Balanced</option><option value="power3.out">Strong</option><option value="sine.inOut">Sine</option></select></label>
      <label>Replay<select value={form.replay} onChange={(event) => setForm({ ...form, replay: event.target.value })}><option value="once">Once</option><option value="repeat">Repeat</option></select></label>
      {form.kind === "scroll" && <label>Scroll scrub<select value={String(form.scrub)} onChange={(event) => setForm({ ...form, scrub: event.target.value === "true" })}><option value="false">Off — timed</option><option value="true">On — scroll linked</option></select></label>}
      {form.kind === "timeline" && <>
        <label>Timeline group<input type="text" required minLength={2} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,39}" value={form.timelineId} onChange={(event) => setForm({ ...form, timelineId: event.target.value })} /></label>
        <label>Timeline order<input type="number" min="0" max="50" step="1" value={form.order} onChange={(event) => setForm({ ...form, order: Number(event.target.value) })} /></label>
      </>}
      {propertyFields.map((field) => <label key={field.key}>{field.label}<input type="number" min={field.min} max={field.max} step={field.step} value={form[field.key]} onChange={(event) => setForm({ ...form, [field.key]: Number(event.target.value) })} /></label>)}
    </div>
    <div className="motion-actions"><button type="button" disabled={pending} onClick={() => void act("preview")}>Preview motion</button><button type="button" disabled={pending} onClick={onReset}>Reset preview</button><button type="button" disabled={pending} onClick={() => void act("apply")}>Apply motion</button><button type="button" disabled={pending || !entries.some((entry) => entry.kind === form.kind)} onClick={() => void act("remove")}>Remove kind</button><button type="button" disabled={pending || !canRevert} onClick={() => void act("revert")}>Revert last motion</button></div>
    {error && <p className="edit-error" role="alert">{error}</p>}
  </div>;
}
