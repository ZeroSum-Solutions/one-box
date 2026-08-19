import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ElementControls } from "./ElementControls";
import type { PreviewSelection } from "./previewState";

// A container can still report assetKind "image" merely because it WRAPS an
// <img> descendant somewhere inside it (overlay.js selectionFor() sets
// assetKind from el.querySelector("img")) -- this fixture deliberately
// keeps that field set to prove the container branch below does not use it
// to unlock anything.
const containerSelection: PreviewSelection = {
  editId: "hero",
  tag: "section",
  text: "Fiber internet installed right, the first time. Call for same-week service",
  behavior: "container",
  assetKind: "image",
};

const textSelection: PreviewSelection = {
  editId: "hero.headline",
  tag: "h1",
  text: "Fiber internet installed right, the first time.",
  behavior: "text",
};

const linkSelection: PreviewSelection = {
  editId: "hero.cta",
  tag: "a",
  text: "Call for same-week service",
  behavior: "interactive",
  href: "#contact",
};

function renderControls(selection: PreviewSelection) {
  return renderToStaticMarkup(
    <ElementControls
      runId="run-1"
      selection={selection}
      editorState="selected"
      onEditorCommand={() => undefined}
      onMutationComplete={() => undefined}
    />,
  );
}

describe("ElementControls", () => {
  // canvas-upgrade Wave 4, Play 10: elementEditor.ts's setDirectText() 409s
  // unconditionally on any target with a descendant data-edit-id, which
  // every container has by definition. None of these controls' onClick
  // handlers exist in the render tree for a container selection, so no code
  // path in this panel can issue a POST /api/elements carrying a text patch
  // (or an href/button-action patch) against a container editId -- the
  // handlers that would build one are never rendered to begin with.
  it("hides every control guaranteed to fail for a container selection", () => {
    const html = renderControls(containerSelection);
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Destination / action");
    expect(html).not.toContain("Button action");
    expect(html).not.toContain("Typography");
    expect(html).not.toContain("Save value");
  });

  it("still surfaces what DOES work on a container: reordering and the composer pointer", () => {
    const html = renderControls(containerSelection);
    expect(html).toContain("Layout order");
    expect(html).toContain("Move earlier");
    expect(html).toContain("Move later");
    expect(html).toContain("composer");
  });

  it("keeps the structured text-replace box for an ordinary text selection", () => {
    const html = renderControls(textSelection);
    expect(html).toContain("<textarea");
    expect(html).toContain("Save value");
  });

  it("keeps the href field for a link selection but not the text-only container message", () => {
    const html = renderControls(linkSelection);
    expect(html).toContain("Destination / action");
    expect(html).not.toContain("is a section, not a single piece of text");
  });

  // canvas-upgrade Wave 5, Play 7b: an impossible move is disabled rather
  // than left to fail server-side.
  it("disables Move earlier/later per moveTargets, and leaves both enabled with no moveTargets at all", () => {
    const firstSection = renderControls({
      ...containerSelection,
      moveTargets: { earlier: false, later: true },
    });
    expect(firstSection).toMatch(/disabled[^>]*>\s*Move earlier/);
    expect(firstSection).not.toMatch(/disabled[^>]*>\s*Move later/);

    const fixedChrome = renderControls({
      ...containerSelection,
      moveTargets: { earlier: false, later: false },
    });
    expect(fixedChrome).toMatch(/disabled[^>]*>\s*Move earlier/);
    expect(fixedChrome).toMatch(/disabled[^>]*>\s*Move later/);

    const noSignal = renderControls(containerSelection);
    expect(noSignal).not.toMatch(/disabled[^>]*>\s*Move earlier/);
    expect(noSignal).not.toMatch(/disabled[^>]*>\s*Move later/);
  });
});
