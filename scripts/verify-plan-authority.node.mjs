import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  after,
  before,
  test,
} from "node:test";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let fixtureRoot;
let verifier;

before(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "one-box-plan-verifier-"));
  for (const path of ["docs", ".github", "src"]) cpSync(resolve(sourceRoot, path), resolve(fixtureRoot, path), { recursive: true });
  for (const path of ["AGENTS.md", "README.md", "CONTRIBUTING.md", ".env.example", "package.json"]) cpSync(resolve(sourceRoot, path), resolve(fixtureRoot, path));
  cpSync(resolve(sourceRoot, "package-lock.json"), resolve(fixtureRoot, "package-lock.json"));
  mkdirSync(resolve(fixtureRoot, ".claude/handoffs"), { recursive: true });
  cpSync(
    resolve(sourceRoot, ".claude/handoffs/one-box-operating-environment-next-phase.md"),
    resolve(fixtureRoot, ".claude/handoffs/one-box-operating-environment-next-phase.md"),
  );
  mkdirSync(resolve(fixtureRoot, "scripts"), { recursive: true });
  for (const path of ["verify-plan-authority.mjs", "verify-plan-authority.node.mjs"]) {
    cpSync(resolve(sourceRoot, `scripts/${path}`), resolve(fixtureRoot, `scripts/${path}`));
  }
  mkdirSync(resolve(fixtureRoot, "scripts/e2e"), { recursive: true });
  for (const path of ["canvas-contract.mjs", "canvas-coverage.mjs", "preview-workbench.mjs"]) {
    cpSync(resolve(sourceRoot, `scripts/e2e/${path}`), resolve(fixtureRoot, `scripts/e2e/${path}`));
  }
  mkdirSync(resolve(fixtureRoot, "scripts/eval"), { recursive: true });
  for (const path of ["obx-p180-contract-fixtures.mjs", "obx-p180-contract-fixtures.test.mjs", "grok-audit.mjs"]) {
    cpSync(resolve(sourceRoot, `scripts/eval/${path}`), resolve(fixtureRoot, `scripts/eval/${path}`));
  }
  verifier = resolve(fixtureRoot, "scripts/verify-plan-authority.mjs");
});

after(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
});

