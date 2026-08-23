import fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";
import { ARTIFACTS, IntakeSchema } from "../../../../lib/contracts";
import { createRun, saveArtifact, sitePaths } from "../../../../lib/runstate";

const context = { params: Promise.resolve({ id: "asset-test" }) };
const runIds: string[] = [];

afterEach(async () => {
  await Promise.all(
    runIds.splice(0).map((runId) =>
      fs.rm(sitePaths(runId).root, { recursive: true, force: true })
    )
  );
});

function request(body: unknown, authorized = true) {
  return new Request("http://localhost:3000/api/assets/asset-test", {
    method: "POST",
    headers: authorized
      ? {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        }
      : { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("project assets API", () => {
  it("keeps image generation local-only", async () => {
    const response = await POST(
      request(
        {
          action: "generate",
          requestId: "00000000-0000-4000-8000-000000000200",
          prompt: "A clear product photograph",
          model: "higgsfield:gpt_image_2",
          aspectRatio: "1:1",
          quality: "high",
          meteredConsent: true,
        },
        false,
      ),
      context,
    );
    expect(response.status).toBe(403);
  });

  it("rejects paid generation unless consent is explicitly true", async () => {
    const response = await POST(
      request({
        action: "generate",
        requestId: "00000000-0000-4000-8000-000000000201",
        prompt: "A clear product photograph",
        model: "higgsfield:gpt_image_2",
        aspectRatio: "1:1",
        quality: "high",
        meteredConsent: false,
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });

  it("does not accept invented provider controls or unsupported models", async () => {
    const response = await POST(
      request({
        action: "generate",
        requestId: "00000000-0000-4000-8000-000000000202",
        prompt: "A clear product photograph",
        model: "imaginary:model",
        aspectRatio: "1:1",
        quality: "high",
        outputCount: 4,
        meteredConsent: true,
      }),
      context,
    );
    expect(response.status).toBe(400);
  });

  it("rejects non-Website asset placement before library mutation", async () => {
    const runId = await createRun();
    runIds.push(runId);
    await saveArtifact(runId, ARTIFACTS.intake, IntakeSchema.parse({
      businessName: "Legacy App",
      category: "service",
      location: "Austin, TX",
      services: ["Help"],
      primaryAction: "quote",
      projectTarget: "web-app",
    }));
    const response = await POST(
      new Request(`http://localhost:3000/api/assets/${runId}`, {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "place",
          assetId: "asset-legacy",
          editId: "hero.image",
        }),
      }),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "unsupported-project-target", projectTarget: "web-app" });
  });

  it.each(["generate", "regenerate"] as const)(
    "rejects non-Website asset %s before claims, reservation, staging, or provider work",
    async (action) => {
      const runId = await createRun();
      runIds.push(runId);
      await saveArtifact(
        runId,
        ARTIFACTS.intake,
        IntakeSchema.parse({
          businessName: "Legacy App",
          category: "service",
          location: "Austin, TX",
          services: ["Help"],
          primaryAction: "quote",
          projectTarget: "ios-app",
        }),
      );
      const roots = sitePaths(runId);
      await fs.writeFile(
        `${roots.root}/image-generation-ledger.json`,
        '{"version":1,"capCredits":14,"entries":[]}\n',
      );
      const ledgerBefore = await fs.readFile(
        `${roots.root}/image-generation-ledger.json`,
      );
      const response = await POST(
        new Request(`http://localhost:3000/api/assets/${runId}`, {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "sec-fetch-site": "same-origin",
            "content-type": "application/json",
          },
          body: JSON.stringify(
            action === "generate"
              ? {
                  action,
                  requestId: "00000000-0000-4000-8000-000000000220",
                  prompt: "A legacy app hero",
                  model: "higgsfield:gpt_image_2",
                  aspectRatio: "1:1",
                  quality: "high",
                  meteredConsent: true,
                }
              : {
                  action,
                  requestId: "00000000-0000-4000-8000-000000000221",
                  assetId: "asset-legacy",
                  meteredConsent: true,
                },
          ),
        }),
        { params: Promise.resolve({ id: runId }) },
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: "unsupported-project-target",
        projectTarget: "ios-app",
      });
      expect(
        await fs.readFile(`${roots.root}/image-generation-ledger.json`),
      ).toEqual(ledgerBefore);
      await expect(
        fs.stat(`${roots.root}/image-generation-claims`),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(fs.stat(`${roots.root}/image-staging`)).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );
});
