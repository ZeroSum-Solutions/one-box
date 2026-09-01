import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const T02_AUTHORIZATION_ID = "OBX-AUTH-P180-T02-SOLO-001";
export const T02_COMPLETION_CHECKPOINT_PATH = "docs/audits/evidence/goal/2026-08-31-obx-p180-t02-completion-checkpoint.json";
export const T02_COMPLETION_CHECKPOINT_HASH = "1378a9a7f158658d197362c99ffc7890d8abe7c6371ecee74a6914afca83aabe";
export const T02_OWNER_COMPLETION_RECEIPT_PATH = "docs/audits/evidence/goal/2026-08-31-obx-p180-t02-owner-completion-receipt.json";
export const T02_OWNER_COMPLETION_RECEIPT_HASH = "eb00341ec8c9798dffcbe172bd6d5e5377b22d585b8068607a1d67d89bb5eed8";
export const SOURCE_ADOPTION_REPIN_PATH = "docs/audits/evidence/security/2026-08-31-obx-p180-source-adoption-authority-repin.json";

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const AMENDMENT_PATH = "docs/governance/risk-exceptions/2026-08-31-obx-p180-t02-solo.json";
const AMENDMENT_ID = "OBX-P180-T02-SOLO-AMENDMENT-001";
const AMENDMENT_SHA256 = "986a1fb8466a564ab41fffa90ed2337a76ef9196ce36b6ba32cbfb582ebbcbd3";
const AUTHORIZATION_SHA256 = "9eb1ae436bb897de1abe572991ede4a38734b1b97a4ccfda7c079a072dfcaa36";
const T01_CHECKPOINT = "07864a45d414db0998cc7cfb2731010d0d4cbe8b";
const SECURITY_RECEIPT_PATH = "docs/audits/evidence/security/2026-08-31-obx-p180-t02-solo-authorization-security-review.json";
const SECURITY_RECEIPT_SHA256 = "f2c0dfffe5dbe6ae65a111a59c9ec444da6165902351322c41b44141c10e3c83";

