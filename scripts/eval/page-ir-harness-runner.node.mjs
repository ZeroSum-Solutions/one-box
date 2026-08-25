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
  assembleQualificationPreReviewPacket,
  executeEvaluation,
  ingestQualificationCompletedPacket,
  loadQualificationCompletedPacket,
  loadQualificationPreReviewPacket,
  loadPreparedEvaluationRun,
  prepareEvaluationRun,
  publishImmutableEvidencePacket,
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

async function isolatedEvaluationRoot(context) {
  const root = await temporaryRoot(context);
  await fs.mkdir(path.join(root, "scripts/eval"), { recursive: true });
  await fs.copyFile(
    path.join(ROOT, "scripts/eval/page-ir-offline-guard.mjs"),
    path.join(root, "scripts/eval/page-ir-offline-guard.mjs"),
  );
  return root;
}

test("credential-free tests may write only their disposable sites workspace", async (context) => {
  const root = await isolatedEvaluationRoot(context);
  const result = await executeEvaluation({
    root,
    workspaceRoot: path.join(root, "sites"),
    evaluationId: "EVAL-SCOPE-002",
    commands: [{
      id: "sites-workspace",
      argv: [process.execPath, "-e", "require('node:fs').mkdirSync('sites/probe',{recursive:true})"],
    }],
    timeoutMs: 5_000,
  });
  assert.equal(result.state, "PASS", result.commands[0]?.stderr);
  assert.equal((await fs.stat(path.join(root, "sites/probe"))).isDirectory(), true);
});

test("credential-free test workers may signal descendants in the same sandbox", async (context) => {
  const root = await isolatedEvaluationRoot(context);
  const source = [
    "const { spawn } = require('node:child_process');",
    "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
    "setTimeout(() => child.kill('SIGTERM'), 50);",
    "child.once('close', () => process.exit(0));",
  ].join("");
  const result = await executeEvaluation({
    root,
    evaluationId: "EVAL-SCOPE-002",
    commands: [{ id: "same-sandbox-signal", argv: [process.execPath, "-e", source] }],
    timeoutMs: 5_000,
  });
  assert.equal(result.state, "PASS", result.commands[0]?.stderr);
});

test("credential-free sites workspace cannot follow a symlink outside its authority", async (context) => {
  const root = await isolatedEvaluationRoot(context);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-eval-workspace-escape-"));
  context.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "sites"));
  await fs.symlink(outside, path.join(root, "sites/escape"));
  const escapedFile = path.join(outside, "forbidden.txt");
  await assert.rejects(executeEvaluation({
    root,
    workspaceRoot: path.join(root, "sites"),
    evaluationId: "EVAL-SEC-003",
    commands: [{
      id: "sites-symlink-escape",
      argv: [process.execPath, "-e", "require('node:fs').writeFileSync('sites/escape/forbidden.txt','forbidden')"],
    }],
    timeoutMs: 5_000,
  }), /workspace.*must not already exist/i);
  await assert.rejects(fs.stat(escapedFile), { code: "ENOENT" });
});

test("credential-free child cannot hardlink and overwrite a file outside its workspace", async (context) => {
  const root = await isolatedEvaluationRoot(context);
  const outsideFile = path.join(root, "authority.txt");
  await fs.writeFile(outsideFile, "unchanged");
  const result = await executeEvaluation({
    root,
    workspaceRoot: path.join(root, "sites"),
    evaluationId: "EVAL-SEC-003",
    commands: [{
      id: "sites-hardlink-escape",
      argv: [process.execPath, "-e", [
        "const fs=require('node:fs');",
        "fs.linkSync('authority.txt','sites/linked.txt');",
        "fs.writeFileSync('sites/linked.txt','changed');",
      ].join("")],
    }],
    timeoutMs: 5_000,
  });
  assert.equal(result.state, "FAIL");
  assert.notEqual(result.commands[0]?.exitCode, 0);
  assert.match(result.commands[0]?.stderr ?? "", /EPERM|operation not permitted/i);
  assert.equal((await fs.stat(path.join(root, "sites"))).isDirectory(), true);
  assert.equal(await fs.readFile(outsideFile, "utf8"), "unchanged");
});

