"use client";

import { useEffect, useState } from "react";
import type { GateReport } from "@/lib/contracts";

export interface GateStripProps {
  runId: string;
  /** Bump to force a refetch (the preview page increments this after every edit). */
  refreshToken?: number;
}

/** Self-fetching gate status strip: green dot = pass, hollow ring = fail (no
 * sixth taxonomy hue — see globals.css note). Refetches gates.json on mount
 * and whenever refreshToken changes. */
export function GateStrip({ runId, refreshToken = 0 }: GateStripProps) {
  const [gates, setGates] = useState<GateReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/sites/${encodeURIComponent(runId)}/gates.json`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`gates.json not available yet (${res.status})`);
        return res.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
        setGates(Array.isArray(data) ? (data as GateReport[]) : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setGates(null);
          setError(err instanceof Error ? err.message : "Gates unavailable.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [runId, refreshToken]);

  return (
    <div className="gate-strip">
      <p className="eyebrow">{"{ Gates }"}</p>
      {error && <p className="gate-strip__error">{error}</p>}
      {!error && !gates && <p className="gate-strip__pending">Checking…</p>}
      {gates && gates.length === 0 && !error && <p className="gate-strip__pending">No gate report yet.</p>}
      {gates && gates.length > 0 && (
        <ul className="gate-strip__list">
          {gates.map((g) => (
            <li key={g.gate} className="gate-strip__item" title={g.details.join(" · ") || g.gate}>
              <span
                className={`gate-dot ${g.pass ? "gate-dot--pass" : "gate-dot--fail"}`}
                aria-hidden="true"
              />
              <span className="gate-strip__name">{g.gate}</span>
              {!g.blocking && <span className="gate-strip__advisory">advisory</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
