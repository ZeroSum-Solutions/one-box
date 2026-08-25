import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createServer } from "vite";
import { createGitExecutionSnapshot, publishExecutionResult, runPageIrHarnessCli } from "./page-ir-harness.mjs";

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

test("execution snapshots contain committed source with lockfile-installed dependencies", async () => {
  const { stdout: headOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: ROOT });
  const head = headOutput.trim();
  const { stdout: committedPackage } = await execFileAsync("git", ["show", `${head}:package.json`], { cwd: ROOT });
  const registry = JSON.parse(await fs.readFile(
    path.join(ROOT, "docs/eval/page-ir-safe-pipeline/harness-registry.json"),
    "utf8",
  ));
  const snapshot = await createGitExecutionSnapshot(ROOT, head, registry.runtimeContract);
  try {
    assert.equal(await fs.readFile(path.join(snapshot.root, "package.json"), "utf8"), committedPackage);
    const dependencies = await fs.lstat(path.join(snapshot.root, "node_modules"));
    assert.equal(dependencies.isSymbolicLink(), false);
    assert.equal(dependencies.isDirectory(), true);
  } finally {
    await snapshot.dispose();
  }
  await assert.rejects(fs.stat(snapshot.root), { code: "ENOENT" });
});

test("execution snapshots reject outbound symlinks before npm can mutate their targets", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-snapshot-symlink-"));
  const repository = path.join(root, "repository");
  const outside = path.join(root, "outside");
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(repository);
  await fs.mkdir(outside);
  const sentinel = path.join(outside, "sentinel.txt");
  await fs.writeFile(sentinel, "unchanged");
  await fs.writeFile(path.join(repository, "package.json"), `${JSON.stringify({
    name: "snapshot-symlink-probe",
    version: "1.0.0",
  }, null, 2)}\n`);
  await fs.writeFile(path.join(repository, "package-lock.json"), `${JSON.stringify({
    name: "snapshot-symlink-probe",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: "snapshot-symlink-probe", version: "1.0.0" } },
  }, null, 2)}\n`);
  await fs.symlink(outside, path.join(repository, "node_modules"), "dir");
  await execFileAsync("git", ["init", "--quiet"], { cwd: repository });
  await execFileAsync("git", ["add", "."], { cwd: repository });
  await execFileAsync("git", [
    "-c", "user.name=OneBox Test", "-c", "user.email=onebox-test.invalid",
    "commit", "--quiet", "-m", "snapshot fixture",
  ], { cwd: repository });
  const { stdout: headOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository });
  const registry = JSON.parse(await fs.readFile(
    path.join(ROOT, "docs/eval/page-ir-safe-pipeline/harness-registry.json"),
    "utf8",
  ));

  await assert.rejects(
    createGitExecutionSnapshot(repository, headOutput.trim(), registry.runtimeContract),
    /snapshot symlink escapes authority/i,
  );
  assert.equal(await fs.readFile(sentinel, "utf8"), "unchanged");
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

