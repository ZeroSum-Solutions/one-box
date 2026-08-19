import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyElementHtmlEdit: vi.fn(),
  generateJson: vi.fn(),
  loadArtifact: vi.fn(),
  loadRun: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("../../../lib/elementEditor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/elementEditor")>();
  return { ...actual, applyElementHtmlEdit: mocks.applyElementHtmlEdit };
});
vi.mock("../../../lib/openrouter", () => ({ generateJson: mocks.generateJson }));
vi.mock("../../../lib/runstate", () => ({
  sitePaths: () => ({ root: "/unused", site: "/unused/site" }),
  loadArtifact: mocks.loadArtifact,
  loadRun: mocks.loadRun,
}));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: mocks.readFile,
}));

import { POST } from "./route";

const tokens = {
  colors: [],
  fonts: [],
  imageryBrief: { subject: "people", lighting: "natural", grade: "warm", framing: "wide", avoid: [] },
};

const digest = {
  sourceStyleId: "style-1",
  designContractVersion: 1,
  northStar: "Warm and quiet",
  preserveTraits: ["calm surfaces", "clear actions", "generous space"],
  sectionRhythm: "Leave room between sections.",
  surfaces: [{ level: 0, purpose: "main page" }],
  componentRecipes: ["Simple primary action"],
  imageryTreatment: "Warm candid photos",
  motionPersonality: "Quiet",
  dosDonts: [
    { polarity: "do", rule: "Keep actions clear." },
    { polarity: "do", rule: "Leave space around sections." },
    { polarity: "do", rule: "Use warm photos." },
    { polarity: "dont", rule: "Do not use glossy effects." },
  ],
};

function editRequest(body: Record<string, unknown> = {}) {
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
      editId: "hero.headline",
      instruction: "Make this clearer",
      ...body,
    }),
  });
}

function makeMutationSucceed() {
  mocks.applyElementHtmlEdit.mockImplementation(async (_runId, _editId, transform) => {
    await transform('<h1 data-edit-id="hero.headline">Before</h1>');
    return { gates: [] };
  });
  mocks.loadRun.mockResolvedValue({ costUsd: 0.2 });
}

describe("edit route classify-then-apply preflight", () => {
  beforeEach(() => {
    mocks.loadArtifact.mockImplementation(async (_runId, artifact) =>
      artifact === "reference-style-digest.json" ? digest : tokens,
    );
    mocks.readFile.mockResolvedValue('<h1 data-edit-id="hero.headline">Before</h1>');
    makeMutationSucceed();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses before the mutation transaction creates a snapshot or runs gates", async () => {
    mocks.generateJson.mockResolvedValue({
      decision: "refuse",
      reason: "That would make the page feel unrelated to the approved direction.",
      suggestedAlternative: "Make the headline more direct while keeping the calm tone.",
    });

    const response = await POST(editRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      guardrail: {
        decision: "refuse",
        reason: "That would make the page feel unrelated to the approved direction.",
        suggestedAlternative: "Make the headline more direct while keeping the calm tone.",
      },
    });
    expect(mocks.applyElementHtmlEdit).not.toHaveBeenCalled();
    expect(mocks.loadRun).not.toHaveBeenCalled();
  });

  it("returns a redirect without entering the mutation transaction until it is confirmed", async () => {
    mocks.generateJson.mockResolvedValue({
      decision: "redirect",
      reason: "A dramatic rewrite would fight the page's quiet tone.",
      suggestedAlternative: "Make the headline more direct while keeping the calm tone.",
    });

    const response = await POST(editRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: false,
      guardrail: {
        decision: "redirect",
        reason: "A dramatic rewrite would fight the page's quiet tone.",
        suggestedAlternative: "Make the headline more direct while keeping the calm tone.",
      },
    });
    expect(mocks.applyElementHtmlEdit).not.toHaveBeenCalled();
    expect(mocks.loadRun).not.toHaveBeenCalled();
  });

  it("enters the existing mutation transaction after a redirect is confirmed", async () => {
    mocks.generateJson
      .mockResolvedValueOnce({
        decision: "redirect",
        reason: "A dramatic rewrite would fight the page's quiet tone.",
        suggestedAlternative: "Make the headline more direct while keeping the calm tone.",
      })
      .mockResolvedValueOnce({ innerHtml: "After" });

    const response = await POST(editRequest({ confirmRedirect: true, instruction: "Make the headline more direct while keeping the calm tone." }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, editId: "hero.headline" });
    expect(mocks.applyElementHtmlEdit).toHaveBeenCalledOnce();
    expect(mocks.generateJson).toHaveBeenNthCalledWith(
      1,
      "run1",
      "deepseek/deepseek-v4-flash",
      expect.anything(),
      expect.stringContaining("Make the headline more direct"),
    );
    expect(mocks.generateJson.mock.calls[0][3]).toContain("calm surfaces");
    expect(mocks.generateJson.mock.calls[0][3]).toContain("Do not use glossy effects.");
  });

  it("enters the existing mutation transaction when the instruction is compatible", async () => {
    mocks.generateJson
      .mockResolvedValueOnce({ decision: "apply" })
      .mockResolvedValueOnce({ innerHtml: "After" });

    const response = await POST(editRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, editId: "hero.headline" });
    expect(mocks.applyElementHtmlEdit).toHaveBeenCalledOnce();
  });

  it("fails open when classification fails and warns before using the existing mutation transaction", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.generateJson
      .mockRejectedValueOnce(new Error("classification unavailable"))
      .mockResolvedValueOnce({ innerHtml: "After" });

    const response = await POST(editRequest());

    expect(response.status).toBe(200);
    expect(mocks.applyElementHtmlEdit).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("classification failed"));
    warn.mockRestore();
  });

  it("normalizes technical guardrail language without a second classification call", async () => {
    mocks.generateJson.mockResolvedValue({
      decision: "redirect",
      reason: "This needs a CSS token change.",
      suggestedAlternative: "Use the existing Tailwind design system instead.",
    });

    const response = await POST(editRequest());
    const data = await response.json();

    expect(data).toMatchObject({ ok: false, guardrail: { decision: "redirect" } });
    expect(data.guardrail.reason).not.toMatch(/css|token|tailwind|design system|hex/i);
    expect(data.guardrail.suggestedAlternative).not.toMatch(/css|token|tailwind|design system|hex/i);
    expect(mocks.generateJson).toHaveBeenCalledOnce();
  });
});
