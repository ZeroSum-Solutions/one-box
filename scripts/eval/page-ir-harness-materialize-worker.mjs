import path from "node:path";
import { createServer } from "vite";

const [fixtureId, outputRoot, fixturesRoot] = process.argv.slice(2);
if (!fixtureId || !outputRoot || !fixturesRoot || !path.isAbsolute(outputRoot) || !path.isAbsolute(fixturesRoot)) {
  throw new Error("usage: page-ir-harness-materialize-worker.mjs <fixture> <absolute-output> <absolute-fixtures-root>");
}

const vite = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
try {
  const corpus = await vite.ssrLoadModule("/src/lib/test-fixtures/pageIrQualityCorpus.ts");
  const result = await corpus.materializePageIrQualityFixture(fixtureId, outputRoot, fixturesRoot);
  process.stdout.write(`${JSON.stringify({
    fixtureId,
    buildSha256: result.compilation.manifest.buildSha256,
    outputRoot,
  })}\n`);
} finally {
  await vite.close();
}
