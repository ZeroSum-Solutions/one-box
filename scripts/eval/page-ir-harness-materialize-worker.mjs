import path from "node:path";
import { runnerImport } from "vite";

const [fixtureId, outputRoot, fixturesRoot] = process.argv.slice(2);
if (!fixtureId || !outputRoot || !fixturesRoot || !path.isAbsolute(outputRoot) || !path.isAbsolute(fixturesRoot)) {
  throw new Error("usage: page-ir-harness-materialize-worker.mjs <fixture> <absolute-output> <absolute-fixtures-root>");
}

const { module: corpus } = await runnerImport("./src/lib/test-fixtures/pageIrQualityCorpus.ts", {
  root: process.cwd(),
  logLevel: "silent",
});
const result = await corpus.materializePageIrQualityFixture(fixtureId, outputRoot, fixturesRoot);
process.stdout.write(`${JSON.stringify({
  fixtureId,
  buildSha256: result.compilation.manifest.buildSha256,
  outputRoot,
})}\n`);
