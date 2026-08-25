import { describe, expect, it, vi } from "vitest";
import { handleReferoCallback } from "./callback/route-runtime";
import { handleReferoConnect } from "./connect/route-runtime";

describe("Refero OAuth routes", () => {
  it("denies non-loopback authorization starts before network work", async () => {
    const beginReferoAuthorization = vi.fn();
    const response = await handleReferoConnect(
      new Request("http://hostile.example/api/refero/connect", {
        headers: { Host: "hostile.example" },
      }),
      { beginReferoAuthorization }
    );
    expect(response.status).toBe(403);
    expect(beginReferoAuthorization).not.toHaveBeenCalled();
  });

  it("denies a cross-site browser from starting local OAuth", async () => {
    const beginReferoAuthorization = vi.fn();
    const response = await handleReferoConnect(
      new Request("http://127.0.0.1:3000/api/refero/connect", {
        headers: {
          Host: "127.0.0.1:3000",
          "Sec-Fetch-Site": "cross-site",
        },
      }),
      { beginReferoAuthorization }
    );
    expect(response.status).toBe(403);
    expect(beginReferoAuthorization).not.toHaveBeenCalled();
  });

  it("redirects a local user only to an HTTPS authorization URL", async () => {
    const response = await handleReferoConnect(
      new Request("http://127.0.0.1:3000/api/refero/connect", {
        headers: {
          Host: "127.0.0.1:3000",
          "Sec-Fetch-Site": "same-origin",
        },
      }),
      {
        beginReferoAuthorization: vi.fn().mockResolvedValue({
          connected: false,
          authorizationUrl: "https://auth.refero.design/authorize?request=1",
        }),
      }
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(
      /^https:\/\/auth\.refero\.design\//
    );
  });

  it("rejects an unsafe authorization redirect", async () => {
    const response = await handleReferoConnect(
      new Request("http://127.0.0.1:3000/api/refero/connect", {
        headers: { Host: "127.0.0.1:3000" },
      }),
      {
        beginReferoAuthorization: vi.fn().mockResolvedValue({
          connected: false,
          authorizationUrl: "http://attacker.example/authorize",
        }),
      }
    );
    expect(response.status).toBe(502);
  });

  it("rejects an HTTPS authorization redirect outside Refero", async () => {
    const response = await handleReferoConnect(
      new Request("http://127.0.0.1:3000/api/refero/connect", {
        headers: { Host: "127.0.0.1:3000" },
      }),
      {
        beginReferoAuthorization: vi.fn().mockResolvedValue({
          connected: false,
          authorizationUrl: "https://attacker.example/authorize",
        }),
      }
    );
    expect(response.status).toBe(502);
  });

  it("validates callback inputs before completing authorization", async () => {
    const completeReferoAuthorization = vi.fn();
    const response = await handleReferoCallback(
      new Request("http://127.0.0.1:3000/api/refero/callback?code=only", {
        headers: { Host: "127.0.0.1:3000" },
      }),
      { completeReferoAuthorization }
    );
    expect(response.status).toBe(400);
    expect(completeReferoAuthorization).not.toHaveBeenCalled();
  });

  it("completes a state-bound callback and returns to intake", async () => {
    const completeReferoAuthorization = vi.fn().mockResolvedValue(undefined);
    const response = await handleReferoCallback(
      new Request(
        "http://127.0.0.1:3000/api/refero/callback?code=code&state=state",
        { headers: { Host: "127.0.0.1:3000" } }
      ),
      { completeReferoAuthorization }
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/?refero=connected"
    );
    expect(completeReferoAuthorization).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/api/refero/callback",
      "code",
      "state"
    );
  });
});
