import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  T02_AUTHORIZATION_ID,
  verifyP180T02Authorization,
  verifyP180T02Completion,
} from "./verify-p180-t02-authorization.mjs";
import {
  T03_AUTHORIZATION_ID,
  T04_AUTHORIZATION_ID,
  verifyP180SiblingAuthorization,
} from "./verify-p180-t03-authorization.mjs";
import {
  T03_CORRECTION_AUTHORIZATION_ID,
  T04_CORRECTION_AUTHORIZATION_ID,
} from "./verify-p180-phase1-correction-authorization.mjs";
import {
  T03_SUPERSESSION_AUTHORIZATION_ID,
  T04_SUPERSESSION_AUTHORIZATION_ID,
  historicalVerificationCommitForSupersessionState,
  verifyPhase1SupersedingCorrectionAuthorizations,
} from "./verify-p180-phase1-superseding-correction-authorization.mjs";

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const failures = [];
const digestInputs = new Map();

const allowedClasses = new Set([
  "owner-approved",
  "owner-approved-direction",
  "owner-approved-architecture",
  "proposed",
  "draft",
  "research",
  "rejected",
  "historical",
]);
const ownerApprovedClasses = new Set([
  "owner-approved",
  "owner-approved-direction",
  "owner-approved-architecture",
]);
const ticketStatuses = new Set([
  "proposed",
  "in-review",
  "blocked",
  "ready",
  "in-progress",
  "verification",
  "done",
]);
const ticketPriorities = new Set(["P0", "P1", "P2", "P3"]);
const activeTicketStatuses = new Set(["ready", "in-progress", "verification", "done"]);
const evaluationTiers = new Set(["T0", "T1", "T2", "T3", "T4", "T5"]);
const evaluationStatuses = new Set(["planned", "active", "retired"]);
const decisions = new Set([
  "retain",
  "adopt",
  "adapt",
  "evaluate",
  "learn",
  "needs-license-review",
  "blocked",
  "reject",
]);
const allowedUseDecisions = new Set(["retain", "adopt"]);
const expectedDomains = {
  "website-source": ["docs/specs/2026-08-22-page-ir-safe-pipeline-prd.md", "owner-approved"],
  canvas: ["docs/specs/2026-08-16-canvas-upgrade.md", "owner-approved"],
  "website-lifecycle": ["docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md", "owner-approved-direction"],
  "program-order": ["docs/superpowers/plans/2026-08-27-canvas-to-agency-shipping-roadmap.md", "owner-approved-direction"],
  "appointment-acquisition": ["docs/specs/2026-08-27-appointment-acquisition-v1-prd.md", "owner-approved-architecture"],
  "engineering-operating-system": ["docs/plans/one-box-master/00-authority/2026-08-29-engineering-operating-system-and-gap-register.md", "proposed"],
  "release-1": ["docs/plans/one-box-master/01-foundation/release-1-contract.md", "proposed"],
  compatibility: ["docs/plans/one-box-master/01-foundation/release-1-compatibility-matrix.md", "proposed"],
  "target-topology": ["docs/adr/0002-target-desktop-cloud-topology.md", "proposed"],
  "program-security": ["docs/security/2026-08-29-program-threat-model.md", "proposed"],
  "program-evaluation": ["docs/eval/one-box-program/evaluation-strategy.md", "proposed"],
  "supply-chain": ["docs/security/supply-chain-policy.md", "proposed"],
  "program-tickets": ["docs/tickets/one-box-program/manifest.json", "proposed"],
  "mpa-reconciliation": ["docs/plans/one-box-master/00-authority/2026-08-29-mpa-reconciliation.md", "proposed"],
  "operating-environment": ["docs/superpowers/specs/2026-08-29-canvas-operating-environment-design.md", "draft"],
  "embedded-browser": ["docs/plans/2026-08-29-embedded-browser-integration.md", "proposed"],
  "technology-adoption": ["docs/plans/one-box-master/06-technology/technology-adoption-roadmap.md", "research"],
};
const expectedTeammateFoundationScope = {
  fullProgramAuthorization: false,
  productionReleaseAuthorized: false,
  deploymentAuthorized: false,
  newRuntimeDependenciesAllowed: false,
  runtimeDependencies: [],
  allowedEffectClasses: ["read", "propose"],
  allowedDataClasses: ["public", "project-internal"],
  allowedPathPrefixes: [
    "src/lib/aiTeammates/",
    "src/app/api/ai-teammates/",
    "src/components/preview/AiTeammate/",
  ],
  allowedExactPaths: [
    "src/lib/contracts.ts",
    "src/lib/contracts.test.ts",
    "src/components/preview/Workbench.tsx",
    "src/app/styles/workbench.css",
    "docs/architecture/README.md",
    "docs/security/local-api-threat-model.md",
    "scripts/e2e/canvas-contract.mjs",
    "scripts/e2e/canvas-coverage.mjs",
    "scripts/e2e/preview-workbench.mjs",
  ],
  supportingEvidencePrefixes: [
    "docs/audits/grok-4.6/2026-08-29-ai-teammate-foundation-",
    "docs/audits/evidence/goal/2026-08-29-ai-teammate-foundation-",
    "docs/verification/2026-08-29-ai-teammate-foundation-",
    "docs/audits/grok-4.6/2026-08-30-ai-teammate-foundation-",
    "docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-",
    "docs/audits/evidence/2026-08-30-ai-teammate-foundation-",
    "docs/audits/evidence/security/2026-08-30-ai-teammate-foundation-",
    "docs/verification/2026-08-30-ai-teammate-foundation-",
  ],
  prohibitedCapabilities: [
    "provider-call",
    "network",
    "credentials",
    "filesystem",
    "shell",
    "browser",
    "mutate",
    "external-effect",
    "authority",
    "background-process",
    "persistent-storage",
    "deep-agents",
    "langgraph",
    "langsmith",
    "deployment",
    "release",
  ],
};
const expectedTeammateFoundationCanonicalDocs = [
  "docs/architecture/README.md",
  "docs/security/local-api-threat-model.md",
];
const expectedTeammateFoundationE2eHarnesses = [
  "scripts/e2e/canvas-contract.mjs",
  "scripts/e2e/canvas-coverage.mjs",
  "scripts/e2e/preview-workbench.mjs",
];
const expectedTeammateFoundationInvalidators = [
  "scope-expansion",
  "prohibited-effect",
  "runtime-dependency-addition",
  "provider-or-network-connection",
  "deployment-or-release-target",
];
const expectedTeammateFoundationReview = {
  exactModel: "x-ai/grok-4.6",
  securityReview: true,
  independentVerification: true,
  targetChangeInvalidatesReview: true,
  dependencyDiffMustRemainEmpty: true,
  prohibitedCapabilityScanRequired: true,
  sharedFileDiffReviewRequired: true,
};
const expectedTeammateFoundationTicket = {
  id: "OBX-AT-001",
  title: "Build the native read/propose teammate foundation",
  status: "ready",
  priority: "P1",
  requirements: ["E1"],
  file: "OBX-AT-001.md",
};
const expectedTeammateFoundationTicketStatusPolicy = {
  currentStatus: "ready",
  allowedSequence: ["ready", "in-progress", "in-review:implementation", "verified", "done"],
  automaticTransitionAllowed: false,
  transitionRequires: [
    "explicit-owner-direction",
    "manifest-and-ticket-body-sync",
    "verifier-invariant-and-negative-test-update",
    "authority-packet-digest-refresh",
    "same-target-review-evidence",
  ],
};
const soloAmendmentPath = "docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json";
const expectedSoloAmendmentSha256 = "eb932d7e0a6cd12fa2cfa6570afbcad452bbdf8481047c700aaf3eec4075d202";
const expectedSoloControlIds = [
  "owner-assignment-v1-t01",
  "implementation-lead",
  "model-skill-security-owner",
  "job-sandbox-owner",
  "implementation-actor-authorizer-separation",
  "independent-human-security-review",
];
const expectedSoloRequirementExceptions = [
  {
    requirementId: "P180-R014",
    exceptionStatus: "EXCEPT_T01_SOLO",
    satisfactionStatus: "NOT_SATISFIED",
    waivedClauses: [
      "named-human-operating-role-coverage-for-three-t01-roles",
      "accepted-current-owner-assignment-v1-records",
      "distinct-per-role-escalation-humans",
    ],
  },
  {
    requirementId: "P180-R015",
    exceptionStatus: "EXCEPT_T01_SOLO",
    satisfactionStatus: "NOT_SATISFIED",
    waivedClauses: ["t01-current-owner-assignment-entry-gate"],
  },
  {
    requirementId: "P180-R016",
    exceptionStatus: "EXCEPT_T01_SOLO",
    satisfactionStatus: "NOT_SATISFIED",
    waivedClauses: [
      "implementation-lead-authorizer-separation",
      "ordinary-exact-owner-roster",
    ],
  },
];
const expectedSoloAllowedPaths = [
  "src/lib/operatingEnvironment/canonical.ts",
  "src/lib/operatingEnvironment/canonical.test.ts",
  "src/lib/operatingEnvironment/contracts.ts",
  "src/lib/operatingEnvironment/contracts.test.ts",
  "src/lib/operatingEnvironment/reasonCodes.ts",
  "src/lib/operatingEnvironment/reasonCodes.test.ts",
];
const expectedSoloForbiddenEffects = [
  "product-runtime-import-or-effect",
  "provider-or-model-call",
  "network",
  "credential-or-environment-access",
  "filesystem-or-shell-io",
  "persistence-or-durable-state",
  "queue-or-background-worker",
  "browser",
  "ui",
  "collaboration",
  "canvas-or-page-ir-read-write-or-mutation",
  "deployment",
  "release",
  "dependency-or-lockfile-change",
  "mutable-global-state",
  "clock-or-randomness",
  "authority-outside-exact-solo-record",
  "t02-through-t08",
  "parent-evaluation-completion-claim",
  "independent-human-review-claim",
  "production-readiness-claim",
];
const expectedSoloEvidencePaths = [
  "docs/audits/evidence/security/2026-08-30-obx-p180-t01-solo-authorization-security-review.json",
  "docs/audits/grok-4.6/2026-08-30-obx-p180-solo-t01-authorization-final-audit.json",
  "docs/audits/fable-5/2026-08-30-obx-p180-solo-t01-authorization-final-audit.json",
];
const expectedSoloEvidenceSha256 = new Map([
  [expectedSoloEvidencePaths[0], "4b2ed13583cdb56daa0b0d2c9cf59c79c555ca4992061d0ee5122a3d4d949164"],
  [expectedSoloEvidencePaths[1], "79af34735958e0c1472d921cae377cc022339d215175417814ab03f88098d10b"],
  [expectedSoloEvidencePaths[2], "7e33ef3f3d5d7dcd9bb7f0148dc5f965b82e2234723a896abdc83be896dc81d5"],
]);
const expectedSoloCompensatingControls = [
  "exact-t01-only-scope",
  "exact-336-hour-non-renewable-expiry",
  "deny-every-unlisted-path-and-effect",
  "pure-deterministic-computation-with-no-io",
  "exact-amendment-and-authorization-hash-binding",
  "exact-security-grok-fable-receipt-parsing",
  "independent-human-review-remains-not-available",
];
const expectedSoloGovernanceHashes = new Map([
  ["docs/governance/risk-exceptions/README.md", "c5139be92b42987e70d73b6851530d4917c8716b96cfcfbda1c7e9a685f726c2"],
  ["docs/governance/reviewer-roles.md", "ea1f4cf440ce3122bf40866c0097c516550d876e9674462bbe61edc7dcb701bc"],
]);
const soloAuthorizationId = "OBX-AUTH-P180-T01-SOLO-001";
const expectedAtfCanonicalSha256 = "1d46a9476b9cda04727e02cd171bf7d700352deec045cd673011b23034315a3f";
const expectedSoloAuthorizationSha256 = "7dc3ab642004bdb8980c0f9d63dc1631ce89252783aeee1883f1b2a55be8e7ce";
const expectedAuthorityWithoutDigestSha256 = "e3e465714c5426aa6cb900b9892ea07946a8fdc24b4f0c4cdcb6411331b95597";
const expectedSoloActivationWriteSet = [
  "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json",
  "docs/plans/one-box-master/00-authority/authority-manifest.json",
  soloAmendmentPath,
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
  ...expectedSoloEvidencePaths,
];
const expectedSoloUntrackedBaseline = [{
  path: ".claude/handoffs/one-box-operating-environment-next-phase.md",
  algorithm: "sha256",
  digest: "cbbc878aa0691f333b128a71aee43adde89a9691a9ed65880f1f2b41a20643a6",
}];
const expectedSoloRoleIds = [
  "implementation-lead",
  "model-skill-security-owner",
  "job-sandbox-owner",
];
const expectedSoloFrozenArtifacts = [
  ["docs/plans/one-box-master/04-operating-environment/obx-p180/README.md", "a7f6ec197adebdc935b5e01251da4735d471c0fc443453f9aeeaca284464a017"],
  ["docs/plans/one-box-master/04-operating-environment/obx-p180/01-gap-and-conflict-matrix.md", "f7bd960de6efc56185ff974a5078ade94bb0dbd28d188978d1001e133c546604"],
  ["docs/plans/one-box-master/04-operating-environment/obx-p180/02-provider-registry-and-route-contract.md", "61ab80eb579df514a5627f4d5ecb4133c61497c6e0a7895fb22e6581729be13d"],
  ["docs/plans/one-box-master/04-operating-environment/obx-p180/03-skills-context-and-receipts.md", "7755dee982a321a318843d6ce41d24b087032f533d4796283d8096c68227d31d"],
  ["docs/plans/one-box-master/04-operating-environment/obx-p180/04-budget-capacity-compare-failure.md", "e67002acfeea154a8376513fdf16add713af6ad436d68813e7c7158fd614d31b"],
  ["docs/plans/one-box-master/04-operating-environment/obx-p180/05-security-and-executable-evaluations.md", "13f99c0d6bd5a165625fbaf614ab4d9e67055570dd1d96c71d348bdec444314c"],
  ["docs/plans/one-box-master/04-operating-environment/obx-p180/06-ownership-tickets-and-authorization-proposal.md", "385e3c046528abe7f9a7307421741386fa0abf032f06e094745833feaa3370af"],
  ["docs/plans/one-box-master/04-operating-environment/obx-p180/07-closure-and-disposition.md", "ce4bb95623bc4c3eaef29475f7b582e5feec266063da0cfc0753483e00cc8420"],
  ["docs/eval/one-box-program/fixtures/capacity-and-cost-fixture-v1.json", "81ab1796a7f706d84ceae54c0539e725b1b95c821ebe56d02af6b1c85c1fc738"],
  ["docs/eval/one-box-program/fixtures/obx-p180-security-fixture-v1.json", "ce368d420953f6f8996f2b4902c2fd7e3916f2f43e0bd3a0d578c07580091940"],
  ["docs/eval/one-box-program/fixtures/obx-p180-human-decision-fixture-v1.json", "3d32ec35ee532b8acb15de1ab780bebdd828e371dc65fef491cbe491fabc6d11"],
  ["docs/eval/one-box-program/fixtures/obx-p180-apply-eligibility-fixture-v1.json", "ad5116d85ac2ecc8ded78f209aee16c8a58adb3c569f58a7a1fdfb2c810ff0cf"],
  ["scripts/eval/obx-p180-contract-fixtures.mjs", "19567521a37d524f654c6e241879a349a7c522f8a40681d08fd706ff6b36dfab"],
  ["scripts/eval/obx-p180-contract-fixtures.test.mjs", "141ed3114269cb88c8725dc9b56c736914b38a7c8abcc8dce7523eb2bbd1f4a6"],
  ["scripts/eval/grok-audit.mjs", "400238ae208ce5b2c426303ead6500a1049b9b94ced45934796a3c1f67d8f473"],
].map(([path, digest]) => ({ path, algorithm: "sha256", digest }));
const expectedSoloGovernanceBindings = [...expectedSoloGovernanceHashes].map(([path, digest]) => ({ path, algorithm: "sha256", digest }));
const expectedSoloDependencyBindings = [
  { path: "package.json", algorithm: "sha256", digest: "c1feab7cc337c89a59d344da2854764b488a831bf40ab6e98d00338a5a7d421e" },
  { path: "package-lock.json", algorithm: "sha256", digest: "b2f15e1f27c86ad1c2b98a67674367ce8ada5fb9ba6d32702f9de4bd09a66191" },
];
const expectedSoloInvalidators = [
  "base-commit-mismatch",
  "authorization-hash-mismatch",
  "packet-artifact-path-or-hash-drift",
  "source-plan-path-or-hash-drift",
  "governance-default-path-or-hash-drift",
  "amendment-path-id-schema-or-hash-drift",
  "receipt-path-schema-target-or-hash-drift",
  "timestamp-invalid-expired-or-renewal",
  "assignment-or-separation-claim",
  "requirement-exception-drift",
  "allowed-path-or-effect-drift",
  "dependency-or-lockfile-change",
  "product-runtime-or-io-effect",
  "provider-network-credential-or-environment-effect",
  "persistence-queue-or-background-effect",
  "browser-ui-or-collaboration-effect",
  "canvas-or-page-ir-effect",
  "deployment-or-release-effect",
  "parent-ticket-or-evaluation-promotion",
  "t02-through-t08-authority",
  "gate-failure",
  "additional-unaccepted-finding",
  "independent-review-or-production-readiness-claim",
];
const expectedSoloRecordKeys = [
  "id", "recordKind", "status", "implementationAuthorized", "projectId", "branch",
  "baseCommit", "activationBaseCommit", "activationWriteSet", "preExistingUntrackedBaseline",
  "parentTicketId", "parentTicketStatus", "childTicketIds", "authorizationProposalId",
  "ownerActorId", "riskOwnerActorId", "implementationActorId", "authorizedByActorId",
  "ownerAssignmentV1Status", "roleAvailability", "implementationAuthorizationSeparation",
  "escalation", "independentHumanReview", "acceptedRisk", "requirementExceptions",
  "traceabilityRefs", "allowedPaths", "allowedEffects", "forbiddenEffects", "frozenArtifacts",
  "planPacketBinding", "sourcePlanBinding", "governanceBindings", "dependencyBindings",
  "amendmentBinding", "requiredEvidencePaths", "invalidators", "recordedAt", "expiresAt",
  "renewable", "authorizationHash",
];
const expectedSecurityReceiptTargets = expectedSoloActivationWriteSet.slice(0, 5);
const expectedGrokReceiptTargets = [...expectedSecurityReceiptTargets, expectedSoloEvidencePaths[0]];
const expectedFableReceiptTargets = [...expectedGrokReceiptTargets, expectedSoloEvidencePaths[1]];

