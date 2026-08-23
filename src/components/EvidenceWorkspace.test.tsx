import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  WorkflowArtifactVersionSchema,
  type WorkflowArtifactVersion,
} from "../lib/contracts";
import {
  ArtifactPreview,
  EvidenceWorkspace,
  artifactUrl,
  isPageIrSourceReviewActive,
  pageIrSourceApprovalReady,
  syncHumanVisualReviewDraft,
  syncPageIrSourceReviewDraft,
  type PageIrSourceReviewView,
} from "./EvidenceWorkspace";
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
  it("renders explicit empty states when a research group collected no evidence", () => {
    const ledger = render({
      ...base,
      artifactType: "ledger",
      artifact: {
        projectTarget: "website",
        businessIntelligence: {
          kind: "business-intelligence",
          sources: [],
          competitors: [],
          marketExpectations: [],
          differentiationOpportunities: [],
          claims: [],
        },
        referoDesignEvidence: {
          kind: "refero-design-evidence",
          sources: [],
          references: [],
          claims: [],
        },
        clientEvidence: {
          sources: [],
          claims: [],
          unsupportedUploadIds: [],
          artifactRelationships: [],
        },
      },
    });

    expect(ledger).toContain(
      "No competitors or other business intelligence evidence were recorded for this run."
    );
    expect(ledger).toContain("No Refero design evidence was recorded for this run.");
    expect(ledger).toContain("No client-provided evidence was attached to this run.");
  });

  it("does not call a references-only Refero group empty", () => {
    const ledger = render({
      ...base,
      artifactType: "ledger",
      artifact: {
        projectTarget: "website",
        businessIntelligence: {
          kind: "business-intelligence",
          sources: [],
          competitors: [],
          marketExpectations: [],
          differentiationOpportunities: [],
          claims: [],
        },
        referoDesignEvidence: {
          kind: "refero-design-evidence",
          sources: [],
          references: [
            {
              referoId: "reference-1",
              name: "Reference one",
              learningRationale: "Clear hierarchy",
              reusablePatterns: ["Strong heading rhythm"],
            },
          ],
          claims: [],
        },
        clientEvidence: {
          sources: [],
          claims: [],
          unsupportedUploadIds: [],
          artifactRelationships: [],
        },
      },
    });

    expect(ledger).not.toContain("No Refero design evidence was recorded for this run.");
    expect(ledger).toContain("Reference one");
  });

  it("does not call recorded business or client artifact relationships empty", () => {
    const ledger = render({
      ...base,
      artifactType: "ledger",
      artifact: {
        projectTarget: "website",
        businessIntelligence: {
          kind: "business-intelligence",
          sources: [
            {
              id: "unsafe-source",
              sourceUrl: "javascript:alert(2)",
              title: "Unsafe source link",
              screenshotPaths: [],
              extractedArtifactPaths: [],
              capturedAt: "2026-08-13T12:00:00.000Z",
              confidence: 0.5,
              crawlAttempts: [],
            },
          ],
          competitors: [
            {
              name: "Competitor one",
              url: "https://competitor.example",
              selectionRationale: "Local operator",
              strengths: [],
              gaps: [],
            },
            {
              name: "Unsafe competitor link",
              url: "javascript:alert(1)",
              selectionRationale: "Imported legacy record",
              strengths: [],
              gaps: [],
            },
          ],
          marketExpectations: ["Clear service navigation"],
          differentiationOpportunities: ["Stronger proof near the primary action"],
          claims: [],
        },
        referoDesignEvidence: {
          kind: "refero-design-evidence",
          sources: [],
          references: [],
          claims: [],
        },
        clientEvidence: {
          sources: [],
          claims: [],
          unsupportedUploadIds: [],
          artifactRelationships: [
            {
              uploadId: "upload-1",
              kind: "logo",
              status: "asset-referenced",
              consumer: "design",
            },
          ],
        },
      },
    });

    expect(ledger).not.toContain(
      "No competitors or other business intelligence evidence were recorded for this run."
    );
    expect(ledger).toContain("Competitor one");
    expect(ledger).toContain("Unsafe competitor link");
    expect(ledger).toContain("Unsafe source link");
    expect(ledger).not.toMatch(/href="javascript:/);
    expect(ledger).toContain("Clear service navigation");
    expect(ledger).toContain("Stronger proof near the primary action");
    expect(ledger).not.toContain("No client-provided evidence was attached to this run.");
    expect(ledger).toContain("Client artifact upload-1");
  });

  it("resets the entire human-review draft when visual-QA version or build hash changes", () => {
    const firstIdentity = `1:${"a".repeat(64)}`;
    const dirty = syncHumanVisualReviewDraft(undefined, firstIdentity);
    dirty.reviewerName = "Devin";
    dirty.humanAttestation = true;
    dirty.referenceContext = "explicit-no-reference";
    dirty.criteria.briefFidelity = { status: "fail", findings: "Revise the hero" };

    expect(syncHumanVisualReviewDraft(dirty, firstIdentity)).toBe(dirty);

    const nextVersion = syncHumanVisualReviewDraft(dirty, `2:${"a".repeat(64)}`);
    expect(nextVersion).toMatchObject({
      identity: `2:${"a".repeat(64)}`,
      reviewerName: "",
      humanAttestation: false,
      referenceContext: "",
      criteria: {
        briefFidelity: { status: "", findings: "" },
      },
    });

    const nextBuild = syncHumanVisualReviewDraft(dirty, `1:${"b".repeat(64)}`);
    expect(nextBuild).toMatchObject({
      identity: `1:${"b".repeat(64)}`,
      reviewerName: "",
      humanAttestation: false,
      referenceContext: "",
      criteria: {
        briefFidelity: { status: "", findings: "" },
      },
    });
  });

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
    expect(css).toContain(
      "/api/sites/run-test/evidence/approved/runtime-tailwind-theme.css",
    );
    expect(css).toContain("Compiled Tailwind utility output");
    expect(css).toContain("/api/sites/run-test/tailwind-utilities.css");

    const qa = render({ ...base, artifactType: "visual-qa", artifact: { sourceCssArchitectureVersion: 2, buildSha256: "c".repeat(64), checks: [{ area: "desktop", status: "pass", notes: "ok", evidencePath: "evidence/qa/desktop.png" }] } });
    expect(qa).toContain("versioned visual QA JSON");
    expect(qa).toContain('src="/api/sites/run-test/evidence/qa/desktop.png"');
    expect(qa).toContain('alt="desktop QA evidence"');
  });

  // BLOCKER: every visual-QA version is created in "draft" approval state,
  // but the header's Approve & continue pair explicitly excludes visual-qa
  // (a human review decides that, not a generic approve). Draft had no exit
  // control at all — the gate could be entered and never left.
  it("offers a way out of the visual-QA draft dead end", () => {
    const qa = {
      ...base,
      artifactType: "visual-qa",
      artifact: {
        sourceCssArchitectureVersion: 1,
        buildSha256: "c".repeat(64),
        checks: [{ area: "desktop", status: "pass", notes: "ok" }],
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
    expect(html).toContain("Submit for review");
    expect(html).not.toContain("Approve &amp; continue");
    // The gate rail must mirror the panel's real approval state, not a
    // hardcoded "in review" for whichever gate happens to be current.
    expect(html).toContain('data-approval="draft"');
    expect(html).not.toContain(">in review<");
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

  it("collects an attested named human review for every visual criterion instead of showing generic approval", () => {
    const qa = {
      ...base,
      artifactType: "visual-qa",
      approvalTransitions: [
        ...base.approvalTransitions,
        { state: "in-review", at: "2026-08-13T12:01:00.000Z" },
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
    expect(html).toContain("Human visual review");
    expect(html).toContain("Reviewer name");
    expect(html).toContain("Brief fidelity");
    expect(html).toContain("Visual hierarchy");
    expect(html).toContain("Intentional spacing and composition");
    expect(html).toContain("Business specificity (not a generic template)");
    expect(html).toContain("DESIGN.md and reference alignment");
    expect(html).toContain("No external reference was selected");
    expect(html).not.toContain('value="design-and-references"');
    expect(html).toContain("Open build preview");
    expect(html).toContain("I attest that I am the human reviewer");
    expect(html).not.toContain(">Approve<");
  });

  it("keeps a completed human review readable in visual-QA history", () => {
    const qa = render({
      ...base,
      artifactType: "visual-qa",
      approvalTransitions: [
        ...base.approvalTransitions,
        {
          state: "revision-requested",
          at: "2026-08-13T12:01:00.000Z",
          actor: "human-reviewer",
          humanVisualReview: {
            reviewerName: "Devin",
            reviewerKind: "human",
            humanAttestation: true,
            reviewedAt: "2026-08-13T12:01:00.000Z",
            buildSha256: "c".repeat(64),
            criteria: {
              briefFidelity: { status: "pass" },
              visualHierarchy: { status: "pass" },
              spacingAndComposition: { status: "pass" },
              businessSpecificity: { status: "fail", findings: "Too generic" },
              designAndReferenceAlignment: { status: "pass", referenceContext: "explicit-no-reference" },
            },
          },
        },
      ],
      artifact: {
        sourceCssArchitectureVersion: 1,
        buildSha256: "c".repeat(64),
        checks: [{ area: "desktop", status: "pass", evidencePath: "evidence/qa/v1/desktop.png" }],
      },
    });
    expect(qa).toContain("Reviewed by Devin");
    expect(qa).toContain("Too generic");
  });
});

// A stage whose draft has not been written yet still rendered the review note
// box, but no action consumes that note — every button that reads it is gated
// on an artifact. Reviewers were left typing into a field with no way to send
// it. Offer the one action that applies instead.
describe("EvidenceWorkspace with no draft for the current stage", () => {
  const run = {
    id: "run-test",
    createdAt: "2026-08-13T12:00:00.000Z",
    pipelineVersion: "evidence-gated-v2",
    stages: {},
    costUsd: 0,
    costCapUsd: 3,
    modelSlugs: {},
    referenceMode: "none",
    evidenceWorkflow: { currentStage: "evidence", artifacts: [] },
  } as unknown as RunState;

  it("does not offer a review note there is no action to submit", () => {
    const html = renderToStaticMarkup(<EvidenceWorkspace initialRun={run} />);

    expect(html).toContain("Draft not generated");
    expect(html).not.toContain("Review note");
  });

  it("still offers the resume link that does apply", () => {
    const html = renderToStaticMarkup(<EvidenceWorkspace initialRun={run} />);

    expect(html).toContain("Resume generation");
  });
});

describe("EvidenceWorkspace legacy compatibility", () => {
  it("labels a legacy target read-only while keeping preview and export available", () => {
    const run = {
      id: "legacy-run",
      createdAt: "2026-08-13T12:00:00.000Z",
      pipelineVersion: "evidence-gated-v2",
      stages: {},
      costUsd: 0,
      costCapUsd: 3,
      modelSlugs: {},
      referenceMode: "none",
      evidenceWorkflow: { currentStage: "evidence", artifacts: [] },
    } as unknown as RunState;

    const html = renderToStaticMarkup(
      <EvidenceWorkspace
        initialRun={run}
        compatibility={{
          mode: "legacy-read-only",
          projectTarget: "web-app",
          label: "legacy/experimental",
          readOnly: true,
          message:
            "Legacy/experimental and read-only in Phase 1; preview/export available; start a new Website project for generation/edit.",
        }}
      />,
    );

    expect(html).toContain("legacy/experimental");
    expect(html).toContain("read-only in Phase 1");
    expect(html).toContain(`/api/evidence/${run.id}/export`);
    expect(html).toContain(`/preview/${run.id}`);
    expect(html).not.toContain("Resume generation");
    expect(html).not.toContain("Approve &amp; continue");
    expect(html).not.toContain("Review note");
  });
});

const pageIrBuildRun = {
  id: "page-ir-run",
  createdAt: "2026-08-23T12:00:00.000Z",
  pipelineVersion: "evidence-gated-v2",
  layoutAuthority: "page-ir-v1",
  stages: {},
  costUsd: 0,
  costCapUsd: 3,
  modelSlugs: {},
  referenceMode: "none",
  evidenceWorkflow: { currentStage: "build", artifacts: [] },
} as unknown as RunState;

function sourceReview(
  state: PageIrSourceReviewView["state"],
  payloadSha256 = "a".repeat(64),
): PageIrSourceReviewView {
  const reviewed = state === "approved";
  return {
    schemaVersion: 1,
    bundleVersion: 1,
    payloadSha256,
    state,
    latestTransition: {
      at: "2026-08-23T12:00:00.000Z",
      actorKind: state === "draft" ? "system" : "human",
      actorName: state === "draft" ? "page-ir-source-bundle" : "Devin",
      ...(state === "rejected" ? { note: "The source chain is wrong." } : {}),
    },
    upstreamBindings: [
      "evidence",
      "design-contract",
      "token-inventory",
      "tailwind-plan",
      "css-architecture",
    ].map((kind, index) => ({
      kind: kind as PageIrSourceReviewView["upstreamBindings"][number]["kind"],
      version: 1,
      sha256: String(index + 1).repeat(64),
    })),
    sources: {
      layoutDecision: {
        version: 1,
        sha256: "6".repeat(64),
        value: { schemaVersion: 1, purpose: "brochure-local-service" } as PageIrSourceReviewView["sources"]["layoutDecision"]["value"],
      },
      content: {
        version: 2,
        sha256: "7".repeat(64),
        value: { schemaVersion: 1, sourceLayoutDecisionVersion: 1, content: [], actions: [] },
      },
      assets: {
        version: 3,
        sha256: "8".repeat(64),
        value: { schemaVersion: 1, sourceLayoutDecisionVersion: 1, assets: [] },
      },
    },
    ...(reviewed
      ? {
          humanReview: {
            reviewerName: "Devin",
            reviewedAt: "2026-08-23T12:00:00.000Z",
            payloadSha256,
            criteria: {
              layoutDecision: "pass",
              content: "pass",
              assets: "pass",
              upstreamBindings: "pass",
              sourceChain: "pass",
            },
          },
        }
      : {}),
  };
}

describe("EvidenceWorkspace PageIR Source Bundle review", () => {
  it("keeps the existing resume-generation state when PageIR has no Source Bundle yet", () => {
    const html = renderToStaticMarkup(<EvidenceWorkspace initialRun={pageIrBuildRun} />);
    expect(html).toContain("Draft not generated");
    expect(html).toContain('href="/?run=page-ir-run"');
    expect(html).not.toContain("Named human Source Bundle review");
  });

  it("suppresses Source Bundle review while an earlier approved gate is being browsed", () => {
    const review = sourceReview("in-review");
    expect(isPageIrSourceReviewActive(pageIrBuildRun, review, false)).toBe(true);
    expect(isPageIrSourceReviewActive(pageIrBuildRun, review, true)).toBe(false);
  });

  it("renders the separate review checkpoint inside Build without a seventh rail item", () => {
    const html = renderToStaticMarkup(
      <EvidenceWorkspace initialRun={pageIrBuildRun} initialPageIrSourceReview={sourceReview("draft")} />
    );

    expect(html).toContain("PageIR Source Bundle");
    expect(html.match(/gate-rail__item/g)).toHaveLength(6);
    expect(html).toContain("Build");
  });

  it("renders a draft as read-only named review and hides generic approval and editing", () => {
    const html = renderToStaticMarkup(
      <EvidenceWorkspace initialRun={pageIrBuildRun} initialPageIrSourceReview={sourceReview("draft")} />
    );

    expect(html).toContain("Begin named human review");
    expect(html).toContain("Reviewer name");
    expect(html).toContain("Layout decision");
    expect(html).toContain("Content source");
    expect(html).toContain("Assets source");
    expect(html).toContain("Reject Source Bundle");
    expect(html).not.toContain("Approve &amp; continue");
    expect(html).not.toContain("Review note");
    expect(html).not.toContain("Edit current artifact JSON");
  });

  it("locks the in-review reviewer and starts all five confirmations plus attestation unchecked", () => {
    const html = renderToStaticMarkup(
      <EvidenceWorkspace initialRun={pageIrBuildRun} initialPageIrSourceReview={sourceReview("in-review")} />
    );

    expect(html).toContain("Reviewer: Devin");
    for (const label of [
      "Layout decision",
      "Content",
      "Assets",
      "Upstream bindings",
      "Source chain",
    ]) expect(html).toContain(label);
    expect(html).toContain("I attest that I am the named human reviewer");
    expect(html).not.toContain('checked=""');
    expect(html).toContain('disabled=""');
  });

  it("requires all five confirmations plus explicit attestation for approval", () => {
    const draft = syncPageIrSourceReviewDraft(undefined, "a".repeat(64));
    expect(pageIrSourceApprovalReady(draft)).toBe(false);
    draft.confirmations = {
      layoutDecision: true,
      content: true,
      assets: true,
      upstreamBindings: true,
      sourceChain: true,
    };
    expect(pageIrSourceApprovalReady(draft)).toBe(false);
    draft.humanAttestation = true;
    expect(pageIrSourceApprovalReady(draft)).toBe(true);
  });

  it("resets reviewer, confirmations, attestation, and rejection note when the payload hash changes", () => {
    const dirty = syncPageIrSourceReviewDraft(undefined, "a".repeat(64));
    dirty.reviewerName = "Devin";
    dirty.confirmations.layoutDecision = true;
    dirty.humanAttestation = true;
    dirty.rejectionNote = "Reject it";

    expect(syncPageIrSourceReviewDraft(dirty, "a".repeat(64))).toBe(dirty);
    expect(syncPageIrSourceReviewDraft(dirty, "b".repeat(64))).toEqual({
      payloadSha256: "b".repeat(64),
      reviewerName: "",
      confirmations: {
        layoutDecision: false,
        content: false,
        assets: false,
        upstreamBindings: false,
        sourceChain: false,
      },
      humanAttestation: false,
      rejectionNote: "",
    });
  });

  it("shows approved named-human proof and resumes via the truthful main timeline", () => {
    const html = renderToStaticMarkup(
      <EvidenceWorkspace initialRun={pageIrBuildRun} initialPageIrSourceReview={sourceReview("approved")} />
    );

    expect(html).toContain("Reviewed by Devin");
    expect(html).toContain("2026-08-23");
    expect(html).toContain("aaaaaaaaaaaa");
    expect(html).toContain('href="/?run=page-ir-run"');
    expect(html).not.toContain("Approve PageIR Source Bundle");
  });

  it("yields an approved Source Bundle panel to the current human visual-QA review", () => {
    const realChecks = (
      ["desktop", "tablet", "mobile", "hover", "focus", "color-scheme", "reduced-motion"] as const
    ).map((area) => ({
      area,
      status: "pass" as const,
      ...(["desktop", "tablet", "mobile"].includes(area)
        ? { evidencePath: `evidence/qa/v1/${area}.png` }
        : {}),
    }));
    const visualQa = WorkflowArtifactVersionSchema.parse({
      version: 1,
      createdAt: "2026-08-23T12:01:00.000Z",
      artifactType: "visual-qa",
      approvalTransitions: [
        { state: "draft", at: "2026-08-23T12:01:00.000Z" },
        { state: "in-review", at: "2026-08-23T12:02:00.000Z" },
      ],
      artifact: {
        sourceCssArchitectureVersion: 1,
        buildSha256: "f".repeat(64),
        checks: realChecks,
      },
    });
    const run = {
      ...pageIrBuildRun,
      evidenceWorkflow: { currentStage: "build", artifacts: [visualQa] },
    } as unknown as RunState;

    const html = renderToStaticMarkup(
      <EvidenceWorkspace
        initialRun={run}
        initialPageIrSourceReview={sourceReview("approved")}
      />
    );

    expect(html).toContain("Human visual review");
    expect(html).toContain("Brief fidelity");
    expect(html).toContain("Source Bundle approved by Devin");
    expect(html).not.toContain("Begin named human review");
    expect(html).not.toContain("Approve PageIR Source Bundle");
    expect(html).not.toContain("Reject Source Bundle");
  });

  it("keeps an approved Source Bundle active while visual QA is only the pending placeholder", () => {
    const pendingChecks = (
      ["desktop", "tablet", "mobile", "hover", "focus", "color-scheme", "reduced-motion"] as const
    ).map((area) => ({
      area,
      status: "pending" as const,
      ...(["desktop", "tablet", "mobile"].includes(area)
        ? { evidencePath: `evidence/qa/pending-${area}.png` }
        : {}),
    }));
    const placeholder = WorkflowArtifactVersionSchema.parse({
      version: 1,
      createdAt: "2026-08-23T12:01:00.000Z",
      artifactType: "visual-qa",
      approvalTransitions: [
        { state: "draft", at: "2026-08-23T12:01:00.000Z" },
      ],
      artifact: {
        sourceCssArchitectureVersion: 1,
        buildSha256: "f".repeat(64),
        checks: pendingChecks,
      },
    });
    const run = {
      ...pageIrBuildRun,
      evidenceWorkflow: { currentStage: "build", artifacts: [placeholder] },
    } as unknown as RunState;

    const html = renderToStaticMarkup(
      <EvidenceWorkspace
        initialRun={run}
        initialPageIrSourceReview={sourceReview("approved")}
      />
    );

    expect(html).toContain("Reviewed by Devin");
    expect(html).toContain('href="/?run=page-ir-run"');
    expect(html).not.toContain("Submit for review");
    expect(html).not.toContain("Human visual review");
  });

  it("blocks rejected and superseded bundles without approve or resume actions", () => {
    for (const state of ["rejected", "superseded"] as const) {
      const html = renderToStaticMarkup(
        <EvidenceWorkspace initialRun={pageIrBuildRun} initialPageIrSourceReview={sourceReview(state)} />
      );
      expect(html).toContain("Start a new run");
      expect(html).not.toContain("Approve PageIR Source Bundle");
      expect(html).not.toContain("Resume generation");
      expect(html).not.toContain('href="/?run=page-ir-run"');
    }
  });

  it("preserves template markup exactly when the additive projection is null", () => {
    const templateRun = { ...pageIrBuildRun, layoutAuthority: "template-v1" } as RunState;
    const before = renderToStaticMarkup(<EvidenceWorkspace initialRun={templateRun} />);
    const after = renderToStaticMarkup(
      <EvidenceWorkspace initialRun={templateRun} initialPageIrSourceReview={null} />
    );
    expect(after).toBe(before);
    expect(after).not.toContain("PageIR Source Bundle");
  });
});

// ENG-009: crawlSite and capture() record ABSOLUTE filesystem paths in the
// scan artifact, and rendering one as a URL produced /api/sites/<id>//Users/…
// and a 404. Existing runs still hold absolute values on disk, so the URL
// builder must normalise all three shapes, not trust its input.
describe("artifactUrl", () => {
  it("passes a run-relative path through", () => {
    expect(artifactUrl("run-1", "research/acme-com/desktop.png")).toBe(
      "/api/sites/run-1/research/acme-com/desktop.png"
    );
  });

  it("strips the site/ prefix the site route serves from its own root", () => {
    expect(artifactUrl("run-1", "site/tokens.css")).toBe("/api/sites/run-1/tokens.css");
  });

  it("recovers the run-relative path from a recorded absolute path", () => {
    expect(
      artifactUrl(
        "run-1",
        "/Users/someone/projects/one-box/sites/run-1/research/acme-com/acme-com.md"
      )
    ).toBe("/api/sites/run-1/research/acme-com/acme-com.md");
  });
});
