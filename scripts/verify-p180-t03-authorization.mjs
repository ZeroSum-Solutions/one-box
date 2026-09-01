import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  T02_COMPLETION_CHECKPOINT_PATH,
  T02_COMPLETION_CHECKPOINT_HASH,
  T02_OWNER_COMPLETION_RECEIPT_PATH,
  T02_OWNER_COMPLETION_RECEIPT_HASH,
  SOURCE_ADOPTION_REPIN_PATH,
  verifyP180T02Completion,
} from "./verify-p180-t02-authorization.mjs";

export const T03_AUTHORIZATION_ID = "OBX-AUTH-P180-T03-SOLO-001";
export const T04_AUTHORIZATION_ID = "OBX-AUTH-P180-T04-SOLO-001";

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const REGISTRY_PATH = "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json";
const AUTHORITY_MANIFEST_PATH = "docs/plans/one-box-master/00-authority/authority-manifest.json";
const ACTIVATION_PATHS = [
  "docs/audits/evidence/goal/2026-08-31-obx-p180-t03-activation-receipt.json",
  "docs/audits/evidence/goal/2026-08-31-obx-p180-t04-activation-receipt.json",
];
const COMPLETION_PATHS = [
  "docs/audits/evidence/goal/2026-08-31-obx-p180-t03-completion-receipt.json",
  "docs/audits/evidence/goal/2026-08-31-obx-p180-t04-completion-receipt.json",
];
export const PHASE0A_SECURITY_TARGET_PATHS = [
  "docs/audits/evidence/goal/2026-08-31-obx-p180-t02-completion-checkpoint.json",
  "docs/audits/evidence/goal/2026-08-31-obx-p180-t02-owner-completion-receipt.json",
  SOURCE_ADOPTION_REPIN_PATH,
  "docs/plans/2026-08-31-obx-p180-t03-solo-authorization-design.md",
  "docs/plans/2026-08-31-obx-p180-t04-solo-authorization-design.md",
  "docs/governance/risk-exceptions/2026-08-31-obx-p180-t03-solo.json",
  "docs/governance/risk-exceptions/2026-08-31-obx-p180-t04-solo.json",
  "scripts/verify-p180-t03-authorization.mjs",
  "scripts/verify-p180-t04-authorization.mjs",
  "scripts/verify-p180-t02-authorization.mjs",
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
  REGISTRY_PATH,
  "docs/plans/one-box-master/00-authority/authority-manifest.json",
  "docs/plans/one-box-master/00-authority/plan-register.md",
  "docs/plans/one-box-master/04-operating-environment/ai-teammate-operating-model.md",
];
const COMMON = {
  branch: "feat/obx-p180-t03-t05-offline-wave",
  baseCommit: "62b7b749f37ad9a1b8d9cc2a9a45f6062f59bbf1",
  baseTree: "6c79e9c0eb6b42fd5f4835362a7d31821d91654b",
  controllerActorId: "agent:codex-gpt-5.6-sol-ultra:obx-p180-controller",
  goalRunId: "obx-p180-t03-t05-offline-wave",
  notBefore: "2026-09-01T02:05:00.000Z",
  expiresAt: "2026-09-15T02:05:00.000Z",
  duration: 1_209_600_000,
};
const CONFIGS = {
  T03: {
    id: T03_AUTHORIZATION_ID, ticketId: "OBX-P180-T03", laneId: "T03",
    claimant: "agent:codex-gpt-5.6-sol-ultra:obx-p180-t03-implementer",
    hash: "9600f44942637d0f71be82f697b352620fcc5de8aac0151259ff55e0692d058e",
    amendmentPath: "docs/governance/risk-exceptions/2026-08-31-obx-p180-t03-solo.json",
    amendmentId: "OBX-P180-T03-SOLO-AMENDMENT-001",
    amendmentDigest: "3e497bb4ccb6fee8ca674f279122d1a24356b9b976b995c47312f24d06057919",
    amendmentSelfHash: "0fb00997d1a725ed65065ea4119385f6091462824999275fd51e5c030dbacbc2",
    securityPath: "docs/audits/evidence/security/2026-08-31-obx-p180-t03-solo-authorization-security-review.json",
    securityId: "OBX-P180-T03-PHASE0A-SECURITY-001",
    securityKind: "solo-t03-phase0a-security-review-v1",
    activationPath: ACTIVATION_PATHS[0], siblingActivationPath: ACTIVATION_PATHS[1],
    completionPath: COMPLETION_PATHS[0], siblingCompletionPath: COMPLETION_PATHS[1],
    effect: "add-provider-offline-skill-context-interrupt-receipt-reducers",
    roles: ["implementation-lead", "model-skill-security-owner", "job-sandbox-owner", "data-protection-owner"],
    forbidden: [
      "product-runtime-import-or-effect", "provider-or-model-call", "network",
      "credential-or-environment-access", "filesystem-or-shell-io", "persistence-or-durable-state",
      "queue-or-background-worker", "browser", "ui", "collaboration",
      "canvas-or-page-ir-read-write-or-mutation", "deployment", "release",
      "dependency-or-lockfile-change", "mutable-global-state", "implicit-clock-or-randomness",
      "authority-outside-exact-solo-record", "t04-through-t08", "product-inference-or-data-transfer",
      "independent-human-review-claim", "production-readiness-claim",
    ],
    paths: [
      "src/lib/operatingEnvironment/skills.ts", "src/lib/operatingEnvironment/skills.test.ts",
      "src/lib/operatingEnvironment/context.ts", "src/lib/operatingEnvironment/context.test.ts",
      "src/lib/operatingEnvironment/interrupts.ts", "src/lib/operatingEnvironment/interrupts.test.ts",
      "src/lib/operatingEnvironment/receipts.ts", "src/lib/operatingEnvironment/receipts.test.ts",
      "src/lib/operatingEnvironment/fixtures/security-v1.json",
    ],
  },
  T04: {
    id: T04_AUTHORIZATION_ID, ticketId: "OBX-P180-T04", laneId: "T04",
    claimant: "agent:codex-gpt-5.6-sol-ultra:obx-p180-t04-implementer",
    hash: "4c3a89055f239905e0939bcb5be3f60fce971bf19c477075f31cbc5fc75a3557",
    amendmentPath: "docs/governance/risk-exceptions/2026-08-31-obx-p180-t04-solo.json",
    amendmentId: "OBX-P180-T04-SOLO-AMENDMENT-001",
    amendmentDigest: "9361c32941d787f38c46ac56cda21c333d283aaf3ab82d644046bea597184846",
    amendmentSelfHash: "87f160bcc7fb06cabf12116acf36c3bdd258f5063b69fd8a5c61d5b543fc5675",
    securityPath: "docs/audits/evidence/security/2026-08-31-obx-p180-t04-solo-authorization-security-review.json",
    securityId: "OBX-P180-T04-PHASE0A-SECURITY-001",
    securityKind: "solo-t04-phase0a-security-review-v1",
    activationPath: ACTIVATION_PATHS[1], siblingActivationPath: ACTIVATION_PATHS[0],
    completionPath: COMPLETION_PATHS[1], siblingCompletionPath: COMPLETION_PATHS[0],
    effect: "add-provider-offline-in-memory-budget-capacity-compare-reducers",
    roles: ["implementation-lead", "budget-operations-owner", "job-sandbox-owner", "evaluation-owner"],
    forbidden: [
      "product-runtime-import-or-effect", "provider-or-model-call", "network", "spend-or-provider-usage-trust",
      "credential-or-environment-access", "filesystem-or-shell-io", "persistence-or-durable-state",
      "queue-or-background-worker", "browser", "ui", "collaboration",
      "canvas-or-page-ir-read-write-or-mutation", "deployment", "release",
      "dependency-or-lockfile-change", "mutable-global-state", "implicit-clock-or-randomness",
      "automatic-winner-default-or-apply", "authority-outside-exact-solo-record",
      "t03-or-t05-through-t08", "product-inference-or-data-transfer",
      "independent-human-review-claim", "production-readiness-claim",
    ],
    paths: [
      "src/lib/operatingEnvironment/budget.ts", "src/lib/operatingEnvironment/budget.test.ts",
      "src/lib/operatingEnvironment/capacity.ts", "src/lib/operatingEnvironment/capacity.test.ts",
      "src/lib/operatingEnvironment/compare.ts", "src/lib/operatingEnvironment/compare.test.ts",
      "src/lib/operatingEnvironment/fixtures/budget-capacity-v1.json",
    ],
  },
};
const RECORD_KEYS = [
  "id", "recordKind", "status", "implementationAuthorized", "activationRequired", "projectId",
  "branch", "baseCommit", "baseTree", "parentTicketId", "parentTicketStatus", "childTicketIds",
  "authorizationProposalId", "ownerActorId", "riskOwnerActorId", "controllerActorId", "goalRunId",
  "laneId", "reservation", "roleAvailability", "implementationAuthorizationSeparation",
  "independentHumanReview", "acceptedRisk", "requirementExceptions", "traceabilityRefs",
  "allowedPaths", "allowedEffects", "forbiddenEffects", "predecessorBinding", "planBindings",
  "dependencyBindings", "sourceAdoptionBindings", "amendmentBinding", "siblingConcurrency",
  "activationProtocol", "proofProtocol", "completionEvidence", "reviewProtocol",
  "requiredEvidencePaths", "invalidators", "recordedAt", "notBefore", "expiresAt",
  "exactDurationMilliseconds", "renewable", "authorizationHash",
];

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function exact(actual, expected, label, failures) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${label}: exact value drift`);
}
function safeFile(repoRoot, path, label, failures, required = true) {
  if (typeof path !== "string" || path.startsWith("/") || normalize(path).startsWith("..")) {
    failures.push(`${label}: invalid repository-relative path`); return null;
  }
  const absolute = resolve(repoRoot, path);
  if (!existsSync(absolute)) { if (required) failures.push(`${label}: missing ${path}`); return null; }
  try {
    if (!lstatSync(absolute).isFile() || lstatSync(absolute).isSymbolicLink()) throw new Error("not a nonsymlinked regular file");
    const real = realpathSync(absolute);
    if (relative(repoRoot, real).startsWith("..")) throw new Error("escapes repository");
    return real;
  } catch (error) { failures.push(`${label}: unsafe ${path} (${error.message})`); return null; }
}
function readJson(repoRoot, path, label, failures, required = true) {
  const absolute = safeFile(repoRoot, path, label, failures, required);
  if (!absolute) return null;
  try { const value = JSON.parse(readFileSync(absolute, "utf8")); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("top level must be object"); return value; }
  catch (error) { failures.push(`${label}: invalid JSON (${error.message})`); return null; }
}
function sha256File(repoRoot, path, label, failures) {
  const absolute = safeFile(repoRoot, path, label, failures);
  return absolute ? createHash("sha256").update(readFileSync(absolute)).digest("hex") : null;
}
function checkKeys(value, expected, label, failures) {
  if (!value || typeof value !== "object" || Array.isArray(value)) { failures.push(`${label}: object required`); return; }
  exact(Object.keys(value).sort(), [...expected].sort(), `${label}.keys`, failures);
}
function validateSelfHash(value, field, expected, label, failures) {
  if (!value?.[field] || typeof value[field] !== "object" || Array.isArray(value[field])) {
    failures.push(`${label}: ${field} object required`); return;
  }
  exact(value[field], {
    algorithm: "sha256", canonicalization: "canonical-json-v1",
    excludedJsonPointers: [`/${field}/digest`], digest: expected,
  }, `${label}.${field}`, failures);
  const unhashed = structuredClone(value); delete unhashed[field].digest;
  const actual = createHash("sha256").update(canonicalJson(unhashed)).digest("hex");
  if (value[field]?.digest !== expected || actual !== expected) failures.push(`${label}: self-hash mismatch`);
}
function validateLiveBindings(repoRoot, bindings, label, failures) {
  if (!Array.isArray(bindings) || bindings.length === 0) { failures.push(`${label}: non-empty bindings required`); return; }
  for (const [index, row] of bindings.entries()) {
    checkKeys(row, ["path", "algorithm", "digest"], `${label}[${index}]`, failures);
    if (row.algorithm !== "sha256" || sha256File(repoRoot, row.path, `${label}[${index}]`, failures) !== row.digest) failures.push(`${label}[${index}]: current hash drift ${row.path}`);
  }
}
function validateAmendment(repoRoot, config, record, failures) {
  const amendment = readJson(repoRoot, config.amendmentPath, `${config.id}.amendment`, failures);
  if (sha256File(repoRoot, config.amendmentPath, `${config.id}.amendment`, failures) !== config.amendmentDigest) failures.push(`${config.id}.amendment: file hash drift`);
  if (!amendment) return;
  exact([amendment.amendmentId, amendment.authorizationId, amendment.branch, amendment.baseCommit, amendment.baseTree],
    [config.amendmentId, config.id, COMMON.branch, COMMON.baseCommit, COMMON.baseTree], `${config.id}.amendment.identity`, failures);
  exact(amendment.scope?.allowedPaths, config.paths, `${config.id}.amendment.allowedPaths`, failures);
  exact(amendment.scope?.allowedEffects, [config.effect], `${config.id}.amendment.allowedEffects`, failures);
  const controls = [...config.roles, "implementation-actor-authorizer-separation", "independent-human-security-review"]
    .map((controlId) => ({
      controlId, assignmentStatus: "NOT_AVAILABLE", assignmentRecordPresent: false,
      humanActorId: null, separationSatisfied: false,
    }));
  exact(amendment.unavailableControls, controls, `${config.id}.amendment.unavailableControls`, failures);
  validateSelfHash(amendment, "selfHash", config.amendmentSelfHash, `${config.id}.amendment`, failures);
  exact(record.amendmentBinding, { path: config.amendmentPath, amendmentId: config.amendmentId, algorithm: "sha256", digest: config.amendmentDigest, selfHash: config.amendmentSelfHash }, `${config.id}.amendmentBinding`, failures);
}
function validateDerivedRepin(repoRoot, failures) {
  const label = "Phase0A source-adoption derived re-pin";
  const repin = readJson(repoRoot, SOURCE_ADOPTION_REPIN_PATH, label, failures);
  const manifest = readJson(repoRoot, AUTHORITY_MANIFEST_PATH, `${label}.authorityManifest`, failures);
  if (!repin || !manifest) return;
  checkKeys(repin, [
    "schemaVersion", "reviewId", "reviewedAt", "namedOwner", "scope", "derivedWriteAuthorization",
    "priorAuthorityManifest", "currentAuthorityManifest", "refreshedT02SecurityReceipt",
    "manifestChangedFields", "reReviewMethod", "reEndorsement", "invariants", "verdict", "findingCount",
  ], label, failures);
  exact([repin.schemaVersion, repin.reviewId, repin.reviewedAt, repin.namedOwner, repin.scope,
    repin.verdict, repin.findingCount], ["obx-p180-authority-repin-review-v1",
    "obx-p180-source-adoption-authority-repin-2026-08-31", "2026-09-01T02:48:12.000Z",
    "Devin Wiggins", "Phase 0A derived integrity re-pin for the verifier-derived authority-manifest /packetDigest only",
    "PASS", 0], `${label}.identity`, failures);
  exact(repin.derivedWriteAuthorization, {
    path: T02_OWNER_COMPLETION_RECEIPT_PATH,
    receiptId: "OBX-P180-T02-OWNER-COMPLETION-001",
    algorithm: "sha256-canonical-self-hash", digest: T02_OWNER_COMPLETION_RECEIPT_HASH,
    authorizationKind: "DERIVED_INTEGRITY_REPIN_ONLY",
    writePaths: [AUTHORITY_MANIFEST_PATH, SOURCE_ADOPTION_REPIN_PATH],
    allowedManifestJsonPointers: ["/packetDigest"],
  }, `${label}.derivedWriteAuthorization`, failures);
  exact(repin.priorAuthorityManifest, {
    packetDigest: "a09ed88d14c6070213e1c52164a2e606bd8c29e7fbe0ff833e546743907b3a38",
    sha256: "7a09999ccb21d81cd2dc5d9b98c5a055d8e52ec4073f70e45c1ae0f3f4aee5af",
  }, `${label}.priorAuthorityManifest`, failures);
  exact(repin.currentAuthorityManifest, {
    path: AUTHORITY_MANIFEST_PATH, packetDigest: manifest.packetDigest,
    sha256: sha256File(repoRoot, AUTHORITY_MANIFEST_PATH, `${label}.authorityManifest`, failures),
  }, `${label}.currentAuthorityManifest`, failures);
  exact(repin.refreshedT02SecurityReceipt, {
    path: "docs/audits/evidence/security/2026-08-31-obx-p180-t02-solo-authorization-security-review.json",
    sha256: "f2c0dfffe5dbe6ae65a111a59c9ec444da6165902351322c41b44141c10e3c83",
  }, `${label}.historicalT02SecurityReceipt`, failures);
  exact(repin.manifestChangedFields, ["packetDigest"], `${label}.manifestChangedFields`, failures);
  exact(repin.invariants, {
    implementationAuthorized: false, authorityExpansion: false, runtimeOrDependencyChange: false,
    providerBackedProductRoute: false, persistenceBrowserCollaborationDeploymentRelease: false,
    pageIrMutation: false,
  }, `${label}.invariants`, failures);
  exact(repin.reReviewMethod, [
    "structural comparison against the pre-Phase0A authority-manifest JSON",
    "current T02 owner-completion receipt self-hash and exact derived-write clause validation",
    "confirmation that only authority-manifest /packetDigest and this exact re-pin receipt were derived writes",
    "npm run verify:plans", "npm run test:plans",
    "source-adoption verifier and provider-offline fixture lane",
  ], `${label}.reReviewMethod`, failures);
  exact(repin.reEndorsement, "This receipt re-pins the source-adoption gate to the verifier-derived Phase 0A packet digest. The historical T02 security receipt remains unchanged; this does not re-approve, broaden, or add implementation, runtime, provider, dependency, activation, completion, or source-adoption-artifact authority.", `${label}.reEndorsement`, failures);
}
function validateSecurityReceipt(repoRoot, config, record, failures) {
  const receipt = readJson(repoRoot, config.securityPath, `${config.id}.securityReceipt`, failures);
  if (!receipt) return;
  checkKeys(receipt, ["schemaVersion", "reviewId", "receiptKind", "phase", "authorizationId", "authorizationHash", "amendmentId", "amendmentHash", "amendmentSelfHash", "baseCommit", "baseTree", "targetPaths", "targetHashes", "coverage", "findings", "exports", "secretsScan", "activationState", "verdict", "capturedAt", "selfHash"], `${config.id}.securityReceipt`, failures);
  exact([receipt.schemaVersion, receipt.reviewId, receipt.receiptKind, receipt.phase,
    receipt.authorizationId, receipt.authorizationHash, receipt.amendmentId, receipt.amendmentHash,
    receipt.amendmentSelfHash, receipt.baseCommit, receipt.baseTree, receipt.activationState, receipt.verdict],
  [1, config.securityId, config.securityKind, "PHASE0A_PRE_ACTIVATION", config.id, config.hash,
    config.amendmentId, config.amendmentDigest, config.amendmentSelfHash, COMMON.baseCommit,
    COMMON.baseTree, "NOT_ACTIVE", "PASS-WITH-ACCEPTED-RISK"], `${config.id}.securityReceipt.identity`, failures);
  exact(receipt.targetPaths, PHASE0A_SECURITY_TARGET_PATHS, `${config.id}.securityReceipt.targetPaths`, failures);
  validateLiveBindings(repoRoot, receipt.targetHashes, `${config.id}.securityReceipt.targetHashes`, failures);
  exact(receipt.targetHashes?.map((row) => row.path), PHASE0A_SECURITY_TARGET_PATHS, `${config.id}.securityReceipt.targetHash order`, failures);
  exact(receipt.coverage?.map((row) => row.surface), ["prompt-injection", "secrets", "authentication", "authorization", "untrusted-input", "export"], `${config.id}.securityReceipt.coverage`, failures);
  if (receipt.findings?.length !== 1 || receipt.findings[0]?.findingId !== record.acceptedRisk?.findingId || receipt.findings[0]?.status !== "ACCEPTED") failures.push(`${config.id}.securityReceipt: exact accepted solo finding required`);
  exact(receipt.exports, { status: "NONE", paths: [] }, `${config.id}.securityReceipt.exports`, failures);
  if (receipt.secretsScan?.status !== "PASS" || receipt.secretsScan?.exitCode !== 0) failures.push(`${config.id}.securityReceipt.secretsScan: exact PASS required`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.capturedAt ?? "")) failures.push(`${config.id}.securityReceipt: canonical capturedAt required`);
  validateSelfHash(receipt, "selfHash", receipt.selfHash?.digest, `${config.id}.securityReceipt`, failures);
}
function validateOutputTuple(config, sibling, record, failures) {
  const implementation = [...config.paths, ...sibling.paths];
  const outputs = [...ACTIVATION_PATHS, ...COMPLETION_PATHS];
  if (new Set(implementation).size !== implementation.length) failures.push("T03/T04 sibling implementation paths overlap");
  if (new Set(outputs).size !== outputs.length || outputs.some((path) => implementation.includes(path))) failures.push("T03/T04 controller output paths overlap or enter implementation scope");
  exact(record.siblingConcurrency?.siblingAllowedPaths, sibling.paths, `${config.id}.siblingAllowedPaths`, failures);
  exact(record.activationProtocol?.phase0BWriteSet, ACTIVATION_PATHS, `${config.id}.phase0BWriteSet`, failures);
}
function expectedPredecessor() {
  return {
    ticketId: "OBX-P180-T02",
    implementationCommit: "514d10d1b61e3332acb27e302adc20f353b64315",
    checkpointPath: T02_COMPLETION_CHECKPOINT_PATH,
    checkpointId: "OBX-P180-T02-COMPLETION-001",
    checkpointHash: T02_COMPLETION_CHECKPOINT_HASH,
    ownerReceiptPath: T02_OWNER_COMPLETION_RECEIPT_PATH,
    ownerReceiptId: "OBX-P180-T02-OWNER-COMPLETION-001",
    ownerReceiptHash: T02_OWNER_COMPLETION_RECEIPT_HASH,
    status: "COMPLETED_VERIFIED",
    grantsInheritedAuthority: false,
  };
}
function expectedRoles(config) {
  return config.roles.map((roleId) => ({
    roleId, assignmentStatus: "NOT_AVAILABLE", assignmentRecordPresent: false,
    humanActorId: null, separationSatisfied: false,
  }));
}
function expectedRequirementExceptions(config) {
  return ["P180-R014", "P180-R015", "P180-R016"].map((requirementId) => ({
    requirementId,
    exceptionStatus: `EXCEPT_${config.laneId}_SOLO`,
    satisfactionStatus: "NOT_SATISFIED",
  }));
}
function expectedSiblingConcurrency(config, sibling) {
  return {
    groupId: "OBX-P180-T03-T04-DISJOINT-SIBLINGS-001",
    siblingAuthorizationId: sibling.id,
    siblingTicketId: sibling.ticketId,
    siblingAllowedPaths: sibling.paths,
    pairwiseDisjoint: true,
    sharedFrozenStartRequired: true,
    controllerStagesOnlyAfterBothLeasesReleased: true,
  };
}
function expectedActivationProtocol(config) {
  return {
    phase0AState: "PRE_ACTIVATION",
    ownReceiptPath: config.activationPath,
    siblingReceiptPath: config.siblingActivationPath,
    phase0BWriteSet: ACTIVATION_PATHS,
    receiptsMustBeAbsentInPhase0A: true,
    receiptsBindRealPhase0ACommitAndTree: true,
    sharedObservedAtRequired: true,
    observedAtClockSkewMilliseconds: 0,
    phase0BCommitDerivesFrozenWorkerStart: true,
    headOrTreeMismatchState: "ABORTED_DERIVED",
    repositoryInvalidationWriteAllowed: false,
    workerStageCommitOrHeadAdvanceAllowed: false,
  };
}
function expectedProofProtocol() {
  return {
    goalStateRoot: "/Users/zero-suminc./.claude/goal-state/obx-p180-t03-t05-offline-wave",
    proofNamespace: "proof/", diagnosticNamespace: "reports/abort/", controllerOnlyWriter: true,
    directoryMode: "0700", fileMode: "0600", realNonsymlinkedOwnerMatchedPathsRequired: true,
    registryPath: "proof/controller-proof-registry.jsonl", lockPath: "proof/controller-proof-registry.lock",
    exclusiveLock: "O_EXCL", newlineTerminatedAppendOnlyChain: true,
    genesisPreviousDigest: "0".repeat(64), fsyncEnvelopeAndRegistry: true,
    automaticRepairTruncateOrRetryAllowed: false, envelopeGrantBindingsRequired: true,
    completionBindsOrderedGrantTuplesAndRegistryHead: true, entireCommandMustFinishBeforeExpiry: true,
  };
}
function expectedCompletionEvidence(config) {
  return {
    receiptPath: config.completionPath, pathPresenceAloneChangesState: false,
    validStatus: "COMPLETED_VERIFIED", validDerivedState: "CONSUMED",
    reuseFailure: "AUTHORIZATION_ALREADY_CONSUMED", controllerOnlyAfterBothLeasesReleased: true,
    leaseReleaseRequiresTerminalReportAndCompletedTask: true, duplicateValidReleaseIdempotent: true,
    requiredCommandIds: [
      `${config.laneId.toLowerCase()}-focused`, "operating-environment", "source-adoption", "typecheck",
      "targeted-lint", "verify-plans", "test-plans", "path-census", "dependency-diff",
      "forbidden-effects", "secrets-scan",
    ],
  };
}
function expectedReviewProtocol() {
  return {
    quickAuditModel: "z-ai/glm-5.3-flash", quickAuditLane: "openrouter-z-ai-fp8-approved-route",
    finalAuditModel: "anthropic/claude-opus-5", finalAuditLane: "claude-max-oauth",
    modelAuthority: "advisory-only", testAuthority: "deterministic-provider-offline-tests",
    targetChangeInvalidatesReview: true,
  };
}
function expectedInvalidators(config) {
  return [
    "authorization-or-amendment-self-hash-mismatch", "t02-checkpoint-or-owner-receipt-mismatch",
    "owner-identity-compromise-or-supersession", "successor-pair-or-sibling-overlap",
    "base-branch-controller-run-lane-claimant-or-sequence-drift", "allowed-path-or-effect-drift",
    "role-risk-or-requirement-exception-drift", "dependency-or-source-adoption-drift",
    "timestamp-malformed-boundary-duration-expired-or-renewal", "activation-receipt-missing-malformed-or-replayed",
    "phase0a-commit-tree-or-phase0b-write-set-mismatch", "frozen-worker-head-or-tree-movement",
    "premature-lease-release-or-worker-index-mutation", "completion-receipt-malformed-unbound-or-alternate-path",
    "proof-path-mode-owner-type-symlink-containment-lock-tail-or-chain-failure",
    "unregistered-reordered-inserted-removed-or-cross-grant-envelope", "acceptance-command-crosses-expiry",
    "forbidden-effect-or-import", "gate-failure", "additional-unaccepted-finding",
    config.laneId === "T03" ? "t04-through-t08-authority-or-production-readiness-claim" : "t03-or-t05-through-t08-authority-or-production-readiness-claim",
  ];
}
function discoverGitState(repoRoot, failures) {
  const git = (...args) => { const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" }); if (result.status !== 0) { failures.push(`activation git state: ${args.join(" ")} failed`); return null; } return result.stdout.trim(); };
  const phase0BCommit = git("rev-parse", "HEAD");
  const phase0BTree = git("rev-parse", "HEAD^{tree}");
  const phase0ACommit = git("rev-parse", "HEAD^");
  const phase0ATree = phase0ACommit ? git("rev-parse", `${phase0ACommit}^{tree}`) : null;
  const changedPaths = phase0ACommit && phase0BCommit ? git("diff", "--name-only", `${phase0ACommit}..${phase0BCommit}`)?.split("\n").filter(Boolean) : [];
  return { phase0ACommit, phase0ATree, phase0BCommit, phase0BTree, currentCommit: phase0BCommit, currentTree: phase0BTree, changedPaths };
}
function validateActivationReceipt(repoRoot, config, record, failures) {
  const receipt = readJson(repoRoot, config.activationPath, `${config.id}.activationReceipt`, failures);
  if (!receipt) return null;
  checkKeys(receipt, ["schemaVersion", "receiptId", "receiptKind", "status", "authorizationId", "authorizationHash", "reservation", "phase0ACommit", "phase0ATree", "activationWriteSet", "observedAt", "selfHash"], `${config.id}.activationReceipt`, failures);
  exact([receipt.schemaVersion, receipt.receiptId, receipt.receiptKind, receipt.status,
    receipt.authorizationId, receipt.authorizationHash],
  [1, `${config.ticketId}-ACTIVATION-001`, `solo-${config.laneId.toLowerCase()}-activation-receipt-v1`,
    "ACTIVE", config.id, config.hash], `${config.id}.activationReceipt.identity`, failures);
  exact(receipt.reservation, record.reservation, `${config.id}.activationReceipt.reservation`, failures);
  exact(receipt.activationWriteSet, ACTIVATION_PATHS, `${config.id}.activationReceipt.writeSet`, failures);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.observedAt ?? "")) failures.push(`${config.id}.activationReceipt: canonical millisecond observedAt required`);
  const observed = Date.parse(receipt.observedAt);
  if (!(Date.parse(record.notBefore) <= observed && observed < Date.parse(record.expiresAt))) failures.push(`${config.id}.activationReceipt: observedAt outside authorization interval`);
  validateSelfHash(receipt, "selfHash", receipt.selfHash?.digest, `${config.id}.activationReceipt`, failures);
  return receipt;
}
function validateActivation(repoRoot, config, sibling, registry, failures, gitState, frozenStart) {
  const record = registry.authorizations.find((row) => row.id === config.id);
  const siblingRecord = registry.authorizations.find((row) => row.id === sibling.id);
  const own = validateActivationReceipt(repoRoot, config, record, failures);
  const peer = validateActivationReceipt(repoRoot, sibling, siblingRecord, failures);
  if (!own || !peer) { failures.push("ACTIVATION_RECEIPT_MISSING"); return null; }
  exact([own.phase0ACommit, own.phase0ATree, own.observedAt], [peer.phase0ACommit, peer.phase0ATree, peer.observedAt], "T03/T04 shared H1/T1/observedAt", failures);
  const state = gitState ?? discoverGitState(repoRoot, failures);
  exact([state.phase0ACommit, state.phase0ATree], [own.phase0ACommit, own.phase0ATree], "activation real H1/T1", failures);
  exact(state.changedPaths, ACTIVATION_PATHS, "activation exact Phase0B write set", failures);
  const start = { commit: state.phase0BCommit, tree: state.phase0BTree };
  if (frozenStart && (state.currentCommit !== frozenStart.commit || state.currentTree !== frozenStart.tree)) failures.push("ABORTED_DERIVED: frozen worker HEAD/tree moved");
  if (existsSync(resolve(repoRoot, config.completionPath))) failures.push("AUTHORIZATION_ALREADY_CONSUMED");
  return start;
}

export function verifyP180SiblingAuthorization({ repoRoot = ROOT, registry, ticket = "T03", mode = "record", gitState, frozenStart } = {}) {
  repoRoot = realpathSync(repoRoot);
  const failures = [];
  const config = CONFIGS[ticket]; const sibling = CONFIGS[ticket === "T03" ? "T04" : "T03"];
  const source = registry ?? readJson(repoRoot, REGISTRY_PATH, "scoped authorization registry", failures);
  const record = source?.authorizations?.find((row) => row.id === config.id);
  if (!record) return { failures: [...failures, `${config.id}: missing exact record`] };
  checkKeys(record, RECORD_KEYS, config.id, failures);
  exact([record.recordKind, record.status, record.implementationAuthorized, record.activationRequired,
    record.projectId, record.branch, record.baseCommit, record.baseTree, record.controllerActorId,
    record.goalRunId, record.laneId, record.parentTicketId, record.parentTicketStatus,
    record.authorizationProposalId, record.ownerActorId, record.riskOwnerActorId,
    record.recordedAt, record.notBefore, record.expiresAt, record.exactDurationMilliseconds, record.renewable],
  ["owner-solo-reserved-child-ticket-exception-v3", "reserved-pending-activation", true, true,
    "one-box", COMMON.branch, COMMON.baseCommit, COMMON.baseTree, COMMON.controllerActorId,
    COMMON.goalRunId, config.laneId, "OBX-P180", "proposed", "OBX-AUTH-P180-OFFLINE-V1",
    "person:devin-wiggins", "person:devin-wiggins", COMMON.notBefore, COMMON.notBefore,
    COMMON.expiresAt, COMMON.duration, false], `${config.id}.identity`, failures);
  exact(record.childTicketIds, [config.ticketId], `${config.id}.childTicketIds`, failures);
  exact(record.reservation, { state: "RESERVED", claimantActorId: config.claimant, claimSequence: 1, transferable: false, replacementAllowed: false, rebaselineAllowed: false }, `${config.id}.reservation`, failures);
  exact(record.roleAvailability, expectedRoles(config), `${config.id}.roles`, failures);
  exact(record.implementationAuthorizationSeparation, { status: "NOT_AVAILABLE", satisfied: false }, `${config.id}.implementationAuthorizationSeparation`, failures);
  exact(record.independentHumanReview, { status: "NOT_AVAILABLE", satisfied: false, actorId: null }, `${config.id}.independentHumanReview`, failures);
  exact(record.acceptedRisk, {
    findingId: `OBX-P180-${config.laneId}-SOLO-SEPARATION-001`, severity: "MEDIUM",
    status: "ACCEPTED", reasonCode: "SOLO_OWNER_SEPARATION_UNAVAILABLE",
  }, `${config.id}.acceptedRisk`, failures);
  exact(record.requirementExceptions, expectedRequirementExceptions(config), `${config.id}.requirementExceptions`, failures);
  exact(record.traceabilityRefs, ["EOS-006", "EOS-012", "PROG-EVAL-COST-001", "PROG-EVAL-SEC-AGENT-001"], `${config.id}.traceabilityRefs`, failures);
  exact(record.allowedPaths, config.paths, `${config.id}.allowedPaths`, failures);
  exact(record.allowedEffects, [config.effect], `${config.id}.allowedEffects`, failures);
  exact(record.forbiddenEffects, config.forbidden, `${config.id}.forbiddenEffects`, failures);
  exact(record.predecessorBinding, expectedPredecessor(), `${config.id}.predecessor`, failures);
  exact(record.siblingConcurrency, expectedSiblingConcurrency(config, sibling), `${config.id}.siblingConcurrency`, failures);
  exact(record.activationProtocol, expectedActivationProtocol(config), `${config.id}.activationProtocol`, failures);
  exact(record.proofProtocol, expectedProofProtocol(), `${config.id}.proofProtocol`, failures);
  exact(record.completionEvidence, expectedCompletionEvidence(config), `${config.id}.completionEvidence`, failures);
  exact(record.reviewProtocol, expectedReviewProtocol(), `${config.id}.reviewProtocol`, failures);
  exact(record.requiredEvidencePaths, [config.securityPath, SOURCE_ADOPTION_REPIN_PATH, config.activationPath, config.completionPath], `${config.id}.requiredEvidencePaths`, failures);
  exact(record.invalidators, expectedInvalidators(config), `${config.id}.invalidators`, failures);
  if (Date.parse(record.expiresAt) - Date.parse(record.notBefore) !== COMMON.duration) failures.push(`${config.id}: expiry must be exactly 336 hours`);
  validateSelfHash(record, "authorizationHash", config.hash, config.id, failures);
  failures.push(...verifyP180T02Completion({ repoRoot }).failures);
  validateLiveBindings(repoRoot, record.planBindings, `${config.id}.planBindings`, failures);
  validateLiveBindings(repoRoot, record.dependencyBindings, `${config.id}.dependencyBindings`, failures);
  validateLiveBindings(repoRoot, record.sourceAdoptionBindings, `${config.id}.sourceAdoptionBindings`, failures);
  validateAmendment(repoRoot, config, record, failures);
  validateDerivedRepin(repoRoot, failures);
  validateOutputTuple(config, sibling, record, failures);
  validateSecurityReceipt(repoRoot, config, record, failures);
  let frozenWorkerStart = null;
  if (mode === "record") {
    for (const path of [...ACTIVATION_PATHS, ...COMPLETION_PATHS]) {
      if (existsSync(resolve(repoRoot, path))) failures.push(`${config.id}: Phase0A output must be absent ${path}`);
    }
  } else {
    frozenWorkerStart = validateActivation(repoRoot, config, sibling, source, failures, gitState, frozenStart);
  }
  return { failures, authorizationHash: config.hash, state: mode === "record" ? "PRE_ACTIVATION" : failures.some((failure) => failure.startsWith("ABORTED_DERIVED")) ? "ABORTED_DERIVED" : frozenWorkerStart ? "ACTIVE" : "RESERVED", frozenWorkerStart };
}

export function runP180AuthorizationCli(ticket, repoRoot = ROOT) {
  const mode = process.argv.includes("--activation-only") || process.argv.includes("--claim-only") ? "activation" : "record";
  const result = verifyP180SiblingAuthorization({ repoRoot, ticket, mode });
  if (result.failures.length) { for (const failure of result.failures) console.error(`FAIL ${failure}`); process.exitCode = 1; return; }
  console.log(`PASS ${ticket} Phase0A authorization record ${result.authorizationHash}`);
  console.log(`PASS ${ticket} derived state ${result.state}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) runP180AuthorizationCli("T03");
