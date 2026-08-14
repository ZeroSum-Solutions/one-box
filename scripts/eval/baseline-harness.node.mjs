import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assembleBlindPacket,
  prepareRun,
  scoreTemplate,
  seededOrder,
  sha256,
  unblind,
  validateCompletedArtifacts,
  validateHumanScores,
  verifyContract,
} from "./baseline-harness.mjs";

const REPOSITORY = path.resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = "docs/eval/baseline/evaluation-contract-v1.json";
const LOCK_PATH = "docs/eval/baseline/evaluation-contract-v1.lock.json";

async function temporaryRepository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-eval-"));
  const copy = async (relativePath) => {
    const target = path.join(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(REPOSITORY, relativePath), target);
  };
  await Promise.all([
    copy(CONTRACT_PATH),
    copy(LOCK_PATH),
    copy("docs/eval/baseline/brief-v1.json"),
    copy("docs/eval/baseline/rubric-v1.md"),
  ]);
  return root;
}

async function writeCompletedArtifacts(root, runId, manifestHash) {
  const contract = JSON.parse(await fs.readFile(path.join(root, CONTRACT_PATH), "utf8"));
  for (const pathDefinition of contract.paths) {
    const output = path.join(root, "docs/eval/baseline/runs", runId, "artifacts", pathDefinition.id);
    await fs.mkdir(output, { recursive: true });
    for (const artifact of contract.requiredArtifacts) {
      if (artifact !== "provenance.json") await fs.writeFile(path.join(output, artifact), `${artifact}\n`);
    }
    await fs.writeFile(path.join(output, "provenance.json"), JSON.stringify({
      pathId: pathDefinition.id,
      status: "completed",
      runManifestSha256: manifestHash,
      prompts: ["frozen prompt"],
      models: ["recorded by approved runner"],
      toolCalls: [],
      sources: [],
      outputHashes: [],
      meteredCalls: [],
    }));
  }
}

test("the committed frozen contract, hashes, and rubric are valid", async () => {
  const result = await verifyContract(REPOSITORY);
  assert.deepEqual(result.errors, []);
  assert.match(result.contractSha256, /^[a-f0-9]{64}$/);
});

test("presentation order is reproducible for a seed and does not mutate inputs", () => {
  const paths = ["path-a", "path-b"];
  assert.deepEqual(seededOrder("blind-seed", paths), seededOrder("blind-seed", paths));
  assert.deepEqual(paths, ["path-a", "path-b"]);
});

test("offline preparation creates a blocked run without live results", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const run = await prepareRun({ root, runId: "fixture-v1", seed: "blind-seed", createdAt: "2026-08-13T00:00:00.000Z" });
  assert.equal(run.manifest.status, "BLOCKED");
  assert.equal(run.manifest.provenance.providerCalls, 0);
  assert.equal(run.manifest.provenance.credentialsRead, false);
  const checked = await validateCompletedArtifacts({ root, runId: "fixture-v1" });
  assert.ok(checked.errors.some((error) => error.includes("missing required artifact")));
});

test("changed frozen inputs are rejected by their SHA-256 contract", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.appendFile(path.join(root, "docs/eval/baseline/brief-v1.json"), "\n");
  const result = await verifyContract(root);
  assert.ok(result.errors.includes("input hash mismatch: docs/eval/baseline/brief-v1.json"));
});

test("completed provenance plus full human scores are required before unblinding", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const run = await prepareRun({ root, runId: "fixture-v2", seed: "blind-seed", createdAt: "2026-08-13T00:00:00.000Z" });
  await writeCompletedArtifacts(root, "fixture-v2", run.manifestHash);
  const packet = await assembleBlindPacket({ root, runId: "fixture-v2" });
  assert.equal(packet.status, "READY_FOR_HUMAN_BLIND_SCORING");
  const template = scoreTemplate({
    runId: "fixture-v2",
    blindIds: packet.artifacts.map((artifact) => artifact.blindId),
    rubricAreas: (await verifyContract(root)).contract.requiredRubricAreas,
    runManifestSha256: run.manifestHash,
  });
  assert.ok(validateHumanScores(template, {
    runId: "fixture-v2",
    blindIds: packet.artifacts.map((artifact) => artifact.blindId),
    rubricAreas: (await verifyContract(root)).contract.requiredRubricAreas,
    runManifestSha256: run.manifestHash,
  }).length > 0);
  template.evaluator = {
    name: "Human evaluator",
    scoredAt: "2026-08-13T01:00:00.000Z",
    attestation: "I scored these blinded artifacts before seeing the producer mapping.",
  };
  for (const entry of template.scores) {
    for (const area of Object.values(entry.areas)) {
      area.score = 3;
      area.evidence = "rendered artifact evidence";
    }
  }
  const scoreFile = path.join(root, "completed-scores.json");
  await fs.writeFile(scoreFile, `${JSON.stringify(template)}\n`);
  const result = await unblind({ root, runId: "fixture-v2", scoresFile: scoreFile });
  assert.equal(result.status, "UNBLINDED_HUMAN_SCORES_RECORDED");
  assert.equal(result.results.length, 2);
  assert.equal(result.scoreSha256, sha256(await fs.readFile(scoreFile)));
});

test("blind packet rejects provider identity leaked outside coordinator provenance", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const run = await prepareRun({ root, runId: "fixture-v3", seed: "blind-seed", createdAt: "2026-08-13T00:00:00.000Z" });
  await writeCompletedArtifacts(root, "fixture-v3", run.manifestHash);
  await fs.writeFile(path.join(root, "docs/eval/baseline/runs/fixture-v3/artifacts/path-a/research.json"), "direct Refero MCP result");
  await assert.rejects(assembleBlindPacket({ root, runId: "fixture-v3" }), /leaks blinded producer identity/);
});
