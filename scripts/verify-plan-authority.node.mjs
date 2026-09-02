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
const untrackedBaselinePath = ".claude/handoffs/one-box-operating-environment-next-phase.md";
let fixtureRoot;
let verifier;

before(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "one-box-plan-verifier-"));
  for (const path of ["docs", ".github", "src"]) cpSync(resolve(sourceRoot, path), resolve(fixtureRoot, path), { recursive: true });
  for (const path of ["AGENTS.md", "README.md", "CONTRIBUTING.md", ".env.example", "package.json"]) cpSync(resolve(sourceRoot, path), resolve(fixtureRoot, path));
  cpSync(resolve(sourceRoot, "package-lock.json"), resolve(fixtureRoot, "package-lock.json"));
  mkdirSync(resolve(fixtureRoot, ".claude/handoffs"), { recursive: true });
  // The untracked baseline is a local-machine file; CI checkouts do not hold it.
  if (existsSync(resolve(sourceRoot, untrackedBaselinePath))) {
    cpSync(resolve(sourceRoot, untrackedBaselinePath), resolve(fixtureRoot, untrackedBaselinePath));
  }
  mkdirSync(resolve(fixtureRoot, "scripts"), { recursive: true });
  for (const path of ["verify-plan-authority.mjs", "verify-plan-authority.node.mjs", "verify-p180-t02-authorization.mjs", "verify-r1-phase-authorization.mjs"]) {
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

function runSoloT02Structure() {
  return run(["--verify-solo-t02-structure-only"]);
}

function runSoloT02Receipt() {
  return run(["--verify-solo-t02-receipt-only"]);
}

function withFileMutation(path, mutate, assertion, args = [], extraEnv = {}) {
  const absolute = resolve(fixtureRoot, path);
  const original = readFileSync(absolute, "utf8");
  try {
    const replacement = mutate(original);
    if (typeof replacement === "string") writeFileSync(absolute, replacement);
    const result = run(args, extraEnv);
    assert.notEqual(result.status, 0, `mutation unexpectedly passed\n${result.stdout}\n${result.stderr}`);
    assertion(result);
  } finally {
    writeFileSync(absolute, original);
  }
}

function withJsonMutation(path, mutate, assertion, args = [], extraEnv = {}) {
  withFileMutation(path, (text) => {
    const value = JSON.parse(text);
    mutate(value);
    return `${JSON.stringify(value, null, 2)}\n`;
  }, assertion, args, extraEnv);
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

function withSoloRecordMutation(mutate, assertion, { rehash = true, args = ["--verify-solo-structure-only"], env = {} } = {}) {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T01-SOLO-001");
    mutate(record, registry);
    if (rehash) rehashSoloRecord(registry);
  }, assertion, args, env);
}

function rehashSoloT02Record(registry) {
  const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T02-SOLO-001");
  const unhashed = structuredClone(record);
  delete unhashed.authorizationHash.digest;
  record.authorizationHash.digest = createHash("sha256").update(canonicalJson(unhashed)).digest("hex");
}

function withSoloT02RecordMutation(mutate, assertion, { rehash = true } = {}) {
  withJsonMutation("docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json", (registry) => {
    const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T02-SOLO-001");
    mutate(record, registry);
    if (rehash) rehashSoloT02Record(registry);
  }, assertion, ["--verify-solo-t02-structure-only"]);
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
const t02SecurityReceiptPath = "docs/audits/evidence/security/2026-08-31-obx-p180-t02-solo-authorization-security-review.json";
const securityReceiptTargets = [
  "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json",
  "docs/plans/one-box-master/00-authority/authority-manifest.json",
  "docs/governance/risk-exceptions/2026-08-30-obx-p180-t01-solo.json",
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
];

function withExactReceiptChain(callback) {
  callback();
}

test("the current non-empty packet passes discriminated structure verification", () => {
  const result = runSoloStructure();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Solo T01 authorization self-hash: [a-f0-9]{64}/);
  assert.match(result.stdout, /structure and frozen bindings/);
});

