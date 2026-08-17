import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssetControls,
  classifyAssetTarget,
  retainGenerationAttempt,
} from "./AssetControls";
import type { PreviewSelection } from "./previewState";

const imageSelection: PreviewSelection = {
  editId: "hero-image",
  tag: "img",
  text: "",
  behavior: "safe-overlay",
  assetKind: "image",
};

afterEach(() => vi.unstubAllGlobals());

describe("AssetControls", () => {
  it("keeps one immutable request snapshot across an ambiguous retry", () => {
    const first = {
      requestId: "00000000-0000-4000-8000-000000000133",
      prompt: "Original prompt",
      model: "higgsfield:gpt_image_2",
      aspectRatio: "1:1",
      quality: "high" as const,
      sourceAssetId: null,
      targetEditId: "hero-image",
    };
    const changedDraft = {
      ...first,
      requestId: "00000000-0000-4000-8000-000000000134",
      prompt: "Changed prompt",
    };
    expect(retainGenerationAttempt(first, changedDraft)).toBe(first);
    expect(retainGenerationAttempt(null, changedDraft)).toBe(changedDraft);
  });

  it("accepts image targets without broadening non-image selection authority", () => {
    expect(classifyAssetTarget(imageSelection)).toMatchObject({
      supported: true,
      summary: "img · hero-image",
    });
  });

  it("renders project Library and Generate views without making a paid request", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const html = renderToStaticMarkup(
      <AssetControls
        runId="run-1"
        selection={imageSelection}
        onMutationComplete={() => undefined}
      />,
    );
    expect(html).toContain('aria-label="Asset view"');
    expect(html).toContain('aria-label="Selected image target"');
    expect(html).toContain("Library");
    expect(html).toContain("Generate");
    expect(html).toContain("Project images");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps non-image media and arbitrary selections out of placement authority", () => {
    const video = { ...imageSelection, editId: "showreel", tag: "video" };
    const text = { ...imageSelection, editId: "headline", tag: "h1", assetKind: undefined };
    const namedButEmpty = { ...imageSelection, editId: "hero.image", tag: "figure", assetKind: undefined };
    expect(classifyAssetTarget(video)).toMatchObject({ supported: false });
    expect(classifyAssetTarget(text)).toMatchObject({ supported: false });
    expect(classifyAssetTarget(namedButEmpty)).toMatchObject({ supported: false });

    const html = renderToStaticMarkup(
      <AssetControls
        runId="run-1"
        selection={video}
        onMutationComplete={() => undefined}
      />,
    );
    expect(html).toContain("Project images");
    expect(html).not.toContain("Replace selected");
  });

  it("keeps a section out of single-image swap authority even when it wraps an image", () => {
    // overlay.js selectionFor() sets assetKind "image" whenever the selected
    // element WRAPS an <img> descendant, container or not (canvas-upgrade
    // Wave 4, Play 10) -- a section's own assetKind can read "image" this
    // way without the section itself being one swappable image.
    const sectionWrappingImage = {
      ...imageSelection,
      editId: "hero",
      tag: "section",
      behavior: "container" as const,
    };
    expect(classifyAssetTarget(sectionWrappingImage)).toMatchObject({
      supported: false,
    });

    const html = renderToStaticMarkup(
      <AssetControls
        runId="run-1"
        selection={sectionWrappingImage}
        onMutationComplete={() => undefined}
      />,
    );
    expect(html).not.toContain("Replace selected");
  });
});
