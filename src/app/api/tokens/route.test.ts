import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(async () => ({ tokens: [], canRevert: false })),
  preview: vi.fn(),
  apply: vi.fn(),
  revert: vi.fn(),
}));
vi.mock("../../../lib/siteTokens", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/siteTokens")>()),
  inspectSiteTokens: mocks.inspect,
  previewTokenEdit: mocks.preview,
  applyTokenEdit: mocks.apply,
  revertTokenEdit: mocks.revert,
}));

import { GET, POST } from "./route";

describe("token route authorization", () => {
  const hostileHeaders: Record<string, string>[] = [{}, { Origin: "https://evil.example", "Content-Type": "application/json" }];
  it.each(hostileHeaders)("rejects hostile mutation before body or disk", async (headers) => {
    const json = vi.fn(async () => null);
    const response = await POST({ method: "POST", url: "http://localhost:3000/api/tokens", headers: new Headers({ Host: "localhost:3000", ...headers }), json } as unknown as Request);
    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("allows local read and exact-origin validation", async () => {
    expect((await GET(new Request("http://localhost:3000/api/tokens?runId=test-run", { headers: { Host: "localhost:3000" } }))).status).toBe(200);
    const request = new Request("http://localhost:3000/api/tokens", { method: "POST", headers: { Host: "localhost:3000", Origin: "http://localhost:3000", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" }, body: "{}" });
    expect((await POST(request)).status).toBe(400);
  });
});
