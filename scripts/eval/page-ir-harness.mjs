#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  createVersionedManifestLock,
  validateEvaluationContract,
} from "./page-ir-harness-contract.mjs";
import {
  aggregateEvaluationResults,
  executeEvaluation,
  loadPreparedEvaluationRun,
  prepareEvaluationRun,
  publishImmutableEvidencePacket,
  writeImmutableAggregate,
  writeImmutableEvaluationPacket,
  writeImmutableEvaluationResult,
  validateCommandId,
  validateRunId,
} from "./page-ir-harness-runner.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_ROOT = path.resolve(import.meta.dirname, "../..");
const DEFAULT_RUNS_ROOT = path.join(DEFAULT_ROOT, "docs/eval/page-ir-safe-pipeline/runs");

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) fail(`missing value for ${key ?? "option"}`);
    const name = key.slice(2);
    if (name in options) fail(`duplicate option: ${key}`);
    options[name] = value;
    index += 1;
  }
  if (!new Set(["verify", "prepare", "run", "status", "aggregate", "capture", "lock"]).has(command)) {
    fail("usage: page-ir-harness.mjs verify|prepare|run|status|aggregate|capture|lock [options]");
  }
  return { command, options };
}

function onlyOptions(options, allowed) {
  for (const key of Object.keys(options)) if (!allowed.includes(key)) fail(`unknown option: --${key}`);
}

function requireOption(options, name) {
  if (!options[name]) fail(`--${name} is required`);
  return options[name];
}

async function validatedContract(root) {
  const verification = await validateEvaluationContract({ root });
  if (verification.errors.length > 0 || !verification.manifest || !verification.registry) {
    fail(`evaluation contract invalid: ${verification.errors.join("; ")}`);
  }
  return verification;
}

async function readRepositoryGitState(root) {
  const [{ stdout: head }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root }),
    execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root }),
  ]);
  return { head: head.trim(), clean: status.length === 0 };
}

async function requireCleanGitAuthority(root, readGitState, expectedHead) {
  const state = await readGitState(root);
  if (!state || !/^[a-f0-9]{40}$/.test(state.head ?? "") || state.clean !== true) {
    fail("evaluation execution requires a clean Git worktree");
  }
  if (expectedHead && state.head !== expectedHead) fail("prepared run is bound to a different Git commit");
  return state.head;
}

function waitForChild(child, stderrChunks) {
  return new Promise((resolve, reject) => {
    child.stderr?.on("data", (chunk) => {
      if (stderrChunks.reduce((total, entry) => total + entry.length, 0) < 64 * 1024) stderrChunks.push(chunk);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code: code ?? -1, signal }));
  });
}

