#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ACCEPTED = Object.freeze({ accepted: true, reasonCode: "ACCEPTED" });
const SOURCE_REFS = new Set(["SC-GH-010", "SC-INT-001", "SC-SVC-001", "SC-SVC-003"]);
const TICKET_IDS = new Set(["OBX-P180-T03", "OBX-P180-T04", "OBX-P180-T05"]);

const accepted = (reasonCode) => ({ accepted: true, reasonCode });
const rejected = (reasonCode) => ({ accepted: false, reasonCode });

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const closed = [...expected].sort();
  const unknown = actual.filter((key) => !closed.includes(key));
  const missing = closed.filter((key) => !actual.includes(key));
  if (unknown.length > 0) throw new Error(`unknown ${label} field: ${unknown.join(",")}`);
  if (missing.length > 0) throw new Error(`missing ${label} field: ${missing.join(",")}`);
}

function evaluateCommandReplay(input) {
  if (input.receiptAuthority !== "one-box-control-plane") return rejected("REPLAY_RECEIPT_AUTHORITY_FORBIDDEN");
  if (input.commandReceiptFound === true && input.commandHashMatches !== true) return rejected("REPLAY_COMMAND_HASH_MISMATCH");
  if (input.eventAlreadyProjected === true && input.commandReceiptFound !== true) return rejected("REPLAY_PROJECTED_EVENT_WITHOUT_RECEIPT");
  if (input.effectsReexecuted !== false && (input.commandReceiptFound === true || input.eventAlreadyProjected === true)) return rejected("REPLAY_EFFECT_REEXECUTION");
  if (input.commandReceiptFound === true && input.eventAlreadyProjected === true) return accepted("ACCEPTED_REPLAY_NOOP");
  return ACCEPTED;
}

function evaluateEventProjection(input) {
  if (![input.eventSequence, input.expectedNextSequence].every((value) => Number.isSafeInteger(value) && value >= 0)) return rejected("EVENT_SEQUENCE_INVALID");
  if (input.eventSequence < input.expectedNextSequence) return rejected("STALE_EVENT_REJECTED");
  if (input.eventSequence > input.expectedNextSequence) return rejected("EVENT_SEQUENCE_GAP");
  if (input.sourceRole !== "untrusted-provider-event" || input.projectionAuthority !== "one-box-projector") return rejected("EVENT_PROJECTION_AUTHORITY_FORBIDDEN");
  if (input.attemptsPageIrMutation !== false) return rejected("EVENT_PAGE_IR_AUTHORITY_FORBIDDEN");
  if (input.runtimeReceiptRole !== "test-only") return rejected("TEST_RECEIPT_PRODUCTION_USE_FORBIDDEN");
  if (input.workerDrained !== true) return rejected("PROJECTION_WORKER_NOT_DRAINED");
  return ACCEPTED;
}

function evaluateSourceAuthority(input) {
  if (!new Set(["SC-GH-010", "SC-INT-001"]).has(input.sourceId)) return rejected("SOURCE_ID_UNKNOWN");
  if (input.namedOwnerCurrent !== true) return rejected("SOURCE_OWNER_UNAVAILABLE");
  if (input.requestedUse !== "pattern-adaptation") return rejected("SOURCE_USE_OUT_OF_SCOPE");
  if (input.grantedAuthority !== "none") return rejected("SOURCE_AUTHORITY_FORBIDDEN");
  return ACCEPTED;
}

function evaluateProviderLifecycle(input) {
  if (input.configDecodedOnce !== true) return rejected("LIFECYCLE_CONFIG_NOT_CLOSED");
  if (input.instanceStateIsolated !== true) return rejected("LIFECYCLE_INSTANCE_STATE_SHARED");
  if (input.scopeOwnsResources !== true) return rejected("LIFECYCLE_SCOPE_UNOWNED");
  if (input.commandProcessingSerialized !== true) return rejected("LIFECYCLE_COMMANDS_UNSERIALIZED");
  if (input.workerDrained !== true) return rejected("LIFECYCLE_WORKER_NOT_DRAINED");
  if (input.activeTurn === true && (input.reaperAttempted === true || input.sessionKilled === true)) return rejected("LIFECYCLE_ACTIVE_TURN_PROTECTED");
  if (input.reaperAttempted !== input.sessionKilled) return rejected("LIFECYCLE_REAPER_OUTCOME_MISMATCH");
  return ACCEPTED;
}

function evaluateRetrySideEffect(input) {
  if (input.failureTransient !== true || input.sameRoute !== true || input.attemptIndex !== 1) return rejected("RETRY_ROUTE_OR_FAILURE_INVALID");
  if (input.billingKnown !== true) return rejected("RETRY_BILLING_AMBIGUOUS");
  if (input.userVisibleOutputSeen !== false) return rejected("RETRY_USER_VISIBLE_OUTPUT_SEEN");
  if (input.toolCallSeen !== false) return rejected("RETRY_TOOL_CALL_SEEN");
  if (input.artifactWriteSeen !== false || input.liveArtifactSeen !== false) return rejected("RETRY_ARTIFACT_EFFECT_SEEN");
  return ACCEPTED;
}

