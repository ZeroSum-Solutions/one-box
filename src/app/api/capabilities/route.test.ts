import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalReferoToken = process.env.REFERO_MCP_TOKEN;

afterEach(() => {
  if (originalReferoToken === undefined) delete process.env.REFERO_MCP_TOKEN;
  else process.env.REFERO_MCP_TOKEN = originalReferoToken;
});

describe("runtime capabilities", () => {
  it("denies a non-loopback host before exposing capability state", async () => {
    const response = await GET(
      new Request("http://hostile.example/api/capabilities", {
        headers: { Host: "hostile.example" },
      })
    );
    expect(response.status).toBe(403);
  });

  it("reports Refero availability without exposing the token", async () => {
    process.env.REFERO_MCP_TOKEN = "test-only-token";
    const response = await GET(
      new Request("http://127.0.0.1:3000/api/capabilities", {
        headers: { Host: "127.0.0.1:3000" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      referoDesignEvidence: true,
    });
  });
});
