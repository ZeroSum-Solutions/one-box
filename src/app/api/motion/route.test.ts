import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(async () => ({ manifest: { version: 1, entries: [] }, entries: [], availableEditIds: [], canRevert: false })),
  preview: vi.fn(),
  mutate: vi.fn(),
  revert: vi.fn(),
}));
vi.mock("../../../lib/siteMotion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/siteMotion")>()),
  inspectSiteMotion: mocks.inspect,
  previewMotionEdit: mocks.preview,
  mutateSiteMotion: mocks.mutate,
  revertSiteMotion: mocks.revert,
}));

import { GET, POST } from "./route";

describe("motion route authorization", () => {
  const hostileHeaders: Record<string, string>[] = [{}, { Origin: "https://evil.example", "Content-Type": "application/json" }];
  it.each(hostileHeaders)("rejects hostile mutation before body or disk", async (headers) => {
    const json = vi.fn(async () => null);
    const response = await POST({ method: "POST", url: "http://localhost:3000/api/motion", headers: new Headers({ Host: "localhost:3000", ...headers }), json } as unknown as Request);
    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("allows local read and rejects unknown request fields", async () => {
    expect((await GET(new Request("http://localhost:3000/api/motion?runId=test-run", { headers: { Host: "localhost:3000" } }))).status).toBe(200);
    const request = new Request("http://localhost:3000/api/motion", { method: "POST", headers: { Host: "localhost:3000", Origin: "http://localhost:3000", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" }, body: JSON.stringify({ action: "revert", runId: "test-run", javascript: "alert(1)" }) });
    expect((await POST(request)).status).toBe(400);
    expect(mocks.revert).not.toHaveBeenCalled();
  });
});