function fail(message) {
  failures.push(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknownKeys(value, allowedKeys, label) {
  if (!isPlainObject(value)) return;
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label}: unknown key ${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) fail(`${label}: missing key ${key}`);
  }
}

function readText(path, label = path) {
  const absolute = safeFile(path, label);
  if (!absolute) return null;
  try {
    return readFileSync(absolute, "utf8");
  } catch (error) {
    fail(`${label}: cannot read (${error.message})`);
    return null;
  }
}

function readJson(path) {
  const text = readText(path);
  if (text === null) return null;
  try {
    const value = JSON.parse(text);
    if (!isPlainObject(value)) {
      fail(`${path}: top level must be a JSON object`);
      return null;
    }
    return value;
  } catch (error) {
    fail(`${path}: invalid JSON (${error.message})`);
    return null;
  }
}

function sha256File(path, label = path) {
  const text = readText(path, label);
  return text === null ? null : createHash("sha256").update(text).digest("hex");
}

function exactJson(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label}: exact value drift`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalSha256(value, trailingNewline = false) {
  return createHash("sha256").update(`${canonicalJson(value)}${trailingNewline ? "\n" : ""}`).digest("hex");
}

function validateHashBindings(actual, expected, label, shouldRead = true) {
  exactJson(actual, expected, label);
  for (const binding of expected) {
    rejectUnknownKeys(actual?.find((candidate) => candidate?.path === binding.path), ["path", "algorithm", "digest"], `${label}.${binding.path}`);
    const readCurrentBytes = shouldRead === "when-present" ? existsSync(binding.path) : shouldRead;
    if (readCurrentBytes && sha256File(binding.path, `${label}.${binding.path}`) !== binding.digest) {
      fail(`${label}: current hash drift ${binding.path}`);
    }
  }
}

function validateSoloAmendment(amendment) {
  const label = "solo T01 amendment";
  const digest = sha256File(soloAmendmentPath, label);
  if (digest !== expectedSoloAmendmentSha256) {
    fail(`${label}: SHA-256 drift; expected ${expectedSoloAmendmentSha256}`);
  }
  if (!amendment) return;

  rejectUnknownKeys(amendment, [
    "schemaVersion",
    "amendmentId",
    "recordKind",
    "status",
    "authorizationId",
    "projectId",
    "branch",
    "baseCommit",
    "activationBaseCommit",
    "parentTicketId",
    "childTicketIds",
    "ownerDirection",
    "standardWaiverEligible",
    "nonWaivableDefaultPreserved",
    "unavailableControls",
    "requirementExceptions",
    "acceptedRisk",
    "scope",
    "requiredEvidencePaths",
    "compensatingControls",
    "independentHumanReview",
    "recordedAt",
    "expiresAt",
    "renewable",
  ], label);

  const exactScalars = {
    schemaVersion: 1,
    amendmentId: "OBX-P180-T01-SOLO-AMENDMENT-001",
    recordKind: "owner-solo-child-ticket-governance-amendment-v1",
    status: "ACTIVE",
    authorizationId: "OBX-AUTH-P180-T01-SOLO-001",
    projectId: "one-box",
    branch: "research/la-appointment-field-study",
    baseCommit: "b6486fdfa4601b315944ad099bf2beba1c053e91",
    activationBaseCommit: "66f9afeaaf1e9b37d4bd1ef5437a88e1f6a425bd",
    parentTicketId: "OBX-P180",
    standardWaiverEligible: false,
    nonWaivableDefaultPreserved: true,
    renewable: false,
  };
  for (const [field, expected] of Object.entries(exactScalars)) {
    if (amendment[field] !== expected) fail(`${label}: ${field} drift`);
  }
  exactJson(amendment.childTicketIds, ["OBX-P180-T01"], `${label}.childTicketIds`);

  rejectUnknownKeys(amendment.ownerDirection, ["actorId", "name", "sourceThreadId", "decision", "recordedAt"], `${label}.ownerDirection`);
  exactJson(amendment.ownerDirection, {
    actorId: "person:devin-wiggins",
    name: "Devin Wiggins",
    sourceThreadId: "01a0553b-ef7d-7b42-9f59-7204480be636",
    decision: "ACCEPT_EXACT_SOLO_T01_RISK",
    recordedAt: "2026-08-31T13:33:33Z",
  }, `${label}.ownerDirection`);

  if (!Array.isArray(amendment.unavailableControls) || amendment.unavailableControls.length !== expectedSoloControlIds.length) {
    fail(`${label}: unavailableControls must contain exactly six rows`);
  }
  for (const [index, controlId] of expectedSoloControlIds.entries()) {
    const control = amendment.unavailableControls?.[index];
    rejectUnknownKeys(control, [
      "controlId",
      "assignmentStatus",
      "assignmentRecordPresent",
      "humanActorId",
      "escalationStatus",
      "escalationActorId",
      "separationSatisfied",
    ], `${label}.unavailableControls[${index}]`);
    exactJson(control, {
      controlId,
      assignmentStatus: "NOT_AVAILABLE",
      assignmentRecordPresent: false,
      humanActorId: null,
      escalationStatus: "NOT_AVAILABLE",
      escalationActorId: null,
      separationSatisfied: false,
    }, `${label}.unavailableControls[${index}]`);
  }

  for (const [index, requirement] of expectedSoloRequirementExceptions.entries()) {
    rejectUnknownKeys(amendment.requirementExceptions?.[index], [
      "requirementId",
      "exceptionStatus",
      "satisfactionStatus",
      "waivedClauses",
    ], `${label}.requirementExceptions[${index}]`);
    exactJson(amendment.requirementExceptions?.[index], requirement, `${label}.requirementExceptions[${index}]`);
  }
  if (amendment.requirementExceptions?.length !== expectedSoloRequirementExceptions.length) {
    fail(`${label}: requirementExceptions must contain exactly P180-R014 through P180-R016`);
  }

  rejectUnknownKeys(amendment.acceptedRisk, ["findingId", "severity", "status", "reasonCode", "riskOwnerActorId"], `${label}.acceptedRisk`);
  exactJson(amendment.acceptedRisk, {
    findingId: "OBX-P180-T01-SOLO-SEPARATION-001",
    severity: "MEDIUM",
    status: "ACCEPTED",
    reasonCode: "SOLO_OWNER_SEPARATION_UNAVAILABLE",
    riskOwnerActorId: "person:devin-wiggins",
  }, `${label}.acceptedRisk`);

  rejectUnknownKeys(amendment.scope, ["denyUnlistedPathsAndEffects", "allowedPaths", "allowedEffects", "forbiddenEffects"], `${label}.scope`);
  if (amendment.scope?.denyUnlistedPathsAndEffects !== true) fail(`${label}.scope: deny-unlisted drift`);
  exactJson(amendment.scope?.allowedPaths, expectedSoloAllowedPaths, `${label}.scope.allowedPaths`);
  exactJson(amendment.scope?.allowedEffects, ["add-pure-closed-contract-types-and-validators"], `${label}.scope.allowedEffects`);
  exactJson(amendment.scope?.forbiddenEffects, expectedSoloForbiddenEffects, `${label}.scope.forbiddenEffects`);
  for (const path of amendment.scope?.allowedPaths ?? []) validateAuthorizedPath(path, `${label}.scope.allowedPaths`);

  exactJson(amendment.requiredEvidencePaths, expectedSoloEvidencePaths, `${label}.requiredEvidencePaths`);
  exactJson(amendment.compensatingControls, expectedSoloCompensatingControls, `${label}.compensatingControls`);
  rejectUnknownKeys(amendment.independentHumanReview, ["status", "satisfied", "actorId"], `${label}.independentHumanReview`);
  exactJson(amendment.independentHumanReview, {
    status: "NOT_AVAILABLE",
    satisfied: false,
    actorId: null,
  }, `${label}.independentHumanReview`);

  const canonicalTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  if (!canonicalTimestamp.test(amendment.recordedAt ?? "") || !canonicalTimestamp.test(amendment.expiresAt ?? "")) {
    fail(`${label}: timestamps must be canonical RFC3339 UTC seconds`);
  }
  const recordedAt = Date.parse(amendment.recordedAt);
  const expiresAt = Date.parse(amendment.expiresAt);
  if (!Number.isFinite(recordedAt) || !Number.isFinite(expiresAt) || expiresAt - recordedAt !== 1_209_600_000) {
    fail(`${label}: expiry must be exactly 336 hours`);
  }
  if (amendment.ownerDirection?.recordedAt !== amendment.recordedAt) fail(`${label}: owner-direction timestamp drift`);
  if (Number.isFinite(expiresAt) && Date.now() > expiresAt) fail(`${label}: amendment is expired`);

  for (const [path, expectedHash] of expectedSoloGovernanceHashes) {
    if (sha256File(path, `${label}.governanceDefaults`) !== expectedHash) {
      fail(`${label}: non-waivable governance default drift ${path}`);
    }
  }
}

function validateSoloAuthorization(record, authority, ticketManifest, evalManifest) {
  const label = soloAuthorizationId;
  if (!isPlainObject(record)) {
    fail(`${label}: missing exact solo authorization record`);
    return;
  }
  rejectUnknownKeys(record, expectedSoloRecordKeys, label);

  const expectedScalars = {
    id: soloAuthorizationId,
    recordKind: "owner-solo-child-ticket-exception-v1",
    status: "authorized-with-solo-exception",
    implementationAuthorized: true,
    projectId: "one-box",
    branch: "research/la-appointment-field-study",
    baseCommit: "b6486fdfa4601b315944ad099bf2beba1c053e91",
    activationBaseCommit: "66f9afeaaf1e9b37d4bd1ef5437a88e1f6a425bd",
    parentTicketId: "OBX-P180",
    parentTicketStatus: "proposed",
    authorizationProposalId: "OBX-AUTH-P180-OFFLINE-V1",
    ownerActorId: "person:devin-wiggins",
    riskOwnerActorId: "person:devin-wiggins",
    implementationActorId: "person:devin-wiggins",
    authorizedByActorId: "person:devin-wiggins",
    ownerAssignmentV1Status: "NOT_AVAILABLE",
    recordedAt: "2026-08-31T13:33:33Z",
    expiresAt: "2026-09-14T13:33:33Z",
    renewable: false,
  };
  for (const [field, expected] of Object.entries(expectedScalars)) {
    if (record[field] !== expected) fail(`${label}: ${field} drift`);
  }

  exactJson(record.activationWriteSet, expectedSoloActivationWriteSet, `${label}.activationWriteSet`);
  validateHashBindings(record.preExistingUntrackedBaseline, expectedSoloUntrackedBaseline, `${label}.preExistingUntrackedBaseline`, "when-present");
  exactJson(record.childTicketIds, ["OBX-P180-T01"], `${label}.childTicketIds`);

  if (!Array.isArray(record.roleAvailability) || record.roleAvailability.length !== expectedSoloRoleIds.length) {
    fail(`${label}: roleAvailability must contain exactly three unavailable roles`);
  }
  for (const [index, roleId] of expectedSoloRoleIds.entries()) {
    const role = record.roleAvailability?.[index];
    rejectUnknownKeys(role, [
      "roleId", "assignmentStatus", "assignmentRecordPresent", "humanActorId",
      "escalationStatus", "escalationActorId", "separationSatisfied",
    ], `${label}.roleAvailability[${index}]`);
    exactJson(role, {
      roleId,
      assignmentStatus: "NOT_AVAILABLE",
      assignmentRecordPresent: false,
      humanActorId: null,
      escalationStatus: "NOT_AVAILABLE",
      escalationActorId: null,
      separationSatisfied: false,
    }, `${label}.roleAvailability[${index}]`);
  }

  rejectUnknownKeys(record.implementationAuthorizationSeparation, ["status", "satisfied"], `${label}.implementationAuthorizationSeparation`);
  exactJson(record.implementationAuthorizationSeparation, { status: "NOT_AVAILABLE", satisfied: false }, `${label}.implementationAuthorizationSeparation`);
  rejectUnknownKeys(record.escalation, ["status", "actorId"], `${label}.escalation`);
  exactJson(record.escalation, { status: "NOT_AVAILABLE", actorId: null }, `${label}.escalation`);
  rejectUnknownKeys(record.independentHumanReview, ["status", "satisfied", "actorId"], `${label}.independentHumanReview`);
  exactJson(record.independentHumanReview, { status: "NOT_AVAILABLE", satisfied: false, actorId: null }, `${label}.independentHumanReview`);
  rejectUnknownKeys(record.acceptedRisk, ["findingId", "severity", "status", "reasonCode"], `${label}.acceptedRisk`);
  exactJson(record.acceptedRisk, {
    findingId: "OBX-P180-T01-SOLO-SEPARATION-001",
    severity: "MEDIUM",
    status: "ACCEPTED",
    reasonCode: "SOLO_OWNER_SEPARATION_UNAVAILABLE",
  }, `${label}.acceptedRisk`);

  if (!Array.isArray(record.requirementExceptions) || record.requirementExceptions.length !== expectedSoloRequirementExceptions.length) {
    fail(`${label}: requirementExceptions must contain exactly P180-R014 through P180-R016`);
  }
  for (const [index, requirement] of expectedSoloRequirementExceptions.entries()) {
    rejectUnknownKeys(record.requirementExceptions?.[index], ["requirementId", "exceptionStatus", "satisfactionStatus", "waivedClauses"], `${label}.requirementExceptions[${index}]`);
    exactJson(record.requirementExceptions?.[index], requirement, `${label}.requirementExceptions[${index}]`);
  }
  exactJson(record.traceabilityRefs, ["EOS-006", "EOS-012", "PROG-EVAL-COST-001", "PROG-EVAL-SEC-AGENT-001"], `${label}.traceabilityRefs`);
  exactJson(record.allowedPaths, expectedSoloAllowedPaths, `${label}.allowedPaths`);
  for (const path of record.allowedPaths ?? []) validateAuthorizedPath(path, `${label}.allowedPaths`);
  exactJson(record.allowedEffects, ["add-pure-closed-contract-types-and-validators"], `${label}.allowedEffects`);
  exactJson(record.forbiddenEffects, expectedSoloForbiddenEffects, `${label}.forbiddenEffects`);

  validateHashBindings(record.frozenArtifacts, expectedSoloFrozenArtifacts, `${label}.frozenArtifacts`);
  const expectedPlanPacketBinding = expectedSoloFrozenArtifacts[7];
  rejectUnknownKeys(record.planPacketBinding, ["path", "algorithm", "digest"], `${label}.planPacketBinding`);
  exactJson(record.planPacketBinding, expectedPlanPacketBinding, `${label}.planPacketBinding`);
  const expectedSourcePlanBinding = expectedSoloFrozenArtifacts[6];
  rejectUnknownKeys(record.sourcePlanBinding, ["path", "algorithm", "digest"], `${label}.sourcePlanBinding`);
  exactJson(record.sourcePlanBinding, expectedSourcePlanBinding, `${label}.sourcePlanBinding`);
  validateHashBindings(record.governanceBindings, expectedSoloGovernanceBindings, `${label}.governanceBindings`);
  validateHashBindings(record.dependencyBindings, expectedSoloDependencyBindings, `${label}.dependencyBindings`);

  const expectedAmendmentBinding = {
    path: soloAmendmentPath,
    amendmentId: "OBX-P180-T01-SOLO-AMENDMENT-001",
    algorithm: "sha256",
    digest: expectedSoloAmendmentSha256,
  };
  rejectUnknownKeys(record.amendmentBinding, ["path", "amendmentId", "algorithm", "digest"], `${label}.amendmentBinding`);
  exactJson(record.amendmentBinding, expectedAmendmentBinding, `${label}.amendmentBinding`);
  if (sha256File(soloAmendmentPath, `${label}.amendmentBinding`) !== expectedSoloAmendmentSha256) {
    fail(`${label}: amendment bytes do not match amendmentBinding`);
  }
  exactJson(record.requiredEvidencePaths, expectedSoloEvidencePaths, `${label}.requiredEvidencePaths`);
  exactJson(record.invalidators, expectedSoloInvalidators, `${label}.invalidators`);

  const canonicalTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  const recordedAt = Date.parse(record.recordedAt);
  const expiresAt = Date.parse(record.expiresAt);
  if (!canonicalTimestamp.test(record.recordedAt ?? "") || !canonicalTimestamp.test(record.expiresAt ?? "")) {
    fail(`${label}: timestamps must be canonical RFC3339 UTC seconds`);
  }
  if (!Number.isFinite(recordedAt) || !Number.isFinite(expiresAt) || expiresAt - recordedAt !== 1_209_600_000) {
    fail(`${label}: authorization duration must be exactly 336 hours`);
  }
  if (Number.isFinite(recordedAt) && recordedAt > Date.now()) fail(`${label}: recordedAt cannot be in the future`);
  if (Number.isFinite(expiresAt) && Date.now() > expiresAt) fail(`${label}: authorization is expired`);

  rejectUnknownKeys(record.authorizationHash, ["algorithm", "canonicalization", "excludedJsonPointers", "digest"], `${label}.authorizationHash`);
  if (record.authorizationHash?.algorithm !== "sha256"
    || record.authorizationHash?.canonicalization !== "canonical-json-v1"
    || JSON.stringify(record.authorizationHash?.excludedJsonPointers) !== JSON.stringify(["/authorizationHash/digest"])) {
    fail(`${label}: authorizationHash contract drift`);
  }
  const unhashedRecord = structuredClone(record);
  if (isPlainObject(unhashedRecord.authorizationHash)) delete unhashedRecord.authorizationHash.digest;
  const actualAuthorizationHash = canonicalSha256(unhashedRecord);
  if (record.authorizationHash?.digest !== actualAuthorizationHash || actualAuthorizationHash !== expectedSoloAuthorizationSha256) {
    fail(`${label}: authorization self-hash mismatch; expected ${expectedSoloAuthorizationSha256}`);
  }

  if (authority) {
    const authorityWithoutDigest = structuredClone(authority);
    delete authorityWithoutDigest.packetDigest;
    if (canonicalSha256(authorityWithoutDigest) !== expectedAuthorityWithoutDigestSha256) {
      fail(`${label}: authority manifest changed outside packetDigest`);
    }
  }
  const parentTicket = ticketManifest?.tickets?.find((ticket) => ticket.id === "OBX-P180");
  if (parentTicket?.status !== "proposed") fail(`${label}: parent OBX-P180 must remain proposed`);
  for (const evaluationId of ["PROG-EVAL-COST-001", "PROG-EVAL-SEC-AGENT-001"]) {
    const evaluation = evalManifest?.evaluations?.find((candidate) => candidate.id === evaluationId);
    if (evaluation?.status !== "planned") fail(`${label}: parent evaluation ${evaluationId} must remain planned`);
  }
}

function verifySoloActivationSourceScope(record, committedChangedPaths, untrackedRows) {
  const label = `${soloAuthorizationId}.sourceScope`;
  const normalizePaths = (paths) => [...new Set(paths)].sort((left, right) => left.localeCompare(right));
  exactJson(normalizePaths(committedChangedPaths), normalizePaths(record?.activationWriteSet ?? []), `${label}.committedChangedPaths`);
  const normalizedRows = [...untrackedRows].sort((left, right) => left.path.localeCompare(right.path));
  const expectedRows = [...(record?.preExistingUntrackedBaseline ?? [])].sort((left, right) => left.path.localeCompare(right.path));
  exactJson(normalizedRows, expectedRows, `${label}.untrackedBaseline`);
  for (const row of normalizedRows) {
    rejectUnknownKeys(row, ["path", "algorithm", "digest"], `${label}.untrackedBaseline.${row.path}`);
    if (row.algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(row.digest ?? "")) fail(`${label}: invalid untracked hash row ${row.path}`);
  }
}

function validateSoloReceipt(path, record, expectedTargets, modelContract = null) {
  const label = `${soloAuthorizationId}.receipt.${path}`;
  const expectedReceiptSha256 = expectedSoloEvidenceSha256.get(path);
  if (sha256File(path, label) !== expectedReceiptSha256) {
    fail(`${label}: immutable receipt SHA-256 drift`);
  }
  const receipt = readJson(path);
  if (!receipt) {
    fail(`${label}: required receipt is unavailable`);
    return;
  }
  const commonKeys = [
    "schemaVersion", "receiptKind", "authorizationId", "authorizationHash",
    "amendmentId", "amendmentHash", "baseCommit", "targetPaths", "targetHashes",
    "verdict", "findings", "independentHumanReview", "capturedAt",
  ];
  const keys = modelContract ? [...commonKeys, "requestedModel", "providerReportedModel", "effort"] : commonKeys;
  rejectUnknownKeys(receipt, keys, label);
  if (receipt.schemaVersion !== 1) fail(`${label}: schemaVersion drift`);
  if (receipt.receiptKind !== (modelContract ? "solo-t01-model-audit-v1" : "solo-t01-security-review-v1")) fail(`${label}: receiptKind drift`);
  if (receipt.authorizationId !== soloAuthorizationId) fail(`${label}: authorizationId drift`);
  if (receipt.authorizationHash !== record?.authorizationHash?.digest) fail(`${label}: stale authorizationHash`);
  if (receipt.amendmentId !== "OBX-P180-T01-SOLO-AMENDMENT-001") fail(`${label}: amendmentId drift`);
  if (receipt.amendmentHash !== expectedSoloAmendmentSha256) fail(`${label}: amendmentHash drift`);
  if (receipt.baseCommit !== "b6486fdfa4601b315944ad099bf2beba1c053e91") fail(`${label}: baseCommit drift`);
  if (receipt.verdict !== "PASS-WITH-ACCEPTED-RISK") fail(`${label}: verdict must be PASS-WITH-ACCEPTED-RISK`);
  exactJson(receipt.independentHumanReview, { status: "NOT_AVAILABLE", satisfied: false }, `${label}.independentHumanReview`);
  rejectUnknownKeys(receipt.independentHumanReview, ["status", "satisfied"], `${label}.independentHumanReview`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(receipt.capturedAt ?? "") || !Number.isFinite(Date.parse(receipt.capturedAt))) {
    fail(`${label}: capturedAt must be canonical RFC3339 UTC seconds`);
  }
  exactJson(receipt.targetPaths, expectedTargets, `${label}.targetPaths`);
  if (!Array.isArray(receipt.targetHashes) || receipt.targetHashes.length !== expectedTargets.length) {
    fail(`${label}: targetHashes length drift`);
  }
  for (const [index, targetPath] of expectedTargets.entries()) {
    const binding = receipt.targetHashes?.[index];
    rejectUnknownKeys(binding, ["path", "algorithm", "digest"], `${label}.targetHashes[${index}]`);
    if (binding?.path !== targetPath || binding?.algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(binding?.digest ?? "")) {
      fail(`${label}: frozen target binding drift ${targetPath}`);
    }
  }
  if (!Array.isArray(receipt.findings) || receipt.findings.length !== 1) {
    fail(`${label}: findings must contain the sole accepted separation finding`);
    return;
  }
  const finding = receipt.findings[0];
  rejectUnknownKeys(finding, modelContract
    ? ["findingId", "severity", "status"]
    : ["findingId", "severity", "status", "surfaceDisposition"], `${label}.findings[0]`);
  if (finding.findingId !== "OBX-P180-T01-SOLO-SEPARATION-001"
    || finding.severity !== "MEDIUM"
    || finding.status !== "ACCEPTED") {
    fail(`${label}: sole finding identity/severity/status drift`);
  }
  if (modelContract) {
    if (receipt.requestedModel !== modelContract.model
      || receipt.providerReportedModel !== modelContract.model
      || receipt.effort !== modelContract.effort) {
      fail(`${label}: exact model or effort drift`);
    }
    return;
  }
  const expectedSurfaces = [
    ["prompt-injection", "NOT_APPLICABLE"],
    ["secrets", "REVIEWED"],
    ["authentication", "NOT_APPLICABLE"],
    ["authorization", "REVIEWED"],
    ["untrusted-input", "NOT_APPLICABLE"],
    ["export", "NOT_APPLICABLE"],
  ];
  if (!Array.isArray(finding.surfaceDisposition) || finding.surfaceDisposition.length !== expectedSurfaces.length) {
    fail(`${label}: security surfaceDisposition must contain exactly six rows`);
    return;
  }
  for (const [index, [surface, disposition]] of expectedSurfaces.entries()) {
    const row = finding.surfaceDisposition[index];
    rejectUnknownKeys(row, ["surface", "disposition", "changedPathEvidence"], `${label}.surfaceDisposition[${index}]`);
    if (row?.surface !== surface || row?.disposition !== disposition) fail(`${label}: security surface disposition drift ${surface}`);
    if (!Array.isArray(row?.changedPathEvidence) || row.changedPathEvidence.length === 0
      || row.changedPathEvidence.some((targetPath) => !expectedTargets.includes(targetPath))) {
      fail(`${label}: security surface evidence drift ${surface}`);
    }
  }
}

function validateSoloReceipts(record) {
  validateSoloReceipt(expectedSoloEvidencePaths[0], record, expectedSecurityReceiptTargets);
  validateSoloReceipt(expectedSoloEvidencePaths[1], record, expectedGrokReceiptTargets, { model: "x-ai/grok-4.6", effort: "high" });
  validateSoloReceipt(expectedSoloEvidencePaths[2], record, expectedFableReceiptTargets, { model: "claude-fable-5", effort: "max" });
}

function repositoryRelativePath(path, label) {
  if (typeof path !== "string" || path.length === 0 || path.startsWith("/") || normalize(path).startsWith("..")) {
    fail(`${label}: path must stay relative to the repository`);
    return null;
  }
  const absolute = resolve(root, path);
  const lexical = relative(root, absolute);
  if (lexical === "" || lexical.startsWith("..") || lexical.startsWith(`..${join("", "/")}`)) {
    fail(`${label}: path escapes repository (${path})`);
    return null;
  }
  return absolute;
}

function validateAuthorizedPath(path, label) {
  const broadPaths = new Set(["src/", "src/lib/", "src/app/", "src/components/", "docs/", "scripts/"]);
  if (
    typeof path !== "string"
    || path.length === 0
    || path.startsWith("/")
    || normalize(path).startsWith("..")
    || /[*?\[\]{}]/.test(path)
    || broadPaths.has(path)
  ) {
    fail(`${label}: authorized path must be explicit and repository-relative`);
    return false;
  }
  repositoryRelativePath(path, label);
  return true;
}

function safeFile(path, label) {
  const absolute = repositoryRelativePath(path, label);
  if (!absolute) return null;
  try {
    if (!existsSync(absolute) || !lstatSync(absolute).isFile()) {
      fail(`${label}: missing non-symlink regular file ${path}`);
      return null;
    }
    const real = realpathSync(absolute);
    const containment = relative(root, real);
    if (containment.startsWith("..") || resolve(root, containment) !== real) {
      fail(`${label}: resolved file escapes repository ${path}`);
      return null;
    }
    return real;
  } catch (error) {
    fail(`${label}: cannot inspect ${path} (${error.message})`);
    return null;
  }
}

function addDigest(path, label = path) {
  if (digestInputs.has(path)) return;
  const absolute = safeFile(path, label);
  if (!absolute) return;
  try {
    digestInputs.set(path, readFileSync(absolute));
  } catch (error) {
    fail(`${label}: cannot hash (${error.message})`);
  }
}

function filesUnder(path) {
  const absolute = repositoryRelativePath(path, path);
  if (!absolute || !existsSync(absolute)) {
    fail(`${path}: missing directory`);
    return [];
  }
  const output = [];
  try {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) output.push(...filesUnder(child));
      else if (entry.isFile()) output.push(child);
      else fail(`${child}: symlinks and special files are not allowed in checked packet directories`);
    }
  } catch (error) {
    fail(`${path}: cannot enumerate (${error.message})`);
  }
  return output;
}

function validateLocalLinks(path) {
  const text = readText(path);
  if (text === null) return;
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const withoutFragment = target.split("#", 1)[0];
    if (!withoutFragment) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(withoutFragment);
    } catch {
      fail(`${path}: malformed link ${target}`);
      continue;
    }
    const absolute = resolve(root, dirname(path), decoded);
    const containment = relative(root, absolute);
    if (containment.startsWith("..") || !existsSync(absolute)) {
      fail(`${path}: broken or external local link ${target}`);
    }
  }
}

const authorityPath = "docs/plans/one-box-master/00-authority/authority-manifest.json";
const scopedImplementationAuthorityPath = "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json";
const teammateFoundationTicketPath = "docs/tickets/ai-teammate-foundation/manifest.json";
const evalPath = "docs/eval/one-box-program/manifest.json";
const ticketPath = "docs/tickets/one-box-program/manifest.json";
const ticketBodyContractPath = "docs/tickets/one-box-program/ticket-body-contract.json";
const requirementVocabularyPath = "docs/tickets/one-box-program/requirement-vocabulary.json";
const ledgerPath = "docs/research/source-catalog/adoption-ledger.json";
const traceabilityPath = "docs/eval/one-box-program/traceability.md";
const embeddedBrowserClosurePath = "docs/security/2026-08-29-embedded-browser-closure-requirements.md";
const ciWorkflowPath = ".github/workflows/ci.yml";
const authority = readJson(authorityPath);
const scopedImplementationAuthority = readJson(scopedImplementationAuthorityPath);
const teammateFoundationTicketManifest = readJson(teammateFoundationTicketPath);
const evalManifest = readJson(evalPath);
const ticketManifest = readJson(ticketPath);
const ticketBodyContract = readJson(ticketBodyContractPath);
const requirementVocabulary = readJson(requirementVocabularyPath);
const adoptionLedger = readJson(ledgerPath);
const soloAmendment = readJson(soloAmendmentPath);

if (process.argv.includes("--verify-solo-t02-completion-only")) {
  const result = verifyP180T02Completion({ repoRoot: root });
  if (result.failures.length > 0) {
    for (const failure of result.failures) console.error(`FAIL ${failure}`);
    console.error(`Solo T02 completion verification failed with ${result.failures.length} issue(s).`);
    process.exit(1);
  }
  console.log(`PASS Solo T02 completion checkpoint self-hash: ${result.checkpointHash}`);
  console.log(`PASS Solo T02 owner completion receipt self-hash: ${result.ownerReceiptHash}`);
  process.exit(0);
}

if (process.argv.includes("--verify-solo-t02-structure-only") || process.argv.includes("--verify-solo-t02-receipt-only")) {
  const result = verifyP180T02Authorization({
    repoRoot: root,
    registry: scopedImplementationAuthority,
    verifyReceipt: process.argv.includes("--verify-solo-t02-receipt-only"),
    verifyCompletion: false,
  });
  if (result.failures.length > 0) {
    for (const failure of result.failures) console.error(`FAIL ${failure}`);
    console.error(`Solo T02 focused verification failed with ${result.failures.length} issue(s).`);
    process.exit(1);
  }
  console.log(`PASS Solo T02 authorization self-hash: ${result.authorizationHash}`);
  console.log(process.argv.includes("--verify-solo-t02-receipt-only")
    ? "PASS Solo T02 exact historical security receipt"
    : "PASS Solo T02 structure and frozen bindings");
  process.exit(0);
}

for (const ticket of ["T03", "T04"]) {
  const recordFlag = `--verify-solo-${ticket.toLowerCase()}-record-only`;
  const activationFlag = `--verify-solo-${ticket.toLowerCase()}-activation-only`;
  const completionFlag = `--verify-solo-${ticket.toLowerCase()}-completion-only`;
  if (!process.argv.includes(recordFlag) && !process.argv.includes(activationFlag) && !process.argv.includes(completionFlag)) continue;
  const mode = process.argv.includes(completionFlag) ? "completion" : process.argv.includes(activationFlag) ? "activation" : "record";
  const result = verifyP180SiblingAuthorization({
    repoRoot: root,
    registry: scopedImplementationAuthority,
    ticket,
    mode,
  });
  if (result.failures.length > 0) {
    for (const failure of result.failures) console.error(`FAIL ${failure}`);
    console.error(`Solo ${ticket} ${mode} verification failed with ${result.failures.length} issue(s).`);
    process.exit(1);
  }
  console.log(`PASS Solo ${ticket} authorization self-hash: ${result.authorizationHash}`);
  console.log(`PASS Solo ${ticket} derived state: ${result.state}`);
  process.exit(0);
}

validateSoloAmendment(soloAmendment);
if (process.argv.includes("--verify-solo-amendment-only")) {
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    console.error(`Solo T01 amendment verification failed with ${failures.length} issue(s).`);
    process.exit(1);
  }
  console.log(`PASS Solo T01 amendment SHA-256: ${expectedSoloAmendmentSha256}`);
  console.log("PASS Independent human review: NOT_AVAILABLE / false");
  console.log("PASS Standard non-waivable governance defaults preserved");
  process.exit(0);
}

const allowedRequirements = new Set(requirementVocabulary?.allowedIds ?? []);
if (requirementVocabulary) {
  if (requirementVocabulary.schemaVersion !== 1 || requirementVocabulary.status !== "proposed" || requirementVocabulary.implementationAuthorized !== false || requirementVocabulary.allowOnlyExactIds !== true) {
    fail("requirement vocabulary: invalid planning contract metadata");
  }
  if (!Array.isArray(requirementVocabulary.allowedIds) || requirementVocabulary.allowedIds.length === 0 || allowedRequirements.size !== requirementVocabulary.allowedIds.length) {
    fail("requirement vocabulary: allowedIds must be a non-empty unique array");
  }
}
if (ticketBodyContract) {
  if (ticketBodyContract.schemaVersion !== 1 || ticketBodyContract.status !== "proposed" || ticketBodyContract.implementationAuthorized !== false) {
    fail("ticket-body contract: invalid planning contract metadata");
  }
  if (ticketBodyContract.manifestPath !== ticketPath) fail("ticket-body contract: manifestPath drift");
  if (!Array.isArray(ticketBodyContract.requiredSections) || ticketBodyContract.requiredSections.length === 0) fail("ticket-body contract: requiredSections must be non-empty");
}

if (authority) {
  if (authority.schemaVersion !== 1) fail("authority manifest: unsupported schemaVersion");
  if (authority.program !== "ONE BOX") fail("authority manifest: invalid program");
  if (authority.status !== "planning-reconciliation") fail("authority manifest: invalid status");
  if (authority.implementationAuthorized !== false) fail("authority manifest: reconciliation cannot authorize implementation");
  if (authority.scopedImplementationAuthorityPath !== scopedImplementationAuthorityPath) {
    fail("authority manifest: missing scopedImplementationAuthorityPath");
  }
  if (!isPlainObject(authority.domains) || Object.keys(authority.domains).length === 0) fail("authority manifest: domains must be a non-empty object");
  const operatingEnvironment = authority.domains?.["operating-environment"];
  if (!isPlainObject(operatingEnvironment) || operatingEnvironment.authorityClass !== "draft" || operatingEnvironment.implementationAuthorized !== false) {
    fail("operating-environment must remain draft and implementationAuthorized=false while OBX-AUTH-ATF-001 runs");
  }
  const releasePolicy = authority.governancePolicies?.productionRelease;
  const reviewPolicy = authority.governancePolicies?.modelReview;
  if (!isPlainObject(authority.governancePolicies)) fail("authority manifest: missing governancePolicies");
  if (!isPlainObject(releasePolicy) || releasePolicy.minimumDistinctActiveHumans !== 2 || releasePolicy.initiatorMayApprove !== false || releasePolicy.emergencyRollback?.newBytesAllowed !== false || releasePolicy.emergencyRollback?.independentReviewWithinHours !== 24) {
    fail("authority manifest: productionRelease policy must require two humans and bounded 24-hour-reviewed rollback");
  }
  if (!isPlainObject(reviewPolicy) || reviewPolicy.exactRequestedModelRequired !== true || reviewPolicy.ownerAuthorizedFallbackAllowed !== true || reviewPolicy.supplementalReviewAllowed !== true || reviewPolicy.modelAuthority !== "advisory-only" || reviewPolicy.targetChangeInvalidatesReceipt !== true) {
    fail("authority manifest: modelReview policy must preserve exact labeling, authorized fallback, advisory authority, and hash invalidation");
  }
  for (const [id, [primaryPath, authorityClass]] of Object.entries(expectedDomains)) {
    const domain = authority.domains?.[id];
    if (!isPlainObject(domain)) {
      fail(`authority manifest: missing domain ${id}`);
      continue;
    }
    if (domain.primaryPath !== primaryPath) fail(`${id}: primaryPath drift; expected ${primaryPath}`);
    if (domain.authorityClass !== authorityClass) fail(`${id}: authorityClass drift; expected ${authorityClass}`);
  }
  for (const id of Object.keys(authority.domains ?? {})) {
    if (!expectedDomains[id]) fail(`authority manifest: unexpected domain ${id}`);
  }
  for (const [id, domain] of Object.entries(authority.domains ?? {})) {
    if (!isPlainObject(domain)) {
      fail(`${id}: domain must be an object`);
      continue;
    }
    if (!allowedClasses.has(domain.authorityClass)) fail(`${id}: invalid authorityClass ${domain.authorityClass}`);
    if (domain.implementationAuthorized !== false) fail(`${id}: this planning manifest cannot authorize implementation`);
    if (ownerApprovedClasses.has(domain.authorityClass)) {
      const record = domain.acceptanceRecord;
      if (!isPlainObject(record) || typeof record.acceptedBy !== "string" || typeof record.recordedAt !== "string" || typeof record.evidence !== "string") {
        fail(`${id}: owner-approved class requires acceptedBy, recordedAt, and evidence`);
      }
      if (typeof record?.identityRef !== "string" || !record.identityRef.startsWith("person:") || typeof record?.role !== "string" || record.role.length === 0) {
        fail(`${id}: owner-approved class requires durable human identityRef and role`);
      }
    }
    for (const prefix of authority.forbiddenPrimaryPathPrefixes ?? []) {
      if (domain.primaryPath?.startsWith(prefix)) fail(`${id}: ${prefix} cannot be a primary authority`);
    }
    addDigest(domain.primaryPath, `${id}.primaryPath`);
    if (typeof domain.boundary !== "string" || domain.boundary.length < 20) fail(`${id}: missing explicit boundary`);
    if (domain.relatedPaths !== undefined && !Array.isArray(domain.relatedPaths)) fail(`${id}: relatedPaths must be an array`);
    for (const path of domain.relatedPaths ?? []) {
      safeFile(path, `${id}.relatedPaths entry`);
      if (!path.startsWith("docs/audits/")) addDigest(path, `${id}.relatedPaths entry`);
    }
  }
  for (const name of allowedClasses) {
    if (typeof authority.authorityClassDefinitions?.[name] !== "string") fail(`authority manifest: missing definition for ${name}`);
  }
  if (!(authority.forbiddenPrimaryPathPrefixes ?? []).includes("docs/audits/")) fail("authority manifest: audit primary-path prohibition is not machine-readable");
  if (!(authority.domains?.["embedded-browser"]?.relatedPaths ?? []).includes(embeddedBrowserClosurePath)) {
    fail(`embedded-browser: missing required related path ${embeddedBrowserClosurePath}`);
  }
  for (const [kind, paths] of [["supportingEvidence", authority.supportingEvidence], ["historicalOrSubordinate", authority.historicalOrSubordinate]]) {
    if (!Array.isArray(paths)) fail(`authority manifest: ${kind} must be an array`);
    else for (const path of paths) safeFile(path, `${kind} entry`);
  }
}

const scopedAuthorizations = new Map();
if (scopedImplementationAuthority) {
  rejectUnknownKeys(scopedImplementationAuthority, ["schemaVersion", "program", "status", "globalImplementationAuthorized", "authorizations"], "scoped implementation authority registry");
  if (scopedImplementationAuthority.schemaVersion !== 2) fail("scoped implementation authority: unsupported schemaVersion");
  if (scopedImplementationAuthority.program !== "ONE BOX") fail("scoped implementation authority: invalid program");
  if (scopedImplementationAuthority.status !== "active") fail("scoped implementation authority: invalid status");
  if (scopedImplementationAuthority.globalImplementationAuthorized !== false) {
    fail("scoped implementation authority: cannot authorize the full program");
  }
  if (!Array.isArray(scopedImplementationAuthority.authorizations) || scopedImplementationAuthority.authorizations.length === 0) {
    fail("scoped implementation authority: authorizations must be a non-empty array");
  }
  const expectedAuthorizationIds = [
    "OBX-AUTH-ATF-001",
    soloAuthorizationId,
    T02_AUTHORIZATION_ID,
    T03_AUTHORIZATION_ID,
    T04_AUTHORIZATION_ID,
    T03_CORRECTION_AUTHORIZATION_ID,
    T04_CORRECTION_AUTHORIZATION_ID,
    T03_SUPERSESSION_AUTHORIZATION_ID,
    T04_SUPERSESSION_AUTHORIZATION_ID,
  ];
  if (JSON.stringify(scopedImplementationAuthority.authorizations?.map((record) => record?.id)) !== JSON.stringify(expectedAuthorizationIds)) {
    fail(`scoped implementation authority: records must be exactly ${expectedAuthorizationIds.join(", ")}`);
  }
  for (const record of scopedImplementationAuthority.authorizations ?? []) {
    if (!isPlainObject(record) || typeof record.id !== "string" || record.id.length === 0) {
      fail("scoped implementation authority: authorization must be an object with id");
      continue;
    }
    if (scopedAuthorizations.has(record.id)) fail(`scoped implementation authority: duplicate ${record.id}`);
    scopedAuthorizations.set(record.id, record);
    if ([
      soloAuthorizationId,
      T02_AUTHORIZATION_ID,
      T03_AUTHORIZATION_ID,
      T04_AUTHORIZATION_ID,
      T03_CORRECTION_AUTHORIZATION_ID,
      T04_CORRECTION_AUTHORIZATION_ID,
      T03_SUPERSESSION_AUTHORIZATION_ID,
      T04_SUPERSESSION_AUTHORIZATION_ID,
    ].includes(record.id)) continue;
    if (record.id !== "OBX-AUTH-ATF-001") {
      fail(`scoped implementation authority: unknown authorization ${record.id}`);
      continue;
    }
    rejectUnknownKeys(record, [
      "id",
      "status",
      "implementationAuthorized",
      "authorizedBy",
      "recordedAt",
      "evidence",
      "sourceSpec",
      "implementationPlan",
      "ticketManifest",
      "ticketIds",
      "requirements",
      "scope",
      "requiredReview",
      "invalidators",
    ], record.id);
    if (record.status !== "authorized" || record.implementationAuthorized !== true) {
      fail(`${record.id}: invalid scoped authorization state`);
    }
    if (!isPlainObject(record.authorizedBy) || typeof record.authorizedBy.name !== "string" || !record.authorizedBy.identityRef?.startsWith("person:") || typeof record.authorizedBy.role !== "string") {
      fail(`${record.id}: authorization requires a durable named-human identity`);
    }
    rejectUnknownKeys(record.authorizedBy, ["name", "identityRef", "role"], `${record.id}.authorizedBy`);
    if (typeof record.recordedAt !== "string" || !Number.isFinite(Date.parse(record.recordedAt))) fail(`${record.id}: invalid recordedAt`);
    if (typeof record.evidence !== "string" || record.evidence.length < 40) fail(`${record.id}: missing owner-direction evidence`);
    for (const field of ["sourceSpec", "implementationPlan", "ticketManifest"]) {
      if (typeof record[field] !== "string") fail(`${record.id}: missing ${field}`);
      else {
        safeFile(record[field], `${record.id}.${field}`);
        addDigest(record[field], `${record.id}.${field}`);
      }
    }
    if (record.id === "OBX-AUTH-ATF-001") {
      if (record.sourceSpec !== "docs/specs/2026-08-29-ai-teammate-foundation-v1.md") fail(`${record.id}: source specification binding drift`);
      if (record.implementationPlan !== "docs/plans/2026-08-29-ai-teammate-foundation-v1-implementation.md") fail(`${record.id}: implementation plan binding drift`);
      if (record.ticketManifest !== teammateFoundationTicketPath) fail(`${record.id}: ticket manifest binding drift`);
    }
    if (JSON.stringify(record.ticketIds) !== JSON.stringify(["OBX-AT-001"])) fail(`${record.id}: foundation ticket set must be exactly OBX-AT-001`);
    if (JSON.stringify(record.requirements) !== JSON.stringify(["E1"])) fail(`${record.id}: requirements must be exactly E1`);
    for (const requirement of record.requirements ?? []) if (!allowedRequirements.has(requirement)) fail(`${record.id}: invalid requirement ${requirement}`);
    if (!isPlainObject(record.scope)) fail(`${record.id}: scope must be an object`);
    rejectUnknownKeys(record.scope, Object.keys(expectedTeammateFoundationScope), `${record.id}.scope`);
    if ((record.scope?.allowedPathPrefixes ?? []).some((path) => path.startsWith("src/components/preview/AiTeammate") && path !== "src/components/preview/AiTeammate/")) {
      fail(`${record.id}: teammate component path scope must use a delimited directory`);
    }
    const canonicalDocs = (record.scope?.allowedExactPaths ?? []).filter((path) => path.startsWith("docs/architecture/") || path.startsWith("docs/security/"));
    if (JSON.stringify(canonicalDocs) !== JSON.stringify(expectedTeammateFoundationCanonicalDocs)) {
      fail(`${record.id}: canonical documentation path scope drift`);
    }
    const e2eHarnesses = (record.scope?.allowedExactPaths ?? []).filter((path) => path.startsWith("scripts/e2e/"));
    if (JSON.stringify(e2eHarnesses) !== JSON.stringify(expectedTeammateFoundationE2eHarnesses)) {
      fail(`${record.id}: E2E verification harness path scope drift`);
    }
    const evidencePrefixes = record.scope?.supportingEvidencePrefixes ?? [];
    if (evidencePrefixes.some((prefix) => !/^docs\/(?:audits\/grok-4\.6\/|audits\/evidence\/(?:goal\/|security\/)?|verification\/)2026-08-(?:29|30)-ai-teammate-foundation-$/.test(prefix))) {
      fail(`${record.id}: supporting evidence prefixes must remain date-and-slice bounded`);
    }
    if (JSON.stringify(evidencePrefixes) !== JSON.stringify(expectedTeammateFoundationScope.supportingEvidencePrefixes)) {
      fail(`${record.id}: supporting evidence prefix set drift`);
    }
    if (JSON.stringify(record.scope?.allowedEffectClasses) !== JSON.stringify(["read", "propose"])) {
      fail(`${record.id}: scoped teammate authorization permits only read and propose effects`);
    }
    for (const field of ["allowedPathPrefixes", "allowedExactPaths", "supportingEvidencePrefixes"]) {
      const paths = record.scope?.[field];
      if (!Array.isArray(paths) || paths.length === 0) fail(`${record.id}: ${field} must be a non-empty array`);
      else for (const path of paths) validateAuthorizedPath(path, `${record.id}.${field}`);
    }
    for (const [field, expected] of Object.entries(expectedTeammateFoundationScope)) {
      if (JSON.stringify(record.scope?.[field]) !== JSON.stringify(expected)) {
        fail(`${record.id}: foundation path scope drift in ${field}`);
      }
    }
    if (record.scope?.newRuntimeDependenciesAllowed !== false || !Array.isArray(record.scope?.runtimeDependencies) || record.scope.runtimeDependencies.length > 0) {
      fail(`${record.id}: foundation slice permits no runtime dependencies`);
    }
    if (record.scope?.fullProgramAuthorization !== false || record.scope?.deploymentAuthorized !== false || record.scope?.productionReleaseAuthorized !== false) {
      fail(`${record.id}: scoped record cannot authorize the full program, deployment, or release`);
    }
    if (!isPlainObject(record.requiredReview)) fail(`${record.id}: requiredReview must be an object`);
    rejectUnknownKeys(record.requiredReview, Object.keys(expectedTeammateFoundationReview), `${record.id}.requiredReview`);
    if (JSON.stringify(record.requiredReview) !== JSON.stringify(expectedTeammateFoundationReview)) {
      fail(`${record.id}: required review contract drift`);
    }
    if (JSON.stringify(record.invalidators) !== JSON.stringify(expectedTeammateFoundationInvalidators)) fail(`${record.id}: invalidation contract drift`);
  }
  const atfRecord = scopedAuthorizations.get("OBX-AUTH-ATF-001");
  if (canonicalSha256(atfRecord, true) !== expectedAtfCanonicalSha256) fail("OBX-AUTH-ATF-001: canonical record drift");
  const soloRecord = scopedAuthorizations.get(soloAuthorizationId);
  validateSoloAuthorization(soloRecord, authority, ticketManifest, evalManifest);
  const t02Result = verifyP180T02Authorization({
    repoRoot: root,
    registry: scopedImplementationAuthority,
    verifyReceipt: true,
  });
  for (const failure of t02Result.failures) fail(failure);
  const correctionResult = verifyPhase1SupersedingCorrectionAuthorizations({
    repoRoot: root,
    registry: scopedImplementationAuthority,
    mode: "lifecycle",
    verifyRepositoryState: false,
  });
  for (const failure of correctionResult.failures) fail(failure);
  const originalVerificationCommit = historicalVerificationCommitForSupersessionState(correctionResult);
  for (const ticket of ["T03", "T04"]) {
    const result = verifyP180SiblingAuthorization({
      repoRoot: root,
      registry: scopedImplementationAuthority,
      ticket,
      mode: "lifecycle",
      verifyPredecessorCompletion: false,
      ...(originalVerificationCommit ? { gitState: { currentCommit: originalVerificationCommit } } : {}),
    });
    for (const failure of result.failures) fail(failure);
  }

  if (process.argv.includes("--verify-solo-source-scope-only")) {
    let committedChangedPaths = [];
    let untrackedRows = [];
    try {
      committedChangedPaths = JSON.parse(process.env.SOLO_COMMITTED_CHANGED_PATHS_JSON ?? "null");
      untrackedRows = JSON.parse(process.env.SOLO_UNTRACKED_ROWS_JSON ?? "null");
      if (!Array.isArray(committedChangedPaths) || !Array.isArray(untrackedRows)) throw new Error("both values must be JSON arrays");
    } catch (error) {
      fail(`${soloAuthorizationId}.sourceScope: invalid captured input (${error.message})`);
    }
    verifySoloActivationSourceScope(soloRecord, committedChangedPaths, untrackedRows);
  }
  const isStructureOnly = process.argv.includes("--verify-solo-structure-only");
  const isSourceScopeOnly = process.argv.includes("--verify-solo-source-scope-only");
  const isReceiptsOnly = process.argv.includes("--verify-solo-receipts-only");
  if (isReceiptsOnly || (!isStructureOnly && !isSourceScopeOnly)) validateSoloReceipts(soloRecord);

  if (isStructureOnly || isSourceScopeOnly || isReceiptsOnly) {
    if (failures.length > 0) {
      for (const failure of failures) console.error(`FAIL ${failure}`);
      console.error(`Solo T01 focused verification failed with ${failures.length} issue(s).`);
      process.exit(1);
    }
    console.log(`PASS Solo T01 authorization self-hash: ${expectedSoloAuthorizationSha256}`);
    if (isSourceScopeOnly) console.log("PASS Solo T01 activation source scope");
    if (isReceiptsOnly) console.log("PASS Solo T01 exact receipt chain");
    if (isStructureOnly) console.log("PASS Solo T01 structure and frozen bindings");
    process.exit(0);
  }
  addDigest(scopedImplementationAuthorityPath);
}

if (teammateFoundationTicketManifest) {
  rejectUnknownKeys(teammateFoundationTicketManifest, ["schemaVersion", "program", "slice", "status", "implementationAuthorized", "authorization", "sourceSpec", "implementationPlan", "ticketStatusPolicy", "tickets"], "teammate foundation ticket manifest");
  if (teammateFoundationTicketManifest.schemaVersion !== 1) fail("teammate foundation tickets: unsupported schemaVersion");
  if (teammateFoundationTicketManifest.program !== "ONE BOX" || teammateFoundationTicketManifest.slice !== "ai-teammate-foundation-v1") {
    fail("teammate foundation tickets: invalid program or slice");
  }
  if (teammateFoundationTicketManifest.status !== "implementation-authorized" || teammateFoundationTicketManifest.implementationAuthorized !== true) {
    fail("teammate foundation tickets: invalid authorization state");
  }
  if (teammateFoundationTicketManifest.sourceSpec !== "docs/specs/2026-08-29-ai-teammate-foundation-v1.md") fail("teammate foundation tickets: sourceSpec drift");
  if (teammateFoundationTicketManifest.implementationPlan !== "docs/plans/2026-08-29-ai-teammate-foundation-v1-implementation.md") fail("teammate foundation tickets: implementationPlan drift");
  if (teammateFoundationTicketManifest.authorization !== `${scopedImplementationAuthorityPath}#OBX-AUTH-ATF-001`) fail("teammate foundation tickets: authorization drift");
  if (JSON.stringify(teammateFoundationTicketManifest.ticketStatusPolicy) !== JSON.stringify(expectedTeammateFoundationTicketStatusPolicy)) fail("teammate foundation tickets: ticket status transition policy drift");
  if (JSON.stringify(teammateFoundationTicketManifest.tickets) !== JSON.stringify([expectedTeammateFoundationTicket])) fail("teammate foundation ticket set must be exactly OBX-AT-001");
  if (!Array.isArray(teammateFoundationTicketManifest.tickets) || teammateFoundationTicketManifest.tickets.length === 0) fail("teammate foundation tickets: tickets must be non-empty");
  const ticketIds = new Set();
  for (const ticket of teammateFoundationTicketManifest.tickets ?? []) {
    if (!isPlainObject(ticket) || typeof ticket.id !== "string") {
      fail("teammate foundation tickets: invalid ticket");
      continue;
    }
    if (ticketIds.has(ticket.id)) fail(`teammate foundation tickets: duplicate ${ticket.id}`);
    ticketIds.add(ticket.id);
    rejectUnknownKeys(ticket, Object.keys(expectedTeammateFoundationTicket), `${ticket.id}.ticket`);
    if (ticket.status !== "ready" || ticket.priority !== "P1") fail(`${ticket.id}: invalid foundation ticket state`);
    if (!Array.isArray(ticket.requirements) || ticket.requirements.length === 0) fail(`${ticket.id}: requirements must be non-empty`);
    for (const requirement of ticket.requirements ?? []) if (!allowedRequirements.has(requirement)) fail(`${ticket.id}: invalid requirement ${requirement}`);
    const ticketFile = `docs/tickets/ai-teammate-foundation/${ticket.file}`;
    const body = readText(ticketFile, `${ticket.id}.file`);
    addDigest(ticketFile, `${ticket.id}.file`);
    if (body !== null) {
      for (const heading of ["Outcome", "Authorized scope", "Acceptance criteria", "Non-goals", "Security boundary", "Evidence and completion"]) {
        if (!body.includes(`## ${heading}`)) fail(`${ticket.id}: ticket body missing section ${heading}`);
      }
      for (const token of [`id: ${ticket.id}`, `status: ${ticket.status}`, `priority: ${ticket.priority}`]) {
        if (!body.includes(token)) fail(`${ticket.id}: ticket body drift for ${token}`);
      }
    }
  }
  const authorization = scopedAuthorizations.get("OBX-AUTH-ATF-001");
  if (!authorization || authorization.ticketManifest !== teammateFoundationTicketPath) fail("OBX-AUTH-ATF-001: ticket manifest binding drift");
  else if (JSON.stringify(authorization.ticketIds) !== JSON.stringify([...ticketIds])) fail("OBX-AUTH-ATF-001: ticketIds drift");
  addDigest(teammateFoundationTicketPath);
}