function run(args = [], extraEnv = {}) {
  return spawnSync(process.execPath, [verifier, ...args], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

function fixedEvaluationTimeEnvironment(timestamp) {
  const source = `Date.now = () => ${timestamp};`;
  const preload = `--import=data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const inherited = process.env.NODE_OPTIONS?.trim();
  return { NODE_OPTIONS: inherited ? `${inherited} ${preload}` : preload };
}

function runSoloAmendment() {
  return run(["--verify-solo-amendment-only"]);
}

function runSoloStructure() {
  return run(["--verify-solo-structure-only"]);
}

function withFileMutation(path, mutate, assertion, args = []) {
  const absolute = resolve(fixtureRoot, path);
  const original = readFileSync(absolute, "utf8");
  try {
    const replacement = mutate(original);
    if (typeof replacement === "string") writeFileSync(absolute, replacement);
    const result = run(args);
    assert.notEqual(result.status, 0, `mutation unexpectedly passed\n${result.stdout}\n${result.stderr}`);
    assertion(result);
  } finally {
    writeFileSync(absolute, original);
  }
}

function withJsonMutation(path, mutate, assertion, args = []) {
  withFileMutation(path, (text) => {
    const value = JSON.parse(text);
    mutate(value);
    return `${JSON.stringify(value, null, 2)}\n`;
  }, assertion, args);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function rehashSoloRecord(registry) {
  const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T01-SOLO-001");
  const unhashed = structuredClone(record);
  delete unhashed.authorizationHash.digest;
  record.authorizationHash.digest = createHash("sha256").update(canonicalJson(unhashed)).digest("hex");
}

function withSoloRecordMutation(mutate, assertion, { rehash = true, args = ["--verify-solo-structure-only"] } = {}) {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T01-SOLO-001");
    mutate(record, registry);
    if (rehash) rehashSoloRecord(registry);
  }, assertion, args);
}

function withMultipleFileMutations(mutations, assertion) {
  const originals = new Map();
  try {
    for (const [path, mutate] of mutations) {
      const absolute = resolve(fixtureRoot, path);
      const original = readFileSync(absolute, "utf8");
      originals.set(absolute, original);
      writeFileSync(absolute, mutate(original));
    }
    const result = run();
    assert.notEqual(result.status, 0, `mutations unexpectedly passed\n${result.stdout}\n${result.stderr}`);
    assertion(result);
  } finally {
    for (const [absolute, original] of originals) writeFileSync(absolute, original);
  }
}

const securityReceiptPath = "docs/audits/evidence/security/2026-08-30-obx-p180-t01-solo-authorization-security-review.json";
const grokReceiptPath = "docs/audits/grok-4.6/2026-08-30-obx-p180-solo-t01-authorization-final-audit.json";
const fableReceiptPath = "docs/audits/fable-5/2026-08-30-obx-p180-solo-t01-authorization-final-audit.json";
const securityReceiptTargets = [
  "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json",
  "docs/plans/one-box-master/00-authority/authority-manifest.json",
  "docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json",
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
];

function sha256Fixture(path) {
  return createHash("sha256").update(readFileSync(resolve(fixtureRoot, path))).digest("hex");
}

function writeFixtureJson(path, value) {
  const absolute = resolve(fixtureRoot, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}

function targetHashes(paths) {
  return paths.map((path) => ({ path, algorithm: "sha256", digest: sha256Fixture(path) }));
}

function receiptCommon(targetPaths) {
  const registry = JSON.parse(readFileSync(resolve(fixtureRoot, securityReceiptTargets[0]), "utf8"));
  const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T01-SOLO-001");
  return {
    schemaVersion: 1,
    authorizationId: "OBX-AUTH-P180-T01-SOLO-001",
    authorizationHash: record.authorizationHash.digest,
    amendmentId: "OBX-P180-T01-SOLO-AMENDMENT-001",
    amendmentHash: "eb932d7e0a6cd12fa2cfa6570afbcad452bbdf8481047c700aaf3eec4075d202",
    baseCommit: "b6486fdfa4601b315944ad099bf2beba1c053e91",
    targetPaths,
    targetHashes: targetHashes(targetPaths),
    verdict: "PASS-WITH-ACCEPTED-RISK",
    independentHumanReview: { status: "NOT_AVAILABLE", satisfied: false },
    capturedAt: "2026-08-31T13:33:33Z",
  };
}

function acceptedFinding() {
  return {
    findingId: "OBX-P180-T01-SOLO-SEPARATION-001",
    severity: "MEDIUM",
    status: "ACCEPTED",
  };
}

function writeExactReceiptChain() {
  writeFixtureJson(securityReceiptPath, {
    ...receiptCommon(securityReceiptTargets),
    receiptKind: "solo-t01-security-review-v1",
    findings: [{
      ...acceptedFinding(),
      surfaceDisposition: [
        ["prompt-injection", "NOT_APPLICABLE"],
        ["secrets", "REVIEWED"],
        ["authentication", "NOT_APPLICABLE"],
        ["authorization", "REVIEWED"],
        ["untrusted-input", "NOT_APPLICABLE"],
        ["export", "NOT_APPLICABLE"],
      ].map(([surface, disposition]) => ({
        surface,
        disposition,
        changedPathEvidence: [securityReceiptTargets[0]],
      })),
    }],
  });
  const grokTargets = [...securityReceiptTargets, securityReceiptPath];
  writeFixtureJson(grokReceiptPath, {
    ...receiptCommon(grokTargets),
    receiptKind: "solo-t01-model-audit-v1",
    requestedModel: "x-ai/grok-4.6",
    providerReportedModel: "x-ai/grok-4.6",
    effort: "high",
    findings: [acceptedFinding()],
  });
  const fableTargets = [...grokTargets, grokReceiptPath];
  writeFixtureJson(fableReceiptPath, {
    ...receiptCommon(fableTargets),
    receiptKind: "solo-t01-model-audit-v1",
    requestedModel: "claude-fable-5",
    providerReportedModel: "claude-fable-5",
    effort: "max",
    findings: [acceptedFinding()],
  });
}

function withExactReceiptChain(callback) {
  const paths = [securityReceiptPath, grokReceiptPath, fableReceiptPath];
  const originals = new Map();
  for (const path of paths) {
    const absolute = resolve(fixtureRoot, path);
    originals.set(path, existsSync(absolute) ? readFileSync(absolute) : null);
  }
  try {
    writeExactReceiptChain();
    callback();
  } finally {
    for (const [path, original] of originals) {
      const absolute = resolve(fixtureRoot, path);
      if (original === null) rmSync(absolute, { force: true });
      else writeFileSync(absolute, original);
    }
  }
}

test("the current non-empty packet passes discriminated structure verification", () => {
  const result = runSoloStructure();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Solo T01 authorization self-hash: [a-f0-9]{64}/);
  assert.match(result.stdout, /structure and frozen bindings/);
});

test("the solo T01 amendment matches its exact pinned digest and unavailable-review state", () => {
  const result = runSoloAmendment();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /eb932d7e0a6cd12fa2cfa6570afbcad452bbdf8481047c700aaf3eec4075d202/);
  assert.match(result.stdout, /Independent human review: NOT_AVAILABLE \/ false/);
  assert.match(result.stdout, /non-waivable governance defaults preserved/);
});

test("the solo T01 amendment rejects unknown fields and byte drift", () => {
  withJsonMutation("docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json", (amendment) => {
    amendment.generalAuthorization = true;
  }, (result) => {
    assert.match(result.stderr, /solo T01 amendment: SHA-256 drift/);
    assert.match(result.stderr, /solo T01 amendment: unknown key generalAuthorization/);
  }, ["--verify-solo-amendment-only"]);
});

test("the solo T01 amendment cannot become a standard waiver", () => {
  withJsonMutation("docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json", (amendment) => {
    amendment.standardWaiverEligible = true;
  }, (result) => assert.match(result.stderr, /standardWaiverEligible drift/), ["--verify-solo-amendment-only"]);
});

test("the solo T01 amendment pins NOT_AVAILABLE and false for every lost control", () => {
  withJsonMutation("docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json", (amendment) => {
    amendment.unavailableControls[2].assignmentStatus = "not-available";
    amendment.unavailableControls[2].separationSatisfied = true;
  }, (result) => assert.match(result.stderr, /unavailableControls\[2\]: exact value drift/), ["--verify-solo-amendment-only"]);
});

test("the solo T01 amendment requires the exact 336-hour non-renewable lifetime", () => {
  withJsonMutation("docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json", (amendment) => {
    amendment.expiresAt = "2026-09-15T13:33:33Z";
    amendment.renewable = true;
  }, (result) => {
    assert.match(result.stderr, /renewable drift/);
    assert.match(result.stderr, /expiry must be exactly 336 hours/);
  }, ["--verify-solo-amendment-only"]);
});

test("the solo T01 amendment cannot weaken the frozen non-waivable defaults", () => {
  withFileMutation("docs/governance/risk-exceptions/README.md", (text) => `${text}\nSolo authorization is generally waivable.\n`, (result) => {
    assert.match(result.stderr, /non-waivable governance default drift/);
  }, ["--verify-solo-amendment-only"]);
});

test("the exact synthetic solo T01 receipt chain passes receipt-only verification", () => {
  withExactReceiptChain(() => {
    const result = run(["--verify-solo-receipts-only"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /exact receipt chain/);
  });
});

test("the exact captured solo T01 source scope passes", () => {
  const registry = JSON.parse(readFileSync(resolve(fixtureRoot, securityReceiptTargets[0]), "utf8"));
  const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T01-SOLO-001");
  const result = run(["--verify-solo-source-scope-only"], {
    SOLO_COMMITTED_CHANGED_PATHS_JSON: JSON.stringify(record.activationWriteSet),
    SOLO_UNTRACKED_ROWS_JSON: JSON.stringify(record.preExistingUntrackedBaseline),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /activation source scope/);
});

test("[solo negative 01] ATF bytes and fields remain deep-equal", () => {
  withJsonMutation(securityReceiptTargets[0], (registry) => {
    registry.authorizations[0].evidence += " drift";
  }, (result) => assert.match(result.stderr, /OBX-AUTH-ATF-001: canonical record drift/), ["--verify-solo-structure-only"]);
});

test("[solo negative 02] global implementation authorization remains false", () => {
  withJsonMutation(securityReceiptTargets[0], (registry) => {
    registry.globalImplementationAuthorized = true;
  }, (result) => assert.match(result.stderr, /cannot authorize the full program/), ["--verify-solo-structure-only"]);
});

test("[solo negative 03] registry version, record kinds, and keys are closed", () => {
  withJsonMutation(securityReceiptTargets[0], (registry) => {
    registry.schemaVersion = 3;
  }, (result) => assert.match(result.stderr, /unsupported schemaVersion/), ["--verify-solo-structure-only"]);
  withSoloRecordMutation((record) => {
    record.recordKind = "generic-owner-amendment";
    record.unreviewed = true;
  }, (result) => {
    assert.match(result.stderr, /recordKind drift/);
    assert.match(result.stderr, /unknown key unreviewed/);
  });
});

test("[solo negative 04] timestamps and renewal are exact and bounded", () => {
  withSoloRecordMutation((record) => {
    record.recordedAt = "2026-08-31";
    record.renewable = true;
  }, (result) => {
    assert.match(result.stderr, /recordedAt drift/);
    assert.match(result.stderr, /renewable drift/);
    assert.match(result.stderr, /timestamps must be canonical/);
  });
});

test("[solo negative 05] same-human, implied, or present assignments fail", () => {
  withSoloRecordMutation((record) => {
    record.roleAvailability[0].assignmentRecordPresent = true;
    record.roleAvailability[0].humanActorId = "person:devin-wiggins";
    record.roleAvailability[0].escalationActorId = "person:devin-wiggins";
  }, (result) => assert.match(result.stderr, /roleAvailability\[0\]: exact value drift/));
});

test("[solo negative 06] unavailable tokens and false values are exact", () => {
  withSoloRecordMutation((record) => {
    record.independentHumanReview.status = "not-available";
    record.independentHumanReview.satisfied = true;
  }, (result) => assert.match(result.stderr, /independentHumanReview: exact value drift/));
});

test("[solo negative 07] governing requirements cannot be claimed satisfied", () => {
  withSoloRecordMutation((record) => {
    record.requirementExceptions[1].satisfactionStatus = "SATISFIED";
    record.requirementExceptions[1].waivedClauses = [];
  }, (result) => assert.match(result.stderr, /requirementExceptions\[1\]: exact value drift/));
});

test("[solo negative 08] every nested artifact and base commit is bound", () => {
  withFileMutation("docs/plans/one-box-master/04-operating-environment/obx-p180/05-security-and-executable-evaluations.md", (text) => `${text}\ndrift\n`, (result) => {
    assert.match(result.stderr, /current hash drift .*05-security-and-executable-evaluations/);
  }, ["--verify-solo-structure-only"]);
  withSoloRecordMutation((record) => {
    record.baseCommit = "66f9afeaaf1e9b37d4bd1ef5437a88e1f6a425bd";
  }, (result) => assert.match(result.stderr, /baseCommit drift/));
});

test("[solo negative 09] exact path equality rejects prefixes, reordering, and additions", () => {
  withSoloRecordMutation((record) => {
    record.allowedPaths.push("src/lib/operatingEnvironment/registry.ts");
  }, (result) => assert.match(result.stderr, /allowedPaths: exact value drift/));
  withSoloRecordMutation((record) => {
    record.allowedPaths.reverse();
  }, (result) => assert.match(result.stderr, /allowedPaths: exact value drift/));
});

test("[solo negative 10] effect or forbidden-capability drift fails", () => {
  withSoloRecordMutation((record) => {
    record.allowedEffects.push("connect-provider");
    record.forbiddenEffects = record.forbiddenEffects.filter((effect) => effect !== "provider-or-model-call");
  }, (result) => {
    assert.match(result.stderr, /allowedEffects: exact value drift/);
    assert.match(result.stderr, /forbiddenEffects: exact value drift/);
  });
});

test("[solo negative 11] amendment identity, hash, and standard-waiver state are fixed", () => {
  withSoloRecordMutation((record) => {
    record.amendmentBinding.digest = "0".repeat(64);
  }, (result) => assert.match(result.stderr, /amendmentBinding: exact value drift/));
  withJsonMutation("docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json", (amendment) => {
    amendment.standardWaiverEligible = true;
  }, (result) => assert.match(result.stderr, /standardWaiverEligible drift/), ["--verify-solo-structure-only"]);
});

test("[solo negative 12] frozen non-waivable governance defaults cannot drift", () => {
  withFileMutation("docs/governance/reviewer-roles.md", (text) => `${text}\nGeneral solo waiver enabled.\n`, (result) => {
    assert.match(result.stderr, /non-waivable governance default drift|current hash drift/);
  }, ["--verify-solo-structure-only"]);
});

test("[solo negative 13] dependency and lockfile changes fail", () => {
  withFileMutation("package-lock.json", (text) => `${text} `, (result) => {
    assert.match(result.stderr, /dependencyBindings: current hash drift package-lock\.json/);
  }, ["--verify-solo-structure-only"]);
});

test("[solo negative 14] authority-manifest fields other than packetDigest remain frozen", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    authority.implementationAuthorized = true;
  }, (result) => assert.match(result.stderr, /authority manifest changed outside packetDigest/), ["--verify-solo-structure-only"]);
});

test("[solo negative 15] parent/evaluation promotion and T02 authority fail", () => {
  withJsonMutation("docs/eval/one-box-program/manifest.json", (manifest) => {
    manifest.evaluations.find((evaluation) => evaluation.id === "PROG-EVAL-COST-001").status = "active";
  }, (result) => assert.match(result.stderr, /parent evaluation PROG-EVAL-COST-001 must remain planned/), ["--verify-solo-structure-only"]);
  withSoloRecordMutation((record) => {
    record.childTicketIds.push("OBX-P180-T02");
  }, (result) => assert.match(result.stderr, /childTicketIds: exact value drift/));
});

test("[solo negative 16] missing or drifted exact receipts fail", () => {
  withExactReceiptChain(() => {
    const validResult = run(["--verify-solo-receipts-only"]);
    assert.equal(validResult.status, 0, validResult.stderr);
    for (const receiptPath of [securityReceiptPath, grokReceiptPath, fableReceiptPath]) {
      const absolute = resolve(fixtureRoot, receiptPath);
      const original = readFileSync(absolute);
      try {
        rmSync(absolute);
        const missingResult = run(["--verify-solo-receipts-only"]);
        assert.notEqual(missingResult.status, 0);
        assert.match(missingResult.stderr, new RegExp(`missing non-symlink regular file ${receiptPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
        assert.match(missingResult.stderr, /required receipt is unavailable/);
      } finally {
        writeFileSync(absolute, original);
      }
    }
    withJsonMutation(grokReceiptPath, (receipt) => {
      receipt.verdict = "CLEAN";
      receipt.findings.push({ findingId: "EXTRA", severity: "LOW", status: "OPEN" });
    }, (result) => {
      assert.match(result.stderr, /verdict must be PASS-WITH-ACCEPTED-RISK/);
      assert.match(result.stderr, /findings must contain the sole accepted separation finding/);
    }, ["--verify-solo-receipts-only"]);
  });
});

