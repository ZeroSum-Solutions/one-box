import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  after,
  before,
  test,
} from "node:test";
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { verifyP180SiblingAuthorization } from "./verify-p180-t03-authorization.mjs";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let fixtureRoot;
let verifier;

before(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "one-box-plan-verifier-"));
  for (const path of ["docs", ".github", "src"]) cpSync(resolve(sourceRoot, path), resolve(fixtureRoot, path), { recursive: true });
  for (const path of [
    "docs/audits/evidence/goal/2026-08-31-obx-p180-t03-activation-receipt.json",
    "docs/audits/evidence/goal/2026-08-31-obx-p180-t04-activation-receipt.json",
  ]) rmSync(resolve(fixtureRoot, path), { force: true });
  for (const path of ["AGENTS.md", "README.md", "CONTRIBUTING.md", ".env.example", "package.json"]) cpSync(resolve(sourceRoot, path), resolve(fixtureRoot, path));
  cpSync(resolve(sourceRoot, "package-lock.json"), resolve(fixtureRoot, "package-lock.json"));
  mkdirSync(resolve(fixtureRoot, ".claude/handoffs"), { recursive: true });
  mkdirSync(resolve(fixtureRoot, "scripts"), { recursive: true });
  for (const path of ["verify-plan-authority.mjs", "verify-plan-authority.node.mjs", "verify-p180-t02-authorization.mjs", "verify-p180-t03-authorization.mjs", "verify-p180-t04-authorization.mjs", "verify-obx-p180-source-adoption.mjs"]) {
    cpSync(resolve(sourceRoot, `scripts/${path}`), resolve(fixtureRoot, `scripts/${path}`));
  }
  mkdirSync(resolve(fixtureRoot, "scripts/e2e"), { recursive: true });
  for (const path of ["canvas-contract.mjs", "canvas-coverage.mjs", "preview-workbench.mjs"]) {
    cpSync(resolve(sourceRoot, `scripts/e2e/${path}`), resolve(fixtureRoot, `scripts/e2e/${path}`));
  }
  mkdirSync(resolve(fixtureRoot, "scripts/eval"), { recursive: true });
  for (const path of ["obx-p180-contract-fixtures.mjs", "obx-p180-contract-fixtures.test.mjs", "obx-p180-source-adoption-fixtures.mjs", "obx-p180-source-adoption-fixtures.node.mjs", "grok-audit.mjs"]) {
    cpSync(resolve(sourceRoot, `scripts/eval/${path}`), resolve(fixtureRoot, `scripts/eval/${path}`));
  }
  verifier = resolve(fixtureRoot, "scripts/verify-plan-authority.mjs");
  refreshAuthorityPacketForFixture();
});

after(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
});

function run(args = [], extraEnv = {}) {
  return spawnSync(process.execPath, [verifier, ...args], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

function fixedEvaluationTimeEnvironment(timestamp) {
  const source = `Date.now = () => ${timestamp};`;
  const preload = `--import=data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const inherited = process.env.NODE_OPTIONS?.trim();
  return { NODE_OPTIONS: inherited ? `${inherited} ${preload}` : preload };
}

function runSoloAmendment() {
  return run(["--verify-solo-amendment-only"]);
}

function runSoloStructure() {
  return run(["--verify-solo-structure-only"]);
}

function runSoloT02Structure() {
  return run(["--verify-solo-t02-structure-only"]);
}

function runSoloT02Receipt() {
  return run(["--verify-solo-t02-receipt-only"]);
}

function runSoloT02Completion() {
  return run(["--verify-solo-t02-completion-only"]);
}

function runSoloSiblingRecord(ticket) {
  return run([`--verify-solo-${ticket.toLowerCase()}-record-only`]);
}

function withFileMutation(path, mutate, assertion, args = []) {
  const absolute = resolve(fixtureRoot, path);
  const original = readFileSync(absolute, "utf8");
  try {
    const replacement = mutate(original);
    if (typeof replacement === "string") writeFileSync(absolute, replacement);
    const result = run(args);
    assert.notEqual(result.status, 0, `mutation unexpectedly passed\n${result.stdout}\n${result.stderr}`);
    assertion(result);
  } finally {
    writeFileSync(absolute, original);
  }
}

function withJsonMutation(path, mutate, assertion, args = []) {
  withFileMutation(path, (text) => {
    const value = JSON.parse(text);
    mutate(value);
    return `${JSON.stringify(value, null, 2)}\n`;
  }, assertion, args);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function rehashSoloRecord(registry) {
  const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T01-SOLO-001");
  const unhashed = structuredClone(record);
  delete unhashed.authorizationHash.digest;
  record.authorizationHash.digest = createHash("sha256").update(canonicalJson(unhashed)).digest("hex");
}

function withSoloRecordMutation(mutate, assertion, { rehash = true, args = ["--verify-solo-structure-only"] } = {}) {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T01-SOLO-001");
    mutate(record, registry);
    if (rehash) rehashSoloRecord(registry);
  }, assertion, args);
}

function rehashSoloT02Record(registry) {
  const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T02-SOLO-001");
  const unhashed = structuredClone(record);
  delete unhashed.authorizationHash.digest;
  record.authorizationHash.digest = createHash("sha256").update(canonicalJson(unhashed)).digest("hex");
}

function rehashSoloSiblingRecord(registry, ticket) {
  const record = registry.authorizations.find((candidate) => candidate.id === `OBX-AUTH-P180-${ticket}-SOLO-001`);
  const unhashed = structuredClone(record);
  delete unhashed.authorizationHash.digest;
  record.authorizationHash.digest = createHash("sha256").update(canonicalJson(unhashed)).digest("hex");
}

function withSoloSiblingRecordMutation(ticket, mutate, assertion, { rehash = true } = {}) {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const record = registry.authorizations.find((candidate) => candidate.id === `OBX-AUTH-P180-${ticket}-SOLO-001`);
    mutate(record, registry);
    if (rehash) rehashSoloSiblingRecord(registry, ticket);
  }, assertion, [`--verify-solo-${ticket.toLowerCase()}-record-only`]);
}

function withSoloT02RecordMutation(mutate, assertion, { rehash = true } = {}) {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T02-SOLO-001");
    mutate(record, registry);
    if (rehash) rehashSoloT02Record(registry);
  }, assertion, ["--verify-solo-t02-structure-only"]);
}

function withMultipleFileMutations(mutations, assertion) {
  const originals = new Map();
  try {
    for (const [path, mutate] of mutations) {
      const absolute = resolve(fixtureRoot, path);
      const original = readFileSync(absolute, "utf8");
      originals.set(absolute, original);
      writeFileSync(absolute, mutate(original));
    }
    const result = run();
    assert.notEqual(result.status, 0, `mutations unexpectedly passed\n${result.stdout}\n${result.stderr}`);
    assertion(result);
  } finally {
    for (const [absolute, original] of originals) writeFileSync(absolute, original);
  }
}

const securityReceiptPath = "docs/audits/evidence/security/2026-08-30-obx-p180-t01-solo-authorization-security-review.json";
const grokReceiptPath = "docs/audits/grok-4.6/2026-08-30-obx-p180-solo-t01-authorization-final-audit.json";
const fableReceiptPath = "docs/audits/fable-5/2026-08-30-obx-p180-solo-t01-authorization-final-audit.json";
const t02SecurityReceiptPath = "docs/audits/evidence/security/2026-08-31-obx-p180-t02-solo-authorization-security-review.json";
const activationPaths = {
  T03: "docs/audits/evidence/goal/2026-08-31-obx-p180-t03-activation-receipt.json",
  T04: "docs/audits/evidence/goal/2026-08-31-obx-p180-t04-activation-receipt.json",
};
const securityReceiptTargets = [
  "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json",
  "docs/plans/one-box-master/00-authority/authority-manifest.json",
  "docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json",
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
];

function withExactReceiptChain(callback) {
  callback();
}

function setSelfHash(value) {
  value.selfHash = {
    algorithm: "sha256",
    canonicalization: "canonical-json-v1",
    excludedJsonPointers: ["/selfHash/digest"],
    digest: "",
  };
  const unhashed = structuredClone(value);
  delete unhashed.selfHash.digest;
  value.selfHash.digest = createHash("sha256").update(canonicalJson(unhashed)).digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function refreshAuthorityPacketForFixture() {
  const firstRun = spawnSync(process.execPath, [verifier], { cwd: fixtureRoot, encoding: "utf8" });
  const match = firstRun.stderr.match(/packetDigest mismatch; expected current ([a-f0-9]{64})/);
  if (match) {
    const manifestPath = resolve(fixtureRoot, "docs/plans/one-box-master/00-authority/authority-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.packetDigest = match[1];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const repinPath = resolve(fixtureRoot, "docs/audits/evidence/security/2026-08-31-obx-p180-source-adoption-authority-repin.json");
    const repin = JSON.parse(readFileSync(repinPath, "utf8"));
    repin.currentAuthorityManifest.packetDigest = match[1];
    repin.currentAuthorityManifest.sha256 = sha256(readFileSync(manifestPath));
    writeFileSync(repinPath, `${JSON.stringify(repin, null, 2)}\n`);
  }
  refreshSiblingSecurityReceipts();
}

function refreshSiblingSecurityReceipts() {
  for (const ticket of ["t03", "t04"]) {
    const path = resolve(fixtureRoot, `docs/audits/evidence/security/2026-08-31-obx-p180-${ticket}-solo-authorization-security-review.json`);
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    receipt.targetHashes = receipt.targetHashes.map((binding) => ({
      ...binding,
      digest: sha256(readFileSync(resolve(fixtureRoot, binding.path))),
    }));
    setSelfHash(receipt);
    writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
  }
}

function withSyntheticActivationReceipts(mutate, callback) {
  const registry = JSON.parse(readFileSync(resolve(fixtureRoot, securityReceiptTargets[0]), "utf8"));
  const phase0ACommit = "1".repeat(40);
  const phase0ATree = "2".repeat(40);
  const writeSet = [activationPaths.T03, activationPaths.T04];
  const receipts = {};
  for (const ticket of ["T03", "T04"]) {
    const record = registry.authorizations.find((candidate) => candidate.id === `OBX-AUTH-P180-${ticket}-SOLO-001`);
    const receipt = {
      schemaVersion: 1,
      receiptId: `OBX-P180-${ticket}-ACTIVATION-001`,
      receiptKind: `solo-${ticket.toLowerCase()}-activation-receipt-v1`,
      status: "ACTIVE",
      authorizationId: record.id,
      authorizationHash: record.authorizationHash.digest,
      reservation: record.reservation,
      phase0ACommit,
      phase0ATree,
      activationWriteSet: writeSet,
      observedAt: "2026-09-01T02:05:00.000Z",
    };
    receipts[ticket] = receipt;
  }
  mutate?.(receipts);
  for (const ticket of ["T03", "T04"]) {
    setSelfHash(receipts[ticket]);
    writeFileSync(resolve(fixtureRoot, activationPaths[ticket]), `${JSON.stringify(receipts[ticket], null, 2)}\n`);
  }
  const gitState = {
    phase0ACommit, phase0ATree,
    phase0BCommit: "3".repeat(40), phase0BTree: "4".repeat(40),
    currentCommit: "3".repeat(40), currentTree: "4".repeat(40), changedPaths: writeSet,
  };
  try { callback({ registry, gitState, receipts }); }
  finally { for (const path of Object.values(activationPaths)) rmSync(resolve(fixtureRoot, path), { force: true }); }
}

const completionPaths = {
  T03: "docs/audits/evidence/goal/2026-08-31-obx-p180-t03-completion-receipt.json",
  T04: "docs/audits/evidence/goal/2026-08-31-obx-p180-t04-completion-receipt.json",
};

function controllerEnvelopePath(proofRoot, tuple) {
  return resolve(proofRoot, `proof/controller-proof-envelope-${String(tuple.sequence).padStart(2, "0")}-${tuple.laneId.toLowerCase()}-${tuple.commandId}.json`);
}

function buildProofEntries(registry, activationReceipts) {
  const entries = [];
  const envelopes = [];
  let previousDigest = "0".repeat(64);
  for (const ticket of ["T03", "T04"]) {
    const record = registry.authorizations.find((candidate) => candidate.id === `OBX-AUTH-P180-${ticket}-SOLO-001`);
    for (const commandId of record.completionEvidence.requiredCommandIds) {
      const sequence = entries.length + 1;
      const outputDigest = sha256(`output:${ticket}:${commandId}`);
      const envelope = {
        schemaVersion: 1,
        envelopeKind: "obx-p180-controller-proof-envelope-v1",
        sequence,
        laneId: ticket,
        commandId,
        authorizationId: record.id,
        authorizationHash: record.authorizationHash.digest,
        activationReceiptId: activationReceipts[ticket].receiptId,
        activationReceiptHash: activationReceipts[ticket].selfHash.digest,
        startedAt: "2026-09-01T03:10:00.000Z",
        finishedAt: "2026-09-01T03:10:01.000Z",
        exitCode: 0,
        outputDigest,
      };
      const envelopeBytes = Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`);
      envelopes.push({
        path: `proof/controller-proof-envelope-${String(sequence).padStart(2, "0")}-${ticket.toLowerCase()}-${commandId}.json`,
        bytes: envelopeBytes,
      });
      const entry = {
        ...envelope,
        envelopeKind: undefined,
        schemaVersion: undefined,
        envelopeDigest: sha256(envelopeBytes),
        previousDigest,
      };
      delete entry.envelopeKind;
      delete entry.schemaVersion;
      entry.entryDigest = sha256(canonicalJson(entry));
      previousDigest = entry.entryDigest;
      entries.push(entry);
    }
  }
  return { entries, envelopes };
}

