import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { verifyP180SiblingAuthorization } from "./verify-p180-t03-authorization.mjs";

export const T03_CORRECTION_AUTHORIZATION_ID = "OBX-AUTH-P180-T03-AUDIT-CORRECTION-001";
export const T04_CORRECTION_AUTHORIZATION_ID = "OBX-AUTH-P180-T04-AUDIT-CORRECTION-001";

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const REGISTRY_PATH = "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json";
const AUTHORITY_MANIFEST_PATH = "docs/plans/one-box-master/00-authority/authority-manifest.json";
const SOURCE_ADOPTION_REPIN_PATH = "docs/audits/evidence/security/2026-08-31-obx-p180-source-adoption-authority-repin.json";
const CORRECTION_REPIN_PATH = "docs/audits/evidence/security/2026-09-01-obx-p180-phase1-audit-correction-authority-repin.json";
const SECURITY_PATH = "docs/audits/evidence/security/2026-09-01-obx-p180-phase1-audit-correction-security-review.json";
export const PHASE1_CORRECTION_BASE_COMMIT = "573b86ee9a06e45e09296dd832115dab128ecf2f";
const BASE_COMMIT = PHASE1_CORRECTION_BASE_COMMIT;
const BASE_TREE = "d0e065dfc0996358ca6959a32d16db13ffc54f23";
const PROTECTED_PATH = ".claude/handoffs/one-box-operating-environment-next-phase.md";
const PROTECTED_SHA = "cbbc878aa0691f333b128a71aee43adde89a9691a9ed65880f1f2b41a20643a6";
const PACKAGE_SHA = "c1feab7cc337c89a59d344da2854764b488a831bf40ab6e98d00338a5a7d421e";
const LOCK_SHA = "b2f15e1f27c86ad1c2b98a67674367ce8ada5fb9ba6d32702f9de4bd09a66191";
const OWNER_CONTRACT_SHA = "493ab13797f3eb2e82d3a4fa29fd6b91459fe17292cacdcd22340b8bfc424493";
const GOVERNANCE_ALLOWLIST_PATH = "/Users/zero-suminc./.claude/goal-state/obx-p180-t03-t05-offline-wave/censuses/phase1-audit-correction-governance-allowlist.txt";
const GOVERNANCE_ALLOWLIST_SHA = "0af61f92ce66079020344186bb88d5fcb61d600c327e213665e0df5ac1b0d39d";
const T03_RECORD_PATH = "docs/governance/risk-exceptions/2026-09-01-obx-p180-t03-audit-correction-solo.json";
const T04_RECORD_PATH = "docs/governance/risk-exceptions/2026-09-01-obx-p180-t04-audit-correction-solo.json";
const GOVERNANCE_PATHS = [
  T03_RECORD_PATH,
  T04_RECORD_PATH,
  CORRECTION_REPIN_PATH,
  SECURITY_PATH,
  "scripts/verify-p180-phase1-correction-authorization.mjs",
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
  "scripts/verify-obx-p180-source-adoption.mjs",
  "docs/research/source-catalog/adoption-ledger.json",
  REGISTRY_PATH,
  AUTHORITY_MANIFEST_PATH,
].sort();
const SECURITY_TARGET_PATHS = [
  T03_RECORD_PATH,
  T04_RECORD_PATH,
  AUTHORITY_MANIFEST_PATH,
  SOURCE_ADOPTION_REPIN_PATH,
  CORRECTION_REPIN_PATH,
  "scripts/verify-p180-phase1-correction-authorization.mjs",
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
  "scripts/verify-obx-p180-source-adoption.mjs",
  "docs/research/source-catalog/adoption-ledger.json",
  REGISTRY_PATH,
].sort();
const ACTIVATION_PATHS = [
  "docs/audits/evidence/goal/2026-09-01-obx-p180-t03-audit-correction-activation-receipt.json",
  "docs/audits/evidence/goal/2026-09-01-obx-p180-t04-audit-correction-activation-receipt.json",
];
const COMPLETION_PATHS = [
  "docs/audits/evidence/goal/2026-09-01-obx-p180-t03-audit-correction-completion-receipt.json",
  "docs/audits/evidence/goal/2026-09-01-obx-p180-t04-audit-correction-completion-receipt.json",
];
const RECORD_KEYS = [
  "schemaVersion", "id", "recordKind", "status", "implementationAuthorized",
  "activationRequired", "projectId", "branch", "baseCommit", "baseTree", "ticketId",
  "laneId", "ownerActorId", "riskOwnerActorId", "controllerActorId", "claimantActorId",
  "goalRunId", "useLimit", "reservation", "ownerDirectionBinding",
  "originalAuthorizationBinding", "predecessorBinding", "auditTrigger", "allowedPaths",
  "allowedEffects", "requiredCorrections", "forbiddenEffects", "siblingConcurrency",
  "soloRoleRisk", "activationProtocol", "proofProtocol", "completionEvidence",
  "reviewProtocol", "securityReviewPath", "invalidators", "recordedAt", "notBefore",
  "expiresAt", "exactDurationMilliseconds", "renewable", "authorizationHash",
];
const ACTIVATION_KEYS = [
  "schemaVersion", "receiptId", "receiptKind", "status", "authorizationId",
  "authorizationHash", "ticketId", "laneId", "governanceCommit", "governanceTree",
  "predecessorCommit", "predecessorTree", "pairedAuthorizationId",
  "pairedAuthorizationHash", "observedAt", "expiresAt", "selfHash",
];
const COMPLETION_KEYS = [
  "schemaVersion", "receiptId", "receiptKind", "status", "authorizationId",
  "authorizationHash", "ticketId", "laneId", "activationBinding", "implementation",
  "integratedTarget", "originalCompletionBinding", "leaseReleases", "proofBinding", "reviewBinding", "completedAt", "selfHash",
];
const REVIEW_BINDING_KEYS = ["reviewId", "path", "algorithm", "digest", "selfHash"];
const REVIEW_RECEIPT_KEYS = [
  "schemaVersion", "reviewId", "receiptKind", "laneId", "reviewerActorId", "status",
  "model", "provider", "target", "sourceEvidence", "checks", "findings", "reviewedAt", "selfHash",
];
const REVIEW_TARGET_KEYS = ["commit", "tree", "combinedTargetFilesSha256"];
const REVIEW_SOURCE_KEYS = ["path", "algorithm", "digest"];
const POST_IMPLEMENTATION_REVIEWS = [
  {
    reviewId: "OBX-P180-T03-AUDIT-CORRECTION-GLM-R2",
    path: "review-receipts/phase1-correction-t03-glm-r2.json",
    receiptKind: "phase1-correction-glm-quick-audit-receipt-v1",
    laneId: "T03",
    reviewerActorId: "model:z-ai-glm-5.3-flash:openrouter-z-ai-fp8",
    status: "GREEN",
    model: "z-ai/glm-5.3-flash",
    provider: "openrouter:z-ai/fp8:Z.AI",
    evidencePaths: [
      "model-receipts/phase1-correction-t03-glm-r2/packet.json",
      "model-receipts/phase1-correction-t03-glm-r2/receipt.json",
      "model-receipts/phase1-correction-t03-glm-r2/audit.parsed.json",
    ],
    checks: ["identity", "target", "findings-disposition", "sanitized-packet"],
    evidenceKind: "glm",
  },
  {
    reviewId: "OBX-P180-T04-AUDIT-CORRECTION-GLM-R2",
    path: "review-receipts/phase1-correction-t04-glm-r2.json",
    receiptKind: "phase1-correction-glm-quick-audit-receipt-v1",
    laneId: "T04",
    reviewerActorId: "model:z-ai/glm-5.3-flash:openrouter-z-ai-fp8",
    status: "GREEN",
    model: "z-ai/glm-5.3-flash",
    provider: "openrouter:z-ai/fp8:Z.AI",
    evidencePaths: [
      "model-receipts/phase1-correction-t04-glm-r2/packet.json",
      "model-receipts/phase1-correction-t04-glm-r2/receipt.json",
      "model-receipts/phase1-correction-t04-glm-r2/audit.parsed.json",
    ],
    checks: ["identity", "target", "findings-disposition", "sanitized-packet"],
    evidenceKind: "glm",
  },
  {
    reviewId: "OBX-P180-PHASE1-AUDIT-CORRECTION-OPUS-R1",
    path: "review-receipts/phase1-correction-opus-r1.json",
    receiptKind: "phase1-correction-opus-source-review-receipt-v1",
    laneId: "INTEGRATED",
    reviewerActorId: "model:claude-opus-5:claude-max-oauth",
    status: "GREEN",
    model: "claude-opus-5",
    provider: "claude-max-oauth:firstParty",
    evidencePaths: [
      "model-receipts/phase1-correction-opus-r1/receipt.json",
      "model-receipts/phase1-correction-opus-r1/audit.parsed.json",
      "model-receipts/phase1-correction-opus-r1/response.raw.json",
    ],
    checks: ["identity", "target", "source-review", "permission-denials", "findings-disposition"],
    evidenceKind: "opus",
  },
  {
    reviewId: "OBX-P180-PHASE1-AUDIT-CORRECTION-SECURITY-FINAL",
    path: "review-receipts/phase1-correction-security-final.json",
    receiptKind: "phase1-correction-independent-security-receipt-v1",
    laneId: "INTEGRATED",
    reviewerActorId: "agent:codex-gpt-5.6-sol-ultra:phase1-correction-post-security",
    status: "PASS",
    model: "gpt-5.6-sol:ultra",
    provider: "codex-subagent",
    evidencePaths: ["reports/phase1-correction-security-final.md"],
    checks: ["changed-paths", "canonical-surfaces", "gitleaks", "imports-effects", "untrusted-inputs", "exports", "persistence-runtime-wiring", "dependency-drift", "forbidden-effects"],
    evidenceKind: "independent",
  },
  {
    reviewId: "OBX-P180-PHASE1-AUDIT-CORRECTION-FACT-FINAL",
    path: "review-receipts/phase1-correction-fact-final.json",
    receiptKind: "phase1-correction-independent-fact-receipt-v1",
    laneId: "INTEGRATED",
    reviewerActorId: "agent:codex-gpt-5.6-sol-ultra:phase1-correction-post-fact",
    status: "PASS",
    model: "gpt-5.6-sol:ultra",
    provider: "codex-subagent",
    evidencePaths: ["reports/phase1-correction-fact-final.md"],
    checks: ["commit-tree-branch-base", "path-list", "file-hashes", "dependency-digests", "test-totals-exit-codes", "model-provider-identities", "route-pins", "review-targets", "completion-claims", "source-adoption"],
    evidenceKind: "independent",
  },
];
const LEASE_RELEASE_KEYS = [
  "laneId", "claimantActorId", "taskStatus", "terminalReportPath", "terminalReportSha256", "releasedAt",
];
const TERMINAL_REPORT_KEYS = [
  "schemaVersion", "reportKind", "laneId", "claimantActorId", "taskStatus", "leasedPaths",
  "editsStopped", "stagedOrCommitted", "terminalSummary", "releasedAt", "selfHash",
];
const PROOF_TUPLE_KEYS = [
  "sequence", "laneId", "commandId", "authorizationId", "authorizationHash",
  "startedAt", "finishedAt", "exitCode", "executionCommit", "executionTree",
  "implementationCommit", "implementationTree", "orderedFileListSha256", "commandSpec",
  "commandSpecSha256", "outputPath", "outputSha256", "envelopePath", "envelopeSha256",
  "previousDigest", "entryDigest",
];
const PROOF_BINDING_KEYS = [
  "registryPath", "algorithm", "registrySha256", "entryCount", "headDigest", "tuples",
];
const PROOF_ENVELOPE_KEYS = [
  "schemaVersion", "proofKind", "laneId", "commandId", "authorizationId",
  "authorizationHash", "startedAt", "finishedAt", "exitCode", "executionCommit",
  "executionTree", "implementationCommit", "implementationTree", "orderedFileListSha256",
  "commandSpec", "commandSpecSha256", "outputPath", "outputSha256",
];
const SECURITY_REVIEW_KEYS = [
  "schemaVersion", "reviewId", "reviewKind", "status", "reviewerActorId", "reviewedAt",
  "authorizationBindings", "targetHashes", "coverage", "findings", "deniedAuthority", "selfHash",
];
const SECURITY_COVERAGE = [
  ["authorization", "PASS"],
  ["original-consumed-history", "PASS"],
  ["historical-source-adoption-repin-preservation", "PASS"],
  ["fresh-owner-directed-authority-repin", "PASS"],
  ["exact-path-and-effect-scope", "PASS"],
  ["one-use-nonrenewable-window", "PASS"],
  ["audit-finding-binding", "PASS"],
  ["sibling-disjointness", "PASS"],
  ["activation-topology", "PASS"],
  ["target-bound-proof-v2", "PASS"],
  ["dependency-and-lockfile-boundary", "PASS"],
  ["secrets-and-credentials", "PASS"],
  ["provider-network-runtime-effects", "NONE"],
  ["t05-through-t08-authority", "NONE"],
  ["protected-handoff-content", "NOT_APPLICABLE"],
  ["model-review-authority", "NONE"],
];
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const CONFIG = {
  T03: {
    id: T03_CORRECTION_AUTHORIZATION_ID,
    hash: "ee2cd288385106690bf088e0a7c9e90192a7cb49ba8fa9db03ebb7f088198976",
    path: T03_RECORD_PATH,
    fileSha: "4cef2ba9b5e97b8a1da94243edf9b5ae9672536b7db5fd116e2aeacbec46d249",
    ticketId: "OBX-P180-T03",
    claimant: "agent:codex-gpt-5.6-sol-ultra:obx-p180-t03-audit-correction",
    originalId: "OBX-AUTH-P180-T03-SOLO-001",
    originalHash: "9600f44942637d0f71be82f697b352620fcc5de8aac0151259ff55e0692d058e",
    originalActivationPath: "docs/audits/evidence/goal/2026-08-31-obx-p180-t03-activation-receipt.json",
    originalActivationHash: "3718a4f923a157fcaee59ab884711b274c5bc597d36ab5488a3d97fbe35a780f",
    originalCompletionPath: "docs/audits/evidence/goal/2026-08-31-obx-p180-t03-completion-receipt.json",
    originalCompletionHash: "b3b36beaceec58e5e8cb285ef113324a7e75a44c35f936032692c126e618fefc",
    auditDir: "phase1-t03-glm",
    auditReceiptSha: "0dcc95c0ed9fab69e88a5d5946cdd7cf0d3ffb23a51d38e0a3a72ba5f43b28f3",
    auditSha: "1237aed4d521c990f15c7a1238616b7514061628bed949d82acf5cd62ea59ac5",
    packetSha: "e39a57067989c3c027484844aa86466d161ad0f8ad1fef0e1674337599a3c028",
    acceptedFull: ["F-01", "F-02"],
    acceptedPartial: [],
    rejected: ["F-03"],
    acceptedScopes: [
      { id: "F-01", acceptedScopes: ["target-bind-proof-envelopes-and-required-output-bytes"], rejectedScopes: [] },
      { id: "F-02", acceptedScopes: ["reject-unverifiable-non-null-skill-invocation-receipt-linkage"], rejectedScopes: [] },
    ],
    dispositions: [
      { id: "F-01", severity: "high", disposition: "accepted-correction-required" },
      { id: "F-02", severity: "medium", disposition: "accepted-correction-required" },
      { id: "F-03", severity: "medium", disposition: "not-reproduced-already-proven" },
      { id: "F-04", severity: "low", disposition: "informational-no-authority" },
      { id: "F-05", severity: "info", disposition: "deferred-to-source-aware-review" },
    ],
    paths: [
      "src/lib/operatingEnvironment/receipts.ts",
      "src/lib/operatingEnvironment/receipts.test.ts",
    ],
    runtimePaths: [
      "src/lib/operatingEnvironment/skills.ts",
      "src/lib/operatingEnvironment/context.ts",
      "src/lib/operatingEnvironment/interrupts.ts",
      "src/lib/operatingEnvironment/receipts.ts",
    ],
    allowedRuntimeCapabilityFingerprints: [
      "module-import:./canonical",
      "module-import:./contracts",
      "module-import:./interrupts",
      "module-import:./reasonCodes",
      "module-import:node:util/types",
      "package-import:node:util/types:{ isProxy }",
      "date-member:parse",
      "date-new:explicit-single-value",
    ],
    effect: "add-provider-offline-skill-context-interrupt-receipt-reducers",
    corrections: [
      "reject-non-null-skill-invocation-receipt-hash-until-schema-valid-route-bundle-linkage-exists",
      "bind-correction-proof-envelopes-to-execution-and-implementation-targets-command-specs-and-required-output-bytes",
    ],
    activationPath: ACTIVATION_PATHS[0],
    completionPath: COMPLETION_PATHS[0],
    focusedCommand: "t03-correction-focused",
  },
  T04: {
    id: T04_CORRECTION_AUTHORIZATION_ID,
    hash: "4340f8891a542ac9443a6a260a9a2095e8a4079d2383a6b52c2f9dd64e0b7ec8",
    path: T04_RECORD_PATH,
    fileSha: "2f264c3bf3b3d1f02cbc66e63af7a72e27447a6b0c45fb9b2c07eb24e2cdea2e",
    ticketId: "OBX-P180-T04",
    claimant: "agent:codex-gpt-5.6-sol-ultra:obx-p180-t04-audit-correction",
    originalId: "OBX-AUTH-P180-T04-SOLO-001",
    originalHash: "4c3a89055f239905e0939bcb5be3f60fce971bf19c477075f31cbc5fc75a3557",
    originalActivationPath: "docs/audits/evidence/goal/2026-08-31-obx-p180-t04-activation-receipt.json",
    originalActivationHash: "5659db17437a5cfe9d61f06938628760304bb828b8df84f2ce43d51c6026a23a",
    originalCompletionPath: "docs/audits/evidence/goal/2026-08-31-obx-p180-t04-completion-receipt.json",
    originalCompletionHash: "f481f720dcef0df91705cdcc197c2e4992ca69cbc0b58b8c09295638457df812",
    auditDir: "phase1-t04-glm",
    auditReceiptSha: "374028581c6e684490659e4c43171914b4a99816a1cb036c0652fd68d666d7d8",
    auditSha: "acdcf32f7a770064553c0a08b81defc4ee32f27a939d7c4f3fee1a6edd76d075",
    packetSha: "8a6145c7ca93086a2bd2e02230075ece050cc0db75a8c44407a04e02b4ebec21",
    acceptedFull: ["F2"],
    acceptedPartial: ["F1", "F3"],
    rejected: ["F4"],
    acceptedScopes: [
      { id: "F1", acceptedScopes: ["capacity-guard-reservation-hash-coherence"], rejectedScopes: ["scope-revision-defect-not-reproduced"] },
      { id: "F2", acceptedScopes: ["compare-balance-policy-ceiling-and-reservation-stock-coherence"], rejectedScopes: [] },
      { id: "F3", acceptedScopes: ["same-priority-weighted-multi-project-fair-ordering-proof", "route-policy-hash-mutation-rejection-proof"], rejectedScopes: ["active-turn-protection-gap-not-reproduced", "fair-share-exhaustion-denial-outside-contract"] },
    ],
    dispositions: [
      { id: "F1", severity: "high", disposition: "accepted-reservation-hash-only-scope-revisions-already-correct" },
      { id: "F2", severity: "medium", disposition: "accepted-correction-required" },
      { id: "F3", severity: "high", disposition: "accepted-weighted-fairness-and-route-drift-only-active-turn-already-proven" },
      { id: "F4", severity: "medium", disposition: "not-reproduced-counts-exact-seven" },
      { id: "F5", severity: "low", disposition: "informational-no-authority" },
      { id: "F6", severity: "info", disposition: "deferred-to-source-aware-review" },
    ],
    paths: [
      "src/lib/operatingEnvironment/budget.test.ts",
      "src/lib/operatingEnvironment/capacity.test.ts",
      "src/lib/operatingEnvironment/compare.test.ts",
      "src/lib/operatingEnvironment/fixtures/budget-capacity-v1.json",
    ],
    runtimePaths: [
      "src/lib/operatingEnvironment/budget.ts",
      "src/lib/operatingEnvironment/capacity.ts",
      "src/lib/operatingEnvironment/compare.ts",
    ],
    allowedRuntimeCapabilityFingerprints: [
      "module-import:./canonical",
      "module-import:./contracts",
      "module-import:./reasonCodes",
    ],
    effect: "add-provider-offline-in-memory-budget-capacity-compare-reducers",
    corrections: [
      "bind-capacity-guard-to-live-budget-reservation-hash-revision-and-eight-scope-revisions",
      "derive-compare-balance-limits-and-stock-from-the-admitted-eight-scope-aggregate-reservation",
      "prove-same-priority-weighted-multi-project-fair-ordering",
      "prove-route-policy-hash-mutation-rejection",
    ],
    activationPath: ACTIVATION_PATHS[1],
    completionPath: COMPLETION_PATHS[1],
    focusedCommand: "t04-correction-focused",
  },
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const BOUND_BRANCH = "feat/obx-p180-t03-t05-offline-wave-recovery";
const REDIRECTING_GIT_ENV_KEYS = [
  "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_SYSTEM", "GIT_CONFIG_GLOBAL", "GIT_NAMESPACE",
];
const exact = (actual, expected, label, failures) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${label}: exact value drift`);
};
function safeFile(root, path, label, failures) {
  if (typeof path !== "string" || path.startsWith("/") || normalize(path).startsWith("..")) {
    failures.push(`${label}: invalid repository-relative path`); return null;
  }
  const absolute = resolve(root, path);
  try {
    const stat = lstatSync(absolute); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("regular nonsymlinked file required");
    if (relative(root, realpathSync(absolute)).startsWith("..")) throw new Error("path escapes repository");
    return absolute;
  } catch (error) { failures.push(`${label}: unsafe ${path} (${error.message})`); return null; }
}
function safeExternal(path, expectedRoot, label, failures) {
  try {
    const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("regular nonsymlinked file required");
    const real = realpathSync(path); if (relative(realpathSync(expectedRoot), real).startsWith("..")) throw new Error("path escapes goal state");
    if ((stat.mode & 0o777) !== 0o600) throw new Error("mode 0600 required");
    if (process.getuid && stat.uid !== process.getuid()) throw new Error("owner match required");
    return real;
  } catch (error) { failures.push(`${label}: unsafe ${path} (${error.message})`); return null; }
}
function readJson(path, label, failures) {
  try { const value = JSON.parse(readFileSync(path, "utf8")); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required"); return value; }
  catch (error) { failures.push(`${label}: invalid JSON (${error.message})`); return null; }
}
function selfHash(value, field, expected, label, failures) {
  const envelope = value?.[field];
  exact(Object.keys(envelope ?? {}).sort(), ["algorithm", "canonicalization", "excludedJsonPointers", "digest"].sort(), `${label}.${field} envelope keys`, failures);
  exact(envelope, {
    algorithm: "sha256",
    canonicalization: "canonical-json-v1",
    excludedJsonPointers: [`/${field}/digest`],
    digest: expected,
  }, `${label}.${field} envelope`, failures);
  if (!envelope || envelope.digest !== expected) { failures.push(`${label}: declared self-hash drift`); return; }
  const copy = structuredClone(value); delete copy[field].digest;
  if (sha(canonical(copy)) !== expected) failures.push(`${label}: computed self-hash drift`);
}
export function correctionHashEnvelopeFailures(value, field, expected) {
  const failures = [];
  selfHash(value, field, expected, "correction hash fixture", failures);
  return failures;
}
export function correctionTimestampEpoch(value) {
  if (!TIME.test(value ?? "")) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? epoch : null;
}
export function correctionCompletionChronologyFailures({ mode, evaluationTime, commitEpoch, completedAt, expiresAt }) {
  const failures = [];
  const completedEpoch = correctionTimestampEpoch(completedAt);
  const expiresEpoch = correctionTimestampEpoch(expiresAt);
  if (!Number.isFinite(commitEpoch) || completedEpoch === null || expiresEpoch === null
    || commitEpoch < completedEpoch || commitEpoch >= expiresEpoch) failures.push("completion commit must durably postdate completion and predate expiry");
  if (mode === "completion" && (!Number.isFinite(evaluationTime) || evaluationTime >= expiresEpoch)) failures.push("authorization expired before completion acceptance");
  return failures;
}
export function correctionCommitOrderingFailures({ releasedAt, t03CommitEpoch, t04CommitEpoch, completionCommitEpoch }) {
  const releaseEpochs = (releasedAt ?? []).map(correctionTimestampEpoch);
  const failures = [];
  if (releaseEpochs.length !== 2 || releaseEpochs.some((epoch) => epoch === null)
    || ![t03CommitEpoch, t04CommitEpoch, completionCommitEpoch].every(Number.isFinite)) {
    failures.push("implementation commit ordering requires two canonical releases and three commit epochs");
    return failures;
  }
  const releaseFloor = Math.max(...releaseEpochs);
  if (releaseFloor > t03CommitEpoch || t03CommitEpoch > t04CommitEpoch || t04CommitEpoch >= completionCommitEpoch) {
    failures.push("both leases must release before ordered T03/T04 commits and the later completion commit");
  }
  return failures;
}
export function correctionProofEpochFailures({ startedAt, finishedAt, releaseFloor, laneNotBefore, laneExpiresAt, completedAt, executionCommitEpoch }) {
  if (![startedAt, finishedAt, releaseFloor, laneNotBefore, laneExpiresAt, completedAt, executionCommitEpoch].every(Number.isFinite)
    || startedAt < laneNotBefore || startedAt < releaseFloor || startedAt < executionCommitEpoch
    || startedAt > finishedAt || finishedAt > completedAt || finishedAt >= laneExpiresAt) {
    return ["proof command must run after lease release and execution commit within the completion interval"];
  }
  return [];
}
export function correctionReviewBindingShapeFailures(binding) {
  const failures = [];
  exact(binding?.map((row) => row.reviewId), POST_IMPLEMENTATION_REVIEWS.map((row) => row.reviewId), "correction review binding ids", failures);
  for (const [index, config] of POST_IMPLEMENTATION_REVIEWS.entries()) {
    const row = binding?.[index];
    exact(Object.keys(row ?? {}).sort(), [...REVIEW_BINDING_KEYS].sort(), `correction review binding[${index}] keys`, failures);
    exact([row?.reviewId, row?.path, row?.algorithm], [config.reviewId, config.path, "sha256"], `correction review binding[${index}] identity`, failures);
    if (!SHA.test(row?.digest ?? "") || !SHA.test(row?.selfHash ?? "")) failures.push(`correction review binding[${index}]: SHA-256 bindings required`);
  }
  return failures;
}
function sanitizedGitEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return env;
}
function spawnGit(root, args, options = {}) {
  return spawnSync("git", ["--no-replace-objects", ...args], { ...options, cwd: root, env: sanitizedGitEnvironment() });
}
export function gitEnvironmentRedirectFailures(env = process.env) {
  const present = REDIRECTING_GIT_ENV_KEYS.filter((key) => Object.hasOwn(env, key));
  return present.length ? [`redirecting Git environment forbidden: ${present.join(",")}`] : [];
}
function git(root, args, label, failures) {
  const result = spawnGit(root, args, { encoding: "utf8" });
  if (result.status !== 0) { failures.push(`${label}: git ${args.join(" ")} failed`); return null; }
  return result.stdout.trim();
}
function validateGitRepositoryIntegrity(root, failures) {
  const topLevel = git(root, ["rev-parse", "--show-toplevel"], "correction repository top level", failures);
  try {
    exact(topLevel ? realpathSync(topLevel) : null, root, "correction repository top level binding", failures);
  } catch (error) { failures.push(`correction repository top level binding: unsafe path (${error.message})`); }
  exact(git(root, ["replace", "-l"], "correction replace refs", failures), "", "correction replace refs must be empty", failures);
  exact(git(root, ["rev-parse", "--is-shallow-repository"], "correction shallow state", failures), "false", "correction repository must have complete history", failures);
  const graftPath = git(root, ["rev-parse", "--git-path", "info/grafts"], "correction graft path", failures);
  if (graftPath && existsSync(resolve(root, graftPath))) failures.push("correction legacy graft file forbidden");
}
function scopedUntrackedPaths(root, label, failures) {
  const rows = git(root, ["ls-files", "--others"], label, failures)?.split("\n").filter(Boolean).sort() ?? [];
  return rows.filter((path) => !(path === "node_modules" || path === "next-env.d.ts"
    || path === "tsconfig.tsbuildinfo" || path.startsWith(".next/")));
}
function validateUnmaskedIndex(root, failures) {
  for (const option of ["-v", "-f"]) {
    const rows = git(root, ["ls-files", option], `correction index flags ${option}`, failures)?.split("\n").filter(Boolean) ?? [];
    const masked = rows.filter((row) => !row.startsWith("H "));
    if (masked.length) failures.push(`correction masked or nonordinary index entries forbidden (${option}): ${masked.map((row) => row.slice(2)).join(",")}`);
  }
  exact(git(root, ["ls-files", "-u"], "correction unmerged index", failures), "", "correction unmerged index must be empty", failures);
}
export function gitRepositoryIntegrityFailures({ repoRoot, env = process.env }) {
  const root = realpathSync(repoRoot); const failures = [...gitEnvironmentRedirectFailures(env)];
  validateGitRepositoryIntegrity(root, failures);
  validateUnmaskedIndex(root, failures);
  return failures;
}
function commitInfo(root, commit, label, failures) {
  if (!COMMIT.test(commit ?? "")) { failures.push(`${label}: commit required`); return null; }
  const tree = git(root, ["rev-parse", `${commit}^{tree}`], label, failures);
  const line = git(root, ["rev-list", "--parents", "-n", "1", commit], label, failures);
  if (!tree || !line) return null;
  const parents = line.split(/\s+/).slice(1);
  const paths = parents.length === 1 ? (git(root, ["diff", "--name-only", `${parents[0]}..${commit}`], label, failures)?.split("\n").filter(Boolean).sort() ?? []) : [];
  return { tree, parents, paths };
}
function requireRegularBlobEntries(root, commit, paths, label, failures) {
  for (const path of paths) {
    const entry = git(root, ["ls-tree", commit, "--", path], `${label} ${path}`, failures);
    const [metadata = "", entryPath = ""] = (entry ?? "").split("\t");
    const [mode = "", type = ""] = metadata.split(/\s+/);
    exact([mode, type, entryPath], ["100644", "blob", path], `${label}: regular 100644 blob required ${path}`, failures);
  }
}
export function regularImplementationPathFailures({ repoRoot, commit, paths }) {
  const root = realpathSync(repoRoot); const failures = [];
  for (const path of paths) safeFile(root, path, "authorized implementation path", failures);
  requireRegularBlobEntries(root, commit, paths, "authorized implementation commit", failures);
  return failures;
}
function validateBoundBranch(root, failures) {
  const branch = git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], "correction bound branch", failures);
  exact(branch, BOUND_BRANCH, "correction repository branch binding", failures);
}
function requireCommittedReceiptBytes(root, commit, paths, label, failures) {
  for (const path of paths) {
    const result = spawnGit(root, ["show", `${commit}:${path}`], { encoding: null });
    const current = safeFile(root, path, `${label} ${path}`, failures);
    if (result.status !== 0 || !current || !readFileSync(current).equals(result.stdout)) failures.push(`${label}: committed receipt byte drift ${path}`);
  }
  const dirty = git(root, ["diff", "HEAD", "--name-only", "--", ...paths], `${label} tracked state`, failures)?.split("\n").filter(Boolean) ?? [];
  exact(dirty, [], `${label} clean tracked receipt state`, failures);
}
function validateAudit(config, record, failures) {
  const goalRoot = record.proofProtocol.goalStateRoot;
  const directory = resolve(goalRoot, "model-receipts", config.auditDir);
  const paths = {
    receipt: resolve(directory, "receipt.json"),
    audit: resolve(directory, "audit.parsed.json"),
    packet: resolve(directory, "packet.json"),
  };
  const safePaths = Object.fromEntries(Object.entries(paths).map(([label, path]) => [label, safeExternal(path, goalRoot, `${config.id}.${label}`, failures)]));
  exact([record.auditTrigger.receiptPath, record.auditTrigger.auditPath], [paths.receipt, paths.audit], `${config.id}.audit paths`, failures);
  if (Object.values(safePaths).some((path) => !path)) return;
  exact([sha(readFileSync(safePaths.receipt)), sha(readFileSync(safePaths.audit)), sha(readFileSync(safePaths.packet))], [config.auditReceiptSha, config.auditSha, config.packetSha], `${config.id}.audit bytes`, failures);
  const receipt = readJson(safePaths.receipt, `${config.id}.auditReceipt`, failures);
  const audit = readJson(safePaths.audit, `${config.id}.audit`, failures);
  exact([receipt?.requestedModel, receipt?.providerReportedModel, receipt?.providerReportedIdentity, receipt?.endpointPreflightTag, receipt?.verdict], ["z-ai/glm-5.3-flash", "z-ai/glm-5.3-flash", "Z.AI", "z-ai/fp8", "REVISE"], `${config.id}.audit identity`, failures);
  exact([record.auditTrigger.receiptSha256, record.auditTrigger.auditSha256, record.auditTrigger.packetSha256, record.auditTrigger.verdict], [config.auditReceiptSha, config.auditSha, config.packetSha, "REVISE"], `${config.id}.audit binding`, failures);
  exact(record.auditTrigger.fullyAcceptedFindingIds, config.acceptedFull, `${config.id}.fully accepted findings`, failures);
  exact(record.auditTrigger.partiallyAcceptedFindingIds, config.acceptedPartial, `${config.id}.partially accepted findings`, failures);
  exact(record.auditTrigger.rejectedFindingIds, config.rejected, `${config.id}.rejected findings`, failures);
  exact(record.auditTrigger.acceptedFindingScopes, config.acceptedScopes, `${config.id}.accepted finding scopes`, failures);
  exact(record.auditTrigger.findingDispositions, config.dispositions, `${config.id}.finding dispositions`, failures);
  exact(audit?.verdict, "REVISE", `${config.id}.audit verdict`, failures);
  const ids = audit?.findings?.map((finding) => finding.id) ?? [];
  for (const id of [...config.acceptedFull, ...config.acceptedPartial, ...config.rejected]) if (!ids.includes(id)) failures.push(`${config.id}: bound audit finding missing ${id}`);
  failures.push(...verifyAuditFindingDispositions(audit, config.dispositions).map((failure) => `${config.id}.${failure}`));
}
export function verifyAuditFindingDispositions(audit, dispositions) {
  const failures = [];
  const findings = Array.isArray(audit?.findings) ? audit.findings : [];
  const auditSeverityById = new Map(findings.map((finding) => [finding.id, finding.severity]));
  if (auditSeverityById.size !== findings.length) failures.push("audit finding ids must be unique");
  for (const disposition of dispositions ?? []) {
    if (!auditSeverityById.has(disposition.id)) failures.push(`audit finding missing ${disposition.id}`);
    else if (disposition.severity !== auditSeverityById.get(disposition.id)) failures.push(`audit finding severity ${disposition.id}: exact value drift`);
  }
  return failures;
}
function validateRecord(root, registry, lane, failures) {
  const config = CONFIG[lane];
  const reference = registry?.authorizations?.find((row) => row.id === config.id);
  exact(Object.keys(reference ?? {}).sort(), ["algorithm", "digest", "id", "path", "recordKind"].sort(), `${config.id}.registry reference keys`, failures);
  exact(reference, { id: config.id, recordKind: "owner-solo-finding-bound-correction-reference-v1", path: config.path, algorithm: "sha256", digest: config.fileSha }, `${config.id}.registry reference`, failures);
  const path = safeFile(root, config.path, config.id, failures); if (!path) return null;
  if (sha(readFileSync(path)) !== config.fileSha) failures.push(`${config.id}: record file hash drift`);
  const record = readJson(path, config.id, failures); if (!record) return null;
  exact(Object.keys(record).sort(), [...RECORD_KEYS].sort(), `${config.id}.keys`, failures);
  exact([
    record.schemaVersion, record.id, record.recordKind, record.status, record.implementationAuthorized,
    record.activationRequired, record.projectId, record.branch, record.baseCommit, record.baseTree,
    record.ticketId, record.laneId, record.ownerActorId, record.riskOwnerActorId,
    record.controllerActorId, record.claimantActorId, record.goalRunId, record.useLimit,
    record.exactDurationMilliseconds, record.renewable,
  ], [
    1, config.id, "owner-solo-finding-bound-correction-v1", "reserved-pending-activation", true,
    true, "one-box", BOUND_BRANCH, BASE_COMMIT, BASE_TREE,
    config.ticketId, lane, "person:devin-wiggins", "person:devin-wiggins",
    "agent:codex-gpt-5.6-sol-ultra:obx-p180-controller", config.claimant,
    "obx-p180-t03-t05-offline-wave", 1, 86_400_000, false,
  ], `${config.id}.identity`, failures);
  exact(record.reservation, { state: "RESERVED", transferable: false, replacementAllowed: false, rebaselineAllowed: false }, `${config.id}.reservation`, failures);
  exact(record.ownerDirectionBinding, { path: resolve(record.proofProtocol.goalStateRoot, "contract.md"), algorithm: "sha256", digest: OWNER_CONTRACT_SHA }, `${config.id}.owner contract`, failures);
  const contract = safeExternal(record.ownerDirectionBinding.path, record.proofProtocol.goalStateRoot, `${config.id}.owner contract`, failures);
  if (contract && sha(readFileSync(contract)) !== OWNER_CONTRACT_SHA) failures.push(`${config.id}: owner contract hash drift`);
  exact(record.originalAuthorizationBinding, {
    authorizationId: config.originalId, authorizationHash: config.originalHash, derivedState: "CONSUMED",
    activationReceiptPath: config.originalActivationPath, activationReceiptSelfHash: config.originalActivationHash,
    completionReceiptPath: config.originalCompletionPath, completionReceiptSelfHash: config.originalCompletionHash,
    renewed: false, reopened: false, replaced: false, reused: false,
  }, `${config.id}.original authorization`, failures);
  exact([record.predecessorBinding.integratedCommit, record.predecessorBinding.integratedTree, record.predecessorBinding.t02Status, record.predecessorBinding.t03Status, record.predecessorBinding.t04Status, record.predecessorBinding.grantsInheritedAuthority], [BASE_COMMIT, BASE_TREE, "COMPLETED_VERIFIED", "COMPLETED_VERIFIED_REVIEW_INVALIDATED", "COMPLETED_VERIFIED_REVIEW_INVALIDATED", false], `${config.id}.predecessor`, failures);
  exact(record.allowedPaths, config.paths, `${config.id}.allowedPaths`, failures);
  exact(record.allowedEffects, [config.effect], `${config.id}.allowedEffects`, failures);
  exact(record.requiredCorrections, config.corrections, `${config.id}.requiredCorrections`, failures);
  exact(record.securityReviewPath, SECURITY_PATH, `${config.id}.securityReviewPath`, failures);
  if (!Array.isArray(record.forbiddenEffects) || !record.forbiddenEffects.some((item) => item.includes("t05-through-t08"))) failures.push(`${config.id}: T05-T08 denial required`);
  if (!Array.isArray(record.invalidators) || !record.invalidators.includes("expiry-renewal-replacement-reopen-reuse-or-rebaseline")) failures.push(`${config.id}: reuse invalidator required`);
  const notBefore = correctionTimestampEpoch(record.notBefore); const expiresAt = correctionTimestampEpoch(record.expiresAt);
  if (notBefore === null || expiresAt === null || expiresAt - notBefore !== 86_400_000 || expiresAt > Date.parse("2026-09-15T02:05:00.000Z")) failures.push(`${config.id}: bounded non-extending interval required`);
  selfHash(record, "authorizationHash", config.hash, config.id, failures);
  validateAudit(config, record, failures);
  return record;
}
function validateSecurity(root, records, failures) {
  const path = safeFile(root, SECURITY_PATH, "correction security review", failures); if (!path) return;
  const review = readJson(path, "correction security review", failures); if (!review) return;
  exact(Object.keys(review).sort(), [...SECURITY_REVIEW_KEYS].sort(), "correction security keys", failures);
  exact([review.schemaVersion, review.reviewId, review.reviewKind, review.status], [1, "OBX-P180-PHASE1-AUDIT-CORRECTION-SECURITY-001", "phase1-audit-correction-security-review-v1", "PASS"], "correction security identity", failures);
  exact(review.reviewerActorId, "agent:codex-gpt-5.6-sol-ultra:phase1-correction-security-review", "correction security reviewer", failures);
  const reviewedAt = correctionTimestampEpoch(review.reviewedAt);
  if (reviewedAt === null || review.reviewedAt !== "2026-09-01T11:24:50.000Z" || Object.values(records).some((record) => reviewedAt < correctionTimestampEpoch(record.notBefore) || reviewedAt >= correctionTimestampEpoch(record.expiresAt))) failures.push("correction security review: canonical in-window reviewedAt required");
  exact(review.authorizationBindings, Object.values(CONFIG).map((config) => ({ authorizationId: config.id, authorizationHash: config.hash })), "correction security authorizations", failures);
  exact(review.targetHashes?.map((row) => row.path), SECURITY_TARGET_PATHS, "correction security exact targets", failures);
  for (const row of review.targetHashes ?? []) {
    exact(Object.keys(row).sort(), ["path", "algorithm", "digest"].sort(), "correction security target keys", failures);
    const target = safeFile(root, row.path, "correction security target", failures);
    if (!target) { failures.push(`correction security review: target drift ${row.path}`); continue; }
    if (row.path === AUTHORITY_MANIFEST_PATH) {
      const manifest = readJson(target, "correction security authority manifest", failures);
      if (!manifest || row.algorithm !== "sha256-canonical-json-without-packetDigest-v1") failures.push(`correction security review: target drift ${row.path}`);
      else if (correctionSecurityProjectionDigest("authority-manifest", manifest) !== row.digest) failures.push(`correction security review: target drift ${row.path}`);
    } else if (row.path === CORRECTION_REPIN_PATH) {
      const repin = readJson(target, "correction security fresh authority re-pin", failures);
      if (!repin || row.algorithm !== "sha256-canonical-json-without-currentAuthorityManifest-and-selfHashDigest-v1"
        || correctionSecurityProjectionDigest("fresh-authority-repin", repin) !== row.digest) failures.push(`correction security review: target drift ${row.path}`);
    } else if (row.algorithm !== "sha256" || sha(readFileSync(target)) !== row.digest) failures.push(`correction security review: target drift ${row.path}`);
  }
  exact(review.findings, [], "correction security findings", failures);
  exact(review.coverage?.map((row) => [row.surface, row.status]), SECURITY_COVERAGE, "correction security coverage", failures);
  if (!Array.isArray(review.coverage) || !review.coverage.every((row) => Object.keys(row).sort().join(",") === "disposition,status,surface" && typeof row.disposition === "string" && row.disposition.length >= 20)) failures.push("correction security review: coverage must close");
  exact(review.deniedAuthority, ["T05", "T06", "T07", "T08", "provider-or-network-runtime", "deployment-release-or-product-data-transfer"], "correction security denied authority", failures);
  selfHash(review, "selfHash", review.selfHash?.digest, "correction security review", failures);
  for (const record of records) if (record?.securityReviewPath !== SECURITY_PATH) failures.push(`${record?.id}: security path drift`);
}
export function correctionSecurityProjectionDigest(kind, value) {
  const projection = structuredClone(value);
  if (kind === "authority-manifest") delete projection.packetDigest;
  else if (kind === "source-adoption-repin") delete projection.currentAuthorityManifest;
  else if (kind === "fresh-authority-repin") { delete projection.currentAuthorityManifest; delete projection.selfHash.digest; }
  else throw new Error(`unsupported correction security projection ${kind}`);
  return sha(canonical(projection));
}
function validateSourceAdoptionRepin(root, failures) {
  const historicalPath = safeFile(root, SOURCE_ADOPTION_REPIN_PATH, "historical source-adoption re-pin", failures);
  const repinPath = safeFile(root, CORRECTION_REPIN_PATH, "phase1 correction authority re-pin", failures);
  const manifestPath = safeFile(root, AUTHORITY_MANIFEST_PATH, "correction authority manifest", failures);
  if (!historicalPath || !repinPath || !manifestPath) return;
  if (sha(readFileSync(historicalPath)) !== "79f9a17aabd90cc023a7a7db8be19388b84ad22212ee9e569236c7bf98fd939d") failures.push("historical source-adoption re-pin must remain byte-identical and consumed");
  const repin = readJson(repinPath, "phase1 correction authority re-pin", failures);
  const manifest = readJson(manifestPath, "correction authority manifest", failures);
  if (!repin || !manifest) return;
  exact(Object.keys(repin).sort(), [
    "schemaVersion", "reviewId", "recordKind", "status", "owner", "ownerDirectionBinding",
    "activationAllowlist", "historicalRepinBinding", "governanceWriteScope",
    "currentAuthorityManifest", "completionProtocol", "invariants", "recordedAt", "expiresAt", "selfHash",
  ].sort(), "phase1 correction authority re-pin keys", failures);
  exact([repin.schemaVersion, repin.reviewId, repin.recordKind, repin.status], [
    1, "OBX-P180-PHASE1-AUDIT-CORRECTION-AUTHORITY-REPIN-001",
    "owner-directed-phase1-correction-authority-repin-v1", "VERIFIED_PENDING_SINGLE_USE_GOVERNANCE_COMMIT",
  ], "phase1 correction authority re-pin identity", failures);
  exact(repin.owner, { actorId: "person:devin-wiggins", displayName: "Devin Wiggins", role: "repository-owner" }, "phase1 correction authority re-pin owner", failures);
  exact(repin.ownerDirectionBinding, {
    path: "/Users/zero-suminc./.claude/goal-state/obx-p180-t03-t05-offline-wave/contract.md",
    algorithm: "sha256", digest: OWNER_CONTRACT_SHA,
  }, "phase1 correction authority re-pin owner direction", failures);
  exact(repin.activationAllowlist, {
    path: GOVERNANCE_ALLOWLIST_PATH, algorithm: "sha256", digest: GOVERNANCE_ALLOWLIST_SHA,
    predecessorCommit: BASE_COMMIT, predecessorTree: BASE_TREE, authorizedPathCount: 12,
  }, "phase1 correction authority re-pin allowlist", failures);
  for (const [path, digest, label] of [
    [repin.ownerDirectionBinding.path, OWNER_CONTRACT_SHA, "owner direction"],
    [repin.activationAllowlist.path, GOVERNANCE_ALLOWLIST_SHA, "governance allowlist"],
  ]) {
    const external = safeExternal(path, "/Users/zero-suminc./.claude/goal-state/obx-p180-t03-t05-offline-wave", `phase1 correction re-pin ${label}`, failures);
    if (external && sha(readFileSync(external)) !== digest) failures.push(`phase1 correction re-pin ${label} hash drift`);
  }
  exact(repin.historicalRepinBinding, {
    path: SOURCE_ADOPTION_REPIN_PATH, algorithm: "sha256", digest: "79f9a17aabd90cc023a7a7db8be19388b84ad22212ee9e569236c7bf98fd939d",
    reviewId: "obx-p180-source-adoption-authority-repin-2026-08-31", reviewedAt: "2026-09-01T02:48:12.000Z",
    singleUse: true, consumed: true, reused: false,
  }, "phase1 correction historical re-pin binding", failures);
  exact(repin.governanceWriteScope, {
    exactPaths: GOVERNANCE_PATHS,
    allowedManifestJsonPointers: ["/packetDigest"],
    authorizedEffects: ["refresh-verifier-derived-authority-manifest-packet-digest", "record-fresh-owner-directed-phase1-correction-integrity-repin"],
    implementationAuthority: false, runtimeAuthority: false, providerAuthority: false,
    dependencyOrLockfileChangeAuthorized: false, activationOrCompletionReceiptChangeAuthorized: false,
    t05ThroughT08Authority: false,
  }, "phase1 correction governance write scope", failures);
  exact(repin.currentAuthorityManifest, {
    path: AUTHORITY_MANIFEST_PATH,
    packetDigest: manifest.packetDigest,
    sha256: sha(readFileSync(manifestPath)),
  }, "phase1 correction current manifest", failures);
  exact(repin.completionProtocol, {
    useLimit: 1, singleUse: true, renewable: false, replacementAllowed: false, rebaselineAllowed: false,
    deriveConsumedOnlyFromExactGovernanceCommitTopology: true, expectedParentCommit: BASE_COMMIT,
  }, "phase1 correction re-pin completion protocol", failures);
  exact(repin.invariants, {
    historicalReceiptRewritten: false, historicalSingleUseGrantReused: false,
    implementationAuthorized: false, authorityExpansion: false, runtimeOrDependencyChange: false,
    providerBackedProductRoute: false, persistenceBrowserCollaborationDeploymentRelease: false, pageIrMutation: false,
  }, "phase1 correction re-pin invariants", failures);
  const recordedAt = correctionTimestampEpoch(repin.recordedAt); const expiresAt = correctionTimestampEpoch(repin.expiresAt);
  if (recordedAt !== Date.parse("2026-09-01T11:24:30.000Z") || expiresAt !== Date.parse("2026-09-02T09:20:00.000Z") || recordedAt >= expiresAt) failures.push("phase1 correction re-pin chronology drift");
  selfHash(repin, "selfHash", repin.selfHash?.digest, "phase1 correction authority re-pin", failures);
}
function validateGovernanceState(root, failures) {
  validateUnmaskedIndex(root, failures);
  const head = git(root, ["rev-parse", "HEAD"], "governance HEAD", failures);
  const baseTree = git(root, ["rev-parse", `${BASE_COMMIT}^{tree}`], "governance base", failures);
  exact(baseTree, BASE_TREE, "governance base tree", failures);
  const cached = git(root, ["diff", "--cached", "--name-only"], "governance index", failures)?.split("\n").filter(Boolean).sort() ?? [];
  const worktree = git(root, ["diff", "--name-only"], "governance worktree", failures)?.split("\n").filter(Boolean).sort() ?? [];
  const untracked = scopedUntrackedPaths(root, "governance untracked", failures);
  const trackedDelta = [...new Set([...cached, ...worktree])].sort();
  const repositoryDelta = [...new Set([...trackedDelta, ...untracked.filter((path) => path !== PROTECTED_PATH)])].sort();
  if (head === BASE_COMMIT) exact(repositoryDelta, GOVERNANCE_PATHS, "precommit governance paths", failures);
  else {
    const info = commitInfo(root, head, "governance commit", failures);
    exact([info?.parents, info?.paths], [[BASE_COMMIT], GOVERNANCE_PATHS], "governance commit topology", failures);
    exact([cached, worktree], [[], []], "governance clean tracked state", failures);
  }
  if (head === BASE_COMMIT) {
    if (!untracked.includes(PROTECTED_PATH)) failures.push("governance protected handoff presence drift");
  } else {
    exact(untracked, [PROTECTED_PATH], "governance untracked paths", failures);
  }
  const protectedFile = safeFile(root, PROTECTED_PATH, "protected handoff", failures);
  if (protectedFile && sha(readFileSync(protectedFile)) !== PROTECTED_SHA) failures.push("protected handoff hash drift");
  if (sha(readFileSync(resolve(root, "package.json"))) !== PACKAGE_SHA || sha(readFileSync(resolve(root, "package-lock.json"))) !== LOCK_SHA) failures.push("dependency boundary drift");
  return head;
}
function validateActivationReceipt(root, lane, record, failures) {
  const config = CONFIG[lane];
  const path = safeFile(root, config.activationPath, `${config.id}.activation`, failures); if (!path) return null;
  const receipt = readJson(path, `${config.id}.activation`, failures); if (!receipt) return null;
  exact(Object.keys(receipt).sort(), [...ACTIVATION_KEYS].sort(), `${config.id}.activation keys`, failures);
  const sibling = CONFIG[lane === "T03" ? "T04" : "T03"];
  exact([
    receipt.schemaVersion, receipt.receiptId, receipt.receiptKind, receipt.status,
    receipt.authorizationId, receipt.authorizationHash, receipt.ticketId, receipt.laneId,
    receipt.predecessorCommit, receipt.predecessorTree, receipt.pairedAuthorizationId,
    receipt.pairedAuthorizationHash, receipt.expiresAt,
  ], [
    1, `${config.ticketId}-AUDIT-CORRECTION-ACTIVATION-001`, "owner-solo-finding-bound-correction-activation-v1", "ACTIVE",
    config.id, config.hash, config.ticketId, lane, BASE_COMMIT, BASE_TREE, sibling.id, sibling.hash, record.expiresAt,
  ], `${config.id}.activation identity`, failures);
  const observedAt = correctionTimestampEpoch(receipt.observedAt);
  if (!COMMIT.test(receipt.governanceCommit) || !COMMIT.test(receipt.governanceTree) || observedAt === null || !(correctionTimestampEpoch(record.notBefore) <= observedAt && observedAt < correctionTimestampEpoch(record.expiresAt))) failures.push(`${config.id}.activation: invalid target or time`);
  selfHash(receipt, "selfHash", receipt.selfHash?.digest, `${config.id}.activation`, failures);
  return receipt;
}
function activationCommit(root, governanceCommit, currentCommit, failures) {
  const governanceInfo = commitInfo(root, governanceCommit, "correction governance commit", failures);
  exact([governanceInfo?.parents, governanceInfo?.paths], [[BASE_COMMIT], GOVERNANCE_PATHS], "correction governance commit topology", failures);
  const rows = git(root, ["rev-list", "--parents", `${governanceCommit}..${currentCommit}`], "activation ancestry", failures)?.split("\n").filter(Boolean).map((row) => row.split(/\s+/)) ?? [];
  const candidates = rows.filter((parts) => parts.length === 2 && parts[1] === governanceCommit);
  if (candidates.length !== 1) { failures.push("correction activation: unique direct child required"); return null; }
  const commit = candidates[0][0]; const info = commitInfo(root, commit, "activation commit", failures);
  exact(info?.paths, [...ACTIVATION_PATHS].sort(), "activation commit paths", failures);
  return { commit, tree: info?.tree };
}
function validateActiveCommitTopology(root, activeCommit, currentCommit, failures) {
  if (!activeCommit || !currentCommit) return "INVALID";
  if (currentCommit === activeCommit) return "ACTIVATION";
  const rows = git(root, ["rev-list", "--reverse", "--parents", `${activeCommit}..${currentCommit}`], "active correction topology", failures)?.split("\n").filter(Boolean).map((row) => row.split(/\s+/)) ?? [];
  if (rows.length < 1 || rows.length > 2 || rows.some((row) => row.length !== 2)) {
    failures.push("active correction topology requires only exact linear T03 then T04 commits");
    return "INVALID";
  }
  const t03 = commitInfo(root, rows[0][0], "active correction T03 commit", failures);
  exact([rows[0][1], t03?.paths], [activeCommit, [...CONFIG.T03.paths].sort()], "active correction exact T03 commit", failures);
  requireRegularBlobEntries(root, rows[0][0], CONFIG.T03.paths, "active correction T03 commit", failures);
  if (rows.length === 1) return "T03_COMMITTED";
  const t04 = commitInfo(root, rows[1][0], "active correction T04 commit", failures);
  exact([rows[1][1], t04?.paths], [rows[0][0], [...CONFIG.T04.paths].sort()], "active correction exact T04 commit", failures);
  requireRegularBlobEntries(root, rows[1][0], CONFIG.T04.paths, "active correction T04 commit", failures);
  return "T04_COMMITTED";
}
function validateCorrectionRepositoryScope(root, activeCommit, currentCommit, records, requireTrackedClean, failures, dirtyAllowedPaths = null, requireProtectedBaseline = true) {
  if (!activeCommit || !currentCommit) return;
  validateUnmaskedIndex(root, failures);
  const allowed = new Set(Object.values(records).flatMap((record) => record?.allowedPaths ?? []));
  for (const path of allowed) safeFile(root, path, "authorized implementation path", failures);
  if (requireTrackedClean) for (const path of COMPLETION_PATHS) allowed.add(path);
  const committed = git(root, ["diff", "--name-only", `${activeCommit}..${currentCommit}`], "correction committed path scope", failures)?.split("\n").filter(Boolean).sort() ?? [];
  const staged = git(root, ["diff", "--cached", "--name-only"], "correction staged path scope", failures)?.split("\n").filter(Boolean).sort() ?? [];
  const worktree = git(root, ["diff", "--name-only"], "correction worktree path scope", failures)?.split("\n").filter(Boolean).sort() ?? [];
  const untracked = scopedUntrackedPaths(root, "correction untracked path scope", failures);
  for (const path of committed) if (!allowed.has(path)) failures.push(`active correction path outside exact lane scope ${path}`);
  const dirtyAllowed = new Set(dirtyAllowedPaths ?? [...allowed]);
  for (const path of [...new Set([...staged, ...worktree])]) if (!dirtyAllowed.has(path)) failures.push(`active correction dirty path outside current phase scope ${path}`);
  exact(staged, [], "correction controller-only unstaged index", failures);
  if (requireTrackedClean) exact(worktree, [], "correction clean tracked state", failures);
  exact(untracked, requireProtectedBaseline ? [PROTECTED_PATH] : [], "correction protected untracked baseline", failures);
  if (requireProtectedBaseline) {
    const protectedFile = safeFile(root, PROTECTED_PATH, "correction protected handoff", failures);
    if (protectedFile && sha(readFileSync(protectedFile)) !== PROTECTED_SHA) failures.push("correction protected handoff hash drift");
  }
}
function validateUnconsumedExpiry(records, evaluationTime, failures) {
  for (const record of Object.values(records)) {
    if (record && (!Number.isFinite(evaluationTime) || evaluationTime >= correctionTimestampEpoch(record.expiresAt))) failures.push(`${record.id}: authorization expired`);
  }
}
export function originalVerificationCommitForCorrectionState(result) {
  return result?.failures?.length === 0 && ["ACTIVE", "CONSUMED"].includes(result.state)
    ? PHASE1_CORRECTION_BASE_COMMIT
    : null;
}
const FORBIDDEN_RUNTIME_PATTERNS = [
  ["direct network call", /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/],
  ["indirect global network call", /\bglobalThis\s*(?:\.\s*(?:fetch|XMLHttpRequest|WebSocket)|\[\s*["'](?:fetch|XMLHttpRequest|WebSocket)["']\s*\])\s*\(/],
  ["browser transport or network capability", /\b(?:navigator|EventSource|WebTransport|Image|Audio|RTCPeerConnection)\b/],
  ["browser UI capability", /\b(?:document|location|history|Notification|screen|customElements|matchMedia|getComputedStyle|speechSynthesis|MutationObserver|IntersectionObserver|ResizeObserver|PaymentRequest|OffscreenCanvas|Canvas|showOpenFilePicker|showSaveFilePicker|showDirectoryPicker|FileSystemFileHandle|FileSystemDirectoryHandle|FileSystemHandle)\b|\bwindow\s*(?:\.\s*(?:document|location|history|navigator|localStorage|sessionStorage|open|postMessage|alert|confirm|prompt|print)|\[\s*["'](?:document|location|history|navigator|localStorage|sessionStorage|open|postMessage|alert|confirm|prompt|print)["']\s*\])/],
  ["browser messaging capability", /\bpostMessage\s*\(|\b(?:parent|top|self)\s*(?:\.\s*postMessage|\[\s*["']postMessage["']\s*\])\s*\(/],
  ["persistence capability", /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/],
  ["queue timer or background worker capability", /\b(?:queueMicrotask|setTimeout|setInterval|setImmediate|requestAnimationFrame|requestIdleCallback|Worker|SharedWorker|ServiceWorker|BroadcastChannel|MessageChannel|scheduler\s*\.\s*postTask)\b/],
  ["implicit clock or randomness", /\bDate\s*\.\s*now\s*\(|\bDate\s*(?:\.\s*(?:call|apply|bind)|\[\s*["'](?:call|apply|bind)["']\s*\])\s*\(|\bnew\s+Date\s*\(\s*(?:\)|\.\.\.)|\bDate\s*\(\s*\)|\bperformance\s*\.\s*now\s*\(|\bMath\s*\.\s*random\s*\(|\bcrypto\s*\.\s*(?:getRandomValues|randomUUID)\s*\(|\bTemporal\s*\.\s*Now\b/],
  ["environment access", /\bprocess\s*(?:\?\.\s*|\.\s*)env\b|\bprocess\s*\[\s*["']env["']\s*\]|\bimport\s*\.\s*meta\s*(?:\?\.\s*|\.\s*)env\b|\bimport\s*\.\s*meta\s*\[\s*["']env["']\s*\]/],
  ["static forbidden runtime import", /\bfrom\s+["'](?:node:)?(?:fs|fs\/promises|child_process|http|https|net|tls|dgram|worker_threads)["']/],
  ["dynamic forbidden runtime import", /\bimport\s*\(\s*["'](?:node:)?(?:fs|fs\/promises|child_process|http|https|net|tls|dgram|worker_threads)["']\s*\)/],
  ["forbidden runtime require", /\brequire\s*\(\s*["'](?:node:)?(?:fs|fs\/promises|child_process|http|https|net|tls|dgram|worker_threads)["']\s*\)/],
];
export function forbiddenRuntimeEffectFindings(sourceText) {
  return FORBIDDEN_RUNTIME_PATTERNS.filter(([, pattern]) => pattern.test(sourceText)).map(([label]) => label);
}
export function forbiddenEvidenceDiffFindings(diffText) {
  const lines = String(diffText).split("\n");
  const added = lines.filter((line) => line.startsWith("+") && !line.startsWith("+++" )).map((line) => line.slice(1)).join("\n");
  const removed = lines.filter((line) => line.startsWith("-") && !line.startsWith("---" )).map((line) => line.slice(1)).join("\n");
  const findings = forbiddenRuntimeEffectFindings(added);
  const sensitiveEvidenceSyntax = /\b(?:process|globalThis|global|fetch|XMLHttpRequest|WebSocket|require|eval|Function|Deno|Bun|readFile|readFileSync|writeFile|writeFileSync|appendFile|appendFileSync|open|openSync|rename|renameSync|copyFile|copyFileSync|mkdir|mkdirSync|mkdtemp|mkdtempSync|rm|rmSync|unlink|unlinkSync|createReadStream|createWriteStream|spawn|spawnSync|exec|execSync|execFile|execFileSync|fork|constructor|__proto__|prototype|Reflect|Proxy)\b|\bimport\s*\(/;
  if (sensitiveEvidenceSyntax.test(added)) findings.push("new filesystem shell environment or transport capability syntax in evidence");
  if (/\b(?:Deno|Bun)\s*\./.test(added)) findings.push("new alternate runtime capability in evidence");
  if (/(?:not\.toMatch|readFile|node:(?:fs|child_process|http|https|net|tls)|process|globalThis|fetch|WebSocket|XMLHttpRequest)/.test(removed)) findings.push("removed baseline security evidence");
  return [...new Set(findings)];
}
const CAPABILITY_IDENTIFIERS = new Set([
  "process", "globalThis", "global", "fetch", "XMLHttpRequest", "WebSocket", "require", "eval", "Function", "Deno", "Bun",
  "Date", "Math", "performance", "crypto", "localStorage", "sessionStorage", "indexedDB", "caches", "document", "navigator",
  "location", "history", "Notification", "screen", "customElements", "matchMedia", "getComputedStyle", "speechSynthesis",
  "MutationObserver", "IntersectionObserver", "ResizeObserver", "PaymentRequest",
  "postMessage", "OffscreenCanvas", "Canvas", "showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker",
  "FileSystemFileHandle", "FileSystemDirectoryHandle", "FileSystemHandle", "scheduler", "Temporal",
  "Worker", "SharedWorker", "ServiceWorker", "BroadcastChannel", "MessageChannel", "EventSource", "WebTransport", "Image", "Audio", "RTCPeerConnection",
  "queueMicrotask", "setTimeout", "setInterval", "setImmediate", "requestAnimationFrame", "requestIdleCallback",
  "readFile", "readFileSync", "writeFile", "writeFileSync", "appendFile", "appendFileSync", "open", "openSync", "rename", "renameSync",
  "copyFile", "copyFileSync", "mkdir", "mkdirSync", "mkdtemp", "mkdtempSync", "rm", "rmSync", "unlink", "unlinkSync",
  "createReadStream", "createWriteStream", "spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork",
]);
const CAPABILITY_LITERAL = /^(?:node:)?(?:fs|fs\/promises|child_process|http|https|net|tls|dgram|worker_threads|process|env|fetch|XMLHttpRequest|WebSocket|Date|Math|performance|crypto|localStorage|sessionStorage|indexedDB|caches|document|navigator|location|history|Notification|screen|customElements|matchMedia|getComputedStyle|speechSynthesis|MutationObserver|IntersectionObserver|ResizeObserver|PaymentRequest|postMessage|OffscreenCanvas|Canvas|showOpenFilePicker|showSaveFilePicker|showDirectoryPicker|FileSystemFileHandle|FileSystemDirectoryHandle|FileSystemHandle|scheduler|Temporal|Worker|SharedWorker|ServiceWorker|BroadcastChannel|MessageChannel|EventSource|WebTransport|Image|Audio|RTCPeerConnection|queueMicrotask|setTimeout|setInterval|setImmediate|requestAnimationFrame|requestIdleCallback)$/;
export function capabilityFingerprints(sourceText, path = "fixture.ts") {
  const scriptKind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const fingerprints = [];
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === "Date") {
      const parent = node.parent;
      const handledByDateOperation = (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)
        || ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node;
      if (!handledByDateOperation) fingerprints.push("date-reference:bare");
    } else if (ts.isIdentifier(node) && CAPABILITY_IDENTIFIERS.has(node.text)) fingerprints.push(`identifier:${node.text}`);
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Date") {
      fingerprints.push(`date-member:${node.name.text}`);
    }
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Date") {
      fingerprints.push(`date-element:${node.argumentExpression?.getText(source) ?? "missing"}`);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Date") {
      fingerprints.push("date-call:implicit-clock");
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Date") {
      const args = node.arguments ?? [];
      fingerprints.push(args.length === 1 && !ts.isSpreadElement(args[0])
        ? "date-new:explicit-single-value"
        : "date-new:implicit-or-spread");
    }
    if ((ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) && CAPABILITY_LITERAL.test(node.text)) fingerprints.push(`literal:${node.text}`);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) fingerprints.push(`dynamic-import:${node.expression.getText(source)}`);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      fingerprints.push(`module-import:${node.moduleSpecifier.text}`);
      if (!node.moduleSpecifier.text.startsWith(".")) fingerprints.push(`package-import:${node.moduleSpecifier.text}:${node.importClause?.getText(source) ?? "side-effect"}`);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) fingerprints.push(`module-export:${node.moduleSpecifier.text}`);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return fingerprints.sort();
}
export function newEvidenceCapabilityFindings(path, baselineText, targetText) {
  if (!path.endsWith(".ts") && !path.endsWith(".tsx")) return [];
  const baseline = new Map();
  for (const fingerprint of capabilityFingerprints(baselineText, path)) baseline.set(fingerprint, (baseline.get(fingerprint) ?? 0) + 1);
  const observed = new Map();
  for (const fingerprint of capabilityFingerprints(targetText, path)) observed.set(fingerprint, (observed.get(fingerprint) ?? 0) + 1);
  return [...observed.entries()]
    .filter(([fingerprint, count]) => count > (baseline.get(fingerprint) ?? 0))
    .map(([fingerprint]) => `new capability syntax ${fingerprint}`);
}
function orderedFilesDigest(files) { return sha(canonical(files.map(({ path, digest }) => ({ path, digest })))); }
export function combinedImplementationFilesDigest(receipts) {
  return sha(canonical(["T03", "T04"].flatMap((laneId) => receipts[laneId].implementation.files.map(({ path, digest }) => ({ laneId, path, digest })) )));
}
function expectedProofPath(row, extension) {
  return `proof/phase1-correction-${String(row.sequence).padStart(2, "0")}-${row.laneId.toLowerCase()}-${row.commandId}.${extension}`;
}
function expectedCommandSpec(lane, commandId, receipts) {
  const target = receipts.T03.integratedTarget.commit;
  const activation = receipts.T03.implementation.parentCommit;
  const staticSpecs = {
    "t03-correction-focused": "npx vitest run src/lib/operatingEnvironment/receipts.test.ts",
    "t04-correction-focused": "npx vitest run src/lib/operatingEnvironment/budget.test.ts src/lib/operatingEnvironment/capacity.test.ts src/lib/operatingEnvironment/compare.test.ts",
    "operating-environment": "npm test -- src/lib/operatingEnvironment",
    "source-adoption": "node scripts/verify-obx-p180-source-adoption.mjs",
    typecheck: "npm run typecheck",
    "verify-plans": "node scripts/verify-plan-authority.mjs",
    "test-plans": "node --test scripts/verify-plan-authority.node.mjs",
    "path-census": `node scripts/verify-p180-phase1-correction-authorization.mjs --evidence-check path-census --activation ${activation} --target ${target}`,
    "dependency-diff": `node scripts/verify-p180-phase1-correction-authorization.mjs --evidence-check dependency-diff --target ${target}`,
    "forbidden-effects": `node scripts/verify-p180-phase1-correction-authorization.mjs --evidence-check forbidden-effects --lane ${lane} --target ${target}`,
    "secrets-scan": `gitleaks git --no-banner --redact --log-opts=${BASE_COMMIT}..${target}`,
  };
  if (commandId === "targeted-lint") return lane === "T03"
    ? "npx eslint src/lib/operatingEnvironment/receipts.ts src/lib/operatingEnvironment/receipts.test.ts"
    : "npx eslint src/lib/operatingEnvironment/budget.test.ts src/lib/operatingEnvironment/capacity.test.ts src/lib/operatingEnvironment/compare.test.ts";
  return staticSpecs[commandId];
}
function validateProofMetadata(row, receipts, label, failures) {
  exact(row.commandSpec, expectedCommandSpec(row.laneId, row.commandId, receipts), `${label} exact command`, failures);
  exact([row.outputPath, row.envelopePath], [expectedProofPath(row, "log"), expectedProofPath(row, "json")], `${label} exact evidence paths`, failures);
  if (typeof row.commandSpec !== "string" || row.commandSpec.length === 0 || sha(row.commandSpec) !== row.commandSpecSha256) failures.push(`${label}: command spec hash drift`);
}
export function verifyCorrectionProofMetadata(row, receipts) {
  const failures = [];
  validateProofMetadata(row, receipts, "correction proof metadata", failures);
  return failures;
}
export function verifyCommittedCorrectionReceiptBytes({ repoRoot, commit, paths }) {
  const failures = [];
  requireCommittedReceiptBytes(realpathSync(repoRoot), commit, paths, "correction receipt", failures);
  return failures;
}
function validateProof(root, records, receipts, failures) {
  const proofRoot = records.T03.proofProtocol.goalStateRoot;
  exact(records.T04.proofProtocol.goalStateRoot, proofRoot, "correction proof root", failures);
  try {
    const stat = lstatSync(proofRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 || (process.getuid && stat.uid !== process.getuid())) failures.push("correction proof root: real owner-matched mode 0700 directory required");
  } catch (error) { failures.push(`correction proof root: unsafe (${error.message})`); }
  const registryPath = safeExternal(resolve(proofRoot, records.T03.proofProtocol.registryPath), proofRoot, "correction proof registry", failures);
  if (!registryPath) return;
  const bytes = readFileSync(registryPath); const lines = bytes.toString("utf8").trim().split("\n");
  let rows; try { rows = lines.map((line) => JSON.parse(line)); } catch (error) { failures.push(`correction proof registry: invalid JSONL (${error.message})`); return; }
  for (const lane of ["T03", "T04"]) {
    const binding = receipts[lane].proofBinding;
    exact(Object.keys(binding ?? {}).sort(), [...PROOF_BINDING_KEYS].sort(), `${lane} correction proof binding keys`, failures);
    exact([binding?.registryPath, binding?.algorithm], [records[lane].proofProtocol.registryPath, "sha256"], `${lane} correction proof registry binding`, failures);
    exact(binding?.tuples?.map((row) => row.laneId), Array(recordBindingLength(records[lane])).fill(lane), `${lane} correction proof lane ownership`, failures);
    exact(binding?.tuples?.map((row) => row.commandId), records[lane].completionEvidence.requiredCommandIds, `${lane} correction required command ids`, failures);
  }
  const expected = [...(receipts.T03.proofBinding?.tuples ?? []), ...(receipts.T04.proofBinding?.tuples ?? [])].sort((a, b) => a.sequence - b.sequence);
  exact(rows, expected, "correction proof registry rows", failures);
  exact([receipts.T03.proofBinding.registrySha256, receipts.T04.proofBinding.registrySha256], [sha(bytes), sha(bytes)], "correction proof registry hash", failures);
  let previous = "0".repeat(64);
  const execution = receipts.T03.integratedTarget;
  const executionCommitEpoch = Number(git(root, ["show", "-s", "--format=%ct", execution.commit], "correction proof execution timestamp", failures)) * 1_000;
  for (const [index, row] of rows.entries()) {
    exact(Object.keys(row).sort(), [...PROOF_TUPLE_KEYS].sort(), `correction proof[${index}] keys`, failures);
    const config = CONFIG[row.laneId]; const receipt = receipts[row.laneId];
    if (!config || !receipt) { failures.push(`correction proof[${index}]: unknown lane`); continue; }
    exact([row.sequence, row.authorizationId, row.authorizationHash, row.exitCode, row.executionCommit, row.executionTree, row.implementationCommit, row.implementationTree, row.orderedFileListSha256, row.previousDigest], [index + 1, config.id, config.hash, 0, execution.commit, execution.tree, receipt.implementation.commit, receipt.implementation.tree, orderedFilesDigest(receipt.implementation.files), previous], `correction proof[${index}] binding`, failures);
    validateProofMetadata(row, receipts, `correction proof[${index}]`, failures);
    const releaseEpochs = receipt.leaseReleases.map((release) => correctionTimestampEpoch(release.releasedAt));
    const startedAt = correctionTimestampEpoch(row.startedAt); const finishedAt = correctionTimestampEpoch(row.finishedAt);
    const releaseFloor = releaseEpochs.every((epoch) => epoch !== null) ? Math.max(...releaseEpochs) : null;
    const laneNotBefore = correctionTimestampEpoch(records[row.laneId].notBefore); const laneExpiresAt = correctionTimestampEpoch(records[row.laneId].expiresAt); const completedAt = correctionTimestampEpoch(receipt.completedAt);
    const proofChronologyFailures = correctionProofEpochFailures({ startedAt, finishedAt, releaseFloor, laneNotBefore, laneExpiresAt, completedAt, executionCommitEpoch });
    if (proofChronologyFailures.length) failures.push(`correction proof[${index}]: ${proofChronologyFailures.join("; ")}`);
    const output = safeExternal(resolve(proofRoot, row.outputPath), proofRoot, `correction proof[${index}] output`, failures);
    const envelope = safeExternal(resolve(proofRoot, row.envelopePath), proofRoot, `correction proof[${index}] envelope`, failures);
    if (!output || sha(readFileSync(output)) !== row.outputSha256) failures.push(`correction proof[${index}]: output byte drift`);
    if (!envelope || sha(readFileSync(envelope)) !== row.envelopeSha256) failures.push(`correction proof[${index}]: envelope byte drift`);
    if (envelope) {
      const envelopeValue = readJson(envelope, `correction proof[${index}] envelope`, failures);
      exact(Object.keys(envelopeValue ?? {}).sort(), [...PROOF_ENVELOPE_KEYS].sort(), `correction proof[${index}] envelope keys`, failures);
      exact(envelopeValue, {
        schemaVersion: 2,
        proofKind: "phase1-correction-command-proof-v2",
        laneId: row.laneId,
        commandId: row.commandId,
        authorizationId: row.authorizationId,
        authorizationHash: row.authorizationHash,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        exitCode: row.exitCode,
        executionCommit: row.executionCommit,
        executionTree: row.executionTree,
        implementationCommit: row.implementationCommit,
        implementationTree: row.implementationTree,
        orderedFileListSha256: row.orderedFileListSha256,
        commandSpec: row.commandSpec,
        commandSpecSha256: row.commandSpecSha256,
        outputPath: row.outputPath,
        outputSha256: row.outputSha256,
      }, `correction proof[${index}] envelope binding`, failures);
    }
    const copy = structuredClone(row); delete copy.entryDigest;
    if (sha(canonical(copy)) !== row.entryDigest) failures.push(`correction proof[${index}]: entry digest drift`);
    previous = row.entryDigest;
  }
  for (const lane of ["T03", "T04"]) exact([receipts[lane].proofBinding.entryCount, receipts[lane].proofBinding.headDigest], [rows.length, previous], `${lane} correction proof head`, failures);
}
function recordBindingLength(record) { return record?.completionEvidence?.requiredCommandIds?.length ?? 0; }
function validateLeaseReleases(record, receipt, activation, failures) {
  exact(receipt.leaseReleases?.map((row) => row.laneId), ["T03", "T04"], `${record.id}.lease release order`, failures);
  for (const [index, release] of (receipt.leaseReleases ?? []).entries()) {
    const config = CONFIG[release.laneId];
    exact(Object.keys(release).sort(), [...LEASE_RELEASE_KEYS].sort(), `${record.id}.leaseReleases[${index}] keys`, failures);
    exact([
      release.claimantActorId,
      release.taskStatus,
      release.terminalReportPath,
    ], [
      config?.claimant,
      "COMPLETED",
      `reports/phase1-correction-${release.laneId.toLowerCase()}-lease-release.json`,
    ], `${record.id}.leaseReleases[${index}] identity`, failures);
    const releasedAt = correctionTimestampEpoch(release.releasedAt); const observedAt = correctionTimestampEpoch(activation.observedAt); const completedAt = correctionTimestampEpoch(receipt.completedAt); const expiresAt = correctionTimestampEpoch(record.expiresAt);
    if ([releasedAt, observedAt, completedAt, expiresAt].some((epoch) => epoch === null)
      || releasedAt < observedAt || releasedAt > completedAt || releasedAt >= expiresAt) failures.push(`${record.id}.leaseReleases[${index}]: invalid release time`);
    const reportPath = safeExternal(resolve(record.proofProtocol.goalStateRoot, release.terminalReportPath), record.proofProtocol.goalStateRoot, `${record.id}.leaseReleases[${index}] report`, failures);
    if (!reportPath || release.terminalReportSha256 !== sha(readFileSync(reportPath))) { failures.push(`${record.id}.leaseReleases[${index}]: terminal report byte drift`); continue; }
    const report = readJson(reportPath, `${record.id}.leaseReleases[${index}] report`, failures);
    exact(Object.keys(report ?? {}).sort(), [...TERMINAL_REPORT_KEYS].sort(), `${record.id}.leaseReleases[${index}] report keys`, failures);
    exact([
      report?.schemaVersion,
      report?.reportKind,
      report?.laneId,
      report?.claimantActorId,
      report?.taskStatus,
      report?.leasedPaths,
      report?.editsStopped,
      report?.stagedOrCommitted,
      report?.releasedAt,
    ], [
      1,
      "phase1-correction-lease-release-v1",
      release.laneId,
      config?.claimant,
      "COMPLETED",
      config?.paths,
      true,
      false,
      release.releasedAt,
    ], `${record.id}.leaseReleases[${index}] report binding`, failures);
    if (typeof report?.terminalSummary !== "string" || report.terminalSummary.length < 20) failures.push(`${record.id}.leaseReleases[${index}]: terminal summary required`);
    selfHash(report, "selfHash", report?.selfHash?.digest, `${record.id}.leaseReleases[${index}] report`, failures);
  }
}
function validatePostImplementationReviews(records, receipts, executionCommitEpoch, failures) {
  const goalRoot = records.T03.proofProtocol.goalStateRoot;
  exact(records.T04.proofProtocol.goalStateRoot, goalRoot, "correction review proof root", failures);
  exact(receipts.T03.reviewBinding, receipts.T04.reviewBinding, "correction shared review binding", failures);
  failures.push(...correctionReviewBindingShapeFailures(receipts.T03.reviewBinding));
  const target = receipts.T03.integratedTarget;
  const completedAt = correctionTimestampEpoch(receipts.T03.completedAt);
  const expiresAt = Math.min(...Object.values(records).map((record) => correctionTimestampEpoch(record.expiresAt) ?? Number.NaN));
  for (const [index, config] of POST_IMPLEMENTATION_REVIEWS.entries()) {
    const binding = receipts.T03.reviewBinding?.[index];
    if (!binding) continue;
    const path = safeExternal(resolve(goalRoot, binding.path), goalRoot, `correction review ${config.reviewId}`, failures);
    if (!path) continue;
    const bytes = readFileSync(path);
    if (binding.digest !== sha(bytes)) failures.push(`correction review ${config.reviewId}: receipt byte drift`);
    const review = readJson(path, `correction review ${config.reviewId}`, failures);
    if (!review) continue;
    exact(Object.keys(review).sort(), [...REVIEW_RECEIPT_KEYS].sort(), `correction review ${config.reviewId} keys`, failures);
    exact([
      review.schemaVersion, review.reviewId, review.receiptKind, review.laneId,
      review.reviewerActorId, review.status, review.model, review.provider,
    ], [
      1, config.reviewId, config.receiptKind, config.laneId,
      config.reviewerActorId, config.status, config.model, config.provider,
    ], `correction review ${config.reviewId} identity`, failures);
    exact(Object.keys(review.target ?? {}).sort(), [...REVIEW_TARGET_KEYS].sort(), `correction review ${config.reviewId} target keys`, failures);
    exact(review.target, target, `correction review ${config.reviewId} target`, failures);
    exact(review.checks, config.checks, `correction review ${config.reviewId} checks`, failures);
    if (!Array.isArray(review.findings) || review.findings.some((finding) => !["low", "info"].includes(finding?.severity))) failures.push(`correction review ${config.reviewId}: unresolved critical high or medium finding`);
    if (config.evidenceKind === "independent") exact(review.findings, [], `correction review ${config.reviewId} findings`, failures);
    const reviewedAt = correctionTimestampEpoch(review.reviewedAt);
    if ([reviewedAt, completedAt, expiresAt, executionCommitEpoch].some((epoch) => !Number.isFinite(epoch))
      || reviewedAt < executionCommitEpoch || reviewedAt > completedAt || reviewedAt >= expiresAt) failures.push(`correction review ${config.reviewId}: invalid post-implementation review time`);
    selfHash(review, "selfHash", binding.selfHash, `correction review ${config.reviewId}`, failures);
    exact(review.sourceEvidence?.map((row) => row.path), config.evidencePaths, `correction review ${config.reviewId} evidence paths`, failures);
    const evidence = new Map();
    for (const [sourceIndex, row] of (review.sourceEvidence ?? []).entries()) {
      exact(Object.keys(row ?? {}).sort(), [...REVIEW_SOURCE_KEYS].sort(), `correction review ${config.reviewId} evidence[${sourceIndex}] keys`, failures);
      const sourcePath = safeExternal(resolve(goalRoot, row.path), goalRoot, `correction review ${config.reviewId} evidence[${sourceIndex}]`, failures);
      if (!sourcePath || row.algorithm !== "sha256" || row.digest !== sha(readFileSync(sourcePath))) failures.push(`correction review ${config.reviewId}: source evidence drift ${row.path}`);
      else evidence.set(row.path, sourcePath);
    }
    if (config.evidenceKind === "glm") validateGlmPostReviewEvidence(config, review, evidence, target, failures);
    else if (config.evidenceKind === "opus") validateOpusPostReviewEvidence(config, review, evidence, target, failures);
  }
}
function validateGlmPostReviewEvidence(config, review, evidence, target, failures) {
  const [packetName, receiptName, auditName] = config.evidencePaths;
  const packet = evidence.has(packetName) ? readJson(evidence.get(packetName), `${config.reviewId}.packet`, failures) : null;
  const raw = evidence.has(receiptName) ? readJson(evidence.get(receiptName), `${config.reviewId}.rawReceipt`, failures) : null;
  const audit = evidence.has(auditName) ? readJson(evidence.get(auditName), `${config.reviewId}.audit`, failures) : null;
  exact(packet?.reviewTarget, target, `${config.reviewId}.packet target`, failures);
  exact([packet?.laneId, packet?.sanitization], [config.laneId, {
    syntheticOnly: true, rawImplementationSourceIncluded: false, protectedHandoffIncluded: false,
    secretsOrPiiIncluded: false, productDataIncluded: false, pageIrIncluded: false,
  }], `${config.reviewId}.packet sanitization`, failures);
  exact([
    raw?.requestedModel, raw?.providerReportedModel, raw?.providerReportedIdentity,
    raw?.endpointPreflightTag, raw?.verdict, raw?.packetSha256, raw?.completedAt,
  ], [
    "z-ai/glm-5.3-flash", "z-ai/glm-5.3-flash", "Z.AI",
    "z-ai/fp8", "GREEN", review.sourceEvidence[0].digest, review.reviewedAt,
  ], `${config.reviewId}.raw identity`, failures);
  exact(raw?.controls, {
    allowFallbacks: false, requireParameters: true, dataCollection: "deny", zdr: true,
    reasoningEffort: "low", tools: [], plugins: [], maxTokens: 8000, transportAttempts: 1,
  }, `${config.reviewId}.raw controls`, failures);
  exact([audit?.verdict, audit?.reviewedCommit, audit?.reviewedTree, audit?.requiredCorrections ?? []], ["GREEN", target.commit, target.tree, []], `${config.reviewId}.audit result`, failures);
}
function validateOpusPostReviewEvidence(config, review, evidence, target, failures) {
  const [receiptName, auditName] = config.evidencePaths;
  const raw = evidence.has(receiptName) ? readJson(evidence.get(receiptName), `${config.reviewId}.rawReceipt`, failures) : null;
  const audit = evidence.has(auditName) ? readJson(evidence.get(auditName), `${config.reviewId}.audit`, failures) : null;
  exact([
    raw?.transport, raw?.requestedModel, raw?.permissionMode, raw?.outputFormat,
    raw?.providerReportedModelKey, raw?.canonicalModel, raw?.provider,
    raw?.reviewedCommit, raw?.reviewedTree, raw?.verdict, raw?.requiredCorrectionsCount,
    raw?.editsMade, raw?.permissionDenials, raw?.status,
  ], [
    "claude-max-oauth", "opus", "plan", "json",
    "claude-opus-5", "claude-opus-5", "firstParty",
    target.commit, target.tree, "GREEN", 0,
    false, [], "accepted-exact-target",
  ], `${config.reviewId}.raw identity`, failures);
  exact([audit?.verdict, audit?.reviewedCommit, audit?.reviewedTree, audit?.requiredCorrections ?? []], ["GREEN", target.commit, target.tree, []], `${config.reviewId}.audit result`, failures);
}
function validateCompletion(root, lane, record, activation, currentCommit, failures) {
  const config = CONFIG[lane]; const path = safeFile(root, config.completionPath, `${config.id}.completion`, failures); if (!path) return null;
  const receipt = readJson(path, `${config.id}.completion`, failures); if (!receipt) return null;
  exact(Object.keys(receipt).sort(), [...COMPLETION_KEYS].sort(), `${config.id}.completion keys`, failures);
  exact([receipt.schemaVersion, receipt.receiptId, receipt.receiptKind, receipt.status, receipt.authorizationId, receipt.authorizationHash, receipt.ticketId, receipt.laneId], [1, `${config.ticketId}-AUDIT-CORRECTION-COMPLETION-001`, "owner-solo-finding-bound-correction-completion-v1", "COMPLETED_VERIFIED", config.id, config.hash, config.ticketId, lane], `${config.id}.completion identity`, failures);
  exact(receipt.originalCompletionBinding, { path: config.originalCompletionPath, selfHash: config.originalCompletionHash }, `${config.id}.completion original`, failures);
  if (!record || !activation || !receipt.activationBinding || !receipt.implementation || !Array.isArray(receipt.implementation.files) || !receipt.integratedTarget || !Array.isArray(receipt.reviewBinding)) {
    failures.push(`${config.id}.completion: required nested objects missing`);
    return null;
  }
  exact(Object.keys(receipt.activationBinding).sort(), ["path", "selfHash", "governanceCommit", "governanceTree"].sort(), `${config.id}.completion activation keys`, failures);
  exact([receipt.activationBinding.path, receipt.activationBinding.selfHash, receipt.activationBinding.governanceCommit, receipt.activationBinding.governanceTree], [config.activationPath, activation.selfHash.digest, activation.governanceCommit, activation.governanceTree], `${config.id}.completion activation`, failures);
  exact(Object.keys(receipt.implementation ?? {}).sort(), ["commit", "tree", "parentCommit", "files"].sort(), `${config.id}.completion implementation keys`, failures);
  exact(receipt.implementation.files.map((row) => row.path), config.paths, `${config.id}.completion files`, failures);
  for (const row of receipt.implementation.files) exact(Object.keys(row).sort(), ["path", "algorithm", "digest"].sort(), `${config.id}.completion file keys`, failures);
  const info = commitInfo(root, receipt.implementation.commit, `${config.id}.implementation`, failures);
  exact([info?.tree, info?.parents, info?.paths], [receipt.implementation.tree, [receipt.implementation.parentCommit], [...config.paths].sort()], `${config.id}.implementation topology`, failures);
  requireRegularBlobEntries(root, receipt.implementation.commit, config.paths, `${config.id}.implementation`, failures);
  for (const row of receipt.implementation.files) {
    const result = spawnGit(root, ["show", `${receipt.implementation.commit}:${row.path}`], { encoding: null });
    const current = safeFile(root, row.path, `${config.id}.completion implementation`, failures);
    if (result.status !== 0 || !current || row.algorithm !== "sha256" || sha(result.stdout) !== row.digest || sha(readFileSync(current)) !== row.digest) failures.push(`${config.id}.completion: implementation file drift ${row.path}`);
  }
  exact(Object.keys(receipt.integratedTarget ?? {}).sort(), ["commit", "tree", "combinedTargetFilesSha256"].sort(), `${config.id}.completion integrated target keys`, failures);
  if (!COMMIT.test(receipt.integratedTarget.commit) || !COMMIT.test(receipt.integratedTarget.tree) || !SHA.test(receipt.integratedTarget.combinedTargetFilesSha256)) failures.push(`${config.id}.completion: integrated target drift`);
  const completedAt = correctionTimestampEpoch(receipt.completedAt); const observedAt = correctionTimestampEpoch(activation.observedAt); const expiresAt = correctionTimestampEpoch(record.expiresAt);
  if ([completedAt, observedAt, expiresAt].some((epoch) => epoch === null) || completedAt < observedAt || completedAt >= expiresAt) failures.push(`${config.id}.completion: invalid time`);
  validateLeaseReleases(record, receipt, activation, failures);
  selfHash(receipt, "selfHash", receipt.selfHash?.digest, `${config.id}.completion`, failures);
  return receipt;
}

export function verifyPhase1CorrectionAuthorizations({
  repoRoot = ROOT,
  registry,
  mode = "lifecycle",
  verifySecurity = true,
  verifyRepositoryState = true,
  verifyOriginalConsumed = true,
  evaluationTime = Date.now(),
  requireProtectedBaseline = true,
} = {}) {
  repoRoot = realpathSync(repoRoot); const failures = [];
  if (!["record", "activation", "lifecycle", "completion"].includes(mode)) failures.push(`unsupported correction verification mode ${mode}`);
  if (verifyRepositoryState) {
    failures.push(...gitEnvironmentRedirectFailures());
    validateGitRepositoryIntegrity(repoRoot, failures);
    validateBoundBranch(repoRoot, failures);
  }
  const source = registry ?? readJson(resolve(repoRoot, REGISTRY_PATH), "scoped registry", failures);
  const records = { T03: validateRecord(repoRoot, source, "T03", failures), T04: validateRecord(repoRoot, source, "T04", failures) };
  if (verifyOriginalConsumed) {
    for (const lane of ["T03", "T04"]) {
      const original = verifyP180SiblingAuthorization({ repoRoot, registry: source, ticket: lane, mode: "lifecycle", gitState: { currentCommit: BASE_COMMIT } });
      if (original.failures.length || original.state !== "CONSUMED") failures.push(`${lane} original authorization must remain exact CONSUMED: ${original.failures.join("; ")}`);
    }
  }
  if (records.T03 && records.T04) {
    exact(records.T03.siblingConcurrency.siblingAllowedPaths, records.T04.allowedPaths, "T03 correction sibling paths", failures);
    exact(records.T04.siblingConcurrency.siblingAllowedPaths, records.T03.allowedPaths, "T04 correction sibling paths", failures);
    if (records.T03.allowedPaths.some((path) => records.T04.allowedPaths.includes(path))) failures.push("correction lane paths must be disjoint");
  }
  validateSourceAdoptionRepin(repoRoot, failures);
  if (verifySecurity) validateSecurity(repoRoot, Object.values(records), failures);
  const completionPresence = COMPLETION_PATHS.map((path) => existsSync(resolve(repoRoot, path)));
  const activationPresence = ACTIVATION_PATHS.map((path) => existsSync(resolve(repoRoot, path)));
  if (completionPresence.some(Boolean) && !completionPresence.every(Boolean)) failures.push("correction completion pair incomplete");
  if (activationPresence.some(Boolean) && !activationPresence.every(Boolean)) failures.push("correction activation pair incomplete");
  if (completionPresence.some(Boolean) && !activationPresence.every(Boolean)) failures.push("correction completion receipts require exact activation pair");
  if (mode === "record") {
    if (activationPresence.some(Boolean) || completionPresence.some(Boolean)) failures.push("record verification requires all correction lifecycle receipts absent");
    validateUnconsumedExpiry(records, evaluationTime, failures);
    if (verifyRepositoryState) validateGovernanceState(repoRoot, failures);
    return { failures, state: failures.length ? "INVALID" : "PRE_ACTIVATION", authorizationHashes: Object.values(CONFIG).map((config) => config.hash) };
  }
  if (mode === "activation" && completionPresence.some(Boolean)) {
    failures.push("AUTHORIZATION_ALREADY_CONSUMED");
    return { failures, state: "INVALID", authorizationHashes: Object.values(CONFIG).map((config) => config.hash) };
  }
  if (!activationPresence.some(Boolean)) {
    if (mode !== "lifecycle") failures.push("correction activation receipts missing");
    validateUnconsumedExpiry(records, evaluationTime, failures);
    if (verifyRepositoryState) validateGovernanceState(repoRoot, failures);
    return { failures, state: failures.length ? "INVALID" : "PRE_ACTIVATION", authorizationHashes: Object.values(CONFIG).map((config) => config.hash) };
  }
  const activations = { T03: validateActivationReceipt(repoRoot, "T03", records.T03, failures), T04: validateActivationReceipt(repoRoot, "T04", records.T04, failures) };
  if (activations.T03 && activations.T04) exact([activations.T03.governanceCommit, activations.T03.governanceTree, activations.T03.observedAt], [activations.T04.governanceCommit, activations.T04.governanceTree, activations.T04.observedAt], "correction shared activation", failures);
  const currentCommit = git(repoRoot, ["rev-parse", "HEAD"], "correction current HEAD", failures);
  const activeCommit = activations.T03 && currentCommit ? activationCommit(repoRoot, activations.T03.governanceCommit, currentCommit, failures) : null;
  if (activeCommit && activations.T03 && activations.T04) {
    requireCommittedReceiptBytes(repoRoot, activeCommit.commit, ACTIVATION_PATHS, "correction activation", failures);
    exact([activations.T03.governanceTree, activations.T04.governanceTree], [git(repoRoot, ["rev-parse", `${activations.T03.governanceCommit}^{tree}`], "governance tree", failures), git(repoRoot, ["rev-parse", `${activations.T04.governanceCommit}^{tree}`], "governance tree", failures)], "correction governance trees", failures);
  }
  if (!completionPresence.some(Boolean)) {
    if (mode === "completion") failures.push("correction completion receipts missing");
    const activePhase = validateActiveCommitTopology(repoRoot, activeCommit?.commit, currentCommit, failures);
    if (mode === "activation" && (currentCommit !== activeCommit?.commit || activePhase !== "ACTIVATION")) failures.push("correction activation HEAD moved before worker freeze");
    const dirtyAllowedPaths = activePhase === "ACTIVATION"
      ? [...CONFIG.T03.paths, ...CONFIG.T04.paths]
      : activePhase === "T03_COMMITTED" ? CONFIG.T04.paths : [];
    validateCorrectionRepositoryScope(repoRoot, activeCommit?.commit, currentCommit, records, mode === "activation" || activePhase === "T04_COMMITTED", failures, dirtyAllowedPaths, requireProtectedBaseline);
    validateUnconsumedExpiry(records, evaluationTime, failures);
    return { failures, state: failures.length ? "INVALID" : "ACTIVE", frozenStart: activeCommit, authorizationHashes: Object.values(CONFIG).map((config) => config.hash) };
  }
  const receipts = {
    T03: validateCompletion(repoRoot, "T03", records.T03, activations.T03, currentCommit, failures),
    T04: validateCompletion(repoRoot, "T04", records.T04, activations.T04, currentCommit, failures),
  };
  if (receipts.T03 && receipts.T04) {
    exact(receipts.T03.integratedTarget, receipts.T04.integratedTarget, "correction integrated target", failures);
    exact(receipts.T03.leaseReleases, receipts.T04.leaseReleases, "correction shared lease releases", failures);
    exact([
      receipts.T03.integratedTarget.commit,
      receipts.T03.integratedTarget.tree,
      receipts.T03.integratedTarget.combinedTargetFilesSha256,
    ], [
      receipts.T04.implementation.commit,
      receipts.T04.implementation.tree,
      combinedImplementationFilesDigest(receipts),
    ], "correction final integrated target binding", failures);
    exact(receipts.T03.implementation.parentCommit, activeCommit?.commit, "correction T03 activation parent", failures);
    exact(receipts.T04.implementation.parentCommit, receipts.T03.implementation.commit, "correction linear implementation", failures);
    exact(receipts.T03.completedAt, receipts.T04.completedAt, "correction shared completion time", failures);
    const completionRows = git(repoRoot, ["rev-list", "--parents", `${receipts.T04.implementation.commit}..${currentCommit}`], "correction completion ancestry", failures)?.split("\n").filter(Boolean).map((row) => row.split(/\s+/)) ?? [];
    const candidates = completionRows.filter((parts) => parts.length === 2 && parts[1] === receipts.T04.implementation.commit);
    if (candidates.length !== 1) failures.push("correction completion: unique direct receipt commit required");
    else {
      const completionCommit = candidates[0][0];
      exact(completionCommit, currentCommit, "correction completion HEAD", failures);
      exact(commitInfo(repoRoot, completionCommit, "correction completion commit", failures)?.paths, [...COMPLETION_PATHS].sort(), "correction completion commit paths", failures);
      requireCommittedReceiptBytes(repoRoot, completionCommit, COMPLETION_PATHS, "correction completion", failures);
      const commitEpochSeconds = Number(git(repoRoot, ["show", "-s", "--format=%ct", completionCommit], "correction completion timestamp", failures));
      const t03CommitEpochSeconds = Number(git(repoRoot, ["show", "-s", "--format=%ct", receipts.T03.implementation.commit], "correction T03 implementation timestamp", failures));
      const t04CommitEpochSeconds = Number(git(repoRoot, ["show", "-s", "--format=%ct", receipts.T04.implementation.commit], "correction T04 implementation timestamp", failures));
      failures.push(...correctionCommitOrderingFailures({
        releasedAt: receipts.T03.leaseReleases.map((release) => release.releasedAt),
        t03CommitEpoch: t03CommitEpochSeconds * 1_000,
        t04CommitEpoch: t04CommitEpochSeconds * 1_000,
        completionCommitEpoch: commitEpochSeconds * 1_000,
      }));
      failures.push(...correctionCompletionChronologyFailures({
        mode,
        evaluationTime,
        commitEpoch: commitEpochSeconds * 1_000,
        completedAt: receipts.T03.completedAt,
        expiresAt: records.T03.expiresAt,
      }));
    }
    validateProof(repoRoot, records, receipts, failures);
    const finalExecutionCommitEpoch = Number(git(repoRoot, ["show", "-s", "--format=%ct", receipts.T04.implementation.commit], "correction review target timestamp", failures)) * 1_000;
    validatePostImplementationReviews(records, receipts, finalExecutionCommitEpoch, failures);
    validateCorrectionRepositoryScope(repoRoot, activeCommit?.commit, currentCommit, records, true, failures, null, requireProtectedBaseline);
  }
  return { failures, state: failures.length ? "INVALID" : "CONSUMED", authorizationHashes: Object.values(CONFIG).map((config) => config.hash) };
}

export function runPhase1CorrectionAuthorizationCli(repoRoot = ROOT) {
  const mode = process.argv.includes("--record-only") ? "record" : process.argv.includes("--activation-only") ? "activation" : process.argv.includes("--completion-only") ? "completion" : "lifecycle";
  const result = verifyPhase1CorrectionAuthorizations({ repoRoot, mode });
  if (result.failures.length) { for (const failure of result.failures) console.error(`FAIL ${failure}`); process.exitCode = 1; return; }
  const aggregate = spawnSync(process.execPath, ["scripts/verify-plan-authority.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: sanitizedGitEnvironment(),
  });
  if (aggregate.status !== 0) {
    if (aggregate.stdout) process.stderr.write(aggregate.stdout);
    if (aggregate.stderr) process.stderr.write(aggregate.stderr);
    console.error("FAIL correction standalone gate requires aggregate authority packet verification");
    process.exitCode = 1;
    return;
  }
  console.log(`PASS Phase1 audit correction authorization hashes: ${result.authorizationHashes.join(",")}`);
  console.log(`PASS Phase1 audit correction derived state: ${result.state}`);
  process.stdout.write(aggregate.stdout);
}

function cliArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function runEvidenceCheck(repoRoot = ROOT) {
  const check = cliArgument("--evidence-check");
  const target = cliArgument("--target");
  const lane = cliArgument("--lane");
  const activation = cliArgument("--activation");
  const failures = [];
  if (!COMMIT.test(target ?? "") || git(repoRoot, ["cat-file", "-e", `${target}^{commit}`], "evidence target", failures) === null) failures.push("evidence target commit required");
  if (check === "path-census") {
    if (!COMMIT.test(activation ?? "")) failures.push("path-census activation commit required");
    else {
      const paths = git(repoRoot, ["diff", "--name-only", `${activation}..${target}`], "path-census", failures)?.split("\n").filter(Boolean).sort() ?? [];
      exact(paths, [...CONFIG.T03.paths, ...CONFIG.T04.paths].sort(), "path-census exact correction paths", failures);
    }
  } else if (check === "dependency-diff") {
    for (const [path, expected] of [["package.json", PACKAGE_SHA], ["package-lock.json", LOCK_SHA]]) {
      const result = spawnGit(repoRoot, ["show", `${target}:${path}`], { encoding: null });
      if (result.status !== 0 || sha(result.stdout) !== expected) failures.push(`dependency-diff target drift ${path}`);
    }
  } else if (check === "forbidden-effects") {
    const config = CONFIG[lane];
    if (!config) failures.push("forbidden-effects exact lane required");
    else {
      for (const path of config.runtimePaths) {
        const result = spawnGit(repoRoot, ["show", `${target}:${path}`], { encoding: "utf8" });
        const fingerprints = result.status === 0 ? capabilityFingerprints(result.stdout, path).filter((fingerprint) => !config.allowedRuntimeCapabilityFingerprints.includes(fingerprint)) : [];
        const findings = result.status === 0 ? [...forbiddenRuntimeEffectFindings(result.stdout), ...fingerprints.map((fingerprint) => `capability syntax ${fingerprint}`)] : ["unreadable target"];
        if (findings.length) failures.push(`forbidden-effects target drift ${path}: ${findings.join(", ")}`);
      }
      for (const path of config.paths) {
        const result = spawnGit(repoRoot, ["diff", "--unified=0", "--no-ext-diff", `${BASE_COMMIT}..${target}`, "--", path], { encoding: "utf8" });
        const baseline = spawnGit(repoRoot, ["show", `${BASE_COMMIT}:${path}`], { encoding: "utf8" });
        const current = spawnGit(repoRoot, ["show", `${target}:${path}`], { encoding: "utf8" });
        const findings = result.status === 0 && baseline.status === 0 && current.status === 0
          ? [...forbiddenEvidenceDiffFindings(result.stdout), ...newEvidenceCapabilityFindings(path, baseline.stdout, current.stdout)]
          : ["unreadable baseline diff"];
        if (findings.length) failures.push(`forbidden-effects changed evidence drift ${path}: ${findings.join(", ")}`);
      }
    }
  } else {
    failures.push(`unsupported evidence check ${check}`);
  }
  if (failures.length) { for (const failure of failures) console.error(`FAIL ${failure}`); process.exitCode = 1; return; }
  console.log(`PASS Phase1 correction evidence check ${check}${lane ? ` ${lane}` : ""} target ${target}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  if (process.argv.includes("--evidence-check")) runEvidenceCheck();
  else runPhase1CorrectionAuthorizationCli();
}
