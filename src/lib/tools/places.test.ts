import { afterEach, describe, expect, it, vi } from "vitest";
import { findPlace, placesApiKey, placesConfigured } from "./places";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Places credential boundary", () => {
  it("uses only the server-side Places key", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "embed-test-key");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "legacy-test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    expect(placesApiKey()).toBe("places-test-key");
    expect(placesConfigured()).toBe(true);
    await findPlace("plumber in Austin, TX", undefined, 1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ "X-Goog-Api-Key": "places-test-key" });
    expect(JSON.parse(String(init.body))).toEqual({
      textQuery: "plumber in Austin, TX",
      pageSize: 1,
    });
  });

  it("does not fall back to Embed or legacy keys", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "embed-test-key");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "legacy-test-key");
    expect(await findPlace("bakery in Portland, OR")).toEqual({
      places: [],
      unavailable: "GOOGLE_PLACES_API_KEY is not set",
    });
  });

  it("does not copy provider response text into the unavailable message", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: "request included places-test-key" } }),
      { status: 403 }
    )));
    const result = await findPlace("electrician in Reno, NV");
    expect(result.unavailable).toBe("places searchText unavailable (403)");
    expect(JSON.stringify(result)).not.toContain("places-test-key");
  });
});