test("[solo negative 17] authorization self-hash mismatch fails", () => {
  withSoloRecordMutation((record) => {
    record.authorizationHash.digest = "0".repeat(64);
  }, (result) => assert.match(result.stderr, /authorization self-hash mismatch/), { rehash: false });
});

test("[solo negative 18] extra committed or untracked paths fail source scope", () => {
  const registry = JSON.parse(readFileSync(resolve(fixtureRoot, securityReceiptTargets[0]), "utf8"));
  const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T01-SOLO-001");
  const result = run(["--verify-solo-source-scope-only"], {
    SOLO_COMMITTED_CHANGED_PATHS_JSON: JSON.stringify([...record.activationWriteSet, "docs/audits/unlisted.json"]),
    SOLO_UNTRACKED_ROWS_JSON: JSON.stringify(record.preExistingUntrackedBaseline),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /committedChangedPaths: exact value drift/);
});

test("[solo negative 19] an otherwise-valid authorization fails strictly after expiresAt", () => {
  const registry = JSON.parse(readFileSync(resolve(fixtureRoot, securityReceiptTargets[0]), "utf8"));
  const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T01-SOLO-001");
  const evaluationTime = Date.parse(record.expiresAt) + 1;
  const result = run(["--verify-solo-structure-only"], fixedEvaluationTimeEnvironment(evaluationTime));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /authorization is expired/);
  assert.match(result.stderr, /amendment is expired/);
  const nonExpiryFailures = result.stderr.split("\n").filter((line) => line.startsWith("FAIL ") && !line.includes("expired"));
  assert.deepEqual(nonExpiryFailures, []);
});