test("WEB run injects the prepared input root at the trusted coordinator seam", async (context) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-sealed-input-cli-"));
  context.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const runsRoot = path.join(temporary, "runs");
  const fixturesRoot = path.join(ROOT, "docs/eval/page-ir-safe-pipeline/fixtures");
  const expectedBrief = await fs.readFile(
    path.join(fixturesRoot, "brochure-local-service", "brief.json"),
    "utf8",
  );
  const readGitState = async () => ({ head: "d".repeat(40), clean: true });
  const preparedIo = io();
  assert.equal(await runPageIrHarnessCli([
    "prepare", "--run-id", "sealed-cli-run", "--runs-root", runsRoot,
    "--fixtures-root", fixturesRoot,
  ], { root: ROOT, readGitState, ...preparedIo }), 0);
  const runDirectory = path.join(runsRoot, "sealed-cli-run");
  const runManifest = JSON.parse(
    await fs.readFile(path.join(runDirectory, "run-manifest.json"), "utf8"),
  );
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  context.after(() => vite.close());
  const corpus = await vite.ssrLoadModule("/src/lib/test-fixtures/pageIrQualityCorpus.ts");
  for (const fixtureId of runManifest.corpus) {
    const siteRoot = await fs.mkdtemp(path.join(temporary, "compiled-site-"));
    await corpus.materializePageIrQualityFixture(fixtureId, siteRoot, fixturesRoot);
    const captureIo = io();
    assert.equal(await runPageIrHarnessCli([
      "capture", "--run-id", "sealed-cli-run", "--runs-root", runsRoot,
      "--fixture", fixtureId, "--site-root", siteRoot,
    ], {
      root: ROOT,
      readGitState,
      createExecutionSnapshot: async () => ({ root: ROOT, dispose: async () => {} }),
      ...captureIo,
    }), 0, JSON.stringify(captureIo.errors));
    assert.equal(captureIo.out[0].status, "CAPTURED");
  }

  let invocation;
  const runIo = io();
  const exitCode = await runPageIrHarnessCli([
    "run", "--run-id", "sealed-cli-run", "--runs-root", runsRoot,
    "--evaluation", "EVAL-WEB-001",
  ], {
    root: ROOT,
    readGitState,
    createExecutionSnapshot: async () => ({ root: ROOT, dispose: async () => {} }),
    executeEvaluationFn: async (options) => {
      invocation = options;
      const marker = await fs.readFile(path.join(
        options.inputsRoot,
        "brochure-local-service",
        "brief.json",
      ), "utf8");
      assert.equal(marker, expectedBrief);
      assert.equal(options.browserRoot, path.join(runDirectory, "browser"));
      return {
        schemaVersion: 1,
        evaluationId: options.evaluationId,
        state: "BLOCKED",
        blockers: [{ code: "TEST_DOUBLE", detail: "trusted coordinator seam" }],
        commands: [],
        evidence: [],
      };
    },
    ...runIo,
  });
  assert.equal(exitCode, 3, JSON.stringify(runIo.errors));
  assert.equal(
    invocation.inputsRoot,
    path.join(runsRoot, "sealed-cli-run", "inputs"),
  );
  assert.equal(invocation.environment, process.env);
});

test("WEB run remains BLOCKED until all immutable browser packets exist", async (context) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-browser-prerequisite-"));
  context.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const runsRoot = path.join(temporary, "runs");
  const readGitState = async () => ({ head: "d".repeat(40), clean: true });
  const preparedIo = io();
  assert.equal(await runPageIrHarnessCli([
    "prepare", "--run-id", "missing-browser", "--runs-root", runsRoot,
    "--fixtures-root", path.join(ROOT, "docs/eval/page-ir-safe-pipeline/fixtures"),
  ], { root: ROOT, readGitState, ...preparedIo }), 0);

  const runIo = io();
  assert.equal(await runPageIrHarnessCli([
    "run", "--run-id", "missing-browser", "--runs-root", runsRoot,
    "--evaluation", "EVAL-WEB-001",
  ], {
    root: ROOT,
    readGitState,
    executeEvaluationFn: async (options) => {
      assert.equal(options.blockers.length, 6);
      return {
        schemaVersion: 1,
        evaluationId: options.evaluationId,
        state: "BLOCKED",
        blockers: options.blockers,
        commands: [],
        evidence: [],
      };
    },
    ...runIo,
  }), 3);
  const result = JSON.parse(await fs.readFile(path.join(
    runsRoot,
    "missing-browser/results/EVAL-WEB-001/result.json",
  ), "utf8"));
  assert.equal(result.state, "BLOCKED");
  assert.equal(result.blockers.length, 6);
  assert.ok(result.blockers.every((blocker) => blocker.code === "BROWSER_EVIDENCE_MISSING"));
});

test("browser-dependent credential-free runs receive only the frozen Chromium capability", async (context) => {
  const runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-browser-runtime-cli-"));
  context.after(() => fs.rm(runsRoot, { recursive: true, force: true }));
  const readGitState = async () => ({ head: "d".repeat(40), clean: true });
  const preparedIo = io();
  assert.equal(await runPageIrHarnessCli([
    "prepare", "--run-id", "browser-runtime", "--runs-root", runsRoot,
  ], { root: ROOT, readGitState, ...preparedIo }), 0);
  const registry = JSON.parse(await fs.readFile(
    path.join(ROOT, "docs/eval/page-ir-safe-pipeline/harness-registry.json"),
    "utf8",
  ));
  const frozenBrowser = {
    binding: registry.browserContract,
    bundleRoot: "/tmp/frozen-chromium-bundle",
    executablePath: "/tmp/frozen-chromium-bundle/chrome",
  };
  const browserServer = {
    wsEndpoint: "ws://127.0.0.1:43210/evaluation",
    port: 43210,
    close: async () => {},
  };
  let invocation;
  const runIo = io();
  assert.equal(await runPageIrHarnessCli([
    "run", "--run-id", "browser-runtime", "--runs-root", runsRoot,
    "--evaluation", "EVAL-CAND-001",
  ], {
    root: ROOT,
    readGitState,
    createExecutionSnapshot: async () => ({ root: ROOT, dispose: async () => {} }),
    inspectBrowserAuthorityFn: async () => frozenBrowser,
    launchBrowserServerFn: async (binding, readableRoot) => {
      assert.deepEqual(binding, registry.browserContract);
      assert.equal(readableRoot, ROOT);
      return browserServer;
    },
    executeEvaluationFn: async (options) => {
      invocation = options;
      return {
        schemaVersion: 1,
        evaluationId: options.evaluationId,
        state: "BLOCKED",
        blockers: [{ code: "TEST_DOUBLE", detail: "browser runtime seam" }],
        commands: [],
        evidence: [],
      };
    },
    ...runIo,
  }), 3, JSON.stringify(runIo.errors));
  assert.deepEqual(invocation.browserConnection, {
    wsEndpoint: browserServer.wsEndpoint,
    port: browserServer.port,
  });
});

