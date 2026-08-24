import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  aggregateEvaluationResults,
  loadQualificationCompletedPacket,
  loadQualificationPreReviewPacket,
} from "./page-ir-harness-runner.mjs";

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const PromotionFindingCommonV1Fields = {
  schemaVersion: z.literal(1),
  findingId: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  severity: z.enum(["P0", "critical", "high"]),
  summary: z.string().trim().min(1).max(2_000),
  recordedAt: z.string().datetime({ offset: true }),
};
const FixedFindingAuthorityV1Fields = {
  resolution: z.string().trim().min(1).max(4_000),
  authorityName: z.string().trim().min(1).max(120),
  authorityKind: z.enum(["human", "owner"]),
  authorityAttestation: z.literal(true),
  disposedAt: z.string().datetime({ offset: true }),
};
const PromotionFindingV1Schema = z.discriminatedUnion("disposition", [
  z.object({
    ...PromotionFindingCommonV1Fields,
    disposition: z.literal("open"),
  }).strict(),
  z.object({
    ...PromotionFindingCommonV1Fields,
    disposition: z.literal("fixed"),
    ...FixedFindingAuthorityV1Fields,
  }).strict(),
  z.object({
    ...PromotionFindingCommonV1Fields,
    disposition: z.literal("accepted"),
    ...FixedFindingAuthorityV1Fields,
    authorityKind: z.literal("owner"),
  }).strict(),
]);

export function runDetachedQualificationWorker(argv, {
  cwd,
  env,
  timeoutMs,
  maxOutputBytes,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failure;
    let killTimer;
    let settled = false;
    const processGroupExists = () => {
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch (error) {
        if (error?.code === "ESRCH") return false;
        if (error?.code === "EPERM") return true;
        throw error;
      }
    };
    const waitForProcessGroupExit = async () => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        if (!processGroupExists()) return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return !processGroupExists();
    };
    const terminate = (message) => {
      if (failure) return;
      failure = new Error(message);
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      killTimer = setTimeout(() => {
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }, 2_000);
    };
    const collect = (chunks, which) => (chunk) => {
      const current = which === "stdout" ? stdoutBytes : stderrBytes;
      const remaining = Math.max(0, maxOutputBytes - current);
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      if (which === "stdout") stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (current + chunk.length > maxOutputBytes) terminate("qualification worker output exceeded the bounded limit");
    };
    child.stdout.on("data", collect(stdout, "stdout"));
    child.stderr.on("data", collect(stderr, "stderr"));
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(error);
    });
    const timer = setTimeout(() => terminate("qualification worker timed out"), timeoutMs);
    child.once("close", async (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = {
        exitCode: exitCode ?? -1,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (!failure && processGroupExists()) {
        terminate(result.exitCode === 0
          ? "qualification worker left background descendants after a successful exit"
          : "qualification worker left background descendants after exit");
      }
      if (failure) {
        const reaped = await waitForProcessGroupExit();
        clearTimeout(killTimer);
        if (!reaped) failure = new Error("qualification worker process group could not be reaped");
        Object.assign(failure, result);
        reject(failure);
      } else if (result.exitCode !== 0) {
        clearTimeout(killTimer);
        reject(Object.assign(new Error(`qualification worker exited ${result.exitCode}: ${result.stderr.slice(0, 1_000)}`), result));
      } else {
        clearTimeout(killTimer);
        resolve(result);
      }
    });
  });
}

