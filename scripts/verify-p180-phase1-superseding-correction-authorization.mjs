#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const T03_SUPERSESSION_AUTHORIZATION_ID = "OBX-AUTH-P180-T03-AUDIT-CORRECTION-002";
export const T04_SUPERSESSION_AUTHORIZATION_ID = "OBX-AUTH-P180-T04-AUDIT-CORRECTION-002";
export const SUPERSESSION_HISTORICAL_VERIFICATION_COMMIT = "573b86ee9a06e45e09296dd832115dab128ecf2f";

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const GOAL_ROOT = "/Users/zero-suminc./.claude/goal-state/obx-p180-t03-t05-offline-wave";
const REGISTRY_PATH = "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json";
const SECURITY_PATH = "docs/audits/evidence/security/2026-09-01-obx-p180-phase1-audit-correction-supersession-security-review.json";
const DEFAULT_PROOF_ROOT = resolve(GOAL_ROOT, "proof");
const NEW_PROOF_REGISTRY_NAME = "phase1-superseding-correction-proof-registry.jsonl";
const REQUIRED_COMMAND_IDS = [
  "correction-focused",
  "operating-environment",
  "source-adoption",
  "typecheck",
  "targeted-lint",
  "verify-plans",
  "test-plans",
  "path-census",
  "dependency-diff",
  "forbidden-effects",
  "secrets-scan",
];
const GOVERNANCE_PATHS = [
  "docs/audits/evidence/goal/2026-09-01-obx-p180-t03-audit-correction-supersession-activation-receipt.json",
  "docs/audits/evidence/goal/2026-09-01-obx-p180-t03-audit-correction-supersession-completion-receipt.json",
  "docs/audits/evidence/goal/2026-09-01-obx-p180-t04-audit-correction-supersession-activation-receipt.json",
  "docs/audits/evidence/goal/2026-09-01-obx-p180-t04-audit-correction-supersession-completion-receipt.json",
  "docs/audits/evidence/security/2026-09-01-obx-p180-phase1-audit-correction-supersession-authority-repin.json",
  SECURITY_PATH,
  "docs/governance/risk-exceptions/2026-09-01-obx-p180-t03-audit-correction-supersession-solo.json",
  "docs/governance/risk-exceptions/2026-09-01-obx-p180-t04-audit-correction-supersession-solo.json",
  "docs/plans/one-box-master/00-authority/authority-manifest.json",
  REGISTRY_PATH,
  "docs/research/source-catalog/adoption-ledger.json",
  "scripts/verify-obx-p180-source-adoption.mjs",
  "scripts/verify-p180-phase1-correction-authorization.mjs",
  "scripts/verify-p180-phase1-superseding-correction-authorization.mjs",
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
];
const CONFIG = {
  T03: {
    id: T03_SUPERSESSION_AUTHORIZATION_ID,
    hash: "9f0df3084adca885a15558cf7196411364e647dabdcf6c9c7b2ac91138424246",
    recordPath: "docs/governance/risk-exceptions/2026-09-01-obx-p180-t03-audit-correction-supersession-solo.json",
    recordSha: "73661cc4ec443fcd3be7605e130e7c23b65b03f92612efa25fb9c5efba88f9e0",
    oldId: "OBX-AUTH-P180-T03-AUDIT-CORRECTION-001",
    oldRecordPath: "docs/governance/risk-exceptions/2026-09-01-obx-p180-t03-audit-correction-solo.json",
    oldRecordSha: "4cef2ba9b5e97b8a1da94243edf9b5ae9672536b7db5fd116e2aeacbec46d249",
    oldActivationPath: "docs/audits/evidence/goal/2026-09-01-obx-p180-t03-audit-correction-activation-receipt.json",
    oldActivationSha: "9a468b569579273fe2f9ffa34f106479397c47304313568775d8e4203fa7763c",
    commit: "76cbe6c19d553a41bc34c0ac8a88fb595bfbd354",
    tree: "8426b191a7c2e6802ed77ba1379a13b361313148",
    parent: "98ae5fa7c121e6c9f590fc8b37b3dbe736e53c5b",
    paths: ["src/lib/operatingEnvironment/receipts.ts", "src/lib/operatingEnvironment/receipts.test.ts"],
    orderedFileListSha256: "205c6b7e9c3b16770badd9eb4f0f41bb6a96eaf48aee933355f58b131d86f5c2",
    effect: "add-provider-offline-skill-context-interrupt-receipt-reducers",
  },
  T04: {
    id: T04_SUPERSESSION_AUTHORIZATION_ID,
    hash: "6788271928057097ae4a3ff0ac2b32f6366108b8b7f52c19d708204c0b5743a2",
    recordPath: "docs/governance/risk-exceptions/2026-09-01-obx-p180-t04-audit-correction-supersession-solo.json",
    recordSha: "4e739b5140d27db1a4c8365944dffc49ea4b887090b7a73f7298211a26941ca1",
    oldId: "OBX-AUTH-P180-T04-AUDIT-CORRECTION-001",
    oldRecordPath: "docs/governance/risk-exceptions/2026-09-01-obx-p180-t04-audit-correction-solo.json",
    oldRecordSha: "2f264c3bf3b3d1f02cbc66e63af7a72e27447a6b0c45fb9b2c07eb24e2cdea2e",
    oldActivationPath: "docs/audits/evidence/goal/2026-09-01-obx-p180-t04-audit-correction-activation-receipt.json",
    oldActivationSha: "1eb83f113b6bc88155f8c6f4cbf4f9a526a862b784f170474ad82d78f09cca14",
    commit: "a448fc993e6e89b2d5aeebb54e2261456c43f281",
    tree: "e8a5c2b42881c0e806e8df63108b4f559c6e8491",
    parent: "76cbe6c19d553a41bc34c0ac8a88fb595bfbd354",
    paths: [
      "src/lib/operatingEnvironment/budget.test.ts",
      "src/lib/operatingEnvironment/capacity.test.ts",
      "src/lib/operatingEnvironment/compare.test.ts",
      "src/lib/operatingEnvironment/fixtures/budget-capacity-v1.json",
    ],
    orderedFileListSha256: "25b116a0eb5fa8d4f0a6b552c8217da868980411bec363993c016552368bb809",
    effect: "add-provider-offline-in-memory-budget-capacity-compare-reducers",
  },
};
const ACTIVATION_PATHS = Object.fromEntries(Object.entries(CONFIG).map(([lane, config]) => [lane, config.recordPath.replace("docs/governance/risk-exceptions/", "docs/audits/evidence/goal/").replace("-solo.json", "-activation-receipt.json")]));
const COMPLETION_PATHS = Object.fromEntries(Object.entries(CONFIG).map(([lane, config]) => [lane, config.recordPath.replace("docs/governance/risk-exceptions/", "docs/audits/evidence/goal/").replace("-solo.json", "-completion-receipt.json")]));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const exact = (actual, expected, label, failures) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${label}: exact value drift`);
};
const readJson = (path, label, failures) => {
  if (!existsSync(path)) { failures.push(`${label}: missing`); return null; }
  try { return JSON.parse(readFileSync(path, "utf8")); } catch (error) { failures.push(`${label}: invalid JSON (${error.message})`); return null; }
};
const git = (root, args, label, failures) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined } });
  if (result.status !== 0) { failures.push(`${label}: git failed`); return null; }
  return result.stdout.trim();
};
function validateExternalBinding(binding, label, failures) {
  if (binding?.algorithm !== "sha256" || typeof binding.path !== "string" || !existsSync(binding.path)) { failures.push(`${label}: missing external binding`); return; }
  if (sha(readFileSync(binding.path)) !== binding.digest) failures.push(`${label}: digest drift`);
}
function validateSelfHash(value, field, expected, label, failures) {
  exact(value?.[field], { algorithm: "sha256", canonicalization: "canonical-json-v1", excludedJsonPointers: [`/${field}/digest`], digest: expected }, `${label}.${field}`, failures);
  const copy = structuredClone(value); if (copy?.[field]) delete copy[field].digest;
  if (sha(canonical(copy)) !== expected) failures.push(`${label}.${field}: canonical digest drift`);
}
function validateCommit(root, record, config, failures) {
  exact([record.acceptedCorrectionBinding.commit, record.acceptedCorrectionBinding.tree, record.acceptedCorrectionBinding.parentCommit], [config.commit, config.tree, config.parent], `${config.id}.accepted correction`, failures);
  exact(record.allowedCorrectionPaths, config.paths, `${config.id}.allowedCorrectionPaths`, failures);
  exact(record.allowedEffects, [config.effect], `${config.id}.allowedEffects`, failures);
  exact(record.acceptedCorrectionBinding.files.map((row) => row.path), config.paths, `${config.id}.accepted files`, failures);
  exact(git(root, ["rev-parse", `${config.commit}^{tree}`], `${config.id} tree`, failures), config.tree, `${config.id}.commit tree`, failures);
  exact(git(root, ["rev-parse", `${config.commit}^`], `${config.id} parent`, failures), config.parent, `${config.id}.commit parent`, failures);
  const changed = git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", config.commit], `${config.id} paths`, failures)?.split("\n").filter(Boolean).sort();
  exact(changed, [...config.paths].sort(), `${config.id}.commit paths`, failures);
  for (const row of record.acceptedCorrectionBinding.files) {
    const blob = spawnSync("git", ["show", `${config.commit}:${row.path}`], { cwd: root, encoding: null });
    if (blob.status !== 0 || row.algorithm !== "sha256" || sha(blob.stdout) !== row.digest || sha(readFileSync(resolve(root, row.path))) !== row.digest) failures.push(`${config.id}: accepted file drift ${row.path}`);
  }
}
function validateRecord(root, registry, lane, failures) {
  const config = CONFIG[lane]; const absolute = resolve(root, config.recordPath);
  const record = readJson(absolute, config.id, failures); if (!record) return null;
  if (sha(readFileSync(absolute)) !== config.recordSha) failures.push(`${config.id}: record byte drift`);
  exact([record.schemaVersion, record.id, record.recordKind, record.status, record.implementationAuthorized, record.activationRequired, record.projectId, record.branch, record.baseCommit, record.baseTree, record.ticketId, record.laneId, record.ownerActorId, record.riskOwnerActorId, record.controllerActorId, record.goalRunId, record.useLimit, record.renewable], [1, config.id, "owner-solo-superseding-correction-v1", "reserved-pending-activation", true, true, "one-box", "feat/obx-p180-t03-t05-offline-wave-recovery", CONFIG.T04.commit, CONFIG.T04.tree, `OBX-P180-${lane}`, lane, "person:devin-wiggins", "person:devin-wiggins", "agent:codex-gpt-5.6-sol-ultra:obx-p180-controller", "obx-p180-t03-t05-offline-wave", 1, false], `${config.id}.identity`, failures);
  validateSelfHash(record, "authorizationHash", config.hash, config.id, failures);
  validateExternalBinding(record.ownerDirectionBinding, `${config.id}.owner direction`, failures);
  validateExternalBinding(record.activationAllowlistBinding, `${config.id}.activation allowlist`, failures);
  exact(record.activationAllowlistBinding.exactPathCount, 16, `${config.id}.allowlist count`, failures);
  exact(record.governanceWriteScope.exactPaths, GOVERNANCE_PATHS, `${config.id}.governance paths`, failures);
  exact([record.governanceWriteScope.runtimeAuthority, record.governanceWriteScope.dependencyOrLockfileChangeAuthorized, record.governanceWriteScope.t05ThroughT08Authority], [false, false, false], `${config.id}.governance denials`, failures);
  exact([record.recordedAt, record.notBefore, record.expiresAt, record.exactDurationMilliseconds], ["2026-09-01T12:30:00.000Z", "2026-09-01T12:30:00.000Z", "2026-09-15T12:30:00.000Z", 1_209_600_000], `${config.id}.window`, failures);
  exact([record.invalidatedAttemptBinding.authorizationId, record.invalidatedAttemptBinding.recordPath, record.invalidatedAttemptBinding.recordSha256, record.invalidatedAttemptBinding.activationReceiptPath, record.invalidatedAttemptBinding.activationReceiptSha256, record.invalidatedAttemptBinding.failedProofSha256, record.invalidatedAttemptBinding.failedProofBytes, record.invalidatedAttemptBinding.failedRegistrySha256, record.invalidatedAttemptBinding.failedRegistryRows, record.invalidatedAttemptBinding.state, record.invalidatedAttemptBinding.immutable, record.invalidatedAttemptBinding.renewed, record.invalidatedAttemptBinding.reused, record.invalidatedAttemptBinding.truncated, record.invalidatedAttemptBinding.rebaselined], [config.oldId, config.oldRecordPath, config.oldRecordSha, config.oldActivationPath, config.oldActivationSha, "b7bcff2347ccc1d23358d25c08dd3104eaf29e1775f449c7fab9eaaa83d0cfbf", 41526, "38a2d0f438117cdd0c40257f45e2d9e1c198242081affaf7685617f12ea7e519", 6, "INVALIDATED_FAILED_PROOF", true, false, false, false, false], `${config.id}.invalidated attempt`, failures);
  for (const [path, digest, label] of [[config.oldRecordPath, config.oldRecordSha, "old record"], [config.oldActivationPath, config.oldActivationSha, "old activation"]]) {
    const target = resolve(root, path); if (!existsSync(target) || sha(readFileSync(target)) !== digest) failures.push(`${config.id}: immutable ${label} drift`);
  }
  const goal = record.attemptProtocol.goalStateRoot;
  for (const [path, digest, bytes, rows] of [[record.invalidatedAttemptBinding.failedProofPath, record.invalidatedAttemptBinding.failedProofSha256, 41526, null], [record.invalidatedAttemptBinding.failedRegistryPath, record.invalidatedAttemptBinding.failedRegistrySha256, null, 6]]) {
    const target = resolve(goal, path); if (!existsSync(target) || sha(readFileSync(target)) !== digest) failures.push(`${config.id}: immutable failed evidence drift ${path}`);
    else { if (bytes !== null && statSync(target).size !== bytes) failures.push(`${config.id}: failed proof size drift`); if (rows !== null && readFileSync(target, "utf8").trimEnd().split("\n").length !== rows) failures.push(`${config.id}: failed registry row drift`); }
  }
  exact([record.attemptProtocol.registryPath, record.attemptProtocol.appendOnlyHashChain, record.attemptProtocol.oldRegistryImmutable, record.attemptProtocol.priorAttemptRewriteOrTruncateAllowed, record.attemptProtocol.freshAttemptRequiredAfterReproducibleFinding, record.attemptProtocol.maxAttemptsPerLane, record.attemptProtocol.directoryMode, record.attemptProtocol.fileMode], ["proof/phase1-superseding-correction-proof-registry.jsonl", true, true, false, true, 4, "0700", "0600"], `${config.id}.attempt protocol`, failures);
  validateCommit(root, record, config, failures);
  const reference = registry?.authorizations?.find((row) => row.id === config.id);
  exact(reference, { id: config.id, recordKind: "owner-solo-superseding-correction-reference-v1", path: config.recordPath, algorithm: "sha256", digest: config.recordSha }, `${config.id}.registry reference`, failures);
  return record;
}
function validateActivation(root, lane, record, failures) {
  const config = CONFIG[lane]; const path = ACTIVATION_PATHS[lane]; const receipt = readJson(resolve(root, path), `${config.id}.activation`, failures); if (!receipt) return null;
  exact([receipt.schemaVersion, receipt.receiptId, receipt.receiptKind, receipt.status, receipt.authorizationId, receipt.authorizationHash, receipt.ticketId, receipt.laneId, receipt.predecessorCommit, receipt.predecessorTree, receipt.acceptedCorrectionCommit, receipt.acceptedCorrectionTree, receipt.pairedAuthorizationId], [1, `OBX-P180-${lane}-AUDIT-CORRECTION-SUPERSESSION-ACTIVATION-002`, "owner-solo-superseding-correction-activation-v1", "ACTIVE", config.id, config.hash, `OBX-P180-${lane}`, lane, CONFIG.T04.commit, CONFIG.T04.tree, config.commit, config.tree, CONFIG[lane === "T03" ? "T04" : "T03"].id], `${config.id}.activation identity`, failures);
  validateSelfHash(receipt, "selfHash", receipt.selfHash?.digest, `${config.id}.activation`, failures);
  if (receipt.expiresAt !== record.expiresAt || Date.parse(receipt.observedAt) < Date.parse(record.notBefore) || Date.parse(receipt.observedAt) >= Date.parse(record.expiresAt)) failures.push(`${config.id}.activation time drift`);
  return receipt;
}
function validateProofFile(proofRoot, receipt, lane, attemptNumber, commandIndex, failures) {
  const label = `superseding proof ${lane} attempt ${attemptNumber} command ${commandIndex + 1}`;
  const commandId = REQUIRED_COMMAND_IDS[commandIndex];
  const expectedCommandId = commandIndex === 0 ? `${lane.toLowerCase()}-correction-focused` : commandId;
  exact(receipt?.commandId, expectedCommandId, `${label}.commandId`, failures);
  if (typeof receipt?.commandSpec !== "string" || receipt.commandSpec.length === 0 || receipt.commandSpecSha256 !== sha(receipt.commandSpec)) failures.push(`${label}: command spec digest drift`);
  if (receipt?.exitCode !== 0) failures.push(`${label}: exit code drift`);
  const expectedOutputPath = `proof/phase1-supersession-${lane.toLowerCase()}-attempt-${String(attemptNumber).padStart(3, "0")}-${String(commandIndex + 1).padStart(2, "0")}-${expectedCommandId}.log`;
  exact(receipt?.outputPath, expectedOutputPath, `${label}.outputPath`, failures);
  if (typeof receipt?.outputPath !== "string" || isAbsolute(receipt.outputPath) || !receipt.outputPath.startsWith("proof/")) {
    failures.push(`${label}: output path escapes proof root`);
    return;
  }
  const output = resolve(proofRoot, receipt.outputPath.slice("proof/".length));
  const relativeOutput = relative(proofRoot, output);
  if (relativeOutput === "" || relativeOutput.startsWith("..") || isAbsolute(relativeOutput)) {
    failures.push(`${label}: output path escapes proof root`);
    return;
  }
  if (!existsSync(output)) {
    failures.push(`${label}: output missing`);
    return;
  }
  const outputState = lstatSync(output);
  if (outputState.isSymbolicLink()) failures.push(`${label}: output must not be a symlink`);
  else if (!outputState.isFile()) failures.push(`${label}: output must be a regular file`);
  if (typeof process.getuid === "function" && outputState.uid !== process.getuid()) failures.push(`${label}: output owner drift`);
  if ((outputState.mode & 0o777) !== 0o600) failures.push(`${label}: output mode drift`);
  if (!outputState.isSymbolicLink() && outputState.isFile() && sha(readFileSync(output)) !== receipt.outputSha256) failures.push(`${label}: output digest drift`);
}
function validateNewProofRegistry(repoRoot, proofRoot, failures) {
  if (!existsSync(proofRoot)) { failures.push("superseding proof root: missing"); return; }
  const rootState = lstatSync(proofRoot);
  if (rootState.isSymbolicLink() || !rootState.isDirectory()) { failures.push("superseding proof root must be a real directory"); return; }
  if (typeof process.getuid === "function" && rootState.uid !== process.getuid()) failures.push("superseding proof root owner drift");
  if ((rootState.mode & 0o777) !== 0o700) failures.push("superseding proof root mode drift");
  const proofRegistry = resolve(proofRoot, NEW_PROOF_REGISTRY_NAME);
  if (!existsSync(proofRegistry)) { failures.push("superseding proof registry: missing"); return; }
  const registryState = lstatSync(proofRegistry);
  if (registryState.isSymbolicLink() || !registryState.isFile()) { failures.push("superseding proof registry must be a real file"); return; }
  if (typeof process.getuid === "function" && registryState.uid !== process.getuid()) failures.push("superseding proof registry owner drift");
  if ((registryState.mode & 0o777) !== 0o600) failures.push("superseding proof registry mode drift");
  const registryText = readFileSync(proofRegistry, "utf8");
  if (registryText.length === 0 || registryText.trim().length === 0) { failures.push("superseding proof registry: empty"); return; }
  const rows = registryText.trimEnd().split("\n").filter(Boolean).map((row, index) => { try { return JSON.parse(row); } catch { failures.push(`superseding proof registry row ${index + 1}: invalid JSON`); return null; } }).filter(Boolean);
  let previous = null; const attempts = new Map();
  rows.forEach((row, index) => {
    const config = CONFIG[row.laneId];
    if (row.sequence !== index + 1 || row.previousEnvelopeHash !== previous || !config || row.authorizationId !== config.id) failures.push(`superseding proof registry row ${index + 1}: chain or lane identity drift`);
    const copy = structuredClone(row); const digest = copy.envelopeHash; delete copy.envelopeHash;
    if (digest !== sha(canonical(copy))) failures.push(`superseding proof registry row ${index + 1}: envelope hash drift`);
    const key = `${row.authorizationId}:${row.attemptId}`; if (attempts.has(key)) failures.push(`superseding proof registry row ${index + 1}: attempt reuse`); attempts.set(key, true);
    if (config) {
      const laneRowsBefore = rows.slice(0, index + 1).filter((candidate) => candidate.laneId === row.laneId).length;
      exact([row.schemaVersion, row.authorizationHash, row.implementationCommit, row.implementationTree, row.orderedFileListSha256, row.attemptId, row.status], [1, config.hash, config.commit, config.tree, config.orderedFileListSha256, `${row.laneId}-ATTEMPT-${String(laneRowsBefore).padStart(3, "0")}`, "PASS"], `superseding proof registry row ${index + 1} binding`, failures);
      const executionTree = /^[0-9a-f]{40}$/.test(row.executionCommit ?? "") ? git(repoRoot, ["rev-parse", `${row.executionCommit}^{tree}`], `superseding proof registry row ${index + 1} execution commit`, failures) : null;
      if (!/^[0-9a-f]{40}$/.test(row.executionCommit ?? "") || executionTree !== row.executionTree) failures.push(`superseding proof registry row ${index + 1}: execution binding drift`);
      const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", config.commit, row.executionCommit], { cwd: repoRoot, encoding: "utf8" });
      if (ancestry.status !== 0) failures.push(`superseding proof registry row ${index + 1}: implementation ancestry drift`);
      if (!Array.isArray(row.commandReceipts) || row.commandReceipts.length !== REQUIRED_COMMAND_IDS.length) failures.push(`superseding proof registry row ${index + 1}: command receipt count drift`);
      else row.commandReceipts.forEach((receipt, commandIndex) => validateProofFile(proofRoot, receipt, row.laneId, laneRowsBefore, commandIndex, failures));
    }
    previous = digest;
  });
  for (const id of [T03_SUPERSESSION_AUTHORIZATION_ID, T04_SUPERSESSION_AUTHORIZATION_ID]) {
    const count = rows.filter((row) => row.authorizationId === id).length;
    if (count === 0) failures.push(`${id}: proof rows missing`);
    if (count > 4) failures.push(`${id}: attempt limit exceeded`);
  }
}
export function historicalVerificationCommitForSupersessionState(result) {
  return result?.failures?.length === 0 && ["PRE_ACTIVATION", "ACTIVE", "CONSUMED"].includes(result.state) ? SUPERSESSION_HISTORICAL_VERIFICATION_COMMIT : null;
}
export function verifyPhase1SupersedingCorrectionAuthorizations({ repoRoot = ROOT, registry, mode = "lifecycle", evaluationTime = Date.now(), verifyRepositoryState = true, verifySecurity = true, proofRoot = DEFAULT_PROOF_ROOT } = {}) {
  repoRoot = realpathSync(repoRoot); const failures = [];
  if (!["record", "activation", "lifecycle", "completion"].includes(mode)) failures.push(`unsupported superseding correction verification mode ${mode}`);
  const source = registry ?? readJson(resolve(repoRoot, REGISTRY_PATH), "scoped registry", failures);
  const records = { T03: validateRecord(repoRoot, source, "T03", failures), T04: validateRecord(repoRoot, source, "T04", failures) };
  if (records.T03 && records.T04) {
    if (records.T03.allowedCorrectionPaths.some((path) => records.T04.allowedCorrectionPaths.includes(path))) failures.push("superseding correction paths overlap");
    exact(records.T03.governanceWriteScope, records.T04.governanceWriteScope, "superseding shared governance scope", failures);
  }
  if (verifySecurity) {
    const receipt = readJson(resolve(repoRoot, SECURITY_PATH), "superseding security review", failures);
    if (receipt && (receipt.status !== "PASS" || receipt.authorizationBindings?.map((row) => row.authorizationId).join(",") !== `${T03_SUPERSESSION_AUTHORIZATION_ID},${T04_SUPERSESSION_AUTHORIZATION_ID}` || receipt.deniedAuthority?.includes("T05-before-T03-T04-completed-verified") !== true || receipt.deniedAuthority?.includes("T06+") !== true)) failures.push("superseding security review drift");
    if (receipt) validateSelfHash(receipt, "selfHash", receipt.selfHash?.digest, "superseding security review", failures);
  }
  if (verifyRepositoryState) {
    exact(git(repoRoot, ["symbolic-ref", "--short", "HEAD"], "superseding branch", failures), "feat/obx-p180-t03-t05-offline-wave-recovery", "superseding branch binding", failures);
    const protectedPath = resolve(repoRoot, ".claude/handoffs/one-box-operating-environment-next-phase.md");
    if (!existsSync(protectedPath) || !lstatSync(protectedPath).isFile() || sha(readFileSync(protectedPath)) !== "cbbc878aa0691f333b128a71aee43adde89a9691a9ed65880f1f2b41a20643a6") failures.push("protected handoff integrity drift");
  }
  validateNewProofRegistry(repoRoot, proofRoot, failures);
  const activationPresence = Object.values(ACTIVATION_PATHS).map((path) => existsSync(resolve(repoRoot, path)));
  const completionPresence = Object.values(COMPLETION_PATHS).map((path) => existsSync(resolve(repoRoot, path)));
  if (activationPresence.some(Boolean) && !activationPresence.every(Boolean)) failures.push("superseding activation pair incomplete");
  if (completionPresence.some(Boolean) && !completionPresence.every(Boolean)) failures.push("superseding completion pair incomplete");
  if (completionPresence.some(Boolean) && !activationPresence.every(Boolean)) failures.push("superseding completion requires activation pair");
  if (mode === "record" && (activationPresence.some(Boolean) || completionPresence.some(Boolean))) failures.push("record verification requires superseding lifecycle receipts absent");
  if (!activationPresence.every(Boolean)) {
    if (mode === "activation" || mode === "completion") failures.push("superseding activation receipts missing");
    if (evaluationTime >= Date.parse("2026-09-15T12:30:00.000Z")) failures.push("superseding authorization expired");
    return { failures, state: failures.length ? "INVALID" : "PRE_ACTIVATION", authorizationHashes: Object.values(CONFIG).map((row) => row.hash) };
  }
  const activations = { T03: validateActivation(repoRoot, "T03", records.T03, failures), T04: validateActivation(repoRoot, "T04", records.T04, failures) };
  if (activations.T03 && activations.T04) exact([activations.T03.governanceCommit, activations.T03.governanceTree, activations.T03.observedAt], [activations.T04.governanceCommit, activations.T04.governanceTree, activations.T04.observedAt], "superseding paired activation", failures);
  if (!completionPresence.every(Boolean)) {
    if (mode === "completion") failures.push("superseding completion receipts missing");
    return { failures, state: failures.length ? "INVALID" : "ACTIVE", authorizationHashes: Object.values(CONFIG).map((row) => row.hash) };
  }
  for (const lane of ["T03", "T04"]) {
    const receipt = readJson(resolve(repoRoot, COMPLETION_PATHS[lane]), `${CONFIG[lane].id}.completion`, failures);
    if (!receipt) continue;
    exact([receipt.schemaVersion, receipt.receiptId, receipt.receiptKind, receipt.status, receipt.authorizationId, receipt.authorizationHash, receipt.ticketId, receipt.laneId, receipt.acceptedCorrectionBinding?.commit, receipt.acceptedCorrectionBinding?.tree], [1, `OBX-P180-${lane}-AUDIT-CORRECTION-SUPERSESSION-COMPLETION-002`, "owner-solo-superseding-correction-completion-v1", "COMPLETED_VERIFIED", CONFIG[lane].id, CONFIG[lane].hash, `OBX-P180-${lane}`, lane, CONFIG[lane].commit, CONFIG[lane].tree], `${CONFIG[lane].id}.completion identity`, failures);
    validateSelfHash(receipt, "selfHash", receipt.selfHash?.digest, `${CONFIG[lane].id}.completion`, failures);
  }
  return { failures, state: failures.length ? "INVALID" : "CONSUMED", authorizationHashes: Object.values(CONFIG).map((row) => row.hash) };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv.includes("--record-only") ? "record" : process.argv.includes("--activation-only") ? "activation" : process.argv.includes("--completion-only") ? "completion" : "lifecycle";
  const result = verifyPhase1SupersedingCorrectionAuthorizations({ mode, verifyRepositoryState: mode !== "record" });
  if (result.failures.length) { result.failures.forEach((failure) => console.error(`FAIL ${failure}`)); process.exitCode = 1; }
  else { console.log(`PASS Phase1 superseding correction state: ${result.state}`); console.log(`PASS authorization hashes: ${result.authorizationHashes.join(",")}`); }
}
