import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import {
  aggregateEvaluationResults,
  executeEvaluation,
  loadPreparedEvaluationRun,
  prepareEvaluationRun,
  sanitizeEvaluationEnvironment,
  validateBrowserEvidencePng,
  writeImmutableAggregate,
  writeImmutableEvaluationResult,
  writeImmutableEvaluationPacket,
} from "./page-ir-harness-runner.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const TEST_BROWSER_AUTHORITY = {
  revision: "1234",
  executableRelativePath: "chrome/Chromium",
  bundleSha256: "9".repeat(64),
  fileCount: 1,
  symlinkCount: 0,
  totalBytes: 1,
};
const TEST_RUNTIME_AUTHORITY = {
  platform: "darwin",
  arch: "arm64",
  nodeVersion: "26.7.0",
  nodeExecutable: "/trusted/node",
  nodeExecutableSha256: "1".repeat(64),
  gitExecutable: "/trusted/git",
  gitExecutableSha256: "2".repeat(64),
  npmBundleRoot: "/trusted/npm",
  npmCliRelativePath: "bin/npm-cli.js",
  npmBundleSha256: "3".repeat(64),
  npmFileCount: 1,
  npmSymlinkCount: 0,
  npmTotalBytes: 1,
};

function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(name, data) {
  const type = Buffer.from(name, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(pngCrc32(Buffer.concat([type, data])), 8 + data.length);
  return chunk;
}

function overexpandedOnePixelPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.alloc(1024 * 1024))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

test("PNG verification bounds decompression before accepting decoded bytes", () => {
  assert.throws(
    () => validateBrowserEvidencePng(overexpandedOnePixelPng(), 1, 1, "overexpanded"),
    /cannot be decoded/i,
  );
});

