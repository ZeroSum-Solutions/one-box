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
const { COMPILER_PURPOSE_SECTIONS, compilerRequest } = await import(
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

function assertSelection(state, editId, parentChain) {
  assert.equal(state.selection.editId, editId);
  assert.deepEqual(
    state.selection.parentChain,
    parentChain.length > 0 ? parentChain : undefined,
  );
}

test("every compiled PageIR purpose navigates leaf to document and back through the overlay", async (t) => {
  const browser = await chromium.launch();
  try {
    for (const [purpose, sections] of Object.entries(COMPILER_PURPOSE_SECTIONS)) {
      await t.test(purpose, async () => {
        const firstSection = sections[0];
        const request = compilerRequest(purpose);
        const compilation = compilePageIRV1(request);
        const indexFile = compilation.files.find((file) => file.path === "index.html");
        assert.ok(indexFile, "compiler did not emit index.html");

        const page = await browser.newPage();
        try {
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
          for (const expectedId of ["page-h1", firstSection, "main", "document"]) {
            assert.ok(compiledIds.includes(expectedId), `compiled DOM is missing PageIR id ${expectedId}`);
          }

          const forwardPath = [firstSection, "main", "document"];
          const leaf = await nextEditorState(page, () =>
            page.locator('[data-edit-id="page-h1"]').dispatchEvent("click"),
          );
          assertSelection(leaf, "page-h1", forwardPath);

          for (let index = 0; index < forwardPath.length; index += 1) {
            const state = await command(page, "select-parent");
            assertSelection(state, forwardPath[index], forwardPath.slice(index + 1));
            assert.equal(state.selection.behavior, "container");
          }
          assert.equal(await page.locator("body").getAttribute("contenteditable"), null);

          const backPath = [
            { editId: "main", parentChain: ["document"] },
            { editId: firstSection, parentChain: ["main", "document"] },
            { editId: "page-h1", parentChain: forwardPath },
          ];
          for (const expected of backPath) {
            const state = await command(page, "step-back");
            assertSelection(state, expected.editId, expected.parentChain);
          }

          for (const expected of [
            { editId: "main", parentChain: ["document"] },
            { editId: "document", parentChain: [] },
          ]) {
            const state = await command(page, "select-by-id", expected.editId);
            assertSelection(state, expected.editId, expected.parentChain);
            assert.ok(compiledIds.includes(state.selection.editId));
          }
        } finally {
          await page.close();
        }
      });
    }
  } finally {
    await browser.close();
  }
});
