import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Release 1 per-phase solo authorization module.
 *
 * Mirrors scripts/verify-p180-t02-authorization.mjs. It validates every
 * OBX-AUTH-R1-P<phase>-SOLO-<nnn> record in the scoped implementation
 * authorization registry against exact constants, live file hashes, the program
 * ticket manifest, the program evaluation manifest, and the authority manifest.
 *
 * It never grants authority. Every check either passes or appends a failure.
 */

export const R1_PHASE_AUTHORIZATION_ID_PATTERN = /^OBX-AUTH-R1-P(1|2|3L|4)-SOLO-\d{3}$/;

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

const REGISTRY_PATH = "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json";
const AUTHORITY_PATH = "docs/plans/one-box-master/00-authority/authority-manifest.json";
const TICKET_MANIFEST_PATH = "docs/tickets/one-box-program/manifest.json";
const EVAL_MANIFEST_PATH = "docs/eval/one-box-program/manifest.json";
const ACCEPTANCE_PATH = "docs/governance/acceptances/2026-09-02-release-1-packet-acceptance.json";

const BASE_COMMIT = "4b02f75ff8954ee09b1c58d4e16a600f6fe4ca41";
const RECORDED_AT = "2026-09-02T13:00:00Z";
const EXPIRES_AT = "2026-09-16T13:00:00Z";
const THREE_HUNDRED_THIRTY_SIX_HOURS_MS = 1_209_600_000;

const P1_AUTHORIZATION_SHA256 = "b3bd8ac09c369b3472c76c2712e2e7349c67f198f9068124bc4b1b08a39a021e";
const P2_AUTHORIZATION_SHA256 = "ea6b625d5c7a6815d44136caa1d181fc081ee730a4a29a5359d43abcfdda04ac";
const P1_AMENDMENT_SHA256 = "ec8e4c20ecf2b49caf5261a0b83faf8adf9c0d0991ead773a09d1e67567ca685";
const P2_AMENDMENT_SHA256 = "9091f40bb7e30fbf12366ecd61dda25be3e76f9429a7239248c9362ca5ca5a77";

const P1_AMENDMENT_PATH = "docs/governance/risk-exceptions/2026-09-02-release-1-p1-solo.json";
const P2_AMENDMENT_PATH = "docs/governance/risk-exceptions/2026-09-02-release-1-p2-solo.json";
const P1_PACKET_PATH = "docs/plans/2026-09-02-release-1-p1-lifecycle-authorization-design.md";
const P2_PACKET_PATH = "docs/plans/2026-09-02-release-1-p2-canvas-approval-authorization-design.md";
const P1_SECURITY_RECEIPT_PATH = "docs/audits/evidence/security/2026-09-02-release-1-p1-solo-authorization-security-review.json";
const P2_SECURITY_RECEIPT_PATH = "docs/audits/evidence/security/2026-09-02-release-1-p2-solo-authorization-security-review.json";
const P1_GROK_RECEIPT_PATH = "docs/audits/grok-4.6/2026-09-02-release-1-p1-authorization-audit.json";
const P2_GROK_RECEIPT_PATH = "docs/audits/grok-4.6/2026-09-02-release-1-p2-authorization-audit.json";

// Exactly the governance files this activation pull request writes. The wave-2
// re-pin record is written by the integrator after the wave-0 merge, so it is not
// part of this write set.
const ACTIVATION_WRITE_SET = [
  REGISTRY_PATH,
  AUTHORITY_PATH,
  "docs/plans/one-box-master/00-authority/plan-register.md",
  ACCEPTANCE_PATH,
  P1_AMENDMENT_PATH,
  P2_AMENDMENT_PATH,
  P1_PACKET_PATH,
  P2_PACKET_PATH,
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
  "scripts/verify-r1-phase-authorization.mjs",
  P1_SECURITY_RECEIPT_PATH,
  P2_SECURITY_RECEIPT_PATH,
];

// The security receipts attest every activation target except the receipts
// themselves and the authority manifest. The manifest carries the packetDigest
// field, which is re-pinned after the receipts are written, so the receipts bind
// the manifest through its canonical without-packetDigest hash instead.
const RECEIPT_TARGET_PATHS = ACTIVATION_WRITE_SET.filter((path) => (
  path !== AUTHORITY_PATH
  && path !== P1_SECURITY_RECEIPT_PATH
  && path !== P2_SECURITY_RECEIPT_PATH
));

const UNTRACKED_BASELINE = [{
  path: ".claude/handoffs/one-box-operating-environment-next-phase.md",
  algorithm: "sha256",
  digest: "cbbc878aa0691f333b128a71aee43adde89a9691a9ed65880f1f2b41a20643a6",
}];

// Byte-identical to the OBX-AUTH-P180-T02-SOLO-001 record, so the pin is provably
// unchanged by this wave.
const GOVERNANCE_BINDINGS = [
  { path: "docs/governance/risk-exceptions/README.md", algorithm: "sha256", digest: "c5139be92b42987e70d73b6851530d4917c8716b96cfcfbda1c7e9a685f726c2" },
  { path: "docs/governance/reviewer-roles.md", algorithm: "sha256", digest: "ea1f4cf440ce3122bf40866c0097c516550d876e9674462bbe61edc7dcb701bc" },
];
const DEPENDENCY_BINDINGS = [
  { path: "package.json", algorithm: "sha256", digest: "c1feab7cc337c89a59d344da2854764b488a831bf40ab6e98d00338a5a7d421e" },
  { path: "package-lock.json", algorithm: "sha256", digest: "b2f15e1f27c86ad1c2b98a67674367ce8ada5fb9ba6d32702f9de4bd09a66191" },
];