async function temporaryRoot(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-phase-1-runner-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("credential-free child environments retain runtime basics and remove secrets", () => {
  const sanitized = sanitizeEvaluationEnvironment({
    PATH: "/bin",
    HOME: "/tmp/home",
    LANG: "en_US.UTF-8",
    OPENROUTER_API_KEY: "secret",
    FIRECRAWL_API_KEY: "secret",
    ONE_BOX_API_TOKEN: "secret",
    RANDOM_SECRET: "secret",
    npm_config_userconfig: "/tmp/credentialed-npmrc",
    ONEBOX_EVAL_INPUTS_ROOT: "/tmp/untrusted-inputs",
    ONEBOX_EVAL_OS_SANDBOX: "0",
  });
  assert.equal(sanitized.PATH, "/bin");
  assert.equal(sanitized.HOME, undefined);
  assert.equal(sanitized.LANG, "en_US.UTF-8");
  assert.equal(sanitized.ONEBOX_EVAL_OFFLINE, "1");
  assert.equal(sanitized.OPENROUTER_API_KEY, undefined);
  assert.equal(sanitized.FIRECRAWL_API_KEY, undefined);
  assert.equal(sanitized.ONE_BOX_API_TOKEN, undefined);
  assert.equal(sanitized.RANDOM_SECRET, undefined);
  assert.equal(sanitized.npm_config_userconfig, undefined);
  assert.equal(sanitized.ONEBOX_EVAL_INPUTS_ROOT, undefined);
  assert.equal(sanitized.ONEBOX_EVAL_OS_SANDBOX, undefined);
});

test("preparation publishes one immutable closed input run and rejects bad fixtures", async (context) => {
  const root = await temporaryRoot(context);
  const fixtures = path.join(root, "fixtures");
  const input = Buffer.from("approved fixture bytes\n");
  await fs.mkdir(path.join(fixtures, "brochure-local-service"), { recursive: true });
  await fs.writeFile(path.join(fixtures, "brochure-local-service", "brief.json"), input);
  const fixtureManifest = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    id: "brochure-local-service",
    purpose: "brochure-local-service",
    providerMode: "recorded-or-stubbed",
    inputs: [{ path: "brief.json", sha256: crypto.createHash("sha256").update(input).digest("hex") }],
  }));
  await fs.writeFile(path.join(fixtures, "brochure-local-service", "fixture.json"), fixtureManifest);
  const contract = {
    contractVersion: "1.0.0",
    contractSha256: "a".repeat(64),
    registrySha256: "b".repeat(64),
    sourceCommit: "c".repeat(40),
    corpus: ["brochure-local-service"],
    fixtureManifestSha256: {
      "brochure-local-service": crypto.createHash("sha256").update(fixtureManifest).digest("hex"),
    },
    fixtureBuildSha256: { "brochure-local-service": "f".repeat(64) },
    browserAuthority: TEST_BROWSER_AUTHORITY,
    runtimeAuthority: TEST_RUNTIME_AUTHORITY,
    evaluations: [{ id: "EVAL-SEC-003" }, { id: "EVAL-WEB-001" }],
  };
  const runsRoot = path.join(root, "runs");
  const prepared = await prepareEvaluationRun({
    root,
    runsRoot,
    runId: "phase-1-test",
    contract,
    fixturesRoot: fixtures,
    evaluatedGitSha: "d".repeat(40),
    createdAt: "2026-08-24T00:00:00.000Z",
  });
  assert.equal(prepared.manifest.status, "prepared");
  assert.deepEqual(prepared.manifest.initialResults, [
    { evaluationId: "EVAL-SEC-003", state: "NOT_RUN" },
    { evaluationId: "EVAL-WEB-001", state: "NOT_RUN" },
  ]);
  assert.equal(await fs.readFile(path.join(prepared.directory, "inputs/brochure-local-service/brief.json"), "utf8"), input.toString());
  assert.equal((await loadPreparedEvaluationRun(prepared.directory)).manifest.runId, "phase-1-test");
  const sealedInput = path.join(prepared.directory, "inputs/brochure-local-service/brief.json");
  await fs.chmod(sealedInput, 0o600);
  await fs.writeFile(sealedInput, "tampered fixture bytes\n");
  await assert.rejects(loadPreparedEvaluationRun(prepared.directory), /input inventory|hash/i);
  await fs.writeFile(sealedInput, input);
  await fs.chmod(sealedInput, 0o400);
  const originalManifest = await fs.readFile(path.join(prepared.directory, "run-manifest.json"));
  await fs.chmod(path.join(prepared.directory, "run-manifest.json"), 0o600);
  await fs.writeFile(path.join(prepared.directory, "run-manifest.json"), Buffer.concat([originalManifest, Buffer.from(" ")]));
  await assert.rejects(loadPreparedEvaluationRun(prepared.directory), /lock hash/i);
  await fs.writeFile(path.join(prepared.directory, "run-manifest.json"), originalManifest);
  await assert.rejects(prepareEvaluationRun({ root, runsRoot, runId: "phase-1-test", contract, fixturesRoot: fixtures, evaluatedGitSha: "d".repeat(40) }), /already exists and is immutable/i);

  const fixture = JSON.parse(await fs.readFile(path.join(fixtures, "brochure-local-service/fixture.json"), "utf8"));
  fixture.inputs[0].sha256 = "0".repeat(64);
  await fs.writeFile(path.join(fixtures, "brochure-local-service/fixture.json"), JSON.stringify(fixture));
  await assert.rejects(
    prepareEvaluationRun({ root, runsRoot, runId: "bad-hash", contract, fixturesRoot: fixtures, evaluatedGitSha: "d".repeat(40) }),
    /frozen corpus/i,
  );
  await assert.rejects(fs.stat(path.join(runsRoot, "bad-hash")), { code: "ENOENT" });
});

test("missing corpus fixtures are explicit blockers without blocking credential-free evaluation", async (context) => {
  const root = await temporaryRoot(context);
  const prepared = await prepareEvaluationRun({
    root,
    runsRoot: path.join(root, "runs"),
    runId: "missing-corpus",
    contract: {
      contractVersion: "1.0.0",
      contractSha256: "a".repeat(64),
      registrySha256: "b".repeat(64),
      sourceCommit: "c".repeat(40),
      corpus: ["portfolio-showcase"],
      fixtureManifestSha256: { "portfolio-showcase": "e".repeat(64) },
      fixtureBuildSha256: { "portfolio-showcase": "f".repeat(64) },
      browserAuthority: TEST_BROWSER_AUTHORITY,
      runtimeAuthority: TEST_RUNTIME_AUTHORITY,
      evaluations: [{ id: "EVAL-SEC-003" }, { id: "EVAL-WEB-001" }],
    },
    evaluatedGitSha: "d".repeat(40),
  });
  assert.deepEqual(prepared.manifest.prerequisiteBlockers, [{
    evaluationIds: ["EVAL-WEB-001", "EVAL-WEB-002", "EVAL-WEB-003"],
    code: "CORPUS_FIXTURES_MISSING",
    detail: "portfolio-showcase",
  }]);
});