const ALLOWED_PATHS = [
  "src/lib/operatingEnvironment/registry.ts",
  "src/lib/operatingEnvironment/registry.test.ts",
  "src/lib/operatingEnvironment/routeState.ts",
  "src/lib/operatingEnvironment/routeState.test.ts",
  "src/lib/operatingEnvironment/fixtures/registry-v1.json",
  "src/lib/operatingEnvironment/fixtures/route-state-v1.json",
];
const FORBIDDEN_EFFECTS = [
  "product-runtime-import-or-effect", "provider-or-model-call", "network",
  "credential-or-environment-access", "filesystem-or-shell-io",
  "persistence-or-durable-state", "queue-or-background-worker", "browser", "ui",
  "collaboration", "canvas-or-page-ir-read-write-or-mutation", "deployment", "release",
  "dependency-or-lockfile-change", "mutable-global-state", "implicit-clock-or-randomness",
  "authority-outside-exact-solo-record", "t03-through-t08",
  "parent-evaluation-completion-claim", "independent-human-review-claim",
  "production-readiness-claim",
];
const ACTIVATION_WRITE_SET = [
  "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json",
  "docs/plans/one-box-master/00-authority/authority-manifest.json",
  AMENDMENT_PATH,
  "docs/plans/2026-08-31-obx-p180-t02-solo-authorization-design.md",
  "docs/plans/2026-08-31-obx-p180-t02-registry-route-reducers.md",
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
  "scripts/verify-p180-t02-authorization.mjs",
  SECURITY_RECEIPT_PATH,
];
const HISTORICAL_SECURITY_TARGET_HASHES = [
  ["docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", "b18a127eb0dd0b30ea58dae59506e4260adbba0207cc3274bd5f1479996407f9"],
  ["docs/plans/one-box-master/00-authority/authority-manifest.json", "7a09999ccb21d81cd2dc5d9b98c5a055d8e52ec4073f70e45c1ae0f3f4aee5af"],
  [AMENDMENT_PATH, "986a1fb8466a564ab41fffa90ed2337a76ef9196ce36b6ba32cbfb582ebbcbd3"],
  ["docs/plans/2026-08-31-obx-p180-t02-solo-authorization-design.md", "7fb1dfbc5cb984ce60121c6fa3edabf168cb87abf77d59b7d24f893b2e61fd2a"],
  ["docs/plans/2026-08-31-obx-p180-t02-registry-route-reducers.md", "3d89de03533aba40d9e1780058242c4b6a0716b0c150323d6ff7605eddc5125a"],
  ["scripts/verify-plan-authority.mjs", "8eb7ae72a3d441f0002a635bcce14f7c317eaa25eb551a59ee4c9d90721e7782"],
  ["scripts/verify-plan-authority.node.mjs", "cef45537e5f5dda202a879871041b95fc197f5c3ccd4653e89438bf5cab51ba3"],
  ["scripts/verify-p180-t02-authorization.mjs", "cd770f38d12682277f8b1f984adcda39395faf4ea37c98d2194b59660ca4c331"],
].map(([path, digest]) => ({ path, algorithm: "sha256", digest }));
const REVIEW_PROTOCOL = {
  quickAuditModel: "z-ai/glm-5.3-flash",
  quickAuditLane: "nous-portal-prepaid",
  finalAuditModel: "anthropic/claude-opus-5",
  finalAuditLane: "claude-max-subscription",
  modelAuthority: "advisory-only",
  testAuthority: "deterministic-fixtures-and-vitest",
  secondFinalAuditPolicy: "only-if-finding-cannot-be-mechanically-closed",
};
const UNAVAILABLE_ROLE_IDS = [
  "implementation-lead",
  "model-skill-security-owner",
  "job-sandbox-owner",
];
const EXPECTED_RECORD_KEYS = [
  "id", "recordKind", "status", "implementationAuthorized", "projectId", "branch",
  "baseCommit", "activationBaseCommit", "activationWriteSet", "preExistingUntrackedBaseline",
  "parentTicketId", "parentTicketStatus", "childTicketIds", "authorizationProposalId",
  "ownerActorId", "riskOwnerActorId", "implementationActorId", "authorizedByActorId",
  "ownerAssignmentV1Status", "roleAvailability", "implementationAuthorizationSeparation",
  "escalation", "independentHumanReview", "acceptedRisk", "requirementExceptions",
  "traceabilityRefs", "allowedPaths", "allowedEffects", "forbiddenEffects",
  "predecessorBinding", "planBindings", "governanceBindings", "dependencyBindings",
  "amendmentBinding", "reviewProtocol", "requiredEvidencePaths", "invalidators",
  "recordedAt", "expiresAt", "renewable", "authorizationHash",
];

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exact(actual, expected, label, failures) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${label}: exact value drift`);
}

function safeFile(repoRoot, path, label, failures) {
  if (typeof path !== "string" || path.length === 0 || path.startsWith("/") || normalize(path).startsWith("..")) {
    failures.push(`${label}: invalid repository-relative path`);
    return null;
  }
  const absolute = resolve(repoRoot, path);
  try {
    if (!existsSync(absolute) || !lstatSync(absolute).isFile()) {
      failures.push(`${label}: missing non-symlink regular file ${path}`);
      return null;
    }
    const real = realpathSync(absolute);
    if (relative(repoRoot, real).startsWith("..")) {
      failures.push(`${label}: resolved file escapes repository ${path}`);
      return null;
    }
    return real;
  } catch (error) {
    failures.push(`${label}: cannot inspect ${path} (${error.message})`);
    return null;
  }
}

function sha256File(repoRoot, path, label, failures) {
  const absolute = safeFile(repoRoot, path, label, failures);
  return absolute ? createHash("sha256").update(readFileSync(absolute)).digest("hex") : null;
}

function readJson(repoRoot, path, label, failures) {
  const absolute = safeFile(repoRoot, path, label, failures);
  if (!absolute) return null;
  try {
    const value = JSON.parse(readFileSync(absolute, "utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      failures.push(`${label}: top level must be an object`);
      return null;
    }
    return value;
  } catch (error) {
    failures.push(`${label}: invalid JSON (${error.message})`);
    return null;
  }
}

function checkKeys(value, keys, label, failures) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    failures.push(`${label}: must be an object`);
    return;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  exact(actual, expected, `${label}.keys`, failures);
}

function checkBindings(repoRoot, bindings, label, failures) {
  if (!Array.isArray(bindings) || bindings.length === 0) {
    failures.push(`${label}: must be a non-empty array`);
    return;
  }
  for (const [index, binding] of bindings.entries()) {
    checkKeys(binding, ["path", "algorithm", "digest"], `${label}[${index}]`, failures);
    if (binding?.algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(binding?.digest ?? "")) {
      failures.push(`${label}[${index}]: invalid SHA-256 binding`);
      continue;
    }
    if (sha256File(repoRoot, binding.path, `${label}[${index}]`, failures) !== binding.digest) {
      failures.push(`${label}[${index}]: current hash drift ${binding.path}`);
    }
  }
}

function validateSelfHash(value, expected, label, failures) {
  checkKeys(value?.selfHash, ["algorithm", "canonicalization", "excludedJsonPointers", "digest"], `${label}.selfHash`, failures);
  exact(value?.selfHash, {
    algorithm: "sha256", canonicalization: "canonical-json-v1",
    excludedJsonPointers: ["/selfHash/digest"], digest: expected,
  }, `${label}.selfHash`, failures);
  const unhashed = structuredClone(value);
  if (unhashed?.selfHash) delete unhashed.selfHash.digest;
  if (createHash("sha256").update(canonicalJson(unhashed)).digest("hex") !== expected) {
    failures.push(`${label}: self-hash mismatch`);
  }
}

export function verifyP180T02Completion({ repoRoot = ROOT } = {}) {
  const failures = [];
  const checkpoint = readJson(repoRoot, T02_COMPLETION_CHECKPOINT_PATH, "T02 completion checkpoint", failures);
  const ownerReceipt = readJson(repoRoot, T02_OWNER_COMPLETION_RECEIPT_PATH, "T02 owner completion receipt", failures);
  if (sha256File(repoRoot, SECURITY_RECEIPT_PATH, "historical T02 security receipt", failures) !== SECURITY_RECEIPT_SHA256) {
    failures.push("historical T02 security receipt SHA-256 drift");
  }
  if (checkpoint) {
    checkKeys(checkpoint, [
      "schemaVersion", "checkpointId", "recordKind", "status", "ticketId", "authorizationId",
      "authorizationHash", "implementation", "historicalSecurityReceipt", "evidenceArtifacts",
      "commandEvidence", "modelEvidence", "securityEvidence", "dependencyBindings",
      "sourceAdoptionBindings", "forbiddenEffectEvidence", "noInheritedAuthority", "residuals",
      "recordedAt", "selfHash",
    ], "T02 completion checkpoint", failures);
    exact([checkpoint.schemaVersion, checkpoint.checkpointId, checkpoint.status, checkpoint.ticketId,
      checkpoint.authorizationId, checkpoint.authorizationHash], [1, "OBX-P180-T02-COMPLETION-001",
      "COMPLETED_VERIFIED", "OBX-P180-T02", T02_AUTHORIZATION_ID, AUTHORIZATION_SHA256],
    "T02 completion checkpoint.identity", failures);
    exact([checkpoint.implementation?.commit, checkpoint.implementation?.tree, checkpoint.implementation?.parentCommit],
      ["514d10d1b61e3332acb27e302adc20f353b64315", "90f3422b19237a6c5499500b272e95238559c1ab",
        "c9e3af6687c7454f61a8ce46a99f9fee7adf8db9"], "T02 completion checkpoint.implementation", failures);
    const storedFiles = (checkpoint.implementation?.files ?? []).map(({ path, algorithm, digest }) => ({ path, algorithm, digest }));
    exact(storedFiles, ALLOWED_PATHS.map((path) => checkpoint.implementation.files.find((row) => row.path === path))
      .map(({ path, algorithm, digest }) => ({ path, algorithm, digest })), "T02 completion checkpoint.file order", failures);
    checkBindings(repoRoot, storedFiles, "T02 completion checkpoint.files", failures);
    exact(checkpoint.historicalSecurityReceipt, {
      path: SECURITY_RECEIPT_PATH, algorithm: "sha256", digest: SECURITY_RECEIPT_SHA256,
      receiptKind: "solo-t02-security-review-v1", verdict: "PASS-WITH-ACCEPTED-RISK",
      storedBindingsAreHistorical: true, rehashLiveTargets: false,
    }, "T02 completion checkpoint.historicalSecurityReceipt", failures);
    exact(checkpoint.noInheritedAuthority, {
      predecessorCompletionIsEvidenceOnly: true, implementationAuthorizedTicketIds: [],
      deniedTicketIds: ["OBX-P180-T03", "OBX-P180-T04", "OBX-P180-T05", "OBX-P180-T06", "OBX-P180-T07", "OBX-P180-T08"],
    }, "T02 completion checkpoint.noInheritedAuthority", failures);
    validateSelfHash(checkpoint, T02_COMPLETION_CHECKPOINT_HASH, "T02 completion checkpoint", failures);
  }
  if (ownerReceipt) {
    checkKeys(ownerReceipt, ["schemaVersion", "receiptId", "recordKind", "status", "ticketId",
      "authorizationId", "checkpointBinding", "owner", "decision", "singleUseSuccessorPair",
      "concurrencyRatification", "derivedGovernanceWrite", "noInheritedAuthority", "invalidators", "recordedAt", "selfHash"],
    "T02 owner completion receipt", failures);
    exact(ownerReceipt.checkpointBinding?.digest, T02_COMPLETION_CHECKPOINT_HASH,
      "T02 owner completion receipt.checkpointBinding", failures);
    exact(ownerReceipt.singleUseSuccessorPair?.consumedByAuthorizationIds,
      ["OBX-AUTH-P180-T03-SOLO-001", "OBX-AUTH-P180-T04-SOLO-001"],
      "T02 owner completion receipt.successor pair", failures);
    const t03 = ownerReceipt.concurrencyRatification?.t03AllowedPaths ?? [];
    const t04 = ownerReceipt.concurrencyRatification?.t04AllowedPaths ?? [];
    if (new Set([...t03, ...t04]).size !== t03.length + t04.length) failures.push("T02 owner completion receipt: sibling paths overlap");
    if (ownerReceipt.noInheritedAuthority?.t02CompletionGrantsEvidenceOnly !== true
      || ownerReceipt.noInheritedAuthority?.t05ThroughT08ImplementationAuthorized !== false) {
      failures.push("T02 owner completion receipt: inherited authority drift");
    }
    exact(ownerReceipt.derivedGovernanceWrite, {
      status: "AUTHORIZED", authorizationKind: "DERIVED_INTEGRITY_REPIN_ONLY",
      writePaths: [
        "docs/plans/one-box-master/00-authority/authority-manifest.json",
        SOURCE_ADOPTION_REPIN_PATH,
      ],
      allowedManifestJsonPointers: ["/packetDigest"],
      authorizedEffects: [
        "refresh-verifier-derived-authority-manifest-packet-digest",
        "refresh-exact-source-adoption-authority-repin-receipt",
      ],
      derivationSource: "scripts/verify-plan-authority.mjs", singleUse: true,
      implementationAuthority: false, runtimeAuthority: false, providerAuthority: false,
      dependencyOrLockfileChangeAuthorized: false, sourceAdoptionArtifactChangeAuthorized: false,
      activationOrCompletionReceiptChangeAuthorized: false,
    }, "T02 owner completion receipt.derivedGovernanceWrite", failures);
    validateSelfHash(ownerReceipt, T02_OWNER_COMPLETION_RECEIPT_HASH, "T02 owner completion receipt", failures);
  }
  return { failures, checkpointHash: T02_COMPLETION_CHECKPOINT_HASH, ownerReceiptHash: T02_OWNER_COMPLETION_RECEIPT_HASH };
}

function validateUnavailableRoles(record, failures) {
  if (!Array.isArray(record.roleAvailability) || record.roleAvailability.length !== 3) {
    failures.push(`${T02_AUTHORIZATION_ID}.roleAvailability: exactly three rows required`);
    return;
  }
  const expected = UNAVAILABLE_ROLE_IDS.map((roleId) => ({
    roleId, assignmentStatus: "NOT_AVAILABLE", assignmentRecordPresent: false,
    humanActorId: null, escalationStatus: "NOT_AVAILABLE", escalationActorId: null,
    separationSatisfied: false,
  }));
  exact(record.roleAvailability, expected, `${T02_AUTHORIZATION_ID}.roleAvailability`, failures);
}

function validateAmendment(repoRoot, record, failures) {
  const amendment = readJson(repoRoot, AMENDMENT_PATH, "solo T02 amendment", failures);
  if (sha256File(repoRoot, AMENDMENT_PATH, "solo T02 amendment", failures) !== AMENDMENT_SHA256) {
    failures.push("solo T02 amendment: SHA-256 drift");
  }
  if (!amendment) return;
  const scalars = {
    schemaVersion: 1, amendmentId: AMENDMENT_ID,
    recordKind: "owner-solo-child-ticket-governance-amendment-v2", status: "ACTIVE",
    authorizationId: T02_AUTHORIZATION_ID, projectId: "one-box",
    branch: "research/la-appointment-field-study", baseCommit: T01_CHECKPOINT,
    activationBaseCommit: T01_CHECKPOINT, parentTicketId: "OBX-P180",
    standardWaiverEligible: false, nonWaivableDefaultPreserved: true,
    recordedAt: "2026-08-31T21:47:59Z", expiresAt: "2026-09-14T21:47:59Z", renewable: false,
  };
  for (const [field, expected] of Object.entries(scalars)) {
    if (amendment[field] !== expected) failures.push(`solo T02 amendment: ${field} drift`);
  }
  exact(amendment.childTicketIds, ["OBX-P180-T02"], "solo T02 amendment.childTicketIds", failures);
  exact(amendment.predecessor, {
    ticketId: "OBX-P180-T01", checkpointCommit: T01_CHECKPOINT, status: "COMPLETED_VERIFIED",
  }, "solo T02 amendment.predecessor", failures);
  exact(amendment.scope?.allowedPaths, ALLOWED_PATHS, "solo T02 amendment.scope.allowedPaths", failures);
  exact(amendment.scope?.allowedEffects, ["add-provider-offline-fixture-registries-and-route-reducers"], "solo T02 amendment.scope.allowedEffects", failures);
  exact(amendment.scope?.forbiddenEffects, FORBIDDEN_EFFECTS, "solo T02 amendment.scope.forbiddenEffects", failures);
  exact(amendment.reviewProtocol, REVIEW_PROTOCOL, "solo T02 amendment.reviewProtocol", failures);
  exact(amendment.requiredEvidencePaths, [SECURITY_RECEIPT_PATH], "solo T02 amendment.requiredEvidencePaths", failures);
  exact(amendment.independentHumanReview, { status: "NOT_AVAILABLE", satisfied: false, actorId: null }, "solo T02 amendment.independentHumanReview", failures);
  if (amendment.ownerDirection?.decision !== "ACCEPT_EXACT_SOLO_T02_RISK_AND_START"
    || amendment.ownerDirection?.actorId !== "person:devin-wiggins") {
    failures.push("solo T02 amendment.ownerDirection: exact owner decision drift");
  }
  if (record?.amendmentBinding?.digest !== AMENDMENT_SHA256) failures.push(`${T02_AUTHORIZATION_ID}.amendmentBinding: digest drift`);
}

function validateSecurityReceipt(repoRoot, record, failures) {
  const label = `${T02_AUTHORIZATION_ID}.securityReceipt`;
  const receipt = readJson(repoRoot, SECURITY_RECEIPT_PATH, label, failures);
  if (sha256File(repoRoot, SECURITY_RECEIPT_PATH, label, failures) !== SECURITY_RECEIPT_SHA256) {
    failures.push(`${label}: immutable receipt SHA-256 drift`);
  }
  if (!receipt) return;
  checkKeys(receipt, [
    "schemaVersion", "receiptKind", "authorizationId", "authorizationHash", "amendmentId",
    "amendmentHash", "baseCommit", "targetPaths", "targetHashes", "verdict", "findings",
    "independentHumanReview", "capturedAt",
  ], label, failures);
  const scalars = {
    schemaVersion: 1, receiptKind: "solo-t02-security-review-v1",
    authorizationId: T02_AUTHORIZATION_ID, authorizationHash: AUTHORIZATION_SHA256,
    amendmentId: AMENDMENT_ID, amendmentHash: AMENDMENT_SHA256, baseCommit: T01_CHECKPOINT,
    verdict: "PASS-WITH-ACCEPTED-RISK",
  };
  for (const [field, expected] of Object.entries(scalars)) {
    if (receipt[field] !== expected) failures.push(`${label}: ${field} drift`);
  }
  exact(receipt.independentHumanReview, { status: "NOT_AVAILABLE", satisfied: false }, `${label}.independentHumanReview`, failures);
  const expectedTargets = ACTIVATION_WRITE_SET.slice(0, -1);
  exact(receipt.targetPaths, expectedTargets, `${label}.targetPaths`, failures);
  exact(receipt.targetHashes, HISTORICAL_SECURITY_TARGET_HASHES, `${label}.targetHashes`, failures);
  for (const [index, binding] of (receipt.targetHashes ?? []).entries()) {
    checkKeys(binding, ["path", "algorithm", "digest"], `${label}.targetHashes[${index}]`, failures);
    if (binding?.algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(binding?.digest ?? "")) {
      failures.push(`${label}.targetHashes[${index}]: invalid stored SHA-256 binding`);
    }
  }
  if (!Array.isArray(receipt.findings) || receipt.findings.length !== 1) {
    failures.push(`${label}.findings: sole accepted separation finding required`);
    return;
  }
  const finding = receipt.findings[0];
  if (finding?.findingId !== "OBX-P180-T02-SOLO-SEPARATION-001"
    || finding?.severity !== "MEDIUM" || finding?.status !== "ACCEPTED") {
    failures.push(`${label}.findings[0]: accepted finding drift`);
  }
  const expectedSurfaces = ["prompt-injection", "secrets", "authentication", "authorization", "untrusted-input", "export"];
  if (finding?.surfaceDisposition?.map((row) => row.surface).join("\n") !== expectedSurfaces.join("\n")) {
    failures.push(`${label}.findings[0].surfaceDisposition: exact six-surface drift`);
  }
  for (const row of finding?.surfaceDisposition ?? []) {
    if (!Array.isArray(row.changedPathEvidence) || row.changedPathEvidence.length === 0
      || row.changedPathEvidence.some((path) => !expectedTargets.includes(path))) {
      failures.push(`${label}.surfaceDisposition.${row.surface}: invalid changed-path evidence`);
    }
  }
}

export function verifyP180T02Authorization({ repoRoot = ROOT, registry, verifyReceipt = true, verifyCompletion = true } = {}) {
  const failures = [];
  const source = registry ?? readJson(repoRoot, "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", "scoped implementation authority", failures);
  const record = source?.authorizations?.find((candidate) => candidate?.id === T02_AUTHORIZATION_ID);
  if (!record) return { failures: [...failures, `${T02_AUTHORIZATION_ID}: missing exact authorization record`] };
  checkKeys(record, EXPECTED_RECORD_KEYS, T02_AUTHORIZATION_ID, failures);
  const scalars = {
    id: T02_AUTHORIZATION_ID, recordKind: "owner-solo-child-ticket-exception-v2",
    status: "authorized-with-solo-exception", implementationAuthorized: true,
    projectId: "one-box", branch: "research/la-appointment-field-study",
    baseCommit: T01_CHECKPOINT, activationBaseCommit: T01_CHECKPOINT,
    parentTicketId: "OBX-P180", parentTicketStatus: "proposed",
    authorizationProposalId: "OBX-AUTH-P180-OFFLINE-V1",
    ownerActorId: "person:devin-wiggins", riskOwnerActorId: "person:devin-wiggins",
    implementationActorId: "person:devin-wiggins", authorizedByActorId: "person:devin-wiggins",
    ownerAssignmentV1Status: "NOT_AVAILABLE", recordedAt: "2026-08-31T21:47:59Z",
    expiresAt: "2026-09-14T21:47:59Z", renewable: false,
  };
  for (const [field, expected] of Object.entries(scalars)) {
    if (record[field] !== expected) failures.push(`${T02_AUTHORIZATION_ID}: ${field} drift`);
  }
  exact(record.activationWriteSet, ACTIVATION_WRITE_SET, `${T02_AUTHORIZATION_ID}.activationWriteSet`, failures);
  exact(record.childTicketIds, ["OBX-P180-T02"], `${T02_AUTHORIZATION_ID}.childTicketIds`, failures);
  exact(record.allowedPaths, ALLOWED_PATHS, `${T02_AUTHORIZATION_ID}.allowedPaths`, failures);
  exact(record.allowedEffects, ["add-provider-offline-fixture-registries-and-route-reducers"], `${T02_AUTHORIZATION_ID}.allowedEffects`, failures);
  exact(record.forbiddenEffects, FORBIDDEN_EFFECTS, `${T02_AUTHORIZATION_ID}.forbiddenEffects`, failures);
  exact(record.reviewProtocol, REVIEW_PROTOCOL, `${T02_AUTHORIZATION_ID}.reviewProtocol`, failures);
  exact(record.requiredEvidencePaths, [SECURITY_RECEIPT_PATH], `${T02_AUTHORIZATION_ID}.requiredEvidencePaths`, failures);
  exact(record.preExistingUntrackedBaseline, [{
    path: ".claude/handoffs/one-box-operating-environment-next-phase.md", algorithm: "sha256",
    digest: "cbbc878aa0691f333b128a71aee43adde89a9691a9ed65880f1f2b41a20643a6",
  }], `${T02_AUTHORIZATION_ID}.preExistingUntrackedBaseline`, failures);
  validateUnavailableRoles(record, failures);
  exact(record.implementationAuthorizationSeparation, { status: "NOT_AVAILABLE", satisfied: false }, `${T02_AUTHORIZATION_ID}.implementationAuthorizationSeparation`, failures);
  exact(record.escalation, { status: "NOT_AVAILABLE", actorId: null }, `${T02_AUTHORIZATION_ID}.escalation`, failures);
  exact(record.independentHumanReview, { status: "NOT_AVAILABLE", satisfied: false, actorId: null }, `${T02_AUTHORIZATION_ID}.independentHumanReview`, failures);
  exact(record.acceptedRisk, {
    findingId: "OBX-P180-T02-SOLO-SEPARATION-001", severity: "MEDIUM", status: "ACCEPTED",
    reasonCode: "SOLO_OWNER_SEPARATION_UNAVAILABLE",
  }, `${T02_AUTHORIZATION_ID}.acceptedRisk`, failures);
  checkBindings(repoRoot, record.predecessorBinding?.files, `${T02_AUTHORIZATION_ID}.predecessorBinding.files`, failures);
  exact({
    ticketId: record.predecessorBinding?.ticketId,
    checkpointCommit: record.predecessorBinding?.checkpointCommit,
    status: record.predecessorBinding?.status,
  }, { ticketId: "OBX-P180-T01", checkpointCommit: T01_CHECKPOINT, status: "COMPLETED_VERIFIED" }, `${T02_AUTHORIZATION_ID}.predecessorBinding`, failures);
  checkBindings(repoRoot, record.planBindings, `${T02_AUTHORIZATION_ID}.planBindings`, failures);
  checkBindings(repoRoot, record.governanceBindings, `${T02_AUTHORIZATION_ID}.governanceBindings`, failures);
  checkBindings(repoRoot, record.dependencyBindings, `${T02_AUTHORIZATION_ID}.dependencyBindings`, failures);
  validateAmendment(repoRoot, record, failures);
  const recordedAt = Date.parse(record.recordedAt);
  const expiresAt = Date.parse(record.expiresAt);
  if (!Number.isFinite(recordedAt) || !Number.isFinite(expiresAt) || expiresAt - recordedAt !== 1_209_600_000) {
    failures.push(`${T02_AUTHORIZATION_ID}: expiry must be exactly 336 hours`);
  }
  if (Date.now() > expiresAt) failures.push(`${T02_AUTHORIZATION_ID}: authorization is expired`);
  checkKeys(record.authorizationHash, ["algorithm", "canonicalization", "excludedJsonPointers", "digest"], `${T02_AUTHORIZATION_ID}.authorizationHash`, failures);
  const unhashed = structuredClone(record);
  delete unhashed.authorizationHash.digest;
  const actualHash = createHash("sha256").update(canonicalJson(unhashed)).digest("hex");
  if (actualHash !== AUTHORIZATION_SHA256 || record.authorizationHash?.digest !== AUTHORIZATION_SHA256) {
    failures.push(`${T02_AUTHORIZATION_ID}: authorization self-hash mismatch`);
  }
  if (verifyReceipt) validateSecurityReceipt(repoRoot, record, failures);
  if (verifyCompletion) failures.push(...verifyP180T02Completion({ repoRoot }).failures);
  return { failures, authorizationHash: AUTHORIZATION_SHA256 };
}