// docs/governance/reviewer-roles.md:17-20 and
// docs/governance/risk-exceptions/README.md:7-10, encoded here so neither pinned
// file has to change.
const NON_WAIVABLE_CLASSES = [
  "authentication-authorization",
  "tenant-isolation",
  "untrusted-browser-or-file-input",
  "secrets-privacy",
  "loss-risk-migration",
  "release-rollback",
  "appointment-authority",
  "release-candidate",
];

const FORBIDDEN_EFFECTS = [
  "provider-or-model-call-outside-existing-guarded-paths",
  "network",
  "credential-or-environment-access",
  "new-endpoint-outside-isLocalApiAuthorized-guard",
  "public-or-remote-origin",
  "client-invitation",
  "dependency-or-lockfile-change",
  "page-ir-v1-or-generated-site-schema-change",
  "mint-approval-client-lock-qualification-or-release-from-model-client-api-or-ui",
  "deployment",
  "release",
  "rollback-execution",
  "appointment-field-slot-lease-or-runtime",
  "browser",
  "collaboration-realtime-or-crdt",
  "motion-authoring",
  "edit-frozen-t01-t02-artifacts",
  "edit-governance-defaults",
  "edit-authority-manifest-outside-activation-write-set",
  "parent-ticket-or-evaluation-promotion",
  "independent-human-review-claim",
  "production-readiness-or-release-1-exit-claim",
  "numeric-quality-threshold",
];

const ALLOWED_DATA_CLASSES = ["public", "project-internal", "synthetic-fixture"];

const REVIEW_PROTOCOL = {
  exactModel: "x-ai/grok-4.6",
  lane: "openrouter-metered",
  effort: "high",
  auditScript: "scripts/eval/grok-audit.mjs",
  modelAuthority: "advisory-only",
  testAuthority: "deterministic-fixtures-vitest-node-test-and-e2e",
  packetReview: "one-ticket-readiness-packet-before-first-commit-and-one-final-diff-packet-before-merge",
  ownerAuthorizedFallbackAllowed: true,
  fallbackMustRetainFailedAttempt: true,
  fallbackMustIdentifyActualModel: true,
};

const INVALIDATORS = [
  "authorization-hash-mismatch",
  "amendment-path-id-schema-or-hash-drift",
  "predecessor-path-or-hash-drift",
  "activation-write-set-or-handoff-drift",
  "timestamp-invalid-expired-or-renewal",
  "assignment-or-separation-claim",
  "requirement-exception-drift",
  "allowed-path-or-effect-drift",
  "dependency-or-lockfile-change",
  "governance-default-path-or-hash-drift",
  "provider-network-credential-or-environment-effect",
  "public-or-remote-origin-effect",
  "browser-collaboration-or-motion-authoring-effect",
  "page-ir-v1-or-generated-site-schema-change",
  "deployment-release-or-rollback-effect",
  "parent-ticket-or-evaluation-promotion",
  "security-receipt-missing-stale-or-malformed",
  "model-receipt-missing-stale-or-mislabelled",
  "gate-failure",
  "additional-unaccepted-finding",
  "independent-review-or-production-readiness-claim",
  "non-waivable-class-touched",
  "package-json-or-lockfile-hash-drift",
  "parent-ticket-status-drift",
  "expired-t01-or-t02-record-in-registry",
];

const P1_TICKET_SCOPES = [
  {
    ticketId: "OBX-P200-T01",
    allowedPaths: [
      "src/lib/contracts.ts",
      "src/lib/contracts.test.ts",
      "src/lib/releaseLifecycle.ts",
      "src/lib/releaseLifecycle.test.ts",
    ],
    allowedEffects: ["add-closed-lifecycle-contracts-and-pure-transitions"],
  },
  {
    ticketId: "OBX-P200-T02",
    allowedPaths: [
      "src/lib/runstate.ts",
      "src/lib/runstate.test.ts",
      "src/lib/releaseLifecycleStore.ts",
      "src/lib/releaseLifecycleStore.test.ts",
      "src/lib/pageIrController.ts",
      "src/lib/pageIrController.test.ts",
      "src/lib/pipelineReplay.test.ts",
    ],
    allowedEffects: [
      "persist-optional-lifecycle-record-under-withRunTransaction",
      "bind-promoted-page-ir-build-to-canvas-ready",
    ],
  },
  {
    ticketId: "OBX-P200-T03",
    allowedPaths: [
      "src/app/api/lifecycle/[id]/route.ts",
      "src/app/api/lifecycle/[id]/route.test.ts",
      "src/components/preview/LifecycleStatus.tsx",
      "src/components/preview/LifecycleStatus.test.tsx",
      "src/app/preview/[id]/page.tsx",
      "scripts/e2e/preview-workbench.mjs",
      "docs/architecture/README.md",
      "docs/security/local-api-threat-model.md",
    ],
    allowedEffects: [
      "add-loopback-read-only-lifecycle-projection-route",
      "add-read-only-canvas-lifecycle-status",
      "document-lifecycle-module-ownership",
    ],
  },
];