test("WEB execution reads the prepared sealed inputs and rejects missing input authority", async (context) => {
  const root = await temporaryRoot(context);
  const fixtures = path.join(root, "fixtures");
  const sealedBytes = Buffer.from("prepared sealed bytes\n");
  await fs.mkdir(path.join(fixtures, "brochure-local-service"), { recursive: true });
  await fs.writeFile(path.join(fixtures, "brochure-local-service", "brief.json"), sealedBytes);
  const fixtureManifest = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    id: "brochure-local-service",
    purpose: "brochure-local-service",
    providerMode: "recorded-or-stubbed",
    inputs: [{
      path: "brief.json",
      sha256: crypto.createHash("sha256").update(sealedBytes).digest("hex"),
    }],
  }));
  await fs.writeFile(path.join(fixtures, "brochure-local-service", "fixture.json"), fixtureManifest);
  const prepared = await prepareEvaluationRun({
    root,
    runsRoot: path.join(root, "runs"),
    runId: "sealed-input-run",
    contract: {
      contractVersion: "1.0.0",
      contractSha256: "a".repeat(64),
      registrySha256: "b".repeat(64),
      sourceCommit: "c".repeat(40),
      corpus: ["brochure-local-service"],
      fixtureManifestSha256: {
        "brochure-local-service": crypto.createHash("sha256").update(fixtureManifest).digest("hex"),
      },
      fixtureBuildSha256: { "brochure-local-service": "f".repeat(64) },
      browserAuthority: TEST_BROWSER_AUTHORITY,
      runtimeAuthority: TEST_RUNTIME_AUTHORITY,
      evaluations: [{ id: "EVAL-WEB-001" }],
    },
    fixturesRoot: fixtures,
    evaluatedGitSha: "d".repeat(40),
  });
  const inputsRoot = path.join(prepared.directory, "inputs");
  const browserRoot = path.join(prepared.directory, "browser");
  await fs.mkdir(browserRoot);

  const result = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-WEB-001",
    inputsRoot,
    browserRoot,
    environment: {
      ...process.env,
      ONEBOX_EVAL_INPUTS_ROOT: path.join(root, "attacker-controlled"),
    },
    commands: [{
      id: "sealed-input-check",
      argv: [
        process.execPath,
        "-e",
        "const fs=require('node:fs');const path=require('node:path');const bytes=fs.readFileSync(path.join(process.env.ONEBOX_EVAL_INPUTS_ROOT,'brochure-local-service','brief.json'),'utf8');if(bytes!=='prepared sealed bytes\\n'||process.env.ONEBOX_EVAL_OS_SANDBOX!=='darwin-sandbox-exec-network-and-user-storage-denied')process.exit(9)",
      ],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(result.state, "PASS");

  const unrelatedBrowserRoot = path.join(root, "unrelated-run", "browser");
  await fs.mkdir(unrelatedBrowserRoot, { recursive: true });
  await fs.writeFile(
    path.join(unrelatedBrowserRoot, "evidence.json"),
    "sealed\n",
    { mode: 0o400 },
  );
  await assert.rejects(executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-WEB-001",
    inputsRoot,
    browserRoot: unrelatedBrowserRoot,
    commands: [{ id: "must-not-run", argv: [process.execPath, "-e", "process.exit(99)"] }],
  }), /same prepared run/i);

  const deniedMutation = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-WEB-001",
    inputsRoot,
    browserRoot,
    commands: [{
      id: "sealed-input-mutation",
      argv: [
        process.execPath,
        "-e",
        "const fs=require('node:fs');const path=require('node:path');const file=path.join(process.env.ONEBOX_EVAL_INPUTS_ROOT,'brochure-local-service','brief.json');fs.chmodSync(file,0o600);fs.writeFileSync(file,'mutated\\n')",
      ],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(deniedMutation.state, "FAIL");
  assert.equal(
    await fs.readFile(path.join(inputsRoot, "brochure-local-service", "brief.json"), "utf8"),
    "prepared sealed bytes\n",
  );

  const deniedReplacement = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-WEB-001",
    inputsRoot,
    browserRoot,
    commands: [{
      id: "sealed-input-replacement",
      argv: [
        process.execPath,
        "-e",
        "const fs=require('node:fs');fs.renameSync(process.env.ONEBOX_EVAL_INPUTS_ROOT,process.env.ONEBOX_EVAL_INPUTS_ROOT+'-replaced')",
      ],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(deniedReplacement.state, "FAIL");
  await assert.doesNotReject(fs.stat(inputsRoot));
  await assert.rejects(fs.stat(`${inputsRoot}-replaced`), { code: "ENOENT" });

  const runParentProbe = path.join(prepared.directory, "evaluator-write-probe");
  const deniedRunWrite = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-WEB-001",
    inputsRoot,
    browserRoot,
    commands: [{
      id: "sealed-run-parent-write",
      argv: [
        process.execPath,
        "-e",
        "const fs=require('node:fs');const path=require('node:path');fs.writeFileSync(path.join(path.dirname(process.env.ONEBOX_EVAL_INPUTS_ROOT),'evaluator-write-probe'),'forbidden')",
      ],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(deniedRunWrite.state, "FAIL");
  await assert.rejects(fs.stat(runParentProbe), { code: "ENOENT" });

  await assert.rejects(executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-WEB-001",
    commands: [{ id: "must-not-run", argv: [process.execPath, "-e", "process.exit(99)"] }],
  }), /sealed input/i);
  await assert.rejects(executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-WEB-001",
    inputsRoot: fixtures,
    commands: [{ id: "must-not-run", argv: [process.execPath, "-e", "process.exit(99)"] }],
  }), /read-only|sealed/i);
});

