import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  QUALITY_CORPUS_FIXTURE_IDS,
  compilePageIrQualityFixture,
  evaluatePageIrQualityStructure,
  loadPageIrQualityCorpus,
  materializePageIrQualityFixture,
  pageIrQualityTopologyFingerprint,
} from "./test-fixtures/pageIrQualityCorpus";

const EXPECTED_IDS = [
  "brochure-local-service",
  "portfolio-showcase",
  "saas-marketing",
  "editorial-index",
  "campaign-landing",
  "institutional-presence",
] as const;

describe("Page IR quality corpus", () => {
  it("loads the exact six closed, hash-bound synthetic fixtures", async () => {
    expect(QUALITY_CORPUS_FIXTURE_IDS).toEqual(EXPECTED_IDS);
    const corpus = await loadPageIrQualityCorpus();
    expect(corpus.map((fixture) => fixture.id)).toEqual(EXPECTED_IDS);
    for (const fixture of corpus) {
      expect(fixture.fixtureSourceKind).toBe("synthetic-evaluation");
      expect(fixture.customerApproval).toBe("not-applicable");
      expect(fixture.sourceFiles.map((source) => source.path)).toEqual([
        "brief.json",
        "page-ir.json",
      ]);
      for (const source of fixture.sourceFiles) {
        expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(source.bytes.byteLength).toBeGreaterThan(0);
      }
    }
  });

  it("defines purpose structure, conversion, responsive checks, and both reference states without pixel prescriptions", async () => {
    const corpus = await loadPageIrQualityCorpus();
    expect(new Set(corpus.map((fixture) => fixture.brief.referenceState.mode))).toEqual(
      new Set(["selected", "explicit-none"]),
    );
    for (const fixture of corpus) {
      expect(fixture.brief.expectedSectionIds.length).toBeGreaterThan(0);
      expect(fixture.brief.primaryConversion.label).toBeTruthy();
      expect(fixture.brief.primaryConversion.targetNodeId).toBeTruthy();
      expect(fixture.brief.viewports).toEqual([
        { id: "desktop", width: 1440, height: 900 },
        { id: "tablet", width: 768, height: 1024 },
        { id: "mobile", width: 390, height: 844 },
      ]);
      expect(JSON.stringify(fixture.brief)).not.toMatch(
        /"(?:fontSize|lineHeight|margin|padding|borderRadius|hex|pixelWidth|pixelHeight)"/i,
      );
      expect(evaluatePageIrQualityStructure(fixture)).toEqual([]);
    }
  });

  it("rejects drift in the frozen conversion label and selected reference aliases", async () => {
    const campaign = (await loadPageIrQualityCorpus()).find(
      (fixture) => fixture.id === "campaign-landing",
    )!;
    const wrongLabel = structuredClone(campaign);
    const label = wrongLabel.pageIr.content.find(
      (entry) => entry.id === "conversion-label" && entry.kind === "text",
    );
    if (!label || label.kind !== "text") throw new Error("campaign label fixture missing");
    label.text = "Different action";
    expect(evaluatePageIrQualityStructure(wrongLabel)).toContain(
      "primary-conversion-label-mismatch",
    );

    const wrongReference = structuredClone(campaign);
    if (wrongReference.pageIr.referenceContract.selection.mode !== "selected") {
      throw new Error("campaign selected reference fixture missing");
    }
    wrongReference.pageIr.referenceContract.selection.sources[0].id = "ref-other";
    expect(evaluatePageIrQualityStructure(wrongReference)).toContain(
      "reference-source-mismatch",
    );
  });

  it("automatically rejects brochure/local-service topology for every non-brochure purpose", async () => {
    const corpus = await loadPageIrQualityCorpus();
    const brochure = corpus[0];
    for (const fixture of corpus.slice(1)) {
      const restyled = {
        ...fixture,
        pageIr: {
          ...fixture.pageIr,
          layoutProgram: brochure.pageIr.layoutProgram,
        },
      };
      expect(evaluatePageIrQualityStructure(restyled)).toContain(
        "restyled-local-service-topology",
      );
    }
  });

  it("freezes a distinct semantic topology for every supported purpose", async () => {
    const corpus = await loadPageIrQualityCorpus();
    const fingerprints = corpus.map((fixture) =>
      pageIrQualityTopologyFingerprint(fixture.pageIr)
    );
    expect(new Set(fingerprints).size).toBe(corpus.length);
  });

  it("rejects a brochure skeleton even when every layout node ID is renamed", async () => {
    const corpus = await loadPageIrQualityCorpus();
    const brochure = corpus[0];
    const ids = new Map(
      brochure.pageIr.layoutProgram.nodes.map((node, index) => [node.id, `renamed-${index}`]),
    );
    const renamedPageIr = {
      ...brochure.pageIr,
      layoutProgram: {
        ...brochure.pageIr.layoutProgram,
        rootNodeId: ids.get(brochure.pageIr.layoutProgram.rootNodeId)!,
        nodes: brochure.pageIr.layoutProgram.nodes.map((node) => node.kind === "slot"
          ? { ...node, id: ids.get(node.id)! }
          : {
              ...node,
              id: ids.get(node.id)!,
              childIds: node.childIds.map((childId) => ids.get(childId)!),
            }),
      },
      actions: brochure.pageIr.actions.map((action) => action.kind === "scroll-to"
        ? { ...action, targetNodeId: ids.get(action.targetNodeId)! }
        : action),
      slotBindings: brochure.pageIr.slotBindings.map((binding) => ({
        ...binding,
        nodeId: ids.get(binding.nodeId)!,
      })),
      nodeTokenBindings: brochure.pageIr.nodeTokenBindings.map((binding) => ({
        ...binding,
        nodeId: ids.get(binding.nodeId)!,
      })),
      accessibility: {
        ...brochure.pageIr.accessibility,
        navigationNodeId: ids.get(brochure.pageIr.accessibility.navigationNodeId)!,
        mainNodeId: ids.get(brochure.pageIr.accessibility.mainNodeId)!,
        skipToNodeId: ids.get(brochure.pageIr.accessibility.skipToNodeId)!,
      },
    };
    expect(pageIrQualityTopologyFingerprint(renamedPageIr)).toBe(
      pageIrQualityTopologyFingerprint(brochure.pageIr),
    );
    for (const fixture of corpus.slice(1)) {
      expect(evaluatePageIrQualityStructure({ ...fixture, pageIr: renamedPageIr })).toContain(
        "restyled-local-service-topology",
      );
    }
  });

  it("produces byte-identical compiler output across ten clean compiles per fixture", async () => {
    const corpus = await loadPageIrQualityCorpus();
    for (const fixture of corpus) {
      const results = Array.from({ length: 10 }, () =>
        compilePageIrQualityFixture(fixture),
      );
      expect(new Set(results.map((result) => result.manifest.buildSha256)).size).toBe(1);
      expect(new Set(results.map((result) => Buffer.from(result.manifestBytes).toString("hex"))).size).toBe(1);
      expect(new Set(results.flatMap((result) => result.files.map((file) => `${file.path}:${Buffer.from(file.bytes).toString("hex")}`))).size)
        .toBe(results[0].files.length);
    }
  });

  it("matches every compiler output to the build hash frozen in the harness registry", async () => {
    const registry = JSON.parse(await readFile(path.join(
      process.cwd(),
      "docs/eval/page-ir-safe-pipeline/harness-registry.json",
    ), "utf8")) as {
      fixtureContract: { buildSha256ByPurpose: Record<string, string> };
    };
    const corpus = await loadPageIrQualityCorpus();
    expect(Object.keys(registry.fixtureContract.buildSha256ByPurpose)).toEqual(EXPECTED_IDS);
    for (const fixture of corpus) {
      expect(compilePageIrQualityFixture(fixture).manifest.buildSha256).toBe(
        registry.fixtureContract.buildSha256ByPurpose[fixture.id],
      );
    }
  });

  it("materializes the literal fixture Page IR into a runnable static site", async () => {
    const siteRoot = await mkdtemp(path.join(tmpdir(), "onebox-quality-corpus-"));
    const result = await materializePageIrQualityFixture(
      "campaign-landing",
      siteRoot,
    );
    expect(result.siteRoot).toBe(siteRoot);
    expect(result.fixture.brief.expectedCoreSelectors).toContain("main");
    expect(await readFile(path.join(siteRoot, "index.html"), "utf8")).toContain(
      'data-edit-id="campaign-hero"',
    );
    expect(await readFile(path.join(siteRoot, "site.css"), "utf8")).toContain(
      "prefers-reduced-motion",
    );
  });
});
