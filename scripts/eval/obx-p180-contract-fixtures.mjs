#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ACCEPTED = Object.freeze({ accepted: true, reasonCode: "ACCEPTED" });
const metrics = { providerCallsMade: 0 };

function accepted(reasonCode) {
  return { accepted: true, reasonCode };
}

function rejected(reasonCode) {
  return { accepted: false, reasonCode };
}

function exactKeys(value, allowed, label) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  const unknown = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !actual.includes(key));
  if (unknown.length > 0) {
    throw new Error(`unknown ${label} field: ${unknown.join(",")}`);
  }
  if (missing.length > 0) {
    throw new Error(`missing ${label} field: ${missing.join(",")}`);
  }
}

function evaluateRoute(input) {
  if (input.providerConnected !== false || input.fundingClass !== "synthetic") {
    return rejected("PROVIDER_OFFLINE_BOUNDARY");
  }
  if (typeof input.exactModelIdentity !== "string" || input.exactModelIdentity === "") {
    return rejected("MODEL_IDENTITY_REQUIRED");
  }
  if (input.automaticFallback !== false) {
    return rejected("AUTO_FALLBACK_FORBIDDEN");
  }
  if (input.routeMutatedAfterValidation !== false) {
    return rejected("ROUTE_IMMUTABILITY_VIOLATION");
  }
  return ACCEPTED;
}

function evaluateBudget(input) {
  if (!Number.isSafeInteger(input.requiredUnits) || input.requiredUnits < 0) {
    return rejected("BUDGET_AMOUNT_INVALID");
  }
  if (input.allOwnersCurrent !== true) {
    return rejected("BUDGET_OWNER_UNAVAILABLE");
  }
  if (input.priceKnown !== true) {
    return rejected("PRICE_UNKNOWN");
  }
  const requiredScopes = ["agency", "project", "assignment", "segment"];
  const balances = input.remainingUnitsByScope;
  if (balances === null || typeof balances !== "object" || Array.isArray(balances)) {
    return rejected("BUDGET_SCOPE_INVALID");
  }
  if (
    Object.keys(balances).length !== requiredScopes.length ||
    requiredScopes.some(
      (scope) => !Number.isSafeInteger(balances[scope]) || balances[scope] < 0,
    )
  ) {
    return rejected("BUDGET_SCOPE_INVALID");
  }
  if (requiredScopes.some((scope) => balances[scope] < input.requiredUnits)) {
    return rejected("BUDGET_RESERVE_INSUFFICIENT");
  }
  return ACCEPTED;
}

function evaluateCapacity(input) {
  if (input.snapshotFresh !== true) {
    return rejected("CAPACITY_SNAPSHOT_STALE");
  }
  if (input.compliantRegion !== true) {
    return rejected("CAPACITY_REGION_NONCOMPLIANT");
  }
  if (input.routeFieldsUnchanged !== true) {
    return rejected("CAPACITY_ROUTE_MUTATION");
  }
  if (input.capacityAvailable !== true) {
    return rejected("CAPACITY_UNAVAILABLE");
  }
  return ACCEPTED;
}

function evaluateCompare(input) {
  if (input.armCount !== 2) {
    return rejected("COMPARE_ARM_COUNT");
  }
  if (input.aggregateWorstCaseReserved !== true) {
    return rejected("COMPARE_AGGREGATE_RESERVE_REQUIRED");
  }
  const sharedFields = [
    "sharedTaskHash",
    "sharedContextHash",
    "sharedSkillSetHash",
    "sharedToolGrantHash",
    "sharedOutputContractHash",
  ];
  if (sharedFields.some((field) => input[field] !== true)) {
    return rejected("COMPARE_FAIRNESS_MISMATCH");
  }
  if (input.automaticWinnerApply !== false) {
    return rejected("COMPARE_AUTO_APPLY_FORBIDDEN");
  }
  return ACCEPTED;
}

function evaluateContextAuthority(input) {
  const mapping = Object.freeze({
    "accepted-policy": "policy",
    "actor-task": "human-task",
    "human-decision": "human-decision",
    "skill-instruction": "skill-instruction",
    "project-artifact": "untrusted-data",
    evidence: "untrusted-data",
    "prior-receipt": "untrusted-data",
    "prior-output": "untrusted-data",
  });
  if (
    !Object.hasOwn(mapping, input.sourceKind) ||
    mapping[input.sourceKind] !== input.authorityClass
  ) {
    return rejected("CONTEXT_AUTHORITY_MISMATCH");
  }
  return ACCEPTED;
}