test("WEB execution rejects backslashes in sandbox authority paths", async (context) => {
  const root = await temporaryRoot(context);
  const inputsRoot = path.join(root, "slash\\name", "inputs");
  const browserRoot = path.join(root, "slash\\name", "browser");
  await fs.mkdir(inputsRoot, { recursive: true });
  await fs.mkdir(browserRoot);
  await fs.writeFile(path.join(inputsRoot, "fixture.txt"), "sealed\n", { mode: 0o400 });
  await assert.rejects(
    executeEvaluation({
      root: ROOT,
      evaluationId: "EVAL-WEB-001",
      inputsRoot,
      browserRoot,
      commands: [{ id: "never-run", argv: [process.execPath, "-e", "process.exit(0)"] }],
    }),
    /sandbox authority|backslash|invalid/i,
  );
});

test("a PASS WEB result remains invalid without immutable browser evidence", async (context) => {
  const root = await temporaryRoot(context);
  const fixtures = path.join(root, "fixtures");
  const fixtureRoot = path.join(fixtures, "brochure-local-service");
  const input = Buffer.from("bound fixture\n");
  await fs.mkdir(fixtureRoot, { recursive: true });
  await fs.writeFile(path.join(fixtureRoot, "brief.json"), input);
  const fixtureManifest = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    id: "brochure-local-service",
    purpose: "brochure-local-service",
    providerMode: "recorded-or-stubbed",
    inputs: [{
      path: "brief.json",
      sha256: crypto.createHash("sha256").update(input).digest("hex"),
    }],
  }));
  await fs.writeFile(path.join(fixtureRoot, "fixture.json"), fixtureManifest);
  const prepared = await prepareEvaluationRun({
    root,
    runsRoot: path.join(root, "runs"),
    runId: "browser-proof-required",
    contract: {
      contractVersion: "1.0.0",
      contractSha256: "a".repeat(64),
      registrySha256: "b".repeat(64),
      sourceCommit: "c".repeat(40),
      corpus: ["brochure-local-service"],
      fixtureManifestSha256: {
        "brochure-local-service": crypto.createHash("sha256").update(fixtureManifest).digest("hex"),
      },
      fixtureBuildSha256: { "brochure-local-service": "f".repeat(64) },
      browserAuthority: TEST_BROWSER_AUTHORITY,
      runtimeAuthority: TEST_RUNTIME_AUTHORITY,
      evaluations: [{ id: "EVAL-WEB-001" }],
    },
    fixturesRoot: fixtures,
    evaluatedGitSha: "d".repeat(40),
  });
  const packetRoot = path.join(root, "result-packet");
  const evidence = Buffer.from("browser test output\n");
  await fs.mkdir(packetRoot);
  await fs.writeFile(path.join(packetRoot, "evidence.txt"), evidence);
  await writeImmutableEvaluationPacket(
    path.join(prepared.directory, "results"),
    packetRoot,
    {
      schemaVersion: 1,
      evaluationId: "EVAL-WEB-001",
      state: "PASS",
      evidence: [{
        path: "artifacts/evidence.txt",
        sha256: crypto.createHash("sha256").update(evidence).digest("hex"),
      }],
      meteredCalls: 0,
      networkAttempts: [],
      providerCredentialKeysPresent: [],
    },
  );
  await assert.rejects(
    loadPreparedEvaluationRun(prepared.directory),
    /every immutable browser evidence packet/i,
  );
});