const P2_TICKET_SCOPES = [
  {
    ticketId: "OBX-P210-T00",
    allowedPaths: ["docs/plans/2026-09-02-release-1-p2-fingerprint-and-lock-order-design.md"],
    allowedEffects: [],
  },
  {
    ticketId: "OBX-P210-T01",
    allowedPaths: [
      "src/lib/pageIrMutation.ts",
      "src/lib/pageIrMutation.test.ts",
      "src/lib/siteMutation.ts",
      "src/lib/siteMutation.test.ts",
      "src/lib/elementEditor.ts",
      "src/lib/elementEditor.test.ts",
      "src/lib/mutationGateMatrix.ts",
      "src/lib/mutationGateMatrix.test.ts",
      "src/lib/releaseLifecycleStore.ts",
      "src/lib/releaseLifecycleStore.test.ts",
      "src/lib/contracts.ts",
      "src/lib/contracts.test.ts",
    ],
    allowedEffects: [
      "emit-design-mutation-accepted-with-presentational-flag",
      "compute-visual-and-interaction-fingerprints",
    ],
  },
  {
    ticketId: "OBX-P210-T02",
    allowedPaths: [
      "src/lib/pageIrController.ts",
      "src/lib/pageIrController.test.ts",
      "src/lib/candidatePromotion.ts",
      "src/lib/candidatePromotion.test.ts",
      "src/lib/pipelineStaleVisualQa.test.ts",
      "src/lib/contracts.ts",
      "src/lib/contracts.test.ts",
    ],
    allowedEffects: [
      "bind-named-human-visual-decision-to-candidate-hash",
      "template-v1-promotion-lifecycle-binding",
    ],
  },
  {
    ticketId: "OBX-P210-T03",
    allowedPaths: [
      "src/components/preview/LifecycleStatus.tsx",
      "src/components/preview/LifecycleStatus.test.tsx",
      "src/components/preview/Workbench.tsx",
      "src/app/styles/workbench.css",
      "scripts/e2e/preview-workbench.mjs",
      "scripts/e2e/canvas-contract.mjs",
    ],
    allowedEffects: ["show-current-approval-state-read-only"],
  },
];

function unionPaths(ticketScopes) {
  const seen = [];
  for (const scope of ticketScopes) {
    for (const path of scope.allowedPaths) if (!seen.includes(path)) seen.push(path);
  }
  return seen;
}

function unionEffects(ticketScopes) {
  const seen = [];
  for (const scope of ticketScopes) {
    for (const effect of scope.allowedEffects) if (!seen.includes(effect)) seen.push(effect);
  }
  return seen;
}

const ROLE_ROW = (roleId) => ({
  roleId,
  assignmentStatus: "NOT_AVAILABLE",
  assignmentRecordPresent: false,
  humanActorId: null,
  escalationStatus: "NOT_AVAILABLE",
  escalationActorId: null,
  separationSatisfied: false,
});

const BUILDER_LANE = {
  kind: "claude-agent",
  models: ["claude-opus-5", "claude-sonnet-5"],
  controllerActorId: "person:devin-wiggins",
};

const OWNER_RESPONSE = "Let's go ahead and merge PR18 now. With ZS allow git 1. Number two, I accept the release packet. Number three, let's run zero through three. Number four, please provide me an initialization prompt so that I can fan out, do research, and gather real agency analysis inside of Codex, in a separate session. For visual quality bars I've added 2 different worksheets ... please, any blockers, let's take care of them now so we can run this on a loop.";
const PATH_SCOPE_DERIVATION = "The exact allowedPaths, ticketScopes, and allowedEffects lists derive from section 4 of the wave-2 authorization path plan and are recorded before the first P1 or P2 task starts, as run contract section 5 requires: Path scopes are written into the run's authorization record before the task starts, never after.";

export const EXPECTED_RECORD_KEYS = [
  "id", "recordKind", "status", "implementationAuthorized", "projectId", "branch",
  "baseCommit", "activationBaseCommit", "activationWriteSet", "preExistingUntrackedBaseline",
  "parentTicketId", "parentTicketStatus", "childTicketIds", "authorizationProposalId",
  "ownerActorId", "riskOwnerActorId", "implementationActorId", "authorizedByActorId",
  "ownerDirection", "builderLane", "ownerAssignmentV1Status", "roleAvailability",
  "implementationAuthorizationSeparation", "escalation", "independentHumanReview",
  "acceptedRisk", "requirementExceptions", "nonWaivableClassesTouched", "traceabilityRefs",
  "ticketScopes", "allowedPaths", "allowedEffects", "allowedDataClasses", "forbiddenEffects",
  "predecessorBinding", "planBindings", "governanceBindings", "dependencyBindings",
  "amendmentBinding", "reviewProtocol", "requiredEvidencePaths", "invalidators",
  "recordedAt", "expiresAt", "renewable", "authorizationHash",
];