function withSyntheticCompletionReceipts(mutate, callback) {
  withSyntheticActivationReceipts(null, ({ registry, gitState, receipts: activationReceipts }) => {
    const { entries: proofEntries, envelopes } = buildProofEntries(registry, activationReceipts);
    const registryBytes = proofEntries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
    const phase0BCommit = gitState.phase0BCommit;
    const phase0BTree = gitState.phase0BTree;
    const t03Commit = "5".repeat(40);
    const t03Tree = "6".repeat(40);
    const t04Commit = "7".repeat(40);
    const t04Tree = "8".repeat(40);
    const completionCommit = "9".repeat(40);
    const completionTree = "a".repeat(40);
    const fileBytes = new Map();
    const completionReceipts = {};
    for (const ticket of ["T03", "T04"]) {
      const record = registry.authorizations.find((candidate) => candidate.id === `OBX-AUTH-P180-${ticket}-SOLO-001`);
      const implementationCommit = ticket === "T03" ? t03Commit : t04Commit;
      const implementationTree = ticket === "T03" ? t03Tree : t04Tree;
      const parentCommit = ticket === "T03" ? phase0BCommit : t03Commit;
      const files = record.allowedPaths.map((path) => {
        const bytes = `completed:${path}\n`;
        fileBytes.set(path, bytes);
        return { path, algorithm: "sha256", digest: sha256(bytes) };
      });
      const receipt = {
        schemaVersion: 1,
        receiptId: `OBX-P180-${ticket}-COMPLETION-001`,
        receiptKind: `solo-${ticket.toLowerCase()}-completion-receipt-v1`,
        status: "COMPLETED_VERIFIED",
        ticketId: `OBX-P180-${ticket}`,
        laneId: ticket,
        authorizationId: record.id,
        authorizationHash: record.authorizationHash.digest,
        activationBinding: {
          path: activationPaths[ticket],
          receiptId: activationReceipts[ticket].receiptId,
          receiptSelfHash: activationReceipts[ticket].selfHash.digest,
          frozenStartCommit: phase0BCommit,
          frozenStartTree: phase0BTree,
        },
        implementation: { commit: implementationCommit, tree: implementationTree, parentCommit, files },
        completionBase: { commit: t04Commit, tree: t04Tree },
        leaseReleases: ["T03", "T04"].map((laneId) => {
          const laneRecord = registry.authorizations.find((candidate) => candidate.id === `OBX-AUTH-P180-${laneId}-SOLO-001`);
          return {
            laneId,
            claimantActorId: laneRecord.reservation.claimantActorId,
            claimSequence: 1,
            taskStatus: "COMPLETED",
            terminalReportDigest: sha256(`terminal:${laneId}`),
            releasedAt: "2026-09-01T03:09:00.000Z",
          };
        }),
        proofBinding: {
          registryPath: "proof/controller-proof-registry.jsonl",
          registrySha256: sha256(registryBytes),
          entryCount: proofEntries.length,
          headDigest: proofEntries.at(-1).entryDigest,
          tuples: proofEntries.filter((entry) => entry.laneId === ticket),
        },
        completedAt: "2026-09-01T03:11:00.000Z",
      };
      completionReceipts[ticket] = receipt;
    }
    mutate?.(completionReceipts, proofEntries);
    for (const ticket of ["T03", "T04"]) {
      setSelfHash(completionReceipts[ticket]);
      const bytes = `${JSON.stringify(completionReceipts[ticket], null, 2)}\n`;
      fileBytes.set(completionPaths[ticket], bytes);
      writeFileSync(resolve(fixtureRoot, completionPaths[ticket]), bytes);
    }
    const historicalPaths = new Set();
    for (const record of registry.authorizations.filter((row) => ["OBX-AUTH-P180-T03-SOLO-001", "OBX-AUTH-P180-T04-SOLO-001"].includes(row.id))) {
      for (const binding of [...record.planBindings, ...record.dependencyBindings, ...record.sourceAdoptionBindings]) historicalPaths.add(binding.path);
      const securityReceipt = JSON.parse(readFileSync(resolve(fixtureRoot, record.requiredEvidencePaths[0]), "utf8"));
      historicalPaths.add(record.requiredEvidencePaths[0]);
      for (const path of securityReceipt.targetPaths) historicalPaths.add(path);
    }
    const historicalFileBytes = new Map([...historicalPaths].map((path) => [path, readFileSync(resolve(fixtureRoot, path))]));
    const completionGitState = {
      ...gitState,
      currentCommit: completionCommit,
      currentTree: completionTree,
      completionCommit,
      commits: {
        [phase0BCommit]: {
          tree: phase0BTree,
          parents: [gitState.phase0ACommit],
          changedPaths: [activationPaths.T03, activationPaths.T04],
        },
        [t03Commit]: { tree: t03Tree, parents: [phase0BCommit], changedPaths: [...registry.authorizations.find((row) => row.id === "OBX-AUTH-P180-T03-SOLO-001").allowedPaths].sort() },
        [t04Commit]: { tree: t04Tree, parents: [t03Commit], changedPaths: [...registry.authorizations.find((row) => row.id === "OBX-AUTH-P180-T04-SOLO-001").allowedPaths].sort() },
        [completionCommit]: { tree: completionTree, parents: [t04Commit], changedPaths: [completionPaths.T03, completionPaths.T04] },
      },
      fileBytes,
      historicalFileBytes,
    };
    const proofRoot = resolve(fixtureRoot, "goal-state-proof");
    mkdirSync(resolve(proofRoot, "proof"), { recursive: true });
    chmodSync(proofRoot, 0o700);
    chmodSync(resolve(proofRoot, "proof"), 0o700);
    writeFileSync(resolve(proofRoot, "proof/controller-proof-registry.jsonl"), registryBytes, { mode: 0o600 });
    for (const envelope of envelopes) writeFileSync(resolve(proofRoot, envelope.path), envelope.bytes, { mode: 0o600 });
    try { callback({ registry, gitState: completionGitState, receipts: completionReceipts, proofRoot }); }
    finally {
      for (const path of Object.values(completionPaths)) rmSync(resolve(fixtureRoot, path), { force: true });
      rmSync(proofRoot, { recursive: true, force: true });
    }
  });
}

