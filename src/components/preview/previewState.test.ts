import { describe, expect, it } from "vitest";
import {
  applyCompactDefault,
  breakpointForWidth,
  clampPanelWidth,
  didComposerTargetChange,
  isCompactWorkspace,
  isTrustedEditorMessage,
  isRunBoundRequestCurrent,
  isWorkbenchStateRestoredForRun,
  nearestPreviewBreakpoint,
  panelWidthForBreakpoint,
  previewWidthForBreakpoint,
  parseWorkbenchState,
  panelWidthBounds,
  persistWorkbenchState,
  previewIframeSandbox,
  previewIframeKey,
  readEditorStateMessage,
  resolvePreviewCompatibility,
  restoreWorkbenchState,
  shouldAcceptEditorStateMessage,
  workbenchSizeForWidth,
  DEFAULT_WORKBENCH_STATE,
  type PersistedWorkbenchState,
} from "./previewState";

describe("preview compatibility policy", () => {
  const websiteCompatibility = {
    mode: "phase-1-website",
    projectTarget: "website",
    label: "website",
    readOnly: false,
    message: null,
  };
  const legacyCompatibility = {
    mode: "legacy-read-only",
    projectTarget: "web-app",
    label: "legacy/experimental",
    readOnly: true,
    message:
      "Legacy/experimental and read-only in Phase 1; preview/export available; start a new Website project for generation/edit.",
  };

  it("enables editing only for a valid Website compatibility response", () => {
    expect(
      resolvePreviewCompatibility(true, {
        compatibility: websiteCompatibility,
      }),
    ).toEqual({
      status: "active",
      editingAvailable: true,
      compatibility: websiteCompatibility,
      notice: null,
    });
  });

  it("keeps valid legacy compatibility view-only with its notice", () => {
    expect(
      resolvePreviewCompatibility(true, {
        compatibility: legacyCompatibility,
      }),
    ).toEqual({
      status: "legacy",
      editingAvailable: false,
      compatibility: legacyCompatibility,
      notice: legacyCompatibility.message,
    });
  });

  it("fails closed with an actionable notice for missing or malformed 200 payloads", () => {
    for (const payload of [
      {},
      { compatibility: { ...websiteCompatibility, readOnly: "no" } },
      { compatibility: { ...legacyCompatibility, projectTarget: "website" } },
    ]) {
      const state = resolvePreviewCompatibility(true, payload);
      expect(state.status).toBe("error");
      expect(state.editingAvailable).toBe(false);
      expect(state.notice).toMatch(/compatibility.*could not be confirmed/i);
    }
  });

  it("fails closed with the same notice for non-OK responses and fetch failures", () => {
    for (const payload of [
      { error: "not found" },
      null,
    ]) {
      const state = resolvePreviewCompatibility(false, payload);
      expect(state.status).toBe("error");
      expect(state.editingAvailable).toBe(false);
      expect(state.notice).toMatch(/preview remains available/i);
    }
  });

  it("keeps the loading iframe on the strict sandbox until compatibility resolves", () => {
    expect(previewIframeSandbox("loading", "view")).toBe("allow-scripts");
    expect(previewIframeSandbox("active", "edit")).toBe("allow-scripts");
    expect(previewIframeSandbox("active", "view")).toBe(
      "allow-scripts allow-forms allow-popups allow-downloads",
    );
    expect(
      previewIframeKey(0, "view", previewIframeSandbox("loading", "view")),
    ).not.toBe(
      previewIframeKey(0, "view", previewIframeSandbox("active", "view")),
    );
  });

  it("accepts editor-state messages only in an authorized edit session", () => {
    expect(shouldAcceptEditorStateMessage(false, "view")).toBe(false);
    expect(shouldAcceptEditorStateMessage(true, "view")).toBe(false);
    expect(shouldAcceptEditorStateMessage(true, "edit")).toBe(true);
  });
});

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

  it("accepts a container selection (a section holding other editable nodes)", () => {
    expect(
      readEditorStateMessage({
        ...valid,
        state: "selected",
        selection: { ...valid.selection, tag: "section", behavior: "container" },
      }),
    ).toMatchObject({ selection: { behavior: "container" } });
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

  it("accepts a selection carrying a validated ancestor chain", () => {
    expect(
      readEditorStateMessage({
        ...valid,
        selection: { ...valid.selection, parentChain: ["hero"] },
        canStepBack: true,
      }),
    ).toMatchObject({
      selection: { parentChain: ["hero"] },
      canStepBack: true,
    });
  });

  it("rejects a malformed or oversized ancestor chain", () => {
    expect(
      readEditorStateMessage({
        ...valid,
        selection: { ...valid.selection, parentChain: ["not a valid id!"] },
      }),
    ).toBeNull();
    expect(
      readEditorStateMessage({
        ...valid,
        selection: {
          ...valid.selection,
          parentChain: Array.from({ length: 21 }, () => "hero"),
        },
      }),
    ).toBeNull();
    expect(
      readEditorStateMessage({
        ...valid,
        selection: { ...valid.selection, parentChain: "hero" },
      }),
    ).toBeNull();
  });

  it("rejects a non-boolean canStepBack", () => {
    expect(
      readEditorStateMessage({ ...valid, canStepBack: "yes" }),
    ).toBeNull();
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

  it("flags a composer target change only when the editId actually differs", () => {
    // Re-selecting the exact same element (a click that re-fires the same
    // editId, or an unrelated state update carrying it) must not nuke a
    // draft the user is still typing.
    expect(didComposerTargetChange("hero.headline", "hero.headline")).toBe(
      false,
    );
    // Selecting a different element while a draft is unsent -- the
    // regression this predicate exists to close: A's draft must not
    // silently re-attach to B once the target moves out from under it.
    expect(didComposerTargetChange("hero.headline", "why-us.point-1")).toBe(
      true,
    );
    // Clearing the selection (chip's Clear button, round-tripped through
    // overlay.js as selection: null) is also a target change -- the draft
    // must not survive to reattach to whatever gets selected next.
    expect(didComposerTargetChange("hero.headline", null)).toBe(true);
    // The very first selection of a session: no prior target existed, so
    // there is nothing for a stale draft to have been written against.
    expect(didComposerTargetChange(null, "hero.headline")).toBe(true);
    expect(didComposerTargetChange(null, null)).toBe(false);
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
    // Below the compact threshold the bound is the overlay's own viewport
    // margin, not the old fixed 220px floor a shared-space panel needed.
    expect(panelWidthBounds(454)).toEqual({ min: 240, max: 400 });
  });

  it("maps named preview widths to reachable workbench positions", () => {
    expect(panelWidthForBreakpoint("desktop", 1280)).toBe(300);
    // The preview viewport spends 34px of leftover space on chrome the
    // iframe never sees (.preview-viewport padding + .preview-frame
    // border, PREVIEW_FRAME_CHROME) before the named preset width, so the
    // panel must claim 34px less than the naive 1280 - 1 - preset to leave
    // the generated site an exact preset-width viewport.
    expect(panelWidthForBreakpoint("tablet", 1280)).toBe(478);
    expect(panelWidthForBreakpoint("mobile", 1280)).toBe(855);

    // Narrow windows clamp safely instead of forcing content off-screen.
    expect(panelWidthForBreakpoint("desktop", 454)).toBe(240);
    expect(panelWidthForBreakpoint("mobile", 454)).toBe(240);
  });

  it("treats sub-880px workspaces as compact, where the workbench overlays instead of sharing space", () => {
    expect(isCompactWorkspace(879)).toBe(true);
    expect(isCompactWorkspace(880)).toBe(false);
  });

  it("bounds the compact-workspace overlay by the viewport, never floored at a desktop-sized minimum", () => {
    expect(panelWidthBounds(375)).toEqual({ min: 240, max: 343 });
    expect(panelWidthBounds(600)).toEqual({ min: 240, max: 400 });
    expect(panelWidthBounds(850)).toEqual({ min: 240, max: 400 });
  });

  it("defaults the rail to collapsed on a compact workspace so the preview keeps the full viewport", () => {
    const open: PersistedWorkbenchState = {
      ...DEFAULT_WORKBENCH_STATE,
      size: "expanded",
      lastOpenSize: "expanded",
    };
    expect(applyCompactDefault(open, 600)).toEqual({
      ...open,
      size: "collapsed",
      lastOpenSize: "expanded",
    });
    expect(applyCompactDefault(DEFAULT_WORKBENCH_STATE, 600)).toEqual({
      ...DEFAULT_WORKBENCH_STATE,
      size: "collapsed",
      lastOpenSize: "normal",
    });

    // Non-compact workspaces and already-collapsed state are untouched
    // (identity-preserving — no needless re-render off a new object).
    expect(applyCompactDefault(DEFAULT_WORKBENCH_STATE, 1280)).toBe(
      DEFAULT_WORKBENCH_STATE,
    );
    const alreadyCollapsed: PersistedWorkbenchState = {
      ...DEFAULT_WORKBENCH_STATE,
      size: "collapsed",
    };
    expect(applyCompactDefault(alreadyCollapsed, 600)).toBe(alreadyCollapsed);
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
    // Snap targets are panelWidthForBreakpoint's own output (478/855 at this
    // workspace width, after PREVIEW_FRAME_CHROME), not the preset pixel
    // values themselves -- those name the iframe's width, not the panel's.
    expect(nearestPreviewBreakpoint(478, 1280)).toBe("tablet");
    expect(nearestPreviewBreakpoint(855, 1280)).toBe("mobile");
    expect(nearestPreviewBreakpoint(300, 1280)).toBe("desktop");
    expect(nearestPreviewBreakpoint(600, 1280)).toBeNull();
  });
});