export async function createGitExecutionSnapshot(root, gitSha) {
  if (!/^[a-f0-9]{40}$/.test(gitSha ?? "")) fail("execution snapshot Git authority is invalid");
  const snapshotRoot = await fs.mkdtemp(path.join(process.platform === "darwin" ? "/tmp" : os.tmpdir(), "one-box-eval-source-"));
  try {
    const archiveErrors = [];
    const extractErrors = [];
    const archive = spawn("git", ["archive", "--format=tar", gitSha], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const extract = spawn("/usr/bin/tar", ["-xf", "-", "-C", snapshotRoot], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    archive.stdout.pipe(extract.stdin);
    extract.stdin.on("error", () => {});
    const [archiveExit, extractExit] = await Promise.all([
      waitForChild(archive, archiveErrors),
      waitForChild(extract, extractErrors),
    ]);
    if (archiveExit.code !== 0 || extractExit.code !== 0) {
      fail(`unable to create immutable Git execution snapshot: ${Buffer.concat([...archiveErrors, ...extractErrors]).toString("utf8").slice(0, 2000)}`);
    }
    const dependencies = await fs.realpath(path.join(root, "node_modules"));
    const dependencyStat = await fs.lstat(dependencies);
    if (dependencyStat.isSymbolicLink() || !dependencyStat.isDirectory()) fail("execution dependencies must be one physical directory");
    await fs.symlink(dependencies, path.join(snapshotRoot, "node_modules"), "dir");
    return {
      root: snapshotRoot,
      dispose: () => fs.rm(snapshotRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await fs.rm(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
}

async function loadRun(runsRoot, runId) {
  return loadPreparedEvaluationRun(path.join(path.resolve(runsRoot), runId));
}

function blockersFor(run, evaluationId) {
  return run.manifest.prerequisiteBlockers
    .filter((blocker) => blocker.evaluationIds.includes(evaluationId))
    .map(({ code, detail }) => ({ code, detail }));
}

function stateExitCode(state) {
  return state === "PASS" ? 0 : state === "FAIL" ? 1 : state === "BLOCKED" ? 3 : 4;
}

export async function publishExecutionResult(resultsRoot, result) {
  if (result.commands.length === 0) return writeImmutableEvaluationResult(resultsRoot, result);
  for (const command of result.commands) validateCommandId(command.id);
  const packetRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-eval-command-evidence-"));
  try {
    for (const command of result.commands) {
      await fs.writeFile(path.join(packetRoot, `${command.id}.stdout`), command.stdout, { flag: "wx", mode: 0o600 });
      await fs.writeFile(path.join(packetRoot, `${command.id}.stderr`), command.stderr, { flag: "wx", mode: 0o600 });
    }
    return await writeImmutableEvaluationPacket(resultsRoot, packetRoot, result);
  } finally {
    await fs.rm(packetRoot, { recursive: true, force: true });
  }
}

export async function runPageIrHarnessCli(
  argv,
  {
    root = DEFAULT_ROOT,
    writeOut = (value) => process.stdout.write(`${JSON.stringify(value)}\n`),
    writeError = (value) => process.stderr.write(`${JSON.stringify(value)}\n`),
    environment = process.env,
    readGitState = readRepositoryGitState,
    createExecutionSnapshot = createGitExecutionSnapshot,
  } = {},
) {
  try {
    const { command, options } = parseArgs(argv);
    if (command === "verify") {
      onlyOptions(options, []);
      const verification = await validateEvaluationContract({ root });
      const status = verification.errors.length === 0 ? "PASS" : "FAIL";
      writeOut({ status, errors: verification.errors, manifestSha256: verification.manifestSha256, registrySha256: verification.registrySha256 });
      return status === "PASS" ? 0 : 2;
    }

    if (command === "lock") {
      onlyOptions(options, ["manifest", "lock-directory"]);
      const result = await createVersionedManifestLock({
        repositoryRoot: root,
        manifestPath: requireOption(options, "manifest"),
        lockDirectory: requireOption(options, "lock-directory"),
      });
      writeOut({ status: "PASS", ...result });
      return 0;
    }

    const verification = await validatedContract(root);
    const runsRoot = options["runs-root"] ? path.resolve(options["runs-root"]) : DEFAULT_RUNS_ROOT;
    const runId = validateRunId(requireOption(options, "run-id"));

    if (command === "prepare") {
      onlyOptions(options, ["run-id", "runs-root", "fixtures-root"]);
      const evaluatedGitSha = await requireCleanGitAuthority(root, readGitState);
      const prepared = await prepareEvaluationRun({
        root,
        runsRoot,
        runId,
        fixturesRoot: options["fixtures-root"] ? path.resolve(options["fixtures-root"]) : undefined,
        evaluatedGitSha,
        contract: {
          contractVersion: verification.manifest.contractVersion,
          contractSha256: verification.manifestSha256,
          registrySha256: verification.registrySha256,
          sourceCommit: verification.manifest.sourceCommit,
          corpus: verification.manifest.corpus,
          evaluations: verification.manifest.evaluations,
        },
      });
      writeOut({ status: "PASS", run: prepared.directory, blockers: prepared.manifest.prerequisiteBlockers });
      return 0;
    }

    const run = await loadRun(runsRoot, runId);
    if (
      run.manifest.contractSha256 !== verification.manifestSha256 ||
      run.manifest.registrySha256 !== verification.registrySha256
    ) fail("prepared run is bound to a different frozen contract");

    if (command === "run") {
      onlyOptions(options, ["run-id", "runs-root", "evaluation"]);
      await requireCleanGitAuthority(root, readGitState, run.manifest.evaluatedGitSha);
      const evaluationId = requireOption(options, "evaluation");
      const registration = verification.registry.evaluations[evaluationId];
      const blockers = blockersFor(run, evaluationId);
      if (!registration && blockers.length === 0) blockers.push({ code: "EVALUATOR_NOT_REGISTERED", detail: evaluationId });
      let snapshot;
      let result;
      try {
        if (registration && blockers.length === 0) snapshot = await createExecutionSnapshot(root, run.manifest.evaluatedGitSha);
        const executionRoot = snapshot?.root ?? root;
        const commands = registration ? [{
          id: "credential-free-suite",
          argv: [
            process.execPath,
            path.join(executionRoot, "node_modules/vitest/vitest.mjs"),
            "run",
            ...registration.testFiles,
            "--maxWorkers=1",
            "--reporter=default",
          ],
        }] : [];
        result = await executeEvaluation({ root: executionRoot, evaluationId, commands, blockers, environment, timeoutMs: 180_000 });
      } finally {
        await snapshot?.dispose();
      }
      await requireCleanGitAuthority(root, readGitState, run.manifest.evaluatedGitSha);
      await publishExecutionResult(path.join(run.directory, "results"), result);
      writeOut({ status: result.state, evaluationId, meteredCalls: result.meteredCalls ?? 0 });
      return stateExitCode(result.state);
    }

    if (command === "capture") {
      onlyOptions(options, ["run-id", "runs-root", "fixture", "site-root", "core-selectors", "action-selectors"]);
      await requireCleanGitAuthority(root, readGitState, run.manifest.evaluatedGitSha);
      const fixtureId = requireOption(options, "fixture");
      if (!verification.manifest.corpus.includes(fixtureId)) fail("fixture is not in the frozen corpus");
      const fixtureInput = path.join(run.directory, "inputs", fixtureId, "fixture.json");
      await fs.stat(fixtureInput).catch(() => fail("fixture was not prepared in this immutable run"));
      const snapshot = await createExecutionSnapshot(root, run.manifest.evaluatedGitSha);
      let packet;
      try {
        const adapterUrl = pathToFileURL(path.join(snapshot.root, "scripts/eval/page-ir-harness-browser.mjs"));
        adapterUrl.searchParams.set("gitSha", run.manifest.evaluatedGitSha);
        const { capturePageIrBrowserEvidence } = await import(adapterUrl.href);
        packet = await capturePageIrBrowserEvidence({
          siteRoot: path.resolve(requireOption(options, "site-root")),
          viewports: verification.manifest.viewports,
          coreContentSelectors: requireOption(options, "core-selectors").split(",").filter(Boolean),
          primaryActionSelectors: requireOption(options, "action-selectors").split(",").filter(Boolean),
        });
      } finally {
        await snapshot.dispose();
      }
      try {
        await requireCleanGitAuthority(root, readGitState, run.manifest.evaluatedGitSha);
        const published = await publishImmutableEvidencePacket(
          path.join(run.directory, "browser"),
          fixtureId,
          packet.packetRoot,
        );
        writeOut({ status: "CAPTURED", fixtureId, directory: published.directory, inventory: published.inventory });
      } finally {
        await fs.rm(packet.packetRoot, { recursive: true, force: true });
      }
      return 0;
    }

    const aggregate = await aggregateEvaluationResults({
      resultsRoot: path.join(run.directory, "results"),
      evaluationIds: verification.manifest.evaluations.map((entry) => entry.id),
    });
    if (command === "aggregate") {
      onlyOptions(options, ["run-id", "runs-root"]);
      await writeImmutableAggregate(run.directory, aggregate);
    } else {
      onlyOptions(options, ["run-id", "runs-root"]);
    }
    writeOut({ status: aggregate.exitCode === 0 ? "PASS" : "INCOMPLETE", ...aggregate });
    return aggregate.exitCode;
  } catch (error) {
    writeError({ status: "ERROR", error: error instanceof Error ? error.message : String(error) });
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runPageIrHarnessCli(process.argv.slice(2));
}
