import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CardMap } from "../lib/contracts";
import { CardMapView, mapFrameSrc } from "./StageCard";

const fallbackUrl =
  "https://www.google.com/maps/search/?api=1&query=plumber%20in%20Austin%2C%20TX";

describe("map rendering boundary", () => {
  it("builds a key-free same-origin frame path from the map descriptor", () => {
    const map: CardMap = {
      embedQuery: "plumber in Austin, TX",
      fallbackUrl,
      pins: [],
    };

    expect(mapFrameSrc(map)).toBe(
      "/api/maps/embed?q=plumber%20in%20Austin%2C%20TX"
    );
    expect(mapFrameSrc(map)).not.toContain("key=");
  });

  it("ignores a historical embedUrl and preserves its key-free fallback", () => {
    const legacyMap = {
      embedUrl: "https://www.google.com/maps/embed/v1/search?key=legacy-key&q=plumber",
      fallbackUrl,
      pins: [],
      note: "Map unavailable.",
    } as unknown as CardMap;

    const html = renderToStaticMarkup(<CardMapView map={legacyMap} />);

    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("legacy-key");
    expect(html).toContain(fallbackUrl.replaceAll("&", "&amp;"));
  });
});
