import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  evaluateQualificationCoordinatorEvidence,
  readFindingsLedger,
  runDetachedQualificationWorker,
} from "./page-ir-harness-qualification.mjs";

const CORPUS = [
  "brochure-local-service",
  "portfolio-showcase",
  "saas-marketing",
  "editorial-index",
  "campaign-landing",
  "institutional-presence",
];
const HASHES = {
  buildSha256: "a".repeat(64),
  pageIrSha256: "b".repeat(64),
  candidateManifestSha256: "c".repeat(64),
  mechanicalChecksSha256: "d".repeat(64),
  browserEvidenceSha256: "e".repeat(64),
};

function run() {
  return {
    directory: "/sealed/run",
    manifest: {
      runId: "qualification-run",
      evaluatedGitSha: "f".repeat(40),
      corpus: CORPUS,
      initialResults: [
        { evaluationId: "EVAL-SCOPE-001" },
        { evaluationId: "EVAL-QUAL-001" },
        { evaluationId: "EVAL-QUAL-002" },
        { evaluationId: "EVAL-QUAL-003" },
        { evaluationId: "EVAL-OPS-004" },
      ],
    },
  };
}

function dependencies({ failedFixture, nonPass = [], findings = [] } = {}) {
  return {
    loadPreReviewFn: async (directory) => ({
      reviewedHashes: HASHES,
      packetSha256: "1".repeat(64),
      directory,
    }),
    loadCompletedFn: async (directory) => {
      const fixtureId = directory.split("/").at(-1);
      return {
        packetSha256: "2".repeat(64),
        manifest: {
          preReviewPacketSha256: "1".repeat(64),
          humanReviewSha256: "3".repeat(64),
        },
        review: {
          reviewerName: "Devin",
          decision: fixtureId === failedFixture ? "fail" : "pass",
        },
      };
    },
    aggregateResultsFn: async () => ({
      results: [
        { evaluationId: "EVAL-SCOPE-001", state: nonPass.includes("EVAL-SCOPE-001") ? "BLOCKED" : "PASS" },
        { evaluationId: "EVAL-QUAL-001", state: "PASS" },
        { evaluationId: "EVAL-QUAL-002", state: "PASS" },
        { evaluationId: "EVAL-QUAL-003", state: "PASS" },
      ],
    }),
    readFindingsFn: async () => ({
      ledger: { schemaVersion: 1, findings },
      sha256: "4".repeat(64),
    }),
  };
}

const TRUSTED_AUTHORITY = {
  reviewerName: "Devin",
  findingsInventorySha256: "4".repeat(64),
  findingAuthorities: {},
};

test("human coordinator passes only when all six trusted completed reviews pass", async () => {
  const passing = await evaluateQualificationCoordinatorEvidence({
    run: run(), evaluationId: "EVAL-QUAL-001", evaluator: "qualification-human-review",
    trustedAuthority: TRUSTED_AUTHORITY, ...dependencies(),
  });
  assert.equal(passing.state, "PASS");
  assert.equal(JSON.parse(passing.commands[0].stdout).packets.length, 6);

  const failing = await evaluateQualificationCoordinatorEvidence({
    run: run(), evaluationId: "EVAL-QUAL-002", evaluator: "qualification-human-review",
    trustedAuthority: TRUSTED_AUTHORITY, ...dependencies({ failedFixture: "campaign-landing" }),
  });
  assert.equal(failing.state, "FAIL");
});

test("OPS-004 rejects non-pass blockers and unresolved promotion findings", async () => {
  const blocked = await evaluateQualificationCoordinatorEvidence({
    run: run(), evaluationId: "EVAL-OPS-004", evaluator: "qualification-contract",
    trustedAuthority: TRUSTED_AUTHORITY, findingsFile: "/trusted/findings.json",
    ...dependencies({ nonPass: ["EVAL-SCOPE-001"] }),
  });
  assert.equal(blocked.state, "FAIL");

  const openFinding = await evaluateQualificationCoordinatorEvidence({
    run: run(), evaluationId: "EVAL-OPS-004", evaluator: "qualification-contract",
    trustedAuthority: TRUSTED_AUTHORITY, findingsFile: "/trusted/findings.json",
    ...dependencies({ findings: [{ findingId: "P0-001", severity: "P0", disposition: "open" }] }),
  });
  assert.equal(openFinding.state, "FAIL");

  const passing = await evaluateQualificationCoordinatorEvidence({
    run: run(), evaluationId: "EVAL-OPS-004", evaluator: "qualification-contract",
    trustedAuthority: TRUSTED_AUTHORITY, findingsFile: "/trusted/findings.json", ...dependencies(),
  });
  assert.equal(passing.state, "PASS");
});