const tickets = new Map();
const assignments = new Map();
if (ticketManifest) {
  if (ticketManifest.schemaVersion !== 2) fail("ticket manifest: unsupported schemaVersion");
  if (ticketManifest.backlogVersion !== "2.0.0") fail("ticket manifest: unsupported backlogVersion");
  if (ticketManifest.status !== "planning") fail("ticket manifest: invalid status");
  if (ticketManifest.implementationAuthorized !== false) fail("ticket manifest: cannot authorize implementation");
  if (ticketManifest.readme !== "docs/tickets/one-box-program/README.md") fail("ticket manifest: readme path drift");
  if (ticketManifest.evalManifest !== evalPath) fail("ticket manifest: evalManifest path drift");
  safeFile(ticketManifest.readme, "ticket manifest readme");
  safeFile(ticketManifest.evalManifest, "ticket manifest evalManifest");
  if (!Array.isArray(ticketManifest.tickets) || ticketManifest.tickets.length === 0) fail("ticket manifest: tickets must be a non-empty array");
  if (!isPlainObject(ticketManifest.humanAssignments) || !Array.isArray(ticketManifest.humanAssignments.records)) {
    fail("ticket manifest: humanAssignments.records must exist");
  } else {
    for (const record of ticketManifest.humanAssignments.records) {
      if (!isPlainObject(record) || typeof record.ticketId !== "string") {
        fail("ticket manifest: invalid human assignment record");
        continue;
      }
      if (assignments.has(record.ticketId)) fail(`ticket manifest: duplicate human assignment ${record.ticketId}`);
      assignments.set(record.ticketId, record);
    }
  }
  if (ticketBodyContract && JSON.stringify(ticketManifest.requiredTicketSections) !== JSON.stringify(ticketBodyContract.requiredSections)) {
    fail("ticket manifest: requiredTicketSections drift from ticket-body contract");
  }
  for (const ticket of ticketManifest.tickets ?? []) {
    if (!isPlainObject(ticket) || typeof ticket.id !== "string") {
      fail("ticket manifest: ticket must be an object with id");
      continue;
    }
    if (tickets.has(ticket.id)) fail(`ticket manifest: duplicate ${ticket.id}`);
    tickets.set(ticket.id, ticket);
    for (const field of ["title", "status", "priority", "epic", "ownerRole", "size", "file"]) {
      if (typeof ticket[field] !== "string" || ticket[field].length === 0) fail(`${ticket.id}: missing ${field}`);
    }
    if (!ticketStatuses.has(ticket.status)) fail(`${ticket.id}: invalid status ${ticket.status}`);
    if (!ticketPriorities.has(ticket.priority)) fail(`${ticket.id}: invalid priority ${ticket.priority}`);
    if (ticket.status === "in-review" && !["planning", "implementation"].includes(ticket.reviewStage)) fail(`${ticket.id}: in-review requires planning or implementation reviewStage`);
    if (!Array.isArray(ticket.dependsOn)) fail(`${ticket.id}: dependsOn must be an array`);
    if (!Array.isArray(ticket.requirements) || ticket.requirements.length === 0) fail(`${ticket.id}: requirements must be non-empty`);
    if (!Array.isArray(ticket.evaluations) || ticket.evaluations.length === 0) fail(`${ticket.id}: evaluations must be non-empty`);
    for (const requirement of ticket.requirements ?? []) if (!allowedRequirements.has(requirement)) fail(`${ticket.id}: invalid requirement ${requirement}`);
    const ticketFile = `docs/tickets/one-box-program/${ticket.file}`;
    const body = readText(ticketFile, `${ticket.id}.file`);
    addDigest(ticketFile, `${ticket.id}.file`);
    if (body !== null) {
      for (const heading of ticketManifest.requiredTicketSections ?? []) {
        if (!body.includes(`## ${heading}`)) fail(`${ticket.id}: ticket body missing section ${heading}`);
      }
      for (const token of [`id: ${ticket.id}`, `status: ${ticket.status}`, `priority: ${ticket.priority}`, `epic: ${ticket.epic}`, `owner-role: ${ticket.ownerRole}`]) {
        if (!body.includes(token)) fail(`${ticket.id}: ticket body drift for ${token}`);
      }
      const dependencyLine = `depends-on: ${ticket.dependsOn.length === 0 ? "none" : ticket.dependsOn.join(", ")}`;
      if (!body.includes(dependencyLine)) fail(`${ticket.id}: ticket body dependency list drift`);
      if (ticket.dependencySemantics && !body.includes(`dependency-semantics: ${ticket.dependencySemantics}`)) fail(`${ticket.id}: ticket body dependency semantics drift`);
      const requirementLine = `requirements: ${ticket.requirements.join(", ")}`;
      const evaluationLine = `evaluations: ${ticket.evaluations.join(", ")}`;
      if (!body.includes(requirementLine)) fail(`${ticket.id}: ticket body requirement list drift`);
      if (!body.includes(evaluationLine)) fail(`${ticket.id}: ticket body evaluation list drift`);
    }
  }
  for (const ticket of tickets.values()) {
    for (const dependency of ticket.dependsOn ?? []) {
      if (!tickets.has(dependency)) fail(`${ticket.id}: unknown dependency ${dependency}`);
      else if (activeTicketStatuses.has(ticket.status) && tickets.get(dependency).status !== "done") fail(`${ticket.id}: ${ticket.status} requires done dependency ${dependency}`);
    }
    if (activeTicketStatuses.has(ticket.status)) {
      const assignment = assignments.get(ticket.id);
      if (!isPlainObject(assignment) || !assignment.accountableOwner || !assignment.nonAuthorVerifier) fail(`${ticket.id}: ${ticket.status} requires accountableOwner and nonAuthorVerifier assignment`);
    }
  }
  if (tickets.get("OBX-P180")?.status !== "proposed") fail("OBX-P180 must remain proposed while OBX-AUTH-ATF-001 runs");
  if (tickets.get("OBX-P310")?.status !== "blocked") fail("OBX-P310 must remain blocked while OBX-AUTH-ATF-001 runs");
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      fail(`ticket manifest: dependency cycle includes ${id}`);
      return;
    }
    if (visited.has(id) || !tickets.has(id)) return;
    visiting.add(id);
    for (const dependency of tickets.get(id).dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of tickets.keys()) visit(id);
}

