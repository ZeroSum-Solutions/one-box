#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const TERMINAL_PROGRAM_AUTHORIZATION_ID = "OBX-AUTH-P180-PHASE1-TERMINAL-CORRECTION-003";
export const T03_TERMINAL_AUTHORIZATION_ID = "OBX-AUTH-P180-T03-TERMINAL-CORRECTION-003";
export const T04_TERMINAL_AUTHORIZATION_ID = "OBX-AUTH-P180-T04-TERMINAL-CORRECTION-003";
export const TERMINAL_BASE_COMMIT = "c09dfd0cf5dd39578397c50f66741fbcd591bb66";
export const TERMINAL_BASE_TREE = "ab07eb062b777068d57af2a9bf2f312fb5d451fd";
export const TERMINAL_OWNER_DIRECTION_SHA256 = "a47ef38b2e90d98a269f4e2a5bce958e4e27196395c2cf4a23c43025f4fbc7ed";
export const TERMINAL_ACTIVATION_ALLOWLIST_SHA256 = "8dbaf7a4dc8dc3ed752d268b70e42c6fcecfc65e4622cceb3d0d1bc7f13cd08e";
export const TERMINAL_EXECUTION_BRANCH = "feat/obx-p180-terminal-correction-003";
const TRUSTED_GIT_PATH = "/usr/bin/git";
const TRUSTED_STAT_PATH = "/usr/bin/stat";

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const DEFAULT_GOAL_ROOT = "/Users/zero-suminc./.claude/goal-state/obx-p180-t03-t05-offline-wave";
const REGISTRY_NAME = "phase1-terminal-correction-proof-registry.jsonl";
const SCOPED_REGISTRY_PATH = "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json";
const PROGRAM_PATH = "docs/governance/risk-exceptions/2026-09-01-obx-p180-phase1-terminal-correction-program.json";
const SECURITY_PATH = "docs/audits/evidence/security/2026-09-01-obx-p180-phase1-terminal-correction-security-review.json";
const REPIN_PATH = "docs/audits/evidence/security/2026-09-01-obx-p180-phase1-terminal-correction-authority-repin.json";
const MANIFEST_PATH = "docs/plans/one-box-master/00-authority/authority-manifest.json";
const ZERO_HASH = "0".repeat(64);

const GOVERNANCE_PATHS = [
  "scripts/verify-p180-phase1-correction-authorization.mjs",
  "scripts/verify-p180-phase1-superseding-correction-authorization.mjs",
  "scripts/verify-p180-phase1-terminal-correction-authorization.mjs",
  "scripts/verify-plan-authority.mjs",
  "scripts/verify-plan-authority.node.mjs",
  "scripts/verify-obx-p180-source-adoption.mjs",
  "docs/research/source-catalog/adoption-ledger.json",
  "docs/plans/one-box-master/00-authority/scoped-implementation-authorizations.json",
  "docs/plans/one-box-master/00-authority/authority-manifest.json",
  PROGRAM_PATH,
  "docs/governance/risk-exceptions/2026-09-01-obx-p180-t03-terminal-correction-solo.json",
  "docs/governance/risk-exceptions/2026-09-01-obx-p180-t04-terminal-correction-solo.json",
  SECURITY_PATH,
  REPIN_PATH,
  "docs/audits/evidence/goal/2026-09-01-obx-p180-t03-terminal-correction-activation-receipt.json",
  "docs/audits/evidence/goal/2026-09-01-obx-p180-t03-terminal-correction-completion-receipt.json",
  "docs/audits/evidence/goal/2026-09-01-obx-p180-t04-terminal-correction-activation-receipt.json",
  "docs/audits/evidence/goal/2026-09-01-obx-p180-t04-terminal-correction-completion-receipt.json",
];
const T03_PATHS = [
  "src/lib/operatingEnvironment/skills.ts",
  "src/lib/operatingEnvironment/skills.test.ts",
  "src/lib/operatingEnvironment/context.ts",
  "src/lib/operatingEnvironment/context.test.ts",
  "src/lib/operatingEnvironment/interrupts.ts",
  "src/lib/operatingEnvironment/interrupts.test.ts",
  "src/lib/operatingEnvironment/receipts.ts",
  "src/lib/operatingEnvironment/receipts.test.ts",
  "src/lib/operatingEnvironment/fixtures/security-v1.json",
];
const T04_PATHS = [
  "src/lib/operatingEnvironment/budget.ts",
  "src/lib/operatingEnvironment/budget.test.ts",
  "src/lib/operatingEnvironment/capacity.ts",
  "src/lib/operatingEnvironment/capacity.test.ts",
  "src/lib/operatingEnvironment/compare.ts",
  "src/lib/operatingEnvironment/compare.test.ts",
  "src/lib/operatingEnvironment/fixtures/budget-capacity-v1.json",
];
const ALL_PATHS = [...GOVERNANCE_PATHS, ...T03_PATHS, ...T04_PATHS];
const EFFECTS = {
  T03: "add-provider-offline-skill-context-interrupt-receipt-reducers",
  T04: "add-provider-offline-in-memory-budget-capacity-compare-reducers",
};
const RECORD_PATHS = {
  T03: "docs/governance/risk-exceptions/2026-09-01-obx-p180-t03-terminal-correction-solo.json",
  T04: "docs/governance/risk-exceptions/2026-09-01-obx-p180-t04-terminal-correction-solo.json",
};
const ACTIVATION_PATHS = {
  T03: "docs/audits/evidence/goal/2026-09-01-obx-p180-t03-terminal-correction-activation-receipt.json",
  T04: "docs/audits/evidence/goal/2026-09-01-obx-p180-t04-terminal-correction-activation-receipt.json",
};
const COMPLETION_PATHS = {
  T03: "docs/audits/evidence/goal/2026-09-01-obx-p180-t03-terminal-correction-completion-receipt.json",
  T04: "docs/audits/evidence/goal/2026-09-01-obx-p180-t04-terminal-correction-completion-receipt.json",
};
const IDS = { T03: T03_TERMINAL_AUTHORIZATION_ID, T04: T04_TERMINAL_AUTHORIZATION_ID };
const LANE_PATHS = { T03: T03_PATHS, T04: T04_PATHS };
const BASE = "62b7b749f37ad9a1b8d9cc2a9a45f6062f59bbf1";
const COMMAND_TEMPLATES = {
  T03: [
    ["t03-terminal-focused", "npx vitest run src/lib/operatingEnvironment/skills.test.ts src/lib/operatingEnvironment/context.test.ts src/lib/operatingEnvironment/interrupts.test.ts src/lib/operatingEnvironment/receipts.test.ts"],
    ["operating-environment", "npm test -- src/lib/operatingEnvironment"],
    ["source-adoption", "node scripts/verify-obx-p180-source-adoption.mjs"],
    ["typecheck", "npm run typecheck"],
    ["targeted-lint", "npx eslint src/lib/operatingEnvironment/skills.ts src/lib/operatingEnvironment/skills.test.ts src/lib/operatingEnvironment/context.ts src/lib/operatingEnvironment/context.test.ts src/lib/operatingEnvironment/interrupts.ts src/lib/operatingEnvironment/interrupts.test.ts src/lib/operatingEnvironment/receipts.ts src/lib/operatingEnvironment/receipts.test.ts"],
    ["verify-plans", "node scripts/verify-plan-authority.mjs"],
    ["test-plans", "node --test scripts/verify-plan-authority.node.mjs"],
    ["path-census", "git diff --name-only " + BASE + "..{TARGET_COMMIT}"],
    ["dependency-diff", "git diff --exit-code " + BASE + "..{TARGET_COMMIT} -- package.json package-lock.json"],
    ["forbidden-effects", "node scripts/verify-p180-phase1-terminal-correction-authorization.mjs --forbidden-effects-only --lane T03"],
    ["secrets-scan", "gitleaks git --log-opts " + BASE + "..{TARGET_COMMIT} --no-banner --no-color --redact=100"],
  ],
  T04: [
    ["t04-terminal-focused", "npx vitest run src/lib/operatingEnvironment/budget.test.ts src/lib/operatingEnvironment/capacity.test.ts src/lib/operatingEnvironment/compare.test.ts"],
    ["operating-environment", "npm test -- src/lib/operatingEnvironment"],
    ["source-adoption", "node scripts/verify-obx-p180-source-adoption.mjs"],
    ["typecheck", "npm run typecheck"],
    ["targeted-lint", "npx eslint src/lib/operatingEnvironment/budget.ts src/lib/operatingEnvironment/budget.test.ts src/lib/operatingEnvironment/capacity.ts src/lib/operatingEnvironment/capacity.test.ts src/lib/operatingEnvironment/compare.ts src/lib/operatingEnvironment/compare.test.ts"],
    ["verify-plans", "node scripts/verify-plan-authority.mjs"],
    ["test-plans", "node --test scripts/verify-plan-authority.node.mjs"],
    ["path-census", "git diff --name-only " + BASE + "..{TARGET_COMMIT}"],
    ["dependency-diff", "git diff --exit-code " + BASE + "..{TARGET_COMMIT} -- package.json package-lock.json"],
    ["forbidden-effects", "node scripts/verify-p180-phase1-terminal-correction-authorization.mjs --forbidden-effects-only --lane T04"],
    ["secrets-scan", "gitleaks git --log-opts " + BASE + "..{TARGET_COMMIT} --no-banner --no-color --redact=100"],
  ],
};
const TERMINAL_SECURITY_KEYS = [
  "schemaVersion", "reviewId", "reviewKind", "status", "reviewerActorId", "reviewedAt",
  "authorizationBindings", "coverage", "findings", "deniedAuthority", "selfHash",
];
const TERMINAL_SECURITY_COVERAGE = [
  {
    surface: "owner-authority",
    status: "PASS",
    disposition: "The repository owner directly authorizes the bounded rolling -003 program and fresh immutable T03/T04 children.",
  },
  {
    surface: "exact-path-and-effect-scope",
    status: "PASS",
    disposition: "Eighteen governance paths and the exact nine-path T03 and seven-path T04 universes are closed, no-glob allowlists.",
  },
  {
    surface: "immutable-history",
    status: "PASS",
    disposition: "All -001/-002 repository artifacts and external proof, model-receipt, and report aggregates are content-addressed and immutable.",
  },
  {
    surface: "activation-order-and-topology",
    status: "PASS",
    disposition: "Proof before the atomic activation pair is invalid; both latest lane rows and both completion receipts must bind one terminal commit/tree and the direct two-receipt completion commit.",
  },
  {
    surface: "SEC-001",
    status: "PASS",
    disposition: "Completion must compare receipt bindings with the actual live fresh registry SHA, row count, head, and per-lane latest envelopes; stale valid prefixes are rejected.",
  },
  {
    surface: "SEC-002",
    status: "PASS",
    disposition: "Actor principals in interrupt and receipt reducers must use the same named-principal grammar as skills; bare person: is rejected.",
  },
  {
    surface: "immutable-prefix-anchors",
    status: "PASS",
    disposition: "Every registry append is bound by a content-addressed owner-mode-matched uchg prefix anchor; completion requires the registry itself to be uchg and byte-identical to the receipt binding.",
  },
  {
    surface: "attempt-protocol",
    status: "PASS",
    disposition: "Each lane permits at most twelve fresh append-only attempts; every row and output is re-read with owner, mode, containment, chain, and command checks.",
  },
  {
    surface: "runtime-effects",
    status: "NONE",
    disposition: "No provider, network, credential, persistence, filesystem, shell, worker, UI, browser, collaboration, Canvas, Page IR, deployment, release, inference, or product-data authority is granted.",
  },
  {
    surface: "future-tickets",
    status: "NONE",
    disposition: "T05 remains prohibited until both terminal children are COMPLETED_VERIFIED; T06 through T08 remain unauthorized.",
  },
];
const TERMINAL_DENIED_AUTHORITY = [
  "T05-before-terminal-T03-T04-completed-verified",
  "T06+",
  "provider-or-network-runtime",
  "dependency-or-lockfile-change",
  "deployment-release-or-product-data-transfer",
];
const TERMINAL_COMPLETION_REVIEW_KEYS = ["reviewId", "reviewerActorId", "verdict", "targetCommit", "targetTree"];
const TERMINAL_COMPLETION_REVIEWS = [
  ["OBX-P180-T03-TERMINAL-CORRECTION-GLM-R1", "model:z-ai-glm-5.3-flash:openrouter-z-ai-fp8", "GREEN"],
  ["OBX-P180-T04-TERMINAL-CORRECTION-GLM-R1", "model:z-ai-glm-5.3-flash:openrouter-z-ai-fp8", "GREEN"],
  ["OBX-P180-PHASE1-TERMINAL-CORRECTION-OPUS-R1", "model:claude-opus-5:claude-max-oauth", "GREEN"],
  ["OBX-P180-PHASE1-TERMINAL-CORRECTION-SECURITY-FINAL", "agent:codex-gpt-5.6-sol-ultra:terminal-correction-post-security", "PASS"],
  ["OBX-P180-PHASE1-TERMINAL-CORRECTION-FACT-FINAL", "agent:codex-gpt-5.6-sol-ultra:terminal-correction-post-fact", "PASS"],
];

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => Array.isArray(value)
  ? "[" + value.map(canonical).join(",") + "]"
  : value !== null && typeof value === "object"
    ? "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}"
    : JSON.stringify(value);