const PHASES = {
  "OBX-AUTH-R1-P1-SOLO-001": {
    phase: "P1",
    authorizationSha256: P1_AUTHORIZATION_SHA256,
    amendmentPath: P1_AMENDMENT_PATH,
    amendmentId: "OBX-R1-P1-SOLO-AMENDMENT-001",
    amendmentSha256: P1_AMENDMENT_SHA256,
    amendmentDecision: "ACCEPT_EXACT_SOLO_R1_P1_RISK_AND_START",
    packetPath: P1_PACKET_PATH,
    securityReceiptPath: P1_SECURITY_RECEIPT_PATH,
    grokReceiptPath: P1_GROK_RECEIPT_PATH,
    parentTicketId: "OBX-P200",
    parentTicketStatus: "proposed",
    childTicketIds: ["OBX-P200-T01", "OBX-P200-T02", "OBX-P200-T03"],
    authorizationProposalId: "OBX-AUTH-R1-P1-PROPOSAL-V1",
    findingId: "OBX-R1-P1-SOLO-SEPARATION-001",
    roleIds: ["implementation-lead", "website-authority-owner", "independent-security-verifier"],
    traceabilityRefs: ["P1", "EOS-002", "PROG-EVAL-LIFE-001"],
    evaluationIds: ["PROG-EVAL-LIFE-001"],
    ticketScopes: P1_TICKET_SCOPES,
    planPaths: [
      "docs/superpowers/plans/2026-08-27-release-lifecycle-foundation.md",
      "docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md",
      "docs/plans/one-box-master/01-foundation/release-1-contract.md",
      "docs/plans/one-box-master/01-foundation/release-1-compatibility-matrix.md",
      P1_PACKET_PATH,
    ],
    requirementExceptions: [{
      requirementId: "OBX-P200-DEFINITION-OF-READY",
      exceptionStatus: "EXCEPT_R1_P1_SOLO",
      satisfactionStatus: "NOT_SATISFIED",
      waivedClauses: ["named-accountable-owner", "non-author-verifier"],
      preservedClauses: ["exact-grok-or-fallback-packet-review-before-ready"],
    }],
    predecessorBinding: null,
  },
  "OBX-AUTH-R1-P2-SOLO-001": {
    phase: "P2",
    authorizationSha256: P2_AUTHORIZATION_SHA256,
    amendmentPath: P2_AMENDMENT_PATH,
    amendmentId: "OBX-R1-P2-SOLO-AMENDMENT-001",
    amendmentSha256: P2_AMENDMENT_SHA256,
    amendmentDecision: "ACCEPT_EXACT_SOLO_R1_P2_RISK_AND_START",
    packetPath: P2_PACKET_PATH,
    securityReceiptPath: P2_SECURITY_RECEIPT_PATH,
    grokReceiptPath: P2_GROK_RECEIPT_PATH,
    parentTicketId: "OBX-P210",
    parentTicketStatus: "proposed",
    childTicketIds: ["OBX-P210-T00", "OBX-P210-T01", "OBX-P210-T02", "OBX-P210-T03"],
    authorizationProposalId: "OBX-AUTH-R1-P2-PROPOSAL-V1",
    findingId: "OBX-R1-P2-SOLO-SEPARATION-001",
    roleIds: [
      "implementation-lead",
      "website-authority-owner",
      "independent-security-verifier",
      "canvas-and-agent-security-owner",
      "design-visual-owner",
    ],
    traceabilityRefs: ["P2", "A0", "A1", "A2", "A3", "PROG-EVAL-CANVAS-001"],
    evaluationIds: ["PROG-EVAL-CANVAS-001"],
    ticketScopes: P2_TICKET_SCOPES,
    planPaths: [
      "docs/superpowers/specs/2026-08-27-canvas-to-agency-shipping-design.md",
      "docs/plans/one-box-master/01-foundation/release-1-contract.md",
      "docs/plans/one-box-master/01-foundation/release-1-compatibility-matrix.md",
      P2_PACKET_PATH,
    ],
    requirementExceptions: [{
      requirementId: "OBX-P210-DEFINITION-OF-READY",
      exceptionStatus: "EXCEPT_R1_P2_SOLO",
      satisfactionStatus: "NOT_SATISFIED",
      waivedClauses: ["named-accountable-owner", "non-author-verifier"],
      preservedClauses: ["exact-grok-or-fallback-packet-review-before-ready"],
    }],
    // P1 has not merged, so no P1 byte exists to hash. The binding declares P1's
    // exact file list and stays PENDING_PREDECESSOR_MERGE until that merge.
    predecessorBinding: {
      ticketId: "OBX-P200",
      authorizationId: "OBX-AUTH-R1-P1-SOLO-001",
      checkpointCommit: null,
      status: "PENDING_PREDECESSOR_MERGE",
      files: unionPaths(P1_TICKET_SCOPES),
    },
  },
};

export const R1_PHASE_AUTHORIZATION_IDS = Object.keys(PHASES);

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
  exact(Object.keys(value).sort(), [...keys].sort(), `${label}.keys`, failures);
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

/**
 * An authorized path names one file. Globs, traversal, absolute paths, and the
 * broad prefixes rejected by the plan-authority verifier are refused here too.
 * A bracketed segment is allowed only as a whole Next.js dynamic segment, which
 * is how the App Router spells a single concrete route file.
 */
function checkAuthorizedPath(path, label, failures) {
  const broadPaths = new Set(["src/", "src/lib/", "src/app/", "src/components/", "docs/", "scripts/"]);
  const dynamicSegment = /^\[[A-Za-z0-9_]+\]$/;
  if (
    typeof path !== "string"
    || path.length === 0
    || path.startsWith("/")
    || path.endsWith("/")
    || normalize(path) !== path
    || normalize(path).startsWith("..")
    || /[*?{}]/.test(path)
    || broadPaths.has(path)
    || path.split("/").some((segment) => segment.includes("[") || segment.includes("]") ? !dynamicSegment.test(segment) : false)
  ) {
    failures.push(`${label}: authorized path must be explicit and repository-relative`);
    return false;
  }
  return true;
}