function ticketDependsOn(ticketId, possibleDependency, seen = new Set()) {
  if (ticketId === possibleDependency) return true;
  if (seen.has(ticketId) || !tickets.has(ticketId)) return false;
  seen.add(ticketId);
  return (tickets.get(ticketId).dependsOn ?? []).some((dependency) => ticketDependsOn(dependency, possibleDependency, seen));
}

const evaluations = new Map();
const evaluationReferences = new Map();
if (evalManifest) {
  if (evalManifest.schemaVersion !== 2) fail("evaluation manifest: unsupported schemaVersion");
  if (evalManifest.program !== "ONE BOX") fail("evaluation manifest: invalid program");
  if (evalManifest.status !== "planning-baseline") fail("evaluation manifest: invalid status");
  if (evalManifest.implementationAuthorized !== false) fail("evaluation manifest: cannot authorize implementation");
  if (!Array.isArray(evalManifest.evaluations) || evalManifest.evaluations.length === 0) fail("evaluation manifest: evaluations must be a non-empty array");
  for (const evaluation of evalManifest.evaluations ?? []) {
    if (!isPlainObject(evaluation) || typeof evaluation.id !== "string") {
      fail("evaluation manifest: evaluation must be an object with id");
      continue;
    }
    if (evaluations.has(evaluation.id)) fail(`evaluation manifest: duplicate ${evaluation.id}`);
    evaluations.set(evaluation.id, evaluation);
    for (const field of ["title", "tier", "method", "status", "ownerTicket", "ownerRole", "fixtureRef", "oracleType", "evidenceClass", "oracle"]) {
      if (typeof evaluation[field] !== "string" || evaluation[field].length === 0) fail(`${evaluation.id}: missing ${field}`);
    }
    if (!evaluationTiers.has(evaluation.tier)) fail(`${evaluation.id}: invalid tier ${evaluation.tier}`);
    if (!evaluationStatuses.has(evaluation.status)) fail(`${evaluation.id}: invalid status ${evaluation.status}`);
    if (typeof evaluation.blocking !== "boolean") fail(`${evaluation.id}: blocking must be boolean`);
    if (!Array.isArray(evaluation.requirements) || evaluation.requirements.length === 0) fail(`${evaluation.id}: requirements must be non-empty`);
    if (!Array.isArray(evaluation.prerequisites) || evaluation.prerequisites.length === 0) fail(`${evaluation.id}: prerequisites must be non-empty`);
    for (const requirement of evaluation.requirements ?? []) if (!allowedRequirements.has(requirement)) fail(`${evaluation.id}: invalid requirement ${requirement}`);
    if (!tickets.has(evaluation.ownerTicket)) fail(`${evaluation.id}: unknown ownerTicket ${evaluation.ownerTicket}`);
  }
  for (const ticket of tickets.values()) {
    const coveredRequirements = new Set();
    for (const evaluationId of ticket.evaluations ?? []) {
      if (!evaluations.has(evaluationId)) fail(`${ticket.id}: unknown evaluation ${evaluationId}`);
      else {
        const evaluation = evaluations.get(evaluationId);
        for (const requirement of evaluation.requirements ?? []) coveredRequirements.add(requirement);
        if (evaluation.ownerTicket !== ticket.id && ticketDependsOn(evaluation.ownerTicket, ticket.id)) {
          fail(`${ticket.id}: evaluation ${evaluationId} owner ${evaluation.ownerTicket} depends on its consuming ticket`);
        }
      }
      if (!evaluationReferences.has(evaluationId)) evaluationReferences.set(evaluationId, new Set());
      evaluationReferences.get(evaluationId).add(ticket.id);
    }
    for (const requirement of ticket.requirements ?? []) {
      if (!coveredRequirements.has(requirement)) fail(`${ticket.id}: requirement ${requirement} is not covered by linked evaluations`);
    }
  }
  for (const evaluation of evaluations.values()) {
    const references = evaluationReferences.get(evaluation.id) ?? new Set();
    if (references.size === 0) fail(`${evaluation.id}: not referenced by any ticket`);
    if (!references.has(evaluation.ownerTicket)) fail(`${evaluation.id}: ownerTicket ${evaluation.ownerTicket} does not list the evaluation`);
    if (evaluation.fixtureRef.startsWith("planned:") && activeTicketStatuses.has(tickets.get(evaluation.ownerTicket)?.status)) fail(`${evaluation.id}: planned fixture cannot support active owner ticket`);
  }
  for (const inherited of evalManifest.inheritedManifests ?? []) {
    if (!isPlainObject(inherited) || typeof inherited.path !== "string" || !/^[a-f0-9]{64}$/.test(inherited.sha256 ?? "")) {
      fail("evaluation manifest: invalid inherited manifest pin");
      continue;
    }
    const text = readText(inherited.path, "evaluation inherited manifest");
    if (text !== null && createHash("sha256").update(text).digest("hex") !== inherited.sha256) fail(`evaluation manifest: inherited hash drift ${inherited.path}`);
    addDigest(inherited.path, "evaluation inherited manifest");
  }
}