test("JSON null cannot bypass authority validation", () => {
  withFileMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", () => "null\n", (result) => {
    assert.match(result.stderr, /top level must be a JSON object/);
  });
});

test("empty manifests cannot produce a vacuous success", () => {
  withFileMutation("docs/tickets/one-box-program/manifest.json", () => "{}\n", (result) => {
    assert.match(result.stderr, /unsupported schemaVersion/);
    assert.match(result.stderr, /tickets must be a non-empty array/);
  });
});

test("an audit cannot be promoted to primary authority", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    authority.domains["release-1"].primaryPath = "docs/audits/grok-4.6/2026-08-29-one-box-technology-master-plan-audit.md";
    authority.domains["release-1"].authorityClass = "owner-approved";
    authority.domains["release-1"].implementationAuthorized = true;
  }, (result) => {
    assert.match(result.stderr, /primaryPath drift/);
    assert.match(result.stderr, /docs\/audits\/ cannot be a primary authority/);
    assert.match(result.stderr, /cannot authorize implementation/);
  });
});

test("a planning domain cannot enable implementation", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    authority.domains["operating-environment"].implementationAuthorized = true;
  }, (result) => assert.match(result.stderr, /cannot authorize implementation/));
});

test("the scoped implementation authorization registry is required", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    delete authority.scopedImplementationAuthorityPath;
  }, (result) => assert.match(result.stderr, /missing scopedImplementationAuthorityPath/));
});

