import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LayersPanel } from "./LayersPanel";

// renderToStaticMarkup never runs effects (same convention as
// UndoRedoRail.test.tsx), so it only ever sees this component's SYNCHRONOUS
// first render -- before its GET /api/elements fetch resolves. That is
// still worth pinning: the loading state must be the honest starting point,
// never an empty flash or a stale tree. The interactive claims (click ->
// canvas selection, canvas selection -> marked row, hover highlight) are
// proven end to end by scripts/e2e/canvas-coverage.mjs's --assert
// layers-sync, against a real browser and a real GET /api/elements
// response, which this static-markup tier cannot exercise.
describe("LayersPanel", () => {
  it("renders the loading state before the tree fetch resolves", () => {
    const html = renderToStaticMarkup(
      <LayersPanel
        runId="run-1"
        refreshToken={0}
        selectedEditId={null}
        onSelectElement={() => undefined}
        onHoverElement={() => undefined}
      />,
    );
    expect(html).toContain("Loading layers");
    expect(html).not.toContain('role="tree"');
  });
});