if (adoptionLedger) {
  if (adoptionLedger.schemaVersion !== 2) fail("adoption ledger: unsupported schemaVersion");
  if (adoptionLedger.status !== "planning-baseline-incomplete") fail("adoption ledger: invalid status");
  if (adoptionLedger.implementationAuthorized !== false) fail("adoption ledger: cannot authorize implementation");
  if (!Array.isArray(adoptionLedger.entries) || adoptionLedger.entries.length === 0) fail("adoption ledger: entries must be a non-empty array");
  const licenseStatuses = new Set(adoptionLedger.vocabulary?.licenseStatuses ?? []);
  const identityTypes = new Set(adoptionLedger.vocabulary?.identityTypes ?? []);
  const ids = new Set();
  for (const entry of adoptionLedger.entries ?? []) {
    if (!isPlainObject(entry) || typeof entry.id !== "string") {
      fail("adoption ledger: entry must be an object with id");
      continue;
    }
    if (ids.has(entry.id)) fail(`adoption ledger: duplicate ${entry.id}`);
    ids.add(entry.id);
    for (const field of ["name", "category", "source", "decisionSource", "identity", "license", "phase", "boundedUse", "decision", "recordCompleteness", "permissionsSummary", "dataClass", "telemetry", "ownerRole", "stopGate", "qualificationOracle", "killOrRemoval", "ownerTicket"]) {
      if (entry[field] === undefined || entry[field] === "") fail(`${entry.id}: missing ${field}`);
    }
    if (!decisions.has(entry.decision)) fail(`${entry.id}: invalid decision ${entry.decision}`);
    if (!licenseStatuses.has(entry.license?.status)) fail(`${entry.id}: invalid license status ${entry.license?.status}`);
    if (!identityTypes.has(entry.identity?.type)) fail(`${entry.id}: invalid identity type ${entry.identity?.type}`);
    if (!Array.isArray(entry.missingControls)) fail(`${entry.id}: missingControls must be an array`);
    for (const allowance of ["codeUseAllowed", "serviceUseAllowed", "releaseUseAllowed", "expansionAllowed"]) {
      if (typeof entry[allowance] !== "boolean") fail(`${entry.id}: ${allowance} must be boolean`);
    }
    const anyAllowed = entry.codeUseAllowed || entry.serviceUseAllowed || entry.releaseUseAllowed || entry.expansionAllowed;
    if (anyAllowed && !allowedUseDecisions.has(entry.decision)) fail(`${entry.id}: ${entry.decision} cannot allow use`);
    if (anyAllowed && entry.recordCompleteness !== "complete") fail(`${entry.id}: incomplete entry cannot allow use`);
    if (entry.recordCompleteness === "incomplete" && entry.missingControls.length === 0) fail(`${entry.id}: incomplete entry must name missingControls`);
    if (entry.recordCompleteness === "incomplete" && anyAllowed) fail(`${entry.id}: incomplete allowances must all be false`);
    if (["unselected", "service-unselected", "model-unselected", "mutable-tag"].includes(entry.identity?.type) && anyAllowed) fail(`${entry.id}: unresolved identity cannot allow use`);
    if (!tickets.has(entry.ownerTicket)) fail(`${entry.id}: unknown ownerTicket ${entry.ownerTicket}`);
  }
}

