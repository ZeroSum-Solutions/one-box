"use client";

import { useEffect } from "react";

/**
 * Marks the document while the tab is hidden so infinite CSS animations can
 * pause. A compositor-driven animation holds Chrome's GPU process — and macOS
 * WindowServer behind it — at the display refresh rate for as long as it runs,
 * including on background tabs of a stale run nobody is watching.
 */
export function PageVisibility() {
  useEffect(() => {
    const root = document.documentElement;

    function sync() {
      root.toggleAttribute("data-page-hidden", document.hidden);
    }

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      root.removeAttribute("data-page-hidden");
    };
  }, []);

  return null;
}