function evaluateAuditRoute(input) {
  if (input.routeId !== "audit-openrouter-glm-5.3-flash-zai-v2" || input.registry !== "external-review-only" || input.model !== "z-ai/glm-5.3-flash" || input.upstreamProvider !== "Z.AI" || JSON.stringify(input.providerOrder) !== '["z-ai/fp8"]' || JSON.stringify(input.providerOnly) !== '["z-ai/fp8"]') return rejected("AUDIT_ROUTE_IDENTITY_MISMATCH");
  if (input.allowFallbacks !== false) return rejected("AUDIT_ROUTE_FALLBACK_FORBIDDEN");
  if (input.requireParameters !== true || input.dataCollection !== "deny" || input.zdr !== true) return rejected("AUDIT_ROUTE_PRIVACY_REQUIRED");
  if (!Array.isArray(input.tools) || input.tools.length !== 0 || !Array.isArray(input.plugins) || input.plugins.length !== 0) return rejected("AUDIT_ROUTE_TOOLS_FORBIDDEN");
  if (input.openRouterLoggingAssumption !== "potentially-enabled-and-accepted-for-sanitized-packet") return rejected("AUDIT_ROUTE_LOGGING_ASSUMPTION_UNACCEPTED");
  if (input.reasoningEffort !== "low") return rejected("AUDIT_ROUTE_REASONING_EFFORT_UNBOUNDED");
  if (input.dataClass !== "synthetic-internal") return rejected("AUDIT_ROUTE_DATA_CLASS_FORBIDDEN");
  if (input.productDataTransferAllowed !== false) return rejected("AUDIT_ROUTE_PRODUCT_TRANSFER_FORBIDDEN");
  if (input.maxAttempts !== 1) return rejected("AUDIT_ROUTE_RETRY_FORBIDDEN");
  if (input.routeExpired !== false) return rejected("AUDIT_ROUTE_EXPIRED");
  if (input.maxInputTokens !== 200000 || input.maxOutputTokens !== 8000) return rejected("AUDIT_ROUTE_TOKEN_POLICY_DRIFT");
  if (![input.packetInputTokens, input.requestedOutputTokens].every((value) => Number.isSafeInteger(value) && value >= 0) || input.packetInputTokens > input.maxInputTokens || input.requestedOutputTokens > input.maxOutputTokens) return rejected("AUDIT_ROUTE_TOKEN_LIMIT_EXCEEDED");
  if (![input.estimatedCostUsd, input.maxCostUsd].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0) || input.maxCostUsd !== 0.05 || input.estimatedCostUsd > input.maxCostUsd) return rejected("AUDIT_ROUTE_BUDGET_EXCEEDED");
  return ACCEPTED;
}

function evaluateSourceRemoval(input) {
  if (!new Set(["SC-GH-010", "SC-INT-001", "SC-SVC-003"]).has(input.sourceId)) return rejected("SOURCE_ID_UNKNOWN");
  if (input.killSwitchAvailable !== true || input.externalServiceDisabled !== true) return rejected("SOURCE_REMOVAL_SWITCH_UNAVAILABLE");
  if (input.upstreamDependencyCount !== 0 || input.runtimeImportCount !== 0) return rejected("SOURCE_REMOVAL_RUNTIME_COUPLED");
  if (input.baselinePassesWithoutSource !== true) return rejected("SOURCE_REMOVAL_BASELINE_FAILED");
  if (input.providerCallsAfterDisable !== 0) return rejected("SOURCE_REMOVAL_PROVIDER_CALL");
  if (input.productDataRetained !== false) return rejected("SOURCE_REMOVAL_DATA_RETAINED");
  return ACCEPTED;
}

const EVALUATORS = Object.freeze({
  "command-replay": evaluateCommandReplay,
  "event-projection": evaluateEventProjection,
  "source-authority": evaluateSourceAuthority,
  "provider-lifecycle": evaluateProviderLifecycle,
  "retry-side-effect": evaluateRetrySideEffect,
  "audit-route-policy": evaluateAuditRoute,
  "source-removal": evaluateSourceRemoval,
});

