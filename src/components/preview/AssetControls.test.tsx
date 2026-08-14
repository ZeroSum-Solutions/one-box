import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssetControls,
  classifyAssetTarget,
  imageEditPayload,
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
  it("accepts image targets and sends only the guarded image-intent payload", () => {
    expect(classifyAssetTarget(imageSelection)).toMatchObject({
      supported: true,
      summary: "img · hero-image",
    });
    expect(imageEditPayload("run-1", "hero-image", "  sunlit studio  ", "00000000-0000-4000-8000-000000000009")).toEqual({
      runId: "run-1",
      editId: "hero-image",
      instruction: "sunlit studio",
      imageIntent: true,
      requestId: "00000000-0000-4000-8000-000000000009",
    });
  });

  it("renders a labelled image action without making a paid request", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const html = renderToStaticMarkup(
      <AssetControls
        runId="run-1"
        selection={imageSelection}
        onMutationComplete={() => undefined}
      />,
    );
    expect(html).toContain('aria-label="Selected image target"');
    expect(html).toContain('aria-label="Image prompt"');
    expect(html).toContain("Generate and replace image");
    expect(html).toContain("blocking gates");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps non-image media and arbitrary selections out of the paid route", () => {
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
    expect(html).toContain("Image replacement unavailable");
    expect(html).toContain("replaces images only");
    expect(html).not.toContain("Generate and replace image");
  });
});
