import { afterEach, describe, expect, it } from "vitest";
import { isLocalApiAuthorized } from "./localApiAuth";

afterEach(() => {
  delete process.env.ONE_BOX_API_TOKEN;
});

function mutation(
  url: string,
  headers: Record<string, string> = {}
): Request {
  const requestUrl = new URL(url);
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: requestUrl.host,
      ...headers,
    },
    body: "{}",
  });
}

describe("local API authorization", () => {
  it("requires a loopback URL and same-origin fetch metadata for browser mutations", () => {
    expect(
      isLocalApiAuthorized(
        mutation("http://localhost:3000/api/chat", {
          Origin: "http://localhost:3000",
          "Sec-Fetch-Site": "same-origin",
        })
      )
    ).toBe(true);
    expect(
      isLocalApiAuthorized(
        mutation("http://localhost:3000/api/chat", {
          Origin: "http://localhost:3000",
        })
      )
    ).toBe(false);
    expect(
      isLocalApiAuthorized(
        mutation("http://attacker.example/api/chat", {
          Host: "localhost:3000",
          Origin: "http://attacker.example",
          "Sec-Fetch-Site": "same-origin",
        })
      )
    ).toBe(false);
    expect(
      isLocalApiAuthorized(
        mutation("http://localhost.evil.example/api/chat", {
          Origin: "http://localhost.evil.example",
          "Sec-Fetch-Site": "same-origin",
        })
      )
    ).toBe(false);
  });

  it("uses the validated Host authority when Next rebases the request URL hostname", () => {
    expect(
      isLocalApiAuthorized(
        mutation("http://localhost:3000/api/chat", {
          Host: "127.0.0.1:3000",
          Origin: "http://127.0.0.1:3000",
          "Sec-Fetch-Site": "same-origin",
        })
      )
    ).toBe(true);
  });

  it("rejects hostile, lookalike, missing, and port-mismatched effective hosts", () => {
    for (const host of [
      "attacker.example:3000",
      "localhost.evil.example:3000",
      "127.0.0.1.example:3000",
      "",
    ]) {
      const request = mutation("http://localhost:3000/api/chat", {
        Origin: "http://localhost:3000",
        "Sec-Fetch-Site": "same-origin",
      });
      if (host) request.headers.set("Host", host);
      else request.headers.delete("Host");
      expect(isLocalApiAuthorized(request)).toBe(false);
    }

    expect(
      isLocalApiAuthorized(
        mutation("http://localhost:3000/api/chat", {
          Host: "127.0.0.1:3000",
          Origin: "http://127.0.0.1:3001",
          "Sec-Fetch-Site": "same-origin",
        })
      )
    ).toBe(false);
  });

  it("accepts exact loopback variants and a configured bearer automation client", () => {
    for (const origin of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
    ]) {
      expect(
        isLocalApiAuthorized(
          mutation(`${origin}/api/chat`, {
            Origin: origin,
            "Sec-Fetch-Site": "same-origin",
          })
        )
      ).toBe(true);
    }

    process.env.ONE_BOX_API_TOKEN = "exact-local-token";
    expect(
      isLocalApiAuthorized(
        mutation("http://127.0.0.1:3000/api/chat", {
          Authorization: "Bearer exact-local-token",
        })
      )
    ).toBe(true);
    expect(
      isLocalApiAuthorized(
        mutation("http://attacker.example/api/chat", {
          Authorization: "Bearer exact-local-token",
        })
      )
    ).toBe(false);
  });

  it("preserves no-Origin safe GETs while rejecting cross-origin GETs", () => {
    expect(
      isLocalApiAuthorized(
        new Request("http://localhost:3000/api/evidence/run1", {
          headers: { Host: "localhost:3000" },
        })
      )
    ).toBe(true);
    expect(
      isLocalApiAuthorized(
        new Request("http://attacker.example/api/evidence/run1", {
          headers: { Host: "localhost" },
        })
      )
    ).toBe(false);
    expect(
      isLocalApiAuthorized(
        new Request("http://localhost:3000/api/evidence/run1", {
          headers: {
            Host: "localhost:3000",
            Origin: "https://attacker.example",
          },
        })
      )
    ).toBe(false);
  });

  it("keeps shipped development and production servers loopback-only", async () => {
    const { scripts } = JSON.parse(
      await import("node:fs/promises").then((fs) =>
        fs.readFile(new URL("../../package.json", import.meta.url), "utf8")
      )
    ) as { scripts: Record<string, string> };
    expect(scripts.dev).toBe("./scripts/dev.sh");
    expect(scripts["dev:next"]).toContain("--hostname 127.0.0.1");
    expect(scripts["dev:next"]).toContain("--port 3000");
    expect(scripts.start).toContain("--hostname 127.0.0.1");
  });
});
