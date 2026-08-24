import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rejectImage: true,
  estimateCalls: 0,
  providerCalls: 0,
  providerHeldSiteAuthority: false,
  approvalInvalidations: 0,
  estimateGate: null as Promise<void> | null,
  estimateObserved: null as ((callCount: number) => void) | null,
  publicationGate: null as Promise<void> | null,
  publicationObserved: null as (() => void) | null,
}));

const passReport = {
  gate: "inline-image-fixture",
  pass: true,
  blocking: true,
  details: [],
  ranAt: "2026-08-23T12:00:00.000Z",
};

vi.mock("../../../lib/gates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/gates")>();
  return {
    ...actual,
    runGates: async (runId: string) => {
      const root = path.join(process.cwd(), "sites", runId);
      const html = await fs.readFile(path.join(root, "site", "index.html"), "utf8");
      const rejected = state.rejectImage && html.includes("assets/generated/");
      const reports = [
        rejected
          ? { ...passReport, pass: false, details: ["reject inline image"] }
          : passReport,
      ];
      await fs.writeFile(
        path.join(root, "gates.json"),
        `${JSON.stringify(reports, null, 2)}\n`,
      );
      return reports;
    },
  };
});

vi.mock("../../../lib/tools/higgsfield", () => ({
  estimateImageCredits: vi.fn(async () => {
    state.estimateCalls += 1;
    state.estimateObserved?.(state.estimateCalls);
    await state.estimateGate;
    return 2;
  }),
  generateImage: vi.fn(async (options: { outPath: string }) => {
    state.providerCalls += 1;
    const { assertSiteAuthorityHeld } = await import("../../../lib/siteAuthority");
    try {
      assertSiteAuthorityHeld("inline-image-route-test");
      state.providerHeldSiteAuthority = true;
    } catch {
      state.providerHeldSiteAuthority = false;
    }
    await fs.mkdir(path.dirname(options.outPath), { recursive: true });
    await fs.writeFile(
      options.outPath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    return { path: options.outPath, url: "https://provider.example/result.png" };
  }),
}));

vi.mock("../../../lib/elementEditor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/elementEditor")>();
  return {
    ...actual,
    applyElementHtmlEdit: async (
      ...args: Parameters<typeof actual.applyElementHtmlEdit>
    ) => {
      const gate = state.publicationGate;
      if (gate) {
        state.publicationGate = null;
        state.publicationObserved?.();
        await gate;
      }
      return actual.applyElementHtmlEdit(...args);
    },
  };
});

vi.mock("../../../lib/runstate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/runstate")>();
  return {
    ...actual,
    loadArtifact: vi.fn(async () => ({
      imageryBrief: {
        subject: "field technician",
        lighting: "natural",
        grade: "neutral",
        framing: "wide",
        avoid: [],
      },
      colors: [],
    })),
    loadRun: vi.fn(async () => ({ costUsd: 0.2 })),
    invalidateApprovedVisualQaUnderSiteAuthority: vi.fn(async () => {
      state.approvalInvalidations += 1;
      return true;
    }),
  };
});

vi.mock("../../../lib/productionTarget", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/productionTarget")>()),
  assertWebsiteProductionRun: vi.fn(async () => undefined),
}));

vi.mock("../../../lib/openrouter", () => ({
  generateJson: vi.fn(async () => {
    throw new Error("text model should not run for an image edit");
  }),
}));

import { POST } from "./route";
import { readImageGenerationLedger } from "../../../lib/imageGenerationBudget";

const runId = "inline-image-route-test";
const requestId = "00000000-0000-4000-8000-000000000142";
const root = path.join(process.cwd(), "sites", runId);
const site = path.join(root, "site");
const indexPath = path.join(site, "index.html");
const historyPath = path.join(root, "element-history.json");
const gatesPath = path.join(root, "gates.json");
const ledgerPath = path.join(root, "image-generation-ledger.json");
const stagingPath = path.join(root, "image-staging", `${requestId}.download`);
const finalPath = path.join(site, "assets", "generated", `${requestId}.png`);
const originalHtml =
  '<!doctype html><main><div data-edit-id="hero.image" data-aspect="16:9"><img src="assets/old.jpg" alt="Old"></div></main>';