test("the scoped authorization registry rejects unknown keys", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.implementationAuthorized = true;
  }, (result) => assert.match(result.stderr, /registry: unknown key implementationAuthorized/));
});

test("a scoped authorization record rejects unknown keys", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].extendsTickets = ["OBX-P180"];
  }, (result) => assert.match(result.stderr, /OBX-AUTH-ATF-001: unknown key extendsTickets/));
});

test("a scoped authorization scope rejects unknown grants", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].scope.networkAllowed = true;
  }, (result) => assert.match(result.stderr, /OBX-AUTH-ATF-001.scope: unknown key networkAllowed/));
});

test("a scoped authorization review contract rejects unknown fallback fields", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].requiredReview.fallbackModel = "some-provider/model";
  }, (result) => assert.match(result.stderr, /OBX-AUTH-ATF-001.requiredReview: unknown key fallbackModel/));
});

test("a scoped teammate authorization cannot grant mutation or authority effects", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].scope.allowedEffectClasses.push("mutate", "external-effect", "authority");
  }, (result) => assert.match(result.stderr, /only read and propose effects/));
});

test("the authorized foundation record cannot disappear", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations = [];
  }, (result) => assert.match(result.stderr, /authorizations must be a non-empty array/));
});

test("an unknown scoped authorization cannot piggyback on the foundation packet", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations.push({ ...registry.authorizations[0], id: "OBX-AUTH-UNREVIEWED-001" });
  }, (result) => assert.match(result.stderr, /exactly OBX-AUTH-ATF-001/));
});

