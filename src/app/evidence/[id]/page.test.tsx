import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadRun: vi.fn(),
  loadArtifact: vi.fn(),
  loadPageIrSourceBundleForReview: vi.fn(),
}));

vi.mock("../../../components/EvidenceWorkspace", () => ({ EvidenceWorkspace: () => null }));
vi.mock("../../../lib/runstate", () => ({
  loadRun: mocks.loadRun,
  loadArtifact: mocks.loadArtifact,
  RunNotFoundError: class RunNotFoundError extends Error {},
}));
vi.mock("../../../lib/pageIrPipeline", () => ({
  loadPageIrSourceBundleForReview: mocks.loadPageIrSourceBundleForReview,
}));
vi.mock("../../../lib/referenceContext", () => ({
  requiredReferenceContext: () => "explicit-no-reference",
}));
vi.mock("../../../lib/productionTarget", () => ({
  classifyPersistedIntakeCompatibility: () => undefined,
}));

import EvidencePage from "./page";

describe("EvidencePage direct reload", () => {
  it("passes the validated PageIR Source Bundle projection into the workspace", async () => {
    const run = {
      id: "page-ir-run",
      layoutAuthority: "page-ir-v1",
      referenceMode: "none",
    };
    const projection = {
      bundle: {
        schemaVersion: 1,
        bundleVersion: 1,
        payloadSha256: "a".repeat(64),
        upstreamBindings: [{ kind: "evidence", version: 1, sha256: "b".repeat(64) }],
        sourceArtifacts: [
          { kind: "layout-decision", version: 1, sha256: "c".repeat(64) },
          { kind: "content", version: 2, sha256: "d".repeat(64) },
          { kind: "assets", version: 3, sha256: "e".repeat(64) },
        ],
        reviewTransitions: [{
          state: "in-review",
          at: "2026-08-23T12:00:00.000Z",
          actorKind: "human",
          actorName: "Devin",
        }],
      },
      reviewState: "in-review",
      sources: {
        layoutDecision: { schemaVersion: 1, purpose: "brochure-local-service" },
        content: { schemaVersion: 1, sourceLayoutDecisionVersion: 1, content: [], actions: [] },
        assets: { schemaVersion: 1, sourceLayoutDecisionVersion: 1, assets: [] },
      },
    };
    mocks.loadRun.mockResolvedValue(run);
    mocks.loadArtifact.mockResolvedValue(null);
    mocks.loadPageIrSourceBundleForReview.mockResolvedValue(projection);

    const page = await EvidencePage({ params: Promise.resolve({ id: run.id }) });

    expect(mocks.loadPageIrSourceBundleForReview).toHaveBeenCalledWith(run.id);
    expect(page.props.initialPageIrSourceReview).toMatchObject({
      payloadSha256: "a".repeat(64),
      state: "in-review",
      latestTransition: { actorKind: "human", actorName: "Devin" },
      sources: {
        layoutDecision: { version: 1, sha256: "c".repeat(64) },
        content: { version: 2, sha256: "d".repeat(64) },
        assets: { version: 3, sha256: "e".repeat(64) },
      },
    });
  });
});