test("the current non-empty packet passes discriminated structure verification", () => {
  const result = runSoloStructure();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Solo T01 authorization self-hash: [a-f0-9]{64}/);
  assert.match(result.stdout, /structure and frozen bindings/);
});

test("the exact solo T02 authorization passes focused structure verification", () => {
  const result = runSoloT02Structure();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS Solo T02 structure and frozen bindings/);
});

test("the frozen solo T01 receipt chain survives later verifier evolution", () => {
  const result = run(["--verify-solo-receipts-only"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS Solo T01 exact receipt chain/);
});

test("the solo T02 authorization rejects path, order, and effect expansion", () => {
  withSoloT02RecordMutation((record) => {
    record.allowedPaths.push("src/lib/operatingEnvironment/provider.ts");
    record.allowedEffects.push("connect-provider");
  }, (result) => {
    assert.match(result.stderr, /allowedPaths: exact value drift/);
    assert.match(result.stderr, /allowedEffects: exact value drift/);
  });
  withSoloT02RecordMutation((record) => record.allowedPaths.reverse(), (result) => {
    assert.match(result.stderr, /allowedPaths: exact value drift/);
  });
});

test("the solo T02 authorization rejects fake roles and wider ticket authority", () => {
  withSoloT02RecordMutation((record) => {
    record.roleAvailability[0].assignmentRecordPresent = true;
    record.roleAvailability[0].humanActorId = "person:devin-wiggins";
    record.childTicketIds.push("OBX-P180-T03");
  }, (result) => {
    assert.match(result.stderr, /roleAvailability: exact value drift/);
    assert.match(result.stderr, /childTicketIds: exact value drift/);
  });
});

test("the solo T02 authorization rejects predecessor, model-route, and renewal drift", () => {
  withSoloT02RecordMutation((record) => {
    record.predecessorBinding.checkpointCommit = "0".repeat(40);
    record.reviewProtocol.quickAuditModel = "z-ai/glm-latest";
    record.renewable = true;
  }, (result) => {
    assert.match(result.stderr, /predecessorBinding: exact value drift/);
    assert.match(result.stderr, /reviewProtocol: exact value drift/);
    assert.match(result.stderr, /renewable drift/);
  });
});

test("the solo T02 authorization rejects a forged self-hash", () => {
  withSoloT02RecordMutation((record) => {
    record.authorizationHash.digest = "0".repeat(64);
  }, (result) => assert.match(result.stderr, /authorization self-hash mismatch/), { rehash: false });
});

test("the exact solo T02 security receipt passes focused verification", () => {
  const result = runSoloT02Receipt();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS Solo T02 exact historical security receipt/);
});

test("the frozen solo T02 security receipt survives later shared-verifier evolution", () => {
  const path = resolve(fixtureRoot, "scripts/verify-plan-authority.mjs");
  const original = readFileSync(path, "utf8");
  try {
    writeFileSync(path, `${original}\n// Later verifier support must not rewrite T02 history.\n`);
    const result = runSoloT02Receipt();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS Solo T02 exact historical security receipt/);
  } finally {
    writeFileSync(path, original);
  }
});

test("the exact T02 completion checkpoint and owner receipt pass", () => {
  const result = runSoloT02Completion();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /T02 completion checkpoint self-hash: [a-f0-9]{64}/);
  assert.match(result.stdout, /T02 owner completion receipt self-hash: [a-f0-9]{64}/);
});

test("the owner-derived governance write cannot expand beyond packetDigest and the exact re-pin", () => {
  withJsonMutation("docs/audits/evidence/goal/2026-08-31-obx-p180-t02-owner-completion-receipt.json", (receipt) => {
    receipt.derivedGovernanceWrite.implementationAuthority = true;
    receipt.derivedGovernanceWrite.writePaths.push("package-lock.json");
  }, (result) => {
    assert.match(result.stderr, /derivedGovernanceWrite: exact value drift/);
    assert.match(result.stderr, /owner completion receipt: self-hash mismatch/);
  }, ["--verify-solo-t02-completion-only"]);
});

test("the source-adoption re-pin must bind the current owner receipt and no-expansion invariants", () => {
  withJsonMutation("docs/audits/evidence/security/2026-08-31-obx-p180-source-adoption-authority-repin.json", (receipt) => {
    receipt.derivedWriteAuthorization.digest = "0".repeat(64);
    receipt.invariants.runtimeOrDependencyChange = true;
  }, (result) => {
    assert.match(result.stderr, /derivedWriteAuthorization: exact value drift/);
    assert.match(result.stderr, /invariants: exact value drift/);
  }, ["--verify-solo-t03-record-only"]);
});

test("the T03 and T04 records pass only as pre-activation sibling grants", () => {
  for (const ticket of ["T03", "T04"]) {
    const record = runSoloSiblingRecord(ticket);
    assert.equal(record.status, 0, record.stderr);
    assert.match(record.stdout, new RegExp(`Solo ${ticket} derived state: PRE_ACTIVATION`));
    const activation = run([`--verify-solo-${ticket.toLowerCase()}-activation-only`]);
    assert.notEqual(activation.status, 0);
    assert.match(activation.stderr, /ACTIVATION_RECEIPT_MISSING/);
  }
});

test("the focused sibling completion command fails closed before receipts exist", () => {
  const result = run(["--verify-solo-t03-completion-only"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /COMPLETION_RECEIPT_MISSING/);
});

test("the sibling grants reject path, effect, role, and predecessor drift", () => {
  for (const ticket of ["T03", "T04"]) {
    withSoloSiblingRecordMutation(ticket, (record) => {
      record.allowedPaths.push("src/lib/operatingEnvironment/provider.ts");
      record.allowedEffects.push("provider-call");
      record.forbiddenEffects.pop();
      record.roleAvailability[0].assignmentRecordPresent = true;
      record.predecessorBinding.grantsInheritedAuthority = true;
    }, (result) => {
      assert.match(result.stderr, /allowedPaths: exact value drift/);
      assert.match(result.stderr, /allowedEffects: exact value drift/);
      assert.match(result.stderr, /forbiddenEffects: exact value drift/);
      assert.match(result.stderr, /roles: exact value drift/);
      assert.match(result.stderr, /predecessor: exact value drift/);
    });
  }
});

test("the sibling grants reject reservation, interval, and solo-risk drift", () => {
  for (const ticket of ["T03", "T04"]) {
    withSoloSiblingRecordMutation(ticket, (record) => {
      record.reservation.replacementAllowed = true;
      record.expiresAt = "2026-09-15T02:05:00.001Z";
      record.renewable = true;
      record.independentHumanReview.satisfied = true;
      record.requirementExceptions[0].satisfactionStatus = "SATISFIED";
    }, (result) => {
      assert.match(result.stderr, /reservation: exact value drift/);
      assert.match(result.stderr, /identity: exact value drift/);
      assert.match(result.stderr, /expiry must be exactly 336 hours/);
      assert.match(result.stderr, /independentHumanReview: exact value drift/);
      assert.match(result.stderr, /requirementExceptions: exact value drift/);
    });
  }
});

test("the R9 activation, proof-registry, completion, and review contracts are immutable", () => {
  for (const ticket of ["T03", "T04"]) {
    withSoloSiblingRecordMutation(ticket, (record) => {
      record.activationProtocol.observedAtClockSkewMilliseconds = 1;
      record.proofProtocol.exclusiveLock = "best-effort";
      record.proofProtocol.automaticRepairTruncateOrRetryAllowed = true;
      record.completionEvidence.leaseReleaseRequiresTerminalReportAndCompletedTask = false;
      record.completionEvidence.receiptPath = record.activationProtocol.siblingReceiptPath;
      record.reviewProtocol.modelAuthority = "binding";
      record.invalidators.pop();
    }, (result) => {
      assert.match(result.stderr, /activationProtocol: exact value drift/);
      assert.match(result.stderr, /proofProtocol: exact value drift/);
      assert.match(result.stderr, /completionEvidence: exact value drift/);
      assert.match(result.stderr, /reviewProtocol: exact value drift/);
      assert.match(result.stderr, /invalidators: exact value drift/);
    });
  }
});

test("a valid synthetic Phase0B pair binds shared H1/T1 and derives H2/T2", () => {
  withSyntheticActivationReceipts(null, ({ registry, gitState }) => {
    for (const ticket of ["T03", "T04"]) {
      const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket, mode: "activation", gitState });
      assert.deepEqual(result.failures, []);
      assert.equal(result.state, "ACTIVE");
      assert.deepEqual(result.frozenWorkerStart, { commit: gitState.phase0BCommit, tree: gitState.phase0BTree });
    }
  });
});