test("scoped implementation paths reject traversal and glob expansion", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].scope.allowedPathPrefixes.push("../outside/**");
  }, (result) => assert.match(result.stderr, /authorized path must be explicit and repository-relative/));
});

test("the foundation authorization rejects Deep Agents runtime dependencies", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const scope = registry.authorizations[0].scope;
    scope.newRuntimeDependenciesAllowed = true;
    scope.runtimeDependencies = ["deepagents", "@langchain/langgraph"];
  }, (result) => assert.match(result.stderr, /no runtime dependencies/));
});

test("a scoped record cannot authorize the wider operating environment", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].scope.fullProgramAuthorization = true;
  }, (result) => assert.match(result.stderr, /cannot authorize the full program, deployment, or release/));
});

test("the authorized teammate path set cannot drift to provider code", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].scope.allowedExactPaths.push("src/lib/openrouter.ts");
  }, (result) => assert.match(result.stderr, /foundation path scope drift/));
});

test("canonical documentation authorization cannot broaden beyond exact files", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const paths = registry.authorizations[0].scope.allowedExactPaths;
    const index = paths.findIndex((path) => path.startsWith("docs/architecture"));
    if (index === -1) paths.push("docs/architecture/");
    else paths[index] = "docs/architecture/";
  }, (result) => assert.match(result.stderr, /canonical documentation path scope drift/));
});

test("E2E verification harness authorization cannot broaden or drift", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const paths = registry.authorizations[0].scope.allowedExactPaths;
    const index = paths.indexOf("scripts/e2e/canvas-contract.mjs");
    if (index === -1) paths.push("scripts/e2e/");
    else paths[index] = "scripts/e2e/";
  }, (result) => assert.match(result.stderr, /E2E verification harness path scope drift/));
});

test("supporting evidence prefixes must remain date-and-slice bounded", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const prefixes = registry.authorizations[0].scope.supportingEvidencePrefixes;
    const index = prefixes.findIndex((prefix) => prefix.includes("2026-08-30"));
    if (index === -1) prefixes.push("docs/audits/grok-4.6/");
    else prefixes[index] = "docs/audits/grok-4.6/";
  }, (result) => assert.match(result.stderr, /supporting evidence prefixes must remain date-and-slice bounded/));
});

test("the exact supporting evidence prefix set cannot lose an entry", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].scope.supportingEvidencePrefixes.pop();
  }, (result) => assert.match(result.stderr, /supporting evidence prefix set drift/));
});

test("the scoped authorization target must stay bound to its approved specification", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].sourceSpec = "docs/specs/2026-08-16-canvas-upgrade.md";
  }, (result) => assert.match(result.stderr, /source specification binding drift/));
});

test("the foundation authorization pins ticketIds to exactly OBX-AT-001", () => {
  withMultipleFileMutations([
    ["docs/tickets/ai-teammate-foundation/manifest.json", (text) => {
      const manifest = JSON.parse(text);
      manifest.tickets.push({ ...manifest.tickets[0], id: "OBX-AT-002", title: "Connect a provider" });
      return `${JSON.stringify(manifest, null, 2)}\n`;
    }],
    ["docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (text) => {
      const registry = JSON.parse(text);
      registry.authorizations[0].ticketIds.push("OBX-AT-002");
      return `${JSON.stringify(registry, null, 2)}\n`;
    }],
    ["docs/tickets/ai-teammate-foundation/OBX-AT-001.md", (text) => `${text}\nid: OBX-AT-002\n`],
  ], (result) => assert.match(result.stderr, /foundation ticket set must be exactly OBX-AT-001/));
});

