import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const runId = "test-run";

function context(id = runId) {
  return { params: Promise.resolve({ id }) };
}

function authorizedRequest(body: unknown): Request {
  return new Request(`http://localhost:3000/api/ai-teammates/${runId}`, {
    method: "POST",
    headers: {
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    teammateId: "researcher",
    task: "Identify the evidence gaps in the current homepage brief.",
    dataClass: "project-internal",
    effectClasses: ["read", "propose"],
    toolGrants: [],
    childToolGrants: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local AI teammate route", () => {
  it("returns the exact eight-role Local foundation roster for a run", async () => {
    const response = await GET(
      new Request(`http://localhost:3000/api/ai-teammates/${runId}`, {
        headers: { Host: "localhost:3000" },
      }),
      context(),
    );
    const payload = (await response.json()) as {
      lane: string;
      runId: string;
      teammates: Array<{
        displayName: string;
        availability: string;
        effectClasses: string[];
      }>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.runId).toBe(runId);
    expect(payload.lane).toBe("Local foundation");
    expect(payload.teammates).toHaveLength(8);
    expect(payload.teammates.map(({ displayName }) => displayName)).toEqual([
      "Researcher",
      "PRD Planner",
      "Architecture Analyst",
      "Canvas Designer",
      "Implementation Producer",
      "QA Challenger",
      "Security Challenger",
      "SEO Qualifier",
    ]);
    expect(
      payload.teammates.every(
        ({ availability, effectClasses }) =>
          availability === "idle" &&
          effectClasses.join(",") === "read,propose",
      ),
    ).toBe(true);
  });

  it("rejects a cross-origin GET before exposing the roster", async () => {
    const response = await GET(
      new Request(`http://localhost:3000/api/ai-teammates/${runId}`, {
        headers: {
          Host: "localhost:3000",
          Origin: "https://example.invalid",
        },
      }),
      context(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized local API request",
    });
  });

  it("rejects an unauthorized malformed body before attempting JSON parsing", async () => {
    const request = new Request(
      `http://localhost:3000/api/ai-teammates/${runId}`,
      {
        method: "POST",
        headers: {
          Host: "localhost:3000",
          "Content-Type": "application/json",
        },
        body: "not-json",
      },
    );
    const jsonRead = vi.spyOn(request, "json");
    const textRead = vi.spyOn(request, "text");

    const response = await POST(request, context());

    expect(response.status).toBe(403);
    expect(jsonRead).not.toHaveBeenCalled();
    expect(textRead).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized local API request",
    });
  });

  it("fails closed on malformed run IDs and any missing, null, non-empty, expanded, or unknown grant shape", async () => {
    const malformedRun = await POST(
      authorizedRequest(assignment()),
      context("bad run id"),
    );
    expect(malformedRun.status).toBe(400);

    const invalidBodies = [
      { ...assignment(), toolGrants: undefined },
      { ...assignment(), toolGrants: null },
      { ...assignment(), toolGrants: ["filesystem"] },
      { ...assignment(), childToolGrants: undefined },
      { ...assignment(), childToolGrants: null },
      { ...assignment(), childToolGrants: ["browser"] },
      { ...assignment(), effectClasses: ["read"] },
      { ...assignment(), effectClasses: ["read", "propose", "mutate"] },
      { ...assignment(), effectClasses: ["propose", "read"] },
      { ...assignment(), dataClass: "client-sensitive" },
      { ...assignment(), hiddenFallback: "provider-selected" },
    ];

    for (const body of invalidBodies) {
      const response = await POST(authorizedRequest(body), context());
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("uses only the deterministic local producer and returns a proposal plus bound terminal receipt", async () => {
    const network = vi.fn(() => {
      throw new Error("network access is forbidden in Local foundation");
    });
    vi.stubGlobal("fetch", network);

    const firstResponse = await POST(
      authorizedRequest(assignment()),
      context(),
    );
    const first = (await firstResponse.json()) as {
      lane: string;
      runId: string;
      proposal: {
        schemaVersion: number;
        teammateId: string;
        task: string;
        recommendation: string;
        boundaries: string[];
        notice: string;
      } | null;
      receipt: {
        jobId: string;
        jobSha256: string;
        teammateId: string;
        status: string;
        stoppingCondition: string;
        inputSha256: string;
        outputSha256: string | null;
        partialOutputSha256: string | null;
        startedAt: string;
        stoppedAt: string;
        retryEligible: boolean;
        effectClasses: string[];
        outputSchemaId: string;
        providerCostUsd: number;
        executionLane: string;
      };
    };
    const secondResponse = await POST(
      authorizedRequest(assignment()),
      context(),
    );
    const second = (await secondResponse.json()) as typeof first;

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(network).not.toHaveBeenCalled();
    expect(first.runId).toBe(runId);
    expect(first.lane).toBe("Local foundation");
    expect(first.proposal).toEqual(second.proposal);
    expect(first.proposal).toMatchObject({
      schemaVersion: 1,
      teammateId: "researcher",
      task: "Identify the evidence gaps in the current homepage brief.",
      notice: "Proposal only — no project or site changes were applied.",
    });
    expect(first.proposal?.boundaries).toEqual([
      "Read and propose only.",
      "No tools, providers, networks, credentials, or project mutations were used.",
    ]);
    expect(first.receipt).toMatchObject({
      jobId: second.receipt.jobId,
      teammateId: "researcher",
      status: "complete",
      stoppingCondition: "proposal-complete",
      partialOutputSha256: null,
      retryEligible: false,
      effectClasses: ["read", "propose"],
      outputSchemaId: "one-box.proposal.local-foundation.v1",
      providerCostUsd: 0,
      executionLane: "deterministic-local",
    });
    expect(first.receipt.jobSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.receipt.inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.receipt.outputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.receipt.outputSha256).toBe(second.receipt.outputSha256);
    expect(first.receipt.startedAt).toMatch(/Z$/);
    expect(first.receipt.stoppedAt).toMatch(/Z$/);
    expect(Date.parse(first.receipt.stoppedAt)).toBeGreaterThanOrEqual(
      Date.parse(first.receipt.startedAt),
    );
  });
});