test("activation rejects a drifted historical T02 security receipt", () => {
  withSyntheticActivationReceipts(null, ({ registry, gitState }) => {
    const receiptPath = resolve(fixtureRoot, t02SecurityReceiptPath);
    const original = readFileSync(receiptPath, "utf8");
    try {
      writeFileSync(receiptPath, `${original}\n`);
      const result = verifyP180SiblingAuthorization({
        repoRoot: fixtureRoot,
        registry,
        ticket: "T03",
        mode: "activation",
        gitState,
      });
      assert.match(result.failures.join("\n"), /historical T02 security receipt SHA-256 drift/);
    } finally {
      writeFileSync(receiptPath, original);
    }
  });
});

test("activation rejects malformed or exclusive-end timestamps and cross-lane H1/T1", () => {
  for (const observedAt of ["2026-09-01T02:05:00Z", "2026-09-15T02:05:00.000Z"]) {
    withSyntheticActivationReceipts((receipts) => { receipts.T03.observedAt = observedAt; receipts.T04.observedAt = observedAt; }, ({ registry, gitState }) => {
      const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "activation", gitState });
      assert.match(result.failures.join("\n"), /canonical millisecond observedAt required|outside authorization interval/);
    });
  }
  withSyntheticActivationReceipts((receipts) => { receipts.T04.phase0ATree = "9".repeat(40); }, ({ registry, gitState }) => {
    const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "activation", gitState });
    assert.match(result.failures.join("\n"), /shared H1\/T1\/observedAt/);
  });
});

test("activation expires at the exclusive authorization boundary", () => {
  withSyntheticActivationReceipts(null, ({ registry, gitState }) => {
    const live = verifyP180SiblingAuthorization({
      repoRoot: fixtureRoot, registry, ticket: "T03", mode: "activation", gitState,
      evaluationTime: Date.parse("2026-09-15T02:04:59.999Z"),
    });
    assert.deepEqual(live.failures, []);
    assert.equal(live.state, "ACTIVE");
    assert.deepEqual(live.frozenWorkerStart, { commit: gitState.phase0BCommit, tree: gitState.phase0BTree });
    const expired = verifyP180SiblingAuthorization({
      repoRoot: fixtureRoot, registry, ticket: "T03", mode: "activation", gitState,
      evaluationTime: Date.parse("2026-09-15T02:05:00.000Z"),
    });
    assert.equal(expired.state, "EXPIRED");
    assert.equal(expired.frozenWorkerStart, null);
    assert.match(expired.failures.join("\n"), /AUTHORIZATION_EXPIRED/);
  });
});

test("wrong real H1 and reversed activation paths never derive ACTIVE", () => {
  withSyntheticActivationReceipts(null, ({ registry, gitState }) => {
    gitState.phase0ACommit = "9".repeat(40);
    const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "activation", gitState });
    assert.notEqual(result.state, "ACTIVE");
    assert.equal(result.frozenWorkerStart, null);
    assert.match(result.failures.join("\n"), /activation real H1\/T1/);
  });
  withSyntheticActivationReceipts(null, ({ registry, gitState }) => {
    gitState.changedPaths = [...gitState.changedPaths].reverse();
    const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "activation", gitState });
    assert.notEqual(result.state, "ACTIVE");
    assert.equal(result.frozenWorkerStart, null);
    assert.match(result.failures.join("\n"), /activation exact Phase0B write set/);
  });
});

test("staged, unstaged, or unexpected untracked paths invalidate activation", () => {
  for (const mutation of [
    { cachedPaths: ["UNAUTHORIZED_WORKER_INDEX_SENTINEL.txt"] },
    { worktreePaths: ["scripts/verify-plan-authority.mjs"] },
    { untrackedPaths: ["UNAUTHORIZED_WORKER_UNTRACKED_SENTINEL.txt"] },
  ]) {
    withSyntheticActivationReceipts(null, ({ registry, gitState }) => {
      Object.assign(gitState, { cachedPaths: [], worktreePaths: [], untrackedPaths: [], ...mutation });
      const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "activation", gitState });
      assert.notEqual(result.state, "ACTIVE");
      assert.equal(result.frozenWorkerStart, null);
      assert.match(result.failures.join("\n"), /WORKER_INDEX_OR_WORKTREE_MUTATION/);
    });
  }
});

test("activation rejects cross-grant substitution, HEAD/tree movement, and malformed completion", () => {
  withSyntheticActivationReceipts((receipts) => {
    [receipts.T03.authorizationId, receipts.T04.authorizationId] = [receipts.T04.authorizationId, receipts.T03.authorizationId];
  }, ({ registry, gitState }) => {
    const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "activation", gitState });
    assert.match(result.failures.join("\n"), /activationReceipt.identity/);
  });
  withSyntheticActivationReceipts(null, ({ registry, gitState }) => {
    gitState.currentTree = "9".repeat(40);
    const result = verifyP180SiblingAuthorization({
      repoRoot: fixtureRoot, registry, ticket: "T03", mode: "activation", gitState,
      frozenStart: { commit: gitState.phase0BCommit, tree: gitState.phase0BTree },
    });
    assert.equal(result.state, "ABORTED_DERIVED");
    assert.equal(result.frozenWorkerStart, null);
    assert.match(result.failures.join("\n"), /frozen worker HEAD\/tree moved/);
  });
  withSyntheticActivationReceipts(null, ({ registry, gitState }) => {
    const completion = resolve(fixtureRoot, "docs/audits/evidence/goal/2026-08-31-obx-p180-t03-completion-receipt.json");
    writeFileSync(completion, "{}\n");
    try {
      const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "activation", gitState });
      assert.notEqual(result.state, "CONSUMED");
      assert.match(result.failures.join("\n"), /COMPLETION_RECEIPT_PAIR_INCOMPLETE/);
      assert.doesNotMatch(result.failures.join("\n"), /AUTHORIZATION_ALREADY_CONSUMED/);
    } finally { rmSync(completion, { force: true }); }
  });
});

test("a valid sealed completion pair derives CONSUMED without weakening claim replay", () => {
  withSyntheticCompletionReceipts(null, ({ registry, gitState }) => {
    for (const ticket of ["T03", "T04"]) {
      const lifecycle = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket, mode: "lifecycle", gitState });
      assert.deepEqual(lifecycle.failures, []);
      assert.equal(lifecycle.state, "CONSUMED");
      const claim = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket, mode: "activation", gitState });
      assert.equal(claim.state, "CONSUMED");
      assert.match(claim.failures.join("\n"), /AUTHORIZATION_ALREADY_CONSUMED/);
    }
  });
});

test("completion-only verifies the bound external proof registry", () => {
  withSyntheticCompletionReceipts(null, ({ registry, gitState, proofRoot }) => {
    const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "completion", gitState, proofRoot });
    assert.deepEqual(result.failures, []);
    assert.equal(result.state, "CONSUMED");
  });
});

test("completion-only rejects a registry entry without its controller envelope", () => {
  withSyntheticCompletionReceipts(null, ({ registry, gitState, proofRoot, receipts }) => {
    rmSync(controllerEnvelopePath(proofRoot, receipts.T03.proofBinding.tuples[0]), { force: true });
    const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "completion", gitState, proofRoot });
    assert.notEqual(result.state, "CONSUMED");
    assert.match(result.failures.join("\n"), /controller proof envelope.*missing/i);
  });
});

