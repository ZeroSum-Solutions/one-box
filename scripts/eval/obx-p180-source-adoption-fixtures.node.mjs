#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const evaluator = join(here, "obx-p180-source-adoption-fixtures.mjs");
const fixture = join(root, "docs/eval/one-box-program/fixtures/obx-p180-source-adoption-fixture-v1.json");
const expectedCaseCount = JSON.parse(readFileSync(fixture, "utf8")).cases.length;

function run(path, denyNetwork = true) {
  const args = denyNetwork
    ? ["--experimental-permission", `--allow-fs-read=${root}`, `--allow-fs-read=${dirname(path)}`, evaluator, "--fixture", path]
    : [evaluator, "--fixture", path];
  return spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
}

function withMutation(mutate, assertion) {
  const temporary = mkdtempSync(join(tmpdir(), "obx-p180-source-adoption-"));
  try {
    const document = JSON.parse(readFileSync(fixture, "utf8"));
    mutate(document);
    const altered = join(temporary, "altered.json");
    writeFileSync(altered, `${JSON.stringify(document, null, 2)}\n`);
    assertion(run(altered));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

test("source-adoption lane emits a bounded passing receipt", () => {
  const result = run(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: "obx-p180-evaluation-lane-receipt-v1",
    fixtureId: "obx-p180-source-adoption-fixture-v1",
    laneId: "source-adoption-conformance",
    mode: "provider-offline",
    total: expectedCaseCount,
    passed: expectedCaseCount,
    failed: 0,
    networkPermission: "denied",
    providerCallsMade: 0,
    verdict: "PASS",
  });
});

test("oracle mutation cannot bless hidden provider fallback", () => {
  withMutation(
    (document) => {
      document.cases.find((item) => item.id === "openrouter-glm-hidden-fallback-rejected").expect = { accepted: true, reasonCode: "ACCEPTED" };
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AUDIT_ROUTE_FALLBACK_FORBIDDEN/);
    },
  );
});

test("oracle mutations cannot bless rejected non-route behavior", () => {
  const cases = [
    ["t3-duplicate-command-effect-reexecution-rejected", /REPLAY_EFFECT_REEXECUTION/],
    ["t3-stale-event-rejected", /STALE_EVENT_REJECTED/],
    ["t3-source-authority-rejected", /SOURCE_AUTHORITY_FORBIDDEN/],
    ["mishmash-active-turn-reaper-rejected", /LIFECYCLE_ACTIVE_TURN_PROTECTED/],
    ["mishmash-retry-after-output-rejected", /RETRY_USER_VISIBLE_OUTPUT_SEEN/],
    ["openrouter-disable-provider-call-rejected", /SOURCE_REMOVAL_PROVIDER_CALL/],
  ];
  for (const [id, reason] of cases) {
    withMutation(
      (document) => {
        document.cases.find((item) => item.id === id).expect = { accepted: true, reasonCode: "ACCEPTED" };
      },
      (result) => {
        assert.equal(result.status, 1, `${id}: ${result.stderr}`);
        assert.match(result.stderr, reason, id);
      },
    );
  }
});

test("provider display name cannot substitute for the exact endpoint slug", () => {
  withMutation(
    (document) => {
      const item = document.cases.find((candidate) => candidate.id === "openrouter-glm-exact-audit-route-admitted");
      item.input.providerOrder = ["Z.AI"];
      item.input.providerOnly = ["Z.AI"];
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AUDIT_ROUTE_IDENTITY_MISMATCH/);
    },
  );
});

test("every audit-route control fails closed when independently mutated", () => {
  const mutations = [
    ["routeId", "audit-openrouter-other", /AUDIT_ROUTE_IDENTITY_MISMATCH/],
    ["registry", "product-runtime", /AUDIT_ROUTE_IDENTITY_MISMATCH/],
    ["model", "z-ai/other-model", /AUDIT_ROUTE_IDENTITY_MISMATCH/],
    ["upstreamProvider", "Other", /AUDIT_ROUTE_IDENTITY_MISMATCH/],
    ["providerOrder", ["openai"], /AUDIT_ROUTE_IDENTITY_MISMATCH/],
    ["providerOnly", ["openai"], /AUDIT_ROUTE_IDENTITY_MISMATCH/],
    ["allowFallbacks", true, /AUDIT_ROUTE_FALLBACK_FORBIDDEN/],
    ["requireParameters", false, /AUDIT_ROUTE_PRIVACY_REQUIRED/],
    ["dataCollection", "allow", /AUDIT_ROUTE_PRIVACY_REQUIRED/],
    ["zdr", false, /AUDIT_ROUTE_PRIVACY_REQUIRED/],
    ["tools", [{ type: "function" }], /AUDIT_ROUTE_TOOLS_FORBIDDEN/],
    ["plugins", [{ id: "web" }], /AUDIT_ROUTE_TOOLS_FORBIDDEN/],
    ["openRouterLoggingAssumption", "disabled-without-receipt", /AUDIT_ROUTE_LOGGING_ASSUMPTION_UNACCEPTED/],
    ["reasoningEffort", "max", /AUDIT_ROUTE_REASONING_EFFORT_UNBOUNDED/],
    ["dataClass", "client-private", /AUDIT_ROUTE_DATA_CLASS_FORBIDDEN/],
    ["productDataTransferAllowed", true, /AUDIT_ROUTE_PRODUCT_TRANSFER_FORBIDDEN/],
    ["maxAttempts", 2, /AUDIT_ROUTE_RETRY_FORBIDDEN/],
    ["routeExpired", true, /AUDIT_ROUTE_EXPIRED/],
    ["maxInputTokens", 200001, /AUDIT_ROUTE_TOKEN_POLICY_DRIFT/],
    ["maxOutputTokens", 8001, /AUDIT_ROUTE_TOKEN_POLICY_DRIFT/],
    ["packetInputTokens", 200001, /AUDIT_ROUTE_TOKEN_LIMIT_EXCEEDED/],
    ["requestedOutputTokens", 8001, /AUDIT_ROUTE_TOKEN_LIMIT_EXCEEDED/],
    ["maxCostUsd", 0.06, /AUDIT_ROUTE_BUDGET_EXCEEDED/],
    ["estimatedCostUsd", 0.051, /AUDIT_ROUTE_BUDGET_EXCEEDED/],
  ];
  for (const [field, value, reason] of mutations) {
    withMutation(
      (document) => {
        const item = document.cases.find((candidate) => candidate.id === "openrouter-glm-exact-audit-route-admitted");
        item.input[field] = value;
      },
      (result) => {
        assert.equal(result.status, 1, `${field}: ${result.stderr}`);
        assert.match(result.stderr, reason, field);
      },
    );
  }
});

test("unknown source reference fails closed", () => {
  withMutation(
    (document) => { document.cases[0].sourceRefs = ["SC-UNKNOWN-001"]; },
    (result) => {
      assert.equal(result.status, 2);
      assert.match(result.stderr, /invalid sourceRefs/);
    },
  );
});

test("missing T04 coverage fails closed", () => {
  withMutation(
    (document) => {
      for (const item of document.cases) item.ticketIds = item.ticketIds.map((id) => id === "OBX-P180-T04" ? "OBX-P180-T03" : id);
    },
    (result) => {
      assert.equal(result.status, 2);
      assert.match(result.stderr, /does not cover OBX-P180-T04/);
    },
  );
});

test("evaluator refuses network permission", () => {
  const result = run(fixture, false);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /network permission must be denied/);
});