const exact = (actual, expected, label, failures) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(label + ": exact value drift");
};
const readJson = (path, label, failures) => {
  if (!existsSync(path)) { failures.push(label + ": missing"); return null; }
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { failures.push(label + ": invalid JSON (" + error.message + ")"); return null; }
};
const redirectingGitEnvironmentKeys = (environment) => Object.keys(environment).filter((key) => {
  if (environment[key] === undefined) return false;
  return /^GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|QUARANTINE_PATH|NAMESPACE|REPLACE_REF_BASE|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM|CONFIG_(?:SYSTEM|GLOBAL|NOSYSTEM|COUNT|PARAMETERS|KEY_\d+|VALUE_\d+))$/.test(key);
});
const pushFailure = (failures, failure) => {
  if (!failures.includes(failure)) failures.push(failure);
};
const trustedExecutableUnavailable = (path) => {
  if (!isAbsolute(path)) return true;
  try {
    const state = lstatSync(path);
    return !state.isFile() || (state.mode & 0o111) === 0;
  } catch {
    return true;
  }
};
export function terminalTrustedExecutableFailures({ gitPath = TRUSTED_GIT_PATH, statPath = TRUSTED_STAT_PATH } = {}) {
  const failures = [];
  if (trustedExecutableUnavailable(gitPath)) failures.push("terminal trusted git executable unavailable: " + gitPath);
  if (trustedExecutableUnavailable(statPath)) failures.push("terminal trusted stat executable unavailable: " + statPath);
  return failures;
}
const hardenedSystemEnvironment = () => ({
  LANG: "C",
  LC_ALL: "C",
});
const hardenedGitEnvironment = () => ({
  ...hardenedSystemEnvironment(),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
});
const hardenedGitResult = (root, args, label, failures, { encoding = "utf8", allowNonzero = false } = {}) => {
  if (trustedExecutableUnavailable(TRUSTED_GIT_PATH)) {
    pushFailure(failures, "terminal trusted git executable unavailable: " + TRUSTED_GIT_PATH);
    return null;
  }
  const redirects = redirectingGitEnvironmentKeys(process.env);
  if (redirects.length) {
    for (const key of redirects.sort()) pushFailure(failures, "terminal Git environment redirect forbidden: " + key);
    return null;
  }
  const options = { cwd: root, encoding, env: hardenedGitEnvironment() };
  const replacements = spawnSync(TRUSTED_GIT_PATH, ["--no-replace-objects", "for-each-ref", "--format=%(refname)", "refs/replace"], { ...options, encoding: "utf8" });
  if (replacements.status !== 0) {
    pushFailure(failures, label + ": Git replacement-ref preflight failed");
    return null;
  }
  if (replacements.stdout.trim()) {
    pushFailure(failures, "terminal Git replacement refs forbidden");
    return null;
  }
  const result = spawnSync(TRUSTED_GIT_PATH, ["--no-replace-objects", ...args], options);
  if (!allowNonzero && result.status !== 0) {
    pushFailure(failures, label + ": git failed");
    return null;
  }
  return result;
};
const git = (root, args, label, failures, encoding = "utf8") => {
  const result = hardenedGitResult(root, args, label, failures, { encoding });
  if (!result) return null;
  return encoding === null ? result.stdout : result.stdout.trim();
};
function validateHashEnvelope(value, field, label, failures) {
  exact(value?.[field] && Object.keys(value[field]).sort(), ["algorithm", "canonicalization", "digest", "excludedJsonPointers"], label + "." + field + ".keys", failures);
  exact(value?.[field] && {
    algorithm: value[field].algorithm,
    canonicalization: value[field].canonicalization,
    excludedJsonPointers: value[field].excludedJsonPointers,
  }, { algorithm: "sha256", canonicalization: "canonical-json-v1", excludedJsonPointers: ["/" + field + "/digest"] }, label + "." + field + ".envelope", failures);
  if (!value?.[field]) return;
  const copy = structuredClone(value);
  const claimed = copy[field].digest;
  delete copy[field].digest;
  if (claimed !== sha(canonical(copy))) failures.push(label + "." + field + ": canonical digest drift");
}
function validateExternalFile(binding, expectedPath, expectedSha, label, failures) {
  exact(binding && [binding.path, binding.algorithm, binding.digest, binding.expectedMode, binding.regularOwnerMatchedFileRequired], [expectedPath, "sha256", expectedSha, "0644", true], label + ".binding", failures);
  if (!existsSync(expectedPath)) { failures.push(label + ": missing"); return; }
  const state = lstatSync(expectedPath);
  if (state.isSymbolicLink() || !state.isFile()) failures.push(label + ": must be a regular non-symlink file");
  if ((state.mode & 0o777) !== 0o644) failures.push(label + ": mode drift");
  if (typeof process.getuid === "function" && state.uid !== process.getuid()) failures.push(label + ": owner drift");
  if (sha(readFileSync(expectedPath)) !== expectedSha) failures.push(label + ": byte digest drift");
}
function aggregateFiles(root, files) {
  const digest = createHash("sha256");
  for (const path of [...files].sort()) {
    digest.update(relative(root, path));
    digest.update("\0");
    digest.update(readFileSync(path));
    digest.update("\0");
  }
  return { count: files.length, digest: digest.digest("hex") };
}
function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(resolve(path, entry.name)) : [resolve(path, entry.name)]);
}
function validateImmutableHistory(repoRoot, goalRoot, program, failures) {
  for (const row of program?.immutableHistory?.repositoryArtifacts ?? []) {
    const target = resolve(repoRoot, row.path);
    if (!existsSync(target) || sha(readFileSync(target)) !== row.sha256) failures.push("immutable historical repository artifact drift " + row.path);
  }
  for (const path of program?.immutableHistory?.oldCompletionPathsMustRemainAbsent ?? []) {
    if (existsSync(resolve(repoRoot, path))) failures.push("historical completion path must remain absent " + path);
  }
  const proofFiles = walk(resolve(goalRoot, "proof")).filter((path) => {
    const rel = relative(goalRoot, path);
    return rel.startsWith("proof/phase1-supersession-") || rel === "proof/phase1-superseding-correction-proof-registry.jsonl";
  });
  const modelFiles = walk(resolve(goalRoot, "model-receipts")).filter((path) => relative(goalRoot, path).startsWith("model-receipts/phase1-supersession-"));
  const reportFiles = [
    "reports/phase1-supersession-opus-r1-dispositions.md",
    "reports/phase1-supersession-security-independent.md",
    "reports/phase1-supersession-fact-independent.md",
  ].map((path) => resolve(goalRoot, path));
  const expected = program?.immutableHistory?.externalAggregates ?? [];
  for (const [index, row] of expected.entries()) exact(row.root, goalRoot, "immutable supersession aggregate " + (index + 1) + " root", failures);
  exact(aggregateFiles(goalRoot, proofFiles), { count: expected[0]?.fileCount, digest: expected[0]?.digest }, "immutable supersession proof aggregate", failures);
  exact(aggregateFiles(goalRoot, modelFiles), { count: expected[1]?.fileCount, digest: expected[1]?.digest }, "immutable supersession model aggregate", failures);
  exact(aggregateFiles(goalRoot, reportFiles), { count: expected[2]?.fileCount, digest: expected[2]?.digest }, "immutable supersession report aggregate", failures);
  const old = program?.immutableHistory?.supersedingRegistryBinding;
  const oldRegistryPath = resolve(goalRoot, "proof/phase1-superseding-correction-proof-registry.jsonl");
  exact(old?.path, oldRegistryPath, "immutable superseding registry path", failures);
  if (!old || !existsSync(oldRegistryPath)) { failures.push("immutable superseding registry missing"); return; }
  const bytes = readFileSync(oldRegistryPath);
  const text = bytes.toString("utf8");
  const rows = text.endsWith("\n") ? text.slice(0, -1).split("\n").map(JSON.parse) : [];
  exact([sha(bytes), bytes.length, rows.length, rows.at(-1)?.envelopeHash, rows.filter((row) => row.laneId === "T03").at(-1)?.envelopeHash, rows.filter((row) => row.laneId === "T04").at(-1)?.envelopeHash],
    [old.sha256, old.bytes, old.rows, old.headEnvelopeHash, old.t03LatestEnvelopeHash, old.t04LatestEnvelopeHash],
    "immutable superseding registry binding", failures);
}
function validateAllowlist(repoRoot, goalRoot, program, failures, { expectedOwnerDirectionSha, expectedActivationAllowlistSha }) {
  const ownerPath = resolve(goalRoot, "owner-authorizations/2026-09-01-phase1-terminal-correction-wave.md");
  const allowlistPath = resolve(goalRoot, "censuses/phase1-terminal-correction-activation-allowlist.txt");
  validateExternalFile(program?.ownerDirectionBinding, ownerPath, expectedOwnerDirectionSha, "terminal owner direction external anchor", failures);
  validateExternalFile(program?.activationAllowlistBinding, allowlistPath, expectedActivationAllowlistSha, "terminal activation allowlist external anchor", failures);
  exact(program?.activationAllowlistBinding?.exactPathCount, 34, "terminal allowlist count", failures);
  const text = readFileSync(allowlistPath, "utf8");
  const rows = text.split("\n").filter((line) => line.includes("\t"));
  exact(rows.length, 34, "terminal allowlist data row count", failures);
  rows.forEach((line, index) => {
    const [path, presence, digest, effect] = line.split("\t");
    const expectedPath = ALL_PATHS[index];
    exact(path, expectedPath, "terminal allowlist row " + (index + 1) + " path", failures);
    if (path !== expectedPath) return;
    const blob = hardenedGitResult(repoRoot, ["show", TERMINAL_BASE_COMMIT + ":" + path], "terminal allowlist preimage " + path, failures, { encoding: null, allowNonzero: true });
    if (blob?.status === 0) {
      exact([presence, digest], ["PRESENT", sha(blob.stdout)], "terminal allowlist row " + (index + 1) + " preimage", failures);
      const mode = git(repoRoot, ["ls-tree", TERMINAL_BASE_COMMIT, "--", path], "terminal allowlist mode " + path, failures)?.split(/\s+/)[0];
      exact(mode, "100644", "terminal allowlist row " + (index + 1) + " mode", failures);
    } else if (blob) exact([presence, digest], ["ABSENT", "ABSENT"], "terminal allowlist row " + (index + 1) + " absence", failures);
    const expectedEffect = index < 18 ? "governance-authorize-verify-activate-complete" : index < 27 ? "t03-provider-offline-correction-universe" : "t04-provider-offline-correction-universe";
    exact(effect, expectedEffect, "terminal allowlist row " + (index + 1) + " effect", failures);
  });
}
function validateProgram(repoRoot, goalRoot, registry, failures, expectations) {
  const path = resolve(repoRoot, PROGRAM_PATH);
  const program = readJson(path, "terminal program", failures);
  if (!program) return null;
  exact([
    program.schemaVersion, program.id, program.recordKind, program.status, program.governanceAuthorized,
    program.implementationAuthorized, program.projectId, program.branch, program.baseCommit, program.baseTree,
    program.ownerActorId, program.controllerActorId, program.goalRunId, program.renewable,
  ], [1, TERMINAL_PROGRAM_AUTHORIZATION_ID, "owner-bounded-rolling-terminal-correction-program-v1", "reserved-pending-child-activation", true, false, "one-box", expectations.expectedExecutionBranch, TERMINAL_BASE_COMMIT, TERMINAL_BASE_TREE, "person:devin-wiggins", "agent:codex-gpt-5.6-sol-ultra:obx-p180-controller", "obx-p180-t03-t05-offline-wave", false], "terminal program identity", failures);
  if (typeof program.branch !== "string" || program.branch.length === 0) failures.push("terminal program branch missing");
  validateHashEnvelope(program, "authorizationHash", "terminal program", failures);
  validateAllowlist(repoRoot, goalRoot, program, failures, expectations);
  exact(program.exactGovernanceUniverse, GOVERNANCE_PATHS, "terminal governance universe", failures);
  exact(program.exactImplementationUniverse, { T03: T03_PATHS, T04: T04_PATHS }, "terminal implementation universe", failures);
  exact(program.exactEffects, EFFECTS, "terminal effects", failures);
  exact(program.childAuthorizationProtocol?.childIds, [T03_TERMINAL_AUTHORIZATION_ID, T04_TERMINAL_AUTHORIZATION_ID], "terminal child ids", failures);
  exact([program.childAuthorizationProtocol?.maxAppendOnlyAttemptsPerLane, program.childAuthorizationProtocol?.failedOrSupersededAttemptsImmutable, program.childAuthorizationProtocol?.renewReuseTruncateRewriteOrRebaselineAllowed, program.childAuthorizationProtocol?.furtherOwnerAuthorizationRequiredWithinBoundedProgram], [12, true, false, false], "terminal rolling protocol", failures);
  exact([program.completionBarrier?.bothRequiredBeforeT05Authorization, program.completionBarrier?.t05AuthorizedByThisRecord, program.completionBarrier?.t06ThroughT08Authorized], [true, false, false], "terminal future ticket barrier", failures);
  exact(program.nonAuthoritativeSummaryDisposition, { path: "docs/plans/one-box-master/00-authority/plan-register.md", status: "stale-human-readable-summary", sourceOfTruth: SCOPED_REGISTRY_PATH, authorityExpansion: false, editAuthorized: false }, "terminal stale summary disposition", failures);
  validateImmutableHistory(repoRoot, goalRoot, program, failures);
  const ref = registry?.authorizations?.find((row) => row.id === TERMINAL_PROGRAM_AUTHORIZATION_ID);
  exact(ref, { id: TERMINAL_PROGRAM_AUTHORIZATION_ID, recordKind: "owner-bounded-rolling-terminal-correction-program-reference-v1", path: PROGRAM_PATH, algorithm: "sha256", digest: sha(readFileSync(path)) }, "terminal program registry reference", failures);
  return program;
}
function validateChild(repoRoot, goalRoot, registry, program, lane, failures, expectations) {
  const path = resolve(repoRoot, RECORD_PATHS[lane]);
  const child = readJson(path, lane + " terminal child", failures);
  if (!child) return null;
  exact([
    child.schemaVersion, child.id, child.recordKind, child.status, child.implementationAuthorized, child.activationRequired,
    child.projectId, child.branch, child.baseCommit, child.baseTree, child.ticketId, child.laneId,
    child.ownerActorId, child.riskOwnerActorId, child.controllerActorId, child.goalRunId, child.renewable,
  ], [1, IDS[lane], "owner-solo-terminal-correction-child-v1", "reserved-pending-activation", true, true, "one-box", expectations.expectedExecutionBranch, TERMINAL_BASE_COMMIT, TERMINAL_BASE_TREE, "OBX-P180-" + lane, lane, "person:devin-wiggins", "person:devin-wiggins", "agent:codex-gpt-5.6-sol-ultra:obx-p180-controller", "obx-p180-t03-t05-offline-wave", false], lane + " terminal identity", failures);
  validateHashEnvelope(child, "authorizationHash", lane + " terminal child", failures);
  exact(child.parentProgramBinding, { authorizationId: TERMINAL_PROGRAM_AUTHORIZATION_ID, authorizationHash: program?.authorizationHash?.digest, recordPath: PROGRAM_PATH, recordSha256: sha(readFileSync(resolve(repoRoot, PROGRAM_PATH))) }, lane + " parent program", failures);
  validateExternalFile(child.ownerDirectionBinding, resolve(goalRoot, "owner-authorizations/2026-09-01-phase1-terminal-correction-wave.md"), expectations.expectedOwnerDirectionSha, lane + " owner direction external anchor", failures);
  validateExternalFile(child.activationAllowlistBinding, resolve(goalRoot, "censuses/phase1-terminal-correction-activation-allowlist.txt"), expectations.expectedActivationAllowlistSha, lane + " allowlist external anchor", failures);
  exact(child.allowedCorrectionPaths, LANE_PATHS[lane], lane + " allowed paths", failures);
  exact(child.allowedEffects, [EFFECTS[lane]], lane + " allowed effects", failures);
  exact(child.governanceWriteScope?.exactPaths, GOVERNANCE_PATHS, lane + " governance paths", failures);
  exact([child.governanceWriteScope?.runtimeAuthority, child.governanceWriteScope?.dependencyOrLockfileChangeAuthorized, child.governanceWriteScope?.t05BeforeBothCompletedVerified, child.governanceWriteScope?.t06ThroughT08Authority], [false, false, false, false], lane + " governance denials", failures);
  exact([child.attemptProtocol?.registryPath, child.attemptProtocol?.maxAttemptsPerLane, child.attemptProtocol?.maxTotalRows, child.attemptProtocol?.strictCanonicalJsonl, child.attemptProtocol?.newlineTerminated, child.attemptProtocol?.immutablePrefixAnchorsRequired, child.attemptProtocol?.prefixAnchorImmutableFlag, child.attemptProtocol?.finalRegistryImmutableFlag], ["proof/" + REGISTRY_NAME, 12, 24, true, true, true, "uchg", "uchg"], lane + " attempt protocol", failures);
  exact(child.completionEvidence?.requiredCommands, COMMAND_TEMPLATES[lane].map(([commandId, commandSpec]) => ({ commandId, commandSpec })), lane + " command specifications", failures);
  exact([child.completionEvidence?.latestAttemptMustPass, child.completionEvidence?.pairedLatestTargetRequired, child.completionEvidence?.atomicPairedCompletionCommitRequired, child.completionEvidence?.completionCommitOnlyReceiptPaths, child.completionEvidence?.staleValidPrefixAccepted], [true, true, true, true, false], lane + " completion protocol", failures);
  const ref = registry?.authorizations?.find((row) => row.id === IDS[lane]);
  exact(ref, { id: IDS[lane], recordKind: "owner-solo-terminal-correction-child-reference-v1", path: RECORD_PATHS[lane], algorithm: "sha256", digest: sha(readFileSync(path)) }, lane + " terminal registry reference", failures);
  return child;
}
function validateSecurity(repoRoot, program, children, failures) {
  const security = readJson(resolve(repoRoot, SECURITY_PATH), "terminal security review", failures);
  if (!security) return;
  exact(Object.keys(security).sort(), [...TERMINAL_SECURITY_KEYS].sort(), "terminal security keys", failures);
  exact([security.schemaVersion, security.reviewId, security.reviewKind, security.status], [1, "OBX-P180-PHASE1-TERMINAL-CORRECTION-SECURITY-003", "phase1-terminal-correction-authorization-security-review-v1", "PASS"], "terminal security identity", failures);
  exact(security.reviewerActorId, "agent:codex-gpt-5.6-sol-ultra:terminal-correction-security-review", "terminal security reviewer identity", failures);
  const conflictedActors = new Set([
    program?.ownerActorId,
    program?.controllerActorId,
    children.T03?.ownerActorId,
    children.T03?.riskOwnerActorId,
    children.T03?.controllerActorId,
    children.T04?.ownerActorId,
    children.T04?.riskOwnerActorId,
    children.T04?.controllerActorId,
  ]);
  if (conflictedActors.has(security.reviewerActorId)) failures.push("terminal security reviewer independence drift");
  exact(security.authorizationBindings, [
    { authorizationId: TERMINAL_PROGRAM_AUTHORIZATION_ID, authorizationHash: program?.authorizationHash?.digest },
    { authorizationId: T03_TERMINAL_AUTHORIZATION_ID, authorizationHash: children.T03?.authorizationHash?.digest },
    { authorizationId: T04_TERMINAL_AUTHORIZATION_ID, authorizationHash: children.T04?.authorizationHash?.digest },
  ], "terminal security authorization bindings", failures);
  exact(security.coverage, TERMINAL_SECURITY_COVERAGE, "terminal security coverage", failures);
  exact(security.findings, [], "terminal security findings", failures);
  exact(security.deniedAuthority, TERMINAL_DENIED_AUTHORITY, "terminal security denied authority", failures);
  validateHashEnvelope(security, "selfHash", "terminal security", failures);
}
function validateRepin(repoRoot, program, children, failures) {
  const repin = readJson(resolve(repoRoot, REPIN_PATH), "terminal authority repin", failures);
  if (!repin) return;
  exact([repin.schemaVersion, repin.reviewId, repin.recordKind, repin.status], [1, "OBX-P180-PHASE1-TERMINAL-CORRECTION-AUTHORITY-REPIN-003", "owner-directed-phase1-terminal-correction-authority-repin-v1", "VERIFIED_PENDING_TERMINAL_GOVERNANCE_COMMIT"], "terminal repin identity", failures);
  exact(repin.authorizationBindings, [
    { authorizationId: TERMINAL_PROGRAM_AUTHORIZATION_ID, authorizationHash: program?.authorizationHash?.digest, recordPath: PROGRAM_PATH, recordSha256: sha(readFileSync(resolve(repoRoot, PROGRAM_PATH))) },
    { authorizationId: T03_TERMINAL_AUTHORIZATION_ID, authorizationHash: children.T03?.authorizationHash?.digest, recordPath: RECORD_PATHS.T03, recordSha256: sha(readFileSync(resolve(repoRoot, RECORD_PATHS.T03))) },
    { authorizationId: T04_TERMINAL_AUTHORIZATION_ID, authorizationHash: children.T04?.authorizationHash?.digest, recordPath: RECORD_PATHS.T04, recordSha256: sha(readFileSync(resolve(repoRoot, RECORD_PATHS.T04))) },
  ], "terminal repin authorization bindings", failures);
  const manifestBytes = readFileSync(resolve(repoRoot, MANIFEST_PATH));
  const manifest = JSON.parse(manifestBytes);
  exact(repin.currentAuthorityManifest, { path: MANIFEST_PATH, packetDigest: manifest.packetDigest, sha256: sha(manifestBytes) }, "terminal repin manifest binding", failures);
  exact([repin.invariants?.oldEvidenceRewritten, repin.invariants?.authorityExpansion, repin.invariants?.runtimeOrDependencyChange, repin.invariants?.t05Authorized, repin.invariants?.t06ThroughT08Authorized], [false, false, false, false, false], "terminal repin invariants", failures);
  validateHashEnvelope(repin, "selfHash", "terminal repin", failures);
}
function findIntroducingCommit(repoRoot, path, failures) {
  const output = git(repoRoot, ["log", "--diff-filter=A", "--format=%H", "--", path], "introducing commit " + path, failures);
  const commits = output?.split("\n").filter(Boolean) ?? [];
  if (commits.length !== 1) failures.push("introducing commit " + path + ": expected exactly one");
  return commits[0] ?? null;
}
function validateCommitOnlyPaths(repoRoot, commit, expectedPaths, label, failures) {
  if (!commit) return;
  const parent = git(repoRoot, ["rev-parse", commit + "^"], label + " parent", failures);
  const changed = git(repoRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", commit], label + " paths", failures)?.split("\n").filter(Boolean).sort();
  exact(changed, [...expectedPaths].sort(), label + " exact paths", failures);
  if ((git(repoRoot, ["rev-list", "--parents", "-n", "1", commit], label + " topology", failures)?.split(/\s+/).length ?? 0) !== 2) failures.push(label + ": merge or root commit forbidden");
  return parent;
}
function validateActivation(repoRoot, lane, child, program, failures) {
  const receipt = readJson(resolve(repoRoot, ACTIVATION_PATHS[lane]), lane + " terminal activation", failures);
  if (!receipt) return null;
  exact([
    receipt.schemaVersion, receipt.receiptId, receipt.receiptKind, receipt.status, receipt.programAuthorizationId,
    receipt.programAuthorizationHash, receipt.authorizationId, receipt.authorizationHash, receipt.ticketId, receipt.laneId,
    receipt.governanceCommit, receipt.governanceTree, receipt.expiresAt,
  ], [1, "OBX-P180-" + lane + "-TERMINAL-CORRECTION-ACTIVATION-003", "owner-solo-terminal-correction-activation-v1", "ACTIVE", TERMINAL_PROGRAM_AUTHORIZATION_ID, program.authorizationHash.digest, IDS[lane], child.authorizationHash.digest, "OBX-P180-" + lane, lane, receipt.governanceCommit, receipt.governanceTree, child.expiresAt], lane + " terminal activation identity", failures);
  validateHashEnvelope(receipt, "selfHash", lane + " terminal activation", failures);
  const introduction = findIntroducingCommit(repoRoot, ACTIVATION_PATHS[lane], failures);
  receipt.derivedActivationCommit = introduction;
  receipt.derivedActivationTree = introduction
    ? git(repoRoot, ["rev-parse", introduction + "^{tree}"], lane + " terminal activation derived tree", failures)
    : null;
  return receipt;
}
function isContained(root, path) {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel);
}
function validateRegularOwnerMode(path, mode, label, failures) {
  if (!existsSync(path)) { failures.push(label + ": missing"); return null; }
  const state = lstatSync(path);
  if (state.isSymbolicLink() || !state.isFile()) failures.push(label + ": must be a real regular file");
  if ((state.mode & 0o777) !== mode) failures.push(label + ": mode drift");
  if (typeof process.getuid === "function" && state.uid !== process.getuid()) failures.push(label + ": owner drift");
  return state;
}
function immutableFlag(path) {
  if (trustedExecutableUnavailable(TRUSTED_STAT_PATH)) return false;
  const result = spawnSync(TRUSTED_STAT_PATH, ["-f", "%Sf", path], { encoding: "utf8", env: hardenedSystemEnvironment() });
  return result.status === 0 && result.stdout.trim().split(",").includes("uchg");
}
function validateNoSymlinkParents(root, path, label, failures) {
  let current = dirname(path);
  while (isContained(root, current)) {
    if (lstatSync(current).isSymbolicLink()) failures.push(label + ": symlinked parent");
    if (current === root) break;
    current = dirname(current);
  }
}
function validateOutput(proofRoot, row, receipt, commandIndex, failures) {
  const lane = row.laneId;
  const attempt = String(row.attemptNumber).padStart(3, "0");
  const [commandId, template] = COMMAND_TEMPLATES[lane][commandIndex] ?? [];
  const expectedSpec = template?.replaceAll("{TARGET_COMMIT}", row.executionCommit);
  const label = lane + " attempt " + attempt + " command " + (commandIndex + 1);
  exact([receipt.commandId, receipt.commandSpec, receipt.commandSpecSha256], [commandId, expectedSpec, sha(expectedSpec ?? "")], label + " specification", failures);
  const expectedPath = "proof/phase1-terminal-correction-" + lane.toLowerCase() + "-attempt-" + attempt + "-" + String(commandIndex + 1).padStart(2, "0") + "-" + commandId + ".log";
  exact(receipt.outputPath, expectedPath, label + " output path", failures);
  if (typeof receipt.outputPath !== "string" || isAbsolute(receipt.outputPath) || !receipt.outputPath.startsWith("proof/")) { failures.push(label + ": output path escape"); return; }
  const output = resolve(proofRoot, receipt.outputPath.slice("proof/".length));
  if (!isContained(proofRoot, output)) { failures.push(label + ": output path escape"); return; }
  validateNoSymlinkParents(proofRoot, output, label, failures);
  const state = validateRegularOwnerMode(output, 0o600, label + " output", failures);
  if (state && !state.isSymbolicLink() && state.isFile()) exact([sha(readFileSync(output)), state.size], [receipt.outputSha256, receipt.outputBytes], label + " output bytes", failures);
}
function validateAnchor(proofRoot, registryBytes, row, rowIndex, prefixEnd, failures) {
  const prefix = registryBytes.subarray(0, prefixEnd);
  const prefixSha = sha(prefix);
  const path = resolve(proofRoot, "phase1-terminal-correction-anchor-" + String(rowIndex + 1).padStart(3, "0") + "-" + prefixSha + ".json");
  const label = "terminal prefix anchor " + (rowIndex + 1);
  validateNoSymlinkParents(proofRoot, path, label, failures);
  validateRegularOwnerMode(path, 0o600, label, failures);
  const anchor = readJson(path, label, failures);
  if (!anchor) return;
  exact([
    anchor.schemaVersion, anchor.sequence, anchor.registryPath, anchor.prefixBytes, anchor.prefixSha256,
    anchor.rowCount, anchor.headEnvelopeHash,
  ], [1, rowIndex + 1, "proof/" + REGISTRY_NAME, prefix.length, prefixSha, rowIndex + 1, row.envelopeHash], label + " identity", failures);
  validateHashEnvelope(anchor, "selfHash", label, failures);
  if (!immutableFlag(path)) failures.push(label + ": immutable uchg flag missing");
}
export function terminalProofRegistryBinding({
  repoRoot = ROOT,
  proofRoot = resolve(DEFAULT_GOAL_ROOT, "proof"),
  requireCompletion = false,
  activationCommit = null,
  activationTree = null,
  expiresAt = null,
  programAuthorizationHash,
  childAuthorizationHashes,
} = {}) {
  const failures = [];
  failures.push(...terminalTrustedExecutableFailures());
  if (!existsSync(proofRoot)) { failures.push("terminal proof root: missing"); return { failures, rows: [], binding: null }; }
  const rootState = lstatSync(proofRoot);
  if (rootState.isSymbolicLink() || !rootState.isDirectory()) failures.push("terminal proof root must be a real directory");
  if ((rootState.mode & 0o777) !== 0o700) failures.push("terminal proof root mode drift");
  if (typeof process.getuid === "function" && rootState.uid !== process.getuid()) failures.push("terminal proof root owner drift");
  const lockPath = resolve(proofRoot, "phase1-terminal-correction-proof-registry.lock");
  if (existsSync(lockPath)) failures.push("terminal proof registry has a live writer lock");
  const registryPath = resolve(proofRoot, REGISTRY_NAME);
  if (!existsSync(registryPath)) {
    if (requireCompletion) failures.push("terminal proof registry: missing");
    return { failures, rows: [], binding: null };
  }
  validateNoSymlinkParents(proofRoot, registryPath, "terminal proof registry", failures);
  const before = validateRegularOwnerMode(registryPath, 0o600, "terminal proof registry", failures);
  const bytes = readFileSync(registryPath);
  const after = statSync(registryPath);
  if (before && (before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs)) failures.push("terminal proof registry changed during read");
  if (bytes.length === 0) {
    if (requireCompletion) failures.push("terminal proof registry: empty");
    return { failures, rows: [], binding: null };
  }
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n")) failures.push("terminal proof registry must be newline terminated");
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  if (lines.some((line) => line.length === 0)) failures.push("terminal proof registry contains a blank row");
  if (lines.length > 24) failures.push("terminal proof registry total attempt limit exceeded");
  const rows = [];
  let previous = ZERO_HASH;
  const counts = { T03: 0, T04: 0 };
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const prefixEnd = offset + Buffer.byteLength(raw) + 1;
    offset = prefixEnd;
    if (Buffer.byteLength(raw) > 1_000_000) { failures.push("terminal proof registry row " + (index + 1) + ": oversized"); continue; }
    let row;
    try { row = JSON.parse(raw); } catch { failures.push("terminal proof registry row " + (index + 1) + ": invalid JSON"); continue; }
    if (raw !== canonical(row)) failures.push("terminal proof registry row " + (index + 1) + ": not strict canonical JSON");
    const expectedKeys = ["activationCommit", "activationTree", "attemptId", "attemptNumber", "authorizationHash", "authorizationId", "commandReceipts", "envelopeHash", "executionCommit", "executionTree", "finishedAt", "laneId", "previousEnvelopeHash", "programAuthorizationHash", "programAuthorizationId", "sequence", "startedAt", "status"];
    exact(Object.keys(row).sort(), expectedKeys, "terminal proof registry row " + (index + 1) + " keys", failures);
    const lane = row.laneId;
    if (!IDS[lane]) { failures.push("terminal proof registry row " + (index + 1) + ": invalid lane"); continue; }
    exact(row.programAuthorizationHash, programAuthorizationHash, "terminal proof registry row " + (index + 1) + " program authorization hash", failures);
    exact(row.authorizationHash, childAuthorizationHashes?.[lane], "terminal proof registry row " + (index + 1) + " child authorization hash", failures);
    counts[lane] += 1;
    exact([
      row.sequence, row.previousEnvelopeHash, row.attemptNumber, row.attemptId, row.authorizationId,
      row.programAuthorizationId, row.status,
    ], [index + 1, previous, counts[lane], "OBX-P180-" + lane + "-TERMINAL-CORRECTION-003-ATTEMPT-" + String(counts[lane]).padStart(3, "0"), IDS[lane], TERMINAL_PROGRAM_AUTHORIZATION_ID, row.status], "terminal proof registry row " + (index + 1) + " identity", failures);
    if (!["PASS", "FAIL", "ABORTED"].includes(row.status)) failures.push("terminal proof registry row " + (index + 1) + ": invalid status");
    if (counts[lane] > 12) failures.push(lane + ": terminal attempt limit exceeded");
    const copy = structuredClone(row);
    const claimed = copy.envelopeHash;
    delete copy.envelopeHash;
    if (claimed !== sha(canonical(copy))) failures.push("terminal proof registry row " + (index + 1) + ": envelope hash drift");
    previous = claimed;
    const actualActivationTree = git(repoRoot, ["rev-parse", row.activationCommit + "^{tree}"], "terminal activation tree row " + (index + 1), failures);
    exact(actualActivationTree, row.activationTree, "terminal proof registry row " + (index + 1) + " activation tree", failures);
    const actualTree = git(repoRoot, ["rev-parse", row.executionCommit + "^{tree}"], "terminal execution tree row " + (index + 1), failures);
    exact(actualTree, row.executionTree, "terminal proof registry row " + (index + 1) + " execution tree", failures);
    const ancestry = hardenedGitResult(repoRoot, ["merge-base", "--is-ancestor", TERMINAL_BASE_COMMIT, row.executionCommit], "terminal execution ancestry row " + (index + 1), failures, { allowNonzero: true });
    if (ancestry && ancestry.status !== 0) failures.push("terminal proof registry row " + (index + 1) + ": execution ancestry drift");
    if (activationCommit && row.activationCommit !== activationCommit) failures.push("terminal proof registry row " + (index + 1) + ": activation commit drift");
    if (activationTree) exact(row.activationTree, activationTree, "terminal proof registry row " + (index + 1) + " paired activation tree", failures);
    const started = Date.parse(row.startedAt); const finished = Date.parse(row.finishedAt);
    if (!Number.isFinite(started) || !Number.isFinite(finished) || started > finished) failures.push("terminal proof registry row " + (index + 1) + ": chronology drift");
    if (activationCommit) {
      const activationEpoch = Number(git(repoRoot, ["show", "-s", "--format=%ct", activationCommit], "terminal activation epoch", failures)) * 1000;
      if (started < activationEpoch) failures.push("terminal proof registry row " + (index + 1) + ": predates activation");
    }
    if (expiresAt && finished >= Date.parse(expiresAt)) failures.push("terminal proof registry row " + (index + 1) + ": crosses expiry");
    if (!Array.isArray(row.commandReceipts) || row.commandReceipts.length === 0 || row.commandReceipts.length > COMMAND_TEMPLATES[lane].length) failures.push("terminal proof registry row " + (index + 1) + ": command receipt count drift");
    else row.commandReceipts.forEach((receipt, commandIndex) => validateOutput(proofRoot, row, receipt, commandIndex, failures));
    if (row.status === "PASS" && (row.commandReceipts.length !== COMMAND_TEMPLATES[lane].length || row.commandReceipts.some((receipt) => receipt.exitCode !== 0))) failures.push("terminal proof registry row " + (index + 1) + ": PASS requires every command exit 0");
    if (row.status !== "PASS" && !row.commandReceipts.some((receipt) => receipt.exitCode !== 0)) failures.push("terminal proof registry row " + (index + 1) + ": non-PASS requires a failed command");
    validateAnchor(proofRoot, bytes, row, index, prefixEnd, failures);
    rows.push(row);
  }
  if (requireCompletion && !immutableFlag(registryPath)) failures.push("terminal proof registry immutable uchg flag missing");
  const latest = {
    T03: rows.filter((row) => row.laneId === "T03").at(-1),
    T04: rows.filter((row) => row.laneId === "T04").at(-1),
  };
  if (requireCompletion) {
    for (const lane of ["T03", "T04"]) {
      if (!latest[lane]) failures.push(lane + ": terminal proof row missing");
      else if (latest[lane].status !== "PASS") failures.push(lane + ": latest terminal attempt is not PASS");
    }
    if (latest.T03 && latest.T04) exact([latest.T03.executionCommit, latest.T03.executionTree], [latest.T04.executionCommit, latest.T04.executionTree], "terminal paired latest target", failures);
    const anchorPrefix = "phase1-terminal-correction-anchor-";
    const sequences = new Map();
    for (const name of readdirSync(proofRoot).filter((candidate) => candidate.startsWith(anchorPrefix))) {
      const match = name.match(/^phase1-terminal-correction-anchor-(\d{3})-([a-f0-9]{64})\.json$/);
      if (!match) { failures.push("terminal prefix anchor filename malformed " + name); continue; }
      const sequence = Number(match[1]);
      if (sequences.has(sequence)) failures.push("terminal prefix anchor sequence duplicated " + sequence);
      else sequences.set(sequence, name);
    }
    const greatestAnchorSequence = Math.max(0, ...sequences.keys());
    if (greatestAnchorSequence > rows.length) failures.push("terminal proof registry is a stale valid prefix");
    if (greatestAnchorSequence !== rows.length) failures.push("terminal proof registry anchor tail drift");
  }
  const binding = rows.length ? {
    path: "proof/" + REGISTRY_NAME,
    sha256: sha(bytes),
    bytes: bytes.length,
    rowCount: rows.length,
    headEnvelopeHash: rows.at(-1).envelopeHash,
    t03AttemptCount: counts.T03,
    t04AttemptCount: counts.T04,
    t03LatestAttemptId: latest.T03?.attemptId ?? null,
    t04LatestAttemptId: latest.T04?.attemptId ?? null,
    t03LatestEnvelopeHash: latest.T03?.envelopeHash ?? null,
    t04LatestEnvelopeHash: latest.T04?.envelopeHash ?? null,
    terminalTargetCommit: latest.T03?.executionCommit ?? null,
    terminalTargetTree: latest.T03?.executionTree ?? null,
  } : null;
  return { failures, rows, binding };
}
export function terminalCompletionReviewBindingFailures(reviewBindings, { targetCommit, targetTree } = {}) {
  const failures = [];
  if (!Array.isArray(reviewBindings)) {
    failures.push("terminal completion review bindings must be an array");
    return failures;
  }
  exact(reviewBindings.length, TERMINAL_COMPLETION_REVIEWS.length, "terminal completion review binding count", failures);
  for (const [index, [reviewId, reviewerActorId, verdict]] of TERMINAL_COMPLETION_REVIEWS.entries()) {
    const binding = reviewBindings[index];
    const label = "terminal completion review binding " + (index + 1);
    exact(Object.keys(binding ?? {}).sort(), [...TERMINAL_COMPLETION_REVIEW_KEYS].sort(), label + " keys", failures);
    exact([binding?.reviewId, binding?.reviewerActorId], [reviewId, reviewerActorId], label + " identity", failures);
    exact(binding?.verdict, verdict, label + " verdict", failures);
    exact([binding?.targetCommit, binding?.targetTree], [targetCommit, targetTree], label + " target", failures);
  }
  return failures;
}
function validateCompletion(repoRoot, lane, child, program, activation, proofBinding, failures) {
  const receipt = readJson(resolve(repoRoot, COMPLETION_PATHS[lane]), lane + " terminal completion", failures);
  if (!receipt) return null;
  exact([
    receipt.schemaVersion, receipt.receiptId, receipt.receiptKind, receipt.status, receipt.programAuthorizationId,
    receipt.programAuthorizationHash, receipt.authorizationId, receipt.authorizationHash, receipt.ticketId, receipt.laneId,
  ], [1, "OBX-P180-" + lane + "-TERMINAL-CORRECTION-COMPLETION-003", "owner-solo-terminal-correction-completion-v1", "COMPLETED_VERIFIED", TERMINAL_PROGRAM_AUTHORIZATION_ID, program.authorizationHash.digest, IDS[lane], child.authorizationHash.digest, "OBX-P180-" + lane, lane], lane + " terminal completion identity", failures);
  exact(receipt.proofBinding, proofBinding, lane + " terminal live proof binding", failures);
  exact(receipt.activationBinding, { path: ACTIVATION_PATHS[lane], sha256: sha(readFileSync(resolve(repoRoot, ACTIVATION_PATHS[lane]))), governanceCommit: activation.governanceCommit, governanceTree: activation.governanceTree, derivedActivationCommit: activation.derivedActivationCommit }, lane + " terminal activation binding", failures);
  failures.push(...terminalCompletionReviewBindingFailures(receipt.reviewBindings, {
    targetCommit: proofBinding?.terminalTargetCommit,
    targetTree: proofBinding?.terminalTargetTree,
  }).map((failure) => lane + " " + failure));
  validateHashEnvelope(receipt, "selfHash", lane + " terminal completion", failures);
  receipt.derivedCompletionCommit = findIntroducingCommit(repoRoot, COMPLETION_PATHS[lane], failures);
  return receipt;
}
export function verifyPhase1TerminalCorrectionAuthorizations({
  repoRoot = ROOT,
  goalRoot = DEFAULT_GOAL_ROOT,
  registry,
  mode = "lifecycle",
  evaluationTime = Date.now(),
  verifyRepositoryState = true,
  verifySecurity = true,
  verifyRepin = true,
  proofRoot = resolve(goalRoot, "proof"),
  expectedOwnerDirectionSha = TERMINAL_OWNER_DIRECTION_SHA256,
  expectedActivationAllowlistSha = TERMINAL_ACTIVATION_ALLOWLIST_SHA256,
  expectedExecutionBranch = TERMINAL_EXECUTION_BRANCH,
} = {}) {
  repoRoot = realpathSync(repoRoot);
  goalRoot = realpathSync(goalRoot);
  const failures = [];
  failures.push(...terminalTrustedExecutableFailures());
  const expectations = { expectedOwnerDirectionSha, expectedActivationAllowlistSha, expectedExecutionBranch };
  if (!["record", "activation", "lifecycle", "completion"].includes(mode)) failures.push("unsupported terminal correction verification mode " + mode);
  const source = registry ?? readJson(resolve(repoRoot, SCOPED_REGISTRY_PATH), "scoped authorization registry", failures);
  const program = validateProgram(repoRoot, goalRoot, source, failures, expectations);
  const children = {
    T03: validateChild(repoRoot, goalRoot, source, program, "T03", failures, expectations),
    T04: validateChild(repoRoot, goalRoot, source, program, "T04", failures, expectations),
  };
  if (children.T03 && children.T04) {
    if (children.T03.allowedCorrectionPaths.some((path) => children.T04.allowedCorrectionPaths.includes(path))) failures.push("terminal sibling implementation paths overlap");
    exact(children.T03.governanceWriteScope, children.T04.governanceWriteScope, "terminal shared governance scope", failures);
  }
  if (verifySecurity) validateSecurity(repoRoot, program, children, failures);
  if (verifyRepin) validateRepin(repoRoot, program, children, failures);
  if (verifyRepositoryState) {
    exact(git(repoRoot, ["symbolic-ref", "--short", "HEAD"], "terminal branch", failures), expectedExecutionBranch, "terminal live execution branch external anchor", failures);
  }
  const activationPresence = Object.values(ACTIVATION_PATHS).map((path) => existsSync(resolve(repoRoot, path)));
  const completionPresence = Object.values(COMPLETION_PATHS).map((path) => existsSync(resolve(repoRoot, path)));
  if (activationPresence.some(Boolean) && !activationPresence.every(Boolean)) failures.push("terminal activation pair incomplete");
  if (completionPresence.some(Boolean) && !completionPresence.every(Boolean)) failures.push("terminal completion pair incomplete");
  if (completionPresence.some(Boolean) && !activationPresence.every(Boolean)) failures.push("terminal completion requires activation pair");
  const attemptArtifactNames = existsSync(proofRoot) ? readdirSync(proofRoot).filter((name) => /^phase1-terminal-correction-(?:t0[34]-attempt-|anchor-|proof-registry)/.test(name)) : [];
  if (!activationPresence.every(Boolean)) {
    if (attemptArtifactNames.length) failures.push("terminal attempt proof exists before activation");
    if (mode === "activation" || mode === "completion") failures.push("terminal activation receipts missing");
    if (mode === "record" && (activationPresence.some(Boolean) || completionPresence.some(Boolean))) failures.push("record verification requires terminal lifecycle receipts absent");
    if (evaluationTime >= Date.parse(program?.expiresAt ?? "")) failures.push("terminal authorization expired");
    return { failures, state: failures.length ? "INVALID" : "PRE_ACTIVATION", authorizationHashes: [program?.authorizationHash?.digest, children.T03?.authorizationHash?.digest, children.T04?.authorizationHash?.digest] };
  }
  if (!verifyRepositoryState) failures.push("terminal active or consumed state requires repository-state verification");
  const activations = {
    T03: validateActivation(repoRoot, "T03", children.T03, program, failures),
    T04: validateActivation(repoRoot, "T04", children.T04, program, failures),
  };
  if (activations.T03 && activations.T04) {
    exact([activations.T03.governanceCommit, activations.T03.governanceTree, activations.T03.derivedActivationCommit, activations.T03.derivedActivationTree], [activations.T04.governanceCommit, activations.T04.governanceTree, activations.T04.derivedActivationCommit, activations.T04.derivedActivationTree], "terminal paired activation", failures);
    const parent = validateCommitOnlyPaths(repoRoot, activations.T03.derivedActivationCommit, Object.values(ACTIVATION_PATHS), "terminal activation commit", failures);
    exact(parent, activations.T03.governanceCommit, "terminal activation direct parent", failures);
    exact(git(repoRoot, ["rev-parse", activations.T03.governanceCommit + "^{tree}"], "terminal governance tree", failures), activations.T03.governanceTree, "terminal governance tree binding", failures);
  }
  const proof = terminalProofRegistryBinding({
    repoRoot,
    proofRoot,
    requireCompletion: completionPresence.every(Boolean),
    activationCommit: activations.T03?.derivedActivationCommit,
    activationTree: activations.T03?.derivedActivationTree,
    expiresAt: program?.expiresAt,
    programAuthorizationHash: program?.authorizationHash?.digest,
    childAuthorizationHashes: {
      T03: children.T03?.authorizationHash?.digest,
      T04: children.T04?.authorizationHash?.digest,
    },
  });
  failures.push(...proof.failures);
  if (!completionPresence.every(Boolean)) {
    if (mode === "completion") failures.push("terminal completion receipts missing");
    return { failures, state: failures.length ? "INVALID" : "ACTIVE", authorizationHashes: [program?.authorizationHash?.digest, children.T03?.authorizationHash?.digest, children.T04?.authorizationHash?.digest], proofBinding: proof.binding };
  }
  const completions = {
    T03: validateCompletion(repoRoot, "T03", children.T03, program, activations.T03, proof.binding, failures),
    T04: validateCompletion(repoRoot, "T04", children.T04, program, activations.T04, proof.binding, failures),
  };
  if (completions.T03 && completions.T04) {
    exact(completions.T03.proofBinding, completions.T04.proofBinding, "terminal paired completion proof", failures);
    exact(completions.T03.reviewBindings, completions.T04.reviewBindings, "terminal paired completion reviews", failures);
    exact(completions.T03.derivedCompletionCommit, completions.T04.derivedCompletionCommit, "terminal paired completion commit", failures);
    const parent = validateCommitOnlyPaths(repoRoot, completions.T03.derivedCompletionCommit, Object.values(COMPLETION_PATHS), "terminal completion commit", failures);
    exact(parent, proof.binding?.terminalTargetCommit, "terminal completion direct target parent", failures);
    exact(git(repoRoot, ["rev-parse", parent + "^{tree}"], "terminal completion target tree", failures), proof.binding?.terminalTargetTree, "terminal completion target tree", failures);
  }
  return { failures, state: failures.length ? "INVALID" : "CONSUMED", authorizationHashes: [program?.authorizationHash?.digest, children.T03?.authorizationHash?.digest, children.T04?.authorizationHash?.digest], proofBinding: proof.binding };
}
export function terminalForbiddenEffectFindings(source) {
  const findings = new Set();
  const sourceFile = ts.createSourceFile("terminal-effect-scan.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sourceFile.parseDiagnostics.length) findings.add("invalid-syntax");

  const networkNames = new Set(["fetch", "XMLHttpRequest", "WebSocket", "EventSource"]);
  const browserNames = new Set(["localStorage", "indexedDB", "document", "window"]);
  const filesystemNames = new Set(["readFile", "writeFile", "appendFile", "createReadStream", "createWriteStream", "openSync", "spawn", "exec", "fork"]);
  const filesystemModules = new Set(["fs", "fs/promises", "child_process", "module"]);
  const networkModules = new Set(["http", "https", "net", "tls", "dgram"]);
  const networkPackages = new Set(["axios", "got", "ky", "node-fetch", "socket.io-client", "superagent", "undici", "ws"]);
  const providerPackages = new Set(["@anthropic-ai/sdk", "@google/generative-ai", "ai", "openai", "openrouter"]);
  const allowedRuntimeModules = new Set(["./canonical", "./contracts", "./interrupts", "./reasonCodes", "node:util/types"]);
  const dynamicCodeNames = new Set(["eval", "Function", "AsyncFunction", "GeneratorFunction", "AsyncGeneratorFunction"]);

  const isFunctionScope = (node) => ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node);
  const isBlockScope = (node) => ts.isSourceFile(node)
    || ts.isBlock(node)
    || ts.isModuleBlock(node)
    || ts.isCaseBlock(node)
    || ts.isCatchClause(node)
    || ts.isForStatement(node)
    || ts.isForInStatement(node)
    || ts.isForOfStatement(node)
    || isFunctionScope(node);
  const nearestScope = (node, blockScoped) => {
    let current = node.parent;
    while (current && !(blockScoped ? isBlockScope(current) : ts.isSourceFile(current) || isFunctionScope(current))) current = current.parent;
    return current ?? sourceFile;
  };
  const bindings = [];
  const addBindingName = (name, scope) => {
    if (ts.isIdentifier(name)) {
      const existing = bindings.find((binding) => binding.name === name.text && binding.scope === scope);
      if (existing) return existing;
      const binding = { name: name.text, scope, capabilities: new Set() };
      bindings.push(binding);
      return binding;
    }
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const element of name.elements) if (ts.isBindingElement(element)) addBindingName(element.name, scope);
    }
    return null;
  };
  const collectLocalBindings = (node) => {
    if (ts.isVariableDeclaration(node)) {
      const declarationList = node.parent;
      const blockScoped = ts.isVariableDeclarationList(declarationList) && (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0;
      addBindingName(node.name, nearestScope(node, blockScoped));
    } else if (ts.isParameter(node)) addBindingName(node.name, nearestScope(node, false));
    else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) addBindingName(node.name, node.parent);
    else if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name) addBindingName(node.name, node);
    else if (ts.isImportClause(node) && node.name) addBindingName(node.name, sourceFile);
    else if (ts.isNamespaceImport(node) || ts.isImportSpecifier(node)) addBindingName(node.name, sourceFile);
    else if (ts.isCatchClause(node) && node.variableDeclaration) addBindingName(node.variableDeclaration.name, node);
    ts.forEachChild(node, collectLocalBindings);
  };
  collectLocalBindings(sourceFile);
  const resolveBinding = (node) => {
    if (!ts.isIdentifier(node)) return null;
    return bindings
      .filter((binding) => binding.name === node.text && node.pos >= binding.scope.pos && node.end <= binding.scope.end)
      .sort((left, right) => (left.scope.end - left.scope.pos) - (right.scope.end - right.scope.pos))[0] ?? null;
  };
  const unwrap = (node) => {
    let current = node;
    while (current && (ts.isParenthesizedExpression(current)
      || ts.isAsExpression(current)
      || ts.isTypeAssertionExpression(current)
      || ts.isNonNullExpression(current)
      || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(current))
      || (ts.isPartiallyEmittedExpression && ts.isPartiallyEmittedExpression(current)))) current = current.expression;
    return current;
  };
  const staticText = (node) => {
    const value = unwrap(node);
    return value && (ts.isStringLiteralLike(value) || ts.isNoSubstitutionTemplateLiteral(value)) ? value.text : null;
  };
  const memberName = (node) => {
    const value = unwrap(node);
    if (value && ts.isPropertyAccessExpression(value)) return value.name.text;
    if (value && ts.isElementAccessExpression(value) && value.argumentExpression) return staticText(value.argumentExpression);
    return null;
  };
  const moduleFindingForText = (value) => {
    if (typeof value !== "string") return "filesystem-or-shell";
    const normalized = value.startsWith("node:") ? value.slice(5) : value;
    if (filesystemModules.has(normalized)) return "filesystem-or-shell";
    if (networkModules.has(normalized) || networkPackages.has(value)) return "network-call";
    if (providerPackages.has(value)) return "provider-or-model";
    if (allowedRuntimeModules.has(value)) return null;
    return "forbidden-runtime-import";
  };
  const addModuleFinding = (specifier, { indirect = false } = {}) => {
    const value = specifier ? staticText(specifier) : null;
    if (indirect || value === null) findings.add("filesystem-or-shell");
    else {
      const finding = moduleFindingForText(value);
      if (finding) findings.add(finding);
    }
  };
  const runtimeImport = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause) return true;
      if (node.importClause.isTypeOnly) return false;
      if (node.importClause.name || !node.importClause.namedBindings || ts.isNamespaceImport(node.importClause.namedBindings)) return true;
      return node.importClause.namedBindings.elements.some((element) => !element.isTypeOnly);
    }
    if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly) return false;
      if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return true;
      return node.exportClause.elements.some((element) => !element.isTypeOnly);
    }
    return true;
  };
  const derivedMemberCapabilities = (base, name) => {
    const result = new Set([...base].filter((capability) => ["network", "browser", "environment", "filesystem", "provider", "dynamic", "require"].includes(capability)));
    if (base.has("global") || base.has("window")) {
      if (name === "process") result.add("process");
      if (name === "module") result.add("module");
      if (name === "require") result.add("require");
      if (name === "Reflect") result.add("reflect");
      if (name === "globalThis") result.add("global");
      if (name === "window") { result.add("global"); result.add("window"); result.add("browser"); }
      if (networkNames.has(name)) result.add("network");
      if (browserNames.has(name)) result.add("browser");
      if (dynamicCodeNames.has(name)) result.add("dynamic");
    }
    if (base.has("process")) {
      if (name === "env" || name === null) result.add("environment");
      if (name === "getBuiltinModule" || name === null) result.add("require");
    }
    if (base.has("module") && (name === "require" || name === "createRequire" || name === null)) result.add("require");
    return result;
  };
  const intrinsicCapabilities = (name) => {
    const result = new Set();
    if (name === "globalThis") result.add("global");
    if (name === "window") { result.add("global"); result.add("window"); result.add("browser"); }
    if (name === "process") result.add("process");
    if (name === "module") result.add("module");
    if (name === "require" || name === "createRequire") result.add("require");
    if (name === "Reflect") result.add("reflect");
    if (networkNames.has(name)) result.add("network");
    if (browserNames.has(name)) result.add("browser");
    if (filesystemNames.has(name)) result.add("filesystem");
    if (dynamicCodeNames.has(name)) result.add("dynamic");
    if (/^(?:anthropic|openai|openrouter|provider|modelCall)$/i.test(name)) result.add("provider");
    return result;
  };
  const expressionCapabilities = (input) => {
    const node = unwrap(input);
    if (!node) return new Set();
    if (ts.isIdentifier(node)) return resolveBinding(node)?.capabilities ?? intrinsicCapabilities(node.text);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      return derivedMemberCapabilities(expressionCapabilities(node.expression), memberName(node));
    }
    if (ts.isCallExpression(node)) {
      const called = unwrap(node.expression);
      if (called && (ts.isPropertyAccessExpression(called) || ts.isElementAccessExpression(called))) {
        const base = expressionCapabilities(called.expression);
        if (base.has("reflect") && memberName(called) === "get") {
          return derivedMemberCapabilities(expressionCapabilities(node.arguments[0]), node.arguments[1] ? staticText(node.arguments[1]) : null);
        }
      }
      const callee = expressionCapabilities(node.expression);
      if (callee.has("require")) {
        const value = node.arguments[0] ? staticText(node.arguments[0]) : null;
        const finding = value === null ? "filesystem-or-shell" : moduleFindingForText(value);
        if (finding === "filesystem-or-shell") return new Set(["filesystem"]);
        if (finding === "network-call") return new Set(["network"]);
        if (finding === "provider-or-model") return new Set(["provider"]);
      }
      return callee;
    }
    return new Set();
  };
  const propagation = [];
  const bindingPropertyName = (element) => {
    const property = element.propertyName ?? element.name;
    if (ts.isIdentifier(property)) return property.text;
    return staticText(property);
  };
  const collectPropagation = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) propagation.push({ binding: resolveBinding(node.name), expression: node.initializer, property: undefined });
      else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          propagation.push({ binding: resolveBinding(element.name), expression: node.initializer, property: bindingPropertyName(element) });
        }
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
      propagation.push({ binding: resolveBinding(node.left), expression: node.right, property: undefined });
    }
    ts.forEachChild(node, collectPropagation);
  };
  collectPropagation(sourceFile);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of propagation) {
      if (!entry.binding) continue;
      const sourceCapabilities = expressionCapabilities(entry.expression);
      const capabilities = entry.property === undefined ? sourceCapabilities : derivedMemberCapabilities(sourceCapabilities, entry.property);
      for (const capability of capabilities) if (!entry.binding.capabilities.has(capability)) {
        entry.binding.capabilities.add(capability);
        changed = true;
      }
    }
  }
  const addCapabilityFindings = (capabilities) => {
    if (capabilities.has("network")) findings.add("network-call");
    if (capabilities.has("browser")) findings.add("browser-or-ui");
    if (capabilities.has("environment")) findings.add("environment-access");
    if (capabilities.has("filesystem") || capabilities.has("require")) findings.add("filesystem-or-shell");
    if (capabilities.has("dynamic")) findings.add("dynamic-code");
    if (capabilities.has("provider")) findings.add("provider-or-model");
  };
  const isDeclarationName = (node) => {
    const parent = node.parent;
    return ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent)
      || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent) || ts.isClassExpression(parent)
      || ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isImportSpecifier(parent)
      || ts.isBindingElement(parent)) && parent.name === node)
      || (ts.isCatchClause(parent) && parent.variableDeclaration?.name === node);
  };
  const isPropertyName = (node) => {
    const parent = node.parent;
    return (ts.isPropertyAccessExpression(parent) && parent.name === node)
      || ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node && !ts.isShorthandPropertyAssignment(parent));
  };

  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && runtimeImport(node)) {
      addModuleFinding(node.moduleSpecifier);
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) {
      addModuleFinding(node.moduleReference.expression);
    }
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
      for (const element of node.name.elements) {
        if (!ts.isBindingElement(element)) continue;
        const name = bindingPropertyName(element);
        addCapabilityFindings(derivedMemberCapabilities(expressionCapabilities(node.initializer), name));
      }
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = node.arguments[0];
        addModuleFinding(specifier, { indirect: !specifier || staticText(specifier) === null });
      } else if (expressionCapabilities(node.expression).has("require")) {
        const specifier = node.arguments[0];
        addModuleFinding(specifier, { indirect: !specifier || staticText(specifier) === null });
      }
      addCapabilityFindings(expressionCapabilities(node));
    }
    if (ts.isNewExpression(node)) addCapabilityFindings(expressionCapabilities(node.expression));
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      addCapabilityFindings(expressionCapabilities(node));
    }
    if (ts.isIdentifier(node) && !isDeclarationName(node) && !isPropertyName(node)) {
      addCapabilityFindings(expressionCapabilities(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...findings];
}
function runForbiddenEffectsOnly() {
  const laneIndex = process.argv.indexOf("--lane");
  const lane = laneIndex >= 0 ? process.argv[laneIndex + 1] : null;
  if (!LANE_PATHS[lane]) { console.error("FAIL invalid --lane"); process.exitCode = 1; return; }
  const sourcePaths = LANE_PATHS[lane].filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"));
  const findings = sourcePaths.flatMap((path) => terminalForbiddenEffectFindings(readFileSync(resolve(ROOT, path), "utf8")).map((finding) => ({ path, finding })));
  if (findings.length) { console.error(JSON.stringify(findings, null, 2)); process.exitCode = 1; }
  else console.log("PASS no forbidden runtime effects in exact " + lane + " implementation sources");
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--forbidden-effects-only")) runForbiddenEffectsOnly();
  else {
    const mode = process.argv.includes("--record-only") ? "record" : process.argv.includes("--activation-only") ? "activation" : process.argv.includes("--completion-only") ? "completion" : "lifecycle";
    const result = verifyPhase1TerminalCorrectionAuthorizations({ mode, verifyRepositoryState: mode !== "record" });
    if (result.failures.length) { result.failures.forEach((failure) => console.error("FAIL " + failure)); process.exitCode = 1; }
    else {
      console.log("PASS Phase1 terminal correction state: " + result.state);
      console.log("PASS authorization hashes: " + result.authorizationHashes.join(","));
      if (result.proofBinding) console.log("PASS proof registry SHA-256: " + result.proofBinding.sha256);
    }
  }
}
