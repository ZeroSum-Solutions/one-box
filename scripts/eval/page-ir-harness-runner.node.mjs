import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  aggregateEvaluationResults,
  executeEvaluation,
  loadPreparedEvaluationRun,
  prepareEvaluationRun,
  sanitizeEvaluationEnvironment,
  writeImmutableAggregate,
  writeImmutableEvaluationResult,
  writeImmutableEvaluationPacket,
} from "./page-ir-harness-runner.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

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
});

test("preparation publishes one immutable closed input run and rejects bad fixtures", async (context) => {
  const root = await temporaryRoot(context);
  const fixtures = path.join(root, "fixtures");
  const input = Buffer.from("approved fixture bytes\n");
  await fs.mkdir(path.join(fixtures, "brochure-local-service"), { recursive: true });
  await fs.writeFile(path.join(fixtures, "brochure-local-service", "brief.json"), input);
  await fs.writeFile(path.join(fixtures, "brochure-local-service", "fixture.json"), JSON.stringify({
    schemaVersion: 1,
    id: "brochure-local-service",
    purpose: "brochure-local-service",
    providerMode: "recorded-or-stubbed",
    inputs: [{ path: "brief.json", sha256: crypto.createHash("sha256").update(input).digest("hex") }],
  }));
  const contract = {
    contractVersion: "1.0.0",
    contractSha256: "a".repeat(64),
    registrySha256: "b".repeat(64),
    sourceCommit: "c".repeat(40),
    corpus: ["brochure-local-service"],
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
  await assert.rejects(prepareEvaluationRun({ root, runsRoot, runId: "bad-hash", contract, fixturesRoot: fixtures, evaluatedGitSha: "d".repeat(40) }), /hash mismatch/i);
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

  const loopback = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-LOOPBACK",
    commands: [{
      id: "loopback-http",
      argv: [process.execPath, "-e", "const h=await import('node:http');const s=h.createServer((q,r)=>r.end('ok'));s.listen(0,'127.0.0.1',async()=>{const r=await fetch(`http://127.0.0.1:${s.address().port}`);if(await r.text()!=='ok')process.exitCode=8;s.close()})"],
    }],
    timeoutMs: 10_000,
  });
  assert.equal(loopback.state, "PASS");

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

  const denied = await executeEvaluation({
    root: ROOT,
    evaluationId: "EVAL-SEC-003-NETWORK",
    commands: [{ id: "network", argv: [process.execPath, "-e", "await fetch('https://example.com')"] }],
    timeoutMs: 10_000,
  });
  assert.equal(denied.state, "FAIL");
  assert.ok(denied.networkAttempts.some((attempt) => attempt.includes("example.com")));

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
