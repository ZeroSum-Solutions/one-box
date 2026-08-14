import { describe, expect, it } from "vitest";
import { POST } from "./route";

const context = { params: Promise.resolve({ id: "asset-test" }) };

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
});
