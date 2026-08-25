import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MapEmbedQuerySchema,
  embedSearchQuery,
  googleEmbedDestination,
  mapsEmbedConfigured,
} from "./mapEmbed";

afterEach(() => vi.unstubAllEnvs());

describe("map embed boundary", () => {
  it("accepts a trimmed bounded market query", () => {
    expect(MapEmbedQuerySchema.parse("plumber in Austin, TX")).toBe("plumber in Austin, TX");
    expect(() => MapEmbedQuerySchema.parse("x".repeat(201))).toThrow();
    expect(() => MapEmbedQuerySchema.parse("bad\r\nquery")).toThrow();
  });

  it("uses only the Embed key and returns a key-free descriptor", () => {
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "embed-test-key");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "legacy-test-key");
    expect(mapsEmbedConfigured()).toBe(true);
    expect(embedSearchQuery("plumber in Austin, TX")).toBe("plumber in Austin, TX");
    expect(embedSearchQuery("plumber in Austin, TX")).not.toContain("key=");
    expect(googleEmbedDestination("plumber in Austin, TX").toString()).toBe(
      "https://www.google.com/maps/embed/v1/search?key=embed-test-key&q=plumber+in+Austin%2C+TX"
    );
  });

  it("does not use the Places or legacy key", () => {
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "legacy-test-key");
    expect(mapsEmbedConfigured()).toBe(false);
    expect(embedSearchQuery("plumber in Austin, TX")).toBeUndefined();
  });
});