const INPUT_FIELDS = Object.freeze({
  "command-replay": ["commandReceiptFound", "commandHashMatches", "eventAlreadyProjected", "effectsReexecuted", "receiptAuthority"],
  "event-projection": ["eventSequence", "expectedNextSequence", "sourceRole", "projectionAuthority", "attemptsPageIrMutation", "runtimeReceiptRole", "workerDrained"],
  "source-authority": ["sourceId", "requestedUse", "grantedAuthority", "namedOwnerCurrent"],
  "provider-lifecycle": ["configDecodedOnce", "instanceStateIsolated", "scopeOwnsResources", "commandProcessingSerialized", "workerDrained", "activeTurn", "reaperAttempted", "sessionKilled"],
  "retry-side-effect": ["failureTransient", "sameRoute", "attemptIndex", "billingKnown", "userVisibleOutputSeen", "toolCallSeen", "artifactWriteSeen", "liveArtifactSeen"],
  "audit-route-policy": ["routeId", "registry", "model", "upstreamProvider", "providerOrder", "providerOnly", "allowFallbacks", "requireParameters", "dataCollection", "zdr", "tools", "plugins", "openRouterLoggingAssumption", "reasoningEffort", "dataClass", "productDataTransferAllowed", "maxAttempts", "maxInputTokens", "maxOutputTokens", "packetInputTokens", "requestedOutputTokens", "estimatedCostUsd", "maxCostUsd", "routeExpired"],
  "source-removal": ["sourceId", "killSwitchAvailable", "externalServiceDisabled", "upstreamDependencyCount", "runtimeImportCount", "baselinePassesWithoutSource", "providerCallsAfterDisable", "productDataRetained"],
});

function parseFixture(path) {
  let document;
  try { document = JSON.parse(readFileSync(path, "utf8")); } catch (error) { throw new Error(`fixture is not readable JSON: ${error.message}`); }
  exactKeys(document, ["schemaVersion", "fixtureId", "laneId", "mode", "dataClass", "providerCallsPermitted", "cases"], "root");
  if (document.schemaVersion !== "obx-p180-contract-fixtures-v1" || document.fixtureId !== "obx-p180-source-adoption-fixture-v1" || document.laneId !== "source-adoption-conformance") throw new Error("unsupported source-adoption fixture identity");
  if (document.mode !== "provider-offline" || document.dataClass !== "synthetic-internal" || document.providerCallsPermitted !== false) throw new Error("fixture must remain provider-offline synthetic-internal with provider calls forbidden");
  if (!Array.isArray(document.cases) || document.cases.length === 0) throw new Error("cases must be a non-empty array");
  const ids = new Set();
  for (const item of document.cases) {
    exactKeys(item, ["id", "evaluator", "sourceRefs", "ticketIds", "input", "expect"], "case");
    if (typeof item.id !== "string" || item.id === "" || ids.has(item.id)) throw new Error("every case requires a unique non-empty id");
    ids.add(item.id);
    if (typeof EVALUATORS[item.evaluator] !== "function") throw new Error(`unknown evaluator for ${item.id}`);
    if (!Array.isArray(item.sourceRefs) || item.sourceRefs.length === 0 || new Set(item.sourceRefs).size !== item.sourceRefs.length || item.sourceRefs.some((id) => !SOURCE_REFS.has(id))) throw new Error(`invalid sourceRefs for ${item.id}`);
    if (!Array.isArray(item.ticketIds) || item.ticketIds.length === 0 || new Set(item.ticketIds).size !== item.ticketIds.length || item.ticketIds.some((id) => !TICKET_IDS.has(id))) throw new Error(`invalid ticketIds for ${item.id}`);
    exactKeys(item.input, INPUT_FIELDS[item.evaluator], "input");
    exactKeys(item.expect, ["accepted", "reasonCode"], "oracle");
    if (typeof item.expect.accepted !== "boolean" || typeof item.expect.reasonCode !== "string" || item.expect.reasonCode === "") throw new Error(`invalid oracle for ${item.id}`);
  }
  const coveredSources = new Set(document.cases.flatMap((item) => item.sourceRefs));
  const coveredTickets = new Set(document.cases.flatMap((item) => item.ticketIds));
  for (const id of SOURCE_REFS) if (!coveredSources.has(id)) throw new Error(`fixture does not cover ${id}`);
  for (const id of TICKET_IDS) if (!coveredTickets.has(id)) throw new Error(`fixture does not cover ${id}`);
  return document;
}

function main(argv) {
  if (process.permission?.has("net") !== false) throw new Error("network permission must be denied");
  if (argv.length !== 2 || argv[0] !== "--fixture") throw new Error("usage: obx-p180-source-adoption-fixtures.mjs --fixture <path>");
  const document = parseFixture(resolve(argv[1]));
  const failures = [];
  for (const item of document.cases) {
    const actual = EVALUATORS[item.evaluator](item.input);
    if (actual.accepted !== item.expect.accepted || actual.reasonCode !== item.expect.reasonCode) failures.push({ id: item.id, expected: item.expect, actual });
  }
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`${failure.id}: expected ${JSON.stringify(failure.expected)}, received ${JSON.stringify(failure.actual)}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify({schemaVersion: "obx-p180-evaluation-lane-receipt-v1", fixtureId: document.fixtureId, laneId: document.laneId, mode: document.mode, total: document.cases.length, passed: document.cases.length, failed: 0, networkPermission: "denied", providerCallsMade: 0, verdict: "PASS"})}\n`);
}

try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