test("the operating-environment domain remains draft and unauthorized", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    authority.domains["operating-environment"].authorityClass = "owner-approved";
    authority.domains["operating-environment"].implementationAuthorized = true;
  }, (result) => assert.match(result.stderr, /operating-environment must remain draft and implementationAuthorized=false/));
});

test("OBX-P180 remains proposed while the foundation slice runs", () => {
  withMultipleFileMutations([
    ["docs/tickets/one-box-program/manifest.json", (text) => {
      const manifest = JSON.parse(text);
      manifest.tickets.find((ticket) => ticket.id === "OBX-P180").status = "blocked";
      return `${JSON.stringify(manifest, null, 2)}\n`;
    }],
    ["docs/tickets/one-box-program/OBX-P180.md", (text) => text.replace("status: proposed", "status: blocked")],
  ], (result) => assert.match(result.stderr, /OBX-P180 must remain proposed/));
});

test("OBX-P310 remains blocked while the foundation slice runs", () => {
  withMultipleFileMutations([
    ["docs/tickets/one-box-program/manifest.json", (text) => {
      const manifest = JSON.parse(text);
      manifest.tickets.find((ticket) => ticket.id === "OBX-P310").status = "proposed";
      return `${JSON.stringify(manifest, null, 2)}\n`;
    }],
    ["docs/tickets/one-box-program/OBX-P310.md", (text) => text.replace("status: blocked", "status: proposed")],
  ], (result) => assert.match(result.stderr, /OBX-P310 must remain blocked/));
});

test("the teammate component scope must use a delimited directory", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const prefixes = registry.authorizations[0].scope.allowedPathPrefixes;
    const componentPrefix = prefixes.findIndex((prefix) => prefix.startsWith("src/components/preview/AiTeammate"));
    prefixes[componentPrefix] = "src/components/preview/AiTeammateProvider";
  }, (result) => assert.match(result.stderr, /teammate component path scope must use a delimited directory/));
});

test("the foundation authorization requirement remains exactly E1", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].requirements.push("E2");
  }, (result) => assert.match(result.stderr, /requirements must be exactly E1/));
});

test("the foundation invalidation contract cannot be weakened", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    registry.authorizations[0].invalidators.pop();
  }, (result) => assert.match(result.stderr, /invalidation contract drift/));
});

test("the foundation ticket cannot advance automatically", () => {
  withJsonMutation("docs/tickets/ai-teammate-foundation/manifest.json", (manifest) => {
    manifest.ticketStatusPolicy.automaticTransitionAllowed = true;
  }, (result) => assert.match(result.stderr, /ticket status transition policy drift/));
});

test("a required domain cannot disappear", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    delete authority.domains.canvas;
  }, (result) => assert.match(result.stderr, /missing domain canvas/));
});

test("unknown ticket dependencies fail closed", () => {
  withJsonMutation("docs/tickets/one-box-program/manifest.json", (manifest) => {
    manifest.tickets[0].dependsOn.push("OBX-P999");
  }, (result) => assert.match(result.stderr, /unknown dependency OBX-P999/));
});

test("duplicate ticket IDs fail closed", () => {
  withJsonMutation("docs/tickets/one-box-program/manifest.json", (manifest) => {
    manifest.tickets.push({ ...manifest.tickets[0] });
  }, (result) => assert.match(result.stderr, /duplicate OBX-P100/));
});

test("unknown ticket evaluations and evaluation owners fail closed", () => {
  withJsonMutation("docs/eval/one-box-program/manifest.json", (manifest) => {
    manifest.evaluations[0].ownerTicket = "OBX-P999";
  }, (result) => assert.match(result.stderr, /unknown ownerTicket OBX-P999/));
});

test("unknown adoption decisions cannot enable code use", () => {
  withJsonMutation("docs/research/source-catalog/adoption-ledger.json", (ledger) => {
    ledger.entries[0].decision = "Retain-ish";
    ledger.entries[0].recordCompleteness = "complete";
    ledger.entries[0].codeUseAllowed = true;
  }, (result) => {
    assert.match(result.stderr, /invalid decision Retain-ish/);
    assert.match(result.stderr, /Retain-ish cannot allow use/);
  });
});

test("repository path traversal fails closed", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    authority.domains["release-1"].relatedPaths = ["../outside.md"];
  }, (result) => assert.match(result.stderr, /path must stay relative to the repository/));
});

test("missing EOS traceability rows fail closed", () => {
  withFileMutation("docs/eval/one-box-program/traceability.md", (text) => text.replace(/^\| EOS-019 .*\n/m, ""), (result) => {
    assert.match(result.stderr, /EOS-019 must have exactly one table row/);
  });
});

