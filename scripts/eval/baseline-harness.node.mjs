import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assembleBlindPacket,
  prepareRun,
  scoreTemplate,
  sha256,
  unblind,
  validateCompletedArtifacts,
  verifyContract,
} from "./baseline-harness.mjs";

const REPOSITORY = path.resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = "docs/eval/baseline/evaluation-contract-v2.json";
const BASELINE_FILES = [
  CONTRACT_PATH,
  "docs/eval/baseline/evaluation-contract-v2.lock.json",
  "docs/eval/baseline/brief-v2.json",
  "docs/eval/baseline/rubric-v2.md",
];

async function temporaryRepository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-eval-"));
  await Promise.all(BASELINE_FILES.map(async (relativePath) => {
    const target = path.join(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(REPOSITORY, relativePath), target);
  }));
  return root;
}

async function writeCompletedArtifacts(root, runId, manifestHash) {
  const contract = JSON.parse(await fs.readFile(path.join(root, CONTRACT_PATH), "utf8"));
  for (const definition of contract.paths) {
    const output = path.join(root, "docs/eval/baseline/runs", runId, "artifacts", definition.id);
    await fs.mkdir(output, { recursive: true });
    const outputHashes = [];
    for (const artifact of contract.requiredPresentationArtifacts) {
      const bytes = artifact.endsWith(".png") ? pngFixture(artifact) : Buffer.from(`${artifact}\n`);
      await fs.mkdir(path.dirname(path.join(output, artifact)), { recursive: true });
      await fs.writeFile(path.join(output, artifact), bytes);
      outputHashes.push({ path: artifact, sha256: sha256(bytes) });
    }
    await fs.writeFile(path.join(output, "provenance.json"), JSON.stringify({
      pathId: definition.id,
      status: "completed",
      runManifestSha256: manifestHash,
      prompts: ["frozen prompt"],
      models: ["coordinator-only identity"],
      toolCalls: [],
      sources: [],
      outputHashes,
      meteredCalls: [],
    }));
  }
}

function pngFixture(name) {
  const [width, height] = name.includes("desktop") ? [1440, 900] : name.includes("tablet") ? [768, 1024] : [390, 844];
  const ihdr = Buffer.alloc(17);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0, 0, 0, 13]), Buffer.from("IHDR"), ihdr, Buffer.from([0, 0, 0, 0]), Buffer.from("IEND"), Buffer.alloc(4)]);
}

async function readyRun(root, runId = "fixture-v1") {
  const run = await prepareRun({ root, runId, seed: "coordinator-seed", createdAt: "2026-08-13T00:00:00.000Z" });
  await writeCompletedArtifacts(root, runId, run.manifestHash);
  const packet = await assembleBlindPacket({ root, runId });
  return { run, packet };
}

async function listedFiles(directory, relative = "") {
  const listed = [];
  for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) listed.push(...await listedFiles(directory, next));
    else listed.push(next.replaceAll(path.sep, "/"));
  }
  return listed.sort();
}

function completedScores({ run, packet, evaluatorId, evaluatorName, contract, slot }) {
  const scores = scoreTemplate({
    runId: run.manifest.runId,
    blindIds: packet.artifacts.map((artifact) => artifact.blindId),
    rubricAreas: contract.requiredRubricAreas,
    runManifestSha256: run.manifestHash,
    presentationPacketSha256: packet.packetSha256,
    evaluatorSlot: slot,
  });
  scores.evaluator = {
    id: evaluatorId,
    name: evaluatorName,
    scoredAt: "2026-08-13T01:00:00.000Z",
    attestation: "Independent blind score completed.",
  };
  for (const entry of scores.scores) {
    for (const area of Object.values(entry.areas)) {
      area.score = 3;
      area.evidence = "artifact evidence";
    }
  }
  return scores;
}

test("committed frozen contract, input hashes, rubric, and artifact lists agree", async () => {
  assert.deepEqual((await verifyContract(REPOSITORY)).errors, []);
});

test("prepare is atomic under a race and keeps the seed coordinator-side", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const settled = await Promise.allSettled([
    prepareRun({ root, runId: "race-v2", seed: "secret-seed", createdAt: "2026-08-13T00:00:00.000Z" }),
    prepareRun({ root, runId: "race-v2", seed: "secret-seed", createdAt: "2026-08-13T00:00:00.000Z" }),
  ]);
  assert.equal(settled.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(settled.filter((entry) => entry.status === "rejected").length, 1);
  const manifest = await fs.readFile(path.join(root, "docs/eval/baseline/runs/race-v2/run-manifest.json"), "utf8");
  assert.doesNotMatch(manifest, /secret-seed/);
  assert.match(manifest, new RegExp(sha256("secret-seed")));
  await fs.mkdir(path.join(root, "docs/eval/baseline/runs/preexisting"));
  await assert.rejects(prepareRun({ root, runId: "preexisting", seed: "seed" }), /already exists and is immutable/);
});

test("provenance rejects missing and mismatched artifact hashes", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const run = await prepareRun({ root, runId: "hash-v1", seed: "seed" });
  await writeCompletedArtifacts(root, "hash-v1", run.manifestHash);
  const file = path.join(root, "docs/eval/baseline/runs/hash-v1/artifacts/path-a/DESIGN.md");
  await fs.writeFile(file, "changed\n");
  const checked = await validateCompletedArtifacts({ root, runId: "hash-v1" });
  assert.ok(checked.errors.some((error) => error.includes("output hash mismatch: DESIGN.md")));
});

