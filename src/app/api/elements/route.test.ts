import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyPageIrEditTransaction: vi.fn(async () => ({
    pageIrSha256: "a".repeat(64),
    revision: 2,
    reports: [],
    canUndo: true,
    canRedo: false,
  })),
  movePageIrEditHistory: vi.fn(async () => ({
    pageIrSha256: "b".repeat(64),
    revision: 3,
    reports: [],
    canUndo: false,
    canRedo: true,
  })),
  applyStructuredElementEdit: vi.fn(),
  elementHistoryState: vi.fn(async () => ({ canUndo: false, canRedo: false })),
  elementTree: vi.fn(async () => []),
  moveElementHistory: vi.fn(),
}));

vi.mock("../../../lib/pageIrMutation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/pageIrMutation")>();
  return {
    ...actual,
    applyPageIrEditTransaction: mocks.applyPageIrEditTransaction,
    movePageIrEditHistory: mocks.movePageIrEditHistory,
  };
});

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

async function regularFileTree(root: string, relative = ""): Promise<Record<string, Buffer>> {
  const current = path.join(root, relative);
  const entries = await fs.readdir(current, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const files: Record<string, Buffer> = {};
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === ".site-authority-lock" || entry.name === ".run-state-lock") continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) Object.assign(files, await regularFileTree(root, child));
    else if (entry.isFile()) files[child] = await fs.readFile(path.join(root, child));
  }
  return files;
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
    const runId = await createRun();
    runIds.push(runId);
    const getResponse = await GET(
      new Request(`http://localhost:3000/api/elements?runId=${runId}`, {
        headers: { Host: "localhost:3000" },
      }),
    );
    expect(getResponse.status).toBe(200);
    expect(mocks.elementHistoryState).toHaveBeenCalledWith(runId);
    expect(mocks.elementTree).toHaveBeenCalledWith(runId);
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

  it("routes Page IR apply and undo through typed IR transactions, never compiled HTML history", async () => {
    const runId = await createRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    runIds.push(runId);

    const applyResponse = await POST(new Request("http://localhost:3000/api/elements", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "apply",
        runId,
        editId: "intro-text",
        patch: { text: "Typed Page IR copy" },
      }),
    }));
    expect(applyResponse.status).toBe(200);
    expect(mocks.applyPageIrEditTransaction).toHaveBeenCalledWith({
      schemaVersion: 1,
      runId,
      mutations: [
        { kind: "replace-text", editId: "intro-text", text: "Typed Page IR copy" },
      ],
    });
    expect(mocks.applyStructuredElementEdit).not.toHaveBeenCalled();

    const undoResponse = await POST(new Request("http://localhost:3000/api/elements", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "undo", runId }),
    }));
    expect(undoResponse.status).toBe(200);
    expect(mocks.movePageIrEditHistory).toHaveBeenCalledWith(runId, "undo");
    expect(mocks.moveElementHistory).not.toHaveBeenCalled();
  });

  it("rejects an unsupported Page IR capability without changing any durable authority bytes", async () => {
    const runId = await createRun({
      layoutAuthority: "page-ir-v1",
      pageIrRolloutPermitted: true,
    });
    runIds.push(runId);
    const runRoot = sitePaths(runId).root;
    const durableFiles = {
      "page-ir.json": "persisted-page-ir-before\n",
      "page-ir-edit-history.json": "edit-history-before\n",
      "candidate/manifest.json": "candidate-manifest-before\n",
      "candidate/provenance.json": "candidate-provenance-before\n",
      "candidate/gates.json": "candidate-gates-before\n",
      "candidate/site/index.html": "candidate-site-before\n",
      "site/manifest.json": "live-manifest-before\n",
      "site/index.html": "live-site-before\n",
      "gates.json": "live-gates-before\n",
      "evidence/visual-qa.json": "approval-state-before\n",
    } as const;
    await Promise.all(
      Object.entries(durableFiles).map(async ([relativePath, contents]) => {
        const absolutePath = path.join(runRoot, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, contents);
      }),
    );
    const before = await regularFileTree(runRoot);

    const response = await POST(new Request("http://localhost:3000/api/elements", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "apply",
        runId,
        editId: "intro-text",
        patch: { typography: { weight: "700" } },
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/typography.*not represented/i),
    });
    expect(mocks.applyPageIrEditTransaction).not.toHaveBeenCalled();
    expect(mocks.applyStructuredElementEdit).not.toHaveBeenCalled();
    expect(mocks.movePageIrEditHistory).not.toHaveBeenCalled();
    expect(mocks.moveElementHistory).not.toHaveBeenCalled();
    expect(await regularFileTree(runRoot)).toEqual(before);
  });
});