function evaluateInterrupt(input) {
  if (input.issuer !== "one-box-control-plane") {
    return rejected("INTERRUPT_ISSUER_INVALID");
  }
  if (input.segmentState !== "interrupted") {
    return rejected("INTERRUPT_STATE_INVALID");
  }
  if (!["accept-proposal", "reject", "cancel"].includes(input.decision)) {
    return rejected("INTERRUPT_DECISION_INVALID");
  }
  if (input.singleAssignmentWon !== true) {
    return rejected("INTERRUPT_DECISION_CONFLICT");
  }
  if (input.attemptCompleted !== true || input.liveHandleExists !== false) {
    return rejected("INTERRUPT_ATTEMPT_NOT_SETTLED");
  }
  if (input.decision === "reject" || input.decision === "cancel") {
    return accepted("ACCEPTED_TERMINAL_CANCEL");
  }
  if (input.boundHashesMatch !== true) {
    return rejected("INTERRUPT_BINDING_STALE");
  }
  if (input.liveGatesCurrent !== true) {
    return rejected("INTERRUPT_LIVE_GATE_EXPIRED");
  }
  if (input.capabilitiesChanged !== false) {
    return rejected("INTERRUPT_CAPABILITY_EXPANSION");
  }
  return ACCEPTED;
}

function evaluateProposal(input) {
  if (input.terminalState !== "completed") {
    return rejected("PROPOSAL_SEGMENT_NOT_COMPLETED");
  }
  if (input.effectClass !== "propose") {
    return rejected("PROPOSAL_EFFECT_CLASS_INVALID");
  }
  if (input.compareEvidenceOnly !== false) {
    return rejected("COMPARE_ARM_APPLY_FORBIDDEN");
  }
  if (input.requestedAction !== "consider-for-guarded-apply") {
    return rejected("PAGE_IR_APPLY_FORBIDDEN");
  }
  if (input.proposalHashMatches !== true || input.manifestHashesMatch !== true) {
    return rejected("PROPOSAL_BINDING_MISMATCH");
  }
  if (input.foundationReceiptMatches !== true) {
    return rejected("PROPOSAL_FOUNDATION_RECEIPT_MISMATCH");
  }
  if (input.targetStateFresh !== true) {
    return rejected("PROPOSAL_TARGET_STALE");
  }
  if (input.authorityOutcome !== "non-authorizing-proposal") {
    return rejected("PROPOSAL_AUTHORITY_FORBIDDEN");
  }
  return accepted("ACCEPTED_NON_AUTHORIZING_PROPOSAL");
}

function evaluateRetry(input) {
  if (input.attemptIndex !== 1 || input.sameRoute !== true) {
    return rejected("RETRY_ROUTE_OR_INDEX_INVALID");
  }
  if (!new Set(["transient-transport", "rate-limit"]).has(input.failureClass)) {
    return rejected("RETRY_FAILURE_NOT_TRANSIENT");
  }
  if (input.billingKnown !== true) {
    return rejected("RETRY_BILLING_AMBIGUOUS");
  }
  if (input.usableOutputExists !== false) {
    return rejected("RETRY_OUTPUT_ALREADY_EXISTS");
  }
  if (input.reservationCoversRetry !== true) {
    return rejected("RETRY_NOT_RESERVED");
  }
  return ACCEPTED;
}

function evaluateSlashInvocation(input) {
  if (input.explicitCommandControl !== true) {
    return rejected("SLASH_EXPLICIT_CONTROL_REQUIRED");
  }
  if (input.fullPayloadSingleLine !== true) {
    return rejected("SLASH_PAYLOAD_GRAMMAR_INVALID");
  }
  if (input.commandEnabled !== true || input.skillEnabled !== true) {
    return rejected("SLASH_ADMISSION_DISABLED");
  }
  if (input.schemaValid !== true) {
    return rejected("SLASH_INPUT_SCHEMA_INVALID");
  }
  return ACCEPTED;
}