test("rendered evidence cannot be substituted through the qualification coordinator", async () => {
  await assert.rejects(evaluateQualificationCoordinatorEvidence({
    run: run(), evaluationId: "EVAL-UX-001", evaluator: "rendered-evidence",
    trustedAuthority: TRUSTED_AUTHORITY, ...dependencies(),
  }), /render command/i);
});

test("qualification worker timeout reaps the entire detached process group", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-qualification-process-"));
  let descendantPid;
  context.after(async () => {
    if (descendantPid) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  const pidFile = path.join(root, "descendant.pid");
  const source = [
    "const { spawn } = require('node:child_process');",
    "const fs = require('node:fs');",
    "const child = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\"], { stdio: 'ignore' });",
    "fs.writeFileSync(process.argv[1], String(child.pid));",
    "setInterval(() => {}, 1000);",
  ].join("");
  await assert.rejects(runDetachedQualificationWorker(
    [process.execPath, "-e", source, pidFile],
    { cwd: root, env: process.env, timeoutMs: 200, maxOutputBytes: 64 * 1024 },
  ), /timed out/i);
  descendantPid = Number(await fs.readFile(pidFile, "utf8"));
  assert.throws(() => process.kill(descendantPid, 0), (error) => error?.code === "ESRCH");
});

test("qualification worker treats EPERM group probes as still existing", async () => {
  const originalKill = process.kill;
  let injected = false;
  process.kill = (pid, signal) => {
    if (!injected && signal === 0) {
      injected = true;
      const error = new Error("probe denied");
      error.code = "EPERM";
      throw error;
    }
    return originalKill.call(process, pid, signal);
  };
  try {
    await assert.rejects(runDetachedQualificationWorker(
      [process.execPath, "-e", "setInterval(() => {}, 1000)"],
      { cwd: process.cwd(), env: process.env, timeoutMs: 50, maxOutputBytes: 64 * 1024 },
    ), /timed out/i);
    assert.equal(injected, true);
  } finally {
    process.kill = originalKill;
  }
});

test("qualification worker fails closed and reaps descendants after a successful direct exit", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-qualification-success-orphan-"));
  const pidFile = path.join(root, "descendant.pid");
  let descendantPid;
  context.after(async () => {
    if (descendantPid) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  const source = [
    "const { spawn } = require('node:child_process');",
    "const fs = require('node:fs');",
    "const child = spawn(process.execPath, ['-e', \"const fs=require('node:fs'); process.on('SIGTERM', () => {}); fs.writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)\", process.argv[1]], { stdio: 'ignore' });",
    "const wait = new Int32Array(new SharedArrayBuffer(4));",
    "while (!fs.existsSync(process.argv[1])) Atomics.wait(wait, 0, 0, 5);",
    "child.unref();",
    "process.exit(0);",
  ].join("");
  await assert.rejects(runDetachedQualificationWorker(
    [process.execPath, "-e", source, pidFile],
    { cwd: root, env: process.env, timeoutMs: 2_000, maxOutputBytes: 64 * 1024 },
  ), /background descendant/i);
  descendantPid = Number(await fs.readFile(pidFile, "utf8"));
  assert.throws(() => process.kill(descendantPid, 0), (error) => error?.code === "ESRCH");
});

test("findings ledger mirrors every canonical contract bound and datetime rule", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-qualification-findings-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "findings.json");
  const base = {
    schemaVersion: 1,
    findingId: "P0-001",
    severity: "P0",
    summary: "A blocking finding.",
    recordedAt: "2026-08-24T08:00:00-07:00",
    disposition: "fixed",
    resolution: "Fixed and independently verified.",
    authorityName: "Devin",
    authorityKind: "human",
    authorityAttestation: true,
    disposedAt: "2026-08-24T08:30:00Z",
  };
  const invalid = [
    { ...base, findingId: `P${"0".repeat(120)}` },
    { ...base, summary: "x".repeat(2_001) },
    { ...base, summary: " padded" },
    { ...base, resolution: "x".repeat(4_001) },
    { ...base, resolution: " padded" },
    { ...base, authorityName: "x".repeat(121) },
    { ...base, authorityName: " Devin" },
    { ...base, recordedAt: "0" },
    { ...base, disposedAt: "0" },
  ];
  for (const finding of invalid) {
    await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, findings: [finding] }));
    await assert.rejects(readFindingsLedger(file), /invalid finding/i);
  }
  await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, findings: [base] }));
  const valid = await readFindingsLedger(file);
  assert.equal(valid.ledger.findings[0].findingId, "P0-001");
});
