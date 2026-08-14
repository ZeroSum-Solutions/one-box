import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkflowArtifactVersion } from "../lib/contracts";
import { ArtifactPreview, EvidenceWorkspace } from "./EvidenceWorkspace";
import type { RunState } from "../lib/contracts";

const base = {
  version: 2,
  createdAt: "2026-08-13T12:00:00.000Z",
  approvalTransitions: [{ state: "draft", at: "2026-08-13T12:00:00.000Z" }],
};

function render(artifact: unknown): string {
  return renderToStaticMarkup(
    <ArtifactPreview runId="run-test" artifact={artifact as WorkflowArtifactVersion} />
  );
}

describe("EvidenceWorkspace artifact previews", () => {
  it("links and exposes readable previews for every gated artifact", () => {
    const contract = render({ ...base, artifactType: "design-contract", artifact: { title: "Contract", contractPath: "evidence/versions/design-contract/v2.DESIGN.md", sourceLedgerVersion: 1, approvedEvidenceIds: ["claim-1"], exportPaths: ["evidence/versions/design-contract/v2.tailwind.css"], contractSha256: "a".repeat(64), exportSha256: "b".repeat(64) } });
    expect(contract).toContain("/api/sites/run-test/evidence/versions/design-contract/v2.json");
    expect(contract).toContain("DESIGN.md preview");
    expect(contract).toContain("Tailwind export preview");
    expect(contract).toContain('role="status"');

    const tokens = render({ ...base, artifactType: "token-inventory", artifact: { sourceContractVersion: 2, tokens: [{ semanticName: "--color-primary", value: "#123456", usage: "Action", category: "color", sourceEvidenceIds: ["claim-1"], editable: true }] } });
    expect(tokens).toContain("versioned token inventory JSON");
    expect(tokens).toContain("--color-primary");

    const tailwind = render({ ...base, artifactType: "tailwind-plan", artifact: { sourceTokenInventoryVersion: 2, themeMappings: [{ cssVariable: "--color-primary", tailwindName: "--color-color-primary", rationale: "Approved" }], componentVariants: [], responsiveRules: [] } });
    expect(tailwind).toContain("versioned Tailwind plan JSON");
    expect(tailwind).toContain("--color-color-primary");

    const css = render({ ...base, artifactType: "css-architecture", artifact: { sourceTailwindPlanVersion: 2, cssVariableHierarchy: ["tokens"], tokenToComponentUsage: { "--color-primary": ["button"] }, justifiedExceptions: [], generatedCssPath: "site/tailwind-utilities.css" } });
    expect(css).toContain("versioned CSS architecture JSON");
    expect(css).toContain("Generated Tailwind theme source (@theme mapping)");
    expect(css).toContain("/api/sites/run-test/tailwind-theme.css");
    expect(css).toContain("Compiled Tailwind utility output");
    expect(css).toContain("/api/sites/run-test/tailwind-utilities.css");

    const qa = render({ ...base, artifactType: "visual-qa", artifact: { sourceCssArchitectureVersion: 2, buildSha256: "c".repeat(64), checks: [{ area: "desktop", status: "pass", notes: "ok", evidencePath: "evidence/qa/desktop.png" }] } });
    expect(qa).toContain("versioned visual QA JSON");
    expect(qa).toContain('src="/api/sites/run-test/evidence/qa/desktop.png"');
    expect(qa).toContain('alt="desktop QA evidence"');
  });

  it("offers server regeneration instead of a forgeable visual-QA JSON editor", () => {
    const qa = {
      ...base,
      artifactType: "visual-qa",
      approvalTransitions: [
        ...base.approvalTransitions,
        { state: "revision-requested", at: "2026-08-13T12:01:00.000Z" },
      ],
      artifact: {
        sourceCssArchitectureVersion: 1,
        buildSha256: "c".repeat(64),
        checks: [{ area: "desktop", status: "pass", notes: "ok", evidencePath: "evidence/qa/v2/desktop.png" }],
      },
    };
    const run = {
      id: "run-test",
      createdAt: "2026-08-13T12:00:00.000Z",
      pipelineVersion: "evidence-gated-v2",
      stages: {},
      costUsd: 0,
      costCapUsd: 3,
      modelSlugs: {},
      referenceMode: "none",
      evidenceWorkflow: { currentStage: "build", artifacts: [qa] },
    } as unknown as RunState;
    const html = renderToStaticMarkup(<EvidenceWorkspace initialRun={run} />);
    expect(html).toContain("Regenerate visual QA from current build");
    expect(html).not.toContain("Edit current artifact JSON");
    expect(html).not.toContain("Save new version");
  });
});
