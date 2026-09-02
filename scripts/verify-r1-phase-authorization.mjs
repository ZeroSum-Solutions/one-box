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

// The exact serialized bytes of authorizations[0..2] at BASE_COMMIT. A canonical
// self-hash cannot see a re-serialization, so the module also pins the raw text
// slice of the three frozen records.
const FROZEN_REGISTRY_RECORDS_SHA256 = "18c6e7ee924270aee622ea71381f2de50e670e003661f572fa1f7a3dcde2ff1a";

const P1_AUTHORIZATION_SHA256 = "60a23140ba8d2afa64a835f3364838be0bcf3bc727095986ffbe2fc7d7f1e6c3";
const P2_AUTHORIZATION_SHA256 = "716906736fe610373c1f8082f4acf1a6c57d52ccb2242b4ba23c712902b5444f";
const P1_AMENDMENT_SHA256 = "cc4fbde44e5c6e37511ba6b13a2b2f4d583ccefff4aa25adeaf94092683915ce";
const P2_AMENDMENT_SHA256 = "bce935bccba80e12e32b255d1c4b3584970e70a153753b991f707f42e87fe47e";

const P1_AMENDMENT_PATH = "docs/governance/risk-exceptions/2026-09-02-release-1-p1-solo.json";
const P2_AMENDMENT_PATH = "docs/governance/risk-exceptions/2026-09-02-release-1-p2-solo.json";
const P1_PACKET_PATH = "docs/plans/2026-09-02-release-1-p1-lifecycle-authorization-design.md";
const P2_PACKET_PATH = "docs/plans/2026-09-02-release-1-p2-canvas-approval-authorization-design.md";
const P1_SECURITY_RECEIPT_PATH = "docs/audits/evidence/security/2026-09-02-release-1-p1-solo-authorization-security-review.json";
const P2_SECURITY_RECEIPT_PATH = "docs/audits/evidence/security/2026-09-02-release-1-p2-solo-authorization-security-review.json";
const P1_GROK_RECEIPT_PATH = "docs/audits/grok-4.6/2026-09-02-release-1-p1-authorization-audit.json";
const P2_GROK_RECEIPT_PATH = "docs/audits/grok-4.6/2026-09-02-release-1-p2-authorization-audit.json";
const rawAuditPath = (receiptPath) => receiptPath.replace(/\.json$/, "-raw.json");

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
  P1_GROK_RECEIPT_PATH,
  rawAuditPath(P1_GROK_RECEIPT_PATH),
  P2_GROK_RECEIPT_PATH,
  rawAuditPath(P2_GROK_RECEIPT_PATH),
];

// The security receipts attest every activation target except the evidence files
// themselves and the authority manifest. A receipt cannot hash a file that hashes
// it back, and the manifest carries the packetDigest field, which is re-pinned
// after the receipts are written, so the receipts bind the manifest through its
// canonical without-packetDigest hash instead.
const RECEIPT_TARGET_PATHS = ACTIVATION_WRITE_SET.filter((path) => (
  path !== AUTHORITY_PATH && !path.startsWith("docs/audits/")
));

const T02_SECURITY_RECEIPT_PATH = "docs/audits/evidence/security/2026-08-31-obx-p180-t02-solo-authorization-security-review.json";

// Exactly the files the Grok 4.6 packet audit reviews. Every entry is committed
// before the audit runs, so the audited diff is reproducible from the delivered
// branch with
//   git diff --no-ext-diff --unified=80 <baseCommit> -- <reviewedFiles>
// at the receipt's recorded auditedHeadCommit. The audit's own output files are
// written after the capture, so they are not in the reviewed set.
const AUDIT_ALLOWLIST = ACTIVATION_WRITE_SET
  .filter((path) => !path.startsWith("docs/audits/grok-4.6/"))
  .sort();

// The audit's live hash bindings cover every reviewed file whose bytes the
// re-pin cannot move. authority-manifest.json is bound through its canonical
// without-packetDigest hash instead, because the packet digest hashes this
// audit's own inputs and can only be written after the audit captures.
const AUDIT_HASHED_PATHS = AUDIT_ALLOWLIST.filter((path) => path !== AUTHORITY_PATH);

