import { describe, expect, it, vi } from "vitest";
import { RunNotFoundError } from "../../../../../lib/runstate";
import { handleFallbackRequest } from "./route-runtime";

function localRequest(body?: ReadableStream<Uint8Array>) {
  return new Request("http://localhost:3000/api/runs/page-ir-run/fallback", {
    method: "POST",
    headers: {
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
    },
    ...(body ? { body, duplex: "half" } : {}),
  } as RequestInit & { duplex?: "half" });
}

describe("operator-requested template fallback", () => {
  it("creates the server-reasoned linked template run without reading client input", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(
          JSON.stringify({ reason: "candidate-gates-failed", childRunId: "forged" }),
        ));
        controller.close();
      },
    });
    const createTemplateFallbackRun = vi.fn().mockResolvedValue("template-child");
    const request = localRequest(body);
    const response = await handleFallbackRequest(
      request,
      "page-ir-run",
      { createTemplateFallbackRun },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sourceRunId: "page-ir-run",
      fallbackRunId: "template-child",
      layoutAuthority: "template-v1",
      reason: "operator-requested-after-failure",
    });
    expect(createTemplateFallbackRun).toHaveBeenCalledWith(
      "page-ir-run",
      "operator-requested-after-failure",
    );
    expect(request.bodyUsed).toBe(false);
  });

  it("rejects unauthorized requests before body or fallback mutation", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      },
    });
    const createTemplateFallbackRun = vi.fn();
    const request = new Request("http://hostile.example/api/runs/page-ir-run/fallback", {
      method: "POST",
      headers: {
        Host: "hostile.example",
        Origin: "https://hostile.example",
        "Content-Type": "application/json",
      },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await Promise.resolve();
    const pullsBefore = pulls;

    const response = await handleFallbackRequest(request, "page-ir-run", {
      createTemplateFallbackRun,
    });
    expect(response.status).toBe(403);
    expect(pulls).toBe(pullsBefore);
    expect(createTemplateFallbackRun).not.toHaveBeenCalled();
  });

  it("returns an actionable conflict without inventing or changing a failure", async () => {
    const response = await handleFallbackRequest(
      localRequest(),
      "page-ir-run",
      {
        createTemplateFallbackRun: vi.fn().mockRejectedValue(
          new Error("template fallback requires a currently failed stage"),
        ),
      },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "template fallback requires a currently failed stage",
      action: "Keep the Page IR run unchanged, then request fallback only after a recorded failure.",
    });

    const claimConflict = await handleFallbackRequest(
      localRequest(),
      "page-ir-run",
      {
        createTemplateFallbackRun: vi.fn().mockRejectedValue(
          new Error("template fallback claim conflicts with the failed source"),
        ),
      },
    );
    expect(claimConflict.status).toBe(409);
    await expect(claimConflict.json()).resolves.toEqual({
      error: "template fallback claim conflicts with the failed source",
      action: "Keep the Page IR run unchanged, then request fallback only after a recorded failure.",
    });
  });

  it("maps missing runs and unexpected failures without leaking internals", async () => {
    const missing = await handleFallbackRequest(localRequest(), "page-ir-run", {
      createTemplateFallbackRun: vi.fn().mockRejectedValue(
        new RunNotFoundError("page-ir-run"),
      ),
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      error: "run not found",
      action: "Check the Page IR run ID.",
    });

    const unexpected = await handleFallbackRequest(localRequest(), "page-ir-run", {
      createTemplateFallbackRun: vi.fn().mockRejectedValue(
        new Error("ENOENT /private/client/path"),
      ),
    });
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({
      error: "template fallback failed",
      action: "Inspect the server log, then retry without changing the Page IR source run.",
    });
  });
});