const traceability = readText(traceabilityPath);
if (traceability !== null) {
  for (let index = 1; index <= 19; index += 1) {
    const id = `EOS-${String(index).padStart(3, "0")}`;
    const matches = traceability.match(new RegExp(`^\\| ${id.replace("-", "\\-")} `, "gm")) ?? [];
    if (matches.length !== 1) fail(`program traceability: ${id} must have exactly one table row`);
    const row = traceability.split("\n").find((line) => line.startsWith(`| ${id} `)) ?? "";
    const cells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
    const evaluationIds = [...(cells[1] ?? "").matchAll(/PROG-EVAL-[A-Z0-9-]+/g)].map((match) => match[0]);
    const ticketId = (cells[2] ?? "").match(/OBX-P\d{3}/)?.[0];
    if (evaluationIds.length === 0 || !ticketId) fail(`program traceability: ${id} row lacks evaluation or ticket`);
    for (const evaluationId of evaluationIds) {
      if (!evaluations.has(evaluationId)) fail(`program traceability: ${id} unknown evaluation ${evaluationId}`);
      else if (!(evaluations.get(evaluationId).requirements ?? []).includes(id)) fail(`program traceability: ${id} evaluation ${evaluationId} does not cover ${id}`);
    }
    if (ticketId && !tickets.has(ticketId)) fail(`program traceability: ${id} unknown ticket ${ticketId}`);
    else if (ticketId && !(tickets.get(ticketId).requirements ?? []).includes(id)) fail(`program traceability: ${id} ticket ${ticketId} does not own ${id}`);
  }
}