function materializerSandboxProfile({ snapshotRoot, inputsRoot, temporaryRoot, outputRoot }) {
  for (const directory of [snapshotRoot, inputsRoot, temporaryRoot, outputRoot]) {
    if (!path.isAbsolute(directory) || /["\0\r\n]/.test(directory)) {
      throw new Error("qualification materializer sandbox authority is invalid");
    }
  }
  const readRoots = [snapshotRoot, inputsRoot, temporaryRoot];
  const ancestors = new Set();
  for (const root of readRoots) {
    let current = path.dirname(root);
    while (current !== path.dirname(current)) {
      ancestors.add(current);
      current = path.dirname(current);
    }
  }
  return [
    "(version 1)", "(deny default)", "(allow process*)", "(allow sysctl-read)",
    "(allow mach-lookup)", "(allow file-read*)",
    "(deny file-read* (subpath \"/Users\"))", "(deny file-read* (subpath \"/Volumes\"))",
    "(deny file-read* (subpath \"/private/tmp\"))", "(deny file-read* (subpath \"/private/var/folders\"))",
    "(deny network*)",
    ...[...ancestors].map((directory) => `(allow file-read-metadata (literal "${directory}"))`),
    ...readRoots.flatMap((directory) => [
      `(allow file-read* (literal "${directory}"))`, `(allow file-read* (subpath "${directory}"))`,
    ]),
    `(allow file-write* (literal "${outputRoot}"))`, `(allow file-write* (subpath "${outputRoot}"))`,
    `(allow file-write* (literal "${temporaryRoot}"))`, `(allow file-write* (subpath "${temporaryRoot}"))`,
    "(allow file-write* (literal \"/dev/null\"))",
  ].join(" ");
}

async function readStableBoundedFile(file, label, maxBytes = 2 * 1024 * 1024) {
  const resolved = path.resolve(file);
  const initial = await fs.lstat(resolved, { bigint: true });
  if (initial.isSymbolicLink() || !initial.isFile() || initial.nlink !== 1n || initial.size > BigInt(maxBytes)) {
    throw new Error(`${label} must be one bounded physical file`);
  }
  const handle = await fs.open(resolved, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.dev !== initial.dev || opened.ino !== initial.ino || opened.size !== initial.size || opened.nlink !== initial.nlink) {
      throw new Error(`${label} changed before read`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.nlink !== opened.nlink) {
      throw new Error(`${label} changed while read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function materializeQualificationFixture({
  snapshotRoot,
  runtimeContract,
  run,
  fixtureId,
  outputRoot,
  environment = process.env,
}) {
  if (!run.manifest.corpus.includes(fixtureId)) throw new Error("fixture is not in the frozen corpus");
  const destination = path.resolve(outputRoot);
  const fixtureDirectory = path.join(destination, fixtureId);
  const siteRoot = path.join(fixtureDirectory, "site");
  const gateEvaluationIds = run.manifest.initialResults
    .map((entry) => entry.evaluationId)
    .filter((id) => !id.startsWith("EVAL-QUAL-") && id !== "EVAL-OPS-004");
  const aggregate = await aggregateEvaluationResults({
    resultsRoot: path.join(run.directory, "results"),
    evaluationIds: gateEvaluationIds,
  });
  const nonPass = aggregate.results.filter((result) => result.state !== "PASS");
  if (nonPass.length > 0) {
    throw new Error(`qualification materialization requires every pre-review gate to PASS: ${nonPass.map(({ evaluationId, state }) => `${evaluationId}=${state}`).join(", ")}`);
  }
  if (process.platform !== "darwin") throw new Error("qualification materializer requires the macOS sandbox boundary");
  snapshotRoot = await fs.realpath(snapshotRoot);
  await fs.mkdir(destination, { recursive: false });
  await fs.mkdir(fixtureDirectory);
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-materializer-"));
  const temporaryHome = path.join(temporaryRoot, "home");
  const temporaryDirectory = path.join(temporaryRoot, "tmp");
  await fs.mkdir(temporaryHome, { mode: 0o700 });
  await fs.mkdir(temporaryDirectory, { mode: 0o700 });
  const sealedSiteRoot = path.join(snapshotRoot, ".qualification-output", fixtureId, "site");
  const sealedOutputRoot = path.dirname(sealedSiteRoot);
  await fs.mkdir(sealedOutputRoot, { recursive: true, mode: 0o700 });
  const inputsRoot = await fs.realpath(path.join(run.directory, "inputs"));
  const safeEnvironment = Object.fromEntries([
    "PATH", "TMPDIR", "TMP", "TEMP", "SHELL", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM", "CI",
    "ONEBOX_EVAL_NETWORK_ATTEMPT_LOG",
  ].flatMap((key) => typeof environment[key] === "string" ? [[key, environment[key]]] : []));
  safeEnvironment.CI = "1";
  safeEnvironment.HOME = temporaryHome;
  safeEnvironment.TMPDIR = `${temporaryDirectory}/`;
  safeEnvironment.NODE_OPTIONS = `--import=${path.join(snapshotRoot, "scripts/eval/page-ir-offline-guard.mjs")}`;
  const worker = path.join(snapshotRoot, "scripts/eval/page-ir-harness-materialize-worker.mjs");
  try {
    const sandboxProfile = materializerSandboxProfile({
      snapshotRoot,
      inputsRoot,
      temporaryRoot: await fs.realpath(temporaryRoot),
      outputRoot: sealedOutputRoot,
    });
    const { stdout, stderr } = await runDetachedQualificationWorker(["/usr/bin/sandbox-exec", "-p", sandboxProfile, runtimeContract.nodeExecutable,
      worker,
      fixtureId,
      sealedSiteRoot,
      inputsRoot,
    ], { cwd: snapshotRoot, env: safeEnvironment, maxOutputBytes: 5 * 1024 * 1024, timeoutMs: 180_000 });
    let materialized;
    try {
      materialized = JSON.parse(stdout.trim());
    } catch {
      throw new Error(`qualification materializer returned invalid output: ${stderr.slice(0, 1_000)}`);
    }
    if (materialized.fixtureId !== fixtureId || materialized.buildSha256 !== run.manifest.fixtureBuildSha256[fixtureId]) {
      throw new Error("qualification materialized build does not match the frozen fixture authority");
    }
    await fs.cp(sealedSiteRoot, siteRoot, { recursive: true, errorOnExist: true, force: false });
    const gateReports = {
      schemaVersion: 1,
      runId: run.manifest.runId,
      fixtureId,
      evaluatedGitSha: run.manifest.evaluatedGitSha,
      evaluations: aggregate.results.map(({ evaluationId, state, evidence }) => ({ evaluationId, state, evidence })),
    };
    const gateReportsFile = path.join(fixtureDirectory, "gate-reports.json");
    const gateBytes = Buffer.from(`${JSON.stringify(gateReports, null, 2)}\n`);
    await fs.writeFile(gateReportsFile, gateBytes, { flag: "wx", mode: 0o600 });
    const provenanceFile = path.join(fixtureDirectory, "provenance.json");
    await fs.writeFile(provenanceFile, `${JSON.stringify({
      schemaVersion: 1,
      runId: run.manifest.runId,
      fixtureId,
      sourceCommit: run.manifest.sourceCommit,
      evaluatedGitSha: run.manifest.evaluatedGitSha,
      contractSha256: run.manifest.contractSha256,
      registrySha256: run.manifest.registrySha256,
      fixtureManifestSha256: run.manifest.fixtureManifestSha256[fixtureId],
      buildSha256: materialized.buildSha256,
      mechanicalChecksSha256: sha256(gateBytes),
      providerCalls: 0,
    }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    return { fixtureId, siteRoot, gateReportsFile, provenanceFile, outputRoot: fixtureDirectory };
  } catch (error) {
    await fs.rm(destination, { recursive: true, force: true });
    throw error;
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

function commandResult(evaluationId, state, summary) {
  const stdout = `${JSON.stringify(summary, null, 2)}\n`;
  const stderr = "";
  return {
    schemaVersion: 1,
    evaluationId,
    state,
    commands: [{ id: "qualification-coordinator", stdout, stderr }],
    evidence: [
      { path: "artifacts/qualification-coordinator.stderr", sha256: sha256(Buffer.from(stderr)) },
      { path: "artifacts/qualification-coordinator.stdout", sha256: sha256(Buffer.from(stdout)) },
    ],
    networkAttempts: [],
    meteredCalls: 0,
    providerCredentialKeysPresent: [],
  };
}

async function loadCompletedQualification(
  run,
  reviewerName,
  loadPreReviewFn = loadQualificationPreReviewPacket,
  loadCompletedFn = loadQualificationCompletedPacket,
) {
  if (typeof reviewerName !== "string" || reviewerName.trim() !== reviewerName || reviewerName.length === 0) {
    throw new Error("--reviewer-name is required for qualification coordinator evidence");
  }
  const packets = [];
  for (const fixtureId of run.manifest.corpus) {
    const preDirectory = path.join(run.directory, "qualification", "pre-review", fixtureId);
    const pre = await loadPreReviewFn(preDirectory, {
      expectedRunId: run.manifest.runId,
      expectedFixtureId: fixtureId,
    });
    const completed = await loadCompletedFn(
      path.join(run.directory, "qualification", "completed", fixtureId),
      { trustedAuthority: { reviewerName, currentHashes: pre.reviewedHashes } },
    );
    packets.push({
      fixtureId,
      packetSha256: completed.packetSha256,
      preReviewPacketSha256: completed.manifest.preReviewPacketSha256,
      humanReviewSha256: completed.manifest.humanReviewSha256,
      reviewerName: completed.review.reviewerName,
      decision: completed.review.decision,
    });
  }
  return packets;
}

export async function readFindingsLedger(findingsFile) {
  if (!findingsFile) throw new Error("--findings-file is required for EVAL-OPS-004");
  let ledger;
  let bytes;
  try {
    bytes = await readStableBoundedFile(findingsFile, "qualification findings ledger");
    ledger = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("qualification findings ledger must be readable JSON");
  }
  if (
    !ledger || typeof ledger !== "object" || Array.isArray(ledger) ||
    Object.keys(ledger).sort().join(",") !== "findings,schemaVersion" ||
    ledger.schemaVersion !== 1 || !Array.isArray(ledger.findings)
  ) throw new Error("qualification findings ledger must be one closed record");
  const seen = new Set();
  for (const finding of ledger.findings) {
    const parsed = PromotionFindingV1Schema.safeParse(finding);
    const exactTrimmedStrings = ["findingId", "summary", "resolution", "authorityName"]
      .every((key) => typeof finding?.[key] !== "string" || finding[key] === finding[key].trim());
    if (!parsed.success || !exactTrimmedStrings || seen.has(parsed.data.findingId)) {
      throw new Error("qualification findings ledger contains an invalid finding");
    }
    seen.add(parsed.data.findingId);
  }
  return { ledger, sha256: sha256(bytes) };
}

export async function evaluateQualificationCoordinatorEvidence({
  run,
  evaluationId,
  evaluator,
  trustedAuthority,
  findingsFile,
  loadPreReviewFn = loadQualificationPreReviewPacket,
  loadCompletedFn = loadQualificationCompletedPacket,
  aggregateResultsFn = aggregateEvaluationResults,
  readFindingsFn = readFindingsLedger,
}) {
  if (evaluator === "rendered-evidence") {
    throw new Error("rendered coordinator routes must be executed with the render command");
  }
  if (!trustedAuthority || typeof trustedAuthority !== "object") {
    throw new Error("qualification coordinator requires authenticated host authority");
  }
  const packets = await loadCompletedQualification(run, trustedAuthority.reviewerName, loadPreReviewFn, loadCompletedFn);
  const packetsPass = packets.length === run.manifest.corpus.length && packets.every((packet) => packet.decision === "pass");
  if (evaluator === "qualification-human-review") {
    return commandResult(evaluationId, packetsPass ? "PASS" : "FAIL", {
      schemaVersion: 1,
      evaluator,
      runId: run.manifest.runId,
      evaluatedGitSha: run.manifest.evaluatedGitSha,
      packets,
    });
  }
  if (evaluator !== "qualification-contract" || evaluationId !== "EVAL-OPS-004") {
    throw new Error(`unsupported coordinator evaluator: ${evaluator}`);
  }
  const aggregate = await aggregateResultsFn({
    resultsRoot: path.join(run.directory, "results"),
    evaluationIds: run.manifest.initialResults
      .map((entry) => entry.evaluationId)
      .filter((id) => id !== "EVAL-OPS-004"),
  });
  const nonPass = aggregate.results.filter((result) => result.state !== "PASS");
  const findings = await readFindingsFn(findingsFile);
  if (trustedAuthority.findingsInventorySha256 !== findings.sha256) {
    throw new Error("qualification findings ledger does not match authenticated host authority");
  }
  const findingAuthorities = trustedAuthority.findingAuthorities ?? {};
  for (const finding of findings.ledger.findings) {
    if (finding.disposition === "open") continue;
    const authority = findingAuthorities[finding.findingId];
    if (!authority || authority.authorityName !== finding.authorityName || authority.authorityKind !== finding.authorityKind) {
      throw new Error(`finding disposition does not match authenticated authority: ${finding.findingId}`);
    }
  }
  const unresolved = findings.ledger.findings.filter((finding) => finding.disposition === "open");
  return commandResult(
    evaluationId,
    packetsPass && nonPass.length === 0 && unresolved.length === 0 ? "PASS" : "FAIL",
    {
      schemaVersion: 1,
      evaluator,
      runId: run.manifest.runId,
      evaluatedGitSha: run.manifest.evaluatedGitSha,
      packets,
      nonPassBlockingEvaluations: nonPass.map(({ evaluationId: id, state }) => ({ evaluationId: id, state })),
      findingsInventorySha256: findings.sha256,
      unresolvedFindings: unresolved.map(({ findingId, severity }) => ({ findingId, severity })),
    },
  );
}
