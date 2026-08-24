import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PageIrEditRequestV1Schema,
  PageIrMutationUnsupportedError,
  applyPageIrMutationsToEnvelope,
  pageIrMutationsFromElementPatch,
} from "./pageIrMutation";
import { pageIrSha256 } from "./pageIrHash";
import { compilerPageIr } from "./test-fixtures/pageIrCompilerFixtures";
import { PAGE_IR_DERIVATION_KINDS } from "./contracts";
import type {
  PageIrDerivationKind,
  PageIrEditorSourceMapV1,
  PersistedPageIrV1,
} from "./contracts";
import { writePageIrFallbackAssetsUnderSiteAuthority } from "./pageIrAssets";
import { createRun, sitePaths } from "./runstate";
import { withSiteAuthorityLock } from "./siteAuthority";

const HASH = "a".repeat(64);

function persistedFixture(): PersistedPageIrV1 {
  const pageIr = compilerPageIr();
  return {
    schemaVersion: 1,
    runId: "page-ir-edit-unit",
    revision: 1,
    pageIr,
    pageIrSha256: pageIrSha256(pageIr),
    bindingSetSha256: HASH,
    lineage: {
      schemaVersion: 1,
      runId: "page-ir-edit-unit",
      purpose: "brochure-local-service",
      sources: PAGE_IR_DERIVATION_KINDS.map((kind, index) => ({
        kind: kind as PageIrDerivationKind,
        version: index + 1,
        sha256: createHash("sha256").update(kind).digest("hex"),
      })),
      referenceTrace: { mode: "explicit-none", sources: [] },
    },
  };
}

function sourceMapFor(envelope: PersistedPageIrV1): PageIrEditorSourceMapV1 {
  return {
    schemaVersion: 1,
    pageIrSha256: envelope.pageIrSha256,
    bindingSetSha256: envelope.bindingSetSha256,
    lineage: envelope.lineage,
    entries: envelope.pageIr.layoutProgram.nodes
      .map((node) => ({ editId: node.id, nodeId: node.id }))
      .sort((left, right) => left.editId.localeCompare(right.editId)),
  };
}

describe("typed Page IR editor mutations", () => {
  it("rejects arbitrary and duplicate fallback asset authority targets", async () => {
    const runId = `asset-path-${process.pid}`;
    await createRun({ id: runId, pipelineVersion: "legacy-v1" });
    const root = sitePaths(runId).root;
    try {
      await expect(withSiteAuthorityLock(runId, () =>
        writePageIrFallbackAssetsUnderSiteAuthority(runId, [{
          path: path.join(root, "page-ir.json"),
          bytes: Buffer.from("overwrite"),
        }])
      )).rejects.toThrow(/closed deterministic namespace/i);
      const valid = path.join(root, "uploads", "page-ir-edit-assets", "hero-aaaaaaaaaaaa.png");
      await expect(withSiteAuthorityLock(runId, () =>
        writePageIrFallbackAssetsUnderSiteAuthority(runId, [
          { path: valid, bytes: Buffer.from("same") },
          { path: valid, bytes: Buffer.from("same") },
        ])
      )).rejects.toThrow(/unique/i);
      await expect(fs.stat(path.join(root, "page-ir.json"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(fs.stat(valid)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("accepts only the strict versioned closed request", () => {
    expect(
      PageIrEditRequestV1Schema.parse({
        schemaVersion: 1,
        runId: "page-ir-edit-unit",
        mutations: [
          { kind: "replace-text", editId: "intro-text", text: "New copy" },
        ],
      }),
    ).toEqual({
      schemaVersion: 1,
      runId: "page-ir-edit-unit",
      mutations: [
        { kind: "replace-text", editId: "intro-text", text: "New copy" },
      ],
    });
    expect(
      PageIrEditRequestV1Schema.safeParse({
        schemaVersion: 2,
        runId: "page-ir-edit-unit",
        mutations: [{ kind: "raw-html", editId: "intro-text", html: "x" }],
      }).success,
    ).toBe(false);
  });

  it("updates validated content, destinations, and sibling order with exact inverses", () => {
    const before = persistedFixture();
    const sourceMap = sourceMapFor(before);
    const result = applyPageIrMutationsToEnvelope(before, sourceMap, [
      { kind: "replace-text", editId: "intro-text", text: "Trusted new copy" },
      {
        kind: "set-destination",
        editId: "nav-external",
        href: "https://openai.com/research",
      },
      { kind: "move-sibling", editId: "intro-text", direction: "next" },
    ]);

    expect(result.envelope.revision).toBe(2);
    expect(result.envelope.pageIrSha256).not.toBe(before.pageIrSha256);
    expect(
      result.envelope.pageIr.content.find((entry) => entry.id === "intro-copy"),
    ).toMatchObject({ text: "Trusted new copy" });
    expect(
      result.envelope.pageIr.actions.find(
        (action) => action.id === "external-proof",
      ),
    ).toEqual({
      id: "external-proof",
      kind: "external",
      href: "https://openai.com/research",
    });
    const hero = result.envelope.pageIr.layoutProgram.nodes.find(
      (node) => node.id === "hero",
    );
    expect(hero && "childIds" in hero ? hero.childIds.slice(0, 3) : []).toEqual([
      "page-h1",
      "hero-media",
      "intro-text",
    ]);
    expect(before.pageIr.content.find((entry) => entry.id === "intro-copy")).toMatchObject({
      text: "Safe <b>text</b> & honest copy",
    });

    const restored = applyPageIrMutationsToEnvelope(
      result.envelope,
      { ...sourceMap, pageIrSha256: result.envelope.pageIrSha256 },
      result.inverse,
    );
    expect(restored.envelope.pageIr).toEqual(before.pageIr);
  });

  it("maps supported structured patches and rejects unrepresented capabilities", () => {
    expect(
      pageIrMutationsFromElementPatch("primary-action", {
        text: "Talk to us",
        href: "tel:+15550100400",
      }),
    ).toEqual([
      { kind: "replace-text", editId: "primary-action", text: "Talk to us" },
      {
        kind: "set-destination",
        editId: "primary-action",
        href: "tel:+15550100400",
      },
    ]);
    expect(() =>
      pageIrMutationsFromElementPatch("intro-text", {
        typography: { alignment: "center" },
      }),
    ).toThrow(PageIrMutationUnsupportedError);
    expect(() =>
      pageIrMutationsFromElementPatch("primary-action", {
        buttonAction: { type: "submit" },
      }),
    ).toThrow(/not represented/i);
  });
});