test("credential-free child cannot read private var tmp outside its authority", {
  skip: process.platform !== "darwin",
}, async (context) => {
  const root = await isolatedEvaluationRoot(context);
  const outside = await fs.mkdtemp("/private/var/tmp/one-box-eval-read-");
  context.after(() => fs.rm(outside, { recursive: true, force: true }));
  const sentinel = path.join(outside, "sentinel.txt");
  await fs.writeFile(sentinel, "outside");

  const result = await executeEvaluation({
    root,
    evaluationId: "EVAL-SEC-003",
    commands: [{
      id: "private-var-tmp-read",
      argv: [process.execPath, "-e", `require('node:fs').readFileSync(${JSON.stringify(sentinel)})`],
    }],
    timeoutMs: 5_000,
  });

  assert.equal(result.state, "FAIL");
  assert.notEqual(result.commands[0]?.exitCode, 0);
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
  assert.equal(unixSocket.state, "PASS");
  assert.deepEqual(unixSocket.networkAttempts, []);

  const hostUnixSocket = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-LOOPBACK",
    commands: [{
      id: "host-local-socket",
      argv: [process.execPath, "-e", `const n=await import('node:net');const s=n.createServer();s.listen(${JSON.stringify(path.join(ROOT, "host-probe.sock"))},()=>s.close())`],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(hostUnixSocket.state, "FAIL");
  assert.ok(hostUnixSocket.networkAttempts.some((attempt) =>
    attempt.includes("net listen")
  ));

  const hostServer = http.createServer((_request, response) => response.end("host-state"));
  await new Promise((resolve, reject) => {
    hostServer.once("error", reject);
    hostServer.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => hostServer.close(resolve)));
  const hostPort = hostServer.address().port;
  const allowedBrowserLoopback = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-NETWORK",
    browserConnection: {
      wsEndpoint: `ws://127.0.0.1:${hostPort}/browser-authority`,
      port: hostPort,
    },
    commands: [{
      id: "browser-loopback",
      argv: [process.execPath, "-e", `const r=await fetch("http://127.0.0.1:${hostPort}/state");if(await r.text()!=="host-state")process.exit(9)`],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(allowedBrowserLoopback.state, "PASS");
  assert.deepEqual(allowedBrowserLoopback.networkAttempts, []);

  const oppositeFamilyServer = http.createServer((_request, response) => response.end("opposite-family-state"));
  await new Promise((resolve, reject) => {
    oppositeFamilyServer.once("error", reject);
    oppositeFamilyServer.listen(hostPort, "::1", resolve);
  });
  context.after(() => new Promise((resolve) => oppositeFamilyServer.close(resolve)));
  const deniedOppositeFamily = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-NETWORK",
    browserConnection: {
      wsEndpoint: `ws://127.0.0.1:${hostPort}/browser-authority`,
      port: hostPort,
    },
    commands: [{
      id: "opposite-family-loopback",
      argv: [process.execPath, "-e", `await fetch("http://[::1]:${hostPort}/state")`],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(deniedOppositeFamily.state, "FAIL");
  assert.ok(deniedOppositeFamily.networkAttempts.some((attempt) =>
    attempt.includes(`::1`)
  ));

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

function qualificationPng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.alloc(width * 4 + 1);
  const decoded = Buffer.alloc(row.length * height);
  for (let index = 0; index < height; index += 1) row.copy(decoded, index * row.length);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(decoded)), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function qualificationHash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function qualificationCase(context) {
  const root = await temporaryRoot(context);
  const fixtureId = "brochure-local-service";
  const fixturesRoot = path.join(root, "fixtures");
  const fixtureRoot = path.join(fixturesRoot, fixtureId);
  await fs.mkdir(fixtureRoot, { recursive: true });
  const briefBytes = Buffer.from(JSON.stringify({ expectedCoreSelectors: ["main"], expectedActionSelectors: ["#cta"] }));
  const pageIrBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, purpose: fixtureId }));
  const fixture = {
    schemaVersion: 1, id: fixtureId, purpose: fixtureId, providerMode: "recorded-or-stubbed",
    inputs: [
      { path: "brief.json", sha256: qualificationHash(briefBytes) },
      { path: "page-ir.json", sha256: qualificationHash(pageIrBytes) },
    ],
  };
  const fixtureBytes = Buffer.from(JSON.stringify(fixture));
  await fs.writeFile(path.join(fixtureRoot, "brief.json"), briefBytes);
  await fs.writeFile(path.join(fixtureRoot, "page-ir.json"), pageIrBytes);
  await fs.writeFile(path.join(fixtureRoot, "fixture.json"), fixtureBytes);

  const siteRoot = path.join(root, "site");
  await fs.mkdir(siteRoot);
  const htmlBytes = Buffer.from("<!doctype html><main><a id=\"cta\">Go</a></main>");
  await fs.writeFile(path.join(siteRoot, "index.html"), htmlBytes);
  const siteFiles = [{ path: "index.html", sizeBytes: htmlBytes.length, sha256: qualificationHash(htmlBytes) }];
  const buildHash = qualificationHash(Buffer.from(`index.html\0${htmlBytes.length}\0${qualificationHash(htmlBytes)}\0`));
  const candidateManifest = {
    schemaVersion: 1, entry: "index.html", files: siteFiles,
    totalBytes: htmlBytes.length, buildSha256: buildHash,
  };
  const candidateBytes = Buffer.from(`${JSON.stringify(candidateManifest, null, 2)}\n`);
  await fs.writeFile(path.join(siteRoot, "candidate-manifest.json"), candidateBytes);
  const siteInventory = [...siteFiles, {
    path: "candidate-manifest.json", sizeBytes: candidateBytes.length, sha256: qualificationHash(candidateBytes),
  }].sort((left, right) => left.path.localeCompare(right.path));
  const contract = {
    contractVersion: "1.0.0", contractSha256: "a".repeat(64), registrySha256: "b".repeat(64),
    sourceCommit: "c".repeat(40), corpus: [fixtureId],
    fixtureManifestSha256: { [fixtureId]: qualificationHash(fixtureBytes) },
    fixtureBuildSha256: { [fixtureId]: buildHash }, browserAuthority: TEST_BROWSER_AUTHORITY,
    runtimeAuthority: TEST_RUNTIME_AUTHORITY, evaluations: [{ id: "EVAL-QUAL-001" }],
  };
  const prepared = await prepareEvaluationRun({
    root, runsRoot: path.join(root, "runs"), runId: "qualification-test", contract,
    fixturesRoot, evaluatedGitSha: "d".repeat(40), createdAt: "2026-08-24T00:00:00.000Z",
  });

  const browserSource = path.join(root, "browser-source");
  await fs.mkdir(path.join(browserSource, "screenshots"), { recursive: true });
  await fs.writeFile(path.join(browserSource, "candidate-manifest.json"), candidateBytes);
  const dimensions = new Map([["desktop", [1440, 900]], ["tablet", [768, 1024]], ["mobile", [390, 844]], ["no-js", [1440, 900]], ["reduced-motion", [1440, 900]]]);
  const screenshots = [];
  for (const [id, [width, height]] of dimensions) {
    const bytes = qualificationPng(width, height);
    await fs.writeFile(path.join(browserSource, `screenshots/${id}.png`), bytes);
    screenshots.push({ path: `screenshots/${id}.png`, sizeBytes: bytes.length, sha256: qualificationHash(bytes) });
  }
  screenshots.sort((left, right) => left.path.localeCompare(right.path));
  const captures = [...dimensions].map(([id, [width, height]]) => {
    const capture = {
      id, viewport: { id: ["desktop", "tablet", "mobile"].includes(id) ? id : "desktop", width, height },
      javascriptEnabled: id !== "no-js", reducedMotion: id === "reduced-motion" ? "reduce" : "no-preference",
      navigation: { path: "/", status: 200, links: [] },
      coreContent: [{ selector: "main", present: true, visible: true, text: "Go" }],
      primaryActions: [{ selector: "#cta", present: true, visible: true, href: null, text: "Go" }],
      javascriptMarker: null, reducedMotionMatches: id === "reduced-motion", motionObservations: [],
      serviceWorkerRegistrations: 0, consoleErrors: [], pageErrors: [], localResourceFailures: [], blockedRequests: [],
      metrics: { domContentLoadedMs: 1, totalTransferBytes: 1, imageTransferBytes: 0, cpuThrottleRate: 4 },
      screenshot: screenshots.find((entry) => entry.path === `screenshots/${id}.png`),
    };
    if (id === "reduced-motion") capture.qualification = { reducedMotion: { matches: true, allMotionDisabled: true, activeMotion: [] } };
    else if (id !== "no-js") capture.qualification = {
      horizontalOverflow: false, overflowingElements: [],
      keyboard: { reachedSelectors: [], unreachedSelectors: ["#cta"], focusSequence: [] },
      accessibility: { seriousOrCritical: [], colorContrast: [] },
    };
    return capture;
  });
  const evidence = {
    schemaVersion: 1,
    fixtureBinding: { fixtureId, fixtureManifestSha256: qualificationHash(fixtureBytes), buildSha256: buildHash },
    browserBinding: TEST_BROWSER_AUTHORITY, qualificationChecks: true, providerCalls: 0,
    networkIsolation: "darwin-sandbox-exec-loopback-only", viewports: [
      { id: "desktop", width: 1440, height: 900 }, { id: "tablet", width: 768, height: 1024 }, { id: "mobile", width: 390, height: 844 },
    ], attemptedExternalUrls: [], rejectedStaticRequests: [], siteInventory, captures, inventory: screenshots,
  };
  await fs.writeFile(path.join(browserSource, "browser-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  await publishImmutableEvidencePacket(path.join(prepared.directory, "browser"), fixtureId, browserSource);
  const gateReportsFile = path.join(root, "gate-reports.json");
  const provenanceFile = path.join(root, "provenance.json");
  const gateReportsBytes = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    runId: "qualification-test",
    fixtureId,
    evaluatedGitSha: "d".repeat(40),
    evaluations: [],
  }));
  await fs.writeFile(gateReportsFile, gateReportsBytes);
  await fs.writeFile(provenanceFile, JSON.stringify({
    schemaVersion: 1,
    runId: "qualification-test",
    fixtureId,
    sourceCommit: contract.sourceCommit,
    evaluatedGitSha: "d".repeat(40),
    contractSha256: contract.contractSha256,
    registrySha256: contract.registrySha256,
    fixtureManifestSha256: contract.fixtureManifestSha256[fixtureId],
    buildSha256: buildHash,
    mechanicalChecksSha256: qualificationHash(gateReportsBytes),
    providerCalls: 0,
  }));
  return { root, fixtureId, prepared, siteRoot, gateReportsFile, provenanceFile };
}

function passingReview(fixtureId, hashes) {
  const score = { score: 4, evidence: "Named human inspected the sealed rendered evidence." };
  return {
    schemaVersion: 1, reviewerName: "Devin", reviewerKind: "human", humanAttestation: true,
    reviewedAt: "2026-08-24T01:00:00.000Z", fixtureId, reviewedHashes: hashes,
    mechanicalGatesPassed: true, automaticRejections: [], dimensions: {
      briefFidelity: score, purposeTopology: score, hierarchy: score, compositionAndSpacing: score,
      typographyAndColor: score, businessSpecificity: score, referenceAlignment: score,
      responsiveBehavior: score, interactionAndMotion: score, craftAndCompleteness: score,
    }, findings: [], decision: "pass",
  };
}

test("qualification packets publish immutable pre-review evidence then ingest one trusted human review", async (context) => {
  const fixture = await qualificationCase(context);
  const pre = await assembleQualificationPreReviewPacket({
    runDirectory: fixture.prepared.directory, fixtureId: fixture.fixtureId, siteRoot: fixture.siteRoot,
    gateReportsFile: fixture.gateReportsFile, provenanceFile: fixture.provenanceFile,
  });
  const loadedPre = await loadQualificationPreReviewPacket(pre.directory, { expectedFixtureId: fixture.fixtureId });
  assert.equal(loadedPre.manifest.phase, "pre-review");
  const before = await fs.readFile(path.join(pre.directory, "pre-review.lock.json"));
  const reviewFile = path.join(fixture.root, "human-review.json");
  await fs.writeFile(reviewFile, JSON.stringify(passingReview(fixture.fixtureId, loadedPre.reviewedHashes)));
  const completed = await ingestQualificationCompletedPacket({
    runDirectory: fixture.prepared.directory, fixtureId: fixture.fixtureId,
    preReviewPacketDirectory: pre.directory, humanReviewFile: reviewFile,
    trustedAuthority: { reviewerName: "Devin", currentHashes: loadedPre.reviewedHashes },
  });
  const loaded = await loadQualificationCompletedPacket(completed.directory, {
    trustedAuthority: { reviewerName: "Devin", currentHashes: loadedPre.reviewedHashes },
  });
  assert.equal(loaded.review.decision, "pass");
  assert.deepEqual(await fs.readFile(path.join(pre.directory, "pre-review.lock.json")), before);
  await assert.rejects(assembleQualificationPreReviewPacket({
    runDirectory: fixture.prepared.directory, fixtureId: fixture.fixtureId, siteRoot: fixture.siteRoot,
    gateReportsFile: fixture.gateReportsFile, provenanceFile: fixture.provenanceFile,
  }), /already exists and is immutable/i);
  await assert.rejects(ingestQualificationCompletedPacket({
    runDirectory: fixture.prepared.directory, fixtureId: fixture.fixtureId,
    preReviewPacketDirectory: pre.directory, humanReviewFile: reviewFile,
    trustedAuthority: { reviewerName: "Devin", currentHashes: loadedPre.reviewedHashes },
  }), /already exists and is immutable/i);
});

test("qualification packets reject symlinks, missing artifacts, stale or incomplete review hashes, and open inventories", async (context) => {
  const fixture = await qualificationCase(context);
  const linkedSite = path.join(fixture.root, "linked-site");
  await fs.mkdir(linkedSite);
  await fs.symlink(path.join(fixture.siteRoot, "index.html"), path.join(linkedSite, "index.html"));
  await assert.rejects(assembleQualificationPreReviewPacket({
    runDirectory: fixture.prepared.directory, fixtureId: fixture.fixtureId, siteRoot: linkedSite,
    gateReportsFile: fixture.gateReportsFile, provenanceFile: fixture.provenanceFile,
  }), /symlink/i);
  await assert.rejects(assembleQualificationPreReviewPacket({
    runDirectory: fixture.prepared.directory, fixtureId: fixture.fixtureId, siteRoot: fixture.siteRoot,
    gateReportsFile: path.join(fixture.root, "missing.json"), provenanceFile: fixture.provenanceFile,
  }), /gate|ENOENT|regular file/i);
  const validGates = await fs.readFile(fixture.gateReportsFile);
  await fs.writeFile(fixture.gateReportsFile, "{}\n");
  await assert.rejects(assembleQualificationPreReviewPacket({
    runDirectory: fixture.prepared.directory, fixtureId: fixture.fixtureId, siteRoot: fixture.siteRoot,
    gateReportsFile: fixture.gateReportsFile, provenanceFile: fixture.provenanceFile,
  }), /gate reports.*PASS/i);
  await fs.writeFile(fixture.gateReportsFile, validGates);
  const validProvenance = await fs.readFile(fixture.provenanceFile);
  await fs.writeFile(fixture.provenanceFile, "{}\n");
  await assert.rejects(assembleQualificationPreReviewPacket({
    runDirectory: fixture.prepared.directory, fixtureId: fixture.fixtureId, siteRoot: fixture.siteRoot,
    gateReportsFile: fixture.gateReportsFile, provenanceFile: fixture.provenanceFile,
  }), /provenance.*current run/i);
  await fs.writeFile(fixture.provenanceFile, validProvenance);
  const pre = await assembleQualificationPreReviewPacket({
    runDirectory: fixture.prepared.directory, fixtureId: fixture.fixtureId, siteRoot: fixture.siteRoot,
    gateReportsFile: fixture.gateReportsFile, provenanceFile: fixture.provenanceFile,
  });
  const loaded = await loadQualificationPreReviewPacket(pre.directory);
  const badReview = passingReview(fixture.fixtureId, { ...loaded.reviewedHashes, buildSha256: "f".repeat(64) });
  const reviewFile = path.join(fixture.root, "bad-review.json");
  await fs.writeFile(reviewFile, JSON.stringify(badReview));
  await assert.rejects(ingestQualificationCompletedPacket({
    runDirectory: fixture.prepared.directory, fixtureId: fixture.fixtureId,
    preReviewPacketDirectory: pre.directory, humanReviewFile: reviewFile,
    trustedAuthority: { reviewerName: "Devin", currentHashes: loaded.reviewedHashes },
  }), /stale/i);
  delete badReview.reviewedHashes.pageIrSha256;
  await fs.writeFile(reviewFile, JSON.stringify(badReview));
  await assert.rejects(ingestQualificationCompletedPacket({
    runDirectory: fixture.prepared.directory, fixtureId: fixture.fixtureId,
    preReviewPacketDirectory: pre.directory, humanReviewFile: reviewFile,
    trustedAuthority: { reviewerName: "Devin", currentHashes: loaded.reviewedHashes },
  }), /hash/i);
  const copy = path.join(fixture.root, "open-packet");
  await fs.cp(pre.directory, copy, { recursive: true });
  await fs.chmod(copy, 0o700);
  await fs.writeFile(path.join(copy, "unexpected.json"), "{}\n");
  await assert.rejects(loadQualificationPreReviewPacket(copy), /inventory is not closed/i);
  await fs.rm(path.join(copy, "unexpected.json"));
  const lockPath = path.join(copy, "pre-review.lock.json");
  await fs.chmod(lockPath, 0o600);
  const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
  lock.files.push(lock.files[0]);
  await fs.writeFile(lockPath, JSON.stringify(lock));
  await assert.rejects(loadQualificationPreReviewPacket(copy), /inventory is not closed/i);
});