test("browser cleanup failure still disposes the immutable execution snapshot", async (context) => {
  const runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-browser-cleanup-cli-"));
  context.after(() => fs.rm(runsRoot, { recursive: true, force: true }));
  const readGitState = async () => ({ head: "d".repeat(40), clean: true });
  const preparedIo = io();
  assert.equal(await runPageIrHarnessCli([
    "prepare", "--run-id", "browser-cleanup", "--runs-root", runsRoot,
  ], { root: ROOT, readGitState, ...preparedIo }), 0);
  const registry = JSON.parse(await fs.readFile(
    path.join(ROOT, "docs/eval/page-ir-safe-pipeline/harness-registry.json"),
    "utf8",
  ));
  let disposed = false;
  const runIo = io();
  assert.equal(await runPageIrHarnessCli([
    "run", "--run-id", "browser-cleanup", "--runs-root", runsRoot,
    "--evaluation", "EVAL-CAND-001",
  ], {
    root: ROOT,
    readGitState,
    createExecutionSnapshot: async () => ({
      root: ROOT,
      dispose: async () => { disposed = true; },
    }),
    inspectBrowserAuthorityFn: async () => ({
      binding: registry.browserContract,
      bundleRoot: "/tmp/frozen-chromium-bundle",
      executablePath: "/tmp/frozen-chromium-bundle/chrome",
    }),
    launchBrowserServerFn: async () => ({
      wsEndpoint: "ws://127.0.0.1:43210/evaluation",
      port: 43210,
      close: async () => { throw new Error("browser cleanup failed"); },
    }),
    executeEvaluationFn: async (options) => ({
      schemaVersion: 1,
      evaluationId: options.evaluationId,
      state: "PASS",
      commands: [],
      evidence: [],
    }),
    ...runIo,
  }), 2);
  assert.equal(disposed, true);
  assert.match(runIo.errors[0].error, /browser cleanup failed/);
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

test("render command publishes coordinator-owned production browser evidence for the exact rendered routes", async (context) => {
  const runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-rendered-cli-"));
  context.after(() => fs.rm(runsRoot, { recursive: true, force: true }));
  const readGitState = async () => ({ head: "d".repeat(40), clean: true });
  const preparedIo = io();
  assert.equal(await runPageIrHarnessCli([
    "prepare", "--run-id", "rendered-cli", "--runs-root", runsRoot,
  ], { root: ROOT, readGitState, ...preparedIo }), 0);
  const emptySha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  let invocation;
  const renderedIo = io();
  assert.equal(await runPageIrHarnessCli([
    "render", "--run-id", "rendered-cli", "--runs-root", runsRoot,
  ], {
    root: ROOT,
    readGitState,
    createExecutionSnapshot: async () => ({ root: ROOT, dispose: async () => {} }),
    executeRenderedEvidenceFn: async (options) => {
      invocation = options;
      return options.evaluationIds.map((evaluationId) => ({
        schemaVersion: 1,
        evaluationId,
        state: "PASS",
        commands: [{ id: "production-browser", stdout: "", stderr: "" }],
        networkAttempts: [],
        meteredCalls: 0,
        providerCredentialKeysPresent: [],
        evidence: [
          { path: "artifacts/production-browser.stdout", sha256: emptySha },
          { path: "artifacts/production-browser.stderr", sha256: emptySha },
        ],
      }));
    },
    ...renderedIo,
  }), 0, JSON.stringify(renderedIo.errors));
  assert.equal(invocation.evaluationIds.length, 9);
  assert.ok(invocation.evaluationIds.includes("EVAL-OPS-002"));
  assert.equal(renderedIo.out[0].status, "PASS");
  const published = await fs.readdir(path.join(runsRoot, "rendered-cli/results"));
  assert.deepEqual(published.sort(), [...invocation.evaluationIds].sort());
});

test("run refuses to collapse human and owner authority into untrusted CLI options", async (context) => {
  const runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-coordinator-cli-"));
  context.after(() => fs.rm(runsRoot, { recursive: true, force: true }));
  const readGitState = async () => ({ head: "d".repeat(40), clean: true });
  const preparedIo = io();
  assert.equal(await runPageIrHarnessCli([
    "prepare", "--run-id", "coordinator-cli", "--runs-root", runsRoot,
  ], { root: ROOT, readGitState, ...preparedIo }), 0);
  const runIo = io();
  assert.equal(await runPageIrHarnessCli([
    "run", "--run-id", "coordinator-cli", "--runs-root", runsRoot,
    "--evaluation", "EVAL-QUAL-001",
  ], {
    root: ROOT,
    readGitState,
    createExecutionSnapshot: async () => assert.fail("coordinator evidence must not execute a Vitest snapshot"),
    ...runIo,
  }), 2);
  assert.match(runIo.errors[0].error, /trusted host coordinator/i);
});

test("materialize command executes the frozen fixture from the bound Git snapshot", async (context) => {
  const runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-materialize-cli-"));
  context.after(() => fs.rm(runsRoot, { recursive: true, force: true }));
  const readGitState = async () => ({ head: "d".repeat(40), clean: true });
  const preparedIo = io();
  assert.equal(await runPageIrHarnessCli([
    "prepare", "--run-id", "materialize-cli", "--runs-root", runsRoot,
  ], { root: ROOT, readGitState, ...preparedIo }), 0);
  let invocation;
  let assembled;
  const captured = io();
  assert.equal(await runPageIrHarnessCli([
    "materialize", "--run-id", "materialize-cli", "--runs-root", runsRoot,
    "--fixture", "campaign-landing", "--output-root", "/tmp/qualification-output",
  ], {
    root: ROOT,
    readGitState,
    createExecutionSnapshot: async () => ({ root: "/sealed/source", dispose: async () => {} }),
    materializeQualificationFn: async (options) => {
      invocation = options;
      return {
        fixtureId: options.fixtureId,
        siteRoot: "/tmp/qualification-output/campaign-landing/site",
        gateReportsFile: "/tmp/qualification-output/campaign-landing/gate-reports.json",
        provenanceFile: "/tmp/qualification-output/campaign-landing/provenance.json",
      };
    },
    assembleQualificationFn: async (options) => {
      assembled = options;
      return {
        directory: "/sealed/pre-review/campaign-landing",
        packetSha256: "a".repeat(64),
        reviewedHashes: { buildSha256: "b".repeat(64) },
      };
    },
    ...captured,
  }), 0, JSON.stringify(captured.errors));
  assert.equal(invocation.snapshotRoot, "/sealed/source");
  assert.equal(invocation.fixtureId, "campaign-landing");
  assert.equal(assembled.fixtureId, "campaign-landing");
  assert.equal(captured.out[0].status, "PRE_REVIEW_READY");
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

test("every command rejects a self-consistent run with substituted frozen authority", async (context) => {
  const runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-forged-run-authority-"));
  context.after(() => fs.rm(runsRoot, { recursive: true, force: true }));
  const readGitState = async () => ({ head: "d".repeat(40), clean: true });
  const prepared = io();
  assert.equal(await runPageIrHarnessCli([
    "prepare", "--run-id", "forged-run", "--runs-root", runsRoot,
  ], { root: ROOT, readGitState, ...prepared }), 0);

  const runDirectory = path.join(runsRoot, "forged-run");
  const manifestPath = path.join(runDirectory, "run-manifest.json");
  const lockPath = path.join(runDirectory, "run-manifest.lock.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.browserAuthority.bundleSha256 = "c".repeat(64);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const lockBytes = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    runId: manifest.runId,
    sha256: crypto.createHash("sha256").update(manifestBytes).digest("hex"),
  }, null, 2)}\n`, "utf8");
  await fs.chmod(manifestPath, 0o600);
  await fs.chmod(lockPath, 0o600);
  await fs.writeFile(manifestPath, manifestBytes);
  await fs.writeFile(lockPath, lockBytes);

  const status = io();
  assert.equal(await runPageIrHarnessCli([
    "status", "--run-id", "forged-run", "--runs-root", runsRoot,
  ], { root: ROOT, ...status }), 2);
  assert.match(status.errors[0].error, /different frozen authority/i);
});