// The only two byte changes applied to the tree after the audits capture. Both
// are mechanical re-pin outputs. Nothing else may differ between the audited
// bytes and the delivered bytes, and the receipt has to say so.
const AUDITED_TREE_DELTA = [
  {
    path: AUTHORITY_PATH,
    jsonPointer: "/packetDigest",
    change: "packet digest re-pinned after capture",
    reason: "The packet digest hashes this audit's own inputs, so it can only be written after them. It is a fixed-length hexadecimal field, so the audited diff and the delivered diff have identical byte lengths.",
  },
  {
    path: T02_SECURITY_RECEIPT_PATH,
    jsonPointer: "/targetHashes",
    change: "four OBX-AUTH-P180-T02-SOLO-001 receipt digests refreshed after capture",
    reason: "The sanctioned re-pin path for the frozen T02 receipt. The file sits outside this audit's reviewed set and every other field of it is unchanged.",
  },
];

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

const ACCEPTED_CONTRACT_PATHS = [
  "docs/plans/one-box-master/01-foundation/release-1-contract.md",
  "docs/plans/one-box-master/01-foundation/release-1-compatibility-matrix.md",
];

const EFFECTIVE_EXPIRY_REASON = "This record's invalidator expired-t01-or-t02-record-in-registry fails the whole release-1 phase module once OBX-AUTH-P180-T01-SOLO-001 (2026-09-14T13:33:33Z) or OBX-AUTH-P180-T02-SOLO-001 (2026-09-14T21:47:59Z) expires, and both are non-renewable. The recorded 336-hour window therefore ends early, at 2026-09-14T13:33:33Z, unless the owner first decides a retirement mechanism for the frozen records.";

const AMENDMENT_KEYS = [
  "schemaVersion", "amendmentId", "recordKind", "status", "authorizationId", "projectId",
  "branch", "baseCommit", "activationBaseCommit", "parentTicketId", "childTicketIds",
  "implementationAuthorized", "predecessor", "activationPrecondition", "ownerDirection",
  "standardWaiverEligible", "nonWaivableDefaultPreserved", "nonWaivableClassesTouched",
  "unavailableControls", "requirementExceptions", "acceptedRisk", "scope", "reviewProtocol",
  "requiredEvidencePaths", "compensatingControls", "independentHumanReview", "recordedAt",
  "expiresAt", "effectiveWindow", "renewable",
];
const AMENDMENT_SCOPE_KEYS = [
  "denyUnlistedPathsAndEffects", "allowedPaths", "allowedEffects", "allowedDataClasses",
  "forbiddenEffects",
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
  "predecessor-phase-not-merged",
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
  "predecessorBinding", "activationPrecondition", "planBindings", "governanceBindings",
  "dependencyBindings", "amendmentBinding", "reviewProtocol", "requiredEvidencePaths",
  "invalidators", "recordedAt", "expiresAt", "effectiveWindow", "renewable",
  "authorizationHash",
];

// A phase whose predecessor has not merged still carries the owner's grant, but
// its tasks may not start. The precondition is recorded in the record and in the
// amendment, and the module refuses any other wording.
const P2_ACTIVATION_PRECONDITION = {
  predecessorAuthorizationId: "OBX-AUTH-R1-P1-SOLO-001",
  predecessorPhase: "P1",
  requirement: "No OBX-P210 child ticket may start until the OBX-AUTH-R1-P1-SOLO-001 phase merges to main and this record's predecessorBinding carries that merge commit together with the live digest of every declared P1 file.",
  enforcedBy: [
    "scripts/verify-r1-phase-authorization.mjs validatePredecessorGate",
    "invalidator predecessor-phase-not-merged",
  ],
};