function evaluatePermissionIntersection(input) {
  const capabilityTokens = new Set([
    "read",
    "propose",
    "mutate",
    "external-effect",
    "credential",
    "authority",
  ]);
  const fields = [
    input.authorizedCapabilities,
    input.requestedCapabilities,
    input.effectiveCapabilities,
  ];
  if (
    fields.some(
      (items) =>
        !Array.isArray(items) ||
        new Set(items).size !== items.length ||
        items.some((item) => !capabilityTokens.has(item)),
    )
  ) {
    return rejected("PERMISSION_LIST_INVALID");
  }
  const authorized = new Set(input.authorizedCapabilities);
  const requested = new Set(input.requestedCapabilities);
  const expected = [...authorized].filter((item) => requested.has(item)).sort();
  const effective = [...input.effectiveCapabilities].sort();
  if (JSON.stringify(effective) !== JSON.stringify(expected)) {
    return rejected("PERMISSION_INTERSECTION_MISMATCH");
  }
  return ACCEPTED;
}

function evaluateOutputConformance(input) {
  if (input.schemaValid !== true) {
    return rejected("OUTPUT_SCHEMA_INVALID");
  }
  if (input.sizeWithinCap !== true) {
    return rejected("OUTPUT_SIZE_EXCEEDED");
  }
  if (input.dataClassAllowed !== true) {
    return rejected("OUTPUT_DATA_CLASS_FORBIDDEN");
  }
  if (input.canaryDetected !== false) {
    return rejected("OUTPUT_CANARY_DETECTED");
  }
  return ACCEPTED;
}

function evaluateProviderIdentity(input) {
  const identities = [
    input.requestedProvider,
    input.reportedProvider,
    input.requestedModel,
    input.reportedModel,
    input.requestedEffort,
    input.reportedEffort,
  ];
  if (identities.some((value) => typeof value !== "string" || value === "")) {
    return rejected("PROVIDER_IDENTITY_REQUIRED");
  }
  if (input.requestedProvider !== input.reportedProvider) {
    return rejected("PROVIDER_IDENTITY_MISMATCH");
  }
  if (input.requestedModel !== input.reportedModel) {
    return rejected("MODEL_IDENTITY_MISMATCH");
  }
  if (input.requestedEffort !== input.reportedEffort) {
    return rejected("EFFORT_IDENTITY_MISMATCH");
  }
  return ACCEPTED;
}

const evaluators = Object.freeze({
  "route-admission": evaluateRoute,
  "budget-reservation": evaluateBudget,
  "capacity-admission": evaluateCapacity,
  "compare-admission": evaluateCompare,
  "context-authority": evaluateContextAuthority,
  "interrupt-resume": evaluateInterrupt,
  "proposal-apply": evaluateProposal,
  "retry-admission": evaluateRetry,
  "slash-invocation": evaluateSlashInvocation,
  "permission-intersection": evaluatePermissionIntersection,
  "output-conformance": evaluateOutputConformance,
  "provider-identity": evaluateProviderIdentity,
});

const inputFields = Object.freeze({
  "route-admission": ["providerConnected", "fundingClass", "exactModelIdentity", "automaticFallback", "routeMutatedAfterValidation"],
  "budget-reservation": ["requiredUnits", "remainingUnitsByScope", "allOwnersCurrent", "priceKnown"],
  "capacity-admission": ["snapshotFresh", "compliantRegion", "capacityAvailable", "routeFieldsUnchanged"],
  "compare-admission": ["armCount", "aggregateWorstCaseReserved", "sharedTaskHash", "sharedContextHash", "sharedSkillSetHash", "sharedToolGrantHash", "sharedOutputContractHash", "automaticWinnerApply"],
  "context-authority": ["sourceKind", "authorityClass"],
  "interrupt-resume": ["issuer", "segmentState", "decision", "singleAssignmentWon", "boundHashesMatch", "attemptCompleted", "liveHandleExists", "liveGatesCurrent", "capabilitiesChanged"],
  "proposal-apply": ["terminalState", "effectClass", "requestedAction", "proposalHashMatches", "manifestHashesMatch", "foundationReceiptMatches", "targetStateFresh", "compareEvidenceOnly", "authorityOutcome"],
  "retry-admission": ["attemptIndex", "failureClass", "billingKnown", "sameRoute", "usableOutputExists", "reservationCoversRetry"],
  "slash-invocation": ["explicitCommandControl", "fullPayloadSingleLine", "commandEnabled", "skillEnabled", "schemaValid"],
  "permission-intersection": ["authorizedCapabilities", "requestedCapabilities", "effectiveCapabilities"],
  "output-conformance": ["schemaValid", "sizeWithinCap", "dataClassAllowed", "canaryDetected"],
  "provider-identity": ["requestedProvider", "reportedProvider", "requestedModel", "reportedModel", "requestedEffort", "reportedEffort"],
});

