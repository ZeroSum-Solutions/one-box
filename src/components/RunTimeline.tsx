import type { ReactNode } from "react";
import Link from "next/link";
import { CostChip } from "@/components/CostChip";
import { MarketFeature, collectMarketIntel } from "@/components/MarketFeature";
import { STAGE_DOT, STAGE_LABEL, StageCard, type StageCardStatus } from "@/components/StageCard";
import { pipelineStatusLabel } from "@/components/resumeRun";
import { isResumeNoise, type PipelineEvent, type Stage } from "@/lib/contracts";

export interface TimelineItem {
  key: string;
  event: PipelineEvent;
}

/** Which terminal event the run last reached. The three URLs a run accumulates
 * (preview, evidence) are sticky — a run that pauses at a gate and later
 * completes still carries its workspace URL — so the view's single primary
 * action is derived from this, never from "whichever URL happens to be set"
 * (DESIGN.md §Do: one acid-lime action per view). */
export type TerminalKind = "complete" | "paused" | "error" | null;

/** Stable empty set so a run with no scan intel doesn't hand StageGroupRow a
 * fresh object on every render. */
const EMPTY_KEYS: Set<string> = new Set();

export interface RunTimelineProps {
  runId: string;
  timeline: TimelineItem[];
  costUsd: number;
  /** Matches CostChip's own fallback (RunState.costCapUsd's schema default) —
   * optional so this stays a safe no-op until the caller threads the run's
   * real cap through. */
  costCapUsd?: number;
  previewUrl: string | null;
  evidenceUrl: string | null;
  terminal: TerminalKind;
  /** True when a failed attempt's prompt can be restored into the composer. */
  hasActiveAttempt: boolean;
  onRecover: () => void;
}

// ---------- asset path resolution ----------
// Pipeline card.images are usually filesystem paths under sites/<runId>/…
// (see pipeline.ts); the site-serving route only accepts
// /api/sites/<runId>/<rel>, so strip everything up to and including
// "sites/<runId>/". Reference-lock cards instead carry remote Refero preview
// URLs and inline data: URLs — those are already resolvable, pass them through.
export function resolveSiteAsset(runId: string, rawPath: string): string {
  if (/^(https?:|data:)/i.test(rawPath)) return rawPath;
  const normalized = rawPath.replace(/\\/g, "/");
  const marker = `sites/${runId}/`;
  const idx = normalized.indexOf(marker);
  const rel = idx >= 0 ? normalized.slice(idx + marker.length) : normalized.replace(/^\/+/, "");
  return `/api/sites/${runId}/${rel}`;
}

export function stageStatusTitle(stage: Stage, status: StageCardStatus): string {
  const label = STAGE_LABEL[stage];
  if (status === "running") return `${label} — in progress`;
  if (status === "failed") return `${label} — failed`;
  return `${label} — done`;
}

export function timelineNode(item: TimelineItem, runId: string, dropMap = false): ReactNode {
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
          map={dropMap ? undefined : event.map}
          roster={event.roster}
          market={event.market}
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
    case "reference-paused":
      return (
        <StageCard
          key={key}
          title="Pick a look for your site"
          body={event.note}
          links={[{ kind: "artifact", label: "Pick a look for your site", href: event.workspaceUrl }]}
        />
      );
    default:
      return null; // "cost"/"complete" drive the cost chip and the preview link, not a card
  }
}

// ---------- stage grouping (DESIGN.md §Long-run disclosure) ----------

type StageEvent = Extract<PipelineEvent, { type: "stage" }>;

interface StageGroup {
  stage: Stage;
  /** Narrative items for this stage, resume-noise stripped (counted below,
   * not rendered card-by-card). */
  items: TimelineItem[];
  resumeNoiseCount: number;
  statusEvents: StageEvent[];
}

/** Buckets the flat event stream by the stage that was current when each
 * event arrived. Events without their own `stage` (errors, evidence-gate
 * pauses, the terminal "complete" marker) attach to whichever stage most
 * recently reported one — the stage that was actually running when they
 * happened. */
