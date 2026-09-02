import { afterEach, describe, expect, it, vi } from "vitest";
import { preflight } from "./preflight";

afterEach(() => vi.unstubAllEnvs());

describe("Google Maps preflight", () => {
  it("reports Places and Embed as separate advisory capabilities", () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const keys = preflight("none", {
      businessResearch: false,
      referenceResearch: false,
    }).advisory.map((issue) => issue.key);
    expect(keys).toEqual(["GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_EMBED_API_KEY"]);
  });

  it("flags a legacy mixed key without treating either lane as configured", () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "legacy-test-key");
    const result = preflight("none", {
      businessResearch: false,
      referenceResearch: false,
    });
    expect(result.advisory.map((issue) => issue.key)).toEqual([
      "GOOGLE_PLACES_API_KEY",
      "GOOGLE_MAPS_EMBED_API_KEY",
      "GOOGLE_MAPS_API_KEY",
    ]);
  });
});
