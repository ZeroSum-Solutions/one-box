import { describe, expect, it } from "vitest";
import {
  breakpointForWidth,
  clampPanelWidth,
  isTrustedEditorMessage,
  isRunBoundRequestCurrent,
  isWorkbenchStateRestoredForRun,
  nearestPreviewBreakpoint,
  panelWidthForBreakpoint,
  previewWidthForBreakpoint,
  parseWorkbenchState,
  panelWidthBounds,
  persistWorkbenchState,
  readEditorStateMessage,
  restoreWorkbenchState,
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
    expect(
      readEditorStateMessage({
        ...valid,
        state: "selected",
        selection: {
          ...valid.selection,
          tag: "img",
          behavior: "safe-overlay",
          assetKind: "image",
        },
      }),
    ).toMatchObject({ selection: { assetKind: "image" } });
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
    expect(
      readEditorStateMessage({
        ...valid,
        selection: { ...valid.selection, assetKind: "video" },
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
  it("persists only state restored for the current run id", () => {
    expect(isWorkbenchStateRestoredForRun("run-a", "run-a")).toBe(true);
    expect(isWorkbenchStateRestoredForRun("run-a", "run-b")).toBe(false);
    expect(isWorkbenchStateRestoredForRun(null, "run-b")).toBe(false);
  });

  it("rejects stale edit and paid-asset completions after run navigation", () => {
    expect(isRunBoundRequestCurrent("run-a", "run-a")).toBe(true);
    expect(isRunBoundRequestCurrent("run-a", "run-b")).toBe(false);
  });

  it("falls back and keeps persistence best-effort when storage is unavailable", () => {
    const unavailableStorage = {
      getItem: () => {
        throw new Error("storage blocked");
      },
      setItem: () => {
        throw new Error("storage quota exceeded");
      },
    };

    expect(restoreWorkbenchState(unavailableStorage, "run-1")).toMatchObject({
      mode: "edit",
      size: "normal",
      panelWidth: 360,
    });
    expect(() =>
      persistWorkbenchState(unavailableStorage, "run-1", {
        mode: "view",
        size: "expanded",
        lastOpenSize: "expanded",
        panelWidth: 600,
        activeTool: "assets",
        previewPreset: "tablet",
      }),
    ).not.toThrow();
  });

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
      panelWidth: 900,
      activeTool: "motion",
      previewPreset: null,
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
    expect(clampPanelWidth(1_100, 1200)).toBe(940);
    expect(workbenchSizeForWidth(519)).toBe("normal");
    expect(workbenchSizeForWidth(520)).toBe("expanded");
    expect(panelWidthBounds(1280)).toEqual({ min: 300, max: 960 });
    expect(panelWidthBounds(454)).toEqual({ min: 220, max: 220 });
  });

  it("maps named preview widths to reachable workbench positions", () => {
    expect(panelWidthForBreakpoint("desktop", 1280)).toBe(300);
    expect(panelWidthForBreakpoint("tablet", 1280)).toBe(512);
    expect(panelWidthForBreakpoint("mobile", 1280)).toBe(889);

    // Narrow windows clamp safely instead of forcing content off-screen.
    expect(panelWidthForBreakpoint("desktop", 454)).toBe(220);
    expect(panelWidthForBreakpoint("mobile", 454)).toBe(220);
  });

  it("keeps named canvas widths exact when the workbench reaches its cap", () => {
    expect(panelWidthForBreakpoint("tablet", 1920)).toBe(960);
    expect(panelWidthForBreakpoint("mobile", 1920)).toBe(960);
    expect(previewWidthForBreakpoint("desktop")).toBe(1280);
    expect(previewWidthForBreakpoint("tablet")).toBe(767);
    expect(previewWidthForBreakpoint("mobile")).toBe(390);

    expect(
      parseWorkbenchState(
        JSON.stringify({
          mode: "edit",
          size: "expanded",
          lastOpenSize: "expanded",
          panelWidth: 960,
          activeTool: "selection",
          previewPreset: "mobile",
        }),
      ).previewPreset,
    ).toBe("mobile");
    expect(
      parseWorkbenchState(JSON.stringify({ previewPreset: "watch" }))
        .previewPreset,
    ).toBeNull();
  });

  it("finds preview snap points without making fluid resizing sticky", () => {
    expect(nearestPreviewBreakpoint(512, 1280)).toBe("tablet");
    expect(nearestPreviewBreakpoint(889, 1280)).toBe("mobile");
    expect(nearestPreviewBreakpoint(300, 1280)).toBe("desktop");
    expect(nearestPreviewBreakpoint(600, 1280)).toBeNull();
  });
});