function validateAmendment(repoRoot, phase, record, failures) {
  const label = `${record.id}.amendment`;
  const amendment = readJson(repoRoot, phase.amendmentPath, label, failures);
  if (sha256File(repoRoot, phase.amendmentPath, label, failures) !== phase.amendmentSha256) {
    failures.push(`${label}: SHA-256 drift`);
  }
  if (record?.amendmentBinding?.digest !== phase.amendmentSha256) {
    failures.push(`${record.id}.amendmentBinding: digest drift`);
  }
  exact(record?.amendmentBinding, {
    path: phase.amendmentPath,
    amendmentId: phase.amendmentId,
    algorithm: "sha256",
    digest: phase.amendmentSha256,
  }, `${record.id}.amendmentBinding`, failures);
  if (!amendment) return;
  const scalars = {
    schemaVersion: 1,
    amendmentId: phase.amendmentId,
    recordKind: "owner-solo-phase-governance-amendment-v3",
    status: "ACTIVE",
    authorizationId: record.id,
    projectId: "one-box",
    branch: "main",
    baseCommit: BASE_COMMIT,
    activationBaseCommit: BASE_COMMIT,
    parentTicketId: phase.parentTicketId,
    standardWaiverEligible: false,
    nonWaivableDefaultPreserved: true,
    recordedAt: RECORDED_AT,
    expiresAt: EXPIRES_AT,
    renewable: false,
  };
  for (const [field, expected] of Object.entries(scalars)) {
    if (amendment[field] !== expected) failures.push(`${label}: ${field} drift`);
  }
  exact(amendment.childTicketIds, phase.childTicketIds, `${label}.childTicketIds`, failures);
  exact(amendment.nonWaivableClassesTouched, [], `${label}.nonWaivableClassesTouched`, failures);
  exact(amendment.scope?.allowedPaths, unionPaths(phase.ticketScopes), `${label}.scope.allowedPaths`, failures);
  exact(amendment.scope?.allowedEffects, unionEffects(phase.ticketScopes), `${label}.scope.allowedEffects`, failures);
  exact(amendment.scope?.forbiddenEffects, FORBIDDEN_EFFECTS, `${label}.scope.forbiddenEffects`, failures);
  if (amendment.scope?.denyUnlistedPathsAndEffects !== true) {
    failures.push(`${label}.scope: denyUnlistedPathsAndEffects must be true`);
  }
  exact(amendment.reviewProtocol, REVIEW_PROTOCOL, `${label}.reviewProtocol`, failures);
  exact(amendment.requiredEvidencePaths, [phase.securityReceiptPath, phase.grokReceiptPath], `${label}.requiredEvidencePaths`, failures);
  exact(amendment.requirementExceptions, phase.requirementExceptions, `${label}.requirementExceptions`, failures);
  exact(amendment.independentHumanReview, { status: "NOT_AVAILABLE", satisfied: false, actorId: null }, `${label}.independentHumanReview`, failures);
  if (amendment.ownerDirection?.decision !== phase.amendmentDecision
    || amendment.ownerDirection?.actorId !== "person:devin-wiggins"
    || amendment.ownerDirection?.recordedAt !== record.recordedAt
    || amendment.ownerDirection?.ownerResponse !== OWNER_RESPONSE) {
    failures.push(`${label}.ownerDirection: exact owner decision drift`);
  }
  if (!Array.isArray(amendment.unavailableControls)
    || !amendment.unavailableControls.some((row) => row?.controlId === `owner-assignment-v1-${phase.phase.toLowerCase()}`)
    || !amendment.unavailableControls.some((row) => row?.controlId === "implementation-actor-authorizer-separation")
    || !amendment.unavailableControls.some((row) => row?.controlId === "independent-human-security-review")) {
    failures.push(`${label}.unavailableControls: required lost-control rows missing`);
  }
  if (!Array.isArray(amendment.compensatingControls) || amendment.compensatingControls.length === 0) {
    failures.push(`${label}.compensatingControls: must be a non-empty array`);
  }
}

function validateSecurityReceipt(repoRoot, phase, record, authority, failures) {
  const label = `${record.id}.securityReceipt`;
  const receipt = readJson(repoRoot, phase.securityReceiptPath, label, failures);
  if (!receipt) return;
  checkKeys(receipt, [
    "schemaVersion", "receiptKind", "authorizationId", "authorizationHash", "amendmentId",
    "amendmentHash", "baseCommit", "targetPaths", "targetHashes",
    "authorityManifestWithoutPacketDigest", "verdict", "findings", "independentHumanReview",
    "capturedAt",
  ], label, failures);
  const scalars = {
    schemaVersion: 1,
    receiptKind: "solo-phase-security-review-v3",
    authorizationId: record.id,
    authorizationHash: phase.authorizationSha256,
    amendmentId: phase.amendmentId,
    amendmentHash: phase.amendmentSha256,
    baseCommit: BASE_COMMIT,
    verdict: "PASS-WITH-ACCEPTED-RISK",
  };
  for (const [field, expected] of Object.entries(scalars)) {
    if (receipt[field] !== expected) failures.push(`${label}: ${field} drift`);
  }
  exact(receipt.independentHumanReview, { status: "NOT_AVAILABLE", satisfied: false }, `${label}.independentHumanReview`, failures);
  exact(receipt.targetPaths, RECEIPT_TARGET_PATHS, `${label}.targetPaths`, failures);
  checkBindings(repoRoot, receipt.targetHashes, `${label}.targetHashes`, failures);
  if (!Array.isArray(receipt.targetHashes)
    || receipt.targetHashes.map((binding) => binding.path).join("\n") !== RECEIPT_TARGET_PATHS.join("\n")) {
    failures.push(`${label}.targetHashes: exact target order drift`);
  }
  const manifestBinding = receipt.authorityManifestWithoutPacketDigest;
  if (manifestBinding?.path !== AUTHORITY_PATH
    || manifestBinding?.algorithm !== "sha256"
    || manifestBinding?.canonicalization !== "canonical-json-v1") {
    failures.push(`${label}.authorityManifestWithoutPacketDigest: binding contract drift`);
  } else if (authority) {
    const withoutDigest = structuredClone(authority);
    delete withoutDigest.packetDigest;
    if (createHash("sha256").update(canonicalJson(withoutDigest)).digest("hex") !== manifestBinding.digest) {
      failures.push(`${label}.authorityManifestWithoutPacketDigest: current hash drift ${AUTHORITY_PATH}`);
    }
  }
  if (!Array.isArray(receipt.findings) || receipt.findings.length !== 1) {
    failures.push(`${label}.findings: sole accepted separation finding required`);
    return;
  }
  const finding = receipt.findings[0];
  if (finding?.findingId !== phase.findingId || finding?.severity !== "MEDIUM" || finding?.status !== "ACCEPTED") {
    failures.push(`${label}.findings[0]: accepted finding drift`);
  }
  const expectedSurfaces = ["prompt-injection", "secrets", "authentication", "authorization", "untrusted-input", "export"];
  if (finding?.surfaceDisposition?.map((row) => row.surface).join("\n") !== expectedSurfaces.join("\n")) {
    failures.push(`${label}.findings[0].surfaceDisposition: exact six-surface drift`);
  }
  for (const row of finding?.surfaceDisposition ?? []) {
    if (!Array.isArray(row.changedPathEvidence) || row.changedPathEvidence.length === 0
      || row.changedPathEvidence.some((path) => !RECEIPT_TARGET_PATHS.includes(path))) {
      failures.push(`${label}.surfaceDisposition.${row.surface}: invalid changed-path evidence`);
    }
  }
}

