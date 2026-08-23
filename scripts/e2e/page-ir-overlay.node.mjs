import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
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
const { compilerRequest } = await import(
  "../../src/lib/test-fixtures/pageIrCompilerFixtures.ts"
);

const repository = path.resolve(import.meta.dirname, "../..");

async function nextEditorState(page, action) {
  const priorCount = await page.evaluate(() => window.__oneboxCaptured.length);
  await action();
  await page.waitForFunction(
    (count) => window.__oneboxCaptured.length > count,
    priorCount,
  );
  return page.evaluate(() => window.__oneboxCaptured.at(-1));
}

async function command(page, action, editId) {
  return nextEditorState(page, () =>
    page.evaluate(
      ({ commandAction, commandEditId }) => {
        window.postMessage(
          {
            type: "onebox-editor-command",
            action: commandAction,
            editId: commandEditId,
          },
          "*",
        );
      },
      { commandAction: action, commandEditId: editId },
    ),
  );
}

test("compiled PageIR identity navigates leaf to document and back through the overlay", async (t) => {
  const request = compilerRequest();
  const compilation = compilePageIRV1(request);
  const indexFile = compilation.files.find((file) => file.path === "index.html");
  assert.ok(indexFile, "compiler did not emit index.html");

  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(new TextDecoder().decode(indexFile.bytes));
  await page.evaluate(() => {
    window.__oneboxCaptured = [];
    window.addEventListener("message", (event) => {
      if (event.data?.type === "onebox-editor-state") {
        window.__oneboxCaptured.push(event.data);
      }
    });
  });
  await page.addScriptTag({ path: path.join(repository, "public/overlay.js") });

  const compiledIds = await page.locator("[data-edit-id]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-edit-id")),
  );
  for (const expectedId of ["page-h1", "hero", "main", "document"]) {
    assert.ok(compiledIds.includes(expectedId), `compiled DOM is missing PageIR id ${expectedId}`);
  }

  const leaf = await nextEditorState(page, () =>
    page.locator('[data-edit-id="page-h1"]').dispatchEvent("click"),
  );
  assert.equal(leaf.selection.editId, "page-h1");
  assert.deepEqual(leaf.selection.parentChain, ["hero", "main", "document"]);

  for (const expectedId of ["hero", "main", "document"]) {
    const state = await command(page, "select-parent");
    assert.equal(state.selection.editId, expectedId);
    assert.equal(state.selection.behavior, "container");
  }
  assert.equal(await page.locator("body").getAttribute("contenteditable"), null);

  for (const expectedId of ["main", "hero", "page-h1"]) {
    const state = await command(page, "step-back");
    assert.equal(state.selection.editId, expectedId);
  }

  for (const expectedId of ["main", "document"]) {
    const state = await command(page, "select-by-id", expectedId);
    assert.equal(state.selection.editId, expectedId);
    assert.ok(compiledIds.includes(state.selection.editId));
  }
});