const ciWorkflow = readText(ciWorkflowPath);
if (ciWorkflow !== null) {
  for (const action of ["actions/checkout", "actions/setup-node"]) {
    const reference = ciWorkflow.match(new RegExp(`uses:\\s+${action.replace("/", "\\/")}@([^\\s#]+)`))?.[1];
    if (!/^[a-f0-9]{40}$/.test(reference ?? "")) fail(`ci workflow: ${action} must use a full commit SHA`);
  }
}

const frontDoorToken = authorityPath;
for (const path of ["AGENTS.md", "README.md"]) {
  const text = readText(path);
  if (text !== null && !text.includes(frontDoorToken)) fail(`${path}: missing authority-manifest front door`);
}
for (const path of ["docs/plans/one-box-master/README.md", "docs/plans/one-box-master/00-authority/plan-register.md"]) {
  const text = readText(path);
  if (text !== null && !text.includes("authority-manifest.json")) fail(`${path}: missing authority-manifest link`);
}

const linkPacket = new Set([
  "AGENTS.md",
  "README.md",
  "CONTRIBUTING.md",
  ...filesUnder("docs/plans/one-box-master").filter((path) => path.endsWith(".md")),
  ...filesUnder("docs/governance").filter((path) => path.endsWith(".md")),
  ...filesUnder("docs/tickets/one-box-program").filter((path) => path.endsWith(".md")),
  ...filesUnder("docs/eval/one-box-program").filter((path) => path.endsWith(".md")),
  ...filesUnder("docs/architecture").filter((path) => path.endsWith(".md")),
  ...filesUnder("docs/security").filter((path) => path.endsWith(".md")),
  ...filesUnder("docs/tickets/ai-teammate-foundation").filter((path) => path.endsWith(".md")),
  "docs/specs/2026-08-29-ai-teammate-foundation-v1.md",
  "docs/plans/2026-08-29-ai-teammate-foundation-v1-implementation.md",
  ...filesUnder(".github").filter((path) => path.endsWith(".md")),
]);
for (const path of linkPacket) validateLocalLinks(path);