test("completion-only rejects unsafe-mode, symlinked, or byte-drifted controller envelopes", () => {
  withSyntheticCompletionReceipts(null, ({ registry, gitState, proofRoot, receipts }) => {
    chmodSync(controllerEnvelopePath(proofRoot, receipts.T03.proofBinding.tuples[0]), 0o644);
    const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "completion", gitState, proofRoot });
    assert.match(result.failures.join("\n"), /controller proof envelope.*mode 0600/i);
  });
  withSyntheticCompletionReceipts(null, ({ registry, gitState, proofRoot, receipts }) => {
    const path = controllerEnvelopePath(proofRoot, receipts.T03.proofBinding.tuples[0]);
    const outside = resolve(fixtureRoot, "outside-controller-envelope.json");
    const original = readFileSync(path);
    rmSync(path, { force: true });
    writeFileSync(outside, original, { mode: 0o600 });
    symlinkSync(outside, path);
    try {
      const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "completion", gitState, proofRoot });
      assert.match(result.failures.join("\n"), /controller proof envelope.*missing or unsafe/i);
    } finally { rmSync(outside, { force: true }); }
  });
  withSyntheticCompletionReceipts(null, ({ registry, gitState, proofRoot, receipts }) => {
    const path = controllerEnvelopePath(proofRoot, receipts.T03.proofBinding.tuples[0]);
    const original = readFileSync(path);
    writeFileSync(path, Buffer.concat([original, Buffer.from(" ")]));
    const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "completion", gitState, proofRoot });
    assert.match(result.failures.join("\n"), /controller proof envelope.*byte digest mismatch/i);
  });
});

test("malformed or partial completion files fail without consuming the authorization", () => {
  withSyntheticActivationReceipts(null, ({ registry, gitState }) => {
    writeFileSync(resolve(fixtureRoot, completionPaths.T03), "{}\n");
    try {
      const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "lifecycle", gitState });
      assert.notEqual(result.state, "CONSUMED");
      assert.match(result.failures.join("\n"), /COMPLETION_RECEIPT_PAIR_INCOMPLETE|COMPLETION_RECEIPT_INVALID/);
      assert.doesNotMatch(result.failures.join("\n"), /AUTHORIZATION_ALREADY_CONSUMED/);
    } finally { rmSync(resolve(fixtureRoot, completionPaths.T03), { force: true }); }
  });
  withSyntheticActivationReceipts(null, ({ registry, gitState }) => {
    for (const path of Object.values(completionPaths)) writeFileSync(resolve(fixtureRoot, path), "{}\n");
    try {
      const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "lifecycle", gitState });
      assert.equal(result.state, "INVALID");
      assert.match(result.failures.join("\n"), /completionReceipt/);
      assert.doesNotMatch(result.failures.join("\n"), /AUTHORIZATION_ALREADY_CONSUMED/);
    } finally { for (const path of Object.values(completionPaths)) rmSync(resolve(fixtureRoot, path), { force: true }); }
  });
});

test("terminal validation rejects cross-grant proof tuples and implementation drift", () => {
  withSyntheticCompletionReceipts((receipts) => {
    receipts.T03.proofBinding.tuples[0].authorizationId = receipts.T04.authorizationId;
  }, ({ registry, gitState }) => {
    const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "lifecycle", gitState });
    assert.match(result.failures.join("\n"), /proofBinding|completion/i);
  });
  withSyntheticCompletionReceipts((receipts) => {
    receipts.T04.implementation.files[0].digest = "0".repeat(64);
  }, ({ registry, gitState }) => {
    const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T04", mode: "lifecycle", gitState });
    assert.match(result.failures.join("\n"), /implementation.*digest|current completed artifact drift/i);
  });
  withSyntheticCompletionReceipts((receipts) => {
    receipts.T04.implementation.parentCommit = receipts.T03.activationBinding.frozenStartCommit;
  }, ({ registry, gitState }) => {
    const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T04", mode: "lifecycle", gitState });
    assert.match(result.failures.join("\n"), /T04 completion implementation parent|topology/i);
  });
});

test("sealed completion survives later shared-governance verifier evolution", () => {
  withSyntheticCompletionReceipts(null, ({ registry, gitState }) => {
    for (const relativePath of [
      "scripts/verify-plan-authority.mjs",
      "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json",
      "docs/plans/one-box-master/00-authority/authority-manifest.json",
      "docs/audits/evidence/security/2026-08-31-obx-p180-source-adoption-authority-repin.json",
    ]) {
      const path = resolve(fixtureRoot, relativePath);
      const original = readFileSync(path);
      writeFileSync(path, Buffer.concat([original, Buffer.from("\n ")]));
      const evolvedRegistry = relativePath.endsWith("scoped-implementation-authorizations.json")
        ? { ...registry, authorizations: [...registry.authorizations, { id: "OBX-AUTH-P180-T05-SYNTHETIC-LATER-RECORD" }] }
        : registry;
      try {
        for (const ticket of ["T03", "T04"]) {
          const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry: evolvedRegistry, ticket, mode: "lifecycle", gitState });
          assert.deepEqual(result.failures, []);
          assert.equal(result.state, "CONSUMED");
        }
      } finally { writeFileSync(path, original); }
    }
  });
});

test("a sealed pair cannot mask a current predecessor failure as CONSUMED", () => {
  withSyntheticCompletionReceipts(null, ({ registry, gitState }) => {
    const path = resolve(fixtureRoot, "docs/audits/evidence/goal/2026-08-31-obx-p180-t02-completion-checkpoint.json");
    const original = readFileSync(path);
    const checkpoint = JSON.parse(original.toString("utf8"));
    checkpoint.status = "DRIFT";
    writeFileSync(path, `${JSON.stringify(checkpoint, null, 2)}\n`);
    try {
      const result = verifyP180SiblingAuthorization({ repoRoot: fixtureRoot, registry, ticket: "T03", mode: "lifecycle", gitState });
      assert.equal(result.state, "INVALID");
      assert.match(result.failures.join("\n"), /T02 completion checkpoint/);
    } finally { writeFileSync(path, original); }
  });
});

test("sibling security receipts reject coverage, disposition, shape, and accepted-risk drift", () => {
  const path = "docs/audits/evidence/security/2026-08-31-obx-p180-t03-solo-authorization-security-review.json";
  withJsonMutation(path, (receipt) => {
    receipt.coverage[1].status = "FAIL";
    receipt.coverage[2].disposition = "drift";
    receipt.coverage[3].unexpected = true;
    receipt.findings[0].severity = "CRITICAL";
    receipt.findings[0].reasonCode = "DRIFT";
    setSelfHash(receipt);
  }, (result) => {
    assert.match(result.stderr, /securityReceipt\.coverage: exact value drift/);
    assert.match(result.stderr, /securityReceipt\.coverage\[3\]\.keys: exact value drift/);
    assert.match(result.stderr, /securityReceipt\.findings: exact value drift/);
  }, ["--verify-solo-t03-record-only"]);
});

test("aggregate validation checks T02 completion once while focused siblings retain it", () => {
  const path = "docs/audits/evidence/goal/2026-08-31-obx-p180-t02-completion-checkpoint.json";
  withJsonMutation(path, (receipt) => {
    receipt.status = "DRIFT";
  }, (result) => {
    const matches = result.stderr.match(/T02 completion checkpoint\.identity: exact value drift/g) ?? [];
    assert.equal(matches.length, 1, result.stderr);
  });
  withJsonMutation(path, (receipt) => {
    receipt.status = "DRIFT";
  }, (result) => {
    assert.match(result.stderr, /T02 completion checkpoint\.identity: exact value drift/);
  }, ["--verify-solo-t03-record-only"]);
});

test("the solo T02 security receipt rejects target-hash and review drift", () => {
  withJsonMutation(t02SecurityReceiptPath, (receipt) => {
    receipt.targetHashes[0].digest = "0".repeat(64);
    receipt.independentHumanReview.satisfied = true;
  }, (result) => {
    assert.match(result.stderr, /targetHashes: exact value drift/);
    assert.match(result.stderr, /independentHumanReview: exact value drift/);
  }, ["--verify-solo-t02-receipt-only"]);
});

test("the solo T02 security receipt rejects extra findings and surface loss", () => {
  withJsonMutation(t02SecurityReceiptPath, (receipt) => {
    receipt.findings.push({ findingId: "EXTRA", severity: "LOW", status: "OPEN" });
    receipt.findings[0].surfaceDisposition.pop();
  }, (result) => {
    assert.match(result.stderr, /sole accepted separation finding required/);
  }, ["--verify-solo-t02-receipt-only"]);
});

test("the solo T01 amendment matches its exact pinned digest and unavailable-review state", () => {
  const result = runSoloAmendment();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /eb932d7e0a6cd12fa2cfa6570afbcad452bbdf8481047c700aaf3eec4075d202/);
  assert.match(result.stdout, /Independent human review: NOT_AVAILABLE \/ false/);
  assert.match(result.stdout, /non-waivable governance defaults preserved/);
});

test("the solo T01 amendment rejects unknown fields and byte drift", () => {
  withJsonMutation("docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json", (amendment) => {
    amendment.generalAuthorization = true;
  }, (result) => {
    assert.match(result.stderr, /solo T01 amendment: SHA-256 drift/);
    assert.match(result.stderr, /solo T01 amendment: unknown key generalAuthorization/);
  }, ["--verify-solo-amendment-only"]);
});