function validateGrokReceipt(repoRoot, phase, record, failures) {
  const label = `${record.id}.modelReceipt`;
  const receipt = readJson(repoRoot, phase.grokReceiptPath, label, failures);
  if (!receipt) return;
  const requestedModel = receipt.requestedModel ?? receipt.request?.model;
  const providerReportedModel = receipt.providerReportedModel ?? receipt.provider?.model;
  const effort = receipt.effort ?? receipt.request?.effort;
  const audit = receipt.audit ?? receipt;
  if (effort !== REVIEW_PROTOCOL.effort) failures.push(`${label}: effort drift`);
  if (requestedModel !== REVIEW_PROTOCOL.exactModel || providerReportedModel !== REVIEW_PROTOCOL.exactModel) {
    const fallback = receipt.ownerAuthorizedFallback;
    if (!fallback || typeof fallback.primaryAttempt !== "object" || fallback.primaryAttempt === null
      || typeof fallback.ownerAuthorizationRef !== "string" || fallback.ownerAuthorizationRef.length === 0
      || typeof fallback.actualModel !== "string" || fallback.actualModel.length === 0
      || fallback.primaryAttempt.requestedModel !== REVIEW_PROTOCOL.exactModel) {
      failures.push(`${label}: exact model ${REVIEW_PROTOCOL.exactModel} required, or a labelled owner-authorized fallback block`);
    }
  }
  if (!["CLEAN", "FINDINGS"].includes(audit?.verdict) || !Array.isArray(audit?.findings)) {
    failures.push(`${label}: audit verdict schema drift`);
    return;
  }
  const blocking = audit.findings.filter((finding) => ["BLOCK", "HIGH"].includes(finding?.severity));
  if (blocking.length > 0) {
    failures.push(`${label}: ${blocking.length} unresolved BLOCK or HIGH model finding(s)`);
  }
}

