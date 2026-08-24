import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createGitExecutionSnapshot, publishExecutionResult, runPageIrHarnessCli } from "./page-ir-harness.mjs";
import { publishImmutableEvidencePacket } from "./page-ir-harness-runner.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const execFileAsync = promisify(execFile);

function io() {
  const out = [];
  const errors = [];
  return { out, errors, writeOut: (value) => out.push(value), writeError: (value) => errors.push(value) };
}

test("canonical CLI verifies the frozen contract", async () => {
  const captured = io();
  assert.equal(await runPageIrHarnessCli(["verify"], { root: ROOT, ...captured }), 0);
  assert.equal(captured.out[0].status, "PASS");
  assert.deepEqual(captured.out[0].errors, []);
  assert.match(captured.out[0].manifestSha256, /^[a-f0-9]{64}$/);
  assert.match(captured.out[0].registrySha256, /^[a-f0-9]{64}$/);
});

test("execution snapshots contain exactly committed source with shared dependencies", async () => {
  const { stdout: headOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: ROOT });
  const head = headOutput.trim();
  const { stdout: committedPackage } = await execFileAsync("git", ["show", `${head}:package.json`], { cwd: ROOT });
  const snapshot = await createGitExecutionSnapshot(ROOT, head);
  try {
    assert.equal(await fs.readFile(path.join(snapshot.root, "package.json"), "utf8"), committedPackage);
    assert.equal((await fs.lstat(path.join(snapshot.root, "node_modules"))).isSymbolicLink(), true);
  } finally {
    await snapshot.dispose();
  }
  await assert.rejects(fs.stat(snapshot.root), { code: "ENOENT" });
});

test("command evidence remains present until atomic publication completes", async (context) => {
  const resultsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-command-publish-"));
  context.after(() => fs.rm(resultsRoot, { recursive: true, force: true }));
  const emptySha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  await publishExecutionResult(resultsRoot, {
    schemaVersion: 1,
    evaluationId: "EVAL-SEC-003",
    state: "PASS",
    commands: [{ id: "fast", stdout: "", stderr: "" }],
    networkAttempts: [],
    meteredCalls: 0,
    providerCredentialKeysPresent: [],
    evidence: [
      { path: "artifacts/fast.stdout", sha256: emptySha },
      { path: "artifacts/fast.stderr", sha256: emptySha },
    ],
  });
  await assert.doesNotReject(fs.stat(path.join(resultsRoot, "EVAL-SEC-003/artifacts/fast.stdout")));

  await assert.rejects(publishExecutionResult(resultsRoot, {
    schemaVersion: 1,
    evaluationId: "EVAL-SEC-003",
    state: "PASS",
    commands: [{ id: "../escape", stdout: "", stderr: "" }],
    networkAttempts: [],
    meteredCalls: 0,
    providerCredentialKeysPresent: [],
    evidence: [],
  }), /command ID/i);
});

test("prepare, blocked WEB run, status, and aggregate preserve explicit states", async (context) => {
  const runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-phase-1-cli-"));
  context.after(() => fs.rm(runsRoot, { recursive: true, force: true }));
  const preparedIo = io();
  const readGitState = async () => ({ head: "d".repeat(40), clean: true });
  assert.equal(await runPageIrHarnessCli([
    "prepare", "--run-id", "cli-run", "--runs-root", runsRoot,
  ], { root: ROOT, readGitState, ...preparedIo }), 0);
  assert.equal(preparedIo.out[0].status, "PASS");
  assert.ok(preparedIo.out[0].blockers.length > 0);

  const browserPacket = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-browser-packet-"));
  await fs.writeFile(path.join(browserPacket, "browser-evidence.json"), "{}\n");
  await publishImmutableEvidencePacket(
    path.join(runsRoot, "cli-run", "browser"),
    "brochure-local-service",
    browserPacket,
  );
  await fs.rm(browserPacket, { recursive: true, force: true });

  const runIo = io();
  assert.equal(await runPageIrHarnessCli([
    "run", "--run-id", "cli-run", "--runs-root", runsRoot,
    "--evaluation", "EVAL-WEB-001",
  ], { root: ROOT, readGitState, ...runIo }), 3);
  assert.equal(runIo.out[0].status, "BLOCKED");

  const statusIo = io();
  assert.equal(await runPageIrHarnessCli([
    "status", "--run-id", "cli-run", "--runs-root", runsRoot,
  ], { root: ROOT, ...statusIo }), 3);
  const states = new Map(statusIo.out[0].results.map((result) => [result.evaluationId, result.state]));
  assert.equal(states.get("EVAL-WEB-001"), "BLOCKED");
  assert.equal(states.get("EVAL-SEC-003"), "NOT_RUN");

  const aggregateIo = io();
  assert.equal(await runPageIrHarnessCli([
    "aggregate", "--run-id", "cli-run", "--runs-root", runsRoot,
  ], { root: ROOT, ...aggregateIo }), 3);
  const repeatedIo = io();
  assert.equal(await runPageIrHarnessCli([
    "aggregate", "--run-id", "cli-run", "--runs-root", runsRoot,
  ], { root: ROOT, ...repeatedIo }), 2);
  assert.match(repeatedIo.errors[0].error, /already exists and is immutable/i);
});

test("CLI rejects unknown options and missing values with usage exit", async () => {
  const captured = io();
  assert.equal(await runPageIrHarnessCli(["verify", "--surprise", "yes"], { root: ROOT, ...captured }), 2);
  assert.match(captured.errors[0].error, /unknown option/i);

  const traversal = io();
  assert.equal(await runPageIrHarnessCli([
    "status", "--run-id", "../escape", "--runs-root", "/tmp",
  ], { root: ROOT, ...traversal }), 2);
  assert.match(traversal.errors[0].error, /run ID/i);
});

test("prepare and execution fail closed on dirty or changed Git authority", async (context) => {
  const runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-git-authority-"));
  context.after(() => fs.rm(runsRoot, { recursive: true, force: true }));
  const dirty = io();
  assert.equal(await runPageIrHarnessCli([
    "prepare", "--run-id", "dirty-run", "--runs-root", runsRoot,
  ], {
    root: ROOT,
    readGitState: async () => ({ head: "d".repeat(40), clean: false }),
    ...dirty,
  }), 2);
  assert.match(dirty.errors[0].error, /clean Git worktree/i);

  const prepared = io();
  assert.equal(await runPageIrHarnessCli([
    "prepare", "--run-id", "changed-run", "--runs-root", runsRoot,
  ], {
    root: ROOT,
    readGitState: async () => ({ head: "d".repeat(40), clean: true }),
    ...prepared,
  }), 0);
  let reads = 0;
  const changed = io();
  assert.equal(await runPageIrHarnessCli([
    "run", "--run-id", "changed-run", "--runs-root", runsRoot,
    "--evaluation", "EVAL-WEB-001",
  ], {
    root: ROOT,
    readGitState: async () => {
      reads += 1;
      return reads === 1
        ? { head: "d".repeat(40), clean: true }
        : { head: "e".repeat(40), clean: true };
    },
    ...changed,
  }), 2);
  assert.match(changed.errors[0].error, /different Git commit/i);
  await assert.rejects(
    fs.stat(path.join(runsRoot, "changed-run/results/EVAL-WEB-001")),
    { code: "ENOENT" },
  );
});
