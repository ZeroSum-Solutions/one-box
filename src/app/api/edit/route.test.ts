import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyElementHtmlEdit: vi.fn(),
  generateJson: vi.fn(),
  estimateImageCredits: vi.fn(),
  generateImage: vi.fn(),
  reserveImageGeneration: vi.fn(),
  finishImageGeneration: vi.fn(),
  loadArtifact: vi.fn(),
  loadRun: vi.fn(),
}));

vi.mock("../../../lib/elementEditor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/elementEditor")>();
  return { ...actual, applyElementHtmlEdit: mocks.applyElementHtmlEdit };
});
vi.mock("../../../lib/openrouter", () => ({ generateJson: mocks.generateJson }));
vi.mock("../../../lib/tools/higgsfield", () => ({
  estimateImageCredits: mocks.estimateImageCredits,
  generateImage: mocks.generateImage,
}));
vi.mock("../../../lib/imageGenerationBudget", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/imageGenerationBudget")>()),
  reserveImageGeneration: mocks.reserveImageGeneration,
  finishImageGeneration: mocks.finishImageGeneration,
}));
vi.mock("../../../lib/runstate", () => ({
  sitePaths: () => ({ root: "/unused", site: "/unused/site" }),
  loadArtifact: mocks.loadArtifact,
  loadRun: mocks.loadRun,
}));

import { POST } from "./route";
import { ImageGenerationBudgetError } from "../../../lib/imageGenerationBudget";

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
      headers: new Headers({ Host: "localhost:3000", ...headers }),
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
      "Sec-Fetch-Site": "same-origin",
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

  it("reserves provider credits before image generation and records completion", async () => {
    mocks.loadArtifact.mockResolvedValue({
      imageryBrief: {
        subject: "field technician",
        lighting: "natural",
        grade: "neutral",
        framing: "wide",
        avoid: [],
      },
      colors: [],
    });
    mocks.loadRun.mockResolvedValue({ costUsd: 0.2 });
    mocks.estimateImageCredits.mockResolvedValue(7);
    mocks.reserveImageGeneration.mockResolvedValue({
      usedCredits: 7,
      capCredits: 14,
    });
    mocks.generateImage.mockResolvedValue({ path: "/unused", url: "https://image.example/result.jpg" });
    mocks.applyElementHtmlEdit.mockImplementation(async (_runId, _editId, transform) => {
      await transform('<div data-edit-id="hero.image"><img src="old.jpg" alt="Old"></div>');
      return { gates: [] };
    });

    const response = await POST(new Request("http://localhost:3000/api/edit", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runId: "run1",
        editId: "hero.image",
        instruction: "Field work",
        imageIntent: true,
        requestId: "00000000-0000-4000-8000-000000000001",
      }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.reserveImageGeneration).toHaveBeenCalledBefore(mocks.generateImage);
    expect(mocks.finishImageGeneration).toHaveBeenCalledWith(
      "/unused/image-generation-ledger.json",
      "00000000-0000-4000-8000-000000000001",
      "completed",
    );
    expect(await response.json()).toMatchObject({
      ok: true,
      imageCredits: { used: 7, cap: 14 },
    });
  });

  it("rejects a capped image request before provider generation", async () => {
    mocks.loadArtifact.mockResolvedValue({
      imageryBrief: {
        subject: "field technician",
        lighting: "natural",
        grade: "neutral",
        framing: "wide",
        avoid: [],
      },
      colors: [],
    });
    mocks.estimateImageCredits.mockResolvedValue(7);
    mocks.reserveImageGeneration.mockRejectedValue(
      new ImageGenerationBudgetError("image-generation credit cap reached", 429),
    );
    mocks.applyElementHtmlEdit.mockImplementation(async (_runId, _editId, transform) => {
      await transform('<div data-edit-id="hero.image"><img src="old.jpg" alt="Old"></div>');
      return { gates: [] };
    });
    const response = await POST(new Request("http://localhost:3000/api/edit", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runId: "run1",
        editId: "hero.image",
        instruction: "Field work",
        imageIntent: true,
        requestId: "00000000-0000-4000-8000-000000000002",
      }),
    }));
    expect(response.status).toBe(429);
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });
});
