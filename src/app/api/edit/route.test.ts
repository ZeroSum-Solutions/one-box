import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyElementHtmlEdit: vi.fn(),
  generateJson: vi.fn(),
  generateImage: vi.fn(),
  loadArtifact: vi.fn(),
  loadRun: vi.fn(),
}));

vi.mock("../../../lib/elementEditor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/elementEditor")>();
  return { ...actual, applyElementHtmlEdit: mocks.applyElementHtmlEdit };
});
vi.mock("../../../lib/openrouter", () => ({ generateJson: mocks.generateJson }));
vi.mock("../../../lib/tools/higgsfield", () => ({
  generateImage: mocks.generateImage,
}));
vi.mock("../../../lib/runstate", () => ({
  sitePaths: () => ({ site: "/unused" }),
  loadArtifact: mocks.loadArtifact,
  loadRun: mocks.loadRun,
}));

import { POST } from "./route";

const originalToken = process.env.ONE_BOX_API_TOKEN;

afterEach(() => {
  vi.clearAllMocks();
  if (originalToken === undefined) delete process.env.ONE_BOX_API_TOKEN;
  else process.env.ONE_BOX_API_TOKEN = originalToken;
});

function request(headers: Record<string, string>) {
  const json = vi.fn(async () => null);
  return {
    request: {
      method: "POST",
      url: "http://localhost:3000/api/edit",
      headers: new Headers(headers),
      json,
    } as unknown as Request,
    json,
  };
}

describe("edit route authorization", () => {
  it.each([
    ["cross-origin", { Origin: "https://evil.example", "Content-Type": "application/json" }],
    ["missing Origin", { "Content-Type": "application/json" }],
  ])("rejects %s before body, model, or mutation work", async (_label, headers) => {
    const hostile = request(headers);
    const response = await POST(hostile.request);
    expect(response.status).toBe(403);
    expect(hostile.json).not.toHaveBeenCalled();
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.applyElementHtmlEdit).not.toHaveBeenCalled();
    expect(mocks.loadArtifact).not.toHaveBeenCalled();
  });

  it("accepts exact same-origin and configured bearer requests before validation", async () => {
    const sameOrigin = request({
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
    });
    expect((await POST(sameOrigin.request)).status).toBe(400);
    expect(sameOrigin.json).toHaveBeenCalledOnce();

    process.env.ONE_BOX_API_TOKEN = "route-test-token";
    const bearer = request({ Authorization: "Bearer route-test-token" });
    expect((await POST(bearer.request)).status).toBe(400);
    expect(bearer.json).toHaveBeenCalledOnce();
    expect(mocks.applyElementHtmlEdit).not.toHaveBeenCalled();
  });
});