test("missing front-door tokens fail closed", () => {
  withFileMutation("AGENTS.md", (text) => text.replaceAll("docs/plans/one-box-master/00-authority/authority-manifest.json", "missing-authority-manifest.json"), (result) => {
    assert.match(result.stderr, /missing authority-manifest front door/);
  });
});

test("broken local links in contributor surfaces fail closed", () => {
  withFileMutation("CONTRIBUTING.md", (text) => `${text}\n[broken](docs/does-not-exist.md)\n`, (result) => {
    assert.match(result.stderr, /broken or external local link/);
  });
});

test("broken local links in architecture documentation fail closed", () => {
  withFileMutation("docs/architecture/README.md", (text) => `${text}\n[broken](../does-not-exist.md)\n`, (result) => {
    assert.match(result.stderr, /broken or external local link/);
  });
});

test("symlinked packet files cannot escape the repository", () => {
  const outside = resolve(dirname(fixtureRoot), "one-box-plan-outside.txt");
  const link = resolve(fixtureRoot, "docs/escape-link.md");
  writeFileSync(outside, "outside\n");
  symlinkSync(outside, link);
  try {
    withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
      authority.domains["release-1"].relatedPaths = ["docs/escape-link.md"];
    }, (result) => assert.match(result.stderr, /missing non-symlink regular file/));
  } finally {
    rmSync(link, { force: true });
    rmSync(outside, { force: true });
  }
});

test("the embedded-browser closure register is a required digest-covered authority path", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    const domain = authority.domains["embedded-browser"];
    domain.relatedPaths = (domain.relatedPaths ?? []).filter((path) => path !== "docs/security/2026-08-29-embedded-browser-closure-requirements.md");
  }, (result) => assert.match(result.stderr, /embedded-browser: missing required related path .*embedded-browser-closure-requirements/));
});

test("every ticket requirement is covered by at least one linked evaluation", () => {
  withJsonMutation("docs/eval/one-box-program/manifest.json", (manifest) => {
    const evaluation = manifest.evaluations.find((candidate) => candidate.id === "PROG-EVAL-AUTH-001");
    evaluation.requirements = evaluation.requirements.filter((requirement) => requirement !== "EOS-001");
  }, (result) => assert.match(result.stderr, /OBX-P100: requirement EOS-001 is not covered by linked evaluations/));
});

test("evaluation ownership cannot depend back on the consuming ticket", () => {
  withMultipleFileMutations([
    ["docs/tickets/one-box-program/manifest.json", (text) => {
      const manifest = JSON.parse(text);
      manifest.tickets.find((ticket) => ticket.id === "OBX-P100").evaluations.push("PROG-EVAL-LIFE-001");
      return `${JSON.stringify(manifest, null, 2)}\n`;
    }],
    ["docs/tickets/one-box-program/OBX-P100.md", (text) => text.replace("evaluations: PROG-EVAL-AUTH-001, PROG-EVAL-TEST-001", "evaluations: PROG-EVAL-AUTH-001, PROG-EVAL-TEST-001, PROG-EVAL-LIFE-001")],
  ], (result) => assert.match(result.stderr, /OBX-P100: evaluation PROG-EVAL-LIFE-001 owner OBX-P110 depends on its consuming ticket/));
});

test("traceability rows reject evaluations that do not cover their requirement", () => {
  withFileMutation("docs/eval/one-box-program/traceability.md", (text) => text.replace("| EOS-001 authority map | PROG-EVAL-AUTH-001 |", "| EOS-001 authority map | PROG-EVAL-APPT-001 |"), (result) => {
    assert.match(result.stderr, /program traceability: EOS-001 evaluation PROG-EVAL-APPT-001 does not cover EOS-001/);
  });
});

test("CI action references must be immutable full commit SHAs", () => {
  withFileMutation(".github/workflows/ci.yml", (text) => text.replace(/uses: actions\/checkout@[a-f0-9]{40}/, "uses: actions/checkout@v6"), (result) => {
    assert.match(result.stderr, /ci workflow: actions\/checkout must use a full commit SHA/);
  });
});

test("governance policies are machine-readable and fail closed", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    delete authority.governancePolicies;
  }, (result) => assert.match(result.stderr, /authority manifest: missing governancePolicies/));
});

test("owner-approved acceptance records use a durable human identity reference", () => {
  withJsonMutation("docs/plans/one-box-master/00-authority/authority-manifest.json", (authority) => {
    delete authority.domains.canvas.acceptanceRecord.identityRef;
  }, (result) => assert.match(result.stderr, /canvas: owner-approved class requires durable human identityRef and role/));
});
