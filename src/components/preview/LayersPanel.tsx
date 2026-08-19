"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// Same markup/classes as Workbench.tsx's own (unexported) ToolState -- kept
// as a private duplicate here rather than importing across files. Workbench
// imports several "@/..." path-aliased siblings (ChatComposer, GateStrip)
// that Next's own bundler resolves fine but this project's plain
// `vitest run` (no tsconfig-paths plugin) cannot -- reaching into Workbench
// from a file a unit test loads would break that test's module resolution
// for a reason with nothing to do with either component's own logic.
function ToolState({
  kind,
  title,
  children,
}: {
  kind: "empty" | "loading" | "error";
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`workbench-state workbench-state--${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <span className="workbench-state__label">{kind}</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

interface LayerNode {
  editId: string;
  tag: string;
  text: string;
  depth: number;
  parentEditId: string | null;
  container: boolean;
}

export interface LayersPanelProps {
  runId: string;
  /** Bumped by the page whenever any surface finishes a mutation — the same
   * signal UndoRedoRail and GateStrip already refetch on (canvas-upgrade
   * Wave 4, Play 8). A reorder changes this tree's own shape, so it has to
   * refetch on it too, not only on mount. */
  refreshToken: number;
  selectedEditId: string | null;
  onSelectElement: (editId: string) => void;
  onHoverElement: (editId: string | null) => void;
}

/**
 * Layers / Navigator panel (canvas-upgrade Wave 5, Play 6). Renders every
 * data-edit-id node as one flat, indented, DOM-order list — not a
 * collapsible tree with expand/collapse groups. That's a deliberate
 * simplification: today's sites run ~2-3 levels deep and ~40 nodes total,
 * comfortably one scroll, so collapsing buys nothing yet and would add a
 * second piece of per-row state (expanded/collapsed) with nothing to earn
 * it. ARIA still models it as a tree (role="tree"/"treeitem" with
 * aria-level) since the ROLE that matters to assistive tech is "a
 * hierarchy of selectable rows", independent of whether any node happens
 * to be collapsible today.
 *
 * The tree and the canvas are one selection state, both directions (the
 * Webflow Navigator bar this play is built against): clicking a row
 * selects THROUGH the same select-by-id command the breadcrumb strip
 * already uses (never a second selection path), and the row matching
 * `selectedEditId` — which page.tsx derives from the real overlay.js
 * selection round-trip, not local state — is marked, so selecting on
 * canvas moves the mark here with no action of this component's own.
 */
export function LayersPanel({
  runId,
  refreshToken,
  selectedEditId,
  onSelectElement,
  onHoverElement,
}: LayersPanelProps) {
  const [nodes, setNodes] = useState<LayerNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  // Tracks the (selectedEditId, "tree loaded") pair this component last
  // reacted to, so the roving tabindex can follow a NEW selection -- INCLUDING
  // one that was already current when the tree finished its first load --
  // without living inside a useEffect (react-hooks/set-state-in-effect).
  // This is React's own documented "adjust state during render, not in an
  // effect" escape hatch: it runs during render, compares against the
  // previous render's key, and issues at most one extra re-render per real
  // change, never a cascade.
  const syncKey = nodes && selectedEditId ? selectedEditId : null;
  const [lastSyncKey, setLastSyncKey] = useState<string | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  if (syncKey !== lastSyncKey) {
    setLastSyncKey(syncKey);
    if (syncKey && nodes) {
      const index = nodes.findIndex((node) => node.editId === syncKey);
      if (index >= 0) setFocusIndex(index);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/elements?runId=${encodeURIComponent(runId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`layers unavailable (${response.status})`);
        const data = (await response.json()) as { tree?: LayerNode[] };
        return data.tree ?? [];
      })
      .then((tree) => {
        if (cancelled) return;
        setNodes(tree);
        setError(null);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "layers unavailable",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [runId, refreshToken]);

  // Unmounts on every tool switch (Workbench's panelContent() renders only
  // the active tool) and on any selection change that leaves this tool —
  // either way, a stale tree-hover highlight must not survive the row that
  // set it going away.
  useEffect(() => () => onHoverElement(null), [onHoverElement]);

  function focusRow(index: number) {
    setFocusIndex(index);
    rowRefs.current[index]?.focus();
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number) {
    if (!nodes || nodes.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(Math.min(index + 1, nodes.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(Math.max(index - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusRow(nodes.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectElement(nodes[index].editId);
    }
  }

  if (error) {
    return (
      <ToolState kind="error" title="Layers unavailable">
        {error}
      </ToolState>
    );
  }

  if (!nodes) {
    return (
      <ToolState kind="loading" title="Loading layers…">
        Reading the current page structure.
      </ToolState>
    );
  }

  if (nodes.length === 0) {
    return (
      <ToolState kind="empty" title="Nothing to show yet">
        The site has no editable elements yet.
      </ToolState>
    );
  }

  return (
    <div className="layers-tree" role="tree" aria-label="Page layers">
      {nodes.map((node, index) => {
        const selected = node.editId === selectedEditId;
        return (
          <div
            key={node.editId}
            ref={(el) => {
              rowRefs.current[index] = el;
            }}
            role="treeitem"
            aria-level={node.depth + 1}
            aria-selected={selected}
            tabIndex={index === focusIndex ? 0 : -1}
            className={`layers-tree__row${selected ? " layers-tree__row--selected" : ""}${node.container ? " layers-tree__row--container" : ""}`}
            style={{ paddingLeft: `calc(var(--spacing-12) + ${node.depth * 16}px)` }}
            title={node.editId}
            onClick={() => onSelectElement(node.editId)}
            onFocus={() => {
              setFocusIndex(index);
              onHoverElement(node.editId);
            }}
            onBlur={() => onHoverElement(null)}
            onMouseEnter={() => onHoverElement(node.editId)}
            onMouseLeave={() => onHoverElement(null)}
            onKeyDown={(event) => onRowKeyDown(event, index)}
          >
            <span className="layers-tree__tag">{node.tag}</span>
            <span className="layers-tree__id">{node.editId}</span>
          </div>
        );
      })}
    </div>
  );
}