test("the exact solo T02 authorization passes focused structure verification", () => {
  const result = runSoloT02Structure();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS Solo T02 structure and frozen bindings/);
});

test("the frozen solo T01 receipt chain survives later verifier evolution", () => {
  const result = run(["--verify-solo-receipts-only"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS Solo T01 exact receipt chain/);
  const verifierSource = readFileSync(resolve(fixtureRoot, "scripts/verify-plan-authority.mjs"), "utf8");
  for (const path of [securityReceiptPath, grokReceiptPath, fableReceiptPath]) {
    const digest = createHash("sha256").update(readFileSync(resolve(fixtureRoot, path))).digest("hex");
    assert.ok(verifierSource.includes(digest), `${path} is no longer the byte-pinned T01 receipt`);
  }
});

test("the solo T02 authorization rejects path, order, and effect expansion", () => {
  withSoloT02RecordMutation((record) => {
    record.allowedPaths.push("src/lib/operatingEnvironment/provider.ts");
    record.allowedEffects.push("connect-provider");
  }, (result) => {
    assert.match(result.stderr, /allowedPaths: exact value drift/);
    assert.match(result.stderr, /allowedEffects: exact value drift/);
  });
  withSoloT02RecordMutation((record) => record.allowedPaths.reverse(), (result) => {
    assert.match(result.stderr, /allowedPaths: exact value drift/);
  });
});

test("the solo T02 authorization rejects fake roles and wider ticket authority", () => {
  withSoloT02RecordMutation((record) => {
    record.roleAvailability[0].assignmentRecordPresent = true;
    record.roleAvailability[0].humanActorId = "person:devin-wiggins";
    record.childTicketIds.push("OBX-P180-T03");
  }, (result) => {
    assert.match(result.stderr, /roleAvailability: exact value drift/);
    assert.match(result.stderr, /childTicketIds: exact value drift/);
  });
});

test("the solo T02 authorization rejects predecessor, model-route, and renewal drift", () => {
  withSoloT02RecordMutation((record) => {
    record.predecessorBinding.checkpointCommit = "0".repeat(40);
    record.reviewProtocol.quickAuditModel = "z-ai/glm-latest";
    record.renewable = true;
  }, (result) => {
    assert.match(result.stderr, /predecessorBinding: exact value drift/);
    assert.match(result.stderr, /reviewProtocol: exact value drift/);
    assert.match(result.stderr, /renewable drift/);
  });
});

test("the solo T02 authorization rejects a forged self-hash", () => {
  withSoloT02RecordMutation((record) => {
    record.authorizationHash.digest = "0".repeat(64);
  }, (result) => assert.match(result.stderr, /authorization self-hash mismatch/), { rehash: false });
});

test("the exact solo T02 security receipt passes focused verification", () => {
  const result = runSoloT02Receipt();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS Solo T02 exact security receipt/);
});

test("the solo T02 security receipt rejects target-hash and review drift", () => {
  withJsonMutation(t02SecurityReceiptPath, (receipt) => {
    receipt.targetHashes[0].digest = "0".repeat(64);
    receipt.independentHumanReview.satisfied = true;
  }, (result) => {
    assert.match(result.stderr, /current hash drift/);
    assert.match(result.stderr, /independentHumanReview: exact value drift/);
  }, ["--verify-solo-t02-receipt-only"]);
});

test("the solo T02 security receipt rejects extra findings and surface loss", () => {
  withJsonMutation(t02SecurityReceiptPath, (receipt) => {
    receipt.findings.push({ findingId: "EXTRA", severity: "LOW", status: "OPEN" });
    receipt.findings[0].surfaceDisposition.pop();
  }, (result) => {
    assert.match(result.stderr, /sole accepted separation finding required/);
  }, ["--verify-solo-t02-receipt-only"]);
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
  }, (result) => {
    assert.match(result.stderr, /later authorization ids must match/);
    assert.match(result.stderr, /unknown authorization OBX-AUTH-UNREVIEWED-001/);
  });
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