const originalHistory = `${JSON.stringify(
  { version: 1, entries: [], cursor: 0 },
  null,
  2,
)}\n`;
const originalGates = `${JSON.stringify([passReport], null, 2)}\n`;
const externalRoots: string[] = [];

function imageRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost:3000/api/edit", {
    method: "POST",
    headers: {
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      runId,
      editId: "hero.image",
      instruction: "Replace the hero with field work",
      imageIntent: true,
      requestId,
      ...overrides,
    }),
  });
}

beforeEach(async () => {
  state.rejectImage = true;
  state.estimateCalls = 0;
  state.providerCalls = 0;
  state.providerHeldSiteAuthority = false;
  state.approvalInvalidations = 0;
  state.estimateGate = null;
  state.estimateObserved = null;
  state.publicationGate = null;
  state.publicationObserved = null;
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(path.join(site, "assets"), { recursive: true });
  await Promise.all([
    fs.writeFile(indexPath, originalHtml),
    fs.writeFile(historyPath, originalHistory),
    fs.writeFile(gatesPath, originalGates),
    fs.writeFile(path.join(site, "assets", "old.jpg"), Buffer.from([255, 216, 255, 217])),
  ]);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await Promise.all(
    externalRoots.splice(0).map((externalRoot) =>
      fs.rm(externalRoot, { recursive: true, force: true }),
    ),
  );
});

