import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyElementHtmlEdit: vi.fn(),
  generateJson: vi.fn(),
  estimateImageCredits: vi.fn(),
  generateImage: vi.fn(),
  reserveImageGeneration: vi.fn(),
  finishImageGeneration: vi.fn(),
  readImageGenerationLedger: vi.fn(),
  loadArtifact: vi.fn(),
  loadRun: vi.fn(),
  listProjectImages: vi.fn(),
  readValidatedGeneratedImageStaging: vi.fn(),
  atomicWriteGeneratedSiteFile: vi.fn(),
  withSiteAuthorityLock: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: mocks.readFile,
  unlink: mocks.unlink,
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
  readImageGenerationLedger: mocks.readImageGenerationLedger,
}));
vi.mock("../../../lib/runstate", () => ({
  sitePaths: () => ({ root: "/unused", site: "/unused/site" }),
  loadArtifact: mocks.loadArtifact,
  loadRun: mocks.loadRun,
  RunNotFoundError: class RunNotFoundError extends Error {
    readonly runId: string;

    constructor(runId: string) {
      super(`run not found: ${runId}`);
      this.name = "RunNotFoundError";
      this.runId = runId;
    }
  },
}));
vi.mock("../../../lib/imageLibrary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/imageLibrary")>()),
  listProjectImages: mocks.listProjectImages,
  readValidatedGeneratedImageStaging:
    mocks.readValidatedGeneratedImageStaging,
}));
vi.mock("../../../lib/siteMutation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/siteMutation")>()),
  atomicWriteGeneratedSiteFile: mocks.atomicWriteGeneratedSiteFile,
  withSiteAuthorityLock: mocks.withSiteAuthorityLock,
}));

import { POST } from "./route";
import { ImageGenerationBudgetError } from "../../../lib/imageGenerationBudget";
import { RunNotFoundError } from "../../../lib/runstate";
import {
  knownMutationGateRequest,
  unknownMutationGateRequest,
} from "../../../lib/mutationGateMatrix";

const originalToken = process.env.ONE_BOX_API_TOKEN;

