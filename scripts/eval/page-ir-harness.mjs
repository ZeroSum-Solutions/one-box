#!/usr/bin/env node
import crypto from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";
import {
  createVersionedManifestLock,
  validateEvaluationContract,
} from "./page-ir-harness-contract.mjs";
import {
  aggregateEvaluationResults,
  assembleQualificationPreReviewPacket,
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
import {
  executeProductionRenderedEvidence,
  renderedEvaluationIds,
} from "./page-ir-harness-rendered.mjs";
import { materializeQualificationFixture } from "./page-ir-harness-qualification.mjs";

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
  if (!new Set(["verify", "prepare", "run", "render", "status", "aggregate", "capture", "materialize", "lock"]).has(command)) {
    fail("usage: page-ir-harness.mjs verify|prepare|run|render|status|aggregate|capture|materialize|lock [options]");
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
  await validateCoordinatorRuntime(verification.registry.runtimeContract);
  return verification;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function readStableToolFile(file, label, { allowHardlinks = false } = {}) {
  const initial = await fs.lstat(file, { bigint: true });
  if (
    initial.isSymbolicLink() || !initial.isFile() || initial.nlink < 1n ||
    (!allowHardlinks && initial.nlink !== 1n) || initial.size > 128n * 1024n * 1024n
  ) {
    fail(`${label} must be one bounded physical file`);
  }
  const handle = await fs.open(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      opened.dev !== initial.dev || opened.ino !== initial.ino ||
      opened.size !== initial.size || opened.nlink !== initial.nlink
    ) {
      fail(`${label} changed before read`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      after.dev !== opened.dev || after.ino !== opened.ino ||
      after.size !== opened.size || after.nlink !== opened.nlink
    ) {
      fail(`${label} changed while read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function hashClosedToolBundle(root) {
  const physicalRoot = await fs.realpath(root);
  if (physicalRoot !== path.resolve(root)) fail("runtime npm bundle root must be physical");
  const records = [];
  let fileCount = 0;
  let symlinkCount = 0;
  let totalBytes = 0;
  async function visit(directory, relativeDirectory) {
    const directoryStat = await fs.lstat(directory);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) fail("runtime npm bundle contains an unsafe directory");
    const entries = (await fs.readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const stat = await fs.lstat(absolute);
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        await visit(absolute, relative);
      } else if (stat.isSymbolicLink()) {
        const target = await fs.readlink(absolute);
        const resolved = path.resolve(path.dirname(absolute), target);
        if (resolved !== physicalRoot && !resolved.startsWith(`${physicalRoot}${path.sep}`)) {
          fail(`runtime npm bundle symlink escapes authority: ${relative}`);
        }
        records.push(`L\0${relative}\0${target}\0`);
        symlinkCount += 1;
      } else if (stat.isFile()) {
        const bytes = await readStableToolFile(absolute, `runtime npm bundle file ${relative}`);
        records.push(`F\0${relative}\0${bytes.length}\0${sha256(bytes)}\0`);
        fileCount += 1;
        totalBytes += bytes.length;
      } else {
        fail(`runtime npm bundle contains an unsafe entry: ${relative}`);
      }
    }
  }
  await visit(physicalRoot, "");
  return {
    bundleSha256: sha256(Buffer.from(records.join(""), "utf8")),
    fileCount,
    symlinkCount,
    totalBytes,
  };
}

async function validateCoordinatorRuntime(contract) {
  if (!contract || process.platform !== contract.platform || process.arch !== contract.arch || process.versions.node !== contract.nodeVersion) {
    fail("coordinator runtime does not match the frozen authority");
  }
  if (await fs.realpath(process.execPath) !== contract.nodeExecutable) {
    fail("coordinator Node executable does not match the frozen authority");
  }
  const [nodeBytes, gitBytes, npmBinding] = await Promise.all([
    readStableToolFile(contract.nodeExecutable, "coordinator Node executable"),
    readStableToolFile(contract.gitExecutable, "coordinator Git executable", { allowHardlinks: true }),
    hashClosedToolBundle(contract.npmBundleRoot),
  ]);
  if (
    sha256(nodeBytes) !== contract.nodeExecutableSha256 ||
    sha256(gitBytes) !== contract.gitExecutableSha256 ||
    npmBinding.bundleSha256 !== contract.npmBundleSha256 ||
    npmBinding.fileCount !== contract.npmFileCount ||
    npmBinding.symlinkCount !== contract.npmSymlinkCount ||
    npmBinding.totalBytes !== contract.npmTotalBytes
  ) fail("coordinator runtime tools do not match the frozen authority");
  const npmCli = path.join(contract.npmBundleRoot, ...contract.npmCliRelativePath.split("/"));
  await readStableToolFile(npmCli, "coordinator npm CLI");
  return { ...contract, npmCli };
}

async function readRepositoryGitState(root) {
  const [{ stdout: head }, { stdout: status }] = await Promise.all([
    execFileAsync("/usr/bin/git", ["rev-parse", "HEAD"], { cwd: root }),
    execFileAsync("/usr/bin/git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root }),
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

export async function createGitExecutionSnapshot(root, gitSha, runtimeContract) {
  if (!/^[a-f0-9]{40}$/.test(gitSha ?? "")) fail("execution snapshot Git authority is invalid");
  const runtime = await validateCoordinatorRuntime(runtimeContract);
  const snapshotRoot = await fs.mkdtemp(path.join(process.platform === "darwin" ? "/tmp" : os.tmpdir(), "one-box-eval-source-"));
  try {
    const archiveErrors = [];
    const extractErrors = [];
    const archive = spawn(runtime.gitExecutable, ["archive", "--format=tar", gitSha], {
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
    const installErrors = [];
    const install = spawn(
      runtime.nodeExecutable,
      [runtime.npmCli, "ci", "--ignore-scripts", "--offline", "--no-audit", "--no-fund"],
      { cwd: snapshotRoot, stdio: ["ignore", "ignore", "pipe"] },
    );
    const installExit = await waitForChild(install, installErrors);
    if (installExit.code !== 0) {
      fail(`unable to install lockfile-bound execution dependencies offline: ${Buffer.concat(installErrors).toString("utf8").slice(0, 2000)}`);
    }
    const dependencies = path.join(snapshotRoot, "node_modules");
    const dependencyStat = await fs.lstat(dependencies);
    if (dependencyStat.isSymbolicLink() || !dependencyStat.isDirectory()) fail("execution dependencies must be one physical directory");
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

function assertRunFrozenAuthority(manifest, verification) {
  const expected = {
    contractVersion: verification.manifest.contractVersion,
    contractSha256: verification.manifestSha256,
    registrySha256: verification.registrySha256,
    sourceCommit: verification.manifest.sourceCommit,
    corpus: verification.manifest.corpus,
    fixtureManifestSha256:
      verification.registry.fixtureContract.manifestSha256ByPurpose,
    fixtureBuildSha256:
      verification.registry.fixtureContract.buildSha256ByPurpose,
    browserAuthority: verification.registry.browserContract,
    runtimeAuthority: verification.registry.runtimeContract,
    initialResults: verification.manifest.evaluations.map(({ id }) => ({
      evaluationId: id,
      state: "NOT_RUN",
    })),
  };
  const actual = Object.fromEntries(
    Object.keys(expected).map((key) => [key, manifest[key]]),
  );
  if (!isDeepStrictEqual(actual, expected)) {
    fail("prepared run is bound to a different frozen authority");
  }
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
    executeEvaluationFn = executeEvaluation,
    executeRenderedEvidenceFn = executeProductionRenderedEvidence,
    materializeQualificationFn = materializeQualificationFixture,
    assembleQualificationFn = assembleQualificationPreReviewPacket,
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
          fixtureManifestSha256:
            verification.registry.fixtureContract.manifestSha256ByPurpose,
          fixtureBuildSha256:
            verification.registry.fixtureContract.buildSha256ByPurpose,
          browserAuthority: verification.registry.browserContract,
          runtimeAuthority: verification.registry.runtimeContract,
          evaluations: verification.manifest.evaluations,
        },
      });
      writeOut({ status: "PASS", run: prepared.directory, blockers: prepared.manifest.prerequisiteBlockers });
      return 0;
    }

    const run = await loadRun(runsRoot, runId);
    assertRunFrozenAuthority(run.manifest, verification);

    if (command === "render") {
      onlyOptions(options, ["run-id", "runs-root"]);
      await requireCleanGitAuthority(root, readGitState, run.manifest.evaluatedGitSha);
      const evaluationIds = renderedEvaluationIds();
      const registeredRenderedIds = Object.entries(verification.registry.evaluations)
        .filter(([, registration]) => registration.kind === "coordinator-evidence" && registration.evaluator === "rendered-evidence")
        .map(([evaluationId]) => evaluationId);
      if (!isDeepStrictEqual([...registeredRenderedIds].sort(), [...evaluationIds].sort())) {
        fail("rendered evidence routes do not match the frozen registry");
      }
      const snapshot = await createExecutionSnapshot(
        root,
        run.manifest.evaluatedGitSha,
        verification.registry.runtimeContract,
      );
      let results;
      try {
        results = await executeRenderedEvidenceFn({
          snapshotRoot: snapshot.root,
          runtimeContract: verification.registry.runtimeContract,
          browserAuthority: verification.registry.browserContract,
          evaluationIds,
          environment,
        });
      } finally {
        await snapshot.dispose();
      }
      if (
        !Array.isArray(results) ||
        results.length !== evaluationIds.length ||
        !isDeepStrictEqual(results.map((result) => result?.evaluationId).sort(), [...evaluationIds].sort())
      ) fail("rendered evidence results do not match the frozen coordinator routes");
      await loadPreparedEvaluationRun(run.directory);
      await requireCleanGitAuthority(root, readGitState, run.manifest.evaluatedGitSha);
      for (const result of results) {
        await publishExecutionResult(path.join(run.directory, "results"), result);
      }
      const state = results.every((result) => result.state === "PASS") ? "PASS" : "FAIL";
      writeOut({ status: state, evaluationIds, meteredCalls: 0 });
      return state === "PASS" ? 0 : 1;
    }

    if (command === "materialize") {
      onlyOptions(options, ["run-id", "runs-root", "fixture", "output-root"]);
      await requireCleanGitAuthority(root, readGitState, run.manifest.evaluatedGitSha);
      const fixtureId = requireOption(options, "fixture");
      if (!verification.manifest.corpus.includes(fixtureId)) fail("fixture is not in the frozen corpus");
      const snapshot = await createExecutionSnapshot(
        root,
        run.manifest.evaluatedGitSha,
        verification.registry.runtimeContract,
      );
      let materialized;
      try {
        materialized = await materializeQualificationFn({
          snapshotRoot: snapshot.root,
          runtimeContract: verification.registry.runtimeContract,
          run,
          fixtureId,
          outputRoot: path.resolve(requireOption(options, "output-root")),
          environment,
        });
      } finally {
        await snapshot.dispose();
      }
      await loadPreparedEvaluationRun(run.directory);
      await requireCleanGitAuthority(root, readGitState, run.manifest.evaluatedGitSha);
      const packet = await assembleQualificationFn({
        runDirectory: run.directory,
        fixtureId,
        siteRoot: materialized.siteRoot,
        gateReportsFile: materialized.gateReportsFile,
        provenanceFile: materialized.provenanceFile,
      });
      writeOut({
        status: "PRE_REVIEW_READY",
        fixtureId,
        directory: packet.directory,
        packetSha256: packet.packetSha256,
        reviewedHashes: packet.reviewedHashes,
      });
      return 0;
    }

    if (command === "run") {
      onlyOptions(options, ["run-id", "runs-root", "evaluation"]);
      await requireCleanGitAuthority(root, readGitState, run.manifest.evaluatedGitSha);
      const evaluationId = requireOption(options, "evaluation");
      const registration = verification.registry.evaluations[evaluationId];
      if (!registration) fail(`evaluation is not registered: ${evaluationId}`);
      if (registration.kind === "coordinator-evidence") {
        fail(`${registration.evaluator} requires the trusted host coordinator and cannot be supplied by CLI arguments`);
      }
      const blockers = blockersFor(run, evaluationId);
      if (
        registration.kind === "browser-corpus-tests" &&
        blockers.length === 0
      ) {
        for (const fixtureId of run.manifest.corpus) {
          if (!run.browserFixtureIds.includes(fixtureId)) {
            blockers.push({ code: "BROWSER_EVIDENCE_MISSING", detail: fixtureId });
          }
        }
      }
      let snapshot;
      let result;
      try {
        if (blockers.length === 0) snapshot = await createExecutionSnapshot(
          root,
          run.manifest.evaluatedGitSha,
          verification.registry.runtimeContract,
        );
        const executionRoot = snapshot?.root ?? root;
        const commands = [{
          id: "credential-free-suite",
          argv: [
            process.execPath,
            path.join(executionRoot, "node_modules/vitest/vitest.mjs"),
            "run",
            ...registration.testFiles,
            "--maxWorkers=1",
            "--reporter=default",
          ],
        }];
        result = await executeEvaluationFn({
          root: executionRoot,
          evaluationId,
          commands,
          blockers,
          environment,
          inputsRoot: registration.kind === "browser-corpus-tests"
            ? path.join(run.directory, "inputs")
            : undefined,
          browserRoot: registration.kind === "browser-corpus-tests"
            ? path.join(run.directory, "browser")
            : undefined,
          workspaceRoot: snapshot ? path.join(snapshot.root, "sites") : undefined,
          timeoutMs: 180_000,
        });
      } finally {
        await snapshot?.dispose();
      }
      await loadPreparedEvaluationRun(run.directory);
      await requireCleanGitAuthority(root, readGitState, run.manifest.evaluatedGitSha);
      await publishExecutionResult(path.join(run.directory, "results"), result);
      writeOut({ status: result.state, evaluationId, meteredCalls: result.meteredCalls ?? 0 });
      return stateExitCode(result.state);
    }

    if (command === "capture") {
      onlyOptions(options, ["run-id", "runs-root", "fixture", "site-root"]);
      await requireCleanGitAuthority(root, readGitState, run.manifest.evaluatedGitSha);
      const fixtureId = requireOption(options, "fixture");
      if (!verification.manifest.corpus.includes(fixtureId)) fail("fixture is not in the frozen corpus");
      const fixtureInput = path.join(run.directory, "inputs", fixtureId, "fixture.json");
      await fs.stat(fixtureInput).catch(() => fail("fixture was not prepared in this immutable run"));
      let brief;
      try {
        brief = JSON.parse(await fs.readFile(
          path.join(run.directory, "inputs", fixtureId, "brief.json"),
          "utf8",
        ));
      } catch {
        fail("prepared fixture brief is invalid");
      }
      for (const key of ["expectedCoreSelectors", "expectedActionSelectors"]) {
        if (
          !Array.isArray(brief?.[key]) ||
          brief[key].length === 0 ||
          brief[key].some((selector) => typeof selector !== "string" || selector.length === 0)
        ) fail(`prepared fixture brief ${key} is invalid`);
      }
      const snapshot = await createExecutionSnapshot(
        root,
        run.manifest.evaluatedGitSha,
        verification.registry.runtimeContract,
      );
      let packet;
      try {
        const adapterUrl = pathToFileURL(path.join(snapshot.root, "scripts/eval/page-ir-harness-browser.mjs"));
        adapterUrl.searchParams.set("gitSha", run.manifest.evaluatedGitSha);
        const { capturePageIrBrowserEvidence } = await import(adapterUrl.href);
        packet = await capturePageIrBrowserEvidence({
          siteRoot: path.resolve(requireOption(options, "site-root")),
          viewports: verification.manifest.viewports,
          coreContentSelectors: brief.expectedCoreSelectors,
          primaryActionSelectors: brief.expectedActionSelectors,
          qualificationChecks: true,
          browserAuthority: run.manifest.browserAuthority,
          fixtureBinding: {
            fixtureId,
            fixtureManifestSha256:
              run.manifest.fixtureManifestSha256[fixtureId],
            buildSha256:
              run.manifest.fixtureBuildSha256[fixtureId],
          },
        });
      } finally {
        await snapshot.dispose();
      }
      try {
        await loadPreparedEvaluationRun(run.directory);
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
