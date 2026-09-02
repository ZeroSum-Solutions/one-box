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
const evaluator = join(here, "obx-p180-contract-fixtures.mjs");
const fixtureRoot = join(root, "docs/eval/one-box-program/fixtures");
const fixtures = [
  ["capacity-and-cost-fixture-v1.json", "cost-capacity-conformance", 11],
  ["obx-p180-security-fixture-v1.json", "security-conformance", 9],
  ["obx-p180-human-decision-fixture-v1.json", "human-decision-conformance", 3],
  ["obx-p180-apply-eligibility-fixture-v1.json", "apply-eligibility-conformance", 4],
];

function run(path) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-permission",
      `--allow-fs-read=${root}`,
      `--allow-fs-read=${dirname(path)}`,
      evaluator,
      "--fixture",
      path,
    ],
    { cwd: root, encoding: "utf8" },
  );
}

function withFixture(source, mutate, assertion) {
  const temporary = mkdtempSync(join(tmpdir(), "obx-p180-fixture-"));
  try {
    const document = JSON.parse(readFileSync(source, "utf8"));
    mutate(document);
    const altered = join(temporary, "altered.json");
    writeFileSync(altered, `${JSON.stringify(document, null, 2)}\n`);
    assertion(run(altered));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

for (const [name, laneId, total] of fixtures) {
  test(`${laneId} emits only its own passing receipt`, () => {
    const result = run(join(fixtureRoot, name));

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      schemaVersion: "obx-p180-evaluation-lane-receipt-v1",
      fixtureId: name.replace(/\.json$/, ""),
      laneId,
      mode: "provider-offline",
      total,
      passed: total,
      failed: 0,
      networkPermission: "denied",
      providerCallsMade: 0,
      verdict: "PASS",
    });
  });
}

test("fails when an oracle is changed to bless automatic fallback", () => {
  const source = join(fixtureRoot, fixtures[0][0]);
  withFixture(
    source,
    (document) => {
      document.cases.find(
        (item) => item.id === "route-automatic-fallback-rejected",
      ).expect = { accepted: true, reasonCode: "ACCEPTED" };
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /route-automatic-fallback-rejected/);
      assert.match(result.stderr, /AUTO_FALLBACK_FORBIDDEN/);
    },
  );
});

test("fails when an oracle is changed to bless compare auto-apply", () => {
  const source = join(fixtureRoot, fixtures[0][0]);
  withFixture(
    source,
    (document) => {
      document.cases.find(
        (item) => item.id === "compare-automatic-winner-apply-rejected",
      ).expect = { accepted: true, reasonCode: "ACCEPTED" };
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /COMPARE_AUTO_APPLY_FORBIDDEN/);
    },
  );
});

test("accepts fail-closed interrupt cancellation despite drift", () => {
  const result = run(join(fixtureRoot, fixtures[2][0]));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).laneId, "human-decision-conformance");
});

const malformedCases = [
  ["provider calls enabled", (d) => (d.providerCallsPermitted = true), /providerCallsPermitted must be false/],
  ["extra root field", (d) => (d.extra = true), /unknown root field/],
  ["missing fixture id", (d) => delete d.fixtureId, /missing root field: fixtureId/],
  ["wrong data class", (d) => (d.dataClass = "public"), /dataClass must be synthetic-internal/],
  ["empty cases", (d) => (d.cases = []), /cases must be a non-empty array/],
  ["duplicate ids", (d) => d.cases.push(structuredClone(d.cases[0])), /unique non-empty id/],
  ["unknown evaluator", (d) => (d.cases[0].evaluator = "unknown"), /unknown evaluator/],
  ["empty reason code", (d) => (d.cases[0].expect.reasonCode = ""), /invalid oracle/],
  ["extra case field", (d) => (d.cases[0].extra = true), /unknown case field/],
];

for (const [name, mutate, message] of malformedCases) {
  test(`rejects malformed fixture: ${name}`, () => {
    const source = join(fixtureRoot, fixtures[0][0]);
    withFixture(source, mutate, (result) => {
      assert.equal(result.status, 2);
      assert.match(result.stderr, message);
    });
  });
}

test("rejects invalid JSON", () => {
  const temporary = mkdtempSync(join(tmpdir(), "obx-p180-fixture-"));
  try {
    const altered = join(temporary, "invalid.json");
    writeFileSync(altered, "{not-json\n");
    const result = run(altered);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /fixture is not readable JSON/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("refuses to run when the process has network permission", () => {
  const result = spawnSync(
    process.execPath,
    [evaluator, "--fixture", join(fixtureRoot, fixtures[0][0])],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /network permission must be denied/);
});