test("results are immutable and aggregation preserves all four states", async (context) => {
  const root = await temporaryRoot(context);
  const resultsRoot = path.join(root, "results");
  const packetRoot = path.join(root, "packet");
  const commandBytes = Buffer.from("command evidence\n");
  await fs.mkdir(packetRoot);
  await fs.writeFile(path.join(packetRoot, "command.json"), commandBytes);
  const result = {
    schemaVersion: 1,
    evaluationId: "EVAL-TEST-001",
    state: "PASS",
    meteredCalls: 0,
    evidence: [{ path: "artifacts/command.json", sha256: crypto.createHash("sha256").update(commandBytes).digest("hex") }],
  };
  await assert.rejects(writeImmutableEvaluationPacket(resultsRoot, packetRoot, { ...result, unexpected: true }), /closed/i);
  const settled = await Promise.allSettled([
    writeImmutableEvaluationPacket(resultsRoot, packetRoot, result),
    writeImmutableEvaluationPacket(resultsRoot, packetRoot, result),
  ]);
  assert.equal(settled.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(settled.filter((entry) => entry.status === "rejected").length, 1);
  await writeImmutableEvaluationPacket(resultsRoot, packetRoot, { ...result, evaluationId: "EVAL-TEST-002", state: "FAIL" });
  await writeImmutableEvaluationResult(resultsRoot, {
    schemaVersion: 1,
    evaluationId: "EVAL-TEST-003",
    state: "BLOCKED",
    blockers: [{ code: "MISSING", detail: "fixture" }],
    commands: [],
    evidence: [],
  });
  const aggregate = await aggregateEvaluationResults({
    resultsRoot,
    evaluationIds: ["EVAL-TEST-001", "EVAL-TEST-002", "EVAL-TEST-003", "EVAL-TEST-004"],
  });
  assert.deepEqual(aggregate.results.map(({ evaluationId, state }) => ({ evaluationId, state })), [
    { evaluationId: "EVAL-TEST-001", state: "PASS" },
    { evaluationId: "EVAL-TEST-002", state: "FAIL" },
    { evaluationId: "EVAL-TEST-003", state: "BLOCKED" },
    { evaluationId: "EVAL-TEST-004", state: "NOT_RUN" },
  ]);
  assert.equal(aggregate.exitCode, 1);
  const aggregateFile = await writeImmutableAggregate(root, aggregate);
  assert.match(aggregateFile, /aggregate\.json$/);
  await assert.rejects(writeImmutableAggregate(root, aggregate), /already exists and is immutable/i);
  await assert.rejects(writeImmutableAggregate(path.join(root, "contradictory"), {
    schemaVersion: 1,
    results: [{ ...result, evaluationId: "EVAL-TEST-099", state: "FAIL" }],
    exitCode: 0,
  }), /contradicts/i);
  await assert.rejects(writeImmutableEvaluationResult(path.join(root, "invalid-pass"), {
    schemaVersion: 1,
    evaluationId: "EVAL-TEST-099",
    state: "PASS",
    meteredCalls: 0,
    evidence: [],
  }), /requires evidence/i);
});

test("packet publication copies one closed hash-bound evidence inventory and rejects symlinks", async (context) => {
  const root = await temporaryRoot(context);
  const packet = path.join(root, "packet");
  await fs.mkdir(path.join(packet, "screenshots"), { recursive: true });
  const evidenceBytes = Buffer.from("evidence\n");
  const screenshotBytes = Buffer.from("png\n");
  await fs.writeFile(path.join(packet, "evidence.json"), evidenceBytes);
  await fs.writeFile(path.join(packet, "screenshots/desktop.png"), screenshotBytes);
  const evidence = [
    { path: "artifacts/evidence.json", sha256: crypto.createHash("sha256").update(evidenceBytes).digest("hex") },
    { path: "artifacts/screenshots/desktop.png", sha256: crypto.createHash("sha256").update(screenshotBytes).digest("hex") },
  ];
  const resultsRoot = path.join(root, "results");
  await writeImmutableEvaluationPacket(resultsRoot, packet, {
    schemaVersion: 1,
    evaluationId: "EVAL-WEB-001",
    state: "PASS",
    evidence,
    meteredCalls: 0,
  });
  assert.equal(await fs.readFile(path.join(resultsRoot, "EVAL-WEB-001/artifacts/evidence.json"), "utf8"), "evidence\n");
  const publishedEvidence = path.join(resultsRoot, "EVAL-WEB-001/artifacts/evidence.json");
  await fs.chmod(publishedEvidence, 0o600);
  await fs.writeFile(publishedEvidence, "tampered\n");
  await assert.rejects(aggregateEvaluationResults({
    resultsRoot,
    evaluationIds: ["EVAL-WEB-001"],
  }), /result inventory|hash/i);
  await fs.chmod(publishedEvidence, 0o400);
  await assert.rejects(writeImmutableEvaluationPacket(resultsRoot, packet, {
    schemaVersion: 1,
    evaluationId: "EVAL-WEB-001",
    state: "PASS",
    evidence,
    meteredCalls: 0,
  }), /already exists and is immutable/i);

  const linked = path.join(root, "linked-packet");
  await fs.mkdir(linked);
  await fs.symlink(path.join(packet, "evidence.json"), path.join(linked, "evidence.json"));
  await assert.rejects(writeImmutableEvaluationPacket(resultsRoot, linked, {
    schemaVersion: 1,
    evaluationId: "EVAL-WEB-002",
    state: "FAIL",
    evidence: [],
  }), /symlink/i);
});

test("publication rejects a parent replaced with a symlink before rename", async (context) => {
  const root = await temporaryRoot(context);
  const resultsRoot = path.join(root, "results");
  const movedRoot = path.join(root, "results-moved");
  const externalRoot = path.join(root, "external");
  await fs.mkdir(resultsRoot);
  await fs.mkdir(externalRoot);
  const linkedParent = path.join(root, "results-link");
  await fs.symlink(externalRoot, linkedParent, "dir");
  await assert.rejects(writeImmutableEvaluationResult(linkedParent, {
    schemaVersion: 1,
    evaluationId: "EVAL-TEST-051",
    state: "BLOCKED",
    blockers: [{ code: "MISSING", detail: "fixture" }],
    commands: [],
    evidence: [],
  }), /physical directory/i);
  assert.deepEqual(await fs.readdir(externalRoot), []);
  const originalRename = fs.rename;
  let injected = false;
  fs.rename = async (source, destination) => {
    if (!injected && path.basename(String(source)).startsWith(".EVAL-TEST-050.")) {
      injected = true;
      await originalRename.call(fs, resultsRoot, movedRoot);
      await fs.symlink(externalRoot, resultsRoot, "dir");
    }
    return originalRename.call(fs, source, destination);
  };
  try {
    await assert.rejects(writeImmutableEvaluationResult(resultsRoot, {
      schemaVersion: 1,
      evaluationId: "EVAL-TEST-050",
      state: "BLOCKED",
      blockers: [{ code: "MISSING", detail: "fixture" }],
      commands: [],
      evidence: [],
    }), /ENOENT|no such|changed/i);
  } finally {
    fs.rename = originalRename;
    await fs.unlink(resultsRoot).catch(() => {});
    await originalRename.call(fs, movedRoot, resultsRoot).catch(() => {});
  }
  assert.deepEqual(await fs.readdir(externalRoot), []);
  await assert.rejects(fs.stat(path.join(resultsRoot, "EVAL-TEST-050")), { code: "ENOENT" });
});

test("execution removes credentials, blocks external network, and maps prerequisites", async (context) => {
  await temporaryRoot(context);
  const pass = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003",
    commands: [{
      id: "credential-check",
      argv: [process.execPath, "-e", "if (process.env.OPENROUTER_API_KEY || process.env.ONE_BOX_API_TOKEN || process.env.RANDOM_SECRET || process.env.HOME === '/credentialed/home') process.exit(9)"],
    }],
    environment: { ...process.env, HOME: "/credentialed/home", OPENROUTER_API_KEY: "parent-secret", ONE_BOX_API_TOKEN: "parent-secret", RANDOM_SECRET: "parent-secret" },
    timeoutMs: 10_000,
  });
  assert.equal(pass.state, "PASS");
  assert.equal(pass.meteredCalls, 0);
  assert.deepEqual(pass.providerCredentialKeysPresent, []);

  const outsideRoot = await fs.mkdtemp(path.join(path.dirname(ROOT), "one-box-eval-outside-"));
  context.after(() => fs.rm(outsideRoot, { recursive: true, force: true }));
  const outsideSentinel = path.join(outsideRoot, "credential-sentinel");
  const outsideWrite = path.join(outsideRoot, "evaluator-write");
  await fs.writeFile(outsideSentinel, "outside-authority\n", { mode: 0o600 });
  const deniedRead = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003",
    commands: [{
      id: "outside-read",
      argv: [process.execPath, "-e", `require("node:fs").readFileSync(${JSON.stringify(outsideSentinel)})`],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(deniedRead.state, "FAIL");
  const deniedWrite = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003",
    commands: [{
      id: "outside-write",
      argv: [process.execPath, "-e", `require("node:fs").writeFileSync(${JSON.stringify(outsideWrite)},"forbidden")`],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(deniedWrite.state, "FAIL");
  await assert.rejects(fs.stat(outsideWrite), { code: "ENOENT" });

  const loopback = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-LOOPBACK",
    commands: [{
      id: "loopback-http",
      argv: [process.execPath, "-e", "const h=await import('node:http');const s=h.createServer((q,r)=>r.end('ok'));s.listen(0,'127.0.0.1',async()=>{const r=await fetch(`http://127.0.0.1:${s.address().port}`);if(await r.text()!=='ok')process.exitCode=8;s.close()})"],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(loopback.state, "FAIL");
  assert.ok(loopback.networkAttempts.some((attempt) => attempt.includes("net listen")));

  const loopbackRequest = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-LOOPBACK",
    commands: [{
      id: "loopback-request-object",
      argv: [process.execPath, "-e", "const h=await import('node:http');const s=h.createServer((q,r)=>r.end('ok'));s.listen(0,'127.0.0.1',async()=>{const u=`http://127.0.0.1:${s.address().port}`;const r=await fetch(new Request(u));if(await r.text()!=='ok')process.exitCode=8;s.close()})"],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(loopbackRequest.state, "FAIL");
  assert.ok(loopbackRequest.networkAttempts.some((attempt) => attempt.includes("net listen")));

  const loopbackHttpDefaults = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-LOOPBACK",
    commands: [{
      id: "loopback-http-defaults",
      argv: [process.execPath, "-e", "const h=await import('node:http');for(const invoke of [()=>h.request(),()=>h.request(undefined),()=>h.request(null)]){try{const r=invoke();r.on('error',()=>undefined);r.destroy()}catch{}}"],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(loopbackHttpDefaults.state, "FAIL");
  assert.ok(loopbackHttpDefaults.networkAttempts.some((attempt) => attempt.includes("localhost")));

  const loopbackExpandedIpv6 = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-LOOPBACK",
    commands: [{
      id: "loopback-expanded-ipv6",
      argv: [process.execPath, "-e", "const h=await import('node:http');const s=h.createServer((q,r)=>r.end('ok'));s.listen(0,'::1',()=>{const r=h.get({hostname:'0:0:0:0:0:0:0:1',port:s.address().port},q=>{q.resume();q.on('end',()=>s.close())});r.on('error',e=>{console.error(e);s.close(()=>process.exit(9))})})"],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(loopbackExpandedIpv6.state, "FAIL");
  assert.ok(loopbackExpandedIpv6.networkAttempts.some((attempt) => attempt.includes("net listen")));

  const unixSocket = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-LOOPBACK",
    commands: [{
      id: "local-socket",
      argv: [process.execPath, "-e", "const n=await import('node:net'),p=process.env.TMPDIR+'/probe.sock';const s=n.createServer();s.listen(p,()=>s.close())"],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(unixSocket.state, "FAIL");
  assert.ok(unixSocket.networkAttempts.some((attempt) => attempt.includes("net listen")));

  const hostServer = http.createServer((_request, response) => response.end("host-state"));
  await new Promise((resolve, reject) => {
    hostServer.once("error", reject);
    hostServer.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => hostServer.close(resolve)));
  const hostPort = hostServer.address().port;
  const deniedHostLoopback = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-NETWORK",
    commands: [{
      id: "host-loopback",
      argv: [process.execPath, "-e", `await fetch("http://127.0.0.1:${hostPort}/state")`],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(deniedHostLoopback.state, "FAIL");
  assert.ok(deniedHostLoopback.networkAttempts.some((attempt) =>
    attempt.includes(`127.0.0.1:${hostPort}`)
  ));

  const denied = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-NETWORK",
    commands: [{ id: "network", argv: [process.execPath, "-e", "await fetch('https://example.com')"] }],
    timeoutMs: 10_000,
  });
  assert.equal(denied.state, "FAIL");
  assert.ok(denied.networkAttempts.some((attempt) => attempt.includes("example.com")));

  const deniedRequestObject = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-NETWORK",
    commands: [{
      id: "request-object-network",
      argv: [process.execPath, "-e", "await fetch(new Request('https://example.com/request-object'))"],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(deniedRequestObject.state, "FAIL");
  assert.ok(deniedRequestObject.networkAttempts.some((attempt) => attempt.includes("example.com")));

  const deniedAmbiguousRequest = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-NETWORK",
    commands: [{
      id: "ambiguous-request-network",
      argv: [process.execPath, "-e", "await fetch({})"],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(deniedAmbiguousRequest.state, "FAIL");
  assert.ok(deniedAmbiguousRequest.networkAttempts.some((attempt) => attempt.includes("unresolved")));

  const deniedUdp = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-NETWORK",
    commands: [{
      id: "udp-network",
      argv: [process.execPath, "-e", "const dgram = await import('node:dgram'); dgram.createSocket('udp4')"],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(deniedUdp.state, "FAIL");
  assert.ok(deniedUdp.networkAttempts.some((attempt) => attempt.includes("dgram")));

  const deniedNativeUdp = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-NETWORK",
    commands: [{
      id: "native-udp-network",
      argv: [
        "/usr/bin/python3",
        "-c",
        'import socket; socket.socket(socket.AF_INET, socket.SOCK_DGRAM).sendto(b"probe", ("192.0.2.1", 45678))',
      ],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(deniedNativeUdp.state, "FAIL");
  assert.notEqual(deniedNativeUdp.commands[0].exitCode, 0);

  const deniedChild = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-NETWORK",
    commands: [{
      id: "child-network",
      argv: [process.execPath, "-e", "const { execFile } = await import('node:child_process'); execFile('curl', ['https://example.com'], (error) => process.exit(error ? 1 : 0))"],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(deniedChild.state, "FAIL");

  await assert.rejects(executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003",
    commands: [{ id: "../escape", argv: [process.execPath, "-e", ""] }],
  }), /command ID/i);

  const blocked = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-WEB-001",
    commands: [{ id: "must-not-run", argv: [process.execPath, "-e", "process.exit(99)"] }],
    blockers: [{ code: "CORPUS_FIXTURES_MISSING", detail: "all" }],
  });
  assert.equal(blocked.state, "BLOCKED");
  assert.deepEqual(blocked.commands, []);
});

test("execution loads the offline guard only from its isolated execution root", async (context) => {
  const executionRoot = await temporaryRoot(context);
  const guardDirectory = path.join(executionRoot, "scripts/eval");
  await fs.mkdir(guardDirectory, { recursive: true });
  await fs.copyFile(
    path.join(ROOT, "scripts/eval/page-ir-offline-guard.mjs"),
    path.join(guardDirectory, "page-ir-offline-guard.mjs"),
  );
  const result = await executeEvaluation({
    root: executionRoot,
    evaluationId: "EVAL-SEC-003",
    commands: [{
      id: "isolated-guard",
      argv: [process.execPath, "-e", "if(process.env.ONEBOX_EVAL_OFFLINE!=='1')process.exit(9)"],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(result.state, "PASS", result.commands[0]?.stderr);
});
