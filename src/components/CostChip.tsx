export interface CostChipProps {
  usd: number;
  /** Matches RunState.costCapUsd's schema default (contracts.ts) — PipelineEvent
   * never carries the cap, so this is the documented fallback. */
  capUsd?: number;
}

export function CostChip({ usd, capUsd = 3 }: CostChipProps) {
  const overCap = usd >= capUsd;
  return (
    <div className="cost-chip" role="status" aria-live="polite">
      <span className="cost-chip__amount">${usd.toFixed(2)}</span>
      <span className="cost-chip__cap"> / ${capUsd.toFixed(2)} cap</span>
      {overCap && <span className="cost-chip__warn"> · cap reached</span>}
    </div>
  );
}
