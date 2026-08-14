import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyStructuredElementEdit: vi.fn(),
  elementHistoryState: vi.fn(async () => ({ canUndo: false, canRedo: false })),
  moveElementHistory: vi.fn(),
}));

vi.mock("../../../lib/elementEditor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/elementEditor")>();
  return {
    ...actual,
    applyStructuredElementEdit: mocks.applyStructuredElementEdit,
    elementHistoryState: mocks.elementHistoryState,
    moveElementHistory: mocks.moveElementHistory,
  };
});

import { GET, POST } from "./route";

const originalToken = process.env.ONE_BOX_API_TOKEN;

afterEach(() => {
  vi.clearAllMocks();
  if (originalToken === undefined) delete process.env.ONE_BOX_API_TOKEN;
  else process.env.ONE_BOX_API_TOKEN = originalToken;
});

function postRequest(headers: Record<string, string>) {
  const json = vi.fn(async () => null);
  return {
    request: {
      method: "POST",
      url: "http://localhost:3000/api/elements",
      headers: new Headers({ Host: "localhost:3000", ...headers }),
      json,
    } as unknown as Request,
    json,
  };
}

describe("element route authorization", () => {
  it.each([
    ["cross-origin", { Origin: "https://evil.example", "Content-Type": "application/json" }],
    ["missing Origin", { "Content-Type": "application/json" }],
  ])("rejects %s POST before body or mutation work", async (_label, headers) => {
    const hostile = postRequest(headers);
    const response = await POST(hostile.request);
    expect(response.status).toBe(403);
    expect(hostile.json).not.toHaveBeenCalled();
    expect(mocks.applyStructuredElementEdit).not.toHaveBeenCalled();
    expect(mocks.moveElementHistory).not.toHaveBeenCalled();
  });

  it("rejects cross-origin GET before reading history", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/elements?runId=test-run", {
        headers: { Host: "localhost:3000", Origin: "https://evil.example" },
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.elementHistoryState).not.toHaveBeenCalled();
  });

  it("allows method-aware no-Origin GET and configured bearer POST", async () => {
    const getResponse = await GET(
      new Request("http://localhost:3000/api/elements?runId=test-run", {
        headers: { Host: "localhost:3000" },
      }),
    );
    expect(getResponse.status).toBe(200);
    expect(mocks.elementHistoryState).toHaveBeenCalledWith("test-run");

    process.env.ONE_BOX_API_TOKEN = "route-test-token";
    const bearer = postRequest({ Authorization: "Bearer route-test-token" });
    expect((await POST(bearer.request)).status).toBe(400);
    expect(bearer.json).toHaveBeenCalledOnce();
    expect(mocks.applyStructuredElementEdit).not.toHaveBeenCalled();
  });
});
