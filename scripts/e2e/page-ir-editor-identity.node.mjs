import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { chromium } from "playwright";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const { compilePageIRV1 } = await import("../../src/lib/pageIrCompiler.ts");
const { COMPILER_PURPOSE_SECTIONS, compilerRequest } = await import(
  "../../src/lib/test-fixtures/pageIrCompilerFixtures.ts"
);

const VIEWPORT_WIDTHS = [1440, 768, 390];
const CLEAN_COMPILES_PER_PURPOSE = 10;
const decoder = new TextDecoder();

function compiledText(compilation, path) {
  const file = compilation.files.find((candidate) => candidate.path === path);
  assert.ok(file, `compiler did not emit ${path}`);
  return decoder.decode(file.bytes);
}

function expectedIdentityEntries(pageIr) {
  return pageIr.layoutProgram.nodes
    .map((node) => node.id)
    .sort()
    .map((nodeId) => ({ editId: nodeId, nodeId }));
}

async function renderedIdentity(page) {
  return page.locator("[data-edit-id]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-edit-id")),
  );
}

function assertIdentityBijection(renderedIds, expectedEntries, context) {
  assert.ok(renderedIds.every((editId) => typeof editId === "string" && editId.length > 0));
  const expectedIds = expectedEntries.map((entry) => entry.editId);
  const expectedSet = new Set(expectedIds);
  const counts = new Map();
  for (const editId of renderedIds) counts.set(editId, (counts.get(editId) ?? 0) + 1);

  const duplicates = [...counts]
    .filter(([, count]) => count !== 1)
    .map(([editId]) => editId)
    .sort();
  const unmapped = [...counts.keys()].filter((editId) => !expectedSet.has(editId)).sort();
  const missing = expectedIds.filter((editId) => !counts.has(editId));

  assert.deepEqual(duplicates, [], `${context}: duplicate rendered editor IDs`);
  assert.deepEqual(unmapped, [], `${context}: rendered IDs without PageIR nodes`);
  assert.deepEqual(missing, [], `${context}: PageIR nodes without rendered IDs`);
  assert.equal(renderedIds.length, expectedEntries.length, `${context}: rendered identity count`);

  return [...renderedIds]
    .sort()
    .map((nodeId) => ({ editId: nodeId, nodeId }));
}

test("EVAL-COMP-002: PageIR editor identity survives clean compiles and responsive rendering", {
  timeout: 120_000,
}, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();

  for (const purpose of Object.keys(COMPILER_PURPOSE_SECTIONS)) {
    let firstCompileEntries;
    for (let compileIndex = 0; compileIndex < CLEAN_COMPILES_PER_PURPOSE; compileIndex += 1) {
      const request = compilerRequest(purpose);
      const compilation = compilePageIRV1(request);
      const expectedEntries = expectedIdentityEntries(request.pageIr);
      const compileContext = `${purpose} compile ${compileIndex + 1}`;

      assert.deepEqual(
        compilation.editorIdentityEntries,
        expectedEntries,
        `${compileContext}: compiler identity coverage`,
      );
      if (firstCompileEntries === undefined) firstCompileEntries = expectedEntries;
      assert.deepEqual(expectedEntries, firstCompileEntries, `${compileContext}: compile-stable identity`);

      const html = compiledText(compilation, "index.html");
      const styles = [
        compiledText(compilation, "tokens.css"),
        compiledText(compilation, "site.css"),
      ];
      let firstViewportMapping;
      for (const width of VIEWPORT_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        for (const content of styles) await page.addStyleTag({ content });

        const context = `${compileContext} at ${width}px`;
        const mapping = assertIdentityBijection(
          await renderedIdentity(page),
          expectedEntries,
          context,
        );
        assert.deepEqual(mapping, expectedEntries, `${context}: PageIR-derived mapping`);
        if (firstViewportMapping === undefined) firstViewportMapping = mapping;
        assert.deepEqual(mapping, firstViewportMapping, `${context}: viewport-stable mapping`);
      }
    }
  }
});