test("v2 requires evaluator-visible built site files and all three screenshots", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const run = await prepareRun({ root, runId: "missing-v2", seed: "seed" });
  await writeCompletedArtifacts(root, "missing-v2", run.manifestHash);
  await fs.rm(path.join(root, "docs/eval/baseline/runs/missing-v2/artifacts/path-a/screenshots/mobile.png"));
  const checked = await validateCompletedArtifacts({ root, runId: "missing-v2" });
  assert.ok(checked.errors.some((error) => error.includes("mobile.png is unreadable")));
  await writeCompletedArtifacts(root, "missing-v2", run.manifestHash);
  await fs.rm(path.join(root, "docs/eval/baseline/runs/missing-v2/artifacts/path-b/site/index.html"));
  const missingSite = await validateCompletedArtifacts({ root, runId: "missing-v2" });
  assert.ok(missingSite.errors.some((error) => error.includes("site/index.html is unreadable")));
});

test("blind assembly rejects leaks and symlinks and copies no extra files", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const run = await prepareRun({ root, runId: "blind-v1", seed: "seed" });
  await writeCompletedArtifacts(root, "blind-v1", run.manifestHash);
  const base = path.join(root, "docs/eval/baseline/runs/blind-v1/artifacts/path-a");
  await fs.writeFile(path.join(base, "extra.txt"), "must not copy");
  const target = path.join(base, "DESIGN.md");
  await fs.writeFile(path.join(base, "real-design.md"), "safe\n");
  await fs.rm(target);
  await fs.symlink("real-design.md", target);
  await assert.rejects(assembleBlindPacket({ root, runId: "blind-v1" }), /regular non-symlink/);

  await fs.rm(target);
  const leak = Buffer.from("R.e.f.e.r.o producer");
  await fs.writeFile(target, leak);
  const provenanceFile = path.join(base, "provenance.json");
  const provenance = JSON.parse(await fs.readFile(provenanceFile, "utf8"));
  provenance.outputHashes.find((entry) => entry.path === "DESIGN.md").sha256 = sha256(leak);
  await fs.writeFile(provenanceFile, JSON.stringify(provenance));
  await assert.rejects(assembleBlindPacket({ root, runId: "blind-v1" }), /leaks blinded identity/);
});

test("blind assembly copies exactly the required allowlist", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const run = await prepareRun({ root, runId: "allowlist-v1", seed: "seed" });
  await writeCompletedArtifacts(root, "allowlist-v1", run.manifestHash);
  await fs.writeFile(path.join(root, "docs/eval/baseline/runs/allowlist-v1/artifacts/path-a/extra.txt"), "not presented");
  const packet = await assembleBlindPacket({ root, runId: "allowlist-v1" });
  for (const artifact of packet.artifacts) {
    const entries = await listedFiles(path.join(root, "docs/eval/baseline/runs/allowlist-v1/presentation", artifact.blindId));
    assert.deepEqual(entries, artifact.files.map((entry) => entry.path).sort());
    assert.ok(!entries.includes("extra.txt"));
  }
});

test("unblind requires the current packet and two distinct evaluators, then cannot overwrite", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const { run, packet } = await readyRun(root, "scores-v1");
  const contract = (await verifyContract(root)).contract;
  const first = completedScores({ run, packet, evaluatorId: "human-1", evaluatorName: "First Human", contract, slot: 1 });
  const second = completedScores({ run, packet, evaluatorId: "human-2", evaluatorName: "Second Human", contract, slot: 2 });
  const firstFile = path.join(root, "score-1.json");
  const secondFile = path.join(root, "score-2.json");
  await fs.writeFile(firstFile, JSON.stringify(first));
  await fs.writeFile(secondFile, JSON.stringify(second));
  await assert.rejects(unblind({ root, runId: "scores-v1", scoresFiles: [firstFile, firstFile] }), /distinct evaluator score files/);
  const result = await unblind({ root, runId: "scores-v1", scoresFiles: [firstFile, secondFile] });
  assert.equal(result.evaluators.length, 2);
  await assert.rejects(unblind({ root, runId: "scores-v1", scoresFiles: [firstFile, secondFile] }), /already exists and is immutable/);
});

test("unblind rejects packet mutation and leak introduced after scoring", async (context) => {
  const root = await temporaryRepository();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const { run, packet } = await readyRun(root, "packet-v1");
  const contract = (await verifyContract(root)).contract;
  const firstFile = path.join(root, "score-1.json");
  const secondFile = path.join(root, "score-2.json");
  await fs.writeFile(firstFile, JSON.stringify(completedScores({ run, packet, evaluatorId: "human-1", evaluatorName: "First Human", contract, slot: 1 })));
  await fs.writeFile(secondFile, JSON.stringify(completedScores({ run, packet, evaluatorId: "human-2", evaluatorName: "Second Human", contract, slot: 2 })));
  const presented = path.join(root, "docs/eval/baseline/runs/packet-v1/presentation/artifact-01/DESIGN.md");
  await fs.writeFile(presented, "g-r-o-k leak\n");
  await assert.rejects(unblind({ root, runId: "packet-v1", scoresFiles: [firstFile, secondFile] }), /packet hash mismatch|leaks blinded identity/);
});
