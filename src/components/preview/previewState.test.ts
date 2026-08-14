import { describe, expect, it } from "vitest";
import {
  breakpointForWidth,
  clampPanelWidth,
  isTrustedEditorMessage,
  parseWorkbenchState,
  panelWidthBounds,
  readEditorStateMessage,
  workbenchSizeForWidth,
} from "./previewState";

describe("preview editor message guard", () => {
  const valid = {
    type: "onebox-editor-state",
    state: "text-editing",
    selection: {
      editId: "hero.headline",
      tag: "h1",
      text: "Hello",
      behavior: "text",
    },
  };

  it("accepts the versioned editor-state payload", () => {
    expect(readEditorStateMessage(valid)).toEqual(valid);
  });

  it("rejects malformed and state-inconsistent payloads", () => {
    expect(readEditorStateMessage({ ...valid, selection: null })).toBeNull();
    expect(
      readEditorStateMessage({ ...valid, selection: { editId: 4 } }),
    ).toBeNull();
    expect(readEditorStateMessage({ ...valid, state: "dragging" })).toEqual({
      ...valid,
      state: "dragging",
    });
    expect(
      readEditorStateMessage({
        ...valid,
        state: "move-requested",
        selection: { ...valid.selection, move: "previous" },
      }),
    ).toBeNull();
    expect(readEditorStateMessage({ ...valid, extra: true })).toBeNull();
    expect(
      readEditorStateMessage({
        ...valid,
        selection: { ...valid.selection, text: "x".repeat(4001) },
      }),
    ).toBeNull();
    expect(
      readEditorStateMessage({
        ...valid,
        selection: { ...valid.selection, typography: { color: "url(evil)" } },
      }),
    ).toBeNull();
    expect(
      readEditorStateMessage({
        ...valid,
        selection: {
          ...valid.selection,
          buttonAction: { type: "submit", explicit: false, javascript: "evil" },
        },
      }),
    ).toBeNull();
  });

  it("requires exact iframe window identity for opaque origins", () => {
    const frameWindow = {} as Window;
    expect(isTrustedEditorMessage(frameWindow, frameWindow, valid)).toBe(true);
    expect(isTrustedEditorMessage({} as Window, frameWindow, valid)).toBe(
      false,
    );
  });

  it("rejects legacy and unknown protocols", () => {
    expect(
      readEditorStateMessage({
        type: "onebox-select",
        editId: "hero.headline",
        tag: "h1",
        text: "Hello",
      }),
    ).toBeNull();
  });
});

describe("preview workbench state", () => {
  it("parses safe persisted values and bounds panel width", () => {
    expect(
      parseWorkbenchState(
        JSON.stringify({
          mode: "view",
          size: "expanded",
          panelWidth: 900,
          activeTool: "motion",
        }),
      ),
    ).toEqual({
      mode: "view",
      size: "expanded",
      lastOpenSize: "expanded",
      panelWidth: 720,
      activeTool: "motion",
    });
    expect(parseWorkbenchState("not-json")).toMatchObject({
      mode: "edit",
      size: "normal",
    });
  });

  it("maps actual preview widths to stable breakpoint labels", () => {
    expect(breakpointForWidth(479)).toBe("mobile");
    expect(breakpointForWidth(480)).toBe("tablet");
    expect(breakpointForWidth(767)).toBe("tablet");
    expect(breakpointForWidth(768)).toBe("desktop");
  });

  it("clamps divider movement and derives explicit panel sizes", () => {
    expect(clampPanelWidth(100, 1200)).toBe(300);
    expect(clampPanelWidth(900, 1200)).toBe(720);
    expect(workbenchSizeForWidth(519)).toBe("normal");
    expect(workbenchSizeForWidth(520)).toBe("expanded");
    expect(panelWidthBounds(1280)).toEqual({ min: 300, max: 720 });
    expect(panelWidthBounds(454)).toEqual({ min: 220, max: 220 });
  });
});