function groupTimelineByStage(timeline: TimelineItem[]): StageGroup[] {
  const groups: StageGroup[] = [];
  const byStage = new Map<Stage, StageGroup>();
  let lastStage: Stage = "intake";

  for (const item of timeline) {
    const { event } = item;
    if (event.type === "stage" || event.type === "card") lastStage = event.stage;

    let group = byStage.get(lastStage);
    if (!group) {
      group = { stage: lastStage, items: [], resumeNoiseCount: 0, statusEvents: [] };
      byStage.set(lastStage, group);
      groups.push(group);
    }
    if (isResumeNoise(event)) {
      group.resumeNoiseCount += 1;
      continue;
    }
    group.items.push(item);
    if (event.type === "stage") group.statusEvents.push(event);
  }
  return groups;
}

function formatElapsedMs(ms: number): string {
  if (ms < 1000) return "<1s";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

/** The collapsed row's outcome text + mono elapsed — DESIGN.md §Long-run
 * disclosure: "dot-badge + outcome + mono elapsed". Elapsed needs both a
 * running and a settled timestamp on this stage's own events; either can be
 * missing (an events.jsonl line recorded before `at` existed), in which case
 * the row just omits it rather than showing a fake or a placeholder. */
function stageGroupOutcome(group: StageGroup): { text: string; elapsed?: string } {
  const last = group.statusEvents.at(-1);
  const running = group.statusEvents.find((e) => e.status === "running");
  const settled = [...group.statusEvents].reverse().find((e) => e.status !== "running");
  const text = last
    ? last.status
    : group.items.some((i) => i.event.type === "error")
      ? "failed"
      : "logged";
  const elapsed =
    running?.at && settled?.at
      ? formatElapsedMs(Date.parse(settled.at) - Date.parse(running.at))
      : undefined;
  return { text, elapsed };
}

/** What a collapsed row says it contains. A row reading only "done" makes the
 * reader open every stage to find the one they wanted, which defeats the
 * collapse; the last card's title is the most specific true thing available
 * without inventing a per-stage summary the events don't carry. */
function stageGroupDetail(group: StageGroup): string | undefined {
  const lastCard = [...group.items]
    .reverse()
    .find((item) => item.event.type === "card")?.event;
  if (lastCard?.type !== "card") return undefined;
  const cardCount = group.items.filter((item) => item.event.type === "card").length;
  return cardCount > 1 ? `${lastCard.title} · +${cardCount - 1} more` : lastCard.title;
}

function eventTimestamp(event: PipelineEvent): string | undefined {
  if (event.type === "stage" || event.type === "paused" || event.type === "reference-paused") {
    return event.at;
  }
  return undefined;
}

/** Whole-run elapsed for the header KPI strip: earliest to latest timestamp
 * seen anywhere in the timeline. Deliberately not "now" — that would make a
 * historical replay's elapsed keep growing on every page load. */
function totalElapsedLabel(timeline: TimelineItem[]): string | undefined {
  const stamps = timeline
    .map((item) => eventTimestamp(item.event))
    .filter((at): at is string => Boolean(at))
    .map((at) => Date.parse(at))
    .filter((ms) => !Number.isNaN(ms));
  if (stamps.length < 2) return undefined;
  return formatElapsedMs(Math.max(...stamps) - Math.min(...stamps));
}

function runStatusLabel(terminal: TerminalKind): string {
  switch (terminal) {
    case "complete":
      return "complete";
    case "paused":
      return "paused";
    case "error":
      return "error";
    default:
      return "running";
  }
}

/** A completed stage collapses to this one line; the active stage renders
 * the same element pre-opened. Native <details> so expand/collapse gets
 * keyboard behaviour (Enter/Space on the focused summary) for free. */
function StageGroupRow({
  group,
  runId,
  expanded,
  strippedMapKeys,
}: {
  group: StageGroup;
  runId: string;
  expanded: boolean;
  strippedMapKeys: Set<string>;
}) {
  const outcome = stageGroupOutcome(group);
  const detail = stageGroupDetail(group);
  return (
    <details className="stage-group" open={expanded}>
      <summary className="stage-group__summary">
        <span className="badge stage-group__badge">
          <span className="badge__dot" style={{ background: STAGE_DOT[group.stage] }} aria-hidden="true" />
          {STAGE_LABEL[group.stage]}
        </span>
        <span className="stage-group__outcome">{outcome.text}</span>
        {detail && <span className="stage-group__detail">{detail}</span>}
        {outcome.elapsed && <span className="mono-meta stage-group__elapsed">{outcome.elapsed}</span>}
        <span className="stage-group__chevron" aria-hidden="true" />
      </summary>
      <div className="stage-group__body">
        {group.items.map((item) => timelineNode(item, runId, strippedMapKeys.has(item.key)))}
        {group.resumeNoiseCount > 0 && (
          <p className="stage-group__resume-note mono-meta">
            resumed from checkpoint × {group.resumeNoiseCount}
          </p>
        )}
      </div>
    </details>
  );
}

export function RunTimeline({
  runId,
  timeline,
  costUsd,
  costCapUsd,
  previewUrl,
  evidenceUrl,
  terminal,
  hasActiveAttempt,
  onRecover,
}: RunTimelineProps) {
  const latestEvent = timeline.at(-1)?.event;
  // The scan's map and ranked operators are promoted out of the log into the
  // feature panel below the header; the cards they came from are dropped here
  // so the same data never renders twice.
  const intel = collectMarketIntel(timeline);
  const logged = intel
    ? timeline.filter((item) => !intel.consumedKeys.has(item.key))
    : timeline;
  const groups = groupTimelineByStage(logged);
  const elapsed = totalElapsedLabel(timeline);
  // Only the stage that is actually still executing opens by default; a
  // settled run (complete/paused/error) has no "current" stage left to
  // expand, so every group starts collapsed and reachable-on-click.
  const activeIndex = terminal === null ? groups.length - 1 : -1;

  return (
    <section className="timeline-view" aria-label="Build progress">
      <header className="timeline-header">
        <p className="eyebrow">{pipelineStatusLabel(latestEvent)}</p>
        {/* Run meta reads as one quiet mono line, not a second KPI strip: the
            market panel below owns the big-number grammar, and two identical
            strips 170px apart made the run's own status compete with it. */}
        <p className="run-meta mono-meta">
          <span className={`run-meta__status run-meta__status--${runStatusLabel(terminal)}`}>
            {runStatusLabel(terminal)}
          </span>
          <CostChip usd={costUsd} capUsd={costCapUsd} />
          {elapsed && <span>{elapsed}</span>}
          <span>
            {groups.length} stage{groups.length === 1 ? "" : "s"}
          </span>
        </p>
      </header>
      {intel && <MarketFeature intel={intel} />}
      <div className="timeline">
        <p className="eyebrow timeline__eyebrow">{"{ run log }"}</p>
        {groups.map((group, index) => (
          <StageGroupRow
            key={group.stage}
            group={group}
            runId={runId}
            expanded={index === activeIndex}
            strippedMapKeys={intel?.strippedMapKeys ?? EMPTY_KEYS}
          />
        ))}
      </div>
      <RunOutcome
        terminal={terminal}
        previewUrl={previewUrl}
        evidenceUrl={evidenceUrl}
        hasActiveAttempt={hasActiveAttempt}
        onRecover={onRecover}
      />
    </section>
  );
}

/** One outcome row, one lime action. Secondary routes are ghost so the run
 * never presents two filled chromatic buttons (DESIGN.md §Don't). */
function RunOutcome({
  terminal,
  previewUrl,
  evidenceUrl,
  hasActiveAttempt,
  onRecover,
}: {
  terminal: TerminalKind;
  previewUrl: string | null;
  evidenceUrl: string | null;
  hasActiveAttempt: boolean;
  onRecover: () => void;
}) {
  if (!terminal) return null;

  if (terminal === "error") {
    return (
      <div className="timeline-complete">
        <button type="button" className="btn-primary" onClick={onRecover}>
          {hasActiveAttempt ? "Edit prompt and settings" : "Start a new project"}
        </button>
        {evidenceUrl && (
          <Link href={evidenceUrl} className="btn-ghost">
            Review evidence
          </Link>
        )}
      </div>
    );
  }

  if (terminal === "complete" && previewUrl) {
    return (
      <div className="timeline-complete">
        <Link href={previewUrl} className="btn-primary">
          Open preview
        </Link>
        {evidenceUrl && (
          <Link href={evidenceUrl} className="btn-ghost">
            Review evidence
          </Link>
        )}
      </div>
    );
  }

  if (evidenceUrl) {
    return (
      <div className="timeline-complete">
        <Link href={evidenceUrl} className="btn-primary">
          Review evidence
        </Link>
      </div>
    );
  }

  return null;
}
