import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyStructuredElementEdit: vi.fn(),
  elementHistoryState: vi.fn(async () => ({ canUndo: false, canRedo: false })),
  elementTree: vi.fn(async () => []),
  moveElementHistory: vi.fn(),
}));

vi.mock("../../../lib/elementEditor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/elementEditor")>();
  return {
    ...actual,
    applyStructuredElementEdit: mocks.applyStructuredElementEdit,
    elementHistoryState: mocks.elementHistoryState,
    elementTree: mocks.elementTree,
    moveElementHistory: mocks.moveElementHistory,
  };
});

import { GET, POST } from "./route";
import { ARTIFACTS, IntakeSchema } from "../../../lib/contracts";
import { createRun, saveArtifact, sitePaths } from "../../../lib/runstate";

const originalToken = process.env.ONE_BOX_API_TOKEN;
const runIds: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  if (originalToken === undefined) delete process.env.ONE_BOX_API_TOKEN;
  else process.env.ONE_BOX_API_TOKEN = originalToken;
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true })
    )
  );
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
    expect(mocks.elementTree).not.toHaveBeenCalled();
  });

  it("allows method-aware no-Origin GET and configured bearer POST, merging history and the layers tree", async () => {
    const getResponse = await GET(
      new Request("http://localhost:3000/api/elements?runId=test-run", {
        headers: { Host: "localhost:3000" },
      }),
    );
    expect(getResponse.status).toBe(200);
    expect(mocks.elementHistoryState).toHaveBeenCalledWith("test-run");
    expect(mocks.elementTree).toHaveBeenCalledWith("test-run");
    expect(await getResponse.json()).toEqual({
      canUndo: false,
      canRedo: false,
      tree: [],
    });

    process.env.ONE_BOX_API_TOKEN = "route-test-token";
    const bearer = postRequest({ Authorization: "Bearer route-test-token" });
    expect((await POST(bearer.request)).status).toBe(400);
    expect(bearer.json).toHaveBeenCalledOnce();
    expect(mocks.applyStructuredElementEdit).not.toHaveBeenCalled();
  });

  it("rejects non-Website undo before element history mutation", async () => {
    const runId = await createRun();
    runIds.push(runId);
    await saveArtifact(runId, ARTIFACTS.intake, IntakeSchema.parse({
      businessName: "Legacy App",
      category: "service",
      location: "Austin, TX",
      services: ["Help"],
      primaryAction: "quote",
      projectTarget: "ios-app",
    }));

    const response = await POST(new Request("http://localhost:3000/api/elements", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "undo", runId }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "unsupported-project-target",
      projectTarget: "ios-app",
    });
    expect(mocks.moveElementHistory).not.toHaveBeenCalled();
  });
});