beforeEach(() => {
  mocks.loadArtifact.mockResolvedValue({
    projectTarget: "website",
    colors: [],
    fonts: [],
  });
  mocks.loadRun.mockResolvedValue({
    layoutAuthority: "template-v1",
    costUsd: 0,
  });
  mocks.readFile.mockResolvedValue(
    '<div data-edit-id="hero.image" data-aspect="16:9"><img src="old.jpg" alt="Old"></div>',
  );
  mocks.unlink.mockResolvedValue(undefined);
  mocks.readImageGenerationLedger.mockResolvedValue({
    version: 1,
    capCredits: 14,
    entries: [],
  });
  mocks.withSiteAuthorityLock.mockImplementation(
    async (_runId, operation: () => Promise<unknown>) => operation(),
  );
  mocks.readValidatedGeneratedImageStaging.mockImplementation(
    async (_runId, requestId: string) => ({
      buffer: Buffer.from([137, 80, 78, 71]),
      metadata: {
        mimeType: "image/png",
        extension: "png",
        dimensions: { width: 1, height: 1 },
      },
      stagingPath: `/unused/image-staging/${requestId}.download`,
      relativePath: `assets/generated/${requestId}.png`,
      finalPath: `/unused/site/assets/generated/${requestId}.png`,
    }),
  );
});

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

  it("rejects a non-Website edit before model, provider, or mutation work", async () => {
    mocks.loadArtifact.mockResolvedValue({ projectTarget: "web-app" });
    mocks.applyElementHtmlEdit.mockResolvedValue({ gates: [] });
    mocks.loadRun.mockResolvedValue({ costUsd: 0 });

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
        editId: "hero.title",
        instruction: "Change the heading",
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "unsupported-project-target",
      projectTarget: "web-app",
    });
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.applyElementHtmlEdit).not.toHaveBeenCalled();
  });

  it("rejects Page IR arbitrary/image edits before model, provider, or mutation work", async () => {
    mocks.loadArtifact.mockResolvedValue({ projectTarget: "website" });
    mocks.loadRun.mockResolvedValue({
      layoutAuthority: "page-ir-v1",
      costUsd: 0,
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
        instruction: "Generate a replacement image",
        imageIntent: true,
        requestId: "00000000-0000-4000-8000-000000000009",
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "unsupported-page-ir-capability",
    });
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(mocks.estimateImageCredits).not.toHaveBeenCalled();
    expect(mocks.reserveImageGeneration).not.toHaveBeenCalled();
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.applyElementHtmlEdit).not.toHaveBeenCalled();
  });

  it("returns a structured 404 when the requested run is missing", async () => {
    mocks.loadArtifact.mockResolvedValue(undefined);
    mocks.loadRun.mockRejectedValue(new RunNotFoundError("missing-run"));

    const response = await POST(new Request("http://localhost:3000/api/edit", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runId: "missing-run",
        editId: "hero.title",
        instruction: "Change the heading",
      }),
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "run not found" });
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(mocks.generateImage).not.toHaveBeenCalled();
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
    expect(mocks.applyElementHtmlEdit.mock.calls[0]?.[3]).toMatchObject({
      gateRequest: knownMutationGateRequest("asset"),
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

  it("rejects a missing image target before estimate, reservation, or provider work", async () => {
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
    mocks.readFile.mockResolvedValue(
      '<div data-edit-id="other.image"><img src="old.jpg" alt="Old"></div>',
    );

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
        requestId: "00000000-0000-4000-8000-000000000146",
      }),
    }));

    expect(response.status).toBe(404);
    expect(mocks.estimateImageCredits).not.toHaveBeenCalled();
    expect(mocks.reserveImageGeneration).not.toHaveBeenCalled();
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.applyElementHtmlEdit).not.toHaveBeenCalled();
  });

  it("revalidates the image target after paid provider work before publishing live bytes", async () => {
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
    mocks.estimateImageCredits.mockResolvedValue(2);
    mocks.reserveImageGeneration.mockResolvedValue({
      usedCredits: 2,
      capCredits: 14,
    });
    mocks.generateImage.mockResolvedValue({
      path: "/unused/image-staging/request.download",
      url: "https://image.example/result.png",
    });
    mocks.applyElementHtmlEdit.mockImplementation(
      async (_runId, _editId, transform) => {
        await transform(
          '<div data-edit-id="hero.image"><p>The image was removed concurrently</p></div>',
        );
        return { gates: [] };
      },
    );

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
        requestId: "00000000-0000-4000-8000-000000000147",
      }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.generateImage).toHaveBeenCalledOnce();
    expect(mocks.finishImageGeneration).toHaveBeenCalledWith(
      "/unused/image-generation-ledger.json",
      "00000000-0000-4000-8000-000000000147",
      "completed",
    );
    expect(mocks.atomicWriteGeneratedSiteFile).not.toHaveBeenCalled();
  });

  // Proves the container-edit descendant-preservation contract named in
  // docs/specs/2026-08-16-canvas-upgrade.md: an instruction that targets a
  // CONTAINER editId (not a leaf) must not be able to silently orphan one of
  // its editable children. The rewrite model is untrusted output here, so
  // this drives the real idsBefore/idsAfter comparison in route.ts's own
  // transform (elementEditor.applyElementHtmlEdit itself stays mocked, same
  // as the tests above — only the transform closure it's handed is real).
  it("rejects a container edit that would drop a descendant's edit id", async () => {
    mocks.loadArtifact.mockResolvedValue({ colors: [], fonts: [] });
    mocks.generateJson.mockResolvedValue({
      innerHtml: '<h2 data-edit-id="why-us.intro">New heading</h2>',
    });
    mocks.applyElementHtmlEdit.mockImplementation(async (_runId, _editId, transform) => {
      await transform(
        '<div data-edit-id="why-us"><h2 data-edit-id="why-us.intro">Old heading</h2><p data-edit-id="why-us.point-1-title">Point</p></div>',
      );
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
        editId: "why-us",
        instruction: "Trim this section down to one point",
      }),
    }));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/would remove editable elements/);
    expect(body.error).toMatch(/why-us\.point-1-title/);
  });

  // B2: the sibling test above proves the rejection path; this proves the
  // path a legitimate section-scoped instruction actually takes. A
  // container-targeted instruction that preserves every descendant edit id
  // must SUCCEED, not be caught by the same guard that protects against
  // dropped ids — confirmed live against a real generated site in this wave
  // (why-us section, reworded intro, gates clean) before this test was
  // written.
  it("accepts a section-scoped instruction that preserves every descendant edit id", async () => {
    mocks.loadArtifact.mockResolvedValue({ colors: [], fonts: [] });
    mocks.loadRun.mockResolvedValue({ costUsd: 0.02 });
    mocks.generateJson.mockResolvedValue({
      innerHtml:
        '<h2 data-edit-id="why-us.intro">Why Central Texas calls our BICSI certified team first</h2><p data-edit-id="why-us.point-1-title">Point</p>',
    });
    mocks.applyElementHtmlEdit.mockImplementation(async (_runId, _editId, transform) => {
      await transform(
        '<div data-edit-id="why-us"><h2 data-edit-id="why-us.intro">Old heading</h2><p data-edit-id="why-us.point-1-title">Point</p></div>',
      );
      return { gates: [{ gate: "token-drift", pass: true, blocking: true }] };
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
        editId: "why-us",
        instruction: "Reword the intro sentence to mention we are BICSI certified.",
      }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, editId: "why-us", gatesClean: true });
    expect(mocks.applyElementHtmlEdit.mock.calls[0]?.[3]).toMatchObject({
      gateRequest: unknownMutationGateRequest(),
    });
  });

  // B3: a referenceAssetId must actually reach generation and influence its
  // prompt, and it must be validated against the run's OWN image library
  // (imageLibrary.ts's listProjectImages), never trusted on its own.
  describe("chat reference attachment (referenceAssetId)", () => {
    function imageEditRequest(body: Record<string, unknown>) {
      return new Request("http://localhost:3000/api/edit", {
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
          instruction: "Swap in a rustic entrance",
          imageIntent: true,
          ...body,
        }),
      });
    }

    it("validates a referenceAssetId against the run's own image library and splices its prompt into generation", async () => {
      mocks.loadArtifact.mockResolvedValue({
        imageryBrief: { subject: "s", lighting: "l", grade: "g", framing: "f", avoid: [] },
        colors: [],
      });
      mocks.loadRun.mockResolvedValue({ costUsd: 0.1 });
      mocks.listProjectImages.mockResolvedValue({
        version: 1,
        items: [{ id: "ref-asset-aaaaaaaa", status: "completed", prompt: "a rustic barn door" }],
      });
      mocks.estimateImageCredits.mockResolvedValue(5);
      mocks.reserveImageGeneration.mockResolvedValue({ usedCredits: 5, capCredits: 20 });
      mocks.generateImage.mockResolvedValue({ path: "/unused", url: "https://image.example/out.jpg" });
      mocks.applyElementHtmlEdit.mockImplementation(async (_runId, _editId, transform) => {
        await transform('<div data-edit-id="hero.image"><img src="old.jpg" alt="Old"></div>');
        return { gates: [] };
      });

      const response = await POST(imageEditRequest({
        requestId: "00000000-0000-4000-8000-000000000003",
        referenceAssetId: "ref-asset-aaaaaaaa",
      }));

      expect(response.status).toBe(200);
      expect(mocks.listProjectImages).toHaveBeenCalledWith("run1");
      expect(mocks.generateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("a rustic barn door"),
        }),
      );
    });

    it("rejects a referenceAssetId that is not in this run's own image library", async () => {
      mocks.loadArtifact.mockResolvedValue({
        imageryBrief: { subject: "s", lighting: "l", grade: "g", framing: "f", avoid: [] },
        colors: [],
      });
      mocks.listProjectImages.mockResolvedValue({ version: 1, items: [] });

      const response = await POST(imageEditRequest({
        requestId: "00000000-0000-4000-8000-000000000004",
        referenceAssetId: "not-this-runs-asset",
      }));

      expect(response.status).toBe(404);
      expect(mocks.applyElementHtmlEdit).not.toHaveBeenCalled();
      expect(mocks.estimateImageCredits).not.toHaveBeenCalled();
      expect(mocks.generateImage).not.toHaveBeenCalled();
    });

    it("rejects a malformed referenceAssetId at the request-contract boundary, before any site work", async () => {
      const response = await POST(imageEditRequest({
        requestId: "00000000-0000-4000-8000-000000000005",
        referenceAssetId: "short",
      }));

      expect(response.status).toBe(400);
      expect(mocks.loadArtifact).not.toHaveBeenCalled();
      expect(mocks.listProjectImages).not.toHaveBeenCalled();
      expect(mocks.applyElementHtmlEdit).not.toHaveBeenCalled();
    });
  });
});
