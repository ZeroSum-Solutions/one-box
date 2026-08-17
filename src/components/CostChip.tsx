export interface CostChipProps {
  usd: number;
  /** Matches RunState.costCapUsd's schema default (contracts.ts) — PipelineEvent
   * never carries the cap, so this is the documented fallback. */
  capUsd?: number;
}

/** One cell of the run's mono meta line — spend against its cap. The market
 * panel below owns this screen's big-number KPI grammar, so run meta stays
 * quiet (DESIGN.md §Typography: mono for run ids, versions and figures). */
export function CostChip({ usd, capUsd = 3 }: CostChipProps) {
  const overCap = usd >= capUsd;
  return (
    <span role="status" aria-live="polite">
      ${usd.toFixed(2)} of ${capUsd.toFixed(2)}
      {overCap && <span className="cost-chip__warn"> · cap reached</span>}
    </span>
  );
}