function validatePhaseRecord(repoRoot, phase, record, context, failures) {
  const { ticketManifest, evalManifest, authority } = context;
  checkKeys(record, EXPECTED_RECORD_KEYS, record.id, failures);
  const allowedPaths = unionPaths(phase.ticketScopes);
  const allowedEffects = unionEffects(phase.ticketScopes);
  const scalars = {
    recordKind: "owner-solo-phase-exception-v3",
    status: "authorized-with-solo-exception",
    implementationAuthorized: true,
    projectId: "one-box",
    branch: "main",
    baseCommit: BASE_COMMIT,
    activationBaseCommit: BASE_COMMIT,
    parentTicketId: phase.parentTicketId,
    parentTicketStatus: phase.parentTicketStatus,
    authorizationProposalId: phase.authorizationProposalId,
    ownerActorId: "person:devin-wiggins",
    riskOwnerActorId: "person:devin-wiggins",
    implementationActorId: "person:devin-wiggins",
    authorizedByActorId: "person:devin-wiggins",
    ownerAssignmentV1Status: "NOT_AVAILABLE",
    recordedAt: RECORDED_AT,
    expiresAt: EXPIRES_AT,
    renewable: false,
  };
  for (const [field, expected] of Object.entries(scalars)) {
    if (record[field] !== expected) failures.push(`${record.id}: ${field} drift`);
  }
  exact(record.activationWriteSet, ACTIVATION_WRITE_SET, `${record.id}.activationWriteSet`, failures);
  exact(record.preExistingUntrackedBaseline, UNTRACKED_BASELINE, `${record.id}.preExistingUntrackedBaseline`, failures);
  exact(record.childTicketIds, phase.childTicketIds, `${record.id}.childTicketIds`, failures);
  exact(record.builderLane, BUILDER_LANE, `${record.id}.builderLane`, failures);
  exact(record.roleAvailability, phase.roleIds.map(ROLE_ROW), `${record.id}.roleAvailability`, failures);
  exact(record.implementationAuthorizationSeparation, { status: "NOT_AVAILABLE", satisfied: false }, `${record.id}.implementationAuthorizationSeparation`, failures);
  exact(record.escalation, { status: "NOT_AVAILABLE", actorId: null }, `${record.id}.escalation`, failures);
  exact(record.independentHumanReview, { status: "NOT_AVAILABLE", satisfied: false, actorId: null }, `${record.id}.independentHumanReview`, failures);
  exact(record.acceptedRisk, {
    findingId: phase.findingId,
    severity: "MEDIUM",
    status: "ACCEPTED",
    reasonCode: "SOLO_OWNER_SEPARATION_UNAVAILABLE",
  }, `${record.id}.acceptedRisk`, failures);
  exact(record.requirementExceptions, phase.requirementExceptions, `${record.id}.requirementExceptions`, failures);
  exact(record.traceabilityRefs, phase.traceabilityRefs, `${record.id}.traceabilityRefs`, failures);
  exact(record.ticketScopes, phase.ticketScopes, `${record.id}.ticketScopes`, failures);
  exact(record.allowedPaths, allowedPaths, `${record.id}.allowedPaths`, failures);
  exact(record.allowedEffects, allowedEffects, `${record.id}.allowedEffects`, failures);
  exact(record.allowedDataClasses, ALLOWED_DATA_CLASSES, `${record.id}.allowedDataClasses`, failures);
  exact(record.forbiddenEffects, FORBIDDEN_EFFECTS, `${record.id}.forbiddenEffects`, failures);
  exact(record.invalidators, INVALIDATORS, `${record.id}.invalidators`, failures);
  exact(record.reviewProtocol, REVIEW_PROTOCOL, `${record.id}.reviewProtocol`, failures);
  exact(record.requiredEvidencePaths, [phase.securityReceiptPath, phase.grokReceiptPath], `${record.id}.requiredEvidencePaths`, failures);
  exact(record.predecessorBinding, phase.predecessorBinding, `${record.id}.predecessorBinding`, failures);

  if (record.ownerDirection?.actorId !== "person:devin-wiggins"
    || record.ownerDirection?.ownerResponse !== OWNER_RESPONSE
    || record.ownerDirection?.pathScopeDerivation !== PATH_SCOPE_DERIVATION
    || record.ownerDirection?.recordedAt !== RECORDED_AT
    || record.ownerDirection?.decision !== phase.amendmentDecision) {
    failures.push(`${record.id}.ownerDirection: exact owner direction drift`);
  }

  if (!Array.isArray(record.nonWaivableClassesTouched)) {
    failures.push(`${record.id}.nonWaivableClassesTouched: must be an array`);
  } else {
    for (const touched of record.nonWaivableClassesTouched) {
      if (NON_WAIVABLE_CLASSES.includes(touched)) {
        failures.push(`${record.id}.nonWaivableClassesTouched: non-waivable class ${touched} cannot be waived by a solo exception`);
      } else {
        failures.push(`${record.id}.nonWaivableClassesTouched: must be empty`);
      }
    }
  }

  for (const [index, scope] of (Array.isArray(record.ticketScopes) ? record.ticketScopes : []).entries()) {
    checkKeys(scope, ["ticketId", "allowedPaths", "allowedEffects"], `${record.id}.ticketScopes[${index}]`, failures);
    for (const path of scope?.allowedPaths ?? []) {
      checkAuthorizedPath(path, `${record.id}.ticketScopes[${index}].allowedPaths`, failures);
    }
    for (const effect of scope?.allowedEffects ?? []) {
      if (!allowedEffects.includes(effect)) {
        failures.push(`${record.id}.ticketScopes[${index}]: effect ${effect} is outside the record allowedEffects`);
      }
    }
  }
  for (const path of Array.isArray(record.allowedPaths) ? record.allowedPaths : []) {
    checkAuthorizedPath(path, `${record.id}.allowedPaths`, failures);
  }
  for (const effect of Array.isArray(record.allowedEffects) ? record.allowedEffects : []) {
    if (FORBIDDEN_EFFECTS.includes(effect)) {
      failures.push(`${record.id}.allowedEffects: ${effect} is a forbidden effect`);
    }
  }

  exact(record.planBindings?.map((binding) => binding?.path), phase.planPaths, `${record.id}.planBindings.paths`, failures);
  checkBindings(repoRoot, record.planBindings, `${record.id}.planBindings`, failures);
  exact(record.governanceBindings, GOVERNANCE_BINDINGS, `${record.id}.governanceBindings`, failures);
  checkBindings(repoRoot, record.governanceBindings, `${record.id}.governanceBindings`, failures);
  exact(record.dependencyBindings, DEPENDENCY_BINDINGS, `${record.id}.dependencyBindings`, failures);
  checkBindings(repoRoot, record.dependencyBindings, `${record.id}.dependencyBindings`, failures);

  const parentTicket = ticketManifest?.tickets?.find((ticket) => ticket?.id === phase.parentTicketId);
  if (!parentTicket) {
    failures.push(`${record.id}: parent ticket ${phase.parentTicketId} is missing from the program manifest`);
  } else {
    if (parentTicket.status !== record.parentTicketStatus) {
      failures.push(`${record.id}: parentTicketStatus drift; program manifest says ${parentTicket.status}`);
    }
    if (["ready", "in-progress", "verification", "done"].includes(parentTicket.status)) {
      failures.push(`${record.id}: parent ticket ${phase.parentTicketId} cannot be active under a solo exception`);
    }
  }
  for (const evaluationId of phase.evaluationIds) {
    const evaluation = evalManifest?.evaluations?.find((candidate) => candidate?.id === evaluationId);
    if (evaluation?.status !== "planned") {
      failures.push(`${record.id}: parent evaluation ${evaluationId} must remain planned`);
    }
  }

  const recordedAt = Date.parse(record.recordedAt);
  const expiresAt = Date.parse(record.expiresAt);
  if (!Number.isFinite(recordedAt) || !Number.isFinite(expiresAt)
    || expiresAt - recordedAt !== THREE_HUNDRED_THIRTY_SIX_HOURS_MS) {
    failures.push(`${record.id}: expiry must be exactly 336 hours`);
  }
  if (Date.now() > expiresAt) failures.push(`${record.id}: authorization is expired`);

  checkKeys(record.authorizationHash, ["algorithm", "canonicalization", "excludedJsonPointers", "digest"], `${record.id}.authorizationHash`, failures);
  if (record.authorizationHash?.algorithm !== "sha256"
    || record.authorizationHash?.canonicalization !== "canonical-json-v1"
    || JSON.stringify(record.authorizationHash?.excludedJsonPointers) !== JSON.stringify(["/authorizationHash/digest"])) {
    failures.push(`${record.id}.authorizationHash: contract drift`);
  }
  const unhashed = structuredClone(record);
  if (unhashed.authorizationHash && typeof unhashed.authorizationHash === "object") delete unhashed.authorizationHash.digest;
  const actualHash = createHash("sha256").update(canonicalJson(unhashed)).digest("hex");
  if (actualHash !== phase.authorizationSha256 || record.authorizationHash?.digest !== phase.authorizationSha256) {
    failures.push(`${record.id}: authorization self-hash mismatch`);
  }

  validateAmendment(repoRoot, phase, record, failures);
  validateSecurityReceipt(repoRoot, phase, record, authority, failures);
  validateGrokReceipt(repoRoot, phase, record, failures);
}