function runWithEnvironment(args, mutateEnvironment) {
  const environment = { ...process.env };
  mutateEnvironment(environment);
  return spawnSync(process.execPath, [verifier, ...args], { cwd: fixtureRoot, encoding: "utf8", env: environment });
}

function runOutsideGithubActions(args = []) {
  return runWithEnvironment(args, (environment) => {
    delete environment.GITHUB_ACTIONS;
  });
}

function runInsideGithubActions(args = []) {
  return runWithEnvironment(args, (environment) => {
    environment.GITHUB_ACTIONS = "true";
  });
}

function withUntrackedBaseline(content, callback) {
  const absolute = resolve(fixtureRoot, untrackedBaselinePath);
  const original = existsSync(absolute) ? readFileSync(absolute) : null;
  try {
    if (content === null) rmSync(absolute, { force: true });
    else writeFileSync(absolute, content);
    callback();
  } finally {
    if (original === null) rmSync(absolute, { force: true });
    else writeFileSync(absolute, original);
  }
}

test("solo T01 structure reads the untracked baseline outside GitHub Actions", () => {
  withUntrackedBaseline(null, () => {
    const result = runOutsideGithubActions(["--verify-solo-structure-only"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /preExistingUntrackedBaseline: current hash drift/);
  });
});

test("a drifted untracked baseline fails outside GitHub Actions", () => {
  withUntrackedBaseline("drifted baseline\n", () => {
    const result = runOutsideGithubActions(["--verify-solo-structure-only"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /preExistingUntrackedBaseline: current hash drift/);
  });
});

test("solo T01 structure keeps the exact baseline record but skips the file read under GITHUB_ACTIONS", () => {
  withUntrackedBaseline(null, () => {
    const result = runInsideGithubActions(["--verify-solo-structure-only"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /NOTE untracked baseline read skipped under GITHUB_ACTIONS/);
  });
  withSoloRecordMutation((record) => {
    record.preExistingUntrackedBaseline[0].digest = "0".repeat(64);
  }, (result) => assert.match(result.stderr, /preExistingUntrackedBaseline: exact value drift/), { env: { GITHUB_ACTIONS: "true" } });
});

test("the full verifier passes under GITHUB_ACTIONS without the untracked baseline", () => {
  withUntrackedBaseline(null, () => {
    const result = runInsideGithubActions([]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Plan authority verification passed/);
  });
});

const registryPath = "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json";
const authorityManifestPath = "docs/plans/one-box-master/00-authority/authority-manifest.json";
const r1PhaseIds = ["OBX-AUTH-R1-P1-SOLO-001", "OBX-AUTH-R1-P2-SOLO-001"];

function rehashR1PhaseRecord(registry, id) {
  const record = registry.authorizations.find((candidate) => candidate.id === id);
  const unhashed = structuredClone(record);
  delete unhashed.authorizationHash.digest;
  record.authorizationHash.digest = createHash("sha256").update(canonicalJson(unhashed)).digest("hex");
}

function withR1PhaseRecordMutation(id, mutate, assertion, { rehash = true, env = {} } = {}) {
  withJsonMutation(registryPath, (registry) => {
    const record = registry.authorizations.find((candidate) => candidate.id === id);
    mutate(record, registry);
    if (rehash) rehashR1PhaseRecord(registry, id);
  }, assertion, [], { GITHUB_ACTIONS: "true", ...env });
}

test("the release-1 phase authorization records pass the full verifier", () => {
  const result = run([], { GITHUB_ACTIONS: "true" });
  assert.equal(result.status, 0, result.stderr);
  const registry = JSON.parse(readFileSync(resolve(fixtureRoot, registryPath), "utf8"));
  assert.deepEqual(
    registry.authorizations.map((record) => record.id),
    ["OBX-AUTH-ATF-001", "OBX-AUTH-P180-T01-SOLO-001", "OBX-AUTH-P180-T02-SOLO-001", ...r1PhaseIds],
  );
});

test("a fourth authorization with a non-pattern id cannot join the registry", () => {
  withJsonMutation(registryPath, (registry) => {
    const phase = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-R1-P1-SOLO-001");
    registry.authorizations.push({ ...structuredClone(phase), id: "OBX-AUTH-R1-P9-SOLO-001" });
  }, (result) => {
    assert.match(result.stderr, /later authorization ids must match/);
    assert.match(result.stderr, /unknown authorization OBX-AUTH-R1-P9-SOLO-001/);
  }, [], { GITHUB_ACTIONS: "true" });
});

test("a release-1 phase record cannot touch a non-waivable class", () => {
  withR1PhaseRecordMutation("OBX-AUTH-R1-P1-SOLO-001", (record) => {
    record.nonWaivableClassesTouched = ["secrets-privacy"];
  }, (result) => {
    assert.match(result.stderr, /nonWaivableClassesTouched: non-waivable class secrets-privacy cannot be waived/);
  });
});

test("a release-1 phase record rejects broad path scope", () => {
  withR1PhaseRecordMutation("OBX-AUTH-R1-P1-SOLO-001", (record) => {
    record.allowedPaths[0] = "src/lib/";
  }, (result) => {
    assert.match(result.stderr, /authorized path must be explicit and repository-relative/);
  });
  withR1PhaseRecordMutation("OBX-AUTH-R1-P2-SOLO-001", (record) => {
    record.ticketScopes[1].allowedPaths[0] = "src/**/*.ts";
  }, (result) => {
    assert.match(result.stderr, /authorized path must be explicit and repository-relative/);
  });
  for (const bareDirectory of ["src/lib", "src/app/api", "docs/plans", "src"]) {
    withR1PhaseRecordMutation("OBX-AUTH-R1-P1-SOLO-001", (record) => {
      record.allowedPaths[0] = bareDirectory;
      record.ticketScopes[0].allowedPaths[0] = bareDirectory;
    }, (result) => {
      assert.match(result.stderr, /authorized path must be explicit and repository-relative/);
    });
  }
});

test("a release-1 phase record fails closed when a frozen registry record expires", () => {
  const registry = JSON.parse(readFileSync(resolve(fixtureRoot, registryPath), "utf8"));
  const t02 = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T02-SOLO-001");
  const result = run([], {
    ...fixedEvaluationTimeEnvironment(Date.parse(t02.expiresAt) + 1),
    GITHUB_ACTIONS: "true",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /frozen record OBX-AUTH-P180-T02-SOLO-001 in the registry is expired/);
});

test("a release-1 phase record cannot re-pin the frozen dependency graph", () => {
  withR1PhaseRecordMutation("OBX-AUTH-R1-P1-SOLO-001", (record) => {
    record.dependencyBindings[0].digest = "0".repeat(64);
  }, (result) => {
    assert.match(result.stderr, /dependencyBindings: exact value drift/);
  });
  withR1PhaseRecordMutation("OBX-AUTH-R1-P2-SOLO-001", (record) => {
    record.governanceBindings[1].digest = "0".repeat(64);
  }, (result) => {
    assert.match(result.stderr, /governanceBindings: exact value drift/);
  });
});

test("an expired release-1 phase record cannot authorize implementation", () => {
  const registry = JSON.parse(readFileSync(resolve(fixtureRoot, registryPath), "utf8"));
  const record = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-R1-P1-SOLO-001");
  const result = run([], {
    ...fixedEvaluationTimeEnvironment(Date.parse(record.expiresAt) + 1),
    GITHUB_ACTIONS: "true",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OBX-AUTH-R1-P1-SOLO-001: authorization is expired/);
  assert.match(result.stderr, /OBX-AUTH-R1-P2-SOLO-001: authorization is expired/);
});

test("a forged release-1 phase self-hash fails", () => {
  withR1PhaseRecordMutation("OBX-AUTH-R1-P1-SOLO-001", (record) => {
    record.authorizationHash.digest = "f".repeat(64);
  }, (result) => {
    assert.match(result.stderr, /OBX-AUTH-R1-P1-SOLO-001: authorization self-hash mismatch/);
  }, { rehash: false });
});

test("the first three authorization records cannot be removed or reordered", () => {
  withJsonMutation(registryPath, (registry) => {
    registry.authorizations = registry.authorizations.filter((record) => record.id !== "OBX-AUTH-P180-T01-SOLO-001");
  }, (result) => {
    assert.match(result.stderr, /records must begin with OBX-AUTH-ATF-001/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(registryPath, (registry) => {
    const [atf, t01, t02, ...rest] = registry.authorizations;
    registry.authorizations = [t01, atf, t02, ...rest];
  }, (result) => {
    assert.match(result.stderr, /records must begin with OBX-AUTH-ATF-001/);
  }, [], { GITHUB_ACTIONS: "true" });
});

test("a release-1 phase record fails closed on a missing or stale security receipt", () => {
  const receiptPath = "docs/audits/evidence/security/2026-09-02-release-1-p1-solo-authorization-security-review.json";
  withJsonMutation(receiptPath, (receipt) => {
    receipt.targetHashes[0].digest = "0".repeat(64);
  }, (result) => {
    assert.match(result.stderr, /securityReceipt\.targetHashes\[0\]: current hash drift/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(receiptPath, (receipt) => {
    receipt.receiptKind = "solo-t02-security-review-v1";
  }, (result) => {
    assert.match(result.stderr, /securityReceipt: receiptKind drift/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(receiptPath, (receipt) => {
    receipt.authorityManifestWithoutPacketDigest.digest = "0".repeat(64);
  }, (result) => {
    assert.match(result.stderr, /authorityManifestWithoutPacketDigest: current hash drift/);
  }, [], { GITHUB_ACTIONS: "true" });
});

test("a release-1 phase record fails closed on a stale or mislabelled model receipt", () => {
  const modelReceiptPath = "docs/audits/grok-4.6/2026-09-02-release-1-p1-authorization-audit.json";
  withJsonMutation(modelReceiptPath, (receipt) => {
    receipt.providerReportedModel = "openai/gpt-5.6";
  }, (result) => {
    assert.match(result.stderr, /exact model x-ai\/grok-4\.6 required, or a labelled owner-authorized fallback block/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(modelReceiptPath, (receipt) => {
    receipt.targetHashes[0].digest = "0".repeat(64);
  }, (result) => {
    assert.match(result.stderr, /modelReceipt\.targetHashes\[0\]: current hash drift/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(modelReceiptPath, (receipt) => {
    receipt.rawAuditSha256 = "0".repeat(64);
  }, (result) => {
    assert.match(result.stderr, /raw audit hash drift/);
  }, [], { GITHUB_ACTIONS: "true" });
  for (const severity of ["HIGH", "Critical", "Important", "unheard-of"]) {
    withJsonMutation(modelReceiptPath, (receipt) => {
      receipt.verdict = "FINDINGS";
      receipt.findings = [{ severity, file: "x", line: "1", scenario: "s", remediation: "r" }];
    }, (result) => {
      assert.match(result.stderr, /modelReceipt\.findings\[0\]/);
    }, [], { GITHUB_ACTIONS: "true" });
  }
});

test("a missing release-1 model receipt fails closed", () => {
  const modelReceiptPath = "docs/audits/grok-4.6/2026-09-02-release-1-p2-authorization-audit.json";
  const absolute = resolve(fixtureRoot, modelReceiptPath);
  const original = readFileSync(absolute);
  try {
    rmSync(absolute, { force: true });
    const result = run([], { GITHUB_ACTIONS: "true" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /modelReceipt: missing non-symlink regular file/);
  } finally {
    writeFileSync(absolute, original);
  }
});

test("a recorded phase authorization must carry the grant and its activation gate", () => {
  for (const id of r1PhaseIds) {
    withR1PhaseRecordMutation(id, (record) => {
      record.implementationAuthorized = false;
    }, (result) => {
      assert.match(result.stderr, new RegExp(`${id}: a recorded phase authorization must authorize implementation`));
    });
  }
  withR1PhaseRecordMutation("OBX-AUTH-R1-P2-SOLO-001", (record) => {
    record.activationPrecondition = null;
  }, (result) => {
    assert.match(result.stderr, /OBX-AUTH-R1-P2-SOLO-001\.activationPrecondition: exact value drift/);
  });
  withR1PhaseRecordMutation("OBX-AUTH-R1-P1-SOLO-001", (record) => {
    record.activationPrecondition = { predecessorAuthorizationId: "OBX-AUTH-R1-P2-SOLO-001" };
  }, (result) => {
    assert.match(result.stderr, /a phase with no predecessor must record null/);
  });
  withR1PhaseRecordMutation("OBX-AUTH-R1-P2-SOLO-001", (record) => {
    record.predecessorBinding.checkpointCommit = "0".repeat(40);
  }, (result) => {
    assert.match(result.stderr, /a pending predecessor cannot name a checkpoint commit/);
  });
  withJsonMutation(registryPath, (registry) => {
    registry.authorizations = registry.authorizations.filter((record) => record.id !== "OBX-AUTH-R1-P1-SOLO-001");
  }, (result) => {
    assert.match(result.stderr, /predecessor authorization OBX-AUTH-R1-P1-SOLO-001 is missing from the registry/);
  }, [], { GITHUB_ACTIONS: "true" });
});

test("a non-renewable phase record must disclose the earlier effective expiry", () => {
  withR1PhaseRecordMutation("OBX-AUTH-R1-P1-SOLO-001", (record) => {
    record.effectiveWindow.effectiveExpiresAt = record.expiresAt;
  }, (result) => {
    assert.match(result.stderr, /effectiveExpiresAt must equal the earliest frozen registry expiry 2026-09-14T13:33:33Z/);
  });
  withR1PhaseRecordMutation("OBX-AUTH-R1-P2-SOLO-001", (record) => {
    record.effectiveWindow.effectiveExpirySource = "OBX-AUTH-P180-T02-SOLO-001";
  }, (result) => {
    assert.match(result.stderr, /effectiveExpirySource must name OBX-AUTH-P180-T01-SOLO-001/);
  });
  withR1PhaseRecordMutation("OBX-AUTH-R1-P1-SOLO-001", (record) => {
    record.effectiveWindow.effectiveExpiryReason = "";
  }, (result) => {
    assert.match(result.stderr, /effectiveExpiryReason must state why the window closes early/);
  });
});

test("a model receipt must be a faithful derivation of the raw audit it wraps", () => {
  const modelReceiptPath = "docs/audits/grok-4.6/2026-09-02-release-1-p1-authorization-audit.json";
  withJsonMutation(modelReceiptPath, (receipt) => {
    receipt.capturedAt = "2026-09-02T00:00:00.000Z";
  }, (result) => {
    assert.match(result.stderr, /modelReceipt: capturedAt does not match the raw audit/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(modelReceiptPath, (receipt) => {
    receipt.diffBytes += 1;
  }, (result) => {
    assert.match(result.stderr, /modelReceipt: diffBytes does not match the raw audit/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(modelReceiptPath, (receipt) => {
    receipt.auditedHeadCommit = "0".repeat(40);
  }, (result) => {
    assert.match(result.stderr, /modelReceipt: auditedHeadCommit does not match the raw audit/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(modelReceiptPath, (receipt) => {
    receipt.reviewedFiles = receipt.reviewedFiles.slice(1);
  }, (result) => {
    assert.match(result.stderr, /modelReceipt\.reviewedFiles: exact value drift/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(modelReceiptPath, (receipt) => {
    receipt.auditedTreeDelta = [];
  }, (result) => {
    assert.match(result.stderr, /modelReceipt\.auditedTreeDelta: exact value drift/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(modelReceiptPath, (receipt) => {
    receipt.authorityManifestWithoutPacketDigest.digest = "0".repeat(64);
  }, (result) => {
    assert.match(result.stderr, /modelReceipt\.authorityManifestWithoutPacketDigest: current hash drift/);
  }, [], { GITHUB_ACTIONS: "true" });
});

test("the first three authorization records are pinned as bytes, not only as hashes", () => {
  withFileMutation(registryPath, (text) => {
    const registry = JSON.parse(text);
    return `${JSON.stringify(registry, null, 2)}\n`;
  }, (result) => {
    assert.match(result.stderr, /the first three records are no longer byte-identical to 4b02f75ff8954ee09b1c58d4e16a600f6fe4ca41/);
  }, [], { GITHUB_ACTIONS: "true" });
});

test("a recorded phase authorization cannot be deleted back to silence", () => {
  for (const id of r1PhaseIds) {
    withJsonMutation(registryPath, (registry) => {
      registry.authorizations = registry.authorizations.filter((record) => record.id !== id);
    }, (result) => {
      assert.match(result.stderr, new RegExp(`recorded phase authorization ${id} is missing from the registry`));
    }, [], { GITHUB_ACTIONS: "true" });
  }
});

test("a pending predecessor fails closed once the predecessor phase lands", () => {
  const created = [
    "src/lib/releaseLifecycle.ts",
    "src/app/api/lifecycle/[id]/route.ts",
    "src/components/preview/LifecycleStatus.tsx",
  ];
  const absolutes = created.map((path) => resolve(fixtureRoot, path));
  try {
    for (const absolute of absolutes) {
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, "export {};\n");
    }
    const result = run([], { GITHUB_ACTIONS: "true" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /predecessor-phase-not-merged is stale; src\/lib\/releaseLifecycle\.ts exists/);
  } finally {
    for (const absolute of absolutes) rmSync(absolute, { force: true });
  }
});

test("a pending predecessor refuses a child ticket in the program manifest", () => {
  withJsonMutation("docs/tickets/one-box-program/manifest.json", (manifest) => {
    const parent = manifest.tickets.find((ticket) => ticket.id === "OBX-P210");
    manifest.tickets.push({ ...structuredClone(parent), id: "OBX-P210-T01" });
  }, (result) => {
    assert.match(result.stderr, /child ticket OBX-P210-T01 cannot exist in the program manifest while OBX-AUTH-R1-P1-SOLO-001 is unmerged/);
  }, [], { GITHUB_ACTIONS: "true" });
});

test("a phase record cannot stand beside a global implementation grant", () => {
  withJsonMutation(authorityManifestPath, (authority) => {
    authority.implementationAuthorized = true;
  }, (result) => {
    assert.match(result.stderr, /authority manifest: release-1 phase authorizations require implementationAuthorized false at the top level/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation("docs/tickets/one-box-program/manifest.json", (manifest) => {
    manifest.implementationAuthorized = true;
  }, (result) => {
    assert.match(result.stderr, /program ticket manifest: release-1 phase authorizations require implementationAuthorized false/);
  }, [], { GITHUB_ACTIONS: "true" });
});

test("a phase record cannot drift from the frozen T02 dependency and governance pin", () => {
  withR1PhaseRecordMutation("OBX-AUTH-R1-P1-SOLO-001", (record, registry) => {
    const t02 = registry.authorizations.find((candidate) => candidate.id === "OBX-AUTH-P180-T02-SOLO-001");
    record.governanceBindings = [...record.governanceBindings].reverse();
    t02.governanceBindings = structuredClone(record.governanceBindings);
  }, (result) => {
    assert.match(result.stderr, /OBX-AUTH-R1-P1-SOLO-001\.governanceBindings: exact value drift/);
  });
  withR1PhaseRecordMutation("OBX-AUTH-R1-P2-SOLO-001", (record) => {
    record.dependencyBindings = [record.dependencyBindings[0]];
  }, (result) => {
    assert.match(result.stderr, /OBX-AUTH-R1-P2-SOLO-001\.dependencyBindings against OBX-AUTH-P180-T02-SOLO-001: exact value drift/);
  });
});

test("a phase record refuses a grant on any other planning domain", () => {
  withJsonMutation(authorityManifestPath, (authority) => {
    authority.domains.canvas.implementationAuthorized = true;
  }, (result) => {
    assert.match(result.stderr, /canvas: release-1 phase authorizations require implementationAuthorized false on every domain/);
  }, [], { GITHUB_ACTIONS: "true" });
});

test("the owner packet acceptance must hash the contracts it accepts", () => {
  const acceptancePath = "docs/governance/acceptances/2026-09-02-release-1-packet-acceptance.json";
  withJsonMutation(acceptancePath, (acceptance) => {
    acceptance.acceptedPaths[0].digest = "0".repeat(64);
  }, (result) => {
    assert.match(result.stderr, /acceptedPaths\[0\]: current hash drift docs\/plans\/one-box-master\/01-foundation\/release-1-contract\.md/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(acceptancePath, (acceptance) => {
    acceptance.acceptedPaths = [acceptance.acceptedPaths[0]];
  }, (result) => {
    assert.match(result.stderr, /acceptedPaths: exact value drift/);
  }, [], { GITHUB_ACTIONS: "true" });
});

test("a phase amendment cannot carry an unlisted grant field", () => {
  withJsonMutation("docs/governance/risk-exceptions/2026-09-02-release-1-p1-solo.json", (amendment) => {
    amendment.globalImplementationAuthorized = true;
  }, (result) => {
    assert.match(result.stderr, /amendment\.keys: exact value drift/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation("docs/governance/risk-exceptions/2026-09-02-release-1-p2-solo.json", (amendment) => {
    amendment.scope.allowedPathPrefixes = ["src/"];
  }, (result) => {
    assert.match(result.stderr, /amendment\.scope\.keys: exact value drift/);
  }, [], { GITHUB_ACTIONS: "true" });
});

test("re-pinning the packet digest cannot invalidate a phase receipt", () => {
  withJsonMutation(authorityManifestPath, (authority) => {
    authority.packetDigest = "0".repeat(64);
  }, (result) => {
    assert.match(result.stderr, /packetDigest mismatch/);
    assert.doesNotMatch(result.stderr, /authorityManifestWithoutPacketDigest: current hash drift/);
    assert.doesNotMatch(result.stderr, /modelReceipt\.targetHashes\[\d+\]: current hash drift docs\/plans\/one-box-master\/00-authority\/authority-manifest\.json/);
  }, [], { GITHUB_ACTIONS: "true" });
});

test("a release-1 phase amendment cannot drift from its record", () => {
  const amendmentPath = "docs/governance/risk-exceptions/2026-09-02-release-1-p1-solo.json";
  withJsonMutation(amendmentPath, (amendment) => {
    amendment.renewable = true;
  }, (result) => {
    assert.match(result.stderr, /amendment: renewable drift/);
    assert.match(result.stderr, /amendment: SHA-256 drift/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(amendmentPath, (amendment) => {
    amendment.ownerDirection.recordedAt = "2026-09-01T13:00:00Z";
  }, (result) => {
    assert.match(result.stderr, /amendment\.ownerDirection: exact owner decision drift/);
  }, [], { GITHUB_ACTIONS: "true" });
  withR1PhaseRecordMutation("OBX-AUTH-R1-P1-SOLO-001", (record) => {
    record.renewable = true;
  }, (result) => {
    assert.match(result.stderr, /OBX-AUTH-R1-P1-SOLO-001: renewable drift/);
  });
  withR1PhaseRecordMutation("OBX-AUTH-R1-P1-SOLO-001", (record) => {
    record.expiresAt = "2026-09-17T13:00:00Z";
  }, (result) => {
    assert.match(result.stderr, /expiry must be exactly 336 hours/);
  });
});

test("release-1 cannot fall back to proposed while the phase records stand", () => {
  withJsonMutation(authorityManifestPath, (authority) => {
    authority.domains["release-1"].authorityClass = "proposed";
  }, (result) => {
    assert.match(result.stderr, /release-1: authorityClass drift; expected owner-approved/);
  }, [], { GITHUB_ACTIONS: "true" });
  withJsonMutation(authorityManifestPath, (authority) => {
    authority.domains.compatibility.authorityClass = "proposed";
  }, (result) => {
    assert.match(result.stderr, /compatibility: authorityClass drift; expected owner-approved/);
  }, [], { GITHUB_ACTIONS: "true" });
});