const PHASES = {
  "OBX-AUTH-R1-P1-SOLO-001": {
    phase: "P1",
    implementationAuthorized: true,
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
    activationPrecondition: null,
  },
  "OBX-AUTH-R1-P2-SOLO-001": {
    phase: "P2",
    implementationAuthorized: true,
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
      expectedAbsentFiles: [
        "src/lib/releaseLifecycle.ts",
        "src/lib/releaseLifecycle.test.ts",
        "src/lib/releaseLifecycleStore.ts",
        "src/lib/releaseLifecycleStore.test.ts",
        "src/app/api/lifecycle/[id]/route.ts",
        "src/app/api/lifecycle/[id]/route.test.ts",
        "src/components/preview/LifecycleStatus.tsx",
        "src/components/preview/LifecycleStatus.test.tsx",
      ],
    },
    activationPrecondition: P2_ACTIVATION_PRECONDITION,
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
 * An authorized path names one file. Globs, traversal, absolute paths, and any
 * directory - broad or narrow, with or without a trailing slash - are refused.
 * The last segment must carry a file extension, so a bare directory such as
 * "src/lib" or "docs/plans" can never stand in for a file list. A bracketed
 * segment is allowed only as a whole Next.js dynamic segment, which is how the
 * App Router spells a single concrete route file.
 */
function checkAuthorizedPath(path, label, failures) {
  const dynamicSegment = /^\[[A-Za-z0-9_]+\]$/;
  const fileSegment = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.[A-Za-z0-9]+$/;
  const segments = typeof path === "string" ? path.split("/") : [];
  if (
    typeof path !== "string"
    || path.length === 0
    || path.startsWith("/")
    || path.endsWith("/")
    || normalize(path) !== path
    || normalize(path).startsWith("..")
    || /[*?{}]/.test(path)
    || segments.length < 2
    || !fileSegment.test(segments[segments.length - 1])
    || segments.slice(0, -1).some((segment) => (
      segment.length === 0
      || segment === "."
      || segment === ".."
      || (/[[\]]/.test(segment) && !dynamicSegment.test(segment))
    ))
  ) {
    failures.push(`${label}: authorized path must be explicit and repository-relative`);
    return false;
  }
  return true;
}

/**
 * Every phase record carries the owner's grant, so implementationAuthorized is
 * always true. What the predecessor binding decides is when the phase's tasks
 * may start. A phase with no predecessor starts on merge. A phase whose
 * predecessor is still PENDING_PREDECESSOR_MERGE must name its activation
 * precondition, declare the predecessor's exact file list, and keep its own
 * effects disjoint from the predecessor's live grant; the binding turns
 * COMPLETED_VERIFIED only when that merge commit and every live file digest are
 * recorded. The predecessor's own authorization record must be present and live
 * in the registry either way.
 */
function validatePredecessorGate(repoRoot, phase, record, registry, ticketManifest, failures) {
  const label = `${record.id}.predecessorBinding`;
  const binding = record.predecessorBinding;
  if (record.implementationAuthorized !== true) {
    failures.push(`${record.id}: a recorded phase authorization must authorize implementation`);
  }
  if (binding === null || binding === undefined) {
    if (record.activationPrecondition !== null) {
      failures.push(`${record.id}.activationPrecondition: a phase with no predecessor must record null`);
    }
    return;
  }
  if (binding.status === "PENDING_PREDECESSOR_MERGE") {
    exact(record.activationPrecondition, phase.activationPrecondition, `${record.id}.activationPrecondition`, failures);
    if (binding.checkpointCommit !== null) {
      failures.push(`${label}: a pending predecessor cannot name a checkpoint commit`);
    }
    if (!Array.isArray(binding.files) || binding.files.length === 0
      || binding.files.some((file) => typeof file !== "string")) {
      failures.push(`${label}: a pending predecessor must declare its file list as repository-relative paths`);
    }
    for (const path of Array.isArray(binding.files) ? binding.files : []) {
      checkAuthorizedPath(path, `${label}.files`, failures);
    }
    const predecessor = (registry?.authorizations ?? []).find((candidate) => candidate?.id === binding.authorizationId);
    if (!predecessor) {
      failures.push(`${label}: predecessor authorization ${binding.authorizationId} is missing from the registry`);
      return;
    }
    const predecessorExpiry = Date.parse(predecessor.expiresAt);
    if (!Number.isFinite(predecessorExpiry) || Date.now() > predecessorExpiry) {
      failures.push(`${label}: predecessor authorization ${binding.authorizationId} is expired`);
    }
    if (predecessor.parentTicketId !== binding.ticketId) {
      failures.push(`${label}: predecessor authorization ${binding.authorizationId} does not own ticket ${binding.ticketId}`);
    }
    exact(predecessor.allowedPaths, binding.files, `${label}.files against ${binding.authorizationId}.allowedPaths`, failures);
    // The two records share files, so the effect lists are what keep pending work
    // from riding the predecessor's live grant. They must stay disjoint.
    const shared = (record.allowedEffects ?? []).filter((effect) => (predecessor.allowedEffects ?? []).includes(effect));
    if (shared.length > 0) {
      failures.push(`${label}: pending effects ${shared.join(", ")} also sit inside the live ${binding.authorizationId} grant`);
    }
    // "Pending" is a claim about the tree, so the module checks it. Every
    // predecessor file the predecessor phase still has to create must be absent,
    // and no child ticket of this phase may exist in the program manifest yet.
    // Either one appearing means the predecessor landed and the binding is stale.
    const absentFiles = binding.expectedAbsentFiles;
    if (!Array.isArray(absentFiles) || absentFiles.length === 0
      || absentFiles.some((file) => typeof file !== "string")) {
      failures.push(`${label}.expectedAbsentFiles: a pending predecessor must list the declared files it has not created yet`);
    } else {
      for (const path of absentFiles) {
        if (!(binding.files ?? []).includes(path)) {
          failures.push(`${label}.expectedAbsentFiles: ${path} is not a declared predecessor file`);
          continue;
        }
        if (existsSync(resolve(repoRoot, path))) {
          failures.push(`${label}: predecessor-phase-not-merged is stale; ${path} exists, so the binding must record the predecessor merge commit and the live digest of every declared file`);
        }
      }
    }
    for (const ticket of ticketManifest?.tickets ?? []) {
      if (typeof ticket?.id === "string" && ticket.id.startsWith(`${record.parentTicketId}-`)) {
        failures.push(`${label}: predecessor-phase-not-merged; child ticket ${ticket.id} cannot exist in the program manifest while ${binding.authorizationId} is unmerged`);
      }
    }
    return;
  }
  if (binding.status === "COMPLETED_VERIFIED") {
    if (record.activationPrecondition !== null) {
      failures.push(`${record.id}.activationPrecondition: a merged predecessor clears the activation precondition`);
    }
    if (!/^[a-f0-9]{40}$/.test(binding.checkpointCommit ?? "")) {
      failures.push(`${label}: a verified predecessor must name a 40-character checkpoint commit`);
    }
    if (binding.expectedAbsentFiles !== undefined && binding.expectedAbsentFiles !== null) {
      failures.push(`${label}.expectedAbsentFiles: a merged predecessor has no absent file left to declare`);
    }
    const predecessor = (registry?.authorizations ?? []).find((candidate) => candidate?.id === binding.authorizationId);
    if (!predecessor) {
      failures.push(`${label}: predecessor authorization ${binding.authorizationId} is missing from the registry`);
    } else {
      exact(binding.files?.map((file) => file?.path), predecessor.allowedPaths, `${label}.files against ${binding.authorizationId}.allowedPaths`, failures);
    }
    checkBindings(repoRoot, binding.files, `${label}.files`, failures);
    return;
  }
  failures.push(`${label}: unknown predecessor status ${binding.status}`);
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
  // The amendment is the owner instrument. An unlisted key here could read as a
  // grant to a human even though the registry record is the only code authority,
  // so the shape is allowlisted rather than merely spot-checked.
  checkKeys(amendment, AMENDMENT_KEYS, label, failures);
  checkKeys(amendment.scope, AMENDMENT_SCOPE_KEYS, `${label}.scope`, failures);
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
  if (amendment.implementationAuthorized !== record.implementationAuthorized) {
    failures.push(`${label}: implementationAuthorized drift against the registry record`);
  }
  exact(amendment.predecessor, record.predecessorBinding === null ? null : {
    ticketId: record.predecessorBinding?.ticketId,
    authorizationId: record.predecessorBinding?.authorizationId,
    status: record.predecessorBinding?.status,
    checkpointCommit: record.predecessorBinding?.checkpointCommit,
  }, `${label}.predecessor`, failures);
  exact(amendment.activationPrecondition, record.activationPrecondition, `${label}.activationPrecondition`, failures);
  exact(amendment.effectiveWindow, record.effectiveWindow, `${label}.effectiveWindow`, failures);
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

/**
 * The authority manifest changes exactly once after a receipt is written: the
 * packet digest is re-pinned, because that digest hashes the receipt's own
 * inputs. A receipt therefore binds the manifest through its canonical
 * without-packetDigest hash, which the re-pin cannot move, instead of a raw file
 * hash that would be stale the moment the digest lands.
 */
function checkManifestWithoutPacketDigest(binding, authority, label, failures) {
  const field = `${label}.authorityManifestWithoutPacketDigest`;
  if (binding?.path !== AUTHORITY_PATH
    || binding?.algorithm !== "sha256"
    || binding?.canonicalization !== "canonical-json-v1"
    || JSON.stringify(binding?.excludedJsonPointers) !== JSON.stringify(["/packetDigest"])
    || !/^[a-f0-9]{64}$/.test(binding?.digest ?? "")) {
    failures.push(`${field}: binding contract drift`);
    return;
  }
  if (!authority) return;
  const withoutDigest = structuredClone(authority);
  delete withoutDigest.packetDigest;
  if (createHash("sha256").update(canonicalJson(withoutDigest)).digest("hex") !== binding.digest) {
    failures.push(`${field}: current hash drift ${AUTHORITY_PATH}`);
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
  checkManifestWithoutPacketDigest(receipt.authorityManifestWithoutPacketDigest, authority, label, failures);
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

const BLOCKING_SEVERITIES = new Set(["BLOCK", "CRITICAL", "HIGH", "IMPORTANT", "MAJOR", "SEV0", "SEV1"]);
const NON_BLOCKING_SEVERITIES = new Set(["MEDIUM", "LOW", "INFO", "NIT", "MINOR"]);

/**
 * The wrapper receipt has to be a faithful derivation of the harness output it
 * cites, not a hand-written summary of it. Every field the harness already
 * recorded - capture time, audited head, requested and provider-reported model,
 * effort, reviewed file list, diff size, verdict, findings, residual risks,
 * proof assessment - must match the raw file byte for byte, and the audited base
 * must be the record's own base commit. That makes the audited slice
 * reproducible: check out auditedHeadCommit and diff reviewedFiles against
 * baseCommit.
 */
function validateRawAuditAgreement(repoRoot, receipt, label, failures) {
  const raw = readJson(repoRoot, receipt.rawAuditPath, `${label}.rawAudit`, failures);
  if (!raw) return;
  const request = raw.request ?? {};
  const pairs = [
    ["capturedAt", receipt.capturedAt, raw.capturedAt],
    ["auditedHeadCommit", receipt.auditedHeadCommit, request.head],
    ["baseCommit", receipt.baseCommit, request.base],
    ["requestedModel", receipt.requestedModel, request.model],
    ["effort", receipt.effort, request.effort],
    ["diffBytes", receipt.diffBytes, request.diffBytes],
    ["providerReportedModel", receipt.providerReportedModel, raw.provider?.model ?? null],
    ["verdict", receipt.verdict, raw.audit?.verdict],
    ["proofAssessment", receipt.proofAssessment, raw.audit?.proof_assessment],
  ];
  for (const [field, wrapped, actual] of pairs) {
    if (wrapped !== actual) failures.push(`${label}: ${field} does not match the raw audit it wraps`);
  }
  exact(receipt.reviewedFiles, request.files, `${label}.reviewedFiles against the raw audit`, failures);
  exact(receipt.findings, raw.audit?.findings, `${label}.findings against the raw audit`, failures);
  exact(receipt.residualRisks, raw.audit?.residual_risks, `${label}.residualRisks against the raw audit`, failures);
  if (!Number.isInteger(receipt.diffBytes) || receipt.diffBytes <= 0) {
    failures.push(`${label}: diffBytes must be the positive byte length of the audited diff`);
  }
}

/**
 * The model receipt wraps the scripts/eval/grok-audit.mjs output. It is checked
 * for the exact model labels, the effort, and - the point of the wrapper - live
 * hash bindings to the authorization record, the amendment, the raw audit file,
 * and every governance file the audit reviewed. A stale or reused audit fails.
 */
function validateGrokReceipt(repoRoot, phase, record, authority, failures) {
  const label = `${record.id}.modelReceipt`;
  const receipt = readJson(repoRoot, phase.grokReceiptPath, label, failures);
  if (!receipt) return;
  const modelReceiptKeys = [
    "schemaVersion", "receiptKind", "authorizationId", "authorizationHash", "amendmentId",
    "amendmentHash", "baseCommit", "auditedHeadCommit", "requestedModel", "providerReportedModel",
    "effort", "lane", "auditScript", "rawAuditPath", "rawAuditSha256", "diffBytes",
    "reviewedFiles", "targetHashes", "authorityManifestWithoutPacketDigest", "auditedTreeDelta",
    "verdict", "findings", "residualRisks", "proofAssessment", "capturedAt",
  ];
  checkKeys(
    receipt,
    "ownerAuthorizedFallback" in receipt ? [...modelReceiptKeys, "ownerAuthorizedFallback"] : modelReceiptKeys,
    label,
    failures,
  );
  const scalars = {
    schemaVersion: 1,
    receiptKind: "solo-phase-model-audit-v3",
    authorizationId: record.id,
    authorizationHash: phase.authorizationSha256,
    amendmentId: phase.amendmentId,
    amendmentHash: phase.amendmentSha256,
    baseCommit: BASE_COMMIT,
    effort: REVIEW_PROTOCOL.effort,
    lane: REVIEW_PROTOCOL.lane,
    auditScript: REVIEW_PROTOCOL.auditScript,
  };
  for (const [field, expected] of Object.entries(scalars)) {
    if (receipt[field] !== expected) failures.push(`${label}: ${field} drift`);
  }
  if (receipt.requestedModel !== REVIEW_PROTOCOL.exactModel
    || receipt.providerReportedModel !== REVIEW_PROTOCOL.exactModel) {
    const fallback = receipt.ownerAuthorizedFallback;
    if (!fallback || typeof fallback !== "object"
      || typeof fallback.ownerAuthorizationRef !== "string" || fallback.ownerAuthorizationRef.length === 0
      || typeof fallback.actualModel !== "string" || fallback.actualModel.length === 0
      || typeof fallback.primaryAttempt !== "object" || fallback.primaryAttempt === null
      || fallback.primaryAttempt.requestedModel !== REVIEW_PROTOCOL.exactModel
      || typeof fallback.primaryAttempt.failure !== "string" || fallback.primaryAttempt.failure.length === 0) {
      failures.push(`${label}: exact model ${REVIEW_PROTOCOL.exactModel} required, or a labelled owner-authorized fallback block that retains the failed attempt and names the actual model`);
    }
  }
  exact(receipt.reviewedFiles, AUDIT_ALLOWLIST, `${label}.reviewedFiles`, failures);
  exact(receipt.targetHashes?.map((binding) => binding?.path), AUDIT_HASHED_PATHS, `${label}.targetHashes.paths`, failures);
  checkBindings(repoRoot, receipt.targetHashes, `${label}.targetHashes`, failures);
  checkManifestWithoutPacketDigest(receipt.authorityManifestWithoutPacketDigest, authority, label, failures);
  exact(receipt.auditedTreeDelta, AUDITED_TREE_DELTA, `${label}.auditedTreeDelta`, failures);
  if (!/^[a-f0-9]{40}$/.test(receipt.auditedHeadCommit ?? "")) {
    failures.push(`${label}: auditedHeadCommit must be the 40-character commit the audit read`);
  }
  if (receipt.rawAuditPath !== rawAuditPath(phase.grokReceiptPath)) {
    failures.push(`${label}: rawAuditPath drift`);
  } else if (sha256File(repoRoot, receipt.rawAuditPath, `${label}.rawAudit`, failures) !== receipt.rawAuditSha256) {
    failures.push(`${label}: raw audit hash drift ${receipt.rawAuditPath}`);
  }
  validateRawAuditAgreement(repoRoot, receipt, label, failures);
  if (!["CLEAN", "FINDINGS"].includes(receipt.verdict) || !Array.isArray(receipt.findings)) {
    failures.push(`${label}: audit verdict schema drift`);
    return;
  }
  for (const [index, finding] of receipt.findings.entries()) {
    const severity = typeof finding?.severity === "string" ? finding.severity.toUpperCase() : null;
    if (severity === null || (!BLOCKING_SEVERITIES.has(severity) && !NON_BLOCKING_SEVERITIES.has(severity))) {
      failures.push(`${label}.findings[${index}]: unknown severity is treated as blocking`);
      continue;
    }
    if (BLOCKING_SEVERITIES.has(severity)) {
      failures.push(`${label}.findings[${index}]: unresolved ${severity} model finding`);
    }
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
    implementationAuthorized: phase.implementationAuthorized,
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
  validatePredecessorGate(repoRoot, phase, record, context.registry, ticketManifest, failures);

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
  // The constants above are a copy, so the copy is also compared to the live
  // frozen record. A phase record and the module cannot drift together.
  const frozenT02 = (context.registry?.authorizations ?? []).find((candidate) => candidate?.id === "OBX-AUTH-P180-T02-SOLO-001");
  exact(record.governanceBindings, frozenT02?.governanceBindings, `${record.id}.governanceBindings against OBX-AUTH-P180-T02-SOLO-001`, failures);
  exact(record.dependencyBindings, frozenT02?.dependencyBindings, `${record.id}.dependencyBindings against OBX-AUTH-P180-T02-SOLO-001`, failures);

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

  validateEffectiveWindow(record, context.registry, failures);
  validateAmendment(repoRoot, phase, record, failures);
  validateSecurityReceipt(repoRoot, phase, record, authority, failures);
  validateGrokReceipt(repoRoot, phase, record, authority, failures);
}

/**
 * The recorded window is 336 hours, but the module refuses the whole record once
 * OBX-AUTH-P180-T01-SOLO-001 or OBX-AUTH-P180-T02-SOLO-001 expires, and both are
 * non-renewable. The record has to state that earlier effective end date and name
 * the frozen record that sets it, so a non-renewable grant never advertises a
 * window the verifier will not honour.
 */
function validateEffectiveWindow(record, registry, failures) {
  const label = `${record.id}.effectiveWindow`;
  const frozen = ["OBX-AUTH-P180-T01-SOLO-001", "OBX-AUTH-P180-T02-SOLO-001"]
    .map((id) => (registry?.authorizations ?? []).find((candidate) => candidate?.id === id))
    .filter((candidate) => candidate && Number.isFinite(Date.parse(candidate.expiresAt)));
  if (frozen.length !== 2) {
    failures.push(`${label}: both frozen registry records must carry a parsable expiry before an effective window can be checked`);
    return;
  }
  const earliest = frozen.reduce((soonest, candidate) => (
    Date.parse(candidate.expiresAt) < Date.parse(soonest.expiresAt) ? candidate : soonest
  ));
  const window = record.effectiveWindow;
  checkKeys(window, [
    "recordedAt", "expiresAt", "effectiveExpiresAt", "effectiveExpirySource", "effectiveExpiryReason",
  ], label, failures);
  if (window?.recordedAt !== record.recordedAt || window?.expiresAt !== record.expiresAt) {
    failures.push(`${label}: recorded window drift against the record`);
  }
  if (window?.effectiveExpirySource !== earliest.id) {
    failures.push(`${label}: effectiveExpirySource must name ${earliest.id}`);
  }
  const effective = Date.parse(window?.effectiveExpiresAt);
  if (!Number.isFinite(effective) || effective !== Date.parse(earliest.expiresAt)) {
    failures.push(`${label}: effectiveExpiresAt must equal the earliest frozen registry expiry ${earliest.expiresAt}`);
  } else if (effective > Date.parse(record.expiresAt)) {
    failures.push(`${label}: effectiveExpiresAt cannot outlast the recorded expiry`);
  }
  if (window?.effectiveExpiryReason !== EFFECTIVE_EXPIRY_REASON) {
    failures.push(`${label}: effectiveExpiryReason must state why the window closes early`);
  }
}

function validateOwnerAcceptance(repoRoot, authority, ticketManifest, failures) {
  const label = "release-1 owner packet acceptance";
  const acceptance = readJson(repoRoot, ACCEPTANCE_PATH, label, failures);
  if (acceptance) {
    if (acceptance.recordKind !== "owner-packet-acceptance-v1") failures.push(`${label}: recordKind drift`);
    exact(acceptance.acceptedPaths?.map((binding) => binding?.path), ACCEPTED_CONTRACT_PATHS, `${label}.acceptedPaths`, failures);
    checkBindings(repoRoot, acceptance.acceptedPaths, `${label}.acceptedPaths`, failures);
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
  // The scoped registry is the only surface that may authorize code. A phase
  // record cannot stand beside a planning packet or a ticket backlog that has
  // granted implementation on its own.
  if (authority?.implementationAuthorized !== false) {
    failures.push("authority manifest: release-1 phase authorizations require implementationAuthorized false at the top level");
  }
  for (const [domainId, domain] of Object.entries(authority?.domains ?? {})) {
    if (domain?.implementationAuthorized !== false) {
      failures.push(`${domainId}: release-1 phase authorizations require implementationAuthorized false on every domain`);
    }
  }
  if (ticketManifest?.implementationAuthorized !== false) {
    failures.push("program ticket manifest: release-1 phase authorizations require implementationAuthorized false");
  }
}

/**
 * The phase records name "expired-t01-or-t02-record-in-registry" as an
 * invalidator, so the frozen grants they sit beside must still be live.
 */
function validatePredecessorRegistryRecords(registry, failures) {
  for (const id of ["OBX-AUTH-P180-T01-SOLO-001", "OBX-AUTH-P180-T02-SOLO-001"]) {
    const record = (registry?.authorizations ?? []).find((candidate) => candidate?.id === id);
    if (!record) {
      failures.push(`release-1 phase authorizations: frozen record ${id} is missing from the registry`);
      continue;
    }
    if (record.renewable !== false) {
      failures.push(`release-1 phase authorizations: frozen record ${id} must stay non-renewable`);
    }
    const expiresAt = Date.parse(record.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      failures.push(`release-1 phase authorizations: frozen record ${id} has an invalid expiresAt`);
    } else if (Date.now() > expiresAt) {
      failures.push(`release-1 phase authorizations: frozen record ${id} in the registry is expired`);
    }
  }
}

/**
 * The exact text of the first three authorization records. A canonical JSON hash
 * is blind to re-serialization, so a rewrite of the registry file can reformat
 * OBX-AUTH-ATF-001, OBX-AUTH-P180-T01-SOLO-001, or OBX-AUTH-P180-T02-SOLO-001
 * while every existing pin stays green. This scanner slices the first three
 * elements of the authorizations array out of the raw file, string-aware so a
 * brace inside a value cannot move the boundary, and the caller pins the slice.
 */
function frozenRegistrySlice(text) {
  const key = '"authorizations"';
  const keyIndex = text.indexOf(key);
  if (keyIndex < 0) return null;
  const arrayStart = text.indexOf("[", keyIndex + key.length);
  if (arrayStart < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = null;
  let closed = 0;
  for (let index = arrayStart + 1; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "{") {
      if (depth === 0 && start === null) start = index;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        closed += 1;
        if (closed === 3) return text.slice(start, index + 1);
      }
      continue;
    }
    if (char === "]" && depth === 0) return null;
  }
  return null;
}

function validateFrozenRegistryBytes(repoRoot, failures) {
  const label = "release-1 phase authorizations: frozen registry records";
  const absolute = safeFile(repoRoot, REGISTRY_PATH, label, failures);
  if (!absolute) return;
  const slice = frozenRegistrySlice(readFileSync(absolute, "utf8"));
  if (slice === null) {
    failures.push(`${label}: cannot read the first three records as text`);
    return;
  }
  if (createHash("sha256").update(slice, "utf8").digest("hex") !== FROZEN_REGISTRY_RECORDS_SHA256) {
    failures.push(`${label}: the first three records are no longer byte-identical to ${BASE_COMMIT}`);
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
  // Absence is not success. Once a phase record is recorded, its removal has to
  // fail this module rather than quietly restore an unverified registry.
  for (const id of Object.keys(PHASES)) {
    if (!present.some((record) => record?.id === id)) {
      failures.push(`release-1 phase authorizations: recorded phase authorization ${id} is missing from the registry`);
    }
  }

  validateFrozenRegistryBytes(repoRoot, failures);
  validateOwnerAcceptance(repoRoot, authorityManifest, tickets, failures);
  validatePredecessorRegistryRecords(source, failures);
  const verified = [];
  for (const record of present) {
    const phase = PHASES[record.id];
    if (!phase) {
      failures.push(`${record.id}: no release-1 phase contract is recorded for this id`);
      continue;
    }
    validatePhaseRecord(repoRoot, phase, record, {
      registry: source,
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