function validateOwnerAcceptance(repoRoot, authority, failures) {
  const label = "release-1 owner packet acceptance";
  const acceptance = readJson(repoRoot, ACCEPTANCE_PATH, label, failures);
  if (acceptance) {
    if (acceptance.recordKind !== "owner-packet-acceptance-v1") failures.push(`${label}: recordKind drift`);
    if (acceptance.ownerResponse !== OWNER_RESPONSE) failures.push(`${label}: ownerResponse is not the owner's verbatim words`);
    for (const [grant, value] of Object.entries(acceptance.grants ?? {})) {
      if (value !== false) failures.push(`${label}: grant ${grant} must be false`);
    }
    if (Object.keys(acceptance.grants ?? {}).length === 0) failures.push(`${label}: grants must be a non-empty object`);
  }
  for (const domainId of ["release-1", "compatibility"]) {
    const domain = authority?.domains?.[domainId];
    if (domain?.authorityClass !== "owner-approved") {
      failures.push(`${domainId}: release-1 phase authorizations require an owner-approved contract class`);
      continue;
    }
    const acceptanceRecord = domain.acceptanceRecord;
    if (acceptanceRecord?.acceptedBy !== "Devin Wiggins"
      || acceptanceRecord?.identityRef !== "person:devin-wiggins"
      || acceptanceRecord?.role !== "Product owner"
      || typeof acceptanceRecord?.recordedAt !== "string"
      || typeof acceptanceRecord?.evidence !== "string"
      || !acceptanceRecord.evidence.includes(ACCEPTANCE_PATH)) {
      failures.push(`${domainId}.acceptanceRecord: must name the owner and cite ${ACCEPTANCE_PATH}`);
    }
    if (domain.implementationAuthorized !== false) {
      failures.push(`${domainId}: an owner-approved contract still cannot authorize implementation`);
    }
  }
  for (const domainId of ["target-topology", "program-security"]) {
    if (authority?.domains?.[domainId]?.authorityClass !== "proposed") {
      failures.push(`${domainId}: must stay proposed while no OwnerAssignmentV1 record exists`);
    }
  }
}

export function verifyRelease1PhaseAuthorizations({
  repoRoot = ROOT,
  registry,
  ticketManifest,
  evalManifest,
  authority,
} = {}) {
  const failures = [];
  const source = registry ?? readJson(repoRoot, REGISTRY_PATH, "scoped implementation authority", failures);
  const tickets = ticketManifest ?? readJson(repoRoot, TICKET_MANIFEST_PATH, "program ticket manifest", failures);
  const evaluations = evalManifest ?? readJson(repoRoot, EVAL_MANIFEST_PATH, "program evaluation manifest", failures);
  const authorityManifest = authority ?? readJson(repoRoot, AUTHORITY_PATH, "authority manifest", failures);

  const present = (source?.authorizations ?? []).filter((record) => (
    typeof record?.id === "string" && R1_PHASE_AUTHORIZATION_ID_PATTERN.test(record.id)
  ));
  if (present.length === 0) return { failures, verified: [] };

  validateOwnerAcceptance(repoRoot, authorityManifest, failures);
  const verified = [];
  for (const record of present) {
    const phase = PHASES[record.id];
    if (!phase) {
      failures.push(`${record.id}: no release-1 phase contract is recorded for this id`);
      continue;
    }
    validatePhaseRecord(repoRoot, phase, record, {
      ticketManifest: tickets,
      evalManifest: evaluations,
      authority: authorityManifest,
    }, failures);
    verified.push(record.id);
  }
  return { failures, verified };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const { failures, verified } = verifyRelease1PhaseAuthorizations({ repoRoot: ROOT });
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    console.error(`Release 1 phase authorization verification failed with ${failures.length} issue(s).`);
    process.exit(1);
  }
  console.log(`PASS Release 1 phase authorizations: ${verified.length > 0 ? verified.join(", ") : "none recorded"}`);
  process.exit(0);
}
