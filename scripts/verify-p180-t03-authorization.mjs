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
const PROTECTED_UNTRACKED_PATH = ".claude/handoffs/one-box-operating-environment-next-phase.md";
const PROTECTED_UNTRACKED_SHA256 = "cbbc878aa0691f333b128a71aee43adde89a9691a9ed65880f1f2b41a20643a6";
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
const COMPLETION_KEYS = [
  "schemaVersion", "receiptId", "receiptKind", "status", "ticketId", "laneId",
  "authorizationId", "authorizationHash", "activationBinding", "implementation",
  "completionBase", "leaseReleases", "proofBinding", "completedAt", "selfHash",
];
const PROOF_TUPLE_KEYS = [
  "sequence", "laneId", "commandId", "authorizationId", "authorizationHash",
  "activationReceiptId", "activationReceiptHash", "startedAt", "finishedAt", "exitCode",
  "outputDigest", "envelopeDigest", "previousDigest", "entryDigest",
];
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SECURITY_COVERAGE = [
  {
    surface: "prompt-injection", status: "NOT_APPLICABLE",
    disposition: "No prompt, retrieval, browser, or model execution surface is introduced by the Phase 0A records.",
  },
  {
    surface: "secrets", status: "PASS",
    disposition: "The exact 16-path target stream passed gitleaks 8.30.1 with zero findings after a deterministic test-ID false positive was removed.",
  },
  {
    surface: "authentication", status: "NOT_APPLICABLE",
    disposition: "No identity provider, session, credential, endpoint, or authentication behavior changes.",
  },
  {
    surface: "authorization", status: "PASS",
    disposition: "The grant is exact, self-hashed, nonrenewable, predecessor-bound, sibling-disjoint, and activation-gated on both future H1/T1 receipts.",
  },
  {
    surface: "untrusted-input", status: "PASS",
    disposition: "Closed JSON keys, canonical hashes, nonsymlinked repository paths, exact timestamps, and fail-closed receipt validation cover parsed governance inputs.",
  },
  {
    surface: "export", status: "NONE",
    disposition: "No data export, network, provider call, telemetry, or product-data transfer is authorized.",
  },
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
function historicalFileBytes(repoRoot, path, label, failures, binding) {
  if (typeof path !== "string" || path.startsWith("/") || normalize(path).startsWith("..")) {
    failures.push(`${label}: invalid repository-relative path`); return null;
  }
  if (!/^[a-f0-9]{40}$/.test(binding.commit ?? "")) {
    failures.push(`${label}: invalid historical commit`); return null;
  }
  if (binding.gitState?.historicalFileBytes?.has(path)) return Buffer.from(binding.gitState.historicalFileBytes.get(path));
  const treeEntry = spawnSync("git", ["ls-tree", binding.commit, "--", path], { cwd: repoRoot, encoding: "utf8" });
  const [metadata, listedPath] = treeEntry.stdout.trim().split("\t");
  const [mode, type] = (metadata ?? "").split(/\s+/);
  if (treeEntry.status !== 0 || listedPath !== path || type !== "blob" || !["100644", "100755"].includes(mode)) {
    failures.push(`${label}: historical nonsymlinked regular file required ${path}`); return null;
  }
  const result = spawnSync("git", ["show", `${binding.commit}:${path}`], { cwd: repoRoot, encoding: null });
  if (result.status !== 0) { failures.push(`${label}: cannot read ${path} at ${binding.commit}`); return null; }
  return result.stdout;
}
function readJson(repoRoot, path, label, failures, required = true, binding = null) {
  const bytes = binding?.commit
    ? historicalFileBytes(repoRoot, path, label, failures, binding)
    : (() => { const absolute = safeFile(repoRoot, path, label, failures, required); return absolute ? readFileSync(absolute) : null; })();
  if (!bytes) return null;
  try { const value = JSON.parse(bytes.toString("utf8")); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("top level must be object"); return value; }
  catch (error) { failures.push(`${label}: invalid JSON (${error.message})`); return null; }
}
function sha256File(repoRoot, path, label, failures, binding = null) {
  const bytes = binding?.commit
    ? historicalFileBytes(repoRoot, path, label, failures, binding)
    : (() => { const absolute = safeFile(repoRoot, path, label, failures); return absolute ? readFileSync(absolute) : null; })();
  return bytes ? createHash("sha256").update(bytes).digest("hex") : null;
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
function validateLiveBindings(repoRoot, bindings, label, failures, binding = null) {
  if (!Array.isArray(bindings) || bindings.length === 0) { failures.push(`${label}: non-empty bindings required`); return; }
  for (const [index, row] of bindings.entries()) {
    checkKeys(row, ["path", "algorithm", "digest"], `${label}[${index}]`, failures);
    if (row.algorithm !== "sha256" || sha256File(repoRoot, row.path, `${label}[${index}]`, failures, binding) !== row.digest) {
      failures.push(`${label}[${index}]: ${binding?.commit ? "activation-era" : "current"} hash drift ${row.path}`);
    }
  }
}
function validateAmendment(repoRoot, config, record, failures, binding = null) {
  const amendment = readJson(repoRoot, config.amendmentPath, `${config.id}.amendment`, failures, true, binding);
  if (sha256File(repoRoot, config.amendmentPath, `${config.id}.amendment`, failures, binding) !== config.amendmentDigest) failures.push(`${config.id}.amendment: file hash drift`);
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
function validateDerivedRepin(repoRoot, failures, binding = null) {
  const label = "Phase0A source-adoption derived re-pin";
  const repin = readJson(repoRoot, SOURCE_ADOPTION_REPIN_PATH, label, failures, true, binding);
  const manifest = readJson(repoRoot, AUTHORITY_MANIFEST_PATH, `${label}.authorityManifest`, failures, true, binding);
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
    sha256: sha256File(repoRoot, AUTHORITY_MANIFEST_PATH, `${label}.authorityManifest`, failures, binding),
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
function validateSecurityReceipt(repoRoot, config, record, failures, binding = null) {
  const receipt = readJson(repoRoot, config.securityPath, `${config.id}.securityReceipt`, failures, true, binding);
  if (!receipt) return;
  checkKeys(receipt, ["schemaVersion", "reviewId", "receiptKind", "phase", "authorizationId", "authorizationHash", "amendmentId", "amendmentHash", "amendmentSelfHash", "baseCommit", "baseTree", "targetPaths", "targetHashes", "coverage", "findings", "exports", "secretsScan", "activationState", "verdict", "capturedAt", "selfHash"], `${config.id}.securityReceipt`, failures);
  exact([receipt.schemaVersion, receipt.reviewId, receipt.receiptKind, receipt.phase,
    receipt.authorizationId, receipt.authorizationHash, receipt.amendmentId, receipt.amendmentHash,
    receipt.amendmentSelfHash, receipt.baseCommit, receipt.baseTree, receipt.activationState, receipt.verdict],
  [1, config.securityId, config.securityKind, "PHASE0A_PRE_ACTIVATION", config.id, config.hash,
    config.amendmentId, config.amendmentDigest, config.amendmentSelfHash, COMMON.baseCommit,
    COMMON.baseTree, "NOT_ACTIVE", "PASS-WITH-ACCEPTED-RISK"], `${config.id}.securityReceipt.identity`, failures);
  exact(receipt.targetPaths, PHASE0A_SECURITY_TARGET_PATHS, `${config.id}.securityReceipt.targetPaths`, failures);
  validateLiveBindings(repoRoot, receipt.targetHashes, `${config.id}.securityReceipt.targetHashes`, failures, binding);
  exact(receipt.targetHashes?.map((row) => row.path), PHASE0A_SECURITY_TARGET_PATHS, `${config.id}.securityReceipt.targetHash order`, failures);
  const coverage = receipt.coverage ?? [];
  exact(coverage, SECURITY_COVERAGE, `${config.id}.securityReceipt.coverage`, failures);
  for (const [index, row] of coverage.entries()) {
    checkKeys(row, ["surface", "status", "disposition"], `${config.id}.securityReceipt.coverage[${index}]`, failures);
  }
  exact(receipt.findings, [{
    findingId: record.acceptedRisk?.findingId,
    severity: record.acceptedRisk?.severity,
    status: record.acceptedRisk?.status,
    reasonCode: record.acceptedRisk?.reasonCode,
    disposition: "The owner accepted the exact solo-role separation risk only for this bounded, provider-offline, pre-activation grant.",
    compensatingControls: [
      "exact-self-hashed-path-and-effect-grant",
      "336-hour-nonrenewable-interval",
      "shared-H1-T1-activation-receipts",
      "controller-only-proof-and-completion-protocol",
      "T05-plus-and-product-runtime-denial",
    ],
  }], `${config.id}.securityReceipt.findings`, failures);
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
  const paths = (value) => value?.split("\n").filter(Boolean) ?? [];
  const phase0BCommit = git("rev-parse", "HEAD");
  const phase0BTree = git("rev-parse", "HEAD^{tree}");
  const phase0ACommit = git("rev-parse", "HEAD^");
  const phase0ATree = phase0ACommit ? git("rev-parse", `${phase0ACommit}^{tree}`) : null;
  const changedPaths = phase0ACommit && phase0BCommit ? paths(git("diff", "--name-only", `${phase0ACommit}..${phase0BCommit}`)) : [];
  const cachedPaths = paths(git("diff", "--cached", "--name-only", "--"));
  const worktreePaths = paths(git("diff", "--name-only", "--"));
  const untrackedPaths = paths(git("ls-files", "--others", "--exclude-standard", "--"));
  return {
    phase0ACommit, phase0ATree, phase0BCommit, phase0BTree,
    currentCommit: phase0BCommit, currentTree: phase0BTree, changedPaths,
    cachedPaths, worktreePaths, untrackedPaths,
  };
}
function validateActivationReceipt(repoRoot, config, record, failures) {
  if (!record) {
    failures.push(`${config.id}: missing exact record`);
    return null;
  }
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
  const cachedPaths = state.cachedPaths ?? [];
  const worktreePaths = state.worktreePaths ?? [];
  const untrackedPaths = state.untrackedPaths ?? [];
  const unexpectedUntracked = untrackedPaths.filter((path) => path !== PROTECTED_UNTRACKED_PATH);
  if (cachedPaths.length > 0 || worktreePaths.length > 0 || unexpectedUntracked.length > 0) {
    failures.push("WORKER_INDEX_OR_WORKTREE_MUTATION: activation requires an empty index, no tracked worktree changes, and no unexpected untracked paths");
  }
  if (untrackedPaths.includes(PROTECTED_UNTRACKED_PATH)
    && sha256File(repoRoot, PROTECTED_UNTRACKED_PATH, "protected untracked baseline", failures) !== PROTECTED_UNTRACKED_SHA256) {
    failures.push("WORKER_INDEX_OR_WORKTREE_MUTATION: protected untracked baseline hash drift");
  }
  const start = { commit: state.phase0BCommit, tree: state.phase0BTree };
  if (frozenStart && (state.currentCommit !== frozenStart.commit || state.currentTree !== frozenStart.tree)) failures.push("ABORTED_DERIVED: frozen worker HEAD/tree moved");
  if (existsSync(resolve(repoRoot, config.completionPath))) failures.push("AUTHORIZATION_ALREADY_CONSUMED");
  return start;
}

function validateActivationHistory(repoRoot, config, sibling, registry, failures, gitState) {
  const record = registry.authorizations.find((row) => row.id === config.id);
  const siblingRecord = registry.authorizations.find((row) => row.id === sibling.id);
  const own = validateActivationReceipt(repoRoot, config, record, failures);
  const peer = validateActivationReceipt(repoRoot, sibling, siblingRecord, failures);
  if (!own || !peer) {
    failures.push("ACTIVATION_RECEIPT_MISSING");
    return null;
  }
  exact(
    [own.phase0ACommit, own.phase0ATree, own.observedAt],
    [peer.phase0ACommit, peer.phase0ATree, peer.observedAt],
    "T03/T04 shared H1/T1/observedAt",
    failures,
  );
  const h1Info = commitInfo(repoRoot, own.phase0ACommit, gitState, "activation history H1", failures);
  exact(h1Info?.tree, own.phase0ATree, "activation history H1 tree", failures);

  let h2Commit = null;
  if (gitState?.commits) {
    let cursor = gitState.currentCommit;
    const visited = new Set();
    while (cursor && cursor !== own.phase0ACommit && !visited.has(cursor)) {
      visited.add(cursor);
      const info = gitState.commits[cursor];
      if (!info || info.parents?.length !== 1) break;
      if (info.parents[0] === own.phase0ACommit) {
        h2Commit = cursor;
        break;
      }
      cursor = info.parents[0];
    }
  } else {
    const currentCommit = gitState?.currentCommit
      ?? gitOutput(repoRoot, ["rev-parse", "HEAD"], "activation history current HEAD", failures);
    const history = currentCommit
      ? gitOutput(repoRoot, ["rev-list", "--ancestry-path", "--reverse", `${own.phase0ACommit}..${currentCommit}`], "activation history", failures)
      : null;
    h2Commit = history?.split("\n").filter(Boolean)[0] ?? null;
  }
  if (!h2Commit) {
    failures.push("activation history H2: receipt-bound H1 has no current-history child");
    return null;
  }
  const h2Info = commitInfo(repoRoot, h2Commit, gitState, "activation history H2", failures);
  exact(
    [h2Info?.parents, h2Info?.changedPaths],
    [[own.phase0ACommit], ACTIVATION_PATHS],
    "activation history H1->H2 topology",
    failures,
  );
  return { commit: h2Commit, tree: h2Info?.tree };
}

function gitOutput(repoRoot, args, label, failures) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    failures.push(`${label}: git ${args.join(" ")} failed`);
    return null;
  }
  return result.stdout.trim();
}

function commitInfo(repoRoot, commit, gitState, label, failures) {
  if (!/^[a-f0-9]{40}$/.test(commit ?? "")) {
    failures.push(`${label}: 40-character commit required`);
    return null;
  }
  if (gitState?.commits?.[commit]) return gitState.commits[commit];
  const tree = gitOutput(repoRoot, ["rev-parse", `${commit}^{tree}`], label, failures);
  const parentLine = gitOutput(repoRoot, ["rev-list", "--parents", "-n", "1", commit], label, failures);
  if (!tree || !parentLine) return null;
  const parents = parentLine.split(/\s+/).slice(1);
  const changedPaths = parents.length === 1
    ? gitOutput(repoRoot, ["diff", "--name-only", `${parents[0]}..${commit}`], label, failures)?.split("\n").filter(Boolean) ?? []
    : [];
  return { tree, parents, changedPaths };
}

function commitFileBytes(repoRoot, commit, path, gitState, label, failures) {
  if (gitState?.fileBytes?.has(path)) return Buffer.from(gitState.fileBytes.get(path));
  const result = spawnSync("git", ["show", `${commit}:${path}`], { cwd: repoRoot, encoding: null });
  if (result.status !== 0) {
    failures.push(`${label}: cannot read ${path} at ${commit}`);
    return null;
  }
  return result.stdout;
}

function completionCommitFor(repoRoot, baseCommit, currentCommit, gitState, failures) {
  if (gitState?.completionCommit) return gitState.completionCommit;
  const rows = gitOutput(repoRoot, ["rev-list", "--parents", `${baseCommit}..${currentCommit}`], "completion commit", failures);
  if (rows === null) return null;
  const candidates = rows.split("\n").filter(Boolean).map((row) => row.split(/\s+/))
    .filter((parts) => parts.slice(1).includes(baseCommit));
  if (candidates.length !== 1 || candidates[0].length !== 2) {
    failures.push("completion git topology: unique single-parent receipt commit required");
    return null;
  }
  return candidates[0][0];
}

function validateProofRegistry(repoRoot, proofRoot, proofBinding, expectedEntries, failures) {
  const rootPath = resolve(proofRoot);
  let rootReal;
  try { rootReal = realpathSync(rootPath); }
  catch (error) { failures.push(`completion proof registry: unsafe ${rootPath} (${error.message})`); return; }
  const proofPath = resolve(rootPath, "proof");
  const registryPath = resolve(rootPath, proofBinding.registryPath);
  const lockPath = resolve(rootPath, "proof/controller-proof-registry.lock");
  const expectedUid = typeof process.getuid === "function" ? process.getuid() : null;
  for (const [path, mode, kind] of [[rootPath, 0o700, "directory"], [proofPath, 0o700, "directory"], [registryPath, 0o600, "file"]]) {
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || (kind === "directory" ? !stat.isDirectory() : !stat.isFile())) throw new Error(`real ${kind} required`);
      if ((stat.mode & 0o777) !== mode) throw new Error(`mode ${mode.toString(8).padStart(4, "0")} required`);
      if (expectedUid !== null && stat.uid !== expectedUid) throw new Error("owner mismatch");
      const real = realpathSync(path);
      if (path !== rootPath && relative(rootReal, real).startsWith("..")) throw new Error("path escapes proof root");
    } catch (error) {
      failures.push(`completion proof registry: unsafe ${path} (${error.message})`);
      return;
    }
  }
  if (existsSync(lockPath)) failures.push("completion proof registry: lock present");
  const bytes = readFileSync(registryPath);
  if (bytes.length === 0 || bytes.at(-1) !== 0x0a) failures.push("completion proof registry: newline-terminated content required");
  if (createHash("sha256").update(bytes).digest("hex") !== proofBinding.registrySha256) failures.push("completion proof registry: byte digest mismatch");
  try {
    const entries = bytes.toString("utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
    exact(entries, expectedEntries, "completion proof registry entries", failures);
  } catch (error) {
    failures.push(`completion proof registry: invalid JSONL (${error.message})`);
  }
  for (const tuple of expectedEntries) {
    const relativePath = `proof/controller-proof-envelope-${String(tuple.sequence).padStart(2, "0")}-${tuple.laneId.toLowerCase()}-${tuple.commandId}.json`;
    const envelopePath = resolve(rootPath, relativePath);
    let envelopeBytes;
    try {
      const stat = lstatSync(envelopePath);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("real regular file required");
      if ((stat.mode & 0o777) !== 0o600) throw new Error("mode 0600 required");
      if (expectedUid !== null && stat.uid !== expectedUid) throw new Error("owner mismatch");
      const real = realpathSync(envelopePath);
      if (relative(rootReal, real).startsWith("..")) throw new Error("path escapes proof root");
      envelopeBytes = readFileSync(envelopePath);
    } catch (error) {
      failures.push(`controller proof envelope ${relativePath}: missing or unsafe (${error.message})`);
      continue;
    }
    if (envelopeBytes.length === 0 || envelopeBytes.at(-1) !== 0x0a) failures.push(`controller proof envelope ${relativePath}: newline-terminated content required`);
    if (createHash("sha256").update(envelopeBytes).digest("hex") !== tuple.envelopeDigest) failures.push(`controller proof envelope ${relativePath}: byte digest mismatch`);
    try {
      const envelope = JSON.parse(envelopeBytes.toString("utf8"));
      const expected = {
        schemaVersion: 1,
        envelopeKind: "obx-p180-controller-proof-envelope-v1",
        sequence: tuple.sequence,
        laneId: tuple.laneId,
        commandId: tuple.commandId,
        authorizationId: tuple.authorizationId,
        authorizationHash: tuple.authorizationHash,
        activationReceiptId: tuple.activationReceiptId,
        activationReceiptHash: tuple.activationReceiptHash,
        startedAt: tuple.startedAt,
        finishedAt: tuple.finishedAt,
        exitCode: tuple.exitCode,
        outputDigest: tuple.outputDigest,
      };
      checkKeys(envelope, Object.keys(expected), `controller proof envelope ${relativePath}`, failures);
      exact(envelope, expected, `controller proof envelope ${relativePath}`, failures);
    } catch (error) {
      failures.push(`controller proof envelope ${relativePath}: invalid JSON (${error.message})`);
    }
  }
}

function validateCompletionReceipt(config, record, receipt, activation, siblingRecords, failures) {
  const label = `${config.id}.completionReceipt`;
  checkKeys(receipt, COMPLETION_KEYS, label, failures);
  exact([
    receipt.schemaVersion, receipt.receiptId, receipt.receiptKind, receipt.status,
    receipt.ticketId, receipt.laneId, receipt.authorizationId, receipt.authorizationHash,
  ], [
    1, `${config.ticketId}-COMPLETION-001`, `solo-${config.laneId.toLowerCase()}-completion-receipt-v1`,
    "COMPLETED_VERIFIED", config.ticketId, config.laneId, config.id, config.hash,
  ], `${label}.identity`, failures);
  checkKeys(receipt.activationBinding, ["path", "receiptId", "receiptSelfHash", "frozenStartCommit", "frozenStartTree"], `${label}.activationBinding`, failures);
  exact(receipt.activationBinding, {
    path: config.activationPath,
    receiptId: activation?.receiptId,
    receiptSelfHash: activation?.selfHash?.digest,
    frozenStartCommit: receipt.activationBinding?.frozenStartCommit,
    frozenStartTree: receipt.activationBinding?.frozenStartTree,
  }, `${label}.activationBinding`, failures);
  if (!/^[a-f0-9]{40}$/.test(receipt.activationBinding?.frozenStartCommit ?? "")
    || !/^[a-f0-9]{40}$/.test(receipt.activationBinding?.frozenStartTree ?? "")) failures.push(`${label}.activationBinding: commit/tree required`);
  checkKeys(receipt.implementation, ["commit", "tree", "parentCommit", "files"], `${label}.implementation`, failures);
  if (!/^[a-f0-9]{40}$/.test(receipt.implementation?.commit ?? "")
    || !/^[a-f0-9]{40}$/.test(receipt.implementation?.tree ?? "")
    || !/^[a-f0-9]{40}$/.test(receipt.implementation?.parentCommit ?? "")) failures.push(`${label}.implementation: commit/tree/parent required`);
  exact(receipt.implementation?.files?.map((row) => row.path), config.paths, `${label}.implementation file paths`, failures);
  for (const [index, row] of (receipt.implementation?.files ?? []).entries()) {
    checkKeys(row, ["path", "algorithm", "digest"], `${label}.implementation.files[${index}]`, failures);
    if (row.algorithm !== "sha256" || !SHA256.test(row.digest ?? "")) failures.push(`${label}.implementation.files[${index}]: SHA-256 digest required`);
  }
  checkKeys(receipt.completionBase, ["commit", "tree"], `${label}.completionBase`, failures);
  const releases = receipt.leaseReleases ?? [];
  exact(releases.map((row) => row.laneId), ["T03", "T04"], `${label}.leaseReleases lane order`, failures);
  for (const [index, release] of releases.entries()) {
    const laneRecord = siblingRecords[release.laneId];
    checkKeys(release, ["laneId", "claimantActorId", "claimSequence", "taskStatus", "terminalReportDigest", "releasedAt"], `${label}.leaseReleases[${index}]`, failures);
    exact([release.claimantActorId, release.claimSequence, release.taskStatus], [laneRecord?.reservation?.claimantActorId, 1, "COMPLETED"], `${label}.leaseReleases[${index}]`, failures);
    if (!SHA256.test(release.terminalReportDigest ?? "")) failures.push(`${label}.leaseReleases[${index}]: terminal report digest required`);
    const released = Date.parse(release.releasedAt);
    if (!CANONICAL_TIMESTAMP.test(release.releasedAt ?? "") || !(Date.parse(record.notBefore) <= released && released < Date.parse(record.expiresAt))) failures.push(`${label}.leaseReleases[${index}]: canonical in-window release required`);
  }
  const proof = receipt.proofBinding;
  checkKeys(proof, ["registryPath", "registrySha256", "entryCount", "headDigest", "tuples"], `${label}.proofBinding`, failures);
  exact(proof?.registryPath, record.proofProtocol.registryPath, `${label}.proofBinding.registryPath`, failures);
  if (!SHA256.test(proof?.registrySha256 ?? "") || !SHA256.test(proof?.headDigest ?? "")) failures.push(`${label}.proofBinding: SHA-256 registry bindings required`);
  exact(proof?.tuples?.map((row) => row.commandId), record.completionEvidence.requiredCommandIds, `${label}.proofBinding command IDs`, failures);
  for (const [index, tuple] of (proof?.tuples ?? []).entries()) {
    checkKeys(tuple, PROOF_TUPLE_KEYS, `${label}.proofBinding.tuples[${index}]`, failures);
    exact([tuple.laneId, tuple.authorizationId, tuple.authorizationHash, tuple.activationReceiptId, tuple.activationReceiptHash, tuple.exitCode],
      [config.laneId, config.id, config.hash, activation?.receiptId, activation?.selfHash?.digest, 0], `${label}.proofBinding.tuples[${index}]`, failures);
    const started = Date.parse(tuple.startedAt); const finished = Date.parse(tuple.finishedAt);
    if (!CANONICAL_TIMESTAMP.test(tuple.startedAt ?? "") || !CANONICAL_TIMESTAMP.test(tuple.finishedAt ?? "")
      || !(Date.parse(record.notBefore) <= started && started <= finished && finished < Date.parse(record.expiresAt))) failures.push(`${label}.proofBinding.tuples[${index}]: canonical in-window command interval required`);
    for (const field of ["outputDigest", "envelopeDigest", "previousDigest", "entryDigest"]) if (!SHA256.test(tuple[field] ?? "")) failures.push(`${label}.proofBinding.tuples[${index}].${field}: SHA-256 required`);
    const unhashed = structuredClone(tuple); delete unhashed.entryDigest;
    if (createHash("sha256").update(canonicalJson(unhashed)).digest("hex") !== tuple.entryDigest) failures.push(`${label}.proofBinding.tuples[${index}]: entry digest mismatch`);
  }
  const completed = Date.parse(receipt.completedAt);
  if (!CANONICAL_TIMESTAMP.test(receipt.completedAt ?? "") || !(Date.parse(record.notBefore) <= completed && completed < Date.parse(record.expiresAt))) failures.push(`${label}: canonical in-window completedAt required`);
  validateSelfHash(receipt, "selfHash", receipt.selfHash?.digest, label, failures);
}

function validateCompletionPair(repoRoot, registry, failures, gitState, proofRoot, requireExternalProof) {
  const start = failures.length;
  const records = Object.fromEntries(["T03", "T04"].map((ticket) => [ticket, registry.authorizations.find((row) => row.id === CONFIGS[ticket].id)]));
  const receipts = {};
  const activations = {};
  for (const ticket of ["T03", "T04"]) {
    receipts[ticket] = readJson(repoRoot, CONFIGS[ticket].completionPath, `${CONFIGS[ticket].id}.completionReceipt`, failures);
    activations[ticket] = validateActivationReceipt(repoRoot, CONFIGS[ticket], records[ticket], failures);
  }
  if (!receipts.T03 || !receipts.T04 || !activations.T03 || !activations.T04) return false;
  exact([activations.T03.phase0ACommit, activations.T03.phase0ATree, activations.T03.observedAt],
    [activations.T04.phase0ACommit, activations.T04.phase0ATree, activations.T04.observedAt], "completion shared activation", failures);
  for (const ticket of ["T03", "T04"]) validateCompletionReceipt(CONFIGS[ticket], records[ticket], receipts[ticket], activations[ticket], records, failures);
  if (failures.length !== start) return false;
  const h2 = receipts.T03.activationBinding.frozenStartCommit;
  const h2Tree = receipts.T03.activationBinding.frozenStartTree;
  exact(receipts.T04.activationBinding, { ...receipts.T04.activationBinding, frozenStartCommit: h2, frozenStartTree: h2Tree }, "completion shared frozen start", failures);
  const h2Info = commitInfo(repoRoot, h2, gitState, "completion H2", failures);
  exact([h2Info?.tree, h2Info?.parents, h2Info?.changedPaths], [h2Tree, [activations.T03.phase0ACommit], ACTIVATION_PATHS], "completion H2 topology", failures);
  const t03 = receipts.T03.implementation; const t04 = receipts.T04.implementation;
  exact(t03.parentCommit, h2, "T03 completion implementation parent", failures);
  exact(t04.parentCommit, t03.commit, "T04 completion implementation parent", failures);
  for (const [ticket, implementation] of [["T03", t03], ["T04", t04]]) {
    const info = commitInfo(repoRoot, implementation.commit, gitState, `${ticket} completion implementation`, failures);
    exact(
      [info?.tree, info?.parents, info?.changedPaths],
      [implementation.tree, [implementation.parentCommit], [...CONFIGS[ticket].paths].sort()],
      `${ticket} completion implementation topology`,
      failures,
    );
    for (const file of implementation.files) {
      const committed = commitFileBytes(repoRoot, implementation.commit, file.path, gitState, `${ticket} completion implementation`, failures);
      const currentCommit = gitState?.currentCommit ?? gitOutput(repoRoot, ["rev-parse", "HEAD"], "completion current HEAD", failures);
      const current = currentCommit ? commitFileBytes(repoRoot, currentCommit, file.path, gitState, `${ticket} current completed artifact`, failures) : null;
      if (!committed || createHash("sha256").update(committed).digest("hex") !== file.digest) failures.push(`${ticket} completion implementation digest drift ${file.path}`);
      if (!current || createHash("sha256").update(current).digest("hex") !== file.digest) failures.push(`${ticket} current completed artifact drift ${file.path}`);
    }
  }
  exact(receipts.T03.completionBase, receipts.T04.completionBase, "completion shared base", failures);
  exact(receipts.T03.completionBase, { commit: t04.commit, tree: t04.tree }, "completion base is T04 implementation", failures);
  exact(receipts.T03.leaseReleases, receipts.T04.leaseReleases, "completion shared lease releases", failures);
  const tuples = [...receipts.T03.proofBinding.tuples, ...receipts.T04.proofBinding.tuples].sort((left, right) => left.sequence - right.sequence);
  exact(tuples.map((row) => row.sequence), Array.from({ length: tuples.length }, (_, index) => index + 1), "completion proof sequence", failures);
  let previousDigest = "0".repeat(64);
  for (const [index, tuple] of tuples.entries()) {
    exact(tuple.previousDigest, previousDigest, `completion proof chain[${index}]`, failures);
    previousDigest = tuple.entryDigest;
  }
  for (const ticket of ["T03", "T04"]) {
    const proof = receipts[ticket].proofBinding;
    exact([proof.entryCount, proof.headDigest], [tuples.length, previousDigest], `${ticket} completion proof head`, failures);
  }
  exact([receipts.T03.proofBinding.registrySha256, receipts.T03.proofBinding.headDigest],
    [receipts.T04.proofBinding.registrySha256, receipts.T04.proofBinding.headDigest], "completion shared proof registry", failures);
  const releaseFloor = Math.max(...receipts.T03.leaseReleases.map((row) => Date.parse(row.releasedAt)));
  const firstProof = Math.min(...tuples.map((row) => Date.parse(row.startedAt)));
  const lastProof = Math.max(...tuples.map((row) => Date.parse(row.finishedAt)));
  if (!(releaseFloor <= firstProof)) failures.push("completion proof began before both leases released");
  for (const ticket of ["T03", "T04"]) if (!(lastProof <= Date.parse(receipts[ticket].completedAt))) failures.push(`${ticket} completion recorded before proof finished`);
  const currentCommit = gitState?.currentCommit ?? gitOutput(repoRoot, ["rev-parse", "HEAD"], "completion current HEAD", failures);
  const completionCommit = currentCommit ? completionCommitFor(repoRoot, t04.commit, currentCommit, gitState, failures) : null;
  const completionInfo = completionCommit ? commitInfo(repoRoot, completionCommit, gitState, "completion receipt commit", failures) : null;
  exact([completionInfo?.parents, completionInfo?.changedPaths], [[t04.commit], COMPLETION_PATHS], "completion receipt commit topology", failures);
  if (completionCommit) {
    for (const ticket of ["T03", "T04"]) {
      const path = CONFIGS[ticket].completionPath;
      const atCommit = commitFileBytes(repoRoot, completionCommit, path, gitState, `${ticket} completion receipt commit`, failures);
      const current = readFileSync(resolve(repoRoot, path));
      if (!atCommit || !current.equals(atCommit)) failures.push(`${ticket} completion receipt changed after terminal commit`);
    }
  }
  if (requireExternalProof) validateProofRegistry(repoRoot, proofRoot ?? records.T03.proofProtocol.goalStateRoot, receipts.T03.proofBinding, tuples, failures);
  return failures.length === start;
}

export function verifyP180SiblingAuthorization({
  repoRoot = ROOT,
  registry,
  ticket = "T03",
  mode = "record",
  gitState,
  frozenStart,
  proofRoot,
  evaluationTime = Date.now(),
  verifyPredecessorCompletion = true,
} = {}) {
  repoRoot = realpathSync(repoRoot);
  const failures = [];
  const config = CONFIGS[ticket]; const sibling = CONFIGS[ticket === "T03" ? "T04" : "T03"];
  const source = registry ?? readJson(repoRoot, REGISTRY_PATH, "scoped authorization registry", failures);
  const record = source?.authorizations?.find((row) => row.id === config.id);
  if (!record) return { failures: [...failures, `${config.id}: missing exact record`] };
  if (!["record", "activation", "lifecycle", "completion"].includes(mode)) failures.push(`${config.id}: unsupported verification mode ${mode}`);
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
  const completionPresence = COMPLETION_PATHS.map((path) => existsSync(resolve(repoRoot, path)));
  const allCompletionReceiptsPresent = completionPresence.every(Boolean);
  let historicalBinding = null;
  if (allCompletionReceiptsPresent) {
    const activation = readJson(repoRoot, config.activationPath, `${config.id}.terminalActivationBinding`, failures);
    if (/^[a-f0-9]{40}$/.test(activation?.phase0ACommit ?? "")) historicalBinding = { commit: activation.phase0ACommit, gitState };
  }
  if (verifyPredecessorCompletion) failures.push(...verifyP180T02Completion({ repoRoot }).failures);
  validateLiveBindings(repoRoot, record.planBindings, `${config.id}.planBindings`, failures, historicalBinding);
  validateLiveBindings(repoRoot, record.dependencyBindings, `${config.id}.dependencyBindings`, failures, historicalBinding);
  validateLiveBindings(repoRoot, record.sourceAdoptionBindings, `${config.id}.sourceAdoptionBindings`, failures, historicalBinding);
  validateAmendment(repoRoot, config, record, failures, historicalBinding);
  validateDerivedRepin(repoRoot, failures, historicalBinding);
  validateOutputTuple(config, sibling, record, failures);
  validateSecurityReceipt(repoRoot, config, record, failures, historicalBinding);
  let frozenWorkerStart = null;
  const anyCompletion = completionPresence.some(Boolean);
  if (anyCompletion && !completionPresence.every(Boolean)) {
    failures.push("COMPLETION_RECEIPT_PAIR_INCOMPLETE");
    return { failures, authorizationHash: config.hash, state: "INVALID", frozenWorkerStart: null };
  }
  if (completionPresence.every(Boolean)) {
    const completionValid = validateCompletionPair(repoRoot, source, failures, gitState, proofRoot, mode === "completion");
    if (!completionValid || failures.length > 0) return { failures, authorizationHash: config.hash, state: "INVALID", frozenWorkerStart: null };
    if (mode === "activation") failures.push("AUTHORIZATION_ALREADY_CONSUMED");
    return { failures, authorizationHash: config.hash, state: "CONSUMED", frozenWorkerStart: null };
  }
  if (mode === "completion") {
    failures.push("COMPLETION_RECEIPT_MISSING");
    return { failures, authorizationHash: config.hash, state: "RESERVED", frozenWorkerStart: null };
  }
  const effectiveMode = mode === "lifecycle"
    ? ACTIVATION_PATHS.some((path) => existsSync(resolve(repoRoot, path))) ? "lifecycle-activation" : "record"
    : mode;
  const expired = evaluationTime >= Date.parse(record.expiresAt);
  if (expired) failures.push("AUTHORIZATION_EXPIRED");
  if (effectiveMode === "record") {
    for (const path of [...ACTIVATION_PATHS, ...COMPLETION_PATHS]) {
      if (existsSync(resolve(repoRoot, path))) failures.push(`${config.id}: Phase0A output must be absent ${path}`);
    }
  } else if (effectiveMode === "activation") {
    frozenWorkerStart = validateActivation(repoRoot, config, sibling, source, failures, gitState, frozenStart);
  } else {
    validateActivationHistory(repoRoot, config, sibling, source, failures, gitState);
  }
  const state = failures.some((failure) => failure.startsWith("ABORTED_DERIVED")) ? "ABORTED_DERIVED"
    : expired ? "EXPIRED"
      : failures.length > 0 ? "RESERVED"
        : effectiveMode === "record" ? "PRE_ACTIVATION"
          : effectiveMode === "activation" && frozenWorkerStart ? "ACTIVE" : "RESERVED";
  return {
    failures,
    authorizationHash: config.hash,
    state,
    frozenWorkerStart: state === "ACTIVE" ? frozenWorkerStart : null,
  };
}

export function runP180AuthorizationCli(ticket, repoRoot = ROOT) {
  const mode = process.argv.includes("--activation-only") || process.argv.includes("--claim-only") ? "activation" : "record";
  const result = verifyP180SiblingAuthorization({ repoRoot, ticket, mode });
  if (result.failures.length) { for (const failure of result.failures) console.error(`FAIL ${failure}`); process.exitCode = 1; return; }
  console.log(`PASS ${ticket} Phase0A authorization record ${result.authorizationHash}`);
  console.log(`PASS ${ticket} derived state ${result.state}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) runP180AuthorizationCli("T03");