describe("inline image edit transaction", () => {
  it("rolls back a rejected image and reuses paid staging on the same-request retry", async () => {
    const rejected = await POST(imageRequest());

    expect(rejected.status).toBe(409);
    expect(state.providerHeldSiteAuthority).toBe(false);
    expect(await fs.readFile(indexPath, "utf8")).toBe(originalHtml);
    expect(await fs.readFile(historyPath, "utf8")).toBe(originalHistory);
    expect(await fs.readFile(gatesPath, "utf8")).toBe(originalGates);
    await expect(fs.readFile(finalPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(stagingPath)).toHaveLength(68);
    expect((await readImageGenerationLedger(ledgerPath)).entries[0]).toMatchObject({
      requestId,
      editId: "hero.image",
      instructionSha256: createHash("sha256")
        .update("Replace the hero with field work")
        .digest("hex"),
      status: "completed",
      credits: 2,
    });
    expect(state.approvalInvalidations).toBe(0);

    state.rejectImage = false;
    const retried = await POST(imageRequest());

    expect(retried.status).toBe(200);
    expect(state.estimateCalls).toBe(1);
    expect(state.providerCalls).toBe(1);
    expect(await fs.readFile(finalPath)).toHaveLength(68);
    await expect(fs.readFile(stagingPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(indexPath, "utf8")).toContain(
      `src="assets/generated/${requestId}.png"`,
    );
    expect(JSON.parse(await fs.readFile(historyPath, "utf8"))).toMatchObject({
      cursor: 1,
      entries: [{ editId: "hero.image", previousHtml: originalHtml }],
    });

    const replayed = await POST(imageRequest());
    expect(replayed.status).toBe(200);
    expect(state.estimateCalls).toBe(1);
    expect(state.providerCalls).toBe(1);
    expect(JSON.parse(await fs.readFile(historyPath, "utf8"))).toMatchObject({
      cursor: 1,
      entries: [{ editId: "hero.image", previousHtml: originalHtml }],
    });
  });

  it("rejects request ids outside the generation allowlist before provider work", async () => {
    const invalidRequestId = "00000000-0000-0000-0000-000000000000";
    const response = await POST(imageRequest({ requestId: invalidRequestId }));

    expect(response.status).toBe(400);
    expect(state.estimateCalls).toBe(0);
    expect(state.providerCalls).toBe(0);
    await expect(
      fs.readFile(
        path.join(root, "image-staging", `${invalidRequestId}.download`),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.readFile(ledgerPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("lets only the first concurrent caller reach paid-provider preflight", async () => {
    state.rejectImage = false;
    let releaseEstimate!: () => void;
    state.estimateGate = new Promise<void>((resolve) => {
      releaseEstimate = resolve;
    });
    let firstEstimateObserved!: () => void;
    const firstEstimate = new Promise<void>((resolve) => {
      firstEstimateObserved = resolve;
    });
    state.estimateObserved = (callCount) => {
      if (callCount === 1) firstEstimateObserved();
    };

    const first = POST(imageRequest());
    await firstEstimate;
    const second = POST(imageRequest());
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(state.estimateCalls).toBe(1);
    releaseEstimate();
    const responses = await Promise.all([first, second]);

    expect(state.estimateCalls).toBe(1);
    expect(state.providerCalls).toBe(1);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it("converges completed-before-publication callers without duplicate history", async () => {
    state.rejectImage = false;
    let releaseFirstPublication!: () => void;
    state.publicationGate = new Promise<void>((resolve) => {
      releaseFirstPublication = resolve;
    });
    let firstPublicationObserved!: () => void;
    const firstPublication = new Promise<void>((resolve) => {
      firstPublicationObserved = resolve;
    });
    state.publicationObserved = firstPublicationObserved;

    const first = POST(imageRequest());
    await firstPublication;
    const second = await POST(imageRequest());
    releaseFirstPublication();
    const firstResponse = await first;

    expect([firstResponse.status, second.status]).toEqual([200, 200]);
    expect(state.estimateCalls).toBe(1);
    expect(state.providerCalls).toBe(1);
    expect(JSON.parse(await fs.readFile(historyPath, "utf8"))).toMatchObject({
      cursor: 1,
      entries: [{ editId: "hero.image", previousHtml: originalHtml }],
    });
  });

  it("fails closed on partial and symlink staging without spending again", async () => {
    const instruction = "Replace the hero with field work";
    await fs.writeFile(
      ledgerPath,
      `${JSON.stringify(
        {
          version: 1,
          capCredits: 14,
          entries: [
            {
              requestId,
              editId: "hero.image",
              instructionSha256: createHash("sha256")
                .update(instruction)
                .digest("hex"),
              model: "gpt_image_2",
              credits: 2,
              status: "completed",
              reservedAt: "2026-08-23T12:00:00.000Z",
              finishedAt: "2026-08-23T12:01:00.000Z",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    await fs.mkdir(path.dirname(stagingPath), { recursive: true });
    await fs.writeFile(stagingPath, Buffer.from([137, 80, 78, 71]));

    const partial = await POST(imageRequest());
    expect(partial.status).toBe(502);
    await expect(partial.json()).resolves.toMatchObject({
      error: expect.stringMatching(/unsupported image format/i),
    });

    await fs.unlink(stagingPath);
    const symlinkTarget = path.join(root, "provider-output.png");
    await fs.writeFile(
      symlinkTarget,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    await fs.symlink(symlinkTarget, stagingPath);

    const symlink = await POST(imageRequest());
    expect(symlink.status).toBe(502);
    await expect(symlink.json()).resolves.toMatchObject({
      error: expect.stringMatching(/regular file/i),
    });
    expect(state.estimateCalls).toBe(0);
    expect(state.providerCalls).toBe(0);
    expect(state.approvalInvalidations).toBe(0);
    expect(await fs.readFile(indexPath, "utf8")).toBe(originalHtml);
    await expect(fs.readFile(finalPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a symlinked staging parent before provider work", async () => {
    state.rejectImage = false;
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onebox-inline-staging-parent-"),
    );
    externalRoots.push(externalRoot);
    await fs.symlink(externalRoot, path.dirname(stagingPath), "dir");

    const response = await POST(imageRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/symbolic link|outside.*run root/i),
    });
    expect(state.estimateCalls).toBe(0);
    expect(state.providerCalls).toBe(0);
    expect(await fs.readdir(externalRoot)).toEqual([]);
    expect(await fs.readFile(indexPath, "utf8")).toBe(originalHtml);
  });

  it("rejects live recovery through a symlinked generated-assets parent", async () => {
    const instruction = "Replace the hero with field work";
    await fs.writeFile(
      ledgerPath,
      `${JSON.stringify({
        version: 1,
        capCredits: 14,
        entries: [
          {
            requestId,
            editId: "hero.image",
            instructionSha256: createHash("sha256").update(instruction).digest("hex"),
            model: "gpt_image_2",
            credits: 2,
            status: "completed",
            reservedAt: "2026-08-23T12:00:00.000Z",
            finishedAt: "2026-08-23T12:01:00.000Z",
          },
        ],
      })}\n`,
    );
    await fs.writeFile(
      indexPath,
      originalHtml.replace(
        "assets/old.jpg",
        `assets/generated/${requestId}.png`,
      ),
    );
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onebox-inline-live-parent-"),
    );
    externalRoots.push(externalRoot);
    await fs.writeFile(
      path.join(externalRoot, `${requestId}.png`),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    await fs.symlink(
      externalRoot,
      path.join(site, "assets", "generated"),
      "dir",
    );

    const response = await POST(imageRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/symbolic link|outside.*run root/i),
    });
    expect(state.estimateCalls).toBe(0);
    expect(state.providerCalls).toBe(0);
    expect(await fs.readFile(historyPath, "utf8")).toBe(originalHistory);
  });

  it("recovers valid staging left by a stale reserved inline request", async () => {
    state.rejectImage = false;
    const instruction = "Replace the hero with field work";
    const old = new Date(Date.now() - 15 * 60 * 1_000 - 1_000);
    await fs.writeFile(
      ledgerPath,
      `${JSON.stringify({
        version: 1,
        capCredits: 14,
        entries: [
          {
            requestId,
            editId: "hero.image",
            instructionSha256: createHash("sha256").update(instruction).digest("hex"),
            model: "gpt_image_2",
            credits: 2,
            status: "reserved",
            reservedAt: old.toISOString(),
          },
        ],
      })}\n`,
    );
    await fs.mkdir(path.dirname(stagingPath), { recursive: true });
    await fs.writeFile(
      stagingPath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );

    const recovered = await POST(imageRequest());

    expect(recovered.status).toBe(200);
    expect(state.estimateCalls).toBe(0);
    expect(state.providerCalls).toBe(0);
    expect((await readImageGenerationLedger(ledgerPath)).entries[0]).toMatchObject({
      status: "completed",
      credits: 2,
    });
    expect(await fs.readFile(finalPath)).toHaveLength(68);
    await expect(fs.readFile(stagingPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("terminalizes a stale reservation when no paid output can be recovered", async () => {
    const instruction = "Replace the hero with field work";
    const old = new Date(Date.now() - 15 * 60 * 1_000 - 1_000);
    await fs.writeFile(
      ledgerPath,
      `${JSON.stringify({
        version: 1,
        capCredits: 14,
        entries: [
          {
            requestId,
            editId: "hero.image",
            instructionSha256: createHash("sha256").update(instruction).digest("hex"),
            model: "gpt_image_2",
            credits: 2,
            status: "reserved",
            reservedAt: old.toISOString(),
          },
        ],
      })}\n`,
    );
    const recovered = await POST(imageRequest());

    expect(recovered.status).toBe(502);
    expect(state.estimateCalls).toBe(0);
    expect(state.providerCalls).toBe(0);
    expect((await readImageGenerationLedger(ledgerPath)).entries).toHaveLength(1);
    expect((await readImageGenerationLedger(ledgerPath)).entries[0]).toMatchObject({
      status: "failed",
      credits: 2,
      error: expect.stringMatching(/interrupted/i),
    });
    await expect(fs.readFile(finalPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
