import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UndoRedoRail } from "./UndoRedoRail";

afterEach(() => vi.unstubAllGlobals());

describe("UndoRedoRail", () => {
  it("unmounts entirely in view mode -- undo/redo mutate the site, so a disabled-but-present rail would still act the instant mode flips back to edit", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const html = renderToStaticMarkup(
      <UndoRedoRail
        runId="run-1"
        mode="view"
        refreshToken={0}
        onMutationComplete={() => undefined}
      />,
    );
    expect(html).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders Undo, Redo, and Reset in edit mode, present regardless of selection", () => {
    const html = renderToStaticMarkup(
      <UndoRedoRail
        runId="run-1"
        mode="edit"
        refreshToken={0}
        onMutationComplete={() => undefined}
      />,
    );
    expect(html).toContain("Undo");
    expect(html).toContain("Redo");
    expect(html).toContain("Reset");
    expect(html).toContain('aria-label="Edit history"');
  });
});
