import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/maps/embed", () => {
  it("redirects a bounded query without caching", async () => {
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "embed-test-key");
    const response = await GET(new Request(
      "http://127.0.0.1:3000/api/maps/embed?q=plumber%20in%20Austin%2C%20TX"
    ));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.google.com/maps/embed/v1/search?key=embed-test-key&q=plumber+in+Austin%2C+TX"
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects malformed or missing queries before reading credentials", async () => {
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "embed-test-key");
    const response = await GET(new Request("http://127.0.0.1:3000/api/maps/embed?q="));
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Invalid map query");
  });

  it.each([
    "%0Aplumber%20in%20Austin%2C%20TX",
    "plumber%20in%20Austin%2C%20TX%0D%0A",
  ])("rejects a query with boundary line breaks: %s", async (query) => {
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "embed-test-key");
    const response = await GET(new Request(
      `http://127.0.0.1:3000/api/maps/embed?q=${query}`
    ));
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Invalid map query");
  });

  it("returns a redacted unavailable response when Embed is not configured", async () => {
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "");
    const response = await GET(new Request(
      "http://127.0.0.1:3000/api/maps/embed?q=plumber%20in%20Austin%2C%20TX"
    ));
    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("Map display is not configured");
  });
});