for (const path of [
  scopedImplementationAuthorityPath,
  teammateFoundationTicketPath,
  evalPath,
  ticketPath,
  ledgerPath,
  traceabilityPath,
  "docs/tickets/one-box-program/README.md",
  ticketBodyContractPath,
  requirementVocabularyPath,
  "docs/governance/reviewer-roles.md",
  "docs/eval/quarantine/README.md",
  "docs/governance/risk-exceptions/README.md",
  "CONTRIBUTING.md",
  "package.json",
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
  "scripts/verify-p180-phase1-correction-authorization.mjs",
  "scripts/verify-p180-phase1-superseding-correction-authorization.mjs",
  "docs/governance/risk-exceptions/2026-09-01-obx-p180-t03-audit-correction-solo.json",
  "docs/governance/risk-exceptions/2026-09-01-obx-p180-t04-audit-correction-solo.json",
  "docs/audits/evidence/security/2026-09-01-obx-p180-phase1-audit-correction-security-review.json",
  "docs/governance/risk-exceptions/2026-09-01-obx-p180-t03-audit-correction-supersession-solo.json",
  "docs/governance/risk-exceptions/2026-09-01-obx-p180-t04-audit-correction-supersession-solo.json",
  "docs/audits/evidence/security/2026-09-01-obx-p180-phase1-audit-correction-supersession-security-review.json",
  "docs/plans/one-box-master/00-authority/plan-register.md",
  ciWorkflowPath,
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/feature.yml",
]) addDigest(path);

if (authority) {
  const canonicalAuthority = { ...authority };
  delete canonicalAuthority.packetDigest;
  digestInputs.set(`${authorityPath}#without-packetDigest`, Buffer.from(`${JSON.stringify(canonicalAuthority, null, 2)}\n`));
}

const digest = createHash("sha256");
for (const [path, bytes] of [...digestInputs].sort(([left], [right]) => left.localeCompare(right))) {
  digest.update(path);
  digest.update("\0");
  digest.update(bytes);
  digest.update("\0");
}
const packetDigest = digest.digest("hex");
if (authority && authority.packetDigest !== packetDigest) fail(`authority manifest: packetDigest mismatch; expected current ${packetDigest}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`Plan authority verification failed with ${failures.length} issue(s).`);
  process.exit(1);
}

if (!authority || !scopedImplementationAuthority || !teammateFoundationTicketManifest || !ticketManifest || !evalManifest || !adoptionLedger || Object.keys(authority.domains).length === 0 || scopedAuthorizations.size === 0 || tickets.size === 0 || evaluations.size === 0) {
  console.error("FAIL verifier reached an impossible empty success state");
  process.exit(1);
}

console.log(`Plan authority verification passed: ${Object.keys(authority.domains).length} domains, ${tickets.size} tickets, ${evaluations.size} program evaluations.`);
console.log(`Authority packet SHA-256: ${packetDigest}`);