const laneEvaluators = Object.freeze({
  "cost-capacity-conformance": new Set(["route-admission", "budget-reservation", "capacity-admission", "compare-admission", "retry-admission"]),
  "security-conformance": new Set(["context-authority", "slash-invocation", "permission-intersection", "output-conformance", "provider-identity"]),
  "human-decision-conformance": new Set(["interrupt-resume"]),
  "apply-eligibility-conformance": new Set(["proposal-apply"]),
});

function parseFixture(path) {
  let document;
  try {
    document = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`fixture is not readable JSON: ${error.message}`);
  }

  exactKeys(
    document,
    ["schemaVersion", "fixtureId", "laneId", "mode", "dataClass", "providerCallsPermitted", "cases"],
    "root",
  );
  if (document.schemaVersion !== "obx-p180-contract-fixtures-v1") {
    throw new Error("unsupported schemaVersion");
  }
  if (typeof document.fixtureId !== "string" || document.fixtureId === "") {
    throw new Error("fixtureId must be a non-empty string");
  }
  if (!Object.hasOwn(laneEvaluators, document.laneId)) {
    throw new Error("unknown laneId");
  }
  if (document.mode !== "provider-offline") {
    throw new Error("mode must be provider-offline");
  }
  if (document.dataClass !== "synthetic-internal") {
    throw new Error("dataClass must be synthetic-internal");
  }
  if (document.providerCallsPermitted !== false) {
    throw new Error("providerCallsPermitted must be false");
  }
  if (!Array.isArray(document.cases) || document.cases.length === 0) {
    throw new Error("cases must be a non-empty array");
  }

  const ids = new Set();
  for (const item of document.cases) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("every case must be an object");
    }
    exactKeys(item, ["id", "evaluator", "input", "expect"], "case");
    if (typeof item.id !== "string" || item.id === "" || ids.has(item.id)) {
      throw new Error("every case requires a unique non-empty id");
    }
    ids.add(item.id);
    if (typeof evaluators[item.evaluator] !== "function") {
      throw new Error(`unknown evaluator for ${item.id}`);
    }
    if (!laneEvaluators[document.laneId].has(item.evaluator)) {
      throw new Error(`evaluator belongs to another lane for ${item.id}`);
    }
    if (item.input === null || typeof item.input !== "object" || Array.isArray(item.input)) {
      throw new Error(`input must be an object for ${item.id}`);
    }
    exactKeys(item.input, inputFields[item.evaluator], "input");
    if (item.expect === null || typeof item.expect !== "object" || Array.isArray(item.expect)) {
      throw new Error(`invalid oracle for ${item.id}`);
    }
    exactKeys(item.expect, ["accepted", "reasonCode"], "oracle");
    if (
      typeof item.expect.accepted !== "boolean" ||
      typeof item.expect.reasonCode !== "string" ||
      item.expect.reasonCode === ""
    ) {
      throw new Error(`invalid oracle for ${item.id}`);
    }
  }
  return document;
}

function main(argv) {
  if (process.permission?.has("net") !== false) {
    throw new Error("network permission must be denied");
  }
  if (argv.length !== 2 || argv[0] !== "--fixture") {
    throw new Error("usage: obx-p180-contract-fixtures.mjs --fixture <path>");
  }
  const document = parseFixture(resolve(argv[1]));
  const failures = [];

  for (const item of document.cases) {
    const actual = evaluators[item.evaluator](item.input);
    if (
      actual.accepted !== item.expect.accepted ||
      actual.reasonCode !== item.expect.reasonCode
    ) {
      failures.push({ id: item.id, expected: item.expect, actual });
    }
  }

  if (metrics.providerCallsMade !== 0) {
    throw new Error("provider call counter must remain zero");
  }
  if (failures.length > 0) {
    for (const failure of failures) {
      process.stderr.write(
        `${failure.id}: expected ${JSON.stringify(failure.expected)}, ` +
          `received ${JSON.stringify(failure.actual)}\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: "obx-p180-evaluation-lane-receipt-v1",
      fixtureId: document.fixtureId,
      laneId: document.laneId,
      mode: document.mode,
      total: document.cases.length,
      passed: document.cases.length,
      failed: 0,
      networkPermission: "denied",
      providerCallsMade: metrics.providerCallsMade,
      verdict: "PASS",
    })}\n`,
  );
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