test("the solo T01 amendment cannot become a standard waiver", () => {
  withJsonMutation("docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json", (amendment) => {
    amendment.standardWaiverEligible = true;
  }, (result) => assert.match(result.stderr, /standardWaiverEligible drift/), ["--verify-solo-amendment-only"]);
});

test("the solo T01 amendment pins NOT_AVAILABLE and false for every lost control", () => {
  withJsonMutation("docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json", (amendment) => {
    amendment.unavailableControls[2].assignmentStatus = "not-available";
    amendment.unavailableControls[2].separationSatisfied = true;
  }, (result) => assert.match(result.stderr, /unavailableControls\[2\]: exact value drift/), ["--verify-solo-amendment-only"]);
});

test("the solo T01 amendment requires the exact 336-hour non-renewable lifetime", () => {
  withJsonMutation("docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json", (amendment) => {
    amendment.expiresAt = "2026-09-15T13:33:33Z";
    amendment.renewable = true;
  }, (result) => {
    assert.match(result.stderr, /renewable drift/);
    assert.match(result.stderr, /expiry must be exactly 336 hours/);
  }, ["--verify-solo-amendment-only"]);
});

test("the solo T01 amendment cannot weaken the frozen non-waivable defaults", () => {
  withFileMutation("docs/governance/risk-exceptions/README.md", (text) => `${text}\nSolo authorization is generally waivable.\n`, (result) => {
    assert.match(result.stderr, /non-waivable governance default drift/);
  }, ["--verify-solo-amendment-only"]);
});

test("the exact synthetic solo T01 receipt chain passes receipt-only verification", () => {
  withExactReceiptChain(() => {
    const result = run(["--verify-solo-receipts-only"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /exact receipt chain/);
  });
});

test("the exact captured solo T01 source scope passes", () => {
  const registry = JSON.parse(readFileSync(resolve(fixtureRoot, securityReceiptTargets[0]), "utf8"));
  const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T01-SOLO-001");
  const result = run(["--verify-solo-source-scope-only"], {
    SOLO_COMMITTED_CHANGED_PATHS_JSON: JSON.stringify(record.activationWriteSet),
    SOLO_UNTRACKED_ROWS_JSON: JSON.stringify(record.preExistingUntrackedBaseline),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /activation source scope/);
});

test("[solo negative 01] ATF bytes and fields remain deep-equal", () => {
  withJsonMutation(securityReceiptTargets[0], (registry) => {
    registry.authorizations[0].evidence += " drift";
  }, (result) => assert.match(result.stderr, /OBX-AUTH-ATF-001: canonical record drift/), ["--verify-solo-structure-only"]);
});

test("[solo negative 02] global implementation authorization remains false", () => {
  withJsonMutation(securityReceiptTargets[0], (registry) => {
    registry.globalImplementationAuthorized = true;
  }, (result) => assert.match(result.stderr, /cannot authorize the full program/), ["--verify-solo-structure-only"]);
});

test("[solo negative 03] registry version, record kinds, and keys are closed", () => {
  withJsonMutation(securityReceiptTargets[0], (registry) => {
    registry.schemaVersion = 3;
  }, (result) => assert.match(result.stderr, /unsupported schemaVersion/), ["--verify-solo-structure-only"]);
  withSoloRecordMutation((record) => {
    record.recordKind = "generic-owner-amendment";
    record.unreviewed = true;
  }, (result) => {
    assert.match(result.stderr, /recordKind drift/);
    assert.match(result.stderr, /unknown key unreviewed/);
  });
});

test("[solo negative 04] timestamps and renewal are exact and bounded", () => {
  withSoloRecordMutation((record) => {
    record.recordedAt = "2026-08-31";
    record.renewable = true;
  }, (result) => {
    assert.match(result.stderr, /recordedAt drift/);
    assert.match(result.stderr, /renewable drift/);
    assert.match(result.stderr, /timestamps must be canonical/);
  });
});

test("[solo negative 05] same-human, implied, or present assignments fail", () => {
  withSoloRecordMutation((record) => {
    record.roleAvailability[0].assignmentRecordPresent = true;
    record.roleAvailability[0].humanActorId = "person:devin-wiggins";
    record.roleAvailability[0].escalationActorId = "person:devin-wiggins";
  }, (result) => assert.match(result.stderr, /roleAvailability\[0\]: exact value drift/));
});

test("[solo negative 06] unavailable tokens and false values are exact", () => {
  withSoloRecordMutation((record) => {
    record.independentHumanReview.status = "not-available";
    record.independentHumanReview.satisfied = true;
  }, (result) => assert.match(result.stderr, /independentHumanReview: exact value drift/));
});

test("[solo negative 07] governing requirements cannot be claimed satisfied", () => {
  withSoloRecordMutation((record) => {
    record.requirementExceptions[1].satisfactionStatus = "SATISFIED";
    record.requirementExceptions[1].waivedClauses = [];
  }, (result) => assert.match(result.stderr, /requirementExceptions\[1\]: exact value drift/));
});

test("[solo negative 08] every nested artifact and base commit is bound", () => {
  withFileMutation("docs/plans/one-box-master/04-operating-environment/obx-p180/05-security-and-executable-evaluations.md", (text) => `${text}\ndrift\n`, (result) => {
    assert.match(result.stderr, /current hash drift .*05-security-and-executable-evaluations/);
  }, ["--verify-solo-structure-only"]);
  withSoloRecordMutation((record) => {
    record.baseCommit = "66f9afeaaf1e9b37d4bd1ef5437a88e1f6a425bd";
  }, (result) => assert.match(result.stderr, /baseCommit drift/));
});

test("[solo negative 09] exact path equality rejects prefixes, reordering, and additions", () => {
  withSoloRecordMutation((record) => {
    record.allowedPaths.push("src/lib/operatingEnvironment/registry.ts");
  }, (result) => assert.match(result.stderr, /allowedPaths: exact value drift/));
  withSoloRecordMutation((record) => {
    record.allowedPaths.reverse();
  }, (result) => assert.match(result.stderr, /allowedPaths: exact value drift/));
});

test("[solo negative 10] effect or forbidden-capability drift fails", () => {
  withSoloRecordMutation((record) => {
    record.allowedEffects.push("connect-provider");
    record.forbiddenEffects = record.forbiddenEffects.filter((effect) => effect !== "provider-or-model-call");
  }, (result) => {
    assert.match(result.stderr, /allowedEffects: exact value drift/);
    assert.match(result.stderr, /forbiddenEffects: exact value drift/);
  });
});

test("[solo negative 11] amendment identity, hash, and standard-waiver state are fixed", () => {
  withSoloRecordMutation((record) => {
    record.amendmentBinding.digest = "0".repeat(64);
  }, (result) => assert.match(result.stderr, /amendmentBinding: exact value drift/));
  withJsonMutation("docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json", (amendment) => {
    amendment.standardWaiverEligible = true;
  }, (result) => assert.match(result.stderr, /standardWaiverEligible drift/), ["--verify-solo-structure-only"]);
});

test("[solo negative 12] frozen non-waivable governance defaults cannot drift", () => {
  withFileMutation("docs/governance/reviewer-roles.md", (text) => `${text}\nGeneral solo waiver enabled.\n`, (result) => {
    assert.match(result.stderr, /non-waivable governance default drift|current hash drift/);
  }, ["--verify-solo-structure-only"]);
});

test("[solo negative 13] dependency and lockfile changes fail", () => {
  withFileMutation("package-lock.json", (text) => `${text} `, (result) => {
    assert.match(result.stderr, /dependencyBindings: current hash drift package-lock\.json/);
  }, ["--verify-solo-structure-only"]);
});

test("[solo negative 14] authority-manifest fields other than packetDigest remain frozen", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    authority.implementationAuthorized = true;
  }, (result) => assert.match(result.stderr, /authority manifest changed outside packetDigest/), ["--verify-solo-structure-only"]);
});

test("[solo negative 15] parent/evaluation promotion and T02 authority fail", () => {
  withJsonMutation("docs/eval/one-box-program/manifest.json", (manifest) => {
    manifest.evaluations.find((evaluation) => evaluation.id === "PROG-EVAL-COST-001").status = "active";
  }, (result) => assert.match(result.stderr, /parent evaluation PROG-EVAL-COST-001 must remain planned/), ["--verify-solo-structure-only"]);
  withSoloRecordMutation((record) => {
    record.childTicketIds.push("OBX-P180-T02");
  }, (result) => assert.match(result.stderr, /childTicketIds: exact value drift/));
});

test("[solo negative 16] missing or drifted exact receipts fail", () => {
  withExactReceiptChain(() => {
    const validResult = run(["--verify-solo-receipts-only"]);
    assert.equal(validResult.status, 0, validResult.stderr);
    for (const receiptPath of [securityReceiptPath, grokReceiptPath, fableReceiptPath]) {
      const absolute = resolve(fixtureRoot, receiptPath);
      const original = readFileSync(absolute);
      try {
        rmSync(absolute);
        const missingResult = run(["--verify-solo-receipts-only"]);
        assert.notEqual(missingResult.status, 0);
        assert.match(missingResult.stderr, new RegExp(`missing non-symlink regular file ${receiptPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
        assert.match(missingResult.stderr, /required receipt is unavailable/);
      } finally {
        writeFileSync(absolute, original);
      }
    }
    withJsonMutation(grokReceiptPath, (receipt) => {
      receipt.verdict = "CLEAN";
      receipt.findings.push({ findingId: "EXTRA", severity: "LOW", status: "OPEN" });
    }, (result) => {
      assert.match(result.stderr, /verdict must be PASS-WITH-ACCEPTED-RISK/);
      assert.match(result.stderr, /findings must contain the sole accepted separation finding/);
    }, ["--verify-solo-receipts-only"]);
  });
});

test("[solo negative 17] authorization self-hash mismatch fails", () => {
  withSoloRecordMutation((record) => {
    record.authorizationHash.digest = "0".repeat(64);
  }, (result) => assert.match(result.stderr, /authorization self-hash mismatch/), { rehash: false });
});

test("[solo negative 18] extra committed or untracked paths fail source scope", () => {
  const registry = JSON.parse(readFileSync(resolve(fixtureRoot, securityReceiptTargets[0]), "utf8"));
  const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T01-SOLO-001");
  const result = run(["--verify-solo-source-scope-only"], {
    SOLO_COMMITTED_CHANGED_PATHS_JSON: JSON.stringify([...record.activationWriteSet, "docs/audits/unlisted.json"]),
    SOLO_UNTRACKED_ROWS_JSON: JSON.stringify(record.preExistingUntrackedBaseline),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /committedChangedPaths: exact value drift/);
});

test("[solo negative 19] an otherwise-valid authorization fails strictly after expiresAt", () => {
  const registry = JSON.parse(readFileSync(resolve(fixtureRoot, securityReceiptTargets[0]), "utf8"));
  const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T01-SOLO-001");
  const evaluationTime = Date.parse(record.expiresAt) + 1;
  const result = run(["--verify-solo-structure-only"], fixedEvaluationTimeEnvironment(evaluationTime));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /authorization is expired/);
  assert.match(result.stderr, /amendment is expired/);
  const nonExpiryFailures = result.stderr.split("\n").filter((line) => line.startsWith("FAIL ") && !line.includes("expired"));
  assert.deepEqual(nonExpiryFailures, []);
});

test("JSON null cannot bypass authority validation", () => {
  withFileMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", () => "null\n", (result) => {
    assert.match(result.stderr, /top level must be a JSON object/);
  });
});

test("empty manifests cannot produce a vacuous success", () => {
  withFileMutation("docs/tickets/one-box-program/manifest.json", () => "{}\n", (result) => {
    assert.match(result.stderr, /unsupported schemaVersion/);
    assert.match(result.stderr, /tickets must be a non-empty array/);
  });
});

test("an audit cannot be promoted to primary authority", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    authority.domains["release-1"].primaryPath = "docs/audits/grok-4.6/2026-08-29-one-box-technology-master-plan-audit.md";
    authority.domains["release-1"].authorityClass = "owner-approved";
    authority.domains["release-1"].implementationAuthorized = true;
  }, (result) => {
    assert.match(result.stderr, /primaryPath drift/);
    assert.match(result.stderr, /docs\/audits\/ cannot be a primary authority/);
    assert.match(result.stderr, /cannot authorize implementation/);
  });
});

test("a planning domain cannot enable implementation", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    authority.domains["operating-environment"].implementationAuthorized = true;
  }, (result) => assert.match(result.stderr, /cannot authorize implementation/));
});

test("the scoped implementation authorization registry is required", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    delete authority.scopedImplementationAuthorityPath;
  }, (result) => assert.match(result.stderr, /missing scopedImplementationAuthorityPath/));
});

test("the scoped authorization registry rejects unknown keys", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.implementationAuthorized = true;
  }, (result) => assert.match(result.stderr, /registry: unknown key implementationAuthorized/));
});

test("a scoped authorization record rejects unknown keys", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].extendsTickets = ["OBX-P180"];
  }, (result) => assert.match(result.stderr, /OBX-AUTH-ATF-001: unknown key extendsTickets/));
});

test("a scoped authorization scope rejects unknown grants", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].scope.networkAllowed = true;
  }, (result) => assert.match(result.stderr, /OBX-AUTH-ATF-001.scope: unknown key networkAllowed/));
});

test("a scoped authorization review contract rejects unknown fallback fields", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].requiredReview.fallbackModel = "some-provider/model";
  }, (result) => assert.match(result.stderr, /OBX-AUTH-ATF-001.requiredReview: unknown key fallbackModel/));
});

test("a scoped teammate authorization cannot grant mutation or authority effects", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].scope.allowedEffectClasses.push("mutate", "external-effect", "authority");
  }, (result) => assert.match(result.stderr, /only read and propose effects/));
});

test("the authorized foundation record cannot disappear", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations = [];
  }, (result) => assert.match(result.stderr, /authorizations must be a non-empty array/));
});

test("an unknown scoped authorization cannot piggyback on the foundation packet", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations.push({ ...registry.authorizations[0], id: "OBX-AUTH-UNREVIEWED-001" });
  }, (result) => assert.match(result.stderr, /exactly OBX-AUTH-ATF-001/));
});

test("scoped implementation paths reject traversal and glob expansion", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].scope.allowedPathPrefixes.push("../outside/**");
  }, (result) => assert.match(result.stderr, /authorized path must be explicit and repository-relative/));
});

test("the foundation authorization rejects Deep Agents runtime dependencies", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const scope = registry.authorizations[0].scope;
    scope.newRuntimeDependenciesAllowed = true;
    scope.runtimeDependencies = ["deepagents", "@langchain/langgraph"];
  }, (result) => assert.match(result.stderr, /no runtime dependencies/));
});

test("a scoped record cannot authorize the wider operating environment", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].scope.fullProgramAuthorization = true;
  }, (result) => assert.match(result.stderr, /cannot authorize the full program, deployment, or release/));
});

test("the authorized teammate path set cannot drift to provider code", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].scope.allowedExactPaths.push("src/lib/openrouter.ts");
  }, (result) => assert.match(result.stderr, /foundation path scope drift/));
});

test("canonical documentation authorization cannot broaden beyond exact files", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const paths = registry.authorizations[0].scope.allowedExactPaths;
    const index = paths.findIndex((path) => path.startsWith("docs/architecture"));
    if (index === -1) paths.push("docs/architecture/");
    else paths[index] = "docs/architecture/";
  }, (result) => assert.match(result.stderr, /canonical documentation path scope drift/));
});

test("E2E verification harness authorization cannot broaden or drift", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const paths = registry.authorizations[0].scope.allowedExactPaths;
    const index = paths.indexOf("scripts/e2e/canvas-contract.mjs");
    if (index === -1) paths.push("scripts/e2e/");
    else paths[index] = "scripts/e2e/";
  }, (result) => assert.match(result.stderr, /E2E verification harness path scope drift/));
});

test("supporting evidence prefixes must remain date-and-slice bounded", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const prefixes = registry.authorizations[0].scope.supportingEvidencePrefixes;
    const index = prefixes.findIndex((prefix) => prefix.includes("2026-08-30"));
    if (index === -1) prefixes.push("docs/audits/grok-4.6/");
    else prefixes[index] = "docs/audits/grok-4.6/";
  }, (result) => assert.match(result.stderr, /supporting evidence prefixes must remain date-and-slice bounded/));
});

test("the exact supporting evidence prefix set cannot lose an entry", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].scope.supportingEvidencePrefixes.pop();
  }, (result) => assert.match(result.stderr, /supporting evidence prefix set drift/));
});

test("the scoped authorization target must stay bound to its approved specification", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].sourceSpec = "docs/specs/2026-08-16-canvas-upgrade.md";
  }, (result) => assert.match(result.stderr, /source specification binding drift/));
});

test("the foundation authorization pins ticketIds to exactly OBX-AT-001", () => {
  withMultipleFileMutations([
    ["docs/tickets/ai-teammate-foundation/manifest.json", (text) => {
      const manifest = JSON.parse(text);
      manifest.tickets.push({ ...manifest.tickets[0], id: "OBX-AT-002", title: "Connect a provider" });
      return `${JSON.stringify(manifest, null, 2)}\n`;
    }],
    ["docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (text) => {
      const registry = JSON.parse(text);
      registry.authorizations[0].ticketIds.push("OBX-AT-002");
      return `${JSON.stringify(registry, null, 2)}\n`;
    }],
    ["docs/tickets/ai-teammate-foundation/OBX-AT-001.md", (text) => `${text}\nid: OBX-AT-002\n`],
  ], (result) => assert.match(result.stderr, /foundation ticket set must be exactly OBX-AT-001/));
});

test("the operating-environment domain remains draft and unauthorized", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    authority.domains["operating-environment"].authorityClass = "owner-approved";
    authority.domains["operating-environment"].implementationAuthorized = true;
  }, (result) => assert.match(result.stderr, /operating-environment must remain draft and implementationAuthorized=false/));
});

test("OBX-P180 remains proposed while the foundation slice runs", () => {
  withMultipleFileMutations([
    ["docs/tickets/one-box-program/manifest.json", (text) => {
      const manifest = JSON.parse(text);
      manifest.tickets.find((ticket) => ticket.id === "OBX-P180").status = "blocked";
      return `${JSON.stringify(manifest, null, 2)}\n`;
    }],
    ["docs/tickets/one-box-program/OBX-P180.md", (text) => text.replace("status: proposed", "status: blocked")],
  ], (result) => assert.match(result.stderr, /OBX-P180 must remain proposed/));
});

test("OBX-P310 remains blocked while the foundation slice runs", () => {
  withMultipleFileMutations([
    ["docs/tickets/one-box-program/manifest.json", (text) => {
      const manifest = JSON.parse(text);
      manifest.tickets.find((ticket) => ticket.id === "OBX-P310").status = "proposed";
      return `${JSON.stringify(manifest, null, 2)}\n`;
    }],
    ["docs/tickets/one-box-program/OBX-P310.md", (text) => text.replace("status: blocked", "status: proposed")],
  ], (result) => assert.match(result.stderr, /OBX-P310 must remain blocked/));
});

test("the teammate component scope must use a delimited directory", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const prefixes = registry.authorizations[0].scope.allowedPathPrefixes;
    const componentPrefix = prefixes.findIndex((prefix) => prefix.startsWith("src/components/preview/AiTeammate"));
    prefixes[componentPrefix] = "src/components/preview/AiTeammateProvider";
  }, (result) => assert.match(result.stderr, /teammate component path scope must use a delimited directory/));
});

test("the foundation authorization requirement remains exactly E1", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].requirements.push("E2");
  }, (result) => assert.match(result.stderr, /requirements must be exactly E1/));
});

test("the foundation invalidation contract cannot be weakened", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].invalidators.pop();
  }, (result) => assert.match(result.stderr, /invalidation contract drift/));
});

test("the foundation ticket cannot advance automatically", () => {
  withJsonMutation("docs/tickets/ai-teammate-foundation/manifest.json", (manifest) => {
    manifest.ticketStatusPolicy.automaticTransitionAllowed = true;
  }, (result) => assert.match(result.stderr, /ticket status transition policy drift/));
});

test("a required domain cannot disappear", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    delete authority.domains.canvas;
  }, (result) => assert.match(result.stderr, /missing domain canvas/));
});

test("unknown ticket dependencies fail closed", () => {
  withJsonMutation("docs/tickets/one-box-program/manifest.json", (manifest) => {
    manifest.tickets[0].dependsOn.push("OBX-P999");
  }, (result) => assert.match(result.stderr, /unknown dependency OBX-P999/));
});

test("duplicate ticket IDs fail closed", () => {
  withJsonMutation("docs/tickets/one-box-program/manifest.json", (manifest) => {
    manifest.tickets.push({ ...manifest.tickets[0] });
  }, (result) => assert.match(result.stderr, /duplicate OBX-P100/));
});

test("unknown ticket evaluations and evaluation owners fail closed", () => {
  withJsonMutation("docs/eval/one-box-program/manifest.json", (manifest) => {
    manifest.evaluations[0].ownerTicket = "OBX-P999";
  }, (result) => assert.match(result.stderr, /unknown ownerTicket OBX-P999/));
});

test("unknown adoption decisions cannot enable code use", () => {
  withJsonMutation("docs/research/source-catalog/adoption-ledger.json", (ledger) => {
    ledger.entries[0].decision = "Retain-ish";
    ledger.entries[0].recordCompleteness = "complete";
    ledger.entries[0].codeUseAllowed = true;
  }, (result) => {
    assert.match(result.stderr, /invalid decision Retain-ish/);
    assert.match(result.stderr, /Retain-ish cannot allow use/);
  });
});

test("repository path traversal fails closed", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    authority.domains["release-1"].relatedPaths = ["../outside.md"];
  }, (result) => assert.match(result.stderr, /path must stay relative to the repository/));
});

test("missing EOS traceability rows fail closed", () => {
  withFileMutation("docs/eval/one-box-program/traceability.md", (text) => text.replace(/^\| EOS-019 .*\n/m, ""), (result) => {
    assert.match(result.stderr, /EOS-019 must have exactly one table row/);
  });
});

test("missing front-door tokens fail closed", () => {
  withFileMutation("AGENTS.md", (text) => text.replaceAll("docs/plans/one-box-master/00-authority/authority-manifest.json", "missing-authority-manifest.json"), (result) => {
    assert.match(result.stderr, /missing authority-manifest front door/);
  });
});

test("broken local links in contributor surfaces fail closed", () => {
  withFileMutation("CONTRIBUTING.md", (text) => `${text}\n[broken](docs/does-not-exist.md)\n`, (result) => {
    assert.match(result.stderr, /broken or external local link/);
  });
});

test("broken local links in architecture documentation fail closed", () => {
  withFileMutation("docs/architecture/README.md", (text) => `${text}\n[broken](../does-not-exist.md)\n`, (result) => {
    assert.match(result.stderr, /broken or external local link/);
  });
});

test("symlinked packet files cannot escape the repository", () => {
  const outside = resolve(dirname(fixtureRoot), "one-box-plan-outside.txt");
  const link = resolve(fixtureRoot, "docs/escape-link.md");
  writeFileSync(outside, "outside\n");
  symlinkSync(outside, link);
  try {
    withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
      authority.domains["release-1"].relatedPaths = ["docs/escape-link.md"];
    }, (result) => assert.match(result.stderr, /missing non-symlink regular file/));
  } finally {
    rmSync(link, { force: true });
    rmSync(outside, { force: true });
  }
});

test("the embedded-browser closure register is a required digest-covered authority path", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    const domain = authority.domains["embedded-browser"];
    domain.relatedPaths = (domain.relatedPaths ?? []).filter((path) => path !== "docs/security/2026-08-29-embedded-browser-closure-requirements.md");
  }, (result) => assert.match(result.stderr, /embedded-browser: missing required related path .*embedded-browser-closure-requirements/));
});

test("every ticket requirement is covered by at least one linked evaluation", () => {
  withJsonMutation("docs/eval/one-box-program/manifest.json", (manifest) => {
    const evaluation = manifest.evaluations.find((candidate) => candidate.id === ["PROG", "EVAL", "AUTH", "001"].join("-"));
    evaluation.requirements = evaluation.requirements.filter((requirement) => requirement !== "EOS-001");
  }, (result) => assert.match(result.stderr, /OBX-P100: requirement EOS-001 is not covered by linked evaluations/));
});

test("evaluation ownership cannot depend back on the consuming ticket", () => {
  withMultipleFileMutations([
    ["docs/tickets/one-box-program/manifest.json", (text) => {
      const manifest = JSON.parse(text);
      manifest.tickets.find((ticket) => ticket.id === "OBX-P100").evaluations.push("PROG-EVAL-LIFE-001");
      return `${JSON.stringify(manifest, null, 2)}\n`;
    }],
    ["docs/tickets/one-box-program/OBX-P100.md", (text) => {
      const authorizationEvaluation = ["PROG", "EVAL", "AUTH", "001"].join("-");
      const testEvaluation = ["PROG", "EVAL", "TEST", "001"].join("-");
      const lifecycleEvaluation = ["PROG", "EVAL", "LIFE", "001"].join("-");
      return text.replace(`evaluations: ${authorizationEvaluation}, ${testEvaluation}`, `evaluations: ${authorizationEvaluation}, ${testEvaluation}, ${lifecycleEvaluation}`);
    }],
  ], (result) => assert.match(result.stderr, /OBX-P100: evaluation PROG-EVAL-LIFE-001 owner OBX-P110 depends on its consuming ticket/));
});

test("traceability rows reject evaluations that do not cover their requirement", () => {
  withFileMutation("docs/eval/one-box-program/traceability.md", (text) => text.replace("| EOS-001 authority map | PROG-EVAL-AUTH-001 |", "| EOS-001 authority map | PROG-EVAL-APPT-001 |"), (result) => {
    assert.match(result.stderr, /program traceability: EOS-001 evaluation PROG-EVAL-APPT-001 does not cover EOS-001/);
  });
});

test("CI action references must be immutable full commit SHAs", () => {
  withFileMutation(".github/workflows/ci.yml", (text) => text.replace(/uses: actions\/checkout@[a-f0-9]{40}/, "uses: actions/checkout@v6"), (result) => {
    assert.match(result.stderr, /ci workflow: actions\/checkout must use a full commit SHA/);
  });
});

test("governance policies are machine-readable and fail closed", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    delete authority.governancePolicies;
  }, (result) => assert.match(result.stderr, /authority manifest: missing governancePolicies/));
});

test("owner-approved acceptance records use a durable human identity reference", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    delete authority.domains.canvas.acceptanceRecord.identityRef;
  }, (result) => assert.match(result.stderr, /canvas: owner-approved class requires durable human identityRef and role/));
});
